// M10 False bloom: a derelict drift is shut on a "bloom" report; the player can prove the report is
// a planted lamp by careful scanning or by dragging the clamped emitter clear; proof draws the
// people who planted it; surviving them while the hand files pays; smashing the emitter destroys
// the proof.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { ensurePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';

const SEED = 4242;
const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: 9000, z: 9000 });
const SHAPE = 'false_bloom';

function makeHarness(seed = SEED) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x + 700, z: ANCHOR.z + 500 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'repDelta', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_false_bloom', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'derelict_field', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the encounter is live');
  return live;
}

const bloomOf = (live) => live.data.bloom;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
let pulseSeq = 0;
const scanAt = (h, pos, over = {}) => h.bus.emit('scan:pulse', {
  pos: { ...pos }, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: ++pulseSeq, ...over,
});
const jumpersOf = (h, live) => live.ids.map((id) => ent(h, id)).filter((e) => e && e.data?.ai?.encounterRole === 'jumper');

function dragEmitterTo(h, b, wu) {
  const e = ent(h, b.emitterId);
  const dx = e.pos.x - b.hulkPos.x, dz = e.pos.z - b.hulkPos.z;
  const len = Math.hypot(dx, dz) || 1;
  e.pos.x = b.hulkPos.x + (dx / len) * wu;
  e.pos.z = b.hulkPos.z + (dz / len) * wu;
}

function scanBothThenEmitter(h, live) {
  const b = bloomOf(live);
  scanAt(h, { x: b.hulkPos.x + 40, z: b.hulkPos.z + 40 });
  scanAt(h, { x: b.referencePos.x + 40, z: b.referencePos.z + 40 });
  scanAt(h, ent(h, b.emitterId).pos);
}

test('false_bloom is a registered derelict-field civilian minor with the settled trigger', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'the shape is in the shipped catalog');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['derelict_field']);
  assert.equal(enc.script, 'selfRegistered');
  assert.deepEqual([...enc.verbs], ['scan', 'latch', 'tow']);
  assert.equal(enc.cooldownS, 1200);
});

test('fire casts the quarantined hulk, the clean reference, a light towable emitter and the hand', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  const hulk = ent(h, b.hulkId);
  const reference = ent(h, b.referenceId);
  const emitter = ent(h, b.emitterId);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e && e.data?.ai?.encounterRole === 'hand');
  assert.equal(hulk.data.scanLabel, 'QUARANTINED HULK — BLOOM REPORTED');
  assert.equal(hulk.data.storyPropKind, 'false_bloom_hulk');
  assert.equal(reference.data.scanLabel, 'REFERENCE HULK — SAME LANE, SAME WEEK');
  assert.equal(emitter.data.scanLabel, 'CLAMPED EMITTER');
  assert.equal(emitter.data.storyPropKind, 'false_bloom_emitter');
  assert.equal(hand.data.scanLabel, 'SALVAGE HAND — SUSPECTS A LAMP');
  assert.equal(hand.factionId, 'faction_free');
  assert.equal(hand.data.ai.passive, true, 'the hand is a passive civilian');
  assert.ok(Object.keys(hulk.data.salvagePool).length > Object.keys(reference.data.salvagePool).length,
    'the quarantined hulk carries the richer pool');
  const sep = Math.hypot(hulk.pos.x - reference.pos.x, hulk.pos.z - reference.pos.z);
  assert.ok(Math.abs(sep - 260) < 1, `the reference hulk is ~260 WU away (${sep.toFixed(1)})`);
  const touch = Math.hypot(hulk.pos.x - emitter.pos.x, hulk.pos.z - emitter.pos.z);
  assert.ok(touch >= 18 && touch < 30, `the emitter is clamped beside the hulk, clear of its capsule (${touch.toFixed(1)})`);
  assert.ok(said(h)[0].startsWith('SALVAGE HAND: Traffic shut this drift on a bloom report.'), 'the primary line fires');
  assert.equal(live.deadlineAt - h.state.simTime, 240, 'deadline is 240 s');
});

