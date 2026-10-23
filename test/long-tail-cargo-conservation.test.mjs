import test from 'node:test';
import assert from 'node:assert/strict';
import encounter, { runtime } from '../src/data/encounters/350-the-long-tail.js';
import { spawnJettisonedCargoPod, lootShards } from '../src/systems/lootShards.js';
import { traffic } from '../src/systems/traffic.js';

const FUEL = 'cmdty_fuel_cells';
function harness(rng = 0.5) {
  const state = { simTime: 0, entities: new Map(), entityList: [], traffic: { entities: [] } };
  let id = 0, denied = false;
  const helpers = { spawnEntity(spec) {
    if (denied) return null;
    const e = { ...spec, id: ++id, alive: true };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const courier = helpers.spawnEntity({ type: 'ship', team: 2, factionId: 'faction_mts',
    pos: { x: 0, z: 0 }, radius: 10, hull: 100, data: {} });
  const raider = helpers.spawnEntity({ type: 'ship', pos: { x: -100, z: 0 }, data: { ai: {} } });
  const events = [], live = { id: 'finite_tail', shape: {}, ids: [courier.id, raider.id], roles: {},
    plan: { ships: [{ role: 'hauler', pos: { x: 0, z: 0 } }, { role: 'raider', pos: { x: -100, z: 0 } }] }, data: {} };
  const d = { now: () => state.simTime, stream: () => () => rng, spawnShips: () => live.ids,
    aliveCount: (_, role) => (role === 'hauler' ? courier : raider).alive === false ? 0 : 1,
    entsOf: (_, role) => { const e = role === 'hauler' ? courier : raider; return e.alive === false ? [] : [e]; },
    spawnCargoPod: (_, spec) => denied ? null : spawnJettisonedCargoPod(state, spec, helpers),
    say() {}, emit: (name, p) => events.push({ name, ...p }), player: () => null,
    resolve: (_, outcome) => { live.outcome = outcome; live.phase = 'done'; },
    grant: (qty) => events.push({ name: 'grant', qty }), rep: (_, qty) => events.push({ name: 'rep', qty }) };
  const context = Object.assign(Object.create(traffic), { state, helpers, bus: { emit: d.emit },
    _recordAnvilSpill() {} }); // unrelated Orchard bookkeeping, not cargo admission/debit
  const h = { state, helpers, courier, raider, live, d, events,
    deny: (v) => { denied = v; },
    fire: () => runtime.fire(d, live, state),
    tick: (t) => { state.simTime = t; runtime.tick(d, live, state, t); },
    physical: () => state.entityList.filter(e => e.type === 'payload')
      .reduce((n, e) => n + (e.data?.salvagePool?.[FUEL] || 0), 0),
    damage: () => context._spillHaulerCargoFromViolence(courier, raider),
    death: () => lootShards._trySpawnCivilianManifestPayload.call(
      { state, helpers, bus: { emit: d.emit } }, { id: courier.id, pos: courier.pos }, courier) };
  return h;
}
const held = h => h.courier.data.cargo[FUEL];
const manifest = h => h.courier.data.cargoManifest.lines
  .filter(l => l.commodityId === FUEL).reduce((n, l) => n + l.qty, 0);
const conserved = (h, initial) => {
  assert.equal(held(h), manifest(h));
  assert.equal(held(h) + h.physical(), initial);
};

for (const r of [0, 0.5, 0.999999]) test(`actual pod producer conserves original hold at rng ${r}`, () => {
  const h = harness(r), initial = 10 + Math.round(r * 6);
  h.fire(); conserved(h, initial);
  assert.equal(h.state.entityList.filter(e => e.type === 'payload').length, 5);
  for (let t = 2; t < 70; t += 4) { h.tick(t); conserved(h, initial); }
  const before = h.physical(); h.tick(75); assert.equal(h.physical(), before);
  assert.ok(h.events.filter(e => e.text?.startsWith('Last cell')).length <= 1);
});

test('spawn refusal leaves original stock and live shed budget available for retry', () => {
  const h = harness(); h.deny(true); h.fire(); assert.equal(held(h), 13); assert.equal(h.physical(), 0);
  h.tick(2); assert.equal(held(h), 13); assert.equal(h.live.data.tail.remaining, 9);
  h.deny(false); h.tick(6); conserved(h, 13); assert.equal(h.live.data.tail.remaining, 8);
});

test('stopped tender has no new tail; resuming motion sheds only remaining real cargo', () => {
  const h = harness(); h.fire(); h.courier.vel = { x: 0, z: 0 }; h.tick(2);
  assert.equal(h.physical(), 5); assert.equal(h.live.data.tail.remaining, 9);
  h.courier.vel.x = 7; h.tick(6); assert.equal(h.physical(), 6); conserved(h, 13);
});

test('partial violence before and after a live shed retains one ordinary death remainder', () => {
  for (const shedFirst of [false, true]) {
    const h = harness(); h.fire(); if (shedFirst) h.tick(2);
    assert.ok(h.damage()); conserved(h, 13);
    h.tick(6); conserved(h, 13);
    assert.equal(h.damage(), null, 'ordinary violence spill stays one-shot');
    const left = held(h); const corpse = h.death(); assert.equal(corpse.data.salvagePool[FUEL], left);
    assert.equal(h.physical(), 13); assert.equal(h.death(), null, 'death spill stays one-shot');
    h.courier.alive = false; h.tick(10); assert.equal(h.live.outcome, 'courier_down');
    h.tick(20); assert.equal(h.physical(), 13);
  }
});

test('death without prior damage exposes only unshed cells to ordinary salvage', () => {
  const h = harness(); h.fire(); h.tick(2); const left = held(h);
  assert.ok(left > 0); assert.equal(h.death().data.salvagePool[FUEL], left);
  assert.equal(h.physical(), 13);
});

test('empty tender produces neither later trail nor ordinary death freight', () => {
  const h = harness(0); h.fire(); assert.equal(held(h), 0); h.tick(2); h.tick(6);
  assert.equal(h.death(), null); assert.equal(h.physical(), 10);
  assert.equal(h.events.filter(e => e.text?.startsWith('Last cell')).length, 1);
});

test('changed and fractional hold bounds whole-cell output without rounding cargo up', () => {
  const h = harness(0.5); h.fire(); h.courier.data.cargo[FUEL] = 1.5;
  h.tick(2); assert.equal(held(h), 0.5); assert.equal(h.physical(), 6);
  h.tick(6); assert.equal(h.physical(), 6);
  assert.equal(h.events.filter(e => e.text?.startsWith('Last cell')).length, 0);
});

test('lower manifest and empty or malformed manifest cannot be replenished by stale mirror', () => {
  for (const lines of [[], [{ commodityId: FUEL, qty: 1 }], null]) {
    const h = harness(); h.fire(); h.courier.data.cargoManifest.lines = lines;
    h.courier.data.cargoManifest.totalQty = lines?.length ? 1 : 0;
    h.tick(2); assert.equal(h.physical(), lines?.length ? 6 : 5);
    h.tick(6); assert.equal(h.physical(), lines?.length ? 6 : 5);
  }
});

test('manifest identity and unrelated cargo survive successful original-fuel subtraction', () => {
  const h = harness(); h.fire(); const m = h.courier.data.cargoManifest;
  m.lines.push({ commodityId: 'cmdty_ore_iron', qty: 3, source: 'untouched' }); m.totalQty += 3;
  h.tick(2); const next = h.courier.data.cargoManifest;
  assert.equal(next.manifestId, m.manifestId); assert.equal(next.freighterKey, m.freighterKey);
  assert.deepEqual(next.lines.at(-1), m.lines.at(-1)); assert.equal(next.totalQty, held(h) + 3);
});

test('legacy live encounter without manifest keeps its finite flat hold, never recreates stock', () => {
  const h = harness(); h.fire(); delete h.courier.data.cargoManifest;
  h.courier.data.cargo[FUEL] = 1; h.tick(2); assert.equal(held(h), 0);
  h.tick(6); assert.equal(h.physical(), 6); assert.equal(h.courier.data.cargoManifest, undefined);
});

test('defense rewards and surviving cast remain authored; exit receipt does not invent depletion', () => {
  const h = harness(); h.fire(); h.raider.alive = false; h.tick(0);
  assert.equal(h.live.outcome, 'defended'); assert.equal(h.courier.alive, true);
  assert.equal(h.events.find(e => e.name === 'grant').qty, 220);
  assert.equal(h.events.find(e => e.name === 'rep').qty, 4);
  assert.doesNotMatch(encounter.receipts.courier_escaped, /last|empty|dry/);
  assert.doesNotMatch(encounter.aftermath.flee, /dry/);
  assert.doesNotMatch(encounter.receipts.defended, /ownerless/);
});

test('lingering zero-hull or already spilled tender cannot shed again', () => {
  for (const died of ['hull', 'manifestPayloadDropped']) {
    const h = harness(); h.fire(); const before = h.physical();
    if (died === 'hull') h.courier.hull = 0;
    else h.courier.data.manifestPayloadDropped = true;
    h.tick(2); assert.equal(h.physical(), before); assert.equal(h.live.outcome, 'courier_down');
  }
});
test('malformed unrelated rows and inconsistent totals fail closed without edits', () => {
  for (const qty of ['2', -1, Number.MAX_SAFE_INTEGER]) {
    const h = harness(); h.fire(); const m = h.courier.data.cargoManifest;
    m.lines.push({ commodityId: 'cmdty_ore_iron', qty }); m.totalQty += qty;
    const before = JSON.stringify(m); h.tick(2);
    assert.equal(h.physical(), 5); assert.equal(JSON.stringify(m), before);
  }
  const h = harness(); h.fire(); h.courier.data.cargoManifest.totalQty++;
  h.tick(2); assert.equal(h.physical(), 5);
});
test('a lower flat mirror cannot announce an empty manifested hold', () => {
  const h = harness(); h.fire(); h.courier.data.cargo[FUEL] = 1; h.tick(2);
  assert.equal(held(h), 0); assert.equal(manifest(h), 7);
  assert.equal(h.events.filter(e => e.text?.startsWith('Last cell')).length, 0);
});

test('missing or unsafe legacy cargo cannot shed', () => {
  for (const cargo of [undefined, { [FUEL]: Number.MAX_VALUE }]) {
    const h = harness(); h.fire(); h.courier.data.cargo = cargo;
    delete h.courier.data.cargoManifest; h.tick(2); assert.equal(h.physical(), 5);
  }
});
