/**
 * Product export/import tests — the data rules behind the admin
 * "Export / Import" screen (src/lib/products/product-transfer.ts).
 *
 * These run the REAL module against hand-written files: the whole point is
 * that a shopkeeper's spreadsheet cannot corrupt the catalog, so the cases
 * below are the ones that actually happen — Excel's BOM, commas inside a
 * product name, a price typed with a ₹ sign, a file imported twice, and a
 * category that exists in the database but not in the app's dropdown.
 *
 * Run: node tests/product-transfer.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register(pathToFileURL(path.join(ROOT, 'tests', 'alias-loader.mjs')).href);

const {
  ACCEPTED_CATEGORIES,
  ACCEPTED_UNITS,
  CSV_COLUMNS,
  MAX_IMPORT_ROWS,
  buildExport,
  describePlan,
  describeRow,
  exportTemplate,
  parseCsv,
  parseTransferFile,
  planImport,
  productKey,
  productsToCsv,
  toTransferProduct,
  validateTransferRow,
} = await import('@/lib/products/product-transfer.ts');

const { PRODUCT_CATEGORIES, PRODUCT_UNITS } = await import('@/config/products.ts');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** A product row as it comes out of the database. */
function dbProduct(overrides = {}) {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Smily Face Ball',
    brand: overrides.brand ?? null,
    description: overrides.description ?? null,
    category: overrides.category ?? 'toys',
    subcategory: overrides.subcategory ?? null,
    mrp: overrides.mrp ?? 20,
    selling_price: overrides.selling_price ?? 18,
    stock: overrides.stock ?? 10,
    unit: overrides.unit ?? 'piece',
    is_active: overrides.is_active ?? true,
    created_at: '2026-09-22T11:20:32.157408+00:00',
    updated_at: '2026-09-22T11:31:02.075261+00:00',
    product_images: overrides.product_images ?? [
      { id: 'i1', image_url: 'https://example.com/ball.jpeg' },
    ],
  };
}

function row(overrides = {}) {
  return {
    name: 'New Item',
    category: 'toys',
    unit: 'piece',
    mrp: 100,
    selling_price: 90,
    stock: 5,
    ...overrides,
  };
}

/** A file row that matches dbProduct() exactly — for "nothing changed" cases. */
function rowForExisting(overrides = {}) {
  return {
    name: 'Smily Face Ball',
    category: 'toys',
    unit: 'piece',
    mrp: 20,
    selling_price: 18,
    stock: 10,
    image_url: 'https://example.com/ball.jpeg',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Format / schema
// ---------------------------------------------------------------------------
section('File shape');

test('the CSV carries every editable field in a stable order', () => {
  assert.deepEqual(
    [...CSV_COLUMNS],
    [
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
    ],
  );
});

test('buildExport names the file by format and date', () => {
  const csv = buildExport([], 'csv', '2026-09-22');
  const json = buildExport([], 'json', '2026-09-22');
  assert.equal(csv.filename, 'products-2026-09-22.csv');
  assert.equal(csv.mimeType, 'text/csv');
  assert.equal(json.filename, 'products-2026-09-22.json');
  assert.equal(json.mimeType, 'application/json');
});

test('a database row exports its first image as a public link', () => {
  const transfer = toTransferProduct(dbProduct());
  assert.equal(transfer.image_url, 'https://example.com/ball.jpeg');
  assert.equal(transfer.is_active, true);
  assert.equal(transfer.description, '');
  assert.equal(transfer.brand, '');
});

test('the template is itself importable', () => {
  const parsed = parseTransferFile(exportTemplate(), 'products-2026-09-22.csv');
  assert.ok(parsed.ok, 'template did not parse');
  assert.equal(parsed.raw.length, 1);
  const validated = validateTransferRow(parsed.raw[0]);
  assert.ok(validated.ok, `template row invalid: ${validated.reasons?.join(' ')}`);
});

// ---------------------------------------------------------------------------
// CSV reading & writing
// ---------------------------------------------------------------------------
section('CSV reading & writing');

test('commas, quotes and newlines inside a name survive a round trip', () => {
  const nasty = 'Combo Pack, "Deluxe"\nSize 2';
  const csv = productsToCsv([toTransferProduct(dbProduct({ name: nasty }))]);
  const parsed = parseTransferFile(csv, 'x.csv');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw[0].name, nasty);
});

test('a name starting with a formula character is neutralised for spreadsheets', () => {
  const csv = productsToCsv([toTransferProduct(dbProduct({ name: '=SUM(A1:A9)' }))]);
  // Excel/Sheets must see text, not a formula…
  assert.ok(csv.includes("'=SUM(A1:A9)"), `formula was not guarded:\n${csv}`);
  // …and the shop must still get their real name back after importing. The
  // guard is stripped while VALIDATING, so the plan and the product name never
  // show the apostrophe the spreadsheet needed.
  const parsed = parseTransferFile(csv, 'x.csv');
  const validated = validateTransferRow(parsed.raw[0]);
  assert.ok(validated.ok);
  assert.equal(validated.row.name, '=SUM(A1:A9)');
});

test('a name starting with a minus sign round-trips untouched', () => {
  const csv = productsToCsv([toTransferProduct(dbProduct({ name: '-50% Combo' }))]);
  const parsed = parseTransferFile(csv, 'x.csv');
  const validated = validateTransferRow(parsed.raw[0]);
  assert.ok(validated.ok);
  assert.equal(validated.row.name, '-50% Combo');
});

test("Excel's BOM and CRLF line endings are handled", () => {
  const file = '\ufeffname,category,unit,mrp,selling_price,stock\r\nBall,toys,piece,20,18,3\r\n';
  const parsed = parseTransferFile(file, 'products.csv');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw.length, 1);
  assert.equal(parsed.raw[0].name, 'Ball');
  assert.equal(parsed.raw[0].selling_price, '18');
});

