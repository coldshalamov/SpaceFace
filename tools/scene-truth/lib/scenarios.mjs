import fs from 'node:fs';
import { ENEMY_TYPES } from '../../../src/data/enemies.js';
import { SHIPS } from '../../../src/data/ships.js';
import { validateLabScenario } from '../../../src/testing/lab/runScenario.js';
import {
  GATE_COLLIDER,
  PLACE_COLLIDER,
  WRECK_CATHEDRAL_POS,
  asteroidPlaceForField,
  asteroidSizeRange,
  fieldRecord,
  gateRecord,
  offsetFrom,
  placeKeepOut,
  poiRecord,
  stationRecord,
  stationSizeOf,
} from './geography.mjs';
import { repoPath } from './root.mjs';

const SHIP_R = new Map(SHIPS.map((ship) => [ship.id, ship.collisionRadius]));
const ENEMY = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy]));

const COVERAGE = Object.freeze([
  'starting-ship',
  'enemy-crowd',
  'capital-hulk',
  'station',
  'asteroid-collision',
  'dense-tether',
  'jump-arrival',
  'fast-camera',
  'size-extreme',
  'damaged',
  'shield',
  'ore-pod',
  'offscreen-transition',
  'save-restore',
]);

function enemyRadius(profile) {
  const enemy = ENEMY.get(profile);
  if (!enemy) throw new Error(`unknown enemy profile ${profile}`);
  return enemy.collisionRadius || SHIP_R.get(enemy.shipId);
}

function shipRadius(defId) {
  const radius = SHIP_R.get(defId);
  if (!Number.isFinite(radius)) throw new Error(`unknown ship radius ${defId}`);
  return radius;
}

function flightDoc({ id, title, description, seed, ticks, entities, frames, attachments, checkpoints, sectorId }) {
  return {
    schema: 'spaceface.simScenario.v1',
    id,
    version: 1,
    title,
    description,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed,
    ticks,
    world: {
      fixtureProfile: attachments && attachments.length ? 'massline' : 'empty-flight',
      sectorId: sectorId || 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
    },
    entities,
    frames: frames || [{ tick: 0, input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false } }],
    ...(attachments && attachments.length ? { attachments } : {}),
    ...(checkpoints ? { checkpoints } : {}),
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'metric', metric: 'invariant.finiteState', op: '==', value: 1 },
    ],
    trace: { signals: ['playerX', 'playerZ'], sampleEvery: 1 },
    fixtureExceptions: [],
    observer: { enabled: false },
  };
}

function player(pos, extra = {}) {
  return {
    alias: 'player',
    profile: extra.profile || 'ship.starter',
    role: 'player',
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    pos,
    vel: extra.vel || { x: 0, z: 0 },
    heading: extra.heading ?? 0,
    persistent: true,
    ...(extra.overrides ? { overrides: extra.overrides } : {}),
  };
}

function npcShip(alias, profile, pos, extra = {}) {
  return {
    alias,
    profile,
    role: extra.role || 'npc',
    team: extra.team ?? 1,
    factionId: extra.factionId || 'faction_scn',
    isPlayer: false,
    pos,
    vel: extra.vel || { x: 0, z: 0 },
    heading: extra.heading ?? 0,
    persistent: true,
    ...(extra.overrides ? { overrides: extra.overrides } : {}),
  };
}

function enemy(alias, profile, pos) {
  return {
    alias,
    profile,
    role: 'hostile',
    team: 1,
    pos,
    vel: { x: 0, z: 0 },
    heading: Math.PI,
    overrides: { level: 1 },
    persistent: true,
  };
}

function pod(alias, pos, radius = 6) {
  return {
    alias,
    profile: `asteroid.spec:${radius}:200`,
    role: 'ore_pod',
    team: 2,
    pos,
    vel: { x: 0, z: 0 },
    heading: 0,
    overrides: { radius, mass: 200 },
    persistent: true,
  };
}

function earlyCheckpoint(ticks) {
  if (ticks < 3) return undefined;
  return [{ tick: 1, kind: 'deterministic-covered', label: 'early' }];
}

function ring(count, radius) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    out.push({
      x: Math.round(Math.cos(angle) * radius * 1000) / 1000,
      z: Math.round(Math.sin(angle) * radius * 1000) / 1000,
    });
  }
  return out;
}

