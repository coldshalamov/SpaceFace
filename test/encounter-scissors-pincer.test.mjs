// WF-02 the scissors — the belt ambush whose plan is the place: one Reach wing cuts the lane
// ahead and runs the demand while a second, quiet wing is already seeded astern of the player
// holding the wake (behind a readable stone when the field carries one). Pay and both blades
// part; refuse, run, go quiet, or shoot and the wake blade lights its burns. Real director
// pump, self-registered runtime, authored shape, seed 4242.
//
// Player words: the toll is the loud half of the trap — the other half is behind you, and the
// field shows both blades the whole time.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encounterDirector,
  planEncounterShape,
} from '../src/systems/encounterDirector.js';
import { ENCOUNTERS, ENCOUNTER_BARKS } from '../src/data/encounters.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

const SEED = 4242;
const SECTOR_ID = 'sector_nyx_march';   // tier 2, security 0.28 — inside the shape's gates

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
      };
      entities.set(ent.id, ent);
      entityList.push(ent);
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
    const rng = mulberry32(hash32(SEED, shapeId, 'scissors-plan'));
    const zone = {
      id: `zone_scissors_${shapeId}`, name: 'Scissors test lane', type: 'mining_belt',
      center: { x: 2600, z: 0 }, radius: 1000, threat: 3,
    };
    const item = planEncounterShape(ENCOUNTERS[shapeId], zone, SECTOR_ID, 0, 0, rng);
    assert.ok(item, 'shape resolved into a schedule item');
    return item;
  }
  // Player sits 1500 wu from the zone anchor, on the zone bearing. The loud blade spawns 620
  // wu ahead on that bearing; the wake blade lands ~840 wu astern. The spring grace keeps the
  // demand window open; the wake ring is what a deliberate reverse trips.
  function fireItem(item) {
    item.dueAt = 0;
    item.defers = 0;
    player.pos = { x: item.zoneCenter.x - 1500, z: item.zoneCenter.z };
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
  const shipsOfRole = (live, role) => spawnedShips().filter((e) => live.roles[e.id] === role);
  const voiceLines = () => events.filter((e) => e.name === 'encounter:voice').map((e) => e.payload.text);
  return { state, player, entities, entityList, events, dir, planItem, fireItem, liveOf, tickLive, spawnedShips, shipsOfRole, voiceLines, firedEncounterId };
}

// Player choices land seconds after the demand bark; the 4 s spring grace must be spent and
// the offer window (14 s) must still be open when the answer arrives.
function answer(h, live, choiceId) {
  h.state.simTime = (live.data.springAt - 4) + 10;
  h.dir._onChoose({ encounterId: live.id, choiceId });
}

// A spoken bark is the template with {amount} interpolated — match on the parts that remain.
function barkSpoke(lines, templates) {
  return lines.some((text) => templates.some((tpl) => {
    const parts = String(tpl).split(/\{[a-z]+\}/i);
    return parts.every((p) => !p || text.includes(p));
  }));
}

function rock(x, z, radius, id) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, radius };
}

