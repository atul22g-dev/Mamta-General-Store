import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/common/icon';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/common/card';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { BottomTabInset, WebTopBarInset, MaxContentWidth, Spacing, Radius, Typography, Motion } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useResponsive } from '@/hooks/use-responsive';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const responsive = useResponsive();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          entering={FadeIn.duration(Motion.base)}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* Greeting */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.avatar,
                  {
                    experimental_backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})`,
                    backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})`,
                  },
                ]}>
                <ThemedText type="h3" style={{ color: theme.white }}>
                  M
                </ThemedText>
              </View>
              <View style={styles.headerText}>
                <ThemedText type="bodySmall" themeColor="textSecondary">
                  Welcome back
                </ThemedText>
                <ThemedText type="h2" style={styles.brand}>
                  Mamta General Store
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Dominant Find Product CTA */}
          <Animated.View entering={FadeInDown.duration(Motion.slow).delay(80)}>
            <Card
              onPress={() => router.push('/find-product/camera')}
              accessibilityLabel="Find Product — take a photo to check the price"
              style={[
                styles.heroCard,
                {
                  borderRadius: Radius.xl,
                  padding: responsive.heroPadding,
                  borderColor: 'transparent',
                  boxShadow: `0 14px 28px 0 ${theme.accentGlow}`,
                  experimental_backgroundImage: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentDark} 100%)`,
                  backgroundImage: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentDark} 100%)`,
                },
              ]}>
              <View style={styles.heroContent}>
                <ThemedText type="overline" style={styles.heroOverline}>
                  Scan to price
                </ThemedText>
                <ThemedText
                  type="h1"
                  style={[
                    styles.heroTitle,
                    { fontSize: responsive.heroTitleSize, lineHeight: responsive.heroTitleSize * 1.15 },
                  ]}
                  numberOfLines={1}>
                  Find Product
                </ThemedText>
              </View>
              <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.22)', width: responsive.heroIconSize, height: responsive.heroIconSize }]}>
                <Icon name="camera" size={30} color={theme.white} />
              </View>
            </Card>
          </Animated.View>

          {/* Secondary quick actions */}
          <View style={styles.shortcuts}>
            <Animated.View entering={FadeInUp.duration(Motion.base).delay(140)} style={styles.shortcutFlex}>
              <Card onPress={() => router.push('/admin/products/add')} padding="compact" style={styles.shortcutCard}>
                <View style={[styles.shortcutIcon, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="add-circle" size={22} color={theme.accent} />
                </View>
                <ThemedText type="smallBold" style={styles.shortcutTitle}>
                  Add Product
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Manage inventory
                </ThemedText>
              </Card>
            </Animated.View>
            <Animated.View entering={FadeInUp.duration(Motion.base).delay(210)} style={styles.shortcutFlex}>
              <Card onPress={() => router.push('/(tabs)/products')} padding="compact" style={styles.shortcutCard}>
                <View style={[styles.shortcutIcon, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="grid" size={22} color={theme.accent} />
                </View>
                <ThemedText type="smallBold" style={styles.shortcutTitle}>
                  Catalog
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Browse all items
                </ThemedText>
              </Card>
            </Animated.View>
          </View>

          {/* Recent products */}
          <View style={styles.sectionHeader}>
            <ThemedText type="h3">Recent Products</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              Your recently looked up items
            </ThemedText>
          </View>

          <Card padding="none" elevated={false} style={styles.emptyCard}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
              <Icon name="cube-outline" size={24} color={theme.accent} />
            </View>
            <ThemedText type="h3">No recent products yet</ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.emptyText}>
              Start by finding a product above to see your history here
            </ThemedText>
          </Card>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: WebTopBarInset,
    paddingBottom: BottomTabInset + Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingBottom: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    gap: Spacing.one / 2,
  },
  brand: Typography.h2,
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  heroContent: {
    flex: 1,
    gap: Spacing.one,
  },
  heroOverline: {
    color: 'rgba(255,255,255,0.85)',
  },
  heroTitle: {
    color: '#ffffff',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  shortcutFlex: {
    flex: 1,
  },
  shortcutCard: {
    gap: Spacing.two,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    gap: Spacing.one / 2,
    marginBottom: Spacing.two,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    borderStyle: 'dashed',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
