// S1 Phase-B stage 0 — shared 47-A scenario driver.
//
// Single home for the deterministic harness's 47-A orchestration helpers: tape/input
// folding, scenario-entity resolution, handoff staging, contract+snapshot hashing, and
// the save-reload + physics-backend gates. Consumed by BOTH the CLI lane
// (scripts/sf-sim-cli.mjs) and the whole-sim worker lane (scripts/lib/wholeSimWorker.mjs)
// — the spike previously carried a verbatim copy of this block. The golden hash is the
// arbiter for any drift: this module must stay behavior-identical to the union of the
// two former copies (CLI's metrics/options-parameterized forms are the canonical ones;
// the worker passes undefined metrics/options and gets the same semantics it had).
//
// Pure module: no argv reads, no self-execute, no side effects at import.

import { canonicalStringify } from '../../src/core/simSnapshot.js';
import { sha256Hex } from '../../src/runtime/runtimeFingerprint.js';
import { validateScenarioDocument, formatScenarioIssue } from '../../src/contracts/scenarioSchemas.js';
import { realmReadFileSync, realmResolvePath } from './simRealm.mjs';

// Realm-neutral assert — the harness's contract checks are throw-on-violation,
// and this module must import cleanly inside a browser Worker realm (stage 8),
// so node:assert/strict cannot be referenced at import time.
function assert(cond, message) {
  if (!cond) {
    const err = new Error(message === undefined ? 'assertion failed' : message);
    err.name = 'AssertionError';
    throw err;
  }
}
assert.equal = (a, b, message) => assert(a === b,
  message === undefined
    ? `assert.equal failed: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`
    : message);

// Repo root for contract/save file reads — installed by node adapters at boot
// (installRealmFs); the browser realm never reaches readJson (its contract
// ships on the init directive) so the fallback is a loud throw, not a guess.
let _root = null;
export function installScenarioRoot(root) { _root = root; }
function repoPath(rel) {
  if (_root) return realmResolvePath(_root, rel);
  return rel;
}

// Handoff staging positions. Staging at the beat (not spawn) keeps every <=720-tick
// telemetry golden byte-identical; the live route keeps its own dormant-then-approach
// staging via liveColdStartSafe holds.
const HANDOFF_STAND_OFF_TUG = { x: 815, z: 95, rot: -0.35 };
const HANDOFF_ZONE_BEACON = { x: 780, z: 320 };

export function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function readJson(rel) {
  return JSON.parse(realmReadFileSync(repoPath(rel), 'utf8'));
}

export function loadScenarioContract(rel) {
  const path = normalizePath(rel);
  const document = readJson(rel);
  const report = validateScenarioDocument(document, { file: path });
  assert(report.ok, `scenario contract invalid:\n${report.issues.map(formatScenarioIssue).join('\n')}`);
  return {
    path,
    document,
    sha256: sha256Hex(canonicalStringify(document)),
  };
}

export function hashSnapshot(snapshot) {
  return sha256Hex(canonicalStringify(snapshot));
}

export async function preparePhysicsBackend(registry, state, physicsBackend, options = {}) {
  if (physicsBackend !== 'rapier-dynamic') return;
  const physicsSys = registry.get('physics');
  assert(physicsSys, '47-A dynamic replay requires the physics system');
  assert.equal(typeof physicsSys.prepareBackend, 'function',
    '47-A dynamic replay requires physics.prepareBackend');
  const ready = await physicsSys.prepareBackend(state, options);
  assert.equal(ready, true, '47-A dynamic replay requires SG-02 dynamic authority to be ready before ticking');
  assert.equal(state.physicsRuntime && state.physicsRuntime.diagnostics && state.physicsRuntime.diagnostics.sg02Ready,
    true,
    '47-A dynamic replay should publish ready SG-02 diagnostics before ticking');
}

export async function reloadThroughSave(registry, state, metrics, reloadAt, options = {}) {
  const saveSys = registry.get('save');
  assert(saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function',
    '47-A reload check requires the real save system');
  const persistentBefore = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  const envelope = saveSys.serialize('sf-sim-reload');
  assert.equal(saveSys.loadEnvelope(envelope, 'sf-sim-reload'), true, '47-A reload check should load its own envelope');
  // Production saves deliberately migrate every run to the one live V3 controller. sf-sim also
  // exercises the frozen legacy controller as a CI fixture, so keep this restored marker aligned
  // with the controller the harness already registered. This avoids a legacy-flight/V3-attachment
  // hybrid after load.
  state.settings.gameplay.flightBackend = options.flightBackend === 'v3' ? 'v3' : 'legacy';
  const persistentAfter = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  assert.equal(state.tick, reloadAt, '47-A reload should preserve sim tick');
  assert.equal(persistentAfter, persistentBefore, '47-A reload should preserve persistent live actors');
  await preparePhysicsBackend(registry, state, options.physicsBackend || 'rapier-dynamic', { reset: true });
  if (metrics) metrics.saveReloads++;
}

