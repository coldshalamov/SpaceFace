import test from 'node:test';
import assert from 'node:assert/strict';
import { contactHailAvailability, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';

function fixture() {
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 }, data: {} };
  const hull = { id: 2, type: 'ship', alive: true, team: 2, occupantGeneration: 4,
    pos: { x: 100, z: 0 }, data: { trafficRole: 'rescue', worldRecordId: 'lifter:a',
      rescueCustodyId: 'passenger:a', carryingSurvivor: true, callsign: 'LIFTER' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: 400, z: 0 }, data: { name: 'Ceres Dock' } };
  const row = { id: 'passenger:a', outcome: 'in_transit', carrierWorldRecordId: 'lifter:a',
    carrierEntityId: 2, carrierGeneration: 4, sectorId: 'ceres' };
  const rec = { id: 2, role: 'rescue', rescueCustodyId: row.id, carryingSurvivor: true, targetId: 3 };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { team: 1, targetId: 2, credits: 50 },
    ui: { docked: false }, world: { currentSectorId: 'ceres' },
    entities: new Map([[1, player], [2, hull], [3, station]]), entityList: [player, hull, station],
    traffic: { freighters: [rec] }, survivorPod: { causal: { receipts: [row] } } };
  const offer = createContactHailOffer(state, contactHailAvailability(state), 'test-rescue', 20);
  assert.equal(offer.kind, 'worker');
  assert.ok(offer.actions.some(a => a.id === 'status'));
  return { state, hull, row, station, rec, offer };
}
function status(f) { return createContactHailResponse(f.state, f.offer, 'status').lines.join(' '); }

test('ordinary rescue worker STATUS reads pending custody and live destination without mutation', () => {
  const f = fixture(); const before = structuredClone(f.state);
  assert.equal(status(f), 'STATUS · SURVIVOR ABOARD · DESTINATION CERES DOCK');
  assert.equal(status(f), 'STATUS · SURVIVOR ABOARD · DESTINATION CERES DOCK');
  assert.deepEqual(f.state, before);
  assert.doesNotMatch(status(f), /COMPLETE|RESCUED/);
});
for (const [name, change] of Object.entries({
  'copied passenger flags without receipt': f => { f.state.survivorPod.causal.receipts = []; },
  'missing durable identity': f => { delete f.hull.data.worldRecordId; },
  'wrong durable identity': f => { f.hull.data.worldRecordId = 'lifter:b'; },
  'recycled generation': f => { f.hull.occupantGeneration++; },
  'missing generation': f => { f.row.carrierGeneration = null; },
  'unreconciled entity': f => { f.row.carrierEntityId = 99; },
  'different sector': f => { f.row.sectorId = 'other'; },
  'duplicate receipt': f => { f.state.survivorPod.causal.receipts.push({ ...f.row }); },
  'delivered passenger': f => { f.row.outcome = 'rescued'; },
  'recovery pending': f => { f.row.outcome = 'recovery_pending'; },
  'dead carrier': f => { f.hull.alive = false; },
})) test(name + ' cannot claim a survivor aboard', () => {
  const f = fixture(); change(f); assert.doesNotMatch(status(f), /SURVIVOR ABOARD/);
});

test('missing or stale destination preserves passenger truth without inventing a berth', () => {
  const f = fixture(); f.station.alive = false;
  assert.equal(status(f), 'STATUS · SURVIVOR ABOARD · BERTH UNCONFIRMED');
  f.station.alive = true; f.rec.rescueCustodyId = 'other';
  assert.equal(status(f), 'STATUS · SURVIVOR ABOARD · BERTH UNCONFIRMED');
});

test('only canonical reconciliation permits a rematerialized carrier to report custody', () => {
  const f = fixture(); f.hull.occupantGeneration = 8;
  assert.doesNotMatch(status(f), /SURVIVOR ABOARD/);
  f.row.carrierGeneration = 8;
  assert.match(status(f), /SURVIVOR ABOARD/);
});

test('scanner request and STATUS choice expose the passenger, then reject recycled or delivered custody', async () => {
  const { scanner } = await import('../src/systems/scanner.js');
  for (const invalidate of [f => { f.hull.occupantGeneration++; }, f => { f.row.outcome = 'rescued'; }]) {
    const f = fixture(); const listeners = new Map(), events = [];
    const bus = { on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
      emit(name, payload) { events.push({ name, payload }); for (const fn of listeners.get(name) || []) fn(payload); } };
    const system = Object.create(scanner); system.init({ state: f.state, bus });
    bus.emit('contactHail:request', { targetId: f.hull.id, source: 'test' });
    const offer = events.find(e => e.name === 'contactHail:offer')?.payload;
    assert.equal(offer?.kind, 'worker');
    const choice = { requestId: offer.requestId, targetId: offer.targetId, choice: 'status' };
    bus.emit('contactHail:choice', choice);
    assert.match(events.find(e => e.name === 'contactHail:response').payload.lines.join(' '), /SURVIVOR ABOARD/);
    bus.emit('contactHail:request', { targetId: f.hull.id, source: 'test' });
    const next = events.filter(e => e.name === 'contactHail:offer').at(-1).payload;
    invalidate(f); const count = events.filter(e => e.name === 'contactHail:response').length;
    bus.emit('contactHail:choice', { requestId: next.requestId, targetId: next.targetId, choice: 'status' });
    assert.equal(events.filter(e => e.name === 'contactHail:response').length, count);
  }
});
