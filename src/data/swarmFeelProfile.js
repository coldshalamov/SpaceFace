// SWARM S1 — the single Swarm feel profile. Every Swarm-only feel/tuning knob lives here:
// contact physics, Pull/Shove deploy-time shape, the dying window, and fodder stats.
// Consumers read it through swarmFeel(state), which resolves only during a live Swarm run
// (run.kind 'survival' + run.ruleset 'swarm' + phase !== 'inactive'), so Adventure never sees
// a single changed number. Sim-safe: pure frozen data plus a state-read; no ambient randomness,
// no wall time, no Three.js.

import { SWARM_RULESET } from './swarmMode.js';

export const SWARM_FEEL_VERSION = 'swarm_feel_v1';

// The data stamp placed on bodies spawned under the profile. The contact owner keys its
// Swarm rules off entity.data[SWARM_FEEL_STAMP] — the stamp travels with the entity across
// the worker lane, so both realms enforce the same profile without state transport.
export const SWARM_FEEL_STAMP = 'swarmFeel';

export const SWARM_FEEL_PROFILE = Object.freeze({
  version: SWARM_FEEL_VERSION,

  // AUDIT P1/P2/P3 — enemy contact physics for the demolition derby.
  contact: Object.freeze({
    // Stamped enemies carry restitution 0.35 with the average combine rule: ship-vs-ship
    // pairs land at 0.35; vs rock (0.22 average-authored) pairs land at ~0.285 ≈ 0.3; vs the
    // player's 'min' rule the player still wins (min beats average) and keeps today's zero-
    // scrape character. Numbers are the audit's pair results, not the stamped material value.
    enemyRestitution: 0.35,
    enemyCombine: 'average',
    // The bowling-pin rule: when a stamped victim's contact partner is tumbling or thrown
    // (impulse provenance) and the pre-solve closing is a real impact, the victim keeps the
    // tumble bound instead of the ordinary 40 WU/s overlap-recovery cap. The cap still bounds
    // every other contact — deep-overlap spawn separation stays a shove, not a cannon.
    impactTransferDv: 160,
    impactMinClosing: 30,
    // A body is "thrown" for the bowling-pin rule when a queued impulse moved it within this
    // window (tether releases, weapon impulses, field throws, break-up shockwaves).
    thrownProvenanceS: 4,
    // P3 — tumbling hulls keep a little more bounce and a little less angular drag than the
    // baseline tumble material so a flung hull stays legibly fast and visibly spinning for
    // ~2 s instead of a dying sub-second twitch.
    tumbleRestitution: 0.65,
    tumbleAngularDamping: 0.05,
  }),

  // AUDIT P4 — the Well is a yank, not a zone. Deploy-time phase table on the same field
  // record: ~1.2 s at 3× strength and 0.35× damping (convergence ≈150 WU/s — enough to stack
  // the pack for a real crumple), then 2 s at the authored convergence law, then it ends.
  pull: Object.freeze({
    yankS: 1.2,
    yankStrengthMult: 3,
    yankDampingMult: 0.35,
    holdS: 2,
    cooldownS: 6,
  }),

  // AUDIT P5 — Shove is a punch: a 0.35 s spike at 3× strength (mass 24 hulls leave at
  // ~90 WU/s) then a 1.5 s berm that fades to nothing. A repulsor that is still pushing 5 s
  // later feels like a wall; a burst feels like a hit.
  shove: Object.freeze({
    punchS: 0.35,
    punchStrengthMult: 3,
    bermS: 1.5,
    cooldownS: 5,
  }),

  // AUDIT V3/V4 — the dying window becomes the fight itself. Light hulls (≤32 t — the whole
  // throw-class fodder band) burst on the kill tick so the pile reads as hits, not a field of
  // drifting wrecks; mediums cap at half a second; heavies and capitals keep the authored
  // law so the big deaths still earn their window.
  dying: Object.freeze({
    instantBelowMassT: 32,
    mediumBelowMassT: 80,
    mediumWindowS: 0.5,
  }),

  // AUDIT V2 / S8 — a heavy kill is ammunition and a shove, not just a flash. The rupture
  // sheds 3–6 ordinary hull chunks — the same collision tear-off body any wreck sheds:
  // tetherable, ttl'd, pooled — stamped into the round so the Line's VERB-12 latch admits
  // them as ammunition. A radial shockwave through the impulse membrane shoves every
  // dynamic body in ~1 screen: one flat impulse, so light hulls fly (~56 WU/s on a wasp),
  // heavies lurch (~13 on a bruiser) and the pilot feels a real kick (~18). A light or
  // medium death does not get the wave; mediums shed one or two chunks.
  death: Object.freeze({
    mediumChunksMin: 1,
    mediumChunksMax: 2,
    heavyChunksMin: 3,
    heavyChunksMax: 6,
    shockwaveRadiusWu: 140,
    shockwaveImpulse: 900,
    shockwaveMaxDv: 70,
  }),

  // AUDIT C1/C2 — the screen fills with fodder, not HP. Fodder hulls spawn killable in
  // ≤0.5 s for every Swarm starter kit's primary at mid range; shields and armor are zeroed
  // so nothing on a fodder frame gates a bullet. Non-fodder hulls keep authored stats —
  // formidable is never HP.
  fodder: Object.freeze({
    ids: Object.freeze(['wasp_swarmer', 'choir_zealot', 'detonator_dart']),
    hullMult: 0.2,
    shield: 0,
    armor: 0,
    killSAtMidRange: 0.5,
  }),
});

