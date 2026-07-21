#!/usr/bin/env node
// Fleet Breadth Foundry — GLB contract validator (Lane B harness).
//
// Wraps @gltf-transform inspect() and walks the document for the facts inspect()
// does not surface (tangents, UV-set count, non-applied node transforms, world
// bbox), then writes a deterministic per-GLB report. Geometry counts are
// telemetry by default. Exits non-zero if any GLB FAILs.
//
//   node tools/foundry/validate_foundry_glb.mjs <glb...> --out <reportdir> \
//        [--class kit|variant|scenery] [--budget <tris>] [--json]
//
// Class names organize reports; they do not imply aesthetic triangle ceilings.
// --budget is available only for an explicitly derived platform/task limit.
//
// Reuse note: this is the foundry-facing inspection gate. tools/art/validate_gltf_assets.mjs
// remains the Khronos glTF-VALIDITY validator; run that too for spec conformance.
// Draco-compressed GLBs are unsupported here (no draco3d dependency present in the
// worktree; meshoptimizer is) — foundry parts stay uncompressed or meshopt-packed.
import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspect } from '@gltf-transform/functions';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const VALID_CLASSES = new Set(['kit', 'variant', 'scenery']);

// sRGB-role slots per glTF material model; everything else is linear/non-color.
const SRGB_SLOTS = new Set(['baseColorTexture', 'emissiveTexture']);

function parseArgs(argv) {
  const out = { glbs: [], out: null, klass: 'variant', budget: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--class') out.klass = argv[++i];
    else if (a === '--budget') out.budget = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else out.glbs.push(a);
  }
  return out;
}

function round(n, d = 4) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// Deep key-sort so report JSON is byte-identical across runs.
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key]);
    return out;
  }
  return value;
}

function isIdentityTransform(node) {
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  return near(t[0], 0) && near(t[1], 0) && near(t[2], 0)
    && near(r[0], 0) && near(r[1], 0) && near(r[2], 0) && near(r[3], 1)
    && near(s[0], 1) && near(s[1], 1) && near(s[2], 1);
}

