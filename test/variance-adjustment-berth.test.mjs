import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { createNodeProductionSystemLookup } from '../src/runtime/nodeSystemFactoryTable.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { varianceAdjustmentBerth, varianceAdjustmentBerthPosition } from '../src/systems/varianceAdjustmentBerth.js';
import { drainDeferredEnterMaterializers } from '../src/core/sectorEnterDefer.js';
import { VARIANCE_ADJUSTMENT_BERTH as VA } from '../src/data/varianceAdjustmentBerth.js';
import { SLATE_COLUMN } from '../src/data/slate.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector, sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import {
  collisionProxyIdForStation,
  resolveCollisionProxyManifest,
  proxyOuterRadiusWu,
} from '../src/data/collisionProxyManifests.js';
import { ensurePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';

// partsLibrary.js has a broad visual-module graph. Run the exact PR-head selector
// declarations from the saved exact-base source with inert unrelated identity
// predicates, while using the existing generated render-package manifest for the
// one packaged-file gate this actor reaches. This keeps the renderer proof tied to
// the shipping selector text without materializing its unrelated visual graph.
const partsUrl = new URL('../src/render/partsLibrary.js', import.meta.url);
const partsSource = typeof globalThis.__spacefaceReadTestSource === 'function'
  ? globalThis.__spacefaceReadTestSource('src/render/partsLibrary.js')
  : readFileSync(partsUrl, 'utf8');
const { RENDER_PACKAGE_PILOTS } = await import('../src/render/renderPackageManifest.js');

function declaration(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `exact shipping source contains ${marker}`);
  const lineEnd = source.indexOf('\n', start);
  const open = source.lastIndexOf('{', lineEnd < 0 ? source.length : lineEnd);
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1).replace(/^export\s+/, '');
  }
  throw new Error(`unterminated declaration ${marker}`);
}

function objectConstant(name) {
  const marker = `const ${name} = Object.freeze({`;
  const start = partsSource.indexOf(marker);
  assert.notEqual(start, -1, `exact shipping source contains ${name}`);
  const open = partsSource.indexOf('{', start + marker.length - 1);
  let depth = 0;
  let quote = null;
  for (let i = open; i < partsSource.length; i++) {
    const c = partsSource[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) {
      const body = partsSource.slice(open, i + 1);
      const entries = [...body.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)];
      return Object.fromEntries(entries.map((match) => [match[1], match[2]]));
    }
  }
  throw new Error(`unterminated object ${name}`);
}

