// INF-076 kept an escaped Orra hull live instead of despawning it where the escape was confirmed,
// but gave it no after-life: the encounter closed, nemesis shaping stopped, and the stock attack
// run (forcePlayerTarget) turned the captain back to shadow the player with its weapons denied.
// Nothing retired it, so the next return in the same sector spawned a second Orra beside it, and
// killing it was ignored — she came back anyway. These pin the departure lifecycle: the hull keeps
// leaving, retires out of radar reach, never coexists with a returning wing, and a captain run
// down before she clears the area ends the arc for good.
import assert from 'node:assert/strict';
import test from 'node:test';

import { boot } from '../scripts/nemesis/harness.mjs';
import { shapeNemesisManeuverRequest, nemesisFireAllowed } from '../src/ai/nemesisTactics.js';
import { createNemesisEncounterHost } from '../src/nemesis/encounterHost.js';

const events = (t, name) => t.rows.filter((row) => row.event === name);

function escaped() {
  const t = boot(); t.start();
  const bossId = t.state.nemesis.active.bossId;
  t.escape(); t.tick();
  return { t, bossId, boss: t.state.entities.get(bossId) };
}

function stockAttackRun(entityId) {
  return { entityId, tick: 0, kind: 'intercept', forceLocal: { forward: 1, right: 0 },
    torqueYaw: 0, targetHeading: 0, brake: false, boost: false, reason: 'stock_attack_run' };
}

test('the escaped captain keeps its egress after the encounter closes, weapons cold', () => {
  const { t, bossId, boss } = escaped();
  assert.equal(t.state.nemesis.active, null);
  assert.deepEqual(t.state.nemesisDeployment.departures.map((row) => row.id), [bossId]);
  boss.rot = Math.PI; // facing back toward the player, as the stock attack run would turn it
  const frame = { contacts: [{ id: t.state.playerId, visible: true, valid: true, alive: true,
    confidence: 1, pos: { ...t.player.pos }, vel: { x: 0, z: 0 } }] };
  const out = shapeNemesisManeuverRequest(stockAttackRun(bossId), t.state, frame);
  assert.equal(out.kind, 'retreat');
  assert.equal(out.reason, 'nemesis:learn_and_leave');
  // Away from the player (+x), not back along the attack run.
  assert.ok(Math.abs(out.targetHeading) < 1e-9, `heading ${out.targetHeading}`);
  assert.equal(nemesisFireAllowed(boss, t.state), false);
});

test('an untagged or non-departing hull is not shaped by the departure', () => {
  const { t, bossId } = escaped();
  t.state.nemesisDeployment.departures = [];
  const request = stockAttackRun(bossId);
  assert.equal(shapeNemesisManeuverRequest(request, t.state, null), request);
});

test('the flown hull retires once it clears the player radar, honoring an upgraded scope', () => {
  const { t, bossId, boss } = escaped();
  t.player.data.derived = { radarRange: 6000 };
  boss.pos = { x: t.player.pos.x + 4500, z: t.player.pos.z }; t.advance(0.5);
  assert.ok(t.state.entities.has(bossId), 'still on the upgraded scope: no blink-off');
  boss.pos = { x: t.player.pos.x + 6500, z: t.player.pos.z }; t.advance(0.5);
  assert.equal(t.state.entities.has(bossId), false);
  assert.equal(t.state.nemesisDeployment.departures.length, 0);
  assert.equal(events(t, 'nemesis:resolved').length, 0, 'retiring is not a defeat');
});

test('a hull loitering past escape range retires after the bounded wait; a chased one does not', () => {
  const { t, bossId, boss } = escaped();
  boss.pos = { x: t.player.pos.x + 1000, z: t.player.pos.z }; // the player closed the gap
  t.advance(70);
  assert.ok(t.state.entities.has(bossId), 'inside escape range it stays catchable');
  boss.pos = { x: t.player.pos.x + 2000, z: t.player.pos.z };
  t.advance(0.5);
  assert.equal(t.state.entities.has(bossId), false);
});

