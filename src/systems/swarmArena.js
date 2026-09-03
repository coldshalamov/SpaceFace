// Swarm debris field (PQ-135) — the arena's other half.
//
// WHY THIS EXISTS
// ---------------
// The Crucible's whole weapon grammar is PHYSICAL: Throw picks a hull up and puts it into
// something, Tag makes every gravity field in the room pull harder on it, Bind takes its steering
// away. The reciprocal-damage and tumble-contact rules that make "flung him into an asteroid" a
// real kill are already shipped and already on in production (masslineImpactDamage.js).
//
// What was missing was something to fling things INTO. The arena's only geometry came through
// `encounter:telegraph`, and terrainAnchors caps that at THREE rocks in a 600wu bubble and refuses
// to add any if two are already present (terrainAnchors.js:20-21, :78). Three rocks is a landmark,
// not a hazard: you can play a whole wave without a wall ever being within throwing distance.
//
// So a swarm run gets a real debris field — a dozen-plus monoliths in a band around the fight —
// maintained around the player as the fight drifts.
//
// FIVE RULES
// ----------
//   * It only spawns ASTEROIDS, through helpers.spawnEntity, with the exact entity shape
//     terrainAnchors already uses (terrainAnchors.js:83-108). Asteroids are immovable anchors in
//     both physics backends and already carry the tether-socket combat profile, so the massline
//     can latch them the moment they exist and collision asymmetry (§3.5) means they can bounce
//     the player but never hurt him.
//   * It never touches spawnBudget. That ledger counts SHIP slots; a rock is not a ship, and
//     spending hostile slots on scenery would thin the swarm to pay for the walls.
//   * It maintains a COUNT, not a layout. Rocks the player has left far behind are released
//     through the engine's ordinary `despawnAt` sweep, and the field tops back up near wherever
//     the fight has drifted to. The arena follows the player, exactly as the gates do.
//   * It never spawns on top of the player or inside another rock. A monolith materializing on
//     your hull is a death you did not cause.
//   * Deterministic: a seeded mulberry32 stream mixed off (run.seed, wave, index). No Math.random,
//     no wall clock.
//
// Event-driven: no per-tick work at all. It acts on `run:wavePlanned` and lets go on run end.

import { mulberry32 } from '../core/rng.js';
import { validateRunState } from '../core/runState.js';
import { SWARM_SPAWN_CAP } from '../data/swarmMode.js';
import { isSwarmRuleset } from './survivalSwarm.js';

/** Marker on every rock this system creates, so teardown and census never touch sector terrain. */
export const SWARM_DEBRIS_TAG = 'swarmArenaDebris';

/**
 * How many monoliths the fight should be able to see. Tuned against the chase bubble: the visible
 * depth is roughly 93-125wu, so a dozen rocks spread over a 130-480wu band puts two or three in
 * frame at any heading — close enough that a Throw always has a wall, sparse enough that the room
 * still reads as open space rather than a cave.
 */
export const SWARM_DEBRIS_TARGET = 14;
/**
 * A ceiling on the field AROUND THE FIGHT, so a long run drifting across the sector can never
 * accumulate a rock garden.
 *
 * It counts in-fight rocks only. Ones the fight has left behind are already released and on a
 * twenty-second clock, so counting them here would starve the new field of exactly the rocks it is
 * being built to replace. The live total can therefore sit briefly above this during a drift, and
 * that is bounded by the release clock rather than by luck.
 */
export const SWARM_DEBRIS_MAX = 20;

export const SWARM_DEBRIS_INNER = 130;
export const SWARM_DEBRIS_OUTER = 480;
export const SWARM_DEBRIS_SIZE_MIN = 16;
export const SWARM_DEBRIS_SIZE_MAX = 44;

/** Rocks further than this from the player are released to the engine's ordinary despawn sweep. */
export const SWARM_DEBRIS_KEEP_RADIUS = 900;

/**
 * The radius the FIELD IS COUNTED IN, which is deliberately much tighter than the radius rocks are
 * kept in.
 *
 * These used to be the same number, and a live walk found the consequence: by wave five the fight
 * had drifted and there were eleven monoliths within 500 units instead of fourteen — the missing
 * ones were sitting 600-900 away, still "kept", still counted, and completely useless. Counting in
 * the band the fight actually happens in means the field stays dense where the player is, while
 * the wider keep radius stops rocks being churned every time they fall a little behind.
 */
export const SWARM_DEBRIS_FIGHT_RADIUS = SWARM_DEBRIS_OUTER + 60;
/** Minimum gap between two rock SURFACES, so the field never fuses into a wall. */
export const SWARM_DEBRIS_SEPARATION = 46;
/** Nothing spawns closer than this to the player, whatever the roll says. */
export const SWARM_DEBRIS_SAFE_RADIUS = 120;