const requiredBlock = partsSource.match(/export const REQUIRED_WHOLE_SHIP_DEF_IDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(requiredBlock, 'exact shipping source declares required whole-ship IDs');
const requiredDefs = new Set([...requiredBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
const packagedFiles = new Set(RENDER_PACKAGE_PILOTS
  .filter((pilot) => pilot.sourceUrl.startsWith('assets/ships/release/parts/wholeships/'))
  .map((pilot) => pilot.sourceUrl.slice('assets/ships/release/parts/'.length)));
const identityFunctions = [
  'salvageTenderRequiresAuthoredHull', 'isKilnbackEntity', 'isScissorwakeEntity',
  'isTowlineCrewEntity', 'isIlexArkEntity', 'isRedKiteEntity', 'isSableVennEntity',
  'ceresWorkfleetRole',
];
const identityStubs = Object.fromEntries(identityFunctions.map((name) => [name, () => false]));
const isRequired = new Function('__d', `const { ${[...identityFunctions,
  'REQUIRED_WHOLE_SHIP_DEF_ID_SET', 'REQUIRED_WHOLE_SHIP_TRAFFIC_ROLES',
  'REQUIRED_WHOLE_SHIP_ASSET_REFS'].join(', ')} } = __d;\n`
  + `${declaration(partsSource, 'export function requiresProductionWholeShipForEntity(entity)')}; return requiresProductionWholeShipForEntity;`)({
  ...identityStubs,
  REQUIRED_WHOLE_SHIP_DEF_ID_SET: requiredDefs,
  REQUIRED_WHOLE_SHIP_TRAFFIC_ROLES: new Set(),
  REQUIRED_WHOLE_SHIP_ASSET_REFS: new Set(),
});
const isPackaged = new Function('PACKAGED_LIVE_WHOLE_SHIP_FILES',
  `${declaration(partsSource, 'export function isPackagedLiveWholeShipFile(file)')}; return isPackagedLiveWholeShipFile;`)(packagedFiles);
const isPackagedForSelection = new Function('PACKAGED_LIVE_WHOLE_SHIP_FILES',
  `${declaration(partsSource, 'function packagedLiveWholeShipFile(file)')}; return packagedLiveWholeShipFile;`)(packagedFiles);
const makeSelection = new Function('packagedLiveWholeShipFile', 'wholeShipSelection', 'WHOLE_SHIP_LOD_FAMILY_BY_FILE',
  `${declaration(partsSource, 'function liveWholeShipSelection(file, assetId, roleId, lodFamily = null)')}; return liveWholeShipSelection;`)(
  isPackagedForSelection, (file, assetId, roleId, lodFamily) => ({ file, assetId, roleId, lodFamily }), {});
const selectorDependencies = [
  'salvageTenderWholeShipVisual', 'isLastArgument', 'LAST_ARGUMENT_SPEC',
  'isPalletJackEntity', 'isMothlightTender', 'isKilnbackEntity', 'isScissorwakeEntity',
  'isTowlineCrewEntity', 'isIlexArkEntity', 'isRedKiteEntity', 'isSableVennEntity',
  'ceresWorkfleetRole', 'CERES_BREAKER_FILE', 'CERES_BREAKER_ASSET',
  'WHOLE_SHIP_FILE_BY_HOSTILE_ID', 'WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID',
  'WHOLE_SHIP_FILE_BY_SILHOUETTE', 'WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE',
  'WHOLE_SHIP_FILE_BY_ASSET_REF', 'WHOLE_SHIP_ASSET_ID_BY_ASSET_REF',
  'WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE', 'WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE',
  'WHOLE_SHIP_FILE_BY_DEF_ID', 'WHOLE_SHIP_ASSET_ID_BY_DEF_ID',
  'WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID', 'applyFactionWholeShipKit',
  'liveWholeShipSelection', 'requiresProductionWholeShipForEntity',
];
const selectorContext = Object.fromEntries(selectorDependencies.map((name) => [name, () => false]));
Object.assign(selectorContext, {
  salvageTenderWholeShipVisual: () => null,
  LAST_ARGUMENT_SPEC: {},
  ceresWorkfleetRole: () => null,
  CERES_BREAKER_FILE: '',
  CERES_BREAKER_ASSET: '',
  WHOLE_SHIP_FILE_BY_HOSTILE_ID: {},
  WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID: {},
  WHOLE_SHIP_FILE_BY_SILHOUETTE: {},
  WHOLE_SHIP_ASSET_ID_BY_SILHOUETTE: {},
  WHOLE_SHIP_FILE_BY_ASSET_REF: {},
  WHOLE_SHIP_ASSET_ID_BY_ASSET_REF: {},
  WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE: {},
  WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE: {},
  WHOLE_SHIP_FILE_BY_DEF_ID: objectConstant('WHOLE_SHIP_FILE_BY_DEF_ID'),
  WHOLE_SHIP_ASSET_ID_BY_DEF_ID: objectConstant('WHOLE_SHIP_ASSET_ID_BY_DEF_ID'),
  WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID: {},
  applyFactionWholeShipKit: (entity, selection) => selection,
  liveWholeShipSelection: makeSelection,
  requiresProductionWholeShipForEntity: isRequired,
});
const chooseWholeShip = new Function('__d', `const { ${selectorDependencies.join(', ')} } = __d;\n`
  + `${declaration(partsSource, 'export function wholeShipVisualForEntity(entity, options = {})')}; return wholeShipVisualForEntity;`)(selectorContext);

function runtime({ budgetMax = 24, runKind = 'adventure' } = {}) {
  const state = createGameState(4242);
  state.world.currentSectorId = VA.sectorId;
  state.run = { ...(state.run || {}), kind: runKind };
  state.story = { ...(state.story || {}), flags: {} };
  state.spawnBudget = { max: budgetMax };
  const sim = createSimulation({
    state,
    systems: [spawnBudget, varianceAdjustmentBerth],
    updateOrder: [],
  });
  return { sim, state, bus: sim.bus, helpers: sim.helpers, owner: sim.registry.get('varianceAdjustmentBerth') };
}

// Small pure geometry fixture for lifecycle tests that do not claim authored world proof.
function ringHubFixtureStationSpec() {
  const anchor = sectorLocalToGlobalForSector({ x: -820, z: 280 }, VA.sectorId, {});
  const origin = sectorGlobalOrigin(VA.sectorId);
  const bearing = Math.atan2(origin.z - anchor.z, origin.x - anchor.x) * 180 / Math.PI;
  return {
    type: 'station', factionId: 'faction_dmc', pos: anchor, rot: 0,
    radius: 26, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
    data: {
      stationId: VA.stationId, dockRadius: 60, collisionProxy: 'station_ring_hub',
      corridorBearingDeg: bearing, sectorId: VA.sectorId, homeSectorId: VA.sectorId,
      services: ['repair', 'refine'],
    },
  };
}

// Mirrors the production-relevant `_spawnStations` fields using the merged authored sector and
// anchor records, rather than a hand-copied ring-hub station. The world owner supplies these
// normalized scale/type/archetype fields before collision-proxy resolution.
function productionForgeStationSpec() {
  const sector = SECTORS.find((row) => row.id === VA.sectorId);
  const stationRow = sector?.stations?.find((row) => row.id === VA.stationId);
  assert.ok(stationRow?.pos, 'authored Vesta Forge anchor resolves for the Outlying Yard');
  const size = stationRow.size || 'M';
  const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
  const collisionRadius = size === 'L' ? 42 : size === 'S' ? 26 : 34;
  const pos = sectorLocalToGlobalForSector(stationRow.pos, sector.id, {});
  const origin = sectorGlobalOrigin(sector.id);
  const corridorBearingDeg = Math.atan2(origin.z - pos.z, origin.x - pos.x) * 180 / Math.PI;
  const factionId = stationRow.factionId || sector.factionId;
  const collisionProxy = collisionProxyIdForStation(stationRow.id) || 'station_ring_hub';
  return {
    type: 'station', factionId, pos,
    radius: collisionRadius, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
    data: {
      stationId: stationRow.id,
      stationTypeId: stationRow.type,
      dockRadius,
      placeScale: dockRadius / 14,
      collisionRadius,
      collisionProxy,
      corridorBearingDeg,
      services: stationRow.services || [],
      factionId,
      name: stationRow.name,
      size,
      chartNote: stationRow.chartNote || null,
      contested: !!stationRow.contested,
      repGated: !!stationRow.repGated,
      sectorId: sector.id,
      homeSectorId: sector.id,
      archetypeGlb: stationRow.archetypeGlb || null,
      landmark: !!stationRow.landmark,
      landmarkGlb: stationRow.landmarkGlb || null,
    },
  };
}

function actors(state) {
  return [...state.entities.values()].filter((entity) => entity?.data?.varianceAdjustmentId === VA.actorId);
}

function enterForge(bus, extra = {}) {
  bus.emit('sector:enter', { sectorId: VA.sectorId, ...extra });
}

test('main and worker registries initialize the event-only owner without a clock slot', () => {
  const lookup = createNodeProductionSystemLookup({});
  assert.equal(PRODUCTION_INIT_ORDER.includes('varianceAdjustmentBerth'), true);
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('varianceAdjustmentBerth'), false);
  assert.equal(lookup.get('varianceAdjustmentBerth'), varianceAdjustmentBerth);
});

test('ring-hub fixture: deferred Forge entry waits for the cook provider and teardown removes its queue entry', () => {
  const h = runtime();
  h.sim.spawn(ringHubFixtureStationSpec());
  h.state.world.enterSerial = 23;
  h.state.render.sectorEnterCookWillRun = () => true;
  enterForge(h.bus, { enterEpoch: 23 });
  assert.equal(actors(h.state).length, 0, 'the emitter does not scan an unfinished deferred cohort');
  const queue = h.state.render.deferredEnterMaterializers;
  assert.equal(queue.length, 1);
  assert.ok(h.helpers.sectorCookProviders.includes(h.owner._cookProvider));
  drainDeferredEnterMaterializers(h.state, { id: VA.sectorId });
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 1,
    'the real sector-enter queue drives the bounded reconciliation after materialization');
  assert.equal(queue.length, 0);
  h.owner.destroy();
  h.sim.dispose();

  const tornDown = runtime();
  tornDown.sim.spawn(ringHubFixtureStationSpec());
  tornDown.state.world.enterSerial = 24;
  tornDown.state.render.sectorEnterCookWillRun = () => true;
  enterForge(tornDown.bus, { enterEpoch: 24 });
  const pendingQueue = tornDown.state.render.deferredEnterMaterializers;
  assert.equal(pendingQueue.length, 1);
  tornDown.owner.destroy();
  assert.equal(pendingQueue.length, 0, 'destroy drops this owner’s queued provider');
  assert.equal(tornDown.helpers.sectorCookProviders.includes(tornDown.owner._cookProvider), false);
  assert.equal(actors(tornDown.state).length, 0);
  tornDown.sim.dispose();
});

test('production Forge anchor and station manifest admit a clear moored yard tug berth', () => {
  const h = runtime();
  const stationSpec = productionForgeStationSpec();
  assert.equal(stationSpec.data.collisionProxy,
    collisionProxyIdForStation(VA.stationId) || 'station_ring_hub');
  const station = h.sim.spawn(stationSpec);
  const forge = SECTORS.find((row) => row.id === VA.sectorId);
  const yardRow = forge.stations.find((row) => row.id === VA.stationId);
  const globalStation = sectorLocalToGlobalForSector(yardRow.pos, VA.sectorId, {});
  assert.deepEqual({ x: station.pos.x, z: station.pos.z }, globalStation);
  assert.equal(station.data.stationTypeId, 'fab');
  assert.equal(station.data.size, 'S');
  assert.equal(station.data.dockRadius, 60);
  assert.equal(station.data.placeScale, 60 / 14);
  assert.equal(station.data.collisionRadius, 26);
  assert.equal(station.data.archetypeGlb, 'place_station_fab');
  assert.equal(station.data.collisionProxy, 'skin:place_station_fab',
    'body normalization adopts the measured authored fab-station skin');
  const authoredManifest = resolveCollisionProxyManifest(station);
  assert.equal(authoredManifest?.id, 'skin:place_station_fab',
    'the live resolver replaces the declared ring fallback with the measured fab-station skin');
  assert.ok(proxyOuterRadiusWu(authoredManifest, station) > 0,
    'the authored scale and archetype resolve to a live production proxy envelope');
  const expected = varianceAdjustmentBerthPosition(h.state, station);
  assert.ok(expected, 'the production Forge proxy leaves at least one valid bounded berth');

  // The production entity:spawned event is raised during station materialization. The owner
  // waits for the world's later, settled sector:enter tail before scanning the complete sector.
  assert.equal(actors(h.state).length, 0);
  enterForge(h.bus);
  const actor = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(actor, 'the station-enter lifecycle creates the inspection actor');
  assert.equal(actor.data.defId, 'ship_hawser');
  assert.equal(actor.data.hullDefId, 'ship_hawser');
  assert.equal(actor.data.varianceAdjustmentId, VA.actorId);
  assert.equal(actor.data.worldRecordId, VA.worldRecordId);
  assert.equal(actor.data.identityKey, VA.identityKey);
  assert.equal(actor.data.persistenceOwner, VA.persistenceOwner);
  assert.equal(actor.isPlayer, false);
  assert.equal(actor.data.trafficRole, undefined);
  assert.equal(actor.data.jobId, undefined);
  assert.equal(actor.data.ai, null);
  assert.equal(actor.data.intent, null);
  assert.deepEqual(actor.data.weapons, []);
  assert.equal(actor.flags?.invuln, true);
  assert.equal(actor.data.masslineTetherable, false);
  assert.equal(h.state.player.activeShipIndex, 0);
  assert.deepEqual(h.state.player.ownedShips, []);
  assert.equal(h.helpers.spawnBudget.ownerForEntity(actor.id), VA.worldRecordId);
  assert.equal(h.helpers.spawnBudget.current(), 1);

  const liveStation = h.state.entities.get(station.id);
  const manifest = resolveCollisionProxyManifest(liveStation);
  const outer = proxyOuterRadiusWu(manifest, liveStation);
  const mouth = manifest.docking.corridor.mouthRadius * outer;
  const berthDistance = Math.hypot(actor.pos.x - liveStation.pos.x, actor.pos.z - liveStation.pos.z);
  assert.ok(berthDistance - VA.hullRadiusWu > mouth, 'the full hull clears the approach mouth');
  const column = sectorLocalToGlobalForSector(SLATE_COLUMN.pos, SLATE_COLUMN.sectorId, {});
  const pillarSeparation = Math.hypot(actor.pos.x - column.x, actor.pos.z - column.z);
  assert.ok(pillarSeparation >= SLATE_COLUMN.readRadius + VA.hullRadiusWu + VA.slateColumnMarginWu,
    'the berth leaves Slate’s physical pillar read ring clear');
  assert.deepEqual({ x: actor.pos.x, z: actor.pos.z }, expected.pos);
  assert.equal(Math.hypot(-760 - SLATE_COLUMN.pos.x, 340 - SLATE_COLUMN.pos.z) <= SLATE_COLUMN.readRadius, true,
    'raw local pillar coordinates are distinct from Forge’s global sector coordinates');

  ensurePhysicsBodySpec(actor);
  assert.equal(actor.physicsBody.dynamic, false, 'authored mooring survives body normalization');
  assert.equal(isDynamicPhysicsBodyEntity(actor), false);

  const visual = chooseWholeShip(actor);
  assert.equal(visual.file, 'wholeships/yard_tug.glb');
  assert.equal(visual.assetId, 'SF_WHOLESHIP_YARD_TUG');
  assert.equal(isPackaged(visual.file), true, 'the selected tug is in the live render-package set');
  const tugPilot = RENDER_PACKAGE_PILOTS.find((pilot) => pilot.sourceUrl.endsWith(`/${visual.file}`));
  assert.equal(tugPilot?.runtimeAssetId, visual.assetId,
    'the generated package manifest declares the same embedded whole-ship asset ID');
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: blocked berth waits for a real destroy receipt, then settles without a tick census', () => {
  const h = runtime();
  const station = h.sim.spawn(ringHubFixtureStationSpec());
  const blockers = [];
  for (let i = 0; i < 4; i++) {
    const berth = varianceAdjustmentBerthPosition(h.state, station);
    if (!berth) break;
    blockers.push(h.sim.spawn({
      type: 'ship', team: 2, radius: VA.hullRadiusWu, mass: 68,
      pos: berth.pos, vel: { x: 0, z: 0 }, collides: true,
      data: { defId: 'ship_hawser', hullDefId: 'ship_hawser' },
    }));
  }
  assert.ok(blockers.length >= 1, 'the source-backed deterministic candidate list is nonempty');
  assert.equal(varianceAdjustmentBerthPosition(h.state, station), null, 'all clear candidate slots are occupied');
  enterForge(h.bus);
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 0);
  assert.equal(h.helpers.spawnBudget.current(), 0, 'a blocked berth does not reserve a ship slot');

  const blocker = blockers[0];
  h.helpers.removeEntity(blocker.id, { immediate: true, reason: 'test_clear_berth' });
  h.sim.step(); // core.lifetimeSweep emits the real queued entity:destroyed receipt
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 1,
    'the destruction receipt wakes one bounded retry');
  assert.equal(h.helpers.spawnBudget.current(), 1);
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: budget exhaustion waits for the production entity teardown receipt', () => {
  const h = runtime({ budgetMax: 1 });
  const budgetBlocker = h.sim.spawn({
    type: 'ship', team: 2, radius: 22, mass: 68, pos: { x: 4000, z: 4000 },
    data: { defId: 'ship_hawser' },
  });
  assert.equal(h.helpers.spawnBudget.request(1, 'other-owner'), 1);
  assert.equal(h.helpers.spawnBudget.bindEntity(budgetBlocker.id, 'other-owner'), true);
  h.sim.spawn(ringHubFixtureStationSpec());
  enterForge(h.bus);
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 0);
  assert.equal(h.helpers.spawnBudget.current(), 1);

  h.helpers.removeEntity(budgetBlocker.id, { immediate: true, reason: 'test_release_budget' });
  h.sim.step();
  const actor = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(actor, 'core queues entity:destroyed and spawnBudget releases before the scene retries');
  assert.equal(h.helpers.spawnBudget.ownerForEntity(actor.id), VA.worldRecordId);
  assert.equal(h.helpers.spawnBudget.current(), 1);
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: save-loaded lifecycle keeps one canonical identity; dead and recycled IDs fail closed', () => {
  const h = runtime();
  h.sim.spawn(ringHubFixtureStationSpec());
  enterForge(h.bus);
  const actor = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(actor);

  const duplicate = h.sim.spawn({
    type: 'ship', team: actor.team, factionId: actor.factionId, isPlayer: false,
    pos: { ...actor.pos }, rot: actor.rot, radius: VA.hullRadiusWu, mass: 1e6,
    vel: { x: 0, z: 0 }, physicsBody: { dynamic: false, shape: 'ball', radius: VA.hullRadiusWu },
    flags: { invuln: true, persistent: true },
    data: { ...actor.data, ai: null, intent: null, weapons: [] },
  });
  h.bus.emit('save:restoring', {});
  h.bus.emit('save:loaded', {});
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 1);
  assert.equal(h.helpers.spawnBudget.current(), 1);
  assert.equal(h.helpers.spawnBudget.ownerForEntity(actor.id), VA.worldRecordId);
  assert.ok(duplicate.alive === false || duplicate.id !== actor.id);

  const lostBefore = h.state.story.flags[VA.storyFlags.lost];
  h.helpers.removeEntity(actor.id, { immediate: true, reason: 'recycled_id_case' });
  const unrelated = h.sim.spawn({
    id: actor.id, type: 'ship', team: 2, radius: 6, mass: 20,
    pos: { x: 9000, z: 9000 }, data: { defId: 'ship_hawser', trafficRole: 'tug' },
  });
  h.sim.step();
  assert.equal(h.state.entities.get(actor.id), unrelated, 'the old identity receipt cannot touch a recycled id');
  assert.equal(h.state.story.flags[VA.storyFlags.lost], lostBefore,
    'a stale destruction receipt does not record loss for the new occupant');
  assert.equal(unrelated.alive, true);
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: late old-world destroy receipt after save:loaded cannot lose a new restored actor', () => {
  const h = runtime();
  h.sim.spawn(ringHubFixtureStationSpec());
  enterForge(h.bus);
  const oldActor = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(oldActor);
  const destroyed = [];
  h.bus.on('entity:destroyed', (payload) => destroyed.push(payload));

  h.bus.emit('save:restoring', {});
  h.helpers.removeEntity(oldActor.id, { immediate: true, reason: 'restore_outgoing_world' });
  assert.equal(destroyed.length, 0, 'core queues the destruction receipt until its lifecycle drain');
  const replacementId = Number(oldActor.id) + 100000;
  const savedActor = structuredClone(oldActor);
  delete savedActor.id;
  delete savedActor.prevPos;
  savedActor.alive = true;
  const newActor = h.sim.spawn({ ...savedActor, id: replacementId });
  assert.notEqual(newActor.id, oldActor.id);

  h.bus.emit('save:loaded', {});
  assert.equal(h.helpers.spawnBudget.ownerForEntity(newActor.id), VA.worldRecordId,
    'the new canonical actor is rebound after the loaded event');
  assert.equal(h.state.story.flags[VA.storyFlags.lost], undefined);
  h.sim.step();

  assert.equal(destroyed.length, 1, 'the real queued core receipt arrives after save:loaded');
  assert.equal(destroyed[0].entity, oldActor);
  assert.equal(h.state.entities.get(newActor.id), newActor);
  assert.equal(newActor.alive, true);
  assert.equal(h.state.story.flags[VA.storyFlags.lost], undefined,
    'retired pre-restore object refs cannot mark the replacement scene lost');
  assert.equal(h.helpers.spawnBudget.ownerForEntity(newActor.id), VA.worldRecordId);
  assert.equal(h.helpers.spawnBudget.current(), 1);
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: dead restored identity is not rebound, and non-Adventure sectors stay empty', () => {
  const dead = runtime();
  const stale = {
    id: 900, type: 'ship', alive: false, isPlayer: false,
    data: {
      varianceAdjustmentId: VA.actorId, worldRecordId: VA.worldRecordId,
      identityKey: VA.identityKey, persistenceOwner: VA.persistenceOwner,
      defId: VA.shipDefId, hullDefId: VA.hullDefId,
    },
  };
  dead.state.entities.set(stale.id, stale);
  dead.state.entityList.push(stale);
  dead.sim.spawn(ringHubFixtureStationSpec());
  enterForge(dead.bus);
  assert.equal(actors(dead.state).filter((entity) => entity.alive !== false).length, 0);
  assert.equal(dead.state.story.flags[VA.storyFlags.lost], true);
  assert.equal(dead.helpers.spawnBudget.current(), 0);
  dead.owner.destroy();
  dead.sim.dispose();

  const otherMode = runtime({ runKind: 'survival' });
  otherMode.sim.spawn(ringHubFixtureStationSpec());
  enterForge(otherMode.bus);
  assert.equal(actors(otherMode.state).filter((entity) => entity.alive !== false).length, 0);
  otherMode.owner.destroy();
  otherMode.sim.dispose();
});

