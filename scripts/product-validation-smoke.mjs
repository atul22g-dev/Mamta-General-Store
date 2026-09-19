/**
 * Plain-JS smoke test mirroring src/lib/products/product-validation.ts
 * (kept in lockstep) + the storage path derivation from product-service.
 */
let pass = 0;
let fail = 0;

function check(label, got, expected) {
  const same = JSON.stringify(got) === JSON.stringify(expected);
  if (same) pass++;
  else {
    fail++;
    console.log('FAIL:', label, '→ got', JSON.stringify(got), 'expected', JSON.stringify(expected));
  }
}

// --- mirror of product-validation.ts ---
const PRODUCT_CATEGORIES = ['groceries','snacks','household','beverages','personal_care','dairy','other'];
const PRODUCT_UNITS = ['piece','kg','gram','litre','ml','pack','dozen'];

function parseAmount(raw) {
  const t = raw.trim();
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
function parseInteger(raw) {
  const t = raw.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return null;
  const v = Number(t);
  return Number.isSafeInteger(v) ? v : null;
}
function validateProductForm(values) {
  const errors = {};
  if (values.name.trim().length === 0) errors.name = 'Product name is required.';
  else if (values.name.trim().length > 200) errors.name = 'Product name must be 200 characters or fewer.';
  if (!values.category) errors.category = 'Choose a category.';
  const mrp = parseAmount(values.mrp);
  if (values.mrp.trim() === '') errors.mrp = 'MRP is required.';
  else if (mrp === null) errors.mrp = 'MRP must be a number.';
  else if (mrp < 0) errors.mrp = 'MRP cannot be negative.';
  const sp = parseAmount(values.sellingPrice);
  if (values.sellingPrice.trim() === '') errors.sellingPrice = 'Selling price is required.';
  else if (sp === null) errors.sellingPrice = 'Selling price must be a number.';
  else if (sp < 0) errors.sellingPrice = 'Selling price cannot be negative.';
  else if (mrp !== null && sp > mrp) errors.sellingPrice = 'Selling price cannot exceed MRP.';
  if (values.stock.trim() !== '') {
    const stock = parseInteger(values.stock);
    if (stock === null) errors.stock = 'Stock must be a whole number.';
    else if (stock < 0) errors.stock = 'Stock cannot be negative.';
  }
  if (values.description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';
  return errors;
}

const base = { name: 'Rice', description: '', category: 'groceries', mrp: '500', sellingPrice: '450', stock: '10', unit: 'kg' };

// happy path
check('valid form', validateProductForm(base), {});
// required fields
check('missing name', validateProductForm({ ...base, name: '   ' }).name, 'Product name is required.');
check('missing category', validateProductForm({ ...base, category: '' }).category, 'Choose a category.');
check('missing mrp', validateProductForm({ ...base, mrp: '' }).mrp, 'MRP is required.');
check('missing price', validateProductForm({ ...base, sellingPrice: '' }).sellingPrice, 'Selling price is required.');
// numeric correctness
check('non-numeric mrp', validateProductForm({ ...base, mrp: 'abc' }).mrp, 'MRP must be a number.');
check('negative price', validateProductForm({ ...base, sellingPrice: '-5' }).sellingPrice, 'Selling price must be a number.');
check('price above mrp', validateProductForm({ ...base, sellingPrice: '501' }).sellingPrice, 'Selling price cannot exceed MRP.');
check('equal to mrp is fine', validateProductForm({ ...base, sellingPrice: '500' }), {});
check('decimal prices fine', validateProductForm({ ...base, mrp: '99.50', sellingPrice: '89.99' }), {});
check('stock negative', validateProductForm({ ...base, stock: '-3' }).stock, 'Stock must be a whole number.');
check('stock fractional', validateProductForm({ ...base, stock: '2.5' }).stock, 'Stock must be a whole number.');
check('stock blank means 0', validateProductForm({ ...base, stock: '' }), {});
check('stock zero fine', validateProductForm({ ...base, stock: '0' }), {});
check('huge stock fine', validateProductForm({ ...base, stock: '999999' }), {});
// name length
check('201-char name rejected', validateProductForm({ ...base, name: 'x'.repeat(201) }).name !== undefined, true);
check('200-char name fine', validateProductForm({ ...base, name: 'x'.repeat(200) }), {});

// --- storage path derivation (mirror of product-service) ---
function objectName(productId, localUri, uuid) {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(localUri);
  const ext = (match?.[1] ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${productId}/${uuid}.${ext}`;
}
check('jpeg uri', objectName('abc', 'file:///cache/IMG_1234.jpeg', 'u1'), 'abc/u1.jpeg');
check('png uri', objectName('abc', 'file:///c/pics/photo.PNG', 'u2'), 'abc/u2.png');
check('web uri with query', objectName('abc', 'https://x/img.webp?token=1', 'u3'), 'abc/u3.webp');
check('extensionless defaults to jpg', objectName('abc', 'file:///blob/xyz', 'u4'), 'abc/u4.jpg');
check('path sits under product folder', objectName('p-1', 'file:///a.heic', 'u5').startsWith('p-1/'), true);

console.log(`product flow smoke: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
