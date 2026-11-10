// Drawing a weapon inside a station no-fire ring speaks once, on a real voice
// channel. 'warn' is not in the arbiter table, so it used to degrade to info
// and lose the floor to any bark. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createNoFireWatch, NO_FIRE_BARK } from '../src/data/stationBubbles.js';
import { CHANNEL_PRIORITY } from '../src/ui/voiceArbiter.js';

const SEED = 4242;

test('seed 4242: the no-fire bark uses the alert channel, once per entry', () => {
  assert.equal(SEED, 4242);
  assert.ok(CHANNEL_PRIORITY.alert > CHANNEL_PRIORITY.info, 'alert must outrank the info fallback');
  assert.equal(CHANNEL_PRIORITY.warn, undefined, 'warn is not a voice channel');

  const said = [];
  const watch = createNoFireWatch({ say: (msg) => said.push(msg) });
  const station = { id: 'station_helios', pos: { x: 0, z: 0 }, dockRadius: 100, size: 'L', factionId: 'faction_scn' };
  const hit = watch.weaponDrawn({ x: 10, z: 0 }, [station]);
  assert.equal(hit, 'station_helios');
  assert.equal(said.length, 1);
  assert.equal(said[0].channel, 'alert');
  assert.equal(said[0].text, NO_FIRE_BARK);
  assert.equal(CHANNEL_PRIORITY[said[0].channel], CHANNEL_PRIORITY.alert);

  watch.weaponDrawn({ x: 12, z: 0 }, [station]);
  assert.equal(said.length, 1, 'staying inside does not speak again');
});
