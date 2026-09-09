import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildHandoffPrompt,
  buildIsolatedExecutionPlan,
  prepareComponentReferenceHandoff,
  publishValidatedOutputs,
  readProtectedGeneratedImage,
  runComponentReferenceHandoff,
  validateCodexExecutionStream,
  validateGeneratedCandidate,
} from '../.grok/skills/spaceface-blender-material-truth/scripts/request_imagegen_reference.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const BUNDLE_FILES = [
  'reference.png',
  'REFERENCE_PROVENANCE.md',
  'HANDOFF_REPORT.json',
  'CODEX_EXECUTION.jsonl',
  'REQUEST.md',
  'SOURCE_CROP.png',
  'OUTPUT_SCHEMA.json',
].sort();
const SOURCE_CROP = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/reference/material_truth_v2/rig_paired_reaction_drive_reference.png',
);
const GENERATED_REFERENCE = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/reference/material_truth_v2/rig_tether_winch_reference.png',
);

function text(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('official graphics entry points route authored 3D work through one canonical quality bar', () => {
  const standard = 'docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md';
  const skill = '.grok/skills/spaceface-blender-material-truth/SKILL.md';
  const routes = [
    'AGENTS.md',
    'CANONICAL_BUILD_MAP.md',
    'assets/AGENTS.md',
    'assets/ships/AGENTS.md',
    'assets/ships/kestrel/README.md',
    'assets/ships/wasp_production_v1/DESIGN.md',
    'assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md',
    '.grok/skills/spaceface-blender-pipeline/SKILL.md',
    '.grok/skills/spaceface-blender-blockout/SKILL.md',
    '.grok/skills/spaceface-blender-hardsurface/SKILL.md',
    '.grok/skills/spaceface-blender-surface-pass/SKILL.md',
    'design/graphics-sprints/README.md',
    'design/graphics-sprints/00_ORCHESTRATION.md',
    'design/graphics-sprints/FULL_GRAPHICS_REVAMP_GOAL.md',
    'design/graphics-sprints/CLI_ASSET_FOUNDRY_EXECUTION_PLAN.md',
    'design/graphics-sprints/GOAL_PROMPTS.md',
    'design/graphics-sprints/THREAD_A_KIT_QUALITY.md',
    'design/graphics-sprints/THREAD_B_WORLD_IDENTITY.md',
    'design/graphics-sprints/THREAD_E_WHOLESHIP_REPAIR.md',
    'design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md',
    'design/revamp/BP-08_VISUAL_ASSET_SPEC.md',
    'design/spec2/AGENT_PROMPTS.md',
    'design/world-identity/PIPELINE.md',
  ];

  for (const route of routes) {
    const value = text(route);
    assert.match(value, new RegExp(standard.replaceAll('/', '\\/')), `${route} omits visual standard`);
    assert.match(value, new RegExp(skill.replaceAll('/', '\\/')), `${route} omits material-truth skill`);
    assert.match(value, /preflight/i, `${route} omits mandatory material-truth preflight`);
  }
});

test('graphics guidance fails closed between component evidence and whole-asset art acceptance', () => {
  const root = text('AGENTS.md');
  const ships = text('assets/ships/AGENTS.md');
  const standard = text('docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md');
  const skill = text('.grok/skills/spaceface-blender-material-truth/SKILL.md');
  const templates = text('docs/visual-assets/TEMPLATES.md');

  for (const [path, value] of [
    ['AGENTS.md', root],
    ['assets/AGENTS.md', text('assets/AGENTS.md')],
    ['assets/ships/AGENTS.md', ships],
  ]) {
    assert.match(value, /component-scoped/i, `${path} omits scoped visual acceptance`);
    assert.match(value, /whole-asset/i, `${path} omits whole-asset visual acceptance`);
  }

  for (const [path, value] of [
    ['VISUAL_ASSET_PRODUCTION_STANDARD.md', standard],
    ['spaceface-blender-material-truth/SKILL.md', skill],
  ]) {
    assert.match(value, /evidence_ready/, `${path} must separate technical evidence from art verdict`);
    assert.match(
      value,
      /cannot close G1, G2, or G4/,
      `${path} lets technical evidence close an artistic gate`,
    );
    assert.match(value, /component-scoped\s+pass\s+never\s+implies\s+a\s+whole-asset\s+pass/i);
    assert.match(value, /dominant inherited/i, `${path} lets inherited surfaces evade whole-asset review`);
    assert.match(value, /hash-bound\s+(?:visual\s+review|review\s+record)/i);
  }

  for (const [path, value] of [
    ['VISUAL_ASSET_PRODUCTION_STANDARD.md', standard],
    ['spaceface-blender-material-truth/SKILL.md', skill],
    ['docs/visual-assets/TEMPLATES.md', templates],
  ]) {
    assert.match(
      value,
      /reference-quality parity|referenceQualityParity/i,
      `${path} omits quality-only reference comparison`,
    );
    assert.match(value, /frozen identity|frozenIdentity/i, `${path} omits remaster identity protection`);
    assert.match(value, /keep\|revise\|revert\|blocked/);
  }

  assert.match(standard, /mismatch\s+never\s+authorizes\s+deleting\s+sound\s+authored\s+work/i);
  assert.match(skill, /never\s+authorizes\s+deleting\s+sound\s+work/i);
  assert.match(standard, /exact deficient-component crop is required by default/i);
  assert.match(skill, /Crop or isolate that exact component from the authoritative asset/i);
  assert.match(templates, /sourceCapture/);
  assert.match(templates, /dominantInheritedOrRetainedZones/);
  assert.match(templates, /originalResolutionInspected/);
  assert.match(templates, /visibleZoneRegister/);
  assert.match(templates, /allSupportedViewZonesClassified/);
  for (const gate of ['G1', 'G2', 'G4']) {
    assert.match(
      templates,
      new RegExp(`"${gate}"[\\s\\S]{0,180}"scope": "pending"[\\s\\S]{0,120}"reviewedSubjects"`),
      `${gate} template omits scope or reviewed subjects`,
    );
  }
  assert.doesNotMatch(templates, /"scope": "whole_asset"/);
  for (const value of [standard, skill, templates]) {
    assert.match(value, /retained_reviewed/);
    assert.match(value, /outside_supported_view/);
    assert.match(value, /blocked/);
  }
  assert.match(
    standard,
    /outside_supported_view[\s\S]{0,80}valid only when[\s\S]{0,80}absent from every supported review camera/i,
  );
  assert.match(
    skill,
    /use `outside_supported_view` only when[\s\S]{0,80}absent from every supported review camera/i,
  );
  for (const value of [standard, skill]) {
    assert.match(value, /supportedViews: \[\]/);
    assert.match(value, /never for a visible or[\s\S]{0,40}dominant region|cannot classify a visible or[\s\S]{0,40}dominant region/i);
  }
  assert.match(templates, /outside_supported_view is legal only with supportedViews: \[\]/);
});

test('portrait and render routes name their visual quality authorities', () => {
  const portraits = text('assets/portraits/AGENTS.md');
  assert.match(portraits, /CANONICAL_PORTRAIT_DIRECTION\.md/);
  assert.match(portraits, /DEPTH_CONTACT_PORTRAIT_DIRECTION\.md/);
  assert.match(portraits, /AGENT_PROMPTS\.md` § F/);

  const render = text('src/render/AGENTS.md');
  assert.match(render, /VISUAL_ITERATION_PROTOCOL\.md/);
  assert.match(render, /docs\/visual-assets\/README\.md/);
});

test('imagegen handoff uses one fixed output bundle and the bounded live Codex profile', () => {
  const fixture = makeFixture();
  const prepared = prepareComponentReferenceHandoff(fixture.values);
  const plan = buildIsolatedExecutionPlan(prepared, join(fixture.root, '..', 'isolated-plan'));
  const prompt = buildHandoffPrompt({
    promptText: prepared.promptBytes.toString('utf8'),
    promptSha256: prepared.promptSha256,
    cropSha256: prepared.cropSha256,
    kind: 'component',
  });

  assert.match(prompt, /Invoke the built-in image-generation tool exactly once/);
  assert.match(prompt, /Use image generation, not text-only ideation/);
  assert.doesNotMatch(prompt, /Save only|first action is a capability check/i);
  assert.deepEqual(plan.codexArgs.slice(0, 3), ['-a', 'never', 'exec']);
  assert.equal(plan.codexArgs[plan.codexArgs.indexOf('--enable') + 1], 'image_generation');
  assert.equal(plan.codexArgs[plan.codexArgs.indexOf('-m') + 1], 'gpt-5.5');
  assert.equal(
    plan.codexArgs[plan.codexArgs.indexOf('-c') + 1],
    'model_reasoning_effort="medium"',
  );
  assert.equal(plan.codexArgs[plan.codexArgs.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(plan.codexArgs.includes('--ephemeral'));
  assert.ok(plan.codexArgs.includes('--ignore-user-config'));
  assert.ok(plan.codexArgs.includes('--ignore-rules'));
  assert.equal(plan.codexArgs.at(-1), '-');
  assert.deepEqual(plan.schema.required.slice().sort(), Object.keys(plan.schema.properties).sort());
  assert.equal(plan.schema.additionalProperties, false);
  assert.deepEqual(plan.bundleFiles.map(([name]) => name).sort(), BUNDLE_FILES);
  assert.equal(plan.codexArgs.includes(prepared.crop), false, 'Codex must receive the scratch crop');
  assert.throws(
    () => buildIsolatedExecutionPlan(prepared, join(fixture.repo, '.unsafe')),
    /scratch must be outside the repository/,
  );
  fixture.cleanup();
});

test('imagegen candidate validation uses buffers and rejects copied or malformed PNGs', () => {
  const crop = readFileSync(SOURCE_CROP);
  const generated = readFileSync(GENERATED_REFERENCE);
  assert.throws(() => validateGeneratedCandidate(crop, crop), /byte-identical to the input crop/);
  const result = validateGeneratedCandidate(generated, crop);
  assert.ok(result.width >= 64);
  assert.ok(result.height >= 64);
  assert.equal(result.sha256, sha256(generated));

  const malformed = Buffer.alloc(1024);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(malformed);
  assert.throws(() => validateGeneratedCandidate(malformed, crop), /does not fully decode/);
});

test('Codex JSONL requires exact event order and cardinality', () => {
  const threadId = '019fb054-2bb2-73f1-af3c-fc841d381b50';
  const report = JSON.stringify({ ok: true });
  const completed = executionJsonl(threadId, report);
  const receipt = validateCodexExecutionStream(completed);
  assert.equal(receipt.threadId, threadId);
  assert.equal(receipt.agentMessage, report);

  const withReasoning = [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'bounded reasoning' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: report } }),
    JSON.stringify({ type: 'turn.completed' }),
  ].join('\n');
  assert.equal(validateCodexExecutionStream(withReasoning).agentMessage, report);

  const reordered = [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: report } }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'turn.completed' }),
  ].join('\n');
  assert.throws(() => validateCodexExecutionStream(reordered), /second event must be turn.started/);

  const extraTurn = `${completed}\n${JSON.stringify({ type: 'turn.started' })}`;
  assert.throws(() => validateCodexExecutionStream(extraTurn), /last event must be turn.completed/);

  const errored = [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'error', message: 'generation failed' }),
    JSON.stringify({ type: 'turn.completed' }),
  ].join('\n');
  assert.throws(() => validateCodexExecutionStream(errored), /contains an error/);

  const toolItem = [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'echo no' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ].join('\n');
  assert.throws(() => validateCodexExecutionStream(toolItem), /forbidden completed item command_execution/);
});

test('imagegen bridge completes end to end with injected Codex and immutable snapshots', () => {
  const fixture = makeFixture();
  const originalPrompt = readFileSync(fixture.prompt);
  const originalCrop = readFileSync(fixture.crop);
  const fake = makeFakeCodex(fixture);
  const result = runComponentReferenceHandoff(fixture.values, fake.operations);

  assert.equal(result.status, 'complete');
  assert.equal(result.command, fixture.fakeCodex);
  assert.deepEqual(readdirSync(fixture.outputDir).sort(), BUNDLE_FILES);
  assert.deepEqual(readFileSync(join(fixture.outputDir, 'REQUEST.md')), originalPrompt);
  assert.deepEqual(readFileSync(join(fixture.outputDir, 'SOURCE_CROP.png')), originalCrop);
  assert.deepEqual(readFileSync(join(fixture.outputDir, 'reference.png')), readFileSync(GENERATED_REFERENCE));
  assert.equal(result.publishedHashes['reference.png'], sha256(readFileSync(GENERATED_REFERENCE)));
  assert.match(
    readFileSync(join(fixture.outputDir, 'REFERENCE_PROVENANCE.md'), 'utf8'),
    /Local binary trust boundary/,
  );
  assert.match(
    readFileSync(join(fixture.outputDir, 'REFERENCE_PROVENANCE.md'), 'utf8'),
    /input-policy-origin-capability-proof: unverified-routing-premise/,
  );
  assert.match(
    readFileSync(join(fixture.outputDir, 'REFERENCE_PROVENANCE.md'), 'utf8'),
    /protected-image-handle-stat-before: \{/,
  );
  assert.match(
    readFileSync(join(fixture.outputDir, 'REFERENCE_PROVENANCE.md'), 'utf8'),
    /invocation-started-at-iso:/,
  );
  assert.equal(existsSync(fake.scratchPaths[0]), false, 'successful publication must remove scratch');
  assert.equal(result.isolatedScratchRemoved, true);
  assert.equal(readFileSync(fixture.prompt, 'utf8'), 'mutated after snapshot');
  fixture.cleanup();
});

test('protected PNG read rejects a handle identity change and requests no-follow', () => {
  const fixture = makeProtectedImageFixture();
  let fstatCalls = 0;
  let openedFlags = 0;
  assert.throws(() => readProtectedGeneratedImage(fixture.request, {
    openFile(path, flags) {
      openedFlags = flags;
      return openSync(path, flags);
    },
    fstatFile(descriptor) {
      const value = fstatSync(descriptor);
      fstatCalls += 1;
      if (fstatCalls === 2) return { ...value, size: value.size + 1 };
      return value;
    },
  }), /changed identity or metadata during the protected read/);
  assert.equal(
    (openedFlags & (fsConstants.O_NOFOLLOW || 0)) === (fsConstants.O_NOFOLLOW || 0),
    true,
  );
  fixture.cleanup();
});

test('imagegen bridge rejects a generated-image thread that predates invocation', () => {
  const fixture = makeFixture();
  const threadId = '019fb054-2bb2-73f1-af3c-fc841d381b50';
  const staleDir = join(fixture.codexHome, 'generated_images', threadId);
  mkdirSync(staleDir, { recursive: true });
  copyFileSync(GENERATED_REFERENCE, join(staleDir, 'old.png'));
  const fake = makeFakeCodex(fixture, { threadId, writeGeneratedImage: false });
  assert.throws(
    () => runComponentReferenceHandoff(fixture.values, fake.operations),
    /reused preexisting generated-image thread/,
  );
  assert.equal(existsSync(fixture.outputDir), false);
  fixture.cleanup();
});

test('imagegen bridge rejects replacement of the resolved Codex executable during the run', () => {
  const fixture = makeFixture();
  const fake = makeFakeCodex(fixture);
  const stableInspect = fake.operations.inspectCodexExecutable;
  let inspections = 0;
  fake.operations.inspectCodexExecutable = () => {
    const identity = stableInspect();
    inspections += 1;
    if (inspections === 2) identity.sha256 = 'f'.repeat(64);
    return identity;
  };
  assert.throws(
    () => runComponentReferenceHandoff(fixture.values, fake.operations),
    /executable changed during/,
  );
  assert.equal(existsSync(fixture.outputDir), false);
  fixture.cleanup();
});

test('imagegen bridge enforces the strict report schema, including no extra keys', () => {
  const fixture = makeFixture();
  const fake = makeFakeCodex(fixture, { reportExtra: { surprise: true } });
  assert.throws(
    () => runComponentReferenceHandoff(fixture.values, fake.operations),
    /strict output schema keys/,
  );
  assert.equal(existsSync(fixture.outputDir), false);
  assert.equal(existsSync(fake.scratchPaths[0]), true, 'failed handoff must preserve scratch');
  fixture.cleanup();
});

test('atomic publication preserves a raced foreign target and removes only its own stage', () => {
  const fixture = makePublicationFixture();
  assert.throws(() => publishValidatedOutputs(fixture.plan, fixture.prepared, {
    nonce: 'race',
    beforeRename({ target }) {
      mkdirSync(target);
      writeFileSync(join(target, 'foreign.txt'), 'foreign');
    },
  }), /raced output directory/);
  assert.equal(readFileSync(join(fixture.outputDir, 'foreign.txt'), 'utf8'), 'foreign');
  assert.equal(
    readdirSync(fixture.parent).some((name) => name.includes('imagegen-stage')),
    false,
  );
  fixture.cleanup();
});

test('atomic publication leaves no final directory when the one rename fails', () => {
  const fixture = makePublicationFixture();
  assert.throws(() => publishValidatedOutputs(fixture.plan, fixture.prepared, {
    nonce: 'rename-failure',
    renameDirectory() {
      throw new Error('injected directory rename failure');
    },
  }), /injected directory rename failure/);
  assert.equal(existsSync(fixture.outputDir), false);
  assert.equal(
    readdirSync(fixture.parent).some((name) => name.includes('imagegen-stage')),
    false,
  );
  fixture.cleanup();
});

test('atomic publication preserves a replaced foreign lock', () => {
  const fixture = makePublicationFixture();
  let foreignLock;
  assert.throws(() => publishValidatedOutputs(fixture.plan, fixture.prepared, {
    nonce: 'lock-replacement',
    ownershipToken: 'owned-token',
    beforeRename({ lock }) {
      rmSync(lock, { recursive: true });
      mkdirSync(lock);
      writeFileSync(join(lock, 'OWNER_TOKEN'), 'foreign-token');
      writeFileSync(join(lock, 'foreign.txt'), 'foreign');
      foreignLock = lock;
    },
  }), /publication lock immediately before publication changed identity/);
  assert.equal(readFileSync(join(foreignLock, 'foreign.txt'), 'utf8'), 'foreign');
  assert.equal(existsSync(fixture.outputDir), false);
  fixture.cleanup();
});

test('atomic publication detects parent replacement and preserves the foreign parent', () => {
  const fixture = makePublicationFixture();
  const movedParent = `${fixture.parent}-moved`;
  assert.throws(() => publishValidatedOutputs(fixture.plan, fixture.prepared, {
    nonce: 'parent-replacement',
    ownershipToken: 'owned-token',
    beforeRename() {
      renameSync(fixture.parent, movedParent);
      mkdirSync(fixture.parent);
      writeFileSync(join(fixture.parent, 'foreign.txt'), 'foreign');
    },
  }), /output parent immediately before publication changed identity/);
  assert.equal(readFileSync(join(fixture.parent, 'foreign.txt'), 'utf8'), 'foreign');
  assert.equal(existsSync(fixture.outputDir), false);
  fixture.cleanup();
});

test('atomic publication detects post-rename lock replacement without deleting it', () => {
  const fixture = makePublicationFixture();
  let foreignLock;
  assert.throws(() => publishValidatedOutputs(fixture.plan, fixture.prepared, {
    nonce: 'post-rename-lock-replacement',
    ownershipToken: 'owned-token',
    afterRename({ lock }) {
      rmSync(lock, { recursive: true });
      mkdirSync(lock);
      writeFileSync(join(lock, 'OWNER_TOKEN'), 'foreign-token');
      writeFileSync(join(lock, 'foreign.txt'), 'foreign');
      foreignLock = lock;
    },
  }), /publication lock immediately after publication changed identity/);
  assert.equal(readFileSync(join(foreignLock, 'foreign.txt'), 'utf8'), 'foreign');
  assert.deepEqual(readdirSync(fixture.outputDir).sort(), BUNDLE_FILES);
  fixture.cleanup();
});

test('imagegen handoff refuses an existing or escaped output directory', () => {
  const fixture = makeFixture();
  mkdirSync(fixture.outputDir);
  assert.throws(
    () => prepareComponentReferenceHandoff(fixture.values),
    /must not already exist/,
  );
  rmSync(fixture.outputDir, { recursive: true });
  assert.throws(() => prepareComponentReferenceHandoff({
    ...fixture.values,
    'output-dir': resolve(fixture.repo, '..', 'escaped-reference-bundle'),
  }), /inside repo/);
  fixture.cleanup();
});

function executionJsonl(threadId, agentMessage) {
  return [
    JSON.stringify({ type: 'thread.started', thread_id: threadId }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'message_1', type: 'agent_message', text: agentMessage },
    }),
    JSON.stringify({ type: 'turn.completed', usage: {} }),
  ].join('\n');
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-imagegen-test-'));
  const repo = join(root, 'repo');
  const parent = join(repo, 'references');
  const prompt = join(repo, 'PROMPT.md');
  const crop = join(repo, 'crop.png');
  const outputDir = join(parent, 'drive-study');
  const codexHome = join(root, 'codex-home');
  const fakeCodex = join(root, process.platform === 'win32' ? 'codex.exe' : 'codex');
  mkdirSync(parent, { recursive: true });
  mkdirSync(join(codexHome, 'generated_images'), { recursive: true });
  writeFileSync(prompt, '# Drive study\nPreserve the frozen saddle interfaces.\n');
  copyFileSync(SOURCE_CROP, crop);
  writeFileSync(fakeCodex, 'fake executable bytes');
  return {
    root,
    repo,
    parent,
    prompt,
    crop,
    outputDir,
    codexHome,
    fakeCodex,
    values: {
      repo,
      prompt,
      crop,
      'component-reference-decision': 'codex_handoff',
      'origin-capability-premise': 'worker_lacks_image_generation',
      'output-dir': outputDir,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function makeFakeCodex(fixture, {
  threadId = '019fb054-2bb2-73f1-af3c-fc841d381b50',
  reportExtra = {},
  writeGeneratedImage = true,
} = {}) {
  const scratchPaths = [];
  const promptBytes = readFileSync(fixture.prompt);
  const cropBytes = readFileSync(fixture.crop);
  const report = {
    kind: 'component',
    promptSha256: sha256(promptBytes),
    cropSha256: sha256(cropBytes),
    capabilityAttestation: 'image-generation-capability: available',
    executionAttestation: 'image-generation-executed: true',
    tool: 'image_generation',
    selectedTraits: ['fabricated saddle'],
    rejectedTraits: ['generic primitive stack'],
    licenseProvenance: 'Generated reference for internal design study.',
    notes: '',
    ...reportExtra,
  };
  const reportText = JSON.stringify(report);
  const identity = {
    path: fixture.fakeCodex,
    sha256: sha256(readFileSync(fixture.fakeCodex)),
    stat: {
      size: readFileSync(fixture.fakeCodex).length,
      mtimeMs: 1,
      birthtimeMs: 1,
      ino: 1,
      dev: 1,
    },
    version: 'codex-cli 0.130.0-alpha.5',
  };
  return {
    scratchPaths,
    operations: {
      codexHome: fixture.codexHome,
      now: () => Date.now() - 100,
      resolveCodexExecutable: () => fixture.fakeCodex,
      inspectCodexExecutable: () => structuredClone(identity),
      createScratch() {
        const scratch = mkdtempSync(join(fixture.root, 'scratch-'));
        scratchPaths.push(scratch);
        return scratch;
      },
      spawnSync(executable, args, options) {
        assert.equal(executable, fixture.fakeCodex);
        assert.equal(options.cwd.startsWith(fixture.repo), false);
        assert.equal(args[args.indexOf('-m') + 1], 'gpt-5.5');
        assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
        writeFileSync(args[args.indexOf('-o') + 1], reportText);
        writeFileSync(fixture.prompt, 'mutated after snapshot');
        writeFileSync(fixture.crop, Buffer.from('mutated crop'));
        if (writeGeneratedImage) {
          const threadDir = join(fixture.codexHome, 'generated_images', threadId);
          mkdirSync(threadDir, { recursive: true });
          writeFileSync(join(threadDir, 'generated.png'), readFileSync(GENERATED_REFERENCE));
        }
        return {
          status: 0,
          stdout: executionJsonl(threadId, reportText),
          stderr: '',
        };
      },
      publish: { nonce: 'e2e' },
    },
  };
}

function makeProtectedImageFixture() {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-imagegen-protected-'));
  const codexHome = join(root, 'codex-home');
  const threadId = '019fb054-2bb2-73f1-af3c-fc841d381b50';
  const threadDir = join(codexHome, 'generated_images', threadId);
  mkdirSync(threadDir, { recursive: true });
  writeFileSync(join(threadDir, 'generated.png'), readFileSync(GENERATED_REFERENCE));
  return {
    request: {
      threadId,
      codexHome,
      preexistingThreadIds: new Set(),
      invocationStartedAt: Date.now() - 1000,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function makePublicationFixture() {
  const root = mkdtempSync(join(tmpdir(), 'spaceface-imagegen-publish-'));
  const parent = join(root, 'parent');
  const scratch = join(root, 'scratch');
  const outputDir = join(parent, 'bundle');
  mkdirSync(parent);
  mkdirSync(scratch);
  const bundleFiles = BUNDLE_FILES.map((name) => {
    const path = join(scratch, name);
    writeFileSync(path, `${name}\n`);
    return [name, path];
  });
  return {
    root,
    parent,
    outputDir,
    plan: { bundleFiles },
    prepared: {
      outputDir,
      outputParent: parent,
      outputParentReal: parent,
      outputParentIdentity: (() => {
        const value = statSync(parent);
        return { dev: value.dev, ino: value.ino, birthtimeMs: value.birthtimeMs };
      })(),
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