const SWARM_DEBRIS_TTL_S = 900;
const SWARM_DEBRIS_RELEASE_S = 20;
const PLACEMENT_TRIES = 12;
const TYPE_ID = 'ast_common_rock';
const SOLID_TYPES = new Set(['asteroid', 'station', 'wreck']);

function debrisStreamSeed(seed, wave) {
  const label = `swarm-debris-v1|w${wave}`;
  let h = (seed >>> 0) ^ 0xc2b2ae35;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0) || 1;
}

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
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

/**
 * PURE placement. Given an anchor, the solids already nearby and a seeded stream, decide where the
 * missing rocks go. Exported so the layout can be tested without a game.
 *
 * `existing` is [{ x, z, radius }] — every solid body that could be collided with, not only ours,
 * so the field never grows into a station or a sector asteroid either.
 */
export function planSwarmDebris({ anchor, existing = [], want = 0, rng } = {}) {
  const at = {
    x: anchor && Number.isFinite(anchor.x) ? anchor.x : 0,
    z: anchor && Number.isFinite(anchor.z) ? anchor.z : 0,
  };
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  const placed = existing.map((e) => ({ x: e.x, z: e.z, radius: e.radius || 0 }));
  const out = [];
  const n = Math.max(0, Math.trunc(want));

  for (let i = 0; i < n; i++) {
    const size = SWARM_DEBRIS_SIZE_MIN + roll() * (SWARM_DEBRIS_SIZE_MAX - SWARM_DEBRIS_SIZE_MIN);
    let chosen = null;
    for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt++) {
      // Golden-angle stride off the roll so successive rocks spread around the ring instead of
      // clustering wherever the stream happens to be warm.
      const angle = (roll() * Math.PI * 2) + i * 2.399963;
      const span = SWARM_DEBRIS_OUTER - SWARM_DEBRIS_INNER;
      // sqrt keeps the density even across the annulus rather than piling up at the inner edge.
      const dist = SWARM_DEBRIS_INNER + Math.sqrt(roll()) * span;
      if (dist < SWARM_DEBRIS_SAFE_RADIUS + size) continue;
      const x = at.x + Math.cos(angle) * dist;
      const z = at.z + Math.sin(angle) * dist;
      let clear = true;
      for (const other of placed) {
        const dx = x - other.x;
        const dz = z - other.z;
        const min = size + (other.radius || 0) + SWARM_DEBRIS_SEPARATION;
        if (dx * dx + dz * dz < min * min) { clear = false; break; }
      }
      if (!clear) continue;
      chosen = { x, z, radius: size };
      break;
    }
    if (!chosen) continue;
    placed.push(chosen);
    out.push(chosen);
  }
  return out;
}

