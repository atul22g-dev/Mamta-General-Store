/**
 * Find Product Result Screen
 *
 * The one screen the whole app exists to reach: it answers "what is this,
 * and what does it cost?" with a single, unmistakable block.
 *
 * Design principles
 * - ONE hero: the matched product owns the screen (photo, name, price), so
 *   the answer is readable at arm's length in a shop.
 * - Prices come from the database ONLY. The visual-match layer identifies a
 *   product; it never invents a price. A manual catalog pick shows no
 *   percentage at all, because no photo comparison happened.
 * - Theme tokens everywhere: every surface, badge and divider resolves from
 *   the palette, so the screen is equally legible in light and dark mode.
 * - Motion is one entrance on the hero, and it is skipped entirely when the
 *   device asks for reduced motion.
 *
 * Structure: each render branch is its own component (the screen body is a
 * flat list of decisions), and the precedence between them lives in
 * resolveResultView.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { ImageViewer } from '@/components/ui/image-viewer';
import { PriceText } from '@/components/ui/price-text';
import { ProductThumb } from '@/components/products/product-thumb';
import { MaxContentWidth, Motion, Radius, Shadows, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, formatPriceWithUnit } from '@/lib/format';
import type { ProductWithImages } from '@/lib/products/product-service';
import {
  CATEGORY_LABELS,
  UNIT_LABELS,
  type ProductCategory,
  type ProductUnit,
} from '@/lib/products/product-validation';
import { stockLabel, stockTone } from '@/lib/stock';
import type { MatchCandidateView } from '@/lib/visual-match/client';
import type { VisualMatchOutcome } from '@/lib/visual-match/types-client';
import { analyzeMatchOutcome } from '@/lib/visual-match/decision';
import { matchSession } from '@/lib/scan-session';
import { MAIN_MATCH_THRESHOLD, MAX_SIMILAR_PRODUCTS } from '@/lib/visual-match/thresholds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidencePercent(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit as ProductUnit] ?? unit;
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ProductCategory] ?? category;
}

function toNum(v: unknown): number {
  return typeof v === 'string' ? Number(v) : (v as number);
}

function hasDiscount(product: ProductWithImages): boolean {
  const mrp = toNum(product.mrp);
  const sp = toNum(product.selling_price);
  return mrp !== sp && mrp > sp;
}

function savePercent(product: ProductWithImages): number {
  const mrp = toNum(product.mrp);
  const sp = toNum(product.selling_price);
  if (!hasDiscount(product) || mrp <= 0) return 0;
  return Math.round(((mrp - sp) / mrp) * 100);
}

type ThemeTokens = ReturnType<typeof useTheme>;

type MatchTier = { label: string; color: string };

/**
 * Turns a raw score into words a shopkeeper uses. The bands are anchored to
 * the SHIPPED threshold rather than a second copy of it: anything the app is
 * willing to call "identified" is at least a strong match, and the extra
 * distance to a near-perfect score is what earns "exact".
 */
function matchTier(similarity: number, theme: ThemeTokens): MatchTier {
  if (similarity >= 0.9) return { label: 'Exact match', color: theme.success };
  if (similarity >= MAIN_MATCH_THRESHOLD) return { label: 'Strong match', color: theme.accent };
  return { label: 'Close match', color: theme.warning };
}

