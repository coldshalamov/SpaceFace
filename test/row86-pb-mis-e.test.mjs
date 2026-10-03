/**
 * Row 86 — PB-MIS-E (SF-138, SF-139, SF-142, SF-145): the Forge yard contracts.
 *
 * Two authored one-shot rows post on the Refuel Depot (station_depot3) board:
 *  - SPLIT MANIFEST: two real payload nets (urgent medical, heavy quantum) plus a stripped
 *    freighter hull — every lot scored by physical presence inside the yard dock ring.
 *  - QUIET BERTH: a dead yard lighter wedged off the west berth — parked inside the berth
 *    ring it pays, destroyed it fails. The yard's own tug works the apron and is hirable
 *    through the ordinary contact-hail/npcJobs tow seam (SF-138).
 *
 * Settlement is possession-before-paperwork (SF-145): whoever physically lands the body at
 * the sink gets the credit — player tether, hired tug, or a shove all read the same ring.
 * The durable yardContracts ledger retires each row once; the board can never repost it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import {
  SPLIT_MANIFEST_TYPE, QUIET_BERTH_TYPE,
  YARD_BOARD_STATION_ID, YARD_SINK_STATION_ID, YARD_SECTOR_ID,
  SPLIT_MANIFEST_LOTS, SPLIT_MANIFEST_TUNING, QUIET_BERTH_TUNING, TOW_ASSIST_FEE_CR,
} from '../src/data/yardContracts.js';
import { contactHailAvailability, CONTACT_HAIL_ACTION_TOW_ASSIST } from '../src/data/contactHail.js';

const FORGE = YARD_SECTOR_ID;
const DEPOT = YARD_BOARD_STATION_ID;

function buildSim() {
  const sim = createSimulation({
    seed: 8686,
    systems: [physics, world, missions, npcJobsRuntime, flightV3, combat],
    updateOrder: [world, npcJobsRuntime, missions, flightV3, physics, combat],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 9000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, player, bus: sim.bus };
}

function yardOffers(state) {
  const board = state.missions.boards[DEPOT];
  return (board && board.slots || []).filter((o) => o && o.source === 'yardWorkContract');
}

function activeOf(state, type) {
  return (state.missions.active || []).find((m) => m && m.status === 'active' && m.type === type) || null;
}

function yardBody(state, m, slotKey) {
  for (const id of m.targetEntityIds || []) {
    const e = state.entities.get(id);
    if (e && e.alive !== false && e.data && e.data.yardSlotKey === slotKey) return e;
  }
  return null;
}

function poolUnits(pool) {
  return Object.values(pool || {}).reduce((a, b) => a + Math.max(0, Math.floor(Number(b) || 0)), 0);
}

function creditLedger(bus) {
  const grants = [];
  const charges = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  return { grants, charges };
}

// ─── SF-139 + SF-145: the split manifest ─────────────────────────────────────
test('PB-MIS-E: the depot board posts both yard rows once, and the split manifest settles on physical delivery', () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  const { grants } = creditLedger(sim.bus);

  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);

  // Board reachability: the authored rows post on the depot's real board.
  const board = missionsApi.ensureBoard(DEPOT);
  assert.ok(board, 'depot board exists');
  const posted = yardOffers(state);
  assert.equal(posted.length, 2, 'both authored yard rows post');
  const split = posted.find((o) => o.type === SPLIT_MANIFEST_TYPE);
  const berth = posted.find((o) => o.type === QUIET_BERTH_TYPE);
  assert.ok(split && berth, 'split_manifest and quiet_berth both present');
  assert.equal(split.destStationId, YARD_SINK_STATION_ID);
  assert.equal(split.oneShot, true);
  assert.equal(split.authored, true);

  // Second sync never duplicates the authored rows.
  missionsApi.ensureBoard(DEPOT);
  assert.equal(yardOffers(state).length, 2, 're-sync does not repost while open');

  assert.equal(missionsApi.acceptMission(split.id), true, 'split offer accepts');
  const m = activeOf(state, SPLIT_MANIFEST_TYPE);
  assert.ok(m, 'split manifest active');
  assert.equal(m.needsTargets, true);
  assert.equal(m.destSectorId, FORGE);
  assert.equal(m.objectiveTarget, 2, 'one unit per net');

  // The scene materializes: two nets with real pools + the freighter wreck.
  sim.step(SIM_DT);
  const urgent = yardBody(state, m, 'urgent');
  const heavy = yardBody(state, m, 'heavy');
  const wreck = yardBody(state, m, 'wreck');
  assert.ok(urgent && heavy && wreck, 'two nets and the broken freighter all spawn');
  assert.equal(urgent.type, 'payload');
  assert.equal(urgent.data.salvagePool[SPLIT_MANIFEST_LOTS.urgent.cmdtyId], SPLIT_MANIFEST_LOTS.urgent.qty);
  assert.equal(heavy.data.salvagePool[SPLIT_MANIFEST_LOTS.heavy.cmdtyId], SPLIT_MANIFEST_LOTS.heavy.qty);
  assert.ok(poolUnits(wreck.data.salvagePool) > 0, 'damaged leftovers exist for later recovery');
  assert.equal(urgent.data.towable, true, 'the urgent net can be towed/hired out');
  assert.ok(heavy.mass > urgent.mass * 4, 'the heavy net is a real mass problem');

  // Nothing pays on selection or on the scene existing.
  assert.equal(grants.length, 0, 'no credit before a body lands');

  // Physically land the urgent net inside the dock ring — partial settle stays open.
  const sink = state.entityList.find((e) => e && e.type === 'station' && e.data
    && e.data.stationId === YARD_SINK_STATION_ID) || { pos: { x: -820, z: 280 } };
  urgent.pos.x = sink.pos.x;
  urgent.pos.z = sink.pos.z;
  sim.step(SIM_DT);
  assert.equal(m.params.yardLotStates.urgent, 'delivered', 'the urgent net counts when it lands');
  assert.equal(m.objectiveProgress, 1);
  assert.equal(m.status, 'active', 'one net down is partial — the contract stays open');
  assert.equal(grants.length, 0, 'no payout until the manifest closes');

  // The wreck never rescues the manifest — it is free salvage, not a lot.
  wreck.pos.x = sink.pos.x;
  wreck.pos.z = sink.pos.z;
  sim.step(SIM_DT);
  assert.equal(m.status, 'active', 'the wreck is scenery, not a manifest lot');

  // Land the heavy net: every lot resolved → the manifest closes on what landed.
  heavy.pos.x = sink.pos.x;
  heavy.pos.z = sink.pos.z;
  sim.step(SIM_DT);
  assert.equal(m.status, 'completed', 'both nets landed completes the contract');
  const full = SPLIT_MANIFEST_TUNING.shareUrgentFastCr + SPLIT_MANIFEST_TUNING.shareHeavyCr;
  assert.equal(grants.length, 1, 'exactly one settlement');
  assert.equal(grants[0].amount, full, 'full rate: urgent inside its window + heavy');
  assert.equal(grants[0].reason, `mission:${m.id}`);
  assert.equal(state.missions.yardContracts.split_manifest, 'completed', 'durable retire ledger');

  // SF-145 duplication guard: no second settlement for repeated delivery/entry.
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(SIM_DT);
  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  assert.equal(grants.length, 1, 're-entry pays nothing twice');
  assert.equal(state.entityList.filter((e) => e.data && e.data.yardWorkOf === m.id).length, 0,
    'the settled scene never rematerializes');

  // The settled row is retired on the board; the still-open berth row remains.
  missionsApi.ensureBoard(DEPOT);
  const after = yardOffers(state);
  assert.equal(after.length, 1, 'the settled split row is retired');
  assert.equal(after[0].type, QUIET_BERTH_TYPE, 'the open berth row survives the refresh');
});

// ─── SF-138 + SF-142: hire the yard tug, berth the lighter, no fight ─────────
test('PB-MIS-E: the quiet berth solves with the hired yard tug — lease, attachment, physical berth, one payment', async () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  const physicsSystem = sim.registry.get('physics');
  const { grants, charges } = creditLedger(sim.bus);
  const assistEvents = { complete: 0, lost: 0 };
  sim.bus.on('npcJobs:towAssistComplete', () => { assistEvents.complete += 1; });
  sim.bus.on('npcJobs:towAssistLost', () => { assistEvents.lost += 1; });

  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  assert.equal(await physicsSystem.prepareBackend(state), true,
    'the hired-tow proof runs on the prepared production body owner');

  missionsApi.ensureBoard(DEPOT);
  const berth = yardOffers(state).find((o) => o.type === QUIET_BERTH_TYPE);
  assert.ok(berth);
  assert.equal(missionsApi.acceptMission(berth.id), true);
  const m = activeOf(state, QUIET_BERTH_TYPE);
  assert.ok(m && m.needsTargets);
  sim.step(SIM_DT);

  const lighter = yardBody(state, m, 'lighter');
  const tug = yardBody(state, m, 'tug');
  assert.ok(lighter && tug, 'the dead lighter and the yard tug both spawn');
  assert.equal(lighter.data.salvagePool[QUIET_BERTH_TUNING.load.cmdtyId], QUIET_BERTH_TUNING.load.qty,
    'the load is physically aboard the lighter');
  assert.ok(tug.data.jobId, 'the yard tug is on an ordinary npc job');

  // Contact-hail truth: the tug reads as a worker whose HIRE TOW names this lighter.
  state.player.targetId = tug.id;
  const availability = contactHailAvailability(state);
  assert.ok(availability, 'the tug answers the hail');
  assert.equal(availability.towAssistBodyId, lighter.id,
    'the lighter is the towable body in the tug\'s reach');

  // The mission's destination hook: the berth ring, not a generic station.
  const hint = missionsApi.towAssistDestFor(lighter.id);
  assert.ok(hint && hint.pos && hint.missionId === m.id, 'the hire aims at the berth ring');

  // Hire it through the same lease a hail would take. The fee event is the billing seam;
  // payment for the lighter only ever comes from the physical berth.
  const start = { x: lighter.pos.x, z: lighter.pos.z };
  const out = sim.helpers.npcJobs.requestTowAssist(tug.id, lighter.id, hint.pos, {
    holder: 'contactHail', missionId: m.id, deliverW: hint.deliverW, feeCr: TOW_ASSIST_FEE_CR,
  });
  assert.equal(out.granted, true, 'the yard tug accepts the hire');
  assert.equal(charges.length, 1, 'the hire bills the fee event once');
  assert.equal(charges[0].amount, TOW_ASSIST_FEE_CR);
  assert.equal(charges[0].reason, 'tow_assist');
  const entry = state.npcJobs.byId[out.jobId];
  assert.ok(entry.control && entry.control.claimId === out.claimId, 'the control lease is held');
  assert.equal(grants.length, 0, 'the hire itself pays nothing — the berth does');

  // Drive the scene: approach → attach → drag → deliver.
  let attachmentId = null;
  let moved = 0;
  for (let tick = 0; tick < 60 * 30 && m.status === 'active'; tick += 1) {
    const before = { x: lighter.pos.x, z: lighter.pos.z };
    sim.step(SIM_DT);
    if (!attachmentId && entry.towAttachmentId) attachmentId = entry.towAttachmentId;
    moved = Math.max(moved, Math.hypot(lighter.pos.x - start.x, lighter.pos.z - start.z));
  }
  assert.ok(attachmentId, 'the hired tug latched an ordinary npc_tow attachment');
  const attachment = state.combat.attachments.byId[attachmentId];
  assert.ok(attachment, 'the live attachment row exists');
  assert.equal(attachment.controlMode, 'npc_tow');
  assert.equal(attachment.targetId, lighter.id);
  assert.ok(moved > 40, 'the lighter physically moved under the tow');
  assert.equal(m.status, 'completed', 'the parked lighter completes the berth contract');
  assert.equal(m.params.yardLighterState, 'berthed');
  assert.equal(assistEvents.complete, 1, 'the tow reports its delivery once');
  assert.equal(assistEvents.lost, 0);
  assert.equal(grants.length, 1, 'one settlement');
  assert.equal(grants[0].amount, QUIET_BERTH_TUNING.rewardCr);
  assert.equal(state.missions.yardContracts.quiet_berth, 'completed');
  assert.ok(!entry.control, 'the lease is released after delivery');
  assert.equal(lighter.data.npcTowedByJobId, undefined, 'the tow marker clears');
});

// ─── SF-138 edge: helper loss releases the hire honestly ─────────────────────
test('PB-MIS-E: losing the hired tug frees the lease and the load, and the hire can be retaken', () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  const { grants } = creditLedger(sim.bus);
  const lost = [];
  sim.bus.on('npcJobs:towAssistLost', (p) => lost.push(p));

  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  missionsApi.ensureBoard(DEPOT);
  const berth = yardOffers(state).find((o) => o.type === QUIET_BERTH_TYPE);
  missionsApi.acceptMission(berth.id);
  const m = activeOf(state, QUIET_BERTH_TYPE);
  sim.step(SIM_DT);
  const lighter = yardBody(state, m, 'lighter');
  const tug = yardBody(state, m, 'tug');
  const hint = missionsApi.towAssistDestFor(lighter.id);

  const out = sim.helpers.npcJobs.requestTowAssist(tug.id, lighter.id, hint.pos, {
    holder: 'contactHail', missionId: m.id,
  });
  assert.equal(out.granted, true);
  // The tug dies mid-hire: the lease drops, the load drifts free, the contract stays open.
  tug.alive = false;
  for (let tick = 0; tick < 30; tick += 1) sim.step(SIM_DT);
  assert.equal(lost.length, 1, 'the tow loss is reported once');
  assert.equal(lost[0].reason, 'hull_lost');
  assert.equal(lost[0].targetId, lighter.id);
  assert.equal(m.status, 'active', 'helper loss strands the job — it never settles it');
  assert.equal(grants.length, 0, 'no payout for a stranded load');
  const entry = state.npcJobs.byId[out.jobId];
  assert.ok(!entry || !entry.towAssist, 'the assist state clears on loss');
  assert.ok(!entry || !entry.control, 'the control lease is released');
  assert.equal(lighter.data.npcTowedByJobId, undefined, 'the load is free to be taken again');
});

// ─── SF-142 edge: violence clears the berth but voids the contract ────────────
test('PB-MIS-E: destroying the lighter fails the quiet berth and pays nothing', () => {
  const { sim, state, bus, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  const { grants } = creditLedger(sim.bus);

  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  missionsApi.ensureBoard(DEPOT);
  const berth = yardOffers(state).find((o) => o.type === QUIET_BERTH_TYPE);
  missionsApi.acceptMission(berth.id);
  const m = activeOf(state, QUIET_BERTH_TYPE);
  sim.step(SIM_DT);
  const lighter = yardBody(state, m, 'lighter');
  assert.ok(lighter);

  // Shooting the hull: the same two receipts every hull dies by.
  lighter.alive = false;
  bus.emit('entity:killed', { id: lighter.id, killerId: player.id, type: lighter.type, pos: { ...lighter.pos }, entity: lighter });
  sim.step(SIM_DT);
  bus.emit('entity:destroyed', { id: lighter.id, type: lighter.type, pos: { ...lighter.pos }, entity: lighter });
  sim.step(SIM_DT);

  assert.equal(m.status, 'completed' === m.status ? 'completed' : 'failed',
    'the contract settles — against the shooter');
  assert.notEqual(m.status, 'completed', 'a dead hull is not a berthed hull');
  assert.equal(m.params.yardLighterState, 'destroyed');
  assert.equal(grants.length, 0, 'the berth pays nothing for scrap');
  assert.equal(state.missions.yardContracts.quiet_berth, 'failed', 'the loud outcome still retires the row');
});

// ─── SF-139 edge: a destroyed lot is lost; partial settlement pays the rest ──
test('PB-MIS-E: losing a net settles the manifest on the lots that actually landed', () => {
  const { sim, state, bus, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  const { grants } = creditLedger(sim.bus);

  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  missionsApi.ensureBoard(DEPOT);
  const split = yardOffers(state).find((o) => o.type === SPLIT_MANIFEST_TYPE);
  missionsApi.acceptMission(split.id);
  const m = activeOf(state, SPLIT_MANIFEST_TYPE);
  sim.step(SIM_DT);
  const urgent = yardBody(state, m, 'urgent');
  const heavy = yardBody(state, m, 'heavy');

  // The urgent net is destroyed — custody is conserved as a lost lot, not silently dropped.
  urgent.alive = false;
  bus.emit('entity:killed', { id: urgent.id, killerId: player.id, type: urgent.type, pos: { ...urgent.pos }, entity: urgent });
  sim.step(SIM_DT);
  assert.equal(m.params.yardLotStates.urgent, 'lost', 'a dead net is a lost lot');
  assert.equal(m.status, 'active', 'the manifest is still open while the heavy net lives');

  // Land the heavy one: the manifest closes on what actually arrived.
  const sink = state.entityList.find((e) => e && e.type === 'station' && e.data
    && e.data.stationId === YARD_SINK_STATION_ID) || { pos: { x: -820, z: 280 } };
  heavy.pos.x = sink.pos.x;
  heavy.pos.z = sink.pos.z;
  sim.step(SIM_DT);
  assert.equal(m.status, 'completed');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, SPLIT_MANIFEST_TUNING.shareHeavyCr,
    'partial manifest pays the heavy share only — no urgent share for a lost lot');
});

// ─── SF-145: the destination hook refuses non-yard bodies ────────────────────
test('PB-MIS-E: tow-assist destination authority only answers yard-owned bodies', () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(FORGE);
  sim.step(SIM_DT);
  // A random loose payload with no yard stamp gets no mission destination — the generic
  // nearest-station fallback in scanner stays the honest default.
  const loose = sim.spawn({
    type: 'payload', pos: { x: 10, z: 10 }, radius: 6, mass: 30, collides: true,
    hull: 10, hullMax: 10, data: { salvagePool: { cmdty_scrap_metal: 2 } },
  });
  assert.equal(missionsApi.towAssistDestFor(loose.id), null, 'unowned salvage gets no yard sink');
  assert.equal(missionsApi.towAssistDestFor(999999), null);
});
