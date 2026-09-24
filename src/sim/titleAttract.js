// The LIVE TITLE world — build_map.md §25 "Zero to hero", Phase 5.2 (LIVE TITLE).
//
// A second, deterministic GameState that runs a REAL Crucible-style dogfight for the
// title menu: two NPC teams of canonical enemy archetypes fight under the legacy
// intent contract — ai.js thinks, flight.js flies, weapons.js fires, physics.js
// integrates and sweeps hits, combat.js damages and kills. There is no player entity
// in this world. It runs at BAKE TIME only (scripts/bake-title-attract.mjs) and in
// tests — the live route never imports it; the title stage plays the recorded tape
// (titleAttractTapeData.js) so the front door never pays a second sim's tick cost.
// Determinism at the front of the house: the fight the visitor watches is the same
// simulation the game runs.
//
// Determinism contract:
//   - Fixed seed (TITLE_ATTRACT_SEED). Two worlds built with the same seed produce
//     the same fight tick-for-tick.
//   - Sim systems read state.rng / state.simTime only — no Math.random, no wall clock.
//   - The world never steps until start() is called; the title calls it once the
//     screen is visibly up and idle (ATTRACT_IDLE_MS in screens/mainMenu.js).
//   - dispose() runs system teardown and clears the bus; nothing keeps stepping and
//     no listener escapes into the live game.
//
// Backend choice: legacy flight.js + the custom physics backend — the tested,
// deterministic kinematic path. flightV3 is a deliberate no-op without the Rapier
// authority, and booting the WASM backend on the front door would be the opposite
// of cheap. tacticalAI stays production scope; the attract needs the frozen 6-field
// intent contract that ai.js writes and flight.js consumes.

import { createSimulation, SIM_DT } from '../core/sim.js';
import { ai } from '../systems/ai.js';
import { flight } from '../systems/flight.js';
import { weapons } from '../systems/weapons.js';
import { physics } from '../core/physics.js';
import { combat, makeEnemySpawnSpec } from '../systems/combat.js';

/** The front-door fight's fixed seed. Exported so a probe can name the same world. */
export const TITLE_ATTRACT_SEED = 0x51e7a1e;

/**
 * The two Crucible sides. Every entry is a canonical enemy archetype id; the render
 * track resolves each through the same hostile-identity map live combat uses, so the
 * title fight reads as four distinct silhouettes, not recoloured copies.
 */
export const TITLE_ATTRACT_ROSTER = Object.freeze([
  Object.freeze({ team: 1, typeId: 'wasp_swarmer',    level: 2 }),
  Object.freeze({ team: 1, typeId: 'wasp_swarmer',    level: 2 }),
  Object.freeze({ team: 1, typeId: 'bruiser_brawler', level: 3 }),
  Object.freeze({ team: 2, typeId: 'corsair_raider',  level: 3 }),
  Object.freeze({ team: 2, typeId: 'reaver_pirate',   level: 2 }),
  Object.freeze({ team: 2, typeId: 'reaver_pirate',   level: 2 }),
]);

/** Arena ring radius in world units. Engagement prefs (180–280 wu) keep the fight inside. */
const ARENA_RADIUS_WU = 230;
/** Arc each team's spawn ring occupies around its side of the arena. */
const SPAWN_ARC_HALF = 0.62;
/** Never let the respawn drumbeat grow the fight past this many live hulls. */
const MAX_LIVE_SHIPS = 9;
/** Cadence between reinforcement arrivals once a side is short of its roster. */
const RESPAWN_BASE_S = 2.6;
const RESPAWN_JITTER_S = 1.4;
/** Steps a single presentation advance may burn — a slow frame catches up, never spirals. */
const MAX_STEPS_PER_ADVANCE = 4;

/**
 * The roster owner. Spawn placement is deterministic — team arc + slot index + state.rng
 * jitter — and reinforcements arrive on a sim-time drumbeat while a side is under
 * strength, so the title fight never actually ends (and never silently stops showing
 * combat because one side won).
 */
