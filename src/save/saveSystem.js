// save system (ARCHITECTURE §4.5 + design/specs/11). Owns serialization: assembles a versioned
// envelope from a fixed deps-first registry of systems, writes autosave + manual slots to
// localStorage and to an exportable/importable JSON file, runs ordered migrations on load, and
// drives autosave. It does NOT own newGame() — main.js owns bootstrap (boot calls newGame only if
// present, and adding it here would override the skeleton boot), so this module deliberately omits
// it and implements serialize/save/load/autosave only.
//
// Robustness contract: a missing / corrupt / too-new / too-old save must NEVER crash boot or the
// running game. Every localStorage touch and the whole load are wrapped in try/catch; load builds a
// candidate and validates (fmt → version ≤ CURRENT → checksum → migrate) BEFORE any destructive
// restore, so a bad save aborts with save:error and leaves live state untouched.
import { fnv1a } from './checksum.js';
import { MIGRATIONS, CURRENT_VERSION } from './migrations.js';
import { AI_CONTRACT_VERSION } from '../ai/contracts.js';
import { mulberry32 } from '../core/rng.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { STORY_BEATS } from '../data/missions.js';
import { restoreCombatState, serializeCombatState } from '../combat/persistence.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../systems/ships.js';
import { createTimeEffects } from '../core/timeEffects.js';
import { COORDINATE_SCHEMA, applyFrameOrigin, deriveFrameOrigin } from '../core/coordinates.js';
import {
  MASSLINE_BINDING_PROFILE_LEGACY,
  MASSLINE_BINDING_PROFILE_SPACE,
  PROFILE_SETTINGS_KEY,
  migrateLegacyMasslineBindingProfile,
  readProfileSettings,
} from '../core/graphicsProfileBootstrap.js';
import { encodeSavePayload, SAVE_WORKER_SOURCE } from './saveWorker.js';

const LS_PREFIX = 'sf.save.';
const INDEX_KEY = LS_PREFIX + 'index';
// Previous-generation saves live outside LS_PREFIX so legacy/index recovery scans never mistake
// them for player-visible slots. A valid primary is copied here before it is overwritten.
const RECOVERY_PREFIX = 'sf.recovery.';
const FMT = 'spaceface-save';
const AUTOSAVE_SLOT = 'auto';
const AUTOSAVE_DEBOUNCE_MS = 10000; // ≤1 autosave write per 10s (§4.5)
const AUTOSAVE_TARGET_SLICE_MS = 8;
const AUTOSAVE_HARD_SLICE_MS = 12;
const SAVE_VALIDATION_CHUNK_CHARS = 8_192;
const SAVE_WORKER_TIMEOUT_MS = 4000;
const DEFAULT_FLIGHT_MODE = 'assisted';
const DEFAULT_PHYSICS_BACKEND = 'rapier-dynamic';
const DEFAULT_AI_BACKEND = 'sg06-tactical';
const DEFAULT_FLIGHT_BACKEND = 'v3';
const DEFAULT_CONTROL_SCHEME = 'pilot';
const DEFAULT_MASSLINE_RELEASE_ASSIST = 'arm';
const VALID_FLIGHT_MODES = new Set(['assisted', 'drift', 'newtonian']);
const VALID_CONTROL_SCHEMES = new Set(['pilot', 'helm-assist', 'classic']);
const VALID_MASSLINE_RELEASE_ASSISTS = new Set(['arm', 'snap', 'off']);
const DEFAULT_START_SECTOR = NEW_GAME.startingSectorId || NEW_GAME.startSectorId || 'sector_helios_prime';
const TRANSIENT_ENTITY_SAVE_KEYS = new Set([
  'mesh',
  'view',
  'prevPos',
  'prevRot',
  'bank',
  'bankVel',
]);
const TRANSIENT_ENTITY_FLAGS = new Set(['boosting', 'noInterp', 'docked']);
const TRANSIENT_PLAYER_FLAGS = new Set(['invuln']);

// Save-key → serialize/deserialize plan (§4.5 map). Order is the load/restore order (deps first).
// `get(state, system)` reads the key's payload; `set(state, system, data)` restores it. Systems that
// expose serialize()/deserialize() are used directly; the rest read/write documented state.
//
// `entities` and `world`-reentry are handled specially in load() (entities depend on the player &
// the regenerated sector), so the table only carries the straightforward subtrees.

