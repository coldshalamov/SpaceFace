// sectorSim — the offscreen statistical simulation engine (ADR-0002 / V2 §32–38).
//
// PRINCIPLE: "The view boundary is the simulation boundary" (V2 §34, law #19). Sectors the player
// is NOT in are never tick-simulated; instead they evolve via a closed-form statistical model
// advanced on the cheap day-tick cadence. When the player re-enters a sector, the elapsed window T
// is reconciled in one pass (V2 §33.3 four-step recipe).
//
// Universal outcome formula (V2 §33.1):
//   P(outcome) = clamp( baseHazard × exposure × assetVulnerability × mitigation, 0, 1 )
//   baseHazard        ← dangerIndex(sector) (src/data/sectors.js), now made mutable via a drift overlay
//   exposure          ← elapsed sim-time since last visit
//   assetVulnerability← automation asset stats (trader baseLossPerCycle, drone durabilityMax)
//   mitigation        ← guards/escorts + speed
//
// CORRECTNESS INVARIANT (ADR-0002 §86-88): offscreen RNG is seed-stable per region/event — a sector's
// outcome is independent of *when* the player looks at it. Implemented as a dedicated seeded stream
// with per-sector substreams. Never call Math.random() in the sim path (§0.5).
//
// SINGLE-WRITER (§0.6): this system owns ONLY state.sectorSim. It never writes state.player.*,
// state.factions.*, state.world.sectors.*, or state.automation.* directly — it affects them by
// emitting sanctioned intents (economy:applyTradePressure, faction:repDelta → addOffscreenTension,
// automation.offscreenRiskPass) and by exposing a read-only danger overlay.
import { SECTORS, dangerIndex } from '../data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const DAY_SECONDS = 600;                 // matches coreSystem.DAY_SECONDS
const OFFLINE_CAP_SEC = 14400;           // 4h — matches automation.AUTO_BALANCE.offlineCapSec
const OFFLINE_EFF = 0.6;                 // "presence is always better" — matches automation

// Drift bounds. Security can swing but never reaches the absolute extremes (a sector never becomes a
// perfect police state or pure anarchy from drift alone — that's a faction-flip event's job).
const SECURITY_MIN = 0.02, SECURITY_MAX = 0.99;
const DENSITY_MIN = 0,    DENSITY_MAX = 0.80;

// Drift tuning. A sector's security/eased toward a target shaped by its owning faction's current
// power (strong owner → more patrols → higher security; weak/aggro owner → lawless → lower security).
// DRIFT_RATE is per-day; with easing it reaches ~63% of the target in 1/DRIFT_RATE days.
const DRIFT_RATE = 0.20;                 // ~5-day time constant
const POWER_TO_SECURITY = 0.012;         // +1 faction power → +1.2% target security
const NOISE_AMP = 0.015;                 // ±1.5% seeded noise per day (keeps it alive, not robotic)

// Offscreen conflict tension: when two factions contest a sector, the danger imbalance feeds the
// war-resolution machinery in factions.js. Scaled so a stable, well-policed contested sector stays
// cold and a chaotic pirate-vs-lawful hot-zone actually erupts.
const TENSION_FROM_DANGER = 2.5;         // +dangerIndex*2.5 tension per day on contested hot zones
const TENSION_FROM_IMBALANCE = 0.4;      // +|powerB-powerA|*0.4 tension per day

