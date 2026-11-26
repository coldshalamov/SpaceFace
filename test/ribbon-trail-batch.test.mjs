// NPC ribbon batch (rfx `ribbonBatch`, default ON): every NPC wake lane writes one vertex
// slice of ONE shared BufferGeometry + ONE shared program instead of minting a mesh per ship.
//
// Contracts under test:
//   * live instance count tracks live ribbon ships (acquire/checkout, dispose/checkin)
//   * uploads publish bounded dirty component spans on persistent updateRanges records —
//     never whole-buffer reposts, never per-write allocations
//   * lanes keep the solo trail API/visual contract (same strip maths → same head vertices)
//   * ships leaving collapse their stale pairs to zero-area; recycled slots never inherit
//     another hull's wake
//   * the shared mesh honors the userData.pipelinesPending compile latch
//   * rfx off restores the prior per-entity mesh path

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createRibbonTrail,
  createRibbonTrailBatch,
} from '../src/render/engineTrailSurfaces.js';
import { vfx } from '../src/render/vfx.js';
import { resolveActuatorScale } from '../src/render/rcsJets.js';

const NSEG = 8;
const VPL = NSEG * 2;

function liveLane(batch, color = '#7fe0ff', width = 2) {
  const lane = batch.acquire(color, width);
  lane.push(-3, 0, 0);
  lane.push(3, 0, 0);
  return lane;
}

/** Emulate the driver consuming published ranges after an upload. */
function clearRanges(geometry) {
  for (const key of Object.keys(geometry.attributes)) {
    geometry.attributes[key].updateRanges.length = 0;
  }
}

test('the fleet batch owns exactly one mesh and one program for every lane', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 4, nSeg: NSEG });
  assert.equal(scene.children.length, 1, 'a fresh batch must add one render object');
  assert.equal(scene.children[0], batch.mesh);
  assert.equal(batch.mesh.name, 'SF_RibbonTrailBatch');
  assert.equal(batch.mesh.visible, false, 'an empty batch draws nothing');
  assert.equal(batch.mesh.frustumCulled, false);
  assert.equal(batch.mesh.renderOrder, 4, 'same renderOrder as the solo ribbon it replaces');
  assert.equal(batch.material.type, 'ShaderMaterial');
  assert.equal(batch.material.transparent, true);
  assert.equal(batch.material.blending, THREE.AdditiveBlending);
  assert.equal(batch.liveCount, 0);

  const lanes = [liveLane(batch, '#ff0000'), liveLane(batch, '#00ff00'), liveLane(batch)];
  assert.equal(batch.liveCount, 3);
  for (const lane of lanes) {
    assert.strictEqual(lane.getMesh(), batch.mesh, 'every lane shares the one fleet mesh');
    assert.strictEqual(lane.getMaterial(), batch.material, 'every lane shares the one program');
  }
  const slots = new Set(lanes.map((lane) => lane.inspect().slot));
  assert.equal(slots.size, 3, 'each lane must own a distinct vertex slice');
  const fourth = batch.acquire('#ffffff', 1);
  assert.ok(fourth, 'the last free slot still checks out');
  assert.equal(batch.liveCount, 4);
  assert.equal(batch.acquire('#ffffff'), null, 'a full batch refuses rather than allocating');
  assert.equal(batch.liveCount, 4);
  batch.dispose();
});

test('a rebuilt lane publishes only its own slice as the dirty range', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 4, nSeg: NSEG });
  const laneA = liveLane(batch);
  const laneB = liveLane(batch);
  const geo = batch.mesh.geometry;
  clearRanges(geo);

  laneA.rebuild(0.8, 0.1, 1, 1.6);
  const slotA = laneA.inspect().slot;
  const baseA = slotA * VPL;
  const posRange = geo.attributes.position.updateRanges[0];
  assert.equal(geo.attributes.position.updateRanges.length, 1,
    'the batch must publish one coalesced dirty span per attribute, not a record per write');
  assert.equal(posRange.start, baseA * 3,
    'position upload must begin at the rebuilt slot, not at component zero');
  assert.ok(posRange.count <= VPL * 3,
    'a single lane must never dirty more than its own vertex slice');
  assert.ok(posRange.count >= laneA.inspect().renderedCount * 6,
    'the live strip itself must be inside the published span');

  // A second lane's rebuild widens the same publication to span both slices — still one
  // bounded range, never a whole-buffer repost.
  laneB.rebuild(0.8, 0.1, 1, 1.6);
  const posRange2 = geo.attributes.position.updateRanges[0];
  assert.equal(geo.attributes.position.updateRanges.length, 1);
  assert.equal(posRange2.start, Math.min(baseA, laneB.inspect().slot * VPL) * 3);
  assert.ok(posRange2.count <= 2 * VPL * 3,
    `two adjacent lanes must upload at most two slices, got ${posRange2.count}`);
  assert.ok(posRange2.count < geo.attributes.position.array.length,
    'dirty span must stay smaller than the whole pooled buffer');
  batch.dispose();
});

