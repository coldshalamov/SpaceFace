#!/usr/bin/env node
// scratch-flight-probe.mjs — minimal repro: does scripted thrust move the hull far from origin?
import { createSimulation, SIM_DT } from './src/core/sim.js';
import { actions } from './src/systems/actions.js';
import { flightV3 } from './src/systems/flightV3.js';
import { weapons } from './src/systems/weapons.js';
import { physics } from './src/core/physics.js';
import { combat } from './src/systems/combat.js';
import { cargo } from './src/systems/cargo.js';
import { economy } from './src/systems/economy.js';
import { missions } from './src/systems/missions.js';
import { story } from './src/systems/story.js';
import { save } from './src/save/saveSystem.js';
import { world } from './src/systems/world.js';
import { NEW_GAME } from './src/data/newGameDefaults.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './src/systems/ships.js';

const sim = createSimulation({
  seed: 4242,
  systems: [actions, flightV3, weapons, physics, combat, cargo, economy, missions, story, save, world],
});
const { state, bus, registry } = sim;
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.flightBackend = 'v3';
state.world.currentSectorId = 'sector_helios_prime';
state.player.credits = NEW_GAME.credits;

const FAR = process.env.FAR === '1';
const playerEntity = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: FAR ? { x: -956, z: 1473 } : { x: 0, z: 0 },
  rot: 0,
}));
state.playerId = playerEntity.id;
if (typeof registry.get('economy').newGame === 'function') registry.get('economy').newGame();
if (typeof registry.get('world').newGame === 'function') registry.get('world').newGame();
bus.emit('game:started', {});
await registry.get('physics').prepareBackend(state, { reset: true });
registry.get('world').enterSector('sector_helios_prime', {});

const p = state.entities.get(state.playerId);
console.log(`probe start: far=${FAR} pos=(${p.pos.x},${p.pos.z}) maxSpeed=${p.maxSpeed} thrust=${p.thrust}`);

for (let i = 0; i < 600; i++) {
  state.input.moveX = 0; state.input.moveZ = 1; state.input.turnIntent = 0;
  state.input.boost = false; state.input.brake = false;
  state.input.fire = false; state.input.fireGroup = null; state.input.autoFire = false;
  if (state.input.actions && state.input.actions.massline) state.input.actions.massline.latch = false;
  sim.step(SIM_DT);
  if (i % 120 === 0) {
    console.log(`t=${i * SIM_DT}s v=${Math.hypot(p.vel.x, p.vel.z).toFixed(1)} pos=(${Math.round(p.pos.x)},${Math.round(p.pos.z)}) moveZ=${state.input.moveZ} cap=${p.capMax ? Math.round((p.cap / p.capMax) * 100) : '?'}% flags=${JSON.stringify(p.flags || {})}`);
  }
}
sim.dispose();
