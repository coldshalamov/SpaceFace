// BLACKBOX RUNS: a bounded, connected physical expedition. This is geometry and
// seeded data only. Entity creation, forces, cargo custody and rewards have owners.
import { hash32, mulberry32 } from '../../core/rng.js';

export const EXPEDITION_LAYOUT_VERSION = 1;
export const MAX_EXPEDITION_BODIES = 40;
export const EXPEDITION_TOW_CLEARANCE = 22;

// The room order is authored. Randomness bends a hull; it cannot invent a maze,
// close its only exit, or place a receiver inside a wall.
export const EXPEDITION_VARIANTS = Object.freeze([
  Object.freeze({ id: 'split_keel', name: 'The Split Keel', centers: Object.freeze([[0, 0], [204, 0], [408, 0]].map(Object.freeze)) }),
  Object.freeze({ id: 'shear_step', name: 'The Shear Step', centers: Object.freeze([[0, 0], [210, -30], [414, 24]].map(Object.freeze)) }),
  Object.freeze({ id: 'hooked_stern', name: 'The Hooked Stern', centers: Object.freeze([[0, 0], [200, -44], [402, -72]].map(Object.freeze)) }),
]);
export const EXPEDITION_VARIANT_IDS = Object.freeze(EXPEDITION_VARIANTS.map(row => row.id));

const HULL_PIECES = Object.freeze([
  'place_aftermath_wreck_ore_freighter_hopper_authored_down',
  'place_aftermath_deb_ore_freighter_ring_span',
  'place_aftermath_aft_engine_section',
  'place_aftermath_deb_liner_hull_panel_authored_down',
]);
const INTERACTIVE_ASSETS = Object.freeze({
  shutter: 'places/place_aftermath_deb_ore_freighter_hopper_lid_authored_down.glb',
  counterweight: 'places/place_aftermath_aft_cargo_module.glb',
  vent_baffle: 'places/place_aftermath_aft_pressure_tank.glb',
  relay: 'places/place_aftermath_aft_weapon_spar.glb',
  vault_gate: 'places/place_aftermath_aft_armor_slab_authored_down.glb',
  core: 'places/place_aftermath_aft_engine_section.glb',
  debris: 'places/place_aftermath_frag_strut_shard.glb',
});

const finitePoint = point => !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clonePoint = p => ({ x: p.x, z: p.z });
const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function expeditionSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

export function expeditionPointToWorld(point, origin = { x: 0, z: 0 }, rotation = 0) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return { x: origin.x + point.x * c - point.z * s, z: origin.z + point.x * s + point.z * c };
}

