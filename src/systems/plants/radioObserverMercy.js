// plantsRadioObserverMercy — Lane Nine (Static radio) SMALL MERCIES composition observer.
//
// Fourteen Static radio rows (design/program/INFERENCE_PLANTS.md §E PL-305..PL-320, the quiet
// generosity slice) need a fact no single bus event carries, so this module watches the
// ordinary world and emits one plain synthetic event per settled deed; systems/bandRadio.js
// deriveBandEventKeys maps each onto its authored eventKey (the batch subscription list
// carries the event names). The mercy plant modules named by the rows (pl267 berth-gift,
// pl259 spare-share, pl294 steady-rookie, pl299 leak-tow, pl288 lantern, pl287 chalk-seat,
// pl275 wash-included, pl292 convoy-pace, pl289 window-cover, pl270 medal-note, pl304
// takeoff-coach) had not landed when this battery ran, so every deed here is composed from
// REAL seams only — dock:range, dock:docked, tether:snapCatch, massline:releaseValidated,
// surrender:tethered, freight:cargoSpilled, pickup:collected, service:completed,
// achievement:unlocked, law:incidentOpened, physics:impact — and the prose identity each
// mercy module will own (who the hauler was, who left the hatch open) waits for those
// modules. Nothing here invents an event nothing emits.
//
//   plants:radioMercy:berthGifted         (PL-305) — the player gave up a town-station berth:
//       entered dock range, dwelt (a real approach), and walked away without docking.
//   plants:radioMercy:spareLeft           (PL-306) — freight spilled on the lane by somebody
//       else's guns and the player left it lying there for whoever comes next.
//       station: some places count.
//   plants:radioMercy:leakTowedHome       (PL-309) — a tether:snapCatch latch (the player's
//       tow, towWatch shape) still fresh when the player docked: the stranger came home under
//       the player's line.
//   plants:radioMercy:darkDockClean       (PL-310) — the player docked in a dark (low
//       security) sector and no incident opened on them during the stay: the tab was left open.
//   plants:radioMercy:chalkSeatThreeDays  (PL-312) — the player docked at the same town on
//       three consecutive core days: the market line knows them.
//   plants:radioMercy:skiffTowedHome      (PL-313) — the tow owner's own dock:docked receipt
//       (via 'tow'): a crew brought the player's skiff in.
//   plants:radioMercy:repairWashed        (PL-314) — a repair receipt followed by a hull wash
//       at the same dock inside one visit: somebody tips.
//   plants:radioMercy:threeYieldsOneShift (PL-315) — three real give-ways (dwelt in dock range,
//       left without docking) inside one core day.
//   plants:radioMercy:convoyPacedHome     (PL-316) — a surrendered stranger tethered, then the
//       player's line release validated while inside dock range: paced them in, wordless.
//   plants:radioMercy:dawnWatchHeld       (PL-317) — the player held slow station in dock range
//       across a dawn (core-day boundary) without docking: somebody kept the watch.
//   plants:radioMercy:kindnessChalks      (PL-318) — the aggregate: three distinct mercy deeds
//       in one session turn the callsign up on the kindness chalks.
//   plants:radioMercy:medalLeftNote       (PL-319) — a fresh (non-retroactive) achievement
//       unlock: the medal taken; the note stays where it was pinned.
//   plants:radioMercy:cleanTakeoffCoached (PL-320) — the player left dock range and flew out a
//       full window with no impact: one clean takeoff off the launch mouth.
//
// Invariants:
// - Deterministic: state.simTime only (core day cadence 600 s, src/core/coreSystem.js
//   DAY_SECONDS, read through radioObserver's shared radioDayIndexAt); no Math.random, no
//   Date.now, no Three.js/DOM imports.
// - All session state lives on `this`, single-row latches or bounded Maps/Sets with caps and
//   stale eviction; cleared on reset (game:newGame) and destroy. Emits plain payloads; never
//   writes entities, other systems' state, or anything serialized.
// - Each deed emits at most once per session (the radio receipt is heard-once downstream; the
//   deed ledger is what the kindness-chalks aggregate counts).
// - Never invents the world: every composition reads a real event receipt (or the real
//   sector security the world publishes).

