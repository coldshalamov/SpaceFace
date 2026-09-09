// Survival arena participation (CRU / PQ-133 follow-on).
//
// The ten-wave Survival ruleset authors an `arenaPhase` per wave, validates it, carries it into the
// pure plan and hashes it — and previously nothing consumed it. Ten waves therefore played identically:
// hostiles arrive from a compass gate and you kill them, in a room that never does anything. This
// system is the consumer that closed that gap. It reads `plan.arenaPhase` off `run:wavePlanned` and installs a
// ROOM for that wave, so the player can tell wave 5 from wave 8 by what the space is doing to them.
//
// Six rules shape the whole file:
//
//   * It only ever uses seams that already exist and are public. Three of them:
//       - `registry.get('fields').registerEnvironmental/unregisterExternal/hasExternal`
//         (src/systems/fields.js:499/504/512) — the ONE continuous-field kernel. No bespoke force
//         path is invented here; the same membrane that moves a player Well moves the room.
//       - bus `mines:placeRequest` (consumed at src/systems/mines.js:34) — physical, shootable,
//         armed-on-a-delay mines. Counterplay already exists; this file adds none of it.
//       - bus `encounter:telegraph` (consumed at src/systems/terrainAnchors.js:43) — 2-3 LARGE
//         cover rocks in the bubble. Ownership is released only by the paired `encounter:resolved`
//         (terrainAnchors.js:112), so teardown ALWAYS emits it or rocks accumulate forever.
//
//   * The FIELD_MAX_ACTIVE = 6 cap (src/data/fields.js:63) is never raised and never crowded out.
//     `registerEnvironmental` deliberately skips the cap check the player deploy path enforces
//     (fields.js:191), and `_enforceCap` (fields.js:418) can only evict entries in `rt.deployed` —
//     it can never evict an arena field. So an arena field silently steals a slot the player's
//     Well/Repulsor/Cone would otherwise get. The room therefore gets exactly TWO fixed slot ids
//     and no phase may ask for a third: 2 room + 3 player tools + 1 anchor-controller snare
//     (a wave-9 build-pressure swap, survivalWavePlanner.js:165) = exactly 6. Fixed ids also make
//     re-registration idempotent for free, because kernel `register` is upsert-by-id
//     (src/core/fields/fieldKernel.js:294) — the room can never occupy 3 kernel entries even if a
//     teardown were missed.
//
//   * It is calibrated to the AUTHORED ENVIRONMENTAL precedent, not to the player tools. The Cinder
//     Sluice current is radius 620 / strength 150 (src/data/environmentalMachinery.js:40-41).
//     Player deploys are radius ~170-190 / strength 240-300 — punchy and 9 seconds long. A room is
//     wide and permanent, so it is wide and gentle: nothing here would dominate the summed
//     FIELD_MAX_ACCEL when a player field overlaps it.
//
//   * It NEVER writes state.run (runSession is the sole writer), never spawns a ship, never touches
//     spawnBudget, and never raises any cap. Its mines carry a non-null owner id so the per-owner
//     mine cap (mines.js:12/52) actually applies to them — a null owner would skip the cap check
//     entirely. That owner is deliberately a STRING, not an entity id: the room is not a ship, so
//     it can neither steal the player's own six mine slots nor exempt any hull from a trigger
//     (mines.js:158 compares ids, and a string never matches one). What spares friendlies is the
//     TEAM, which is read off the player rather than defaulted, because `teamOf` (mines.js:249)
//     silently answers "team 1" for an unknown owner — which would have quietly turned the room's
//     mines against the player instead of the hostiles wading through them.
//
//   * Determinism: shape comes from a seeded mulberry32 stream mixed off (run.seed, wave); position
//     comes from the player anchor at plan time, exactly as waveMaterialization.js:72-80 anchors the
//     gates ("the arena follows the player… without pinning world coordinates"). No Math.random, no
//     Date.now, no wall clock. Same seed + same wave => same room.
//
//   * Everything it installs is released on wave clear, run end, newGame and destroy, and its
//     bookkeeping is dropped whenever `fields._clearAll` empties the kernel underneath it
//     (sector enter/exit, new game, save load — fields.js:135-141). A field that outlives its run
//     is a defect, not a leftover.
//
// Event-driven for Helios: no work on a tick where no wave was planned. Cinder machinery is a
// cheap no-op unless that law is live.

