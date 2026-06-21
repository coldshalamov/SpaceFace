// src/systems/story.js — the narrative overlay system.
//
// This is the system that makes the story spine ACTUALLY REACH THE PLAYER. It owns no sim money,
// cargo, or rep (§0.6) — it only READS state and EMITS three kinds of events the UI renders:
//
//   comms:popup    { id, sender, text, category, ttl, persist, note? }
//   graffiti:show  { line, where, author?, beat? }   where: 'airlock'|'shipyard'|'clearing'|'chain_dest'|'bulkhead'
//   hud:phase      { phase: 1|2|3, beat, lie }        lie: 'stable_load'|'manifest_silent_correct'|'civilian_tag_flicker'|'phase3_freeze'|null
//
// It listens to the missions system's `story:beatAdvanced{fromIndex,toIndex,branch}` event and, on
// each beat transition, fires the canonical devices for that beat (from data/narrative.js
// BEAT_CONTENT). It also drives ambient comms on a timer, conditional trap comms, the Ashfall Reach
// endgame choice, and the wormhole-jump (Choice C) detection.
//
// CANONICAL SOURCE: docs/worldbuilding/story/* (STORY-SPINE, COMMS-MICRO-POPUPS, HUD-META-ARC,
// ENDGAME-B7-REDESIGN). All text is transcribed verbatim in data/narrative.js.
//
// STATE: extends state.story (owned by missions.js) with narrative fields:
//   state.story = {
//     beatIndex, branch, flags, chainProgress,        // (owned by missions.js — we READ these)
//     phase: 1,                                        // HUD meta-arc phase (1/2/3) — WE own this
//     seenComms: { <id>: true },                       // comms that fired once and shouldn't repeat
//     ambientQueue: [..ids..],                         // shuffled ambient comms pool (this session)
//     ambientTimerS: number,                           // time until next ambient comms
//     graffitiShown: { <where:line>: true },           // dedupe (bulkhead graffiti can re-show per beat)
//     endgameChoice: null | 'A'|'B'|'C'|'D'|'E',       // which ending the player took (null until chosen)
//     endgameOffered: false,                           // B7 choice has been presented
//     endgameDeclined: ['A',..],                       // choices the player passed on (for Choice E)
//   }
//
// SERIALIZATION: serialize()/deserialize() round-trip state.story (missions.js already serializes
// the base fields; we add the narrative fields defensively in deserialize).
import {
  COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, KURTZ, REFS, COND,
} from '../data/narrative.js';

const ASHFALL = 'sector_ashfall_reach';

// Ambient comms cadence: one every 45–90s of flight sim time (the "constant low-grade migraine").
const AMBIENT_MIN_S = 45;
const AMBIENT_MAX_S = 90;
// Phase 3 ambient cools to one every 2–4 min (the channel has gone quiet; the system stopped needing to talk).
const AMBIENT_MIN_S_P3 = 120;
const AMBIENT_MAX_S_P3 = 240;

