// PQ-033.02 — min-spec floors and soak contract.
//
// Pins the named minimum-spec GPU, the floor numbers from the PQ-033 release
// matrix (60 fps median, <=1 hitch >50 ms per minute, boot <=10 s, heap growth
// <30 MB/30 min), the two-hour/two-host soak bound, and the 200 public
// save/load cycle count. Floor verdicts are always recomputed from raw
// evidence — a claimed pass is never trusted.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  MIN_SPEC_SCHEMA,
  loadMinSpec,
  evaluateMinSpecFloors,
  minSpecEvidenceDirPattern,
} from '../scripts/lib/minSpecFloors.mjs';
import { parseReleaseSoakArgs } from '../scripts/lib/releaseSoakCli.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ── named spec ───────────────────────────────────────────────────────────────

test('build/min-spec.json names a concrete GPU and the release floors', () => {
  const spec = loadMinSpec(ROOT);
  assert.equal(spec.schema, MIN_SPEC_SCHEMA);
  assert.match(spec.hardware.gpu.name, /Intel Graphics \(Core Ultra 7 155U/, 'min-spec must name the reference GPU');
  assert.equal(spec.hardware.gpu.tier, 'integrated');
  assert.equal(spec.hardware.gpu.requiresHardwareWebGl2, true);
  assert.equal(spec.hardware.gpu.rejectsSoftwareRasterizer, true);
  assert.ok(Array.isArray(spec.hardware.gpu.matchAny) && spec.hardware.gpu.matchAny.length > 0,
    'spec must list renderer match patterns');
  assert.equal(spec.floors.medianFps, 60);
  assert.equal(spec.floors.medianFrameMs, 16.7);
  assert.equal(spec.floors.hitchThresholdMs, 50);
  assert.equal(spec.floors.maxHitchesPerMinute, 1);
  assert.equal(spec.floors.bootToMenuMs, 10_000);
  assert.equal(spec.floors.maxHeapGrowthBytesPer30Min, 30 * 1024 * 1024);
  assert.equal(spec.soak.durationMinutes, 120);
  assert.equal(spec.soak.minSaveLoadCycles, 200);
  assert.deepEqual([...spec.soak.hosts].sort(), ['browser', 'electron']);
});

// ── probe wiring (static contracts) ──────────────────────────────────────────

test('release-soak CLI accepts a minimum wall-duration and cycle-screenshot toggle', () => {
  const cli = read('scripts/lib/releaseSoakCli.mjs');
  assert.match(cli, /'min-duration-ms'/, 'CLI must accept --min-duration-ms');
  assert.match(cli, /'cycle-screenshots'/, 'CLI must accept --cycle-screenshots');
  const options = parseReleaseSoakArgs(
    ['--cycles=200', '--min-duration-ms=7200000', '--cycle-screenshots=0'],
    { runtime: 'browser', root: ROOT },
  );
  assert.equal(options.cycles, 200);
  assert.equal(options.minDurationMs, 7_200_000);
  assert.equal(options.cycleScreenshots, false);
});

test('probe keeps cycling until both cycle count and wall duration are met', () => {
  const probe = read('scripts/lib/releaseSoakProbe.mjs');
  assert.match(probe, /minDurationMs/, 'probe must accept a minimum duration');
  assert.match(probe, /index < cycles \|\|[^;]*soakStartedAt[^;]*< minDurationMs/,
    'cycle loop must continue until cycles and duration are both satisfied');
});

test('probe records a soak-window hitch register and a floors block in evidence', () => {
  const probe = read('scripts/lib/releaseSoakProbe.mjs');
  assert.match(probe, /__SF_MIN_SPEC_SOAK__/, 'probe must install the in-page soak-window recorder');
  assert.match(probe, /evidence\.floors|floors:/, 'evidence must carry a floors block');
  assert.match(probe, /bootToMenuMs/, 'evidence must record boot-to-menu timing');
  assert.match(probe, /stopSoakRecorder|__SF_MIN_SPEC_SOAK__\.active = false/,
    'recorder must stop before the controlled context loss so the induced gap is not charged to the game');
});

// ── floor evaluation ─────────────────────────────────────────────────────────

function makeEvidence(overrides = {}) {
  return {
    schema: 'spaceface.releaseSoak.v1',
    runtimeKind: 'browser',
    mode: 'browser',
    taskId: 'min-spec-soak-browser',
    generatedAt: new Date().toISOString(),
    worktreeId: 'wt', worktreeDigest: 'a'.repeat(64),
    primaryAcceptance: false,
    injectedState: false,
    inputSource: 'keyboard-mouse',
    checks: [{ name: 'x', status: 'pass' }],
    cycles: {
      count: 200,
      results: Array.from({ length: 200 }, (_, index) => ({
        index, pass: true, sampleCount: 3,
        marks: ['undock', 'flight-input', 'save-written', 'load-restored', 'economy-restored', 'docked', 'market-opened', 'trade-roundtrip'],
      })),
    },
    boot: {
      launchedAt: '2026-09-13T00:00:00.000Z',
      navigationStartedAt: '2026-09-13T00:00:04.000Z',
      menuVisibleAt: '2026-09-13T00:00:06.200Z',
      bootToMenuMs: 6_200,
      gameBootToMenuMs: 2_200,
      launchToFlightMs: 30_000,
    },
    hardware: { gpu: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)', tier: 'integrated', software: false } },
    performance: { frameMs: { sampleCount: 600, p50: 15.9, p95: 22, p99: 30, max: 31, hitchesOver32Ms: 0 }, samples: [], phases: {} },
    memory: { heapBytesStart: 900_000_000, heapBytesEnd: 910_000_000, heapGrowthBytes: 10_000_000, withinBudget: true },
    soakWindow: {
      durationMs: 7_300_000,
      frameCount: 400_000,
      hitchThresholdMs: 50,
      hitchEvents: [
        { atMs: 1_000_000, deltaMs: 55 },
        { atMs: 3_000_000, deltaMs: 61 },
      ],
    },
    errors: { pageErrors: [], requestFailures: [], glErrors: [], consoleErrors: [], httpErrors: [], warnings: [] },
    validation: { pass: true, failures: [] },
    ...overrides,
  };
}

test('green evidence passes every floor', () => {
  const spec = loadMinSpec(ROOT);
  const result = evaluateMinSpecFloors(makeEvidence(), spec);
  assert.equal(result.pass, true, result.failures.join('; '));
  assert.equal(result.floors.medianFps > 60, true);
  assert.ok(result.floors.hitchesPerMinute < 1, `hitches/min ${result.floors.hitchesPerMinute}`);
  assert.ok(result.floors.heapGrowthBytesPer30Min < spec.floors.maxHeapGrowthBytesPer30Min);
  assert.equal(result.floors.saveLoadCycles, 200);
  assert.ok(result.floors.soakDurationMinutes >= 120);
});

test('each floor is fail-closed', () => {
  const spec = loadMinSpec(ROOT);
  const cases = [
    ['slow median frame', { performance: { frameMs: { p50: 25 }, samples: [] } }],
    ['hitch storm', { soakWindow: { durationMs: 7_200_000, hitchThresholdMs: 50, hitchEvents: Array.from({ length: 200 }, (_, i) => ({ atMs: i * 30_000, deltaMs: 80 })) } }],
    ['slow boot', {
      boot: { launchedAt: '2026-09-13T00:00:00.000Z', navigationStartedAt: '2026-09-13T00:00:04.000Z', menuVisibleAt: '2026-09-13T00:00:18.000Z', bootToMenuMs: 18_000, gameBootToMenuMs: 14_000 },
    }],
    ['heap leak', { memory: { heapBytesStart: 900_000_000, heapBytesEnd: 1_050_000_000, heapGrowthBytes: 150_000_000 } }],
    ['short soak', { soakWindow: { durationMs: 3_600_000, hitchThresholdMs: 50, hitchEvents: [] } }],
    ['too few cycles', { cycles: { count: 12, results: Array.from({ length: 12 }, (_, index) => ({ index, pass: true, marks: ['save-written', 'load-restored'], sampleCount: 1 })) } }],
    ['cycle missing the load mark', { cycles: { count: 200, results: Array.from({ length: 200 }, (_, index) => ({ index, pass: true, marks: ['save-written'], sampleCount: 1 })) } }],
    ['software rasterizer', { hardware: { gpu: { vendor: 'Google', renderer: 'SwiftShader Device', tier: 'integrated', software: true } } }],
    ['wrong gpu family', { hardware: { gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'NVIDIA GeForce RTX 4090', tier: 'discrete', software: false } } }],
    ['missing soak window', { soakWindow: null }],
    // Number(null) === 0 and Number(undefined) === NaN must not read absent
    // measurements as perfect ones — every numeric field is type-checked.
    ['null boot timing', {
      boot: { launchedAt: '2026-09-13T00:00:00.000Z', navigationStartedAt: '2026-09-13T00:00:04.000Z', menuVisibleAt: '2026-09-13T00:00:06.200Z', bootToMenuMs: 6_200, gameBootToMenuMs: null },
    }],
    ['null median p50 and no histogram', {
      soakWindow: { durationMs: 7_300_000, frameCount: 400_000, hitchThresholdMs: 50, hitchEvents: [] },
      performance: { frameMs: { p50: null }, samples: [] },
    }],
    ['missing recorder threshold', {
      soakWindow: { durationMs: 7_300_000, frameCount: 400_000, hitchThresholdMs: null, hitchEvents: [] },
    }],
    ['boot clock skew', {
      boot: { launchedAt: '2026-09-13T00:00:06.200Z', navigationStartedAt: '2026-09-13T00:00:10.000Z', menuVisibleAt: '2026-09-13T00:00:00.000Z', bootToMenuMs: 6_200, gameBootToMenuMs: 2_200 },
    }],
    ['boot field disagrees with its own timestamps', {
      boot: { launchedAt: '2026-09-13T00:00:00.000Z', navigationStartedAt: '2026-09-13T00:00:04.000Z', menuVisibleAt: '2026-09-13T00:00:06.200Z', bootToMenuMs: 6_200, gameBootToMenuMs: 9_900 },
    }],
    ['browser boot missing navigation anchor', {
      boot: { launchedAt: '2026-09-13T00:00:00.000Z', menuVisibleAt: '2026-09-13T00:00:06.200Z', bootToMenuMs: 6_200, gameBootToMenuMs: 2_200 },
    }],
    ['null heap growth', {
      memory: { heapBytesStart: 900_000_000, heapBytesEnd: null, heapGrowthBytes: null },
    }],
    ['starved frame register', {
      soakWindow: { durationMs: 7_300_000, frameCount: 1_000, hitchThresholdMs: 50, hitchEvents: [] },
    }],
    // The bounded hitch log can saturate; counters must keep the verdict honest.
    ['saturated transition log hides a blown transition', {
      soakWindow: {
        durationMs: 7_300_000, frameCount: 400_000, hitchThresholdMs: 50,
        hitchEvents: [{ atMs: 1_000_000, deltaMs: 55, transition: 'save' }],
        hitchCount: 9_000, hitchGameplayCount: 2, hitchTransitionCount: 8_998,
        hitchMaxTransitionDeltaMs: 4_500, hitchEventsTruncated: true,
      },
    }],
    ['claimed counters below logged hitches cannot suppress them', {
      soakWindow: {
        durationMs: 7_300_000, frameCount: 400_000, hitchThresholdMs: 50,
        hitchEvents: Array.from({ length: 200 }, (_, i) => ({ atMs: i * 30_000, deltaMs: 80 })),
        hitchCount: 0, hitchGameplayCount: 0,
      },
    }],
  ];
  for (const [name, patch] of cases) {
    const result = evaluateMinSpecFloors(makeEvidence(patch), spec);
    assert.equal(result.pass, false, `${name} must fail`);
    assert.ok(result.failures.length > 0, `${name} must report a failure`);
  }
});

