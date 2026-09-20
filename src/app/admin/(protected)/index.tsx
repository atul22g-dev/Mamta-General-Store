import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AdminCard } from '@/components/admin/admin-card';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Loading } from '@/components/ui/loading';
import { DatabaseIndicator } from '@/components/ui/database-indicator';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useAuth } from '@/hooks/use-auth';
import { useAdminDashboard, stockStatus } from '@/hooks/use-admin-dashboard';
import { LOW_STOCK_MAX, OUT_OF_STOCK_MAX } from '@/lib/stock';
import { useDatabaseHealth } from '@/hooks/use-database-health';

type StatTile = {
  label: string;
  icon: IconName;
  value: number;
  bg: string;
  fg: string;
};

export default function AdminDashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { status, stats, recent, lowStockItems, errorMessage, refreshing, refresh, reload } =
    useAdminDashboard();
  const database = useDatabaseHealth();
  const responsive = useResponsive();

  // While the dashboard's own data refreshes, piggyback a health recheck so
  // the indicator reflects the same moment (one extra lightweight probe).
  // recheck() only touches state from async callbacks, so it's effect-safe.
  useEffect(() => {
    if (refreshing) database.recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  const tiles: StatTile[] = [
    { label: 'Total Products', icon: 'cube-outline', value: stats.total, bg: theme.accentSoft, fg: theme.accent },
    { label: 'In Stock', icon: 'checkmark-circle', value: stats.inStock, bg: theme.successSoft, fg: theme.success },
    { label: 'Low Stock', icon: 'alert-circle', value: stats.lowStock, bg: theme.warningSoft, fg: theme.warning },
    { label: 'Out of Stock', icon: 'close-circle', value: stats.outOfStock, bg: theme.errorSoft, fg: theme.error },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={theme.textTertiary}
              progressBackgroundColor={theme.surface}
            />
          }>
          {/* Header — the indicator drops below the title on phones so the
              title never gets squeezed into mid-word breaks; tablets keep
              the space-efficient single row. */}
          <View style={[styles.header, !responsive.isTablet && styles.headerStacked]}>
            <View style={styles.headerText}>
              <ThemedText type="h1" style={styles.title}>
                Dashboard
              </ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                {profile?.email ? `Signed in as ${profile.email}` : 'Store inventory at a glance'}
              </ThemedText>
            </View>
            <DatabaseIndicator status={database.status} latencyMs={database.health.latencyMs} />
          </View>

          {status === 'loading' ? (
            <Loading text="Loading inventory…" />
          ) : status === 'error' ? (
            <ErrorState
              description={errorMessage ?? 'Could not reach the database.'}
              onRetry={() => void reload()}
            />
          ) : (
            <>
              {/* Stat tiles */}
              <View style={styles.stats}>
                {tiles.map((tile, index) => (
                  <Animated.View
                    key={tile.label}
                    entering={FadeInDown.duration(300).delay(index * 60)}
                    style={[
                      styles.statTile,
                      {
                        backgroundColor: tile.bg,
                        borderColor: 'transparent',
                        // 2-up on phones, 4-across on tablets/foldables/web —
                        // derived live from the real window width.
                        flexBasis: responsive.statTileBasis,
                        minWidth: responsive.isTablet ? 0 : '47%',
                      },
                    ]}>
                    <View style={styles.statIconRow}>
                      <Icon name={tile.icon} size={15} color={tile.fg} />
                      <ThemedText type="overline" style={{ color: tile.fg }}>
                        {tile.label}
                      </ThemedText>
                    </View>
                    <ThemedText type="display" style={{ color: tile.fg }}>
                      {tile.value}
                    </ThemedText>
                  </Animated.View>
                ))}
              </View>

              {/* Quick actions — vertical tiles (icon above label): the only
                  layout that survives every phone width without breaking
                  words mid-label the way tight horizontal buttons did. */}
              <View style={styles.actions}>
                {(
                  [
                    {
                      title: 'Add Product',
                      icon: 'add' as const,
                      href: '/admin/products/add' as const,
                      variant: 'primary' as const,
                    },
                    {
                      title: 'Manage Products',
                      icon: 'apps' as const,
                      href: '/admin/products' as const,
                      variant: 'secondary' as const,
                    },
                    {
                      title: 'Add Staff',
                      icon: 'person-add' as const,
                      href: '/admin/staff' as const,
                      variant: 'soft' as const,
                    },
                  ] as const
                ).map((action) => (
                  <Pressable
                    key={action.title}
                    accessibilityRole="button"
                    accessibilityLabel={action.title}
                    onPress={() => router.push(action.href)}
                    style={({ pressed }) => [
                      styles.actionTile,
                      action.variant === 'primary' && {
                        backgroundColor: theme.accent,
                        borderColor: 'transparent',
                      },
                      action.variant === 'secondary' && {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      action.variant === 'soft' && {
                        backgroundColor: theme.accentSoft,
                        borderColor: 'transparent',
                      },
                      pressed && styles.actionTilePressed,
                    ]}>
                    <View
                      style={[
                        styles.actionIconWrap,
                        action.variant === 'primary' && {
                          backgroundColor: 'rgba(255,255,255,0.22)',
                        },
                        action.variant === 'secondary' && {
                          backgroundColor: theme.accentSoft,
                        },
                        action.variant === 'soft' && { backgroundColor: theme.surface },
                      ]}>
                      <Icon
                        name={action.icon}
                        size={20}
                        color={
                          action.variant === 'primary' ? theme.white : theme.accent
                        }
                      />
                    </View>
                    <ThemedText
                      type="caption"
                      style={[
                        styles.actionTileLabel,
                        action.variant === 'primary' && { color: theme.white },
                        action.variant === 'soft' && { color: theme.accent },
                      ]}>
                      {action.title}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              {/* Recent products */}
              <View style={styles.section}>
                <SectionHeader
                  title="Recent Products"
                  subtitle="Latest additions to the catalog"
                />
                {recent.length === 0 ? (
                  <EmptyState
                    title="No products yet"
                    description="Add your first product to see it here."
                    action={
                      <Button
                        title="Add Product"
                        onPress={() => router.push('/admin/products/add')}
                        size="sm"
                      />
                    }
                  />
                ) : (
                  <View style={styles.list}>
                    {recent.map((product, index) => (
                      <Animated.View
                        key={product.id}
                        entering={FadeInDown.duration(300).delay(index * 50)}>
                        <AdminCard
                          title={product.name}
                          description={`${product.category} · ₹${product.selling_price} · stock ${product.stock}`}
                          status={stockStatus(product.stock)}
                          onPress={() => router.push({ pathname: '/admin/products/[id]', params: { id: product.id } })}
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </View>

              {/* Low stock */}
              <View style={styles.section}>
                <SectionHeader
                  title="Low Stock"
                  subtitle={`${stats.lowStock} product(s) between ${OUT_OF_STOCK_MAX + 1} and ${LOW_STOCK_MAX} units`}
                />
                {lowStockItems.length === 0 ? (
                  <EmptyState
                    title="Stock levels healthy"
                    description={`Nothing in the 2–${LOW_STOCK_MAX} unit range right now.`}
                  />
                ) : (
                  <View style={styles.list}>
                    {lowStockItems.map((product, index) => (
                      <Animated.View
                        key={product.id}
                        entering={FadeInDown.duration(300).delay(index * 50)}>
                        <AdminCard
                          title={product.name}
                          description={`${product.category} · ₹${product.selling_price}`}
                          status={stockStatus(product.stock)}
                          onPress={() => router.push({ pathname: '/admin/products/[id]', params: { id: product.id } })}
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerStacked: {
    flexDirection: 'column',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTile: {
    flexGrow: 1,
    alignItems: 'flex-start',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  actionTilePressed: {
    opacity: 0.75,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileLabel: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
});
