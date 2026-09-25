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
import { IS_DEMO } from '../core/demoMode.js';
import { successfulPickupAmount } from '../core/pickupAcceptance.js';
import { Masks } from '../core/entity.js';
import { firstUseLine, resolveFirstUseEntityId, RANGE_POINTER_LINE } from '../ui/hudAttention.js';
import { deboxCss, INK_SHADOW } from '../ui/hudBrackets.js';
import { continueRecap } from '../ui/screens/missionLog.js';
import { makeEnemySpawnSpec } from './combat.js';
import { ONBOARDING_CHOICE_SOURCE } from './missions.js';
import { massline2Flag } from '../data/featureFlags.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import {
  FIRST_TRADE_CONTRACT_DEST_STATION_ID,
  FIRST_TRADE_CONTRACT_SOURCE,
} from '../data/economyContractTemplates.js';
import {
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
  RESCUE_GATE,
  RESCUE_ORDER,
  RESCUE_PREREQ,
  RESCUE_REEL_TIGHT_WU,
  RESCUE_ROCK_HIT_MIN_SPEED_WU,
  RESCUE_RUN_MIN_SPEED_WU,
  RESCUE_SHOVE_PROOF_SPEED_WU,
  buildRangeOpenedFunnelEvent,
  buildRescueCompleteEvent,
  buildRescueFunnelEvent,
  buildRescueStartedEvent,
  freshRescueState,
  makeRescueCastSpecs,
  rescueBeatLine,
  rescuePlayerLatchedTo,
  rescuePodAtBeacon,
  rescueRangeRungId,
  rescueRockHitDerelict,
  rescueScoutAtAsteroid,
  rescueScoutEscaped,
} from '../onboarding/rescueOpening.js';
import {
  FIRST_HOUR_S,
  MISSING_THREE_GATE,
  MISSING_THREE_ORDER,
  MISSING_THREE_PREREQ,
  buildFirstHourBeatEvent,
  buildFirstHourCompleteEvent,
  buildFirstHourStartedEvent,
  buildFirstHourVerbEvent,
  freshMissingThreeState,
  makeWellScrapSpec,
  missingThreeBeatLine,
  missingThreeBoosting,
  missingThreeRangeRungId,
  missingThreeStrokeActive,
  missingThreeWithinHour,
} from '../onboarding/missingThree.js';
import {
  STORE_SENTENCE,
  buildFirstHourSentenceEvent,
  freshStoreSentenceState,
  stampStoreClause,
} from '../onboarding/storeSentence.js';

const PANEL_ID = 'sf-onboarding';
const STYLE_ID = 'sf-onboarding-style';
const TAU = Math.PI * 2;

// ── FIRST-HOUR PACING (spec2/03, reworked 2026-09-18: the thesis-first route) ────
// The fix for "the open teaches five things at once" is PACING, not deletion: one beat → one verb
// → ≥4 s of silence → next beat. This BEATS table is the single source of truth for the first 15
// minutes (the runtime order is authored HERE; flightDrill.js remains the shared drill contract
// for its constants and audit consumers). All tutorial lines are imperative, name ONE verb, and
// are ≤12 words (spec2/00 §5). Each beat fires only when the previous beat's DONE fired AND
// ≥SILENCE_S of text silence passed.
//
// THESIS-FIRST ORDER (design/VISION.md "the 60-second fantasy"): the player DOES the fantasy
// before anything else — first Massline attach inside the first minute, a raid tableau where the
// taught swing turns an enemy into a projectile, then the consequence: claimed salvage, a law
// witness, and a real WANTED search ring to outrun. Flight-control drills follow the attach (the
// player is already flying); the economy on-ramp (seam → dock → choice) closes the hour. The
// sandbox stays intact: every beat guides, none walls — a player who ignores the raid or leaves
// the claimed salvage is never blocked, and the rail simply moves on.
//
// `line`  : the verb bark shown at beat entry (the single tutorial voice in its window).
// `followups` : extra barks gated on in-beat events (latch/reel/cut, scan/seam/vent, sell/board).
// `done`  : the kind of DONE condition this beat resolves on (handled in _resolveBeatDone and,
//           for raid/claimed, the dedicated _onRaid*/_onClaimed* handlers).
// Handoff: completing B5 (accepting any of three offers) calls _finish() → story-mode panel.
const SILENCE_S = 4;          // ≥4 s of text silence between a beat's DONE and the next beat's text
const TETHER_REEL_MAX_WU = 60;// B1: reel target distance
const SEAM_ORE_TARGET = 3;    // B2 DONE: ore collected
const B1_DERELICT_OFFSET_WU = 80;   // tether lesson starts inside the stronger live latch envelope
const TRAINER_MARKER_OFFSET_WU = 620;
const TRAINER_BURST_OFFSET_WU = 260;
const TRAINER_FLYBY_SPEED_WU = 118;
const TRAINER_FLYBY_OFFSET_WU = 52;

// Raid tableau (the momentum kill). The raider is a real, hostile pirate hull — the taught swing
// turns it into a projectile against the rescue asteroid wall. Hull sits above a starter-gun
// burst (a gun kill is a long, deliberate refusal of the lesson) but under one honest throw into
// rock: whip recoil + tumble contact do the work the moment the player lets go at speed.
const RAID_RAIDER_HULL = 150;
const RAID_RAIDER_OFFSET_WU = 240;   // from the player, near the rescue wall bearing
const RAID_HAULER_OFFSET_WU = 190;   // the civilian the raider is working over (scene dressing)
// INF-062 — consecutive genuine latch denials before the one contextual hint.
const LATCH_DENIAL_HINT_AFTER = 3;
const RAID_WHIP_KILL_WINDOW_S = 12;  // kill credited to the throw inside this window after a whip
// Claimed-salvage tableau (the wanted beat). Spilled cargo from the raid is lawfully claimed; a
// law cutter stands witness. Taking it reports the theft through the real law owner entry
// (lawSecurity.reportIncident → heat.applyIncidentReceipt), so the player EXPERIENCES the search
// ring instead of reading a warning. Leaving it is a first-class choice: the tableau stands down
// after CLAIMED_WINDOW_S and the rail moves on — no wall.
const CLAIMED_WINDOW_S = 120;
const CLAIMED_PICKUP_COUNT = 3;
const CLAIMED_WITNESS_OFFSET_WU = 380; // inside LAW_INCIDENT_WITNESS_RADIUS (450)
const CLAIMED_CLEAR_GRACE_S = 2;       // level-0 heat must hold this long before DONE resolves

// B0 one-verb hierarchy (UIUX-B0-ONE-VERB):
//   1. HUD mission tracker (.sf-mission-tracker) is the sole persistent actionable objective
//      (fed by nav.waypoint.reason while onboarding waypoint is active).
//   2. #sf-onboarding panel is demoted during B0: progress/status only (no competing verb copy).
//   3. Transient tutorial voice (_sayTutorial) speaks the beat line once.
//   4. firstFlight control-hint wall is deferred until the staged rail is finished.
//   5. Mission Log / story longform stay on-demand context (not a second primary command).
// The authored first-hour route. Exported for focused tests that drive the beat FSM by key;
// the static pacing/one-voice checks still read this literal from source so the audit sees the
// authored copy, not the imported object.
export const BEATS = [
  { // FIRST TETHER — the signature verb leads. Attach lands inside the first minute of control.
    key: 'tether',
    line: 'Target the marked derelict.',
    followups: [
      { on: 'target:acquired', line: 'Latch it. Massline.' },
      { on: 'tether:latched', line: 'Winch in. Hold tether to reel.' },
      { on: 'tether:nearBreak', line: 'Ease off. Let the line settle.' },
      { on: 'tether:reel', line: 'Cut and coast. Tap tether to cut.' },
    ],
    done: 'tether:released',
  },
  { // THE RAID — enemy becomes a projectile: latch, swing, release into the rock.
    key: 'raid',
    line: 'Latch the raider. Swing him into the rock.',
    followups: [
      { on: 'raid:latched', line: 'Build speed. Let go at the big rock.' },
    ],
    done: 'raidKill',
  },
  { // THE CONSEQUENCE — claimed salvage, a law witness, a real search ring to outrun.
    key: 'claimed',
    line: 'Claimed salvage. Take it anyway, or leave it.',
    followups: [
      { on: 'claimed:taken', line: "You're marked. Outrun the search ring." },
    ],
    done: 'wantedCleared',
  },
  { // The player is already flying; the speed drill formalizes what the attach just used.
    key: 'thrust',
    line: 'Thrust until speed passes forty.',
    done: 'speedUp',
  },
  {
    key: 'brake',
    line: 'Brake below ten.',
    done: 'speedDown',
  },
  {
    key: 'marker',
    line: 'Follow the amber diamond to the trainer.',
    done: 'trainerRange',
  },
  {
    key: 'focus',
    line: 'Hold course. Let the trainer cross your bow.',
    done: 'flybyFocus:start',
  },
  {
    key: 'burst',
    line: 'Fire a short burst into the trainer.',
    followups: [
      { on: 'burst:ready', line: 'Release. Let the heat bar clear.' },
    ],
    done: 'burstCooled',
  },
  {
    key: 'disengage',
    line: 'Thrust away until the trainer leaves scope.',
    done: 'disengaged',
  },
  { // B2 FIRST SEAM — scan + mine; modality-neutral verbs
    key: 'seam',
    line: 'Pulse the scanner.',
    followups: [
      { on: 'scan:hit', line: 'Beam the bright seams.' },
    ],
    done: 'oreCollected',
  },
  { // B4 DOCK — sell flow + ONE recommended contract
    key: 'dock',
    line: 'Helios. Dock when close.',
    followups: [
      { on: 'sold', line: "Board's got one job for you." },
    ],
    done: 'recommendedCompleted',
  },
  { // B5 CHOICE — three side-by-side offers; accept any → ends tutorial
    key: 'choice',
    line: 'Pick the work that fits.',
    done: 'mission:accepted',
  },
];
// Beat index for the choice beat (B5) — accepting its offer ends tutorial mode permanently.
const CHOICE_BEAT_INDEX = BEATS.length - 1;

