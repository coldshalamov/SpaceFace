import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  authoredPreloadPlanForEntity,
  isPackagedLiveWholeShipFile,
  PART_LIBRARY_CONTRACT,
  requiresProductionWholeShipForEntity,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = 'assets/ships/release/parts/';

function packagedReleaseFiles() {
  const pilots = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8'));
  return new Set((pilots.pilots || []).map((pilot) => String(pilot.sourceUrl || '').replace(/\\/g, '/')));
}

function livePlan(entity) {
  return authoredPreloadPlanForEntity(entity, {
    requiredWholeShip: requiresProductionWholeShipForEntity(entity),
  });
}

function planFiles(plan) {
  return Object.values(plan || {}).flat().filter(Boolean);
}

function assertPackaged(files, label, packaged) {
  const missing = files.filter((file) => !packaged.has(`${PART_ROOT}${file}`));
  assert.deepEqual(missing, [], `${label} requested unpackaged live files: ${missing.join(', ')}`);
}

test('every enemy type resolves a packaged live visual plan', () => {
  const packaged = packagedReleaseFiles();
  assert.ok(ENEMY_TYPES.length >= 8, 'enemy roster must stay populated');
  for (const enemy of ENEMY_TYPES) {
    const entity = {
      id: `enemy:${enemy.id}`,
      type: 'ship',
      alive: true,
      data: {
        defId: enemy.shipId,
        lootTableId: enemy.id,
        silhouette: enemy.silhouette || '',
      },
    };
    const files = planFiles(livePlan(entity));
    assert.ok(files.length > 0, `${enemy.id} must select at least one live visual file`);
    assertPackaged(files, enemy.id, packaged);
    const selected = wholeShipVisualForEntity(entity);
    if (selected && selected.file) {
      const lod2 = wholeShipLodFileForEntity(entity, 'lod2');
      if (lod2) {
        assert.ok(
          isPackagedLiveWholeShipFile(lod2) || packaged.has(`${PART_ROOT}${lod2}`),
          `${enemy.id} live LOD2 must stay on a packaged file`,
        );
      }
    }
  }
});

test('every traffic role resolves a packaged live visual plan', () => {
  const packaged = packagedReleaseFiles();
  for (const [roleId, role] of Object.entries(TRAFFIC_ROLES)) {
    const entity = {
      id: `traffic:${roleId}`,
      type: 'ship',
      alive: true,
      data: {
        defId: role.ship,
        trafficRole: roleId,
      },
    };
    const files = planFiles(livePlan(entity));
    assert.ok(files.length > 0, `${roleId} must select at least one live visual file`);
    assertPackaged(files, roleId, packaged);
  }
});

test('47-A reaver actors resolve the packaged Ashline rig', () => {
  const packaged = packagedReleaseFiles();
  for (const assetRef of [
    'enemy_reaver_interceptor',
    'enemy_reaver_skirmisher',
    'enemy_reaver_tug',
  ]) {
    const visual = wholeShipVisualForEntity({
      type: 'ship',
      data: { assetRef, defId: 'ship_hornet' },
    });
    assert.equal(visual.file, 'wholeships/ashline_rig.glb', assetRef);
    assertPackaged([visual.file], assetRef, packaged);
  }
});

test('modular live contract files used by leftover patrol/capital enemies are packaged', () => {
  const packaged = packagedReleaseFiles();
  const leftovers = ENEMY_TYPES.filter((enemy) => !wholeShipVisualForEntity({
    type: 'ship',
    data: { lootTableId: enemy.id, silhouette: enemy.silhouette, defId: enemy.shipId },
  }));
  assert.ok(leftovers.some((enemy) => enemy.id === 'patrol_lawman'));
  assert.ok(leftovers.some((enemy) => enemy.id === 'dreadnought_boss'));
  const shipSlots = ['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod'];
  const allowlisted = new Set(['fins/fin_crystalline.glb']);
  for (const slot of shipSlots) {
    assertPackaged(
      (PART_LIBRARY_CONTRACT.slots[slot] || []).filter((file) => (
        !String(file).startsWith('wholeships/') && !allowlisted.has(file)
      )),
      `modular ${slot}`,
      packaged,
    );
  }
});
