import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminCard } from '@/components/admin/admin-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const STATS = [
  { label: 'Products', value: '128', icon: 'cube-outline' as IconName },
  { label: 'Price lists', value: '6', icon: 'document-text' as IconName },
  { label: 'Updates', value: '12', icon: 'sync' as IconName },
];

const PREVIEW_ITEMS = [
  { title: 'Basmati Rice 5kg', description: 'Groceries · ₹485', status: 'active' as const },
  { title: 'Sunflower Oil 1L', description: 'Groceries · ₹142', status: 'pending' as const },
  { title: 'Assam Tea 500g', description: 'Beverages · ₹260', status: 'inactive' as const },
];

export default function AdminScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <ThemedText type="h1" style={styles.title}>
              Admin
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Manage products and store data
            </ThemedText>
          </View>

          {/* Stat tiles */}
          <View style={styles.stats}>
            {STATS.map((stat, index) => (
              <Animated.View
                key={stat.label}
                entering={FadeInDown.duration(300).delay(index * 70)}
                style={[
                  styles.statTile,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={[styles.statIcon, { backgroundColor: theme.accentSoft }]}>
                  <Icon name={stat.icon} size={15} color={theme.accent} />
                </View>
                <ThemedText type="h2" style={styles.statValue}>
                  {stat.value}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {stat.label}
                </ThemedText>
              </Animated.View>
            ))}
          </View>

          {/* Preview items */}
          <View style={styles.list}>
            {PREVIEW_ITEMS.map((item, index) => (
              <Animated.View
                key={item.title}
                entering={FadeInDown.duration(300).delay(200 + index * 60)}>
                <AdminCard
                  title={item.title}
                  description={item.description}
                  status={item.status}
                />
              </Animated.View>
            ))}
          </View>

          <ThemedView style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
            <Icon name="sparkles" size={16} color={theme.accent} />
            <ThemedText type="caption" style={[styles.noticeText, { color: theme.accentDark }]}>
              Editing, inventory updates and pricing controls are coming soon.
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
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statTile: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: Typography.h2,
  list: {
    gap: Spacing.two,
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
