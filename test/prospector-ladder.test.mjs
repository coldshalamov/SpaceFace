// CL-03 Prospector professional ladder — focused candidate suite.
// Run: node --test test/prospector-ladder.test.mjs
// Does not touch package.json, goldens, registry, save, UI, systems, or peer ladders.
// All behavioral fixtures use exact live emitter payload shapes (no invented fields).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAREER_LADDER_EVENTS,
  LADDER_REWARD_EVENTS,
  LADDER_STATUS,
  STEP_STATUS,
  assertNoNondeterminism,
  attemptMultiplier,
  isForbiddenHeatEvent,
  validateLadderDefinition,
} from '../src/careers/ladders/ladderShared.js';
import {
  ensureCareerLaddersState,
  serializeCareerLadders,
  deserializeCareerLadders,
} from '../src/careers/ladders/ladderSchema.js';
import {
  clearLadderDefinitions,
  registerLadderDefinition,
  getLadderDefinition,
} from '../src/careers/ladders/careerLadders.js';
import {
  PROSPECTOR_LADDER_DEF,
  PROSPECTOR_LADDER_FAILURE,
  PROSPECTOR_LADDER_ID,
  PROSPECTOR_LADDER_PARAMS,
  PROSPECTOR_LADDER_STEP_IDS,
  PROSPECTOR_ROLE_HULL_DEF_ID,
  PROSPECTOR_SKILL_PROOF_KEY,
  assertProspectorLadderCopyBudget,
} from '../src/careers/ladders/prospectorLadderDefs.js';
import {
  acceptProspectorLadder,
  applyProspectorLadderEvent,
  completeProspectorLadderStep,
  createProspectorLadderSystem,
  ensureProspectorLadderRegistered,
  failProspectorLadderStep,
  getProspectorLadderProgress,
  getProspectorLeaf,
  listProspectorLadderListenEvents,
  offerProspectorLadder,
  recoverProspectorLadder,
  resetProspectorLadderRegistration,
} from '../src/careers/ladders/prospectorLadderFsm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// ── Live-shaped fixtures (mirror real emitters; no invented fields) ───────────

/** scanner.js:182 */
function liveScanPulse(x = 0, z = 0) {
  return { pos: { x, z } };
}

/** scanner.js:224 */
function liveScanCompleted(found, sectorId = 'sector_helios') {
  return {
    targetId: null,
    sectorId,
    found: {
      asteroids: found.asteroids || 0,
      wrecks: found.wrecks || 0,
      anomalies: found.anomalies || 0,
    },
  };
}

/** missions.js:675 */
function liveMissionAccepted(missionId, type = 'recon_scan') {
  return { missionId, type, storyTag: 'ladder.prospector:survey_circuit' };
}

/** missions.js:1368 / 1401 */
function liveMissionCompleted(missionId, type = 'recon_scan') {
  return { missionId, type, factionId: 'faction_mts', repMult: 0.2 };
}

/** missions.js:1433 */
function liveMissionFailed(missionId, reason = 'deadline') {
  return { missionId, reason };
}

/** missions.js:1456 */
function liveMissionExpired(missionId) {
  return { missionId, reason: 'deadline' };
}

/** mining.js:291 */
function liveMiningYield(opts = {}) {
  return {
    commodityId: opts.commodityId || 'cmdty_ore_iron',
    qty: opts.qty != null ? opts.qty : 1,
    pos: opts.pos || { x: 10, z: 10 },
    minerId: opts.minerId,
    ...(opts.richCore ? { richCore: true } : {}),
  };
}

/** mining.js:726 */
function liveSeamHit(asteroidId = 'ast_1') {
  return { asteroidId };
}

/** mining.js:592-600 */
function liveBulkHaul(massU = 8) {
  return {
    stationId: 'station_refinery',
    chunkId: 'chunk_bulk_1',
    massU,
    commodityId: 'cmdty_ore_iron',
    basePrice: 12,
    gross: massU * 12,
    fee: Math.round(massU * 1.2),
    credits: Math.round(massU * 10.8),
  };
}

/** combat.js:374-378 — NPC only; never for player */
function liveEntityKilled(opts = {}) {
  return {
    id: opts.id || 'scav_1',
    killerId: opts.killerId,
    type: opts.type || 'ship',
    pos: opts.pos || { x: 0, z: 0 },
    factionId: opts.factionId || 'faction_reach',
    factionLawful: !!opts.factionLawful,
    bountyCr: opts.bountyCr || 0,
    lootTableId: opts.lootTableId || null,
    victimClass: opts.victimClass || 'fighter',
  };
}

