#!/usr/bin/env node
// Deep-space IBL generator — authors the equirect environment that replaces the Poly Haven
// industrial-workshop interior as the default image-based light for spaceships in space.
//
//   node scripts/generate-space-ibl.mjs            # write assets/background/env/deep_space_2k.hdr
//   node scripts/generate-space-ibl.mjs --check    # recompute and compare byte-for-byte
//
// WHY: the foundry HDRI gave hulls real reflected structure, but the structure was indoor —
// window rectangles, gantries, a painted floor. Every polished surface mirrored a workshop.
// This script authors a space-true environment with the same discipline the runtime applies to
// any IBL source (deterministic, mean-radiance-normalized downstream): a deep-space floor, a
// galactic band with star specks for high-mip specular glints, one warm sun lobe agreeing with
// the sector key light, a broad cool planet-bounce lobe low on the opposite side, and subtle
// nebula structure so rough metal resolves broad gradients instead of flat plastic.
//
// The output is a plain uncompressed Radiance .hdr (float RGBE). The shipped runtime artifact
// (.f32.bin + manifest) is produced from it by scripts/bake-foundry-ibl.mjs — the same bake
// chain the foundry source used, so the loader's verify-then-fallback contract is unchanged.
//
// Deterministic: fixed seed, no Math.random, no clock, no GPU. Byte-identical across runs.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_DIR = resolve(REPO, 'assets/background/env');
const HDR_PATH = resolve(ENV_DIR, 'deep_space_2k.hdr');
const CHECK = process.argv.includes('--check');

const WIDTH = 2048;
const HEIGHT = 1024;
const SEED = 0x5face11d;

// Deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(x) { return x * x * (3 - 2 * x); }

function ldexp(x, e) { return x * Math.pow(2, e); }

