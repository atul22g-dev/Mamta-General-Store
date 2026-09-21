import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { ImageViewer } from '@/components/ui/image-viewer';
import { PriceText } from '@/components/ui/price-text';
import { MaxContentWidth, Radius, Shadows, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';
import type { ProductWithImages } from '@/lib/products/product-service';
import { UNIT_LABELS, type ProductUnit } from '@/lib/products/product-validation';
import { stockLabel as sharedStockLabel, stockTone } from '@/lib/stock';
import type { MatchCandidateView, VisualMatchOutcome } from '@/lib/visual-match/client';
import { analyzeMatchOutcome } from '@/lib/visual-match/decision';
import { matchSession } from '@/lib/visual-match/session';

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

/** Labeled stat tile (Stock / Match) used under the price hero.
 *  Tone tints the whole tile so stock state reads at a glance. */
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

  const bg =
    tone === 'success'
      ? theme.successSoft
      : tone === 'warning'
        ? theme.warningSoft
        : tone === 'error'
          ? theme.errorSoft
          : theme.surfaceSecondary;

  return (
    <View style={[styles.statTile, { backgroundColor: bg, borderColor: color + '33' }]}>
      <ThemedText type="overline" themeColor="textTertiary">
        {label}
      </ThemedText>
      <ThemedText type="h3" style={{ color }}>
        {value}
      </ThemedText>
    </View>
  );
}

/** True when the MRP is a genuine discount over the selling price. */
function hasDiscount(product: ProductWithImages): boolean {
  return product.mrp !== product.selling_price && product.mrp > product.selling_price;
}

/** Rounded whole-percent saving of a discounted product (0 when none). */
function savePercent(product: ProductWithImages): number {
  if (!hasDiscount(product) || product.mrp <= 0) return 0;
  return Math.round(((product.mrp - product.selling_price) / product.mrp) * 100);
}