/** combat.js:412 */
function livePlayerDeath(killerId = 'enemy_1') {
  return { pos: { x: 5, z: 5 }, killerId };
}

/** encounterDirector.js:368-371 */
function liveEncounterSpawned(encounterId = 'enc_claim_1') {
  return {
    encounterId,
    kind: 'claim_threat',
    squadId: 'sq_claim_1',
    sectorId: 'sector_helios',
    zoneId: 'zone_belt',
    count: 2,
  };
}

/** encounterDirector.js:656-659 */
function liveEncounterResolved(opts = {}) {
  return {
    encounterId: opts.encounterId || 'enc_claim_1',
    shape: 'claim_threat',
    kind: 'claim_threat',
    outcome: opts.outcome || 'defended',
    sectorId: 'sector_helios',
    zoneId: 'zone_belt',
    tier: 'minor',
    deck: 'combat',
    t: opts.t || 200,
  };
}

/** claims.js:85 */
function liveClaimClaimed(body) {
  return { body };
}

/** claims.js:122 */
function liveModuleBuilt(bodyId, modId = 'mod_refinery') {
  return { bodyId, modId };
}

/** economy.js:616-620 */
function liveTradeSell(qty = 8) {
  return {
    stationId: 'station_refinery',
    commodityId: 'cmdty_ore_iron',
    side: 'sell',
    qty,
    unitAvg: 12,
    total: qty * 12,
    priceImpactPct: 0.01,
    profit: qty * 4,
    factionId: 'faction_mts',
  };
}

/** heat.js:270-275 */
function liveHeatChanged(value = 0.2) {
  return {
    value,
    level: value >= 0.15 ? 'wanted' : 'cool',
    zone: null,
    reason: 'test',
  };
}

/** fieldDepletion.js:226-234 — no refined field */
function liveFieldDepletion(opts = {}) {
  return {
    fieldId: opts.fieldId || 'field_1',
    sectorId: opts.sectorId || 'sector_helios',
    depleted: opts.depleted != null ? opts.depleted : 0.2,
    richnessMult: opts.richnessMult != null ? opts.richnessMult : 0.85,
    extractedU: opts.extractedU != null ? opts.extractedU : 12,
    destroyedCount: opts.destroyedCount != null ? opts.destroyedCount : 1,
    reason: opts.reason || 'asteroid_destroyed',
  };
}

/** tetherGameplay.js:169 */
function liveTetherLatched(targetId = 'chunk_1') {
  return { targetId, type: 'tether_cable' };
}

/** cargo.js:62 */
function liveCargoFull(commodityId = 'cmdty_ore_iron') {
  return { commodityId };
}

/** Seed fair-grade scanned asteroids as scanner.js would before scan:completed. */
function seedScannedMetallic(state, n = 1) {
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      id: `ast_scan_${i}`,
      type: 'asteroid',
      alive: true,
      pos: { x: i * 20, z: 0 },
      data: {
        typeId: 'ast_metallic',
        scanOreGlyph: 'Fe',
        scanHighlightUntil: (state.simTime || 0) + 10,
      },
    });
  }
  state.entityList = list;
  if (state.entities && typeof state.entities.set === 'function') {
    for (const e of list) state.entities.set(e.id, e);
  } else {
    state.entities = new Map(list.map((e) => [e.id, e]));
  }
  return list;
}

function makeHarness(seed = 7703, opts = {}) {
  resetProspectorLadderRegistration();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 200;
  state.tick = 12000;
  state.playerId = state.playerId || 'player';
  state.player = state.player || {};
  state.player.credits = opts.credits != null ? opts.credits : 50000;
  state.player.heat = opts.heat != null ? opts.heat : 0;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0 };
  state.claims = state.claims || { bodies: [] };
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: 'idle' },
    hunter: { status: 'idle' },
    prospector: { status: opts.originStatus || 'completed' },
  };
  ensureCareerLaddersState(state);

  const bus = createBus();
  const intents = [];
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
    if (
      event === LADDER_REWARD_EVENTS.GRANT_CREDITS
      || event === LADDER_REWARD_EVENTS.CHARGE_CREDITS
      || event === LADDER_REWARD_EVENTS.REP_DELTA
      || isForbiddenHeatEvent(event)
    ) {
      intents.push({ event, payload });
    }
    return origEmit(event, payload);
  };

  ensureProspectorLadderRegistered();
  const system = createProspectorLadderSystem();
  system.init({ state, bus });

  return { state, bus, system, intents, events, seed };
}

