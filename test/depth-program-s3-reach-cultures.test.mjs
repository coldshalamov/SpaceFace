import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  PIRATE_DOCTRINE_IDS,
  REACH_CULTURE_DOCTRINES,
  REACH_CULTURE_IDS,
  reachCultureDoctrineById,
} from '../src/data/pirateDoctrines.js';
import {
  NAMED_ACE_IDS,
  REACH_CULTURE_ACES,
  REACH_CULTURE_ACE_IDS,
  aceById,
} from '../src/data/namedAces.js';
import { ACE_MEMORY_VERSION, aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const CORE_DOCTRINES = ['toll', 'thief', 'salvage-jackal', 'tech-raider', 'ideological'];
const CORE_ACES = ['ace_yara_no_cut', 'ace_toll_saint_venn', 'ace_mako_broken_ring'];
const CULTURES = ['maw', 'rust-lords', 'drift-kings'];
const CULTURE_ACES = ['ace_maw_rake_veyra', 'ace_rust_lord_orro', 'ace_drift_king_iona'];
const CULTURE_INTRO_ROUTES = Object.freeze([
  Object.freeze({
    aceId: 'ace_maw_rake_veyra', cultureId: 'maw', cultureLabel: 'The Maw',
    sectorId: 'sector_sker_haven', zoneId: 'zone_sker_gatecamp',
    primaryVoice: 'Rake Veyra, The Maw: This lane answers to The Red Wake.',
  }),
  Object.freeze({
    aceId: 'ace_rust_lord_orro', cultureId: 'rust-lords', cultureLabel: 'The Rust-Lords',
    sectorId: 'sector_ceres_belt', zoneId: 'zone_ceres_ambush',
    primaryVoice: 'Boiler-King Orro, The Rust-Lords: This lane answers to The Nine Kettles.',
  }),
  Object.freeze({
    aceId: 'ace_drift_king_iona', cultureId: 'drift-kings', cultureLabel: 'The Drift-Kings',
    sectorId: 'sector_io_reach', zoneId: 'zone_io_merc',
    primaryVoice: 'Iona False-Face, The Drift-Kings: This lane answers to The Gilt Masks.',
  }),
]);

test('S3 adds three Reach cultures without widening the shipped B9 or B10 rosters', () => {
  assert.deepEqual(PIRATE_DOCTRINE_IDS, CORE_DOCTRINES);
  assert.deepEqual(NAMED_ACE_IDS, CORE_ACES);
  assert.deepEqual(REACH_CULTURE_IDS, CULTURES);
  assert.deepEqual(REACH_CULTURE_ACE_IDS, CULTURE_ACES);
  assert.equal(Object.keys(REACH_CULTURE_DOCTRINES).length, CULTURES.length);
  assert.equal(Object.keys(REACH_CULTURE_ACES).length, CULTURES.length);

  const culturesSeen = CULTURE_ACES.map((id) => aceById(id)?.cultureId);
  assert.deepEqual(culturesSeen, CULTURES, 'one separately exported escalation ace rides each culture');
});

test('culture profiles are valid and pairwise distinct on live SG-06 behavior axes', () => {
  const profiles = CULTURES.map((cultureId) => {
    const doctrine = reachCultureDoctrineById(cultureId);
    assert.equal(doctrine.id, cultureId);
    const normalized = normalizeFactionBehaviorProfile(doctrine.factionPresenceDoctrine);
    assert.ok(normalized, `${cultureId} must expose a complete live tactical profile`);
    assert.deepEqual(normalized, doctrine.factionPresenceDoctrine,
      `${cultureId} data must already be canonical rather than relying on runtime invention`);
    return normalized;
  });

  assert.equal(new Set(profiles.map((profile) => JSON.stringify(profile))).size, CULTURES.length,
    'every culture has a measurably distinct behavior distribution');
  const [maw, rustLords, driftKings] = profiles;
  assert.ok(maw.pursuitCommitment > rustLords.pursuitCommitment
    && rustLords.pursuitCommitment > driftKings.pursuitCommitment,
  'Maw commits hardest, Rust-Lords hold the middle, and Drift-Kings choose their fights');
  assert.equal(maw.combatDoctrineId, 'interceptor_flyby');
  assert.equal(rustLords.combatDoctrineId, 'tether_control_raider');
  assert.equal(driftKings.combatDoctrineId, 'ranged_disengager');
  assert.deepEqual(profiles.map((profile) => profile.liveFormation), ['wedge', 'line', 'ring']);
});

test('returning culture aces stamp their whole crew through makeEnemySpawnSpec into SG-06', () => {
  for (const aceId of CULTURE_ACES) {
    const evidence = returnedCrewEvidence(aceId, 0x53c017);
    const doctrine = reachCultureDoctrineById(evidence.cultureId);
    assert.ok(evidence.ships.length >= 2, `${aceId} must return with a crew`);
    assert.equal(evidence.ships.every((ship) => ship.cultureId === evidence.cultureId), true);
    assert.equal(evidence.ships.every((ship) => ship.profile === JSON.stringify(doctrine.factionPresenceDoctrine)), true,
      `${aceId} crew must carry the exact normalized culture profile`);
    assert.deepEqual(evidence.roster.profile, doctrine.factionPresenceDoctrine,
      `${aceId} culture profile must reach the production AI roster`);
    assert.equal(evidence.roster.formation, doctrine.factionPresenceDoctrine.liveFormation);
    assert.equal(evidence.roster.memberDoctrine, doctrine.factionPresenceDoctrine.combatDoctrineId);
  }
});

test('same seed and culture ace history produce byte-identical culture combat evidence', () => {
  for (const aceId of CULTURE_ACES) {
    const first = JSON.stringify(returnedCrewEvidence(aceId, 0x47a));
    const second = JSON.stringify(returnedCrewEvidence(aceId, 0x47a));
    assert.equal(second, first, `${aceId} seeded S3 evidence must be byte-identical`);
  }
});

test('culture aces enter through deterministic mapped routes 60-90 seconds after sector entry', () => {
  for (const route of CULTURE_INTRO_ROUTES) {
    const first = bootCultureIntro(route, 0x53c017);
    const second = bootCultureIntro(route, 0x53c017);
    const firstIntro = first.state.aceMemory.cultureIntros?.[route.aceId];
    const secondIntro = second.state.aceMemory.cultureIntros?.[route.aceId];
    assert.ok(firstIntro, `${route.aceId} must schedule from its natural sector`);
    assert.deepEqual(secondIntro, firstIntro, `${route.aceId} route scheduling must be seed-stable`);
    assert.equal(firstIntro.sectorId, route.sectorId);
    assert.equal(firstIntro.zoneId, route.zoneId);
    assert.equal(firstIntro.encounterId, `reachCultureIntro:${route.aceId}`);
    assert.ok(firstIntro.dueAt >= 60 && firstIntro.dueAt <= 90,
      `${route.aceId} first contact must land in the 60-90s entry window`);

    first.state.simTime = firstIntro.dueAt - 1;
    first.sim.runTicks(Math.ceil(0.55 / SIM_DT));
    assert.equal(first.appeared.length, 0, `${route.aceId} must not appear before dueAt`);
    first.state.simTime = firstIntro.dueAt;
    first.state.encounterDirector.pressure.combat = 140;
    first.sim.runTicks(Math.ceil(1.05 / SIM_DT));

    assert.equal(first.appeared.length, 1, `${route.aceId} must appear once after physical spawn`);
    const appearance = first.appeared[0];
    assert.equal(appearance.aceId, route.aceId);
    assert.equal(appearance.cultureId, route.cultureId);
    assert.equal(appearance.sectorId, route.sectorId);
    assert.equal(appearance.zoneId, route.zoneId);
    assert.ok(Array.isArray(appearance.spawnedIds) && appearance.spawnedIds.length >= 2);

    const primary = first.voices.filter((voice) => voice.encounterId === firstIntro.encounterId && voice.primary);
    assert.equal(primary.length, 1, `${route.aceId} introduction must own exactly one primary voice`);
    assert.match(primary[0].text, new RegExp(escapeRegExp(route.cultureLabel), 'i'),
      `${route.aceId} primary voice must identify its culture`);
    assert.equal(primary[0].text, route.primaryVoice,
      `${route.aceId} primary voice must use agreement-safe authored wording`);
    assert.equal(first.aceVoices.length, 0,
      `${route.aceId} appeared event must not add a second ace-memory signature voice`);

    const doctrine = reachCultureDoctrineById(route.cultureId);
    for (const id of appearance.spawnedIds) {
      const entity = first.state.entities.get(id);
      assert.ok(entity, `${route.aceId} spawned entity ${id} must exist`);
      assert.equal(entity.data.ai.cultureId, route.cultureId);
      assert.equal(entity.data.ai.namedAceId, route.aceId);
      assert.deepEqual(entity.data.ai.factionPresenceDoctrine, doctrine.factionPresenceDoctrine);
    }
    first.sim.runTicks(Math.ceil(9.1 / SIM_DT));
    const squads = first.helpers.aiRoster.listSquads(first.state.tick);
    const squad = squads.find((candidate) => candidate.id === firstIntro.encounterId);
    assert.ok(squad, `${route.aceId} first contact must reach the SG-06 roster: ${JSON.stringify(
      squads.map((candidate) => candidate.id),
    )}`);
    assert.deepEqual(squad.factionBehavior, doctrine.factionPresenceDoctrine);
  }
});

test('culture introduction respects director pacing and retries at a deterministic 10-second cadence', () => {
  const route = CULTURE_INTRO_ROUTES[1];
  const h = bootCultureIntro(route, 0x47a);
  const intro = h.state.aceMemory.cultureIntros?.[route.aceId];
  assert.ok(intro);
  h.state.simTime = intro.dueAt;
  h.state.encounterDirector.pressure.combat = 140;
  h.state.encounterDirector.lastMeaningfulAt = h.state.simTime;
  h.sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.equal(h.appeared.length, 0, 'a fresh meaningful encounter gap must block the ace intro');
  const retried = h.state.aceMemory.cultureIntros[route.aceId];
  assert.equal(retried.dueAt, Math.ceil(h.state.simTime) + 10,
    'a pacing rejection must move the persisted due time by exactly ten sim-seconds');

  h.state.encounterDirector.lastMeaningfulAt = h.state.simTime - 31;
  h.state.simTime = retried.dueAt;
  h.sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.equal(h.appeared.length, 1, 'the same pending intro must fire once pacing clears');
  assert.equal(h.appeared[0].encounterId, `reachCultureIntro:${route.aceId}`);
});

test('save mid-introduction rearms first contact while fled and defeated aces stay terminal', () => {
  const route = CULTURE_INTRO_ROUTES[2];
  const live = bootCultureIntro(route, 0x5a9e);
  const due = live.state.aceMemory.cultureIntros?.[route.aceId]?.dueAt;
  assert.ok(Number.isFinite(due));
  live.state.simTime = due;
  live.state.encounterDirector.pressure.combat = 140;
  live.sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.equal(live.appeared.length, 1);
  const snapshot = live.registry.get('aceMemory').serialize();

  const restored = bootCultureIntro(route, 0x5a9e, { emitSectorEnter: false });
  restored.state.simTime = live.state.simTime;
  restored.registry.get('aceMemory').deserialize(snapshot);
  restored.bus.emit('save:loaded', { slot: 1 });
  const rearmed = restored.state.aceMemory.cultureIntros?.[route.aceId];
  assert.equal(rearmed.status, 'pending', 'live entity ids are transient, so load must rearm first contact');
  assert.ok(rearmed.dueAt >= restored.state.simTime + 60 && rearmed.dueAt <= restored.state.simTime + 90);
  assert.equal(restored.state.encounterDirector.live[rearmed.encounterId], undefined);

  for (const terminal of ['fled', 'defeated']) {
    const h = bootCultureIntro(route, 0x5a9e, { emitSectorEnter: false });
    h.bus.emit(`namedAce:${terminal}`, { aceId: route.aceId, sectorId: route.sectorId });
    h.bus.emit('sector:enter', { sectorId: route.sectorId });
    assert.equal(h.state.aceMemory.cultureIntros?.[route.aceId], undefined,
      `${terminal} culture ace must not be scheduled for another first contact`);
  }
});

test('continuous sector membership schedules first contact without resetting its due time', () => {
  const route = CULTURE_INTRO_ROUTES[0];
  const h = bootCultureIntro(route, 0xc017, { emitSectorEnter: false });
  h.bus.emit('sector:enter', { sectorId: route.sectorId, continuous: true, noTeleport: true });
  const scheduled = h.state.aceMemory.cultureIntros?.[route.aceId];
  assert.ok(scheduled, 'natural continuous free-flight entry must schedule the mapped culture intro');
  const dueAt = scheduled.dueAt;
  h.state.simTime += 7;
  h.bus.emit('sector:enter', { sectorId: route.sectorId, continuous: true, noTeleport: true });
  assert.equal(h.state.aceMemory.cultureIntros[route.aceId].dueAt, dueAt,
    'membership jitter must preserve the original deterministic due time');
});

test('zero deck pressure blocks an authored culture intro with a deterministic retry', () => {
  const h = blockedCultureIntroHarness('zero-pressure');
  h.state.encounterDirector.pressure.combat = 0;
  assertCultureIntroRetry(h, 'pressure');
});

test('cooldown and rolling major quota each block authored culture intros', () => {
  const cooldown = blockedCultureIntroHarness('cooldown');
  cooldown.state.encounterDirector.cooldowns.named_hunter = cooldown.state.simTime + 120;
  assertCultureIntroRetry(cooldown, 'cooldown');

  const quota = blockedCultureIntroHarness('major-quota');
  quota.state.encounterDirector.window.push({ t: quota.state.simTime, tier: 'major' });
  assertCultureIntroRetry(quota, 'major_quota');
});

test('two live meaningful encounters block a third authored culture intro', () => {
  const h = blockedCultureIntroHarness('meaningful-cap');
  h.state.encounterDirector.live.first = { id: 'first', tier: 'minor', deck: 'civilian' };
  h.state.encounterDirector.live.second = { id: 'second', tier: 'minor', deck: 'civilian' };
  assertCultureIntroRetry(h, 'meaningful_cap');
});

test('continuous sector jitter preserves an already-live culture introduction', () => {
  const route = CULTURE_INTRO_ROUTES[0];
  const h = bootCultureIntro(route, 0x1a7e);
  const intro = h.state.aceMemory.cultureIntros[route.aceId];
  h.state.simTime = intro.dueAt;
  h.state.encounterDirector.pressure.combat = 140;
  h.registry.get('aceMemory')._processCultureIntros(h.state);
  const live = structuredClone(h.state.aceMemory.cultureIntros[route.aceId]);
  assert.equal(live.status, 'live');
  assert.equal(h.appeared.length, 1);
  h.state.simTime += 4;
  h.bus.emit('sector:enter', { sectorId: route.sectorId, continuous: true, noTeleport: true });
  assert.deepEqual(h.state.aceMemory.cultureIntros[route.aceId], live,
    'repeat continuous membership must not replace a live encounter with a pending timer');
  assert.equal(h.appeared.length, 1);
});

test('ace-memory v1 saves migrate additively to the culture-introduction schema', () => {
  const route = CULTURE_INTRO_ROUTES[1];
  const h = bootCultureIntro(route, 0xc017, { emitSectorEnter: false });
  h.registry.get('aceMemory').deserialize({
    schemaVersion: 1,
    news: { legacy: true },
    activeReturns: {},
    [route.aceId]: { id: route.aceId, encountered: false, fled: false, defeated: false },
  });
  assert.equal(ACE_MEMORY_VERSION, 2);
  assert.equal(h.state.aceMemory.schemaVersion, 2);
  assert.deepEqual(h.state.aceMemory.cultureIntros, {});
  assert.equal(h.state.aceMemory.news.legacy, true);
  h.bus.emit('sector:enter', { sectorId: route.sectorId });
  assert.ok(h.state.aceMemory.cultureIntros[route.aceId],
    'a migrated non-terminal ace remains eligible for natural first contact');
});

function bootCultureIntro(route, seed, options = {}) {
  const sim = createSimulation({
    seed,
    systems: [aceMemory, spawnBudget, encounterDirector, aiPorts],
  });
  const { state, bus, helpers, registry } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = route.sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 10,
  });
  state.playerId = player.id;
  const appeared = [];
  const voices = [];
  const aceVoices = [];
  bus.on('namedAce:appeared', (payload) => appeared.push(structuredClone(payload)));
  bus.on('encounter:voice', (payload) => voices.push(structuredClone(payload)));
  bus.on('aceMemory:voice', (payload) => aceVoices.push(structuredClone(payload)));
  if (options.emitSectorEnter !== false) bus.emit('sector:enter', { sectorId: route.sectorId });
  return { sim, state, bus, helpers, registry, appeared, voices, aceVoices };
}

