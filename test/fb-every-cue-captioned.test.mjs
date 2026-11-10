import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  captionForGameplayRecipe,
  isUiBlipRecipe,
} from '../src/ui/captions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('FB-123 — Every gameplay cue the game can play has a caption record', () => {
  const recipeMap = new Map(RECIPES.map(r => [r.id, r]));

  it('skips UI blips without generating gameplay captions', () => {
    const blips = ['sfx_ui_open', 'sfx_ui_back', 'sfx_ui_tab', 'sfx_ui_confirm', 'sfx_ui_error', 'sfx_ui_hover'];
    for (const id of blips) {
      assert.equal(isUiBlipRecipe(id), true, `${id} is recognized as UI blip`);
      assert.equal(captionForGameplayRecipe(id, recipeMap.get(id)), null, `${id} returns null caption`);
    }
  });

  it('resolves explicit semantic captions for combat, refusal, and field cues', () => {
    const checks = [
      { id: 'sfx_refusal_empty', expectedText: 'No ammunition.', expectedUrgency: 'high' },
      { id: 'sfx_refusal_target', expectedText: 'No valid target.', expectedUrgency: 'high' },
      { id: 'sfx_massline_deny', expectedText: 'Action refused.', expectedUrgency: 'high' },
      { id: 'sfx_fuel_reserve', expectedText: 'Fuel reserve.', expectedUrgency: 'warn' },
      { id: 'sfx_kill_noise', expectedText: 'Heavy kill.', expectedUrgency: 'high' },
      { id: 'sfx_cash_register', expectedText: 'Credits received.', expectedUrgency: 'normal' },
      { id: 'sfx_field_loop_well', expectedText: 'Gravity well holding.', expectedUrgency: 'normal' },
    ];

    for (const { id, expectedText, expectedUrgency } of checks) {
      const cap = captionForGameplayRecipe(id, recipeMap.get(id));
      assert.ok(cap, `caption resolved for ${id}`);
      assert.equal(cap.text, expectedText, `text matches for ${id}`);
      assert.equal(cap.urgency, expectedUrgency, `urgency matches for ${id}`);
      assert.equal(cap.recipeId, id);
    }
  });

  it('every gameplay recipe referenced in audioSystem.js resolves to a valid caption record', () => {
    const audioSystemSrc = fs.readFileSync(path.join(ROOT, 'src/audio/audioSystem.js'), 'utf8');
    const regex = /'([a-zA-Z0-9._]+)'/g;
    let match;
    const referenced = new Set();
    while ((match = regex.exec(audioSystemSrc)) !== null) {
      if (recipeMap.has(match[1])) {
        referenced.add(match[1]);
      }
    }

    assert.ok(referenced.size >= 100, `expected at least 100 referenced recipes, found ${referenced.size}`);

    let gameplayCount = 0;
    for (const recipeId of referenced) {
      if (isUiBlipRecipe(recipeId)) continue;
      gameplayCount++;
      const recipe = recipeMap.get(recipeId);
      const cap = captionForGameplayRecipe(recipeId, recipe);
      assert.ok(cap, `caption must resolve for referenced recipe ${recipeId}`);
      assert.equal(typeof cap.text, 'string', `caption text must be string for ${recipeId}`);
      assert.ok(cap.text.length > 0, `caption text must not be empty for ${recipeId}`);
      assert.ok(['high', 'warn', 'normal', 'speech'].includes(cap.urgency), `valid urgency band for ${recipeId}`);
      assert.equal(cap.recipeId, recipeId);
    }

    assert.ok(gameplayCount >= 100, `verified ${gameplayCount} gameplay recipes`);
  });

  it('walks entire RECIPES collection and ensures 100% gameplay coverage', () => {
    for (const recipe of RECIPES) {
      if (isUiBlipRecipe(recipe.id)) continue;
      const cap = captionForGameplayRecipe(recipe.id, recipe);
      assert.ok(cap, `all RECIPES non-blip entries resolve to caption: ${recipe.id}`);
      assert.ok(cap.text.length > 0, `caption text non-empty for ${recipe.id}`);
    }
  });
});
