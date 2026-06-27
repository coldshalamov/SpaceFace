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
import { restoreCombatState, serializeCombatState } from '../combat/persistence.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../systems/ships.js';

const LS_PREFIX = 'sf.save.';
const INDEX_KEY = LS_PREFIX + 'index';
const FMT = 'spaceface-save';
const AUTOSAVE_SLOT = 'auto';
const AUTOSAVE_DEBOUNCE_MS = 10000; // ≤1 autosave write per 10s (§4.5)
const DEFAULT_FLIGHT_MODE = 'assisted';
const DEFAULT_PHYSICS_BACKEND = 'rapier-dynamic';
const DEFAULT_AI_BACKEND = 'sg06-tactical';
const DEFAULT_FLIGHT_BACKEND = 'v3';
const VALID_FLIGHT_MODES = new Set(['assisted', 'drift', 'newtonian']);
const DEFAULT_START_SECTOR = NEW_GAME.startingSectorId || NEW_GAME.startSectorId || 'sector_helios_prime';
const TRANSIENT_ENTITY_SAVE_KEYS = new Set([
  'mesh',
  'view',
  'prevPos',
  'prevRot',
  'bank',
  'bankVel',
]);
const TRANSIENT_ENTITY_FLAGS = new Set(['boosting', 'noInterp']);

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
    this._lastAutosaveAt = 0;          // wall-clock ms of last autosave write (debounce)
    this._lastAutosavePlaytime = 0;    // meta.playtimeS at last interval autosave
    this._playerDead = false;          // set by player:death, cleared by player:respawn (autosave gate)

    const bus = this.bus;
    // UI / input route F5/F9 and menu buttons through these (§4.4).
    bus.on('game:save', (p) => this.save((p && p.slot) || 'quick'));
    bus.on('game:load', (p) => this.load((p && p.slot) || 'latest'));

    // Death/respawn gate autosave (combat signals via events, not a state.player.dead field).
    bus.on('player:death', () => { this._playerDead = true; });
    bus.on('player:respawn', () => { this._playerDead = false; });

    // Autosave triggers (§4.5): dock, sector entry, mission completion. Debounced ≤1/10s.
    bus.on('dock:docked', () => this.requestAutosave('dock'));
    bus.on('sector:enter', () => this.requestAutosave('sector'));
    bus.on('mission:completed', () => this.requestAutosave('mission'));
  },

  // Interval autosave is the only periodic job; playtime accrual is core's (§ core.preStep).
  update(/* dt, state */) {
    const state = this.state;
    if (this._restoring || state.mode !== 'flight') return;
    const intervalS = (state.settings.gameplay && state.settings.gameplay.autosaveIntervalS) || 0;
    if (intervalS > 0 && (state.meta.playtimeS - this._lastAutosavePlaytime) >= intervalS) {
      this._lastAutosavePlaytime = state.meta.playtimeS;
      this.requestAutosave('interval');
    }
  },

  // ── serialization ─────────────────────────────────────────────────────────────────────────

  /** Build the `data` payload (plain JSON, deps-first key order). No mesh/THREE/Map/fn/Infinity. */
  serializeData() {
    const state = this.state;
    const data = {};
    data.meta = this._serializeMeta();
    data.player = this._serializePlayer();
    data.cargo = this._serializeCargo();
    data.economy = this._callSerialize('economy') || {};
    data.factions = this._callSerialize('factions') || {};
    data.world = this._callSerialize('world') || {};
    data.entities = this._serializeEntities();
    data.combat = serializeCombatState(state);
    data.missions = this._callSerialize('missions') || this._serializeMissions();
    data.scenario = this._callSerialize('scenarioRuntime') || clonePlain(state.scenario || {});
    data.automation = this._callSerialize('automation') || this._serializeAutomation();
    data.crafting = this._callSerialize('crafting') || this._serializeCrafting();
    data.sectorSim = this._callSerialize('sectorSim') || {};   // ADR-0002 / V2 §33 — offscreen sim state
    data.claims = this._callSerialize('claims') || clonePlain(state.claims || { bodies: [] });
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

  _serializeSettings() {
    return clonePlain(this.state.settings);
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
      try { return clonePlain(sys.serialize()); } catch (err) { console.error('[save] serialize ' + name, err); }
    }
    return null;
  },

  _hasPlayerEntity() {
    const state = this.state;
    return !!(state && state.playerId && state.entities && state.entities.get(state.playerId));
  },

  // ── save (write a slot) ─────────────────────────────────────────────────────────────────────

  /** Serialize the current state and persist it to localStorage under `slot`. */
  save(slot) {
    slot = slot || 'quick';
    if (!this._hasPlayerEntity()) {
      this.bus.emit('save:error', { slot, reason: 'no_player' });
      return false;
    }
    this.bus.emit('save:started', { slot });
    let envelope;
    try {
      envelope = this.serialize(slot);
    } catch (err) {
      console.error('[save] serialize failed', err);
      this.bus.emit('save:error', { slot, reason: 'serialize_failed' });
      return false;
    }
    const ok = this._writeSlot(slot, envelope);
    if (ok) {
      this.state.save.currentSlot = slot;
      this.state.meta.lastSavedAt = envelope.savedAt;
      this.bus.emit('save:completed', { slot });
    }
    return ok;
  },

  _writeSlot(slot, envelope) {
    if (typeof localStorage === 'undefined') {
      this.bus.emit('save:error', { slot, reason: 'no_storage' });
      return false;
    }
    let json;
    try { json = JSON.stringify(envelope); }
    catch (err) { this.bus.emit('save:error', { slot, reason: 'stringify_failed' }); return false; }
    try {
      localStorage.setItem(LS_PREFIX + slot, json);
    } catch (err) {
      // QuotaExceeded or storage disabled — suggest export-to-file fallback.
      const reason = (err && err.name === 'QuotaExceededError') ? 'quota' : 'write_failed';
      console.error('[save] write failed', err);
      this.bus.emit('save:error', { slot, reason });
      return false;
    }
    this._updateIndex(slot, envelope);
    return true;
  },

  // Lightweight slot index (§ design/specs/11) so the menu lists slots without parsing big blobs.
  _updateIndex(slot, envelope) {
    try {
      const idx = this._readIndex();
      const state = this.state;
      const sectorId = state.world.currentSectorId;
      const sector = sectorId && state.world.sectors[sectorId];
      const shipDef = (state.player.ownedShips[state.player.activeShipIndex] || {}).defId || null;
      idx[slot] = {
        slot,
        savedAt: envelope.savedAt,
        playtimeS: envelope.playtimeS,
        credits: state.player.credits,
        sectorName: (sector && sector.name) || sectorId || '',
        shipName: shipDef || '',
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

  /** Public API for the Save/Load screen (§ saveLoad.js readSlots). Returns {slot: meta}. */
  listSlots() { return this._readIndex(); },

  /** Resolve a 'latest' request to the newest slot in the index (used by Continue / mainMenu). */
  _latestSlot() {
    const idx = this._readIndex();
    let best = null, bestT = -1;
    for (const slot in idx) {
      const t = Date.parse((idx[slot] && idx[slot].savedAt) || '') || 0;
      if (t > bestT) { bestT = t; best = slot; }
    }
    return best;
  },

  deleteSlot(slot) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_PREFIX + slot);
      const idx = this._readIndex();
      delete idx[slot];
      if (typeof localStorage !== 'undefined') localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (err) { /* ignore */ }
  },

  // ── autosave ───────────────────────────────────────────────────────────────────────────────

  /** Debounced autosave to slot 'auto'. Never mid-jump, never while restoring / dead / not flying. */
  requestAutosave(/* reason */) {
    const state = this.state;
    if (this._restoring) return false;
    if (state.mode !== 'flight') return false;
    if (this._playerDead) return false; // death/respawn pending (combat signals via events)
    if (state.jump && (state.jump.state === 'CHARGING' || state.jump.state === 'JUMPING')) return false;
    const now = nowMs();
    if (now - this._lastAutosaveAt < AUTOSAVE_DEBOUNCE_MS) return false;
    this._lastAutosaveAt = now;
    this._lastAutosavePlaytime = state.meta.playtimeS;
    state.save.lastAutosaveAt = now;
    return this.save(AUTOSAVE_SLOT);
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
    if (!raw) { this.bus.emit('save:error', { slot, reason: 'no_save' }); return false; }
    return this.loadEnvelopeFromString(raw, slot);
  },

  /** Parse + validate + migrate a raw JSON string, then restore. Shared by load() and import. */
  loadEnvelopeFromString(raw, slot) {
    let env;
    try { env = JSON.parse(raw); }
    catch (err) { this.bus.emit('save:error', { slot, reason: 'parse_failed' }); return false; }
    return this.loadEnvelope(env, slot);
  },

  /** Validate an already-parsed envelope and restore it (atomic: validate before destructive work). */
  loadEnvelope(env, slot) {
    slot = slot || (env && env.slot) || 'quick';
    try {
      if (!env || env.fmt !== FMT) { this.bus.emit('save:error', { slot, reason: 'bad_format' }); return false; }
      const ver = env.version | 0;
      if (ver > CURRENT_VERSION) { this.bus.emit('save:error', { slot, reason: 'newer_version' }); return false; }
      if (!env.data || typeof env.data !== 'object') { this.bus.emit('save:error', { slot, reason: 'no_data' }); return false; }

      // Checksum is over the stored (pre-migration) data shape; verify before migrating.
      if (env.checksum) {
        const computed = fnv1a(safeStringify(env.data));
        if (computed !== env.checksum) {
          // Corrupt: do NOT overwrite or load. Warn but allow a forced load only via import path?
          this.bus.emit('save:error', { slot, reason: 'checksum' });
          return false;
        }
      }

      // Migrate a COPY so a throwing migration never half-mutates anything we keep.
      let data = clonePlain(env.data);
      if (!runMigrations(data, ver)) { this.bus.emit('save:error', { slot, reason: 'migration_failed' }); return false; }
      const normalized = normalizeRestorableData(data);
      if (!normalized.ok) { this.bus.emit('save:error', { slot, reason: normalized.reason }); return false; }

      // Everything validated → perform the (destructive) restore.
      this._restore(data, slot);
      return true;
    } catch (err) {
      console.error('[save] load failed', err);
      this.bus.emit('save:error', { slot, reason: 'load_failed' });
      return false;
    }
  },

  // Destructive restore. Pre-conditions: data validated + migrated. Order = deps-first (§4.5):
  // pause → clear old mission runtime/transient entities → restore meta/player/cargo/economy/factions/world
  // → spawn the saved player → re-enter the sector (regenerates NPCs/stations/asteroids) →
  // re-apply player pose → restore persistent entities → remap semantic combat state →
  // restore missions/automation/settings → rebuild rng → save:loaded → unpause.
  _restore(data, slot) {
    const state = this.state;
    this._restoring = true;
    const prevTimeScale = state.timeScale;
    const finalizeLoadedGame = this.helpers && typeof this.helpers.finalizeLoadedGame === 'function'
      ? this.helpers.finalizeLoadedGame
      : null;
    state.timeScale = 0; // freeze the sim during the swap
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
      this._callDeserialize('factions', data.factions);
      this._callDeserialize('world', data.world); // sets currentSectorId; does NOT spawn entities

      // 5. spawn the saved player entity (fresh id) and adopt it.
      const savedPlayer = data.entities && data.entities.player;
      this._spawnPlayer(savedPlayer, entityIdRemap);

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
      const worldSys = this.registry.get('world');
      const sectorId = state.world.currentSectorId;
      if (worldSys && typeof worldSys.enterSector === 'function' && sectorId) {
        try { worldSys.enterSector(sectorId); } catch (err) { console.error('[save] enterSector', err); }
      }
      // enterSector's _placePlayer clobbers position → re-apply the saved pose now.
      this._applySavedPose(savedPlayer);

      // 10. restore persistent saved actors after sector regeneration, which despawns non-player
      // entities from the previous live sector.
      this._spawnPersistentEntities(data.entities && data.entities.persistent, entityIdRemap);

      // 11. clear stale entity-id references (the saved targets belong to entities that no longer exist).
      this._clearStaleTargets();

      // 12. restore semantic SG-03 combat state after all save-restored actor ids are remapped.
      this._restoreCombat(data.combat, entityIdRemap);

      // 13. restore missions/automation/settings.
      this._restoreMissions(data.missions);
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
      // Claimed bases (after world so sectorId/poiId resolve to real sectors/POIs).
      this._callDeserialize('claims', data.claims);
      // Transient systems are not persisted: salvage wrecks are non-persistent entities (gone after
      // load), drill sessions are closed on load, and SG-06 encounter commands/owner state are
      // reconstructed from the live director. Clear tracking so stale cross-save references and
      // pending commands from the prior session can't dangle into the loaded game.
      this.state.interventions = [];
      this.state.drill = null;
      this.state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] };
      this._restoreSettings(data.settings);

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
      state.timeScale = finalizeLoadedGame ? 0 : 1;
      if (previousMode !== state.mode) {
        this.bus.emit('mode:changed', { mode: state.mode, previousMode });
      }

      this.bus.emit('save:loaded', { slot, visualGatePending: !!finalizeLoadedGame });
      if (finalizeLoadedGame) {
        Promise.resolve(finalizeLoadedGame({ slot })).catch((err) => {
          console.error('[save] finalizeLoadedGame', err);
          this.bus.emit('save:error', { slot, reason: 'visual_gate_failed' });
        });
      }
      // nudge audio to re-read restored volumes (audio's handler re-applies all audio settings
      // on section:'audio'); render reads settings.video directly each frame, no event needed.
      this.bus.emit('settings:changed', { section: 'audio' });
    } finally {
      if (!Number.isFinite(state.timeScale)) state.timeScale = finalizeLoadedGame ? 0 : (prevTimeScale || 1);
      this._restoring = false;
      this._lastAutosaveAt = nowMs(); // don't immediately autosave from the load's own sector:enter
      this._lastAutosavePlaytime = state.meta.playtimeS;
    }
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

  _restoreMissions(d) {
    if (!d) return;
    const payload = normalizeMissionSavePayload(d);
    const sys = this.registry && this.registry.get && this.registry.get('missions');
    if (sys && typeof sys.deserialize === 'function') {
      try { sys.deserialize(payload); return; } catch (err) { console.error('[save] deserialize missions', err); }
    }
    if (payload.boards || payload.active || payload.completedLog) {
      this.state.missions.boards = payload.boards || {};
      this.state.missions.active = payload.active || [];
      this.state.missions.completedLog = payload.completedLog || [];
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
    this.state.settings = sanitizeRestoredSettings(mergePlain(this.state.settings, d));
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

// ── module helpers ────────────────────────────────────────────────────────────────────────────

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
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
      const flags = sanitizeEntityFlagsForSave(v);
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

function sanitizeEntityFlagsForSave(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  const out = {};
  for (const k in flags) {
    if (isUnsafePlainKey(k) || k.charAt(0) === '_' || TRANSIENT_ENTITY_FLAGS.has(k)) continue;
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

function sanitizeRestoredSettings(settings) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  if (!s.gameplay || typeof s.gameplay !== 'object' || Array.isArray(s.gameplay)) s.gameplay = {};
  s.gameplay.physicsBackend = DEFAULT_PHYSICS_BACKEND;
  s.gameplay.aiBackend = DEFAULT_AI_BACKEND;
  s.gameplay.flightBackend = DEFAULT_FLIGHT_BACKEND;

  if (!s.controls || typeof s.controls !== 'object' || Array.isArray(s.controls)) s.controls = {};
  if (!VALID_FLIGHT_MODES.has(s.controls.flightMode)) {
    s.controls.flightMode = DEFAULT_FLIGHT_MODE;
  }
  s.controls.bindings = normalizeControlBindings(s.controls.bindings);
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
