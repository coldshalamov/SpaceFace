import assert from 'node:assert/strict';
import test from 'node:test';
import { input } from '../src/systems/input.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
const DT=1/60;
class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const payload = event;
    payload.type = type;
    if (typeof payload.preventDefault !== 'function') {
      payload.preventDefault = () => { payload.defaultPrevented = true; };
    }
    for (const listener of [...(this.listeners.get(type) || [])]) listener(payload);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

function installFakeInputDom() {
  const previous = {};
  for (const name of ['window', 'document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener']) {
    previous[name] = {
      present: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    };
  }

  const windowTarget = new FakeEventTarget();
  windowTarget.innerWidth = 1280;
  windowTarget.innerHeight = 800;
  const canvasTarget = new FakeEventTarget();
  globalThis.window = windowTarget;
  globalThis.document = {
    getElementById(id) { return id === 'gl-canvas' ? canvasTarget : null; },
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  globalThis.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);

  return {
    windowTarget,
    canvasTarget,
    restore() {
      for (const [name, entry] of Object.entries(previous)) {
        if (entry.present) globalThis[name] = entry.value;
        else delete globalThis[name];
      }
    },
  };
}


for(const scheme of ['pilot','classic','helm-assist']) test(`real keyboard path: ${scheme} translates rather than spinning`,()=>{
  const dom=installFakeInputDom(),host=Object.create(input),state=createGameState(11),bus=createBus();
  const player={...makeShipEntitySpec('ship_saucer',{isPlayer:true}),id:1,alive:true};
  state.mode='flight';state.playerId=1;state.entities.set(1,player);state.entityList=[player];
  state.settings.gameplay.controlScheme=scheme;
  state.settings.controls.gamepad={enabled:false};state.settings.controls.touch={enabled:false};
  const key=(type,code)=>dom.windowTarget.dispatch(type,{code,target:null});
  const step=()=>host.update(DT,state);
  try {
    host.init({state,bus,helpers:{}});
    key('keydown','ArrowLeft');step();
    assert.equal(state.input.moveX,-1);assert.equal(state.input.moveZ,0);assert.equal(state.input.turnIntent,0);
    key('keydown','ArrowUp');step();
    assert.ok(Math.abs(state.input.moveX+Math.SQRT1_2)<1e-10);
    assert.ok(Math.abs(state.input.moveZ-Math.SQRT1_2)<1e-10);assert.equal(state.input.turnIntent,0);
    key('keydown','ArrowRight');key('keydown','ArrowDown');step();
    assert.equal(state.input.moveX,0);assert.equal(state.input.moveZ,0);assert.equal(state.input.brake,false);
    for(const code of ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'])key('keyup',code);
    key('keydown','ArrowDown');step();assert.equal(state.input.moveZ,-1);assert.equal(state.input.brake,false);
    key('keyup','ArrowDown');key('keydown','KeyD');step();assert.equal(state.input.moveX,1);
    key('keyup','KeyD');step();assert.equal(state.input.moveX,0);assert.equal(state.input.moveZ,0);
    key('keydown','ArrowLeft');state.ui.screenStack=['pause'];step();
    assert.equal(state.input.moveX,0);assert.equal(state.input.moveZ,0);assert.equal(state.input.turnIntent,0);
  } finally {host.destroy();dom.restore();}
});

function battle() {
  const state=createGameState(11),bus=createBus();
  state.runtime=Object.freeze({...state.runtime,profileId:'production',features:PRODUCTION_FEATURES});
  state.mode='flight';state.entities.clear();state.nextEntityId=1;
  const index=()=>{
    state.entityList=[...state.entities.values()];
    state.entityIndex={ships:state.entityList.filter(e=>e.type==='ship'),
      weaponShips:state.entityList.filter(e=>e.type==='ship'&&e.data?.weapons)};
  };
  const helpers={getEntity:id=>state.entities.get(id),
    spawnEntity(spec){const e={id:state.nextEntityId++,alive:true,flags:{},collides:true,vel:{x:0,z:0},...spec};
      e.pos||={x:0,z:0};e.data||={};state.entities.set(e.id,e);index();return e;},
    despawnEntity(id){state.entities.delete(id);index();},mulberry32:()=>()=>0.5,hash32:()=>1};
  const player=helpers.spawnEntity(makeShipEntitySpec('ship_saucer',{isPlayer:true,pos:{x:0,z:0},rot:0}));
  state.playerId=player.id;player.team=1;
  const target=helpers.spawnEntity(makeShipEntitySpec('ship_colossus',{isPlayer:false,pos:{x:0,z:160},rot:0}));
  target.team=3;target.data.encounter=true;target.hull=target.hullMax=50000;target.shield=0;
  state.player.targetId=target.id;state.input.fire=true;state.input.aimAngle=Math.PI/2;
  const ws=Object.create(weapons),cs=Object.create(combat);
  ws.init({state,bus,helpers});cs.init({state,bus,helpers});
  return {state,bus,player,target,ws,cs,minCap:player.cap,tick(){index();ws.update(DT,state);this.minCap=Math.min(this.minCap,player.cap);cs.update(DT,state);state.tick++;state.simTime+=DT;}};
}
test('real weapon and damage owners fire the alien battery sideways without turning the saucer',()=>{
  const h=battle(),before=h.target.hull,capBefore=h.player.cap;
  const fire=[];h.bus.on('combat:fire',event=>{if(event.ownerId===h.player.id)fire.push(event);});
  for(let i=0;i<12;i++)h.tick();
  assert.ok(fire.some(e=>e.weaponId==='wpn_saucer_death_ray'),'Death Rays reached real combat fire');
  assert.ok(fire.some(e=>e.weaponId==='wpn_saucer_annihilator'),'Annihilator reached real combat fire');
  assert.ok(h.target.hull<before,'beam hits reach real damage owner');
  assert.ok(h.minCap<capBefore,'weapons pay capacitor costs before reactor regeneration');
  assert.equal(h.player.rot,0,'aiming sideways does not turn movement frame');
});
