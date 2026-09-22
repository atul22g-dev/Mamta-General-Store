/**
 * Module loader for supabase/functions/visual-match/index.ts — the REAL
 * deployed edge source, imported into Node for decision-logic tests.
 *
 * Differences from tests/edge-module-loader.mjs (used by the descriptor
 * suites — do not change its shape, other suites rely on it):
 *   1. Also stubs `npm:@supabase/supabase-js@2` (the edge imports it at the
 *      top level; Node cannot resolve `npm:` specifiers).
 *   2. The TEST FILE sets `globalThis.Deno` BEFORE importing the module —
 *      index.ts reads `Deno.env` and calls `Deno.serve` at import time. The
 *      shim records nothing; the handler under test is exported separately.
 *
 * Everything else in the module graph is the unmodified production source.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STUBBED_MODULES = new Map([
  [
    'npm:@supabase/supabase-js@2',
    'export const createClient = () => ({ from: () => ({}) });\nexport default { createClient };',
  ],
  [
    'npm:jpeg-js@0.4.4',
    'export default { decode() { throw new Error("Image codecs are not available in Node tests."); } };',
  ],
  [
    'npm:pngjs@7.0.0',
    'export const PNG = { sync: { read() { throw new Error("Image codecs are not available in Node tests."); } } };\nexport default { PNG };',
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
