// W-BOOKS-0-2 (build_map row 533): Books 0–2 play on the default route per
// design/expansion/06_CAMPAIGN_SCRIPT.md §34.7 — not as sidecar metadata but through live
// boards, events, and the missions-owned cursor.
//
// Drives: B0 mine → THE SKIM (kill feed + 12.4 t) → Pit dock (manifest zero, payment
// withheld); B1 alloy run contract → Scale 4 weigh (kesslerPod:weighed) → infested hauler
// (kills + CR-FEED feeds); B2 cinder board (kills + Rook delivery) → Compost Run
// (actual player-fed visible garden growth) → the Nest (actual705 admission and clear/escape receipt) → the register
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
import { understoryGardens as understoryProto } from '../src/systems/faction_understory.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { UNDERSTORY_RECEIVER } from '../src/data/understoryReceiver.js';
import { encounterDirector as encounterDirectorProto } from '../src/systems/encounterDirector.js';
import { runtime as nestRuntime } from '../src/data/encounters/705-the-nest.js';
import { tickNestVisit } from '../src/systems/nestVisit.js';
import { NEST_VISIT, nestApproach } from '../src/data/nestVisit.js';
import { WEAPONS } from '../src/data/weapons.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { ROOK_BOOTH } from '../src/data/rook.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { furnaceMouthGlobal } from '../src/missions/furnaceWorksite.js';
import { createKesslerScale, kesslerScaleSpec } from '../src/systems/kesslerScale.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { materializeAlienEcology, handleAlienEcologyEvent } from '../src/systems/alienEcology.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { isBeatStepsComplete, getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { createToasts } from '../src/ui/toasts.js';
import { openingInstructionSolo } from '../src/ui/hudAttention.js';
import { installDom } from './toast-dom-fixture.mjs';

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
  const toasts = [];
  const skimResolved = [];
  const elroyResolved = [];
  const beatAdvances = [];
  bus.on('comms:popup', (p) => popups.push(p || {}));
  bus.on('toast', (p) => toasts.push(p || {}));
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
  const understory = Object.assign({}, understoryProto);
  // Exercise the public kill producer; this test is not a damage/physics simulation.
  const combat = Object.assign({}, combatProto, { state, bus, helpers });
  const rook = createRookBooth(), furnace = createFurnaceIntake();
  const clauses = Object.assign({}, contractClausesSystem);
  const systems = { missions, story, combat, aftermathWrecks: aftermath, rookBooth: rook, furnaceIntake: furnace, understoryGardens: understory, contractClauses: clauses };
  const registry = { get: (name) => systems[name] || null };
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  story._ensureState && story._ensureState(true);
  aftermath.init({ state, bus, helpers, registry });
  rook.init({ state, bus, helpers, registry });
  furnace.init({ state, bus, helpers, registry });
  understory.init({ state, bus, helpers, registry });
  clauses.init({ state, bus, helpers, registry });
  // Same ecology functions called by world: real cast creation and death permanence,
  // limited to the published refinery site, not a manufactured clearance ledger.
  const ecologyWorld = { state, bus, helpers, registry, active: { dressing: [], pois: [] },
    _toGlobal: sectorLocalToGlobalForSector };
  bus.on('entity:killed', (p) => handleAlienEcologyEvent(ecologyWorld, 'entity:killed', p));
  return { state, bus, missions, story, helpers, popups, skimResolved, elroyResolved, beatAdvances,
    combat, aftermath, rook, furnace, understory, ecologyWorld, systems, registry, toasts };
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


function feedReceivingGarden(h, m) {
  // The same authored receiver exists on the ordinary Charon route without an Understory kill.
  h.understory.update(1 / 60, h.state);
  const garden = h.state.entityList.find(e => e.alive !== false
    && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  assert.ok(garden, 'the real authored receiving garden is present');
  const wreck = m.params.cinderMarkedWrecks.map(ref => h.aftermath._resolveBoundWreck(ref.markerId))
    .find(e => e && e.alive !== false);
  assert.ok(wreck, 'feed one surviving actual Cinder hull, not a synthetic garden event');
  const markerId = wreck.data.markerId;
  const credits = h.state.player.credits;
  wreck.pos = { ...garden.pos };
  wreck.vel = { x: 0, z: 0 };
  h.state.player.tether = { active: true, targetId: wreck.id };
  h.understory.update(1 / 60, h.state);
  h.state.player.tether = null;
  assert.equal(wreck.alive, false, 'the garden actually consumed the bound hull');
  assert.equal(h.aftermath._markerById(markerId), null, 'the eaten canonical mass cannot reappear or sell');
  assert.equal(garden.data.gardenStage, 2, 'the first real 16t feed visibly grows initial52 to61.6');
  assert.equal(garden.data.gardenFirstPlayerGrowth.fedMass, 16);
  assert.equal(h.state.player.credits, credits, 'first growth is not the separate240t payout');
}

function showSkimCueDuringOpening(h, resolve) {
  const { state, bus } = h;
  state.onboarding = { ...(state.onboarding || {}), active: true, finished: false, startedAt: 10 };
  const dom = installDom();
  const presenter = createToasts({ state, bus });
  let skimLiveCopy = '';
  bus.on('toast', (payload) => {
    if (payload && typeof payload.text === 'string' && payload.text.startsWith('Unknown Black Line ship')) {
      skimLiveCopy = dom.toastLive.textContent;
    }
  });
  try {
    assert.equal(openingInstructionSolo(state), true, 'opening onboarding still owns its instruction');
    resolve();
    const cards = dom.toasts.children.filter((card) => card.classList.contains('sf-toast')
      && card.textContent.startsWith('Unknown Black Line ship'));
    assert.equal(cards.length, 1, 'the actual toast presenter renders one Skim cue');
    assert.equal(skimLiveCopy, cards[0].textContent, 'the exact cue reaches the polite live region when emitted');
    assert.doesNotMatch(cards[0].textContent, /save|continue/i, 'the cue makes no Save or Continue promise');
    return cards[0].textContent;
  } finally {
    presenter.destroy();
    dom.restore();
  }
}

function liveSkimWrecks(state) {
  return state.entityList.filter((entity) => entity && entity.alive !== false
    && state.entities.get(entity.id) === entity
    && entity.type === 'wreck' && entity.data && entity.data.contract47aSkim === true
    && entity.data.salvagePool && Number(entity.data.salvagePool.cmdty_alloys) === 1);
}

function prepareB0Skim(h) {
  const { state, bus, missions } = h;
  const b0 = state.missions.active.find((m) => m && m.storyTag === 'campaign47a:b0:recovery');
  assert.ok(b0, 'cold-start contract installed');
  assert.ok(missions.trackMission(b0.id, { silent: true }), 'the opening recovery contract can be tracked');
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(b0.params.sampleRecovered, true, 'sample aboard');
  state.simTime = b0.params.sampleRecoveredAt + 8.1;
  return b0;
}


console.log('w533-books-0-2');

// ── BOOK ZERO: Cold Start — mine, the Skim, the Pit. ───────────────────────────
check('B0: mine → skim scene → dock plays Cold Start in order', () => {
  const h = makeHarness(47);
  const { state, bus, missions } = h;
  assert.equal(state.story.beatIndex, 0);
  const b0 = state.missions.active.find((m) => m.storyTag === 'campaign47a:b0:recovery');
  assert.ok(b0, 'cold-start contract installed');
  assert.ok(missions.trackMission(b0.id, { silent: true }), 'the opening recovery contract can be tracked');
  assert.equal(state.ui.trackedMissionId, b0.id, '47-A owns the tracked mission slot');

  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(b0.params.sampleRecovered, true, 'sample aboard');
  assert.equal(state.story.beatIndex, 0);
  assert.equal(h.skimResolved.length, 0, 'skim has not fired on the spot');

  // The lane beat: 8 s later the unknown vessel takes exactly the 12.4 t.
  state.simTime = b0.params.sampleRecoveredAt + 8.1;
  state.onboarding = { ...(state.onboarding || {}), active: true, finished: false, startedAt: 10 };
  const dom = installDom();
  const toastPresenter = createToasts({ state, bus });
  try {
    assert.equal(openingInstructionSolo(state), true, 'the first-flight onboarding still owns its opening instruction');
    missions.update(0.016, state);
    const visibleCue = dom.toasts.children.filter((card) => card.classList.contains('sf-toast')
      && card.textContent.startsWith('Unknown Black Line ship'));
    assert.equal(visibleCue.length, 1, 'the real toast presenter shows one immediate salvage cue during onboarding');
    assert.equal(visibleCue[0].textContent, h.toasts.find((p) => /Unknown Black Line ship/.test(p.text || '')).text,
      'the displayed copy matches the mission-owned toast');
    assert.equal(dom.toastLive.textContent, visibleCue[0].textContent,
      'the same short cue reaches the polite live region');
    assert.doesNotMatch(visibleCue[0].textContent, /save|continue/i,
      'the cue makes no Save or Continue promise');
    dom.advance(7100);
    toastPresenter.tick();
    assert.ok(visibleCue[0].classList.contains('sf-toast--out'),
      'the receipt enters its normal fade-out after its seven-second TTL');
  } finally {
    toastPresenter.destroy();
    dom.restore();
  }
  assert.equal(h.skimResolved.length, 1, 'story:skimResolved emitted on the lane');
  assert.equal(h.skimResolved[0].massT, 12.4);
  const feed = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(feed.includes('ESCORT-02 ELIMINATED'), 'kill feed runs');
  assert.ok(feed.includes('UNKNOWN VESSEL DEPARTED'), 'unknown vessel departs');
  assert.ok(feed.includes('12.4'), 'strain gauge reads the true mass');
  assert.ok(feed.includes('CARGO DRONE 03 LOST'), 'the loss beat includes the cargo drone');
  // The ambush site keeps its escort wrecks.
  const wrecks = state.entityList.filter((e) => e.data && e.data.contract47aSkim === true);
  assert.equal(wrecks.length, 3, 'escort wrecks persist as salvage');
  assert.ok(wrecks.every((wreck) => wreck.data.salvagePool?.cmdty_alloys === 1),
    'each casualty leaves its existing one-alloy physical salvage opportunity');
  const salvageToast = h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || ''));
  assert.equal(salvageToast.length, 1, 'the optional detour is surfaced immediately, once');
  assert.equal(salvageToast[0].text.length, 102, 'the full salvage cue stays within its 102-character budget');
  assert.match(salvageToast[0].text, /Unknown Black Line ship.*12\.4 t.*escorts and drone lost.*optional salvage: 3 wrecks, 1 alloy each/i);
  assert.equal(salvageToast[0].ttl, 7, 'the live cue is a transient receipt');
  assert.equal(b0.status, 'active', 'salvage remains optional; 47-A still needs its Helios return');
  const creditsBeforeRepeat = state.player.credits;
  missions.update(0.016, state);
  assert.equal(h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length, 1,
    'a repeated tick does not replay the contact');
  assert.equal(h.popups.some((p) => /optional salvage: 3 wrecks/i.test(p.text || '')), false,
    'the salvage cue is not duplicated in the attention-gated story comms feed');
  assert.equal(state.player.credits, creditsBeforeRepeat, 'the contact grants no money');
  assert.equal(state.story.beatIndex, 0, 'the optional opportunity does not advance the book');
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

check('B0: dock fallback presents only salvage wrecks that survived a spawn throw', () => {
  const h = makeHarness(48);
  const { state, bus, missions } = h;
  const b0 = prepareB0Skim(h);
  const spawn = h.helpers.spawnEntity;
  let attempts = 0;
  h.helpers.spawnEntity = (spec) => {
    attempts += 1;
    if (attempts === 1) throw new Error('isolated pre-spawn failure');
    if (attempts === 2) {
      spawn(spec);
      throw new Error('isolated post-spawn failure');
    }
    return spawn(spec);
  };
  const cue = showSkimCueDuringOpening(h, () => bus.emit('dock:docked', { stationId: 'station_helios' }));
  assert.equal(attempts, 3, 'wreck spawning continues after pre- and post-spawn failures');
  assert.equal(h.skimResolved.length, 1, 'skim resolved inline at dock');
  assert.equal(h.skimResolved[0].where, 'dock');
  assert.match(cue, /Optional salvage: 2 wrecks, 1 alloy each\./);
  assert.equal(liveSkimWrecks(state).length, 2, 'only two live salvage wrecks materialized');
  assert.equal(state.story.beatIndex, 1, 'the dock story beat resolves after salvage spawn failures');
  assert.equal(missions._resolveContract47aSkim(b0, 'dock'), false, 'the latched dock fallback cannot replay');
  assert.equal(attempts, 3, 'a repeated resolution does not retry uncertain spawns');
  assert.equal(h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length, 1);
  assert.equal(liveSkimWrecks(state).length, 2, 'a repeated resolution grants no duplicate salvage');
});

check('B0: an absent spawn helper omits the salvage claim but resolves the story', () => {
  const h = makeHarness(53);
  const { state, bus, missions } = h;
  const b0 = prepareB0Skim(h);
  h.helpers.spawnEntity = null;
  const cue = showSkimCueDuringOpening(h, () => bus.emit('dock:docked', { stationId: 'station_helios' }));
  assert.equal(h.skimResolved.length, 1, 'the authored story still resolves');
  assert.equal(h.skimResolved[0].where, 'dock');
  assert.match(cue, /Unknown Black Line ship.*12\.4 t.*Escorts and drone lost\./);
  assert.doesNotMatch(cue, /salvage|wreck|alloy/i, 'zero materialized wrecks means no salvage promise');
  assert.equal(liveSkimWrecks(state).length, 0);
  assert.equal(state.story.beatIndex, 1, 'the dock story beat still advances');
  const toastCount = h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length;
  assert.equal(missions._resolveContract47aSkim(b0, 'dock'), false);
  assert.equal(h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length, toastCount,
    'the zero-wreck contact does not replay');
  assert.equal(liveSkimWrecks(state).length, 0, 'the missing helper cannot create duplicate rewards');
});

check('B0: null spawn returns tailor lane salvage copy to one real wreck', () => {
  const h = makeHarness(54);
  const { state, missions } = h;
  const b0 = prepareB0Skim(h);
  const spawn = h.helpers.spawnEntity;
  let attempts = 0;
  h.helpers.spawnEntity = (spec) => {
    attempts += 1;
    if (attempts < 3) return null;
    return spawn(spec);
  };
  const cue = showSkimCueDuringOpening(h, () => missions.update(0.016, state));
  assert.equal(attempts, 3, 'null results do not stop later wreck attempts');
  assert.equal(h.skimResolved.length, 1);
  assert.equal(h.skimResolved[0].where, 'lane');
  assert.match(cue, /Optional salvage: 1 wreck, 1 alloy\./);
  assert.equal(liveSkimWrecks(state).length, 1);
  missions.update(0.016, state);
  assert.equal(h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length, 1,
    'a repeated lane tick cannot replay the cue');
  assert.equal(liveSkimWrecks(state).length, 1, 'a repeated lane tick cannot duplicate salvage');
  assert.equal(state.player.credits, 5000, 'the optional salvage cue grants no credits');
  assert.equal(b0.params.skimResolved, true);
});

check('B0: unregistered, dead, map-only, list-only, and recycled values are not salvage', () => {
  const h = makeHarness(55);
  const { state, missions } = h;
  prepareB0Skim(h);
  const spawn = h.helpers.spawnEntity;
  let attempts = 0;
  let recycledId = null;
  h.helpers.spawnEntity = (spec) => {
    attempts += 1;
    if (attempts === 1) return { id: 9001, alive: true, ...spec };
    if (attempts === 2) {
      const dead = spawn(spec);
      dead.alive = false;
      return dead;
    }
    const stale = spawn(spec);
    recycledId = stale.id;
    state.entities.set(stale.id, { ...stale, data: structuredClone(stale.data) });
    const mapOnly = { id: 9002, alive: true, ...spec, data: structuredClone(spec.data) };
    const listOnly = { id: 9003, alive: true, ...spec, data: structuredClone(spec.data) };
    state.entities.set(mapOnly.id, mapOnly);
    state.entityList.push(listOnly);
    return stale;
  };
  const cue = showSkimCueDuringOpening(h, () => missions.update(0.016, state));
  assert.equal(attempts, 3);
  assert.equal(h.skimResolved.length, 1, 'invalid physical props do not suppress the story receipt');
  assert.doesNotMatch(cue, /salvage|wreck|alloy/i, 'invalid physical props do not promise salvage');
  assert.equal(liveSkimWrecks(state).length, 0, 'only live, map-registered, list-backed wrecks count');
  assert.ok(recycledId != null);
  assert.notEqual(state.entities.get(recycledId), state.entityList.find((entity) => entity.id === recycledId),
    'a recycled handle cannot validate the stale entity-list entry');
  missions.update(0.016, state);
  assert.equal(attempts, 3, 'the latched story beat does not retry questionable spawns');
  assert.equal(h.toasts.filter((p) => /Unknown Black Line ship/.test(p.text || '')).length, 1);
  assert.equal(liveSkimWrecks(state).length, 0);
});

// ── BOOK ONE: Honest Work — alloy run, Scale 4, the infested hauler. ───────────
function reachB1(h) {
  const { state, bus } = h;
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1);
}

function weighOwnCargoAtScale4(h) {
  const { state, bus, helpers } = h;
  state.world.currentSectorId = KESSLER_SCALE.sectorId;
  const scale = createKesslerScale();
  scale.init({ state, bus, helpers });
  const weighed = [];
  bus.on('kesslerPod:weighed', (payload) => weighed.push(payload || {}));
  const pod = spawnJettisonedCargoPod(state, {
    pos: kesslerScaleSpec().pos, vel: { x: 0, z: 0 },
    commodityId: 'cmdty_ore_iron', amount: 3, unitMass: 12,
  }, helpers);
  assert.ok(pod, 'Scale 4 gets a real player-owned jettison pod');
  scale.update(0.5, state);
  return { scale, pod, weighed };
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
  const scale4HandoffId = 'comms.47a.b1.scale4_handoff';
  assert.equal(h.popups.filter((p) => p.id === scale4HandoffId).length, 0,
    'a raw early variance cannot trigger Kessler’s handoff');

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
  assert.equal(h.popups.filter((p) => p.id === scale4HandoffId).length, 0,
    'an honest read does not produce the handoff');
  const cargoBeforeScale = structuredClone(state.player.cargo);
  const creditsBeforeScale = state.player.credits;
  const { scale, pod, weighed } = weighOwnCargoAtScale4(h);
  status = getBeatStepStatus(state, 1);
  assert.deepEqual(status.completed, ['alloy_run', 'scale_4']);
  assert.equal(weighed.length, 1, 'the production Scale 4 owner emitted the receipt');
  assert.equal(weighed[0].entityId, pod.id);
  assert.ok(weighed[0].variance && weighed[0].plateRead < weighed[0].trueRead,
    'the actual plate/stamp pair records the discrepancy');
  assert.equal(pod.alive, true, 'weighing leaves the player’s freight in hand');
  assert.deepEqual(state.player.cargo, cargoBeforeScale, 'weighing does not alter cargo ownership');
  assert.equal(state.player.credits, creditsBeforeScale, 'weighing does not grant payment');
  const handoffs = () => h.popups.filter((p) => p.id === scale4HandoffId);
  assert.equal(handoffs().length, 1, 'the accepted ordered receipt returns one Kessler reply');
  assert.equal(handoffs()[0].sender, 'KESSLER DESK');
  assert.equal(handoffs()[0].persist, true);
  assert.match(handoffs()[0].text, /Variance filed.*Ceres furnace detail.*Feed ore intact.*losses stay recorded/);

  // Reinitializing the scale against the retained state does not reread a saved pod. A
  // duplicate replay of its real receipt also cannot emit a second story handoff.
  scale.destroy();
  const restoredScale = createKesslerScale();
  restoredScale.init({ state, bus, helpers: h.helpers });
  restoredScale.update(0.5, state);
  assert.equal(weighed.length, 1, 'the already-read pod does not replay through the scale');
  bus.emit('kesslerPod:weighed', weighed[0]);
  assert.equal(handoffs().length, 1, 'duplicate receipt replay is once-only');
  restoredScale.destroy();

  // Now the furnace detail posts at Tethys.
  const infested = acceptOffer(h, 'station_tethys', 'campaign47a:b1:infested');
  assert.equal(infested.type, 'patrol_clear');
  assert.equal(infested.destStationId, 'station_ceres');
  assert.equal(infested.destSectorId, 'sector_ceres_belt');
  assert.equal(infested.params.furnaceFeedsNeeded, 3);
  assert.match(infested.brief, /four repair-mite sites.*three marked ore pods.*CR-FEED/i);

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

// Genuine authored arrival and runtime outcome. Entity creation and pilot inputs are
// test ports; neither a bare positive event nor a fabricated receipt completes the beat.
function visitNest(h, outcome = 'clear') {
  const { state, bus, helpers, registry } = h;
  const director = Object.assign({}, encounterDirectorProto);
  h.systems.encounterDirector = director;
  director.init({ state, bus, helpers, registry });
  h.combat.registry = registry;
  bus.on('projectile:hit', payload => h.combat.onHit(payload));
  state.world.currentSectorId = NEST_VISIT.sectorId;
  state.entities.get(state.playerId).pos = { ...nestApproach() };
  // This harness attaches the director late. Accrue the preceding flight through its
  // real owner rather than granting pressure or forcing past the pacing gate.
  state.simTime += 600;
  director._accrue(state.encounterDirector, state, 600);
  const admission = tickNestVisit(director);
  assert.equal(admission.ok, true, `Nest admission: ${admission.reason}`);
  const live = Object.values(state.encounterDirector.live || {}).find(row => row.shapeId === 'the_nest');
  assert.ok(live, 'the ordinary authored approach admits the real705 encounter');
  const carrier = state.entities.get(live.data.nest.carrierId);
  assert.ok(carrier && carrier.alive !== false, 'a real carrier was admitted');
  assert.equal(getBeatStepStatus(state, 2).completed.includes('nest'), false, 'arrival alone is not completion');
  if (outcome === 'escape') {
    state.simTime = live.data.nest.nextLaunchS + 0.1;
    nestRuntime.tick(director, live, state, state.simTime);
    const wasp = state.entities.get(live.data.nest.waspIds[0]);
    assert.ok(wasp && wasp.alive !== false, 'one genuine Wasp launched');
    state.entities.get(state.playerId).pos = { x: carrier.pos.x + 3100, z: carrier.pos.z };
  } else {
    const pulse = WEAPONS.find(row => row.id === 'wpn_pulse_laser_s');
    assert.ok(pulse, 'the actual starter weapon exists');
    const hullBefore = carrier.hull;
    let shots = 0;
    // Damage-pipeline proof only: this does not simulate aim, range, fire cadence or heat.
    while (carrier.alive !== false && shots < 500) {
      const result = h.combat.onHit({ targetId: carrier.id, ownerId: state.playerId,
        damage: pulse.dmg, damageType: pulse.damageType, weaponId: pulse.id,
        pos: { ...carrier.pos } });
      assert.equal(result.ok, true, 'starter damage is admitted by the real kernel');
      shots++;
    }
    assert.ok(carrier.hull < hullBefore, 'starter fire makes actual progress through carrier protection');
    assert.equal(carrier.alive, false, 'bounded ordinary starter hits kill through the combat owner');
    console.log(`    Nest starter damage pipeline: ${shots} hits from ${hullBefore} hull to ${carrier.hull}`);
  }
  nestRuntime.tick(director, live, state, state.simTime);
  assert.equal(live.outcome, outcome === 'escape' ? 'carrier_escapes' : 'carrier_down');
  assert.deepEqual(getBeatStepStatus(state, 2).completed, ['cinder_board', 'compost', 'nest']);
  return { director, live };
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
  bus.emit('understory:gardenStage', { gardenId: UNDERSTORY_RECEIVER.gardenId, stage: 2 });
  bus.emit('understory:playerGrowth', { gardenId: UNDERSTORY_RECEIVER.gardenId, byPlayer: true, stage: 2, fromStage: 1, fedMass: 16 });
  assert.deepEqual(getBeatStepStatus(state, 2).completed, ['cinder_board'], 'ambient or forged growth has no owner receipt');
  feedReceivingGarden(h, cinder);
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost']);

  // Only the real Nest counts.
  bus.emit('encounter:resolved', { shape: 'some_other_fight', sectorId: 'sector_charon_expanse' });
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost'], 'an unrelated fight is not the Nest');
  for (const outcome of [undefined, 'aborted:no_cast', 'aborted:sector_exit', 'subject_gone', 'carrier_down']) {
    bus.emit('encounter:resolved', { shape: 'the_nest', encounterId: 'enc_nest_1', sectorId: 'sector_charon_expanse', outcome });
    assert.deepEqual(getBeatStepStatus(state, 2).completed, ['cinder_board', 'compost'], 'unverified Nest events never complete the beat');
  }
  visitNest(h);
  status = getBeatStepStatus(state, 2);
  assert.deepEqual(status.completed, ['cinder_board', 'compost', 'nest']);

  // The register contract posts last.
  const elroy = acceptOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(elroy.type, 'bounty_hunt');
  assert.equal(elroy.storyTarget.id, 'npc_elroy');
  // Scan first — UNKNOWN resolves to the filed civilian hull.
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.state.world.currentSectorId = elroy.destSectorId;
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const targetId = elroy.targetEntityIds[0];
  const target = state.entities.get(targetId);
  target.pos = { x: 5, z: 0 };
  state.entities.get(state.playerId).pos = { x: 0, z: 0 };
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
  feedReceivingGarden(h, cinder);
  visitNest(h, 'escape');
  const elroy = acceptOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.state.world.currentSectorId = elroy.destSectorId;
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const targetId = elroy.targetEntityIds[0];
  state.entities.get(targetId).pos = { x: 5, z: 0 };
  state.entities.get(state.playerId).pos = { x: 0, z: 0 };
  bus.emit('scan:completed', { targetId });
  bus.emit('tether:reel', { actorId: state.playerId, targetId, after: 50 });
  assert.equal(h.elroyResolved[0].outcome, 'custody');
  assert.equal(state.story.flags.elroy_outcome, 'custody');
  assert.equal(state.story.beatIndex, 3);
});

console.log(failures === 0 ? 'w533-books-0-2: all checks passed' : `w533-books-0-2: ${failures} FAILURES`);
if (failures > 0) process.exit(1);
