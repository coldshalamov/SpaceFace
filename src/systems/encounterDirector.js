// src/systems/encounterDirector.js — the LIVING-UNIVERSE CAMPAIGN DIRECTOR.
//
// Deterministically plans a weighted schedule of encounter shapes per sector-day (two decks:
// COMBAT pressure and CIVILIAN world-life), anchored to the NAMED zones in sectorZones.js, then
// paces their firing through a pressure/pacing gate so the world breathes: majors rare, minors
// paced, quiet after spending, never during docking or protected tutorial beats, never within
// 30 s of the last meaningful encounter, never two combat shapes at once.
//
// Layers (each independently testable):
//   1. PLANNER (pure, exported): planEncounters(seed, sectorId, dayIndex, zones) — everything
//      derives from mulberry32(hash32(seed, sectorId, dayIndex)); same inputs → same schedule.
//   2. PACING GATE (1 Hz): accrues per-deck pressure from deterministic state (zone threat,
//      sector security, cargo value, WANTED heat, mining noise, standing bounty) and releases
//      due schedule items only when pressure, spacing caps, gates, and zone proximity allow.
//      Spending pressure IS the pacing valve — a fired encounter buys quiet time after it.
//   3. PHASE SCRIPTS (encounterScripts.js): telegraph → offer/choice → conflict/resolution →
//      outcome → receipt. Choices arrive via the bus (`encounter:choose`) or PHYSICAL verbs
//      (brake to pay, fly off to run, open fire to refuse); timeout defaults are deterministic.
//
// Ownership (§0.6): owns state.encounterDirector ONLY. Every consequence is an intent:
//   credits → economy:chargeCredits/grantCredits · rep → faction:repDelta · contraband justice →
//   patrol:proximity → economy.runScan (fines/confiscation/rep/heat, the real machinery) ·
//   bribes → contraband:bribe · markets → economy:applyTradePressure (bounded) · sector danger →
//   sectorsim:impulse · rescues → distress:rescued · leads → mission:offered (via salvage) ·
//   cargo jettison → cargo.removeCargo (the cargo owner's exported writer).
// It NEVER writes credits/rep/cargo/heat/sector-ownership directly, and it never makes lawful
// patrols attack a clean player — the ai.lawful → isPlayerWanted gate is the architecture.
//
// Determinism (§0.5): no Math.random, no wall clock. Schedules from seeded streams; runtime
// timers from state.simTime; per-encounter rolls from hash32(seed, encounterId, label).
// Save/load: only the DURABLE subset persists (named captains, receipts, cooldowns, stats);
// live entity references are never saved — save:loaded rebuilds transients and keeps the rest.
//
// Additive + guarded: no zones → nothing schedules; missing helpers → shapes no-op cleanly.
// factionId is READABILITY only; hostility is team/passive/lawful/context (scanner + aiPorts).

import { hash32, mulberry32 } from '../core/rng.js';
import { zonesForSector, zoneAt, zoneThreat } from '../data/sectorZones.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../data/sectorCoordinates.js';
import { makeEnemySpawnSpec } from './combat.js';
import { ENCOUNTERS, NAMED_CAPTAINS, barkText, receiptText } from '../data/encounters.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { ENCOUNTER_SCRIPTS } from './encounterScripts.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { removeCargo } from './cargo.js';
import { activityForEncounterSpawn, roeForActivity, setEntityDoctrine } from '../ai/doctrine.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));

// ── schedule budget (per sector-day) ─────────────────────────────────────────────────────────────
const MAX_MAJOR_PER_DAY = 1;
const MAX_MINOR_PER_DAY = 2;
const MAX_AMBIENT_PER_DAY = 3;
const RARE_GATE = 0.75;            // 'rare' shapes need an extra seeded roll to clear this
const DAY_SECONDS = 600;           // core time contract (10 sim-min day)

// ── pacing law (spec2/04 + brief; these numbers ARE the design) ──────────────────────────────────
const MIN_GAP_S = 30;              // between meaningful (major/minor) encounter starts
const MAJOR_EXTRA_GAP_S = 240;     // additional spacing between majors
const AMBIENT_GAP_S = 15;          // between ambient starts
const AMBIENT_AFTER_MEANINGFUL_S = 8; // don't talk over a fresh encounter's opening
const WINDOW_S = 600;              // rolling window for the 1-major/2-minor caps
const DEFER_S = 21;                // re-check period for a due-but-ineligible item
const MAX_GATE_DEFERS = 60;        // a gated item that never becomes eligible eventually drops
const POOL_MAX = 140;              // pressure pool cap per deck
const ENTRY_GRACE_COMBAT = 22;     // pressure seeded on sector entry (first beats land ~40-90s in)
const ENTRY_GRACE_CIVIL = 30;
const RECEIPT_CAP = 12;            // receipts ring buffer length (saved)
const BARK_MIN_GAP_S = 4;          // per-encounter bark spacing (danger 'alert' exempt)
const NOISE_DECAY_PER_S = 0.02;    // mining-noise half-life ~35s
const PROX_SLACK = 600;            // "on the zone" slack for proximity-gated shapes

const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
const LEGALITY_FINE_MULT = { restricted: 0.8, illegal: 1.2, contraband: 1.5 };
const CIVIL_ZONE_TYPES = new Set(['civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint', 'refinery_approach', 'colony']);

