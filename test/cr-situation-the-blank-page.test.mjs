// CR situation 586 — THE BLANK PAGE. The Quiet's one social verb, played: their grammar sells the
// blank ledger (`blankNews`, `off_book_unlogged`, "Pass. Say nothing.") but no beat ever asked the
// pilot to keep one. This test pins the contract — an unmarked shadow rides your lane inside the
// Quiet's own ground (Hollow Station / the Mercenary Outpost) and the wire pays a registry for a
// page kept blank. The scanner is the pen: a pulse that physically covers the hull is ink; a weak
// sweep that cannot reach it writes nothing. Signing then reading is priced worst; a grip or a
// shot burns the page and gets answered; a plain no, a lapsed wire, and the already-written are
// each their own record. Nothing ever hits the news wire — a Quiet incident is not news.
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
import { BLANK_PAGE } from '../src/data/encounters/586-the-blank-page.js';
import { situationMemory } from '../src/systems/crSituationKit.js';
import { SECTORS } from '../src/data/sectors.js';

const SEED = 4242;
const SECTOR = 'sector_pallas_drift';
const ANCHOR = Object.freeze({ x: -1080, z: 540 });        // Hollow Station — the Quiet's own outlaw ground
const SHAPE = 'the_blank_page';

function sectorStations(sectorId) {
  const sec = SECTORS.find((s) => s.id === sectorId);
  return (sec && sec.stations || []).map((st) => ({
    ...st, pos: { x: ANCHOR.x + 500, z: ANCHOR.z + 500 },
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
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'encounter:choiceOffered', 'encounter:receipt',
    'economy:grantCredits', 'economy:chargeCredits', 'faction:repDelta', 'news:publish',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  if (opts.prior) {
    situationMemory(state).completed[SHAPE] = {
      outcome: opts.prior, at: 10, tick: 600, encounterId: 'prior_blank_page',
      sectorId: SECTOR, facts: opts.priorFacts || {}, visits: 1,
    };
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_blank_page', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone', zoneRadius: 900, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the blank page went live');
  const w = live.data.blankPage;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const quietReps = (h) => h.events.filter((e) => e.name === 'faction:repDelta' && e.p.factionId === 'faction_quiet')
  .map((e) => ({ delta: e.p.delta, reason: e.p.reason }));
const news = (h) => h.events.filter((e) => e.name === 'news:publish');
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const voices = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text).join('\n');
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const choose = (h, id) => h.host.withFeatures(() => h.bus.emit('encounter:choose', { encounterId: h.live.id, choiceId: id }));
const ghostOf = (h) => h.ent(h.w.ghostId);

// A player-authored sweep at a given radius — the scanner's own payload, seq monotonic.
let seq = 0;
function pulse(h, radius) {
  const p = h.ent(h.state.playerId);
  h.host.withFeatures(() => h.bus.emit('scan:pulse', {
    pos: { x: p.pos.x, z: p.pos.z }, radius,
    source: 'player-scanner', scannerId: p.id, seq: ++seq, simTime: h.state.simTime,
  }));
}

test('the blank page is registered on the Quiet\'s own outlaw ground', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['outlaw_zone']);
  assert.deepEqual([...enc.gates.sectorIds].sort(), ['sector_io_reach', 'sector_pallas_drift']);
  assert.equal(enc.shape.situation, 'trade');
  assert.equal(enc.shape.twist, 'logic');
  assert.equal(enc.shape.actor, 'faction_quiet');
});

test('one look: an unmarked shadow rides your lane and the wire pays for a page kept blank', async () => {
  const h = await boot();
  try {
    const w = h.w;
    assert.equal(h.live.phase, 'offer');
    assert.equal(w.terms, false);
    assert.equal(w.fee, BLANK_PAGE.feeCr);
    const ghost = ghostOf(h);
    assert.ok(ghost && ghost.alive !== false, 'the shadow is a live body');
    assert.equal(ghost.factionId, 'faction_quiet');
    assert.equal(ghost.data.ai.passive, true, 'it watches — it does not open fire');
    assert.match(ghost.data.scanLabel, /UNMARKED CONTACT/);

    // The shadow physically orbits the pilot at the wire's stand-off — close enough to read you.
    const p = h.ent(h.state.playerId);
    const dl = Math.hypot(ghost.pos.x - p.pos.x, ghost.pos.z - p.pos.z);
    assert.ok(Math.abs(dl - BLANK_PAGE.shadowWu) < 40, `the shadow holds ~${BLANK_PAGE.shadowWu} WU off (${dl.toFixed(0)})`);
    const act = ghost.data.ai.activity;
    assert.equal(act.targetId, p.id, 'the orbit is on the pilot, not the zone');
    assert.ok(Math.abs((act.preferredRange || 0) - BLANK_PAGE.shadowWu) < 1);

    assert.ok(h.events.some((e) => e.name === 'encounter:choiceOffered'
      && e.p.options.some((o) => o.id === 'take_terms')
      && e.p.options.some((o) => o.id === 'fly_low')), 'the wire offers its two answers');
    assert.equal(h.live.vars.amount, BLANK_PAGE.feeCr, 'the wire\'s figure is the fee');
    assert.match(voices(h), /keep the page blank|keeps the page blank/i);
  } finally { h.host.dispose(); }
});

test('terms taken and kept: the wire pays off-book and the shadow leaves the record, not a fight', async () => {
  const h = await boot();
  try {
    const before = h.state.player.credits;
    choose(h, 'take_terms');
    assert.equal(h.live.phase, 'contract');
    h.state.simTime += BLANK_PAGE.contractS + 1;
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['kept_blank']);
    assert.deepEqual(grants(h), [BLANK_PAGE.feeCr], 'the wire paid exactly once, off-book');
    assert.equal(h.state.player.credits, before + BLANK_PAGE.feeCr);
    assert.ok(quietReps(h).some((r) => r.delta === BLANK_PAGE.repBlank && r.reason === 'the_blank_page_kept_blank'));
    assert.equal(memory(h).outcome, 'kept_blank');
    assert.equal(memory(h).facts.terms, true);
    assert.equal(news(h).length, 0, 'a Quiet incident is not news — the wire never publishes');
    const ghost = ghostOf(h);
    assert.equal(ghost.data.ai.activity.kind, 'transit', 'the paid shadow burns off the lane');
  } finally { h.host.dispose(); }
});

test('an unsolicited look writes the page: the fee dies and the shadow burns off', async () => {
  const h = await boot();
  try {
    pulse(h, 1200);   // a stock sweep physically covers the 940 WU ring — that IS the read
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['read']);
    assert.deepEqual(grants(h), [], 'looking is free of the wire\'s figure');
    assert.ok(quietReps(h).some((r) => r.delta === BLANK_PAGE.repRead && r.reason === 'the_blank_page_read'));
    assert.equal(memory(h).facts.readAt != null, true);
    assert.equal(news(h).length, 0);
    assert.match(ghostOf(h).data.scanLabel, /READ YOU BACK/);
    assert.equal(ghostOf(h).data.ai.activity.kind, 'transit', 'a read shadow leaves — it does not chase');
  } finally { h.host.dispose(); }
});

