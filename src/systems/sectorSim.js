// sectorSim — runtime adapter for the deterministic offscreen world field.
//
// The simulation kernel lives in dangerModel.js and is pure/headless. This file owns only
// state.sectorSim, translates authored/runtime state into kernel inputs, and projects model outputs
// through sanctioned contracts:
//   • danger -> effectiveSectorFor()/effectiveDangerFor() -> world spawns + automation risk
//   • price pressure -> economy:applyTradePressure intents
//   • influence -> factions.addOffscreenTension() -> existing territory-flip single writer
//   • transit exposure -> projectile:hit intent -> combat remains the sole health writer
//
// No agent population is simulated. Complexity is O((V + E) * factions) per coarse field step.
import { SECTORS, dangerIndex, dangerTier } from '../data/sectors.js';
import { FACTION_META } from '../data/factions.js';
import { hash32, mulberry32 } from '../core/rng.js';
import {
  SECTOR_FIELD_VERSION,
  buildSectorGraph,
  createSectorField,
  stepSectorField,
  readSectorField,
  sectorFieldDigest,
} from './dangerModel.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const FACTION_IDS = FACTION_META.map((f) => f.id).sort();
const STATION_TO_SECTOR = new Map();
for (const sector of SECTORS) for (const station of (sector.stations || [])) STATION_TO_SECTOR.set(station.id, sector.id);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DAY_SECONDS = 600;                 // core time contract
const MODEL_STEP_SECONDS = 60;           // accumulate at 60 Hz; integrate the graph once per sim-minute
const MARKET_CADENCE_DAYS = 0.25;        // stock intents are batched; no event-bus spray every frame
const RISK_CADENCE_DAYS = 1;
const OFFLINE_CAP_SEC = 14400;
const OFFLINE_EFF = 0.6;
const SECURITY_MIN = 0.02, SECURITY_MAX = 0.99;
const DENSITY_MIN = 0, DENSITY_MAX = 0.80;
const MAX_IMPULSES = 256;
const MAX_INTEL_ALERTS = 3;

const STATION_GOODS = Object.freeze({
  refinery: ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_fuel'],
  mine: ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_scrap_metal'],
  mining: ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_scrap_metal'],
  trade_hub: ['cmdty_food', 'cmdty_fuel', 'cmdty_scrap_metal'],
  fab: ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_scrap_metal'],
  shipyard: ['cmdty_ore_iron', 'cmdty_fuel', 'cmdty_scrap_metal'],
  blackmarket: ['cmdty_fuel', 'cmdty_scrap_metal', 'cmdty_food'],
  research: ['cmdty_fuel', 'cmdty_ore_copper', 'cmdty_food'],
  station: ['cmdty_food', 'cmdty_fuel', 'cmdty_scrap_metal'],
});
const DEFAULT_GOODS = ['cmdty_ore_iron', 'cmdty_ore_copper', 'cmdty_food', 'cmdty_fuel', 'cmdty_scrap_metal'];

