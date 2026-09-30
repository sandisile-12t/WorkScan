import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from '@firebase/firestore';

import { db, DEFAULT_OFFICE_ID } from '@/lib/firebase';
import { todayKey } from '@/lib/date';
import { decodeOfficeCode, encodeOfficeCode, generateToken, type OfficeCode } from '@/lib/qr';
import type { UserProfile } from '@/lib/types';

export type AttendanceRecord = {
  id: string;
  uid: string;
  employeeId: string;
  fullName: string;
  email: string;
  role: string;
  date: string;
  officeId: string;
  officeName: string;
  checkInISO: string | null;
  checkOutISO: string | null;
};

export type Office = {
  id: string;
  name: string;
  location: string;
};

const ATTENDANCE = 'attendance';
const OFFICES = 'offices';
const TOKENS = 'officeTokens';
const USERS = 'users';
const CONFIG = 'config';

/** Used when no office document exists yet. Kept in sync with `DEFAULT_OFFICE_ID`. */
export const DEFAULT_OFFICE_FALLBACK = DEFAULT_OFFICE_ID;

/* ------------------------------------------------------------------ offices */

export async function listOffices(): Promise<Office[]> {
  const snapshot = await getDocs(query(collection(db, OFFICES), limit(50)));
  return snapshot.docs.map((d) => {
    const data = d.data() as { name?: string; location?: string };
    return { id: d.id, name: data.name ?? d.id, location: data.location ?? '' };
  });
}

export async function ensureOffice(officeId: string): Promise<Office> {
  const ref = doc(db, OFFICES, officeId);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    const data = snapshot.data() as { name?: string; location?: string };
    return { id: ref.id, name: data.name ?? ref.id, location: data.location ?? '' };
  }

  const office: Office =
    officeId === DEFAULT_OFFICE_ID
      ? { id: DEFAULT_OFFICE_ID, name: 'Head Office', location: '' }
      : { id: officeId, name: officeId, location: '' };

  await setDoc(ref, { ...office, createdAt: serverTimestamp() }, { merge: true });
  return office;
}

/* ----------------------------------------------------------- office QR code */

export type OfficeCodeState = OfficeCode & {
  payload: string;
  officeName: string;
};

const readTokenDoc = (officeId: string) => getDoc(doc(db, TOKENS, officeId));

/**
 * Returns today's live code for an office, minting a new token when the stored
 * one belongs to a previous day.
 */
export async function getOfficeCode(officeId: string): Promise<OfficeCodeState> {
  const [office, snapshot] = await Promise.all([ensureOffice(officeId), readTokenDoc(officeId)]);

  const data = snapshot.data() as { token?: string; date?: string; issuedAt?: Timestamp } | undefined;

  if (data?.token && data.date === todayKey()) {
    const code: OfficeCode = {
      officeId,
      token: data.token,
      date: todayKey(),
      issuedAt: data.issuedAt?.toMillis?.() ?? Date.now(),
    };
    return { ...code, payload: encodeOfficeCode(code), officeName: office.name };
  }

  return mintToken(officeId, office.name);
}

/** Forces a brand new token, invalidating any code already printed or shared. */
export async function regenerateOfficeCode(officeId: string): Promise<OfficeCodeState> {
  const office = await ensureOffice(officeId);
  return mintToken(officeId, office.name);
}

async function mintToken(officeId: string, officeName: string): Promise<OfficeCodeState> {
  const code: OfficeCode = {
    officeId,
    token: generateToken(),
    date: todayKey(),
    issuedAt: Date.now(),
  };

  await setDoc(
    doc(db, TOKENS, officeId),
    { officeId, token: code.token, date: code.date, issuedAt: serverTimestamp() },
    { merge: true }
  );

  return { ...code, payload: encodeOfficeCode(code), officeName };
}

/* ------------------------------------------------------------- scan / punch */

export type ScanOutcome =
  | { kind: 'check-in'; record: AttendanceRecord }
  | { kind: 'check-out'; record: AttendanceRecord }
  | { kind: 'already-complete'; record: AttendanceRecord };

export type ScanErrorReason =
  | 'not-a-workscan-code'
  | 'expired'
  | 'unknown-office'
  | 'offline';

