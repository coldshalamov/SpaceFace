export function isReleaseAssetMode(options = {}) {
  if (typeof options.releaseMode === 'boolean') return options.releaseMode;
  return true;
}
