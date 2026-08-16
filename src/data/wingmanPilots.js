// Authored relationship-lite pilots for Plan 60. Runtime ownership stays with automation/wingmen;
// this module is immutable data plus bounded save normalization.

export const WINGMAN_ROSTER_VERSION = 1;
export const WINGMAN_DAY_SECONDS = 600;
export const WINGMAN_VETERAN_SORTIES = 10;
export const WINGMAN_VETERAN_DISCOUNT_PCT = 20;

const pilot = (value) => Object.freeze({
  ...value,
  fit: Object.freeze({ ...value.fit, moduleIds: Object.freeze(value.fit.moduleIds.slice()) }),
  voice: Object.freeze({ ...value.voice }),
});

export const WINGMAN_PILOTS = Object.freeze([
  pilot({
    id: 'pilot_nia_vek',
    name: 'Nia Vek',
    callsign: 'Latch',
    stationId: 'station_helios',
    shipDefId: 'ship_wasp',
    fit: {
      id: 'close_screen', label: 'Wasp · close-screen pulse pair',
      moduleIds: ['wpn_pulse_laser_s', 'wpn_pulse_laser_s'],
    },
    voice: {
      register: 'dry-and-level',
      hire: 'Latch copies. Your vector, your bill.',
      follow: 'Tucking in.',
      hold: 'Holding this patch.',
      attackMyTarget: 'Mark received.',
      scatter: 'Breaking wide.',
    },
    dailyRateCr: 90,
    initialLoyalty: 48,
    veteranTitle: 'Latch the Steady',
  }),
  pilot({
    id: 'pilot_jorren_pike',
    name: 'Jorren Pike',
    callsign: 'Pike',
    stationId: 'station_ceres',
    shipDefId: 'ship_drifter',
    fit: {
      id: 'belt_guard', label: 'Drifter · belt-guard front/rear fit',
      moduleIds: ['wpn_pulse_laser_m', 'wpn_autocannon_m'],
    },
    voice: {
      register: 'gravel-warm',
      hire: 'Pike is paid by the day and remembered by the hull.',
      follow: 'On your wake.',
      hold: 'Planting here.',
      attackMyTarget: 'I see your mark.',
      scatter: 'Spreading the net.',
    },
    dailyRateCr: 120,
    initialLoyalty: 55,
    veteranTitle: 'Pike of Ten Returns',
  }),
  pilot({
    id: 'pilot_suri_tann',
    name: 'Suri Tann',
    callsign: 'Needle',
    stationId: 'station_tethys',
    shipDefId: 'ship_hornet',
    fit: {
      id: 'target_needle', label: 'Hornet · precision intercept fit',
      moduleIds: ['wpn_railgun_m', 'wpn_pulse_laser_m', 'wpn_flak_turret_s'],
    },
    voice: {
      register: 'quick-clipped',
      hire: 'Needle hired. Point, do not narrate.',
      follow: 'Matched.',
      hold: 'Anchor set.',
      attackMyTarget: 'Taking your target.',
      scatter: 'Clear lanes.',
    },
    dailyRateCr: 150,
    initialLoyalty: 42,
    veteranTitle: 'Needle Tenfold',
  }),
]);

export const WINGMAN_PILOT_BY_ID = new Map(WINGMAN_PILOTS.map((entry) => [entry.id, entry]));

const boundedInt = (value, min, max, fallback = min) => {
  const parsed = Number(value);
  const n = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, n));
};

const boundedTime = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 1000) / 1000) : 0;
};

const safeToken = (value, max = 96) => {
  const text = String(value == null ? '' : value).replace(/[^a-zA-Z0-9:_-]+/g, '_').slice(0, max);
  return text || null;
};

export function wingmanPilotById(id) {
  return WINGMAN_PILOT_BY_ID.get(String(id || '')) || null;
}

export function initialWingmanPilotRecord(definition, currentDay = 0) {
  const def = definition || {};
  return {
    pilotId: String(def.id || ''),
    status: 'available',
    loyalty: boundedInt(def.initialLoyalty, 0, 100, 50),
    sortiesSurvived: 0,
    title: null,
    rateDiscountPct: 0,
    nextRateDay: Math.max(0, Math.floor(currentDay)) + 1,
    arrearsCr: 0,
    hiredAtS: 0,
    diedAtS: 0,
    deathOrder: null,
    deathStationId: null,
    deathAcknowledgement: 'none',
  };
}

