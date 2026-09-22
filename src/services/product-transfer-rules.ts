/**
 * Product EXPORT / IMPORT — the data intelligence, with no React, no
 * Supabase and no file system, so every rule below is unit-testable
 * (tests/product-transfer.test.mjs).
 *
 * ▼ WHY THIS EXISTS
 *   A shop adds stock in batches, and a spreadsheet is where that batch already
 *   lives. This module turns the catalog into a file a human can edit, and turns
 *   an edited file back into a safe, previewable set of database changes.
 *
 * ▼ TWO FORMATS, TWO JOBS
 *   • CSV  — one row per product, opens straight in Excel / Google Sheets.
 *            This is the one to bulk-edit prices and stock in.
 *   • JSON — the whole catalog with ids and timestamps: a real BACKUP, and the
 *            only format that restores exactly what was exported.
 *   Both carry the same fields, so a CSV export and a JSON import (or the
 *   reverse) agree on everything except ids and timestamps.
 *
 * ▼ SAFETY RULES (deliberate, each one has a test)
 *   • Nothing is written without a preview: `planImport` only DECIDES, it never
 *     touches the database. The screen shows the plan and waits for a tap.
 *   • Existing products are matched by NAME (case- and space-insensitive).
 *     There is no SKU or barcode column in this catalog, so name is the only
 *     key a shopkeeper can see in a spreadsheet.
 *   • A row that is already up to date is a NO-OP, not an update — re-importing
 *     a file you just exported changes nothing.
 *   • A bad row never blocks the good ones: it is reported with its line number
 *     and skipped, so one typo cannot lose an import of 200 products.
 *   • A product named twice in the same file is reported, not silently
 *     last-one-wins.
 *
 * ▼ ONE THING THAT DOES NOT ROUND-TRIP: PHOTOS
 *   A spreadsheet cannot carry a photo, so `image_url` holds a PUBLIC LINK to
 *   one (the first image of the product on export). On import that link is
 *   attached as the product's image when it has none, and the image then gets
 *   embedded so visual search can find it. Everything else about images stays
 *   where it belongs: upload them from the product screen.
 */
import {
  CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  UNIT_LABELS,
  type ProductCategory,
  type ProductUnit,
} from '@/config/products';
import type { Product } from '@/types/database';

/*
 * WHAT A FILE MAY USE, versus what the app offers in its dropdowns.
 *
 * These are NOT the same list, on purpose. `config/products.ts` curates the five
 * categories and two units the shop's own screens show, but the PostgreSQL
 * enums are wider (they grew before that list was curated) and a product already
 * stored with e.g. category 'groceries' is perfectly valid. Validating only
 * against the app's list would make an EXPORT of your own catalog fail to
 * re-import — the worst kind of bug in a backup feature — so a file may use any
 * value the database accepts, and the app's list stays the curated subset.
 *
 * Source of truth: the enums in supabase/migrations/0002_products.sql and
 * supabase/setup-all-in-one.sql. If a value is added there, add it here too.
 */
const DATABASE_CATEGORIES = [
  'groceries',
  'snacks',
  'household',
  'beverages',
  'dairy',
] as const;
const DATABASE_UNITS = ['kg', 'gram', 'litre', 'ml', 'pack', 'dozen'] as const;

/** Every category value a row in a file may carry. */
export const ACCEPTED_CATEGORIES: readonly string[] = [
  ...PRODUCT_CATEGORIES,
  ...DATABASE_CATEGORIES,
];

/** Every unit value a row in a file may carry. */
export const ACCEPTED_UNITS: readonly string[] = [...PRODUCT_UNITS, ...DATABASE_UNITS];

/** A product as it appears in an exported file. All values are display-ready. */
export type TransferProduct = {
  id?: string;
  name: string;
  category: string;
  unit: string;
  mrp: number;
  selling_price: number;
  stock: number;
  description: string;
  brand: string;
  subcategory: string;
  is_active: boolean;
  image_url: string;
  /** ISO timestamps — JSON export only (a backup should record them). */
  created_at?: string;
  updated_at?: string;
};

/** What `planImport` decided for one row of the file. */
export type ImportAction = 'create' | 'update' | 'skip' | 'invalid';

