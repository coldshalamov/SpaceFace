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
import { ZONE_CERES_THROUGHLINE } from '../data/authoredPlaces.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../data/sectorCoordinates.js';
import { makeEnemySpawnSpec } from './combat.js';
import { ENCOUNTERS, NAMED_CAPTAINS, barkText, receiptText } from '../data/encounters.js';
import { ENCOUNTER_MODULES } from '../data/encounters/index.generated.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { WEAPONS } from '../data/weapons.js';
import { factionCompositionWeight } from '../data/factionDoctrines.js';
import { ENCOUNTER_SCRIPTS } from './encounterScripts.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { frontierRumorForEncounterPlan } from '../data/frontierRumors.js';
import {
  isResonanceObeliskSignal,
  RESONANCE_OBELISK,
  resonanceObeliskResponse,
} from '../data/resonanceObelisk.js';
import { removeCargo } from './cargo.js';
import {
  effectiveRegionalSecurity,
  regionalEcologyReadout,
  regionalEncounterWeight,
} from './regionalEcology.js';
import {
  ActivityKind,
  RulesOfEngagement,
  activityForEncounterSpawn,
  roeForActivity,
  setEntityDoctrine,
} from '../ai/doctrine.js';
import {
  nextMoralDebt,
  rememberAceMemoryTransition,
  rememberMoralDebt,
} from './moralMemory.js';
import {
  buildEncounterCausality,
  resolvedEncounterFingerprint,
} from '../world/encounterCausality.js';
import {
  buildLossIntent,
  filterNewFreightIntents,
} from '../economy/freightCausality.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));
const WEAPON_BY_ID = new Map(WEAPONS.map((entry) => [entry.id, entry]));

function combatMassClass(def) {
  const mass = Number(def && def.mass) || 0;
  if (mass <= 24) return 'light';
  if (mass <= 80) return 'medium';
  return 'heavy';
}

function combatWeaponFamilies(def) {
  const families = new Set();
  for (const weapon of def && def.weapons || []) {
    const id = String(weapon && weapon.id || '').toLowerCase();
    const weaponDef = WEAPON_BY_ID.get(weapon && weapon.id);
    const damageType = String(weaponDef && weaponDef.damageType || '').toLowerCase();
    if (weaponDef && weaponDef.intercepts === true) families.add('pd');
    if (damageType === 'kinetic') families.add('kinetic');
    if (damageType === 'energy') families.add('energy');
    if (damageType === 'thermal') families.add('thermal');
    if (damageType === 'explosive') families.add('ordnance');
    if (damageType === 'emp') families.add('emp');
    if (/impulse|concussion|repulsor/.test(id)) families.add('impulse');
    if (/industrial|mining|cutter/.test(id)) families.add('industrial');
  }
  const enemyId = String(def && def.id || '');
  const doctrineId = String(def && def.combatDoctrineId || '');
  if (/foundry/.test(enemyId)) families.add('industrial');
  if (/mine_layer/.test(enemyId)) families.add('ordnance');
  if (/tether/.test(enemyId) || /tether/.test(doctrineId)) families.add('tether');
  return [...families].sort();
}

const ARCHETYPE_COMPOSITION_READOUT = new Map(ENEMY_TYPES.map((def) => [def.id, Object.freeze({
  id: def.id,
  massClass: combatMassClass(def),
  weaponFamilies: Object.freeze(combatWeaponFamilies(def)),
})]));

function pickFactionArchetype(archetypes, factionId, rng) {
  if (!Array.isArray(archetypes) || archetypes.length <= 1) return archetypes && archetypes[0];
  const weighted = archetypes.map((id) => ({
    id,
    weight: factionCompositionWeight(factionId, ARCHETYPE_COMPOSITION_READOUT.get(id) || { id }),
  }));
  const total = weighted.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (!(total > 0)) return archetypes[0];
  let roll = rng() * total;
  for (const row of weighted) {
    roll -= Math.max(0, row.weight);
    if (roll < 0) return row.id;
  }
  return weighted[weighted.length - 1].id;
}

const SELF_REGISTERED_RUNTIME_BY_ID = new Map(
  ENCOUNTER_MODULES
    .filter((module) => module && module.trigger && module.runtime)
    .map((module) => [module.trigger.id, module.runtime]),
);

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

// AC-10 populated-island contact. This is an entry-local one-shot layered through the ordinary
// catalog/director/budget/spawn facade; it does not change the generic sector pacing law above.
export const ARCADE_ISLAND_CONTACT_SHAPE_ID = 'arcade_island_contact';
export const ARCADE_ISLAND_CONTACT_MIN_DELAY_S = 6;
export const ARCADE_ISLAND_CONTACT_MAX_DELAY_S = 12;
export const ARCADE_ISLAND_CONTACT_DEADLINE_S = 20;
export const ARCADE_ISLAND_CONTACT_REARM_S = 90;
export const ARCADE_ISLAND_CONTACT_DISTANCE_WU = 125;
const ARCADE_ISLAND_SPAWN_MIN_WU = 180;
const ARCADE_ISLAND_SPAWN_MAX_WU = 240;
const ARCADE_ISLAND_BEARING_SPREAD_RAD = Math.PI / 3;
const ARCADE_ISLAND_ELIGIBLE_TYPES = new Set([
  'mining_belt', 'refinery_approach', 'outlaw_zone', 'ambush_lane', 'derelict_field',
]);

const CERES_ACTIVITY_SECTOR_ID = 'sector_ceres_belt';
const CERES_ACTIVITY_AMBUSH_ZONE_ID = 'zone_ceres_ambush';
const CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID = 'ceres:activity:throughline-ambush';
const CERES_ACTIVITY_AMBUSH_INNER_R = 125;
const CERES_ACTIVITY_AMBUSH_OUTER_R = 165;
const CERES_ACTIVITY_AMBUSH_MARKER = 'ceresActivityAmbushPhase';
const CERES_ACTIVITY_AMBUSH_RESTORE = 'ceresActivityAmbushRestore';
const CERES_LIVING_CHAIN_SHAPE_ID = 'curtain_convoy';
const CERES_LIVING_CHAIN_ZONE_ID = 'zone_ceres_refinery';
const CERES_LIVING_CHAIN_HAULER_SLOT_ID = 'ceres_refinery_hauler';
const CERES_LIVING_CHAIN_PATROL_SLOT_ID = 'ceres_cathedral_patrol';

const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
const LEGALITY_FINE_MULT = { restricted: 0.8, illegal: 1.2, contraband: 1.5 };
const CIVIL_ZONE_TYPES = new Set(['civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint', 'refinery_approach', 'colony']);
const FREIGHT_PICKUP_MASS_MIN = 8;
const FREIGHT_PICKUP_MASS_MAX = 80;
const FREIGHT_PICKUP_RADIUS_MIN = 2.2;
const FREIGHT_PICKUP_RADIUS_MAX = 5.5;
const FREIGHT_CUSTODY_SAVE_VERSION = 1;
const FREIGHT_CUSTODY_SAVE_CAP = 4;
const FREIGHT_CUSTODY_POD_SAVE_CAP = 3;
const FREIGHT_CUSTODY_ESCAPE_RADIUS_DEFAULT = 600;
const FREIGHT_THEFT_LAW_KIND = 'payload_theft';
const FREIGHT_THEFT_OFFENDER_STABLE_ID = 'player';

