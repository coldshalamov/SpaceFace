import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { uniqueWreckById, placementForUniqueWreck, programSeedFor } from '../src/data/uniqueWrecks.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { CONTACT_VOICE_REGISTERS, syncWitnessSeamVoice } from '../src/data/barks.js';
import { depthContactsForStation } from '../src/story/campaign47a/embodiedDialogue.js';

const META_SEED = 4242;
const PROGRAM_SEED = programSeedFor(META_SEED);
const DORIN_ORIGINAL = 'I copied the seal log. They copied my death notice.';
const KELL_ORIGINAL = 'Six years copying margins. One bad handoff burns everything.';
const DORIN_FILED_LINE = 'You filed the log. The massacre has a record. I breathe.';
const DORIN_BURIED_LINE = 'The log stays buried. I counted who watched you choose the shelf.';
const KELL_WARY_LINE = 'Hale asked the desk two questions today. I answered one, smiling.';
const KELL_MID_LINE = 'My day-files stopped matching my night-files. Somebody noticed.';
const KELL_DEEP_LINE = 'Six years of quiet handoffs. The desk would swear I was never there.';

function witnessEpochFor(witnessId) {
  for (let epoch = 0; epoch < 400; epoch += 1) {
    const suffix = hash32(META_SEED, 'witness_run', epoch, 'sp1-set-piece').toString(36);
    const chainId = `sp1_witness_run_${epoch}_${suffix}`;
    const index = hash32(META_SEED, chainId, 'witness') % 2;
    const picked = index === 0 ? 'dorin' : 'kell';
    if (picked === witnessId) return epoch;
  }
  throw new Error(`no seeded witness_run epoch picks ${witnessId}`);
}

function flightSim() {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [uniqueWrecks, missions, stationContacts, contractClausesSystem],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.credits = 50000;
  // Both Customs contacts pass their beat gates, the hold fits every preloaded stage manifest,
  // and tier-3 branch stages clear their standing gates (a fresh sim ships no faction records).
  state.story.beatIndex = 6;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free', 'faction_reach', 'faction_quiet', 'faction_choir']) {
    state.factions[id] = { rep: 500 };
  }
  return { sim, state, bus };
}

function postedRow(state, chainId, stageIndex, branchId = null, attempt = 0) {
  return Object.values(state.missions.boards).flatMap((board) => board.slots || [])
    .find((row) => row && row.cause && row.cause.chainId === chainId
      && row.cause.stageIndex === stageIndex && (row.cause.branchId || null) === branchId
      && (row.cause.attempt | 0) === attempt)
    || null;
}

function acceptRow(sim, state, row) {
  assert.ok(row, 'expected a posted set-piece row');
  state.missions.boards[row.stationId] = state.missions.boards[row.stationId] || { slots: [] };
  if (!state.missions.boards[row.stationId].slots.some((slot) => slot && slot.id === row.id)) {
    state.missions.boards[row.stationId].slots.unshift(row);
  }
  assert.equal(sim.registry.get('missions').acceptMission(row.id), true,
    `accept ${row.title || row.id}`);
  return row;
}

function completeScanOpening(state, bus) {
  const def = uniqueWreckById('wreck_isc_double_entry');
  const placement = placementForUniqueWreck(PROGRAM_SEED, def.id, def.sectorId);
  state.world.currentSectorId = def.sectorId;
  bus.emit('sector:enter', { sectorId: def.sectorId });
  bus.emit('scan:pulse', { pos: { ...placement.exactGlobal } });
  assert.equal(state.player.uniqueWrecks.bearings[def.id].phase, 'fixed');
}

/** Walk compare_aliases -> extract_the_witness, then accept the chosen branch's first stage. */
function runWitnessRouteToBranch(sim, state, bus, { epoch, branchId }) {
  const opening = buildSetPieceMissionOffers(state, {
    archetypeId: 'witness_run',
    startEpoch: epoch,
    stageIndex: 0,
    branchId: null,
    attempt: 0,
  })[0];
  const chainId = opening.cause.chainId;
  acceptRow(sim, state, opening);
  completeScanOpening(state, bus);

  acceptRow(sim, state, postedRow(state, chainId, 1));
  bus.emit('dock:docked', { stationId: 'station_drift' });

  const branchRow = postedRow(state, chainId, 2, branchId);
  assert.ok(branchRow, `the ${branchId} branch is posted at the choice point`);
  acceptRow(sim, state, branchRow);
  return { chainId };
}