test('blank lines and trailing newlines are not products', () => {
  const file = 'name,category,unit,mrp,selling_price\nBall,toys,piece,20,18\n\n\n';
  const parsed = parseTransferFile(file, 'x.csv');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw.length, 1);
});

test('a quoted field may contain a comma', () => {
  const table = parseCsv('a,"b,c",d\n');
  assert.deepEqual(table[0], ['a', 'b,c', 'd']);
});

test('escaped quotes inside a quoted field are unescaped', () => {
  const table = parseCsv('"say ""hi""",x\n');
  assert.deepEqual(table[0], ['say "hi"', 'x']);
});

test('an extra column is ignored and a missing one reads as blank', () => {
  const file = 'name,category,unit,mrp,selling_price,extra\nBall,toys,piece,20,18,ignored\n';
  const parsed = parseTransferFile(file, 'x.csv');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw[0].extra, 'ignored');
  // `description` is absent from the header entirely: the row must still be
  // valid, with an empty description rather than a crash or a rejected row.
  const validated = validateTransferRow(parsed.raw[0]);
  assert.ok(validated.ok, validated.ok ? '' : validated.reasons.join(' '));
  assert.equal(validated.row.description, null);
});

test('a file with no name column is rejected with an explanation', () => {
  const parsed = parseTransferFile('price,qty\n10,5\n', 'x.csv');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /name/i);
});

test('an empty file is rejected', () => {
  const parsed = parseTransferFile('   \n', 'x.csv');
  assert.equal(parsed.ok, false);
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------
section('JSON (backup format)');

test('a JSON export re-imports with ids and timestamps intact', () => {
  const json = buildExport([toTransferProduct(dbProduct())], 'json').text;
  const parsed = parseTransferFile(json, 'products.json');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw[0].id, 'p1');
  assert.equal(parsed.raw[0].created_at, '2026-09-22T11:20:32.157408+00:00');
});

test('a bare array of products is accepted', () => {
  const parsed = parseTransferFile('[{"name":"Ball","category":"toys","mrp":10,"selling_price":9}]', 'x.json');
  assert.ok(parsed.ok);
  assert.equal(parsed.raw.length, 1);
});

test('broken JSON is reported, not thrown', () => {
  const parsed = parseTransferFile('{"products":[{"name":"Ball",}]}', 'products.json');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /JSON/i);
});

test('a .json file holding CSV is rejected clearly', () => {
  const parsed = parseTransferFile('name,category\nBall,toys\n', 'products.json');
  assert.equal(parsed.ok, false);
});

