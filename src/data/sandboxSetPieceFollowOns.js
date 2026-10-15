// §22 B7 — every authored set piece ends in a new contract, never a fail-and-reload.
// A convoy loss becomes salvage, a heist becomes an escape, a disabled ship becomes a tow, and
// the other eight pieces (the ace, the reef, the crusher, the impound cradle, the pod rescue,
// both tows and the wrecking ball) each post one distinct follow-on built from the board's
// existing mission types.

import { AUTHORED_SET_PIECE_TYPE, authoredSetPieceById } from './missions.js';

export const SET_PIECE_FOLLOW_ON_SOURCE = 'setPieceFollowOn';

const FOLLOW_ON_LIFE_EPOCHS = 3;

// The eight consequences beside the convoy, the heist and the door-jam. Each row is a job the
// board already knows how to run, so it is playable the moment it posts. The thread is the same
// every time: the board line names what the player did (assess), the pod or the contract's own
// body sits at the scene (approach), accepting commits, the job's built-in pressure is the
// complication, the dock settles it, and the debrief is the aftermath.
//   salvage_retrieval  accepting spawns a claim wreck with a claim crew at the destination
//   smuggling_run      the den's customs scans decide the run
//   escort             the convoy spawns with a raider wing on the final approach
//   patrol_clear      the hostiles spawn on accept
//   tow_recovery       the contract spawns its own core
// `destStationId` / `destSectorId` left out mean the station the player just worked. `pod` is
// the body left in the world; a row without one spawns its own on accept.
const AFTERMATH = Object.freeze({
  ace_duel: Object.freeze({
    type: 'salvage_retrieval',
    title: "Recover the ace's flight recorder",
    brief: "The ace's wing crew filed a claim on the recorder and are cutting it free. Get there first.",
    summary: "The ace's flight recorder tumbled loose.",
    reward_cr: 1180,
    distance: 700,
    params: Object.freeze({ cmdtyId: 'cmdty_classified_salvage', qty: 1, fValue: 1, taskTime: 30 }),
    pod: Object.freeze({ scanLabel: 'FLIGHT RECORDER', radius: 4, mass: 14, hull: 24 }),
  }),
  reef_clearance: Object.freeze({
    type: 'salvage_retrieval',
    title: 'Strip the cache the reef hid',
    brief: 'Clearing the reef opened a salvage cache. Other crews saw it open. Get there first.',
    summary: 'Clearing the reef exposed a salvage cache.',
    reward_cr: 1090,
    distance: 800,
    params: Object.freeze({ cmdtyId: 'cmdty_salvage_electronics', qty: 4, fValue: 1, taskTime: 30 }),
    pod: Object.freeze({ scanLabel: 'REEF CACHE', radius: 6, mass: 24, hull: 36 }),
  }),
  ore_crusher: Object.freeze({
    type: 'cargo_delivery',
    title: 'Haul the spilled ore to the Foundry',
    brief: 'The jammed jaws spilled a field of ore across the yard. Scoop it up and feed it back in.',
    summary: 'The jammed crusher spilled its ore.',
    reward_cr: 940,
    distance: 400,
    destStationId: 'station_forge',
    destSectorId: 'sector_vesta_forge',
    params: Object.freeze({ cmdtyId: 'cmdty_ore_iron', qty: 8, fValue: 1, taskTime: 20 }),
    pod: Object.freeze({ scanLabel: 'SPILLED ORE', radius: 6, mass: 30, hull: 40 }),
  }),
  impound_break: Object.freeze({
    type: 'smuggling_run',
    title: 'Run the seized hold to the den',
    brief: 'The cradle lock is off and its hold is hot. Do not slow at the Customs Gate. Get it to the den.',
    summary: 'The broken cradle left a seized hold to move.',
    reward_cr: 1240,
    distance: 1800,
    destStationId: 'station_smuggler',
    destSectorId: 'sector_pallas_drift',
    params: Object.freeze({ cmdtyId: 'cmdty_stolen_goods', qty: 2, fValue: 1, taskTime: 20 }),
    pod: Object.freeze({ scanLabel: 'SEIZED HOLD', radius: 5, mass: 20, hull: 30 }),
  }),
  pod_rescue: Object.freeze({
    type: 'escort',
    title: 'Walk the rescued crews to the yard',
    brief: 'The pulled pods held crews with nowhere to dock. Raiders saw the rescue. Walk them in to Ceres Refinery.',
    summary: 'The rescued crews needed an escort in.',
    reward_cr: 990,
    distance: 600,
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    inheritFaction: true,
    params: Object.freeze({
      targetStrength: 1.4, convoySize: 2, ambushSize: 2, fValue: 1.4, taskTime: 90,
    }),
    pod: null,
  }),
  long_tow: Object.freeze({
    type: 'patrol_clear',
    title: 'Run the claim jumpers off the yard lane',
    brief: 'The slag core is in, and jumpers are circling the approach to cut their share. Clear them.',
    summary: 'The slag core drew claim jumpers to the yard lane.',
    reward_cr: 860,
    distance: 600,
    params: Object.freeze({
      clearCount: 3, killCount: 0, targetStrength: 2.52, fValue: 2.52, taskTime: 135,
    }),
    pod: null,
  }),
  heavy_tow: Object.freeze({
    type: 'tow_recovery',
    title: "Bring in the yard's next core",
    brief: 'The dead-weight core is in, and the yard has another sitting out on the belt. Same line, same hands.',
    summary: 'The yard asked for a second dead-weight core.',
    reward_cr: 1200,
    distance: 900,
    params: Object.freeze({
      massU: 96,
      bodyRadius: 20,
      scanLabel: 'DEAD-WEIGHT CORE',
      tetherPayload: true,
      cargoValue: 2112,
      fValue: 1.26,
      taskTime: 40,
      physicalVerb: 'tow',
      completionMethods: Object.freeze(['tow_in', 'sling_in']),
    }),
    pod: null,
  }),
  wrecking_ball: Object.freeze({
    type: 'salvage_retrieval',
    title: 'Strip the fallen tower',
    brief: 'The dead tower came down in pieces. Claim crews are already cutting at it. Beat them to the plating.',
    summary: 'The fallen tower left a field of plating.',
    reward_cr: 1050,
    distance: 800,
    params: Object.freeze({ cmdtyId: 'cmdty_comp_hullplate', qty: 5, fValue: 1, taskTime: 30 }),
    pod: Object.freeze({ scanLabel: 'TOWER PLATING', radius: 6, mass: 26, hull: 36 }),
  }),
});