function createAttractDirector() {
  return {
    name: 'attractDirector',

    init(ctx) {
      this.state = ctx.state;
      this.helpers = ctx.helpers;
      this._slotsByTeam = new Map();
      for (const slot of TITLE_ATTRACT_ROSTER) {
        const list = this._slotsByTeam.get(slot.team) || [];
        list.push(slot);
        this._slotsByTeam.set(slot.team, list);
      }
      this._cursor = {};
      this._nextSpawnAt = {};
      for (const team of this._slotsByTeam.keys()) {
        this._cursor[team] = 0;
        this._nextSpawnAt[team] = Infinity;
      }
      this._opened = false;
    },

    update(dt, state) {
      if (state.mode !== 'flight') return;
      if (!this._opened) {
        // First tick: the opening card. Every later arrival is a reinforcement.
        this._opened = true;
        for (const [team, slots] of this._slotsByTeam) {
          for (let i = 0; i < slots.length; i++) this._spawn(state, slots[i], i);
          this._nextSpawnAt[team] = state.simTime + RESPAWN_BASE_S;
        }
        return;
      }
      let live = 0;
      const aliveByTeam = {};
      for (const e of state.entityList) {
        if (!e || e.type !== 'ship' || !e.alive) continue;
        live++;
        aliveByTeam[e.team] = (aliveByTeam[e.team] || 0) + 1;
      }
      for (const [team, slots] of this._slotsByTeam) {
        if ((aliveByTeam[team] || 0) >= slots.length) continue;
        if (live >= MAX_LIVE_SHIPS) continue;
        if (state.simTime < this._nextSpawnAt[team]) continue;
        const cursor = this._cursor[team]++;
        this._spawn(state, slots[cursor % slots.length], cursor);
        this._nextSpawnAt[team] = state.simTime + RESPAWN_BASE_S + state.rng() * RESPAWN_JITTER_S;
        live++;
      }
    },

    _spawn(state, slot, slotIndex) {
      const side = slot.team === 1 ? Math.PI : 0;
      // Slots fan across the team's arc; rng jitter keeps formations from reading as rails.
      const spread = ((slotIndex % 5) - 2) * 0.5;
      const ang = side + spread * SPAWN_ARC_HALF + (state.rng() - 0.5) * 0.3;
      const r = ARENA_RADIUS_WU * (0.86 + state.rng() * 0.42);
      const pos = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
      const spec = makeEnemySpawnSpec(slot.typeId, slot.level, pos, { startedTick: state.tick });
      spec.team = slot.team;
      spec.rot = Math.atan2(-pos.z, -pos.x);
      spec.data = spec.data || {};
      spec.data.team = slot.team;
      // Roster ownership is the director's alone: archetype self-reinforcement would
      // spawn team-1 allies under a team-2 caller, which reads as a defection, not a fight.
      spec.data.reinforcements = null;
      spec.data.ai = spec.data.ai || {};
      // Durable combat actor — keeps the activity classifier from shelving a hull that
      // drifted outside the origin bubble while the fight chases it back in.
      spec.data.ai.combatant = true;
      return this.helpers.spawnEntity(spec);
    },
  };
}

/**
 * Build the attract world. Nothing steps until start() — the title decides when the
 * screen is visibly up; the stage decides whether the world may run at all (reduced
 * motion never creates one).
 */