import { mulberry32 } from '../core/rng.js';
import { validateRunState } from '../core/runState.js';
import { SURVIVAL_ARENA_PHASES as CANONICAL_ARENA_PHASES } from '../data/survivalWaves.js';
import { gateBearing } from './waveMaterialization.js';
import { CINDER_ARENA_ID, planCinderInstall, stepCinderMachinery } from './cinderSluiceArena.js';
import {
  CRYO_ARENA_ID,
  applyCryoDrift,
  createCryoRoomLineage,
  planCryoInstall,
} from './cryoDriftArena.js';
import { LAGRANGE_ARENA_ID, planLagrangeInstall } from './lagrangeCrucible.js';
import {
  STORM_ARENA_ID,
  STORM_RELAY_COUNT,
  STORM_RELAY_ORBIT,
  STORM_RELAY_PERIOD,
  placeStormRelays,
  planStormInstall,
} from './stormLatticeArena.js';
import { orbitNodePose } from '../combat/orbitNodes.js';

export { CINDER_ARENA_ID, CRYO_ARENA_ID, LAGRANGE_ARENA_ID, STORM_ARENA_ID };
export const LAW_ARENA_IDS = Object.freeze([
  LAGRANGE_ARENA_ID,
  CINDER_ARENA_ID,
  CRYO_ARENA_ID,
  STORM_ARENA_ID,
]);

const CINDER_CYCLE_PHASES = new Set([
  'idle',
  'shutter_slow',
  'furnace_active',
  'shutter_alternating',
]);

/** The eight authored values in src/data/survivalWaves.js. Helios idle installs nothing; law arenas keep their law on idle. */
export const SURVIVAL_ARENA_PHASES = CANONICAL_ARENA_PHASES;

/**
 * The room's two kernel slots. FIXED ids, so the arena can occupy at most two entries of
 * FIELD_MAX_ACTIVE (6) no matter what happens to teardown, and a re-install of the same wave is an
 * upsert rather than a leak.
 */
export const ARENA_FIELD_SLOT_IDS = Object.freeze([
  'survival_arena_field_a',
  'survival_arena_field_b',
]);

/** Non-null so the per-owner mine cap applies. A string owner is not an entity id on purpose. */
export const ARENA_MINE_OWNER = 'survival-arena';

/** At most four of the six per-owner mine slots, so the room never fills its own cap. */
export const ARENA_MINE_MAX = 4;

const ARENA_MINE_ARM_DELAY_S = 3;
const TAU = Math.PI * 2;

/** Mix (seed, wave) into a uint32 stream seed — same idiom as wavePlanStreamSeed/batchStreamSeed. */
export function arenaStreamSeed(seed, wave) {
  const label = `survival-arena-v1|w${wave}`;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(Number.isInteger(wave) ? wave : 0, 0x85ebca6b)) >>> 0;
  return h || 1;
}

/**
 * The gate the wave leans on — the gate group of its largest scheduled batch, ties broken by the
 * earliest tick then the lowest package index. Pure read of the plan: the room's lane is the lane
 * the fight actually uses, not a second independent roll.
 */
export function dominantGate(plan) {
  const schedule = plan && Array.isArray(plan.schedule) ? plan.schedule : null;
  if (!schedule || schedule.length === 0) return 'front';
  let best = null;
  for (const entry of schedule) {
    if (!entry || typeof entry.gateGroup !== 'string') continue;
    const count = Number.isInteger(entry.count) ? entry.count : 0;
    const atTick = Number.isInteger(entry.atTick) ? entry.atTick : 0;
    const packageIndex = Number.isInteger(entry.packageIndex) ? entry.packageIndex : 0;
    if (
      best == null
      || count > best.count
      || (count === best.count && atTick < best.atTick)
      || (count === best.count && atTick === best.atTick && packageIndex < best.packageIndex)
    ) {
      best = { gateGroup: entry.gateGroup, count, atTick, packageIndex };
    }
  }
  return best ? best.gateGroup : 'front';
}

