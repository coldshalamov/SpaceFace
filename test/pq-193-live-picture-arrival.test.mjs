import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  PRESENTATION_ADMISSION,
  presentationAllowsTargetLock,
  setPresentationAdmission,
} from '../src/core/presentationAdmission.js';
import { willEntityEnterAuthoredUpgradeRunway } from '../src/render/authoredAdmissionPolicy.js';
import {
  authoredPreloadPlanForEntity,
  isPackagedLiveWholeShipFile,
  REQUIRED_WHOLE_SHIP_DEF_IDS,
  requiresProductionWholeShipForEntity,
  settleAuthoredShipToProceduralFallback,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { PLAYER_RETRO_VOLUME_RECIPE } from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import {
  authoredPrefetchRadius,
  TABLE_REFERENCE_SPEED_WU,
} from '../src/render/tabletopPolicy.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import { cycleTarget } from '../src/ui/uiRoot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROSTER_FILES = Object.freeze({
  ship_kestrel: 'wholeships/kestrel.glb',
  ship_wasp: 'wholeships/wasp_production_v1.glb',
  ship_pelican: 'wholeships/pelican_production_v1.glb',
  ship_mule: 'wholeships/mule_production_v1.glb',
  ship_drifter: 'wholeships/drifter_production_v1.glb',
  ship_hornet: 'wholeships/hornet_production_v1.glb',
  ship_ironback: 'wholeships/ironback_production_v1.glb',
  ship_bastion: 'wholeships/bastion_production_v1.glb',
  ship_atlas: 'wholeships/atlas_production_v1.glb',
  ship_ranger: 'wholeships/ranger_production_v1.glb',
  ship_warden: 'wholeships/warden_production_v1.glb',
  ship_colossus: 'wholeships/colossus_production_v1.glb',
  ship_leviathan: 'wholeships/leviathan_production_v1.glb',
  // The Hawser player hull wears the accepted yard-tug body ambient tug traffic already flies.
  ship_hawser: 'wholeships/yard_tug.glb',
});

const LINER_FILE = 'wholeships/massline_express_liner_v1.glb';
const YARD_TUG_FILE = 'wholeships/yard_tug.glb';

function shipEntity(data, extra = {}) {
  return {
    id: extra.id || `ship:${data.defId || data.trafficRole || 'npc'}`,
    type: 'ship',
    alive: true,
    ...extra,
    data,
  };
}

function planFiles(entity) {
  const required = requiresProductionWholeShipForEntity(entity);
  const plan = authoredPreloadPlanForEntity(entity, { requiredWholeShip: required });
  return Object.values(plan || {}).flat().filter(Boolean);
}

test('all 14 roster hulls and the liner are required packaged-live complete bodies', () => {
  assert.equal(REQUIRED_WHOLE_SHIP_DEF_IDS.length, 14);
  for (const defId of REQUIRED_WHOLE_SHIP_DEF_IDS) {
    const expected = ROSTER_FILES[defId];
    assert.ok(expected, defId);
    const entity = shipEntity({ defId });
    assert.equal(requiresProductionWholeShipForEntity(entity), true, defId);
    const visual = wholeShipVisualForEntity(entity);
    assert.equal(visual && visual.file, expected, defId);
    assert.equal(isPackagedLiveWholeShipFile(visual.file), true, `${defId} packed live`);
    assert.deepEqual(planFiles(entity), [expected], `${defId} must not request modular kit`);
    const lod2 = wholeShipLodFileForEntity(entity, 'lod2');
    if (defId !== 'ship_kestrel') {
      assert.equal(lod2, expected, `${defId} must keep LOD0 instead of unpackaged factory LOD2`);
      assert.equal(isPackagedLiveWholeShipFile(expected.replace('.glb', '_lod1.glb')), false,
        `${defId} factory LOD1 stays off the live allowlist`);
      assert.equal(isPackagedLiveWholeShipFile(expected.replace('.glb', '_lod2.glb')), false,
        `${defId} factory LOD2 stays off the live allowlist`);
    }
  }

  const liner = shipEntity({ defId: 'ship_mule', trafficRole: 'express' });
  assert.equal(requiresProductionWholeShipForEntity(liner), true);
  const linerVisual = wholeShipVisualForEntity(liner);
  assert.equal(linerVisual.file, LINER_FILE);
  assert.equal(isPackagedLiveWholeShipFile(LINER_FILE), true);
  assert.deepEqual(planFiles(liner), [LINER_FILE]);
});

test('opening smuggler, pirate, mule-without-map, and recovery tug select complete bodies', () => {
  const smuggler = shipEntity({ defId: TRAFFIC_ROLES.smuggler.ship, trafficRole: 'smuggler' });
  const pirate = shipEntity({ defId: TRAFFIC_ROLES.pirate.ship, trafficRole: 'pirate' });
  const muleNoMap = shipEntity({ defId: 'ship_mule' });
  const tug = shipEntity({
    defId: 'ship_mule',
    assetRef: 'asset.slice.meridian_recovery_tug',
  });

  const smugglerVisual = wholeShipVisualForEntity(smuggler);
  assert.equal(smugglerVisual.file, ROSTER_FILES.ship_drifter);
  assert.equal(isPackagedLiveWholeShipFile(smugglerVisual.file), true);
  assert.deepEqual(planFiles(smuggler), [ROSTER_FILES.ship_drifter]);

  const pirateVisual = wholeShipVisualForEntity(pirate);
  assert.equal(pirateVisual.file, ROSTER_FILES.ship_wasp);
  assert.equal(isPackagedLiveWholeShipFile(pirateVisual.file), true);
  assert.deepEqual(planFiles(pirate), [ROSTER_FILES.ship_wasp]);

  const muleVisual = wholeShipVisualForEntity(muleNoMap);
  assert.equal(muleVisual.file, ROSTER_FILES.ship_mule);
  assert.deepEqual(planFiles(muleNoMap), [ROSTER_FILES.ship_mule]);

  const tugVisual = wholeShipVisualForEntity(tug);
  assert.equal(tugVisual.file, YARD_TUG_FILE);
  assert.equal(tugVisual.assetId, 'SF_WHOLESHIP_YARD_TUG');
  assert.equal(isPackagedLiveWholeShipFile(YARD_TUG_FILE), true);
  assert.deepEqual(planFiles(tug), [YARD_TUG_FILE]);
});

test('Helios Lark, Span, and Cradle traffic maps stay on the accepted live bodies', () => {
  assert.equal(
    wholeShipVisualForEntity(shipEntity({ defId: 'ship_kestrel', trafficRole: 'courier' })).file,
    'wholeships/helios_lark.glb',
  );
  assert.equal(
    wholeShipVisualForEntity(shipEntity({ defId: 'ship_mule', trafficRole: 'hauler' })).file,
    'wholeships/helios_span.glb',
  );
  assert.equal(
    wholeShipVisualForEntity(shipEntity({ defId: 'ship_pelican', trafficRole: 'miner' })).file,
    'wholeships/helios_cradle.glb',
  );
});

test('empty substrate stays zero-draw; modular fallback never unhides it', () => {
  const fallback = {
    visible: false,
    isObject3D: true,
    userData: { authoredAdmissionSubstrate: true, authoredAdmissionTemporaryDrawables: 0 },
  };
  const boundary = { userData: { renderContract: {} } };
  const settled = settleAuthoredShipToProceduralFallback(
    boundary,
    fallback,
    shipEntity({ defId: 'ship_drifter', trafficRole: 'smuggler' }),
    () => {
      throw new Error('empty substrate must not become a published hull');
    },
  );
  assert.equal(settled, false);
  assert.equal(fallback.visible, false);
  assert.equal(fallback.userData.authoredAdmissionTemporaryDrawables, 0);
});

test('rim-crosser already inside the 4s decode radius starts authored decode at closing-speed <= 1', () => {
  const prefetch = authoredPrefetchRadius(TABLE_REFERENCE_SPEED_WU);
  const player = {
    id: 1,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 40 },
  };
  const crosser = {
    id: 2,
    type: 'ship',
    alive: true,
    radius: 8,
    pos: { x: prefetch * 0.55, z: 0 },
    vel: { x: 0, z: 40 },
    data: { defId: 'ship_hornet', trafficRole: 'pirate' },
  };
  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, crosser]]),
    player: {},
    camera: { zoom: 144, liveZoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
  };
  assert.equal(willEntityEnterAuthoredUpgradeRunway(crosser, state), true);

  const far = {
    ...crosser,
    id: 3,
    pos: { x: prefetch * 2.4, z: 0 },
  };
  state.entities.set(3, far);
  assert.equal(willEntityEnterAuthoredUpgradeRunway(far, state), false);
});

