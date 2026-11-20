#!/usr/bin/env node
// Produce the interface hull renders (assets/ui/renders/hulls/) from the live player hull GLBs.
//
//   node tools/art/render_hull_posters.mjs                 # every player hull
//   node tools/art/render_hull_posters.mjs ship_kestrel    # one or more hulls
//   --hud-only rebuilds the flight schematics without touching the other posters
//   --write-posters-js also rewrites src/ui/hullPosters.js to list every rendered hull
//
// Per hull: Cycles hero / side / top (tools/art/render_hull.py), the refit-jig line drawing
// (render_jig.py + jig_glyph.py) and the instrument-light glyph (holo_glyph.py), published as WebP,
// then the manifest entry (framing, projected socket marks, source hash) and src/ui/hullPosters.js.
// Rerun it whenever a player hull body changes; stale posters show the player a ship that no longer
// exists.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { ordinaryWholeShipVisualForEntity, WHOLE_SHIP_FILE_BY_DEF_ID } from '../../src/data/wholeShipVisualIdentity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'assets/ui/renders/hulls');
const TMP = process.env.SF_POSTER_TMP || path.join(os.tmpdir(), 'sf-hull-posters');
const MANIFEST = path.join(OUT, 'manifest.json');
const POSTERS_JS = path.join(ROOT, 'src/ui/hullPosters.js');
const SAMPLES = process.env.SF_POSTER_SAMPLES || '64';
const releaseIO = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

export const PLAYER_HULLS = {
  ship_kestrel: 'kestrel', ship_pelican: 'pelican_production_v1', ship_wasp: 'wasp_production_v1',
  ship_hornet: 'hornet_production_v1', ship_mule: 'mule_production_v1', ship_drifter: 'drifter_production_v1',
  ship_ironback: 'ironback_production_v1', ship_hawser: 'yard_tug', ship_bastion: 'bastion_production_v1',
  ship_atlas: 'atlas_production_v1', ship_ranger: 'ranger_production_v1', ship_warden: 'warden_production_v1',
  ship_colossus: 'colossus_production_v1', ship_leviathan: 'leviathan_production_v1',
  ship_saucer: 'saucer_production_v1',
};
const VIEWS = { hero: [2400, 1350], side: [2400, 1100], top: [1024, 1024] };

const BLENDER = process.env.BLENDER || 'blender';
const PYTHON = process.env.PYTHON || 'python3';
// Windows indexers/AV briefly lock a just-written file (errno -4094 UNKNOWN); a lost manifest write
// throws away a six-minute render, so retry the write a few times before giving up.
function writeRetry(file, text, tries = 6) {
  for (let i = 0; ; i += 1) {
    try { return writeFileSync(file, text); } catch (err) {
      if (i >= tries - 1) throw err;
      const until = Date.now() + 500 * (i + 1);
      while (Date.now() < until) { /* spin: the script is synchronous */ }
    }
  }
}
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();

async function renderHudPlan(id, file) {
  const glb = path.join(ROOT, 'assets/ships/release/parts', file);
  const unpacked = path.join(TMP, `${id}.hud.glb`);
  const raw = path.join(TMP, `${id}.hudraw.png`);
  // Blender's glTF importer cannot read the released meshopt payload. Decode the model and
  // discard texture encodings, keeping geometry, metadata and material names for the line pass.
  await MeshoptDecoder.ready;
  const model = await releaseIO.read(glb);
  for (const texture of model.getRoot().listTextures()) texture.dispose();
  for (const extension of model.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'EXT_meshopt_compression' || extension.extensionName === 'KHR_texture_basisu') {
      extension.dispose();
    }
  }
  await releaseIO.write(unpacked, model);
  try {
    const log = run(BLENDER, ['-b', '-t', '4', '-P', 'tools/art/render_jig.py', '--', unpacked, raw, '512', '--hud']);
    if (!/JIG_DONE/.test(log)) throw new Error(`${id} HUD plan render failed:\n${log.slice(-1000)}`);
  } finally {
    rmSync(unpacked, { force: true });
  }
  run(PYTHON, ['tools/art/jig_glyph.py', raw, path.join(OUT, `${id}.hud.webp`), '--hud']);
  process.stdout.write(`  ${id} HUD plan ok\n`);
}

async function renderFlightPlans(id) {
  await renderHudPlan(id, WHOLE_SHIP_FILE_BY_DEF_ID[id]);
  if (id === 'ship_hornet') {
    const cutter = ordinaryWholeShipVisualForEntity({
      isPlayer: true, data: { defId: id, appearance: { variantId: 'customs_cutter' } },
    });
    await renderHudPlan('ship_hornet_customs_cutter', cutter.file);
  }
}

