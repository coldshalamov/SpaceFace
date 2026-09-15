#!/usr/bin/env node
// PQ-033.03 — Steam store page assets at Steam's exact sizes, plus a local "store page in test"
// preview, built from the game's own pictures.
//
// Sources (all in the repository):
//   assets/cinematics/menu_hangar_bg.jpg        the authored hangar key art (3840x2160): capsules, hero
//   assets/ui/kit/marks/logotype/*.svg          the SpaceFace logotype (stacked mark on capsules + logo)
//   assets/ui/kit/icons/48/*.svg                the kit glyph each achievement names (its Steam icons)
//   assets/store/page/screenshots.json          real gameplay stills in upload order, with provenance
//   src/localization/storeCopy.js               the reviewed store copy in five languages
//
// Output (generated and gitignored, like build/web):
//   build/store/steam/*.png                     every Steam capsule, library and screenshot slot
//   build/store/steam/achievements/*.jpg        each achievement's achieved and unachieved icon (64x64)
//   build/store/steam/manifest.json             size, source and sha256 per file
//   build/store/preview.html                    a Steam-like page to review the store locally
//
// Usage:
//   node scripts/build-store-assets.mjs            render everything
//   node scripts/build-store-assets.mjs --check    validate what is on disk; renders nothing
//   --out <dir>                                    another output root (tests)
//
// Rasterizer: sharp (libvips + librsvg), present through @gltf-transform's dependency tree rather than
// as a direct dependency, so it loads lazily and a missing module is named plainly. --check needs
// only pngjs, a direct devDependency. Screenshots are never upscaled or stretched: a still smaller than
// 1920x1080 is refused, a larger 16:9 one is scaled down.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { STORE_COPY } from '../src/localization/storeCopy.js';
import { achievementIconFiles } from './export-steam-achievements.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export const DEFAULT_OUT_REL = 'build/store';
export const STEAM_DIR = 'steam';
export const KEY_ART_REL = 'assets/cinematics/menu_hangar_bg.jpg';
export const LOGO_REL = Object.freeze({
  stacked: 'assets/ui/kit/marks/logotype/spaceface-logotype-stacked.svg',
  wide: 'assets/ui/kit/marks/logotype/spaceface-logotype.svg',
});
export const SCREENSHOT_MANIFEST_REL = 'assets/store/page/screenshots.json';
export const STEAM_SCREENSHOT_SIZE = Object.freeze({ width: 1920, height: 1080 });
export const STEAM_MIN_SCREENSHOTS = 5;
export const ACHIEVEMENT_ICON_DIR = 'achievements';
/** Steam shows achievement icons at 64x64 and needs an achieved and an unachieved one for each. */
export const STEAM_ACHIEVEMENT_ICON_SIZE = 64;
export const KIT_GLYPH_DIR_REL = 'assets/ui/kit/icons/48';
const LOGO_COLOR = '#F2EDE3';
const INK = '5,7,13';

/** Steam's graphical asset slots (partner.steamgames.com store + library asset docs). */
export const STEAM_STORE_ASSETS = Object.freeze([
  { id: 'header_capsule', file: 'header_capsule.png', width: 920, height: 430, slot: 'Store: header capsule' },
  { id: 'small_capsule', file: 'small_capsule.png', width: 462, height: 174, slot: 'Store: small capsule' },
  { id: 'main_capsule', file: 'main_capsule.png', width: 1232, height: 706, slot: 'Store: main capsule' },
  { id: 'vertical_capsule', file: 'vertical_capsule.png', width: 748, height: 896, slot: 'Store: vertical capsule' },
  { id: 'page_background', file: 'page_background.png', width: 1438, height: 810, slot: 'Store: page background' },
  { id: 'library_capsule', file: 'library_capsule.png', width: 600, height: 900, slot: 'Library: capsule' },
  { id: 'library_header', file: 'library_header.png', width: 920, height: 430, slot: 'Library: header' },
  { id: 'library_hero', file: 'library_hero.png', width: 3840, height: 1240, slot: 'Library: hero (no text)' },
  { id: 'library_logo', file: 'library_logo.png', width: 1280, height: 720, slot: 'Library: logo (transparent)', transparent: true },
].map((asset) => Object.freeze(asset)));

export function screenshotFile(index) {
  return `screenshot_${String(index + 1).padStart(2, '0')}.png`;
}

/**
 * Hand-set crops of the hangar key art (source pixels). The hull sits at roughly x 1420-3245,
 * y 730-1730; the dark wall above and left of it carries the logo. The hero keeps the hull inside
 * Steam's centred 860x380 safe area and carries no text.
 */
