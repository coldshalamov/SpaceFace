import { FRONTIER_ANCHORS } from './frontierRegions/index.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

const STREAM = 'player-industrial-beam';
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const definitions = [
  { key: 'nyx_unwritten_bridge', sectorId: 'sector_nyx_march', name: 'The Unwritten Bridge', poiId: 'poi_nyx_wreck',
    placeId: 'place_claim_outpost_fence', scale: 1.7, machineId: 'nyx_crosswind', job: 'Cut and release both bridge spans. The fence wind stops when the second clamp opens.', kind: 'bridge' },
  { key: 'orcus_last_lantern', sectorId: 'sector_orcus_shadow', name: 'The Last Lantern', poiId: 'poi_orcus_plinth',
    placeId: 'place_claim_outpost_relay', scale: 1.8, machineId: 'orcus_draw', job: 'Restore power, focus the dish, then light the lantern. The shadow intake releases its hold.', kind: 'lantern' },
  { key: 'rhea_red_sun_engine', sectorId: 'sector_rhea_cinder', name: 'The Red Sun Engine', poiId: 'poi_rhea_slag',
    placeId: 'place_claim_outpost_refinery', scale: 1.6, machineId: 'rhea_ashwall', job: 'Repair the bleed valve, cut the hot core free and tow it to the cold socket to stop the ash wall.', kind: 'engine' },
  { key: 'haumea_glass_harp', sectorId: 'sector_haumea_rift', name: 'The Glass Harp', poiId: 'poi_haumea_fissure',
    placeId: 'place_claim_outpost_catcher', scale: 1.9, machineId: 'fissure_cracker', job: 'Cut and release the three bent harp chords. Each chord is a real free mass; the last one quiets the fissure.', kind: 'harp' },
  { key: 'nereid_ship_in_ice', sectorId: 'sector_nereid_shoal', name: 'The Ship Inside the Ice', poiId: 'poi_nereid_wreck',
    placeId: 'place_conveyor_barge', scale: 4, machineId: 'nereid_squeeze', job: 'Cut the keel seam, release its clamp and tow the finite keel into the shore cradle. The shoal opens.', kind: 'keel' },
  { key: 'eunomia_stepwell', sectorId: 'sector_eunomia_gulf', name: 'The Stepwell', poiId: 'poi_eunomia_hulk',
    placeId: 'place_claim_outpost_base', scale: 1.8, machineId: 'eunomia_recoil', job: 'Extract the two ballast steps and tow each to its opposite socket. Seating both steps quiets the gulf recoil.', kind: 'steps' },
];

function placement(def) {
  const anchors = FRONTIER_ANCHORS[def.sectorId];
  const poi = anchors.pois.find(row => row.id === def.poiId).pos;
  const station = anchors.stations[0].pos, gate = anchors.gates[0].pos;
  const dx = gate.x - station.x, dz = gate.z - station.z, length = Math.hypot(dx, dz);
  const nx = -dz / length, nz = dx / length;
  const off = (poi.x - station.x) * nx + (poi.z - station.z) * nz;
  const shift = Math.sign(off || 1) * Math.max(0, 800 - Math.abs(off));
  return { local: { x: poi.x + nx * shift, z: poi.z + nz * shift }, rot: Math.atan2(dz, dx) + Math.PI / 2 };
}

