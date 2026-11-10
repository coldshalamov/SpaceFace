// CR situation 1208 — THE VETTING. Sker Haven's door: the Bazaar berth is repGated (floor +1),
// the Reach starts every pilot at -50, and the sector's own zone ledger says "the door vets
// standing, the deep picket does not" — but nothing in space played the vetting. This test pins
// the door beat: a Reach chord on the Bazaar bearing reads the registry and the wire answer is
// mechanical (cover -> +standing, taste -> cargo tithe + standing, mark -> the standing bribe's
// own contract), with the door's memory read back through priorOutcome.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { lootShards } from '../src/systems/lootShards.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { VETTING } from '../src/data/encounters/1208-the-vetting.js';
import { situationMemory } from '../src/systems/crSituationKit.js';
import { SECTORS } from '../src/data/sectors.js';

const SEED = 4242;
const SECTOR = 'sector_sker_haven';
const ANCHOR = Object.freeze({ x: -800, z: 1400 });        // inside Skerris Deep, on the approach chord
const SHAPE = 'the_vetting';
const BAZAAR = Object.freeze({ x: -540, z: 680 });         // test's own stamp for station_sker

// Reach starts at -50; a repDelta of (target + 50) lands the target rep on the fresh record.
// A zero delta is a no-op through applyRep (it returns before the record exists), so seeding the
// untouched -50 mints the record by an exact round trip: +1 then -1.
function setReachRep(h, target) {
  const rec = h.state.factions.faction_reach;
  const base = rec && Number.isFinite(rec.rep) ? rec.rep : -50;
  const delta = target - base;
  const steps = delta === 0 ? [1, -1] : [delta];
  for (const d of steps) {
    h.host.withFeatures(() => h.bus.emit('faction:repDelta', {
      factionId: 'faction_reach', delta: d, reason: 'test_seed',
    }));
  }
  assert.equal(h.state.factions.faction_reach.rep, target, `reach rep seeded to ${target}`);
}

function sectorStations(sectorId) {
  const sec = SECTORS.find((s) => s.id === sectorId);
  return (sec && sec.stations || []).map((st) => ({
    ...st, pos: st.id === 'station_sker' ? { ...BAZAAR } : { x: BAZAAR.x + 900, z: BAZAAR.z },
  }));
}

async function boot(opts = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, economy, cargo, factions, lootShards, 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 120, z: ANCHOR.z - 120 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = {
    stations: sectorStations(SECTOR), fields: [], hazards: [], pois: [], gates: [],
  };
  state.player.credits = opts.credits != null ? opts.credits : 5000;
  if (opts.cargo) {
    for (const [id, qty] of Object.entries(opts.cargo)) {
      state.player.cargo.items[id] = qty;
    }
  }
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'encounter:choiceOffered', 'encounter:receipt',
    'economy:chargeCredits', 'economy:grantCredits', 'faction:repDelta', 'news:publish',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  if (opts.reachRep != null) setReachRep({ state, bus, host }, opts.reachRep);
  if (opts.prior) {
    situationMemory(state).completed[SHAPE] = {
      outcome: opts.prior, at: 10, tick: 600, encounterId: 'prior_vetting',
      sectorId: SECTOR, facts: opts.priorFacts || {}, visits: 1,
    };
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_vetting', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone', zoneRadius: 1400, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the vetting went live');
  const w = live.data.vetting;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const charges = (h) => h.events.filter((e) => e.name === 'economy:chargeCredits').map((e) => e.p.amount);
const reachReps = (h) => h.events.filter((e) => e.name === 'faction:repDelta' && e.p.factionId === 'faction_reach')
  .map((e) => ({ delta: e.p.delta, reason: e.p.reason }));
const repOf = (h) => h.state.factions.faction_reach.rep;
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const voices = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text).join('\n');
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const choose = (h, id) => h.host.withFeatures(() => h.bus.emit('encounter:choose', { encounterId: h.live.id, choiceId: id }));

test('the vetting is registered on the Sker approach as a civilian minor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['outlaw_zone']);
  assert.deepEqual([...enc.gates.sectorIds], ['sector_sker_haven']);
  assert.equal(enc.shape.situation, 'toll');
  assert.equal(enc.shape.actor, 'faction_reach');
});

