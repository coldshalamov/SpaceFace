import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  PERFORMANCE_SCENARIO_IDS,
  performanceScenario,
} from '../scripts/lib/performanceClosureContracts.mjs';
import {
  PERFORMANCE_FRAME_IDENTIFIERS,
  PERFORMANCE_SCENARIO_MANIFEST_LIMITS,
  PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
  compilePerformanceScenarioManifest,
  validatePerformanceScenarioManifest,
} from '../scripts/lib/performanceScenarioManifest.mjs';
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';

const SHA256 = 'a'.repeat(64);

function scenarioFixture(id = PERFORMANCE_SCENARIO_IDS[0]) {
  return {
    id,
    seed: 47,
    save: { kind: 'new-game' },
    inputTape: {
      events: [
        { tick: 3, sequence: 2, device: 'keyboard', code: 'KeyW', pressed: false },
        { tick: 0, sequence: 1, device: 'keyboard', code: 'KeyW', pressed: true },
        { tick: 3, sequence: 1, keys: { ShiftLeft: false } },
      ],
      frames: [
        { tick: 3, sequence: 1, input: { moveZ: 0 }, commands: [] },
        { tick: 0, sequence: 0, input: { moveZ: 1, fire: false }, commands: [] },
      ],
    },
    cameraTape: [
      { tick: 3, sequence: 0, mode: 'follow', position: [0, 20, -30], target: [0, 0, 0], fov: 55 },
      { tick: 0, sequence: 0, mode: 'follow', position: [0, 20, -30], target: [0, 0, 0], fov: 55 },
    ],
    entityMultiplier: 1,
    requiredTelemetry: [...PERFORMANCE_FRAME_IDENTIFIERS],
    expectedRouteCompletion: { marker: 'route:performance-window-complete', value: true },
  };
}

function manifestFixture(overrides = {}) {
  return {
    schema: PERFORMANCE_SCENARIO_MANIFEST_SCHEMA,
    version: 1,
    id: 'perf00-focused-fixture',
    scenarios: [scenarioFixture()],
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

test('manifest compiler reuses the current scenario authority and emits immutable SHA-256-bound records', () => {
  const source = manifestFixture();
  const before = clone(source);
  const compiled = compilePerformanceScenarioManifest(source, { source: 'design/perf/fixture.json' });
  const scenario = compiled.scenarios[0];

  assert.deepEqual(source, before, 'compilation must not mutate the source document');
  assert.equal(compiled.schema, PERFORMANCE_SCENARIO_MANIFEST_SCHEMA);
  assert.equal(compiled.version, 1);
  assert.equal(compiled.source, 'design/perf/fixture.json');
  assert.deepEqual(
    scenario.inputTape.events.map((entry) => [entry.tick, entry.sequence, entry.code || Object.keys(entry.keys || {})[0]]),
    [[0, 1, 'KeyW'], [3, 1, 'ShiftLeft'], [3, 2, 'KeyW']],
  );
  assert.deepEqual(scenario.inputTape.frames.map((entry) => [entry.tick, entry.sequence]), [[0, 0], [3, 1]]);
  assert.deepEqual(scenario.cameraTape.map((entry) => entry.tick), [0, 3]);
  for (const digest of [
    compiled.manifestDigest,
    scenario.scenarioDigest,
    scenario.scenarioDefinitionDigest,
    scenario.saveDigest,
    scenario.inputDigest,
    scenario.cameraDigest,
  ]) assert.match(digest, /^[a-f0-9]{64}$/i);
  assert.equal(
    scenario.scenarioDefinitionDigest,
    sha256Canonical(performanceScenario(scenario.id)),
  );
  assert.equal(Object.isFrozen(compiled), true);
  assert.equal(Object.isFrozen(compiled.scenarios), true);
  assert.equal(Object.isFrozen(scenario.inputTape.events[0]), true);
  assert.throws(() => { scenario.seed = 9; }, TypeError);
});

test('canonical fixture pins every SHA-256 identity', () => {
  const compiled = compilePerformanceScenarioManifest(manifestFixture());
  const scenario = compiled.scenarios[0];
  assert.deepEqual(
    {
      manifestDigest: compiled.manifestDigest,
      scenarioDigest: scenario.scenarioDigest,
      scenarioDefinitionDigest: scenario.scenarioDefinitionDigest,
      saveDigest: scenario.saveDigest,
      inputDigest: scenario.inputDigest,
      cameraDigest: scenario.cameraDigest,
    },
    {
      manifestDigest: '5812fd8d8aca521d83f91679bcd63021d75ae313332634a09bbcab74b6ef2c1e',
      scenarioDigest: '7c47e0215805125fd7778fba82c4d80ff5542af4e007de79a5be17941a6fb5d4',
      scenarioDefinitionDigest: 'ed6dbe808b969feaa02bd4ae66a227236847768344c30e2dced7161b5e960047',
      saveDigest: '41e9fd33c745acb8544570483e55218fe10d23bc4ef94c694e0d733b0f5ec843',
      inputDigest: '9606bc9b06fe8a288da01bb1899a523532d840f3e562c3187695606e15158273',
      cameraDigest: 'c99aa272a48bc74a36ebaabc168e2e1c1ce71c622b5fad0957f1a2005995697b',
    },
  );
});

test('scenario identity binds the canonical production route definition', () => {
  const scenario = compilePerformanceScenarioManifest(manifestFixture()).scenarios[0];
  const identity = {
    id: scenario.id,
    scenarioDefinitionDigest: scenario.scenarioDefinitionDigest,
    seed: scenario.seed,
    saveDigest: scenario.saveDigest,
    inputDigest: scenario.inputDigest,
    cameraDigest: scenario.cameraDigest,
    entityMultiplier: scenario.entityMultiplier,
    requiredTelemetry: scenario.requiredTelemetry,
    expectedRouteCompletion: scenario.expectedRouteCompletion,
  };

  assert.equal(
    scenario.scenarioDefinitionDigest,
    sha256Canonical(performanceScenario(scenario.id)),
  );
  assert.equal(scenario.scenarioDigest, sha256Canonical(identity));
  assert.notEqual(
    scenario.scenarioDigest,
    sha256Canonical({
      ...identity,
      scenarioDefinitionDigest: 'f'.repeat(64),
    }),
  );
});

test('scenario definition identity ignores mutable Array.prototype lookup hooks', () => {
  const targetId = PERFORMANCE_SCENARIO_IDS[1];
  const expectedDigest = sha256Canonical(performanceScenario(targetId));
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'find');
  let hookCalls = 0;
  let compiled;
  try {
    Object.defineProperty(Array.prototype, 'find', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return this[0];
      },
    });
    compiled = compilePerformanceScenarioManifest(manifestFixture({
      scenarios: [scenarioFixture(targetId)],
    }));
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'find', descriptor);
    else delete Array.prototype.find;
  }

  assert.equal(hookCalls, 0);
  assert.equal(compiled.scenarios[0].id, targetId);
  assert.equal(compiled.scenarios[0].scenarioDefinitionDigest, expectedDigest);
});