export const encounterDirector = {
  name: 'encounterDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureDirectorState(this.state);

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
      this.bus.on('day:tick', () => this._planSector(this._currentSectorId()));
      this.bus.on('sector:exit', (p) => this._onSectorExit(p));
      // Durable-merge on load: keep named captains / receipts / cooldowns, rebuild transients.
      this.bus.on('save:loaded', () => this._onSaveLoaded());
      // Budget bookkeeping + script event routing.
      this.bus.on('entity:destroyed', (p) => this._onEntityGone(p));
      this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
      this.bus.on('combat:damage', (p) => this._onCombatDamage(p));
      this.bus.on('contraband:scanned', (p) => this._routeToScript('patrolScan', 'contrabandScanned', p));
      this.bus.on('scan:pulse', (p) => this._routeToScript('distress', 'scanPulse', p));
      this.bus.on('salvage:communicatorFound', (p) => this._routeToScript('salvageSignal', 'communicatorFound', p));
      // The deterministic choice bridge (UI/test harness both speak this).
      this.bus.on('encounter:choose', (p) => this._onChoose(p));
      // Mining noise attracts predators (decaying accumulator; player yields only).
      this.bus.on('mining:yield', (p) => this._onMiningYield(p));
    }
  },

  newGame() {
    this.state.encounterDirector = freshState();
    ensureNamed(this.state.encounterDirector);
  },

  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const dir = ensureDirectorState(state);
    dir._accum = (dir._accum || 0) + dt;
    if (dir._accum < 1) return;                        // director runs at 1 Hz — no per-frame work
    const step = dir._accum;
    dir._accum = 0;
    const now = state.simTime || 0;
    this._accrue(dir, state, step);
    if (!isDocked(state) && !isTutorialActive(state)) this._pump(dir, state, now);
    this._tickLive(dir, state, now);
  },

  // ═══ SCHEDULING ═══════════════════════════════════════════════════════════════════════════════

  _onSectorEnter(p) {
    // Continuous free-flight membership is a soft handoff (M2-C1). Soft exit preserves
    // live/pending/pressure/active; continuous enter must NOT reseed grace pressure, clear the
    // pacing window, or replan (which wipes pending for a new sector-day key). Intentional
    // jump / load / boot enters still get the entry breath and planner.
    if (p && (p.continuous || p.noTeleport)) return;

    const sectorId = p && typeof p === 'object' ? p.sectorId : p;
    const state = this.state;
    const dir = ensureDirectorState(state);
    const now = state.simTime || 0;
    const sec = sectorSecurityOf(state);
    dir.pressure.combat = Math.min(POOL_MAX, ENTRY_GRACE_COMBAT + (1 - sec) * 25);
    dir.pressure.civilian = Math.min(POOL_MAX, ENTRY_GRACE_CIVIL + sec * 20);
    dir.window = [];
    dir.lastMeaningfulAt = now;                        // sector entry breathes ≥30 s before beats
    dir.lastAmbientAt = now - AMBIENT_GAP_S;
    this._planSector(sectorId);
  },

  _onSectorExit(p) {
    // Continuous free-flight membership is a soft handoff — preserve live encounters, pending
    // beats, and active spawn ledger so fights can cross Voronoi edges (M2-C1). Hard teardown
    // only for intentional jump / load / non-continuous boundaries.
    if (p && (p.continuous || p.noTeleport)) return;

    const dir = ensureDirectorState(this.state);
    // Live encounters in the sector we left resolve as abandoned (named grudges still book).
    for (const id of Object.keys(dir.live)) {
      const live = dir.live[id];
      if (live.script === 'namedHunter' && ENCOUNTER_SCRIPTS.namedHunter) {
        ENCOUNTER_SCRIPTS.namedHunter._depart(this, live, !!(live.data && live.data.engaged));
      } else {
        this.abort(live, 'sector_exit');
      }
    }
    dir.live = {};
    dir.pending = [];
    dir.active = {};                                   // spawnBudget hard-resets on non-continuous exit
    dir.plannedKey = null;                             // same-day re-entry must replan
  },

  _onSaveLoaded() {
    const state = this.state;
    const prev = state.encounterDirector;
    const fresh = freshState();
    if (prev && typeof prev === 'object') {
      if (prev.named && typeof prev.named === 'object' && !Array.isArray(prev.named)) fresh.named = prev.named;
      if (Array.isArray(prev.receipts)) fresh.receipts = prev.receipts.slice(-RECEIPT_CAP);
      if (prev.cooldowns && typeof prev.cooldowns === 'object') fresh.cooldowns = prev.cooldowns;
      if (prev.stats && typeof prev.stats === 'object') fresh.stats = { ...fresh.stats, ...prev.stats };
    }
    state.encounterDirector = fresh;
    ensureNamed(fresh);
    // Absolute cooldown stamps from another timeline are clamped into sane range.
    const now = state.simTime || 0;
    for (const k of Object.keys(fresh.cooldowns)) {
      const shape = ENCOUNTERS[k];
      const maxCd = now + (shape && shape.cooldownS ? shape.cooldownS : 900);
      if (!(fresh.cooldowns[k] <= maxCd)) fresh.cooldowns[k] = maxCd;
    }
  },

  // Build the deterministic schedule for a sector-day. Pure aside from writing dir.pending.
  _planSector(sectorId) {
    const state = this.state;
    const dir = ensureDirectorState(state);
    if (!sectorId) return;
    const dayIndex = Math.floor((state.simTime || 0) / DAY_SECONDS);
    const key = `${sectorId}#${dayIndex}`;
    if (dir.plannedKey === key) return;
    dir.plannedKey = key;
    dir.pending = [];                                  // stale items from other sector-days drop

    const zones = zonesForSector(sectorId);
    if (!zones.length) return;                         // no zones → schedule nothing (additive)

    const schedule = planEncounters(state.meta && state.meta.seed, sectorId, dayIndex, zones);
    const now = state.simTime || 0;
    for (const s of schedule) {
      dir.pending.push({ ...s, sectorId, dueAt: now + s.delay, defers: 0 });
    }
    dir.lastPlanned = { sectorId, dayIndex, count: schedule.length };
  },

  // ═══ PRESSURE (deterministic accrual from existing state only) ════════════════════════════════

  // TODO(career-tags, stretch): derive miner/hauler/hunter/smuggler/salvager/explorer tags from the
  // same deterministic inputs below and use them ONLY to bias planner weights (never lock content).
  // Deferred: the raw inputs (mining noise, cargo value, heat, bounty) already bias pressure; tag
  // plumbing must not perturb planner determinism without a corresponding check extension.
  _accrue(dir, state, step) {
    dir.noise.mining = Math.max(0, dir.noise.mining * (1 - NOISE_DECAY_PER_S * step));
    const p = this.player();
    const sectorId = this._currentSectorId();
    if (!p || !sectorId) return;
    const local = globalToSectorLocalForSector(p.pos, sectorId);
    const zone = zoneAt(sectorId, local.x, local.z);
    const zt = zoneThreat(zone);
    const sec = sectorSecurityOf(state);
    const cargoBand = Math.min(1, this.cargoValue() / 2000);
    const wanted = isWanted(state);
    const combatRate =
      0.25 + 0.22 * zt + (1 - sec) * 0.5 + cargoBand * 0.35 +
      (wanted ? 0.6 : 0) + Math.min(1, dir.noise.mining) * 0.5 +
      (((state.player && state.player.bounty) | 0) > 0 ? 0.25 : 0);
    const civilRate =
      0.35 + sec * 0.45 + (zone && CIVIL_ZONE_TYPES.has(zone.type) ? 0.35 : 0);
    dir.pressure.combat = Math.min(POOL_MAX, dir.pressure.combat + combatRate * step);
    dir.pressure.civilian = Math.min(POOL_MAX, dir.pressure.civilian + civilRate * step);
  },

  // ═══ THE PACING GATE (fires at most one due item per 1 Hz beat) ═══════════════════════════════

  _pump(dir, state, now) {
    if (!dir.pending.length) return;
    while (dir.window.length && dir.window[0].t < now - WINDOW_S) dir.window.shift();

    let dueIdx = -1;
    let dueBest = Infinity;
    for (let i = 0; i < dir.pending.length; i++) {
      const it = dir.pending[i];
      if (it.dueAt <= now && it.dueAt < dueBest) { dueBest = it.dueAt; dueIdx = i; }
    }
    if (dueIdx < 0) return;
    const item = dir.pending[dueIdx];
    const shape = ENCOUNTERS[item.shapeId];
    if (!shape || !ENCOUNTER_SCRIPTS[shape.script]) { dir.pending.splice(dueIdx, 1); return; }

    const defer = () => { item.dueAt = now + DEFER_S; };
    const gateDefer = () => {
      item.defers = (item.defers | 0) + 1;
      if (item.defers > MAX_GATE_DEFERS) { dir.pending.splice(dueIdx, 1); dir.stats.fizzled++; return; }
      defer();
    };

    if (now < (dir.cooldowns[shape.id] || 0)) return defer();
    if (dir.pressure[shape.deck] < shape.pressureCost) return defer();

    // Spacing + concurrency law.
    const liveList = Object.values(dir.live);
    const liveCombat = liveList.some((l) => l.deck === 'combat');
    const liveMeaningful = liveList.filter((l) => l.tier !== 'ambient').length;
    const liveAmbient = liveList.length - liveMeaningful;
    if (shape.tier === 'ambient') {
      if (liveAmbient >= 2) return defer();
      if (now - dir.lastAmbientAt < AMBIENT_GAP_S) return defer();
      if (now - dir.lastMeaningfulAt < AMBIENT_AFTER_MEANINGFUL_S) return defer();
    } else {
      if (now - dir.lastMeaningfulAt < MIN_GAP_S) return defer();
      if (shape.deck === 'combat' && liveCombat) return defer();          // never two combat shapes
      if (liveMeaningful >= 2) return defer();
      const majors = dir.window.filter((w) => w.tier === 'major').length;
      const minors = dir.window.filter((w) => w.tier === 'minor').length;
      if (shape.tier === 'major' && (majors >= MAX_MAJOR_PER_DAY || now - dir.lastMajorAt < MAJOR_EXTRA_GAP_S)) return defer();
      if (shape.tier === 'minor' && minors >= MAX_MINOR_PER_DAY) return defer();
    }

    if (!this._gatesPass(shape, state)) return gateDefer();
    if (shape.proximity && !this._playerNearItemZone(item)) return gateDefer();

    dir.pending.splice(dueIdx, 1);
    this._fire(dir, state, item, shape, now);
  },

  _gatesPass(shape, state) {
    const g = shape.gates || {};
    if (g.minCargoValue && this.cargoValue() < g.minCargoValue) return false;
    if (g.bountyOnly && (((state.player && state.player.bounty) | 0) <= 0)) return false;
    if (g.claimsOnly) {
      const sectorId = this._currentSectorId();
      const bodies = (state.claims && state.claims.bodies) || [];
      if (!bodies.some((b) => b && b.sectorId === sectorId)) return false;
    }
    if (g.namedPool) {
      const named = ensureDirectorState(state).named;
      if (!NAMED_CAPTAINS.some((c) => { const n = named[c.id]; return !n || n.alive !== false; })) return false;
    }
    return true;
  },

  _playerNearItemZone(item) {
    const p = this.player();
    if (!p || !item.zoneCenter) return false;
    const r = (item.zoneRadius || 400) + PROX_SLACK;
    const dx = p.pos.x - item.zoneCenter.x, dz = p.pos.z - item.zoneCenter.z;
    return dx * dx + dz * dz <= r * r;
  },

  _fire(dir, state, item, shape, now) {
    dir.pressure[shape.deck] = Math.max(0, dir.pressure[shape.deck] - shape.pressureCost);
    dir.window.push({ t: now, tier: shape.tier });
    if (shape.tier === 'ambient') dir.lastAmbientAt = now;
    else dir.lastMeaningfulAt = now;
    if (shape.tier === 'major') dir.lastMajorAt = now;

    const live = {
      id: item.encounterId,
      shapeId: shape.id,
      script: shape.script,
      shape,
      plan: item,
      tier: shape.tier,
      deck: shape.deck,
      sectorId: item.sectorId,
      zoneId: item.zoneId,
      zoneName: item.zoneName,
      factionId: item.factionId || shape.factionId || null,
      squadId: item.squadId,
      anchor: item.zoneCenter ? { x: item.zoneCenter.x, z: item.zoneCenter.z } : null,
      zoneRadius: item.zoneRadius || 400,
      phase: 'telegraph',
      startedAt: now,
      deadlineAt: 0,
      ids: [],
      roles: {},
      vars: {},
      data: {},
      outcome: null,
      primarySaid: false,
      lastBarkAt: -1e9,
    };
    dir.live[live.id] = live;
    dir.stats.fired++;
    this.emit('encounter:telegraph', {
      encounterId: live.id, kind: live.shapeId, tier: live.tier, deck: live.deck,
      sectorId: live.sectorId, zoneId: live.zoneId, zoneName: live.zoneName,
      pos: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : null,
    });
    const script = ENCOUNTER_SCRIPTS[live.script];
    try {
      script.fire(this, live, state);
    } catch (err) {
      this.abort(live, 'script_error');
      if (typeof console !== 'undefined' && console.warn) console.warn('[encounterDirector] fire failed', live.shapeId, err);
      return;
    }
    if (dir.live[live.id] && live.ids.length) {
      this.emit('encounter:spawned', {
        encounterId: live.id, kind: live.shapeId, squadId: live.squadId,
        sectorId: live.sectorId, zoneId: live.zoneId, count: live.ids.length,
      });
    }
  },

  _tickLive(dir, state, now) {
    const keys = Object.keys(dir.live);
    for (const id of keys) {
      const live = dir.live[id];
      if (!live || live.phase === 'done') continue;
      const script = ENCOUNTER_SCRIPTS[live.script];
      if (!script || typeof script.tick !== 'function') continue;
      try {
        script.tick(this, live, state, now);
      } catch (err) {
        this.abort(live, 'script_error');
        if (typeof console !== 'undefined' && console.warn) console.warn('[encounterDirector] tick failed', live.shapeId, err);
      }
    }
  },

  // ═══ SCRIPT FACADE (the `d` handed to encounterScripts) ═══════════════════════════════════════

  now() { return this.state.simTime || 0; },
  player() {
    const s = this.state;
    return (s.entities && s.entities.get(s.playerId)) || null;
  },
  emit(name, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(name, payload);
  },
  stream(live, label) {
    const seed = this.state.meta && this.state.meta.seed;
    return mulberry32(hash32(seed == null ? 0 : seed, live.id, label));
  },
  namedState() { return ensureDirectorState(this.state).named; },
  sectorSecurity() { return sectorSecurityOf(this.state); },
  cargoValue() {
    const items = this.state.player && this.state.player.cargo && this.state.player.cargo.items;
    if (!items) return 0;
    let v = 0;
    for (const id in items) { const def = CMDTY.get(id); if (def) v += (items[id] | 0) * (def.basePrice || 0); }
    return v;
  },
  hasContraband() {
    const items = this.state.player && this.state.player.cargo && this.state.player.cargo.items;
    if (!items) return false;
    for (const id in items) {
      const def = CMDTY.get(id);
      if (def && def.legality && def.legality !== 'legal' && (items[id] | 0) > 0) return true;
    }
    return false;
  },
  fineEstimate() {
    const items = this.state.player && this.state.player.cargo && this.state.player.cargo.items;
    if (!items) return 0;
    let fine = 0;
    for (const id in items) {
      const def = CMDTY.get(id);
      if (!def || !def.legality || def.legality === 'legal') continue;
      const mult = LEGALITY_FINE_MULT[def.legality] != null ? LEGALITY_FINE_MULT[def.legality] : (def.fineMult || 1);
      fine += (def.basePrice || 0) * (items[id] | 0) * mult;
    }
    return Math.round(fine);
  },
  dumpContraband() {
    const state = this.state;
    const items = state.player && state.player.cargo && state.player.cargo.items;
    if (!items) return 0;
    let dumped = 0;
    const ids = Object.keys(items);
    for (const id of ids) {
      const def = CMDTY.get(id);
      if (!def || !def.legality || def.legality === 'legal') continue;
      dumped += removeCargo(state, id, items[id] | 0) | 0;   // cargo's own exported writer (§0.6)
    }
    return dumped;
  },
  stationsInSector() {
    const active = this.state.world && this.state.world.activeSector;
    const out = [];
    for (const s of (active && active.stations) || []) {
      if (!s) continue;
      const pos = s.pos || (Number.isFinite(s.x) ? { x: s.x, z: s.z } : null);
      const id = s.id != null ? s.id : s.stationId;
      if (id != null && pos) out.push({ id, pos: { x: pos.x, z: pos.z }, name: s.name || null });
    }
    return out;
  },

  // ── spawning ────────────────────────────────────────────────────────────────────────────────
  spawnShips(live, ships) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || !ships || !ships.length) return [];
    const budget = this.helpers && this.helpers.spawnBudget;
    let grant = ships.length;
    if (budget && typeof budget.request === 'function') {
      grant = budget.request(ships.length, live.squadId);
      if (grant <= 0) return [];
    }
    const dir = ensureDirectorState(this.state);
    const rec = dir.active[live.squadId] || (dir.active[live.squadId] = { ids: [], sectorId: live.sectorId });
    const spawned = [];
    for (let i = 0; i < ships.length && spawned.length < grant; i++) {
      const sh = ships[i];
      const spec = makeEnemySpawnSpec(sh.archetype, sh.level, sh.pos, { factionId: sh.factionId });
      if (sh.team != null) spec.team = sh.team;
      if (sh.hullFrac != null) spec.hull = Math.max(1, Math.round(spec.hullMax * sh.hullFrac));
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      const ai = spec.data.ai;
      ai.squadId = live.squadId;
      ai.doctrine = sh.doctrine || ai.doctrine;
      if (sh.combatDoctrineId) ai.combatDoctrineId = sh.combatDoctrineId;
      if (sh.formation) ai.formation = sh.formation;
      ai.spawnContext = sh.context;
      ai.sectorId = live.sectorId;
      ai.zoneId = live.zoneId;
      ai.zoneName = live.zoneName;
      ai.encounterId = live.id;
      ai.encounterKind = live.shapeId;
      if (sh.role) ai.encounterRole = sh.role;
      if (sh.passive) ai.passive = true;
      ai.activity = activityForEncounterSpawn(live, sh, { now: this.now() });
      ai.roe = roeForActivity(ai.activity, sh.roe);
      if (sh.bossName) { ai.name = sh.bossName; spec.data.encounterBoss = true; }
      if (sh.bountyCr != null) spec.data.bountyCr = sh.bountyCr;
      if (sh.scanLabel) spec.data.scanLabel = sh.scanLabel;
      const ent = spawnEntity(spec);
      if (ent && ent.id != null) {
        spawned.push(ent.id);
        rec.ids.push(ent.id);
        live.ids.push(ent.id);
        live.roles[ent.id] = sh.role || 'squad';
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawned.length < grant) {
      budget.releaseSome(live.squadId, grant - spawned.length);
    }
    if (!rec.ids.length) delete dir.active[live.squadId];
    return spawned;
  },

  spawnWreck(live, opts) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || !opts || !opts.pos) return null;
    // Same entity contract as salvage.js debris — tether/beam/scanner all just work on it.
    return spawnEntity({
      type: 'wreck',
      pos: { x: opts.pos.x, z: opts.pos.z },
      radius: 9,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'debris',
        loot: [],
        salvagePool: opts.pool || { cmdty_scrap_metal: 2 },
        salvageTimeLeft: 8,
        isCommunicator: false,
        wreckMissionId: null,
        scanLabel: opts.scanLabel || 'Wreck Debris',
        encounterId: live.id,
      },
    });
  },

  // ── live-entity helpers ─────────────────────────────────────────────────────────────────────
  entsOf(live, role) {
    const out = [];
    const ents = this.state.entities;
    if (!ents) return out;
    for (const id of live.ids) {
      if (role && live.roles[id] !== role) continue;
      const e = ents.get(id);
      if (e && e.alive !== false) out.push(e);
    }
    return out;
  },
  aliveCount(live, role) { return this.entsOf(live, role).length; },
  minDist2ToSquad(live, p) {
    let best = Infinity;
    for (const e of this.entsOf(live)) {
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) best = d2;
    }
    return best;
  },
  playerNearZone(live, slack) {
    const p = this.player();
    if (!p || !live.anchor) return false;
    const r = (live.zoneRadius || 400) + (slack || 0);
    const dx = p.pos.x - live.anchor.x, dz = p.pos.z - live.anchor.z;
    return dx * dx + dz * dz <= r * r;
  },
  setPassive(live, passive, role) {
    for (const e of this.entsOf(live, role || undefined)) {
      const ai = e.data && e.data.ai;
      if (!ai) continue;
      ai.passive = !!passive;
      setEntityDoctrine(e, {
        activity: activityForEncounterSpawn(live, {
          role: live.roles && live.roles[e.id],
          pos: e.pos,
          passive: !!passive,
        }, { now: this.now(), passive: !!passive }),
      });
      if (!passive && e.data.intent) { e.data.intent.moveX = 0; e.data.intent.moveZ = 0; e.data.intent.fire = false; }
    }
  },
  despawnAll(live, afterS, role) {
    const now = this.now();
    let i = 0;
    for (const e of this.entsOf(live, role || undefined)) {
      e.data = e.data || {};
      e.data.despawnAt = now + (afterS || 20) + i * 0.5;   // small stagger so departures read natural
      i++;
    }
  },

  // ── one voice ───────────────────────────────────────────────────────────────────────────────
  say(live, channel, barkIdOrText, vars, o) {
    o = o || {};
    const text = o.literal ? barkIdOrText : barkText(barkIdOrText, vars || live.vars, live.id);
    if (!text) return false;
    const now = this.now();
    if (o.primary) {
      if (live.primarySaid) return false;              // exactly ONE primary line per encounter
      live.primarySaid = true;
    } else if (channel === 'bark' && now - live.lastBarkAt < BARK_MIN_GAP_S) {
      return false;                                    // per-shape bark cap; the receipt carries it
    }
    if (channel === 'bark' || o.primary) live.lastBarkAt = now;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: channel || 'info', text, kind: o.kind || 'encounter', factionId: live.factionId });
    } else {
      this.emit('toast', { text, kind: 'info', ttl: 4 });
    }
    this.emit('encounter:voice', { encounterId: live.id, kind: live.shapeId, channel: channel || 'info', text, primary: !!o.primary, t: now });
    return true;
  },

  offerChoices(live, optionIds, timeoutChoice, deadlineAt) {
    const defs = live.shape.choices || [];
    const state = this.state;
    const options = [];
    for (const id of optionIds) {
      const def = defs.find((c) => c.id === id) || { id, label: id };
      let available = true;
      if (def.needs === 'credits') available = (state.player.credits | 0) >= (live.vars.amount | 0);
      else if (def.needs === 'contraband') available = this.hasContraband();
      else if (def.needs === 'contraband+credits') available = this.hasContraband() && (state.player.credits | 0) >= Math.round(this.fineEstimate() * 0.3);
      options.push({ id: def.id, label: def.label, available });
    }
    this.emit('encounter:choiceOffered', {
      encounterId: live.id, kind: live.shapeId, options, deadlineAt,
      timeoutChoice: timeoutChoice || live.shape.timeoutChoice || null,
    });
  },

  _onChoose(p) {
    if (!p || !p.encounterId) return;
    const dir = ensureDirectorState(this.state);
    const live = dir.live[p.encounterId];
    if (!live || live.phase === 'done') return;
    const script = ENCOUNTER_SCRIPTS[live.script];
    if (script && typeof script.choose === 'function') script.choose(this, live, this.state, p.choiceId);
  },

  // ── outcomes / receipts ─────────────────────────────────────────────────────────────────────
  resolve(live, outcome, o) {
    o = o || {};
    const dir = ensureDirectorState(this.state);
    if (!dir.live[live.id] || live.phase === 'done') return;
    const now = this.now();
    live.phase = 'done';
    live.outcome = outcome;
    dir.cooldowns[live.shapeId] = now + (live.shape.cooldownS || 300);
    dir.lastEndAt = now;
    dir.stats.resolved++;
    // Stragglers give up rather than chain-hunting the player past the encounter's end.
    for (const e of this.entsOf(live)) {
      if (!e.data || e.data.despawnAt == null) { e.data = e.data || {}; e.data.despawnAt = now + 45; }
    }
    this.emit('encounter:resolved', {
      encounterId: live.id, shape: live.shapeId, kind: (live.plan && live.plan.variantKind) || live.shapeId,
      outcome, sectorId: live.sectorId, zoneId: live.zoneId, tier: live.tier, deck: live.deck, t: now,
    });
    const text = receiptText(live.shapeId, outcome, o.vars || live.vars);
    if (text && o.speak !== false) {
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') voice.say({ channel: o.channel || 'info', text, kind: 'receipt' });
      else this.emit('toast', { text, kind: 'info', ttl: 5 });
      this.emit('encounter:receipt', { encounterId: live.id, shape: live.shapeId, outcome, text, t: now });
      dir.receipts.push({ t: now, shape: live.shapeId, outcome, text });
      if (dir.receipts.length > RECEIPT_CAP) dir.receipts.splice(0, dir.receipts.length - RECEIPT_CAP);
    }
    delete dir.live[live.id];
  },

  abort(live, reason) {
    const dir = ensureDirectorState(this.state);
    if (!dir.live[live.id] || live.phase === 'done') return;
    const now = this.now();
    live.phase = 'done';
    live.outcome = `aborted:${reason}`;
    dir.stats.fizzled++;
    dir.cooldowns[live.shapeId] = Math.max(dir.cooldowns[live.shapeId] || 0, now + 60);
    dir.pressure[live.deck] = Math.min(POOL_MAX, dir.pressure[live.deck] + (live.shape.pressureCost || 0)); // it never happened
    this.despawnAll(live, 4);
    this.emit('encounter:resolved', {
      encounterId: live.id, shape: live.shapeId, kind: live.shapeId, outcome: live.outcome,
      sectorId: live.sectorId, zoneId: live.zoneId, tier: live.tier, deck: live.deck, t: now,
    });
    delete dir.live[live.id];
  },

  refundPressure(live, frac) {
    const dir = ensureDirectorState(this.state);
    dir.pressure[live.deck] = Math.min(POOL_MAX, dir.pressure[live.deck] + (live.shape.pressureCost || 0) * (frac || 0));
  },

  // ── consequence intents (single-writer ownership honored) ──────────────────────────────────
  charge(amount, reason) { if (amount > 0) this.emit('economy:chargeCredits', { amount: Math.round(amount), reason }); },
  grant(amount, reason) { if (amount > 0) this.emit('economy:grantCredits', { amount: Math.round(amount), reason }); },
  rep(factionId, delta, reason) { if (factionId && delta) this.emit('faction:repDelta', { factionId, delta, reason }); },
  tradePressure(stationId, commodityId, vol) {
    if (!stationId || !commodityId || !vol) return;
    const bounded = Math.max(-12, Math.min(12, Math.round(vol)));     // ambient life must never flatten gradients
    this.emit('economy:applyTradePressure', { stationId, good: commodityId, vol: bounded });
  },
  dangerImpulse(live, kind, delta) {
    const bounded = Math.max(-0.05, Math.min(0.05, delta || 0));
    if (bounded) this.emit('sectorsim:impulse', { kind, sectorId: live.sectorId, danger: bounded });
  },

  // ═══ EVENT ROUTING ════════════════════════════════════════════════════════════════════════════

  _onEntityGone(p) {
    const id = p && p.id;
    if (id == null) return;
    const dir = ensureDirectorState(this.state);
    for (const squadId of Object.keys(dir.active)) {
      const rec = dir.active[squadId];
      const idx = rec.ids.indexOf(id);
      if (idx === -1) continue;
      rec.ids.splice(idx, 1);
      const budget = this.helpers && this.helpers.spawnBudget;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(squadId, 1);
      if (!rec.ids.length) delete dir.active[squadId];
      break;
    }
    // Cache wrecks resolve their salvage-signal encounter when stripped/destroyed.
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      if (live.script === 'salvageSignal' && live.data && live.data.cacheId === id) {
        this._scriptEvent(live, 'cacheGone', { id });
      }
    }
  },

  _onEntityKilled(p) {
    if (!p || p.id == null) return;
    const dir = ensureDirectorState(this.state);
    const byPlayer = p.killerId != null && p.killerId === this.state.playerId;
    let handled = null;
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      const role = live.roles[p.id];
      if (role !== undefined && live.ids.includes(p.id)) {
        handled = live;
        this._scriptEvent(live, 'squadKill', { id: p.id, role, byPlayer });
        break;
      }
    }
    if (handled || !byPlayer) return;
    // A player kill OUTSIDE any encounter squad, near a convoy → potential guard credit.
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      if (live.script !== 'convoy' && live.script !== 'traderRun') continue;
      for (const h of this.entsOf(live, 'hauler')) {
        const dx = (p.pos ? p.pos.x : 0) - h.pos.x, dz = (p.pos ? p.pos.z : 0) - h.pos.z;
        if (dx * dx + dz * dz <= 1500 * 1500) { this._scriptEvent(live, 'guardKill', p); break; }
      }
    }
  },

  _onCombatDamage(p) {
    if (!p || p.attackerId == null || p.attackerId !== this.state.playerId) return;
    const dir = ensureDirectorState(this.state);
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      if (p.targetId != null && live.ids.includes(p.targetId)) {
        this._scriptEvent(live, 'playerHitSquad', p);
        return;
      }
    }
  },

  _routeToScript(scriptName, eventName, payload) {
    const dir = ensureDirectorState(this.state);
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      if (live.script === scriptName) this._scriptEvent(live, eventName, payload);
    }
  },

  _scriptEvent(live, name, payload) {
    if (!live || live.phase === 'done') return;
    const script = ENCOUNTER_SCRIPTS[live.script];
    if (!script || typeof script.event !== 'function') return;
    try {
      script.event(this, live, this.state, name, payload);
    } catch (err) {
      this.abort(live, 'script_error');
      if (typeof console !== 'undefined' && console.warn) console.warn('[encounterDirector] event failed', live.shapeId, name, err);
    }
  },

  _onMiningYield(p) {
    if (!p || p.minerId == null || p.minerId !== this.state.playerId) return;
    const dir = ensureDirectorState(this.state);
    dir.noise.mining = Math.min(3, dir.noise.mining + (p.qty || 1) * 0.06);
  },

  _currentSectorId() {
    const w = this.state && this.state.world;
    return (w && w.currentSectorId) || null;
  },
};