test('the emitter is a light, dynamic body the Massline offers and cannot be vacuumed into the hold', () => {
  const h = makeHarness();
  const live = fire(h);
  const emitter = ent(h, bloomOf(live).emitterId);
  const hulk = ent(h, bloomOf(live).hulkId);
  ensurePhysicsBodySpec(emitter);
  assert.equal(isDynamicPhysicsBodyEntity(emitter), true, 'the emitter moves when pulled');
  assert.ok(emitter.physicsBody.mass <= 10, `the emitter is light (mass ${emitter.physicsBody.mass})`);
  assert.equal(isAttachable(emitter, h.player.id, h.state), true, 'the Massline offers the emitter');
  assert.notEqual(emitter.type, 'pickup', 'it is not a collectable pickup');
  assert.notEqual(emitter.type, 'wreck', 'it is not a salvage wreck the beam can drain');
  assert.ok(hulk.physicsBody.mass >= 1e5, 'the hulk is the anchor it is clamped to');
});

test('comparison proof: scan the hulk, the reference, then the emitter up close — claim-jumpers arrive once', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  const emitterPos = ent(h, b.emitterId).pos;

  scanAt(h, emitterPos);
  assert.equal(b.proof, null, 'the emitter scan alone proves nothing without both baselines');
  assert.equal(b.evidence.hulk, true, 'a close scan still credits the quarantined hulk');
  scanAt(h, { x: b.referencePos.x + 40, z: b.referencePos.z });
  assert.equal(b.evidence.reference, true, 'scanning the clean hulk records the reference');
  assert.equal(b.proof, null, 'two baselines are not yet the comparison');
  scanAt(h, emitterPos);
  assert.equal(b.proof, 'comparison', 'the close scan after both baselines proves the spoof');
  assert.ok(said(h).some((t) => t.includes("the emitter's carrier IS the bloom")), 'the finding is spoken');

  const jumpers = jumpersOf(h, live);
  assert.equal(jumpers.length, 2, 'two claim-jumpers arrive');
  for (const j of jumpers) {
    assert.equal(j.factionId, 'faction_reach');
    assert.equal(j.data.ai.passive, false, 'they come hostile');
    const range = Math.hypot(j.pos.x - b.hulkPos.x, j.pos.z - b.hulkPos.z);
    assert.ok(range > 590 && range < 1040, `they come from the SITE, 600-700 WU out and the second hull a beat behind (${range.toFixed(0)})`);
  }
  assert.ok(said(h).includes("CLAIM-JUMPER: That lamp's ours, scrapper. Put it down."));
  assert.ok(said(h).includes('SALVAGE HAND: Filing it now — keep them off me!'));

  scanBothThenEmitter(h, live);
  scanAt(h, emitterPos);
  assert.equal(jumpersOf(h, live).length, 2, 'repeated scans never spawn a second wave');
});

test('motion proof: towing the emitter 180 WU clear shows the bloom moving with it', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  h.bus.emit('tether:attached', { actorId: h.player.id, targetId: b.emitterId });
  assert.ok(said(h).some((t) => t.includes("drag it clear")), 'latching the emitter earns the hand\'s hint');
  h.bus.emit('tether:attached', { actorId: h.player.id, targetId: b.emitterId });
  assert.equal(said(h).filter((t) => t.includes('drag it clear')).length, 1, 'the hint is said once');

  dragEmitterTo(h, b, 120);
  h.sim.runTicks(30);
  assert.equal(b.proof, null, 'a short drag is not yet proof');
  dragEmitterTo(h, b, 185);
  h.sim.runTicks(40);
  assert.equal(b.proof, 'motion', 'the emitter 180+ WU from the hulk proves the bloom rides with it');
  assert.equal(jumpersOf(h, live).length, 2, 'proof draws the claim-jumpers');
  assert.ok(said(h).some((t) => t.includes('the bloom moved with the emitter')));
});