export const save = {
  name: 'save',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._restoring = false;           // guards autosave re-entrancy during load / boot enterSector
    this._pendingRunTransition = null; // latest load/new-game request queued by restore event re-entry
    this._lastAutosaveAt = -Infinity;  // wall-clock ms of last successful autosave (first is eligible)
    this._lastAutosavePlaytime = 0;    // meta.playtimeS at last interval autosave
    this._playerDead = false;          // set by player:death, cleared by player:respawn (autosave gate)
    this._autosavePending = null;      // accepted/coalesced job waiting beyond the current event stack
    this._autosaveInFlight = false;    // prevents forced triggers from starting concurrent writes
    this._autosaveGeneration = 0;      // invalidates stale worker/task completions
    this._runEpoch = 0;                // invalidates every stage when a new run starts
    this._activeAutosaveJob = null;    // terminal receipt owner before the transaction starts
    this._activeAutosaveTransaction = null; // cleanup owner; survives run/generation invalidation
    this._activeSaveWorkers = new Set();
    this._saveWorkerRequestId = 0;
    this._restoreSequence = 0;         // unique transient freeze owner for overlapping visual gates

    const bus = this.bus;
    this._loadProfileSettings();
    // UI / input route F5/F9 and menu buttons through these (§4.4).
    bus.on('game:save', (p) => this.save((p && p.slot) || 'quick', { reason: 'manual' }));
    bus.on('game:load', (p) => {
      const load = () => this.load((p && p.slot) || 'latest');
      const defer = this.helpers && this.helpers.deferLoadedGameRestore;
      if (typeof defer === 'function' && defer(load) === true) return;
      load();
    });
    bus.on('settings:changed', (payload) => {
      if (!payload || payload.persist !== false) this._writeProfileSettings();
    });

    // Death/respawn gate autosave (combat signals via events, not a state.player.dead field).
    bus.on('player:death', () => { this._playerDead = true; });
    bus.on('player:respawn', () => { this._playerDead = false; });
    const clearPlayerDeathGate = () => { this._playerDead = false; };
    bus.on('save:loaded', clearPlayerDeathGate);
    bus.on('game:started', clearPlayerDeathGate);
    // Registered during system init, before main installs its new-game bootstrap listener, so old
    // run work is invalidated synchronously at the route boundary.
    bus.on('game:new', () => this._beginRunEpoch('game:new'));
    bus.on('game:newGame', () => this._beginRunEpoch('game:newGame'));

    // Autosave triggers (§4.5): major progression milestones. Debounced ≤1/10s unless forced.
    bus.on('dock:docked', () => this.requestAutosave('dock'));
    bus.on('dock:undocked', () => this.requestAutosave('undock', { force: true }));
    bus.on('sector:enter', () => this.requestAutosave('sector'));
    bus.on('jump:arrive', () => this.requestAutosave('jump', { force: true }));
    bus.on('mission:accepted', () => this.requestAutosave('mission_accept'));
    bus.on('mission:completed', () => this.requestAutosave('mission'));
    bus.on('mission:failed', () => this.requestAutosave('mission'));
    bus.on('mission:expired', () => this.requestAutosave('mission'));
    bus.on('economy:tradeCompleted', () => this.requestAutosave('trade'));
    bus.on('story:beatAdvanced', () => this.requestAutosave('story'));
    // HUD placement belongs to the game save (not the machine-wide profile), so keep the player's
    // latest Ctrl-dragged layout durable even if they do not make another progression change.
    bus.on('hud:layoutChanged', () => this.requestAutosave('hud_layout'));
    bus.on('player:respawn', () => this.requestAutosave('respawn', { force: true }));
  },

  // Interval autosave is the only periodic job; playtime accrual is core's (§ core.preStep).
  update(/* dt, state */) {
    const state = this.state;
    if (this._restoring || state.mode !== 'flight') return;
    const intervalS = (state.settings.gameplay && state.settings.gameplay.autosaveIntervalS) || 0;
    if (intervalS > 0 && (state.meta.playtimeS - this._lastAutosavePlaytime) >= intervalS) {
      this.requestAutosave('interval');
    }
  },

  /**
   * Serialize route starts against the synchronous destructive restore phase. Callers retain
   * responsibility for starting immediately when this returns false. While restoring, only the
   * latest callback survives so a burst of reentrant load/new-game requests has one clear winner.
   */
  deferRunTransition(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('deferred run transition callback must be a function');
    }
    if (!this._restoring) return false;
    this._pendingRunTransition = callback;
    return true;
  },

  // ── serialization ─────────────────────────────────────────────────────────────────────────

  _saveCapturePlan() {
    const state = this.state;
    return [
      ['meta', () => this._serializeMeta()],
      ['player', () => this._serializePlayer()],
      ['cargo', () => this._serializeCargo()],
      ['economy', () => this._callSerialize('economy') || {}],
      ['economyContracts', () => this._callSerialize('economyContracts') || {}],
      ['factions', () => this._callSerialize('factions') || {}],
      ['world', () => this._callSerialize('world') || {}],
      ['entities', () => this._serializeEntities()],
      ['combat', () => serializeCombatState(state)],
      ['missions', () => this._callSerialize('missions') || this._serializeMissions()],
      ['careerOrigins', () => this._callSerialize('careerOrigins') || clonePlain(state.careers && state.careers.origins || {})],
      ['careerLadders', () => this._callSerialize('careerLadders') || clonePlain(state.careers && state.careers.ladders || {})],
      ['scenario', () => this._callSerialize('scenarioRuntime') || clonePlain(state.scenario || {})],
      ['automation', () => this._callSerialize('automation') || this._serializeAutomation()],
      ['crafting', () => this._callSerialize('crafting') || this._serializeCrafting()],
      ['sectorSim', () => this._callSerialize('sectorSim') || {}],
      ['npcJobs', () => this._callSerialize('npcJobsRuntime') || {}], // PQ-014 live NPC job bag (v12)
      ['claims', () => this._callSerialize('claims') || clonePlain(state.claims || { bodies: [] })],
      ['sites', () => this._callSerialize('asteroidSites') || clonePlain(state.sites || {})],
      ['formations', () => this._callSerialize('asteroidFormations') || clonePlain(state.formations || {})],
      ['aceMemory', () => this._callSerialize('aceMemory') || clonePlain(state.aceMemory || {})],
      ['lossLedger', () => this._callSerialize('lossLedger') || clonePlain(state.lossLedger || {})],
      ['factionPresence', () => this._callSerialize('factionPresence') || clonePlain(state.factionPresence || {})],
      ['bandRadio', () => this._callSerialize('bandRadio') || clonePlain(state.bandRadio || {})],
      ['v2Flavor', () => this._callSerialize('v2Flavor') || clonePlain(state.v2Flavor || {})],
      ['aftermathWrecks', () => this._callSerialize('aftermathWrecks') || clonePlain(state.aftermathWrecks || {})],
      ['fieldDepletion', () => this._callSerialize('fieldDepletion') || clonePlain(state.fieldDepletion || {})],
      ['livingPoiBehaviors', () => this._callSerialize('livingPoiBehaviors') || clonePlain(state.livingPoiBehaviors || {})],
      ['signalInvestigation', () => this._callSerialize('scanner') || clonePlain(state.signalInvestigation || {})],
      ['recoveryEncounters', () => this._callSerialize('recoveryEncounter') || clonePlain(state.recoveryEncounters || {})],
      ['regionalEcology', () => this._callSerialize('regionalEcology') || clonePlain(state.regionalEcology || {})],
      ['encounterDirector', () => this._serializeEncounterDirector()],
      ['flight', () => this._serializeFlight()],
      ['nav', () => this._serializeNav()],
      ['settings', () => this._serializeSettings()],
    ];
  },

  /** Build the `data` payload (plain JSON, deps-first key order). No mesh/THREE/Map/fn/Infinity. */
  serializeData() {
    const state = this.state;
    const data = {};
    data.meta = this._serializeMeta();
    data.player = this._serializePlayer();
    data.cargo = this._serializeCargo();
    data.economy = this._callSerialize('economy') || {};
    data.economyContracts = this._callSerialize('economyContracts') || {};
    data.factions = this._callSerialize('factions') || {};
    data.world = this._callSerialize('world') || {};
    data.entities = this._serializeEntities();
    data.combat = serializeCombatState(state);
    data.missions = this._callSerialize('missions') || this._serializeMissions();
    data.careerOrigins = this._callSerialize('careerOrigins') || clonePlain(state.careers && state.careers.origins || {});
    data.careerLadders = this._callSerialize('careerLadders') || clonePlain(state.careers && state.careers.ladders || {});
    data.scenario = this._callSerialize('scenarioRuntime') || clonePlain(state.scenario || {});
    data.automation = this._callSerialize('automation') || this._serializeAutomation();
    data.crafting = this._callSerialize('crafting') || this._serializeCrafting();
    data.sectorSim = this._callSerialize('sectorSim') || {};
    data.npcJobs = this._callSerialize('npcJobsRuntime') || {}; // PQ-014 live NPC job bag (v12)
    data.claims = this._callSerialize('claims') || clonePlain(state.claims || { bodies: [] });
    data.sites = this._callSerialize('asteroidSites') || clonePlain(state.sites || {});
    data.formations = this._callSerialize('asteroidFormations') || clonePlain(state.formations || {});
    data.aceMemory = this._callSerialize('aceMemory') || clonePlain(state.aceMemory || {});
    data.lossLedger = this._callSerialize('lossLedger') || clonePlain(state.lossLedger || {});
    data.factionPresence = this._callSerialize('factionPresence') || clonePlain(state.factionPresence || {});
    data.bandRadio = this._callSerialize('bandRadio') || clonePlain(state.bandRadio || {});
    data.v2Flavor = this._callSerialize('v2Flavor') || clonePlain(state.v2Flavor || {});
    data.aftermathWrecks = this._callSerialize('aftermathWrecks') || clonePlain(state.aftermathWrecks || {});
    data.fieldDepletion = this._callSerialize('fieldDepletion') || clonePlain(state.fieldDepletion || {});
    data.livingPoiBehaviors = this._callSerialize('livingPoiBehaviors') || clonePlain(state.livingPoiBehaviors || {});
    data.signalInvestigation = this._callSerialize('scanner') || clonePlain(state.signalInvestigation || {});
    data.recoveryEncounters = this._callSerialize('recoveryEncounter') || clonePlain(state.recoveryEncounters || {});
    data.regionalEcology = this._callSerialize('regionalEcology') || clonePlain(state.regionalEcology || {});
    data.encounterDirector = this._serializeEncounterDirector();
    data.flight = this._serializeFlight();
    data.nav = this._serializeNav();
    data.settings = this._serializeSettings();
    return data;
  },

  /** Assemble the full versioned envelope around a serialized data payload. */
  serialize(slot) {
    const state = this.state;
    const data = this.serializeData();
    const json = safeStringify(data);
    return {
      fmt: FMT,
      version: CURRENT_VERSION,
      savedAt: new Date().toISOString(),
      playtimeS: Math.floor(state.meta.playtimeS || 0),
      slot: slot || state.save.currentSlot || 'quick',
      checksum: fnv1a(json),
      data,
    };
  },

  _serializeMeta() {
    const m = this.state.meta;
    return {
      version: CURRENT_VERSION,
      seed: m.seed,
      playtimeS: Math.floor(m.playtimeS || 0),
      createdAt: m.createdAt || '',
      lastSavedAt: new Date().toISOString(),
    };
  },

  // player meta record (core/ships/economy fields) — credits/cargo/combat config live here (§3.5).
  // Cargo gets its own key (§4.5), so it is dropped from the player blob to avoid duplication.
  _serializePlayer() {
    const p = this.state.player;
    const out = clonePlain(p);
    delete out.cargo;
    return out;
  },

  _serializeCargo() {
    const c = this.state.player.cargo || {};
    return { items: clonePlain(c.items || {}), capVolume: c.capVolume, capMass: c.capMass };
  },

  _serializeMissions() {
    return { missions: clonePlain(this.state.missions), story: clonePlain(this.state.story) };
  },

  _serializeAutomation() {
    return clonePlain(this.state.automation);
  },

  _serializeCrafting() {
    return clonePlain(this.state.crafting || { queues: {} });
  },

  _serializeNav() {
    return sanitizeNavState(navWithStableEntityIdentity(this.state));
  },

  /** Campaign-director durable subset. Never live encounters/squads/entity ids (§ownership). */
  _serializeEncounterDirector() {
    const d = this.state.encounterDirector;
    if (!d || typeof d !== 'object') return {};
    return clonePlain({
      named: d.named || {},
      receipts: Array.isArray(d.receipts) ? d.receipts.slice(-12) : [],
      cooldowns: d.cooldowns || {},
      stats: d.stats || {},
    });
  },

  _serializeFlight() {
    const flight = this.state.flight || {};
    const mode = flight.mode === 'cruise' || flight.mode === 'lane' ? flight.mode : 'manual';
    return {
      mode,
      previousMode: 'manual',
      modeReason: 'save',
      modeChangedTick: Number.isFinite(flight.modeChangedTick) ? flight.modeChangedTick : 0,
    };
  },

  _serializeSettings() {
    // H15: runtimeProfile is a build-time/runtime selection, not save state.
    // Exclude it so a legacy save cannot relabel a production runtime (or vice versa).
    const settings = clonePlain(this.state.settings);
    if (settings && settings.gameplay && Object.prototype.hasOwnProperty.call(settings.gameplay, 'runtimeProfile')) {
      delete settings.gameplay.runtimeProfile;
    }
    return settings;
  },

  _readProfileSettings() {
    return readProfileSettings(typeof localStorage === 'undefined' ? null : localStorage);
  },

  _loadProfileSettings() {
    const profile = migrateLegacyMasslineBindingProfile(this._readProfileSettings());
    if (!profile) return false;
    this.state.settings = sanitizeRestoredSettings(mergePlain(this.state.settings, profile));
    return true;
  },

  _writeProfileSettings() {
    if (typeof localStorage === 'undefined') return false;
    try {
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        settings: profileSettingsSnapshot(this.state.settings),
      };
      localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      this.bus && this.bus.emit && this.bus.emit('save:error', { slot: 'settings', reason: 'settings_write_failed' });
      return false;
    }
  },

  // Only the player entity (and any flags.persistent entity) serializes; stations/asteroids/NPCs
  // regenerate deterministically from the spawner on load (§4.5, §0.15). Positions as {x,z}, no mesh.
  _serializeEntities() {
    const state = this.state;
    const out = [];
    for (const e of state.entityList) {
      if (!e.alive) continue;
      if (e.id !== state.playerId && !(e.flags && e.flags.persistent)) continue;
      out.push(plainEntity(e, e.id === state.playerId));
    }
    return {
      player: out.find((x) => x._isPlayer) || null,
      persistent: out.filter((x) => !x._isPlayer),
      simTime: state.simTime,
      tick: state.tick,
    };
  },

  _callSerialize(name) {
    const sys = this.registry && this.registry.get && this.registry.get(name);
    if (sys && typeof sys.serialize === 'function') {
      try {
        const snapshot = sys.serialize();
        // Opt-in serializers prove that every returned branch is newly allocated or explicitly
        // copied from live state. Preserve the defensive clone for every unmarked subsystem.
        return sys.saveSnapshotOwned === true ? snapshot : clonePlain(snapshot);
      } catch (err) { console.error('[save] serialize ' + name, err); }
    }
    return null;
  },

  _hasPlayerEntity() {
    const state = this.state;
    return !!(state && state.playerId && state.entities && state.entities.get(state.playerId));
  },

  // ── save (write a slot) ─────────────────────────────────────────────────────────────────────

  /** Serialize the current state and persist it to localStorage under `slot`. */
  save(slot, options = {}) {
    slot = slot || 'quick';
    const reason = options.reason || (slot === AUTOSAVE_SLOT ? 'autosave' : 'manual');
    const autosave = !!options.autosave || slot === AUTOSAVE_SLOT;
    // An explicit manual save supersedes a queued autosave. Its already-scheduled callback carries
    // the old token and becomes a no-op, so the player never pays two back-to-back full writes.
    if (!autosave && this._autosavePending) this._autosavePending = null;
    const started = nowMs();
    if (!this._hasPlayerEntity()) {
      const timing = this._saveTiming({ slot, reason, autosave, started, ok: false, failure: 'no_player' });
      this._recordSaveTiming(timing);
      this.bus.emit('save:error', timing);
      return false;
    }
    this.bus.emit('save:started', { slot, reason, autosave });
    let envelope;
    let serializeMs = 0;
    try {
      const t = nowMs();
      envelope = this.serialize(slot);
      serializeMs = nowMs() - t;
    } catch (err) {
      console.error('[save] serialize failed', err);
      const timing = this._saveTiming({ slot, reason, autosave, started, serializeMs, ok: false, failure: 'serialize_failed' });
      this._recordSaveTiming(timing);
      this.bus.emit('save:error', timing);
      return false;
    }
    const t = nowMs();
    const write = this._writeSlot(slot, envelope);
    const writeMs = nowMs() - t;
    const timing = this._saveTiming({
      slot,
      reason,
      autosave,
      started,
      serializeMs,
      writeMs,
      stringifyMs: write.stringifyMs,
      storageMs: write.storageMs,
      indexMs: write.indexMs,
      bytes: write.bytes,
      ok: !!write.ok,
      failure: write.reason || null,
    });
    return this._publishSaveResult(slot, envelope, write, timing);
  },

  _writeSlot(slot, envelope, options = {}) {
    if (typeof localStorage === 'undefined') {
      return { ok: false, reason: 'no_storage', bytes: 0, stringifyMs: 0, storageMs: 0, indexMs: 0 };
    }
    let json = typeof options.json === 'string' ? options.json : null;
    let stringifyMs = Number(options.stringifyMs) || 0;
    let storageMs = 0;
    let indexMs = 0;
    if (json == null) {
      try {
        const t = nowMs();
        json = JSON.stringify(envelope);
        stringifyMs = nowMs() - t;
      }
      catch (err) { return { ok: false, reason: 'stringify_failed', bytes: 0, stringifyMs, storageMs, indexMs }; }
    }
    const primaryKey = LS_PREFIX + slot;
    const recoveryKey = RECOVERY_PREFIX + slot;
    let previousRaw = null;
    let previousPrepared = null;
    try { previousRaw = localStorage.getItem(primaryKey); }
    catch (err) { return { ok: false, reason: 'read_failed', bytes: json.length, stringifyMs, storageMs, indexMs }; }

    // Refuse to destroy the last known-good generation when storage cannot preserve it. A corrupt
    // primary is never rotated over an existing good recovery copy.
    if (previousRaw) previousPrepared = this._prepareEnvelopeString(previousRaw);
    if (previousPrepared && previousPrepared.ok) {
      try { localStorage.setItem(recoveryKey, previousRaw); }
      catch (err) {
        const reason = (err && err.name === 'QuotaExceededError') ? 'backup_quota' : 'backup_write_failed';
        return { ok: false, reason, bytes: json.length, stringifyMs, storageMs, indexMs };
      }
    }

    try {
      const t = nowMs();
      localStorage.setItem(primaryKey, json);
      storageMs = nowMs() - t;
    } catch (err) {
      // QuotaExceeded or storage disabled — suggest export-to-file fallback.
      const reason = (err && err.name === 'QuotaExceededError') ? 'quota' : 'write_failed';
      console.error('[save] write failed', err);
      return { ok: false, reason, bytes: json ? json.length : 0, stringifyMs, storageMs, indexMs };
    }

    // localStorage.setItem is normally atomic, but read-back validation catches storage shims,
    // truncated values, and checksum drift. Roll back to the previous bytes before reporting red.
    let storedRaw = null;
    try { storedRaw = localStorage.getItem(primaryKey); } catch (err) {}
    const storedPrepared = this._prepareEnvelopeString(storedRaw);
    if (storedRaw !== json || !storedPrepared.ok) {
      try {
        if (previousRaw == null) localStorage.removeItem(primaryKey);
        else localStorage.setItem(primaryKey, previousRaw);
      } catch (err) { /* preserve the recovery copy; caller receives a failed receipt */ }
      return {
        ok: false,
        reason: storedPrepared.reason === 'parse_failed' ? 'write_verify_parse' : 'write_verify_failed',
        bytes: json.length,
        stringifyMs,
        storageMs,
        indexMs,
      };
    }
    const t = nowMs();
    this._updateIndex(slot, envelope);
    indexMs = nowMs() - t;
    return {
      ok: true,
      bytes: json.length,
      stringifyMs,
      storageMs,
      indexMs,
      backupCreated: !!(previousPrepared && previousPrepared.ok),
      backupSavedAt: previousPrepared && previousPrepared.ok ? previousPrepared.env.savedAt || null : null,
    };
  },

  _saveTiming({ slot, reason, autosave, started, serializeMs = 0, writeMs = 0, stringifyMs = 0, storageMs = 0, indexMs = 0, backupMs = 0, readbackMs = 0, verifyMs = 0, workerSetupMs = 0, workerDispatchMs = 0, workerRoundtripMs = 0, captureStartedAtMs = null, captureEndedAtMs = null, bytes = 0, ok = true, failure = null, blockingSlicesMs = null, blockingSamples = null, serializerTimings = null, slowSerializer = null }) {
    const elapsedMs = roundSaveMs(nowMs() - started);
    const samples = Array.isArray(blockingSamples)
      ? blockingSamples.map((entry) => ({
        phase: String(entry && entry.phase || 'unattributed'),
        ms: Number(entry && entry.ms),
      })).filter((entry) => Number.isFinite(entry.ms) && entry.ms >= 0)
      : (Array.isArray(blockingSlicesMs)
        ? blockingSlicesMs.map((ms) => ({ phase: 'unattributed', ms: Number(ms) }))
        : [{ phase: 'elapsed', ms: elapsedMs }]);
    const slices = samples.map(({ ms }) => ms);
    const totalBlockingMs = slices.reduce((sum, value) => sum + value, 0);
    const maxBlockingSliceMs = slices.length ? Math.max(...slices) : 0;
    const maxBlockingSample = samples.reduce((best, entry) => (
      !best || entry.ms > best.ms ? entry : best
    ), null);
    const measuredSerializers = Array.isArray(serializerTimings)
      ? serializerTimings.filter((entry) => entry && Number.isFinite(Number(entry.ms))) : [];
    const maxSerializer = measuredSerializers.reduce((best, entry) => (
      !best || Number(entry.ms) > Number(best.ms) ? entry : best
    ), null);
    const observedTargetMet = maxBlockingSliceMs <= AUTOSAVE_TARGET_SLICE_MS;
    const observedHardLimitMet = maxBlockingSliceMs <= AUTOSAVE_HARD_SLICE_MS;
    return {
      slot,
      reason: ok ? reason : (failure || reason),
      trigger: reason,
      autosave: !!autosave,
      ok: !!ok,
      failure,
      // Elapsed includes safe idle/task gaps; CPU and max slice expose actual main-thread cost.
      durationMs: elapsedMs,
      totalMs: elapsedMs,
      elapsedMs,
      // Backward-compatible field name. This is the sum of synchronous wall/block observations,
      // not OS CPU accounting; see blockingClock below. Worker round-trip gaps are never included.
      totalCpuMs: totalBlockingMs,
      totalBlockingMs,
      maxBlockingSliceMs,
      maxBlockingPhase: maxBlockingSample ? maxBlockingSample.phase : 'none',
      blockingClock: 'high_resolution_sync_wall',
      targetSliceMs: AUTOSAVE_TARGET_SLICE_MS,
      hardSliceMs: AUTOSAVE_HARD_SLICE_MS,
      observedTargetMet,
      observedHardLimitMet,
      blockingSamples: samples.map(({ phase, ms }) => ({ phase, ms })),
      maxSerializerMs: maxSerializer ? Number(maxSerializer.ms) : 0,
      slowSerializer: slowSerializer
        || (maxSerializer && Number(maxSerializer.ms) > AUTOSAVE_HARD_SLICE_MS
          ? maxSerializer.key : null),
      serializerTimings: measuredSerializers.map((entry) => ({
        key: String(entry.key), ms: Number(entry.ms),
      })),
      serializeMs: roundSaveMs(serializeMs),
      writeMs: roundSaveMs(writeMs),
      stringifyMs: roundSaveMs(stringifyMs),
      storageMs: roundSaveMs(storageMs),
      indexMs: roundSaveMs(indexMs),
      backupMs: roundSaveMs(backupMs),
      readbackMs: roundSaveMs(readbackMs),
      verifyMs: roundSaveMs(verifyMs),
      workerSetupMs: roundSaveMs(workerSetupMs),
      workerDispatchMs: roundSaveMs(workerDispatchMs),
      workerRoundtripMs: roundSaveMs(workerRoundtripMs),
      captureStartedAtMs: Number.isFinite(Number(captureStartedAtMs))
        ? roundSaveMs(Number(captureStartedAtMs)) : null,
      captureEndedAtMs: Number.isFinite(Number(captureEndedAtMs))
        ? roundSaveMs(Number(captureEndedAtMs)) : null,
      bytes: Math.max(0, bytes | 0),
    };
  },

  _pushAutosaveSlice(owner, phase, ms) {
    const value = Number(ms);
    if (!owner || !Number.isFinite(value) || value < 0) return;
    const slices = Array.isArray(owner.blockingSlices) ? owner.blockingSlices : owner.slices;
    if (Array.isArray(slices)) slices.push(value);
    if (!Array.isArray(owner.blockingSamples)) owner.blockingSamples = [];
    owner.blockingSamples.push({ phase, ms: value });
  },

  _publishSaveResult(slot, envelope, write, timing) {
    this._recordSaveTiming(timing);
    if (write && write.ok) {
      this.state.save.currentSlot = slot;
      this.state.meta.lastSavedAt = envelope.savedAt;
      if (write.backupCreated) {
        this.bus.emit('save:backup', {
          slot,
          source: 'previous_generation',
          savedAt: write.backupSavedAt,
        });
      }
      this.bus.emit('save:completed', timing);
      return true;
    }
    this.bus.emit('save:error', timing);
    return false;
  },

  _recordSaveTiming(timing) {
    const perf = this.state && this.state.perfRuntime;
    if (perf && typeof perf.recordSave === 'function') perf.recordSave(timing);
  },

  // Lightweight slot index (§ design/specs/11) so the menu lists slots without parsing big blobs.
  _updateIndex(slot, envelope) {
    try {
      // The fallback scanner is for Continue/list repair, not the write hot path. Re-validating every
      // primary and recovery envelope here made one autosave pay an O(all save bytes) index tax.
      // A corrupt/missing index safely rebuilds when listSlots/_latestSlot next requests fallback.
      const idx = normalizeSlotIndex(this._readIndex());
      const state = this.state;
      const sectorId = state.world.currentSectorId;
      const sector = sectorId && state.world.sectors[sectorId];
      const shipDef = (state.player.ownedShips[state.player.activeShipIndex] || {}).defId || null;
      const navSummary = navObjectiveSummary(state.nav);
      const missionSummary = missionObjectiveSummary(state.missions, state.ui && state.ui.trackedMissionId);
      const storySummary = storyObjectiveSummary(state.story);
      idx[slot] = {
        slot,
        savedAt: envelope.savedAt,
        playtimeS: envelope.playtimeS,
        credits: state.player.credits,
        sectorName: (sector && sector.name) || sectorId || '',
        shipName: shipDef || '',
        navObjectiveSummary: navSummary,
        missionSummary,
        storySummary,
        objectiveSummary: resumeObjectiveSummary({ navSummary, missionSummary, storySummary }),
        version: envelope.version,
      };
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (err) { /* index is best-effort; never fail a save over it */ }
  },

  _readIndex() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const idx = raw ? JSON.parse(raw) : {};
      return (idx && typeof idx === 'object') ? idx : {};
    } catch (err) { return {}; }
  },

  _slotIndexWithFallback() {
    const indexed = normalizeSlotIndex(this._readIndex());
    const scanned = this._scanStoredSlots();
    const recovered = this._scanRecoverySlots(scanned);
    const merged = mergeSlotIndexes(indexed, scanned);
    for (const slot in recovered) {
      merged[slot] = Object.assign({}, merged[slot] || {}, recovered[slot], {
        slot,
        recoveryAvailable: true,
        integrity: 'recovery',
      });
    }
    // Stale index entries must not make Continue advertise a dead slot.
    for (const slot in merged) {
      if (!scanned[slot] && !recovered[slot]) delete merged[slot];
    }
    return merged;
  },

  _scanStoredSlots() {
    const out = {};
    if (typeof localStorage === 'undefined') return out;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(LS_PREFIX) || key === INDEX_KEY) continue;
        const slot = key.slice(LS_PREFIX.length);
        if (!slot || slot === 'index' || isUnsafePlainKey(slot)) continue;
        const prepared = this._prepareEnvelopeString(localStorage.getItem(key));
        if (!prepared.ok) continue;
        const meta = slotMetaFromEnvelope(slot, prepared.env);
        if (meta) out[slot] = meta;
      }
    } catch (err) {
      // localStorage scans are a recovery path; never break title/load screens.
    }
    return out;
  },

  _scanRecoverySlots(primarySlots = {}) {
    const out = {};
    if (typeof localStorage === 'undefined') return out;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(RECOVERY_PREFIX)) continue;
        const slot = key.slice(RECOVERY_PREFIX.length);
        if (!slot || isUnsafePlainKey(slot) || primarySlots[slot]) continue;
        const prepared = this._prepareEnvelopeString(localStorage.getItem(key));
        if (!prepared.ok) continue;
        const meta = slotMetaFromEnvelope(slot, prepared.env);
        if (meta) out[slot] = meta;
      }
    } catch (err) {
      // Backup discovery is best-effort; explicit load still attempts the named recovery key.
    }
    return out;
  },

  /** Public API for title + Save/Load (§ saveLoad.js readSlots). Returns {slot: meta}. */
  listSlots() { return this._slotIndexWithFallback(); },

  /** Resolve a 'latest' request to the newest slot in the index (used by Continue / mainMenu). */
  _latestSlot() {
    const idx = this._slotIndexWithFallback();
    let best = null, bestT = -1;
    for (const slot in idx) {
      if (!isOccupiedSlotMeta(idx[slot])) continue;
      const t = slotMetaScore(idx[slot]);
      if (t >= bestT) { bestT = t; best = slot; }
    }
    return best;
  },

  deleteSlot(slot) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_PREFIX + slot);
        localStorage.removeItem(RECOVERY_PREFIX + slot);
      }
      const idx = this._slotIndexWithFallback();
      delete idx[slot];
      if (typeof localStorage !== 'undefined') localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (err) { /* ignore */ }
  },

  // ── autosave ───────────────────────────────────────────────────────────────────────────────

  /** Debounced autosave to slot 'auto'. Never mid-jump, never while restoring / dead / not flying. */
  requestAutosave(_reason, options = {}) {
    const state = this.state;
    if (this._restoring) return false;
    if (state.mode !== 'flight') return false;
    if (this._playerDead) return false; // death/respawn pending (combat signals via events)
    if (this._autosavePending || this._autosaveInFlight) return false;
    const now = nowMs();
    if (!options.force && now - this._lastAutosaveAt < AUTOSAVE_DEBOUNCE_MS) return false;
    const job = {
      reason: _reason || 'autosave',
      force: !!options.force,
      requestedAt: now,
      runEpoch: this._runEpoch,
    };
    this._autosavePending = job;
    try {
      this._scheduleAutosaveWork(() => this._flushAutosave(job));
      return true;
    } catch (err) {
      this._autosavePending = null;
      const timing = this._saveTiming({
        slot: AUTOSAVE_SLOT,
        reason: job.reason,
        autosave: true,
        started: job.requestedAt,
        ok: false,
        failure: 'schedule_failed',
      });
      this._recordSaveTiming(timing);
      this.bus.emit('save:error', timing);
      return false;
    }
  },

  /**
   * Browser task boundary for autosave hops. Tests replace this method with a deterministic queue.
   *
   * Prefer a prompt macrotask (setTimeout 0). Do NOT use requestIdleCallback with a 250ms timeout:
   * under crowded-flight main-thread pressure idle never arrives, so each hop starves for the full
   * deadline (~32 encode keys × 250ms can exceed SAVE_WORKER_TIMEOUT_MS and the perf sample window).
   * Retry (jump/pause busy) still backs off so we do not spin while the gate is closed.
   */
  _scheduleAutosaveWork(callback, retry = false) {
    return setTimeout(callback, retry ? 120 : 0);
  },

  _flushAutosave(job) {
    if (!job || this._autosavePending !== job || this._autosaveInFlight
      || job.runEpoch !== this._runEpoch) return false;
    const state = this.state;
    const jumpBusy = state.jump && (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING');
    if (this._restoring || this._playerDead || jumpBusy || state.mode === 'paused') {
      this._scheduleAutosaveWork(() => this._flushAutosave(job), true);
      return false;
    }
    if (state.mode !== 'flight') {
      this._autosavePending = null;
      return false;
    }

    this._autosavePending = null;
    this._autosaveInFlight = true;
    this._activeAutosaveJob = job;
    job.generation = ++this._autosaveGeneration;
    job.restoreSequence = this._restoreSequence;
    this.bus.emit('save:started', { slot: AUTOSAVE_SLOT, reason: job.reason, autosave: true });
    if (!this._hasPlayerEntity()) {
      const timing = this._saveTiming({
        slot: AUTOSAVE_SLOT, reason: job.reason, autosave: true, started: job.requestedAt,
        ok: false, failure: 'no_player', blockingSlicesMs: [0],
      });
      this._autosaveInFlight = false;
      this._activeAutosaveJob = null;
      return this._publishSaveResult(AUTOSAVE_SLOT, null, { ok: false }, timing);
    }

    // Test/tool callers may replace serialize() with a fully-authored envelope. Preserve that public
    // seam and the synchronous safe fallback; normal play uses keyed incremental capture below.
    if (this.serialize !== CANONICAL_SAVE_SERIALIZE) return this._captureLegacyAutosave(job);

    const descriptor = this._autosaveDescriptor();
    const capture = {
      plan: this._saveCapturePlan(),
      data: {},
      index: 0,
      tick: this.state.tick,
      restarts: 0,
      runEpoch: job.runEpoch,
      blockingSlices: [],
      blockingSamples: [],
      serializerTimings: [],
      serializeMs: 0,
      workerSetupMs: 0,
      workerDispatchMs: 0,
      workerRoundtripMs: 0,
      workerAttempts: 0,
      captureStartedAtMs: null,
      captureEndedAtMs: null,
      descriptor,
    };
    job.capture = capture;
    return this._captureAutosaveSlice(job, capture);
  },

  _autosaveDescriptor() {
    return {
      fmt: FMT,
      version: CURRENT_VERSION,
      savedAt: new Date().toISOString(),
      playtimeS: Math.floor(this.state.meta.playtimeS || 0),
      slot: AUTOSAVE_SLOT,
    };
  },

  /**
   * Exercise the exact production capture readers once while the loading shell still owns the
   * route. The first browser invocation pays module/JIT setup that can otherwise make the first
   * real autosave exceed its 12 ms main-thread task limit even though subsequent captures are
   * comfortably bounded. No snapshot is retained or written, and this is deliberately refused in
   * playable modes so performance preparation can never become a hidden in-flight hitch.
   */
  primeAutosaveCapture() {
    if (!this.state || this.state.mode !== 'loading' || !this._hasPlayerEntity()) return false;
    try {
      for (const [, read] of this._saveCapturePlan()) read();
      return true;
    } catch (error) {
      // Save reliability does not depend on preparation. A later real save still owns its normal
      // error receipt and defensive fallback behavior.
      console.warn('[save] autosave capture preparation failed', error);
      return false;
    }
  },

  _captureAutosaveSlice(job, capture) {
    if (!this._autosaveJobCurrent(job) || capture.runEpoch !== this._runEpoch) return false;
    const started = workNowMs();
    capture.captureStartedAtMs = started;
    try {
      // Capture every subsystem exactly once in one coherent JS task. Splitting live-state readers
      // across future ticks cannot produce an authoritative snapshot, and restarting on every tick
      // starves forever during normal 60 Hz play. Encoding, validation, and storage remain chunked.
      while (capture.index < capture.plan.length) {
        const [key, read] = capture.plan[capture.index++];
        const serializerStarted = workNowMs();
        capture.data[key] = read();
        const serializerMs = workNowMs() - serializerStarted;
        capture.serializerTimings.push({ key, ms: serializerMs });
        if (serializerMs > AUTOSAVE_HARD_SLICE_MS && !capture.slowSerializer) {
          capture.slowSerializer = key;
        }
      }
    } catch (error) {
      capture.captureEndedAtMs = workNowMs();
      console.error('[save] autosave capture failed', error);
      return this._failAutosave(job, 'serialize_failed', capture, workNowMs() - started);
    }
    capture.captureEndedAtMs = workNowMs();
    const sliceMs = capture.captureEndedAtMs - started;
    capture.serializeMs += sliceMs;
    this._pushAutosaveSlice(capture, 'capture', sliceMs);
    return this._startAutosaveEncoding(job, capture);
  },

  _startAutosaveEncoding(job, capture) {
    const setupStarted = workNowMs();
    const worker = this._trackSaveWorker(this._createSaveWorker());
    const setupMs = workNowMs() - setupStarted;
    capture.workerSetupMs += setupMs;
    this._pushAutosaveSlice(capture, 'encode_worker_setup', setupMs);
    // Timing is evidence, not a transaction precondition. A wall observation can include OS
    // preemption, and aborting after the block already happened only destroys save reliability.
    // The receipt carries the unchanged 8/12 ms targets and an explicit observed budget result.
    if (!worker) {
      this._scheduleAutosaveWork(() => this._encodeAutosaveFallback(job, capture));
      return true;
    }
    capture.workerAttempts++;
    const encoder = {
      worker,
      id: ++this._saveWorkerRequestId,
      entries: Object.entries(capture.data),
      index: 0,
      settled: false,
      timeout: null,
      runEpoch: job.runEpoch,
      roundtripStartedAtMs: nowMs(),
    };
    const fail = (failure = 'save_worker_failed', fallback = true) => {
      if (encoder.settled) return;
      encoder.settled = true;
      capture.workerRoundtripMs += Math.max(0, nowMs() - encoder.roundtripStartedAtMs);
      clearTimeout(encoder.timeout);
      worker.__spacefaceSaveSupersede = null;
      try { worker.terminate(); } catch (error) {}
      if (this._autosaveJobCurrent(job)) {
        if (fallback && capture.workerAttempts < 2) {
          this._scheduleAutosaveWork(() => this._startAutosaveEncoding(job, capture));
        } else if (fallback) {
          this._scheduleAutosaveWork(() => this._encodeAutosaveFallback(job, capture));
        }
        else this._failAutosave(job, failure, capture);
      }
    };
    worker.onmessage = (event) => {
      const message = event && event.data;
      if (!message || message.id !== encoder.id || message.type !== 'encoded'
        || typeof message.json !== 'string') return fail('save_worker_failed');
      encoder.settled = true;
      capture.workerRoundtripMs += Math.max(0, nowMs() - encoder.roundtripStartedAtMs);
      clearTimeout(encoder.timeout);
      worker.__spacefaceSaveSupersede = null;
      try { worker.terminate(); } catch (error) {}
      if (!this._autosaveJobCurrent(job)) return;
      const envelope = { ...capture.descriptor, checksum: message.checksum, data: capture.data };
      this._beginAutosaveTransaction(job, {
        envelope,
        json: message.json,
        serializeMs: capture.serializeMs,
        stringifyMs: Number(message.workerCpuMs) || 0,
        blockingSlices: capture.blockingSlices,
        blockingSamples: capture.blockingSamples,
        serializerTimings: capture.serializerTimings,
        slowSerializer: capture.slowSerializer || null,
        workerSetupMs: capture.workerSetupMs,
        workerDispatchMs: capture.workerDispatchMs,
        workerRoundtripMs: capture.workerRoundtripMs,
        captureStartedAtMs: capture.captureStartedAtMs,
        captureEndedAtMs: capture.captureEndedAtMs,
      });
    };
    worker.onerror = () => fail('save_worker_failed');
    worker.__spacefaceSaveSupersede = () => fail('superseded', false);
    encoder.timeout = setTimeout(() => fail('save_worker_timeout'), SAVE_WORKER_TIMEOUT_MS);
    const started = workNowMs();
    try { worker.postMessage({ id: encoder.id, type: 'encode_begin', payload: { descriptor: capture.descriptor } }); }
    catch (error) { fail(); return true; }
    const beginDispatchMs = workNowMs() - started;
    capture.workerDispatchMs += beginDispatchMs;
    this._pushAutosaveSlice(capture, 'encode_begin_dispatch', beginDispatchMs);
    this._scheduleAutosaveWork(() => this._postAutosaveEncodeParts(job, capture, encoder, fail));
    return true;
  },

  _beginRunEpoch(_reason = 'run') {
    this._cancelActiveAutosave('superseded');
    const current = Number.isSafeInteger(this._runEpoch) ? this._runEpoch : 0;
    this._runEpoch = current + 1;
    this._autosaveGeneration = (Number.isSafeInteger(this._autosaveGeneration)
      ? this._autosaveGeneration : 0) + 1;
    this._autosavePending = null;
    const workers = this._activeSaveWorkers ? [...this._activeSaveWorkers] : [];
    for (const worker of workers) {
      try {
        if (typeof worker.__spacefaceSaveSupersede === 'function') worker.__spacefaceSaveSupersede();
        else worker.terminate();
      } catch (error) {}
    }
    return this._runEpoch;
  },

  _beginRestoreSequence() {
    this._cancelActiveAutosave('superseded');
    const previous = Number.isSafeInteger(this._restoreSequence) ? this._restoreSequence : 0;
    this._restoreSequence = previous + 1;
    const workers = this._activeSaveWorkers ? [...this._activeSaveWorkers] : [];
    for (const worker of workers) {
      try {
        if (typeof worker.__spacefaceSaveSupersede === 'function') worker.__spacefaceSaveSupersede();
        else worker.terminate();
      } catch (error) {}
    }
    return this._restoreSequence;
  },

  _cancelActiveAutosave(reason = 'superseded') {
    const active = this._activeAutosaveTransaction;
    const job = active && active.job || this._activeAutosaveJob || this._autosavePending;
    this._autosavePending = null;
    if (!job) return false;
    if (active && !active.tx.finished) {
      active.tx.cancelReason = reason;
      if (active.tx.primaryWritten && !active.tx.rollbackDone) {
        return this._scheduleAutosaveRollback(active.job, active.snapshot, active.tx, reason);
      }
      return this._finishAutosaveTransaction(active.job, active.snapshot, active.tx, {
        ok: false,
        reason,
      });
    }
    if (this._autosaveInFlight || this._activeAutosaveJob === job) {
      return this._failAutosave(job, reason, job.capture || null);
    }
    const timing = this._saveTiming({
      slot: AUTOSAVE_SLOT,
      reason: job.reason,
      autosave: true,
      started: job.requestedAt,
      ok: false,
      failure: reason,
      blockingSlicesMs: [0],
    });
    this._recordSaveTiming(timing);
    this.bus.emit('save:error', timing);
    return false;
  },

  _postAutosaveEncodeParts(job, capture, encoder, fail) {
    if (!this._autosaveJobCurrent(job) || encoder.runEpoch !== this._runEpoch) {
      fail('superseded', false);
      return false;
    }
    if (encoder.settled) return false;
    // Batch multiple encode_part posts in one scheduled callback while the synchronous wall stays
    // under AUTOSAVE_TARGET_SLICE_MS. Always post at least one key; defer encode_finish when the
    // current task has already consumed the next post's observed headroom.
    // Never relax AUTOSAVE_HARD_SLICE_MS — a single oversized clone still reports raw telemetry.
    const started = workNowMs();
    let posted = 0;
    let lastPostMs = 0;
    try {
      while (encoder.index < encoder.entries.length) {
        const elapsed = workNowMs() - started;
        // Reserve the last observed structured-clone cost before starting another post. Checking
        // elapsed alone can admit two stable 6ms posts and turn an 8ms-target task into a >12ms one.
        if (posted > 0 && elapsed + lastPostMs >= AUTOSAVE_TARGET_SLICE_MS) break;
        const [key, value] = encoder.entries[encoder.index++];
        const postStarted = workNowMs();
        encoder.worker.postMessage({ id: encoder.id, type: 'encode_part', payload: { key, value } });
        lastPostMs = workNowMs() - postStarted;
        posted++;
      }
      if (encoder.index >= encoder.entries.length && !encoder.finishPosted) {
        const elapsed = workNowMs() - started;
        if (posted > 0 && elapsed + lastPostMs >= AUTOSAVE_TARGET_SLICE_MS) {
          encoder.finishPending = true;
        } else {
          encoder.worker.postMessage({ id: encoder.id, type: 'encode_finish' });
          encoder.finishPosted = true;
          encoder.finishPending = false;
        }
      }
    } catch (error) {
      const errorSliceMs = workNowMs() - started;
      capture.workerDispatchMs += errorSliceMs;
      this._pushAutosaveSlice(capture, 'encode_part_dispatch_error', errorSliceMs);
      fail();
      return false;
    }
    const sliceMs = workNowMs() - started;
    capture.workerDispatchMs += sliceMs;
    this._pushAutosaveSlice(capture,
      posted > 0 ? 'encode_part_dispatch' : 'encode_finish_dispatch', sliceMs);
    if (encoder.index < encoder.entries.length || encoder.finishPending) {
      this._scheduleAutosaveWork(() => this._postAutosaveEncodeParts(job, capture, encoder, fail));
    }
    return true;
  },

  _encodeAutosaveFallback(job, capture) {
    if (!this._autosaveJobCurrent(job)) return false;
    const started = workNowMs();
    let encoded;
    try { encoded = encodeSavePayload({ descriptor: capture.descriptor, data: capture.data }); }
    catch (error) { return this._failAutosave(job, 'stringify_failed', capture, workNowMs() - started); }
    const encodeMs = workNowMs() - started;
    if (encodeMs > AUTOSAVE_HARD_SLICE_MS) {
      capture.slowSerializer = 'sync_encode_fallback';
    }
    const snapshot = {
      envelope: { ...capture.descriptor, checksum: encoded.checksum, data: capture.data },
      json: encoded.json,
      serializeMs: capture.serializeMs,
      stringifyMs: encodeMs,
      blockingSlices: [...capture.blockingSlices, encodeMs],
      blockingSamples: [...capture.blockingSamples, { phase: 'sync_encode_fallback', ms: encodeMs }],
      serializerTimings: capture.serializerTimings,
      slowSerializer: capture.slowSerializer || null,
      workerSetupMs: capture.workerSetupMs,
      workerDispatchMs: capture.workerDispatchMs,
      workerRoundtripMs: capture.workerRoundtripMs,
      captureStartedAtMs: capture.captureStartedAtMs,
      captureEndedAtMs: capture.captureEndedAtMs,
    };
    // No worker means validation cannot be moved safely. Keep the existing transactional sync path
    // as a correctness fallback and isolate it in its own task.
    this._scheduleAutosaveWork(() => this._commitAutosaveSnapshot(job, snapshot));
    return true;
  },

  _captureLegacyAutosave(job) {

    const sliceStarted = workNowMs();
    let envelope;
    let json;
    let serializeMs = 0;
    let stringifyMs = 0;
    try {
      const serializeStarted = workNowMs();
      envelope = this.serialize(AUTOSAVE_SLOT);
      serializeMs = workNowMs() - serializeStarted;
      const stringifyStarted = workNowMs();
      json = JSON.stringify(envelope);
      stringifyMs = workNowMs() - stringifyStarted;
    } catch (err) {
      console.error('[save] autosave snapshot failed', err);
      const snapshotSliceMs = workNowMs() - sliceStarted;
      const timing = this._saveTiming({
        slot: AUTOSAVE_SLOT, reason: job.reason, autosave: true, started: job.requestedAt,
        serializeMs, stringifyMs, ok: false, failure: 'serialize_failed',
        blockingSlicesMs: [snapshotSliceMs],
      });
      this._autosaveInFlight = false;
      if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
      return this._publishSaveResult(AUTOSAVE_SLOT, null, { ok: false }, timing);
    }
    const snapshot = {
      envelope,
      json,
      serializeMs,
      stringifyMs,
      blockingSliceMs: workNowMs() - sliceStarted,
      blockingSlices: [workNowMs() - sliceStarted],
    };
    try {
      this._scheduleAutosaveWork(() => this._commitAutosaveSnapshot(job, snapshot));
      return true;
    } catch (err) {
      const timing = this._saveTiming({
        slot: AUTOSAVE_SLOT, reason: job.reason, autosave: true, started: job.requestedAt,
        serializeMs, stringifyMs, ok: false, failure: 'schedule_failed',
        blockingSlicesMs: [snapshot.blockingSliceMs],
      });
      this._autosaveInFlight = false;
      if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
      return this._publishSaveResult(AUTOSAVE_SLOT, null, { ok: false }, timing);
    }
  },

  _commitAutosaveSnapshot(job, snapshot) {
    if (!job || !snapshot || !this._autosaveInFlight) return false;
    if (this._restoring || job.restoreSequence !== this._restoreSequence) {
      const timing = this._saveTiming({
        slot: AUTOSAVE_SLOT, reason: job.reason, autosave: true, started: job.requestedAt,
        serializeMs: snapshot.serializeMs, stringifyMs: snapshot.stringifyMs,
        ok: false, failure: 'superseded', blockingSlicesMs: snapshot.blockingSlices || [snapshot.blockingSliceMs, 0],
      });
      this._autosaveInFlight = false;
      if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
      return this._publishSaveResult(AUTOSAVE_SLOT, null, { ok: false }, timing);
    }

    const writeStarted = workNowMs();
    const write = this._writeSlot(AUTOSAVE_SLOT, snapshot.envelope, {
      json: snapshot.json,
      stringifyMs: snapshot.stringifyMs,
    });
    const writeSliceMs = workNowMs() - writeStarted;
    const timing = this._saveTiming({
      slot: AUTOSAVE_SLOT,
      reason: job.reason,
      autosave: true,
      started: job.requestedAt,
      serializeMs: snapshot.serializeMs,
      writeMs: writeSliceMs,
      stringifyMs: snapshot.stringifyMs,
      storageMs: write.storageMs,
      indexMs: write.indexMs,
      bytes: write.bytes,
      ok: !!write.ok,
      failure: write.reason || null,
      blockingSlicesMs: [...(snapshot.blockingSlices || [snapshot.blockingSliceMs]), writeSliceMs],
    });
    const ok = this._publishSaveResult(AUTOSAVE_SLOT, snapshot.envelope, write, timing);
    if (ok) {
      const completedAt = nowMs();
      this._lastAutosaveAt = completedAt;
      this._lastAutosavePlaytime = this.state.meta.playtimeS;
      this.state.save.lastAutosaveAt = completedAt;
    }
    this._autosaveInFlight = false;
    if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
    return ok;
  },

  _autosaveJobCurrent(job) {
    return !!(job && this._autosaveInFlight
      && job.generation === this._autosaveGeneration
      && job.runEpoch === this._runEpoch);
  },

  _trackSaveWorker(worker) {
    if (!worker) return null;
    if (!this._activeSaveWorkers) this._activeSaveWorkers = new Set();
    if (worker.__spacefaceSaveWorkerTracked) {
      this._activeSaveWorkers.add(worker);
      return worker;
    }
    const originalTerminate = typeof worker.terminate === 'function'
      ? worker.terminate.bind(worker) : () => {};
    const objectUrl = worker.__spacefaceSaveObjectUrl || null;
    const owner = this;
    let disposed = false;
    worker.terminate = () => {
      if (disposed) return;
      disposed = true;
      try { originalTerminate(); }
      finally {
        owner._activeSaveWorkers && owner._activeSaveWorkers.delete(worker);
        if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try { URL.revokeObjectURL(objectUrl); } catch (error) {}
        }
      }
    };
    worker.__spacefaceSaveWorkerTracked = true;
    this._activeSaveWorkers.add(worker);
    return worker;
  },

  _createSaveWorker() {
    if (typeof Worker !== 'function' || typeof Blob !== 'function'
      || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    let objectUrl = null;
    try {
      objectUrl = URL.createObjectURL(new Blob([SAVE_WORKER_SOURCE], { type: 'text/javascript' }));
      const worker = new Worker(objectUrl, { name: 'spaceface-save' });
      worker.__spacefaceSaveObjectUrl = objectUrl;
      return this._trackSaveWorker(worker);
    }
    catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return null;
    }
  },

  _requestSaveWorker(type, payload, onResult, onFailure, options = {}) {
    const worker = this._trackSaveWorker(this._createSaveWorker());
    if (!worker) return false;
    const id = ++this._saveWorkerRequestId;
    const roundtripStartedAtMs = nowMs();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.__spacefaceSaveSupersede = null;
      try { worker.terminate(); } catch (error) {}
      if (typeof options.onRoundtrip === 'function') {
        try { options.onRoundtrip(Math.max(0, nowMs() - roundtripStartedAtMs)); } catch (error) {}
      }
      callback(value);
    };
    const timeout = setTimeout(() => finish(onFailure, new Error('save_worker_timeout')), SAVE_WORKER_TIMEOUT_MS);
    worker.__spacefaceSaveSupersede = () => finish(onFailure, new Error('superseded'));
    worker.onmessage = (event) => {
      const message = event && event.data;
      if (!message || message.id !== id || message.type === 'error') {
        finish(onFailure, new Error(message && message.reason || 'save_worker_failed'));
        return;
      }
      finish(onResult, message);
    };
    worker.onerror = () => finish(onFailure, new Error('save_worker_failed'));
    const recordSlice = (phase, started) => {
      if (typeof options.onSlice !== 'function') return;
      try { options.onSlice(phase, workNowMs() - started); } catch (error) {}
    };
    if (type === 'validate' && payload && typeof payload.raw === 'string'
      && payload.raw.length > SAVE_VALIDATION_CHUNK_CHARS) {
      try {
        worker.postMessage({
          id,
          type: 'validate_begin',
          payload: { currentVersion: payload.currentVersion },
        });
      } catch (error) {
        finish(onFailure, error);
        return true;
      }
      let offset = 0;
      const postNextChunk = () => {
        if (settled) return;
        // Bounded multi-chunk batch: keep posting validate_part while under the 8ms target so a
        // large previous/readback envelope does not spend one hop per 8KB under main-thread load.
        const started = workNowMs();
        try {
          let postedParts = 0;
          let lastPartMs = 0;
          while (offset < payload.raw.length) {
            const elapsed = workNowMs() - started;
            if (postedParts > 0 && elapsed + lastPartMs >= AUTOSAVE_TARGET_SLICE_MS) break;
            const end = Math.min(payload.raw.length, offset + SAVE_VALIDATION_CHUNK_CHARS);
            const partStarted = workNowMs();
            worker.postMessage({
              id,
              type: 'validate_part',
              payload: { chunk: payload.raw.slice(offset, end) },
            });
            lastPartMs = workNowMs() - partStarted;
            offset = end;
            postedParts++;
          }
          if (offset < payload.raw.length) {
            recordSlice('validate_chunk_dispatch', started);
            this._scheduleAutosaveWork(postNextChunk);
            return;
          }
          const elapsed = workNowMs() - started;
          if (postedParts > 0
            && elapsed + lastPartMs >= AUTOSAVE_TARGET_SLICE_MS) {
            recordSlice('validate_chunk_dispatch', started);
            this._scheduleAutosaveWork(() => {
              if (settled) return;
              const finishStarted = workNowMs();
              try {
                worker.postMessage({ id, type: 'validate_finish' });
                recordSlice('validate_finish_dispatch', finishStarted);
              } catch (error) {
                recordSlice('validate_dispatch_error', finishStarted);
                finish(onFailure, error);
              }
            });
            return;
          }
          worker.postMessage({ id, type: 'validate_finish' });
          recordSlice(postedParts > 0 ? 'validate_chunk_dispatch' : 'validate_finish_dispatch', started);
        } catch (error) {
          recordSlice('validate_dispatch_error', started);
          finish(onFailure, error);
        }
      };
      this._scheduleAutosaveWork(postNextChunk);
    } else {
      try { worker.postMessage({ id, type, payload }); }
      catch (error) { finish(onFailure, error); }
    }
    return true;
  },

  _beginAutosaveTransaction(job, snapshot) {
    if (!this._autosaveJobCurrent(job)) return false;
    const tx = {
      runEpoch: job.runEpoch,
      slices: [...(snapshot.blockingSlices || [])],
      blockingSamples: [...(snapshot.blockingSamples || [])],
      previousRaw: null,
      previousValid: false,
      previousSavedAt: null,
      backupMs: 0,
      storageMs: 0,
      readbackMs: 0,
      verifyMs: 0,
      indexMs: 0,
      workerRoundtripMs: Number(snapshot.workerRoundtripMs) || 0,
      primaryWritten: false,
      rollbackScheduled: false,
      rollbackDone: false,
      cancelReason: null,
      finished: false,
    };
    this._activeAutosaveTransaction = { job, snapshot, tx };
    this._scheduleAutosaveWork(() => this._autosaveReadPrevious(job, snapshot, tx));
    return true;
  },

  _autosaveReadPrevious(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    try { tx.previousRaw = localStorage.getItem(LS_PREFIX + AUTOSAVE_SLOT); }
    catch (error) { return this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason: 'read_failed' }); }
    const readMs = workNowMs() - started;
    tx.readbackMs += readMs;
    this._pushAutosaveSlice(tx, 'storage_read_previous', readMs);
    if (!tx.previousRaw) {
      this._scheduleAutosaveWork(() => this._autosaveWriteBackup(job, snapshot, tx));
      return true;
    }
    return this._autosaveValidatePrevious(job, snapshot, tx);
  },

  _autosaveValidatePrevious(job, snapshot, tx) {
    const started = workNowMs();
    const posted = this._requestSaveWorker('validate', {
      raw: tx.previousRaw,
      currentVersion: CURRENT_VERSION,
    }, (message) => {
      if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return;
      const result = message && message.result;
      if (result && result.ok && result.version === CURRENT_VERSION) {
        tx.previousValid = true;
        tx.previousSavedAt = result.savedAt || null;
        this._scheduleAutosaveWork(() => this._autosaveWriteBackup(job, snapshot, tx));
        return;
      }
      if (result && result.ok && result.version < CURRENT_VERSION) {
        this._scheduleAutosaveWork(() => {
          const verifyStarted = workNowMs();
          const prepared = this._prepareEnvelopeString(tx.previousRaw);
          const verifyMs = workNowMs() - verifyStarted;
          tx.verifyMs += verifyMs;
          this._pushAutosaveSlice(tx, 'validate_previous_migration', verifyMs);
          tx.previousValid = !!prepared.ok;
          tx.previousSavedAt = prepared.ok && prepared.env.savedAt || null;
          this._scheduleAutosaveWork(() => this._autosaveWriteBackup(job, snapshot, tx));
        });
        return;
      }
      this._scheduleAutosaveWork(() => this._autosaveWriteBackup(job, snapshot, tx));
    }, (error) => {
      if (error && error.message === 'superseded') {
        this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason: 'superseded' });
        return;
      }
      this._scheduleAutosaveWork(() => this._autosaveValidatePreviousSync(job, snapshot, tx));
    }, {
      onSlice: (phase, ms) => {
        tx.verifyMs += ms;
        this._pushAutosaveSlice(tx, `previous_${phase}`, ms);
      },
      onRoundtrip: (ms) => { tx.workerRoundtripMs += ms; },
    });
    const dispatchMs = workNowMs() - started;
    tx.verifyMs += dispatchMs;
    this._pushAutosaveSlice(tx, 'validate_previous_setup', dispatchMs);
    if (!posted) this._scheduleAutosaveWork(() => this._autosaveValidatePreviousSync(job, snapshot, tx));
    return true;
  },

  _autosaveValidatePreviousSync(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    const prepared = this._prepareEnvelopeString(tx.previousRaw);
    const verifyMs = workNowMs() - started;
    tx.verifyMs += verifyMs;
    this._pushAutosaveSlice(tx, 'validate_previous_sync', verifyMs);
    tx.previousValid = !!prepared.ok;
    tx.previousSavedAt = prepared.ok && prepared.env.savedAt || null;
    this._scheduleAutosaveWork(() => this._autosaveWriteBackup(job, snapshot, tx));
    return true;
  },

  _autosaveWriteBackup(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    if (tx.previousRaw && tx.previousValid) {
      try { localStorage.setItem(RECOVERY_PREFIX + AUTOSAVE_SLOT, tx.previousRaw); }
      catch (error) {
        const failureMs = workNowMs() - started;
        tx.backupMs += failureMs;
        this._pushAutosaveSlice(tx, 'storage_write_backup_error', failureMs);
        const reason = error && error.name === 'QuotaExceededError' ? 'backup_quota' : 'backup_write_failed';
        return this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason });
      }
    }
    const sliceMs = workNowMs() - started;
    tx.backupMs += sliceMs;
    this._pushAutosaveSlice(tx, 'storage_write_backup', sliceMs);
    this._scheduleAutosaveWork(() => this._autosaveWritePrimary(job, snapshot, tx));
    return true;
  },

  _autosaveWritePrimary(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    try { localStorage.setItem(LS_PREFIX + AUTOSAVE_SLOT, snapshot.json); }
    catch (error) {
      const failureMs = workNowMs() - started;
      tx.storageMs += failureMs;
      this._pushAutosaveSlice(tx, 'storage_write_primary_error', failureMs);
      const reason = error && error.name === 'QuotaExceededError' ? 'quota' : 'write_failed';
      return this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason });
    }
    const sliceMs = workNowMs() - started;
    tx.primaryWritten = true;
    tx.storageMs += sliceMs;
    this._pushAutosaveSlice(tx, 'storage_write_primary', sliceMs);
    this._scheduleAutosaveWork(() => this._autosaveReadback(job, snapshot, tx));
    return true;
  },

  _autosaveReadback(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    let storedRaw = null;
    try { storedRaw = localStorage.getItem(LS_PREFIX + AUTOSAVE_SLOT); }
    catch (error) {}
    const matches = storedRaw === snapshot.json;
    const sliceMs = workNowMs() - started;
    tx.readbackMs += sliceMs;
    this._pushAutosaveSlice(tx, 'storage_readback', sliceMs);
    if (!matches) return this._scheduleAutosaveRollback(job, snapshot, tx, 'write_verify_failed');

    const verifyStarted = workNowMs();
    const posted = this._requestSaveWorker('validate', {
      raw: storedRaw,
      currentVersion: CURRENT_VERSION,
    }, (message) => {
      if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return;
      const result = message && message.result;
      if (!result || !result.ok) {
        this._scheduleAutosaveRollback(job, snapshot, tx,
          result && result.reason === 'parse_failed' ? 'write_verify_parse' : 'write_verify_failed');
        return;
      }
      this._scheduleAutosaveWork(() => this._autosaveWriteIndex(job, snapshot, tx));
    }, (error) => {
      if (error && error.message === 'superseded') {
        this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason: 'superseded' });
        return;
      }
      this._scheduleAutosaveWork(() => this._autosaveValidateReadbackSync(job, snapshot, tx, storedRaw));
    }, {
      onSlice: (phase, ms) => {
        tx.verifyMs += ms;
        this._pushAutosaveSlice(tx, `readback_${phase}`, ms);
      },
      onRoundtrip: (ms) => { tx.workerRoundtripMs += ms; },
    });
    const dispatchMs = workNowMs() - verifyStarted;
    tx.verifyMs += dispatchMs;
    this._pushAutosaveSlice(tx, 'validate_readback_setup', dispatchMs);
    if (!posted) this._scheduleAutosaveWork(() => this._autosaveValidateReadbackSync(job, snapshot, tx, storedRaw));
    return true;
  },

  _autosaveValidateReadbackSync(job, snapshot, tx, storedRaw) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    const prepared = this._prepareEnvelopeString(storedRaw);
    const verifyMs = workNowMs() - started;
    tx.verifyMs += verifyMs;
    this._pushAutosaveSlice(tx, 'validate_readback_sync', verifyMs);
    if (!prepared.ok) {
      return this._scheduleAutosaveRollback(job, snapshot, tx,
        prepared.reason === 'parse_failed' ? 'write_verify_parse' : 'write_verify_failed');
    }
    this._scheduleAutosaveWork(() => this._autosaveWriteIndex(job, snapshot, tx));
    return true;
  },

  _scheduleAutosaveRollback(job, snapshot, tx, reason) {
    if (!tx || tx.finished) return false;
    if (tx.rollbackDone) {
      return this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason });
    }
    if (tx.rollbackScheduled) return true;
    tx.rollbackScheduled = true;
    this._scheduleAutosaveWork(() => {
      tx.rollbackScheduled = false;
      if (tx.finished) return;
      const started = workNowMs();
      let rollbackOk = true;
      try {
        if (tx.previousRaw == null) localStorage.removeItem(LS_PREFIX + AUTOSAVE_SLOT);
        else localStorage.setItem(LS_PREFIX + AUTOSAVE_SLOT, tx.previousRaw);
      } catch (error) { rollbackOk = false; }
      const rollbackMs = workNowMs() - started;
      tx.storageMs += rollbackMs;
      this._pushAutosaveSlice(tx, 'storage_rollback', rollbackMs);
      // The cleanup owner gets one authoritative rollback attempt and one terminal receipt. A
      // storage exception is reported as rollback_failed; it must not enqueue an infinite retry.
      tx.rollbackDone = true;
      this._finishAutosaveTransaction(job, snapshot, tx, {
        ok: false,
        reason: rollbackOk ? reason : 'rollback_failed',
      });
    });
    return true;
  },

  _autosaveWriteIndex(job, snapshot, tx) {
    if (!this._autosaveTransactionCurrent(job, snapshot, tx)) return false;
    const started = workNowMs();
    this._updateIndex(AUTOSAVE_SLOT, snapshot.envelope);
    const sliceMs = workNowMs() - started;
    tx.indexMs += sliceMs;
    this._pushAutosaveSlice(tx, 'storage_write_index', sliceMs);
    return this._finishAutosaveTransaction(job, snapshot, tx, {
      ok: true,
      backupCreated: !!(tx.previousRaw && tx.previousValid),
      backupSavedAt: tx.previousSavedAt,
    });
  },

  _autosaveTransactionCurrent(job, snapshot, tx) {
    if (!tx || tx.finished || this._activeAutosaveTransaction?.tx !== tx) return false;
    if (tx.cancelReason || tx.runEpoch !== this._runEpoch || this._restoring
      || job.restoreSequence !== this._restoreSequence) {
      const reason = tx.cancelReason || 'superseded';
      tx.cancelReason = reason;
      if (tx.primaryWritten && !tx.rollbackDone) {
        this._scheduleAutosaveRollback(job, snapshot, tx, reason);
      } else {
        this._finishAutosaveTransaction(job, snapshot, tx, { ok: false, reason });
      }
      return false;
    }
    return true;
  },

  _finishAutosaveTransaction(job, snapshot, tx, result) {
    if (!tx || tx.finished) return false;
    if (!result.ok && tx.primaryWritten && !tx.rollbackDone) {
      return this._scheduleAutosaveRollback(job, snapshot, tx, result.reason || 'save_failed');
    }
    tx.finished = true;
    const writeMs = tx.backupMs + tx.storageMs + tx.readbackMs + tx.verifyMs + tx.indexMs;
    const write = {
      ...result,
      bytes: snapshot.json.length,
      stringifyMs: snapshot.stringifyMs,
      storageMs: tx.storageMs,
      indexMs: tx.indexMs,
      backupCreated: !!result.backupCreated,
      backupSavedAt: result.backupSavedAt || null,
    };
    const timing = this._saveTiming({
      slot: AUTOSAVE_SLOT,
      reason: job.reason,
      autosave: true,
      started: job.requestedAt,
      serializeMs: snapshot.serializeMs,
      writeMs,
      stringifyMs: snapshot.stringifyMs,
      storageMs: tx.storageMs,
      indexMs: tx.indexMs,
      bytes: snapshot.json.length,
      ok: !!result.ok,
      failure: result.reason || null,
      blockingSlicesMs: tx.slices,
      blockingSamples: tx.blockingSamples,
      backupMs: tx.backupMs,
      readbackMs: tx.readbackMs,
      verifyMs: tx.verifyMs,
      serializerTimings: snapshot.serializerTimings,
      slowSerializer: snapshot.slowSerializer,
      workerSetupMs: snapshot.workerSetupMs,
      workerDispatchMs: snapshot.workerDispatchMs,
      workerRoundtripMs: tx.workerRoundtripMs,
      captureStartedAtMs: snapshot.captureStartedAtMs,
      captureEndedAtMs: snapshot.captureEndedAtMs,
    });
    const ok = this._publishSaveResult(AUTOSAVE_SLOT, snapshot.envelope, write, timing);
    if (ok) {
      const completedAt = nowMs();
      this._lastAutosaveAt = completedAt;
      this._lastAutosavePlaytime = this.state.meta.playtimeS;
      this.state.save.lastAutosaveAt = completedAt;
    }
    this._autosaveInFlight = false;
    if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
    if (this._activeAutosaveTransaction?.tx === tx) this._activeAutosaveTransaction = null;
    job.capture = null;
    return ok;
  },

  _failAutosave(job, failure, capture, finalSliceMs = 0) {
    const timing = this._saveTiming({
      slot: AUTOSAVE_SLOT,
      reason: job.reason,
      autosave: true,
      started: job.requestedAt,
      serializeMs: capture && capture.serializeMs || 0,
      ok: false,
      failure,
      blockingSlicesMs: [...(capture && capture.blockingSlices || []), finalSliceMs],
      blockingSamples: [
        ...(capture && capture.blockingSamples || []),
        { phase: failure || 'autosave_failure', ms: finalSliceMs },
      ],
      serializerTimings: capture && capture.serializerTimings,
      slowSerializer: capture && capture.slowSerializer,
      workerSetupMs: capture && capture.workerSetupMs,
      workerDispatchMs: capture && capture.workerDispatchMs,
      workerRoundtripMs: capture && capture.workerRoundtripMs,
      captureStartedAtMs: capture && capture.captureStartedAtMs,
      captureEndedAtMs: capture && capture.captureEndedAtMs,
    });
    this._autosaveInFlight = false;
    if (this._activeAutosaveJob === job) this._activeAutosaveJob = null;
    if (this._activeAutosaveTransaction?.job === job) this._activeAutosaveTransaction = null;
    if (job) job.capture = null;
    return this._publishSaveResult(AUTOSAVE_SLOT, null, { ok: false, reason: failure }, timing);
  },

  // ── load (read a slot) ──────────────────────────────────────────────────────────────────────

  /** Load a slot (or 'latest'). Validates fully before any destructive restore; aborts on failure
   *  with save:error and leaves the live game untouched. Returns true on success. */
  load(slot) {
    slot = slot || 'quick';
    if (slot === 'latest') {
      const resolved = this._latestSlot();
      if (!resolved) { this.bus.emit('save:error', { slot, reason: 'no_save' }); return false; }
      slot = resolved;
    }
    let raw = null;
    try { raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(LS_PREFIX + slot) : null; }
    catch (err) { this.bus.emit('save:error', { slot, reason: 'read_failed' }); return false; }
    const primary = this._prepareEnvelopeString(raw);
    if (primary.ok) return this._restorePreparedEnvelope(primary, slot);

    // A named load and title Continue both recover from the previous valid generation. Validation
    // happens before any destructive restore, and the corrupt bytes are never rotated over backup.
    let backupRaw = null;
    try { backupRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem(RECOVERY_PREFIX + slot) : null; }
    catch (err) { /* primary failure below remains the player-facing reason */ }
    const backup = this._prepareEnvelopeString(backupRaw);
    if (backup.ok) {
      const restored = this._restorePreparedEnvelope(backup, slot, { emitError: false, recovered: true });
      if (restored) {
        let promoted = false;
        try {
          localStorage.setItem(LS_PREFIX + slot, backupRaw);
          promoted = localStorage.getItem(LS_PREFIX + slot) === backupRaw;
          if (promoted) this._updateIndex(slot, backup.env);
        } catch (err) { /* recovery remains playable even if self-heal cannot persist */ }
        this.bus.emit('save:recovered', {
          slot,
          source: 'previous_generation',
          failedReason: primary.reason,
          recoveredSavedAt: backup.env.savedAt || null,
          recoveredVersion: backup.env.version | 0,
          promoted,
        });
        return true;
      }
    }
    this.bus.emit('save:error', { slot, reason: primary.reason || 'no_save', recoveryReason: backup.reason || 'no_backup' });
    return false;
  },

  /** Parse + validate + migrate a raw JSON string, then restore. Shared by load() and import. */
  loadEnvelopeFromString(raw, slot) {
    const prepared = this._prepareEnvelopeString(raw);
    if (!prepared.ok) {
      this.bus.emit('save:error', { slot, reason: prepared.reason });
      return false;
    }
    return this._restorePreparedEnvelope(prepared, slot);
  },

  /** Validate an already-parsed envelope and restore it (atomic: validate before destructive work). */
  loadEnvelope(env, slot) {
    slot = slot || (env && env.slot) || 'quick';
    const prepared = this._prepareEnvelope(env);
    if (!prepared.ok) {
      this.bus.emit('save:error', { slot, reason: prepared.reason });
      return false;
    }
    return this._restorePreparedEnvelope(prepared, slot);
  },

  /** Pure validation/migration preparation shared by normal load, recovery, and write verification. */
  _prepareEnvelopeString(raw) {
    if (!raw) return { ok: false, reason: 'no_save' };
    let env;
    try { env = JSON.parse(raw); }
    catch (err) { return { ok: false, reason: 'parse_failed' }; }
    return this._prepareEnvelope(env);
  },

  _prepareEnvelope(env) {
    try {
      if (!env || env.fmt !== FMT) return { ok: false, reason: 'bad_format' };
      const ver = env.version | 0;
      if (ver > CURRENT_VERSION) return { ok: false, reason: 'newer_version' };
      if (!env.data || typeof env.data !== 'object') return { ok: false, reason: 'no_data' };

      // Checksum is over the stored (pre-migration) data shape; verify before migrating.
      if (env.checksum) {
        const computed = fnv1a(safeStringify(env.data));
        if (computed !== env.checksum) return { ok: false, reason: 'checksum' };
      }

      // Migrate a COPY so a throwing migration never half-mutates anything we keep.
      let data = clonePlain(env.data);
      if (!runMigrations(data, ver)) return { ok: false, reason: 'migration_failed' };
      const normalized = normalizeRestorableData(data);
      if (!normalized.ok) return { ok: false, reason: normalized.reason };
      return { ok: true, env, data, version: ver };
    } catch (err) {
      return { ok: false, reason: 'load_failed', error: err };
    }
  },

  _restorePreparedEnvelope(prepared, slot, options = {}) {
    try {
      this._restore(prepared.data, slot, options);
      return true;
    } catch (err) {
      console.error('[save] load failed', err);
      if (options.emitError !== false) this.bus.emit('save:error', { slot, reason: 'load_failed' });
      return false;
    }
  },

  // Destructive restore. Pre-conditions: data validated + migrated. Order = deps-first (§4.5):
  // pause → clear old mission runtime/transient entities → restore meta/player/cargo/economy/factions/world
  // → spawn the saved player → re-enter the sector (regenerates NPCs/stations/asteroids) →
  // re-apply player pose → restore persistent entities → remap semantic combat state →
  // restore missions/automation/settings → rebuild rng → save:loaded → unpause.
  _restore(data, slot, options = {}) {
    if (this._restoring) {
      const marker = { queued: true, stale: true, slot };
      this.deferRunTransition(() => {
        try {
          return this._restore(data, slot);
        } catch (error) {
          console.error('[save] deferred restore failed', error);
          this.bus.emit('save:error', { slot, reason: 'load_failed' });
          return { restored: false, slot, error: true };
        }
      });
      return marker;
    }

    const state = this.state;
    this._restoring = true;
    const finalizeLoadedGame = this.helpers && typeof this.helpers.finalizeLoadedGame === 'function'
      ? this.helpers.finalizeLoadedGame
      : null;
    const beginLoadedGameTransition = this.helpers
      && typeof this.helpers.beginLoadedGameTransition === 'function'
      ? this.helpers.beginLoadedGameTransition
      : null;
    // Reserve ownership before any restore event can synchronously start a newer route.
    // The token travels to the async visual finalizer so stale completions become no-ops.
    const transitionToken = beginLoadedGameTransition ? beginLoadedGameTransition() : null;
    const timeEffects = createTimeEffects(state); // fixtures may call _restore without init()
    this._beginRestoreSequence();
    const restoreSource = `save:restore:${this._restoreSequence}`;
    this.bus.emit('save:restoring', { slot, source: restoreSource });
    timeEffects.reset();
    timeEffects.set(restoreSource, { scale: 0 });
    let finalizerPending = false;
    let drainedRunTransition = null;
    let restoreError = null;
    let hadPendingRunTransition = false;
    const entityIdRemap = new Map();

    try {
      // 1. meta (seed/version/playtime) first — enterSector & rng depend on meta.seed.
      this._restoreMeta(data.meta);

      // 2. Drop live-run mission runtime before restore events fire. entity:destroyed/sector:enter
      // listeners must not fail or spawn targets for missions from the pre-load game.
      this._clearMissionRuntimeForRestore();

      // 3. clear ALL transient entities (dispose meshes via entity:destroyed) and reset id allocator.
      this._clearEntities();

      // 4. restore non-spatial subtrees (deps first).
      this._restorePlayer(data.player);
      this._restoreCargo(data.cargo);
      this._callDeserialize('economy', data.economy);
      this._callDeserialize('economyContracts', data.economyContracts);
      this._callDeserialize('factions', data.factions);
      this._callDeserialize('world', data.world); // sets currentSectorId; does NOT spawn entities
      // Regional/POI aftermath must restore before enterSector publishes its gameplay inputs.
      this._callDeserialize('regionalEcology', data.regionalEcology);
      this._callDeserialize('livingPoiBehaviors', data.livingPoiBehaviors);
      this._callDeserialize('scanner', data.signalInvestigation);
      this._callDeserialize('recoveryEncounter', data.recoveryEncounters);

      // 5. spawn the saved player entity (fresh id) and adopt it.
      const savedPlayer = data.entities && data.entities.player;
      this._spawnPlayer(savedPlayer, entityIdRemap);
      // K1 presence is semantic run state. Restore it after the current player has a fresh id but
      // before world re-entry emits sector:enter and rematerializes route/presence actors.
      this._callDeserialize('factionPresence', data.factionPresence);
      this._callDeserialize('bandRadio', data.bandRadio);
      this._callDeserialize('v2Flavor', data.v2Flavor);

      // 6. re-derive ship stats from restored fittings/research (sets caps, weapons, cargo cap).
      const shipsSys = this.registry.get('ships');
      if (shipsSys && typeof shipsSys.recomputeActiveShip === 'function') {
        try { shipsSys.recomputeActiveShip(); } catch (err) { console.error('[save] recomputeActiveShip', err); }
      }
      // 7. re-apply saved ABSOLUTE hull/shield/cap (recompute preserves fractions → would drift).
      this._applySavedVitals(savedPlayer);

      // 8. recompute cargo caches from restored items.
      const cargoSys = this.registry.get('cargo');
      if (cargoSys && typeof cargoSys.recompute === 'function') {
        try { cargoSys.recompute(); } catch (err) { console.error('[save] cargo.recompute', err); }
      }

      // 9. regenerate the saved sector's contents around the player.
      // world.deserialize already restored durable world.records and cleared residency bags.
      // enterSector → _applyResidencyPlan rematerializes FULL/REDUCED from records exactly once.
      // Continue restores the serialized durable bag before adopting any newer cached sectorSim
      // recipe epoch; a later ordinary promotion may reconcile that cache normally.
      const worldSys = this.registry.get('world');
      const sectorId = state.world.currentSectorId;
      if (worldSys && typeof worldSys.enterSector === 'function' && sectorId) {
        try {
          worldSys.enterSector(sectorId, { restoreDurableRecords: true });
        } catch (err) { console.error('[save] enterSector', err); }
      }
      // enterSector's _placePlayer clobbers position → re-apply the saved pose now.
      this._applySavedPose(savedPlayer);

      // The frame is runtime-only. Derive it from the restored global player pose before any
      // persistent actor or physics body can be created at an unnecessarily large local offset.
      const loadedPlayer = state.entities.get(state.playerId);
      if (loadedPlayer && loadedPlayer.pos) {
        const loadedOrigin = deriveFrameOrigin(loadedPlayer.pos, { x: 0, z: 0 });
        applyFrameOrigin(state, loadedOrigin);
      }

      // 10. restore persistent saved actors after sector regeneration, which despawns non-player
      // entities from the previous live sector.
      this._spawnPersistentEntities(data.entities && data.entities.persistent, entityIdRemap);

      // 11. clear stale entity-id references (the saved targets belong to entities that no longer exist).
      this._clearStaleTargets();

      // 12. restore semantic SG-03 combat state after all save-restored actor ids are remapped.
      this._restoreCombat(data.combat, entityIdRemap);

      // 13. restore missions/automation/settings.
      this._restoreMissions(data.missions);
      this._callDeserialize('careerOrigins', data.careerOrigins);
      this._callDeserialize('careerLadders', data.careerLadders);
      this._restoreScenario(data.scenario);
      const missionsSys = this.registry && this.registry.get && this.registry.get('missions');
      if (missionsSys && typeof missionsSys.spawnTargetsForSector === 'function' && sectorId) {
        try { missionsSys.spawnTargetsForSector(sectorId); } catch (err) { console.error('[save] spawn mission targets', err); }
      }
      this._restoreAutomation(data.automation);
      this._restoreCrafting(data.crafting);
      // Offscreen sim state restores last (after world/factions/economy) so its drift overlay can
      // read the restored sector owners + faction power. runOfflineCatchup fires on save:loaded below.
      this._callDeserialize('sectorSim', data.sectorSim);
      // PQ-014 live NPC jobs. All hulls were cleared above, so every restored job comes back VIRTUAL
      // and re-links to its rematerialized hull by worldRecordId on the next sector enter. Absent in
      // pre-v12 saves → migration seeds an empty bag → the runtime starts with no jobs.
      this._callDeserialize('npcJobsRuntime', data.npcJobs);
      // Claimed bases (after world so sectorId/poiId resolve to real sectors/POIs).
      this._callDeserialize('claims', data.claims);
      this._callDeserialize('asteroidSites', data.sites);
      this._callDeserialize('asteroidFormations', data.formations);
      this._callDeserialize('aceMemory', data.aceMemory);
      this._callDeserialize('lossLedger', data.lossLedger);
      this._callDeserialize('aftermathWrecks', data.aftermathWrecks);
      this._callDeserialize('fieldDepletion', data.fieldDepletion);
      // Campaign-director durable state. Staged here so the director's save:loaded handler can
      // durable-merge it (named captains persist; transients rebuild). Absent in old saves → null
      // → the director starts fresh (migration-safe absence handling).
      this.state.encounterDirector = (data.encounterDirector && typeof data.encounterDirector === 'object')
        ? data.encounterDirector
        : null;
      // Transient systems are not persisted: salvage wrecks are non-persistent entities (gone after
      // load), drill sessions are closed on load, and SG-06 encounter commands/owner state are
      // reconstructed from the live director. Clear tracking so stale cross-save references and
      // pending commands from the prior session can't dangle into the loaded game.
      this.state.interventions = [];
      this.state.drill = null;
      this.state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
      this._restoreFlight(data.flight);
      this._restoreNav(data.nav);
      this._restoreSettings(data.settings);
      this._reconcileFlightReadyAfterLoad();

      // 14. restore sim clock + rebuild the master RNG from the (unchanged) seed.
      if (data.entities) {
        if (typeof data.entities.simTime === 'number') state.simTime = data.entities.simTime;
        if (typeof data.entities.tick === 'number') state.tick = data.entities.tick;
      }
      state.rng = mulberry32((state.meta.seed >>> 0) || 1);

      // 15. finalize.
      state.meta.version = CURRENT_VERSION;
      state.save.currentSlot = slot;
      const previousMode = state.mode;
      state.mode = finalizeLoadedGame ? 'loading' : 'flight';
      if (previousMode !== state.mode) {
        this.bus.emit('mode:changed', { mode: state.mode, previousMode });
      }

      this.bus.emit('save:loaded', {
        slot,
        visualGatePending: !!finalizeLoadedGame,
        recovered: options.recovered === true,
      });
      this.primeAutosaveCapture();
      if (finalizeLoadedGame) {
        let finalizerResult;
        try {
          const finalizerPayload = transitionToken ? { slot, transitionToken } : { slot };
          finalizerResult = finalizeLoadedGame(finalizerPayload);
          finalizerPending = true;
        } catch (err) {
          console.error('[save] finalizeLoadedGame', err);
          this.bus.emit('save:error', { slot, reason: 'visual_gate_failed' });
        }
        if (finalizerPending) {
          Promise.resolve(finalizerResult).then(
            () => timeEffects.clear(restoreSource),
            (err) => {
              timeEffects.clear(restoreSource);
              console.error('[save] finalizeLoadedGame', err);
              this.bus.emit('save:error', { slot, reason: 'visual_gate_failed' });
            },
          );
        }
      }
      // Reconcile restored runtime resources without treating load as a user edit. The save/profile
      // listener ignores persist:false, so Continue does not rewrite the raw profile or timestamp.
      if (!this._pendingRunTransition) {
        this.bus.emit('settings:changed', { section: 'audio', key: null, persist: false, source: 'save-load' });
        this.bus.emit('settings:changed', { section: 'video', key: null, persist: false, source: 'save-load' });
      }
    } catch (error) {
      restoreError = error;
    } finally {
      if (!finalizerPending) timeEffects.clear(restoreSource);
      const pendingRunTransition = this._pendingRunTransition;
      hadPendingRunTransition = !!pendingRunTransition;
      this._pendingRunTransition = null;
      this._restoring = false;
      this._lastAutosaveAt = nowMs(); // don't immediately autosave from the load's own sector:enter
      this._lastAutosavePlaytime = state.meta.playtimeS;
      if (pendingRunTransition) {
        try {
          drainedRunTransition = pendingRunTransition();
        } catch (error) {
          // Never let a newer queued callback replace an exception already leaving this restore.
          console.error('[save] deferred run transition failed', error);
          this.bus.emit('save:error', { reason: 'deferred_transition_failed' });
        }
      }
    }
    if (restoreError) {
      if (hadPendingRunTransition) {
        return {
          restored: false,
          stale: true,
          superseded: true,
          slot,
          drained: drainedRunTransition,
        };
      }
      throw restoreError;
    }
    return { restored: true, slot, drained: drainedRunTransition };
  },

  _restoreMeta(m) {
    if (!m) return;
    const meta = this.state.meta;
    if (typeof m.seed === 'number') meta.seed = m.seed >>> 0;
    if (typeof m.playtimeS === 'number') meta.playtimeS = m.playtimeS;
    if (m.createdAt) meta.createdAt = m.createdAt;
    if (m.lastSavedAt) meta.lastSavedAt = m.lastSavedAt;
    meta.version = CURRENT_VERSION;
  },

  // Reconstruction (not live play): assign credits/cargo directly — routing through
  // economy:grantCredits / faction:repDelta would double-count (advisor #7).
  _restorePlayer(p) {
    if (!p) return; // missing key → keep newGame defaults
    const player = this.state.player;
    const cargo = player.cargo; // preserved; restored separately (§4.5 cargo key)
    for (const k in p) {
      if (k === 'cargo') continue;
      player[k] = p[k];
    }
    player.cargo = cargo;
  },

  _restoreCargo(c) {
    const cargo = this.state.player.cargo;
    if (!c) return;
    cargo.items = c.items || {};
    if (typeof c.capVolume === 'number') cargo.capVolume = c.capVolume;
    if (typeof c.capMass === 'number') cargo.capMass = c.capMass;
  },

  _restoreFlight(flight) {
    const mode = flight && (flight.mode === 'cruise' || flight.mode === 'lane') ? flight.mode : 'manual';
    this.state.flight = {
      mode,
      previousMode: 'manual',
      modeReason: 'load',
      modeChangedTick: Number.isFinite(flight && flight.modeChangedTick) ? flight.modeChangedTick : 0,
    };
  },

  _restoreMissions(d) {
    if (!d) return;
    const payload = normalizeMissionSavePayload(d);
    const sys = this.registry && this.registry.get && this.registry.get('missions');
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(payload); return; } catch (err) { console.error('[save] deserialize missions', err); }
    }
    if (payload.boards || payload.active || payload.completedLog || payload.receipts) {
      this.state.missions.boards = payload.boards || {};
      this.state.missions.active = payload.active || [];
      this.state.missions.completedLog = payload.completedLog || [];
      this.state.missions.receipts = Array.isArray(payload.receipts) ? payload.receipts.slice(0, 10) : [];
      this.state.missions.nextId = payload.nextId || 1;
      this.state.missions.config = payload.config || null;
    }
    if (payload.story) this.state.story = payload.story;
  },

  _restoreScenario(d) {
    const sys = this.registry && this.registry.get && this.registry.get('scenarioRuntime');
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(d); return; } catch (err) { console.error('[save] deserialize scenarioRuntime', err); }
    }
    if (d && typeof d === 'object') this.state.scenario = clonePlain(d);
  },

  _restoreAutomation(d) {
    if (!d) return;
    const sys = this.registry && this.registry.get && this.registry.get('automation');
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(d); return; } catch (err) { console.error('[save] deserialize automation', err); }
    }
    this.state.automation = d;
  },

  _restoreCrafting(d) {
    const payload = d || { queues: {} };
    const sys = this.registry && this.registry.get && this.registry.get('crafting');
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(payload); return; } catch (err) { console.error('[save] deserialize crafting', err); }
    }
    this.state.crafting = clonePlain(payload);
  },

  _restoreCombat(d, entityIdRemap) {
    const state = this.state;
    const resolveEntityRef = (ref) => {
      if (!ref || typeof ref !== 'object') return null;
      if (ref.kind === 'player') return state.playerId || null;
      if (ref.kind === 'persistent') {
        const mapped = entityIdRemap && entityIdRemap.get(String(ref.saveId));
        return mapped == null ? null : mapped;
      }
      return null;
    };
    try {
      restoreCombatState(state, d, resolveEntityRef);
    } catch (err) {
      console.error('[save] restore combat', err);
      restoreCombatState(state, null, () => null);
    }
  },

  _restoreSettings(d) {
    if (!d) return;
    // Deep-merge so new nested defaults absent from an old save survive (forward-compat).
    const saveSettings = migrateLegacyMasslineBindingProfile(clonePlain(d));
    let restored = sanitizeRestoredSettings(mergePlain(this.state.settings, saveSettings));
    const profile = migrateLegacyMasslineBindingProfile(this._readProfileSettings());
    if (profile) {
      restored = sanitizeRestoredSettings(mergePlain(restored, profile));
      // Binding maps are an atomic player profile choice. Deep-merging here would retain keys
      // injected by old-save migration underneath a newer Space-primary profile.
      if (profile.controls && Object.prototype.hasOwnProperty.call(profile.controls, 'bindings')) {
        restored.controls.bindings = normalizeControlBindings(profile.controls.bindings);
      }
    }
    this.state.settings = restored;
  },

  _restoreNav(d) {
    const restored = sanitizeNavState(d);
    this.state.nav = restored;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('nav:waypoint', restored.waypoint || null);
    }
  },

  _callDeserialize(name, data) {
    const sys = this.registry && this.registry.get && this.registry.get(name);
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(data); } catch (err) { console.error('[save] deserialize ' + name, err); }
    }
  },

  // Despawn every live entity, disposing meshes (synchronous, outside the sim sweep), and reset the
  // id allocator. vfx only "explodes" asteroids/wrecks/drones on entity:destroyed (cosmetic) and the
  // player is a ship → no junk entities are spawned by this (verified: mining listens to
  // entity:killed/loot:drop, not entity:destroyed).
  _clearEntities() {
    const state = this.state;
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.alive = false;
      try {
        this.bus.emit('entity:destroyed', {
          id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId,
          reason: 'save_restore',
        });
      } catch (err) { /* a render/vfx handler must not abort the clear */ }
    }
    state.entities.clear();
    state.entityList.length = 0;
    state.freeIds.length = 0;
    state.nextEntityId = 1;
    state.playerId = 0;
  },

  // Spawn the saved player ship through the canonical factory (assigns a fresh id, emits
  // entity:spawned so render rebuilds its mesh). We DON'T trust the saved id (spawnEntity ignores it).
  _spawnPlayer(saved, entityIdRemap = null) {
    const state = this.state;
    if (!saved) {
      console.warn('[save] no player entity in save; player not restored');
      return;
    }
    const spec = clonePlain(saved);
    delete spec.id; delete spec._isPlayer;
    // Legacy/current saves may contain ttl:0 because Infinity was JSON-sanitized on write.
    // A player ship is not a timed entity, so restore it as non-expiring.
    if (!Number.isFinite(spec.ttl) || spec.ttl <= 0) spec.ttl = Infinity;
    spec.flags = Object.assign({}, spec.flags, { noInterp: true });
    const e = this.helpers.spawnEntity(spec);
    state.playerId = e.id;
    state.nextEntityId = Math.max(state.nextEntityId, e.id + 1);
    if (entityIdRemap) {
      entityIdRemap.set('player', e.id);
      if (saved.id != null) entityIdRemap.set(String(saved.id), e.id);
    }
  },

  _spawnPersistentEntities(savedList, entityIdRemap = null) {
    if (!Array.isArray(savedList)) return;
    const state = this.state;
    for (const saved of savedList) {
      if (!saved || typeof saved !== 'object') continue;
      const spec = clonePlain(saved);
      delete spec.id; delete spec._isPlayer;
      if (spec.type !== 'projectile' && (!Number.isFinite(spec.ttl) || spec.ttl <= 0)) spec.ttl = Infinity;
      spec.flags = Object.assign({}, spec.flags, { persistent: true, noInterp: true });
      const e = this.helpers.spawnEntity(spec);
      state.nextEntityId = Math.max(state.nextEntityId, e.id + 1);
      if (entityIdRemap && saved.id != null) entityIdRemap.set(String(saved.id), e.id);
    }
  },

  _applySavedVitals(saved) {
    if (!saved) return;
    const e = this.helpers.getEntity(this.state.playerId);
    if (!e) return;
    if (typeof saved.hull === 'number') e.hull = saved.hull;
    if (typeof saved.armorHp === 'number') e.armorHp = saved.armorHp;
    if (typeof saved.shield === 'number') e.shield = saved.shield;
    if (typeof saved.cap === 'number') e.cap = saved.cap;
  },

  _applySavedPose(saved) {
    if (!saved) return;
    const e = this.helpers.getEntity(this.state.playerId);
    if (!e) return;
    if (saved.pos) { e.pos.set(saved.pos.x || 0, 0, saved.pos.z || 0); e.prevPos.copy(e.pos); }
    if (saved.vel) e.vel.set(saved.vel.x || 0, 0, saved.vel.z || 0);
    if (typeof saved.rot === 'number') { e.rot = saved.rot; e.prevRot = saved.rot; }
    if (typeof saved.angVel === 'number') e.angVel = saved.angVel;
    e.flags.noInterp = true; // skip interpolation this frame (teleport)
  },

  // Dock/UI session state must not survive a load — autosaves taken while docked used to persist
  // player.flags.docked and freeze flight/weapons/mining on Continue.
  _reconcileFlightReadyAfterLoad() {
    const state = this.state;
    const player = this.helpers.getEntity(state.playerId);
    if (player && player.flags) {
      player.flags.docked = false;
      player.flags.invuln = false;
    }
    if (player) delete player._invulnUntil;

    const combat = this.registry && this.registry.get && this.registry.get('combat');
    if (combat && typeof combat.setPlayerDocked === 'function') {
      combat.setPlayerDocked(false);
    } else if (player && player.flags) {
      player.flags.invuln = true;
      player._invulnUntil = (state.simTime || 0) + 4;
    }

    if (state.ui) {
      state.ui.docked = false;
      state.ui.dockedStationId = null;
    }
    if (state.jump && (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING')) {
      state.jump.state = 'IDLE';
      state.jump.chargeT = 0;
      state.jump.cooldownT = 0;
      state.jump.targetSectorId = null;
      state.jump.via = null;
    }
  },

  // Saved target ids point at NPCs that get fresh ids when the sector regenerates → null them.
  _clearStaleTargets() {
    const state = this.state;
    state.player.targetId = null;
    const e = this.helpers.getEntity(state.playerId);
    if (e && e.data && e.data.combat) {
      e.data.combat.targetId = null;
      e.data.combat.lockTarget = null;
      e.data.combat.lockProgress = 0;
    }
  },

  _clearMissionRuntimeForRestore() {
    const state = this.state;
    const missions = state.missions;
    if (missions && Array.isArray(missions.active)) {
      for (const m of missions.active) {
        if (!m) continue;
        m.targetEntityIds = [];
        m._escorteeId = null;
        m._escorteeArrived = false;
      }
      missions.active = [];
    }
    if (state.ui) state.ui.trackedMissionId = null;
  },

  // ── file export / import ────────────────────────────────────────────────────────────────────

  /** Export a slot (or the live state) to a downloaded JSON file. Returns the envelope string. */
  exportSlot(slot) {
    slot = slot || this.state.save.currentSlot || 'quick';
    let json = null;
    try { json = (typeof localStorage !== 'undefined') ? localStorage.getItem(LS_PREFIX + slot) : null; } catch (e) {}
    const primary = this._prepareEnvelopeString(json);
    if (!primary.ok) {
      let recovery = null;
      try { recovery = (typeof localStorage !== 'undefined') ? localStorage.getItem(RECOVERY_PREFIX + slot) : null; } catch (e) {}
      const preparedRecovery = this._prepareEnvelopeString(recovery);
      if (preparedRecovery.ok) {
        json = recovery;
        this.bus.emit('save:exportRecovery', {
          slot,
          source: 'previous_generation',
          failedReason: primary.reason,
          recoveredSavedAt: preparedRecovery.env.savedAt || null,
        });
      } else {
        json = null;
      }
    }
    if (!json) { try { json = JSON.stringify(this.serialize(slot)); } catch (e) { json = null; } }
    if (!json) { this.bus.emit('save:error', { slot, reason: 'export_failed' }); return null; }
    const date = new Date().toISOString().slice(0, 10);
    const filename = `spaceface_${slot}_${date}.json`;
    try {
      if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        this.bus.emit('toast', { text: 'Exported ' + filename, kind: 'success', ttl: 3 });
      }
    } catch (err) { this.bus.emit('save:error', { slot, reason: 'export_failed' }); }
    return json;
  },

  /** Import a JSON envelope string: validate + migrate + load (into the import's own slot or 'quick'). */
  importString(jsonStr, slot) {
    return this.loadEnvelopeFromString(jsonStr, slot || 'quick');
  },

  /** Import from a File (FileReader → importString). Calls cb(ok) when done. */
  importFile(file, cb) {
    if (typeof FileReader === 'undefined' || !file) { if (cb) cb(false); return; }
    const reader = new FileReader();
    reader.onload = () => { const ok = this.importString(String(reader.result || ''), 'quick'); if (cb) cb(ok); };
    reader.onerror = () => { this.bus.emit('save:error', { slot: 'import', reason: 'read_failed' }); if (cb) cb(false); };
    reader.readAsText(file);
  },
};

