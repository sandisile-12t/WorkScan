import type { Persistence, ReactNativeAsyncStorage } from '@firebase/auth';

/**
 * `getReactNativePersistence` is a React Native platform-only export. It is
 * documented as being imported from `firebase/auth`, but Firebase's shared public
 * type surface (`@firebase/auth/dist/auth-public.d.ts`) does not declare it.
 *
 * TypeScript matches the `types` condition before `react-native`, so the RN
 * build's declarations in `dist/rn/index.rn.d.ts` are never seen. This
 * augmentation supplies the real signature so `initializeAuth` can be given
 * AsyncStorage-backed persistence.
 *
 * Runtime resolution is a separate concern and is handled by importing
 * `@firebase/auth` directly rather than the `firebase/auth` umbrella subpath —
 * see the comment in `src/lib/firebase.ts`.
 */
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