test('canonical scenario ordering ignores mutable Map.prototype lookup hooks', () => {
  const ids = PERFORMANCE_SCENARIO_IDS.slice(0, 2);
  const expected = compilePerformanceScenarioManifest(manifestFixture({
    scenarios: ids.map((id) => scenarioFixture(id)),
  }));
  const reversed = manifestFixture({
    scenarios: ids.map((id) => scenarioFixture(id)).reverse(),
  });
  const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'get');
  let hookCalls = 0;
  let compiled;
  try {
    Object.defineProperty(Map.prototype, 'get', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return 0;
      },
    });
    compiled = compilePerformanceScenarioManifest(reversed);
  } finally {
    if (descriptor) Object.defineProperty(Map.prototype, 'get', descriptor);
    else delete Map.prototype.get;
  }

  assert.equal(hookCalls, 0);
  assert.deepEqual(
    compiled.scenarios.map((scenario) => scenario.id),
    expected.scenarios.map((scenario) => scenario.id),
  );
  assert.equal(compiled.manifestDigest, expected.manifestDigest);
});

test('canonical hashing never invokes inherited serializer hooks', () => {
  const objectDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const arrayDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let calls = 0;
  let first;
  let second;
  try {
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value() { calls += 1; return 'object-hook'; },
    });
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value() { calls += 1; return 'array-hook'; },
    });
    first = compilePerformanceScenarioManifest(manifestFixture());
    const changed = manifestFixture();
    changed.scenarios[0].seed += 1;
    second = compilePerformanceScenarioManifest(changed);
  } finally {
    if (objectDescriptor) Object.defineProperty(Object.prototype, 'toJSON', objectDescriptor);
    else delete Object.prototype.toJSON;
    if (arrayDescriptor) Object.defineProperty(Array.prototype, 'toJSON', arrayDescriptor);
    else delete Array.prototype.toJSON;
  }

  assert.equal(calls, 0);
  assert.notEqual(first.scenarios[0].scenarioDigest, second.scenarios[0].scenarioDigest);
  assert.notEqual(first.manifestDigest, second.manifestDigest);
});

test('compiled replay semantics cannot inherit unhashed Object.prototype values', () => {
  const replayMoveZ = (compiled) => {
    const state = {
      settings: { controls: { bindings: null }, gameplay: {} },
      input: {},
      entities: new Map(),
      playerId: 'player',
    };
    const driver = createInputTapeDriver(compiled.scenarios[0].inputTape, {
      masslineGrammar: false,
    });
    driver.apply(state, 0, 1 / 60, {
      playerEntity: { rot: 0, pos: { x: 0, z: 0 } },
    });
    return state.input.moveZ;
  };
  const restore = (key, descriptor) => {
    if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
    else delete Object.prototype[key];
  };

  const eventManifest = manifestFixture();
  eventManifest.scenarios[0].inputTape.events = [
    { tick: 0, sequence: 0, code: 'KeyW', pressed: true },
  ];
  eventManifest.scenarios[0].inputTape.frames = [
    { tick: 0, sequence: 0, input: {}, commands: [] },
  ];
  const eventBaseline = compilePerformanceScenarioManifest(eventManifest);
  const deviceDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'device');
  let eventPolluted;
  let pollutedEventMoveZ;
  try {
    Object.defineProperty(Object.prototype, 'device', {
      configurable: true,
      enumerable: false,
      value: 'gamepad',
    });
    eventPolluted = compilePerformanceScenarioManifest(eventManifest);
    pollutedEventMoveZ = replayMoveZ(eventPolluted);
  } finally {
    restore('device', deviceDescriptor);
  }

  assert.equal(replayMoveZ(eventBaseline), 1);
  assert.equal(eventPolluted.scenarios[0].inputDigest, eventBaseline.scenarios[0].inputDigest);
  assert.equal(eventPolluted.scenarios[0].scenarioDigest, eventBaseline.scenarios[0].scenarioDigest);
  assert.equal(pollutedEventMoveZ, 1);

  const frameManifest = manifestFixture();
  frameManifest.scenarios[0].inputTape.events = [];
  frameManifest.scenarios[0].inputTape.frames = [
    { tick: 0, sequence: 0, input: {}, commands: [] },
  ];
  const frameBaseline = compilePerformanceScenarioManifest(frameManifest);
  const moveZDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'moveZ');
  let framePolluted;
  let pollutedFrameMoveZ;
  try {
    Object.defineProperty(Object.prototype, 'moveZ', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: 1,
    });
    framePolluted = compilePerformanceScenarioManifest(frameManifest);
    pollutedFrameMoveZ = replayMoveZ(framePolluted);
  } finally {
    restore('moveZ', moveZDescriptor);
  }

  assert.equal(replayMoveZ(frameBaseline), 0);
  assert.equal(framePolluted.scenarios[0].inputDigest, frameBaseline.scenarios[0].inputDigest);
  assert.equal(framePolluted.scenarios[0].scenarioDigest, frameBaseline.scenarios[0].scenarioDigest);
  assert.equal(pollutedFrameMoveZ, 0);
  assert.equal(Object.getPrototypeOf(framePolluted.scenarios[0].inputTape.frames[0].input), null);
});

