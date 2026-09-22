import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { supabase } from '@/services/supabase.service';
import { uuid } from '@/utils/uuid';
import { escapeIlike } from '@/services/image-plan.service';
import { toUserMessage } from '@/services/errors.service';
import { optimizeImageUri, ImageServiceError } from '@/services/image.service';
import type { Product } from '@/types/database';
import type { ProductCategory, ProductUnit } from '@/services/product-validation.service';

// Re-export embedding functions from the dedicated module (no React Native deps).
export {
  generateProductEmbedding,
  type EmbeddingStatus,
  type EmbeddingResult,
} from '@/services/embedding.service';

/** Image reference attached to a product (subset of product_images row). */
export type ProductImageRef = { id: string; image_url: string };

/** Product row with its attached images (via the FK embed). */
export type ProductWithImages = Product & { product_images: ProductImageRef[] };

/**
 * Product data services — every Supabase read/write for the catalog lives
 * here, never inside UI components.
 */

export type CreateProductInput = {
  name: string;
  description?: string | null;
  category: ProductCategory;
  mrp: number;
  selling_price: number;
  stock: number;
  unit: ProductUnit;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toMessage(error: unknown, fallback: string): string {
  return toUserMessage(error, fallback);
}

/**
 * Creates a product row. RLS requires an authenticated staff/admin.
 */
export async function createProduct(
  input: CreateProductInput,
): Promise<ServiceResult<{ id: string }>> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      category: input.category,
      mrp: input.mrp,
      selling_price: input.selling_price,
      stock: input.stock,
      unit: input.unit,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: toMessage(error, 'Could not save the product.') };
  return { ok: true, data: { id: data.id } };
}

/**
 * Reads an image into bytes from any source the pickers/camera produce:
 *   • file:// URIs (native camera capture, gallery)  → expo-file-system
 *   • blob:/data:/https:// URIs (web picker, previews) → fetch
 *
 * Why not fetch() for everything: React Native's fetch does not reliably
 * support file:// URIs on Android's new architecture (Expo Go included) —
 * it fails with an opaque network error, which surfaced to users as
 * "Could not read the selected image" on every upload. The File API reads
 * straight from disk via the native module and has no such limitation.
 */
