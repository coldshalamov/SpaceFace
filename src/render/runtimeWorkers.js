// One contract for the raw-module route, retail bundler and deployment reachability checks.
// Worker URLs are not imports: esbuild cannot discover these through the main-thread graph.
export const RUNTIME_WORKERS = Object.freeze([
  Object.freeze({ id: 'digest', source: 'src/render/renderPackageDigestWorker.js',
    output: 'workers/renderPackageDigestWorker.js', type: 'classic', format: 'iife' }),
  Object.freeze({ id: 'prepass', source: 'src/render/glbPrepassWorker.js',
    output: 'workers/glbPrepassWorker.js', type: 'module', format: 'esm' }),
]);

export function runtimeWorkerUrl(id, moduleUrl, {
  production = typeof __SPACEFACE_PRODUCTION__ !== 'undefined' && __SPACEFACE_PRODUCTION__ === true,
  documentBase = globalThis.document?.baseURI,
} = {}) {
  const spec = RUNTIME_WORKERS.find(entry => entry.id === id);
  if (!spec) throw new RangeError(`Unknown runtime worker: ${id}`);
  // A split chunk's import.meta.url is NOT the document root. Use the deployment's
  // document base for retail, including deployments hosted below a path prefix.
  if (production) return new URL(spec.output, documentBase || moduleUrl).href;
  return new URL(`./${spec.source.split('/').pop()}`, moduleUrl).href;
}