/** Badge tone for a similar-product score — same bands, badge vocabulary. */
function scoreBadgeVariant(similarity: number): 'success' | 'warning' | 'neutral' {
  if (similarity >= 0.9) return 'success';
  if (similarity >= MAIN_MATCH_THRESHOLD) return 'warning';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// The customer's own photo
// ---------------------------------------------------------------------------

/**
 * The photo this result came from. A small round thumbnail keeps the customer
 * oriented ("this is what I showed you") without competing with the hero —
 * on the not-found screen it is bigger, because there it is the subject.
 */
function YourPhoto({
  uri,
  label,
  size = 40,
}: {
  uri: string | null | undefined;
  label: string;
  size?: number;
}) {
  const theme = useTheme();

  if (!uri) {
    return (
      <View style={styles.captionRow}>
        <Icon name="search" size={14} color={theme.textTertiary} />
        <ThemedText type="caption" themeColor="textTertiary">
          {label}
        </ThemedText>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(Motion.base)} style={styles.photoChipRow}>
      <Image
        source={{ uri }}
        style={[
          styles.photoChip,
          { width: size, height: size, borderRadius: size / 2, borderColor: theme.border },
        ]}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.photoChipText}>
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Match strength meter
// ---------------------------------------------------------------------------

/**
 * How well the photo and the catalogue image agreed — as a labelled bar.
 * A bare "100% match" reads as a promise; "Match strength · exact" plus a
 * nearly-full bar reads as evidence, which is what it actually is.
 */
function MatchMeter({ similarity }: { similarity: number }) {
  const theme = useTheme();
  const tier = matchTier(similarity, theme);
  const percent = Math.round(Math.max(0, Math.min(1, similarity)) * 100);

  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterLabels}>
        <ThemedText type="caption" themeColor="textTertiary">
          Match strength
        </ThemedText>
        <ThemedText type="caption" style={{ color: tier.color }}>
          {percent}% · {tier.label}
        </ThemedText>
      </View>
      <View
        style={[styles.meterTrack, { backgroundColor: theme.surfaceSecondary }]}
        accessibilityRole="progressbar"
        accessibilityLabel={`Match strength ${percent} percent`}>
        <View style={[styles.meterFill, { width: `${percent}%`, backgroundColor: tier.color }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main match card — the hero
// ---------------------------------------------------------------------------

function MainMatchCard({
  product,
  similarity,
  scored,
}: {
  product: ProductWithImages;
  similarity: number;
  /** False for a manual catalog pick: no comparison happened, so no score. */
  scored: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [viewerOpen, setViewerOpen] = useState(false);

  const firstImage = product.product_images[0]?.image_url;
  const discounted = hasDiscount(product);
  const percentOff = savePercent(product);
  const tier = matchTier(similarity, theme);
  const stockToneValue = stockTone(product.stock);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(Motion.slow)}
      style={[
        styles.heroCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.xl,
      ]}>
      {/* Photo — tappable to view full size */}
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`View full image of ${product.name}`}
        onPress={() => setViewerOpen(true)}
        style={({ pressed }) => [pressed && styles.photoPressed]}>
        <ProductThumb
          imageUrl={firstImage}
          name={product.name}
          radius={0}
          textType="display"
          style={styles.heroImage}
        />

        {/* Score pill on the photo: a dark scrim + white label stays legible
            over ANY product photo, which a tinted pill cannot promise. */}
        {scored && (
          <View style={[styles.heroScore, { backgroundColor: theme.scrim }]}>
            <Icon name="checkmark-circle" size={15} color={tier.color} />
            <ThemedText type="caption" style={{ color: theme.white }}>
              {confidencePercent(similarity)} match
            </ThemedText>
          </View>
        )}

        {discounted && (
          <View style={[styles.heroRibbon, { backgroundColor: theme.error }]}>
            <ThemedText type="caption" style={{ color: theme.white }}>
              {percentOff}% OFF
            </ThemedText>
          </View>
        )}
      </Pressable>

      {/* Facts — name, classification, price */}
      <View style={styles.heroInfo}>
        <ThemedText type="h2" style={styles.productName} accessibilityRole="header">
          {product.name}
        </ThemedText>

        <View style={styles.chipRow}>
          <Badge label={categoryLabel(product.category)} variant="accent" size="sm" />
          <Badge label={unitLabel(product.unit)} variant="neutral" size="sm" />
          {product.brand ? <Badge label={product.brand} variant="neutral" size="sm" /> : null}
          <Badge
            label={stockLabel(product.stock, { withCount: true })}
            variant={stockToneValue}
            size="sm"
            dot
          />
        </View>

        <View style={styles.priceBlock}>
          <PriceText variant="hero">{formatPriceWithUnit(product.selling_price, product.unit)}</PriceText>
          {discounted && (
            <ThemedText type="bodySmall" themeColor="textTertiary" style={styles.mrpText}>
              MRP {formatPrice(product.mrp)}
            </ThemedText>
          )}
        </View>

        {scored && <MatchMeter similarity={similarity} />}
      </View>

      <ImageViewer
        visible={viewerOpen}
        images={[{ url: firstImage }]}
        caption={product.name}
        onClose={() => setViewerOpen(false)}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Similar Product Card
// ---------------------------------------------------------------------------

function SimilarProductCard({
  candidate,
  onPress,
}: {
  candidate: MatchCandidateView;
  onPress: () => void;
}) {
  const theme = useTheme();
  const product = candidate.product;
  const discounted = hasDiscount(product);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatPriceWithUnit(product.selling_price, product.unit)}, ${confidencePercent(candidate.similarity)} match`}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.similarCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
        Shadows.sm,
        hovered && !pressed && { borderColor: theme.accent },
        pressed && styles.pressed,
      ]}>
      <ProductThumb imageUrl={product.product_images[0]?.image_url} name={product.name} size={72} />

      <View style={styles.similarInfo}>
        <ThemedText type="body" numberOfLines={1}>
          {product.name}
        </ThemedText>
        <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
          {categoryLabel(product.category)}
          {product.brand ? ` · ${product.brand}` : ''}
        </ThemedText>
        <View style={styles.similarPriceRow}>
          <PriceText variant="card">
            {formatPriceWithUnit(product.selling_price, product.unit)}
          </PriceText>
          {discounted && (
            <ThemedText type="caption" themeColor="textTertiary" style={styles.mrpSmall}>
              {formatPrice(product.mrp)}
            </ThemedText>
          )}
        </View>
      </View>

      <Badge
        label={confidencePercent(candidate.similarity)}
        variant={scoreBadgeVariant(candidate.similarity)}
        size="sm"
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Similar Products Section
// ---------------------------------------------------------------------------

function SimilarProductsSection({
  products,
  onSelect,
}: {
  products: MatchCandidateView[];
  onSelect: (product: MatchCandidateView) => void;
}) {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();

  if (products.length === 0) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(Motion.slow).delay(120)}
      style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText type="h3">Closest alternatives</ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          {products.length} candidate{products.length === 1 ? '' : 's'}
        </ThemedText>
      </View>
      <ThemedText type="caption" themeColor="textTertiary">
        Not the item you meant? These looked closest to your photo.
      </ThemedText>
      <View style={styles.similarList}>
        {products.slice(0, MAX_SIMILAR_PRODUCTS).map((candidate) => (
          <SimilarProductCard
            key={candidate.product.id}
            candidate={candidate}
            onPress={() => onSelect(candidate)}
          />
        ))}
      </View>
      {/* Colour is never the only signal: the badge carries a number too. */}
      <View style={styles.legendRow}>
        <Icon name="information-circle-outline" size={13} color={theme.textTertiary} />
        <ThemedText type="caption" themeColor="textTertiary" style={styles.legendText}>
          The percentage is how closely each photo matched yours. Prices always come from the
          store database.
        </ThemedText>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

/** Where the featured product came from — a photo match, or a manual pick. */
type ResultSource = 'match' | 'catalog';

/** The product the screen features, plus the score it was matched at. */
type FeaturedMatch = { product: ProductWithImages; similarity: number; source: ResultSource };

/** Everything the screen needs in order to render. */
type ResultView = {
  featured: FeaturedMatch | null;
  /** Ranked alternates, excluding the featured product. */
  similar: MatchCandidateView[];
  /** The match ran, but nothing in the catalog was close enough. */
  notFound: boolean;
  /** No match has been run yet (the screen was opened directly). */
  noSession: boolean;
};

/**
 * Resolve the screen's state in ONE place.
 *
 * Precedence is the user-facing contract: a manual pick beats a candidate the
 * user tapped, which beats the automatic main match. Pulling it out of the
 * component body keeps that precedence readable on its own and leaves the
 * render code a flat list of decisions.
 */
function resolveResultView(
  outcome: VisualMatchOutcome | null,
  manualProduct: ProductWithImages | null,
  selectedCandidate: MatchCandidateView | null,
): ResultView {
  const decision = outcome ? analyzeMatchOutcome(outcome) : null;

  let featured: FeaturedMatch | null = null;
  if (manualProduct) {
    // Manual search: the real DB price, with no invented similarity score.
    featured = { product: manualProduct, similarity: 0, source: 'catalog' };
  } else if (selectedCandidate) {
    featured = {
      product: selectedCandidate.product,
      similarity: selectedCandidate.similarity,
      source: 'match',
    };
  } else if (decision?.kind === 'single' && outcome?.main_match) {
    featured = {
      product: outcome.main_match.product,
      similarity: outcome.main_match.similarity,
      source: 'match',
    };
  }

  const similar = (outcome?.similar_products ?? []).filter(
    (candidate) => candidate.product.id !== featured?.product.id,
  );

  return {
    featured,
    similar,
    notFound: decision?.kind === 'none' && featured === null,
    noSession: outcome === null && manualProduct === null,
  };
}

// ---------------------------------------------------------------------------
// Result screen pieces (one branch each)
// ---------------------------------------------------------------------------

/** Screen chrome: floating close button + title, identical in every state. */
function ResultHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <IconButton
          icon={<Icon name="close" size={20} color={theme.text} />}
          onPress={onClose}
          accessibilityLabel="Close the result"
          variant="secondary"
          size="sm"
        />
        <ThemedText type="h3" style={styles.headerTitle}>
          {title}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>
    </SafeAreaView>
  );
}

/** Opened with no scan and no manual pick — nothing to show yet. */
function NoResultScreen({ onScan }: { onScan: () => void }) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centerContent}>
          <EmptyState
            title="No result yet"
            description="Take a product photo to get a match, or search the catalog manually."
            icon={<Icon name="camera" size={26} color={theme.accent} />}
            action={<Button title="Scan a product" onPress={onScan} />}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The match ran, but nothing in the catalog was close enough. */
function NotFoundScreen({
  photoUri,
  onClose,
  onSearchManually,
  onScanAgain,
}: {
  photoUri: string | null | undefined;
  onClose: () => void;
  onSearchManually: () => void;
  onScanAgain: () => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <ResultHeader title="No match" onClose={onClose} />

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.notFoundPhoto}>
            <YourPhoto uri={photoUri} label="The photo we searched with" size={96} />
          </View>

          <EmptyState
            title="Product not found"
            description="Nothing in the catalogue matched this photo closely enough. Try searching by name, or take another photo with the product filling the frame."
            icon={<Icon name="search" size={26} color={theme.accent} />}
            action={
              <View style={styles.noMatchActions}>
                <Button title="Search Manually" onPress={onSearchManually} block size="lg" />
                <Button title="Scan Again" variant="secondary" onPress={onScanAgain} block size="lg" />
              </View>
            }
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The two ways out of a result: scan again, or search the catalog by name. */
function ResultActions({
  onScanAgain,
  onSearchManually,
}: {
  onScanAgain: () => void;
  onSearchManually: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.bottomActions}>
      <Button
        title="Scan Another Product"
        onPress={onScanAgain}
        block
        size="lg"
        icon={<Icon name="camera" size={18} color={theme.white} />}
      />
      <Button
        title="Search Manually"
        variant="secondary"
        onPress={onSearchManually}
        block
        size="lg"
        icon={<Icon name="search" size={18} color={theme.text} />}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function FindProductResultScreen() {
  const router = useRouter();

  const visual = matchSession.getResult();
  const manualProduct = matchSession.getManualResult();
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidateView | null>(null);

  const { featured, similar, notFound, noSession } = resolveResultView(
    visual?.outcome ?? null,
    manualProduct,
    selectedCandidate,
  );

  // Handlers
  const handleDone = useCallback(() => {
    matchSession.clear();
    router.dismissTo('/(tabs)');
  }, [router]);

  const handleScanAgain = useCallback(() => {
    matchSession.clear();
    router.replace('/find-product');
  }, [router]);

  const handleSearchManually = useCallback(() => {
    matchSession.clear();
    router.push('/find-product/search');
  }, [router]);

  const handleSelectSimilar = useCallback((candidate: MatchCandidateView) => {
    setSelectedCandidate(candidate);
  }, [setSelectedCandidate]);

  // Empty state (no session data)
  if (noSession) {
    return <NoResultScreen onScan={handleScanAgain} />;
  }

  // No match state
  if (notFound) {
    return (
      <NotFoundScreen
        photoUri={visual?.photo?.uri}
        onClose={handleDone}
        onSearchManually={handleSearchManually}
        onScanAgain={handleScanAgain}
      />
    );
  }

  // Main result view
  return (
    <ThemedView style={styles.container}>
      <ResultHeader title={featured ? 'Product Found' : 'Similar Products'} onClose={handleDone} />

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Where the answer came from */}
          <YourPhoto
            uri={visual?.photo?.uri}
            label={
              featured?.source === 'catalog'
                ? 'Picked from the catalogue'
                : 'Matched from your photo'
            }
          />

          {/* The answer */}
          {featured && (
            <MainMatchCard
              product={featured.product}
              similarity={featured.similarity}
              scored={featured.source === 'match'}
            />
          )}

          {/* Selected candidate actions */}
          {selectedCandidate && featured && (
            <SwitchBackButton onPress={() => setSelectedCandidate(null)} />
          )}

          {/* Similar products */}
          {similar.length > 0 && (
            <SimilarProductsSection products={similar} onSelect={handleSelectSimilar} />
          )}

          {/* Bottom actions */}
          <ResultActions
            onScanAgain={handleScanAgain}
            onSearchManually={handleSearchManually}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Shown once the user taps an alternative: the hero is now that alternative,
 * and this is the way back to the product the photo actually matched.
 */
function SwitchBackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <Button
      title="View original match"
      variant="ghost"
      onPress={onPress}
      style={styles.viewOriginalButton}
      icon={<Icon name="arrow-back" size={16} color={theme.accent} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /**
   * The header must keep its natural height. NOT `flex: 0` — Yoga reads a bare
   * `flex: 0` as `flexBasis: 0%`, which collapses this wrapper to zero height
   * and lets the scroll area render underneath the title. `flexGrow/Shrink: 0`
   * keeps it out of the layout maths without erasing it.
   */
  safeArea: {
    flexGrow: 0,
    flexShrink: 0,
  },
  flex: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },

  // Your photo
  photoChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  photoChip: {
    borderWidth: 1,
  },
  photoChipText: {
    flex: 1,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  notFoundPhoto: {
    alignItems: 'center',
  },

  // Hero card
  heroCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoPressed: {
    opacity: 0.94,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 1,
  },
  heroScore: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  heroRibbon: {
    position: 'absolute',
    right: Spacing.three,
    top: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  heroInfo: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  productName: {
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginTop: Spacing.one,
  },
  mrpText: {
    textDecorationLine: 'line-through',
  },

  // Match meter
  meterBlock: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  meterLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  meterTrack: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  // Similar products
  section: {
    gap: Spacing.two,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  similarList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  similarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  similarInfo: {
    flex: 1,
    gap: 2,
  },
  similarPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    marginTop: 2,
  },
  mrpSmall: {
    textDecorationLine: 'line-through',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  legendText: {
    flex: 1,
  },

  // Actions
  viewOriginalButton: {
    alignSelf: 'center',
  },
  noMatchActions: {
    gap: Spacing.two,
    // EmptyState centres its action slot and sizes it to content, so the
    // buttons need their own width to read as a full-width pair.
    alignSelf: 'stretch',
    minWidth: 264,
  },
  bottomActions: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});