function point(anchor, dx, dz) {
  return { x: anchor.x + dx, z: anchor.z + dz };
}

function alongBearing(anchor, bearing, distance) {
  return point(anchor, bearing.x * distance, bearing.z * distance);
}

function finalizeInstall(out) {
  if (out.fields.length > ARENA_FIELD_SLOT_IDS.length) {
    out.fields.length = ARENA_FIELD_SLOT_IDS.length;
  }
  for (let i = 0; i < out.fields.length; i++) out.fields[i].id = ARENA_FIELD_SLOT_IDS[i];
  if (out.mines.length > ARENA_MINE_MAX) out.mines.length = ARENA_MINE_MAX;
  return out;
}

function isLawArena(arenaId) {
  return arenaId === LAGRANGE_ARENA_ID
    || arenaId === CINDER_ARENA_ID
    || arenaId === CRYO_ARENA_ID
    || arenaId === STORM_ARENA_ID;
}

/**
 * PURE room description for one wave. No bus, no registry, no state.
 *
 * Helios keeps the eight-phase table. Law arenas keep their law on idle, because the law IS the
 * room. An unknown phase is inert on every arena — never a guess.
 *
 * Returns { phase, note, fields: [...], mines: [{x,z}], cover: boolean }.
 * `fields` is capped at ARENA_FIELD_SLOT_IDS.length and its entries already carry their slot id.
 */
