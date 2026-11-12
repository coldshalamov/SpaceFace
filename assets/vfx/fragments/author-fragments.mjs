// Authoring / export source for the debris-cargo fragment families.
//
// WHAT THIS IS
// ------------
// `src/render/vfx/fragmentFamilies.js` is the authored construction: four families (metal, stone,
// ice, cargo), each with a near and a far distance representation, plus two shared atlas pages.
// The runtime builds that geometry directly, which is why it costs no fetch, no async load and no
// first-use hitch, and why it is byte-identical on every machine.
//
// This script is the editable counterpart. It runs the same authored builders offline and writes:
//
//   meshes/<family>_<detail>.glb      the exported runtime mesh, openable in Blender or any DCC
//   atlas/fragment_albedo.png         the shared albedo page
//   atlas/fragment_surface.png        the shared surface page (green = roughness, blue = metalness)
//   fragments_manifest.json           provenance, production state and the measured budget
//
// HONEST STATUS. The runtime does NOT load these GLBs. Runtime GLB loading in this repo requires
// an entry in `assets/ships/parts/parts_manifest.json`, an entry in the generated release manifest
// and a map in `src/render/partsLibrary.js` — all three outside the debris lane's write set. These
// exports are therefore provenance and DCC handoff: they let the authored forms be inspected,
// reviewed and later replaced by hand-modelled versions through the normal asset route. Their
// production state is `integration_candidate`, not `accepted`; acceptance needs the hash-bound
// independent visual review that `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` requires.
//
// Run:  node assets/vfx/fragments/author-fragments.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FRAGMENT_ATLAS_SIZE,
  FRAGMENT_DETAIL,
  FRAGMENT_FAMILY_LIST,
  FRAGMENT_POOL_CEILING,
  buildFragmentGeometry,
  createFragmentAtlas,
  createFragmentMaterial,
} from '../../../src/render/vfx/fragmentFamilies.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// The camera the fragments are sized for. Default chase distance 144 WU, 60 degree tilt,
// 50 degree vertical FOV, 800 px of frame height.
const CHASE_DISTANCE_WU = 144;
const CHASE_FOV_DEG = 50;
const FRAME_HEIGHT_PX = 800;
const PX_PER_WU = FRAME_HEIGHT_PX
  / (2 * CHASE_DISTANCE_WU * Math.tan((CHASE_FOV_DEG * Math.PI) / 360));

// ---------------------------------------------------------------------------------------------
// Minimal PNG writer. No dependency: zlib is in node, and the rest is four chunks and a CRC.
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Minimal GLB writer. One non-indexed mesh, three float accessors, one PBR material pointing at
// the shared atlas pages by relative URI so the eight meshes do not each carry a texture copy.
// ---------------------------------------------------------------------------------------------

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

