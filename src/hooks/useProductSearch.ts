import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  runSearchPipeline,
  type SearchStage,
} from '@/services/search-pipeline.service';
import {
  presentFailure,
  userErrorFor,
  type UserError,
} from '@/utils/user-errors';
import { scanSession, matchSession } from '@/utils/scan-session';

/** The searching screen's UI phases. */
export type SearchPhase = 'working' | 'error';

/** What the searching screen renders from. */
export type UseProductSearchState = {
  phase: SearchPhase;
  stage: SearchStage;
  userError: UserError | null;
  /** Restart the pipeline from the validating stage. */
  retry: () => void;
  /** Abandon the scan and return to the consumer tabs. */
  cancel: () => void;
  /** Leave the error state for the manual name-search screen. */
  searchManually: () => void;
};

const INITIAL_STAGE: SearchStage = 'validating';

/**
 * Runs the ONE visual search pipeline for the searching screen:
 * photo (scan session) → validate → optimize → embed → RPC → products.
 *
 * Screen → Hook → Service → Supabase: the screen renders state and calls
 * intent callbacks; all Supabase/edge/RPC knowledge lives below this hook.
 * Owns the abort-on-unmount and retry-restart lifecycle so the screen stays
 * a pure view; the result is handed to the match session and routed.
 */
export function useProductSearch(): UseProductSearchState {
  const router = useRouter();
  const [phase, setPhase] = useState<SearchPhase>('working');
  const [stage, setStage] = useState<SearchStage>(INITIAL_STAGE);
  const [userError, setUserError] = useState<UserError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Effect Event: reads the latest state (and router), never a dependency.
  const runMatch = useEffectEvent(async (signal: AbortSignal) => {
    const shot = scanSession.getShot();
    if (!shot) {
      if (!signal.aborted) {
        setPhase('error');
        setUserError(userErrorFor('no_photo'));
      }
      return;
    }

    const result = await runSearchPipeline(shot.uri, {
      signal,
      onStage: (next) => setStage(next),
    });
    if (signal.aborted) return;

    if (!result.ok) {
      setPhase('error');
      setUserError(presentFailure(result.failure));
      return;
    }

    matchSession.setResult(result.outcome, shot);
    scanSession.clearShot();
    router.replace('/find-product/result');
  });

  useEffect(() => {
    const controller = new AbortController();
    // Microtask kick: the no-photo path sets state synchronously, which the
    // react-hooks/set-state-in-effect rule forbids in the effect body.
    queueMicrotask(() => {
      void runMatch(controller.signal);
    });
    return () => controller.abort();
    // `retryKey` is the only input that should restart the match; `runMatch`
    // is an Effect Event and always sees the latest state.
  }, [retryKey]);

  const retry = useCallback(() => {
    setPhase('working');
    setUserError(null);
    setStage(INITIAL_STAGE);
    setRetryKey((key) => key + 1);
  }, []);

  const cancel = useCallback(() => {
    scanSession.clearShot();
    router.dismissTo('/(tabs)');
  }, [router]);

  const searchManually = useCallback(() => {
    scanSession.clearShot();
    router.push('/find-product/search');
  }, [router]);

  return { phase, stage, userError, retry, cancel, searchManually };
}
