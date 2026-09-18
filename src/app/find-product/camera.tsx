import { PlaceholderScreen } from '@/components/navigation/placeholder-screen';
import { useRouter } from 'expo-router';

/** Camera step of the scan-to-price flow (scaffold — no AI/camera yet). */
export default function FindProductCameraScreen() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      icon="camera"
      title="Camera"
      description="Point the camera at a product to capture it. The live camera feed arrives with the AI layer."
      badgeLabel="Step 1 · Capture"
      actions={[
        { label: 'Continue to Preview', onPress: () => router.push('/find-product/preview') },
        { label: 'Cancel', onPress: () => router.back(), variant: 'secondary' },
      ]}
    />
  );
}
