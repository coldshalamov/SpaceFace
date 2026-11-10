#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const CAPABILITY_TOKEN = 'image-generation-capability: available';
const EXECUTION_TOKEN = 'image-generation-executed: true';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUPPORTED_KINDS = new Set(['component', 'portrait', 'concept', 'cinematic']);
const BUNDLE_FILES = Object.freeze([
  'reference.png',
  'REFERENCE_PROVENANCE.md',
  'HANDOFF_REPORT.json',
  'CODEX_EXECUTION.jsonl',
  'REQUEST.md',
  'SOURCE_CROP.png',
  'OUTPUT_SCHEMA.json',
]);
const REPORT_KEYS = Object.freeze([
  'kind',
  'promptSha256',
  'cropSha256',
  'capabilityAttestation',
  'executionAttestation',
  'tool',
  'selectedTraits',
  'rejectedTraits',
  'licenseProvenance',
  'notes',
]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pathWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function objectIdentityEvidence(value) {
  return {
    dev: value.dev,
    ino: value.ino,
    birthtimeMs: value.birthtimeMs,
  };
}

function requiredExistingPath(values, key) {
  const raw = values[key];
  if (!raw) throw new Error(`--${key} is required`);
  const fullPath = resolve(raw);
  if (!existsSync(fullPath)) throw new Error(`--${key} does not exist: ${fullPath}`);
  return realpathSync(fullPath);
}

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(resolve(path));
      else throw new Error(`unexpected non-file output in isolated workspace: ${path}`);
    }
  };
  visit(root);
  return files.sort();
}

export function buildHandoffPrompt({
  promptText,
  promptSha256,
  cropSha256,
  kind = 'component',
}) {
  if (!/^[0-9a-f]{64}$/iu.test(promptSha256 || '')
      || !/^[0-9a-f]{64}$/iu.test(cropSha256 || '')) {
    throw new Error('handoff prompt requires bound prompt and crop SHA-256 values');
  }
  if (!SUPPORTED_KINDS.has(kind)) throw new Error(`unsupported image-generation reference kind: ${kind}`);
  const scopeContract = kind === 'component'
    ? `Use image generation, not text-only ideation, to create a construction/material reference sheet for
the exact attached component. Preserve its supplied footprint, orientation, role, attachment points,
clearances, and frozen interfaces. Follow the component material bill and forbidden reads. Do not
redesign the whole asset. Do not generate production PBR, collision, or runtime textures.`
    : `Use image generation, not text-only ideation, to create exactly one ${kind} reference candidate from
the attached source and bounded brief. Preserve the named identity, story/capture logic, composition,
crop, and forbidden edits in that brief. This is a reference candidate, not permission to change
runtime registries, Blender/GLB sources, release assets, or acceptance records.`;
  return `${promptText.trim()}

## Mandatory image-generation execution contract

Invoke the built-in image-generation tool exactly once. Loading or inspecting the attached source
crop is not generation. If image generation is unavailable or fails, return a failed final response;
do not fabricate an image or a success receipt.

${scopeContract}

Do not invoke shell commands, file tools, MCP tools, web tools, browser/computer control, plugins,
apps, or subagents. Return exactly one final agent message containing only the JSON object required
by the supplied strict output schema. It must bind:
- kind: ${kind}
- promptSha256: ${promptSha256}
- cropSha256: ${cropSha256}
- capabilityAttestation: ${CAPABILITY_TOKEN}
- executionAttestation: ${EXECUTION_TOKEN}

Name selected and rejected traits and give a concise license/provenance statement. These fields are
descriptive metadata; the host independently proves generation from the protected service artifact.
`;
}

