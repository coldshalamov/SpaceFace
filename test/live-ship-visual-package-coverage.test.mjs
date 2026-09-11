import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SHIPS } from '../src/data/ships.js';
import {
  authoredPreloadPlanForEntity,
  isPackagedLiveWholeShipFile,
  PART_LIBRARY_CONTRACT,
  requiresProductionWholeShipForEntity,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

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

test('patrol and capital leftovers publish packaged roster bodies instead of modular kit', () => {
  const packaged = packagedReleaseFiles();
  for (const enemyId of ['patrol_lawman', 'dreadnought_boss']) {
    const enemy = ENEMY_TYPES.find((entry) => entry.id === enemyId);
    assert.ok(enemy, enemyId);
    const entity = {
      type: 'ship',
      data: { lootTableId: enemy.id, silhouette: enemy.silhouette, defId: enemy.shipId },
    };
    const visual = wholeShipVisualForEntity(entity);
    assert.ok(visual && visual.file, `${enemyId} must select a complete packaged body`);
    assert.equal(isPackagedLiveWholeShipFile(visual.file), true, `${enemyId} ${visual.file}`);
    assertPackaged([visual.file], enemyId, packaged);
  }
});

test('modular live contract files remain packaged for accessory assembly', () => {
  const packaged = packagedReleaseFiles();
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

test('all roster hulls and the liner select a shipped render package without modular slots', () => {
  const entities = SHIPS.map((ship) => ({ type: 'ship', data: { defId: ship.id } }));
  entities.push({ type: 'ship', data: { trafficRole: 'express' } });
  assert.equal(SHIPS.length, 13, 'cover the complete lockable roster');
  for (const entity of entities) {
    const label = entity.data.defId || entity.data.trafficRole;
    assert.equal(requiresProductionWholeShipForEntity(entity), true, label);
    const visual = wholeShipVisualForEntity(entity);
    assert.ok(visual, `${label} has a complete body`);
    assert.equal(isPackagedLiveWholeShipFile(visual.file), true, label);
    assert.deepEqual(authoredPreloadPlanForEntity(entity), { hull: [visual.file] }, label);
    const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${visual.file}`);
    assert.ok(pilot, `${label} has a live runtime package route`);
    assert.equal(pilot.runtimeAssetId, visual.assetId, `${label} package identity`);
    const metadataPath = resolve(ROOT, pilot.metadataUrl);
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.assetId, pilot.assetId, `${label} shipped package identity`);
    assert.equal(metadata.runtime.slot, 'hull', label);
    assert.ok(metadata.runtime.primitives.length > 0, `${label} contains renderable surfaces`);
    assert.ok(metadata.runtime.primitives.some((primitive) => /hull|body/i.test(primitive.name)),
      `${label} includes the authored body, not only accessory primitives`);
    const render = readFileSync(resolve(dirname(metadataPath), metadata.render.uri));
    assert.equal(render.length, metadata.render.bytes, `${label} shipped render payload`);
    assert.equal(createHash('sha256').update(render).digest('hex'), metadata.render.sha256,
      `${label} shipped render payload matches its package`);
  }
});
