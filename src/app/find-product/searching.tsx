import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/common/button';
import { Icon } from '@/components/common/icon';
import { Loading } from '@/components/common/loading';
import { ErrorState } from '@/components/common/error-state';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import type { SearchStage } from '@/services/search-pipeline.service';
import { useProductSearch } from '@/hooks/useProductSearch';

/**
 * Stage copy for the progress list. Each entry maps to a REAL pipeline
 * callback — the list advances because work completed, not on a timer.
 * 'embedding' + 'searching' advance when the edge function reports each
 * phase internally; from the app they arrive together, so the list shows
 * them as one "Identify & search" step that completes with the response.
 */
const STAGES: { key: SearchStage; label: string }[] = [
  { key: 'validating', label: 'Reading your photo' },
  { key: 'optimizing', label: 'Preparing your photo' },
  { key: 'searching', label: 'Identifying & searching the catalog' },
];

/** Which visual steps are complete once the pipeline reaches `stage`. */
function completedCount(stage: SearchStage): number {
  switch (stage) {
    case 'validating':
      return 0;
    case 'optimizing':
      return 1;
    case 'embedding':
    case 'searching':
      return 2;
    case 'done':
      return STAGES.length;
  }
}

function StageList({ stage }: { stage: SearchStage }) {
  const theme = useTheme();
  const doneThrough = completedCount(stage);

  return (
    <View style={styles.stageList}>
      {STAGES.map((entry, index) => {
        const done = index < doneThrough;
        const active = index === doneThrough;
        const color = done ? theme.success : active ? theme.accent : theme.textTertiary;

        return (
          <View key={entry.key} style={styles.stageRow}>
            <View
              style={[
                styles.stageDot,
                { backgroundColor: done || active ? color : theme.surfaceSecondary },
              ]}>
              <Icon
                name={done ? 'checkmark' : active ? 'ellipse' : 'ellipse-outline'}
                size={done ? 14 : 10}
                color={done || active ? '#FFFFFF' : theme.textTertiary}
              />
            </View>
            <ThemedText
              type="bodySmall"
              themeColor={done || active ? 'text' : 'textTertiary'}
              style={styles.stageLabel}>
              {entry.label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The searching step: renders the ONE pipeline's progress and error states.
 * All lifecycle logic (abort-on-unmount, retry, routing) lives in the
 * useProductSearch hook — this screen is a pure view of its state.
 */
export default function FindProductSearchingScreen() {
  const { phase, stage, userError, retry, cancel, searchManually } = useProductSearch();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {phase === 'working' ? (
          <View style={styles.center}>
            <Loading text="Matching your photo against the catalog…" showIcon />
            <StageList stage={stage} />
          </View>
        ) : (
          <View style={styles.center}>
            <ErrorState
              title={userError?.title ?? 'Couldn’t complete the match'}
              description={userError?.message ?? 'Please try again.'}
              onRetry={retry}
              retryLabel={userError?.retryLabel ?? 'Try again'}
              style={styles.errorPanel}
            />
            <Button title="Search Manually" onPress={searchManually} />
            <Button title="Cancel" variant="secondary" onPress={cancel} />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  stageList: { gap: Spacing.two, alignSelf: 'flex-start' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLabel: { flexShrink: 1 },
  errorPanel: { marginBottom: Spacing.two },
});