test('the authored shape is a two-blade demand ambush — front squad, authored wake blade', () => {
  const shape = ENCOUNTERS.scissors_ambush;
  assert.ok(shape, 'scissors_ambush is registered in the generated catalogue');
  assert.equal(shape.script, 'selfRegistered', 'rides the self-registered runtime extension point');
  assert.equal(shape.fallbackScript, 'ambush', 'planner tooling reads it as an ambush');
  assert.equal(shape.tier, 'minor');
  assert.equal(shape.deck, 'combat');
  assert.equal(shape.proximity, true, 'a lane trap must find the player near a zone');
  assert.ok(shape.zoneTypes.includes('mining_belt'), 'the scissors works where rocks are');
  assert.equal(shape.squad.anchorArchetype, 'reaver_pirate', 'the loud blade anchors on a real hull');
  assert.equal(shape.flank.anchorArchetype, 'corsair_raider', 'the quiet blade anchors on a real hull');
  assert.ok(shape.flank.archetypes.includes('wasp_swarmer'), 'the wake wing is light hulls — throwable, breakable');
  assert.deepEqual(shape.choices.map((c) => c.id), ['pay', 'refuse', 'run']);
  assert.equal(shape.timeoutChoice, 'refuse', 'silence is a refusal — the blades shut themselves');
  assert.equal(shape.motive, 'cargo_extortion');
  assert.equal(shape.engagementTrigger, 'demand_pending');
  for (const key of ['scissors_demand', 'scissors_spring', 'scissors_paid', 'scissors_refused', 'scissors_run']) {
    assert.ok(ENCOUNTER_BARKS[key], `the voice corpus carries ${key}`);
  }
  for (const outcome of ['paid', 'cleared', 'escaped']) {
    assert.equal(typeof shape.receipts[outcome], 'string', `the ${outcome} receipt is authored`);
  }
});

test('plan on seed 4242: the loud blade is reaver-anchored with light ammunition', () => {
  const h = makeHarness();
  const item = h.planItem('scissors_ambush');
  assert.ok(item.ships.length >= 3 && item.ships.length <= 4,
    `the front wing is 3-4 hulls (got ${item.ships.length})`);
  const anchor = item.ships[0];
  assert.equal(anchor.archetype, 'reaver_pirate');
  assert.equal(anchor.compositionRole, 'identity_anchor');
  for (const sh of item.ships.slice(1)) {
    assert.ok(['wasp_swarmer', 'corsair_raider'].includes(sh.archetype), 'light pool only');
  }
});

test('the same lane on seed 4242 lays the identical trap twice', () => {
  const run = () => {
    const h = makeHarness();
    h.fireItem(h.planItem('scissors_ambush'));
    return h.spawnedShips().map((s) => ({ x: Math.round(s.pos.x), z: Math.round(s.pos.z), data: s.data.ai?.passive }));
  };
  assert.deepEqual(run(), run(), 'blade composition and positions are byte-identical on the fixed seed');
});

test('fire: two blades, both cold — the loud wing cuts the lane, the quiet wing holds the wake', () => {
  const h = makeHarness();
  const item = h.planItem('scissors_ambush');
  h.fireItem(item);
  const live = h.liveOf();
  assert.ok(live, 'the ambush fired and went live');
  assert.equal(live.phase, 'offer', 'the demand window is open, not sprung');
  const front = h.shipsOfRole(live, 'squad');
  const wake = h.shipsOfRole(live, 'flank');
  assert.ok(front.length >= 3, `the loud blade spawned (got ${front.length})`);
  assert.ok(wake.length >= 2, `the quiet blade spawned (got ${wake.length})`);
  // Geometry: the loud blade is AHEAD on the zone bearing; the quiet blade is ASTERN.
  const toZone = { x: item.zoneCenter.x - h.player.pos.x, z: item.zoneCenter.z - h.player.pos.z };
  const len = Math.hypot(toZone.x, toZone.z);
  const ux = toZone.x / len, uz = toZone.z / len;
  for (const e of front) {
    const along = (e.pos.x - h.player.pos.x) * ux + (e.pos.z - h.player.pos.z) * uz;
    assert.ok(along > 0, 'the loud blade stands between the player and the zone');
  }
  for (const e of wake) {
    const along = (e.pos.x - h.player.pos.x) * ux + (e.pos.z - h.player.pos.z) * uz;
    assert.ok(along < -300, `the quiet blade holds the wake astern (along ${Math.round(along)})`);
    const lateral = Math.abs((e.pos.x - h.player.pos.x) * uz - (e.pos.z - h.player.pos.z) * ux);
    assert.ok(lateral > 20, 'the wake blade stands OFF the exact bearing, not on top of the player');
  }
  // Both blades are cold during the demand: readable, not yet dangerous.
  for (const e of [...front, ...wake]) {
    assert.equal(e.data.ai.passive, true, 'both blades hold fire while the offer stands');
  }
  const offer = h.events.find((e) => e.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the demand opened the timed fork');
  assert.equal(offer.payload.title, 'THE SCISSORS');
  assert.deepEqual(offer.payload.options.map((o) => o.id), ['pay', 'refuse', 'run']);
  assert.equal(offer.payload.options.find((o) => o.id === 'pay').available, true,
    'a loaded hold can pay the cut');
  assert.equal(offer.payload.timeoutChoice, 'refuse');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.scissors_demand),
    `the loud blade voices the demand (heard: ${h.voiceLines().join(' | ')})`);
  // The robbery is stamped but not escalated: no blade may fire until the shut records a trigger.
  for (const e of [...front, ...wake]) {
    assert.equal(e.data.ai.engagementTrigger, 'demand_pending',
      'the demand window is honest — no escalation stamp before the shut');
  }
});

