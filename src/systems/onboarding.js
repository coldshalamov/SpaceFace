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
import { successfulPickupAmount } from '../core/pickupAcceptance.js';
import { Masks } from '../core/entity.js';
import { firstUseLine, resolveFirstUseEntityId } from '../ui/hudAttention.js';
import { makeEnemySpawnSpec } from './combat.js';
import { ONBOARDING_CHOICE_SOURCE } from './missions.js';
import { massline2Flag } from '../data/featureFlags.js';
import {
  FIRST_TRADE_CONTRACT_DEST_STATION_ID,
  FIRST_TRADE_CONTRACT_SOURCE,
} from '../data/economyContractTemplates.js';
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
import {
  ARCADE_VERB_BEATS,
  ARCADE_VERB_BY_ID,
  ARCADE_VERB_ORDER,
  createArcadeVerbProgress,
} from '../data/onboardingVerbs.js';

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
const VERB_SHOVE_WEAPON_ID = 'wpn_concussion_cannon_m';
const VERB_INHALE_PICKUPS = 4;
const VERB_INHALE_REQUIRED = 3;
const VERB_SWING_RELEASE_SPEED = 28;
const VERB_SWING_TANGENT_RATIO = 0.55;
const VERB_SWING_RING_RADIUS = 34;
const VERB_WELL_CLOUD_REQUIRED = 3;

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
    done: 'recommendedCompleted',
  },
  { // B5 CHOICE (~12:00) — three side-by-side offers; accept any → ends tutorial
    key: 'choice',
    line: 'Pick the work that fits.',
    done: 'mission:accepted',
  },
];
// Beat index for the choice beat (B5) — accepting its offer ends tutorial mode permanently.
const CHOICE_BEAT_INDEX = BEATS.length - 1;

