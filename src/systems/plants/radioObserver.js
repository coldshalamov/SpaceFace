// plantsRadioObserver — Lane Nine (Static radio) composition observer.
//
// Five Static radio rows (design/program/INFERENCE_PLANTS.md §E) need a fact no single bus
// event carries, so this module watches the ordinary world and emits one plain synthetic
// event per settled deed; systems/bandRadio.js deriveBandEventKeys maps each onto its
// authored eventKey (the batch subscription list already carries the event names):
//   plants:radio:beatTugToWreck  (PL-111) — a traffic tug was assisting toward a hull and the
//       player's guns took that hull first: today, the tug came second.
//   plants:radio:bellCracked     (PL-135) — the player cracked the Bell prop (plantsPl245Bell,
//       plants/pl245TheBellsHush) off station_ceres: struck by the player's hull, or destroyed
//       by the player's guns.
//   plants:radio:threeRaceWins   (PL-136) — three circuit race wins (real rivals, P1) inside
//       one core calendar day.
//   plants:radio:fiveTownsOneDay (PL-162) — five distinct town docks inside one core day.
//   plants:radio:markAllTowns    (PL-240) — the same hull mark worn into five distinct towns
//       (a tolerant read of the mark stamps a town/story writer leaves on the hull — the same
//       shape PL-227 reads — plus the real hull chalks plants already stamp today: the Sker
//       stock number (PL-104) and the 12.4 under-paint (PL-125)).
//
// Invariants:
// - Deterministic: state.simTime only (core day cadence 600 s, src/core/coreSystem.js
//   DAY_SECONDS); no Math.random, no Date.now, no Three.js/DOM imports.
// - All session state lives on `this`, bounded Maps/Sets with caps and stale eviction;
//   cleared on game:newGame and destroy. Emits plain payloads; never writes entities,
//   other systems' state, or anything serialized.
// - Never invents the world: every composition reads a real entity stamp or a real event.

export const RADIO_BEAT_TUG_EVENT = 'plants:radio:beatTugToWreck';
export const RADIO_BELL_CRACKED_EVENT = 'plants:radio:bellCracked';
export const RADIO_THREE_RACE_WINS_EVENT = 'plants:radio:threeRaceWins';
export const RADIO_FIVE_TOWNS_EVENT = 'plants:radio:fiveTownsOneDay';
export const RADIO_MARK_TOWNS_EVENT = 'plants:radio:markAllTowns';

// The belt's street-life towns by public station id (src/data/sectors.js): Helios Station,
// Ceres Refinery, Tethys Trade Hub, Forge Foundry, Reach Station, Sker Bazaar, Drift Market,
// Ruined Cache Station, Dione, Phoebe Echo. The canonical "five towns" list lives only in
// design prose, so the radio rows ask for five distinct towns from this set — the line is
// true in every firing ("Five towns, one rope, one day.").
export const RADIO_TOWN_STATION_IDS = Object.freeze([
  'station_helios', 'station_ceres', 'station_tethys', 'station_forge', 'station_reach',
  'station_sker', 'station_drift', 'station_ashcache', 'station_dione', 'station_phoebe_echo',
]);

// One in-game day on the shared core calendar (day:tick cadence in coreSystem.js).
export const RADIO_DAY_LENGTH_S = 600;

export const RADIO_TUNING = Object.freeze({
  townsForTheLine: 5,
  racesForTheLine: 3,
  scanIntervalS: 1,           // tug sweep cadence
  tugTargetStaleS: 20,        // an assist the tug abandoned stops counting
  tugTargetCap: 8,            // bounded assisted-hull ledger
  bellScanIntervalS: 2,       // Bell prop lookup cadence
  bellSectorId: 'sector_ceres_belt',
  heliosSectorId: 'sector_helios_prime', // the crescent — the Slipway kids' home water
  markLedgerCap: 8,           // bounded mark ledger (FIFO)
  townsPerMarkCap: 16,        // bounded towns per mark
  bellCrackCooldownS: 5,      // one crack report per contact
  raceWinLedgerCap: 8,        // bounded wins ledger (pruned to the current day)
});

/** Pure: the core calendar day index at a sim time. */
export function radioDayIndexAt(simTime) {
  return Math.floor(Math.max(0, Number(simTime) || 0) / RADIO_DAY_LENGTH_S);
}

