import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEXTURE_CATALOG,
  buildFlipbookRgba,
  buildRgbaTexture,
} from '../src/render/thruster/textures/sample.js';
import { encodePngRgba } from '../src/render/thruster/textures/encodePng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/fx/thruster');
mkdirSync(OUT, { recursive: true });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const textures = [];
for (const entry of TEXTURE_CATALOG) {
  const rgba = entry.kind === 'flipbook'
    ? buildFlipbookRgba(entry.width, entry.height, entry.cols, entry.rows, { seed: entry.seed })
    : buildRgbaTexture(entry.width, entry.height, (u, v) => entry.sample(u, v));
  const png = encodePngRgba(entry.width, entry.height, rgba);
  const file = `${entry.id}.png`;
  writeFileSync(resolve(OUT, file), png);
  textures.push({
    id: entry.id,
    path: `assets/fx/thruster/${file}`,
    width: entry.width,
    height: entry.height,
    kind: entry.kind,
    seed: entry.seed,
    bytes: png.length,
    sha256: sha256(png),
  });
}

const manifest = {
  schema: 'spaceface.thrusterTextureManifest.v1',
  generator: 'scripts/generate-thruster-textures.mjs',
  deterministic: true,
  textures,
  ktx2: {
    produced: false,
    reason: 'PNG runtime sources retained until the project KTX2 toolchain is available and visually validated.',
  },
};
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, count: textures.length, output: OUT, hashes: textures.map(({ id, sha256: hash }) => ({ id, hash })) }, null, 2));
