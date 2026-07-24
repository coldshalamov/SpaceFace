/**
 * Real-path checks for remastered weak place assets.
 * Parses shipped source GLBs (not release meshopt) for mesh/image payload,
 * and validates on-disk iteration evidence + material inspection artifacts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = path.join(
  process.env.LOCALAPPDATA || '',
  'Temp',
  'grok-goal-6abc52c84c39',
  'implementer',
  'visual-assets',
);

const ASSETS = [
  'place_dock_interior',
  'place_asteroid_rock_a',
  'place_asteroid_rock_b',
  'place_asteroid_rock_c',
  'place_dead_hulk',
  'place_debris_chunk',
];

/** Parse glTF 2.0 binary (.glb) JSON chunk from a real file on disk. */
function parseGlbJson(glbPath) {
  const buf = fs.readFileSync(glbPath);
  assert.ok(buf.length >= 20, `GLB too small: ${glbPath}`);
  const magic = buf.readUInt32LE(0);
  assert.equal(magic, 0x46546c67, `not a GLB (bad magic): ${glbPath}`);
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);
  assert.equal(jsonChunkType, 0x4e4f534a, `missing JSON chunk: ${glbPath}`);
  const json = JSON.parse(buf.subarray(20, 20 + jsonChunkLen).toString('utf8'));
  return { json, byteLength: buf.length };
}

function meshTriangleEstimate(json) {
  // Sum accessor counts for POSITION where mesh primitives reference them,
  // then approximate tris as indexCount/3 when indices exist, else positions/3.
  let tris = 0;
  const accessors = json.accessors || [];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.indices != null) {
        const acc = accessors[prim.indices];
        if (acc?.count) tris += Math.floor(acc.count / 3);
      } else if (prim.attributes?.POSITION != null) {
        const acc = accessors[prim.attributes.POSITION];
        if (acc?.count) tris += Math.floor(acc.count / 3);
      }
    }
  }
  return tris;
}

function imageCount(json) {
  return (json.images || []).length;
}

test('shipped source GLBs have multi-mesh non-trivial topology and textures', () => {
  const minTris = {
    place_dock_interior: 8000,
    place_asteroid_rock_a: 1500,
    place_asteroid_rock_b: 1500,
    place_asteroid_rock_c: 1500,
    place_dead_hulk: 5000,
    place_debris_chunk: 5000,
  };
  for (const id of ASSETS) {
    const glb = path.join(root, 'assets/ships/parts/places', `${id}.glb`);
    assert.ok(fs.existsSync(glb), `missing ${glb}`);
    const { json, byteLength } = parseGlbJson(glb);
    const tris = meshTriangleEstimate(json);
    const images = imageCount(json);
    const meshes = (json.meshes || []).length;
    assert.ok(meshes >= 1, `${id} has no meshes`);
    assert.ok(
      tris >= minTris[id],
      `${id} tris too low for remaster (${tris} < ${minTris[id]}) — primitive kitbash?`,
    );
    assert.ok(images >= 1, `${id} GLB has no embedded images/textures (clay solid colors)`);
    assert.ok(byteLength > 200_000, `${id} still tiny (${byteLength})`);
    // Refuse single-mesh cube-only style: dock/debris/hulk must be multi-part
    if (id === 'place_dock_interior' || id === 'place_dead_hulk' || id === 'place_debris_chunk') {
      assert.ok(meshes >= 3, `${id} expected multi-part construction, meshes=${meshes}`);
    }
  }
});

test('iteration evidence has 20 real change logs per first-wave asset', () => {
  for (const id of ASSETS) {
    const base = path.join(SCRATCH, id);
    if (!fs.existsSync(base)) {
      // allow CI without scratch; local goal requires it
      if (process.env.CI) continue;
    }
    assert.ok(fs.existsSync(base), `missing scratch evidence for ${id}: ${base}`);
    let withCritique = 0;
    const changeNotes = [];
    for (let i = 0; i <= 20; i++) {
      const iter = path.join(base, `iter_${String(i).padStart(2, '0')}`);
      if (!fs.existsSync(iter)) continue;
      const pngs = fs.readdirSync(iter).filter((f) => f.endsWith('.png'));
      const critique = path.join(iter, 'critique.md');
      if (pngs.length >= 4 && fs.existsSync(critique)) {
        withCritique += 1;
        const text = fs.readFileSync(critique, 'utf8');
        changeNotes.push(text.trim());
        assert.ok(
          text.length > 40,
          `${id} iter_${i} critique too short (not a real pass note)`,
        );
      }
    }
    assert.ok(withCritique >= 20, `${id} only ${withCritique} full iter folders with 4+ angles + critique`);
    // Real passes must not all be identical one-liners
    const unique = new Set(changeNotes);
    assert.ok(
      unique.size >= 10,
      `${id} iteration critiques not diverse enough (${unique.size} unique) — fake loop?`,
    );
  }
});

test('final material inspection proves non-flat map variance', () => {
  for (const id of ASSETS) {
    const inspection = path.join(SCRATCH, id, 'final', 'material_inspection.json');
    const gate = path.join(SCRATCH, id, 'final', 'gate_summary.json');
    // gate_summary may embed materials
    let materials = null;
    if (fs.existsSync(inspection)) {
      materials = JSON.parse(fs.readFileSync(inspection, 'utf8'));
    } else if (fs.existsSync(gate)) {
      const g = JSON.parse(fs.readFileSync(gate, 'utf8'));
      materials = g.materials || null;
    }
    if (!materials) {
      if (process.env.CI) continue;
      assert.fail(`${id} missing material_inspection.json or gate materials`);
    }
    const withVar = materials.filter((m) =>
      (m.images || []).some((im) => (im.var ?? 0) > 0.0001 || (im.uniqueish ?? 0) > 4),
    );
    assert.ok(
      withVar.length >= 1,
      `${id} no materials with non-flat map variance — clay solids`,
    );
  }
});

test('authored blends exist for remastered places', () => {
  for (const id of ASSETS) {
    const blend = path.join(root, 'assets/ships/parts/blender', `${id}_authored.blend`);
    assert.ok(fs.existsSync(blend), `missing blend ${blend}`);
    assert.ok(fs.statSync(blend).size > 100_000, `${id} blend too small`);
  }
});
