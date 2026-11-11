// inf-latch-heft-read — WF-12: the Line's bite reads what it caught.
//
// The latch read (tetherCableEventMethods._onTetherLatch) fired one recipe for every body: the
// same cyan flash pair and the same white contact-plane spark disc, whether the Line bit a sliver
// of ice or a slab the hull will never budge. The HUD's F4 preview prints `MASS n · HEAVY HAUL` in
// words beside the bracket, but the picture at the anchor said nothing about what the swing was
// about to carry. The anchor end now speaks the body:
//
//   substance  the spark disc takes the struck surface's own spray — rock throws slow warm grit,
//              ice glitters fast and pale, crystal/ceramic flicks short violet-white glints, metal
//              (ore, junk, hulls, station plate) sheds hot orange sparks — classified by the same
//              impactMaterialForTarget the impact ear and impact VFX read, so the latch, the shot
//              and the drill all agree on what a rock is made of.
//   heft       the target's share of the coupled pair, m_t / (m_owner + m_t) — the HUD F4 bridle
//              fraction, on the HUD's own band thresholds — shapes the bite: a body that swings
//              loose throws more, faster, smaller spray and no ring; an even pull rolls a faint
//              ring off the hull; a heavy haul throws fewer, larger, slower chunks under a wider
//              ring; a body that won't budge rolls the widest, slowest ring — the load seating.
//              The ring is sized from the body's own radius, so a big heavy rock reads big.
//
// Boundaries: a shielded hull whose shell takes the bite keeps the shell's contact
// (inf-line-shield-bite) and today's disc — the Line bit the field, not the body. A body with
// neither a classified surface nor a known mass claims nothing: today's read. No ring is ever
// drawn without a mass to justify it. Reduced motion/flash stretches (slower spray, longer and
// softer ring), never silences. Pure and allocation-free: the caller passes a scratch `out` and
// owns the pools, the RNG and the spawn.

import { impactMaterialForTarget } from '../../presentation/causalVfxGrammar.js';

/** The HUD F4 band thresholds (masslineHud MASS_BANDS: WON'T BUDGE / HEAVY HAUL / EVEN PULL). */
export const LATCH_HEFT_BANDS = Object.freeze([
  Object.freeze({ share: 0.8, id: 'anchor' }),
  Object.freeze({ share: 0.55, id: 'heavy' }),
  Object.freeze({ share: 0.35, id: 'even' }),
]);
/** Below the lowest threshold the body swings loose (the HUD's SWINGS LOOSE). */
export const LATCH_HEFT_LOOSE = 'loose';

// Spray per substance, as multipliers on today's contact-plane disc (speed 14 + rand·30 wu/s,
// life 0.18 + rand·0.3 s, size 1.35, drag 2.8, count 14 × burst). c0 → c1 is the spark's cooling.
export const LATCH_HEFT_SPRAY = Object.freeze({
  rock: Object.freeze({ c0: '#d9c3a0', c1: '#6e5a45', ring: '#b8a283', speed: 0.7, life: 1.5, size: 1.35, count: 0.85, drag: 1.2 }),
  ice: Object.freeze({ c0: '#f0fbff', c1: '#7fd0ff', ring: '#cdeeff', speed: 1.3, life: 1.15, size: 0.85, count: 1.3, drag: 0.75 }),
  ceramic: Object.freeze({ c0: '#fbf3ff', c1: '#a58cff', ring: '#ded2ff', speed: 1.15, life: 0.75, size: 0.8, count: 1.0, drag: 0.9 }),
  metal: Object.freeze({ c0: '#fff0c8', c1: '#ff7a2a', ring: '#ffc890', speed: 1.1, life: 0.8, size: 0.85, count: 1.15, drag: 0.95 }),
});

// The impact classifier's vocabulary folded onto the four sprays. Shield is the shell's own read;
// unknown claims nothing.
const SPRAY_FOR_MATERIAL = Object.freeze({
  rock: 'rock', ice: 'ice', ceramic: 'ceramic', composite: 'metal', hull: 'metal', armor: 'metal',
});

