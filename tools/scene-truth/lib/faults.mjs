import { SHIPS } from '../../../src/data/ships.js';
import { analyzeWitness, analyzeZoomTransition, highFails, judgePixelDrift } from './detectors.mjs';
import { bindEntity } from './bindVisual.mjs';
import { WITNESS_SCHEMA } from './constants.mjs';
import { SHIPPING_CHASE_ZOOM, frameHalfExtents, legalQualityTiers, projectScreen } from './frame.mjs';

const KESTREL = SHIPS.find((ship) => ship.id === 'ship_kestrel');
const WASP = SHIPS.find((ship) => ship.id === 'ship_wasp');

function shipEntity({ alias, defId, radius, pos, isPlayer, hull, hullMax, silhouette }) {
  return bindEntity({
    id: alias,
    objectId: `entity:${alias}`,
    type: 'ship',
    alive: true,
    isPlayer,
    radius,
    hull,
    hullMax,
    pos,
    rot: 0,
    data: {
      defId,
      scenarioAlias: alias,
      scenarioRole: isPlayer ? 'player' : 'npc',
      silhouette: silhouette || null,
    },
  });
}

function stationEntity(pos, radius) {
  return bindEntity({
    authored: true,
    authoredId: 'station',
    objectId: 'prop:station',
    id: 'prop:station',
    type: 'station',
    alive: true,
    required: true,
    radius,
    pos,
    rot: 0,
    data: {
      placeId: 'place_station_trade_hub',
      archetypeGlb: 'place_station_trade_hub',
      stationTypeId: 'trade_hub',
      dockRadius: 90,
      scenarioAlias: 'station',
      scenarioRole: 'station',
    },
  });
}

function asWitness(objects, extra = {}) {
  const focus = { x: 0, z: 0 };
  const zoom = extra.zoom || SHIPPING_CHASE_ZOOM;
  const tier = legalQualityTiers().find((row) => row.id === (extra.qualityTier || 'medium'));
  const frame = frameHalfExtents(zoom);
  const projected = objects.map((object) => {
    const effects = (object.effects || []).map((effect) => ({
      ...effect,
      coverage: effect.coverage != null ? effect.coverage : effect.baseCoverage * tier.burst,
    }));
    const next = { ...object, effects };
    return { ...next, screen: projectScreen(next, focus, frame) };
  });
  return {
    schema: WITNESS_SCHEMA,
    scenarioId: extra.scenarioId || 'fault.sandbox',
    seed: 1,
    tick: extra.tick ?? 4,
    zoom,
    qualityTier: tier.id,
    focus,
    frame,
    playerRequired: extra.playerRequired !== false,
    captureKind: 'semantic-projection',
    gpuFrame: false,
    objects: projected,
  };
}

/** Two production hulls, separated, with real package metadata. */
export function healthyWitness(extra = {}) {
  const player = shipEntity({
    alias: 'player',
    defId: 'ship_kestrel',
    radius: KESTREL.collisionRadius,
    pos: { x: 0, z: 0 },
    isPlayer: true,
    hull: KESTREL.hull,
    hullMax: KESTREL.hull,
  });
  const neighbor = shipEntity({
    alias: 'neighbor',
    defId: 'ship_wasp',
    radius: WASP.collisionRadius,
    pos: { x: 80, z: 0 },
    isPlayer: false,
    hull: WASP.hull,
    hullMax: WASP.hull,
  });
  return asWitness([player, neighbor], extra);
}

function clone(witness) {
  return structuredClone(witness);
}

function mutate(witness, objectId, fn) {
  const next = clone(witness);
  const object = next.objects.find((row) => row.objectId === objectId);
  fn(object, next);
  return next;
}

