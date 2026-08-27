import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DISTANCE_CLOSE,
  DISTANCE_DEFAULT,
  occupancyInBand,
  PLAY_CHASE_CLOSE_WIDTH_FRAC,
  PLAY_CHASE_WIDTH_FRAC,
} from '../scripts/lib/chase-camera-occupancy.mjs';
import { CHASE_ZOOM_CLOSE, CHASE_ZOOM_DEFAULT } from '../src/render/camera.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('close chase occupancy follows the live distance ratio and keeps crop fatal', () => {
  assert.equal(DISTANCE_DEFAULT, CHASE_ZOOM_DEFAULT);
  assert.equal(DISTANCE_CLOSE, CHASE_ZOOM_CLOSE);
  const scale = DISTANCE_DEFAULT / DISTANCE_CLOSE;
  assert.deepEqual(
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC.map((bound) => bound * scale),
  );
  assert.equal(occupancyInBand(0.50, { close: true }), true);
  assert.equal(occupancyInBand(0.50, { close: true, cropped: true }), false);
  assert.equal(occupancyInBand(PLAY_CHASE_CLOSE_WIDTH_FRAC[1] + 1e-6, { close: true }), false);
});

test('Blender and Node authoring tools use the same close occupancy contract', () => {
  const python = process.env.PYTHON || 'python';
  const payload = execFileSync(python, ['-c', [
    'import json, pathlib, sys',
    "sys.path.insert(0, str(pathlib.Path('tools/blender').resolve()))",
    'import spaceface_chase_contract as contract',
    'print(json.dumps({',
    "  'default': contract.PLAY_CHASE_WIDTH_FRAC,",
    "  'close': contract.PLAY_CHASE_CLOSE_WIDTH_FRAC,",
    "  'fifty': contract.occupancy_in_band(0.50, close=True),",
    "  'cropped': contract.occupancy_in_band(0.50, close=True, cropped=True),",
    '}))',
  ].join('\n')], { cwd: repoRoot, encoding: 'utf8' });
  const contract = JSON.parse(payload);

  assert.deepEqual(contract.default, PLAY_CHASE_WIDTH_FRAC);
  assert.deepEqual(contract.close, PLAY_CHASE_CLOSE_WIDTH_FRAC);
  assert.equal(contract.fifty, true);
  assert.equal(contract.cropped, false);
});
