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
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
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
assert(NEW_GAME.fittedModules.includes('wpn_pulse_laser_s'), 'new-game source loadout must explicitly fit the starter weapon');
const starterFittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []);
assert(starterFittings.includes('wpn_pulse_laser_s'), 'starter fitting resolver must place Pulse Laser S in the weapon slot');
const spec = makeShipEntitySpec(NEW_GAME.shipId, { isPlayer: true, player, fittings: starterFittings });
assert.equal(spec.data.weapons[0].defId, 'wpn_pulse_laser_s', 'fresh Kestrel should still get starter weapon');
assert.equal(spec.data.weapons[0].name, 'Pulse Laser S', 'starter weapon must be surfaced by name');

const camera = read('src/render/camera.js');
assert(camera.includes('zoomFactor = 0.90'), 'combat camera should push in, not zoom out');
assert(!camera.includes('zoomFactor = Math.max(zoomFactor, 1.15)'), 'old combat zoom-out must not return');
assert(camera.includes('nearest threat') || camera.includes('nearestThreat'), 'camera should compose player plus threat');
assert(camera.includes('resolveTetherCompositionAnchor'), 'camera should compose active player tethers/payloads');
assert(camera.includes('hasTetherFocus'), 'camera zoom should treat active tether composition as a first-class state');

const onboarding = read('src/systems/onboarding.js');
for (const forbidden of ['turn rocks into credits', 'Reach the starter claim', 'Mine and collect 3 units of ore', 'ORE:', 'mineable rocks', 'RMB samples ore']) {
  assert(!onboarding.includes(forbidden), `onboarding must not keep mining-first copy: ${forbidden}`);
}
assert(onboarding.includes('Contract 47-A'), 'onboarding intro should carry 47-A cold-open intent');
assert(onboarding.includes('Pulse Laser S'), 'onboarding should expose the starter weapon');
assert(onboarding.includes('SAMPLE:'), 'onboarding progress should frame the first collection as a 47-A sample');

const contract = read('docs/Spec/47A_SLICE_CONTRACT.md');
assert(contract.includes('47-A: The Mass Discrepancy'), 'slice contract should name the target encounter');
assert(contract.includes('First meaningful steering input within 5s'), 'slice contract should freeze proof metrics');
const packageJson = json('package.json');
assert.equal(packageJson.scripts['check:47a:tactics'], 'node scripts/check-47a-tactics.mjs',
  'package scripts should expose the 47-A tactic acceptance gate');
assert(packageJson.scripts.check.includes('npm run check:47a:tactics'),
  'full check should include the 47-A tactic acceptance gate');
assert.equal(packageJson.scripts['check:47a:live-branch'], 'node scripts/check-47a-live-branch-predicate.mjs',
  'package scripts should expose the 47-A no-branch live predicate gate');
assert(packageJson.scripts.check.includes('npm run check:47a:live-branch'),
  'full check should include the 47-A no-branch live predicate gate');
assert.equal(packageJson.scripts['check:47a:counterplay'], 'node scripts/check-47a-counter-tether-live.mjs',
  'package scripts should expose the 47-A live counterplay acceptance gate');
assert(packageJson.scripts.check.includes('npm run check:47a:counterplay'),
  'full check should include the 47-A live counterplay acceptance gate');
assert.equal(packageJson.scripts['check:47a:death-retry'], 'node scripts/check-47a-death-retry.mjs',
  'package scripts should expose the 47-A death-to-retry acceptance gate');
assert(packageJson.scripts.check.includes('npm run check:47a:death-retry'),
  'full check should include the 47-A death-to-retry acceptance gate');
assert.equal(packageJson.scripts['check:slice-scope'], 'node scripts/check-slice-scope.mjs',
  'package scripts should expose the 47-A slice-scope guardrail');
assert(packageJson.scripts.check.includes('npm run check:slice-scope'),
  'full check should include the 47-A slice-scope guardrail');
