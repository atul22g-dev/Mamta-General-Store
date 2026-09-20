import { RefreshControl, StyleSheet, View } from 'react-native';
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
import { useAuth } from '@/hooks/use-auth';
import { useAdminDashboard, stockStatus, LOW_STOCK_THRESHOLD } from '@/hooks/use-admin-dashboard';
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
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#64748B" />
          }>
          {/* Header */}
          <View style={styles.header}>
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
                      { backgroundColor: tile.bg, borderColor: 'transparent' },
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

              {/* Quick actions */}
              <View style={styles.actions}>
                <Button
                  title="Add Product"
                  onPress={() => router.push('/admin/products/add')}
                  icon={<Icon name="add" size={18} color={theme.white} />}
                />
                <Button
                  title="Manage Products"
                  onPress={() => router.push('/admin/products')}
                  variant="secondary"
                  iconRight={<Icon name="chevron-forward" size={16} color={theme.text} />}
                />
                <Button
                  title="Add Staff"
                  onPress={() => router.push('/admin/staff')}
                  variant="ghost"
                  icon={<Icon name="person-add" size={18} color={theme.accent} />}
                />
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
                  subtitle={`${stats.lowStock} product(s) at or below ${LOW_STOCK_THRESHOLD} units`}
                />
                {lowStockItems.length === 0 ? (
                  <EmptyState
                    title="Stock levels healthy"
                    description={`Nothing at or below ${LOW_STOCK_THRESHOLD} units right now.`}
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
    minWidth: '47%',
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
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
});
