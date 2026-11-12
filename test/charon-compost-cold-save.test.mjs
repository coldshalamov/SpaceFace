import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { fnv1a } from '../src/save/checksum.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { lootShards } from '../src/systems/lootShards.js';
import { economy } from '../src/systems/economy.js';
import { understoryGardens, UNDERSTORY_QUIET } from '../src/systems/faction_understory.js';
import { UNDERSTORY_RECEIVER, receiverApproach } from '../src/data/understoryReceiver.js';

const IRON = 'cmdty_ore_iron';
const SECTOR = UNDERSTORY_RECEIVER.sectorId;

// Native owners and the real save envelope/restore driver. Staged physical admission:
// no browser, tow integrator, ordinary mining acquisition, or rendered Continue claim.
function boot(playerId = null) {
  const bus = createBus();
  const sim = createSimulation({ seed: 47, bus, systems: [cargo, lootShards, economy, understoryGardens] });
  const { state, registry } = sim;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({ ...(playerId == null ? {} : { id: playerId }), type: 'ship', team: 1, isPlayer: true,
    pos: receiverApproach(), radius: 12, mass: 18, hull: 100, hullMax: 100,
    data: { derived: { mass: 18, operationalMass: 18, propulsion: { mainAccel: 100 } } } });
  state.playerId = player.id;
  const gardenOwner = registry.get('understoryGardens');
  gardenOwner.update(0, state);
  const saver = Object.create(save);
  saver.init({ state, bus, helpers: sim.helpers, registry });
  const grants = [];
  bus.on('credits:changed', row => { if (row.delta > 0) grants.push(structuredClone(row)); });
  const garden = () => state.entityList.find(e => e.alive && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  function feed(body) {
    // Delivery, not creation: retain the producer's original body and occupant life.
    body.pos.copy(garden().pos);
    body.vel.set(0, 0, 0);
    state.player.tether = { active: true, targetId: body.id };
    gardenOwner.update(0, state);
    state.player.tether = null;
    assert.equal(body.alive, false);
  }
  function feedIron(qty) {
    assert.equal(addCargo(state, IRON, qty), qty);
    assert.equal(registry.get('cargo').jettison(IRON, qty), qty);
    const body = state.entityList.find(e => e.alive && e.data?.jettisonedCargo);
    assert.ok(body);
    feed(body);
  }
  return { sim, state, bus, registry, saver, gardenOwner, garden, feed, feedIron, grants };
}

function grownCache(h) {
  h.feedIron(17);
  assert.equal(h.garden().data.gardenStage, 2);
  const due = h.state.understory.gardens[UNDERSTORY_RECEIVER.gardenId].nextDropAt;
  assert.ok(due >= UNDERSTORY_QUIET.firstDropS);
  h.state.simTime = due;
  h.gardenOwner.update(0, h.state);
  const open = h.state.understory.drops.filter(row => row.state === 'open');
  assert.equal(open.length, 1, 'growth produces one actual native cache on its authored clock');
  assert.ok(h.state.entities.get(open[0].entityId));
  return structuredClone(open[0]);
}

const capture = h => JSON.parse(JSON.stringify(h.saver.serialize('compost-cold')));
const cachePayments = h => h.grants.filter(row => row.reason?.startsWith('understory_drop_'));

test('a grown reef keeps the original receivable cache and its finite envelope across cold Continue', () => {
  const a = boot();
  let envelope, drop;
  try {
    drop = grownCache(a);
    envelope = capture(a);
  } finally { a.sim.dispose(); }

  const b = boot();
  try {
    assert.equal(b.saver.loadEnvelope(envelope, 'compost-cold'), true);
    const restored = b.state.entities.get(drop.entityId);
    assert.ok(restored, 'the original physical cache returns');
    assert.equal(restored.data.understoryCacheId, drop.id, 'Continue preserves the original finite cache');
    const restoredRow = b.state.understory.drops.find(row => row.entityId === drop.entityId);
    b.gardenOwner.update(0, b.state);
    const before = b.state.player.credits;
    b.feed(restored);
    assert.ok(b.state.player.credits > before,
      'the original generated cache must still pay when returned after cold Continue');
    assert.ok(restoredRow, 'Continue preserves the finite receivable work, not only its body');
    assert.equal(restoredRow.gen, restored.occupantGeneration, 'the restored row binds this restored occupant');
    assert.equal(restoredRow.valueCr, drop.valueCr);
    assert.equal(restoredRow.expiresAt, drop.expiresAt, 'Continue cannot renew a deadline');
    assert.equal(restoredRow.state, 'returned');
    assert.equal(b.grants.filter(row => row.reason?.startsWith('understory_drop_stash:')).length, 1);
    b.gardenOwner.update(0, b.state);
    assert.equal(b.grants.filter(row => row.reason?.startsWith('understory_drop_stash:')).length, 1);
    assert.equal(b.state.player.cargo.items[IRON] || 0, 0, 'no input cargo was reminted');
  } finally { b.sim.dispose(); }
});

test('saved cache work survives another saved generation and duplicate Continue, then stays settled', () => {
  const a = boot();
  let first, second, paid, drop;
  try { drop = grownCache(a); first = capture(a); }
  finally { a.sim.dispose(); }
  const b = boot();
  try {
    assert.equal(b.saver.loadEnvelope(first), true);
    second = capture(b);
    assert.equal(second.data.understoryGardens.quietCaches.drops[0].cacheLife, drop.cacheLife);
  } finally { b.sim.dispose(); }
  const c = boot();
  try {
    assert.equal(c.saver.loadEnvelope(second), true);
    assert.equal(c.saver.loadEnvelope(second), true);
    c.bus.emit('save:loaded', {});
    const bodies = c.state.entityList.filter(e => e.alive && e.data?.understoryCacheId === drop.id);
    assert.equal(bodies.length, 1);
    const row = c.state.understory.drops.find(r => r.id === drop.id);
    assert.equal(row.valueCr, drop.valueCr);
    assert.equal(row.expiresAt, drop.expiresAt);
    c.feed(bodies[0]);
    assert.equal(cachePayments(c).length, 1);
    assert.equal(row.state, 'returned');
    paid = capture(c);
  } finally { c.sim.dispose(); }
  const d = boot();
  try {
    assert.equal(d.saver.loadEnvelope(paid), true);
    assert.equal(d.saver.loadEnvelope(paid), true);
    const credits = d.state.player.credits;
    d.bus.emit('save:loaded', {});
    d.bus.emit('entity:killed', { id: drop.entityId, killerId: d.state.playerId });
    d.gardenOwner.update(0, d.state);
    assert.equal(d.state.understory.drops.find(r => r.id === drop.id).state, 'returned');
    assert.equal(d.state.entityList.some(e => e.alive && e.data?.understoryCacheId === drop.id), false);
    assert.equal(d.state.player.credits, credits);
    assert.equal(cachePayments(d).length, 0);
  } finally { d.sim.dispose(); }
});

test('a released cache awaiting intake keeps its earned delivery attribution through cold Continue', () => {
  const a = boot(50); // A later pilot id, as on a save after ship replacement.
  let envelope, drop, oldPlayerId;
  try {
    drop = grownCache(a);
    const body = a.state.entities.get(drop.entityId);
    body.pos.copy(a.garden().pos);
    body.vel.set(0, 0, 0);
    oldPlayerId = a.state.playerId;
    // Native release receipt, interrupted before the garden's next intake tick.
    a.bus.emit('tether:released', { targetId: body.id });
    assert.equal(body.data.lastThrowerId, oldPlayerId);
    a.state.player.tether = null;
    envelope = capture(a);
  } finally { a.sim.dispose(); }
  const b = boot();
  try {
    assert.equal(b.saver.loadEnvelope(envelope), true);
    assert.notEqual(b.state.playerId, oldPlayerId, 'the actual loader reallocated the pilot identity');
    b.gardenOwner.update(0, b.state);
    assert.equal(cachePayments(b).length, 1, 'the already-delivered original cache settles without another tow');
    assert.equal(b.state.understory.drops.find(r => r.id === drop.id).state, 'returned');
    b.gardenOwner.update(0, b.state);
    assert.equal(cachePayments(b).length, 1);
  } finally { b.sim.dispose(); }
});

test('Continue retains the existing expiry, including an offsector save and expiry during interruption', () => {
  const a = boot();
  let envelope, drop;
  try {
    drop = grownCache(a);
    a.state.world.currentSectorId = 'sector_tethys_junction';
    envelope = capture(a);
  } finally { a.sim.dispose(); }
  const b = boot();
  try {
    assert.equal(b.saver.loadEnvelope(envelope), true);
    const row = b.state.understory.drops.find(r => r.id === drop.id);
    assert.equal(row.expiresAt, drop.expiresAt);
    b.state.simTime = drop.expiresAt;
    // Re-save after the clock reaches expiry but before the owner's next tick.
    envelope = capture(b);
  } finally { b.sim.dispose(); }
  const c = boot();
  try {
    assert.equal(c.saver.loadEnvelope(envelope), true);
    assert.equal(c.state.understory.drops.find(r => r.id === drop.id).state, 'expired');
    assert.notEqual(c.state.entities.get(drop.entityId)?.alive, true);
    c.gardenOwner.update(0, c.state);
    assert.equal(cachePayments(c).length, 0);
  } finally { c.sim.dispose(); }
});

test('removed or replaced cache occupants cannot regain a payable row through Continue', () => {
  for (const replacement of [false, true]) {
    const a = boot();
    let envelope, drop;
    try {
      drop = grownCache(a);
      const original = a.state.entities.get(drop.entityId);
      const spec = { id: original.id, type: original.type, pos: { ...original.pos }, mass: original.mass,
        radius: original.radius, hull: original.hull, hullMax: original.hullMax,
        flags: structuredClone(original.flags), data: structuredClone(original.data) };
      a.sim.helpers.removeEntity(original.id, { immediate: true });
      if (replacement) {
        const impostor = a.sim.spawn(spec);
        assert.equal(impostor.id, drop.entityId);
        assert.notEqual(impostor.occupantGeneration, drop.gen);
      }
      // The native serializer sees the retired/replaced occupant before a garden tick.
      envelope = capture(a);
      assert.equal(envelope.data.understoryGardens.quietCaches.drops[0].state, 'lost');
    } finally { a.sim.dispose(); }
    const b = boot();
    try {
      assert.equal(b.saver.loadEnvelope(envelope), true);
      b.gardenOwner.update(0, b.state);
      b.bus.emit('entity:killed', { id: drop.entityId, killerId: b.state.playerId });
      assert.equal(b.state.understory.drops.find(r => r.id === drop.id).state, 'lost');
      assert.equal(cachePayments(b).length, 0);
    } finally { b.sim.dispose(); }
  }
});

test('a repeated loaded notification never rebinds work to a replacement runtime occupant', () => {
  const a = boot();
  try {
    const drop = grownCache(a), envelope = capture(a);
    assert.equal(a.saver.loadEnvelope(envelope), true);
    const body = a.state.entities.get(drop.entityId);
    const spec = { id: body.id, type: body.type, pos: { ...body.pos }, mass: body.mass,
      radius: body.radius, hull: body.hull, hullMax: body.hullMax,
      flags: structuredClone(body.flags), data: structuredClone(body.data) };
    a.sim.helpers.removeEntity(body.id, { immediate: true });
    const replacement = a.sim.spawn(spec);
    assert.notEqual(replacement.occupantGeneration, body.occupantGeneration);
    a.bus.emit('save:loaded', {});
    a.bus.emit('entity:killed', { id: replacement.id, killerId: a.state.playerId });
    a.gardenOwner.update(0, a.state);
    assert.equal(a.state.understory.drops.find(r => r.id === drop.id).state, 'lost');
    assert.equal(cachePayments(a).length, 0);
  } finally { a.sim.dispose(); }
});

test('old saves and duplicate or incomplete work receipts never invent cache payment', () => {
  const a = boot();
  let envelope, drop;
  try { drop = grownCache(a); envelope = capture(a); }
  finally { a.sim.dispose(); }
  for (const variant of ['absent', 'duplicate-row', 'missing-deadline', 'missing-body-life', 'duplicate-body']) {
    const legacy = structuredClone(envelope);
    const section = legacy.data.understoryGardens;
    if (variant === 'absent') delete section.quietCaches;
    else if (variant === 'duplicate-row') section.quietCaches.drops.push(structuredClone(section.quietCaches.drops[0]));
    else if (variant === 'missing-deadline') delete section.quietCaches.drops[0].expiresAt;
    else {
      const body = legacy.data.entities.persistent.find(e => e.id === drop.entityId);
      if (variant === 'missing-body-life') delete body.data.understoryCacheLife;
      else legacy.data.entities.persistent.push({ ...structuredClone(body), id: 9876 });
    }
    // Deliberate legacy/malformed import fixtures still traverse the normal checksum gate.
    legacy.checksum = fnv1a(JSON.stringify(legacy.data));
    const b = boot();
    try {
      assert.equal(b.saver.loadEnvelope(legacy), true, variant);
      b.gardenOwner.update(0, b.state);
      b.bus.emit('entity:killed', { id: drop.entityId, killerId: b.state.playerId });
      assert.equal(cachePayments(b).length, 0, variant);
      assert.equal(b.state.understory.drops.some(r => r.id === drop.id && r.state === 'open'), false, variant);
    } finally { b.sim.dispose(); }
  }
});

test('real first-feed credit survives cold Continue and the economy pays the 240t run once', () => {
  const a = boot();
  let partial;
  try {
    a.feedIron(17);
    assert.ok(Math.abs(a.garden().data.compostFedMass - 13.6) < 1e-9);
    partial = JSON.parse(JSON.stringify(a.saver.serialize('compost-partial')));
  } finally { a.sim.dispose(); }
  const b = boot();
  let paid;
  try {
    assert.equal(b.saver.loadEnvelope(partial, 'compost-partial'), true);
    assert.ok(Math.abs(b.garden().data.compostFedMass - 13.6) < 1e-9);
    // The ordinary 40u hold and capable fit stay unchanged; actual pod mass stays <=32t.
    let remaining = 283;
    while (remaining > 0) {
      const units = Math.min(40, remaining);
      b.feedIron(units); remaining -= units;
    }
    assert.ok(Math.abs(b.garden().data.compostFedMass - 240) < 1e-9);
    assert.equal(b.garden().data.compostRunComplete, true);
    const payments = b.grants.filter(row => row.reason === 'understory_compost_run');
    assert.equal(payments.length, 1);
    assert.equal(payments[0].delta, 2880);
    paid = JSON.parse(JSON.stringify(b.saver.serialize('compost-paid')));
  } finally { b.sim.dispose(); }
  const c = boot();
  try {
    assert.equal(c.saver.loadEnvelope(paid, 'compost-paid'), true);
    const credits = c.state.player.credits;
    c.feedIron(1);
    assert.equal(c.state.player.credits, credits);
    assert.equal(c.grants.filter(row => row.reason === 'understory_compost_run').length, 0);
    assert.equal(c.garden().data.compostRunComplete, true);
    assert.equal(c.state.player.cargo.items[IRON] || 0, 0);
  } finally { c.sim.dispose(); }
});