// ═══ PURE PLANNER (headless-testable; no Three/DOM, no bus, no Math.random) ═══════════════════════

/**
 * Deterministically plan a sector-day's encounter schedule. Everything derives from
 * mulberry32(hash32(seed, sectorId, dayIndex)) — same inputs, same schedule, always.
 * Fire-time gates/pressure decide WHEN (or whether) each item actually runs; the planner only
 * decides WHAT could happen here today, WHERE it anchors, and its squad composition.
 *
 * @returns Array<{ encounterId, shapeId, script, tier, deck, squadId, zoneId, zoneName,
 *                  zoneCenter, zoneRadius, factionId, bark, delay, ships:[...], variantKind?,
 *                  levelBand }>
 */
export function planEncounters(seed, sectorId, dayIndex, zones) {
  const out = [];

  if (!Array.isArray(zones) || !zones.length) return out;
  const rng = mulberry32(hash32(seed == null ? 0 : seed, String(sectorId), dayIndex | 0));

  const zonesByType = new Map();
  for (const z of zones) {
    if (!z || !z.type || !z.center) continue;
    if (!zonesByType.has(z.type)) zonesByType.set(z.type, []);
    zonesByType.get(z.type).push(z);
  }
  if (!zonesByType.size) return out;
  const presentTypes = new Set(zonesByType.keys());

  let seq = 0;
  const scheduleTier = (tier, maxCount, delayLo, delaySpan) => {
    const candidates = Object.values(ENCOUNTERS).filter(
      (e) => e.tier === tier && e.zoneTypes && e.zoneTypes.some((zt) => presentTypes.has(zt)),
    );
    if (!candidates.length) return;
    const roll = rng();
    let count;
    if (tier === 'major') count = roll < 0.35 ? 1 : 0;              // majors are rare
    else if (tier === 'minor') count = 1 + Math.floor(roll * maxCount); // ≥1 minor slot per day —
    // fire-time gates/pressure still decide whether it actually happens (quiet days stay possible)
    else count = Math.floor(roll * (maxCount + 1));
    count = Math.min(count, maxCount);
    for (let i = 0; i < count; i++) {
      const enc = pickWeighted(candidates, rng);
      if (!enc) continue;
      if (enc.rare && rng() < RARE_GATE) continue;     // rare shapes need the extra gate
      const zone = pickZoneFor(enc, zonesByType, rng);
      if (!zone) continue;
      const item = resolveEncounter(enc, zone, sectorId, dayIndex, seq++, rng);
      if (!item) continue;
      item.delay = delayLo + rng() * delaySpan;
      out.push(item);
    }
  };

  scheduleTier('major', MAX_MAJOR_PER_DAY, 90, 360);
  scheduleTier('minor', MAX_MINOR_PER_DAY, 45, 480);
  scheduleTier('ambient', MAX_AMBIENT_PER_DAY, 30, 500);

  // Nominal spacing: keep planned onsets ≥45 s apart (the runtime gate enforces the real law).
  out.sort((a, b) => a.delay - b.delay || a.encounterId.localeCompare(b.encounterId));
  for (let i = 1; i < out.length; i++) {
    if (out[i].delay - out[i - 1].delay < 45) out[i].delay = out[i - 1].delay + 45;
  }
  return out;
}

