// Mass-signature stealth (build_map §34 row 513, expansion bible 08 §5).
//
// There are no vision cones in space this honest: sensors read MASS and HEAT inside a drawn
// sweep ring, and the world's large bodies cast mass shadows a small hull can hide inside.
// Everything below is pure data plus pure functions — no RNG, no wall clock, no entity
// mutation. `src/systems/massSignature.js` owns the ticking pass; encounter runtimes (the
// Weighing, E-04) call `weighingRead`/`signatureRead` directly on the same model.
//
// The stamps this model reads on entity.data (written by systems, encounters or tests):
//   data.massScanner        — a scanner profile id (see SWEEP_SCANNER_PROFILES) or true
//                             ('customs_weir') marking this entity as a sweep sensor.
//   data.signatureHidden    — mass hidden by a Hush Head while the Line holds it (the
//                             object's own reading drops to zero mass).
//   data.decoySpoofMassT    — a decoy pod: it reports this spoofed tonnage instead of its
//                             real mass, and it is never counted against the holder's
//                             manifest at a weighing (the signature belongs to the decoy).
//   data.coldCoast / data.driveOnline===false / data.enginesOff
//                           — the hull is coasting with a cold drive: heat collapses.
//   data.heatSignature      — explicit heat override (authored hot/cold props, reactors).
//   data.massShadow         — force this body to cast a mass shadow regardless of size.
//   data.heatSeeker         — this entity hunts heat (Lantern cysts, Furnace maws).

const freeze = Object.freeze;

// ── tuning ───────────────────────────────────────────────────────────────────────────────

/** Bodies at or above this tonnage cast a mass shadow. A capital hull qualifies; a fighter
 * never does. `data.massShadow === true` or a radius this large also casts. */
export const MASS_SHADOW_MIN_T = 300;
export const MASS_SHADOW_MIN_RADIUS = 26;

/** Heat readings. A cold coast is not zero — a warm hull takes time to cool — but it drops
 * below what a heat seeker or a resolved mass read can lock onto a small hull with. */
export const HEAT_THRUSTING = 0.95;
export const HEAT_IDLE_DRIVE = 0.34;
export const HEAT_COLD_COAST = 0.06;
export const HEAT_REACTOR_HOT = 1.0;
/** Below this the body reads cold to anything hunting heat. */
export const HEAT_SEEKER_MIN = 0.12;

/** Resolved-reading threshold: signature = massT*MASS_SIGNATURE_WEIGHT + heat. A small hull
 * coasting cold falls under it; a small hull idling does not; a barge can never hide. */
export const MASS_SIGNATURE_WEIGHT = 0.02;
export const SIGNATURE_DETECT_MIN = 0.5;

/** The weighing's tolerance: manifest vs scale disagreement this small is logged clean. */
export const WEIGHING_TOLERANCE_T = 2;

/** The scanner profiles the bible names (08 §5). ringRadius is the drawn ring's radius; the
 * edge sweeps once per edgePeriodS seconds; a lit target must dwell inside the ring dwellS
 * before the sensor resolves its signature (the readable "inside a drawn ring" rule). */
export const SWEEP_SCANNER_PROFILES = freeze({
  scale_barge: freeze({ id: 'scale_barge', ringRadius: 640, edgePeriodS: 9, dwellS: 1.5, readsMass: true, readsHeat: true }),
  customs_weir: freeze({ id: 'customs_weir', ringRadius: 460, edgePeriodS: 6, dwellS: 1.2, readsMass: true, readsHeat: true }),
  quiet_relay: freeze({ id: 'quiet_relay', ringRadius: 560, edgePeriodS: 14, dwellS: 2.0, readsMass: true, readsHeat: false }),
  archive_page_drone: freeze({ id: 'archive_page_drone', ringRadius: 380, edgePeriodS: 8, dwellS: 1.0, readsMass: true, readsHeat: true }),
  verge_prism: freeze({ id: 'verge_prism', ringRadius: 720, edgePeriodS: 18, dwellS: 2.5, readsMass: true, readsHeat: false }),
  // Heat hunters run the SAME model — a Lantern cyst or a Furnace maw is a sensor with a
  // jaw attached. It resolves nothing below HEAT_SEEKER_MIN and mass tells it nothing.
  lantern_cyst: freeze({ id: 'lantern_cyst', ringRadius: 900, edgePeriodS: 4, dwellS: 0.4, readsMass: false, readsHeat: true }),
  furnace_maw: freeze({ id: 'furnace_maw', ringRadius: 1200, edgePeriodS: 5, dwellS: 0.5, readsMass: false, readsHeat: true }),
});

