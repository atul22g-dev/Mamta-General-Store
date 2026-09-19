/**
 * Shared formatters — single source of truth for money display.
 * Indian Rupee format: ₹28, ₹245, ₹1,250 (no decimals when whole,
 * grouping via en-IN lakhs/crores, exactly 2 decimals when fractional).
 */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const hasFraction = value % 1 !== 0;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Formats a unit label from the DB enum, falling back to the raw value. */
export function formatUnit(unit: string, labels: Record<string, string>): string {
  return labels[unit] ?? unit;
}
