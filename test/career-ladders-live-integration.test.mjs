// Combined headless acceptance: live Hauler + Hunter + Prospector ladder integration.
// Run: node --test test/career-ladders-live-integration.test.mjs
// Targets createLiveCareerLadderBranchesSystem (composite). Does not edit production or package.json.
// Never inspects SAFE-001.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
  getLadderDefinition,
  listLadderDefinitions,
  serializeCareerLadders,
  deserializeCareerLadders,
} from '../src/careers/ladders/careerLadders.js';
import {
  LADDER_REWARD_EVENTS,
  STEP_STATUS,
  assertNoNondeterminism,
  computeLadderRngSeed,
  isForbiddenHeatEvent,
} from '../src/careers/ladders/ladderShared.js';
import {
  HAULER_LADDER_STEP_IDS,
  HAULER_ROLE_HULL_DEF_ID,
  HAULER_SKILL_PROOF_KEY,
} from '../src/careers/ladders/haulerLadderDefs.js';
import { HUNTER_LADDER_STEP_IDS } from '../src/careers/ladders/hunterLadderDefs.js';
import {
  PROSPECTOR_LADDER_STEP_IDS,
  PROSPECTOR_SKILL_PROOF_KEY,
} from '../src/careers/ladders/prospectorLadderDefs.js';
import { resetProspectorLadderRegistration } from '../src/careers/ladders/prospectorLadderFsm.js';
import { THRESHOLD as WANTED_THRESHOLD, isPlayerWanted } from '../src/systems/heat.js';
import { installPlayer, makeHostilePirate } from './hunter-origin-fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const COMPOSITE_REL = 'src/careers/ladders/liveCareerLadderBranches.js';
const COMPOSITE_ABS = join(repoRoot, COMPOSITE_REL);

/** Forbidden heat *reward* intents — distinct from live observation heat:changed. */
const FORBIDDEN_HEAT_REWARD_INTENTS = new Set(['heat:delta', 'heat:raise', 'heat:set']);

function isForbiddenHeatRewardIntent(eventName) {
  return FORBIDDEN_HEAT_REWARD_INTENTS.has(String(eventName || ''));
}

/**
 * Poll briefly for the composite module (parallel agent may still be writing it),
 * then import and return its factory.
 */
async function loadCompositeFactory(maxWaitMs = 8000, stepMs = 250) {
  const deadline = Date.now() + maxWaitMs;
  while (!existsSync(COMPOSITE_ABS) && Date.now() < deadline) {
    await delay(stepMs);
  }
  assert.equal(existsSync(COMPOSITE_ABS), true, `composite missing after poll: ${COMPOSITE_REL}`);
  const mod = await import(pathToFileURL(COMPOSITE_ABS).href + `?t=${Date.now()}`);
  const factory = mod.createLiveCareerLadderBranchesSystem
    || mod.default?.createLiveCareerLadderBranchesSystem
    || (typeof mod.default === 'function' && mod.default.name?.includes('Live')
      ? mod.default
      : null);
  assert.equal(typeof factory, 'function', 'composite must export createLiveCareerLadderBranchesSystem');
  return { factory, mod };
}

function listenerCount(bus, event) {
  const set = bus && bus._listeners && bus._listeners.get(event);
  return set ? set.size : 0;
}

function totalListenerCount(bus) {
  if (!bus || !bus._listeners) return 0;
  let n = 0;
  for (const set of bus._listeners.values()) n += set.size;
  return n;
}

function grantCreditsCount(intents) {
  return intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS).length;
}

function leaf(state, careerId) {
  return state.careers && state.careers.ladders && state.careers.ladders[careerId];
}