test('inherited enumerable Object.prototype keys stay outside the JSON evidence projection', () => {
  const inheritedKeys = Array.from(
    { length: PERFORMANCE_SCENARIO_MANIFEST_LIMITS.maxObjectKeys + 1 },
    (_, index) => `__performanceInherited${index}`,
  );
  let validation;
  try {
    for (const key of inheritedKeys) {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: true,
      });
    }
    validation = validatePerformanceScenarioManifest(manifestFixture());
  } finally {
    for (const key of inheritedKeys) delete Object.prototype[key];
  }

  assert.equal(validation.ok, true, validation.issues.join(' | '));
});

test('manifest compilation never invokes inherited array-index accessors', () => {
  const manifest = manifestFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, '0');
  let setterCalls = 0;
  let compiled;
  let failure = null;
  try {
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      get() { return undefined; },
      set() { setterCalls += 1; },
    });
    try {
      compiled = compilePerformanceScenarioManifest(manifest);
    } catch (error) {
      failure = error;
    }
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, '0', descriptor);
    else delete Array.prototype[0];
  }

  assert.ifError(failure);
  assert.equal(setterCalls, 0);
  assert.equal(compiled.scenarios[0].seed, 47);
});

test('scenario identity changes for every bound route input and ignores non-semantic source ordering', () => {
  const baselineDocument = manifestFixture({
    scenarios: [scenarioFixture(PERFORMANCE_SCENARIO_IDS[1]), scenarioFixture(PERFORMANCE_SCENARIO_IDS[0])],
  });
  const baseline = compilePerformanceScenarioManifest(baselineDocument, { source: 'one/source.json' });

  const reorderedDocument = clone(baselineDocument);
  reorderedDocument.scenarios.reverse();
  for (const scenario of reorderedDocument.scenarios) {
    scenario.inputTape.events.reverse();
    scenario.inputTape.frames.reverse();
    scenario.cameraTape.reverse();
    scenario.inputTape.frames[0].input = { fire: false, moveZ: scenario.inputTape.frames[0].input.moveZ };
  }
  const reordered = compilePerformanceScenarioManifest(reorderedDocument, { source: 'other/source.json' });
  assert.equal(reordered.manifestDigest, baseline.manifestDigest);
  assert.deepEqual(reordered.scenarios.map((entry) => entry.id), baseline.scenarios.map((entry) => entry.id));

  const mutations = [
    (scenario) => { scenario.seed += 1; },
    (scenario) => { scenario.entityMultiplier = 2; },
    (scenario) => { scenario.save = { kind: 'new-game', slot: 'alternate' }; },
    (scenario) => { scenario.inputTape.events[0].pressed = !scenario.inputTape.events[0].pressed; },
    (scenario) => { scenario.cameraTape[0].fov += 1; },
    (scenario) => { scenario.requiredTelemetry.push('post-render-target-allocation'); },
    (scenario) => { scenario.expectedRouteCompletion.marker = 'route:alternate-complete'; },
  ];
  for (const mutate of mutations) {
    const changedDocument = clone(manifestFixture());
    mutate(changedDocument.scenarios[0]);
    const changed = compilePerformanceScenarioManifest(changedDocument);
    assert.notEqual(changed.scenarios[0].scenarioDigest, compilePerformanceScenarioManifest(manifestFixture()).scenarios[0].scenarioDigest);
  }
});

test('complete-matrix mode requires every current production scenario exactly once', () => {
  const complete = manifestFixture({
    scenarios: PERFORMANCE_SCENARIO_IDS.map((id) => scenarioFixture(id)),
  });
  assert.equal(validatePerformanceScenarioManifest(complete, { requireCompleteMatrix: true }).ok, true);

  const missing = clone(complete);
  missing.scenarios.pop();
  const missingResult = validatePerformanceScenarioManifest(missing, { requireCompleteMatrix: true });
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.issues.join(' | '), /complete matrix.*missing/i);

  const subset = validatePerformanceScenarioManifest(manifestFixture());
  assert.equal(subset.ok, true, subset.issues.join('\n'));
});

test('validation rejects unknown and duplicate scenario IDs, unknown keys, invalid seeds, and invalid multipliers', () => {
  const invalid = manifestFixture();
  invalid.extra = true;
  invalid.scenarios.push(clone(invalid.scenarios[0]));
  invalid.scenarios.push({ ...clone(invalid.scenarios[0]), id: 'invented_second_matrix_route' });
  invalid.scenarios[0].seed = 1.5;
  invalid.scenarios[0].entityMultiplier = 0;
  invalid.scenarios[0].mystery = true;

  const result = validatePerformanceScenarioManifest(invalid);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /\$\.extra.*not allowed/i);
  assert.match(result.issues.join(' | '), /unknown performance scenario/i);
  assert.match(result.issues.join(' | '), /duplicate scenario/i);
  assert.match(result.issues.join(' | '), /seed.*integer/i);
  assert.match(result.issues.join(' | '), /entityMultiplier.*positive finite/i);
  assert.match(result.issues.join(' | '), /mystery.*not allowed/i);
  assert.throws(() => compilePerformanceScenarioManifest(invalid), /invalid performance scenario manifest/i);
});

test('required telemetry and route completion are bounded identity-bearing contracts', () => {
  const invalid = manifestFixture();
  invalid.scenarios[0].requiredTelemetry = ['display-frame', 'display-frame'];
  invalid.scenarios[0].expectedRouteCompletion = { marker: '', value: { hidden: true } };

  const result = validatePerformanceScenarioManifest(invalid);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /duplicate telemetry/i);
  assert.match(result.issues.join(' | '), /must include simulation-tick/i);
  assert.match(result.issues.join(' | '), /completion.*marker.*non-empty/i);
  assert.match(result.issues.join(' | '), /completion.*value.*scalar/i);
});