test('filed pays 520 with both scans and exactly once even when events repeat', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanBothThenEmitter(h, live);
  assert.equal(b.proof, 'comparison');
  for (const j of jumpersOf(h, live)) j.alive = false;
  h.sim.runTicks(40);
  assert.deepEqual(resolved(h), ['filed'], 'settles filed');
  assert.deepEqual(grants(h), [520], '380 base plus the 140 two-scan bonus');
  assert.ok(h.events.some((e) => e.name === 'repDelta' && e.payload.factionId === 'faction_free' && e.payload.delta === 5));
  scanBothThenEmitter(h, live);
  h.bus.emit('tether:attached', { actorId: h.player.id, targetId: b.emitterId });
  h.sim.runTicks(120);
  assert.deepEqual(grants(h), [520], 'repeated events never pay twice');
  assert.deepEqual(resolved(h), ['filed']);
  assert.ok(ent(h, b.hulkId) && ent(h, b.referenceId), 'both hulks stay in the world as salvage');
});

test('filed pays 380 when the spoof was proved by motion alone', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  dragEmitterTo(h, b, 200);
  h.sim.runTicks(40);
  assert.equal(b.proof, 'motion');
  for (const j of jumpersOf(h, live)) j.alive = false;
  h.sim.runTicks(40);
  assert.deepEqual(grants(h), [380]);
  assert.deepEqual(resolved(h), ['filed']);
});

test('filed also lands after surviving the claim-jumpers for 45 s, and living jumpers stay hostile', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanBothThenEmitter(h, live);
  const jumpers = jumpersOf(h, live);
  for (const j of jumpers) {
    j.pos.x = h.player.pos.x + 200; j.pos.z = h.player.pos.z;
  }
  h.sim.runTicks(60);
  assert.deepEqual(resolved(h), [], 'not filed while the jumpers are still on the hand');
  h.sim.runTicks(60 * 46);
  assert.deepEqual(resolved(h), ['filed'], 'a survived 45 s files the finding');
  assert.deepEqual(grants(h), [520]);
  const survivors = jumpers.filter((j) => j.alive !== false);
  assert.ok(survivors.length > 0, 'at least one jumper is still flying');
  for (const j of survivors) assert.equal(j.data.despawnAt, undefined, 'living jumpers are not despawned on the spot');
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e && e.data?.ai?.encounterRole === 'hand');
  assert.ok(hand && hand.data.despawnAt > h.state.simTime, 'the hand stands down after a short delay');
});

test('smashed before proof pays nothing and says the proof is slag', () => {
  const h = makeHarness();
  const live = fire(h);
  ent(h, bloomOf(live).emitterId).alive = false;
  h.sim.runTicks(40);
  assert.deepEqual(resolved(h), ['smashed']);
  assert.deepEqual(grants(h), []);
  assert.equal(h.state.encounterDirector.receipts.at(-1).text, "The emitter's slag — and so is the proof. Traffic keeps the drift closed.");
});

test('client_lost: the hand dies before filing and nothing is paid', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanBothThenEmitter(h, live);
  live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand').alive = false;
  h.sim.runTicks(40);
  assert.deepEqual(resolved(h), ['client_lost']);
  assert.deepEqual(grants(h), []);
  assert.equal(b.settled, true);
});

test('lapsed: the deadline passes with no proof and nothing is paid', () => {
  const h = makeHarness();
  fire(h);
  h.sim.runTicks(60 * 245);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.deepEqual(grants(h), []);
  assert.equal(h.state.encounterDirector.receipts.at(-1).text, 'Traffic keeps the drift closed. The emitter keeps lying.');
});

test('a scan that is not near either hulk or the emitter proves nothing', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanAt(h, { x: b.hulkPos.x + 600, z: b.hulkPos.z + 600 });
  assert.equal(b.evidence.hulk, false);
  assert.equal(b.evidence.reference, false);
  assert.equal(b.proof, null);
});