function makeHarness(seed = 9101, opts = {}) {
  clearLadderDefinitions();
  resetProspectorLadderRegistration();

  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.player = state.player || {};
  state.player.credits = 5000;
  state.player.heat = opts.heat != null ? opts.heat : 0;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0 };
  state.story = state.story || { beatIndex: 2, phase: 1, branch: null };
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: opts.haulerOrigin || 'completed' },
    hunter: { status: opts.hunterOrigin || 'completed' },
    prospector: { status: opts.prospectorOrigin || 'completed' },
  };

  installPlayer(state, 1);

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
      || isForbiddenHeatRewardIntent(event)
      || event === 'mission:forceEvent'
    ) {
      intents.push({ event, payload });
    }
    return origEmit(event, payload);
  };

  const ladders = createCareerLaddersSystem();
  const registry = {
    get(name) {
      if (name === 'careerLadders') return ladders;
      return null;
    },
  };
  ladders.init({ state, bus, registry });

  return {
    state,
    bus,
    ladders,
    registry,
    intents,
    events,
    seed,
    ctx: { state, bus, registry, ladders },
  };
}

let compositeFactory = null;

test('bootstrap: resolve composite factory (poll if needed)', async () => {
  const { factory, mod } = await loadCompositeFactory();
  compositeFactory = factory;
  assert.equal(typeof factory, 'function');
  assert.ok(mod.liveCareerLadderBranches || mod.default, 'composite exposes singleton or default');
});

test('candidate composite + branch modules exist; no Math.random/Date.now in composite', () => {
  for (const rel of [
    COMPOSITE_REL,
    'src/careers/ladders/haulerLadderFsm.js',
    'src/careers/ladders/hunterLadderFsm.js',
    'src/careers/ladders/prospectorLadderFsm.js',
    'src/careers/ladders/careerLadders.js',
  ]) {
    assert.equal(existsSync(join(repoRoot, rel)), true, `missing ${rel}`);
  }
  const src = readFileSync(COMPOSITE_ABS, 'utf8');
  const flags = assertNoNondeterminism(src);
  assert.equal(flags.hasMathRandom, false, COMPOSITE_REL);
  assert.equal(flags.hasDateNow, false, COMPOSITE_REL);
});

test('definitions register exactly once across composite init', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1001);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const ids = listLadderDefinitions().map((d) => d.careerId).sort();
  assert.deepEqual(ids, ['hauler', 'hunter', 'prospector']);
  assert.equal(listLadderDefinitions().length, 3);
  assert.equal(getLadderDefinition('hauler').steps.length, 6, 'Hauler ends in its role-hull capstone');
  assert.equal(getLadderDefinition('hunter').steps.length, 6, 'Hunter ends in its role-hull capstone');
  assert.equal(getLadderDefinition('prospector').steps.length, 6, 'Prospector ends in its role-hull capstone');

  // Second init must not grow the definition set.
  composite.init(h.ctx);
  assert.equal(listLadderDefinitions().length, 3);
  assert.deepEqual(
    listLadderDefinitions().map((d) => d.careerId).sort(),
    ['hauler', 'hunter', 'prospector'],
  );

  // Process-local re-register helpers stay idempotent.
  const { registerHaulerLadder } = await import('../src/careers/ladders/haulerLadderFsm.js');
  const again = registerHaulerLadder();
  assert.equal(again.ok, true);
  assert.ok(again.reason === 'already_registered' || again.careerId === 'hauler');
  assert.equal(listLadderDefinitions().length, 3);

  composite.destroy();
});

test('composite init is idempotent (listener counts stable; no double-bind)', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1002);
  const composite = compositeFactory();

  composite.init(h.ctx);
  const heat1 = listenerCount(h.bus, 'heat:changed');
  const mission1 = listenerCount(h.bus, 'mission:completed');
  const total1 = totalListenerCount(h.bus);
  assert.ok(heat1 >= 1, 'heat:changed bound after first init');
  assert.ok(mission1 >= 1, 'mission:completed bound after first init');

  composite.init(h.ctx);
  const heat2 = listenerCount(h.bus, 'heat:changed');
  const mission2 = listenerCount(h.bus, 'mission:completed');
  const total2 = totalListenerCount(h.bus);

  assert.equal(heat2, heat1, 're-init must not stack heat:changed listeners');
  assert.equal(mission2, mission1, 're-init must not stack mission:completed listeners');
  assert.equal(total2, total1, 're-init must not grow total listener set');

  // Third init still stable.
  composite.init(h.ctx);
  assert.equal(totalListenerCount(h.bus), total1);

  composite.destroy();
  assert.ok(totalListenerCount(h.bus) < total1, 'destroy unsubscribes branch listeners');
});