/** Pure, stable descriptor. It is safe to generate again from a saved identity. */
export function generateExpeditionLayout({ seed = 4242, siteId = 'blackbox_vesta', origin = { x: 0, z: 0 }, rotation = 0, variant } = {}) {
  if (!Number.isFinite(seed) || !finitePoint(origin) || !Number.isFinite(rotation)) {
    throw new TypeError('BLACKBOX RUNS layout requires a finite seed, origin and rotation');
  }
  if (typeof siteId !== 'string' || !/^[a-zA-Z0-9_:-]{1,100}$/.test(siteId)) {
    throw new TypeError('BLACKBOX RUNS siteId must be a stable plain identifier');
  }
  const normalizedSeed = seed >>> 0;
  const rng = mulberry32(hash32(normalizedSeed, siteId, 'blackbox_layout_v1'));
  const variantRoll = rng();
  const selected = variant == null ? EXPEDITION_VARIANTS[Math.floor(variantRoll * EXPEDITION_VARIANTS.length)]
    : typeof variant === 'number' ? EXPEDITION_VARIANTS[variant]
      : EXPEDITION_VARIANTS.find(row => row.id === variant);
  if (!selected) throw new RangeError('Unknown BLACKBOX RUNS layout variant');
  const angle = normalizeAngle(rotation);
  const place = p => expeditionPointToWorld(p, origin, angle);
  const vector = p => expeditionPointToWorld(p, { x: 0, z: 0 }, angle);
  const centered = selected.centers.map(([x, z], index) => ({
    x: x + (index ? (rng() - 0.5) * 12 : 0),
    z: z + (index ? (rng() - 0.5) * 10 : 0),
  }));
  const ids = ['shutter', 'vent', 'relay'];
  const names = ['Counterweight Gallery', 'Pressure Hold', 'Relay Vault'];
  const bodyRows = [];
  const add = (key, role, position, radius, mass, hull, options = {}) => {
    bodyRows.push({ key, role, position: place(position),
      radius, collisionRadius: radius, mass, hull, type: options.anchored ? 'fx' : 'payload',
      anchored: false, modelId: options.anchored ? 'anchor_bumper' : 'ferro_crate',
      assetId: null, compartmentId: null, ...options, rot: normalizeAngle(angle + (options.rot || 0)) });
  };
  const compartments = centered.map((center, index) => {
    // The torn port/starboard corners leave real 80wu service breaches between
    // their disc envelopes. No closing choreography owns those breaches.
    for (let corner = 0; corner < 4; corner++) {
      const sx = corner % 2 ? 1 : -1, sz = corner < 2 ? -1 : 1;
      add(`hull_${index}_${corner}`, 'hull', { x: center.x + sx * 62, z: center.z + sz * 76 },
        21 + rng() * 1.5, 4000, 100000,
        { anchored: true, compartmentId: ids[index], placeId: HULL_PIECES[(index + corner) % HULL_PIECES.length],
          rot: (corner % 2) * Math.PI, scanLabel: `${names[index]} / torn hull` });
    }
    return { id: ids[index], name: names[index], center: place(center), radius: 114,
      entry: place({ x: center.x - 92, z: center.z }), exit: place({ x: center.x + 92, z: center.z }),
      exteriorExit: place({ x: center.x, z: 260 }), optional: index === 2 };
  });

  const [shutterRoom, ventRoom, relayRoom] = centered;
  const shutterPos = { x: shutterRoom.x - 92, z: shutterRoom.z };
  add('shutter', 'shutter', shutterPos, 23, 320, 100, {
    compartmentId: 'shutter', modelId: 'cryo_gate', assetId: INTERACTIVE_ASSETS.shutter,
    rot: Math.PI / 2, scanLabel: '01 / rotating shutter: tow counterweight or cut shutter',
    shape: 'capsule', proportions: { length: 1.8, halfWidth: 0.28, height: 0.25 },
  });
  const counterweightPos = { x: shutterRoom.x - 96, z: shutterRoom.z - 126 };
  add('counterweight', 'counterweight', counterweightPos, 9, 200, 65, {
    compartmentId: 'shutter', assetId: INTERACTIVE_ASSETS.counterweight,
    scanLabel: '01 / counterweight: Pull or Massline away from its cradle',
  });
  const bafflePos = { x: ventRoom.x - 45, z: ventRoom.z - 126 };
  add('vent_baffle', 'vent_baffle', bafflePos, 10, 170, 80, {
    compartmentId: 'vent', assetId: INTERACTIVE_ASSETS.vent_baffle,
    scanLabel: '02 / pressure baffle: tow clear or destroy to vent the hold',
  });
  const jetDebris = [[-14, -88], [4, -71], [17, -53], [-14, -37], [6, -21], [18, -6]];
  const ventKeys = [];
  jetDebris.forEach(([dx, dz], index) => {
    const key = `vent_debris_${index}`;
    ventKeys.push(key);
    add(key, 'vent_debris', { x: ventRoom.x + dx, z: ventRoom.z + dz }, 3.2 + rng() * 1.2, 24 + index * 3, 20, {
      compartmentId: 'vent', assetId: INTERACTIVE_ASSETS.debris, modelId: 'reactive_debris',
      scanLabel: 'Loose deck fragment / Shove aside or Pin out of the jet',
    });
  });
  const relayPos = { x: relayRoom.x - 58, z: relayRoom.z - 12 };
  const vaultPos = { x: relayRoom.x + 40, z: relayRoom.z };
  add('relay', 'relay', relayPos, 9, 125, 75, {
    compartmentId: 'relay', assetId: INTERACTIVE_ASSETS.relay,
    scanLabel: '03 / power relay: tow off socket or shoot to release vault',
  });
  add('vault_gate', 'vault_gate', vaultPos, 18, 270, 110, {
    compartmentId: 'relay', assetId: INTERACTIVE_ASSETS.vault_gate, modelId: 'cryo_gate',
    scanLabel: '03 / vault plate: relay-fed; movable once power is severed',
    shape: 'capsule', proportions: { length: 1.8, halfWidth: 0.30, height: 0.25 }, rot: Math.PI / 2,
  });

  const loot = [
    { id: 'blackbox', key: 'blackbox', bodyKey: 'blackbox', position: place({ x: ventRoom.x + 42, z: ventRoom.z }),
      radius: 5.5, mass: 180, optional: false, behind: ['shutter', 'vent'], baseReward: 900, label: 'Flight recorder', anchorKey: 'blackbox_anchor' },
    { id: 'core', key: 'core', bodyKey: 'core', position: place({ x: relayRoom.x + 84, z: relayRoom.z }),
      radius: 7, mass: 360, optional: true, behind: ['shutter', 'vent', 'relay'], baseReward: 1400, label: 'Reactor memory core', anchorKey: 'core_anchor' },
  ];
  add('blackbox', 'blackbox', { x: ventRoom.x + 42, z: ventRoom.z }, 5.5, 180, 100, {
    compartmentId: 'vent', assetId: 'pod_cargo_container',
    scanLabel: 'FLIGHT RECORDER / physical cargo / tow to the receiver',
  });
  add('core', 'core', { x: relayRoom.x + 84, z: relayRoom.z }, 7, 360, 120, {
    compartmentId: 'relay', assetId: INTERACTIVE_ASSETS.core,
    scanLabel: 'OPTIONAL REACTOR CORE / heavier tow / releases stored pressure',
  });
  add('blackbox_anchor', 'cargo_anchor', { x: ventRoom.x + 42, z: ventRoom.z - 32 }, 7, 2600, 100000, {
    anchored: true, compartmentId: 'vent', placeId: 'place_aftermath_aft_dock_collar',
    scanLabel: 'Recorder clamp cradle / physical breakaway mounting',
  });
  add('core_anchor', 'cargo_anchor', { x: relayRoom.x + 84, z: relayRoom.z - 34 }, 8, 3200, 100000, {
    anchored: true, compartmentId: 'relay', placeId: 'place_aftermath_aft_dock_collar',
    scanLabel: 'Core clamp cradle / physical breakaway mounting',
  });

  // Finite, pre-existing return debris: instability moves this stock; no timer
  // is permitted to manufacture an unbounded wall of new bodies.
  const returnDebrisKeys = [];
  for (let index = 0; index < 6; index++) {
    const key = `return_debris_${index}`;
    returnDebrisKeys.push(key);
    const laneX = [-120, 104, 300][index % 3];
    add(key, 'return_debris', { x: laneX + (rng() - 0.5) * 12, z: 110 + Math.floor(index / 3) * 28 },
      4 + rng() * 1.8, 34 + index * 5, 30, {
        assetId: index % 2 ? 'places/place_aftermath_frag_plate_curl.glb' : INTERACTIVE_ASSETS.debris,
        modelId: 'reactive_debris', scanLabel: 'Loose return-lane wreckage / outer tow lane stays clear',
      });
  }
  const receiverLocal = { x: -470, z: 180 };
  [[-53, 0], [0, -54], [0, 54]].forEach(([dx, dz], index) => {
    add(`receiver_support_${index}`, 'receiver_support', { x: receiverLocal.x + dx, z: receiverLocal.z + dz }, 11, 3000, 100000,
      { anchored: true, placeId: 'place_aftermath_aft_dock_collar', scanLabel: 'RECEIVER / brake cargo inside the open cradle' });
  });
  const receiver = { position: place(receiverLocal), radius: 26, maxSpeed: 10, label: 'Recovery receiver',
    facing: angle, acceptanceS: 2.5, bodyKeys: ['receiver_support_0', 'receiver_support_1', 'receiver_support_2'] };
  const entry = place({ x: -165, z: 0 });
  const exteriorLocal = [receiverLocal, { x: -300, z: 260 }, { x: -240, z: 260 },
    ...centered.map(p => ({ x: p.x, z: 260 })), { x: centered[2].x + 150, z: 260 }];
  const safeExterior = exteriorLocal.map(place);
  // Turns happen in the gaps between broken sections, not through a cargo
  // clamp at the edge of a room. Each local working aisle remains horizontal.
  const spine = [entry];
  centered.forEach((center, index) => {
    if (index) spine.push(place({ x: center.x - 90, z: center.z }));
    spine.push(place(center));
    if (index < centered.length - 1) spine.push(place({ x: center.x + 90, z: center.z }));
  });
  spine.push(loot[1].position);
  const corridors = [
    { id: 'exterior_tow_lane', kind: 'safe_exterior', waypoints: safeExterior.map(clonePoint), halfWidth: EXPEDITION_TOW_CLEARANCE,
      clearanceScope: 'all_initial', blockedBy: [], permanent: true },
    { id: 'entry_exit', kind: 'escape', waypoints: [entry, place({ x: -240, z: 0 }), place({ x: -240, z: 260 })],
      halfWidth: EXPEDITION_TOW_CLEARANCE, clearanceScope: 'anchored', blockedBy: [], permanent: true },
    { id: 'connected_spine', kind: 'interior', waypoints: spine,
      halfWidth: EXPEDITION_TOW_CLEARANCE, clearanceScope: 'anchored',
      blockedBy: ['shutter', ...ventKeys, 'vault_gate', 'core'], permanent: false },
    ...compartments.map((room, index) => ({ id: `${room.id}_exit`, kind: 'escape',
      waypoints: [room.center, place({ x: centered[index].x, z: 260 })], halfWidth: EXPEDITION_TOW_CLEARANCE,
      clearanceScope: 'anchored', blockedBy: index === 1 ? ventKeys.slice() : [], permanent: true })),
  ];
  const layout = {
    schemaVersion: EXPEDITION_LAYOUT_VERSION, id: siteId, seed: normalizedSeed, variant: selected.id,
    name: selected.name, origin: clonePoint(origin), rotation: angle, compartments, bodies: bodyRows, loot, receiver, entry,
    safeExterior, corridors,
    obstacles: {
      shutter: { gateKey: 'shutter', counterweightKey: 'counterweight', pivot: place(shutterPos),
        counterweightOrigin: place(counterweightPos), clearDisplacement: 34, openAngle: 1.16, holdS: 1.0,
        solutions: ['tow_counterweight', 'destroy_shutter'] },
      vent: { valveKey: 'vent_baffle', baffleKey: 'vent_baffle', debrisKeys: ventKeys,
        origin: place({ x: ventRoom.x, z: ventRoom.z - 116 }), direction: vector({ x: 0, z: 1 }),
        length: 156, halfWidth: 25, quietPeriodS: 17 + rng() * 3, activeS: 4.5, telegraphS: 2.5,
        clearDisplacement: 27, maxAcceleration: 14, solutions: ['tow_baffle', 'destroy_baffle'] },
      relay: { relayKey: 'relay', gateKey: 'vault_gate', origin: place(relayPos), displacementToCut: 29,
        clearDisplacement: 29, holdS: 1.0, solutions: ['tow_relay', 'destroy_relay'] },
    },
    returnDebrisKeys,
    returnChoreography: { warningS: 4, protectedLane: 'exterior_tow_lane', maxDebrisSpeed: 12,
      origin: place({ x: 100, z: 135 }), direction: vector({ x: 1, z: 0.22 }), maxActiveBodies: 6,
      shortcut: [place({ x: -220, z: 150 }), place({ x: centered[2].x + 105, z: 150 })] },
    bounds: { center: place({ x: 70, z: 60 }), radius: 720 },
    parameters: { towClearance: EXPEDITION_TOW_CLEARANCE, bodyCap: MAX_EXPEDITION_BODIES,
      minRoomSeparation: 180, pressureNeverClosesExterior: true, maxInteractionDistance: 110 },
  };
  const validation = validateExpeditionLayout(layout);
  if (!validation.ok) throw new Error(`Invalid authored expedition layout: ${validation.errors.join('; ')}`);
  return layout;
}

