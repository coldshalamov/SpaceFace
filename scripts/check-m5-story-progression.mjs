// check-m5-story-progression.mjs — headless gate for M5 live story adapter seams.
// Runs continuous B0→B7 + ending A heat authority smoke via the live test suite.
// Does not claim full M5 acceptance (ship lattice / browser proof out of band).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function run(label, args) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`FAIL ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
  console.log(`ok   ${label}`);
}

run('isolated campaign47a library', [join(ROOT, 'test/story-campaign47a.test.mjs')]);
run('live missions/story adapter', [join(ROOT, 'test/story-campaign47a-live.test.mjs')]);
run('embodied endings + sandbox', [join(ROOT, 'test/story-endings.test.mjs')]);
run('story beats (B8/voice)', [join(ROOT, 'scripts/check-story-beats.mjs')]);

console.log('\ncheck-m5-story-progression: pass (no acceptance claim)');
