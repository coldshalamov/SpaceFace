#!/usr/bin/env node
/** Packaging/provenance gate. No browser, encoder or new runtime dependency. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const folder = resolve(root, 'assets/cinematics');
const manifest = JSON.parse(await readFile(resolve(folder, 'boot-visualizer.manifest.json'), 'utf8'));
const inputs = ['src/ui/introSignalRemix.js', 'src/ui/loadingSignalTableaux.js',
  'assets/cinematics/intro-visualizer.mp4', 'tools/cinematic/bake-boot-visualizer.mjs'];
assert.equal(manifest.version, 1);
assert.deepEqual(Object.keys(manifest.inputs).sort(), inputs.sort());
for (const path of inputs) assert.equal(sha256(await readFile(resolve(root, path))), manifest.inputs[path],
  `${path} changed after the bake: regenerate the media instead of silently shipping stale artwork`);
assert.deepEqual(manifest.outputs.map(row => row.file).sort(),
  ['boot-visualizer.mp4', 'boot-visualizer-quiet.mp4', 'boot-visualizer.jpg'].sort());
for (const row of manifest.outputs) {
  const bytes = await readFile(resolve(folder, row.file));
  assert.equal(bytes.length, row.bytes, `${row.file}: byte count mismatch`);
  assert.equal(sha256(bytes), row.sha256, `${row.file}: hash mismatch`);
  assert(bytes.length > 1000, `${row.file}: empty or pointer file`);
  if (!row.file.endsWith('.mp4')) continue;
  assert.equal(row.width, 1280); assert.equal(row.height, 720); assert.equal(row.fps, 24);
  assert.equal(row.seconds, 17.5); assert.equal(row.maxBitrate, 8000000);
  assert.equal(row.reducedFlash, row.file.includes('-quiet'));
  assert(bytes.length <= 19 * 1024 * 1024, `${row.file}: loading media exceeds its byte budget`);
  const boxes = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {
      assert(offset + 16 <= bytes.length, 'truncated extended MP4 box');
      size = Number(bytes.readBigUInt64BE(offset + 8));
    } else if (size === 0) size = bytes.length - offset;
    assert(Number.isSafeInteger(size) && size >= 8 && offset + size <= bytes.length, 'invalid MP4 box');
    boxes.push(type); offset += size;
  }
  assert(boxes.includes('ftyp') && boxes.includes('moov') && boxes.includes('mdat'), 'invalid MP4 structure');
  assert(boxes.indexOf('moov') < boxes.indexOf('mdat'), `${row.file}: metadata must precede media for streaming startup`);
}
console.log('[boot-media-assets] exact artist provenance, both variants, byte budgets and faststart metadata verified');
