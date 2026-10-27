// W-BOOKS-0-2 (build_map row 533): Books 0–2 play on the default route per
// design/expansion/06_CAMPAIGN_SCRIPT.md §34.7 — not as sidecar metadata but through live
// boards, events, and the missions-owned cursor.
//
// Drives: B0 mine → THE SKIM (kill feed + 12.4 t) → Pit dock (manifest zero, payment
// withheld); B1 alloy run contract → Scale 4 weigh (kesslerPod:weighed) → infested hauler
// (kills + CR-FEED feeds); B2 cinder board (kills + Rook delivery) → Compost Run
// (understory:gardenFed) → the Nest (encounter:resolved{shape:'the_nest'}) → the register
// contract on Elroy (scan → CIVILIAN — REGISTERED → force/custody → MEDICINE).
// Run: node --test test/w533-books-0-2.test.mjs

import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { addCargo } from '../src/systems/cargo.js';
import { combat as combatProto } from '../src/systems/combat.js';
import { aftermathWrecks as aftermathProto } from '../src/systems/aftermathWrecks.js';
import { createRookBooth } from '../src/systems/rookBooth.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { furnaceMouthGlobal } from '../src/missions/furnaceWorksite.js';
import { materializeAlienEcology, handleAlienEcologyEvent } from '../src/systems/alienEcology.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { isBeatStepsComplete, getBeatStepStatus } from '../src/story/campaign47a/index.js';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
  }
}

function makeHarness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.run = { ...(state.run || {}), kind: 'adventure' };
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0 };
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, type: 'ship', isPlayer: true, alive: true, team: 'player', pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, flags: {}, hull: 100 });
  state.entityList = [state.entities.get(1)];
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const popups = [];
  const skimResolved = [];
  const elroyResolved = [];
  const beatAdvances = [];
  bus.on('comms:popup', (p) => popups.push(p || {}));
  bus.on('story:skimResolved', (p) => skimResolved.push(p || {}));
  bus.on('story:elroyResolved', (p) => elroyResolved.push(p || {}));
  bus.on('story:beatAdvanced', (p) => beatAdvances.push(p || {}));
  bus.on('economy:grantCredits', (p) => {
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });

  let nextEntityId = 2; // The real owner never reuses a removed body's live handle.
  const helpers = {
    hash32, mulberry32,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const id = nextEntityId++;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity: (id) => {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      state.entityList = (state.entityList || []).filter((row) => row !== e);
      state.entities.delete(id);
    },
  };
  const missions = Object.assign({}, missionsProto);
  const story = Object.assign({}, storyProto);
  const aftermath = Object.assign({}, aftermathProto);
  // Exercise the public kill producer; this test is not a damage/physics simulation.
  const combat = Object.assign({}, combatProto, { state, bus, helpers });
  const rook = createRookBooth(), furnace = createFurnaceIntake();
  const systems = { missions, story, combat, aftermathWrecks: aftermath, rookBooth: rook, furnaceIntake: furnace };
  const registry = { get: (name) => systems[name] || null };
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  story._ensureState && story._ensureState(true);
  aftermath.init({ state, bus, helpers, registry });
  rook.init({ state, bus, helpers, registry });
  furnace.init({ state, bus, helpers, registry });
  // Same ecology functions called by world: real cast creation and death permanence,
  // limited to the published refinery site, not a manufactured clearance ledger.
  const ecologyWorld = { state, bus, helpers, registry, active: { dressing: [], pois: [] },
    _toGlobal: sectorLocalToGlobalForSector };
  bus.on('entity:killed', (p) => handleAlienEcologyEvent(ecologyWorld, 'entity:killed', p));
  return { state, bus, missions, story, helpers, popups, skimResolved, elroyResolved, beatAdvances,
    combat, aftermath, rook, furnace, ecologyWorld };
}