async function renderHull(id, file) {
  const glb = `assets/ships/parts/wholeships/${file}.glb`;
  const entry = { sourceGlb: glb, sourceGlbSha256: createHash('sha256').update(readFileSync(path.join(ROOT, glb))).digest('hex').toUpperCase() };
  for (const [view, [w, h]] of Object.entries(VIEWS)) {
    const raw = path.join(TMP, `${id}.${view}.png`);
    const log = run(BLENDER, ['-b', '-P', 'tools/art/render_hull.py', '--', glb, raw, view, String(w), String(h), SAMPLES]);
    if (!/RENDER_DONE/.test(log)) throw new Error(`${id} ${view}: render failed`);
    const meta = JSON.parse(readFileSync(raw.replace(/\.png$/, '.json'), 'utf8'));
    let marks = meta.marks;
    // Chroma lift to match the Look's paint saturation in flight (docs/visual-assets/LOOK.md).
    let img = sharp(raw).modulate({ saturation: 1.2 });
    if (view === 'top') {
      // Rendered nose along +X; published nose up (90 deg counter-clockwise). Marks follow.
      img = img.rotate(-90);
      marks = Object.fromEntries(Object.entries(marks).map(([k, [u, v, d]]) => [k, [v, +(1 - u).toFixed(4), d]]));
    }
    const name = `${id}.${view}.webp`;
    await img.webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, name));
    entry[view] = { file: name, width: w, height: h, bytes: statSync(path.join(OUT, name)).size,
      hullSize: meta.size, longAxis: meta.long_axis, marks };
    process.stdout.write(`  ${id} ${view} ok\n`);
  }
  // Instrument-light glyph from the plan render (its own crop), and the refit-jig line drawing in
  // the plan view's frame so the top marks land on it.
  run(PYTHON, ['tools/art/holo_glyph.py', path.join(TMP, `${id}.top.png`), path.join(OUT, `${id}.holo.webp`), '90']);
  rmSync(path.join(OUT, `${id}.holo_prev.jpg`), { force: true }); // holo_glyph.py's review preview
  const jigRaw = path.join(TMP, `${id}.jigraw.png`);
  run(BLENDER, ['-b', '-P', 'tools/art/render_jig.py', '--', glb, jigRaw, '1024']);
  run(PYTHON, ['tools/art/jig_glyph.py', jigRaw, path.join(OUT, `${id}.jig.webp`)]);
  process.stdout.write(`  ${id} holo+jig ok\n`);
  await renderFlightPlans(id);
  return entry;
}

function writePostersJs(ids) {
  const src = readFileSync(POSTERS_JS, 'utf8');
  const start = src.indexOf('export const HULL_POSTERS = Object.freeze({');
  const end = src.indexOf('});', start) + 3;
  const rows = ids.map((id) => `  ${id}: Object.freeze({ hero: '${id}.hero.webp', side: '${id}.side.webp', top: '${id}.top.webp', holo: '${id}.holo.webp', jig: '${id}.jig.webp' }),`);
  writeFileSync(POSTERS_JS, `${src.slice(0, start)}export const HULL_POSTERS = Object.freeze({\n${rows.join('\n')}\n});${src.slice(end)}`);
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const ids = want.length ? want : Object.keys(PLAYER_HULLS);
  for (const id of ids) if (!PLAYER_HULLS[id]) throw new Error(`unknown hull ${id}`);
  if (process.argv.includes('--hud-only')) {
    for (const id of ids) await renderFlightPlans(id);
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  manifest.script = 'tools/art/render_hull_posters.mjs (render_hull.py, render_jig.py, jig_glyph.py, holo_glyph.py)';
  manifest.renderer = `Blender Cycles (CPU), the Look restated for Cycles (clear coat, warm key / cyan rim, lamp gain, game reflection env), AgX High Contrast, exposure 0.8, transparent film, ${SAMPLES} samples + denoise, saturation x1.2`;
  for (const id of ids) {
    process.stdout.write(`${id}\n`);
    manifest.hulls[id] = await renderHull(id, PLAYER_HULLS[id]);
    writeRetry(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  }
  const published = Object.keys(PLAYER_HULLS).filter((id) => manifest.hulls[id]);
  // src/ui is the ORRERY lane's (AGENTS.md): only rewrite the poster table when asked to.
  if (process.argv.includes('--write-posters-js')) writePostersJs(published);
  process.stdout.write(`done: ${ids.length} hull(s); ${published.length} published\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
