/**
 * Primary KPI: packCombatTable residual under registry.preStep.
 * Before = full Map.clear + rewrite every shipLike/projectile/wreck on any POSE dirty.
 * After  = pose-only dirty refreshes existing rows in place (membership still full-rebuilds).
 * Quiet Ceres-shaped: many parked ships, player (+few) pose-dirty each tick.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { DIRTY, beginDirtyTick, markDirty } from '../src/core/dirtyJournal.js';
import { packCombatTable, ensureCombatTable } from '../src/core/combatTable.js';

const FLAG_SHIP = 1 << 0;
const FLAG_PROJECTILE = 1 << 1;
const FLAG_PLAYER = 1 << 2;
const FLAG_WRECK = 1 << 3;

function makeWorld(nShips, movers, nProjectiles = 0, nWrecks = 0) {
  const player = {
    id: 1, alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 12, z: 0 }, rot: 0.1, radius: 8,
  };
  const shipLike = [player];
  const map = new Map([[1, player]]);
  for (let i = 0; i < nShips; i++) {
    const id = 100 + i;
    const moving = i < movers;
    const e = {
      id, alive: true, team: (i % 3) + 1,
      pos: { x: (i % 20) * 40, z: Math.floor(i / 20) * 40 },
      vel: moving ? { x: 4, z: 1 } : { x: 0, z: 0 },
      rot: 0, radius: 6,
    };
    shipLike.push(e);
    map.set(id, e);
  }
  const projectiles = [];
  for (let i = 0; i < nProjectiles; i++) {
    const id = 1000 + i;
    const e = {
      id, alive: true, team: 0,
      pos: { x: 10 + i, z: 2 }, vel: { x: 40, z: 0 }, rot: 0, radius: 1,
    };
    projectiles.push(e);
    map.set(id, e);
  }
  const wrecks = [];
  for (let i = 0; i < nWrecks; i++) {
    const id = 2000 + i;
    const e = {
      id, alive: true, team: 1,
      pos: { x: -50 - i * 10, z: 20 }, vel: { x: 0, z: 0 }, rot: 0, radius: 4,
    };
    wrecks.push(e);
    map.set(id, e);
  }
  return {
    tick: 1,
    playerId: 1,
    entities: { get: (id) => map.get(id) || null },
    entityIndex: { shipLike, projectiles, wrecks },
    _map: map,
    _shipLike: shipLike,
    _projectiles: projectiles,
    _wrecks: wrecks,
  };
}

function fullRebuildPack(state) {
  // Stand-in for pre-incremental body (always clears + rewrites).
  const table = ensureCombatTable(state);
  const tick = state.tick | 0;
  const index = state.entityIndex;
  const ships = index.shipLike || [];
  const projectiles = index.projectiles || [];
  const wrecks = index.wrecks || [];
  const n = ships.length + projectiles.length + wrecks.length;
  if (n > table.capacity) {
    let next = table.capacity || 8;
    while (next < n) next *= 2;
    table.capacity = next;
    table.id = new Uint32Array(next);
    table.x = new Float64Array(next);
    table.z = new Float64Array(next);
    table.vx = new Float64Array(next);
    table.vz = new Float64Array(next);
    table.yaw = new Float64Array(next);
    table.radius = new Float64Array(next);
    table.team = new Int32Array(next);
    table.flags = new Uint32Array(next);
  }
  let w = 0;
  const rowById = table.rowById || (table.rowById = new Map());
  rowById.clear();
  const write = (entity, extraFlags) => {
    if (!entity || entity.alive === false || !entity.pos) return;
    table.id[w] = entity.id >>> 0;
    table.x[w] = Number(entity.pos.x) || 0;
    table.z[w] = Number(entity.pos.z) || 0;
    table.vx[w] = entity.vel ? Number(entity.vel.x) || 0 : 0;
    table.vz[w] = entity.vel ? Number(entity.vel.z) || 0 : 0;
    table.yaw[w] = Number(entity.rot) || 0;
    table.radius[w] = Number(entity.radius) || 0;
    table.team[w] = entity.team == null ? -1 : entity.team | 0;
    let flags = extraFlags;
    if (entity.isPlayer === true || entity.id === state.playerId) flags |= FLAG_PLAYER;
    table.flags[w] = flags;
    rowById.set(table.id[w], w);
    w++;
  };
  for (let i = 0; i < ships.length; i++) write(ships[i], FLAG_SHIP);
  for (let i = 0; i < projectiles.length; i++) write(projectiles[i], FLAG_PROJECTILE);
  for (let i = 0; i < wrecks.length; i++) write(wrecks[i], FLAG_WRECK);
  table.count = w;
  table.tick = tick;
  table.packedOnce = true;
  return table;
}

function markQuietPoseDirty(state, movers) {
  beginDirtyTick(state, state.tick);
  markDirty(state, 1, DIRTY.POSE); // player
  for (let i = 0; i < movers; i++) markDirty(state, 100 + i, DIRTY.POSE);
  for (const p of state._projectiles) markDirty(state, p.id, DIRTY.POSE);
}

function advancePose(state, movers) {
  const player = state._map.get(1);
  player.pos.x += 0.2;
  player.rot += 0.01;
  for (let i = 0; i < movers; i++) {
    const e = state._map.get(100 + i);
    e.pos.x += 0.05;
  }
  for (const p of state._projectiles) p.pos.x += 0.5;
}

function bench(label, nShips, movers, nProjectiles, iters) {
  // --- before: full rebuild every pose tick ---
  const beforeState = makeWorld(nShips, movers, nProjectiles, 4);
  markQuietPoseDirty(beforeState, movers);
  fullRebuildPack(beforeState); // prime
  let t0 = performance.now();
  for (let i = 0; i < iters; i++) {
    beforeState.tick++;
    advancePose(beforeState, movers);
    markQuietPoseDirty(beforeState, movers);
    fullRebuildPack(beforeState);
  }
  const beforeMs = performance.now() - t0;

  // --- after: live packCombatTable incremental ---
  const afterState = makeWorld(nShips, movers, nProjectiles, 4);
  markQuietPoseDirty(afterState, movers);
  packCombatTable(afterState); // prime full
  t0 = performance.now();
  let lastCount = 0;
  for (let i = 0; i < iters; i++) {
    afterState.tick++;
    advancePose(afterState, movers);
    markQuietPoseDirty(afterState, movers);
    const table = packCombatTable(afterState);
    lastCount = table.count;
  }
  const afterMs = performance.now() - t0;

  // Oracle: after a pose-only pack, player x matches; parked ship row unchanged from prime+moves
  const table = afterState.combatTable;
  const playerRow = table.rowById.get(1);
  const parkedId = 100 + movers; // first parked if movers < nShips
  const parked = afterState._map.get(parkedId);
  const parkedRow = parked ? table.rowById.get(parkedId) : null;

  return {
    label,
    nShips,
    movers,
    nProjectiles,
    iters,
    beforeMs: +beforeMs.toFixed(3),
    afterMs: +afterMs.toFixed(3),
    speedup: +(beforeMs / afterMs).toFixed(3),
    count: lastCount,
    playerX: table.x[playerRow],
    parkedX: parkedRow != null ? table.x[parkedRow] : null,
    expectedParkedX: parked ? parked.pos.x : null,
  };
}

// Warm
bench('warm', 40, 1, 0, 200);

const scenarios = [
  bench('quiet-120ships-1mover', 120, 1, 0, 8000),
  bench('quiet-120ships-3movers', 120, 3, 0, 8000),
  bench('combat-80ships-3movers-6proj', 80, 3, 6, 8000),
  bench('membership-control-full', 120, 1, 0, 2000), // will still use incremental; separate check below
];

// Membership dirty must rebuild (count changes)
{
  const state = makeWorld(40, 1, 0, 0);
  beginDirtyTick(state, state.tick);
  packCombatTable(state);
  const beforeCount = state.combatTable.count;
  const newbie = {
    id: 9999, alive: true, team: 1,
    pos: { x: 1, z: 1 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  };
  state._shipLike.push(newbie);
  state._map.set(9999, newbie);
  state.tick++;
  beginDirtyTick(state, state.tick);
  markDirty(state, 9999, DIRTY.MEMBERSHIP);
  const table = packCombatTable(state);
  scenarios.push({
    label: 'membership-adds-row',
    beforeCount,
    afterCount: table.count,
    hasNewbie: table.rowById.get(9999) != null,
    ok: table.count === beforeCount + 1 && table.rowById.get(9999) != null,
  });
}

const out = {
  label: 'combat-table-pose-incremental',
  scenarios,
  primary: scenarios[0],
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('artifacts/combat-table-pose-incremental-microbench.json', JSON.stringify(out, null, 2));
