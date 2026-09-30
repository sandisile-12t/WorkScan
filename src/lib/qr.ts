/**
 * QR payload helpers.
 *
 * A scannable office code is a single short string so it fits comfortably in a
 * low-error-correction QR code that can be printed at A4 and read from a distance:
 *
 *   WORKSCAN|<officeId>|<token>|<dateKey>|<issuedAtMs>
 *
 * `token` rotates whenever the calendar day changes, and an admin can force a new
 * one at any time (e.g. if the printed code leaks). Expired codes are rejected
 * server-side style: the scanner compares the payload against the live token.
 */
export const QR_PREFIX = 'WORKSCAN';
export const QR_VERSION = 1;

export type OfficeCode = {
  officeId: string;
  token: string;
  date: string;
  issuedAt: number;
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid misreads

/** 12 characters in 4 groups of 3 — easy to read aloud over the phone. */
export const generateToken = (): string => {
  const bytes = new Uint8Array(12);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 3), chars.slice(3, 6), chars.slice(6, 9), chars.slice(9, 12)]
    .map((g) => g.join(''))
    .join('-');
};

export const encodeOfficeCode = (code: OfficeCode): string =>
  [QR_PREFIX, code.officeId, code.token, code.date, String(code.issuedAt)].join('|');

export function decodeOfficeCode(raw: string): OfficeCode | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(`${QR_PREFIX}|`)) return null;

  const parts = trimmed.split('|');
  if (parts.length < 4) return null;

  const [, officeId, token, date, issuedAt] = parts;
  if (!officeId || !token || !date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsed = Number(issuedAt);
  return {
    officeId,
    token,
    date,
    issuedAt: Number.isFinite(parsed) ? parsed : 0,
  };
}
