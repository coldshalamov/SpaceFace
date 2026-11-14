// Calibrate only the original base Wasp trim. Native quarter-strength exports
// and faction-authored materials must retain their own emission.
export function calibrateWaspTrimEmission(material, assetId) {
  const data = material?.userData;
  if (assetId !== 'SF_WASP_PRODUCTION_V1'
    || (data?.spacefaceAuthoredMaterialName || material?.name) !== 'Material_Emissive_Cyan'
    || data?.forgeShip !== 'wasp' || data?.forgeFinish !== 'glow_cyan'
    || data?.spacefaceAuthoredEmissiveIntensity !== 3
    || !Number.isFinite(material.emissiveIntensity)) return false;
  const color = material.emissive;
  if (!color || Math.abs(color.r - 0.11443537473678589) > 1e-6
    || Math.abs(color.g - 0.8069522380828857) > 1e-6
    || Math.abs(color.b - 1) > 1e-6) return false;
  // The Forge profile recomputes from this authored baseline on every admission.
  // Updating it together with the current value makes reprofiling idempotent.
  data.spacefaceAuthoredEmissiveIntensity = 0.75;
  material.emissiveIntensity *= 0.25;
  return true;
}
