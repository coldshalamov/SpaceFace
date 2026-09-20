export const SHIELD_HIT_SLOTS = 4;
export const SHIELD_HIT_LIFE = 0.28;

// One retirement threshold for the whole module. It used to be split: the ageing loop kept a
// record alive down to 0.001 while the presentation gate stopped reading it at 0.01, so every
// contact left a live-but-invisible record behind for the renderer to keep uploading.
export const SHIELD_CONTACT_EPSILON = 0.01;

/**
 * Shield contact records — the wire format the instanced shell samples.
 *
 * `dirs` stays exactly four vec4s, because the pooled shield in `renderer.js` uploads it straight
 * into `instanceHit0..3` and the per-ship fallback shares the same shared response. What changed on
 * 2026-09-20 is that ONE float is no longer doing two jobs.
 *
 * The old record aged a single linear strength, and the shell derived both the ring's radius and
 * its brightness from it. That is opacity used as the animation channel (B17): a contact could only
 * ever be a circle that grew at a constant rate while dimming at a constant rate, and four
 * simultaneous hits produced four identical synchronised rings (B14).
 *
 * Now the record carries two separated channels:
 *
 *   `dirs[o+3]`  RADIANCE. How brightly this contact is burning, with the panel re-radiation beats
 *                that a loaded membrane actually shows as the front crosses successive panel rings.
 *                Not monotone, so it is no longer a fade standing in for motion.
 *   `|dirs.xyz|` PROPAGATION. `length - 1` is how far the stress front has travelled across the
 *                shell, 0 at the strike and 1 when the load has redistributed. The direction stays
 *                a unit vector once normalised, so this channel is free: the shipped shell shader
 *                already does `dir /= length(dir)` and is unaffected by it.
 *
 * The front decelerates (fast bite, stalling tail) and each contact gets its own deterministic
 * life stagger, so two hits landing on the same frame no longer ring in lockstep. No RNG is
 * consumed: the stagger is a low-discrepancy step on the record's own hit counter.
 *
 * The authored life is unchanged at `SHIELD_HIT_LIFE`. Because the radiance curve is no longer a
 * straight line, a contact drops below the presentation gate at about 0.272 s rather than 0.277 s:
 * five milliseconds, and `shouldPresentShieldBubble` is untouched.
 */

// age, peak radiance, unit origin x/y/z, stagger. Parallel to `dirs`, never uploaded.
const META_STRIDE = 6;
const META_AGE = 0;
const META_PEAK = 1;
const META_ORIGIN = 2; // three floats
const META_STAGGER = 5;

// Low-discrepancy step, so consecutive contacts on one hull stagger without a random source.
const GOLDEN = 0.6180339887498949;

const hits = new Map();

function ensureRecord(entityId) {
  let record = hits.get(entityId);
  if (!record) {
    record = {
      dirs: new Float32Array(SHIELD_HIT_SLOTS * 4),
      meta: new Float32Array(SHIELD_HIT_SLOTS * META_STRIDE),
      cursor: 0,
    };
    hits.set(entityId, record);
  }
  return record;
}

/**
 * How far the stress front has crossed the shell, 0..1.
 *
 * A front entering a stiff constructed membrane starts fast and stalls as it spends its energy
 * into the lattice, which is the opposite of the constant-rate ring the shell used to draw.
 */
function frontSpread(u, stagger) {
  const remaining = 1 - u;
  // The stagger tilts how hard the front brakes, so two hits on the same frame cross the lattice
  // at visibly different rates instead of drawing one doubled ring.
  const brake = 0.46 + 0.18 * stagger;
  return 1 - remaining * remaining * (brake + (1 - brake) * remaining);
}

/**
 * Radiance envelope, 0..1.
 *
 * A hard bite at full strength, then a bleed that drains in steps rather than on a straight ramp:
 * the lattice re-radiates as the front crosses successive panel rings, so cooling has structure.
 * Reaches zero at the end of life, so the contact still retires on `SHIELD_HIT_LIFE`.
 */
