// PQ-174.00 swarm-bar dump helpers. Default suite stays fast.
// The live 9-cell sweep is gated behind SWARM_BARS_FULL=1.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { formatSwarmBars, measureSwarmRun } from '../scripts/lib/bench/swarmMetrics.mjs';
import {
  SWARM_BAR_LINE_KEYS,
  SWARM_BAR_LOADOUTS,
  SWARM_BAR_SEEDS,
  SWARM_BARS_JSON_REL,
  buildSwarmBarsDocument,
  missingSwarmBars,
  parseSwarmBarCellStdout,
  serializeSwarmBarCell,
  swarmBarsLineComplete,
} from '../scripts/lib/bench/crucibleSwarmBars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICK = (tick, type, data = {}) => ({ tick, type, data });

function completeRun() {
  return {
    loadoutId: 'physics_toolkit',
    seed: 4242,
    arenaId: 'helios_core',
    hullId: 'ship_hornet',
    stopReason: 'tick_cap',
    simSeconds: 90,
    ticks: 5400,
    fitReceipt: {
      hullId: 'ship_hornet',
      fitted: [
        { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
        { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
      ],
    },
    bodyAdmission: { samples: 1 },
    swarmTelemetry: { firstHostile: true, menus: true, deathTelegraph: true },
    eventTrace: [
      TICK(0, 'swarm:telemetry', { channels: ['hostile:spawned', 'run:draftOffered'] }),
      TICK(2, 'run:wavePlanned', { wave: 1, quota: 15 }),
      TICK(3, 'hostile:spawned', { entityId: 20, archetype: 'wasp_swarmer', wave: 1 }),
      TICK(80, 'verb:used', { verb: 'shove' }),
      TICK(400, 'entity:killed', { cause: 'collision', targetId: 20, archetype: 'fighter', killerId: 20 }),
      TICK(4122, 'run:waveCleared', { wave: 1 }),
      TICK(4168, 'run:wavePlanned', { wave: 2, quota: 24 }),
    ],
  };
}

test('serializeSwarmBarCell carries every named bar; missingSwarmBars is empty', () => {
  const swarm = measureSwarmRun(completeRun());
  const cell = serializeSwarmBarCell(swarm);
  assert.equal(cell.firstHostile.available, true);
  assert.equal(cell.quietSecondsAfterWave1.available, true);
  assert.equal(Number.isFinite(cell.quietSecondsAfterWave1.seconds), true);
  assert.equal(Number.isFinite(cell.momentsPerMinute), true);
  assert.ok(Array.isArray(cell.meaningfulMoments));
  assert.equal(cell.buildIdentity.available, true);
  assert.match(cell.buildIdentity.code, /physics_toolkit\/ship_hornet/);
  assert.equal(cell.menus.available, true);
  assert.equal(cell.menus.count, 0);
  assert.equal(cell.firstDeath.censored, true);
  assert.equal(cell.firstDeath.seconds, null);
  const gaps = missingSwarmBars(cell);
  assert.deepEqual(gaps, []);
  const missingKeys = swarmBarsLineComplete(cell.barsLine);
  assert.deepEqual(missingKeys, []);
});

test('historical unavailable menus stay null, never a fake zero', () => {
  const swarm = measureSwarmRun({
    loadoutId: 'energy_baseline',
    seed: 4242,
    arenaId: 'helios_core',
    stopReason: 'player_dead',
    simSeconds: 16.72,
    ticks: 1003,
    fitReceipt: { hullId: 'ship_kestrel', fitted: [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }] },
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(728, 'entity:killed', { cause: 'weapon', targetId: 9, archetype: 'fighter', killerId: 1 }),
      TICK(1004, 'entity:killed', {
        cause: 'player', archetype: 'player', targetId: 1, killerId: 325,
      }),
    ],
  });
  assert.equal(swarm.menus.available, false);
  assert.equal(swarm.menus.count, null);
  assert.ok(swarm.menus.reason);
  const line = formatSwarmBars(swarm);
  for (const key of SWARM_BAR_LINE_KEYS) {
    assert.ok(line.includes(key), `missing ${key}`);
  }
  assert.match(line, /menus=n\/a\(/);
  assert.equal(line.includes('menus=0@'), false);
});

test('missingSwarmBars flags a fake menu zero on an unavailable channel', () => {
  const swarm = measureSwarmRun(completeRun());
  const cell = serializeSwarmBarCell(swarm);
  cell.menus = { available: false, count: 0, perWave: 0, reason: null };
  const gaps = missingSwarmBars(cell);
  assert.ok(gaps.some((g) => /menus unavailable with a fake count/.test(g)));
  assert.ok(gaps.some((g) => /menus unavailable without a reason/.test(g)));
});

test('buildSwarmBarsDocument keeps nine cells and the bars lines', () => {
  const swarm = measureSwarmRun(completeRun());
  const cell = serializeSwarmBarCell(swarm);
  const cells = [];
  for (const loadoutId of SWARM_BAR_LOADOUTS) {
    for (const seed of SWARM_BAR_SEEDS) {
      cells.push({ ...cell, loadoutId, seed, barsLine: formatSwarmBars({ ...swarm, loadoutId, seed }) });
    }
  }
  assert.equal(cells.length, 9);
  const doc = buildSwarmBarsDocument({ cells, wave1Quota: 15 });
  assert.equal(doc.before.runs.length, 9);
  assert.equal(doc.barsLines.length, 9);
  assert.equal(doc.wave1Quota, 15);
  assert.ok(doc.note.includes('characterization'));
});

test('parseSwarmBarCellStdout reads the last JSON line', () => {
  const payload = { loadoutId: 'energy_baseline', seed: 4242 };
  const stdout = `noise\nSWARM_BAR_CELL_JSON:${JSON.stringify(payload)}\n`;
  assert.deepEqual(parseSwarmBarCellStdout(stdout), payload);
});

test('nine-cell live BEFORE dump (SWARM_BARS_FULL=1)', { timeout: 3_600_000 }, async (t) => {
  if (process.env.SWARM_BARS_FULL !== '1') {
    t.skip('set SWARM_BARS_FULL=1 to run the live 9-cell swarm-bar sweep');
    return;
  }
  const script = join(ROOT, 'scripts', 'check-crucible-swarm-bars.mjs');
  const spawned = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3_600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SWARM_BARS_FULL: '1' },
  });
  assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
  const lines = String(spawned.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('[swarm-bars] loadout='));
  assert.equal(lines.length, 9, `expected 9 formatSwarmBars lines, got ${lines.length}`);
  for (const line of lines) {
    assert.deepEqual(swarmBarsLineComplete(line), []);
  }
  assert.match(String(spawned.stdout || ''), /check-crucible-swarm-bars: PASS/);
  void SWARM_BARS_JSON_REL;
});
