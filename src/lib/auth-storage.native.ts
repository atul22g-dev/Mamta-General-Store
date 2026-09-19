/**
 * Native (iOS/Android) auth session storage.
 *
 * The `.native.ts` extension is resolved by Metro for native platforms and
 * EXCLUDED from web builds by the resolver itself — so the browser bundle
 * never sees expo-sqlite (or its wasm/worker stack) at all.
 *
 * The polyfill installs a localStorage implementation backed by SQLite.
 * Side-effect import runs before this module's exports are used, so the
 * global is guaranteed to exist once `resolveAuthStorage()` is called.
 */
import 'expo-sqlite/localStorage/install';

/** Minimal async-safe storage surface supabase-js needs. */
type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function resolveAuthStorage(): AuthStorage {
  return globalThis.localStorage as AuthStorage;
}