test('a returning wing never shares the sector with the captain still flying out', () => {
  const { t, bossId, boss } = escaped();
  boss.pos = { x: t.player.pos.x + 1000, z: t.player.pos.z };
  const until = t.state.nemesis.nextContactAt + 30;
  while (t.state.simTime < until) {
    boss.pos = { x: t.player.pos.x + 1000, z: t.player.pos.z };
    t.tick();
  }
  assert.ok(events(t, 'nemesis:encounterRejected').some((row) => row.payload.reason === 'previous crew has not retired'));
  assert.equal(t.state.nemesis.active, null);
  // Once the chase breaks past escape range the new wing may arrive, and the old hull goes with it.
  boss.pos = { x: t.player.pos.x + 2500, z: t.player.pos.z };
  t.start();
  assert.equal(t.state.entities.has(bossId), false);
  const orras = [...t.state.entities.values()].filter((e) => e.data && e.data.nemesis && e.data.nemesis.role === 'boss');
  assert.equal(orras.length, 1);
});

test('running the captain down before she clears the area ends the arc for good', () => {
  const { t, bossId } = escaped();
  const later = t.state.nemesis.nextContactAt;
  t.kill('gun', bossId);
  t.bus.emit('combat:kill', { id: bossId, killerId: t.state.playerId, type: 'ship' });
  assert.equal(t.state.nemesis.ending, 'destroyed');
  const resolved = events(t, 'nemesis:resolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.ending, 'destroyed');
  assert.equal(resolved[0].payload.bossId, bossId);
  assert.equal(events(t, 'namedAce:defeated').length, 1);
  const announced = events(t, 'nemesis:announced').length;
  t.state.entities.delete(bossId);
  t.advance(Math.max(0, later - t.state.simTime) + 60);
  assert.equal(events(t, 'nemesis:announced').length, announced, 'no resurrection on the next return');
  assert.equal(t.state.nemesisDeployment.departures.length, 0);
});

test('a third-party kill while leaving is terminal but not the player victory', () => {
  const { t, bossId } = escaped();
  t.kill('gun', bossId, { killerId: 999 });
  assert.equal(t.state.nemesis.ending, 'lost');
  assert.equal(events(t, 'nemesis:resolved')[0].payload.ending, 'lost');
});

test('an ordinary kill with no departure in flight does not touch the arc', () => {
  const { t, bossId } = escaped();
  t.kill('gun', 777);
  assert.equal(t.state.nemesis.ending, null);
  assert.ok(t.state.entities.has(bossId));
});

test('a recycled id is dropped from the departure ledger, never removed', () => {
  const { t, bossId, boss } = escaped();
  boss.data = { name: 'someone else' };
  boss.pos = { x: t.player.pos.x + 9000, z: t.player.pos.z };
  t.advance(0.5);
  assert.ok(t.state.entities.has(bossId), 'the new occupant is not the departing captain');
  assert.equal(t.state.nemesisDeployment.departures.length, 0);
  t.kill('gun', bossId);
  assert.equal(t.state.nemesis.ending, null);
});

test('departure rows survive a save round-trip, bounded and whitelisted', () => {
  const { t, bossId } = escaped();
  const saved = JSON.parse(JSON.stringify(t.host.serialize()));
  saved.departures.push({ id: 'not-an-entity-id', requestId: 5 }, null,
    { id: 41, requestId: 'x', since: -9, extra: true }, { id: 42, requestId: 'y' }, { id: 43, requestId: 'z' });
  const host = createNemesisEncounterHost({});
  const state = { simTime: 0, entities: new Map(), nemesisDeployment: saved };
  host.init({ state, bus: { on: () => () => {} }, helpers: {} });
  const rows = state.nemesisDeployment.departures;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, bossId);
  assert.deepEqual(rows[1], { id: 41, requestId: 'x', since: 0 });
});
