import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { alert } from '@/lib/alert';
import { scanSession } from '@/lib/scan-session';

/**
 * Shared "pick one photo from the gallery and hand it to the scan flow"
 * logic, used by both the find-product home screen and the camera screen.
 *
 * Deliberately NO try/finally: React Compiler cannot lower a TryStatement
 * with a finalizer yet, and the finally would opt the whole host component
 * out of automatic memoization. The busy flag is instead mirrored on every
 * exit path — same guarantee, compiler-friendly shape.
 *
 * Pipeline (single matching path): scanSession.setShot(uri) → /preview.
 */
export function useGalleryPick() {
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  const pickFromGallery = useCallback(async () => {
    if (picking) return; // guard against double taps
    setPicking(true);

    let uri: string | null = null;
    let failed = false;

    const { granted, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      alert(
        'Photo library permission needed',
        canAskAgain
          ? 'Allow photo access so you can pick a product picture from your gallery.'
          : 'Photo access was permanently denied. Enable it in Settings → Permissions, then try again.',
      );
      setPicking(false);
      return; // user denial is not a picker error — stay on screen
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // JPG / JPEG / PNG / platform-supported HEIC
        quality: 0.8, // matches the camera capture quality
        selectionLimit: 1,
        allowsMultipleSelection: false,
      });

      // Normal cancellation: silently stay on this screen.
      if (!result.canceled) uri = result.assets[0]?.uri ?? null;
    } catch {
      // Picker crash / platform error: tell the user, stay functional.
      failed = true;
    }

    if (failed) {
      alert('Could not open the gallery', 'Please try again.');
      setPicking(false);
      return;
    }

    if (!uri) {
      setPicking(false);
      return;
    }

    // Same handoff the camera shutter uses — the preview step is
    // source-agnostic and no second matching path is created.
    scanSession.setShot(uri);
    setPicking(false);
    router.push('/find-product/preview');
  }, [picking, router]);

  return { picking, pickFromGallery };
}
