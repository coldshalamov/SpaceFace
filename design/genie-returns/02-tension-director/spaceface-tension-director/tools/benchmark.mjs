#!/usr/bin/env node
/** Development-only microbenchmark. Wall time here measures CPU work; gameplay uses simTime. */
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBus } from '../fixture/eventBus.js';
import { createTensionDirectorSystem } from '../repo/src/systems/tensionDirector.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const state = { simTime: 0, tick: 0, mode: 'flight', playerId: 1,
  player: { flags: {} }, settings: { gameplay: { difficulty: 'standard' } },
  world: { currentSectorId: 'fixture' }, entities: new Map(),
  encounterDirector: { live: {}, pending: Array.from({ length: 64 }, () => ({ deck: 'combat' })) } };
state.entities.set(1, { alive: true, hull: 100, hullMax: 100, shield: 100, shieldMax: 100, pos: { x: 0, z: 0 } });
for (let encounter = 0; encounter < 16; encounter++) {
  const ids = [];
  for (let member = 0; member < 16; member++) {
    const id = 2 + encounter * 16 + member; ids.push(id);
    state.entities.set(id, { alive: true, pos: { x: 10000, z: 10000 } });
  }
  state.encounterDirector.live[`row${encounter}`] = { deck: 'combat', ids, sectorId: 'fixture' };
}
const system = createTensionDirectorSystem({ emitDecisions: false });
const helpers = {}, bus = createBus(); system.init({ state, bus, helpers });
const decisionSamples = [], guardSamples = [];
for (let t = 0; t < 12000; t++) {
  state.simTime = t; state.tick = t * 60;
  const start = performance.now(); system.update(1, state); const cost = performance.now() - start;
  const guardStart = performance.now();
  for (let i = 1; i < 60; i++) { state.simTime = t + i / 60; system.update(1/60, state); }
  const guardCost = (performance.now() - guardStart) / 59;
  if (t >= 2000) { decisionSamples.push(cost * 1000); guardSamples.push(guardCost * 1000); }
}
function stats(samples) {
  const sorted = samples.slice().sort((a,b) => a-b);
  const q = (p) => Math.round(sorted[Math.floor((sorted.length-1)*p)]*1000)/1000;
  return { samples: samples.length, unit: 'microseconds', median: q(.5), p95: q(.95), p99: q(.99), max: q(1) };
}
const result = { schema: 'spaceface.tension.microbenchmark.v1', evidenceClass: 'container-node-microbenchmark',
  node: process.version, platform: process.platform, arch: process.arch,
  scenario: 'maximum bounded scan: 16 rosters x 16 far actors + 64 pending; 2,000 warmup + 10,000 measured decisions',
  excluded: ['full campaign consumer', 'real AI/physics', 'external telemetry subscribers', 'renderer', 'target-PC frame time'],
  decisionPath: stats(decisionSamples), extraTickGuard: stats(guardSamples),
  serializedOwnerBytes: Buffer.byteLength(JSON.stringify(helpers.tensionDirector.serialize())) };
system.destroy();
await fs.writeFile(path.join(root, 'evidence/microbenchmark.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
