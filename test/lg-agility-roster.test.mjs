// VERB-38 — the agility line uses the bar's yaw acceleration.
//
// The old line divided the legacy flight-model angular acceleration by the
// median of the live yaw accelerations. A Hitch on that median was called
// hundreds of percent fast.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { handlingBandModel } from '../src/ui/ship/shipBandModels.js';

function medianYawAccel() {
  const values = SHIPS.map((ship) => getDerivedStats(ship.id, [], null).propulsion.yawAccel)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function agilityWhy(shipId) {
  const model = handlingBandModel({ shipId, fittings: [], player: null });
  const bar = model.bars.find((row) => row.id === 'agility');
  assert.ok(bar && bar.why, shipId);
  return bar.why;
}

test('seed 4242 the agility line uses the bar\'s turn number', () => {
  const median = medianYawAccel();
  const hitch = getDerivedStats('ship_kestrel', [], null);
  const hitchYaw = hitch.propulsion.yawAccel;
  assert.ok(Math.abs(hitchYaw - median) < 0.05, `hitch ${hitchYaw} median ${median}`);
  const hitchWhy = agilityWhy('ship_kestrel');
  assert.match(hitchWhy, /middle of the roster/);
  assert.doesNotMatch(hitchWhy, /faster|slower/);
  const legacy = hitch.flightModel.angularAccel;
  assert.ok((legacy / median - 1) * 100 > 200, `legacy gap collapsed ${legacy}`);

  const muleYaw = getDerivedStats('ship_mule', [], null).propulsion.yawAccel;
  const muleShift = Math.round(Math.abs((muleYaw / median - 1) * 100));
  assert.ok(muleYaw < median);
  assert.match(agilityWhy('ship_mule'), new RegExp(`${muleShift}% slower`));

  const waspYaw = getDerivedStats('ship_wasp', [], null).propulsion.yawAccel;
  const waspShift = Math.round(Math.abs((waspYaw / median - 1) * 100));
  assert.ok(waspYaw > median);
  assert.ok(waspShift < 80, `wasp ${waspShift} is still the legacy hundreds`);
  assert.match(agilityWhy('ship_wasp'), new RegExp(`${waspShift}% faster`));
});
