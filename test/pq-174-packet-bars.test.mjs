// PQ-174 packet bars — the two Outcome clauses no leaf owned.
//
// Bar 1: run length to first death (minutes) + death story. Cap is death or 20 simulated minutes.
// Bar 2: quiet seconds (whole second, no kill / verb / moment / shot) across the whole run.
//
// Default suite is synthetic and fast. The live 9-cell sweep is PACKET_BARS_FULL=1.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  countQuietSeconds,
  formatSwarmBars,
  measureSwarmRun,
  SWARM_PACKET_CENSOR_SECONDS,
  SWARM_PACKET_TICK_CAP,
} from '../scripts/lib/bench/swarmMetrics.mjs';
import {
  SWARM_BAR_LINE_KEYS,
  SWARM_BAR_LOADOUTS,
  SWARM_BAR_PILOT_IS_COMPETENT_PLAYER,
  SWARM_BAR_SEEDS,
  SWARM_BAR_TICK_CAP,
  SWARM_BAR_WAVE_TARGET,
  missingSwarmBars,
  serializeSwarmBarCell,
  swarmBarsLineComplete,
} from '../scripts/lib/bench/crucibleSwarmBars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICK = (tick, type, data = {}) => ({ tick, type, data });
const SEEDS = [4242, 8008, 13502];

test('packet-bar cap is 20 simulated minutes, not 90 seconds', () => {
  assert.equal(SWARM_PACKET_CENSOR_SECONDS, 1200);
  assert.equal(SWARM_PACKET_TICK_CAP, 72000);
  assert.equal(SWARM_BAR_TICK_CAP, 72000);
  assert.equal(SWARM_BAR_WAVE_TARGET, 999);
  assert.equal(SWARM_BAR_PILOT_IS_COMPETENT_PLAYER, false);
});

test('quiet-second helper: a whole second with no kill, verb, moment, or shot', () => {
  const activity = [2.4, 6.1];
  assert.equal(countQuietSeconds(activity, 0, 10), 8);
  assert.equal(countQuietSeconds(activity, 5, 10), 4);
});

test('whole-run quiet is not the after-wave-1 window', () => {
  const swarm = measureSwarmRun({
    loadoutId: 'physics_toolkit',
    seed: 4242,
    arenaId: 'helios_core',
    stopReason: 'player_dead',
    simSeconds: 10,
    ticks: 600,
    censorSeconds: SWARM_PACKET_CENSOR_SECONDS,
    fitReceipt: { hullId: 'ship_hornet', fitted: [{ slotIndex: 0, defId: 'wpn_concussion_cannon_m' }] },
    swarmTelemetry: { firstHostile: true, menus: true, deathTelegraph: true },
    eventTrace: [
      TICK(0, 'swarm:telemetry', { channels: ['hostile:spawned', 'run:draftOffered'] }),
      TICK(1, 'run:wavePlanned', { wave: 1 }),
      TICK(2, 'hostile:spawned', { entityId: 20, archetype: 'wasp_swarmer', wave: 1 }),
      TICK(150, 'entity:killed', { cause: 'collision', targetId: 20, archetype: 'fighter', killerId: 20 }),
      TICK(300, 'run:waveCleared', { wave: 1 }),
      TICK(366, 'player:shot', { ownerId: 1 }),
      TICK(600, 'entity:killed', { cause: 'player', archetype: 'player', targetId: 1, killerId: 21 }),
    ],
  });
  assert.equal(swarm.quietSeconds.available, true);
  assert.equal(swarm.quietSecondsAfterWave1.available, true);
  assert.notEqual(swarm.quietSeconds.seconds, swarm.quietSecondsAfterWave1.seconds);
  assert.equal(swarm.quietSeconds.seconds, 8);
  assert.equal(swarm.quietSecondsAfterWave1.seconds, 4);
  assert.equal(swarm.firstDeath.censored, false);
  assert.equal(swarm.firstDeath.minutes, 0.166667);
});