/** Resolve ONE shape on a chosen zone into a schedule item — exported for the check harness so
 *  tests can force-fire a specific shape without re-implementing squad resolution. */
export function planEncounterShape(enc, zone, sectorId, dayIndex, seq, rng) {
  return resolveEncounter(enc, zone, sectorId, dayIndex, seq, rng);
}

// Resolve one encounter shape on a chosen zone into a schedule item (composition + anchor).
function resolveEncounter(enc, zone, sectorId, dayIndex, seq, rng) {
  const squadId = `enc_${sectorId}_${dayIndex}_${enc.id}_${seq}`;
  const levelBand = zoneLevelBand(zone);
  // Authored zone centers are sector-local, while every live entity/world anchor is galactic-global.
  // Compose once at the planner boundary so squad jitter, proximity gates, telegraphs, and wrecks all
  // share the same authoritative coordinate space off Helios.
  const globalZone = {
    ...zone,
    center: sectorLocalToGlobalForSector(zone.center, sectorId),
  };
  const ships = [];
  // Civilian route life flies the LOCAL flag (a hauler out of Sker is a Reach press-gang run, not
  // an MTS liner); combat shapes keep their authored faction identity.
  const localCivilian = enc.deck === 'civilian' && (enc.script === 'convoy' || enc.script === 'traderRun');
  let factionId = (localCivilian && zone.factionId) ? zone.factionId : enc.factionId;
  let variantKind = null;

  if (enc.variant === 'distress') {
    const genuine = rng() < (Number.isFinite(enc.genuineChance) ? enc.genuineChance : 0.6);
    const branch = genuine ? enc.genuine : enc.bait;
    factionId = branch.factionId;
    variantKind = genuine ? 'distress_genuine' : 'distress_bait';
    addSquad(ships, branch.squad, branch.factionId, branch.context, globalZone, levelBand, rng, genuine ? 'victim' : 'bait');
    if (genuine && branch.threat) {
      addSquad(ships, branch.threat, branch.threat.factionId, branch.threat.context, globalZone, levelBand, rng, 'threat');
    }
  } else if (enc.script === 'namedHunter') {
    // Composition is resolved at fire time from the live named-captain roster (grudges evolve).
  } else {
    const mainRole = (enc.script === 'convoy' || enc.script === 'traderRun') ? 'hauler' : 'squad';
    addSquad(ships, enc.squad, factionId, enc.context, globalZone, levelBand, rng, mainRole);
    if (enc.escort) addSquad(ships, enc.escort, enc.escort.factionId, enc.escort.context || 'patrol', globalZone, levelBand, rng, 'escort');
  }

  return {
    encounterId: squadId,
    shapeId: enc.id,
    script: enc.script,
    tier: enc.tier,
    deck: enc.deck,
    squadId,
    zoneId: zone.id,
    zoneName: zone.name,
    zoneCenter: { x: globalZone.center.x, z: globalZone.center.z },
    zoneRadius: zone.radius || 400,
    factionId,
    bark: enc.bark,
    variantKind,
    levelBand,
    delay: 0,
    ships,
  };
}

