import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius, Shadows } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { matchSession } from '@/lib/visual-match/session';
import { analyzeMatchOutcome } from '@/lib/visual-match/decision';
import type { MatchCandidateView } from '@/lib/visual-match/client';
import type { ProductWithImages } from '@/lib/products/product-service';
import { UNIT_LABELS, type ProductUnit } from '@/lib/products/product-validation';
import { formatPrice } from '@/lib/format';

function confidencePercent(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as ProductUnit] ?? unit;
}

/** What the match card renders: a product plus an optional known similarity. */
type ShownProduct = {
  product: ProductWithImages;
  /** null for manual picks — the flow never invents a score. */
  similarity: number | null;
};

/** Labeled stat tile (Stock / Match) used under the price hero. */
function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'error';
}) {
  const theme = useTheme();

  const color =
    tone === 'success'
      ? theme.success
      : tone === 'warning'
        ? theme.warning
        : tone === 'error'
          ? theme.error
          : theme.text;

  return (
    <View style={[styles.statTile, { backgroundColor: theme.surfaceSecondary }]}>
      <ThemedText type="overline" themeColor="textTertiary">
        {label}
      </ThemedText>
      <ThemedText type="h3" style={{ color }}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * Match card. Layout per spec:
 * image → name → unit → MRP / SELLING PRICE (dominant) → Stock / Match.
 * Every value comes from the products table — the AI contributes only the
 * product id and the similarity score. Manual picks hide the Match tile.
 */
function MatchCard({
  shown,
  headerIcon,
  headerTitle,
  headerTone,
}: {
  shown: ShownProduct;
  headerIcon: 'checkmark-circle' | 'person';
  headerTitle: string;
  headerTone: 'success' | 'warning';
}) {
  const theme = useTheme();
  const { product, similarity } = shown;

  const firstImage = product.product_images[0]?.image_url;
  const stockLabel =
    product.stock === 0
      ? 'Out of stock'
      : product.stock <= 10
        ? `Low · ${product.stock}`
        : String(product.stock);

  return (
    <View style={styles.stack}>
      <View style={styles.headerRow}>
        <Icon
          name={headerIcon}
          size={22}
          color={headerTone === 'success' ? theme.success : theme.warning}
        />
        <ThemedText type="h3">{headerTitle}</ThemedText>
        {similarity !== null && (
          <Badge label={`${confidencePercent(similarity)} match`} variant={headerTone} size="sm" />
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          Shadows.sm,
        ]}>
        {firstImage ? (
          <Image source={{ uri: firstImage }} style={styles.productImage} />
        ) : (
          <View style={[styles.productImage, styles.imageFallback, { backgroundColor: theme.accentSoft }]}>
            <ThemedText type="display" style={{ color: theme.accent }}>
              {product.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}

        <View style={styles.cardBody}>
          {/* Name + unit */}
          <ThemedText type="h2">{product.name}</ThemedText>
          <ThemedText type="caption" themeColor="textTertiary">
            {unitLabel(product.unit)}
          </ThemedText>

          {/* Price hero — selling price is the most prominent element.
              Always the live DB value; the AI never supplies prices. */}
          <View style={[styles.priceHero, { backgroundColor: theme.accentSoft }]}>
            <View style={styles.priceHeroTop}>
              {product.mrp !== product.selling_price && (
                <View style={styles.mrpBlock}>
                  <ThemedText type="overline" themeColor="textTertiary">
                    MRP
                  </ThemedText>
                  <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.mrpValue}>
                    {formatPrice(product.mrp)}
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText type="overline" style={{ color: theme.accentDark }}>
              Selling price
            </ThemedText>
            <ThemedText type="display" style={styles.priceValue}>
              {formatPrice(product.selling_price)}
            </ThemedText>
          </View>

          {/* Stock + Match stats (Match hidden for manual picks) */}
          <View style={styles.statRow}>
            <View style={styles.statFlex}>
              <StatTile
                label="Stock"
                value={stockLabel}
                tone={product.stock === 0 ? 'error' : product.stock <= 10 ? 'warning' : undefined}
              />
            </View>
            {similarity !== null && (
              <View style={styles.statFlex}>
                <StatTile label="Match" value={confidencePercent(similarity)} tone="success" />
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Low-confidence candidate row: image, name, similarity, Select button.
 * Deliberately NO price — nothing is "chosen" yet, and prices are only
 * ever shown from the products table after an explicit selection.
 */
function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: MatchCandidateView;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const firstImage = candidate.product.product_images[0]?.image_url;

  return (
    <View
      style={[
        styles.candidateCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.sm,
      ]}>
      {firstImage ? (
        <Image source={{ uri: firstImage }} style={styles.candidateThumb} />
      ) : (
        <View style={[styles.candidateThumb, styles.candidateThumbFallback]}>
          <ThemedText type="bodySmall" style={{ color: theme.accent }}>
            {candidate.product.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
      )}

      <View style={styles.candidateInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {candidate.product.name}
        </ThemedText>
        <Badge
          label={`${confidencePercent(candidate.similarity)} similar`}
          variant={candidate.similarity >= 0.75 ? 'warning' : 'neutral'}
          size="sm"
        />
      </View>

      <Button
        title={selected ? 'Selected ✓' : 'Select'}
        size="sm"
        variant={selected ? 'secondary' : 'primary'}
        onPress={onSelect}
        disabled={selected}
      />
    </View>
  );
}

/**
 * Final step of the scan flow. High confidence → "Product Found ✓" card
 * with the DB selling price as the visual centerpiece. Low confidence →
 * "Not completely sure" with ranked candidates, a manual-search fallback,
 * and, for manual picks, the same card without a fabricated match score.
 */
export default function FindProductResultScreen() {
  const router = useRouter();
  const theme = useTheme();

  const visual = matchSession.getResult();
  const manualProduct = matchSession.getManualResult();
  const [selected, setSelected] = useState<MatchCandidateView | null>(null);

  const handleDone = () => {
    matchSession.clear();
    router.dismissTo('/(tabs)');
  };

  const handleScanAgain = () => {
    matchSession.clear();
    router.replace('/find-product');
  };

  /** Manual fallback: keep the flow, jump to the search screen. */
  const handleSearchManually = () => {
    matchSession.clear();
    router.push('/find-product/search');
  };

  // Error/recovery state: deep link or expired session with nothing to show.
  if (!visual && !manualProduct) {
    return (
      <ThemedView style={styles.grow}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <View style={styles.center}>
            <EmptyState
              title="No result yet"
              description="Take a product photo to get a match, or search the catalog manually."
              icon={<Icon name="camera" size={26} color={theme.accent} />}
              action={<Button title="Scan a product" onPress={handleScanAgain} />}
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const outcome = visual?.outcome ?? null;
  const photo = visual?.photo ?? null;

  // Decision uses the threshold the BACKEND used, so server-side tuning
  // changes behavior with no app update. A below-threshold 'identified'
  // still renders as ambiguous — the confidence invariant holds either way.
  const decision = outcome ? analyzeMatchOutcome(outcome, outcome.threshold) : null;
  const selectedId = selected?.product.id ?? null;

  const shownCandidate: ShownProduct | null = manualProduct
    ? { product: manualProduct, similarity: null }
    : selected
      ? { product: selected.product, similarity: selected.similarity }
      : decision?.kind === 'single' && outcome && outcome.candidates[0]
        ? {
            product: outcome.candidates[0].product,
            similarity: outcome.candidates[0].similarity,
          }
        : null;

  const isAmbiguous = decision?.kind === 'ambiguous' && !selected && !!outcome;
  const isNoMatch = decision?.kind === 'none';

  return (
    <ThemedView style={styles.grow}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {photo && <Image source={{ uri: photo.uri }} style={styles.capturedThumb} />}

          {/* High confidence, selected candidate, or manual pick */}
          {shownCandidate && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <MatchCard
                shown={shownCandidate}
                headerIcon={selected || manualProduct ? 'person' : 'checkmark-circle'}
                headerTitle={
                  selected || manualProduct ? 'You selected' : 'Product Found ✓'
                }
                headerTone={selected || manualProduct ? 'warning' : 'success'}
              />
              {selected && (
                <Button
                  title="Not the right product? Choose another"
                  variant="ghost"
                  onPress={() => setSelected(null)}
                  style={styles.chooseAnother}
                />
              )}
            </Animated.View>
          )}

          {/* Low confidence — "Not completely sure" */}
          {isAmbiguous && outcome && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.stack}>
              <View style={styles.headerRow}>
                <Icon name="help-circle" size={22} color={theme.warning} />
                <ThemedText type="h3">Not completely sure</ThemedText>
              </View>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                Best confidence was {confidencePercent(outcome.confidence)}, below the{' '}
                {confidencePercent(outcome.threshold)} threshold. Select the right product below —
                its current price is shown after you pick.
              </ThemedText>
              <View style={styles.candidateList}>
                {outcome.candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.product.id}
                    candidate={candidate}
                    selected={selectedId === candidate.product.id}
                    onSelect={() => setSelected(candidate)}
                  />
                ))}
              </View>

              {/* Manual fallback */}
              <View style={[styles.fallbackCard, { backgroundColor: theme.surfaceSecondary }]}>
                <Icon name="search" size={18} color={theme.textSecondary} />
                <View style={styles.fallbackText}>
                  <ThemedText type="smallBold">Can’t identify this product?</ThemedText>
                  <ThemedText type="caption" themeColor="textTertiary">
                    Look it up by name or category instead.
                  </ThemedText>
                </View>
                <Button title="Search Manually" size="sm" onPress={handleSearchManually} />
              </View>
            </Animated.View>
          )}

          {/* No match */}
          {isNoMatch && (
            <EmptyState
              title="No matching product"
              description="This item isn’t in the catalog yet — or try finding it by name."
              icon={<Icon name="search" size={26} color={theme.accent} />}
              action={
                <View style={styles.noMatchActions}>
                  <Button title="Search Manually" onPress={handleSearchManually} />
                  <Button
                    title="Scan another product"
                    variant="secondary"
                    onPress={handleScanAgain}
                  />
                </View>
              }
            />
          )}
        </ScrollView>

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          {shownCandidate && (
            <Button title="Scan Another" onPress={handleScanAgain} block size="lg" />
          )}
          <Button title="Done" variant="secondary" onPress={handleDone} block />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  capturedThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignSelf: 'center',
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  stack: {
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  priceHero: {
    marginTop: Spacing.two,
    borderRadius: Radius.md,
    padding: Spacing.four,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  priceHeroTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 0,
  },
  mrpBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  mrpValue: {
    textDecorationLine: 'line-through',
  },
  priceValue: {
    color: '#2563EB',
    letterSpacing: -1,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  statFlex: {
    flex: 1,
  },
  statTile: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  chooseAnother: {
    marginTop: Spacing.two,
    alignSelf: 'center',
  },
  fallbackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  fallbackText: {
    flex: 1,
    gap: 2,
  },
  noMatchActions: {
    gap: Spacing.two,
  },
  candidateList: {
    gap: Spacing.two,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  candidateInfo: {
    flex: 1,
    gap: Spacing.one,
  },
  candidateThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  candidateThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActions: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
});