function ownRoleHull(h) {
  const ships = h.state.player.ownedShips || (h.state.player.ownedShips = []);
  if (!ships.some((ship) => ship && ship.defId === PROSPECTOR_ROLE_HULL_DEF_ID)) {
    ships.push({ defId: PROSPECTOR_ROLE_HULL_DEF_ID, fittings: [] });
  }
}

function activateAtStep(h, stepIndex = 0) {
  const r = acceptProspectorLadder(h.state, h.bus, { ignorePrereqs: true, stepIndex });
  assert.equal(r.ok, true, `accept failed: ${r.reason}`);
  const own = getProspectorLeaf(h.state);
  if (own.stepIndex !== stepIndex) {
    while (own.stepIndex < stepIndex && own.status === LADDER_STATUS.ACTIVE) {
      completeProspectorLadderStep(h.state, h.bus);
    }
  }
  return own;
}

function advanceToConflict(h) {
  activateAtStep(h, 0);
  for (let i = 0; i < 3; i++) completeProspectorLadderStep(h.state, h.bus);
  const body = {
    id: 'claim_def',
    poiId: 'p1',
    name: 'Defense Rock',
    x: 100,
    z: 200,
    modules: [],
  };
  h.state.claims.bodies.push(body);
  const own = getProspectorLeaf(h.state);
  own.activeClaimId = body.id;
  own.steps.claim_conflict.payload.activeClaimId = body.id;
  return body;
}

// ── Isolation / existence ─────────────────────────────────────────────────────

test('candidate modules exist under allowlist paths', () => {
  for (const rel of [
    'src/careers/ladders/prospectorLadderDefs.js',
    'src/careers/ladders/prospectorLadderFsm.js',
    'test/prospector-ladder.test.mjs',
    '.campaign/CAREER-PROSPECTOR-LADDER-GROK-001/prompt.md',
  ]) {
    assert.equal(existsSync(join(repoRoot, rel)), true, `missing ${rel}`);
  }
});

test('CL-determinism: no Math.random or Date.now in prospector ladder modules', () => {
  for (const rel of [
    'src/careers/ladders/prospectorLadderDefs.js',
    'src/careers/ladders/prospectorLadderFsm.js',
  ]) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    const flags = assertNoNondeterminism(src);
    assert.equal(flags.hasMathRandom, false, rel);
    assert.equal(flags.hasDateNow, false, rel);
  }
});

test('source isolation: no registry/save/UI/input/package imports', () => {
  for (const rel of [
    'src/careers/ladders/prospectorLadderDefs.js',
    'src/careers/ladders/prospectorLadderFsm.js',
  ]) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    assert.equal(/from\s+['"][^'"]*registry\.js['"]/.test(src), false, rel);
    assert.equal(/from\s+['"][^'"]*saveSystem\.js['"]/.test(src), false, rel);
    assert.equal(/from\s+['"][^'"]*input\.js['"]/.test(src), false, rel);
    assert.equal(/from\s+['"][^'"]*hud\.js['"]/.test(src), false, rel);
  }
});

test('player-facing copy stays within 12-word budget', () => {
  const result = assertProspectorLadderCopyBudget(12);
  assert.equal(result.ok, true, `offenders: ${JSON.stringify(result.offenders)}`);
});

// ── Definition / validation ───────────────────────────────────────────────────

test('PROSPECTOR_LADDER_DEF validates and registers', () => {
  resetProspectorLadderRegistration();
  const v = validateLadderDefinition(PROSPECTOR_LADDER_DEF);
  assert.equal(v.ok, true, v.errors && v.errors.join('; '));
  assert.equal(PROSPECTOR_LADDER_DEF.careerId, PROSPECTOR_LADDER_ID);
  assert.equal(PROSPECTOR_LADDER_DEF.nonBinding, true);
  assert.equal(PROSPECTOR_LADDER_DEF.steps.length, 6);
  assert.deepEqual(
    PROSPECTOR_LADDER_DEF.steps.map((s) => s.id),
    [...PROSPECTOR_LADDER_STEP_IDS],
  );
  const reg = registerLadderDefinition(PROSPECTOR_LADDER_DEF);
  assert.equal(reg.ok, true, reg.reason || (reg.errors && reg.errors.join('; ')));
  assert.equal(getLadderDefinition(PROSPECTOR_LADDER_ID).careerId, PROSPECTOR_LADDER_ID);
});