test('same seed twice gives the same cast positions and the same outcome', () => {
  const run = () => {
    const h = makeHarness();
    const live = fire(h);
    const b = bloomOf(live);
    const cast = [b.hulkId, b.referenceId, b.emitterId].map((id) => {
      const e = ent(h, id);
      return [e.pos.x, e.pos.z];
    });
    scanBothThenEmitter(h, live);
    const jumpers = jumpersOf(h, live).map((j) => [j.pos.x, j.pos.z]);
    for (const j of jumpersOf(h, live)) j.alive = false;
    h.sim.runTicks(40);
    return JSON.stringify({ cast, jumpers, resolved: resolved(h), grants: grants(h) });
  };
  const a = run();
  assert.equal(a, run(), 'the scene is deterministic');
  assert.ok(JSON.parse(a).resolved.includes('filed'));
});

test('the claim-jumpers are hostile to the hand and to the player under the real hostility function', () => {
  const h = makeHarness();
  const live = fire(h);
  scanBothThenEmitter(h, live);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand');
  const jumpers = jumpersOf(h, live);
  assert.equal(jumpers.length, 2);
  const [lead, second] = jumpers;
  assert.equal(isHostileForAI(h.state, lead, hand), true, 'the lead jumper goes for the hand');
  assert.equal(lead.data.ai.retaliationTargetId, hand.id);
  assert.equal(isHostileForAI(h.state, second, hand), false, 'the second jumper has no job on the hand');
  assert.equal(second.data.ai.retaliationTargetId, h.player.id, 'it hunts the player');
  for (const j of jumpers) assert.equal(isHostileForAI(h.state, j, h.player), true, 'both are hostile to the player');
  assert.equal(isHostileForAI(h.state, hand, h.player), false, 'the hand stays a bystander to the player');
});

test('the claim-jumpers spawn near the site, not on the player', () => {
  const h = makeHarness();
  h.player.pos.x = ANCHOR.x + 2500;
  const live = fire(h);
  const b = bloomOf(live);
  scanBothThenEmitter(h, live);
  for (const j of jumpersOf(h, live)) {
    const fromSite = Math.hypot(j.pos.x - b.hulkPos.x, j.pos.z - b.hulkPos.z);
    const fromPlayer = Math.hypot(j.pos.x - h.player.pos.x, j.pos.z - h.player.pos.z);
    assert.ok(fromSite > 590 && fromSite < 1040, `out from the site (${fromSite.toFixed(0)})`);
    assert.ok(fromPlayer !== fromSite, 'not tied to the player position');
  }
});

test('abandoning the hand lets the jumpers kill it: client_lost is a real way to fail', () => {
  const h = makeHarness();
  const live = fire(h);
  scanBothThenEmitter(h, live);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand');
  const jumper = jumpersOf(h, live)[0];
  assert.equal(isHostileForAI(h.state, jumper, hand), true, 'the jumpers can attack the hand');
  hand.alive = false;
  h.sim.runTicks(40);
  assert.deepEqual(resolved(h), ['client_lost']);
  assert.deepEqual(grants(h), []);
});

test('budget-denied jumpers never pay for free: the hand files only after retries and a 30 s hold', () => {
  const h = makeHarness();
  const live = fire(h);
  const budget = h.sim.registry.get('encounterDirector').helpers.spawnBudget;
  assert.ok(budget && typeof budget.request === 'function', 'the spawn budget is the director\'s helper');
  budget.request = () => 0;
  scanBothThenEmitter(h, live);
  const b = bloomOf(live);
  assert.equal(b.proof, 'comparison');
  assert.equal(jumpersOf(h, live).length, 0, 'the budget granted nothing');
  assert.equal(b.jumpersSpawned, 0);
  h.sim.runTicks(60 * 10);
  assert.deepEqual(resolved(h), [], 'no free payout while retrying');
  assert.ok(b.jumperAttempts > 3, `it keeps retrying (${b.jumperAttempts} attempts)`);
  h.sim.runTicks(60 * 25);
  assert.deepEqual(resolved(h), [], 'the 30 s undisturbed hold has not elapsed');
  h.sim.runTicks(60 * 20);
  assert.deepEqual(resolved(h), ['filed'], 'filed only after retries gave up and the hold ran');
  assert.deepEqual(grants(h), [520]);
});

