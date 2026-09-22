/**
 * Module loader for edge-function (Deno) sources.
 *
 * tsconfig.json EXCLUDES `supabase/functions` — it is Deno code — so plain
 * `tsc` never type-checks it and an undefined identifier inside a deployed
 * function only shows up as a production HTTP 500. This loader makes those
 * modules importable from Node so their runtime behavior is testable:
 *
 *   1. `.ts` files are transpiled with the TypeScript compiler already in
 *      devDependencies (same approach as tests/alias-loader-embed.mjs).
 *   2. The two image CODECS the engine imports with `npm:` specifiers (which
 *      Node cannot resolve) are replaced by throwing stubs. Everything else —
 *      including the whole descriptor — is the REAL source, so the tests
 *      exercise deployed code rather than a stand-in.
 *
 * The codec stubs exist only to keep the module graph loadable: the descriptor
 * is a pure function of pixels, so the tests feed it raw RGB arrays and never
 * need a decoder. Real JPEG/PNG decoding is covered by the live edge-function
 * call in the deployment check.
 *
 * Registered from tests/edge-embedding-provider.test.mjs and
 * tests/image-descriptor.test.mjs via module.register().
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const UNAVAILABLE = 'Image codecs are not available in Node tests.';

const STUBBED_MODULES = new Map([
  [
    'npm:jpeg-js@0.4.4',
    `export default { decode() { throw new Error(${JSON.stringify(UNAVAILABLE)}); } };`,
  ],
  [
    'npm:pngjs@7.0.0',
    `export const PNG = { sync: { read() { throw new Error(${JSON.stringify(UNAVAILABLE)}); } } };
     export default { PNG };`,
  ],
]);

function stubUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

export function resolve(specifier, context, nextResolve) {
  if (STUBBED_MODULES.has(specifier)) {
    return { url: stubUrl(STUBBED_MODULES.get(specifier)), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const filePath = fileURLToPath(url);
    if (filePath.startsWith(ROOT)) {
      const source = fs.readFileSync(filePath, 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
