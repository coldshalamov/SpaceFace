// One contract for the raw-module route, retail bundler and deployment reachability checks.
// Worker URLs are not imports: esbuild cannot discover these through the main-thread graph.
import { runtimeAssetUrl } from '../core/runtimeAssetUrl.js';
export { runtimeAssetUrl };
export const RUNTIME_WORKERS = Object.freeze([
  Object.freeze({ id: 'digest', source: 'src/render/renderPackageDigestWorker.js',
    output: 'workers/renderPackageDigestWorker.js', type: 'classic', format: 'iife' }),
  Object.freeze({ id: 'prepass', source: 'src/render/glbPrepassWorker.js',
    output: 'workers/glbPrepassWorker.js', type: 'module', format: 'esm' }),
  // The whole-sim lane worker (S1): default runtime since Stage E. Same contract —
  // URL-created, invisible to the main-thread bundler, emitted as a self-contained
  // retail entry under workers/ so the deployment root resolves it.
  Object.freeze({ id: 'simLane', source: 'src/core/wholeSimBrowserWorker.js',
    output: 'workers/wholeSimBrowserWorker.js', type: 'module', format: 'esm' }),
]);

export function runtimeWorkerUrl(id, moduleUrl, options = {}) {
  const spec = RUNTIME_WORKERS.find(entry => entry.id === id);
  if (!spec) throw new RangeError(`Unknown runtime worker: ${id}`);
  const production = options.production ?? (typeof __SPACEFACE_PRODUCTION__ !== 'undefined'
    && __SPACEFACE_PRODUCTION__ === true);
  return runtimeAssetUrl(production ? spec.output : spec.source, moduleUrl, { ...options, production });
}