test('real event payload routing: live mission:completed advances hauler broker_desk only', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1003);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  const hunter = composite.getBranch('hunter');
  const prospector = composite.getBranch('prospector');
  assert.ok(hauler && hunter && prospector);

  assert.equal(hauler.offer({ ignorePrereqs: true }).ok, true);
  assert.equal(hauler.accept({ ignorePrereqs: true }).ok, true);
  assert.equal(leaf(h.state, 'hauler').stepId, 'broker_desk');
  assert.equal(leaf(h.state, 'hunter').status, LADDER_STATUS.LATENT);
  assert.equal(leaf(h.state, 'prospector').status, LADDER_STATUS.LATENT);

  const missionId = leaf(h.state, 'hauler').steps.broker_desk.payload.missionId;
  assert.ok(missionId, 'arm stamps live missionId');

  // Live missions.js shape: { missionId, type, factionId?, repMult? }
  h.bus.emit('mission:completed', {
    missionId,
    type: 'cargo_delivery',
    factionId: 'faction_mts',
    repMult: 0.2,
  });

  assert.equal(leaf(h.state, 'hauler').steps.broker_desk.status, STEP_STATUS.DONE);
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');
  // Peers untouched.
  assert.equal(leaf(h.state, 'hunter').status, LADDER_STATUS.LATENT);
  assert.equal(leaf(h.state, 'prospector').status, LADDER_STATUS.LATENT);

  composite.destroy();
});

test('real event payload routing: live scan:completed routes to prospector only', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1004);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const prospector = composite.getBranch('prospector');
  assert.equal(prospector.offer({ ignorePrereqs: true }).ok, true);
  assert.equal(prospector.accept({ ignorePrereqs: true }).ok, true);
  const surveyId = PROSPECTOR_LADDER_STEP_IDS[0];
  assert.equal(leaf(h.state, 'prospector').stepId, surveyId);

  const authorityApply = h.ladders.applySignal.bind(h.ladders);
  let authoritySignalCount = 0;
  h.ladders.applySignal = (careerId, signal, opts) => {
    if (careerId === 'prospector') authoritySignalCount += 1;
    return authorityApply(careerId, signal, opts);
  };

  // Scanner authority stamps asteroids before scan:completed (scanner.js:_pulse).
  const scanned = [];
  for (let i = 0; i < 3; i += 1) {
    scanned.push({
      id: `ast_scan_${i}`,
      type: 'asteroid',
      alive: true,
      pos: { x: i * 20, z: 0 },
      data: {
        typeId: 'ast_metallic',
        scanOreGlyph: 'Fe',
        scanHighlightUntil: (h.state.simTime || 0) + 10,
      },
    });
  }
  h.state.entityList = scanned;
  if (h.state.entities && typeof h.state.entities.set === 'function') {
    for (const e of scanned) h.state.entities.set(e.id, e);
  } else {
    h.state.entities = new Map(scanned.map((e) => [e.id, e]));
  }

  // Live scanner.js:224 shape — found.asteroids + entity scan stamps.
  for (let i = 0; i < 3; i += 1) {
    h.bus.emit('scan:completed', {
      targetId: null,
      sectorId: 'sector_helios',
      found: { asteroids: 2, wrecks: 0, anomalies: 0 },
    });
  }

  const pLeaf = leaf(h.state, 'prospector');
  const stepRt = pLeaf.steps[surveyId];
  const advanced = pLeaf.stepId !== surveyId || stepRt.status === STEP_STATUS.DONE;
  const progressed = stepRt.payload
    && ((Number(stepRt.payload.surveyCount) || 0) >= 1
      || (Number(stepRt.payload.appraisals) || 0) >= 1);
  assert.ok(advanced || progressed, 'prospector must consume live scan:completed + scanned asteroids');
  assert.ok(authoritySignalCount >= 1, 'live prospector mutations must route through careerLadders');
  assert.equal(leaf(h.state, 'hauler').status, LADDER_STATUS.LATENT);
  assert.equal(leaf(h.state, 'hunter').status, LADDER_STATUS.LATENT);

  const beforeBranchNewGame = structuredClone(leaf(h.state, 'prospector'));
  composite.newGame();
  assert.deepEqual(
    leaf(h.state, 'prospector'),
    beforeBranchNewGame,
    'branch newGame must not wipe the framework-owned durable leaf',
  );

  composite.destroy();

});

