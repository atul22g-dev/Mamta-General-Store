import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import type { ValidProductSubmit } from '@/components/products/product-form';
import {
  createProduct,
  uploadProductImage,
  updateProduct,
  getProduct,
  removeProductImage,
  deleteProductWithStorage,
} from '@/services/product.service';
import {
  generateProductEmbedding,
  verifyProductSearchable,
  verifyProductEmbedding,
  clearInvalidEmbeddings,
} from '@/services/embedding.service';
import { planImageChanges } from '@/services/image-plan.service';

export type AdminFormStatus = 'idle' | 'submitting' | 'success' | 'error';

/** Human-facing result the screen renders. */
export type AdminFormView = {
  status: AdminFormStatus;
  submitting: boolean;
  successMessage: string | null;
  submitError: string | null;
  /** Progress copy shown while embeddings are generated/verified. */
  embeddingStatus: string | null;
  /** Row id when saved-but-total-upload-failure (rollback available). */
  savedProductId: string | null;
  deletingSaved: boolean;
  deleteSavedProduct: (productId: string) => void;
  submit: (payload: ValidProductSubmit) => void;
  cancel: () => void;
};

/** Where the pipeline stopped, for tests and dev logs. */
export type PipelineStop =
  | 'create'
  | 'upload'
  | 'embed'
  | 'verify'
  | 'none';
type SubmitState = {
  status: AdminFormStatus;
  submitError: string | null;
  embeddingStatus: string | null;
  /** Non-fatal warning (some images failed) shown with the success beat. */
  imageWarning: string | null;
  /**
   * Set when the row exists but every image upload failed — the screen
   * offers rollback (delete the empty row) or retry (re-attach images).
   */
  savedProductId: string | null;
  /** True while the rollback delete is in flight. */
  deletingSaved: boolean;
};

const INITIAL: SubmitState = {
  status: 'idle',
  submitError: null,
  embeddingStatus: null,
  imageWarning: null,
  savedProductId: null,
  deletingSaved: false,
};

/**
 * Admin product form pipeline — add AND edit — as one hook.
 *
 * Screen → Hook → Service → Supabase: the screen renders SubmitState and
 * calls submit/cancel; every Supabase/Storage/edge call lives below.
 *
 * ▼ THE PROMISE (never save a product as "fully searchable" on failure)
 *   The status strategy is honest per failure point:
 *     create fails          → status 'error', nothing saved.
 *     upload fails (all)    → status 'error' + offer to delete the empty row;
 *                             the database never holds a silently useless product.
 *     embed fails           → status 'error': "saved, NOT searchable, edit to
 *                             retry" — success is never faked. (The saved-but-
 *                             pending state is safe by design: missing embeddings
 *                             simply never match in visual search.)
 *     verify fails          → status 'error' with the RPC-proven reason.
 *   Only a pipeline that reaches a verified-searchable end reports 'success'.
 *
 * ▼ EDIT SEMANTICS
 *   Price/name/stock-only save → embeddings are verified, never regenerated
 *   (an embedding describes the image, not the price). Image changed → the
 *   plan removes/uploads, the new images embed, and searchability is proven.
 *   Metadata-only saves opportunistically heal corrupt/missing embeddings.
 */
export function useAdminProductForm(options: {
  mode: 'create' | 'edit';
  productId?: string;
}): AdminFormView {
  const { mode, productId } = options;
  const router = useRouter();

  const [state, setState] = useState<SubmitState>(INITIAL);
  // Guards against double-submission across the async success beat.
  const inFlightRef = useRef(false);

  const patch = useCallback((next: Partial<SubmitState>) => {
    setState((previous) => ({ ...previous, ...next }));
  }, []);

  /**
   * Rollback for the total-upload-failure state: deletes the just-created
   * row (and any Storage objects) so no permanently imageless product
   * lingers. Navigates back to the list on success.
   */
  const deleteSavedProduct = useCallback(
    (savedId: string) => {
      setState((current) => ({ ...current, deletingSaved: true }));
      void deleteProductWithStorage(savedId).then((result) => {
        if (result.ok) {
          setState({ ...INITIAL });
          router.replace('/admin/products');
        } else {
          setState((current) => ({
            ...current,
            deletingSaved: false,
            submitError: `Could not delete the saved product: ${result.error}`,
          }));
        }
      });
    },
    [router],
  );

  const cancel = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/products');
  }, [router]);

  const submit = useCallback(
    (payload: ValidProductSubmit) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      patch({ status: 'submitting', submitError: null, embeddingStatus: null, imageWarning: null });

      void (mode === 'create'
        ? runCreateFlow(payload, patch, router)
        : runEditFlow(payload, patch, router, productId ?? '')
      ).finally(() => {
        inFlightRef.current = false;
      });
    },
    [mode, productId, patch, router],
  );

  return {
    status: state.status,
    submitting: state.status === 'submitting',
    successMessage:
      state.status === 'success' ? (state.imageWarning ?? 'Product saved ✓') : null,
    submitError: state.submitError,
    embeddingStatus: state.embeddingStatus,
    savedProductId: state.savedProductId,
    deletingSaved: state.deletingSaved,
    deleteSavedProduct,
    submit,
    cancel,
  };
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

