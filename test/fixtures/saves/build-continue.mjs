// Recipe for the Continue-matrix fixtures whose schema version has no real historical capture
// (v21, v23, v24, v25 …). Run: node test/fixtures/saves/build-continue.mjs --write
// Without --write this does nothing, and with it any target that already exists is SKIPPED —
// delete a file first to rebuild it on purpose. The tests only ever READ the fixtures.
//
// Each continue-vNN-* file is the nearest older Continue capture migrated through the real
// migration ladder up to NN and re-sealed — the same recipe build-frozen.mjs used for v19.
// They are not fresh physics captures; they exist so the matrix and the release compatibility
// check cover every shipped schema version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--write')) {
  console.log('build-continue: nothing to do without --write (existing fixtures are never overwritten).');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { fnv1a } = await load('src/save/checksum.js');
const { CURRENT_VERSION } = await load('src/data/saveVersion.js');
const { MIGRATIONS } = await load('src/save/migrations.js');

const present = new Set(fs.readdirSync(here).flatMap((name) => {
  const match = /^continue-v(\d+)-(?:free|tether)\.json$/.exec(name);
  return match ? [Number(match[1])] : [];
}));

for (let target = 1; target <= CURRENT_VERSION; target++) {
  if (present.has(target)) continue;
  const source = Math.max(...[...present].filter((v) => v < target));
  if (!Number.isSafeInteger(source)) continue;
  for (const kind of ['free', 'tether']) {
    const captured = JSON.parse(fs.readFileSync(path.join(here, `continue-v${source}-${kind}.json`), 'utf8'));
    for (const step of MIGRATIONS) {
      if (step.from >= captured.version && step.to <= target) step.fn(captured.data);
    }
    captured.version = target;
    captured.checksum = fnv1a(JSON.stringify(captured.data));
    fs.writeFileSync(path.join(here, `continue-v${target}-${kind}.json`), JSON.stringify(captured));
    console.log(`wrote continue-v${target}-${kind}.json (from v${source})`);
  }
  present.add(target);
}
