// One contract for the raw-module route, retail bundler and deployment reachability checks.
// Worker URLs are not imports: esbuild cannot discover these through the main-thread graph.
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

export function runtimeWorkerUrl(id, moduleUrl, {
  production = typeof __SPACEFACE_PRODUCTION__ !== 'undefined' && __SPACEFACE_PRODUCTION__ === true,
  documentBase = globalThis.document?.baseURI,
  releaseBase = typeof __SPACEFACE_RELEASE_BASE__ === 'string' ? __SPACEFACE_RELEASE_BASE__ : '',
} = {}) {
  const spec = RUNTIME_WORKERS.find(entry => entry.id === id);
  if (!spec) throw new RangeError(`Unknown runtime worker: ${id}`);
  // A split chunk's import.meta.url is NOT the document root. Use the deployment's
  // document base for retail. Vercel pins worker entries to the same release as the
  // bundled entry without changing document.baseURI (inline SVG fragments depend on it).
  if (production) {
    const base = documentBase || moduleUrl;
    return new URL(spec.output, releaseBase ? new URL(releaseBase, base) : base).href;
  }
  // Dev serves the source tree at the origin root — spec.source is a repo-root
  // path, so resolve it there regardless of which module asks.
  return new URL(`/${spec.source}`, moduleUrl).href;
}