type Patch = (next: Partial<SubmitState>) => void;
type Router = ReturnType<typeof useRouter>;

/** Creates a product row from validated form values. */
async function createRow(payload: ValidProductSubmit) {
  return createProduct({
    name: payload.name,
    description: payload.description || null,
    category: payload.category,
    mrp: payload.mrp,
    selling_price: payload.sellingPrice,
    stock: payload.stock,
    unit: payload.unit,
  });
}

/** Uploads every fresh pick concurrently; returns successes + failures. */
async function uploadFreshPicks(productId: string, payload: ValidProductSubmit) {
  const pending = payload.images.filter((image) => image.url === undefined);
  const uploads = await Promise.all(
    pending.map((image) => uploadProductImage(productId, image.uri)),
  );
  const failures = uploads.flatMap((upload) => (upload.ok ? [] : [upload.error]));
  const successes = uploads.filter(
    (upload): upload is Extract<typeof upload, { ok: true }> => upload.ok,
  );
  return { successes, failures };
}

/**
 * Embeds + verifies, then reports through `patch`. Returns the exact stop
 * point so the caller can react (e.g. offer rollback after a total upload
 * failure).
 */
async function embedAndVerify(
  productId: string,
  patch: Patch,
  imageCount: number,
): Promise<{ ok: true } | { ok: false; stop: PipelineStop; error: string }> {
  if (imageCount > 0) {
    patch({
      embeddingStatus: `Generating embeddings for ${imageCount} image${imageCount > 1 ? 's' : ''}…`,
    });

    const embeddingResult = await generateProductEmbedding(productId);

    if (!embeddingResult.ok) {
      patch({ embeddingStatus: null });
      return {
        ok: false,
        stop: 'embed',
        error:
          `Product saved, but embedding generation failed: ${embeddingResult.error} ` +
          'The product is not searchable by image yet. You can edit the product to retry.',
      };
    }

    if (!embeddingResult.data.hasEmbedding) {
      patch({ embeddingStatus: null });
      return {
        ok: false,
        stop: 'embed',
        error:
          'Product saved, but no embeddings were generated. ' +
          'The product is not searchable by image. You can edit the product to retry.',
      };
    }

    const failed = embeddingResult.data.failed;
    if (failed.length > 0) {
      patch({
        imageWarning:
          `Product saved, but ${failed.length} image embedding${failed.length > 1 ? 's' : ''} failed. ` +
          'The product may not be fully searchable by image.',
      });
    }
  } else {
    // No images exist: verify what's stored (self-heal corrupt vectors).
    const check = await verifyProductEmbedding(productId);
    if (check.ok && check.data.validEmbedding === null && check.data.imageCount > 0) {
      const invalid = check.data.perImage.some((entry) => entry.state === 'invalid');
      if (invalid) await clearInvalidEmbeddings(check.data);
      const healing = await generateProductEmbedding(productId);
      if (!healing.ok || !healing.data.hasEmbedding) {
        console.error(
          `[admin-product-form] embedding heal failed: ${healing.ok ? 'no embedding produced' : healing.error}`,
        );
      }
    } else if (!check.ok) {
      console.error(`[admin-product-form] embedding check failed: ${check.error}`);
    }
  }

  // Prove findability through the REAL visual_search_matches RPC. Never
  // claim success on an unverified pipeline.
  patch({ embeddingStatus: 'Verifying visual search…' });
  const verified = await verifyProductSearchable(productId);
  patch({ embeddingStatus: null });
  if (!verified.ok || !verified.data.searchable) {
    const why = verified.ok ? verified.data.detail : verified.error;
    console.error('[admin-product-form] searchability check failed:', why);
    return {
      ok: false,
      stop: 'verify',
      error:
        `Product saved, but it is not findable by visual search yet: ${why} ` +
        'You can edit the product to retry.',
    };
  }

  return { ok: true };
}

