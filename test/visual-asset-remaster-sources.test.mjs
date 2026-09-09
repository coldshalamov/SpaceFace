/**
 * Anti-theater checks for place_debris_chunk remaster evidence + shipped GLB.
 * GLB topology is necessary but NOT sufficient for visual AC1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = path.join(
  process.env.LOCALAPPDATA || '',
  'Temp',
  'grok-goal-6abc52c84c39',
  'implementer',
  'visual-assets',
  'place_debris_chunk',
);

const BOILERPLATE_RE =
  /lighting-only|composition hold|tag only|grazing light|fill light|relight|scale tune|Not a lighting-only|Screenshot-reviewed form\/construction\/surface/i;

function parseGlbJson(glbPath) {
  const buf = fs.readFileSync(glbPath);
  assert.ok(buf.length >= 20, `GLB too small: ${glbPath}`);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `not GLB: ${glbPath}`);
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `no JSON chunk: ${glbPath}`);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

function meshTris(json) {
  let tris = 0;
  const acc = json.accessors || [];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.indices != null && acc[prim.indices]?.count) {
        tris += Math.floor(acc[prim.indices].count / 3);
      } else if (prim.attributes?.POSITION != null && acc[prim.attributes.POSITION]?.count) {
        tris += Math.floor(acc[prim.attributes.POSITION].count / 3);
      }
    }
  }
  return tris;
}

function pngDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => path.join(dir, f));
}

test('place_debris_chunk shipped GLB is multi-part and non-trivial (necessary, not AC1)', () => {
  const glb = path.join(root, 'assets/ships/parts/places/place_debris_chunk.glb');
  assert.ok(fs.existsSync(glb), 'missing debris source GLB');
  const json = parseGlbJson(glb);
  const meshes = (json.meshes || []).length;
  const images = (json.images || []).length;
  const tris = meshTris(json);
  assert.ok(meshes >= 2, `debris expected multi-part shell construction, meshes=${meshes}`);
  assert.ok(tris >= 4000, `debris tris too low (${tris}) for thick shell`);
  assert.ok(images >= 1, 'debris GLB must embed texture images (not solid clay colors only)');
  assert.ok(fs.statSync(glb).size > 500_000, 'debris GLB still tiny');
});

test('debris iteration packets: Material Preview markers, unique digests, mesh_delta, real critiques', () => {
  if (!fs.existsSync(SCRATCH) && process.env.CI) return;
  assert.ok(fs.existsSync(SCRATCH), `missing debris scratch ${SCRATCH}`);

  const digests = new Set();
  let formPasses = 0;
  const triSeries = [];

  for (let i = 0; i <= 20; i++) {
    const iter = path.join(SCRATCH, `iter_${String(i).padStart(2, '0')}`);
    if (!fs.existsSync(iter)) continue;
    const pngs = listPngs(iter);
    assert.ok(pngs.length >= 4, `${path.basename(iter)} needs ≥4 full-frame PNGs, got ${pngs.length}`);

    // marker that capture was Material Preview / RENDERED path (not Workbench-only packer)
    const marker = path.join(iter, 'capture_mode.json');
    assert.ok(fs.existsSync(marker), `${path.basename(iter)} missing capture_mode.json`);
    const mode = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.ok(
      mode.shading === 'MATERIAL' || mode.shading === 'RENDERED' || mode.engine?.includes('EEVEE'),
      `${path.basename(iter)} capture must be Material Preview or EEVEE RENDERED, got ${JSON.stringify(mode)}`,
    );

    for (const p of pngs) digests.add(pngDigest(p));

    const critique = path.join(iter, 'critique.md');
    assert.ok(fs.existsSync(critique), `${path.basename(iter)} missing critique.md`);
    const text = fs.readFileSync(critique, 'utf8');
    assert.match(text, /^##\s*Seen/m, `${path.basename(iter)} critique needs ## Seen`);
    assert.match(text, /^##\s*Repair/m, `${path.basename(iter)} critique needs ## Repair`);
    assert.match(text, /^##\s*Residual/m, `${path.basename(iter)} critique needs ## Residual`);
    assert.ok(!BOILERPLATE_RE.test(text), `${path.basename(iter)} critique looks like theater boilerplate`);
    assert.ok(text.length > 120, `${path.basename(iter)} critique too short`);

    const deltaPath = path.join(iter, 'mesh_delta.json');
    assert.ok(fs.existsSync(deltaPath), `${path.basename(iter)} missing mesh_delta.json`);
    const delta = JSON.parse(fs.readFileSync(deltaPath, 'utf8'));
    assert.ok(typeof delta.tri_count === 'number' && delta.tri_count > 0, 'mesh_delta.tri_count required');
    assert.ok(Array.isArray(delta.object_names) && delta.object_names.length > 0, 'mesh_delta.object_names required');
    assert.ok(delta.bbox && delta.bbox.length === 6, 'mesh_delta.bbox [minxyz,maxxyz] required');
    triSeries.push({ i, tri: delta.tri_count, names: delta.object_names.slice().sort().join('|') });

    // form pass if repair section mentions mesh ops (not only light/camera)
    const repair = text.split(/##\s*Repair/i)[1]?.split(/##\s*Residual/i)[0] || '';
    if (/bevel|extrude|inset|boolean|bmesh|subdiv|solidify|edge|panel|shell|frame|deck|rib|tear|dent|loop|cut|join|thickness/i.test(repair)) {
      formPasses += 1;
    }
  }

  assert.ok(triSeries.length >= 20, `need ≥20 iter folders with mesh_delta, got ${triSeries.length}`);
  assert.ok(formPasses >= 15, `need ≥15 form-repair passes, got ${formPasses}`);

  // unique PNG content across iters (reject final-clone packer)
  assert.ok(digests.size >= 40, `PNG digests too few (${digests.size}) — cloned/final-packed theater?`);

  // mesh_delta must change across form-heavy sequence (not identical every pass)
  const signatures = triSeries.map((t) => `${t.tri}:${t.names}`);
  const uniqueSig = new Set(signatures);
  assert.ok(uniqueSig.size >= 12, `mesh_delta too static (${uniqueSig.size} unique) — no real form progression`);
});

test('debris final packet exists with multi-angle Material Preview evidence', () => {
  if (!fs.existsSync(SCRATCH) && process.env.CI) return;
  const finalDir = path.join(SCRATCH, 'final');
  assert.ok(fs.existsSync(finalDir), 'missing final/');
  const pngs = listPngs(finalDir);
  assert.ok(pngs.length >= 5, `final needs ≥5 angles, got ${pngs.length}`);
  const mode = path.join(finalDir, 'capture_mode.json');
  assert.ok(fs.existsSync(mode), 'final missing capture_mode.json');
  const m = JSON.parse(fs.readFileSync(mode, 'utf8'));
  assert.ok(m.shading === 'MATERIAL' || m.shading === 'RENDERED' || m.engine?.includes('EEVEE'));
  const gate = path.join(finalDir, 'gate_summary.json');
  assert.ok(fs.existsSync(gate), 'final missing gate_summary.json');
  const g = JSON.parse(fs.readFileSync(gate, 'utf8'));
  assert.notEqual(g.production_state, 'accepted', 'must not self-accept');
  assert.ok(
    g.production_state === 'surfaced_candidate' || g.production_state === 'integration_candidate' || g.production_state === 'production_model',
    `unexpected state ${g.production_state}`,
  );
});

test('authored debris blend exists', () => {
  const blend = path.join(root, 'assets/ships/parts/blender/place_debris_chunk_authored.blend');
  assert.ok(fs.existsSync(blend), 'missing debris blend');
  assert.ok(fs.statSync(blend).size > 200_000, 'debris blend too small');
});

const VA_ROOT = path.join(
  process.env.LOCALAPPDATA || '',
  'Temp',
  'grok-goal-6abc52c84c39',
  'implementer',
  'visual-assets',
);

test('honest gates must not wipe P1 while craft residuals remain', () => {
  if (!fs.existsSync(VA_ROOT) && process.env.CI) return;
  assert.ok(fs.existsSync(VA_ROOT), `missing visual-assets root ${VA_ROOT}`);
  for (const id of [
    'place_debris_chunk',
    'place_asteroid_rock_a',
    'place_dead_hulk',
    'place_dock_interior',
  ]) {
    const gatePath = path.join(VA_ROOT, id, 'final', 'gate_summary.json');
    if (!fs.existsSync(gatePath)) continue;
    const g = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
    assert.notEqual(g.production_state, 'accepted', `${id} must not self-accept`);
    assert.ok(Array.isArray(g.p1_remaining), `${id} needs p1_remaining array`);
    assert.ok(g.p1_remaining.length > 0, `${id} empty p1_remaining is dishonest while G5–G7 open`);
    assert.ok(g.honest_gate === true || g.not_accepted === true, `${id} gate must mark honesty`);
  }
});

function assertRockRemaster(assetId) {
  const base = path.join(VA_ROOT, assetId);
  assert.ok(fs.existsSync(base), `missing ${assetId} scratch`);

  const critiqueTexts = [];
  let formPasses = 0;
  for (let i = 0; i <= 20; i++) {
    const iter = path.join(base, `iter_${String(i).padStart(2, '0')}`);
    if (!fs.existsSync(iter)) continue;
    const critique = path.join(iter, 'critique.md');
    assert.ok(fs.existsSync(critique), `${assetId} ${path.basename(iter)} missing critique`);
    const text = fs.readFileSync(critique, 'utf8');
    assert.ok(!BOILERPLATE_RE.test(text), `${assetId} ${path.basename(iter)} critique is theater boilerplate`);
    assert.match(text, /^##\s*Seen/m);
    assert.match(text, /^##\s*Repair/m);
    assert.match(text, /^##\s*Residual/m);
    critiqueTexts.push(text.trim());
    const mode = path.join(iter, 'capture_mode.json');
    assert.ok(fs.existsSync(mode), `${assetId} ${path.basename(iter)} missing capture_mode`);
    const m = JSON.parse(fs.readFileSync(mode, 'utf8'));
    assert.ok(m.shading === 'RENDERED' || m.engine?.includes('EEVEE'), `${assetId} iters need EEVEE/RENDERED`);
    const repair = text.split(/##\s*Repair/i)[1]?.split(/##\s*Residual/i)[0] || '';
    if (/bevel|extrude|inset|boolean|bmesh|facet|crater|cleavage|vein|chisel|scar|shelf|chip|strata|panel|shell|frame|tear|join|cut|thickness|noise|subdiv|asymm|pit|geology|half-space/i.test(repair)) {
      formPasses += 1;
    }
  }
  assert.ok(critiqueTexts.length >= 20, `${assetId} need ≥20 critiques, got ${critiqueTexts.length}`);
  const unique = new Set(critiqueTexts);
  assert.ok(unique.size >= 15, `${assetId} critiques too identical (${unique.size} unique) — AC2 theater`);
  assert.ok(formPasses >= 12, `${assetId} form passes ${formPasses}`);

  const matsPath = path.join(base, 'final', 'material_inspection.json');
  assert.ok(fs.existsSync(matsPath), `${assetId} missing material_inspection`);
  const mats = JSON.parse(fs.readFileSync(matsPath, 'utf8'));
  let ormOk = false;
  for (const mat of mats) {
    for (const im of mat.images || []) {
      if (/orm/i.test(im.name || '')) {
        assert.ok(im.var > 1e-5, `${assetId} flat ORM ${im.name} var=${im.var}`);
        assert.ok(im.uniqueish > 4, `${assetId} ORM uniqueish too low ${im.uniqueish}`);
        ormOk = true;
      }
    }
  }
  assert.ok(ormOk, `${assetId} needs at least one non-flat ORM entry`);

  const mapFlats = path.join(base, 'final', 'map_flats');
  assert.ok(fs.existsSync(mapFlats), `${assetId} missing map_flats dir`);
  const flatPngs = fs.readdirSync(mapFlats).filter((f) => f.endsWith('.png'));
  assert.ok(flatPngs.length >= 2, `${assetId} map_flats need ≥2 pngs, got ${flatPngs.length}`);

  const gate = path.join(base, 'final', 'gate_summary.json');
  assert.ok(fs.existsSync(gate), `${assetId} missing gate`);
  const g = JSON.parse(fs.readFileSync(gate, 'utf8'));
  assert.notEqual(g.production_state, 'accepted');
  assert.ok(Array.isArray(g.p1_remaining) && g.p1_remaining.length > 0, `${assetId} empty p1 dishonest`);
}

test('rock_a remaster: unique critiques, non-flat ORM, map_flats, EEVEE markers', () => {
  if (!fs.existsSync(VA_ROOT) && process.env.CI) return;
  assertRockRemaster('place_asteroid_rock_a');
});

test('rock_b remaster: unique critiques, non-flat ORM, map_flats, EEVEE markers', () => {
  if (!fs.existsSync(VA_ROOT) && process.env.CI) return;
  assertRockRemaster('place_asteroid_rock_b');
});

test('rock_c remaster: unique critiques, non-flat ORM, map_flats, EEVEE markers', () => {
  if (!fs.existsSync(VA_ROOT) && process.env.CI) return;
  assertRockRemaster('place_asteroid_rock_c');
});

test('hulk remaster: EEVEE finals, non-flat ORM, unique form critiques', () => {
  if (!fs.existsSync(VA_ROOT) && process.env.CI) return;
  const base = path.join(VA_ROOT, 'place_dead_hulk');
  assert.ok(fs.existsSync(base), 'missing hulk scratch');
  const mode = path.join(base, 'final', 'capture_mode.json');
  assert.ok(fs.existsSync(mode), 'hulk final missing capture_mode');
  const m = JSON.parse(fs.readFileSync(mode, 'utf8'));
  assert.ok(m.shading === 'RENDERED' || m.engine?.includes('EEVEE'), 'hulk final must be EEVEE not Workbench-only');
  const matsPath = path.join(base, 'final', 'material_inspection.json');
  assert.ok(fs.existsSync(matsPath), 'hulk missing material_inspection');
  const mats = JSON.parse(fs.readFileSync(matsPath, 'utf8'));
  let ormOk = false;
  for (const mat of mats) {
    for (const im of mat.images || []) {
      if (/orm/i.test(im.name || '')) {
        assert.ok(im.var > 1e-5, `hulk flat ORM ${im.name}`);
        ormOk = true;
      }
    }
  }
  assert.ok(ormOk, 'hulk needs non-flat ORM');
  const mapFlats = path.join(base, 'final', 'map_flats');
  assert.ok(fs.existsSync(mapFlats), 'hulk missing map_flats');
  // unique critiques sample
  const c0 = fs.readFileSync(path.join(base, 'iter_00', 'critique.md'), 'utf8');
  const c10 = fs.readFileSync(path.join(base, 'iter_10', 'critique.md'), 'utf8');
  assert.notEqual(c0.trim(), c10.trim(), 'hulk critiques must differ across iters');
  assert.ok(!BOILERPLATE_RE.test(c0) && !BOILERPLATE_RE.test(c10), 'hulk critiques still boilerplate');
});
