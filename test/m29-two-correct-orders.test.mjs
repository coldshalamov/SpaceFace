import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { save } from '../src/save/saveSystem.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { siteRuntime } from './helpers/mj4-site-runtime.mjs';

const site = MACHINE_SITES.pallas_empty_foundry;
function ready() {
  const f = siteRuntime(site.sectorId);
  f.materializeMachines(); f.seconds(260);
  f.playerAt({ x: site.center.x, z: site.center.z + 400 });
  f.bus.emit('scan:pulse', { sectorId: site.sectorId });
  const body = f.state.entityList.find(e => e.alive !== false && e.data?.machineWorkpiece === site.siteId);
  assert.ok(body, 'native route mail and finite gantry repair produce the real ballast');
  return { f, body, rec: () => f.state.world.alienEcology.machineSites[site.siteId] };
}
function position(f, body, approach) {
  body.pos = f.world._toGlobal({ x: site.center.x + (approach === 'preservation' ? site.workCycle.preserveDx : site.workCycle.cradleDx), z: site.center.z });
  body.vel = { x: 0, z: 0 }; f.seconds(3.2);
}

for (const approach of ['preservation', 'construction']) {
  test(`M29 accepts ${approach}'s correct ordering and commits the same physical workpiece once`, () => {
    const { f, body, rec } = ready();
    assert.ok(f.events.some(e => e.name === 'siteEvidence:offer' && e.payload.headline === 'Two correct orders'));
    assert.equal(f.action(site.siteId, 'observe', { approach }).ok, true);
    if (approach === 'construction') assert.equal(f.action(site.siteId, 'present').ok, true);
    position(f, body, approach);
    if (approach === 'preservation') assert.equal(f.action(site.siteId, 'present').ok, true);
    assert.equal(f.action(site.siteId, 'choose').ok, true);
    f.seconds(4);
    assert.equal(rec().jurisdiction.status, 'resolved');
    assert.equal(rec().jurisdiction.choice, approach);
    assert.equal(rec().protocol.step, 4);
    assert.equal(body.alive, true);
    assert.equal(rec().maintenance.material, 0);
    assert.equal(f.action(site.siteId, 'choose').settled, true);
    f.seconds(2);
    assert.equal(f.events.filter(e => e.name === 'machine:jurisdictionResolved').length, 1);
  });
}

test('M29 wrong-order presentation gives the missing prerequisite, remains safe and can recover', () => {
  const { f, body, rec } = ready();
  f.action(site.siteId, 'observe', { approach: 'preservation' });
  const wrong = f.action(site.siteId, 'present');
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /Wrong order: POSITION must precede PRESENT/);
  assert.equal(rec().protocol.step, 1);
  assert.equal(rec().jurisdiction.status, 'waiting');
  assert.equal(consumePhysicsCommand(body), null, 'neither machine applies a tug during stalemate');
  assert.ok(f.events.some(e => e.name === 'comms:log' && e.payload.text.includes(wrong.reason)));
  position(f, body, 'preservation');
  f.action(site.siteId, 'present');
  body.pos.x = site.center.x; f.step();
  assert.equal(f.action(site.siteId, 'choose').ok, false, 'stale presentation cannot commit a body outside the volume');
  position(f, body, 'preservation');
  assert.equal(f.action(site.siteId, 'choose').ok, true); f.step();
  assert.equal(rec().jurisdiction.status, 'resolved');
});

test('M29 protocol and in-flight procedure survive the ecology and native entity save round-trip', () => {
  const { f, body, rec } = ready();
  f.action(site.siteId, 'observe', { approach: 'construction' });
  f.action(site.siteId, 'present');
  const before = structuredClone(rec().protocol);
  const ecology = JSON.parse(JSON.stringify(serializeAlienEcologyState(f.state)));
  const envelope = save._serializeEntities.call({ state: f.state });
  assert.ok(envelope.persistent.some(e => e.data?.machineWorkpiece === site.siteId));
  const g = siteRuntime(site.sectorId);
  deserializeAlienEcologyState(g.state, ecology);
  g.materializeMachines();
  g.helpers.spawnEntity(envelope.persistent.find(e => e.data?.machineWorkpiece === site.siteId));
  g.playerAt({ x: site.center.x, z: site.center.z + 400 });
  const restored = g.state.world.alienEcology.machineSites[site.siteId];
  assert.deepEqual(restored.protocol, before);
  const savedBody = g.state.entityList.find(e => e.data?.machineWorkpiece === site.siteId);
  position(g, savedBody, 'construction');
  assert.equal(g.action(site.siteId, 'choose').ok, true); g.seconds(4);
  assert.equal(restored.jurisdiction.choice, 'construction');
  deserializeAlienEcologyState(g.state, JSON.parse(JSON.stringify(serializeAlienEcologyState(g.state))));
  g.seconds(4);
  assert.equal(g.events.filter(e => e.name === 'machine:jurisdictionResolved').length, 1);
  assert.equal(body.data.machineWorkpiece, savedBody.data.machineWorkpiece);
});

test('M29 boundary crossings, declining and destroyed workpieces never fabricate completion', () => {
  const { f, body, rec } = ready();
  f.action(site.siteId, 'observe', { approach: 'preservation' });
  for (let i = 0; i < 20; i++) {
    body.pos.x = site.center.x + site.workCycle.preserveDx + site.workCycle.intakeRadius + (i % 2 ? -1 : 0);
    f.step();
  }
  assert.equal(rec().protocol.step, 1);
  assert.equal(f.action(site.siteId, 'abort').ok, true); f.seconds(4);
  assert.equal(rec().jurisdiction.status, 'waiting');
  f.bus.emit('scan:pulse', { sectorId: site.sectorId });
  body.hull = 0; body.alive = false; f.step();
  assert.equal(rec().masonry.status, 'lost');
  assert.match(f.action(site.siteId, 'present').reason, /destroyed/);
  assert.equal(f.events.filter(e => e.name === 'machine:jurisdictionResolved').length, 0);
});

test('FIX2 M29: destroying the ballast retires its prompt before the player leaves', () => {
  const { f, body, rec } = ready();
  assert.ok(f.events.some(e => e.name === 'siteEvidence:offer' && e.payload.siteId === site.siteId));
  const start = f.events.length;
  body.hull = 0; body.alive = false; f.step();
  assert.equal(rec().masonry.status, 'lost');
  assert.equal(f.events.slice(start).filter(e => e.name === 'siteEvidence:closed'
    && e.payload.siteId === site.siteId).length, 1, 'the untimed decision closes on loss');
  f.playerAt({ x: site.center.x + site.radius + 1000, z: site.center.z });
  f.seconds(2);
  assert.equal(f.events.slice(start).filter(e => e.name === 'siteEvidence:offer').length, 0);
  assert.equal(f.events.slice(start).filter(e => e.name === 'siteEvidence:closed').length, 1);
  assert.equal(f.events.filter(e => e.name === 'machine:jurisdictionResolved').length, 0);
});
