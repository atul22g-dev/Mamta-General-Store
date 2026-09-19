import type { PickedImage } from '@/components/products/product-image-picker';
import type { ProductImageRef } from '@/lib/products/product-service';

/**
 * Escapes user input for a PostgREST `ilike` pattern so `%`, `_` and `\`
 * typed by the user match literally instead of acting as wildcards.
 */
export function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Computes which images to add/remove when saving an edited product:
 *  - keeps:  existing remote refs whose URL is still present in the picker
 *  - add:    newly picked local URIs (uploaded + attached)
 *  - remove: existing remote refs the user deleted from the picker
 */
export function planImageChanges(
  existing: readonly ProductImageRef[],
  current: readonly PickedImage[],
): {
  keep: ProductImageRef[];
  add: PickedImage[];
  remove: ProductImageRef[];
} {
  const currentUrls = new Set(
    current.filter((image) => image.url !== undefined).map((image) => image.url as string),
  );

  const keep = existing.filter((ref) => currentUrls.has(ref.image_url));
  const remove = existing.filter((ref) => !currentUrls.has(ref.image_url));
  const add = current.filter((image) => image.url === undefined);

  return { keep, add, remove };
}
