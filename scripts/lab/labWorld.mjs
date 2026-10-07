// Tuning-lab world builder: steps the REAL production systems headless in node.
//
// Not a reimplementation. Systems come from the production Node-safe manifest, in production
// update order. "focused" keeps only the systems a mechanic touches (still production order and
// production objects); "full" runs the whole Node-safe manifest. Pilot input goes through the
// real input system (key map + raycastToPlane aim helper), exactly as the crucible bench does.
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { SIM_DT } from '../../src/core/sim.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../../src/systems/combat.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';

export { SIM_DT };

export const FOCUSED_SYSTEM_NAMES = Object.freeze([
  'input', 'autoTargetAssist', 'scanner', 'tacticalAI', 'aiEncounter', 'actions', 'flight',
  'aiPorts', 'tumbleStates', 'collisionConsequences', 'weapons', 'countermeasures', 'physics',
  'combat', 'combatOutcome', 'tetherGameplay', 'masslineTelemetry', 'masslineThreats',
  'masslineImpacts', 'masslineSnares', 'masslineThrow', 'masslineImpactDamage',
]);

function silentConsole(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, debug: console.debug };
  console.log = console.info = console.warn = console.debug = () => {};
  try { return fn(); } finally { Object.assign(console, saved); }
}

export async function createLabWorld({ seed = 1, bundle = 'focused', quiet = true, settings = {}, extraSystems = [] } = {}) {
  const aim = { x: 0, z: 1000 };
  const helpers = { raycastToPlane: (_ndc, out) => { const o = out || {}; o.x = aim.x; o.z = aim.z; return o; } };
  let runtime;
  const make = () => {
    if (bundle === 'full') {
      return createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed, helpers });
    }
    // Resolve the production manifest once to get the production system objects + order.
    const probe = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed, helpers, createSimulation: false });
    const order = probe.manifest.authoritativeUpdateOrder;
    const keep = new Set([...FOCUSED_SYSTEM_NAMES, ...extraSystems]);
    const systems = order.filter((s) => s && keep.has(s.name));
    return createAuthoritativeRuntime({ profileId: 'production', seed, helpers, systems });
  };
  runtime = quiet ? silentConsole(make) : make();
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  Object.assign(state.settings.gameplay, settings);
  const inputSys = runtime.getSystem('input');
  if (inputSys) { inputSys._keys = inputSys._keys || Object.create(null); }

  const world = {
    runtime, state, aim, inputSys, bundle, seed,
    withFlags(fn) {
      const prev = snapshotFeatureMaps();
      applyFeatureConfigToMaps(runtime.config.features);
      try { return fn(); } finally { restoreFeatureMaps(prev); }
    },
    spawnPlayer({ shipId = NEW_GAME.shipId, modules = NEW_GAME.fittedModules, pos = { x: 0, z: 0 }, rot = 0, vel = null } = {}) {
      return world.withFlags(() => {
        const spec = makeShipEntitySpec(shipId, {
          isPlayer: true, player: state.player, team: 0, factionId: 'faction_free',
          fittings: fittingsFromDefaultModules(shipId, modules || []), pos: { ...pos }, rot,
        });
        spec.flags = { ...(spec.flags || {}), persistent: true };
        const e = runtime.spawn(spec);
        state.playerId = e.id;
        if (vel) { e.vel.x = vel.x; e.vel.z = vel.z; }
        return e;
      });
    },
    spawnRock({ pos, radius = 6, mass = 400, vel = null, dynamic = true }) {
      return world.withFlags(() => runtime.spawn({
        type: 'payload', team: 2, factionId: null, pos: { ...pos }, vel: vel ? { ...vel } : { x: 0, z: 0 }, rot: 0,
        radius, mass, collides: true,
        physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 8, dynamic, ccd: false },
        flags: { persistent: true },
      }));
    },
    // Static asteroid (the real occluder type projectiles collide with).
    spawnAsteroid({ pos, radius = 22, mass = 480, hull = 1e6, dynamic = false }) {
      return world.withFlags(() => runtime.spawn({
        type: 'asteroid', pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, radius, mass, collides: true, hull, hullMax: hull,
        physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * 0.5, dynamic, ccd: false, material: 'asteroid', revision: 0 },
        flags: { persistent: true }, data: { tuningLab: 'occluder' },
      }));
    },
    spawnEnemy({ typeId, level, pos, rot = 0, team = null }) {
      return world.withFlags(() => {
        const spec = makeEnemySpawnSpec(typeId, level, { ...pos }, {});
        if (!spec) throw new Error(`makeEnemySpawnSpec failed for ${typeId}`);
        spec.rot = rot;
        if (team != null) spec.team = team;
        spec.data = spec.data || {}; spec.data.ai = spec.data.ai || {};
        spec.data.ai.spawnContext = 'encounter';
        spec.flags = { ...(spec.flags || {}), persistent: true };
        return runtime.spawn(spec);
      });
    },
    async prepare() {
      const physicsSys = runtime.getSystem('physics');
      const prev = snapshotFeatureMaps();
      applyFeatureConfigToMaps(runtime.config.features);
      try {
        const ok = quiet
          ? await (async () => { const s = console.log; console.log = () => {}; try { return await physicsSys.prepareBackend(state, { reset: true }); } finally { console.log = s; } })()
          : await physicsSys.prepareBackend(state, { reset: true });
        if (ok !== true) throw new Error('physics.prepareBackend did not return true');
      } finally { restoreFeatureMaps(prev); }
    },
    /** Set the held key set for this tick (codes like KeyW, KeyD, ShiftLeft, Space). */
    // pointer: emulate a live mouse (DOM key/mouse events this interval + an active screen
    // pointer), which helm-assist needs before the cursor may own the nose (input.js
    // pointerOwnsHelm = helm && kbmRecent && _screen.active).
    keys(codes = [], { fire = false, pointer = false } = {}) {
      const k = inputSys._keys;
      for (const c of Object.keys(k)) k[c] = false;
      for (const c of codes) k[c] = true;
      inputSys._m0 = !!fire;
      if (pointer) { inputSys._kbmActivityPending = true; if (inputSys._screen) inputSys._screen.active = true; }
    },
    step() { return quiet ? silentConsole(() => runtime.step(SIM_DT)) : runtime.step(SIM_DT); },
    player() { return state.entities.get(state.playerId); },
    dispose() { try { runtime.dispose(); } catch (_) { /* best effort */ } },
  };
  return world;
}

import { resolvePropulsionProfile } from '../../src/core/flight/propulsionCatalog.js';
import { applyFeelEnvelope, hullIdFromEntity } from '../../src/data/flightFeelEnvelopes.js';
import { createHash } from 'node:crypto';

/** The player's effective flight profile exactly as flightV3 resolves it (feel envelope included). */
export function playerFlightProfile(world) {
  const e = world.player();
  return world.withFlags(() => applyFeelEnvelope(resolvePropulsionProfile(e, world.state), hullIdFromEntity(e), e.flightClass));
}

/** Deterministic digest of a kinematic trace (for reproducibility checks). */
export function digest(values) {
  const h = createHash('sha256');
  h.update(JSON.stringify(values));
  return h.digest('hex').slice(0, 16);
}

export function wrapAngle(a) {
  let x = a % (Math.PI * 2);
  if (x <= -Math.PI) x += Math.PI * 2;
  if (x > Math.PI) x -= Math.PI * 2;
  return x;
}
