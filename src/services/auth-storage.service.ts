/**
 * Web auth session storage.
 *
 * Used only in browser/web builds (Metro resolves this plain `.ts` file for
 * web and the `.native.ts` sibling for native platforms).
 *
 * - Browser: the real localStorage (sessions survive reloads).
 * - Web static rendering (Node SSR): there is no storage in the render
 *   environment — a no-op adapter keeps client creation alive. There is
 *   simply no persisted session during server rendering, by design.
 */

/** Minimal async-safe storage surface supabase-js needs. */
type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function resolveAuthStorage(): AuthStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}
