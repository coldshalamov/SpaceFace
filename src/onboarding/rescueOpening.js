// Rescue-opening rail contract (PQ-163.00 — "The rescue").
//
// The default New Game route opens on a tow rig at the reference site: one swing-release
// (latch a loose rock, reel it tight, cut it through the derelict for scrap), one shove
// (put the scout into the asteroid with the starter gun — honest since the PQ-137.05 force
// table), one grab-and-run (latch the escape pod and run it to the beacon). In play, no
// walls, no mentor, no text walls: each verb is taught by doing, then silence. The Range
// (F4) swing rung is the fallback; the 47-A scene past the rail stays the climax.
//
// Pure data + deterministic helpers. No DOM, no Three.js, no wall clock, no ambient
// randomness: spawn placement draws from the caller's seeded rng, completion reads run off
// plain entity positions/velocities, and the funnel builders return plain bus payloads.
// Sim-safe by construction: the 47-A slice harness (game:started with a scenario payload)
// never activates this rail, so its golden snapshot is untouched.

import { RESCUE_BEAT_LINES, RANGE_POINTER_LINE } from '../ui/hudAttention.js';

export const RESCUE_SEED_SALT = 'rescue-opening';

// Fixed seed the headless rescue proof runs on (scenario + focused test share it).
export const RESCUE_PROOF_SEED = 47;

// The three verbs, in play order. `after` names the drill beat whose DONE plus the silence
// gate opens this verb; `gate` names the drill beat that waits while this verb is current.
// The 10-beat drill table is untouched — the rescue slots into its silence gaps.
export const RESCUE_BEATS = Object.freeze([
  Object.freeze({ key: 'swing', after: 'tether', gate: 'burst' }),
  Object.freeze({ key: 'shove', after: 'burst', gate: 'disengage' }),
  Object.freeze({ key: 'grab', after: 'disengage', gate: 'seam' }),
]);

export const RESCUE_ORDER = Object.freeze(RESCUE_BEATS.map((beat) => beat.key));

export const RESCUE_PREREQ = Object.freeze(
  Object.fromEntries(RESCUE_BEATS.map((beat) => [beat.key, beat.after])),
);

export const RESCUE_GATE = Object.freeze(
  Object.fromEntries(RESCUE_BEATS.map((beat) => [beat.key, beat.gate])),
);

export function rescueBeatLine(beatKey) {
  return RESCUE_BEAT_LINES[beatKey] || '';
}

// Range fallback (PQ-163.00: "Range is fallback"). Only the swing has a dedicated rung —
// SWING, DO NOT PULL is the first drill. Shove and grab have no rung; their fallback is the
// opening itself, so the helper returns null and the rail never points at a wrong lesson.
export const RESCUE_RANGE_FALLBACK = Object.freeze({
  swing: 'swing_do_not_pull',
  shove: null,
  grab: null,
});

export function rescueRangeRungId(beatKey) {
  return Object.prototype.hasOwnProperty.call(RESCUE_RANGE_FALLBACK, beatKey)
    ? RESCUE_RANGE_FALLBACK[beatKey]
    : null;
}

// ── Completion thresholds (world units / seconds, same scale as the drill) ───────────────
export const RESCUE_ROCK_HIT_MIN_SPEED_WU = 15; // released rock must arrive with intent
export const RESCUE_SHOVE_PROOF_SPEED_WU = 12;  // scout drift (5 wu/s) can never fake a shove
export const RESCUE_SCOUT_DRIFT_WU = 5;         // the scout is alive, not parked
export const RESCUE_ESCAPE_WU = 1500;           // scout past this range has escaped: fail + reset
export const RESCUE_REEL_TIGHT_WU = 60;         // same winched-enough read as the B1 lesson
export const RESCUE_RUN_MIN_SPEED_WU = 10;      // grab-and-run must actually run

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dist2D(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z));
}

function speedOf(entity) {
  if (!entity || !entity.vel) return 0;
  return Math.hypot(finite(entity.vel.x), finite(entity.vel.z));
}