const counterplayGate = read('scripts/check-47a-counter-tether-live.mjs');
for (const marker of ['--tactical-ai', '--counter-tether-probe', 'action_dash', 'action_cut', "controllerId === 'sg06'"]) {
  assert(counterplayGate.includes(marker), `47-A counterplay gate must keep live SG-06/SG-03 proof marker: ${marker}`);
}
const liveBranchGate = read('scripts/check-47a-live-branch-predicate.mjs');
for (const marker of ['assertNoScenarioBranch', 'live-state', 'official_recovery_tug', 'kessler_handoff_beacon', 'RELOAD_AFTER_LIVE_EVIDENCE_TICK']) {
  assert(liveBranchGate.includes(marker), `47-A live branch gate must keep no-branch predicate proof marker: ${marker}`);
}

const tape = json('test/47a.inputs.json');
const envelope = json('test/47a.telemetry.expected.json');
const scenarioContract = json('src/data/scenarios/47a.scenario.json');
const expectedScenarioActorCount = scenarioContract.actors.length;
const evidenceReport = validateEvidenceCorpus([
  { path: 'test/47a.inputs.json', data: tape },
  { path: 'test/47a.telemetry.expected.json', data: envelope },
  { path: 'src/data/scenarios/47a.scenario.json', data: scenarioContract },
]);
assert(evidenceReport.ok, evidenceReport.issues.map(formatEvidenceIssue).join('\n'));
assertRejectsMalformedEvidence();

assert.equal(tape.seed, 47, 'golden input tape should pin seed 47');
assert(Array.isArray(tape.frames) && tape.frames.length >= 4, 'golden input tape should contain frames');
for (let i = 1; i < tape.frames.length; i++) {
  assert(tape.frames[i].tick > tape.frames[i - 1].tick, 'golden input tape ticks should increase');
}

for (const family of ['flight', 'combat', 'economy', 'story', 'ai', 'camera', 'tether']) {
  assert(envelope.requiredEventFamilies.includes(family), `telemetry envelope missing ${family}`);
}
assert(envelope.requiredEventFamilies.includes('scenario'), 'telemetry envelope missing scenario');
assert(envelope.requiredEventFamilies.includes('presentation'), 'telemetry envelope missing presentation');
assert.equal(envelope.sourceScenarioContract, 'src/data/scenarios/47a.scenario.json',
  'telemetry envelope should point at the canonical scenario contract');
for (const type of envelope.phase0ExpectedTraceTypes) {
  assert(DEFAULT_TRACE_EVENTS.includes(type), `event trace does not subscribe to expected type ${type}`);
}
for (const type of Object.keys(envelope.phase0ObservedTraceCounts)) {
  assert(DEFAULT_TRACE_EVENTS.includes(type), `observed trace count is not subscribed by event trace: ${type}`);
}
assert.equal(envelope.phase0ObservedTraceCounts['combat:fire'], 12, 'expected telemetry should pin observed combat fire count');
assert.equal(envelope.phase0ObservedTraceCounts['projectile:hit'], 12, 'expected telemetry should pin observed projectile hit count');
assert.equal(envelope.phase0ObservedTraceCounts['combat:damage'], 12, 'expected telemetry should pin observed combat damage count');
assert.equal(envelope.phase0ObservedTraceCounts['economy:tick'], 2, 'expected telemetry should pin observed economy tick count');
assert.equal(envelope.phase0ObservedTraceCounts['graffiti:show'], 1, 'expected telemetry should pin observed cold-start graffiti count');
assert.equal(envelope.phase0ObservedTraceCounts['comms:popup'], 2, 'expected telemetry should pin observed cold-start comms count');
assert.equal(envelope.phase0ObservedTraceCounts['presentation:cue'], 2, 'expected telemetry should pin SG-08 presentation cue count');
assert.equal(envelope.phase0ObservedTraceCounts['scenario:loaded'], 1, 'expected telemetry should pin scenario load count');
assert.equal(envelope.phase0ObservedTraceCounts['scenario:factsInitialized'], 1, 'expected telemetry should pin scenario fact initialization count');
assert.equal(envelope.phase0ObservedTraceCounts['scenario:actorBindings'], 1, 'expected telemetry should pin scenario actor-binding audit count');
assert.equal(envelope.phase0ObservedTraceCounts['scenario:beatEntered'], 1, 'expected telemetry should pin scenario beat entry count');
assert.equal(envelope.phase0ObservedTraceCounts['scenario:dialogueLine'], 1, 'expected telemetry should pin authored scenario dialogue execution');
assert.equal(envelope.phase0ObservedTraceCounts['tether:attached'], 1, 'expected telemetry should pin first Massline attach evidence');
assert(!Object.prototype.hasOwnProperty.call(envelope, 'acceptancePlaceholders'),
  'telemetry envelope must use acceptanceCriteria, not placeholder acceptance fields');
