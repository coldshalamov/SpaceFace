// SpaceFace — authored fragment families for the debris / cargo class.
//
// The debris-cargo row of docs/visual-assets/VFX_TECHNIQUE_STANDARD.md rejects "a generic
// primitive with no authored construction/material identity". Before this module every solid
// fragment in the game was one hand-shaped rock silhouette reused at three sizes: an asteroid
// chip, a ship's torn armour and a mined mineral were literally the same object.
//
// This library authors four families, each built from its own construction logic and given its
// own surface response:
//
//   metal  — torn hull plate: real thickness, a crease that breaks the top into two facets,
//            knife-edged tear teeth against clean manufactured edges, a weld seam, and a paint
//            coating that steps down to bare steel at the tear.
//   stone  — fracture block: two conchoidal top facets meeting at an arris, a quantised bedding
//            staircase down one flank, and a mineral vein standing proud of the weathered face.
//   ice    — shear wedge: one mirror-flat shear plane against a terraced fracture underside,
//            a feather edge that tapers to nothing, and a deep interior end cap.
//   cargo  — torn container panel: stamped ribs, a hemmed manufactured edge, a corner bracket,
//            a marked centre bay — and one ripped end, so a fragment can never be mistaken for
//            the collectible it fell off.
//
// SIZING (this is the constraint that shapes everything else). The default chase camera sits
// 144 WU out at a 60 degree tilt through a 50 degree vertical FOV, so the debris plane resolves
// at ~5.96 px per WU on a 1280x800 frame. A fragment therefore has a few pixels to make its case.
// Fine surface strokes are invisible at that size; what survives is silhouette, thickness,
// specular response and large blocks of tone. Every authored detail here is sized to read at
// 6 px/WU, and the shared atlas is deliberately low frequency for the same reason.
//
// RULE M1. These are solids. Emission is disabled on every material in this file and there is no
// additive blending anywhere. Local heat is carried by the caller's per-particle colour track,
// which multiplies the lit result; it can warm a fresh edge and cool away, and it can never turn
// the object into a light source.

import * as THREE from 'three';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from '../sharedMaterialRoles.js';

export const FRAGMENT_FAMILY = Object.freeze({
  METAL: 'metal',
  STONE: 'stone',
  ICE: 'ice',
  CARGO: 'cargo',
});

export const FRAGMENT_DETAIL = Object.freeze({
  NEAR: 'near',
  FAR: 'far',
});

export const FRAGMENT_FAMILY_LIST = Object.freeze([
  FRAGMENT_FAMILY.METAL,
  FRAGMENT_FAMILY.STONE,
  FRAGMENT_FAMILY.ICE,
  FRAGMENT_FAMILY.CARGO,
]);

// Atlas geometry. One 256x256 albedo page and one 256x256 surface page (green = roughness,
// blue = metalness) serve every family, so all four materials share two resident textures and
// one shader program family. 2x2 regions of 128, each region holding three horizontal bands.
export const FRAGMENT_ATLAS_SIZE = 256;
const REGION = 128;
const BAND_INSET = 6;
const BAND_STRIDE = 39;
const BAND_HEIGHT = 35;

// Region origin in texel space, per family.
const REGION_ORIGIN = Object.freeze({
  [FRAGMENT_FAMILY.METAL]: [0, REGION],
  [FRAGMENT_FAMILY.STONE]: [REGION, REGION],
  [FRAGMENT_FAMILY.ICE]: [0, 0],
  [FRAGMENT_FAMILY.CARGO]: [REGION, 0],
});

// Band names, in band order, per family. A face picks the band whose substance it actually is.
export const FRAGMENT_BAND = Object.freeze({
  [FRAGMENT_FAMILY.METAL]: Object.freeze({ coat: 0, bare: 1, weld: 2 }),
  [FRAGMENT_FAMILY.STONE]: Object.freeze({ face: 0, fresh: 1, vein: 2 }),
  [FRAGMENT_FAMILY.ICE]: Object.freeze({ clear: 0, frost: 1, deep: 2 }),
  [FRAGMENT_FAMILY.CARGO]: Object.freeze({ panel: 0, mark: 1, bare: 2 }),
});

/** UV rectangle of one band, in 0..1 texture space, inset off the region edge so mips stay clean. */
export function fragmentBandRect(family, band) {
  const origin = REGION_ORIGIN[family];
  if (!origin) throw new Error('unknown fragment family: ' + family);
  const index = typeof band === 'number' ? band : (FRAGMENT_BAND[family][band] ?? 0);
  const x0 = origin[0] + BAND_INSET;
  const x1 = origin[0] + REGION - BAND_INSET;
  const y0 = origin[1] + BAND_INSET + index * BAND_STRIDE;
  const y1 = y0 + BAND_HEIGHT;
  const s = FRAGMENT_ATLAS_SIZE;
  return { u0: x0 / s, v0: y0 / s, u1: x1 / s, v1: y1 / s };
}