function analyze(doc, filePath) {
  const root = doc.getRoot();
  const report = inspect(doc);

  let tris = 0;
  let primitiveCount = 0;
  let tangentPrims = 0;
  const uvSets = new Set();
  const meshTris = [];
  for (const meshRow of report.meshes.properties) {
    tris += meshRow.glPrimitives || 0;
  }
  // Walk primitives for the semantic facts inspect() omits.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitiveCount++;
      const semantics = prim.listSemantics();
      if (semantics.includes('TANGENT')) tangentPrims++;
      for (const s of semantics) {
        const m = /^TEXCOORD_(\d+)$/.exec(s);
        if (m) uvSets.add(Number(m[1]));
      }
    }
    meshTris.push({ name: mesh.getName() || '(unnamed)', primitives: mesh.listPrimitives().length });
  }

  // Materials (names + how many primitives reference each).
  const matUse = new Map();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const name = mat ? (mat.getName() || '(unnamed)') : '(none)';
      matUse.set(name, (matUse.get(name) || 0) + 1);
    }
  }
  const normalMapPresent = root.listMaterials().some((m) => m.getNormalTexture());

  // Textures: size + colorspace role from usage slot.
  const textures = report.textures.properties.map((t) => {
    const slots = Array.isArray(t.slots) ? t.slots : String(t.slots || '').split(',').filter(Boolean);
    const srgb = slots.some((s) => SRGB_SLOTS.has(s));
    return {
      name: t.name || '(unnamed)',
      resolution: t.resolution || `${t.width || '?'}x${t.height || '?'}`,
      slots,
      colorSpaceRole: srgb ? 'sRGB' : 'linear',
      mimeType: t.mimeType || t.uri || '(embedded)',
    };
  });

  // Node names + non-applied (non-identity) local transforms.
  const nodes = root.listNodes();
  const nonIdentity = nodes.filter((n) => !isIdentityTransform(n)).map((n) => n.getName() || '(unnamed)');
  const nodeNames = nodes.map((n) => n.getName() || '(unnamed)');

  // World bbox over all scenes.
  let bbox = null;
  try {
    const scene = root.listScenes()[0];
    if (scene) {
      const b = getBounds(scene);
      bbox = {
        min: b.min.map((x) => round(x)),
        max: b.max.map((x) => round(x)),
        dims: [round(b.max[0] - b.min[0]), round(b.max[1] - b.min[1]), round(b.max[2] - b.min[2])],
      };
    }
  } catch (e) {
    bbox = { error: String(e.message || e) };
  }

  const extensions = root.listExtensionsUsed().map((e) => e.extensionName).sort();

  return {
    file: basename(filePath),
    tris,
    drawGroups: {
      primitiveCount,
      meshes: meshTris.sort((a, b) => a.name.localeCompare(b.name)),
    },
    materials: {
      count: root.listMaterials().length,
      usage: Object.fromEntries([...matUse.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    },
    textures: textures.sort((a, b) => a.name.localeCompare(b.name)),
    geometry: {
      uvSets: [...uvSets].sort((a, b) => a - b),
      tangentsPresent: tangentPrims > 0,
      tangentPrimitives: tangentPrims,
      primitives: primitiveCount,
    },
    transforms: {
      nodeCount: nodes.length,
      nonAppliedCount: nonIdentity.length,
      nonAppliedNodes: nonIdentity.sort(),
    },
    nodeNames: nodeNames.sort(),
    bbox,
    extensionsUsed: extensions,
  };
}

function judge(analysis, klass, budgetOverride) {
  const budget = Number.isFinite(budgetOverride) ? budgetOverride : null;
  const warnings = [];
  const failures = [];
  if (!VALID_CLASSES.has(klass)) failures.push(`unknown report class '${klass}'`);
  if (Number.isFinite(budget) && analysis.tris > budget) {
    failures.push(`tris ${analysis.tris} exceed explicit task budget ${budget}`);
  }

  if (analysis.geometry && analysis.materials) {
    // normal maps without tangents => runtime must derive them (quality/perf flag).
    if (!analysis.geometry.tangentsPresent) {
      const hasNormalRole = analysis.textures.some((t) => t.slots.includes('normalTexture'));
      if (hasNormalRole) warnings.push('normal texture present but no TANGENT attribute (runtime-derived normals)');
    }
    if (analysis.geometry.uvSets.length === 0 && analysis.textures.length > 0) {
      warnings.push('textures present but no TEXCOORD/UV set found');
    }
  }
  for (const t of analysis.textures) {
    const [w] = String(t.resolution).split('x').map(Number);
    if (Number.isFinite(w) && (w & (w - 1)) !== 0) warnings.push(`texture ${t.name} is non-power-of-two (${t.resolution})`);
    if (Number.isFinite(w) && w > 2048) warnings.push(`texture ${t.name} exceeds 2048 (${t.resolution})`);
  }

  return {
    class: klass,
    budget,
    pass: failures.length === 0,
    failures,
    warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.glbs.length) {
    console.error('usage: node validate_foundry_glb.mjs <glb...> --out <dir> [--class kit|variant|scenery] [--budget N]');
    process.exit(2);
  }
  const outDir = resolve(args.out || '.foundry-reports');
  mkdirSync(outDir, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const summary = [];
  let anyFail = false;
  for (const glb of args.glbs) {
    const path = resolve(glb);
    let record;
    try {
      const doc = await io.read(path);
      const analysis = analyze(doc, path);
      const verdict = judge(analysis, args.klass, args.budget);
      record = sortDeep({ ...analysis, verdict });
    } catch (e) {
      record = sortDeep({ file: basename(path), error: String(e.message || e), verdict: { pass: false, failures: ['read/parse error'], warnings: [], class: args.klass } });
    }
    const pass = record.verdict && record.verdict.pass;
    if (!pass) anyFail = true;
    const reportPath = resolve(outDir, `${basename(path)}.report.json`);
    writeFileSync(reportPath, `${JSON.stringify(record, null, 2)}\n`);
    summary.push({ file: basename(path), pass: !!pass, tris: record.tris ?? null, report: reportPath, warnings: record.verdict ? record.verdict.warnings.length : 0 });
    if (args.json) console.log(JSON.stringify(record, null, 2));
  }

  console.log('\nFOUNDRY GLB VALIDATION');
  for (const s of summary) {
    console.log(`  [${s.pass ? 'PASS' : 'FAIL'}] ${s.file}  tris=${s.tris}  warns=${s.warnings}  -> ${s.report}`);
  }
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