export type PlannedRow = {
  /** 1-based line in CSV terms (header is line 1), for actionable messages. */
  line: number;
  action: ImportAction;
  /** Product name as written in the file (may be blank for a broken row). */
  name: string;
  /** The cleaned row to write (absent when action is 'invalid'). */
  row?: TransferRow;
  /** Set when action is 'update'/'skip': the product already in the database. */
  existingId?: string;
  /** Human-readable explanation for 'skip' and 'invalid'. */
  reasons: string[];
};

export type ImportPlan = {
  rows: PlannedRow[];
  counts: { create: number; update: number; skip: number; invalid: number };
  /** Convenience for the confirm button: rows that will actually be written. */
  writable: PlannedRow[];
};

/** A validated, database-ready row. */
export type TransferRow = {
  name: string;
  /** Database enum value (see ACCEPTED_CATEGORIES — wider than the app's list). */
  category: Product['category'];
  /** Database enum value (see ACCEPTED_UNITS). */
  unit: Product['unit'];
  mrp: number;
  selling_price: number;
  stock: number;
  description: string | null;
  brand: string | null;
  subcategory: string | null;
  is_active: boolean;
  image_url: string | null;
};

export type ExportFormat = 'csv' | 'json';

/** Header order of the CSV — also the field order documented for users. */
export const CSV_COLUMNS = [
  'name',
  'category',
  'unit',
  'mrp',
  'selling_price',
  'stock',
  'description',
  'brand',
  'subcategory',
  'is_active',
  'image_url',
] as const;

/** Refuse absurd files rather than freezing a phone: see planImport callers. */
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type TransferError = { line: number; name: string; reasons: string[] };

// ---------------------------------------------------------------------------
// Values → text
// ---------------------------------------------------------------------------

/**
 * Neutralises spreadsheet FORMULA INJECTION and strips the guard back off on
 * import.
 *
 * A product legitimately called "-50% Combo" or "=SALE=" would be executed as a
 * formula by Excel/Sheets when the file is opened, which is a known attack path
 * (and simply wrong for the shopkeeper, who sees an error instead of the name).
 * Prefixing an apostrophe makes every spreadsheet treat the cell as text; a
 * leading apostrophe is not part of the value, so `stripFormulaGuard` removes it
 * again on the way in.
 */
