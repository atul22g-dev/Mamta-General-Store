/**
 * Product export/import — the database side. The rules live in
 * ./product-transfer.ts (pure, tested); this file only reads rows, writes
 * rows, and reports what happened.
 *
 * ▼ THE ONE PROMISE
 *   Nothing is written until the caller has a plan and confirms it. Every
 *   function here either READS (export, readImportPlan) or APPLIES a plan it
 *   was given (applyImportPlan) — there is no "import straight from a file"
 *   shortcut that could surprise a shopkeeper with 200 changed prices.
 *
 * ▼ WHAT AN IMPORT TOUCHES
 *   • products: created, or updated in place (matched by name, never replaced)
 *   • product_images: a photo LINK is attached only when the product has none,
 *     so a spreadsheet can never remove or overwrite a real uploaded photo
 *   • embeddings: generated for images that arrived without one, because a
 *     product with no embedding cannot be found by visual search
 */
import { supabase } from '@/services/supabase.service';
import { toUserMessage } from '@/services/errors.service';
import {
  buildExport,
  exportTemplate,
  parseTransferFile,
  planImport,
  toTransferProduct,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type ExportFormat,
  type ImportPlan,
  type PlannedRow,
  type TransferRow,
} from '@/services/product-transfer-rules';
import { backfillProductEmbeddings } from '@/services/embedding.service';
import type { Product } from '@/types/database';

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type ExportedFile = {
  filename: string;
  mimeType: string;
  text: string;
  count: number;
};

export type ImportFailure = { line: number; name: string; reason: string };

export type ImportOutcome = {
  created: number;
  updated: number;
  failed: ImportFailure[];
  /** Images that had to be made searchable, and how that went. */
  embedded: number;
  embeddingWarning: string | null;
};

function toMessage(error: unknown, fallback: string): string {
  return toUserMessage(error, fallback);
}

/** The columns a file can change, shared by the read and write paths. */
const PRODUCT_FIELDS =
  'id, name, description, category, brand, subcategory, mrp, selling_price, stock, unit, is_active, created_at, updated_at';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Every product in the catalog, with its images.
 *
 * Hidden products ARE included: this doubles as a backup, and a backup that
 * silently dropped inactive rows would not be one.
 */