// ---------------------------------------------------------------------------------------------
// Deterministic noise. Geometry and atlas must be byte-identical on every machine and every run,
// so nothing in this file touches Math.random.
// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Atlas painting. Deliberate blocks, bands and marks — never hash noise as the artwork. The grain
// pass is a low-amplitude support layer on top of authored content, at an amplitude chosen so it
// survives as texture rather than reading as static.
// ---------------------------------------------------------------------------------------------

function makePage(fill) {
  const size = FRAGMENT_ATLAS_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function rect(page, x0, y0, w, h, rgb) {
  const size = FRAGMENT_ATLAS_SIZE;
  const xEnd = Math.min(size, Math.round(x0 + w));
  const yEnd = Math.min(size, Math.round(y0 + h));
  for (let y = Math.max(0, Math.round(y0)); y < yEnd; y++) {
    for (let x = Math.max(0, Math.round(x0)); x < xEnd; x++) {
      const i = (y * size + x) * 4;
      page[i] = rgb[0]; page[i + 1] = rgb[1]; page[i + 2] = rgb[2];
    }
  }
}

// A ragged horizontal boundary: paint that stopped where the metal tore, strata that are not
// ruled lines. Deterministic per row.
function raggedBand(page, x0, y0, w, h, rgb, seed, amplitude) {
  const size = FRAGMENT_ATLAS_SIZE;
  for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x0 + w)); x++) {
    const wobble = Math.round((hash2(x, seed) - 0.5) * 2 * amplitude);
    for (let y = Math.max(0, Math.round(y0 + wobble)); y < Math.min(size, Math.round(y0 + h + wobble)); y++) {
      const i = (y * size + x) * 4;
      page[i] = rgb[0]; page[i + 1] = rgb[1]; page[i + 2] = rgb[2];
    }
  }
}

// Diagonal hazard bars, the one mark that has to survive being four pixels wide.
function diagonalBars(page, x0, y0, w, h, rgb, period, duty) {
  const size = FRAGMENT_ATLAS_SIZE;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y0 + h)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x0 + w)); x++) {
      if (((x + y) % period) < duty) {
        const i = (y * size + x) * 4;
        page[i] = rgb[0]; page[i + 1] = rgb[1]; page[i + 2] = rgb[2];
      }
    }
  }
}

function grain(page, amplitude, seed) {
  const size = FRAGMENT_ATLAS_SIZE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.round((hash2(x * 7 + seed, y * 13 + seed) - 0.5) * 2 * amplitude);
      page[i] = Math.max(0, Math.min(255, page[i] + d));
      page[i + 1] = Math.max(0, Math.min(255, page[i + 1] + d));
      page[i + 2] = Math.max(0, Math.min(255, page[i + 2] + d));
    }
  }
}

function bandBox(family, band) {
  const origin = REGION_ORIGIN[family];
  const index = FRAGMENT_BAND[family][band];
  return {
    x: origin[0],
    y: origin[1] + BAND_INSET + index * BAND_STRIDE - BAND_INSET,
    w: REGION,
    h: BAND_STRIDE + BAND_INSET,
  };
}

// Surface page convention: r unused, g = roughness, b = metalness.
function paintSurface(page, family, band, roughness, metalness) {
  const box = bandBox(family, band);
  rect(page, box.x, box.y, box.w, box.h, [
    128,
    Math.round(Math.max(0, Math.min(1, roughness)) * 255),
    Math.round(Math.max(0, Math.min(1, metalness)) * 255),
  ]);
}