test('identity-bearing integers and entity multipliers are bounded against precision aliases', () => {
  const unsafe = manifestFixture();
  unsafe.scenarios[0].seed = Number.MAX_SAFE_INTEGER + 1;
  unsafe.scenarios[0].entityMultiplier = Number.MAX_VALUE;
  unsafe.scenarios[0].inputTape.events[0].tick = Number.MAX_SAFE_INTEGER + 1;
  unsafe.scenarios[0].inputTape.events[0].sequence = Number.MAX_SAFE_INTEGER + 1;

  const result = validatePerformanceScenarioManifest(unsafe);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /seed.*bounded safe integer/i);
  assert.match(result.issues.join(' | '), /entityMultiplier.*at most/i);
  assert.match(result.issues.join(' | '), /tick.*bounded safe integer/i);
  assert.match(result.issues.join(' | '), /sequence.*bounded safe integer/i);
});

test('sparse, undefined, accessor, and otherwise non-JSON values fail before hashing', () => {
  const sparseScenario = manifestFixture({ scenarios: new Array(1) });
  assert.match(validatePerformanceScenarioManifest(sparseScenario).issues.join(' | '), /sparse array entry/i);

  const sparseVector = manifestFixture();
  sparseVector.scenarios[0].cameraTape[0].position = [0, , -30];
  assert.match(validatePerformanceScenarioManifest(sparseVector).issues.join(' | '), /sparse array entry/i);

  const undefinedValue = manifestFixture();
  undefinedValue.scenarios[0].inputTape.frames[0].input.fire = undefined;
  assert.match(validatePerformanceScenarioManifest(undefinedValue).issues.join(' | '), /finite JSON|undefined/i);

  const accessor = manifestFixture();
  Object.defineProperty(accessor.scenarios[0].save, 'slot', { enumerable: true, get: () => 'hidden' });
  assert.match(validatePerformanceScenarioManifest(accessor).issues.join(' | '), /data properties/i);
});

test('save references are repository-relative, path-safe, and content-bound', async (t) => {
  const unsafePaths = [
    '/tmp/save.json',
    '../save.json',
    'test/../save.json',
    'C:/tmp/save.json',
    'C:\\tmp\\save.json',
    '\\\\server\\share\\save.json',
    'https://example.test/save.json',
    'https:example.test/save.json',
    'test/fixtures/save.json:stream',
    'test\\fixtures\\save.json',
    'test/fixtures/\0save.json',
  ];

  for (const path of unsafePaths) {
    await t.test(JSON.stringify(path), () => {
      const manifest = manifestFixture();
      manifest.scenarios[0].save = { kind: 'fixture', path, sha256: SHA256 };
      const result = validatePerformanceScenarioManifest(manifest);
      assert.equal(result.ok, false);
      assert.match(result.issues.join(' | '), /save\.path.*repository-relative|save\.path.*unsafe/i);
    });
  }

  const valid = manifestFixture();
  valid.scenarios[0].save = {
    kind: 'fixture',
    path: 'test/fixtures/performance/save.json',
    sha256: SHA256,
  };
  assert.equal(validatePerformanceScenarioManifest(valid).ok, true);

  delete valid.scenarios[0].save.sha256;
  assert.match(validatePerformanceScenarioManifest(valid).issues.join(' | '), /sha256.*required/i);
  assert.throws(
    () => compilePerformanceScenarioManifest(manifestFixture(), { source: 'https:example.test/manifest.json' }),
    /source.*repository-relative/i,
  );
});

test('save path safety ignores mutable Array.prototype predicates', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].save = {
    kind: 'fixture',
    path: '../outside.json',
    sha256: SHA256,
  };
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
  let hookCalls = 0;
  let validation;
  let compileError;
  try {
    Object.defineProperty(Array.prototype, 'every', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return true;
      },
    });
    validation = validatePerformanceScenarioManifest(manifest);
    try {
      compilePerformanceScenarioManifest(manifest);
    } catch (error) {
      compileError = error;
    }
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'every', descriptor);
    else delete Array.prototype.every;
  }

  assert.equal(hookCalls, 0);
  assert.equal(validation.ok, false);
  assert.match(validation.issues.join(' | '), /save\.path.*repository-relative|save\.path.*unsafe/i);
  assert.match(compileError?.message || '', /invalid performance scenario manifest/i);
});

test('save content binding ignores mutable RegExp.prototype hooks', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].save = {
    kind: 'fixture',
    path: 'test/fixtures/performance/save.json',
    sha256: 'not-a-content-digest',
  };
  const descriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
  let hookCalls = 0;
  let validation;
  let compileError;
  try {
    Object.defineProperty(RegExp.prototype, 'test', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return true;
      },
    });
    validation = validatePerformanceScenarioManifest(manifest);
    try {
      compilePerformanceScenarioManifest(manifest);
    } catch (error) {
      compileError = error;
    }
  } finally {
    if (descriptor) Object.defineProperty(RegExp.prototype, 'test', descriptor);
    else delete RegExp.prototype.test;
  }

  assert.equal(hookCalls, 0);
  assert.equal(validation.ok, false);
  assert.match(validation.issues.join(' | '), /sha256.*full|sha256.*required/i);
  assert.match(compileError?.message || '', /invalid performance scenario manifest/i);
});

test('save path safety ignores mutable String.prototype parsing hooks', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].save = {
    kind: 'fixture',
    path: '../outside.json',
    sha256: SHA256,
  };
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'split');
  let hookCalls = 0;
  let validation;
  let compileError;
  try {
    Object.defineProperty(String.prototype, 'split', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return ['safe.json'];
      },
    });
    validation = validatePerformanceScenarioManifest(manifest);
    try {
      compilePerformanceScenarioManifest(manifest);
    } catch (error) {
      compileError = error;
    }
  } finally {
    if (descriptor) Object.defineProperty(String.prototype, 'split', descriptor);
    else delete String.prototype.split;
  }

  assert.equal(hookCalls, 0);
  assert.equal(validation.ok, false);
  assert.match(validation.issues.join(' | '), /save\.path.*repository-relative|save\.path.*unsafe/i);
  assert.match(compileError?.message || '', /invalid performance scenario manifest/i);
});

