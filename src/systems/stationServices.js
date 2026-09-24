// stationServices.js — the station YARD: berths, service crews, and the queue discipline that
// makes docking cost time. Docking a ship is cheap; getting worked on is not.
//
//   * Service pads and yard crews per station size (S/M/L). Pads are where a hull sits; crews are
//     how many jobs the yard works at once (crews <= pads).
//   * NPC clients arrive and depart on a SEEDED per-station-day schedule — same discipline as
//     stationSideEventDirector's planner (mulberry32(hash32(seed, ...))) — so the rhythm is
//     deterministic, needs no persisted progress, and never draws state.rng.
//   * The player's repair/refuel is a timed JOB, not an instant fill: economy.handleService stays
//     the price/credit authority and hands the DELIVERY here via registryGet('stationServices')
//     when a live production dock exists (state.ui.docked). Harnesses that emit ui:service without
//     the production latch keep the legacy instant apply — nothing about them changes.
//   * Jobs progress from state.simTime, scale with damage by construction (total units = missing
//     hull/fuel), run slower on bigger hulls (yard handles a heavy frame per-point slower), and
//     run faster with faction standing (a friendly yard squeezes you in + works quicker).
//   * Inert off the dock path: no docked station → early return, no state writes, no rng draws —
//     non-station determinism hashes cannot move.
//
// Single-writer contract: this file never writes credits. economy charges up front when the job
// is booked; the yard only delivers hull/fuel over time and fires service:completed when the work
// is actually done (ships.js living-hull bookkeeping keys off that event's restored totals).

import { hash32, mulberry32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';

const DAY_SECONDS = 600;                 // sector-day contract (mirrors encounterDirector)
const REFUEL_U_PER_S = 4;                // pump rate for a mid tank at a neutral yard
const REPAIR_HP_PER_S = 6;               // weld rate for a mid frame at a neutral yard
const REFUEL_RATE_ANCHOR = 100;          // tank size where the base pump rate applies
const REPAIR_RATE_ANCHOR = 140;          // frame size where the base weld rate applies
const PROGRESS_EMIT_S = 1;               // cadence for service:progress + fuel:changed while pumping
const YARD_CHANGED_EMIT_S = 1;

const PADS_BY_SIZE = { S: 3, M: 5, L: 7 };
const CREWS_BY_SIZE = { S: 1, M: 2, L: 3 };
const CLIENTS_PER_DAY = { S: [2, 4], M: [3, 6], L: [5, 9] };
const CLIENT_KINDS = ['hauler', 'barge', 'cutter', 'liner', 'patrol'];
const CLIENT_SERVICES = ['refuel', 'repair', 'transfer'];

// Station catalog lookup — same source economy.stationInfo reads (SECTORS graph + live content
// registry), duplicated as a small pure function so this file never reaches into economy.
const STATION_INFO = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, {
      size: st.size || 'M', factionId: st.factionId || null,
      sectorId: sec.id, services: Array.isArray(st.services) ? st.services.slice() : [],
    });
  }
}

export function stationServiceProfile(state, stationId) {
  const reg = state && state.content && state.content.sectors;
  if (reg) {
    const list = Array.isArray(reg) ? reg : Object.values(reg);
    for (const sec of list) {
      for (const st of sec.stations || []) {
        if (st.id === stationId) {
          return {
            size: st.size || 'M', factionId: st.factionId || null,
            sectorId: sec.id, services: Array.isArray(st.services) ? st.services.slice() : [],
          };
        }
      }
    }
  }
  return STATION_INFO.get(stationId) || null;
}

export function yardPadsFor(size) { return PADS_BY_SIZE[size] || 4; }
export function yardCrewsFor(size) { return CREWS_BY_SIZE[size] || 1; }

/**
 * One station-day of yard clients, seeded like the side-event planner. A visit is
 * { id, kind, service, arriveAt, serviceS, departAt } — serviceS is how long the crew is on the
 * hull; the client then lingers dwellS before freeing the pad. Deterministic per
 * (seed, sectorId, day, stationId): pure projection, no persisted progress.
 */
