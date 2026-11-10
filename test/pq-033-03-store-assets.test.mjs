// PQ-033.03 — Steam store assets: the slot table matches Steam's published sizes, `--check` passes a
// complete set and names every missing, wrong-size, opaque-logo or unshown file, every achievement has
// an achieved and an unachieved 64x64 icon drawn from its own kit glyph, and the store-page screenshot
// manifest lists real 1920x1080 stills. Fixture PNGs and JPEGs; no rasterizer needed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

import { ACHIEVEMENTS } from '../src/data/achievements.js';
import {
  ACHIEVEMENT_ICON_DIR,
  COMPOSITIONS,
  KIT_GLYPH_DIR_REL,
  SCREENSHOT_MANIFEST_REL,
  STEAM_ACHIEVEMENT_ICON_SIZE,
  STEAM_MIN_SCREENSHOTS,
  STEAM_SCREENSHOT_SIZE,
  STEAM_STORE_ASSETS,
  checkStoreAssets,
  readJpegSize,
  readPngHeader,
  screenshotFile,
} from '../scripts/build-store-assets.mjs';
import { achievementIconFiles } from '../scripts/export-steam-achievements.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = path.join(ROOT, 'scripts', 'build-store-assets.mjs');

// Steamworks graphical asset documentation (store + library), 2026.
const STEAM_SIZES = {
  header_capsule: [920, 430],
  small_capsule: [462, 174],
  main_capsule: [1232, 706],
  vertical_capsule: [748, 896],
  page_background: [1438, 810],
  library_capsule: [600, 900],
  library_header: [920, 430],
  library_hero: [3840, 1240],
  library_logo: [1280, 720],
};

function writePng(file, width, height, { transparent = false } = {}) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) * 4;
      const inLogo = x > width * 0.3 && x < width * 0.7 && y > height * 0.4 && y < height * 0.6;
      png.data[i] = 60; png.data[i + 1] = 70; png.data[i + 2] = 90;
      png.data[i + 3] = transparent ? (inLogo ? 255 : 0) : 255;
    }
  }
  writeFileSync(file, PNG.sync.write(png, { colorType: transparent ? 6 : 2 }));
}

function writeJpeg(file, width, height, shade) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = shade; data[i + 1] = Math.round(shade * 0.75); data[i + 2] = 40; data[i + 3] = 255;
  }
  writeFileSync(file, jpeg.encode({ data, width, height }, 90).data);
}

function fixture({ skipScreenshot = false } = {}) {
  const outRoot = mkdtempSync(path.join(os.tmpdir(), 'pq03303-store-'));
  const steam = path.join(outRoot, 'steam');
  mkdirSync(path.join(steam, ACHIEVEMENT_ICON_DIR), { recursive: true });
  const names = [];
  for (const asset of STEAM_STORE_ASSETS) {
    writePng(path.join(steam, asset.file), asset.width, asset.height, { transparent: !!asset.transparent });
    names.push(asset.file);
  }
  const count = skipScreenshot ? STEAM_MIN_SCREENSHOTS - 1 : STEAM_MIN_SCREENSHOTS;
  for (let i = 0; i < count; i += 1) {
    writePng(path.join(steam, screenshotFile(i)), STEAM_SCREENSHOT_SIZE.width, STEAM_SCREENSHOT_SIZE.height);
    names.push(screenshotFile(i));
  }
  for (const def of ACHIEVEMENTS) {
    const files = achievementIconFiles(def);
    writeJpeg(path.join(steam, ACHIEVEMENT_ICON_DIR, files.achieved), 64, 64, 220);
    writeJpeg(path.join(steam, ACHIEVEMENT_ICON_DIR, files.unachieved), 64, 64, 70);
    names.push(`${ACHIEVEMENT_ICON_DIR}/${files.achieved}`, `${ACHIEVEMENT_ICON_DIR}/${files.unachieved}`);
  }
  writeFileSync(path.join(steam, 'manifest.json'), '{}\n');
  writeFileSync(path.join(outRoot, 'preview.html'), names.map((name) => `<img src="steam/${name}">`).join('\n'));
  return { outRoot, steam };
}

function runCheck(outRoot) {
  return spawnSync(process.execPath, [SCRIPT, '--check', '--out', outRoot], { cwd: ROOT, encoding: 'utf8' });
}

test('the slot table is Steam\'s published sizes, and every slot has a composition', () => {
  assert.deepEqual(
    Object.fromEntries(STEAM_STORE_ASSETS.map((asset) => [asset.id, [asset.width, asset.height]])),
    STEAM_SIZES,
  );
  assert.deepEqual(STEAM_SCREENSHOT_SIZE, { width: 1920, height: 1080 });
  assert.equal(STEAM_MIN_SCREENSHOTS, 5);
  for (const asset of STEAM_STORE_ASSETS) assert.ok(COMPOSITIONS[asset.id], `${asset.id} has a composition`);
  assert.equal(STEAM_STORE_ASSETS.find((a) => a.id === 'library_logo').transparent, true);
  assert.equal(COMPOSITIONS.library_hero.logo, undefined, 'the library hero carries no text');
  for (const [id, spec] of Object.entries(COMPOSITIONS)) {
    if (!spec.crop) continue;
    const [w, h] = STEAM_SIZES[id];
    const ratio = (spec.crop.width / spec.crop.height) / (w / h);
    assert.ok(Math.abs(ratio - 1) < 0.01, `${id} crop keeps the slot aspect (no stretch), off by ${(Math.abs(ratio - 1) * 100).toFixed(2)}%`);
  }
});

