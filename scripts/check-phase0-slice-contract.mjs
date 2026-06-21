import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';

import { drawSeeded, hash32 } from '../src/core/rng.js';
import { DEFAULT_TRACE_EVENTS } from '../src/core/eventTrace.js';
import {
  validateEvidenceCorpus,
  validateEvidenceDocument,
  formatEvidenceIssue,
} from '../src/contracts/evidenceSchemas.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function json(rel) {
  return JSON.parse(read(rel));
}

for (const rel of ['src/systems/story.js', 'src/systems/traffic.js', 'src/systems/intervention.js']) {
  assert(!read(rel).includes('Math.random'), `${rel} must not use Math.random in authoritative flow`);
}
assert(!read('src/systems/story.js').includes('setTimeout'), 'story scheduling must use sim-time, not wall-clock timers');

const allowedRandomFiles = new Map([
  ['src/main.js', 'boot seed generation before an explicit run seed exists'],
  ['src/audio/synth.js', 'cosmetic procedural noise buffer'],
  ['src/audio/audioSystem.js', 'cosmetic audio variation'],
  ['src/render/camera.js', 'cosmetic camera shake offset'],
  ['src/render/starfield.js', 'cosmetic starfield generation'],
  ['src/render/vfx.js', 'cosmetic particle variation'],
  ['src/systems/telemetry.js', 'local telemetry session id only'],
  ['src/ui/floatingText.js', 'cosmetic floating text drift'],
]);
const randomSites = activeMathRandomSites('src');
for (const site of randomSites) {
  assert(allowedRandomFiles.has(site.rel), `Unclassified Math.random site: ${site.rel}:${site.line}`);
}
for (const rel of allowedRandomFiles.keys()) {
  assert(read('docs/Spec/PHASE0_AUTHORITY_AUDIT.md').includes(rel), `Authority audit must classify ${rel}`);
}

const a = { rngSeed: hash32(47, 'phase0') };
const b = { rngSeed: hash32(47, 'phase0') };
const seqA = [drawSeeded(a, 'rngSeed', 1), drawSeeded(a, 'rngSeed', 1), drawSeeded(a, 'rngSeed', 1)];
const seqB = [drawSeeded(b, 'rngSeed', 1), drawSeeded(b, 'rngSeed', 1), drawSeeded(b, 'rngSeed', 1)];
assert.deepEqual(seqB, seqA, 'serializable RNG stream should replay for same seed');
assert.notEqual(a.rngSeed, hash32(47, 'phase0'), 'serializable RNG seed should advance');

const player = {
  efficiencyMods: {
    miningYieldMult: 1,
    shieldRegenMult: 1,
    energyRegenMult: 1,
    cargoCapMult: 1,
    tradeFeeMult: 1,
  },
};
const spec = makeShipEntitySpec(NEW_GAME.shipId, { isPlayer: true, player, fittings: [] });
assert.equal(spec.data.weapons[0].defId, 'wpn_pulse_laser_s', 'fresh Kestrel should still get starter weapon');
assert.equal(spec.data.weapons[0].name, 'Pulse Laser S', 'starter weapon must be surfaced by name');

const camera = read('src/render/camera.js');
assert(camera.includes('zoomFactor = 0.90'), 'combat camera should push in, not zoom out');
assert(!camera.includes('zoomFactor = Math.max(zoomFactor, 1.15)'), 'old combat zoom-out must not return');
assert(camera.includes('nearest threat') || camera.includes('nearestThreat'), 'camera should compose player plus threat');

const onboarding = read('src/systems/onboarding.js');
for (const forbidden of ['turn rocks into credits', 'Reach the starter claim', 'Mine and collect 3 units of ore']) {
  assert(!onboarding.includes(forbidden), `onboarding must not keep mining-first copy: ${forbidden}`);
}
assert(onboarding.includes('Contract 47-A'), 'onboarding intro should carry 47-A cold-open intent');
assert(onboarding.includes('Pulse Laser S'), 'onboarding should expose the starter weapon');

const contract = read('docs/Spec/47A_SLICE_CONTRACT.md');
assert(contract.includes('47-A: The Mass Discrepancy'), 'slice contract should name the target encounter');
assert(contract.includes('First meaningful steering input within 5s'), 'slice contract should freeze proof metrics');

const tape = json('test/47a.inputs.json');
const envelope = json('test/47a.telemetry.expected.json');
const evidenceReport = validateEvidenceCorpus([
  { path: 'test/47a.inputs.json', data: tape },
  { path: 'test/47a.telemetry.expected.json', data: envelope },
]);
assert(evidenceReport.ok, evidenceReport.issues.map(formatEvidenceIssue).join('\n'));
assertRejectsMalformedEvidence();

assert.equal(tape.seed, 47, 'golden input tape should pin seed 47');
assert(Array.isArray(tape.frames) && tape.frames.length >= 4, 'golden input tape should contain frames');
for (let i = 1; i < tape.frames.length; i++) {
  assert(tape.frames[i].tick > tape.frames[i - 1].tick, 'golden input tape ticks should increase');
}

