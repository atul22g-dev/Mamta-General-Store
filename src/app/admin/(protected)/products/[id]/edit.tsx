import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import {
  ProductForm,
} from '@/components/products/product-form';
import { Loading } from '@/components/common/loading';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/common/button';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing } from '@/constants';
import { useProductDetail } from '@/hooks/use-product-detail';
import { useAdminProductForm } from '@/hooks/use-admin-product-form';
import { getProductImageUrl } from '@/utils/get-product-image-url';
import type { ProductFormValues } from '@/services/product-validation.service';
import type { Database } from '@/types/database';
import type { PickedImage } from '@/components/products/product-image-picker';

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
    category: product.category as ProductFormValues['category'],
    mrp: String(product.mrp),
    sellingPrice: String(product.selling_price),
    stock: String(product.stock),
    unit: product.unit as ProductFormValues['unit'],
  };
}

/**
 * Edit Product screen for /admin/products/[id]/edit. Loads the product and
 * renders the shared form; the save pipeline (row update → image plan →
 * embed-on-image-change / verify-on-metadata-only → RPC proof → success)
 * lives in the useAdminProductForm hook.
 */
export default function AdminEditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { product, status, errorMessage, reload } = useProductDetail(id);
  const form = useAdminProductForm({ mode: 'edit', productId: product?.id });

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
          onPress={() => {
            if (!form.submitting) form.cancel();
          }}
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
      submitting={form.submitting || form.status === 'success'}
      submitError={form.submitError}
      successMessage={form.status === 'success' ? 'Changes saved ✓' : null}
      embeddingStatus={form.embeddingStatus}
      submitLabel="Save Changes"
      submittingLabel={form.status === 'success' ? 'Saved ✓' : 'Saving…'}
      onSubmit={(payload) => form.submit(payload)}
      onCancel={() => {
        if (!form.submitting) form.cancel();
      }}
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