function blockedCultureIntroHarness(label) {
  const route = CULTURE_INTRO_ROUTES[1];
  const h = bootCultureIntro(route, 0x53c017 + label.length);
  const intro = h.state.aceMemory.cultureIntros[route.aceId];
  h.state.simTime = intro.dueAt;
  h.state.encounterDirector.pressure.combat = 140;
  h.state.encounterDirector.lastMeaningfulAt = h.state.simTime - 31;
  h.state.encounterDirector.lastMajorAt = -1e9;
  h.state.encounterDirector.window = [];
  h.state.encounterDirector.cooldowns = {};
  return h;
}

function assertCultureIntroRetry(h, reason) {
  const route = CULTURE_INTRO_ROUTES[1];
  h.registry.get('aceMemory')._processCultureIntros(h.state);
  const retried = h.state.aceMemory.cultureIntros[route.aceId];
  assert.equal(h.appeared.length, 0, `${reason} must block physical spawn`);
  assert.equal(retried.status, 'pending');
  assert.equal(retried.lastRejectReason, reason);
  assert.equal(retried.dueAt, Math.ceil(h.state.simTime) + 10);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function returnedCrewEvidence(aceId, seed) {
  const sim = createSimulation({ seed, systems: [spawnBudget, aceMemory, aiPorts] });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 25, z: -15 }, hull: 200, hullMax: 200, radius: 10,
  });
  state.playerId = player.id;
  let returnEvent = null;
  bus.on('aceMemory:returnSpawned', (payload) => { returnEvent = payload; });
  bus.emit('namedAce:fled', { aceId, sectorId: state.world.currentSectorId });
  const record = state.aceMemory[aceId];
  assert.ok(record?.returnScheduled, `${aceId} must schedule through existing ace memory`);
  state.simTime = record.returnAt;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));
  assert.ok(returnEvent, `${aceId} must spawn after its deterministic return schedule`);

  const ace = aceById(aceId);
  const ships = returnEvent.spawnedIds.map((id) => state.entities.get(id)).map((entity) => ({
    id: entity.id,
    role: entity.data.aceMemory.role,
    archetype: entity.data.ai.archetype,
    level: entity.data.aceMemory.level,
    cultureId: entity.data.aceMemory.cultureId,
    profile: JSON.stringify(entity.data.ai.factionPresenceDoctrine),
    position: [round(entity.pos.x), round(entity.pos.z)],
  }));
  const squad = helpers.aiRoster.listSquads(state.tick)
    .find((candidate) => candidate.id === returnEvent.requestId);
  assert.ok(squad, `${aceId} return must be visible to aiPorts`);
  const boss = squad.members.find((member) => member.id === returnEvent.spawnedIds[0]);
  assert.ok(boss, `${aceId} boss must be a live SG-06 roster member`);
  return {
    aceId: ace.id,
    cultureId: ace.cultureId,
    returnTier: returnEvent.returnTier,
    requestId: returnEvent.requestId,
    ships,
    roster: {
      doctrine: squad.doctrine,
      formation: squad.formation,
      profile: squad.factionBehavior,
      memberDoctrine: boss.combatDoctrineId,
    },
  };
}

function round(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}
