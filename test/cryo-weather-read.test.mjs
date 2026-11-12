import assert from 'node:assert/strict';
import { test } from 'node:test';

import { helmControlScaleFromCombat } from '../src/combat/cryoLock.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { BURNING_STATUS_ID } from '../src/combat/thermalShock.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { ensureCombatant } from '../src/combat/runtime.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';

function makeFields() {
  const live = new Map();
  return {
    registerEnvironmental(spec) { live.set(spec.id, spec); return spec; },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(id); },
    updateExternal(id, patch) { const row = live.get(id); if (row) Object.assign(row, patch); return row || null; },
    hasExternal(id) { return live.has(id); },
  };
}

function boot() {
  const state = createGameState(7);
  const rawBus = createBus();
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit: rawBus.emit.bind(rawBus),
  };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const fields = makeFields();
  const ctx = { state, bus, helpers, registry: { get: (name) => name === 'fields' ? fields : null } };
  survivalArena.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
  run.arenaId = CRYO_ARENA_ID;
  run.wave = 1;
  run.phase = 'wave_intro';
  state.run = run;
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 7, arenaId: CRYO_ARENA_ID, wave: 1 }) });
  const kernel = getCombatKernel(ctx);
  return {
    state, ctx, bus, kernel,
    spawn(spec) {
      const entity = helpers.spawnEntity({ type: 'ship', team: 2, vel: { x: 0, z: 0 },
        mass: 2, radius: 12, hull: 100, hullMax: 100, shield: 0, ...spec });
      entity.physicsBody = { schemaVersion: 1, radius: entity.radius, mass: entity.mass,
        inertiaY: 1, dynamic: true, revision: 0 };
      return entity;
    },
    tick(entity, tick) {
      state.tick = tick;
      state.simTime = tick / 60;
      kernel.prePhysics(1 / 60);
      survivalArena.update(1 / 60, state);
      return state.combat.entities[String(entity.id)];
    },
    destroy() { survivalArena.destroy(); kernel.dispose(); },
  };
}

test('portable weather explains actual move, depletion, refill and destruction once per installed room', () => {
 const h = boot();
 try {
  const messages = []; h.bus.on('toast', p => messages.push(p.text));
  const prop = survivalArena._roomSolids.get('coolant_tank');
  assert.ok(prop); const home = {...prop.pos};
  const vent = survivalArena._cryoVents.get('coolant');
  survivalArena._syncCryoProps(h.state);
  assert.deepEqual(messages, []);
  prop.pos.x += 20;
  survivalArena._syncCryoProps(h.state);
  assert.match(messages.at(-1), /cold follows for eight seconds/);
  assert.equal(vent.charge, 479);
  assert.equal(survivalArena._cryoRoom.props.coolant[0].x, prop.pos.x);
  for(let i=0;i<359;i++) survivalArena._syncCryoProps(h.state);
  assert.equal(vent.charge, 120);
  assert.match(messages.at(-1), /two seconds/);
  for(let i=0;i<120;i++) survivalArena._syncCryoProps(h.state);
  assert.equal(vent.charge, 0);
  assert.equal(survivalArena._cryoRoom.props.coolant.length, 1, 'last charged tick still has a pocket');
  survivalArena._syncCryoProps(h.state);
  assert.equal(survivalArena._cryoRoom.props.coolant.length, 0);
  assert.match(messages.at(-1), /spent: its portable pocket has ended/);
  prop.pos = {...home}; survivalArena._syncCryoProps(h.state);
  assert.equal(vent.charge, 480);
  assert.match(messages.at(-1), /charge replenished/);
  prop.pos.x += 20; survivalArena._syncCryoProps(h.state);
  prop.pos = {...home}; survivalArena._syncCryoProps(h.state);
  assert.equal(messages.length, 4, 'dock-edge chatter must not repeat instruction');
  prop.alive = false; survivalArena._syncCryoProps(h.state);
  assert.match(messages.at(-1), /destroyed/);
  survivalArena._syncCryoProps(h.state); assert.equal(messages.length, 5);
  assert.equal(survivalArena._cryoRoom.props.coolant.length, 0);
 } finally {h.destroy();}
});

test('heat has its own dangerous pocket explanation and lifetime reset', () => {
 const h=boot();
 try {
  const messages=[]; h.bus.on('toast', p=>messages.push(p.text));
  const prop=survivalArena._roomSolids.get('heat_manifold'); prop.pos.x+=20;
  survivalArena._syncCryoProps(h.state);
  assert.match(messages[0], /burning heat follows/);
  assert.doesNotMatch(messages[0], /safe/);
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planWave({seed:7,arenaId:CRYO_ARENA_ID,wave:1}) });
  const fresh=survivalArena._roomSolids.get('heat_manifold'); fresh.pos.x+=20;
  survivalArena._syncCryoProps(h.state);
  assert.equal(messages.length,2);
 }finally{h.destroy();}
});

const { readCryoWeatherCue } = await import('../src/systems/cryoWeatherRead.js');
const docked = { alive:true, docked:true, active:true, charge:480 };
const moved = { alive:true, docked:false, active:true, charge:479 };
test('cue reader does not mutate charge, input observations or seen ledger', () => {
 const before=Object.freeze({...docked}), after=Object.freeze({...moved}), seen=new Set();
 const cue=readCryoWeatherCue(before,after,'coolant',seen);
 assert.equal(cue.id,'moved'); assert.equal(seen.size,0);
 assert.equal(after.charge,479);
 assert.equal(readCryoWeatherCue(before,after,'coolant',new Set(['moved'])),null);
});
test('missing context, unknown roles and unchanged observations are silent', () => {
 assert.equal(readCryoWeatherCue(null,moved,'coolant'),null);
 assert.equal(readCryoWeatherCue(docked,null,'coolant'),null);
 assert.equal(readCryoWeatherCue(docked,moved,'relay'),null);
 assert.equal(readCryoWeatherCue(moved,moved,'heat'),null);
 assert.equal(readCryoWeatherCue({...moved,charge:119},{...moved,charge:118},'heat'),null);
});
test('death overrides low/spent; dock return overrides low; last charged tick is not called spent', () => {
 assert.equal(readCryoWeatherCue(moved,{alive:false,docked:false,active:false,charge:0},'coolant').id,'lost');
 assert.equal(readCryoWeatherCue(moved,docked,'coolant').id,'refilled');
 assert.equal(readCryoWeatherCue({...moved,charge:1},{...moved,charge:0},'heat'),null);
 assert.equal(readCryoWeatherCue({...moved,charge:0},{...moved,charge:0,active:false},'heat').id,'spent');
});
