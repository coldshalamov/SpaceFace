// W-BOOKS-3-4 (build_map row 534): Books 3–4 play on the default route per
// design/expansion/06_CAMPAIGN_SCRIPT.md §34.7 — live boards, physical signals,
// and the missions-owned cursor, never sidecar-only metadata.
//
// Drives: B3 berth contract → VARIANCE ADJUSTMENT (Hawser seam holds three strain
// spikes, lets go at the fourth, Slate welds the column entry at the yard) →
// Feed the Maw (three hot-slag stuns, then the tow leaves the lane) → the
// Mirrorjaw Foreman (capital-boss yard feud) → the first Gate Audit weld recorded
// as optional world evidence. B4: three doors — Meridian intro → Spine Break,
// Concord intro → the Weighing / Too-Perfect Pack, Free Captain intro → Barn
// Raising — plus the DOUBLED interdiction choice whose wall line is canon only
// when the job is actually taken and completed.
// Run: node --test test/w534-books-3-4.test.mjs

import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { addCargo } from '../src/systems/cargo.js';
import { isBeatStepsComplete, getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { PHYSICAL_ROLE } from '../src/systems/missions.js';
import { physicalRoleOf } from '../src/systems/missions.js';

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
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 240, capMass: 400 };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0 };
  }
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {}, hull: 100 });
  state.entityList = [state.entities.get(1)];
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const popups = [];
  const graffiti = [];
  const seamFailed = [];
  const beatAdvances = [];
  const repDeltas = [];
  bus.on('comms:popup', (p) => popups.push(p || {}));
  bus.on('graffiti:show', (p) => graffiti.push(p || {}));
  bus.on('story:varianceSeamFailed', (p) => seamFailed.push(p || {}));
  bus.on('story:beatAdvanced', (p) => beatAdvances.push(p || {}));
  bus.on('faction:repDelta', (p) => repDeltas.push(p || {}));
  bus.on('economy:grantCredits', (p) => {
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });

  const helpers = {
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
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
  const registry = { get: (n) => (n === 'missions' ? missions : n === 'story' ? story : null) };
  missions.init({ state, bus, helpers, registry });
  story.init({ state, bus, helpers, registry });
  missions.newGame();
  story._ensureState && story._ensureState(true);
  return { state, bus, missions, story, helpers, popups, graffiti, seamFailed, beatAdvances, repDeltas };
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
  h.bus.emit('sector:enter', { sectorId: m.destSectorId });
  h.missions.spawnTargetsForSector(m.destSectorId);
  h.missions._ensureMissionTargets(m);
  assert.ok(m.targetEntityIds.length > 0, `${m.storyTag} must materialize targets`);
  for (const id of [...m.targetEntityIds]) {
    h.bus.emit('entity:killed', { id, killerId: h.state.playerId });
  }
}

/** Materialize a physical-contract body in its destination sector. */
function enterDest(h, m) {
  h.state.world.currentSectorId = m.destSectorId;
  h.bus.emit('sector:enter', { sectorId: m.destSectorId });
  h.missions.spawnTargetsForSector(m.destSectorId);
  h.missions._ensureMissionTargets(m);
  assert.ok(m.targetEntityIds.length > 0, `${m.storyTag} must materialize bodies`);
}

function slagCoreOf(h, m) {
  const id = (m.targetEntityIds || []).find((eid) => physicalRoleOf(h.state.entities.get(eid)) === PHYSICAL_ROLE.SLAG_CORE);
  assert.ok(id != null, `${m.storyTag} must spawn a slag-core body`);
  return h.state.entities.get(id);
}

/** Tow the spawned core to the yard and dock — sling_in through the berth read.
 *  Story dest-dock uses the tightened station-hull + slack gate, so the dest
 *  station must exist as a live entity and the core must park inside it. */
function dockTow(h, m, stationId = m.destStationId) {
  const core = slagCoreOf(h, m);
  const berth = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === stationId
  )) || h.helpers.spawnEntity({
    type: 'station', pos: { x: 0, z: 0 }, radius: 34,
    data: { stationId, dockRadius: 72 },
  });
  core.pos = { x: berth.pos.x + 10, z: berth.pos.z };
  h.bus.emit('dock:docked', { stationId });
}

function completeBounty(h, m) {
  enterDest(h, m);
  for (const id of [...m.targetEntityIds]) {
    h.bus.emit('entity:killed', { id, killerId: h.state.playerId });
  }
}

