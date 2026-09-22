/**
 * Admin → Export / Import products
 *
 * Two jobs, one screen, and the separation between them is the whole design:
 *
 *   EXPORT  the catalog (or an empty template) as a CSV to edit in a
 *           spreadsheet, or as JSON for a full backup.
 *   IMPORT  a file the shopkeeper edited, shown as a PREVIEW of exactly what
 *           would change — new / updated / unchanged / skipped — and only
 *           written after they press the button.
 *
 * Rules, parsing and validation live in product-transfer-rules.ts
 * (unit-tested); database access in product-transfer.service.ts; the file
 * picker and share sheet in transfer-file.ts; ALL state and async actions
 * live in the useProductTransfer hook (Screen → Hook → Service). The screen
 * is a pure view: it routes props into two focused cards and nothing else.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/common/button';
import { Card } from '@/components/common/card';
import { Icon } from '@/components/common/icon';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductTransfer, type ImportPhase } from '@/hooks/use-product-transfer';
import {
  describePlan,
  describeRow,
  type ExportFormat,
  type ImportPlan,
} from '@/services/product-transfer-rules';
import type { ImportOutcome } from '@/services/product-transfer.service';

/** Preview rows rendered at once — a 400-row file must not lock the phone. */
const PREVIEW_LIMIT = 40;

/** One line of the preview list: what will happen, and why. */
function PreviewRow({ plan, index }: { plan: ImportPlan; index: number }) {
  const theme = useTheme();
  const row = plan.rows[index];

  const tone =
    row.action === 'create'
      ? { label: 'New', colour: theme.success, background: theme.accentSoft }
      : row.action === 'update'
        ? { label: 'Update', colour: theme.accent, background: theme.accentSoft }
        : row.action === 'skip'
          ? { label: 'Unchanged', colour: theme.textTertiary, background: theme.surfaceSecondary }
          : { label: 'Skipped', colour: theme.warning, background: theme.surfaceSecondary };

  return (
    <View style={[styles.previewRow, { borderColor: theme.border }]}>
      <View style={styles.previewRowHeader}>
        <View style={[styles.pill, { backgroundColor: tone.background }]}>
          <ThemedText type="caption" style={{ color: tone.colour }}>
            {tone.label}
          </ThemedText>
        </View>
        <ThemedText type="bodySmall" numberOfLines={1} style={styles.previewName}>
          {row.name || `Line ${row.line}`}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          L{row.line}
        </ThemedText>
      </View>

      {row.row && (
        <ThemedText type="caption" themeColor="textSecondary">
          {describeRow(row.row)}
        </ThemedText>
      )}
      {row.reasons.length > 0 && (
        <ThemedText type="caption" themeColor="textTertiary">
          {row.reasons.join(' ')}
        </ThemedText>
      )}
    </View>
  );
}