import { RADIO_TOWN_STATION_IDS, RADIO_DAY_LENGTH_S, radioDayIndexAt } from './radioObserver.js';

export const RADIO_MERCY_BERTH_GIFTED_EVENT = 'plants:radioMercy:berthGifted';
export const RADIO_MERCY_SPARE_LEFT_EVENT = 'plants:radioMercy:spareLeft';
export const RADIO_MERCY_LEAK_TOWED_EVENT = 'plants:radioMercy:leakTowedHome';
export const RADIO_MERCY_DARK_DOCK_EVENT = 'plants:radioMercy:darkDockClean';
export const RADIO_MERCY_CHALK_SEAT_EVENT = 'plants:radioMercy:chalkSeatThreeDays';
export const RADIO_MERCY_SKIFF_TOWED_EVENT = 'plants:radioMercy:skiffTowedHome';
export const RADIO_MERCY_REPAIR_WASHED_EVENT = 'plants:radioMercy:repairWashed';
export const RADIO_MERCY_THREE_YIELDS_EVENT = 'plants:radioMercy:threeYieldsOneShift';
export const RADIO_MERCY_CONVOY_PACED_EVENT = 'plants:radioMercy:convoyPacedHome';
export const RADIO_MERCY_DAWN_WATCH_EVENT = 'plants:radioMercy:dawnWatchHeld';
export const RADIO_MERCY_KINDNESS_CHALKS_EVENT = 'plants:radioMercy:kindnessChalks';
export const RADIO_MERCY_MEDAL_NOTE_EVENT = 'plants:radioMercy:medalLeftNote';
export const RADIO_MERCY_CLEAN_TAKEOFF_EVENT = 'plants:radioMercy:cleanTakeoffCoached';

// PL-318: the chalks read like a fan letter once three distinct deeds name the same callsign.
export const RADIO_MERCY_DEEDS_FOR_CHALKS = 3;

export const RADIO_MERCY_TUNING = Object.freeze({
  yieldMinDwellS: 20,         // dwelling this long in dock range is a real approach, not a fly-through
  yieldsForTheLine: 3,        // PL-315: three give-ways per shift
  stationDaysCap: 8,          // bounded per-station streak ledger (PL-312)
  streakDaysForTheLine: 3,    // PL-312: three consecutive core days
  arrivalsForTheLine: 50,     // PL-307: the fiftieth arrival
  towStaleS: 240,             // towWatch parity: a latch older than this is stale (PL-309)
  spillWindowS: 90,           // the spilled spare sits unlooted this long, then it counts (PL-306)
  takeoffWindowS: 30,         // clean departure window after leaving dock range (PL-320)
  washWindowS: RADIO_DAY_LENGTH_S, // wash lands within the same dock visit as the repair (PL-314)
  dawnWatchSpeedMax: 5,       // holding slow station, not moving (PL-317)
  darkDockSecurityMax: 0.3,   // "dark waystation": the world's own published security (PL-310)
  yieldLedgerCap: 8,          // bounded yields-per-day ledger (PL-315)
});

