import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/components/common/icon';
import { ThemedText } from '@/components/common/themed-text';
import { Spacing, Radius, MinTouchTarget } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

export type ImageViewerImage = {
  /** Resolved remote URL. */
  url: string | null;
};

type ImageViewerProps = {
  visible: boolean;
  /** One entry per image; multiple images render a swipeable carousel. */
  images: ImageViewerImage[];
  /** Index to open at (defaults to 0). */
  initialIndex?: number;
  /** Optional caption (e.g. product name) shown under the counter. */
  caption?: string;
  onClose: () => void;
};

/**
 * Full-screen image viewer, Amazon/Flipkart style: black scrim,
 * horizontally swipeable full images, an "n / total" counter, and a close
 * button. Tap the backdrop to dismiss; Android back button works too
 * (Modal onRequestClose). Used by product galleries and result cards.
 *
 * The inner content lives in its own component so each `visible → true`
 * mounts it fresh: load state resets without effects and the FadeIn
 * animation plays on every open.
 */
export function ImageViewer({
  visible,
  images,
  initialIndex = 0,
  caption,
  onClose,
}: ImageViewerProps) {
  if (!visible || images.length === 0) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <ViewerContent
        images={images}
        initialIndex={Math.min(Math.max(initialIndex, 0), images.length - 1)}
        caption={caption}
        onClose={onClose}
      />
    </Modal>
  );
}

function ViewerContent({
  images,
  initialIndex,
  caption,
  onClose,
}: {
  images: ImageViewerImage[];
  initialIndex: number;
  caption?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<Animated.FlatList<ImageViewerImage> | null>(null);
  const [index, setIndex] = useState(initialIndex);
  /** Measured size of the image area — drives exact item sizing. */
  const [area, setArea] = useState({ width: windowWidth, height: 0 });
  /** Per-image load state: 'loading' | 'loaded' | 'error'. */
  const [loadState, setLoadState] = useState<Record<number, 'loading' | 'loaded' | 'error'>>(() =>
    Object.fromEntries(images.map((_, i) => [i, 'loading' as const])),
  );

  const onMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
    setIndex((current) => (current === next ? current : next));
  }, []);

  const onAreaLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((current) => (current.width === width && current.height === height ? current : { width, height }));
  }, []);

  return (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close full image">
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.fill}>
        {/* Swipeable full images — contain-fit, nothing cropped. */}
        <Pressable style={styles.imageArea} onLayout={onAreaLayout} onPress={undefined}>
          <Animated.FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            onScrollToIndexFailed={() => undefined}
            getItemLayout={(_, i) => ({ length: area.width, offset: area.width * i, index: i })}
            renderItem={({ item, index: i }) => {
              const state = loadState[i] ?? 'loading';
              return (
                  /* Numeric size is essential: percentage width inside a
                     horizontal FlatList resolves against an auto-sized
                     content container and collapses to 0 (invisible images).
                     Both dimensions come from the measured flexed area. */
                <View style={[styles.swipeItem, { width: area.width, height: area.height }]}>
                  {item.url && state !== 'error' ? (
                    <Image
                      source={{ uri: item.url }}
                      style={styles.image}
                      resizeMode="contain"
                      onLoad={() => setLoadState((s) => ({ ...s, [i]: 'loaded' }))}
                      onError={() => setLoadState((s) => ({ ...s, [i]: 'error' }))}
                      accessibilityRole="image"
                      accessibilityLabel={caption ? `Full image ${i + 1} of ${images.length}` : 'Full image'}
                    />
                  ) : (
                    <View style={styles.unavailable}>
                      <Icon
                        name={state === 'error' ? 'alert-circle' : 'image'}
                        size={40}
                        color={theme.textTertiary}
                      />
                      <ThemedText type="caption" themeColor="textTertiary">
                        {state === 'error' ? "Couldn't load the image." : 'No image'}
                      </ThemedText>
                    </View>
                  )}
                  {state === 'loading' && item.url && (
                    <View style={[styles.loader, styles.pointerNone]}>
                      <ActivityIndicator />
                    </View>
                  )}
                </View>
              );
            }}
          />
        </Pressable>

        {/* Caption + counter (Flipkart-style "1 / 3"). */}
        <View style={[styles.footer, styles.pointerNone]}>
          {caption ? (
            <ThemedText type="bodySmall" style={styles.caption} numberOfLines={1}>
              {caption}
            </ThemedText>
          ) : null}
          {images.length > 1 && (
            <ThemedText type="caption" style={styles.counter}>
              {index + 1} / {images.length}
            </ThemedText>
          )}
        </View>

        {/* Left / right arrows (non-touch affordance, hidden at edges). */}
        {images.length > 1 && (
          <>
            {index > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous image"
                onPress={() => listRef.current?.scrollToIndex({ index: index - 1, animated: true })}
                hitSlop={8}
                style={({ pressed }: { pressed: boolean }) => [styles.arrow, styles.arrowLeft, pressed && styles.pressed]}>
                <Icon name="chevron-back" size={22} color="#FFFFFF" />
              </Pressable>
            )}
            {index < images.length - 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next image"
                onPress={() => listRef.current?.scrollToIndex({ index: index + 1, animated: true })}
                hitSlop={8}
                style={({ pressed }: { pressed: boolean }) => [styles.arrow, styles.arrowRight, pressed && styles.pressed]}>
                <Icon name="chevron-forward" size={22} color="#FFFFFF" />
              </Pressable>
            )}
          </>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }: { pressed: boolean }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  fill: {
    flex: 1,
  },
  imageArea: {
    flex: 1,
  },
  swipeItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  caption: {
    color: 'rgba(255,255,255,0.85)',
  },
  counter: {
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: Spacing.two,
  },
  arrowRight: {
    right: Spacing.two,
  },
  close: {
    position: 'absolute',
    top: Spacing.four,
    right: Spacing.four,
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  pointerNone: {
    pointerEvents: 'none',
  } as const,
});
