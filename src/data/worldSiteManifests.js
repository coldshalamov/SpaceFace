// PQ-017 — versioned data grammar for persistent multi-component World Sites.
// Runtime mutation stays in asteroidSites/worldSiteKernel; this file is inert content truth.

import { CERES_WRECK_CATHEDRAL_LOCAL_POS } from './sectorAnchors.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const WORLD_SITE_MANIFEST_VERSION = 4;

const CERES_WRECK_CATHEDRAL_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(CERES_WRECK_CATHEDRAL_LOCAL_POS, 'sector_ceres_belt'),
);

function stagePresentation(color, intensity, pulseRate, rotationRate) {
  return Object.freeze({
    schemaVersion: 1,
    fixtures: Object.freeze([
      Object.freeze({
        id: 'relay_status', kind: 'status-light', socketId: 'SOCKET_Emissive',
        componentId: 'relay_core', color, intensity, radius: 2.8, opacity: 0.88,
      }),
      Object.freeze({
        id: 'service_ring', kind: 'ring', socketId: 'SOCKET_Structure_Core',
        componentId: 'relay_core', color, intensity: intensity * 0.72, radius: 7.5, tube: 0.55, opacity: 0.68,
      }),
      Object.freeze({
        id: 'coupler_bar', kind: 'bar', socketId: 'SOCKET_Module_Defense',
        componentId: 'safety_coupler', color, intensity: intensity * 0.6,
        size: Object.freeze([4.8, 0.55, 0.55]), opacity: 0.62,
      }),
    ]),
    animations: Object.freeze([
      Object.freeze({ id: 'status_pulse', kind: 'pulse', targetId: 'relay_status', rate: pulseRate, amplitude: 0.18 }),
      Object.freeze({ id: 'ring_rotate', kind: 'rotate', targetId: 'service_ring', rate: rotationRate, amplitude: 1 }),
    ]),
  });
}

function cathedralStagePresentation(color, intensity, pulseRate, rotationRate) {
  return Object.freeze({
    schemaVersion: 1,
    fixtures: Object.freeze([
      Object.freeze({
        id: 'marker_status', kind: 'status-light', socketId: 'SOCKET_TheMarker',
        componentId: 'registry_scan_array', color, intensity, radius: 5.5, opacity: 0.92,
      }),
      Object.freeze({
        id: 'bridge_trace', kind: 'ring', socketId: 'ZONE_Bridge',
        componentId: 'bridge_navigation_record', color, intensity: intensity * 0.62,
        radius: 12, tube: 0.8, opacity: 0.5,
      }),
      Object.freeze({
        id: 'receiver_trace', kind: 'bar', socketId: 'ZONE_Service_Starboard',
        componentId: 'marker_service_spine', color, intensity: intensity * 0.72,
        size: Object.freeze([7.5, 0.8, 0.8]), opacity: 0.64,
      }),
    ]),
    animations: Object.freeze([
      Object.freeze({ id: 'marker_pulse', kind: 'pulse', targetId: 'marker_status', rate: pulseRate, amplitude: 0.2 }),
      Object.freeze({ id: 'bridge_rotate', kind: 'rotate', targetId: 'bridge_trace', rate: rotationRate, amplitude: 1 }),
    ]),
  });
}

