import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateEncounterShape } from '../src/data/encounters/shape.js';
import encounter, { encounterOrder, trigger } from '../src/data/encounters/372-second-rinse.js';
import { sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';
import {
  SECOND_RINSE as C,
  blueSheetLocal,
  circleHitsPoly,
  localsToWorld,
  normalizeSecondRinse,
  pinCordLocal,
  secondRinsePocket,
  secondRinseResolve,
  segmentsCross,
} from '../src/data/secondRinse.js';
import { buildLaneGeometry, LANE_HELIOS_CERES, LANE_CORRIDOR_RADIUS_WU } from '../src/data/travelLaneRoutes.js';

test('second rinse encounter shape is a civilian yard on the Helios lane', () => {
  validateEncounterShape(encounter.shape, encounter.id);
  assert.equal(encounterOrder, 372);
  assert.equal(trigger.id, 'second_rinse');
  assert.equal(encounter.id, 'second_rinse');
  assert.equal(encounter.noCombat, true);
  assert.equal(encounter.noCredits, true);
  assert.equal(encounter.shape.actor, 'faction_free');
  assert.equal(encounter.shape.situation, 'yard');
  assert.deepEqual([...encounter.shape.place], ['trade_lane']);
  assert.equal(encounter.squad, undefined);
});

test('the wash pocket sits off the freight chord, still in Helios', () => {
  const pocket = secondRinsePocket();
  const geometry = buildLaneGeometry(LANE_HELIOS_CERES);
  assert.ok(pocket);
  assert.ok(pocket.along > 1400);
  const alongPoint = {
    x: geometry.from.x + geometry.axis.x * pocket.along,
    z: geometry.from.z + geometry.axis.z * pocket.along,
  };
  const lateral = Math.hypot(pocket.x - alongPoint.x, pocket.z - alongPoint.z);
  assert.ok(lateral > LANE_CORRIDOR_RADIUS_WU);
  assert.equal(sectorMembershipAtGlobal(pocket), 'sector_helios_prime');
});

test('the blue sheet never enters the kettle radius', () => {
  for (const t of [0, 0.4, 0.9, 1.4, 2.1]) {
    for (const corner of blueSheetLocal(t, 'open')) {
      assert.ok(Math.hypot(corner.x, corner.z) > C.hullRadius, `corner inside hull at t=${t}`);
    }
  }
  const pin = pinCordLocal();
  assert.ok(Math.hypot(pin.b.x, pin.b.z) - Math.hypot(pin.a.x, pin.a.z) > 3);
});

test('only a fresh overlap of the blue sheet seats it', () => {
  const pocket = secondRinsePocket();
  const corners = localsToWorld(pocket, pocket.rot, blueSheetLocal(0.2, 'open'));
  const hit = corners[1];
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: false,
  }), 'crooked');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: true, cordCut: false,
  }), null);
  assert.equal(circleHitsPoly(hit.x, hit.z, 1, corners), true);
  assert.equal(secondRinseResolve('crooked', { overlapsBlue: true, wasOnBlue: false }), null);
});

test('crossing the pin-cord cuts, and the cord wins over a clap', () => {
  const pin = pinCordLocal();
  const worldA = { x: pin.a.x, z: pin.a.z };
  const worldB = { x: pin.b.x, z: pin.b.z };
  assert.equal(segmentsCross(
    { x: -1, z: pin.a.z + 2 },
    { x: 1, z: pin.a.z + 2 },
    worldA,
    worldB,
  ), true);
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: true,
  }), 'cut');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: false, wasOnBlue: false, cordCut: false, overlapsWhite: true, wasOnWhite: false,
  }), 'white');
});

test('the save flag only keeps open, crooked, or cut', () => {
  assert.equal(normalizeSecondRinse({ flag: 'crooked', introduced: true }).flag, 'crooked');
  assert.equal(normalizeSecondRinse({ flag: 'cut' }).flag, 'cut');
  assert.equal(normalizeSecondRinse({ flag: 'salvage' }).flag, 'open');
  assert.equal(normalizeSecondRinse(null).flag, 'open');
  assert.equal(normalizeSecondRinse({ flag: 'open' }).introduced, false);
});

test('sim modules do not import three', () => {
  const data = readFileSync(new URL('../src/data/secondRinse.js', import.meta.url), 'utf8');
  const system = readFileSync(new URL('../src/systems/secondRinse.js', import.meta.url), 'utf8');
  const imported = /from ['"]three['"]/;
  assert.equal(imported.test(data), false);
  assert.equal(imported.test(system), false);
});