export const swarmArena = {
  name: 'swarmArena',
  id: 'swarmArena',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._ids = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._priorCap = null;
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => this._release('run_ended')));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._ids = [];
    this._restoreCapacity();
  },

  /** No per-tick work: the field only changes when a wave is planned. */
  update() {},

  /** Live rocks this system owns, for tests and the lab overlay. */
  debrisCount() {
    const state = this.state;
    if (!state || !state.entities || typeof state.entities.get !== 'function') return 0;
    let n = 0;
    for (const id of this._ids || []) {
      const entity = state.entities.get(id);
      if (entity && entity.alive !== false) n++;
    }
    return n;
  },

  _onWavePlanned(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    this._raiseCapacity();
    this._topUp(run, wave);
  },

  /**
   * THE ROOM'S CAPACITY.
   *
   * How many hulls the arena holds is a property of the arena, so this owner sets it — through the
   * shipped `setMax` seam, which exists for exactly this and clamps itself to spawnBudget's own
   * HARD_MAX. Nothing here moves that wall.
   *
   * The default cap of 24 is sized for a sector carrying ambient freight, patrols and mission
   * spawns alongside a fight. A Crucible run has none of those — freight is sealed out — so the
   * same budget can hold a genuine swarm instead of a squad. The previous ceiling is remembered
   * and restored when the run ends, so the campaign gets its own number back untouched.
   */
  _raiseCapacity() {
    const budget = this.helpers && this.helpers.spawnBudget;
    if (!budget || typeof budget.setMax !== 'function' || typeof budget.max !== 'function') return;
    const current = budget.max();
    if (current >= SWARM_SPAWN_CAP) return;
    if (this._priorCap == null) this._priorCap = current;
    budget.setMax(SWARM_SPAWN_CAP);
    this._emit('swarmArena:capacity', { max: budget.max(), restoreTo: this._priorCap });
  },

  _restoreCapacity() {
    const budget = this.helpers && this.helpers.spawnBudget;
    const prior = this._priorCap;
    this._priorCap = null;
    if (prior == null || !budget || typeof budget.setMax !== 'function') return;
    budget.setMax(prior);
  },

  _topUp(run, wave) {
    const state = this.state;
    const helpers = this.helpers;
    if (!state || !helpers || typeof helpers.spawnEntity !== 'function') return;
    const anchor = playerAnchor(state);
    const keepSq = SWARM_DEBRIS_KEEP_RADIUS * SWARM_DEBRIS_KEEP_RADIUS;
    const fightSq = SWARM_DEBRIS_FIGHT_RADIUS * SWARM_DEBRIS_FIGHT_RADIUS;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;

    // Census: every solid the field must not grow into, and how many of OUR rocks are still in
    // reach. Rocks the fight has left behind are released rather than counted — otherwise a run
    // that drifts across the sector would stop topping up while flying through empty space.
    const nearbySolids = [];
    let mine = 0;
    const surviving = [];
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      if (!SOLID_TYPES.has(entity.type)) continue;
      const dx = entity.pos.x - anchor.x;
      const dz = entity.pos.z - anchor.z;
      const distSq = dx * dx + dz * dz;
      const inReach = distSq <= keepSq;
      const inFight = distSq <= fightSq;
      const ours = !!(entity.data && entity.data[SWARM_DEBRIS_TAG]);
      if (inReach) {
        nearbySolids.push({ x: entity.pos.x, z: entity.pos.z, radius: entity.radius || 0 });
        // Counted only if it is close enough to be part of the fight — see SWARM_DEBRIS_FIGHT_RADIUS.
        if (ours && inFight) mine++;
      }
      if (ours) {
        surviving.push(entity.id);
        if (!entity.data) continue;
        if (inFight) {
          // Back in the fight after a wobble: cancel the release rather than letting a rock the
          // player has returned to vanish under them.
          entity.data.despawnAt = now + SWARM_DEBRIS_TTL_S;
        } else {
          entity.data.despawnAt = Math.min(
            Number.isFinite(entity.data.despawnAt) ? entity.data.despawnAt : Infinity,
            now + SWARM_DEBRIS_RELEASE_S,
          );
        }
      }
    }
    this._ids = surviving;

    const want = Math.min(SWARM_DEBRIS_TARGET - mine, SWARM_DEBRIS_MAX - mine);
    if (want <= 0) return;

    const rng = mulberry32(debrisStreamSeed(
      Number.isInteger(run.seed) ? run.seed : 1,
      Number.isInteger(wave) ? wave : 1,
    ));
    const spots = planSwarmDebris({ anchor, existing: nearbySolids, want, rng });
    const spawnedIds = [];
    for (const spot of spots) {
      const size = spot.radius;
      const oreHP = Math.round(360 + size * 14);
      const spawned = helpers.spawnEntity({
        type: 'asteroid',
        pos: { x: spot.x, z: spot.z },
        vel: { x: 0, z: 0 },
        radius: size,
        // Same 2D-area density scaling terrainAnchors uses, so these read (and sling) as monoliths.
        mass: Math.round(size * size * 40),
        angVel: (rng() - 0.5) * 0.12,
        hull: oreHP,
        hullMax: oreHP,
        collides: true,
        data: {
          typeId: TYPE_ID,
          tier: 0,
          tierCap: 0,
          oreHP,
          oreHPMax: oreHP,
          yieldU: Math.round(6 + size * 0.4),
          size,
          // Both marks on purpose: ours for census and teardown, terrainAnchor so the massline's
          // existing anchor logic treats these exactly like the rocks it already knows.
          [SWARM_DEBRIS_TAG]: true,
          terrainAnchor: true,
          terrainAnchorEncounterIds: [],
          despawnAt: now + SWARM_DEBRIS_TTL_S,
        },
      });
      const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (id != null) spawnedIds.push(id);
    }
    if (spawnedIds.length === 0) return;
    this._ids = this._ids.concat(spawnedIds);
    this._emit('swarmArena:debris', {
      wave,
      added: spawnedIds.length,
      total: this._ids.length,
    });
  },

  /** Hand the field back to the engine's ordinary despawn sweep. Never deletes entities directly. */
  _release(reason) {
    this._restoreCapacity();
    const state = this.state;
    const ids = this._ids || [];
    this._ids = [];
    if (!state || !state.entities || typeof state.entities.get !== 'function' || ids.length === 0) {
      return;
    }
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    let released = 0;
    for (const id of ids) {
      const entity = state.entities.get(id);
      if (!entity || !entity.data) continue;
      entity.data.despawnAt = Math.min(
        Number.isFinite(entity.data.despawnAt) ? entity.data.despawnAt : Infinity,
        now + SWARM_DEBRIS_RELEASE_S,
      );
      released++;
    }
    if (released > 0) this._emit('swarmArena:released', { reason, released });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