export const COMPOSITIONS = Object.freeze({
  header_capsule: { crop: { left: 640, top: 520, width: 2900, height: 1355 }, scrim: 'top-left', logo: { width: 360, left: 38, top: 34 } },
  library_header: { crop: { left: 640, top: 520, width: 2900, height: 1355 }, scrim: 'top-left', logo: { width: 360, left: 38, top: 34 } },
  small_capsule: { crop: { left: 370, top: 646, width: 3100, height: 1168 }, brightness: 0.55, scrim: 'even', logo: { height: 132, align: 'center' } },
  main_capsule: { crop: { left: 560, top: 380, width: 3000, height: 1719 }, scrim: 'top-left', logo: { width: 420, left: 44, top: 40 } },
  vertical_capsule: { crop: { left: 1428, top: 0, width: 1803, height: 2160 }, scrim: 'top', logo: { width: 560, align: 'top-center', top: 70 } },
  library_capsule: { crop: { left: 1610, top: 0, width: 1440, height: 2160 }, scrim: 'top', logo: { width: 460, align: 'top-center', top: 72 } },
  page_background: { crop: { left: 3, top: 0, width: 3834, height: 2160 }, brightness: 0.4, blur: 3 },
  library_hero: { crop: { left: 0, top: 600, width: 3840, height: 1240 } },
  // The rendered logo carries a shadow margin on every side, so 1100 px of logotype fills the
  // 1280x720 canvas edge to edge without clipping.
  library_logo: { transparent: true, logo: { width: 1100, align: 'center' } },
});

