import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Icon } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';

export type PickedImage = {
  /**
   * Stable per-image identity. Real images (already in Storage, edit mode)
   * use the database row id; fresh picks get a generated id. React keys
   * derive from this — NEVER the array index, which reassigns state across
   * the wrong tiles when a middle image is removed.
   */
  id: string;
  /** Local file/content URI for preview + upload. */
  uri: string;
  /**
   * Public URL when this image already lives in Storage (edit mode).
   * Local picks leave this undefined so the save step can tell them apart.
   */
  url?: string;
};

/** Fresh picks have no database row yet — mint a unique id at pick time. */
function newPickedImageId(): string {
  return `picked-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

type ProductImagePickerProps = {
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const MAX_IMAGES_DEFAULT = 6;

/**
 * Product image picker: device camera capture and gallery selection with
 * inline previews and removal. Pure selection UI — uploading happens in
 * the product service when the form is saved.
 */
export function ProductImagePicker({
  images,
  onChange,
  maxImages = MAX_IMAGES_DEFAULT,
  disabled = false,
  style,
}: ProductImagePickerProps) {
  const theme = useTheme();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const atCapacity = images.length >= maxImages;

  const ensureCameraPermission = async () => {
    const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
    if (granted) return true;
    setPermissionDenied(true);
    if (!canAskAgain) {
      alert('Camera unavailable', 'Camera permission was permanently denied in settings.');
    }
    return false;
  };

  const ensureLibraryPermission = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (granted) return true;
    setPermissionDenied(true);
    return false;
  };

  const takePhoto = async () => {
    if (disabled || atCapacity) return;
    if (!(await ensureCameraPermission())) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onChange([...images, { id: newPickedImageId(), uri: result.assets[0].uri }]);
      setPermissionDenied(false);
    }
  };

  const pickFromGallery = async () => {
    if (disabled || atCapacity) return;
    if (!(await ensureLibraryPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      selectionLimit: maxImages - images.length,
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      onChange([
        ...images,
        ...result.assets.map((asset) => ({ id: newPickedImageId(), uri: asset.uri })),
      ]);
      setPermissionDenied(false);
    }
  };

  /** Remove by stable id — index-based removal would shift with reordering. */
  const removeImage = (imageId: string) => {
    if (disabled) return;
    onChange(images.filter((image) => image.id !== imageId));
  };

  const showActions = !disabled && !atCapacity;

  return (
    <View style={style}>
      {images.length > 0 && (
        <View style={styles.previewRow}>
          {images.map((image) => (
            <View key={image.id} style={styles.previewTile}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              {!disabled && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove image ${image.id}`}
                  onPress={() => removeImage(image.id)}
                  style={({ pressed }) => [
                    styles.removeButton,
                    { backgroundColor: theme.error },
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="close" size={12} color={theme.white} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {showActions && (
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo with camera"
            onPress={() => void takePhoto()}
            style={({ pressed }) => [
              styles.sourceButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Icon name="camera" size={18} color={theme.accent} />
            <ThemedText type="caption" themeColor="textSecondary">
              Camera
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            onPress={() => void pickFromGallery()}
            style={({ pressed }) => [
              styles.sourceButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Icon name="images" size={18} color={theme.accent} />
            <ThemedText type="caption" themeColor="textSecondary">
              Gallery
            </ThemedText>
          </Pressable>
        </View>
      )}

      {atCapacity && !disabled && (
        <ThemedText type="caption" themeColor="textTertiary">
          Maximum of {maxImages} images.
        </ThemedText>
      )}
      {permissionDenied && (
        <ThemedText type="caption" style={{ color: theme.warning }}>
          Permission needed — enable camera/photos access for this app.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  previewTile: {
    width: 84,
    height: 84,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(100,116,139,0.15)',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.75,
  },
});
