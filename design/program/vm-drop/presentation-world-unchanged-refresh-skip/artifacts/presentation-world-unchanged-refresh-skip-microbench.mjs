/**
 * Primary KPI: refreshVisibleEntity on quiet mostly-static visible set.
 * Before = unchanged-refresh skip off; after = skip on.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createPresentationWorld,
  setPresentationWorldUnchangedRefreshSkipForBench,
  getPresentationWorldUnchangedRefreshSkipForBench,
} from '../src/render/presentationWorld.js';

const __filename = fileURLToPath(import.meta.url);

const SLOTS = 180;
const ITERS = 8000;
const RUNS = 11;
const MOVER_FRAC = 0.02;

function buildWorld() {
  const world = createPresentationWorld({ capacity: SLOTS + 8 });
  const entities = [];
  for (let i = 0; i < SLOTS; i++) {
    const e = {
      id: i + 1,
      type: i % 20 === 0 ? 'ship' : 'asteroid',
      isPlayer: i === 0,
      alive: true,
      pos: { x: i * 10, y: 0, z: i * 3 },
      prevPos: { x: i * 10, y: 0, z: i * 3 },
      rot: 0.1, bank: 0, pitch: 0,
      prevRot: 0.1, prevBank: 0, prevPitch: 0,
      radius: i % 20 === 0 ? 12 : 8,
      flags: {},
    };
    entities.push(e);
    world.allocateEntity(e);
  }
  const slots = entities.map((e) => world.getSlotForEntityId(e.id));
  return { world, entities, slots };
}

function runPasses(world, entities, slots, iters, movers) {
  function onePass() {
    let changed = 0;
    for (let i = 0; i < SLOTS; i++) {
      const e = entities[i];
      const slot = slots[i];
      if (i < movers) {
        e.prevPos.x = e.pos.x;
        e.prevPos.z = e.pos.z;
        e.prevRot = e.rot;
        e.pos.x += 0.01;
        e.pos.z += 0.005;
        e.rot += 0.0001;
      }
      if (world.refreshVisibleEntity(slot, e, e.radius)) changed++;
    }
    return changed;
  }
  for (let w = 0; w < 40; w++) onePass();
  let sink = 0;
  const t0 = performance.now();
  for (let n = 0; n < iters; n++) sink += onePass();
  const ms = performance.now() - t0;
  let checksum = 0;
  for (let i = 0; i < SLOTS; i++) {
    const slot = slots[i];
    checksum += world.x[slot] + world.z[slot] * 0.1 + world.rot[slot] * 10 + world.radii[slot];
  }
  return { ms, sink, checksum };
}

function childPair() {
  const movers = Math.max(1, Math.floor(SLOTS * MOVER_FRAC));

  setPresentationWorldUnchangedRefreshSkipForBench(false);
  const beforeWorld = buildWorld();
  const before = runPasses(beforeWorld.world, beforeWorld.entities, beforeWorld.slots, ITERS, movers);

  setPresentationWorldUnchangedRefreshSkipForBench(true);
  const afterWorld = buildWorld();
  const after = runPasses(afterWorld.world, afterWorld.entities, afterWorld.slots, ITERS, movers);

  const checksumMatch = Math.abs(before.checksum - after.checksum) < 1e-6;
  return {
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    beforeSink: before.sink,
    afterSink: after.sink,
    checksumMatch,
    beforeChecksum: before.checksum,
    afterChecksum: after.checksum,
    skipEnabledAfter: getPresentationWorldUnchangedRefreshSkipForBench(),
  };
}

if (process.argv.includes('--child')) {
  process.stdout.write(JSON.stringify(childPair()));
} else {
  const pairs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = spawnSync(process.execPath, [__filename, '--child'], {
      encoding: 'utf8',
      cwd: new URL('..', import.meta.url).pathname,
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(r.status || 1);
    }
    const parsed = JSON.parse(r.stdout);
    pairs.push(parsed);
    console.log(
      `pair${i}: ${parsed.speedup.toFixed(3)}× `
      + `(${parsed.beforeMs.toFixed(1)}→${parsed.afterMs.toFixed(1)} ms) `
      + `cs=${parsed.checksumMatch}`,
    );
  }
  const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
  const mid = speedups[Math.floor(speedups.length / 2)];
  const report = {
    label: 'presentation-world-unchanged-refresh-skip',
    scenario: 'quiet-180ents-2pct-movers',
    slots: SLOTS,
    iters: ITERS,
    moverFrac: MOVER_FRAC,
    runs: RUNS,
    medianSpeedup: mid,
    floorMinSpeedup: speedups[0],
    pairs,
    allChecksumsMatch: pairs.every((p) => p.checksumMatch),
    note: 'Primary KPI: refreshVisibleEntity. Soft-GPU fps not claimed.',
  };
  console.log(JSON.stringify({
    medianSpeedup: report.medianSpeedup,
    floorMinSpeedup: report.floorMinSpeedup,
    allChecksumsMatch: report.allChecksumsMatch,
  }, null, 2));
  writeFileSync(
    new URL('./presentation-world-unchanged-refresh-skip-microbench.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
}