/* ---------------------------------------------------------------------------------------------- */
/* PNG and JPEG inspection for --check (no rasterizer needed)                                      */
/* ---------------------------------------------------------------------------------------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngHeader(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}

/** Width and height from a JPEG's start-of-frame segment, or null when the file is not a JPEG. */
export function readJpegSize(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // SOF0-SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}

function transparencyVerdict(file) {
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(readFileSync(file));
  const alphaAt = (x, y) => png.data[(png.width * y + x) * 4 + 3];
  const corners = [alphaAt(0, 0), alphaAt(png.width - 1, 0), alphaAt(0, png.height - 1), alphaAt(png.width - 1, png.height - 1)];
  let opaque = 0;
  for (let i = 3; i < png.data.length; i += 4 * 97) if (png.data[i] > 200) opaque += 1;
  return { cornersClear: corners.every((a) => a === 0), hasInk: opaque > 0 };
}

export function checkStoreAssets({ outRoot = path.join(ROOT, DEFAULT_OUT_REL) } = {}) {
  const failures = [];
  const steamDir = path.join(outRoot, STEAM_DIR);
  const expected = [];
  for (const asset of STEAM_STORE_ASSETS) {
    const file = path.join(steamDir, asset.file);
    expected.push(asset.file);
    if (!existsSync(file)) {
      failures.push(`${asset.id}: missing ${path.join(STEAM_DIR, asset.file)}`);
      continue;
    }
    const header = readPngHeader(file);
    if (!header) {
      failures.push(`${asset.id}: not a PNG`);
      continue;
    }
    if (header.width !== asset.width || header.height !== asset.height) {
      failures.push(`${asset.id}: ${header.width}x${header.height}, Steam needs ${asset.width}x${asset.height}`);
    }
    if (asset.transparent) {
      if (header.colorType !== 6 && header.colorType !== 4) {
        failures.push(`${asset.id}: needs an alpha channel (PNG colour type ${header.colorType})`);
      } else {
        const verdict = transparencyVerdict(file);
        if (!verdict.cornersClear) failures.push(`${asset.id}: background is not transparent`);
        if (!verdict.hasInk) failures.push(`${asset.id}: the logo is empty`);
      }
    }
  }
  let screenshots = 0;
  for (let i = 0; i < 64; i += 1) {
    const name = screenshotFile(i);
    const file = path.join(steamDir, name);
    if (!existsSync(file)) break;
    const header = readPngHeader(file);
    if (!header || header.width !== STEAM_SCREENSHOT_SIZE.width || header.height !== STEAM_SCREENSHOT_SIZE.height) {
      failures.push(`${name}: ${header ? `${header.width}x${header.height}` : 'not a PNG'}, Steam needs 1920x1080`);
    }
    expected.push(name);
    screenshots += 1;
  }
  if (screenshots < STEAM_MIN_SCREENSHOTS) failures.push(`screenshots: ${screenshots}, Steam needs at least ${STEAM_MIN_SCREENSHOTS}`);
  let icons = 0;
  for (const def of ACHIEVEMENTS) {
    const files = achievementIconFiles(def);
    const bytes = {};
    for (const [state, name] of [['achieved', files.achieved], ['unachieved', files.unachieved]]) {
      const rel = `${ACHIEVEMENT_ICON_DIR}/${name}`;
      const file = path.join(steamDir, ACHIEVEMENT_ICON_DIR, name);
      expected.push(rel);
      if (!existsSync(file)) {
        failures.push(`${def.steamApiName} ${state} icon: missing ${STEAM_DIR}/${rel}`);
        continue;
      }
      icons += 1;
      const size = readJpegSize(file);
      if (!size) {
        failures.push(`${def.steamApiName} ${state} icon: not a JPEG`);
        continue;
      }
      if (size.width !== STEAM_ACHIEVEMENT_ICON_SIZE || size.height !== STEAM_ACHIEVEMENT_ICON_SIZE) {
        failures.push(`${def.steamApiName} ${state} icon: ${size.width}x${size.height}, Steam needs ${STEAM_ACHIEVEMENT_ICON_SIZE}x${STEAM_ACHIEVEMENT_ICON_SIZE}`);
      }
      bytes[state] = readFileSync(file);
    }
    if (bytes.achieved && bytes.unachieved && bytes.achieved.equals(bytes.unachieved)) {
      failures.push(`${def.steamApiName} icons: the achieved and unachieved icons are the same image`);
    }
  }
  const manifestFile = path.join(steamDir, 'manifest.json');
  if (!existsSync(manifestFile)) failures.push('manifest.json: missing');
  const previewFile = path.join(outRoot, 'preview.html');
  if (!existsSync(previewFile)) {
    failures.push('preview.html: missing');
  } else {
    const html = readFileSync(previewFile, 'utf8');
    for (const name of expected) if (!html.includes(`${STEAM_DIR}/${name}`)) failures.push(`preview.html: does not show ${name}`);
  }
  return { ok: failures.length === 0, failures, screenshots, assets: STEAM_STORE_ASSETS.length, icons };
}

/* ---------------------------------------------------------------------------------------------- */
/* rendering (sharp)                                                                               */
/* ---------------------------------------------------------------------------------------------- */

function loadSharp() {
  try {
    return require('sharp');
  } catch (error) {
    throw new Error(`sharp is not installed (it arrives through @gltf-transform/cli). Run npm install. (${error.message})`);
  }
}

function logoSvg(variant, color, width, height, opacity = 1) {
  const source = readFileSync(path.join(ROOT, LOGO_REL[variant]), 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(source)[1];
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(source)[1]
    .replace(/fill="currentColor"/g, `fill="${color}" fill-opacity="${opacity}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${inner}</svg>`;
}

function logoAspect(variant) {
  const source = readFileSync(path.join(ROOT, LOGO_REL[variant]), 'utf8');
  const [, , w, h] = /viewBox="([^"]+)"/.exec(source)[1].split(/[\s,]+/).map(Number);
  return w / h;
}

/** The logotype in bone with a soft ink shadow beneath it, as a transparent PNG buffer. */
async function renderLogo(sharp, { width, height, variant = 'stacked' }) {
  const aspect = logoAspect(variant);
  const w = Math.round(width || height * aspect);
  const h = Math.round(height || width / aspect);
  const pad = Math.max(4, Math.round(h * 0.16));
  const drop = Math.max(1, Math.round(h * 0.03));
  const fg = await sharp(Buffer.from(logoSvg(variant, LOGO_COLOR, w, h))).png().toBuffer();
  const shadow = await sharp(Buffer.from(logoSvg(variant, `rgb(${INK})`, w, h, 0.85)))
    .extend({ top: pad + drop, bottom: pad - drop, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(1.2, h * 0.045))
    .png()
    .toBuffer();
  const buffer = await sharp({ create: { width: w + pad * 2, height: h + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: 0, top: 0 }, { input: fg, left: pad, top: pad }])
    .png()
    .toBuffer();
  return { buffer, width: w + pad * 2, height: h + pad * 2, pad };
}

function scrimSvg(width, height, kind) {
  const stops = {
    'top-left': ['0', '0', '0.8', '0.95', [[0, 0.8], [0.34, 0.5], [0.62, 0]]],
    top: ['0', '0', '0', '1', [[0, 0.82], [0.26, 0.5], [0.5, 0]]],
  }[kind];
  if (kind === 'even') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="rgb(${INK})" fill-opacity="0.34"/></svg>`;
  }
  const [x1, y1, x2, y2, list] = stops;
  const stopTags = list.map(([offset, alpha]) => `<stop offset="${offset}" stop-color="rgb(${INK})" stop-opacity="${alpha}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopTags}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

function placeLogo(logo, asset, spec) {
  if (spec.align === 'center') {
    return { left: Math.round((asset.width - logo.width) / 2), top: Math.round((asset.height - logo.height) / 2) };
  }
  if (spec.align === 'top-center') {
    return { left: Math.round((asset.width - logo.width) / 2), top: Math.max(0, (spec.top || 0) - logo.pad) };
  }
  return { left: Math.max(0, (spec.left || 0) - logo.pad), top: Math.max(0, (spec.top || 0) - logo.pad) };
}

async function renderAsset(sharp, asset, keyArt) {
  const spec = COMPOSITIONS[asset.id];
  if (!spec) throw new Error(`no composition for ${asset.id}`);
  let image;
  if (spec.transparent) {
    image = sharp({ create: { width: asset.width, height: asset.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  } else {
    const crop = spec.crop;
    if (crop.left + crop.width > keyArt.width || crop.top + crop.height > keyArt.height) {
      throw new Error(`${asset.id}: crop leaves the ${keyArt.width}x${keyArt.height} key art`);
    }
    image = sharp(keyArt.file).extract(crop).resize(asset.width, asset.height, { fit: 'cover', position: 'centre' });
    if (spec.brightness) image = image.modulate({ brightness: spec.brightness });
    if (spec.blur) image = image.blur(spec.blur);
    // Flatten the resize/modulate/blur chain first so the overlays land on the finished frame.
    image = sharp(await image.png().toBuffer());
  }
  const overlays = [];
  if (spec.scrim) overlays.push({ input: Buffer.from(scrimSvg(asset.width, asset.height, spec.scrim)), left: 0, top: 0 });
  if (spec.logo) {
    const logo = await renderLogo(sharp, spec.logo);
    const at = placeLogo(logo, asset, spec.logo);
    if (at.left + logo.width > asset.width || at.top + logo.height > asset.height) {
      throw new Error(`${asset.id}: the ${logo.width}x${logo.height} logo does not fit the ${asset.width}x${asset.height} slot at ${at.left},${at.top}`);
    }
    overlays.push({ input: logo.buffer, ...at });
  }
  if (overlays.length) image = image.composite(overlays);
  return image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

/**
 * Achievement icons: the definition's kit glyph on a chamfered Field Hardware plate, drawn at 256 px
 * and reduced to Steam's 64. Achieved is lit (signal-amber glyph with a soft legend glow, bronze rim,
 * amber top edge); unachieved is the same plate unlit with a dim bone glyph, because Steam shows the
 * unachieved icon exactly as uploaded and never greys it out itself. Plate tones sit between the kit's
 * plate-raised and plate-sunk tokens.
 */
const ICON_MASTER = 256;
const ICON_GLYPH = 150;
const ICON_STYLE = Object.freeze({
  ground: '#0C0A08',
  achieved: Object.freeze({ plateTop: '#2B241D', plateBottom: '#15120F', rim: '#6B4F28', edge: '#F2B950', edgeOpacity: 0.55, glyph: '#F2B950', glyphOpacity: 1, glow: '#FFB347', glowOpacity: 0.55 }),
  unachieved: Object.freeze({ plateTop: '#171411', plateBottom: '#0E0C0A', rim: '#2C2621', edge: '#4A423A', edgeOpacity: 0.35, glyph: '#EAE6DF', glyphOpacity: 0.26, glow: null, glowOpacity: 0 }),
});

function iconPlateSvg(tone) {
  const inset = 14;
  const cut = 44;
  const x0 = inset;
  const y0 = inset;
  const x1 = ICON_MASTER - inset;
  const y1 = ICON_MASTER - inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_MASTER}" height="${ICON_MASTER}"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone.plateTop}"/><stop offset="1" stop-color="${tone.plateBottom}"/></linearGradient></defs><rect width="${ICON_MASTER}" height="${ICON_MASTER}" fill="${ICON_STYLE.ground}"/><path d="M${x0},${y0} H${x1 - cut} L${x1},${y0 + cut} V${y1} H${x0} Z" fill="url(#p)" stroke="${tone.rim}" stroke-width="6"/><path d="M${x0 + 10},${y0 + 9} H${x1 - cut - 4}" stroke="${tone.edge}" stroke-opacity="${tone.edgeOpacity}" stroke-width="4"/></svg>`;
}

function iconGlyphSvg(icon, color, opacity) {
  const file = path.join(ROOT, KIT_GLYPH_DIR_REL, `${icon}.svg`);
  if (!existsSync(file)) throw new Error(`achievement glyph ${icon} is not in ${KIT_GLYPH_DIR_REL}`);
  const match = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(readFileSync(file, 'utf8'));
  if (!match) throw new Error(`${KIT_GLYPH_DIR_REL}/${icon}.svg is not an SVG`);
  const offset = (ICON_MASTER - ICON_GLYPH) / 2;
  // The kit glyphs sit on a 48-unit grid; the plate's top edge weighs the frame, so drop the glyph 4 px.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_MASTER}" height="${ICON_MASTER}"><g opacity="${opacity}" transform="translate(${offset},${offset + 4}) scale(${ICON_GLYPH / 48})">${match[1].replace(/currentColor/g, color)}</g></svg>`;
}

async function renderAchievementIcon(sharp, def, state) {
  const tone = ICON_STYLE[state];
  const layers = [];
  if (tone.glow) {
    const glow = await sharp(Buffer.from(iconGlyphSvg(def.icon, tone.glow, tone.glowOpacity))).blur(9).png().toBuffer();
    layers.push({ input: glow, left: 0, top: 0 });
  }
  const glyph = await sharp(Buffer.from(iconGlyphSvg(def.icon, tone.glyph, tone.glyphOpacity))).png().toBuffer();
  layers.push({ input: glyph, left: 0, top: 0 });
  const master = await sharp(Buffer.from(iconPlateSvg(tone))).composite(layers).png().toBuffer();
  return sharp(master)
    .resize(STEAM_ACHIEVEMENT_ICON_SIZE, STEAM_ACHIEVEMENT_ICON_SIZE, { kernel: 'lanczos3' })
    .flatten({ background: ICON_STYLE.ground })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readScreenshotManifest() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, SCREENSHOT_MANIFEST_REL), 'utf8'));
  if (!manifest || manifest.schema !== 'spaceface.storeScreenshots.v1' || !Array.isArray(manifest.screenshots)) {
    throw new Error(`${SCREENSHOT_MANIFEST_REL} is not a spaceface.storeScreenshots.v1 manifest`);
  }
  return manifest.screenshots;
}

export async function buildStoreAssets({ outRoot = path.join(ROOT, DEFAULT_OUT_REL) } = {}) {
  const sharp = loadSharp();
  const steamDir = path.join(outRoot, STEAM_DIR);
  mkdirSync(steamDir, { recursive: true });
  const keyArtFile = path.join(ROOT, KEY_ART_REL);
  const keyArtMeta = await sharp(keyArtFile).metadata();
  const keyArt = { file: keyArtFile, width: keyArtMeta.width, height: keyArtMeta.height };
  const rows = [];

  for (const asset of STEAM_STORE_ASSETS) {
    const buffer = await renderAsset(sharp, asset, keyArt);
    writeFileSync(path.join(steamDir, asset.file), buffer);
    rows.push({
      file: `${STEAM_DIR}/${asset.file}`, slot: asset.slot, width: asset.width, height: asset.height,
      source: asset.transparent ? LOGO_REL.stacked : KEY_ART_REL, sha256: sha256(buffer),
    });
  }

  const screenshots = readScreenshotManifest();
  const shotRows = [];
  for (const [index, shot] of screenshots.entries()) {
    const sourceFile = path.join(ROOT, 'assets', 'store', 'page', shot.file);
    const meta = await sharp(sourceFile).metadata();
    if (meta.width < STEAM_SCREENSHOT_SIZE.width || meta.height < STEAM_SCREENSHOT_SIZE.height) {
      throw new Error(`${shot.file} is ${meta.width}x${meta.height}; store screenshots are never upscaled`);
    }
    if (Math.abs(meta.width / meta.height - 16 / 9) > 0.01) {
      throw new Error(`${shot.file} is not 16:9; store screenshots are never cropped or stretched`);
    }
    const buffer = await sharp(sourceFile)
      .resize(STEAM_SCREENSHOT_SIZE.width, STEAM_SCREENSHOT_SIZE.height, { fit: 'fill', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const name = screenshotFile(index);
    writeFileSync(path.join(steamDir, name), buffer);
    shotRows.push({
      file: `${STEAM_DIR}/${name}`, slot: `Screenshot ${index + 1}`, width: STEAM_SCREENSHOT_SIZE.width, height: STEAM_SCREENSHOT_SIZE.height,
      source: `assets/store/page/${shot.file}`, caption: shot.caption, hud: shot.hud === true, sha256: sha256(buffer),
    });
  }

  // Rebuilt from scratch so an icon of a renamed achievement never lingers beside the current set.
  const iconDir = path.join(steamDir, ACHIEVEMENT_ICON_DIR);
  rmSync(iconDir, { recursive: true, force: true });
  mkdirSync(iconDir, { recursive: true });
  const iconRows = [];
  for (const def of ACHIEVEMENTS) {
    const files = achievementIconFiles(def);
    const row = {
      id: def.id, apiName: def.steamApiName, name: def.name, hidden: def.hidden,
      glyph: `${KIT_GLYPH_DIR_REL}/${def.icon}.svg`, width: STEAM_ACHIEVEMENT_ICON_SIZE, height: STEAM_ACHIEVEMENT_ICON_SIZE,
    };
    for (const state of ['achieved', 'unachieved']) {
      const buffer = await renderAchievementIcon(sharp, def, state);
      writeFileSync(path.join(iconDir, files[state]), buffer);
      row[state] = { file: `${STEAM_DIR}/${ACHIEVEMENT_ICON_DIR}/${files[state]}`, sha256: sha256(buffer) };
    }
    iconRows.push(row);
  }

  writeFileSync(path.join(steamDir, 'manifest.json'), `${JSON.stringify({
    schema: 'spaceface.steamStoreAssets.v1',
    keyArt: KEY_ART_REL,
    logotype: LOGO_REL.stacked,
    screenshotManifest: SCREENSHOT_MANIFEST_REL,
    assets: rows,
    screenshots: shotRows,
    achievementIcons: iconRows,
  }, null, 2)}\n`);
  writeFileSync(path.join(outRoot, 'preview.html'), renderPreviewHtml({ assets: rows, screenshots: shotRows, icons: iconRows }));
  return { assets: rows, screenshots: shotRows, icons: iconRows, outRoot };
}

/* ---------------------------------------------------------------------------------------------- */
/* local store page preview                                                                        */
/* ---------------------------------------------------------------------------------------------- */

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LANGUAGE_LABELS = Object.freeze({ 'en-US': 'English', 'es-ES': 'Español', 'fr-FR': 'Français', 'de-DE': 'Deutsch', 'pt-BR': 'Português (Brasil)' });

export function renderPreviewHtml({ assets, screenshots, icons = [] }) {
  const en = STORE_COPY['en-US'];
  const byId = Object.fromEntries(assets.map((row) => [row.file.replace(`${STEAM_DIR}/`, '').replace('.png', ''), row]));
  const iconById = Object.fromEntries(icons.map((row) => [row.id, row]));
  const iconChecklist = icons.flatMap((row) => ['achieved', 'unachieved'].map((state) => ({
    slot: `Achievement ${row.apiName}: ${state} icon`, file: row[state].file, width: row.width, height: row.height, source: row.glyph,
  })));
  const copyJson = JSON.stringify(STORE_COPY).replace(/</g, '\\u003c');
  const shotsJson = JSON.stringify(screenshots.map((s) => ({ file: s.file, caption: s.caption }))).replace(/</g, '\\u003c');
  const paragraphs = (text) => String(text).split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const features = ['physics', 'massline', 'world', 'careers'];
  const capsule = (id, extra = '') => {
    const row = byId[id];
    return `<figure class="asset ${extra}"><img src="${row.file}" alt="${escapeHtml(row.slot)}" width="${row.width}" height="${row.height}" loading="lazy"><figcaption>${escapeHtml(row.slot)} <span>${row.width} × ${row.height}</span></figcaption></figure>`;
  };
  const achievementRow = (def) => {
    const row = iconById[def.id];
    const text = `<b>${escapeHtml(def.name)}</b><small>${escapeHtml(def.description)}${def.hidden ? ' · hidden until earned' : ''}</small><br><code>${def.steamApiName}</code>`;
    if (!row) return `    <li>${text}</li>`;
    const art = ['achieved', 'unachieved'].map((state) => `<img src="${row[state].file}" alt="${escapeHtml(def.name)}, ${state} icon" width="${row.width}" height="${row.height}">`).join('');
    return `    <li class="has-icons">${art}<div>${text}</div></li>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SpaceFace — store page preview (local test)</title>
<style>
  :root { --bg: #1b2838; --panel: #16202d; --ink: #c7d5e0; --dim: #8f98a0; --link: #66c0f4; --line: #2a3f5a; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0e141b url('${byId.page_background.file}') center top / 1438px auto no-repeat; color: var(--ink); font: 14px/1.5 "Motiva Sans", Arial, Helvetica, sans-serif; }
  .banner { background: #3d2b12; color: #f0d9a8; text-align: center; padding: 8px 16px; font-size: 13px; }
  main { max-width: 1060px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 26px; font-weight: 400; color: #fff; margin: 12px 0 14px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #fff; font-weight: 400; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 34px 0 14px; }
  .top { display: grid; grid-template-columns: minmax(0, 1fr) 324px; gap: 16px; background: rgba(0,0,0,0.35); padding: 16px; }
  .viewer img { width: 100%; height: auto; display: block; aspect-ratio: 16 / 9; background: #000; }
  .viewer p { color: var(--dim); margin: 6px 0 10px; min-height: 1.5em; }
  .thumbs { display: flex; gap: 6px; overflow-x: auto; }
  .thumbs button { padding: 0; border: 2px solid transparent; background: none; cursor: pointer; flex: 0 0 116px; }
  .thumbs button[aria-current="true"] { border-color: #fff; }
  .thumbs button:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
  .thumbs img { width: 112px; height: 63px; object-fit: cover; display: block; }
  .side img { width: 100%; height: auto; display: block; }
  .side .short { margin: 12px 0; color: var(--ink); }
  .side dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; color: var(--dim); font-size: 12px; margin: 0; }
  .side dd { margin: 0; color: var(--link); }
  .lang { margin: 14px 0 0; display: flex; gap: 8px; align-items: center; color: var(--dim); font-size: 12px; }
  select { background: var(--panel); color: var(--ink); border: 1px solid var(--line); padding: 4px 6px; }
  .about { max-width: 640px; }
  .about p { margin: 0 0 12px; }
  .features { list-style: none; padding: 0; margin: 0; max-width: 640px; }
  .features li { padding: 8px 0 8px 18px; border-bottom: 1px solid var(--line); position: relative; }
  .features li::before { content: ""; position: absolute; left: 2px; top: 16px; width: 6px; height: 6px; background: var(--link); }
  .sentence { font-size: 18px; color: #fff; margin: 18px 0 0; }
  .gallery { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .asset { margin: 0; background: var(--panel); padding: 8px; }
  .asset img { display: block; height: auto; max-width: 100%; }
  .asset figcaption { color: var(--dim); font-size: 12px; margin-top: 6px; }
  .asset figcaption span { color: var(--ink); }
  .asset.header img, .asset.small img { width: 460px; }
  .asset.main img { width: 616px; }
  .asset.vertical img { width: 299px; }
  .asset.libcap img { width: 240px; }
  .asset.bg img { width: 575px; }
  .library { position: relative; margin: 0; background: #000; }
  .library img.hero { width: 100%; height: auto; display: block; }
  .library img.logo { position: absolute; left: 4%; bottom: 8%; width: 30%; height: auto; }
  .checker { background: repeating-conic-gradient(#2a3441 0% 25%, #1d2530 0% 50%) 0 0 / 24px 24px; }
  .achievements { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
  .achievements li { background: var(--panel); padding: 10px 12px; border-left: 3px solid var(--line); }
  .achievements li.has-icons { display: grid; grid-template-columns: 64px 64px minmax(0, 1fr); gap: 10px; align-items: center; }
  .achievements li img { display: block; width: 64px; height: 64px; }
  .achievements b { color: #fff; font-weight: 400; display: block; }
  .achievements small { color: var(--dim); }
  .achievements code { color: var(--link); font-size: 11px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { color: #fff; font-weight: 400; }
  td code { color: var(--link); }
  @media (max-width: 860px) { .top { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="banner">Local test preview of the Steam store page — generated by <code>npm run build:store-assets</code>. Not a live Steam page.</div>
<main>
  <h1 data-key="store.page.title">${escapeHtml(en['store.page.title'])}</h1>
  <section class="top" aria-label="Media and summary">
    <div class="viewer">
      <img id="shot" src="${screenshots[0] ? screenshots[0].file : ''}" alt="Gameplay screenshot" width="1920" height="1080">
      <p id="shot-caption">${escapeHtml(screenshots[0] ? screenshots[0].caption : '')}</p>
      <div class="thumbs" role="group" aria-label="Screenshots">
${screenshots.map((s, i) => `        <button type="button" data-index="${i}"${i === 0 ? ' aria-current="true"' : ''} aria-label="Screenshot ${i + 1}: ${escapeHtml(s.caption)}"><img src="${s.file}" alt=""></button>`).join('\n')}
      </div>
    </div>
    <aside class="side">
      <img src="${byId.header_capsule.file}" alt="SpaceFace header capsule" width="920" height="430">
      <p class="short" data-key="store.page.shortDescription">${escapeHtml(en['store.page.shortDescription'])}</p>
      <dl>
        <dt>Developer</dt><dd>SpaceFace</dd>
        <dt>Achievements</dt><dd>${ACHIEVEMENTS.length}</dd>
        <dt>Languages</dt><dd>${Object.keys(STORE_COPY).length}</dd>
      </dl>
      <label class="lang">Language
        <select id="lang">
${Object.keys(STORE_COPY).map((locale) => `          <option value="${locale}">${escapeHtml(LANGUAGE_LABELS[locale] || locale)}</option>`).join('\n')}
        </select>
      </label>
    </aside>
  </section>

  <h2>About this game</h2>
  <div class="about" data-key="store.page.about" data-paragraphs="1">${paragraphs(en['store.page.about'])}</div>
  <p class="sentence" data-key="store.page.sentence">${escapeHtml(en['store.page.sentence'])}</p>

  <h2>Features</h2>
  <ul class="features">
${features.map((f) => `    <li data-key="store.page.features.${f}">${escapeHtml(en[`store.page.features.${f}`])}</li>`).join('\n')}
  </ul>

  <h2>Achievements (${ACHIEVEMENTS.length})</h2>
  <ul class="achievements">
${ACHIEVEMENTS.map(achievementRow).join('\n')}
  </ul>

  <h2>Steam library (hero with logo)</h2>
  <figure class="library"><img class="hero" src="${byId.library_hero.file}" alt="Library hero" width="3840" height="1240"><img class="logo" src="${byId.library_logo.file}" alt="Library logo" width="1280" height="720"></figure>

  <h2>Capsules and library art</h2>
  <div class="gallery">
    ${capsule('header_capsule', 'header')}
    ${capsule('small_capsule', 'small')}
    ${capsule('main_capsule', 'main')}
    ${capsule('vertical_capsule', 'vertical')}
    ${capsule('library_capsule', 'libcap')}
    ${capsule('library_header', 'header')}
    ${capsule('page_background', 'bg')}
    <figure class="asset checker"><img src="${byId.library_logo.file}" alt="Library logo on a transparency checkerboard" width="640" height="360" style="width:640px"><figcaption>Library: logo (transparent) <span>1280 × 720</span></figcaption></figure>
  </div>

  <h2>Upload checklist</h2>
  <table>
    <thead><tr><th>Slot</th><th>File</th><th>Size</th><th>Source</th></tr></thead>
    <tbody>
${[...assets, ...screenshots, ...iconChecklist].map((row) => `      <tr><td>${escapeHtml(row.slot)}</td><td><code>${row.file}</code></td><td>${row.width} × ${row.height}</td><td>${escapeHtml(row.source)}</td></tr>`).join('\n')}
    </tbody>
  </table>
</main>
<script>
  const COPY = ${copyJson};
  const SHOTS = ${shotsJson};
  const shot = document.getElementById('shot');
  const caption = document.getElementById('shot-caption');
  const thumbs = Array.from(document.querySelectorAll('.thumbs button'));
  function showShot(index) {
    const entry = SHOTS[index];
    if (!entry) return;
    shot.src = entry.file;
    caption.textContent = entry.caption;
    thumbs.forEach((button, i) => { if (i === index) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
  }
  thumbs.forEach((button) => button.addEventListener('click', () => showShot(Number(button.dataset.index))));
  function applyLanguage(locale) {
    const table = COPY[locale] || COPY['en-US'];
    document.documentElement.lang = locale.slice(0, 2);
    for (const node of document.querySelectorAll('[data-key]')) {
      const text = table[node.dataset.key];
      if (typeof text !== 'string') continue;
      if (node.dataset.paragraphs) {
        node.replaceChildren(...text.split(/\\n\\s*\\n/).map((part) => { const p = document.createElement('p'); p.textContent = part; return p; }));
      } else {
        node.textContent = text;
      }
    }
  }
  const select = document.getElementById('lang');
  select.addEventListener('change', () => applyLanguage(select.value));
</script>
</body>
</html>
`;
}

/* ---------------------------------------------------------------------------------------------- */

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out');
  const outRoot = outIndex >= 0 && argv[outIndex + 1] ? path.resolve(argv[outIndex + 1]) : path.join(ROOT, DEFAULT_OUT_REL);
  return { check: argv.includes('--check'), outRoot };
}

async function main(argv) {
  const { check, outRoot } = parseArgs(argv);
  if (check) {
    const verdict = checkStoreAssets({ outRoot });
    if (!verdict.ok) {
      console.error(`[store-assets] FAIL ${verdict.failures.length} problem(s) in ${outRoot}:`);
      for (const failure of verdict.failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[store-assets] ok ${verdict.assets} capsule/library assets + ${verdict.screenshots} screenshots + ${verdict.icons} achievement icons at exact Steam sizes; logo transparent; preview.html shows all`);
    return;
  }
  const built = await buildStoreAssets({ outRoot });
  for (const row of [...built.assets, ...built.screenshots]) console.log(`[store-assets] ${row.width}x${row.height} ${row.file}`);
  console.log(`[store-assets] ${STEAM_ACHIEVEMENT_ICON_SIZE}x${STEAM_ACHIEVEMENT_ICON_SIZE} ${built.icons.length * 2} achievement icons (achieved + unachieved) under ${STEAM_DIR}/${ACHIEVEMENT_ICON_DIR}`);
  const images = built.assets.length + built.screenshots.length + built.icons.length * 2;
  console.log(`[store-assets] wrote ${images} images, manifest.json and preview.html under ${path.relative(ROOT, built.outRoot) || '.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error('[store-assets] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
