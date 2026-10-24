// RECEIPT / PR-8 (row 506 member 3) — the printer filing every kill at Kepler Scar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECEIPT } from '../src/data/receipt.js';
import {
  receiptPrintableKill, receiptLine, receiptBatchLine, receiptSerialText,
  receiptFollowVelocity, receiptFollowDeltaV,
} from '../src/characters/receiptRules.js';
import { createReceipt, receiptSpec } from '../src/systems/receipt.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_kepler_scar', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: -500, z: 600 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) { const e = { id: 900 + state.entityList.length, alive: true, ...spec }; state.entityList.push(e); state.entities.set(e.id, e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createReceipt();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}
const kill = (id, extra = {}) => ({ id, killerId: 7, type: 'ship', victimClass: 'corsair', targetHostileToPlayer: true, ...extra });
const receipts = (popups) => popups.filter((p) => p.id !== 'receipt_announce' && p.id !== 'receipt_final' && String(p.id).startsWith('receipt_'));

test('spec: marked drone hull, salvage signal, home sector', () => {
  const s = receiptSpec();
  assert.equal(s.data.receipt, true);
  assert.equal(s.data.authoredCharacter, 'receipt');
  assert.equal(s.data.scannerSignalKind, 'salvage');
  assert.equal(s.homeSectorId, 'sector_kepler_scar');
});

test('spawn + announce: drone appears once, announce fires once, sector-gated', () => {
  const { state, popups, sys } = fixture();
  assert.equal(state.entityList.filter((e) => e.data?.receipt).length, 1);
  assert.equal(popups.filter((p) => p.id === 'receipt_announce').length, 1);
  state.world.currentSectorId = 'sector_io_reach';
  sys._sync();
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.receipt).length, 0);
  assert.equal(popups.filter((p) => p.id === 'receipt_announce').length, 1);
});

test('no drone in survival mode or other sectors', () => {
  for (const f of [fixture({ runKind: 'survival' }), fixture({ sector: 'sector_sker_haven' })]) {
    assert.equal(f.state.entityList.filter((e) => e.data?.receipt).length, 0);
  }
});

test('player kill prints a numbered receipt on the calendar pass — batched, not instant', () => {
  const { bus, popups, sys, state } = fixture();
  bus.emit('entity:killed', kill(55));
  assert.equal(receipts(popups).length, 0); // the printer works in batches
  sys.update();
  const r = receipts(popups);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /^Receipt 4,409: one corsair — returned to sender\.$/);
  assert.equal(state.story.flags.receipt_serial, 4410); // serial advanced
});

test('non-player kills and other sectors file nothing', () => {
  const { bus, popups, sys } = fixture();
  bus.emit('entity:killed', kill(55, { killerId: 99 }));
  sys.update();
  assert.equal(receipts(popups).length, 0);
});

test('innocent kills file under final notice; bulk batch prints a range', () => {
  const { bus, popups, sys } = fixture();
  bus.emit('entity:killed', kill(55));
  bus.emit('entity:killed', kill(56, { victimClass: 'freighter', targetHostileToPlayer: false }));
  sys.update();
  const r = receipts(popups);
  assert.equal(r.length, 1);
  assert.match(r[0].text, /4,409–4,410/);
  assert.match(r[0].text, /one disputed/);
  assert.match(r[0].text, /bulk return accepted/);
});

test('killing the printer files the final receipt once, then the feed dies', () => {
  const { bus, popups, sys, state } = fixture();
  const drone = state.entityList.find((e) => e.data?.receipt);
  // Real ordering: every entity:killed emitter marks the victim dead BEFORE the
  // report reaches the bus — the printer's own body is alive:false at emit time.
  drone.alive = false;
  bus.emit('entity:killed', { id: drone.id, killerId: 7, type: 'drone' });
  assert.equal(popups.filter((p) => p.id === 'receipt_final').length, 1);
  bus.emit('entity:killed', { id: drone.id, killerId: 99, type: 'drone' });
  bus.emit('entity:killed', kill(77));
  sys.update();
  assert.equal(popups.filter((p) => p.id === 'receipt_final').length, 1);
  assert.equal(receipts(popups).length, 0);
});