test('game-classifier externalScheduling hitches are recorded but not product stalls', () => {
  const spec = loadMinSpec(ROOT);
  // 120 machine-noise gaps over 2 h — one per minute. The game's own classifier says
  // the page did not consume them; the gameplay floor must not count them, and the
  // floors block must still surface them so reviewers can audit the environment.
  const evidence = makeEvidence({
    soakWindow: {
      durationMs: 7_200_000,
      frameCount: 400_000,
      hitchThresholdMs: 50,
      hitchEvents: Array.from({ length: 120 }, (_, i) => ({
        atMs: i * 60_000, deltaMs: 80, owner: 'externalScheduling',
      })),
      hitchCount: 120, hitchGameplayCount: 0, hitchExternalCount: 120,
      hitchAttributionEnabled: true,
    },
  });
  const result = evaluateMinSpecFloors(evidence, spec);
  assert.equal(result.pass, true, result.failures.join('; '));
  assert.equal(result.floors.externalSchedulingHitchCount, 120);
  assert.equal(result.floors.gameplayHitchCount, 0);
});

test('unattributed and ambiguous hitches still count against the gameplay floor', () => {
  const spec = loadMinSpec(ROOT);
  for (const owner of [undefined, null, 'unknown', 'ambiguous', 'sim', 'presentation']) {
    const evidence = makeEvidence({
      soakWindow: {
        durationMs: 7_200_000,
        frameCount: 400_000,
        hitchThresholdMs: 50,
        hitchEvents: Array.from({ length: 200 }, (_, i) => ({
          atMs: i * 30_000, deltaMs: 80, owner,
        })),
        hitchCount: 200, hitchGameplayCount: 200, hitchAttributionEnabled: true,
      },
    });
    const result = evaluateMinSpecFloors(evidence, spec);
    assert.equal(result.pass, false, `owner ${owner} must not escape the gameplay floor`);
  }
  // externalScheduling inside a transition span stays transition-classed and is
  // still bounded per-event — it cannot launder a 2 s+ stall either.
  const blown = makeEvidence({
    soakWindow: {
      durationMs: 7_200_000,
      frameCount: 400_000,
      hitchThresholdMs: 50,
      hitchEvents: [{ atMs: 60_000, deltaMs: 2_500, transition: 'load', owner: 'externalScheduling' }],
      hitchCount: 1, hitchTransitionCount: 1, hitchMaxTransitionDeltaMs: 2_500,
      hitchAttributionEnabled: true,
    },
  });
  const result = evaluateMinSpecFloors(blown, spec);
  assert.equal(result.pass, false, 'a >2 s external gap inside a transition must still fail');
});

