// DEMO-BOOT-1 world-texture transcode contract.
//
// The runtime loaders fetch each world texture's sibling `<url>.ktx2` first (UASTC + baked
// mip tail, written by scripts/encode-world-ktx2.mjs) and fall back to the raster source when
// the file is absent. The silent-rot trap is a REBAKED source: its stale .ktx2 would still
// load and the game would quietly show the old art. The .sha256 marker beside each .ktx2 is
// the guard — it must hash the source bytes it was encoded from, so a re-bake without a
// re-encode fails here instead of shipping old pixels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { WORLD_KTX2_JOBS, worldKtx2Marker } = await import('../scripts/encode-world-ktx2.mjs');

test('every world texture ships a .ktx2 encoded from its current source', () => {
  assert.ok(WORLD_KTX2_JOBS.length >= 20, 'the job list must cover plates, planets and rock maps');
  for (const job of WORLD_KTX2_JOBS) {
    const srcPath = resolve(ROOT, job.src);
    assert.ok(existsSync(srcPath), `missing source ${job.src}`);
    const source = readFileSync(srcPath);
    const ktx2Path = `${srcPath}.ktx2`;
    assert.ok(existsSync(ktx2Path),
      `${job.src}: no sibling .ktx2 — run node scripts/encode-world-ktx2.mjs`);
    const marker = readFileSync(`${ktx2Path}.sha256`, 'utf8').trim();
    assert.equal(marker, worldKtx2Marker(source, job.opts),
      `${job.src}: .ktx2 is stale — the source or the encode recipe changed; run node scripts/encode-world-ktx2.mjs`);
  }
});

test('the runtime world-texture loaders actually race the .ktx2 sibling first', () => {
  const expectKtx2First = (file, symbol) => {
    const src = readFileSync(resolve(ROOT, file), 'utf8');
    assert.match(src, /`?\$?\{?[^`'\n]*\.ktx2`?/,
      `${symbol} (${file}) never references the sibling .ktx2 — the transcode path silently rotted`);
    assert.match(src, /acquireSharedKtx2Loader/, `${symbol} must use the shared transcoder pool`);
  };
  expectKtx2First('src/render/deepSkyPlates.js', 'deep-sky plates');
  expectKtx2First('src/render/paintedPlanets.js', 'painted planets');
  expectKtx2First('src/render/rockFamilyLibrary.js', 'asteroid family maps');
  expectKtx2First('src/render/rockSurfaceLibrary.js', 'common-rock maps');
});

test('the worldKtx2 rfx switch gates the shared transcode path', async () => {
  const src = readFileSync(resolve(ROOT, 'src/render/assetLoader.js'), 'utf8');
  assert.match(src, /frameCostFixOn\('worldKtx2'\)/,
    'acquireSharedKtx2Loader must honor the worldKtx2 kill switch (?rfx=-worldKtx2 / __sfRfx)');

  const { acquireSharedKtx2Loader, releaseSharedKtx2Loader } =
    await import('../src/render/assetLoader.js');
  globalThis.__sfRfx = { worldKtx2: false };
  try {
    assert.equal(await acquireSharedKtx2Loader(), null,
      'worldKtx2=false must resolve null so loaders take their raster path');
  } finally {
    delete globalThis.__sfRfx;
  }
  const loader = await acquireSharedKtx2Loader();
  assert.ok(loader, 'the shared loader must still resolve with the switch on');
  releaseSharedKtx2Loader(loader);
});
