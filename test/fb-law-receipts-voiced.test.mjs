// FB-040 — the important law receipts read back aloud through the bark director.
//
// The design contract under test:
//
//   * Each of the six scripted law steps (assessment, sanctuary withdrawal, deferred response,
//     incident resolution, warrant release, distress ack) voices exactly ONE authored line from
//     the lawful register on a scripted incident — heard through the same bark-channel voice
//     arbiter slot every other law bark spends.
//   * A receipt the player could not hear stays silent: the witness gate is the same hail
//     radius and named-actor rule the rest of the law cadence already uses, so a far-side
//     incident never radios spam the player had no eyes on.
//   * A re-emitted receipt cannot restate itself — the one-shot dedupe key is the incident's
//     own identity, so refills and repeated emissions don't repeat the line.
//   * Every resolved line renders through the real bark-voice pipeline (resolveBarkVoice), so
//     what the test pins is what the player hears.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { LAW_STEP_BARKS, lawStepBarkFor } from '../src/data/barks.js';
import { resolveBarkVoice } from '../src/audio/barkVoice.js';

const SEED = 4242;

function boot() {
  const said = [];
  const voiceReceipts = [];
  const voice = {
    say(entry) { said.push(entry); return true; },
  };
  const sim = createSimulation({
    seed: SEED,
    systems: [barkDirector],
    helpers: { voice },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const station = sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 40, z: 0 }, radius: 42,
    data: { stationId: 'station_tethys_customs', factionId: 'faction_scn' },
  });
  bus.on('barkDirector:voice', (p) => voiceReceipts.push(p));
  return { sim, state, bus, player, station, said, voiceReceipts };
}

test('the scripted incident (seed 4242) voices each of the six law steps once', () => {
  const run = boot();
  const { bus, said } = run;

  // The scripted incident: a raider's attack on a freighter beside the customs ring while the
  // player is docked there with a priced warrant on their own sheet.
  bus.emit('law:fineAssessed', {
    stationId: 'station_tethys_customs', offer: true, amount: 250,
    wantedTier: 'SCAN', heatLevel: 1,
  });
  bus.emit('law:distressRaised', {
    id: 'inc-4242', attackerId: 'raider-1', victimId: 'hauler-1',
    factionId: 'faction_scn', victimAnchor: { x: 120, z: 0 },
    stationId: 'station_tethys_customs',
  });
  bus.emit('law:responseDeferred', {
    incidentId: 'inc-4242', stationId: 'station_tethys_customs', spawnBudgetDeferred: true,
  });
  bus.emit('law:incidentResolved', {
    id: 'inc-4242', attackerId: 'raider-1', victimId: 'hauler-1',
    victimAnchor: { x: 120, z: 0 }, resolvedBy: 'patrol',
  });
  bus.emit('law:wantedWarrantReleased', {
    contractId: 'warrant-4242', hunterId: 'hunter-1', targetId: run.player.id,
  });
  bus.emit('law:sanctuaryWithdrawal', {
    attackerId: 'raider-1', targetId: run.player.id,
    stationId: 'station_tethys_customs', firstWithdrawal: true,
  });

  assert.equal(said.length, 6, 'one readback per scripted step — no more, no less');
  const events = [
    'law:fineAssessed', 'law:distressRaised', 'law:responseDeferred',
    'law:incidentResolved', 'law:wantedWarrantReleased', 'law:sanctuaryWithdrawal',
  ];
  for (const eventName of events) {
    const line = lawStepBarkFor(eventName);
    const spoken = said.find((entry) => entry.text === line);
    assert.ok(spoken, `${eventName} must voice its authored line`);
    assert.equal(spoken.channel, 'bark', 'the readback spends the ordinary bark-channel slot');
    // The arbiter face of it: each line resolves through the real bark-voice pipeline.
    const resolved = resolveBarkVoice({
      factionId: spoken.factionId, situation: 'law-step', line: spoken.text,
    });
    assert.ok(resolved, `${eventName} line must render in the real voice pipeline`);
  }
  // Every voiced line also publishes its receipt for captions/comms mirrors.
  assert.equal(run.voiceReceipts.length, 6);
  for (const receipt of run.voiceReceipts) {
    assert.equal(receipt.situation, 'law-step');
  }
  run.sim.dispose();
});

