// CR situation 1212 — THE CLEAN SHEET (law/piracy pressure: the field scrub). The fixer's
// heat scrub existed only as a docked bar purchase at six fence stations; a WANTED pilot in
// open water had no door. This beat is the Quiet's field desk: a painted-over customs hull
// selling the owner's own `heat:scrubRequested` service on a burner band while a real SCN
// sweep pair closes on the ping — the offer window is the sweep's flight time.
//
// Everything routes through live owners: heat.js alone writes player.heat (the encounter only
// emits the same request intent the fence desk emits at the bar), economy owns the wallet
// (verified charge, honest refund on a refused scrub), factions own the rep record, the
// situation kit owns the durable outcome, and the law's own witness machinery decides what a
// shot at the desk costs when the sweep is close enough to see it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { heat, heatLevelFor } from '../src/systems/heat.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { CLEAN_SHEET, runtime } from '../src/data/encounters/1212-the-clean-sheet.js';
import { fenceScrubCostCr } from '../src/data/fences.js';
import { situationMemory } from '../src/systems/crSituationKit.js';

const SEED = 4242;
const SECTOR = 'sector_sker_haven';
const ANCHOR = Object.freeze({ x: 5200, z: -3100 });
const SHAPE = 'the_clean_sheet';
const HEAT_AT_TWO = 0.3;      // level 2 — BOUNTY band; level 3+ is the nets band the owner's floor refuses

async function boot(opts = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, economy, factions, heat,
      'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 140, z: ANCHOR.z - 140 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = { stations: [], fields: [], hazards: [], pois: [], gates: [] };
  state.player.credits = 6000;
  state.player.heat = opts.heat != null ? opts.heat : HEAT_AT_TWO;
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:voice', 'encounter:choiceOffered', 'encounter:receipt',
    'economy:grantCredits', 'faction:repDelta', 'news:publish', 'heat:changed',
  ]) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  if (opts.prior) {
    situationMemory(state).completed[SHAPE] = {
      outcome: opts.prior, at: 10, tick: 600, encounterId: 'prior_clean_sheet',
      sectorId: SECTOR, facts: {}, visits: 1,
    };
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_clean_sheet', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'outlaw_zone', zoneRadius: 900, force: true,
  });
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE) || null;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  return { host, state, bus, director, live, res, w: live && live.data.cleanSheet, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const quietReps = (h) => h.events.filter((e) => e.name === 'faction:repDelta' && e.p.factionId === 'faction_quiet')
  .map((e) => ({ delta: e.p.delta, reason: e.p.reason }));
const voices = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text).join('\n');
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });
const choose = (h, id) => h.host.withFeatures(() => h.bus.emit('encounter:choose', { encounterId: h.live.id, choiceId: id }));
const hit = (h, id) => h.host.withFeatures(() => h.bus.emit('combat:damage', {
  attackerId: h.state.playerId, targetId: id, applied: 20,
}));
const kill = (h, id, byPlayer = true) => {
  const e = h.ent(id);
  e.alive = false;
  h.host.withFeatures(() => h.bus.emit('entity:killed', {
    id, killerId: byPlayer ? h.state.playerId : 999999, type: 'ship', pos: { ...e.pos },
  }));
};

test('the clean sheet is registered as a Quiet field-desk trade beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.tier, 'minor');
  assert.equal(enc.deck, 'civilian');
  assert.deepEqual([...enc.zoneTypes], ['ambush_lane', 'outlaw_zone', 'derelict_field']);
  assert.equal(enc.shape.situation, 'trade');
  assert.equal(enc.shape.actor, 'faction_quiet');
  for (const outcome of ['sheet_bought', 'walked_away', 'window_closed', 'desk_refused',
    'wire_refused', 'shot_the_desk', 'went_loud', 'went_quiet']) {
    assert.ok(enc.receipts[outcome], `receipt for ${outcome}`);
  }
  // The desk only hails a registry the law is hunting.
  assert.equal(runtime.fireReady({ player: { heat: 0 } }), false, 'a clean sheet has nothing to buy');
  assert.equal(runtime.fireReady({ player: { heat: HEAT_AT_TWO } }), true);
});

