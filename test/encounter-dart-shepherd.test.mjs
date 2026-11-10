// WF-02 dart shepherd — the first campaign demand ambush whose armament is itself a physics
// body: a Reach corsair holds 3–4 fused detonator darts on a leash in the ambush lanes. Weigh
// off a cargo tithe and the bombs stay parked; refuse, go quiet, close, or shoot and the leash
// is cut — the pack runs the proven kamikaze fuse at the player. Real director pump, real
// ambush script, real authored shape, seed 4242.
//
// Player words: the toll-taker's guns are bombs you can pick up and throw back — the answer is
// not clicking the right dialog, it is where each dart is standing when its fuse finishes.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encounterDirector,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { ENCOUNTERS, ENCOUNTER_BARKS } from '../src/data/encounters.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

const SEED = 4242;
const SECTOR_ID = 'sector_nyx_march';   // tier 2, security 0.28 — inside the shape's gates
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));
const DART = ENEMY_BY_ID.get('detonator_dart');
const DART_BLAST_RADIUS = DART && DART.detonator && DART.detonator.blastRadius;

function makeHarness() {
  const entities = new Map();
  const entityList = [];
  const player = {
    id: 1, type: 'ship', alive: true, hull: 400, hullMax: 400, shield: 200, shieldMax: 200,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    entities,
    entityList,
    simTime: 0,
    tick: 0,
    player: {
      flags: {}, credits: 5000,
      cargo: { items: { cmdty_consumer_goods: 10 }, usedVolume: 10, usedMass: 5 },
      bounty: 0, heat: 0,
    },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: SECTOR_ID },
    meta: { seed: SEED },
    story: { beatIndex: 3 },
  };
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit(name, payload) { events.push({ name, payload }); }, on() {} };
  dir.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: entities.size + 10, alive: true, type: spec.type || 'ship',
        pos: { ...spec.pos }, team: spec.team, data: spec.data || {},
        detonator: spec.data && spec.data.detonator,
      };
      entities.set(ent.id, ent);
      return ent;
    },
  };
  state.encounterDirector = {
    pending: [], active: {}, live: {}, plannedKey: null,
    pressure: { combat: 200, civilian: 200 }, noise: { mining: 0 }, window: [], cooldowns: {},
    named: {}, externalNamed: {}, receipts: [],
    stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
  function planItem(shapeId) {
    const rng = mulberry32(hash32(SEED, shapeId, 'shepherd-plan'));
    const zone = {
      id: `zone_shepherd_${shapeId}`, name: 'Shepherd test lane', type: 'ambush_lane',
      center: { x: 2600, z: 0 }, radius: 1000, threat: 3,
    };
    const item = planEncounterShape(ENCOUNTERS[shapeId], zone, SECTOR_ID, 0, 0, rng);
    assert.ok(item, 'shape resolved into a schedule item');
    return item;
  }
  // Player sits 1500 wu from the zone anchor — inside proximity reach (radius + slack) but
  // outside the 900 wu spring ring, so the demand window is what the test observes.
  function fireItem(item) {
    item.dueAt = 0;
    item.defers = 0;
    state.player.pos && (player.pos = { x: item.zoneCenter.x - 1500, z: item.zoneCenter.z });
    state.encounterDirector.pending.push(item);
    for (let t = 0; t <= 120; t += 21) {
      state.simTime = t;
      dir._pump(state.encounterDirector, state, t);
      if (firedEncounterId()) break;
    }
  }
  function firedEncounterId() {
    const ev = events.find((e) => e.name === 'encounter:spawned');
    return ev && ev.payload.encounterId;
  }
  function liveOf() {
    const id = firedEncounterId();
    return id ? state.encounterDirector.live[id] : null;
  }
  function tickLive(t) {
    state.simTime = t;
    dir._tickLive(state.encounterDirector, state, t);
  }
  const spawnedShips = () => [...entities.values()].filter((e) => e.type === 'ship' && e.id !== 1);
  const voiceLines = () => events.filter((e) => e.name === 'encounter:voice').map((e) => e.payload.text);
  return { state, player, entities, events, dir, planItem, fireItem, liveOf, tickLive, spawnedShips, voiceLines, firedEncounterId };
}

// A spoken bark is the template with {amount} interpolated — match on the parts that remain.
function barkSpoke(lines, templates) {
  return lines.some((text) => templates.some((tpl) => {
    const parts = String(tpl).split(/\{[a-z]+\}/i);
    return parts.every((p) => !p || text.includes(p));
  }));
}