function acceptOffer(h, stationId, expectedTag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((row) => row && row.storyTag === expectedTag);
  assert.ok(offer, `missing offer ${expectedTag} at ${stationId} (have ${board.slots.map((r) => r.storyTag).filter(Boolean).join(',')})`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${expectedTag}`);
  const m = h.state.missions.active.find((row) => row.storyTag === expectedTag);
  assert.ok(m, `missing active mission ${expectedTag}`);
  return m;
}

function completePatrol(h, m) {
  h.state.world.currentSectorId = m.destSectorId;
  if (m.params.furnaceWorksiteVersion === 1) {
    materializeAlienEcology(h.ecologyWorld, { id: m.destSectorId }, h.ecologyWorld.active,
      [ALIEN_SITES.closed_refinery]);
  }
  h.bus.emit('sector:enter', { sectorId: m.destSectorId });
  h.missions.spawnTargetsForSector(m.destSectorId);
  h.missions._ensureMissionTargets(m);
  assert.ok(m.targetEntityIds.length > 0, `${m.storyTag} must materialize targets`);
  if (m.params.cinderRouteVersion === 1) {
    assert.equal(m.targetEntityIds.length, 3, 'exactly three real Cinder Wasps');
    for (const id of m.targetEntityIds) assert.equal(h.state.entities.get(id).data.lootTableId, 'wasp_swarmer');
  }
  if (m.params.furnaceWorksiteVersion === 1) assert.equal(m.targetEntityIds.length, 4, 'four real refinery mites');
  for (const id of [...m.targetEntityIds]) {
    const target = h.state.entities.get(id);
    h.combat.kill(target, h.state.playerId);
    assert.equal(target.alive, false, 'combat owns the death transition');
  }
  // Ecology runs after mission listeners here; reconcile its just-recorded durable deaths.
  h.missions._ensureMissionTargets(m);
}

function feedFurnaceLot(h, m, slot) {
  const lot = m.params.furnaceLots.find((row) => row.slot === slot);
  const pod = h.state.entities.get(lot.entityId);
  assert.ok(pod && pod.alive && pod.data.furnaceMissionId === m.id, 'real owned disposal pod');
  pod.pos = { ...furnaceMouthGlobal() };
  pod.vel = { x: 0, z: 0 };
  h.furnace.update();
  assert.equal(lot.received, true, 'intake emitted the canonical owned receipt');
  assert.equal(pod.alive, false);
}

function deliverCinderHull(h, m) {
  assert.equal(m.params.cinderRouteVersion, 1, 'new offers exercise the authored route, not legacy mode');
  assert.equal(m.objectiveProgress, 3);
  assert.equal(m.params.cinderMarkedWrecks.length, 3, 'real deaths produced canonical markers');
  h.bus.emit('rookWreck:delivered', { entityId: 9201 });
  assert.equal(m.status, 'active', 'legacy synthetic sale is not evidence for a new Cinder offer');
  assert.equal(m.params.rookDeliveries || 0, 0);
  const ref = m.params.cinderMarkedWrecks[0];
  const wreck = h.aftermath._resolveBoundWreck(ref.markerId);
  assert.ok(wreck && wreck.alive, 'recover the real aftermath hull');
  wreck.pos = { ...rookPadPosition() };
  wreck.vel = { x: 0, z: 0 };
  h.rook.update();
  assert.equal(m.params.cinderDeliveredMarkerId, ref.markerId);
  assert.equal(h.aftermath._markerById(ref.markerId), null, 'sale retires the same canonical material');
  assert.equal(wreck.alive, false);
  assert.equal(m.status, 'completed');
}


console.log('w533-books-0-2');

// ── BOOK ZERO: Cold Start — mine, the Skim, the Pit. ───────────────────────────
check('B0: mine → skim scene → dock plays Cold Start in order', () => {
  const h = makeHarness(47);
  const { state, bus, missions } = h;
  assert.equal(state.story.beatIndex, 0);
  const b0 = state.missions.active.find((m) => m.storyTag === 'campaign47a:b0:recovery');
  assert.ok(b0, 'cold-start contract installed');

  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(b0.params.sampleRecovered, true, 'sample aboard');
  assert.equal(state.story.beatIndex, 0);
  assert.equal(h.skimResolved.length, 0, 'skim has not fired on the spot');

  // The lane beat: 8 s later the unknown vessel takes exactly the 12.4 t.
  state.simTime = b0.params.sampleRecoveredAt + 8.1;
  missions.update(0.016, state);
  assert.equal(h.skimResolved.length, 1, 'story:skimResolved emitted on the lane');
  assert.equal(h.skimResolved[0].massT, 12.4);
  const feed = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(feed.includes('ESCORT-02 ELIMINATED'), 'kill feed runs');
  assert.ok(feed.includes('UNKNOWN VESSEL DEPARTED'), 'unknown vessel departs');
  assert.ok(feed.includes('12.4'), 'strain gauge reads the true mass');
  // The ambush site keeps its escort wrecks.
  const wrecks = state.entityList.filter((e) => e.data && e.data.contract47aSkim === true);
  assert.equal(wrecks.length, 3, 'escort wrecks persist as salvage');
  assert.equal(b0.params.skimResolved, true);
  assert.equal(state.story.beatIndex, 0, 'skim alone cannot close the book');

  // The Pit: manifest reads zero; payment withheld; the airlock speaks.
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const pit = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(pit.includes('SLOT01 TITANIUM ALLOY 00000KG'), 'manifest reads zero');
  assert.ok(pit.includes('PAYMENT WITHHELD'), 'the Pit withholds payment');
  assert.ok(pit.includes('THEY KNEW THE MASS.'), 'the airlock line lands');
  assert.equal(state.story.beatIndex, 1, 'mine → skim → dock advances to Honest Work');
  assert.equal(state.story.flags.contract_47a_skimmed, true);
});

check('B0: jumping the lane still resolves the Skim at the Pit (dock fallback)', () => {
  const h = makeHarness(48);
  const { state, bus } = h;
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.skimResolved.length, 1, 'skim resolved inline at dock');
  assert.equal(h.skimResolved[0].where, 'dock');
  assert.equal(state.story.beatIndex, 1);
});

// ── BOOK ONE: Honest Work — alloy run, Scale 4, the infested hauler. ───────────
function reachB1(h) {
  const { state, bus } = h;
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1);
}

check('B1: board posts the alloy run first, Scale 4 is world work, furnace detail last', () => {
  const h = makeHarness(49);
  const { state, bus } = h;
  reachB1(h);

  // The Helios board posts the sealed alloy run — not the furnace detail, not the old leg.
  const alloy = acceptOffer(h, 'station_helios', 'campaign47a:b1:alloy_run');
  assert.equal(alloy.type, 'cargo_delivery');
  assert.equal(alloy.params.silentRecat, true);

  // A premature weigh cannot record Scale 4 out of order.
  bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  let status = getBeatStepStatus(state, 1);
  assert.deepEqual(status.completed, [], 'ordered list rejects out-of-order weigh');

  // Deliver the crate at Tycho: the manifest re-categorizes silent, flatly logged.
  addCargo(state, 'cmdty_alloys', Math.max(1, alloy.params.qty || 6));
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  status = getBeatStepStatus(state, 1);
  assert.deepEqual(status.completed, ['alloy_run']);
  assert.equal(state.story.beatIndex, 1, 'alloy run alone cannot settle the book');
  const recat = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(recat.includes('MANIFEST RE-CODED'), 'the silent re-categorization is logged');

  // Scale 4: any weighed pod showing the plate's thumb records the variance.
  bus.emit('kesslerPod:weighed', { variance: false, massT: 6 });
  status = getBeatStepStatus(state, 1);
  assert.deepEqual(status.completed, ['alloy_run'], 'an honest read is not a variance');
  bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  status = getBeatStepStatus(state, 1);
  assert.deepEqual(status.completed, ['alloy_run', 'scale_4']);

  // Now the furnace detail posts at Tethys.
  const infested = acceptOffer(h, 'station_tethys', 'campaign47a:b1:infested');
  assert.equal(infested.type, 'patrol_clear');
  assert.equal(infested.params.furnaceFeedsNeeded, 3);

  // Clear the mites — kills alone leave the disposal leg owed.
  completePatrol(h, infested);
  assert.equal(infested.status, 'active', 'kills alone do not settle the furnace detail');
  // Unbound old receipts are negatives; actual finite disposal pods must cross CR-FEED.
  bus.emit('furnace:fed', { entityId: 9001 });
  assert.equal(infested.params.furnaceFeeds || 0, 0);
  feedFurnaceLot(h, infested, 0);
  feedFurnaceLot(h, infested, 1);
  assert.equal(infested.status, 'active');
  feedFurnaceLot(h, infested, 2);
  assert.equal(infested.status, 'completed');
  assert.equal(state.story.beatIndex, 2, 'alloy → scale 4 → furnace advances to First Blood');
  assert.equal(state.story.flags.embodied_route, 'book');
});

// ── BOOK TWO: First Blood — cinder, compost, nest, the register. ───────────────
function reachB2(h) {
  reachB1(h);
  const { state, bus } = h;
  const alloy = acceptOffer(h, 'station_helios', 'campaign47a:b1:alloy_run');
  addCargo(state, 'cmdty_alloys', Math.max(1, alloy.params.qty || 6));
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  const infested = acceptOffer(h, 'station_tethys', 'campaign47a:b1:infested');
  completePatrol(h, infested);
  for (let i = 0; i < 3; i++) feedFurnaceLot(h, infested, i);
  assert.equal(state.story.beatIndex, 2);
}

check('B2: cinder board → Compost Run → the Nest → the register on Elroy', () => {
  const h = makeHarness(50);
  const { state, bus } = h;
  reachB2(h);

  const cinder = acceptOffer(h, 'station_tethys', 'campaign47a:b2:cinder');
  assert.equal(cinder.type, 'patrol_clear');
  assert.equal(cinder.params.rookDeliveryNeeded, 1);
  completePatrol(h, cinder);
  assert.equal(cinder.status, 'active', 'the wreck still owes Rook a delivery');
  deliverCinderHull(h, cinder);
  assert.equal(cinder.status, 'completed');
  let status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board']);
  assert.equal(state.story.beatIndex, 2);

  // NPC-fed biomass must not count for the player.
  bus.emit('understory:gardenFed', { byPlayer: false, gardenId: 'g1', fedMass: 20 });
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board'], 'garden feed must be by the player');
  bus.emit('understory:gardenFed', { byPlayer: true, gardenId: 'g1', fedMass: 20 });
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost']);

  // Only the real Nest counts.
  bus.emit('encounter:resolved', { shape: 'some_other_fight', sectorId: 'sector_charon_expanse' });
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost'], 'an unrelated fight is not the Nest');
  bus.emit('encounter:resolved', { shape: 'the_nest', encounterId: 'enc_nest_1', sectorId: 'sector_charon_expanse' });
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost', 'nest']);

  // The register contract posts last.
  const elroy = acceptOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(elroy.type, 'bounty_hunt');
  assert.equal(elroy.storyTarget.id, 'npc_elroy');
  // Scan first — UNKNOWN resolves to the filed civilian hull.
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const targetId = elroy.targetEntityIds[0];
  const target = state.entities.get(targetId);
  target.pos = { x: 5, z: 0 };
  bus.emit('scan:completed', { targetId });
  assert.equal(elroy.params.investigationStage, 'identified', 'the register resolves');
  // Fire to close the tag — force outcome, register + medicine lines.
  h.combat.kill(target, state.playerId);
  assert.equal(h.elroyResolved.length, 1);
  assert.equal(h.elroyResolved[0].outcome, 'force');
  assert.equal(state.story.flags.elroy_outcome, 'force');
  const registerText = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(registerText.includes('CIVILIAN VESSEL — REGISTERED'), 'the IFF flicker lands');
  assert.ok(registerText.includes('THEY WERE CARRYING MEDICINE'), 'the second kill-feed line lands');
  assert.equal(state.story.beatIndex, 3, 'cinder → compost → nest → elroy closes First Blood');
  assert.ok(isBeatStepsComplete(state, 2));
});

check('B2: the custody reel resolves Elroy without the kill', () => {
  const h = makeHarness(51);
  const { state, bus } = h;
  reachB2(h);
  const cinder = acceptOffer(h, 'station_tethys', 'campaign47a:b2:cinder');
  completePatrol(h, cinder);
  deliverCinderHull(h, cinder);
  bus.emit('understory:gardenFed', { byPlayer: true, gardenId: 'g1', fedMass: 20 });
  bus.emit('encounter:resolved', { shape: 'the_nest', sectorId: 'sector_charon_expanse' });
  const elroy = acceptOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const targetId = elroy.targetEntityIds[0];
  state.entities.get(targetId).pos = { x: 5, z: 0 };
  bus.emit('scan:completed', { targetId });
  bus.emit('tether:reel', { actorId: state.playerId, targetId, after: 50 });
  assert.equal(h.elroyResolved[0].outcome, 'custody');
  assert.equal(state.story.flags.elroy_outcome, 'custody');
  assert.equal(state.story.beatIndex, 3);
});

console.log(failures === 0 ? 'w533-books-0-2: all checks passed' : `w533-books-0-2: ${failures} FAILURES`);
if (failures > 0) process.exit(1);
