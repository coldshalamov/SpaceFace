import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { CLAIM_RAID_WARNING_GAIN, audio } from '../src/audio/audioSystem.js';

test('a claim raid warning plays the wanted alert once at the low gain and does not duck', () => {
  const recipe = RECIPES.find((entry) => entry.id === 'sfx_wanted_alert');
  assert.ok(recipe, 'the wanted-alert recipe already exists');
  assert.ok(CLAIM_RAID_WARNING_GAIN < recipe.gainMult, 'raid warning sits under the heat voice');
  assert.equal(CLAIM_RAID_WARNING_GAIN, 0.35);

  const played = [];
  const host = Object.create(audio);
  host.play = (id, opts) => { played.push({ id, ...opts }); return null; };
  host._duckMusic = () => { played.push({ id: 'duck' }); };

  host._onClaimRaidWarning(null);
  assert.equal(played.length, 0, 'a missing warning does not speak');

  host._onClaimRaidWarning({ bodyId: 'claim-a', bastionId: 'bastion-a', sectorId: 'sector_helios_prime' });
  assert.equal(played.length, 1);
  assert.equal(played[0].id, 'sfx_wanted_alert');
  assert.equal(played[0].gain, CLAIM_RAID_WARNING_GAIN);
  assert.equal(played.some((row) => row.id === 'duck'), false);

  host._onClaimRaidWarning({ bodyId: 'claim-b', bastionId: 'bastion-a', sectorId: 'sector_helios_prime' });
  assert.equal(played.length, 2, 'each warning plays once');
});