// Cold-open premise (spec2/03 B0 "no modal"): the tutorial voice frames the 47-A contract at the
// opening beat rather than via a modal. This carries the 47-A intent that the intro card used to own.
const COLD_OPEN_PREMISE = 'Contract 47-A: the manifest says one mass — your instruments say another.';
// Surfaced when the firing lesson first hands the player a trigger, so the starter weapon is named,
// not just felt. Pulled from NEW_GAME's fitted starter loadout (see check:phase0-slice-contract).
const STARTER_WEAPON_HINT = 'The Kestrel is armed: fire the Pulse Laser S, then let the heat clear.';

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
    bus.on('mission:accepted', (p) => this._onMissionAccepted(p || {}));
    bus.on('mission:completed', (p) => this._onMissionCompleted(p || {}));

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

    // Plan 55 signature-verb rail. Every completion listens to the production event that owns the
    // action; objective copy and spawned practice bodies can never mark a metric by themselves.
    bus.on('projectile:hit', (p) => this._onArcadeProjectileHit(p || {}));
    bus.on('physics:impact', (p) => this._onArcadePhysicsImpact(p || {}));
    bus.on('pickup:collected', (p) => this._onArcadePickupCollected(p || {}));
    bus.on('tether:latched', (p) => this._onArcadeTetherLatched(p || {}));
    bus.on('tether:released', (p) => this._onArcadeTetherReleased(p || {}));
    bus.on('fields:deployed', (p) => this._onArcadeFieldDeployed(p || {}));
    bus.on('entity:killed', (p) => this._onArcadeEntityKilled(p || {}));
    bus.on('planet:registered', () => this._tryEnterArcadeVerbBeat());
    bus.on('planet:plungeStage', (p) => this._onArcadePlungeStage(p || {}));
    bus.on('dock:undocked', () => this._tryEnterArcadeVerbBeat());
    bus.on('story:beatAdvanced', () => this._tryEnterArcadeVerbBeat());

    // ── Contextual first-time hints (fire once per hint, persist across saves) ───────────────
    // These are independent of the tutorial chain: they fire for all players whose
    // settings.gameplay.tutorialHints is not explicitly false, including players who
    // skipped the staged tutorial.

    // First enemy encounter: triggered when the player first takes damage from a hostile.
    bus.on('combat:damage', (p) => {
      if (!p) return;
      const hitPlayer = !!(p.isPlayer || (this.state && p.targetId === this.state.playerId));
      if (!hitPlayer) return;
      this._showHint('firstCombat', firstUseLine('firstCombat'), {
        ...p,
        entityId: p.attackerId != null ? p.attackerId : p.sourceId,
      });
    });

    // First shield break: triggered when shields drop to zero.
    bus.on('combat:damage', (p) => {
      if (!p || !p.isPlayer || !p.brokeShield) return;
      this._showHint('firstShieldDrop', firstUseLine('firstShieldDrop'), {
        ...p,
        entityId: p.attackerId != null ? p.attackerId : p.sourceId,
      });
    });

    // First station approach: enriches the existing dock prompt with what stations offer.
    bus.on('dock:range', (payload) => {
      this._dockControlInRange = !!(payload && payload.inRange);
      if (!payload || !payload.inRange) return;
      this._showHint('firstStation', firstUseLine('firstStation'), payload);
    });

    // First jump gate approach: teach the player how gates work.
    bus.on('gate:range', (payload) => {
      this._gateControlInRange = !!(payload && payload.inRange);
      if (!payload || !payload.inRange) return;
      this._showHint('firstGate', firstUseLine('firstGate'), payload);
    });

    // First cargo full: teach the player to sell.
    bus.on('cargo:full', (p) => {
      this._showHint('firstCargoFull', firstUseLine('firstCargoFull'), p);
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
    bus.on('dock:docked', (p) => {
      this._showHint('firstHub', firstUseLine('firstHub'), p);
    });

    // Deep-drill (ant-farm mining): the first time the player activates a drill on an asteroid.
    bus.on('drill:start', (p) => {
      this._showHint('firstDrill', firstUseLine('firstDrill'), p);
    });

    // Outfitting: the first time the player equips OR buys a module at a station.
    bus.on('ui:fitModule', (p) => {
      this._showHint('firstOutfit', firstUseLine('firstOutfit'), p);
    });
    bus.on('ui:buyModule', (p) => {
      this._showHint('firstOutfit', firstUseLine('firstOutfit'), p);
    });

    // Tech tree: the first time the player researches a node.
    bus.on('tech:researched', (p) => {
      this._showHint('firstTech', firstUseLine('firstTech'), p);
    });

    // Automation: the first time the player deploys a drone.
    bus.on('asset:deployed', (p) => {
      if (!p || p.kind !== 'drone') return;
      this._showHint('firstAutomation', firstUseLine('firstAutomation'), p);
    });

    // Claims/bases: the first time the player claims a body.
    bus.on('claim:claimed', (p) => {
      this._showHint('firstClaim', firstUseLine('firstClaim'), p);
    });

    // Crafting: the first time the player queues a craft job (refine/assemble/augment).
    bus.on('craft:queueChanged', (p) => {
      this._showHint('firstCraft', firstUseLine('firstCraft'), p);
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
      this._showHint('masslineThrow', firstUseLine('masslineThrow'), payload);
    });
    bus.on('tether:latched', (payload) => {
      if (!massline2Flag('hitchhiking') || !payload || payload.targetId == null) return;
      const target = this.state.entities && this.state.entities.get(payload.targetId);
      if (!isExpressHitchTarget(target)) return;
      this._showHint('masslineHitchhiking', firstUseLine('masslineHitchhiking'), payload);
    });
    bus.on('massline:selfSling', (p) => {
      if (!massline2Flag('throw')) return;
      this._showHint('masslineSelfSling', firstUseLine('masslineSelfSling'), p);
    });
    bus.on('cargo:jettisoned', (p) => {
      if (!massline2Flag('jettisonImpulse')) return;
      this._showHint('masslineJettisonImpulse', firstUseLine('masslineJettisonImpulse'), p);
    });
    bus.on('bulletTime:start', (p) => {
      if (!massline2Flag('bulletTime')) return;
      this._showHint('masslineBulletTime', firstUseLine('masslineBulletTime'), p);
    });
    bus.on('cloak:engaged', (p) => {
      if (!massline2Flag('cloak')) return;
      this._showHint('masslineCloak', firstUseLine('masslineCloak'), p);
    });
    bus.on('charge:aftDropped', (p) => {
      if (!massline2Flag('bombPropulsion')) return;
      this._showHint('bombPropulsion', firstUseLine('bombPropulsion'), p);
    });

    this._lastControlMode = null;
  },

  // Show a one-time contextual hint via the toast system. The hint key corresponds to a flag in
  // state.player.hints. If the flag is already true (hint was shown before, even in a prior save),
  // this is a no-op. Respects the tutorialHints setting.
  _showHint(key, text, payload) {
    const st = this.state;
    if (st.settings && st.settings.gameplay && st.settings.gameplay.tutorialHints === false) return;
    // The staged rail is already the tutorial. Contextual walls wait until it finishes so a
    // combat hit, dock range, or cargo edge cannot queue a second lesson behind the current verb.
    if (this._tutorialRailOwnsVoice()) return;
    if (!st.player.hints) st.player.hints = {};
    if (st.player.hints[key]) return;
    st.player.hints[key] = true;
    const entityId = resolveFirstUseEntityId(st, payload || {});
    this.bus.emit('hud:firstUse', { verbId: key, text, entityId });
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
      arcadeVerbs: createArcadeVerbProgress({
        skipped: !!(st.meta && st.meta.skipArcadeVerbOnboarding),
      }),
    };
    if (st.meta) delete st.meta.skipArcadeVerbOnboarding;
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
    this._clearArcadeVerbWorld({ restoreWeapon: true, restoreWaypoint: false });
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
  _sayTutorial(text, { visual = true } = {}) {
    if (!text) return;
    this._lastTextAtS = this.state.simTime || 0;
    // Record for the one-voice audit: { atS, text } appended to a session log on state.onboarding.
    const ob = this.state.onboarding;
    if (ob) {
      if (!Array.isArray(ob.tutorialLog)) ob.tutorialLog = [];
      ob.tutorialLog.push({ atS: this._lastTextAtS, text });
    }
    this.bus.emit('tutorial:say', { text, atS: this._lastTextAtS });
    // A matching onboarding waypoint already exposes this command through the persistent,
    // accessible HUD objective. Keep the canonical tutorial event (audio/audit/story cadence) but
    // do not repeat the exact imperative on the transient top-center visual floor.
    if (!visual) return;
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
    const arcadeVerbs = ob.arcadeVerbs;
    // Shove → inhale → swing temporarily owns the one-voice floor after the flyby lesson. Swing is
    // the upgraded derelict beat, so the legacy latch/winch/cut row is advanced only after it lands.
    if (arcadeVerbs && arcadeVerbs.active && arcadeVerbs.currentIndex < 3) return;
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
    this._enterBeat(beat);
    const waypoint = this.state.nav && this.state.nav.waypoint;
    const persistentObjectiveOwnsLine = !!(waypoint && waypoint.onboarding
      && String(waypoint.reason || '').trim() === String(beat.line || '').trim());
    this._sayTutorial(beat.line, { visual: !persistentObjectiveOwnsLine });
    this._refreshBeatPanel();
  },

  // Spawn only inert, invulnerable training content during the flight drill.
  _enterBeat(beat) {
    if (!beat) return;
    if (beat.key === 'thrust') {
      this._setObjectiveWaypoint(true);
      // Cold-open: frame the 47-A contract the instant the tutorial begins (replaces the old intro
      // modal's headline intent, per spec2/03 B0 "no modal"). Shares the beat voice channel.
      this._sayTutorial(COLD_OPEN_PREMISE, { visual: false });
    }
    else if (beat.key === 'brake') this._setObjectiveWaypoint(true);
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
      // Name the starter weapon at the firing lesson so the loadout is surfaced, not just felt.
      this._sayTutorial(STARTER_WEAPON_HINT, { visual: false });
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

  _onMissionAccepted(payload) {
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat) return;
    if (beat.key === 'dock' && payload.source === FIRST_TRADE_CONTRACT_SOURCE) {
      ob.recommendedMissionId = payload.missionId || null;
      ob.beatAction = 'Complete the tracked delivery.';
      this._clearObjectiveWaypoint();
      const missions = this.registry && this.registry.get && this.registry.get('missions');
      if (missions && typeof missions.releaseOnboardingNavigation === 'function') {
        missions.releaseOnboardingNavigation(payload.missionId);
      }
      this._refreshBeatPanel();
      return;
    }
    this._onBeatEvent('mission:accepted', payload);
  },

  _onMissionCompleted(payload) {
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat || beat.key !== 'dock') return;
    if (payload.source !== FIRST_TRADE_CONTRACT_SOURCE) return;
    if (ob.recommendedMissionId && payload.missionId !== ob.recommendedMissionId) return;
    ob.choiceStationId = this.state.ui && this.state.ui.dockedStationId
      || FIRST_TRADE_CONTRACT_DEST_STATION_ID;
    this._onBeatEvent('recommended:completed', payload);
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
      const choiceIds = Array.isArray(ob.choiceOfferIds) ? ob.choiceOfferIds : [];
      resolved = payload && payload.source === ONBOARDING_CHOICE_SOURCE
        && choiceIds.includes(payload.sourceOfferId);
    } else if (done === 'recommendedCompleted' && eventName === 'recommended:completed') {
      // B4 stays live through the authored Helios delivery. Merely selling the training ore or
      // accepting an unrelated board row cannot skip the first complete contract loop.
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
    if (beat.key === 'focus') this._armArcadeVerbTraining();
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
    const accepted = successfulPickupAmount(p);
    if (accepted <= 0) return;
    ob.oreCollected = (ob.oreCollected || 0) + accepted;
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
    this._armArcadeVerbTraining();
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
    // Both pausing modals and live overlays hide the onboarding panel (CSS), so both count here.
    const modalOpen = !!(document.body && (document.body.classList.contains('ui-modal-open')
      || document.body.classList.contains('ui-live-screen')));
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

    // ── First-hour pacing (only while active) ────────────────────────────────────────────
    const ob = state.onboarding;
    try { this._updateArcadeVerbTraining(dt, state); } catch (_) { /* non-blocking tutorial */ }
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

  // B5: surface three side-by-side offers (HAUL/BOUNTY/SURVEY) through the ordinary mission
  // authority. No parallel tutorial jobs: these offers accept, track, pay, and receipt normally.
  _openChoice() {
    const st = this.state;
    const ob = st.onboarding;
    const stationId = ob && ob.choiceStationId || st.ui && st.ui.dockedStationId;
    if (!stationId) return;
    const missions = this.registry && this.registry.get && this.registry.get('missions');
    if (!missions || typeof missions.ensureOnboardingChoiceOffers !== 'function') return;
    missions.ensureOnboardingChoiceOffers(stationId);
  },

  _setObjectiveWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob || !ob.active || ob.finished || !st.nav) return;
    const beat = BEATS[ob.currentBeat];
    // The B4 flight lesson ends at acceptance. Keep the tutorial state alive for completion/B5,
    // but never reclaim the real delivery's route with the old Helios docking marker.
    if (beat && beat.key === 'dock' && ob.recommendedMissionId) {
      if (st.nav.waypoint && st.nav.waypoint.onboarding) st.nav.waypoint = null;
      return;
    }
    const existing = st.nav.waypoint;
    // While teaching, reclaim mission/story claims so the opening marker stays onboarding-owned.
    // Leave player-set local/trade/autopilot courses alone unless force-stamping a lesson target.
    if (existing && !existing.onboarding && !force) {
      const foreignKind = existing.kind;
      if (foreignKind !== 'mission' && foreignKind !== 'story') return;
    }
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

  // ---- Plan 55: signature physics verbs ------------------------------------------------------

  _arcadeVerbProgress() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.arcadeVerbs || null;
  },

  _currentArcadeVerb() {
    const progress = this._arcadeVerbProgress();
    if (!progress || !progress.active || progress.complete) return null;
    return ARCADE_VERB_BEATS[progress.currentIndex] || null;
  },

  _armArcadeVerbTraining() {
    const progress = this._arcadeVerbProgress();
    if (!progress || progress.skipped || progress.complete || progress.active) return false;
    progress.active = true;
    progress.waitingForMainRail = false;
    progress.entered = false;
    this._tryEnterArcadeVerbBeat();
    return true;
  },

  _tryEnterArcadeVerbBeat() {
    const progress = this._arcadeVerbProgress();
    const beat = this._currentArcadeVerb();
    if (!progress || !beat || progress.entered || this.state.mode !== 'flight') return false;
    if (beat.id === 'well' && Number(this.state.story && this.state.story.beatIndex || 0) < 2) return false;
    if (beat.id === 'burn_line' && !(this.state.planet && this.state.planet.active)) return false;
    progress.entered = true;
    progress.runtime = {};
    if (beat.id === 'shove') this._spawnShoveLesson();
    else if (beat.id === 'inhale') this._spawnInhaleLesson();
    else if (beat.id === 'swing') this._spawnSwingLesson();
    else if (beat.id === 'well') this._spawnWellLesson();
    else if (beat.id === 'burn_line') this._spawnBurnLineLesson();
    this._sayTutorial(beat.objective);
    return true;
  },

  _completeArcadeVerb(id, detail = {}) {
    const progress = this._arcadeVerbProgress();
    const beat = this._currentArcadeVerb();
    if (!progress || !beat || beat.id !== id || progress.metrics[id] === true) return false;
    progress.metrics[id] = true;
    progress.completedOrder.push(id);
    this.bus.emit('tutorial:verbCompleted', {
      verbId: id,
      metric: true,
      order: progress.completedOrder.length,
      source: detail.source || null,
      detail,
    });
    this._clearArcadeVerbWorld({ restoreWeapon: true, restoreWaypoint: false });
    progress.currentIndex += 1;
    progress.entered = false;
    progress.runtime = {};
    const onboardingState = this.state && this.state.onboarding;
    if (id === 'swing' && onboardingState && onboardingState.finished !== true) {
      // The signature swing replaces the older tether trio rather than making a new pilot repeat
      // it. Preserve the main rail's silence gate, then let Burst remain the next ordinary lesson.
      const tetherIndex = BEATS.findIndex((candidate) => candidate.key === 'tether');
      onboardingState.currentBeat = tetherIndex;
      if (!onboardingState.beatDoneAt || typeof onboardingState.beatDoneAt !== 'object') onboardingState.beatDoneAt = {};
      onboardingState.beatDoneAt.tether = this.state.simTime || 0;
      onboardingState.beatAction = 'Swing logged.';
      progress.active = false;
      progress.waitingForMainRail = true;
      this._restoreArcadeVerbWaypoint();
      this._refreshBeatPanel();
      return true;
    }
    if (progress.currentIndex >= ARCADE_VERB_ORDER.length) {
      progress.complete = true;
      progress.active = false;
      this._restoreArcadeVerbWaypoint();
      this.bus.emit('tutorial:verbsFinished', {
        metrics: { ...progress.metrics },
        completedOrder: progress.completedOrder.slice(),
      });
      this.bus.emit('toast', {
        text: 'Signature drills logged. The Codex keeps the five verb references.',
        kind: 'success',
        ttl: 4,
      });
      return true;
    }
    this._tryEnterArcadeVerbBeat();
    return true;
  },

  _updateArcadeVerbTraining(_dt, state) {
    const progress = this._arcadeVerbProgress();
    if (!progress || !progress.active || progress.complete) return;
    this._tryEnterArcadeVerbBeat();
    const beat = this._currentArcadeVerb();
    if (!beat || !progress.entered) return;
    const rt = progress.runtime || {};
    if (beat.id === 'swing' && rt.releaseQualified === true) {
      const player = state.entities && state.entities.get(state.playerId);
      const ring = rt.ringId != null && state.entities && state.entities.get(rt.ringId);
      if (player && ring && player.pos && ring.pos
          && Math.hypot(player.pos.x - ring.pos.x, player.pos.z - ring.pos.z) <= VERB_SWING_RING_RADIUS) {
        this._completeArcadeVerb('swing', {
          source: 'tether:released+checkpoint',
          releaseSpeed: rt.releaseSpeed,
          tangentRatio: rt.tangentRatio,
        });
      }
    } else if (beat.id === 'well' && rt.fieldId) {
      const active = state.fields && Array.isArray(state.fields.active)
        ? state.fields.active.find((field) => field && field.id === rt.fieldId)
        : null;
      if (active && active.engaged === true) rt.fieldAffected = true;
      if (state.fields && state.fields.telemetry && state.fields.telemetry.affected > 0) {
        rt.fieldAffected = true;
      }
      if (rt.fieldAffected === true && rt.wellKill === true
          && Array.isArray(rt.collectedIds) && rt.collectedIds.length >= VERB_WELL_CLOUD_REQUIRED) {
        this._completeArcadeVerb('well', {
          source: 'fields:deployed+entity:killed+pickup:collected',
          fieldAffected: true,
          collected: rt.collectedIds.length,
        });
      }
    }
  },

  _spawnShoveLesson() {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    const player = state.entities && state.entities.get(state.playerId);
    if (!rt || !player || !player.pos || typeof this.helpers.spawnEntity !== 'function') return;
    const angle = Number.isFinite(player.rot) ? player.rot : 0;
    const fx = Math.cos(angle), fz = Math.sin(angle);
    const rock = this.helpers.spawnEntity({
      type: 'asteroid',
      pos: { x: player.pos.x + fx * 170, z: player.pos.z + fz * 170 },
      vel: { x: 0, z: 0 },
      radius: 22,
      mass: 5000,
      hull: 5000,
      hullMax: 5000,
      collides: true,
      physicsBody: { dynamic: false, ccd: false, material: 'asteroid', mass: 5000, radius: 22 },
      data: { onboarding: true, onboardingVerb: 'shove', kind: 'training_rock' },
    });
    const spec = makeEnemySpawnSpec('reaver_pirate', 1, {
      x: player.pos.x + fx * 105,
      z: player.pos.z + fz * 105,
    }, { startedTick: state.tick, motive: 'training', engagementTrigger: 'onboarding_verb' });
    spec.type = 'drone';
    spec.name = 'Crippled Impact Drone';
    spec.hull = spec.hullMax = 34;
    spec.armorHp = spec.armorMax = 0;
    spec.armorFlat = 0;
    spec.shield = spec.shieldMax = 0;
    spec.mass = 16;
    spec.vel = { x: 0, z: 0 };
    spec.data.weapons = [];
    spec.data.onboarding = true;
    spec.data.onboardingVerb = 'shove';
    spec.data.ai = { ...(spec.data.ai || {}), passive: true, roe: 'hold_fire', motive: 'training' };
    spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: angle };
    const drone = this.helpers.spawnEntity(spec);
    if (!rock || !drone) return;
    rt.rockId = rock.id;
    rt.droneId = drone.id;
    rt.ids = [rock.id, drone.id];
    state.player.targetId = drone.id;
    this._installArcadeConcussion(player);
    this._setArcadeVerbWaypoint(drone, ARCADE_VERB_BY_ID.get('shove').objective);
  },

  _installArcadeConcussion(player) {
    if (!player || !player.data) return false;
    const weapons = Array.isArray(player.data.weapons) ? player.data.weapons : (player.data.weapons = []);
    if (weapons.some((weapon) => weapon && weapon.defId === VERB_SHOVE_WEAPON_ID)) return true;
    weapons.push({
      slotIndex: 55,
      defId: VERB_SHOVE_WEAPON_ID,
      name: 'Concussion Cannon M — Training Round',
      facing: 'front',
      facingAngle: 0,
      gimbalArc: Math.PI / 3,
      _cooldown: 0,
      _heat: 0,
      onboardingVerbGift: true,
    });
    return true;
  },

  _onArcadeProjectileHit(payload) {
    const beat = this._currentArcadeVerb();
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    if (!beat || beat.id !== 'shove' || !rt) return;
    if (payload.ownerId !== this.state.playerId || payload.targetId !== rt.droneId
        || payload.weaponId !== VERB_SHOVE_WEAPON_ID) return;
    rt.concussionHit = true;
    rt.concussionHitTick = this.state.tick | 0;
  },

  _onArcadePhysicsImpact(payload) {
    const beat = this._currentArcadeVerb();
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    if (!beat || beat.id !== 'shove' || !rt || rt.concussionHit !== true) return;
    const exactPair = (payload.aId === rt.droneId && payload.bId === rt.rockId)
      || (payload.aId === rt.rockId && payload.bId === rt.droneId);
    if (!exactPair || !(Number(payload.impulse) > 1)) return;
    rt.impactPos = payload.pos && { x: payload.pos.x, z: payload.pos.z };
    this._completeArcadeVerb('shove', {
      source: 'projectile:hit+physics:impact',
      weaponId: VERB_SHOVE_WEAPON_ID,
      impulse: Number(payload.impulse),
    });
  },

  _spawnInhaleLesson() {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    const player = state.entities && state.entities.get(state.playerId);
    if (!rt || !player || !player.pos || typeof this.helpers.spawnEntity !== 'function') return;
    const angle = Number.isFinite(player.rot) ? player.rot : 0;
    const center = {
      x: player.pos.x + Math.cos(angle) * 72,
      z: player.pos.z + Math.sin(angle) * 72,
    };
    rt.pickupIds = [];
    rt.collectedIds = [];
    for (let i = 0; i < VERB_INHALE_PICKUPS; i++) {
      const a = angle + (i - 1.5) * 0.28;
      const pickup = this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: center.x + Math.cos(a) * 10, z: center.z + Math.sin(a) * 10 },
        vel: { x: Math.cos(a) * 5, z: Math.sin(a) * 5 },
        radius: 2.2,
        data: {
          kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1,
          despawnAt: (state.simTime || 0) + 90,
          onboarding: true, onboardingVerb: 'inhale',
        },
      });
      if (pickup) rt.pickupIds.push(pickup.id);
    }
    this._setArcadeVerbWaypoint({ pos: center, name: 'Drift Cloud' }, ARCADE_VERB_BY_ID.get('inhale').objective);
  },

  _onArcadePickupCollected(payload) {
    const beat = this._currentArcadeVerb();
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    if (!beat || !rt || payload.collectorId !== this.state.playerId
        || successfulPickupAmount(payload) <= 0) return;
    const ids = Array.isArray(rt.pickupIds) ? rt.pickupIds : [];
    if (!ids.includes(payload.pickupId)) return;
    if (!Array.isArray(rt.collectedIds)) rt.collectedIds = [];
    if (!rt.collectedIds.includes(payload.pickupId)) rt.collectedIds.push(payload.pickupId);
    if (beat.id === 'inhale' && rt.collectedIds.length >= VERB_INHALE_REQUIRED) {
      this._completeArcadeVerb('inhale', { source: 'pickup:collected', collected: rt.collectedIds.length });
    } else if (beat.id === 'well' && rt.wellKill === true && rt.fieldAffected === true
        && rt.collectedIds.length >= VERB_WELL_CLOUD_REQUIRED) {
      this._completeArcadeVerb('well', {
        source: 'fields:deployed+entity:killed+pickup:collected',
        fieldAffected: rt.fieldAffected === true,
        collected: rt.collectedIds.length,
      });
    }
  },

  _spawnSwingLesson() {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    const player = state.entities && state.entities.get(state.playerId);
    if (!rt || !player || !player.pos || typeof this.helpers.spawnEntity !== 'function') return;
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const fx = Math.cos(heading), fz = Math.sin(heading);
    const rx = -fz, rz = fx;
    const anchor = this.helpers.spawnEntity({
      type: 'wreck',
      pos: { x: player.pos.x + fx * 92, z: player.pos.z + fz * 92 },
      vel: { x: 0, z: 0 },
      radius: 15,
      mass: 1200,
      hull: 1,
      hullMax: 1,
      data: { parentType: 'ship', loot: [], salvagePool: {}, onboarding: true, onboardingVerb: 'swing', kind: 'derelict' },
    });
    const ring = this.helpers.spawnEntity({
      type: 'beacon',
      pos: { x: player.pos.x + rx * 190, z: player.pos.z + rz * 190 },
      vel: { x: 0, z: 0 },
      radius: VERB_SWING_RING_RADIUS,
      collides: false,
      data: { onboarding: true, onboardingVerb: 'swing', kind: 'checkpoint_ring', name: 'Release Ring' },
    });
    if (!anchor || !ring) return;
    rt.anchorId = anchor.id;
    rt.ringId = ring.id;
    rt.ids = [anchor.id, ring.id];
    state.player.targetId = anchor.id;
    this._setArcadeVerbWaypoint(ring, ARCADE_VERB_BY_ID.get('swing').objective);
  },

  _onArcadeTetherLatched(payload) {
    const beat = this._currentArcadeVerb();
    const rt = this._arcadeVerbProgress() && this._arcadeVerbProgress().runtime;
    if (beat && beat.id === 'swing' && rt && payload.targetId === rt.anchorId) rt.latched = true;
  },

  _onArcadeTetherReleased(payload) {
    const beat = this._currentArcadeVerb();
    const rt = this._arcadeVerbProgress() && this._arcadeVerbProgress().runtime;
    if (!beat || beat.id !== 'swing' || !rt || rt.latched !== true || payload.targetId !== rt.anchorId) return;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    const anchor = this.state.entities && this.state.entities.get(rt.anchorId);
    const ring = this.state.entities && this.state.entities.get(rt.ringId);
    if (!player || !anchor || !ring || !player.pos || !player.vel) return;
    const rx = player.pos.x - anchor.pos.x, rz = player.pos.z - anchor.pos.z;
    const radialLength = Math.hypot(rx, rz);
    const speed = Math.hypot(player.vel.x || 0, player.vel.z || 0);
    const tangentRatio = radialLength > 0 && speed > 0
      ? Math.abs(rx * player.vel.z - rz * player.vel.x) / (radialLength * speed)
      : 0;
    const toRingX = ring.pos.x - player.pos.x, toRingZ = ring.pos.z - player.pos.z;
    const towardRing = speed > 0 && Math.hypot(toRingX, toRingZ) > 0
      ? (toRingX * player.vel.x + toRingZ * player.vel.z) / (Math.hypot(toRingX, toRingZ) * speed)
      : -1;
    if (speed < VERB_SWING_RELEASE_SPEED || tangentRatio < VERB_SWING_TANGENT_RATIO || towardRing <= 0) return;
    rt.releaseQualified = true;
    rt.releaseSpeed = speed;
    rt.tangentRatio = tangentRatio;
  },

  _spawnWellLesson() {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    const player = state.entities && state.entities.get(state.playerId);
    if (!rt || !player || !player.pos || typeof this.helpers.spawnEntity !== 'function') return;
    const heading = Number.isFinite(player.rot) ? player.rot : 0;
    const center = {
      x: player.pos.x + Math.cos(heading) * 150,
      z: player.pos.z + Math.sin(heading) * 150,
    };
    rt.center = center;
    rt.pickupIds = [];
    rt.collectedIds = [];
    const spec = makeEnemySpawnSpec('reaver_pirate', 1, { x: center.x + 34, z: center.z }, {
      startedTick: state.tick,
      motive: 'training',
      engagementTrigger: 'onboarding_verb',
    });
    spec.type = 'drone';
    spec.name = 'Well Practice Mote';
    spec.hull = spec.hullMax = 12;
    spec.armorHp = spec.armorMax = 0;
    spec.armorFlat = 0;
    spec.shield = spec.shieldMax = 0;
    spec.mass = 10;
    spec.vel = { x: 0, z: 0 };
    spec.data.weapons = [];
    spec.data.onboarding = true;
    spec.data.onboardingVerb = 'well';
    spec.data.ai = { ...(spec.data.ai || {}), passive: true, roe: 'hold_fire', motive: 'training' };
    spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: heading };
    const drone = this.helpers.spawnEntity(spec);
    if (drone) {
      rt.droneId = drone.id;
      rt.ids = [drone.id];
    }
    // The standard field tool is already a production action; this authored beat gifts one use by
    // clearing only its transient cooldown, never minting a second inventory or force writer.
    if (state.fields && state.fields.cooldowns) state.fields.cooldowns.well = 0;
    rt.giftedWellCharge = true;
    this._setArcadeVerbWaypoint({ pos: center, name: 'Mote Pack' }, ARCADE_VERB_BY_ID.get('well').objective);
  },

  _onArcadeFieldDeployed(payload) {
    const beat = this._currentArcadeVerb();
    const rt = this._arcadeVerbProgress() && this._arcadeVerbProgress().runtime;
    if (!beat || beat.id !== 'well' || !rt || payload.kind !== 'well' || !payload.center || !rt.center) return;
    const source = payload.sourceId != null && this.state.entities && this.state.entities.get(payload.sourceId);
    if (!source || source.data && source.data.ownerId !== this.state.playerId) return;
    if (Math.hypot(payload.center.x - rt.center.x, payload.center.z - rt.center.z) > 70) return;
    rt.fieldId = payload.fieldId;
  },

  _onArcadeEntityKilled(payload) {
    const beat = this._currentArcadeVerb();
    const rt = this._arcadeVerbProgress() && this._arcadeVerbProgress().runtime;
    if (!beat || beat.id !== 'well' || !rt || payload.id !== rt.droneId
        || payload.killerId !== this.state.playerId || !rt.fieldId) return;
    if (!payload.presentation || !payload.presentation.style
        || payload.presentation.style.id !== 'well_collapse') return;
    rt.wellKill = true;
    rt.fieldAffected = true; // exact well-collapse classification is the force kernel's inner-capture receipt
    const pos = payload.pos || rt.center;
    for (let i = 0; i < VERB_WELL_CLOUD_REQUIRED; i++) {
      const a = (i / VERB_WELL_CLOUD_REQUIRED) * TAU;
      const pickup = this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: pos.x + Math.cos(a) * 9, z: pos.z + Math.sin(a) * 9 },
        vel: { x: Math.cos(a) * 8, z: Math.sin(a) * 8 },
        radius: 2.2,
        data: {
          kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1,
          despawnAt: (this.state.simTime || 0) + 90,
          onboarding: true, onboardingVerb: 'well',
        },
      });
      if (pickup) rt.pickupIds.push(pickup.id);
    }
    this._setArcadeVerbWaypoint({ pos, name: 'Collapse Cloud' }, 'Inhale the collapse cloud.');
  },

  _spawnBurnLineLesson() {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime;
    const planet = state.planet;
    if (!rt || !planet || !planet.active || typeof this.helpers.spawnEntity !== 'function') return;
    const planetEntity = state.entities && state.entities.get(planet.entityId);
    const bands = planetEntity && planetEntity.data && planetEntity.data.planetSite
      && planetEntity.data.planetSite.bands;
    if (!bands) { progress.entered = false; return; }
    const angle = onboardingRandom(state) * TAU;
    const radius = Math.max(planetEntity.radius + 60, (Number(bands.reentry) || 800) - 12);
    const ux = Math.cos(angle), uz = Math.sin(angle);
    const spec = makeEnemySpawnSpec('reaver_pirate', 1, {
      x: planet.center.x + ux * radius,
      z: planet.center.z + uz * radius,
    }, { startedTick: state.tick, motive: 'distress', engagementTrigger: 'onboarding_verb' });
    spec.type = 'drone';
    spec.name = 'Tumbling Rescue Derelict';
    spec.hull = spec.hullMax = 16;
    spec.armorHp = spec.armorMax = 0;
    spec.armorFlat = 0;
    spec.shield = spec.shieldMax = 0;
    spec.mass = 30;
    spec.vel = { x: -ux * 32, z: -uz * 32 };
    spec.data.weapons = [];
    spec.data.onboarding = true;
    spec.data.onboardingVerb = 'burn_line';
    spec.data.ai = { ...(spec.data.ai || {}), passive: true, roe: 'hold_fire', motive: 'distress' };
    spec.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: angle + Math.PI };
    const drone = this.helpers.spawnEntity(spec);
    if (!drone) { progress.entered = false; return; }
    rt.derelictId = drone.id;
    rt.ids = [drone.id];
    this._setArcadeVerbWaypoint(drone, ARCADE_VERB_BY_ID.get('burn_line').objective);
  },

  _onArcadePlungeStage(payload) {
    const beat = this._currentArcadeVerb();
    const rt = this._arcadeVerbProgress() && this._arcadeVerbProgress().runtime;
    if (!beat || beat.id !== 'burn_line' || !rt || payload.id !== rt.derelictId) return;
    if (payload.stage === 'commit' || payload.stage === 'breakup' || payload.stage === 'descent') {
      rt.sawBurnLine = true;
    }
    if (payload.stage === 'aftermath' && rt.sawBurnLine === true) {
      this._completeArcadeVerb('burn_line', { source: 'planet:plungeStage', outcome: 'burned' });
    } else if (payload.stage === 'clear' && rt.sawBurnLine === true) {
      this._completeArcadeVerb('burn_line', { source: 'planet:plungeStage', outcome: 'saved' });
    }
  },

  _setArcadeVerbWaypoint(target, reason) {
    const state = this.state;
    const progress = this._arcadeVerbProgress();
    if (!progress || !state.nav || !target || !target.pos) return;
    if (!Object.prototype.hasOwnProperty.call(progress, 'previousWaypoint')) {
      const prior = state.nav.waypoint;
      progress.previousWaypoint = prior ? {
        ...prior,
        ...(prior.pos ? { pos: { x: prior.pos.x, z: prior.pos.z } } : {}),
      } : null;
    }
    const beat = this._currentArcadeVerb();
    state.nav.waypoint = {
      onboarding: true,
      arcadeVerb: true,
      pos: { x: target.pos.x, z: target.pos.z },
      label: target.name || target.data && target.data.name || beat && beat.title || 'Training',
      reason,
      markerId: `onboarding:verb:${beat && beat.id || 'training'}`,
      markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
      mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
    };
  },

  _restoreArcadeVerbWaypoint() {
    const progress = this._arcadeVerbProgress();
    const nav = this.state && this.state.nav;
    if (!progress || !nav) return;
    if (nav.waypoint && nav.waypoint.arcadeVerb) nav.waypoint = progress.previousWaypoint || null;
    delete progress.previousWaypoint;
  },

  _clearArcadeVerbWorld({ restoreWeapon = false, restoreWaypoint = false } = {}) {
    const progress = this._arcadeVerbProgress();
    const rt = progress && progress.runtime || {};
    const ids = new Set(Array.isArray(rt.ids) ? rt.ids : []);
    for (const id of Array.isArray(rt.pickupIds) ? rt.pickupIds : []) ids.add(id);
    if (typeof this.helpers.removeEntity === 'function') {
      for (const id of ids) {
        const entity = this.state.entities && this.state.entities.get(id);
        if (entity && entity.alive !== false) this.helpers.removeEntity(id);
      }
    }
    const selectedId = this.state && this.state.player && this.state.player.targetId;
    if (ids.has(selectedId)) this.state.player.targetId = null;
    if (restoreWeapon) {
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      if (player && player.data && Array.isArray(player.data.weapons)) {
        player.data.weapons = player.data.weapons.filter((weapon) => !weapon || weapon.onboardingVerbGift !== true);
      }
    }
    if (restoreWaypoint) this._restoreArcadeVerbWaypoint();
  },

  // ---- DOM ------------------------------------------------------------------------------------
  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${PANEL_ID} { position:relative; width:100%; z-index:60; pointer-events:none;
      font-family:var(--hud-body, "IBM Plex Sans", "Segoe UI", system-ui, sans-serif); }
    #ui-root > #${PANEL_ID} { position:absolute; left:20px; top:150px; width:340px; }
    #${PANEL_ID} .sf-ob-card { padding:8px 10px 9px;
      background:linear-gradient(108deg, rgba(17,25,36,.91), rgba(7,12,20,.78));
      border:1px solid rgba(147,174,195,.24); border-top:2px solid rgba(131,206,216,.62); border-radius:2px;
      box-shadow:0 10px 24px rgba(0,0,0,.22); }
    #${PANEL_ID} .sf-ob-kicker { font:700 9px var(--hud-display,"Saira SemiCondensed",sans-serif); letter-spacing:.12em;
      text-transform:uppercase; color:var(--hud-cyan,#83ced8); margin-bottom:4px; display:flex; justify-content:space-between;
      text-shadow:none; }
    #${PANEL_ID} .sf-ob-title { font-size:13px; color:var(--hud-paper,#e7edf5); font-weight:500; margin-bottom:4px; text-shadow:none; }
    #${PANEL_ID} .sf-ob-hint { font-size:12px; line-height:1.45; color:var(--text-secondary,#84a0c8); text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-flavor { font-size:11.5px; line-height:1.45; color:var(--ink-mute,#6b7d99);
      font-style:italic; margin-top:7px; border-top:1px dashed rgba(132,160,200,.18); padding-top:6px; text-shadow:var(--text-shadow-hard); }
    #${PANEL_ID} .sf-ob-progress { margin-top:7px; font-family:var(--mono,monospace); font-size:11px; color:var(--accent-2,#7af7d0); }
    #${PANEL_ID} .sf-ob-steps { display:flex; gap:3px; margin-top:7px; }
    #${PANEL_ID} .sf-ob-dot { flex:1; height:2px; border-radius:0; background:rgba(132,160,200,.2); }
    #${PANEL_ID} .sf-ob-dot.done { background:#789da6; box-shadow:none; }
    #${PANEL_ID} .sf-ob-dot.curr { background:var(--hud-cyan,#83ced8); box-shadow:0 0 4px rgba(131,206,216,.35); }
    @media (max-width:760px), (max-height:620px) {
      .sf-leftcontext > #${PANEL_ID} { left:auto !important; top:auto !important; width:100% !important; }
    }
    `;
    document.head.appendChild(s);
  },

  _buildPanel() {
    if (this._panel) this._panel.remove();
    const root = document.querySelector('.sf-leftcontext') || document.getElementById('ui-root') || document.body;
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
    if (root.classList && root.classList.contains('sf-leftcontext')) root.prepend(el);
    else root.appendChild(el);

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
