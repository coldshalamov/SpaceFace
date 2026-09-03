// scripts/lib/bench/realPath.mjs — the shared REAL-PATH boot for every fun-loop bench scenario.
//
// THE REAL-PATH LAW (taste director, binding): "A scenario that integrates its own physics is not
// a measurement." Every number a fun-loop scenario prints must come out of the game's real path —
// `createAuthoritativeRuntime` with the live systems and the live `rapier-dynamic` physics
// authority — not out of a hand-rolled spring, a synthetic knock model, or a fixture that spawns
// the reaction it claims to observe.
//
// This module is the one place that knows how to stand that runtime up. It boots, registers the
// named systems, seeds, spawns hulls, steps N ticks, and exposes state/bus. It contains NO
// scenario logic and no metrics: what to fly, what to measure, and what the bar is belong to the
// lane's own scenario module.
//
// NOTE ON LOCATION (owner: CONTACT lane). The campaign brief asked for this helper at
// `scripts/lib/bench/scenarios/_realPath.mjs`. It cannot live there: `verbBench.discoverScenarioModules()`
// imports EVERY `*.mjs` under `scenarios/` and throws `must export { id, label, run(seed) }` on any
// file that is not a scenario — a helper in that folder would break the verb bench for all six
// lanes. It therefore sits one directory up, and scenario modules import it as `../realPath.mjs`.
//
// Determinism: seeded through the runtime (`state.rng`); this module reads no wall clock and calls
// no ambient randomness.

import { SIM_DT } from '../../../src/core/sim.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../../../src/data/featureFlags.js';
import { createAuthoritativeRuntime } from '../../../src/runtime/createAuthoritativeRuntime.js';
import { actions } from '../../../src/systems/actions.js';
import { aiPorts } from '../../../src/systems/aiPorts.js';
import { collisionConsequences } from '../../../src/systems/collisionConsequences.js';
import { flightV3 } from '../../../src/systems/flightV3.js';
import { physics } from '../../../src/core/physics.js';
import { makeShipEntitySpec } from '../../../src/systems/ships.js';
import { createTacticalAISystem } from '../../../src/systems/tacticalAI.js';
import { weapons } from '../../../src/systems/weapons.js';

/** The sim's fixed timestep. Never pass a different dt to `step()`. */
export const REAL_PATH_DT = SIM_DT;

/**
 * Node-safe systems addressable by name. `tacticalAI` is a factory (one instance per runtime), so
 * it is stored as a thunk and constructed at boot.
 */
const NAMED_SYSTEMS = Object.freeze({
  actions: () => actions,
  aiPorts: () => aiPorts,
  collisionConsequences: () => collisionConsequences,
  flightV3: () => flightV3,
  physics: () => physics,
  tacticalAI: () => createTacticalAISystem(),
  weapons: () => weapons,
});

export const REAL_PATH_SYSTEM_NAMES = Object.freeze(Object.keys(NAMED_SYSTEMS).sort());

function resolveSystems(systems) {
  const list = Array.isArray(systems) ? systems : [];
  if (!list.length) throw new Error('bootRealPath: `systems` must name at least one system');
  return list.map((entry) => {
    if (typeof entry === 'string') {
      const make = NAMED_SYSTEMS[entry];
      if (!make) {
        throw new Error(
          `bootRealPath: unknown system "${entry}" (known: ${REAL_PATH_SYSTEM_NAMES.join(', ')}); `
          + 'pass the system object itself if it is not in the table',
        );
      }
      return make();
    }
    if (entry && typeof entry === 'object') return entry;
    throw new Error('bootRealPath: each `systems` entry must be a name or a system object');
  });
}

/**
 * The proof that this run really was the real path. Every scenario should put this in its metrics:
 * a stand-in can then never pass silently again, because `sg02Ready` would be false and the
 * backend would not read `rapier-dynamic`.
 *
 * @param {object} runtime
 * @returns {{backend:string, sg02Ready:boolean, sg02Bodies:number, sg02DynamicBodies:number,
 *   rapierContacts:number, physicsBackend:string, flightBackend:string, aiBackend:string,
 *   profileId:string}}
 */
