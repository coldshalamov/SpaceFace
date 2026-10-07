import { join, dirname } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { RUNTIME_WORKERS } from '../../src/render/runtimeWorkers.js';

// Syntax floor, not a claim that every device meeting it has enough GPU memory.
export const RETAIL_BROWSER_TARGETS = Object.freeze(['chrome110', 'safari16']);

/** Emit each worker as a self-contained entry in its actual execution format.
 * Digest is a classic Worker (no ESM imports); prepass is a module Worker and
 * bundles its vendored meshopt decoder. Neither may import a main-thread chunk.
 */
export async function buildRetailRuntimeWorkers({ esbuild, root, outdir }) {
  for (const spec of RUNTIME_WORKERS) {
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
      if (output.imports.length) throw new Error(`Runtime worker must be self-contained: ${spec.id}`);
    }
    if (!(await stat(outfile)).size) throw new Error(`Runtime worker is empty: ${spec.output}`);
  }
}
