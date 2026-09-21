import { useCallback } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { scanSession } from '@/lib/scan-session';

/**
 * Preview step: review the single captured photo, then either retake or
 * hand it to the matching pipeline. The embed → vector-search → products
 * pipeline is live — the searching step runs it and routes to the result
 * screen; no separate submission round-trip is needed for the one-shot
 * single-photo flow.
 */export default function FindProductPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();

  const shot = scanSession.getShot();

  const handleUsePhoto = useCallback(() => {
    if (!shot) return;

    // The matching pipeline is live: the searching screen runs the real
    // embed → vector-search → products-table flow (with the DB price) and
    // routes to the result screen. The photo stays in scanSession so the
    // searching step can read it; scanning a new product overwrites it.
    router.push('/find-product/searching');
  }, [shot, router]);

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
              Photo ready{shot.capturedAt ? ` · ${new Date(shot.capturedAt).toLocaleTimeString()}` : ''}
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <Button
              title="Use Photo"
              onPress={handleUsePhoto}
              block
              size="lg"
              icon={<Icon name="arrow-forward" size={18} color={theme.white} />}
            />
            <Button
              title="Choose Another Photo"
              onPress={handleRetake}
              variant="secondary"
              block
              size="lg"
              icon={<Icon name="images" size={18} color={theme.text} />}
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
