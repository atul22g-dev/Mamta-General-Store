import { StyleSheet } from 'react-native';

import { PlaceholderScreen } from '@/components/navigation/placeholder-screen';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Spacing } from '@/constants';

/** Final step of the scan-to-price flow (scaffold — no match data yet). */
export default function FindProductResultScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.grow}>
      <PlaceholderScreen
        icon="checkmark-circle"
        title="Result"
        description="The matched product and its price will appear here once the catalog and AI layers are connected."
        badgeLabel="Step 4 · Done"
        style={styles.container}
        actions={[
          { label: 'Scan Another', onPress: () => router.replace('/find-product'), variant: 'cta' },
          { label: 'Back Home', onPress: () => router.dismissTo('/(tabs)'), variant: 'secondary' },
        ]}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingBottom: Spacing.four,
  },
});
