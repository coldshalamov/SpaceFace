#!/usr/bin/env node
// Per-asset forensics: what is actually inside one model, and what is it paying for?
//
// Totals hide the answer. Inside a single GLB the cost is usually a handful of decisions:
// a cylinder modeled at 128 segments that reads identical at 24, a greeble stack that is
// 40% of the triangles and 12 px on screen, the same bolt mesh instanced 200 times as
// separate nodes, a 2048 map on a 40 px panel, a UV set nothing samples.
//
// This walks one asset (or a matched release+package pair) and prints the shape of its cost
// so a human can decide what to change. Read-only.
//
//   node scripts/asset-forensics.mjs assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb
//   node scripts/asset-forensics.mjs --pair=wreck-cathedral
//   node scripts/asset-forensics.mjs --top=20 --dir=assets/ships/release/parts/places
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const PAIR = flag('pair');
const DIR = flag('dir');
const TOP = Number(flag('top') || 30);
const positional = argv.filter((a) => !a.startsWith('--'));

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const num = (n) => n.toLocaleString();
const f1 = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

function primStats(prim) {
  const position = prim.getAttribute('POSITION');
  const indices = prim.getIndices();
  const verts = position ? position.getCount() : 0;
  const tris = indices ? Math.round(indices.getCount() / 3) : Math.round(verts / 3);
  const min = position?.getMin([]) || [0, 0, 0];
  const max = position?.getMax([]) || [0, 0, 0];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const diagonal = Math.hypot(size[0], size[1], size[2]);
  return {
    tris,
    verts,
    min,
    max,
    size,
    diagonal,
    attributes: prim.listSemantics(),
    material: prim.getMaterial()?.getName() || '(none)',
    mode: prim.getMode(),
  };
}

function analyze(document, label) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const rows = [];
  let totalTris = 0;

  const visit = (node, depth) => {
    const mesh = node.getMesh();
    if (mesh) {
      for (const [index, prim] of mesh.listPrimitives().entries()) {
        const stat = primStats(prim);
        totalTris += stat.tris;
        rows.push({
          node: node.getName() || '(unnamed)',
          depth,
          mesh: mesh.getName() || '(unnamed)',
          prim: index,
          ...stat,
        });
      }
    }
    for (const child of node.listChildren()) visit(child, depth + 1);
  };
  for (const node of scene.listChildren()) visit(node, 0);

  // Asset bounds from real geometry, used to judge what is big and what is a speck.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const row of rows) {
    for (let axis = 0; axis < 3; axis += 1) {
      lo[axis] = Math.min(lo[axis], row.min?.[axis] ?? 0);
      hi[axis] = Math.max(hi[axis], row.max?.[axis] ?? 0);
    }
  }

  rows.sort((a, b) => b.tris - a.tris);

  // Duplicate primitives: identical triangle count + identical bounds is the cheap signature of
  // "the same greeble authored again instead of instanced".
  const dupes = new Map();
  for (const row of rows) {
    const key = `${row.tris}|${row.size.map((s) => s.toFixed(3)).join(',')}|${row.material}`;
    dupes.set(key, (dupes.get(key) || 0) + 1);
  }
  const repeated = [...dupes.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

  const materials = root.listMaterials();
  const materialRows = materials.map((material) => {
    const used = rows.filter((row) => row.material === material.getName());
    const texDims = ['getBaseColorTexture', 'getNormalTexture', 'getMetallicRoughnessTexture', 'getEmissiveTexture', 'getOcclusionTexture']
      .map((getter) => {
        const tex = material[getter]?.();
        if (!tex) return null;
        const size = tex.getSize?.() || [0, 0];
        return `${getter.replace(/^get|Texture$/g, '')}:${size[0]}x${size[1]}`;
      })
      .filter(Boolean);
    return {
      name: material.getName() || '(unnamed)',
      alpha: material.getAlphaMode(),
      doubleSided: material.getDoubleSided(),
      triShare: used.reduce((s, r) => s + r.tris, 0),
      prims: used.length,
      color: material.getBaseColorFactor().map((n) => n.toFixed(2)).join(','),
      emissive: material.getEmissiveFactor().map((n) => n.toFixed(2)).join(','),
      roughness: material.getRoughnessFactor(),
      metalness: material.getMetallicFactor(),
      textures: texDims,
      role: material.getExtras?.()?.spacefaceMaterialRole || null,
    };
  }).sort((a, b) => b.triShare - a.triShare);

  return { label, root, scene, rows, totalTris, bounds: { lo, hi }, repeated, materialRows };
}