test('non-binding origin reachability: skillProof unlock without exclusive lock', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1005, {
    haulerOrigin: 'idle',
    hunterOrigin: 'idle',
    prospectorOrigin: 'offered',
  });
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  const blocked = hauler.offer();
  assert.equal(blocked.ok, false);

  h.ladders.noteSkillProof(HAULER_SKILL_PROOF_KEY, 1);
  const viaProof = hauler.offer();
  assert.equal(viaProof.ok, true, viaProof.reason);
  assert.equal(leaf(h.state, 'hauler').status, LADDER_STATUS.OFFERED);

  // Completing hauler must not lock peers / invent exclusive.
  hauler.accept({ ignorePrereqs: true });
  for (let i = 0; i < 5; i += 1) {
    assert.equal(hauler.applySignal({ kind: 'complete' }).ok, true);
  }
  assert.equal(leaf(h.state, 'hauler').status, LADDER_STATUS.ACTIVE);
  assert.equal(leaf(h.state, 'hauler').stepId, 'role_hull_capstone');
  h.state.player.ownedShips.push({ defId: HAULER_ROLE_HULL_DEF_ID, fittings: [] });
  h.bus.emit('ship:purchased', { defId: HAULER_ROLE_HULL_DEF_ID, price: 15000 });
  const own = leaf(h.state, 'hauler');
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.nonBinding, true);
  assert.equal(own.flags.exclusive, false);
  assert.equal(own.flags.blocksOtherCareers, false);

  // Origins peer unchanged; hunter/prospector still reachable.
  assert.equal(h.state.careers.origins.hunter.status, 'idle');
  assert.equal(h.state.careers.origins.prospector.status, 'offered');
  h.ladders.noteSkillProof(PROSPECTOR_SKILL_PROOF_KEY, 3);
  const prospOffer = composite.getBranch('prospector').offer();
  assert.equal(prospOffer.ok, true, prospOffer.reason);

  composite.destroy();
});

test('canonical exactly-once rewards under composite wiring', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1006);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  hauler.offer({ ignorePrereqs: true });
  hauler.accept({ ignorePrereqs: true });

  const r1 = hauler.applySignal({ kind: 'complete', receiptId: 'live_int_h0' });
  assert.equal(r1.ok, true);
  const n1 = grantCreditsCount(h.intents);
  assert.ok(n1 >= 1);

  // Duplicate receipt / step mismatch — no second broker grant.
  hauler.applySignal({
    kind: 'complete',
    stepId: 'broker_desk',
    receiptId: 'live_int_h0',
  });
  assert.equal(grantCreditsCount(h.intents), n1);

  // Framework path also idempotent.
  h.ladders.applySignal('hauler', {
    kind: 'complete',
    stepId: 'broker_desk',
    receiptId: 'live_int_h0',
  });
  assert.equal(grantCreditsCount(h.intents), n1);

  assert.ok(h.intents.every((i) => !isForbiddenHeatRewardIntent(i.event)));
  assert.ok(h.intents.every((i) => !isForbiddenHeatEvent(i.event) || i.event === 'heat:changed'));

  composite.destroy();
});