function paintAlbedoPages() {
  const albedo = makePage([120, 120, 120]);
  const surface = makePage([128, 200, 0]);

  const M = FRAGMENT_FAMILY.METAL;
  const S = FRAGMENT_FAMILY.STONE;
  const I = FRAGMENT_FAMILY.ICE;
  const C = FRAGMENT_FAMILY.CARGO;

  // --- metal -----------------------------------------------------------------------------
  // coat: industrial paint with two worn scuff runs and a ragged lower edge where the coating
  // has peeled back off the tear.
  let b = bandBox(M, 'coat');
  rect(albedo, b.x, b.y, b.w, b.h, [58, 66, 76]);
  rect(albedo, b.x, b.y + 9, b.w, 4, [78, 86, 96]);
  rect(albedo, b.x, b.y + 26, b.w, 3, [44, 50, 58]);
  raggedBand(albedo, b.x, b.y + b.h - 8, b.w, 8, [138, 146, 156], 11, 3);
  paintSurface(surface, M, 'coat', 0.56, 0.18);

  // bare: raw steel under the paint, with one drag-polished streak from the tear.
  b = bandBox(M, 'bare');
  rect(albedo, b.x, b.y, b.w, b.h, [150, 158, 168]);
  rect(albedo, b.x, b.y + 14, b.w, 6, [196, 203, 211]);
  rect(albedo, b.x, b.y + 30, b.w, 4, [112, 119, 128]);
  paintSurface(surface, M, 'bare', 0.34, 0.94);

  // weld: a run of overlapping bead lenses, the most legible "this was built" mark on a plate.
  b = bandBox(M, 'weld');
  rect(albedo, b.x, b.y, b.w, b.h, [92, 100, 110]);
  for (let x = b.x + 4; x < b.x + b.w - 4; x += 9) {
    rect(albedo, x, b.y + 12, 7, 12, [132, 139, 147]);
    rect(albedo, x + 1, b.y + 14, 5, 5, [162, 168, 175]);
  }
  paintSurface(surface, M, 'weld', 0.62, 0.82);

  // --- stone -----------------------------------------------------------------------------
  // face: weathered exterior, three broad strata.
  b = bandBox(S, 'face');
  rect(albedo, b.x, b.y, b.w, b.h, [126, 118, 106]);
  rect(albedo, b.x, b.y + 8, b.w, 10, [112, 104, 93]);
  rect(albedo, b.x, b.y + 24, b.w, 8, [138, 130, 118]);
  paintSurface(surface, S, 'face', 0.93, 0.03);

  // fresh: pale unweathered fracture, with a few angular facet wedges.
  b = bandBox(S, 'fresh');
  rect(albedo, b.x, b.y, b.w, b.h, [182, 173, 160]);
  for (let k = 0; k < 6; k++) {
    const x = b.x + 6 + k * 20;
    rect(albedo, x, b.y + 6 + (k % 2) * 12, 13, 9, k % 2 ? [198, 190, 178] : [164, 155, 143]);
  }
  paintSurface(surface, S, 'fresh', 0.78, 0.04);

  // vein: dark matrix carrying two bright mineral runs — the structure, not a sparkle.
  b = bandBox(S, 'vein');
  rect(albedo, b.x, b.y, b.w, b.h, [82, 76, 68]);
  raggedBand(albedo, b.x, b.y + 10, b.w, 5, [214, 199, 138], 23, 2);
  raggedBand(albedo, b.x, b.y + 26, b.w, 3, [186, 170, 112], 29, 2);
  paintSurface(surface, S, 'vein', 0.48, 0.38);

  // --- ice -------------------------------------------------------------------------------
  // clear: the shear plane. Nearly white, very smooth, with straight internal fracture lines.
  b = bandBox(I, 'clear');
  rect(albedo, b.x, b.y, b.w, b.h, [207, 228, 242]);
  for (let k = 0; k < 4; k++) rect(albedo, b.x + 10 + k * 28, b.y + 4, 2, b.h - 8, [228, 242, 250]);
  paintSurface(surface, I, 'clear', 0.07, 0.0);

  // frost: rime on the fractured underside, granular and matte.
  b = bandBox(I, 'frost');
  rect(albedo, b.x, b.y, b.w, b.h, [236, 243, 248]);
  for (let y = b.y + 3; y < b.y + b.h - 3; y += 5) {
    for (let x = b.x + 3 + ((y / 5) | 0) % 2 * 3; x < b.x + b.w - 3; x += 7) {
      rect(albedo, x, y, 3, 3, [219, 229, 238]);
    }
  }
  paintSurface(surface, I, 'frost', 0.70, 0.0);

  // deep: interior ice at the thick end, layered and blue.
  b = bandBox(I, 'deep');
  rect(albedo, b.x, b.y, b.w, b.h, [143, 184, 212]);
  rect(albedo, b.x, b.y + 7, b.w, 6, [120, 163, 196]);
  rect(albedo, b.x, b.y + 22, b.w, 5, [166, 203, 226]);
  paintSurface(surface, I, 'deep', 0.16, 0.0);

  // --- cargo -----------------------------------------------------------------------------
  // panel: painted container body with rib shadows and a hem line.
  b = bandBox(C, 'panel');
  rect(albedo, b.x, b.y, b.w, b.h, [178, 96, 42]);
  rect(albedo, b.x, b.y + 5, b.w, 3, [138, 72, 30]);
  rect(albedo, b.x, b.y + b.h - 9, b.w, 4, [206, 120, 58]);
  paintSurface(surface, C, 'panel', 0.52, 0.12);

  // mark: the shipping identity — hazard bars against a stencil plate. This is the block that
  // tells the player a fragment came off freight and not off a rock.
  b = bandBox(C, 'mark');
  rect(albedo, b.x, b.y, b.w, b.h, [222, 205, 176]);
  diagonalBars(albedo, b.x, b.y, b.w, 14, [232, 195, 58], 12, 6);
  diagonalBars(albedo, b.x, b.y, b.w, 14, [38, 34, 30], 12, 2);
  rect(albedo, b.x + 12, b.y + 20, 26, 12, [38, 34, 30]);
  rect(albedo, b.x + 46, b.y + 20, 14, 12, [38, 34, 30]);
  rect(albedo, b.x + 68, b.y + 20, 34, 12, [38, 34, 30]);
  paintSurface(surface, C, 'mark', 0.44, 0.08);

  // bare: galvanised steel where the panel ripped, with a bright shear lip.
  b = bandBox(C, 'bare');
  rect(albedo, b.x, b.y, b.w, b.h, [155, 163, 168]);
  rect(albedo, b.x, b.y + 16, b.w, 5, [206, 213, 218]);
  paintSurface(surface, C, 'bare', 0.38, 0.88);

  grain(albedo, 5, 17);
  grain(surface, 6, 41);
  return { albedo, surface };
}

