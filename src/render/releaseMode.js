export function isReleaseAssetMode(options = {}) {
  if (typeof options.releaseMode === 'boolean') return options.releaseMode;

  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (g.SPACEFACE_RELEASE === true || g.__SPACEFACE_RELEASE__ === true) return true;

  const env = typeof process !== 'undefined' && process.env ? process.env : null;
  if (env && (env.SPACEFACE_RELEASE === '1' || env.SPACEFACE_RELEASE === 'true' || env.NODE_ENV === 'production')) {
    return true;
  }

  const loc = typeof location !== 'undefined' ? location : g.location;
  const search = loc && typeof loc.search === 'string' ? loc.search : '';
  if (search) {
    const params = new URLSearchParams(search);
    if (params.get('prod') === '1' || params.get('release') === '1') return true;
  }

  return false;
}