test('a receipt the player could not hear stays silent', () => {
  const run = boot();
  const { bus, said } = run;
  // The whole incident happened far outside hail range and names no player.
  bus.emit('law:distressRaised', {
    id: 'inc-far', attackerId: 'raider-9', victimId: 'hauler-9',
    factionId: 'faction_scn', victimAnchor: { x: 60000, z: 60000 },
    stationId: 'station_far',
  });
  bus.emit('law:incidentResolved', {
    id: 'inc-far', attackerId: 'raider-9', victimId: 'hauler-9',
    victimAnchor: { x: 60000, z: 60000 },
  });
  bus.emit('law:responseDeferred', {
    incidentId: 'inc-far', stationId: 'station_far',
  });
  bus.emit('law:wantedWarrantReleased', {
    contractId: 'warrant-foreign', hunterId: 'hunter-9', targetId: 'npc-9',
    pos: { x: 60000, z: 60000 },
  });
  assert.equal(said.length, 0, 'unwitnessed law work must not radio spam');
  assert.equal(run.voiceReceipts.length, 0);
  run.sim.dispose();
});

test('a re-emitted receipt cannot restate itself', () => {
  const run = boot();
  const { bus, said } = run;
  const payload = {
    id: 'inc-dup', attackerId: 'raider-1', victimId: 'hauler-1',
    factionId: 'faction_scn', victimAnchor: { x: 120, z: 0 },
    stationId: 'station_tethys_customs',
  };
  bus.emit('law:distressRaised', payload);
  bus.emit('law:distressRaised', { ...payload });
  bus.emit('law:distressRaised', payload);
  assert.equal(said.length, 1, 'one incident, one readback — refills never repeat the line');
  // The dock offer also dedupes across re-emission.
  bus.emit('law:fineAssessed', {
    stationId: 'station_tethys_customs', offer: true, amount: 250,
    wantedTier: 'SCAN', heatLevel: 1,
  });
  bus.emit('law:fineAssessed', {
    stationId: 'station_tethys_customs', offer: true, amount: 250,
    wantedTier: 'SCAN', heatLevel: 1,
  });
  assert.equal(said.length, 2, 'one offer voice per assessment key');
  run.sim.dispose();
});

test('a refused voice request does not burn the receipt', () => {
  const run = boot();
  const { bus, said } = run;
  // Refuse once — the channel is busy — then allow. The receipt must voice on the retry.
  const voice = run.sim.helpers.voice;
  const original = voice.say;
  let refused = false;
  voice.say = (entry) => {
    if (!refused) { refused = true; return false; }
    return original(entry);
  };
  bus.emit('law:wantedWarrantReleased', {
    contractId: 'warrant-retry', hunterId: 'hunter-1', targetId: run.player.id,
  });
  assert.equal(said.length, 0, 'the refused attempt spends nothing');
  bus.emit('law:wantedWarrantReleased', {
    contractId: 'warrant-retry', hunterId: 'hunter-1', targetId: run.player.id,
  });
  assert.equal(said.length, 1, 'the re-emitted receipt voices once the channel is free');
  assert.equal(said[0].text, LAW_STEP_BARKS['law:wantedWarrantReleased']);
  run.sim.dispose();
});

test('the corpus holds exactly the six scripted steps', () => {
  assert.deepEqual(
    Object.keys(LAW_STEP_BARKS).sort(),
    [
      'law:distressRaised', 'law:fineAssessed', 'law:incidentResolved',
      'law:responseDeferred', 'law:sanctuaryWithdrawal', 'law:wantedWarrantReleased',
    ],
    'only the scripted steps carry lines — law traffic is not blanket-voiced',
  );
  for (const [eventName, line] of Object.entries(LAW_STEP_BARKS)) {
    assert.equal(lawStepBarkFor(eventName), line);
    assert.ok(line.length > 0);
  }
  assert.equal(lawStepBarkFor('law:response'), null);
  assert.equal(lawStepBarkFor('heat:changed'), null);
});
