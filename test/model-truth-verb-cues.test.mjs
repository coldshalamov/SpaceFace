import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RECIPES } from '../src/data/audioRecipes.js';
import { PLAYER_ACTION_CUES, combatVerbCueRow } from '../src/audio/combatVerbCues.js';

const recipeIds = new Set(RECIPES.map((recipe) => recipe.id));
const interesting = /mining:|scrape|boost|jump|alarm|payout|hail|tether:|dock:|combat:fire|combat:shove|projectile:|shield|wanted|credits:|gate:|cruise:|shove|latch|undock|salvage:|drill:|fields:hitch/i;

function emitsInSystems() {
  const names = new Set();
  const dir = join(import.meta.dirname, '../src/systems');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    for (const match of text.matchAll(/\.emit\(\s*'([^']+)'/g)) names.add(match[1]);
  }
  return [...names].filter((name) => interesting.test(name));
}

test('every player-caused gameplay emit has a recipe or a silent reason', () => {
  const names = emitsInSystems();
  assert.ok(names.length > 20);
  for (const name of names) {
    const row = combatVerbCueRow(name) || (PLAYER_ACTION_CUES[name] ? combatVerbCueRow(name) : null);
    assert.ok(row, name);
    if (row.recipe === 'SILENT') {
      assert.equal(typeof row.reason, 'string');
      assert.ok(row.reason.length > 8, name);
      assert.equal(row.reason.includes('\n'), false);
    } else {
      assert.equal(recipeIds.has(row.recipe), true, `${name} ${row.recipe}`);
    }
  }
  for (const verb of ['mining:seamHit', 'mining:yield', 'ship:boostStart', 'jump:start', 'credits:changed', 'contactHail:offer', 'tether:latched']) {
    assert.ok(combatVerbCueRow(verb), verb);
  }
});
