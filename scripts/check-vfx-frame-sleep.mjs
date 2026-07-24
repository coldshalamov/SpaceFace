#!/usr/bin/env node
// Contract + runtime check: optional VFX subsystems sleep when inactive.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

function makeBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
      return () => {
        const current = listeners.get(type) || [];
        listeners.set(type, current.filter((item) => item !== fn));
      };
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

function makeHarness(overrides = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
  };
  const state = {
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        energyMaterials: false,
        bloom: true,
        ...(overrides.video || {}),
      },
    },
    render: { scene },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} } },
    content: {},
    ...(overrides.state || {}),
  };
  const bus = makeBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { scene, state, bus, system, player };
}

function optionalSubsystemSum(frame) {
  return (frame.miningBeam || 0)
    + (frame.tetherCable || 0)
    + (frame.seamMarkers || 0)
    + (frame.energy || 0)
    + (frame.particles || 0)
    + (frame.sprites || 0)
    + (frame.eventLights || 0);
}

function checkStaticSleepGuards() {
  const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(source, /_miningBeamActive\(\)/, 'vfx.update should gate mining beam on active state');
  assert.match(source, /_tetherCableActive\(\)/, 'vfx.update should gate tether cable on active state');
  assert.match(source, /_seamMarkersRelevant\(\)/, 'vfx.update should gate seam markers on relevance');
  assert.match(source, /_energyMaterialsEnabled\(\)/, 'energy materials should sleep when disabled');
  assert.match(source, /_activeLightCount <= 0/, 'event lights should sleep when none are active');
  assert.match(source, /subsystems:\s*\{/, 'vfx.inspect should expose subsystem diagnostics');
  assert.match(source, /_consumeCadence\(/, 'optional subsystems should use internal cadence accumulators');
}

{
  const { bus, system } = makeHarness();
  system.update(1 / 60);
  const frame = system.inspect().subsystems.lastFrame;
  assert.equal(frame.miningBeam, 0, 'idle harness should not run mining beam updates');
  assert.equal(frame.tetherCable, 0, 'idle harness should not run tether cable updates');
  assert.equal(frame.seamMarkers, 0, 'idle harness should not run seam marker updates');
  // VP-220: production thrusters keep a restrained idle nozzle signature for the alive player.
  // That is intentional and cadence-bounded — not a massline/energy-material leak.
  // Legacy energy materials remain off (energyMaterials:false); massline stays dormant.
  if (system._energy && system._energy.fleet) {
    assert.equal(frame.energy, 1, 'production idle plume may keep the energy cadence slot awake');
    const plume = system._energy.fleet.playerPlumeSystem();
    assert.ok(plume && plume.group.visible, 'restrained idle nozzle must be live');
    assert.ok(plume.pool.activeCount > 0, 'idle writes attached compact slots');
    assert.equal(plume.pool.frameAllocations, 0, 'idle production must not allocate');
  } else {
    assert.equal(frame.energy, 0, 'without production fleet, energy materials stay asleep');
  }
  assert.equal(frame.particles, 0, 'idle harness should not integrate particles');
  assert.equal(frame.sprites, 0, 'idle harness should not integrate sprites');
  assert.equal(frame.eventLights, 0, 'idle harness should not decay event lights');
  // Optional sum excludes production energy: mining/tether/seam/particles/sprites/lights only.
  const optionalWithoutProductionEnergy = (frame.miningBeam || 0)
    + (frame.tetherCable || 0)
    + (frame.seamMarkers || 0)
    + (frame.particles || 0)
    + (frame.sprites || 0)
    + (frame.eventLights || 0);
  assert.equal(optionalWithoutProductionEnergy, 0,
    'non-propulsion optional subsystems must sleep on a fully idle frame');
}

{
  const { bus, state, system } = makeHarness();
  const asteroid = {
    id: 9,
    type: 'asteroid',
    alive: true,
    pos: { x: 40, z: 0 },
    radius: 18,
    rot: 0,
    data: { typeId: 'rock_a', seams: [{ localOffset: { x: 2, z: 0 } }] },
  };
  state.entities.set(asteroid.id, asteroid);
  state.entityList.push(asteroid);
  bus.emit('mining:start', { targetId: asteroid.id });
  for (let i = 0; i < 3; i++) system.update(1 / 60);
  const frame = system.inspect().subsystems.lastFrame;
  assert.equal(frame.miningBeam, 1, 'mining:start should wake the mining beam subsystem immediately');
}

checkStaticSleepGuards();
console.log('ok    idle VFX subsystem sleep');
console.log('ok    mining beam wakeup');
console.log('ok    static sleep guards');
console.log('PASS  check:vfx-sleep');