test('a required body that is still pending is not a lockable on-glass target', () => {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const pending = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 40, z: 0 },
    presentationAdmission: PRESENTATION_ADMISSION.pending,
    data: { defId: 'ship_hornet', trafficRole: 'pirate', encounter: true },
  };
  const ready = {
    id: 3,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 80, z: 0 },
    presentationAdmission: PRESENTATION_ADMISSION.ready,
    data: { defId: 'ship_drifter', trafficRole: 'smuggler', encounter: true },
  };
  const state = {
    playerId: 1,
    render: { scene: {} },
    entities: new Map([[1, player], [2, pending], [3, ready]]),
    entityList: [player, pending, ready],
    player: { targetId: null },
  };

  assert.equal(presentationAllowsTargetLock(pending, state), false);
  assert.equal(presentationAllowsTargetLock(ready, state), true);

  cycleTarget(state, 1, { emit() {} });
  assert.equal(state.player.targetId, ready.id);

  setPresentationAdmission(pending, PRESENTATION_ADMISSION.ready);
  assert.equal(presentationAllowsTargetLock(pending, state), true);
});

test('reverse brake is one volumetric retro family with no leftover needle trail stacked on it', () => {
  assert.equal(typeof PLAYER_RETRO_VOLUME_RECIPE.id, 'string');
  assert.ok(PLAYER_RETRO_VOLUME_RECIPE.lengthWU > 0);
  const vfx = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  const start = vfx.indexOf('  _updateRetroVolume(player, actuators, dt, a11y)');
  const end = vfx.indexOf('  _hideEnergyPlumes() {');
  assert.ok(start >= 0 && end > start, 'shipped reverse path must remain in vfx.js');
  const body = vfx.slice(start, end);
  assert.match(body, /PLAYER_RETRO_VOLUME_RECIPE/);
  assert.match(body, /volume\.update\(/);
  assert.equal(body.includes('spawnRetroVenting'), false,
    'leftover reverse-nozzle needle emission must not stack on the volumetric jet');
});