assert(envelope.acceptanceCriteria && typeof envelope.acceptanceCriteria === 'object' && !Array.isArray(envelope.acceptanceCriteria),
  'telemetry envelope must declare concrete acceptanceCriteria');
assert.equal(envelope.acceptanceCriteria.firstTetherAttachTickMax, 3600,
  'expected telemetry should require first Massline attach within 60s');
assert.equal(envelope.acceptanceCriteria.policyCompletionCountMin, scenarioContract.branches.length,
  'expected telemetry should require every authored branch policy/tactic outcome');
assert.equal(envelope.acceptanceCriteria.enemyCounterTetherBehaviorCountMin, 2,
  'expected telemetry should require both enemy counter-tether behaviors');
assert.equal(envelope.acceptanceCriteria.deathToRetryTickMax, 360,
  'expected telemetry should require failure-to-retry within 6s at 60Hz');
assert.equal(envelope.acceptanceCriteria.authoritativeHash,
  '7d0bf402f41ce91ef94e7764c33dfe655e190bee93749d13b2c267cf2a4555c6',
  'expected telemetry envelope should pin the current Phase 0 replay hash');
assert.equal(envelope.acceptanceCriteria.canonicalLongBranchId, 'escape_with_evidence',
  'expected telemetry should pin the canonical long-run branch outcome');
assert.equal(envelope.acceptanceCriteria.canonicalLongBranchFactChanges, 3,
  'expected telemetry should pin the canonical long-run branch fact-change count');

const canonicalLongBranch = scenarioContract.branches.find((branch) =>
  branch.id === envelope.acceptanceCriteria.canonicalLongBranchId);
assert(canonicalLongBranch, 'canonical long-run branch must exist in the scenario contract');
const longBranchInspect = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf-sim.mjs',
  'inspect',
  '47a',
  '--seed',
  '47',
  '--tick',
  '36120',
  '--inputs',
  'test/47a.inputs.json',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
assert.equal(longBranchInspect.scenarioContract.activeBeatId, 'resolution_branch',
  'canonical long run should reach the 47-A resolution beat');
assert.equal(longBranchInspect.scenarioContract.resolvedBranchId, canonicalLongBranch.id,
  'canonical long run should resolve the pinned branch');
assert.equal(longBranchInspect.metrics.scenarioBranchResolved, 1,
  'canonical long run should emit one branch resolution');
assert.equal(longBranchInspect.metrics.scenarioFactChanged, envelope.acceptanceCriteria.canonicalLongBranchFactChanges,
  'canonical long run should emit the pinned branch fact-change count');
assert.equal(longBranchInspect.traceSummary.types['scenario:branchResolved'], 1,
  'canonical long run should trace branch resolution evidence');
assert.deepEqual(longBranchInspect.scenarioContract.resolution.lifecycle, canonicalLongBranch.lifecycle,
  'canonical long run should preserve authored branch lifecycle text');
for (const effect of canonicalLongBranch.worldFactEffects) {
  assert.equal(longBranchInspect.scenarioContract.factValues[effect.factId], effect.value,
    `canonical long run should set ${effect.factId} to ${effect.value}`);
}

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
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(inspect.schema, 'spaceface.sfSimInspectResult.v1', 'sf-sim inspect should emit a versioned inspect result');
assert.equal(inspect.command, 'inspect', 'sf-sim inspect command should round-trip in JSON');
assert.equal(inspect.tick, 360, 'sf-sim inspect should report the requested tick');
assert.equal(inspect.snapshot && inspect.snapshot.schema, 'spaceface.simSnapshot.v1', 'sf-sim inspect should include a canonical snapshot');
assert.equal(inspect.snapshot.tick, 360, 'sf-sim inspect snapshot should be from the requested tick');
assert(inspect.sha256 && /^[a-f0-9]{64}$/.test(inspect.sha256), 'sf-sim inspect should include a snapshot hash');
assert((inspect.traceSummary.types['combat:fire'] || 0) > 0, 'sf-sim inspect should expose trace evidence up to the inspected tick');
for (const systemName of ['actions', 'missions', 'story']) {
  assert(inspect.metrics.systems.includes(systemName), `sf-sim should run the real ${systemName} system`);
}
assert(inspect.snapshot.missions && inspect.snapshot.missions.nextId === 1, 'sf-sim snapshot should include mission state');
assert(inspect.snapshot.story && inspect.snapshot.story.beatIndex === 0, 'sf-sim snapshot should include story state');
assert.equal(inspect.snapshot.scenario.active.id, 'scenario.47a.mass-discrepancy',
  'sf-sim snapshot should include scenario runtime state');
