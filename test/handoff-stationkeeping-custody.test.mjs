import test from 'node:test';
import assert from 'node:assert/strict';
import encounter, { runtime } from '../src/data/encounters/357-the-handoff.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { authoredPayloadFileForEntity, authoredPayloadSlotForEntity } from '../src/render/partsLibrary.js';

function harness() {
  const state = { mode: 'flight', input: {}, simTime: 0, entities: new Map(), entityList: [] };
  let id = 0, present = true;
  const helpers = { spawnEntity(spec) {
    const e = { ...spec, id: ++id, alive: true };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const seller = helpers.spawnEntity({ type: 'ship', hull: 100, pos: { x: 32, z: 0 }, data: {} });
  const buyer = helpers.spawnEntity({ type: 'ship', hull: 100, pos: { x: -32, z: 0 }, data: {} });
  const player = helpers.spawnEntity({ type: 'ship', hull: 100, pos: { x: 132, z: 0 }, vel: { x: 0, z: 0 }, flags: {}, data: {} });
  state.playerId = player.id;
  const events = [], pods = [], live = { id: 'deliberate_handoff', shape: {}, ids: [seller.id, buyer.id], roles: {}, data: {},
    plan: { zoneCenter: { x: 0, z: 0 }, ships: [{ role: 'hauler', pos: { x: 0, z: 0 } }, { role: 'raider', pos: { x: 0, z: 0 } }] } };
  const d = { now: () => state.simTime, stream: () => () => 0.5,
    spawnShips: () => live.ids, aliveCount: () => 1,
    entsOf: (_, role) => [role === 'hauler' ? seller : buyer],
    spawnCargoPod: (_, spec) => { const p = spawnJettisonedCargoPod(state, spec, helpers); pods.push(p); return p; },
    say() {}, emit: (name, p) => events.push({ name, ...p }),
    rep: (faction, delta) => events.push({ name: 'rep', faction, delta }),
    grant: (amount, reason) => events.push({ name: 'grant', amount, reason }),
    player: () => present ? player : null,
    resolve: (_, outcome, opts) => { live.outcome = outcome; live.phase = 'done'; events.push({ name: 'resolve', outcome, ...opts }); } };
  runtime.fire(d, live, state);
  return { state, seller, buyer, player, live, events, pods, d,
    present: v => { present = v; },
    tick(t, integrate = false) {
      const dt = t - state.simTime;
      if (integrate) for (const e of state.entityList) if (e.pos && e.vel) {
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      }
      state.simTime = t; runtime.tick(d, live, state, t);
    },
    hit: (targetId = seller.id) => runtime.event(d, live, state, 'playerHitSquad', { targetId }),
  };
}
const rewards = h => h.events.filter(e => e.name === 'grant' || e.name === 'rep');
const bonded = h => h.pods.filter(p => p.data.ownerId === h.player.id);
function noBond(h) { assert.equal(bonded(h).length, 0); assert.equal(rewards(h).length, 0); }
function accepted(h) {
  assert.equal(h.live.outcome, 'contact_made'); assert.equal(bonded(h).length, 1);
  const pod = bonded(h)[0]; assert.equal(pod.data.amount, 2);
  assert.equal(pod.data.bondedBy, h.live.id); assert.equal(h.live.data.custodyCommit.podId, pod.id);
  assert.equal(h.live.data.pods.includes(pod.id), false);
  assert.equal(h.pods.length, 4, 'no substitute cargo is minted');
  assert.deepEqual(rewards(h), [{ name: 'rep', faction: 'faction_quiet', delta: 2 },
    { name: 'grant', amount: 60, reason: 'handoff:quiet_lay' }]);
}

test('ordinary 60 WU/s fly-through neither bonds original contraband nor pays for transit', () => {
  const h = harness(); h.player.pos.x = h.seller.pos.x - 200; h.player.vel.x = 60;
  h.tick(0); for (let t = 1; t <= 6; t++) h.tick(t, true);
  assert.equal(h.player.pos.x - h.seller.pos.x, 160); noBond(h);
  assert.notEqual(h.live.outcome, 'contact_made'); assert.equal(h.live.data.delivered, 2);
  assert.equal(h.events.filter(e => e.text?.startsWith('Passing through')).length, 1);
  for (let t = 7; t <= 12; t++) h.tick(t, true);
  assert.equal(h.live.outcome, 'deal_done'); assert.equal(h.live.data.delivered, 4); noBond(h);
  assert.ok(h.pods.every(p => p.data.ownerId === h.buyer.id));
});

test('braking into a genuine six-second hold cuts exactly one original pod and pays once', () => {
  const h = harness(); h.player.vel.x = 30; h.tick(0); h.tick(1); noBond(h);
  h.player.vel.x = 0; h.tick(2); for (let t = 3; t < 8; t++) { h.tick(t); noBond(h); }
  h.tick(8); accepted(h); const id = bonded(h)[0].id;
  h.tick(9); h.hit(); h.tick(15); accepted(h); assert.equal(bonded(h)[0].id, id);
});

test('stationkeeping is relative to seller, not absolute world speed', () => {
  const h = harness(); h.seller.vel.z = h.buyer.vel.z = h.player.vel.z = 40;
  for (const pod of h.pods) pod.vel.z = 40; // translate the same physical scene together
  h.tick(0); for (let t = 1; t <= 6; t++) h.tick(t, true);
  accepted(h); assert.equal(h.player.pos.x - h.seller.pos.x, 100);
});

test('slow relative creep fits the authored crawl tolerance without requiring exact zero', () => {
  const h = harness(); h.player.vel.x = 3.2; h.tick(0);
  for (let t = 1; t <= 6; t++) h.tick(t, true); accepted(h);
});

for (const interruption of ['acceleration', 'outside', 'missing', 'dead', 'docked', 'disabled', 'mode', 'fire', 'hit']) {
  test(`${interruption} interrupts continuous dwell without changing pod ownership`, () => {
    const h = harness(); h.tick(0); h.tick(1); h.tick(2);
    if (interruption === 'acceleration') h.player.vel.x = 30;
    if (interruption === 'outside') h.player.pos.x += 1000;
    if (interruption === 'missing') h.present(false);
    if (interruption === 'dead') h.player.hull = 0;
    if (interruption === 'docked') h.player.flags.docked = true;
    if (interruption === 'disabled') h.player.disabled = true;
    if (interruption === 'mode') h.state.mode = 'station';
    if (interruption === 'fire') h.state.input.fire = true;
    if (interruption === 'hit') h.hit(); else h.tick(3);
    assert.equal(h.live.data.parleySince, null); noBond(h);
    h.player.vel.x = 0; h.player.pos.x = h.seller.pos.x + 100; h.present(true);
    h.player.hull = 100; h.player.flags.docked = false; h.player.disabled = false;
    h.state.mode = 'flight'; h.state.input.fire = false;
    for (let t = 4; t < 10; t++) { h.tick(t); noBond(h); }
    h.tick(10); accepted(h);
  });
}

test('unknown velocity cannot authorize a hold; restoring observation begins a fresh dwell', () => {
  const h = harness(); h.tick(0); h.tick(1); delete h.player.vel; h.tick(2); noBond(h);
  assert.equal(h.live.data.parleySince, null); h.player.vel = { x: 0, z: 0 };
  for (let t = 3; t <= 8; t++) { h.tick(t); noBond(h); }
  h.tick(9); accepted(h);
});

test('zero-hull counterpart with a lingering alive flag cannot sign a new bond', () => {
  for (const role of ['seller', 'buyer']) {
    const h = harness(); h.tick(0); h.tick(1); h[role].hull = 0; h.tick(2);
    assert.equal(h.live.outcome, 'deal_burned'); noBond(h); assert.equal(h.pods.length, 4);
  }
});

test('normal coarse director cadence admits six seconds; paused time cannot advance it', () => {
  const h = harness(); h.tick(0); for (let i = 0; i < 30; i++) h.tick(0);
  noBond(h); h.tick(1.5); h.tick(3); h.tick(4.5); noBond(h); h.tick(6); accepted(h);
});

test('a missing observation interval is not retroactive stationkeeping', () => {
  const h = harness(); h.tick(0); h.tick(1); h.tick(2); h.tick(10); noBond(h);
  assert.equal(h.live.data.parleySince, 10);
  for (let t = 11; t < 16; t++) { h.tick(t); noBond(h); } h.tick(16); accepted(h);
});

test('an expired incomplete deal releases original bodies without signing or claiming delivery', () => {
  const h = harness(); h.live.deadlineAt = 6; h.tick(0);
  for (let t = 1; t <= 6; t++) h.tick(t);
  assert.equal(h.live.outcome, 'deal_lapsed'); assert.equal(h.live.data.delivered, 0); noBond(h);
  assert.ok(h.pods.every(p => p.alive && p.data.ownerId === h.seller.id));
  assert.ok(h.seller.data.ai.forceFlee && h.buyer.data.ai.forceFlee);
  assert.ok(encounter.receipts.deal_lapsed.includes('Unreceived pods'));
});

test('actual autonomous buyer completion takes priority at the deadline', () => {
  const h = harness(); h.live.deadlineAt = 6; h.tick(0);
  for (const p of h.pods) p.pos = { ...h.buyer.pos };
  h.tick(6); assert.equal(h.live.outcome, 'deal_done'); assert.equal(h.live.data.delivered, 4); noBond(h);
});

test('pending warm declares the actual handoff pod render body and slot', () => {
  const h = harness();
  assert.equal(h.pods.length, 4);
  for (const pod of h.pods) {
    const file = authoredPayloadFileForEntity(pod);
    assert.equal(file, 'places/place_cargo_pod_standard.glb');
    assert.equal(authoredPayloadSlotForEntity(pod), 'place');
    assert.ok(encounter.warmAssets.includes(file), `missing pending decode for ${file}`);
  }
});
