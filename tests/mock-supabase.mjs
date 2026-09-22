/**
 * Mock Supabase client for unit tests.
 * Replaces the real @supabase/supabase-js client so tests don't need
 * network access, env vars, or React Native polyfills.
 *
 * Tests control the mock by importing this module and setting
 * mockInvokeResult / mockInvokeError before importing the module under test.
 */

let mockInvokeResult = null;
let mockInvokeError = null;

export function setMockInvokeResult(result) {
  mockInvokeResult = result;
  mockInvokeError = null;
}

export function setMockInvokeError(error) {
  mockInvokeError = error;
  mockInvokeResult = null;
}

export function resetMocks() {
  mockInvokeResult = null;
  mockInvokeError = null;
}

export const supabase = {
  functions: {
    invoke: async (_name, _options) => {
      if (mockInvokeError) return { data: null, error: mockInvokeError };
      return { data: mockInvokeResult, error: null };
    },
  },
  from: () => ({
    insert: () => ({ select: () => ({ single: () => ({ data: { id: 'mock-id' }, error: null }) }) }),
    select: () => ({ order: () => ({ limit: () => ({ data: [], error: null }) }) }),
    eq: () => ({ single: () => ({ data: null, error: null }) }),
    delete: () => ({ eq: () => ({ data: null, error: null }) }),
    update: () => ({ eq: () => ({ data: null, error: null }) }),
    is: () => ({ limit: () => ({ data: [], error: null }) }),
  }),
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      // Echoes the requested path so tests can assert WHICH object a caller
      // resolved to (a fixed URL would hide a wrong-bucket/path bug).
      getPublicUrl: (objectPath) => ({
        data: { publicUrl: `https://mock.storage/product-images/${objectPath}` },
      }),
      remove: async () => ({ error: null }),
    }),
  },
};