assert.equal(inspect.snapshot.scenario.active.activeBeatId, 'drop_wreck_field',
  'sf-sim snapshot should include the active 47-A beat');
assert.deepEqual(inspect.snapshot.scenario.enteredBeatIds, ['drop_wreck_field'],
  'sf-sim snapshot should not claim later 47-A beats');
assert.equal(inspect.scenarioContract.status, 'phase0-live', 'sf-sim inspect should load the live Phase 0 scenario timing contract');
assert.equal(inspect.scenarioContract.boundActorCount, expectedScenarioActorCount, 'sf-sim inspect should bind the complete 47-A actor cast');
assert.deepEqual(inspect.scenarioContract.unresolvedActorIds, [],
  'sf-sim inspect should not leave required 47-A actors unresolved');
assert.equal(inspect.snapshot.scenario.actorBindings.contact_kessler.entityId, null,
  'Kessler should bind as a narrative contact, not a physics entity');
assert.equal(inspect.snapshot.scenario.actorBindings.contact_kessler.source.kind, 'narrativeFigure',
  'Kessler should bind through canonical narrative figure data');
assert(inspect.snapshot.scenario.actorBindings.kessler_handoff_beacon.entityId != null,
  'Kessler handoff beacon should bind as a physical scenario handoff zone');
const inspectPayload = inspect.snapshot.entities.find((entity) => entity.data && entity.data.scenarioActorId === 'evidence_spindle_47a');
assert(inspectPayload, 'sf-sim inspect snapshot should include the 47-A evidence spindle payload');
assert.equal(inspectPayload.type, 'payload', 'evidence spindle should use the payload entity primitive');
assert(inspect.snapshot.physics.ready, 'sf-sim inspect should report the dynamic physics backend ready');
assert(inspect.snapshot.physics.bodies.some((body) => body.id === inspectPayload.id),
  'evidence spindle should have an SG-02 dynamic physics body');
assert((inspect.traceSummary.types['graffiti:show'] || 0) > 0, 'sf-sim inspect should expose cold-start graffiti evidence');
assert((inspect.traceSummary.types['comms:popup'] || 0) > 0, 'sf-sim inspect should expose cold-start comms evidence');
assert.equal(inspect.traceSummary.types['tether:attached'], envelope.phase0ObservedTraceCounts['tether:attached'],
  'sf-sim inspect should expose Massline attach evidence');

const sfInspect = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'inspect',
  '47a',
  '--seed',
  '47',
  '--tick',
  '360',
  '--inputs',
  'test/47a.inputs.json',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfInspect.schema, 'spaceface.sfCliResult.v1', 'canonical sf inspect should emit a versioned CLI result');
assert.equal(sfInspect.ok, true, 'canonical sf inspect should report a successful delegated inspect run');
assert.equal(sfInspect.command, 'inspect', 'canonical sf inspect should preserve its command name');
assert.equal(sfInspect.forwardedCommand, 'inspect', 'canonical sf inspect should delegate to the inspect sim command');
assert.equal(sfInspect.result.schema, 'spaceface.sfSimInspectResult.v1', 'canonical sf inspect should wrap the versioned inspect result');
assert.equal(sfInspect.result.tick, 360, 'canonical sf inspect should expose the requested tick');

const trace = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf-sim.mjs',
  'trace',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--events',
  'scenario.*,tether.*,combat.*,story.*,presentation.*',
  '--limit',
  '200',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(trace.schema, 'spaceface.sfSimTraceResult.v1', 'sf-sim trace should emit a versioned trace result');