test('external-scheduling exemption requires an armed classifier and consistent counters', () => {
  const spec = loadMinSpec(ROOT);
  // Owner claims without the armed-attribution flag are evidence the real recorder
  // cannot produce — they must not exempt anything.
  const unarmed = makeEvidence({
    soakWindow: {
      durationMs: 7_200_000,
      frameCount: 400_000,
      hitchThresholdMs: 50,
      hitchEvents: Array.from({ length: 200 }, (_, i) => ({
        atMs: i * 30_000, deltaMs: 80, owner: 'externalScheduling',
      })),
      hitchCount: 200, hitchGameplayCount: 0, hitchExternalCount: 200,
    },
  });
  const unarmedResult = evaluateMinSpecFloors(unarmed, spec);
  assert.equal(unarmedResult.pass, false, 'external claims without armed attribution must fail');
  assert.equal(unarmedResult.floors.gameplayHitchCount, 200);
  // Class counters that do not sum to the total are inconsistent evidence.
  const inconsistent = makeEvidence({
    soakWindow: {
      durationMs: 7_200_000,
      frameCount: 400_000,
      hitchThresholdMs: 50,
      hitchEvents: [{ atMs: 60_000, deltaMs: 80, owner: 'externalScheduling' }],
      hitchCount: 500, hitchGameplayCount: 0, hitchTransitionCount: 0, hitchExternalCount: 1,
      hitchAttributionEnabled: true,
    },
  });
  const inconsistentResult = evaluateMinSpecFloors(inconsistent, spec);
  assert.equal(inconsistentResult.pass, false, 'counters that do not sum to hitchCount must fail');
  assert.match(inconsistentResult.failures.join(' '), /counters inconsistent/);
});

