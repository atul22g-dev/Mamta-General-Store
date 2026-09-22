/**
 * Native (iOS/Android) auth session storage.
 *
 * The `.native.ts` extension is resolved by Metro for native platforms and
 * EXCLUDED from web builds by the resolver itself — so the browser bundle
 * never sees AsyncStorage at all.
 *
 * Uses @react-native-async-storage/async-storage, which ships inside
 * Expo Go — sessions persist in Expo Go AND in dev/production builds.
 * (expo-sqlite's localStorage polyfill is NOT part of Expo Go since the
 * SDK's SQLite removal, and crashed the app at launch with
 * "Something went wrong".)
 *
 * supabase-js supports async storage natively: it awaits getItem/setItem
 * during session restore, so no read-through shim is needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export function resolveAuthStorage() {
  return AsyncStorage;
}
