// Phase 3 review: close false-positive evidence paths (P1 guards).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';
import { evaluateOracles } from '../src/testing/lab/oracleEngine.js';
import {
  createInputTapeDriver,
  collectFrameCommandsAtTick,
} from '../src/testing/lab/inputTape.js';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';
import { FOCUSED_FLIGHT_SYSTEMS, FOCUSED_MASSLINE_SYSTEMS } from '../src/testing/lab/systemBundles.js';
import { validateSimScenario } from '../src/contracts/simScenarioSchema.js';
import { sanitizeCommand } from '../scripts/lib/masslineControlLab.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));
const saveLoadDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-save-load.scenario.json'),
  'utf8',
));
const orbitDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/massline-orbit-assist.scenario.json'),
  'utf8',
));

// ── FIX 4: NaN must fail finite-state invariant (not normalize to 0) ─────────

test('FIX4: NaN in traced field fails invariant.finiteState (oracle path)', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 1, playerZ: 2, playerVelX: 0, playerVelZ: 3, hull: 100, cap: 50, credits: 10 },
      { tick: 1, playerX: NaN, playerZ: 2, playerVelX: 0, playerVelZ: 3, hull: 100, cap: 50, credits: 10 },
    ],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
  });
  assert.equal(oracle.ok, false, 'oracle must fail when NaN is present');
  const finite = oracle.failed.find((f) => f.id === 'finite-state' || (f.id && f.id.includes('finite')));
  assert.ok(finite, `expected finite-state failure, got ${JSON.stringify(oracle.failed)}`);
  assert.equal(finite.ok, false);
  assert.equal(finite.firstBadTick, 1);
});

test('FIX4: Infinity in traced field fails invariant.finiteState', () => {
  const oracle = evaluateOracles({
    trace: [
      { tick: 0, playerX: 0, playerZ: 0, playerVelX: Infinity, playerVelZ: 0 },
    ],
    metrics: [],
    assertions: [],
  });
  assert.equal(oracle.ok, false);
  assert.ok(oracle.failed.some((f) => f.id === 'finite-state'));
});

test('FIX4: runner samples preserve NaN so invariant catches poisoned pose', async () => {
  const poison = {
    name: 'labNanInjector',
    init(ctx) {
      this.state = ctx.state;
    },
    update() {
      // core preStep already advanced tick; poison mid-run pose for makeSample.
      if ((this.state.tick | 0) === 5) {
        const p = this.state.entities.get(this.state.playerId);
        if (p && p.pos) p.pos.x = Number.NaN;
      }
    },
  };
  const result = await runLabScenario({
    ...flightDoc,
    id: 'flight.nan-poison',
    ticks: 20,
  }, {
    verbosity: 2,
    systems: [...FOCUSED_FLIGHT_SYSTEMS, poison],
  });
  // Either oracle fails finite-state (preferred) or infra if physics rejects NaN — never a silent pass.
  assert.equal(result.ok, false, `poisoned NaN must not pass: ${JSON.stringify(result.oracle || result.error)}`);
  if (result.exitClass === 1) {
    const failed = (result.oracle && result.oracle.failed) || [];
    assert.ok(
      failed.some((f) => (f.id && f.id.includes('finite')) || (f.id && f.id.includes('finiteState'))),
      `expected finite-state failure: ${JSON.stringify(failed)}`,
    );
  }
});

// ── FIX 5: public-input routes through grammar.step ─────────────────────────

test('FIX5: public-input massline packet produced by grammar.step (spy)', async () => {
  let stepCalls = 0;
  const real = createMasslineInputGrammar();
  const spyGrammar = {
    step(dt, raw) {
      stepCalls += 1;
      return real.step(dt, raw);
    },
    reset: (...args) => real.reset(...args),
    get command() { return real.command; },
  };

  const result = await runLabScenario(orbitDoc, {
    verbosity: 2,
    masslineGrammar: spyGrammar,
  });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.notEqual(result.exitClass, 4, JSON.stringify(result.validation || result.error));
  assert.ok(stepCalls >= orbitDoc.ticks, `grammar.step must run every tick, got ${stepCalls}`);
  // Packet source must not be the old hardcoded lab-public-intent path.
  assert.equal(result.evidenceClass, 'public-input');
});