function makeTexture(data, colorSpace) {
  const tex = new THREE.DataTexture(data, FRAGMENT_ATLAS_SIZE, FRAGMENT_ATLAS_SIZE, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build the two shared atlas pages. One call per renderer; every fragment material binds the
 * same two textures, so the whole debris class costs 2 texture residencies and one program family.
 */
export function createFragmentAtlas() {
  const pages = paintAlbedoPages();
  const albedo = makeTexture(pages.albedo, THREE.SRGBColorSpace);
  albedo.name = 'SF_FragmentAlbedoAtlas';
  const surface = makeTexture(pages.surface, THREE.NoColorSpace);
  surface.name = 'SF_FragmentSurfaceAtlas';
  return {
    albedo,
    surface,
    dispose() {
      albedo.dispose();
      surface.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry authoring. Everything is written non-indexed with flat normals: each authored cut
// plane has to hold its own shading through a tumble, which is the whole point of a fracture.
// ---------------------------------------------------------------------------------------------

function createSink(family, extent) {
  const positions = [];
  const uvs = [];
  const inv = { x: 1 / (extent.x || 1), y: 1 / (extent.y || 1), z: 1 / (extent.z || 1) };
  const rects = {};
  for (const band of Object.keys(FRAGMENT_BAND[family])) rects[band] = fragmentBandRect(family, band);

  function vertex(p, band, uvOverride) {
    positions.push(p[0], p[1], p[2]);
    const r = rects[band] || rects[Object.keys(rects)[0]];
    let u;
    let v;
    if (uvOverride) {
      u = uvOverride[0];
      v = uvOverride[1];
    } else {
      u = Math.max(0, Math.min(1, p[0] * inv.x * 0.5 + 0.5));
      v = Math.max(0, Math.min(1, p[2] * inv.z * 0.5 + 0.5));
    }
    uvs.push(r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v);
  }

  return {
    positions,
    uvs,
    tri(a, bb, c, band) {
      vertex(a, band); vertex(bb, band); vertex(c, band);
    },
    quad(a, bb, c, d, band) {
      vertex(a, band); vertex(bb, band); vertex(c, band);
      vertex(a, band); vertex(c, band); vertex(d, band);
    },
    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    },
  };
}

// Rounded-rectangle perimeter: a plate is not an ellipse and not a hexagon.
function superPoint(angle, halfX, halfZ, power) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    Math.sign(c) * Math.pow(Math.abs(c), power) * halfX,
    0,
    Math.sign(s) * Math.pow(Math.abs(s), power) * halfZ,
  ];
}

// --- metal: torn hull plate --------------------------------------------------------------------

function buildMetalPlate(detail) {
  const near = detail !== FRAGMENT_DETAIL.FAR;
  const N = near ? 18 : 10;
  const halfX = 0.36;
  const halfZ = 0.52;
  const T = 0.045;
  const ridgeZ = 0.09;
  const ridgeH = 0.062;
  const ridgeW = 0.34;
  const rand = mulberry32(0x5f1a27);
  const sink = createSink(FRAGMENT_FAMILY.METAL, { x: halfX * 2.4, y: 0.3, z: halfZ * 2.4 });

  // tent crease: piecewise linear so the two halves stay genuinely non-coplanar
  const crease = (z) => ridgeH * Math.max(0, 1 - Math.abs(z - ridgeZ) / ridgeW);

  const rim = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // One long side and one short side are factory cuts; the rest was ripped off a hull.
    const manufactured = a > 0.15 && a < 2.45;
    const p = superPoint(a, halfX, halfZ, 0.62);
    let scale = 1;
    let tip = false;
    if (!manufactured) {
      const tooth = (i % 2) === 0 ? 0.13 : -0.17;
      scale = 1 + tooth + (rand() - 0.5) * 0.09;
      tip = (i % 2) === 0;
    } else {
      scale = 1 + (rand() - 0.5) * 0.02;
    }
    const x = p[0] * scale;
    const z = p[2] * scale;
    rim.push({ x, z, manufactured, thin: tip ? 0.2 : 1 });
  }

  const top = rim.map((p) => [p.x, T * p.thin + crease(p.z), p.z]);
  const bottom = rim.map((p) => [p.x, -T * p.thin, p.z]);
  const apex = [0, T + ridgeH, ridgeZ];

  if (near) {
    // The coating stops short of the tear: an inset ring sits one paint-thickness proud of the
    // steel, so a torn plate shows a painted cap with a bare bevel running round its edge.
    const COAT = 0.84;
    const coatLift = 0.015;
    const ring = rim.map((p) => {
      const x = p.x * COAT;
      const z = p.z * COAT;
      return [x, T + crease(z) + coatLift, z];
    });
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      sink.tri(apex, ring[j], ring[i], 'coat');
      sink.quad(ring[i], top[i], top[j], ring[j], 'bare');
    }
    // Manufactured weld seam across the plate: two narrow raised quads, the clearest "built"
    // signal a four-pixel fragment can carry.
    const wz = -0.30 * halfZ;
    const wh = 0.020;
    const wHalf = 0.028;
    const wx = halfX * 0.74;
    const yw = (z) => T + crease(z) + coatLift;
    sink.quad(
      [-wx, yw(wz - wHalf), wz - wHalf], [wx, yw(wz - wHalf), wz - wHalf],
      [wx, yw(wz) + wh, wz], [-wx, yw(wz) + wh, wz], 'weld',
    );
    sink.quad(
      [-wx, yw(wz) + wh, wz], [wx, yw(wz) + wh, wz],
      [wx, yw(wz + wHalf), wz + wHalf], [-wx, yw(wz + wHalf), wz + wHalf], 'weld',
    );
  } else {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      sink.tri(apex, top[j], top[i], 'coat');
    }
  }

  const under = [0, -T - 0.014, 0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    sink.tri(under, bottom[i], bottom[j], 'bare');
    // The rim IS the thickness. Torn tips converge to a knife edge; factory edges stay square.
    sink.quad(top[i], bottom[i], bottom[j], top[j], rim[i].manufactured ? 'weld' : 'bare');
  }

  return sink.build();
}

