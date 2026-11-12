/** Resolve URL-fetched data/workers against the same release as the game modules. */
export function runtimeAssetUrl(path, moduleUrl, {
  production = typeof __SPACEFACE_PRODUCTION__ !== 'undefined' && __SPACEFACE_PRODUCTION__ === true,
  documentBase = globalThis.document?.baseURI,
  workerEntry = typeof document === 'undefined' ? globalThis.self?.location?.href : null,
  releaseBase = typeof __SPACEFACE_RELEASE_BASE__ === 'string' ? __SPACEFACE_RELEASE_BASE__ : '',
} = {}) {
  if (!production) return new URL(`/${path}`, moduleUrl).href;
  // Retail module workers live under workers/. Their entry URL, rather than a shared chunk's
  // import.meta.url, identifies the deployment root when no document exists in the realm.
  const base = documentBase || (workerEntry ? new URL('../', workerEntry).href : moduleUrl);
  return new URL(path, releaseBase ? new URL(releaseBase, base) : base).href;
}
