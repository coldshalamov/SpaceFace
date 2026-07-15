import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'test/depth-program-a1-files.test.mjs',
  'test/depth-program-a1-band-data.test.mjs',
  'test/depth-program-a1-band-runtime.test.mjs',
  'test/depth-program-a1-band-ui-audio.test.mjs',
  'test/depth-program-a1-listening-tour.test.mjs',
  'test/depth-program-a1-signal-context.test.mjs',
  'test/depth-program-a1-bearing-sync.test.mjs',
  'test/depth-program-a1-live-integration.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log('depth-program-a1 PASS: deterministic tuner, arbiter yield, listening tour, live presence signal, landmark RF behavior, procedural beds, HUD intent, synchronous canonical bearing receipt');