assert.equal(trace.command, 'trace', 'sf-sim trace command should round-trip in JSON');
assert.equal(trace.sha256, envelope.acceptanceCriteria.authoritativeHash, 'sf-sim trace should preserve the authoritative replay hash');
assert(trace.trace && trace.trace.schema === 'spaceface.eventTrace.v1', 'sf-sim trace should include deterministic event records');
assert(trace.trace.subscribedEvents.includes('combat:fire'), 'sf-sim trace should resolve combat.* event filters');
assert(trace.trace.subscribedEvents.includes('scenario:loaded'), 'sf-sim trace should resolve scenario.* event filters');
assert(trace.trace.subscribedEvents.includes('tether:attached'), 'sf-sim trace should resolve tether.* event filters');
assert(trace.trace.subscribedEvents.includes('story:beatAdvanced'), 'sf-sim trace should resolve story.* event filters');
assert(trace.trace.subscribedEvents.includes('presentation:cue'), 'sf-sim trace should resolve presentation.* event filters');
assert.equal(trace.traceSummary.types['combat:fire'], envelope.phase0ObservedTraceCounts['combat:fire'],
  'sf-sim trace should expose filtered combat fire evidence');
assert.equal(trace.traceSummary.types['tether:attached'], envelope.phase0ObservedTraceCounts['tether:attached'],
  'sf-sim trace should expose filtered Massline attach evidence');
assert.equal(trace.traceSummary.types['scenario:loaded'], envelope.phase0ObservedTraceCounts['scenario:loaded'],
  'sf-sim trace should expose scenario contract load evidence');
assert.equal(trace.traceSummary.types['scenario:dialogueLine'], envelope.phase0ObservedTraceCounts['scenario:dialogueLine'],
  'sf-sim trace should expose authored scenario dialogue evidence');
assert.equal(trace.traceSummary.types['presentation:cue'], envelope.phase0ObservedTraceCounts['presentation:cue'],
  'sf-sim trace should expose SG-08 cue evidence');
assert.equal(trace.scenarioContract.activeBeatId, 'drop_wreck_field',
  'sf-sim trace should expose the first active scenario beat');
assert.equal(trace.scenarioContract.boundActorCount, expectedScenarioActorCount, 'sf-sim trace should bind the complete 47-A actor cast');
assert.deepEqual(trace.scenarioContract.unresolvedActorIds, [],
  'sf-sim trace should not leave required 47-A actors unresolved');
assert(trace.combatTrace && trace.combatTrace.schemaVersion === 1, 'sf-sim trace should include the SG-03 combat trace');
assert(trace.combatTrace.digest && /^[a-f0-9]{8}$/.test(trace.combatTrace.digest), 'SG-03 combat trace should include a deterministic digest');
assert((trace.combatTraceSummary.kinds['damage.routed'] || 0) > 0, 'SG-03 combat trace should expose routed damage events');
assert((trace.combatTraceSummary.kinds['attachment.created'] || 0) === 1, 'SG-03 combat trace should expose one attachment creation');
assert(trace.metrics.systems.includes('actions'), 'sf-sim trace should run the real action system');
assert(trace.metrics.firstTetherAttachTick <= envelope.acceptanceCriteria.firstTetherAttachTickMax,
  'sf-sim trace should attach the Massline within the expected ceiling');

const sfTrace = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'trace',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--events',
  'scenario.*,tether.*,combat.*,story.*,presentation.*',
  '--limit',
  '200',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfTrace.schema, 'spaceface.sfCliResult.v1', 'canonical sf trace should emit a versioned CLI result');
assert.equal(sfTrace.ok, true, 'canonical sf trace should report a successful delegated trace run');
assert.equal(sfTrace.command, 'trace', 'canonical sf trace should preserve its command name');
assert.equal(sfTrace.forwardedCommand, 'trace', 'canonical sf trace should delegate to the trace sim command');
assert.equal(sfTrace.result.schema, 'spaceface.sfSimTraceResult.v1', 'canonical sf trace should wrap the versioned trace result');
assert.equal(sfTrace.result.sha256, envelope.acceptanceCriteria.authoritativeHash,
  'canonical sf trace should preserve the authoritative replay hash');
assert.equal(sfTrace.result.traceSummary.types['combat:fire'], envelope.phase0ObservedTraceCounts['combat:fire'],
  'canonical sf trace should expose filtered combat fire evidence');
