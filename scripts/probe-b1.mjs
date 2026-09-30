import { bootRealPath, writeRealPathInput } from './lib/bench/realPath.mjs';
import { planarSpeed, queueDoubleCruiseImpulse } from './lib/bench/scenarios/feel.screen_crossing.mjs';
const host = await bootRealPath({ seed: 4242, systems: ['flightV3','physics'], hulls: [{ hullId: 'ship_kestrel', pos: {x:0,z:0}, rot:0, isPlayer: true, factionId: 'faction_free' }], profileId: 'production' });
const player = host.player;
const state = host.state;
console.log('bounds:', JSON.stringify(state.bounds), 'sectorId:', state.world && state.world.currentSectorId);
host.step(30, { before: ({state}) => writeRealPathInput(state, {}) });
host.step(900, { before: ({state}) => writeRealPathInput(state, { moveZ: 1 }),
  after: ({state}) => {
    if ((state.tick % 60) === 0) console.log(`t=${state.simTime.toFixed(1)} x=${player.pos.x.toFixed(0)} v=${planarSpeed(player).toFixed(0)}`);
  }});
const cruise = planarSpeed(player);
host.step(1, { before: ({state, host: h}) => { writeRealPathInput(state, { moveZ: 1 }); queueDoubleCruiseImpulse(h.player, cruise); } });
console.log('exit x=', player.pos.x.toFixed(0), 'v=', planarSpeed(player).toFixed(1));
host.step(600, { before: ({state}) => writeRealPathInput(state, {}),
  after: ({state}) => {
    if ((state.tick % 60) === 0) console.log(`t=${state.simTime.toFixed(1)} x=${player.pos.x.toFixed(0)} v=${planarSpeed(player).toFixed(0)}`);
  }});
host.dispose();