test('DEF-04: definition rejects heat/cargo/beatIndex if smuggled into rewards', () => {
  resetProspectorLadderRegistration();
  const bad = {
    ...PROSPECTOR_LADDER_DEF,
    careerId: 'prospector_bad',
    steps: PROSPECTOR_LADDER_DEF.steps.map((s, i) => (
      i === 0
        ? { ...s, rewards: { credits: 10, heat: 0.2 } }
        : s
    )),
  };
  const v = validateLadderDefinition(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('heat') || e.includes('forbidden')));
});

test('CL-no-heat-delta: reward events never advertise heat', () => {
  for (const step of PROSPECTOR_LADDER_DEF.steps) {
    const rewards = step.rewards || {};
    assert.equal(Object.prototype.hasOwnProperty.call(rewards, 'heat'), false);
    if (Array.isArray(rewards.intents)) {
      for (const intent of rewards.intents) {
        assert.equal(isForbiddenHeatEvent(intent.event), false, intent.event);
      }
    }
  }
  assert.equal(
    Object.prototype.hasOwnProperty.call(LADDER_REWARD_EVENTS, 'HEAT_DELTA'),
    false,
  );
});

test('failure inventory only lists codes real events can arm', () => {
  assert.equal(PROSPECTOR_LADDER_FAILURE.survey_circuit.empty_pulse, 'empty_pulse');
  assert.equal(PROSPECTOR_LADDER_FAILURE.survey_circuit.timer, 'timer');
  assert.equal(PROSPECTOR_LADDER_FAILURE.survey_circuit.targets_despawned, undefined);
  assert.equal(Object.keys(PROSPECTOR_LADDER_FAILURE.claim_stake).length, 0);
  assert.equal(Object.keys(PROSPECTOR_LADDER_FAILURE.refinery_sector_consequence).length, 0);
  assert.ok(PROSPECTOR_LADDER_FAILURE.claim_conflict.player_destroyed);
});

test('verified listen events cover live seams only', () => {
  const all = new Set(listProspectorLadderListenEvents());
  for (const e of [
    'scan:completed', 'scan:pulse',
    'mission:accepted', 'mission:completed', 'mission:failed', 'mission:expired',
    'mining:yield', 'mining:seamHit', 'mining:richCoreCompleted',
    'cargo:full', 'tether:latched', 'tether:broke', 'weapons:vent',
    'claim:claimed', 'claim:moduleBuilt',
    'encounter:spawned', 'encounter:resolved', 'encounter:receipt',
    'entity:killed', 'player:death', 'heat:changed', 'dock:docked',
    'economy:tradeCompleted', 'mining:bulkHaulDelivered', 'fieldDepletion:changed',
  ]) {
    assert.equal(all.has(e), true, `missing listen ${e}`);
  }
  assert.equal(all.has('credits:changed'), false);
});

// ── Unlock / non-binding ──────────────────────────────────────────────────────

test('CL-nonbinding: prospector complete does not exclusive-lock peers', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  ownRoleHull(h);
  for (let i = 0; i < 5; i++) {
    completeProspectorLadderStep(h.state, h.bus);
  }
  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.flags.exclusive, false);
  assert.equal(own.flags.blocksOtherCareers, false);
  assert.equal(own.nonBinding, true);
  assert.equal(h.state.careers.origins.hauler.status, 'idle');
  assert.equal(h.state.careers.origins.hunter.status, 'idle');
  assert.equal(h.events.some((e) => e.event === 'story:beatAdvanced'), false);
});

test('soft unlock via skillProof mining_yield_u without origin complete', () => {
  const h = makeHarness(8801, { originStatus: 'idle' });
  const blocked = offerProspectorLadder(h.state, h.bus);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'prerequisites_unmet');

  const ladders = ensureCareerLaddersState(h.state);
  ladders.__meta.skillProof[PROSPECTOR_SKILL_PROOF_KEY] = 3;
  const offered = offerProspectorLadder(h.state, h.bus);
  assert.equal(offered.ok, true, offered.reason);
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.OFFERED);
});

test('CL-attempt-mult: failures 0,1,2+ → 1, 0.85, 0.7', () => {
  assert.equal(attemptMultiplier(0), 1);
  assert.equal(attemptMultiplier(1), 0.85);
  assert.equal(attemptMultiplier(2), 0.7);
  assert.equal(attemptMultiplier(5), 0.7);
});

// ── Survey (live scan payloads) ───────────────────────────────────────────────

