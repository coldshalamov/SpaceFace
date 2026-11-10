// #164 microbench: stock scene.updateMatrixWorld() vs retained walk on a census-shaped scene
// (quiet Ceres stack census: 594 nodes, 585 matrixAutoUpdate, ~12 local changes/frame,
// ~162 world changes/frame). Also verifies matrixWorld bit-equality every frame.
import * as THREE from 'three';
import { updateSceneMatrixWorld, setSceneMatrixRetainForBench, resetSceneMatrixRetainForBench, sceneMatrixRetainStats } from '../src/render/sceneMatrixRetain.js';

const FRAMES = +(process.env.FRAMES || 20000);
const WARM = +(process.env.WARM || 3000);
let seed = 1234;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function subtree(size, depth = 0) {
  const root = new THREE.Group();
  root.position.set(rnd() * 10, 0, rnd() * 10);
  root.rotation.y = rnd() * 6;
  let left = size - 1;
  while (left > 0) {
    const k = Math.min(left, depth > 3 ? 1 : 1 + Math.floor(rnd() * Math.min(left, 30)));
    const child = k === 1 ? new THREE.Mesh() : subtree(k, depth + 1);
    if (k === 1) { child.position.set(rnd(), rnd(), rnd()); child.rotation.set(rnd(), rnd(), rnd()); }
    root.add(child);
    left -= k;
  }
  return root;
}

function buildScene(n = 594) {
  seed = 1234;
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false; // as renderer.js presented scene
  const sizes = [132, 72, 51, 17, 14, 13, 12, 11, 8, 8, 7, 6, 6, 6, 6];
  const roots = [];
  let total = 1;
  for (const s of sizes) { const r = subtree(s); scene.add(r); roots.push(r); total += s; }
  while (total < n) { const s = Math.min(n - total, 1 + Math.floor(rnd() * 6)); const r = subtree(s); scene.add(r); roots.push(r); total += s; }
  // 9 manual-matrix nodes (census autoOff)
  let off = 0;
  scene.traverse((o) => { if (off < 9 && o.isMesh && rnd() < 0.05) { o.matrixAutoUpdate = false; o.updateMatrix(); off++; } });
  // movers: kestrel root (132 subtree), SpaceBackground (13), plasma root (14) + 9 interior nodes
  const movers = [roots[0], roots[5], roots[4]];
  const interior = [];
  roots[0].traverse((o) => { if (interior.length < 5 && o !== roots[0] && o.matrixAutoUpdate && rnd() < 0.1) interior.push(o); });
  roots[6].traverse((o) => { if (interior.length < 9 && o !== roots[6] && o.matrixAutoUpdate) interior.push(o); });
  return { scene, movers: movers.concat(interior) };
}

function frame(movers, t) {
  for (let i = 0; i < movers.length; i++) {
    const m = movers[i];
    m.position.x += 0.37; m.position.z += 0.11 * Math.sin(t * 0.01 + i);
    m.rotation.y = 0.001 * t + i;
  }
}

function run(retain) {
  setSceneMatrixRetainForBench(retain);
  resetSceneMatrixRetainForBench();
  const { scene, movers } = buildScene();
  for (let t = 0; t < WARM; t++) { frame(movers, t); updateSceneMatrixWorld(scene); }
  const t0 = process.hrtime.bigint();
  for (let t = WARM; t < WARM + FRAMES; t++) { frame(movers, t); updateSceneMatrixWorld(scene); }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / FRAMES;
  return { us, scene, movers };
}

function verify() {
  // lockstep: identical scenes, stock vs retained, compare every node every frame
  setSceneMatrixRetainForBench(true); resetSceneMatrixRetainForBench();
  const A = buildScene(); const B = buildScene();
  const listA = [], listB = [];
  A.scene.traverse((o) => listA.push(o)); B.scene.traverse((o) => listB.push(o));
  let mismatches = 0;
  for (let t = 0; t < 600; t++) {
    frame(A.movers, t); frame(B.movers, t);
    if (t === 200) { const c = listA[40]; const d = listB[40]; const pa = listA[300], pb = listB[300]; pa.attach ? pa.add(c) : 0; pb.add(d); }
    if (t === 300) { listA[77].matrix.makeTranslation(t, 1, 2); listB[77].matrix.makeTranslation(t, 1, 2); listA[77].matrixAutoUpdate = false; listB[77].matrixAutoUpdate = false; }
    if (t === 350) { listA[77].matrixAutoUpdate = true; listB[77].matrixAutoUpdate = true; }
    // detach → standalone world update → re-attach inside one frame (Box3.setFromObject pattern)
    if (t === 400) for (const L of [listA, listB]) { const o = L[20], par = o.parent; par.remove(o); o.updateWorldMatrix(false, false); par.add(o); }
    // detach for several frames while the old parent keeps moving, then re-attach
    if (t === 420) for (const L of [listA, listB]) { L.__held = L[5]; L.__par = L[5].parent; L.__par.remove(L[5]); }
    if (t === 460) for (const L of [listA, listB]) { L.__par.add(L.__held); }
    // manual world matrix write on an auto node
    if (t === 480) for (const L of [listA, listB]) { L[90].matrixWorld.makeScale(3, 3, 3); }
    // matrixWorldNeedsUpdate flag on a static manual node after changing its matrix
    if (t === 500) for (const L of [listA, listB]) { L[111].matrixAutoUpdate = false; L[111].matrix.makeRotationY(1); L[111].matrixWorldNeedsUpdate = true; }
    A.scene.updateMatrixWorld(true);
    updateSceneMatrixWorld(B.scene);
    for (let i = 0; i < listA.length; i++) {
      const ea = listA[i].matrixWorld.elements, eb = listB[i].matrixWorld.elements;
      for (let k = 0; k < 16; k++) if (!Object.is(ea[k], eb[k]) && !(ea[k] === 0 && eb[k] === 0)) { mismatches++; break; }
    }
  }
  return { mismatches, nodes: listA.length };
}

const v = verify();
const reps = +(process.env.REPS || 5);
const rows = [];
for (let r = 0; r < reps; r++) {
  const s = run(false).us;
  const q = run(true);
  rows.push({ stockUs: +s.toFixed(3), retainUs: +q.us.toFixed(3), speedup: +(s / q.us).toFixed(2) });
}
const stats = sceneMatrixRetainStats();
const sp = rows.map((r) => r.speedup).sort((a, b) => a - b);
console.log(JSON.stringify({ verify: v, rows, median: sp[Math.floor(sp.length / 2)], floor: sp[0], perWalk: {
  visited: stats.visited / stats.walks, composed: stats.composed / stats.walks, multiplied: stats.multiplied / stats.walks } }, null, 1));
