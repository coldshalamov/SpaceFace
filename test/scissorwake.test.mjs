import test from 'node:test';
import assert from 'node:assert/strict';
import { SCISSORWAKE as C } from '../src/data/scissorwake.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ContactKind } from '../src/ai/contracts.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { scissorwake, scissorwakeEncounter } from '../src/systems/scissorwake.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';

const body = (id, type, x, z, mass = 28) => ({ id, occupantGeneration: id, type, alive: true,
  isPlayer: id === 1, team: id === 3 ? 1 : 0, pos: { x, z }, vel: { x: 0, z: 0 },
  rot: 0, radius: 8, collides: true, hull: 100, hullMax: 100, mass, flags: {}, data: {},
  physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass, inertiaY: mass * 2, revision: 0 } });
function fixture(native = null) {
  const player = body(1, 'ship', 0, 0), anchor = body(2, 'asteroid', 120, 0, 640);
  const cutter = body(3, 'ship', 60, 70); cutter.data.lootTableId = C.enemyId;
  const entities = new Map([player, anchor, cutter].map(e => [e.id, e]));
  const state = { mode: 'flight', tick: 0, simTime: 0, playerId: 1, player: {}, entities,
    entityList: [...entities.values()], runtime: { features: {} }, world: { currentSectorId: 'test-sector' } };
  ensureCombatState(state); const bus = createBus();
  const physics = native || { createAttachment: s => ({ id: s.attachmentId }), cutAttachment: () => true };
  if (native) native.syncFromEntities(state.entityList);
  const attachments = createAttachmentService({ state, bus, catalog: createCombatCatalog(), helpers: { combatPhysics: physics } });
  const created = attachments.create({ defId: 'tether_standard', ownerId: 1, targetId: 2,
    sourceWorld: { x: 0, z: 0 }, targetWorld: { x: 120, z: 0 } });
  assert.equal(created.ok, true, created.reason);
  const line = created.attachment;
  const corridor = { origin: { x: 60, z: 70 }, dir: { x: 0, z: -1 }, range: C.passRangeWu, halfWidth: C.bladeRadiusWu };
  const apply = (tick, phase = 'spool_cue') => applySpecialistCounterplay({ state, specialist: cutter,
    enemyId: C.enemyId, tick, doctrinePhase: phase, attachments,
    doctrine: { phaseStartedTick: 0, cutterAttachmentId: line.id, attackLine: corridor } });
  return { state, bus, player, anchor, cutter, line, attachments, corridor, apply };
}

test('Scissorwake is light ammunition with no automatic damage or EMP combo', () => {
  const row = ENEMY_TYPES.find(e => e.id === C.enemyId);
  assert.equal(row.mass, 28); assert.deepEqual(row.weapons, []);
  assert.equal(row.combatDoctrineId, C.doctrineId);
});

test('canonical cutter owner waits for a full warning then removes exactly one actual line', () => {
  const h = fixture(); h.apply(0);
  h.cutter.pos.z = 5;
  assert.equal(h.apply(C.windupTicks - 1, 'attach_window'), null);
  assert.equal(h.line.state, 'active');
  h.cutter.pos.z = -5;
  const result = h.apply(C.windupTicks, 'attach_window');
  assert.equal(result?.ok, true); assert.equal(h.line.state, 'broken');
  assert.equal(h.line.breakReason, 'specialist_cut');
  assert.equal(h.apply(C.windupTicks + 1, 'attach_window'), null);
  assert.equal(h.cutter.data.scissorwakeOutcome, 'cut');
});

test('move the cable outside the crossing; fixed corridor does not home onto it', () => {
  const h = fixture(); h.apply(0);
  h.player.pos.z = h.anchor.pos.z = 200; h.cutter.pos.z = -10;
  assert.equal(h.apply(C.windupTicks, 'attach_window'), null);
  assert.equal(h.line.state, 'active');
});

for (const counter of ['shove_sideways', 'reverse', 'disable_drive', 'stale_life']) test(`${counter} prevents a timer-only cut and buys recovery`, () => {
  const h = fixture(); h.apply(0);
  if (counter === 'shove_sideways') h.cutter.pos.x += 90;
  else if (counter === 'reverse') h.cutter.pos.z += 30;
  else if (counter === 'disable_drive') h.state.combat.entities[String(h.cutter.id)] = { capabilities: { drive: false } };
  else h.cutter.occupantGeneration++;
  assert.equal(h.apply(C.windupTicks, 'attach_window'), null);
  assert.equal(h.line.state, 'active');
  assert.equal(h.cutter.data._cutterCommit, undefined);
  assert.ok(h.cutter.data._cutterRecoverUntil >= C.windupTicks + C.recoveryTicks);
});