test('P0-recon: three live scan:completed with fair scanned rocks complete survey', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  h.intents.length = 0;
  seedScannedMetallic(h.state, 1);

  for (let i = 0; i < 3; i++) {
    applyProspectorLadderEvent(h.state, h.bus, 'scan:pulse', liveScanPulse(i, 0));
    applyProspectorLadderEvent(
      h.state, h.bus, 'scan:completed',
      liveScanCompleted({ asteroids: 1, wrecks: 0, anomalies: 0 }),
    );
  }

  const own = getProspectorLeaf(h.state);
  assert.equal(own.steps.survey_circuit.status, STEP_STATUS.DONE);
  assert.equal(own.stepId, 'seam_fracture_mastery');
  assert.ok((Number(own.steps.survey_circuit.payload.fairAppraisals) || 0) >= 1);
  const grants = h.intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS);
  assert.ok(grants.length >= 1);
  assert.equal(grants[0].payload.amount, 200);
  assert.equal(h.intents.some((i) => isForbiddenHeatEvent(i.event)), false);
});

test('P0-empty: three empty live scan:completed fail with empty_pulse', () => {
  const h = makeHarness();
  activateAtStep(h, 0);

  for (let i = 0; i < 3; i++) {
    applyProspectorLadderEvent(h.state, h.bus, 'scan:pulse', liveScanPulse());
    applyProspectorLadderEvent(
      h.state, h.bus, 'scan:completed',
      liveScanCompleted({ asteroids: 0, wrecks: 0, anomalies: 0 }),
    );
  }

  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.RECOVERING);
  assert.equal(own.steps.survey_circuit.failures, 1);
  assert.ok(Number.isFinite(own.recoverReadyAtS));

  const early = recoverProspectorLadder(h.state, h.bus);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'cooldown');

  h.state.simTime = own.recoverReadyAtS;
  const recovered = recoverProspectorLadder(h.state, h.bus);
  assert.equal(recovered.ok, true, recovered.reason);
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
  assert.equal(getProspectorLeaf(h.state).attemptMult, 0.85);
});

test('P0-scan-pulse alone never fails (pos-only live payload)', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 5; i++) {
    applyProspectorLadderEvent(h.state, h.bus, 'scan:pulse', liveScanPulse(i, i));
  }
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
  assert.equal(getProspectorLeaf(h.state).steps.survey_circuit.status, STEP_STATUS.ACTIVE);
});

test('P0-mission: live mission:completed recon_scan advances survey', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:accepted',
    liveMissionAccepted('m_survey_1'),
  );
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:completed',
    liveMissionCompleted('m_survey_1'),
  );
  assert.equal(getProspectorLeaf(h.state).steps.survey_circuit.status, STEP_STATUS.DONE);
});

test('P0-mission-failed: live {missionId,reason} matches stamped id (no type)', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:accepted',
    liveMissionAccepted('m_fail_1'),
  );
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:failed',
    liveMissionFailed('m_fail_1', 'deadline'),
  );
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

test('P0-mission-failed ignores unrelated missionId', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:accepted',
    liveMissionAccepted('m_mine'),
  );
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:failed',
    liveMissionFailed('m_other', 'deadline'),
  );
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
});

test('P0-mission-expired arms timer via stamped recon_scan', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:accepted',
    liveMissionAccepted('m_exp'),
  );
  applyProspectorLadderEvent(
    h.state, h.bus, 'mission:expired',
    liveMissionExpired('m_exp'),
  );
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

// ── Seam ──────────────────────────────────────────────────────────────────────

test('P1-yield-seams: live yield + seams + tether latch complete mastery', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);
  h.intents.length = 0;

  applyProspectorLadderEvent(h.state, h.bus, 'tether:latched', liveTetherLatched('chunk_1'));
  for (let i = 0; i < 3; i++) {
    applyProspectorLadderEvent(h.state, h.bus, 'mining:seamHit', liveSeamHit('a1'));
  }
  applyProspectorLadderEvent(
    h.state, h.bus, 'mining:yield',
    liveMiningYield({ qty: 8, minerId: h.state.playerId }),
  );

  const own = getProspectorLeaf(h.state);
  assert.equal(own.steps.seam_fracture_mastery.status, STEP_STATUS.DONE);
  assert.equal(own.stepId, 'claim_stake');
  const grants = h.intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS);
  assert.ok(grants.some((g) => g.payload.amount === 250));
});

test('P1-cargo-full: hold jam before target fails hold_jammed', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);

  applyProspectorLadderEvent(
    h.state, h.bus, 'mining:yield',
    liveMiningYield({ qty: 2, minerId: h.state.playerId }),
  );
  applyProspectorLadderEvent(h.state, h.bus, 'cargo:full', liveCargoFull());

  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.RECOVERING);
  assert.equal(own.steps.seam_fracture_mastery.payload.holdJammed, true);
});

