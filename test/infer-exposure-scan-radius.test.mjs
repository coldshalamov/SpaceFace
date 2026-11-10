/**
 * Severe biological fouling shortens the hull scanner. Below that line, and on a
 * placed sensor post, the published reach stays what it was.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { EXPOSURE_MODEL } from '../src/data/alienEcology.js';
import { scannerProfileForState, SENSOR_POST_POI_RANGE } from '../src/systems/scanner.js';

function stateWith(exposure, extra = {}) {
  return {
    world: {
      currentSectorId: 'sector_x',
      alienEcology: exposure == null ? undefined : { exposure },
    },
    ...extra,
  };
}

test('below severe exposure the scan radii are unchanged', () => {
  const clean = scannerProfileForState({ world: { currentSectorId: 'sector_x' } });
  const warn = scannerProfileForState(stateWith(EXPOSURE_MODEL.warnAt));
  const justUnder = scannerProfileForState(stateWith(EXPOSURE_MODEL.severeAt - 0.001));
  const notANumber = scannerProfileForState(stateWith('fouled'));

  assert.equal(EXPOSURE_MODEL.scannerNoiseAtSevere, true);
  assert.equal(warn.nearRadius, clean.nearRadius);
  assert.equal(warn.hiddenPoiRadius, clean.hiddenPoiRadius);
  assert.equal(warn.poiRadius, clean.poiRadius);
  assert.equal(warn.pingPersistS, clean.pingPersistS);
  assert.equal(warn.radiusMult, clean.radiusMult);
  assert.equal(justUnder.nearRadius, clean.nearRadius);
  assert.equal(notANumber.nearRadius, clean.nearRadius);
});

test('severe exposure shrinks the hull scanner and leaves a sensor post alone', () => {
  const clean = scannerProfileForState({ world: { currentSectorId: 'sector_x' } });
  const severe = scannerProfileForState(stateWith(EXPOSURE_MODEL.severeAt));
  const above = scannerProfileForState(stateWith(1));
  const posted = scannerProfileForState(stateWith(1, {
    claims: {
      bodies: [{
        owned: true,
        sectorId: 'sector_x',
        modules: ['mod_sensor_post'],
      }],
    },
  }));

  assert.equal(EXPOSURE_MODEL.scannerRadiusMultAtSevere, 0.62);
  assert.ok(EXPOSURE_MODEL.scannerRadiusMultAtSevere > 0 && EXPOSURE_MODEL.scannerRadiusMultAtSevere < 1);
  assert.equal(severe.radiusMult, clean.radiusMult);
  assert.equal(severe.pingPersistS, clean.pingPersistS);
  assert.equal(severe.nearRadius, clean.nearRadius * 0.62);
  assert.equal(severe.hiddenPoiRadius, clean.hiddenPoiRadius * 0.62);
  assert.equal(severe.poiRadius, severe.hiddenPoiRadius);
  assert.equal(above.nearRadius, severe.nearRadius);

  assert.equal(posted.sensorPostActive, true);
  assert.equal(posted.nearRadius, clean.nearRadius * 0.62);
  assert.equal(posted.hiddenPoiRadius, clean.hiddenPoiRadius * 0.62);
  assert.equal(posted.poiRadius, SENSOR_POST_POI_RANGE);
});
