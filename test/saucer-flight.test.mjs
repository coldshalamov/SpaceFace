import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { projectSaucerControls, saucerDirection, saucerVelocity } from '../src/core/flight/saucerControl.js';
import { queueSaucerVelocity, consumeSaucerVelocity } from '../src/core/physicsAuthority.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { fieldBodyProfile } from '../src/systems/fields.js';

const DT = 1 / 60;
function craft(defId = 'ship_saucer') {
  return { ...makeShipEntitySpec(defId, { isPlayer: true }), id: 1, alive: true,
    flags: {}, vel: { x: 0, z: 0 }, angVel: 0, bank: 0 };
}
function scene(defId = 'ship_saucer') {
  const state = createGameState(883);
  const player = craft(defId);
  state.playerId = player.id; state.mode = 'flight';
  state.entities.set(player.id, player); state.entityList = [player];
  state.player.alive = true;
  state.player.ownedShips = [{ defId, fittings: [] }]; state.player.activeShipIndex = 0;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.ui.screenStack = [];
  const sys = Object.create(flightV3);
  sys.state = state; sys.bus = createBus(); sys._diag = {}; sys._warnedBackend = true;
  return { state, player, sys };
}
const near = (a,b, tolerance=1e-3) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);

for (let mask = 0; mask < 16; mask++) {
  test(`all four arrow combinations are normalized world directions: ${mask}`, () => {
    const keys = { ArrowLeft: !!(mask & 1), ArrowRight: !!(mask & 2),
      ArrowUp: !!(mask & 4), ArrowDown: !!(mask & 8) };
    const intent = projectSaucerControls({ keys });
    const expected = saucerDirection(Number(keys.ArrowRight)-Number(keys.ArrowLeft),
      Number(keys.ArrowUp)-Number(keys.ArrowDown));
    near(intent.moveX, expected.x); near(intent.moveZ, expected.z);
    assert.equal(intent.turnIntent, 0); assert.equal(intent.brake, false);
    const velocity = saucerVelocity(intent);
    near(Math.hypot(velocity.x, velocity.z), expected.x || expected.z ? 340 : 0);
  });
}
test('WASD, joystick direction, analogue speed, no down-to-brake and invalid samples', () => {
  assert.deepEqual(projectSaucerControls({ keys: { KeyW: true, KeyD: true } }),
    projectSaucerControls({ keys: { ArrowUp: true, ArrowRight: true } }));
  const stick = projectSaucerControls({ source: 'touch', touch: { leftX: .3, leftY: .4 } });
  near(stick.moveX, .3); near(stick.moveZ, -.4); assert.equal(stick.brake, false);
  near(Math.hypot(...[saucerVelocity(stick).x,saucerVelocity(stick).z]),170);
  const stopped = projectSaucerControls({ keys: { KeyW: true }, brake: true });
  assert.equal(Math.hypot(saucerVelocity(stopped).x, saucerVelocity(stopped).z),0);
  assert.deepEqual(saucerDirection(NaN, Infinity), { x: 0, z: 0 });
});
test('velocity commands are one-shot, finite, bounded, player-only and life/tick/swap guarded', () => {
  const e = craft();
  assert.equal(queueSaucerVelocity(e, {x: Infinity,z:0}),false);
  assert.equal(queueSaucerVelocity(craft('ship_kestrel'), {x:1,z:0}),false);
  e.isPlayer=false; assert.equal(queueSaucerVelocity(e,{x:1,z:0}),false); e.isPlayer=true;
  queueSaucerVelocity(e,{x:10000,z:10000},{tick:4});
  let c=consumeSaucerVelocity(e,4); near(Math.hypot(c.x,c.z),900);
  assert.equal(consumeSaucerVelocity(e,4),null);
  queueSaucerVelocity(e,{x:10,z:0},{tick:4}); assert.equal(consumeSaucerVelocity(e,5),null);
  queueSaucerVelocity(e,{x:10,z:0}); e.occupantGeneration=2; assert.equal(consumeSaucerVelocity(e),null);
  queueSaucerVelocity(e,{x:10,z:0}); e.data.defId='ship_kestrel'; assert.equal(consumeSaucerVelocity(e),null);
});
test('only the player saucer is immune to field coupling, and switching restores coupling', () => {
  const e=craft(); const state=createGameState(3);
  assert.equal(fieldBodyProfile(e,state).fieldResponseMult,0);
  e.isPlayer=false; assert.equal(fieldBodyProfile(e,state).fieldResponseMult,1);
  e.isPlayer=true;e.data.defId='ship_kestrel';assert.equal(fieldBodyProfile(e,state).fieldResponseMult,1);
});
test('production flight + native Rapier: instant start, 90 degree corner, reverse, stop and boost without spinning', async () => {
  const h=scene(); const owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  try {
    owner.syncFromEntities(h.state.entityList);
    const step=(input) => {
      h.state.tick++;h.state.simTime=h.state.tick*DT;
      h.state.input={ ...input, blocked:false };
      h.sys.update(DT,h.state);owner.step(DT,h.state.tick);
    };
    step({ moveX:1,moveZ:0 });near(h.player.vel.x,340);near(h.player.vel.z,0);
    const heading=h.player.rot;
    step({ moveX:0,moveZ:1 });near(h.player.vel.x,0);near(h.player.vel.z,340);near(h.player.rot,heading);
    step({ moveX:-1,moveZ:0 });near(h.player.vel.x,-340);near(h.player.vel.z,0);
    step({ moveX:0,moveZ:0 });near(Math.hypot(h.player.vel.x,h.player.vel.z),0);
    step({ moveX:1,moveZ:0,boost:true });near(h.player.vel.x,900);near(h.player.vel.z,0);
    step({ moveX:0,moveZ:1,boost:true });near(h.player.vel.x,0);near(h.player.vel.z,900);near(h.player.rot,heading);
    near(h.player.angVel,0);assert.ok(h.player.boost.energy<h.player.boost.max);
    h.state.ui.screenStack=['pause'];step({moveX:1,moveZ:0,boost:true});
    near(Math.hypot(h.player.vel.x,h.player.vel.z),0);assert.equal(h.player.flags.boosting,false);
  } finally { owner.dispose(); }
});
test('native control overrides external inertia before the solve, not after, while normal ships retain impulses', async () => {
  const h=scene(); const owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  try {
    owner.syncFromEntities([h.player]);
    queuePhysicsImpulse(h.player,{x:900000,y:0,z:-800000});
    queuePhysicsTorqueImpulse(h.player,{x:0,y:20000,z:0});
    writePhysicsControl(h.player,{force:{x:0,y:0,z:0},torque:{x:0,y:0,z:0},maxSpeed:1000});
    queueSaucerVelocity(h.player,{x:0,z:340});owner.step(DT);
    near(h.player.vel.x,0);near(h.player.vel.z,340);near(h.player.angVel,0);
    h.player.data.defId='ship_kestrel';
    queuePhysicsImpulse(h.player,{x:h.player.mass*10,y:0,z:0});owner.step(DT);
    assert.ok(h.player.vel.x>1,'ordinary ship keeps a real external impulse');
  } finally { owner.dispose(); }
});
test('native collisions remain solid even while repeatedly commanding boost into a fixed asteroid', async () => {
  const h=scene();
  const wall={id:2,type:'asteroid',alive:true,radius:70,mass:1e6,
    pos:{x:150,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{},
    physicsBody:{schemaVersion:1,radius:70,mass:1e6,inertiaY:1e6,dynamic:false,ccd:false,revision:0}};
  const owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  try {
    owner.syncFromEntities([h.player,wall]);
    let contacts=0;
    for(let i=0;i<120;i++) {
      writePhysicsControl(h.player,{force:{x:0,y:0,z:0},torque:{x:0,y:0,z:0},maxSpeed:1000});
      queueSaucerVelocity(h.player,{x:900,z:0});owner.step(DT);
      contacts+=owner.drainContactImpacts().length;
      assert.ok(h.player.pos.x<100,`collision cannot be overwritten: x=${h.player.pos.x}`);
    }
    assert.ok(contacts>0,'native collision receipts prove a real solve');
  } finally {owner.dispose();}
});
