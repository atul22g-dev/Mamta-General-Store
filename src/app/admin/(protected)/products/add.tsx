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
import { generateProductEmbedding } from '@/lib/products/embedding-service';

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
  const [embeddingStatus, setEmbeddingStatus] = useState<string | null>(null);

  // Guards against double-submission across the async success beat.
  const inFlightRef = useRef(false);

  const submitting = status === 'submitting';

  const handleSubmit = async (payload: ValidProductSubmit) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setStatus('submitting');
    setSubmitError(null);
    setImageWarning(null);
    setEmbeddingStatus(null);

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
    //    Each file is an independent upload, so all of them start together
    //    instead of queuing one-by-one; per-item failures are collected so
    //    the product row still saves.
    const pending = payload.images.filter((image) => image.url === undefined); // already-stored images skipped
    const uploads = await Promise.all(
      pending.map((image) => uploadProductImage(created.data.id, image.uri)),
    );
    const failures = uploads.flatMap((upload) => (upload.ok ? [] : [upload.error]));
    const successes = uploads.filter((upload) => upload.ok);

    if (failures.length > 0) {
      setImageWarning(
        `Product saved, but ${failures.length} image${failures.length > 1 ? 's' : ''} failed to upload. You can edit the product to retry.`,
      );
    }

    // 3. Generate embeddings for successfully uploaded images.
    //    This is a FREE operation using MobileCLIP-S0 ONNX inference.
    //    Products without embeddings are NOT searchable by visual match,
    //    so embedding failure is treated as a hard error.
    if (successes.length > 0) {
      setEmbeddingStatus(`Generating embeddings for ${successes.length} image${successes.length > 1 ? 's' : ''}...`);

      const embeddingResult = await generateProductEmbedding(created.data.id);

      if (!embeddingResult.ok) {
        inFlightRef.current = false;
        setStatus('error');
        setSubmitError(
          `Product saved, but embedding generation failed: ${embeddingResult.error} ` +
            `The product is not searchable by image yet. You can edit the product to retry.`,
        );
        return;
      }

      if (embeddingResult.data.failed.length > 0) {
        setImageWarning(
          `Product saved, but ${embeddingResult.data.failed.length} image embedding` +
            `${embeddingResult.data.failed.length > 1 ? 's' : ''} failed. ` +
            `The product may not be fully searchable by image.`,
        );
      }

      if (!embeddingResult.data.hasEmbedding) {
        inFlightRef.current = false;
        setStatus('error');
        setSubmitError(
          'Product saved, but no embeddings were generated. ' +
            'The product is not searchable by image. You can edit the product to retry.',
        );
        return;
      }

      setEmbeddingStatus(null);
    }

    // 4. Success feedback, then on to the product list (replace so back
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
      embeddingStatus={embeddingStatus}
      onSubmit={(payload) => void handleSubmit(payload)}
      onCancel={() => router.back()}
    />
  );
}