function stationProp(station, sectorId) {
  const size = stationSizeOf(station);
  const placeId = station.archetypeGlb || `place_station_${station.type}`;
  const keep = placeKeepOut(placeId, size.collisionRadius, {
    type: 'station',
    dockRadius: size.dockRadius,
    stationTypeId: station.type,
  });
  return {
    prop: {
      authoredId: station.id,
      type: 'station',
      required: true,
      radius: size.collisionRadius,
      pos: { x: station.pos.x, z: station.pos.z },
      role: 'station',
      data: {
        placeId,
        archetypeGlb: placeId,
        stationId: station.id,
        stationTypeId: station.type,
        dockRadius: size.dockRadius,
        scenarioAlias: station.id,
        scenarioRole: 'station',
      },
    },
    playerPos: offsetFrom(station.pos, keep.standOff),
    sectorId,
    standOff: keep.standOff,
  };
}

function placeProp(authoredId, placeId, pos, extra = {}) {
  const collider = extra.colliderRadius
    || PLACE_COLLIDER[placeId]
    || extra.fallbackRadius
    || 20;
  return {
    authoredId,
    type: extra.type || 'prop',
    required: true,
    radius: collider,
    pos: { x: pos.x, z: pos.z },
    role: extra.role || placeId,
    collidable: extra.collidable !== false,
    data: {
      placeId,
      archetypeGlb: placeId,
      landmarkGlb: placeId,
      scenarioAlias: authoredId,
      scenarioRole: extra.role || placeId,
      ...(extra.data || {}),
    },
  };
}

