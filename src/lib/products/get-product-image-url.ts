import { supabase } from '@/lib/supabase';

/**
 * The ONE image-URL resolver for the whole app.
 *
 * `product_images.image_url` can legitimately hold either form:
 *   • a full https URL  (what this app's upload code stores)
 *   • a bare storage path like `<product-id>/<uuid>.jpg`
 *     (rows inserted by SQL/scripts, or older data)
 *
 * Every display point routes through this helper so the conversion lives in
 * exactly one place and raw paths can never reach <Image>.
 */
export function getProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (trimmed === '') return null;

  // Already a complete URL — use as-is (never double-prefix).
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Data/blob URIs (previews, tests) — pass through untouched.
  if (/^(data|blob|file):/i.test(trimmed)) return trimmed;

  // Otherwise treat it as a path inside the product-images bucket.
  const { data } = supabase.storage.from('product-images').getPublicUrl(trimmed);
  return data.publicUrl ?? null;
}
