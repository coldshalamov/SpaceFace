import { existsSync } from 'node:fs';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { RUNTIME_WORKERS } from '../../src/render/runtimeWorkers.js';

// Syntax floor, not a claim that every device meeting it has enough GPU memory.
export const RETAIL_BROWSER_TARGETS = Object.freeze(['chrome110', 'safari16']);

/**
 * Runtime-worker emission is two shapes, keyed on spec.type:
 *  - classic: a self-contained classic Worker build (no ESM imports possible)
 *    — emitted here, asserted import-free.
 *  - module: an ESM Worker that shares chunks with the main bundle — emitted as
 *    an extra entry in the main esbuild call so vendored deps (three/rapier and
 *    the whole sim) are deduped instead of re-bundled (~14 MB on the sim lane).
 *    The emitted file's imports resolve to shared chunks inside the deployment
 *    root, which every runtime route serves same-origin (Vercel https, dev http,
 *    Electron's loopback http server — nothing ships file://).
 */

/** Entries for the main esbuild call: 'workers/<basename>' → source path. */
export function moduleWorkerEntryPoints(root) {
  const entries = {};
  for (const spec of RUNTIME_WORKERS) {
    if (spec.type !== 'module') continue;
    entries[spec.output.replace(/\.m?js$/i, '')] = join(root, spec.source);
  }
  return entries;
}

/** Emit each classic worker as a self-contained entry in its execution format. */
export async function buildRetailRuntimeWorkers({ esbuild, root, outdir }) {
  for (const spec of RUNTIME_WORKERS) {
    if (spec.type !== 'classic') continue;
    const outfile = join(outdir, spec.output);
    await mkdir(dirname(outfile), { recursive: true });
    const result = await esbuild.build({
      entryPoints: [join(root, spec.source)], outfile, bundle: true,
      format: spec.format, platform: 'browser', target: [...RETAIL_BROWSER_TARGETS],
      minify: true, treeShaking: true, sourcemap: false, legalComments: 'none',
      metafile: true, logLevel: 'warning',
    });
    if (result.errors.length) throw new Error(`Runtime worker build failed: ${spec.id}`);
    for (const output of Object.values(result.metafile.outputs)) {
      if (output.imports.length) throw new Error(`Classic runtime worker must be self-contained: ${spec.id}`);
    }
    if (!(await stat(outfile)).size) throw new Error(`Runtime worker is empty: ${spec.output}`);
  }
}

/**
 * After the main bundle emits, prove each module worker's output exists and
 * every import specifier in it is a relative path resolving to a shipped file —
 * a bare specifier or missing chunk 404s the worker at runtime.
 */
export async function validateRetailModuleWorkers({ outdir }) {
  for (const spec of RUNTIME_WORKERS) {
    if (spec.type !== 'module') continue;
    const file = join(outdir, spec.output);
    const text = await readFile(file, 'utf8').catch(() => '');
    if (!text.length) throw new Error(`Runtime worker is empty or missing: ${spec.output}`);
    const dir = dirname(file);
    // Static `from`/`import "x"` and dynamic `import("x")` specifiers in the
    // minified ESM output all appear adjacent to these keywords.
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specifier = m[1];
      if (!specifier.startsWith('.')) {
        throw new Error(`Runtime worker ${spec.id} imports '${specifier}' — must resolve inside the bundle`);
      }
      if (!existsSync(join(dir, specifier))) {
        throw new Error(`Runtime worker ${spec.id} import misses the bundle: ${specifier}`);
      }
    }
  }
}
