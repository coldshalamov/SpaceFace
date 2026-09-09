#!/usr/bin/env node
// scripts/rebuild-kestrel-remaster-to-budget.mjs
//
// Bring the remastered Kestrel inside its draw-call budget WITHOUT discarding the remaster.
//
// THE PROBLEM
// -----------
// The remastered hull carries 31 primitives / 30 draws against a contract of 24
// (check-kestrel-wholeship-runtime). The player's ship is the most-drawn object in the game, so
// that budget is real and the runtime refuses the hull outright -- the game then reports the hull
// as absent and will not enter flight. Reverting to the previously shipped artifact fixes the game
// but throws away better geometry (44 nodes / 31 meshes against 37 / 24), which is not an
// acceptable trade when the two are not actually in conflict.
//
// WHAT THIS PROVED, AND WHY IT REFUSES
// ------------------------------------
// Draw calls are per PRIMITIVE, and this hull's 31 primitives use only 17 materials, so on paper a
// material-wise join reaches 18 draws with no visual change and no triangle loss.
//
// It cannot be done mechanically here. Every primitive sits on its own NAMED mesh/node, and the
// only way `join` merges them is `keepNamed: false` -- which also merges away the nine SOCKET_*
// nodes that weapons, thrusters and the chase camera are mounted to. Silently misaligned weapon
// fire is a far worse outcome than a hull that is six draws over budget, so this script refuses
// rather than guessing.
//
// It also surfaced a SECOND defect in the remaster's export, independent of draw count: the
// sockets are named `SOCKET_Weapon_Front.001`, `SOCKET_Engine_Main.001` and so on -- Blender's
// duplicate-name suffix. The runtime contract expects the unsuffixed names, so those mounts would
// not resolve even if the budget were met.
//
// The fix is therefore in the .blend, not in the GLB: join the mesh OBJECTS that share a material
// (31 -> 18), leave the SOCKET_ empties alone, clear the .001 suffixes, and re-export. This script
// is kept because it measures all four gates -- draws, triangles, sockets, names -- in one command,
// so that re-export can be checked in seconds instead of by launching the game.
//
//   node scripts/rebuild-kestrel-remaster-to-budget.mjs [--apply]
//
// Without --apply it writes a candidate beside the source and reports the numbers, touching no
// live path.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { join, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const SOURCE = resolve(ROOT, 'assets/ships/parts/wholeships/kestrel.glb');
const CANDIDATE_DIR = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4/release_candidates/wholeships');
const CANDIDATE = resolve(CANDIDATE_DIR, 'kestrel_joined_lod0.glb');
const MAX_DRAWS = 24;   // check-kestrel-wholeship-runtime.mjs:18

function summarise(doc) {
  const root = doc.getRoot();
  let prims = 0;
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      prims++;
      const indices = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() : (pos ? pos.getCount() : 0);
      tris += Math.floor(count / 3);
    }
  }
  const sockets = root.listNodes().map((n) => n.getName()).filter((n) => n && n.startsWith('SOCKET_'));
  return { prims, tris, meshes: root.listMeshes().length, nodes: root.listNodes().length, sockets: sockets.sort() };
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(SOURCE);
const before = summarise(doc);

// prune is NOT run. The SOCKET_* nodes are empty leaves -- pure transforms marking weapon muzzles,
// thruster mounts and camera focus -- and prune removes childless nodes, taking the whole socket
// contract with them. keepLeaves did not prevent it in this version. dedup+join is enough anyway.
await doc.transform(
  dedup(),
  join({ keepNamed: true }),
);
const after = summarise(doc);

// A join must never lose triangles. If it does, geometry was dropped rather than merged, and the
// result is a different model wearing the same name.
const trianglesLost = before.tris - after.tris;
// Sockets are a contract with the weapon and thruster mounts. Losing one misaligns fire.
const socketsLost = before.sockets.filter((s) => !after.sockets.includes(s));
// Blender appends .001/.002 to duplicated objects. The runtime resolves sockets by exact name, so a
// suffixed socket is an unmounted socket -- and it looks perfectly fine in a viewer.
const suffixedSockets = before.sockets.filter((s) => /\.\d{3}$/.test(s));

console.log(`source      ${before.meshes} meshes / ${before.prims} draws / ${before.tris} tris / ${before.sockets.length} sockets`);
console.log(`joined      ${after.meshes} meshes / ${after.prims} draws / ${after.tris} tris / ${after.sockets.length} sockets`);
console.log(`budget      ${MAX_DRAWS} draws`);
console.log(`triangles   ${trianglesLost === 0 ? 'preserved' : `LOST ${trianglesLost}`}`);
console.log(`sockets     ${socketsLost.length === 0 ? 'preserved' : `LOST ${socketsLost.join(', ')}`}`);
console.log(`names       ${suffixedSockets.length === 0 ? 'clean' : `${suffixedSockets.length} socket(s) carry a .00N duplicate suffix`}`);

const failures = [];
if (after.prims > MAX_DRAWS) failures.push(`still ${after.prims} draws, over the ${MAX_DRAWS} budget`);
if (trianglesLost !== 0) failures.push(`joining lost ${trianglesLost} triangles`);
if (socketsLost.length) failures.push(`joining lost sockets: ${socketsLost.join(', ')}`);
if (suffixedSockets.length) {
  failures.push(`sockets carry Blender duplicate suffixes and will not resolve at runtime: ${suffixedSockets.join(', ')}`);
}
if (failures.length) {
  console.error(`\nREFUSING to write: ${failures.join('; ')}`);
  console.error('This hull needs an authoring-side reduction, not a mechanical join.');
  process.exitCode = 1;
} else {
  if (!existsSync(CANDIDATE_DIR)) mkdirSync(CANDIDATE_DIR, { recursive: true });
  await io.write(CANDIDATE, doc);
  const bytes = readFileSync(CANDIDATE).length;
  console.log(`\ncandidate   ${CANDIDATE.replace(ROOT, '.')} (${(bytes / 1048576).toFixed(1)} MB)`);
  if (APPLY) {
    writeFileSync(SOURCE, readFileSync(CANDIDATE));
    console.log(`applied     ${SOURCE.replace(ROOT, '.')}`);
    console.log('Next: node scripts/build-release-assets.mjs --wholeships-only, then check:bundle.');
  } else {
    console.log('\ndry run - pass --apply to replace the authored source with the joined hull.');
  }
}