// Heft shaping. `ring` radiusMul is the ring's outer reach as a multiple of the body radius.
const BAND_SHAPE = Object.freeze({
  loose: Object.freeze({ count: 1.3, speed: 1.25, size: 0.85, ringMul: 0, ringLife: 0, ringOp: 0 }),
  even: Object.freeze({ count: 1.0, speed: 1.0, size: 1.0, ringMul: 1.2, ringLife: 0.34, ringOp: 0.26 }),
  heavy: Object.freeze({ count: 0.8, speed: 0.75, size: 1.3, ringMul: 1.6, ringLife: 0.6, ringOp: 0.4 }),
  anchor: Object.freeze({ count: 0.6, speed: 0.55, size: 1.5, ringMul: 2.0, ringLife: 0.85, ringOp: 0.5 }),
});
/** A body with a known surface but no known mass keeps the authored disc shape. */
const NEUTRAL_SHAPE = BAND_SHAPE.even;

/** Today's disc colours (the unknown-surface read). */
export const LATCH_DISC_C0 = '#eaf6ff';
const LATCH_RING_NEUTRAL = '#d7f7ff';
/** Ring reach clamp (wu, radius): a pebble still shows a ring, a mountain does not swallow the screen. */
const RING_RADIUS_MIN = 3;
const RING_RADIUS_MAX = 90;

/** Mass the live solver couples: physics-body mass, else the authored entity mass (HUD rule). */
export function latchBodyMass(entity) {
  const body = Number(entity && entity.physicsBody && entity.physicsBody.mass);
  if (Number.isFinite(body) && body > 0) return body;
  const mass = Number(entity && entity.mass);
  return Number.isFinite(mass) && mass > 0 ? mass : NaN;
}

/** The target's share of the coupled pair, or NaN when either mass is unknown. */
export function latchHeftShare(targetMass, ownerMass) {
  const t = Number(targetMass);
  const o = Number(ownerMass);
  if (!(t > 0) || !(o > 0) || !Number.isFinite(t) || !Number.isFinite(o)) return NaN;
  return t / (o + t);
}

/** Band id for a share; null when the share is unknown. */
export function latchHeftBand(share) {
  if (!Number.isFinite(share)) return null;
  for (let i = 0; i < LATCH_HEFT_BANDS.length; i++) {
    if (share >= LATCH_HEFT_BANDS[i].share) return LATCH_HEFT_BANDS[i].id;
  }
  return LATCH_HEFT_LOOSE;
}

/** 'rock' | 'ice' | 'ceramic' | 'metal' for the caught body's surface, else null. */
export function latchHeftSprayKey(target) {
  if (!target || typeof target !== 'object') return null;
  return SPRAY_FOR_MATERIAL[impactMaterialForTarget(target, null)] || null;
}

/**
 * Plan the anchor-end read for one latch. `target` is the caught body, `owner` the hull holding
 * the Line. Writes into `out` and returns it; `out.live` false means "claim nothing".
 */
export function latchHeftPlan(target, owner, reduced = false, out = {}) {
  out.live = false;
  out.ringLive = false;
  const material = latchHeftSprayKey(target);
  const share = latchHeftShare(latchBodyMass(target), latchBodyMass(owner));
  const band = latchHeftBand(share);
  if (!material && !band) return out;
  const spray = material ? LATCH_HEFT_SPRAY[material] : null;
  const shape = band ? BAND_SHAPE[band] : NEUTRAL_SHAPE;
  out.live = true;
  out.material = material;
  out.band = band;
  out.share = share;
  out.c0 = spray ? spray.c0 : LATCH_DISC_C0;
  out.c1 = spray ? spray.c1 : null; // null: keep the caller's authored cooling colour
  out.countMul = (spray ? spray.count : 1) * shape.count * (reduced ? 0.75 : 1);
  out.speedMul = (spray ? spray.speed : 1) * shape.speed * (reduced ? 0.6 : 1);
  out.lifeMul = (spray ? spray.life : 1) * (reduced ? 1.4 : 1);
  out.sizeMul = (spray ? spray.size : 1) * shape.size;
  out.dragMul = spray ? spray.drag : 1;
  if (band && shape.ringMul > 0) {
    const r = Math.min(RING_RADIUS_MAX, Math.max(RING_RADIUS_MIN, Number(target && target.radius) || 6));
    out.ringLive = true;
    // Sprite sizes are full widths: the ring leaves the hull edge and rolls out to its reach.
    out.ringSize0 = r * 2;
    out.ringSize1 = r * 2 * shape.ringMul;
    out.ringLife = shape.ringLife * (reduced ? 1.5 : 1);
    out.ringOp = shape.ringOp * (reduced ? 0.7 : 1);
    out.ringColor = spray ? spray.ring : LATCH_RING_NEUTRAL;
  }
  return out;
}