test('ring-hub fixture: new-game reset and Forge exit/re-entry release custody without live twins', () => {
  const h = runtime();
  h.sim.spawn(ringHubFixtureStationSpec());
  enterForge(h.bus);
  const first = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(first);
  assert.equal(h.state.story.flags[VA.storyFlags.seen], true);
  assert.equal(h.helpers.spawnBudget.current(), 1);

  h.bus.emit('game:newGame', {});
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 0);
  assert.equal(h.helpers.spawnBudget.current(), 0);
  assert.equal(h.state.story.flags[VA.storyFlags.seen], undefined);
  assert.equal(h.state.story.flags[VA.storyFlags.lost], undefined);
  enterForge(h.bus);
  const restarted = actors(h.state).filter((entity) => entity.alive !== false);
  assert.equal(restarted.length, 1);
  assert.notEqual(restarted[0], first);

  h.bus.emit('sector:exit', { sectorId: VA.sectorId });
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 0);
  assert.equal(h.helpers.spawnBudget.current(), 0);
  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 0);
  h.state.world.currentSectorId = VA.sectorId;
  enterForge(h.bus);
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 1);
  assert.equal(h.helpers.spawnBudget.current(), 1);
  h.owner.destroy();
  h.sim.dispose();
});

test('ring-hub fixture: foreign claims stay untouched and stale dead refs cannot erase a live actor', () => {
  const h = runtime();
  h.sim.spawn(ringHubFixtureStationSpec());
  enterForge(h.bus);
  const actor = actors(h.state).find((entity) => entity.alive !== false);
  assert.ok(actor);
  const staleDead = {
    id: actor.id,
    type: 'ship',
    alive: false,
    isPlayer: false,
    data: { ...actor.data },
  };
  h.state.entityList.push(staleDead);
  h.bus.emit('save:loaded', {});
  assert.equal(h.state.story.flags[VA.storyFlags.lost], undefined);
  assert.equal(h.state.entities.get(actor.id), actor);
  assert.equal(actors(h.state).filter((entity) => entity.alive !== false).length, 1);
  assert.equal(actor.physicsBody.dynamic, false);
  assert.equal(actor.flags.invuln, true);
  assert.equal(actor.flags.persistent, true);
  assert.equal(actor.data.masslineTetherable, false);
  assert.equal(actor.data.trafficRole, undefined);
  assert.equal(actor.data.jobId, undefined);
  assert.equal(actor.data.ai, null);
  assert.equal(actor.data.intent, null);
  assert.deepEqual(actor.data.weapons, []);

  h.owner.destroy();
  h.sim.dispose();

  const foreign = runtime();
  foreign.sim.spawn(ringHubFixtureStationSpec());
  const claim = foreign.sim.spawn({
    type: 'ship', isPlayer: false, team: 2, pos: { x: 9000, y: 0, z: 9000 },
    radius: 12, mass: 68,
    data: { worldRecordId: VA.worldRecordId, persistenceOwner: 'differentOwner', defId: 'ship_hawser' },
  });
  enterForge(foreign.bus);
  assert.equal(foreign.state.entities.get(claim.id), claim,
    'a partial foreign identity claim is not adopted or removed');
  assert.equal(actors(foreign.state).length, 0);
  assert.equal(foreign.helpers.spawnBudget.current(), 0);
  foreign.owner.destroy();
  foreign.sim.dispose();
});