test('save v11 mid-step serialize/deserialize preserves all three leaves + origins peer', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  assert.equal(CURRENT_VERSION, 11, 'live save version remains v11 (no v12 claim)');

  const h = makeHarness(4242);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  const hunter = composite.getBranch('hunter');
  const prospector = composite.getBranch('prospector');

  hauler.offer({ ignorePrereqs: true });
  hauler.accept({ ignorePrereqs: true });
  // Advance hauler to risk_lane_tax (step index 2).
  for (let i = 0; i < 2; i += 1) {
    assert.equal(hauler.applySignal({ kind: 'complete' }).ok, true);
  }
  assert.equal(leaf(h.state, 'hauler').stepId, HAULER_LADDER_STEP_IDS[2]);
  leaf(h.state, 'hauler').steps.risk_lane_tax.payload.choiceId = 'veer_slip';
  const missionId = leaf(h.state, 'hauler').steps.risk_lane_tax.payload.missionId;

  hunter.offer({ ignorePrereqs: true });
  hunter.accept({ ignorePrereqs: true });
  assert.equal(leaf(h.state, 'hunter').stepId, HUNTER_LADDER_STEP_IDS[0]);

  prospector.offer({ ignorePrereqs: true });
  prospector.accept({ ignorePrereqs: true });
  assert.equal(leaf(h.state, 'prospector').stepId, PROSPECTOR_LADDER_STEP_IDS[0]);

  // Composite does not own serialize — framework authority only.
  assert.equal(typeof composite.serialize, 'undefined');
  const blob = h.ladders.serialize();
  assert.equal(blob.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.equal(blob.schemaVersion, CAREER_LADDERS_SCHEMA_VERSION);
  assert.ok(blob.ladders.hauler);
  assert.ok(blob.ladders.hunter);
  assert.ok(blob.ladders.prospector);

  // Restore into fresh state + composite.
  clearLadderDefinitions();
  resetProspectorLadderRegistration();
  const restored = createGameState(4242);
  restored.simTime = 100;
  restored.careers = {
    origins: {
      __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
      hauler: { status: 'completed' },
      hunter: { status: 'completed' },
      prospector: { status: 'completed' },
    },
    guildRank: { keep: true },
  };
  installPlayer(restored, 1);
  const bus2 = createBus();
  const ladders2 = createCareerLaddersSystem();
  const registry2 = { get: (n) => (n === 'careerLadders' ? ladders2 : null) };
  ladders2.init({ state: restored, bus: bus2, registry: registry2 });
  const composite2 = compositeFactory();
  composite2.init({ state: restored, bus: bus2, registry: registry2, ladders: ladders2 });
  ladders2.deserialize(structuredClone(blob));

  assert.equal(leaf(restored, 'hauler').status, LADDER_STATUS.ACTIVE);
  assert.equal(leaf(restored, 'hauler').stepId, 'risk_lane_tax');
  assert.equal(leaf(restored, 'hauler').steps.risk_lane_tax.payload.missionId, missionId);
  assert.equal(leaf(restored, 'hauler').steps.risk_lane_tax.payload.choiceId, 'veer_slip');
  assert.equal(leaf(restored, 'hunter').stepId, HUNTER_LADDER_STEP_IDS[0]);
  assert.equal(leaf(restored, 'prospector').stepId, PROSPECTOR_LADDER_STEP_IDS[0]);
  assert.equal(restored.careers.origins.hauler.status, 'completed');
  assert.equal(restored.careers.guildRank.keep, true);

  // Helper path also round-trips.
  const blob2 = serializeCareerLadders(restored);
  const state3 = createGameState(4242);
  state3.careers = { origins: { hauler: { status: 'completed' } } };
  deserializeCareerLadders(state3, structuredClone(blob2), {
    getDef: (id) => getLadderDefinition(id),
  });
  assert.equal(leaf(state3, 'hauler').stepId, 'risk_lane_tax');

  composite.destroy();
  composite2.destroy();
});