const CANONICAL_SAVE_SERIALIZE = save.serialize;

// ── module helpers ────────────────────────────────────────────────────────────────────────────

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

// Named separately from end-to-end elapsed measurement so every synchronous autosave phase uses one
// consistent high-resolution clock. This is deliberately wall/block time: browsers expose no
// portable per-thread CPU clock, and Windows' Node CPU clocks advance in ~15 ms quanta (which can
// report either 0 ms or a full tick for sub-millisecond work). A synchronous task occupies the frame
// for its full wall interval; asynchronous worker round-trip time is measured separately with nowMs().
function workNowMs() {
  return nowMs();
}

function roundSaveMs(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

// Run the ordered migration chain from `fromVer` up to CURRENT_VERSION, mutating `data` in place.
// Returns false if a migration throws (caller aborts the load without touching live state).
function runMigrations(data, fromVer) {
  let v = fromVer | 0;
  let guard = 0;
  while (v < CURRENT_VERSION && guard++ < 64) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) break; // no path forward; load as-is (best effort)
    try { step.fn(data); } catch (err) { console.error('[save] migration ' + v + '→' + step.to, err); return false; }
    v = step.to;
  }
  return true;
}

function hasRestorablePlayer(data) {
  const player = data && data.entities && data.entities.player;
  return !!(player && typeof player === 'object');
}

