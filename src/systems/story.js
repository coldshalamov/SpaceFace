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
//     rngSeed: uint32,                                  // serialized narrative/ambient RNG stream
//     scheduled: [{ at, kind, ... }],                   // deterministic sim-time narrative queue
//     graffitiShown: { <where:line>: true },           // dedupe (bulkhead graffiti can re-show per beat)
//     endgameChoice: null | 'A'|'B'|'C'|'D'|'E',       // which ending the player took (null until chosen)
//     endgameOffered: false,                           // B7 choice has been presented
//     endgameDeclined: ['A',..],                       // choices the player passed on (for Choice E)
//   }
//
// SERIALIZATION: serialize()/deserialize() round-trip state.story (missions.js already serializes
// the base fields; we add the narrative fields defensively in deserialize).
import {
  COMMS, GRAFFITI, BEAT_CONTENT, POST_SPINE_BEAT_CONTENT, KURTZ, COND,
  COLD_START, ENDING_AIRLOCK_GRAFFITI, HELIOS_BAY7, THREAD_B_FRAGMENT_ID,
} from '../data/narrative.js';
import { addCargo } from './cargo.js';
import { drawSeeded, hash32 } from '../core/rng.js';
// Campaign 47-A sidecar: ending sandbox/receipt meta only — endgameChoice stays canonical on state.story.
import {
  ensureCampaign47aState,
  noteSandboxMode,
  pushCampaignHistory,
  pushCampaignReceipt,
  pushChoiceLog,
  primaryCommsForBeat,
} from '../story/campaign47a/index.js';
// M5 pure endings eligibility + resolution plans (five endings + sandbox continuation).
import {
  SANDBOX_ID,
  SANDBOX_MODE_OPEN_FRONTIER,
  advancePostEndingContinuity,
  createPostEndingContinuity,
  evaluateEndingEligibility,
  isSandboxId,
  listBoardEligibleEndingIds,
  listEndingEligibility,
  normalizePostEndingContinuity,
  planEndingResolution,
  planPendingConfirmation,
} from '../story/endings/index.js';

