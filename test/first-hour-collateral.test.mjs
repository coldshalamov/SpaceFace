// SFQ-B111 â€” a collision kill the law already adjudicated is spoken. Gun kills
// stay on their own receipt. Seed 4242 names the pin; the function is pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { collisionResponsibilityLine, collisionResponsibilityReceipt, directLawReceiptText } from '../src/ui/sectorLawPresenter.js';

test('collision responsibility matches the published outcomes', () => {
  assert.equal(collisionResponsibilityLine({ cause: 'kinetic', playerCaused: true, outcome: 'charged' }), null);
  assert.match(
    collisionResponsibilityLine({ cause: 'ship_collision', playerCaused: false, outcome: 'charged' }),
    /Not your collision/,
  );
  assert.match(
    collisionResponsibilityLine({ cause: 'terrain_collision', playerCaused: true, outcome: 'lawful' }),
    /Law clears it/,
  );
  assert.match(
    collisionResponsibilityLine({ cause: 'terrain_collision', playerCaused: true, outcome: 'unwitnessed', sustainedAssault: false }),
    /there is no charge/,
  );
  assert.match(
    collisionResponsibilityLine({ cause: 'ship_collision', playerCaused: true, outcome: 'unwitnessed', sustainedAssault: true }),
    /No charge yet/,
  );
  assert.match(
    collisionResponsibilityLine({ cause: 'terrain_collision', playerCaused: true, outcome: 'charged_unstable' }),
    /No charge has been filed/,
  );
  const reckless = collisionResponsibilityLine({
    cause: 'terrain_collision', playerCaused: true, outcome: 'charged', kind: 'reckless_kill', sustainedAssault: false,
  });
  assert.match(reckless, /Charged reckless/);
  const attack = collisionResponsibilityLine({
    cause: 'ship_collision', playerCaused: true, outcome: 'charged', kind: 'unlawful_kill', sustainedAssault: true,
  });
  assert.match(attack, /kept hitting them/);
  assert.equal(directLawReceiptText({ outcome: 'collision_responsibility', text: attack }), attack);

  const source = readFileSync(new URL('../src/ui/sectorLawPresenter.js', import.meta.url), 'utf8');
  assert.match(source, /law:killedAdjudicated/);
  assert.match(source, /Cause: the body hit terrain/);
  assert.match(source, /Cause: hull on hull/);
});


test('charged collision receipts retain their jurisdiction and never say stand down', () => {
  const receipt = collisionResponsibilityReceipt({ cause: 'ship_collision', playerCaused: true,
    outcome: 'charged', kind: 'lawful_kill', stationId: 'station_helios' });
  assert.match(receipt.text, /protected patrol/);
  assert.doesNotMatch(receipt.text, /reckless/);
  assert.equal(receipt.stationId, 'station_helios');
  assert.equal(receipt.statusText, 'CHARGE FILED');
  assert.equal(receipt.danger, true);
  const cleared = collisionResponsibilityReceipt({ cause: 'ship_collision', playerCaused: true, outcome: 'lawful' });
  assert.equal(cleared.statusText, 'CLEARED');
  assert.equal(cleared.danger, false);
});
