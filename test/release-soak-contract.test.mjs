// Focused release-soak contract tests (Milestone 6 / SPEC2/08).
//
// Proves:
//   1. deterministic repeat (same seed → identical digest)
//   2. reload hash equality path
//   3. bounded growth guards
//   4. failure reporting (fail-closed injections)
//   5. --quick completion
//   6. no ambient process termination

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  RELEASE_SOAK_RECEIPT_SCHEMA,
  REQUIRED_PHASES,
  HEADLESS_BUDGETS,
  validateReceipt,
  detectMonotonicGrowth,
  assertStaticLauncherContracts,
  assertStaticTimeEffectsContracts,
  sha256Hex,
} from '../scripts/lib/releaseSoakReceipts.mjs';
import {
  runReleaseSoakSession,
  runReleaseSoakCampaign,
  createProcessRegistry,
  modeConfig,
  digestForCompare,
} from '../scripts/lib/releaseSoakSession.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHECK = path.join(ROOT, 'scripts', 'check-release-soak.mjs');

// ── schema / static ──────────────────────────────────────────────────────────

test('modeConfig exposes quick and full budgets', () => {
  const quick = modeConfig('quick');
  const full = modeConfig('full');
  assert.equal(quick.mode, 'quick');
  assert.equal(full.mode, 'full');
  assert.ok(quick.totalSimSeconds < 120, 'quick must stay CI-short');
  assert.ok(full.totalSimSeconds >= 30 * 60, 'full must cover ≥30 sim-minutes');
  assert.ok(full.totalSimSeconds <= 60 * 60, 'full must stay within 60 sim-minutes');
  for (const phase of REQUIRED_PHASES) {
    assert.ok(quick.phaseTicks[phase] > 0, `quick missing ticks for ${phase}`);
    assert.ok(full.phaseTicks[phase] > 0, `full missing ticks for ${phase}`);
  }
});

test('static launcher contracts pass without spawning a browser', () => {
  const result = assertStaticLauncherContracts(ROOT);
  assert.equal(result.pass, true, result.failures.join('; '));
});

test('static time-effects contracts pass', () => {
  const result = assertStaticTimeEffectsContracts(ROOT);
  assert.equal(result.pass, true, result.failures.join('; '));
});

// ── deterministic repeat ─────────────────────────────────────────────────────

test('same seed produces identical session digests (deterministic repeat)', () => {
  const a = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT });
  const b = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT });
  assert.equal(a.schema, RELEASE_SOAK_RECEIPT_SCHEMA);
  assert.equal(a.hash, b.hash, `digest mismatch:\n${JSON.stringify(digestForCompare(a), null, 2)}\nvs\n${JSON.stringify(digestForCompare(b), null, 2)}`);
  assert.equal(a.ticks, b.ticks);
  assert.deepEqual(a.eventCounts.byType, b.eventCounts.byType);
  assert.equal(a.pass, true, a.failures.join('; '));
  assert.equal(b.pass, true, b.failures.join('; '));
});

// ── save/reload equality ─────────────────────────────────────────────────────

test('save/reload path reports hash equivalence', () => {
  const receipt = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT });
  assert.equal(receipt.saveReload.performed, true, 'save/reload phase must run');
  assert.equal(receipt.saveReload.equivalence, true, `save/reload failed: ${JSON.stringify(receipt.saveReload)}`);
  assert.ok(receipt.saveReload.beforeHash, 'beforeHash required');
  assert.ok(receipt.saveReload.afterHash, 'afterHash required');
  assert.match(receipt.saveReload.beforeHash, /^[a-f0-9]{64}$/i);
});

// ── bounded growth ───────────────────────────────────────────────────────────

test('quick soak stays within entity/event ceilings', () => {
  const receipt = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT });
  assert.ok((receipt.eventCounts.total | 0) <= HEADLESS_BUDGETS.maxEventTotal);
  assert.ok((receipt.highWater.entityDrift | 0) <= HEADLESS_BUDGETS.maxEntitiesOverBaseline,
    `entity drift ${receipt.highWater.entityDrift}`);
  const mono = detectMonotonicGrowth(receipt.highWaterSamples || []);
  assert.equal(mono.length, 0, `unexpected monotonic growth: ${JSON.stringify(mono)}`);
  assert.equal(receipt.memory.claimsBrowserGpuFps, false);
  assert.equal(receipt.performance.claimsBrowserGpuFps, false);
});

test('detectMonotonicGrowth flags strictly rising series', () => {
  const samples = [
    { entities: 10, ships: 1, projectiles: 0, deferredEvents: 0 },
    { entities: 14, ships: 2, projectiles: 1, deferredEvents: 0 },
    { entities: 20, ships: 3, projectiles: 2, deferredEvents: 0 },
    { entities: 30, ships: 4, projectiles: 3, deferredEvents: 0 },
    { entities: 40, ships: 5, projectiles: 4, deferredEvents: 0 },
  ];
  const findings = detectMonotonicGrowth(samples);
  assert.ok(findings.some((f) => f.key === 'entities'), 'must flag entity ramp');
});