test(`seed ${META_SEED}: a finished publish run with witness dorin moves the bar contacts`, () => {
  const { sim, state, bus } = flightSim();
  const counterEvents = [];
  bus.on('stationContact:counterChanged', (payload) => counterEvents.push(payload));
  try {
    // Fresh counters and the authored original voices.
    assert.equal(state.player.stationContactCounters['dorin.trust'], 0);
    assert.equal(state.player.stationContactCounters['kell.cover'], 0);
    syncWitnessSeamVoice(state.player.stationContactCounters);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_filecleaver_dorin.lines[5], DORIN_ORIGINAL);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_wraith_kell.lines[4], KELL_ORIGINAL);

    const epoch = witnessEpochFor('dorin');
    const { chainId } = runWitnessRouteToBranch(sim, state, bus, { epoch, branchId: 'publish' });
    bus.emit('dock:docked', { stationId: 'station_coalition' });
    acceptRow(sim, state, postedRow(state, chainId, 3, 'publish'));
    bus.emit('dock:docked', { stationId: 'station_tethys' });

    // The terminal publish settlement moved both bounded counters via the canonical intent.
    assert.equal(state.player.stationContactCounters['dorin.trust'], 1,
      'publishing the testimony earns Dorin trust (+1)');
    assert.equal(state.player.stationContactCounters['kell.cover'], 0,
      'public files burn the copy desk; cover clamps at its fresh floor');
    const dorinDelta = counterEvents.find((row) => row.trackerId === 'dorin.trust');
    const kellDelta = counterEvents.find((row) => row.trackerId === 'kell.cover');
    assert.ok(dorinDelta && dorinDelta.value === 1 && /witness=dorin/.test(dorinDelta.reason || ''),
      'the counter intent names the witness and the branch');
    assert.ok(kellDelta && /witness=dorin/.test(kellDelta.reason || ''));

    // Dorin's bar voice acknowledges the filing; Kell stays at his unread original.
    syncWitnessSeamVoice(state.player.stationContactCounters);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_filecleaver_dorin.lines[5], DORIN_FILED_LINE);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_wraith_kell.lines[4], KELL_ORIGINAL);
    const contacts = depthContactsForStation('station_customs', state);
    const dorin = contacts.find((row) => row.id === 'contact_filecleaver_dorin');
    assert.ok(dorin, 'Dorin stands in the Customs bar');
    assert.equal(dorin.blurb, 'The log has a record now. Your name is on it.');
  } finally {
    sim.dispose();
  }
});

test(`seed ${META_SEED}: a shelter run builds Kell's cover, then a terminal failure burns it`, () => {
  const { sim, state, bus } = flightSim();
  const counterEvents = [];
  bus.on('stationContact:counterChanged', (payload) => counterEvents.push(payload));
  try {
    const epoch = witnessEpochFor('kell');
    // A completed shelter run: the desk stayed dark, so Kell's cover is built (+1).
    const { chainId } = runWitnessRouteToBranch(sim, state, bus, { epoch, branchId: 'shelter' });
    bus.emit('dock:docked', { stationId: 'station_nyx_march' });
    acceptRow(sim, state, postedRow(state, chainId, 3, 'shelter'));
    state.world.currentSectorId = 'sector_nyx_march';
    for (let i = 0; i < 3; i += 1) {
      bus.emit('scan:completed', { targetId: null, found: { asteroids: 0, wrecks: 0, anomalies: 0 } });
    }
    assert.equal(state.player.stationContactCounters['kell.cover'], 1);
    assert.equal(state.player.stationContactCounters['dorin.trust'], -1,
      'shelving the run buries Dorin’s proof (-1)');

    // A second shelter run, this one terminally failed through its no_scan clause.
    const failedEpoch = witnessEpochFor('kell') + 101;
    const failedRoute = runWitnessRouteToBranch(sim, state, bus, {
      epoch: failedEpoch,
      branchId: 'shelter',
    });
    const breached = state.missions.active.find((mission) => mission.cause
      && mission.cause.chainId === failedRoute.chainId);
    assert.ok(breached, 'the shelter-key leg is active');
    bus.emit('player:scannedByPatrol', { missionId: breached.id });
    assert.equal(state.missions.active.includes(breached), false, 'the breach fails the leg');
    const retry = postedRow(state, failedRoute.chainId, 2, 'shelter', 1);
    assert.ok(retry, 'the first breach posts one reduced-stake retry');
    acceptRow(sim, state, retry);
    bus.emit('player:scannedByPatrol', { missionId: retry.cause.chainId || retry.id });
    assert.equal(postedRow(state, failedRoute.chainId, 2, 'shelter', 1), null,
      'a twice-broken run closes without a second retry');

    // Terminal failure burns the cover the first run built; nobody earns trust.
    assert.equal(state.player.stationContactCounters['kell.cover'], 0);
    assert.equal(state.player.stationContactCounters['dorin.trust'], -1);
    const failureDelta = counterEvents.filter((row) => /failed/.test(row.reason || ''));
    assert.equal(failureDelta.length, 1, 'exactly one terminal-failure intent fired');
    assert.equal(failureDelta[0].trackerId, 'kell.cover');

    syncWitnessSeamVoice(state.player.stationContactCounters);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_wraith_kell.lines[4], KELL_ORIGINAL,
      'burned cover is back where the authored clerk line stands');
    assert.equal(CONTACT_VOICE_REGISTERS.contact_filecleaver_dorin.lines[5], DORIN_BURIED_LINE);
    const kell = depthContactsForStation('station_customs', state)
      .find((row) => row.id === 'contact_wraith_kell');
    assert.ok(kell);
    assert.equal(kell.blurb, 'I file manifests by day, copy them by night. Burn?',
      'a fresh-floor Kell greets with the authored line');
  } finally {
    sim.dispose();
  }
});

