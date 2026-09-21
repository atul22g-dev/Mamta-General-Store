/**
 * Module loader for embedding tests: resolves @/ → src/, mocks
 * react-native modules and redirects @/lib/supabase to the test mock.
 *
 * Registered from tests/embedding-generation.test.mjs via module.register().
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MOCK_MODULES = new Map([
  ['react-native-url-polyfill/auto', ''],
  ['react-native', '{}'],
]);

// Redirect @/lib/supabase to the mock module
const MOCK_SUPABASE_PATH = pathToFileURL(path.join(ROOT, 'tests', 'mock-supabase.mjs')).href;

export function resolve(specifier, context, nextResolve) {
  if (MOCK_MODULES.has(specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(MOCK_MODULES.get(specifier))}`, shortCircuit: true };
  }

  if (specifier === '@/lib/supabase' || specifier === '@/lib/supabase.ts') {
    return { url: MOCK_SUPABASE_PATH, shortCircuit: true };
  }

  if (specifier.startsWith('@/')) {
    let target = path.join(ROOT, 'src', specifier.slice(2));
    if (!path.extname(target)) target += '.ts';
    return nextResolve(pathToFileURL(target).href, context);
  }

  if (!specifier.startsWith('node:') && !specifier.endsWith('.ts') && !path.extname(specifier)) {
    try {
      return nextResolve(pathToFileURL(specifier + '.ts').href, context);
    } catch {
      // fall through
    }
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.endsWith('.ts') && !url.includes('node_modules')) {
    const filePath = fileURLToPath(url);
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    } catch {
      // Not a real file (e.g. data URI) — let the default loader handle it
    }
  }
  return nextLoad(url, context);
}