test('FIX5: public-input driver does not accept hardcoded massline packet override', () => {
  const driver = createInputTapeDriver({
    events: [
      { tick: 0, device: 'keyboard', code: 'KeyF', pressed: true, sequence: 0 },
    ],
    frames: [
      {
        tick: 0,
        input: {
          massline: {
            phase: 'line-control',
            lineControl: true,
            reelIn: 1,
            source: 'hardcoded-cheat',
          },
        },
      },
    ],
  }, {
    allowMasslinePacketOverride: false,
  });

  const state = {
    input: { actions: {} },
    entities: new Map(),
    playerId: 1,
  };
  const applied = driver.apply(state, 0, 1 / 60, { tetherAttached: true, playerEntity: { pos: { x: 0, z: 0 }, rot: 0 } });
  assert.ok(applied.massline);
  assert.notEqual(applied.massline.source, 'hardcoded-cheat');
  assert.notEqual(state.input.actions.massline.source, 'hardcoded-cheat');
});

// ── FIX 1: control arm has zero restores ────────────────────────────────────

test('FIX1: uninterrupted control arm performs zero save/load restores', async () => {
  const result = await compareSaveLoad(saveLoadDoc, {
    verbosity: 2,
    saveLoadAt: 40,
  });
  assert.notEqual(result.exitClass, 3, JSON.stringify(result.withSaveLoad && result.withSaveLoad.error));
  assert.notEqual(result.exitClass, 4, JSON.stringify(result));

  const unint = result.uninterrupted;
  const withSl = result.withSaveLoad;
  // Summarized or full result both expose params when verbosity>=2
  const unintParams = unint.params || {};
  const withParams = withSl.params || {};
  assert.equal(unintParams.saveLoadRestoreCount | 0, 0, 'control arm must have zero restores');
  assert.equal(unintParams.saveLoadPerformed, false);
  assert.equal(result.controlRestoreCount | 0, 0);
  assert.equal(withParams.saveLoadPerformed, true, 'comparison arm must actually restore');
  assert.ok((withParams.saveLoadRestoreCount | 0) >= 1, 'comparison arm restore count >= 1');
});

// ── FIX 2: double-fail is not parity pass ───────────────────────────────────

test('FIX2: both arms failing the same oracle → comparison fails (not vacuous pass)', async () => {
  const failing = {
    ...saveLoadDoc,
    id: 'flight.save-load.double-fail',
    metrics: [
      {
        name: 'flight.finalSpeed',
        version: 1,
        // Impossible threshold: both arms fail oracle
        threshold: { op: '<=', value: -1 },
      },
    ],
  };
  const result = await compareSaveLoad(failing, {
    verbosity: 1,
    saveLoadAt: 40,
  });
  assert.equal(result.ok, false, 'parity of two oracle failures must not pass');
  assert.equal(result.status, 'arm-oracle-fail');
  assert.equal(result.exitClass, 1);
  assert.ok(Array.isArray(result.failedArms) && result.failedArms.length >= 1);
  assert.equal(result.equivalence['uninterrupted-eq-save-load'].ok, false);
});

// ── FIX 3: no save system → unsupported, not silent parity ──────────────────

