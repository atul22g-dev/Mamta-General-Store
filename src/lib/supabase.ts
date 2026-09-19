import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { Database } from '@/types/database';

import { resolveAuthStorage } from './auth-storage';

/**
 * The single Supabase client for the app.
 *
 * - Credentials come from EXPO_PUBLIC_* env vars — never hard-coded, never
 *   a service-role key (that key must only ever live server-side).
 * - Sessions persist via the platform-split auth storage (`./auth-storage`):
 *   SQLite-backed on native, localStorage in the browser, no-op in Node
 *   static rendering. The web bundle never includes expo-sqlite because
 *   Metro resolves the platform extensions at the graph level.
 * - `detectSessionInUrl: false` because there is no browser URL to parse
 *   on native. Web deep-link OAuth flows pass the code explicitly.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  // Fail fast and loud — a missing key should never surface as a runtime
  // 401 deep inside a screen.
  throw new Error(
    'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your .env file (see .env.example).',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: resolveAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