export function scannerProfileFor(entity) {
  const data = entity && entity.data;
  if (!data) return null;
  const raw = data.massScanner;
  if (raw === true) return SWEEP_SCANNER_PROFILES.customs_weir;
  if (typeof raw === 'string' && SWEEP_SCANNER_PROFILES[raw]) return SWEEP_SCANNER_PROFILES[raw];
  if (raw && typeof raw === 'object' && Number.isFinite(raw.ringRadius)) {
    const base = SWEEP_SCANNER_PROFILES[raw.profile || raw.id] || SWEEP_SCANNER_PROFILES.customs_weir;
    return { ...base, ...raw, id: raw.profile || raw.id || base.id };
  }
  if (data.heatSeeker === true) return SWEEP_SCANNER_PROFILES[data.heatSeekerProfile] || SWEEP_SCANNER_PROFILES.lantern_cyst;
  return null;
}

// ── signatures ───────────────────────────────────────────────────────────────────────────

/** The entity's own heat on the shared model. Deterministic; reads only entity fields. */
export function heatOf(entity) {
  const data = (entity && entity.data) || {};
  if (Number.isFinite(data.heatSignature)) return Math.max(0, Math.min(1.5, data.heatSignature));
  if (data.coldCoast === true || data.enginesOff === true || data.driveOnline === false) {
    return HEAT_COLD_COAST;
  }
  if (data.reactorHot === true) return HEAT_REACTOR_HOT;
  const vel = entity && entity.vel;
  const speed = vel ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) : 0;
  return speed > 4 ? HEAT_THRUSTING : HEAT_IDLE_DRIVE;
}

/** The entity's own mass reading in tonnes, with the Hush/decoy stamps applied. */
export function massOf(entity) {
  const data = (entity && entity.data) || {};
  if (data.signatureHidden === true) return 0;
  if (Number.isFinite(data.decoySpoofMassT)) return Math.max(0, data.decoySpoofMassT);
  const declared = Number.isFinite(data.massT) ? data.massT : null;
  const raw = declared != null ? declared : (Number(entity && entity.mass) || 0);
  // Physics-side dead-mass fields (a wreck's 1e6 collider mass) are not signature tonnes;
  // data.massT is the authored override wherever a body needs an honest reading.
  return Math.max(0, raw);
}

/** Full signature: what a sensor resolves about this body before occlusion. */
export function signatureOf(entity) {
  const massT = massOf(entity);
  const heat = heatOf(entity);
  return freeze({
    massT,
    heat,
    strength: massT * MASS_SIGNATURE_WEIGHT + heat,
    spoofed: Number.isFinite(entity && entity.data && entity.data.decoySpoofMassT),
    hushed: entity && entity.data && entity.data.signatureHidden === true,
    cold: heatOf(entity) <= HEAT_COLD_COAST + 1e-9,
  });
}

// ── mass shadows ─────────────────────────────────────────────────────────────────────────

/** True when this body is large enough to cast a mass shadow on the glass. */
export function castsMassShadow(entity) {
  if (!entity || entity.alive === false || !entity.pos) return false;
  const data = entity.data || {};
  if (data.massShadow === true) return true;
  if (data.noMassShadow === true) return false;
  const mass = Number(entity.mass) || 0;
  const radius = Number(entity.radius) || 0;
  return mass >= MASS_SHADOW_MIN_T || radius >= MASS_SHADOW_MIN_RADIUS;
}

/**
 * Does `caster` shadow the segment observer→point? A mass shadow is the cylinder behind a
 * large body: the line from the sensor to the target passes through the body's silhouette.
 * (Same segment-vs-circle test the customs occluder walk uses; kept local so data stays pure.)
 */
