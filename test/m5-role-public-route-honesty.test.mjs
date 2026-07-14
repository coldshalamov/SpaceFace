import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const primaryPath = resolve(ROOT, 'scripts', 'check-m5-starter-ownership-public-route.mjs');
const supportingPath = resolve(ROOT, 'scripts', 'check-m5-role-public-route.mjs');
const packagePath = resolve(ROOT, 'package.json');

test('M5 primary ownership evidence is a starter-only public New Game and Continue route', async () => {
  const source = await readFile(primaryPath, 'utf8');

  assert.match(source, /primaryAcceptance:\s*true/);
  assert.match(source, /injectedState:\s*false/);
  assert.match(source, /directStateWrites:\s*0/);
  assert.match(source, /directEventEmits:\s*0/);
  assert.match(source, /setupWrites:\s*0/);
  assert.match(source, /teleports:\s*0/);
  assert.match(source, /New Game/);
  assert.match(source, /Launch/);
  assert.match(source, /F5/);
  assert.match(source, /Main Menu/);
  assert.match(source, /Continue/);
  assert.match(source, /ship_kestrel/);

  assert.doesNotMatch(source, /buyShip\s*\(/);
  assert.doesNotMatch(source, /grant\s*:\s*true/);
  assert.doesNotMatch(source, /dock:docked/);
  assert.doesNotMatch(source, /\.bus\.emit\s*\(/);
  assert.doesNotMatch(source, /activeShipIndex\s*=/);
  assert.doesNotMatch(source, /ownedShips\s*=/);
});

test('M5 granted second-hull route is explicitly supporting and injected', async () => {
  const source = await readFile(supportingPath, 'utf8');

  assert.match(source, /evidenceClassification:\s*\{[\s\S]*?primaryAcceptance:\s*false/);
  assert.match(source, /evidenceClassification:\s*\{[\s\S]*?injectedState:\s*true/);
  assert.doesNotMatch(source, /publicAcceptance:\s*\{[\s\S]*?primaryAcceptance:\s*true/);
});

test('M5 public ownership aliases keep primary and supporting evidence separate', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));

  assert.equal(pkg.scripts['check:m5:role-continuity'], 'node scripts/check-m5-role-continuity.mjs');
  assert.equal(
    pkg.scripts['check:m5:starter-ownership-public-route'],
    'node --test test/m5-role-public-route-honesty.test.mjs && node scripts/check-m5-starter-ownership-public-route.mjs',
  );
  assert.equal(
    pkg.scripts['check:m5:role-public-route:supporting'],
    'node scripts/check-m5-role-public-route.mjs',
  );
});