test('one look: a passive Reach chord parked on the Bazaar bearing, hailing instead of shooting', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    const w = h.w;
    assert.equal(w.cls, 'stranger');
    assert.equal(h.live.phase, 'offer');
    const vetter = h.ent(w.vetterId);
    assert.ok(vetter && vetter.alive !== false, 'the vetter is a live body');
    assert.equal(vetter.factionId, 'faction_reach');
    assert.equal(vetter.data.ai.passive, true, 'the door vets — it does not open fire');
    assert.match(vetter.data.scanLabel, /VETTING CHORD/);

    // The chord physically sits on the player -> Bazaar bearing, ahead of the pilot.
    const p = h.ent(h.state.playerId);
    const bx = BAZAAR.x - p.pos.x, bz = BAZAAR.z - p.pos.z;
    const bl = Math.hypot(bx, bz);
    const dx = vetter.pos.x - p.pos.x, dz = vetter.pos.z - p.pos.z;
    const dl = Math.hypot(dx, dz);
    const cos = (bx * dx + bz * dz) / (bl * dl);
    assert.ok(cos > 0.99, `the chord parks on the door bearing (cos ${cos.toFixed(3)})`);
    assert.ok(Math.abs(dl - VETTING.chordWu) < 30, `the chord holds ~${VETTING.chordWu} WU ahead (${dl.toFixed(0)})`);

    assert.ok(h.events.some((e) => e.name === 'encounter:choiceOffered'
      && e.p.options.some((o) => o.id === 'cover')
      && e.p.options.some((o) => o.id === 'taste')
      && e.p.options.some((o) => o.id === 'turn_back')), 'the door offers its three answers');
    assert.equal(h.live.vars.amount, VETTING.coverCr, 'the credit gate is the cover');
    assert.match(voices(h), /registry reads a stranger/i);
  } finally { h.host.dispose(); }
});

test('wire the cover: credits move once through the sole writer and standing climbs', async () => {
  const h = await boot({ reachRep: -20 });
  try {
    const before = h.state.player.credits;
    choose(h, 'cover');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(charges(h), [VETTING.coverCr], 'the cover left the wallet once');
    assert.equal(h.state.player.credits, before - VETTING.coverCr);
    assert.deepEqual(outcomes(h), ['covered']);
    assert.ok(reachReps(h).some((r) => r.delta === VETTING.coverRep && r.reason === 'the_vetting_covered'));
    assert.equal(repOf(h), -20 + VETTING.coverRep, 'the count wrote the name up a line');
    assert.equal(memory(h).outcome, 'covered');
    assert.equal(memory(h).facts.paidCr, VETTING.coverCr);
    assert.equal(memory(h).facts.doorOpen, false, 'one cover does not buy the door');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the count');
  } finally { h.host.dispose(); }
});

test('a cover that crosses the floor opens the door and the hail says so', async () => {
  const h = await boot({ reachRep: -8 });
  try {
    choose(h, 'cover');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['covered']);
    assert.equal(repOf(h), 4, 'rep crossed the Bazaar floor of +1');
    assert.equal(memory(h).facts.doorOpen, true);
    assert.match(voices(h), /Bazaar reads your name now/i);
  } finally { h.host.dispose(); }
});

test('leave a taste: freight off the hold buys the same memory softer', async () => {
  const h = await boot({ reachRep: -10, cargo: { cmdty_ore_titanium: 12, cmdty_ore_iron: 40 } });
  try {
    const titaniumBefore = h.state.player.cargo.items.cmdty_ore_titanium | 0;
    choose(h, 'taste');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['tasted']);
    const titaniumAfter = h.state.player.cargo.items.cmdty_ore_titanium | 0;
    assert.ok(titaniumAfter < titaniumBefore, 'the chord took the best goods first');
    assert.deepEqual(charges(h), [], 'a taste moves freight, not credits');
    assert.ok(reachReps(h).some((r) => r.delta === VETTING.tasteRep && r.reason === 'the_vetting_tasted'));
    assert.equal(memory(h).facts.tasteValue >= VETTING.coverCr - 51, true, 'the tithe covers the figure');
  } finally { h.host.dispose(); }
});

test('a hollow hold cannot taste: the wire stays open and the count waits', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    choose(h, 'taste');
    h.host.step(6);
    assert.deepEqual(outcomes(h), [], 'an empty hold is not an answer');
    assert.equal(h.live.phase, 'offer');
    assert.match(voices(h), /hold reads empty/i);
    // The wire is single-shot: a refused answer is still the answer. The door keeps counting
    // until the wire dies at its deadline.
    h.state.simTime += VETTING.offerS + 1;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['turned_back']);
    assert.equal(repOf(h), -10, 'an empty taste buys no standing');
  } finally { h.host.dispose(); }
});

test('a Mark can buy the mark back through the standing bribe contract', async () => {
  const h = await boot({ reachRep: -50 });
  try {
    const w = h.w;
    assert.equal(w.cls, 'mark');
    const offered = h.events.find((e) => e.name === 'encounter:choiceOffered');
    const ids = offered.p.options.map((o) => o.id);
    assert.deepEqual(ids.sort(), ['turn_back', 'unmark'].sort(), 'the door sells one answer to a mark');
    assert.equal(h.live.vars.amount, w.unmarkCr, 'the gate price is the bribe cost');
    assert.ok(w.unmarkCr > 0 && Number.isFinite(w.unmarkCr));
    assert.match(voices(h), /registry reads MARK/i);

    const before = h.state.player.credits;
    choose(h, 'unmark');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['unmarked']);
    assert.equal(repOf(h), -29, 'the bribe contract lifts the mark to the neutral floor');
    assert.equal(h.state.player.credits, before - w.unmarkCr);
    assert.equal(memory(h).facts.cost, w.unmarkCr);
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
  } finally { h.host.dispose(); }
});