export function pointInMassShadow(observerPos, caster, pointPos) {
  if (!observerPos || !caster || !caster.pos || !pointPos) return false;
  const r = Math.max(0, Number(caster.radius) || 0);
  if (!(r > 0)) return false;
  const ax = Number(observerPos.x) || 0;
  const az = Number(observerPos.z) || 0;
  const bx = Number(pointPos.x) || 0;
  const bz = Number(pointPos.z) || 0;
  const cx = Number(caster.pos.x) || 0;
  const cz = Number(caster.pos.z) || 0;
  const abx = bx - ax, abz = bz - az;
  const acx = cx - ax, acz = cz - az;
  const len2 = abx * abx + abz * abz;
  if (!(len2 > 1e-8)) return (acx * acx + acz * acz) <= r * r;
  let t = (acx * abx + acz * abz) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = ax + abx * t - cx;
  const dz = az + abz * t - cz;
  return (dx * dx + dz * dz) <= r * r;
}

/** First mass-shadow caster that occludes the segment, or null. `casters` is an entity list.
 * A caster never occludes an observer standing inside its own disc — the barge's silhouette
 * does not blind the barge — and a target hides only behind the body, never inside it. */
export function massShadowBetween(observerPos, pointPos, casters, ignoreId = null) {
  for (const caster of casters || []) {
    if (!caster || caster.id === ignoreId || !caster.pos) continue;
    const r = Math.max(0, Number(caster.radius) || 0);
    const odx = Number(observerPos && observerPos.x) - caster.pos.x;
    const odz = Number(observerPos && observerPos.z) - caster.pos.z;
    if (odx * odx + odz * odz <= r * r) continue;
    if (pointInMassShadow(observerPos, caster, pointPos)) return caster;
  }
  return null;
}

// ── the drawn sweep ring ─────────────────────────────────────────────────────────────────

/** The ring a scanner draws on the glass: origin, radius, and the moving edge's bearing at
 * `simTime`. Deterministic — the same clock draws the same edge for every observer. */
export function sweepRingFor(scanner, profile, simTime) {
  const period = Math.max(0.5, Number(profile.edgePeriodS) || 6);
  const t = Number(simTime) || 0;
  return {
    origin: scanner.pos ? { x: scanner.pos.x, z: scanner.pos.z } : { x: 0, z: 0 },
    radius: Number(profile.ringRadius) || 400,
    edgeAngle: ((t / period) % 1) * Math.PI * 2,
    edgePeriodS: period,
    dwellS: Number(profile.dwellS) || 1,
  };
}

export function insideRing(ring, pos) {
  if (!ring || !pos) return false;
  const dx = pos.x - ring.origin.x;
  const dz = pos.z - ring.origin.z;
  return dx * dx + dz * dz <= ring.radius * ring.radius;
}

// ── readings ─────────────────────────────────────────────────────────────────────────────

/**
 * One scanner's resolved read on one target. Returns the reading — detected or not — with
 * the reason, so callers (the sweep system, the scale) can speak honestly about the miss:
 * 'out_of_ring' | 'mass_shadow' | 'below_threshold' | 'resolved'.
 */
export function signatureRead(profile, scannerPos, target, casters) {
  const empty = { detected: false, massT: 0, heat: 0, strength: 0, occludedBy: null, reason: 'out_of_ring' };
  if (!profile || !scannerPos || !target || !target.pos) return empty;
  const dx = target.pos.x - scannerPos.x;
  const dz = target.pos.z - scannerPos.z;
  if (dx * dx + dz * dz > profile.ringRadius * profile.ringRadius) return empty;
  const occluder = massShadowBetween(scannerPos, target.pos, casters, target.id);
  if (occluder) return { ...empty, reason: 'mass_shadow', occludedBy: occluder.id };
  const sig = signatureOf(target);
  const massTerm = profile.readsMass === false ? 0 : sig.massT * MASS_SIGNATURE_WEIGHT;
  const heatTerm = profile.readsHeat === false ? 0 : sig.heat;
  const strength = massTerm + heatTerm;
  // A heat-only reader ignores mass entirely; a mass-only reader ignores heat. A body whose
  // resolved strength never crosses the threshold reads as rock clutter — it is IN the ring
  // and not occluded, but the sensor cannot put a name on it.
  if (strength < SIGNATURE_DETECT_MIN) return { ...empty, massT: sig.massT, heat: sig.heat, strength, reason: 'below_threshold' };
  return {
    detected: true,
    massT: profile.readsMass === false ? 0 : sig.massT,
    heat: profile.readsHeat === false ? 0 : sig.heat,
    strength,
    occludedBy: null,
    reason: 'resolved',
    spoofed: sig.spoofed,
    cold: sig.cold,
  };
}

