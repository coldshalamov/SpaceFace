#!/usr/bin/env node
// Depth Program S3 Reach culture combat groundwork.
// Emits a compact deterministic doctrine/return log suitable for aggregate evidence capture.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  REACH_CULTURE_IDS,
  reachCultureDoctrineById,
} from '../src/data/pirateDoctrines.js';
import {
  REACH_CULTURE_ACE_IDS,
  aceById,
} from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

assert.equal(typeof window, 'undefined', 'S3 culture check must run headless');
assert.deepEqual(REACH_CULTURE_IDS, ['maw', 'rust-lords', 'drift-kings']);
assert.equal(REACH_CULTURE_ACE_IDS.length, REACH_CULTURE_IDS.length,
  'one escalation ace is required per Reach culture');

const EVIDENCE_SEED = 0x53c017;
const EVIDENCE_URL = new URL('../.devshots/depth-program-s3-culture-behavior.json', import.meta.url);
const INTRO_ROUTES = Object.freeze([
  Object.freeze({ aceId: 'ace_maw_rake_veyra', cultureId: 'maw', cultureLabel: 'The Maw', sectorId: 'sector_sker_haven', zoneId: 'zone_sker_gatecamp', primaryVoice: 'Rake Veyra, The Maw: This lane answers to The Red Wake.' }),
  Object.freeze({ aceId: 'ace_rust_lord_orro', cultureId: 'rust-lords', cultureLabel: 'The Rust-Lords', sectorId: 'sector_ceres_belt', zoneId: 'zone_ceres_ambush', primaryVoice: 'Boiler-King Orro, The Rust-Lords: This lane answers to The Nine Kettles.' }),
  Object.freeze({ aceId: 'ace_drift_king_iona', cultureId: 'drift-kings', cultureLabel: 'The Drift-Kings', sectorId: 'sector_io_reach', zoneId: 'zone_io_merc', primaryVoice: 'Iona False-Face, The Drift-Kings: This lane answers to The Gilt Masks.' }),
]);
const first = evidenceRun(EVIDENCE_SEED);
const second = evidenceRun(EVIDENCE_SEED);
assert.equal(new Set(first.cultures.map((row) => JSON.stringify(row.profile))).size, first.cultures.length,
  'the three Reach cultures must remain pairwise distinct');

const evidence = {
  schema: 'spaceface.depth_program.s3_culture_behavior.v2',
  check: 'depth-program-s3-reach-cultures',
  seed: EVIDENCE_SEED,
  cultures: first.cultures,
  firstContacts: first.firstContacts,
};
const repeatedEvidence = { ...evidence, cultures: second.cultures, firstContacts: second.firstContacts };
assert.doesNotThrow(() => JSON.stringify(evidence), 'S3 evidence must contain plain JSON data only');
const evidenceBytes = `${JSON.stringify(evidence, null, 2)}\n`;
const repeatedBytes = `${JSON.stringify(repeatedEvidence, null, 2)}\n`;
assert.equal(repeatedBytes, evidenceBytes, 'same seed must produce byte-identical S3 evidence');
mkdirSync(new URL('../.devshots/', import.meta.url), { recursive: true });
writeFileSync(EVIDENCE_URL, evidenceBytes, 'utf8');

console.log(evidenceBytes.trimEnd());
console.log('[check-depth-program-s3-reach-cultures] PASS - 3 mapped first contacts, 3 distinct cultures, 3 returning aces, seeded evidence stable');

function evidenceRun(seed) {
  return {
    cultures: REACH_CULTURE_ACE_IDS.map((aceId) => returnEvidence(aceId, seed)),
    firstContacts: INTRO_ROUTES.map((route) => firstContactEvidence(route, seed)),
  };
}