test('a clean ledger never gets the hail — the desk aborts before it exists', async () => {
  const h = await boot({ heat: 0 });
  try {
    assert.equal(h.res.ok, false, 'the fire aborted on a clean ledger');
    assert.equal(h.live, null, 'no live record survived the abort');
    assert.ok(outcomes(h).includes('aborted:clean_ledger'), 'the abort is on the wire');
  } finally { h.host.dispose(); }
});

test('the scene stands up: a painted desk hull, a burner buoy, and the sweep inbound on the ping', async () => {
  const h = await boot();
  try {
    assert.equal(h.res.ok, true, JSON.stringify(h.res));
    const w = h.w;
    const clerk = h.ent(w.clerkId);
    assert.ok(clerk && clerk.alive !== false, 'the desk hull is a live body');
    assert.equal(clerk.factionId, 'faction_quiet');
    assert.equal(clerk.data.ai.passive, true, 'a paper hull holds the lane, not a fight');
    assert.equal(clerk.data.ai.activity.kind, 'loiter');
    assert.equal(clerk.data.ai.roe, 'hold_fire');
    assert.match(clerk.data.scanLabel, /PLATES PAINTED OVER/);

    const relay = h.ent(w.relayId);
    assert.ok(relay, 'the burner buoy is a real body on the field');
    assert.match(relay.data.scanLabel, /BURNER RELAY/);

    const sweep = w.sweepIds.map((id) => h.ent(id));
    assert.equal(sweep.length, 2, 'two interceptors answered the ping');
    for (const s of sweep) {
      assert.equal(s.factionId, 'faction_scn');
      assert.equal(s.data.ai.lawful, true, 'the sweep is real lawful eyes');
      assert.equal(s.data.lawWitness, true);
      assert.equal(s.data.ai.activity.kind, 'patrol_route', 'inbound on the bearing');
      assert.equal(s.data.ai.roe, 'lawful_wanted_only', 'the law\'s own posture');
      const dist = Math.hypot(s.pos.x - ANCHOR.x, s.pos.z - ANCHOR.z);
      assert.ok(dist > CLEAN_SHEET.sweepCloseWu, `the sweep spawned outside the close read (${dist.toFixed(0)})`);
    }

    const price = Math.round(fenceScrubCostCr(2, 0) * CLEAN_SHEET.fieldMarkup);
    assert.equal(w.priceCr, price, 'the field book prices the bar\'s own figure with the markup');
    assert.equal(h.live.phase, 'offer');
    const offer = h.events.find((e) => e.name === 'encounter:choiceOffered');
    assert.ok(offer, 'the wire opened an offer');
    assert.ok(offer.p.options.some((o) => o.id === 'buy' && o.available), 'buy is on the wire and payable');
    assert.ok(offer.p.options.some((o) => o.id === 'walk'), 'the pass rides the same wire');
    assert.match(voices(h), /QUIET DESK/);
  } finally { h.host.dispose(); }
});

test('buy the scrub: the heat owner writes the line off, the desk folds and runs', async () => {
  const h = await boot();
  try {
    const before = h.state.player.credits;
    const levelBefore = heatLevelFor(h.state.player.heat);
    assert.equal(levelBefore, 2);
    choose(h, 'buy');
    // The owner's own writer moved exactly one level off the sheet.
    assert.equal(heatLevelFor(h.state.player.heat), 1, 'one line off — the fixer\'s own measure');
    assert.equal(h.state.player.credits, before - h.w.priceCr, 'the field price cleared the wallet');
    assert.equal(h.state.player.heatScrubbed.the_clean_sheet, h.state.simTime,
      'the desk holds its own book under the owner\'s per-desk cooldown law');
    assert.ok(quietReps(h).some((r) => r.delta === CLEAN_SHEET.quietRepSale), 'the Quiet writes a paying name');
    assert.equal(h.live.phase, 'sold');
    // The desk packs the wire and physically bolts before the sweep lands.
    h.state.simTime += CLEAN_SHEET.packUpS + 1;
    h.host.step(70);
    const clerk = h.ent(h.w.clerkId);
    assert.equal(clerk.data.ai.activity.kind, 'transit', 'the desk is running');
    h.state.simTime += 31;
    h.host.step(70);
    assert.deepEqual(outcomes(h), ['sheet_bought']);
    assert.equal(memory(h).outcome, 'sheet_bought');
    assert.equal(memory(h).facts.cooled > 0, true);
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the quiet registry');
    assert.ok(h.events.some((e) => e.name === 'heat:changed'), 'the HUD heard the owner\'s write');
  } finally { h.host.dispose(); }
});

