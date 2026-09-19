import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants';
import { scanSession } from '@/lib/scan-session';
import { matchSession } from '@/lib/visual-match/session';
import { matchProductFromPhoto } from '@/lib/visual-match/client';
import { fileUriToDataUri } from '@/lib/visual-match/base64';

type Phase = 'working' | 'error';

/**
 * Searching step: converts the captured photo to a data URI and runs the
 * visual-match pipeline (embed → similarity → product IDs → live products).
 * On success, hands the outcome to the result screen via the session store.
 */
export default function FindProductSearchingScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('working');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  const runMatch = useCallback(async () => {
    const shot = scanSession.getShot();

    if (!shot) {
      setPhase('error');
      setErrorMessage('No captured photo found. Start the scan again.');
      return;
    }

    try {
      const dataUri = await fileUriToDataUri(shot.uri, 'image/jpeg');
      const result = await matchProductFromPhoto(dataUri);

      if (!result.ok) {
        setPhase('error');
        setErrorMessage(result.error);
        return;
      }

      matchSession.setResult(result.data, shot);
      scanSession.clearShot();
      router.replace('/find-product/result');
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Matching failed.');
    }
  }, [router]);

  // Run exactly once (React StrictMode/dev remounts double-run effects).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runMatch();
  }, [runMatch]);

  const handleCancel = useCallback(() => {
    scanSession.clearShot();
    router.dismissTo('/(tabs)');
  }, [router]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {phase === 'working' ? (
          <View style={styles.center}>
            <Loading text="Matching your photo against the catalog…" />
            <ThemedText type="caption" themeColor="textTertiary" style={styles.subtext}>
              Embedding the image · searching by visual similarity
            </ThemedText>
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
    gap: Spacing.three,
    padding: Spacing.four,
  },
  subtext: {
    textAlign: 'center',
  },
  errorPanel: {
    alignSelf: 'stretch',
  },
});