function firstContactEvidence(route, seed) {
  const sim = createSimulation({ seed, systems: [aceMemory, spawnBudget, encounterDirector, aiPorts] });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = route.sectorId;
  state.playerId = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 10,
  }).id;
  const appeared = [];
  const voices = [];
  const aceVoices = [];
  bus.on('namedAce:appeared', (payload) => appeared.push(structuredClone(payload)));
  bus.on('encounter:voice', (payload) => voices.push(structuredClone(payload)));
  bus.on('aceMemory:voice', (payload) => aceVoices.push(structuredClone(payload)));
  bus.emit('sector:enter', { sectorId: route.sectorId, continuous: true, noTeleport: true });
  const intro = state.aceMemory.cultureIntros[route.aceId];
  assert.ok(intro, `${route.aceId}: continuous sector entry must schedule first contact`);
  assert.ok(intro.dueAt >= 60 && intro.dueAt <= 90, `${route.aceId}: dueAt must be in the 60-90s window`);
  assert.equal(intro.zoneId, route.zoneId);
  state.simTime = intro.dueAt;
  state.encounterDirector.pressure.combat = 140;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.equal(appeared.length, 1, `${route.aceId}: physical spawn must emit one appeared event`);
  const primary = voices.filter((voice) => voice.encounterId === intro.encounterId && voice.primary);
  assert.equal(primary.length, 1, `${route.aceId}: first contact must have one primary line`);
  assert.match(primary[0].text, new RegExp(escapeRegExp(route.cultureLabel), 'i'));
  assert.equal(primary[0].text, route.primaryVoice, `${route.aceId}: primary wording must stay authored and agreement-safe`);
  assert.equal(aceVoices.length, 0, `${route.aceId}: appeared must not double-speak its signature`);
  const culture = reachCultureDoctrineById(route.cultureId);
  const spawnSignature = appeared[0].spawnedIds.map((id) => {
    const entity = state.entities.get(id);
    assert.deepEqual(entity.data.ai.factionPresenceDoctrine, culture.factionPresenceDoctrine);
    return {
      role: entity.data.ai.encounterRole,
      archetype: entity.data.ai.archetype,
      cultureId: entity.data.ai.cultureId,
      namedAceId: entity.data.ai.namedAceId,
      x: round(entity.pos.x),
      z: round(entity.pos.z),
    };
  });
  sim.runTicks(Math.ceil(9.1 / SIM_DT));
  const squad = helpers.aiRoster.listSquads(state.tick)
    .find((candidate) => candidate.id === intro.encounterId);
  assert.ok(squad, `${route.aceId}: staged entrance must promote into the SG-06 roster`);
  assert.deepEqual(squad.factionBehavior, culture.factionPresenceDoctrine);
  const saveRearm = saveRearmEvidence(sim.registry.get('aceMemory').serialize(), route, seed, state.simTime);
  return {
    aceId: route.aceId,
    cultureId: route.cultureId,
    sectorId: route.sectorId,
    zoneId: route.zoneId,
    encounterId: intro.encounterId,
    dueAfterEntryS: intro.dueAt,
    pressureAtFire: 140,
    primaryVoice: primary[0].text,
    spawnedCount: appeared[0].spawnedIds.length,
    rosterFormation: squad.formation,
    spawnSignature,
    saveRearm,
  };
}

function saveRearmEvidence(snapshot, route, seed, simTime) {
  const restored = createSimulation({ seed, systems: [aceMemory, spawnBudget, encounterDirector, aiPorts] });
  restored.state.mode = 'flight';
  restored.state.world.currentSectorId = route.sectorId;
  restored.state.simTime = simTime;
  restored.registry.get('aceMemory').deserialize(snapshot);
  restored.bus.emit('save:loaded', { slot: 1 });
  const rearmed = restored.state.aceMemory.cultureIntros[route.aceId];
  assert.equal(rearmed.status, 'pending', `${route.aceId}: save mid-intro must rearm`);
  const dueAfterLoadS = round(rearmed.dueAt - simTime);
  assert.ok(dueAfterLoadS >= 60 && dueAfterLoadS <= 90);
  assert.equal(restored.state.encounterDirector.live[rearmed.encounterId], undefined);
  return { status: rearmed.status, dueAfterLoadS, staleLiveEntityIds: false };
}

function returnEvidence(aceId, seed) {
  const ace = aceById(aceId);
  const culture = reachCultureDoctrineById(ace.cultureId);
  const profile = normalizeFactionBehaviorProfile(culture.factionPresenceDoctrine);
  assert.ok(profile, `${culture.id}: profile must normalize`);

  const sim = createSimulation({ seed, systems: [spawnBudget, aceMemory, aiPorts] });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 25, z: -15 }, hull: 200, hullMax: 200, radius: 10,
  });
  state.playerId = player.id;
  let returned = null;
  bus.on('aceMemory:returnSpawned', (payload) => { returned = payload; });
  bus.emit('namedAce:fled', { aceId, sectorId: state.world.currentSectorId });
  state.simTime = state.aceMemory[aceId].returnAt;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.ok(returned, `${aceId}: scheduled return must spawn`);

  const squad = helpers.aiRoster.listSquads(state.tick).find((row) => row.id === returned.requestId);
  assert.ok(squad, `${aceId}: return crew must enter the SG-06 roster`);
  assert.deepEqual(squad.factionBehavior, profile, `${aceId}: SG-06 must consume the culture profile`);
  return {
    cultureId: culture.id,
    aceId,
    doctrine: profile.combatDoctrineId,
    pursuit: profile.pursuitCommitment,
    preferredRange: profile.preferredRange,
    formation: squad.formation,
    retreatHullFraction: profile.retreatHullFraction,
    disableChance: profile.disableChance,
    destroyTarget: profile.destroyTarget,
    spawnedCount: returned.spawnedIds.length,
    spawnSignature: returned.spawnedIds.map((id) => {
      const entity = state.entities.get(id);
      assert.deepEqual(entity.data.ai.factionPresenceDoctrine, profile);
      return {
        role: entity.data.aceMemory.role,
        archetype: entity.data.ai.archetype,
        level: entity.data.aceMemory.level,
        x: round(entity.pos.x),
        z: round(entity.pos.z),
      };
    }),
    profile,
  };
}

function round(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