function normalizeRestorableData(data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'no_data' };
  if (!hasRestorablePlayer(data)) return { ok: false, reason: 'no_player' };
  const savedPlayer = data.entities.player;
  if (savedPlayer.type && savedPlayer.type !== 'ship') return { ok: false, reason: 'invalid_player' };

  data.player = normalizePlayerSaveRecord(data.player, savedPlayer);
  data.cargo = normalizeCargoSaveRecord(data.cargo);
  data.world = normalizeWorldSaveRecord(data.world);
  data.entities.player = normalizePlayerEntitySave(savedPlayer, data.player);
  return { ok: true };
}

function normalizePlayerSaveRecord(player, savedEntity) {
  const out = (player && typeof player === 'object' && !Array.isArray(player)) ? player : {};
  const defId = resolveSavedDefId(out, savedEntity);
  const fittings = resolveSavedFittings(out, savedEntity, defId);
  const needsRepair = needsPlayerEntityRepair(savedEntity);
  if (!Array.isArray(out.ownedShips) || !out.ownedShips.length) {
    if (needsRepair) out.ownedShips = [{ defId, fittings }];
    return out;
  }
  if (!Number.isInteger(out.activeShipIndex) || out.activeShipIndex < 0 || out.activeShipIndex >= out.ownedShips.length) {
    out.activeShipIndex = 0;
  }
  const active = out.ownedShips[out.activeShipIndex] || (out.ownedShips[0] = { defId, fittings });
  if (!active.defId) active.defId = defId;
  if (!Array.isArray(active.fittings)) active.fittings = fittings;
  if (!Array.isArray(out.moduleInventory)) out.moduleInventory = [];
  if (!Array.isArray(out.researchedNodes)) out.researchedNodes = [];
  if (!out.efficiencyMods || typeof out.efficiencyMods !== 'object' || Array.isArray(out.efficiencyMods)) {
    out.efficiencyMods = { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 };
  }
  return out;
}