test('P1-weapons-vent is telemetry only (not WANTED heat)', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);

  applyProspectorLadderEvent(h.state, h.bus, 'weapons:vent', { weaponId: 'beam' });
  const own = getProspectorLeaf(h.state);
  assert.equal(own.steps.seam_fracture_mastery.payload.ventCount, 1);
  assert.equal(own.status, LADDER_STATUS.ACTIVE);
  assert.equal(h.state.player.heat, 0);
  assert.equal(h.intents.some((i) => isForbiddenHeatEvent(i.event)), false);
});

// ── Claim stake ───────────────────────────────────────────────────────────────

test('P2-claim: live claim:claimed seals stake', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);
  completeProspectorLadderStep(h.state, h.bus);
  h.intents.length = 0;

  const body = {
    id: 'claim_99',
    poiId: 'poi_rock_a',
    name: 'Test Stake',
    slots: 3,
    modules: [],
    x: 50,
    z: -20,
  };
  h.state.claims.bodies.push(body);

  applyProspectorLadderEvent(h.state, h.bus, 'claim:claimed', liveClaimClaimed(body));

  const own = getProspectorLeaf(h.state);
  assert.equal(own.steps.claim_stake.status, STEP_STATUS.DONE);
  assert.equal(own.steps.claim_stake.payload.activeClaimId, 'claim_99');
  assert.equal(own.activeClaimId, 'claim_99');
  assert.equal(own.stepId, 'claim_conflict');
  assert.ok(h.intents.some((i) =>
    i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS && i.payload.amount === 150));
  assert.equal(PROSPECTOR_LADDER_PARAMS.claim.claimCost, 15000);
});

// ── Claim conflict (gated threat evidence) ────────────────────────────────────

test('P3-defend: claim_threat encounter:resolved defended succeeds', () => {
  const h = makeHarness();
  advanceToConflict(h);
  h.intents.length = 0;

  applyProspectorLadderEvent(h.state, h.bus, 'encounter:spawned', liveEncounterSpawned('enc_d1'));
  applyProspectorLadderEvent(
    h.state, h.bus, 'encounter:resolved',
    liveEncounterResolved({ encounterId: 'enc_d1', outcome: 'defended' }),
  );

  assert.equal(getProspectorLeaf(h.state).steps.claim_conflict.status, STEP_STATUS.DONE);
  assert.ok(h.intents.some((i) =>
    i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS && i.payload.amount === 400));
});

test('P3-defend: hostile kill near claim after threat spawn succeeds', () => {
  const h = makeHarness();
  const body = advanceToConflict(h);
  h.intents.length = 0;

  applyProspectorLadderEvent(h.state, h.bus, 'encounter:spawned', liveEncounterSpawned('enc_k1'));
  applyProspectorLadderEvent(
    h.state, h.bus, 'entity:killed',
    liveEntityKilled({
      id: 'scav_1',
      killerId: h.state.playerId,
      factionLawful: false,
      pos: { x: body.x, z: body.z },
    }),
  );

  assert.equal(getProspectorLeaf(h.state).steps.claim_conflict.status, STEP_STATUS.DONE);
});

test('P3-generic-kill: random far kill without threat does not complete', () => {
  const h = makeHarness();
  advanceToConflict(h);

  applyProspectorLadderEvent(
    h.state, h.bus, 'entity:killed',
    liveEntityKilled({
      id: 'random_npc',
      killerId: h.state.playerId,
      factionLawful: false,
      pos: { x: 99999, z: 99999 },
    }),
  );

  const own = getProspectorLeaf(h.state);
  assert.equal(own.steps.claim_conflict.status, STEP_STATUS.ACTIVE);
  assert.equal(own.status, LADDER_STATUS.ACTIVE);
  assert.equal(Number(own.steps.claim_conflict.payload.threatsKilled) || 0, 0);
});

