// Apply the live content factory to foundry scenes.
// Foundry scenes are lab scenarios, not survival waves. This module refuses to
// invent loc keys or power-axis grants the factory catalog cannot carry.

import {
  FACTORY_SPAWN_DEFAULT_MAX,
  lintRecipeSpawn,
  POWER_AXIS_NAMES,
} from '../../src/contracts/contentFactory.js';
import {
  FACTORY_OVER_CAP_RECIPE,
  FACTORY_WAVE_RECIPE,
} from '../../src/data/contentFactoryExamples.js';

const POWER_KEYS = new Set(POWER_AXIS_NAMES);

export function hostileCount(scene) {
  const bodies = Array.isArray(scene && scene.bodies) ? scene.bodies : [];
  return bodies.filter((body) => body && (body.role === 'hostile' || body.team === 1)).length;
}

export function screenScene(scene) {
  const issues = [];
  if (!scene || typeof scene !== 'object') {
    return { ok: false, issues: [{ rule: 'type', message: 'scene must be an object' }], peak: 0 };
  }
  const peak = hostileCount(scene);
  if (peak > FACTORY_SPAWN_DEFAULT_MAX) {
    issues.push({
      rule: 'spawn.defaultCap',
      message: `hostile count ${peak} exceeds factory default cap ${FACTORY_SPAWN_DEFAULT_MAX}`,
    });
  }
  for (const key of Object.keys(scene)) {
    if (POWER_KEYS.has(key)) {
      issues.push({
        rule: 'powerAxis',
        message: `foundry scene must not grant ${key}`,
      });
    }
  }
  if (scene.rewards && typeof scene.rewards === 'object') {
    issues.push({
      rule: 'powerAxis',
      message: 'foundry scenes do not carry a rewards grant',
    });
  }
  return { ok: issues.length === 0, issues, peak };
}

/** The factory still rejects the shipped over-cap example and accepts the herald pincer. */
export function liveFactorySanity() {
  const over = lintRecipeSpawn(FACTORY_OVER_CAP_RECIPE);
  const herald = lintRecipeSpawn(FACTORY_WAVE_RECIPE);
  return {
    overCapRejected: over.ok === false,
    heraldAccepted: herald.ok === true,
    heraldPeak: herald.peak,
    overPeak: over.peak,
  };
}

/**
 * Foundry output is not merged into SURVIVAL_WAVES.
 * New recipe loc keys would need a contentFactory.js catalog edit, which this campaign does not apply.
 */
export function waveRecipeForScene() {
  return {
    recipe: null,
    reason: 'lab scenario, not a survival wave — loc catalog is closed in src/contracts/contentFactory.js',
  };
}