function printReport(report) {
  const { label, rows, totalTris, materialRows, repeated } = report;
  const assetDiag = Math.hypot(
    report.bounds.hi[0] - report.bounds.lo[0],
    report.bounds.hi[1] - report.bounds.lo[1],
    report.bounds.hi[2] - report.bounds.lo[2],
  );
  console.log(`\n=== ${label} ===`);
  console.log(`primitives: ${rows.length}   triangles: ${num(totalTris)}   asset diagonal: ${f1(assetDiag)} units`);

  console.log('\n-- triangle budget by node (top) --');
  console.log('triangles    share   prims  size(units)    diagonal  material');
  let cumulative = 0;
  for (const row of rows.slice(0, TOP)) {
    cumulative += row.tris;
    const share = totalTris ? (row.tris / totalTris) * 100 : 0;
    console.log(
      `${String(num(row.tris)).padStart(9)}  ${share.toFixed(1).padStart(5)}%  ${String(1).padStart(5)}  `
      + `${f1(row.size[0]).padStart(4)}x${f1(row.size[1]).padStart(4)}x${f1(row.size[2]).padStart(5)}  `
      + `${f1(row.diagonal).padStart(9)}  ${row.node.slice(0, 44)}  [${row.material}]`,
    );
  }
  console.log(`  (top ${TOP} carry ${((cumulative / Math.max(1, totalTris)) * 100).toFixed(1)}% of all triangles)`);

  console.log('\n-- cheapest part of the budget to look at: many triangles on a small thing --');
  const inefficient = rows
    .filter((row) => row.tris >= 200)
    .map((row) => ({
      ...row,
      // triangles per square unit of its own bounds: high = dense detail on a small object
      density: row.tris / Math.max(0.01, (row.size[0] + row.size[1] + row.size[2]) ** 2),
    }))
    .sort((a, b) => b.density - a.density)
    .slice(0, 12);
  for (const row of inefficient) {
    console.log(
      `  ${String(num(row.tris)).padStart(7)} tris on ${f1(row.diagonal).padStart(8)}u  `
      + `density ${row.density.toFixed(1).padStart(8)}  ${row.node.slice(0, 48)}`,
    );
  }

  console.log('\n-- repeated geometry (same size + tris + material, authored again instead of instanced) --');
  if (!repeated.length) console.log('  none');
  for (const [key, count] of repeated.slice(0, 8)) {
    const [tris, size, material] = key.split('|');
    console.log(`  x${count}  ${tris} tris  ${size}u  [${material}]`);
  }

  console.log('\n-- materials --');
  console.log('triangles   prims  alpha     2sided  rough  metal  role            textures                          name');
  for (const row of materialRows) {
    console.log(
      `${String(num(row.triShare)).padStart(9)}  ${String(row.prims).padStart(5)}  ${row.alpha.padEnd(9)} `
      + `${String(row.doubleSided).padStart(6)}  ${row.roughness.toFixed(2)}   ${row.metalness.toFixed(2)}   `
      + `${String(row.role || '-').padEnd(15)} ${(row.textures.join(' ') || '-').padEnd(33)} ${row.name.slice(0, 30)}`,
    );
  }

  const attributeSets = new Set(rows.map((row) => row.attributes.join(',')));
  console.log(`\n-- vertex attribute layouts: ${attributeSets.size} distinct --`);
  for (const layout of attributeSets) console.log(`  ${layout}`);
}

function loadPair(key) {
  const pilots = JSON.parse(readFileSync(path.join(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8')).pilots;
  const pilot = pilots.find((p) => p.key === key);
  if (!pilot) throw new Error(`unknown pilot key ${key}`);
  return [
    path.join(ROOT, pilot.sourceUrl),
    path.join(ROOT, pilot.outputDir, 'render.glb'),
  ];
}

async function main() {
  let files = [];
  if (PAIR) files = loadPair(PAIR);
  else if (DIR) {
    files = readdirSync(path.join(ROOT, DIR))
      .filter((f) => f.endsWith('.glb'))
      .map((f) => path.join(ROOT, DIR, f));
  } else if (positional.length) files = positional.map((f) => path.resolve(ROOT, f));
  else {
    console.error('usage: node scripts/asset-forensics.mjs <file.glb...> | --pair=<pilot-key> | --dir=<dir> --top=<n>');
    process.exit(2);
  }

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`missing: ${file}`);
      continue;
    }
    const document = await io.read(file);
    printReport(analyze(document, path.relative(ROOT, file).replace(/\\/g, '/')));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
