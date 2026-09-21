import { useMemo, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import {
  ProductForm,
  type ValidProductSubmit,
} from '@/components/products/product-form';
import { Loading } from '@/components/ui/loading';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants';
import { useProductDetail } from '@/hooks/use-product-detail';
import {
  updateProduct,
  uploadProductImage,
  removeProductImage,
  getProduct,
} from '@/lib/products/product-service';
import { getProductImageUrl } from '@/lib/products/get-product-image-url';
import { planImageChanges } from '@/lib/products/image-plan';
import type { ProductFormValues } from '@/lib/products/product-validation';
import type { Database } from '@/types/database';
import type { PickedImage } from '@/components/products/product-image-picker';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

/** Maps a loaded product into form values for the shared ProductForm.
 *  Accepts the FULL DB enum types (a product may carry a category/unit that
 *  was later removed from the editable config) and narrows at the call site. */
function toFormValues(product: {
  name: string;
  description: string | null;
  category: Database['public']['Enums']['product_category'];
  mrp: number;
  selling_price: number;
  stock: number;
  unit: Database['public']['Enums']['product_unit'];
}): ProductFormValues {
  return {
    name: product.name,
    description: product.description ?? '',
    category: product.category,
    mrp: String(product.mrp),
    sellingPrice: String(product.selling_price),
    stock: String(product.stock),
    unit: product.unit,
  };
}

/**
 * Edit Product screen for /admin/products/[id]/edit. Loads the product,
 * reuses the shared ProductForm, then updates the row and applies the
 * image add/remove plan with per-image rollback.
 */
export default function AdminEditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { product, status, errorMessage, reload } = useProductDetail(id);

  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived (not effect-seeded): recomputed whenever a refetch brings new
  // data. `key={product.id}` on the form resets its internal state when
  // navigating between different products.
  const initialValues = useMemo(
    () => (product ? toFormValues(product) : null),
    [product],
  );
  const initialImages = useMemo<PickedImage[] | null>(
    () =>
      product
        ? product.product_images.map((image) => ({
            id: image.id, // stable DB identity — React keys derive from this
            // display URI resolves raw paths; `url` keeps the RAW value so
            // image-plan dedupe/removal keeps working against the DB column.
            uri: getProductImageUrl(image.image_url) ?? '',
            url: image.image_url,
          }))
        : null,
    [product],
  );

  const handleSubmit = async (payload: ValidProductSubmit) => {
    if (!product || submitStatus === 'submitting') return;

    setSubmitStatus('submitting');
    setSubmitError(null);

    // 1. Update the product row.
    const updated = await updateProduct(product.id, {
      name: payload.name,
      description: payload.description || null,
      category: payload.category,
      mrp: payload.mrp,
      selling_price: payload.sellingPrice,
      stock: payload.stock,
      unit: payload.unit,
    });

    if (!updated.ok) {
      setSubmitStatus('error');
      setSubmitError(updated.error);
      return;
    }

    // 2. Apply the image plan: remove deleted, upload new, rollback on failure.
    //    Derive the plan from FRESH database state (not the hook snapshot) so
    //    a retry after a partial failure never re-uploads stored images.
    const fresh = await getProduct(product.id);
    const existingImages = fresh.ok ? fresh.data.product_images : product.product_images;
    const { add, remove } = planImageChanges(existingImages, payload.images);

    // Remove + upload are independent operations on different Storage
    // objects, so every request starts together; per-item failures are
    // collected and reported without losing the saved row.
    const outcomes = await Promise.all([
      ...remove.map((ref) => removeProductImage(ref.image_url)),
      ...add.map((image) => uploadProductImage(product.id, image.uri)),
    ]);
    const failures = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error]));

    if (failures.length > 0) {
      // Row is saved; some images failed. Keep the user on the form with
      // the error panel so they can retry — remaining diffs re-derive from
      // the refetched product on next submit.
      setSubmitStatus('error');
      setSubmitError(failures.join('\n'));
      return;
    }

    // Brief success beat, then back to the detail screen.
    setSubmitStatus('success');
    setTimeout(() => {
      router.back();
    }, 650);
  };

  if (status === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <Loading text="Loading product…" showIcon />
      </ThemedView>
    );
  }

  if (status === 'error' || status === 'not-found' || !product) {
    return (
      <ThemedView style={styles.center}>
        <ErrorState
          description={errorMessage ?? 'Product not found.'}
          onRetry={status === 'not-found' ? undefined : reload}
        />
        <Button
          title="Back to products"
          variant="secondary"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/admin/products')
          }
        />
      </ThemedView>
    );
  }

  // Wait for the derived seeds before showing the form.
  if (!initialValues || !initialImages) {
    return (
      <ThemedView style={styles.center}>
        <Loading />
      </ThemedView>
    );
  }

  return (
    <ProductForm
      key={product.id}
      mode="edit"
      initialValues={initialValues}
      initialImages={initialImages}
      submitting={submitStatus === 'submitting' || submitStatus === 'success'}
      submitError={submitError}
      successMessage={submitStatus === 'success' ? 'Changes saved ✓' : null}
      submitLabel="Save Changes"
      submittingLabel={submitStatus === 'success' ? 'Saved ✓' : 'Saving…'}
      onSubmit={(payload) => void handleSubmit(payload)}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
});