function escapeFormula(raw: string): string {
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

function stripFormulaGuard(raw: string): string {
  return raw.startsWith("'") ? raw.slice(1) : raw;
}

/**
 * A row as it comes out of a file: VALUES ARE UNTRUSTED. A JSON file can hold
 * numbers and booleans, a CSV file holds strings, and either can be missing a
 * column entirely — every reader below goes through the coercion helpers so a
 * surprise value is validated and reported, never thrown at the user.
 */
export type RawRow = Record<string, unknown>;

/** One CSV field: quote it when it contains a delimiter, quote, or newline. */
function csvField(value: string): string {
  const guarded = escapeFormula(value);
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function numberToCsv(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

/** A product row → the flat shape a file carries. */
export function toTransferProduct(
  product: Product & { product_images?: { image_url: string }[] },
): TransferProduct {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    unit: product.unit,
    mrp: Number(product.mrp),
    selling_price: Number(product.selling_price),
    stock: Number(product.stock),
    description: product.description ?? '',
    brand: product.brand ?? '',
    subcategory: product.subcategory ?? '',
    is_active: product.is_active,
    image_url: product.product_images?.[0]?.image_url ?? '',
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

export function productsToCsv(products: TransferProduct[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = products.map((product) =>
    [
      product.name,
      product.category,
      product.unit,
      numberToCsv(product.mrp),
      numberToCsv(product.selling_price),
      numberToCsv(product.stock),
      product.description,
      product.brand,
      product.subcategory,
      product.is_active ? 'true' : 'false',
      product.image_url,
    ]
      .map((value) => csvField(String(value ?? '')))
      .join(','),
  );
  // Trailing newline: every spreadsheet and diff tool prefers it.
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function productsToJson(products: TransferProduct[]): string {
  return (
    JSON.stringify(
      {
        format: 'mamta-general-store/products',
        version: 1,
        exported_at: new Date().toISOString(),
        count: products.length,
        products,
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * The file to hand to the user: name, mime type and body.
 * The date in the name keeps repeated exports from overwriting each other.
 */
export function buildExport(
  products: TransferProduct[],
  format: ExportFormat,
  today: string = new Date().toISOString().slice(0, 10),
): { filename: string; mimeType: string; text: string; count: number } {
  return format === 'csv'
    ? {
        filename: `products-${today}.csv`,
        mimeType: 'text/csv',
        text: productsToCsv(products),
        count: products.length,
      }
    : {
        filename: `products-${today}.json`,
        mimeType: 'application/json',
        text: productsToJson(products),
        count: products.length,
      };
}

// ---------------------------------------------------------------------------
// Text → rows
// ---------------------------------------------------------------------------

/**
 * RFC 4180 CSV reader: quoted fields may contain commas, newlines and escaped
 * (`""`) quotes; CRLF and LF both end a line; a UTF-8 BOM is dropped (Excel
 * writes one, and it would otherwise become part of the first header name).
 */
export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      if (clean[i + 1] === '\n') i++;
      endRow();
    } else {
      field += char;
    }
  }

  // Last line without a trailing newline.
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

/** Reads either format. Returns raw rows plus any file-level problem. */
export function parseTransferFile(
  text: string,
  filename = '',
): { ok: true; raw: RawRow[]; lineOffset: number } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'The file is empty.' };

  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  // Content decides, with the extension only as a tie-breaker: a CSV renamed to
  // .json (or the reverse) should still import rather than be rejected.
  const namedJson = /\.json$/i.test(filename);

  if (looksJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: 'This looks like JSON but could not be read (check for a missing comma or bracket).' };
    }

    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { products?: unknown })?.products;

    if (!Array.isArray(list)) {
      return {
        ok: false,
        error: 'JSON must be an array of products, or an object with a "products" array.',
      };
    }

    const raw: Record<string, string>[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') {
        return { ok: false, error: 'Every entry in the JSON array must be a product object.' };
      }
      const record: Record<string, string> = {};
      for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
        if (value === null || value === undefined) continue;
        record[key] = typeof value === 'string' ? value : String(value);
      }
      raw.push(record);
    }
    return { ok: true, raw, lineOffset: 0 };
  }

  if (namedJson) {
    return { ok: false, error: 'That file is named .json but does not contain JSON.' };
  }

  const table = parseCsv(trimmed);
  if (table.length < 1) return { ok: false, error: 'The file has no rows.' };

  const header = table[0].map((name) => name.trim().toLowerCase());
  if (header.length === 0 || header.every((name) => name === '')) {
    return { ok: false, error: 'The first line must name the columns (see the exported file for an example).' };
  }
  if (!header.includes('name')) {
    return { ok: false, error: 'The file has no "name" column — it does not look like a product list.' };
  }

  const raw: Record<string, string>[] = [];
  for (const line of table.slice(1)) {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key === '') return;
      record[key] = line[index] ?? '';
    });
    raw.push(record);
  }

  return { ok: true, raw, lineOffset: 1 };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return stripFormulaGuard(String(value).trim());
}

function bool(value: unknown, fallback: boolean): { ok: boolean; value: boolean } {
  const raw = text(value).toLowerCase();
  if (raw === '') return { ok: true, value: fallback };
  if (['true', 'yes', 'y', '1', 'active'].includes(raw)) return { ok: true, value: true };
  if (['false', 'no', 'n', '0', 'inactive'].includes(raw)) return { ok: true, value: false };
  return { ok: false, value: fallback };
}

