// inf-overdrive-mark — the opened overdrive window keeps a persistent mark on the chain hero.
//
// The chain's score cap opens one overdrive window (player guns cycle ×rate while the chain
// holds). The announcer named it once at the cap (inf-overdrive-voice) and then the window left
// no mark anywhere: `chainState().overdrive` had zero UI readers, so for the rest of the window
// nothing on the glass said the gear had changed. The chain hero now carries the window — its
// mix line reads OVERDRIVE · GUNS ×rate (hot, distinct from the amber MIXED badge; the word
// carries the meaning, the color is reinforcement) until the chain breaks, the shatter lands,
// or the run resets.
import test from 'node:test';
import assert from 'node:assert/strict';

import { swarmJuiceHud } from '../src/ui/swarmJuiceHud.js';

function harness() {
  const hud = Object.create(swarmJuiceHud);
  hud._resetModel();
  return hud;
}

test('the opened window marks the hero with its rate until the chain breaks', () => {
  const hud = harness();
  assert.equal(hud._overdriveRate, 0, 'no window, no mark');
  hud._onHeroOverdrive({ active: true, chain: 900, rate: 3 });
  assert.equal(hud._overdriveRate, 3, 'the window rides the receipt');
  hud._onChainBroken({});
  assert.equal(hud._overdriveRate, 0, 'the break spends the window');
});

test('a second opening re-marks; a reset clears; junk payloads fail closed', () => {
  const hud = harness();
  hud._onHeroOverdrive({ active: true, rate: 2 });
  assert.equal(hud._overdriveRate, 2);
  hud._onHeroOverdrive({ active: false });
  assert.equal(hud._overdriveRate, 0, 'an inactive receipt clears the mark');
  hud._onHeroOverdrive({ active: true, rate: Number.NaN });
  assert.equal(hud._overdriveRate, 0, 'a rateless window marks nothing');
  hud._onHeroOverdrive(null);
  assert.equal(hud._overdriveRate, 0);
  hud._onHeroOverdrive({ active: true, rate: 3 });
  hud._resetModel();
  assert.equal(hud._overdriveRate, 0, 'the run reset clears the mark');
});
