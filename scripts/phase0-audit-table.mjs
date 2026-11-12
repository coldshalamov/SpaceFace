#!/usr/bin/env node
// Phase 0 audit table: tri/bytes/materials/sockets/LODs per manifest part (source + release).
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const OUT = process.argv[2] || resolve('C:/Users/93rob/AppData/Local/Temp/grok-goal-37de2abed066/implementer/phase-audit-table.md');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

function parseGlb(bytes) {
  let off = 12;
  let gltf = null;
  while (off < bytes.length) {
    const chunkLength = bytes.readUInt32LE(off);
    const chunkType = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    if (chunkType === CHUNK_JSON) {
      gltf = JSON.parse(bytes.subarray(start, start + chunkLength).toString('utf8').replace(/\0+$/, '').trim());
    }
    off = start + chunkLength;
  }
  return gltf;
}

function auditPart(part, rootLabel, rootPath) {
  const abs = resolve(ROOT, rootPath, part.file);
  const violations = [];
  let row = { id: part.id, root: rootLabel, file: part.file, tris: part.tris, bytes: part.bytes, materials: '', sockets: '', lods: '0/0/0', violations: 0 };
  try {
    const bytes = readFileSync(abs);
    const gltf = parseGlb(bytes);
    const materials = [...new Set((gltf.materials || []).map((m) => m.name).filter(Boolean))];
    const nodes = new Set((gltf.nodes || []).map((n) => n.name).filter(Boolean));
    const lod0 = [...nodes].filter((n) => /^LOD0_/i.test(n)).length;
    const lod1 = [...nodes].filter((n) => /^LOD1_/i.test(n)).length;
    const lod2 = [...nodes].filter((n) => /^LOD2_/i.test(n)).length;
    const tris = (gltf.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || []).reduce((s, p) => {
      const acc = gltf.accessors?.[p.indices] || gltf.accessors?.[p.attributes?.POSITION];
      return s + Math.floor((acc?.count || 0) / (p.indices != null ? 3 : 1));
    }, 0), 0);
    row.tris = tris;
    row.bytes = bytes.length;
    row.materials = materials.join(', ');
    row.sockets = [...nodes].filter((n) => n.startsWith('SOCKET_')).join(', ');
    row.lods = `${lod0}/${lod1}/${lod2}`;
    const contract = new Set(Object.values(MANIFEST.materialContract || {}));
    for (const name of materials) if (!contract.has(name)) violations.push(`extra material ${name}`);
    if (part.category === 'hulls' && (lod0 < 1 || lod1 < 1 || lod2 < 1)) violations.push('missing hull LODs');
    if (tris > MANIFEST.budgets.trianglesPerPart[1]) violations.push(`tris>${MANIFEST.budgets.trianglesPerPart[1]}`);
    if (bytes.length > MANIFEST.budgets.maxBytesPerPart) violations.push('bytes over budget');
    for (const socket of part.sockets || []) if (!nodes.has(socket)) violations.push(`missing socket ${socket}`);
    for (const hook of part.hooks || []) if (!nodes.has(hook)) violations.push(`missing hook ${hook}`);
    row.violations = violations.length;
    row.violationText = violations.join('; ');
  } catch (error) {
    row.violations = 1;
    row.violationText = error.message;
  }
  return row;
}

const rows = [];
for (const part of MANIFEST.parts) {
  rows.push(auditPart(part, 'source', 'assets/ships/parts'));
  rows.push(auditPart(part, 'release', 'assets/ships/release/parts'));
}

const totalViolations = rows.reduce((sum, row) => sum + row.violations, 0);
const lines = [
  '# Phase 0 audit table',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Parts: ${MANIFEST.parts.length} | Rows: ${rows.length} | Violations: ${totalViolations}`,
  '',
  '| id | root | tris | bytes | materials | LOD0/1/2 | sockets | violations |',
  '|---|---|---:|---:|---|---|---:|---|',
];
for (const row of rows) {
  lines.push(`| ${row.id} | ${row.root} | ${row.tris} | ${row.bytes} | ${row.materials} | ${row.lods} | ${row.sockets || '—'} | ${row.violationText || '—'} |`);
}
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`[phase0-audit] violations=${totalViolations} wrote ${OUT}`);
process.exit(totalViolations ? 1 : 0);