test('a cadence head sync uploads only its two head vertices', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 2, nSeg: 10 });
  const lane = batch.acquire('#7fe0ff', 2);
  const owner = { id: 9 };
  let x = 0;
  for (let i = 0; i < 6; i++) {
    x += 4;
    lane.follow(x, 0, 0, 1 / 30, owner, 3, 640, 1 / 30);
  }
  lane.rebuild(0.8, 0.1, 1, 1.6);
  const geo = batch.mesh.geometry;
  clearRanges(geo);
  const rebuilds = lane.inspect().fullRebuildCount;
  x += 4;
  lane.follow(x, 0.5, 0, 1 / 60, owner, 3, 640, 1 / 30);
  assert.equal(lane.syncHead(0.7, 0.2, 1.5, 1.5), true);
  const range = geo.attributes.position.updateRanges[0];
  const slotBase = lane.inspect().slot * VPL;
  assert.equal(range.start, slotBase * 3);
  assert.equal(range.count, 6, 'head sync must upload exactly one vertex pair');
  assert.equal(lane.inspect().fullRebuildCount, rebuilds,
    'head sync must not rebuild full history');
  batch.dispose();
});

test('per-lane color and shade write the shared attributes at the lane slice', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 3, nSeg: NSEG });
  const red = liveLane(batch, '#ff0000');
  const blue = liveLane(batch, '#0000ff');
  const geo = batch.mesh.geometry;
  const colors = geo.attributes.aTrailColor.array;
  const shade = geo.attributes.aTrailShade.array;
  const redBase = red.inspect().slot * VPL * 3;
  const blueBase = blue.inspect().slot * VPL * 3;
  assert.equal(colors[redBase], 1, 'lane tint reaches its own slice, first vertex r');
  assert.equal(colors[redBase + 1], 0);
  assert.equal(colors[blueBase + 2], 1, 'second lane tint lands in a different slice');
  red.rebuild(0.42, 0.1, 1, 2.0);
  blue.rebuild(0.9, 0.1, 1, 1.0);
  const redShade = red.inspect().slot * VPL * 2;
  const blueShade = blue.inspect().slot * VPL * 2;
  assert.ok(Math.abs(shade[redShade] - 0.42) < 1e-6, 'per-owner opacity reaches its slice');
  assert.ok(Math.abs(shade[blueShade] - 0.9) < 1e-6);
  assert.ok(Math.abs(shade[redShade + 1] - 2.0) < 1e-6, 'per-owner radiance reaches its slice');
  batch.dispose();
});

test('a released lane collapses its stale pairs and its slot recycles cleanly', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 2, nSeg: NSEG });
  const laneA = liveLane(batch);
  liveLane(batch); // occupy the second slot so A's slice is observable after release
  const slotA = laneA.inspect().slot;
  const baseVerts = slotA * VPL;
  laneA.push(9, 2, Math.PI / 4);
  laneA.rebuild(0.8, 0.1, 1, 1.6);
  const geo = batch.mesh.geometry;
  const pos = geo.attributes.position.array;
  laneA.dispose();
  assert.equal(batch.liveCount, 1, 'releasing returns the slot to the pool');
  // After release every pair in the slot must be identical (all quads zero-area) so no
  // ghost geometry survives inside the shared buffer — including the boundary quad that
  // would otherwise bridge live strip into dead vertex space.
  const anchor = Array.from(pos.slice(baseVerts * 3, baseVerts * 3 + 6));
  for (let p = 1; p < NSEG; p++) {
    const pair = Array.from(pos.slice((baseVerts + p * 2) * 3, (baseVerts + p * 2) * 3 + 6));
    assert.deepEqual(pair, anchor,
      `dead pair ${p} must collapse to a uniform point — no stale ghost strip`);
  }
  // Recycled slot never inherits the old hull's wake.
  const laneC = batch.acquire('#00ffff', 2);
  assert.equal(laneC.inspect().slot, slotA, 'the freed slot is the one recycled');
  assert.equal(laneC.inspect().historyCount, 0);
  assert.equal(laneC.inspect().visiblePointCount, 0);
  batch.dispose();
});

