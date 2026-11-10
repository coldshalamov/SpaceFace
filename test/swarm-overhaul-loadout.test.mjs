// swarm-overhaul — the Swarm shelf only stocks kit that does something in the fight, and every
// row says in one line what it does. Owner playtest 2026-10-11: a Cargo Scanner on the armory.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { offerDraft, fittingName } from '../src/data/survivalDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';

const DEFS = new Map(WEAPONS.concat(MODULES).map((d) => [d.id, d]));
const ADVENTURE_WORDS = /cargo|market|trade|uplink|drill|prospect|bio-?spectral|biofilm|survey|refin|mining/i;

test('swarm-overhaul: no cargo, mining, market or survey kit reaches the Swarm armory', () => {
  for (const hullId of ['ship_hornet', 'ship_starter']) {
    const result = offerDraft({
      seed: 4242, wave: 1, hullId, fittings: new Array(10).fill(null), pickCount: 0,
      count: 500, ruleset: SWARM_RULESET,
    });
    if (!result.ok) continue;
    assert.ok(result.offers.length > 10, `${hullId} still has a real shelf`);
    for (const offer of result.offers) {
      const def = DEFS.get(offer.defId);
      assert.ok(def, offer.defId);
      assert.notEqual(def.slotType, 'cargo', `${offer.defId} is a hold`);
      assert.notEqual(def.slotType, 'mining', `${offer.defId} is a mining tool`);
      const name = fittingName(offer.defId) || def.name || '';
      assert.equal(ADVENTURE_WORDS.test(name), false, `${name} is adventure kit`);
      const blurb = String(offer.blurb || '').trim();
      assert.ok(blurb.length >= 12, `${name} says what it does (got "${blurb}")`);
    }
  }
});
