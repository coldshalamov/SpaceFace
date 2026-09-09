// One geometry-compression profile for reviewed candidates and the live SG04 release tree.
// Keeping this shared prevents a visually accepted asset from being re-quantized differently when
// it is wired into the game. These values favor authored surface normals and UV stability; measured
// release size/performance checks remain responsible for detecting a real budget regression.
export const RELEASE_MESHOPT_OPTIONS = Object.freeze({
  level: 'high',
  quantizePosition: 14,
  quantizeNormal: 12,
  quantizeTexcoord: 13,
  quantizeColor: 8,
  quantizeWeight: 8,
  quantizeGeneric: 12,
});