/** Pure: a stable identity string for the mark a hull is wearing, or null when it wears
 *  nothing. Tolerant read of the town/story mark stamps (the PL-227 shape), then the real
 *  hull chalks plants stamp today: the Sker stock number (PL-104) and the under-paint
 *  12.4 (PL-125). */
export function hullMarkKey(player) {
  const data = player && player.data ? player.data : {};
  if (data.mark != null) {
    if (typeof data.mark === 'object') {
      const id = data.mark.id != null ? data.mark.id : data.mark.origin;
      return 'mark:' + String(id != null ? id : 'mark');
    }
    return 'mark:' + String(data.mark);
  }
  if (data.factionMark != null) return 'faction:' + String(data.factionMark);
  if (Array.isArray(data.marks) && data.marks.length > 0) return 'marks:' + String(data.marks[0]);
  if (data.plantsPl104StockNumber != null) return 'chalk:' + String(data.plantsPl104StockNumber);
  if (data.plantsPl125UnderPaint != null) return 'paint:' + String(data.plantsPl125UnderPaint);
  return null;
}

export const radioObserverPlant = {
  modes: ['flight'],
  name: 'plantsRadioObserver',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._hardReset();
    const on = (event, fn) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('entity:killed', (p = {}) => this._onKilled(p));
    on('physics:impact', (p = {}) => this._onImpact(p));
    on('mission:completed', (p = {}) => this._onRaceCompleted(p));
    on('dock:docked', (p = {}) => this._onDocked(p));
    on('sector:exit', () => { this._bellId = null; this._nextBellScanAtS = -Infinity; });
    on('game:newGame', () => this._hardReset());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._hardReset();
  },

  update(_dt, state) {
    if (state) this.state = state;
    const s = this.state;
    if (!s || (s.mode != null && s.mode !== 'flight')) return;
    const now = this._now();
    if (now >= this._nextTugScanAtS) {
      this._nextTugScanAtS = now + RADIO_TUNING.scanIntervalS;
      this._scanAssistingTugs(now);
    }
    if (now >= this._nextBellScanAtS) {
      this._nextBellScanAtS = now + RADIO_TUNING.bellScanIntervalS;
      this._scanBell(now);
    }
  },

  // ---- internals ----

  _hardReset() {
    this._tugTargets = new Map();      // assistedShipId -> lastSeenAt
    this._bellId = null;
    this._nextTugScanAtS = -Infinity;
    this._nextBellScanAtS = -Infinity;
    this._raceWinDays = [];            // day indexes of race wins, pruned to the current day
    this._townsDayKey = null;
    this._townsToday = new Set();      // distinct town stations docked this core day
    this._markTowns = new Map();       // markKey -> Set<stationId>
    this._lastBellCrackAtS = -Infinity;
  },

  _now() {
    const s = this.state;
    return Number.isFinite(s && s.simTime) ? s.simTime : 0;
  },

  _entities(s) {
    if (s && s.entities && typeof s.entities.values === 'function') return [...s.entities.values()];
    return Array.isArray(s && s.entityList) ? s.entityList : [];
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  // Bounded sweep: which hulls is a traffic tug currently assisting toward?
  // (systems/trafficRoleOps.js _stepTug stamps data.assistingShipId on the tug hull.)
  _scanAssistingTugs(now) {
    const map = this._tugTargets;
    for (const [id, seenAt] of map) {
      if (now - seenAt > RADIO_TUNING.tugTargetStaleS) map.delete(id);
    }
    const s = this.state;
    const inFlightTug = (e) => e && e.alive !== false && e.data
      && e.data.trafficRole === 'tug' && e.data.assistingShipId != null;
    for (const e of this._entities(s)) {
      if (!inFlightTug(e)) continue;
      const targetId = e.data.assistingShipId;
      if (map.size >= RADIO_TUNING.tugTargetCap && !map.has(targetId)) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
      }
      map.set(targetId, now);
    }
  },

  // The Ceres Bell prop (plants/pl245TheBellsHush.js stamps data.plantsPl245Bell).
  _scanBell(now) {
    const s = this.state;
    const sectorId = s && s.world && s.world.currentSectorId;
    if (sectorId !== RADIO_TUNING.bellSectorId) { this._bellId = null; return; }
    if (this._bellId != null) {
      const bell = s.entities && typeof s.entities.get === 'function'
        ? s.entities.get(this._bellId) : null;
      if (bell && bell.alive !== false && bell.data && bell.data.plantsPl245Bell === true) return;
      this._bellId = null;
    }
    for (const e of this._entities(s)) {
      if (e && e.alive !== false && e.data && e.data.plantsPl245Bell === true) {
        this._bellId = e.id;
        return;
      }
    }
  },

  _onKilled(payload) {
    const s = this.state;
    if (!s || !payload) return;
    const playerId = s.playerId;
    // PL-111 — the tug was still coming for this hull; the player's guns got there first.
    if (payload.killerId != null && payload.killerId === playerId
      && payload.id != null && this._tugTargets.has(payload.id)) {
      this._tugTargets.delete(payload.id);
      this._emit(RADIO_BEAT_TUG_EVENT, { wreckId: payload.id, t: this._now() });
    }
    // PL-135 — the Bell destroyed by the player's guns is cracked all the same.
    if (payload.id != null && payload.id === this._bellId) {
      if (payload.killerId != null && payload.killerId === playerId
        && this._now() - this._lastBellCrackAtS >= RADIO_TUNING.bellCrackCooldownS) {
        this._lastBellCrackAtS = this._now();
        this._emit(RADIO_BELL_CRACKED_EVENT, { bellId: payload.id, how: 'destroyed', t: this._now() });
      }
      this._bellId = null;
    }
  },

  _onImpact(payload) {
    const s = this.state;
    if (!s || !payload || this._bellId == null) return;
    const aId = payload.aId;
    const bId = payload.bId;
    const bell = this._bellId;
    const player = s.playerId;
    const playerHit = (aId === bell && bId === player) || (bId === bell && aId === player);
    if (!playerHit) return;
    const now = this._now();
    if (now - this._lastBellCrackAtS < RADIO_TUNING.bellCrackCooldownS) return;
    this._lastBellCrackAtS = now;
    this._emit(RADIO_BELL_CRACKED_EVENT, { bellId: bell, how: 'struck', t: now });
  },

  _onRaceCompleted(payload) {
    const s = this.state;
    if (!s || !payload || payload.racingContractId == null) return;
    const position = Number(payload.racePosition);
    const entrants = Number(payload.raceEntrants);
    if (!(position === 1 && entrants >= 2)) return; // a win over real rivals, not a solo clock
    const now = this._now();
    const day = radioDayIndexAt(now);
    this._raceWinDays = this._raceWinDays.filter((d) => d === day);
    this._raceWinDays.push(day);
    while (this._raceWinDays.length > RADIO_TUNING.raceWinLedgerCap) {
      this._raceWinDays.shift();
    }
    if (this._raceWinDays.length === RADIO_TUNING.racesForTheLine) {
      this._emit(RADIO_THREE_RACE_WINS_EVENT, { wins: this._raceWinDays.length, dayIndex: day, t: now });
    }
  },

  _onDocked(payload) {
    const s = this.state;
    if (!s || !payload) return;
    if (payload.shipId != null && payload.shipId !== s.playerId) return;
    const stationId = payload.stationId;
    if (stationId == null || !RADIO_TOWN_STATION_IDS.includes(stationId)) return;
    const now = this._now();
    const day = radioDayIndexAt(now);
    if (this._townsDayKey !== day) {
      this._townsDayKey = day;
      this._townsToday = new Set();
    }
    this._townsToday.add(stationId);
    if (this._townsToday.size === RADIO_TUNING.townsForTheLine) {
      // Emit exactly at five so a sixth town never re-reports the same deed.
      this._emit(RADIO_FIVE_TOWNS_EVENT, {
        towns: [...this._townsToday], dayIndex: day, t: now,
      });
    }

    // PL-240 — the same mark, worn into town after town. Presence is decided by the tolerant
    // read here (not by another module's stub): a hull wearing nothing wears nothing anywhere.
    const player = s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
    const markKey = hullMarkKey(player);
    if (!markKey) return;
    let row = this._markTowns.get(markKey);
    if (!row) {
      while (this._markTowns.size >= RADIO_TUNING.markLedgerCap) {
        this._markTowns.delete(this._markTowns.keys().next().value);
      }
      row = { towns: new Set() };
      this._markTowns.set(markKey, row);
    }
    row.towns.add(stationId);
    while (row.towns.size > RADIO_TUNING.townsPerMarkCap) {
      row.towns.delete(row.towns.values().next().value);
    }
    if (row.towns.size === RADIO_TUNING.townsForTheLine) {
      this._emit(RADIO_MARK_TOWNS_EVENT, { markKey, towns: row.towns.size, t: now });
    }
  },
};

export default radioObserverPlant;