test('fire seeds the wake blade behind a readable stone when the field carries one', () => {
  const h = makeHarness();
  const item = h.planItem('scissors_ambush');
  // The player fires 1500 wu off the global zone anchor, so the raw wake anchor lands ~840 wu
  // astern of that spot on whichever bearing the anchor takes. Ring the player's fire position
  // with readable stones exactly at that standoff distance so the scan finds one on the anchor
  // regardless of bearing — then the wing must sit in its lee.
  const px = item.zoneCenter.x - 1500, pz = item.zoneCenter.z;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    h.entityList.push(rock(
      px + Math.cos(a) * 840,
      pz + Math.sin(a) * 840,
      46, 9000 + k,
    ));
  }
  h.fireItem(item);
  const live = h.liveOf();
  assert.ok(live, 'the ambush fired');
  assert.ok(live.data.wakeSeed, 'the wake wing found its stone');
  const stone = h.entityList.find((r) => r.id === live.data.wakeSeed.rockId);
  assert.ok(stone, 'the recorded seed names a real stone');
  assert.ok(live.data.wakeSeed.rockRadius >= 14, 'the seed stone is readable cover, not gravel');
  const wake = h.shipsOfRole(live, 'flank');
  assert.ok(wake.length >= 2, 'the quiet blade still spawned');
  // The wing must sit on the stone's FAR side from the player: every hull clears the stone's
  // radius and no hull sits on the player's side of the stone.
  for (const e of wake) {
    const dHull = Math.hypot(e.pos.x - stone.pos.x, e.pos.z - stone.pos.z);
    assert.ok(dHull >= 46, `wake hull clears the stone's radius (d ${Math.round(dHull)})`);
    const alongStone = (e.pos.x - stone.pos.x) * (stone.pos.x - h.player.pos.x)
      + (e.pos.z - stone.pos.z) * (stone.pos.z - h.player.pos.z);
    assert.ok(alongStone > 0, 'the wing sits on the far side of the stone, player side is clear');
  }
});

test('refuse shuts both blades: the wake wing goes hot under cargo_extortion and the fight resolves', () => {
  const h = makeHarness();
  h.fireItem(h.planItem('scissors_ambush'));
  const live = h.liveOf();
  answer(h, live, 'refuse');
  assert.equal(live.phase, 'conflict', 'refusal springs the trap');
  for (const e of h.spawnedShips()) {
    assert.equal(e.data.ai.passive, false, 'every blade is off the leash');
    assert.equal(e.data.ai.motive, 'cargo_extortion');
    assert.equal(e.data.ai.engagementTrigger, 'explicit_refusal',
      'the engagement authority releases both blades on the recorded trigger');
  }
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.scissors_spring),
    'the shut line speaks');
  assert.ok(h.voiceLines().includes(ENCOUNTERS.scissors_ambush.telegraph),
    'the telegraph fires as the trap shuts — the wake is named out loud');
  // The fight is winnable: kill both blades and the encounter resolves, receipt and all.
  for (const e of h.spawnedShips()) e.alive = false;
  h.tickLive(200);
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved, 'the fight resolves');
  assert.equal(resolved.payload.outcome, 'cleared');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('SCISSORS SHUT'),
    `the aftermath receipt speaks (got ${receipt && receipt.payload.text})`);
});