export function faultCases() {
  const base = healthyWitness();
  const playerId = 'entity:player';
  const neighborId = 'entity:neighbor';
  return [
    {
      id: 'hidden-mesh',
      expect: 'invisible-collidable',
      witness: mutate(base, playerId, (object) => { object.visible = false; }),
    },
    {
      id: 'wrong-scale',
      expect: 'prop-hidden-by-scaled-geometry',
      witness: (() => {
        const next = clone(base);
        const station = stationEntity({ x: 40, z: 40 }, 20);
        station.colliderRadius = 20;
        station.expectedRadius = 20;
        station.presentedRadius = 160;
        next.objects.push({ ...station, screen: projectScreen(station, next.focus, next.frame) });
        return next;
      })(),
    },
    {
      id: 'missing-package',
      expect: 'missing-required-model',
      witness: mutate(base, neighborId, (object) => {
        object.package = { ...object.package, sourceExists: false, metadataExists: false, key: null };
      }),
    },
    {
      id: 'bad-bounds',
      expect: 'bad-bounds',
      witness: mutate(base, neighborId, (object) => { object.boundsFinite = false; }),
    },
    {
      id: 'material-pop',
      expect: 'asset-change-pop',
      witness: base,
      prior: mutate(base, neighborId, (object) => {
        object.package = { ...object.package, contentHash: 'sandbox-pop-hash' };
      }),
    },
    {
      id: 'severe-overlap',
      expect: 'clipping-interpenetration',
      witness: mutate(base, neighborId, (object) => { object.pos = { x: 0, z: 0 }; }),
    },
    {
      id: 'placeholder-hull',
      expect: 'unexpected-placeholder',
      witness: mutate(base, neighborId, (object) => { object.placeholder = true; }),
    },
    {
      id: 'identity-swap',
      expect: 'silhouette-identity-mismatch',
      witness: mutate(base, neighborId, (object) => {
        object.package = { ...object.package, relativeFile: 'wholeships/kestrel.glb' };
        object.expectedFile = 'wholeships/wasp_production_v1.glb';
      }),
    },
    {
      id: 'vfx-hide',
      expect: 'vfx-hides-contact',
      witness: mutate(base, neighborId, (object) => {
        object.pos = { x: KESTREL.collisionRadius + WASP.collisionRadius, z: 0 };
        const player = base.objects.find((row) => row.objectId === playerId);
        object.effects = [{
          kind: 'shield',
          radius: object.colliderRadius + player.colliderRadius,
          coverage: 0.95,
          occludesContacts: true,
        }];
      }),
    },
    {
      id: 'depth-order',
      expect: 'impossible-depth-order',
      witness: mutate(base, neighborId, (object) => {
        object.depthTest = false;
        object.renderOrder = 100;
        object.pos = { x: 20, z: 0 };
      }),
    },
    {
      id: 'slow-load',
      expect: 'excessive-load-to-first-draw',
      witness: mutate(base, neighborId, (object) => { object.firstDrawMs = 9000; }),
    },
    {
      id: 'player-lod2',
      expect: 'invalid-lod',
      witness: mutate(base, playerId, (object) => { object.lodLevel = 'lod2'; }),
    },
    {
      id: 'stacked-hulls',
      expect: 'severe-z-fight',
      witness: mutate(base, neighborId, (object) => { object.pos = { x: 0.05, z: 0 }; }),
    },
    {
      id: 'camera-inside',
      expect: 'camera-occlusion',
      witness: (() => {
        const next = clone(base);
        const station = stationEntity({ x: 0, z: 0 }, 80);
        station.colliderRadius = 80;
        station.expectedRadius = 80;
        station.presentedRadius = 80;
        station.presentationSource = 'measured';
        next.objects.push({ ...station, screen: projectScreen(station, next.focus, next.frame) });
        return next;
      })(),
    },
    {
      id: 'late-admission',
      expect: 'late-model-admission',
      witness: null,
    },
    {
      id: 'destroyed-drawn',
      expect: 'destroyed-still-drawn',
      witness: mutate(base, neighborId, (object) => {
        object.alive = false;
        object.visible = true;
        object.collidable = false;
      }),
    },
  ];
}