function drawRng(rng) {
  if (typeof rng === 'function') {
    const v = rng();
    if (Number.isFinite(v)) return v;
  }
  return 0.5;
}

// ── Cast specs ────────────────────────────────────────────────────────────────────────────
// Slots: rock (the swung mass), derelict (the scrap target), scout (the shove target),
// asteroid (the wall), pod (the grab target), beacon (the run destination). Positions are
// relative to the player's opening position on one seeded bearing so the whole tableau is
// deterministic per seed and visible without a chase. Nothing here is persistent (save
// systems only keep flagged entities) and nothing collides with ships except the scout,
// which keeps the default contact identity so gunfire can move it and the asteroid can
// stop it.
export function makeRescueCastSpecs(playerPos, rng) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const theta = drawRng(rng) * Math.PI * 2;
  const dir = { x: Math.cos(theta), z: Math.sin(theta) };
  const at = (range, bearing) => ({
    x: px + Math.cos(theta + bearing) * range,
    z: pz + Math.sin(theta + bearing) * range,
  });
  const rockPos = at(90, 0);
  const alongX = rockPos.x + dir.x * 140;
  const alongZ = rockPos.z + dir.z * 140;
  const asteroidPos = at(420, 0.6);
  const drift = drawRng(rng) * Math.PI * 2;

  return {
    rock: {
      type: 'asteroid',
      pos: { ...rockPos },
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 220,
      hull: 120,
      hullMax: 120,
      data: {
        onboarding: true, rescue: true, rescueRole: 'rock',
        typeId: 'ast_rescue_rock',
      },
    },
    derelict: {
      type: 'wreck',
      pos: { x: alongX, z: alongZ },
      vel: { x: 0, z: 0 },
      radius: 14,
      mass: 900,
      hull: 1,
      hullMax: 1,
      flags: { invuln: true },
      _invulnUntil: Infinity,
      data: {
        parentType: 'ship', loot: [], salvagePool: {}, salvageTimeLeft: 0,
        onboarding: true, rescue: true, rescueRole: 'derelict', kind: 'derelict',
      },
    },
    scout: {
      type: 'drone',
      name: 'SCN Scout',
      team: 1,
      factionId: 'faction_scn',
      pos: { x: asteroidPos.x + (px - asteroidPos.x) * 0.28, z: asteroidPos.z + (pz - asteroidPos.z) * 0.28 },
      vel: { x: Math.cos(drift) * RESCUE_SCOUT_DRIFT_WU, z: Math.sin(drift) * RESCUE_SCOUT_DRIFT_WU },
      radius: 8,
      mass: 16,
      // Lesson body: hittable so starter-gun impulse can land. A landed starter hit spends
      // ~5.2 hull (default difficulty), so 120 keeps the authored promise — a ~20-shot
      // Pulse Laser S burst spends ~105 of 120 and cannot kill the shove target — without
      // the ~5x sponge overshoot that invited grinding on a body the marker does not ask
      // you to kill (PQ-163.00 receipt leftover). Killing it IS possible (~24 deliberate
      // shots) and is a restaged retry, never a wall.
      hull: 120,
      hullMax: 120,
      data: {
        weapons: [],
        ai: {
          passive: true, roe: 'hold_fire', spawnContext: 'rescue_opening',
          motive: 'rescue', tacticRole: 'scout_chase',
        },
        onboarding: true, rescue: true, rescueRole: 'scout',
      },
    },
    asteroid: {
      type: 'asteroid',
      pos: { ...asteroidPos },
      vel: { x: 0, z: 0 },
      radius: 26,
      mass: 4000,
      hull: 5000,
      hullMax: 5000,
      data: {
        onboarding: true, rescue: true, rescueRole: 'asteroid',
        typeId: 'ast_rescue_wall',
      },
    },
    pod: {
      type: 'payload',
      pos: at(260, -0.5),
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 120,
      hull: 80,
      hullMax: 80,
      data: {
        tetherPayload: true, distressBeacon: true, rescuePriority: true,
        onboarding: true, rescue: true, rescueRole: 'pod',
      },
    },
    beacon: {
      type: 'beacon',
      pos: at(700, 0.2),
      vel: { x: 0, z: 0 },
      radius: 60,
      mass: 1,
      hull: 1,
      hullMax: 1,
      flags: { invuln: true },
      _invulnUntil: Infinity,
      data: {
        rescueExit: true,
        onboarding: true, rescue: true, rescueRole: 'beacon',
      },
    },
  };
}

