import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { planFactionPresence } from '../src/data/factionPresence.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { story } from '../src/systems/story.js';

test('the real Deep Reach beat transition reveals observers without pretending the operation closed a gate', () => {
  const state = createGameState(0x47a);
  state.story.beatIndex = 7;
  state.story.flags.deep_reach_operation_complete = true;
  state.story.flags.deep_reach_variant = 'force_manifest_reach';
  const bus = createBus();
  const reveals = [];
  const closures = [];
  bus.on('story:vergeObserversRevealed', (payload) => reveals.push(payload));
  bus.on('story:vergeGateClosed', (payload) => closures.push(payload));
  const storySystem = Object.create(story);
  storySystem.init({
    state, bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get() { return null; } },
  });

  assert.deepEqual(state.story.verge.revocations, []);
  bus.emit('story:beatAdvanced', { fromIndex: 7, toIndex: 7, branch: 'traders' });
  bus.emit('story:beatAdvanced', { fromIndex: 7, toIndex: 7, branch: 'traders' });
  assert.equal(state.story.verge.revealed, true);
  assert.equal(state.story.verge.awake, false);
  assert.equal(state.story.verge.valeGatesRevoked, false);
  assert.equal(state.story.verge.revocations.length, 0);
  assert.equal(reveals.length, 1);
  assert.equal(closures.length, 0);
});

test('Kell, Archive, and Kurtz evidence truthfully wakes neutral Verge observers by revoking Vale gates', () => {
  const before = planFactionPresence({ sectorId: 'sector_veil_nebula', seed: 0x47a });
  assert.equal(before.some((plan) => plan.factionId === 'faction_verge_layers'), false);

  const state = createGameState(0x47a);
  state.world.currentSectorId = 'sector_veil_nebula';
  state.story.verge = {
    revealed: true,
    awake: false,
    valeGatesRevoked: false,
    playerUsedClosureProtocol: false,
    evidence: { kellPaperTrail: false, archiveFile: false, kurtzLedger: false },
    revocations: [],
  };
  const bus = createBus();
  const storySystem = Object.create(story);
  storySystem.init({
    state, bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get() { return null; } },
  });
  const spawned = [];
  const system = Object.create(factionPresence);
  system.init({
    state, bus,
    helpers: { spawnEntity(spec) { const entity = { ...spec, id: spawned.length + 1 }; spawned.push(entity); return entity; } },
    registry: { get() { return null; } },
  });

  state.story.beatIndex = 5;
  bus.emit('ui:talkContact', { contactId: 'contact_wraith_kell', choiceId: 'burn', stationId: 'station_customs' });
  assert.equal(state.story.verge.evidence.kellPaperTrail, true);
  state.factions = state.factions || {};
  state.factions.faction_archive = { ...(state.factions.faction_archive || {}), rep: 25 };
  bus.emit('dock:docked', { stationId: 'station_drift' });
  bus.emit('ui:factionPresenceService', { stationId: 'station_drift', serviceId: 'archive_reading_room' });
  assert.equal(state.story.verge.evidence.archiveFile, true);

  bus.emit('sector:enter', { sectorId: 'sector_veil_nebula' });
  const observers = spawned.filter((entity) => entity.factionId === 'faction_verge_layers');
  assert.ok(observers.length > 0);
  assert.equal(observers.every((entity) => entity.team === 2), true);
  assert.equal(observers.every((entity) => entity.data.ai.passive === true), true);

  state.story.flags.deep_reach_operation_complete = true;
  state.story.beatIndex = 7;
  bus.emit('story:beatAdvanced', { fromIndex: 7, toIndex: 7, branch: 'traders' });
  bus.emit('ui:kurtzInteract', { action: 'takeLedger' });
  assert.equal(state.story.verge.evidence.kurtzLedger, true);
  assert.equal(state.story.verge.awake, true);
  assert.equal(state.story.verge.valeGatesRevoked, true);
  assert.equal(state.story.verge.playerUsedClosureProtocol, false);
  assert.equal(state.story.verge.revocations.length, 1);
  assert.equal(state.story.verge.revocations[0].source, 'kell+archive+kurtz');

  const awakePlans = planFactionPresence({
    sectorId: 'sector_veil_nebula',
    seed: 0x47a,
    storyFlags: {
      vergeLayersRevealed: true,
      vergeAwake: true,
      valeGatesRevoked: true,
      playerUsedVergeClosureProtocol: false,
    },
    revocationCount: 1,
  });
  const awake = awakePlans.filter((plan) => plan.factionId === 'faction_verge_layers');
  assert.ok(awake.length >= 3);
  assert.equal(awake.every((plan) => plan.vergePhase === 'awake' && plan.passive === true), true);
});