test('a sweep too short to reach the hull writes nothing', async () => {
  const h = await boot();
  try {
    pulse(h, 400);    // a fouled/weak scanner cannot ink a page it cannot touch
    h.host.step(6);
    assert.deepEqual(outcomes(h), [], 'a pulse that never lands is not a read');
    assert.equal(h.live.phase, 'offer');
    assert.deepEqual(quietReps(h), []);
  } finally { h.host.dispose(); }
});

test('signed, then read: the page you inked yourself is priced worst of all', async () => {
  const h = await boot();
  try {
    choose(h, 'take_terms');
    pulse(h, 1200);
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['broke_terms']);
    assert.deepEqual(grants(h), []);
    assert.ok(quietReps(h).some((r) => r.delta === BLANK_PAGE.repBrokeTerms && r.reason === 'the_blank_page_broke_terms'));
    assert.equal(memory(h).facts.terms, true);
    assert.equal(news(h).length, 0);
    assert.match(voices(h), /signed, then wrote on it/i);
  } finally { h.host.dispose(); }
});

test('a shot on the shadow burns the page and the ghost answers like a stalker', async () => {
  const h = await boot();
  try {
    const ghost = ghostOf(h);
    h.host.withFeatures(() => h.bus.emit('combat:damage', {
      attackerId: h.state.playerId, targetId: ghost.id, applied: 40,
    }));
    assert.equal(h.live.phase, 'conflict', 'the shadow answered the shot');
    assert.equal(ghost.data.ai.passive, false, 'it stopped watching');
    assert.equal(ghost.data.ai.activity.kind, 'attack_run');
    assert.match(voices(h), /made it a body/i);
    h.state.simTime += BLANK_PAGE.windowS + 1;
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['burned']);
    assert.ok(quietReps(h).some((r) => r.delta === BLANK_PAGE.repBurned && r.reason === 'the_blank_page_burned'));
    assert.equal(memory(h).facts.burnedVia, 'hit', 'the ledger keeps how the page burned');
    assert.equal(news(h).length, 0);
  } finally { h.host.dispose(); }
});