/** True for 47-A story work: it ends in its story, never in a sandbox follow-on. */
function isStoryMission(mission) {
  return mission.campaign47aBeat != null
    || String(mission.storyTag || '').startsWith('campaign47a:');
}

/**
 * The eight newer consequences answer only the authored set piece itself. A procedural board tow
 * or demolition that happens to share the piece's id is ordinary work, not the situation.
 */
function aftermathFor(pieceId, mission) {
  if (!Object.prototype.hasOwnProperty.call(AFTERMATH, pieceId)) return null;
  if (mission.type !== AUTHORED_SET_PIECE_TYPE) return null;
  return AFTERMATH[pieceId];
}

function offerId(pieceId, mission) {
  return `spf_${pieceId}_${mission && mission.id || 'none'}`;
}

/**
 * The contract that replaces a finished set piece. Null for every other piece.
 * Pure: the missions owner boards it.
 */
export function setPieceFollowOnOffer(pieceId, mission, epoch = 0) {
  if (!mission || !mission.id) return null;
  if (isStoryMission(mission)) return null;
  const boardStationId = mission.destStationId || mission.stationId || null;
  if (!boardStationId) return null;
  const id = offerId(pieceId, mission);
  const life = (Number.isFinite(Number(epoch)) ? Number(epoch) : 0) + FOLLOW_ON_LIFE_EPOCHS;
  const shared = {
    id,
    source: SET_PIECE_FOLLOW_ON_SOURCE,
    stationId: boardStationId,
    collateral_cr: 0,
    riskTier: 1,
    preloadedCargo: false,
    time_limit_s: 1200,
    duration_s: 1200,
    distance: 900,
    expiresAtEpoch: life,
    storyTag: null,
    cause: {
      tag: 'setPieceFollowOn',
      archetypeId: pieceId,
      fingerprint: id,
      failReload: false,
    },
  };
  const params = {
    failReload: false,
    fromSetPieceId: pieceId,
    parentMissionId: mission.id,
  };

  if (pieceId === 'convoy_defence') {
    return {
      ...shared,
      type: 'salvage_retrieval',
      title: 'Recover the stripped pods',
      brief: 'The lane lost its cargo. The pods are still out there. Bring the salvage in.',
      summary: 'Convoy loss became a salvage contract.',
      reward_cr: 980,
      destStationId: boardStationId,
      destSectorId: mission.destSectorId || null,
      params: {
        ...params,
        cmdtyId: 'cmdty_salvage_electronics',
        qty: 3,
        sectorId: mission.destSectorId || null,
      },
    };
  }

  if (pieceId === 'loud_heist') {
    return {
      ...shared,
      type: 'smuggling_run',
      title: 'Run the take to the den',
      brief: 'The hatch is off. The take is a pod beside you. Get it to the den before the lane answers.',
      summary: 'The heist became an escape.',
      reward_cr: 1400,
      preloadedCargo: false,
      destStationId: 'station_smuggler',
      destSectorId: 'sector_pallas_drift',
      distance: 1800,
      params: {
        ...params,
        cmdtyId: 'cmdty_classified_salvage',
        qty: 1,
      },
    };
  }

  if (pieceId === 'station_door_jam') {
    return {
      ...shared,
      type: 'tow_recovery',
      title: 'Tow the dead frigate clear',
      brief: 'The frigate is dead weight on the approach. Put it on the line and tow it to the yard.',
      summary: 'The disabled ship became a tow.',
      reward_cr: 1200,
      destStationId: 'station_ceres',
      destSectorId: 'sector_ceres_belt',
      distance: 1600,
      params: {
        ...params,
        towRole: 'jam_hulk',
        scanLabel: 'DEAD FRIGATE',
        massU: 160,
        bodyRadius: 22,
        tetherPayload: true,
      },
    };
  }

  const aftermath = aftermathFor(pieceId, mission);
  if (aftermath) {
    const parent = authoredSetPieceById(pieceId);
    const destSectorId = aftermath.destSectorId || mission.destSectorId
      || (parent && parent.destSectorId) || null;
    return {
      ...shared,
      type: aftermath.type,
      title: aftermath.title,
      brief: aftermath.brief,
      summary: aftermath.summary,
      reward_cr: aftermath.reward_cr,
      distance: aftermath.distance,
      ...(aftermath.inheritFaction && parent ? { factionId: parent.factionId } : {}),
      destStationId: aftermath.destStationId || boardStationId,
      destSectorId,
      params: {
        ...params,
        ...aftermath.params,
        ...(aftermath.type === 'salvage_retrieval' ? { sectorId: destSectorId } : {}),
        ...(Array.isArray(aftermath.params.completionMethods)
          ? { completionMethods: [...aftermath.params.completionMethods] } : {}),
      },
    };
  }

  return null;
}

