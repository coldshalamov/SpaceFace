// C01-05 — Lights Out: the room's own blackout.
//
// The sim (swarmCourseTwists) asks for a light level on `swarm:arenaLights`; this
// module owns the answer on the presentation clock. It runs after the renderer's
// palette write and scales ONLY the four sector-rig lights (ambient/key/rim/fill) —
// player lamps, engine glows and lane lights are authored outside that rig and keep
// their brightness for free. Fog is untouched: the room dims, it does not haze.
//
// The write is an output gain, applied after whatever the palette lerp produced
// this frame: when the rig (or a sector transition) rewrites an intensity, the new
// authored value becomes the base the scale rides on. Restore asks level 1 back and
// the fade hands every light its authored number — nothing is stuck dim.

const RIG_SLOTS = ['ambient', 'key', 'rim', 'fill'];

const state_ = {
  bus: null,
  level: 1,      // currently applied scale
  from: 1,       // level the current fade anchored at
  target: 1,     // requested scale
  fadeS: 2,      // seconds to cross to the target
  elapsed: 0,    // seconds into the current fade
  reason: null,
  base: { ambient: 1, key: 1, rim: 1, fill: 1 },
  lastScaled: { ambient: NaN, key: NaN, rim: NaN, fill: NaN },
};

/** Idempotent attach — the render phase calls this with its live bus each frame. */
export function attachSectorDimmer(bus) {
  if (!bus || typeof bus.on !== 'function' || state_.bus === bus) return;
  state_.bus = bus;
  bus.on('swarm:arenaLights', (payload) => {
    if (!payload) return;
    const level = Number(payload.level);
    if (!Number.isFinite(level) || level < 0) return;
    state_.from = state_.level;           // a new request re-anchors the ramp where it stands
    state_.elapsed = 0;
    state_.target = Math.min(1, level);
    state_.fadeS = Number.isFinite(payload.fadeS) && payload.fadeS > 0 ? payload.fadeS : 0;
    state_.reason = typeof payload.reason === 'string' ? payload.reason : null;
  });
}

/**
 * Post-palette write: advance the fade, then scale the four rig lights in place.
 * `dt` is the presentation delta — the dim is a wall-paced cosmetic, never a sim input.
 */
export function applySectorDimmer(render, dt) {
  const t = state_;
  if (t.level !== t.target) {
    t.elapsed += Math.max(0, Number(dt) || 0);
    const k = t.fadeS > 0 ? Math.min(1, t.elapsed / t.fadeS) : 1;
    t.level = t.from + (t.target - t.from) * k;
    if (Math.abs(t.target - t.level) < 1e-4) t.level = t.target;
  }
  const rig = render && render._sectorPaletteRig;
  if (!rig || !rig.lights) return;
  for (const slot of RIG_SLOTS) {
    const light = rig.lights[slot];
    if (!light) continue;
    const raw = Number(light.intensity);
    if (!Number.isFinite(raw)) continue;
    if (raw !== t.lastScaled[slot]) t.base[slot] = raw; // the rig rewrote it — new authored base
    const scaled = t.base[slot] * t.level;
    if (scaled !== raw) {
      light.intensity = scaled;
      t.lastScaled[slot] = scaled;
    } else {
      t.lastScaled[slot] = raw;
    }
  }
}

/** Debug/test surface — the scale currently applied, and the requested level. */
export function sectorDimmerStatus() {
  return { level: state_.level, target: state_.target, reason: state_.reason };
}

/** Test seam: forget the attach + fade so a fresh boot starts clean. */
export function resetSectorDimmerForTest() {
  state_.bus = null;
  state_.level = 1;
  state_.from = 1;
  state_.target = 1;
  state_.fadeS = 2;
  state_.elapsed = 0;
  state_.reason = null;
  for (const slot of RIG_SLOTS) { state_.base[slot] = 1; state_.lastScaled[slot] = NaN; }
}