export async function exportCatalog(format: ExportFormat): Promise<ServiceResult<ExportedFile>> {
  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_FIELDS}, product_images(id, image_url)`)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: toMessage(error, 'Could not read the catalog.') };

  const rows = (data ?? []) as (Product & { product_images: { id: string; image_url: string }[] })[];
  const file = buildExport(rows.map(toTransferProduct), format);
  return { ok: true, data: file };
}

/** A one-row template, so a shopkeeper can see the expected columns. */
export async function exportEmptyTemplate(): Promise<ServiceResult<ExportedFile>> {
  return {
    ok: true,
    data: {
      filename: 'products-template.csv',
      mimeType: 'text/csv',
      text: exportTemplate(),
      count: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Import — read & plan (no writes)
// ---------------------------------------------------------------------------

/**
 * Parses a chosen file and works out exactly what importing it would do.
 * Reads the current catalog to compare against; changes nothing.
 */
export async function readImportPlan(
  text: string,
  filename: string,
): Promise<ServiceResult<{ plan: ImportPlan; parsedRows: number }>> {
  if (text.length > MAX_IMPORT_BYTES) {
    const mb = (text.length / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `That file is ${mb} MB. The limit is 5 MB — split it into smaller files.` };
  }

  const parsed = parseTransferFile(text, filename);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (parsed.raw.length === 0) {
    return { ok: false, error: 'The file has a header but no products.' };
  }
  if (parsed.raw.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${parsed.raw.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it and import in parts.`,
    };
  }

  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_FIELDS}, product_images(id, image_url)`);

  if (error) return { ok: false, error: toMessage(error, 'Could not read the catalog to compare against.') };

  const existing = (data ?? []) as (Product & { product_images: { id: string; image_url: string }[] })[];

  return {
    ok: true,
    data: { plan: planImport(parsed.raw, existing, parsed.lineOffset), parsedRows: parsed.raw.length },
  };
}

// ---------------------------------------------------------------------------
// Import — apply
// ---------------------------------------------------------------------------

/** How many rows are written at once: fast enough, gentle enough. */
const WRITE_BATCH = 6;

function toInsert(row: TransferRow): Record<string, unknown> {
  return {
    name: row.name,
    description: row.description,
    category: row.category,
    brand: row.brand,
    subcategory: row.subcategory,
    mrp: row.mrp,
    selling_price: row.selling_price,
    stock: row.stock,
    unit: row.unit,
    is_active: row.is_active,
  };
}

/**
 * Writes a confirmed plan.
 *
 * Rows are independent, so they are written in small parallel batches; a row
 * that fails is reported with its file line and the others still go through.
 * A product's photo link is attached only when it has no photo, and any image
 * that ends up without an embedding is embedded at the end so it is searchable.
 */
export async function applyImportPlan(plan: ImportPlan): Promise<ServiceResult<ImportOutcome>> {
  const failures: ImportFailure[] = [];
  let created = 0;
  let updated = 0;
  /** Products whose photo was attached here and therefore need an embedding. */
  const needEmbedding = new Set<string>();

  const batches: PlannedRow[][] = [];
  for (let i = 0; i < plan.writable.length; i += WRITE_BATCH) {
    batches.push(plan.writable.slice(i, i + WRITE_BATCH));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (planned) => {
        const row = planned.row!;

        let productId = planned.existingId ?? null;

        if (planned.action === 'create') {
          const { data, error } = await supabase
            .from('products')
            .insert(toInsert(planned.row!) as never)
            .select('id')
            .single();

          if (error || !data) {
            failures.push({
              line: planned.line,
              name: planned.name,
              reason: toMessage(error, 'The database refused this row.'),
            });
            return;
          }
          productId = data.id;
          created += 1;
        } else {
          const { error } = await supabase
            .from('products')
            .update(toInsert(planned.row!) as never)
            .eq('id', productId!);

          if (error) {
            failures.push({
              line: planned.line,
              name: planned.name,
              reason: toMessage(error, 'The database refused this row.'),
            });
            return;
          }
          updated += 1;
        }

        if (row.image_url && productId) {
          const attached = await attachImageIfMissing(productId, row.image_url);
          if (attached.ok) {
            if (attached.data) needEmbedding.add(productId);
          } else {
            failures.push({ line: planned.line, name: planned.name, reason: attached.error });
          }
        }
      }),
    );
  }

  // The plan's own 'skip' rows are not written, so they cannot fail; anything
  // else that failed is already in `failures`.
  let embedded = 0;
  let embeddingWarning: string | null = null;

  if (needEmbedding.size > 0) {
    const result = await backfillProductEmbeddings(50);
    if (!result.ok) {
      embeddingWarning =
        'The products were saved, but their photos could not be made searchable by image yet. ' +
        'Run the import again to retry.';
    } else {
      embedded = result.data.embedded;
      if (result.data.failed.length > 0 || result.data.embedded < needEmbedding.size) {
        embeddingWarning =
          `${result.data.failed.length > 0 ? `${result.data.failed.length} photo(s) could not be read. ` : ''}` +
          'Re-run the import to finish making the new photos searchable.';
      }
    }
  }

  return { ok: true, data: { created, updated, failed: failures, embedded, embeddingWarning } };
}

/**
 * Attaches a photo link to a product that has no photo.
 *
 * Returns true when a row was inserted (the caller then needs an embedding).
 * A product that already has a photo is left alone: the file cannot prove its
 * link is better than the photo already on the product.
 */
async function attachImageIfMissing(
  productId: string,
  imageUrl: string,
): Promise<ServiceResult<boolean>> {
  const { data, error } = await supabase
    .from('product_images')
    .select('id')
    .eq('product_id', productId)
    .limit(1);

  if (error) return { ok: false, error: toMessage(error, 'Could not check the product’s photos.') };
  if ((data ?? []).length > 0) return { ok: true, data: false };

  const { error: insertError } = await supabase
    .from('product_images')
    .insert({ product_id: productId, image_url: imageUrl, image_type: 'main' });

  if (insertError) {
    return { ok: false, error: toMessage(insertError, 'Could not attach the photo link.') };
  }
  return { ok: true, data: true };
}