const ASHFALL = 'sector_ashfall_reach';
const VALE_PROFIT_ID = 'story_vale_profit_100k';
const VALE_CONFLICT_ID = 'story_vale_conflict_flip';
const VALE_CLAIM_ID = 'story_vale_claim_charter';
const VALE_PROFIT_THRESHOLD = 100000;
const DEEP_REACH_VERGE_GATE_ID = 'gate_deep_reach_revoked';

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
    bus.on('story:elroyResolved', (p) => this._onElroyResolved(p || {}));

    // ── Ambient + trap comms timer (driven from update()). ───────────────────────────────────
    bus.on('game:started', () => this._onNewGame());
    bus.on('save:loaded', () => this._onLoaded());
    // When the first-hour tutorial finishes (spec2/03), release the cold-start voice it deferred.
    bus.on('tutorial:finished', () => {
      this._releaseDeferredColdStart();
      this._recoverValeMilestones();
    });
    // While the tutorial owns the one-voice channel, suppress its tutorial-line windows so ambient
    // comms can't stomp a beat's verb. The tutorial system announces each line via tutorial:say.
    bus.on('tutorial:say', () => { this._lastTutorialSayS = (this.state.simTime || 0); });

    // ── Graffiti at airlock/shipyard fires when the player docks (the station hub is open). ──
    bus.on('dock:docked', (p) => this._onDocked(p || {}));
    // ── Bulkhead graffiti (player's own hand) fires on sector enter / beat — handled in beat logic.

    // ── Endgame (B7): present the choice once the gate is met; detect the wormhole jump (C). ─
    bus.on('sector:enter', (p) => this._onSectorEnter(p || {}));
    bus.on('jump:chargeStart', (p) => this._onJumpChargeStart(p || {}));
    // UI intent: player accepted an endgame choice from the overlay.
    // Without confirm: stages pending + endgame:confirmRequired. With confirm:true or ui:endgameConfirm: resolves once.
    bus.on('ui:endgameChoose', (p) => this._onEndgameChoose(p || {}));
    bus.on('ui:endgameConfirm', (p) => this._onEndgameConfirm(p || {}));
    bus.on('ui:endgameDecline', (p) => this._onEndgameDecline(p || {}));
    bus.on('ui:endgameSandbox', (p) => this._onEndgameChoose({ ...(p || {}), choice: SANDBOX_ID, confirm: !!(p && p.confirm) }));
    // Ending C: loop-return receipt/sandbox only — never resets beatIndex or closes flight.
    bus.on('endgame:loopBack', (p) => this._onEndgameLoopBack(p || {}));
    // Endings continue into normal public gameplay. These are existing player-driven events, not
    // fixture inputs or a second mission system; the durable continuity record advances once per
    // distinct mission/route/region/scan and unlocks one authored replay hook.
    bus.on('mission:completed', (p) => this._onPostEndingSignal('mission:completed', p || {}));
    bus.on('economy:tradeCompleted', (p) => {
      this._onValeProfitMilestone();
      this._onPostEndingSignal('economy:tradeCompleted', p || {});
    });
    bus.on('economy:grantCredits', (p) => this._onAutomationRemittance(p || {}));
    bus.on('asset:deployed', () => this._armValeRemittanceWatch());
    bus.on('conflict:flip', (p) => this._onValeConflictMilestone(p || {}));
    bus.on('claim:claimed', (p) => this._onValeClaimMilestone(p || {}));
    bus.on('sector:enter', (p) => this._onPostEndingSignal('sector:enter', p || {}));
    bus.on('scan:completed', (p) => this._onPostEndingSignal('scan:completed', p || {}));
    // UI intent: player opened/took/dropped the ledger with the Kurtz figure.
    bus.on('ui:kurtzInteract', (p) => this._onKurtzInteract(p || {}));
    bus.on('ui:heliosBay7Scan', () => this._onHeliosBay7Scan());
    bus.on('ui:talkContact', (p) => this._onVergeKellEvidence(p || {}));
    bus.on('factionPresence:archiveEvidenceRead', (p) => this._onVergeArchiveEvidence(p || {}));

    // ── B8 — Wren artifact thread: salvaged communicator carries a coordinate file that never resolves.
    bus.on('salvage:communicatorFound', () => this._onB8SalvageTrigger());
  },

  // ── Per-tick: ambient + trap comms scheduling (skips while docked/paused/menu). ─────────────
  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    if (state.ui && state.ui.docked) return; // comms go quiet in the dock (the board talks there)
    const s = state.story;
    if (!s) return;
    this._pumpScheduled();
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
    if (fromIndex === 7 && toIndex === 7 && s.flags && s.flags.deep_reach_operation_complete) {
      this._revealDeepReachVergeObservers();
    }
    // B0 completion devices land when leaving beat 0 (beatAdvanced targets the *new* beat).
    if (fromIndex === 0 && toIndex === 1) {
      this._fireB0CompletionDevices();
    }
    // B2 → always leave the medicine wall even if dock graffiti was missed.
    if (fromIndex === 2 && toIndex === 3) {
      this._showGraffiti(GRAFFITI.THEY_WERE_CARRYING_MEDICINE, 'airlock', 2);
    }
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
    const primary = primaryCommsForBeat(toIndex);
    this._fireComms(primary ? {
      id: primary.id, sender: primary.sender, text: primary.text,
      category: 'story', ttl: 9, persist: false, campaign47aBeat: toIndex,
    } : {
      id: `beat_hint_${toIndex}`, sender: 'CAPTAIN\u2019S LOG', text: content.hint,
      category: 'story', ttl: 9, persist: false, campaign47aBeat: toIndex,
    });

    // 3. Graffiti for this beat (location-tagged). Bulkhead graffiti fires on sector-enter too, but
    //    firing here guarantees it lands even if the player is in flight.
    for (const g of (content.graffiti || [])) {
      if (g.delayS) {
        this._scheduleNarrative(g.delayS, {
          kind: 'graffiti',
          line: g.line,
          where: g.where,
          beat: toIndex,
          author: g.author,
        });
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
    // One-voice (spec2/03): while the tutorial owns the channel, hold ambient chatter so it can't
    // overlap a beat's verb. Re-queue the line for later instead of dropping it.
    if (this._onboardingActive() && this._recentTutorialLine(8)) {
      this._rescheduleAmbient();
      return;
    }
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

  // True if a tutorial line fired within `windowS` seconds (used to keep ambient comms off the verb).
  _recentTutorialLine(windowS) {
    const last = this._lastTutorialSayS;
    if (last == null) return false;
    return ((this.state.simTime || 0) - last) < windowS;
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
    // Route surfaced player notifications through the one-voice arbiter (BP-05). The comms log feed
    // still receives comms:popup for the left-edge migraine; the arbiter serializes what the player
    // actually hears as a toast so story/ambient/trap lines never talk over each other.
    const voice = this.helpers && this.helpers.voice;
    let said = false;
    if (voice && typeof voice.say === 'function') {
      const cat = p.category || 'ambient';
      const channel = (cat === 'story' || cat === 'personal' || cat === 'late') ? 'story'
        : (cat === 'trap' ? 'alert' : 'info');
      said = voice.say({
        channel,
        text: p.sender ? `${p.sender}: ${p.text}` : p.text,
        kind: cat,
        ttl: p.ttl,
        id: p.id,
      });
    }
    // The arbiter now PRESENTS the surfaced line as the top-center one-voice floor. Mark it so the
    // comms feed logs it to the backlog only (re-readable) instead of ALSO stacking it on the live
    // left-edge feed — otherwise the same player-addressed line shows twice (floor + feed). Ambient
    // "not for you" chatter is unmarked and still fills the feed as the designed channel texture.
    if (said) p._viaVoice = true;
    this.bus.emit('comms:popup', p);
  },

  _sayStoryLine(text, ttl = 6) {
    if (!text) return false;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      const said = voice.say({ channel: 'story', text, kind: 'story', ttl });
      if (said) return true;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', { text, kind: 'story', ttl });
      return true;
    }
    return false;
  },

  // B8 — salvage communicator hook (Wren artifact thread opener). Fires once per save after B2+.
  _onB8SalvageTrigger() {
    const s = this.state.story;
    if (!s) return;
    this._ensureState();
    if (s.flags && s.flags.b8_fired) return;
    if ((s.beatIndex || 0) < 2) return;
    if (!s.flags) s.flags = {};
    s.flags.b8_fired = true;
    const content = POST_SPINE_BEAT_CONTENT[8];
    if (!content) return;
    this._fireComms({
      id: 'beat_hint_8', sender: 'CAPTAIN\u2019S LOG', text: content.hint,
      category: 'story', ttl: 9, persist: false,
    });
    for (const g of (content.graffiti || [])) {
      this._showGraffiti(g.line, g.where, 8, g.author);
    }
    for (const commsId of (content.comms || [])) {
      this._fireCommsById(commsId);
    }
  },

  _rescheduleAmbient() {
    const s = this.state.story;
    const p3 = (s.phase || 1) >= 3;
    const lo = p3 ? AMBIENT_MIN_S_P3 : AMBIENT_MIN_S;
    const hi = p3 ? AMBIENT_MAX_S_P3 : AMBIENT_MAX_S;
    s.ambientTimerS = lo + this._rng() * (hi - lo);
  },

  _rebuildAmbientQueue() {
    const s = this.state.story;
    const ids = COMMS.ambient.map((c) => c.id);
    // Fisher-Yates shuffle from the serialized story stream: same seed/replay, same migraine.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    s.ambientQueue = ids;
  },

  _rng() {
    const state = this.state;
    const s = state.story || (state.story = {});
    return drawSeeded(s, 'rngSeed', hash32(state.meta && state.meta.seed, 'story'));
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
    if (!s) return;
    s.flags = s.flags || {};
    const content = BEAT_CONTENT[s.beatIndex];
    if (content) {
      for (const g of (content.graffiti || [])) {
        if (g.where === 'bulkhead') continue; // bulkhead shows in flight, not at the airlock
        this.bus.emit('graffiti:show', { line: g.line, where: g.where, beat: s.beatIndex, author: g.author || null, dockedStationId: stationId });
      }
    }
    if (stationId === 'station_ashcache') {
      s.flags.deep_reach_ashfall_docked = true;
      s.flags.ashfall_visited = true;
      // Desk is available as soon as the player docks the cache station.
      if (!s.flags.kurtz_desk_opened) {
        this._onKurtzInteract({ action: 'approach' });
      }
      this._maybeOfferEndgame();
    }
    // Optional Helios Bay 7 wrong-grid payoff (explore after B3+).
    if (stationId === HELIOS_BAY7.stationId && (s.beatIndex >= 3 || s.flags.beat_2_done)
        && !s.flags.helios_bay7_scanned) {
      // Arm POI — player can request scan via ui:heliosBay7Scan or auto-note once per save.
      s.flags.helios_bay7_available = true;
    }
    // Post-ending airlock mutation re-surface on home dock.
    if (s.endgameChoice && ENDING_AIRLOCK_GRAFFITI[s.endgameChoice]
        && (stationId === 'station_helios' || stationId === s.flags.homeStationId)) {
      this._showGraffiti(ENDING_AIRLOCK_GRAFFITI[s.endgameChoice], 'airlock', 7);
    }
    if (stationId === 'station_ashcache' && s.endgameOffered && !s.endgameChoice && !s.endgameResolved
        && !(s.flags && s.flags.sandboxContinued)
        && Array.isArray(s.endgameDeclined)
        && ['A', 'B', 'C', 'D'].every((id) => s.endgameDeclined.includes(id))) {
      this.bus.emit('endgame:promptChoiceE', { promptText: 'ACCEPT THE NEXT RUN?' });
    }
  },

  // =========================================================================================
  // B2 — FIRST BLOOD (Elroy): the civilian tag flicker.
  // =========================================================================================
  _onElroyResolved({ entityId }) {
    const s = this.state && this.state.story;
    if (!s) return;
    s.flags = s.flags || {};
    if (s.flags.elroyTagResolved) return;
    s.flags.elroyTagResolved = true;
    // Emit before missions advances B2 so synchronous listener order cannot skip the half-second
    // civilian identity. The ordinary kill feed then overwrites it.
    this.bus.emit('hud:tagFlicker', {
      entityId, tag: 'CIVILIAN VESSEL \u2014 REGISTERED', durationMs: 500,
      note: 'Elroy, Maintenance Division, Pit Engineering. Filed the recycler report six weeks ago. Tag was double-billed by Rook.',
    });
    // Required same-session residue (missable flicker still intentional).
    this._showGraffiti(GRAFFITI.THEY_WERE_CARRYING_MEDICINE, 'airlock', 2);
    // Soft after-action log — Thread B light; not tutorial-highlighted.
    this._fireComms({
      id: 'elroy_after_action_seal',
      sender: 'AFTER-ACTION / LOGISTICS OVERSIGHT',
      text: 'CASE FILE SEALED — LOGISTICS OVERSIGHT — REF 44-C.',
      category: 'story',
      ttl: 8,
      persist: false,
    });
  },

  _fireB0CompletionDevices() {
    const s = this.state && this.state.story;
    if (!s) return;
    s.flags = s.flags || {};
    if (s.flags.b0_completion_devices) return;
    s.flags.b0_completion_devices = true;
    this.bus.emit('hud:phase', { phase: 1, beat: 0, lie: 'stable_load' });
    this._showGraffiti(GRAFFITI.THEY_KNEW_THE_MASS, 'airlock', 0);
    this._scheduleNarrative(4, {
      kind: 'graffiti',
      line: GRAFFITI.HELIOS_NOT_NEEDED,
      where: 'airlock',
      beat: 0,
    });
  },

  _armValeRemittanceWatch() {
    const s = this.state && this.state.story;
    if (!s) return;
    s.flags = s.flags || {};
    s.flags.vale_remittance_armed = true;
  },

  _onAutomationRemittance(p) {
    const s = this.state && this.state.story;
    if (!s || !s.flags || !s.flags.vale_remittance_armed) return;
    if (s.flags.vale_remittance_noted) return;
    const reason = String((p && p.reason) || '');
    if (!reason.startsWith('automation:')) return;
    s.flags.vale_remittance_noted = true;
    const amount = Number(p && p.amount) || 0;
    const ledger = s.transactionLog || (s.transactionLog = []);
    ledger.push({
      at: this.state.simTime || 0,
      amount,
      note: 'REMITTANCE FROM ASSET DEPLOYMENT / CLEARED: VALE HOLDINGS LLC',
    });
    this._fireComms({
      id: 'vale_remittance_clear',
      sender: 'VALE HOLDINGS LLC',
      text: 'REMITTANCE CLEARED. SECONDARY LOG: VALE HOLDINGS LLC.',
      category: 'story',
      ttl: 8,
      persist: false,
    });
  },

  // =========================================================================================
  // ENDGAME (B7) — present the choice; detect the wormhole jump (Choice C).
  // =========================================================================================
  _maybeOfferEndgame() {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameChoice || s.endgameResolved || (s.flags && s.flags.sandboxContinued)) return;
    if (s.endgameOffered) return;                 // already presented
    // The B7 gate (from missions.js _checkStoryGates): net worth >= 100k AND chosen-faction rep >= 50.
    if (!(s.flags && s.flags.endgame)) return;    // missions sets flags.endgame when beatIndex reaches 7
    if (!this._endgameGateMet()) return;
    // Place required: Deep Reach is desk + ledger, not a credit toast in Helios.
    if (!(s.flags && s.flags.deep_reach_operation_complete)) return;
    if (!(s.flags && (s.flags.ashfall_visited || s.flags.deep_reach_ashfall_docked || s.flags.kurtz_desk_opened))) {
      return;
    }
    s.endgameOffered = true;
    // Fire the board update + comms + bulkhead graffiti simultaneously (no cutscene — per the doc).
    this._showGraffiti(GRAFFITI.THEY_ALWAYS_KNEW, 'bulkhead', 7);
    this._fireComms({
      id: 'endgame_offer', sender: 'CONCORD ADMIN', text: 'CONTRACT 47-A: FINAL DISPOSITION AVAILABLE. REVIEW AT YOUR DISCRETION.',
      category: 'story', ttl: 0, persist: true,
    });
    // Emit eligibility snapshot for UI (player-visible unmet conditions). Not a five-button modal.
    const rows = listEndingEligibility(state);
    this.bus.emit('endgame:eligibility', {
      rows: rows.map((r) => ({
        id: r.id,
        eligible: r.eligible,
        unmet: (r.unmet || []).map((u) => ({ code: u.code, text: u.text })),
        title: r.def && r.def.title,
      })),
    });
    const sandbox = rows.find((row) => row.id === SANDBOX_ID);
    const hasEligibleEnding = rows.some((row) => row.id !== SANDBOX_ID && row.eligible);
    if (sandbox && sandbox.eligible && !hasEligibleEnding) {
      this.bus.emit('endgame:promptSandbox', {
        promptText: sandbox.def && sandbox.def.confirmPrompt,
        confirmHint: sandbox.def && sandbox.def.confirmHint,
      });
    }
    // A/B are physical contracts on the Ashfall mission board (only when eligible). C/D/E/sandbox are world actions.
    const missions = this.registry && this.registry.get && this.registry.get('missions');
    if (missions && typeof missions.postEndgameDispositionOffers === 'function') {
      missions.postEndgameDispositionOffers();
    }
  },

  _endgameGateMet() {
    // Shared B7 gate via pure endings module (net worth + branch rep; empire stake softens offer window).
    // Offer still opens on classic credits+rep so early B7 board can appear; full eligibility is per-ending.
    const state = this.state;
    const credits = (state.player && state.player.credits) | 0;
    if (credits < 100000) return false;
    const branch = state.story && state.story.branch;
    const BRANCH_FACTION = { traders: 'faction_mts', patrol: 'faction_scn', free: 'faction_free' };
    const facId = branch ? BRANCH_FACTION[branch] : null;
    if (facId) {
      const rec = state.factions && state.factions[facId];
      if (!rec || (rec.rep || 0) < 50) return false;
    } else {
      let max = 0; const f = state.factions || {};
      for (const k in f) max = Math.max(max, (f[k] && f[k].rep) || 0);
      if (max < 50) return false;
    }
    return true;
  },

  _availableChoices() {
    // Eligible endings only (plus sandbox if open). Not five always-on buttons.
    return listEndingEligibility(this.state)
      .filter((r) => r.eligible)
      .map((r) => r.def)
      .filter(Boolean);
  },

  /** Public read for UI: eligibility rows with unmet reasons. */
  getEndingEligibility() {
    return listEndingEligibility(this.state);
  },

  getBoardEligibleEndingIds() {
    return listBoardEligibleEndingIds(this.state);
  },

  _onJumpChargeStart({ targetSectorId, via }) {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameChoice || s.endgameResolved || (s.flags && s.flags.sandboxContinued)) return;
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
    if (!COND.noActiveMissions(state) || !COND.fullLoad(state)) {
      if (s.flags && s.flags.hasLedger) {
        this.bus.emit('endgame:promptChoiceD', { promptText: 'KEEP THE LEDGER AND STAY?' });
      }
      return;
    }
    // Fire the Vale line the instant the drive begins charging (per the spine doc timing note),
    // THEN present the prompt.
    this._fireCommsById('story_vale_goodwork');
    this.bus.emit('endgame:promptChoiceC', { promptText: 'JUMP WITHOUT DESTINATION?', targetSectorId });
  },

  _onEndgameChoose({ choice, confirm }) {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameResolved || s.endgameChoice || (s.flags && s.flags.sandboxContinued)) return;
    if (!choice) return;
    this._ensureState();
    const elig = evaluateEndingEligibility(state, choice);
    if (!elig.eligible) {
      this.bus.emit('endgame:ineligible', {
        choice: elig.id || choice,
        unmet: (elig.unmet || []).map((u) => ({ code: u.code, text: u.text })),
      });
      // One-voice: surface first unmet reason only.
      const first = elig.unmet && elig.unmet[0];
      if (first && first.text) this._sayStoryLine(first.text, 5);
      return;
    }
    // Irreversible confirmation gate (except when caller already confirmed).
    if (!confirm) {
      const pend = planPendingConfirmation(state, choice);
      if (!pend.ok) return;
      s.endgamePending = {
        choice: pend.pending.choice,
        at: pend.pending.at,
        title: pend.pending.title,
        confirmPrompt: pend.pending.confirmPrompt,
        confirmHint: pend.pending.confirmHint,
      };
      this.bus.emit('endgame:confirmRequired', {
        choice: pend.pending.choice,
        title: pend.pending.title,
        confirmPrompt: pend.pending.confirmPrompt,
        confirmHint: pend.pending.confirmHint,
        resolution: pend.def && pend.def.resolution,
        isSandbox: isSandboxId(pend.pending.choice),
      });
      return;
    }
    this._resolveEndgameDisposition(choice);
  },

  _onEndgameConfirm({ choice }) {
    const s = this.state && this.state.story;
    if (!s || s.endgameResolved || s.endgameChoice) return;
    const pending = s.endgamePending && s.endgamePending.choice;
    const id = choice || pending;
    if (!id) return;
    if (pending && choice && pending !== choice) return; // must match staged choice
    this._resolveEndgameDisposition(id);
  },

  _onEndgameDecline({ choice }) {
    const s = this.state && this.state.story;
    if (!s || s.endgameChoice || s.endgameResolved || !choice) return;
    // Cancel pending confirmation for this choice without filing a disposition.
    if (s.endgamePending && s.endgamePending.choice === choice) {
      s.endgamePending = null;
    }
    if (isSandboxId(choice)) return;
    if (!Array.isArray(s.endgameDeclined)) s.endgameDeclined = [];
    if (!s.endgameDeclined.includes(choice)) s.endgameDeclined.push(choice);
  },

  /**
   * One-shot resolution: apply pure plan via owner events only. Idempotent.
   */
  _resolveEndgameDisposition(choice) {
    const state = this.state;
    const s = state.story;
    if (!s || s.endgameResolved || s.endgameChoice || (s.flags && s.flags.sandboxContinued)) return;
    const planned = planEndingResolution(state, choice);
    if (!planned.ok || !planned.plan) {
      if (planned.reason === 'ineligible') {
        this.bus.emit('endgame:ineligible', {
          choice,
          unmet: (planned.unmet || []).map((u) => ({ code: u.code, text: u.text })),
        });
      }
      return;
    }
    const plan = planned.plan;
    // Mark resolved BEFORE emitting intents so re-entrant handlers cannot double-apply.
    s.endgameResolved = true;
    s.endgamePending = null;
    s.flags = s.flags || {};
    if (plan.isSandbox) {
      s.endgameChoice = null;
      s.flags.sandboxContinued = true;
    } else {
      s.endgameChoice = plan.id;
    }
    s.postEnding = createPostEndingContinuity(plan.id, state.simTime || 0, state.meta && state.meta.seed);
    if (plan.storyWrites.identityErased) s.flags.identityErased = true;
    if (plan.storyWrites.stayedAtAshfall) s.flags.stayedAtAshfall = true;
    if (plan.storyWrites.contract47bPending) s.flags.contract47bPending = true;
    for (const f of (plan.flagsToSet || [])) s.flags[f] = true;

    const missions = this.registry && this.registry.get && this.registry.get('missions');
    if (missions && typeof missions.clearEndgameDispositionOffers === 'function') {
      missions.clearEndgameDispositionOffers();
    }

    // HUD-on-accept + graffiti (one voice: resolution line only).
    if (plan.hudOnAccept) {
      this._fireComms({
        id: `endgame_accept_${plan.id}`,
        sender: 'CONCORD ADMIN',
        text: plan.hudOnAccept,
        category: 'story',
        ttl: 0,
        persist: true,
      });
    }
    if (plan.graffitiBulkhead) this._showGraffiti(plan.graffitiBulkhead, 'bulkhead', 7);
    if (plan.graffitiHome) this._showGraffiti(plan.graffitiHome, 'airlock', 7);
    // Ending-specific home airlock mutation (canonical ENDGAME table).
    if (!plan.isSandbox && plan.id && ENDING_AIRLOCK_GRAFFITI[plan.id]) {
      this._showGraffiti(ENDING_AIRLOCK_GRAFFITI[plan.id], 'airlock', 7);
    }
    if (s.flags && s.flags.hasCoords) {
      this._showGraffiti(GRAFFITI.COORDINATES_DONT_MATCH, 'bulkhead', 7);
    }

    // Canonical owner events only. Ending A plans include heat:clear (heat sole writer).
    // Also: faction:repDelta, economy:grantCredits, endgame:loopBack.
    for (const intent of (plan.intents || [])) {
      if (!intent || !intent.event) continue;
      this.bus.emit(intent.event, intent.payload || {});
    }

    this._attachEndingPlanReceipt(plan);
    this._publishPostEndingContinuity('resolved');
    if (plan.isSandbox) {
      this.bus.emit('endgame:sandboxContinued', {
        sandboxMode: plan.sandboxMode || SANDBOX_MODE_OPEN_FRONTIER,
        resolution: plan.resolution,
      });
      this._sayStoryLine(plan.resolution || 'Operations continue.', 6);
    } else {
      this.bus.emit('endgame:chosen', {
        choice: plan.id,
        key: plan.key,
        title: plan.title,
        resolution: plan.resolution,
        sandboxMode: plan.sandboxMode,
      });
      this._sayStoryLine(plan.resolution || plan.title, 8);
    }
    this._schedulePostEndingObjective();
  },

  /**
   * Record resolution receipt + sandbox mode on campaign47a sidecar.
   * Never rewrites endgameChoice (already set). No extra toasts.
   */
  _attachEndingPlanReceipt(plan) {
    if (!plan) return;
    const state = this.state;
    const simTime = state.simTime || 0;
    ensureCampaign47aState(state);
    const own = state.story && state.story.campaign47a;
    if (!own) return;
    if (plan.receipt) {
      pushCampaignReceipt(own, {
        id: plan.receipt.id,
        kind: plan.receipt.kind,
        endingId: plan.receipt.endingId,
        sandboxId: plan.receipt.sandboxId,
        sandboxMode: plan.receipt.sandboxMode,
        simTime: plan.receipt.simTime,
        intents: (plan.receipt.intents || []).map((i) => ({
          event: i.event,
          reason: i.payload && (i.payload.reason || i.payload.amount),
        })),
      });
    }
    const mode = plan.sandboxMode;
    if (mode) {
      const noted = noteSandboxMode(state, mode, simTime);
      if (!noted || !noted.ok) {
        // open_frontier may not be in legacy ENDINGS list — set vocabulary directly.
        own.sandboxMode = mode;
        pushCampaignHistory(own, { kind: 'sandbox_mode_noted', mode }, simTime);
      }
    }
    pushChoiceLog(own, {
      kind: plan.isSandbox ? 'sandbox_continued' : 'ending_chosen',
      endingId: plan.isSandbox ? null : plan.id,
      sandboxId: plan.isSandbox ? SANDBOX_ID : null,
      endgameChoice: state.story.endgameChoice,
    }, simTime);
    pushCampaignHistory(own, {
      kind: plan.isSandbox ? 'sandbox_continued' : 'ending_chosen',
      endingId: plan.isSandbox ? null : plan.id,
      sandboxMode: mode || null,
    }, simTime);
  },

  _revealDeepReachVergeObservers() {
    const s = this.state.story;
    const verge = s.verge;
    if (verge.revealed) return false;
    verge.revealed = true;
    const receipt = {
      source: 'campaign47a:b7:deep_reach_observed',
      variant: s.flags && s.flags.deep_reach_variant || null,
      revealedAt: this.state.simTime || 0,
    };
    this.bus.emit('story:vergeObserversRevealed', receipt);
    this.bus.emit('presentation:caption', {
      text: 'DEEP REACH — SILENT OBSERVER LATTICE DETECTED',
      assertive: false,
      shape: 'verge-observer-reveal',
    });
    this._maybeResolveVergeEvidenceTrail();
    return true;
  },

  _onVergeKellEvidence(payload) {
    if (payload.contactId !== 'contact_wraith_kell' || payload.choiceId !== 'burn') return false;
    if ((this.state.story && this.state.story.beatIndex || 0) < 5) return false;
    return this._markVergeEvidence('kellPaperTrail', 'contact_wraith_kell:burn');
  },

  _onVergeArchiveEvidence(payload) {
    if (payload.evidenceId !== 'vale_gate_revocation_file') return false;
    return this._markVergeEvidence('archiveFile', `archive:${payload.stationId || 'reading_room'}`);
  },

  _markVergeEvidence(key, source) {
    const s = this.state.story;
    const verge = s.verge;
    if (!verge.evidence || !Object.hasOwn(verge.evidence, key) || verge.evidence[key]) return false;
    verge.evidence[key] = true;
    this.bus.emit('story:vergeEvidenceRecorded', { key, source, t: this.state.simTime || 0 });
    this._maybeResolveVergeEvidenceTrail();
    return true;
  },

  _maybeResolveVergeEvidenceTrail() {
    const s = this.state.story;
    const verge = s.verge;
    if (!verge.revealed || verge.valeGatesRevoked) return false;
    const evidence = verge.evidence || {};
    if (!evidence.kellPaperTrail || !evidence.archiveFile || !evidence.kurtzLedger) return false;
    const receipt = {
      id: DEEP_REACH_VERGE_GATE_ID,
      source: 'kell+archive+kurtz',
      subject: 'director_vale',
      revokedAt: this.state.simTime || 0,
    };
    verge.valeGatesRevoked = true;
    verge.awake = true;
    verge.revocations.push(receipt);
    this.bus.emit('story:vergeValeGatesRevoked', { ...receipt, revocationCount: verge.revocations.length });
    this.bus.emit('presentation:caption', {
      text: 'VERGE LATTICE AWAKE — VALE GATE ACCESS REVOKED',
      assertive: true,
      shape: 'verge-gate-revocation',
    });
    return true;
  },

  // =========================================================================================
  // VALE MILESTONES — system acknowledgements, never a parallel quest or reward authority.
  // =========================================================================================
  _onValeProfitMilestone() {
    const profit = Number(this.state && this.state.player && this.state.player.stats
      && this.state.player.stats.lifetimeProfit) || 0;
    if (profit < VALE_PROFIT_THRESHOLD) return false;
    return this._fireValeMilestone(VALE_PROFIT_ID);
  },

  _onValeConflictMilestone(payload) {
    const pairKey = payload && payload.pairKey;
    const conflict = pairKey && this.state && this.state.conflicts && this.state.conflicts[pairKey];
    const playerLean = Number(conflict && conflict.playerLean) || 0;
    if (!pairKey || Math.abs(playerLean) <= 1e-9) return false;
    this._ensureState();
    const s = this.state.story;
    // conflict:flip is the authority. Retain only its first qualifying identity so a save made
    // during onboarding can recover the missed line after Continue without crediting an NPC-only flip.
    if (!s.valeMilestones.conflictFlip) {
      s.valeMilestones.conflictFlip = {
        pairKey,
        sectorId: payload.sectorId || null,
        newOwner: payload.newOwner || null,
        playerLean,
      };
    }
    return this._fireValeMilestone(VALE_CONFLICT_ID);
  },

  _onValeClaimMilestone(payload) {
    const body = payload && payload.body;
    if (!body || (!body.id && !body.poiId && !body.name)) return false;
    return this._fireValeMilestone(VALE_CLAIM_ID, { claimName: this._claimIdentity(body) });
  },

  _claimIdentity(body) {
    const raw = body && (body.name || body.id || body.poiId);
    const clean = String(raw || 'UNNAMED CLAIM').replace(/\s+/g, ' ').trim();
    return clean.slice(0, 80) || 'UNNAMED CLAIM';
  },

  _fireValeMilestone(commsId, context = {}) {
    this._ensureState();
    const s = this.state.story;
    if (s.seenComms[commsId]) return false;
    // Do not make a tutorial verb lose the floor. Durable economy/claim state and the retained
    // qualifying conflict receipt let tutorial:finished or save:loaded deliver the line later.
    if (this._onboardingActive()) return false;
    const def = COMMS.story.find((entry) => entry.id === commsId);
    if (!def) return false;
    let text = def.text;
    if (commsId === VALE_CLAIM_ID) text = text.replace('{CLAIM}', context.claimName || 'UNNAMED CLAIM');
    s.seenComms[commsId] = true;
    this._fireComms({
      id: commsId,
      sender: def.sender,
      text,
      category: 'story',
      ttl: def.persist ? 0 : 9,
      persist: !!def.persist,
      note: def.note,
    });
    return true;
  },

  _recoverValeMilestones() {
    if (this._onboardingActive()) return 0;
    this._ensureState();
    let fired = 0;
    if (this._onValeProfitMilestone()) fired++;
    const conflictFact = this.state.story.valeMilestones.conflictFlip;
    if (conflictFact && this._fireValeMilestone(VALE_CONFLICT_ID)) fired++;
    const firstClaim = this.state.claims && Array.isArray(this.state.claims.bodies)
      ? this.state.claims.bodies[0]
      : null;
    if (firstClaim && this._fireValeMilestone(VALE_CLAIM_ID, { claimName: this._claimIdentity(firstClaim) })) fired++;
    return fired;
  },

  _onPostEndingSignal(signal, payload) {
    const s = this.state && this.state.story;
    if (!s || !s.postEnding || !s.endgameResolved) return false;
    const advanced = advancePostEndingContinuity(s.postEnding, signal, payload, this.state.simTime || 0);
    if (!advanced.changed || !advanced.state) return false;
    s.postEnding = advanced.state;
    this.bus.emit('story:postEndingProgress', this._postEndingPublicPayload('progress'));
    if (advanced.completed) {
      ensureCampaign47aState(this.state);
      const own = s.campaign47a;
      if (own) {
        pushCampaignReceipt(own, {
          id: s.postEnding.receiptId,
          kind: 'replay_hook',
          endingId: s.postEnding.endingId,
          sandboxMode: s.postEnding.sandboxMode,
          replayHookId: s.postEnding.replayHookId,
          simTime: s.postEnding.completedAtS,
          intents: [],
        });
      }
      this.bus.emit('story:replayHookUnlocked', this._postEndingPublicPayload('unlocked'));
      this._fireComms({
        id: 'replay_hook_' + s.postEnding.replayHookId,
        sender: s.postEnding.title,
        text: 'Route logged. Further work available.',
        category: 'story',
        ttl: 7,
        persist: false,
      });
    }
    return true;
  },

  _publishPostEndingContinuity(reason) {
    const payload = this._postEndingPublicPayload(reason);
    if (payload) this.bus.emit('story:postEndingContinuity', payload);
    return payload;
  },

  _schedulePostEndingObjective() {
    const rec = this.state && this.state.story && this.state.story.postEnding;
    if (!rec || !rec.objective) return false;
    // Let the ending resolution line finish first. The normal deterministic story queue then
    // surfaces one concise next objective through the existing one-voice path.
    this._scheduleNarrative(6, {
      kind: 'comms',
      id: 'post_ending_' + rec.directiveId,
      sender: rec.title,
      text: rec.objective,
      category: 'story',
      ttl: 7,
      persist: false,
    });
    return true;
  },

  _postEndingPublicPayload(reason) {
    const rec = this.state && this.state.story && this.state.story.postEnding;
    if (!rec) return null;
    return {
      reason,
      choiceId: rec.choiceId,
      endingId: rec.endingId,
      sandboxMode: rec.sandboxMode,
      directiveId: rec.directiveId,
      title: rec.title,
      objective: rec.objective,
      signal: rec.signal,
      progress: rec.progress,
      target: rec.target,
      status: rec.status,
      replayHookId: rec.replayHookId,
      receiptId: rec.receiptId,
    };
  },

  /**
   * Ending C loop-back: record loop-return sandbox/receipt only.
   * Does not reset state.story.beatIndex/branch/flags, does not change mode/flight.
   */
  _onEndgameLoopBack(_p) {
    const state = this.state;
    const s = state.story;
    if (!s) return;
    const simTime = state.simTime || 0;
    ensureCampaign47aState(state);
    noteSandboxMode(state, 'loop_return', simTime);
    const own = s.campaign47a;
    if (own) {
      own.flags = own.flags || {};
      own.flags.loop_return_recorded = true;
      own.flags.wormhole_return = true;
      pushCampaignHistory(own, {
        kind: 'loop_return',
        endgameChoice: s.endgameChoice || 'C',
        beatIndex: s.beatIndex,
        note: 'sandbox continue — spine not reset',
      }, simTime);
    }
    // Post-ending play continues: leave mode/flight and beatIndex untouched.
  },

  // =========================================================================================
  // KURTZ FIGURE — the derelict station at Ashfall Reach.
  // =========================================================================================
  _onKurtzInteract({ action }) {
    const state = this.state;
    const s = state.story || (state.story = {});
    s.flags = s.flags || {};
    s.flags.kurtz_desk_opened = true;
    s.flags.ashfall_visited = true;
    // Build inspectable ledger rows (desk content — short facts only).
    if (!s.kurtzLedgerRows) {
      const callsign = (state.player && (state.player.callsign || state.player.name)) || 'OPERATOR';
      const priorXponder = (state.player && state.player.priorTransponderId)
        || (state.meta && state.meta.priorTransponderId)
        || 'PRIOR-XPD-UNKNOWN';
      s.kurtzLedgerRows = [
        { column: 'BENEFICIARY', name: 'VALE, D.', note: 'ADMINISTRATIVE COUNTERPARTY' },
        { column: 'COUNTERPARTY', name: callsign, note: `PRIOR TRANSPONDER ${priorXponder} — FILED PRE-B0` },
        { column: 'COUNTERPARTY', name: 'ELROY', note: 'DECEASED (B2) — MAINTENANCE / PIT ENGINEERING' },
      ];
    }
    if (action === 'takeLedger' || action === 'openLedger') {
      // Add the ledger as a persistent cargo item (PERSONAL EFFECTS — 1 UNIT / 0.4t).
      this._addPersistentCargo(KURTZ.ledgerCargoId, KURTZ.ledgerName, 1, KURTZ.ledgerMass);
      s.flags.hasLedger = true;
      this._markVergeEvidence('kurtzLedger', 'kurtz:takeLedger');
      this._fireComms({
        id: 'kurtz_dialog_take', sender: 'THE ASHFALL WITNESS', text: KURTZ.dialogue[1],
        category: 'story', ttl: 9, persist: false,
      });
      this.bus.emit('story:kurtzLedger', { rows: s.kurtzLedgerRows.slice() });
    } else if (action === 'takeCoords') {
      this._addPersistentCargo(KURTZ.coordsCargoId, KURTZ.coordsName, 1, KURTZ.coordsMass);
      s.flags.hasCoords = true;
      this._showGraffiti(GRAFFITI.COORDINATES_DONT_MATCH, 'bulkhead', 7);
    } else if (action === 'approach' || action === 'desk' || !action) {
      // Repeated approaches get progressively terser dialogue.
      const visited = (s.flags.kurtzVisits || 0);
      const line = visited === 0 ? KURTZ.dialogue[0] : (visited === 1 ? KURTZ.dialogue[2] : KURTZ.dialogue[3]);
      s.flags.kurtzVisits = visited + 1;
      this._fireComms({ id: `kurtz_dialog_${visited}`, sender: 'THE ASHFALL WITNESS', text: line, category: 'story', ttl: 9 });
      this.bus.emit('story:kurtzLedger', { rows: (s.kurtzLedgerRows || []).slice() });
    }
    this._maybeOfferEndgame();
  },

  _addPersistentCargo(id, name, qty, mass) {
    const state = this.state;
    const cargo = state.player && state.player.cargo;
    if (!cargo) return;
    // Prefer cargo writer so volume/mass caches stay consistent.
    try {
      if (typeof addCargo === 'function') addCargo(state, id, qty || 1);
      else {
        cargo.items = cargo.items || {};
        cargo.items[id] = (cargo.items[id] || 0) + (qty || 1);
      }
    } catch (_) {
      cargo.items = cargo.items || {};
      cargo.items[id] = (cargo.items[id] || 0) + (qty || 1);
    }
    // mark persistent so it can't be sold/jettisoned (cargo system checks a persistent set)
    if (!state.story.persistentCargo) state.story.persistentCargo = [];
    if (!state.story.persistentCargo.includes(id)) state.story.persistentCargo.push(id);
    // recompute caches via the cargo system if available
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    if (cargoSys && typeof cargoSys.recompute === 'function') {
      try { cargoSys.recompute(); } catch (e) { /* best-effort */ }
    }
  },

  _onHeliosBay7Scan() {
    const s = this.state && this.state.story;
    if (!s) return;
    s.flags = s.flags || {};
    if (s.flags.helios_bay7_scanned) return;
    s.flags.helios_bay7_scanned = true;
    this._fireComms({
      id: 'helios_bay7_ticket',
      sender: 'HELIOS MAINTENANCE',
      text: HELIOS_BAY7.scanLine,
      category: 'story',
      ttl: 10,
      persist: true,
    });
    this._showGraffiti(GRAFFITI.HELIOS_NOT_NEEDED, 'airlock', s.beatIndex || 0);
  },

  // =========================================================================================
  // SECTOR ENTRY — surface graffiti on arrival; Ashfall POI override.
  // =========================================================================================
  _onSectorEnter({ sectorId, firstVisit }) {
    const s = this.state.story;
    if (!s) return;
    s.flags = s.flags || {};
    // Re-surface bulkhead graffiti on every sector entry (it's on the player's own ship).
    const content = BEAT_CONTENT[s.beatIndex];
    if (content) {
      for (const g of (content.graffiti || [])) {
        if (g.where === 'bulkhead') this.bus.emit('graffiti:show', { line: g.line, where: 'bulkhead', beat: s.beatIndex });
      }
    }
    // Ashfall Reach: the late-game "long-form transmission" popup persists until the player visits.
    if (sectorId === ASHFALL) {
      s.flags.ashfall_visited = true;
      // Climate recognition — one ambient line, not a cutscene.
      if (!s.flags.ashfall_climate_noted) {
        s.flags.ashfall_climate_noted = true;
        this._fireComms({
          id: 'ashfall_climate',
          sender: 'ENVIRONMENTAL',
          text: 'CABIN: 14°C. AIR: HYDRAULIC OVER ORGANIC. MATCHES PRIOR LOG — SECTOR 0 BASELINE.',
          category: 'ambient',
          ttl: 8,
          persist: false,
        });
      }
      if (firstVisit && s.beatIndex >= 6) {
        this._fireComms({
          id: 'ashfall_arrival', sender: ASHFALL.toUpperCase().replace(/_/g, ' '),
          text: 'SIGNAL DETECTED: LONG-FORM TRANSMISSION. SOURCE: DERELICT STATION. CONTENTS: ADMINISTRATIVE LOG \u2014 11 YEARS. RECEIVING?',
          category: 'late', ttl: 0, persist: true,
        });
      }
      this._maybeOfferEndgame();
    }
  },

  // =========================================================================================
  // NEW GAME / LOAD / SERIALIZE
  // =========================================================================================
  _onNewGame() {
    this._ensureState(true);
    // Re-install Thread-B fragment after narrative reset clears persistentCargo.
    this._ensureThreadBFragment();
    this._rescheduleAmbient();
    // First-hour pacing (spec2/03): while the staged tutorial owns the one-voice channel, the cold-
    // start comms + bulkhead graffiti are deferred so the open teaches ONE verb at a time. They are
    // released when the tutorial finishes (tutorial:finished → _releaseDeferredColdStart). For a
    // player who opted out of tutorial hints, onboarding is inactive and the cold start fires now.
    if (this._tutorialOwnsOpening()) {
      this._coldStartDeferred = true;
    } else {
      this._fireColdStart();
    }
  },

  _ensureThreadBFragment() {
    const state = this.state;
    if (!state || !state.player || !state.player.cargo) return;
    const s = state.story || (state.story = {});
    const locked = s.persistentCargo || (s.persistentCargo = []);
    if (!locked.includes(THREAD_B_FRAGMENT_ID)) locked.push(THREAD_B_FRAGMENT_ID);
    const have = Number(state.player.cargo.items && state.player.cargo.items[THREAD_B_FRAGMENT_ID]) || 0;
    if (have < 1) {
      try { addCargo(state, THREAD_B_FRAGMENT_ID, 1); } catch (_) { /* best-effort */ }
    }
  },

  _tutorialOwnsOpening() {
    const gameplay = this.state && this.state.settings && this.state.settings.gameplay;
    if (gameplay && gameplay.tutorialHints === false) return false;
    const ob = this.state && this.state.onboarding;
    return !ob || (ob.active && !ob.finished) || ob.finished === false;
  },

  _onboardingActive() {
    const ob = this.state && this.state.onboarding;
    return !!(ob && ob.active && !ob.finished);
  },

  // Released once the tutorial hands off to story mode (or immediately if there was no tutorial).
  _releaseDeferredColdStart() {
    if (!this._coldStartDeferred) return;
    this._coldStartDeferred = false;
    this._fireColdStart();
  },

  // ── COLD START — the Tessera's first 20 seconds ──────────────────────────────────────────
  // The previous gang crew left graffiti on the bulkhead. It's there before you look.
  // The friend's message arrives at t=0. The registry and the dock follow without explanation.
  // No cutscene. No intro. The world just starts talking before you're ready.
  _fireColdStart() {
    // Set the previous crew's graffiti on the bulkhead immediately.
    // Dark humor. They knew they might not make it. They were right.
    this.bus.emit('graffiti:show', {
      line: GRAFFITI.GANG_DIDNT_MAKE_IT,
      where: 'bulkhead', beat: -1,
    });
    // Then the cold start comms arrive over the first ~20 seconds.
    for (const entry of COLD_START) {
      const event = {
        kind: 'comms',
        id: entry.id, sender: entry.sender, text: entry.text,
        category: entry.category, ttl: entry.ttl, note: entry.note,
      };
      if (!entry.delayS || entry.delayS <= 0) {
        this._fireScheduled(event);
      } else {
        this._scheduleNarrative(entry.delayS, event);
      }
    }
  },

  _scheduleNarrative(delayS, event) {
    this._ensureState();
    const s = this.state.story;
    const at = (this.state.simTime || 0) + Math.max(0, Number(delayS) || 0);
    s.scheduled.push(Object.assign({ at }, event));
    s.scheduled.sort((a, b) => (a.at || 0) - (b.at || 0));
  },

  _pumpScheduled() {
    const s = this.state.story;
    if (!s || !Array.isArray(s.scheduled) || !s.scheduled.length) return;
    const now = this.state.simTime || 0;
    while (s.scheduled.length && (s.scheduled[0].at || 0) <= now) {
      const event = s.scheduled.shift();
      this._fireScheduled(event);
    }
  },

  _fireScheduled(event) {
    if (!event) return;
    if (event.kind === 'graffiti') {
      this._showGraffiti(event.line, event.where, event.beat, event.author);
      return;
    }
    if (event.kind === 'comms') {
      this._fireComms({
        id: event.id,
        sender: event.sender,
        text: event.text,
        category: event.category,
        ttl: event.ttl,
        persist: !!event.persist,
        note: event.note,
      });
    }
  },

  _onLoaded() {
    this._ensureState();
    if (!(this.state.story.ambientTimerS > 0)) this._rescheduleAmbient();
    this._recoverValeMilestones();
    this._publishPostEndingContinuity('loaded');
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
      s.rngSeed = hash32(state.meta && state.meta.seed, 'story');
      s.scheduled = [];
      s.graffitiShown = {};
      s.endgameChoice = null;
      s.endgameOffered = false;
      s.endgameDeclined = [];
      s.endgameResolved = false;
      s.endgamePending = null;
      s.postEnding = null;
      s.persistentCargo = [];
      s.valeMilestones = { conflictFlip: null };
      s.verge = createVergeStoryState();
    } else {
      if (s.phase == null) s.phase = 1;
      if (!s.seenComms) s.seenComms = {};
      if (!Array.isArray(s.ambientQueue)) s.ambientQueue = [];
      if (typeof s.ambientTimerS !== 'number') s.ambientTimerS = 0;
      if (!Number.isFinite(s.rngSeed) || (s.rngSeed >>> 0) === 0) s.rngSeed = hash32(state.meta && state.meta.seed, 'story');
      if (!Array.isArray(s.scheduled)) s.scheduled = [];
      if (!s.graffitiShown) s.graffitiShown = {};
      if (s.endgameChoice == null) s.endgameChoice = null;
      if (!s.endgameOffered) s.endgameOffered = false;
      if (!Array.isArray(s.endgameDeclined)) s.endgameDeclined = [];
      if (s.endgameResolved == null) s.endgameResolved = !!(s.endgameChoice || (s.flags && s.flags.sandboxContinued));
      if (s.endgamePending === undefined) s.endgamePending = null;
      s.postEnding = normalizePostEndingContinuity(s.postEnding);
      if (!s.postEnding && (s.endgameChoice || (s.flags && s.flags.sandboxContinued))) {
        const choice = s.endgameChoice || SANDBOX_ID;
        s.postEnding = createPostEndingContinuity(choice, state.simTime || 0, state.meta && state.meta.seed);
      }
      if (!Array.isArray(s.persistentCargo)) s.persistentCargo = [];
      if (!s.valeMilestones || typeof s.valeMilestones !== 'object' || Array.isArray(s.valeMilestones)) {
        s.valeMilestones = { conflictFlip: null };
      } else if (s.valeMilestones.conflictFlip === undefined) {
        s.valeMilestones.conflictFlip = null;
      }
      if (!s.verge || typeof s.verge !== 'object' || Array.isArray(s.verge)) {
        s.verge = createVergeStoryState();
      } else {
        s.verge.revealed = s.verge.revealed === true;
        s.verge.awake = s.verge.awake === true;
        s.verge.valeGatesRevoked = s.verge.valeGatesRevoked === true;
        s.verge.playerUsedClosureProtocol = s.verge.playerUsedClosureProtocol === true;
        const evidence = s.verge.evidence && typeof s.verge.evidence === 'object' ? s.verge.evidence : {};
        s.verge.evidence = {
          kellPaperTrail: evidence.kellPaperTrail === true,
          archiveFile: evidence.archiveFile === true,
          kurtzLedger: evidence.kurtzLedger === true,
        };
        if (!Array.isArray(s.verge.revocations)) s.verge.revocations = [];
      }
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
      if (Array.isArray(carried.scheduled)) s.scheduled = carried.scheduled.slice();
      if (carried.graffitiShown) s.graffitiShown = Object.assign({}, carried.graffitiShown);
      if (carried.endgameChoice) s.endgameChoice = carried.endgameChoice;
      if (carried.endgameOffered) s.endgameOffered = true;
      if (Array.isArray(carried.endgameDeclined)) s.endgameDeclined = carried.endgameDeclined.slice();
      if (carried.endgameResolved != null) s.endgameResolved = !!carried.endgameResolved;
      else if (carried.endgameChoice || (carried.flags && carried.flags.sandboxContinued)) s.endgameResolved = true;
      if (carried.endgamePending) s.endgamePending = carried.endgamePending;
      if (carried.postEnding) s.postEnding = normalizePostEndingContinuity(carried.postEnding);
      if (Array.isArray(carried.persistentCargo)) s.persistentCargo = carried.persistentCargo.slice();
      if (carried.valeMilestones && typeof carried.valeMilestones === 'object' && !Array.isArray(carried.valeMilestones)) {
        const flip = carried.valeMilestones.conflictFlip;
        s.valeMilestones = { conflictFlip: flip && typeof flip === 'object' ? Object.assign({}, flip) : null };
      }
      if (carried.flags && typeof carried.flags === 'object') {
        s.flags = Object.assign({}, s.flags || {}, carried.flags);
      }
      if (!s.postEnding && (s.endgameChoice || (s.flags && s.flags.sandboxContinued))) {
        const choice = s.endgameChoice || SANDBOX_ID;
        s.postEnding = createPostEndingContinuity(choice, this.state.simTime || 0, this.state.meta && this.state.meta.seed);
      }
    }
  },
};

function createVergeStoryState() {
  return {
    revealed: false,
    awake: false,
    valeGatesRevoked: false,
    playerUsedClosureProtocol: false,
    evidence: { kellPaperTrail: false, archiveFile: false, kurtzLedger: false },
    revocations: [],
  };
}