// Append `size`-many ships from a squad template onto `ships`, clustered on the zone.
function addSquad(ships, squad, factionId, context, zone, levelBand, rng, role) {
  if (!squad || !squad.archetypes || !squad.archetypes.length) return;
  const [lo, hi] = Array.isArray(squad.size) && squad.size.length === 2 ? squad.size : [1, 2];
  const n = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
  for (let i = 0; i < n; i++) {
    const archetype = squad.archetypes[Math.floor(rng() * squad.archetypes.length) % squad.archetypes.length];
    const level = Math.round(levelBand[0] + (levelBand[1] - levelBand[0]) * (0.4 + rng() * 0.6));
    ships.push({
      archetype,
      combatDoctrineId: ENEMY_BY_ID.get(archetype)?.combatDoctrineId || null,
      level,
      pos: jitter(zone, rng, Math.min(zone.radius || 260, 260)),
      factionId,
      context,
      doctrine: squad.doctrine,
      formation: squad.formation,
      role: role || 'squad',
    });
  }
}

// A deterministic clustered position inside a zone (tight so the squad forms one formation).
function jitter(zone, rng, clusterR) {
  const c = zone.center || { x: 0, z: 0 };
  const ang = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * clusterR;
  return { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
}

// Choose a zone matching the encounter's zoneTypes (seeded among matches).
function pickZoneFor(enc, zonesByType, rng) {
  const matches = [];
  for (const zt of enc.zoneTypes) {
    const zs = zonesByType.get(zt);
    if (zs && zs.length) for (const z of zs) matches.push(z);
  }
  if (!matches.length) return null;
  return matches[Math.floor(rng() * matches.length) % matches.length];
}

// Weighted pick over encounter shapes using their `weight`.
function pickWeighted(list, rng) {
  let total = 0;
  for (const e of list) total += Math.max(0, e.weight || 1);
  if (total <= 0) return list[0] || null;
  let r = rng() * total;
  for (const e of list) {
    r -= Math.max(0, e.weight || 1);
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

// A [lo,hi] level band for a zone from its readability threat tier.
function zoneLevelBand(zone) {
  const threat = zoneThreat(zone);
  const lo = Math.max(1, threat);
  const hi = Math.max(lo + 1, threat + 3);
  return [lo, hi];
}

// ═══ STATE ════════════════════════════════════════════════════════════════════════════════════════

function freshState() {
  return {
    pending: [],
    active: {},
    live: {},
    plannedKey: null,
    lastPlanned: null,
    pressure: { combat: 0, civilian: 0 },
    noise: { mining: 0 },
    window: [],
    cooldowns: {},
    named: {},
    receipts: [],
    stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9,
    lastAmbientAt: -1e9,
    lastMajorAt: -1e9,
    lastEndAt: -1e9,
    _accum: 0,
  };
}

function ensureNamed(dir) {
  for (const cap of NAMED_CAPTAINS) {
    if (!dir.named[cap.id] || typeof dir.named[cap.id] !== 'object') {
      dir.named[cap.id] = { alive: true, tier: 0, escapes: 0, kills: 0, lastSeenSector: null };
    }
  }
}

function ensureDirectorState(state) {
  if (!state.encounterDirector || typeof state.encounterDirector !== 'object' || Array.isArray(state.encounterDirector)) {
    state.encounterDirector = freshState();
  }
  const d = state.encounterDirector;
  if (!Array.isArray(d.pending)) d.pending = [];
  if (!d.active || typeof d.active !== 'object' || Array.isArray(d.active)) d.active = {};
  if (!d.live || typeof d.live !== 'object' || Array.isArray(d.live)) d.live = {};
  if (!d.pressure || typeof d.pressure !== 'object') d.pressure = { combat: 0, civilian: 0 };
  if (!Number.isFinite(d.pressure.combat)) d.pressure.combat = 0;
  if (!Number.isFinite(d.pressure.civilian)) d.pressure.civilian = 0;
  if (!d.noise || typeof d.noise !== 'object') d.noise = { mining: 0 };
  if (!Number.isFinite(d.noise.mining)) d.noise.mining = 0;
  if (!Array.isArray(d.window)) d.window = [];
  if (!d.cooldowns || typeof d.cooldowns !== 'object') d.cooldowns = {};
  if (!d.named || typeof d.named !== 'object' || Array.isArray(d.named)) d.named = {};
  if (!Array.isArray(d.receipts)) d.receipts = [];
  if (!d.stats || typeof d.stats !== 'object') d.stats = { fired: 0, resolved: 0, fizzled: 0 };
  if (!('plannedKey' in d)) d.plannedKey = null;
  if (!Number.isFinite(d.lastMeaningfulAt)) d.lastMeaningfulAt = -1e9;
  if (!Number.isFinite(d.lastAmbientAt)) d.lastAmbientAt = -1e9;
  if (!Number.isFinite(d.lastMajorAt)) d.lastMajorAt = -1e9;
  if (!Number.isFinite(d.lastEndAt)) d.lastEndAt = -1e9;
  if (!Number.isFinite(d._accum)) d._accum = 0;
  ensureNamed(d);
  return d;
}

// ── small read-only helpers ───────────────────────────────────────────────────────────────────────

function isDocked(state) {
  return !!((state.player && state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked));
}

function isTutorialActive(state) {
  const ob = state.onboarding;
  return !!(ob && ob.active && !ob.finished);
}

function isWanted(state) {
  const h = state.player && state.player.heat;
  return typeof h === 'number' ? h >= 0.15 : false;    // mirrors heat.WANTED_THRESHOLD (read-only)
}

function sectorSecurityOf(state) {
  const sid = state.world && state.world.currentSectorId;
  if (!sid) return 0.5;
  const def = SECTORS.find((s) => s.id === sid);
  return def && Number.isFinite(def.security) ? def.security : 0.5;
}
