import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const SHIM = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'esbuild-shim.mjs')).href;
export async function resolve(specifier, context, next) {
  if (specifier === 'esbuild' && context.parentURL && context.parentURL.endsWith('/scripts/build-bundle.mjs')) {
    return { url: SHIM, shortCircuit: true };
  }
  return next(specifier, context);
}