function needsPlayerEntityRepair(saved) {
  if (!saved || typeof saved !== 'object') return true;
  const data = saved.data && typeof saved.data === 'object' ? saved.data : null;
  return !(saved.type === 'ship'
    && data
    && data.defId
    && Number.isFinite(saved.hullMax) && saved.hullMax > 0
    && Number.isFinite(saved.capMax) && saved.capMax > 0
    && Array.isArray(data.weapons) && data.weapons.length > 0);
}

function normalizeCargoSaveRecord(cargo) {
  const out = (cargo && typeof cargo === 'object' && !Array.isArray(cargo)) ? cargo : {};
  if (!out.items || typeof out.items !== 'object' || Array.isArray(out.items)) out.items = {};
  if (!Number.isFinite(out.capVolume) || out.capVolume <= 0) out.capVolume = NEW_GAME.cargoCapacity || 40;
  if (!Number.isFinite(out.capMass) || out.capMass <= 0) out.capMass = Math.max(60, out.capVolume);
  return out;
}

function normalizeWorldSaveRecord(world) {
  const out = (world && typeof world === 'object' && !Array.isArray(world)) ? world : {};
  if (!out.currentSectorId) out.currentSectorId = DEFAULT_START_SECTOR;
  if (!out.scanPings || typeof out.scanPings !== 'object' || Array.isArray(out.scanPings)) out.scanPings = {};
  out.coordinateSchema = COORDINATE_SCHEMA;
  out.frameOrigin = { x: 0, z: 0 };
  out.frameOriginSeq = 0;
  const fuel = (out.fuel && typeof out.fuel === 'object' && !Array.isArray(out.fuel)) ? out.fuel : {};
  const hasValidMax = Number.isFinite(fuel.max) && fuel.max > 0;
  const max = hasValidMax ? fuel.max : 100;
  const current = hasValidMax && Number.isFinite(fuel.current) ? Math.max(0, Math.min(max, fuel.current)) : max;
  out.fuel = { current, max };
  return out;
}