test('floor verdict recomputes from raw evidence, ignoring a claimed pass', () => {
  const spec = loadMinSpec(ROOT);
  const forged = makeEvidence({ floors: { pass: true, failures: [] }, boot: { bootToMenuMs: 99_000 } });
  const result = evaluateMinSpecFloors(forged, spec);
  assert.equal(result.pass, false, 'a forged floors.pass must not survive recomputation');
});

test('evidence discovery grammar matches the soak output directories', () => {
  const pattern = minSpecEvidenceDirPattern('browser');
  assert.ok(pattern.test('min-spec-soak-browser-2026-09-13T00-00-00-000Z'));
  assert.ok(pattern.test('diagnostic-release-soak-browser-2026-09-13T00-00-00-000Z'));
  assert.ok(!pattern.test('min-spec-soak-electron-2026-09-13T00-00-00-000Z'));
});

test('package.json exposes the min-spec floor check', () => {
  const pkg = read('package.json');
  assert.match(pkg, /"check:pq033:min-spec":\s*"node scripts\/check-min-spec-floors\.mjs"/);
});

// ── checker CLI ──────────────────────────────────────────────────────────────

test('check-min-spec-floors reports pending when no evidence exists', async () => {
  const emptyRoot = path.join(ROOT, '.devshots', 'pq-033-02-empty-root');
  const child = spawn(process.execPath, [
    path.join(ROOT, 'scripts', 'check-min-spec-floors.mjs'),
    `--evidence-root=.devshots/pq-033-02-empty-root`,
  ], { cwd: ROOT, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const [code] = await once(child, 'close');
  assert.equal(code, 2, `expected pending exit 2:\nstdout=${stdout}\nstderr=${stderr}`);
  assert.match(stdout + stderr, /pending|absent/i);
});