/**
 * Swept-disc route certificate. Every segment reserves an entire ship/tow-width
 * tube against each anchored collision envelope, not merely clear endpoints.
 * The exterior additionally avoids ALL initial bodies. Moving debris can be
 * shoved into a lane by a player; this certificate describes generated geometry.
 */
export function validateExpeditionLayout(layout) {
  const errors = [];
  const metrics = { bodyCount: 0, corridorCount: 0, minStaticClearance: Infinity, minExteriorClearance: Infinity, connectedRooms: 0 };
  if (!layout || typeof layout !== 'object') return { ok: false, errors: ['missing layout'], metrics };
  const bodies = Array.isArray(layout.bodies) ? layout.bodies : [];
  const corridors = Array.isArray(layout.corridors) ? layout.corridors : [];
  const rooms = Array.isArray(layout.compartments) ? layout.compartments : [];
  metrics.bodyCount = bodies.length;
  metrics.corridorCount = corridors.length;
  if (layout.schemaVersion !== EXPEDITION_LAYOUT_VERSION) errors.push('unsupported layout schema');
  if (bodies.length < 1 || bodies.length > MAX_EXPEDITION_BODIES || corridors.length > 12 || rooms.length > 3) {
    return { ok: false, errors: [...errors, 'layout work budget exceeded'], metrics };
  }
  if (rooms.length !== 3) errors.push('expected three connected compartments');
  if (rooms.some(room => !room || typeof room.id !== 'string' || !finitePoint(room.center))) errors.push('invalid compartment descriptor');
  if (!finitePoint(layout.receiver?.position) || !(layout.receiver.radius >= EXPEDITION_TOW_CLEARANCE)) errors.push('receiver clearance missing');
  if (!finitePoint(layout.entry)) errors.push('entry missing');
  if (!finitePoint(layout.bounds?.center) || !(layout.bounds.radius > 0 && layout.bounds.radius <= 2000)) errors.push('invalid layout bounds');
  const keys = new Set();
  for (const body of bodies) {
    if (!body || typeof body.key !== 'string' || keys.has(body.key)) { errors.push('duplicate or missing body key'); continue; }
    keys.add(body.key);
    if (!finitePoint(body.position) || !Number.isFinite(body.rot)
      || !(body.radius > 0 && body.radius <= 32) || !(body.mass > 0 && body.mass <= 10000)
      || !(body.hull > 0 && body.hull <= 100000)) errors.push(`invalid body ${body.key}`);
    if (!Number.isFinite(body.collisionRadius) || body.collisionRadius < body.radius || body.collisionRadius > 48) {
      errors.push(`invalid collision envelope ${body.key}`);
    }
    if (finitePoint(body.position) && finitePoint(layout.bounds?.center)
      && distance(body.position, layout.bounds.center) + body.radius > layout.bounds.radius + 1e-7) errors.push(`out-of-bounds body ${body.key}`);
  }
  if (errors.length) return { ok: false, errors, metrics: { ...metrics, minStaticClearance: 0, minExteriorClearance: 0 } };
  for (let index = 0; index < bodies.length; index++) {
    const a = bodies[index];
    if (!finitePoint(a.position)) continue;
    for (let next = index + 1; next < bodies.length; next++) {
      const b = bodies[next];
      if (finitePoint(b.position) && distance(a.position, b.position) + 1e-7 < a.radius + b.radius) {
        errors.push(`initial overlap ${a.key}/${b.key}`);
      }
    }
  }
  let hasExterior = false;
  const exterior = corridors.find(c => c?.id === 'exterior_tow_lane');
  for (const corridor of corridors) {
    if (!corridor || !Array.isArray(corridor.waypoints) || corridor.waypoints.length < 2 || corridor.waypoints.length > 12
      || corridor.waypoints.some(p => !finitePoint(p)) || !Number.isFinite(corridor.halfWidth)
      || !(corridor.halfWidth >= EXPEDITION_TOW_CLEARANCE)
      || !Array.isArray(corridor.blockedBy) || corridor.blockedBy.length > MAX_EXPEDITION_BODIES) {
      errors.push(`invalid corridor ${corridor?.id || '?'}`); continue;
    }
    for (const key of corridor.blockedBy || []) if (!keys.has(key)) errors.push(`unknown blocker ${key}`);
    const allInitial = corridor.kind === 'safe_exterior';
    if (allInitial) hasExterior = true;
    for (let index = 1; index < corridor.waypoints.length; index++) {
      const a = corridor.waypoints[index - 1], b = corridor.waypoints[index];
      if (distance(a, b) < 1) errors.push(`degenerate corridor ${corridor.id}`);
      for (const body of bodies) {
        if ((!body.anchored && !allInitial) || !finitePoint(body.position)) continue;
        const clearance = expeditionSegmentDistance(body.position, a, b) - (body.collisionRadius || body.radius);
        if (body.anchored) metrics.minStaticClearance = Math.min(metrics.minStaticClearance, clearance);
        if (allInitial) metrics.minExteriorClearance = Math.min(metrics.minExteriorClearance, clearance);
        if (clearance + 1e-7 < corridor.halfWidth) errors.push(`blocked ${corridor.id} by ${body.key}`);
      }
    }
  }
  if (errors.length) return { ok: false, errors, metrics: {
    ...metrics,
    minStaticClearance: Number.isFinite(metrics.minStaticClearance) ? metrics.minStaticClearance : 0,
    minExteriorClearance: Number.isFinite(metrics.minExteriorClearance) ? metrics.minExteriorClearance : 0,
  } };
  if (!hasExterior || !exterior?.permanent) errors.push('permanent exterior tow lane missing');
  if (!Array.isArray(layout.safeExterior) || layout.safeExterior.length !== exterior?.waypoints?.length
    || layout.safeExterior.some((p, index) => !finitePoint(p) || !finitePoint(exterior?.waypoints?.[index])
      || distance(p, exterior.waypoints[index]) > 1e-6)) errors.push('exterior navigation differs from certified route');
  if (exterior?.waypoints?.length && finitePoint(layout.receiver?.position)
    && distance(exterior.waypoints[0], layout.receiver.position) > 1e-6) errors.push('receiver detached from exterior route');
  for (const room of rooms) {
    const exit = corridors.find(c => c?.id === `${room.id}_exit`);
    const connectsRoom = exit?.waypoints?.some(p => finitePoint(p) && finitePoint(room.center) && distance(p, room.center) < 1e-6);
    const tail = exit?.waypoints?.at(-1);
    const connectsExterior = finitePoint(tail) && exterior?.waypoints?.some(p => finitePoint(p) && distance(p, tail) < 1e-6);
    if (connectsRoom && connectsExterior) metrics.connectedRooms++;
    else errors.push(`compartment ${room.id} has no exterior escape`);
  }
  const spine = corridors.find(c => c?.id === 'connected_spine');
  for (const room of rooms) if (!spine?.waypoints?.some(p => finitePoint(p) && finitePoint(room.center) && distance(p, room.center) < 1e-6)) {
    errors.push(`compartment ${room.id} detached from interior spine`);
  }
  if (!Array.isArray(layout.loot) || layout.loot.length !== 2
    || layout.loot[0]?.id !== 'blackbox' || layout.loot[1]?.id !== 'core') errors.push('physical cargo sources missing');
  for (const loot of (Array.isArray(layout.loot) ? layout.loot.slice(0, 2) : [])) {
    const body = bodies.find(row => row.key === loot.bodyKey);
    if (!body || !finitePoint(loot.position) || distance(body.position, loot.position) > 1e-6) errors.push(`cargo body missing ${loot.id}`);
    const anchor = bodies.find(row => row.key === loot.anchorKey);
    if (!anchor?.anchored || !body || distance(anchor.position, body.position) > 40) errors.push(`physical cargo anchor missing ${loot.id}`);
  }
  if (!Number.isFinite(metrics.minStaticClearance)) metrics.minStaticClearance = 0;
  if (!Number.isFinite(metrics.minExteriorClearance)) metrics.minExteriorClearance = 0;
  return { ok: errors.length === 0, errors, metrics };
}

/** True when a proposed debris position would violate the guaranteed tow tube. */
export function expeditionTouchesProtectedLane(layout, position, radius = 0) {
  if (!finitePoint(position) || !Number.isFinite(radius) || radius < 0) return true;
  const lane = layout?.corridors?.find(c => c.id === 'exterior_tow_lane');
  if (!lane || !Array.isArray(lane.waypoints) || lane.waypoints.length > 12) return true;
  for (let index = 1; index < lane.waypoints.length; index++) {
    if (expeditionSegmentDistance(position, lane.waypoints[index - 1], lane.waypoints[index])
      < lane.halfWidth + radius) return true;
  }
  return false;
}
