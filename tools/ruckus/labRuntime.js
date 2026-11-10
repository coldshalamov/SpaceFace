/** Focused RUCKUS workshop: production entity, event bus, encounter and SG-02 Rapier owner.
 * Only pilot input and scene population are local adapters. Not a full campaign bootstrap.
 */
import { createBus } from '../../src/core/eventBus.js';
import { makeEntity, occupantGenerationOf } from '../../src/core/entity.js';
import { createSg02DynamicBodyOwner } from '../../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, writePhysicsControl } from '../../src/core/physicsAuthority.js';
import { createRuckus, RUCKUS_GLOBAL_ANCHOR as HOME } from '../../src/systems/ruckus.js';
import { RUCKUS as C } from '../../src/data/ruckus.js';
export async function createRuckusFixture(memory = null, options = {}) {
  const state = { simTime: 0, tick: 0, mode: 'flight', timeScale: 1, run: { kind: 'adventure' },
    world: { currentSectorId: C.sectorId }, entities: new Map(), entityList: [],
    player: {}, combat: { attachments: { byId: {} } }, ruckus: memory };
  const bus = createBus(), events = []; let nextId = 0, seq = 0;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++nextId }); state.entities.set(e.id, e); state.entityList.push(e); bus.emit('entity:spawned',{id:e.id}); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; state.entities.delete(id); const at = state.entityList.indexOf(e); if (at >= 0) state.entityList.splice(at, 1); bus.emit('entity:destroyed',{id}); },
    voice: { say(p) { events.push(['comms', { ...p }]); return true; } },
  };
  const player = helpers.spawnEntity({ type: 'ship', team: 0, isPlayer: true, radius: 6, mass: 24, hull: 250, hullMax: 250,
    pos: { x: HOME.x + 25, z: HOME.z + 110 }, maxSpeed: 250,
    physicsBody: { dynamic: true, shape: 'ball', radius: 6, mass: 24, useMeasuredSkin: false, material: 'ship',
      contact: { friction: .1, restitution: .15, linearDamping: 0, angularDamping: 1 } } });
  state.playerId = player.id;
  for (const name of ['ruckus:voice','ruckus:state','ruckus:retrieved','ruckus:pulse','audio:cue','save:dirty']) bus.on(name, p => events.push([name, p]));
  const system = createRuckus(); system.init({ state, bus, helpers });
  const owner = options.physics === false ? null : await createSg02DynamicBodyOwner({ publishTelemetry: false, captureContactImpacts: true });
  let pilotInput = { x: 0, z: 0 }, brake = options.brake !== false;
  const f = { state, bus, helpers, system, owner, player, events,
    body: () => system._entity('body'), core: () => system._entity('core'),
    input(x, z) { pilotInput = { x, z }; },
    step(dt = 1 / 60) {
      if (state.timeScale <= 0) { system.update(dt); return; }
      state.simTime += dt; state.tick++; system.update(dt);
      if (owner) {
        if (brake) writePhysicsControl(player, { mode: 'uncontrolled', source: 'ruckus-workshop-pilot', maxSpeed: 200,
          force: { x: (pilotInput.x * 110 - player.vel.x * 2.5) * player.mass, y: 0, z: (pilotInput.z * 110 - player.vel.z * 2.5) * player.mass } });
        owner.syncFromEntities(state.entityList); owner.step(dt);
        for (const impact of owner.drainContactImpacts()) bus.emit('collision', impact);
      }
    },
    run(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) f.step(); },
    scan(extra = {}) { bus.emit('scan:pulse', { source: 'player-scanner', scannerId: player.id, seq: ++seq,
      pos: { x: player.pos.x, z: player.pos.z }, radius: 330, ...extra }); },
    hold() {
      const target = f.core(); if (!target) return false;
      owner?.syncFromEntities(state.entityList);
      const handle = owner?.createAttachment({ attachmentId: 'ruckus-workshop-line', defId: 'tether_standard', ownerId: player.id,
        targetId: target.id, sourceWorld: player.pos, targetWorld: target.pos,
        restLength: Math.hypot(player.pos.x-target.pos.x,player.pos.z-target.pos.z), tick: state.tick });
      if (owner && !handle) throw Error('Production Massline refused the pressure core');
      state.combat.attachments.byId.workshop = { state: 'active', ownerId: player.id, targetId: target.id,
        ownerGeneration: occupantGenerationOf(player), targetGeneration: occupantGenerationOf(target) };
      return true;
    },
    release(direction = { x: 1, z: 0 }, launchSpeed = 52) {
      const target = f.core(); owner?.cutAttachment({ attachmentId: 'ruckus-workshop-line', reason: 'tether_cut' });
      delete state.combat.attachments.byId.workshop;
      if (target && launchSpeed) { const d = Math.hypot(direction.x, direction.z) || 1;
        queuePhysicsImpulse(target, { x: direction.x / d * launchSpeed * target.mass, y: 0, z: direction.z / d * launchSpeed * target.mass }); }
    },
    throwCore(direction = { x: 1, z: 0 }, speed = 52) { f.hold(); f.run(.12); f.release(direction, speed); },
    destroy() { system.destroy(); owner?.dispose(); },
  };
  f.step(); return f;
}