async function readImageBytes(localUri: string): Promise<Uint8Array> {
  const isFileUri = /^file:|^content:/i.test(localUri);

  if (isFileUri && Platform.OS !== 'web') {
    const file = new File(localUri);
    if (!file.exists) {
      throw new Error('The selected image is no longer available. Pick it again.');
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  // Web blobs and remote URLs go through fetch (unchanged behavior).
  // fetch() resolves even on failure (it does not reject on HTTP errors),
  // so check the status before consuming the body — otherwise a failed
  // read would upload empty/corrupt bytes and report success.
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Could not read the selected image. Pick it again and retry.');
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Uploads an image to the product-images bucket under the product's folder
 * and attaches a product_images row. If the DB attach fails, the uploaded
 * object is removed so no orphaned files accumulate.
 *
 * The image is OPTIMIZED before upload (longest edge ≤ 1024 px, JPEG q0.8):
 * reference images stored at full camera resolution used to crash the
 * embedding edge function's decoder (maxMemoryUsageInMB) and made every
 * upload slow on mobile networks. Optimizing here fixes both at the source.
 *
 * @param localUri file:// URI from the camera/gallery picker
 * @returns the public URL of the stored image and its Storage path
 */
export async function uploadProductImage(
  productId: string,
  localUri: string,
): Promise<ServiceResult<{ imageUrl: string; path: string }>> {
  // 1. Optimize: validate, resize (≤1024 px), compress to JPEG BEFORE any
  //    bytes hit the network. Memoized — re-saving the same pick is instant.
  let optimizedUri: string;
  try {
    optimizedUri = await optimizeImageUri(localUri);
  } catch (optimizeError) {
    return {
      ok: false,
      error: toMessage(
        optimizeError instanceof ImageServiceError
          ? optimizeError
          : new Error('Could not process the selected image.'),
        'Could not process the selected image. Pick it again and retry.',
      ),
    };
  }

  // 2. Read the optimized bytes (always a fresh JPEG cache file now).
  let bytes: Uint8Array;
  try {
    bytes = await readImageBytes(optimizedUri);
  } catch (readError) {
    return {
      ok: false,
      error: toMessage(readError, 'Could not read the selected image. Pick it again and retry.'),
    };
  }

  // Optimization always emits JPEG (src/services/image.service.ts).
  const objectName = `${productId}/${uuid()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(objectName, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: toMessage(uploadError, 'Image upload failed.') };
  }

  const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(objectName);

  const { error: attachError } = await supabase.from('product_images').insert({
    product_id: productId,
    image_url: urlData.publicUrl,
  });

  if (attachError) {
    // Roll back the storage object so nothing orphans.
    await supabase.storage.from('product-images').remove([objectName]);
    return { ok: false, error: toMessage(attachError, 'Could not attach the image.') };
  }

  return { ok: true, data: { imageUrl: urlData.publicUrl, path: objectName } };
}

/**
 * Removes a previously attached product image: deletes the DB row and the
 * storage object derived from its public URL path.
 */
export async function removeProductImage(imageUrl: string): Promise<ServiceResult<true>> {
  const objectPath = extractStoragePath(imageUrl);

  const { error } = await supabase.from('product_images').delete().eq('image_url', imageUrl);

  if (error) return { ok: false, error: toMessage(error, 'Could not remove the image.') };

  if (objectPath) {
    await supabase.storage.from('product-images').remove([decodeURIComponent(objectPath)]);
  }
  return { ok: true, data: true };
}

/** Deletes a product (images cascade in the DB; storage objects remain). */
export async function deleteProduct(productId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) return { ok: false, error: toMessage(error, 'Could not delete the product.') };
  return { ok: true, data: true };
}

/**
 * Extracts the Storage object path from a product_images.image_url value.
 * Accepts both stored forms: the full public URL this app writes
 * (`https://…/product-images/<productId>/<uuid>.jpg`) and bare paths
 * (`<productId>/<uuid>.jpg`) written by SQL/scripts or older data.
 * Returns null for anything that does not point into the bucket.
 */
export function extractStoragePath(imageUrl: string): string | null {
  if (!imageUrl) return null;
  const marker = '/product-images/';
  const idx = imageUrl.indexOf(marker);
  if (idx >= 0) {
    const path = imageUrl
      .slice(idx + marker.length)
      .split('?')[0]
      .split('#')[0];
    return path === '' ? null : decodeURIComponent(path);
  }
  // Bare path: no scheme, and it must name the product-folder layout.
  if (!/^[a-z]+:/i.test(imageUrl) && !imageUrl.startsWith('//') && imageUrl.includes('/')) {
    const path = imageUrl.trim().replace(/^\/+/, '');
    return path === '' ? null : path;
  }
  return null;
}

/**
 * Deletes a product AND its Storage images.
 *
 * Retention rule: the product row owns its photos. The DB cascade removes
 * product_images rows (with their embeddings) the moment the row is gone —
 * rows without their objects are garbage — so the Storage objects are
 * collected FIRST (cheap read), then the row is deleted, then the objects.
 * Order matters: delete the row only when we know cleanup can proceed, so a
 * read failure leaves the product fully intact rather than half-deleted.
 *
 * Storage cleanup is best-effort: if it fails AFTER the row is gone (no
 * query can ever serve those files again), the error is logged and the
 * delete still succeeds — an orphaned file is far less harmful than a
 * product that can never be deleted, and matches removeProductImage's
 * existing single-image semantics (DB row is the source of truth).
 */
export async function deleteProductWithStorage(
  productId: string,
): Promise<ServiceResult<{ deletedStorageObjects: number }>> {
  // 1. Collect the object paths from the image rows while they still exist.
  const { data: images, error: readError } = await supabase
    .from('product_images')
    .select('image_url')
    .eq('product_id', productId);

  if (readError) {
    return {
      ok: false,
      error: toMessage(readError, 'Could not read the product images before delete.'),
    };
  }

  const objectPaths = (images ?? [])
    .map((row) => extractStoragePath(row.image_url))
    .filter((path): path is string => path !== null);

  // 2. Delete the row (product_images rows + embeddings cascade with it).
  const deleted = await deleteProduct(productId);
  if (!deleted.ok) return deleted;

  // 3. Remove the objects. Best-effort: the data is already unrecoverable
  //    through the app, so a Storage hiccup must not fail the user's delete.
  let removed = 0;
  if (objectPaths.length > 0) {
    const { error } = await supabase.storage.from('product-images').remove(objectPaths);
    if (error) {
      console.error(
        `[product.service] product ${productId} deleted but ${objectPaths.length} storage ` +
          `object(s) could not be removed: ${error.message}`,
      );
    } else {
      removed = objectPaths.length;
    }
  }

  return { ok: true, data: { deletedStorageObjects: removed } };
}

/**
 * Lists products newest-first with their images embedded (single query).
 * @param search   optional case-insensitive name filter
 * @param category optional exact category filter ('all' is treated as none)
 * @param limit    page size, default 100
 */
export async function listProducts(
  options: { search?: string; limit?: number; category?: string } = {},
): Promise<ServiceResult<ProductWithImages[]>> {
  const { search, limit = 100, category } = options;

  let query = supabase
    .from('products')
    .select('*, product_images(id, image_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  const term = search?.trim();
  if (term) {
    query = query.ilike('name', `%${escapeIlike(term)}%`);
  }

  if (category && category !== 'all') {
    query = query.eq('category', category as ProductCategory);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: toMessage(error, 'Could not load products.') };
  return { ok: true, data: (data ?? []) as ProductWithImages[] };
}

export type GetProductResult =
  | { ok: true; data: ProductWithImages }
  | { ok: false; error: string; notFound: boolean };

/** Fetches a single product with images. `notFound: true` → row doesn't exist. */
export async function getProduct(productId: string): Promise<GetProductResult> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(id, image_url)')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toMessage(error, 'Could not load the product.'), notFound: false };
  }
  if (!data) {
    return {
      ok: false,
      error: 'Product not found. It may have been deleted.',
      notFound: true,
    };
  }
  return { ok: true, data: data as ProductWithImages };
}

/** Updates the editable fields of a product. */
export async function updateProduct(
  productId: string,
  input: CreateProductInput,
): Promise<ServiceResult<{ id: string }>> {
  const { error } = await supabase
    .from('products')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      category: input.category,
      mrp: input.mrp,
      selling_price: input.selling_price,
      stock: input.stock,
      unit: input.unit,
    })
    .eq('id', productId);

  if (error) return { ok: false, error: toMessage(error, 'Could not update the product.') };
  return { ok: true, data: { id: productId } };
}