/**
 * A body the follow-on leaves in the world. The convoy's salvage and the heist's take
 * are pods you can grab. The frigate is spawned by the tow contract itself.
 */
export function setPieceFollowOnBody(pieceId, mission, origin) {
  if (!mission || !mission.id) return null;
  if (isStoryMission(mission)) return null;
  const ox = origin && Number.isFinite(origin.x) ? origin.x : 0;
  const oz = origin && Number.isFinite(origin.z) ? origin.z : 0;
  const pos = { x: ox + 28, z: oz + 12 };
  if (pieceId === 'convoy_defence') {
    return {
      type: 'payload',
      pos,
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 24,
      hull: 40,
      hullMax: 40,
      data: {
        tetherPayload: true,
        scanLabel: 'STRIPPED POD',
        commodityId: 'cmdty_salvage_electronics',
        salvagePool: { cmdty_salvage_electronics: 3 },
        missionId: mission.id,
      },
    };
  }
  if (pieceId === 'loud_heist') {
    return {
      type: 'payload',
      pos,
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 18,
      hull: 30,
      hullMax: 30,
      data: {
        tetherPayload: true,
        scanLabel: 'VAULT TAKE',
        commodityId: 'cmdty_classified_salvage',
        salvagePool: { cmdty_classified_salvage: 1 },
        missionId: mission.id,
      },
    };
  }
  const aftermath = aftermathFor(pieceId, mission);
  if (aftermath && aftermath.pod) {
    const { cmdtyId, qty } = aftermath.params;
    return {
      type: 'payload',
      pos,
      vel: { x: 0, z: 0 },
      radius: aftermath.pod.radius,
      mass: aftermath.pod.mass,
      hull: aftermath.pod.hull,
      hullMax: aftermath.pod.hull,
      data: {
        tetherPayload: true,
        scanLabel: aftermath.pod.scanLabel,
        commodityId: cmdtyId,
        salvagePool: { [cmdtyId]: qty },
        missionId: mission.id,
      },
    };
  }
  return null;
}
