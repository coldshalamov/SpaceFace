import { bootRealPath } from './lib/bench/realPath.mjs';
import { writeNpcIntent } from './lib/bench/scenarios/feel.hitstun_curve.mjs';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { readControlLossPresentation } from '../src/render/masslinePresentation.js';

const host = await bootRealPath({
  seed: 4242, profileId: 'production',
  systems: ['actions', 'flightV3', tumbleStates, 'physics'],
  hulls: [
    { defId: 'ship_drifter', id: 1, pos: { x: 0, z: 0 }, isPlayer: true, loadoutId: 'massline_rig' },
    { defId: 'ship_ironback', id: 2, pos: { x: 100, z: 0 } },
  ],
});
const victim = host.state.entities.get(2);
host.state.player = { cruise: null, targetId: victim.id };
let announced = null;
host.bus.on('massline:tumbled', (e) => { if (e.victimId === victim.id) announced = e; });
host.bus.on('massline:tumbleEnd', (e) => { if (e.victimId === victim.id) console.log(`TUMBLE_END t=${host.state.simTime.toFixed(2)} durationS=${e.durationS} recoverUntil=${e.recoverUntil}`); });
host.bus.on('massline:recovered', (e) => { if (e.victimId === victim.id) console.log(`RECOVERED t=${host.state.simTime.toFixed(2)}`); });
for (let tick = 0; tick < 270; tick++) {
  writeNpcIntent(victim, { moveZ: 1 });
  if (tick === 30) host.withFeatures(() => {
    queuePhysicsImpulse(victim, { x: 0, y: 0, z: 90 * 120 });
    host.bus.emit('massline:throw', { payloadId: victim.id, payloadSpeed: 120 });
  });
  host.step(1);
  if (tick % 30 === 0) {
    const mode = readControlLossPresentation(host.state, victim).mode;
    const t = victim.data && victim.data.tumbleUntil;
    console.log(`t=${host.state.simTime.toFixed(2)} mode=${mode} angVel=${(victim.angVel||0).toFixed(2)} speed=${Math.hypot(victim.vel.x,victim.vel.z).toFixed(0)} data.recoveringUntil=${victim.data&&victim.data.recoveringUntil}`);
  }
}
console.log('announced durationS/until:', announced && announced.durationS, announced && announced.until);
host.dispose();
