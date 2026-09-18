import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/**
 * Edit-product scaffold for /admin/products/[id]/edit. Mirrors the add form
 * with the product id shown; all controls disabled until the database layer.
 */
export default function AdminEditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeInDown.duration(350)}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
              <Icon name="create" size={24} color={theme.accent} />
            </View>
            <View style={styles.headerText}>
              <ThemedText type="h2">Edit Product</ThemedText>
              <Badge label={`Product #${id ?? '?'}`} variant="neutral" size="sm" />
            </View>
          </View>

          <View style={styles.form}>
            <Input label="Product name" placeholder="Product name" editable={false} />
            <Input label="Category" placeholder="Category" editable={false} />
            <Input label="Price (₹)" placeholder="0" keyboardType="decimal-pad" editable={false} />
            <Button
              title="Save Changes"
              onPress={undefined}
              disabled
              block
              icon={<Icon name="save" size={18} color={theme.white} />}
            />
            <Button title="Cancel" onPress={() => router.back()} variant="secondary" block />
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
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
});
