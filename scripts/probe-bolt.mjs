import { bootRealPath, OPEN_SPACE_BOUNDS, writeRealPathInput } from './lib/bench/realPath.mjs';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { buildSlotList, getDerivedStats } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
const kit = COMBAT_LAB_STARTER_PACKAGES.find(r => r.id === 'hornet_fast_clumsy');
const shipDef = SHIPS.find(r => r.id === kit.hullId);
const slots = buildSlotList(shipDef);
const fittings = new Array(slots.length).fill(null);
for (const e of kit.loadout) fittings[e.slotIndex] = e.defId;
const host = await bootRealPath({ seed: 4242, systems: ['actions','flightV3','physics'], hulls: [{ hullId: 'ship_hornet', pos:{x:0,z:0}, rot:0, isPlayer:true, factionId:'faction_free', fittings }], bounds: OPEN_SPACE_BOUNDS });
const player = host.player;
host.step(90, { before: ({state}) => writeRealPathInput(state, {}) });
host.step(900, { before: ({state}) => writeRealPathInput(state, { moveZ: 1, boost: true }),
  after: ({state}) => {
    if (state.tick % 60 === 0) {
      const b = player.boost || {};
      console.log(`t=${state.simTime.toFixed(1)} v=${Math.hypot(player.vel.x, player.vel.z).toFixed(0)} x=${player.pos.x.toFixed(0)} boost.energy=${(b.energy??NaN).toFixed(1)} boosting=${player.flags&&player.flags.boosting}`);
    }
  }});
host.dispose();
