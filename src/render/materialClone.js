// Material.copy() copies userData but not instance-assigned onBeforeCompile /
// customProgramCacheKey, so an authored shader patch would be dropped while its
// userData receipt survived — leaving a flag that lies and a cache key that no
// longer matches the source it was compiled from.
// Exported for the regression test that pins the clone contract.
export function cloneMaterialPreservingShaderHooks(base) {
  const clone = base.clone();
  if (Object.hasOwn(base, 'onBeforeCompile')) clone.onBeforeCompile = base.onBeforeCompile;
  if (Object.hasOwn(base, 'customProgramCacheKey')) clone.customProgramCacheKey = base.customProgramCacheKey;
  clone.needsUpdate = true;
  return clone;
}