function accessorFor(attribute, componentCount, byteOffset, count) {
  const min = new Array(componentCount).fill(Infinity);
  const max = new Array(componentCount).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < componentCount; c++) {
      const v = attribute[i * componentCount + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return {
    bufferView: byteOffset,
    componentType: 5126,
    count,
    type: componentCount === 3 ? 'VEC3' : 'VEC2',
    min,
    max,
  };
}

function encodeGlb(geometry, name, material) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const count = position.count;

  const parts = [
    { data: Float32Array.from(position.array), components: 3 },
    { data: Float32Array.from(normal.array), components: 3 },
    { data: Float32Array.from(uv.array), components: 2 },
  ];

  const bufferViews = [];
  const accessors = [];
  let offset = 0;
  const blobs = [];
  for (let i = 0; i < parts.length; i++) {
    const bytes = Buffer.from(parts[i].data.buffer, parts[i].data.byteOffset, parts[i].data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 });
    accessors.push(accessorFor(parts[i].data, parts[i].components, i, count));
    blobs.push(bytes);
    offset += bytes.length;
    const pad = pad4(offset);
    if (pad) { blobs.push(Buffer.alloc(pad)); offset += pad; }
  }
  const bin = Buffer.concat(blobs);

  const json = {
    asset: { version: '2.0', generator: 'SpaceFace assets/vfx/fragments/author-fragments.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }],
    }],
    materials: [{
      name: material.name,
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: material.metalness,
        roughnessFactor: material.roughness,
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 1 },
      },
    }],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
    images: [
      { uri: '../atlas/fragment_albedo.png' },
      { uri: '../atlas/fragment_surface.png' },
    ],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  let jsonText = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = pad4(jsonText.length);
  if (jsonPad) jsonText = Buffer.concat([jsonText, Buffer.alloc(jsonPad, 0x20)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonText.length + 8 + bin.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonText.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');

  return Buffer.concat([header, jsonHeader, jsonText, binHeader, bin]);
}

// ---------------------------------------------------------------------------------------------

function main() {
  mkdirSync(join(HERE, 'meshes'), { recursive: true });
  mkdirSync(join(HERE, 'atlas'), { recursive: true });

  const atlas = createFragmentAtlas();
  writeFileSync(
    join(HERE, 'atlas', 'fragment_albedo.png'),
    encodePng(FRAGMENT_ATLAS_SIZE, FRAGMENT_ATLAS_SIZE, atlas.albedo.image.data),
  );
  writeFileSync(
    join(HERE, 'atlas', 'fragment_surface.png'),
    encodePng(FRAGMENT_ATLAS_SIZE, FRAGMENT_ATLAS_SIZE, atlas.surface.image.data),
  );

  const entries = [];
  for (const family of FRAGMENT_FAMILY_LIST) {
    const material = createFragmentMaterial(family, atlas);
    for (const detail of [FRAGMENT_DETAIL.NEAR, FRAGMENT_DETAIL.FAR]) {
      const geometry = buildFragmentGeometry(family, { detail });
      const name = family + '_' + detail;
      const file = 'meshes/' + name + '.glb';
      writeFileSync(join(HERE, file), encodeGlb(geometry, name, material));
      const box = geometry.boundingBox;
      const size = {
        x: box.max.x - box.min.x,
        y: box.max.y - box.min.y,
        z: box.max.z - box.min.z,
      };
      const verts = geometry.getAttribute('position').count;
      entries.push({
        family,
        detail,
        file,
        triangles: verts / 3,
        vertices: verts,
        nominalExtentWu: [
          Number(size.x.toFixed(4)), Number(size.y.toFixed(4)), Number(size.z.toFixed(4)),
        ],
        longestEdgePx: Number((Math.max(size.x, size.y, size.z) * PX_PER_WU).toFixed(2)),
      });
      geometry.dispose();
    }
    material.dispose();
  }
  atlas.dispose();

  const manifest = {
    id: 'vfx-fragment-families',
    productionState: 'integration_candidate',
    class: 'debris-cargo',
    authoredBy: 'src/render/vfx/fragmentFamilies.js',
    exportedBy: 'assets/vfx/fragments/author-fragments.mjs',
    runtimeLoadsTheseFiles: false,
    runtimeLoadNote:
      'The runtime builds this geometry directly from the authored source, so there is no fetch, '
      + 'no async load and no first-use hitch. Promoting these GLBs to runtime loads would need '
      + 'assets/ships/parts/parts_manifest.json, the generated release manifest and a '
      + 'src/render/partsLibrary.js map, none of which are in this lane.',
    acceptanceNote:
      'integration_candidate, not accepted: the hash-bound independent visual review required by '
      + 'docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md has not been run on these forms.',
    camera: {
      chaseDistanceWu: CHASE_DISTANCE_WU,
      verticalFovDeg: CHASE_FOV_DEG,
      frameHeightPx: FRAME_HEIGHT_PX,
      pxPerWu: Number(PX_PER_WU.toFixed(3)),
      note: 'Detail is budgeted for this projection, not for a close lab view.',
      sizeNote:
        'nominalExtentWu and longestEdgePx are the authored mesh at scale 1. The runtime '
        + 'multiplies by each family startSize in src/render/vfx/quarksSystem.js, so a shipping '
        + 'hull plate is roughly 1.6x to 4.4x these numbers and a rock block 1.0x to 3.2x.',
    },
    atlas: {
      size: FRAGMENT_ATLAS_SIZE,
      pages: ['atlas/fragment_albedo.png', 'atlas/fragment_surface.png'],
      surfaceChannels: { green: 'roughness', blue: 'metalness' },
      layout: '2x2 family regions, three authored bands per region',
      sharedBy: 'all solid families plus spent brass casings, via remapUvIntoBand',
    },
    poolCeilings: FRAGMENT_POOL_CEILING,
    meshes: entries,
  };
  writeFileSync(join(HERE, 'fragments_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  for (const e of entries) {
    process.stdout.write(
      e.file.padEnd(30) + ' tris=' + String(e.triangles).padStart(4)
      + ' extentWU=' + e.nominalExtentWu.join('x')
      + ' longestEdge=' + e.longestEdgePx + 'px\n',
    );
  }
  process.stdout.write('px per WU at the default chase camera: ' + PX_PER_WU.toFixed(3) + '\n');
}

main();