/** The result of a completed import. */
function OutcomePanel({ outcome }: { outcome: ImportOutcome }) {
  const theme = useTheme();

  return (
    <Card padding="normal">
      <View style={styles.sectionHeader}>
        <Icon name="checkmark-circle" size={20} color={theme.success} />
        <ThemedText type="h3">Import finished</ThemedText>
      </View>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        {outcome.created} added · {outcome.updated} updated
        {outcome.failed.length > 0 ? ` · ${outcome.failed.length} failed` : ''}
      </ThemedText>
      {outcome.embedded > 0 && (
        <ThemedText type="caption" themeColor="textTertiary">
          {outcome.embedded} photo{outcome.embedded === 1 ? '' : 's'} made searchable by image.
        </ThemedText>
      )}
      {outcome.embeddingWarning && (
        <View style={[styles.notice, { backgroundColor: theme.surfaceSecondary }]}>
          <Icon name="alert-circle" size={16} color={theme.warning} />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.noticeText}>
            {outcome.embeddingWarning}
          </ThemedText>
        </View>
      )}
      {outcome.failed.length > 0 && (
        <View style={styles.failureList}>
          {outcome.failed.slice(0, 10).map((failure) => (
            <ThemedText key={`${failure.line}-${failure.name}`} type="caption" themeColor="textTertiary">
              Line {failure.line} ({failure.name || 'no name'}): {failure.reason}
            </ThemedText>
          ))}
          {outcome.failed.length > 10 && (
            <ThemedText type="caption" themeColor="textTertiary">
              …and {outcome.failed.length - 10} more.
            </ThemedText>
          )}
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The two jobs, as two focused cards
// ---------------------------------------------------------------------------

/** Export: format choice, template, and the share sheet hand-off. */
function ExportCard({
  format,
  exporting,
  exportMessage,
  busy,
  onFormatChange,
  onExport,
}: {
  format: ExportFormat;
  exporting: boolean;
  exportMessage: string | null;
  busy: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onExport: (empty: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <Card padding="normal">
      <View style={styles.sectionHeader}>
        <Icon name="cloud-download-outline" size={20} color={theme.accent} />
        <ThemedText type="h3">Export products</ThemedText>
      </View>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Every product, including hidden ones. Prices and stock are editable in the file.
      </ThemedText>

      <View style={styles.formatRow}>
        {(['csv', 'json'] as const).map((option) => (
          <Button
            key={option}
            title={option === 'csv' ? 'CSV (spreadsheet)' : 'JSON (backup)'}
            variant={format === option ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => onFormatChange(option)}
          />
        ))}
      </View>

      <ThemedText type="caption" themeColor="textTertiary">
        {format === 'csv'
          ? 'CSV opens in Excel or Google Sheets. Edit prices and stock, then import it back.'
          : 'JSON is a full backup: it also keeps internal ids and timestamps.'}
      </ThemedText>

      <Button
        title={exporting ? 'Preparing file…' : 'Export catalog'}
        icon={<Icon name="download-outline" size={18} color={theme.white} />}
        onPress={() => onExport(false)}
        disabled={busy}
        block
      />
      <Button
        title="Download a blank template"
        variant="tertiary"
        size="sm"
        onPress={() => onExport(true)}
        disabled={busy}
      />

      {exportMessage && (
        <View style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
          <Icon name="checkmark-circle" size={16} color={theme.success} />
          <ThemedText type="caption" style={[styles.noticeText, { color: theme.text }]}>
            {exportMessage}
          </ThemedText>
        </View>
      )}
    </Card>
  );
}

/** Import: file choice, the change preview, confirm/cancel, and the outcome. */
function ImportCard({
  phase,
  busy,
  fileName,
  plan,
  outcome,
  importError,
  writableCount,
  onChooseFile,
  onCancel,
  onConfirm,
  onDone,
}: {
  phase: ImportPhase;
  busy: boolean;
  fileName: string | null;
  plan: ImportPlan | null;
  outcome: ImportOutcome | null;
  importError: string | null;
  writableCount: number;
  onChooseFile: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();

  return (
    <Card padding="normal">
      <View style={styles.sectionHeader}>
        <Icon name="cloud-upload-outline" size={20} color={theme.accent} />
        <ThemedText type="h3">Import products</ThemedText>
      </View>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Products are matched by name: a name already in the catalog updates that product, a
        new name is added. Nothing is written until you confirm.
      </ThemedText>

      <Button
        title={phase === 'picking' ? 'Opening…' : 'Choose a file'}
        variant="secondary"
        icon={<Icon name="document-text-outline" size={18} color={theme.accent} />}
        onPress={onChooseFile}
        disabled={busy}
        block
      />

      {importError && (
        <View style={[styles.notice, { backgroundColor: theme.surfaceSecondary }]}>
          <Icon name="alert-circle" size={16} color={theme.warning} />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.noticeText}>
            {importError}
          </ThemedText>
        </View>
      )}

      {fileName && phase !== 'done' && (
        <ThemedText type="caption" themeColor="textTertiary">
          {fileName}
        </ThemedText>
      )}

      {plan && phase === 'preview' && (
        <View style={styles.preview}>
          <ThemedText type="bodySmall">
            {describePlan(plan)} — {plan.rows.length} row{plan.rows.length === 1 ? '' : 's'} read
          </ThemedText>

          <View style={styles.previewList}>
            {plan.rows.slice(0, PREVIEW_LIMIT).map((_, index) => (
              <PreviewRow key={`${plan.rows[index].line}-${index}`} plan={plan} index={index} />
            ))}
          </View>

          {plan.rows.length > PREVIEW_LIMIT && (
            <ThemedText type="caption" themeColor="textTertiary">
              Showing the first {PREVIEW_LIMIT} of {plan.rows.length} rows.
            </ThemedText>
          )}

          <Button
            title={
              writableCount === 0
                ? 'Nothing to import'
                : `Import ${writableCount} product${writableCount === 1 ? '' : 's'}`
            }
            onPress={onConfirm}
            disabled={writableCount === 0}
            block
          />
          <Button title="Cancel" variant="ghost" onPress={onCancel} block />
        </View>
      )}

      {phase === 'applying' && (
        <ThemedText type="bodySmall" themeColor="textSecondary">
          Importing…
        </ThemedText>
      )}

      {outcome && <OutcomePanel outcome={outcome} />}

      {outcome && (
        <Button title="Done" variant="secondary" onPress={onDone} block />
      )}
    </Card>
  );
}

/** The screen: two cards over one shared state hook. */
export default function AdminProductTransferScreen() {
  const router = useRouter();
  const theme = useTheme();
  const transfer = useProductTransfer();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, styles.gutter]}>
          <ThemedText type="h1">Export / Import</ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Move the whole catalog in and out of a spreadsheet
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, styles.gutter]}
          showsVerticalScrollIndicator={false}>

          <ExportCard
            format={transfer.format}
            exporting={transfer.exporting}
            exportMessage={transfer.exportMessage}
            busy={transfer.busy}
            onFormatChange={transfer.setFormat}
            onExport={(empty) => void transfer.runExport(empty)}
          />

          <ImportCard
            phase={transfer.phase}
            busy={transfer.busy}
            fileName={transfer.fileName}
            plan={transfer.plan}
            outcome={transfer.outcome}
            importError={transfer.importError}
            writableCount={transfer.writableCount}
            onChooseFile={() => void transfer.chooseFile()}
            onCancel={transfer.reset}
            onConfirm={() => void transfer.confirmImport()}
            onDone={() => {
              transfer.reset();
              router.back();
            }}
          />

          {/* ------------------------------ HELP ---------------------------- */}
          <View style={[styles.help, { borderColor: theme.border }]}>
            <Icon name="information-circle-outline" size={16} color={theme.textTertiary} />
            <ThemedText type="caption" themeColor="textTertiary" style={styles.noticeText}>
              Photos never travel in a file. To give an imported product a photo, either upload it
              from the product screen, or put a public image link in the image_url column — the app
              then makes it searchable by image. Columns: name, category, unit, mrp, selling_price,
              stock, description, brand, subcategory, is_active, image_url.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  gutter: { paddingHorizontal: Spacing.four, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  header: { paddingTop: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.one },
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  formatRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
  },
  noticeText: { flex: 1, flexShrink: 1 },
  preview: { gap: Spacing.two },
  previewList: { gap: Spacing.one },
  previewRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, gap: 2 },
  previewRowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewName: { flex: 1, flexShrink: 1 },
  pill: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.sm },
  failureList: { gap: 2 },
  help: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
});