/**
 * The heat hunters' pick (Lantern cyst, Furnace maw — 08 §5 "the same model"). Returns the
 * hottest target inside the seeker's ring that is not in a mass shadow and reads at or above
 * HEAT_SEEKER_MIN, or null — a field of cold coasters leaves the cyst drifting.
 */
export function pickHeatSeekerTarget(seeker, candidates, casters) {
  const profile = scannerProfileFor(seeker) || SWEEP_SCANNER_PROFILES.lantern_cyst;
  const pos = seeker && seeker.pos;
  if (!pos) return null;
  let best = null;
  let bestHeat = -1;
  for (const target of candidates || []) {
    if (!target || target === seeker || target.alive === false || !target.pos) continue;
    const read = signatureRead(profile, pos, target, casters);
    if (!read.detected || read.heat < HEAT_SEEKER_MIN) continue;
    if (read.heat > bestHeat) { bestHeat = read.heat; best = target; }
  }
  return best ? { target: best, heat: bestHeat } : null;
}

// ── the Weighing (E-04 model) ────────────────────────────────────────────────────────────

/**
 * A Scale Barge's honest scale: the subject's own mass plus every loose mass body inside the
 * ring that resolves against it — pods on its Line count toward the manifest, pods in a mass
 * shadow or under a Hush never existed, and a decoy pod's signature belongs to the decoy.
 *
 * bodies: candidate mass bodies near the subject (cargo pods, held bodies, decoys).
 * Returns { readMassT, counted: [{id, massT}], hidden: [{id, reason}], decoys: [{id, massT}] }.
 */
export function weighingRead(profile, bargePos, subject, bodies, casters) {
  const out = { subjectMassT: 0, cargoMassT: 0, readMassT: 0, counted: [], hidden: [], decoys: [] };
  const subjectRead = signatureRead(profile, bargePos, subject, casters);
  if (subjectRead.detected || subjectRead.reason === 'below_threshold') {
    // Even an unresolved subject still puts its own hull on the scale — you cannot hide the
    // ship you flew in on. The mass is read from the signature, not the detection result.
    out.subjectMassT = signatureOf(subject).massT;
  }
  for (const body of bodies || []) {
    if (!body || body === subject || body.alive === false || !body.pos) continue;
    const sig = signatureOf(body);
    if (sig.spoofed) {
      // The decoy's signature is its own manifest — it never counts against the holder.
      out.decoys.push({ id: body.id, massT: sig.massT });
      continue;
    }
    if (sig.hushed || sig.massT <= 0) {
      out.hidden.push({ id: body.id, reason: 'hush_head' });
      continue;
    }
    const occluder = massShadowBetween(bargePos, body.pos, casters, body.id);
    if (occluder) {
      out.hidden.push({ id: body.id, reason: 'mass_shadow', occludedBy: occluder.id });
      continue;
    }
    out.counted.push({ id: body.id, massT: sig.massT });
    out.cargoMassT += sig.massT;
  }
  out.readMassT = out.subjectMassT + out.cargoMassT;
  return out;
}

/** The scale's verdict. manifestMassT is what the papers say the hull weighs. */
export function weighingVerdict(readMassT, manifestMassT, toleranceT = WEIGHING_TOLERANCE_T) {
  const over = Math.max(0, (Number(readMassT) || 0) - (Number(manifestMassT) || 0));
  const tolerance = Math.max(0, Number(toleranceT) || 0);
  return {
    outcome: over <= tolerance ? 'clean' : 'over_mass',
    overByT: over,
    readMassT: Number(readMassT) || 0,
    manifestMassT: Number(manifestMassT) || 0,
  };
}

export default SWEEP_SCANNER_PROFILES;