function normalizePlayerEntitySave(saved, player) {
  const defId = resolveSavedDefId(player, saved);
  const fittings = resolveSavedFittings(player, saved, defId);
  const base = makeShipEntitySpec(defId, {
    team: Number.isFinite(saved.team) ? saved.team : 0,
    factionId: saved.factionId || 'faction_free',
    isPlayer: true,
    player,
    fittings,
    pos: normalizedPos(saved.pos),
    rot: Number.isFinite(saved.rot) ? saved.rot : 0,
  });
  const out = mergePlain(base, saved);
  out.type = 'ship';
  out.alive = true;
  out.pos = normalizedPos(saved.pos);
  out.vel = normalizedPos(saved.vel);
  out.rot = Number.isFinite(saved.rot) ? saved.rot : base.rot;
  out.team = Number.isFinite(saved.team) ? saved.team : base.team;
  out.factionId = saved.factionId || base.factionId;
  out.radius = positiveNumber(saved.radius, base.radius);
  out.mass = positiveNumber(saved.mass, base.mass);
  out.data = normalizePlayerEntityData(saved.data, base.data, defId, fittings);
  normalizeVitals(out, base);
  if (!out.flags || typeof out.flags !== 'object' || Array.isArray(out.flags)) out.flags = {};
  return out;
}