// --- stone: fracture block ---------------------------------------------------------------------

function buildStoneBlock(detail) {
  const near = detail !== FRAGMENT_DETAIL.FAR;
  const N = near ? 9 : 6;
  const halfX = 0.44;
  const halfZ = 0.40;
  const T = 0.26;
  const rand = mulberry32(0x2c7b41);
  const sink = createSink(FRAGMENT_FAMILY.STONE, { x: halfX * 2.4, y: T * 2.4, z: halfZ * 2.4 });

  const rim = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.21;
    const r = 0.78 + rand() * 0.34;
    const x = Math.cos(a) * halfX * r;
    const z = Math.sin(a) * halfZ * r;
    // Conchoidal arris: the top falls away from a ridge running along z.
    let y = T * (1 - 0.52 * Math.abs(x) / halfX);
    // Bedding staircase down one flank: quantised so the rim shows real risers, not a ramp.
    if (near && x > halfX * 0.12) y = Math.round(y / (T * 0.24)) * (T * 0.24);
    rim.push({ x, z, y });
  }

  const apex = [0, T * 1.04, 0.05];
  const mid = rim.map((p) => [p.x * 0.55, p.y * 0.96 + T * 0.05, p.z * 0.55]);
  const top = rim.map((p) => [p.x, p.y, p.z]);
  const bottom = rim.map((p) => [p.x * 0.94, -T * 0.72, p.z * 0.94]);

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (near) {
      // Fresh inner fracture against weathered outer face: the same block, two ages of surface.
      sink.tri(apex, mid[j], mid[i], 'fresh');
      sink.quad(mid[i], top[i], top[j], mid[j], 'face');
    } else {
      sink.tri(apex, top[j], top[i], 'face');
    }
    sink.tri([0, -T * 0.9, 0], bottom[i], bottom[j], 'face');
    sink.quad(top[i], bottom[i], bottom[j], top[j], 'face');
  }

  // Mineral vein standing proud of the weathered face — quartz outlasts its matrix. This is the
  // stone family's identity mark and the one detail deliberately given its own band.
  const vh = T * 0.09;
  const vw = 0.055;
  const steps = near ? 4 : 2;
  for (let k = 0; k < steps; k++) {
    const z0 = -halfZ * 0.8 + (k / steps) * halfZ * 1.6;
    const z1 = -halfZ * 0.8 + ((k + 1) / steps) * halfZ * 1.6;
    const yA = T * (1 - 0.52 * Math.abs(0) / halfX) + vh;
    const xo = Math.sin(k * 1.7) * 0.06;
    sink.quad(
      [xo - vw, yA, z0], [xo + vw, yA, z0],
      [xo + vw + 0.02, yA, z1], [xo - vw + 0.02, yA, z1], 'vein',
    );
  }

  return sink.build();
}

// --- ice: shear wedge ----------------------------------------------------------------------------

