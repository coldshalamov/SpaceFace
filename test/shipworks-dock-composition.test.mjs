import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateShipworksDockComposition } from '../scripts/lib/shipworksDockComposition.mjs';

test('Shipworks dock composition proof is reachable through the art gate', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['check:shipworks:dock-composition'],
    'node scripts/check-shipworks-dock-composition.mjs',
  );
  assert.equal(
    pkg.scripts['check:art'].split('npm run check:shipworks:dock-composition').length - 1,
    1,
  );
});

test('Shipworks dock leaves representative visible ship surfaces unobstructed', async () => {
  const receipt = await evaluateShipworksDockComposition();

  assert.equal(receipt.pass, true, JSON.stringify(receipt.rows.filter((row) => row.hits)));
  assert.deepEqual(receipt.representativeShips, [
    'ship_kestrel_fallback',
    'ship_kestrel_authored',
    'ship_pelican_fallback',
    'ship_bastion_fallback',
    'ship_leviathan_fallback',
  ]);
  assert.deepEqual(receipt.yaws, [0, 45, 90]);
  assert.equal(receipt.rows.length, 15);
  assert.deepEqual(receipt.totals, { samples: 18000, hits: 0 });
  assert.equal(receipt.dock.primitives, 10);
  assert.ok(receipt.dock.triangles > 0);
  for (const row of receipt.rows) {
    assert.equal(row.samples, 1200);
    assert.equal(row.hits, 0, `${row.shipId} yaw ${row.yaw} is dock-obstructed`);
    assert.ok(Number.isFinite(row.dockScale) && row.dockScale > 0);
    assert.ok(Number.isFinite(row.floorClearance) && row.floorClearance > 0);
  }
});