function authoredScenarios() {
  const helios = stationProp(stationRecord('sector_helios_prime', 'station_helios'), 'sector_helios_prime');
  const coalition = stationProp(stationRecord('sector_helios_prime', 'station_coalition'), 'sector_helios_prime');
  const field = fieldRecord('sector_helios_prime', 'f_helios_starter');
  const fieldPlace = asteroidPlaceForField(field);
  const [sizeLo, sizeHi] = asteroidSizeRange(field);
  const rockRadii = [sizeLo, (sizeLo + sizeHi) / 2, sizeHi, sizeHi];
  const rockKeep = rockRadii.map((radius) => placeKeepOut(fieldPlace, radius, { type: 'asteroid' }).standOff);
  const rockRing = Math.max(...rockKeep, 80);
  const rocks = ring(4, rockRing).map((pos, index) => placeProp(
    `rock_${index}`,
    fieldPlace,
    { x: field.center.x + pos.x, z: field.center.z + pos.z },
    { type: 'asteroid', role: 'asteroid', colliderRadius: rockRadii[index], fallbackRadius: rockRadii[index] },
  ));

  const gate = gateRecord('sector_helios_prime', 'sector_ceres_belt');
  const gateKeep = placeKeepOut('place_gate_jump_ring', GATE_COLLIDER.collisionRadius, {
    type: 'station',
    dockRadius: GATE_COLLIDER.dockRadius,
    isGate: true,
  });
  const gatePlayer = offsetFrom(gate.pos, gateKeep.standOff);

  const cathedralKeep = placeKeepOut('place_landmark_wreck_cathedral', 90, {
    type: 'prop',
    fallbackRadius: 90,
  });
  const hulk = poiRecord('sector_ceres_belt', 'poi_driller');
  const hulkKeep = placeKeepOut('place_dead_hulk', PLACE_COLLIDER.place_dead_hulk, { type: 'prop' });
  const beacon = poiRecord('sector_helios_prime', 'poi_tutorial');
  const beaconKeep = placeKeepOut('place_lane_beacon', PLACE_COLLIDER.place_lane_beacon, { type: 'prop' });

  const kestrel = shipRadius('ship_kestrel');
  const leviathan = Math.max(shipRadius('ship_leviathan'), enemyRadius('dreadnought_boss'));
  const waspR = enemyRadius('wasp_swarmer');
  const crowdR = kestrel + waspR + 48;
  const crowd = ring(8, crowdR);

  const entries = [
    spec('scene.starter-rest', ['starting-ship'], flightDoc({
      id: 'scene.starter-rest',
      title: 'Starter ship at rest',
      description: 'New-game Hitch / Kestrel, production ship.starter profile, resting at the origin.',
      seed: 47001,
      ticks: 4,
      entities: [player({ x: 0, z: 0 })],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.starter-cruise', ['fast-camera', 'starting-ship'], flightDoc({
      id: 'scene.starter-cruise',
      title: 'Starter under boost',
      description: 'Same starter hull with throttle and boost so the chase frame is moving.',
      seed: 47002,
      ticks: 16,
      entities: [player({ x: 0, z: 0 }, { vel: { x: 0, z: 40 } })],
      frames: [{ tick: 0, input: { moveX: 0, moveZ: 1, turnIntent: 0.15, boost: true } }],
      checkpoints: earlyCheckpoint(16),
    })),
    spec('scene.enemy-crowd', ['enemy-crowd'], flightDoc({
      id: 'scene.enemy-crowd',
      title: 'Wasp swarm around the starter',
      description: 'Eight wasp_swarmer bodies on a clearance ring. Flight bundle does not run tactical AI, so the pose stays the authored crowd.',
      seed: 47003,
      ticks: 4,
      entities: [player({ x: 0, z: 0 }), ...crowd.map((pos, i) => enemy(`wasp_${i}`, 'wasp_swarmer', pos))],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.capital-leviathan', ['capital-hulk'], flightDoc({
      id: 'scene.capital-leviathan',
      title: 'Iron Maw beside the starter',
      description: 'dreadnought_boss uses the production leviathan hull and its authored collision radius.',
      seed: 47004,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        enemy('maw', 'dreadnought_boss', { x: kestrel + leviathan + 48, z: 0 }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.capital-colossus', ['capital-hulk'], flightDoc({
      id: 'scene.capital-colossus',
      title: 'Colossus beside the starter',
      description: 'ship_colossus production body at a clearance offset.',
      seed: 47005,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('colossus', 'ship_colossus', { x: kestrel + shipRadius('ship_colossus') + 40, z: 0 }, { role: 'capital' }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.station-helios', ['station'], flightDoc({
      id: 'scene.station-helios',
      title: 'Helios trade hub',
      description: 'Player held outside the authored Helios Station keep-out. The station prop is the production anchor, joined because the flight lab does not call world.enterSector.',
      seed: 47006,
      ticks: 4,
      entities: [player(helios.playerPos)],
      checkpoints: earlyCheckpoint(4),
    }), { props: [helios.prop], sectorNote: helios.sectorId }),
    spec('scene.station-military', ['station'], flightDoc({
      id: 'scene.station-military',
      title: 'Coalition military station',
      description: 'Authored Coalition HQ anchor and place_station_military, player outside the keep-out.',
      seed: 47007,
      ticks: 4,
      entities: [player(coalition.playerPos)],
      checkpoints: earlyCheckpoint(4),
    }), { props: [coalition.prop] }),
    spec('scene.asteroid-collision', ['asteroid-collision'], flightDoc({
      id: 'scene.asteroid-collision',
      title: 'Starter-field asteroid collision radii',
      description: 'Player at the authored Helios starter-field center. Four rocks use ast_common_rock\'s place and size-range endpoints, spaced on a clearance ring. This is the production place and size law, not a second scatter sim.',
      seed: 47008,
      ticks: 4,
      entities: [player({ x: field.center.x, z: field.center.z })],
      checkpoints: earlyCheckpoint(4),
    }), { props: rocks }),
    spec('scene.dense-tethers', ['dense-tether'], flightDoc({
      id: 'scene.dense-tethers',
      title: 'Four massline tethers',
      description: 'Four ships, each with one tether_standard to a payload. Rest length matches the spawn gap so the line is taut without a yank.',
      seed: 47009,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('tug_b', 'ship_hawser', { x: 140, z: 0 }, { role: 'tether_owner' }),
        npcShip('tug_c', 'ship_hawser', { x: -140, z: 0 }, { role: 'tether_owner' }),
        npcShip('tug_d', 'ship_hawser', { x: 0, z: 200 }, { role: 'tether_owner' }),
        pod('pod_a', { x: 0, z: 90 }, 6),
        pod('pod_b', { x: 140, z: 90 }, 6),
        pod('pod_c', { x: -140, z: 90 }, 6),
        pod('pod_d', { x: 90, z: 200 }, 6),
      ],
      attachments: [
        { defId: 'tether_standard', ownerAlias: 'player', targetAlias: 'pod_a', restLength: 90 },
        { defId: 'tether_standard', ownerAlias: 'tug_b', targetAlias: 'pod_b', restLength: 90 },
        { defId: 'tether_standard', ownerAlias: 'tug_c', targetAlias: 'pod_c', restLength: 90 },
        { defId: 'tether_standard', ownerAlias: 'tug_d', targetAlias: 'pod_d', restLength: 90 },
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.jump-arrival', ['jump-arrival'], flightDoc({
      id: 'scene.jump-arrival',
      title: 'Arrival at the Ceres gate',
      description: 'Player outside the authored Helios-to-Ceres gate. The gate body is place_gate_jump_ring.',
      seed: 47010,
      ticks: 4,
      entities: [player(gatePlayer, { vel: { x: -10, z: 0 } })],
      checkpoints: earlyCheckpoint(4),
    }), {
      props: [placeProp('gate_ceres', 'place_gate_jump_ring', gate.pos, {
        type: 'station',
        role: 'gate',
        colliderRadius: GATE_COLLIDER.collisionRadius,
        data: { isGate: true, gateTo: 'sector_ceres_belt', dockRadius: GATE_COLLIDER.dockRadius },
      })],
    }),
    spec('scene.size-extremes', ['size-extreme'], flightDoc({
      id: 'scene.size-extremes',
      title: 'Flagship, starter, and a 2 WU pod',
      description: 'Leviathan, Kestrel, and a 2 WU payload in one frame.',
      seed: 47011,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('flag', 'ship_leviathan', { x: kestrel + shipRadius('ship_leviathan') + 36, z: 0 }, { role: 'capital' }),
        pod('mote', { x: -(kestrel + 2 + 30), z: 0 }, 2),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.damaged-components', ['damaged'], flightDoc({
      id: 'scene.damaged-components',
      title: 'Damaged Hornet beside an intact Wasp',
      description: 'Hornet hull override leaves hullMax intact so the witness sees a damaged ratio. The neighbor is a clearance check.',
      seed: 47012,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('hurt', 'ship_hornet', { x: kestrel + shipRadius('ship_hornet') + 36, z: 0 }, {
          role: 'damaged',
          overrides: { hull: 12 },
        }),
        enemy('intact', 'wasp_swarmer', { x: 0, z: kestrel + waspR + 40 }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.shields', ['shield'], flightDoc({
      id: 'scene.shields',
      title: 'Shielded starter and swarmer',
      description: 'Both hulls carry live shield hit points on the lab surface. At tick 4 the witness draws each disc at the live shell radius.',
      seed: 47013,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        enemy('screen', 'wasp_swarmer', { x: kestrel + waspR + 48, z: 0 }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.ore-pods', ['ore-pod'], flightDoc({
      id: 'scene.ore-pods',
      title: 'Cargo pods and a jettisoned ore pod',
      description: 'Lab payloads bind through authoredPayloadFileForEntity. One authored prop is the jettisoned_cargo rigged pod.',
      seed: 47014,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        ...ring(5, kestrel + 4 + 36).map((pos, i) => pod(`ore_${i}`, pos, 4)),
      ],
      checkpoints: earlyCheckpoint(4),
    }), {
      props: [{
        authoredId: 'jettisoned_ore',
        type: 'payload',
        required: true,
        radius: 4,
        collidable: true,
        pos: { x: 0, z: -(kestrel + 4 + 36) },
        role: 'ore_pod',
        data: {
          payloadType: 'jettisoned_cargo',
          scenarioAlias: 'jettisoned_ore',
          scenarioRole: 'ore_pod',
        },
      }],
    }),
    spec('scene.offscreen-onscreen', ['offscreen-transition'], flightDoc({
      id: 'scene.offscreen-onscreen',
      title: 'Hull outside the close frame',
      description: 'A Wasp sits outside the zoom-45 safe rect and inside the shipping and max-zoom rects. The package must already be bound.',
      seed: 47015,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        enemy('arrival', 'wasp_swarmer', { x: 55, z: 0 }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.wreck-cathedral', ['capital-hulk'], flightDoc({
      id: 'scene.wreck-cathedral',
      title: 'Ceres wreck cathedral',
      description: 'Player outside the authored Ceres wreck-cathedral anchor.',
      seed: 47016,
      ticks: 4,
      sectorId: 'sector_ceres_belt',
      entities: [player(offsetFrom(WRECK_CATHEDRAL_POS, cathedralKeep.standOff))],
      checkpoints: earlyCheckpoint(4),
    }), {
      props: [placeProp('wreck_cathedral', 'place_landmark_wreck_cathedral', WRECK_CATHEDRAL_POS, {
        role: 'capital_hulk',
        colliderRadius: 90,
        fallbackRadius: 90,
      })],
    }),
    spec('scene.dead-hulk', ['capital-hulk'], flightDoc({
      id: 'scene.dead-hulk',
      title: 'Ceres dead hulk',
      description: 'poi_driller is the authored place_dead_hulk landmark in the Ceres belt.',
      seed: 47017,
      ticks: 4,
      sectorId: 'sector_ceres_belt',
      entities: [player(offsetFrom(hulk.pos, hulkKeep.standOff))],
      checkpoints: earlyCheckpoint(4),
    }), {
      props: [placeProp('dead_hulk', 'place_dead_hulk', hulk.pos, { role: 'hulk' })],
    }),
    spec('scene.opening-traffic', ['enemy-crowd', 'starting-ship'], flightDoc({
      id: 'scene.opening-traffic',
      title: 'Distinct traffic hulls',
      description: 'Mule, Pelican, Hornet, Drifter, and Hawser around the starter. Each profile resolves a different production whole-ship file.',
      seed: 47018,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        ...['ship_mule', 'ship_pelican', 'ship_hornet', 'ship_drifter', 'ship_hawser'].map((id, index) => {
          const pos = ring(5, 120)[index];
          return npcShip(id, id, pos, { role: 'traffic' });
        }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.saucer', ['size-extreme'], flightDoc({
      id: 'scene.saucer',
      title: 'Saucer hull',
      description: 'ship_saucer production body at clearance.',
      seed: 47019,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('saucer', 'ship_saucer', { x: kestrel + shipRadius('ship_saucer') + 36, z: 0 }, { role: 'exotic' }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.hawser-tug', ['starting-ship'], flightDoc({
      id: 'scene.hawser-tug',
      title: 'Hawser yard tug',
      description: 'ship_hawser resolves to the packaged yard-tug body.',
      seed: 47020,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('hawser', 'ship_hawser', { x: kestrel + shipRadius('ship_hawser') + 36, z: 0 }, { role: 'tug' }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.damaged-capital', ['damaged', 'capital-hulk'], flightDoc({
      id: 'scene.damaged-capital',
      title: 'Damaged Leviathan',
      description: 'Flagship with a hull override so damage presentation is on a capital body.',
      seed: 47021,
      ticks: 4,
      entities: [
        player({ x: 0, z: 0 }),
        npcShip('wounded_flag', 'ship_leviathan', { x: kestrel + shipRadius('ship_leviathan') + 40, z: 0 }, {
          role: 'damaged_capital',
          overrides: { hull: 40 },
        }),
      ],
      checkpoints: earlyCheckpoint(4),
    })),
    spec('scene.gate-buoy', ['jump-arrival'], flightDoc({
      id: 'scene.gate-buoy',
      title: 'Lane beacon with the sector gate in the same sector',
      description: 'Camera on the authored tutorial beacon. The Ceres gate stays in the witness as an offscreen required package.',
      seed: 47022,
      ticks: 4,
      entities: [player(offsetFrom(beacon.pos, beaconKeep.standOff))],
      checkpoints: earlyCheckpoint(4),
    }), {
      props: [
        placeProp('tutorial_beacon', 'place_lane_beacon', beacon.pos, { role: 'beacon' }),
        placeProp('far_gate', 'place_gate_jump_ring', gate.pos, {
          type: 'station',
          role: 'gate',
          colliderRadius: GATE_COLLIDER.collisionRadius,
          data: { isGate: true, gateTo: 'sector_ceres_belt', dockRadius: GATE_COLLIDER.dockRadius },
        }),
      ],
    }),
  ];
  return entries;
}

function spec(id, covers, doc, extra = {}) {
  return {
    id,
    covers,
    doc,
    props: extra.props || [],
    source: 'authored',
    sourcePath: null,
  };
}

function fixtureSpec(id, covers, relativePath) {
  const doc = JSON.parse(fs.readFileSync(repoPath(relativePath), 'utf8'));
  return {
    id,
    covers,
    doc,
    props: [],
    source: 'fixture',
    sourcePath: relativePath,
  };
}

function assertValid(entry) {
  const validation = validateLabScenario(entry.doc);
  if (!validation.ok) {
    const text = (validation.issues || []).map((issueRow) => `${issueRow.path}: ${issueRow.message}`).join('; ');
    throw new Error(`scene-truth scenario ${entry.id} failed validation: ${text}`);
  }
}

let cached = null;

export function sceneCatalog() {
  if (cached) return cached;
  const authored = authoredScenarios();
  const fixtures = [
    fixtureSpec('fixture.production-canary', ['starting-ship'], 'src/testing/scenarios/production-fixture-canary.scenario.json'),
    fixtureSpec('fixture.massline-latch', ['dense-tether'], 'src/testing/scenarios/massline-latch-reel.scenario.json'),
    fixtureSpec('fixture.flight-fixed-input', ['fast-camera', 'starting-ship'], 'src/testing/scenarios/flight-fixed-input.scenario.json'),
    fixtureSpec('fixture.flight-save-load', ['save-restore', 'starting-ship'], 'src/testing/scenarios/flight-save-load.scenario.json'),
  ];
  cached = [...authored, ...fixtures];
  for (const entry of cached) assertValid(entry);
  return cached;
}

export function requiredCoverage() {
  return COVERAGE;
}

export function coverageGaps(catalog = sceneCatalog()) {
  const have = new Set(catalog.flatMap((entry) => entry.covers));
  return COVERAGE.filter((theme) => !have.has(theme));
}
