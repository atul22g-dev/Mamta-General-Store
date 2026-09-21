/**
 * Shared formatters — single source of truth for money display.
 * Indian Rupee format: ₹28, ₹245, ₹1,250 (no decimals when whole,
 * grouping via en-IN lakhs/crores, exactly 2 decimals when fractional).
 */
export function formatPrice(value: number): string {
  // Supabase may return numeric columns as strings in some configurations.
  // Coerce strings to numbers so the UI never shows raw type artifacts.
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) {
    if (typeof value === 'string' || value == null) {
      console.warn(`[formatPrice] Non-numeric price value: ${JSON.stringify(value)} — check products.selling_price column`);
    }
    return '—';
  }
  const hasFraction = num % 1 !== 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Formats a unit label from the DB enum, falling back to the raw value. */
export function formatUnit(unit: string, labels: Record<string, string>): string {
  return labels[unit] ?? unit;
}

/**
 * Measured units whose price is quoted PER unit in retail
 * (wire, fabric, pipe, rope…). Products with these units display
 * "₹45/meter" instead of a bare "₹45" so customers know the price
 * is per measured length, not per piece.
 */
const PER_UNIT_SUFFIX: Record<string, string> = {
  Meter: 'meter',
};

/**
 * Price + unit for display: appends "/<unit>" for measured units
 * (₹45/meter) and returns the plain price for everything else (₹28).
 * Never shows a suffix for piece/pack goods.
 */
export function formatPriceWithUnit(price: number, unit: string): string {
  const base = formatPrice(price);
  const suffix = PER_UNIT_SUFFIX[unit];
  return suffix ? `${base}/${suffix}` : base;
}