export const sectorSim = {
  name: 'sectorSim',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._graph = buildSectorGraph(SECTORS);
    this._diagAccum = 0;

    this._ensureState();
    this._initRng();
    this._ensureField();

    // Runtime integration is driven by the existing fixed-step registry. The per-frame hook only
    // accumulates elapsed simulated time; graph work occurs at MODEL_STEP_SECONDS boundaries.
    this.bus.on('day:tick', (p) => this._guard('day:tick', () => this._onDayTick(p)));
    this.bus.on('sector:exit', (p) => this._guard('sector:exit', () => this._onSectorExit(p)));
    this.bus.on('sector:enter', (p) => this._guard('sector:enter', () => this._onSectorEnter(p)));
    this.bus.on('save:loaded', () => this._guard('save:loaded', () => this.runOfflineCatchup()));
    this.bus.on('game:new', () => this._guard('game:new', () => this.newGame()));
    this.bus.on('game:started', () => this._guard('game:started', () => this._seedCurrentSector()));

    // Event-to-field boundary. These are impulses, not random walks: player/NPC outcomes become
    // bounded sources which then diffuse/decay under the same deterministic kernel.
    this.bus.on('sectorsim:impulse', (p) => this.injectImpulse(p));
    this.bus.on('economy:tradeCompleted', (p) => this._onTradeCompleted(p));
    this.bus.on('interdiction:triggered', (p) => this.injectImpulse({
      kind: 'interdiction', sectorId: p && p.sectorId, danger: 0.035,
    }));
    this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
    this.bus.on('conflict:flip', (p) => this._onConflictFlip(p));

    // Transit consequence path: sectorSim computes exposure; combat applies damage through its
    // existing single-writer pipeline. Speed lowers incident probability; armor/hull absorb impact.
    this.bus.on('jump:start', (p) => this._onJumpStart(p));
    this.bus.on('jump:arrive', (p) => this._onJumpArrive(p));

    this._installDiagnostics();
  },

  update(dt, state) {
    if (state) this.state = state;
    try {
      const ss = this._ensureState();
      const simT = Number(this.state.simTime) || 0;
      const elapsed = simT - (Number(ss.meta.lastTickSimT) || 0);
      if (elapsed >= MODEL_STEP_SECONDS) {
        this._advanceModel(elapsed / DAY_SECONDS, 'fixed_step');
        ss.meta.lastTickSimT = simT;
      }

      this._diagAccum += Math.max(0, Number(dt) || 0);
      if (this._diagAccum >= 1) {
        this._diagAccum = 0;
        this._refreshDiagnostics();
      }
    } catch (err) {
      console.error('[sectorSim] update', err);
    }
  },

  // ------------------------------------------------------------------------------------------
  // Determinism + owned state.
  // ------------------------------------------------------------------------------------------

  _ensureState() {
    const state = this.state;
    if (!state.sectorSim || typeof state.sectorSim !== 'object') state.sectorSim = {};
    const ss = state.sectorSim;
    if (!ss.sectors || typeof ss.sectors !== 'object') ss.sectors = {};
    if (!Array.isArray(ss.impulses)) ss.impulses = [];
    if (!ss.meta || typeof ss.meta !== 'object') ss.meta = {};
    const m = ss.meta;
    if (!Number.isFinite(m.rngSeed)) m.rngSeed = 0;
    if (!Number.isFinite(m.lastTickSimT)) m.lastTickSimT = 0;
    if (!Number.isFinite(m.lastWallT)) m.lastWallT = 0;
    if (!Array.isArray(m.lossLog)) m.lossLog = [];
    if (!Number.isFinite(m.nextImpulseSeq)) m.nextImpulseSeq = 1;
    if (!Number.isFinite(m.transitCounter)) m.transitCounter = 0;
    if (!Number.isFinite(m.marketAccumulatorDays)) m.marketAccumulatorDays = 0;
    if (!Number.isFinite(m.riskAccumulatorDays)) m.riskAccumulatorDays = 0;
    if (!Number.isFinite(m.modelVersion)) m.modelVersion = SECTOR_FIELD_VERSION;
    if (!m.lastIntel || typeof m.lastIntel !== 'object') m.lastIntel = {};
    return ss;
  },

  _initRng() {
    const ss = this._ensureState();
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const h = hash32(seed, 'sectorSim') >>> 0;
    ss.meta.rngSeed = h;
    this.rng = mulberry32(h);
  },

  _sectorStream(sectorId, counter) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    return mulberry32(hash32(seed, sectorId, 'sectorSim', counter) >>> 0);
  },

  _rng() {
    if (!this.rng) this._initRng();
    return this.rng();
  },

  _graphFor() {
    if (!this._graph) this._graph = buildSectorGraph(SECTORS);
    return this._graph;
  },

  _ownerBySector() {
    const out = Object.create(null);
    const runtime = this.state.world && this.state.world.sectors;
    for (const sec of SECTORS) out[sec.id] = (runtime && runtime[sec.id] && runtime[sec.id].owner) || sec.factionId;
    return out;
  },

  _factionPower() {
    const out = Object.create(null);
    const factions = this.state.factions || {};
    for (const id of FACTION_IDS) out[id] = factions[id] && Number.isFinite(factions[id].power) ? factions[id].power : 10;
    return out;
  },

  _ensureField() {
    const ss = this._ensureState();
    if (!ss.field || !ss.field.nodes) {
      ss.field = createSectorField({
        graph: this._graphFor(), factionMeta: FACTION_META,
        ownerBySector: this._ownerBySector(), seed: (this.state.meta && this.state.meta.seed) || 1,
      });
      // Migration bridge: old saves stored only security/density drift. Preserve their danger as the
      // initial condition instead of silently resetting the world.
      for (const id of Object.keys(ss.sectors)) {
        const rec = ss.sectors[id];
        const base = SECTOR_BY_ID.get(id);
        const node = ss.field.nodes[id];
        if (base && node && rec && rec.drift) {
          node.danger = dangerIndex({ ...base, security: rec.drift.security, enemyDensity: rec.drift.enemyDensity });
        }
      }
    }
    return ss.field;
  },

  _sectorRec(sectorId) {
    const ss = this._ensureState();
    let rec = ss.sectors[sectorId];
    if (!rec) {
      rec = { drift: null, lastEnterSimT: this.state.simTime || 0, lastDay: 0 };
      ss.sectors[sectorId] = rec;
    }
    return rec;
  },

  // ------------------------------------------------------------------------------------------
  // Pure-kernel integration and consequence projection.
  // ------------------------------------------------------------------------------------------

  _onDayTick(p) {
    if (!this.state || !this.state.world) return;
    const ss = this._ensureState();
    const simT = Number(this.state.simTime) || 0;
    const sinceLast = Math.max(0, simT - (Number(ss.meta.lastTickSimT) || 0));
    const payloadDays = p && Number.isFinite(p.elapsed) ? p.elapsed
      : p && Number.isFinite(p.days) ? p.days : 1;
    const days = sinceLast > 1e-6 ? sinceLast / DAY_SECONDS : Math.max(0, payloadDays);
    const result = this._advanceModel(days, 'day_tick');
    ss.meta.lastTickSimT = sinceLast > 1e-6 ? simT : (Number(ss.meta.lastTickSimT) || 0) + days * DAY_SECONDS;
    this.bus.emit('sectorsim:tick', {
      days,
      sectorsTicked: SECTORS.length,
      losses: result.losses,
      dayCounter: Math.floor((ss.field && ss.field.epochDays) || 0),
      digest: ss.meta.lastDigest || 0,
    });
  },

  _advanceModel(days, source) {
    days = Math.max(0, Number(days) || 0);
    const ss = this._ensureState();
    const before = this._ensureField();
    if (!(days > 0) && ss.impulses.length === 0) return { losses: 0, alerts: 0 };

    const pending = ss.impulses.slice();
    const next = stepSectorField({
      graph: this._graphFor(),
      field: before,
      factionMeta: FACTION_META,
      ownerBySector: this._ownerBySector(),
      factionPower: this._factionPower(),
      impulses: pending,
      seed: (this.state.meta && this.state.meta.seed) || 1,
      dtDays: days,
    });

    // Commit only after the pure step succeeds. An exception never consumes queued world events.
    ss.field = next;
    if (pending.length) ss.impulses.splice(0, pending.length);
    ss.meta.modelVersion = SECTOR_FIELD_VERSION;
    ss.meta.lastDigest = sectorFieldDigest(next);
    this._projectLegacyDrift(next);

    ss.meta.marketAccumulatorDays += days;
    const marketQuanta = Math.floor((ss.meta.marketAccumulatorDays + 1e-9) / MARKET_CADENCE_DAYS);
    if (marketQuanta > 0) {
      const marketDays = marketQuanta * MARKET_CADENCE_DAYS;
      ss.meta.marketAccumulatorDays -= marketDays;
      this._emitEconomyPressure(marketDays);
    }

    let losses = 0, alerts = 0;
    ss.meta.riskAccumulatorDays += days;
    const riskDays = Math.floor((ss.meta.riskAccumulatorDays + 1e-9) / RISK_CADENCE_DAYS);
    if (riskDays > 0) {
      ss.meta.riskAccumulatorDays -= riskDays * RISK_CADENCE_DAYS;
      losses = this._rollAssetLosses(riskDays);
      this._injectConflictTension(riskDays);
      alerts = this._emitStrategicIntel(before, next, riskDays);
    }

    this.bus.emit('sectorsim:fieldAdvanced', {
      source, days, epochDays: next.epochDays, digest: ss.meta.lastDigest,
      impulseCount: pending.length, losses, alerts,
    });
    return { losses, alerts };
  },

  _projectLegacyDrift(field) {
    const currentId = this.state.world && this.state.world.currentSectorId;
    for (const sec of SECTORS) {
      if (sec.id === currentId) continue; // compatibility: current live sector is not rewritten by the offscreen overlay
      const node = field.nodes[sec.id];
      if (!node) continue;
      const rec = this._sectorRec(sec.id);
      rec.drift = projectNodeToSector(sec, node);
      rec.lastDay = Math.floor(field.epochDays || 0);
      rec.lastModelEpoch = field.epochDays || 0;
    }
  },

  _emitEconomyPressure(days) {
    const field = this._ensureField();
    for (const sec of SECTORS) {
      const node = field.nodes[sec.id];
      if (!node || !sec.stations || !sec.stations.length) continue;
      // Positive pricePressure means scarcity. Danger adds a smaller transport-loss term, so a Reach
      // spike can propagate into prices even before local stocks visibly collapse.
      const lanePressure = clamp(node.pricePressure + (node.danger - dangerIndex(sec)) * 0.18 + (node.danger - 0.45) * 0.035, -1, 1);
      if (Math.abs(lanePressure) < 0.002) continue;
      for (const station of sec.stations) {
        if (!station || !station.id) continue;
        const goods = STATION_GOODS[station.type] || DEFAULT_GOODS;
        const total = Math.round(Math.abs(lanePressure) * 72 * days);
        if (total <= 0) continue;
        const sign = lanePressure > 0 ? -1 : 1; // economy vol<0 drains stock -> price rises
        for (let i = 0; i < goods.length; i++) {
          const share = Math.max(1, Math.round(total / goods.length));
          this.bus.emit('economy:applyTradePressure', {
            stationId: station.id,
            good: goods[i],
            vol: sign * share,
            sectorId: sec.id,
            source: 'sector_field',
            pressure: lanePressure,
          });
        }
      }
    }
  },

  _rollAssetLosses(days) {
    const auto = this.registry && this.registry.get && this.registry.get('automation');
    if (!auto || typeof auto.offscreenRiskPass !== 'function') return 0;
    try {
      return auto.offscreenRiskPass(days, (sectorId) => this.effectiveDanger(sectorId)) || 0;
    } catch (err) {
      console.error('[sectorSim] offscreenRiskPass', err);
      return 0;
    }
  },

  _injectConflictTension(days) {
    const factions = this.registry && this.registry.get && this.registry.get('factions');
    if (!factions || typeof factions.addOffscreenTension !== 'function' || typeof factions.contestedSectorFor !== 'function') return;
    try {
      for (let i = 0; i < FACTION_IDS.length; i++) {
        for (let j = i + 1; j < FACTION_IDS.length; j++) {
          const a = FACTION_IDS[i], b = FACTION_IDS[j];
          const pairKey = `${a}:${b}`;
          const sectorId = factions.contestedSectorFor(pairKey);
          if (!sectorId) continue;
          const signal = this.signal(sectorId);
          if (!signal) continue;
          const ia = signal.influence[a] || 0, ib = signal.influence[b] || 0;
          const presence = clamp(ia + ib, 0, 1);
          const parity = presence > 1e-6 ? 1 - Math.abs(ia - ib) / presence : 0;
          const contest = presence * parity;
          const pa = (this.state.factions[a] && this.state.factions[a].power) || 0;
          const pb = (this.state.factions[b] && this.state.factions[b].power) || 0;
          const powerImbalance = Math.min(1, Math.abs(pa - pb) / 30);
          const tension = days * (0.20 + signal.danger * 1.55 + contest * 2.10 + powerImbalance * 0.35);
          if (tension > 0.01) factions.addOffscreenTension(pairKey, tension, 'sector_field');
        }
      }
    } catch (err) {
      console.error('[sectorSim] injectConflictTension', err);
    }
  },

  _emitStrategicIntel(before, after, days) {
    const candidates = [];
    for (const sec of SECTORS) {
      const oldNode = before && before.nodes && before.nodes[sec.id];
      const newNode = after && after.nodes && after.nodes[sec.id];
      if (!newNode) continue;
      const oldDangerBand = oldNode ? Math.floor(oldNode.danger * 5) : -1;
      const newDangerBand = Math.floor(newNode.danger * 5);
      const oldMarketBand = oldNode ? pressureBand(oldNode.pricePressure) : 0;
      const newMarketBand = pressureBand(newNode.pricePressure);
      const factionChanged = !!oldNode && oldNode.dominantFactionId !== newNode.dominantFactionId;
      if (oldDangerBand === newDangerBand && oldMarketBand === newMarketBand && !factionChanged) continue;
      const severity = Math.abs(newDangerBand - oldDangerBand) * 2
        + Math.abs(newMarketBand - oldMarketBand)
        + (factionChanged ? 3 : 0);
      candidates.push({ sectorId: sec.id, severity });
    }
    candidates.sort((a, b) => (b.severity - a.severity) || a.sectorId.localeCompare(b.sectorId));
    const emit = candidates.slice(0, MAX_INTEL_ALERTS);
    for (const item of emit) this._emitIntel(item.sectorId, 'threshold_crossing', days);
    return emit.length;
  },

  // ------------------------------------------------------------------------------------------
  // Field impulses: real outcomes become deterministic sources, then flow over the graph.
  // ------------------------------------------------------------------------------------------

  injectImpulse(raw) {
    if (!raw || !raw.sectorId || !SECTOR_BY_ID.has(raw.sectorId)) return false;
    const ss = this._ensureState();
    const impulse = {
      seq: ss.meta.nextImpulseSeq++,
      kind: String(raw.kind || 'external'),
      sectorId: raw.sectorId,
      danger: clamp(Number(raw.danger) || 0, -0.35, 0.35),
      pricePressure: clamp(Number(raw.pricePressure) || 0, -0.60, 0.60),
    };
    if (raw.influence && typeof raw.influence === 'object') {
      impulse.influence = {};
      for (const fid of FACTION_IDS) if (Number(raw.influence[fid])) impulse.influence[fid] = clamp(Number(raw.influence[fid]), -0.60, 0.60);
    } else if (raw.factionId && FACTION_BY_ID.has(raw.factionId)) {
      impulse.factionId = raw.factionId;
      impulse.influenceDelta = clamp(Number(raw.influenceDelta) || 0, -0.60, 0.60);
    }
    ss.impulses.push(impulse);
    if (ss.impulses.length > MAX_IMPULSES) ss.impulses.splice(0, ss.impulses.length - MAX_IMPULSES);
    return true;
  },

  _onTradeCompleted(p) {
    if (!p || !p.stationId) return;
    const sectorId = STATION_TO_SECTOR.get(p.stationId);
    if (!sectorId) return;
    const side = p.side === 'sell' ? -1 : 1; // player buy drains stock -> scarcity
    const magnitude = clamp(0.008 + Math.log1p(Math.abs(Number(p.total) || Number(p.qty) || 0)) / 180, 0.008, 0.10);
    this.injectImpulse({ kind: 'trade', sectorId, pricePressure: side * magnitude });
  },

  _onEntityKilled(p) {
    // The aggregate model does not replay every NPC skirmish. It records player-caused outcomes as
    // bounded field impulses, so clearing pirates or destroying infrastructure survives sector unload.
    if (!p || p.killerId !== this.state.playerId) return;
    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
    if (!sectorId) return;
    const influence = {};
    if (p.factionId && FACTION_BY_ID.has(p.factionId)) {
      influence[p.factionId] = p.type === 'station' ? -0.16 : -0.012;
    }
    if (p.type === 'station') {
      this.injectImpulse({ kind: 'infrastructure_loss', sectorId, danger: 0.11, pricePressure: 0.055, influence });
    } else if (p.factionLawful) {
      this.injectImpulse({ kind: 'lawful_kill', sectorId, danger: 0.022, pricePressure: 0.006, influence });
    } else {
      this.injectImpulse({ kind: 'hostile_kill', sectorId, danger: -0.012, influence });
    }
  },

  _onConflictFlip(p) {
    if (!p || !p.sectorId || !p.newOwner) return;
    this.injectImpulse({
      kind: 'territory_flip', sectorId: p.sectorId,
      danger: 0.08, pricePressure: 0.04,
      factionId: p.newOwner, influenceDelta: 0.34,
    });
  },

  // ------------------------------------------------------------------------------------------
  // Transit outcome contract. The formula is exported below for UI/headless forecast parity.
  // ------------------------------------------------------------------------------------------

  _onJumpStart(p) {
    const ss = this._ensureState();
    ss.meta.pendingTransit = {
      from: p && p.from,
      to: p && p.to,
      via: p && p.via || 'gate',
    };
  },

  _onJumpArrive(p) {
    const ss = this._ensureState();
    const pending = ss.meta.pendingTransit || {};
    const to = (p && p.sectorId) || pending.to;
    if (!to) return;
    const via = pending.via || 'gate';
    const forecast = forecastTransitFor(this.state, to, { fromSectorId: pending.from, via });
    const counter = ss.meta.transitCounter++;
    const stream = this._sectorStream(`transit:${pending.from || '?'}>${to}:${via}`, counter);
    const incident = stream() < forecast.incidentChance;
    let damage = 0;
    if (incident && forecast.expectedDamage > 0) {
      damage = Math.max(1, Math.round(forecast.expectedDamage * (0.78 + stream() * 0.44)));
      const player = resolvePlayerEntity(this.state);
      if (player) {
        this.bus.emit('projectile:hit', {
          targetId: player.id,
          ownerId: null,
          damage,
          damageType: 'transit_hazard',
          pos: p && p.toPos ? p.toPos : { x: player.pos && player.pos.x || 0, z: player.pos && player.pos.z || 0 },
        });
      }
      this.injectImpulse({ kind: 'transit_incident', sectorId: to, danger: 0.018, pricePressure: 0.012 });
    }
    ss.meta.pendingTransit = null;
    this.bus.emit('sectorsim:transitOutcome', { sectorId: to, via, incident, damage, forecast });
  },

  // ------------------------------------------------------------------------------------------
  // View boundary/reconciliation, offline catch-up, save/load.
  // ------------------------------------------------------------------------------------------

  _onSectorExit(p) {
    const id = p && p.sectorId;
    if (!id) return;
    this._sectorRec(id).lastEnterSimT = this.state.simTime || 0;
    this._ensureState().meta.lastWallT = Date.now();
  },

  _onSectorEnter(p) {
    const id = p && p.sectorId;
    if (!id) return;
    const rec = this._sectorRec(id);
    const elapsed = Math.max(0, (this.state.simTime || 0) - (rec.lastEnterSimT || 0));
    rec.lastEnterSimT = this.state.simTime || 0;
    if (elapsed > DAY_SECONDS) this.bus.emit('sectorsim:reconcile', { sectorId: id, elapsedSimT: elapsed, signal: this.signal(id) });
    this._emitIntel(id, 'sector_entry', elapsed / DAY_SECONDS);
    this._refreshDiagnostics();
  },

  _seedCurrentSector() {
    const id = this.state.world && this.state.world.currentSectorId;
    if (id) this._sectorRec(id).lastEnterSimT = this.state.simTime || 0;
  },

  runOfflineCatchup() {
    const ss = this._ensureState();
    const now = Date.now();
    const last = ss.meta.lastWallT || 0;
    if (!last) { ss.meta.lastWallT = now; return; }
    const elapsed = clamp((now - last) / 1000, 0, OFFLINE_CAP_SEC);
    ss.meta.lastWallT = now;
    if (elapsed < DAY_SECONDS) return;
    const days = Math.max(1, Math.floor((elapsed * OFFLINE_EFF) / DAY_SECONDS));
    const result = this._advanceModel(days, 'offline');
    this.bus.emit('sectorsim:offlineSummary', { elapsedSec: Math.round(elapsed), days, losses: result.losses });
    this.bus.emit('toast', {
      text: `While away (${(elapsed / 3600).toFixed(1)}h): sector field advanced ${days} days`,
      kind: 'info', ttl: 6,
    });
  },

  newGame() {
    this.state.sectorSim = {
      sectors: {},
      impulses: [],
      field: null,
      meta: {
        rngSeed: 0, lastTickSimT: this.state.simTime || 0, lastWallT: Date.now(), lossLog: [],
        nextImpulseSeq: 1, transitCounter: 0, marketAccumulatorDays: 0,
        riskAccumulatorDays: 0, modelVersion: SECTOR_FIELD_VERSION, lastIntel: {},
      },
    };
    this._initRng();
    this._ensureField();
  },

  serialize() {
    const ss = this._ensureState();
    return {
      sectors: clonePlain(ss.sectors),
      field: clonePlain(this._ensureField()),
      impulses: clonePlain(ss.impulses.slice(-MAX_IMPULSES)),
      meta: {
        rngSeed: ss.meta.rngSeed || 0,
        lastTickSimT: ss.meta.lastTickSimT || 0,
        lastWallT: Date.now(),
        lossLog: (ss.meta.lossLog || []).slice(-50),
        nextImpulseSeq: ss.meta.nextImpulseSeq || 1,
        transitCounter: ss.meta.transitCounter || 0,
        marketAccumulatorDays: ss.meta.marketAccumulatorDays || 0,
        riskAccumulatorDays: ss.meta.riskAccumulatorDays || 0,
        modelVersion: SECTOR_FIELD_VERSION,
        lastDigest: ss.meta.lastDigest || 0,
        lastIntel: clonePlain(ss.meta.lastIntel || {}),
      },
    };
  },

  deserialize(data) {
    const ss = this._ensureState();
    ss.sectors = data && data.sectors || {};
    ss.field = data && data.field || null;
    ss.impulses = data && Array.isArray(data.impulses) ? data.impulses.slice(-MAX_IMPULSES) : [];
    const m = data && data.meta || {};
    ss.meta = {
      rngSeed: m.rngSeed || 0,
      lastTickSimT: m.lastTickSimT || 0,
      lastWallT: m.lastWallT || 0,
      lossLog: m.lossLog || [],
      nextImpulseSeq: m.nextImpulseSeq || 1,
      transitCounter: m.transitCounter || 0,
      marketAccumulatorDays: m.marketAccumulatorDays || 0,
      riskAccumulatorDays: m.riskAccumulatorDays || 0,
      modelVersion: m.modelVersion || SECTOR_FIELD_VERSION,
      lastDigest: m.lastDigest || 0,
      lastIntel: m.lastIntel || {},
      pendingTransit: null,
    };
    this._initRng();
  },

  // ------------------------------------------------------------------------------------------
  // Read/diagnostic contract.
  // ------------------------------------------------------------------------------------------

  effectiveSector(sectorId) { return effectiveSectorFor(this.state, sectorId); },
  effectiveDanger(sectorId) { return effectiveDangerFor(this.state, sectorId); },
  signal(sectorId) { return sectorSignalFor(this.state, sectorId); },
  transitForecast(sectorId, opts) { return forecastTransitFor(this.state, sectorId, opts); },

  _emitIntel(sectorId, reason, elapsedDays) {
    const signal = this.signal(sectorId);
    const base = SECTOR_BY_ID.get(sectorId);
    if (!signal || !base) return;
    this.bus.emit('sectorsim:intel', {
      reason,
      elapsedDays: Math.max(0, Number(elapsedDays) || 0),
      sectorId,
      sectorName: base.name,
      signal,
      transit: forecastTransitFor(this.state, sectorId, { via: 'drive' }),
    });
  },

  _installDiagnostics() {
    if (typeof window === 'undefined') return;
    window.__SF_SECTORSIM__ = {
      perSector: {}, _sys: this,
      getReport() { return this._sys._buildReport(); },
      inject(p) { return this._sys.injectImpulse(p); },
    };
  },

  _buildReport() {
    const perSector = {};
    for (const sec of SECTORS) {
      const signal = this.signal(sec.id);
      const eff = this.effectiveSector(sec.id);
      const rec = this.state.sectorSim.sectors[sec.id];
      perSector[sec.id] = {
        name: sec.name,
        security: eff ? eff.security : sec.security,
        enemyDensity: eff ? eff.enemyDensity : sec.enemyDensity || 0,
        ...signal,
        lastEnterSimT: rec && rec.lastEnterSimT || 0,
      };
    }
    return {
      perSector,
      simTime: this.state.simTime || 0,
      epochDays: this.state.sectorSim.field && this.state.sectorSim.field.epochDays || 0,
      rngSeed: this.state.sectorSim.meta.rngSeed || 0,
      digest: this.state.sectorSim.meta.lastDigest || 0,
    };
  },

  _refreshDiagnostics() {
    if (typeof window === 'undefined' || !window.__SF_SECTORSIM__) return;
    const report = this._buildReport();
    window.__SF_SECTORSIM__.perSector = report.perSector;
    window.__SF_SECTORSIM__.rngSeed = report.rngSeed;
    window.__SF_SECTORSIM__.digest = report.digest;
  },

  _guard(label, fn) {
    try { return fn(); }
    catch (err) { console.error(`[sectorSim] ${label}`, err); return undefined; }
  },
};

