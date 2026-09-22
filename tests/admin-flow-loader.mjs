/**
 * Module loader for the admin lifecycle test: transpiles the project's TS
 * (like tests/alias-loader.mjs), redirects @/services/supabase.service to
 * the STATEFUL mock, and stubs react-native / expo modules the services
 * touch (hooks are asserted statically; the service layer runs for real).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MOCK_SUPABASE = pathToFileURL(path.join(ROOT, 'tests', 'admin-flow-mocks.mjs')).href;

const STUBS = new Map([
  ['react-native-url-polyfill/auto', ''],
  [
    'react-native',
    [
      "export const Platform = { OS: 'ios' };",
      'export const Image = {};',
      'export const Pressable = {};',
      'export const View = {};',
    ].join('\n'),
  ],
  [
    'expo-image-manipulator',
    [
      'export const ImageManipulator = { manipulate: () => ({}) };',
      "export const SaveFormat = { JPEG: 'jpeg' };",
    ].join('\n'),
  ],
  [
    'expo-file-system',
    [
      'export class File {',
      '  constructor() {}',
      '  get exists() { return true; }',
      '  arrayBuffer() { return Promise.resolve(new ArrayBuffer(8)); }',
      '}',
    ].join('\n'),
  ],
  [
    // image.service is covered by its own suite (image-optimizer.test.mjs);
    // here it is stubbed to the post-optimization contract: a JPEG URI.
    '@/services/image.service',
    [
      'export class ImageServiceError extends Error {}',
      "export async function optimizeImageUri() { return 'file:///cache/optimized.jpg'; }",
    ].join('\n'),
  ],
]);

function stubUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

export function resolve(specifier, context, nextResolve) {
  if (STUBS.has(specifier)) {
    return { url: stubUrl(STUBS.get(specifier)), shortCircuit: true };
  }
  if (specifier === '@/services/supabase.service') {
    return { url: MOCK_SUPABASE, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    let target = path.join(ROOT, 'src', specifier.slice(2));
    if (!/\.(ts|tsx|js|mjs|json)$/.test(target)) target += '.ts';
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (!specifier.startsWith('node:') && !/\.(ts|tsx|js|mjs|json)$/.test(specifier)) {
    try {
      return nextResolve(pathToFileURL(specifier + '.ts').href, context);
    } catch {
      // fall through
    }
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
