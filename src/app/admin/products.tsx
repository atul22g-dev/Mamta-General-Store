import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AdminCard } from '@/components/admin/admin-card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

const DEMO_PRODUCTS = [
  { id: '1', title: 'Basmati Rice 5kg', description: 'Groceries · ₹485', status: 'active' as const },
  { id: '2', title: 'Sunflower Oil 1L', description: 'Groceries · ₹142', status: 'active' as const },
  { id: '3', title: 'Assam Tea 500g', description: 'Beverages · ₹260', status: 'pending' as const },
  { id: '4', title: 'Detergent Powder 1kg', description: 'Household · ₹110', status: 'inactive' as const },
];

/**
 * Admin product list scaffold. Rows are demo data and navigate to the
 * dynamic detail route; add/edit flows are placeholders.
 */
export default function AdminProductsScreen() {
  const router = useRouter();
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
              Products
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Demo catalog — real data arrives with the database layer
            </ThemedText>
          </View>

          <View style={styles.addRow}>
            <Button
              title="Add Product"
              onPress={() => router.push('/admin/products/add')}
              icon={<Icon name="add" size={18} color={theme.white} />}
            />
          </View>

          <View style={styles.list}>
            {DEMO_PRODUCTS.map((product, index) => (
              <Animated.View
                key={product.id}
                entering={FadeInDown.duration(300).delay(index * 60)}>
                <AdminCard
                  title={product.title}
                  description={product.description}
                  status={product.status}
                  onPress={() =>
                    router.push({ pathname: '/admin/products/[id]', params: { id: product.id } })
                  }
                />
              </Animated.View>
            ))}
          </View>
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
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  addRow: {
    alignItems: 'flex-start',
  },
  list: {
    gap: Spacing.two,
  },
});