export default sectorSim;

/**
 * Read-only projection consumed by world.js. The field is authoritative; legacy `drift` is only the
 * save/back-compat mirror. Returning a new object keeps authored data immutable.
 */
export function effectiveSectorFor(state, sectorId) {
  const base = SECTOR_BY_ID.get(sectorId);
  if (!base) return null;
  const fieldNode = state && state.sectorSim && state.sectorSim.field
    && state.sectorSim.field.nodes && state.sectorSim.field.nodes[sectorId];
  if (fieldNode) return { ...base, ...projectNodeToSector(base, fieldNode) };
  const rec = state && state.sectorSim && state.sectorSim.sectors && state.sectorSim.sectors[sectorId];
  return rec && rec.drift ? { ...base, security: rec.drift.security, enemyDensity: rec.drift.enemyDensity } : base;
}

export function effectiveDangerFor(state, sectorId) {
  const node = state && state.sectorSim && state.sectorSim.field
    && state.sectorSim.field.nodes && state.sectorSim.field.nodes[sectorId];
  if (node && Number.isFinite(node.danger)) return clamp(node.danger, 0, 1);
  const sector = effectiveSectorFor(state, sectorId);
  return sector ? dangerIndex(sector) : 0;
}

export function effectiveDangerTierFor(state, sectorId) {
  const sector = effectiveSectorFor(state, sectorId);
  return sector ? dangerTier(sector) : 0;
}

