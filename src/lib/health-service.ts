/**
 * Database health check — a minimal liveness probe against Supabase.
 *
 * Uses a HEAD-style count on `products` (1 network round trip, no payload):
 * the customer Products tab already reads this table unauthenticated, so the
 * query's RLS policy proves the whole path (gateway → PostgREST → Postgres)
 * is serving — the exact path every real feature depends on.
 */
import { supabase } from '@/lib/supabase';

export type HealthCheckResult = {
  online: boolean;
  /** Milliseconds the probe took (only meaningful when online). */
  latencyMs: number | null;
  /**
   * Machine-readable failure code: the PostgREST error code when the API
   * answered with an error (e.g. PGRST002), or a probe-level tag
   * (PROBE_TIMEOUT / NETWORK_ERROR) when it didn't answer at all.
   * Null when online.
   */
  code: string | null;
  /** Raw error message from the API, when it produced one. */
  message: string | null;
};

/** How long to wait before declaring the database unreachable. */
const PROBE_TIMEOUT_MS = 8_000;

/**
 * Probe the database. Never throws — failures (timeout, network, REST down)
 * are reported as `online: false` with a reason, matching how the app
 * surfaces data errors.
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const startedAt = Date.now();

  // Manual AbortController: Hermes lacks AbortSignal.timeout on older runtimes.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    // A 1-row GET (not `head: true`): HEAD responses carry no body, so
    // PostgREST's JSON error (e.g. {"code":"PGRST002",...}) would never
    // reach supabase-js's parser and we'd lose the WHY. One small row is
    // a negligible cost for a 30-second health poll.
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);

    if (error) {
      // The API layer answered — with an error. Its code/message name the
      // actual problem (e.g. PGRST002 = PostgREST can't reach Postgres).
      // Some supabase-js failure shapes carry neither field, so fall back to
      // a compact serialization — the dialog should always have evidence.
      const code = typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;
      const message = typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : null;
      const serialized = (() => {
        try {
          return JSON.stringify(error);
        } catch {
          return String(error);
        }
      })();
      return {
        online: false,
        latencyMs: null,
        code: code ?? 'API_ERROR',
        message: message ?? serialized.slice(0, 200),
      };
    }
    return { online: true, latencyMs: Date.now() - startedAt, code: null, message: null };
  } catch (thrown) {
    // No HTTP answer at all: distinguish timeout (aborted) from network loss.
    const aborted = thrown instanceof Error && thrown.name === 'AbortError';
    return {
      online: false,
      latencyMs: null,
      code: aborted ? 'PROBE_TIMEOUT' : 'NETWORK_ERROR',
      message: thrown instanceof Error ? thrown.message : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