test('manual release on the impact tick wins without double removal or momentum reset', () => {
  const h = fixture(); h.apply(0); h.player.vel.x = 71; h.cutter.pos.z = -10;
  assert.equal(h.attachments.cut(h.line.id, h.player.id).ok, true);
  assert.equal(h.apply(C.windupTicks, 'attach_window'), null);
  assert.equal(h.player.vel.x, 71); assert.equal(h.line.state, 'broken');
});

test('an unannounced or restored late window cannot create an instant cut', () => {
  const h = fixture(); h.cutter.pos.z = 0;
  assert.equal(h.apply(C.windupTicks, 'attach_window'), null);
  assert.equal(h.line.state, 'active');
});

test('doctrine publishes one fixed corridor, 54-tick cue and bounded physical recovery', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  const self = { id: 3, pos: { x: 60, z: 70 }, rot: -Math.PI / 2, radius: 8,
    activity: { kind: 'attack_run' }, roe: 'weapons_free' };
  const player = { id: 1, kind: ContactKind.SHIP, pos: { x: 0, z: 0 }, alive: true, valid: true,
    visible: true, hostile: true, confidence: 1, threat: 1, tethered: true };
  const line = { id: 'line', attachmentId: 'line', kind: ContactKind.TETHER, pos: { x: 60, z: 0 },
    ownerId: 1, targetId: 2, alive: true, valid: true, visible: true };
  const perception = { self, contacts: [player, line] };
  const update = tick => runtime.update({ tick, entityId: 3, doctrineId: C.doctrineId, perception });
  const cue = update(0); assert.equal(cue.phase, 'spool_cue');
  assert.equal(cue.telegraph.durationTicks, C.windupTicks); assert.equal(cue.allowedActionId, null);
  const corridor = cue.attackLine;
  assert.equal(cue.flightPoint, null, 'windup holds position instead of spending its pass before arming');
  const point = { x: corridor.origin.x + corridor.dir.x * corridor.range,
    z: corridor.origin.z + corridor.dir.z * corridor.range };
  line.pos.x += 30; player.pos.x += 50;
  const commit = update(C.windupTicks);
  assert.equal(commit.phase, 'attach_window'); assert.deepEqual(commit.attackLine, corridor);
  assert.deepEqual(commit.flightPoint, point); assert.equal(commit.maneuverTargetId, null);
  assert.equal(commit.fireWindow, false); assert.equal(commit.allowedActionId, null);
  assert.equal(update(C.windupTicks + C.passTicks).phase, 'escape');
  assert.equal(update(C.windupTicks + C.passTicks + C.recoveryTicks).phase, 'reform');
});

test('a native moving hull crosses the actual cable; render batching cannot alter cut tick', async () => {
  const runs = [];
  for (const renderBatch of [1, 4]) {
    const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      const h = fixture(native); h.apply(0); let cutTick = null;
      let tick = 0;
      while (tick < C.windupTicks + C.passTicks) for (let substep = 0;
        substep < renderBatch && tick < C.windupTicks + C.passTicks; substep++) {
        tick++;
        h.state.tick = tick;
        if (tick === C.windupTicks) queuePhysicsImpulse(h.cutter, { x: 0, z: -28 * 130 });
        native.syncFromEntities(h.state.entityList); native.step(1 / 60);
        const result = h.apply(tick, tick < C.windupTicks ? 'spool_cue' : 'attach_window');
        if (result?.ok && cutTick == null) cutTick = tick;
      }
      assert.ok(cutTick > C.windupTicks); runs.push(cutTick);
    } finally { native.dispose(); }
  }
  assert.equal(runs[0], runs[1]);
});

test('introduction is once per run, respects pacing refusal and persists across Continue', () => {
  const sim = createSimulation({ seed: 7, systems: [scissorwake] });
  try {
    const sys = sim.registry.get('scissorwake'), h = fixture();
    sys.state = h.state; sys.ctx = { ...sys.ctx, state: h.state };
    // The normal owner is injected; the requester never spawns behind its budget.
    let calls = 0;
    sys.ctx.registry = { get: name => name === 'encounterDirector' ? { requestAuthoredEncounter(p) {
      calls++; assert.equal(p.respectPacing, true); assert.equal(p.force, undefined);
      return { ok: calls > 1, reason: 'pacing' };
    } } : null };
    sys._row.lineUse = C.lineUseSeconds; h.state.simTime = C.earliestSeconds;
    sys.update(1 / 60, h.state); assert.equal(sys._row.introduced, false);
    h.state.simTime += 3; sys.update(1 / 60, h.state); assert.equal(sys._row.introduced, true);
    const saved = sys.serialize(); sys.deserialize(saved); sys.update(1 / 60, h.state);
    assert.equal(calls, 2);
    resetFreshRunSystems(sim.registry);
    assert.deepEqual(sys.serialize(), { introduced: false, lineUse: 0 });
    assert.equal(sys._nextRequest, 0);
  } finally { sim.dispose(); }
});
