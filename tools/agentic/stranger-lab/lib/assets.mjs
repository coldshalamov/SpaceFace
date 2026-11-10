// Headless essential-body check. No GPU. A required ship or enemy id fails when its
// packaged release file is absent. Asteroids and stations are not ship bodies.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENEMY_TYPES } from '../../../../src/data/enemies.js';
import { resolveEntityProfile } from '../../../../src/testing/lab/entityProfiles.js';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));

// Packaged files named by src/render/partsLibrary.js. Existence is the check.
const RELEASE_FILE = Object.freeze({
  ship_kestrel: 'assets/ships/release/parts/wholeships/kestrel.glb',
  ship_wasp: 'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  wasp_swarmer: 'assets/ships/release/parts/wholeships/ashline_dart.glb',
  lancer_sniper: 'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
});

export function checkEssentialBodies(journey) {
  const required = [];
  for (const entity of journey.entities || []) {
    let profile = null;
    try {
      profile = resolveEntityProfile(entity.profile);
    } catch {
      profile = null;
    }
    if (!profile) continue;
    if (profile.shipId) required.push(profile.shipId);
    if (profile.enemyTypeId) {
      required.push(profile.enemyTypeId);
      const enemy = ENEMY_BY_ID.get(profile.enemyTypeId);
      if (enemy && enemy.shipId) required.push(enemy.shipId);
    }
  }
  const unique = [...new Set(required)];
  const missing = unique.filter((id) => {
    const relative = RELEASE_FILE[id];
    return !relative || !existsSync(join(ROOT, relative));
  });
  if (!unique.length) {
    return {
      essentialModelCheck: 'passed',
      required: unique,
      missing,
      detail: 'This route has no ship body to resolve.',
    };
  }
  if (missing.length) {
    return {
      essentialModelCheck: 'failed',
      required: unique,
      missing,
      detail: `essential body missing from the release tree: ${missing.join(', ')}`,
    };
  }
  return {
    essentialModelCheck: 'passed',
    required: unique,
    missing,
    detail: 'Packaged release files exist for every required ship body.',
  };
}