test('a batched lane draws the identical head vertices a solo trail draws', () => {
  const soloScene = new THREE.Scene();
  const solo = createRibbonTrail(soloScene, '#7fe0ff', NSEG, 2);
  const batchScene = new THREE.Scene();
  const batch = createRibbonTrailBatch(batchScene, { capacity: 1, nSeg: NSEG });
  const lane = batch.acquire('#7fe0ff', 2);
  const owner = { id: 4 };
  for (const t of [solo, lane]) {
    t.follow(0, 0, 0, 1 / 60, owner, 3, 640, 1 / 30);
    t.follow(20, 4, 0.2, 1 / 30, owner, 3, 640, 1 / 30);
    t.rebuild(0.8, 0.1, 1, 1.6);
  }
  const soloPos = solo.getMesh().geometry.attributes.position.array;
  const base = lane.inspect().slot * VPL * 3;
  const batchPos = batch.mesh.geometry.attributes.position.array;
  const livePairs = solo.inspect().renderedCount;
  assert.ok(livePairs >= 2, 'precondition: a real strip was drawn');
  assert.equal(lane.inspect().renderedCount, livePairs,
    'the batched lane must produce the same live strip length as the solo trail');
  for (let i = 0; i < livePairs * 6; i++) {
    assert.ok(Math.abs(soloPos[i] - batchPos[base + i]) < 1e-6,
      `vertex component ${i} diverged: solo ${soloPos[i]} vs batch ${batchPos[base + i]}`);
  }
  const soloNormal = solo.getMesh().geometry.attributes.aTrailNormal.array;
  const batchNormal = batch.mesh.geometry.attributes.aTrailNormal.array;
  for (let i = 0; i < livePairs * 6; i++) {
    assert.ok(Math.abs(soloNormal[i] - batchNormal[base + i]) < 1e-6,
      `arched normal component ${i} diverged between solo and batch`);
  }
  batch.dispose();
});

test('the shared mesh honors the pipeline-compile latch', () => {
  const scene = new THREE.Scene();
  const batch = createRibbonTrailBatch(scene, { capacity: 2, nSeg: NSEG });
  const lane = liveLane(batch);
  batch.mesh.userData.pipelinesPending = true;
  lane.rebuild(0.8, 0.1, 1, 1.6);
  assert.equal(batch.mesh.visible, false, 'a held batch must not draw before its program links');
  batch.mesh.userData.pipelinesPending = false;
  lane.rebuild(0.8, 0.1, 1, 1.6);
  assert.equal(batch.mesh.visible, true, 'a settled batch reveals');
  // An admitted program is not re-blanked by a re-admission latch mid-flight.
  batch.mesh.userData.sfAdmittedOnce = true;
  batch.mesh.userData.pipelinesPending = true;
  lane.rebuild(0.8, 0.1, 1, 1.6);
  assert.equal(batch.mesh.visible, true);
  batch.dispose();
});

// ---- vfx wiring: mint/cull paths feed live slots, rfx-off restores per-entity meshes.

function movingNpc(id = 7) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 120, z: 40 },
    vel: { x: 60, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 24,
    mass: 200,
    maxSpeed: 200,
    flags: {},
    presentation: null,
    _flightFrame: { acceleration: { x: 0, z: 0 }, throttle: 0.8 },
  };
}