test('a second scribble inside the desk\'s own hour is refused and refunded — the owner\'s cooldown law', async () => {
  const h = await boot();
  try {
    // The desk already wrote this registry once: the owner's per-desk stamp is on the player.
    h.state.player.heatScrubbed = { the_clean_sheet: h.state.simTime };
    const before = h.state.player.credits;
    const heatBefore = h.state.player.heat;
    choose(h, 'buy');
    assert.equal(h.state.player.heat, heatBefore, 'no second line moved');
    assert.equal(h.state.player.credits, before, 'the refusal refunded the charge');
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['desk_refused']);
    assert.equal(memory(h).facts.refusal, 'cooldown');
    assert.match(voices(h), /wrote your registry once|band needs to cool/);
  } finally { h.host.dispose(); }
});

test('shoot the desk and the Quiet\'s wire keeps the name — the law prices what its eyes saw', async () => {
  const h = await boot();
  try {
    const clerk = h.ent(h.w.clerkId);
    hit(h, h.w.clerkId);
    h.host.step(4);
    assert.equal(h.live.phase, 'conflict', 'a live gun ends the offer');
    assert.equal(clerk.data.ai.activity.kind, 'transit', 'the paper hull runs');
    assert.ok(quietReps(h).some((r) => r.delta === CLEAN_SHEET.shotRep
      && r.reason === 'the_clean_sheet_shot_the_desk'), 'the wire keeps the shot');
    kill(h, h.w.clerkId, true);
    runUntilResolved(h, 60);
    assert.deepEqual(outcomes(h), ['shot_the_desk']);
    assert.equal(memory(h).outcome, 'shot_the_desk');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the dead letter made the wire');
  } finally { h.host.dispose(); }
});

test('a registry that shot a desk is a dead letter — the wire refuses without opening an offer', async () => {
  const h = await boot({ prior: 'shot_the_desk' });
  try {
    assert.equal(h.live.phase, 'refused');
    assert.equal(h.w.burned, true);
    assert.ok(!h.events.some((e) => e.name === 'encounter:choiceOffered'),
      'no offer opens for a dead-letter registry');
    assert.match(voices(h), /dead letter|buries its clerks/);
    h.state.simTime += CLEAN_SHEET.refusedHoldS + 1;
    h.host.step(70);
    const clerk = h.ent(h.w.clerkId);
    assert.equal(clerk.data.ai.activity.kind, 'transit', 'the desk burns the channel and leaves');
    h.host.step(70);
    assert.deepEqual(outcomes(h), ['wire_refused']);
    assert.equal(memory(h).outcome, 'wire_refused');
  } finally { h.host.dispose(); }
});

test('the sweep landing on the ping closes the window — the desk does not wait to be read', async () => {
  const h = await boot();
  try {
    const sweep = h.w.sweepIds.map((id) => h.ent(id));
    // Fly the lead interceptor onto the field like its patrol route would.
    sweep[0].pos.x = ANCHOR.x + CLEAN_SHEET.sweepCloseWu - 60;
    sweep[0].pos.z = ANCHOR.z;
    h.host.step(70);
    assert.deepEqual(outcomes(h), ['window_closed']);
    const clerk = h.ent(h.w.clerkId);
    assert.equal(clerk.data.ai.activity.kind, 'transit', 'the desk ran before the sweep could read it');
    const relay = h.ent(h.w.relayId);
    assert.ok(relay.data.despawnAt != null, 'the burner buoy burned');
    assert.match(voices(h), /sweep is on the ping/);
    assert.equal(memory(h).facts.sweepClose, true);
  } finally { h.host.dispose(); }
});

test('fly on: the paper keeps, the desk keeps, and the record says you walked', async () => {
  const h = await boot();
  try {
    const heatBefore = h.state.player.heat;
    const creditsBefore = h.state.player.credits;
    choose(h, 'walk');
    assert.equal(h.state.player.heat, heatBefore, 'the sheet is untouched');
    assert.equal(h.state.player.credits, creditsBefore, 'nothing moved on the wire');
    assert.deepEqual(outcomes(h), ['walked_away']);
    assert.equal(memory(h).outcome, 'walked_away');
  } finally { h.host.dispose(); }
});