/** Tone banner above the card: the match outcome at a glance. */
function MatchBanner({
  icon,
  title,
  tone,
  similarity,
}: {
  icon: 'checkmark-circle' | 'person';
  title: string;
  tone: 'success' | 'warning';
  similarity: number | null;
}) {
  const theme = useTheme();
  const color = tone === 'success' ? theme.success : theme.warning;

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      style={[styles.matchBanner, { backgroundColor: tone === 'success' ? theme.successSoft : theme.warningSoft }]}>
      <View style={[styles.matchBannerIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={18} color={theme.white} />
      </View>
      <ThemedText type="body" style={{ color }}>
        {title}
      </ThemedText>
      {similarity !== null && (
        <ThemedText type="smallBold" style={{ color, marginLeft: 'auto' }}>
          {confidencePercent(similarity)} match
        </ThemedText>
      )}
    </Animated.View>
  );
}

/**
 * Product image area: photo (or letter-tile fallback) with the savings
 * badge and zoom affordance overlaid. Extraction target — the media
 * branch is independent from pricing/stats logic.
 */
function ProductMedia({
  productName,
  imageUrl,
  hasDiscount: discounted,
  savePercent: percentOff,
  onOpenViewer,
}: {
  productName: string;
  imageUrl: string | null;
  hasDiscount: boolean;
  savePercent: number;
  onOpenViewer: () => void;
}) {
  const theme = useTheme();

  return (
    <View>
      {imageUrl ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`View full image of ${productName}`}
          onPress={onOpenViewer}>
          <Image source={{ uri: imageUrl }} style={styles.productImage} />
        </Pressable>
      ) : (
        <View style={[styles.productImage, styles.imageFallback, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="display" style={{ color: theme.accent }}>
            {productName.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
      )}

      {/* Savings badge overlays the image, Flipkart-style. */}
      {discounted && percentOff > 0 && (
        <View style={styles.saveBadge}>
          <ThemedText type="caption" style={styles.saveBadgeText}>
            {percentOff}% OFF
          </ThemedText>
        </View>
      )}

      {/* Zoom affordance so users know the image opens full-screen. */}
      {imageUrl && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View full image"
          onPress={onOpenViewer}
          style={styles.expandHint}>
          <Icon name="expand" size={14} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Flipkart-style inline price row: hero selling price, struck MRP, and
 * the saving percent. Always the live DB value — the AI never prices.
 */
function PriceBlock({ product }: { product: ProductWithImages }) {
  const theme = useTheme();
  const discounted = hasDiscount(product);
  const percentOff = savePercent(product);

  return (
    <View style={styles.priceSection}>
      <View style={styles.priceBlock}>
        <PriceText variant="hero">{formatPriceWithUnit(product.selling_price, product.unit)}</PriceText>
        {discounted && (
          <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.mrpValue}>
            {formatPrice(product.mrp)}
          </ThemedText>
        )}
        {discounted && percentOff > 0 && (
          <ThemedText type="smallBold" style={{ color: theme.success }}>
            {percentOff}% off
          </ThemedText>
        )}
      </View>
      <ThemedText type="caption" themeColor="textTertiary">
        Selling price · incl. of all taxes
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
  const [viewerOpen, setViewerOpen] = useState(false);

  const firstImage = getProductImageUrl(product.product_images[0]?.image_url);
  const stockLabel = sharedStockLabel(product.stock, { withCount: true });

  const openViewer = () => setViewerOpen(true);

  return (
    <View style={styles.stack}>
      <MatchBanner
        icon={headerIcon}
        title={headerTitle}
        tone={headerTone}
        similarity={similarity}
      />

      {/* Product card — e-commerce product-page layout. */}
      <Animated.View
        entering={FadeInDown.duration(300).delay(70)}
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          Shadows.sm,
        ]}>
        <ProductMedia
          productName={product.name}
          imageUrl={firstImage}
          hasDiscount={hasDiscount(product)}
          savePercent={savePercent(product)}
          onOpenViewer={openViewer}
        />

        <View style={styles.cardBody}>
          {/* Name + unit */}
          <ThemedText type="h2">{product.name}</ThemedText>
          <ThemedText type="caption" themeColor="textTertiary">
            {unitLabel(product.unit)}
          </ThemedText>

          <PriceBlock product={product} />

          {/* Stock + Match stats (Match hidden for manual picks) */}
          <View style={styles.statRow}>
            <View style={styles.statFlex}>
              <StatTile
                label="Stock"
                value={stockLabel}
                tone={stockTone(product.stock) === 'success' ? undefined : stockTone(product.stock)}
              />
            </View>
            {similarity !== null && (
              <View style={styles.statFlex}>
                <StatTile label="Match" value={confidencePercent(similarity)} tone="success" />
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <ImageViewer
        visible={viewerOpen}
        images={[{ url: firstImage }]}
        caption={product.name}
        onClose={() => setViewerOpen(false)}
      />
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
  const firstImage = getProductImageUrl(candidate.product.product_images[0]?.image_url);

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
        {/* Similarity bar — length reads faster than a % label alone. */}
        <View style={[styles.similarityTrack, { backgroundColor: theme.surfaceSecondary }]}>
          <View
            style={[
              styles.similarityFill,
              {
                width: `${Math.round(candidate.similarity * 100)}%`,
                backgroundColor: candidate.similarity >= 0.75 ? theme.warning : theme.accent,
              },
            ]}
          />
        </View>
        <ThemedText type="caption" themeColor="textTertiary">
          {confidencePercent(candidate.similarity)} similar
        </ThemedText>
      </View>

      <Button
        title={selected ? 'Selected ✓' : 'Select'}
        size="sm"
        variant={selected ? 'secondary' : 'primary'}
        onPress={onSelect}
        disabled={selected}
        accessibilityLabel={`Select ${candidate.product.name}, ${confidencePercent(candidate.similarity)} similar`}
      />
    </View>
  );
}

/**
 * Header chrome for the match card, by how the product was chosen.
 * A picked-from-list product is user-confirmed (warning tone); a direct
 * high-confidence hit is the system's find (success tone).
 */
function cardHeader(selected: boolean, manual: boolean) {
  if (selected || manual) {
    return { icon: 'person' as const, title: 'You selected', tone: 'warning' as const };
  }
  return { icon: 'checkmark-circle' as const, title: 'Product Found ✓', tone: 'success' as const };
}

/**
 * Derived presentation state for the result screen: which decision the
 * backend made, which product the card shows (manual pick > selected
 * candidate > top match), and which panel should render. Pure derivation
 * extracted from the component body — no side effects, no hooks besides
 * being called unconditionally from the screen.
 */
function useResultPresentation(
  visual: ReturnType<typeof matchSession.getResult>,
  manualProduct: ProductWithImages | null,
  selected: MatchCandidateView | null,
) {
  const outcome = visual?.outcome ?? null;

  // Decision uses the threshold the BACKEND used, so server-side tuning
  // changes behavior with no app update. A below-threshold 'identified'
  // still renders as ambiguous — the confidence invariant holds either way.
  const decision = outcome ? analyzeMatchOutcome(outcome, outcome.threshold) : null;

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

  return {
    outcome,
    photo: visual?.photo ?? null,
    shownCandidate,
    isAmbiguous: decision?.kind === 'ambiguous' && !selected && !!outcome,
    isNoMatch: decision?.kind === 'none',
    selectedId: selected?.product.id ?? null,
  };
}

/**
 * Low-confidence panel: "Not completely sure" explanation, ranked
 * candidate rows, and the manual-search fallback. Candidates are a small
 * server-limited set — mapped rows in a plain View, intentionally not a
 * separate virtualized list inside the screen's ScrollView.
 */
function AmbiguousCandidates({
  outcome,
  selectedId,
  onSelect,
  onSearchManually,
}: {
  outcome: VisualMatchOutcome;
  selectedId: string | null;
  onSelect: (candidate: MatchCandidateView) => void;
  onSearchManually: () => void;
}) {
  const theme = useTheme();

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.stack}>
      <View style={styles.headerRow}>
        <Icon name="help-circle" size={22} color={theme.warning} />
        <ThemedText type="h3">Not completely sure</ThemedText>
      </View>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Best confidence was {confidencePercent(outcome.confidence)}, below the{' '}
        {confidencePercent(outcome.threshold)} threshold. Select the right product below — its
        current price is shown after you pick.
      </ThemedText>
      <View style={styles.candidateList}>
        {outcome.candidates.map((candidate) => (
          <CandidateRow
            key={candidate.product.id}
            candidate={candidate}
            selected={selectedId === candidate.product.id}
            onSelect={() => onSelect(candidate)}
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
        <Button title="Search Manually" size="sm" onPress={onSearchManually} />
      </View>
    </Animated.View>
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
  const { outcome, photo, shownCandidate, isAmbiguous, isNoMatch, selectedId } =
    useResultPresentation(visual, manualProduct, selected);

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

  const header = cardHeader(!!selected, !!manualProduct);

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
                headerIcon={header.icon}
                headerTitle={header.title}
                headerTone={header.tone}
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
            <AmbiguousCandidates
              outcome={outcome}
              selectedId={selectedId}
              onSelect={setSelected}
              onSearchManually={handleSearchManually}
            />
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
  expandHint: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: 'rgba(100,116,139,0.12)',
    objectFit: 'cover',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBadge: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(2,6,23,0.72)',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  saveBadgeText: {
    color: '#FFFFFF', // always-on dark scrim — theme-independent by design
    letterSpacing: 0.4,
  },
  cardBody: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  priceSection: {
    gap: Spacing.one,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  mrpValue: {
    textDecorationLine: 'line-through',
  },
  priceValue: {
    // Size/weight/tracking now come from the PriceText hero variant.
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
    borderWidth: 1,
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
    gap: Spacing.half,
  },
  similarityTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  similarityFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  matchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  matchBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
