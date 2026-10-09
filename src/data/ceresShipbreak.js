// P03 — Second Measure's bounded, finite structural shipbreak. World-site/mining/physics
// owners execute this data; this is not a second mining/traffic manager. The Cathedral's
// Concord Vigilant, archive and cavity remain untouched.
import { CERES_SECOND_MEASURE_LOCAL_POS } from './sectorAnchors.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const CERES_SHIPBREAK_SITE_ID = 'world_site_ceres_second_measure';
export const CERES_SHIPBREAK_LOCAL_POS = CERES_SECOND_MEASURE_LOCAL_POS;
const siteId = CERES_SHIPBREAK_SITE_ID;
const globalPos = sectorLocalToGlobalForSector(CERES_SHIPBREAK_LOCAL_POS, 'sector_ceres_belt');
const rootId = 'place_ceres_second_measure';
// Forge source is metres, rendered/simulated at exactly 2 WU per metre from authoring origin.
const SCALE = 2;
const definitions = [
  { id: 'long_plate', label: 'Long Plate', socket: 'SOCKET_Section_LongPlate', support: 'SOCKET_Support_A', mass: 1800, halfX: 34, halfZ: 55 },
  { id: 'crossbeam', label: 'Crossbeam', socket: 'SOCKET_Section_Crossbeam', support: 'SOCKET_Support_B', mass: 2200, halfX: 34, halfZ: 55 },
  { id: 'keel', label: 'Keel Section', socket: 'SOCKET_Section_Keel', support: 'SOCKET_Support_C', mass: 1200, halfX: 35, halfZ: 10 },
];
const cutId = id => `cut_${id}_seam`;
const braceId = id => `brace_${id}`;
const releaseId = id => `release_${id}_clamp`;
const supportId = id => `${id}_clamp`;
const webBoxes = () => [
  { x: 0, z: 0, halfX: 9, halfZ: 55 },
  ...[-21.5, 21.5].flatMap(x => [-48, 48].map(z => ({ x, z, halfX: 12.5, halfZ: 4 }))),
];
const shellBox = (id, x0, x1, z0, z1) => ({
  id, anchorId: 'SOCKET_Structure_Core', shape: 'box', bodyType: 'solid',
  offset: { x: (x0+x1)/2/SCALE, z: (z0+z1)/2/SCALE },
  halfExtents: { x: (x1-x0)/2/SCALE, z: (z1-z0)/2/SCALE },
});
export const CERES_SHIPBREAK_MANIFEST = {
  schemaVersion: 4, id: siteId, worldObjectId: siteId, name: 'Second Measure Shipbreak', sectorId: 'sector_ceres_belt',
  placement: { coordinateSpace: 'global_v1', pos: globalPos, rot: 0 },
  visualRoot: { placeId: rootId, anchorId: 'SOCKET_Structure_Core', initialScale: SCALE, visualRadius: 210, componentProxyPresentation: 'hidden' },
  requestStreams: [{ id: 'player-industrial-beam', owner: 'mining', sequenceSource: 'state.tick' },
    { id:'ceres-second-measure-cutter',owner:'npcJobsRuntime',sequenceSource:'state.tick' }],
  components: definitions.flatMap(d => [
    { id: d.id, label: `${d.label.toUpperCase()} — CUT SEAM`, kind: 'weakpoint', anchorId: d.socket, initialStatus: 'intact' },
    { id: supportId(d.id), label: `${d.label.toUpperCase()} — BRACE / RELEASE`, kind: 'repair', anchorId: d.support, initialStatus: 'unbraced' },
  ]),
  proxies: definitions.flatMap(d => [
    { id: `proxy_${d.id}`, componentId: d.id, anchorId: d.socket, offset: { x: 0, z: 0 }, shape: 'circle', radius: 28, bodyType: 'sensor' },
    { id: `proxy_${supportId(d.id)}`, componentId: supportId(d.id), anchorId: d.support, offset: { x: 0, z: 0 }, shape: 'circle', radius: 3, bodyType: 'sensor' },
  ]),
  collisionProxies: [
    shellBox('aft_island', -180, -114, -70, 99),
    shellBox('center_island', -46, 46, -70, 60),
    shellBox('fore_island', 114, 180, -70, 99),
    shellBox('keel_port_shoulder', -46, -35, 60, 99),
    shellBox('keel_starboard_shoulder', 35, 46, 60, 99),
  ],
  operations: definitions.flatMap(d => [
    { id: braceId(d.id), componentId: supportId(d.id), verb: 'repair', threshold: 24, from: ['unbraced'], to: 'braced', requestStreamId: 'player-industrial-beam' },
    { id: cutId(d.id), componentId: d.id, verb: 'cut', threshold: 54, from: ['intact'], to: 'cut', requestStreamId: 'player-industrial-beam', ...(d.id==='long_plate'?{additionalRequestStreamIds:['ceres-second-measure-cutter']}:{}), payloadId: d.id },
    { id: releaseId(d.id), componentId: supportId(d.id), verb: 'cut', threshold: 18, from: ['braced'], to: 'released', dependsOn: [cutId(d.id)], requestStreamId: 'player-industrial-beam', ...(d.id==='long_plate'?{additionalRequestStreamIds:['ceres-second-measure-cutter']}: {}) },
  ]),
  payloads: definitions.map(d => ({
    id: d.id, worldObjectId: `${siteId}/payload/${d.id}`, componentId: d.id,
    releaseOperationId: cutId(d.id), label: `Second Measure ${d.label}`, radius: Math.hypot(d.halfX, d.halfZ), mass: d.mass,
    // This IS the finite recovered section, never commodity loot plus a duplicate installed mass.
    salvagePool: {},
    structural: { halfX: d.halfX, halfZ: d.halfZ,
      ...(d.id !== 'keel' ? { boxes: webBoxes() } : {}),
      supportComponentId: supportId(d.id), supportStatus: 'braced',
      placeId: `${rootId}_${d.id}`, placeScale: SCALE },
  })),
  receivers: [], consequences: [], failureTriggers: [],
  stages: [{ id: 'working', placeId: rootId, scale: SCALE, label: 'SECOND MEASURE — SHIPBREAK', requires: [], presentation: {
    schemaVersion: 1,
    fixtures: definitions.map(d => ({ id: `lamp_${d.id}`, kind: 'status-light', socketId: d.support, componentId: supportId(d.id), color: 0xe6a747, intensity: 0.8, radius: 1, opacity: 0.8 })),
    animations: definitions.map(d => ({ id: `pulse_${d.id}`, kind: 'pulse', targetId: `lamp_${d.id}`, rate: 0.5, amplitude: 0.1 })),
  } }],
  persistence: { collection: 'state.sites.worldById', serializer: 'asteroidSites', recordSchemaVersion: 3 },
  discovery: { naturalProducer: 'asteroidSites', visibleOnDefaultRoute: true, revealRadius: 1100, initialDiscovered: true },
  mapAnnotation: { kind: 'world-site', poiType: 'derelict', label: 'Second Measure Shipbreak', searchText: 'Ceres Second Measure shipbreak brace cut release long plate crossbeam keel',
    coursePos: { x: globalPos.x - 80, z: globalPos.z - 150 }, courseLabel: 'Second Measure approach', courseArrivalRadius: 48 },
  producer: { kind: 'authored_static', cadence: 'sector_enter', sectorId: 'sector_ceres_belt' },
  debug: { packet: 'P03', fixture: 'ceres_second_measure', sectorLocalPlacement: CERES_SHIPBREAK_LOCAL_POS, reservationEnvelope: 740 },
};