function amount(value: unknown): number | null {
  const raw = text(value).replace(/^[₹$]/, '').replace(/,/g, '');
  if (raw === '') return null;
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Turns one raw row into a database-ready row, or explains why it cannot be.
 * Rules mirror the product form (validateProductForm) on purpose: a file must
 * not be able to create something the admin UI would refuse.
 */
export function validateTransferRow(
  raw: RawRow,
): { ok: true; row: TransferRow } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];

  const name = text(raw.name);
  if (name === '') reasons.push('Name is required.');
  else if (name.length > 200) reasons.push('Name must be 200 characters or fewer.');

  const category = text(raw.category).toLowerCase();
  if (category === '') reasons.push('Category is required.');
  else if (!ACCEPTED_CATEGORIES.includes(category)) {
    reasons.push(`Category "${category}" is not one of: ${ACCEPTED_CATEGORIES.join(', ')}.`);
  }

  const unit = text(raw.unit).toLowerCase() || 'piece';
  if (!ACCEPTED_UNITS.includes(unit)) {
    reasons.push(`Unit "${unit}" is not one of: ${ACCEPTED_UNITS.join(', ')}.`);
  }

  const mrp = amount(raw.mrp);
  const selling = amount(raw.selling_price ?? raw.sellingPrice);
  const stockRaw = raw.stock;
  const stock = amount(stockRaw);

  if (mrp === null) reasons.push('MRP must be a number.');
  else if (mrp < 0) reasons.push('MRP cannot be negative.');

  if (selling === null) reasons.push('Selling price must be a number.');
  else if (selling < 0) reasons.push('Selling price cannot be negative.');
  else if (mrp !== null && selling > mrp) reasons.push('Selling price cannot exceed MRP.');

  if (text(stockRaw) !== '') {
    if (stock === null) reasons.push('Stock must be a number.');
    else if (!Number.isInteger(stock)) reasons.push('Stock must be a whole number.');
    else if (stock < 0) reasons.push('Stock cannot be negative.');
  }

  const description = text(raw.description);
  if (description.length > 2000) reasons.push('Description must be 2000 characters or fewer.');

  const active = bool(raw.is_active, true);
  if (!active.ok) reasons.push('is_active must be true/false (yes/no is accepted too).');

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    row: {
      name,
      // The value was checked against ACCEPTED_CATEGORIES/UNITS, which mirror
      // the database enums — this is where that check meets the DB's own type.
      category: category as Product['category'],
      unit: unit as Product['unit'],
      mrp: mrp as number,
      selling_price: selling as number,
      stock: text(stockRaw) === '' ? 0 : (stock as number),
      description: description === '' ? null : description,
      brand: text(raw.brand) === '' ? null : text(raw.brand),
      subcategory: text(raw.subcategory) === '' ? null : text(raw.subcategory),
      is_active: active.value,
      image_url: text(raw.image_url) === '' ? null : text(raw.image_url),
    },
  };
}

// ---------------------------------------------------------------------------
// Diff — what the import WOULD do
// ---------------------------------------------------------------------------

/** Case- and space-insensitive key: the only stable name a shopkeeper can match. */
export function productKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Everything a file can change about a product, for "is this a no-op?".
 *
 * The photo link is deliberately NOT part of this: a spreadsheet cannot carry a
 * photo, so an import may only ever FILL IN a missing one (see planImport).
 * Comparing it here would turn "this file has no image column filled in" into a
 * request to erase the product's real photo.
 */
function rowEquals(a: TransferRow, b: TransferRow): boolean {
  return (
    a.name === b.name &&
    a.category === b.category &&
    a.unit === b.unit &&
    a.mrp === b.mrp &&
    a.selling_price === b.selling_price &&
    a.stock === b.stock &&
    (a.description ?? '') === (b.description ?? '') &&
    (a.brand ?? '') === (b.brand ?? '') &&
    (a.subcategory ?? '') === (b.subcategory ?? '') &&
    a.is_active === b.is_active
  );
}

/**
 * The heart of the import: pure, side-effect free, fully explained.
 *
 * @param rawRows rows straight from the file (already parsed)
 * @param existing products currently in the database (id + name + the fields a
 *                 file can change, so an unchanged row can be detected)
 * @param lineOffset 1 for CSV (the header occupies line 1), 0 for JSON
 */