export function planArenaInstall({
  arenaPhase,
  arenaId = null,
  wave = 1,
  seed = 1,
  anchor = null,
  laneGate = 'front',
} = {}) {
  const at = {
    x: anchor && Number.isFinite(anchor.x) ? anchor.x : 0,
    z: anchor && Number.isFinite(anchor.z) ? anchor.z : 0,
  };
  const phase = typeof arenaPhase === 'string' ? arenaPhase : 'idle';
  const empty = { phase, note: 'inert room', fields: [], mines: [], cover: false };
  if (!isLawArena(arenaId) && phase === 'idle') return empty;
  if (isLawArena(arenaId) && !SURVIVAL_ARENA_PHASES.includes(phase)) return empty;

  const rng = mulberry32(arenaStreamSeed(seed, wave));
  const spin = rng() * TAU;                                  // the room's own bearing
  const lean = { x: Math.cos(spin), z: Math.sin(spin) };
  const lane = gateBearing(laneGate);                        // the bearing the fight arrives on
  const across = rng() < 0.5
    ? { x: -lane.z, z: lane.x }
    : { x: lane.z, z: -lane.x };                             // which way the lane gets swept

  const out = { phase, note: '', fields: [], mines: [], cover: false };

  if (arenaId === LAGRANGE_ARENA_ID) {
    return finalizeInstall(planLagrangeInstall({
      arenaPhase: phase, at, lane, across, lean, spin,
    }));
  }
  if (arenaId === CINDER_ARENA_ID) {
    return finalizeInstall(planCinderInstall({
      arenaPhase: phase, at, lane, across, spin,
    }));
  }
  if (arenaId === CRYO_ARENA_ID) {
    return finalizeInstall(planCryoInstall({
      arenaPhase: phase, at, lane, across, spin,
    }));
  }
  if (arenaId === STORM_ARENA_ID) {
    return finalizeInstall(planStormInstall({
      arenaPhase: phase, at, lane, across, spin, simTime: 0,
    }));
  }

  switch (phase) {
    // A slow shutter dropping on one wall: everything — hulls, shots, loose cargo — leans that way,
    // so the fight drifts off centre instead of orbiting a fixed point.
    case 'shutter_slow':
      out.note = 'a slow drag toward one wall';
      out.fields.push({
        kind: 'well',
        center: alongBearing(at, lean, 300),
        radius: 520,
        strength: 96,
        falloff: 1.25,
      });
      break;

    // The furnace is lit: the middle of the room shoves everything out of it. You fight on the rim
    // and nothing can camp the centre — including the hostiles.
    case 'furnace_active':
      out.note = 'the centre pushes everything out';
      out.fields.push({
        kind: 'repulsor',
        center: { x: at.x, z: at.z },
        radius: 430,
        strength: 170,
        falloff: 1.55,
      });
      break;

    // A hull plate has torn loose: the fight gets GEOMETRY (large tetherable rocks, spawned through
    // the shipped terrain-anchor seam) plus a soft sag that keeps the debris drifting one way.
    case 'loose_plate':
      out.note = 'cover rocks, and a slow sag pulling them one way';
      out.cover = true;
      out.fields.push({
        kind: 'well',
        center: alongBearing(at, lean, 340),
        radius: 470,
        strength: 58,
        damping: 0.85,
        falloff: 1.15,
      });
      break;

    // Two shutters working against each other: one flank pulls, the opposite flank pushes, so the
    // whole room rakes bodies across a diagonal and no formation holds its shape.
    case 'shutter_alternating':
      out.note = 'one flank pulls, the opposite flank shoves';
      out.fields.push({
        kind: 'well',
        center: alongBearing(at, lean, 300),
        radius: 400,
        strength: 120,
        falloff: 1.2,
      });
      out.fields.push({
        kind: 'repulsor',
        center: alongBearing(at, lean, -300),
        radius: 400,
        strength: 132,
        falloff: 1.2,
      });
      break;

    // The flood lane closes: a directed current runs ACROSS the gate the wave pours out of, raking
    // arrivals sideways, and the mouth of that lane is salted with mines. Wading in costs something.
    case 'shutter_lane_close': {
      out.note = 'a cross-current sweeps the arrival lane, and the mouth is mined';
      out.fields.push({
        kind: 'cone',
        center: alongBearing(at, lane, 300),
        dir: { x: across.x, z: across.z },
        radius: 560,
        strength: 145,
        falloff: 1.15,
        halfAngleRad: 0.5,
        edgeSoftRad: 0.14,
      });
      const mouth = alongBearing(at, lane, 260);
      for (let i = 0; i < ARENA_MINE_MAX; i++) {
        const offset = (i - (ARENA_MINE_MAX - 1) / 2) * 62;
        out.mines.push(point(mouth, across.x * offset, across.z * offset));
      }
      break;
    }

    // An absorbent screen: near-zero pull, heavy velocity damping. Inside it every dash, charge and
    // shot bleeds speed — the room takes the momentum out of the fight rather than steering it.
    case 'absorbent_screen':
      out.note = 'the whole room drinks momentum';
      out.fields.push({
        kind: 'well',
        center: { x: at.x, z: at.z },
        radius: 620,
        strength: 26,
        damping: 2.6,
        falloff: 1.05,
      });
      break;

    // The boss room bites: a heavy central pull you have to fly against, a repulsor berm on one
    // flank, a mined ring at knife range and cover to break line of sight. The loudest room, still
    // inside the two-slot budget.
    case 'boss': {
      out.note = 'a heavy central pull, a berm on one flank, a mined ring and cover';
      out.cover = true;
      out.fields.push({
        kind: 'well',
        center: { x: at.x, z: at.z },
        radius: 560,
        strength: 150,
        damping: 0.7,
        falloff: 1.35,
      });
      out.fields.push({
        kind: 'repulsor',
        center: alongBearing(at, lean, 330),
        radius: 360,
        strength: 150,
        falloff: 1.3,
      });
      for (let i = 0; i < ARENA_MINE_MAX; i++) {
        const angle = spin + (i / ARENA_MINE_MAX) * TAU;
        out.mines.push(point(at, Math.cos(angle) * 205, Math.sin(angle) * 205));
      }
      break;
    }

    // An arenaPhase this file does not know is an INERT room, never a guessed one. A silently
    // wrong room is worse than the honest nothing the ten waves already had.
    default:
      return empty;
  }

  return finalizeInstall(out);
}

/** Copied verbatim from survivalWave.js:25-33 — the same "is this a live Survival run" question. */
function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function playerAnchor(state) {
  const player = state && state.entities && state.playerId != null
    && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const x = player && player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
  const z = player && player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
  return { x, z };
}

function playerTeam(state) {
  const player = state && state.entities && state.playerId != null
    && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  return player && player.team != null ? player.team : 0;
}