test('reload listener stability: destroy/init/deserialize does not double-pay', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1007);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  hauler.offer({ ignorePrereqs: true });
  hauler.accept({ ignorePrereqs: true });
  const missionId = leaf(h.state, 'hauler').steps.broker_desk.payload.missionId;

  const heatBefore = listenerCount(h.bus, 'heat:changed');
  const blob = h.ladders.serialize();

  // Simulate Continue: tear down + rebind + hydrate.
  composite.destroy();
  composite.init(h.ctx);
  h.ladders.deserialize(structuredClone(blob));

  assert.equal(listenerCount(h.bus, 'heat:changed'), heatBefore, 'reload keeps listener cardinality');
  assert.equal(leaf(h.state, 'hauler').stepId, 'broker_desk');

  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  const grants1 = grantCreditsCount(h.intents);
  assert.ok(grants1 >= 1);
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');

  // Replay same mission complete after advance — no extra broker grant.
  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(grantCreditsCount(h.intents), grants1);

  // Second full re-init mid-session still stable.
  composite.init(h.ctx);
  assert.equal(listenerCount(h.bus, 'heat:changed'), heatBefore);
  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(grantCreditsCount(h.intents), grants1);

  composite.destroy();
});

test('three-branch isolation: events only move the active career leaf', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1008);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  const hunter = composite.getBranch('hunter');
  const prospector = composite.getBranch('prospector');

  // All three active on first steps (non-binding parallel).
  hauler.offer({ ignorePrereqs: true });
  hauler.accept({ ignorePrereqs: true });
  hunter.offer({ ignorePrereqs: true });
  hunter.accept({ ignorePrereqs: true });
  prospector.offer({ ignorePrereqs: true });
  prospector.accept({ ignorePrereqs: true });

  const h0 = structuredClone({
    hauler: leaf(h.state, 'hauler').stepId,
    hunter: leaf(h.state, 'hunter').stepId,
    prospector: leaf(h.state, 'prospector').stepId,
  });
  assert.equal(h0.hauler, 'broker_desk');
  assert.equal(h0.hunter, 'warrant_desk');
  assert.equal(h0.prospector, PROSPECTOR_LADDER_STEP_IDS[0]);

  // Hauler mission complete should not advance hunter/prospector.
  const missionId = leaf(h.state, 'hauler').steps.broker_desk.payload.missionId;
  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');
  assert.equal(leaf(h.state, 'hunter').stepId, h0.hunter);
  assert.equal(leaf(h.state, 'prospector').stepId, h0.prospector);

  // Prospector scan should not touch hauler/hunter.
  h.bus.emit('scan:completed', {
    targetId: null,
    sectorId: 'sector_helios',
    found: { asteroids: 3, wrecks: 0, anomalies: 0 },
  });
  assert.equal(leaf(h.state, 'hunter').stepId, h0.hunter);
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');

  // Hunter-only path: confirm mark does not complete hauler convoy.
  const pirate = makeHostilePirate({ id: 50 });
  pirate.pos = { x: 10, z: 10 };
  if (!h.state.entities || typeof h.state.entities.set !== 'function') {
    h.state.entities = new Map();
  }
  h.state.entities.set(50, pirate);
  if (typeof hunter.confirmMark === 'function') {
    hunter.confirmMark(pirate);
  }
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');
  assert.notEqual(leaf(h.state, 'hauler').status, LADDER_STATUS.COMPLETED);

  composite.destroy();
});