export function planImport(
  rawRows: RawRow[],
  existing: (Product & { product_images?: { image_url: string }[] })[],
  lineOffset = 1,
): ImportPlan {
  const byName = new Map<string, Product & { product_images?: { image_url: string }[] }>();
  for (const product of existing) {
    const key = productKey(product.name);
    if (!byName.has(key)) byName.set(key, product);
  }

  const seenInFile = new Map<string, number>();
  const rows: PlannedRow[] = [];

  rawRows.forEach((raw, index) => {
    const line = index + 1 + lineOffset;
    const name = text(raw.name);

    const validation = validateTransferRow(raw);
    if (!validation.ok) {
      rows.push({ line, action: 'invalid', name, reasons: validation.reasons });
      return;
    }

    const row = validation.row;
    const key = productKey(row.name);

    const firstSeenAt = seenInFile.get(key);
    if (firstSeenAt !== undefined) {
      rows.push({
        line,
        action: 'invalid',
        name: row.name,
        reasons: [`Duplicate of line ${firstSeenAt} — only the first one is used.`],
      });
      return;
    }
    seenInFile.set(key, line);

    const current = byName.get(key);
    if (!current) {
      rows.push({ line, action: 'create', name: row.name, row, reasons: [] });
      return;
    }

    const currentRow: TransferRow = {
      name: current.name,
      category: current.category,
      unit: current.unit,
      mrp: Number(current.mrp),
      selling_price: Number(current.selling_price),
      stock: Number(current.stock),
      description: current.description ?? null,
      brand: current.brand ?? null,
      subcategory: current.subcategory ?? null,
      is_active: current.is_active,
      image_url: current.product_images?.[0]?.image_url ?? null,
    };

    // The photo link is the one field import may only ADD to. A product with a
    // photo keeps it (the file cannot prove it is better), and a blank cell in
    // the file means "no opinion", never "delete the photo".
    const fieldsMatch = rowEquals(row, currentRow);
    const currentImage = currentRow.image_url;
    const incomingImage = row.image_url;
    const fillsMissingImage = incomingImage !== null && !currentImage;
    const bringsDifferentImage = incomingImage !== null && Boolean(currentImage) && incomingImage !== currentImage;

    if (fieldsMatch && !fillsMissingImage) {
      rows.push({
        line,
        action: 'skip',
        name: row.name,
        existingId: current.id,
        reasons: ['Already matches the catalog — nothing to change.'],
      });
      return;
    }

    rows.push({
      line,
      action: 'update',
      name: row.name,
      row,
      existingId: current.id,
      reasons: [
        ...(fillsMissingImage ? ['Adds a photo link (this product has no photo yet).'] : []),
        ...(bringsDifferentImage ? ['Keeps the product’s existing photo.'] : []),
      ],
    });
  });

  const counts = {
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    skip: rows.filter((row) => row.action === 'skip').length,
    invalid: rows.filter((row) => row.action === 'invalid').length,
  };

  return { rows, counts, writable: rows.filter((row) => row.action === 'create' || row.action === 'update') };
}

/** Short, human summary used by the screen and by error messages. */
export function describePlan(plan: ImportPlan): string {
  const { create, update, skip, invalid } = plan.counts;
  const parts = [
    create > 0 ? `${create} new` : '',
    update > 0 ? `${update} updated` : '',
    skip > 0 ? `${skip} unchanged` : '',
    invalid > 0 ? `${invalid} skipped (invalid)` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'Nothing to import.' : parts.join(', ');
}

/** Label for a row in the preview list, e.g. "Toys · ₹18 · 10 in stock". */
export function describeRow(row: TransferRow): string {
  // A row may carry a database value the app's curated dropdown does not list,
  // so fall back to the raw value instead of showing "undefined".
  const category = CATEGORY_LABELS[row.category as ProductCategory] ?? row.category;
  const unit = UNIT_LABELS[row.unit as ProductUnit] ?? row.unit;
  const price = `₹${row.selling_price}`;
  return row.is_active
    ? `${category} · ${price} / ${unit} · ${row.stock} in stock`
    : `${category} · ${price} / ${unit} · ${row.stock} in stock · hidden`;
}

/** CSV/JSON template with one example row, for users starting from scratch. */
export function exportTemplate(): string {
  return productsToCsv([
    {
      name: 'Example Product',
      category: PRODUCT_CATEGORIES[0],
      unit: PRODUCT_UNITS[0],
      mrp: 20,
      selling_price: 18,
      stock: 10,
      description: 'Delete this row and add your own.',
      brand: '',
      subcategory: '',
      is_active: true,
      image_url: '',
    },
  ]);
}
