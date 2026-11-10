// The Band's landmark carriers are wired end to end — the three sources whose voice the
// Band already authored (Wreck Cathedral, Candle Fleet, Lung of Charon idents + lines in
// flavor/040-band.js) are sampled by the live runtime, so proximity to the physical
// landmark feeds strength into resolveLandmarkBleed and the authored lines fire.
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLandmarkBleed } from '../src/data/bandRadio.js';
import { bandRadio } from '../src/systems/bandRadio.js';

function worldWith(landmark, playerPos) {
  const entities = new Map();
  entities.set('player', { id: 'player', pos: playerPos, alive: true });
  entities.set('landmark', {
    id: 'landmark',
    alive: true,
    pos: { x: landmark.pos.x, z: landmark.pos.z },
    radius: landmark.radius ?? 0,
    data: { [landmark.dataKey]: landmark.dataValue },
  });
  return entities;
}

const CASES = [
  {
    sourceId: 'wreck_cathedral',
    sectorId: 'sector_io_reach',
    dataKey: 'flavorTargetRef',
    dataValue: 'landmark_c1_wreck_cathedral_concord_vigilant',
    pos: { x: 0, z: 0 },
    radius: 120,
    identText: 'VIGILANT MEMORIAL: NINE HOURS HELD.',
    lineProbe: 'local_cathedral_01',
  },
  {
    sourceId: 'candle_fleet',
    sectorId: 'sector_helios_prime',
    dataKey: 'flavorTargetRef',
    dataValue: 'landmark_c3_candle_fleet',
    pos: { x: 0, z: 0 },
    radius: 40,
    identText: 'CANDLE FLEET: TWENTY-FOUR FLAMES.',
    lineProbe: 'local_candle_01',
  },
  {
    sourceId: 'lung_of_charon',
    sectorId: 'sector_charon_expanse',
    dataKey: 'flavorTargetRef',
    dataValue: 'landmark_c7_lung_of_charon',
    pos: { x: 0, z: 0 },
    radius: 60,
    identText: 'CHARON BARGE: DESTINATION UNRESOLVED.',
    lineProbe: 'local_charon_01',
  },
];

test('each authored landmark carrier is sampled by the live runtime and bleeds its voice', () => {
  for (const c of CASES) {
    const sys = Object.create(bandRadio);
    sys.state = {
      meta: { seed: 4242 },
      simTime: 100,
      world: { currentSectorId: c.sectorId },
      playerId: 'player',
      entities: worldWith(c, { x: 60, z: 0 }),
    };
    // Past the sample gate so the first call samples immediately.
    sys._nextLandmarkProximitySampleAtS = 0;
    sys._sampleLiveLandmarkProximity(100);

    const own = sys._ensureState();
    const strength = own.proximitySources[c.sourceId];
    assert.ok(
      Number.isFinite(strength) && strength > 0.5,
      `${c.sourceId}: proximity feeds strength (got ${strength})`,
    );

    const bleed = resolveLandmarkBleed(own.proximitySources);
    assert.ok(bleed, `${c.sourceId}: bleed resolves`);
    assert.equal(bleed.sourceId, c.sourceId);
    assert.equal(bleed.silence, false);
    assert.equal(bleed.ident && bleed.ident.text, c.identText, `${c.sourceId}: authored ident reads`);
    assert.ok(
      bleed.lines.some((line) => line.id === c.lineProbe),
      `${c.sourceId}: authored lines are reachable`,
    );
  }
});

test('far from the landmark the strength drains and the bleed stays silent', () => {
  const c = CASES[0];
  const sys = Object.create(bandRadio);
  sys.state = {
    meta: { seed: 4242 },
    simTime: 100,
    world: { currentSectorId: c.sectorId },
    playerId: 'player',
    entities: worldWith(c, { x: 5000, z: 0 }),
  };
  sys._nextLandmarkProximitySampleAtS = 0;
  sys._sampleLiveLandmarkProximity(100);
  const own = sys._ensureState();
  const strength = own.proximitySources[c.sourceId];
  assert.equal(strength, undefined, 'no strength far from the carrier');
  assert.equal(resolveLandmarkBleed(own.proximitySources), null);
});
