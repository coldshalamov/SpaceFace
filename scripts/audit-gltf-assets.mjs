#!/usr/bin/env node
// Comprehensive 3D asset performance audit tool using gltf-transform.
// Sweeps models across assets/, identifies high draw-call primitives, heavy polycounts, VRAM hogs, and missing compression.

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'asset-audit');
const TARGET_DIR = process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] || path.join(ROOT, 'assets');
const MAX_SCAN = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 150);

async function findGlbFiles(dir, fileList = []) {
  if (!existsSync(dir)) return fileList;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await findGlbFiles(fullPath, fileList);
    } else if (entry.isFile() && (entry.name.endsWith('.glb') || entry.name.endsWith('.gltf'))) {
      fileList.push(fullPath);
      if (fileList.length >= MAX_SCAN) return fileList;
    }
  }
  return fileList;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function auditAsset(filePath, io) {
  const fileStat = await stat(filePath);
  const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');

  try {
    const doc = await io.read(filePath);
    const root = doc.getRoot();

    let totalVertices = 0;
    let totalTriangles = 0;
    let totalPrimitives = 0;

    const meshes = root.listMeshes();
    for (const mesh of meshes) {
      for (const prim of mesh.listPrimitives()) {
        totalPrimitives++;
        const pos = prim.getAttribute('POSITION');
        const indices = prim.getIndices();
        const verts = pos ? pos.getCount() : 0;
        totalVertices += verts;
        totalTriangles += indices ? Math.round(indices.getCount() / 3) : Math.round(verts / 3);
      }
    }

    const materials = root.listMaterials();
    const textures = root.listTextures();

    let totalGpuVramBytes = 0;
    let maxTextureDim = 0;
    const textureDetails = [];

    for (const tex of textures) {
      const size = tex.getSize() || [0, 0];
      const w = size[0] || 0;
      const h = size[1] || 0;
      maxTextureDim = Math.max(maxTextureDim, w, h);
      // Uncompressed 4-byte RGBA VRAM estimate
      const vramBytes = w * h * 4;
      totalGpuVramBytes += vramBytes;
      textureDetails.push({
        name: tex.getName() || 'unnamed',
        dimensions: `${w}x${h}`,
        mime: tex.getMimeType(),
        vram: vramBytes,
      });
    }

    const extensionsUsed = root.listExtensionsUsed().map((e) => e.extensionName);
    const hasQuantization = extensionsUsed.includes('KHR_mesh_quantization');
    const hasMeshopt = extensionsUsed.includes('EXT_meshopt_compression');
    const hasBasisu = extensionsUsed.includes('KHR_texture_basisu');

    // Risk flags
    const flags = [];
    if (totalPrimitives > 4) flags.push('MULTI_PRIMITIVE_DRAW_CALLS');
    if (totalTriangles > 30_000) flags.push('HIGH_POLY_COUNT');
    if (totalGpuVramBytes > 25 * 1024 * 1024) flags.push('HIGH_TEXTURE_VRAM');
    if (maxTextureDim >= 2048) flags.push('LARGE_TEXTURE_MAPS');
    if (fileStat.size > 500 * 1024 && !hasMeshopt && !hasQuantization) flags.push('UNCOMPRESSED_GEOMETRY');

    return {
      file: relativePath,
      fileSizeBytes: fileStat.size,
      meshesCount: meshes.length,
      primitivesCount: totalPrimitives,
      verticesCount: totalVertices,
      trianglesCount: totalTriangles,
      materialsCount: materials.length,
      texturesCount: textures.length,
      gpuVramBytes: totalGpuVramBytes,
      maxTextureDim,
      extensions: extensionsUsed,
      flags,
    };
  } catch (err) {
    return {
      file: relativePath,
      fileSizeBytes: fileStat.size,
      error: err.message,
    };
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[perf:gltf] Scanning 3D assets in ${TARGET_DIR}...`);

  const files = await findGlbFiles(TARGET_DIR);
  console.log(`[perf:gltf] Found ${files.length} 3D model files to inspect.`);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const results = [];

  let idx = 0;
  for (const file of files) {
    idx++;
    process.stdout.write(`\r[perf:gltf] Inspecting (${idx}/${files.length}): ${path.basename(file)}...      `);
    const data = await auditAsset(file, io);
    results.push(data);
  }
  console.log('\n[perf:gltf] Inspection complete. Analyzing results...');

  const valid = results.filter((r) => !r.error);

  // Rankings
  const topDrawCallOffenders = [...valid].sort((a, b) => b.primitivesCount - a.primitivesCount).slice(0, 10);
  const topPolyOffenders = [...valid].sort((a, b) => b.trianglesCount - a.trianglesCount).slice(0, 10);
  const topVramOffenders = [...valid].sort((a, b) => b.gpuVramBytes - a.gpuVramBytes).slice(0, 10);
  const topFileSizeOffenders = [...valid].sort((a, b) => b.fileSizeBytes - a.fileSizeBytes).slice(0, 10);

  const jsonOut = path.join(OUT_DIR, 'gltf-audit.json');
  await writeFile(jsonOut, JSON.stringify(results, null, 2), 'utf8');

  const reportMd = [
    '# 3D Asset Performance Audit (`gltf-transform inspect`)',
    '',
    `- **Date**: ${new Date().toISOString()}`,
    `- **Total Models Audited**: ${valid.length} (${results.length - valid.length} errors)`,
    '',
    '## Top 10 Draw Call Offenders (Multi-Primitive Meshes)',
    'Each GLTF primitive generates a separate draw call in WebGL. Models with many primitives should be merged with `gltf-transform merge` or in Blender.',
    '',
    '| Asset File | Primitives (Draw Calls) | Meshes | Materials | Triangles | Flags |',
    '| --- | --- | --- | --- | --- | --- |',
    ...topDrawCallOffenders.map((r) =>
      `| \`${r.file}\` | **${r.primitivesCount}** | ${r.meshesCount} | ${r.materialsCount} | ${r.trianglesCount.toLocaleString()} | ${r.flags.join(', ') || 'OK'} |`
    ),
    '',
    '## Top 10 High-Polygon Assets',
    'High poly models without LODs hurt vertex shading throughput. Assets over 30k triangles should use LOD stages (LOD0/1/2) or `gltf-transform simplify`.',
    '',
    '| Asset File | Triangles | Vertices | Primitives | File Size |',
    '| --- | --- | --- | --- | --- |',
    ...topPolyOffenders.map((r) =>
      `| \`${r.file}\` | **${r.trianglesCount.toLocaleString()}** | ${r.verticesCount.toLocaleString()} | ${r.primitivesCount} | ${formatBytes(r.fileSizeBytes)} |`
    ),
    '',
    '## Top 10 Texture VRAM Consumers',
    'Uncompressed PNG/JPEG textures expand to uncompressed RGBA in GPU memory (Width × Height × 4 bytes). Use KTX2/BasisU or downscale 2K/4K maps to save VRAM.',
    '',
    '| Asset File | Estimated GPU VRAM | Textures | Max Texture Dim | File Size |',
    '| --- | --- | --- | --- | --- |',
    ...topVramOffenders.map((r) =>
      `| \`${r.file}\` | **${formatBytes(r.gpuVramBytes)}** | ${r.texturesCount} | ${r.maxTextureDim}px | ${formatBytes(r.fileSizeBytes)} |`
    ),
    '',
    '## Top 10 Heaviest Files on Disk',
    '',
    '| Asset File | File Size | Primitives | Triangles | Extensions Used |',
    '| --- | --- | --- | --- | --- |',
    ...topFileSizeOffenders.map((r) =>
      `| \`${r.file}\` | **${formatBytes(r.fileSizeBytes)}** | ${r.primitivesCount} | ${r.trianglesCount.toLocaleString()} | ${r.extensions.join(', ') || 'none'} |`
    ),
    '',
    '## Actionable Optimization Recipes',
    '',
    '### 1. Consolidate Primitives (Reduce Draw Calls)',
    '```bash',
    '# Join separate primitive batches into fewer draw calls:',
    'npx gltf-transform merge input.glb output.glb',
    '```',
    '',
    '### 2. Compress Geometry with Meshopt & Quantization',
    '```bash',
    '# Compress vertex buffers and quantize attributes (up to 70% smaller):',
    'npx gltf-transform quantize input.glb output.glb',
    'npx gltf-transform meshopt input.glb output.glb',
    '```',
    '',
    '### 3. Resize Oversized Textures',
    '```bash',
    '# Clamp texture dimensions to 1024x1024:',
    'npx gltf-transform resize --width 1024 --height 1024 input.glb output.glb',
    '```',
    '',
    '### 4. Direct Inspection of Any Model',
    '```bash',
    'npx gltf-transform inspect path/to/model.glb',
    '```',
    '',
  ].join('\n');

  const reportPath = path.join(OUT_DIR, 'report.md');
  await writeFile(reportPath, reportMd, 'utf8');
  console.log(`[perf:gltf] Report written to ${reportPath}`);
  console.log(`[perf:gltf] Raw data written to ${jsonOut}`);

  console.log('\n--- Top Draw Call Offender ---');
  if (topDrawCallOffenders.length > 0) {
    const o = topDrawCallOffenders[0];
    console.log(`${o.file}: ${o.primitivesCount} draw calls, ${o.trianglesCount.toLocaleString()} tris`);
  }
  console.log('--- Top VRAM Offender ---');
  if (topVramOffenders.length > 0) {
    const o = topVramOffenders[0];
    console.log(`${o.file}: ${formatBytes(o.gpuVramBytes)} estimated VRAM (${o.texturesCount} textures)`);
  }
}

main().catch((err) => {
  console.error('[perf:gltf] Failed:', err);
  process.exit(1);
});