export function prepareComponentReferenceHandoff(rawValues) {
  const kind = rawValues.kind || 'component';
  if (!SUPPORTED_KINDS.has(kind)) throw new Error(`--kind must be one of: ${[...SUPPORTED_KINDS].join(', ')}`);
  const repo = realpathSync(resolve(rawValues.repo || process.cwd()));
  const prompt = requiredExistingPath(rawValues, 'prompt');
  const crop = requiredExistingPath(rawValues, 'crop');
  if (!rawValues['output-dir']) throw new Error('--output-dir is required');
  if (rawValues['component-reference-decision'] !== 'codex_handoff') {
    throw new Error('--component-reference-decision must be codex_handoff');
  }
  if (rawValues['origin-capability-premise'] !== 'worker_lacks_image_generation') {
    throw new Error('--origin-capability-premise must be worker_lacks_image_generation');
  }
  const outputDir = resolve(rawValues['output-dir']);
  if (!pathWithin(repo, outputDir) || samePath(repo, outputDir)) {
    throw new Error(`output directory must be a new directory inside repo: ${outputDir}`);
  }
  if (existsSync(outputDir)) throw new Error(`output directory must not already exist: ${outputDir}`);
  const outputParent = dirname(outputDir);
  if (!existsSync(outputParent)) throw new Error(`output parent directory does not exist: ${outputParent}`);
  const outputParentReal = realpathSync(outputParent);
  if (!pathWithin(repo, outputParentReal)) {
    throw new Error(`output parent escapes repo through a link: ${outputParentReal}`);
  }
  if (samePath(prompt, crop) || samePath(prompt, outputDir) || samePath(crop, outputDir)) {
    throw new Error('prompt, crop, and output directory paths must all be distinct');
  }

  const promptBytes = readFileSync(prompt);
  const cropBytes = readFileSync(crop);
  return {
    repo,
    kind,
    prompt,
    crop,
    outputDir,
    outputParent,
    outputParentReal,
    outputParentIdentity: objectIdentityEvidence(lstatSync(outputParentReal)),
    componentReferenceDecision: rawValues['component-reference-decision'],
    originCapabilityPremise: rawValues['origin-capability-premise'],
    promptBytes,
    cropBytes,
    promptSha256: hashBytes(promptBytes),
    cropSha256: hashBytes(cropBytes),
    codexCommand: process.platform === 'win32' ? 'codex.exe' : 'codex',
  };
}

function outputSchema(prepared) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [...REPORT_KEYS],
    properties: {
      kind: { type: 'string', enum: [prepared.kind] },
      promptSha256: { type: 'string', enum: [prepared.promptSha256] },
      cropSha256: { type: 'string', enum: [prepared.cropSha256] },
      capabilityAttestation: { type: 'string', enum: [CAPABILITY_TOKEN] },
      executionAttestation: { type: 'string', enum: [EXECUTION_TOKEN] },
      tool: { type: 'string', enum: ['image_generation'] },
      selectedTraits: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
      rejectedTraits: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
      licenseProvenance: { type: 'string', minLength: 1 },
      notes: { type: 'string' },
    },
  };
}

export function buildIsolatedExecutionPlan(prepared, scratchRoot, codexExecutable = prepared.codexCommand) {
  const scratch = resolve(scratchRoot);
  if (pathWithin(prepared.repo, scratch)) {
    throw new Error(`isolated scratch must be outside the repository: ${scratch}`);
  }
  const paths = Object.fromEntries(BUNDLE_FILES.map((name) => [name, join(scratch, name)]));
  const schema = outputSchema(prepared);
  const payload = buildHandoffPrompt({
    promptText: prepared.promptBytes.toString('utf8'),
    promptSha256: prepared.promptSha256,
    cropSha256: prepared.cropSha256,
    kind: prepared.kind,
  });
  const codexArgs = [
    '-a', 'never',
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--enable', 'image_generation',
    '--disable', 'plugins',
    '--disable', 'apps',
    '--disable', 'multi_agent',
    '--disable', 'browser_use',
    '--disable', 'browser_use_external',
    '--disable', 'computer_use',
    '-m', 'gpt-5.5',
    '-c', 'model_reasoning_effort="medium"',
    '-C', scratch,
    '--skip-git-repo-check',
    '--ephemeral',
    '-i', paths['SOURCE_CROP.png'],
    '--sandbox', 'read-only',
    '--json',
    '--output-schema', paths['OUTPUT_SCHEMA.json'],
    '-o', paths['HANDOFF_REPORT.json'],
    '-',
  ];
  return {
    scratch,
    paths,
    schema,
    payload,
    codexExecutable,
    codexArgs,
    preSpawnFiles: [
      paths['OUTPUT_SCHEMA.json'],
      paths['REQUEST.md'],
      paths['SOURCE_CROP.png'],
    ].sort(),
    postSpawnFiles: [
      paths['CODEX_EXECUTION.jsonl'],
      paths['HANDOFF_REPORT.json'],
      paths['OUTPUT_SCHEMA.json'],
      paths['REQUEST.md'],
      paths['SOURCE_CROP.png'],
    ].sort(),
    bundleFiles: BUNDLE_FILES.map((name) => [name, paths[name]]),
  };
}

function pixelHash(decoded) {
  const dimensions = Buffer.allocUnsafe(8);
  dimensions.writeUInt32BE(decoded.width, 0);
  dimensions.writeUInt32BE(decoded.height, 4);
  return createHash('sha256').update(dimensions).update(decoded.data).digest('hex');
}

