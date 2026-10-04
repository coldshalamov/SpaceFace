// INF-law — the law's first response tells you what it thinks you did.
//
// Before this fix, EVERY accepted law receipt (kill OR theft) made the watching witness
// read a homicide line from WITNESS_CRIME_BARKS: scooping a jettisoned cargo pod in view
// of a patrol flipped WANTED with a correct "CARGO THEFT" alert while the first voice on
// the channel accused the player of destroying a vessel. And a DISCOVERED kill (the
// wreck's black box names the killer; the receipt records zero living witnesses by
// design) put an "I watched you do it" statement in a bystander's mouth — a witness
// claim the law's own record denies.
//
// Now: the witness voice is kind-aware (theft receipts voice the theft sibling corpus,
// kill receipts keep the homicide register), and a receipt with no recorded eyes voices
// no witness line at all. Proven on the live barkDirector at fixed seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  barkDirector,
  WITNESS_THEFT_BARKS,
  witnessTheftBarkFor,
} from '../src/systems/barkDirector.js';
import { WITNESS_CRIME_BARKS } from '../src/data/barks.js';
import { BARK_FACTIONS } from '../src/data/barks.js';

function makeHarness({ factionId = 'faction_scn' } = {}) {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities,
    entityList,
    meta: { seed: 4242 },
    world: { currentSectorId: 'helios' },
    story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} },
    lawSecurity: {},
  };
  const add = (spec) => {
    const entity = {
      id: spec.id,
      type: spec.type || 'ship',
      team: spec.team ?? 1,
      alive: true,
      factionId: spec.factionId || factionId,
      radius: spec.radius ?? 4,
      pos: { x: spec.x ?? 0, z: spec.z ?? 0 },
      vel: { x: 0, z: 0 },
      data: spec.data || {},
    };
    entities.set(entity.id, entity);
    entityList.push(entity);
    return entity;
  };
  add({ id: 1, type: 'ship', team: 0, x: 0, z: 0 }); // the player (the offender)
  const says = [];
  const voice = { say: (req) => { says.push(req); return true; } };
  barkDirector.init({ state, bus, helpers: { voice } });
  return { bus, state, add, says };
}

test.afterEach(() => { barkDirector.destroy(); });

function theftReceipt(overrides = {}) {
  return {
    accepted: true,
    incidentReceiptId: 'law:incident:inflaw4242',
    reportId: 'inflaw4242:theft',
    kind: 'payload_theft',
    offenderStableId: 'player',
    offenderEntityId: 1,
    payloadStableId: 'pod_inflaw_4242',
    causalTick: 10,
    stationId: 'station_helios',
    factionId: 'faction_scn',
    witnessCount: 1,
    witnessStableIds: ['entity:30'],
    validatedWitnessedTheft: true,
    source: 'lawSecurity',
    ...overrides,
  };
}

test('a witnessed theft receipt voices a theft line, never a homicide line', () => {
  const h = makeHarness();
  h.add({ id: 30, type: 'ship', team: 2, factionId: 'faction_scn', x: 20, z: 0 });
  h.bus.emit('law:reportIncidentReceipt', theftReceipt());
  assert.equal(h.says.length, 1, 'the first response speaks once');
  const text = h.says[0].text;
  assert.ok(WITNESS_THEFT_BARKS.faction_scn.includes(text),
    `theft receipt must read a theft line, got: "${text}"`);
  assert.ok(!WITNESS_CRIME_BARKS.faction_scn.includes(text),
    'the theft line must not be a homicide line');
  assert.equal(h.says[0].id, 'barkDirector:30:witness-crime',
    'the line is carried by the watching witness');
});

test('a witnessed kill receipt keeps the homicide register (unchanged)', () => {
  const h = makeHarness();
  h.add({ id: 31, type: 'ship', team: 2, factionId: 'faction_scn', x: 20, z: 0 });
  h.bus.emit('law:reportIncidentReceipt', theftReceipt({
    incidentReceiptId: 'law:kill:inflaw4242',
    reportId: 'kill:hauler_4242',
    kind: 'unlawful_kill',
    payloadStableId: 'hauler_4242',
    witnessCount: 1,
    witnessStableIds: ['entity:31'],
    validatedWitnessedTheft: false,
    validatedCrime: true,
  }));
  assert.equal(h.says.length, 1, 'the first response speaks once');
  assert.ok(WITNESS_CRIME_BARKS.faction_scn.includes(h.says[0].text),
    `kill receipt must keep the homicide register, got: "${h.says[0].text}"`);
});

test('a discovered receipt (zero recorded eyes) voices no witness line', () => {
  const h = makeHarness();
  // A lawful voice sits in radius — without the gate it would be handed a false
  // "I watched you" statement for a crime nobody saw.
  h.add({ id: 32, type: 'ship', team: 2, factionId: 'faction_scn', x: 20, z: 0,
    data: { ai: { lawful: true } } });
  h.bus.emit('law:reportIncidentReceipt', theftReceipt({
    incidentReceiptId: 'law:kill:inflaw4242d',
    reportId: 'kill:hauler_4242d',
    kind: 'unlawful_kill',
    witnessCount: 0,
    witnessStableIds: [],
    discovery: true,
    evidence: 'wreck_provenance',
    evidenceClass: 'discovered',
    validatedWitnessedTheft: false,
    validatedCrime: true,
  }));
  assert.equal(h.says.length, 0,
    'the record knows nobody saw it — no invented witness statement');
});

test('every faction carries an in-register theft pack; packs are deterministic and disjoint from the kill corpus', () => {
  for (const factionId of BARK_FACTIONS) {
    const pack = WITNESS_THEFT_BARKS[factionId];
    assert.ok(Array.isArray(pack), `${factionId} theft pack missing`);
    assert.ok(pack.length >= 3, `${factionId} theft pack needs ≥3 lines`);
    assert.ok(new Set(pack).size === pack.length, `${factionId} theft pack has duplicate lines`);
    for (const line of pack) {
      assert.equal(typeof line, 'string');
      assert.ok(line.trim().length > 0, `${factionId} has an empty line`);
      assert.ok(line.length <= 160, `${factionId} line exceeds 160 chars: "${line}"`);
      assert.ok(!/[\r\n]/.test(line), `${factionId} line must be one line`);
      assert.ok(!WITNESS_CRIME_BARKS[factionId].includes(line),
        `${factionId} theft line duplicates a homicide line: "${line}"`);
      // The pack names the taking — no homicide vocabulary.
      assert.ok(!/kill|homicide|destroyed|vented|burned|unmaking/i.test(line),
        `${factionId} theft line reads like a kill: "${line}"`);
    }
    // Deterministic selection, numeric and function rng alike.
    assert.equal(witnessTheftBarkFor(factionId, 7), witnessTheftBarkFor(factionId, 7));
    assert.equal(witnessTheftBarkFor(factionId, () => 0.5), witnessTheftBarkFor(factionId, () => 0.5));
    assert.ok(pack.includes(witnessTheftBarkFor(factionId, 4242)));
  }
  // Unknown faction falls back to the Frontier pack rather than going silent.
  assert.ok(WITNESS_THEFT_BARKS.faction_free.includes(witnessTheftBarkFor('faction_nope', 0)));
});