// Player choices land seconds after the demand bark; the script's own 4 s bark gap would eat an
// ack spoken at the same instant as the fire. Advance the clock the way a real approach does —
// past the gap (4 s), still inside the offer window (14 s).
function answer(h, live, choiceId) {
  h.state.simTime = (live.data.springAt - 4) + 10;
  h.dir._onChoose({ encounterId: live.id, choiceId });
}

test('the authored shape is a demand ambush on the shared script — corsair anchor, dart pool', () => {
  const shape = ENCOUNTERS.dart_shepherd;
  assert.ok(shape, 'dart_shepherd is registered in the generated catalogue');
  assert.equal(shape.script, 'ambush', 'rides the existing ambush script, not a parallel owner');
  assert.equal(shape.tier, 'minor');
  assert.equal(shape.deck, 'combat');
  assert.equal(shape.proximity, true, 'a lane ambush must find the player near a zone');
  assert.ok(shape.zoneTypes.includes('ambush_lane'), 'ambush lanes are the shepherd\'s beat');
  assert.equal(shape.squad.anchorArchetype, 'corsair_raider', 'the shepherd is a real hull worth killing');
  assert.deepEqual(shape.squad.archetypes, ['detonator_dart'], 'every light slot is a live bomb');
  assert.equal(shape.squad.terrain, 'lee', 'the pack waits in cover on the approach bearing');
  assert.deepEqual(shape.choices.map((c) => c.id), ['pay', 'refuse', 'run']);
  assert.equal(shape.timeoutChoice, 'refuse', 'silence is a refusal — the leash cuts itself');
  assert.equal(shape.ackBarks.paid, 'dart_shepherd_paid', 'the paid ack must be the pack, not mines');
  assert.equal(shape.motive, 'cargo_extortion');
  assert.equal(shape.engagementTrigger, 'demand_pending');
  // The leash claims rest on the dart spec being real ordnance, not a scripted prop.
  const dart = DART;
  assert.ok(dart && dart.detonator, 'the dart carries a live detonator payload');
  assert.equal(dart.aiArchetype, 'kamikaze');
  assert.equal(dart.combatDoctrineId, 'detonator_run');
});

test('plan on seed 4242: identity anchor + an all-dart pack parked inside blast range', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  assert.ok(item.ships.length >= 4 && item.ships.length <= 5,
    `the shepherd squad is anchor + a pack (got ${item.ships.length})`);
  const anchor = item.ships[0];
  assert.equal(anchor.archetype, 'corsair_raider');
  assert.equal(anchor.compositionRole, 'identity_anchor');
  const pack = item.ships.slice(1);
  for (const sh of pack) {
    assert.equal(sh.archetype, 'detonator_dart', 'every member slot is a dart');
    assert.equal(sh.combatDoctrineId, 'detonator_run', 'the dart doctrine rides the spawn spec');
    assert.equal(sh.compositionRole, 'light');
  }
  assert.equal(item.terrain, 'lee', 'resolveEncounter carries squad.terrain onto the plan');
  // Density that can go wrong: at least one dart pair parks inside the dart blast radius, so
  // popping one bomb can chain the pack (blast damages same-team hulls — the fuse is the only
  // team-aware part).
  let chained = false;
  for (let i = 0; i < pack.length && !chained; i++) {
    for (let j = i + 1; j < pack.length; j++) {
      const d = Math.hypot(pack[i].pos.x - pack[j].pos.x, pack[i].pos.z - pack[j].pos.z);
      if (d <= DART_BLAST_RADIUS) { chained = true; break; }
    }
  }
  assert.ok(chained, 'on seed 4242 at least one dart pair parks inside dart blast radius');
});

test('the same lane on seed 4242 plans the identical pack twice', () => {
  const run = () => {
    const h = makeHarness();
    return h.planItem('dart_shepherd').ships.map((s) => ({ a: s.archetype, x: s.pos.x, z: s.pos.z }));
  };
  assert.deepEqual(run(), run(), 'composition and positions are byte-identical on the fixed seed');
});