test(`seed ${META_SEED}: repeated canonical runs clamp and rebuild the bounded counters`, () => {
  const { sim, state, bus } = flightSim();
  try {
    syncWitnessSeamVoice(state.player.stationContactCounters);
    // The seam emitter is stateless: each terminal shelter run sends the same canonical deltas.
    // Three shelter runs: trust clamps at its -1 floor, cover builds 0 -> 3, voice deepens.
    for (let run = 0; run < 3; run += 1) {
      bus.emit('stationContact:counterDelta', { trackerId: 'dorin.trust', delta: -1, reason: 'witness_run:shelter:completed:witness=kell' });
      bus.emit('stationContact:counterDelta', { trackerId: 'kell.cover', delta: 1, reason: 'witness_run:shelter:completed:witness=kell' });
      syncWitnessSeamVoice(state.player.stationContactCounters);
    }
    assert.equal(state.player.stationContactCounters['dorin.trust'], -1, 'trust clamps at its floor');
    assert.equal(state.player.stationContactCounters['kell.cover'], 3, 'cover builds run over run');
    assert.equal(CONTACT_VOICE_REGISTERS.contact_wraith_kell.lines[4], KELL_MID_LINE);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_filecleaver_dorin.lines[5], DORIN_BURIED_LINE);
    const kellContact = depthContactsForStation('station_customs', state)
      .find((row) => row.id === 'contact_wraith_kell');
    assert.equal(kellContact.blurb, 'My day-files and night-files disagree. Walk past.');

    // Two publish runs eat the built cover back down and pay Dorin for the filing.
    bus.emit('stationContact:counterDelta', { trackerId: 'dorin.trust', delta: 1, reason: 'witness_run:publish:completed:witness=dorin' });
    bus.emit('stationContact:counterDelta', { trackerId: 'kell.cover', delta: -1, reason: 'witness_run:publish:completed:witness=dorin' });
    bus.emit('stationContact:counterDelta', { trackerId: 'dorin.trust', delta: 1, reason: 'witness_run:publish:completed:witness=dorin' });
    bus.emit('stationContact:counterDelta', { trackerId: 'kell.cover', delta: -1, reason: 'witness_run:publish:completed:witness=dorin' });
    assert.equal(state.player.stationContactCounters['dorin.trust'], 1, 'trust crosses to its ceiling');
    assert.equal(state.player.stationContactCounters['kell.cover'], 1, 'cover erodes run over run');
    syncWitnessSeamVoice(state.player.stationContactCounters);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_wraith_kell.lines[4], KELL_WARY_LINE);
    assert.equal(CONTACT_VOICE_REGISTERS.contact_filecleaver_dorin.lines[5], DORIN_FILED_LINE);
  } finally {
    sim.dispose();
  }
});
