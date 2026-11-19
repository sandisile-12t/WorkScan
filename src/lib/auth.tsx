import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
  verifyBeforeUpdateEmail,
} from '@firebase/auth';
import { doc, runTransaction, serverTimestamp, updateDoc } from '@firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/lib/types';

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
};

type AuthContextValue = {
  user: UserProfile | null;
  firebaseUser: User | null;
  initialising: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  updateName: (fullName: string) => Promise<void>;
  requestEmailChange: (email: string, currentPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPLOYEE_SEQ_DOC = 'config/employeeSeq';
const USERS = 'users';

/**
 * Renders the sequence as an employee number: 1 -> "01", 42 -> "42", 100 -> "100".
 * `padStart(2)` keeps the two-digit look for the first 99 staff and grows naturally
 * past that instead of truncating.
 */
export const formatEmployeeId = (value: number): string => String(value).padStart(2, '0');

export const friendlyAuthError = (error: unknown): Error => {
  const code = (error as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address is not valid.',
    'auth/user-disabled': 'This account has been disabled. Contact your manager.',
    'auth/user-not-found': 'No account found with that email address.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email address.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
    'auth/requires-recent-login': 'Please confirm your current password and try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/operation-not-allowed':
      'Email sign-in is disabled in the Firebase console. Enable it under Authentication > Sign-in method.',
    'auth/configuration-not-found':
      'Firebase Authentication is not set up for this project yet. Open the Firebase console, go to Authentication, click "Get started", then enable the Email/Password provider.',
    'auth/api-key-not-valid':
      'This Firebase API key is not valid. Check the EXPO_PUBLIC_FIREBASE_* values in .env match your project, then restart the dev server.',
    'auth/invalid-api-key':
      'This Firebase API key is not valid. Check the EXPO_PUBLIC_FIREBASE_* values in .env match your project, then restart the dev server.',
    'auth/unauthorized-domain': 'This app domain is not authorised in the Firebase console.',
  };
  return new Error(map[code] ?? ((error as Error)?.message ?? 'Something went wrong. Please try again.'));
};

const asProfile = (uid: string, data: Record<string, unknown>): UserProfile => ({
  uid,
  fullName: typeof data.fullName === 'string' ? data.fullName : '',
  email: typeof data.email === 'string' ? data.email : '',
  employeeId: typeof data.employeeId === 'string' ? data.employeeId : '',
  role: data.role === 'admin' ? 'admin' : 'employee',
  createdAt: (data.createdAt as UserProfile['createdAt']) ?? null,
});

/**
 * Creates a new profile with the role explicitly selected during signup.
 */
const createProfile = async (
  uid: string,
  input: SignUpInput
): Promise<UserProfile> => {
  const userRef = doc(db, USERS, uid);
  const seqRef = doc(db, EMPLOYEE_SEQ_DOC);

  return runTransaction(db, async (tx) => {
    const seqSnap = await tx.get(seqRef);

    // Employee numbers are allocated here rather than typed by the user. The counter
    // lives in this same transaction, so the number and the profile are written
    // together: a failed signup never burns a number, and Firestore's transaction
    // retry stops two simultaneous signups from ever claiming the same one.
    const seqValue = (seqSnap.data()?.value as number | undefined) ?? 0;
    const employeeId = formatEmployeeId(seqValue + 1);

    const profile: UserProfile = {
      uid,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      employeeId,
      role: input.role,
      createdAt: null,
    };

    tx.set(userRef, { ...profile, createdAt: serverTimestamp() });
    tx.set(seqRef, { value: seqValue + 1 });

    return profile;
  });
};

/** Backfills a profile for an account that exists in Auth but not yet in Firestore. */
const backfillProfile = async (uid: string, email: string): Promise<UserProfile> => {
  const userRef = doc(db, USERS, uid);
  const seqRef = doc(db, EMPLOYEE_SEQ_DOC);

  return runTransaction(db, async (tx) => {
    const [existing, seqSnap] = await Promise.all([tx.get(userRef), tx.get(seqRef)]);

    const seqValue = (seqSnap.data()?.value as number | undefined) ?? 0;

    if (existing.exists()) {
      const current = asProfile(uid, existing.data() ?? {});
      const emailFromAuth = email.trim().toLowerCase();
      const nextEmail = emailFromAuth || current.email;
      if (current.employeeId && current.email === nextEmail) return current;

      const employeeId = current.employeeId || formatEmployeeId(seqValue + 1);
      const updates = {
        employeeId,
        ...(current.email !== nextEmail ? { email: nextEmail } : {}),
      };
      tx.set(userRef, updates, { merge: true });
      if (!current.employeeId) tx.set(seqRef, { value: seqValue + 1 });
      return { ...current, ...updates };
    }

    const employeeId = formatEmployeeId(seqValue + 1);

    const profile: UserProfile = {
      uid,
      fullName: email.split('@')[0] ?? 'New user',
      email,
      employeeId,
      role: 'employee',
      createdAt: null,
    };

    tx.set(userRef, { ...profile, createdAt: serverTimestamp() });
    tx.set(seqRef, { value: seqValue + 1 });

    return profile;
  });
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [resolved, setResolved] = useState(false);
  const signUpInProgress = useRef(false);

  // Derived rather than stored: when Firebase is unconfigured there is nothing
  // to wait for, so the app is never "initialising".
  const initialising = isFirebaseConfigured && !resolved;

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      setFirebaseUser(next);
      if (!next) {
        if (!cancelled) {
          setUser(null);
          setResolved(true);
        }
        return;
      }

      if (signUpInProgress.current) return;

      try {
        const profile = await backfillProfile(next.uid, next.email ?? '');
        if (!cancelled) setUser(profile);
      } catch (error) {
        console.warn('[workscan] could not load the profile for this user', error);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setResolved(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (input) => {
    if (!isFirebaseConfigured) {
      throw new Error(
        'Firebase is not configured yet. Copy .env.example to .env, fill in the values from the Firebase console, then restart the dev server.'
      );
    }

    signUpInProgress.current = true;
    try {
      const { user: created } = await createUserWithEmailAndPassword(
        auth,
        input.email.trim().toLowerCase(),
        input.password
      ).catch((error: unknown) => {
        throw friendlyAuthError(error);
      });

      try {
        await updateProfile(created, { displayName: input.fullName.trim() });
        const profile = await createProfile(created.uid, input);
        setFirebaseUser(created);
        setUser(profile);
        setResolved(true);
      } catch (error) {
        // Never leave an Auth account stranded without a profile document.
        await deleteUser(created).catch(() => undefined);
        throw friendlyAuthError(error);
      }
    } finally {
      signUpInProgress.current = false;
    }
  }, []);

  const updateName = useCallback(async (fullName: string) => {
    const currentUser = auth.currentUser;
    const normalizedName = fullName.trim();
    if (!currentUser) throw new Error('You must be signed in to update your profile.');
    if (!normalizedName) throw new Error('Enter your name.');

    await updateDoc(doc(db, USERS, currentUser.uid), { fullName: normalizedName });
    setUser((current) => (current ? { ...current, fullName: normalizedName } : current));
  }, []);

  const requestEmailChange = useCallback(async (email: string, currentPassword: string) => {
    const currentUser = auth.currentUser;
    const normalizedEmail = email.trim().toLowerCase();
    if (!currentUser?.email) throw new Error('You must be signed in to change your email.');
    if (!normalizedEmail.includes('@')) throw new Error('Enter a valid email address.');
    if (normalizedEmail === currentUser.email.toLowerCase()) {
      throw new Error('Enter an email address different from your current one.');
    }

    try {
      await reauthenticateWithCredential(
        currentUser,
        EmailAuthProvider.credential(currentUser.email, currentPassword)
      );
      await verifyBeforeUpdateEmail(currentUser, normalizedEmail);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      firebaseUser,
      initialising,
      configured: isFirebaseConfigured,
      signIn,
      signUp,
      updateName,
      requestEmailChange,
      resetPassword,
      signOut,
    }),
    [user, firebaseUser, initialising, signIn, signUp, updateName, requestEmailChange, resetPassword, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