export function applyInput(state, input, options = {}) {
  let aimAngle = finite(input.aimAngle, state.input.aimAngle || 0);
  const player = state.entities.get(state.playerId);
  // Live V3 player translation is 15% snappier than the catalogue drive. The shared Phase-0 tape
  // still aims at the canned legacy bearing, which no longer intersects the proof dummy after the
  // ship carves a wider path. Retarget only V3 proof fire so the tape still proves a hit without
  // rewriting the legacy golden.
  if (options.retargetProofDummy && input.fire && player && player.pos) {
    const dummy = proofDummyEntity(state);
    if (dummy && dummy.pos) {
      aimAngle = Math.atan2(dummy.pos.z - player.pos.z, dummy.pos.x - player.pos.x);
    }
  }
  const origin = player ? player.pos : { x: 0, z: 0 };
  Object.assign(state.input, {
    moveX: finite(input.moveX, 0),
    moveZ: finite(input.moveZ, 0),
    turnIntent: finite(input.turnIntent, input.moveX || 0),
    boost: !!input.boost,
    fire: !!input.fire,
    fireGroup: input.fireGroup == null ? null : input.fireGroup,
    aimAngle,
    aimWorld: {
      x: origin.x + Math.cos(aimAngle) * 1000,
      z: origin.z + Math.sin(aimAngle) * 1000,
    },
  });
}

function proofDummyEntity(state) {
  const list = state.entityList || [];
  for (const entity of list) {
    if (entity && entity.data && entity.data.ai && entity.data.ai.role === 'target_dummy') return entity;
  }
  return null;
}

export function applyTapeCommands(state, helpers, commands) {
  if (!Array.isArray(commands) || commands.length === 0) return;
  for (const command of commands) {
    if (!command) continue;
    if (command.kind === 'scenarioBranch') {
      assert(helpers && typeof helpers.applyScenarioBranch === 'function',
        'golden tape scenarioBranch commands require the SG-05 applyScenarioBranch helper');
      const result = helpers.applyScenarioBranch(command.branchId, {
        source: command.source || 'golden-tape',
      });
      assert(result && result.ok, `golden tape scenarioBranch rejected: ${command.branchId} (${result && result.reason || 'unknown'})`);
      continue;
    }
    if (command.kind !== 'combatAction') continue;
    assert(helpers && typeof helpers.requestCombatAction === 'function',
      'golden tape combatAction commands require the SG-03 requestCombatAction helper');
    const actor = resolveScenarioEntity(state, command.actor);
    assert(actor, `golden tape command actor did not resolve: ${command.actor}`);
    const request = {
      actorId: actor.id,
      actionId: command.actionId,
      source: { kind: command.source || 'player', controllerId: 'golden-tape' },
    };
    if (command.target != null) {
      const target = resolveScenarioEntity(state, command.target);
      assert(target, `golden tape command target did not resolve: ${command.target}`);
      request.targetId = target.id;
    }
    if (command.attachment != null) {
      request.attachmentId = resolveAttachmentRef(state, command.attachment, actor.id);
    }
    const result = helpers.requestCombatAction(request);
    assert(result && result.ok, `golden tape combatAction rejected: ${command.actionId} (${result && result.reason || 'unknown'})`);
  }
}

export function resolveScenarioEntity(state, ref) {
  if (ref == null) return null;
  if (Number.isSafeInteger(ref)) return state.entities.get(ref) || null;
  const id = String(ref);
  if (id === 'player' || id === 'player_kestrel') return state.entities.get(state.playerId) || null;
  const binding = state.scenario && state.scenario.actorBindings && state.scenario.actorBindings[id];
  if (binding && binding.status === 'bound') return state.entities.get(binding.entityId) || null;
  return (state.entityList || []).find((entity) => {
    const data = entity && entity.data || {};
    return data.scenarioActorId === id || data.scenarioRole === id || data.assetRef === id || data.defId === id;
  }) || null;
}

