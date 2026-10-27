import { createSimulation } from '../../src/core/sim.js';
import { traffic } from '../../src/systems/traffic.js';
import { world } from '../../src/systems/world.js';
import { economy } from '../../src/systems/economy.js';
import { save } from '../../src/save/saveSystem.js';
import { PLANET_SITE } from '../../src/data/planets.js';
import { SUBSYSTEM_DEFS } from '../../src/data/combatDefs.js';
import { getCombatKernel } from '../../src/combat/kernel.js';
import { anvilWorkerRecordId, ANVIL_WORK } from '../../src/systems/anvilWork.js';
export function bootShift(extraSystems = []) {
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, { ...traffic, update() {} }, ...extraSystems, economy, save] });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic'); owner.ensureAnvilWorker(state, sim.spawn, { x: 14000, z: 6000 });
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  const player = sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100, radius: 6,
    pos: { x: receiver.pos.x, z: receiver.pos.z + 100 }, flags: { persistent: true } });
  state.playerId = player.id;
  const station = sim.spawn({ type: 'station', hull: 1000, radius: 120, pos: { x: 13000, z: 9500 },
    data: { stationId: ANVIL_WORK.buyerId, collisionProxy: 'skin:place_station_trade_hub', dockRadius: 90 } });
  const econ = sim.registry.get('economy'); econ.ensureMarket(ANVIL_WORK.buyerId);
  const kernel = getCombatKernel({ state, bus: sim.bus }); kernel.inspect({ entityId: receiver.id });
  function disable() {
    const runtime = state.combat.entities[receiver.id], def = SUBSYSTEM_DEFS.find(d => d.id === 'subsystem_drive');
    kernel.routeDamage({ attackerId: null, targetId: receiver.id,
      packet: { channels: { ion: def.armor.flat + runtime.subsystems.subsystem_drive.health / def.armor.multipliers.ion },
        penetration: 0, shieldBypass: 1, subsystemShare: 1, hit: { subsystemId: def.id }, source: { kind: 'test', id: 'shift-damage' } },
      origin: { kind: 'test', id: 'shift-damage' } });
    state.tick += 2; kernel.prePhysics(1 / 60);
  }
  return { sim, state, owner, receiver, player, station, econ, kernel, disable };
}