test('a death at 200 s is a death time in minutes, not a 90 s censor', () => {
  const swarm = measureSwarmRun({
    loadoutId: 'energy_baseline',
    seed: 8008,
    arenaId: 'helios_core',
    stopReason: 'player_dead',
    simSeconds: 200,
    ticks: 12000,
    censorSeconds: SWARM_PACKET_CENSOR_SECONDS,
    fitReceipt: { hullId: 'ship_kestrel', fitted: [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }] },
    resultsSummary: {
      death: {
        causeText: 'Wasp Swarmer · sting · AFT · hull breach',
        telegraphName: 'Weapon charge',
        telegraphLeadMs: 740,
        telegraphSource: 'witnessed',
        counterplay: 'It killed from astern — clear your six before the next pass.',
      },
    },
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(3, 'hostile:spawned', { entityId: 9, archetype: 'wasp_swarmer' }),
      TICK(80, 'player:shot', {}),
      TICK(400, 'entity:killed', { cause: 'weapon', targetId: 9, archetype: 'fighter', killerId: 1 }),
      TICK(3600, 'run:waveCleared', { wave: 1 }),
      TICK(12000, 'entity:killed', {
        cause: 'player', archetype: 'player', targetId: 1, killerId: 325, deathCause: 'wasp_swarmer',
      }),
    ],
  });
  assert.equal(swarm.firstDeath.available, true);
  assert.equal(swarm.firstDeath.censored, false);
  assert.equal(swarm.firstDeath.seconds, 200);
  assert.equal(swarm.firstDeath.minutes, 3.333333);
  assert.equal(swarm.playerDeaths[0].story.causeText, 'Wasp Swarmer · sting · AFT · hull breach');
  assert.equal(swarm.playerDeaths[0].telegraphLeadMs, 740);
  const line = formatSwarmBars(swarm);
  for (const key of SWARM_BAR_LINE_KEYS) {
    assert.ok(line.includes(key), `missing ${key}`);
  }
  assert.match(line, /firstDeathMin=3\.333333min/);
  assert.match(line, /deathStory=Wasp Swarmer/);
  assert.deepEqual(missingSwarmBars({ ...swarm, barsLine: line }), []);
});

test('a 20-minute survivor is right-censored, never a fake death time', () => {
  const swarm = measureSwarmRun({
    loadoutId: 'massline_rig',
    seed: 13502,
    arenaId: 'helios_core',
    stopReason: 'tick_cap',
    simSeconds: 1200,
    ticks: 72000,
    censorSeconds: SWARM_PACKET_CENSOR_SECONDS,
    fitReceipt: { hullId: 'ship_drifter', fitted: [{ slotIndex: 0, defId: 'mod_elastic_whip_m' }] },
    swarmTelemetry: { firstHostile: true, menus: true, deathTelegraph: true },
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(3, 'hostile:spawned', { entityId: 9, archetype: 'wasp_swarmer' }),
      TICK(80, 'player:shot', {}),
      TICK(400, 'entity:killed', { cause: 'weapon', targetId: 9, archetype: 'fighter', killerId: 1 }),
      TICK(3600, 'run:waveCleared', { wave: 1 }),
    ],
  });
  assert.equal(swarm.censored, true);
  assert.equal(swarm.firstDeath.censored, true);
  assert.equal(swarm.firstDeath.seconds, null);
  assert.equal(swarm.firstDeath.minutes, null);
  assert.equal(swarm.firstDeath.censoredAtMinutes, 20);
  assert.match(swarm.firstDeath.reason, /right-censored/);
  const cell = serializeSwarmBarCell(swarm);
  assert.deepEqual(swarmBarsLineComplete(cell.barsLine), []);
  assert.match(cell.barsLine, /firstDeathMin=censored@20min/);
});

test('fixed seeds and loadouts stay the three named cells', () => {
  assert.equal(SEEDS.length, 3);
  assert.equal(SWARM_BAR_SEEDS.length, 3);
  assert.equal(SWARM_BAR_LOADOUTS.length, 3);
});

test('live nine-cell packet-bar sweep (PACKET_BARS_FULL=1)', { timeout: 9 * 30 * 60 * 1000 }, async (t) => {
  if (process.env.PACKET_BARS_FULL !== '1') {
    t.skip('set PACKET_BARS_FULL=1 to run the live 9-cell death-or-20-min sweep');
    return;
  }
  const script = join(ROOT, 'scripts/lib/bench/packetBars.mjs');
  const spawned = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 9 * 30 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });
  assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
  const lines = String(spawned.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('[swarm-bars] loadout='));
  assert.equal(lines.length, 9, `expected 9 formatSwarmBars lines, got ${lines.length}`);
  for (const line of lines) {
    assert.deepEqual(swarmBarsLineComplete(line), []);
    assert.match(line, /quiet=/);
    assert.match(line, /firstDeathMin=/);
    assert.match(line, /deathStory=/);
  }
  assert.match(String(spawned.stdout || ''), /packet-bars: PASS/);
});
