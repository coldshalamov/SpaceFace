/** Isolated validation scene for RUBRIC. Uses the production system, combat kernel, attachments and
 * Rapier; only the bench ship input/spawn adapter is local. Never imported by the game. */
import { createRubric, RUBRIC_GLOBAL_ANCHOR as O } from '../../src/systems/rubric.js';
import { RUBRIC as C } from '../../src/data/rubric.js';
import { createBus } from '../../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../../src/core/entity.js';
import { createCombatKernel } from '../../src/combat/kernel.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, consumePhysicsCommand } from '../../src/core/physicsAuthority.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../../src/data/wreckClasses.js';

export const RUBRIC_EVENTS = ['rubric:voice', 'rubric:marked', 'rubric:last', 'rubric:destroyed', 'audio:cue'];

export function createRubricFixture(memory, options = {}) {
  const events = [], bus = createBus();
  let nextId = 0, seq = 0, physics = null;
  const state = { tick: 0, simTime: 0, mode: 'flight', timeScale: 1, run: { kind: 'adventure' }, rubric: memory,
    meta: { seed: 424242 }, world: { currentSectorId: C.sectorId, frameOrigin: { ...O }, frameOriginSeq: 1 }, render: {},
    entities: new Map(), entityList: [], player: { credits: 333, cargo: { items: {} }, tether: {} }, runtime: { features: {} } };
  const helpers = { sectorCookProviders: [],
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: ++nextId }); stampOccupantGeneration(state, e);
      state.entities.set(e.id, e); state.entityList.push(e);
      bus.emit('entity:spawned', { id: e.id, type: e.type, entity: e }); return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e?.alive) { e.alive = false; bus.emit('entity:destroyed', { id, type: e.type, entity: e }); }
    },
    // A one-voice floor: a line surfaces at once unless `floorBusy` is on (a longer alert holds the floor and the
    // arbiter would drop the line unspoken after its ttl), which is how the live game starves a first hello.
    voice: { say(p) { events.push(['comms', p]); if (!state.floorBusy) bus.emit('voice:surface', { id: `comms:${p.id}`, channel: p.channel, priority: p.priority, text: p.text, ttl: p.ttl }); return true; } } };
  const player = helpers.spawnEntity({ type: 'ship', team: 0, isPlayer: true, radius: 4, mass: 18, hull: 400, hullMax: 400,
    shield: 60, shieldMax: 60, maxSpeed: 250, pos: { x: options.playerAt?.x ?? O.x + 120, z: options.playerAt?.z ?? O.z + 20 },
    vel: { x: 0, z: 0 }, physicsBody: { dynamic: true, shape: 'ball', radius: 4, mass: 18, useMeasuredSkin: false,
      material: 'ship', contact: { friction: 0.1, restitution: 0.1, angularDamping: 0.2 } } });
  state.playerId = player.id;
  const system = createRubric(); system.init({ state, bus, helpers });
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  for (const type of RUBRIC_EVENTS) bus.on(type, p => events.push([type, p]));
  function step(dt = 1 / 60) {
    if (state.timeScale === 0) return;
    state.tick++; state.simTime += dt;
    for (const e of state.entityList) if (e.alive) { e.prevPos.copy(e.pos); e.prevRot = e.rot; }
    system.update(dt, state);
    kernel.prePhysics(dt);
    if (physics) { physics.syncFromEntities(state.entityList); physics.step(dt); }
    else for (const e of state.entityList) consumePhysicsCommand(e);
    kernel.postPhysics(); bus.flush();
  }
  const run = seconds => { for (let n = 0; n < Math.ceil(seconds * 60); n++) step(); };
  function scan(overrides = {}) {
    bus.emit('scan:pulse', { source: 'player-scanner', scannerId: player.id, seq: ++seq,
      pos: { x: player.pos.x, z: player.pos.z }, radius: C.scanRadius, simTime: state.simTime, ...overrides });
  }
  /** An aftermath-shaped wreck: what aftermathWrecks materializes from a kill marker. */
  function addWreck({ x, z, vx = 0, vz = 0, spin = 0, mass = 60, radius = 9, markerId = 'aft_test', killerId = null,
    label = 'Reaver Pirate', pool = { cmdty_scrap_metal: 3 }, wreckClass = 'battlefield', parentType = 'ship',
    playerWreck = false, t = 0 } = {}) {
    return helpers.spawnEntity({ type: 'wreck', pos: { x, z }, vel: { x: vx, z: vz }, angVel: spin, radius, mass,
      hull: 1, hullMax: 1, physicsBody: { shape: 'capsule', mass }, homeSectorId: C.sectorId,
      data: { homeSectorId: C.sectorId, sectorId: C.sectorId, persistenceOwner: 'aftermathWrecks', parentType,
        proportions: WRECK_COLLIDER_PROPORTIONS, wreckClass, wreckClassLabel: 'Battlefield Wreck', loot: [],
        salvagePool: { ...pool }, scanLabel: 'Battle-scarred Hulk', markerId, killedAt: t, playerWreck,
        provenance: { source: playerWreck ? 'player_wreck' : 'battle-aftermath', markerId, victimLabel: label, killerId },
        aftermath: { markerId, killerId, victimLabel: label, t, playerWreck } } });
  }
  function damage(target, amount = 45, attacker = player) {
    return kernel.routeDamage({ attackerId: attacker.id, targetId: target.id,
      packet: { channels: { kinetic: amount }, flags: {}, subsystemShare: 0, hit: { pos: { x: target.pos.x, z: target.pos.z } } },
      origin: 'rubric-bench:weapon' });
  }
  function grip(target) {
    return kernel.attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: target.id,
      sourceWorld: { x: player.pos.x, z: player.pos.z }, targetWorld: { x: target.pos.x, z: target.pos.z } });
  }
  function cut() { kernel.attachments.breakOwnedBy(player.id, 'manual_cut'); }
  function thrust(x, z, dt = 1 / 60) {
    const n = Math.hypot(x, z), v = player.vel, acc = 75;
    queuePhysicsImpulse(player, { x: player.mass * ((n ? x / n * acc : 0) - v.x * 1.5) * dt,
      z: player.mass * ((n ? z / n * acc : 0) - v.z * 1.5) * dt }, { source: 'rubric-bench-input' });
  }
  /** Brake: the way a pilot with a line out brings the pair to rest. */
  const brake = () => thrust(0, 0);
  async function enablePhysics() {
    physics = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic', fixedDt: 1 / 60, publishTelemetry: false });
    helpers.combatPhysics = createSg02CombatPhysicsPort(physics); physics.syncFromEntities(state.entityList); return physics;
  }
  function destroy() { system.destroy(); kernel.dispose(); physics?.dispose(); }
  step();
  return { state, player, system, helpers, kernel, bus, events, step, run, scan, damage, grip, cut, thrust, brake,
    addWreck, enablePhysics, destroy, get physics() { return physics; } };
}
