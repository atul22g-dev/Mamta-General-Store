import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraCapturedPicture, type FlashMode } from 'expo-camera';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useGalleryPick } from '@/hooks/use-gallery-pick';
import { scanSession } from '@/lib/scan-session';
import { validateImageFile } from '@/lib/image-pipeline';

type Phase = 'checking' | 'undetermined' | 'denied' | 'ready';

type PermissionGateProps = {
  phase: Exclude<Phase, 'ready'>;
  onRequestPermission: () => void;
  onOpenSettings: () => void;
  onPickFromGallery: () => void;
  onBack: () => void;
};

/**
 * Pre-camera screens: checking / permission prompt / denied. Extracted
 * from the screen so each phase reads as its own small component and the
 * screen body stays a simple phase switch.
 */
function PermissionGate({ phase, onRequestPermission, onOpenSettings, onPickFromGallery, onBack }: PermissionGateProps) {
  const theme = useTheme();

  if (phase === 'checking') {
    return (
      <View style={styles.center}>
        <ThemedText type="bodySmall" themeColor="textSecondary">
          Checking camera…
        </ThemedText>
      </View>
    );
  }

  if (phase === 'undetermined') {
    return (
      <View style={styles.center}>
        <View style={[styles.permIcon, { backgroundColor: theme.accentSoft }]}>
          <Icon name="camera" size={30} color={theme.accent} />
        </View>
        <ThemedText type="h2">Camera access needed</ThemedText>
        <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.permText}>
          To find a product by photo, allow camera access when prompted. A photo
          is only taken when you press the shutter.
        </ThemedText>
        <Button
          title="Allow camera"
          onPress={onRequestPermission}
          icon={<Icon name="camera" size={18} color={theme.white} />}
        />
        <Button title="Not now" variant="ghost" onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={[styles.permIcon, { backgroundColor: theme.errorSoft }]}>
        <Icon name="lock-closed" size={30} color={theme.error} />
      </View>
      <ThemedText type="h2">Camera unavailable</ThemedText>
      <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.permText}>
        Camera permission was declined. Grant it in Settings to scan
        products — or browse the catalog manually instead.
      </ThemedText>
      <Button
        title="Try again"
        onPress={onRequestPermission}
        icon={<Icon name="refresh" size={18} color={theme.white} />}
      />
      <Button title="Open Settings" variant="secondary" onPress={onOpenSettings} />
      {/* Matching works without the camera — offer the gallery way out. */}
      <Button
        title="Pick from gallery instead"
        variant="ghost"
        onPress={onPickFromGallery}
        icon={<Icon name="images" size={18} color={theme.accent} />}
      />
      <Button title="Back" variant="ghost" onPress={onBack} />
    </View>
  );
}

type CameraReadyProps = {
  cameraRef: React.RefObject<CameraView | null>;
  flash: FlashMode;
  capturing: boolean;
  picking: boolean;
  captureError: string | null;
  onToggleFlash: () => void;
  onCapture: () => void;
  onPickFromGallery: () => void;
  onClose: () => void;
};

/**
 * Live viewfinder: camera preview, framing guide, and the shutter row
 * (gallery roll left, shutter center, symmetry spacer right).
 */