// ── Fresh funnel state (plain JSON — save-safe, no class instances) ───────────────────────
export function freshRescueState() {
  const beats = {};
  for (const key of RESCUE_ORDER) {
    beats[key] = { state: 'pending', fails: 0, doneAt: null };
  }
  return {
    active: true,
    completed: false,
    startedAt: null,
    completedAt: null,
    current: null,
    beats,
    ids: { rock: null, derelict: null, scout: null, asteroid: null, pod: null, beacon: null },
    rockReeled: false,
    rockReleasedAfterReel: false,
    rockLatched: false,
    podLatched: false,
    shoveShots: 0,
    firstLatchDone: false,
    rangePromptActive: false,
    rangeOpened: false,
    rangeOpenedFromPrompt: false,
    rangeOpenedAt: null,
  };
}

// ── Completion predicates (pure reads — shared by the system and the headless proof) ─────
export function rescueRockHitDerelict(rock, derelict, minSpeed = RESCUE_ROCK_HIT_MIN_SPEED_WU) {
  if (!rock || rock.alive === false || !rock.pos || !rock.vel) return false;
  if (!derelict || derelict.alive === false || !derelict.pos) return false;
  const contact = finite(rock.radius, 0) + finite(derelict.radius, 0) + 6;
  return dist2D(rock.pos, derelict.pos) <= contact && speedOf(rock) >= minSpeed;
}

export function rescueScoutAtAsteroid(scout, asteroid, minSpeed = RESCUE_SHOVE_PROOF_SPEED_WU) {
  if (!scout || scout.alive === false || !scout.pos || !scout.vel) return false;
  if (!asteroid || asteroid.alive === false || !asteroid.pos) return false;
  const contact = finite(scout.radius, 0) + finite(asteroid.radius, 0) + 30;
  return dist2D(scout.pos, asteroid.pos) <= contact && speedOf(scout) >= minSpeed;
}

export function rescuePodAtBeacon(pod, beacon) {
  if (!pod || pod.alive === false || !pod.pos) return false;
  if (!beacon || beacon.alive === false || !beacon.pos) return false;
  return dist2D(pod.pos, beacon.pos) <= Math.max(8, finite(beacon.radius, 60));
}

export function rescueScoutEscaped(scout, playerPos, maxWu = RESCUE_ESCAPE_WU) {
  if (!scout || scout.alive === false || !scout.pos) return false;
  return dist2D(scout.pos, playerPos) > maxWu;
}

// Defensive live-latch read: the combat attachment table is plain data
// (state.combat.attachments.byId), so the rail can adopt a latch that predates the beat
// instead of stranding a player who grabbed early.
export function rescuePlayerLatchedTo(state, playerId, targetId) {
  if (playerId == null || targetId == null || !state) return false;
  const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return false;
  for (const key of Object.keys(byId)) {
    const att = byId[key];
    if (!att || att.state !== 'active') continue;
    if (att.ownerId === playerId && att.targetId === targetId) return true;
  }
  return false;
}

