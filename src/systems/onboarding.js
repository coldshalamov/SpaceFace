// Onboarding / objective system. Gives a brand-new pilot a premise and a staged "learn the ropes"
// chain so the game makes sense instead of dropping them into space with no explanation. Entirely
// optional and non-blocking: it never freezes the sim, never steals movement, and respects
// state.settings.gameplay.tutorialHints. Self-contained — it builds its own DOM (an objective
// tracker panel + a dismissible intro card) and drives progress off real gameplay events.
//
// CONTEXTUAL FIRST-TIME HINTS (Phase 2): on top of the staged tutorial, the system fires one-shot
// toast hints the first time the player encounters a new mechanic (combat, shield break, stations,
// gates, cargo full). Tracked in state.player.hints so they persist across saves and never repeat.
// These are independent of the tutorial chain — they fire even if the tutorial was skipped.
//
// CONTEXTUAL CONTROL BAR (Phase 2): the static bottom-center hint strip is updated each frame to
// show controls relevant to the player's current activity (mining, combat, near station, open flight).
//
// System contract: { name, init(ctx), update(dt, state) }. Wired into registry SYSTEMS + UPDATE_ORDER.
//
// STORY OBJECTIVE TRACKER (P2-14): once the paced tutorial finishes (or for a returning player on
// load), the same panel slot switches to "story mode" and persistently shows the CURRENT story beat's
// objective + direction hint, read from state.story.beatIndex + STORY_BEATS (data) + BEAT_CONTENT
// (narrative). A player who missed the ephemeral comms toast can always see "what should I do now"
// without opening a menu.

import { drawSeeded, hash32 } from '../core/rng.js';
import { Masks } from '../core/entity.js';
import { controlPrompt, currentPromptModality } from '../ui/controlPrompts.js';
import { makeEnemySpawnSpec } from './combat.js';
import { massline2Flag } from '../data/featureFlags.js';
import {
  FLIGHT_DRILL_BEATS,
  FLIGHT_DRILL_BRAKE_WU,
  FLIGHT_DRILL_BURST_SHOTS,
  FLIGHT_DRILL_DISENGAGE_RANGE_WU,
  FLIGHT_DRILL_HEAT_RECOVER_FRAC,
  FLIGHT_DRILL_MARKER_RANGE_WU,
  FLIGHT_DRILL_SPEED_WU,
  isTrainingActor,
  maxWeaponHeatFraction,
} from '../onboarding/flightDrill.js';

const PANEL_ID = 'sf-onboarding';
const STYLE_ID = 'sf-onboarding-style';
const TAU = Math.PI * 2;

// ── FIRST-HOUR PACING (spec2/03) ────────────────────────────────────────────────
// The fix for "the open teaches five things at once" is PACING, not deletion: one beat → one verb
// → ≥4 s of silence → next beat. This BEATS table is the single source of truth for the first 15
// minutes. All tutorial lines are imperative, name ONE verb, and are ≤12 words (spec2/00 §5).
// Each beat fires only when the previous beat's DONE fired AND ≥SILENCE_S of text silence passed.
//
// `line`  : the verb bark shown at beat entry (the single tutorial voice in its window).
// `followups` : extra barks gated on in-beat events (latch/reel/cut, scan/seam/vent, sell/board).
// `done`  : the kind of DONE condition this beat resolves on (handled in _resolveBeatDone).
// Handoff: completing B5 (accepting any of three offers) calls _finish() → story-mode panel.
const SILENCE_S = 4;          // ≥4 s of text silence between a beat's DONE and the next beat's text
const TETHER_REEL_MAX_WU = 60;// B1: reel target distance
const SEAM_ORE_TARGET = 3;    // B2 DONE: ore collected
const B1_DERELICT_OFFSET_WU = 80;   // tether lesson starts inside the stronger live latch envelope
const TRAINER_MARKER_OFFSET_WU = 620;
const TRAINER_BURST_OFFSET_WU = 260;
const TRAINER_FLYBY_SPEED_WU = 118;
const TRAINER_FLYBY_OFFSET_WU = 52;

// B0 one-verb hierarchy (UIUX-B0-ONE-VERB):
//   1. HUD mission tracker (.sf-mission-tracker) is the sole persistent actionable objective
//      (fed by nav.waypoint.reason while onboarding waypoint is active).
//   2. #sf-onboarding panel is demoted during B0: progress/status only (no competing verb copy).
//   3. Transient tutorial voice (_sayTutorial) speaks the beat line once.
//   4. firstFlight control-hint wall is deferred until the staged rail is finished.
//   5. Mission Log / story longform stay on-demand context (not a second primary command).
const BEATS = [
  ...FLIGHT_DRILL_BEATS,
  { // B2 FIRST SEAM (~3:00) — scan + mine; modality-neutral verbs
    key: 'seam',
    line: 'Pulse the scanner.',
    followups: [
      { on: 'scan:hit', line: 'Beam the bright seams.' },
    ],
    done: 'oreCollected',
  },
  { // B4 DOCK (~7:00) — sell flow + ONE recommended contract
    key: 'dock',
    line: 'Helios. Dock when close.',
    followups: [
      { on: 'sold', line: "Board's got one job for you." },
    ],
    done: 'recommendSurfaced',
  },
  { // B5 CHOICE (~12:00) — three side-by-side offers; accept any → ends tutorial
    key: 'choice',
    line: 'Pick the work that fits.',
    done: 'mission:accepted',
  },
];
// Beat index for the choice beat (B5) — accepting its offer ends tutorial mode permanently.
const CHOICE_BEAT_INDEX = BEATS.length - 1;

const ORE_PREFIXES = [
  'cmdty_ore', 'cmdty_silicate', 'cmdty_ice', 'cmdty_volatiles',
  'cmdty_crystal', 'cmdty_gas', 'cmdty_scrap', 'cmdty_salvage',
];

export const ONBOARDING_OBJECTIVE_MARKER = Object.freeze({
  markerKind: 'mission-objective',
  mapLabel: '◆ AMBER DIAMOND',
});

// Canonical live waypoint builder shared with headless first-ten-minute acceptance. Marker identity
// is beat-stable and independent of ephemeral entity ids, so UI/radar/map surfaces agree after load.
export function buildOnboardingObjectiveWaypoint(beat, target) {
  if (!target || !target.pos) return null;
  const beatKey = String(beat && beat.key || 'objective').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return {
    onboarding: true,
    pos: { x: target.pos.x, z: target.pos.z },
    label: target.label || 'Beacon',
    reason: (beat && beat.line) || target.label || 'Objective',
    markerId: `onboarding:${beatKey}`,
    markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
    mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
  };
}