function ribbonSystem(npcs, t) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 60,
    flags: {}, presentation: null, _flightFrame: {},
  };
  const entities = new Map([[1, player]]);
  for (const npc of npcs) entities.set(npc.id, npc);
  const system = Object.create(vfx);
  system._scene = new THREE.Scene();
  system.state = {
    playerId: 1,
    player: { cruise: null, targetId: npcs[0] ? npcs[0].id : null },
    entities,
    entityList: [player, ...npcs],
    input: {},
    settings: { video: {} },
    flightRuntime: {},
  };
  system._t = t;
  system._actuatorScratch = {};
  system._rcsScaleCache = new Map();
  system._rcsDefaultScale = resolveActuatorScale(null);
  system._plumeDashPending = false;
  system._trailCandidates = [];
  system._ribbonCandidates = [];
  system._trailCacheDirty = true;
  system._trailListRef = null;
  system._trailListLength = -1;
  system._trailContextScratch = {};
  system._trailScreenCheckScratch = { remaining: 0 };
  system._tableLookAtScratch = { x: 0, z: 0 };
  system._tableVfxDrawWu = 6000;
  system._initRibbonTrails();
  system._spawnLocalXZ = { x: 0, z: 0 };
  system._entityLocalXZ = { x: 0, z: 0 };
  system._trailScreenScratch = new THREE.Vector3();
  return system;
}

function ribbonMeshes(scene) {
  return scene.children.filter((child) => child.name === 'SF_RibbonTrail'
    || child.name === 'SF_RibbonTrailBatch');
}

test('batched NPC mint: one shared mesh, live count tracks live ribbon ships', () => {
  const npcA = movingNpc(7);
  const npcB = movingNpc(8);
  const system = ribbonSystem([npcA, npcB], 10);
  for (let i = 0; i < 6; i++) {
    npcA.pos.x += 6;
    npcB.pos.x += 6;
    system._t += 1 / 60;
    system._updateRibbonTrails(1 / 60);
  }
  const batch = system._ribbonBatch;
  assert.ok(batch, 'the batched path must mint the shared fleet batch');
  assert.equal(batch.inspect().liveCount, 2,
    'two live ribbon ships must hold exactly two checked-out lanes');
  assert.equal(system._ribbonTrails.size, 2);
  const meshes = ribbonMeshes(system._scene);
  assert.equal(meshes.length, 1, 'N ribbon ships must submit ONE ribbon draw object');
  assert.equal(meshes[0], batch.mesh);
  assert.equal(batch.mesh.visible, true, 'a cohort with live lanes draws');
  assert.ok(system._ribbonTrails.get(7).inspect().renderedCount >= 2,
    'the lane must still build a real strip inside the shared buffer');

  // One ship dies: its lane returns to the pool, the count tracks the live ships.
  npcB.alive = false;
  system._updateRibbonTrails(1 / 60);
  assert.equal(batch.inspect().liveCount, 1, 'a lost ship must check its lane back in');
  assert.equal(system._ribbonTrails.size, 1);

  // A replacement mint reuses the freed slot — still one mesh, still bounded live count.
  const npcC = movingNpc(9);
  system.state.entities.set(9, npcC);
  system.state.entityList.push(npcC);
  for (let i = 0; i < 4; i++) {
    npcA.pos.x += 6;
    npcC.pos.x += 6;
    system._t += 1 / 60;
    system._updateRibbonTrails(1 / 60);
  }
  assert.equal(batch.inspect().liveCount, 2);
  assert.equal(ribbonMeshes(system._scene).length, 1,
    'join/leave churn must still submit exactly one ribbon draw object');
});

test('rfx off restores the prior per-entity mesh path', () => {
  globalThis.__sfRfx = { ribbonBatch: false };
  try {
    const npc = movingNpc(7);
    const system = ribbonSystem([npc], 10);
    for (let i = 0; i < 4; i++) {
      npc.pos.x += 6;
      system._t += 1 / 60;
      system._updateRibbonTrails(1 / 60);
    }
    assert.equal(system._ribbonBatch, null, 'rfx off must never mint the shared batch');
    const trail = system._ribbonTrails.get(7);
    assert.ok(trail, 'rfx off still mints a per-entity ribbon trail');
    assert.equal(trail.getMesh().name, 'SF_RibbonTrail',
      'the solo mesh contract is restored behind the switch');
    const meshes = ribbonMeshes(system._scene);
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0], trail.getMesh());
    assert.ok(trail.inspect().renderedCount >= 2);
  } finally {
    delete globalThis.__sfRfx;
  }
});
