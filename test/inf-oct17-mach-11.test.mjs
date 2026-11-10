import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { DEFAULT_CONFIG, MAX_RETAINED_FACTS } from '../src/chronicler/schema.js';
import {
  provenanceLedger, PROVENANCE_CHAIN_CAP, PROVENANCE_NODE_CAP, PROVENANCE_OPEN_INCIDENT_CAP,
} from '../src/systems/provenanceLedger.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { FENCES } from '../src/data/fences.js';
import * as saveOwner from '../src/save/saveSystem.js';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

function boot() {
  const chronicler = createChronicler({
    maxStories: MAX_RETAINED_FACTS / DEFAULT_CONFIG.maxFactsPerStory,
    publishNews: false, offerRadio: false,
  });
  const sim = createSimulation({ seed: 4242, systems: [chronicler, provenanceLedger, encounterDirector, saveOwner.save] });
  sim.state.mode = 'flight';
  sim.state.playerId = 1;
  sim.state.settings.gameplay.autosaveIntervalS = 0;
  sim.state.world.currentSectorId = 'sector_helios_prime';
  return { ...sim, chron: sim.registry.get('chronicler'), saver: sim.registry.get('save') };
}

function at(h, t) { h.state.simTime = t; h.state.tick = t * 60; }

function kill(h, i, pending = false) {
  const group = Math.floor(i / DEFAULT_CONFIG.maxFactsPerStory);
  h.bus.emit('entity:killed', {
    id: `soak-hull-${i}`, killerId: 2 + group % DEFAULT_CONFIG.maxProfiles,
    killerName: `Pilot ${group % DEFAULT_CONFIG.maxProfiles}`, victimName: `Freighter ${i}`,
    encounterId: pending ? `pending-${i}` : `episode-${group}`,
    sectorId: h.state.world.currentSectorId,
    presentation: { cause: 'ship_collision', surface: 'craft', playerCaused: false },
  });
}

function fillProvenance(h, text = 'The patrol recorded the incident.', sameTick = false) {
  for (let i = 0; i < PROVENANCE_CHAIN_CAP; i++) {
    at(h, sameTick ? 10000 : 10000 + i);
    const targetId = `patrol-hull-${i}`;
    h.bus.emit('entity:killed', { id: targetId, killerId: 1, factionId: 'faction_hegemony' });
    h.bus.emit('law:incidentReceipt', {
      attackerId: 1, targetId: `entity:${targetId}`, factionId: 'faction_hegemony',
      incidentId: `incident-${i}`, cause: 'assault', text,
    });
    for (let n = 2; n < PROVENANCE_NODE_CAP; n++) {
      h.bus.emit('faction:repChanged', {
        factionId: 'faction_hegemony', reason: 'soak', delta: -1, newRep: -n,
      });
    }
  }
}

function close(h) {
  h.chron.destroy();
  h.registry.get('provenanceLedger').destroy();
  h.saver.destroy();
}

test('seed 4242: capped memories fit the named UTF-8 envelope budget without changing live memory', () => {
  const h = boot();
  try {
    fillProvenance(h);
    at(h, 0);
    h.chron.newGame();
    for (let i = 0; i < MAX_RETAINED_FACTS; i++) {
      at(h, i + 1);
      kill(h, i);
      if ((i + 1) % DEFAULT_CONFIG.maxFactsPerStory === 0) h.chron.update(1 / 60, h.state);
    }
    for (const fence of FENCES) {
      for (let i = 0; i < 20; i++) h.bus.emit('deniable:fenceThanked', { stationId: fence.stationId });
    }
    for (let i = 0; i < DEFAULT_CONFIG.maxPending; i++) kill(h, 100000 + i, true);

    const before = h.chron.serialize();
    assert.equal(before.stories.flatMap(s => s.nodes).length, MAX_RETAINED_FACTS);
    assert.equal(before.pending.length, DEFAULT_CONFIG.maxPending);
    assert.equal(before.seen.length, DEFAULT_CONFIG.maxSeen);
    assert.equal(before.profiles.length, DEFAULT_CONFIG.maxProfiles);
    assert.equal(before.legends.length, DEFAULT_CONFIG.maxLegends);
    const provenance = h.registry.get('provenanceLedger').serialize();
    assert.equal(provenance.chains.length, PROVENANCE_CHAIN_CAP);
    assert.ok(provenance.chains.every(c => c.nodes.length === PROVENANCE_NODE_CAP));
    assert.equal(Object.keys(provenance.openIncidents).length, PROVENANCE_OPEN_INCIDENT_CAP);
    assert.equal(Object.keys(h.state.encounterDirector.stats.fences.byId).length, FENCES.length);

    const envelope = h.saver.serialize('quick');
    assert.equal(saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES, 6744064, 'pin the cap-derived envelope budget');
    console.log(`MACH-11 capped envelope: ${bytes(envelope)} UTF-8 bytes; budget ${saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES}`);
    assert.ok(bytes(envelope) <= saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES,
      `capped envelope ${bytes(envelope)} must fit named budget ${saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES}`);
    assert.deepEqual(envelope.data.chronicler, before, 'ordinary capped history is saved in full');
    assert.deepEqual(envelope.data.provenance, provenance);
    assert.deepEqual(h.chron.serialize(), before, 'saving never prunes the live archive');
    h.chron.deserialize(envelope.data.chronicler);
    assert.deepEqual(h.chron.serialize(), before, 'the bounded envelope remains a valid Continue snapshot');
  } finally { close(h); }
});