export function normalizeWingmanPilotRecord(raw, definition, currentDay = 0) {
  const def = definition || {};
  const base = initialWingmanPilotRecord(def, currentDay);
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const status = source.status === 'hired' || source.status === 'dead' ? source.status : 'available';
  const sorties = boundedInt(source.sortiesSurvived, 0, 999, 0);
  const veteran = sorties >= WINGMAN_VETERAN_SORTIES;
  const acknowledgement = source.deathAcknowledgement === 'pending' || source.deathAcknowledgement === 'heard'
    ? source.deathAcknowledgement : 'none';
  return {
    ...base,
    status,
    loyalty: boundedInt(source.loyalty, 0, 100, base.loyalty),
    sortiesSurvived: sorties,
    title: veteran ? String(source.title || def.veteranTitle || '').slice(0, 64) || null : null,
    rateDiscountPct: veteran ? WINGMAN_VETERAN_DISCOUNT_PCT : 0,
    nextRateDay: boundedInt(source.nextRateDay, 0, 999999, base.nextRateDay),
    arrearsCr: boundedInt(source.arrearsCr, 0, 999999, 0),
    hiredAtS: boundedTime(source.hiredAtS),
    diedAtS: boundedTime(source.diedAtS),
    deathOrder: safeToken(source.deathOrder),
    deathStationId: safeToken(source.deathStationId),
    deathAcknowledgement: status === 'dead' ? acknowledgement : 'none',
  };
}

export function createInitialWingmanRoster(simTime = 0) {
  const day = Math.max(0, Math.floor((Number(simTime) || 0) / WINGMAN_DAY_SECONDS));
  return {
    schemaVersion: WINGMAN_ROSTER_VERSION,
    records: Object.fromEntries(WINGMAN_PILOTS.map((def) => [
      def.id,
      initialWingmanPilotRecord(def, day),
    ])),
    activeSortie: null,
    nextSortieId: 1,
  };
}

export function normalizeWingmanRoster(raw, simTime = 0) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const day = Math.max(0, Math.floor((Number(simTime) || 0) / WINGMAN_DAY_SECONDS));
  const inputRecords = source.records && typeof source.records === 'object' && !Array.isArray(source.records)
    ? source.records : {};
  const records = Object.fromEntries(WINGMAN_PILOTS.map((def) => [
    def.id,
    normalizeWingmanPilotRecord(inputRecords[def.id], def, day),
  ]));
  let activeSortie = null;
  const sortie = source.activeSortie;
  if (sortie && typeof sortie === 'object' && Array.isArray(sortie.pilotIds)) {
    const pilotIds = [...new Set(sortie.pilotIds.map(String))]
      .filter((id) => WINGMAN_PILOT_BY_ID.has(id) && records[id].status === 'hired')
      .slice(0, WINGMAN_PILOTS.length);
    if (pilotIds.length) {
      activeSortie = {
        id: boundedInt(sortie.id, 1, 999999, 1),
        startedAtS: boundedTime(sortie.startedAtS),
        startedTick: boundedInt(sortie.startedTick, 0, 2147483647, 0),
        flightTicks: boundedInt(sortie.flightTicks, 0, 2147483647, 0),
        startSectorId: safeToken(sortie.startSectorId),
        pilotIds,
      };
    }
  }
  return {
    schemaVersion: WINGMAN_ROSTER_VERSION,
    records,
    activeSortie,
    nextSortieId: boundedInt(source.nextSortieId, 1, 999999, 1),
  };
}

export function wingmanRosterFor(state) {
  const automation = state && state.automation;
  return automation && automation.wingmanRoster && typeof automation.wingmanRoster === 'object'
    ? automation.wingmanRoster : createInitialWingmanRoster(state && state.simTime);
}

export function wingmanPilotRecordFor(state, pilotId) {
  const roster = wingmanRosterFor(state);
  return roster.records && roster.records[String(pilotId || '')] || null;
}

export function effectiveWingmanDailyRate(definition, record) {
  const base = Math.max(0, Math.floor(Number(definition && definition.dailyRateCr) || 0));
  const discount = boundedInt(record && record.rateDiscountPct, 0, 90, 0);
  return Math.max(0, Math.round(base * (1 - discount / 100)));
}
