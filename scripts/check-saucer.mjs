// Focused contract + adjacent regression gate. Run with the repository's dependencies installed.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const tests = [
  'saucer-flight.test.mjs', 'saucer-input-weapons.test.mjs', 'saucer-kit.test.mjs',
  'input-lifecycle.test.mjs', 'physics-authority.test.mjs', 'hull-burst.test.mjs',
  'hull-burst-input.test.mjs', 'hull-burst-hud.test.mjs', 'hull-burst-vfx.test.mjs',
  'crucible-round-shop.test.mjs', 'crucible-draft.test.mjs', 'crucible-refit.test.mjs',
  'crucible-swarm-screens.test.mjs', 'crucible-combat-readout.test.mjs',
  'starter-weapon-runtime.test.mjs', 'flightV3.spec.mjs', 'dead-player-flight-step.test.mjs',
  'sg02-contact-sanity-recovery.test.mjs', 'sg02-player-contact-give.test.mjs',
  'nxi-115-preset-blocker-parts.test.mjs',
];
const commands = [
  ['--test', ...tests.map(name => `test/${name}`)],
  ['scripts/check-data.mjs'],
  ['scripts/check-data-refs.mjs'],
  ['scripts/sf-sim.mjs', 'compare', '47a', '--seed', '47', '--ticks', '720',
    '--inputs', 'test/47a.inputs.json', '--expect', 'test/47a.telemetry.expected.json', '--reload-at', '600'],
];
for (const args of commands) {
  console.log(`\n> node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nSaucer contract, regression, data and save/reload checks passed.');
