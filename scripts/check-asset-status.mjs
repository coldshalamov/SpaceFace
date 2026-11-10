// Asset-status policy: enforces that known-broken / blocked assets can never be reached from
// runtime code, and that no asset is "ambiguous" (in runtimeSlots but missing from parts[]).
//
// WHY THIS EXISTS: the repo carried three 10-14MB wholeship GLBs (kestrel/pelican/wasp) that were
// broken exports — accessory-only, no Material_Hull body. They sat in `runtimeSlots.hull` looking
// like the "real detailed models," so every agent told to "wire up the assets" found them, added
// them to WHOLE_SHIP_FILE_BY_DEF_ID, and turned the player ship into floating accessories (the
// "turd"). File size does NOT distinguish a good model from a broken export. The manifest
// `status: "blocked"` field + this check do.
//
// Run: `npm run check:asset-status`. Exits 1 on any violation.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const partsLibrary = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');

let failures = 0;
function fail(msg) { failures++; console.log(`FAIL  ${msg}`); }
function ok(msg) { console.log(`ok    ${msg}`); }

// --- 1. blocked assets are not reachable from runtime code ---
const blockedFiles = new Set();
const blockedById = new Map();
for (const part of manifest.parts || []) {
  if (part.status === 'blocked') {
    blockedFiles.add(part.file);
    blockedById.set(part.id, part);
  }
}

if (blockedFiles.size === 0) {
  ok('no blocked assets declared');
} else {
  for (const [id, part] of blockedById) {
    ok(`blocked asset tracked: ${id} (${part.file}) — ${part.statusNote ? String(part.statusNote).split('.')[0] : 'no note'}`);
  }
  // Parse the ship→GLB wiring maps out of partsLibrary.js as DATA, then check membership.
  // The two wiring points are HULL_FILE_BY_DEF_ID and WHOLE_SHIP_FILE_BY_DEF_ID. Each is a frozen
  // object literal mapping shipId → '<category>/<file>.glb'. Extract every string value and check
  // none of them is a blocked file.
  const wiredFiles = new Set();
  const mapRe = /(?:HULL_FILE_BY_DEF_ID|WHOLE_SHIP_FILE_BY_DEF_ID)\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/g;
  let mapMatch;
  while ((mapMatch = mapRe.exec(partsLibrary)) !== null) {
    const body = mapMatch[1];
    const valueRe = /['"]([a-z][a-z0-9_/]*\.glb)['"]/g;
    let valueMatch;
    while ((valueMatch = valueRe.exec(body)) !== null) {
      wiredFiles.add(valueMatch[1]);
    }
  }
  for (const file of blockedFiles) {
    if (wiredFiles.has(file)) {
      fail(`BLOCKED ASSET IS WIRED INTO RUNTIME: ${file} appears in HULL_FILE_BY_DEF_ID or WHOLE_SHIP_FILE_BY_DEF_ID in src/render/partsLibrary.js. This will render as floating accessories / a turd. Remove the wiring or re-export the model with a real hull body (>=800 hull tris, Material_Hull mesh).`);
    }
  }
}

// --- 2. no ambiguous assets: every runtimeSlots entry must have a parts[] entry ---
const partFiles = new Set((manifest.parts || []).map((p) => p.file));
const ambiguous = [];
for (const [slot, files] of Object.entries(manifest.runtimeSlots || {})) {
  for (const file of files) {
    if (!partFiles.has(file)) ambiguous.push(`${file} (slot: ${slot})`);
  }
}
if (ambiguous.length === 0) {
  ok(`every runtimeSlots entry has a parts[] entry (${partFiles.size} parts tracked)`);
} else {
  for (const a of ambiguous) {
    fail(`AMBIGUOUS ASSET: ${a} is in runtimeSlots but has NO parts[] manifest entry. An agent cannot tell whether this is a live asset or a broken export — add a parts[] entry (with status:"blocked" if it's broken) so the asset's state is machine-readable.`);
  }
}

// --- 3. blocked entries must declare why ---
for (const part of manifest.parts || []) {
  if (part.status === 'blocked' && (!part.statusNote || part.statusNote.length < 20)) {
    fail(`blocked asset ${part.id} has no meaningful statusNote (>=20 chars required)`);
  }
}

// --- summary ---
if (failures === 0) {
  console.log(`\nAsset status OK: ${partFiles.size} parts tracked, ${blockedFiles.size} blocked, 0 reachable from runtime, 0 ambiguous.`);
  process.exit(0);
} else {
  console.log(`\n${failures} asset-status failure(s).`);
  process.exit(1);
}