export const onboarding = {
  name: 'onboarding',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this.gamepad = ctx.gamepad;
    this.touch = ctx.touch;
    this._panel = null;
    this._bodyEl = null;
    this._titleEl = null;
    this._countEl = null;
    this._stepsEl = null;
    this._progressEl = null;
    this._flavorEl = null;
    this._kickerLabelEl = null;
    this._modalAriaHidden = null;
    this._accum = 0;
    this._lastTextAtS = -Infinity;
    this._controlHintsEl = null;
    this._dockControlInRange = false;
    this._gateControlInRange = false;
    this._derelictId = null;
    this._miningRockId = null;
    this._trainerId = null;
    this._firstRunSplashPending = false;

    const bus = this.bus;
    // The first-run splash is the sole opening line. B0 waits until it is physically removed.
    bus.on('ui:firstRunSplash:active', () => { this._firstRunSplashPending = true; });
    bus.on('ui:firstRunSplash:done', () => { this._firstRunSplashPending = false; });
    // Start only for a fresh game. Loaded saves emit save:loaded (no tutorial for a returning pilot).
    bus.on('game:started', () => this._begin());
    // On load, a returning pilot doesn't get the tutorial — but they DO get the story objective
    // tracker (P2-14), so they can always see their current beat objective. Tear down any tutorial
    // state, then bring up the story panel.
    bus.on('save:loaded', () => {
      this._teardown();
      this._dockControlInRange = false;
      this._gateControlInRange = false;
      this._lastControlMode = null;
      this._beginStoryMode();
    });

    // Objective completion hooks (real events verified against the systems).
    bus.on('dock:docked', () => { this._dockControlInRange = false; this._onBeatEvent('dock:docked'); });
    bus.on('economy:tradeCompleted', (p) => {
      if (p && p.side === 'sell') this._onBeatEvent('sold', p);
    });
    bus.on('mining:start', (p) => this._onBeatEvent('mining:start', p || {}));
    bus.on('mining:yield', (p) => this._recordTrainingOreYield(p || {}));
    bus.on('pickup:collected', (p) => this._recordOreCollected(p || {}));
    bus.on('mission:accepted', () => this._onBeatEvent('mission:accepted'));
    bus.on('ship:purchased', () => this._onBeatEvent('mission:accepted'));

    // ── First-hour beat events (spec2/03) ─────────────────────────────────────────────────
    bus.on('tether:latched', (p) => this._onBeatEvent('tether:latched', p || {}));
    // Production winch path (attachments.reel) emits tether:reel {before,after}. Gate the B1 cut
    // follow-up on rest length <= TETHER_REEL_MAX_WU so loose pay-out/early ticks do not teach cut.
    bus.on('tether:reel', (p) => this._onTetherReel(p || {}));
    bus.on('tether:released', (p) => this._onBeatEvent('tether:released', p || {}));
    bus.on('tether:broke', (p) => this._onTetherBroken(p || {}));
    bus.on('tether:nearBreak', (p) => this._onBeatEvent('tether:nearBreak', p || {}));
    bus.on('scan:completed', (p) => this._onTrainingScanComplete(p || {}));
    bus.on('flybyFocus:start', (p) => {
      if (p && p.targetId === this._trainerId) this._onBeatEvent('flybyFocus:start', p);
    });
    bus.on('combat:fire', (p) => this._onTrainingFire(p || {}));

    // ── Contextual first-time hints (fire once per hint, persist across saves) ───────────────
    // These are independent of the tutorial chain: they fire for all players whose
    // settings.gameplay.tutorialHints is not explicitly false, including players who
    // skipped the staged tutorial.

    // First enemy encounter: triggered when the player first takes damage from a hostile.
    bus.on('combat:damage', (p) => {
      if (!p || !p.isPlayer) return;
      this._showHint('firstCombat',
        controlPrompt('firstCombat', this._promptModality()));
    });

    // First shield break: triggered when shields drop to zero.
    bus.on('combat:damage', (p) => {
      if (!p || !p.isPlayer || !p.brokeShield) return;
      this._showHint('firstShieldDrop',
        'Break contact. Shields recharge when fire stops.');
    });

    // First station approach: enriches the existing dock prompt with what stations offer.
    bus.on('dock:range', ({ inRange }) => {
      this._dockControlInRange = !!inRange;
      if (!inRange) return;
      this._showHint('firstStation',
        controlPrompt('firstStation', this._promptModality()));
    });

    // First jump gate approach: teach the player how gates work.
    bus.on('gate:range', ({ inRange }) => {
      this._gateControlInRange = !!inRange;
      if (!inRange) return;
      this._showHint('firstGate',
        controlPrompt('firstGate', this._promptModality()));
    });

    // First cargo full: teach the player to sell.
    bus.on('cargo:full', () => {
      this._showHint('firstCargoFull',
        'Dock and sell cargo to free hold space.');
    });

    // ── Mid/late-game system onboarding (P1-10) ─────────────────────────────────────────────
    // The first-session rail covers flight + first dock/sell, but drill-mining, outfitting, the tech
    // tree, automation, claims/bases, and crafting are all un-onboarded — the player hits a steep
    // self-serve cliff the moment they dock. Each of these fires a ONE-TIME contextual hint on the
    // player's first interaction with that system, via the same player.hints mechanism as the
    // flight hints above. The hint explains what the system IS + the immediate next step, so the
    // player is never staring at an unfamiliar screen with no guidance.

    // First dock: orient the player to the 8-tab station hub. This is the single biggest "cliff"
    // moment — a new player docking for the first time sees Market/Shipyard/Outfitting/Manufacture/
    // Missions/Services/Factions/Bar with no explanation. This fires on every first dock (not just
    // the tutorial's dock step) so returning players who skipped the tutorial still get oriented.
    bus.on('dock:docked', () => {
      this._showHint('firstHub',
        'Use the left rail. Departure Check owns undock.');
    });

    // Deep-drill (ant-farm mining): the first time the player activates a drill on an asteroid.
    bus.on('drill:start', () => {
      this._showHint('firstDrill',
        'Deep-drill active! You are now inside the asteroid. Mine the colored ore veins and avoid gas pockets. Press B again or fly out to exit.');
    });

    // Outfitting: the first time the player equips OR buys a module at a station.
    bus.on('ui:fitModule', () => {
      this._showHint('firstOutfit',
        'Module equipped! Visit Outfitting at any station to swap shields, engines, weapons, and utility modules (like the Chaff Dispenser). Bigger ships have more slots.');
    });
    bus.on('ui:buyModule', () => {
      this._showHint('firstOutfit',
        'Module purchased! Equip it in Outfitting. Modules fill ship slots — shields, engines, weapons, utility. Sell the old one back if you need credits.');
    });

    // Tech tree: the first time the player researches a node.
    bus.on('tech:researched', () => {
      this._showHint('firstTech',
        'Research complete! The Tech Tree (T) unlocks new ships, modules, and capabilities. Some gear requires research before you can buy or build it.');
    });

    // Automation: the first time the player deploys a drone.
    bus.on('asset:deployed', (p) => {
      if (!p || p.kind !== 'drone') return;
      this._showHint('firstAutomation',
        'Drone deployed! Drones auto-mine ore and haul it to your ship or a depot. Manage them in the Automation panel — more drones unlock with tech.');
    });

    // Claims/bases: the first time the player claims a body.
    bus.on('claim:claimed', () => {
      this._showHint('firstClaim',
        'Body claimed! Build modules on it (Cargo Depot, On-Site Refinery, Defense Battery) to automate ore flow. Claimed bases persist across the sector.');
    });

    // Crafting: the first time the player queues a craft job (refine/assemble/augment).
    bus.on('craft:queueChanged', () => {
      this._showHint('firstCraft',
        'Craft job queued! The Manufacture tab refines raw ore into materials, assembles components, and augments modules. Some recipes need research first.');
    });

    // Massline Physics Identity (Wave M2, massline2Flag-gated so headless contract runs and
    // flag-off sessions never see them). One-shot contextual hints for the three new verbs; the
    // authored first-hour BEATS rail is untouched.
    bus.on('tether:latched', (payload) => {
      if (!massline2Flag('throw')) return;
      const target = payload && payload.targetId != null && this.state.entities
        ? this.state.entities.get(payload.targetId)
        : null;
      // The express-specific lesson owns this first latch. Leave the general throw lesson unspent
      // for the next ordinary target so one event never queues two tutorial voices.
      if (massline2Flag('hitchhiking') && isExpressHitchTarget(target)) return;
      this._showHint('masslineThrow',
        masslineThrowHint(this.state));
    });
    bus.on('tether:latched', (payload) => {
      if (!massline2Flag('hitchhiking') || !payload || payload.targetId == null) return;
      const target = this.state.entities && this.state.entities.get(payload.targetId);
      if (!isExpressHitchTarget(target)) return;
      this._showHint('masslineHitchhiking',
        'Express liners stay on boost. Latch, ride, then cut to keep speed.');
    });
    bus.on('massline:selfSling', () => {
      if (!massline2Flag('throw')) return;
      this._showHint('masslineSelfSling',
        'Cut from a heavy anchor to bank its momentum as a slingshot.');
    });
    bus.on('cargo:jettisoned', () => {
      if (!massline2Flag('jettisonImpulse')) return;
      this._showHint('masslineJettisonImpulse',
        'Jettisoned cargo is reaction mass: dump aft for an emergency push.');
    });
    bus.on('bulletTime:start', () => {
      if (!massline2Flag('bulletTime')) return;
      this._showHint('masslineBulletTime',
        'Hold CAPS LOCK to stretch time. Release it to recharge.');
    });
    bus.on('cloak:engaged', () => {
      if (!massline2Flag('cloak')) return;
      this._showHint('masslineCloak',
        'Coast inside the ring to stay hidden. Firing drops cloak.');
    });
    bus.on('charge:aftDropped', () => {
      if (!massline2Flag('bombPropulsion')) return;
      this._showHint('bombPropulsion',
        'Brake and throw to drop aft. Press R to detonate.');
    });

    // First flight: triggered a few seconds after the game starts (handled in update via a timer).
    this._firstFlightTimer = 0;
    this._firstFlightPending = false;
    bus.on('game:started', () => { this._firstFlightPending = true; this._firstFlightTimer = 0; });

    // ── Contextual control bar state ─────────────────────────────────────────────────────────
    this._lastControlMode = null;
  },

  // Show a one-time contextual hint via the toast system. The hint key corresponds to a flag in
  // state.player.hints. If the flag is already true (hint was shown before, even in a prior save),
  // this is a no-op. Respects the tutorialHints setting.
  _showHint(key, text) {
    const st = this.state;
    if (st.settings && st.settings.gameplay && st.settings.gameplay.tutorialHints === false) return;
    // The staged rail is already the tutorial. Contextual walls wait until it finishes so a
    // combat hit, dock range, or cargo edge cannot queue a second lesson behind the current verb.
    if (this._tutorialRailOwnsVoice()) return;
    if (!st.player.hints) st.player.hints = {};
    if (st.player.hints[key]) return;
    st.player.hints[key] = true;
    // Contextual first-time hints are tutorial-tier too — routed through the one-voice arbiter so a
    // hint never stacks on top of a beat line or a danger alert. Distinct id per hint key. Toast
    // fallback only when the arbiter helper is absent.
    const voice = this.helpers && this.helpers.voice;
    const said = voice && typeof voice.say === 'function'
      && voice.say({ channel: 'tutorial', text, kind: 'info', ttl: 7, id: 'tutorial:hint:' + key });
    if (!said) this.bus.emit('toast', { text, kind: 'info', ttl: 7 });
  },

  _tutorialRailOwnsVoice() {
    const ob = this.state && this.state.onboarding;
    return !!(ob && ob.active && !ob.finished);
  },

  _isOre(id) { return !!id && ORE_PREFIXES.some((p) => String(id).startsWith(p)); },

  _begin() {
    const st = this.state;
    this._dockControlInRange = false;
    this._gateControlInRange = false;
    this._lastControlMode = null;
    const hintsOn = !st.settings || !st.settings.gameplay || st.settings.gameplay.tutorialHints !== false;
    // First-hour pacing state (spec2/03). currentBeat is the beat the player is ON (its line has
    // fired); pendingBeat is the next one waiting for the silence gate. beatDoneAtS timestamps each
    // beat's DONE so the ≥SILENCE_S gate can enforce the one-verb cadence.
    st.onboarding = {
      active: hintsOn, finished: false,
      currentBeat: -1,            // no beat's text has fired yet
      beatDoneAt: {},             // { beatKey: simTimeS }
      firedFollowups: {},         // { beatKey:eventName: true } — followup barks fire once
      oreCollected: 0,            // B2 progress
      trainingOre: 0,
      tetherReeled: false,
      tetherBreaks: 0,
      beatAction: '',
      burstShots: 0,
      burstPeakHeat: 0,
      burstCooling: false,
    };
    // A fresh new game starts in tutorial mode (not story mode).
    this._storyMode = false;
    this._lastTextAtS = -Infinity;
    if (!hintsOn) {
      // Player opted out of the tutorial entirely — still give them the story objective tracker so
      // they're never without a "what now" (P2-14).
      this._beginStoryMode();
      return;
    }
    this._injectStyle();
    this._buildPanel();
    // No intro modal (spec2/03 B0: "no modal"). The B0 line fires on the first update tick after the
    // 4 s silence gate (no predecessor → fires immediately).
    this._refreshBeatPanel();
  },

  // Enter story-mode (the persistent objective tracker) without the tutorial. Used by save:loaded
  // (returning pilots) and by players who skipped/disabled tutorial hints. Respects the tutorialHints
  // setting — a pilot who turned hints off still gets the tracker ONLY if they haven't also disabled
  // story cues; for simplicity we always show the story tracker (it's the objective, not a hint).
  _beginStoryMode() {
    this._storyMode = true;
    this._storySig = '';
    this._retireTutorialPanel();
    this._refreshStory();
  },

  _retireTutorialPanel() {
    if (this._panel) this._panel.remove();
    this._panel = null;
    this._bodyEl = null;
    this._titleEl = null;
    this._countEl = null;
    this._stepsEl = null;
    this._progressEl = null;
    this._flavorEl = null;
    this._kickerLabelEl = null;
  },

  _teardown() {
    const ob = this.state.onboarding; if (ob) ob.active = false;
    this._removeTrainingActors();
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._bodyEl = null;
    this._titleEl = null;
    this._countEl = null;
    this._stepsEl = null;
    this._progressEl = null;
    this._flavorEl = null;
    this._kickerLabelEl = null;
    this._modalAriaHidden = null;
    this._clearObjectiveWaypoint();
    this._storyMode = false;
    this._storySig = '';
  },

  // ── The single tutorial-voice chokepoint (spec2/03 §5.2 one-voice audit) ──────────────────
  // EVERY first-hour tutorial line passes through here so the check can audit text overlap at one
  // place. Emits on the 'tutorial' tier (toast kind 'info'). Updates the silence-gate clock.
  _sayTutorial(text) {
    if (!text) return;
    this._lastTextAtS = this.state.simTime || 0;
    // Record for the one-voice audit: { atS, text } appended to a session log on state.onboarding.
    const ob = this.state.onboarding;
    if (ob) {
      if (!Array.isArray(ob.tutorialLog)) ob.tutorialLog = [];
      ob.tutorialLog.push({ atS: this._lastTextAtS, text });
    }
    this.bus.emit('tutorial:say', { text, atS: this._lastTextAtS });
    // Route the tutorial voice through the one-voice arbiter (channel 'tutorial'): it preempts
    // objective nudges + chatter but yields to danger and story. A stable id means a beat's followup
    // lines replace the beat line in place (one tutorial voice at a time). Fall back to a toast only
    // when the arbiter helper is unavailable (headless/unit contexts).
    const voice = this.helpers && this.helpers.voice;
    const said = voice && typeof voice.say === 'function'
      && voice.say({ channel: 'tutorial', text, kind: 'info', ttl: 6, id: 'tutorial:beat' });
    if (!said) this.bus.emit('toast', { text, kind: 'info', ttl: 6 });
  },

  // Try to advance to the next beat if the silence gate has passed since the previous beat's DONE.
  // Called from update(). Fires the new beat's entry line + spawns the beat's world content.
  _tryAdvanceBeat() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const nextIndex = ob.currentBeat + 1;
    if (nextIndex >= BEATS.length) return;
    // First-run opening line owns the screen until its fade has completed.
    if (nextIndex === 0 && this._firstRunSplashPending) return;
    // Silence gate: the previous beat must have DONE'd AND ≥SILENCE_S passed since the last text.
    if (nextIndex > 0) {
      const prev = BEATS[nextIndex - 1];
      const prevDoneAt = ob.beatDoneAt[prev.key];
      if (prevDoneAt == null) return;                 // predecessor not DONE yet
      const now = this.state.simTime || 0;
      if (now - Math.max(prevDoneAt, this._lastTextAtS) < SILENCE_S) return;
    }
    ob.currentBeat = nextIndex;
    const beat = BEATS[nextIndex];
    ob.beatAction = beat.line;
    this._sayTutorial(beat.line);
    this._enterBeat(beat);
    this._refreshBeatPanel();
  },

  // Spawn only inert, invulnerable training content during the flight drill.
  _enterBeat(beat) {
    if (!beat) return;
    if (beat.key === 'thrust' || beat.key === 'brake') this._setObjectiveWaypoint(true);
    else if (beat.key === 'marker') {
      this._spawnTrainer('marker');
      this._setObjectiveWaypoint(true);
    }
    else if (beat.key === 'focus') this._beginTrainerFlyby();
    else if (beat.key === 'tether') {
      this._spawnDerelict();
      this._setObjectiveWaypoint(true);
    }
    else if (beat.key === 'burst') {
      this._spawnTrainer('burst');
      const ob = this.state.onboarding;
      if (ob) {
        ob.burstShots = 0;
        ob.burstPeakHeat = 0;
        ob.burstCooling = false;
      }
      this._setObjectiveWaypoint(true);
    }
    else if (beat.key === 'disengage') this._setObjectiveWaypoint(true);
    else if (beat.key === 'seam') {
      this._spawnMiningRock();
      this._setObjectiveWaypoint(true);
    }
    else if (beat.key === 'dock') this._setObjectiveWaypoint(true);
    else if (beat.key === 'choice') this._openChoice();
  },

  // B1 reel follow-up: only when the production tether:reel payload shows a tight winch.
  // attachments.reel emits { before, after } rest lengths (wu). TETHER_REEL_MAX_WU is the
  // winched-enough teach-cut threshold (spec2/03 B1: reel <= 60 wu).
  _onTetherReel(payload) {
    if (!payload || payload.targetId !== this._derelictId) return;
    const after = Number(payload && payload.after);
    if (!Number.isFinite(after) || after > TETHER_REEL_MAX_WU) return;
    if (this.state.onboarding) this.state.onboarding.tetherReeled = true;
    this._onBeatEvent('tether:reel', payload);
  },

  _onTetherBroken(payload) {
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat || beat.key !== 'tether' || payload.targetId !== this._derelictId) return;
    ob.tetherBreaks = (ob.tetherBreaks || 0) + 1;
    ob.tetherReeled = false;
    delete ob.firedFollowups['tether:tether:latched'];
    delete ob.firedFollowups['tether:tether:nearBreak'];
    delete ob.firedFollowups['tether:tether:reel'];
    ob.beatAction = 'Close distance. Latch the derelict again.';
    this._sayTutorial(ob.beatAction);
    this._setObjectiveWaypoint(true);
    this._refreshBeatPanel();
  },

  _onTrainingScanComplete(payload) {
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat || beat.key !== 'seam' || this._miningRockId == null) return;
    const rock = this.state.entities && this.state.entities.get(this._miningRockId);
    if (!rock || !rock.data || !(rock.data.scanHighlightUntil >= (this.state.simTime || 0))) return;
    if (!payload.found || !(payload.found.asteroids > 0)) return;
    this._onBeatEvent('scan:hit', { ...payload, targetId: rock.id });
  },

  _recordTrainingOreYield(payload) {
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat || beat.key !== 'seam' || payload.minerId !== this.state.playerId) return;
    const rock = this._miningRockId != null && this.state.entities && this.state.entities.get(this._miningRockId);
    if (!rock || !rock.pos || !payload.pos) return;
    if (Math.hypot(payload.pos.x - rock.pos.x, payload.pos.z - rock.pos.z) > Math.max(6, rock.radius || 0)) return;
    const qty = Math.max(1, Number(payload.qty) || 1);
    ob.trainingOre = (ob.trainingOre || 0) + qty;
    ob.oreCollected = Math.max(ob.oreCollected || 0, ob.trainingOre);
    if (ob.trainingOre >= SEAM_ORE_TARGET) this._beatDone(beat);
    this._refreshBeatPanel();
  },

  // Route a gameplay event to the current beat's followups + DONE resolution.
  _onBeatEvent(eventName, payload) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat) return;
    if (beat.key === 'tether' && eventName !== 'target:acquired') {
      if (!payload || payload.targetId !== this._derelictId) return;
    }
    // Followup barks (fire once per beat).
    for (const fu of (beat.followups || [])) {
      if (fu.on !== eventName) continue;
      const fkey = beat.key + ':' + fu.on;
      if (ob.firedFollowups[fkey]) continue;
      ob.firedFollowups[fkey] = true;
      ob.beatAction = fu.line;
      this._sayTutorial(fu.line);
    }
    this._resolveBeatDone(beat, eventName, payload);
    this._refreshBeatPanel();
  },

  // Resolve the current beat's DONE condition. Each beat maps to a done-kind (see BEATS table).
  _resolveBeatDone(beat, eventName, payload) {
    const ob = this.state.onboarding;
    if (!ob || ob.beatDoneAt[beat.key] != null) return; // already DONE
    const done = beat.done;
    let resolved = false;
    if (done === 'tether:released' && eventName === 'tether:released' && ob.tetherReeled === true) {
      resolved = true;
      this._dropDerelictSalvage();
    } else if (done === 'flybyFocus:start' && eventName === 'flybyFocus:start') {
      resolved = true;
    } else if (done === 'mission:accepted' && eventName === 'mission:accepted') {
      resolved = true; // B5: accepting any offer ends the tutorial
    } else if (done === 'recommendSurfaced' && eventName === 'sold') {
      // B4 DONE = the player sold the haul, which surfaces the board's one recommended contract.
      // The "Board's got one job for you." followup bark fires on this same event (just above).
      resolved = true;
    }
    // Movement, heat recovery, distance, and ore collection resolve from deterministic state reads.
    if (resolved) this._beatDone(beat);
  },

  // Mark a beat DONE and, if it was the choice beat, finish the tutorial.
  _beatDone(beat) {
    const ob = this.state.onboarding;
    if (!ob || ob.beatDoneAt[beat.key] != null) return;
    ob.beatDoneAt[beat.key] = this.state.simTime || 0;
    if (beat.key === 'choice' || BEATS.indexOf(beat) === CHOICE_BEAT_INDEX) {
      this._finish();
    }
  },

  _recordOreCollected(p) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    // The authored seam lesson advances only from ore physically cut from its marked rock. Generic
    // pickup counting remains as a fallback for old saves that entered B2 without the training rock.
    if (beat && beat.key === 'seam' && this._miningRockId != null) return;
    // Count any ore the player collects while on/after the seam beat (B2). The pickup may also fire
    // for the B1 salvage — that's fine, only the seam beat's DONE cares about the count.
    if (p.collectorId != null && p.collectorId !== this.state.playerId) return;
    if (!this._isOre(p.commodityId)) return;
    ob.oreCollected = (ob.oreCollected || 0) + Math.max(1, p.qty || p.amount || 1);
    if (beat && beat.done === 'oreCollected' && ob.oreCollected >= SEAM_ORE_TARGET) {
      this._beatDone(beat);
    }
    this._refreshBeatPanel();
  },

  _onTrainingFire(p) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat || beat.key !== 'burst' || p.ownerId !== this.state.playerId) return;
    ob.burstShots = (ob.burstShots || 0) + 1;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    ob.burstPeakHeat = Math.max(ob.burstPeakHeat || 0, maxWeaponHeatFraction(player));
    if (ob.burstShots >= FLIGHT_DRILL_BURST_SHOTS && !ob.burstCooling) {
      ob.burstCooling = true;
      this._onBeatEvent('burst:ready', { shots: ob.burstShots, peakHeat: ob.burstPeakHeat });
    }
  },

  _finish() {
    const ob = this.state.onboarding; if (!ob) return;
    this._removeTrainingActors();
    ob.finished = true;
    ob.active = false; // tutorial mode ends permanently (spec2/03 B5)
    this._clearObjectiveWaypoint();
    // Tell the story system the tutorial is over so it can release the deferred cold-start voice.
    this.bus.emit('tutorial:finished', {});
    // The HUD mission tracker is the one persistent objective owner after B5. Retire this tutorial
    // panel so story prose cannot compete with verb + destination + radar-marker guidance.
    this._storyMode = true;
    this._retireTutorialPanel();
    this._refreshStory();
  },

  // Story objectives persist through the HUD mission tracker. This system deliberately keeps no
  // second story/lore panel; the comms backlog remains available on demand.
  _refreshStory() {
    if (this._storyMode) this._retireTutorialPanel();
  },

  // Keep the objective panel's assistive-tree state in sync with the modal UI. When a modal or
  // dock screen hides the panel via CSS, we also mark it aria-hidden so screen readers do not
  // traverse the hidden content; removing the class restores it accurately.
  _syncModalAccessibility() {
    if (!this._panel) return;
    const modalOpen = !!(document.body && document.body.classList.contains('ui-modal-open'));
    if (modalOpen) {
      if (this._panel.getAttribute('aria-hidden') !== 'true') {
        this._panel.setAttribute('aria-hidden', 'true');
        this._modalAriaHidden = true;
      }
    } else {
      if (this._panel.hasAttribute('aria-hidden')) {
        this._panel.removeAttribute('aria-hidden');
        this._modalAriaHidden = false;
      }
    }
  },

  // per-frame: proximity check for the starter claim + panel fade-out + contextual hints + control bar.
  update(dt, state) {
    // Modal UI hides the objective via CSS; mirror that in assistive state without focus side-effects.
    try { this._syncModalAccessibility(); } catch (_) { /* non-critical a11y mirror */ }

    // ── First-flight control-hint wall ───────────────────────────────────────────────────
    // The staged tutorial already teaches every opening verb. The generic control wall waits until
    // the entire rail finishes, then appears after three seconds of free flight for skippers/returners.
    if (this._firstFlightPending && state.mode === 'flight') {
      if (!this._firstFlightB0Released(state)) {
        this._firstFlightTimer = 0;
      } else {
        this._firstFlightTimer += dt;
        if (this._firstFlightTimer > 3.0) {
          this._firstFlightPending = false;
          this._showHint('firstFlight',
            controlPrompt('firstFlight', this._promptModality()));
        }
      }
    }

    // ── Contextual control bar ───────────────────────────────────────────────────────────
    try { this._updateControlBar(state); } catch (_) { /* non-critical */ }

    // ── First-hour pacing (only while active) ────────────────────────────────────────────
    const ob = state.onboarding;
    if (!ob || !ob.active) return;
    try {
      this._accum = (this._accum || 0) + dt;
      if (this._accum < 0.2) return;
      this._accum = 0;
      // Advance through the beat gate (silence-gated) + resolve proximity DONE conditions.
      this._tryAdvanceBeat();
      this._resolveProximityDone();
      this._setObjectiveWaypoint(false);
    } catch (_) { /* never let onboarding break the loop */ }
  },

  // True when firstFlight may fire without stacking on any staged teaching beat.
  _firstFlightB0Released(state) {
    const ob = state && state.onboarding;
    return !ob || !ob.active || !!ob.finished;
  },

  // Determine the player's current activity and update the bottom control hint bar to show
  // relevant keys. Modes: 'mining' (beam active), 'combat' (hostile targeted or taking fire),
  // 'station' (near a station), 'gate' (near a gate), 'flight' (default open-space cruising).
  _updateControlBar(state) {
    if (state.mode !== 'flight') return;
    let el = this._controlHintsEl;
    if (!el || !el.isConnected) {
      el = document.getElementById('control-hints');
      this._controlHintsEl = el || null;
    }
    if (!el) return;

    // During the staged rail the HUD objective + one attention line own instruction. Hide the multi-verb
    // control laundry; it returns automatically after the rail finishes.
    const onboardingState = state.onboarding;
    if (onboardingState && onboardingState.active && !onboardingState.finished) {
      if (el.textContent) el.textContent = '';
      this._lastControlMode = 'tutorial-rail';
      return;
    }

    let mode = 'flight';

    if (state.input && state.input.fireGroup === 2) mode = 'mining';

    // Check for hostile target or incoming fire (combat takes priority over mining).
    const tid = state.player.targetId;
    if (tid != null) {
      const target = state.entities.get(tid);
      if (target && target.alive && target.team != null) {
        const player = state.entities.get(state.playerId);
        if (player && target.team !== player.team) mode = 'combat';
      }
    }

    // Check for station/gate proximity (overrides flight, not combat/mining).
    if (mode === 'flight') {
      if (this._dockControlInRange) mode = 'station';
      else if (this._gateControlInRange) mode = 'gate';
    }

    const modality = this._promptModality();
    const controlSig = `${modality}:${mode}`;
    if (controlSig === this._lastControlMode) return;
    this._lastControlMode = controlSig;

    el.textContent = controlPrompt(mode, modality);
    // Flash the bar for 3.5s on context change so the player sees the relevant hint, then it fades.
    // Skips flash on the generic 'flight' mode restore so returning from combat doesn't re-surface it.
    if (mode !== 'flight' && typeof window._sfShowHints === 'function') {
      window._sfShowHints(3500);
    }
  },

  _promptModality() {
    return currentPromptModality({ gamepad: this.gamepad, touch: this.touch });
  },

  // Resolve drill conditions from canonical sim state. No key assumptions and no wall clock.
  _resolveProximityDone() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat || ob.beatDoneAt[beat.key] != null) return;
    const player = this.state.entities.get(this.state.playerId);
    if (!player || !player.pos) return;
    const speed = Math.hypot(Number(player.vel && player.vel.x) || 0, Number(player.vel && player.vel.z) || 0);
    let trainer = this._trainingActor();
    if (!trainer && ['marker', 'focus', 'burst', 'disengage'].includes(beat.key)) {
      trainer = this._spawnTrainer(beat.key === 'burst' || beat.key === 'disengage' ? 'burst' : 'marker');
      if (beat.key === 'focus') this._beginTrainerFlyby();
      this._setObjectiveWaypoint(true);
      return; // automatic retry starts from a clean, readable placement next tick
    }
    const trainerDistance = trainer && trainer.pos
      ? Math.hypot(trainer.pos.x - player.pos.x, trainer.pos.z - player.pos.z)
      : Infinity;
    if (beat.key === 'tether' && this._derelictId != null
      && this.state.player.targetId === this._derelictId
      && !ob.firedFollowups['tether:target:acquired']) {
      this._onBeatEvent('target:acquired', { targetId: this._derelictId });
    }
    if (beat.done === 'speedUp' && speed >= FLIGHT_DRILL_SPEED_WU) this._beatDone(beat);
    else if (beat.done === 'speedDown' && speed <= FLIGHT_DRILL_BRAKE_WU) this._beatDone(beat);
    else if (beat.done === 'trainerRange' && trainerDistance <= FLIGHT_DRILL_MARKER_RANGE_WU) this._beatDone(beat);
    else if (beat.done === 'burstCooled') {
      const heat = maxWeaponHeatFraction(player);
      ob.burstPeakHeat = Math.max(ob.burstPeakHeat || 0, heat);
      if (ob.burstCooling && ob.burstShots >= FLIGHT_DRILL_BURST_SHOTS
        && heat <= Math.max(0.02, (ob.burstPeakHeat || 0) * FLIGHT_DRILL_HEAT_RECOVER_FRAC)) {
        this._beatDone(beat);
      }
    } else if (beat.done === 'disengaged' && trainerDistance >= FLIGHT_DRILL_DISENGAGE_RANGE_WU) {
      this._removeTrainingActors();
      this._beatDone(beat);
    }
  },

  // B1: spawn a derelict wreck near the beacon for the tether trio (latch/winch/cut).
  _spawnDerelict() {
    const st = this.state;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos || !this.helpers || !this.helpers.spawnEntity) return;
    // Offset from the current ship so the stronger live massline can be learned without a chase.
    const ang = onboardingRandom(st) * TAU;
    const pos = {
      x: player.pos.x + Math.cos(ang) * B1_DERELICT_OFFSET_WU,
      z: player.pos.z + Math.sin(ang) * B1_DERELICT_OFFSET_WU,
    };
    const wreck = this.helpers.spawnEntity({
      type: 'wreck', pos, vel: { x: 0, z: 0 }, radius: 14, mass: 900,
      hull: 1, hullMax: 1, // derelict — already dead, tether-only
      data: { parentType: 'ship', loot: [], salvagePool: {}, salvageTimeLeft: 0, onboarding: true, kind: 'derelict' },
    });
    if (wreck) this._derelictId = wreck.id;
  },

  // B1 DONE: the vacuum shows itself — drop 2 salvage pickups, no line.
  _dropDerelictSalvage() {
    const st = this.state;
    if (this._derelictId == null || !this.helpers || !this.helpers.spawnEntity) return;
    const wreck = st.entities && st.entities.get(this._derelictId);
    if (!wreck || !wreck.pos) return;
    for (let i = 0; i < 2; i++) {
      const ang = onboardingRandom(st) * TAU;
      const sp = 12;
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: wreck.pos.x + Math.cos(ang) * 10, z: wreck.pos.z + Math.sin(ang) * 10 },
        vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp },
        radius: 2.2,
        data: { kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1, despawnAt: (st.simTime || 0) + 60 },
      });
    }
  },

  _spawnTrainer(mode) {
    const st = this.state;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos || !this.helpers || !this.helpers.spawnEntity) return null;
    this._removeTrainingActors();
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const range = mode === 'burst' ? TRAINER_BURST_OFFSET_WU : TRAINER_MARKER_OFFSET_WU;
    const pos = {
      x: player.pos.x + Math.cos(heading) * range,
      z: player.pos.z + Math.sin(heading) * range,
    };
    const spec = makeEnemySpawnSpec('reaver_pirate', 1, pos, { startedTick: st.tick });
    if (spec) {
      spec.name = mode === 'burst' ? 'SCN Gunnery Buoy' : 'SCN Flight Trainer';
      spec.type = 'drone';
      spec.team = 0;
      spec.factionId = 'faction_scn';
      // Projectile-only custom mask gives the gunnery burst a real hit receipt; the ghost Rapier
      // material guarantees the trainer can never ram the player.
      spec.collides = true;
      spec.collisionMask = Masks.PROJECTILE;
      spec.physicsBody = { ...(spec.physicsBody || {}), material: 'projectile' };
      spec.mass = 90;
      spec.vel = { x: 0, z: 0 };
      spec.flags = { ...(spec.flags || {}), invuln: true };
      spec._invulnUntil = Infinity;
      spec.data = spec.data || {};
      spec.data.weapons = [];
      spec.data.ai = {
        ...(spec.data.ai || {}),
        passive: true,
        roe: 'hold_fire',
        spawnContext: 'tutorial_training',
        motive: 'training',
      };
      spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: heading };
      spec.data.onboarding = true;
      spec.data.onboardingTraining = true;
      spec.data.trainingFocusEligible = true;
      spec.data.trainingMode = mode;
      spec.shieldRegenRate = 0;
      spec.hull = spec.hullMax = Math.max(100, spec.hullMax || 100);
      const trainer = this.helpers.spawnEntity(spec);
      if (trainer) {
        trainer._invulnUntil = Infinity;
        this._trainerId = trainer.id;
        if (st.onboarding) st.onboarding._trainerId = trainer.id;
        st.player.targetId = trainer.id;
        return trainer;
      }
    }
    return null;
  },

  _spawnMiningRock() {
    const st = this.state;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos || !this.helpers || !this.helpers.spawnEntity) return null;
    const existing = this._miningRockId != null && st.entities.get(this._miningRockId);
    if (existing && existing.alive !== false) return existing;
    const angle = onboardingRandom(st) * TAU;
    const rock = this.helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: player.pos.x + Math.cos(angle) * 118, z: player.pos.z + Math.sin(angle) * 118 },
      vel: { x: 0, z: 0 },
      radius: 18,
      mass: 180,
      hull: 60,
      hullMax: 60,
      data: {
        typeId: 'ast_common_rock', oreHP: 60, oreHPMax: 60, yieldU: SEAM_ORE_TARGET,
        onboarding: true, onboardingTraining: true, trainingMining: true,
      },
    });
    if (rock) {
      this._miningRockId = rock.id;
      if (st.onboarding) st.onboarding._miningRockId = rock.id;
    }
    return rock;
  },

  _beginTrainerFlyby() {
    const trainer = this._trainingActor() || this._spawnTrainer('marker');
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!trainer || !player || !player.pos) return;
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const rightX = -Math.sin(heading);
    const rightZ = Math.cos(heading);
    trainer.pos.x = player.pos.x + Math.cos(heading) * 138 + rightX * TRAINER_FLYBY_OFFSET_WU;
    trainer.pos.z = player.pos.z + Math.sin(heading) * 138 + rightZ * TRAINER_FLYBY_OFFSET_WU;
    trainer.vel.x = -Math.cos(heading) * TRAINER_FLYBY_SPEED_WU;
    trainer.vel.z = -Math.sin(heading) * TRAINER_FLYBY_SPEED_WU;
    trainer.prevPos.copy(trainer.pos);
  },

  _trainingActor() {
    if (this._trainerId == null || !this.state.entities) return null;
    const actor = this.state.entities.get(this._trainerId);
    return actor && actor.alive !== false && isTrainingActor(actor) ? actor : null;
  },

  _removeTrainingActors() {
    if (this._trainerId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._trainerId);
    }
    const player = this.state && this.state.player;
    if (player && player.targetId === this._trainerId) player.targetId = null;
    this._trainerId = null;
    for (const id of [this._derelictId, this._miningRockId]) {
      if (id != null && this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
    }
    this._derelictId = null;
    this._miningRockId = null;
    if (this.state && this.state.onboarding) {
      this.state.onboarding._trainerId = null;
      this.state.onboarding._miningRockId = null;
    }
  },

  // B5: surface three side-by-side offers (HAUL/BOUNTY/SURVEY). The mission board generates them;
  // we just ensure the docked station's board exists and tag the three loop types for the UI.
  _openChoice() {
    const st = this.state;
    const stationId = st.ui && st.ui.dockedStationId;
    if (!stationId) return;
    const missions = this.registry && this.registry.get && this.registry.get('missions');
    if (!missions || typeof missions.ensureBoard !== 'function') return;
    const board = missions.ensureBoard(stationId);
    if (!board || !Array.isArray(board.slots)) return;
    // Tag one offer per loop type so the UI can present them side-by-side. The recommendation engine
    // already surfaces exactly one; the choice beat shows the spread of all three loops instead.
    const st_ob = st.onboarding;
    if (st_ob) st_ob.choiceOfferTypes = ['bulk_trade', 'bounty_hunt', 'recon_scan'];
  },

  _setObjectiveWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob || !ob.active || ob.finished || !st.nav) return;
    const beat = BEATS[ob.currentBeat];
    const existing = st.nav.waypoint;
    if (existing && !existing.onboarding && !force) return;
    // Only the current physical lesson owns a waypoint; the marker identity stays beat-stable.
    let target = null;
    if (beat && (beat.key === 'thrust' || beat.key === 'brake')) target = this._findBeacon();
    else if (beat && (beat.key === 'marker' || beat.key === 'focus'
      || beat.key === 'burst' || beat.key === 'disengage')) {
      const trainer = this._trainingActor();
      if (trainer) target = { pos: trainer.pos, label: trainer.name || 'SCN Flight Trainer' };
    }
    else if (beat && beat.key === 'tether') {
      const derelict = this._derelictId != null && st.entities && st.entities.get(this._derelictId);
      if (derelict && derelict.alive !== false) target = { pos: derelict.pos, label: 'Training Derelict' };
    }
    else if (beat && beat.key === 'seam') {
      const rock = this._miningRockId != null && st.entities && st.entities.get(this._miningRockId);
      if (rock && rock.alive !== false) target = { pos: rock.pos, label: 'Training Seam' };
    }
    else if (beat && beat.key === 'dock') target = this._findHelios();
    if (!target || !target.pos) {
      if (existing && existing.onboarding) st.nav.waypoint = null;
      return;
    }
    // HUD mission tracker reads wp.reason || wp.label as the sole persistent actionable line
    // (hud.js Tutorial Objective branch). Prefer the beat verb in reason; keep short nav label.
    st.nav.waypoint = buildOnboardingObjectiveWaypoint({
      ...beat,
      line: ob.beatAction || beat.line,
    }, target);
  },

  _clearObjectiveWaypoint() {
    const nav = this.state && this.state.nav;
    if (nav && nav.waypoint && nav.waypoint.onboarding) nav.waypoint = null;
  },

  // Find the beacon entity (B0/B1 waypoint target). Falls back to the nearest asteroid if no beacon
  // type exists in the live scene (the 47a opening spawns a kessler_handoff_beacon).
  _findBeacon() {
    const list = (this.state.entityList || []);
    let beacon = null;
    for (const e of list) {
      if (!e || !e.alive || !e.pos) continue;
      if (e.type === 'beacon') { beacon = e; break; }
    }
    if (beacon) return { pos: beacon.pos, label: 'Beacon' };
    // Fallback: nearest non-respawning asteroid (the "mass signal").
    const p = this.state.entities.get(this.state.playerId);
    if (!p) return null;
    let best = null, bestD = Infinity;
    for (const e of list) {
      if (!e || !e.alive || e.type !== 'asteroid' || (e.data && e.data.respawnAt != null)) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? { pos: best.pos, label: 'Beacon' } : null;
  },

  _findHelios() {
    const list = (this.state.entityIndex && this.state.entityIndex.stations) || this.state.entityList || [];
    for (const e of list) {
      if (!e || !e.alive || e.type !== 'station' || (e.data && e.data.isGate)) continue;
      if (e.data && e.data.stationId === 'station_helios') {
        const name = e.data.name || e.data.stationName || 'HELIOS';
        return { pos: e.pos, label: name };
      }
    }
    // Fallback: nearest station.
    const p = this.state.entities.get(this.state.playerId);
    if (!p) return null;
    let best = null, bestD = Infinity;
    for (const e of list) {
      if (!e || !e.alive || e.type !== 'station' || (e.data && e.data.isGate)) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? { pos: best.pos, label: 'Station' } : null;
  },

  // ---- DOM ------------------------------------------------------------------------------------
  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${PANEL_ID} { position:absolute; left:16px; top:150px; width:306px; z-index:60; pointer-events:none;
      font-family:var(--font, "Segoe UI", system-ui, sans-serif); }
    /* Chromeless objective card — glowing left-edge marker, hard text-shadow, no panel. */
    #${PANEL_ID} .sf-ob-card { padding:6px 0 6px 12px;
      border-left:2px solid var(--accent, #39d0ff); box-shadow:-1px 0 8px -2px rgba(57,208,255,.4); }
    #${PANEL_ID} .sf-ob-kicker { font-family:var(--mono,monospace); font-size:10px; letter-spacing:.22em;
      text-transform:uppercase; color:var(--accent,#39d0ff); margin-bottom:5px; display:flex; justify-content:space-between;
      text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-title { font-size:14px; color:#fff; font-weight:600; margin-bottom:5px; text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-hint { font-size:12px; line-height:1.45; color:var(--text-secondary,#84a0c8); text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-flavor { font-size:11.5px; line-height:1.45; color:var(--ink-mute,#6b7d99);
      font-style:italic; margin-top:7px; border-top:1px dashed rgba(132,160,200,.18); padding-top:6px; text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-progress { margin-top:7px; font-family:var(--mono,monospace); font-size:11px; color:var(--accent-2,#7af7d0); }
    #${PANEL_ID} .sf-ob-steps { display:flex; gap:5px; margin-top:9px; }
    #${PANEL_ID} .sf-ob-dot { flex:1; height:3px; border-radius:2px; background:rgba(132,160,200,.25); }
    #${PANEL_ID} .sf-ob-dot.done { background:var(--accent-2,#7af7d0); box-shadow:0 0 6px rgba(122,247,208,.5); }
    #${PANEL_ID} .sf-ob-dot.curr { background:var(--accent,#39d0ff); box-shadow:0 0 6px rgba(57,208,255,.6); }
    `;
    document.head.appendChild(s);
  },

  _buildPanel() {
    if (this._panel) this._panel.remove();
    const root = document.getElementById('ui-root') || document.body;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Objective tracker');

    const card = document.createElement('div');
    card.className = 'sf-ob-card';

    const kicker = document.createElement('div');
    kicker.className = 'sf-ob-kicker';
    const kickerLabel = document.createElement('span');
    kickerLabel.textContent = 'Objective';
    const count = document.createElement('span');
    count.className = 'sf-ob-count';
    kicker.appendChild(kickerLabel);
    kicker.appendChild(count);

    const body = document.createElement('div');
    body.className = 'sf-ob-body';
    const title = document.createElement('div');
    title.className = 'sf-ob-title';
    body.appendChild(title);

    const steps = document.createElement('div');
    steps.className = 'sf-ob-steps';
    steps.setAttribute('aria-hidden', 'true');

    card.appendChild(kicker);
    card.appendChild(body);
    card.appendChild(steps);
    el.appendChild(card);
    root.appendChild(el);

    this._panel = el;
    this._kickerLabelEl = kickerLabel;
    this._countEl = count;
    this._bodyEl = body;
    this._titleEl = title;
    this._stepsEl = steps;
    this._syncModalAccessibility();
  },

  // Render the current beat into the objective panel.
  // The HUD mission tracker owns the sole persistent actionable verb (via nav.waypoint.reason).
  // This panel yields whenever the HUD owns a spatial lesson; tutorial verbs speak once through the
  // voice arbiter and never become a second persistent command or assistive live region.
  _refreshBeatPanel() {
    if (!this._panel || this._storyMode) return;
    const ob = this.state.onboarding; if (!ob) return;
    const beat = BEATS[ob.currentBeat];
    const idx = ob.currentBeat < 0 ? -1 : ob.currentBeat;
    // Exactly one persistent command surface: spatial lessons use the HUD waypoint; non-spatial
    // lessons (thrust/brake/heat) use this compact panel title.
    const demoteObjectiveCopy = !!(this.state.nav && this.state.nav.waypoint
      && this.state.nav.waypoint.onboarding);

    if (this._kickerLabelEl) {
      const kicker = 'Status';
      if (this._kickerLabelEl.textContent !== kicker) this._kickerLabelEl.textContent = kicker;
    }

    if (this._countEl) {
      const countText = (idx >= 0 ? (idx + 1) : 0) + ' / ' + BEATS.length;
      if (this._countEl.textContent !== countText) this._countEl.textContent = countText;
      const stepLabel = 'step ' + (idx >= 0 ? (idx + 1) : 0) + ' of ' + BEATS.length;
      if (this._countEl.getAttribute('aria-label') !== stepLabel) {
        this._countEl.setAttribute('aria-label', stepLabel);
      }
    }

    if (this._titleEl) {
      const line = beat ? (beat.line || '') : '';
      // Keep textContent in sync for beat tests while hiding the duplicate verb from the visual and
      // assistive trees. The one transient tutorial line already routes through _sayTutorial().
      if (this._titleEl.textContent !== line) this._titleEl.textContent = line;
      if (demoteObjectiveCopy) {
        if (this._titleEl.style.display !== 'none') this._titleEl.style.display = 'none';
        if (this._titleEl.getAttribute('aria-hidden') !== 'true') {
          this._titleEl.setAttribute('aria-hidden', 'true');
        }
      } else {
        if (this._titleEl.style.display === 'none') this._titleEl.style.display = '';
        if (this._titleEl.hasAttribute('aria-hidden')) this._titleEl.removeAttribute('aria-hidden');
      }
    }

    // B2 shows 47-A sample collection progress.
    if (beat && beat.key === 'seam') {
      if (!this._progressEl) {
        this._progressEl = document.createElement('div');
        this._progressEl.className = 'sf-ob-progress';
        this._bodyEl.appendChild(this._progressEl);
      }
      const progText = 'SAMPLE: ' + Math.min(ob.oreCollected || 0, SEAM_ORE_TARGET) + ' / ' + SEAM_ORE_TARGET;
      if (this._progressEl.textContent !== progText) this._progressEl.textContent = progText;
    } else if (this._progressEl) {
      this._progressEl.remove();
      this._progressEl = null;
    }

    if (this._stepsEl) {
      this._stepsEl.innerHTML = '';
      BEATS.forEach((b, i) => {
        const d = document.createElement('div');
        const isDone = ob.beatDoneAt[b.key] != null;
        d.className = 'sf-ob-dot' + (isDone ? ' done' : (i === idx ? ' curr' : ''));
        this._stepsEl.appendChild(d);
      });
    }
  },
};

function onboardingRandom(state) {
  if (state && typeof state.rng === 'function') return state.rng();
  const onboardingState = state && state.onboarding && typeof state.onboarding === 'object'
    ? state.onboarding
    : {};
  return drawSeeded(onboardingState, '_rngSeed', hash32(state && state.meta && state.meta.seed, 'onboarding'));
}

function masslineThrowHint(state) {
  const mode = state && state.settings && state.settings.gameplay
    && state.settings.gameplay.masslineReleaseAssist;
  if (mode === 'snap') return 'Tap RIGHT MOUSE near the white diamond to snap the release.';
  if (mode === 'off') return 'Tap RIGHT MOUSE to release on the current vector.';
  return 'Hold RIGHT MOUSE; release waits for the white diamond.';
}

function isExpressHitchTarget(entity) {
  const data = entity && entity.data;
  const ai = data && data.ai;
  return !!(entity && entity.alive !== false
    && entity.team === 2
    && data && data.trafficRole === 'express'
    && data.itinerary && data.itinerary.hitchable === true
    && ai && ai.passive === true);
}
