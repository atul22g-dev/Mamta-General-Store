import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/**
 * Product detail scaffold for /admin/products/[id]. Reads the id param and
 * shows a stub summary — real data comes with the database layer.
 */
export default function AdminProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.content}>
          <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
            <Icon name="cube" size={28} color={theme.accent} />
          </View>
          <Badge label={`Product #${id ?? '?'}`} variant="accent" />
          <ThemedText type="h2" style={styles.title}>
            Product Details
          </ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
            Name, category, pricing and stock for product “{id ?? '?'}” will load here once the
            database layer is connected.
          </ThemedText>

          <View style={styles.actions}>
            <Button
              title="Edit Product"
              onPress={() =>
                router.push({ pathname: '/admin/products/[id]/edit', params: { id } })
              }
              icon={<Icon name="create" size={18} color={theme.white} />}
            />
            <Button title="Back" onPress={() => router.back()} variant="secondary" />
          </View>
        </Animated.View>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