function liveArenaBodies(state) {
  const list = [];
  const entities = state && state.entities;
  if (entities && typeof entities.values === 'function') {
    for (const entity of entities.values()) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
      list.push(entity);
    }
  } else if (state && Array.isArray(state.entityList)) {
    for (let i = 0; i < state.entityList.length; i++) {
      const entity = state.entityList[i];
      if (!entity || entity.alive === false || !entity.pos) continue;
      if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
      list.push(entity);
    }
  }
  list.sort((a, b) => {
    const as = String(a.id);
    const bs = String(b.id);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });
  return list;
}

function bodySnapshot(entity) {
  const vel = entity && entity.vel && typeof entity.vel === 'object' ? entity.vel : null;
  const vx = Number.isFinite(entity && entity.vx) ? entity.vx : (vel && Number.isFinite(vel.x) ? vel.x : 0);
  const vz = Number.isFinite(entity && entity.vz) ? entity.vz : (vel && Number.isFinite(vel.z) ? vel.z : 0);
  return {
    id: entity && entity.id,
    pos: entity && entity.pos,
    vx,
    vz,
    statuses: Array.isArray(entity && entity.statuses) ? entity.statuses : [],
  };
}

function writeVel(entity, vx, vz) {
  if (!entity) return;
  if (entity.vel && typeof entity.vel === 'object') {
    entity.vel.x = vx;
    entity.vel.z = vz;
  }
  entity.vx = vx;
  entity.vz = vz;
}