// ── Route helpers: replay Books 0–2 (the w533 route) to stand Book 3 up. ─────
function reachB1(h) {
  const { state, bus } = h;
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1);
}

function reachB2(h) {
  reachB1(h);
  const { state, bus } = h;
  const alloy = acceptOffer(h, 'station_helios', 'campaign47a:b1:alloy_run');
  addCargo(state, 'cmdty_alloys', Math.max(1, alloy.params.qty || 6));
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  const infested = acceptOffer(h, 'station_tethys', 'campaign47a:b1:infested');
  completePatrol(h, infested);
  for (let i = 0; i < 3; i++) bus.emit('furnace:fed', { entityId: 9100 + i });
  assert.equal(state.story.beatIndex, 2);
}

function reachB3(h, elroyOutcome = 'force') {
  reachB2(h);
  const { state, bus } = h;
  const cinder = acceptOffer(h, 'station_tethys', 'campaign47a:b2:cinder');
  completePatrol(h, cinder);
  bus.emit('rookWreck:delivered', { entityId: 9301 });
  bus.emit('understory:gardenFed', { byPlayer: true, gardenId: 'g1', fedMass: 20 });
  bus.emit('encounter:resolved', { shape: 'the_nest', sectorId: 'sector_charon_expanse' });
  const elroy = acceptOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const targetId = elroy.targetEntityIds[0];
  state.entities.get(targetId).pos = { x: 5, z: 0 };
  bus.emit('scan:completed', { targetId });
  if (elroyOutcome === 'custody') {
    bus.emit('tether:reel', { actorId: state.playerId, targetId, after: 50 });
    assert.equal(state.story.flags.elroy_outcome, 'custody');
  } else {
    bus.emit('entity:killed', { id: targetId, killerId: state.playerId });
    assert.equal(state.story.flags.elroy_outcome, 'force');
  }
  assert.equal(state.story.beatIndex, 3);
}

/** Book 3's full yard list: delivery → maw → Foreman. Ends at Book 4. */
function reachB4(h, elroyOutcome = 'force') {
  reachB3(h, elroyOutcome);
  const { state, bus } = h;
  const berth = acceptOffer(h, 'station_tethys', 'campaign47a:b3:berth');
  enterDest(h, berth);
  dockTow(h, berth);
  assert.equal(berth.status, 'completed', 'berth delivery settles');
  const maw = acceptOffer(h, 'station_tethys', 'campaign47a:b3:maw');
  enterDest(h, maw);
  const mawBody = slagCoreOf(h, maw);
  for (let i = 0; i < 3; i++) bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  dockTow(h, maw);
  assert.equal(maw.status, 'completed', 'stunned maw tows off the lane');
  const foreman = acceptOffer(h, 'station_tethys', 'campaign47a:b3:foreman');
  enterDest(h, foreman);
  const capital = foreman.targetEntityIds
    .map((id) => state.entities.get(id))
    .find((e) => physicalRoleOf(e) === PHYSICAL_ROLE.CAPITAL);
  assert.ok(capital, 'the Foreman materializes as a capital hull');
  bus.emit('entity:killed', { id: capital.id, killerId: state.playerId });
  assert.equal(state.story.beatIndex, 4, 'delivery → maw → foreman closes Bigger Boat');
  // The unpinned route: a save whose B2 settled through the pod-rescue set piece left
  // Elroy unresolved — no outcome token, so Pick a Side opens all three doors (the
  // 'live' kind via embodied evidence). The book route above always resolves a token,
  // so we clear it here to stand that save shape up.
  if (elroyOutcome === 'unpinned') delete state.story.flags.elroy_outcome;
}

/** Accept the live branch intro on the given station's board. Returns the instance
 *  built from THIS offer — a second door intro must not resolve to the stale first. */