export function validateGeneratedCandidate(candidateInput, cropInput) {
  const candidate = Buffer.isBuffer(candidateInput) ? candidateInput : readFileSync(candidateInput);
  const crop = Buffer.isBuffer(cropInput) ? cropInput : readFileSync(cropInput);
  if (candidate.length < 1024) throw new Error(`candidate PNG is implausibly small: ${candidate.length} bytes`);
  if (!candidate.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('candidate output is not a valid PNG signature');
  }
  let decoded;
  let decodedCrop;
  try {
    decoded = PNG.sync.read(candidate, { checkCRC: true });
  } catch (error) {
    throw new Error(`candidate PNG does not fully decode: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    decodedCrop = PNG.sync.read(crop, { checkCRC: true });
  } catch (error) {
    throw new Error(`input crop PNG does not fully decode: ${error instanceof Error ? error.message : String(error)}`);
  }
  const { width, height } = decoded;
  if (width < 64 || height < 64 || width > 8192 || height > 8192) {
    throw new Error(`candidate PNG dimensions are outside reference bounds: ${width}x${height}`);
  }
  const candidateHash = hashBytes(candidate);
  if (candidateHash === hashBytes(crop)) throw new Error('candidate is byte-identical to the input crop');
  const decodedHash = pixelHash(decoded);
  if (decodedHash === pixelHash(decodedCrop)) {
    throw new Error('candidate decodes to the same pixels as the input crop');
  }
  return {
    width,
    height,
    sha256: candidateHash,
    decodedPixelSha256: decodedHash,
    bytes: candidate.length,
  };
}

export function validateCodexExecutionStream(jsonl) {
  const source = String(jsonl || '');
  const events = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Codex JSONL line ${index + 1} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (events.length < 4) throw new Error(`Codex stream is incomplete: found ${events.length} events`);
  if (events.some((event) => event?.type === 'error'
      || event?.type === 'turn.failed'
      || event?.error)) {
    throw new Error('Codex structured execution stream contains an error');
  }
  if (events[0]?.type !== 'thread.started') {
    throw new Error(`Codex first event must be thread.started, found ${events[0]?.type || '<missing>'}`);
  }
  if (events[1]?.type !== 'turn.started') {
    throw new Error(`Codex second event must be turn.started, found ${events[1]?.type || '<missing>'}`);
  }
  if (events.at(-1)?.type !== 'turn.completed') {
    throw new Error(`Codex last event must be turn.completed, found ${events.at(-1)?.type || '<missing>'}`);
  }
  if (events.filter((event) => event.type === 'thread.started').length !== 1
      || events.filter((event) => event.type === 'turn.started').length !== 1
      || events.filter((event) => event.type === 'turn.completed').length !== 1) {
    throw new Error('Codex stream must contain exactly one thread start, turn start, and turn completion');
  }
  const threadId = String(events[0].thread_id || '').trim();
  if (!/^[0-9a-f-]{20,}$/iu.test(threadId)) throw new Error(`invalid Codex thread id: ${threadId}`);
  const middle = events.slice(2, -1);
  if (middle.some((event) => event.type !== 'item.completed')) {
    const event = middle.find((candidate) => candidate.type !== 'item.completed');
    throw new Error(`Codex stream contains forbidden event type ${event?.type || '<missing>'}`);
  }
  const forbiddenItem = middle.find((event) => !['reasoning', 'agent_message'].includes(event.item?.type));
  if (forbiddenItem) {
    throw new Error(`Codex stream contains forbidden completed item ${forbiddenItem.item?.type || '<missing>'}`);
  }
  const messages = middle.filter((event) => event.item?.type === 'agent_message');
  if (messages.length !== 1
      || typeof messages[0].item.text !== 'string'
      || !messages[0].item.text.trim()) {
    throw new Error(`Codex stream must contain exactly one completed agent_message, found ${messages.length}`);
  }
  if (middle.at(-1) !== messages[0]) {
    throw new Error('Codex completed agent_message must be the final item before turn completion');
  }
  return {
    threadId,
    agentMessage: messages[0].item.text,
    eventStreamSha256: hashBytes(Buffer.from(source)),
    eventCount: events.length,
  };
}

function parseStrictReport(bytes, prepared, label) {
  let value;
  try {
    value = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be one JSON object`);
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...REPORT_KEYS].sort();
  if (!isDeepStrictEqual(actualKeys, expectedKeys)) {
    throw new Error(`${label} does not match the strict output schema keys`);
  }
  const expected = {
    kind: prepared.kind,
    promptSha256: prepared.promptSha256,
    cropSha256: prepared.cropSha256,
    capabilityAttestation: CAPABILITY_TOKEN,
    executionAttestation: EXECUTION_TOKEN,
    tool: 'image_generation',
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw new Error(`${label} ${key} is not bound to the requested run`);
  }
  for (const key of ['selectedTraits', 'rejectedTraits']) {
    if (!Array.isArray(value[key]) || value[key].length === 0
        || value[key].some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error(`${label} ${key} must be a nonempty string array`);
    }
  }
  if (typeof value.licenseProvenance !== 'string' || !value.licenseProvenance.trim()) {
    throw new Error(`${label} licenseProvenance must be a nonempty string`);
  }
  if (typeof value.notes !== 'string') throw new Error(`${label} notes must be a string`);
  return value;
}