export function planYardClients(seed, sectorId, dayIndex, stationId, sizeKey) {
  const size = sizeKey || 'M';
  const [minN, maxN] = CLIENTS_PER_DAY[size] || CLIENTS_PER_DAY.M;
  const rng = mulberry32(hash32(
    seed == null ? 0 : seed, 'stationYard', String(sectorId), dayIndex | 0, String(stationId),
  ));
  const count = minN + Math.floor(rng() * (maxN - minN + 1));
  const dayStart = dayIndex * DAY_SECONDS;
  // Yard traffic arrives in 1-3 rush windows, not an even convoy — a busy hub saturates its
  // crews in waves and is quiet between them, which is exactly the congestion the queue needs.
  const waves = 1 + Math.floor(rng() * 3);
  const centers = [];
  for (let w = 0; w < waves; w++) {
    centers.push(dayStart + ((w + 0.5 + rng() * 0.4) / waves) * DAY_SECONDS);
  }
  const visits = [];
  for (let i = 0; i < count; i++) {
    const center = centers[i % waves];
    // Clustered around the wave center (~3 min spread); clamp keeps the visit inside the day.
    const arriveAt = Math.min(dayStart + DAY_SECONDS - 5,
      Math.max(dayStart, center + (rng() * 2 - 1) * 95));
    const serviceS = 25 + rng() * 85;
    const dwellS = 10 + rng() * 70;
    visits.push({
      id: `${stationId}#${dayIndex | 0}#${i}`,
      kind: CLIENT_KINDS[Math.floor(rng() * CLIENT_KINDS.length)],
      service: CLIENT_SERVICES[Math.floor(rng() * CLIENT_SERVICES.length)],
      arriveAt,
      serviceS,
      departAt: arriveAt + serviceS + dwellS,
    });
  }
  visits.sort((a, b) => a.arriveAt - b.arriveAt);
  return visits;
}

/**
 * Occupancy of a station's pads/crews at `now`, from the seeded schedule. Clients berth in
 * arrival order; when every pad is taken, later arrivals wait off-pad (occupant of nothing, still
 * hangar traffic the player waits behind). busyCrews counts berthed clients still inside their
 * service window, capped at the crew count — a crew-limited yard is what a player job queues on.
 */
export function yardOccupancy(visits, pads, crews, now) {
  const active = (visits || [])
    .filter((v) => v && v.arriveAt <= now && now < v.departAt)
    .sort((a, b) => a.arriveAt - b.arriveAt);
  const berthed = [];
  const waiting = [];
  for (const v of active) {
    if (berthed.length < pads) berthed.push({ ...v, padIdx: berthed.length });
    else waiting.push(v);
  }
  const busyCrews = Math.min(crews, berthed.filter((v) => now < v.arriveAt + v.serviceS).length);
  return { berthed, waiting, busyCrews };
}

/**
 * Delivery rate for a player job. Bigger pools are slower per unit (a heavy frame takes the crew
 * longer per hull point), and standing with the station's faction tilts the yard.
 */
export function serviceRatePerS(type, poolMax, rep) {
  const base = type === 'refuel' ? REFUEL_U_PER_S : REPAIR_HP_PER_S;
  const anchor = type === 'refuel' ? REFUEL_RATE_ANCHOR : REPAIR_RATE_ANCHOR;
  const sizeFactor = Math.sqrt(anchor / Math.max(20, Number(poolMax) || anchor));
  let repFactor = 1;
  if (rep >= 100) repFactor = 1.2;
  else if (rep <= -50) repFactor = 0.8;
  return Math.max(0.5, base * sizeFactor * repFactor);
}

function playerRepFor(state, factionId) {
  if (!factionId) return 0;
  const f = state && state.factions && state.factions[factionId];
  return Number(f && f.rep) || 0;
}

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
}

function isProductionDocked(state) {
  return !!(state && state.ui && state.ui.docked === true
    && typeof state.ui.dockedStationId === 'string' && state.ui.dockedStationId);
}

