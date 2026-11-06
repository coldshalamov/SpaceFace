import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {createRegistry} from '../src/core/registry.js';
import {createPresentationRegistry} from '../src/runtime/presentationRegistry.js';
import {mountProExperiencesBrowser} from '../src/features/proExperiencesBrowser.js';

for(const lane of ['main','worker'])test(`${lane} browser borrows one prompt for all three occupations`,()=>{
 const bus=createBus(),counts=new Map(),on=bus.on.bind(bus);
 bus.on=(name,fn)=>{counts.set(name,(counts.get(name)||0)+1);const off=on(name,fn);return()=>{counts.set(name,counts.get(name)-1);off();};};
 const ctx={state:createGameState(),bus,helpers:{},simLane:lane,applyRuntimeFeatures:false};
 ctx.registry=lane==='worker'?createPresentationRegistry(ctx):createRegistry(ctx);
 const owners=['counterweightCircuitPrompt','breakwaterSpurPrompt','cinderglassJobPrompt'].map(id=>ctx.registry.get(id));
 assert.ok(owners.every(Boolean));const mounted=mountProExperiencesBrowser(ctx);
 for(const owner of owners)owner.init(ctx);
 assert.equal(counts.get('counterweightCircuit:offer'),2);
 assert.equal(counts.get('breakwaterSpur:offer'),2);
 assert.equal(counts.get('cinderglassJob:servicePrompt'),1);
 mounted.destroy();assert.equal(counts.get('cinderglassJob:servicePrompt'),1);
 for(const owner of owners)owner.destroy();
 assert.equal(counts.get('counterweightCircuit:offer'),0);assert.equal(counts.get('breakwaterSpur:offer'),0);assert.equal(counts.get('cinderglassJob:servicePrompt'),0);
});