test('opening on the quiet blade first earns the collapse line when the trap shuts', () => {
  const h = makeHarness();
  h.fireItem(h.planItem('scissors_ambush'));
  const live = h.liveOf();
  const wake = h.shipsOfRole(live, 'flank');
  assert.ok(wake.length >= 1, 'the quiet blade exists');
  h.state.simTime = (live.data.springAt - 4) + 6;
  h.dir._scriptEvent(live, 'playerHitSquad', { targetId: wake[0].id });
  assert.equal(live.phase, 'conflict', 'touching a blade springs the trap');
  assert.equal(live.data.tookWakeFirst, true, 'the read is recorded');
  assert.ok(h.voiceLines().includes('You took the back wing first — the scissors never closed.'),
    'the earned line speaks');
  // The trap still shut: both blades are committed under the honest trigger.
  for (const e of h.spawnedShips()) {
    assert.equal(e.data.ai.passive, false);
    assert.equal(e.data.ai.engagementTrigger, 'player_attack');
  }
});

test('pay parts both blades through the cargo writer and resolves paid', () => {
  const h = makeHarness();
  h.fireItem(h.planItem('scissors_ambush'));
  const live = h.liveOf();
  answer(h, live, 'pay');
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved && resolved.payload.outcome === 'paid', 'payment resolves the encounter paid');
  assert.ok((h.state.player.cargo.items.cmdty_consumer_goods | 0) < 10,
    'the cut physically left the hold through the cargo writer');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.scissors_paid),
    'the paid ack speaks — the gap opens for payers');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('CUT PAID'),
    `the paid receipt speaks (got ${receipt && receipt.payload.text})`);
});

test('silence at the deadline shuts the blades with ignored_demand', () => {
  const h = makeHarness();
  h.fireItem(h.planItem('scissors_ambush'));
  const live = h.liveOf();
  assert.ok(live.deadlineAt > 0, 'the offer runs on a clock');
  h.tickLive(live.deadlineAt + 1);
  assert.equal(live.phase, 'conflict', 'timeout springs the trap');
  const blade = h.spawnedShips()[0];
  assert.equal(blade.data.ai.engagementTrigger, 'ignored_demand',
    'silence stamps the honest trigger for the engagement authority');
});

test('run commits to the breakout — no teleport: the trap shuts, and real distance resolves escaped', () => {
  const h = makeHarness();
  h.fireItem(h.planItem('scissors_ambush'));
  const live = h.liveOf();
  answer(h, live, 'run');
  assert.equal(live.phase, 'conflict', 'choosing run shuts the trap — the wake was taken');
  assert.ok(!h.events.some((e) => e.name === 'encounter:resolved'),
    'run does not instantly resolve; the physical escape ring is the actual exit');
  assert.ok(barkSpoke(h.voiceLines(), ENCOUNTER_BARKS.scissors_run),
    'the run ack speaks — the wake was theirs before the haggle');
  // Now the physical breakout: put real distance on BOTH blades.
  h.player.pos = { x: h.player.pos.x + 4000, z: h.player.pos.z };
  h.tickLive(live.deadlineAt + 30);
  const resolved = h.events.find((e) => e.name === 'encounter:resolved');
  assert.ok(resolved && resolved.payload.outcome === 'escaped', 'clearing both blades resolves escaped');
  const receipt = h.events.find((e) => e.name === 'encounter:receipt');
  assert.ok(receipt && receipt.payload.text.startsWith('THREADED'),
    `the escape receipt speaks (got ${receipt && receipt.payload.text})`);
});
