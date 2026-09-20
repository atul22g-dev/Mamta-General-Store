/**
 * Product form validation — pure functions, no React/Supabase imports,
 * so the rules are unit-testable in isolation.
 *
 * Categories & units are NOT defined here — they come from the editable
 * config: src/config/products.ts (this file re-exports them so existing
 * imports keep working).
 */

import type { ProductCategory, ProductUnit } from '@/config/products';

export {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  CATEGORY_LABELS,
  UNIT_LABELS,
  type ProductCategory,
  type ProductUnit,
} from '@/config/products';

export type ProductFormValues = {
  name: string;
  description: string;
  category: ProductCategory | '';
  mrp: string;
  sellingPrice: string;
  stock: string;
  unit: ProductUnit;
};

/** Defaults for a brand-new empty form (lives with the values type it mirrors). */
export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  description: '',
  category: '',
  mrp: '',
  sellingPrice: '',
  stock: '',
  unit: 'piece',
};

export type ProductFormErrors = Partial<
  Record<'name' | 'category' | 'mrp' | 'sellingPrice' | 'stock' | 'description', string>
>;

/** Parses a user-typed number: trims, rejects junk, allows decimals. */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null; // digits + optional decimals only
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Parses a user-typed integer (stock). */
export function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null; // whole numbers only, no sign
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Validates the form. Rules:
 *  - name required
 *  - category required
 *  - mrp required, numeric, >= 0
 *  - selling price required, numeric, >= 0, <= mrp
 *  - stock required-ish: blank → 0, otherwise non-negative integer
 */
export function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};

  if (values.name.trim().length === 0) {
    errors.name = 'Product name is required.';
  } else if (values.name.trim().length > 200) {
    errors.name = 'Product name must be 200 characters or fewer.';
  }

  if (!values.category) {
    errors.category = 'Choose a category.';
  }

  const mrp = parseAmount(values.mrp);
  if (values.mrp.trim() === '') {
    errors.mrp = 'MRP is required.';
  } else if (mrp === null) {
    errors.mrp = 'MRP must be a number.';
  } else if (mrp < 0) {
    errors.mrp = 'MRP cannot be negative.';
  }

  const sellingPrice = parseAmount(values.sellingPrice);
  if (values.sellingPrice.trim() === '') {
    errors.sellingPrice = 'Selling price is required.';
  } else if (sellingPrice === null) {
    errors.sellingPrice = 'Selling price must be a number.';
  } else if (sellingPrice < 0) {
    errors.sellingPrice = 'Selling price cannot be negative.';
  } else if (mrp !== null && sellingPrice > mrp) {
    errors.sellingPrice = 'Selling price cannot exceed MRP.';
  }

  if (values.stock.trim() === '') {
    // Blank stock means zero — allowed.
  } else {
    const stock = parseInteger(values.stock);
    if (stock === null) {
      errors.stock = 'Stock must be a whole number.';
    } else if (stock < 0) {
      errors.stock = 'Stock cannot be negative.';
    }
  }

  if (values.description.length > 2000) {
    errors.description = 'Description must be 2000 characters or fewer.';
  }

  return errors;
}

export function isFormValid(errors: ProductFormErrors): boolean {
  return Object.keys(errors).length === 0;
}