test('fire: the pack spawns leashed — passive darts carrying live payloads, demand on the clock', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  h.fireItem(item);
  const live = h.liveOf();
  assert.ok(live, 'the ambush fired and went live');
  assert.equal(live.phase, 'offer', 'the demand window is open, not sprung');
  const ships = h.spawnedShips();
  assert.equal(ships.length, item.ships.length, 'the whole pack materialized');
  const darts = ships.filter((s) => s.data.detonator);
  assert.ok(darts.length >= 3, `the leashed bombs are real entities with detonator data (got ${darts.length})`);
  for (const dart of darts) {
    assert.equal(dart.data.ai.combatDoctrineId, 'detonator_run', 'each dart runs the fuse doctrine');
    assert.equal(dart.data.ai.passive, true, 'each dart is leashed while the offer stands');
    assert.equal(dart.data.ai.motive, 'cargo_extortion');
  }
  const offer = h.events.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the demand opened the timed fork');
  assert.equal(offer.payload.title, 'DART SHEPHERD');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['pay', 'refuse', 'run']);
  assert.equal(offer.payload.options.find((o) => o.id === 'pay').available, true,
    'a loaded hold can pay');
  assert.equal(offer.payload.timeoutChoice, 'refuse');
  const lines = h.voiceLines();
  assert.ok(barkSpoke(lines, ENCOUNTER_BARKS.dart_shepherd_demand),
    `the shepherd voices its own weigh-off, not the mine wake line (heard: ${lines.join(' | ')})`);
  assert.ok(lines.some((t) => /\d+ in (goods|cargo)/.test(t)),
    'the tithe amount is interpolated into the bark');
});

test('refuse cuts the leash: the pack goes hot under cargo_extortion, clearing resolves the fight', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  h.fireItem(item);
  const live = h.liveOf();
  answer(h, live, 'refuse');
  assert.equal(live.phase, 'conflict', 'refusal springs the ambush');
  for (const e of h.spawnedShips()) {
    assert.equal(e.data.ai.passive, false, 'every dart is off the leash');
    assert.equal(e.data.ai.motive, 'cargo_extortion');
    assert.equal(e.data.ai.engagementTrigger, 'explicit_refusal',
      'the engagement authority releases the pack on the recorded trigger');
  }
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.dart_shepherd_refused),
    'the refused ack speaks');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.dart_shepherd_spring),
    'the leash-cut spring line speaks');
  assert.ok(h.voiceLines().includes(ENCOUNTERS.dart_shepherd.telegraph),
    'the authored telegraph fires as the trap shuts — the counterplay is on the clock');
  // The fight is winnable: kill the pack and the encounter resolves, receipt and all.
  for (const e of h.spawnedShips()) e.alive = false;
  h.tickLive(200);
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved, 'the fight resolves');
  assert.equal(resolved.payload.outcome, 'cleared');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('SHEPHERD DOWN'),
    `the aftermath receipt speaks (got ${receipt && receipt.payload.text})`);
});

test('pay weighs off the tithe through the shepherd\'s own voice and resolves paid', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  h.fireItem(item);
  const live = h.liveOf();
  answer(h, live, 'pay');
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved && resolved.payload.outcome === 'paid', 'payment resolves the encounter paid');
  assert.ok((h.state.player.cargo.items.cmdty_consumer_goods | 0) < 10,
    'the tithe physically left the hold through the cargo writer');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.dart_shepherd_paid),
    'the paid ack is the shepherd\'s own line — bombs going back to sleep, not mines');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('WEIGH-OFF PAID'),
    `the paid receipt speaks (got ${receipt && receipt.payload.text})`);
});

test('silence at the deadline is a refusal — the leash cuts itself with ignored_demand', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  h.fireItem(item);
  const live = h.liveOf();
  assert.ok(live.deadlineAt > 0, 'the offer runs on a clock');
  h.tickLive(live.deadlineAt + 1);
  assert.equal(live.phase, 'conflict', 'timeout springs the ambush');
  const dart = h.spawnedShips().find((e) => e.data.detonator);
  assert.equal(dart.data.ai.engagementTrigger, 'ignored_demand',
    'silence stamps the honest trigger for the engagement authority');
});

test('a runner escapes the leash and the aftermath receipt speaks', () => {
  const h = makeHarness();
  const item = h.planItem('dart_shepherd');
  h.fireItem(item);
  const live = h.liveOf();
  answer(h, live, 'run');
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved && resolved.payload.outcome === 'escaped', 'burning off resolves escaped');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.dart_shepherd_flee),
    'the flee ack speaks');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('LEASH EVADED'),
    `the escape receipt speaks (got ${receipt && receipt.payload.text})`);
});
