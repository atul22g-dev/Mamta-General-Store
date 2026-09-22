import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';

/**
 * One product image slot for every surface that renders a product photo
 * (admin rows, catalog cards, manual-search rows, the admin detail gallery).
 *
 * Why it exists: `<Image source={{ uri }} />` renders an EMPTY BOX when the
 * URL 404s — a product whose image row survived but whose Storage object is
 * gone (deleted/renamed object, a row inserted before the upload succeeded)
 * looked broken rather than "no picture yet". Every product surface had its
 * own copy of the letter fallback, and none of them handled a load failure.
 * This component owns both cases:
 *   no URL      → letter tile
 *   load error  → letter tile (never a blank hole)
 */
export function ProductThumb({
  imageUrl,
  name,
  size,
  radius,
  textType = 'h3',
  style,
}: {
  /** Raw `product_images.image_url` (either a full URL or a bucket path). */
  imageUrl: string | null | undefined;
  /** Product name — its first letter labels the fallback tile. */
  name: string;
  /**
   * Square edge length in px. Omit it for surfaces whose dimensions come from
   * `style` instead (the full-width hero slide, which is fluid/percentage).
   */
  size?: number;
  /** Corner radius (defaults to Radius.md, matching the old tiles). */
  radius?: number;
  /** Typography for the fallback letter. */
  textType?: 'h3' | 'bodySmall' | 'display';
  /** Sizing/appearance; applied last, so it overrides the size defaults. */
  style?: StyleProp<ViewStyle & ImageStyle>;
}) {
  const theme = useTheme();
  const uri = getProductImageUrl(imageUrl);

  // Track WHICH uri failed instead of a boolean, so a reused instance whose
  // uri changes (a re-render with different data) retries the new image
  // instead of staying stuck on the previous failure.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const showImage = uri !== null && failedUri !== uri;
  // Only the square callers pin an explicit size; fluid ones bring their own
  // dimensions through `style`, and a numeric override would break their
  // percentage width (or fight their aspect ratio).
  const box = {
    ...(size === undefined ? null : { width: size, height: size }),
    borderRadius: radius ?? Radius.md,
  };

  if (!showImage) {
    return (
      <View
        style={[
          styles.thumb,
          { ...box, backgroundColor: theme.accentSoft },
          style,
        ]}>
        <ThemedText type={textType} style={{ color: theme.accent }}>
          {name.charAt(0).toUpperCase() || '?'}
        </ThemedText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setFailedUri(uri)}
      // Themed placeholder behind the image: while it loads (and behind the
      // transparent parts of a PNG) the slot still reads as an image area
      // instead of a light-grey patch on a dark card.
      style={[
        styles.thumb,
        { ...box, backgroundColor: theme.surfaceSecondary },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  thumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
