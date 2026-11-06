// World-owned, spawn-time scenery for the inhabited shore. No live entities,
// clocks, cargo or outcomes: the existing dressing table owns admission/teardown.
import {
  LANTERN_WARD_ID, LANTERN_WARD_SECTOR, LANTERN_WARD_ANCHOR,
  LANTERN_WARD_ASSET_VERSION, LANTERN_WARD_BODY_CONTRACTS,
  LANTERN_WARD_KIT_DRESSING, LANTERN_WARD_SHORE_SPINES, lanternWardPoint,
} from '../data/lanternWardLayout.js';
import { insertDressingRow } from './dressingTable.js';

export function lanternWardAnchor(owner, sector, active) {
  if (sector?.id !== LANTERN_WARD_SECTOR) return null;
  const live = active?.pois?.find(row => row.poiId === LANTERN_WARD_ANCHOR);
  if (Number.isFinite(live?.pos?.x) && Number.isFinite(live?.pos?.z)) return live.pos;
  const authored = sector.pois?.find(row => row.id === LANTERN_WARD_ANCHOR);
  return authored?.pos ? owner._toGlobal(authored.pos, sector.id) : null;
}

const cheeks = [
  { id: 'service_cut_north', point: 'serviceCutNorth' },
  { id: 'service_cut_south', point: 'serviceCutSouth' },
];

/** Same measured planar boxes as the production geometry, in native proxy units. */
export function lanternWardSceneryProxy(role) {
  if (role !== 'service_cheek' && role !== 'shore_spine') return null;
  const c = LANTERN_WARD_BODY_CONTRACTS[role];
  return {
    schemaVersion: 1, id: `lantern-ward:${role}:v${LANTERN_WARD_ASSET_VERSION}`,
    referenceRadius: 'radius',
    primitives: c.collision.map((b, i) => ({
      kind: 'obb', id: `${role}_${i}`, x: b.x / c.radius, z: b.z / c.radius,
      hx: b.hx / c.radius, hz: b.hz / c.radius, angle: 0,
    })),
  };
}

/** Protect authored structure and the short cut/bypass before procedural scatter. */
export function lanternWardReservations(owner, sector, active) {
  const anchor = lanternWardAnchor(owner, sector, active);
  if (!anchor) return [];
  const rows = LANTERN_WARD_KIT_DRESSING.map(row => ({
    pos: lanternWardPoint(anchor, row.offset), radius: row.radius + 5,
  }));
  for (const row of LANTERN_WARD_SHORE_SPINES) rows.push({
    pos: lanternWardPoint(anchor, row.offset), radius: LANTERN_WARD_BODY_CONTRACTS.shore_spine.radius + 5,
  });
  for (const row of cheeks) rows.push({
    pos: lanternWardPoint(anchor, row.point), radius: LANTERN_WARD_BODY_CONTRACTS.service_cheek.radius + 5,
  });
  // These are clearance reservations for new scatter, never colliders or a relocation
  // of existing Helios anchors, traffic, the sample pod or the northeast Pit route.
  for (const key of ['cradle', 'obstruction', 'receiver', 'serviceStand', 'approach', 'bypassWest', 'bypassEast']) {
    rows.push({ pos: lanternWardPoint(anchor, key), radius: key === 'receiver' ? 36 : 55 });
  }
  return rows;
}

export function materializeLanternWardDressing(owner, sector, active) {
  const anchor = lanternWardAnchor(owner, sector, active);
  if (!anchor || !active || active.lanternWardDressing === true) return 0;
  let count = 0;
  for (const row of LANTERN_WARD_KIT_DRESSING) {
    const entity = owner._spawnPlaceProp(active, sector, row.placeId, lanternWardPoint(anchor, row.offset), {
      name: row.name, rot: row.rot, radius: row.radius, paletteClass: 'core', everydaySpaceKit: true,
    });
    if (entity) {
      entity.data.lanternWardId = LANTERN_WARD_ID;
      entity.data.lanternWardSceneryId = row.id;
      count++;
    }
  }
  function structure(role, row, pos) {
    const c = LANTERN_WARD_BODY_CONTRACTS[role];
    const entity = insertDressingRow(owner.state, {
      pos, rot: row.rot || 0, radius: c.radius, homeSectorId: sector.id,
      collides: true,
      physicsBody: { schemaVersion: 1, dynamic: false, material: 'prop', radius: c.radius,
        collisionProxyManifest: lanternWardSceneryProxy(role), revision: 0 },
      data: {
        lanternWardId: LANTERN_WARD_ID, lanternWardRole: role,
        lanternWardWhiteSide: row.whiteSide === true,
        worldRecordId: `lantern-ward:scenery:${row.id}:v1`,
        placeId: c.assetId, placeScale: 1, worldDressing: true,
        sectorId: sector.id, homeSectorId: sector.id, paletteClass: 'core',
        name: role === 'service_cheek' ? 'Patched Service Arch' : row.whiteSide ? 'White Side Rim' : 'Lantern Steps Service Spine',
        visualRadius: c.radius, placeRadius: c.radius,
      },
    });
    active.dressing.push({ id: entity.id, placeId: c.assetId, pos: { ...pos }, paletteClass: 'core' });
    count++;
  }
  for (const row of LANTERN_WARD_SHORE_SPINES) structure('shore_spine', row, lanternWardPoint(anchor, row.offset));
  for (const row of cheeks) structure('service_cheek', row, lanternWardPoint(anchor, row.point));
  active.lanternWardDressing = true;
  return count;
}