function build(def) {
  const id = `world_site_${def.key}`, p = placement(def);
  const components = [], proxies = [], operations = [], payloads = [], receivers = [];
  function component(key, label, anchorId, initialStatus, kind = 'machine') {
    components.push({ id: key, label, anchorId, initialStatus, kind });
    proxies.push({ id: `proxy_${key}`, componentId: key, anchorId, shape: 'circle', bodyType: 'sensor', radius: 9, offset: { x: 0, z: 0 } });
    return key;
  }
  function operation(key, componentId, verb, from, to, dependsOn = [], extra = {}) {
    operations.push({ id: key, componentId, verb, from: [from], to, dependsOn,
      threshold: verb === 'transfer' ? 1 : verb === 'repair' ? 34 : 42, requestStreamId: STREAM, consequenceIds: [], ...extra });
    return key;
  }
  function section(key, label, anchor, clampAnchor, part, dependencies = [], offsetX = 0) {
    component(key, `${label} · CUT SEAM`, anchor, 'intact', 'weakpoint');
    component(`${key}_clamp`, `${label} · RELEASE CLAMP`, clampAnchor, 'braced');
    // Claim-module sockets may intentionally alias one foundation. Finite sections
    // need separate physical bays rather than sharing that visual socket's centre.
    for (const proxy of proxies.slice(-2)) proxy.offset.x = offsetX;
    const cut = operation(`cut_${key}`, key, 'cut', 'intact', 'cut', dependencies, { payloadId: key });
    const release = operation(`release_${key}`, `${key}_clamp`, 'cut', 'braced', 'released', [cut]);
    payloads.push({ id: key, worldObjectId: `${id}/payload/${key}`, label, componentId: key,
      releaseOperationId: cut, radius: part === 'keel' ? 36 : 65, mass: part === 'keel' ? 1200 : 1800,
      salvagePool: {}, structural: { halfX: 34, halfZ: part === 'keel' ? 10 : 55,
        supportComponentId: `${key}_clamp`, supportStatus: 'braced',
        placeId: `place_ceres_second_measure_${part}`, placeScale: 2 } });
    return release;
  }
  function cargo(key, label, anchor, verb, dependency = []) {
    component(key, label, anchor, 'sealed', 'payload_mount');
    const op = operation(`free_${key}`, key, verb, 'sealed', 'open', dependency, { payloadId: key });
    payloads.push({ id: key, worldObjectId: `${id}/payload/${key}`, label, componentId: key,
      releaseOperationId: op, radius: 10, mass: 280, salvagePool: { cmdty_scrap_metal: 4 }, releaseVelocity: { x: 12, z: 0 } });
    return op;
  }
  function receiver(key, label, anchor, payload, dependency) {
    component(key, label, anchor, 'ready', 'receiver');
    const op = operation(`seat_${key}`, key, 'transfer', 'ready', 'settled', dependency,
      { payloadId: payload, receiverId: `${key}_receiver` });
    receivers.push({ id: `${key}_receiver`, componentId: key, acceptsPayloadIds: [payload], settlementOperationId: op });
    return op;
  }
  let final;
  if (def.kind === 'bridge') {
    const a = section('port_span', 'Unwritten port span', 'SOCKET_Module_Depot', 'SOCKET_Module_Defense', 'crossbeam', [], -75);
    final = section('starboard_span', 'Unwritten starboard span', 'SOCKET_Module_Refinery', 'SOCKET_Module_Teleporter', 'long_plate', [a], 75);
  } else if (def.kind === 'lantern') {
    component('power', 'RESTORE LANTERN POWER', 'SOCKET_Module_Depot', 'failed');
    component('focus', 'FOCUS THE LAST DISH', 'SOCKET_Structure_Core', 'failed');
    component('lantern', 'LIGHT THE LAST LANTERN', 'SOCKET_Emissive', 'failed');
    const power = operation('restore_power', 'power', 'repair', 'failed', 'operational');
    const focus = operation('focus_dish', 'focus', 'repair', 'failed', 'operational', [power]);
    final = operation('light_lantern', 'lantern', 'repair', 'failed', 'operational', [focus]);
  } else if (def.kind === 'engine') {
    component('valve', 'REPAIR THE BLEED VALVE', 'SOCKET_Module_Defense', 'failed');
    const valve = operation('repair_bleed_valve', 'valve', 'repair', 'failed', 'operational');
    const core = cargo('hot_core', 'CUT THE RED SUN CORE', 'SOCKET_Module_Refinery', 'cut', [valve]);
    final = receiver('cold_socket', 'COLD CORE SOCKET', 'SOCKET_Dock_Approach', 'hot_core', [core]);
  } else if (def.kind === 'harp') {
    let prior = [], offsetX = -90;
    for (const [key, anchor, clamp, part] of [
      ['low_chord', 'SOCKET_Module_Depot', 'SOCKET_Module_Defense', 'keel'],
      ['middle_chord', 'SOCKET_Module_Refinery', 'SOCKET_Module_Teleporter', 'crossbeam'],
      ['high_chord', 'SOCKET_Structure_Core', 'SOCKET_Dock_Approach', 'long_plate'],
    ]) { final = section(key, key.replace('_', ' '), anchor, clamp, part, prior, offsetX); prior = [final]; offsetX += 90; }
  } else if (def.kind === 'keel') {
    const free = section('ice_keel', 'Ice-bound keel', 'SOCKET_Container_Fore', 'SOCKET_Container_Mid', 'keel');
    final = receiver('shore_cradle', 'SHORE KEEL CRADLE', 'SOCKET_Barge_Bridge', 'ice_keel', [free]);
  } else {
    const a = cargo('port_step', 'EXTRACT PORT BALLAST STEP', 'SOCKET_Module_Depot', 'extract');
    const seat = receiver('port_socket', 'OPPOSITE PORT SOCKET', 'SOCKET_Module_Teleporter', 'port_step', [a]);
    const b = cargo('starboard_step', 'EXTRACT STARBOARD BALLAST STEP', 'SOCKET_Module_Refinery', 'extract', [seat]);
    final = receiver('starboard_socket', 'OPPOSITE STARBOARD SOCKET', 'SOCKET_Module_Defense', 'starboard_step', [b]);
  }
  operations.find(op => op.id === final).consequenceIds = ['wonder_secured'];
  const stage = (key, requires) => ({ id: key, placeId: def.placeId, scale: def.scale,
    label: `${def.name} · ${key === 'secured' ? 'SECURED' : def.job}`, requires,
    presentation: { schemaVersion: 1, fixtures: [{ id: 'wonder_status', kind: 'status-light',
      socketId: 'SOCKET_Emissive', componentId: components[0].id,
      color: key === 'secured' ? 0x6eff9b : 0xffc24a, intensity: 0.8, radius: 2, opacity: 0.8 }],
      animations: [{ id: 'wonder_pulse', kind: 'pulse', targetId: 'wonder_status', rate: 0.4, amplitude: 0.08 }] } });
  return freeze({ schemaVersion: 4, id, worldObjectId: id, name: def.name, sectorId: def.sectorId,
    placement: { coordinateSpace: 'global_v1', pos: sectorLocalToGlobalForSector(p.local, def.sectorId), rot: p.rot },
    visualRoot: { placeId: def.placeId, anchorId: 'SOCKET_Structure_Core', initialScale: def.scale,
      visualRadius: def.kind === 'harp' ? 300 : def.kind === 'bridge' ? 240 : 190, componentProxyPresentation: 'hidden' },
    requestStreams: [{ id: STREAM, owner: 'mining', sequenceSource: 'state.tick' }],
    components, proxies, operations, payloads, receivers, failureTriggers: [],
    stages: [stage('working', []), stage('secured', [final])],
    consequences: [{ id: 'wonder_secured', intents: [
      { domain: 'world', type: 'sectorWonder:secured', payload: { machineId: def.machineId } },
      { domain: 'presentation', type: 'toast', payload: { text: `${def.name} secured · the approach is quiet`, kind: 'success', ttl: 3 } },
    ] }],
    persistence: { collection: 'state.sites.worldById', serializer: 'asteroidSites', recordSchemaVersion: 3 },
    discovery: { naturalProducer: 'asteroidSites', visibleOnDefaultRoute: true, revealRadius: 1200, initialDiscovered: true },
    mapAnnotation: { kind: 'world-site', poiType: 'sector-wonder', label: def.name,
      searchText: `${def.name} ${def.job}`, coursePos: sectorLocalToGlobalForSector({ x: p.local.x, z: p.local.z - 260 }, def.sectorId),
      courseLabel: `${def.name} approach`, courseArrivalRadius: 48 },
    producer: { kind: 'authored_static', cadence: 'sector_enter', sectorId: def.sectorId },
    debug: { packet: 'GOLD-WONDERS-450', fixture: def.key, sectorLocalPlacement: p.local, reservationEnvelope: 420 },
  });
}

export const SECTOR_WONDER_MANIFESTS = Object.freeze(definitions.map(build));
export const SECTOR_WONDER_BY_ID = Object.freeze(Object.fromEntries(SECTOR_WONDER_MANIFESTS.map(manifest => [manifest.id, manifest])));

// Sector POIs reserve the work envelope before world scatters rocks. The site owner
// supplies the sole live root; these chart rows never mint a second prop.
export function appendSectorWonderPois(sector) {
  const wonders = SECTOR_WONDER_MANIFESTS.filter(manifest => manifest.sectorId === sector.id);
  if (!wonders.length) return sector;
  return { ...sector, pois: [...(sector.pois || []), ...wonders.map(manifest => ({
    id: manifest.id, type: 'anomaly', name: manifest.name,
    pos: { ...manifest.debug.sectorLocalPlacement }, runtimeOwner: 'asteroidSites',
    visualRadius: manifest.visualRoot.visualRadius, dressingExclusionRadius: manifest.debug.reservationEnvelope,
  }))] };
}
