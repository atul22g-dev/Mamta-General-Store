import { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { scanSession } from '@/lib/scan-session';
import { submitForMatching } from '@/lib/visual-match/service';

type SubmitState = 'idle' | 'submitting' | 'error';

/**
 * Preview step: review the single captured photo, then either retake or
 * hand it to the visual-match service. AI matching is not implemented —
 * the service reports `not-configured` and we show an honest state while
 * still exercising the full flow seam.
 */
export default function FindProductPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();

  const shot = scanSession.getShot();
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleUsePhoto = useCallback(async () => {
    if (!shot || submitState === 'submitting') return;

    setSubmitState('submitting');
    setSubmitError(null);

    const result = await submitForMatching({
      imageUri: shot.uri,
      capturedAt: shot.capturedAt,
    });

    if (!result.ok) {
      setSubmitState('error');
      setSubmitError(result.error);
      return;
    }

    if (result.data.status === 'not-configured') {
      // Honest state: the matcher isn't connected. Keep the photo so the
      // user can go back; explain instead of faking a result.
      setSubmitState('error');
      setSubmitError(
        'Visual matching is not connected yet. Your photo is ready — this step will search the catalog automatically once the AI layer is enabled.',
      );
      return;
    }

    // Real matcher wired: carry the request id to the searching step.
    router.push('/find-product/searching');
  }, [shot, submitState, router]);

  const handleRetake = useCallback(() => {
    scanSession.clearShot();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/find-product/camera');
    }
  }, [router]);

  if (!shot) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.centerState}>
            <EmptyState
              title="No photo yet"
              description="Take a product photo first — the preview appears here."
              icon={<Icon name="camera" size={26} color={theme.accent} />}
              action={
                <Button title="Open camera" onPress={() => router.replace('/find-product/camera')} />
              }
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.topBar}>
          <IconButton
            icon={<Icon name="close" size={20} color={theme.text} />}
            onPress={() => router.back()}
            accessibilityLabel="Discard and go back"
            variant="ghost"
          />
          <ThemedText type="h3">Preview</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.photoWrap, Shadows.md]}>
            <Image source={{ uri: shot.uri }} style={styles.photo} />
          </Animated.View>

          <View style={styles.metaRow}>
            <Icon name="checkmark-circle" size={16} color={theme.success} />
            <ThemedText type="caption" themeColor="textSecondary">
              Photo captured{shot.capturedAt ? ` · ${new Date(shot.capturedAt).toLocaleTimeString()}` : ''}
            </ThemedText>
          </View>

          {submitState === 'error' && submitError && (
            <ErrorState
              title="Can’t start matching yet"
              description={submitError}
              style={styles.errorPanel}
            />
          )}

          <View style={styles.actions}>
            <Button
              title={submitState === 'submitting' ? 'Submitting…' : 'Use Photo'}
              onPress={() => void handleUsePhoto()}
              disabled={submitState === 'submitting'}
              block
              size="lg"
              icon={<Icon name="arrow-forward" size={18} color={theme.white} />}
            />
            <Button
              title="Retake"
              onPress={handleRetake}
              variant="secondary"
              block
              size="lg"
              disabled={submitState === 'submitting'}
              icon={<Icon name="camera" size={18} color={theme.text} />}
            />
          </View>

          <ThemedText type="caption" themeColor="textTertiary" style={styles.footnote}>
            One photo is matched against the store catalog when you continue.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 0,
  },
  flex: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  photoWrap: {
    alignItems: 'center',
  },
  photo: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 3 / 4,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  errorPanel: {
    alignSelf: 'stretch',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  footnote: {
    textAlign: 'center',
  },
});
