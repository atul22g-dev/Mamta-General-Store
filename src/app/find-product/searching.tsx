import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { scanSession, matchSession } from '@/lib/scan-session';
import { matchProductFromPhoto } from '@/lib/visual-match/client';
import { validateAndConvert } from '@/lib/image-pipeline';

const STAGES = [
  { key: 'prepare', label: 'Reading your photo' },
  { key: 'embed', label: 'Generating product embedding' },
  { key: 'search', label: 'Searching the catalog' },
] as const;

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
 * One simple job:
 * photo URI → data URI → visual-match service → result screen.
 * The request is cancelled automatically when this screen unmounts.
 */
export default function FindProductSearchingScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('working');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Declared as an Effect Event: runMatch is called ONLY from the effect below
  // (scheduled into a microtask) and must always read the latest state. Effect
  // Events are deliberately not dependencies, so the effect no longer tears
  // down and re-subscribes every time this component re-renders.
  const runMatch = useEffectEvent(
    async (signal: AbortSignal) => {
      const shot = scanSession.getShot();
      if (!shot) {
        if (!signal.aborted) {
          setPhase('error');
          setErrorMessage('No captured photo found. Start the scan again.');
        }
        return;
      }

      const conversion = await validateAndConvert(shot.uri);
      if (!conversion.ok) {
        if (!signal.aborted) {
          setPhase('error');
          setErrorMessage(conversion.errorMessage);
        }
        return;
      }

      const result = await matchProductFromPhoto(conversion.dataUri, signal);
      if (signal.aborted) return;

      if (!result.ok) {
        setPhase('error');
        setErrorMessage(result.error);
        return;
      }

      matchSession.setResult(result.data, shot);
      scanSession.clearShot();
      router.replace('/find-product/result');
    },
  );

  useEffect(() => {
    const controller = new AbortController();
    // Kick the job off in a microtask rather than calling it directly: the
    // no-photo path inside runMatch sets state synchronously, and a
    // synchronous setState in an effect body triggers cascading renders
    // (react-hooks/set-state-in-effect). The work still starts immediately
    // after the current task, and the abort still covers an early unmount.
    queueMicrotask(() => {
      void runMatch(controller.signal);
    });
    return () => controller.abort();
    // `retryKey` is the only input that should restart the match; `runMatch` is
    // an Effect Event and always sees the latest state, so it stays out of the
    // dependency list on purpose.
  }, [retryKey]);

  const retry = useCallback(() => {
    setPhase('working');
    setErrorMessage(null);
    setRetryKey((key) => key + 1);
  }, []);

  const cancel = useCallback(() => {
    scanSession.clearShot();
    router.dismissTo('/(tabs)');
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {phase === 'working' ? (
          <View style={styles.center}>
            <Loading text="Matching your photo against the catalog…" showIcon />
            <StageList />
          </View>
        ) : (
          <View style={styles.center}>
            <ErrorState
              title="Couldn’t complete the match"
              description={errorMessage ?? 'Unknown error.'}
              onRetry={retry}
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
            <Button title="Cancel" variant="secondary" onPress={cancel} />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  stageList: { gap: Spacing.two, alignSelf: 'flex-start' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLabel: { flexShrink: 1 },
  errorPanel: { marginBottom: Spacing.two },
});