test('a mark whose wire comes back short keeps the mark and the offer', async () => {
  const h = await boot({ reachRep: -50, credits: 10 });
  try {
    assert.equal(h.w.cls, 'mark');
    choose(h, 'unmark');
    h.host.step(6);
    assert.deepEqual(outcomes(h), [], 'a short wire settles nothing');
    assert.equal(h.live.phase, 'offer');
    assert.equal(repOf(h), -50, 'the mark stays on');
    assert.match(voices(h), /came back short/i);
    h.state.simTime += VETTING.offerS + 1;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['turned_back']);
  } finally { h.host.dispose(); }
});

test('vouched: the door reads the name, waves the hull through, and writes the line', async () => {
  const h = await boot({ reachRep: 5 });
  try {
    const w = h.w;
    assert.equal(w.cls, 'vouched');
    assert.equal(h.live.phase, 'waved');
    assert.equal(h.events.some((e) => e.name === 'encounter:choiceOffered'), false, 'the vouched do not answer a wire');
    assert.match(voices(h), /reads vouched|reads your name/i);
    h.state.simTime += VETTING.waveS + 1;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['waved_in']);
    assert.ok(reachReps(h).some((r) => r.delta === VETTING.waveRep && r.reason === 'the_vetting_waved_in'));
  } finally { h.host.dispose(); }
});

test('shoot the chord: the door answers with guns and the sector keeps the shot', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    const vetter = h.ent(h.w.vetterId);
    h.host.withFeatures(() => h.bus.emit('combat:damage', { attackerId: h.state.playerId, targetId: vetter.id, applied: 40 }));
    assert.equal(h.live.phase, 'conflict', 'the door answered the shot — the wire went cold');
    assert.match(voices(h), /the door answers/i);
    h.state.simTime += VETTING.windowS + 1;   // the pilot burned the leg out with the chord alive
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['shot_the_door']);
    assert.ok(reachReps(h).some((r) => r.delta === VETTING.shotRep && r.reason === 'the_vetting_shot_the_door'));
    assert.equal(vetter.data.ai.passive, false, 'the door answered like a door');
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
    assert.match(voices(h), /the door answers/i);
  } finally { h.host.dispose(); }
});

test('kill the whole chord: the Bazaar heard all of it', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    for (const id of [...h.live.ids]) {
      const e = h.ent(id);
      if (e && e.type === 'ship') {
        e.alive = false;
        h.host.withFeatures(() => h.bus.emit('entity:killed', { id: e.id, killerId: h.state.playerId, type: 'ship', pos: { ...e.pos } }));
      }
    }
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['door_broken']);
    assert.ok(reachReps(h).some((r) => r.delta === VETTING.brokenRep && r.reason === 'the_vetting_door_broken'));
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
  } finally { h.host.dispose(); }
});

test('turn around or let the wire die: the door keeps its count either way', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    choose(h, 'turn_back');
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['turned_back']);
    assert.deepEqual(charges(h), [], 'turning back costs nothing');
    assert.equal(repOf(h), -10, 'an unanswered door moves no standing');
  } finally { h.host.dispose(); }
});

test('the wire going quiet at the deadline reads as a turn-back', async () => {
  const h = await boot({ reachRep: -10 });
  try {
    h.state.simTime += VETTING.offerS + 1;
    runUntilResolved(h, 4 * 60);
    assert.deepEqual(outcomes(h), ['turned_back']);
    assert.deepEqual(charges(h), []);
  } finally { h.host.dispose(); }
});

test('the door remembers a payer: cheaper book, warmer hail', async () => {
  const h = await boot({ reachRep: -10, prior: 'covered' });
  try {
    assert.equal(h.w.priorKind, 'payer');
    assert.equal(h.w.coverCr, Math.max(1, Math.round(VETTING.coverCr * VETTING.payerDiscount)));
    assert.equal(h.live.vars.amount, h.w.coverCr);
    assert.match(voices(h), /remembers a payer/i);
  } finally { h.host.dispose(); }
});

test('the door remembers a shot: the count is higher on the next pass', async () => {
  const h = await boot({ reachRep: -10, prior: 'shot_the_door' });
  try {
    assert.equal(h.w.priorKind, 'hostile');
    assert.equal(h.w.coverCr, Math.round(VETTING.coverCr * VETTING.hostileMarkup));
    assert.match(voices(h), /keeps your shot/i);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the planner books it only inside Sker Haven', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  const zones = zonesForSector(SECTOR);
  const byId = new Map(zones.map((z) => [z.id, z]));
  let booked = null;
  for (let day = 0; day < 365 && !booked; day++) {
    booked = planEncounters(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(booked, 'planner never books the vetting in 365 Sker days');
  const zone = byId.get(booked.zoneId);
  assert.ok(zone && enc.zoneTypes.includes(zone.type), `booked on ${booked.zoneId} (${zone && zone.type})`);
  for (const other of ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction', 'sector_io_reach', 'sector_pallas_drift']) {
    for (let day = 0; day < 120; day++) {
      const off = planEncounters(SEED, other, day, zonesForSector(other))
        .find((item) => item.shapeId === SHAPE);
      assert.ok(!off, `${other}: vetting booked outside its gates on day ${day}`);
    }
  }
});