// Determinism (V2 §36): same seed → same outcome; reload does NOT reroll. A "fortune insurance"
// credit-sink that lets you reroll catastrophic losses is a deferred follow-on phase.
export const sectorSim = {
  name: 'sectorSim',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._accum = 0;

    // Cadence: day-tick is the cheap coarse batch the player can't perceive at higher granularity
    // (V2 §38 Q18). Everything heavy happens here, never in update().
    this.bus.on('day:tick', (p) => { try { this._onDayTick(p); } catch (err) { console.error('[sectorSim] day:tick', err); } });

    // View-boundary transitions: stamp the away-clock on exit, reconcile on enter.
    this.bus.on('sector:exit',  (p) => { try { this._onSectorExit(p); } catch (err) { console.error('[sectorSim] sector:exit', err); } });
    this.bus.on('sector:enter', (p) => { try { this._onSectorEnter(p); } catch (err) { console.error('[sectorSim] sector:enter', err); } });

    // Real-offline catch-up: simulate the time the player wasn't in the game at all (mirrors
    // automation.runOfflineCatchup). Fires after the full restore sequence completes.
    this.bus.on('save:loaded', () => { try { this.runOfflineCatchup(); } catch (err) { console.error('[sectorSim] save:loaded', err); } });
    this.bus.on('game:new',    () => { try { this.newGame(); } catch (err) { console.error('[sectorSim] game:new', err); } });
    this.bus.on('game:started',() => { try { this._seedCurrentSector(); } catch (err) { /* non-critical */ } });

    this._initRng();
    this._installDiagnostics();
  },

  // update() does NO heavy work — it only refreshes the diagnostics mirror on a coarse accumulator.
  // All simulation happens in _onDayTick / _onSectorEnter / runOfflineCatchup. A bug here can never
  // freeze the loop (onboarding pattern).
  update(dt, state) {
    try {
      this._accum += dt;
      if (this._accum < 1.0) return;       // 1s refresh cadence for the mirror
      this._accum = 0;
      this._refreshDiagnostics();
    } catch (_) { /* never let diagnostics break the loop */ }
  },

  // ------------------------------------------------------------------------------------------
  // Seeded RNG — seed-stable per sector + day (the ADR §86-88 invariant).
  // ------------------------------------------------------------------------------------------

  _initRng() {
    const state = this.state;
    const seed = (state.meta && state.meta.seed) || 1;
    const h = this.helpers.hash32 ? this.helpers.hash32(seed, 'sectorSim') : (seed * 2654435761) >>> 0;
    state.sectorSim.meta.rngSeed = h >>> 0;
    this.rng = this.helpers.mulberry32 ? this.helpers.mulberry32(h >>> 0) : mulberryLocal(h >>> 0);
  },

  // Per-sector + per-day substream. Same (seed, sectorId, dayCounter) ⇒ same draw regardless of
  // when it's evaluated. This is what makes the world stable when you look away and come back.
  _sectorStream(sectorId, dayCounter) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const h = this.helpers.hash32(seed, sectorId, 'sectorSim', dayCounter);
    return (this.helpers.mulberry32 || mulberryLocal)(h >>> 0);
  },

  _rng() {
    return (this.state.sectorSim && this.rng) ? this.rng() : Math.random();
  },

  // ------------------------------------------------------------------------------------------
  // Per-sector sim state (owned subtree).
  // ------------------------------------------------------------------------------------------

  _sectorRec(sectorId) {
    const ss = this.state.sectorSim;
    let rec = ss.sectors[sectorId];
    if (!rec) {
      const base = SECTOR_BY_ID.get(sectorId);
      rec = {
        // The drift overlay. null until first drift → callers fall through to base sector data.
        drift: null,
        lastEnterSimT: this.state.simTime || 0,
        lastDay: 0,
      };
      ss.sectors[sectorId] = rec;
    }
    return rec;
  },

  // The single read API for danger consumers. Returns a synthetic sector object with drift applied,
  // falling back to the base sector when no drift exists yet. This works with the existing pure
  // dangerIndex()/dangerTier()/wealthIndex() helpers without changing their signatures.
  effectiveSector(sectorId) {
    return effectiveSectorFor(this.state, sectorId);
  },

  effectiveDanger(sectorId) {
    return effectiveDangerFor(this.state, sectorId);
  },

  // ------------------------------------------------------------------------------------------
  // Day-tick: the cheap coarse batch that advances every offscreen sector.
  // ------------------------------------------------------------------------------------------

  _onDayTick(p) {
    const state = this.state;
    if (!state || !state.world) return;
    const days = (p && p.days) || 1;
    const currentId = state.world.currentSectorId;
    let sectorsTicked = 0;
    let losses = 0;
    const dayCounter = Math.floor((state.simTime || 0) / DAY_SECONDS);

    for (const sec of SECTORS) {
      if (sec.id === currentId) continue;          // view boundary = simulation boundary
      sectorsTicked++;
      this._driftSector(sec, days, dayCounter);
      this._pushEconomyPressure(sec, days, dayCounter);
    }

    // Asset losses + territory tension are single-writer-safe intents (S5/S4).
    losses += this._rollAssetLosses(days);
    this._injectConflictTension(days);

    state.sectorSim.meta.lastTickSimT = state.simTime || 0;
    this.bus.emit('sectorsim:tick', { days, sectorsTicked, losses, dayCounter });
  },

  // Drift security/enemyDensity toward a faction-power-shaped target ± seeded noise.
  _driftSector(sec, days, dayCounter) {
    const rec = this._sectorRec(sec.id);
    if (!rec.drift) rec.drift = { security: sec.security, enemyDensity: sec.enemyDensity || 0 };
    const d = rec.drift;

    // Owning faction's current power shapes the target. Strong lawful owner → high security; weak
    // or aggressive owner (e.g. pirates) → lawless. Aggro factions actively drag security down.
    const owner = (this.state.world.sectors[sec.id] && this.state.world.sectors[sec.id].owner) || sec.factionId;
    const f = this.state.factions[owner];
    const power = (f && f.power) || 5;
    const aggro = (f && f.aggro) || false;
    let targetSecurity = clamp(0.35 + power * POWER_TO_SECURITY + (sec.tier * -0.06), SECURITY_MIN, SECURITY_MAX);
    if (aggro) targetSecurity = clamp(targetSecurity - 0.25, SECURITY_MIN, SECURITY_MAX);

    // Seeded noise — stable per (sector, day), independent of visit order.
    const stream = this._sectorStream(sec.id, dayCounter);
    const noise = (stream() - 0.5) * 2 * NOISE_AMP;

    // Exponential easing toward target: d' = d + rate * (target - d) * dt.
    const rate = DRIFT_RATE * days;
    d.security = clamp(d.security + rate * (targetSecurity - d.security) + noise, SECURITY_MIN, SECURITY_MAX);

    // enemyDensity eases toward the inverse of security (more lawless → more pirates nest here),
    // bounded by the sector's tier-appropriate ceiling.
    const densityCeil = clamp(0.15 + sec.tier * 0.18, DENSITY_MIN, DENSITY_MAX);
    const targetDensity = clamp((1 - d.security) * 0.8, DENSITY_MIN, densityCeil);
    d.enemyDensity = clamp(d.enemyDensity + rate * (targetDensity - d.enemyDensity), DENSITY_MIN, densityCeil);

    rec.lastDay = dayCounter;
  },

  // Offscreen NPC trade drains/floods market stock. Danger ↑ → fewer haulers survive the lane →
  // destination stock drains (prices rise). Low danger → lanes flow, stock floods (prices fall).
  // Routed through the sanctioned economy channel — we never touch state.economy directly.
  _pushEconomyPressure(sec, days, dayCounter) {
    if (!sec.stations || !sec.stations.length) return;
    const danger = this.effectiveDanger(sec.id);
    // Drain scales with danger; a safe sector's lanes flow (slight flood). One roll per day.
    const stream = this._sectorStream(sec.id, dayCounter);
    const drainPerStation = Math.round((danger * 60 - 8) * days);     // -8..+52 stock units/day
    if (drainPerStation === 0) return;
    for (const st of sec.stations) {
      if (!st || !st.id) continue;
      // Only nudge a couple of commodities per station per day — cheap, avoids flooding all markets.
      if (stream() < 0.4) {
        const good = GENERIC_GOODS[Math.floor(stream() * GENERIC_GOODS.length) % GENERIC_GOODS.length];
        this.bus.emit('economy:applyTradePressure', { stationId: st.id, good, vol: -drainPerStation });
      }
    }
  },

  // ------------------------------------------------------------------------------------------
  // Asset losses (S5): delegate to automation's own offscreen risk pass — it owns state.automation
  // and already has the _traderLossProb / _loseAsset / _outpostRaid machinery. We just tell it to
  // run against the effective (drifted) danger for the elapsed day window.
  // ------------------------------------------------------------------------------------------

  _rollAssetLosses(days) {
    const auto = this.registry && this.registry.get && this.registry.get('automation');
    if (!auto || typeof auto.offscreenRiskPass !== 'function') return 0;
    try {
      // Pass a danger resolver so automation evaluates routes against drifted danger, not static.
      return auto.offscreenRiskPass(days, (sectorId) => this.effectiveDanger(sectorId)) || 0;
    } catch (err) {
      console.error('[sectorSim] offscreenRiskPass', err);
      return 0;
    }
  },

  // ------------------------------------------------------------------------------------------
  // Territory tension (S4): feed the factions war-resolution machinery. factions owns state.conflicts;
  // we only call its sanctioned addOffscreenTension() method so the single-writer invariant holds.
  // ------------------------------------------------------------------------------------------

  _injectConflictTension(days) {
    const fac = this.registry && this.registry.get && this.registry.get('factions');
    if (!fac || typeof fac.addOffscreenTension !== 'function') return;
    try {
      for (const key in this.state.conflicts) {
        const c = this.state.conflicts[key];
        if (!c) continue;
        // Each contested pair maps to one sector (factions.CONTESTED). Use that sector's danger.
        const sectorId = fac.contestedSectorFor && fac.contestedSectorFor(key);
        if (!sectorId) continue;
        const danger = this.effectiveDanger(sectorId);
        const [a, b] = key.split(':');
        const pa = (this.state.factions[a] && this.state.factions[a].power) || 0;
        const pb = (this.state.factions[b] && this.state.factions[b].power) || 0;
        const imbalance = Math.abs(pb - pa);
        const tension = (danger * TENSION_FROM_DANGER + imbalance * TENSION_FROM_IMBALANCE) * days;
        if (tension > 0) fac.addOffscreenTension(key, tension, 'sectorSim');
      }
    } catch (err) {
      console.error('[sectorSim] injectConflictTension', err);
    }
  },

  // ------------------------------------------------------------------------------------------
  // Reconciliation (S6): V2 §33.3 four-step recipe on sector enter/exit.
  // ------------------------------------------------------------------------------------------

  _onSectorExit(p) {
    const id = p && p.sectorId;
    if (!id) return;
    const rec = this._sectorRec(id);
    rec.lastEnterSimT = this.state.simTime || 0;    // stamp the away-clock
    this.state.sectorSim.meta.lastWallT = Date.now();
  },

  _onSectorEnter(p) {
    const id = p && p.sectorId;
    if (!id) return;
    const rec = this._sectorRec(id);
    const T = Math.max(0, (this.state.simTime || 0) - rec.lastEnterSimT);
    rec.lastEnterSimT = this.state.simTime || 0;
    // The day-tick has already advanced this sector's drift + applied its losses during the away
    // window (it ran for every non-current sector). Reconciliation here is mostly bookkeeping —
    // the deferred outcomes (wrecks, alerts) were emitted live by intervention. We emit a reconcile
    // event so any UI/telemetry can surface "this sector changed while you were away".
    if (T > DAY_SECONDS) {
      this.bus.emit('sectorsim:reconcile', { sectorId: id, elapsedSimT: T });
    }
    this._refreshDiagnostics();
  },

  _seedCurrentSector() {
    // On game start, stamp the current sector so the first exit has a sane baseline.
    const id = this.state.world && this.state.world.currentSectorId;
    if (id) this._sectorRec(id).lastEnterSimT = this.state.simTime || 0;
  },

  // ------------------------------------------------------------------------------------------
  // Real-offline catch-up (mirrors automation.runOfflineCatchup). Advances offscreen sectors for the
  // wall-clock time the player wasn't in the game at all, capped + scaled by offlineEff.
  // ------------------------------------------------------------------------------------------

  runOfflineCatchup() {
    const ss = this.state.sectorSim;
    if (!ss) return;
    const last = (ss.meta && ss.meta.lastWallT) || 0;
    if (!last) { ss.meta.lastWallT = Date.now(); return; }
    let elapsed = (Date.now() - last) / 1000;
    elapsed = clamp(elapsed, 0, OFFLINE_CAP_SEC);
    ss.meta.lastWallT = Date.now();
    if (elapsed < DAY_SECONDS) return;             // less than one day → nothing to simulate

    // Coarse-batch: convert elapsed wall-seconds to in-game days and run a single offscreen pass,
    // scaled by offlineEff so being online is always better (matches automation's philosophy).
    const days = Math.max(1, Math.floor((elapsed * OFFLINE_EFF) / DAY_SECONDS));
    try {
      this._onDayTick({ days, elapsed });
      const hrs = (elapsed / 3600).toFixed(1);
      this.bus.emit('sectorsim:offlineSummary', { elapsedSec: Math.round(elapsed), days });
      this.bus.emit('toast', { text: `While away (${hrs}h): sector activity advanced ${days} days`, kind: 'info', ttl: 6 });
    } catch (err) {
      console.error('[sectorSim] offline catchup', err);
    }
  },

  // ------------------------------------------------------------------------------------------
  // Save / load — owns state.sectorSim. Strip the transient rng fn, persist rngSeed for deterministic
  // continuation (same pattern as automation.js:1224).
  // ------------------------------------------------------------------------------------------

  newGame() {
    this.state.sectorSim = {
      sectors: {},
      meta: { rngSeed: 0, lastTickSimT: 0, lastWallT: Date.now(), lossLog: [] },
    };
    this._initRng();
    this.state.sectorSim.meta.lastWallT = Date.now();
  },

  serialize() {
    const ss = this.state.sectorSim;
    return {
      sectors: clonePlain(ss.sectors),
      meta: {
        rngSeed: ss.meta.rngSeed || 0,
        lastTickSimT: ss.meta.lastTickSimT || 0,
        lastWallT: Date.now(),                 // stamp so offline catch-up has a baseline on load
        lossLog: (ss.meta.lossLog || []).slice(-50),   // bounded log
      },
    };
  },

  deserialize(data) {
    const ss = this.state.sectorSim;
    ss.sectors = (data && data.sectors) || {};
    ss.meta = {
      rngSeed: (data && data.meta && data.meta.rngSeed) || 0,
      lastTickSimT: (data && data.meta && data.meta.lastTickSimT) || 0,
      lastWallT: 0,                             // forces runOfflineCatchup to seed baseline on first load
      lossLog: (data && data.meta && data.meta.lossLog) || [],
    };
    this._initRng();                            // re-seed from restored rngSeed (deterministic continuation)
  },

  // ------------------------------------------------------------------------------------------
  // Diagnostics (S7): read-only mirror on window, never touches sim state (diagnostics.js contract).
  // ------------------------------------------------------------------------------------------

  _installDiagnostics() {
    if (typeof window === 'undefined') return;
    window.__SF_SECTORSIM__ = {
      sectorsTicked: 0, lossesIncurred: 0, lastReconcileT: 0, lastDayCounter: 0,
      perSector: {}, _sys: this,
      getReport() { return this._sys._buildReport(); },
    };
  },

  _buildReport() {
    const state = this.state;
    const currentId = state.world && state.world.currentSectorId;
    const perSector = {};
    for (const sec of SECTORS) {
      const eff = this.effectiveSector(sec.id);
      const rec = state.sectorSim.sectors[sec.id];
      perSector[sec.id] = {
        name: sec.name,
        baseSecurity: sec.security,
        security: eff ? eff.security : sec.security,
        enemyDensity: eff ? eff.enemyDensity : (sec.enemyDensity || 0),
        dangerIndex: this.effectiveDanger(sec.id),
        owner: (state.world.sectors[sec.id] && state.world.sectors[sec.id].owner) || sec.factionId,
        current: sec.id === currentId,
        lastEnterSimT: (rec && rec.lastEnterSimT) || 0,
      };
    }
    return { perSector, simTime: state.simTime || 0, rngSeed: state.sectorSim.meta.rngSeed || 0 };
  },

  _refreshDiagnostics() {
    if (typeof window === 'undefined' || !window.__SF_SECTORSIM__) return;
    const r = this._buildReport();
    const w = window.__SF_SECTORSIM__;
    w.perSector = r.perSector;
    w.rngSeed = r.rngSeed;
  },
};