function snapshotGeneratedThreadIds(codexHome) {
  const generatedRoot = join(codexHome, 'generated_images');
  const ids = existsSync(generatedRoot)
    ? readdirSync(generatedRoot, { withFileTypes: true }).map((entry) => entry.name).sort()
    : [];
  return {
    ids: new Set(ids),
    count: ids.length,
    sha256: hashBytes(Buffer.from(`${ids.join('\n')}\n`)),
  };
}

function assertFreshStat(value, invocationStartedAt, label) {
  const createdAt = Math.max(value.birthtimeMs || 0, value.ctimeMs || 0);
  if (createdAt < invocationStartedAt || value.mtimeMs < invocationStartedAt) {
    throw new Error(`${label} is stale relative to invocation start`);
  }
}

function statEvidence(value) {
  return {
    dev: value.dev,
    ino: value.ino,
    size: value.size,
    birthtimeMs: value.birthtimeMs,
    ctimeMs: value.ctimeMs,
    mtimeMs: value.mtimeMs,
  };
}

function assertSameStatIdentity(before, after, label) {
  if (!isDeepStrictEqual(statEvidence(before), statEvidence(after))) {
    throw new Error(`${label} changed identity or metadata during the protected read`);
  }
}

export function readProtectedGeneratedImage({
  threadId,
  codexHome = process.env.CODEX_HOME || join(homedir(), '.codex'),
  preexistingThreadIds = new Set(),
  invocationStartedAt = 0,
}, operations = {}) {
  const lstatPath = operations.lstatPath || lstatSync;
  const statPath = operations.statPath || statSync;
  const openFile = operations.openFile || openSync;
  const fstatFile = operations.fstatFile || fstatSync;
  const readOpenedFile = operations.readOpenedFile || ((descriptor) => readFileSync(descriptor));
  const closeFile = operations.closeFile || closeSync;
  if (!/^[0-9a-f-]{20,}$/iu.test(threadId)) throw new Error(`invalid Codex thread id: ${threadId}`);
  if (preexistingThreadIds.has(threadId)) {
    throw new Error(`Codex reused preexisting generated-image thread ${threadId}`);
  }
  const generatedRootPath = join(codexHome, 'generated_images');
  if (!existsSync(generatedRootPath)) {
    throw new Error(`Codex generated no protected image artifact for thread ${threadId}`);
  }
  const generatedRoot = realpathSync(generatedRootPath);
  const threadPath = join(generatedRoot, threadId);
  if (!existsSync(threadPath)) {
    throw new Error(`Codex generated no protected image artifact for thread ${threadId}`);
  }
  const threadLinkStat = lstatPath(threadPath);
  if (!threadLinkStat.isDirectory() || threadLinkStat.isSymbolicLink()) {
    throw new Error(`Codex generated-image thread is not a new physical directory: ${threadPath}`);
  }
  const threadDirectory = realpathSync(threadPath);
  if (!pathWithin(generatedRoot, threadDirectory)) {
    throw new Error(`Codex generated-image thread path escapes its protected root: ${threadDirectory}`);
  }
  const threadStatBefore = statPath(threadDirectory);
  assertFreshStat(threadStatBefore, invocationStartedAt, 'protected generated-image thread directory');
  const images = walkFiles(threadDirectory).filter((path) => path.toLowerCase().endsWith('.png'));
  if (images.length !== 1) {
    throw new Error(`Codex thread ${threadId} must produce exactly one protected PNG, found ${images.length}`);
  }
  const imagePath = images[0];
  const pathStatBefore = lstatPath(imagePath);
  if (!pathStatBefore.isFile() || pathStatBefore.isSymbolicLink()) {
    throw new Error(`protected generated PNG is not a physical file: ${imagePath}`);
  }
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  const descriptor = openFile(imagePath, fsConstants.O_RDONLY | noFollow);
  let bytes;
  let handleStatBefore;
  let handleStatAfter;
  try {
    handleStatBefore = fstatFile(descriptor);
    assertSameStatIdentity(pathStatBefore, handleStatBefore, 'protected generated PNG path/handle');
    assertFreshStat(handleStatBefore, invocationStartedAt, 'protected generated PNG');
    operations.afterImageOpen?.({ imagePath, descriptor, handleStatBefore });
    bytes = readOpenedFile(descriptor);
    operations.afterImageRead?.({ imagePath, descriptor, bytes });
    handleStatAfter = fstatFile(descriptor);
    assertSameStatIdentity(handleStatBefore, handleStatAfter, 'protected generated PNG handle');
    const pathStatAfter = lstatPath(imagePath);
    assertSameStatIdentity(handleStatAfter, pathStatAfter, 'protected generated PNG post-read path/handle');
  } finally {
    closeFile(descriptor);
  }
  const threadStatAfter = statPath(threadDirectory);
  assertSameStatIdentity(threadStatBefore, threadStatAfter, 'protected generated-image thread directory');
  return {
    path: imagePath,
    bytes,
    sha256: hashBytes(bytes),
    freshness: {
      invocationStartedAt,
      invocationStartedAtIso: new Date(invocationStartedAt).toISOString(),
      threadStatBefore: statEvidence(threadStatBefore),
      threadStatAfter: statEvidence(threadStatAfter),
      imageStatBefore: statEvidence(handleStatBefore),
      imageStatAfter: statEvidence(handleStatAfter),
      usedNoFollow: noFollow !== 0,
    },
  };
}