test('save digest normalization ignores mutable String.prototype hooks', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].save = {
    kind: 'fixture',
    path: 'test/fixtures/performance/save.json',
    sha256: 'A'.repeat(64),
  };
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'toLowerCase');
  let hookCalls = 0;
  let compiled;
  try {
    Object.defineProperty(String.prototype, 'toLowerCase', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return 'b'.repeat(64);
      },
    });
    compiled = compilePerformanceScenarioManifest(manifest);
  } finally {
    if (descriptor) Object.defineProperty(String.prototype, 'toLowerCase', descriptor);
    else delete String.prototype.toLowerCase;
  }

  assert.equal(hookCalls, 0);
  assert.equal(compiled.scenarios[0].save.sha256, 'a'.repeat(64));
});

test('input and camera records require explicit order, consumed payloads, and finite nested JSON', () => {
  const invalid = manifestFixture();
  delete invalid.scenarios[0].inputTape.events[0].sequence;
  invalid.scenarios[0].inputTape.events[1].pointer = { x: 'right', mystery: true };
  invalid.scenarios[0].inputTape.events[2].gamepad = { index: 0, connected: 1, axes: 'none', buttons: [] };
  invalid.scenarios[0].inputTape.events[2].touch = { points: [{ id: 1, x: 2, y: 3, pressed: 1 }] };
  invalid.scenarios[0].inputTape.frames[0].input.moveZ = Number.POSITIVE_INFINITY;
  invalid.scenarios[0].inputTape.frames[0].commands.push({
    kind: 'combatAction',
    actor: 'player',
    actionId: 'fire-primary',
  });
  invalid.scenarios[0].cameraTape.push(clone(invalid.scenarios[0].cameraTape[0]));

  const result = validatePerformanceScenarioManifest(invalid);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /sequence.*non-negative integer/i);
  assert.match(result.issues.join(' | '), /pointer.*unsupported/i);
  assert.match(result.issues.join(' | '), /gamepad.*unsupported/i);
  assert.match(result.issues.join(' | '), /touch.*unsupported/i);
  assert.match(result.issues.join(' | '), /finite JSON/i);
  assert.match(result.issues.join(' | '), /commands.*empty|commands.*unsupported/i);
  assert.match(result.issues.join(' | '), /duplicate tick\/sequence/i);
});

test('validation bounds issue output and rejects oversized record collections', () => {
  const invalid = manifestFixture();
  invalid.scenarios[0].inputTape.events.push(
    { tick: 5, sequence: 0, code: 'KeyA', pressed: true },
    { tick: 6, sequence: 0, code: 'KeyD', pressed: true },
  );
  invalid.one = true;
  invalid.two = true;
  invalid.three = true;

  const result = validatePerformanceScenarioManifest(invalid, {
    limits: { maxInputEvents: 2, maxIssues: 2 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issueCount > result.issues.length);
  assert.equal(result.omittedIssueCount, result.issueCount - result.issues.length);
  assert.match([...result.issues, result.summary].join(' | '), /limit|omitted/i);

  const raised = validatePerformanceScenarioManifest(manifestFixture(), {
    limits: { maxInputEvents: PERFORMANCE_SCENARIO_MANIFEST_LIMITS.maxInputEvents + 1 },
  });
  assert.equal(raised.limits.maxInputEvents, PERFORMANCE_SCENARIO_MANIFEST_LIMITS.maxInputEvents);
});

test('records beyond a declared cap are rejected without being read', () => {
  const manifest = manifestFixture();
  const events = manifest.scenarios[0].inputTape.events.slice(0, 2);
  Object.defineProperty(events, 2, {
    enumerable: true,
    get() { throw new Error('validation read beyond maxInputEvents'); },
  });
  manifest.scenarios[0].inputTape.events = events;

  assert.doesNotThrow(() => validatePerformanceScenarioManifest(manifest, {
    limits: { maxInputEvents: 2 },
  }));
  const result = validatePerformanceScenarioManifest(manifest, { limits: { maxInputEvents: 2 } });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /events exceeds limit 2/i);
});

test('validation snapshots only ordinary own enumerable data before semantic inspection', () => {
  const baseline = compilePerformanceScenarioManifest(manifestFixture());

  const customMethod = manifestFixture();
  let methodCalls = 0;
  Object.defineProperty(customMethod.scenarios, 'map', {
    configurable: true,
    value: () => {
      methodCalls += 1;
      throw new Error('custom array method executed');
    },
  });
  assert.equal(validatePerformanceScenarioManifest(customMethod).ok, true);
  assert.equal(compilePerformanceScenarioManifest(customMethod).manifestDigest, baseline.manifestDigest);
  assert.equal(methodCalls, 0);

  const symbolProperty = manifestFixture();
  symbolProperty.scenarios[0].cameraTape[Symbol('hidden')] = true;
  assert.equal(validatePerformanceScenarioManifest(symbolProperty).ok, true);
  assert.equal(compilePerformanceScenarioManifest(symbolProperty).manifestDigest, baseline.manifestDigest);

  const frozen = manifestFixture();
  Object.freeze(frozen.scenarios[0].inputTape.events[0]);
  Object.freeze(frozen.scenarios[0].inputTape.events);
  Object.seal(frozen.scenarios[0].save);
  Object.freeze(frozen.scenarios[0]);
  Object.freeze(frozen.scenarios);
  Object.freeze(frozen);
  assert.equal(validatePerformanceScenarioManifest(frozen).ok, true);
  assert.equal(compilePerformanceScenarioManifest(frozen).manifestDigest, baseline.manifestDigest);

  const nullPrototype = manifestFixture();
  nullPrototype.scenarios[0].save = Object.assign(Object.create(null), nullPrototype.scenarios[0].save);
  assert.equal(validatePerformanceScenarioManifest(nullPrototype).ok, true);
  assert.equal(compilePerformanceScenarioManifest(nullPrototype).manifestDigest, baseline.manifestDigest);

  const accessor = manifestFixture();
  let getterCalls = 0;
  const inputTape = accessor.scenarios[0].inputTape;
  delete accessor.scenarios[0].inputTape;
  Object.defineProperty(accessor.scenarios[0], 'inputTape', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return inputTape;
    },
  });
  assert.match(validatePerformanceScenarioManifest(accessor).issues.join(' | '), /data properties/i);
  assert.equal(getterCalls, 0, 'validation must inspect descriptors without invoking accessors');

  const hiddenRequired = manifestFixture();
  let hiddenGetterCalls = 0;
  delete hiddenRequired.scenarios[0].inputTape;
  Object.defineProperty(hiddenRequired.scenarios[0], 'inputTape', {
    get() {
      hiddenGetterCalls += 1;
      return inputTape;
    },
  });
  assert.match(validatePerformanceScenarioManifest(hiddenRequired).issues.join(' | '), /inputTape.*plain object/i);
  assert.equal(hiddenGetterCalls, 0, 'non-enumerable metadata must not enter the JSON projection');

  class ScenarioList extends Array {}
  const subclass = manifestFixture({ scenarios: ScenarioList.from([scenarioFixture()]) });
  assert.match(validatePerformanceScenarioManifest(subclass).issues.join(' | '), /ordinary array|prototype/i);

  const inherited = manifestFixture();
  inherited.scenarios[0] = Object.create(inherited.scenarios[0]);
  assert.match(validatePerformanceScenarioManifest(inherited).issues.join(' | '), /plain object|prototype/i);

  let trapCalls = 0;
  const proxied = manifestFixture();
  proxied.scenarios[0] = new Proxy(proxied.scenarios[0], {
    get() { trapCalls += 1; throw new Error('get trap executed'); },
    getPrototypeOf() { trapCalls += 1; throw new Error('prototype trap executed'); },
    ownKeys() { trapCalls += 1; throw new Error('ownKeys trap executed'); },
    getOwnPropertyDescriptor() { trapCalls += 1; throw new Error('descriptor trap executed'); },
  });
  assert.doesNotThrow(() => validatePerformanceScenarioManifest(proxied));
  assert.match(validatePerformanceScenarioManifest(proxied).issues.join(' | '), /proxy/i);
  assert.equal(trapCalls, 0);

  const revoked = manifestFixture();
  const revocable = Proxy.revocable(revoked.scenarios[0], {});
  revoked.scenarios[0] = revocable.proxy;
  revocable.revoke();
  assert.doesNotThrow(() => validatePerformanceScenarioManifest(revoked));
  assert.match(validatePerformanceScenarioManifest(revoked).issues.join(' | '), /proxy/i);
});