export const radioObserverMercyPlant = {
  modes: ['flight'],
  name: 'plantsRadioObserverMercy',

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
    on('dock:range', (p = {}) => this._onDockRange(p));
    on('dock:docked', (p = {}) => this._onDocked(p));
    on('dock:undocked', () => { this._repairArm = null; });
    on('tether:snapCatch', (p = {}) => this._onSnapCatch(p));
    on('massline:releaseValidated', (p = {}) => this._onReleaseValidated(p));
    on('surrender:tethered', (p = {}) => this._onSurrenderTethered(p));
    on('freight:cargoSpilled', (p = {}) => this._onCargoSpilled(p));
    on('pickup:collected', () => { this._spill = null; });
    on('service:completed', (p = {}) => this._onServiceCompleted(p));
    on('achievement:unlocked', (p = {}) => this._onAchievementUnlocked(p));
    on('law:incidentOpened', (p = {}) => this._onIncidentOpened(p));
    on('physics:impact', (p = {}) => this._onImpact(p));
    on('sector:enter', (p = {}) => this._onSectorEnter(p));
    on('sector:exit', () => { this._inRange = null; this._takeoffArm = null; });
    on('game:newGame', () => this._hardReset());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._hardReset();
  },

  // Session reset (also driven directly by the owning bandRadio's newGame).
  reset() {
    this._hardReset();
  },

  update(_dt, state) {
    if (state) this.state = state;
    const s = this.state;
    if (!s || (s.mode != null && s.mode !== 'flight')) return;
    const now = this._now();
    const day = radioDayIndexAt(now);
    // PL-320: a departure stays clean only while no impact lands inside the window.
    if (this._takeoffArm && now - this._takeoffArm.at >= RADIO_MERCY_TUNING.takeoffWindowS) {
      this._takeoffArm = null;
      this._emitDeed(RADIO_MERCY_CLEAN_TAKEOFF_EVENT, { t: now });
    }
    // PL-306: the spilled spare nobody's guns came for; the player left it for whoever needs it.
    if (this._spill && now - this._spill.at >= RADIO_MERCY_TUNING.spillWindowS) {
      this._spill = null;
      this._emitDeed(RADIO_MERCY_SPARE_LEFT_EVENT, { t: now });
    }
    // PL-317: holding slow station in dock range across a dawn boundary is a kept watch.
    if (this._inRange && this._inRange.watchDay !== day) {
      const player = s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
      const speed = player && player.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : Infinity;
      if (player && player.alive !== false && Number.isFinite(speed) && speed <= RADIO_MERCY_TUNING.dawnWatchSpeedMax) {
        this._inRange.watchDay = day;
        this._emitDeed(RADIO_MERCY_DAWN_WATCH_EVENT, { stationId: this._inRange.stationId, t: now });
      }
    }
  },

  // ---- internals ----

  _hardReset() {
    this._inRange = null;            // {stationId, enteredAt, day, watchDay}
    this._yieldDays = [];            // day indexes of give-ways, pruned to the current day
    this._stationStreaks = new Map();// stationId -> {lastDay, streak} (PL-312)
    this._towLatch = null;           // {targetId, latchedAt} (PL-309)
    this._surrenderLatch = null;     // {targetId, latchedAt} (PL-316)
    this._spill = null;              // {at} armed by a stranger's spill, disarmed by pickup (PL-306)
    this._takeoffArm = null;         // {at} armed by leaving dock range (PL-320)
    this._repairArm = null;          // {stationId, at} armed by a repair receipt (PL-314)
    this._incidentThisStay = false;  // an incident opened on the player during this sector stay (PL-310)
    this._emitted = new Set();       // deed events already settled this session
  },

  _now() {
    const s = this.state;
    return Number.isFinite(s && s.simTime) ? s.simTime : 0;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  // Each deed settles at most once per session; PL-318 counts distinct settled deeds.
  _emitDeed(event, payload = {}) {
    if (this._emitted.has(event)) return;
    this._emitted.add(event);
    this._emit(event, { ...payload, deeds: this._emitted.size });
    if (event !== RADIO_MERCY_KINDNESS_CHALKS_EVENT
      && this._emitted.size >= RADIO_MERCY_DEEDS_FOR_CHALKS
      && !this._emitted.has(RADIO_MERCY_KINDNESS_CHALKS_EVENT)) {
      // PL-318: the third distinct mercy deed puts the callsign on the chalks.
      this._emitted.add(RADIO_MERCY_KINDNESS_CHALKS_EVENT);
      this._emit(RADIO_MERCY_KINDNESS_CHALKS_EVENT, { deeds: this._emitted.size, t: this._now() });
    }
  },

  _playerPayload(s, payload) {
    // UI re-emits of these seams can omit shipId; a receipt that names another hull is not
    // the player's deed.
    const shipId = payload && payload.shipId != null ? payload.shipId : (s ? s.playerId : null);
    return shipId != null && s && shipId === s.playerId;
  },

  _onDockRange(payload) {
    const s = this.state;
    if (!s || !payload || !this._playerPayload(s, payload)) return;
    const now = this._now();
    const stationId = payload.stationId;
    if (payload.inRange === true) {
      this._inRange = { stationId, enteredAt: now, day: radioDayIndexAt(now), watchDay: radioDayIndexAt(now) };
      return;
    }
    if (payload.inRange !== false || !this._inRange || this._inRange.stationId !== stationId) return;
    const dwell = now - this._inRange.enteredAt;
    this._inRange = null;
    if (dwell < RADIO_MERCY_TUNING.yieldMinDwellS) return;
    // A real approach given up without docking is a give-way (PL-315); at a town dock with the
    // berths scarce, it is a berth handed to whoever was queueing (PL-305).
    const day = radioDayIndexAt(now);
    this._yieldDays = this._yieldDays.filter((d) => d === day);
    this._yieldDays.push(day);
    while (this._yieldDays.length > RADIO_MERCY_TUNING.yieldLedgerCap) this._yieldDays.shift();
    if (this._yieldDays.length === RADIO_MERCY_TUNING.yieldsForTheLine) {
      this._emitDeed(RADIO_MERCY_THREE_YIELDS_EVENT, { dayIndex: day, t: now });
    }
    if (stationId != null && RADIO_TOWN_STATION_IDS.includes(stationId)) {
      this._emitDeed(RADIO_MERCY_BERTH_GIFTED_EVENT, { stationId, t: now });
    }
    // PL-320: arm the clean-takeoff window; only an impact inside it cancels the deed.
    this._takeoffArm = { at: now };
  },

  _onDocked(payload) {
    const s = this.state;
    if (!s || !payload || !this._playerPayload(s, payload)) return;
    const now = this._now();
    const stationId = payload.stationId;
    this._takeoffArm = null;
    this._spill = null;
    // PL-313: the tow owner's receipt — a crew brought the player's skiff in.
    if (payload.via === 'tow') this._emitDeed(RADIO_MERCY_SKIFF_TOWED_EVENT, { stationId, t: now });
    // PL-309: the tow latch is still fresh at the dock — the stranger came home under the line.
    if (this._towLatch && this._towLatch.targetId != null
      && now - this._towLatch.latchedAt <= RADIO_MERCY_TUNING.towStaleS) {
      this._towLatch = null;
      this._emitDeed(RADIO_MERCY_LEAK_TOWED_EVENT, { stationId, t: now });
    }
    // PL-310: docking in a dark sector with no incident opened during the stay.
    const sectorId = s.world && s.world.currentSectorId;
    const sector = sectorId && s.world && s.world.sectors ? s.world.sectors[sectorId] : null;
    const security = Number(sector && sector.security);
    if (Number.isFinite(security) && security <= RADIO_MERCY_TUNING.darkDockSecurityMax
      && !this._incidentThisStay) {
      this._emitDeed(RADIO_MERCY_DARK_DOCK_EVENT, { stationId, sectorId, t: now });
    }
    if (stationId == null) return;
    // PL-312: the same town dock, three core days running — the chalk seat is theirs.
    if (RADIO_TOWN_STATION_IDS.includes(stationId)) {
      const day = radioDayIndexAt(now);
      let row = this._stationStreaks.get(stationId);
      if (!row || day < row.lastDay || day > row.lastDay + 1) row = { lastDay: day, streak: 1 };
      else if (day === row.lastDay + 1) row = { lastDay: day, streak: row.streak + 1 };
      else row = { lastDay: day, streak: row.streak };
      if (this._stationStreaks.size >= RADIO_MERCY_TUNING.stationDaysCap && !this._stationStreaks.has(stationId)) {
        this._stationStreaks.delete(this._stationStreaks.keys().next().value);
      }
      this._stationStreaks.set(stationId, row);
      if (row.streak === RADIO_MERCY_TUNING.streakDaysForTheLine) {
        this._emitDeed(RADIO_MERCY_CHALK_SEAT_EVENT, { stationId, streak: row.streak, t: now });
      }
    }
  },

  _onSnapCatch(payload) {
    const s = this.state;
    if (!s || !payload || payload.targetId == null) return;
    // towWatch shape: one bounded latch row; the newest catch is the live tow.
    this._towLatch = { targetId: payload.targetId, latchedAt: this._now() };
  },

  _onReleaseValidated(payload) {
    const s = this.state;
    if (!s || !payload) return;
    if (this._surrenderLatch && payload.entityId != null
      && payload.entityId === this._surrenderLatch.targetId) {
      // PL-316: releasing the surrendered stranger's line inside dock range — paced them in.
      const inRange = this._inRange != null;
      this._surrenderLatch = null;
      if (inRange) this._emitDeed(RADIO_MERCY_CONVOY_PACED_EVENT, { t: this._now() });
    }
  },

  _onSurrenderTethered(payload) {
    const s = this.state;
    if (!s || !payload || payload.entityId == null) return;
    if (payload.entityId === s.playerId) return;
    this._surrenderLatch = { targetId: payload.entityId, latchedAt: this._now() };
  },

  _onCargoSpilled(payload) {
    const s = this.state;
    if (!s || !payload) return;
    // The spare only counts as left when the player's guns did not make it.
    if (payload.attackerId != null && payload.attackerId !== s.playerId) {
      this._spill = { at: this._now() };
    }
  },

  _onServiceCompleted(payload) {
    const s = this.state;
    if (!s || !payload) return;
    const now = this._now();
    if (payload.type === 'repair') {
      this._repairArm = { stationId: payload.stationId != null ? payload.stationId : null, at: now };
    } else if (payload.type === 'hull_wash') {
      const arm = this._repairArm;
      this._repairArm = null;
      if (!arm || now - arm.at > RADIO_MERCY_TUNING.washWindowS) return;
      if (arm.stationId != null && payload.stationId != null && arm.stationId !== payload.stationId) return;
      // PL-314: repaired at this dock, then the wash came too — somebody tips.
      this._emitDeed(RADIO_MERCY_REPAIR_WASHED_EVENT, { stationId: payload.stationId, t: now });
    }
  },

  _onAchievementUnlocked(payload) {
    const s = this.state;
    if (!s || !payload) return;
    // A fresh unlock is the medal taken (a retroactive backfill is the archive's, not a deed).
    if (payload.retroactive === true) return;
    this._emitDeed(RADIO_MERCY_MEDAL_NOTE_EVENT, { id: payload.id, t: this._now() });
  },

  _onIncidentOpened(payload) {
    const s = this.state;
    if (!s || !payload) return;
    if (payload.attackerId != null && payload.attackerId === s.playerId) {
      this._incidentThisStay = true;
    }
  },

  _onImpact(payload) {
    const s = this.state;
    if (!s || !payload || !this._takeoffArm) return;
    if (payload.aId === s.playerId || payload.bId === s.playerId) {
      this._takeoffArm = null;
    }
  },

  _onSectorEnter(payload) {
    const s = this.state;
    if (!s || !payload) return;
    const sectorId = payload.sectorId != null ? payload.sectorId
      : (payload.sector && payload.sector.id != null ? payload.sector.id : null);
    if (sectorId != null && (s.world == null || s.world.currentSectorId == null || s.world.currentSectorId === sectorId)) {
      this._incidentThisStay = false;
    }
  },
};

export default radioObserverMercyPlant;