assert.equal(sfTrace.result.traceSummary.types['tether:attached'], envelope.phase0ObservedTraceCounts['tether:attached'],
  'canonical sf trace should expose filtered Massline attach evidence');
assert.equal(sfTrace.result.traceSummary.types['scenario:loaded'], envelope.phase0ObservedTraceCounts['scenario:loaded'],
  'canonical sf trace should expose scenario contract load evidence');
assert.equal(sfTrace.result.traceSummary.types['scenario:dialogueLine'], envelope.phase0ObservedTraceCounts['scenario:dialogueLine'],
  'canonical sf trace should expose authored scenario dialogue evidence');
assert.equal(sfTrace.result.traceSummary.types['presentation:cue'], envelope.phase0ObservedTraceCounts['presentation:cue'],
  'canonical sf trace should expose SG-08 cue evidence');

const profile = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf-sim.mjs',
  'profile',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--expect',
  'test/47a.telemetry.expected.json',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(profile.schema, 'spaceface.sfSimProfileResult.v1', 'sf-sim profile should emit a versioned profile result');
assert.equal(profile.command, 'profile', 'sf-sim profile command should round-trip in JSON');
assert.equal(profile.timingAuthoritative, false, 'sf-sim profile timing must not become authoritative replay state');
assert.equal(profile.sha256, envelope.acceptanceCriteria.authoritativeHash, 'sf-sim profile should preserve the authoritative replay hash');
assert(profile.profile && profile.profile.schema === 'spaceface.simProfile.v1', 'sf-sim profile should include a versioned timing payload');
assert.equal(profile.profile.timingAuthoritative, false, 'profile timing payload should be diagnostic only');
assert.equal(profile.profile.replayHashAuthoritative, true, 'profile should identify the replay hash as authoritative');
assert(profile.profile.elapsedMs >= 0, 'profile should report non-negative elapsed time');
assert(profile.profile.simMsPerTick >= 0, 'profile should report non-negative sim cost per tick');
assert(profile.profile.ticksPerSecond == null || profile.profile.ticksPerSecond > 0,
  'profile should report a positive tick rate when timing resolution permits');
assert.equal(profile.profile.eventCount, profile.traceSummary.total, 'profile event count should mirror deterministic trace summary');
assert.equal(profile.profile.entityCount, profile.metrics.finalEntityCount, 'profile entity count should mirror deterministic metrics');
assert(profile.profile.systems.includes('actions'), 'sf-sim profile should run the real action system');

const sfProfile = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'profile',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--expect',
  'test/47a.telemetry.expected.json',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfProfile.schema, 'spaceface.sfCliResult.v1', 'canonical sf profile should emit a versioned CLI result');
assert.equal(sfProfile.ok, true, 'canonical sf profile should report a successful delegated sim run');
assert.equal(sfProfile.command, 'profile', 'canonical sf profile should preserve its command name');
assert.equal(sfProfile.forwardedCommand, 'profile', 'canonical sf profile should delegate to the profile sim command');
assert.equal(sfProfile.result.schema, 'spaceface.sfSimProfileResult.v1', 'canonical sf profile should wrap the versioned sim result');
assert.equal(sfProfile.result.sha256, envelope.acceptanceCriteria.authoritativeHash,
  'canonical sf profile should preserve the authoritative replay hash');

const sfReplayVerify = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'replay',
  'verify',
  'test/47a.inputs.json',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--expect',
  'test/47a.telemetry.expected.json',
  '--hash',
  '--repeat',
  '20',
  '--reload-at',
  '600',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfReplayVerify.schema, 'spaceface.sfCliResult.v1', 'canonical sf replay verify should emit a versioned CLI result');
assert.equal(sfReplayVerify.ok, true, 'canonical sf replay verify should report successful replay verification');
assert.equal(sfReplayVerify.command, 'replay', 'canonical sf replay verify should preserve its command name');
assert.equal(sfReplayVerify.action, 'verify', 'canonical sf replay verify should preserve its action');
assert.equal(sfReplayVerify.forwardedCommand, 'run', 'canonical sf replay verify should delegate to the repeat-checking run command');
assert.equal(sfReplayVerify.result.schema, 'spaceface.sfSimResult.v1', 'canonical sf replay verify should wrap the sim run output');
assert.equal(sfReplayVerify.result.repeat, 20, 'canonical sf replay verify should enforce the golden repeat count');
assert.equal(sfReplayVerify.result.sha256, envelope.acceptanceCriteria.authoritativeHash,
  'canonical sf replay verify should preserve the authoritative replay hash');