function normalizePlayerEntityData(savedData, baseData, defId, fittings) {
  const data = mergePlain(baseData || {}, savedData || {});
  data.defId = data.defId || defId;
  if (!data.derived || typeof data.derived !== 'object' || !Number.isFinite(data.derived.hullMax) || data.derived.hullMax <= 0) {
    data.derived = clonePlain(baseData.derived);
  }
  if (!Array.isArray(data.weapons) || !data.weapons.length) data.weapons = clonePlain(baseData.weapons || []);
  if (!data.miningBeam || typeof data.miningBeam !== 'object') data.miningBeam = clonePlain(baseData.miningBeam || null);
  if (!Array.isArray(data.fittings) || !data.fittings.length) data.fittings = clonePlain(baseData.fittings || fittings || []);
  if (!data.combat || typeof data.combat !== 'object') data.combat = { targetId: null, lockTarget: null, lockProgress: 0 };
  data.intent = null;
  return data;
}

function normalizeVitals(out, base) {
  out.hullMax = positiveNumber(out.hullMax, base.hullMax);
  out.shieldMax = nonNegativeNumber(out.shieldMax, base.shieldMax);
  out.capMax = positiveNumber(out.capMax, base.capMax);
  out.armorMax = nonNegativeNumber(out.armorMax, base.armorMax);
  out.armorFlat = nonNegativeNumber(out.armorFlat, base.armorFlat);
  out.hull = boundedVital(out.hull, out.hullMax, base.hull);
  out.shield = boundedVital(out.shield, out.shieldMax, base.shield, true);
  out.cap = boundedVital(out.cap, out.capMax, base.cap, true);
  out.armorHp = boundedVital(out.armorHp, out.armorMax, base.armorHp, true);
  out.thrust = positiveNumber(out.thrust, base.thrust);
  out.turnRate = positiveNumber(out.turnRate, base.turnRate);
  out.maxSpeed = positiveNumber(out.maxSpeed, base.maxSpeed);
  out.drag = positiveNumber(out.drag, base.drag);
  if (!out.boost || typeof out.boost !== 'object' || Array.isArray(out.boost)) out.boost = clonePlain(base.boost || {});
  else {
    out.boost.max = nonNegativeNumber(out.boost.max, base.boost && base.boost.max);
    out.boost.energy = boundedVital(out.boost.energy, out.boost.max, base.boost && base.boost.energy, true);
    out.boost.drainRate = nonNegativeNumber(out.boost.drainRate, base.boost && base.boost.drainRate);
    out.boost.regenRate = nonNegativeNumber(out.boost.regenRate, base.boost && base.boost.regenRate);
    out.boost.dashImpulse = nonNegativeNumber(out.boost.dashImpulse, base.boost && base.boost.dashImpulse);
    out.boost.dashCd = nonNegativeNumber(out.boost.dashCd, base.boost && base.boost.dashCd);
    out.boost.dashCdT = nonNegativeNumber(out.boost.dashCdT, 0);
  }
}

function resolveSavedDefId(player, savedEntity) {
  const active = player && Array.isArray(player.ownedShips) ? player.ownedShips[player.activeShipIndex || 0] : null;
  return (savedEntity && savedEntity.data && savedEntity.data.defId)
    || (active && active.defId)
    || NEW_GAME.shipId
    || 'ship_kestrel';
}

function resolveSavedFittings(player, savedEntity, defId) {
  const active = player && Array.isArray(player.ownedShips) ? player.ownedShips[player.activeShipIndex || 0] : null;
  if (active && Array.isArray(active.fittings)) return active.fittings;
  if (savedEntity && savedEntity.data && Array.isArray(savedEntity.data.fittings)) return savedEntity.data.fittings;
  return defId === NEW_GAME.shipId
    ? fittingsFromDefaultModules(defId, NEW_GAME.fittedModules || [])
    : [];
}

function normalizedPos(pos) {
  return {
    x: Number.isFinite(pos && pos.x) ? pos.x : 0,
    z: Number.isFinite(pos && pos.z) ? pos.z : 0,
  };
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedVital(value, max, fallback, allowZero = false) {
  if (Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)) {
    return Math.min(Math.max(0, value), Math.max(0, max || 0));
  }
  if (Number.isFinite(fallback) && (allowZero ? fallback >= 0 : fallback > 0)) {
    return Math.min(Math.max(0, fallback), Math.max(0, max || fallback));
  }
  return allowZero ? 0 : Math.max(1, max || 1);
}

// Serialize an entity to a plain object: drop render/interpolation/controller state, encode pos/vel
// as {x,z}, and keep only authoritative gameplay fields (§4.5).
function plainEntity(e, isPlayer) {
  const out = {};
  for (const k in e) {
    if (shouldSkipEntitySaveKey(k)) continue;
    const v = e[k];
    if (k === 'flags') {
      const flags = sanitizeEntityFlagsForSave(v, isPlayer);
      if (Object.keys(flags).length) out.flags = flags;
    } else if (k === 'boost') {
      const boost = sanitizeBoostForSave(v);
      if (boost !== undefined) out.boost = boost;
    } else if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.z === 'number' && v.isVector3) {
      out[k] = { x: v.x, z: v.z };
    } else if (k === 'ttl' && !Number.isFinite(v)) {
      continue;
    } else if (typeof v === 'function') {
      continue;
    } else {
      out[k] = clonePlain(v);
    }
  }
  // ensure pos/vel are {x,z} even if the Vector3 check above missed (defensive)
  if (e.pos) out.pos = { x: e.pos.x, z: e.pos.z };
  if (e.vel) out.vel = { x: e.vel.x, z: e.vel.z };
  out._isPlayer = !!isPlayer;
  return out;
}

function shouldSkipEntitySaveKey(key) {
  return isUnsafePlainKey(key) || key.charAt(0) === '_' || TRANSIENT_ENTITY_SAVE_KEYS.has(key);
}

function sanitizeEntityFlagsForSave(flags, isPlayer = false) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  const out = {};
  for (const k in flags) {
    if (isUnsafePlainKey(k) || k.charAt(0) === '_' || TRANSIENT_ENTITY_FLAGS.has(k) ||
        (isPlayer && TRANSIENT_PLAYER_FLAGS.has(k))) continue;
    const cv = clonePlain(flags[k]);
    if (cv !== undefined) out[k] = cv;
  }
  return out;
}

function sanitizeBoostForSave(boost) {
  if (!boost || typeof boost !== 'object' || Array.isArray(boost)) return clonePlain(boost);
  const out = {};
  for (const k in boost) {
    if (isUnsafePlainKey(k) || k.charAt(0) === '_') continue;
    const cv = clonePlain(boost[k]);
    if (cv !== undefined) out[k] = cv;
  }
  return out;
}