/** Stable legibility contract: every modeled quantity and its causal/trend metadata in one packet. */
export function sectorSignalFor(state, sectorId) {
  const base = SECTOR_BY_ID.get(sectorId);
  if (!base) return null;
  const field = state && state.sectorSim && state.sectorSim.field;
  const read = readSectorField(field, sectorId);
  const runtimeOwner = state && state.world && state.world.sectors && state.world.sectors[sectorId]
    && state.world.sectors[sectorId].owner;
  const ownerId = runtimeOwner || base.factionId || null;
  if (!read) {
    return {
      sectorId, ownerId,
      danger: dangerIndex(base),
      pricePressure: 0,
      influence: ownerId ? { [ownerId]: 1 } : {},
      dominantFactionId: ownerId,
      dominantInfluence: ownerId ? 1 : 0,
      contestMargin: ownerId ? 1 : 0,
      trend: { danger: 0, pricePressure: 0, influence: 0 },
      driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
      encounterLoad: 0.65 + 1.35 * dangerIndex(base),
      marketFlowUnitsPerDay: 0,
    };
  }
  const lanePressure = clamp(read.pricePressure + (read.danger - dangerIndex(base)) * 0.18 + (read.danger - 0.45) * 0.035, -1, 1);
  return {
    sectorId, ownerId,
    ...read,
    encounterLoad: 0.65 + 1.35 * read.danger,
    marketFlowUnitsPerDay: -Math.round(lanePressure * 72),
  };
}