export function realPathProof(runtime) {
  const physicsSys = runtime && typeof runtime.getSystem === 'function' ? runtime.getSystem('physics') : null;
  const diag = (physicsSys && physicsSys._diag) || {};
  const gameplay = (runtime && runtime.state && runtime.state.settings && runtime.state.settings.gameplay) || {};
  return {
    backend: String(diag.backend || 'none'),
    sg02Ready: diag.sg02Ready === true,
    sg02Bodies: Number.isFinite(diag.sg02Bodies) ? diag.sg02Bodies : 0,
    sg02DynamicBodies: Number.isFinite(diag.sg02DynamicBodies) ? diag.sg02DynamicBodies : 0,
    rapierContacts: Number.isFinite(diag.rapierContacts) ? diag.rapierContacts : 0,
    // False means SG-02 was built with contact capture off: the run still has real contact
    // physics, but emits no `physics:impact` receipts and `collisionConsequences` sees nothing.
    contactCaptureEnabled: !!(physicsSys && physicsSys._sg02 && physicsSys._sg02.captureContactImpacts),
    physicsBackend: String(gameplay.physicsBackend || 'none'),
    flightBackend: String(gameplay.flightBackend || 'none'),
    aiBackend: String(gameplay.aiBackend || 'none'),
    profileId: String((runtime && runtime.config && runtime.config.profileId) || 'unknown'),
  };
}

/**
 * Boots the real authoritative runtime on the `rapier-dynamic` physics authority.
 *
 * @param {object} options
 * @param {number} options.seed Fixed seed. Required — an unseeded run is an anecdote.
 * @param {Array<string|object>} options.systems System names (see REAL_PATH_SYSTEM_NAMES) or objects,
 *   in registration order. `physics` is required; it is appended if omitted.
 * @param {Array<object>} [options.hulls] Ships to spawn at boot:
 *   `{ hullId, pos: {x,z}, rot?, isPlayer?, team?, factionId?, fittings? }`. Exactly one may be
 *   `isPlayer: true`; that entity becomes `state.playerId` and the returned `player`.
 * @param {string} [options.profileId] Runtime profile (default `'production'`).
 * @returns {Promise<object>} `{ runtime, state, bus, dt, player, hulls, spawnShip, spawnObstacle,
 *   step, proof, dispose }`
 */