export const encounterDirector = {
  name: 'encounterDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this.registry = ctx.registry || null;
    this._saveRestoring = false;
    this._freightCustodyRebindPasses = 0;
    this._arcadeIslandVisit = null;
    this._arcadeIslandLastArm = new Map();
    this._arcadeIslandLoadSuppressed = false;
    ensureDirectorState(this.state);

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
      this.bus.on('day:tick', () => this._planSector(this._currentSectorId()));
      this.bus.on('sector:exit', (p) => this._onSectorExit(p));
      // Durable-merge on load: keep named captains / receipts / cooldowns, rebuild transients.
      this.bus.on('save:restoring', () => {
        this._saveRestoring = true;
        // Restore is a transport boundary, not a custody outcome. The already-serialized stats
        // envelope plus persistent actors reconstruct the coordinator after save:loaded; settling
        // here would mint loss/news while saveSystem is merely clearing the outgoing entity set.
        clearAllPredationBindings(this.state, 'save_restoring');
      });
      this.bus.on('save:loaded', () => this._onSaveLoaded());
      this.bus.on('save:error', () => { this._saveRestoring = false; });
      // Canonical fresh-run boundary. encounterDirector is intentionally not in the central reset
      // list, so its own event owner must clear transient live pairings before numeric IDs recycle.
      this.bus.on('game:new', () => this.newGame());
      // Budget bookkeeping + script event routing.
      this.bus.on('entity:destroyed', (p) => this._onEntityGone(p));
      this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
      this.bus.on('combat:subsystemDisabled', (p) => this._routeToScript('convoy', 'subsystemDisabled', p));
      this.bus.on('pickup:collected', (p) => this._routeToScript('convoy', 'pickupCollected', p));
      this.bus.on('ai:flee', (p) => this._routeToScript('convoy', 'aiFlee', p));
      this.bus.on('freight:recovery', (p) => this._routeToScript('convoy', 'freightRecovered', p));
      this.bus.on('freight:recoveryAbandoned', (p) => this._routeToScript('convoy', 'freightRecoveryAbandoned', p));
      this.bus.on('encounter:namedCaptainBound', (p) => this._onExternalNamedBound(p));
      this.bus.on('combat:damage', (p) => this._onCombatDamage(p));
      this.bus.on('contraband:scanned', (p) => this._routeToScript('patrolScan', 'contrabandScanned', p));
      this.bus.on('scan:pulse', (p) => {
        this._routeToScript('distress', 'scanPulse', p);
        this._routeToSelfRegistered('scanPulse', p);
      });
      this.bus.on('tether:attached', (p) => this._routeToSelfRegistered('tetherAttached', p));
      this.bus.on('moralMemory:remember', (p) => rememberMoralDebt(this.state, p || {}));
      this.bus.on('aceMemory:transition', (p) => rememberAceMemoryTransition(this.state, p || {}));
      this.bus.on('poi:discovered', (p) => this._rememberPoiVisit(p));
      this.bus.on('poi:identified', (p) => this._rememberPoiVisit(p));
      this.bus.on('salvage:communicatorFound', (p) => this._routeToScript('salvageSignal', 'communicatorFound', p));
      this.bus.on('salvage:completed', (p) => this._routeToSelfRegistered('salvageCompleted', p));
      // The deterministic choice bridge (UI/test harness both speak this).
      this.bus.on('encounter:choose', (p) => this._onChoose(p));
      // Mining noise attracts predators (decaying accumulator; player yields only).
      this.bus.on('mining:yield', (p) => this._onMiningYield(p));
      this.bus.on('asteroid:destroyed', (p) => this._routeToSelfRegistered('asteroidDestroyed', p));
      this.bus.on('resonance:scanCompleted', (p) => this._onResonanceScan(p));
      this.bus.on('world:zoneEntered', (p) => this._onArcadeIslandEntered(p || {}));
      this.bus.on('world:zoneExited', (p) => this._onArcadeIslandExited(p || {}));
      this.bus.on('traffic:ceresManifestTransferred', (p) => this._onCeresManifestTransferred(p || {}));
    }
  },

  newGame() {
    this._saveRestoring = false;
    this._clearArcadeIslandContact(true);
    this._arcadeIslandLoadSuppressed = false;
    this._routeToScript('convoy', 'lifecycle', { reason: 'new_game' });
    clearAllPredationBindings(this.state, 'new_game');
    this.state.encounterDirector = freshState();
    ensureNamed(this.state.encounterDirector);
  },

  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    if (this._freightCustodyRebindPasses > 0) {
      this._freightCustodyRebindPasses--;
      this._restorePersistedFreightCustodies();
      this._rebindPersistedFreightCustodyCarriers();
    }
    const dir = ensureDirectorState(state);
    this._sampleCeresActivityAmbush(dir, state);
    dir._accum = (dir._accum || 0) + dt;
    if (dir._accum < 1) return;                        // director runs at 1 Hz — no per-frame work
    const step = dir._accum;
    dir._accum = 0;
    const now = state.simTime || 0;
    this._accrue(dir, state, step);
    this._tickArcadeIslandContact(dir, state, now);
    if (!isDocked(state) && !isTutorialActive(state)) this._pump(dir, state, now);
    this._tickLive(dir, state, now);
  },

  // ═══ SCHEDULING ═══════════════════════════════════════════════════════════════════════════════

  _onSectorEnter(p) {
    // saveSystem rematerializes the target sector before it installs the incoming director bag.
    // Ignore that early event rather than applying the outgoing timeline's one-shot phase to the
    // incoming durable actors; save:loaded below seeds once the saved stats are authoritative.
    if (this._saveRestoring) return;
    // Continuous free-flight membership is a soft handoff (M2-C1). Soft exit preserves
    // live/pending/pressure/active; continuous enter must NOT reseed grace pressure, clear the
    // pacing window, or replan (which wipes pending for a new sector-day key). Intentional
    // jump / load / boot enters still get the entry breath and planner.
    const sectorId = p && typeof p === 'object' ? p.sectorId : p;
    if (p && (p.continuous || p.noTeleport)) {
      this._seedCeresActivityAmbush(sectorId, { continuous: true });
      return;
    }

    this._clearArcadeIslandContact(true);

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
    this._seedCeresActivityAmbush(sectorId);
  },

  _onSectorExit(p) {
    if (this._saveRestoring) return;
    // Continuous free-flight membership is a soft handoff — preserve live encounters, pending
    // beats, and active spawn ledger so fights can cross Voronoi edges (M2-C1). Hard teardown
    // only for intentional jump / load / non-continuous boundaries.
    const sectorId = p && typeof p === 'object' ? p.sectorId : p;
    if (p && (p.continuous || p.noTeleport)) return;
    this._clearArcadeIslandContact(true);
    if (sectorId === CERES_ACTIVITY_SECTOR_ID) this._leaveCeresActivityAmbush();

    const dir = ensureDirectorState(this.state);
    // Live encounters in the sector we left resolve as abandoned (named grudges still book).
    for (const id of Object.keys(dir.live)) {
      const live = dir.live[id];
      const script = encounterScriptFor(live);
      if (live.script === 'namedHunter' && script) {
        script._depart(this, live, !!(live.data && live.data.engaged));
      } else {
        if (live.script === 'convoy') this._scriptEvent(live, 'lifecycle', { reason: 'sector_exit' });
        this.abort(live, 'sector_exit');
      }
    }
    dir.live = {};
    dir.pending = [];
    dir.active = {};                                   // spawnBudget hard-resets on non-continuous exit
    dir.plannedKey = null;                             // same-day re-entry must replan
  },

  _onSaveLoaded() {
    this._saveRestoring = false;
    const state = this.state;
    const prev = state.encounterDirector;
    clearAllPredationBindings(state, 'save_loaded');
    const fresh = freshState();
    if (prev && typeof prev === 'object') {
      if (prev.named && typeof prev.named === 'object' && !Array.isArray(prev.named)) fresh.named = prev.named;
      if (Array.isArray(prev.receipts)) fresh.receipts = prev.receipts.slice(-RECEIPT_CAP);
      if (prev.cooldowns && typeof prev.cooldowns === 'object') fresh.cooldowns = prev.cooldowns;
      if (prev.stats && typeof prev.stats === 'object') fresh.stats = { ...fresh.stats, ...prev.stats };
    }
    state.encounterDirector = fresh;
    ensureNamed(fresh);
    this._restorePersistedFreightCustodies();
    this._rebindPersistedFreightCustodyCarriers();
    // Some load owners publish save:loaded before their final entity-index rebuild. Two bounded
    // update passes catch that production ordering without turning this into a permanent scan.
    this._freightCustodyRebindPasses = 2;
    // A Continue materializes the player inside their current zone. That is transport, not a fresh
    // arrival beat: suppress until the player physically crosses a zone boundary.
    this._clearArcadeIslandContact(true);
    this._arcadeIslandLoadSuppressed = true;
    // Absolute cooldown stamps from another timeline are clamped into sane range.
    const now = state.simTime || 0;
    for (const k of Object.keys(fresh.cooldowns)) {
      const shape = ENCOUNTERS[k];
      const maxCd = now + (shape && shape.cooldownS ? shape.cooldownS : 900);
      if (!(fresh.cooldowns[k] <= maxCd)) fresh.cooldowns[k] = maxCd;
    }
    this._seedCeresActivityAmbush(this._currentSectorId(), { loaded: true });
  },

  // ── AC-10 populated-island contact ──────────────────────────────────────────────────────────

  _clearArcadeIslandContact(clearMemory = false) {
    this._arcadeIslandVisit = null;
    if (clearMemory) this._arcadeIslandLastArm = new Map();
  },

  _onArcadeIslandEntered(payload) {
    if (this._saveRestoring || this._arcadeIslandLoadSuppressed) return;
    const state = this.state;
    if (!state || isDocked(state) || isTutorialActive(state)) return;
    const sectorId = this._currentSectorId();
    if (!sectorId || !payload.zoneId) return;
    const zone = zonesForSector(sectorId).find((candidate) => candidate.id === payload.zoneId);
    if (!isArcadeIslandContactZone(zone)) return;
    const player = this.player();
    if (player && this._arcadeIslandHasContact(player)) return;

    const now = state.simTime || 0;
    const key = `${sectorId}\u0000${zone.id}`;
    const previous = this._arcadeIslandLastArm.get(key);
    if (Number.isFinite(previous) && now - previous < ARCADE_ISLAND_CONTACT_REARM_S) return;
    const center = sectorLocalToGlobalForSector(zone.center, sectorId);
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return;
    const delay = arcadeIslandContactDelay(
      (state.meta && state.meta.seed) || 0,
      sectorId,
      zone.id,
      Math.floor(now / ARCADE_ISLAND_CONTACT_REARM_S),
    );
    this._arcadeIslandLastArm.set(key, now);
    this._arcadeIslandVisit = {
      key,
      sectorId,
      zoneId: zone.id,
      zone,
      center,
      enteredAt: now,
      dueAt: now + delay,
      deadlineAt: now + ARCADE_ISLAND_CONTACT_DEADLINE_S,
      firedAt: null,
    };
  },

  _onArcadeIslandExited(payload) {
    // Crossing a real zone boundary after Continue restores eligibility for the next actual visit.
    this._arcadeIslandLoadSuppressed = false;
    const visit = this._arcadeIslandVisit;
    if (!visit || !payload.zoneId || payload.zoneId === visit.zoneId) this._arcadeIslandVisit = null;
  },

  _tickArcadeIslandContact(dir, state, now) {
    const visit = this._arcadeIslandVisit;
    if (!visit || this._arcadeIslandLoadSuppressed || isDocked(state) || isTutorialActive(state)) return;
    if (visit.sectorId !== this._currentSectorId()) {
      this._arcadeIslandVisit = null;
      return;
    }
    const player = this.player();
    if (!player || !player.pos) return;
    const local = globalToSectorLocalForSector(player.pos, visit.sectorId);
    const currentZone = zoneAt(visit.sectorId, local.x, local.z);
    if (!currentZone || currentZone.id !== visit.zoneId) {
      this._arcadeIslandVisit = null;
      return;
    }
    if (this._arcadeIslandHasContact(player)) {
      this._arcadeIslandVisit = null;
      return;
    }
    if (now > visit.deadlineAt) {
      this._arcadeIslandVisit = null;
      return;
    }
    if (visit.firedAt != null || now < visit.dueAt) return;
    const budget = this.helpers && this.helpers.spawnBudget;
    const minimumGroup = zoneThreat(visit.zone) >= 2 ? 3 : 8;
    if (budget && typeof budget.available === 'function' && budget.available() < minimumGroup) return;
    const fired = this._fireArcadeIslandContact(dir, state, visit, now);
    if (fired) visit.firedAt = now;
  },

  _arcadeIslandHasContact(player) {
    const entities = this.state && this.state.entityList || [];
    const maxD2 = ARCADE_ISLAND_CONTACT_DISTANCE_WU * ARCADE_ISLAND_CONTACT_DISTANCE_WU;
    for (const entity of entities) {
      if (!entity || entity.alive === false || !entity.pos || entity.id === player.id) continue;
      if (entity.type !== 'ship' && entity.type !== 'drone') continue;
      if (entity.team === player.team) continue;
      const ai = entity.data && entity.data.ai;
      if (ai && (ai.passive === true || ai.lawful === true)) continue;
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      if (dx * dx + dz * dz <= maxD2) return true;
    }
    return false;
  },

  _fireArcadeIslandContact(dir, state, visit, now) {
    const shape = ENCOUNTERS[ARCADE_ISLAND_CONTACT_SHAPE_ID];
    const player = this.player();
    if (!shape || !player || !player.pos || !encounterScriptFor(shape)) return false;
    const rng = mulberry32(hash32(
      (state.meta && state.meta.seed) || 0,
      visit.key,
      Math.floor(visit.enteredAt),
      'arcade-island-contact',
    ));
    const item = resolveEncounter(
      shape,
      visit.zone,
      visit.sectorId,
      Math.floor(now / DAY_SECONDS),
      0,
      rng,
    );
    if (!item || !item.ships.length) return false;

    const threat = zoneThreat(visit.zone);
    const targetCount = threat >= 2
      ? 4 + Math.floor(rng() * 3)
      : 8 + Math.floor(rng() * 7);
    const waspTemplate = item.ships.find((ship) => ship.archetype === 'wasp_swarmer')
      || item.ships[0];
    const moteDef = ENEMY_BY_ID.get('mote_swarmer');
    const ships = [];
    if (threat >= 2) ships.push({
      ...waspTemplate,
      archetype: 'reaver_pirate',
      combatDoctrineId: ENEMY_BY_ID.get('reaver_pirate')?.combatDoctrineId || null,
      compositionRole: 'identity_anchor',
      role: 'leader',
    });
    while (ships.length < targetCount) ships.push({
      ...waspTemplate,
      archetype: threat >= 2 ? 'wasp_swarmer' : 'mote_swarmer',
      combatDoctrineId: threat >= 2
        ? ENEMY_BY_ID.get('wasp_swarmer')?.combatDoctrineId || null
        : moteDef?.combatDoctrineId || null,
      compositionRole: threat >= 2 ? 'light' : undefined,
      role: threat >= 2 ? 'member' : undefined,
      fleeCargo: threat >= 2 ? { commodityId: 'cmdty_scrap_metal', qty: 1 } : null,
    });

    let bearing = Math.atan2(visit.center.z - player.pos.z, visit.center.x - player.pos.x);
    if (!Number.isFinite(bearing) || Math.hypot(
      visit.center.x - player.pos.x,
      visit.center.z - player.pos.z,
    ) < 1e-6) bearing = rng() * Math.PI * 2;
    const angle = bearing + (rng() * 2 - 1) * ARCADE_ISLAND_BEARING_SPREAD_RAD;
    const rolledRadius = ARCADE_ISLAND_SPAWN_MIN_WU
      + rng() * (ARCADE_ISLAND_SPAWN_MAX_WU - ARCADE_ISLAND_SPAWN_MIN_WU);
    const radius = threat >= 2 ? rolledRadius : Math.min(220, rolledRadius);
    const radialX = Math.cos(angle);
    const radialZ = Math.sin(angle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    for (let index = 0; index < ships.length; index++) {
      const cell = index % 3;
      const rank = Math.floor(index / 3);
      const cloudX = threat >= 2
        ? (index - (ships.length - 1) * 0.5) * 12
        : (cell - 1) * 68 + (rank % 2 === 0 ? -1 : 1) * rank * 7;
      const cloudZ = threat >= 2
        ? (index % 2 === 0 ? -1 : 1) * Math.min(8, index * 2)
        : rank * 10;
      ships[index].pos = {
        x: player.pos.x + radialX * radius + tangentX * cloudX + radialX * cloudZ,
        z: player.pos.z + radialZ * radius + tangentZ * cloudX + radialZ * cloudZ,
      };
      if (threat < 2) ships[index].squadId = `${visit.key}:mote-cell:${index % 3}`;
      ships[index].passive = true;
    }

    item.ships = ships;
    item.encounterId = `arcade-island:${visit.sectorId}:${visit.zoneId}:${Math.floor(visit.enteredAt)}`;
    item.squadId = item.encounterId;
    item.zoneCenter = { x: visit.center.x, z: visit.center.z };
    item.zoneRadius = visit.zone.radius || 400;
    item.data = { arcadeIslandContact: true };
    if (!this._spawnAdmissionAvailable(item, shape)) return false;
    this._fire(dir, state, item, shape, now);
    return !!dir.live[item.encounterId];
  },

  // ── AC-14: one conserved Ceres living-world chain ──────────────────────────────────────────

  _onCeresManifestTransferred(payload) {
    const state = this.state;
    if (!state || this._saveRestoring || this._currentSectorId() !== CERES_ACTIVITY_SECTOR_ID
      || payload.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || typeof payload.handoffId !== 'string' || !payload.handoffId
      || !Number.isInteger(payload.transferSeq) || payload.transferSeq <= 0
      || typeof payload.manifestId !== 'string' || !payload.manifestId
      || !Number.isSafeInteger(payload.qty) || payload.qty <= 0) return false;
    const hauler = state.entities?.get(payload.haulerEntityId);
    const manifest = hauler?.data?.cargoManifest;
    if (!hauler || hauler.alive === false || hauler.type !== 'ship' || hauler.team !== 2
      || hauler.data?.activityActorSlotId !== CERES_LIVING_CHAIN_HAULER_SLOT_ID
      || hauler.data?.worldRecordId !== payload.haulerWorldRecordId
      || manifest?.manifestId !== payload.manifestId || manifest.totalQty !== payload.qty
      || manifest.custody?.handoffId !== payload.handoffId
      || manifest.custody?.transferSeq !== payload.transferSeq) return false;
    const patrol = (state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.type === 'ship'
      && entity.data?.activityActorSlotId === CERES_LIVING_CHAIN_PATROL_SLOT_ID
      && entity.data?.ceresActivityCast === true
      && entity.data?.ceresActivityJobOwned === true
      && entity.data?.ai?.lawful === true);
    const station = (state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.type === 'station' && entity.data?.stationId === 'station_ceres' && entity.pos);
    const shape = ENCOUNTERS[CERES_LIVING_CHAIN_SHAPE_ID];
    const script = ENCOUNTER_SCRIPTS.convoy;
    if (!patrol || !station || !shape || !script || typeof script.adoptLivingChain !== 'function') return false;

    const encounterId = `ceres:living-chain:${payload.handoffId}:${payload.transferSeq}`;
    const dir = ensureDirectorState(state);
    if (dir.live[encounterId]) return true;
    const angle = hash32(state.meta?.seed || 0, encounterId, 'pirate-bearing') / 4294967296 * Math.PI * 2;
    const piratePos = {
      x: hauler.pos.x + Math.cos(angle) * 145,
      z: hauler.pos.z + Math.sin(angle) * 145,
    };
    const item = {
      encounterId,
      squadId: encounterId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      zoneId: CERES_LIVING_CHAIN_ZONE_ID,
      zoneName: 'Ceres Refinery Approach',
      zoneCenter: { x: hauler.pos.x, z: hauler.pos.z },
      zoneRadius: 720,
      factionId: 'faction_reach',
      variantKind: 'ceres_living_manifest_chain',
      motive: 'cargo_raid',
      engagementTrigger: 'manifest_predation',
      predation: { ...shape.predation },
      ships: [{
        role: 'raider',
        archetype: 'reaver_pirate',
        level: 2,
        factionId: 'faction_reach',
        context: 'encounter',
        passive: true,
        combatDoctrineId: shape.predation?.attackerDoctrineId,
        pos: piratePos,
      }],
      data: {
        ceresLivingChain: true,
        handoffId: payload.handoffId,
        rootLotId: payload.rootLotId,
        transferSeq: payload.transferSeq,
        preservedWorldActorIds: [hauler.id],
        preservedWorldActorSnapshots: {
          [hauler.id]: capturePreservedWorldActor(hauler),
        },
      },
    };
    const live = makeEncounterLiveRecord(state, item, shape, state.simTime || 0);
    dir.live[live.id] = live;
    if (!script.adoptLivingChain(this, live, state, { hauler, patrol, station, payload })) {
      this.abort(live, 'living_chain_adoption');
      return false;
    }
    dir.stats.fired++;
    this.emit('encounter:telegraph', {
      encounterId: live.id,
      kind: live.shapeId,
      tier: live.tier,
      deck: live.deck,
      sectorId: live.sectorId,
      zoneId: live.zoneId,
      zoneName: live.zoneName,
      pos: { ...live.anchor },
      causality: { ...live.causality },
    });
    this.emit('encounter:spawned', {
      encounterId: live.id,
      kind: live.shapeId,
      squadId: live.squadId,
      sectorId: live.sectorId,
      zoneId: live.zoneId,
      count: 1,
      fingerprint: live.causality.fingerprint,
      motiveId: live.causality.motiveId,
    });
    return true;
  },

  _restorePersistedFreightCustodies() {
    const dir = ensureDirectorState(this.state);
    const envelopes = normalizePersistedFreightCustodies(dir.stats.openFreightCustodies);
    dir.stats.openFreightCustodies = envelopes;
    const script = ENCOUNTER_SCRIPTS.convoy;
    if (!script || typeof script.restoreCustody !== 'function') return 0;
    let restored = 0;
    for (const envelope of envelopes) {
      const existing = dir.live[envelope.encounterId];
      if (existing && existing.data && existing.data.freightCargoCustody
        && existing.data.freightCargoCustody.custodyId === envelope.custodyId) continue;
      if (script.restoreCustody(this, this.state, envelope)) restored++;
    }
    return restored;
  },

  _rebindPersistedFreightCustodyCarriers() {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return 0;
    let rebound = 0;
    for (const entity of entities.values()) {
      const binding = persistedFreightCarrierBinding(entity);
      if (!binding || binding.custody.carrierId === entity.id) continue;
      const previousCarrierId = binding.custody.carrierId;
      binding.custody.carrierId = entity.id;
      binding.data.freightCustodyCarrierIdentityKey = binding.identityKey;
      rebound++;
      this.emit('freight:custodyRebound', {
        entityId: entity.id,
        previousCarrierId,
        encounterId: binding.custody.encounterId,
        manifestId: binding.manifest.manifestId,
        freighterKey: binding.manifest.freighterKey,
        carrierIdentityKey: binding.identityKey,
        t: this.now(),
      });
    }
    return rebound;
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
    // Ordinary sector-day rows are transient and replan from the new day seed. The one authored
    // Ceres crossing is durable once queued, so carry that exact item across the replan rather than
    // silently erasing the player's physical trigger. Collapse any malformed duplicate fail-closed.
    const queuedCeresActivityAmbush = sectorId === CERES_ACTIVITY_SECTOR_ID
      ? dir.pending.find((item) => isCeresActivityAmbushItem(item))
      : null;
    dir.pending = queuedCeresActivityAmbush ? [queuedCeresActivityAmbush] : [];

    const zones = zonesForSector(sectorId);
    if (!zones.length) return;                         // no zones → schedule nothing (additive)

    const schedule = planEncounters(state.meta && state.meta.seed, sectorId, dayIndex, zones, state);
    const now = state.simTime || 0;
    for (const s of schedule) {
      if (sectorId === CERES_ACTIVITY_SECTOR_ID
        && s.shapeId === 'ambush_snare'
        && s.zoneId === CERES_ACTIVITY_AMBUSH_ZONE_ID) {
        continue;
      }
      dir.pending.push({ ...s, sectorId, dueAt: now + s.delay, defers: 0 });
      const rumor = frontierRumorForEncounterPlan({
        seed: state.meta && state.meta.seed,
        dayIndex,
        sectorId,
        item: s,
        shape: ENCOUNTERS[s.shapeId],
      });
      if (rumor) this.emit('frontierRumor:planned', rumor);
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
    const ecology = regionalEcologyReadout(state, sectorId);
    const ecologyDanger = ecology ? ecology.danger.effective - ecology.danger.baseline : 0;
    const cargoBand = Math.min(1, this.cargoValue() / 2000);
    const wanted = isWanted(state);
    const combatRate =
      0.25 + 0.22 * zt + (1 - sec) * 0.5 + cargoBand * 0.35 +
      (wanted ? 0.6 : 0) + Math.min(1, dir.noise.mining) * 0.5 +
      (((state.player && state.player.bounty) | 0) > 0 ? 0.25 : 0) + ecologyDanger * 0.45;
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
    if (!shape || !encounterScriptFor(shape)) { dir.pending.splice(dueIdx, 1); return; }

    const defer = () => { item.dueAt = now + DEFER_S; };
    const gateDefer = () => {
      item.defers = (item.defers | 0) + 1;
      if (item.defers > MAX_GATE_DEFERS) { dir.pending.splice(dueIdx, 1); dir.stats.fizzled++; return; }
      defer();
    };

    if (encounterPacingBlockReason(dir, state, shape, now)) return defer();

    const ceresActivityAmbush = isCeresActivityAmbushItem(item);
    // The R5 Ceres squad is a normal paced ambush_snare in a tier-1 authored pocket. Its authored
    // crossing is the eligibility proof for only the catalog's generic min-sector-tier rule. Every
    // other current/future authored gate remains enforced through the same fail-closed evaluator.
    if (!this._gatesPass(shape, state, { ignoreMinSectorTier: ceresActivityAmbush })) return gateDefer();
    if (shape.proximity && !this._playerNearItemZone(item)) return gateDefer();
    if (ceresActivityAmbush && !this._ceresActivityAmbushCohort().length) {
      return defer();
    }
    // Capacity is a fire gate, not a post-telegraph failure. A saturated encounter remains queued
    // without spending pressure/window/voice state; genuine distress needs both a victim and one
    // threat before it can truthfully become live.
    if (!this._spawnAdmissionAvailable(item, shape)) return defer();
    dir.pending.splice(dueIdx, 1);
    this._fire(dir, state, item, shape, now);
  },

  _gatesPass(shape, state, options = {}) {
    const g = shape.gates || {};
    if (g.externalOnly) return false;
    const sectorId = this._currentSectorId();
    const sector = SECTORS.find((entry) => entry.id === sectorId);
    const completed = state.story && state.story.depthProgramEncounters
      && state.story.depthProgramEncounters.completed || {};
    if (g.uniqueOnce && completed[shape.id]) return false;
    if (g.blockAfterOutcome && completed[shape.id] && completed[shape.id].outcome === g.blockAfterOutcome) return false;
    if (Array.isArray(g.sectorIds) && !g.sectorIds.includes(sectorId)) return false;
    if (Number.isFinite(g.storyBeatMin) && ((state.story && state.story.beatIndex) | 0) < g.storyBeatMin) return false;
    if (!options.ignoreMinSectorTier
      && Number.isFinite(g.minSectorTier)
      && (!sector || (sector.tier | 0) < g.minSectorTier)) return false;
    if (g.requiredTech && !(state.player && Array.isArray(state.player.researchedNodes)
      && state.player.researchedNodes.includes(g.requiredTech))) return false;
    if (g.requiredPoiDiscovered) {
      const discovery = state.world && state.world.discovery && state.world.discovery[sectorId];
      const poi = discovery && discovery.pois && discovery.pois[g.requiredPoiDiscovered];
      if (!poi || poi.discovered !== true) return false;
      if (g.requirePriorPoiVisit) {
        const visits = state.story && state.story.depthProgramPoiVisits;
        const firstSeenAt = visits && visits[g.requiredPoiDiscovered] && visits[g.requiredPoiDiscovered].firstSeenAt;
        if (!Number.isFinite(firstSeenAt) || firstSeenAt >= (state.simTime || 0)) return false;
      }
    }
    if (g.moralDebtOnly && !nextMoralDebt(state)) return false;
    if (g.minCargoValue && this.cargoValue() < g.minCargoValue) return false;
    if (g.bountyOnly && (((state.player && state.player.bounty) | 0) <= 0)) return false;
    if (Number.isFinite(g.maxSecurity) && sectorSecurityOf(state) > g.maxSecurity) return false;
    if (Number.isFinite(g.minSecurity) && sectorSecurityOf(state) < g.minSecurity) return false;
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

  _spawnAdmissionAvailable(item, shape) {
    const minimum = encounterAdmissionMinimum(item, shape);
    if (minimum <= 0) return true;
    const budget = this.helpers && this.helpers.spawnBudget;
    if (!budget || typeof budget.available !== 'function') return true;
    return budget.available() >= minimum;
  },

  /** Deterministic forcing seam for authored/self-registering encounters. Debug harnesses and
   * future story owners provide a stable encounter id; normal calls still honor live header gates.
   * `force` bypasses eligibility only, never RNG or sim-time. */
  requestAuthoredEncounter(payload) {
    if (!payload || !payload.shapeId || !payload.encounterId || !payload.sectorId) {
      return { ok: false, reason: 'invalid_request' };
    }
    const state = this.state;
    const dir = ensureDirectorState(state);
    if (dir.live[payload.encounterId]) {
      return { ok: true, encounterId: payload.encounterId, reused: true };
    }
    if (this._currentSectorId() !== payload.sectorId) return { ok: false, reason: 'wrong_sector' };
    const shape = ENCOUNTERS[payload.shapeId];
    if (!shape) return { ok: false, reason: 'missing_shape' };
    if (!encounterScriptFor(shape)) return { ok: false, reason: 'missing_runtime' };
    if (payload.respectPacing) {
      const reason = encounterPacingBlockReason(dir, state, shape, state.simTime || 0);
      if (reason) return { ok: false, reason };
    }
    if (!payload.force && !this._gatesPass(shape, state)) return { ok: false, reason: 'gated' };

    const requestedZone = payload.zoneId
      ? zonesForSector(payload.sectorId).find((candidate) => candidate.id === payload.zoneId)
      : null;
    const anchor = payload.anchor
      || (requestedZone && sectorLocalToGlobalForSector(requestedZone.center, payload.sectorId))
      || (this.player() && this.player().pos)
      || { x: 0, z: 0 };
    const local = globalToSectorLocalForSector(anchor, payload.sectorId);
    const zone = {
      ...(requestedZone || {}),
      id: payload.zoneId || (requestedZone && requestedZone.id) || `authored:${shape.id}`,
      name: payload.zoneName || (requestedZone && requestedZone.name) || shape.title || shape.id,
      type: payload.zoneType || (requestedZone && requestedZone.type)
        || (shape.zoneTypes && shape.zoneTypes[0]) || 'authored',
      center: { x: local.x, z: local.z },
      radius: Math.max(80, Number(payload.zoneRadius) || (requestedZone && requestedZone.radius) || 520),
      threat: Number.isFinite(payload.threat)
        ? payload.threat
        : (Number.isFinite(requestedZone && requestedZone.threat) ? requestedZone.threat : 1),
    };
    const rng = mulberry32(hash32(
      (state.meta && state.meta.seed) || 0,
      payload.encounterId,
      shape.id,
      'authored-encounter',
    ));
    const item = resolveEncounter(
      shape,
      zone,
      payload.sectorId,
      Math.floor((state.simTime || 0) / DAY_SECONDS),
      0,
      rng,
    );
    if (!item) return { ok: false, reason: 'empty_plan' };
    item.encounterId = payload.encounterId;
    item.squadId = payload.encounterId;
    item.sectorId = payload.sectorId;
    item.zoneCenter = { x: anchor.x, z: anchor.z };
    item.zoneRadius = zone.radius;
    item.data = payload.data && typeof payload.data === 'object' ? { ...payload.data } : {};
    if (!this._spawnAdmissionAvailable(item, shape)) return { ok: false, reason: 'spawn_cap' };
    this._fire(dir, state, item, shape, state.simTime || 0);
    return dir.live[payload.encounterId]
      ? { ok: true, encounterId: payload.encounterId }
      : { ok: false, reason: 'resolved_on_fire' };
  },

  /** Materialize a claim-owned defense contract at its exact physical anchor. This bypasses the
   * ambient planner but still uses the normal director spawn budget, causality, doctrine, ROE,
   * telegraph, resolution, and receipt machinery. The durable id makes retries/save recovery
   * idempotent. */
  requestClaimDefense(payload) {
    if (!payload || !payload.encounterId || !payload.claimId || !payload.anchor) {
      return { ok: false, reason: 'invalid_request' };
    }
    const state = this.state;
    const dir = ensureDirectorState(state);
    if (dir.live[payload.encounterId]) {
      return { ok: true, encounterId: payload.encounterId, reused: true };
    }
    if (this._currentSectorId() !== payload.sectorId) return { ok: false, reason: 'wrong_sector' };
    const shape = ENCOUNTERS.claim_threat;
    if (!shape) return { ok: false, reason: 'missing_shape' };
    const body = ((state.claims && state.claims.bodies) || []).find((entry) => entry && entry.id === payload.claimId);
    if (!body || body.sectorId !== payload.sectorId) return { ok: false, reason: 'missing_claim' };

    const local = globalToSectorLocalForSector(payload.anchor, payload.sectorId);
    const rng = mulberry32(hash32((state.meta && state.meta.seed) || 0, payload.encounterId, 'claim-defense'));
    const zone = {
      id: `claim-defense:${payload.claimId}`,
      name: body.name || 'Player claim',
      type: 'mining_belt',
      center: { x: local.x, z: local.z },
      radius: 760,
      threat: 2,
    };
    const item = resolveEncounter(shape, zone, payload.sectorId, Math.floor((state.simTime || 0) / DAY_SECONDS), 0, rng);
    if (!item || !item.ships.length) return { ok: false, reason: 'empty_plan' };
    item.encounterId = payload.encounterId;
    item.squadId = payload.encounterId;
    item.sectorId = payload.sectorId;
    item.zoneCenter = { x: payload.anchor.x, z: payload.anchor.z };
    item.zoneRadius = zone.radius;
    item.motive = payload.motive || 'Stored freight drew a stripping crew.';
    item.engagementTrigger = 'claim_defense_arrival';
    item.data = {
      claimId: payload.claimId,
      defenseId: payload.defenseId || null,
      attackerName: payload.attackerName || 'Reach scavengers',
      requestedCount: Math.max(1, Math.min(6, Math.round(payload.attackerCount || 2))),
      resumed: !!payload.resume,
    };
    const base = item.ships.slice();
    const count = item.data.requestedCount;
    const anchorShip = base.find((ship) => ship.compositionRole === 'identity_anchor') || base[0];
    const lightShips = base.filter((ship) => ship !== anchorShip
      && ship.compositionRole !== 'identity_anchor');
    const lightPool = lightShips.length ? lightShips : [anchorShip];
    item.ships = [];
    for (let i = 0; i < count; i++) {
      const source = i === 0 ? anchorShip : lightPool[(i - 1) % lightPool.length];
      const angle = (Math.PI * 2 * i / count) + rng() * 0.24;
      const radius = 560 + rng() * 120;
      item.ships.push({
        ...source,
        compositionRole: i === 0 ? 'identity_anchor' : 'light',
        passive: true,
        pos: {
          x: payload.anchor.x + Math.cos(angle) * radius,
          z: payload.anchor.z + Math.sin(angle) * radius,
        },
      });
    }
    if (!this._spawnAdmissionAvailable(item, shape)) return { ok: false, reason: 'spawn_cap' };
    this._fire(dir, state, item, shape, state.simTime || 0);
    return dir.live[payload.encounterId]
      ? { ok: true, encounterId: payload.encounterId }
      : { ok: false, reason: 'spawn_failed' };
  },

  _fire(dir, state, item, shape, now) {
    dir.pressure[shape.deck] = Math.max(0, dir.pressure[shape.deck] - shape.pressureCost);
    dir.window.push({ t: now, tier: shape.tier });
    if (shape.tier === 'ambient') dir.lastAmbientAt = now;
    else dir.lastMeaningfulAt = now;
    if (shape.tier === 'major') dir.lastMajorAt = now;

    const live = makeEncounterLiveRecord(state, item, shape, now);
    dir.live[live.id] = live;
    dir.stats.fired++;
    if (live.data.ceresActivityAmbush === true) {
      dir.stats.ceresActivityAmbush = { phase: 'revealed' };
    }
    this.emit('encounter:telegraph', {
      encounterId: live.id, kind: live.shapeId, tier: live.tier, deck: live.deck,
      sectorId: live.sectorId, zoneId: live.zoneId, zoneName: live.zoneName,
      pos: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : null,
      causality: { ...live.causality },
    });
    const script = encounterScriptFor(live);
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
        fingerprint: live.causality.fingerprint,
        motiveId: live.causality.motiveId,
      });
    }
  },

  _tickLive(dir, state, now) {
    const keys = Object.keys(dir.live);
    for (const id of keys) {
      const live = dir.live[id];
      if (!live || live.phase === 'done') continue;
      const script = encounterScriptFor(live);
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
    try {
      for (let i = 0; i < ships.length && spawned.length < grant; i++) {
        const sh = ships[i];
        // Most encounters materialize an enemy archetype. A self-registered encounter may instead
        // provide a complete ship spec when its identity is the mechanic (H8 mirrors the player's
        // current hull). The spec still passes through the same budget, doctrine, causality, and
        // live-id ownership below; it only avoids briefly spawning the wrong hull identity.
        const spec = sh.entitySpec && sh.entitySpec.type === 'ship'
          ? sh.entitySpec
          : makeEnemySpawnSpec(sh.archetype, sh.level, sh.pos, {
              factionId: sh.factionId,
              startedTick: this.state.tick,
            });
        if (sh.team != null) spec.team = sh.team;
        if (sh.hullFrac != null) spec.hull = Math.max(1, Math.round(spec.hullMax * sh.hullFrac));
        spec.data = spec.data || {};
        spec.data.ai = spec.data.ai || {};
        const ai = spec.data.ai;
        ai.squadId = typeof sh.squadId === 'string' && sh.squadId
          ? sh.squadId
          : live.squadId;
        ai.doctrine = sh.doctrine || ai.doctrine;
        if (sh.combatDoctrineId) ai.combatDoctrineId = sh.combatDoctrineId;
        if (sh.formation) ai.formation = sh.formation;
        if (sh.factionPresenceDoctrine) {
          ai.factionPresenceDoctrine = {
            ...sh.factionPresenceDoctrine,
            firstFireAgainst: Array.isArray(sh.factionPresenceDoctrine.firstFireAgainst)
              ? sh.factionPresenceDoctrine.firstFireAgainst.slice()
              : [],
          };
        }
        if (sh.cultureId) {
          ai.cultureId = sh.cultureId;
          spec.data.cultureId = sh.cultureId;
        }
        if (sh.namedAceId) {
          ai.namedAceId = sh.namedAceId;
          spec.data.namedAceId = sh.namedAceId;
        }
        ai.spawnContext = sh.context;
        ai.sectorId = live.sectorId;
        ai.zoneId = live.zoneId;
        ai.zoneName = live.zoneName;
        ai.encounterId = live.id;
        ai.encounterKind = live.shapeId;
        if (sh.compositionRole) ai.encounterCompositionRole = sh.compositionRole;
        ai.motive = String(live.plan.motive || live.shape.motive || ai.motive || 'assigned_interdiction');
        ai.engagementTrigger = String(live.plan.engagementTrigger || live.shape.engagementTrigger
          || ai.engagementTrigger || 'authorized_hostile_spawn');
        spec.data.encounterFingerprint = live.causality && live.causality.fingerprint || null;
        spec.data.encounterCausality = live.causality ? { ...live.causality } : null;
        if (sh.role) ai.encounterRole = sh.role;
        if (sh.passive != null) ai.passive = !!sh.passive;
        ai.activity = activityForEncounterSpawn(live, sh, { now: this.now() });
        ai.roe = roeForActivity(ai.activity, sh.roe);
        if (sh.bossName) { ai.name = sh.bossName; spec.data.encounterBoss = true; }
        if (sh.bountyCr != null) spec.data.bountyCr = sh.bountyCr;
        if (sh.scanLabel) spec.data.scanLabel = sh.scanLabel;
        if (sh.fleeCargo && typeof sh.fleeCargo.commodityId === 'string') {
          const qty = Math.max(0, Math.floor(Number(sh.fleeCargo.qty) || 0));
          if (qty > 0) spec.data.fleeCargo = {
            commodityId: sh.fleeCargo.commodityId,
            qty,
            dumped: false,
          };
        }
        const ent = spawnEntity(spec);
        if (ent && ent.id != null) {
          spawned.push(ent.id);
          rec.ids.push(ent.id);
          live.ids.push(ent.id);
          live.roles[ent.id] = sh.role || 'squad';
        }
      }
    } finally {
      if (budget && typeof budget.releaseSome === 'function' && spawned.length < grant) {
        budget.releaseSome(live.squadId, grant - spawned.length);
      }
      if (!rec.ids.length) delete dir.active[live.squadId];
    }
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
        storyPropKind: opts.storyPropKind || null,
      },
    });
  },

  spawnProp(live, opts) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || !opts || !opts.pos) return null;
    return spawnEntity({
      type: opts.type || 'beacon',
      pos: { x: opts.pos.x, z: opts.pos.z },
      vel: { x: 0, z: 0 },
      radius: Math.max(2, Number(opts.radius) || 6),
      mass: Math.max(1, Number(opts.mass) || 1e6),
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: opts.scanLabel || 'Encounter signal',
        encounterId: live.id,
        storyPropKind: opts.storyPropKind || null,
        assetRef: opts.assetRef || null,
        tetherable: opts.tetherable !== false,
      },
    });
  },

  /** Physical manifest cargo uses the ordinary pickup contract. Cargo remains the sole player-hold
   * writer; the director only owns the encounter annotation and observes pickup:collected. */
  spawnFreightPickup(live, opts) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const qty = Math.max(0, Math.floor(Number(opts && opts.qty) || 0));
    if (typeof spawnEntity !== 'function' || !live || !opts || !opts.pos || !opts.commodityId || qty <= 0) return null;
    const physical = freightPickupPhysicalSpec(String(opts.commodityId), qty);
    const entity = spawnEntity({
      type: 'pickup',
      pos: { x: Number(opts.pos.x) || 0, z: Number(opts.pos.z) || 0 },
      vel: { x: Number(opts.vel && opts.vel.x) || 0, z: Number(opts.vel && opts.vel.z) || 0 },
      radius: physical.radius,
      mass: physical.bodyMass,
      collides: true,
      flags: { persistent: true },
      data: {
        kind: 'cargo',
        commodityId: String(opts.commodityId),
        amount: qty,
        despawnAt: this.now() + Math.max(10, Number(opts.ttlS) || 90),
        encounterId: live.id,
        freightCustodyPod: { ...(opts.custody || {}), qty },
        freightCargoPhysics: physical,
      },
    });
    if (!entity || entity.id == null) return null;
    live.ids.push(entity.id);
    live.roles[entity.id] = 'freight_pod';
    return entity;
  },

  resizeFreightPickup(entity, commodityId, qty) {
    const amount = Math.max(0, Math.floor(Number(qty) || 0));
    if (!entity || entity.type !== 'pickup' || amount <= 0) return false;
    const physical = freightPickupPhysicalSpec(String(commodityId || ''), amount);
    entity.mass = physical.bodyMass;
    entity.radius = physical.radius;
    const data = entity.data || (entity.data = {});
    data.amount = amount;
    data.freightCargoPhysics = physical;
    return true;
  },

  /** Report the first player seizure from this exact civilian custody chain to the law owner.
   * The director supplies stable provenance and a canonical world point; lawSecurity alone decides
   * jurisdiction/witnesses, and heat alone consumes an accepted receipt. */
  reportFreightTheft(live, record, pod, entity) {
    if (!live || !record || !pod || !entity || record.terminal
      || record.lawTheftIncidentReceiptId
      || record.legalOwnerKind !== 'civilian'
      || typeof record.legalOwnerStableId !== 'string' || !record.legalOwnerStableId
      || record.carrierRecovered === true
      || pod.custodySourceKind !== 'lawful_carrier'
      || pod.sourceCustodianStableId !== record.carrierIdentityKey
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return null;
    const law = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('lawSecurity')
      : null;
    if (!law || typeof law.reportIncident !== 'function') return null;

    const causalTick = Number.isInteger(this.state && this.state.tick)
      ? Math.max(0, this.state.tick)
      : 0;
    const reportId = `freight:${hash32(
      record.custodyId,
      record.legalOwnerStableId,
      FREIGHT_THEFT_OFFENDER_STABLE_ID,
    ).toString(36)}:${FREIGHT_THEFT_LAW_KIND}`;
    const receipt = law.reportIncident({
      reportId,
      kind: FREIGHT_THEFT_LAW_KIND,
      offenderStableId: FREIGHT_THEFT_OFFENDER_STABLE_ID,
      offenderEntityId: this.state && this.state.playerId,
      payloadStableId: record.manifestId,
      causalTick,
      pos: { x: entity.pos.x, z: entity.pos.z },
    });
    if (!receipt || receipt.accepted !== true) return receipt || null;
    record.lawTheftReportId = reportId;
    record.lawTheftCausalTick = causalTick;
    record.lawTheftIncidentReceiptId = receipt.incidentReceiptId;
    return receipt;
  },

  persistOpenFreightCustody(live, record) {
    const dir = ensureDirectorState(this.state);
    if (!record || record.terminal) return this.clearOpenFreightCustody(record && record.custodyId);
    const envelope = buildPersistedFreightCustodyEnvelope(live, record, this.now());
    if (!envelope) return false;
    const envelopes = normalizePersistedFreightCustodies(dir.stats.openFreightCustodies)
      .filter((candidate) => candidate.custodyId !== envelope.custodyId);
    envelopes.push(envelope);
    dir.stats.openFreightCustodies = envelopes.slice(-FREIGHT_CUSTODY_SAVE_CAP);
    return true;
  },

  clearOpenFreightCustody(custodyId) {
    if (typeof custodyId !== 'string' || !custodyId) return false;
    const dir = ensureDirectorState(this.state);
    const before = normalizePersistedFreightCustodies(dir.stats.openFreightCustodies);
    const after = before.filter((candidate) => candidate.custodyId !== custodyId);
    dir.stats.openFreightCustodies = after;
    return after.length !== before.length;
  },

  retireFreightPickup(entity, reason) {
    if (!entity || entity.type !== 'pickup') return false;
    const data = entity.data || (entity.data = {});
    const pod = data.freightCustodyPod;
    if (!pod || typeof pod !== 'object') return false;
    pod.status = reason || 'retired';
    data.despawnAt = this.now();
    entity.collides = false;
    if (entity.flags) delete entity.flags.persistent;
    return true;
  },

  preserveWorldActor(live, entity) {
    if (!live || !entity || entity.id == null) return false;
    const ids = Array.isArray(live.data?.preservedWorldActorIds)
      ? live.data.preservedWorldActorIds
      : (live.data.preservedWorldActorIds = []);
    if (!ids.includes(entity.id)) ids.push(entity.id);
    const snapshots = live.data.preservedWorldActorSnapshots
      || (live.data.preservedWorldActorSnapshots = {});
    if (!snapshots[entity.id]) snapshots[entity.id] = capturePreservedWorldActor(entity);
    return true;
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
      const spawn = {
        role: live.roles && live.roles[e.id],
        pos: e.pos,
        passive: !!passive,
      };
      if (!passive && live.data && live.data.ceresActivityAmbush === true) {
        const player = this.player();
        if (player && player.id != null) spawn.targetId = player.id;
      }
      const nextActivity = activityForEncounterSpawn(live, spawn, { now: this.now(), passive: !!passive });
      // The offer phase is already the player's authored no-fire response window. Preserve its
      // start tick when the squad springs so fast craft do not spend their whole first attack pass
      // waiting through a second, invisible response timer.
      const activity = !passive && ai.activity && Number.isInteger(ai.activity.startedTick)
        ? { ...nextActivity, startedTick: ai.activity.startedTick }
        : nextActivity;
      setEntityDoctrine(e, { activity });
      if (live.data && live.data.ceresActivityAmbush === true) {
        ai[CERES_ACTIVITY_AMBUSH_MARKER] = passive ? 'offer' : 'conflict';
      }
      if (!passive && e.data.intent) { e.data.intent.moveX = 0; e.data.intent.moveZ = 0; e.data.intent.fire = false; }
    }
  },
  clearPredation(live, reason) {
    return clearPredationBindingsForLive(this.state, live, reason || 'objective_cleared');
  },
  despawnAll(live, afterS, role) {
    if (live && live.data && live.data.adoptedWorldActors === true) return;
    const now = this.now();
    const preserved = new Set(Array.isArray(live?.data?.preservedWorldActorIds)
      ? live.data.preservedWorldActorIds
      : []);
    let i = 0;
    for (const e of this.entsOf(live, role || undefined)) {
      if (preserved.has(e.id)) continue;
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
      encounterId: live.id, kind: live.shapeId, title: live.shape.title || live.zoneName || live.shapeId,
      options, deadlineAt,
      timeoutChoice: timeoutChoice || live.shape.timeoutChoice || null,
    });
  },

  // Offer consumption semantics for encounter:choose:
  // - An offer dispatches at most ONE accepted choice for its lifetime (single-shot),
  //   regardless of which non-terminal phase the handler moved to.
  // - An unknown choiceId for a shape that HAS choices is ignored and does NOT
  //   consume the offer (garbage input cannot burn the player's choice) — this
  //   preserves current behavior for invalid ids.
  // - A shape with NO choices consumes on first dispatch.
  // - `offerConsumed` is a plain serializable field on the live record.
  // - Handler-internal direct calls (timeoutChoice -> script.choose) are NOT
  //   routed through _onChoose and are unaffected.
  _onChoose(p) {
    if (!p || !p.encounterId) return;
    const dir = ensureDirectorState(this.state);
    const live = dir.live[p.encounterId];
    if (!live || live.phase === 'done') return;
    if (live.offerConsumed) return;
    const script = encounterScriptFor(live);
    if (!script || typeof script.choose !== 'function') return;
    const choices = live.shape && Array.isArray(live.shape.choices) ? live.shape.choices : [];
    if (choices.length && !choices.some((c) => c && c.id === p.choiceId)) return;
    live.offerConsumed = true;
    this._recordPlayerChoiceLine(live, p.choiceId);
    script.choose(this, live, this.state, p.choiceId);
  },

  _recordPlayerChoiceLine(live, choiceId) {
    const choice = ((live.shape && live.shape.choices) || []).find((entry) => entry && entry.id === choiceId);
    const line = choice && typeof choice.playerLine === 'string' ? choice.playerLine.trim() : '';
    if (!line) return;
    const story = this.state.story || (this.state.story = { flags: {} });
    const lines = Array.isArray(story.playerChoiceLines) ? story.playerChoiceLines : (story.playerChoiceLines = []);
    lines.push(line);
    if (lines.length > 24) lines.splice(0, lines.length - 24);
    this.emit('story:playerChoiceRecorded', {
      encounterId: live.id, shapeId: live.shapeId, choiceId, line, t: this.now(),
    });
  },

  // ── outcomes / receipts ─────────────────────────────────────────────────────────────────────
  resolve(live, outcome, o) {
    o = o || {};
    const dir = ensureDirectorState(this.state);
    if (!dir.live[live.id] || live.phase === 'done') return;
    const now = this.now();
    live.phase = 'done';
    live.outcome = outcome;
    clearPredationBindingsForLive(this.state, live, `encounter_${outcome}`);
    const resolvedIdentity = resolvedEncounterFingerprint(live.causality, outcome);
    const resolvedCausality = {
      ...live.causality,
      resolvedFingerprint: resolvedIdentity && resolvedIdentity.fingerprint || null,
      resolvedTuple: resolvedIdentity && resolvedIdentity.tuple || null,
    };
    live.causality = resolvedCausality;
    const recentFingerprints = dir.stats.recentFingerprints || (dir.stats.recentFingerprints = []);
    const recentVarietyKeys = dir.stats.recentVarietyKeys || (dir.stats.recentVarietyKeys = []);
    if (resolvedCausality.resolvedFingerprint) recentFingerprints.push(resolvedCausality.resolvedFingerprint);
    if (resolvedCausality.varietyKey) recentVarietyKeys.push(resolvedCausality.varietyKey);
    if (recentFingerprints.length > 12) recentFingerprints.splice(0, recentFingerprints.length - 12);
    if (recentVarietyKeys.length > 12) recentVarietyKeys.splice(0, recentVarietyKeys.length - 12);
    dir.cooldowns[live.shapeId] = now + (live.shape.cooldownS || 300);
    dir.lastEndAt = now;
    dir.stats.resolved++;
    // Stragglers spawned by the director give up rather than chain-hunting the player past the
    // encounter's end. Adopted durable world actors return to world ownership instead.
    if (live.data && live.data.adoptedWorldActors === true) {
      restoreCeresActivityAmbushEntities(this.state, live.data);
      dir.stats.ceresActivityAmbush = { phase: 'done', outcome };
    } else {
      const preserved = new Set(Array.isArray(live.data?.preservedWorldActorIds)
        ? live.data.preservedWorldActorIds
        : []);
      for (const e of this.entsOf(live)) {
        if (preserved.has(e.id)) continue;
        if (!e.data || e.data.despawnAt == null) { e.data = e.data || {}; e.data.despawnAt = now + 45; }
      }
      restorePreservedWorldActors(this.state, live.data);
    }
    this.emit('encounter:resolved', {
      encounterId: live.id, shape: live.shapeId, kind: (live.plan && live.plan.variantKind) || live.shapeId,
      outcome, sectorId: live.sectorId, zoneId: live.zoneId, tier: live.tier, deck: live.deck, t: now,
      causality: live.causality ? { ...live.causality } : null,
    });
    this.emit('encounter:fingerprint', {
      encounterId: live.id,
      fingerprint: resolvedCausality.resolvedFingerprint,
      tuple: resolvedCausality.resolvedTuple,
      instanceFingerprint: resolvedCausality.fingerprint,
      t: now,
    });
    const text = (live.shape.receipts && live.shape.receipts[outcome])
      || receiptText(live.shapeId, outcome, o.vars || live.vars);
    if (text && o.speak !== false) {
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') voice.say({ channel: o.channel || 'info', text, kind: 'receipt' });
      else this.emit('toast', { text, kind: 'info', ttl: 5 });
      this.emit('encounter:receipt', {
        encounterId: live.id, shape: live.shapeId, outcome, text, t: now,
        fingerprint: live.causality && live.causality.fingerprint || null,
        motiveId: live.causality && live.causality.motiveId || null,
      });
      dir.receipts.push({
        t: now, shape: live.shapeId, outcome, text,
        fingerprint: live.causality && live.causality.fingerprint || null,
        motiveId: live.causality && live.causality.motiveId || null,
      });
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
    clearPredationBindingsForLive(this.state, live, `encounter_aborted:${reason}`);
    dir.stats.fizzled++;
    dir.cooldowns[live.shapeId] = Math.max(dir.cooldowns[live.shapeId] || 0, now + 60);
    dir.pressure[live.deck] = Math.min(POOL_MAX, dir.pressure[live.deck] + (live.shape.pressureCost || 0)); // it never happened
    if (live.data && live.data.adoptedWorldActors === true) {
      restoreCeresActivityAmbushEntities(this.state, live.data);
      dir.stats.ceresActivityAmbush = { phase: 'done', outcome: live.outcome };
    } else {
      this.despawnAll(live, 4);
      restorePreservedWorldActors(this.state, live.data);
    }
    this.emit('encounter:resolved', {
      encounterId: live.id, shape: live.shapeId, kind: live.shapeId, outcome: live.outcome,
      sectorId: live.sectorId, zoneId: live.zoneId, tier: live.tier, deck: live.deck, t: now,
      causality: live.causality ? { ...live.causality } : null,
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
  freightLoss(live, options = {}) {
    if (!live || !live.id || !live.data) return false;
    const manifest = options.manifest || live.data.freightManifest;
    if (!manifest || !Array.isArray(manifest.lines) || !manifest.lines.length) return false;

    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = String(options.freighterKey || `encounter:${live.id}`);
    const intent = buildLossIntent({
      seed,
      freighterKey,
      stationId: options.stationId != null ? options.stationId : live.data.destId,
      sectorId: options.sectorId != null ? options.sectorId : live.sectorId,
      manifest,
      killerId: options.killerId != null ? options.killerId : live.data.lossKillerId,
      // Encounter identity is already unique and deterministic. Keeping the sequence fixed makes
      // the same terminal consequence stable across repeated ticks and Continue/replay.
      seq: 0,
    });
    const hasDestination = typeof intent.stationId === 'string' && intent.stationId.trim().length > 0;
    const routablePressures = (intent.pressures || []).map((pressure) => ({
      pressure,
      boundedVol: pressure && Number.isFinite(pressure.vol)
        ? Math.max(-12, Math.min(12, Math.round(pressure.vol)))
        : 0,
    })).filter(({ pressure, boundedVol }) => (
      pressure
      && typeof pressure.stationId === 'string'
      && pressure.stationId.trim().length > 0
      && typeof pressure.good === 'string'
      && pressure.good.length > 0
      && boundedVol < 0
    ));
    // Do not consume the stable identity until a real economy-owner route exists. A stationless
    // transient may acquire its destination later and must remain retryable without false news.
    if (!hasDestination || !routablePressures.length) return false;
    const dir = ensureDirectorState(this.state);
    // saveSystem already persists the director stats bag, so this bounded causal ledger survives
    // Continue without making transient live encounter/entity references durable.
    const applied = dir.stats.appliedFreightLossIds;
    const fresh = filterNewFreightIntents([intent], applied);
    if (!fresh.length) return false;

    // Reserve before emitting because bus handlers are synchronous and may re-enter the facade.
    dir.stats.appliedFreightLossIds = appendAppliedFreightLossIds(applied, intent.intentId, 64);
    live.data.freightLossIntentId = intent.intentId;
    for (const { pressure, boundedVol } of routablePressures) {
      this.emit('economy:applyTradePressure', {
        ...pressure,
        stationId: pressure.stationId,
        good: pressure.good,
        commodityId: pressure.commodityId || pressure.good,
        vol: boundedVol,
        intentId: intent.intentId,
        encounterId: live.id,
      });
    }
    this.emit('freight:loss', { ...intent, encounterId: live.id });
    return true;
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
      const liveIndex = live.ids.indexOf(id);
      if (!this._saveRestoring && live.script === 'convoy' && liveIndex !== -1) {
        this._scriptEvent(live, 'entityGone', { ...(p || {}), id });
      }
      if (!this._saveRestoring && liveIndex !== -1 && SELF_REGISTERED_RUNTIME_BY_ID.has(live.shapeId)) {
        this._scriptEvent(live, 'entityGone', { ...(p || {}), id });
      }
      if (live.script === 'salvageSignal' && live.data && live.data.cacheId === id) {
        this._scriptEvent(live, 'cacheGone', { id });
      }
      if (liveIndex !== -1) {
        for (let index = live.ids.length - 1; index >= 0; index--) {
          if (live.ids[index] === id) live.ids.splice(index, 1);
        }
        if (live.roles && typeof live.roles === 'object') delete live.roles[id];
      }
    }
  },

  _onEntityKilled(p) {
    if (!p || p.id == null) return;
    const dir = ensureDirectorState(this.state);
    const byPlayer = p.killerId != null && p.killerId === this.state.playerId;
    const externalCaptainId = dir.externalNamed && dir.externalNamed[p.id];
    if (externalCaptainId) {
      const named = dir.named[externalCaptainId] || (dir.named[externalCaptainId] = {});
      named.alive = false;
      named.lastSeenSector = this._currentSectorId();
      named.kills = (named.kills || 0) + (byPlayer ? 0 : 1);
      delete dir.externalNamed[p.id];
      this.emit('encounter:namedCaptainDefeated', { captainId: externalCaptainId, entityId: p.id, byPlayer });
    }
    let handled = null;
    for (const lid of Object.keys(dir.live)) {
      const live = dir.live[lid];
      const role = live.roles[p.id];
      if (role !== undefined && live.ids.includes(p.id)) {
        handled = live;
        this._scriptEvent(live, 'squadKill', { id: p.id, role, byPlayer, killerId: p.killerId });
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

  _onExternalNamedBound(p) {
    if (!p || !p.captainId || p.entityId == null) return;
    const dir = ensureDirectorState(this.state);
    const named = dir.named[p.captainId] || (dir.named[p.captainId] = { alive: true, tier: 0, escapes: 0, kills: 0, lastSeenSector: null });
    if (named.alive === false) return;
    named.lastSeenSector = p.sectorId || this._currentSectorId();
    dir.externalNamed[p.entityId] = p.captainId;
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

  _routeToSelfRegistered(eventName, payload) {
    const dir = ensureDirectorState(this.state);
    for (const live of Object.values(dir.live)) {
      if (SELF_REGISTERED_RUNTIME_BY_ID.has(live.shapeId)) this._scriptEvent(live, eventName, payload);
    }
  },

  _rememberPoiVisit(payload) {
    const poiId = payload && payload.poiId;
    if (!poiId || !this.state) return;
    const story = this.state.story || (this.state.story = { flags: {} });
    const visits = story.depthProgramPoiVisits || (story.depthProgramPoiVisits = {});
    if (!visits[poiId]) {
      visits[poiId] = {
        firstSeenAt: this.state.simTime || 0,
        firstSeenTick: this.state.tick | 0,
        sectorId: this._currentSectorId(),
      };
    }
  },

  _scriptEvent(live, name, payload) {
    if (!live || live.phase === 'done') return;
    const script = encounterScriptFor(live);
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

  _onResonanceScan(payload) {
    const sectorId = payload && payload.sectorId;
    const poiId = payload && payload.poiId;
    if (!isResonanceObeliskSignal(sectorId, poiId) || this._currentSectorId() !== sectorId) return false;
    const shape = ENCOUNTERS[RESONANCE_OBELISK.patrolShapeId];
    const zone = zonesForSector(sectorId).find((entry) => entry.id === RESONANCE_OBELISK.zoneId);
    if (!shape || !zone || !encounterScriptFor(shape)) return false;

    const response = resonanceObeliskResponse(payload.scanCount);
    const dir = ensureDirectorState(this.state);
    const now = Number(this.state.simTime) || 0;
    const live = Object.values(dir.live).find((entry) => entry && entry.shapeId === shape.id);
    if (live) return false; // one physical watch at a time; scans never multiply an active squad

    const dueAt = now + response.patrolIntervalS;
    const pending = dir.pending.find((entry) => entry && entry.shapeId === shape.id);
    if (pending) {
      pending.dueAt = Math.min(Number(pending.dueAt) || dueAt, dueAt);
      pending.data = { ...(pending.data || {}), ...response };
      return true;
    }

    const rng = mulberry32(hash32(
      this.state.meta && this.state.meta.seed || 0,
      sectorId,
      response.scanCount,
      'resonance-obelisk-patrol',
    ));
    const item = resolveEncounter(
      shape,
      zone,
      sectorId,
      Math.floor(now / DAY_SECONDS),
      response.scanCount,
      rng,
    );
    if (!item || !item.ships.length) return false;
    item.encounterId = `resonance-patrol:${sectorId}:${response.scanCount}`;
    item.squadId = item.encounterId;
    item.dueAt = dueAt;
    item.defers = 0;
    item.data = { ...response, poiId };
    dir.pending.push(item);
    this.emit('resonance:patrolQueued', {
      encounterId: item.encounterId,
      sectorId,
      zoneId: zone.id,
      dueAt,
      ...response,
    });
    return true;
  },

  _ceresActivityAmbushCohort() {
    const list = this.state && this.state.entityList;
    if (!Array.isArray(list)) return [];
    return list.filter((entity) => {
      if (!entity || entity.alive === false || entity.type !== 'ship') return false;
      const data = entity.data;
      const ai = data && data.ai;
      return !!(ai
        && ai.zoneId === CERES_ACTIVITY_AMBUSH_ZONE_ID
        && ai.squadId === CERES_ACTIVITY_AMBUSH_ZONE_ID
        && typeof data.worldRecordId === 'string'
        && data.worldRecordId.length > 0);
    });
  },

  _seedCeresActivityAmbush(sectorId, options = {}) {
    const dir = ensureDirectorState(this.state);
    if (sectorId !== CERES_ACTIVITY_SECTOR_ID) {
      dir._ceresActivityAmbush = null;
      return false;
    }
    const cohort = this._ceresActivityAmbushCohort();
    if (!cohort.length) {
      dir._ceresActivityAmbush = null;
      return false;
    }

    // The durable zone squad replaces only the same-zone generic ambush candidate. Other Ceres
    // ambushes and every non-Ceres planner row retain their ordinary seeded schedule.
    dir.pending = dir.pending.filter((item) => !(item
      && item.shapeId === 'ambush_snare'
      && item.zoneId === CERES_ACTIVITY_AMBUSH_ZONE_ID
      && !(item.data && item.data.ceresActivityAmbush === true)));

    const durable = dir.stats.ceresActivityAmbush;
    const phase = durable && durable.phase;
    if (phase === 'done') {
      for (const entity of cohort) clearCeresActivityAmbushMarker(entity);
      dir._ceresActivityAmbush = null;
      return false;
    }
    if (phase === 'revealed') {
      const marked = cohort.filter((entity) => {
        const marker = entity.data && entity.data.ai && entity.data.ai[CERES_ACTIVITY_AMBUSH_MARKER];
        return marker === 'offer' || marker === 'conflict';
      });
      if (marked.length) return this._resumeCeresActivityAmbush(marked);
      dir._ceresActivityAmbush = null;
      return false;
    }

    const player = this.player();
    const sampler = {
      lastPos: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      restoreByRecordId: Object.create(null),
    };
    dir._ceresActivityAmbush = sampler;
    for (const entity of cohort) parkCeresActivityAmbushEntity(entity, sampler, this.now());

    if (phase === 'queued') this._queueCeresActivityAmbush({ preservePhase: true });
    return true;
  },

  _sampleCeresActivityAmbush(dir, state) {
    if (this._currentSectorId() !== CERES_ACTIVITY_SECTOR_ID) return;
    const durable = dir.stats.ceresActivityAmbush;
    if (durable && durable.phase) return;
    const sampler = dir._ceresActivityAmbush;
    const player = this.player();
    if (!sampler || !player || !player.pos) return;
    const current = { x: player.pos.x, z: player.pos.z };
    if (!sampler.lastPos) {
      sampler.lastPos = current;
      return;
    }
    const previous = sampler.lastPos;
    sampler.lastPos = current;
    if (previous.x === current.x && previous.z === current.z) return;
    const anchor = ceresActivityAmbushAnchorGlobal();
    if (!segmentCrossesCeresAmbushBand(previous, current, anchor)) return;
    this._queueCeresActivityAmbush();
  },

  _queueCeresActivityAmbush(options = {}) {
    const dir = ensureDirectorState(this.state);
    if (dir.live[CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID]) return true;
    if (dir.pending.some((item) => item && item.encounterId === CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID)) return true;
    if (!this._ceresActivityAmbushCohort().length) return false;
    const item = makeCeresActivityAmbushItem(this.state, this.now());
    if (!item) return false;
    dir.pending.push(item);
    if (!options.preservePhase) dir.stats.ceresActivityAmbush = { phase: 'queued' };
    return true;
  },

  adoptCeresActivityAmbush(live, phase = 'offer') {
    if (!live || !(live.data && live.data.ceresActivityAmbush === true)) return [];
    const cohort = this._ceresActivityAmbushCohort();
    const sampler = ensureDirectorState(this.state)._ceresActivityAmbush;
    live.data.adoptedWorldActors = true;
    live.data.restoreByRecordId = sampler && sampler.restoreByRecordId
      ? sampler.restoreByRecordId
      : Object.create(null);
    live.ids = [];
    live.roles = {};
    for (const entity of cohort) {
      live.ids.push(entity.id);
      live.roles[entity.id] = 'squad';
      const ai = entity.data && entity.data.ai;
      if (ai) {
        const restore = ai[CERES_ACTIVITY_AMBUSH_RESTORE];
        if (restore && typeof restore === 'object' && !Array.isArray(restore)
          && !Object.prototype.hasOwnProperty.call(restore, 'moraleImmune')) {
          // Pre-repair saves already carry this restore object but not the morale field. At the
          // precise moment live adoption first claims morale ownership, the actor still carries its
          // authoritative absent/false/true value, so migrate that value before overwriting it.
          restore.moraleImmune = ownSnapshot(ai, 'moraleImmune');
        }
        // This exemption belongs only to the live authored encounter. Merely parked world actors
        // retain their prior morale contract; adoption/resume claims it until the existing restore
        // handoff returns the cohort to world ownership.
        ai.moraleImmune = true;
        ai[CERES_ACTIVITY_AMBUSH_MARKER] = phase;
      }
    }
    live.data.initialCount = live.ids.length;
    return live.ids.slice();
  },

  _resumeCeresActivityAmbush(cohort) {
    const dir = ensureDirectorState(this.state);
    if (dir.live[CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID]) return true;
    const item = makeCeresActivityAmbushItem(this.state, this.now());
    const shape = ENCOUNTERS.ambush_snare;
    if (!item || !shape) return false;
    const live = makeEncounterLiveRecord(this.state, item, shape, this.now());
    live.data.restored = true;
    dir.live[live.id] = live;
    const marker = cohort.some((entity) => (
      entity.data && entity.data.ai
      && entity.data.ai[CERES_ACTIVITY_AMBUSH_MARKER] === 'conflict'
    )) ? 'conflict' : 'offer';
    const script = encounterScriptFor(live);
    if (!script || typeof script.resume !== 'function') {
      delete dir.live[live.id];
      return false;
    }
    script.resume(this, live, this.state, marker);
    return !!dir.live[live.id];
  },

  _leaveCeresActivityAmbush() {
    const dir = ensureDirectorState(this.state);
    const live = dir.live[CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID];
    if (live) this.abort(live, 'sector_exit');
    else restoreCeresActivityAmbushEntities(this.state, dir._ceresActivityAmbush);
    dir.pending = dir.pending.filter((item) => item && item.encounterId !== CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID);
    dir._ceresActivityAmbush = null;
  },

  _currentSectorId() {
    const w = this.state && this.state.world;
    return (w && w.currentSectorId) || null;
  },
};

function ceresActivityAmbushAnchorGlobal() {
  return sectorLocalToGlobalForSector(ZONE_CERES_THROUGHLINE.center, CERES_ACTIVITY_SECTOR_ID);
}

function isCeresActivityAmbushItem(item) {
  return !!(item
    && item.encounterId === CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID
    && item.sectorId === CERES_ACTIVITY_SECTOR_ID
    && item.shapeId === 'ambush_snare'
    && item.zoneId === CERES_ACTIVITY_AMBUSH_ZONE_ID
    && item.data
    && item.data.ceresActivityAmbush === true);
}

function ceresAmbushRangeBand(pos, anchor) {
  const distance = Math.hypot(pos.x - anchor.x, pos.z - anchor.z);
  if (distance <= CERES_ACTIVITY_AMBUSH_INNER_R) return 'inner';
  if (distance <= CERES_ACTIVITY_AMBUSH_OUTER_R) return 'band';
  return 'outer';
}

function segmentCrossesCeresAmbushBand(previous, current, anchor) {
  if (ceresAmbushRangeBand(previous, anchor) !== ceresAmbushRangeBand(current, anchor)) return true;
  return segmentCrossesCircle(previous, current, anchor, CERES_ACTIVITY_AMBUSH_INNER_R)
    || segmentCrossesCircle(previous, current, anchor, CERES_ACTIVITY_AMBUSH_OUTER_R);
}

function segmentCrossesCircle(previous, current, center, radius) {
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const a = dx * dx + dz * dz;
  if (!(a > 0)) return false;
  const fx = previous.x - center.x;
  const fz = previous.z - center.z;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;
  const root = Math.sqrt(Math.max(0, discriminant));
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  return (t0 > 0 && t0 <= 1) || (t1 > 0 && t1 <= 1);
}

function makeCeresActivityAmbushItem(state, now) {
  const shape = ENCOUNTERS.ambush_snare;
  const sourceZone = zonesForSector(CERES_ACTIVITY_SECTOR_ID)
    .find((zone) => zone && zone.id === CERES_ACTIVITY_AMBUSH_ZONE_ID);
  if (!shape || !sourceZone) return null;
  const seed = state && state.meta && state.meta.seed || 0;
  const rng = mulberry32(hash32(seed, CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID, 'r5-authored-ambush'));
  const zone = {
    ...sourceZone,
    center: { x: ZONE_CERES_THROUGHLINE.center.x, z: ZONE_CERES_THROUGHLINE.center.z },
    radius: CERES_ACTIVITY_AMBUSH_OUTER_R,
  };
  const item = resolveEncounter(
    shape,
    zone,
    CERES_ACTIVITY_SECTOR_ID,
    Math.floor((now || 0) / DAY_SECONDS),
    0,
    rng,
  );
  if (!item) return null;
  item.encounterId = CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID;
  item.squadId = CERES_ACTIVITY_AMBUSH_ENCOUNTER_ID;
  item.sectorId = CERES_ACTIVITY_SECTOR_ID;
  item.ships = []; // durable zone actors are adopted; the director must never spawn a substitute
  item.dueAt = now || 0;
  item.defers = 0;
  item.data = { ceresActivityAmbush: true };
  return item;
}

function makeEncounterLiveRecord(state, item, shape, now) {
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
    data: item.data && typeof item.data === 'object' ? { ...item.data } : {},
    outcome: null,
    primarySaid: false,
    lastBarkAt: -1e9,
  };
  live.causality = buildEncounterCausality({
    seed: state.meta && state.meta.seed,
    encounterId: live.id,
    shapeId: live.shapeId,
    variantKind: item.variantKind || live.shapeId,
    sectorId: live.sectorId,
    zoneId: live.zoneId,
    zoneName: live.zoneName,
    factionId: live.factionId,
    doctrineId: item.ships && item.ships[0] && (item.ships[0].combatDoctrineId || item.ships[0].doctrine),
    zoneType: item.zoneType,
    script: live.script,
  });
  return live;
}

const PRESERVED_WORLD_DATA_FIELDS = Object.freeze([
  'bountyCr',
  'loot',
  'freightRewardOwner',
  'freightCustody',
  'freightCustodyCarrierIdentityKey',
  'freightCustodyPersistence',
  'predationEncounterId',
  'predationRole',
  'predationIdentityKey',
]);
const PRESERVED_WORLD_AI_FIELDS = Object.freeze([
  'encounterId',
  'encounterKind',
  'encounterRole',
  'sectorId',
  'zoneId',
  'zoneName',
]);

function capturePreservedWorldActor(entity) {
  const data = entity?.data || {};
  const ai = data.ai || {};
  return {
    entity,
    data: Object.fromEntries(PRESERVED_WORLD_DATA_FIELDS.map((key) => [key, ownSnapshot(data, key)])),
    ai: Object.fromEntries(PRESERVED_WORLD_AI_FIELDS.map((key) => [key, ownSnapshot(ai, key)])),
  };
}

function restorePreservedWorldActors(state, liveData) {
  const snapshots = liveData?.preservedWorldActorSnapshots;
  if (!snapshots || typeof snapshots !== 'object') return 0;
  let restored = 0;
  for (const [rawId, snapshot] of Object.entries(snapshots)) {
    const numericId = Number(rawId);
    const id = Number.isFinite(numericId) ? numericId : rawId;
    const entity = state?.entities?.get(id);
    if (!entity || entity !== snapshot?.entity || entity.alive === false) continue;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    for (const key of PRESERVED_WORLD_DATA_FIELDS) restoreSnapshot(data, key, snapshot.data?.[key]);
    for (const key of PRESERVED_WORLD_AI_FIELDS) restoreSnapshot(ai, key, snapshot.ai?.[key]);
    restored++;
  }
  return restored;
}

function ownSnapshot(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
    ? { had: true, value: object[key] }
    : { had: false, value: undefined };
}

function restoreSnapshot(object, key, snapshot) {
  if (snapshot && snapshot.had) object[key] = snapshot.value;
  else delete object[key];
}

function parkCeresActivityAmbushEntity(entity, sampler, now) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const recordId = data.worldRecordId;
  let snapshot = ai[CERES_ACTIVITY_AMBUSH_RESTORE];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    snapshot = {
      passive: ownSnapshot(ai, 'passive'),
      roe: ownSnapshot(ai, 'roe'),
      activity: ownSnapshot(ai, 'activity'),
      moraleImmune: ownSnapshot(ai, 'moraleImmune'),
      intentFire: data.intent ? ownSnapshot(data.intent, 'fire') : null,
      intentMoveX: data.intent ? ownSnapshot(data.intent, 'moveX') : null,
      intentMoveZ: data.intent ? ownSnapshot(data.intent, 'moveZ') : null,
    };
    ai[CERES_ACTIVITY_AMBUSH_RESTORE] = snapshot;
  }
  if (recordId && !sampler.restoreByRecordId[recordId]) sampler.restoreByRecordId[recordId] = snapshot;
  ai.passive = true;
  setEntityDoctrine(entity, {
    activity: {
      kind: ActivityKind.LOITER,
      reason: 'ceres_activity_ambush:armed',
      anchor: entity.pos,
      startedTick: Math.round((now || 0) * 60),
      routeId: CERES_ACTIVITY_AMBUSH_ZONE_ID,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
  ai[CERES_ACTIVITY_AMBUSH_MARKER] = 'armed';
  if (data.intent) data.intent.fire = false;
}

function restoreCeresActivityAmbushEntities(state, holder) {
  const list = state && state.entityList;
  if (!Array.isArray(list)) return;
  const restoreByRecordId = holder && holder.restoreByRecordId || Object.create(null);
  for (const entity of list) {
    if (!entity || !entity.data || !entity.data.ai) continue;
    const ai = entity.data.ai;
    if (!ai[CERES_ACTIVITY_AMBUSH_MARKER]) continue;
    const snapshot = restoreByRecordId[entity.data.worldRecordId]
      || ai[CERES_ACTIVITY_AMBUSH_RESTORE];
    if (snapshot) {
      restoreSnapshot(ai, 'passive', snapshot.passive);
      restoreSnapshot(ai, 'roe', snapshot.roe);
      restoreSnapshot(ai, 'activity', snapshot.activity);
      if (Object.prototype.hasOwnProperty.call(snapshot, 'moraleImmune')) {
        restoreSnapshot(ai, 'moraleImmune', snapshot.moraleImmune);
      }
      if (entity.data.intent && snapshot.intentFire) {
        restoreSnapshot(entity.data.intent, 'fire', snapshot.intentFire);
      }
      if (entity.data.intent && snapshot.intentMoveX) {
        restoreSnapshot(entity.data.intent, 'moveX', snapshot.intentMoveX);
      }
      if (entity.data.intent && snapshot.intentMoveZ) {
        restoreSnapshot(entity.data.intent, 'moveZ', snapshot.intentMoveZ);
      }
    } else {
      ai.passive = false;
      setEntityDoctrine(entity, {
        activity: {
          ...(ai.activity || {}),
          kind: ActivityKind.ATTACK_RUN,
          reason: 'zone_hostile:restored',
          anchor: entity.pos,
          encounterId: null,
        },
        roe: RulesOfEngagement.WEAPONS_FREE,
      });
    }
    delete ai[CERES_ACTIVITY_AMBUSH_MARKER];
    delete ai[CERES_ACTIVITY_AMBUSH_RESTORE];
  }
}

function clearCeresActivityAmbushMarker(entity) {
  const ai = entity && entity.data && entity.data.ai;
  if (ai) {
    delete ai[CERES_ACTIVITY_AMBUSH_MARKER];
    delete ai[CERES_ACTIVITY_AMBUSH_RESTORE];
  }
}

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
export function planEncounters(seed, sectorId, dayIndex, zones, ecologyState = null, encounterCatalog = ENCOUNTERS) {
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

  // Sector security for planner gates (e.g. pirate_toll.maxSecurity — no Reach tolls in Helios).
  const secDef = SECTORS.find((s) => s.id === sectorId);
  const baselineSecurity = secDef && Number.isFinite(secDef.security) ? secDef.security : 0.5;
  const sectorSecurity = ecologyState
    ? effectiveRegionalSecurity(ecologyState, sectorId, baselineSecurity)
    : baselineSecurity;

  let seq = 0;
  const scheduleTier = (tier, maxCount, delayLo, delaySpan) => {
    const candidates = Object.values(encounterCatalog || ENCOUNTERS).filter((e) => {
      const anchoredHere = e.anchorPoiId && secDef && Array.isArray(secDef.pois)
        && secDef.pois.some((poi) => poi.id === e.anchorPoiId && poi.pos);
      if (e.tier !== tier || !e.zoneTypes
        || (!anchoredHere && !e.zoneTypes.some((zt) => presentTypes.has(zt)))) return false;
      const g = e.gates || {};
      if (g.externalOnly) return false;
      // These gates depend only on immutable sector data, so rejecting them here prevents an
      // impossible authored shape from consuming the sector-day slot before the fire-time gate.
      if (Array.isArray(g.sectorIds) && !g.sectorIds.includes(sectorId)) return false;
      if (Number.isFinite(g.minSectorTier) && (!secDef || (secDef.tier | 0) < g.minSectorTier)) return false;
      if (Number.isFinite(g.maxSecurity) && sectorSecurity > g.maxSecurity) return false;
      if (Number.isFinite(g.minSecurity) && sectorSecurity < g.minSecurity) return false;
      return true;
    });
    if (!candidates.length) return;
    const roll = rng();
    let count;
    if (tier === 'major') count = roll < 0.35 ? 1 : 0;              // majors are rare
    else if (tier === 'minor') count = 1 + Math.floor(roll * maxCount); // ≥1 minor slot per day —
    // fire-time gates/pressure still decide whether it actually happens (quiet days stay possible)
    else count = Math.floor(roll * (maxCount + 1));
    count = Math.min(count, maxCount);
    for (let i = 0; i < count; i++) {
      const enc = pickWeighted(candidates, rng, (candidate) => (
        ecologyState ? regionalEncounterWeight(ecologyState, sectorId, candidate) : candidate.weight
      ));
      if (!enc) continue;
      if (enc.rare && rng() < RARE_GATE) continue;     // rare shapes need the extra gate
      const zone = pickZoneFor(enc, zonesByType, rng, sectorId);
      if (!zone) continue;
      const item = resolveEncounter(enc, zone, sectorId, dayIndex, seq++, rng);
      if (!item) continue;
      item.regionalWeight = ecologyState ? regionalEncounterWeight(ecologyState, sectorId, enc) : (enc.weight || 1);
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
    // High-sec cores (Helios-class): never plan bait — a "mayday" that springs Reach guns
    // in Concord space breaks the professional first-hour pocket. Genuine distress still rolls.
    const secDefForDistress = SECTORS.find((s) => s.id === sectorId);
    const secForDistress = secDefForDistress && Number.isFinite(secDefForDistress.security)
      ? secDefForDistress.security : 0.5;
    let genuine = rng() < (Number.isFinite(enc.genuineChance) ? enc.genuineChance : 0.6);
    if (secForDistress >= 0.85) genuine = true;
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
    const authoredPredation = enc.script === 'convoy'
      && enc.predation && enc.predation.enabled === true && enc.civilian;
    if (authoredPredation) {
      // Carrier first means the three-slot admission floor always yields the physical premise:
      // one manifest-bearing civilian, one readable PD curtain, and one offensive raider. Ordinary
      // convoy/trader definitions retain their long-standing single-squad composition path below.
      addSquad(
        ships,
        enc.civilian,
        enc.civilian.factionId || zone.factionId || 'faction_free',
        enc.civilian.context || 'civilian',
        globalZone,
        levelBand,
        rng,
        enc.predation.carrierRole || 'hauler',
      );
      addSquad(
        ships,
        enc.squad,
        factionId,
        enc.context,
        globalZone,
        levelBand,
        rng,
        enc.predation.raiderRole || 'raider',
      );
    } else {
      const mainRole = (enc.script === 'convoy' || enc.script === 'traderRun') ? 'hauler' : 'squad';
      addSquad(ships, enc.squad, factionId, enc.context, globalZone, levelBand, rng, mainRole);
    }
    if (enc.escort) addSquad(ships, enc.escort, enc.escort.factionId, enc.escort.context || 'patrol', globalZone, levelBand, rng, 'escort');
  }

  return {
    encounterId: squadId,
    shapeId: enc.id,
    // Self-registering modules are resolved by shapeId at runtime. Keep a legacy script id on the
    // schedule item so older planner/check tooling can still validate and inspect the schedule
    // without needing to understand the module runtime extension point.
    script: SELF_REGISTERED_RUNTIME_BY_ID.has(enc.id) ? (enc.fallbackScript || 'whisper') : enc.script,
    tier: enc.tier,
    deck: enc.deck,
    squadId,
    zoneId: zone.id,
    zoneName: zone.name,
    zoneType: zone.type || null,
    zoneCenter: { x: globalZone.center.x, z: globalZone.center.z },
    zoneRadius: zone.radius || 400,
    factionId,
    bark: enc.bark,
    motive: enc.motive || null,
    engagementTrigger: enc.engagementTrigger || null,
    variantKind,
    levelBand,
    delay: 0,
    ships,
    predation: enc.predation && enc.predation.enabled === true
      ? { ...enc.predation }
      : null,
  };
}

// Append `size`-many ships from a squad template onto `ships`, clustered on the zone.
function addSquad(ships, squad, factionId, context, zone, levelBand, rng, role) {
  if (!squad || !squad.archetypes || !squad.archetypes.length) return;
  const [lo, hi] = Array.isArray(squad.size) && squad.size.length === 2 ? squad.size : [1, 2];
  const n = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
  const hasIdentityAnchor = typeof squad.anchorArchetype === 'string' && squad.anchorArchetype.length > 0;
  for (let i = 0; i < n; i++) {
    // Authored swarm packets guarantee exactly one identity/controller anchor. It is first so a
    // partial cap grant preserves faction readability; every remaining slot draws from the light
    // pool deterministically. Choir may use the same native hull for both roles—the role marker,
    // not a foreign silhouette, distinguishes its chorus lead.
    const isAnchor = i === 0 && hasIdentityAnchor;
    const archetype = isAnchor
      ? squad.anchorArchetype
      : pickFactionArchetype(squad.archetypes, factionId, rng);
    const level = Math.round(levelBand[0] + (levelBand[1] - levelBand[0]) * (0.4 + rng() * 0.6));
    ships.push({
      archetype,
      ...(hasIdentityAnchor ? { compositionRole: isAnchor ? 'identity_anchor' : 'light' } : {}),
      combatDoctrineId: ENEMY_BY_ID.get(archetype)?.combatDoctrineId || null,
      level,
      pos: jitter(zone, rng, Math.min(zone.radius || 260, 260)),
      factionId,
      context,
      doctrine: squad.doctrine,
      formation: squad.formation,
      team: squad.team,
      passive: squad.passive == null ? undefined : squad.passive === true,
      roe: squad.roe,
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
function pickZoneFor(enc, zonesByType, rng, sectorId) {
  if (enc.anchorPoiId) {
    const sector = SECTORS.find((entry) => entry.id === sectorId);
    const poi = sector && Array.isArray(sector.pois)
      ? sector.pois.find((entry) => entry.id === enc.anchorPoiId && entry.pos)
      : null;
    if (poi) {
      return {
        id: `encounter-anchor:${poi.id}`,
        name: poi.name || enc.title || poi.id,
        type: (enc.zoneTypes && enc.zoneTypes[0]) || 'authored',
        center: { x: poi.pos.x, z: poi.pos.z },
        radius: 360,
        threat: 0,
      };
    }
  }
  const matches = [];
  for (const zt of enc.zoneTypes) {
    const zs = zonesByType.get(zt);
    if (zs && zs.length) for (const z of zs) matches.push(z);
  }
  if (!matches.length) return null;
  return matches[Math.floor(rng() * matches.length) % matches.length];
}

// Weighted pick over encounter shapes using their `weight`.
function pickWeighted(list, rng, weightOf = (entry) => entry.weight) {
  let total = 0;
  for (const e of list) total += Math.max(0, Number(weightOf(e)) || 1);
  if (total <= 0) return list[0] || null;
  let r = rng() * total;
  for (const e of list) {
    r -= Math.max(0, Number(weightOf(e)) || 1);
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

function freightPickupPhysicalSpec(commodityId, qty) {
  const commodity = CMDTY.get(commodityId);
  const massPerUnit = Math.max(0.05, Math.min(4, Number(commodity && commodity.massPerU) || 1));
  const volumePerUnit = Math.max(0.05, Math.min(4, Number(commodity && commodity.volPerU) || 1));
  const totalMass = qty * massPerUnit;
  const totalVolume = qty * volumePerUnit;
  const bodyMass = Math.max(
    FREIGHT_PICKUP_MASS_MIN,
    Math.min(FREIGHT_PICKUP_MASS_MAX, 6 + totalMass * 8 + totalVolume * 2),
  );
  const radius = Math.max(
    FREIGHT_PICKUP_RADIUS_MIN,
    Math.min(FREIGHT_PICKUP_RADIUS_MAX, 1.85 + Math.cbrt(totalVolume) * 0.8),
  );
  return {
    version: 1,
    qty,
    massPerUnit,
    volumePerUnit,
    totalMass,
    totalVolume,
    bodyMass,
    radius,
  };
}

function buildPersistedFreightCustodyEnvelope(live, record, savedAt = null) {
  if (!live || !live.data || !record) return null;
  const data = live.data;
  const predation = live.plan && live.plan.predation || {};
  return normalizePersistedFreightCustodyEnvelope({
    version: FREIGHT_CUSTODY_SAVE_VERSION,
    custodyId: record.custodyId,
    encounterId: live.id,
    savedAt,
    live: {
      shapeId: live.shapeId,
      script: live.script,
      sectorId: live.sectorId,
      zoneId: live.zoneId,
      zoneName: live.zoneName,
      factionId: live.factionId,
      squadId: live.squadId,
      anchor: live.anchor,
      zoneRadius: live.zoneRadius,
      phase: live.phase,
      startedAt: live.startedAt,
      deadlineAt: live.deadlineAt,
      vars: live.vars,
      plan: {
        variantKind: live.plan && live.plan.variantKind,
        predation,
      },
      data: {
        ceresLivingChain: data.ceresLivingChain === true,
        handoffId: data.handoffId,
        rootLotId: data.rootLotId,
        transferSeq: data.transferSeq,
        end: data.end,
        destId: data.destId,
        destName: data.destName,
        cargoId: data.cargoId,
        perHauler: data.perHauler,
        initialHaulerCount: data.initialHaulerCount,
        initialCargoUnits: data.initialCargoUnits,
        freightManifest: data.freightManifest,
        robbed: data.robbed,
        lossKillerId: data.lossKillerId,
        guardKills: data.guardKills,
        noticed: data.noticed,
        freightCarrierRecovered: data.freightCarrierRecovered,
        freightCarrierArrived: data.freightCarrierArrived,
        predationStatus: data.predationStatus,
        predationEndReason: data.predationEndReason,
        predationTargetIdentityKey: data.predationTargetIdentityKey,
        predationRaiderIdentityKey: data.predationRaiderIdentityKey,
      },
    },
    record,
  });
}

function normalizePersistedFreightCustodies(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value.slice(-FREIGHT_CUSTODY_SAVE_CAP * 2)) {
    const envelope = normalizePersistedFreightCustodyEnvelope(raw);
    if (!envelope || seen.has(envelope.custodyId)) continue;
    seen.add(envelope.custodyId);
    out.push(envelope);
  }
  return out.slice(-FREIGHT_CUSTODY_SAVE_CAP);
}

function normalizePersistedFreightCustodyEnvelope(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== FREIGHT_CUSTODY_SAVE_VERSION) return null;
  const custodyId = boundedFreightString(raw.custodyId);
  const encounterId = boundedFreightString(raw.encounterId);
  const liveRaw = raw.live && typeof raw.live === 'object' ? raw.live : null;
  const recordRaw = raw.record && typeof raw.record === 'object' ? raw.record : null;
  const shapeId = boundedFreightString(liveRaw && liveRaw.shapeId);
  const script = boundedFreightString(liveRaw && liveRaw.script);
  if (!custodyId || !encounterId || !liveRaw || !recordRaw || !ENCOUNTERS[shapeId]
    || (script !== 'convoy' && script !== 'traderRun')
    || boundedFreightString(recordRaw.custodyId) !== custodyId
    || boundedFreightString(recordRaw.encounterId) !== encounterId
    || recordRaw.terminal === true) return null;

  const pods = [];
  const rawPods = Array.isArray(recordRaw.pods) ? recordRaw.pods : [];
  if (rawPods.length > FREIGHT_CUSTODY_POD_SAVE_CAP) return null;
  const podIdentities = new Set();
  for (const rawPod of rawPods) {
    if (!rawPod || typeof rawPod !== 'object') return null;
    const podIdentity = boundedFreightString(rawPod.podIdentity);
    const status = boundedFreightString(rawPod.status);
    const qty = nonnegativeFreightInt(rawPod.qty);
    if (!podIdentity || podIdentities.has(podIdentity) || qty <= 0
      || !['live', 'player_collected', 'raider_secured', 'raider_towed', 'lost'].includes(status)) return null;
    podIdentities.add(podIdentity);
    pods.push({
      podIdentity,
      entityId: rawPod.entityId == null ? null : rawPod.entityId,
      podIndex: nonnegativeFreightInt(rawPod.podIndex),
      instanceSeq: nonnegativeFreightInt(rawPod.instanceSeq),
      qty,
      status,
      cause: boundedFreightString(rawPod.cause),
      custodySourceKind: boundedFreightString(rawPod.custodySourceKind),
      sourceCustodianStableId: boundedFreightString(rawPod.sourceCustodianStableId),
    });
  }

  const initialQty = nonnegativeFreightInt(recordRaw.initialQty);
  const carrierQty = nonnegativeFreightInt(recordRaw.carrierQty);
  const playerCollectedQty = nonnegativeFreightInt(recordRaw.playerCollectedQty);
  const raiderSecuredQty = nonnegativeFreightInt(recordRaw.raiderSecuredQty);
  const stationRecoveredQty = nonnegativeFreightInt(recordRaw.stationRecoveredQty);
  const deliveredQty = nonnegativeFreightInt(recordRaw.deliveredQty);
  const lostQty = nonnegativeFreightInt(recordRaw.lostQty);
  const livePodQty = pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
  const securedPodQty = pods.reduce((sum, pod) => (
    sum + (pod.status === 'raider_secured' || pod.status === 'raider_towed' ? pod.qty : 0)
  ), 0);
  if (initialQty <= 0 || raiderSecuredQty !== securedPodQty
    || carrierQty + livePodQty + playerCollectedQty + raiderSecuredQty
      + stationRecoveredQty + deliveredQty + lostQty !== initialQty) return null;

  const corsairTowPodIdentity = boundedFreightString(recordRaw.corsairTowPodIdentity);
  const towedPods = pods.filter((pod) => pod.status === 'raider_towed');
  if (towedPods.length > 1
    || (towedPods.length === 1) !== !!corsairTowPodIdentity
    || (towedPods.length === 1 && towedPods[0].podIdentity !== corsairTowPodIdentity)) return null;

  const manifestId = boundedFreightString(recordRaw.manifestId);
  const freighterKey = boundedFreightString(recordRaw.freighterKey);
  const commodityId = boundedFreightString(recordRaw.commodityId);
  const carrierIdentityKey = boundedFreightString(recordRaw.carrierIdentityKey);
  if (!manifestId || !freighterKey || !commodityId || !carrierIdentityKey) return null;
  const raiderIdentityKey = boundedFreightString(recordRaw.raiderIdentityKey);
  const rawLegalOwnerKind = boundedFreightString(recordRaw.legalOwnerKind);
  const legalOwnerKind = rawLegalOwnerKind == null
    ? 'civilian' // compatibility: every v1 persisted custody came from curtain_convoy's civilian
    : (rawLegalOwnerKind === 'civilian' ? 'civilian' : 'other');
  const legalOwnerStableId = boundedFreightString(recordRaw.legalOwnerStableId)
    || (legalOwnerKind === 'civilian' ? freighterKey : null);
  const legalOwnerFactionId = boundedFreightString(recordRaw.legalOwnerFactionId);
  for (const pod of pods) {
    if (pod.custodySourceKind == null) {
      pod.custodySourceKind = inferFreightPodCustodySource(pod.cause, legalOwnerKind);
    } else if (!['lawful_carrier', 'hostile_raider', 'other_carrier'].includes(pod.custodySourceKind)) {
      pod.custodySourceKind = 'other_carrier'; // malformed provenance can never create a crime
    }
    if (!pod.sourceCustodianStableId) {
      pod.sourceCustodianStableId = pod.custodySourceKind === 'hostile_raider'
        ? raiderIdentityKey
        : carrierIdentityKey;
    }
  }
  const predationRaw = liveRaw.plan && liveRaw.plan.predation && typeof liveRaw.plan.predation === 'object'
    ? liveRaw.plan.predation
    : {};
  const dataRaw = liveRaw.data && typeof liveRaw.data === 'object' ? liveRaw.data : {};
  return {
    version: FREIGHT_CUSTODY_SAVE_VERSION,
    custodyId,
    encounterId,
    savedAt: finiteFreightNumber(raw.savedAt, 0),
    live: {
      shapeId,
      script,
      sectorId: boundedFreightString(liveRaw.sectorId),
      zoneId: boundedFreightString(liveRaw.zoneId),
      zoneName: boundedFreightString(liveRaw.zoneName),
      factionId: boundedFreightString(liveRaw.factionId),
      squadId: boundedFreightString(liveRaw.squadId) || `${encounterId}:squad`,
      anchor: finiteFreightVec(liveRaw.anchor),
      zoneRadius: Math.max(1, finiteFreightNumber(liveRaw.zoneRadius, 400)),
      phase: boundedFreightString(liveRaw.phase) || 'transit',
      startedAt: finiteFreightNumber(liveRaw.startedAt, 0),
      deadlineAt: finiteFreightNumber(liveRaw.deadlineAt, 0),
      vars: normalizeFreightVars(liveRaw.vars),
      plan: {
        variantKind: boundedFreightString(liveRaw.plan && liveRaw.plan.variantKind) || shapeId,
        predation: normalizeFreightPredation(predationRaw),
      },
      data: {
        ceresLivingChain: dataRaw.ceresLivingChain === true,
        handoffId: boundedFreightString(dataRaw.handoffId),
        rootLotId: boundedFreightString(dataRaw.rootLotId),
        transferSeq: nonnegativeFreightInt(dataRaw.transferSeq),
        end: finiteFreightVec(dataRaw.end),
        destId: boundedFreightString(dataRaw.destId),
        destName: boundedFreightString(dataRaw.destName),
        cargoId: boundedFreightString(dataRaw.cargoId) || commodityId,
        perHauler: nonnegativeFreightInt(dataRaw.perHauler),
        initialHaulerCount: nonnegativeFreightInt(dataRaw.initialHaulerCount),
        initialCargoUnits: nonnegativeFreightInt(dataRaw.initialCargoUnits),
        freightManifest: normalizeFreightManifest(dataRaw.freightManifest),
        robbed: dataRaw.robbed === true,
        lossKillerId: dataRaw.lossKillerId == null ? null : dataRaw.lossKillerId,
        guardKills: nonnegativeFreightInt(dataRaw.guardKills),
        noticed: dataRaw.noticed === true,
        freightCarrierRecovered: dataRaw.freightCarrierRecovered === true,
        freightCarrierArrived: dataRaw.freightCarrierArrived === true,
        predationStatus: boundedFreightString(dataRaw.predationStatus),
        predationEndReason: boundedFreightString(dataRaw.predationEndReason),
        predationTargetIdentityKey: boundedFreightString(dataRaw.predationTargetIdentityKey) || carrierIdentityKey,
        predationRaiderIdentityKey: boundedFreightString(dataRaw.predationRaiderIdentityKey) || raiderIdentityKey,
      },
    },
    record: {
      version: 1,
      custodyId,
      receiptId: boundedFreightString(recordRaw.receiptId) || `${custodyId}:receipt`,
      encounterId,
      carrierId: recordRaw.carrierId == null ? null : recordRaw.carrierId,
      carrierIdentityKey,
      raiderId: recordRaw.raiderId == null ? null : recordRaw.raiderId,
      raiderIdentityKey,
      manifestId,
      freighterKey,
      commodityId,
      legalOwnerKind,
      legalOwnerStableId,
      legalOwnerFactionId,
      lawTheftReportId: boundedFreightString(recordRaw.lawTheftReportId),
      lawTheftCausalTick: Number.isInteger(recordRaw.lawTheftCausalTick)
        && recordRaw.lawTheftCausalTick >= 0
        ? recordRaw.lawTheftCausalTick
        : null,
      lawTheftIncidentReceiptId: boundedFreightString(recordRaw.lawTheftIncidentReceiptId),
      initialQty,
      carrierQty,
      playerCollectedQty,
      raiderSecuredQty,
      stationRecoveredQty,
      deliveredQty,
      lostQty,
      pods,
      corsairTowPodIdentity,
      nextPodIndex: Math.max(pods.length, nonnegativeFreightInt(recordRaw.nextPodIndex)),
      respillSeq: nonnegativeFreightInt(recordRaw.respillSeq),
      disableSpilled: recordRaw.disableSpilled === true,
      deathSpilled: recordRaw.deathSpilled === true,
      spillWindowClosed: recordRaw.spillWindowClosed === true,
      carrierDead: recordRaw.carrierDead === true,
      carrierAbandoned: recordRaw.carrierAbandoned === true,
      carrierRecovered: recordRaw.carrierRecovered === true,
      carrierArrived: recordRaw.carrierArrived === true,
      carrierDestructionPending: recordRaw.carrierDestructionPending === true,
      raiderDead: recordRaw.raiderDead === true,
      raiderEscaped: recordRaw.raiderEscaped === true,
      raiderRecoveryClosed: recordRaw.raiderRecoveryClosed === true,
      carrierPersistenceOwned: recordRaw.carrierPersistenceOwned === true,
      raiderPersistenceOwned: recordRaw.raiderPersistenceOwned === true,
      terminal: false,
      receiptEmitted: false,
      lossAccountedQty: nonnegativeFreightInt(recordRaw.lossAccountedQty),
      startedAt: finiteFreightNumber(recordRaw.startedAt, 0),
      deadlineAt: finiteFreightNumber(recordRaw.deadlineAt, 0),
      escapeStartedAt: nullableFreightNumber(recordRaw.escapeStartedAt),
      escapeDeadlineAt: nullableFreightNumber(recordRaw.escapeDeadlineAt),
      escapeRadius: Math.max(1, finiteFreightNumber(recordRaw.escapeRadius, FREIGHT_CUSTODY_ESCAPE_RADIUS_DEFAULT)),
      escapeOrigin: finiteFreightVec(recordRaw.escapeOrigin),
      escapeTarget: finiteFreightVec(recordRaw.escapeTarget),
      raiderLastPos: finiteFreightVec(recordRaw.raiderLastPos),
      raiderLastVel: finiteFreightVec(recordRaw.raiderLastVel),
      transitionSeq: nonnegativeFreightInt(recordRaw.transitionSeq),
    },
  };
}

function normalizeFreightPredation(raw) {
  return {
    enabled: raw.enabled === true,
    carrierRole: boundedFreightString(raw.carrierRole) || 'hauler',
    raiderRole: boundedFreightString(raw.raiderRole) || 'raider',
    motive: boundedFreightString(raw.motive) || 'cargo_raid',
    engagementTrigger: boundedFreightString(raw.engagementTrigger) || 'manifest_predation',
    attackerDoctrineId: boundedFreightString(raw.attackerDoctrineId),
    approachTelegraph: boundedFreightString(raw.approachTelegraph),
    responseWindowS: Math.max(1, finiteFreightNumber(raw.responseWindowS, 1)),
    objectiveS: Math.max(1, finiteFreightNumber(raw.objectiveS, 90)),
    leashRadius: Math.max(400, finiteFreightNumber(raw.leashRadius, 2600)),
    escapeHoldS: Math.max(1, finiteFreightNumber(raw.escapeHoldS, 3)),
  };
}

function inferFreightPodCustodySource(cause, legalOwnerKind) {
  const value = String(cause || '');
  if (value.startsWith('raider_') || value === 'custody_timeout_respill') return 'hostile_raider';
  return legalOwnerKind === 'civilian' ? 'lawful_carrier' : 'other_carrier';
}

function normalizeFreightManifest(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) return null;
  const manifestId = boundedFreightString(raw.manifestId);
  const freighterKey = boundedFreightString(raw.freighterKey);
  if (!manifestId || !freighterKey) return null;
  const lines = raw.lines.slice(0, 8).map((line) => ({
    commodityId: boundedFreightString(line && line.commodityId),
    qty: nonnegativeFreightInt(line && line.qty),
  })).filter((line) => line.commodityId);
  return {
    manifestId,
    freighterKey,
    role: boundedFreightString(raw.role) || 'hauler',
    lines,
    totalQty: nonnegativeFreightInt(raw.totalQty),
  };
}

function normalizeFreightVars(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of Object.keys(raw).sort().slice(0, 12)) {
    const safeKey = boundedFreightString(key, 48);
    const value = raw[key];
    if (!safeKey || !['string', 'number', 'boolean'].includes(typeof value)) continue;
    out[safeKey] = typeof value === 'number' ? finiteFreightNumber(value, 0) : value;
  }
  return out;
}

function boundedFreightString(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function finiteFreightNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableFreightNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegativeFreightInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function finiteFreightVec(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x), z = Number(value.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
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
    externalNamed: {},
    receipts: [],
    stats: {
      fired: 0,
      resolved: 0,
      fizzled: 0,
      appliedFreightLossIds: [],
      openFreightCustodies: [],
    },
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

function clearPredationBindingsForLive(state, live, reason = 'objective_cleared') {
  if (!state || !live || !live.data) return 0;
  const hadBinding = live.data.predationStatus != null
    || live.data.predationTargetId != null
    || live.data.predationRaiderId != null;
  if (!hadBinding) return 0;
  live.data.predationStatus = 'cleared';
  live.data.predationEndReason = String(reason || 'objective_cleared');
  const entities = state.entities;
  let cleared = 0;
  for (const id of live.ids || []) {
    const entity = entities && typeof entities.get === 'function' ? entities.get(id) : null;
    if (clearPredationBindingOnEntity(state, entity, live.id, reason)) cleared++;
  }
  return cleared;
}

function clearAllPredationBindings(state, reason = 'lifecycle_boundary') {
  if (!state || typeof state !== 'object') return 0;
  let cleared = 0;
  const liveRows = state.encounterDirector && state.encounterDirector.live;
  if (liveRows && typeof liveRows === 'object') {
    for (const live of Object.values(liveRows)) {
      cleared += clearPredationBindingsForLive(state, live, reason);
    }
  }
  const entities = state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : (Array.isArray(state.entityList) ? state.entityList : []);
  for (const entity of entities) {
    const encounterId = entity && entity.data && entity.data.predationEncounterId;
    if (encounterId && clearPredationBindingOnEntity(state, entity, encounterId, reason)) cleared++;
  }
  return cleared;
}

function clearPredationBindingOnEntity(state, entity, encounterId, reason) {
  const data = entity && entity.data;
  if (!data || data.predationEncounterId !== encounterId) return false;
  const persistedCarrier = persistedFreightCarrierBinding(entity);
  const ai = data.ai;
  if (data.predationRole === 'raider' && ai) {
    ai.passive = true;
    ai.motiveSatisfied = true;
    ai.pirateDisengaged = true;
    ai.predationStatus = 'cleared';
    ai.predationEndReason = String(reason || 'objective_cleared');
    delete ai.predationTargetId;
    delete ai.predationTargetIdentityKey;
    delete ai.predationObjective;
    setEntityDoctrine(entity, {
      activity: {
        kind: ActivityKind.DISENGAGE,
        reason: `predation:${String(reason || 'objective_cleared')}`,
        anchor: entity.pos,
        leashRadius: 2600,
        startedTick: Number.isInteger(state.tick) ? state.tick : 0,
        targetId: null,
        encounterId,
      },
      roe: RulesOfEngagement.HOLD_FIRE,
    });
  }
  delete data.predationEncounterId;
  // A disabled civilian recovery is persisted independently of the transient encounter. Preserve
  // only its stable carrier key so save rematerialization can rebind the numeric entity id; every
  // raider/spilled/malformed state still loses predation identity and cannot revive authority.
  if (!persistedCarrier) delete data.predationIdentityKey;
  delete data.predationRole;
  return true;
}

function persistedFreightCarrierBinding(entity) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || entity.team !== 2) return null;
  const data = entity.data;
  const ai = data && data.ai;
  const manifest = data && data.cargoManifest;
  const custody = data && data.freightCustody;
  const identityKey = data && data.predationIdentityKey;
  const role = String(ai && (ai.encounterRole || ai.role) || data && data.role || '').toLowerCase();
  if (!data || !ai || ai.passive !== true || !/(^|[\s_-])(hauler|freight|freighter)([\s_-]|$)/.test(role)
    || typeof identityKey !== 'string' || !identityKey
    || !manifest || typeof manifest.manifestId !== 'string' || !manifest.manifestId
    || typeof manifest.freighterKey !== 'string' || !manifest.freighterKey
    || !Array.isArray(manifest.lines) || !manifest.lines.some((line) => (
      line && typeof line.commodityId === 'string' && Number(line.qty) > 0
    ))
    || !custody || custody.status !== 'carrier'
    || custody.manifestId !== manifest.manifestId
    || custody.carrierIdentityKey !== identityKey
    || typeof custody.encounterId !== 'string' || !custody.encounterId) return null;
  return { data, ai, manifest, custody, identityKey };
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
  if (!d.externalNamed || typeof d.externalNamed !== 'object' || Array.isArray(d.externalNamed)) d.externalNamed = {};
  if (!Array.isArray(d.receipts)) d.receipts = [];
  if (!d.stats || typeof d.stats !== 'object') d.stats = { fired: 0, resolved: 0, fizzled: 0 };
  d.stats.appliedFreightLossIds = normalizeAppliedFreightLossIds(d.stats.appliedFreightLossIds, 64);
  if (!Array.isArray(d.stats.openFreightCustodies)) d.stats.openFreightCustodies = [];
  if (d.stats.openFreightCustodies.length > FREIGHT_CUSTODY_SAVE_CAP) {
    d.stats.openFreightCustodies = d.stats.openFreightCustodies.slice(-FREIGHT_CUSTODY_SAVE_CAP);
  }
  if (!Array.isArray(d.stats.recentFingerprints)) d.stats.recentFingerprints = [];
  if (!Array.isArray(d.stats.recentVarietyKeys)) d.stats.recentVarietyKeys = [];
  if (d.stats.recentFingerprints.length > 12) d.stats.recentFingerprints = d.stats.recentFingerprints.slice(-12);
  if (d.stats.recentVarietyKeys.length > 12) d.stats.recentVarietyKeys = d.stats.recentVarietyKeys.slice(-12);
  if (!('plannedKey' in d)) d.plannedKey = null;
  if (!Number.isFinite(d.lastMeaningfulAt)) d.lastMeaningfulAt = -1e9;
  if (!Number.isFinite(d.lastAmbientAt)) d.lastAmbientAt = -1e9;
  if (!Number.isFinite(d.lastMajorAt)) d.lastMajorAt = -1e9;
  if (!Number.isFinite(d.lastEndAt)) d.lastEndAt = -1e9;
  if (!Number.isFinite(d._accum)) d._accum = 0;
  ensureNamed(d);
  return d;
}

// The loss ledger is an eviction queue, not a set serialization: application order is authority.
// Older builds may have saved either an array or an object-shaped membership map; normalize both
// without sorting so a newly appended low-lexical ID cannot evict itself at the cap boundary.
function normalizeAppliedFreightLossIds(value, cap = 64) {
  const source = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' ? Object.keys(value) : []);
  const ordered = [];
  const seen = new Set();
  for (let i = source.length - 1; i >= 0; i--) {
    const id = typeof source[i] === 'string' ? source[i] : String(source[i] == null ? '' : source[i]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  ordered.reverse();
  const limit = Math.max(1, Math.floor(Number(cap) || 64));
  return ordered.length > limit ? ordered.slice(ordered.length - limit) : ordered;
}

function appendAppliedFreightLossIds(previous, intentId, cap = 64) {
  const ids = normalizeAppliedFreightLossIds(previous, cap);
  const id = typeof intentId === 'string' ? intentId : String(intentId == null ? '' : intentId);
  if (!id || ids.includes(id)) return ids;
  ids.push(id);
  return ids.length > cap ? ids.slice(ids.length - cap) : ids;
}

function encounterScriptFor(liveOrShape) {
  if (!liveOrShape) return null;
  const shapeId = liveOrShape.shapeId || liveOrShape.id;
  return SELF_REGISTERED_RUNTIME_BY_ID.get(shapeId)
    || ENCOUNTER_SCRIPTS[liveOrShape.script]
    || null;
}

function encounterAdmissionMinimum(item, shape) {
  if (item && item.data && item.data.ceresActivityAmbush === true) return 0;
  if (item && item.predation && item.predation.enabled === true) return 3;
  if (item && item.variantKind === 'distress_genuine') return 2;
  if (item && Array.isArray(item.ships) && item.ships.length > 0) return 1;
  // Named hunters assemble their roster inside the script from durable captain state.
  if (shape && shape.script === 'namedHunter') return 1;
  return 0;
}

/** Pure AC-10 geography gate: named industrial/outlaw pockets with real nonzero threat only. */
export function isArcadeIslandContactZone(zone) {
  return !!(zone && typeof zone.id === 'string'
    && ARCADE_ISLAND_ELIGIBLE_TYPES.has(zone.type)
    && zoneThreat(zone) > 0);
}

/** Stable 6–12 second entry delay without consuming the simulation RNG stream. */
export function arcadeIslandContactDelay(seed, sectorId, zoneId, visitOrdinal = 0) {
  const unit = hash32(seed || 0, sectorId || '', zoneId || '', visitOrdinal | 0, 'ac10-delay')
    / 4294967296;
  return ARCADE_ISLAND_CONTACT_MIN_DELAY_S
    + unit * (ARCADE_ISLAND_CONTACT_MAX_DELAY_S - ARCADE_ISLAND_CONTACT_MIN_DELAY_S);
}

// ── small read-only helpers ───────────────────────────────────────────────────────────────────────

function encounterPacingBlockReason(dir, state, shape, now) {
  if (isDocked(state)) return 'docked';
  if (isTutorialActive(state)) return 'tutorial';
  if (now < (dir.cooldowns[shape.id] || 0)) return 'cooldown';
  if ((dir.pressure[shape.deck] || 0) < shape.pressureCost) return 'pressure';

  const liveList = Object.values(dir.live).filter(Boolean);
  const liveCombat = liveList.some((live) => live.deck === 'combat');
  const liveMeaningful = liveList.filter((live) => live.tier !== 'ambient').length;
  const liveAmbient = liveList.length - liveMeaningful;
  if (shape.tier === 'ambient') {
    if (liveAmbient >= 2) return 'ambient_cap';
    if (now - dir.lastAmbientAt < AMBIENT_GAP_S) return 'ambient_gap';
    if (now - dir.lastMeaningfulAt < AMBIENT_AFTER_MEANINGFUL_S) return 'ambient_after_meaningful';
    return null;
  }

  if (now - dir.lastMeaningfulAt < MIN_GAP_S) return 'pacing_gap';
  if (shape.deck === 'combat' && liveCombat) return 'combat_busy';
  if (liveMeaningful >= 2) return 'meaningful_cap';
  const window = dir.window.filter((entry) => entry && entry.t >= now - WINDOW_S);
  const majors = window.filter((entry) => entry.tier === 'major').length;
  const minors = window.filter((entry) => entry.tier === 'minor').length;
  if (shape.tier === 'major' && majors >= MAX_MAJOR_PER_DAY) return 'major_quota';
  if (shape.tier === 'major' && now - dir.lastMajorAt < MAJOR_EXTRA_GAP_S) return 'major_gap';
  if (shape.tier === 'minor' && minors >= MAX_MINOR_PER_DAY) return 'minor_quota';
  return null;
}

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
  const baseline = def && Number.isFinite(def.security) ? def.security : 0.5;
  return effectiveRegionalSecurity(state, sid, baseline);
}