export const story = {
  name: 'story',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    const state = this.state, bus = this.bus;

    this._ensureState();

    // ── The core hook: missions advanced the story spine. Fire that beat's devices. ──────────
    bus.on('story:beatAdvanced', (p) => this._onBeatAdvanced(p || {}));

    // ── Ambient + trap comms timer (driven from update()). ───────────────────────────────────
    bus.on('game:started', () => this._onNewGame());
    bus.on('save:loaded', () => this._onLoaded());

    // ── Graffiti at airlock/shipyard fires when the player docks (the station hub is open). ──
    bus.on('dock:docked', (p) => this._onDocked(p || {}));
    // ── Bulkhead graffiti (player's own hand) fires on sector enter / beat — handled in beat logic.

    // ── Elroy beat (B2): the civilian tag flicker. Hook the player's first kill. ─────────────
    bus.on('entity:killed', (p) => this._onKill(p || {}));

    // ── Endgame (B7): present the choice once the gate is met; detect the wormhole jump (C). ─
    bus.on('sector:enter', (p) => this._onSectorEnter(p || {}));
    bus.on('jump:chargeStart', (p) => this._onJumpChargeStart(p || {}));
    // UI intent: player accepted an endgame choice from the overlay.
    bus.on('ui:endgameChoose', (p) => this._onEndgameChoose(p || {}));
    // UI intent: player opened/took/dropped the ledger with the Kurtz figure.
    bus.on('ui:kurtzInteract', (p) => this._onKurtzInteract(p || {}));
  },

  // ── Per-tick: ambient + trap comms scheduling (skips while docked/paused/menu). ─────────────
  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    if (state.ui && state.ui.docked) return; // comms go quiet in the dock (the board talks there)
    const s = state.story;
    if (!s) return;
    s.ambientTimerS = (s.ambientTimerS || 0) - dt;
    if (s.ambientTimerS <= 0) {
      this._fireAmbient();
      this._rescheduleAmbient();
    }
    // Trap comms: cheap condition sweep on a slow cadence (every ~5s of sim time).
    this._trapAcc = (this._trapAcc || 0) + dt;
    if (this._trapAcc >= 5) { this._trapAcc = 0; this._fireEligibleTraps(); }

    // Phase-2 early trigger (HUD-META-ARC note #2): the manifest self-correction should also begin
    // when the player crosses rep <= -100 with any law faction, not only on the B4 beat advance.
    // No announcement — the player just starts noticing discrepancies if they're paying attention.
    this._maybeEarlyPhase2();

    // B7 endgame gate check: once met, present the choice (once).
    this._maybeOfferEndgame();
  },

  /** Phase 2 can begin early if the player is deeply hated by a law faction (rep <= -100).
   *  Idempotent: only fires once (the phase only ever increases in _onBeatAdvanced). */
  _maybeEarlyPhase2() {
    const state = this.state;
    const s = state.story;
    if (!s || (s.phase || 1) >= 2) return;
    const LAW_FACTIONS = ['faction_scn', 'faction_mts'];
    for (const fid of LAW_FACTIONS) {
      const rec = state.factions && state.factions[fid];
      if (rec && (rec.rep || 0) <= -100) {
        s.phase = 2;
        this.bus.emit('hud:phase', { phase: 2, beat: s.beatIndex, lie: 'manifest_silent_correct' });
        return;
      }
    }
  },

  // =========================================================================================
  // BEAT ADVANCEMENT — fire the canonical devices for the new current beat.
  // =========================================================================================
  _onBeatAdvanced({ fromIndex, toIndex, branch }) {
    const state = this.state;
    const s = state.story;
    this._ensureState();
    const content = BEAT_CONTENT[toIndex];
    if (!content) return;

    // 1. Set the HUD phase (the meta-arc). Phase only ever increases (1→2→3); never regresses.
    if (content.phase && content.phase > (s.phase || 1)) {
      s.phase = content.phase;
      this.bus.emit('hud:phase', { phase: s.phase, beat: toIndex, lie: content.hudLie || null });
    } else if (content.hudLie) {
      // same phase but a new specific lie for this beat (e.g. the civilian flicker at B2)
      this.bus.emit('hud:phase', { phase: s.phase || 1, beat: toIndex, lie: content.hudLie });
    }

    // 2. The in-world hint (replaces the flat BEAT_HINT tutorial string). Routed as a 'story' toast
    //    so it reads as the Captain's Log, not a tutorial popup. The missions system ALSO emits its
    //    own beat toast; we suppress duplication by emitting ours on a distinct channel the UI can
    //    prefer (comms 'story' category). We keep the missions toast for compatibility.
    this._fireComms({
      id: `beat_hint_${toIndex}`, sender: 'CAPTAIN\u2019S LOG', text: content.hint,
      category: 'story', ttl: 9, persist: false,
    });

    // 3. Graffiti for this beat (location-tagged). Bulkhead graffiti fires on sector-enter too, but
    //    firing here guarantees it lands even if the player is in flight.
    for (const g of (content.graffiti || [])) {
      if (g.delayS) {
        setTimeout(() => this._showGraffiti(g.line, g.where, toIndex, g.author), Math.max(0, g.delayS) * 1000);
      } else {
        this._showGraffiti(g.line, g.where, toIndex, g.author);
      }
    }

    // 4. Comms popups keyed to this beat (personal/late lines). Each fires once (once:true).
    for (const commsId of (content.comms || [])) {
      this._fireCommsById(commsId);
    }
  },

  // =========================================================================================
  // COMMS — ambient, trap, personal, late, story.
  // =========================================================================================
  _fireAmbient() {
    const s = this.state.story;
    this._ensureState();
    if (!s.ambientQueue || !s.ambientQueue.length) this._rebuildAmbientQueue();
    const id = s.ambientQueue.shift();
    if (!id) return;
    const def = COMMS.ambient.find((c) => c.id === id);
    if (!def) return;
    this._fireComms({
      id: `amb_${id}_${Math.floor(this.state.simTime)}`, sender: def.sender, text: def.text,
      category: 'ambient', ttl: 7, persist: false, note: def.note,
    });
  },

  _fireEligibleTraps() {
    const state = this.state;
    const s = state.story;
    if (!s) return;
    // Each trap fires at most once per session (seenComms) AND only when its cond holds.
    for (const def of COMMS.traps) {
      const key = `trap_${def.id}`;
      if (s.seenComms && s.seenComms[key]) continue;
      let ok = true;
      try { ok = !def.cond || def.cond(state); } catch (e) { ok = false; }
      if (!ok) continue;
      s.seenComms[key] = true;
      this._fireComms({
        id: key, sender: def.sender, text: def.text, category: 'trap', ttl: 8, persist: false, note: def.note,
      });
    }
  },

  _fireCommsById(commsId) {
    const s = this.state.story;
    // Search personal + late + story catalogs.
    const pool = [].concat(COMMS.personal, COMMS.late, COMMS.story);
    const def = pool.find((c) => c.id === commsId);
    if (!def) return;
    if (def.once && s.seenComms && s.seenComms[commsId]) return; // fire-once guard
    s.seenComms[commsId] = true;
    this._fireComms({
      id: commsId, sender: def.sender, text: def.text,
      category: def.id.startsWith('late_') ? 'late' : (def.id.startsWith('story_') ? 'story' : 'personal'),
      ttl: def.persist ? 0 : 9, persist: !!def.persist, note: def.note,
    });
  },

  _fireComms(p) {
    if (!p || !p.text) return;
    this.bus.emit('comms:popup', p);
  },

  _rescheduleAmbient() {
    const s = this.state.story;
    const p3 = (s.phase || 1) >= 3;
    const lo = p3 ? AMBIENT_MIN_S_P3 : AMBIENT_MIN_S;
    const hi = p3 ? AMBIENT_MAX_S_P3 : AMBIENT_MAX_S;
    s.ambientTimerS = lo + Math.random() * (hi - lo);
  },

  _rebuildAmbientQueue() {
    const s = this.state.story;
    const ids = COMMS.ambient.map((c) => c.id);
    // Fisher-Yates shuffle (ambient order is non-deterministic by design — "the channel's migraine").
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    s.ambientQueue = ids;
  },

  // =========================================================================================
  // GRAFFITI
  // =========================================================================================
  _showGraffiti(line, where, beat, author) {
    if (!line) return;
    const s = this.state.story;
    // Dedupe by location+line so airlock graffiti doesn't stack on re-dock; bulkhead is excepted
    // (it re-appears by design at B6/B7 — "written in the player's own hand while they slept").
    const key = `${where}:${line}`;
    if (where !== 'bulkhead' && s.graffitiShown && s.graffitiShown[key]) return;
    if (s.graffitiShown) s.graffitiShown[key] = true;
    this.bus.emit('graffiti:show', { line, where: where || 'airlock', beat: beat != null ? beat : s.beatIndex, author: author || null });
  },

  _onDocked({ stationId }) {
    // When docked, surface any pending airlock/shipyard/clearing/chain_dest graffiti for the current
    // beat so the station hub can render it at the airlock. The beat's graffiti was already emitted
    // on advance; we re-emit on dock so the UI (which mounts the hub on dock) receives it.
    const s = this.state.story;
    const content = BEAT_CONTENT[s.beatIndex];
    if (!content) return;
    for (const g of (content.graffiti || [])) {
      if (g.where === 'bulkhead') continue; // bulkhead shows in flight, not at the airlock
      this.bus.emit('graffiti:show', { line: g.line, where: g.where, beat: s.beatIndex, author: g.author || null, dockedStationId: stationId });
    }
  },

  // =========================================================================================
  // B2 — FIRST BLOOD (Elroy): the civilian tag flicker.
  // =========================================================================================
  _onKill({ killerId, id }) {
    const state = this.state;
    if (state.playerId && killerId !== state.playerId) return; // only the player's kills
    const s = state.story;
    if (!s || s.beatIndex !== 2) return; // only relevant at B2 (the first kill IS the story beat)
    // Emit the tag-flicker HUD lie: a CIVILIAN VESSEL — REGISTERED tag appears for 0.5s before the
    // kill feed overwrites it. The UI renders this as a transient tag on the kill feed.
    this.bus.emit('hud:tagFlicker', {
      entityId: id, tag: 'CIVILIAN VESSEL \u2014 REGISTERED', durationMs: 500,
      note: 'Elroy, Maintenance Division, Pit Engineering. Filed the recycler report six weeks ago. Tag was double-billed by Rook.',
    });
  },

  // =========================================================================================
  // ENDGAME (B7) — present the choice; detect the wormhole jump (Choice C).
  // =========================================================================================
  _maybeOfferEndgame() {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameChoice) return;            // already chose
    if (s.endgameOffered) return;                 // already presented
    // The B7 gate (from missions.js _checkStoryGates): net worth >= 100k AND chosen-faction rep >= 50.
    if (!(s.flags && s.flags.endgame)) return;    // missions sets flags.endgame when beatIndex reaches 7
    if (!this._endgameGateMet()) return;
    s.endgameOffered = true;
    // Fire the board update + comms + bulkhead graffiti simultaneously (no cutscene — per the doc).
    this._showGraffiti(GRAFFITI.THEY_ALWAYS_KNEW, 'bulkhead', 7);
    this._fireComms({
      id: 'endgame_offer', sender: 'CONCORD ADMIN', text: 'CONTRACT 47-A: FINAL DISPOSITION AVAILABLE. REVIEW AT YOUR DISCRETION.',
      category: 'story', ttl: 0, persist: true,
    });
    // Tell the UI to present the choice overlay (it will emit ui:endgameChoose).
    this.bus.emit('endgame:offer', { choices: this._availableChoices() });
  },

  _endgameGateMet() {
    const state = this.state;
    const credits = (state.player && state.player.credits) | 0;
    if (credits < 100000) return false;
    // rep >= 50 with the chosen branch faction (or any faction if no branch — defensive).
    const branch = state.story.branch;
    const BRANCH_FACTION = { traders: 'faction_mts', patrol: 'faction_scn', free: 'faction_free' };
    const facId = branch ? BRANCH_FACTION[branch] : null;
    if (facId) {
      const rec = state.factions && state.factions[facId];
      if (!rec || (rec.rep || 0) < 50) return false;
    } else {
      // no branch on record: accept max-rep >= 50 (defensive for saves that skipped B4)
      let max = 0; const f = state.factions || {};
      for (const k in f) max = Math.max(max, (f[k] && f[k].rep) || 0);
      if (max < 50) return false;
    }
    return true;
  },

  _availableChoices() {
    const state = this.state;
    return ENDGAME_CHOICES.filter((c) => { try { return !c.requires || c.requires(state); } catch (e) { return false; } });
  },

  _onJumpChargeStart({ targetSectorId, via }) {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameChoice) return;
    // Choice C (per ENDGAME-B7-REDESIGN): "initiate a jump drive charge toward the wormhole
    // without a destination registered." Ashfall Reach is the documented end-of-the-line sector
    // (the wormhole threshold). The sector graph has no outbound wormhole edge FROM Ashfall (the
    // wormhole edge is on Veil Nebula pointing in), so we treat any DRIVE-initiated jump charge
    // from Ashfall — after the endgame gate — as the Choice-C moment. Gates are normal transit;
    // only the jump DRIVE (the player's deliberate, destinationless charge) qualifies.
    if (state.world.currentSectorId !== ASHFALL) return;
    if (via !== 'drive') return;
    if (!this._endgameGateMet()) return;
    // only if the player meets Choice C's preconditions (full load, no active missions)
    if (!COND.noActiveMissions(state) || !COND.fullLoad(state)) return;
    // Fire the Vale line the instant the drive begins charging (per the spine doc timing note),
    // THEN present the prompt.
    this._fireCommsById('story_vale_goodwork');
    this.bus.emit('endgame:promptChoiceC', { promptText: 'JUMP WITHOUT DESTINATION?', targetSectorId });
  },

  _onEndgameChoose({ choice }) {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameChoice) return;
    const def = ENDGAME_CHOICES.find((c) => c.id === choice || c.key === choice);
    if (!def) return;
    s.endgameChoice = def.id;
    // HUD-on-accept line + bulkhead graffiti.
    if (def.hudOnAccept) {
      this._fireComms({ id: `endgame_accept_${def.id}`, sender: 'CONCORD ADMIN', text: def.hudOnAccept, category: 'story', ttl: 0, persist: true });
    }
    if (def.graffitiBulkhead) this._showGraffiti(def.graffitiBulkhead, 'bulkhead', 7);
    if (def.graffitiHome) this._showGraffiti(def.graffitiHome, 'airlock', 7);
    // Apply the mechanical consequences (rep/credits/identity) via the canonical single-writers.
    this._applyEndgameConsequences(def);
    this.bus.emit('endgame:chosen', { choice: def.id, key: def.key, title: def.title });
    this.bus.emit('toast', { text: `Ending: ${def.title}`, kind: 'story', ttl: 8 });
  },

  _applyEndgameConsequences(def) {
    const bus = this.bus;
    const state = this.state;
    if (def.id === 'A') {
      // Concord rep → +700; clear heat/criminal record; surcharges gone (modelled as rep + credits).
      bus.emit('faction:repDelta', { factionId: 'faction_scn', delta: 700, reason: 'endgame_clean_uniform' });
      if (state.player) state.player.heat = 0;
      bus.emit('faction:repDelta', { factionId: 'faction_mts', delta: 100, reason: 'endgame_clean_uniform' });
    } else if (def.id === 'B') {
      // Identity disappears from public records. Modelled as a flag; HUD phase stays 3 and the UI
      // stops showing the player's own rep delta (handled in the HUD phase listener).
      state.story.flags.identityErased = true;
    } else if (def.id === 'C') {
      // Loop-back: the campaign resets to the Pit. We emit an event the missions system can catch
      // to reset beatIndex (next run). The HUD prints "CARGO: STABLE." (handled by the HUD phase).
      // No money changes hands — the payout was always a lie.
      bus.emit('endgame:loopBack', {});
    } else if (def.id === 'D') {
      // Stay at Ashfall. The ledger stays in cargo (already there). Flag the stay.
      state.story.flags.stayedAtAshfall = true;
    } else if (def.id === 'E') {
      // Next Run: accept the 47-A payout (+1,200cr), close 47-A, open 47-B.
      bus.emit('economy:grantCredits', { amount: 1200, reason: 'contract_47a_settlement' });
      state.story.flags.contract47bPending = true;
    }
  },

  // =========================================================================================
  // KURTZ FIGURE — the derelict station at Ashfall Reach.
  // =========================================================================================
  _onKurtzInteract({ action }) {
    const state = this.state;
    if (action === 'takeLedger') {
      // Add the ledger as a persistent cargo item (PERSONAL EFFECTS — 1 UNIT / 0.4t).
      this._addPersistentCargo(KURTZ.ledgerCargoId, KURTZ.ledgerName, 1, KURTZ.ledgerMass);
      state.story.flags.hasLedger = true;
      this._fireComms({
        id: 'kurtz_dialog_take', sender: 'THE KURTZ FIGURE', text: KURTZ.dialogue[1],
        category: 'story', ttl: 9, persist: false,
      });
    } else if (action === 'takeCoords') {
      this._addPersistentCargo(KURTZ.coordsCargoId, KURTZ.coordsName, 1, KURTZ.coordsMass);
      state.story.flags.hasCoords = true;
      this._showGraffiti(GRAFFITI.COORDINATES_DONT_MATCH, 'bulkhead', 7);
    } else if (action === 'approach') {
      // Repeated approaches get progressively terser dialogue.
      const visited = (state.story.flags.kurtzVisits || 0);
      const line = visited === 0 ? KURTZ.dialogue[0] : (visited === 1 ? KURTZ.dialogue[2] : KURTZ.dialogue[3]);
      state.story.flags.kurtzVisits = visited + 1;
      this._fireComms({ id: `kurtz_dialog_${visited}`, sender: 'THE KURTZ FIGURE', text: line, category: 'story', ttl: 9 });
    }
  },

  _addPersistentCargo(id, name, qty, mass) {
    const state = this.state;
    const cargo = state.player && state.player.cargo;
    if (!cargo) return;
    cargo.items = cargo.items || {};
    cargo.items[id] = (cargo.items[id] || 0) + qty;
    // mark persistent so it can't be sold/jettisoned (cargo system checks a persistent set)
    if (!state.story.persistentCargo) state.story.persistentCargo = [];
    if (!state.story.persistentCargo.includes(id)) state.story.persistentCargo.push(id);
    // recompute caches via the cargo system if available
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.recompute === 'function') {
      try { cargoSys.recompute(); } catch (e) { /* best-effort */ }
    }
  },

  // =========================================================================================
  // SECTOR ENTRY — surface graffiti on arrival; Ashfall POI override.
  // =========================================================================================
  _onSectorEnter({ sectorId, firstVisit }) {
    const s = this.state.story;
    if (!s) return;
    // Re-surface bulkhead graffiti on every sector entry (it's on the player's own ship).
    const content = BEAT_CONTENT[s.beatIndex];
    if (content) {
      for (const g of (content.graffiti || [])) {
        if (g.where === 'bulkhead') this.bus.emit('graffiti:show', { line: g.line, where: 'bulkhead', beat: s.beatIndex });
      }
    }
    // Ashfall Reach: the late-game "long-form transmission" popup persists until the player visits.
    if (sectorId === ASHFALL && firstVisit && s.beatIndex >= 6) {
      this._fireComms({
        id: 'ashfall_arrival', sender: ASHFALL.toUpperCase().replace(/_/g, ' '),
        text: 'SIGNAL DETECTED: LONG-FORM TRANSMISSION. SOURCE: DERELICT STATION. CONTENTS: ADMINISTRATIVE LOG \u2014 11 YEARS. RECEIVING?',
        category: 'late', ttl: 0, persist: true,
      });
    }
  },

  // =========================================================================================
  // NEW GAME / LOAD / SERIALIZE
  // =========================================================================================
  _onNewGame() {
    this._ensureState(true);
    this._rescheduleAmbient();
  },

  _onLoaded() {
    this._ensureState();
    if (!(this.state.story.ambientTimerS > 0)) this._rescheduleAmbient();
  },

  _ensureState(reset) {
    const state = this.state;
    if (!state.story) state.story = {};
    const s = state.story;
    if (reset) {
      s.phase = 1;
      s.seenComms = {};
      s.ambientQueue = [];
      s.ambientTimerS = 0;
      s.graffitiShown = {};
      s.endgameChoice = null;
      s.endgameOffered = false;
      s.endgameDeclined = [];
      s.persistentCargo = [];
    } else {
      if (s.phase == null) s.phase = 1;
      if (!s.seenComms) s.seenComms = {};
      if (!Array.isArray(s.ambientQueue)) s.ambientQueue = [];
      if (typeof s.ambientTimerS !== 'number') s.ambientTimerS = 0;
      if (!s.graffitiShown) s.graffitiShown = {};
      if (s.endgameChoice == null) s.endgameChoice = null;
      if (!s.endgameOffered) s.endgameOffered = false;
      if (!Array.isArray(s.endgameDeclined)) s.endgameDeclined = [];
      if (!Array.isArray(s.persistentCargo)) s.persistentCargo = [];
    }
  },

  serialize() {
    // state.story is serialized by the missions system (it already includes story). We return the
    // narrative fields so the save system's missions path carries them. The save system calls
    // missions.serialize() which returns { ..., story: state.story } — and state.story now includes
    // our fields. Nothing extra to do here, but expose it for completeness.
    return { story: this.state.story };
  },

  deserialize(data) {
    // Migrate any pre-narrative save: ensure the new fields exist on the restored story.
    this._ensureState();
    if (data && data.story) {
      // merge any narrative fields the save carried (defensive — missions already restored state.story)
      const carried = data.story;
      const s = this.state.story;
      if (typeof carried.phase === 'number') s.phase = carried.phase;
      if (carried.seenComms) s.seenComms = Object.assign({}, carried.seenComms);
      if (Array.isArray(carried.ambientQueue)) s.ambientQueue = carried.ambientQueue.slice();
      if (typeof carried.ambientTimerS === 'number') s.ambientTimerS = carried.ambientTimerS;
      if (carried.graffitiShown) s.graffitiShown = Object.assign({}, carried.graffitiShown);
      if (carried.endgameChoice) s.endgameChoice = carried.endgameChoice;
      if (carried.endgameOffered) s.endgameOffered = true;
      if (Array.isArray(carried.endgameDeclined)) s.endgameDeclined = carried.endgameDeclined.slice();
      if (Array.isArray(carried.persistentCargo)) s.persistentCargo = carried.persistentCargo.slice();
    }
  },
};
