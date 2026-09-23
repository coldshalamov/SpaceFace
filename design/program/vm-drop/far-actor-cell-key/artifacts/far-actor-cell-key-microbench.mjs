#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { createGameState } from '../hud-radar-leftovers/src/core/gameState.js';
import {
  ensureFarActorTable,
  queryFarActors,
  FAR_ACTOR_CELL,
} from '../hud-radar-leftovers/src/world/farActorTable.js';

// Minimal insert without full promote path: push rows + gridAdd via ensure + direct
function seedFar(state, n) {
  const table = ensureFarActorTable(state);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = 80 + (i % 40) * 120;
    const rec = {
      id: 5000 + i,
      type: 'ship',
      alive: true,
      farResident: true,
      pos: { x: Math.cos(a) * d, z: Math.sin(a) * d },
      vel: { x: 0, z: 0 },
      radius: 8,
      lastExactT: 0,
      data: {},
    };
    table.rows.push(rec);
    table.byId.set(rec.id, rec);
    // use module grid via rebuild
  }
  // rebuild through ensure path — force rebuildGrid by clearing Map type check
  table.grid = null;
  ensureFarActorTable(state);
  return table;
}

const ROWS = 400;
const QUERIES = 8000;
const radius = 4700; // far scan disc at reference travel
const state = createGameState();
seedFar(state, ROWS);
const scratch = [];
const origin = { x: 0, z: 0 };

for (let i = 0; i < 40; i++) queryFarActors(state, origin, radius, scratch);
const t0 = performance.now();
let hits = 0;
for (let i = 0; i < QUERIES; i++) {
  origin.x = (i % 30) * 20;
  origin.z = ((i * 5) % 30) * 20;
  queryFarActors(state, origin, radius, scratch);
  hits += scratch.length;
}
const ms = performance.now() - t0;
const sampleKey = [...(state.world.farActors.grid.keys())][0];
const out = {
  rows: ROWS,
  queries: QUERIES,
  radius,
  ms: +ms.toFixed(2),
  hits,
  keyType: typeof sampleKey,
  keySample: sampleKey,
  cell: FAR_ACTOR_CELL,
};
console.log(JSON.stringify(out, null, 2));
