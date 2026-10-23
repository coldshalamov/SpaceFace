// worldPressure.js — the three persistent world pressures (build_map §34 rows
// 520–523, bounded under row 549):
//
//   W-TIDE    a per-sector Bloom infestation under state.worldPressure.tide. It
//             creeps everywhere slowly, climbs fast where unclaimed wrecks rot
//             (state.aftermathWrecks.bySector markers still carrying salvage),
//             bleeds across the lanes those wrecks sit on, and falls when a wreck
//             is cleared (salvage:completed) or a fed Understory garden pushes
//             back (state.understory.tidePushback, summed by understoryGardens).
//             The chart reads it; the danger model feels it via daily
//             sectorsim:impulse feed.
//   W-AUDITS  the Helix Directorate's gate-closure schedule. From Book 3 one
//             outer gate per Book welds shut over several days behind a physical,
//             wreckable Helix scaffold (custom.gateAuditPlatform def). Wrecking
//             the scaffold delays the weld — the policy never ends. A closed
//             gate refuses via:'gate' transit (world.js) and drops out of
//             gate-mode routes (routePlanner.js); the drive always still flies,
//             so no sector can be stranded. Closure wakes a Verge law zone at
//             both gate ends.
//   W-GRAY    the Pit's air index. It falls SLOW_GRAY.dropPerBook each Book and
//             never recovers; the Meridian ticker carries the line. Player
//             violence touches prices elsewhere — nothing writes this index but
//             the Book tick here.
//
// Ownership: writes only state.worldPressure (plus sanctioned reads of
// state.verge.lawZones for the law wake, same as faction_verge writes). Emits
// news:publish, comms:log, sectorsim:impulse, worldPressure:* events. Deterministic:
// no RNG, no wall clock — everything keys off state.simTime and persisted facts.

import { SECTORS } from '../data/sectors.js';
import { CAL_DAY_S, calendarDay } from '../data/worldCalendar.js';
import {
  bookIndexFor,
  auditEdgeKey,
  auditGateGlobalPos,
  GATE_AUDITS,
  GATE_AUDIT,
  TIDE,
  SLOW_GRAY,
  WORLD_PRESSURE_CAPS,
  tideBand,
  emptyWorldPressure,
  normalizeWorldPressure,
} from '../data/worldPressure.js';
import { ensureVergeState } from './faction_verge.js';

const MAX_LAW_ZONE_WAKE = 64;   // bound this system's own contribution to verge.lawZones

function clamp01(v) { return v < 0 ? 0 : v > 1 ? v : v; }

/** Unclaimed wreck count for the tide: markers still carrying a salvage pool. */
function unclaimedWreckUnits(markers) {
  let n = 0;
  for (const m of markers || []) {
    if (!m || typeof m !== 'object') continue;
    const pool = m.salvagePool;
    // A drained pool reads cleared; a missing pool has simply never been touched.
    if (pool && typeof pool === 'object' && Object.keys(pool).length === 0) continue;
    n += 1;
  }
  return n;
}