// Tileable-in-longitude value noise at `cells` lattice resolution; latitude is clamped so the
// poles stay smooth (equirect pole rows sample the same lattice cell across the row).
function valueNoise(u, v, cells) {
  const x = u * cells;
  const y = v * cells * 0.5;
  const i0 = Math.floor(x), j0 = Math.floor(y);
  const fx = smooth(x - i0), fy = smooth(y - j0);
  const at = (i, j) => {
    const ii = ((i % cells) + cells) % cells;
    const jj = Math.min(Math.max(j, 0), Math.ceil(cells * 0.5));
    // Hash of the lattice cell — deterministic from SEED.
    let h = (SEED ^ (ii * 374761393) ^ (jj * 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const a = at(i0, j0), b = at(i0 + 1, j0), c = at(i0, j0 + 1), d = at(i0 + 1, j0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// Angular distance in radians between direction and a lobe center (both unit vectors).
function angleBetween(ax, ay, az, bx, by, bz) {
  const d = ax * bx + ay * by + az * bz;
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

function latLonToDir(u, v) {
  // u in [0,1) azimuth, v in [0,1] latitude (0 = top pole).
  const phi = (u) * Math.PI * 2;
  const theta = v * Math.PI;
  const st = Math.sin(theta);
  return [st * Math.cos(phi), Math.cos(theta), st * Math.sin(phi)];
}

function dirFromAzEl(azDeg, elDeg) {
  const az = azDeg * Math.PI / 180;
  const el = elDeg * Math.PI / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

function generate() {
  const rand = rng(SEED);
  const px = new Float32Array(WIDTH * HEIGHT * 3);

  // Lobe layout (degrees). The runtime normalizes MEAN radiance to the shipped IBL band, so
  // brightness must stay concentrated in compact features over a genuinely dark sky — broad
  // milky lobes would normalize the whole sphere into fog. The sun agrees in spirit with the
  // sector key rig: warm, high, off to one side. Planet bounce sits low on the opposite side.
  const SUN = { dir: dirFromAzEl(58, 51), coreRadiance: 42.0, coreSigma: 3.2, haloRadiance: 2.4, haloSigma: 9, color: [1.0, 0.891, 0.761] };
  const PLANET = { dir: dirFromAzEl(210, -24), radiance: 0.6, sigma: 19, color: [0.624, 0.698, 0.784] };
  // The rim field is the env-side partner of the Look's edge light (docs/visual-assets/LOOK.md):
  // a saturated electric-cyan lobe opposite the sun, bright enough that a lacquered limb
  // mirrors a coloured edge rather than a grey one.
  const RIM = { dir: dirFromAzEl(-140, 12), radiance: 0.85, sigma: 20, color: [0.22, 0.66, 1.0] };

  // Galactic band: elevation follows a gentle wave across longitude so reflections show a
  // sweeping diagonal structure rather than a laser line. Phase keeps the band's crest away
  // from the sun lobe so the two hot features stay distinct in specular reflections.
  // The band doubles as the strip light of a show-car studio: a long, fairly bright line that
  // curved lacquer stretches into a streak. It runs warm on the sun's side of the sky and cool
  // on the far side, so one hull carries both hues of the frame in its reflections.
  const BAND_CENTER_DEG = 12, BAND_WAVE_DEG = 15, BAND_PHASE_RAD = 0.35, BAND_SIGMA_DEG = 4.5;
  const BAND_RADIANCE = 1.25;
  const BAND_WARM = [1.0, 0.84, 0.66];
  const BAND_COOL = [0.46, 0.74, 1.0];
  const SUN_AZ_RAD = 58 * Math.PI / 180;

  // Star specks: a fixed family of deterministic point stars, denser near the band. Each star
  // is a 1-2 px gaussian dot; PMREM blurs them away at high mips but low-mip specular keeps
  // the glints (the same role bright windows played in the foundry capture).
  const STARS = [];
  const starCount = 900;
  for (let i = 0; i < starCount; i++) {
    const u = rand();
    const az = u * 360;
    const bandElev = BAND_CENTER_DEG + BAND_WAVE_DEG * Math.sin(az * Math.PI / 180 + BAND_PHASE_RAD);
    const spread = (rand() + rand() + rand() - 1.5) * 34;
    const el = bandElev + spread;
    if (el < -78 || el > 82) continue;
    const warm = rand();
    const tint = warm < 0.62
      ? [1.0, 0.92 + rand() * 0.06, 0.8 + rand() * 0.12]
      : [0.78 + rand() * 0.14, 0.86 + rand() * 0.1, 1.0];
    STARS.push({
      dir: dirFromAzEl(az, el),
      radiance: (0.7 + Math.pow(rand(), 3.2) * 9.0),
      sigmaDeg: 0.055 + rand() * 0.05,
      color: tint,
    });
  }

  for (let y = 0; y < HEIGHT; y++) {
    const v = (y + 0.5) / HEIGHT;
    for (let x = 0; x < WIDTH; x++) {
      const u = (x + 0.5) / WIDTH;
      const [dx, dy, dz] = latLonToDir(u, v);
      const azDeg = Math.atan2(dz, dx) * 180 / Math.PI;

      // Deep-space floor: never pure black — a hair of cool light so the dark hemisphere of a
      // hull keeps a shade of separation instead of crushing into the backdrop.
      let r = 0.0045, g = 0.0052, b = 0.0072;

      // Nebula structure: two octaves of very low-amplitude blue/warm variation. Hue stays
      // between blue-grey and warm so the green-cast neutralizer downstream is untouched.
      const n1 = valueNoise(u, v, 6);
      const n2 = valueNoise(u, v, 13);
      const neb = (n1 * 0.68 + n2 * 0.32 - 0.5) * 0.016;
      const nebWarm = Math.max(0, neb) * 0.9 + Math.max(0, -neb) * 0.25;
      r += neb * 0.55 + nebWarm * 0.1; g += neb * 0.45; b += Math.max(0, neb) * 0.7 + Math.max(0, -neb) * 0.62;

      // Galactic band.
      const bandCenter = BAND_CENTER_DEG + BAND_WAVE_DEG * Math.sin(azDeg * Math.PI / 180 + BAND_PHASE_RAD);
      const elDeg = 90 - Math.acos(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI;
      const bandD = (elDeg - bandCenter) / BAND_SIGMA_DEG;
      const band = Math.exp(-bandD * bandD * 0.5);
      // Fine structure along the band: dark rift + clumps.
      const rift = 0.72 + 0.28 * valueNoise(u * 1.7, v * 5.0, 9);
      const clumps = 0.55 + 0.9 * valueNoise(u, v, 4);
      const bandR = band * rift * clumps * BAND_RADIANCE;
      const sunSide = 0.5 + 0.5 * Math.cos(azDeg * Math.PI / 180 - SUN_AZ_RAD);
      r += bandR * (BAND_COOL[0] + (BAND_WARM[0] - BAND_COOL[0]) * sunSide);
      g += bandR * (BAND_COOL[1] + (BAND_WARM[1] - BAND_COOL[1]) * sunSide);
      b += bandR * (BAND_COOL[2] + (BAND_WARM[2] - BAND_COOL[2]) * sunSide);

      // Sun: compact core + broad halo, warm.
      const dSun = angleBetween(dx, dy, dz, SUN.dir[0], SUN.dir[1], SUN.dir[2]);
      const sunDeg = dSun * 180 / Math.PI;
      const core = Math.exp(-(sunDeg * sunDeg) / (2 * SUN.coreSigma * SUN.coreSigma)) * SUN.coreRadiance;
      const halo = Math.exp(-(sunDeg * sunDeg) / (2 * SUN.haloSigma * SUN.haloSigma)) * SUN.haloRadiance;
      const sun = core + halo;
      r += sun * SUN.color[0]; g += sun * SUN.color[1]; b += sun * SUN.color[2];

      // Planet bounce: one broad cool lobe.
      const dPl = angleBetween(dx, dy, dz, PLANET.dir[0], PLANET.dir[1], PLANET.dir[2]);
      const plDeg = dPl * 180 / Math.PI;
      const pl = Math.exp(-(plDeg * plDeg) / (2 * PLANET.sigma * PLANET.sigma)) * PLANET.radiance;
      r += pl * PLANET.color[0]; g += pl * PLANET.color[1]; b += pl * PLANET.color[2];

      // Cool rim field: fills the hemisphere opposite the sun so unlit silhouettes keep a
      // readable cool edge (the env-side partner of the sector rim light).
      const dRim = angleBetween(dx, dy, dz, RIM.dir[0], RIM.dir[1], RIM.dir[2]);
      const rimDeg = dRim * 180 / Math.PI;
      const rim = Math.exp(-(rimDeg * rimDeg) / (2 * RIM.sigma * RIM.sigma)) * RIM.radiance;
      r += rim * RIM.color[0]; g += rim * RIM.color[1]; b += rim * RIM.color[2];

      const idx = (y * WIDTH + x) * 3;
      px[idx] = r; px[idx + 1] = g; px[idx + 2] = b;
    }

    // Stars are rasterized per-row after the base texel (cheap, and keeps the loop hot path
    // free of 900 point-in-circle tests per pixel).
  }

  // Rasterize stars: for each star, touch only the pixels inside its footprint.
  for (const star of STARS) {
    // Equirect cell for the star direction.
    const az = Math.atan2(star.dir[2], star.dir[0]);
    const el = Math.asin(Math.max(-1, Math.min(1, star.dir[1])));
    const u = ((az / (Math.PI * 2)) + 1) % 1;
    const vStar = (el + Math.PI / 2) / Math.PI;
    const cx = u * WIDTH, cy = vStar * HEIGHT;
    const texelDeg = 360 / WIDTH;
    const radPx = (star.sigmaDeg * 3) / texelDeg;
    const x0 = Math.max(0, Math.floor(cx - radPx)), x1 = Math.min(WIDTH - 1, Math.ceil(cx + radPx));
    const y0 = Math.max(0, Math.floor(cy - radPx)), y1 = Math.min(HEIGHT - 1, Math.ceil(cy + radPx));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ddx = (x - cx), ddy = (y - cy);
        // Angular distance in pixels ≈ euclidean here (footprints are tiny).
        const s = star.sigmaDeg / texelDeg;
        const wgt = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * s * s));
        if (wgt < 1 / 255) continue;
        // Wrap longitude so a star straddling the u seam is whole on both edges.
        const xr = ((x % WIDTH) + WIDTH) % WIDTH;
        const idx = (y * WIDTH + xr) * 3;
        px[idx] += star.radiance * wgt * star.color[0];
        px[idx + 1] += star.radiance * wgt * star.color[1];
        px[idx + 2] += star.radiance * wgt * star.color[2];
      }
    }
  }

  return px;
}

// Radiance .hdr writer: uncompressed RGBE per the Radiance file format (flat encoding is
// spec-legal; three's HDRLoader reads it — the foundry decode path exercises the same parser).
function writeHdrBuffer(px) {
  let meanSum = 0;
  const header = [
    '#?RADIANCE\n', '# SpaceFace authored deep-space IBL (scripts/generate-space-ibl.mjs)\n',
    'FORMAT=32-bit_rle_rgbe\n', '\n', `-Y ${HEIGHT} +X ${WIDTH}\n`,
  ].join('');
  const body = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let i = 0, o = 0; i < px.length; i += 3, o += 4) {
    const r = Math.max(0, px[i]), g = Math.max(0, px[i + 1]), b = Math.max(0, px[i + 2]);
    meanSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let max = r; if (g > max) max = g; if (b > max) max = b;
    if (max < 1e-9) { body[o] = 0; body[o + 1] = 0; body[o + 2] = 0; body[o + 3] = 0; continue; }
    // Frexp: max = f * 2^e with f in [0.5, 1).
    let e = Math.ceil(Math.log2(max));
    const f = ldexp(max, -e);
    if (f >= 1) { e += 1; }
    const mant = ldexp(max, 8 - e);
    body[o] = Math.min(255, Math.round((r / max) * mant));
    body[o + 1] = Math.min(255, Math.round((g / max) * mant));
    body[o + 2] = Math.min(255, Math.round((b / max) * mant));
    body[o + 3] = Math.min(255, e + 128);
  }
  return Buffer.concat([Buffer.from(header, 'latin1'), body]);
}

function main() {
  const px = generate();
  const buf = writeHdrBuffer(px);
  const sha = createHash('sha256').update(buf).digest('hex');
  if (CHECK) {
    if (!existsSync(HDR_PATH)) { console.error(`[generate-space-ibl] FAIL missing ${HDR_PATH}`); process.exit(1); }
    const shipped = readFileSync(HDR_PATH);
    if (!shipped.equals(buf)) {
      console.error(`[generate-space-ibl] FAIL shipped bytes differ from deterministic recompute (${sha})`);
      process.exit(1);
    }
    console.log(`[generate-space-ibl] ok — ${WIDTH}x${HEIGHT} hdr sha256 ${sha} matches artifact`);
    return;
  }
  writeFileSync(HDR_PATH, buf);
  console.log(`[generate-space-ibl] wrote ${HDR_PATH}`);
  console.log(`  ${WIDTH}x${HEIGHT} ${buf.length} B sha256 ${sha}`);
  console.log('  next: node scripts/bake-foundry-ibl.mjs --source=deep_space_2k');
}

main();
