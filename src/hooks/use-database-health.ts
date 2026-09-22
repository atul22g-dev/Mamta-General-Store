import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { checkDatabaseHealth, type HealthCheckResult } from '@/services/health.service';

export type DatabaseHealthStatus = 'checking' | 'online' | 'offline';

/**
 * Polls database connectivity and re-checks when the app returns to the
 * foreground, so the indicator is current when the user actually looks at it.
 *
 * Exposes an imperative `recheck` (used by pull-to-refresh) alongside the
 * polled status. Intervals are cleared deterministically on unmount.
 */
export function useDatabaseHealth(pollIntervalMs = 30_000) {
  const [health, setHealth] = useState<HealthCheckResult>({
    online: false,
    latencyMs: null,
    code: null,
    message: null,
  });
  const [status, setStatus] = useState<DatabaseHealthStatus>('checking');

  // Latest-writer-wins guards against a slow probe from a previous run
  // overwriting a newer result (e.g. after a rapid foreground/recheck).
  const runIdRef = useRef(0);

  const runCheck = useCallback(async () => {
    const runId = ++runIdRef.current;
    const result = await checkDatabaseHealth();
    if (runId !== runIdRef.current) return; // superseded — discard stale result
    setHealth(result);
    setStatus(result.online ? 'online' : 'offline');
  }, []);

  const recheck = useCallback(() => {
    setStatus('checking');
    void runCheck();
  }, [runCheck]);

  useEffect(() => {
    void runCheck();
    const poll = setInterval(() => void runCheck(), pollIntervalMs);

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void runCheck();
    };
    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      clearInterval(poll);
      runIdRef.current += 1; // invalidate any in-flight probe
      subscription.remove();
    };
  }, [runCheck, pollIntervalMs]);

  return { status, health, recheck };
}
