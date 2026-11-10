/**
 * #142 presentation-query-pose-dirty-retain microbench.
 * Soft-GPU fps NOT a KPI. Picture contract ON.
 *
 * Primary: parked origin (retain key stable), TRANSFORM dirty every frame on
 * already-visible roots (player yaw / NPC drift on glass). Before = pose-dirty
 * retain OFF (dirty blocks zero-dirty retain → full walk); after = ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
  setPresentationQueryRetainPosQuantizeForBench,
  setPresentationQueryPoseDirtyRetainForBench,
  getPresentationQueryPoseDirtyRetainForBench,
} from '../src/render/presentationQueries.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';

const RUNS = 11;
const ITERS = 12000;
const ENTS = 180;

function med(a){ const s=[...a].sort((x,y)=>x-y); return s[(s.length-1)>>1]; }
function summarize(name, pairs) {
  return {
    name,
    medianSpeedup: +med(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
  };
}

function entity(id, { x = 0, z = 0, radius = 8 } = {}) {
  return {
    id, type: 'asteroid', alive: true,
    pos: { x, y: 0, z }, prevPos: { x, y: 0, z },
    rot: 0, prevRot: 0, bank: 0, prevBank: 0, pitch: 0, prevPitch: 0,
    radius, flags: {}, presentationVisualRevision: 0,
  };
}
function bind(world, value) {
  const handle = world.handleForEntityId(value.id);
  const mesh = { userData: {}, position: { x: value.pos.x, y: 0, z: value.pos.z } };
  world.bindMesh(handle, mesh, value, value.radius);
}
function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

function boot() {
  const world = createPresentationWorld({ capacity: 256, cellSize: 64 });
  const ents = [];
  for (let i = 0; i < ENTS; i++) {
    const ang = (i / ENTS) * Math.PI * 2;
    const e = entity(100 + i, { x: Math.cos(ang) * 90, z: Math.sin(ang) * 90, radius: 8 });
    world.allocateEntity(e, 1);
    bind(world, e);
    ents.push(e);
  }
  const player = entity(1, { x: 0, z: 0, radius: 6 });
  player.type = 'ship';
  world.allocateEntity(player, 1);
  bind(world, player);
  return { world, player, ents };
}

function timeMode(poseDirtyRetain, { yaw = true, cruise = false } = {}) {
  setPresentationQueryZeroDirtyRetainForBench(true);
  setPresentationQueryRetainPosQuantizeForBench(true);
  setPresentationQueryPoseDirtyRetainForBench(poseDirtyRetain);
  const { world, player, ents } = boot();
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 220, halfZ: 140 },
    origin: { x: 0, z: 0 },
    playerId: 1,
  };
  clearAllDirty(world);
  queries.query(options);

  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    if (cruise) {
      player.pos.x += 40 / 60;
      options.origin = { x: player.pos.x, z: 0 };
    }
    if (yaw) {
      player.rot += 0.02;
      world.refreshVisibleEntity(world.getSlotForEntityId(1), player, 6);
      // NPC drift on glass
      const npc = ents[i % ents.length];
      npc.pos.x += (i % 2 ? 0.002 : -0.002);
      world.refreshVisibleEntity(world.getSlotForEntityId(npc.id), npc, npc.radius);
    }
    queries.query(options);
    clearAllDirty(world);
  }
  return performance.now() - t0;
}

function benchPairs(label, opts) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const before = timeMode(false, opts);
    const after = timeMode(true, opts);
    pairs.push(before / Math.max(1e-9, after));
  }
  return summarize(label, pairs);
}

function dirtyWakeProof() {
  setPresentationQueryPoseDirtyRetainForBench(true);
  setPresentationQueryZeroDirtyRetainForBench(true);
  const { world, player, ents } = boot();
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: 1,
  };
  // Place one near rock
  const rock = ents[0];
  rock.pos.x = 10; rock.pos.z = 0;
  world.refreshVisibleEntity(world.getSlotForEntityId(rock.id), rock, rock.radius);
  clearAllDirty(world);
  const first = queries.query(options);
  const ids1 = first.visibleSlots.map((s) => world.entityIds[s]).sort((a,b)=>a-b);
  // Pose-dirty retain: yaw player, rock stays
  player.rot += 0.1;
  world.refreshVisibleEntity(world.getSlotForEntityId(1), player, 6);
  const mid = queries.query(options);
  assertOk(mid.newlyVisibleCount === 0, 'yaw retain newlyVisible');
  assertOk(mid.hiddenCount === 0, 'yaw retain hidden');
  // Rock leaves cull via pose dirty → must hide
  rock.pos.x = 400;
  world.refreshVisibleEntity(world.getSlotForEntityId(rock.id), rock, rock.radius);
  const left = queries.query(options);
  assertOk(left.hiddenSlots.map((s) => world.entityIds[s]).includes(rock.id), 'pose leave hides');
  assertOk(!left.visibleSlots.map((s) => world.entityIds[s]).includes(rock.id), 'left not visible');
  // Newcomer outside → fail open (BINDING would also); spawn-like: refresh a far entity into cull
  // Move rock back in — was not visible, dirty TRANSFORM, not in prior visible → full walk admits
  clearAllDirty(world);
  queries.query(options); // settle
  rock.pos.x = 10;
  world.refreshVisibleEntity(world.getSlotForEntityId(rock.id), rock, rock.radius);
  const back = queries.query(options);
  assertOk(back.visibleSlots.map((s) => world.entityIds[s]).includes(rock.id), 'reenter admits');
  return { ok: true, ids1 };
}
function assertOk(cond, msg) {
  if (!cond) throw new Error('dirtyWakeProof: ' + msg);
}

const primary = benchPairs('quiet-180ents-parked-poseDirty-yaw+npcDrift', { yaw: true, cruise: false });
const cruise = benchPairs('informational-cruise-poseDirty', { yaw: true, cruise: true });
let wake;
try { wake = dirtyWakeProof(); } catch (e) { wake = { ok: false, error: String(e && e.message || e) }; }

const out = {
  primary,
  cruiseInformational: cruise,
  dirtyWake: wake,
  poseDirtyRetainEnabled: getPresentationQueryPoseDirtyRetainForBench(),
  iters: ITERS,
  ents: ENTS,
  runs: RUNS,
};
writeFileSync('artifacts/presentation-query-pose-dirty-retain-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