test('JSON entries must be objects', () => {
  const parsed = parseTransferFile('["Ball","Bat"]', 'x.json');
  assert.equal(parsed.ok, false);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
section('Row validation');

test('a clean row becomes database-ready values', () => {
  const result = validateTransferRow(row());
  assert.ok(result.ok);
  assert.equal(result.row.stock, 5);
  assert.equal(result.row.is_active, true);
  assert.equal(result.row.description, null);
});

test('blank stock means zero and blank unit means piece', () => {
  const result = validateTransferRow({ ...row(), stock: '', unit: '' });
  assert.ok(result.ok);
  assert.equal(result.row.stock, 0);
  assert.equal(result.row.unit, 'piece');
});

test('prices typed with a currency sign or thousands separators are understood', () => {
  const result = validateTransferRow({ ...row(), mrp: '₹1,200', selling_price: '₹999' });
  assert.ok(result.ok);
  assert.equal(result.row.mrp, 1200);
  assert.equal(result.row.selling_price, 999);
});

test('a selling price above MRP is refused', () => {
  const result = validateTransferRow({ ...row(), mrp: 100, selling_price: 120 });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /cannot exceed MRP/i);
});

test('a missing name, a bad category and a fractional stock are all reported', () => {
  const result = validateTransferRow({ ...row(), name: '', category: 'nonsense', stock: '2.5' });
  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 3);
});

test('a value the database accepts but the app dropdown does not is still valid', () => {
  // 'groceries' and 'kg' exist in the PostgreSQL enums; the curated dropdown in
  // config/products.ts does not list them. An export of such a product must be
  // importable, or the backup feature would reject your own catalog.
  assert.ok(ACCEPTED_CATEGORIES.includes('groceries'));
  assert.ok(ACCEPTED_UNITS.includes('kg'));
  const result = validateTransferRow({ ...row(), category: 'groceries', unit: 'kg' });
  assert.ok(result.ok, result.ok ? '' : result.reasons.join(' '));
  assert.equal(result.row.category, 'groceries');
});

test('the app dropdown stays a curated subset', () => {
  assert.ok(PRODUCT_CATEGORIES.length < ACCEPTED_CATEGORIES.length);
  for (const category of PRODUCT_CATEGORIES) assert.ok(ACCEPTED_CATEGORIES.includes(category));
  for (const unit of PRODUCT_UNITS) assert.ok(ACCEPTED_UNITS.includes(unit));
});

test('accepted values are unique (a duplicate would silently widen the list)', () => {
  assert.equal(new Set(ACCEPTED_CATEGORIES).size, ACCEPTED_CATEGORIES.length);
  assert.equal(new Set(ACCEPTED_UNITS).size, ACCEPTED_UNITS.length);
});

test('a stray is_active value is refused rather than guessed', () => {
  const result = validateTransferRow({ ...row(), is_active: 'maybe' });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /is_active/);
});

// ---------------------------------------------------------------------------
// The plan (what the preview shows)
// ---------------------------------------------------------------------------
section('Import plan');

test('a new product is planned as a create', () => {
  const plan = planImport([row({ name: 'Brand New' })], [dbProduct()]);
  assert.equal(plan.counts.create, 1);
  assert.equal(plan.rows[0].action, 'create');
});

test('a changed price is planned as an update of the existing product', () => {
  const plan = planImport([row({ name: 'Smily Face Ball', selling_price: 15 })], [dbProduct()]);
  assert.equal(plan.counts.update, 1);
  assert.equal(plan.rows[0].existingId, 'p1');
});

test('re-importing your own export changes NOTHING', () => {
  const products = [dbProduct(), dbProduct({ id: 'p2', name: 'Green Ball', category: 'toys' })];
  const csv = buildExport(products.map(toTransferProduct), 'csv').text;
  const parsed = parseTransferFile(csv, 'products.csv');
  const plan = planImport(parsed.raw, products);
  assert.deepEqual(plan.counts, { create: 0, update: 0, skip: 2, invalid: 0 });
  assert.equal(plan.writable.length, 0);
});

test('a JSON backup also re-imports as unchanged', () => {
  const products = [dbProduct()];
  const json = buildExport(products.map(toTransferProduct), 'json').text;
  const parsed = parseTransferFile(json, 'products.json');
  const plan = planImport(parsed.raw, products, 0);
  assert.equal(plan.counts.skip, 1);
});

test('matching ignores case and extra spaces', () => {
  const plan = planImport([row({ name: '  smily   face BALL  ', selling_price: 15 })], [dbProduct()]);
  assert.equal(plan.counts.update, 1);
});