export const worldPressure = {
  name: 'worldPressure',
  // serialize() returns a fully normalized detached bag — snapshot ownership is ours.
  saveSnapshotOwned: true,

  init(ctx) {
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._ensure();
    this._off = [];
    const on = (event, fn) => {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, fn);
      this._off.push(off);
    };
    // Clears push the tide down locally on the next day step.
    on('salvage:completed', (p) => this._onSalvageCompleted(p || {}));
    // The scaffold is wreckable (E-32 delay); a colossus kill leaves remains.
    on('entity:killed', (p) => this._onEntityKilled(p || {}));
  },

  newGame() {
    this.state.worldPressure = emptyWorldPressure();
    // The day step means "a day has passed": anchor both clocks to the calendar at
    // start so the first tick does not fire a phantom day — audits announcing and
    // weld accruing a full day ahead of their authored schedule.
    this.state.worldPressure.lastBook = bookIndexFor(this.state.simTime || 0);
    this.state.worldPressure.lastDay = calendarDay(this.state.simTime || 0);
  },

  destroy() {
    for (const off of this._off || []) {
      try { off && off(); } catch { /* listener hygiene */ }
    }
    this._off = [];
  },

  _ensure() {
    const own = this.state.worldPressure;
    if (!own || typeof own !== 'object' || Array.isArray(own)) {
      this.state.worldPressure = emptyWorldPressure();
    }
    return this.state.worldPressure;
  },

  serialize() {
    return normalizeWorldPressure(JSON.parse(JSON.stringify(this._ensure())));
  },

  deserialize(data) {
    this.state.worldPressure = normalizeWorldPressure(data);
    return this.state.worldPressure;
  },

  // ── tick (CALENDAR clock, 2 Hz) ────────────────────────────────────────────
  update(dt, state) {
    const s = state || this.state;
    if (!s) return;
    const own = this._ensure();
    const simTime = Number(s.simTime) || 0;
    const day = calendarDay(simTime);
    if (day !== own.lastDay) {
      own.lastDay = day;
      this._dailyStep(s, day, simTime);
    }
    // Scaffolds materialize when the player is standing in an audited sector;
    // the check is cheap enough for the 2 Hz clock.
    this._tickScaffolds(s, simTime);
  },

  // ── the daily pass: tide → audits → gray ───────────────────────────────────
  _dailyStep(state, day, simTime) {
    const own = this._ensure();
    this._stepTide(state, own, simTime, day);
    this._stepAudits(state, own, simTime);
    this._stepSlowGray(state, own, simTime);
  },

  _stepTide(state, own, simTime, day) {
    const bySector = state.aftermathWrecks && state.aftermathWrecks.bySector || {};
    const gardens = state.understory && state.understory.tidePushback || {};
    const discovery = state.world && state.world.discovery || {};
    const prev = own.tide || {};
    const next = {};
    const bandBefore = {};
    const bandAfter = {};

    // One pass, evaluated entirely against the PREVIOUS day's field — sector
    // order can never leak into the result.
    const unclaimed = new Map();
    for (const s of SECTORS) unclaimed.set(s.id, unclaimedWreckUnits(bySector[s.id]));

    for (const s of SECTORS) {
      const id = s.id;
      const t0 = prev[id] || 0;
      const rot = unclaimed.get(id) || 0;
      let delta = TIDE.creepPerDay
        + TIDE.wreckPerDay * Math.min(rot, TIDE.wreckUnitsMax)
        - TIDE.settlePerDay;
      // Fed gardens push back — the persisted pushback sum is the fact.
      delta -= TIDE.gardenPushScale * (Number(gardens[id]) || 0);
      // The tide rides the lanes the wrecks sit on: both-directional flow,
      // heavier where either endpoint still holds unclaimed hulks.
      let flow = 0;
      for (const nb of s.neighbors || []) {
        const laneRot = rot > 0 || (unclaimed.get(nb) || 0) > 0;
        flow += ((prev[nb] || 0) - t0) * TIDE.spreadRate * (laneRot ? 1 + TIDE.spreadLaneBonus : 1);
      }
      delta += flow;
      // Clears land here: every salvage the day before drops the local line.
      const clears = own.clearBuffer && own.clearBuffer[id] || 0;
      delta -= TIDE.clearDrop * clears;

      const v = clamp01(t0 + delta);
      bandBefore[id] = tideBand(t0);
      bandAfter[id] = tideBand(v);
      if (v > 0) next[id] = v;
    }

    own.tide = next;
    own.clearBuffer = {};

    // Bloom pressure feeds the danger model — one impulse per infested sector
    // per day, so a greyed sector actually reads worse to fly.
    for (const [id, v] of Object.entries(next)) {
      if (v < TIDE.filmAt) continue;
      this.bus && this.bus.emit('sectorsim:impulse', {
        kind: 'bloom_tide', sectorId: id, danger: v * TIDE.dangerFeed,
      });
    }

    // Trivial receipts: the tide line moved. Deduped through a capped ring —
    // oldest notices decay first (row 549), so a long-forgotten crossing may
    // report once more when it crosses again.
    for (const s of SECTORS) {
      if (bandBefore[s.id] === bandAfter[s.id]) continue;
      if (!discovery[s.id] || discovery[s.id].discovered !== true) continue; // the chart only reports what you know
      const key = `tide:${s.id}:${bandAfter[s.id]}`;
      if (own.tideNotices.includes(key)) continue;
      own.tideNotices.push(key);
      while (own.tideNotices.length > WORLD_PRESSURE_CAPS.tideNotices) own.tideNotices.shift();
      const dir = (next[s.id] || 0) > (prev[s.id] || 0) ? 'rising' : 'falling';
      this.bus && this.bus.emit('worldPressure:tideChanged', {
        sectorId: s.id, level: next[s.id] || 0, band: bandAfter[s.id], direction: dir, at: simTime,
      });
      this._news(
        `BLOOM TIDE — ${s.name || s.id} reads ${bandAfter[s.id].toUpperCase()}; the line is ${dir}.`,
        `worldpressure:tide:${s.id}:${day}`,
      );
    }
  },

  _stepAudits(state, own, simTime) {
    const book = bookIndexFor(simTime);
    for (const cat of GATE_AUDITS) {
      const key = auditEdgeKey(cat.a, cat.b);
      let rec = own.gates[key];
      if (!rec) {
        if (book < cat.book) continue;
        rec = {
          key, a: cat.a, b: cat.b, book: cat.book,
          docket: cat.docket, gateName: cat.gateName,
          status: 'welding', weld: 0,
          announcedAt: simTime, delayedUntil: 0, closedAt: 0, vergeLaw: false,
        };
        own.gates[key] = rec;
        this._auditEvent(own, 'announced', rec, simTime);
        this._news(
          `GATE AUDIT — Helix Directorate files ${rec.docket}: ${rec.gateName} welds shut on schedule. A scaffold rides the lane.`,
          `worldpressure:audit:announced:${key}`,
        );
        this.bus && this.bus.emit('worldPressure:auditAnnounced', { key, a: rec.a, b: rec.b, book: rec.book });
        this.bus && this.bus.emit('comms:log', {
          text: `Directorate docket ${rec.docket}: ${rec.gateName} closes on schedule.`,
          speaker: 'Helix Directorate',
        });
      }
      if (rec.status === 'delayed' && simTime >= rec.delayedUntil) {
        rec.status = 'welding';
        this._auditEvent(own, 'resumed', rec, simTime);
        this._news(
          `GATE AUDIT — a fresh scaffold rides to ${rec.gateName}. The weld resumes where it stood.`,
          `worldpressure:audit:resumed:${key}:${Math.floor(simTime)}`,
        );
      }
      if (rec.status === 'welding') {
        rec.weld = Math.min(1, rec.weld + GATE_AUDIT.weldProgressPerDay);
        if (rec.weld >= 1) this._closeGate(state, own, rec, simTime);
      }
    }
  },

  _closeGate(state, own, rec, simTime) {
    rec.status = 'closed';
    rec.closedAt = simTime;
    rec.vergeLaw = true;
    this._auditEvent(own, 'closed', rec, simTime);
    // Verge law wakes at both ends of the sealed road — the same lawZones bag the
    // appeals court writes. Bounded against this system's own pushes.
    const v = ensureVergeState(state);
    if (v.lawZones.length < MAX_LAW_ZONE_WAKE) {
      for (const end of [rec.a, rec.b]) {
        const other = end === rec.a ? rec.b : rec.a;
        const pos = auditGateGlobalPos(state, end, other);
        if (!pos) continue;
        v.lawZones.push({ x: pos.x, z: pos.z, r: GATE_AUDIT.lawZoneRadius, at: simTime, auditKey: rec.key });
      }
    }
    // The sealed road presses on both sectors' field — law presence the sim reads.
    for (const end of [rec.a, rec.b]) {
      this.bus && this.bus.emit('sectorsim:impulse', { kind: 'gate_audit', sectorId: end, danger: 0.06 });
    }
    this.bus && this.bus.emit('worldPressure:gateClosed', {
      key: rec.key, a: rec.a, b: rec.b, book: rec.book, at: simTime,
    });
    this.bus && this.bus.emit('verge:lawWoke', { auditKey: rec.key, sectors: [rec.a, rec.b], at: simTime });
    this._news(
      `GATE SEALED — ${rec.gateName} is welded shut under ${rec.docket}. Traffic reroutes; Verge law wakes on the line.`,
      `worldpressure:audit:closed:${rec.key}`,
    );
    this.bus && this.bus.emit('comms:log', {
      text: `${rec.gateName} is sealed. Drive the long road or do not cross.`,
      speaker: 'Verge audit',
    });
  },

  _stepSlowGray(state, own, simTime) {
    const book = bookIndexFor(simTime);
    if (own.slowGray.lastBookIndex === book) return;
    const first = own.slowGray.lastBookIndex < 0;
    own.slowGray.lastBookIndex = book;
    if (first) return; // seeding, not a fall — no headline for the book you were born into
    own.slowGray.index = Math.max(SLOW_GRAY.floorIndex, own.slowGray.index - SLOW_GRAY.dropPerBook);
    const idx = own.slowGray.index;
    this.bus && this.bus.emit('worldPressure:slowGray', { book, index: idx, at: simTime });
    this._news(
      `MERIDIAN TICKER — Pit air index ${idx.toFixed(1)}, down ${SLOW_GRAY.dropPerBook.toFixed(1)} on the Book. The Gray does not recover.`,
      `worldpressure:gray:${book}`,
    );
  },

  _auditEvent(own, event, rec, at) {
    own.gateEvents.push({ event, key: rec.key, book: rec.book, at: Number(at) || 0 });
    if (own.gateEvents.length > WORLD_PRESSURE_CAPS.gateEvents) {
      own.gateEvents.splice(0, own.gateEvents.length - WORLD_PRESSURE_CAPS.gateEvents);
    }
  },

  // ── clears ─────────────────────────────────────────────────────────────────
  _onSalvageCompleted(p) {
    const own = this._ensure();
    const sectorId = p.sectorId
      || this._markerSectorId(p.markerId)
      || (this.state.world && this.state.world.currentSectorId) || null;
    if (!sectorId) return;
    own.clearBuffer[sectorId] = (own.clearBuffer[sectorId] || 0) + 1;
  },

  _markerSectorId(markerId) {
    if (markerId == null) return null;
    const bySector = this.state.aftermathWrecks && this.state.aftermathWrecks.bySector || {};
    for (const [sectorId, list] of Object.entries(bySector)) {
      for (const m of list || []) {
        if (m && String(m.markerId) === String(markerId)) return sectorId;
      }
    }
    return null;
  },

  // ── scaffold + colossus kill receipts ──────────────────────────────────────
  _onEntityKilled(p) {
    const victimId = p.id != null ? p.id : p.entityId;
    const ent = victimId != null && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(victimId) : null;
    const data = ent && ent.data || {};
    const own = this._ensure();
    const simTime = Number(this.state.simTime) || 0;

    // The scaffold is the player-facing delay valve (E-32): wreck it and the
    // audit slips wreckDelayDays, then another platform comes. The policy holds.
    if (data.gateAuditScaffold === true && typeof data.auditKey === 'string') {
      const rec = own.gates[data.auditKey];
      if (rec && rec.status !== 'closed') {
        rec.status = 'delayed';
        rec.delayedUntil = simTime + GATE_AUDIT.wreckDelayDays * CAL_DAY_S;
        this._auditEvent(own, 'delayed', rec, simTime);
        this.bus && this.bus.emit('worldPressure:auditDelayed', {
          key: rec.key, until: rec.delayedUntil, at: simTime,
        });
        this._news(
          `AUDIT DELAYED — the scaffold on ${rec.gateName} is wreckage. ${rec.docket} slips ${GATE_AUDIT.wreckDelayDays} days; the filing stands.`,
          `worldpressure:audit:delayed:${rec.key}:${Math.floor(simTime)}`,
        );
      }
      return;
    }

    // Colossus remains: a capital boss or colossus-class kill leaves a chart mark
    // where the player broke it — meaningful, never decays.
    if (data.capitalBossEncounterId || data.colossus === true || data.bossClass === 'colossus') {
      const sectorId = (ent && ent.data && ent.data.homeSectorId)
        || (this.state.world && this.state.world.currentSectorId) || null;
      if (!sectorId) return;
      const name = data.name || data.shipName || data.capitalBossActorKey || 'a colossus';
      own.colossusRemains.push({
        id: `cr_${own.colossusRemains.length}_${Math.floor(simTime)}`,
        name: String(name),
        sectorId,
        x: ent && ent.pos ? ent.pos.x : 0,
        z: ent && ent.pos ? ent.pos.z : 0,
        at: simTime,
      });
      if (own.colossusRemains.length > WORLD_PRESSURE_CAPS.colossusRemains) {
        own.colossusRemains.splice(0, own.colossusRemains.length - WORLD_PRESSURE_CAPS.colossusRemains);
      }
      this.bus && this.bus.emit('worldPressure:colossusRemains', { sectorId, name: String(name), at: simTime });
    }
  },

  // ── the physical scaffold ──────────────────────────────────────────────────
  _tickScaffolds(state, simTime) {
    const cur = state.world && state.world.currentSectorId;
    if (!cur || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const own = this._ensure();
    for (const rec of Object.values(own.gates)) {
      if (rec.status !== 'welding') continue;
      if (cur !== rec.a && cur !== rec.b) continue;
      if (simTime < rec.delayedUntil) continue;
      const other = cur === rec.a ? rec.b : rec.a;
      let live = null;
      for (const e of state.entityList || []) {
        if (e && e.alive !== false && e.data && e.data.gateAuditScaffold === true && e.data.auditKey === rec.key) {
          live = e;
          break;
        }
      }
      if (live) {
        // The weld reads on the platform itself as it climbs toward the seal.
        live.data = live.data || {};
        const pct = Math.round(rec.weld * 100);
        if (live.data.weldPct !== pct) {
          live.data.weldPct = pct;
          live.data.scanLabel = `HELIX AUDIT PLATFORM · ${rec.docket} · weld ${pct}%`;
        }
        continue;
      }
      const pos = auditGateGlobalPos(state, cur, other);
      if (!pos) continue;
      const ent = this.helpers.spawnEntity({
        type: 'station',
        factionId: 'faction_helix',
        pos: { x: pos.x + 56, z: pos.z + 56 },
        radius: GATE_AUDIT.scaffoldRadius,
        mass: GATE_AUDIT.scaffoldMass,
        hull: GATE_AUDIT.scaffoldHp,
        hullMax: GATE_AUDIT.scaffoldHp,
        collides: true,
        flags: { persistent: false },
        data: {
          gateAuditScaffold: true,
          auditKey: rec.key,
          name: GATE_AUDIT.scaffoldName,
          scannable: true,
          scanLabel: `HELIX AUDIT PLATFORM · ${rec.docket} · weld ${Math.round(rec.weld * 100)}%`,
          weldPct: Math.round(rec.weld * 100),
          tetherable: GATE_AUDIT.tetherable,
          homeSectorId: cur,
          sectorId: cur,
        },
      });
      if (ent) {
        this.bus && this.bus.emit('worldPressure:scaffoldSpawned', {
          key: rec.key, entityId: ent.id, sectorId: cur, at: simTime,
        });
      }
    }
  },

  _news(text, eventId) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('news:publish', {
      text, kind: 'events', source: SLOW_GRAY.tickerSource,
      sourceRef: eventId, eventId,
    });
  },
};

export default worldPressure;