function contactRadiance(u, peak, stagger) {
  if (u >= 1) return 0;
  // Crest on the strike frame, so the bite always lands at full peak; the stagger varies how many
  // rings the front crosses, never where the train starts.
  const ring = 0.5 + 0.5 * Math.cos(u * (2.6 + 0.9 * stagger) * 2 * Math.PI);
  const beat = 0.80 + 0.20 * Math.pow(ring, 1.6);
  const value = peak * Math.pow(1 - u, 1.35) * beat;
  return value > 1 ? 1 : value;
}

function writeSlot(dirs, meta, slot) {
  const m = slot * META_STRIDE;
  const o = slot * 4;
  const u = meta[m + META_AGE] / SHIELD_HIT_LIFE;
  const radiance = meta[m + META_PEAK] > 0 ? contactRadiance(u, meta[m + META_PEAK], meta[m + META_STAGGER]) : 0;
  if (!(radiance > SHIELD_CONTACT_EPSILON)) {
    meta[m + META_PEAK] = 0;
    dirs[o] = 0; dirs[o + 1] = 0; dirs[o + 2] = 0; dirs[o + 3] = 0;
    return false;
  }
  // The strike point never moves: the incandescent bite belongs where the round landed. Only the
  // encoded front travels, so the shell can spread the load without dragging the impact with it.
  const reach = 1 + frontSpread(u, meta[m + META_STAGGER]);
  dirs[o] = meta[m + META_ORIGIN] * reach;
  dirs[o + 1] = meta[m + META_ORIGIN + 1] * reach;
  dirs[o + 2] = meta[m + META_ORIGIN + 2] * reach;
  dirs[o + 3] = radiance;
  return true;
}

export function addShieldContact(entityId, dirX, dirY, dirZ, strength = 1) {
  if (entityId == null) return;
  const record = ensureRecord(entityId);
  const slot = record.cursor % SHIELD_HIT_SLOTS;
  // Low-discrepancy on the record's own counter: deterministic, no simulation RNG, and successive
  // contacts on one hull never land on the same stagger.
  const stagger = ((record.cursor + 1) * GOLDEN) % 1;
  record.cursor++;
  const m = slot * META_STRIDE;
  const len = Math.hypot(dirX, dirY, dirZ) || 1;
  record.meta[m + META_AGE] = 0;
  record.meta[m + META_PEAK] = Math.max(0.35, Math.min(1, strength));
  record.meta[m + META_ORIGIN] = dirX / len;
  record.meta[m + META_ORIGIN + 1] = dirY / len;
  record.meta[m + META_ORIGIN + 2] = dirZ / len;
  record.meta[m + META_STAGGER] = stagger;
  writeSlot(record.dirs, record.meta, slot);
}

export function ageShieldContacts(dt) {
  if (!(dt > 0)) return;
  for (const [id, record] of hits) {
    const { dirs, meta } = record;
    let any = false;
    for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
      const m = i * META_STRIDE;
      if (!(meta[m + META_PEAK] > 0)) continue;
      meta[m + META_AGE] += dt;
      if (writeSlot(dirs, meta, i)) any = true;
    }
    if (!any) hits.delete(id);
  }
}

export function readShieldContacts(entityId, out) {
  const record = hits.get(entityId);
  if (!record) {
    if (out) out.fill(0);
    return null;
  }
  if (out) out.set(record.dirs);
  return record.dirs;
}

export function hasShieldContact(entityId) {
  if (entityId == null) return false;
  const record = hits.get(entityId);
  if (!record) return false;
  for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
    if (record.dirs[i * 4 + 3] > SHIELD_CONTACT_EPSILON) return true;
  }
  return false;
}

export function clearShieldContacts(entityId) {
  if (entityId == null) hits.clear();
  else hits.delete(entityId);
}