test('FIX3: save/load without save system is unsupported (no no-op success)', async () => {
  // flight-fixed-input has no save-load checkpoint and flight bundle has no save system.
  // Force a mid-run restore request via options.
  const result = await runLabScenario(flightDoc, {
    verbosity: 1,
    saveLoadAt: 20,
    allowRuntimeCheckpoint: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.equal(result.status, 'unsupported');
  assert.ok(
    /save/i.test(String(result.error || '')),
    `error should mention save system: ${result.error}`,
  );
});

test('FIX3: compareSaveLoad on flight-fixed-input without save is unsupported', async () => {
  const result = await compareSaveLoad(flightDoc, {
    verbosity: 1,
    saveLoadAt: 30,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitClass, 4);
  assert.ok(
    result.status === 'unsupported' || result.status === 'invalid-config',
    `status=${result.status}`,
  );
});

// ── FIX 6: unimplemented temporal assertions rejected ───────────────────────

test('FIX6: unimplemented temporal kinds rejected at validation', () => {
  for (const kind of ['precedes', 'eventInInterval', 'inputReleaseNextTick']) {
    const v = validateSimScenario({
      ...flightDoc,
      assertions: [{ kind, signal: 'tetherActive' }],
    });
    assert.equal(v.ok, false, `${kind} must be rejected`);
    assert.ok(
      v.issues.some((i) => i.rule === 'unsupported-assertion'),
      `${kind}: ${JSON.stringify(v.issues)}`,
    );
  }
});

test('FIX6: unimplemented temporal kinds fail at evaluation (never soft-pass)', () => {
  const oracle = evaluateOracles({
    trace: [{ tick: 0, playerX: 0, playerZ: 0, playerVelX: 0, playerVelZ: 0 }],
    assertions: [{ kind: 'precedes', signal: 'a' }],
  });
  assert.equal(oracle.ok, false);
  assert.ok(oracle.failed.some((f) => f.actual === 'unsupported-temporal-kind' || f.id === 'precedes'));
});

// ── FIX 8: invariants see every tick even when sampleEvery > 1 ──────────────

test('FIX8: invariants evaluate every tick independent of sampleEvery', async () => {
  const poison = {
    name: 'labNanInjectorSparse',
    init(ctx) { this.state = ctx.state; },
    update() {
      // Tick 3 is between sample points when sampleEvery=5 (samples 0,5,10,...)
      if ((this.state.tick | 0) === 3) {
        const p = this.state.entities.get(this.state.playerId);
        if (p && p.pos) p.pos.x = Number.NaN;
      }
    },
  };
  const result = await runLabScenario({
    ...flightDoc,
    id: 'flight.sparse-sample-nan',
    ticks: 20,
    trace: { signals: ['playerX', 'playerZ'], sampleEvery: 5 },
  }, {
    verbosity: 2,
    systems: [...FOCUSED_FLIGHT_SYSTEMS, poison],
  });
  assert.equal(result.ok, false, 'transient NaN between samples must fail invariants');
});

// ── FIX 9: overlay params consumed ──────────────────────────────────────────

test('FIX9: lab.entrySpeed overlay changes player speed', async () => {
  const base = await runLabScenario({
    ...flightDoc,
    id: 'flight.overlay-base',
    ticks: 5,
    parameterOverlay: undefined,
  }, { verbosity: 1 });
  const withSpeed = await runLabScenario({
    ...flightDoc,
    id: 'flight.overlay-speed',
    ticks: 5,
    parameterOverlay: {
      schema: 'spaceface.labParameterOverlay.v1',
      version: 1,
      values: { 'lab.entrySpeed': 80 },
    },
  }, { verbosity: 1 });
  assert.equal(base.exitClass === 3, false, base.error);
  assert.equal(withSpeed.exitClass === 3, false, withSpeed.error);
  assert.ok(withSpeed.overlayApplied && withSpeed.overlayApplied['lab.entrySpeed'] === 80);
  assert.ok(withSpeed.overlayParams && withSpeed.overlayParams.entrySpeed === 80);
  // Different overlay should yield different deterministic hash (speed applied).
  assert.notEqual(
    base.checkpoints.final.deterministicCovered.hash,
    withSpeed.checkpoints.final.deterministicCovered.hash,
  );
});

// ── FIX 10: authored attachment restLength applied ──────────────────────────

test('FIX10: authored attachment restLength is applied after create', async () => {
  const latch = JSON.parse(readFileSync(
    join(ROOT, '../src/testing/scenarios/massline-latch-reel.scenario.json'),
    'utf8',
  ));
  // Distance player(0,0)→anchor(120,0) ≈ 120; request shorter rest.
  const withRest = {
    ...latch,
    id: 'massline.rest-length-authored',
    ticks: 10,
    attachments: [{
      defId: 'tether_standard',
      ownerAlias: 'player',
      targetAlias: 'anchor',
      restLength: 90,
    }],
  };
  const result = await runLabScenario(withRest, { verbosity: 2 });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.ok(Number.isFinite(result.params.restLength0));
  // Allow small physics acceptance tolerance
  assert.ok(
    Math.abs(result.params.restLength0 - 90) < 1.0,
    `restLength0 should be ~90, got ${result.params.restLength0}`,
  );
});

// ── FIX 11: lab.maxImpulse overlay must clamp controller commands ───────────

test('FIX11: sanitizeCommand honors overlay maxImpulse bound', () => {
  const cmd = sanitizeCommand({ x: 100, z: 0 }, { maxImpulse: 1 });
  assert.equal(cmd.rejected, false);
  assert.equal(cmd.clamped, true);
  assert.ok(Math.abs(cmd.x) <= 1 + 1e-9, `cmdX=${cmd.x} must be ≤ 1`);
  assert.ok(Math.abs(Math.hypot(cmd.x, cmd.z) - 1) < 1e-6);
  // Without overlay bound, default lab max is huge — 100 is unclamped.
  const unclamped = sanitizeCommand({ x: 100, z: 0 });
  assert.equal(unclamped.clamped, false);
  assert.equal(unclamped.x, 100);
});

test('FIX11: lab.maxImpulse overlay clamps traced controller command', async () => {
  const result = await runLabScenario({
    ...orbitDoc,
    id: 'massline.max-impulse-overlay',
    ticks: 20,
    // Avoid public-input grammar path constraints for this controller clamp probe.
    evidenceClass: 'focused-fixture',
    policies: [{ id: 'none', version: 1 }],
    parameterOverlay: {
      schema: 'spaceface.labParameterOverlay.v1',
      version: 1,
      values: { 'lab.maxImpulse': 1 },
    },
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
  }, {
    verbosity: 3,
    controller: () => ({ x: 100, z: 0 }),
  });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.notEqual(result.exitClass, 4, JSON.stringify(result.validation || result.error));
  assert.ok(result.overlayApplied && result.overlayApplied['lab.maxImpulse'] === 1);
  assert.ok(result.overlayParams && result.overlayParams.maxImpulse === 1);
  assert.ok(Array.isArray(result.trace) && result.trace.length > 0, 'verbosity 3 must expose trace');
  const withCmd = result.trace.filter((s) => s.cmdX != null || s.cmdClamped != null);
  assert.ok(withCmd.length > 0, 'controller must leave lastCommand samples on the trace');
  for (const s of withCmd) {
    if (s.cmdRejected) continue;
    assert.ok(Math.abs(s.cmdX) <= 1 + 1e-6, `traced cmdX=${s.cmdX} must be clamped to overlay maxImpulse=1`);
    assert.equal(s.cmdClamped, true, `expected cmdClamped true at tick ${s.tick}`);
  }
});

// ── FIX 12: same-tick frames must not drop earlier commands ─────────────────

test('FIX12: collectFrameCommandsAtTick accumulates every same-tick frame', () => {
  const frames = [
    { tick: 5, commands: [{ kind: 'combatAction', actionId: 'first', actor: 'player' }] },
    { tick: 5, commands: [{ kind: 'combatAction', actionId: 'second', actor: 'player' }] },
    { tick: 6, commands: [{ kind: 'combatAction', actionId: 'later', actor: 'player' }] },
  ];
  const at5 = collectFrameCommandsAtTick(frames, 5);
  assert.equal(at5.length, 2);
  assert.equal(at5[0].actionId, 'first');
  assert.equal(at5[1].actionId, 'second');
  assert.equal(collectFrameCommandsAtTick(frames, 6).length, 1);
  assert.equal(collectFrameCommandsAtTick(frames, 4).length, 0);
});

test('FIX12: driver dispatches commands from every frame at the current tick', () => {
  const driver = createInputTapeDriver({
    frames: [
      {
        tick: 5,
        input: { moveX: 0, moveZ: 0 },
        commands: [{ kind: 'combatAction', actionId: 'cmd-a', actor: 'player' }],
      },
      {
        tick: 5,
        input: { moveX: 1, moveZ: 0 },
        commands: [{ kind: 'combatAction', actionId: 'cmd-b', actor: 'player' }],
      },
    ],
  }, { masslineGrammar: false });

  const state = {
    input: { actions: {} },
    entities: new Map(),
    playerId: 1,
  };
  // Before tick 5: no commands.
  const early = driver.apply(state, 4, 1 / 60, {});
  assert.equal(early.frameCommands.length, 0);

  const atTick = driver.apply(state, 5, 1 / 60, {});
  assert.equal(atTick.frameCommands.length, 2, 'both same-tick frame commands must dispatch');
  assert.equal(atTick.frameCommands[0].actionId, 'cmd-a');
  assert.equal(atTick.frameCommands[1].actionId, 'cmd-b');
  // Sticky input still last-wins.
  assert.equal(atTick.moveX, 1);
});

// ── FIX 13: anchorMass targets attachment targetAlias ───────────────────────

test('FIX13: lab.anchorMass applies to attachment targetAlias, not insertion-order decoy', async () => {
  const masses = Object.create(null);
  const capture = {
    name: 'labAnchorMassCapture',
    init(ctx) { this.state = ctx.state; this.captured = false; },
    update() {
      if (this.captured) return;
      this.captured = true;
      for (const entity of this.state.entities.values()) {
        const alias = entity && entity.data && entity.data.scenarioAlias;
        if (alias) masses[alias] = entity.mass;
      }
    },
  };

  const result = await runLabScenario({
    schema: 'spaceface.simScenario.v1',
    id: 'massline.anchor-mass-target-alias',
    version: 1,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed: 47,
    ticks: 8,
    world: {
      fixtureProfile: 'massline',
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
    },
    entities: [
      {
        alias: 'player',
        profile: 'ship.starter',
        role: 'player',
        team: 0,
        isPlayer: true,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 10 },
        heading: 0,
        persistent: true,
      },
      {
        // Inserted before the real target — old heuristic would rewrite this mass.
        alias: 'decoy',
        profile: 'asteroid.mid',
        role: 'lab_decoy',
        team: 2,
        pos: { x: -40, z: 0 },
        overrides: { mass: 111, radius: 3 },
        persistent: true,
      },
      {
        alias: 'heavy',
        profile: 'asteroid.heavy',
        role: 'lab_anchor',
        team: 2,
        pos: { x: 120, z: 0 },
        overrides: { mass: 400, radius: 6 },
        persistent: true,
      },
    ],
    attachments: [{
      defId: 'tether_standard',
      ownerAlias: 'player',
      targetAlias: 'heavy',
    }],
    parameterOverlay: {
      schema: 'spaceface.labParameterOverlay.v1',
      version: 1,
      values: { 'lab.anchorMass': 9000 },
    },
    frames: [{ tick: 0, input: { moveX: 0, moveZ: 0 } }],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    observer: { enabled: false },
  }, {
    verbosity: 1,
    systems: [...FOCUSED_MASSLINE_SYSTEMS, capture],
  });

  assert.notEqual(result.exitClass, 3, result.error);
  assert.notEqual(result.exitClass, 4, JSON.stringify(result.validation || result.error));
  assert.ok(result.overlayApplied && result.overlayApplied['lab.anchorMass'] === 9000);
  assert.equal(masses.heavy, 9000, `heavy (targetAlias) mass must be 9000, got ${masses.heavy}`);
  assert.equal(masses.decoy, 111, `decoy must keep authored mass 111, got ${masses.decoy}`);
});