export function locateProtectedGeneratedImage(threadId, codexHome, options = {}) {
  return readProtectedGeneratedImage({
    threadId,
    codexHome,
    ...options,
  }).path;
}

function binaryStat(path) {
  const value = statSync(path);
  return {
    size: value.size,
    mtimeMs: value.mtimeMs,
    birthtimeMs: value.birthtimeMs,
    ino: value.ino,
    dev: value.dev,
  };
}

export function resolveCodexExecutable(command, spawn = spawnSync) {
  if (isAbsolute(command)) {
    if (!existsSync(command)) throw new Error(`Codex executable does not exist: ${command}`);
    return realpathSync(command);
  }
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const located = spawn(locator, [command], { encoding: 'utf8', windowsHide: true });
  if (located.error) throw located.error;
  if (located.status !== 0) throw new Error(`could not resolve ${command} to an installed executable`);
  for (const line of String(located.stdout || '').split(/\r?\n/u)) {
    const candidate = line.trim();
    if (candidate && isAbsolute(candidate) && existsSync(candidate)) return realpathSync(candidate);
  }
  throw new Error(`could not resolve ${command} to an absolute executable path`);
}

export function inspectCodexExecutable(path, spawn = spawnSync) {
  const versionResult = spawn(path, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (versionResult.error) throw versionResult.error;
  if (versionResult.status !== 0) throw new Error(`Codex version probe failed with exit ${versionResult.status}`);
  const version = String(versionResult.stdout || versionResult.stderr || '').trim();
  if (!version) throw new Error('Codex version probe returned no version');
  return {
    path: realpathSync(path),
    sha256: hashBytes(readFileSync(path)),
    stat: binaryStat(path),
    version,
  };
}

function assertCodexUnchanged(before, after) {
  if (!isDeepStrictEqual(before, after)) {
    throw new Error('resolved Codex executable changed during the image-generation invocation');
  }
}

function provenanceBytes(
  prepared,
  report,
  execution,
  generatedImage,
  candidate,
  codexIdentity,
  preexistingThreadSnapshot,
) {
  const bullets = (values) => values
    .map((value) => `- ${String(value).replace(/\r?\n/gu, ' ').trim()}`)
    .join('\n');
  const notes = report.notes.trim() ? `\n## Notes\n\n${report.notes.trim()}\n` : '';
  return Buffer.from(`# Image-generation reference provenance

${CAPABILITY_TOKEN}
${EXECUTION_TOKEN}
image-generation-proof: protected-codex-thread-artifact
image-generation-tool: ${report.tool}
reference-kind: ${prepared.kind}
input-policy-component-reference-decision: ${prepared.componentReferenceDecision}
input-policy-origin-capability-premise: ${prepared.originCapabilityPremise}
input-policy-origin-capability-proof: unverified-routing-premise
codex-thread-id: ${execution.threadId}
codex-event-stream-sha256: ${execution.eventStreamSha256}
invocation-started-at-ms: ${generatedImage.freshness.invocationStartedAt}
invocation-started-at-iso: ${generatedImage.freshness.invocationStartedAtIso}
preexisting-generated-thread-count: ${preexistingThreadSnapshot.count}
preexisting-generated-thread-ids-sha256: ${preexistingThreadSnapshot.sha256}
input-prompt-sha256: ${prepared.promptSha256}
input-crop-sha256: ${prepared.cropSha256}
protected-generated-image: ${generatedImage.path}
protected-generated-image-sha256: ${generatedImage.sha256}
protected-generated-image-no-follow: ${generatedImage.freshness.usedNoFollow}
protected-thread-stat-before: ${JSON.stringify(generatedImage.freshness.threadStatBefore)}
protected-thread-stat-after: ${JSON.stringify(generatedImage.freshness.threadStatAfter)}
protected-image-handle-stat-before: ${JSON.stringify(generatedImage.freshness.imageStatBefore)}
protected-image-handle-stat-after: ${JSON.stringify(generatedImage.freshness.imageStatAfter)}
output-reference-sha256: ${candidate.sha256}
output-reference-pixel-sha256: ${candidate.decodedPixelSha256}
codex-executable-real-path: ${codexIdentity.path}
codex-executable-sha256: ${codexIdentity.sha256}
codex-executable-version: ${codexIdentity.version}
codex-executable-size: ${codexIdentity.stat.size}
codex-executable-mtime-ms: ${codexIdentity.stat.mtimeMs}
publication-host-trust-boundary: same-user-filesystem-integrity-during-windows-pathname-rename

## Local binary trust boundary

The wrapper resolves and pins the installed Codex executable, records its hash/stat/version, and
verifies they are unchanged after execution. The authenticity and publisher trust of that locally
installed binary remain a host-machine trust boundary outside this packet's proof.

The origin capability premise above is caller-supplied routing policy, not independently proven by
the delegated Codex receipt. The protected artifact and event stream separately prove the delegated
generation run accepted by this wrapper.

Node does not expose a Windows handle-relative rename. The wrapper checks parent, stage, lock, and
ownership-token identity immediately before and after its pathname rename, but same-user filesystem
integrity during that final interval remains a host trust boundary.

## Selected traits

${bullets(report.selectedTraits)}

## Rejected traits

${bullets(report.rejectedTraits)}

## License and provenance

${report.licenseProvenance.trim()}
${notes}`, 'utf8');
}

function assertSameFiles(actual, expected, scratch) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `isolated Codex session created undeclared files in ${scratch}: `
      + actual.map((path) => basename(path)).join(', '),
    );
  }
}

