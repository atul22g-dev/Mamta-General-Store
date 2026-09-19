import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  ProductForm,
  type ValidProductSubmit,
} from '@/components/products/product-form';
import {
  createProduct,
  uploadProductImage,
} from '@/lib/products/product-service';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Add Product screen. Thin shell around the shared ProductForm —
 * all Supabase work happens in the product service.
 */
export default function AdminAddProductScreen() {
  const router = useRouter();

  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  // Guards against double-submission across the async success beat.
  const inFlightRef = useRef(false);

  const submitting = status === 'submitting';

  const handleSubmit = async (payload: ValidProductSubmit) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setStatus('submitting');
    setSubmitError(null);
    setImageWarning(null);

    // 1. Create the product row.
    const created = await createProduct({
      name: payload.name,
      description: payload.description || null,
      category: payload.category,
      mrp: payload.mrp,
      selling_price: payload.sellingPrice,
      stock: payload.stock,
      unit: payload.unit,
    });

    if (!created.ok) {
      inFlightRef.current = false;
      setStatus('error');
      setSubmitError(created.error);
      return;
    }

    // 2. Upload images (best effort — a failed image must not lose the product).
    const failures: string[] = [];
    for (const image of payload.images) {
      if (image.url !== undefined) continue; // already stored
      const upload = await uploadProductImage(created.data.id, image.uri);
      if (!upload.ok) failures.push(upload.error);
    }

    if (failures.length > 0) {
      setImageWarning(
        `Product saved, but ${failures.length} image${failures.length > 1 ? 's' : ''} failed to upload. You can edit the product to retry.`,
      );
    }

    // 3. Success feedback, then on to the product list (replace so back
    //    doesn't return to the form).
    setStatus('success');
    setTimeout(() => {
      inFlightRef.current = false;
      router.replace('/admin/products');
    }, failures.length > 0 ? 1400 : 650);
  };

  return (
    <ProductForm
      mode="create"
      submitting={submitting}
      submitError={submitError}
      successMessage={
        status === 'success'
          ? (imageWarning ?? 'Product saved ✓')
          : null
      }
      onSubmit={(payload) => void handleSubmit(payload)}
      onCancel={() => router.back()}
    />
  );
}