// A small representative commodity basket for offscreen trade pressure. Using real commodity ids keeps
// the economy pressure meaningful; chosen from commonly-traded goods so pressure lands on real markets.
const GENERIC_GOODS = ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_food', 'cmdty_fuel', 'cmdty_scrap_metal'];

// Local mulberry32 fallback for isolated unit tests where helpers are absent (mirrors economy.js).
function mulberryLocal(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// clonePlain: shallow-deep clone of plain JSON data (no fn/Map/THREE). Inline minimal version so this
// module has no import cycle with saveSystem; the shape here is always plain JSON.
function clonePlain(o) {
  if (o == null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(clonePlain);
  const out = {};
  for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = clonePlain(o[k]);
  return out;
}

export default sectorSim;

// Standalone resolvers for consumers that don't hold a sectorSim reference (UI screens, systems that
// only have `state`). Read the drift overlay directly from state; fall back to the static catalog
// when no drift exists yet (no sectorSim initialized, or sector never visited). These are READ-ONLY
// and never mutate state — they let every dangerIndex consumer see live hazard (V2 §35.3).
export function effectiveSectorFor(state, sectorId) {
  const base = SECTOR_BY_ID.get(sectorId);
  if (!base) return null;
  const rec = state && state.sectorSim && state.sectorSim.sectors && state.sectorSim.sectors[sectorId];
  const drift = rec && rec.drift;
  if (!drift) return base;
  return Object.assign({}, base, { security: drift.security, enemyDensity: drift.enemyDensity });
}

export function effectiveDangerFor(state, sectorId) {
  const sec = effectiveSectorFor(state, sectorId);
  return sec ? dangerIndex(sec) : 0;
}

export function effectiveDangerTierFor(state, sectorId) {
  const sec = effectiveSectorFor(state, sectorId);
  if (!sec) return 0;
  return clamp(Math.round((1 - sec.security) * 5), 0, 5);
}