for (const sameTick of [false, true]) test(`oversized provenance saves evict oldest whole chains, retain valid incident links, and leave live records intact (same tick: ${sameTick})`, () => {
  const h = boot();
  try {
    fillProvenance(h, '界'.repeat(4096), sameTick);
    const live = h.registry.get('provenanceLedger').serialize();
    const saved = h.saver.serialize('quick').data.provenance;
    console.log(`MACH-11 long provenance: ${bytes(live)} -> ${bytes(saved)} UTF-8 bytes; chains ${live.chains.length} -> ${saved.chains.length}`);
    assert.ok(saved.chains.length < live.chains.length, 'a count cap alone cannot bound long incident text');
    assert.ok(saved.chains.length > 0, 'recent incidents still survive');
    assert.deepEqual(saved.chains.map(c => c.id), live.chains.slice(0, saved.chains.length).map(c => c.id),
      'the newest whole chains survive in their existing order');
    const ids = new Set(saved.chains.map(c => c.id));
    assert.ok(Object.values(saved.openIncidents).every(i => ids.has(i.chainId)));
    assert.deepEqual(h.registry.get('provenanceLedger').serialize(), live);
    assert.ok(bytes(h.saver.serialize('quick')) <= saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES);
    const capture = new Map(h.saver._saveCapturePlan());
    assert.deepEqual(capture.get('provenance')(), saved, 'autosave uses the same bound');
    h.registry.get('provenanceLedger').deserialize(saved);
    assert.deepEqual(h.registry.get('provenanceLedger').serialize(), saved);
  } finally { close(h); }
});

test('wide Unicode chronicler facts save whole recent stories and remain valid on Continue', () => {
  const h = boot();
  try {
    for (let i = 0; i < MAX_RETAINED_FACTS; i++) {
      at(h, i + 1);
      h.bus.emit('entity:killed', {
        id: `wide-hull-${i}`, killerId: 1, victimName: '界'.repeat(160),
        encounterId: `wide-episode-${Math.floor(i / DEFAULT_CONFIG.maxFactsPerStory)}`,
        sectorName: '界'.repeat(160), zoneName: '界'.repeat(160), stationName: '界'.repeat(160),
      });
      if ((i + 1) % DEFAULT_CONFIG.maxFactsPerStory === 0) h.chron.update(1 / 60, h.state);
    }
    const live = h.chron.serialize();
    const envelope = h.saver.serialize('quick');
    const saved = envelope.data.chronicler;
    console.log(`MACH-11 wide chronicler: ${bytes(live)} -> ${bytes(saved)} UTF-8 bytes; stories ${live.stories.length} -> ${saved.stories.length}`);
    assert.ok(saved.stories.length < live.stories.length);
    assert.ok(saved.stories.length > 0);
    assert.deepEqual(saved.stories, live.stories.slice(-saved.stories.length));
    assert.deepEqual(h.chron.serialize(), live);
    assert.ok(bytes(envelope) <= saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES);
    assert.deepEqual(new Map(h.saver._saveCapturePlan()).get('chronicler')(), saved);
    h.saver._rollbackCaptureActive = true;
    assert.deepEqual(h.saver.serializeData().chronicler, live, 'failed loads retain an exact rollback snapshot');
    h.saver._rollbackCaptureActive = false;
    h.chron.deserialize(saved);
    assert.deepEqual(h.chron.serialize(), saved);
  } finally { close(h); }
});

test('an oversized saved fence row leaves newer relationships and live trust intact', () => {
  const h = boot();
  try {
    FENCES.forEach((fence, index) => {
      at(h, 1 + index * 600);
      h.bus.emit('deniable:fenceThanked', { stationId: fence.stationId });
    });
    // Imported text is not length-bounded by the fence sanitizer. Preserve it in live memory.
    const live = h.state.encounterDirector.stats.fences;
    live.byId[FENCES[0].id].lastOutcome = '界'.repeat(4096);
    const before = structuredClone(live);
    const envelope = h.saver.serialize('quick');
    assert.equal(envelope.data.encounterDirector.stats.fences.byId[FENCES[0].id], undefined);
    assert.deepEqual(Object.keys(envelope.data.encounterDirector.stats.fences.byId).sort(),
      FENCES.slice(1).map(f => f.id).sort());
    assert.deepEqual(live, before);
    assert.ok(bytes(envelope) <= saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES);
    assert.deepEqual(new Map(h.saver._saveCapturePlan()).get('encounterDirector')(), envelope.data.encounterDirector);
  } finally { close(h); }
});

test('quiet save keeps empty memories and the absent fence key unchanged', () => {
  const h = boot();
  try {
    const before = h.chron.serialize();
    const envelope = h.saver.serialize('quick');
    assert.deepEqual(envelope.data.chronicler, before);
    assert.equal(Object.hasOwn(envelope.data.encounterDirector.stats, 'fences'), false);
    assert.equal(envelope.data.provenance.chains.length, 0);
    assert.ok(bytes(envelope) <= saveOwner.SAVE_MEMORY_SOAK_MAX_BYTES);
    assert.deepEqual(h.chron.serialize(), before);
  } finally { close(h); }
});