test('canonical numeric policy rejects signed zero and unsafe nested integers before identity', () => {
  const signedZeroMutations = [
    (scenario) => { scenario.seed = -0; },
    (scenario) => { scenario.cameraTape[0].position[0] = -0; },
    (scenario) => { scenario.inputTape.frames[0].input.moveZ = -0; },
    (scenario) => { scenario.expectedRouteCompletion.value = -0; },
  ];
  for (const mutate of signedZeroMutations) {
    const manifest = manifestFixture();
    mutate(manifest.scenarios[0]);
    const result = validatePerformanceScenarioManifest(manifest);
    assert.equal(result.ok, false);
    assert.match(result.issues.join(' | '), /signed zero/i);
    assert.throws(() => compilePerformanceScenarioManifest(manifest), /invalid performance scenario manifest/i);
  }

  const unsafeNested = manifestFixture();
  unsafeNested.scenarios[0].inputTape.frames[0].input.metadata = {
    high: Number.MAX_SAFE_INTEGER + 1,
    low: Number.MIN_SAFE_INTEGER - 1,
  };
  assert.match(validatePerformanceScenarioManifest(unsafeNested).issues.join(' | '), /safe integer/i);
});

test('canonical byte and alias budgets stop structural work before semantic traversal', () => {
  const first = scenarioFixture();
  first.inputTape.frames[0].input.padding = 'x'.repeat(512);
  const overBudget = manifestFixture({ scenarios: [first, scenarioFixture(PERFORMANCE_SCENARIO_IDS[1])] });
  Object.defineProperty(overBudget.scenarios, 1, {
    enumerable: true,
    get() { throw new Error('canonical budget inspected a later scenario'); },
  });
  const result = validatePerformanceScenarioManifest(overBudget, {
    limits: { maxCanonicalBytes: 256 },
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /canonical bytes.*limit/i);
  assert.doesNotMatch(result.issues.join(' | '), /scenarios\[1\].*data properties/i);

  const aliased = manifestFixture();
  aliased.scenarios[0].inputTape.frames[1].commands = aliased.scenarios[0].inputTape.frames[0].commands;
  assert.match(validatePerformanceScenarioManifest(aliased).issues.join(' | '), /repeated reference|alias/i);
});

test('object-member limits are exact and halt before overflow values or later siblings', () => {
  const exact = manifestFixture();
  exact.scenarios[0].inputTape.frames[0].input = {
    moveX: 0,
    moveZ: 0,
    turnIntent: 0,
    boost: false,
    fire: false,
    aimAngle: 0,
    reelDelta: 0,
    masslineHeld: false,
  };
  assert.equal(validatePerformanceScenarioManifest(exact, {
    limits: { maxObjectKeys: 8 },
  }).ok, true);

  const overflow = clone(exact);
  let overflowGetterCalls = 0;
  Object.defineProperty(overflow.scenarios[0].inputTape.frames[0].input, 'lineLength', {
    enumerable: true,
    get() {
      overflowGetterCalls += 1;
      throw new Error('overflow value was inspected');
    },
  });
  overflow.scenarios[0].cameraTape[0] = new Proxy(
    overflow.scenarios[0].cameraTape[0],
    {
      get() { throw new Error('later sibling was inspected'); },
      ownKeys() { throw new Error('later sibling keys were inspected'); },
    },
  );

  const result = validatePerformanceScenarioManifest(overflow, {
    limits: { maxObjectKeys: 8 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.issueCount, 1);
  assert.match(result.issues[0], /input.*own enumerable-key limit 8/i);
  assert.equal(overflowGetterCalls, 0);
});

test('generic arrays cannot borrow authoritative collection limits through schema-looking keys', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].inputTape.frames[0].input = {
    inputTape: { events: [0, 1, 2, 3, 4, 5] },
    cameraTape: [0, 1, 2, 3, 4, 5],
    requiredTelemetry: [0, 1, 2, 3, 4, 5],
  };
  const result = validatePerformanceScenarioManifest(manifest, {
    limits: { maxArrayItems: 5 },
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /events.*exceeds limit 5|cameraTape.*exceeds limit 5|requiredTelemetry.*exceeds limit 5/i);
});

test('explicit and implicit keyboard devices compile to one replay identity', () => {
  const explicit = manifestFixture();
  const implicit = clone(explicit);
  delete implicit.scenarios[0].inputTape.events[0].device;
  delete implicit.scenarios[0].inputTape.events[1].device;

  const explicitCompiled = compilePerformanceScenarioManifest(explicit);
  const implicitCompiled = compilePerformanceScenarioManifest(implicit);
  assert.equal(
    explicitCompiled.scenarios[0].inputDigest,
    implicitCompiled.scenarios[0].inputDigest,
  );
  assert.equal(
    explicitCompiled.scenarios[0].scenarioDigest,
    implicitCompiled.scenarios[0].scenarioDigest,
  );
  assert.ok(explicitCompiled.scenarios[0].inputTape.events.every(
    (event) => event.device === 'keyboard',
  ));
  assert.ok(implicitCompiled.scenarios[0].inputTape.events.every(
    (event) => event.device === 'keyboard',
  ));
});

test('input events admit only payloads consumed by the current keyboard replay owner', () => {
  const arbitraryDevice = manifestFixture();
  arbitraryDevice.scenarios[0].inputTape.events[0].device = 'telepathy';
  assert.match(validatePerformanceScenarioManifest(arbitraryDevice).issues.join(' | '), /device.*omitted or keyboard/i);

  const incompleteKey = manifestFixture();
  delete incompleteKey.scenarios[0].inputTape.events[0].pressed;
  assert.match(validatePerformanceScenarioManifest(incompleteKey).issues.join(' | '), /code.*pressed.*together/i);

  const emptyKeys = manifestFixture();
  emptyKeys.scenarios[0].inputTape.events[0] = { tick: 0, sequence: 0, keys: {} };
  assert.match(validatePerformanceScenarioManifest(emptyKeys).issues.join(' | '), /keys.*non-empty/i);

  const ambiguousKeyOrder = manifestFixture();
  ambiguousKeyOrder.scenarios[0].inputTape.events[0] = {
    tick: 0,
    sequence: 0,
    keys: { KeyD: true, KeyA: true },
  };
  assert.match(
    validatePerformanceScenarioManifest(ambiguousKeyOrder).issues.join(' | '),
    /keys.*exactly one|one key-state transition/i,
  );

  for (const unsupported of ['pointer', 'gamepad', 'touch']) {
    const manifest = manifestFixture();
    manifest.scenarios[0].inputTape.events[0] = {
      tick: 0,
      sequence: 0,
      device: unsupported,
      [unsupported]: {},
    };
    const result = validatePerformanceScenarioManifest(manifest);
    assert.equal(result.ok, false);
    assert.match(result.issues.join(' | '), new RegExp(`${unsupported}.*unsupported`, 'i'));
  }

  const valid = manifestFixture();
  valid.scenarios[0].inputTape.events = [
    { tick: 0, sequence: 0, code: 'KeyW', pressed: true },
    { tick: 1, sequence: 0, device: 'keyboard', code: 'KeyW', pressed: false },
    { tick: 2, sequence: 0, keys: { ShiftLeft: true } },
    { tick: 3, sequence: 0, device: 'keyboard', code: 'KeyF', pressed: true, keys: { ShiftLeft: false } },
  ];
  assert.equal(validatePerformanceScenarioManifest(valid).ok, true);
});

test('input frames admit only exact values consumed by the shared cross-runtime replay owner', () => {
  const unknown = manifestFixture();
  unknown.scenarios[0].inputTape.frames[0].input.unconsumed = 1;
  assert.match(
    validatePerformanceScenarioManifest(unknown).issues.join(' | '),
    /input\.unconsumed.*not allowed/i,
  );

  for (const rejected of ['fireGroup', 'brake', 'massline']) {
    const manifest = manifestFixture();
    manifest.scenarios[0].inputTape.frames[0].input[rejected] = true;
    assert.match(
      validatePerformanceScenarioManifest(manifest).issues.join(' | '),
      new RegExp(`${rejected}.*not applied|${rejected}.*not allowed`, 'i'),
    );
  }

  const coercedNumber = manifestFixture();
  coercedNumber.scenarios[0].inputTape.frames[0].input.moveZ = '1';
  assert.match(
    validatePerformanceScenarioManifest(coercedNumber).issues.join(' | '),
    /moveZ.*finite number/i,
  );

  const coercedBoolean = manifestFixture();
  coercedBoolean.scenarios[0].inputTape.frames[0].input.fire = 1;
  assert.match(
    validatePerformanceScenarioManifest(coercedBoolean).issues.join(' | '),
    /fire.*boolean/i,
  );

  const command = manifestFixture();
  command.scenarios[0].inputTape.frames[0].commands = [{
    kind: 'combatAction',
    actor: 'player',
    actionId: 'fire-primary',
  }];
  assert.match(
    validatePerformanceScenarioManifest(command).issues.join(' | '),
    /commands.*empty|commands.*unsupported/i,
  );

  const valid = manifestFixture();
  valid.scenarios[0].inputTape.frames[0].input = {
    moveX: 0,
    moveZ: 1,
    turnIntent: 0,
    boost: true,
    fire: false,
    aimAngle: 0.5,
    reelDelta: 0,
    masslineHeld: true,
    lineLength: 1,
    orbitDirection: -1,
  };
  assert.equal(validatePerformanceScenarioManifest(valid).ok, true);
});

test('repository-relative paths reject cross-platform control, normalization, and component hazards', () => {
  const unsafePaths = [
    'test/fixtures/line\nbreak.json',
    'test/fixtures/nextline.json',
    `test/fixtures/${'a'.repeat(256)}`,
    'test/fixtures/é.json',
    'test/fixtures/\ud800.json',
    'test/fixtures/COM1.txt',
    'test/fixtures/COM¹.txt',
  ];
  for (const path of unsafePaths) {
    const manifest = manifestFixture();
    manifest.scenarios[0].save = { kind: 'fixture', path, sha256: SHA256 };
    const result = validatePerformanceScenarioManifest(manifest);
    assert.equal(result.ok, false, JSON.stringify(path));
    assert.match(result.issues.join(' | '), /repository-relative POSIX path/i);
  }
  assert.throws(
    () => compilePerformanceScenarioManifest(manifestFixture(), { source: 123 }),
    /source.*string|source.*repository-relative/i,
  );

  let coercionCalls = 0;
  const coercibleSource = {
    toString() { coercionCalls += 1; return 'test/fixtures/manifest.json'; },
    [Symbol.toPrimitive]() { coercionCalls += 1; return 'test/fixtures/manifest.json'; },
  };
  assert.throws(
    () => compilePerformanceScenarioManifest(manifestFixture(), { source: coercibleSource }),
    /source.*string|source.*repository-relative/i,
  );
  assert.equal(coercionCalls, 0);
  assert.equal(compilePerformanceScenarioManifest(manifestFixture(), { source: null }).source, null);
});

test('manifest options and limits never invoke accessors or Proxy traps', () => {
  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, 'source', {
    get() { getterCalls += 1; return 'test/fixtures/manifest.json'; },
  });
  assert.throws(
    () => compilePerformanceScenarioManifest(manifestFixture(), accessorOptions),
    /option source.*data property/i,
  );
  assert.equal(getterCalls, 0);

  let trapCalls = 0;
  const proxyOptions = new Proxy({}, {
    getPrototypeOf() { trapCalls += 1; throw new Error('options prototype trap executed'); },
    getOwnPropertyDescriptor() { trapCalls += 1; throw new Error('options descriptor trap executed'); },
  });
  assert.throws(
    () => validatePerformanceScenarioManifest(manifestFixture(), proxyOptions),
    /non-Proxy object/i,
  );
  assert.equal(trapCalls, 0);

  const limitAccessor = {};
  Object.defineProperty(limitAccessor, 'maxIssues', {
    get() { getterCalls += 1; return 1; },
  });
  assert.throws(
    () => validatePerformanceScenarioManifest(manifestFixture(), { limits: limitAccessor }),
    /limit maxIssues.*data property/i,
  );
  assert.equal(getterCalls, 0);
});

test('snapshotting rejects dangerous unconsumed input keys without prototype mutation', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].inputTape.frames[0].input = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":"data","moveZ":0}',
  );
  const result = validatePerformanceScenarioManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' | '), /__proto__.*not allowed|constructor.*not allowed/i);
  assert.equal({}.polluted, undefined);
});