/**
 * Creates the product, applies the image plan, embeds, verifies.
 * Returns the outcome WITHOUT navigating — the hook owns routing.
 */
async function runCreateFlow(
  payload: ValidProductSubmit,
  patch: Patch,
  router: Router,
): Promise<void> {
  // 1. Create the product row.
  const created = await createRow(payload);
  if (!created.ok) {
    patch({ status: 'error', submitError: created.error });
    return;
  }
  const productId = created.data.id;

  // 2. Upload images. A PARTIAL failure still proceeds (the row is real,
  //    retries happen on edit) — but a TOTAL failure must not leave a
  //    permanently imageless, unsearchable product masquerading as done.
  const { successes, failures } = await uploadFreshPicks(productId, payload);
  if (successes.length === 0) {
    patch({
      embeddingStatus: null,
      status: 'error',
      savedProductId: productId,
      submitError:
        'The product was saved, but every image upload failed, so it cannot be found by photo. ' +
        'Pick the images again to retry, or delete the saved product.',
    });
    return; // the screen offers Retry (re-pick images) / Delete (rollback)
  }
  if (failures.length > 0) {
    patch({
      imageWarning:
        `Product saved, but ${failures.length} image${failures.length > 1 ? 's' : ''} failed to upload. ` +
        'You can edit the product to retry.',
    });
  }

  // 3+4. Embed the new images, then prove searchability via the RPC.
  const verified = await embedAndVerify(productId, patch, successes.length);
  if (!verified.ok) {
    patch({ status: 'error', submitError: verified.error });
    return;
  }

  // 5. Success beat, then to the product list (replace: back ≠ form).  patch({ status: 'success' });
  const hadWarnings = failures.length > 0;
  setTimeout(() => {
    router.replace('/admin/products');
  }, hadWarnings ? 1400 : 650);
}

/**
 * Updates the row, applies the image plan with per-image rollback, embeds
 * only when the IMAGES changed (price/name-only saves verify instead),
 * and proves searchability either way.
 */
async function runEditFlow(
  payload: ValidProductSubmit,
  patch: Patch,
  router: Router,
  productId: string,
): Promise<void> {
  // 1. Update the product row.
  const updated = await updateProduct(productId, {
    name: payload.name,
    description: payload.description || null,
    category: payload.category,
    mrp: payload.mrp,
    selling_price: payload.sellingPrice,
    stock: payload.stock,
    unit: payload.unit,
  });
  if (!updated.ok) {
    patch({ status: 'error', submitError: updated.error });
    return;
  }

  // 2. Image plan derived from FRESH database state (not the hook snapshot)
  //    so a retry after a partial failure never re-uploads stored images.
  const fresh = await getProduct(productId);
  const existingImages = fresh.ok ? fresh.data.product_images : [];
  const { add, remove } = planImageChanges(existingImages, payload.images);

  // Remove + upload are independent operations on different Storage
  // objects, so every request starts together; per-item failures are
  // collected and reported without losing the saved row.
  const outcomes = await Promise.all([
    ...remove.map((ref) => removeProductImage(ref.image_url)),
    ...add.map((image) => uploadProductImage(productId, image.uri)),
  ]);
  const failures = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error]));
  const uploadSuccesses = outcomes.filter(
    (outcome): outcome is { ok: true; data: { imageUrl: string; path: string } } =>
      outcome.ok && 'imageUrl' in (outcome.data as object),
  );

  if (failures.length > 0) {
    // Row is saved; some image ops failed. Stay on the form with the error
    // panel so the admin can retry — remaining diffs re-derive from the
    // refetched product on the next submit.
    patch({ status: 'error', submitError: failures.join('\n') });
    return;
  }

  const imagesChanged = add.length > 0 || remove.length > 0;

  // 3+4. Embed (image change) or verify-heal (metadata-only), then prove.
  const verified = await embedAndVerify(productId, patch, imagesChanged ? Math.max(uploadSuccesses.length, 1) : 0);
  if (!verified.ok) {
    patch({ status: 'error', submitError: verified.error });
    return;
  }

  // 5. Success beat, then back to the detail screen.
  patch({ status: 'success' });
  setTimeout(() => {
    router.back();
  }, 650);
}