export class ScanError extends Error {
  constructor(
    message: string,
    readonly reason: ScanErrorReason
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

/**
 * Validates a scanned QR payload against the live token and records the punch.
 *
 * Scanning the same code twice in a row is deliberate: the first scan of the day
 * signs you in, the second signs you back out. That is what lets a single printed
 * code on the office door work for both directions.
 */
export async function recordScan(user: UserProfile, rawPayload: string): Promise<ScanOutcome> {
  const code = decodeOfficeCode(rawPayload);

  if (!code) {
    throw new ScanError('That QR code is not a WorkScan office code.', 'not-a-workscan-code');
  }

  if (code.date !== todayKey()) {
    throw new ScanError('That QR code has expired. Ask your manager for a fresh code.', 'expired');
  }

  const [tokenSnap, officeSnap] = await Promise.all([
    readTokenDoc(code.officeId),
    getDoc(doc(db, OFFICES, code.officeId)),
  ]);

  if (!tokenSnap.exists() || !officeSnap.exists()) {
    throw new ScanError('This office is not registered yet. Contact your manager.', 'unknown-office');
  }

  const live = tokenSnap.data() as { token?: string };
  if (live.token !== code.token) {
    throw new ScanError('That QR code has been replaced. Scan the new one on the door.', 'expired');
  }

  const officeName = (officeSnap.data() as { name?: string }).name ?? code.officeId;
  const recordId = `${user.uid}_${todayKey()}`;

  try {
    return await runTransaction(db, async (tx) => {
      const recordRef = doc(db, ATTENDANCE, recordId);
      const recordSnap = await tx.get(recordRef);
      const now = new Date().toISOString();

      if (recordSnap.exists()) {
        const current = recordSnap.data() as Record<string, unknown>;
        const base = { ...current, officeId: code.officeId, officeName, lastSeenAt: now };

        if (current.checkInISO && current.checkOutISO) {
          return { kind: 'already-complete', record: toRecord(recordId, base) } as ScanOutcome;
        }

        const updated = { ...base, checkInISO: current.checkInISO ?? now, checkOutISO: now };
        tx.set(recordRef, updated);
        return { kind: 'check-out', record: toRecord(recordId, updated) } as ScanOutcome;
      }

      const created = {
        uid: user.uid,
        employeeId: user.employeeId || user.uid.slice(0, 8).toUpperCase(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        date: todayKey(),
        officeId: code.officeId,
        officeName,
        checkInISO: now,
        checkOutISO: null,
        createdAt: serverTimestamp(),
      };

      tx.set(recordRef, created);
      return { kind: 'check-in', record: toRecord(recordId, created) } as ScanOutcome;
    });
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError(
      'Could not reach the server. Check your internet connection and scan again.',
      'offline'
    );
  }
}

const toRecord = (id: string, data: Record<string, unknown>): AttendanceRecord => ({
  id,
  uid: String(data.uid ?? ''),
  employeeId: String(data.employeeId ?? ''),
  fullName: String(data.fullName ?? ''),
  email: String(data.email ?? ''),
  role: String(data.role ?? 'employee'),
  date: String(data.date ?? ''),
  officeId: String(data.officeId ?? ''),
  officeName: String(data.officeName ?? ''),
  checkInISO: (data.checkInISO as string | null) ?? null,
  checkOutISO: (data.checkOutISO as string | null) ?? null,
});

/* ----------------------------------------------------------------- queries */

/**
 * Reads an employee's own records. Filtered on a single field with no `orderBy`
 * and sorted on the client, so the project needs no composite Firestore index.
 */
export async function listMyAttendance(uid: string, max = 60): Promise<AttendanceRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, ATTENDANCE), where('uid', '==', uid), limit(400))
  );

  return snapshot.docs
    .map((d) => toRecord(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max);
}

/** Every record between two dates, for the admin spreadsheet. Single-field index only. */
export async function listAttendanceInRange(from: string, to: string): Promise<AttendanceRecord[]> {
  const snapshot = await getDocs(
    query(
      collection(db, ATTENDANCE),
      where('date', '>=', from),
      where('date', '<=', to)
    )
  );

  return snapshot.docs
    .map((d) => toRecord(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.date.localeCompare(b.date) || a.fullName.localeCompare(b.fullName));
}

export async function getTodayRecord(uid: string): Promise<AttendanceRecord | null> {
  const snapshot = await getDoc(doc(db, ATTENDANCE, `${uid}_${todayKey()}`));
  return snapshot.exists() ? toRecord(snapshot.id, snapshot.data() as Record<string, unknown>) : null;
}

/* ------------------------------------------------------------------ people */

export async function listStaff(): Promise<UserProfile[]> {
  const snapshot = await getDocs(query(collection(db, USERS), limit(500)));
  return snapshot.docs.map((d) => ({
    uid: d.id,
    fullName: String(d.data().fullName ?? ''),
    email: String(d.data().email ?? ''),
    employeeId: String(d.data().employeeId ?? ''),
    role: d.data().role === 'admin' ? ('admin' as const) : ('employee' as const),
    createdAt: null,
  }));
}

export async function getAdminCode(): Promise<string> {
  const snapshot = await getDoc(doc(db, CONFIG, 'app'));
  return (snapshot.data() as { adminCode?: string } | undefined)?.adminCode ?? '';
}

export async function setAdminCode(code: string): Promise<void> {
  await setDoc(doc(db, CONFIG, 'app'), { adminCode: code.trim().toUpperCase() }, { merge: true });
}