test('deterministic behavior: same seed + composite signals → identical leaves', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }

  function play(seed) {
    const h = makeHarness(seed);
    const composite = compositeFactory();
    composite.init(h.ctx);
    const hauler = composite.getBranch('hauler');
    hauler.offer({ ignorePrereqs: true });
    hauler.accept({ ignorePrereqs: true });
    hauler.applySignal({ kind: 'complete', receiptId: 'det_r1' });
    hauler.applySignal({ kind: 'fail', code: 'deadline', receiptId: 'det_f1' });
    h.state.simTime = 200;
    hauler.recover({ force: true });
    hauler.applySignal({ kind: 'complete', receiptId: 'det_r2' });
    const own = leaf(h.state, 'hauler');
    const snap = {
      stepId: own.stepId,
      status: own.status,
      history: structuredClone(own.history),
      receipts: structuredClone(own.receipts),
      rngSeed: own.rngSeed,
      ladderSeed: computeLadderRngSeed(seed, 'hauler'),
      hunterStatus: leaf(h.state, 'hunter').status,
      prospectorStatus: leaf(h.state, 'prospector').status,
    };
    composite.destroy();
    clearLadderDefinitions();
    resetProspectorLadderRegistration();
    return snap;
  }

  const a = play(9001);
  const b = play(9001);
  const c = play(9002);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.ladderSeed, c.ladderSeed);
});

test('fixed Hauler heat observation truth: WANTED via heat:changed fails convoy; no heat reward intents', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1009);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const hauler = composite.getBranch('hauler');
  hauler.offer({ ignorePrereqs: true });
  hauler.accept({ ignorePrereqs: true });
  // Land on bonded_convoy (heatGate step).
  assert.equal(hauler.applySignal({ kind: 'complete' }).ok, true);
  assert.equal(leaf(h.state, 'hauler').stepId, 'bonded_convoy');

  // Product observation: heat owner already raised WANTED; ladder only *listens*.
  assert.equal(isPlayerWanted(h.state), false);
  h.state.player.heat = Math.max(WANTED_THRESHOLD, 0.2);
  assert.equal(isPlayerWanted(h.state), true);

  // Live heat.js emit shape (value/level/zone/reason optional; ladder uses isPlayerWanted(state)).
  h.bus.emit('heat:changed', { value: 0.2, level: 1, reason: 'piracy kill' });

  assert.equal(leaf(h.state, 'hauler').status, LADDER_STATUS.RECOVERING);
  assert.equal(leaf(h.state, 'hauler').steps.bonded_convoy.status, STEP_STATUS.RECOVERING);

  // Observation heat:changed is bus *input*, not a ladder reward emit.
  assert.ok(h.events.some((e) => e.event === 'heat:changed'));
  assert.ok(!h.intents.some((i) => i.event === 'heat:changed'));
  assert.ok(h.intents.every((i) => !isForbiddenHeatRewardIntent(i.event)));
  assert.equal(
    h.events.filter((e) => isForbiddenHeatRewardIntent(e.event)).length,
    0,
  );

  // Peers not failed by hauler heat observation.
  assert.notEqual(leaf(h.state, 'hunter').status, LADDER_STATUS.RECOVERING);
  assert.notEqual(leaf(h.state, 'prospector').status, LADDER_STATUS.RECOVERING);

  composite.destroy();
});

test('composite listBranches exposes three bound FSMs; never a second save authority', async () => {
  if (!compositeFactory) {
    const { factory } = await loadCompositeFactory();
    compositeFactory = factory;
  }
  const h = makeHarness(1010);
  const composite = compositeFactory();
  composite.init(h.ctx);

  const listed = composite.listBranches();
  assert.equal(listed.length, 3);
  assert.deepEqual(listed.map((b) => b.careerId), ['hauler', 'hunter', 'prospector']);
  assert.ok(listed.every((b) => b.bound === true));

  // Framework remains sole serialize path.
  assert.equal(typeof composite.serialize, 'undefined');
  assert.equal(typeof composite.deserialize, 'undefined');
  assert.equal(typeof h.ladders.serialize, 'function');
  assert.equal(composite.name, 'liveCareerLadderBranches');

  composite.destroy();
});
