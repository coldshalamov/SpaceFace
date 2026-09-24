// §22 B7 — three sandbox situations end in a new contract, never a fail-and-reload.
// A convoy loss becomes salvage, a heist becomes an escape, a disabled ship becomes a tow.

export const SET_PIECE_FOLLOW_ON_SOURCE = 'setPieceFollowOn';

const FOLLOW_ON_LIFE_EPOCHS = 3;

function offerId(pieceId, mission) {
  return `spf_${pieceId}_${mission && mission.id || 'none'}`;
}

/**
 * The contract that replaces a finished set piece. Null for every other piece.
 * Pure: the missions owner boards it.
 */
export function setPieceFollowOnOffer(pieceId, mission, epoch = 0) {
  if (!mission || !mission.id) return null;
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

  return null;
}

/**
 * A body the follow-on leaves in the world. The convoy's salvage and the heist's take
 * are pods you can grab. The frigate is spawned by the tow contract itself.
 */
export function setPieceFollowOnBody(pieceId, mission, origin) {
  if (!mission || !mission.id) return null;
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
        salvagePool: { cmdty_classified_salvage: 1 },
        missionId: mission.id,
      },
    };
  }
  return null;
}