test('P3-heat_spiked: WANTED mid-defense fails via live heat:changed', () => {
  const h = makeHarness(5501, { heat: 0.2 });
  h.state.player.heat = 0.2;
  advanceToConflict(h);

  applyProspectorLadderEvent(h.state, h.bus, 'heat:changed', liveHeatChanged(0.2));
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

test('P3-lawful_kill: killing lawful fails claim_conflict', () => {
  const h = makeHarness();
  const body = advanceToConflict(h);
  applyProspectorLadderEvent(h.state, h.bus, 'encounter:spawned', liveEncounterSpawned());

  applyProspectorLadderEvent(
    h.state, h.bus, 'entity:killed',
    liveEntityKilled({
      id: 'patrol_1',
      killerId: h.state.playerId,
      factionLawful: true,
      factionId: 'faction_concord',
      pos: { x: body.x, z: body.z },
    }),
  );
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

test('P3-player_destroyed: live player:death fails (not entity:killed)', () => {
  const h = makeHarness();
  advanceToConflict(h);
  applyProspectorLadderEvent(h.state, h.bus, 'encounter:spawned', liveEncounterSpawned());

  applyProspectorLadderEvent(
    h.state, h.bus, 'entity:killed',
    liveEntityKilled({
      id: h.state.playerId,
      killerId: 'enemy',
      type: 'player',
      pos: { x: 0, z: 0 },
    }),
  );
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);

  applyProspectorLadderEvent(h.state, h.bus, 'player:death', livePlayerDeath('enemy'));
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

test('P3-abandon: dock mid threat fails abandoned_claim_radius', () => {
  const h = makeHarness();
  advanceToConflict(h);
  applyProspectorLadderEvent(h.state, h.bus, 'encounter:spawned', liveEncounterSpawned());
  applyProspectorLadderEvent(h.state, h.bus, 'dock:docked', { stationId: 'station_helios' });
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.RECOVERING);
});

// ── Refinery ──────────────────────────────────────────────────────────────────

test('P4-pathB-sell: live economy:tradeCompleted sell ≥8 ore completes', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 4; i++) completeProspectorLadderStep(h.state, h.bus);
  ownRoleHull(h);
  h.intents.length = 0;

  applyProspectorLadderEvent(h.state, h.bus, 'economy:tradeCompleted', liveTradeSell(8));

  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.steps.refinery_sector_consequence.status, STEP_STATUS.DONE);
  assert.equal(own.steps.refinery_sector_consequence.payload.refinePath, 'path_b_station_sell');

  const grants = h.intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS);
  const totalCr = grants.reduce((s, g) => s + (g.payload.amount || 0), 0);
  assert.equal(totalCr, 1000, `expected 1000 completion only, got ${totalCr}`);
  const reps = h.intents.filter((i) => i.event === LADDER_REWARD_EVENTS.REP_DELTA);
  assert.ok(reps.some((r) => r.payload.factionId === 'faction_mts' && r.payload.delta === 6));
  assert.equal(h.intents.some((i) => isForbiddenHeatEvent(i.event)), false);
  assert.equal(h.events.some((e) => e.event === CAREER_LADDER_EVENTS.COMPLETED), true);
});

test('P4-pathA-module: live claim:moduleBuilt mod_refinery completes', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 4; i++) completeProspectorLadderStep(h.state, h.bus);
  ownRoleHull(h);

  applyProspectorLadderEvent(
    h.state, h.bus, 'claim:moduleBuilt',
    liveModuleBuilt('claim_x', 'mod_refinery'),
  );

  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.steps.refinery_sector_consequence.payload.moduleBuilt, 'mod_refinery');
  assert.equal(own.steps.refinery_sector_consequence.payload.refinePath, 'path_a_mod_refinery');
});

test('P4-bulk: live mining:bulkHaulDelivered massU counts toward path B', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 4; i++) completeProspectorLadderStep(h.state, h.bus);
  ownRoleHull(h);

  applyProspectorLadderEvent(
    h.state, h.bus, 'mining:bulkHaulDelivered',
    liveBulkHaul(8),
  );
  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.steps.refinery_sector_consequence.payload.bulkMassU, 8);
});

test('P4-bulk invented qty without massU does not complete', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 4; i++) completeProspectorLadderStep(h.state, h.bus);

  applyProspectorLadderEvent(h.state, h.bus, 'mining:bulkHaulDelivered', { qty: 8, units: 8 });
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
  assert.equal(Number(getProspectorLeaf(h.state).steps.refinery_sector_consequence.payload.bulkMassU) || 0, 0);
});

test('P4-fieldDepletion:changed records telemetry only (no refined)', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  for (let i = 0; i < 4; i++) completeProspectorLadderStep(h.state, h.bus);

  applyProspectorLadderEvent(
    h.state, h.bus, 'fieldDepletion:changed',
    liveFieldDepletion({ fieldId: 'f1', depleted: 0.2, extractedU: 12 }),
  );
  const p = getProspectorLeaf(h.state).steps.refinery_sector_consequence.payload;
  assert.equal(p.fieldTouched, true);
  assert.equal(p.fieldId, 'f1');
  assert.equal(p.fieldExtractedU, 12);
  assert.equal(p.refineProduced, undefined);
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
});

