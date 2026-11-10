// Shipped-asset census core: the real numbers behind the live render cost.
//
// `scripts/audit-gltf-assets.mjs` cannot read the live release tree - 796 of the 814
// shipped GLBs are EXT_meshopt_compression and that tool never registers the decoder,
// so every ship it was supposed to score came back as an error row. This module reads
// them for real (meshopt decoder + KTX2 metadata) and reports what reaches the GPU:
//
//   geometry    - triangles, vertices, primitives (= draw-call upper bound)
//   materials   - unique material slots and distinct texture sets (tint collapse)
//   textures    - per-image codec, dimensions, and decoded VRAM with the mip chain
//
// Shared by `scripts/asset-census.mjs` (report) and `scripts/check-asset-census.mjs` (budget).
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

export const CENSUS_SKIP_DIRS = Object.freeze([
  'node_modules', '.git', 'release_candidates', 'pre_promote_backups',
  'evidence', 'revamp-evidence', '_archive', 'blender',
]);

export function walkGlbFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!CENSUS_SKIP_DIRS.includes(entry.name)) walkGlbFiles(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.glb')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Decoded VRAM for one uploaded texture, including its mip chain.
 * UASTC transcodes to a 4x4 block format at 1 byte/pixel (BC7/ASTC); ETC1S transcodes
 * to a 4x4 block format at 0.5 byte/pixel (BC1/ETC1); anything else uploads as RGBA8.
 * The GPU may fall back to RGBA8 where a format is unsupported, which is the worst case
 * this deliberately under-reports rather than invents.
 */
export function textureVramBytes(width, height, codec) {
  if (!width || !height) return 0;
  const perPixel = codec === 'uastc' ? 1 : codec === 'etc1s' ? 0.5 : 4;
  return Math.round(width * height * perPixel * (4 / 3));
}

export async function createCensusIo() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

function textureSetKey(material) {
  const slot = (getter) => {
    const tex = material[getter]?.();
    if (!tex) return '-';
    return `${tex.getURI?.() || tex.getName() || 'tex'}:${(tex.getSize?.() || []).join('x')}`;
  };
  return [
    slot('getBaseColorTexture'),
    slot('getNormalTexture'),
    slot('getMetallicRoughnessTexture'),
    slot('getEmissiveTexture'),
    slot('getOcclusionTexture'),
  ].join('|');
}

export async function censusFile(io, file, root) {
  const doc = await io.read(file);
  const gltfRoot = doc.getRoot();

  let tris = 0;
  let verts = 0;
  let prims = 0;
  let meshes = 0;
  for (const mesh of gltfRoot.listMeshes()) {
    meshes += 1;
    for (const prim of mesh.listPrimitives()) {
      prims += 1;
      const position = prim.getAttribute('POSITION');
      const indices = prim.getIndices();
      const count = position ? position.getCount() : 0;
      verts += count;
      tris += indices ? Math.round(indices.getCount() / 3) : Math.round(count / 3);
    }
  }

  const materials = gltfRoot.listMaterials();
  const textureSets = new Set(materials.map(textureSetKey));

  const textureRows = gltfRoot.listTextures().map((tex) => {
    const size = tex.getSize?.() || [0, 0];
    const mime = String(tex.getMimeType() || '');
    const uri = String(tex.getURI?.() || '');
    const isKtx2 = mime.includes('ktx') || uri.endsWith('.ktx2');
    // The container does not expose the Basis supercompression band through
    // glTF-Transform, so assume the SG04 profile (UASTC) for KTX2 and treat
    // anything else as an uncompressed upload. `extras.spacefaceCodec` wins when
    // the release pass stamped it.
    const extras = tex.getExtras?.() || {};
    const declared = String(extras.spacefaceCodec || extras.codec || '').toLowerCase();
    const codec = declared.includes('etc1') ? 'etc1s' : isKtx2 ? 'uastc' : 'raw';
    return {
      width: size[0] || 0,
      height: size[1] || 0,
      codec,
      vram: textureVramBytes(size[0] || 0, size[1] || 0, codec),
    };
  });

  const maxDim = textureRows.reduce((max, tex) => Math.max(max, tex.width, tex.height), 0);

  return {
    file: path.relative(root, file).replace(/\\/g, '/'),
    bytes: statSync(file).size,
    tris,
    verts,
    prims,
    meshes,
    materials: materials.length,
    textureSets: textureSets.size,
    tintDuplicates: materials.length - textureSets.size,
    textures: textureRows.length,
    codecs: [...new Set(textureRows.map((tex) => tex.codec))].sort(),
    maxDim,
    vram: textureRows.reduce((sum, tex) => sum + tex.vram, 0),
    animations: gltfRoot.listAnimations().length,
    skins: gltfRoot.listSkins().length,
  };
}

export function categoryFor(relativeFile) {
  if (relativeFile.includes('/render-packages/')) return 'render-packages';
  if (relativeFile.includes('/parts/')) return `parts/${relativeFile.split('/parts/')[1].split('/')[0]}`;
  return 'other';
}

export async function censusAssets({ target, root, filter = null, onProgress = null }) {
  const io = await createCensusIo();
  const files = walkGlbFiles(target).filter((file) => (filter ? file.includes(filter) : true));
  const rows = [];
  const errors = [];
  let done = 0;
  for (const file of files) {
    done += 1;
    onProgress?.(done, files.length);
    try {
      rows.push(await censusFile(io, file, root));
    } catch (err) {
      errors.push({ file: path.relative(root, file).replace(/\\/g, '/'), error: String(err?.message || err) });
    }
  }
  return { rows, errors };
}
