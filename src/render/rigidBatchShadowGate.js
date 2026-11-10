// Synchronous fence around temporary changes to the live renderer's shadow state.
const states = new WeakMap();
const censusParses = new WeakMap();
function stateFor(renderer) {
  let state = states.get(renderer);
  if (!state) { state = { depth: 0, listeners: new Set() }; states.set(renderer, state); }
  return state;
}
export function subscribeRigidBatchShadowWarm(renderer, listener) {
  if (!renderer || (typeof renderer !== 'object' && typeof renderer !== 'function')) return () => {};
  const state = stateFor(renderer);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}
export function rigidBatchShadowWarmActive(renderer) {
  return !!renderer && (states.get(renderer)?.depth || 0) > 0;
}
export function beginRigidBatchShadowWarm(renderer) {
  const state = stateFor(renderer);
  state.depth++;
  try { for (const listener of state.listeners) listener(); }
  catch (error) { state.depth--; throw error; }
  let ended = false;
  return () => { if (!ended) { ended = true; state.depth--; } };
}

// The existing census is only usable when complete and current. Its cast-light count must
// describe either no shadow light or precisely Nocturne's pinned, unlit spot light.
function parsedCastLane(memo) {
  const previous = censusParses.get(memo);
  if (previous?.sig === memo.sig) return previous.lane;
  const parts = memo.sig.split('|');
  let lane = '', valid = /^(f0|fx|fs)$/.test(parts.shift());
  const seen = new Set();
  for (const part of parts) {
    if (part === '' && parts.length === 1) continue; // canonical empty census: f0|
    const match = /^(AmbientLight|DirectionalLight|HemisphereLight|PointLight|RectAreaLight|SpotLight|LightProbe):(\d+):([01])x([1-9]\d*)$/.exec(part);
    if (!match || seen.has(part)) { valid = false; break; }
    seen.add(part);
    if (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) > 0xffffffff
        || !Number.isSafeInteger(Number(match[4]))) { valid = false; break; }
    if (match[3] === '1') {
      if (lane || match[1] !== 'SpotLight' || match[4] !== '1') { valid = false; break; }
      lane = part;
    }
  }
  if (!parts.length) valid = false;
  const result = valid ? lane : null;
  censusParses.set(memo, { sig: memo.sig, lane: result });
  return result;
}

export function rigidBatchDepthProvenOff(owner, censusEpoch) {
  const renderer = owner?.renderer, scene = owner?.scene, memo = owner?._shadowCensusMemo;
  const video = owner?.state?.settings?.video;
  if (!renderer || !scene || !video || video.shadows !== false
      || owner._shadowSettingOn !== false || owner._contextLost === true
      || rigidBatchShadowWarmActive(renderer) || !memo || memo.scene !== scene
      || memo.epoch !== censusEpoch || memo.pendingIter || typeof memo.sig !== 'string') return false;
  const nocturne = owner._nocturne;
  if (nocturne?.shadowsEnabled !== false && nocturne != null) return false;
  if (nocturne && video.nocturne !== false && video.nocturneShadows !== false) return false;
  const castLane = parsedCastLane(memo);
  if (castLane === null) return false;
  if (!castLane) return true;
  const light = nocturne?.shadowLight;
  if (nocturne?.shadowConfigured !== true || !light || light.isSpotLight !== true
      || light.castShadow !== true || light.intensity !== 0) return false;
  let node = light;
  while (node && node !== scene) { if (node.visible === false) return false; node = node.parent; }
  if (node !== scene) return false;
  const mask = Number.isFinite(light.layers?.mask) ? light.layers.mask : 1;
  return castLane === `SpotLight:${mask}:1x1`;
}
