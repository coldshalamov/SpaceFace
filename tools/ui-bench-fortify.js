// Composition/control fixture only: real run-wallet and construction owners over a paused field.
// The bench does not run physics or certify combat behavior; the normal route owns those claims.
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { createCombatKernel } from '../src/combat/kernel.js';

export function seedFortifyBench(state, bus) {
  state.run = createRunState();
  runSession.init({ state, bus });
  runSession.begin({ kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  Object.assign(state.run, { phase: 'draft', wave: 3, credits: 800 });
  const player = state.entities.get(state.playerId);
  player.pos.x = 0; player.pos.z = 0; player.rot = 0;
  let nextId = 900000;
  const created = new Set();
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true };
      created.add(entity.id);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      const index = state.entityList.indexOf(entity);
      if (index >= 0) state.entityList.splice(index, 1);
      bus.emit('entity:destroyed', { id, entity });
      return true;
    },
  };
  const kernel = createCombatKernel({ state, bus, helpers });
  swarmFortify.init({ state, bus, helpers });
  bus.emit('run:wavePlanned', { wave: 3 });
  const view = swarmFortify.getReadModel();
  const slot = view.sockets.find(socket => !socket.blocked && !socket.occupied);
  if (slot) {
    swarmFortify.build({ requestId: 1, runToken: view.runToken, deviceId: 'gravity_beacon', socketId: slot.id });
    // A damaged fixture makes the repair control visible; no such mutation exists on the screen.
    for (const id of created) {
      const entity = state.entities.get(id);
      if (entity) entity.hull = Math.floor(entity.hullMax * 0.55);
    }
  }
  return () => {
    swarmFortify.destroy();
    runSession.destroy();
    kernel.dispose();
    for (const id of created) helpers.removeEntity(id);
  };
}