// The rescue verbs fill the new order's gaps: swing opens right after the first attach (the
// player immediately re-uses the latch on a live rock), shove rides the gun lesson's exit, and
// grab-and-run fills the gap before the raid. Composed here — rescueOpening.js's own map stays
// untouched for its audit consumers; the onboarding route owns which drill beat each verb gates.
const RESCUE_GATE_ROUTE = Object.freeze({
  swing: 'raid',       // while the rock swing is current, the raid waits its turn
  shove: 'disengage',
  grab: 'seam',        // while the pod run is current, the seam lesson waits
});

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
    bus.on('ui:firstRunSplash:done', () => {
      this._firstRunSplashPending = false;
      try { this._tryAdvanceBeat(); } catch (_) { /* never let onboarding break the bus */ }
    });
    // Start only for a fresh game. Loaded saves emit save:loaded (no tutorial for a returning pilot).
    // The payload names a scenario slice for harness boots (47a sim, lab scenarios); those own
    // their cast, so the rescue opening only stages on the default route (no scenario payload).
    bus.on('game:started', (p) => this._begin(p || {}));
    // On load, a returning pilot doesn't get the tutorial — but they DO get the story objective
    // tracker (P2-14), so they can always see their current beat objective. Tear down any tutorial
    // state, then bring up the story panel.
    bus.on('save:loaded', (p) => {
      this._teardown();
      this._dockControlInRange = false;
      this._demoFittedThisDock = null;
      this._gateControlInRange = false;
      this._lastControlMode = null;
      this._beginStoryMode();
      this._speakContinueRecap(p);
    });

    // Objective completion hooks (real events verified against the systems).
    bus.on('dock:docked', () => {
      this._dockControlInRange = false;
      this._demoFittedThisDock = null;
      this._onBeatEvent('dock:docked');
    });
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

    // ── Rescue-opening rail (PQ-163.00) ─────────────────────────────────────────────────
    // The three rescue verbs ride the production event stream next to the drill handlers.
    // Every handler below no-ops unless its rescue beat is current, so the drill, the
    // 47-A slice harness, and the B1 audit scripts observe zero behavior change.
    bus.on('tether:latched', (p) => this._onRescueLatched(p || {}));
    bus.on('tether:reel', (p) => this._onRescueReel(p || {}));
    bus.on('tether:released', (p) => this._onRescueReleased(p || {}));
    bus.on('tether:cut', (p) => this._onRescueCut(p || {}));
    bus.on('tether:broke', (p) => this._onRescueBroke(p || {}));
    bus.on('tether:whipImpact', (p) => this._onRescueWhipImpact(p || {}));
    bus.on('combat:shove', (p) => this._onRescueShoveEvent(p || {}));
    bus.on('combat:fire', (p) => this._onRescueFire(p || {}));
    bus.on('entity:killed', (p) => this._onRescueKilled(p || {}));
    bus.on('player:death', () => this._onRescuePlayerDeath());
    bus.on('rescue:started', (p) => this._showStoreSentenceOnce(p || {}));

    // ── Demo end card (ZERO_TO_HERO Phase 5.5) ──────────────────────────────────────────
    // Once per save: the player undocks carrying a module they fitted during that dock →
    // the card. The flag rides state.player.hints like every other one-time flag, so it
    // persists with the save and adds no top-level field.
    bus.on('module:equipped', (p) => this._onDemoModuleEquipped(p || {}));
    bus.on('dock:undocked', () => this._maybeShowDemoEndCard());

    // ── Range pointer & funnel (PQ-163.01 — "The Range is the door") ─────────────────────
    bus.on('tether:latched', (p) => this._onLatchPointer(p || {}));
    bus.on('range:opened', (p) => this._onRangeOpened(p || {}));
    bus.on('ship:boostStart', (p) => this._onMissingThreeBoostStart(p || {}));
    bus.on('fields:deployed', (p) => this._onMissingThreeWell(p || {}));

    // ── Raid + claimed tableau (thesis-first route, 2026-09-18) ─────────────────────────
    // The momentum kill reads the production whip/tumble event stream; the wanted beat rides
    // the real heat owner (lawSecurity.reportIncident → heat.applyIncidentReceipt → heat:changed).
    bus.on('tether:latched', (p) => this._onRaidLatched(p || {}));
    bus.on('tether:released', (p) => this._onRaidReleased(p || {}));
    bus.on('tether:cut', (p) => this._onRaidReleased(p || {}));
    bus.on('tether:whipImpact', (p) => this._onRaidWhipImpact(p || {}));
    bus.on('entity:killed', (p) => this._onRaidKilled(p || {}));
    bus.on('player:death', () => this._onRaidPlayerDeath());
    bus.on('pickup:collected', (p) => this._onClaimedPickup(p || {}));
    bus.on('heat:changed', (p) => this._onClaimedHeat(p || {}));

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

    // First dock: orient the player to the station's LEFT RAIL. This is the single biggest "cliff"
    // moment — a new player docking for the first time meets a screen full of operations with no
    // explanation. (The comment used to describe an 8-tab hub across the top; that layout is gone,
    // and the live copy in hudAttention.js already points at the rail and at Departure Check.) This fires on every first dock (not just
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

    // Bomb bay: the first time the player releases a drift bomb. NPC droppers do not
    // exist yet; the owner filter keeps their future drops from spending the lesson.
    bus.on('bombs:dropped', (p) => {
      const playerId = this.state && this.state.playerId;
      if (p && p.ownerId != null && playerId != null && p.ownerId !== playerId) return;
      this._showHint('firstBombDrop', firstUseLine('firstBombDrop'), p);
    });

    // Massline Physics Identity (Wave M2, massline2Flag-gated so headless contract runs and
    // flag-off sessions never see them). One-shot contextual hints for the three new verbs; the
    // authored first-hour BEATS rail is untouched.
    // INF-062 — the latch lesson is taught by failure, not by interrupting success. The
    // old first-latch 'masslineThrow' bark lectured competent pilots mid-lesson (and doubled
    // the staged tether beat's own cut line), so it is gone. Instead, consecutive genuine
    // latch denials earn ONE contextual hint naming the block; any clean latch resets the
    // streak — success suppresses the pending lesson — and player.hints keeps it once-only.
    bus.on('tether:latchDenied', (payload) => {
      if (!massline2Flag('throw')) return;
      this._latchDenialStreak = (this._latchDenialStreak || 0) + 1;
      if (this._latchDenialStreak < LATCH_DENIAL_HINT_AFTER) return;
      const reason = payload && payload.reason;
      const line = reason === 'cooldown'
        ? 'Line resetting. Wait a breath, then latch.'
        : reason === 'no-target'
          ? 'Target a rock or wreck first. Then latch.'
          : 'Latch needs a target in range.';
      this._showHint('masslineLatchDenied', line, payload);
    });
    bus.on('tether:latched', () => {
      this._latchDenialStreak = 0;
    });
    bus.on('tether:latched', (payload) => {
      if (!massline2Flag('hitchhiking') || !payload || payload.targetId == null) return;
      const target = this.state.entities && this.state.entities.get(payload.targetId);
      if (!isHitchHintTarget(target)) return;
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
    if (st.run?.kind === 'survival' && st.run.phase !== 'inactive') return;
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

  // ── Demo end card (ZERO_TO_HERO Phase 5.5) ─────────────────────────────────────────────
  // A fitting made while docked at a station (ships.fitModule emits module:equipped with the
  // ACTIVE ship's entity id) is remembered until the dock ends. A crucible refit also emits
  // module:equipped but is never docked, so it cannot arm the card.
  _onDemoModuleEquipped(p) {
    if (!IS_DEMO || !p) return;
    const st = this.state;
    if (!st || !st.ui || !st.ui.docked) return;
    if (p.shipId !== st.playerId) return;
    this._demoFittedThisDock = p.defId || null;
  },

  _maybeShowDemoEndCard() {
    const fitted = this._demoFittedThisDock;
    this._demoFittedThisDock = null;
    if (!IS_DEMO || !fitted) return;
    const st = this.state;
    if (!st || !st.player) return;
    if (st.run?.kind === 'survival' && st.run.phase !== 'inactive') return;
    if (!st.player.hints) st.player.hints = {};
    if (st.player.hints.demoEndShown) return;
    st.player.hints.demoEndShown = true;
    if (st.ui) st.ui.demoEnd = { moduleDefId: fitted };
    this.bus.emit('ui:pushScreen', { id: 'demoEnd' });
  },

  _isOre(id) { return !!id && ORE_PREFIXES.some((p) => String(id).startsWith(p)); },

  _begin(payload) {
    const st = this.state;
    this._dockControlInRange = false;
    this._demoFittedThisDock = null;
    this._gateControlInRange = false;
    this._lastControlMode = null;
    this._latchDenialStreak = 0;
    if (st.run?.kind === 'survival' && st.run.phase !== 'inactive') {
      // The fresh world may already have reused the old tutorial actor IDs.
      this._teardown({ removeActors: false });
      st.onboarding = { active: false, finished: false };
      return;
    }
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
      firstLatchDone: false,
      firstLatchAt: null,
      rangePromptActive: false,
      rangePrompt: null,
      pointedAtRange: false,
      rangeOpened: false,
      rangeOpenedAt: null,
      rangeOpenedFromPrompt: false,
      rangeOpenedFromPromptAt: null,
      rangeFunnel: null,
      rangePromptRungId: null,
      startedAt: st.simTime || 0,
    };
    // Thesis-first tableau state (raid + claimed). Only staged on the default route — see
    // _beginRescue for the scenario-payload carve-out the 47-A slice harness depends on.
    st.onboarding.raid = null;
    st.onboarding.claimed = null;
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
    // The rescue opening stages on the default route only: harness boots that name a scenario
    // slice (47a sim, lab scenarios) keep their own cast and their golden snapshots.
    if (!payload || payload.scenario == null) this._beginRescue();
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

  // INF-070: Continue restores the pilot's intention. One dismissible flight-log recap
  // of restored state — active objective, current sector, one unresolved risk — on the
  // existing comms surface. Reads only (never a reward), fires once per load, leaves
  // controls untouched: no modal, no mode change.
  _speakContinueRecap(payload) {
    try {
      if (payload && (payload.scenario || payload.harness)) return; // harness boots own their cast
      const recap = continueRecap(this.state);
      if (!recap) return;
      const lines = [];
      if (recap.objective) lines.push(`Objective: ${recap.objective}`);
      if (recap.location) lines.push(`Position: ${recap.location}`);
      if (recap.risk) lines.push(`Risk: ${recap.risk}`);
      if (!lines.length) return;
      this.bus.emit('comms:popup', {
        sender: 'Flight Log',
        text: `Welcome back. ${lines.join(' ')}`,
        category: 'personal',
        ttl: 10,
      });
    } catch (_) { /* never let onboarding break the bus */ }
  },

  _retireTutorialPanel() {
    if (this._panel) this._panel.remove();
    this._panel = null;
    this._bodyEl = null;
    this._titleEl = null;
    this._countEl = null;
    this._stepsEl = null;
    this._progressEl = null;
    this._rangePromptEl = null;
    this._flavorEl = null;
    this._kickerLabelEl = null;
  },

  _teardown({ removeActors = true } = {}) {
    const ob = this.state.onboarding; if (ob) ob.active = false;
    if (removeActors) {
      this._removeTrainingActors();
      this._removeRescueActors();
      this._removeMissingThreeActors();
      this._removeRaidActors();
      this._removeClaimedActors();
    }
    if (ob && ob.raid) ob.raid.active = false;
    if (ob && ob.claimed) ob.claimed.active = false;
    this._trainerId = this._derelictId = this._miningRockId = null;
    this._latchDenialStreak = 0;
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._bodyEl = null;
    this._titleEl = null;
    this._countEl = null;
    this._stepsEl = null;
    this._progressEl = null;
    this._rangePromptEl = null;
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

  // Fixed-seed proof events for the thesis-first route (measured by the public playthrough
  // pilot driver's ledger). Emitted only on real completions: first attach, the swing payoff,
  // the momentum kill, the wanted beat, and its resolution.
  _emitMilestone(milestone, extra = {}) {
    this.bus.emit('firsthour:milestone', {
      milestone: String(milestone),
      atS: this.state.simTime || 0,
      ...extra,
    });
  },

  // Try to advance to the next beat if the silence gate has passed since the previous beat's DONE.
  // Called from update(). Fires the new beat's entry line + spawns the beat's world content.
  _tryAdvanceBeat() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const nextIndex = ob.currentBeat + 1;
    if (nextIndex >= BEATS.length) return;
    // First-run opening line owns the screen until its fade has completed.
    if (nextIndex === 0 && this._firstRunSplashPending) {
      const splashLive = typeof document !== 'undefined'
        && document.querySelector('.sf-firstrun-splash');
      if (splashLive) return;
      // Splash node was torn down without a done event (boot/UI replacement). Do not
      // leave B0 gated forever.
      this._firstRunSplashPending = false;
    }
    // Silence gate: the previous beat must have DONE'd AND ≥SILENCE_S passed since the last text.
    if (nextIndex > 0) {
      const prev = BEATS[nextIndex - 1];
      const prevDoneAt = ob.beatDoneAt[prev.key];
      if (prevDoneAt == null) return;                 // predecessor not DONE yet
      const now = this.state.simTime || 0;
      if (now - Math.max(prevDoneAt, this._lastTextAtS) < SILENCE_S) return;
    }
    // Rescue-opening gate (PQ-163.00): while a rescue verb is current, the drill beat it gates
    // waits. The rescue speaks through the same one-voice chokepoint, so the ≥4 s cadence the
    // silence gate enforces below already covers the rescue line — no second timer needed.
    // Inactive rescue (harness boots, opted-out pilots, finished rails) never gates anything.
    // The route gate (RESCUE_GATE_ROUTE) keeps the verbs inside the thesis-first order's gaps;
    // rescueOpening.js's own map stays untouched for its audit consumers.
    const rescueKey = this._rescueCurrentKey();
    const rescueGate = RESCUE_GATE_ROUTE[rescueKey] != null
      ? RESCUE_GATE_ROUTE[rescueKey]
      : (rescueKey ? RESCUE_GATE[rescueKey] : null);
    if (rescueGate != null && rescueGate === BEATS[nextIndex].key) return;
    // Missing-three gate (PQ-163.02): boost, stroke, and the well occupy the grab → seam gap.
    const three = this._missingThree();
    if (three && !three.completed && (MISSING_THREE_GATE[three.current] || 'seam') === BEATS[nextIndex].key) return;
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
    else if (beat.key === 'raid') this._enterRaidBeat();
    else if (beat.key === 'claimed') this._enterClaimedBeat();
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
    // The rail yields to real work: an accepted contract that is not the dock beat's own
    // recommended first-trade offer ends the tutorial through the same _finish() the choice
    // beat's accept uses, so the objective slot follows the job the player actually took and
    // the n/12 status retires instead of pinning a stale beat for the rest of the run.
    if (ob.active && !ob.finished && payload.source !== FIRST_TRADE_CONTRACT_SOURCE) {
      this._finish();
    }
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
    this._maybeStartRescueBeat(beat.key);
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
    this._removeRescueActors();
    this._removeMissingThreeActors();
    this._removeRaidActors();
    this._removeClaimedActors();
    if (ob.rescue) ob.rescue.active = false;
    if (ob.missingThree) ob.missingThree.active = false;
    if (ob.raid) ob.raid.active = false;
    if (ob.claimed) ob.claimed.active = false;
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
    if (!this._panel || typeof document === 'undefined') return;
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
    if (!ob) return;
    try {
      this._accum = (this._accum || 0) + dt;
      if (this._accum < 0.2) return;
      this._accum = 0;
      this._noteMissingThreeUses();
      if (!ob.active || ob.finished) return;
            this._tryAdvanceBeat();
      this._resolveProximityDone();
      this._resolveRescueDone();
      this._resolveRaidDone();
      this._tickClaimed();
      this._maybeAdvanceMissingThree();
      this._resolveMissingThreeDone();
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
    // A seam rock destroyed in crossfire (the wanted-escape chaos) restages — retry,
    // never a wall: the seam beat respawns its marked rock the moment it is gone.
    const beatNow = BEATS[ob.currentBeat];
    if (beatNow && beatNow.key === 'seam'
      && (this._miningRockId == null
        || !(this.state.entities.get(this._miningRockId)?.alive !== false))) {
      this._spawnMiningRock();
    }
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
    } else if (beat.done === 'disengaged') {
      if (trainerDistance >= FLIGHT_DRILL_DISENGAGE_RANGE_WU) {
        this._removeTrainingActors();
        this._beatDone(beat);
      }
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
      physicsBody: { shape: 'capsule' },
      data: { parentType: 'ship', proportions: WRECK_COLLIDER_PROPORTIONS, loot: [], salvagePool: {}, salvageTimeLeft: 0, onboarding: true, kind: 'derelict' },
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
      // The marker beat uses this same actor, but Focus is a distinct lesson.  A fast player
      // must not spend the trainer's Focus cooldown before the authored flyby begins.
      spec.data.trainingFocusEligible = false;
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
      physicsBody: { radius: asteroidColliderRadius('ast_common_rock', 18) },
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
    trainer.data = trainer.data || {};
    trainer.data.trainingFocusEligible = true;
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

  // ── Rescue opening (PQ-163.00) ────────────────────────────────────────────────────────
  // Three verbs in the drill's silence gaps: swing (after tether), shove (after burst),
  // grab-and-run (after disengage). Each is taught by doing through production events, then
  // silence; the funnel records complete/fail per beat. Fails reset the beat's actors and
  // retry — never a wall, never a second voice.

  _rescue() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.rescue && ob.rescue.active && !ob.finished ? ob.rescue : null;
  },

  _rescueCurrentKey() {
    const rescue = this._rescue();
    return rescue && rescue.current ? rescue.current : null;
  },

  _rescueActor(slot) {
    const rescue = this._rescue();
    if (!rescue) return null;
    const id = rescue.ids && rescue.ids[slot];
    if (id == null || !this.state.entities) return null;
    const entity = this.state.entities.get(id);
    return entity && entity.alive !== false ? entity : null;
  },

  _beginRescue() {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob || ob.rescue) return;
    ob.rescue = freshRescueState();
    ob.rescue.startedAt = st.simTime || 0;
    ob.missingThree = freshMissingThreeState();
    ob.missingThree.startedAt = st.simTime || 0;
    ob.storeSentence = freshStoreSentenceState();
    this._spawnRescueCast();
    this.bus.emit('rescue:started', buildRescueStartedEvent(st.simTime || 0));
  },

  // PQ-163.03: the store-page sentence is shown once at rescue start, then silence.
  // Distinct voice id so leftover B0 / verb lines do not replace it. Never hudAttention.
  _showStoreSentenceOnce() {
    const ob = this.state && this.state.onboarding;
    if (!ob) return;
    if (!ob.storeSentence) ob.storeSentence = freshStoreSentenceState();
    if (ob.storeSentence.shown) return;
    const atS = this.state.simTime || 0;
    ob.storeSentence.shown = true;
    ob.storeSentence.shownAt = atS;
    this._sayTutorial(STORE_SENTENCE, { visual: false });
    const voice = this.helpers && this.helpers.voice;
    const said = voice && typeof voice.say === 'function'
      && voice.say({
        channel: 'tutorial',
        text: STORE_SENTENCE,
        kind: 'info',
        ttl: 8,
        id: 'firsthour:sentence',
      });
    if (!said) this.bus.emit('toast', { text: STORE_SENTENCE, kind: 'info', ttl: 8, id: 'firsthour:sentence' });
    this.bus.emit('firsthour:sentence', buildFirstHourSentenceEvent(atS));
  },

  _stampStoreClause(leftoverKey) {
    const rec = this.state && this.state.onboarding && this.state.onboarding.storeSentence;
    if (!rec) return;
    stampStoreClause(rec, leftoverKey, this.state.simTime || 0);
  },

  _spawnRescueCast() {
    const st = this.state;
    const rescue = st.onboarding && st.onboarding.rescue;
    if (!rescue || !rescue.active) return;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos || !this.helpers || !this.helpers.spawnEntity) return;
    // Remove any previous tableau before staging a fresh one (fail recovery, never a dupe).
    this._removeRescueActors();
    const specs = makeRescueCastSpecs(player.pos, () => onboardingRandom(st));
    makeRescueRockTowable(specs.rock);
    for (const slot of Object.keys(specs)) {
      const spawned = this.helpers.spawnEntity(specs[slot]);
      rescue.ids[slot] = spawned && spawned.id != null ? spawned.id : null;
      if (spawned && spawned.data && (slot === 'derelict' || slot === 'beacon')) {
        spawned._invulnUntil = Infinity;
      }
    }
  },

  _removeRescueActors() {
    const rescue = this.state && this.state.onboarding && this.state.onboarding.rescue;
    if (!rescue || !rescue.ids) return;
    const player = this.state && this.state.player;
    for (const slot of Object.keys(rescue.ids)) {
      const id = rescue.ids[slot];
      if (id != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(id);
      }
      if (player && id != null && player.targetId === id) player.targetId = null;
      rescue.ids[slot] = null;
    }
  },

  // A drill DONE may open the rescue verb that follows it: strict order (swing → shove →
  // grab), each firing exactly once through the single tutorial voice.
  _maybeStartRescueBeat(drillKey) {
    const rescue = this._rescue();
    if (!rescue || rescue.current || rescue.completed) return;
    const next = RESCUE_ORDER.find((key) =>
      rescue.beats[key].state !== 'done' && RESCUE_PREREQ[key] === drillKey);
    if (!next) return;
    const idx = RESCUE_ORDER.indexOf(next);
    if (rescue.beats[next].state === 'done') return;
    if (idx > 0 && rescue.beats[RESCUE_ORDER[idx - 1]].state !== 'done') return;
    rescue.current = next;
    rescue.beats[next].state = 'current';
    const line = rescueBeatLine(next);
    this.state.onboarding.beatAction = line;
    // Adopt a latch the player already holds (grabbed early): the beat must never strand.
    if (next === 'grab' && rescue.ids.pod != null
      && rescuePlayerLatchedTo(this.state, this.state.playerId, rescue.ids.pod)) {
      rescue.podLatched = true;
    }
    // The drills may have carried the pilot far from the original rescue site: restage the
    // grab tableau near the pilot so the run is a rescue, not a long empty commute. Retry,
    // never a wall — the same promise every other beat keeps.
    if (next === 'grab') {
      const podEnt = rescue.ids.pod != null && this.state.entities
        ? this.state.entities.get(rescue.ids.pod) : null;
      const beaconEnt = rescue.ids.beacon != null && this.state.entities
        ? this.state.entities.get(rescue.ids.beacon) : null;
      const playerNow = this.state.entities && this.state.entities.get(this.state.playerId);
      if (playerNow && playerNow.pos && podEnt && podEnt.pos
        && Math.hypot(podEnt.pos.x - playerNow.pos.x, podEnt.pos.z - playerNow.pos.z) > 1500) {
        this._respawnRescueSlot('grab');
        const newPod = rescue.ids.pod != null && this.state.entities
          ? this.state.entities.get(rescue.ids.pod) : null;
        if (newPod && newPod.pos && beaconEnt && beaconEnt.pos) {
          // Keep the beacon a fixed run distance from the fresh pod position.
          const runDx = newPod.pos.x - beaconEnt.pos.x;
          const runDz = newPod.pos.z - beaconEnt.pos.z;
          const runD = Math.hypot(runDx, runDz) || 1;
          beaconEnt.pos.x = newPod.pos.x + (runDx / runD) * 700;
          beaconEnt.pos.z = newPod.pos.z + (runDz / runD) * 700;
        }
      }
    }
    if (next === 'swing' && rescue.ids.rock != null
      && rescuePlayerLatchedTo(this.state, this.state.playerId, rescue.ids.rock)) {
      rescue.rockLatched = true;
    }
    this._sayTutorial(line);
    this._setRescueWaypoint(true);
    this._refreshBeatPanel();
  },

  // The marker identity stays beat-stable and onboarding-owned so HUD/radar/map agree.
  _setRescueWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    const rescue = this._rescue();
    if (!rescue || !rescue.current || !st.nav) return false;
    const key = rescue.current;
    const line = rescueBeatLine(key);
    let target = null;
    if (key === 'swing') {
      const rock = this._rescueActor('rock');
      if (rock) target = { pos: rock.pos, label: 'Loose Rock' };
    } else if (key === 'shove') {
      const scout = this._rescueActor('scout');
      if (scout) target = { pos: scout.pos, label: 'Scout' };
    } else if (key === 'grab') {
      const pod = this._rescueActor('pod');
      const beacon = this._rescueActor('beacon');
      const latched = rescue.podLatched
        || (rescue.ids.pod != null && rescuePlayerLatchedTo(st, st.playerId, rescue.ids.pod));
      if (latched && beacon) target = { pos: beacon.pos, label: 'Beacon' };
      else if (pod) target = { pos: pod.pos, label: 'Escape Pod' };
    }
    const existing = st.nav.waypoint;
    if ((!target || !target.pos)) {
      if (existing && existing.onboarding && String(existing.markerId || '').startsWith('rescue:')) {
        st.nav.waypoint = null;
      }
      return true;
    }
    if (existing && !existing.onboarding && !force) {
      const foreignKind = existing.kind;
      if (foreignKind !== 'mission' && foreignKind !== 'story') return true;
    }
    st.nav.waypoint = {
      onboarding: true,
      pos: { x: target.pos.x, z: target.pos.z },
      label: target.label,
      reason: line,
      markerId: `rescue:${key}`,
      markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
      mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
    };
    if (st.onboarding) st.onboarding.beatAction = line;
    return true;
  },

  // ── Rescue event handlers (all no-op unless their beat is current) ────────────────────
  _onRescueLatched(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key || !payload) return;
    if (key === 'swing' && payload.targetId === rescue.ids.rock) rescue.rockLatched = true;
    if (key === 'grab' && payload.targetId === rescue.ids.pod) rescue.podLatched = true;
  },

  _onRescueReel(payload) {
    const rescue = this._rescue();
    if (!rescue || this._rescueCurrentKey() !== 'swing' || !payload) return;
    if (payload.targetId !== rescue.ids.rock) return;
    const after = Number(payload.after);
    if (Number.isFinite(after) && after <= RESCUE_REEL_TIGHT_WU) rescue.rockReeled = true;
  },

  _onRescueReleased(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key || !payload) return;
    if (key === 'swing' && payload.targetId === rescue.ids.rock && rescue.rockReeled === true) {
      rescue.rockReleasedAfterReel = true;
    }
    if (key === 'grab' && payload.targetId === rescue.ids.pod) rescue.podLatched = false;
  },

  _onRescueCut(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key || !payload) return;
    // A cut is a release with intent: same bookkeeping as a release.
    this._onRescueReleased(payload);
  },

  _onRescueBroke(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key || !payload) return;
    // A snapped line is recovery, not failure: the beat stays current, flags reset.
    if (key === 'swing' && payload.targetId === rescue.ids.rock) {
      rescue.rockLatched = false;
      rescue.rockReeled = false;
      rescue.rockReleasedAfterReel = false;
    }
    if (key === 'grab' && payload.targetId === rescue.ids.pod) rescue.podLatched = false;
  },

  // ── Range pointer & funnel (PQ-163.01 — "The Range is the door") ─────────────────────
  _onLatchPointer(payload) {
    const ob = this.state && this.state.onboarding;
    if (!ob || ob.finished) return;
    if (!ob.firstLatchDone) {
      ob.firstLatchDone = true;
      ob.firstLatchAt = this.state.simTime || 0;
      this._emitMilestone('attach', { beat: ob.currentBeat >= 0 ? BEATS[ob.currentBeat].key : null });
      ob.rangePromptActive = true;
      ob.pointedAtRange = true;
      ob.rangePrompt = RANGE_POINTER_LINE;
      if (ob.rescue) {
        ob.rescue.firstLatchDone = true;
        ob.rescue.rangePromptActive = true;
      }
      this.bus.emit('onboarding:rangePrompt', {
        active: true,
        text: RANGE_POINTER_LINE,
        atS: ob.firstLatchAt,
        targetId: payload && payload.targetId,
      });
      this._refreshBeatPanel();
    }
  },

  _onRangeOpened(payload) {
    const ob = this.state && this.state.onboarding;
    if (!ob) return;
    const atS = Number.isFinite(payload && payload.atS) ? payload.atS : (this.state.simTime || 0);
    const fromPrompt = Boolean(payload && payload.fromPrompt);
    ob.rangeOpened = true;
    ob.rangeOpenedAt = atS;
    if (fromPrompt) {
      ob.rangeOpenedFromPrompt = true;
      ob.rangeOpenedFromPromptAt = atS;
      ob.rangePromptActive = false;
      ob.pointedAtRange = false;
    }
    ob.rangeFunnel = {
      opened: true,
      openedAt: atS,
      fromPrompt,
      rungId: (payload && payload.rungId) || null,
      rungIndex: payload && payload.rungIndex != null ? payload.rungIndex : 0,
    };
    if (ob.rescue) {
      ob.rescue.rangeOpened = true;
      ob.rescue.rangeOpenedFromPrompt = fromPrompt;
      ob.rescue.rangeOpenedAt = atS;
      ob.rescue.rangePromptActive = false;
    }
    this._refreshBeatPanel();
  },

  _onRescueWhipImpact(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key || !payload) return;
    // Rock whipped through the derelict: the swing-release payoff, no proximity wait needed.
    if (key === 'swing' && payload.targetId === rescue.ids.rock
      && payload.victimId === rescue.ids.derelict) {
      this._rescueDone('swing');
      return;
    }
    // Any whipped mass that reaches the scout is a shove with a receipt.
    if (key === 'shove' && payload.victimId === rescue.ids.scout) {
      this._emitRescueShove(payload.victimId);
      this._rescueDone('shove');
    }
  },

  _onRescueShoveEvent(payload) {
    const rescue = this._rescue();
    if (!rescue || this._rescueCurrentKey() !== 'shove' || !payload) return;
    if (payload.targetId === rescue.ids.scout) this._rescueDone('shove');
  },

  _onRescueFire(payload) {
    const rescue = this._rescue();
    if (!rescue || this._rescueCurrentKey() !== 'shove' || !payload) return;
    if (payload.ownerId === this.state.playerId) rescue.shoveShots = (rescue.shoveShots || 0) + 1;
  },

  _onRescueKilled(payload) {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !payload || payload.id == null) return;
    // Destroying a beat's working body fails the attempt and stages a fresh one — retry, not
    // wall. A kill before its beat is current only restages the body; it never yanks the rail.
    if (payload.id === rescue.ids.rock) {
      if (key === 'swing') this._rescueFail('swing', 'rock destroyed');
      else this._respawnRescueSlot('swing');
    } else if (payload.id === rescue.ids.pod) {
      if (key === 'grab') this._rescueFail('grab', 'pod destroyed');
      else this._respawnRescueSlot('grab');
    }
  },

  _onRescuePlayerDeath() {
    const key = this._rescueCurrentKey();
    if (!key) return;
    this._rescueFail(key, 'pilot down');
  },

  // Proximity/velocity DONE resolution on the 0.2 s tick. Pure-position reads only.
  _resolveRescueDone() {
    const rescue = this._rescue();
    const key = this._rescueCurrentKey();
    if (!rescue || !key) return;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.pos) return;
    if (key === 'swing') {
      const rock = this._rescueActor('rock');
      const derelict = this._rescueActor('derelict');
      if (!rock || !derelict) { this._rescueFail('swing', 'rock lost'); return; }
      // A rock punted clear of the pocket (a wild release, a chance collision) is gone for
      // good at these speeds: restage it near the pilot — retry, never a wall.
      const playerPos = this.state.entities.get(this.state.playerId);
      if (playerPos && playerPos.pos
        && Math.hypot(rock.pos.x - playerPos.pos.x, rock.pos.z - playerPos.pos.z) > 1800) {
        this._rescueFail('swing', 'rock drifted out of reach');
        return;
      }
      if (!rescue.rockReleasedAfterReel) return;
      if (rescueRockHitDerelict(rock, derelict, RESCUE_ROCK_HIT_MIN_SPEED_WU)) {
        this._dropRescueScrap(derelict);
        this._rescueDone('swing');
        return;
      }
      // Player-scale tolerance: a close shake-down pass at speed also counts — the lesson
      // is cutting the rock across the wreck, and a near-pass shakes it just the same.
      const dWreckRock = Math.hypot(rock.pos.x - derelict.pos.x, rock.pos.z - derelict.pos.z);
      const rockSpeed = Math.hypot(Number(rock.vel && rock.vel.x) || 0, Number(rock.vel && rock.vel.z) || 0);
      if (dWreckRock <= 70 && rockSpeed >= RESCUE_ROCK_HIT_MIN_SPEED_WU) {
        this._dropRescueScrap(derelict);
        this._rescueDone('swing');
      }
    } else if (key === 'shove') {
      const scout = this._rescueActor('scout');
      const asteroid = this._rescueActor('asteroid');
      if (!scout || !asteroid) { this._rescueFail('shove', 'scout lost'); return; }
      if (rescueScoutEscaped(scout, player.pos)) { this._rescueFail('shove', 'scout escaped'); return; }
      if (rescueScoutAtAsteroid(scout, asteroid, RESCUE_SHOVE_PROOF_SPEED_WU)) {
        this._emitRescueShove(scout.id);
        this._rescueDone('shove');
      }
    } else if (key === 'grab') {
      const pod = this._rescueActor('pod');
      const beacon = this._rescueActor('beacon');
      if (!pod || !beacon) { this._rescueFail('grab', 'pod lost'); return; }
      // A pod punted clear of the pocket (ram, stray shot) is unrecoverable where it is:
      // restage it near the pilot — retry, never a wall.
      if (Math.hypot(pod.pos.x - player.pos.x, pod.pos.z - player.pos.z) > 3000) {
        this._rescueFail('grab', 'pod drifted out of reach');
        return;
      }
      const latched = rescue.podLatched
        || rescuePlayerLatchedTo(this.state, this.state.playerId, rescue.ids.pod);
      if (latched) rescue.podLatched = true;
      if (!rescue.podLatched) return;
      // The proof is the DELIVERY: the pod was latched (towed = the work) and now sits in
      // the beacon ring. The old speed>=10 AND at-beacon conjunction pinned a towed pod
      // against the beacon at ~2 wu/s forever — the tow itself is the run.
      if (rescuePodAtBeacon(pod, beacon)) {
        this._rescueDone('grab');
      }
    }
  },

  // The honest shove event the telemetry funnel already listens for: a real shove happened,
  // so firstShoveAt + the shove verb count move like any production shove.
  _emitRescueShove(targetId) {
    this.bus.emit('combat:shove', {
      targetId,
      sourceId: this.state.playerId,
      kind: 'rescue-shove',
      atS: this.state.simTime || 0,
    });
  },

  _rescueDone(key) {
    const rescue = this._rescue();
    if (!rescue || rescue.beats[key].state === 'done') return;
    const atS = this.state.simTime || 0;
    rescue.beats[key].state = 'done';
    rescue.beats[key].doneAt = atS;
    if (rescue.current === key) rescue.current = null;
    rescue.rockLatched = false;
    rescue.rockReeled = false;
    rescue.rockReleasedAfterReel = false;
    if (key !== 'grab') rescue.podLatched = false;
    this.bus.emit('rescue:beat', { ...buildRescueFunnelEvent(key, 'complete', atS), fails: rescue.beats[key].fails });
    this._stampStoreClause(key);
    // The drill's silence gate already keys off the tutorial voice clock, which the rescue
    // line moved — the next drill verb waits its ≥4 s without any extra timer.
    if (rescue.beats.swing.state === 'done'
      && rescue.beats.shove.state === 'done'
      && rescue.beats.grab.state === 'done'
      && !rescue.completed) {
      rescue.completed = true;
      rescue.completedAt = atS;
      const fails = RESCUE_ORDER.reduce((n, k) => n + (rescue.beats[k].fails || 0), 0);
      this.bus.emit('rescue:complete', buildRescueCompleteEvent(atS, fails));
    }
    this._setRescueWaypoint(true);
    this._refreshBeatPanel();
    if (key === 'grab') this._maybeAdvanceMissingThree();
  },

  _rescueFail(key, reason) {
    const rescue = this._rescue();
    if (!rescue || rescue.completed || rescue.beats[key].state === 'done') return;
    // Never yank a different current verb off the rail.
    if (rescue.current && rescue.current !== key) return;
    const atS = this.state.simTime || 0;
    rescue.beats[key].fails = (rescue.beats[key].fails || 0) + 1;
    rescue.beats[key].state = 'current';
    rescue.current = key;
    rescue.rockLatched = false;
    rescue.rockReeled = false;
    rescue.rockReleasedAfterReel = false;
    rescue.podLatched = false;
    rescue.shoveShots = 0;
    this.bus.emit('rescue:beat', {
      ...buildRescueFunnelEvent(key, 'fail', atS),
      fails: rescue.beats[key].fails,
      reason: String(reason || 'lost'),
    });
    // Stage a fresh tableau for the failed beat only: the rock, scout, and pod are the
    // working bodies; the wreck, wall, and beacon stand.
    this._respawnRescueSlot(key);
    // Re-speak the verb once (recovery, not a lecture), then silence.
    const line = rescueBeatLine(key);
    if (this.state.onboarding) this.state.onboarding.beatAction = line;
    this._sayTutorial(line);
    this._setRescueWaypoint(true);
    this._refreshBeatPanel();
  },

  _respawnRescueSlot(key) {
    const st = this.state;
    const rescue = st.onboarding && st.onboarding.rescue;
    if (!rescue || !this.helpers || !this.helpers.spawnEntity) return;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos) return;
    const slot = key === 'swing' ? 'rock' : key === 'shove' ? 'scout' : 'pod';
    const oldId = rescue.ids[slot];
    if (oldId != null && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(oldId);
    }
    const specs = makeRescueCastSpecs(player.pos, () => onboardingRandom(st));
    makeRescueRockTowable(specs.rock);
    const spawned = this.helpers.spawnEntity(specs[slot]);
    rescue.ids[slot] = spawned && spawned.id != null ? spawned.id : null;
  },

  // The vacuum shows itself: swinging the rock through the derelict shakes loose scrap.
  _dropRescueScrap(derelict) {
    const st = this.state;
    if (!derelict || !derelict.pos || !this.helpers || !this.helpers.spawnEntity) return;
    for (let i = 0; i < 2; i++) {
      const ang = onboardingRandom(st) * Math.PI * 2;
      const sp = 12;
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: derelict.pos.x + Math.cos(ang) * 10, z: derelict.pos.z + Math.sin(ang) * 10 },
        vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp },
        radius: 2.2,
        data: { kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1, despawnAt: (st.simTime || 0) + 60 },
      });
    }
  },

  // ── Raid beat (thesis-first route) — the enemy becomes a projectile ──────────────────
  // A real raider is working over a civilian hauler beside the rescue wall. The taught swing
  // applies unchanged: latch the raider, reel, orbit for speed, release at the rock. Whip
  // recoil + tumble contact (masslineImpactDamage, production flags) do the killing; the beat
  // resolves only on that momentum kill. A gun kill restages the raider once — the lesson
  // retries, it never walls; a second refusal resolves the beat and the rail moves on.

  _raid() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.raid && ob.raid.active && !ob.finished ? ob.raid : null;
  },

  _raidActor(slot) {
    const raid = this._raid();
    if (!raid) return null;
    const id = raid.ids && raid.ids[slot];
    if (id == null || !this.state.entities) return null;
    const entity = this.state.entities.get(id);
    return entity && entity.alive !== false ? entity : null;
  },

  _enterRaidBeat() {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob) return;
    // Scenario slices (47-A harness, lab boots) keep their own cast: resolve the beat silently
    // so the drill advances without staging anything.
    if (!ob.rescue) {
      ob.beatDoneAt.raid = st.simTime || 0;
      return;
    }
    ob.raid = {
      active: true,
      enteredAt: st.simTime || 0,
      ids: { raider: null, hauler: null, throwRock: null },
      lastWhipAt: null,
      gunKills: 0,
    };
    this._spawnRaidCast();
  },

  _spawnRaidCast() {
    const st = this.state;
    const raid = this._raid();
    if (!raid || !this.helpers || !this.helpers.spawnEntity) return;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos) return;
    this._removeRaidActors();
    // Reuse the rescue wall's bearing so the release line reads: raider between the player and
    // the big rock, the hauler dressed just off the raider's beam.
    const wall = st.onboarding.rescue && st.onboarding.rescue.ids
      ? st.entities.get(st.onboarding.rescue.ids.asteroid)
      : null;
    const ang = wall && wall.pos
      ? Math.atan2(wall.pos.z - player.pos.z, wall.pos.x - player.pos.x)
      : onboardingRandom(st) * TAU;
    const at = (range, bearing) => ({
      x: player.pos.x + Math.cos(ang + bearing) * range,
      z: player.pos.z + Math.sin(ang + bearing) * range,
    });
    const raiderPos = at(RAID_RAIDER_OFFSET_WU, 0);
    const haulerPos = at(RAID_HAULER_OFFSET_WU, 0.5);
    const raiderSpec = makeEnemySpawnSpec('reaver_pirate', 1, raiderPos, { startedTick: st.tick });
    if (raiderSpec) {
      raiderSpec.name = 'Claim Jumper';
      // Lesson body: real enough to be the fantasy (a hostile mid-raid), tuned so the taught
      // throw kills and a starter-gun refusal is a long deliberate grind.
      raiderSpec.hull = raiderSpec.hullMax = RAID_RAIDER_HULL;
      // Crippled by the ram attempt: a slow drifter the starter hull can actually catch.
      raiderSpec.maxSpeed = 45;
      raiderSpec.combatSpeed = 40;
      // Real mass so the taught throw carries momentum: whip recoil scales with it
      // (momentum = mass x relSpeed), and a near-massless raider shrugs the lesson off.
      raiderSpec.mass = 220;
      raiderSpec.shield = raiderSpec.shieldMax = 0;
      raiderSpec.shieldRegenRate = 0;
      raiderSpec.data = raiderSpec.data || {};
      raiderSpec.data.onboarding = true;
      raiderSpec.data.onboardingRaid = true;
      raiderSpec.data.weapons = [];
      // Dead in space after the ram attempt: no drive (a live AI velocity-drives the
      // hull every tick and cancels any tow), no guns — a drifting hulk to throw.
      raiderSpec.data.ai = {
        ...(raiderSpec.data.ai || {}),
        passive: true, roe: 'hold_fire', spawnContext: 'onboarding_raid', motive: 'crippled',
      };
      const raider = this.helpers.spawnEntity(raiderSpec);
      raid.ids.raider = raider && raider.id != null ? raider.id : null;
    }
    // A throw-target rock right downrange of the raider: the tow pass distance stays short
    // and readable, and the thrown body always has a solid near its release line.
    const throwRock = this.helpers.spawnEntity({
      type: 'asteroid',
      pos: at(RAID_RAIDER_OFFSET_WU + 150, 0),
      vel: { x: 0, z: 0 },
      radius: 26,
      mass: 4000,
      hull: 5000,
      hullMax: 5000,
      physicsBody: { radius: asteroidColliderRadius('ast_raid_throw_rock', 26) },
      data: {
        onboarding: true, raidRole: 'throwRock',
        typeId: 'ast_raid_throw_rock',
      },
    });
    raid.ids.throwRock = throwRock && throwRock.id != null ? throwRock.id : null;
    const hauler = this.helpers.spawnEntity({
      type: 'drone',
      name: 'Nervous Hauler',
      team: 2,
      factionId: 'faction_free',
      pos: haulerPos,
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 260,
      hull: 900,
      hullMax: 900,
      data: {
        weapons: [],
        ai: { passive: true, roe: 'hold_fire', spawnContext: 'onboarding_raid', motive: 'flee' },
        onboarding: true, raidRole: 'hauler',
      },
    });
    raid.ids.hauler = hauler && hauler.id != null ? hauler.id : null;
    raid.lastWhipAt = null;
  },

  _removeRaidActors() {
    const raid = this.state && this.state.onboarding && this.state.onboarding.raid;
    if (!raid || !raid.ids) return;
    const player = this.state && this.state.player;
    for (const slot of Object.keys(raid.ids)) {
      const id = raid.ids[slot];
      if (id != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(id);
      }
      if (player && id != null && player.targetId === id) player.targetId = null;
      raid.ids[slot] = null;
    }
  },

  _onRaidLatched(payload) {
    const raid = this._raid();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!raid || !ob || !beat || beat.key !== 'raid') return;
    if (payload.targetId !== raid.ids.raider) return;
    this._onBeatEvent('raid:latched', payload);
  },

  _onRaidWhipImpact(payload) {
    const raid = this._raid();
    if (!raid) return;
    if (payload.targetId !== raid.ids.raider && payload.victimId !== raid.ids.raider) return;
    raid.lastWhipAt = this.state.simTime || 0;
    // THE THESIS MOMENT: the thrown raider struck the rock as a projectile. A solid or
    // crushing impact on the throw-target rock completes the lesson — the enemy became a
    // projectile, whether or not the hull finally caves.
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!ob || !beat || beat.key !== 'raid') return;
    const wallId = raid.ids.throwRock != null ? raid.ids.throwRock : (ob.rescue && ob.rescue.ids ? ob.rescue.ids.asteroid : null);
    if (payload.victimId !== wallId) return;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return;
    if (!ob.beatDoneAt.raid) {
      this._beatDone(beat);
      this._emitMilestone('momentumKill', { cause: 'throwImpact', rating: payload.rating, beat: 'raid' });
    }
  },

  // A release is the throw: stamp it too, because the fatal tumble impact can kill before
  // masslineImpacts' observer scan emits the whip event for that same contact tick.
  _onRaidReleased(payload) {
    const raid = this._raid();
    if (!raid) return;
    if (payload.targetId !== raid.ids.raider) return;
    const raider = this._raidActor('raider');
    const speed = raider && raider.vel
      ? Math.hypot(Number(raider.vel.x) || 0, Number(raider.vel.z) || 0)
      : 0;
    // A dropped line that barely moved is not a throw; anything genuinely moving counts.
    if (speed < 25) return;
    raid.lastWhipAt = this.state.simTime || 0;
  },

  _onRaidKilled(payload) {
    const raid = this._raid();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!raid || !ob || !beat || beat.key !== 'raid' || !payload) return;
    if (payload.id !== raid.ids.raider) return;
    const credited = payload.killerId === this.state.playerId || payload.ownerId === this.state.playerId;
    if (!credited) { this._respawnRaidRaider('the raider broke off'); return; }
    const now = this.state.simTime || 0;
    const fromThrow = raid.lastWhipAt != null && (now - raid.lastWhipAt) <= RAID_WHIP_KILL_WINDOW_S;
    if (fromThrow) {
      this._beatDone(beat);
      this._emitMilestone('momentumKill', { cause: 'throw', beat: 'raid' });
      return;
    }
    // Gun kill: retry the lesson once; a second refusal resolves the beat — the world moves on.
    raid.gunKills += 1;
    if (raid.gunKills === 1) {
      this._respawnRaidRaider('Another one, then. Latch him this time.');
      return;
    }
    this._beatDone(beat);
    this._emitMilestone('momentumKill', { cause: 'guns', beat: 'raid' });
  },

  _respawnRaidRaider(line) {
    const raid = this._raid();
    if (!raid) return;
    this._spawnRaidCast();
    if (line) {
      this.state.onboarding.beatAction = line;
      this._sayTutorial(line);
    }
    this._refreshBeatPanel();
  },

  _onRaidPlayerDeath() {
    const raid = this._raid();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!raid || !beat || beat.key !== 'raid') return;
    this._respawnRaidRaider('Back in one piece. Latch the raider. Swing him into the rock.');
  },

  _resolveRaidDone() {
    const raid = this._raid();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!raid || !beat || beat.key !== 'raid') return;
    const raider = this._raidActor('raider');
    if (!raider) return; // kill handling is event-driven (_onRaidKilled)
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.pos) return;
    // Tow-slam proof: the raider latched and CARRIED into the throw-target rock at speed.
    // The whip observer only rates energetic contacts; a slow heavy tow that grinds the
    // raider into the rock is the same lesson landing, so accept the plain contact read.
    const tetherMirror = this.state.player && this.state.player.tether;
    const towLatched = !!(tetherMirror && tetherMirror.active && tetherMirror.targetId === raider.id);
    if (towLatched) {
      const wallId = raid.ids.throwRock != null ? raid.ids.throwRock
        : (ob.rescue && ob.rescue.ids ? ob.rescue.ids.asteroid : null);
      const wallEnt = wallId != null && this.state.entities ? this.state.entities.get(wallId) : null;
      if (wallEnt && wallEnt.pos && raider.pos) {
        const towSpeed = Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0);
        const dWallRaider = Math.hypot(raider.pos.x - wallEnt.pos.x, raider.pos.z - wallEnt.pos.z);
        const contact = (Number(raider.radius) || 8) + (Number(wallEnt.radius) || 26) + 40;
        if (dWallRaider <= contact && towSpeed >= 40) {
          this._beatDone(beat);
          this._emitMilestone('momentumKill', { cause: 'towSlam', beat: 'raid' });
          return;
        }
      }
    }
    // A raider that somehow drifts clear restages near the wall — retry, never a wall.
    if (Math.hypot(raider.pos.x - player.pos.x, raider.pos.z - player.pos.z) > 3000) {
      this._respawnRaidRaider('He ran. Follow the diamond and latch him.');
    }
  },

  // ── Claimed beat (thesis-first route) — the wanted consequence, experienced ──────────
  // The wreck's spill is lawfully claimed; a law cutter stands witness. Taking it reports a
  // payload_theft through the real law owner entry; heat (the only heat writer) raises the
  // search ring and the player outruns it. Leaving it is a first-class choice: after
  // CLAIMED_WINDOW_S the tableau stands down and the rail moves on. No walls either way.

  _claimed() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.claimed && ob.claimed.active && !ob.finished ? ob.claimed : null;
  },

  _claimedActor(slot) {
    const claimed = this._claimed();
    if (!claimed) return null;
    const id = claimed.ids && claimed.ids[slot];
    if (id == null || !this.state.entities) return null;
    const entity = this.state.entities.get(id);
    return entity && entity.alive !== false ? entity : null;
  },

  _enterClaimedBeat() {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob) return;
    if (!ob.rescue) {
      ob.beatDoneAt.claimed = st.simTime || 0;
      return;
    }
    ob.claimed = {
      active: true,
      enteredAt: st.simTime || 0,
      ids: { patrol: null, pickups: [] },
      taken: false,
      wantedFired: false,
      clearSince: null,
      resolved: false,
    };
    this._spawnClaimedCast();
  },

  _spawnClaimedCast() {
    const st = this.state;
    const claimed = this._claimed();
    if (!claimed || !this.helpers || !this.helpers.spawnEntity) return;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos) return;
    this._removeClaimedActors();
    // Spill site: ahead of the player, on the raid bearing — the wreck the player just made.
    const raid = st.onboarding.raid;
    const raider = raid && raid.ids && raid.ids.raider != null && st.entities.get(raid.ids.raider);
    const wall = st.onboarding.rescue && st.onboarding.rescue.ids
      ? st.entities.get(st.onboarding.rescue.ids.asteroid)
      : null;
    const anchor = raider && raider.pos ? raider
      : (wall && wall.pos ? wall : player);
    const ang = Math.atan2(anchor.pos.z - player.pos.z, anchor.pos.x - player.pos.x);
    const at = (range, bearing) => ({
      x: player.pos.x + Math.cos(ang + bearing) * range,
      z: player.pos.z + Math.sin(ang + bearing) * range,
    });
    const despawnAt = (st.simTime || 0) + CLAIMED_WINDOW_S + 90;
    for (let i = 0; i < CLAIMED_PICKUP_COUNT; i++) {
      const ang2 = onboardingRandom(st) * TAU;
      const pos = at(150 + i * 14, (i - 1) * 0.12);
      const pickup = this.helpers.spawnEntity({
        type: 'pickup',
        pos,
        vel: { x: Math.cos(ang2) * 3, z: Math.sin(ang2) * 3 },
        radius: 3,
        data: {
          kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 4,
          onboarding: true, claimedCargo: true, despawnAt,
        },
      });
      if (pickup && pickup.id != null) claimed.ids.pickups.push(pickup.id);
    }
    const patrolSpec = makeEnemySpawnSpec('patrol_lawman', 1, at(CLAIMED_WITNESS_OFFSET_WU, 0.35),
      { startedTick: st.tick });
    if (patrolSpec) {
      patrolSpec.name = 'Helios Claims Cutter';
      patrolSpec.team = 1;
      patrolSpec.data = patrolSpec.data || {};
      patrolSpec.data.ai = {
        ...(patrolSpec.data.ai || {}),
        passive: true, roe: 'hold_fire', spawnContext: 'onboarding_claims', lawful: true,
      };
      patrolSpec.data.lawWitness = true;
      patrolSpec.data.onboarding = true;
      patrolSpec.data.claimsCutter = true;
      const patrol = this.helpers.spawnEntity(patrolSpec);
      claimed.ids.patrol = patrol && patrol.id != null ? patrol.id : null;
    }
  },

  _removeClaimedActors() {
    const claimed = this.state && this.state.onboarding && this.state.onboarding.claimed;
    if (!claimed || !claimed.ids) return;
    const player = this.state && this.state.player;
    const patrolId = claimed.ids.patrol;
    if (patrolId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(patrolId);
    }
    if (player && patrolId != null && player.targetId === patrolId) player.targetId = null;
    claimed.ids.patrol = null;
    for (const id of claimed.ids.pickups || []) {
      if (id != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(id);
      }
    }
    claimed.ids.pickups = [];
  },

  _onClaimedPickup(payload) {
    const claimed = this._claimed();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!claimed || !ob || !beat || beat.key !== 'claimed' || claimed.taken) return;
    if (!payload || payload.collectorId !== this.state.playerId) return;
    if (!claimed.ids.pickups.includes(payload.pickupId)) return;
    claimed.taken = true;
    this._onBeatEvent('claimed:taken', payload);
    // Report through the real law owner entry. Law alone decides jurisdiction and witnesses;
    // heat alone consumes an accepted receipt (heat:changed drives the rest of this beat).
    const law = this.registry && this.registry.get && this.registry.get('lawSecurity');
    const reportId = `onboarding:${hash32(String(payload.pickupId), 'claimed')}:payload_theft`;
    const receipt = law && typeof law.reportIncident === 'function'
      ? law.reportIncident({
        reportId,
        kind: 'payload_theft',
        offenderStableId: 'player',
        offenderEntityId: this.state.playerId,
        payloadStableId: `onboarding_claimed:${payload.pickupId}`,
        causalTick: Number.isInteger(this.state.tick) ? Math.max(0, this.state.tick) : 0,
        pos: payload.pos && Number.isFinite(payload.pos.x)
          ? { x: payload.pos.x, z: payload.pos.z }
          : { x: 0, z: 0 },
      })
      : null;
    if (receipt && receipt.accepted === true) return; // heat:changed completes the experience
    // Law declined (witness lost, jurisdiction gone): no crime recognized, no wall — move on.
    this._finishClaimed('reportDenied');
  },

  _onClaimedHeat(payload) {
    const claimed = this._claimed();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!claimed || !ob || !beat || beat.key !== 'claimed') return;
    const level = Number(payload && (payload.level ?? payload.heat ?? payload.wanted));
    if (!Number.isFinite(level)) return;
    if (level > 0) {
      if (!claimed.wantedFired) claimed.wantedFired = true;
      return;
    }
    // Level 0: the search ring cleared. Hold a short grace so a flicker cannot fake the escape.
    if (!claimed.wantedFired) return;
    if (claimed.clearSince == null) claimed.clearSince = this.state.simTime || 0;
  },

  _tickClaimed() {
    const claimed = this._claimed();
    const ob = this.state.onboarding;
    const beat = ob && BEATS[ob.currentBeat];
    if (!claimed || !ob || !beat || beat.key !== 'claimed' || claimed.resolved) return;
    const now = this.state.simTime || 0;
    if (!claimed.wantedFired) {
      // Decline path: the player left the claimed cargo. Stand the tableau down, move on.
      // (A taken cargo with an accepted receipt guarantees the heat event — that state is
      // the wanted experience in progress, never a decline.)
      if (!claimed.taken && now - claimed.enteredAt >= CLAIMED_WINDOW_S) this._finishClaimed('declined');
      return;
    }
    if (claimed.clearSince != null && now - claimed.clearSince >= CLAIMED_CLEAR_GRACE_S) {
      this._finishClaimed('cleared');
    }
  },

  _finishClaimed(how) {
    const claimed = this._claimed();
    const ob = this.state.onboarding;
    if (!claimed || !ob || claimed.resolved) return;
    claimed.resolved = true;
    claimed.active = false;
    const beat = BEATS[ob.currentBeat];
    this._removeClaimedActors();
    if (beat && beat.key === 'claimed') this._beatDone(beat);
    this._emitMilestone('wantedBeat', { how, beat: 'claimed' });
  },

  // ── Missing three (PQ-163.02) — boost, stroke, well in the grab → seam gap ───────────────
  _missingThreeRecord() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.missingThree ? ob.missingThree : null;
  },

  _missingThree() {
    const ob = this.state && this.state.onboarding;
    return ob && ob.missingThree && ob.missingThree.active && !ob.finished ? ob.missingThree : null;
  },

  _missingThreeActor(slot) {
    const three = this._missingThreeRecord();
    if (!three) return null;
    const id = three.ids && three.ids[slot];
    if (id == null || !this.state.entities) return null;
    const entity = this.state.entities.get(id);
    return entity && entity.alive !== false ? entity : null;
  },

  _maybeAdvanceMissingThree() {
    const three = this._missingThree();
    if (!three || three.current || three.completed) return;
    const next = MISSING_THREE_ORDER.find((key) => three.beats[key].state !== 'done');
    if (!next) {
      this._missingThreeAllDone();
      return;
    }
    // The thesis-first route runs the raid + claimed beats between the rescue grab and the
    // movement trio: the wanted consequence is the spine, the missing three follow it.
    const ob = this.state.onboarding;
    if (ob && ob.beatDoneAt.claimed == null) return;
    const prereq = MISSING_THREE_PREREQ[next];
    if (prereq === 'grab') {
      const rescue = this.state.onboarding && this.state.onboarding.rescue;
      if (!rescue || rescue.beats.grab.state !== 'done') return;
    } else if (!three.beats[prereq] || three.beats[prereq].state !== 'done') {
      return;
    }
    if (prereq !== 'grab') {
      const now = this.state.simTime || 0;
      if (now - this._lastTextAtS < SILENCE_S) return;
    }
    this._startMissingThreeBeat(next);
  },

  _startMissingThreeBeat(key) {
    const three = this._missingThree();
    const ob = this.state.onboarding;
    if (!three || !ob || three.beats[key].state === 'done') return;
    const first = !MISSING_THREE_ORDER.some((k) => three.beats[k].state === 'done' || three.beats[k].state === 'current');
    three.current = key;
    three.beats[key].state = 'current';
    three.lastBoost = false;
    three.lastStroke = false;
    if (three.startedAt == null) three.startedAt = this.state.simTime || 0;
    const line = missingThreeBeatLine(key);
    ob.beatAction = line;
    this._sayTutorial(line);
    ob.rangePromptActive = true;
    ob.pointedAtRange = true;
    ob.rangePrompt = RANGE_POINTER_LINE;
    ob.rangePromptRungId = missingThreeRangeRungId(key);
    this.bus.emit('onboarding:rangePrompt', {
      active: true,
      text: RANGE_POINTER_LINE,
      rungId: ob.rangePromptRungId,
      atS: this.state.simTime || 0,
      beat: key,
    });
    if (first) this.bus.emit('firsthour:started', buildFirstHourStartedEvent(this.state.simTime || 0));
    if (key === 'well') this._spawnWellScrap();
    this._setMissingThreeWaypoint(true);
    this._refreshBeatPanel();
  },

  _spawnWellScrap() {
    const st = this.state;
    const three = this._missingThree();
    if (!three || !this.helpers || !this.helpers.spawnEntity) return;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos) return;
    const oldId = three.ids.scrap;
    if (oldId != null && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(oldId);
    }
    const spawned = this.helpers.spawnEntity(makeWellScrapSpec(player.pos));
    three.ids.scrap = spawned && spawned.id != null ? spawned.id : null;
  },

  _removeMissingThreeActors() {
    const three = this.state && this.state.onboarding && this.state.onboarding.missingThree;
    if (!three || !three.ids) return;
    const player = this.state && this.state.player;
    const id = three.ids.scrap;
    if (id != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(id);
    }
    if (player && id != null && player.targetId === id) player.targetId = null;
    three.ids.scrap = null;
  },

  _setMissingThreeWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    const three = this._missingThree();
    if (!three || !three.current || !st.nav) return false;
    const key = three.current;
    const line = missingThreeBeatLine(key);
    let target = null;
    if (key === 'boost') target = this._findBeacon();
    else if (key === 'well') {
      const scrap = this._missingThreeActor('scrap');
      if (scrap) target = { pos: scrap.pos, label: 'Scrap' };
    }
    const existing = st.nav.waypoint;
    if ((!target || !target.pos)) {
      if (existing && existing.onboarding && String(existing.markerId || '').startsWith('missingThree:')) {
        st.nav.waypoint = null;
      }
      return true;
    }
    if (existing && !existing.onboarding && !force) {
      const foreignKind = existing.kind;
      if (foreignKind !== 'mission' && foreignKind !== 'story') return true;
    }
    st.nav.waypoint = {
      onboarding: true,
      pos: { x: target.pos.x, z: target.pos.z },
      label: target.label,
      reason: line,
      markerId: `missingThree:${key}`,
      markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
      mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
    };
    if (ob) ob.beatAction = line;
    return true;
  },

  _noteMissingThreeUses() {
    const three = this._missingThreeRecord();
    if (!three) return;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    const boosting = missingThreeBoosting(this.state, player);
    if (boosting && !three.lastBoost) this._noteVerbUse('boost');
    three.lastBoost = boosting;
    const stroking = missingThreeStrokeActive(this.state.input);
    if (stroking && !three.lastStroke) this._noteVerbUse('stroke');
    three.lastStroke = stroking;
  },

  _noteVerbUse(verb) {
    const ob = this.state && this.state.onboarding;
    const three = this._missingThreeRecord();
    if (!ob || !three || !three.used[verb]) return;
    const atS = this.state.simTime || 0;
    const startedAt = three.startedAt != null ? three.startedAt : (ob.startedAt || 0);
    const withinHour = missingThreeWithinHour(atS, startedAt, FIRST_HOUR_S);
    const current = three.current === verb;
    const taught = three.beats[verb].state === 'done';
    const rec = three.used[verb];
    rec.count += 1;
    if (rec.firstAt == null) rec.firstAt = atS;
    if (current) rec.prompted = true;
    else rec.unprompted = true;
    this.bus.emit('firsthour:verb', buildFirstHourVerbEvent(verb, atS, {
      prompted: current,
      unprompted: !current,
      taught,
      withinHour,
    }));
    this.bus.emit('verb:used', { verb, atS, prompted: current });
    if (current) this._missingThreeDone(verb);
  },

  _onMissingThreeBoostStart(payload) {
    if (payload && this.state.playerId != null && payload.shipId != null && payload.shipId !== this.state.playerId) {
      return;
    }
    const three = this._missingThreeRecord();
    if (!three || three.lastBoost) return;
    this._noteVerbUse('boost');
    three.lastBoost = true;
  },

  _onMissingThreeWell(payload) {
    if (!payload || payload.kind !== 'well') return;
    this._noteVerbUse('well');
    const source = this.state?.entities?.get ? this.state.entities.get(payload.sourceId) : null;
    const isPlayer = payload.isPlayer
      || payload.sourceId === this.state?.playerId
      || (source && source.ownerId === this.state?.playerId)
      || (!payload.npc && !payload.planted && (payload.sourceId == null || payload.sourceId === this.state?.playerId));
    if (isPlayer) {
      this._showHint('firstWellDrop', firstUseLine('firstWellDrop') || 'Well deployed. Pull the scrap.', payload);
    }
  },

  _resolveMissingThreeDone() {
    const three = this._missingThree();
    const key = three && three.current;
    if (!key) return;
    if (key === 'well' && !this._missingThreeActor('scrap')) this._spawnWellScrap();
  },

  _missingThreeDone(key) {
    const three = this._missingThree();
    if (!three || three.beats[key].state === 'done') return;
    const atS = this.state.simTime || 0;
    three.beats[key].state = 'done';
    three.beats[key].doneAt = atS;
    if (three.current === key) three.current = null;
    this.bus.emit('firsthour:beat', { ...buildFirstHourBeatEvent(key, 'complete', atS), fails: three.beats[key].fails });
    this._stampStoreClause(key);
    if (MISSING_THREE_ORDER.every((k) => three.beats[k].state === 'done')) this._missingThreeAllDone();
    this._setMissingThreeWaypoint(true);
    this._refreshBeatPanel();
  },

  _missingThreeAllDone() {
    const three = this._missingThree();
    if (!three || three.completed) return;
    three.completed = true;
    three.completedAt = this.state.simTime || 0;
    three.current = null;
    this.bus.emit('firsthour:complete', buildFirstHourCompleteEvent(three.completedAt));
  },

  _setObjectiveWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob || !ob.active || ob.finished || !st.nav) return;
    // A current rescue verb owns the marker: one verb, one diamond, same beat-stable identity.
    if (this._setRescueWaypoint(force)) return;
    if (this._setMissingThreeWaypoint(force)) return;
    const beat = BEATS[ob.currentBeat];
    const existing = st.nav.waypoint;
    // The raid diamond tracks the raider; the claimed diamond tracks the spill until taken.
    if (beat && beat.key === 'raid') {
      const raid = this._raid();
      const raider = this._raidActor('raider');
      if (!raid || !raider) {
        if (existing && existing.onboarding && String(existing.markerId || '').startsWith('onboarding:raid')) {
          st.nav.waypoint = null;
        }
        return;
      }
      st.nav.waypoint = {
        onboarding: true,
        pos: { x: raider.pos.x, z: raider.pos.z },
        label: 'Raider',
        reason: ob.beatAction || beat.line,
        markerId: 'onboarding:raid',
        markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
        mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
      };
      return;
    }
    if (beat && beat.key === 'claimed') {
      const claimed = this._claimed();
      const wantedFired = claimed && claimed.wantedFired;
      let target = null;
      if (!wantedFired) {
        const pickups = claimed && claimed.ids ? claimed.ids.pickups : [];
        let best = null, bestD = Infinity;
        const p = st.entities && st.entities.get(st.playerId);
        for (const id of pickups || []) {
          const e = id != null && st.entities ? st.entities.get(id) : null;
          if (!e || e.alive === false || !e.pos) continue;
          const d = p && p.pos ? Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) : 0;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) target = { pos: best.pos, label: 'Claimed Cargo' };
      }
      if (!target) {
        if (existing && existing.onboarding && String(existing.markerId || '').startsWith('onboarding:claimed')) {
          st.nav.waypoint = null;
        }
        return;
      }
      st.nav.waypoint = {
        onboarding: true,
        pos: { x: target.pos.x, z: target.pos.z },
        label: target.label,
        reason: ob.beatAction || beat.line,
        markerId: 'onboarding:claimed',
        markerKind: ONBOARDING_OBJECTIVE_MARKER.markerKind,
        mapLabel: ONBOARDING_OBJECTIVE_MARKER.mapLabel,
      };
      return;
    }
    // The B4 flight lesson ends at acceptance. Keep the tutorial state alive for completion/B5,
    // but never reclaim the real delivery's route with the old Helios docking marker.
    if (beat && beat.key === 'dock' && ob.recommendedMissionId) {
      if (st.nav.waypoint && st.nav.waypoint.onboarding) st.nav.waypoint = null;
      return;
    }
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
    const index = this.state.entityIndex;
    const list = (index && index.__spacefaceEntityIndexV1 && index.ready === true
      && Array.isArray(index.radarContacts))
      ? index.radarContacts
      : (this.state.entityList || []);
    let beacon = null;
    for (const e of list) {
      if (!e || !e.alive || !e.pos) continue;
      if (e.type === 'beacon') { beacon = e; break; }
    }
    if (beacon) return { pos: beacon.pos, label: 'Beacon' };
    // Fallback: nearest non-respawning asteroid (the "mass signal").
    const p = this.state.entities.get(this.state.playerId);
    if (!p) return null;
    const mineables = indexedTypeScan(this.state, 'mineables');
    let best = null, bestD = Infinity;
    for (const e of mineables) {
      if (!e || !e.alive || e.type !== 'asteroid' || (e.data && e.data.respawnAt != null)) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? { pos: best.pos, label: 'Beacon' } : null;
  },

  _findHelios() {
    const byStationId = this.state.entityIndex && this.state.entityIndex.byStationId;
    const indexed = byStationId && typeof byStationId.get === 'function'
      && byStationId.get('station_helios');
    if (indexed && indexed.alive && indexed.type === 'station' && indexed.pos) {
      const name = (indexed.data && (indexed.data.name || indexed.data.stationName)) || 'HELIOS';
      return { pos: indexed.pos, label: name };
    }
    const list = indexedTypeScan(this.state, 'stations');
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
  // All DOM surfaces are browser sugar around the sim-side beat FSM; headless hosts (probes,
  // playthrough pilots) run the same state machine with the panel absent.
  _injectStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${PANEL_ID} { position:relative; width:100%; z-index:60; pointer-events:none;
      font-family:var(--hud-body, "IBM Plex Sans", "Segoe UI", system-ui, sans-serif); }
    #ui-root > #${PANEL_ID} { position:absolute; left:20px; top:150px; width:340px; }
    /* J07 de-box (NEXT_JOBS J07 "ink on vacuum"): the onboarding status card was the topmost
       plate in the left stack. Brackets + a per-glyph scrim read the same and spend far less ink. */
    #${PANEL_ID} .sf-ob-card { padding:8px 10px 9px;
      ${deboxCss()} text-shadow:${INK_SHADOW}; }
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
    if (typeof document === 'undefined') return;
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

    // Range pointer affordance (PQ-163.01 — "The Range is the door").
    // After the first latch, onboarding points at the Range (F4).
    if (ob.rangePromptActive) {
      if (!this._rangePromptEl && this._bodyEl) {
        this._rangePromptEl = document.createElement('div');
        this._rangePromptEl.className = 'sf-ob-range-prompt';
        this._rangePromptEl.setAttribute('data-action', 'range');
        this._bodyEl.appendChild(this._rangePromptEl);
      }
      const promptText = ob.rangePrompt || RANGE_POINTER_LINE;
      if (this._rangePromptEl && this._rangePromptEl.textContent !== promptText) {
        this._rangePromptEl.textContent = promptText;
      }
    } else if (this._rangePromptEl) {
      this._rangePromptEl.remove();
      this._rangePromptEl = null;
    }
  },
};

// The swing lesson's rock must be a DYNAMIC body or the tether can never move it:
// physicsAuthority.defaultDynamic only promotes asteroids flagged isChunk/tetherPayload.
// The rescue pod already carries tetherPayload (that is why grab-and-run works); the rock
// gets the same flag so the taught swing is physically possible, not just authored.
function makeRescueRockTowable(rockSpec) {
  if (rockSpec && rockSpec.data) rockSpec.data.tetherPayload = true;
  return rockSpec;
}

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

// The hitch hint teaches riding a latched hull. It gated on the express liner's
// itinerary flag, so the only ship that could teach it was the rarest one — the
// opening mule and every other ship_mule freight frame could never qualify. Any
// passive civilian on the mule hull (hauler, arclight, tanker, shuttle, express)
// is a real ride; the itinerary flag stays as the contract for future
// non-mule hitchable services.
function isHitchHintTarget(entity) {
  const data = entity && entity.data;
  const ai = data && data.ai;
  return !!(entity && entity.alive !== false
    && entity.team === 2
    && data && (data.defId === 'ship_mule'
      || (data.itinerary && data.itinerary.hitchable === true))
    && ai && ai.passive === true);
}