/**
 * Pure forecast shared by the UI and the actual jump-arrival resolver. A faster ship spends less time
 * exposed; a thicker shield/armor/hull stack has a larger survival margin. No hidden UI-only math.
 */
export function forecastTransitFor(state, sectorId, opts = {}) {
  const via = opts.via === 'drive' ? 'drive' : 'gate';
  const destination = sectorSignalFor(state, sectorId);
  const source = opts.fromSectorId ? sectorSignalFor(state, opts.fromSectorId) : null;
  const danger = clamp(Math.max(destination ? destination.danger : 0, source ? source.danger * 0.72 : 0), 0, 1);
  const player = resolvePlayerEntity(state);
  const maxSpeed = Math.max(0, Number(player && player.maxSpeed) || Number(state && state.player && state.player.maxSpeed) || 100);
  const threatSpeed = 78 + danger * 122;
  const speedRatio = maxSpeed / Math.max(1, threatSpeed);
  const speedMitigation = clamp((speedRatio - 0.42) * 0.58, 0, 0.72);
  const routeFactor = via === 'drive' ? 1 : 0.30;
  const incidentChance = clamp((danger - 0.10) * 1.08 * routeFactor * (1 - speedMitigation), 0, 0.92);
  const expectedDamage = Math.max(0, Math.round((16 + danger * 92) * routeFactor * (1 - speedMitigation * 0.55)));
  const effectiveHp = Math.max(0,
    (Number(player && player.shield) || 0)
    + (Number(player && player.armorHp) || 0)
    + (Number(player && player.hull) || 0));
  return {
    sectorId, via, danger, maxSpeed, threatSpeed,
    speedMitigation, incidentChance, expectedDamage,
    effectiveHp, survivalMargin: effectiveHp - expectedDamage,
  };
}

function projectNodeToSector(base, node) {
  const desiredDanger = clamp(Number(node.danger) || dangerIndex(base), 0, 1);
  const invert = 1 - (desiredDanger - 0.05 - 0.22 * (base.tier || 0)) / 0.25;
  // Blend the exact inverse with baseline-relative drift. The inverse preserves danger semantics in
  // low tiers; the delta term stays useful where high-tier dangerIndex is structurally saturated.
  const delta = desiredDanger - dangerIndex(base);
  const security = clamp(Number.isFinite(invert) ? invert : (base.security - delta * 0.70), SECURITY_MIN, SECURITY_MAX);
  const density = clamp((base.enemyDensity || 0) + delta * 0.82 + Math.max(0, node.pricePressure || 0) * 0.05, DENSITY_MIN, DENSITY_MAX);
  return { security, enemyDensity: density };
}

function resolvePlayerEntity(state) {
  if (!state) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(state.playerId) || null;
  if (Array.isArray(state.entityList)) return state.entityList.find((e) => e && e.id === state.playerId) || null;
  return null;
}

function pressureBand(v) { return v > 0.18 ? 1 : v < -0.18 ? -1 : 0; }

function clonePlain(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clonePlain(value[key]);
  return out;
}
