import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from '@firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from '@firebase/auth';
import { getFirestore } from '@firebase/firestore';

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'workscan-3dad8';
const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

export const COMPANY_NAME = process.env.EXPO_PUBLIC_COMPANY_NAME ?? 'WorkScan';
export const DEFAULT_OFFICE_ID = process.env.EXPO_PUBLIC_DEFAULT_OFFICE_ID ?? 'head-office';

export const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

export const isFirebaseConfigured = Boolean(apiKey && appId);

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Auth is initialised explicitly with AsyncStorage persistence so the user stays
 * signed in across cold starts.
 *
 * `initializeAuth` must be tried first: on React Native, `getAuth` creates an
 * in-memory instance when one does not exist yet. During Fast Refresh, reuse the
 * existing instance if Firebase reports that it has already been initialised.
 *
 * Import from `@firebase/*` rather than the `firebase/*` umbrella package on
 * purpose. The umbrella's subpath packages declare only `main`/`browser`/`module`
 * and have no `exports` map, so Metro resolves them through its
 * `['react-native', 'browser', 'main']` order to the **web** build — which does not
 * export `getReactNativePersistence`, and throws "is not a function" at runtime.
 * The scoped packages declare a `react-native` export condition and resolve to the
 * correct React Native build.
 */
export const auth: Auth = (() => {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'auth/already-initialized'
    ) {
      return getAuth(app);
    }

    throw error;
  }
})();

export const db = getFirestore(app);