test('diagnostics cap both issue count and bytes without echoing unbounded identifiers', () => {
  const manifest = manifestFixture();
  manifest.scenarios[0].id = 'x'.repeat(PERFORMANCE_SCENARIO_MANIFEST_LIMITS.maxStringLength + 1024);
  manifest.scenarios[0]['y'.repeat(PERFORMANCE_SCENARIO_MANIFEST_LIMITS.maxKeyLength + 1024)] = true;
  const result = validatePerformanceScenarioManifest(manifest, {
    limits: { maxIssueBytes: 256 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.emittedIssueCount, result.issues.length);
  assert.equal(result.diagnosticUtf8Bytes, Buffer.byteLength(result.issues.join('\n'), 'utf8'));
  assert.equal(result.diagnosticsTruncated, result.omittedIssueCount > 0);
  assert.ok(result.diagnosticUtf8Bytes <= 256);
  assert.ok(result.omittedIssueCount > 0 || result.issues.some((issue) => /truncated|exceeds/i.test(issue)));
  assert.ok(result.issues.every((issue) => issue.length < 512));
  assert.throws(
    () => compilePerformanceScenarioManifest(manifest, { limits: { maxIssueBytes: 64 } }),
    (error) => {
      assert.equal(error.code, 'ERR_PERFORMANCE_SCENARIO_MANIFEST');
      assert.ok(error.message.length < 128);
      assert.doesNotMatch(error.message, /xxxxxxxxxxxxxxxx/);
      assert.equal(error.validation.issueCount, error.issueCount);
      return true;
    },
  );

  const zeroOutput = validatePerformanceScenarioManifest(manifest, {
    limits: { maxIssues: 0, maxIssueBytes: 0 },
  });
  assert.equal(zeroOutput.ok, false);
  assert.ok(zeroOutput.issueCount > 0);
  assert.equal(zeroOutput.emittedIssueCount, 0);
  assert.equal(zeroOutput.issues.length, 0);
  assert.equal(zeroOutput.diagnosticsTruncated, true);

  const truncatedMessage = validatePerformanceScenarioManifest({
    ...manifestFixture(),
    extraFieldWithALongName: true,
  }, {
    limits: { maxIssues: 1, maxIssueBytes: 8, maxIssueMessageBytes: 8 },
  });
  assert.equal(truncatedMessage.issueCount, 1);
  assert.equal(truncatedMessage.emittedIssueCount, 1);
  assert.equal(truncatedMessage.omittedIssueCount, 0);
  assert.equal(truncatedMessage.diagnosticsTruncated, true);
  assert.match(truncatedMessage.summary, /message.*truncated/i);

  const baselineDigest = compilePerformanceScenarioManifest(manifestFixture()).manifestDigest;
  const diagnosticLimitsDigest = compilePerformanceScenarioManifest(manifestFixture(), {
    limits: { maxIssues: 1, maxIssueBytes: 32 },
  }).manifestDigest;
  assert.equal(diagnosticLimitsDigest, baselineDigest);
});
