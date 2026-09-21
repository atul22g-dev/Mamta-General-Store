import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { scanSession } from '@/lib/scan-session';
import { matchSession } from '@/lib/visual-match/session';
import { matchProductFromPhoto } from '@/lib/visual-match/client';
import { fileUriToDataUri } from '@/lib/visual-match/base64';

/** The visible stages of a match run, in order. */
const STAGES = [
  { key: 'prepare', label: 'Reading your photo' },
  { key: 'search', label: 'Searching the catalog' },
  { key: 'price', label: 'Fetching the live price' },
] as const;

/**
 * Stage tracker shown while matching runs. The first stage highlights
 * immediately, then each next one lights up on a fixed cadence so the
 * wait communicates progress instead of a silent spinner.
 */
function StageList() {
  const theme = useTheme();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.stageList}>
      {STAGES.map((stage, index) => {
        const done = index < stageIndex;
        const active = index === stageIndex;
        const color = done ? theme.success : active ? theme.accent : theme.textTertiary;
        return (
          <View key={stage.key} style={styles.stageRow}>
            <View
              style={[
                styles.stageDot,
                { backgroundColor: done || active ? color : theme.surfaceSecondary },
              ]}>
              <Icon
                name={done ? 'checkmark' : active ? 'ellipse' : 'ellipse-outline'}
                size={done ? 14 : 10}
                color={done || active ? '#FFFFFF' : theme.textTertiary}
              />
            </View>
            <ThemedText
              type="bodySmall"
              themeColor={done || active ? 'text' : 'textTertiary'}
              style={styles.stageLabel}>
              {stage.label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

type Phase = 'working' | 'error';

/**
 * Searching step: converts the captured photo to a data URI and runs the
 * visual-match pipeline (embed → similarity → product IDs → live products
 * with the DB price). Concurrency contract: at most ONE match runs for a
 * mounted screen — the in-flight guard blocks double invocation from
 * StrictMode remounts and retry taps, the AbortController cancels the
 * network work on unmount/cancel, and a runId makes late resolutions of
 * any superseded run harmless (stale results can never reach the result
 * screen). On success, hands the outcome to the result screen via the
 * session store.
 */
export default function FindProductSearchingScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('working');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => {
      // Unmount (or StrictMode remount) cancels the network work; the
      // runId bump ensures a late resolution still cannot navigate.
      abortRef.current?.abort();
      runIdRef.current += 1;
    };
  }, []);

  const runMatch = useCallback(async () => {
    // Duplicate-request guard: a match is already running on this screen.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const shot = scanSession.getShot();

    if (!shot) {
      if (runId === runIdRef.current) {
        setPhase('error');
        setErrorMessage('No captured photo found. Start the scan again.');
      }
      inFlightRef.current = false;
      return;
    }

    const isStale = () => runId !== runIdRef.current;

    // Data-URI conversion (HIGH-03 partial fix: MIME from the file, not a
    // hardcoded image/jpeg — web picks may be PNG; see audit).
    let dataUri: string;
    try {
      dataUri = await fileUriToDataUri(shot.uri);
    } catch {
      if (!isStale()) {
        setPhase('error');
        setErrorMessage('Could not read the captured photo. Try again.');
      }
      inFlightRef.current = false;
      return;
    }

    const result = await matchProductFromPhoto(dataUri, controller.signal);

    if (isStale()) return; // superseded/cancelled run — touch nothing
    inFlightRef.current = false;

    if (!result.ok) {
      setPhase('error');
      setErrorMessage(result.error);
      return;
    }

    matchSession.setResult(result.data, shot);
    scanSession.clearShot();
    router.replace('/find-product/result');
  }, [router]);

  // Run exactly once (React StrictMode/dev remounts double-run effects).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runMatch();
  }, [runMatch]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current += 1; // late resolutions of this run are inert
    inFlightRef.current = false;
    scanSession.clearShot();
    router.dismissTo('/(tabs)');
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {phase === 'working' ? (
          <View style={styles.center}>
            <Loading text="Matching your photo against the catalog…" />
            <StageList />
          </View>
        ) : (
          <View style={styles.center}>
            <ErrorState
              title="Couldn’t complete the match"
              description={errorMessage ?? 'Unknown error.'}
              onRetry={() => {
                setPhase('working');
                void runMatch();
              }}
              retryLabel="Try again"
              style={styles.errorPanel}
            />
            <Button
              title="Search Manually"
              onPress={() => {
                scanSession.clearShot();
                router.push('/find-product/search');
              }}
            />
            <Button title="Cancel" variant="secondary" onPress={handleCancel} />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  stageList: {
    gap: Spacing.two,
    alignSelf: 'flex-start',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLabel: {},
  errorPanel: {
    alignSelf: 'stretch',
  },
});