export function createTitleAttractWorld(options = {}) {
  const seed = (Number(options.seed) >>> 0) || TITLE_ATTRACT_SEED;
  const sim = createSimulation({
    seed,
    systems: [createAttractDirector(), ai, flight, weapons, physics, combat],
  });
  const state = sim.state;
  state.mode = 'flight';
  // Kinematic authority: the deterministic custom backend (see header — V3 needs Rapier).
  state.settings.gameplay.physicsBackend = 'custom';

  let started = false;
  let disposed = false;
  let acc = 0;
  let kills = 0;
  let fired = 0;
  sim.bus.on('entity:killed', () => { kills++; });
  sim.bus.on('entity:spawned', (p) => { if (p && p.type === 'projectile') fired++; });

  const world = {
    sim,
    state,

    get started() { return started; },
    get disposed() { return disposed; },
    get running() { return started && !disposed; },
    get tick() { return state.tick; },
    /** Fractional-step remainder for render interpolation between tick poses. */
    get alpha() { return started ? acc / SIM_DT : 0; },

    /** The explicit start hook — the title calls this; advance() is inert before it. */
    start() { if (!disposed) started = true; },

    /**
     * Advance the fight by presentation frame time. Runs whole 60 Hz steps only;
     * returns how many ran. Determinism lives on ticks — pacing never changes them.
     */
    advance(frameDt = 0) {
      if (!started || disposed) return 0;
      const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
      acc = Math.min(acc + dt, (MAX_STEPS_PER_ADVANCE + 0.999) * SIM_DT);
      let steps = 0;
      while (acc >= SIM_DT && steps < MAX_STEPS_PER_ADVANCE) {
        sim.step(SIM_DT);
        acc -= SIM_DT;
        steps++;
      }
      return steps;
    },

    /** Fixed-count stepping for tests and probes — identical authority to advance(). */
    runTicks(count) {
      if (!started || disposed) return state;
      const n = Number.isInteger(count) && count >= 0 ? count : 0;
      for (let i = 0; i < n; i++) sim.step(SIM_DT);
      acc = 0;
      return state;
    },

    /**
     * Interpolated pose of one body at alpha ∈ [0,1] between prevPos and pos — the same
     * snapshot pair the live renderer interpolates. Writes into `out`; allocates nothing.
     */
    poseOf(e, alpha, out) {
      const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
      const prev = e.prevPos;
      const pos = e.pos;
      out.x = prev ? prev.x + (pos.x - prev.x) * a : pos.x;
      out.z = prev ? prev.z + (pos.z - prev.z) * a : pos.z;
      const prevRot = Number.isFinite(e.prevRot) ? e.prevRot : e.rot;
      let d = e.rot - prevRot;
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      out.rot = prevRot + d * a;
      out.bank = (Number(e.prevBank) || 0) + ((Number(e.bank) || 0) - (Number(e.prevBank) || 0)) * a;
      out.pitch = (Number(e.prevPitch) || 0) + ((Number(e.pitch) || 0) - (Number(e.prevPitch) || 0)) * a;
      return out;
    },

    /**
     * Snapshot of every attract body for assertions: id, type, team and interpolated
     * pose. Allocating — test/probe use; the stage reads entityList + poseOf directly.
     */
    sample(alpha = 1) {
      const out = [];
      for (const e of state.entityList) {
        if (!e || !e.pos) continue;
        if (e.type !== 'ship' && e.type !== 'projectile' && e.type !== 'pickup') continue;
        const pose = this.poseOf(e, alpha, { x: 0, z: 0, rot: 0, bank: 0, pitch: 0 });
        out.push({
          id: e.id, type: e.type, team: e.team,
          x: pose.x, z: pose.z, rot: pose.rot, bank: pose.bank, pitch: pose.pitch,
          radius: e.radius, alive: e.alive !== false,
          defId: e.data && e.data.defId || null,
          lootTableId: e.data && e.data.lootTableId || null,
          silhouette: e.data && e.data.silhouette || null,
        });
      }
      return out;
    },

    /** Evidence counters: did a real fight actually run. */
    counts() {
      let ships = 0, projectiles = 0;
      for (const e of state.entityList) {
        if (!e || e.alive === false) continue;
        if (e.type === 'ship') ships++;
        else if (e.type === 'projectile') projectiles++;
      }
      return { ships, projectiles, kills, fired, tick: state.tick };
    },

    /** Stop stepping and release every listener — the title must be able to walk away clean. */
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      for (const system of sim.registry.systems) {
        try { if (system && typeof system.destroy === 'function') system.destroy(); }
        catch (error) { console.warn('[titleAttract] system teardown failed:', error); }
      }
      sim.dispose();
    },
  };
  return world;
}
