#!/usr/bin/env node
// Forge publish: one command from forge ship files to live, packaged game bodies.
//   node tools/blender/forge/publish.mjs hornet [--skip-blender]
//   node tools/blender/forge/publish.mjs hornet,kestrel,place_cargo_pod_standard [--skip-blender]
//   node tools/blender/forge/publish.mjs hornet kestrel [--skip-blender]
//
// Per body: 1. Blender builds the ship and exports the contract GLB(s) into assets/ships/parts/*
//           2. parts_manifest row: forge material names, drive hook, note; then --sync
//           3. release build (KTX2 + meshopt) for exactly that body's files
// Once per run: 4. render-package pilots: refresh release hashes, mark forge hooks dynamic,
//                  rebuild all packages (every package embeds the pilots.json hash)
//               5. model-truth census regenerated (test/model-truth-census.test.mjs requires the
//                  committed census to equal a fresh run, so the whole file is kept)
// Batch mode exists because steps 4-5 dominate: publish everything first, pay them once.
// Every step is the repo's own tooling; this script only sequences it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FLEET = JSON.parse(readFileSync(join(ROOT, 'tools/blender/forge/fleet.json'), 'utf8'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const shipIds = args.flatMap((a) => a.split(',')).map((s) => s.trim()).filter(Boolean);
if (!shipIds.length) throw new Error('usage: publish.mjs <id>[,<id>...] [--skip-blender]');
for (const id of shipIds) {
  if (!FLEET.ships[id]) throw new Error(`unknown forge ship ${id}; known: ${Object.keys(FLEET.ships).join(', ')}`);
}

const BLENDER = process.env.BLENDER || 'blender';
const run = (cmd, args, opts = {}) => {
  console.log(`[publish] ${cmd} ${args.join(' ')}`);
  try {
    return execFileSync(cmd, args, { cwd: ROOT, stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
};

const pilotsDoc = JSON.parse(readFileSync(join(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8'));
const pilotKeys = new Set();
const releaseIds = new Set();
const manifestPath = join(ROOT, 'assets/ships/parts/parts_manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let manifestTouched = false;

for (const shipId of shipIds) {
  const entry = FLEET.ships[shipId];
  if (!process.argv.includes('--skip-blender')) {
    run(BLENDER, ['-b', '--python', `tools/blender/forge/ships/${shipId}.py`, '--', '--live'], { quiet: true });
  }

  const place = entry.layout === 'place';
  const dir = place ? (entry.parts_dir || 'places') : 'wholeships';
  const files = entry.layout === 'player'
    ? [entry.file, `${entry.file}_lod1`, `${entry.file}_lod2`]
    : [entry.file];
  for (const f of files) releaseIds.add(place ? f : `wholeship_${f}`);
  // Pilot keys are found by the release file they package (Wasp's LOD0 pilot is plain 'wasp').
  for (const f of files) {
    const hit = pilotsDoc.pilots.find((p) => p.sourceUrl === `assets/ships/release/parts/${dir}/${f}.glb`);
    if (!hit) throw new Error(`no render-package pilot packages ${dir}/${f}.glb`);
    pilotKeys.add(hit.key);
  }

  // manifest row. Some families (Drifter) are released from build-sg04's WHOLE_SHIP_FILES list,
  // not a manifest row.
  const row = manifest.parts.find((r) => r.id === (place ? entry.file : `wholeship_${entry.file}`)) || null;
  if (row) {
    // Tint slots name only materials this body actually carries (a ship without a livery stripe has
    // no Material_Accent).
    const glb = readFileSync(join(ROOT, 'assets/ships/parts', dir, `${entry.file}.glb`));
    const glbJson = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    const present = new Set((glbJson.materials || []).map((m) => m.name));
    row.tintable = Object.fromEntries(Object.entries({
      hull: 'Material_Hull', dark: 'Material_Armor', mechanical: 'Material_Mechanical',
      accent: 'Material_Accent', canopy: 'Material_Canopy', thruster: 'Material_Thruster',
    }).filter(([, name]) => present.has(name)));
    row.hooks = place ? [] : ['HOOK_DRIVE_CORE'];
    if (entry.note) row.note = entry.note;
    manifestTouched = true;
  }
}
if (manifestTouched) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
run('node', ['scripts/check-parts-manifest.mjs', '--sync'], { quiet: true });

// 3. release
run('node', ['scripts/build-sg04-release-assets.mjs', '--no-clean', '--only', [...releaseIds].join(',')], { quiet: true });

// 4. packages
const pilotsPath = join(ROOT, 'assets/ships/render-packages/pilots.json');
const pilots = JSON.parse(readFileSync(pilotsPath, 'utf8'));
const list = Array.isArray(pilots) ? pilots : (pilots.pilots || pilots.packages);
// Flight-static packages are fully merged: their pilots must not carry dynamic-name groups.
const flightStaticKeys = new Set(
  JSON.parse(readFileSync(join(ROOT, 'assets/ships/render-packages/flight-static-v3.json'), 'utf8')).packages || [],
);
for (const key of pilotKeys) {
  const pilot = list.find((p) => p.key === key);
  if (!pilot) throw new Error(`no render-package pilot ${key}`);
  pilot.dynamicNameIncludes = flightStaticKeys.has(key)
    ? []
    : ['HOOK_DRIVE', 'HOOK_NAV', 'HOOK_SECONDARY', 'HOOK_SENSOR', 'HOOK_ARMOR'];
}
writeFileSync(pilotsPath, `${JSON.stringify(pilots, null, 2)}\n`);
run('node', ['scripts/refresh-render-package-pilots.mjs', `--only=${[...pilotKeys].join(',')}`], { quiet: true });
// Every package embeds the pilots.json hash, so all packages are rebuilt after a pilot edit.
run('node', ['scripts/build-render-package-pilots.mjs'], { quiet: true });

// 5. census
run('node', ['scripts/model-truth-census.mjs'], { quiet: true });
console.log(`[publish] ${shipIds.join(', ')}: ${[...releaseIds].join(', ')} live`);
