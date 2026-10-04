// NXI-179 — the story response to a revised clue explains the change and keeps the earlier
// sighting on record (NXB-045's clue book supplies the current/history distinction).
//
// Pinned here:
//   1. a contradicted re-scan speaks one SIGNAL LOG line that names the conflict AND the first
//      observation as still on file — the player is told the evidence conflicts, not silently
//      handed a rewritten claim;
//   2. a stale re-scan says circumstances changed (a stale fix is movement, not a lie);
//   3. counterexamples: a first-time filing, a duplicate re-scan of the standing claim, and a
//      re-emission of the same revision all stay silent — repeat pulses never stack lines;
//   4. a scan with no clue rows at all (the ordinary Helios-style pulse) produces nothing.
//
// Harness: the helios-bay7 boot — real story system on a real bus, comms captured, seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { story } from '../src/systems/story.js';

function bootStory(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  const bus = createBus();
  const comms = [];
  bus.on('comms:popup', (payload) => comms.push(payload));
  const system = Object.create(story);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, system, comms };
}

function revisedRow({ subjectId, claim, prior, scannedAt }) {
  return {
    id: `signal:${subjectId}`,
    kind: 'ship',
    detail: 'A later reading contradicts the first claim.',
    clue: {
      subjectId,
      kind: 'manifest',
      claim,
      observedAt: scannedAt,
      pos: { x: 200, z: 0 },
      route: { action: 'inspect', pos: { x: 200, z: 0 }, reason: 'Contradicted reading — inspect the hold directly.' },
      history: [prior],
    },
  };
}

test('a contradicted re-scan names the conflict and keeps the first observation on file', () => {
  const h = bootStory();
  const row = revisedRow({
    subjectId: 'manifest:7',
    claim: 'manifest mismatch',
    prior: { claim: 'declared civilian cargo', status: 'contradicted', at: 5, pos: { x: 200, z: 0 } },
    scannedAt: 12,
  });
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 12, signals: [row] });
  const lines = h.comms.filter((c) => c.id === 'clue_revision_manifest:7_12');
  assert.equal(lines.length, 1, 'exactly one story line for the revision');
  assert.equal(lines[0].category, 'story');
  assert.match(lines[0].text, /conflicts|contradict/i, 'the line explains that evidence conflicts');
  assert.match(lines[0].text, /declared civilian cargo/, 'the line quotes what the player first saw');
  assert.match(lines[0].text, /stays on file/, 'the earlier clue is kept, not deleted');
  assert.doesNotMatch(lines[0].text, /fabricat|lie/i, 'no verdict of fabrication');
});

test('a stale fix speaks once as changed circumstances, not as a lie', () => {
  const h = bootStory();
  const row = revisedRow({
    subjectId: 'shipment:lane',
    claim: 'shipment on the industrial lane',
    prior: { claim: 'shipment on the industrial lane', status: 'stale', at: 10, pos: { x: 400, z: 0 } },
    scannedAt: 90,
  });
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 90, signals: [row] });
  const lines = h.comms.filter((c) => c.id === 'clue_revision_shipment:lane_90');
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /circumstances changed/, 'a stale fix is explained as movement');
  assert.match(lines[0].text, /went stale/);
  assert.match(lines[0].text, /stays on file/);
  assert.doesNotMatch(lines[0].text, /fabricat/i);
});

test('counterexamples: first filings, duplicates and repeated pulses never stack a line', () => {
  const h = bootStory();

  // A first-time filing has no history — nothing was rewritten, so nothing speaks.
  h.bus.emit('signal:scanResults', {
    sectorId: 'sector_test',
    scannedAt: 20,
    signals: [{
      id: 'signal:fresh',
      clue: { subjectId: 'manifest:fresh', kind: 'manifest', claim: 'declared cargo', observedAt: 20, history: [] },
    }],
  });
  assert.equal(h.comms.length, 0, 'a first observation is not a revision');

  // A duplicate re-scan of the standing claim at the standing fix: observedAt stays at the
  // first stamp, so the pulse carries no revision and speaks nothing.
  const duplicate = revisedRow({
    subjectId: 'manifest:7',
    claim: 'manifest mismatch',
    prior: { claim: 'declared civilian cargo', status: 'contradicted', at: 5, pos: { x: 200, z: 0 } },
    scannedAt: 12,
  });
  duplicate.clue.observedAt = 12; // standing stamp from the earlier revision, not this pulse
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 40, signals: [duplicate] });
  assert.equal(h.comms.length, 0, 'an old superseded clue re-pulsed is not a new revision');

  // The same genuine revision delivered twice (UI refresh, second consumer) fires once.
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 12, signals: [duplicate] });
  duplicate.clue.observedAt = 12;
  const realTwice = revisedRow({
    subjectId: 'manifest:7',
    claim: 'manifest mismatch',
    prior: { claim: 'declared civilian cargo', status: 'contradicted', at: 5, pos: { x: 200, z: 0 } },
    scannedAt: 12,
  });
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 12, signals: [realTwice] });
  const lines = h.comms.filter((c) => c.id === 'clue_revision_manifest:7_12');
  assert.equal(lines.length, 1, 'the dedupe guard holds across repeat emissions');
});

test('an ordinary clue-less scan pulse is untouched — the Helios-style payload stays silent here', () => {
  const h = bootStory();
  h.bus.emit('signal:scanResults', {
    sectorId: 'sector_test',
    scannedAt: 30,
    signals: [{ id: 'signal:plain', kind: 'cache', detail: 'Cache return unresolved.' }],
  });
  h.bus.emit('signal:scanResults', { sectorId: 'sector_test', scannedAt: 31, signals: [] });
  assert.equal(h.comms.length, 0, 'no clue rows, no story response');
});