function buildIceWedge(detail) {
  const near = detail !== FRAGMENT_DETAIL.FAR;
  const steps = near ? 4 : 2;
  const halfX = 0.28;
  const halfZ = 0.48;
  const thick = 0.20;
  const feather = 0.008;
  const sink = createSink(FRAGMENT_FAMILY.ICE, { x: halfX * 2.2, y: thick * 2.4, z: halfZ * 2.2 });

  // Top is ONE plane. Ice cleaves flat, and a mirror face is what separates it on sight from a
  // rock chip at four pixels: it catches a single hard specular sheet as it tumbles.
  const yTop = (z) => thick * (1 - (z + halfZ) / (2 * halfZ)) + feather;
  sink.quad(
    [-halfX, yTop(-halfZ), -halfZ], [halfX, yTop(-halfZ), -halfZ],
    [halfX * 0.32, yTop(halfZ), halfZ], [-halfX * 0.32, yTop(halfZ), halfZ], 'clear',
  );

  // Underside is terraced: riser, tread, riser, tread. The opposite response to the shear face.
  const xAt = (t) => halfX * (1 - 0.68 * t);
  let prevY = -thick * 0.62;
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps;
    const t1 = (k + 1) / steps;
    const z0 = -halfZ + t0 * 2 * halfZ;
    const z1 = -halfZ + t1 * 2 * halfZ;
    const y1 = -thick * 0.62 * (1 - t1) - feather * t1;
    const x0 = xAt(t0);
    const x1 = xAt(t1);
    // tread
    sink.quad([-x0, prevY, z0], [-x1, prevY, z1], [x1, prevY, z1], [x0, prevY, z0], 'frost');
    // riser
    sink.quad([-x1, prevY, z1], [-x1, y1, z1], [x1, y1, z1], [x1, prevY, z1], 'frost');
    // flanks
    sink.quad([x0, prevY, z0], [x1, prevY, z1], [x1, yTop(z1), z1], [x0, yTop(z0), z0], 'frost');
    sink.quad([-x0, yTop(z0), z0], [-x1, yTop(z1), z1], [-x1, prevY, z1], [-x0, prevY, z0], 'frost');
    prevY = y1;
  }

  // Thick end cap: the interior the fragment was broken out of.
  sink.quad(
    [-halfX, -thick * 0.62, -halfZ], [halfX, -thick * 0.62, -halfZ],
    [halfX, yTop(-halfZ), -halfZ], [-halfX, yTop(-halfZ), -halfZ], 'deep',
  );

  return sink.build();
}

// --- cargo: torn container panel -------------------------------------------------------------

function buildCargoPanel(detail) {
  const near = detail !== FRAGMENT_DETAIL.FAR;
  const halfX = 0.34;
  const halfZ = 0.46;
  const T = 0.028;
  const ribH = 0.052;
  const sink = createSink(FRAGMENT_FAMILY.CARGO, { x: halfX * 2.2, y: 0.24, z: halfZ * 2.2 });

  const zTear = halfZ;
  const zBack = -halfZ;

  // Longitudinal strips: outer skin, stamped rib, marked centre bay, stamped rib, outer skin.
  // Ribs are what a pressed container panel actually looks like, and they read as two bright
  // lines catching the key light while the bays stay dark.
  const cuts = near
    ? [-halfX, -halfX * 0.62, -halfX * 0.30, halfX * 0.30, halfX * 0.62, halfX]
    : [-halfX, -halfX * 0.22, halfX * 0.22, halfX];
  const ribIndex = near ? [1, 3] : [1];
  const markIndex = near ? 2 : -1;

  for (let s = 0; s < cuts.length - 1; s++) {
    const x0 = cuts[s];
    const x1 = cuts[s + 1];
    const raised = ribIndex.includes(s);
    const y = T + (raised ? ribH : 0);
    const band = s === markIndex ? 'mark' : 'panel';
    sink.quad([x0, y, zBack], [x1, y, zBack], [x1, y, zTear], [x0, y, zTear], band);
    if (raised) {
      // rib flanks — the trapezoid shoulders
      sink.quad([x0, T, zBack], [x0, y, zBack], [x0, y, zTear], [x0, T, zTear], 'panel');
      sink.quad([x1, y, zBack], [x1, T, zBack], [x1, T, zTear], [x1, y, zTear], 'panel');
    }
  }

  // Hemmed manufactured edge: the skin folds back on itself along one long side.
  const hem = 0.05;
  sink.quad([-halfX, T, zBack], [-halfX - hem, T - 0.018, zBack], [-halfX - hem, T - 0.018, zTear], [-halfX, T, zTear], 'panel');
  sink.quad([-halfX - hem, T - 0.018, zBack], [-halfX - hem * 0.55, -T, zBack], [-halfX - hem * 0.55, -T, zTear], [-halfX - hem, T - 0.018, zTear], 'bare');

  // Underside and the two clean rims.
  sink.quad([-halfX, -T, zBack], [halfX, -T, zBack], [halfX, -T, zTear], [-halfX, -T, zTear], 'bare');
  sink.quad([halfX, T, zBack], [halfX, -T, zBack], [halfX, -T, zTear], [halfX, T, zTear], 'bare');
  sink.quad([-halfX, T, zBack], [halfX, T, zBack], [halfX, -T, zBack], [-halfX, -T, zBack], 'bare');

  // The ripped end. A cargo fragment must never be mistakable for the collectible it fell off,
  // so one end is always torn open to bare steel.
  const teeth = near ? 5 : 3;
  for (let k = 0; k < teeth; k++) {
    const x0 = -halfX + (k / teeth) * 2 * halfX;
    const x1 = -halfX + ((k + 1) / teeth) * 2 * halfX;
    const xm = (x0 + x1) * 0.5;
    const out = (k % 2 === 0) ? 0.072 : 0.018;
    sink.tri([x0, T, zTear], [xm, T * 0.25, zTear + out], [x1, T, zTear], 'bare');
    sink.tri([x1, -T, zTear], [xm, -T * 0.25, zTear + out], [x0, -T, zTear], 'bare');
    sink.quad([x0, T, zTear], [x0, -T, zTear], [xm, -T * 0.25, zTear + out], [xm, T * 0.25, zTear + out], 'bare');
    sink.quad([xm, T * 0.25, zTear + out], [xm, -T * 0.25, zTear + out], [x1, -T, zTear], [x1, T, zTear], 'bare');
  }

  if (near) {
    // Corner bracket: a stamped reinforcement boss. Small, but it is the difference between
    // "panel" and "sheet".
    const bx0 = halfX * 0.52;
    const bx1 = halfX * 0.94;
    const bz0 = -halfZ * 0.92;
    const bz1 = -halfZ * 0.52;
    const by = T + 0.038;
    sink.quad([bx0, by, bz0], [bx1, by, bz0], [bx1, by, bz1], [bx0, by, bz1], 'bare');
    sink.quad([bx0, T, bz0], [bx0, by, bz0], [bx0, by, bz1], [bx0, T, bz1], 'bare');
    sink.quad([bx1, by, bz0], [bx1, T, bz0], [bx1, T, bz1], [bx1, by, bz1], 'bare');
    sink.quad([bx0, by, bz1], [bx1, by, bz1], [bx1, T, bz1], [bx0, T, bz1], 'bare');
  }

  return sink.build();
}