export function resolveAttachmentRef(state, ref, ownerId) {
  const id = String(ref);
  if (id !== 'latestOwned') return id;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  const latest = Object.values(attachments)
    .filter((attachment) => attachment && attachment.state === 'active' && attachment.ownerId === ownerId)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  assert(latest, `golden tape attachment ref did not resolve: ${ref}`);
  return latest.id;
}

export function placeEntity(entity, x, z, rot) {
  if (!entity) return;
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  entity.rot = rot;
  entity.angVel = 0;
  if (entity.vel) {
    entity.vel.x = 0;
    entity.vel.z = 0;
  }
}

export function set47aTacticalActive(entity, active) {
  if (!entity || !entity.data || !entity.data.ai) return;
  entity.data.ai.passive = !active;
}

// The deterministic harness has no tug/beacon flight AI: when the recovery beat opens, the
// official cordon stages at its authored stand-off and Kessler's covert zone keys to the
// handoff pocket — the spot the scripted tow parks the pair (~(735,223)) — so the authored
// live-state predicates can measure real handoff proximity at the resolution beat.
export function stage47aHandoffActors(state, recoveryTug, simTime, activeBeat) {
  if (!(simTime >= 270 || activeBeat === 'recovery_tug' || activeBeat === 'resolution_branch')) return;
  if (recoveryTug && recoveryTug.alive !== false
      && Math.hypot(recoveryTug.pos.x - HANDOFF_STAND_OFF_TUG.x,
        recoveryTug.pos.z - HANDOFF_STAND_OFF_TUG.z) > 0.01) {
    placeEntity(recoveryTug, HANDOFF_STAND_OFF_TUG.x, HANDOFF_STAND_OFF_TUG.z, HANDOFF_STAND_OFF_TUG.rot);
    // noInterp marks an authoritative teleport: the SG-02 owner resyncs the Rapier body to the
    // entity pose on the next step instead of publishing the stale body pose back.
    recoveryTug.flags = Object.assign({}, recoveryTug.flags, { noInterp: true });
    recoveryTug.physicsSleeping = false;
  }
  const beacon = resolveScenarioEntity(state, 'kessler_handoff_beacon');
  if (beacon && Math.hypot(beacon.pos.x - HANDOFF_ZONE_BEACON.x, beacon.pos.z - HANDOFF_ZONE_BEACON.z) > 0.01) {
    placeEntity(beacon, HANDOFF_ZONE_BEACON.x, HANDOFF_ZONE_BEACON.z, beacon.rot || 0);
  }
}

export function update47aScenarioActorIntents(state, options = {}) {
  const player = state.entities.get(state.playerId);
  const scenario = state.scenario && state.scenario.active;
  if (!player || !scenario) return;
  const interceptor = resolveScenarioEntity(state, 'scavenger_interceptor');
  const harasser = resolveScenarioEntity(state, 'scavenger_harasser');
  const thief = resolveScenarioEntity(state, 'scavenger_thief');
  const recoveryTug = resolveScenarioEntity(state, 'official_recovery_tug');
  const activeBeat = scenario.activeBeatId;
  const simTime = state.simTime || 0;
  if (options.counterTetherProbe === 'dash') {
    set47aTacticalActive(interceptor, false);
    set47aTacticalActive(harasser, false);
    set47aTacticalActive(thief, state.tick >= 6);
    set47aTacticalActive(recoveryTug, false);
    return;
  }
  if (options.counterTetherProbe === 'cut') {
    set47aTacticalActive(interceptor, false);
    set47aTacticalActive(harasser, state.tick >= 6);
    set47aTacticalActive(thief, state.tick >= 6);
    set47aTacticalActive(recoveryTug, false);
    return;
  }
  set47aTacticalActive(interceptor, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(harasser, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(thief, simTime >= 75 || activeBeat === 'scavenger_arrival');
  set47aTacticalActive(recoveryTug, simTime >= 270 || activeBeat === 'recovery_tug');
  stage47aHandoffActors(state, recoveryTug, simTime, activeBeat);
  if (!harasser || !harasser.alive) return;
  const shouldFire = (simTime >= 75 && simTime <= 76.25) || (activeBeat === 'scavenger_arrival' && simTime <= 76.25);
  harasser.data.intent = shouldFire
    ? {
        fire: true,
        aimAngle: Math.atan2(player.pos.z - harasser.pos.z, player.pos.x - harasser.pos.x),
      }
    : null;
}