// ── Coherent retry placement (PQ-163.00 receipt leftover) ────────────────────────────────
// A restaged body must re-open the SAME readable problem, not a fresh seeded bearing: the
// first shove attempt is "push it along the player→wall line", so the retry's scout must sit
// on the STANDING wall's line again — not 300 wu off it because the spec re-rolled a bearing
// the standing actors never moved to. Pure and deterministic: placement reads only the
// caller's player position, the standing actors' live positions, and the caller's rng.
// `standing` slots are entity-likes ({ pos: {x,z} }) or null when the body itself must be
// restaged (its own slot is ignored).
export function rescueSlotRespawnTransform(slot, playerPos, standing, rng) {
  const px = finite(playerPos && playerPos.x);
  const pz = finite(playerPos && playerPos.z);
  const bearing = () => drawRng(rng) * Math.PI * 2;
  if (slot === 'rock') {
    // The swing reads rock → derelict: re-stage on the wreck's line, one tow pass short of
    // it (the authored rock sat 140 wu up-line from the wreck), on the pilot's side so the
    // release line passes where the player is.
    const derelict = standing && standing.derelict && standing.derelict.pos
      ? standing.derelict : null;
    if (derelict) {
      const dx = px - derelict.pos.x;
      const dz = pz - derelict.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const range = Math.min(140, Math.max(90, d * 0.5));
      return {
        pos: { x: derelict.pos.x + (dx / d) * range, z: derelict.pos.z + (dz / d) * range },
        vel: { x: 0, z: 0 },
      };
    }
    const theta = bearing();
    return {
      pos: { x: px + Math.cos(theta) * 90, z: pz + Math.sin(theta) * 90 },
      vel: { x: 0, z: 0 },
    };
  }
  if (slot === 'scout') {
    // The shove reads scout → asteroid: re-stage on the STANDING wall's line at the authored
    // 28% offset from the wall back toward the pilot, with the authored 5 wu/s live drift.
    const asteroid = standing && standing.asteroid && standing.asteroid.pos
      ? standing.asteroid : null;
    const drift = bearing();
    const vel = { x: Math.cos(drift) * RESCUE_SCOUT_DRIFT_WU, z: Math.sin(drift) * RESCUE_SCOUT_DRIFT_WU };
    if (asteroid) {
      return {
        pos: {
          x: asteroid.pos.x + (px - asteroid.pos.x) * 0.28,
          z: asteroid.pos.z + (pz - asteroid.pos.z) * 0.28,
        },
        vel,
      };
    }
    const theta = bearing();
    return {
      pos: { x: px + Math.cos(theta) * 240, z: pz + Math.sin(theta) * 240 },
      vel,
    };
  }
  if (slot === 'pod') {
    // The grab reads pod → beacon: re-stage one approach leg from the pilot toward the
    // STANDING beacon, so the run still points at the ring the fiction names.
    const beacon = standing && standing.beacon && standing.beacon.pos ? standing.beacon : null;
    if (beacon) {
      const dx = beacon.pos.x - px;
      const dz = beacon.pos.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      const range = Math.min(260, d * 0.5);
      return {
        pos: { x: px + (dx / d) * range, z: pz + (dz / d) * range },
        vel: { x: 0, z: 0 },
      };
    }
    const theta = bearing();
    return {
      pos: { x: px + Math.cos(theta) * 260, z: pz + Math.sin(theta) * 260 },
      vel: { x: 0, z: 0 },
    };
  }
  return null;
}

// ── Funnel events (complete / fail / which beat — the honest telemetry, no percentages) ──
export function buildRescueFunnelEvent(beat, result, atS) {
  return {
    type: 'rescue:beat',
    beat: String(beat),
    result: result === 'complete' ? 'complete' : 'fail',
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}

export function buildRescueStartedEvent(atS) {
  return { type: 'rescue:started', beats: [...RESCUE_ORDER], atS: Number.isFinite(Number(atS)) ? Number(atS) : 0 };
}

export function buildRescueCompleteEvent(atS, fails) {
  return {
    type: 'rescue:complete',
    beats: [...RESCUE_ORDER],
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
    fails: Number.isFinite(Number(fails)) ? Number(fails) : 0,
  };
}

// Range funnel event (PQ-163.01 — "The Range is the door"). Opening Range from the first-latch prompt
// is recorded in the telemetry stream. Honest counts only, no fake playtest percentages.
export function buildRangeOpenedFunnelEvent(atS, { fromPrompt = false, rungId = null, rungIndex = 0 } = {}) {
  return {
    type: 'range:opened',
    fromPrompt: Boolean(fromPrompt),
    rungId: rungId ? String(rungId) : null,
    rungIndex: Number.isInteger(rungIndex) ? rungIndex : 0,
    atS: Number.isFinite(Number(atS)) ? Number(atS) : 0,
  };
}
