// Serialized into page.evaluate. Production publishes only the read-only witness,
// never the mutable SF/state debug global. Do not enable debug to collect evidence.
export function collectMobileCameraWitness() {
  const witness = globalThis.__SF_WITNESS__;
  if (typeof witness?.cameraSnapshot !== 'function') {
    return { available: false, reason: 'production-camera-witness-unavailable' };
  }
  try { return witness.cameraSnapshot(); }
  catch { return { available: false, reason: 'production-camera-witness-failed' }; }
}