function acceptIntro(h, stationId) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((row) => row && row.storyTag === 'story.branch_intro');
  assert.ok(offer, `missing branch intro at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, 'intro accept fails');
  return h.state.missions.active.find((row) => row.sourceOfferId === offer.id)
    || h.state.missions.active.find((row) => row.storyTag === 'story.branch_intro');
}

function completeIntro(h, m) {
  if (m.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: m.destStationId,
      commodityId: m.params.cmdtyId, qty: m.params.qty || 1,
    });
  } else if (m.type === 'patrol_clear') {
    completePatrol(h, m);
  } else if (m.type === 'smuggling_run') {
    addCargo(h.state, m.params.cmdtyId, Math.max(1, m.params.qty || 1));
    h.bus.emit('dock:docked', { stationId: m.destStationId });
  } else {
    assert.fail(`unexpected intro type ${m.type}`);
  }
}

/** Escort op: spawn the convoy + a live dest-station entity, walk the tick to
 *  `escorteeArrived`, then dock the player at the destination. */
function completeEscort(h, m) {
  enterDest(h, m);
  const station = h.helpers.spawnEntity({
    type: 'station', pos: { x: 0, z: 0 },
    data: { stationId: m.destStationId, dockRadius: 140 },
  });
  const lead = h.state.entities.get(m._escorteeId);
  assert.ok(lead, 'escort convoy lead must spawn');
  lead.pos = { x: station.pos.x + 20, z: station.pos.z };
  h.missions.update(0.016, h.state);
  assert.equal(m._escorteeArrived, true, 'convoy lead reaches the dock ring');
  h.bus.emit('dock:docked', { stationId: m.destStationId });
}

console.log('w534-books-3-4');

// ── BOOK THREE: Bigger Boat — berth, seam, maw, Foreman, the first audit. ────
check('B3: board posts the berth first — VARIANCE ADJUSTMENT, Hawser class', () => {
  const h = makeHarness(60);
  const { state } = h;
  reachB3(h);
  // Wrong-shape world signals must not satisfy the ordered list.
  h.bus.emit('worldPressure:auditAnnounced', { key: 'x|y', book: 6 });
  h.bus.emit('furnace:fed', { entityId: 7777 });
  let status = getBeatStepStatus(state, 3);
  assert.deepEqual(status.completed, [], 'irrelevant signals do not open Book 3');

  const berth = acceptOffer(h, 'station_tethys', 'campaign47a:b3:berth');
  assert.equal(berth.type, 'tow_recovery');
  assert.equal(berth.params.bookScene, 'variance_delivery');
  assert.equal(berth.params.authoredSetPieceId, 'long_tow');
  const handover = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(handover.includes('VARIANCE ADJUSTMENT'), 'Slate names the tug on accept');
  assert.ok(handover.includes('Hawser'), 'the Hawser class is spoken');
});

check('B3: the seam holds three strain spikes and lets go at the fourth', () => {
  const h = makeHarness(61);
  const { state, bus } = h;
  reachB3(h);
  const berth = acceptOffer(h, 'station_tethys', 'campaign47a:b3:berth');

  // Before delivery the counter is not armed — strain is just strain.
  bus.emit('tether:strain', { ratio: 0.9 });
  assert.equal(state.story.flags.variance_seam_spikes || 0, 0, 'pre-delivery strain is inert');

  enterDest(h, berth);
  dockTow(h, berth);
  assert.equal(berth.status, 'completed');
  assert.equal(state.story.flags.variance_delivered, true, 'delivery arms the seam counter');
  let status = getBeatStepStatus(state, 3);
  assert.deepEqual(status.completed, ['delivery']);
  assert.equal(state.story.beatIndex, 3, 'delivery alone cannot close the book');

  // Edge-triggered: one crossing counts once, no re-count while held high.
  bus.emit('tether:strain', { ratio: 0.8 });
  bus.emit('tether:strain', { ratio: 0.9 });
  assert.equal(state.story.flags.variance_seam_spikes, 1, 'a held-high envelope counts once');
  bus.emit('tether:strain', { ratio: 0.05 });
  bus.emit('tether:strain', { ratio: 0.8 });
  assert.equal(state.story.flags.variance_seam_spikes, 2);
  bus.emit('tether:strain', { ratio: 0.05 });
  bus.emit('tether:strain', { ratio: 0.8 });
  assert.equal(state.story.flags.variance_seam_spikes, 3);
  assert.equal(h.seamFailed.length, 0, 'three spikes hold');
  bus.emit('tether:strain', { ratio: 0.05 });
  bus.emit('tether:strain', { ratio: 0.8 });
  assert.equal(state.story.flags.variance_seam_failed, true, 'the fourth spike lets the seam go');
  assert.equal(h.seamFailed.length, 1, 'story:varianceSeamFailed fired once');
  const strain = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(strain.includes('FOURTH SPIKE'), 'the fourth-spike line lands');

  // Slate welds it at the yard — the column keeps its entry.
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(state.story.flags.slate_column_entry, true, 'the column entry is filed');
  assert.equal(state.story.flags.variance_seam_failed, false, 'the weld lays the failure down');
  const weld = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(weld.includes('Second pass'), 'Slate speaks the second pass');
  // Once welded, the seam story is done — further spikes stay silent.
  bus.emit('tether:strain', { ratio: 0.05 });
  bus.emit('tether:strain', { ratio: 0.95 });
  assert.equal(h.seamFailed.length, 1, 'the welded seam does not re-fail');
});

check('B3: the Kepler gate weld records as optional world evidence', () => {
  const h = makeHarness(62);
  const { state, bus } = h;
  reachB3(h);
  bus.emit('worldPressure:auditAnnounced', { key: 'sector_sker_haven|sector_kepler_scar', book: 3 });
  let status = getBeatStepStatus(state, 3);
  assert.deepEqual(status.completed, ['gate_audit_kepler'], 'the audit weld lands whenever it fires');
  assert.equal(isBeatStepsComplete(state, 3), false, 'optional evidence alone cannot close the book');
  // A later, different audit still cannot satisfy Book 3's required rows.
  bus.emit('worldPressure:gateClosed', { key: 'sector_io_reach|sector_nereid_shoal', book: 4 });
  status = getBeatStepStatus(state, 3);
  assert.deepEqual(status.completed, ['gate_audit_kepler'], 'the B4 weld is not Book 3 evidence');
});

check('B3: Feed the Maw needs the slag stuns before the tow settles', () => {
  const h = makeHarness(63);
  const { state, bus } = h;
  reachB3(h);
  const berth = acceptOffer(h, 'station_tethys', 'campaign47a:b3:berth');
  enterDest(h, berth);
  dockTow(h, berth);
  assert.equal(berth.status, 'completed');

  const maw = acceptOffer(h, 'station_tethys', 'campaign47a:b3:maw');
  assert.equal(maw.type, 'tow_recovery');
  assert.equal(maw.params.mawStunsNeeded, 3);
  assert.equal(maw.params.furnaceMaw, true);
  enterDest(h, maw);
  const mawBody = slagCoreOf(h, maw);
  assert.equal(mawBody.data.furnaceMaw, true, 'the core is stamped as a living maw');

  // Two stuns short — the thrashing maw does not ride a line out.
  bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'crushing' });
  assert.equal(maw.params.mawStuns, 2);
  dockTow(h, maw);
  assert.equal(maw.status, 'active', 'the tow refuses while the maw still hunts');

  bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  dockTow(h, maw);
  assert.equal(maw.status, 'completed', 'three stuns and the maw leaves the lane');
  assert.equal(state.story.flags.maw_fed, true);
  let status = getBeatStepStatus(state, 3);
  assert.deepEqual(status.completed, ['delivery', 'feed_the_maw']);
});

check('B3: the Foreman yard feud closes the book; the audit never gates it', () => {
  const h = makeHarness(64);
  const { state, bus } = h;
  reachB3(h);
  // The weld lands mid-book — optional evidence, not a gate.
  bus.emit('worldPressure:auditAnnounced', { key: 'sector_sker_haven|sector_kepler_scar', book: 3 });
  const berth = acceptOffer(h, 'station_tethys', 'campaign47a:b3:berth');
  enterDest(h, berth);
  dockTow(h, berth);
  const maw = acceptOffer(h, 'station_tethys', 'campaign47a:b3:maw');
  enterDest(h, maw);
  const mawBody = slagCoreOf(h, maw);
  for (let i = 0; i < 3; i++) bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  dockTow(h, maw);

  const foreman = acceptOffer(h, 'station_tethys', 'campaign47a:b3:foreman');
  assert.equal(foreman.type, 'capital_boss');
  assert.equal(foreman.params.encounterId, 'capital_boss_foreman');
  enterDest(h, foreman);
  const capital = foreman.targetEntityIds
    .map((id) => state.entities.get(id))
    .find((e) => physicalRoleOf(e) === PHYSICAL_ROLE.CAPITAL);
  assert.ok(capital, 'the Foreman materializes as a capital hull');
  bus.emit('entity:killed', { id: capital.id, killerId: state.playerId });
  assert.equal(foreman.status, 'completed');
  assert.equal(state.story.flags.foreman_settled, true);
  assert.ok(isBeatStepsComplete(state, 3));
  assert.equal(state.story.beatIndex, 4, 'the yard list closes Bigger Boat');
  const adv = h.beatAdvances[h.beatAdvances.length - 1];
  assert.equal(adv.fromIndex, 3);
  assert.equal(adv.toIndex, 4);
});

// ── BOOK FOUR: Pick a Side — three doors, three operations, the doubled tag. ──
check('B4: Meridian door — intro accept opens, Spine Break settles, book closes', () => {
  const h = makeHarness(65);
  const { state, bus } = h;
  reachB4(h);

  // The clearing station shows the intro door and the doubled tag in plain type.
  const board = h.missions.ensureBoard('station_tethys');
  const doubled = board.slots.find((row) => row && row.storyTag === 'campaign47a:b4:doubled');
  assert.ok(doubled, 'the doubled interdiction contract is on the board');
  assert.ok(doubled.title.includes('DOUBLED'), 'the offer is visibly marked DOUBLED');

  const intro = acceptIntro(h, 'station_tethys');
  assert.equal(intro.storyBranch, 'traders');
  assert.equal(intro.type, 'bulk_trade');
  let status = getBeatStepStatus(state, 4);
  assert.deepEqual(status.completed, ['branch_intro_accept'], 'the door acceptance is the first step');
  assert.equal(state.story.flags.pick_a_side_pending, 'traders');
  assert.equal(state.story.branch, null, 'the door is not settled on accept');
  assert.equal(state.story.beatIndex, 4, 'accepting a door cannot close the book');

  // The operation stays pending: no Spine Break row until the intro settles.
  let opRow = board.slots.find((row) => row && row.storyTag === 'campaign47a:b4:operation');
  assert.ok(!opRow, 'the door operation is not posted before the intro completes');

  completeIntro(h, intro);
  assert.equal(intro.status, 'completed');
  assert.equal(state.story.branch, 'traders', 'finishing the intro settles the door');
  assert.equal(state.story.beatIndex, 4, 'the book still waits on the operation');
  assert.ok(h.repDeltas.some((d) => d.factionId === 'faction_mts' && d.delta === 15),
    'the chosen faction reads +15');

  const op = acceptOffer(h, 'station_tethys', 'campaign47a:b4:operation');
  assert.equal(op.type, 'escort');
  assert.equal(op.params.bookScene, 'spine_break', 'Meridian runs Spine Break');
  assert.equal(op.storyBranch, 'traders');
  completeEscort(h, op);
  assert.equal(op.status, 'completed');
  assert.equal(state.story.flags.spine_break_done, true);
  assert.ok(isBeatStepsComplete(state, 4));
  assert.equal(state.story.beatIndex, 5, 'the operation closes Pick a Side');

  // The book closed — the doubled choice is consumed off the board.
  h.missions._refreshEmbodiedStoryBoards();
  const after = h.missions.ensureBoard('station_tethys');
  assert.ok(!after.slots.some((row) => row && row.storyTag === 'campaign47a:b4:doubled'),
    'the doubled row is stripped once the book closes');
  // And the wall stayed silent — the doubled job was offered, never taken.
  assert.ok(!h.graffiti.some((g) => String(g.line || '').includes('YOU READ THE TAG')),
    'the canon wall line does not fire for an untaken tag');
});

check('B4: Concord door — the Weighing plus the Too-Perfect Pack', () => {
  const h = makeHarness(66);
  const { state } = h;
  reachB4(h, 'custody'); // custody outcome pins the Coalition evidence door
  const intro = acceptIntro(h, 'station_coalition');
  assert.equal(intro.storyBranch, 'patrol');
  assert.equal(intro.type, 'patrol_clear');
  completeIntro(h, intro);
  assert.equal(state.story.branch, 'patrol');
  assert.equal(state.story.beatIndex, 4);

  const op = acceptOffer(h, 'station_coalition', 'campaign47a:b4:operation');
  assert.equal(op.type, 'patrol_clear');
  assert.equal(op.params.bookScene, 'too_perfect_pack', 'Concord runs the Weighing + the Pack');
  assert.equal(op.storyBranch, 'patrol');
  completePatrol(h, op);
  assert.equal(op.status, 'completed');
  assert.equal(state.story.flags.helix_unmasked, true, 'the pack resolves to Helix');
  assert.equal(state.story.beatIndex, 5);
});

check('B4: Free Captain door — Barn Raising', () => {
  const h = makeHarness(67);
  const { state } = h;
  reachB4(h, 'unpinned'); // Elroy unresolved: all three doors on the boards
  const intro = acceptIntro(h, 'station_reach');
  assert.equal(intro.storyBranch, 'free');
  assert.equal(intro.type, 'smuggling_run');
  completeIntro(h, intro);
  assert.equal(state.story.branch, 'free');
  assert.equal(state.story.beatIndex, 4);

  const op = acceptOffer(h, 'station_helios', 'campaign47a:b4:operation');
  assert.equal(op.type, 'tow_recovery');
  assert.equal(op.params.bookScene, 'barn_raising', 'the Free Captains raise the barn');
  assert.equal(op.storyBranch, 'free');
  enterDest(h, op);
  dockTow(h, op);
  assert.equal(op.status, 'completed');
  assert.equal(state.story.flags.barn_raised, true);
  assert.equal(state.story.beatIndex, 5);
});

check('B4: re-accepting a second door intro is acknowledged, not a rejection', () => {
  const h = makeHarness(68);
  const { state } = h;
  reachB4(h, 'unpinned'); // both doors are on the boards
  const first = acceptIntro(h, 'station_tethys');
  assert.equal(state.story.flags.pick_a_side_pending, 'traders');
  // The player re-reads the doors and takes the Concord intro instead — the
  // already-recorded accept step acknowledges; the pending door moves with the
  // live contract the player actually holds.
  const second = acceptIntro(h, 'station_coalition');
  assert.equal(second.storyBranch, 'patrol');
  let status = getBeatStepStatus(state, 4);
  assert.deepEqual(status.completed, ['branch_intro_accept'], 'no double-count, no rejection');
  assert.equal(state.story.flags.pick_a_side_pending, 'patrol', 'the pending door follows the live intro');
  completeIntro(h, second);
  assert.equal(state.story.branch, 'patrol');
  // The abandoned Meridian intro completing later must not unsettle the door.
  completeIntro(h, first);
  assert.equal(state.story.branch, 'patrol', 'a stale intro cannot unsettle the door');
});

check('B4: the doubled contract pays double and the wall answers six days later', () => {
  const h = makeHarness(69);
  const { state } = h;
  reachB4(h);
  const doubled = acceptOffer(h, 'station_tethys', 'campaign47a:b4:doubled');
  assert.equal(doubled.type, 'bounty_hunt');
  assert.equal(doubled.params.doubledContract, true);
  assert.equal(doubled.params.bookScene, 'doubled_interdiction');
  const acceptLine = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(acceptLine.includes('TAG: HOSTILE'), 'the plain-type tag is spoken on accept');

  completeBounty(h, doubled);
  assert.equal(doubled.status, 'completed');
  assert.equal(state.story.flags.doubled_contract_taken, true, 'the taken tag is filed');
  assert.ok(state.story.flags.doubled_wall_at > state.simTime, 'the wall line is owed later');
  const paid = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(paid.includes('FEE PAID DOUBLE'), 'the double fee is receipted');

  // Offer alone never wrote the wall — six days after the taken job it answers.
  assert.ok(!h.graffiti.some((g) => String(g.line || '').includes('YOU READ THE TAG')),
    'no wall line before the six days pass');
  state.simTime = state.story.flags.doubled_wall_at + 1;
  h.missions.update(0.016, state);
  assert.equal(state.story.flags.doubled_wall_shown, true);
  assert.ok(h.graffiti.some((g) => g.line === 'YOU READ THE TAG.'), 'the canon wall line lands');
  const wallPopup = h.popups.map((p) => p.text || '').join(' ');
  assert.ok(wallPopup.includes('YOU READ THE TAG'), 'the airlock notices the tag');
  h.missions.update(0.016, state);
  assert.equal(h.graffiti.filter((g) => g.line === 'YOU READ THE TAG.').length, 1, 'the wall fires once');
});

check('B4: the door operation does not post for another door\u2019s board', () => {
  const h = makeHarness(70);
  const { state } = h;
  reachB4(h, 'unpinned');
  const intro = acceptIntro(h, 'station_reach');
  completeIntro(h, intro);
  assert.equal(state.story.branch, 'free');
  // Barn Raising is the free door's operation — it posts at Helios, never at Tethys.
  h.missions._refreshEmbodiedStoryBoards();
  const tethys = h.missions.ensureBoard('station_tethys');
  const tethysOp = tethys.slots.find((row) => row && row.storyTag === 'campaign47a:b4:operation');
  assert.ok(!tethysOp || tethysOp.storyBranch === 'free', 'no foreign-door operation on Tethys');
  const helios = h.missions.ensureBoard('station_helios');
  const op = helios.slots.find((row) => row && row.storyTag === 'campaign47a:b4:operation');
  assert.ok(op && op.storyBranch === 'free', 'the free door\u2019s operation posts at Helios');
});

console.log(failures === 0 ? 'w534-books-3-4: all checks passed' : `w534-books-3-4: ${failures} FAILURES`);
if (failures > 0) process.exit(1);
