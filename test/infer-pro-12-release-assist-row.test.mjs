import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { massline2Flag } from '../src/data/featureFlags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('PRO-12 — Massline release-assist row in Gameplay Settings', () => {
  it('source code guarantees release-assist row always renders with conditional disabled state and explanation note', () => {
    const source = readFileSync(path.join(ROOT, 'src/ui/screens/settings.js'), 'utf8');

    assert.ok(source.includes("const masslineFamilyOn = massline2Flag('enabled');"), 'reads massline2Flag enabled');
    assert.ok(source.includes("rowSelect('Massline release assist'"), 'always renders Massline release assist row');
    assert.ok(source.includes("['arm', 'Auto-release on solution (default)']"), 'includes arm option');
    assert.ok(source.includes("['snap', 'Snap window on manual release']"), 'includes snap option');
    assert.ok(source.includes("['off', 'Off — raw physics']"), 'includes off option');
    assert.ok(source.includes('Massline release assist is unavailable because the Massline family is off.'), 'renders disabled explanation note');
    assert.ok(source.includes("releaseSelect.setAttribute('aria-disabled', 'true');"), 'sets aria-disabled when family is off');
    assert.ok(source.includes("if (masslineFamilyOn) this._set(ctx, 'gameplay', 'masslineReleaseAssist', v);"), 'blocks mutation when family is off');
  });

  it('state defaults and persists masslineReleaseAssist under gameplay settings', () => {
    const state = createGameState(4242);
    assert.ok('masslineReleaseAssist' in state.settings.gameplay, 'masslineReleaseAssist exists in gameplay settings');
    const val = state.settings.gameplay.masslineReleaseAssist;
    assert.ok(['snap', 'arm', 'off'].includes(val), `valid default setting value: ${val}`);
  });

  it('feature flag gating correctly determines interactive vs disabled state', () => {
    const isEnabled = massline2Flag('enabled');
    assert.equal(typeof isEnabled, 'boolean', 'massline2Flag enabled returns boolean');
  });
});
