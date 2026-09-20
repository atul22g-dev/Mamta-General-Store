import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';
import { escapeIlike } from '@/lib/products/image-plan';
import { toUserMessage } from '@/lib/errors';
import type { Product } from '@/types/database';
import type { ProductCategory, ProductUnit } from '@/lib/products/product-validation';

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
 * Uploads an image to the product-images bucket under the product's folder
 * and attaches a product_images row. If the DB attach fails, the uploaded
 * object is removed so no orphaned files accumulate.
 *
 * @param localUri file:// URI from the camera/gallery picker
 * @returns the public URL of the stored image
 */
export async function uploadProductImage(
  productId: string,
  localUri: string,
): Promise<ServiceResult<{ imageUrl: string; path: string }>> {
  // Fetch the binary from the local URI (works on native and web blobs).
  // fetch() resolves even on failure (it does not reject on HTTP errors),
  // so check the status before consuming the body — otherwise a failed
  // read would upload empty/corrupt bytes and report success.
  const response = await fetch(localUri);
  if (!response.ok) {
    return {
      ok: false,
      error: 'Could not read the selected image. Pick it again and retry.',
    };
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Derive a safe extension from the URI, defaulting to jpg.
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(localUri);
  const ext = (match?.[1] ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectName = `${productId}/${uuid()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(objectName, bytes, {
      contentType: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`,
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
  const marker = '/product-images/';
  const idx = imageUrl.indexOf(marker);
  const objectPath = idx >= 0 ? imageUrl.slice(idx + marker.length).split('?')[0] : null;

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
