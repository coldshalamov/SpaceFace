// inf-wreck-burn — a fresh kill burns and smokes; an old battlefield is cold husks.
//
// The sim already stamped wreck entities with the kill time (`data.killedAt`), but the render
// pass never read it: every wreck vented the same pale cold gas whether it was split seconds ago
// or lying there for an hour. Now the wisp cadence reads the sim's own stamp and shapes three
// aftermath states — open flame, guttering smoke, cold vent — so the fight you just fought reads
// as a place where something died. Unstamped wrecks are authored set dressing and stay cold.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WRECK_BURN_S,
  WRECK_COOL_S,
  resolveWreckAgeS,
  wreckBurnPicture,
} from '../src/render/vfx/wreckAftermathState.js';

test('the kill stamp gives the wreck an age; an unstamped wreck stays cold', () => {
  assert.equal(resolveWreckAgeS({ killedAt: 1000 }, 1005), 5);
  assert.equal(resolveWreckAgeS({ bornAt: 1000, killedAt: 990 }, 1005), 5, 'latest stamp wins');
  assert.equal(resolveWreckAgeS({ debrisHotT0: 1002, killedAt: 990 }, 1005), 3);
  assert.equal(resolveWreckAgeS({}, 1005), -1, 'no stamp: authored set dressing');
  assert.equal(resolveWreckAgeS(null, 1005), -1);
  assert.equal(resolveWreckAgeS({ killedAt: 0 }, 1005), -1, 'a zero stamp is no stamp');
  // A stamp from the "future" (clock skew, save/load) never yields a negative age.
  assert.equal(resolveWreckAgeS({ killedAt: 2000 }, 1005), 0);
});

test('the picture is open flame through WRECK_BURN_S, then gutters out to cold', () => {
  const out = { burn: -1, smoke: -1, vent: -1 };
  wreckBurnPicture(0, out);
  assert.equal(out.burn, 1, 'a fresh kill burns at full gain');
  assert.equal(out.vent, 1, 'the pressure vent never stops');
  assert.ok(out.smoke > 0.5, 'hot metal smokes hard while it burns');

  wreckBurnPicture(WRECK_BURN_S - 1, out);
  assert.equal(out.burn, 1, 'flame holds through the burn window');

  wreckBurnPicture(WRECK_BURN_S + 0.01, out);
  const hotGutter = out.burn;
  assert.ok(hotGutter < 1 && hotGutter > 0.9, 'the fire starts guttering right after the window');
  wreckBurnPicture((WRECK_BURN_S + WRECK_COOL_S) / 2, out);
  const midGutter = out.burn;
  wreckBurnPicture(WRECK_COOL_S + 0.01, out);
  assert.equal(out.burn, 0, 'by WRECK_COOL_S the last ember is cold');
  assert.ok(hotGutter > midGutter, 'cooling is monotonic downward');

  wreckBurnPicture(-1, out);
  assert.equal(out.burn, 0, 'an unknown age draws no flame');
  assert.equal(out.smoke, 0);
  assert.equal(out.vent, 1);
});

test('smoke outlives nothing: it never rises and never outlives the cooling window', () => {
  const out = { burn: 0, smoke: 0, vent: 0 };
  let prev = Infinity;
  for (let age = 0; age <= WRECK_COOL_S; age += 5) {
    wreckBurnPicture(age, out);
    assert.ok(out.smoke <= prev + 1e-9, `smoke must decay monotonically at age ${age}`);
    prev = out.smoke;
    assert.ok(out.smoke >= 0 && out.smoke <= 1, 'smoke gain stays a 0..1 gain');
  }
  wreckBurnPicture(WRECK_COOL_S + 5, out);
  assert.equal(out.smoke, 0, 'a cold husk does not smoke');
});

test('the live wisp owner consumes the sim stamp and shapes the burn at the breach', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /resolveWreckAgeS\(e\.data, simTime\)/,
    'the wisp cadence reads the wreck entity own kill stamp');
  assert.match(vfx, /wreckBurnPicture\(ageS, _wreckBurnScratch\)/);
  // The burn family draws at the breach and the cold vent is unchanged.
  assert.match(vfx, /Open flame: a combustion body licking out along the breach azimuth/);
  assert.match(vfx, /'#cfe8ff'/, 'the pale pressure vent keeps its original read');
  // The module documents that unstamped wrecks stay cold.
  const state = readFileSync(new URL('../src/render/vfx/wreckAftermathState.js', import.meta.url), 'utf8');
  assert.match(state, /authored set dressing and stays cold/);
});
