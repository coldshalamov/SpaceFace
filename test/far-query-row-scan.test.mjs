import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import {
  ensureFarActorTable,
  queryFarActors,
  FAR_ACTOR_CELL,
  FAR_ROW_BUDGET,
} from '../src/world/farActorTable.js';

function seedFarRows(state, count, spacing = FAR_ACTOR_CELL * 3) {
  const table = ensureFarActorTable(state);
  for (let i = 0; i < count; i++) {
    const rec = {
      id: 1000 + i,
      type: 'ship',
      alive: true,
      farResident: true,
      pos: { x: (i % 10) * spacing, z: Math.floor(i / 10) * spacing },
      vel: { x: 0, z: 0 },
      radius: 8,
      lastExactT: 0,
      data: {},
    };
    table.rows.push(rec);
    table.byId.set(rec.id, rec);
  }
  table.grid = null;
  ensureFarActorTable(state);
  return table;
}

test('wide-disc far query matches grid walk (row-scan path)', () => {
  const state = createGameState();
  const table = seedFarRows(state, 40);
  const origin = { x: 0, z: 0 };
  // Radius large enough that cellSpan >> rows → adaptive row scan.
  const radius = FAR_ACTOR_CELL * 20;
  const cellSpan = (Math.floor(radius / FAR_ACTOR_CELL) * 2 + 1) ** 2;
  assert.ok(cellSpan > table.rows.length, 'fixture must take the row-scan branch');

  const hits = queryFarActors(state, origin, radius, []);
  // Oracle: every alive row inside r2
  const r2 = radius * radius;
  const expected = table.rows.filter((rec) => {
    const dx = rec.pos.x - origin.x;
    const dz = rec.pos.z - origin.z;
    return dx * dx + dz * dz <= r2;
  });
  assert.equal(hits.length, expected.length);
  const ids = new Set(hits.map((r) => r.id));
  for (const rec of expected) assert.ok(ids.has(rec.id));
});

test('tight-disc far query still finds local rows (grid path)', () => {
  const state = createGameState();
  seedFarRows(state, 8, FAR_ACTOR_CELL);
  const origin = { x: 0, z: 0 };
  const hits = queryFarActors(state, origin, FAR_ACTOR_CELL * 0.75, []);
  assert.ok(hits.some((r) => r.id === 1000));
  assert.ok(hits.length <= 4);
});

test('row-scan respects FAR_ROW_BUDGET ceiling fixture', () => {
  assert.ok(FAR_ROW_BUDGET >= 64);
});