test('every achievement draws its two Steam icons from its own kit glyph', () => {
  assert.equal(STEAM_ACHIEVEMENT_ICON_SIZE, 64);
  const glyphs = ACHIEVEMENTS.map((def) => def.icon);
  assert.equal(new Set(glyphs).size, glyphs.length, 'no two achievements share a glyph');
  for (const def of ACHIEVEMENTS) {
    assert.ok(existsSync(path.join(ROOT, KIT_GLYPH_DIR_REL, `${def.icon}.svg`)), `${def.id}: ${def.icon} is a kit glyph in ${KIT_GLYPH_DIR_REL}`);
    assert.deepEqual({ ...achievementIconFiles(def) }, {
      achieved: `${def.steamApiName}_achieved.jpg`,
      unachieved: `${def.steamApiName}_unachieved.jpg`,
    });
  }
});

test('--check passes a complete set at exact sizes', () => {
  const { outRoot, steam } = fixture();
  try {
    const run = runCheck(outRoot);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /ok 9 capsule\/library assets \+ 5 screenshots/);
    assert.match(run.stdout, new RegExp(`\\+ ${ACHIEVEMENTS.length * 2} achievement icons`));
    assert.equal(checkStoreAssets({ outRoot }).ok, true);
    assert.deepEqual(readJpegSize(path.join(steam, ACHIEVEMENT_ICON_DIR, achievementIconFiles(ACHIEVEMENTS[0]).achieved)), { width: 64, height: 64 });
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

test('--check names a wrong size, an opaque logo, a missing screenshot and an unshown file', () => {
  const { outRoot, steam } = fixture({ skipScreenshot: true });
  try {
    writePng(path.join(steam, 'small_capsule.png'), 460, 174);
    writePng(path.join(steam, 'library_logo.png'), 1280, 720, { transparent: false });
    writeFileSync(path.join(outRoot, 'preview.html'), '<img src="steam/header_capsule.png">');
    const run = runCheck(outRoot);
    assert.equal(run.status, 1);
    const text = `${run.stdout}\n${run.stderr}`;
    assert.match(text, /small_capsule: 460x174, Steam needs 462x174/);
    assert.match(text, /library_logo: needs an alpha channel/);
    assert.match(text, /screenshots: 4, Steam needs at least 5/);
    assert.match(text, /preview\.html: does not show main_capsule\.png/);

    writePng(path.join(steam, 'library_logo.png'), 1280, 720, { transparent: true });
    const png = PNG.sync.read(readFileSync(path.join(steam, 'library_logo.png')));
    png.data[3] = 255;
    writeFileSync(path.join(steam, 'library_logo.png'), PNG.sync.write(png, { colorType: 6 }));
    assert.ok(checkStoreAssets({ outRoot }).failures.includes('library_logo: background is not transparent'));
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

test('--check names a missing, wrong-size, non-JPEG or unlit-identical achievement icon', () => {
  const { outRoot, steam } = fixture();
  const dir = path.join(steam, ACHIEVEMENT_ICON_DIR);
  const [missing, oversized, notJpeg, identical] = ACHIEVEMENTS;
  try {
    rmSync(path.join(dir, achievementIconFiles(missing).unachieved));
    writeJpeg(path.join(dir, achievementIconFiles(oversized).achieved), 256, 256, 220);
    writePng(path.join(dir, achievementIconFiles(notJpeg).achieved), 64, 64);
    writeFileSync(path.join(dir, achievementIconFiles(identical).unachieved), readFileSync(path.join(dir, achievementIconFiles(identical).achieved)));
    const verdict = checkStoreAssets({ outRoot });
    const text = verdict.failures.join('\n');
    assert.equal(verdict.ok, false);
    assert.match(text, new RegExp(`${missing.steamApiName} unachieved icon: missing steam/${ACHIEVEMENT_ICON_DIR}/${missing.steamApiName}_unachieved\\.jpg`));
    assert.match(text, new RegExp(`${oversized.steamApiName} achieved icon: 256x256, Steam needs 64x64`));
    assert.match(text, new RegExp(`${notJpeg.steamApiName} achieved icon: not a JPEG`));
    assert.match(text, new RegExp(`${identical.steamApiName} icons: the achieved and unachieved icons are the same image`));
    assert.equal(verdict.failures.length, 4, text);
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

test('the store-page screenshot manifest lists at least five real 1920x1080 stills', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, SCREENSHOT_MANIFEST_REL), 'utf8'));
  assert.equal(manifest.schema, 'spaceface.storeScreenshots.v1');
  assert.ok(manifest.screenshots.length >= STEAM_MIN_SCREENSHOTS);
  for (const shot of manifest.screenshots) {
    const header = readPngHeader(path.join(ROOT, 'assets', 'store', 'page', shot.file));
    assert.ok(header, `${shot.file} is a PNG`);
    assert.deepEqual([header.width, header.height], [1920, 1080], `${shot.file} is a full 1920x1080 still`);
    assert.ok(shot.caption && shot.shows && shot.source, `${shot.file} names what it shows and where it came from`);
    assert.match(shot.sha256, /^[0-9a-f]{64}$/);
  }
  assert.ok(manifest.screenshots.some((shot) => shot.file === 'spaceface-store-headed.png'), 'the photo-mode store still is used');
});

test('the generated store folder, when present, passes its own check', (t) => {
  const outRoot = path.join(ROOT, 'build', 'store');
  if (!existsSync(path.join(outRoot, 'steam', 'manifest.json'))) {
    t.skip('build/store not generated here (npm run build:store-assets)');
    return;
  }
  const verdict = checkStoreAssets({ outRoot });
  assert.equal(verdict.ok, true, verdict.failures.join('\n'));
  console.log(`PQ-033.03 store assets: ${verdict.assets} slots + ${verdict.screenshots} screenshots + ${verdict.icons} achievement icons pass --check`);
});