export function publishValidatedOutputs(plan, prepared, operations = {}) {
  const copy = operations.copyFile || copyFileSync;
  const renameDirectory = operations.renameDirectory || renameSync;
  const removeDirectory = operations.removeDirectory
    || ((path) => rmSync(path, { recursive: true, force: true }));
  const nonce = operations.nonce || randomBytes(8).toString('hex');
  const ownershipToken = operations.ownershipToken || randomBytes(32).toString('hex');
  const parent = prepared.outputParent;
  const base = basename(prepared.outputDir);
  const lock = join(parent, `.${base}.imagegen.lock`);
  const lockTokenPath = join(lock, 'OWNER_TOKEN');
  const stage = join(parent, `.${base}.imagegen-stage-${process.pid}-${nonce}`);
  let lockOwned = false;
  let stageOwned = false;
  let parentIdentity;
  let lockIdentity;
  let stageIdentity;

  const objectIdentity = (path, label) => {
    const value = lstatSync(path);
    if (!value.isDirectory() || value.isSymbolicLink()) {
      throw new Error(`${label} is not a physical directory: ${path}`);
    }
    return objectIdentityEvidence(value);
  };
  const assertObjectIdentity = (path, expected, label) => {
    const actual = objectIdentity(path, label);
    if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} changed identity`);
  };
  const assertParentOwned = (label) => {
    if (!samePath(realpathSync(parent), prepared.outputParentReal)) {
      throw new Error(`${label} changed real path`);
    }
    assertObjectIdentity(parent, parentIdentity, label);
  };
  const assertLockOwned = (label) => {
    assertObjectIdentity(lock, lockIdentity, label);
    const tokenStat = lstatSync(lockTokenPath);
    if (!tokenStat.isFile() || tokenStat.isSymbolicLink()) {
      throw new Error(`${label} ownership token is not a physical file`);
    }
    if (readFileSync(lockTokenPath, 'utf8') !== ownershipToken) {
      throw new Error(`${label} ownership token changed`);
    }
  };
  const safelyOwns = (path, expected) => {
    try {
      return existsSync(path) && isDeepStrictEqual(objectIdentity(path, 'cleanup path'), expected);
    } catch {
      return false;
    }
  };

  try {
    if (!samePath(realpathSync(parent), prepared.outputParentReal)) {
      throw new Error('output parent changed identity before lock acquisition');
    }
    parentIdentity = objectIdentity(parent, 'output parent');
    if (!isDeepStrictEqual(parentIdentity, prepared.outputParentIdentity)) {
      throw new Error('output parent changed identity since handoff preparation');
    }
    mkdirSync(lock);
    lockOwned = true;
    writeFileSync(lockTokenPath, ownershipToken, { encoding: 'utf8', flag: 'wx' });
    lockIdentity = objectIdentity(lock, 'publication lock');
    assertParentOwned('output parent after lock acquisition');
    assertLockOwned('publication lock after acquisition');
    if (existsSync(prepared.outputDir)) {
      throw new Error(`refuse to overwrite raced output directory: ${prepared.outputDir}`);
    }
    if (existsSync(stage)) throw new Error(`publication staging collision: ${stage}`);
    mkdirSync(stage);
    stageOwned = true;
    stageIdentity = objectIdentity(stage, 'publication stage');
    for (const [name, source] of plan.bundleFiles) copy(source, join(stage, name));
    const stagedNames = readdirSync(stage).sort();
    if (!isDeepStrictEqual(stagedNames, [...BUNDLE_FILES].sort())) {
      throw new Error('publication stage does not contain the exact fixed bundle');
    }
    const stagedHashes = Object.fromEntries(BUNDLE_FILES.map((name) => [
      name,
      hashBytes(readFileSync(join(stage, name))),
    ]));
    operations.beforeRename?.({ stage, target: prepared.outputDir, lock });
    assertParentOwned('output parent immediately before publication');
    assertLockOwned('publication lock immediately before publication');
    assertObjectIdentity(stage, stageIdentity, 'publication stage immediately before publication');
    if (existsSync(prepared.outputDir)) {
      throw new Error(`refuse to overwrite raced output directory: ${prepared.outputDir}`);
    }
    renameDirectory(stage, prepared.outputDir);
    stageOwned = false;
    operations.afterRename?.({ target: prepared.outputDir, lock });
    assertParentOwned('output parent immediately after publication');
    assertLockOwned('publication lock immediately after publication');
    assertObjectIdentity(prepared.outputDir, stageIdentity, 'published bundle');
    const publishedHashes = Object.fromEntries(BUNDLE_FILES.map((name) => [
      name,
      hashBytes(readFileSync(join(prepared.outputDir, name))),
    ]));
    if (!isDeepStrictEqual(publishedHashes, stagedHashes)) {
      throw new Error('published bundle hashes differ from the validated publication stage');
    }
    return publishedHashes;
  } finally {
    if (stageOwned && stageIdentity && safelyOwns(stage, stageIdentity)) removeDirectory(stage);
    if (lockOwned && lockIdentity && safelyOwns(lock, lockIdentity)) {
      try {
        assertLockOwned('publication lock cleanup');
        removeDirectory(lock);
      } catch {
        // A replaced lock belongs to the racer and must not be removed.
      }
    }
  }
}

function outputRecord(prepared, status, extra = {}) {
  return {
    schema: 'spaceface.imagegen-reference-handoff.v4',
    status,
    isolation: 'temporary-workspace-atomic-directory-publication',
    kind: prepared.kind,
    componentReferenceDecision: prepared.componentReferenceDecision,
    originCapabilityPremise: prepared.originCapabilityPremise,
    originCapabilityPremiseProof: 'unverified-routing-premise',
    repo: prepared.repo,
    prompt: prepared.prompt,
    promptSha256: prepared.promptSha256,
    crop: prepared.crop,
    cropSha256: prepared.cropSha256,
    outputDir: prepared.outputDir,
    bundleFiles: [...BUNDLE_FILES],
    ...extra,
  };
}

export function runComponentReferenceHandoff(rawValues, operations = {}) {
  const prepared = prepareComponentReferenceHandoff(rawValues);
  if (rawValues.dryRun) {
    const plan = buildIsolatedExecutionPlan(
      prepared,
      join(tmpdir(), 'spaceface-component-imagegen-NONCE'),
    );
    return outputRecord(prepared, 'dry-run', {
      command: prepared.codexCommand,
      argsTemplate: plan.codexArgs,
      payloadSha256: hashBytes(Buffer.from(plan.payload)),
    });
  }

  const spawn = operations.spawnSync || spawnSync;
  const codexHome = resolve(operations.codexHome || process.env.CODEX_HOME || join(homedir(), '.codex'));
  const now = operations.now || Date.now;
  const resolveExecutable = operations.resolveCodexExecutable
    || ((command) => resolveCodexExecutable(command, spawn));
  const inspectExecutable = operations.inspectCodexExecutable
    || ((path) => inspectCodexExecutable(path, spawn));
  const codexExecutable = resolveExecutable(prepared.codexCommand);
  if (!isAbsolute(codexExecutable) || !existsSync(codexExecutable)) {
    throw new Error(`Codex resolver did not return an existing absolute executable: ${codexExecutable}`);
  }
  const codexIdentityBefore = inspectExecutable(codexExecutable);
  const preexistingThreadSnapshot = snapshotGeneratedThreadIds(codexHome);
  const createScratch = operations.createScratch
    || (() => mkdtempSync(join(tmpdir(), 'spaceface-component-imagegen-')));
  const scratch = createScratch();
  const plan = buildIsolatedExecutionPlan(prepared, scratch, codexIdentityBefore.path);
  writeFileSync(plan.paths['REQUEST.md'], prepared.promptBytes);
  writeFileSync(plan.paths['SOURCE_CROP.png'], prepared.cropBytes);
  writeFileSync(plan.paths['OUTPUT_SCHEMA.json'], `${JSON.stringify(plan.schema, null, 2)}\n`, 'utf8');
  assertSameFiles(walkFiles(plan.scratch), plan.preSpawnFiles, scratch);

  const invocationStartedAt = now();
  const execution = spawn(codexIdentityBefore.path, plan.codexArgs, {
    cwd: plan.scratch,
    input: plan.payload,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (execution.error) throw execution.error;
  if (execution.status !== 0) {
    const structuredOutput = String(execution.stdout || '').trim();
    const diagnostic = structuredOutput
      ? `; structured stdout: ${structuredOutput.slice(-4096)}`
      : '';
    throw new Error(
      `Codex handoff failed with exit ${execution.status}${diagnostic}; scratch preserved at ${scratch}`,
    );
  }
  const executionJsonl = String(execution.stdout || '');
  writeFileSync(plan.paths['CODEX_EXECUTION.jsonl'], executionJsonl, 'utf8');
  assertSameFiles(walkFiles(plan.scratch), plan.postSpawnFiles, scratch);

  const executionReceipt = validateCodexExecutionStream(executionJsonl);
  const reportBytes = readFileSync(plan.paths['HANDOFF_REPORT.json']);
  const report = parseStrictReport(reportBytes, prepared, 'Codex handoff report');
  const messageReport = parseStrictReport(
    Buffer.from(executionReceipt.agentMessage),
    prepared,
    'Codex completed agent_message',
  );
  if (!isDeepStrictEqual(report, messageReport)) {
    throw new Error('Codex handoff report and completed agent_message differ');
  }
  const protectedGeneratedImage = readProtectedGeneratedImage({
    threadId: executionReceipt.threadId,
    codexHome,
    preexistingThreadIds: preexistingThreadSnapshot.ids,
    invocationStartedAt,
  }, operations.protectedRead || {});
  const candidate = validateGeneratedCandidate(protectedGeneratedImage.bytes, prepared.cropBytes);
  writeFileSync(plan.paths['reference.png'], protectedGeneratedImage.bytes);
  if (hashBytes(readFileSync(plan.paths['reference.png'])) !== protectedGeneratedImage.sha256) {
    throw new Error('scratch reference hash differs from the protected generated PNG');
  }

  const codexIdentityAfter = inspectExecutable(codexIdentityBefore.path);
  assertCodexUnchanged(codexIdentityBefore, codexIdentityAfter);
  writeFileSync(
    plan.paths['REFERENCE_PROVENANCE.md'],
    provenanceBytes(
      prepared,
      report,
      executionReceipt,
      protectedGeneratedImage,
      candidate,
      codexIdentityBefore,
      preexistingThreadSnapshot,
    ),
  );
  const allBundleFiles = plan.bundleFiles.map(([, path]) => path).sort();
  assertSameFiles(walkFiles(plan.scratch), allBundleFiles, scratch);
  const publishedHashes = publishValidatedOutputs(plan, prepared, operations.publish || {});
  if (publishedHashes['reference.png'] !== protectedGeneratedImage.sha256) {
    throw new Error('published reference hash differs from the protected generated PNG');
  }
  rmSync(scratch, { recursive: true, force: true });

  return outputRecord(prepared, 'complete', {
    command: codexIdentityBefore.path,
    codexExecutableSha256: codexIdentityBefore.sha256,
    codexVersion: codexIdentityBefore.version,
    generatedWidth: candidate.width,
    generatedHeight: candidate.height,
    generatedBytes: candidate.bytes,
    generatedPixelSha256: candidate.decodedPixelSha256,
    codexThreadId: executionReceipt.threadId,
    codexEventStreamSha256: executionReceipt.eventStreamSha256,
    protectedGeneratedImage: protectedGeneratedImage.path,
    protectedGeneratedImageSha256: protectedGeneratedImage.sha256,
    protectedArtifactFreshness: protectedGeneratedImage.freshness,
    preexistingGeneratedThreadCount: preexistingThreadSnapshot.count,
    preexistingGeneratedThreadIdsSha256: preexistingThreadSnapshot.sha256,
    isolatedScratchRemoved: true,
    publishedHashes,
  });
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  try {
    const record = runComponentReferenceHandoff(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`imagegen-reference-handoff: FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
