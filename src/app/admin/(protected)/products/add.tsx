import {
  ProductForm,
} from '@/components/products/product-form';
import { useAdminProductForm } from '@/hooks/use-admin-product-form';

/**
 * Add Product screen. A thin shell: the pipeline
 * (create → optimize → upload → embed → verify → success) lives in the
 * useAdminProductForm hook; Supabase/Storage/edge calls live in the
 * services. This file renders state and forwards intents only.
 */
export default function AdminAddProductScreen() {
  const {
    submitting,
    successMessage,
    submitError,
    embeddingStatus,
    savedProductId,
    deletingSaved,
    deleteSavedProduct,
    submit,
    cancel,
  } = useAdminProductForm({ mode: 'create' });

  return (
    <ProductForm
      mode="create"
      submitting={submitting}
      submitError={submitError}
      successMessage={successMessage}
      embeddingStatus={embeddingStatus}
      onRollbackSaved={savedProductId ? () => deleteSavedProduct(savedProductId) : null}
      rollingBack={deletingSaved}
      onSubmit={(payload) => submit(payload)}
      onCancel={cancel}
    />
  );
}