export const survivalArena = {
  name: 'survivalArena',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.registry = ctx.registry || null;
    this.ctx = ctx;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveCleared', () => this._teardown('wave_cleared')));
    this._unsubs.push(this.bus.on('run:ended', () => this._teardown('run_ended')));
    // Mines report themselves as they land; this is the only way to know WHICH entities are ours.
    // `mines.releaseAll` would also take the player's own mines, so it is never called from here.
    this._unsubs.push(this.bus.on('mines:placed', (p) => this._onMinePlaced(p)));
    // fields._clearAll (sector change / new game / save load) empties the kernel under us. Drop the
    // bookkeeping so teardown never reports releasing something the kernel no longer holds.
    const forget = () => this._forgetFields();
    this._unsubs.push(this.bus.on('sector:enter', forget));
    this._unsubs.push(this.bus.on('sector:exit', forget));
    this._unsubs.push(this.bus.on('save:loaded', forget));
  },

  destroy() {
    this._teardown('destroy');
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._teardown('new_game');
  },

  diagnostics() {
    return Object.freeze({
      wave: this._wave,
      phase: this._phase,
      note: this._note,
      lawId: this._lawId,
      fieldIds: (this._fieldIds || []).slice(),
      mineIds: (this._mineIds || []).slice(),
      coverEncounterId: this._encounterId,
    });
  },

  // Law ticks. Helios and Lagrange are event-driven. A missing law id, or no live Survival run,
  // is an immediate no-op — this must not be a global thermal or conductivity term.
  update(_dt, state) {
    if (
      this._lawId !== CINDER_ARENA_ID
      && this._lawId !== CRYO_ARENA_ID
      && this._lawId !== STORM_ARENA_ID
    ) return;
    const st = state || this.state;
    if (!liveSurvivalRun(st)) return;
    if (this._lawId === CINDER_ARENA_ID) {
      if (!this._cycleMachinery) return;
      const system = this._fieldsSystem();
      if (!system || typeof system.updateExternal !== 'function') return;
      const elapsed = simTimeOf(st) - (this._installedAt || 0);
      const cycle = stepCinderMachinery(elapsed);
      const strength = cycle.strength === 0 ? 0 : this._authoredStrength;
      system.updateExternal(ARENA_FIELD_SLOT_IDS[0], { strength });
      return;
    }
    if (this._lawId === CRYO_ARENA_ID) {
      this._tickCryo(st);
      return;
    }
    if (this._lawId === STORM_ARENA_ID) {
      this._tickStorm(st);
    }
  },

  // ---- install --------------------------------------------------------------

  _onWavePlanned(payload) {
    // Re-entrant: wave N+1 can never stack its room on top of wave N's.
    this._teardown('rearm');
    const state = this.state;
    const run = liveSurvivalRun(state);
    if (!run) return;
    const plan = payload && payload.plan;
    if (!plan || plan.ok === false) return;
    const phase = plan.arenaPhase;
    if (typeof phase !== 'string' || phase.length === 0) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    const seed = Number.isInteger(run.seed) ? run.seed : 1;

    const install = planArenaInstall({
      arenaPhase: phase,
      arenaId: run.arenaId,
      wave,
      seed,
      anchor: playerAnchor(state),
      laneGate: dominantGate(plan),
    });

    this._wave = wave;
    this._phase = install.phase;
    this._note = install.note;
    this._lawId = isLawArena(run.arenaId) ? run.arenaId : null;
    this._installedAt = simTimeOf(state);
    this._cycleMachinery = run.arenaId === CINDER_ARENA_ID && CINDER_CYCLE_PHASES.has(phase);
    this._authoredStrength = 0;
    this._cryoRoom = run.arenaId === CRYO_ARENA_ID ? install : null;
    this._stormAt = run.arenaId === STORM_ARENA_ID
      ? { x: install.at ? install.at.x : playerAnchor(state).x, z: install.at ? install.at.z : playerAnchor(state).z }
      : null;
    this._cryoShocked = new Set();
    if (this._cycleMachinery) {
      const cone = install.fields.find((f) => f.kind === 'cone') || install.fields[0];
      this._authoredStrength = cone && Number.isFinite(cone.strength) ? cone.strength : 0;
    }
    this._installFields(install.fields);
    this._installMines(install.mines);
    this._installCover(install.cover, wave);
    this._emit('survivalArena:installed', {
      wave,
      arenaId: run.arenaId,
      arenaPhase: install.phase,
      note: install.note,
      fields: this._fieldIds.length,
      mines: install.mines.length,
      cover: install.cover,
    });
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _installFields(specs) {
    if (!specs || specs.length === 0) return;
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const createdAt = simTimeOf(this.state);
    for (const spec of specs) {
      const record = system.registerEnvironmental({ ...spec, createdAt });
      if (record === null || record === undefined) continue;
      if (!this._fieldIds.includes(spec.id)) this._fieldIds.push(spec.id);
    }
  },

  _installMines(spots) {
    if (!spots || spots.length === 0) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const team = playerTeam(this.state);
    for (const spot of spots) {
      if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) continue;
      this.bus.emit('mines:placeRequest', {
        ownerId: ARENA_MINE_OWNER,
        pos: { x: spot.x, z: spot.z },
        team,
        armDelayS: ARENA_MINE_ARM_DELAY_S,
      });
    }
  },

  _onMinePlaced(payload) {
    if (!payload || payload.ownerId !== ARENA_MINE_OWNER) return;
    if (payload.mineId == null) return;
    if (!this._mineIds.includes(payload.mineId)) this._mineIds.push(payload.mineId);
  },

  _installCover(wanted, wave) {
    if (!wanted) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const state = this.state;
    const anchor = playerAnchor(state);
    // Distinct kind/shape so the many `encounter:*` consumers (world.js:2573 frontier rumours,
    // prospectorLadderFsm:563 claim threats, claims.js defence receipts) all fall through their own
    // guards. This is cover geometry, not a scripted encounter.
    const encounterId = `survival-arena-w${Number.isInteger(wave) ? wave : 0}`;
    this._encounterId = encounterId;
    this.bus.emit('encounter:telegraph', {
      encounterId,
      kind: 'survival_arena',
      shape: 'survival_arena',
      pos: { x: anchor.x, z: anchor.z },
      sectorId: (state && state.world && state.world.currentSectorId) || null,
    });
  },

  // ---- teardown -------------------------------------------------------------

  _teardown(reason) {
    const released = {
      fields: this._releaseFields(),
      mines: this._releaseMines(),
      cover: this._releaseCover(),
    };
    const had = released.fields > 0 || released.mines > 0 || released.cover;
    const phase = this._phase;
    const wave = this._wave;
    this._reset();
    if (had) {
      this._emit('survivalArena:released', {
        wave, arenaPhase: phase, reason, ...released,
      });
    }
  },

  _releaseFields() {
    const ids = this._fieldIds || [];
    if (ids.length === 0) return 0;
    const system = this._fieldsSystem();
    let n = 0;
    if (system && typeof system.unregisterExternal === 'function') {
      for (const id of ids) if (system.unregisterExternal(id)) n++;
    }
    this._fieldIds = [];
    return n;
  },

  /** Kernel already emptied by fields._clearAll — drop the ids without pretending to release them. */
  _forgetFields() {
    this._fieldIds = [];
  },

  _releaseMines() {
    const ids = this._mineIds || [];
    this._mineIds = [];
    const state = this.state;
    if (ids.length === 0 || !state || !state.entities || typeof state.entities.get !== 'function') {
      return 0;
    }
    let n = 0;
    for (const id of ids) {
      const mine = state.entities.get(id);
      if (!mine || mine.alive === false) continue;
      // Only ever our own mines: never `mines.releaseAll`, which would take the player's too.
      const owner = mine.ownerId != null ? mine.ownerId : (mine.data && mine.data.ownerId);
      if (owner !== ARENA_MINE_OWNER) continue;
      mine.alive = false;
      n++;
    }
    return n;
  },

  _releaseCover() {
    const encounterId = this._encounterId;
    this._encounterId = null;
    if (!encounterId) return false;
    if (!this.bus || typeof this.bus.emit !== 'function') return false;
    // MANDATORY pair: terrainAnchors only releases rock ownership on this event (terrainAnchors.js
    // :112). Without it the cover rocks keep their 900s TTL and accumulate across waves.
    this.bus.emit('encounter:resolved', {
      encounterId,
      kind: 'survival_arena',
      shape: 'survival_arena',
      outcome: 'cleared',
      sectorId: (this.state && this.state.world && this.state.world.currentSectorId) || null,
    });
    return true;
  },

  _tickCryo(state) {
    const room = this._cryoRoom;
    if (!room) return;
    const bodies = liveArenaBodies(state);
    const lineage = createCryoRoomLineage(Number.isInteger(state && state.tick) ? state.tick : 0);
    for (let i = 0; i < bodies.length; i++) {
      const entity = bodies[i];
      const before = bodySnapshot(entity);
      const result = applyCryoDrift(before, room, { lineage });
      if (result.zone === 'outside' || result.zone === 'insulated') {
        if (this._cryoShocked) this._cryoShocked.delete(entity.id);
        continue;
      }
      entity.controlScale = result.controlScale;
      entity.statuses = result.statuses;
      if (result.shock && result.shock.ok) {
        if (!this._cryoShocked.has(entity.id)) {
          this._cryoShocked.add(entity.id);
          writeVel(entity, result.vx, result.vz);
        }
      } else if (this._cryoShocked) {
        this._cryoShocked.delete(entity.id);
      }
    }
  },

  _tickStorm(state) {
    const at = this._stormAt;
    if (!at) return;
    const system = this._fieldsSystem();
    if (!system || typeof system.updateExternal !== 'function') return;
    const host = { x: at.x, z: at.z };
    const simTime = simTimeOf(state);
    const relays = placeStormRelays(at, simTime);
    for (let i = 0; i < STORM_RELAY_COUNT; i++) {
      const pose = relays[i] || orbitNodePose(host, i, STORM_RELAY_COUNT, STORM_RELAY_ORBIT, simTime, STORM_RELAY_PERIOD);
      const pos = pose.pos || pose;
      system.updateExternal(ARENA_FIELD_SLOT_IDS[i], {
        center: { x: pos.x, z: pos.z },
        strength: 0,
      });
    }
  },

  _reset() {
    this._fieldIds = [];
    this._mineIds = [];
    this._encounterId = null;
    this._phase = null;
    this._note = '';
    this._wave = 0;
    this._lawId = null;
    this._installedAt = 0;
    this._cycleMachinery = false;
    this._authoredStrength = 0;
    this._cryoRoom = null;
    this._stormAt = null;
    this._cryoShocked = new Set();
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