test('killing the shadow after opening on it is written in ink', async () => {
  const h = await boot();
  try {
    const ghost = ghostOf(h);
    h.host.withFeatures(() => h.bus.emit('combat:damage', {
      attackerId: h.state.playerId, targetId: ghost.id, applied: 40,
    }));
    ghost.alive = false;
    h.host.withFeatures(() => h.bus.emit('entity:killed', {
      id: ghost.id, killerId: h.state.playerId, type: 'ship', pos: { ...ghost.pos },
    }));
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['burned']);
    assert.ok(quietReps(h).some((r) => r.delta === BLANK_PAGE.repGhostDown && r.reason === 'the_blank_page_ghost_down'));
    assert.equal(memory(h).facts.killed, true);
  } finally { h.host.dispose(); }
});

test('a plain no is still blank: the wire pays nothing, keeps nothing against you', async () => {
  const h = await boot();
  try {
    choose(h, 'fly_low');
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['declined']);
    assert.deepEqual(grants(h), []);
    assert.deepEqual(quietReps(h), [], 'a declined wire moves no standing');
    assert.match(voices(h), /heard and unanswered/i);
  } finally { h.host.dispose(); }
});

test('an unanswered wire lapses into nothing written', async () => {
  const h = await boot();
  try {
    h.state.simTime += BLANK_PAGE.offerS + 1;
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['unwritten']);
    assert.deepEqual(grants(h), []);
    assert.deepEqual(quietReps(h), []);
  } finally { h.host.dispose(); }
});

test('the wire remembers a kept page: a trusted registry gets the better figure', async () => {
  const h = await boot({ prior: 'kept_blank' });
  try {
    assert.equal(h.w.priorKind, 'blank');
    assert.equal(h.w.fee, Math.max(1, Math.round(BLANK_PAGE.feeCr * BLANK_PAGE.trustedMult)));
    assert.equal(h.live.vars.amount, h.w.fee);
    assert.match(voices(h), /remembered/i);
    assert.ok(h.events.some((e) => e.name === 'encounter:choiceOffered'), 'a trusted registry is offered again');
  } finally { h.host.dispose(); }
});

test('the wire remembers the written: no offer, a colder watch, a clean pass', async () => {
  const h = await boot({ prior: 'read' });
  try {
    assert.equal(h.w.priorKind, 'written');
    assert.equal(h.live.phase, 'watching');
    assert.equal(h.events.some((e) => e.name === 'encounter:choiceOffered'), false,
      'the written are watched, not paid — nothing rides this wire');
    assert.match(voices(h), /already on a page/i);
    h.state.simTime += BLANK_PAGE.windowS + 1;
    runUntilResolved(h, 6 * 60);
    assert.deepEqual(outcomes(h), ['written_pass']);
    assert.deepEqual(grants(h), []);
    assert.deepEqual(quietReps(h), []);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the planner books it only inside the Quiet\'s outlaw ground', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  let booked = null;
  for (let day = 0; day < 365 && !booked; day++) {
    booked = planEncounters(SEED, SECTOR, day, zonesForSector(SECTOR))
      .find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(booked, 'planner never books the blank page in 365 Pallas days');
  const zone = zonesForSector(SECTOR).find((z) => z.id === booked.zoneId);
  assert.ok(zone && enc.zoneTypes.includes(zone.type), `booked on ${booked.zoneId} (${zone && zone.type})`);
  for (const other of ['sector_helios_prime', 'sector_sker_haven', 'sector_tethys_junction', 'sector_vesta_forge']) {
    for (let day = 0; day < 120; day++) {
      const off = planEncounters(SEED, other, day, zonesForSector(other))
        .find((item) => item.shapeId === SHAPE);
      assert.ok(!off, `${other}: blank page booked outside its gates on day ${day}`);
    }
  }
});