test('a budget that frees up mid-retry still brings the jumpers', () => {
  const h = makeHarness();
  const live = fire(h);
  const budget = h.sim.registry.get('encounterDirector').helpers.spawnBudget;
  const real = budget.request;
  budget.request = () => 0;
  scanBothThenEmitter(h, live);
  h.sim.runTicks(60 * 5);
  assert.equal(jumpersOf(h, live).length, 0);
  budget.request = real;
  h.sim.runTicks(60 * 4);
  assert.equal(jumpersOf(h, live).length, 2, 'the retry spawns them once the budget frees');
  assert.deepEqual(resolved(h), [], 'and nothing pays until they are dealt with');
});

test('jumpers that never come within 380 WU of anyone settle filed after the stuck-safety, not before', () => {
  const h = makeHarness();
  const live = fire(h);
  scanBothThenEmitter(h, live);
  for (const j of jumpersOf(h, live)) { j.vel = { x: 0, z: 0 }; }
  h.sim.runTicks(60 * 100);
  assert.deepEqual(resolved(h), [], 'no 120 s fallback pays early');
  h.sim.runTicks(60 * 60);
  assert.deepEqual(resolved(h), ['filed']);
});

test('a scan pulse that is not the player\'s is ignored', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanAt(h, { x: b.hulkPos.x + 40, z: b.hulkPos.z }, { source: 'npc-scanner' });
  scanAt(h, { x: b.hulkPos.x + 40, z: b.hulkPos.z }, { scannerId: 9999 });
  assert.equal(b.evidence.hulk, false, 'foreign pulses credit nothing');
  scanAt(h, { x: b.hulkPos.x + 40, z: b.hulkPos.z });
  assert.equal(b.evidence.hulk, true, 'the player\'s own pulse does');
});

test('a pulse delivered twice with the same seq counts once', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  const pos = { x: b.hulkPos.x + 40, z: b.hulkPos.z };
  h.bus.emit('scan:pulse', { pos, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: 500 });
  assert.equal(b.evidence.hulk, true);
  assert.equal(b.lastPulseSeq, 500);
  const refPos = { x: b.referencePos.x + 40, z: b.referencePos.z };
  h.bus.emit('scan:pulse', { pos: refPos, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: 500 });
  assert.equal(b.evidence.reference, false, 'a replayed seq is dropped');
  h.bus.emit('scan:pulse', { pos: refPos, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: 501 });
  assert.equal(b.evidence.reference, true);
});

test('placement avoids a wreck or a station standing where the site would go', () => {
  const blocked = (kind) => {
    const h = makeHarness();
    const blocker = h.sim.spawn(kind === 'station'
      ? { type: 'station', team: 0, pos: { ...ANCHOR }, radius: 120, hull: 1000, hullMax: 1000 }
      : { type: 'wreck', team: 0, pos: { ...ANCHOR }, radius: 60, hull: 1, hullMax: 1 });
    const live = fire(h);
    const b = bloomOf(live);
    const pts = [b.hulkPos, b.referencePos, ent(h, b.emitterId).pos];
    for (const p of pts) {
      const gap = Math.hypot(p.x - blocker.pos.x, p.z - blocker.pos.z) - blocker.radius;
      assert.ok(gap >= 40, `the ${kind} blocker stays clear of the cast (gap ${gap.toFixed(0)})`);
    }
  };
  blocked('station');
  blocked('wreck');
});

