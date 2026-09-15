// Real entity factory/index plus observable damage and physics ports. No alternate bomb logic.
import { createGameState } from '../../src/core/gameState.js';
import { createBus } from '../../src/core/eventBus.js';
import { core } from '../../src/core/coreSystem.js';
import { bombs } from '../../src/systems/bombs.js';

export function bombScenario(options = {}) {
  const state = createGameState(47), bus = createBus(), helpers = {};
  state.mode = 'flight'; state.simTime = 0; state.tick = 0;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  const coreSystem = Object.create(core); coreSystem.init(ctx);
  const events = new Map(), damage = [], impulses = [];
  for (const name of ['dropped', 'armed', 'primed', 'detonated', 'fieldEnded', 'released', 'denied', 'commanded']) {
    events.set(name, []); bus.on(`bombs:${name}`, p => events.get(name).push(p));
  }
  const hits = [];
  bus.on('combat:hitstunImpulse', p => hits.push(p));
  helpers.routeCombatDamage = request => { damage.push(request); return { ok: true }; };
  helpers.combatPhysics = { applyImpulse(request) { impulses.push(request); return options.acceptImpulse !== false; } };
  const player = helpers.spawnEntity({ type: 'ship', team: 0, mass: 32, radius: 6,
    pos: { x: 0, z: 0 }, vel: options.velocity || { x: 0, z: 0 }, hull: 1000, hullMax: 1000 });
  state.playerId = player.id;
  const system = Object.create(bombs); system.init(ctx);
  return {
    state, bus, helpers, player, system, damage, impulses, hits,
    events: name => events.get(name),
    spawn(spec = {}) { return helpers.spawnEntity({ type: 'ship', team: 1, mass: 32, radius: 1, hull: 1000, hullMax: 1000, ...spec }); },
    drop(id = 'bomb_frag', owner = player) { return system.drop(owner, id, state); },
    tick(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) { state.tick++; state.simTime += dt; system.update(dt, state); }
    },
    press(action) { state.input.actions ||= {}; state.input.actions[action] = true; },
    close() { system.destroy(); bus.clear(); },
  };
}
