import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Regression: the AL-MACH-2 split (b55ca88949) moved callers of stationName and
// setPieceEventFields into trafficJobOps.js / missionStoryOps.js without importing them,
// so those paths threw ReferenceError at runtime.
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const importsFrom = (code, name, from) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${from.replace('.', '\\.')}'`).test(code);

test('trafficJobOps imports stationName from traffic.js', async () => {
  assert.ok(importsFrom(src('systems/trafficJobOps.js'), 'stationName', './traffic.js'));
  const { stationName } = await import('../src/systems/traffic.js');
  assert.equal(stationName({ data: { name: 'Helios Bay 7' } }, 'Origin'), 'Helios Bay 7');
  assert.equal(stationName(null, 'Origin'), 'Origin');
});

test('missionStoryOps imports setPieceEventFields from missions.js', async () => {
  assert.ok(importsFrom(src('systems/missionStoryOps.js'), 'setPieceEventFields', './missions.js'));
  const { setPieceEventFields } = await import('../src/systems/missions.js');
  assert.deepEqual(setPieceEventFields({}), {});
});

test('renderer crucible warm teardown is reachable from the outer begin() catch', () => {
  const code = src('render/renderer.js');
  assert.match(code, /let teardownWarm = null;/);
  assert.doesNotMatch(code, /const teardownWarm = /);
});