// Deep-clone to plain JSON, stripping functions / Maps / Sets / THREE objects and sanitizing
// non-finite numbers (NaN/Infinity → 0) so JSON round-trips cleanly (§ risks: serialization purity).
function clonePlain(v) {
  if (v == null) return v;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? v : 0;
  if (t === 'string' || t === 'boolean') return v;
  if (t === 'function') return undefined;
  if (Array.isArray(v)) return v.map(clonePlain);
  if (t === 'object') {
    if (v.isVector3 || v.isObject3D || v.isMesh) {
      // a stray Vector3 → {x,z}; any other THREE object is dropped.
      if (v.isVector3) return { x: v.x, z: v.z };
      return undefined;
    }
    if (v instanceof Map || v instanceof Set) return undefined;
    const out = {};
    for (const k in v) {
      if (isUnsafePlainKey(k)) continue;
      const cv = clonePlain(v[k]);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }
  return undefined;
}

function mergePlain(base, patch) {
  const out = clonePlain(base || {});
  if (!patch || typeof patch !== 'object') return out;
  for (const k in patch) {
    if (isUnsafePlainKey(k)) continue;
    const pv = patch[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      out[k] = mergePlain(out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? out[k] : {}, pv);
    } else {
      out[k] = clonePlain(pv);
    }
  }
  return out;
}

function sanitizeNavState(nav) {
  const source = nav && typeof nav === 'object' && !Array.isArray(nav) ? nav : {};
  const route = sanitizeNavRoute(source.route);
  const out = {
    route,
    autoTravel: !!route && source.autoTravel === true,
    waypoint: sanitizeNavWaypoint(source.waypoint),
    autopilot: sanitizeNavAutopilot(source.autopilot),
  };
  // The route follower's executor (src/systems/routeFollower.js) rides along with the route it is
  // following, so a cross-sector trip resumes at the leg it reached instead of orphaning. The key is
  // OMITTED when there is nothing to persist, so the default nav shape stays byte-identical — several
  // suites deep-equal a whole nav against a literal with no executor key
  // (test/unified-map-professional.test.mjs:203, scripts/check-sectorSim.mjs:205).
  const executor = sanitizeNavExecutor(source.executor, route);
  if (executor) out.executor = executor;
  return out;
}

/** Executor legs carry a GLOBAL target (`global_v1`) resolved through the atlas at engage time. It is
 *  persisted rather than re-resolved on load so a restored trip cannot silently retarget if authored
 *  content moves under an old save; an unresolved leg stays unresolved and the follower interrupts. */
function sanitizeNavExecutorLeg(leg) {
  if (!leg || typeof leg !== 'object' || Array.isArray(leg)) return null;
  const from = navString(leg.fromSectorId);
  const to = navString(leg.toSectorId);
  if (!from || !to) return null;
  const target = sanitizeNavPos(leg.target);
  return {
    index: Number.isFinite(leg.index) ? Math.max(0, Math.floor(leg.index)) : 0,
    fromSectorId: from,
    toSectorId: to,
    final: leg.final === true,
    resolved: !!target && leg.resolved === true,
    targetNodeId: navString(leg.targetNodeId),
    targetKind: navString(leg.targetKind),
    target,
    arrivalRadius: Number.isFinite(leg.arrivalRadius)
      ? Math.max(12, Math.min(500, leg.arrivalRadius))
      : 36,
    label: navString(leg.label) || `${from} → ${to}`,
  };
}

function sanitizeNavExecutor(executor, route) {
  if (!route) return null;   // an executor without its route is an orphan; drop it
  if (!executor || typeof executor !== 'object' || Array.isArray(executor)) return null;
  const legs = Array.isArray(executor.legs)
    ? executor.legs.map(sanitizeNavExecutorLeg).filter(Boolean)
    : [];
  if (!legs.length) return null;
  const status = navString(executor.status) || 'idle';
  return {
    schema: navString(executor.schema) || 'route_executor_v1',
    status,
    // A save can only be written between ticks, so a restored executor is never mid-arm. Clearing
    // armedLegIndex forces the follower to re-arm the local autopilot for the leg it resumes on,
    // which is the same edge-triggered path a fresh engage takes.
    armedLegIndex: null,
    engaged: executor.engaged === true,
    legIndex: Number.isFinite(executor.legIndex)
      ? Math.max(0, Math.min(legs.length - 1, Math.floor(executor.legIndex)))
      : 0,
    legs,
    destinationSectorId: navString(executor.destinationSectorId) || legs[legs.length - 1].toSectorId,
    interruptReason: navString(executor.interruptReason),
    brakeMode: navString(executor.brakeMode),
    handoffWU: Number.isFinite(executor.handoffWU) ? Math.max(0, executor.handoffWU) : null,
  };
}

function sanitizeNavRoute(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null;
  const legs = Array.isArray(route.legs) ? route.legs.map(sanitizeNavLeg).filter(Boolean) : [];
  if (!legs.length) return null;
  const out = { legs };
  if (Number.isFinite(route.totalFuel)) out.totalFuel = Math.max(0, route.totalFuel);
  if (Number.isFinite(route.totalHops)) out.totalHops = Math.max(0, Math.floor(route.totalHops));
  return out;
}

function sanitizeNavLeg(leg) {
  if (!leg || typeof leg !== 'object' || Array.isArray(leg)) return null;
  const from = navString(leg.from);
  const to = navString(leg.to);
  if (!from || !to) return null;
  const out = { from, to };
  if (Number.isFinite(leg.fuel)) out.fuel = Math.max(0, leg.fuel);
  if (Number.isFinite(leg.charge)) out.charge = Math.max(0, leg.charge);
  if (Number.isFinite(leg.interdict)) out.interdict = Math.max(0, Math.min(1, leg.interdict));
  return out;
}

function sanitizeNavWaypoint(waypoint) {
  if (!waypoint || typeof waypoint !== 'object' || Array.isArray(waypoint)) return null;
  const out = {};
  for (const field of [
    'kind', 'missionId', 'missionType', 'stationId', 'sectorId', 'sectorName',
    'label', 'reason', 'mapLabel', 'markerId', 'markerKind', 'commodityId',
  ]) {
    const value = navString(waypoint[field]);
    if (value) out[field] = value;
  }
  const targetEntityId = persistentNavEntityId(waypoint.targetEntityId);
  if (targetEntityId) out.targetEntityId = targetEntityId;
  const targetWorldRecordId = navString(waypoint.targetWorldRecordId);
  if (targetWorldRecordId) out.targetWorldRecordId = targetWorldRecordId;
  if (Number.isFinite(waypoint.storyBeat)) out.storyBeat = waypoint.storyBeat;
  if (waypoint.onboarding === true) out.onboarding = true;
  const pos = sanitizeNavPos(waypoint.pos);
  if (pos) out.pos = pos;
  return Object.keys(out).length ? out : null;
}

function sanitizeNavAutopilot(autopilot) {
  const source = autopilot && typeof autopilot === 'object' && !Array.isArray(autopilot) ? autopilot : {};
  const target = sanitizeNavPos(source.target);
  const out = {
    active: !!target && source.active === true,
    target,
    targetEntityId: persistentNavEntityId(source.targetEntityId),
    label: navString(source.label) || '',
    status: navString(source.status) || (target ? 'armed' : 'idle'),
    arrivalRadius: Number.isFinite(source.arrivalRadius) ? Math.max(12, Math.min(500, source.arrivalRadius)) : 36,
  };
  const targetWorldRecordId = navString(source.targetWorldRecordId);
  if (targetWorldRecordId) out.targetWorldRecordId = targetWorldRecordId;
  return out;
}

function sanitizeNavPos(pos) {
  if (!pos || typeof pos !== 'object' || Array.isArray(pos)) return null;
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  return { x: pos.x, z: pos.z };
}

function navString(value) {
  return typeof value === 'string' && value ? value : null;
}

function navEntityId(value) {
  if (typeof value === 'string' && value) return value;
  if (Number.isFinite(value)) return String(value);
  return null;
}

function persistentNavEntityId(value) {
  const id = navEntityId(value);
  return id && !/^\d+$/.test(id) ? id : null;
}

function navWithStableEntityIdentity(state) {
  const nav = clonePlain(state?.nav || {});
  for (const target of [nav.waypoint, nav.autopilot]) {
    if (!target || typeof target !== 'object') continue;
    const runtimeId = navEntityId(target.targetEntityId);
    if (!runtimeId) continue;
    let entity = state?.entities?.get?.(target.targetEntityId) || null;
    if (!entity && /^\d+$/.test(runtimeId)) entity = state?.entities?.get?.(Number(runtimeId)) || null;
    const worldRecordId = navString(entity?.data?.worldRecordId);
    if (worldRecordId) target.targetWorldRecordId = worldRecordId;
  }
  return nav;
}

function navObjectiveSummary(nav) {
  const waypoint = nav && nav.waypoint;
  if (!waypoint || typeof waypoint !== 'object' || Array.isArray(waypoint)) return '';
  const label = navString(waypoint.label);
  const reason = navString(waypoint.reason);
  const text = label || reason;
  if (waypoint.kind === 'trade') return clipSaveSummary('Route: ' + (text || 'Trade destination'));
  if (waypoint.kind === 'mission') return clipSaveSummary('Mission: ' + (text || 'Tracked contract'));
  if (waypoint.kind === 'story') return clipSaveSummary('Story: ' + (text || 'Story objective'));
  if (waypoint.onboarding) return clipSaveSummary('Tutorial: ' + (text || 'Tutorial objective'));
  return clipSaveSummary('Objective: ' + (text || 'Waypoint'));
}

function missionObjectiveSummary(missions, trackedMissionId) {
  const active = missions && Array.isArray(missions.active) ? missions.active.filter((m) => m && m.status === 'active') : [];
  if (!active.length) return '';
  const tracked = trackedMissionId ? active.find((m) => m.id === trackedMissionId) : null;
  const mission = tracked || active[0];
  const title = mission && (mission.title || mission.name || readableMissionType(mission.type));
  return clipSaveSummary('Mission: ' + (title || 'Active contract'));
}

function storyObjectiveSummary(story) {
  const beatIndex = Number.isFinite(story && story.beatIndex) ? story.beatIndex : 0;
  const beat = STORY_BEATS[beatIndex];
  if (!beat) return '';
  const title = readableMissionType(beat.id || ('beat_' + beatIndex));
  const objective = beat.objective || 'Follow the current story objective.';
  return clipSaveSummary('Story: ' + title + ' - ' + objective);
}

function resumeObjectiveSummary(parts) {
  return parts.navSummary || parts.missionSummary || parts.storySummary || '';
}

function normalizeSlotIndex(idx) {
  const out = {};
  if (!idx || typeof idx !== 'object') return out;
  if (Array.isArray(idx)) {
    for (const item of idx) {
      if (!item || item.slot == null) continue;
      const slot = String(item.slot);
      if (!slot || slot === 'index' || isUnsafePlainKey(slot)) continue;
      out[slot] = clonePlain(Object.assign({ slot }, item));
    }
    return out;
  }
  for (const slot in idx) {
    if (!slot || slot === 'index' || isUnsafePlainKey(slot)) continue;
    const meta = idx[slot];
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    out[slot] = clonePlain(Object.assign({ slot }, meta));
  }
  return out;
}

function mergeSlotIndexes(indexed, scanned) {
  const out = {};
  for (const slot in (scanned || {})) out[slot] = scanned[slot];
  for (const slot in (indexed || {})) out[slot] = mergeSlotMeta(indexed[slot], out[slot]);
  return out;
}

function mergeSlotMeta(indexed, scanned) {
  if (!indexed) return scanned || null;
  if (!scanned) return indexed;
  const indexedScore = slotMetaScore(indexed);
  const scannedScore = slotMetaScore(scanned);
  const scannedIsNewer = scannedScore > indexedScore;
  const scannedIsTieWithContext = scannedScore === indexedScore && !hasSlotContext(indexed) && hasSlotContext(scanned);
  return scannedIsNewer || scannedIsTieWithContext
    ? Object.assign({}, indexed, scanned, { slot: scanned.slot || indexed.slot })
    : Object.assign({}, scanned, indexed, { slot: indexed.slot || scanned.slot });
}

function hasSlotContext(meta) {
  return !!(meta && (
    meta.sectorName || meta.shipName || meta.objectiveSummary ||
    meta.navObjectiveSummary || meta.missionSummary || meta.storySummary
  ));
}

function isOccupiedSlotMeta(meta) {
  return !!meta && (meta.savedAt || meta.lastSavedAt || meta.playtimeS != null);
}

function slotMetaScore(meta) {
  const t = Date.parse((meta && (meta.savedAt || meta.lastSavedAt)) || '') || 0;
  if (t) return t;
  const playtimeS = Number(meta && meta.playtimeS);
  return Number.isFinite(playtimeS) ? playtimeS : 0;
}

function slotMetaFromEnvelope(slot, env) {
  if (!env || typeof env !== 'object' || env.fmt !== FMT) return null;
  const version = env.version | 0;
  if (version > CURRENT_VERSION) return null;
  const data = env.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (env.checksum) {
    try {
      if (fnv1a(safeStringify(data)) !== env.checksum) return null;
    } catch (err) {
      return null;
    }
  }
  const player = data.player && typeof data.player === 'object' && !Array.isArray(data.player) ? data.player : {};
  const world = data.world && typeof data.world === 'object' && !Array.isArray(data.world) ? data.world : {};
  const meta = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? data.meta : {};
  const sectorId = world.currentSectorId || '';
  const sector = sectorId && world.sectors && world.sectors[sectorId];
  const activeIndex = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  const ownedShips = Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const activeShip = ownedShips[activeIndex] || ownedShips[0] || {};
  const missions = normalizeMissionSavePayload(data.missions);
  const story = data.story || missions.story;
  const navSummary = navObjectiveSummary(data.nav);
  const missionSummary = missionObjectiveSummary(missions, null);
  const storySummary = storyObjectiveSummary(story);
  const playtimeS = Number.isFinite(env.playtimeS) ? env.playtimeS : meta.playtimeS;
  return {
    slot,
    savedAt: env.savedAt || meta.lastSavedAt || meta.savedAt || '',
    playtimeS: Number.isFinite(playtimeS) ? playtimeS : 0,
    credits: Number.isFinite(player.credits) ? player.credits : undefined,
    sectorName: (sector && (sector.name || sector.id)) || sectorId || '',
    shipName: activeShip.defId || '',
    navObjectiveSummary: navSummary,
    missionSummary,
    storySummary,
    objectiveSummary: resumeObjectiveSummary({ navSummary, missionSummary, storySummary }),
    version: env.version,
  };
}

function readableMissionType(value) {
  return String(value || 'contract')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function clipSaveSummary(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > 96 ? s.slice(0, 93).trimEnd() + '...' : s;
}

function sanitizeRestoredSettings(settings) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  if (!s.gameplay || typeof s.gameplay !== 'object' || Array.isArray(s.gameplay)) s.gameplay = {};
  s.gameplay.physicsBackend = DEFAULT_PHYSICS_BACKEND;
  s.gameplay.aiBackend = DEFAULT_AI_BACKEND;
  s.gameplay.flightBackend = DEFAULT_FLIGHT_BACKEND;
  // H15: never restore runtimeProfile from save — it is selected by the runtime host.
  if (Object.prototype.hasOwnProperty.call(s.gameplay, 'runtimeProfile')) {
    delete s.gameplay.runtimeProfile;
  }
  // One-time scheme migration: 'helm-assist' was the ambient default before the pilot scheme
  // shipped, so old saves carry it as a non-choice. Flip those to 'pilot' once; the flag makes
  // any explicit re-pick of helm-assist in Settings stick from then on.
  if (!s.gameplay.controlSchemeV2) {
    if (s.gameplay.controlScheme === 'helm-assist') s.gameplay.controlScheme = DEFAULT_CONTROL_SCHEME;
    s.gameplay.controlSchemeV2 = true;
  }
  if (!VALID_CONTROL_SCHEMES.has(s.gameplay.controlScheme)) {
    s.gameplay.controlScheme = DEFAULT_CONTROL_SCHEME;
  }
  if (!VALID_MASSLINE_RELEASE_ASSISTS.has(s.gameplay.masslineReleaseAssist)) {
    s.gameplay.masslineReleaseAssist = DEFAULT_MASSLINE_RELEASE_ASSIST;
  }

  if (!s.controls || typeof s.controls !== 'object' || Array.isArray(s.controls)) s.controls = {};
  if (!VALID_FLIGHT_MODES.has(s.controls.flightMode)) {
    s.controls.flightMode = DEFAULT_FLIGHT_MODE;
  }
  s.controls.bindings = normalizeControlBindings(s.controls.bindings);
  if (s.controls.masslineBindingProfile !== MASSLINE_BINDING_PROFILE_LEGACY
      && s.controls.masslineBindingProfile !== MASSLINE_BINDING_PROFILE_SPACE) {
    s.controls.masslineBindingProfile = MASSLINE_BINDING_PROFILE_SPACE;
  }
  if (!s.controls.gamepad || typeof s.controls.gamepad !== 'object' || Array.isArray(s.controls.gamepad)) {
    s.controls.gamepad = { enabled: true, deadzone: 0.12, invertY: false };
  }
  const gp = s.controls.gamepad;
  if (typeof gp.enabled !== 'boolean') gp.enabled = true;
  if (typeof gp.deadzone !== 'number' || !(gp.deadzone >= 0 && gp.deadzone <= 1)) gp.deadzone = 0.12;
  if (typeof gp.invertY !== 'boolean') gp.invertY = false;
  // Touch (P1-12): { enabled } where enabled is true/false/null (null = auto-detect on touch devices).
  if (!s.controls.touch || typeof s.controls.touch !== 'object' || Array.isArray(s.controls.touch)) {
    s.controls.touch = { enabled: null };
  }
  const tc = s.controls.touch;
  if (tc.enabled !== true && tc.enabled !== false) tc.enabled = null;
  return s;
}

function profileSettingsSnapshot(settings) {
  const s = sanitizeRestoredSettings(clonePlain(settings || {}));
  return {
    uiScale: s.uiScale,
    showDamageNumbers: s.showDamageNumbers,
    audio: clonePlain(s.audio || {}),
    video: clonePlain(s.video || {}),
    controls: clonePlain(s.controls || {}),
    accessibility: clonePlain(s.accessibility || {}),
    gameplay: {
      autosaveIntervalS: s.gameplay && s.gameplay.autosaveIntervalS,
      tutorialHints: s.gameplay && s.gameplay.tutorialHints,
      controlScheme: s.gameplay && s.gameplay.controlScheme,
      controlSchemeV2: s.gameplay && s.gameplay.controlSchemeV2,
      masslineReleaseAssist: s.gameplay && s.gameplay.masslineReleaseAssist,
    },
  };
}

function normalizeControlBindings(bindings) {
  if (bindings == null) return null;
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return null;
  const out = {};
  for (const action in bindings) {
    if (isUnsafePlainKey(action)) continue;
    const raw = bindings[action];
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    const clean = [];
    for (const code of list) {
      if (typeof code !== 'string') continue;
      const trimmed = code.trim();
      if (trimmed) clean.push(trimmed);
    }
    if (clean.length) out[action] = clean;
  }
  return Object.keys(out).length ? out : null;
}

function isUnsafePlainKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

function safeStringify(data) {
  return JSON.stringify(data);
}

function normalizeMissionSavePayload(d) {
  if (!d || typeof d !== 'object') return {};
  // Legacy saves stored { missions:{...}, story:{...} } before the save system delegated to the
  // missions system's own serializer.
  if (d.missions && !d.boards && !d.active) {
    return Object.assign({}, d.missions, { story: d.story || d.missions.story });
  }
  return d;
}