export async function bootRealPath({ seed, systems, hulls = [], profileId = 'production' } = {}) {
  if (!Number.isFinite(seed)) throw new Error('bootRealPath: `seed` must be a finite number (fixed seeds or it did not happen)');
  const resolved = resolveSystems(systems);
  if (!resolved.some((s) => s && s.name === 'physics')) resolved.push(physics);

  const runtime = createAuthoritativeRuntime({ profileId, seed, systems: resolved });
  const state = runtime.state;
  if (!state) throw new Error('bootRealPath: runtime has no simulation state');
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const host = {
    runtime,
    state,
    bus: runtime.bus,
    dt: REAL_PATH_DT,
    player: null,
    hulls: [],

    /** Spawn a ship through the real ship spec factory. */
    spawnShip({ hullId, pos, rot = 0, isPlayer = false, team = isPlayer ? 0 : 1, factionId, fittings = [] } = {}) {
      const spec = makeShipEntitySpec(hullId, {
        isPlayer,
        player: isPlayer ? state.player : undefined,
        fittings,
        pos,
        rot,
        team,
        ...(factionId ? { factionId } : {}),
      });
      const entity = runtime.spawn(spec);
      if (isPlayer) {
        state.playerId = entity.id;
        host.player = entity;
      }
      return entity;
    },

    /** Spawn a static rock. Mass/radius are the caller's; the body spec is the real one. */
    spawnObstacle({ pos, radius = 22, mass = 480, inertiaY = 220, hull = 400, dynamic = false, vel = { x: 0, z: 0 }, data = null } = {}) {
      return runtime.spawn({
        type: 'asteroid',
        pos,
        vel: { x: vel.x || 0, z: vel.z || 0 },
        rot: 0,
        radius,
        mass,
        collides: true,
        hull,
        hullMax: hull,
        physicsBody: {
          schemaVersion: 1,
          radius,
          mass,
          inertiaY,
          dynamic,
          ccd: false,
          material: 'asteroid',
          revision: 0,
        },
        data: data || { benchRealPath: 'obstacle' },
      });
    },

    /**
     * Steps `ticks` fixed-timestep ticks through the real runtime.
     *
     * @param {number} ticks
     * @param {{before?:function, after?:function}} [hooks] `before({ tick, state, host })` runs
     *   before the step (write input there); `after(...)` runs after it (sample there). Returning
     *   `false` from either stops the run.
     * @returns {number} ticks actually stepped
     */
    step(ticks, hooks = {}) {
      const before = typeof hooks.before === 'function' ? hooks.before : null;
      const after = typeof hooks.after === 'function' ? hooks.after : null;
      let stepped = 0;
      for (let i = 0; i < ticks; i++) {
        const tick = state.tick | 0;
        if (before && before({ tick, index: i, state, host }) === false) break;
        runtime.step(REAL_PATH_DT);
        stepped++;
        if (after && after({ tick, index: i, state, host }) === false) break;
      }
      return stepped;
    },

    proof() {
      return realPathProof(runtime);
    },

    dispose() {
      runtime.dispose();
    },
  };

  // Spawn before the backend is prepared so every hull gets a body on the first sync.
  for (const spawn of hulls) host.hulls.push(host.spawnShip(spawn));

  const physicsSys = runtime.getSystem('physics');
  if (!physicsSys || typeof physicsSys.prepareBackend !== 'function') {
    throw new Error('bootRealPath: physics.prepareBackend missing — this is not the real path');
  }

  // `createAuthoritativeRuntime` uses restore-on-step isolation: the profile's feature config is
  // applied to the process-global flag MAPS only for the duration of init and each step, and
  // restored afterwards. `prepareBackend` is a lab/bench entry point that runs OUTSIDE that window,
  // and it is where SG-02 is constructed:
  //
  //   createSg02DynamicBodyOwner({ captureContactImpacts: combatFlag('weaponImpulseConsequences'), … })
  //
  // Read outside the window, that flag returns the process default (false), so the owner is built
  // with contact capture permanently OFF — the run then produces real contact physics but ZERO
  // `physics:impact` receipts, and `collisionConsequences` never sees a single contact. Measured
  // on 2026-09-03: 25 ticks of real contact response on the player hull, 0 receipts. Apply the
  // runtime's own feature config across the prepare call so the bench boots the same combat
  // configuration the game runs, then restore the maps exactly as the runtime does.
  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  let ready = false;
  try {
    ready = await physicsSys.prepareBackend(state, { reset: true });
  } finally {
    restoreFeatureMaps(previousFlags);
  }
  if (ready !== true) throw new Error('bootRealPath: SG-02 dynamic authority failed to become ready');

  return host;
}

/**
 * Writes the player input packet exactly as `src/systems/input.js` would. Scenario input tapes go
 * through here so no lane writes velocity or position directly.
 */
export function writeRealPathInput(state, input = {}) {
  const packet = state.input;
  packet.moveX = finiteAxis(input.moveX);
  packet.moveZ = finiteAxis(input.moveZ);
  packet.turnIntent = finiteAxis(input.turnIntent);
  packet.boost = !!input.boost;
  packet.brake = !!input.brake;
  packet.fire = !!input.fire;
  if (!packet.actions) packet.actions = {};
  packet.actions.brake = packet.brake;
  packet.actions.autopursuit = false;
  return packet;
}

function finiteAxis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