test('a name repeated in one file is reported, not silently overwritten', () => {
  const plan = planImport([row({ name: 'Same' }), row({ name: 'same' })], []);
  assert.equal(plan.counts.create, 1);
  assert.equal(plan.counts.invalid, 1);
  assert.match(plan.rows[1].reasons.join(' '), /Duplicate of line 2/);
});

test('an invalid row never blocks the good ones', () => {
  const plan = planImport([row({ name: 'Good' }), row({ name: '', category: 'toys' }), row({ name: 'Also Good' })], []);
  assert.equal(plan.counts.create, 2);
  assert.equal(plan.counts.invalid, 1);
  assert.equal(plan.rows[1].line, 3);
});

test('line numbers point at the CSV line a user sees in their editor', () => {
  const file = `name,category,unit,mrp,selling_price,stock\r\nBall,toys,piece,20,18,3\r\n,toys,piece,20,18,3\r\n`;
  const parsed = parseTransferFile(file, 'x.csv');
  const plan = planImport(parsed.raw, [], parsed.lineOffset);
  assert.equal(plan.rows[0].line, 2);
  assert.equal(plan.rows[1].line, 3);
  assert.equal(plan.rows[1].action, 'invalid');
});

test('the plan is a summary AND a list: counts must add up to the rows', () => {
  const plan = planImport(
    [row({ name: 'New One' }), row({ name: 'Smily Face Ball', selling_price: 15 }), row({ name: '' })],
    [dbProduct()],
  );
  const { create, update, skip, invalid } = plan.counts;
  assert.equal(create + update + skip + invalid, plan.rows.length);
  assert.equal(plan.writable.length, create + update);
  assert.match(describePlan(plan), /1 new, 1 updated, 1 skipped \(invalid\)/);
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
section('Photo links');

test('a link fills in a product that has no photo', () => {
  const plan = planImport([row({ name: 'No Photo', image_url: 'https://example.com/a.jpg' })], [
    dbProduct({ id: 'p3', name: 'No Photo', product_images: [] }),
  ]);
  assert.equal(plan.counts.update, 1);
  assert.match(plan.rows[0].reasons.join(' '), /Adds a photo link/);
});

test('a blank image cell never deletes an existing photo', () => {
  const plan = planImport([rowForExisting({ image_url: '' })], [dbProduct()]);
  assert.equal(plan.counts.skip, 1);
});

test('a different link does not replace the photo already on the product', () => {
  const plan = planImport(
    [rowForExisting({ selling_price: 15, image_url: 'https://example.com/other.jpg' })],
    [dbProduct()],
  );
  assert.equal(plan.counts.update, 1);
  assert.match(plan.rows[0].reasons.join(' '), /Keeps the product’s existing photo/);
});

test('the photo is not itself a reason to update an otherwise identical row', () => {
  const plan = planImport([rowForExisting({ image_url: 'https://example.com/other.jpg' })], [dbProduct()]);
  assert.equal(plan.counts.skip, 1);
});

// ---------------------------------------------------------------------------
// Helpers used by the screen
// ---------------------------------------------------------------------------
section('Screen helpers');

test('productKey normalises case and whitespace only', () => {
  assert.equal(productKey('  A   B  '), 'a b');
  assert.equal(productKey('A-B'), 'a-b');
});

test('describeRow shows the price, unit and stock a shopkeeper recognises', () => {
  const validated = validateTransferRow(row({ name: 'Ball', mrp: 20, selling_price: 18, stock: 4 }));
  assert.equal(describeRow(validated.row), 'Toys · ₹18 / Piece · 4 in stock');
});

test('describeRow marks a hidden product', () => {
  const validated = validateTransferRow(row({ is_active: 'false' }));
  assert.match(describeRow(validated.row), /hidden/);
});

test('a database-only category still has a readable label', () => {
  const validated = validateTransferRow(row({ category: 'groceries', unit: 'kg' }));
  assert.match(describeRow(validated.row), /Groceries|groceries/);
});

test('an empty plan says so instead of listing nothing', () => {
  assert.equal(describePlan(planImport([], [])), 'Nothing to import.');
});

test('the row cap is a documented, finite number', () => {
  assert.ok(Number.isInteger(MAX_IMPORT_ROWS) && MAX_IMPORT_ROWS > 0);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const { name, error } of failures) console.log(`\nFAILED: ${name}\n${error.stack}`);
  process.exit(1);
}