test('after settling, a leftover emitter stops claiming to be live evidence', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  scanBothThenEmitter(h, live);
  for (const j of jumpersOf(h, live)) j.alive = false;
  h.sim.runTicks(40);
  assert.equal(ent(h, b.emitterId).data.scanLabel, 'SPOOF EMITTER — FILED');
  const h2 = makeHarness();
  const live2 = fire(h2);
  h2.sim.runTicks(60 * 245);
  assert.equal(ent(h2, bloomOf(live2).emitterId).data.scanLabel, 'SPOOF EMITTER');
});

test('a jumper that breaks off stops threatening the hand; once every jumper has run or died the hand files', () => {
  const h = makeHarness();
  const live = fire(h);
  scanBothThenEmitter(h, live);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand');
  const [first, second] = jumpersOf(h, live);
  assert.equal(first.data.ai.retaliationTargetId, hand.id);
  first.data.ai.passive = true;
  first.data.ai.roe = 'hold_fire';
  h.sim.runTicks(12);
  assert.equal(first.data.ai.retaliationTargetId, undefined, 'a fleeing jumper loses its fire authority on the hand');
  assert.equal(second.data.ai.retaliationTargetId, h.player.id, 'the one still fighting keeps its job on the player');
  assert.deepEqual(resolved(h), [], 'one jumper still threatens, so the hand has not filed');
  second.alive = false;
  h.sim.runTicks(120);
  assert.deepEqual(resolved(h), ['filed'], 'the last threat is gone (one ran, one died)');
});

test('the hand can be defended: it is sturdier than its stock hull and the second jumper trails the first', () => {
  const h = makeHarness();
  const live = fire(h);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand');
  assert.ok(hand.hullMax >= 190 * 2 && hand.shieldMax >= 82 * 2, `hand hull ${hand.hullMax} / shield ${hand.shieldMax}`);
  assert.equal(hand.hull, hand.hullMax);
  scanBothThenEmitter(h, live);
  const b = bloomOf(live);
  const ranges = jumpersOf(h, live).map((j) => Math.hypot(j.pos.x - b.hulkPos.x, j.pos.z - b.hulkPos.z)).sort((a, c) => a - c);
  assert.ok(ranges[1] - ranges[0] > 250, `the second hull trails by ${(ranges[1] - ranges[0]).toFixed(0)} WU`);
});

test('the jumpers come from the live hulk position, so a towed or shoved hulk draws them to where it is', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bloomOf(live);
  const hulk = ent(h, b.hulkId);
  hulk.pos.x += 900;
  hulk.pos.z -= 400;
  scanBothThenEmitter(h, live);
  for (const j of jumpersOf(h, live)) {
    const fromLive = Math.hypot(j.pos.x - hulk.pos.x, j.pos.z - hulk.pos.z);
    const fromCast = Math.hypot(j.pos.x - b.hulkPos.x, j.pos.z - b.hulkPos.z);
    assert.ok(fromLive > 590 && fromLive < 1040, `out from where the hulk is now (${fromLive.toFixed(0)})`);
    assert.ok(fromCast > fromLive + 200, 'not from the stale cast layout');
  }
});

test('lead and second are assigned by the ids spawnShips returned, not roster order', () => {
  const h = makeHarness();
  const live = fire(h);
  const director = h.sim.registry.get('encounterDirector');
  const realSpawn = director.spawnShips.bind(director);
  director.spawnShips = (liveRef, specs) => {
    const ids = realSpawn(liveRef, specs);
    // Roster order flips (a retry or a reused id could do this); the returned order is truth.
    liveRef.ids.reverse();
    return ids;
  };
  scanBothThenEmitter(h, live);
  const hand = live.ids.map((id) => ent(h, id)).find((e) => e?.data?.ai?.encounterRole === 'hand');
  const [lead, second] = [...jumpersOf(h, live)].sort((a, c) => (a.id < c.id ? -1 : 1));
  assert.equal(lead.data.ai.retaliationTargetId, hand.id, 'the first spawned jumper is the lead');
  assert.equal(second.data.ai.retaliationTargetId, h.player.id, 'the second hunts the player');
});
