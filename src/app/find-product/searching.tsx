import { StyleSheet } from 'react-native';

import { Loading } from '@/components/ui/loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants';

/**
 * Catalog-search step of the scan-to-price flow. Pure presentation for now —
 * no AI matching yet — so it just shows the working state.
 */
export default function FindProductSearchingScreen() {
  return (
    <ThemedView style={styles.container}>
      <Loading text="Matching your photo against the catalog…" />
      <ThemedText type="caption" themeColor="textTertiary">
        (Placeholder — search runs once the AI layer is connected)
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