// ── Idempotent rewards ────────────────────────────────────────────────────────

test('step reward receipt is idempotent (no double grant)', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);
  h.intents.length = 0;
  const own = getProspectorLeaf(h.state);
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'survey_circuit';
  own.stepIndex = 0;
  own.steps.survey_circuit.status = STEP_STATUS.ACTIVE;
  const again = completeProspectorLadderStep(h.state, h.bus);
  assert.equal(again.duplicate === true || again.ok === true, true);
  const grants = h.intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS);
  assert.equal(grants.length, 0);
});

// ── Save / load ───────────────────────────────────────────────────────────────

test('P4-save / CL-save-schema: serialize roundtrip preserves mid-step payload', () => {
  const h = makeHarness(9901);
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);
  applyProspectorLadderEvent(h.state, h.bus, 'mining:seamHit', liveSeamHit());
  applyProspectorLadderEvent(
    h.state, h.bus, 'mining:yield',
    liveMiningYield({ qty: 3, minerId: h.state.playerId }),
  );
  applyProspectorLadderEvent(h.state, h.bus, 'tether:latched', liveTetherLatched());

  const before = getProspectorLeaf(h.state);
  assert.equal(before.stepId, 'seam_fracture_mastery');
  assert.equal(before.steps.seam_fracture_mastery.payload.yieldU, 3);

  const blob = h.system.serialize();
  assert.equal(blob.schemaId, 'spaceface.careerLadders.v1');
  assert.ok(blob.ladders.prospector);
  assert.equal(blob.ladders.prospector.stepId, 'seam_fracture_mastery');

  const h2 = makeHarness(9901);
  h2.state.careers.origins.hauler = { status: 'active' };
  h2.system.deserialize(blob);

  const after = getProspectorLeaf(h2.state);
  assert.equal(after.status, LADDER_STATUS.ACTIVE);
  assert.equal(after.stepId, 'seam_fracture_mastery');
  assert.equal(after.steps.seam_fracture_mastery.payload.yieldU, 3);
  assert.equal(after.steps.seam_fracture_mastery.payload.seamHits, 1);
  assert.equal(after.steps.survey_circuit.status, STEP_STATUS.DONE);
  assert.equal(h2.state.careers.origins.hauler.status, 'active');
});

test('serializeCareerLadders helper preserves receipts', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  completeProspectorLadderStep(h.state, h.bus);
  const blob = serializeCareerLadders(h.state, {
    list: () => [PROSPECTOR_LADDER_DEF],
  });
  const receipts = blob.ladders.prospector.receipts;
  assert.ok(Object.keys(receipts).some((k) => k.startsWith('step_done:prospector:survey_circuit')));

  const state2 = createGameState(1);
  state2.careers = { origins: { prospector: { status: 'completed' } } };
  deserializeCareerLadders(state2, blob, {
    getDef: (id) => (id === 'prospector' ? PROSPECTOR_LADDER_DEF : null),
  });
  assert.ok(state2.careers.ladders.prospector.receipts);
});

// ── Progress view ─────────────────────────────────────────────────────────────

test('getProspectorLadderProgress exposes nonBinding objective', () => {
  const h = makeHarness();
  acceptProspectorLadder(h.state, h.bus, { ignorePrereqs: true });
  const prog = getProspectorLadderProgress(h.state);
  assert.equal(prog.careerId, 'prospector');
  assert.equal(prog.nonBinding, true);
  assert.equal(prog.exclusive, false);
  assert.equal(prog.stepsTotal, 6);
  assert.ok(typeof prog.objective === 'string' && prog.objective.length > 0);
});

test('failProspectorLadderStep then recover is deterministic', () => {
  const h = makeHarness();
  activateAtStep(h, 0);
  failProspectorLadderStep(h.state, h.bus, 'timer');
  const own = getProspectorLeaf(h.state);
  assert.equal(own.status, LADDER_STATUS.RECOVERING);
  assert.equal(own.recoverReadyAtS, h.state.simTime + 25);
  h.state.simTime = own.recoverReadyAtS;
  recoverProspectorLadder(h.state, h.bus);
  assert.equal(getProspectorLeaf(h.state).status, LADDER_STATUS.ACTIVE);
  assert.equal(getProspectorLeaf(h.state).steps.survey_circuit.attempts, 2);
});
