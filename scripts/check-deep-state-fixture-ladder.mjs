import { loadDeepStateFixtureLadder } from './lib/deepStateFixtureLadder.mjs';

try {
  const manifest = await loadDeepStateFixtureLadder();
  const planned = manifest.fixtures.filter((fixture) => fixture.status === 'planned').length;
  const captured = manifest.fixtures.length - planned;
  console.log(`Deep-state fixture manifest/artifacts OK: ${manifest.fixtures.length} contracts, ${captured} captured, ${planned} planned`);
} catch (error) {
  console.error(error.message);
  for (const issue of error.issues || []) console.error(`- ${issue.code}: ${issue.path}`);
  process.exitCode = 1;
}
