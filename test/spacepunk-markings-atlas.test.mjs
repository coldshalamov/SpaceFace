import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  ATLAS_COLUMNS,
  ATLAS_HEIGHT,
  ATLAS_ROWS,
  ATLAS_WIDTH,
  CELL_SIZE,
  DEFAULT_OUTPUT_DIR,
  MARKING_SLOTS,
  buildSpacepunkMarkingsAtlas,
  checkSpacepunkMarkingsAtlas,
} from '../tools/art/build_spacepunk_markings_atlas.mjs';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3];
}

function cellRgbaHash(png, rect) {
  const hash = crypto.createHash('sha256');
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const start = (y * png.width + rect.x) * 4;
    hash.update(png.data.subarray(start, start + rect.width * 4));
  }
  return hash.digest('hex');
}

function regionAlphaCount(png, rect) {
  let count = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (alphaAt(png, x, y) > 0) count += 1;
    }
  }
  return count;
}

function maxPooled64Coverage(png, rect) {
  let active = 0;
  for (let py = 0; py < 64; py += 1) {
    for (let px = 0; px < 64; px += 1) {
      let lit = false;
      for (let dy = 0; dy < 4 && !lit; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          if (alphaAt(png, rect.x + px * 4 + dx, rect.y + py * 4 + dy) > 0) {
            lit = true;
            break;
          }
        }
      }
      if (lit) active += 1;
    }
  }
  return active;
}

test('spacepunk atlas has 32 stable, story-grounded, non-overlapping cells', () => {
  const { metadata } = buildSpacepunkMarkingsAtlas();
  assert.equal(ATLAS_COLUMNS, 8);
  assert.equal(ATLAS_ROWS, 4);
  assert.equal(MARKING_SLOTS.length, 32);
  assert.equal(metadata.cells.length, 32);
  assert.equal(new Set(metadata.cells.map((cell) => cell.id)).size, 32);
  assert.deepEqual(
    metadata.cells.slice(16, 20).map((cell) => cell.id),
    ['serial_bt_13', 'serial_mts_47b', 'dock_07', 'shaft_s7'],
    'exact serial and dock cells must remain conventionally authored and addressable',
  );
  assert.equal(metadata.integrationContract.generatedPixelsUsedDirectly, false);
  assert.equal(metadata.integrationContract.exactTextAuthoredConventionally, true);
  assert.equal(metadata.runtimeWired, false);

  for (const cell of metadata.cells) {
    assert(cell.story.length >= 24, `${cell.id} needs a specific story rationale`);
    assert.equal(cell.pixelRect.width, CELL_SIZE);
    assert.equal(cell.pixelRect.height, CELL_SIZE);
    assert(cell.pixelRect.x >= 0 && cell.pixelRect.y >= 0);
    assert(cell.pixelRect.x + CELL_SIZE <= ATLAS_WIDTH);
    assert(cell.pixelRect.y + CELL_SIZE <= ATLAS_HEIGHT);
  }
});

test('paired base-color and emissive PNGs are deterministic, role-correct RGBA atlases', () => {
  const first = buildSpacepunkMarkingsAtlas();
  const second = buildSpacepunkMarkingsAtlas();
  assert(first.baseColorBuffer.equals(second.baseColorBuffer));
  assert(first.emissiveBuffer.equals(second.emissiveBuffer));
  assert(first.metadataBuffer.equals(second.metadataBuffer));

  const base = PNG.sync.read(first.baseColorBuffer);
  const emissive = PNG.sync.read(first.emissiveBuffer);
  assert.deepEqual([base.width, base.height], [ATLAS_WIDTH, ATLAS_HEIGHT]);
  assert.deepEqual([emissive.width, emissive.height], [ATLAS_WIDTH, ATLAS_HEIGHT]);
  assert.equal(first.metadata.images.baseColor.colorSpace, 'srgb');
  assert.equal(first.metadata.images.emissive.colorSpace, 'srgb');
  assert.equal(first.metadata.images.baseColor.sha256, sha256(first.baseColorBuffer));
  assert.equal(first.metadata.images.emissive.sha256, sha256(first.emissiveBuffer));

  const pairedHashes = new Set();
  let expectedEmissiveCells = 0;
  for (const cell of first.metadata.cells) {
    const baseCoverage = regionAlphaCount(base, cell.pixelRect);
    assert(baseCoverage >= 350, `${cell.id} is too empty to survive as a marking`);
    assert(baseCoverage <= 40_000, `${cell.id} is an undifferentiated color block`);
    assert(maxPooled64Coverage(base, cell.pixelRect) >= 30, `${cell.id} disappears at 64px`);
    pairedHashes.add(`${cellRgbaHash(base, cell.pixelRect)}:${cellRgbaHash(emissive, cell.pixelRect)}`);

    const emissiveCoverage = regionAlphaCount(emissive, cell.pixelRect);
    if (cell.channels.emissive) {
      expectedEmissiveCells += 1;
      assert(emissiveCoverage >= 100, `${cell.id} declares emission but has no useful signal`);
    } else {
      assert.equal(emissiveCoverage, 0, `${cell.id} leaks into the emissive atlas`);
    }

    const gutter = 12;
    for (let offset = 0; offset < CELL_SIZE; offset += 1) {
      for (let inset = 0; inset < gutter; inset += 1) {
        assert.equal(alphaAt(base, cell.pixelRect.x + offset, cell.pixelRect.y + inset), 0, `${cell.id} bleeds top`);
        assert.equal(alphaAt(base, cell.pixelRect.x + offset, cell.pixelRect.y + CELL_SIZE - 1 - inset), 0, `${cell.id} bleeds bottom`);
        assert.equal(alphaAt(base, cell.pixelRect.x + inset, cell.pixelRect.y + offset), 0, `${cell.id} bleeds left`);
        assert.equal(alphaAt(base, cell.pixelRect.x + CELL_SIZE - 1 - inset, cell.pixelRect.y + offset), 0, `${cell.id} bleeds right`);
      }
    }
  }
  assert.equal(pairedHashes.size, 32, 'every packed cell needs a distinct paired material result');
  assert.equal(expectedEmissiveCells, 13);
});

test('published source-atlas files exactly match deterministic regeneration', async () => {
  const result = await checkSpacepunkMarkingsAtlas(DEFAULT_OUTPUT_DIR);
  assert.deepEqual(result.mismatches, []);
  assert.equal(result.ok, true);

  const metadata = JSON.parse(await fs.readFile(path.join(DEFAULT_OUTPUT_DIR, 'markings_atlas.json'), 'utf8'));
  assert.equal(metadata.id, 'spacepunk_markings_v1');
  assert.equal(metadata.status, 'authoring-source-only');
  assert.equal(metadata.cells.length, 32);
});