assert.equal(sfReplayVerify.result.baselineSha256, sfReplayVerify.result.sha256,
  'canonical sf replay verify should preserve reload parity against baseline');

const sfDiffReplay = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'diff',
  'replay',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--expect',
  'test/47a.telemetry.expected.json',
  '--reload-at',
  '600',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfDiffReplay.schema, 'spaceface.sfCliResult.v1', 'canonical sf diff replay should emit a versioned CLI result');
assert.equal(sfDiffReplay.ok, true, 'canonical sf diff replay should report clean replay parity');
assert.equal(sfDiffReplay.command, 'diff', 'canonical sf diff replay should preserve its command name');
assert.equal(sfDiffReplay.diffKind, 'replay', 'canonical sf diff replay should preserve its diff kind');
assert.equal(sfDiffReplay.forwardedCommand, 'compare', 'canonical sf diff replay should delegate to the compare sim command');
assert.equal(sfDiffReplay.result.schema, 'spaceface.sfSimCompareResult.v1', 'canonical sf diff replay should wrap compare output');
assert.deepEqual(sfDiffReplay.result.comparison.diffs, [], 'canonical sf diff replay should expose no replay diffs');

const sfValidateAsset = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf.mjs',
  'validate',
  'asset',
  'assets/ships/kestrel/kestrel_reference.glb',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(sfValidateAsset.schema, 'spaceface.sfCliResult.v1', 'canonical sf validate asset should emit a versioned CLI result');
assert.equal(sfValidateAsset.ok, true, 'canonical sf validate asset should report a valid hero asset');
assert.equal(sfValidateAsset.command, 'validate', 'canonical sf validate asset should preserve its command name');
assert.equal(sfValidateAsset.validateKind, 'asset', 'canonical sf validate asset should classify asset validation');
assert.equal(sfValidateAsset.result.schema, 'spaceface.assetValidationResult.v1', 'asset validation should emit a versioned result');
assert.equal(sfValidateAsset.result.assetPath, 'assets/ships/kestrel/kestrel_reference.glb', 'asset validation should report the validated path');
assert.equal(sfValidateAsset.result.manifestPath, 'assets/ships/kestrel/kestrel_manifest.json', 'asset validation should report the manifest path');
assert.equal(sfValidateAsset.result.issueCount, 0, 'asset validation should expose zero issues');
assert.equal(sfValidateAsset.result.assetId, 'SF_K0_KESTREL_BORROWED_TIME', 'asset validation should preserve Kestrel asset id');
assert.equal(sfValidateAsset.result.metrics.triangles, 1844, 'asset validation should expose Kestrel triangle count');
assert.equal(sfValidateAsset.result.metrics.nodes, 64, 'asset validation should expose Kestrel node count');
assert(sfValidateAsset.result.checks.some((check) => check.rule === 'sockets.glbRequired' && check.ok),
  'asset validation should prove required socket nodes exist in the GLB');

const compare = JSON.parse(execFileSync(process.execPath, [
  'scripts/sf-sim.mjs',
  'compare',
  '47a',
  '--seed',
  '47',
  '--ticks',
  '720',
  '--inputs',
  'test/47a.inputs.json',
  '--expect',
  'test/47a.telemetry.expected.json',
  '--reload-at',
  '600',
  '--physics-backend',
  'rapier-dynamic',
], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
assert.equal(compare.schema, 'spaceface.sfSimCompareResult.v1', 'sf-sim compare should emit a versioned compare result');
assert.equal(compare.command, 'compare', 'sf-sim compare command should round-trip in JSON');
assert.equal(compare.ok, true, 'sf-sim compare should report clean replay parity');
assert.equal(compare.comparison && compare.comparison.hashEqual, true, 'sf-sim compare should prove reload hash parity');
assert.deepEqual(compare.comparison.diffs, [], 'sf-sim compare should emit no diffs for the golden tape');

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
    acceptanceCriteria: { cleanRunCountRequired: 0 },
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