export function lateAdmissionPair() {
  const close = healthyWitness({ zoom: 45 });
  const wide = healthyWitness({ zoom: 330 });
  const neighbor = wide.objects.find((object) => object.objectId === 'entity:neighbor');
  neighbor.pos = { x: 55, z: 0 };
  neighbor.screen = projectScreen(neighbor, wide.focus, wide.frame);
  neighbor.package = { ...neighbor.package, sourceExists: false, metadataExists: false, key: null };
  const closeNeighbor = close.objects.find((object) => object.objectId === 'entity:neighbor');
  closeNeighbor.pos = { x: 55, z: 0 };
  closeNeighbor.screen = projectScreen(closeNeighbor, close.focus, close.frame);
  closeNeighbor.package = { ...closeNeighbor.package, sourceExists: false, metadataExists: false, key: null };
  return { close, wide };
}

export function benignCases() {
  const separated = healthyWitness();
  const tangent = clone(separated);
  const neighbor = tangent.objects.find((object) => object.objectId === 'entity:neighbor');
  const player = tangent.objects.find((object) => object.objectId === 'entity:player');
  neighbor.pos = { x: player.colliderRadius + neighbor.colliderRadius, z: 0 };
  neighbor.screen = projectScreen(neighbor, tangent.focus, tangent.frame);

  const translucent = clone(tangent);
  const host = translucent.objects.find((object) => object.objectId === 'entity:player');
  host.effects = [{
    kind: 'shield',
    radius: host.colliderRadius * 1.12,
    coverage: 0.22,
    occludesContacts: false,
  }];

  const offscreen = clone(separated);
  const far = offscreen.objects.find((object) => object.objectId === 'entity:neighbor');
  far.pos = { x: 4000, z: 0 };
  far.screen = projectScreen(far, offscreen.focus, offscreen.frame);

  const cleaned = mutate(separated, 'entity:neighbor', (object) => {
    object.alive = false;
    object.visible = false;
    object.collidable = false;
  });

  const lowTier = healthyWitness({ qualityTier: 'low' });
  const highTier = healthyWitness({ qualityTier: 'high' });

  return [
    { id: 'tangent-contact', witness: tangent },
    { id: 'nearby-neighbor', witness: separated },
    { id: 'translucent-shield', witness: translucent },
    { id: 'offscreen-ready-package', witness: offscreen },
    { id: 'destroyed-and-hidden', witness: cleaned },
    { id: 'quality-low', witness: lowTier },
    { id: 'quality-high', witness: highTier },
  ];
}

export function evaluateFault(row) {
  if (row.id === 'late-admission') {
    const pair = lateAdmissionPair();
    const issues = analyzeZoomTransition(pair.close, pair.wide);
    return { id: row.id, expect: row.expect, issues, high: highFails(issues) };
  }
  if (row.id === 'material-pop') {
    const issues = analyzeWitness(row.witness, row.prior);
    return { id: row.id, expect: row.expect, issues, high: highFails(issues) };
  }
  const issues = analyzeWitness(row.witness);
  return { id: row.id, expect: row.expect, issues, high: highFails(issues) };
}

export function evaluateFaults() {
  return faultCases().map((row) => evaluateFault(row));
}

export function evaluateBenign() {
  return benignCases().map((row) => {
    const issues = analyzeWitness(row.witness);
    return { id: row.id, issues, high: highFails(issues) };
  });
}

export function pixelDriftReview() {
  return judgePixelDrift({
    geometryMatch: true,
    pixelHashChanged: true,
    scenarioId: 'fault.sandbox',
    seed: 1,
    tick: 4,
    zoom: SHIPPING_CHASE_ZOOM,
    qualityTier: 'medium',
    objectIds: ['entity:player', 'entity:neighbor'],
  });
}