function CameraReady({
  cameraRef,
  flash,
  capturing,
  picking,
  captureError,
  onToggleFlash,
  onCapture,
  onPickFromGallery,
  onClose,
}: CameraReadyProps) {
  const theme = useTheme();

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        mode="picture" />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {/* Top bar: close · hint · flash */}
        <View style={styles.topBar}>
          <IconButton
            icon={<Icon name="close" size={20} color={theme.white} />}
            onPress={onClose}
            accessibilityLabel="Close camera"
            variant="ghost"
          />
          <View style={styles.topBadge}>
            <ThemedText type="caption" style={{ color: theme.white }}>
              Take one product photo
            </ThemedText>
          </View>
          <IconButton
            icon={
              <Icon
                name={flash === 'off' ? 'flash-off' : 'flash'}
                size={20}
                color={flash === 'off' ? theme.white : theme.warning}
              />
            }
            onPress={onToggleFlash}
            accessibilityLabel={flash === 'off' ? 'Turn flash on' : 'Turn flash off'}
            variant="ghost"
          />
        </View>

        {/* Framing guide */}
        <View style={styles.guideArea}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />
          </Animated.View>
          <ThemedText type="caption" style={styles.frameHint}>
            Center the product inside the frame
          </ThemedText>
        </View>

        {/* Bottom: error line + shutter */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.bottomBar}>
          {captureError && (
            <ThemedText type="caption" style={styles.errorText} themeColor="error">
              {captureError}
            </ThemedText>
          )}
          <View style={styles.shutterRow}>
            {/* Gallery roll — standard camera-app placement (left of shutter). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pick image from gallery"
              accessibilityState={{ busy: picking }}
              onPress={onPickFromGallery}
              disabled={picking || capturing}
              style={({ pressed }) => [
                styles.galleryButton,
                { backgroundColor: 'rgba(255,255,255,0.14)' },
                pressed && styles.galleryPressed,
                (picking || capturing) && styles.galleryBusy,
              ]}>
              <Icon name="images" size={22} color={theme.white} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ busy: capturing }}
              onPress={onCapture}
              disabled={capturing}
              style={({ pressed }) => [
                styles.shutterOuter,
                { borderColor: theme.white },
                pressed && styles.shutterPressed,
                capturing && styles.shutterBusy,
              ]}>
              <View style={[styles.shutterInner, { backgroundColor: theme.white }]} />
            </Pressable>

            {/* Symmetry spacer so the shutter stays centered. */}
            <View style={styles.galleryButton} />
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Camera step of the scan-to-price flow. One photo per shutter press —
 * no barcode scanning, no continuous frame analysis.
 *
 * Permission ladder:
 *   checking → undetermined (system prompt) → ready
 *            → denied (clean screen: retry prompt, open Settings, back)
 */
export default function FindProductCameraScreen() {
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Shared gallery-pick hook (same pipeline as the shutter).
  const { picking, pickFromGallery } = useGalleryPick();

  const cameraRef = useRef<CameraView>(null);

  const status = permission?.status;
  const phase: Phase =
    permission === null || status === null
      ? 'checking'
      : status === 'granted'
        ? 'ready'
        : status === 'undetermined'
          ? 'undetermined'
          : 'denied';

  const toggleFlash = useCallback(() => {
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  }, []);

  const handleRequestPermission = useCallback(async () => {
    setCaptureError(null);
    await requestPermission();
  }, [requestPermission]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleCapture = useCallback(async () => {
    if (capturing) return; // double-tap guard — exactly one photo per press
    setCapturing(true);
    setCaptureError(null);

    // Capture failure is handled as a value, not an exception, so there is
    // no try/finally or throw here — shapes the React Compiler cannot
    // lower yet. The busy flag is mirrored on every path below instead.
    let photo: CameraCapturedPicture | null | undefined = null;
    try {
      photo = await cameraRef.current?.takePictureAsync({
        quality: 0.8,
        exif: false,
      });
    } catch {
      photo = null;
    }

    if (!photo?.uri) {
      setCaptureError('Capture failed — try again.');
      setCapturing(false);
      return;
    }

    // Validate the captured image (file exists, size OK, format supported).
    const validation = await validateImageFile(photo.uri);
    if (!validation.ok) {
      setCaptureError(validation.errorMessage);
      setCapturing(false);
      return;
    }

    // Hand the single photo to the next step via the in-memory session
    // (route params would serialize the URI into history).
    scanSession.setShot(photo.uri);
    setCapturing(false);
    router.push('/find-product/preview');
  }, [capturing, router]);

  return (
    <ThemedView style={styles.container}>
      <PermissionGate
        phase={phase === 'ready' ? 'checking' : phase}
        onRequestPermission={() => void handleRequestPermission()}
        onOpenSettings={openSettings}
        onPickFromGallery={() => void pickFromGallery()}
        onBack={() => router.back()}
      />

      {phase === 'ready' && (
        <CameraReady
          cameraRef={cameraRef}
          flash={flash}
          capturing={capturing}
          picking={picking}
          captureError={captureError}
          onToggleFlash={toggleFlash}
          onCapture={() => void handleCapture()}
          onPickFromGallery={() => void pickFromGallery()}
          onClose={() => router.back()}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permText: {
    textAlign: 'center',
    maxWidth: 300,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  topBadge: {
    backgroundColor: 'rgba(2,6,23,0.55)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
  },
  guideArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  frame: {
    width: '100%',
    maxWidth: 300,
    aspectRatio: 3 / 4,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopLeftRadius: Radius.lg,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopRightRadius: Radius.lg,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomLeftRadius: Radius.lg,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomRightRadius: Radius.lg,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  frameHint: {
    marginTop: Spacing.three,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  errorText: {
    textAlign: 'center',
    backgroundColor: 'rgba(2,6,23,0.55)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.six,
  },
  galleryButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  galleryBusy: {
    opacity: 0.5,
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  shutterPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  shutterBusy: {
    opacity: 0.5,
  },
});