export const WORLD_SITE_MANIFESTS = Object.freeze([
  Object.freeze({
    schemaVersion: WORLD_SITE_MANIFEST_VERSION,
    id: 'world_site_helios_relay',
    worldObjectId: 'world_site_helios_relay',
    name: 'Helios Recovery Relay',
    sectorId: 'sector_helios_prime',
    placement: Object.freeze({
      coordinateSpace: 'global_v1',
      pos: Object.freeze({ x: 760, z: -620 }),
      rot: 0.38,
    }),
    visualRoot: Object.freeze({
      placeId: 'place_claim_outpost_relay',
      anchorId: 'SOCKET_Structure_Core',
      initialScale: 0.14,
    }),
    requestStreams: Object.freeze([
      Object.freeze({ id: 'player-industrial-beam', owner: 'mining', sequenceSource: 'state.tick' }),
    ]),
    proxies: Object.freeze([
      Object.freeze({ id: 'proxy_relay_core', componentId: 'relay_core', anchorId: 'SOCKET_Structure_Core', shape: 'circle', bodyType: 'solid', radius: 12, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({
        id: 'proxy_cargo_brace',
        componentId: 'cargo_brace',
        anchorId: 'SOCKET_Module_Depot',
        shape: 'circle',
        bodyType: 'solid',
        bodyTypeByStatus: Object.freeze({ detached: 'sensor' }),
        radius: 9,
        offset: Object.freeze({ x: 2, z: 0 }),
      }),
      Object.freeze({ id: 'proxy_payload_cradle', componentId: 'payload_cradle', anchorId: 'SOCKET_Module_Refinery', shape: 'circle', bodyType: 'sensor', radius: 8, offset: Object.freeze({ x: -2, z: 1 }) }),
      Object.freeze({ id: 'proxy_receiver_collar', componentId: 'receiver_collar', anchorId: 'SOCKET_Dock_Approach', shape: 'circle', bodyType: 'sensor', radius: 10, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_safety_coupler', componentId: 'safety_coupler', anchorId: 'SOCKET_Module_Defense', shape: 'circle', bodyType: 'solid', radius: 6, offset: Object.freeze({ x: -2, z: 0 }) }),
      Object.freeze({ id: 'proxy_beacon_array', componentId: 'beacon_array', anchorId: 'SOCKET_Emissive', shape: 'circle', bodyType: 'sensor', radius: 7, offset: Object.freeze({ x: 3, z: 0 }) }),
    ]),
    components: Object.freeze([
      Object.freeze({ id: 'relay_core', label: 'RELAY CORE', kind: 'machine', anchorId: 'SOCKET_Structure_Core', initialStatus: 'damaged' }),
      Object.freeze({ id: 'cargo_brace', label: 'CARGO BRACE', kind: 'weakpoint', anchorId: 'SOCKET_Module_Depot', initialStatus: 'attached' }),
      Object.freeze({ id: 'payload_cradle', label: 'FIELD COIL CRADLE', kind: 'payload_mount', anchorId: 'SOCKET_Module_Refinery', initialStatus: 'sealed' }),
      Object.freeze({ id: 'receiver_collar', label: 'RECOVERY COLLAR', kind: 'receiver', anchorId: 'SOCKET_Dock_Approach', initialStatus: 'ready' }),
      Object.freeze({ id: 'safety_coupler', label: 'SAFETY COUPLER', kind: 'machine', anchorId: 'SOCKET_Module_Defense', initialStatus: 'failed' }),
      Object.freeze({ id: 'beacon_array', label: 'BEACON ARRAY', kind: 'machine', anchorId: 'SOCKET_Emissive', initialStatus: 'offline' }),
    ]),
    operations: Object.freeze([
      Object.freeze({ id: 'repair_relay_core', componentId: 'relay_core', verb: 'repair', requestStreamId: 'player-industrial-beam', threshold: 40, from: Object.freeze(['damaged', 'failed']), to: 'operational', dependsOn: Object.freeze([]), consequenceIds: Object.freeze([]) }),
      Object.freeze({ id: 'recover_safety_coupler', componentId: 'safety_coupler', verb: 'repair', requestStreamId: 'player-industrial-beam', threshold: 24, from: Object.freeze(['failed']), to: 'operational', dependsOn: Object.freeze([]), consequenceIds: Object.freeze([]) }),
      Object.freeze({ id: 'cut_cargo_brace', componentId: 'cargo_brace', verb: 'cut', requestStreamId: 'player-industrial-beam', threshold: 32, from: Object.freeze(['attached']), to: 'detached', dependsOn: Object.freeze(['repair_relay_core']), payloadId: 'relay_field_coil', consequenceIds: Object.freeze([]) }),
      Object.freeze({ id: 'unseal_payload_cradle', componentId: 'payload_cradle', verb: 'cut', requestStreamId: 'player-industrial-beam', threshold: 18, from: Object.freeze(['sealed']), to: 'open', dependsOn: Object.freeze(['cut_cargo_brace']), consequenceIds: Object.freeze([]) }),
      Object.freeze({ id: 'settle_field_coil', componentId: 'receiver_collar', verb: 'transfer', requestStreamId: 'player-industrial-beam', threshold: 1, from: Object.freeze(['ready']), to: 'settled', dependsOn: Object.freeze(['cut_cargo_brace']), payloadId: 'relay_field_coil', receiverId: 'relay_receiver', consequenceIds: Object.freeze(['field_coil_settled']) }),
      Object.freeze({ id: 'repair_beacon_array', componentId: 'beacon_array', verb: 'repair', requestStreamId: 'player-industrial-beam', threshold: 20, from: Object.freeze(['offline']), to: 'online', dependsOn: Object.freeze(['repair_relay_core', 'recover_safety_coupler']), consequenceIds: Object.freeze([]) }),
    ]),
    failureTriggers: Object.freeze([
      Object.freeze({
        id: 'safety_coupler_impact',
        event: 'physics:impact',
        actorPolicy: 'player-contact',
        componentId: 'safety_coupler',
        minDp: 160,
        from: Object.freeze(['operational']),
        recoveryOperationId: 'recover_safety_coupler',
      }),
    ]),
    payloads: Object.freeze([
      Object.freeze({
        id: 'relay_field_coil',
        worldObjectId: 'world_site_helios_relay/payload/relay_field_coil',
        label: 'Relay Field Coil',
        componentId: 'payload_cradle',
        releaseOperationId: 'cut_cargo_brace',
        radius: 6,
        mass: 180,
        salvagePool: Object.freeze({ cmdty_scrap_metal: 6, cmdty_electronics: 2 }),
      }),
    ]),
    receivers: Object.freeze([
      Object.freeze({
        id: 'relay_receiver',
        componentId: 'receiver_collar',
        acceptsPayloadIds: Object.freeze(['relay_field_coil']),
        settlementOperationId: 'settle_field_coil',
      }),
    ]),
    stages: Object.freeze([
      Object.freeze({ id: 'damaged', placeId: 'place_claim_outpost_relay', scale: 0.14, label: 'DARK RELAY', requires: Object.freeze([]), presentation: stagePresentation(0xff5b45, 0.95, 1.35, 0.32) }),
      Object.freeze({ id: 'powered', placeId: 'place_claim_outpost_base', scale: 0.16, label: 'RELAY POWERED', requires: Object.freeze(['repair_relay_core', 'recover_safety_coupler']), presentation: stagePresentation(0xffc24a, 1.08, 1.1, 0.5) }),
      Object.freeze({ id: 'opened', placeId: 'place_claim_outpost_base', scale: 0.18, label: 'RELAY OPEN', requires: Object.freeze(['repair_relay_core', 'recover_safety_coupler', 'cut_cargo_brace', 'unseal_payload_cradle']), presentation: stagePresentation(0x55d7ff, 1.16, 0.85, 0.64) }),
      Object.freeze({ id: 'recovered', placeId: 'place_claim_outpost_refinery', scale: 0.20, label: 'RECOVERY RELAY ONLINE', requires: Object.freeze(['repair_relay_core', 'recover_safety_coupler', 'cut_cargo_brace', 'unseal_payload_cradle', 'settle_field_coil', 'repair_beacon_array']), presentation: stagePresentation(0x6eff9b, 1.25, 0.7, 0.78) }),
    ]),
    consequences: Object.freeze([
      Object.freeze({ id: 'field_coil_settled', intents: Object.freeze([
        { domain: 'economy', type: 'economy:grantCredits', payload: Object.freeze({ amount: 450, reason: 'world_site_recovery' }) },
        { domain: 'faction', type: 'faction:repDelta', payload: Object.freeze({ factionId: 'faction_scn', delta: 1, reason: 'world_site_recovery' }) },
      ]) }),
    ]),
    persistence: Object.freeze({ collection: 'state.sites.worldById', serializer: 'asteroidSites', recordSchemaVersion: 2 }),
    discovery: Object.freeze({ naturalProducer: 'asteroidSites', visibleOnDefaultRoute: true, revealRadius: 900, initialDiscovered: true }),
    mapAnnotation: Object.freeze({
      kind: 'world-site', poiType: 'recovery-relay', label: 'Helios Recovery Relay',
      searchText: 'Helios Recovery Relay world site industrial salvage beacon field coil',
    }),
    trafficHook: Object.freeze({
      id: 'helios_recovery_service', stationId: 'station_helios',
      eligibleRoles: Object.freeze(['hauler', 'courier']),
      label: 'Helios Station ↔ Recovery Relay',
    }),
    producer: Object.freeze({ kind: 'authored_static', cadence: 'sector_enter', sectorId: 'sector_helios_prime' }),
    debug: Object.freeze({ packet: 'PQ-017', fixture: 'helios_recovery_relay', routeNote: 'Helios default flight route' }),
  }),
  Object.freeze({
    schemaVersion: WORLD_SITE_MANIFEST_VERSION,
    id: 'world_site_wreck_cathedral',
    worldObjectId: 'world_site_wreck_cathedral',
    name: 'Wreck Cathedral',
    sectorId: 'sector_ceres_belt',
    placement: Object.freeze({
      coordinateSpace: 'global_v1',
      pos: CERES_WRECK_CATHEDRAL_GLOBAL_POS,
      rot: 0,
    }),
    visualRoot: Object.freeze({
      placeId: 'place_landmark_wreck_cathedral',
      anchorId: 'INTERACTION_HangarCavity',
      initialScale: 1,
      visualRadius: 360,
      componentProxyPresentation: 'hidden',
    }),
    requestStreams: Object.freeze([
      Object.freeze({ id: 'player-industrial-beam', owner: 'mining', sequenceSource: 'state.tick' }),
    ]),
    proxies: Object.freeze([
      Object.freeze({
        id: 'proxy_cathedral_hull', componentId: 'cathedral_hull',
        anchorId: 'ZONE_Service_Starboard', shape: 'circle', bodyType: 'sensor',
        radius: 24, offset: Object.freeze({ x: 0, z: -30 }),
      }),
      Object.freeze({ id: 'proxy_bridge_navigation_record', componentId: 'bridge_navigation_record', anchorId: 'ZONE_Bridge', shape: 'circle', bodyType: 'sensor', radius: 20, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_registry_scan_array', componentId: 'registry_scan_array', anchorId: 'SOCKET_TheMarker', shape: 'circle', bodyType: 'sensor', radius: 18, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_emergency_relay_clock', componentId: 'emergency_relay_clock', anchorId: 'SALVAGE_ConduitBank', shape: 'circle', bodyType: 'sensor', radius: 16, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_cargo_clamp_forensics', componentId: 'cargo_clamp_forensics', anchorId: 'SALVAGE_ServiceRack', shape: 'circle', bodyType: 'sensor', radius: 18, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_cathedral_black_box', componentId: 'cathedral_black_box_or_device', anchorId: 'ZONE_Service_Port', shape: 'circle', bodyType: 'sensor', radius: 12, offset: Object.freeze({ x: 0, z: 0 }) }),
      Object.freeze({ id: 'proxy_marker_service_spine', componentId: 'marker_service_spine', anchorId: 'ZONE_Service_Starboard', shape: 'circle', bodyType: 'sensor', radius: 22, offset: Object.freeze({ x: 0, z: 0 }) }),
    ]),
    collisionProxies: Object.freeze([
      Object.freeze({ id: 'upper_port_outer', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 68, offset: Object.freeze({ x: -248.99363452, z: -162.99468677 }) }),
      Object.freeze({ id: 'upper_port_inner', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 68, offset: Object.freeze({ x: -71.99363452, z: -162.99468677 }) }),
      Object.freeze({ id: 'upper_starboard_inner', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 68, offset: Object.freeze({ x: 103.00636548, z: -162.99468677 }) }),
      Object.freeze({ id: 'upper_starboard_outer', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 68, offset: Object.freeze({ x: 280.00636548, z: -162.99468677 }) }),
      Object.freeze({ id: 'lower_port', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 76, offset: Object.freeze({ x: -203.99363452, z: 92.00531323 }) }),
      Object.freeze({ id: 'lower_center', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 76, offset: Object.freeze({ x: 16.00636548, z: 92.00531323 }) }),
      Object.freeze({ id: 'lower_starboard', anchorId: 'INTERACTION_HangarCavity', shape: 'circle', bodyType: 'solid', failureComponentId: 'cathedral_hull', radius: 76, offset: Object.freeze({ x: 236.00636548, z: 92.00531323 }) }),
    ]),
    components: Object.freeze([
      Object.freeze({ id: 'cathedral_hull', label: 'CATHEDRAL HULL', kind: 'machine', anchorId: 'INTERACTION_HangarCavity', initialStatus: 'failed' }),
      Object.freeze({ id: 'bridge_navigation_record', label: 'BRIDGE NAVIGATION RECORD', kind: 'archive', anchorId: 'ZONE_Bridge', initialStatus: 'sealed' }),
      Object.freeze({ id: 'registry_scan_array', label: 'REGISTRY SCAN ARRAY', kind: 'archive', anchorId: 'SOCKET_TheMarker', initialStatus: 'offline' }),
      Object.freeze({ id: 'emergency_relay_clock', label: 'EMERGENCY RELAY CLOCK', kind: 'machine', anchorId: 'SALVAGE_ConduitBank', initialStatus: 'damaged' }),
      Object.freeze({ id: 'cargo_clamp_forensics', label: 'CARGO CLAMP FORENSICS', kind: 'weakpoint', anchorId: 'SALVAGE_ServiceRack', initialStatus: 'attached' }),
      Object.freeze({ id: 'cathedral_black_box_or_device', label: 'CATHEDRAL BLACK BOX', kind: 'payload_mount', anchorId: 'ZONE_Service_Port', initialStatus: 'sealed' }),
      Object.freeze({ id: 'marker_service_spine', label: 'MARKER SERVICE SPINE', kind: 'receiver', anchorId: 'ZONE_Service_Starboard', initialStatus: 'offline' }),
    ]),
    operations: Object.freeze([
      Object.freeze({ id: 'stabilize_cathedral_hull', componentId: 'cathedral_hull', verb: 'repair', requestStreamId: 'player-industrial-beam', threshold: 48, from: Object.freeze(['failed']), to: 'stabilized', dependsOn: Object.freeze([]), consequenceIds: Object.freeze([]) }),
      Object.freeze({
        id: 'extract_bridge_navigation_record', componentId: 'bridge_navigation_record', verb: 'extract',
        requestStreamId: 'player-industrial-beam', threshold: 24, from: Object.freeze(['sealed']), to: 'recovered',
        dependsOn: Object.freeze(['stabilize_cathedral_hull']), consequenceIds: Object.freeze([]),
        evidencePageId: 'wreck_cathedral.missing_convoy', evidenceRevision: 1, evidenceCatalogRevision: 1,
        evidenceProvenanceRef: 'wreck_cathedral/c1_01',
      }),
      Object.freeze({
        id: 'extract_registry_scan', componentId: 'registry_scan_array', verb: 'extract',
        requestStreamId: 'player-industrial-beam', threshold: 20, from: Object.freeze(['offline']), to: 'matched',
        dependsOn: Object.freeze(['stabilize_cathedral_hull']), consequenceIds: Object.freeze([]),
        evidencePageId: 'wreck_cathedral.capital_hull_located', evidenceRevision: 1, evidenceCatalogRevision: 1,
        evidenceProvenanceRef: 'wreck_cathedral/c1_02',
      }),
      Object.freeze({
        id: 'repair_emergency_relay_clock', componentId: 'emergency_relay_clock', verb: 'repair',
        requestStreamId: 'player-industrial-beam', threshold: 28, from: Object.freeze(['damaged']), to: 'synchronized',
        dependsOn: Object.freeze(['stabilize_cathedral_hull']), consequenceIds: Object.freeze([]),
        evidencePageId: 'wreck_cathedral.clock_stopped_first', evidenceRevision: 1, evidenceCatalogRevision: 1,
        evidenceProvenanceRef: 'wreck_cathedral/c1_03',
      }),
      Object.freeze({
        id: 'cut_cargo_clamp_forensics', componentId: 'cargo_clamp_forensics', verb: 'cut',
        requestStreamId: 'player-industrial-beam', threshold: 36, from: Object.freeze(['attached']), to: 'released',
        dependsOn: Object.freeze(['stabilize_cathedral_hull', 'repair_emergency_relay_clock']),
        payloadId: 'cathedral_black_box', consequenceIds: Object.freeze([]),
        evidencePageId: 'wreck_cathedral.released_from_inside', evidenceRevision: 1, evidenceCatalogRevision: 1,
        evidenceProvenanceRef: 'wreck_cathedral/c1_04',
      }),
      Object.freeze({ id: 'repair_marker_service_spine', componentId: 'marker_service_spine', verb: 'repair', requestStreamId: 'player-industrial-beam', threshold: 30, from: Object.freeze(['offline']), to: 'ready', dependsOn: Object.freeze(['stabilize_cathedral_hull']), consequenceIds: Object.freeze([]) }),
      Object.freeze({
        id: 'settle_cathedral_black_box', componentId: 'marker_service_spine', verb: 'transfer',
        requestStreamId: 'player-industrial-beam', threshold: 1, from: Object.freeze(['ready']), to: 'settled',
        dependsOn: Object.freeze(['cut_cargo_clamp_forensics', 'repair_marker_service_spine']),
        payloadId: 'cathedral_black_box', receiverId: 'cathedral_archive_receiver',
        consequenceIds: Object.freeze(['cathedral_archive_settled']),
        evidencePageId: 'wreck_cathedral.what_was_carried', evidenceRevision: 1, evidenceCatalogRevision: 1,
        evidenceProvenanceRef: 'wreck_cathedral/c1_05',
      }),
    ]),
    failureTriggers: Object.freeze([
      Object.freeze({
        id: 'cathedral_hull_impact', event: 'physics:impact', actorPolicy: 'player-contact',
        componentId: 'cathedral_hull', minDp: 220, from: Object.freeze(['stabilized']),
        recoveryOperationId: 'stabilize_cathedral_hull',
      }),
    ]),
    payloads: Object.freeze([
      Object.freeze({
        id: 'cathedral_black_box',
        worldObjectId: 'world_site_wreck_cathedral/payload/cathedral_black_box',
        label: 'Cathedral Black Box',
        componentId: 'cathedral_black_box_or_device',
        releaseOperationId: 'cut_cargo_clamp_forensics',
        radius: 4,
        mass: 140,
        salvagePool: Object.freeze({ cmdty_salvage_electronics: 2, cmdty_classified_salvage: 1 }),
      }),
    ]),
    receivers: Object.freeze([
      Object.freeze({
        id: 'cathedral_archive_receiver',
        componentId: 'marker_service_spine',
        acceptsPayloadIds: Object.freeze(['cathedral_black_box']),
        settlementOperationId: 'settle_cathedral_black_box',
      }),
    ]),
    stages: Object.freeze([
      Object.freeze({ id: 'dark', placeId: 'place_landmark_wreck_cathedral', scale: 1, label: 'WRECK CATHEDRAL', requires: Object.freeze([]), presentation: cathedralStagePresentation(0x6594a6, 0.78, 0.55, 0.08) }),
      Object.freeze({ id: 'stabilized', placeId: 'place_landmark_wreck_cathedral', scale: 1, label: 'WRECK CATHEDRAL — STABILIZED', requires: Object.freeze(['stabilize_cathedral_hull']), presentation: cathedralStagePresentation(0x72c9d4, 0.92, 0.7, 0.12) }),
      Object.freeze({ id: 'opened', placeId: 'place_landmark_wreck_cathedral', scale: 1, label: 'WRECK CATHEDRAL — RECORDS OPEN', requires: Object.freeze(['stabilize_cathedral_hull', 'extract_bridge_navigation_record', 'extract_registry_scan', 'repair_emergency_relay_clock', 'cut_cargo_clamp_forensics']), presentation: cathedralStagePresentation(0xe8b96b, 1.08, 0.85, 0.18) }),
      Object.freeze({ id: 'archived', placeId: 'place_landmark_wreck_cathedral', scale: 1, label: 'WRECK CATHEDRAL — ARCHIVE LINKED', requires: Object.freeze(['stabilize_cathedral_hull', 'extract_bridge_navigation_record', 'extract_registry_scan', 'repair_emergency_relay_clock', 'cut_cargo_clamp_forensics', 'repair_marker_service_spine', 'settle_cathedral_black_box']), presentation: cathedralStagePresentation(0x7ddf9f, 1.2, 0.65, 0.24) }),
    ]),
    consequences: Object.freeze([
      Object.freeze({ id: 'cathedral_archive_settled', intents: Object.freeze([
        { domain: 'economy', type: 'economy:grantCredits', payload: Object.freeze({ amount: 650, reason: 'wreck_cathedral_archive' }) },
        { domain: 'faction', type: 'faction:repDelta', payload: Object.freeze({ factionId: 'faction_archive', delta: 1, reason: 'wreck_cathedral_archive' }) },
      ]) }),
    ]),
    persistence: Object.freeze({ collection: 'state.sites.worldById', serializer: 'asteroidSites', recordSchemaVersion: 3 }),
    discovery: Object.freeze({ naturalProducer: 'asteroidSites', visibleOnDefaultRoute: true, revealRadius: 1300, initialDiscovered: true }),
    mapAnnotation: Object.freeze({
      kind: 'world-site', poiType: 'capital-wreck', label: 'Wreck Cathedral',
      searchText: 'Wreck Cathedral Ceres capital wreck Concord Vigilant archive black box',
    }),
    producer: Object.freeze({ kind: 'authored_static', cadence: 'sector_enter', sectorId: 'sector_ceres_belt' }),
    debug: Object.freeze({
      packet: 'PQ-018',
      fixture: 'wreck_cathedral',
      routeNote: 'Ceres local reservation (300, 2700)',
      sectorLocalPlacement: CERES_WRECK_CATHEDRAL_LOCAL_POS,
      reservationEnvelope: 620,
    }),
  }),
]);

const WORLD_SITE_MANIFEST_BY_ID = new Map(WORLD_SITE_MANIFESTS.map((manifest) => [manifest.id, manifest]));

export function worldSiteManifestById(id) {
  return WORLD_SITE_MANIFEST_BY_ID.get(id) || null;
}

export default WORLD_SITE_MANIFESTS;