for (const family of ['flight', 'combat', 'economy', 'story', 'ai', 'camera']) {
  assert(envelope.requiredEventFamilies.includes(family), `telemetry envelope missing ${family}`);
}
for (const type of envelope.phase0ExpectedTraceTypes) {
  assert(DEFAULT_TRACE_EVENTS.includes(type), `event trace does not subscribe to expected type ${type}`);
}
for (const type of Object.keys(envelope.phase0ObservedTraceCounts)) {
  assert(DEFAULT_TRACE_EVENTS.includes(type), `observed trace count is not subscribed by event trace: ${type}`);
}
assert.equal(envelope.phase0ObservedTraceCounts['combat:fire'], 12, 'expected telemetry should pin observed combat fire count');
assert.equal(envelope.phase0ObservedTraceCounts['projectile:hit'], 10, 'expected telemetry should pin observed projectile hit count');
assert.equal(envelope.phase0ObservedTraceCounts['combat:damage'], 10, 'expected telemetry should pin observed combat damage count');
assert.equal(envelope.phase0ObservedTraceCounts['economy:tick'], 2, 'expected telemetry should pin observed economy tick count');
assert.equal(envelope.acceptancePlaceholders.authoritativeHash,
  'c4087e90300eea0303e0b8553af15094b75f7611e54f1f52648fe42712986f46',
  'expected telemetry envelope should pin the current Phase 0 replay hash');

const balanceSim = read('scripts/balance-sim.mjs');
for (const helper of [
  'economySpotPriceForRole',
  'droneGrossCrPerMin',
  'outpostGrossCrPerMin',
  'passiveCapPerMinForTier',
  'traderProfitPerCycle',
]) {
  assert(balanceSim.includes(helper), `balance-sim must import/use production helper: ${helper}`);
}
for (const forbidden of [
  'ROLE_PRODUCE',
  'ROLE_CONSUME',
  'MULT_LO',
  'MULT_HI',
  'SPREAD = 0.08',
  'BASE_EQ_DEFAULT = 1000',
  're-implemented inline',
  'reimplemented inline',
  'active * bal.passiveCapFrac',
]) {
  assert(!balanceSim.includes(forbidden), `balance-sim must not carry shadow formula marker: ${forbidden}`);
}
assert(!/\b(?:economy|automation)\.js:\d+\b/.test(balanceSim), 'balance-sim should cite production helper names, not stale line numbers');

const inspect = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf-sim.mjs',
  'inspect',
  '47a',
  '--seed',
  '47',
  '--tick',
  '360',
  '--inputs',
  'test/47a.inputs.json',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(inspect.schema, 'spaceface.sfSimInspectResult.v1', 'sf-sim inspect should emit a versioned inspect result');
assert.equal(inspect.command, 'inspect', 'sf-sim inspect command should round-trip in JSON');
assert.equal(inspect.tick, 360, 'sf-sim inspect should report the requested tick');
assert.equal(inspect.snapshot && inspect.snapshot.schema, 'spaceface.simSnapshot.v1', 'sf-sim inspect should include a canonical snapshot');
assert.equal(inspect.snapshot.tick, 360, 'sf-sim inspect snapshot should be from the requested tick');
assert(inspect.sha256 && /^[a-f0-9]{64}$/.test(inspect.sha256), 'sf-sim inspect should include a snapshot hash');
assert((inspect.traceSummary.types['combat:fire'] || 0) > 0, 'sf-sim inspect should expose trace evidence up to the inspected tick');

console.log('Phase 0 slice contract checks OK');

function assertRejectsMalformedEvidence() {
  const badTape = {
    schema: 'spaceface.goldenInputTape.v1',
    id: 'bad',
    scenario: '47-A: The Mass Discrepancy',
    seed: 47,
    tickRate: 60,
    frames: [
      { tick: 0, input: { moveZ: 1, fire: false, boost: false, aimAngle: 0 } },
      { tick: 0, input: { moveZ: 2, surprise: true } },
    ],
  };
  const badEnvelope = {
    schema: 'spaceface.telemetryEnvelope.v1',
    id: 'bad-envelope',
    scenario: 'wrong',
    seed: 48,
    sourceInputTape: 'test/bad.inputs.json',
    requiredEventFamilies: ['flight'],
    phase0ExpectedTraceTypes: ['bad'],
    phase0ObservedTraceCounts: { 'bad': -1 },
    acceptancePlaceholders: { cleanRunCountRequired: 0 },
  };
  const tapeResult = validateEvidenceDocument(badTape, { file: 'bad.inputs.json' });
  const corpusResult = validateEvidenceCorpus([
    { path: 'test/bad.inputs.json', data: badTape },
    { path: 'test/bad.telemetry.expected.json', data: badEnvelope },
  ]);
  assert(!tapeResult.ok, 'malformed golden input tape should fail schema validation');
  assert(tapeResult.issues.some((issue) => issue.rule === 'order'), 'schema validation should catch duplicate/non-increasing ticks');
  assert(tapeResult.issues.some((issue) => issue.rule === 'unknownKey'), 'schema validation should catch unknown input fields');
  assert(!corpusResult.ok, 'malformed evidence corpus should fail schema validation');
  assert(corpusResult.issues.some((issue) => issue.rule === 'crossRef'), 'schema validation should catch envelope/tape cross-reference mismatches');
  assert(corpusResult.issues.some((issue) => issue.rule === 'count'), 'schema validation should catch invalid observed trace counts');
}

function activeMathRandomSites(relDir) {
  const root = resolve(ROOT, relDir);
  const out = [];
  walk(root, (abs) => {
    if (!/\.(js|mjs)$/.test(abs)) return;
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const lines = read(rel).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
      const code = lines[i].replace(/\/\/.*$/, '');
      if (code.includes('Math.random')) out.push({ rel, line: i + 1 });
    }
  });
  return out;
}

function walk(dir, visit) {
  for (const ent of readdirSync(dir)) {
    const abs = join(dir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, visit);
    else visit(abs);
  }
}
