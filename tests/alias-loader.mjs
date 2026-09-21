/**
 * Module loader for tests: transpiles the project's TypeScript in-memory
 * via the installed typescript package and resolves '@/…' specifiers to
 * './src/…'. Keeps the unit tests dependency-light while testing the REAL
 * source modules unmodified.
 *
 * Registered from tests/visual-match.test.mjs via module.register().
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve '@/x' → '<root>/src/x', adding the .ts extension when omitted. */
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let target = path.join(ROOT, 'src', specifier.slice(2));
    if (!path.extname(target)) target += '.ts';
    return nextResolve(pathToFileURL(target).href, context);
  }
  // Extensionless relative imports inside transpiled TS get .ts too.
  if (!specifier.startsWith('node:') && !specifier.endsWith('.ts') && !path.extname(specifier)) {
    try {
      return nextResolve(pathToFileURL(specifier + '.ts').href, context);
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}

/** Transpile .ts sources to ESM on load. */
export function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const filePath = fileURLToPath(url);
    const source = fs.readFileSync(filePath, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