// The yard's clock: simTime plus the wall seconds spent frozen-docked (see update()). Job
// timestamps and occupancy gates all read this so a docked session is one continuous schedule.
function yardNow(state) {
  const s = state && state.stationServices;
  return (Number(state && state.simTime) || 0) + (Number(s && s.dockedElapsed) || 0);
}

function freshState() {
  return { seq: 0, player: null, stations: {}, _viewStamp: null, dockedElapsed: 0 };
}

export function ensureStationServicesState(state) {
  if (!state.stationServices || typeof state.stationServices !== 'object'
    || Array.isArray(state.stationServices)) {
    state.stationServices = freshState();
  }
  const s = state.stationServices;
  if (!Number.isFinite(s.seq)) s.seq = 0;
  if (!s.stations || typeof s.stations !== 'object' || Array.isArray(s.stations)) s.stations = {};
  if (s.player && !Array.isArray(s.player.jobs)) s.player.jobs = [];
  return s;
}

function freshPlayer(stationId, now) {
  return { stationId, padIdx: -1, dockedAt: now, jobs: [], _lastHoldingEmit: -Infinity };
}

export const stationServices = {
  name: 'stationServices',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this._registry = ctx.registry || null;
    ensureStationServicesState(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._onDocked = (p) => this._onPlayerDocked(p);
      this._onUndocked = () => this._onPlayerUndocked();
      this._onExit = () => this._onSectorExit();
      this.bus.on('dock:docked', this._onDocked);
      this.bus.on('dock:undocked', this._onUndocked);
      this.bus.on('sector:exit', this._onExit);
    }
  },

  newGame() {
    this.state.stationServices = freshState();
  },

  // ── dock lifecycle ───────────────────────────────────────────────────────────────────────
  _onPlayerDocked(p) {
    const stationId = p && p.stationId;
    if (!stationId) return;
    const s = ensureStationServicesState(this.state);
    const now = yardNow(this.state);
    if (s.player && s.player.stationId === stationId) {
      // Re-dock at the same yard (harnesses re-emit): keep jobs, keep the pad.
      s.player.dockedAt = now;
      return;
    }
    if (s.player && s.player.stationId && s.player.stationId !== stationId) {
      // Docked somewhere new with live jobs left at the old yard: they cannot continue — a yard
      // only works on a hull sitting on its pad. Abort them before resetting.
      this._abortJobs(s.player, 'station_changed');
    }
    s.player = freshPlayer(stationId, now);
    this._materializeStation(stationId, now, true);
  },

  _onPlayerUndocked() {
    const s = ensureStationServicesState(this.state);
    if (s.player) {
      this._abortJobs(s.player, 'undock');
      s.player = null;
      s._viewStamp = null;
    }
  },

  _onSectorExit() {
    const s = ensureStationServicesState(this.state);
    s.stations = {};
    s._viewStamp = null;
    if (s.player) { this._abortJobs(s.player, 'sector_exit'); s.player = null; }
  },

  _abortJobs(player, reason) {
    if (!player || !Array.isArray(player.jobs)) return;
    const count = player.jobs.length;
    for (const job of player.jobs) {
      if (this.bus) {
        this.bus.emit('service:aborted', {
          jobId: job.id, type: job.type, stationId: job.stationId,
          applied: job.applied, total: job.total, reason,
        });
        // The completion toast's mirror: the service was paid up front, so an abort destroyed
        // paid work. Without this line the credits were gone and the hull half-done with no
        // word from the yard.
        if (job === player.jobs[0]) {
          const label = job.type === 'refuel' ? 'refuel' : 'repair';
          const pct = job.total > 0 && job.applied > 0
            ? Math.round(Math.max(0, Math.min(1, job.applied / job.total)) * 100)
            : 0;
          const head = reason === 'undock' ? 'Undocked' : 'The yard released the job';
          const text = pct > 0
            ? `${head} — ${label} stopped at ${pct}%. The rest of the paid job was cancelled.`
            : `${head} — the paid ${label} job was cancelled before the yard started it.`;
          const more = count > 1 ? ` ${count - 1} more queued job${count > 2 ? 's' : ''} cancelled with it.` : '';
          this.bus.emit('toast', { text: text + (more ? ' ' + more : ''), kind: 'warn', ttl: 5 });
        }
      }
    }
    player.jobs = [];
  },

  // ── the seam economy.handleService calls (registryGet('stationServices')) ──────────────────
  /**
   * Queue a player service job. Returns false when there is no live production dock — callers
   * (economy) keep the legacy instant apply then, which is what harness paths without uiRoot get.
   * spec: { type:'refuel'|'repair', units, stationId, meta } — meta fields pass through to the
   * completion receipt (cost, beforeProtection, restored* targets for repair).
   */
  enqueuePlayerJob(spec) {
    const state = this.state;
    if (!isProductionDocked(state)) return false;
    const stationId = spec && spec.stationId;
    if (!stationId || state.ui.dockedStationId !== stationId) return false;
    const type = spec.type === 'refuel' || spec.type === 'repair' ? spec.type : null;
    const units = Number(spec && spec.units);
    if (!type || !(units > 0)) return false;

    const s = ensureStationServicesState(state);
    if (s.player && s.player.stationId && s.player.stationId !== stationId) {
      this._abortJobs(s.player, 'station_changed');
      s.player = null;
    }
    if (!s.player) s.player = freshPlayer(stationId, yardNow(state));
    const profile = stationServiceProfile(state, stationId);
    // A station without the matching service can't take the job (refuel needs 'refuel', repair
    // needs 'repair' in its services list — same contract the UI quote layer enforces).
    const need = type === 'refuel' ? 'refuel' : 'repair';
    if (profile && Array.isArray(profile.services) && profile.services.length
      && !profile.services.includes(need)) return false;

    const job = {
      id: `job:${stationId}:${++s.seq}`,
      type,
      stationId,
      total: units,
      applied: 0,
      lastApplied: 0,
      status: 'queued',
      queuedAt: yardNow(state),
      startedAt: null,
      ratePerS: 0,
      meta: spec.meta && typeof spec.meta === 'object' ? spec.meta : {},
    };
    s.player.jobs.push(job);
    if (this.bus) {
      this.bus.emit('service:queued', {
        jobId: job.id, type, stationId, units,
        position: s.player.jobs.length - 1,
      });
    }
    return true;
  },

  // ── tick ────────────────────────────────────────────────────────────────────────────────
  update(dt, state) {
    const s = state.stationServices;
    if (!s || !s.player || !s.player.stationId) return;   // inert off the dock path
    const player = s.player;
    const stationId = player.stationId;

    // The yard only works on a hull sitting on its pad. A saved mid-job record restores
    // undocked (the save layer clears ui.docked): the job stays PARKED at the yard until the
    // player re-docks here — it does not weld a ship nobody is holding. Same for harness docks
    // that only set the combat latch.
    const dockedHere = isProductionDocked(state)
      ? state.ui.dockedStationId === stationId
      : !!(playerEntity(state) && playerEntity(state).flags && playerEntity(state).flags.docked);
    if (!dockedHere) return;
    // A production dock freezes the world clock (ui:pausing-screen pins timeScale at 0), so this
    // tick's dt is wall-frame time. The seeded client schedule must keep arriving and departing
    // on that same wall clock — a congestion snapshot taken at the dock instant never drains
    // otherwise, and a paid job would queue forever then abort unpaid on undock. Fold the frozen
    // seconds into the yard clock; simTime + dockedElapsed is the real wall time since epoch
    // (unfrozen ticks advance simTime 1:1, frozen ticks advance dockedElapsed 1:1). A harness
    // that steps an unfrozen world keeps the pure-simTime reading: no double-advance.
    const scale = Number(state.timeScale);
    if (Number.isFinite(scale) && scale <= 0) {
      s.dockedElapsed = (Number(s.dockedElapsed) || 0) + Math.max(0, Number(dt) || 0);
    }
    const now = (Number(state.simTime) || 0) + (Number(s.dockedElapsed) || 0);
    const profile = stationServiceProfile(state, stationId);
    const sizeKey = (profile && profile.size) || 'M';
    const pads = yardPadsFor(sizeKey);
    const crews = yardCrewsFor(sizeKey);
    const rep = playerRepFor(state, profile && profile.factionId);

    // Seeded yard traffic for this station-day. A day rollover mid-dock is rare and cheap to
    // re-plan: yesterday's clients are simply absent from today's schedule. The plan is a pure
    // function of the day, so it is cached on the station record rather than rebuilt per tick.
    const day = Math.floor(now / DAY_SECONDS);
    const seed = state.meta && state.meta.seed;
    const sectorId = (profile && profile.sectorId)
      || (state.world && state.world.currentSectorId) || 'sector';
    const st = s.stations[stationId] || (s.stations[stationId] = {});
    if (!st._plan || st._plan.day !== day) {
      st._plan = { day, visits: planYardClients(seed, sectorId, day, stationId, sizeKey) };
    }
    const visits = st._plan.visits;
    const occ = yardOccupancy(visits, pads, crews, now);

    // Pad assignment: a holding player takes the first pad no client occupies.
    if (player.padIdx < 0) {
      const taken = new Set(occ.berthed.map((v) => v.padIdx));
      let idx = -1;
      for (let i = 0; i < pads; i++) { if (!taken.has(i)) { idx = i; break; } }
      if (idx >= 0) {
        player.padIdx = idx;
        if (this.bus) this.bus.emit('station:berthAssigned', { stationId, padIdx: idx, clientId: 'player' });
      } else if (now - (player._lastHoldingEmit || -Infinity) >= PROGRESS_EMIT_S) {
        player._lastHoldingEmit = now;
        if (this.bus) {
          this.bus.emit('station:holding', {
            stationId, waitingClients: occ.waiting.length,
          });
        }
      }
    }

    // Job queue: the head job starts once the player is berthed and a crew is free. Standing
    // rep >= 100 squeezes the player in one crew over the posted limit.
    const effCrews = crews + (rep >= 100 ? 1 : 0);
    let active = player.jobs.find((j) => j.status === 'active') || null;
    if (!active && player.jobs.length && player.padIdx >= 0 && occ.busyCrews < effCrews) {
      const job = player.jobs[0];
      job.status = 'active';
      job.startedAt = now;
      job.ratePerS = serviceRatePerS(job.type, this._jobPoolMax(state, job), rep);
      if (this.bus) this.bus.emit('service:started', { jobId: job.id, type: job.type, stationId });
      active = job;
    }

    if (active) {
      active.applied = Math.min(active.total, active.applied + active.ratePerS * dt);
      this._applyJobDelta(state, active, active.applied - active.lastApplied);
      active.lastApplied = active.applied;
      if (now - (active._lastProgressEmit || -Infinity) >= PROGRESS_EMIT_S) {
        active._lastProgressEmit = now;
        if (this.bus) {
          this.bus.emit('service:progress', {
            jobId: active.id, type: active.type, stationId,
            applied: active.applied, total: active.total,
          });
          if (active.type === 'refuel' && state.fuel) {
            this.bus.emit('fuel:changed', { current: state.fuel.current, max: state.fuel.max });
          }
        }
      }
      if (active.applied >= active.total - 1e-9) {
        player.jobs.shift();
        this._emitJobCompleted(state, active, now);
      }
    }

    // Materialized berth view refreshes on a 1 Hz cadence — occupancy transitions happen on
    // seeded client arrivals/departures, not per tick.
    if (now - (s._viewNextT || -Infinity) >= YARD_CHANGED_EMIT_S) {
      s._viewNextT = now;
      this._materializeStation(stationId, now, false, { pads, occ });
    }
  },

  _jobPoolMax(state, job) {
    if (job.type === 'refuel') {
      const fuel = state.fuel || {};
      return Number.isFinite(fuel.max) && fuel.max > 0 ? fuel.max : REFUEL_RATE_ANCHOR;
    }
    const e = playerEntity(state);
    const pool = e ? (Number(e.hullMax) || 0) + (Number(e.armorMax) || 0) : 0;
    return pool > 0 ? pool : REPAIR_RATE_ANCHOR;
  },

  _applyJobDelta(state, job, delta) {
    if (!(delta > 0)) return;
    if (job.type === 'refuel') {
      const fuel = state.fuel || (state.fuel = { current: 0, max: 100 });
      fuel.current = Math.min(fuel.max, (fuel.current || 0) + delta);
      return;
    }
    const e = playerEntity(state);
    if (!e) return;
    const shares = job.meta && job.meta.shares;
    const hullShare = shares && Number.isFinite(shares.hull) ? shares.hull : 1;
    const armorShare = shares && Number.isFinite(shares.armor) ? shares.armor : 0;
    if (hullShare > 0 && Number.isFinite(e.hullMax)) {
      e.hull = Math.min(e.hullMax, (Number(e.hull) || 0) + delta * hullShare);
    }
    if (armorShare > 0 && Number.isFinite(e.armorMax)) {
      e.armorHp = Math.min(e.armorMax, (Number(e.armorHp) || 0) + delta * armorShare);
    }
  },

  _emitJobCompleted(state, job, now) {
    if (!this.bus) return;
    if (job.type === 'repair') {
      const e = playerEntity(state);
      const meta = job.meta || {};
      this.bus.emit('service:completed', {
        type: 'repair',
        cost: meta.cost,
        restoredHull: Number.isFinite(meta.restoredHull) ? meta.restoredHull : job.applied,
        restoredArmor: Number.isFinite(meta.restoredArmor) ? meta.restoredArmor : 0,
        hullMax: e ? e.hullMax : meta.hullMax,
        armorMax: e ? e.armorMax : meta.armorMax,
        beforeProtection: meta.beforeProtection,
        stationId: job.stationId,
        atT: now,
      });
      this.bus.emit('toast', { text: 'Repair complete', kind: 'success', ttl: 2 });
    } else {
      if (state.fuel) {
        this.bus.emit('fuel:changed', { current: state.fuel.current, max: state.fuel.max });
      }
      this.bus.emit('service:completed', {
        type: 'refuel',
        cost: job.meta && job.meta.cost,
        units: job.applied,
        stationId: job.stationId,
        atT: now,
      });
      this.bus.emit('toast', { text: 'Refuel complete', kind: 'success', ttl: 2 });
    }
  },

  /** Materialized yard view on state — surfaces read berths/occupancy straight from the bag. */
  _materializeStation(stationId, now, force, cached) {
    const s = ensureStationServicesState(this.state);
    const rec = cached && cached.occ
      ? cached
      : (() => {
        const profile = stationServiceProfile(this.state, stationId);
        const sizeKey = (profile && profile.size) || 'M';
        const day = Math.floor(now / DAY_SECONDS);
        const seed = this.state.meta && this.state.meta.seed;
        const sectorId = (profile && profile.sectorId)
          || (this.state.world && this.state.world.currentSectorId) || 'sector';
        const st = s.stations[stationId] || (s.stations[stationId] = {});
        if (!st._plan || st._plan.day !== day) {
          st._plan = { day, visits: planYardClients(seed, sectorId, day, stationId, sizeKey) };
        }
        return { pads: yardPadsFor(sizeKey), occ: yardOccupancy(st._plan.visits, yardPadsFor(sizeKey), yardCrewsFor(sizeKey), now) };
      })();
    const player = s.player;
    const padsArr = [];
    for (let i = 0; i < rec.pads; i++) {
      const client = rec.occ.berthed.find((v) => v.padIdx === i);
      padsArr.push({
        occupant: client ? client.id : (player && player.padIdx === i ? 'player' : null),
        kind: client ? client.kind : (player && player.padIdx === i ? 'player' : null),
      });
    }
    const view = {
      pads: padsArr,
      busyCrews: rec.occ.busyCrews,
      waitingClients: rec.occ.waiting.length,
      updatedAt: now,
    };
    const stamp = JSON.stringify(view.pads) + '|' + view.busyCrews + '|' + view.waitingClients;
    const st = s.stations[stationId] || (s.stations[stationId] = {});
    st.pads = view.pads;
    st.busyCrews = view.busyCrews;
    st.waitingClients = view.waitingClients;
    st.updatedAt = now;
    if (force || stamp !== s._viewStamp) {
      s._viewStamp = stamp;
      if (this.bus) {
        this.bus.emit('station:yardChanged', {
          stationId,
          pads: view.pads.map((p) => ({ occupant: p.occupant, kind: p.kind })),
          busyCrews: view.busyCrews,
          waitingClients: view.waitingClients,
          queueLen: player && Array.isArray(player.jobs) ? player.jobs.length : 0,
        });
      }
    }
  },

  // ── persistence — the player block survives a save; client traffic is re-derived ──────────
  serialize() {
    const s = this.state.stationServices;
    if (!s) return {};
    const dockedElapsed = Number(s.dockedElapsed) || 0;
    if (!s.player) return { dockedElapsed };
    return {
      seq: s.seq,
      dockedElapsed,
      player: {
        stationId: s.player.stationId,
        padIdx: s.player.padIdx,
        dockedAt: s.player.dockedAt,
        jobs: s.player.jobs.map((j) => ({
          id: j.id, type: j.type, stationId: j.stationId,
          total: j.total, applied: j.applied, lastApplied: j.lastApplied,
          status: j.status, queuedAt: j.queuedAt, startedAt: j.startedAt,
          ratePerS: j.ratePerS, meta: j.meta && typeof j.meta === 'object' ? j.meta : {},
        })),
      },
    };
  },

  deserialize(data) {
    const s = ensureStationServicesState(this.state);
    if (Number.isFinite(data && data.dockedElapsed)) {
      s.dockedElapsed = Math.max(0, Number(data.dockedElapsed));
    }
    if (!data || typeof data !== 'object' || !data.player) {
      s.player = null;
      s.stations = {};
      return;
    }
    const p = data.player;
    s.seq = Number.isFinite(data.seq) ? data.seq : 0;
    s.player = {
      stationId: typeof p.stationId === 'string' ? p.stationId : null,
      padIdx: Number.isFinite(p.padIdx) ? p.padIdx : -1,
      dockedAt: Number(p.dockedAt) || 0,
      jobs: Array.isArray(p.jobs) ? p.jobs.map((j) => ({
        id: String(j.id || `job:${p.stationId}:r${++s.seq}`),
        type: j.type === 'refuel' ? 'refuel' : 'repair',
        stationId: typeof j.stationId === 'string' ? j.stationId : p.stationId,
        total: Math.max(0, Number(j.total) || 0),
        applied: Math.max(0, Number(j.applied) || 0),
        lastApplied: Math.max(0, Number(j.lastApplied) || 0),
        status: j.status === 'active' ? 'active' : 'queued',
        queuedAt: Number(j.queuedAt) || 0,
        startedAt: Number.isFinite(j.startedAt) ? j.startedAt : null,
        ratePerS: Math.max(0, Number(j.ratePerS) || 0),
        meta: j.meta && typeof j.meta === 'object' ? j.meta : {},
      })) : [],
      _lastHoldingEmit: -Infinity,
    };
    if (!s.player.stationId) s.player = null;
    s.stations = {};
    s._viewStamp = null;
  },

  destroy() {
    if (this.bus && this.bus.off) {
      if (this._onDocked) this.bus.off('dock:docked', this._onDocked);
      if (this._onUndocked) this.bus.off('dock:undocked', this._onUndocked);
      if (this._onExit) this.bus.off('sector:exit', this._onExit);
    }
    this._onDocked = this._onUndocked = this._onExit = null;
  },
};

export default stationServices;
