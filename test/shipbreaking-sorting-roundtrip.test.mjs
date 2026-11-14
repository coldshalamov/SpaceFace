import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { shipbreakingYard } from '../src/features/shipbreakingYard/runtime.js';
import { SHIPBREAKING_YARD_SITE as SITE } from '../src/features/shipbreakingYard/layouts.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
let flags;test.before(()=>{flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(flags));
const DT=1/60,okay=result=>assert.equal(result?.ok,true,result?.reason||JSON.stringify(result));
// Initial scene and pilot placement are a fixture; all subsequent positions/velocities are native.
// Explicit owner composition, not rendered full campaign or production update-order acceptance.
test('starter flies both original sorting loads and returns to a paid stopping point without pose writes', async () => {
  const sim = createSimulation({ seed: 1, systems: [ships, economy, flightV3, physics, combat, tetherGameplay, shipbreakingYard] });
  const s = sim.state, native = sim.registry.get('physics'), yard = sim.registry.get('shipbreakingYard');
  try {
    const offers=[];sim.bus.on('shipbreakingYard:offer',p=>offers.push(p));
    const anchor = { x: 500, z: 500 }, start = { x: 470, z: 500 };
    const receiver = { x: anchor.x + SITE.receiverOffset.x, z: anchor.z + SITE.receiverOffset.z };
    const range = Math.hypot(receiver.x - start.x, receiver.z - start.z);
    const dir = { x: (receiver.x - start.x) / range, z: (receiver.z - start.z) / range };
    const heading = Math.atan2(dir.z, dir.x), limit = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    s.mode = 'flight'; s.world.currentSectorId = SITE.sectorId; s.settings.gameplay.physicsBackend = 'rapier-dynamic';
    s.ui.docked = false; s.ui.screenStack = []; sim.registry.get('ships').newGame();
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
      pos: { x: start.x + dir.x * 48, z: start.z + dir.z * 48 }, fittings: [] }));
    player.rot = heading; // Initial fixture heading, before native admission. No later body-pose writes.
    s.playerId = player.id; sim.registry.get('economy').grantCredits(1000, 'yard-native-pilot-fixture');
    s.input = { moveZ: 0, moveX: 0, turnIntent: 0, brake: false, boost: false,
      aimWorld: { ...start }, aimIntentActive: true, actions: {} };
    okay(yard.discover({ anchor })); assert.equal(await native.prepareBackend(s), true);
    for (let index = 0; index < 5; index++) sim.step(DT);
    assert.equal(s.shipbreakingYard.cycles.lark, 0);
    assert.equal(yard.getJob('lark').paidCr, 0);
    assert.equal(s.shipbreakingYard.stats.spentCr, 0, 'no sacrificial claim before useful work');
    const job = yard.getJob('lark'), original = yard.physics.body(job, 'engine');
    assert.ok(job.variant >= 6 && job.variant <= 11);
    assert.equal(original.mass, 18);
    assert.equal(original.physicsBody.mass, 18);
    assert.ok(Math.abs(native._sg02.records.get(original.id).body.mass() - 18) < .001);
    const identity = original.data.identityKey, id = original.id;
    okay(yard.accept('lark', s.shipbreakingYard.revision));
    s.input.aimWorld = { x: original.pos.x, z: original.pos.z }; s.input.actions.tetherFire = true;
    sim.step(DT); s.input.actions.tetherFire = false; sim.step(DT);
    assert.equal(yard.physics.towLine(original)?.defId, 'tether_standard');
    okay(yard.disconnect('engine-clamp', s.shipbreakingYard.revision, job.id));
    const begin = { x: original.pos.x, z: original.pos.z, hull: original.hull }, credits = s.player.credits;
    let delivered = false;
    for (let index = 0; index < 7200; index++) {
      const distance = Math.hypot(receiver.x - original.pos.x, receiver.z - original.pos.z);
      const forwardSpeed = player.vel.x * dir.x + player.vel.z * dir.z, goal = distance > 70 ? 9 : 4;
      const turn = Math.atan2(Math.sin(heading - player.rot), Math.cos(heading - player.rot));
      s.input.turnIntent = limit(turn * 1.2 - player.angVel * .4, -1, 1);
      s.input.moveZ = limit((goal - forwardSpeed) * .04, 0, .16);
      s.input.moveX = 0; s.input.brake = forwardSpeed > goal + 1; s.input.boost = false; s.input.aimIntentActive = false;
      sim.step(DT); // Every movement, steering, brake and line force goes through existing owners.
      assert.equal(original.id, id); assert.equal(original.data.identityKey, identity);
      if (yard.physics.deliveryGate(job, 'engine', yard.receiver()).ok) {
        assert.ok(Math.hypot(original.pos.x - begin.x, original.pos.z - begin.z) > 100);
        assert.ok(Math.hypot(original.vel.x, original.vel.z) <= SITE.receiverSpeed);
        assert.equal(original.hull, begin.hull, 'a careful flight preserves the actual machinery');
        okay(yard.command({actionId:'deliver',moduleId:'engine',revision:s.shipbreakingYard.revision,jobId:job.id})); delivered = true; break;
      }
      assert.ok(original.alive && yard.physics.towLine(original), 'the original and normal native line must survive the trip');
    }
    assert.equal(delivered, true, 'normal pilot inputs must reach a real delivery gate');
    const cassette = yard.physics.body(job,'cargo');
    assert.equal(offers.at(-1).actions[0].moduleId,'cargo');
    const cassetteStart={...cassette.pos},cassetteHull=cassette.hull,cassetteIdentity=cassette.data.identityKey;
    const approachDir = {x:receiver.x-cassette.pos.x,z:receiver.z-cassette.pos.z};
    const length = Math.hypot(approachDir.x,approachDir.z);approachDir.x/=length;approachDir.z/=length;
    const approach={x:cassette.pos.x+approachDir.x*48,z:cassette.pos.z+approachDir.z*48};
    let reached=false;
    for(let i=0;i<60*120;i++){
      const dx=approach.x-player.pos.x,dz=approach.z-player.pos.z,d=Math.hypot(dx,dz);
      const speed=Math.min(8,d*.25), vx=dx/(d||1)*speed,vz=dz/(d||1)*speed;
      const ex=vx-player.vel.x,ez=vz-player.vel.z,cf=Math.cos(player.rot),sf=Math.sin(player.rot);
      s.input.moveZ=limit((ex*cf+ez*sf)*.07,-.25,.25);s.input.moveX=limit((-ex*sf+ez*cf)*.07,-.25,.25);
      const desired=Math.atan2(approachDir.z,approachDir.x),turn=Math.atan2(Math.sin(desired-player.rot),Math.cos(desired-player.rot));
      s.input.turnIntent=limit(turn*1.2-player.angVel*.4,-1,1);s.input.brake=d<8;
      sim.step(DT);
      if(d<8&&Math.hypot(player.vel.x,player.vel.z)<2){reached=true;break;}
    }
    console.log(JSON.stringify({returnToCassette:reached,time:s.simTime,pos:player.pos,cassette:cassette.pos}));
    assert.equal(reached,true);
    s.input.moveX=0;s.input.moveZ=0;s.input.brake=true;s.input.aimWorld={x:cassette.pos.x,z:cassette.pos.z};s.input.aimIntentActive=true;s.input.actions.tetherFire=true;
    sim.step(DT);s.input.actions.tetherFire=false;sim.step(DT);
    assert.ok(yard.physics.towLine(cassette));okay(yard.disconnect('cargo-clamp',s.shipbreakingYard.revision,job.id));
    let second=false;
    for(let i=0;i<60*120;i++){
      const dx=receiver.x-cassette.pos.x,dz=receiver.z-cassette.pos.z,d=Math.hypot(dx,dz);
      const desired=Math.atan2(dz,dx),turn=Math.atan2(Math.sin(desired-player.rot),Math.cos(desired-player.rot));
      const forward=player.vel.x*Math.cos(desired)+player.vel.z*Math.sin(desired),goal=d>70?8:3;
      s.input.turnIntent=limit(turn*1.2-player.angVel*.4,-1,1);s.input.moveZ=limit((goal-forward)*.04,0,.16);s.input.moveX=0;s.input.brake=forward>goal+1;s.input.aimIntentActive=false;
      sim.step(DT);
      if(yard.physics.deliveryGate(job,'cargo',yard.receiver()).ok){okay(yard.command({actionId:'deliver',moduleId:'cargo',revision:s.shipbreakingYard.revision,jobId:job.id}));second=true;break;}
    }
    console.log(JSON.stringify({secondDelivery:second,time:s.simTime,pos:cassette.pos,reason:yard.physics.deliveryGate(job,'cargo',yard.receiver()).reason}));assert.equal(second,true);
    assert.ok(Math.hypot(cassette.pos.x-cassetteStart.x,cassette.pos.z-cassetteStart.z)>100);
    assert.equal(cassette.hull,cassetteHull);assert.equal(cassette.data.identityKey,cassetteIdentity);
    assert.match(offers.at(-1).detail,/Sorting shift settled/);assert.equal(offers.at(-1).actions[0].id,'park');
    const earnings=job.recoveredCr,bank=s.player.credits;okay(yard.command({actionId:'park',jobId:job.id,revision:s.shipbreakingYard.revision}));
    assert.equal(job.status,'parked');assert.equal(job.recoveredCr,earnings);assert.equal(s.player.credits,bank);assert.equal(s.shipbreakingYard.stats.completedJobs,0);
    assert.equal(job.modules.frame.status,'attached');assert.equal(job.modules.spar.status,'attached');
    console.log(JSON.stringify({sortingShift:{seconds:s.simTime,earned:earnings,fee:job.paidCr,net:earnings-job.paidCr,motor:job.modules.engine.receipt,cassette:job.modules.cargo.receipt}}));
    console.log(JSON.stringify({ refitNativeSeconds: s.simTime, movedOriginal: id, mass: 18, receipt: job.modules.engine.receipt }));
    assert.equal(s.shipbreakingYard.stats.spentCr, 80, 'one honest claim fee');
    assert.equal(job.modules.engine.status, 'delivered'); assert.equal(original.alive, false);
    assert.ok(s.player.credits > credits); const paid = s.player.credits;
    assert.equal(yard.deliver('engine', s.shipbreakingYard.revision, job.id).ok, false); assert.equal(s.player.credits, paid);
  } finally { yard.destroy(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
});