/**
 * EC-G18 / decision D1 — ONE FEEL. The throw is the same in both doors: Pull is a yank, Shove is
 * a punch, and a thrown body keeps its killing speed through a collision, in Adventure exactly as
 * in Swarm. These three blocks are the game's feel, not a Swarm option, so they resolve without a
 * run gate. Adventure adds consequences (witnesses, law, spilled cargo), never softer physics.
 * Swarm-only knobs — fodder stats, the dying window, the death shockwave — still resolve through
 * swarmFeel(state) below.
 */
export const ONE_FEEL = Object.freeze({
  version: SWARM_FEEL_VERSION,
  contact: SWARM_FEEL_PROFILE.contact,
  pull: SWARM_FEEL_PROFILE.pull,
  shove: SWARM_FEEL_PROFILE.shove,
});

/**
 * The deploy-time phase table for a radial power under the one feel, or null for kinds that keep
 * their authored def (cones, sheets, knots). Pull is a yank then a hold at full strength; Shove a
 * punch then a berm fading to nothing. The table rides the deployed receipt (fields.js) and the
 * hold-to-preview predictor (powerPreview.js) reads the same rows, so the preview shows the law
 * the press will run.
 */
export function oneFeelPhaseTable(kind) {
  if (kind === 'well') {
    const p = ONE_FEEL.pull;
    return { punchS: p.yankS, punchStrengthMult: p.yankStrengthMult, punchDampingMult: p.yankDampingMult, fadeS: p.holdS, fadeTo: 1 };
  }
  if (kind === 'repulsor') {
    const s = ONE_FEEL.shove;
    return { punchS: s.punchS, punchStrengthMult: s.punchStrengthMult, punchDampingMult: 1, fadeS: s.bermS, fadeTo: 0 };
  }
  return null;
}

/** Cooldown for a phased power under the one feel. */
export function oneFeelCooldownS(kind) {
  return kind === 'well' ? ONE_FEEL.pull.cooldownS : ONE_FEEL.shove.cooldownS;
}

/**
 * Strength and damping multipliers `elapsed` seconds into a phase table. Pure; the one law both
 * the live field and the preview evaluate. Past punchS + fadeS the field has expired.
 */
export function oneFeelPhaseAt(p, elapsed) {
  if (elapsed < p.punchS) return { strengthMult: p.punchStrengthMult, dampingMult: p.punchDampingMult, punch: true };
  const t = p.fadeS > 0 ? Math.min(1, (elapsed - p.punchS) / p.fadeS) : 1;
  const fadeTo = Number.isFinite(p.fadeTo) ? p.fadeTo : 0;
  return { strengthMult: 1 + (fadeTo - 1) * t, dampingMult: 1, punch: false, fadeTo };
}

/**
 * The contact block for a body, or null for bodies that keep the plain contact law. Every
 * non-player ship takes the bowling-pin rule in both doors (EC-G18); bodies stamped at Swarm wave
 * materialization keep it as before. Rocks, pods and the player keep the shared constants.
 */
export function oneFeelContact(entity) {
  if (!entity) return null;
  const data = entity.data;
  if (data && data[SWARM_FEEL_STAMP] === true) return ONE_FEEL.contact;
  if (entity.type === 'ship' && entity.isPlayer !== true) return ONE_FEEL.contact;
  return null;
}

/**
 * The Swarm feel profile, or null outside a live Swarm run. Same predicate the presentation
 * gate uses: survival-kind run, swarm ruleset, any phase except 'inactive'. Both realms
 * (main-thread sim and the whole-sim worker) mirror state.run, so the gate is identical
 * wherever a system evaluates it.
 */
export function swarmFeel(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival') return null;
  if (run.ruleset !== SWARM_RULESET) return null;
  if (run.phase === 'inactive') return null;
  return SWARM_FEEL_PROFILE;
}
