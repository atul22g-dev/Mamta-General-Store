import { PlaceholderScreen } from '@/components/navigation/placeholder-screen';
import { useRouter } from 'expo-router';

/** Image preview step of the scan-to-price flow (scaffold). */
export default function FindProductPreviewScreen() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      icon="image"
      title="Preview"
      description="Review the captured photo before searching the catalog. Image handling lands with the backend layer."
      badgeLabel="Step 2 · Review"
      actions={[
        { label: 'Start Searching', onPress: () => router.push('/find-product/searching') },
        { label: 'Retake', onPress: () => router.back(), variant: 'secondary' },
      ]}
    />
  );
}
