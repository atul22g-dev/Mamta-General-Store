import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { Icon, type IconName } from '@/components/ui/icon';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const TIPS = [
  { icon: 'sunny', text: 'Use good lighting' },
  { icon: 'scan', text: 'Fill the frame' },
  { icon: 'finger-print', text: 'Hold steady' },
] as const satisfies readonly { icon: IconName; text: string }[];

export default function FindProductScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <ThemedText type="h1" style={styles.title}>
              Find Product
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Identify products and check prices instantly
            </ThemedText>
          </View>

          {/* Camera viewfinder mock */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(80)}
            style={[
              styles.viewfinder,
              {
                borderRadius: Radius.xl,
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}>
            {/* corner brackets */}
            {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
              <View
                key={corner}
                style={[styles.bracket, styles[corner], { borderColor: theme.accent }]}
              />
            ))}
            <View
              style={[styles.scanLine, { backgroundColor: theme.accent + '55' }]}
            />
            <View style={styles.viewfinderCenter}>
              <Icon name="camera" size={40} color={theme.textTertiary} />
              <ThemedText type="caption" themeColor="textTertiary">
                Take a product photo to find it
              </ThemedText>
            </View>
          </Animated.View>

          {/* Shutter button */}
          <View style={styles.shutterRow}>
            <View style={styles.shutterPlaceholder} />
            <Pressable
              onPress={() => router.push('/find-product/camera')}
              accessibilityRole="button"
              accessibilityLabel="Capture product photo"
              style={({ pressed }) => [
                styles.shutter,
                {
                  borderColor: theme.cta,
                  experimental_backgroundImage: `linear-gradient(135deg, ${theme.cta}, ${theme.cta}CC)`,
                  backgroundImage: `linear-gradient(135deg, ${theme.cta}, ${theme.cta}CC)`,
                },
                pressed && styles.shutterPressed,
              ]}>
              <Icon name="camera" size={24} color={theme.white} />
            </Pressable>
            <View
              style={[styles.galleryTile, { backgroundColor: theme.surfaceSecondary }]}>
              <Icon name="images" size={20} color={theme.textSecondary} />
            </View>
          </View>

          {/* Tips */}
          <View style={styles.tips}>
            {TIPS.map((tip) => (
              <ThemedView
                key={tip.text}
                type="surface"
                style={[styles.tipRow, { borderColor: theme.border }]}>
                <View style={[styles.tipIcon, { backgroundColor: theme.accentSoft }]}>
                  <Icon name={tip.icon} size={14} color={theme.accent} />
                </View>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  {tip.text}
                </ThemedText>
              </ThemedView>
            ))}
          </View>

          <ThemedView style={[styles.notice, { backgroundColor: theme.warningSoft }]}>
            <Icon name="sparkles" size={16} color={theme.warning} />
            <ThemedText type="caption" style={[styles.noticeText, { color: theme.warning }]}>
              Camera identification is coming soon — the interface is ready for it.
            </ThemedText>
          </ThemedView>
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  viewfinder: {
    height: 260,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bracket: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  topLeft: { top: 18, left: 18, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 10 },
  topRight: { top: 18, right: 18, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 18, left: 18, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 18, right: 18, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 10 },
  scanLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 2,
    borderRadius: 2,
    top: '50%',
  },
  viewfinderCenter: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
  },
  shutterPlaceholder: {
    width: 44,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 16px 0 rgba(234, 88, 12, 0.3)',
  },
  galleryTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  tips: {
    gap: Spacing.two,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    marginTop: 'auto',
  },
  noticeText: {
    flex: 1,
  },
});