// ── failure reporting ────────────────────────────────────────────────────────

test('failure injection is fail-closed and reported', () => {
  const boom = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT, failInject: 'unhandled_error' });
  assert.equal(boom.pass, false, 'injected error must fail the receipt');
  assert.ok(boom.unhandledErrors.length >= 1);
  assert.ok(boom.failures.some((f) => /unhandled/i.test(f)));

  const saveFail = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT, failInject: 'save_divergence' });
  assert.equal(saveFail.pass, false);
  assert.equal(saveFail.saveReload.equivalence, false);
  assert.ok(saveFail.failures.some((f) => /save\/reload|divergence/i.test(f)));

  const growth = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT, failInject: 'growth' });
  assert.equal(growth.pass, false);
  assert.ok(growth.failures.some((f) => /entity|growth|monotonic/i.test(f)));
});

test('validateReceipt rejects GPU FPS claims and missing phases', () => {
  const good = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT });
  const ok = validateReceipt(good, { mode: 'quick' });
  assert.equal(ok.pass, true, ok.failures.join('; '));

  const forged = {
    ...good,
    memory: { ...good.memory, claimsBrowserGpuFps: true },
    pass: true,
    failures: [],
  };
  const badGpu = validateReceipt(forged, { mode: 'quick' });
  assert.equal(badGpu.pass, false);
  assert.ok(badGpu.failures.some((f) => /GPU FPS/i.test(f)));

  const missingPhase = {
    ...good,
    phasesCompleted: REQUIRED_PHASES.filter((p) => p !== 'death_recovery'),
    pass: true,
    failures: [],
  };
  const badPhase = validateReceipt(missingPhase, { mode: 'quick' });
  assert.equal(badPhase.pass, false);
  assert.ok(badPhase.failures.some((f) => /death_recovery/.test(f)));
});

// ── phase coverage ───────────────────────────────────────────────────────────

test('quick session completes all required phases and mode transitions', () => {
  const receipt = runReleaseSoakSession({ seed: 109, mode: 'quick', root: ROOT });
  for (const phase of REQUIRED_PHASES) {
    assert.ok(receipt.phasesCompleted.includes(phase), `missing phase ${phase}`);
  }
  assert.ok(receipt.modeTransitions.length >= 2, 'must record mode transitions');
  assert.ok(receipt.modeTransitions.some((m) => m.reason === 'new_game'));
  assert.ok(receipt.modeTransitions.some((m) => m.reason === 'dock' || m.to === 'docked'));
  assert.ok(receipt.ticks > 100);
});

// ── process ownership ────────────────────────────────────────────────────────

test('session does not spawn children or kill ambient processes', () => {
  const registry = createProcessRegistry();
  // Simulate an ambient foreign PID the soak must never claim.
  registry.recordKill(999001);
  assert.equal(registry.foreignKills, 1);

  const clean = createProcessRegistry();
  const receipt = runReleaseSoakSession({ seed: 47, mode: 'quick', root: ROOT, processRegistry: clean });
  assert.equal(clean.spawned.length, 0, 'headless soak must not spawn OS children');
  assert.equal(clean.foreignKills, 0, 'must not terminate ambient processes');
  assert.equal(receipt.processOwnership.foreignKills, 0);
  assert.equal(receipt.pass, true, receipt.failures.join('; '));
});

// ── campaign + CLI --quick ───────────────────────────────────────────────────

test('runReleaseSoakCampaign quick is deterministic across dual runs', () => {
  const campaign = runReleaseSoakCampaign({ mode: 'quick', root: ROOT, seeds: [47] });
  assert.equal(campaign.pass, true, campaign.failures.join('; '));
  assert.equal(campaign.runs.length, 1);
  assert.equal(campaign.runs[0].deterministic, true);
});

test('--quick CLI completes with exit 0 and writes a receipt', async () => {
  const receiptOut = path.join(ROOT, '.devshots', 'spec2', 'release-soak-contract-cli-receipt.json');
  const child = spawn(process.execPath, [CHECK, '--quick', '--seed', '47', '--receipt', receiptOut], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, `CLI failed:\nstdout=${stdout}\nstderr=${stderr}`);
  assert.match(stdout, /PASS in quick mode/);
  assert.doesNotMatch(stdout + stderr, /browser GPU FPS|claimsBrowserGpuFps.:true/i);

  const { readFile } = await import('node:fs/promises');
  const receipt = JSON.parse(await readFile(receiptOut, 'utf8'));
  assert.equal(receipt.schema, RELEASE_SOAK_RECEIPT_SCHEMA);
  assert.equal(receipt.pass, true, (receipt.failures || []).join('; '));
  assert.equal(receipt.mode, 'quick');
  assert.ok(sha256Hex('x').length === 64);
});