test('a filed final receipt stays filed: no respawn on sector re-enter or resync', () => {
  const { bus, popups, sys, state } = fixture();
  const drone = state.entityList.find((e) => e.data?.receipt);
  drone.alive = false;
  bus.emit('entity:killed', { id: drone.id, killerId: 7, type: 'drone' });
  assert.equal(state.story.flags.receipt_final, true);
  state.entityList.splice(state.entityList.indexOf(drone), 1); // corpse swept
  state.world.currentSectorId = 'sector_io_reach';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  state.world.currentSectorId = 'sector_kepler_scar';
  bus.emit('sector:enter', { sectorId: 'sector_kepler_scar' });
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.receipt).length, 0);
  bus.emit('entity:killed', kill(55));
  sys.update();
  assert.equal(receipts(popups).length, 0); // the feed stays dark
});

test('save:loaded flushes nothing: pending kills belong to the abandoned timeline', () => {
  const { bus, popups, sys } = fixture();
  bus.emit('entity:killed', kill(55));
  bus.emit('save:loaded', {});
  sys.update();
  assert.equal(receipts(popups).length, 0);
});

test('serial persists across the durable flag — never resets', () => {
  const f = fixture();
  f.state.story.flags.receipt_serial = 5000;
  f.bus.emit('entity:killed', kill(55));
  f.sys.update();
  assert.match(receipts(f.popups)[0].text, /5,000/);
});

test('pure rules: printable gate, serial text, batch line, follow steering', () => {
  assert.equal(receiptPrintableKill(kill(5), 7, 901), true);
  assert.equal(receiptPrintableKill(kill(5, { killerId: 8 }), 7, 901), false);
  assert.equal(receiptPrintableKill(kill(901), 7, 901), false); // won't file itself
  assert.equal(receiptPrintableKill(kill(7), 7, 901), false);   // or the client
  assert.equal(receiptPrintableKill(null, 7, 901), false);
  assert.equal(receiptSerialText(4409), '4,409');
  assert.equal(receiptSerialText(999), '999');
  assert.equal(receiptLine(1, 'corsair', true), 'Receipt 1: one corsair — returned to sender.');
  assert.equal(receiptLine(2, 'freighter', false), 'Receipt 2: one freighter — final notice issued.');
  assert.equal(receiptBatchLine(10, 13, 4, 2), 'Receipts 10–13: 4 hulls, 2 disputed — bulk return accepted.');
  // steering: parked player, drone far away → velocity toward the follow point
  const v = receiptFollowVelocity({ x: 0, z: 0 }, { x: 0, z: 400 }, { x: 0, z: 0 });
  assert.ok(Math.abs(Math.hypot(v.x, v.z) - RECEIPT.followSpeed) < 1e-9);
  assert.ok(v.z > 0);
  // inside the follow ring → stops
  const stop = receiptFollowVelocity({ x: 0, z: 400 + RECEIPT.followOffset }, { x: 0, z: 400 }, { x: 0, z: 0 });
  assert.deepEqual(stop, { x: 0, z: 0 });
  // moving player → trails behind the flight vector
  const trail = receiptFollowVelocity({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 100 });
  assert.ok(trail.z < 0); // behind means negative z when flying +z
  // delta-v form: inside the ring a moving printer brakes to rest; at rest it holds
  const brake = receiptFollowDeltaV(
    { pos: { x: 0, z: 400 + RECEIPT.followOffset }, vel: { x: 0, z: 30 } },
    { x: 0, z: 400 }, { x: 0, z: 0 });
  assert.deepEqual(brake, { x: 0, z: -30 });
  assert.equal(receiptFollowDeltaV(
    { pos: { x: 0, z: 400 + RECEIPT.followOffset }, vel: { x: 0, z: 0 } },
    { x: 0, z: 400 }, { x: 0, z: 0 }), null);
});

test('follow steering crosses the impulse membrane on the calendar pass', () => {
  const { state, sys } = fixture();
  const drone = state.entityList.find((e) => e.data?.receipt);
  state.player.pos = { x: -500, z: 2000 }; state.player.vel = { x: 0, z: 0 };
  sys.update();
  // A live Rapier body owns linvel — the pass queues a mass·dv impulse, never a vel write.
  const cmds = consumePhysicsCommand(drone);
  const imp = cmds && cmds.impulses ? cmds.impulses : [];
  assert.equal(imp.length, 1, 'follow steering is a queued impulse, not a vel write');
  assert.ok(Math.hypot(imp[0].x, imp[0].z) > 0);
  assert.ok(imp[0].z > 0, 'the impulse points at the trailing follow point');
});

test('destroy + re-init: listeners, provider, and owned hull all clean', () => {
  const { state, helpers, sys } = fixture();
  const providersBefore = helpers.sectorCookProviders.length;
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, providersBefore - 1);
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.receipt).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, providersBefore);
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.receipt).length, 1);
});
