/**
 * WF-08 — claim-stake salvage. A board salvage_retrieval contract materializes a contested
 * wreck on the destination's approach: a filed hull holding the contract manifest as a real
 * salvagePool, a passive claim crew working it, and consequence paths through mining's own
 * claim-jump protest → law owner. This test drives the live seams only: offer → accept →
 * sector enter → beam/latch/violence → claim lapse → settlement.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import { lootShards } from '../src/systems/lootShards.js';
import {
  MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps,
} from '../src/data/featureFlags.js';
import { SECTORS } from '../src/data/sectors.js';

const DEST_SECTOR = 'sector_vesta_forge';
const DEST_STATION = 'station_depot3';
const ORIGIN_SECTOR = 'sector_helios_prime';
const ORIGIN_STATION = 'station_helios';
const CMDTY = 'cmdty_salvage_electronics';

const FLAG_SNAPSHOT = snapshotFeatureMaps();
test.before(() => {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
});
test.after(() => restoreFeatureMaps(FLAG_SNAPSHOT));

function buildSim() {
  const bus = createBus();
  // lootShards is on the live production route; the process-default MAP seeds legacy47a
  // (off), so the focused sim enables exactly the one flag the spill path reads.
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world, missions, lootShards] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, bus, state, player };
}

function plainSalvageOffer() {
  // The exact shape a board roll produces — no authored site, no story tag, no
  // wreck/mutation pointer. This is the row that used to be "dock with X units".
  return {
    id: 'offer_claim_site_test',
    type: 'salvage_retrieval',
    stationId: ORIGIN_STATION,
    factionId: null,
    params: { cmdtyId: CMDTY, qty: 6, cargoValue: 300, fValue: 1.05, taskTime: 30 },
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: DEST_STATION,
    destSectorId: DEST_SECTOR,
    distance: 1400,
    duration_s: 3600,
    title: 'Test salvage recovery',
  };
}

function boardAndAccept(state, missionsApi, offer) {
  // The board route itself: post the row on its station, accept by offer id.
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };
  assert.equal(missionsApi.acceptMission(offer.id), true, 'board offer accepts');
}

function activeMission(state) {
  return (state.missions.active || []).find((m) => m && m.status === 'active');
}

function claimCrewOf(state, missionId) {
  return state.entityList.filter((e) => (
    e && e.alive !== false && e.data && e.data.contractClaimCrewOf === String(missionId)
  ));
}

function claimWreckOf(state, mission) {
  for (const id of mission.targetEntityIds || []) {
    const e = state.entities.get(id);
    if (e && e.alive !== false && e.data && e.data.contractClaimSiteOf === mission.id) return e;
  }
  return null;
}

function poolUnits(pool) {
  return Object.values(pool || {}).reduce((a, b) => a + Math.max(0, Math.floor(Number(b) || 0)), 0);
}

test('claim-stake salvage: a board salvage row materializes a contested wreck site', () => {
  assert.ok(SECTORS.find((s) => s.id === DEST_SECTOR), 'destination sector exists');
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');

  sim.registry.get('world').enterSector(ORIGIN_SECTOR);
  sim.step(SIM_DT);

  boardAndAccept(state, missionsApi, plainSalvageOffer());
  const m = activeMission(state);
  assert.ok(m, 'mission active');
  assert.equal(m.needsTargets, true, 'board salvage defers its site to destination arrival');

  // Deferred: nothing materializes until the player reaches the destination sector.
  assert.equal(claimCrewOf(state, m.id).length, 0, 'no claim crew offsite');
  assert.equal(m.targetEntityIds.length, 0, 'no targets offsite');

  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);

  // The placed scene: one dead hauler carrying the contract manifest as a real pool,
  // claimed on the field, tetherable — plus a passive working crew on the hull.
  const wreck = claimWreckOf(state, m);
  assert.ok(wreck, 'contract wreck materializes in the destination sector');
  assert.equal(wreck.type, 'wreck');
  assert.equal(wreck.data.tetherable, true, 'the hull can be dragged off on a tether');
  assert.equal(typeof wreck.data.salvorClaimedBy, 'string', 'the field claim is filed');
  assert.ok(wreck.data.salvagePool[CMDTY] >= 6, 'the manifest is physically aboard the wreck');
  assert.ok(poolUnits(wreck.data.salvagePool) >= 6);
  assert.ok(wreck.data.scanLabel && /CLAIM/i.test(wreck.data.scanLabel), 'scan reads the claim');

  const crew = claimCrewOf(state, m.id);
  const lead = crew.find((e) => e.data.claimRole === 'lead');
  const cutters = crew.filter((e) => e.data.claimRole === 'cutter');
  assert.ok(lead, 'a claim hauler is parked on the wreck');
  assert.ok(cutters.length >= 1, 'cutter escort present');
  assert.equal(lead.data.salvorClaimId, m.params.contractClaimId, 'crew carries the filed claim id');
  for (const e of crew) {
    assert.equal(e.data.ai.passive, true, 'claim crew holds fire until the claim is touched');
  }
  assert.ok(lead.data.cargoManifest && Array.isArray(lead.data.cargoManifest.lines),
    'the hauler has a real manifest to fill');

  // Waypoint follows the goods: the live hull, not the dock.
  assert.ok(state.nav.waypoint && state.nav.waypoint.kind === 'mission',
    'tracked mission owns the marker');
  assert.equal(state.nav.waypoint.targetEntityId, wreck.id, 'marker rides the contested hull');

  // The warning: touching the filed hull speaks once before the first unit counts.
  bus.emit('mining:start', { minerId: player.id, targetId: wreck.id, verb: 'extract', position: { ...wreck.pos } });
  assert.equal(m.params.contractClaimWarned, true, 'first beam touch warns once');

  // The working claim: the crew physically siphons the manifest while the player watches.
  player.pos.x = wreck.pos.x + 200;
  player.pos.z = wreck.pos.z;
  const poolBefore = poolUnits(wreck.data.salvagePool);
  state.simTime = 100;
  sim.step(SIM_DT);
  const manifestQty = m.params.contractClaimCutAt > 0
    ? (lead.data.cargoManifest.lines || []).reduce((a, l) => a + (l.qty | 0), 0)
    : 0;
  assert.ok(m.params.contractClaimCutAt >= 100, 'the crew cut a unit while the player watched');
  assert.equal(manifestQty, 1, 'the stolen unit is physically on the hauler');
  assert.equal(poolUnits(wreck.data.salvagePool), poolBefore - 1, 'the hull lost the same unit');

  // Stealing units — mining's claim-jump protest — springs the cutters, not the hauler.
  bus.emit('salvage:claimJumped', {
    wreckId: wreck.id, claimantId: m.params.contractClaimId, offenderId: player.id,
    took: { [CMDTY]: 1 }, reportId: 'test', accepted: false, sectorId: DEST_SECTOR, visits: 1, t: 100,
  });
  assert.equal(m.params.contractCrewSprung, true, 'the scene springs on the first steal');
  for (const e of cutters) {
    assert.equal(e.data.ai.passive, false, 'cutters go hot on the claim-jump');
    assert.equal(e.data.ai.forcePlayerTarget, true);
    assert.ok((e.data.ai.hostileTeams || []).includes(player.team), 'cutters hostile to the player');
  }
  assert.equal(lead.data.ai.passive, true, 'the hauler runs with the goods — it never joins the guns');

  // The honest aftermath route: kill the loaded hauler and lootShards spills the manifest
  // as one real takeable pod. The marker follows the cargo — the wreck first while it still
  // holds units, then the pod once the hull is drained.
  lead.alive = false;
  bus.emit('entity:killed', { id: lead.id, killerId: player.id, type: lead.type, pos: { ...lead.pos } });
  sim.step(SIM_DT);
  const pod = state.entityList.find((e) => e && e.alive !== false && e.type === 'payload'
    && e.data && e.data.manifestId === `claim-manifest:${m.id}`);
  assert.ok(pod, 'the dead hauler spilled its manifest as a takeable pod');
  assert.ok(poolUnits(pod.data.salvagePool) >= 1, 'the pod physically carries the cut units');
  assert.equal(state.nav.waypoint.targetEntityId, wreck.id,
    'while the hull still holds goods the marker stays on it');

  wreck.alive = false;
  bus.emit('salvage:completed', { wreckId: wreck.id, loot: { [CMDTY]: 5 }, pos: { ...wreck.pos } });
  sim.step(SIM_DT);
  assert.equal(state.nav.waypoint.targetEntityId, pod.id, 'hull drained — the marker rides the spilled pod');
});

test('claim-stake salvage: killing the whole crew lapses the filed claim; drained sites stay drained', () => {
  const { sim, bus, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  boardAndAccept(state, missionsApi, plainSalvageOffer());
  const m = activeMission(state);
  const wreck = claimWreckOf(state, m);
  const crew = claimCrewOf(state, m.id);
  assert.ok(wreck && crew.length >= 2, 'site live');

  // Kill the crew one by one; the last hull standing down ends the claim.
  for (const e of crew) {
    e.alive = false;
    bus.emit('entity:killed', { id: e.id, killerId: state.playerId });
  }
  sim.step(SIM_DT);
  assert.equal(m.params.contractCrewGone, true, 'crew extinct is remembered');
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'an unmanned claim lapses — the strip is clean');

  // A drained hull never refills on re-entry: completion marks it gone for good.
  bus.emit('salvage:completed', { wreckId: wreck.id, loot: { [CMDTY]: 6 }, pos: { ...wreck.pos } });
  wreck.alive = false;
  assert.equal(m.params.contractWreckGone, 'drained');
  m.targetEntityIds = [];
  sim.registry.get('world').enterSector(ORIGIN_SECTOR);
  sim.step(SIM_DT);
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  assert.equal(claimWreckOf(state, m), null, 'a stripped contract hull never respawns');
});

test('claim-stake salvage: sector re-entry respawns the site with its real remaining pool', () => {
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  boardAndAccept(state, missionsApi, plainSalvageOffer());
  const m = activeMission(state);
  const wreck = claimWreckOf(state, m);
  const firstPos = { x: wreck.pos.x, z: wreck.pos.z };

  // The crew cuts one unit, then the player leaves mid-strip.
  player.pos.x = wreck.pos.x + 200;
  player.pos.z = wreck.pos.z;
  state.simTime = 100;
  sim.step(SIM_DT);
  const remaining = poolUnits(wreck.data.salvagePool);
  assert.equal(remaining, poolUnits(m.params.contractWreckPool || wreck.data.salvagePool));

  sim.registry.get('world').enterSector(ORIGIN_SECTOR);
  sim.step(SIM_DT);
  assert.equal(claimWreckOf(state, m), null, 'hard exit sweeps the pinned hull');
  // entity:destroyed is a queued receipt — ids recycle into fresh occupants before it
  // flushes. Neither the residency sweep nor a stale id may read as "the hull died".
  assert.equal(m.params.contractWreckGone, undefined, 'a swept hull is not a destroyed hull');

  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const wreck2 = claimWreckOf(state, m);
  assert.ok(wreck2, 'the hull is still on site when the player returns');
  assert.equal(m.params.contractWreckGone, undefined, 'the site stays live across re-entry');
  assert.deepEqual(
    { x: Math.round(wreck2.pos.x * 100) / 100, z: Math.round(wreck2.pos.z * 100) / 100 },
    { x: Math.round(firstPos.x * 100) / 100, z: Math.round(firstPos.z * 100) / 100 },
    'same seed → same site position',
  );
  assert.equal(poolUnits(wreck2.data.salvagePool), remaining, 'the pool stays cut, not refilled');
  assert.ok(claimCrewOf(state, m.id).length >= 2, 'the claim crew is still working it');
});