const BUILDERS = Object.freeze({
  [FRAGMENT_FAMILY.METAL]: buildMetalPlate,
  [FRAGMENT_FAMILY.STONE]: buildStoneBlock,
  [FRAGMENT_FAMILY.ICE]: buildIceWedge,
  [FRAGMENT_FAMILY.CARGO]: buildCargoPanel,
});

/**
 * Fold an existing geometry's 0..1 UVs into one family band of the shared atlas.
 * Lets a pre-existing solid (a shell casing, say) join the same texture and the same shader
 * program family without being re-authored.
 */
export function remapUvIntoBand(geo, family, band) {
  const uv = geo && geo.getAttribute ? geo.getAttribute('uv') : null;
  if (!uv) return geo;
  const r = fragmentBandRect(family, band);
  for (let i = 0; i < uv.count; i++) {
    const u = Math.max(0, Math.min(1, uv.getX(i)));
    const v = Math.max(0, Math.min(1, uv.getY(i)));
    uv.setXY(i, r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Authored geometry for one family at one distance representation.
 * `scale` applies a uniform nominal size in world units (the caller's startSize rides on top).
 */
export function buildFragmentGeometry(family, options = {}) {
  const builder = BUILDERS[family];
  if (!builder) throw new Error('unknown fragment family: ' + family);
  const detail = options.detail === FRAGMENT_DETAIL.FAR ? FRAGMENT_DETAIL.FAR : FRAGMENT_DETAIL.NEAR;
  const geo = builder(detail);
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  if (scale !== 1) {
    geo.scale(scale, scale, scale);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
  geo.name = 'SF_Fragment_' + family + '_' + detail;
  geo.userData.fragmentFamily = family;
  geo.userData.fragmentDetail = detail;
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Materials. Every family is an opaque, scene-lit MeshStandardMaterial with emission disabled and
// the two shared atlas pages bound, so all four share one shader program and two textures. The
// base colour stays near white where the atlas already carries the hue, so the per-particle heat
// track can warm a fresh edge without inventing a second palette.
// ---------------------------------------------------------------------------------------------

const MATERIAL_SPEC = Object.freeze({
  [FRAGMENT_FAMILY.METAL]: { color: 0xffffff, roughness: 0.48, metalness: 0.78, role: SHARED_MATERIAL_ROLE.HULL },
  [FRAGMENT_FAMILY.STONE]: { color: 0xffffff, roughness: 0.88, metalness: 0.06, role: SHARED_MATERIAL_ROLE.ROCK },
  [FRAGMENT_FAMILY.ICE]: { color: 0xffffff, roughness: 0.22, metalness: 0.02, role: SHARED_MATERIAL_ROLE.ROCK },
  [FRAGMENT_FAMILY.CARGO]: { color: 0xffffff, roughness: 0.52, metalness: 0.28, role: SHARED_MATERIAL_ROLE.HULL },
});

/**
 * One shared-role material per family. `atlas` comes from createFragmentAtlas(); pass null only
 * where textures are genuinely unavailable — the material stays valid and untextured.
 */
export function createFragmentMaterial(family, atlas = null, overrides = null) {
  const spec = MATERIAL_SPEC[family];
  if (!spec) throw new Error('unknown fragment family: ' + family);
  const mat = new THREE.MeshStandardMaterial({
    color: (overrides && overrides.color != null) ? overrides.color : spec.color,
    roughness: (overrides && overrides.roughness != null) ? overrides.roughness : spec.roughness,
    metalness: (overrides && overrides.metalness != null) ? overrides.metalness : spec.metalness,
    transparent: false,
    depthWrite: true,
  });
  // M1: solid matter never self-illuminates. The heat that belongs on a fresh edge arrives
  // through the per-particle colour multiply and cools with it.
  mat.emissive = new THREE.Color(0x000000);
  mat.emissiveIntensity = 0;
  if (atlas) {
    mat.map = atlas.albedo;
    mat.roughnessMap = atlas.surface;
    mat.metalnessMap = atlas.surface;
  }
  mat.name = 'SF_FragmentMat_' + family;
  mat.userData.fragmentFamily = family;
  return stampSharedMaterialRole(mat, spec.role);
}

// ---------------------------------------------------------------------------------------------
// Routing and bounds
// ---------------------------------------------------------------------------------------------

// The impacts lane's record carries a materialId. Anything not solid matter routes to null and
// the debris lane stays silent rather than inventing fragments for an energy event.
const MATERIAL_ID_TO_FAMILY = Object.freeze({
  hull: FRAGMENT_FAMILY.METAL,
  armor: FRAGMENT_FAMILY.METAL,
  armour: FRAGMENT_FAMILY.METAL,
  metal: FRAGMENT_FAMILY.METAL,
  station: FRAGMENT_FAMILY.METAL,
  // A delaminating composite panel sheds plies, not chips: the torn plate with its coating step
  // is the nearest authored truth we have, so composite routes to metal rather than to rock.
  composite: FRAGMENT_FAMILY.METAL,
  rock: FRAGMENT_FAMILY.STONE,
  stone: FRAGMENT_FAMILY.STONE,
  asteroid: FRAGMENT_FAMILY.STONE,
  regolith: FRAGMENT_FAMILY.STONE,
  ore: FRAGMENT_FAMILY.STONE,
  mineral: FRAGMENT_FAMILY.STONE,
  ceramic: FRAGMENT_FAMILY.STONE,
  ice: FRAGMENT_FAMILY.ICE,
  volatiles: FRAGMENT_FAMILY.ICE,
  cargo: FRAGMENT_FAMILY.CARGO,
  container: FRAGMENT_FAMILY.CARGO,
  crate: FRAGMENT_FAMILY.CARGO,
  freight: FRAGMENT_FAMILY.CARGO,
});

/**
 * Map an impact record's materialId (or a commodity id) onto a fragment family.
 * Returns null for shields, energy, unknown ids and missing values — never throws.
 */
export function resolveFragmentFamily(materialId) {
  if (materialId == null) return null;
  const raw = String(materialId).trim().toLowerCase();
  if (!raw) return null;
  if (MATERIAL_ID_TO_FAMILY[raw]) return MATERIAL_ID_TO_FAMILY[raw];
  // Commodity ids (cmdty_ice_water, cmdty_ore_iron, cmdty_comp_hullplate) arrive from mining and
  // freight events; classify by their substance segment.
  if (raw.startsWith('cmdty_')) {
    if (raw.includes('ice') || raw.includes('volatile') || raw.includes('hydrogen')) return FRAGMENT_FAMILY.ICE;
    if (raw.includes('ore') || raw.includes('silicate') || raw.includes('gem')
      || raw.includes('crystal') || raw.includes('regocrete')) return FRAGMENT_FAMILY.STONE;
    if (raw.includes('metal') || raw.includes('alloy') || raw.includes('hullplate')
      || raw.includes('scrap') || raw.includes('salvage')) return FRAGMENT_FAMILY.METAL;
    return FRAGMENT_FAMILY.CARGO;
  }
  for (const key of Object.keys(MATERIAL_ID_TO_FAMILY)) {
    if (raw.includes(key)) return MATERIAL_ID_TO_FAMILY[key];
  }
  return null;
}

// Pool ceilings. At ~6 px/WU a burst of thirty chips is visual static, not matter: the readable
// answer is fewer and larger. These are hard caps on live instances per family, enforced by the
// spawn path, and they also size the instanced buffers so nothing reallocates mid-frame.
export const FRAGMENT_POOL_CEILING = Object.freeze({
  [FRAGMENT_FAMILY.METAL]: 72,
  [FRAGMENT_FAMILY.STONE]: 112,
  [FRAGMENT_FAMILY.ICE]: 80,
  [FRAGMENT_FAMILY.CARGO]: 56,
});
