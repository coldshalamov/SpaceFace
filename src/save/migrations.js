// Ordered save-schema migrations (ARCHITECTURE §4.5). Each entry: { from, to, fn(data) } where
// fn mutates the `data` envelope payload in place to move it one version forward. loadEnvelope
// runs the matching chain from the save's version up to CURRENT_VERSION. Migrations must be pure
// and re-runnable; a throw aborts the load (no partial mutation of live state — we migrate a
// candidate copy first).
//
// CURRENT_VERSION lives in src/data/saveVersion.js (the single source of truth) and is re-exported
// here for convenience.
// When the schema changes: bump CURRENT_VERSION in saveVersion.js and append { from:N-1, to:N, fn }.
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { COORDINATE_SCHEMA } from '../core/coordinates.js';

export { CURRENT_VERSION } from '../data/saveVersion.js';

function finiteXZ(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function offsetPos(value, sectorId) {
  if (!finiteXZ(value)) return;
  const origin = sectorGlobalOrigin(sectorId);
  value.x += origin.x;
  value.z += origin.z;
}

function offsetFields(value, sectorId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return;
  const origin = sectorGlobalOrigin(sectorId);
  value.x += origin.x;
  value.z += origin.z;
}

function migrateV8ToV9(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  if (!data.world || typeof data.world !== 'object' || Array.isArray(data.world)) data.world = {};
  // Migrations are normally version-gated, but keep this step safe to re-run in isolation too.
  if (data.world.coordinateSchema === COORDINATE_SCHEMA) {
    data.world.frameOrigin = { x: 0, z: 0 };
    data.world.frameOriginSeq = 0;
    return;
  }
  const currentSectorId = data.world.currentSectorId || 'sector_helios_prime';
  data.world.coordinateSchema = COORDINATE_SCHEMA;
  data.world.frameOrigin = { x: 0, z: 0 };
  data.world.frameOriginSeq = 0;

  if (data.entities && typeof data.entities === 'object') {
    offsetPos(data.entities.player && data.entities.player.pos, currentSectorId);
    if (Array.isArray(data.entities.persistent)) {
      for (const entity of data.entities.persistent) offsetPos(entity && entity.pos, currentSectorId);
    }
  }
  offsetPos(data.world.entryPoint, currentSectorId);

  for (const [sectorId, pings] of Object.entries(data.world.scanPings || {})) {
    if (Array.isArray(pings)) for (const ping of pings) offsetPos(ping && ping.pos, sectorId);
  }
  for (const [sectorId, pending] of Object.entries(data.world.pendingSpawns || {})) {
    if (Array.isArray(pending)) {
      for (const request of pending) offsetPos(request && request.position, request && request.sectorId || sectorId);
    }
  }

  if (data.nav && typeof data.nav === 'object') {
    const waypoint = data.nav.waypoint;
    offsetPos(waypoint && waypoint.pos, waypoint && waypoint.sectorId || currentSectorId);
    offsetPos(data.nav.autopilot && data.nav.autopilot.target, currentSectorId);
  }
  for (const [sectorId, markers] of Object.entries(data.aftermathWrecks && data.aftermathWrecks.bySector || {})) {
    if (Array.isArray(markers)) for (const marker of markers) offsetPos(marker && marker.pos, marker && marker.sectorId || sectorId);
  }
  if (Array.isArray(data.claims && data.claims.bodies)) {
    for (const body of data.claims.bodies) offsetFields(body, body && body.sectorId || currentSectorId);
  }
  if (data.automation && typeof data.automation === 'object') {
    if (Array.isArray(data.automation.drones)) {
      for (const drone of data.automation.drones) offsetPos(drone && drone.originPos, drone && drone.sectorId || currentSectorId);
    }
    if (Array.isArray(data.automation.outposts)) {
      for (const outpost of data.automation.outposts) offsetPos(outpost && outpost.pos, outpost && outpost.sectorId || currentSectorId);
    }
  }
  if (Array.isArray(data.missions && data.missions.active)) {
    for (const mission of data.missions.active) {
      if (!mission || typeof mission !== 'object') continue;
      const sectorId = mission.sectorId || mission.destSectorId || currentSectorId;
      offsetPos(mission.pos, sectorId);
      offsetPos(mission.targetPos, sectorId);
      offsetPos(mission.waypoint && mission.waypoint.pos, mission.waypoint && mission.waypoint.sectorId || sectorId);
    }
  }
}

export const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    fn(data) {
      if (!data.crafting || typeof data.crafting !== 'object') {
        data.crafting = { queues: {} };
        return;
      }
      if (!data.crafting.queues || typeof data.crafting.queues !== 'object') {
        data.crafting.queues = {};
      }
    },
  },
  // v3: offscreen sector-simulation engine (ADR-0002 / V2 §33). Old saves have no data.sectorSim;
  // seed an empty subtree so sectorSim.deserialize can overlay defaults cleanly. Pure + idempotent.
  {
    from: 2,
    to: 3,
    fn(data) {
      if (!data.sectorSim || typeof data.sectorSim !== 'object') {
        data.sectorSim = { sectors: {}, meta: {} };
        return;
      }
      if (!data.sectorSim.sectors || typeof data.sectorSim.sectors !== 'object') data.sectorSim.sectors = {};
      if (!data.sectorSim.meta || typeof data.sectorSim.meta !== 'object') data.sectorSim.meta = {};
    },
  },
  // v4: SG-02 dynamic authority makes entity angVel and `rapier-dynamic` gameplay settings
  // authoritative save fields. Existing v3 saves may omit them; omission remains a valid zero/default.
  {
    from: 3,
    to: 4,
    fn(data) {
      if (data && data.entities && data.entities.player && typeof data.entities.player === 'object') {
        if (data.entities.player.angVel != null && typeof data.entities.player.angVel !== 'number') {
          data.entities.player.angVel = 0;
        }
      }
      if (data && data.entities && Array.isArray(data.entities.persistent)) {
        for (const entity of data.entities.persistent) {
          if (entity && typeof entity === 'object' && entity.angVel != null && typeof entity.angVel !== 'number') {
            entity.angVel = 0;
          }
        }
      }
    },
  },
  // v5: SG-03 semantic combat state. Old saves intentionally begin with no queued/active action
  // state or Massline attachments; the runtime rebuilds fresh combat services on load.
  {
    from: 4,
    to: 5,
    fn(data) {
      if (!data.combat || typeof data.combat !== 'object') {
        data.combat = {
          schemaVersion: 1,
          combatSchemaVersion: 1,
          statusNextPendingSeq: 1,
          entities: [],
          actions: {
            nextRequestSeq: 1,
            nextInstanceSeq: 1,
            requests: [],
            active: [],
            cooldowns: [],
          },
          attachments: { nextId: 1, byId: {} },
        };
      }
    },
  },
  // v6: player-authored navigation intent. Old saves begin with no active route/waypoint, while
  // current saves can resume a trade route or plotted course after Continue.
  {
    from: 5,
    to: 6,
    fn(data) {
      if (!data.nav || typeof data.nav !== 'object' || Array.isArray(data.nav)) {
        data.nav = { route: null, autoTravel: false, waypoint: null };
        return;
      }
      if (!('route' in data.nav)) data.nav.route = null;
      if (data.nav.autoTravel !== true) data.nav.autoTravel = false;
      if (!('waypoint' in data.nav)) data.nav.waypoint = null;
    },
  },
  // v7: BP-01.1 loss-ledger provenance. Old saves start with no recorded losses, while current
  // saves preserve the event-sourced "who died here" records across Continue.
  {
    from: 6,
    to: 7,
    fn(data) {
      if (!data.lossLedger || typeof data.lossLedger !== 'object' || Array.isArray(data.lossLedger)) {
        data.lossLedger = { entries: [], seed: 0, ghostConvoy: { fired: {} } };
        return;
      }
      if (!Array.isArray(data.lossLedger.entries)) data.lossLedger.entries = [];
      if (typeof data.lossLedger.seed !== 'number') data.lossLedger.seed = 0;
      if (!data.lossLedger.ghostConvoy || typeof data.lossLedger.ghostConvoy !== 'object') {
        data.lossLedger.ghostConvoy = { fired: {} };
      }
      if (!data.lossLedger.ghostConvoy.fired || typeof data.lossLedger.ghostConvoy.fired !== 'object') {
        data.lossLedger.ghostConvoy.fired = {};
      }
    },
  },
  // v8: BP-01/C11 battle-aftermath wreck markers. Old saves begin with no recorded live battle
  // residue; current saves preserve named-zone wreck markers across Continue.
  {
    from: 7,
    to: 8,
    fn(data) {
      if (!data.aftermathWrecks || typeof data.aftermathWrecks !== 'object' || Array.isArray(data.aftermathWrecks)) {
        data.aftermathWrecks = { schemaVersion: 1, bySector: {}, seed: 0 };
        return;
      }
      data.aftermathWrecks.schemaVersion = 1;
      if (!data.aftermathWrecks.bySector || typeof data.aftermathWrecks.bySector !== 'object' || Array.isArray(data.aftermathWrecks.bySector)) {
        data.aftermathWrecks.bySector = {};
      }
      if (typeof data.aftermathWrecks.seed !== 'number') data.aftermathWrecks.seed = 0;
    },
  },
  {
    from: 8,
    to: 9,
    fn: migrateV8ToV9,
  },
  // v10: optional, non-binding first-dock career origins. Old saves start with a clean origin
  // container; each origin system overlays its own versioned defaults during deserialize.
  // CL-00 careerLadders intentionally are not seeded on this historical v9-to-v10 step.
  // CURRENT_VERSION is already 11; missing careerLadders default through the registered
  // careerLadders system deserialize path, without pretending this older migration was live
  // for ladders or introducing a competing save-version bump.
  {
    from: 9,
    to: 10,
    fn(data) {
      if (!data.careerOrigins || typeof data.careerOrigins !== 'object' || Array.isArray(data.careerOrigins)) {
        data.careerOrigins = {
          schemaId: 'spaceface.careerOrigins.v1',
          schemaVersion: 1,
          origins: {},
        };
      }
      // Missing careerLadders intentionally default during system deserialize.
    },
  },
];
