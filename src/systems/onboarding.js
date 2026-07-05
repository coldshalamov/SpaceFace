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
// STORY OBJECTIVE TRACKER (P2-14): once the 5-step tutorial finishes (or for a returning player on
// load), the same panel slot switches to "story mode" and persistently shows the CURRENT story beat's
// objective + direction hint, read from state.story.beatIndex + STORY_BEATS (data) + BEAT_CONTENT
// (narrative). A player who missed the ephemeral comms toast can always see "what should I do now"
// without opening a menu.

import { STORY_BEATS } from '../data/missions.js';
import { BEAT_CONTENT } from '../data/narrative.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { controlPrompt, currentPromptModality } from '../ui/controlPrompts.js';
import { makeEnemySpawnSpec } from './combat.js';

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
const BEACON_RANGE_WU = 420;  // B0 DONE: within this of the beacon
const TETHER_REEL_MAX_WU = 60;// B1: reel target distance
const SEAM_ORE_TARGET = 3;    // B2 DONE: ore collected
const PIRATE_HULL_FLEE_FRAC = 0.30; // B3: pirate flees at ≤30% hull
const B3_SPAWN_MIN_WU = 1700;       // B3 pirate must telegraph before it can threaten the player
const B3_SPAWN_MAX_WU = 2300;
const B1_DERELICT_OFFSET_WU = 80;   // B1 derelict spawn distance from beacon
const PORT_SAFE_SPAWN_RADIUS_WU = 1200;

const BEATS = [
  { // B0 WAKE (0:00)
    key: 'wake',
    line: 'Contract 47-A: thrust to the beacon.',
    done: 'beaconRange',
  },
  { // B1 THE DERELICT (~1:30) — tether trio
    key: 'derelict',
    line: 'Latch it. G.',
    followups: [
      { on: 'tether:latched', line: 'Winch in. Hold ArrowUp.' },
      { on: 'tether:reelMax', line: 'Cut and coast. G.' },
    ],
    done: 'tether:released',
  },
  { // B2 FIRST SEAM (~3:00) — scan + mine
    key: 'seam',
    line: 'Pulse. C.',
    followups: [
      { on: 'scan:hit', line: 'Beam the bright seams. RMB.' },
    ],
    done: 'oreCollected',
  },
  { // B3 THE SNARE (~5:00) — weak pirate interdicts, flees at 30%, dumps cargo
    key: 'snare',
    line: 'Trouble. Pulse Laser S follows your cursor.',
    done: 'pirateGone',
  },
  { // B4 DOCK (~7:00) — sell flow + ONE recommended contract
    key: 'dock',
    line: 'Helios. E when close.',
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

export const onboarding = {
  name: 'onboarding',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.gamepad = ctx.gamepad;
    this.touch = ctx.touch;
    this._panel = null;
    this._accum = 0;
    this._lastTextAtS = -Infinity;
    this._controlHintsEl = null;
    this._dockControlInRange = false;
    this._gateControlInRange = false;
    this._derelictId = null;
    this._pirateId = null;

    const bus = this.bus;
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
    bus.on('mining:start', () => this._onBeatEvent('mining:start'));
    bus.on('pickup:collected', (p) => this._recordOreCollected(p || {}));
    bus.on('mission:accepted', () => this._onBeatEvent('mission:accepted'));
    bus.on('ship:purchased', () => this._onBeatEvent('mission:accepted'));

    // ── First-hour beat events (spec2/03) ─────────────────────────────────────────────────
    bus.on('tether:latched', () => this._onBeatEvent('tether:latched'));
    bus.on('tether:released', () => this._onBeatEvent('tether:released'));
    bus.on('tether:broke', () => this._onBeatEvent('tether:released'));
    bus.on('scan:pulse', () => this._onBeatEvent('scan:hit'));
    bus.on('entity:killed', (p) => this._onBeatKill(p || {}));

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
        'Shields down! Disengage and stay clear of fire — shields recharge automatically after a few seconds.');
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
        'Cargo hold full! Dock at a station to audit or sell the sample and free up space.');
    });

    // ── Mid/late-game system onboarding (P1-10) ─────────────────────────────────────────────
    // The 5-step tutorial covers flight + first dock/sell, but drill-mining, outfitting, the tech
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
        'Station hub: use the left rail for Market, Missions, Services, Shipyard, Outfitting, Manufacture, Factions, and Bar. First loop: sell the sample, accept one low-risk job, then undock when Departure Check looks safe.');
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
    if (!st.player.hints) st.player.hints = {};
    if (st.player.hints[key]) return;
    st.player.hints[key] = true;
    this.bus.emit('toast', { text, kind: 'info', ttl: 7 });
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
      pirateFled: false,          // B3: pirate fled (vs dead) — still counts as DONE
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
    this._refreshStory();
  },

  _teardown() {
    const ob = this.state.onboarding; if (ob) ob.active = false;
    if (this._panel) { this._panel.remove(); this._panel = null; }
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
    this.bus.emit('toast', { text, kind: 'info', ttl: 6 });
  },

  // Try to advance to the next beat if the silence gate has passed since the previous beat's DONE.
  // Called from update(). Fires the new beat's entry line + spawns the beat's world content.
  _tryAdvanceBeat() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const nextIndex = ob.currentBeat + 1;
    if (nextIndex >= BEATS.length) return;
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
    this._sayTutorial(beat.line);
    this._enterBeat(beat);
    this._refreshBeatPanel();
  },

  // Spawn the world content for a beat on entry (derelict for B1, pirate for B3, etc).
  _enterBeat(beat) {
    if (!beat) return;
    if (beat.key === 'derelict') this._spawnDerelict();
    else if (beat.key === 'snare') this._spawnPirate();
    else if (beat.key === 'dock') this._setObjectiveWaypoint(true);
    else if (beat.key === 'choice') this._openChoice();
  },

  // Route a gameplay event to the current beat's followups + DONE resolution.
  _onBeatEvent(eventName, payload) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat) return;
    // Followup barks (fire once per beat).
    for (const fu of (beat.followups || [])) {
      if (fu.on !== eventName) continue;
      const fkey = beat.key + ':' + fu.on;
      if (ob.firedFollowups[fkey]) continue;
      ob.firedFollowups[fkey] = true;
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
    if (done === 'tether:released' && (eventName === 'tether:released')) {
      resolved = true;
      this._dropDerelictSalvage();
    } else if (done === 'mission:accepted' && eventName === 'mission:accepted') {
      resolved = true; // B5: accepting any offer ends the tutorial
    } else if (done === 'recommendSurfaced' && eventName === 'sold') {
      // B4 DONE = the player sold the haul, which surfaces the board's one recommended contract.
      // The "Board's got one job for you." followup bark fires on this same event (just above).
      resolved = true;
    } else if (done === 'pirateGone') {
      // handled in _onBeatKill (pirate dead) + _checkPirateFlee (pirate fled at ≤30%)
      if (ob.pirateFled) resolved = true;
    }
    // beaconRange / oreCollected are resolved in update() (proximity) / _recordOreCollected.
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
    // Count any ore the player collects while on/after the seam beat (B2). The pickup may also fire
    // for the B1 salvage — that's fine, only the seam beat's DONE cares about the count.
    if (p.collectorId != null && p.collectorId !== this.state.playerId) return;
    if (!this._isOre(p.commodityId)) return;
    ob.oreCollected = (ob.oreCollected || 0) + Math.max(1, p.qty || p.amount || 1);
    const beat = BEATS[ob.currentBeat];
    if (beat && beat.done === 'oreCollected' && ob.oreCollected >= SEAM_ORE_TARGET) {
      this._beatDone(beat);
    }
    this._refreshBeatPanel();
  },

  // B3: handle the pirate's death (player killed it) or the player's death (respawn — no spiral).
  _onBeatKill(p) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat || beat.key !== 'snare') return;
    // Pirate dead → B3 DONE.
    if (ob._pirateId != null && p.id === ob._pirateId) {
      this._beatDone(beat);
      return;
    }
  },

  _finish() {
    const ob = this.state.onboarding; if (!ob) return;
    ob.finished = true;
    ob.active = false; // tutorial mode ends permanently (spec2/03 B5)
    this._clearObjectiveWaypoint();
    // Tell the story system the tutorial is over so it can release the deferred cold-start voice.
    this.bus.emit('tutorial:finished', {});
    // Transition the panel into STORY MODE (P2-14): it now persistently shows the current story beat
    // objective so the player always knows what to do next.
    this._storyMode = true;
    this._refreshStory();
  },

  // Story-mode objective tracker (P2-14). Reuses the onboarding panel slot to persistently show the
  // current story beat's objective + direction hint. Called once on tutorial finish / save load, and
  // refreshed each frame in update() so it tracks beatIndex as the player progresses.
  _ensureStoryPanel() {
    if (this._panel && this._storyMode) return this._panel;
    this._injectStyle();
    this._buildPanel();
    // Hide the step dots in story mode (they're tutorial-specific); show the objective body only.
    const steps = this._panel.querySelector('.sf-ob-steps');
    if (steps) steps.style.display = 'none';
    const count = this._panel.querySelector('.sf-ob-count');
    if (count) count.textContent = '';
    const kicker = this._panel.querySelector('.sf-ob-kicker span');
    if (kicker) kicker.textContent = 'Story';
    this._storyMode = true;
    return this._panel;
  },

  _refreshStory() {
    if (!this._storyMode) return;
    const panel = this._ensureStoryPanel();
    if (!panel) return;
    const body = panel.querySelector('.sf-ob-body');
    if (!body) return;
    const beat = (this.state.story && this.state.story.beatIndex) || 0;
    const sb = STORY_BEATS[beat];
    // The concrete objective (data/missions.js STORY_BEATS) is the actionable "what to do"; the
    // narrative BEAT_CONTENT.hint is the in-world Captain's Log voice shown as flavor underneath.
    const content = BEAT_CONTENT[beat];
    const objective = (sb && sb.objective) || '';
    const hint = (content && content.hint) || '';
    const sig = `${beat}\u0001${objective}\u0001${hint}`;
    if (sig === this._storySig) return;
    this._storySig = sig;
    if (!sb) { body.innerHTML = ''; return; }
    body.innerHTML = '';
    const titleEl = document.createElement('div');
    titleEl.className = 'sf-ob-title';
    titleEl.textContent = objective;
    body.appendChild(titleEl);
    if (hint) {
      const flavorEl = document.createElement('div');
      flavorEl.className = 'sf-ob-flavor';
      flavorEl.textContent = hint;
      body.appendChild(flavorEl);
    }
  },

  // per-frame: proximity check for the starter claim + panel fade-out + contextual hints + control bar.
  update(dt, state) {
    // ── First-flight hint (runs independently of the tutorial chain) ──────────────────────
    if (this._firstFlightPending && state.mode === 'flight') {
      this._firstFlightTimer += dt;
      if (this._firstFlightTimer > 3.0) {
        this._firstFlightPending = false;
        this._showHint('firstFlight',
          controlPrompt('firstFlight', this._promptModality()));
      }
    }

    // ── Contextual control bar ───────────────────────────────────────────────────────────
    try { this._updateControlBar(state); } catch (_) { /* non-critical */ }

    // ── Story objective tracker (P2-14) — persists after the tutorial finishes ───────────
    // Refresh the story panel each frame so it tracks beatIndex. Throttled like the tutorial path.
    if (this._storyMode && state.mode === 'flight') {
      this._storyAccum = (this._storyAccum || 0) + dt;
      if (this._storyAccum >= 0.5) { this._storyAccum = 0; this._refreshStory(); }
    }

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
      this._checkPirateFlee();
      this._setObjectiveWaypoint(false);
    } catch (_) { /* never let onboarding break the loop */ }
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

  // Resolve DONE conditions that depend on proximity (B0 beacon range), polled each update tick.
  _resolveProximityDone() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat || ob.beatDoneAt[beat.key] != null) return;
    if (beat.done === 'beaconRange') {
      const t = this._findBeacon();
      const p = this.state.entities.get(this.state.playerId);
      if (t && p && t.pos) {
        const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
        if (dx * dx + dz * dz <= BEACON_RANGE_WU * BEACON_RANGE_WU) this._beatDone(beat);
      }
    }
  },

  // B1: spawn a derelict wreck near the beacon for the tether trio (latch/winch/cut).
  _spawnDerelict() {
    const st = this.state;
    const beacon = this._findBeacon();
    if (!beacon || !beacon.pos || !this.helpers || !this.helpers.spawnEntity) return;
    // Offset from the beacon so the player learns to fly+latch, not spawn-dock.
    const ang = onboardingRandom(st) * TAU;
    const pos = {
      x: beacon.pos.x + Math.cos(ang) * B1_DERELICT_OFFSET_WU,
      z: beacon.pos.z + Math.sin(ang) * B1_DERELICT_OFFSET_WU,
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

  // B3: spawn a weak pirate at standoff range; it must telegraph before it can threaten the player.
  _spawnPirate() {
    const st = this.state;
    const player = st.entities && st.entities.get(st.playerId);
    if (!player || !player.pos) return;
    if (typeof makeEnemySpawnSpec !== 'function' || !this.helpers || !this.helpers.spawnEntity) return;
    const pos = this._tutorialHostileSpawnPos(player);
    if (!pos) return;
    // Weak: level 1 reaver_pirate (pirate archetype). Reduced hull so it reads as a tutorial foe.
    const spec = makeEnemySpawnSpec('reaver_pirate', 1, pos);
    if (spec) {
      spec.data = spec.data || {};
      spec.data.ai = spec.data.ai || {};
      spec.data.ai.spawnContext = 'tutorial_pirate';
      spec.hull = spec.hullMax = Math.round((spec.hullMax || 80) * 0.6);
      const pirate = this.helpers.spawnEntity(spec);
      if (pirate) {
        this._pirateId = pirate.id;
        const ob = st.onboarding;
        if (ob) ob._pirateId = pirate.id;
      }
    }
  },

  _tutorialHostileSpawnPos(player) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = onboardingRandom(this.state) * TAU;
      const r = B3_SPAWN_MIN_WU + onboardingRandom(this.state) * (B3_SPAWN_MAX_WU - B3_SPAWN_MIN_WU);
      const pos = {
        x: player.pos.x + Math.cos(ang) * r,
        z: player.pos.z + Math.sin(ang) * r,
      };
      if (this._outsidePortSafety(pos)) return pos;
    }
    return null;
  },

  _outsidePortSafety(pos) {
    const active = this.state.world && this.state.world.activeSector || {};
    const tooClose = (anchor, radius = PORT_SAFE_SPAWN_RADIUS_WU) => {
      if (!anchor || !anchor.pos) return false;
      const dx = pos.x - anchor.pos.x;
      const dz = pos.z - anchor.pos.z;
      return dx * dx + dz * dz < radius * radius;
    };
    for (const station of active.stations || []) {
      const dataRadius = station && station.data && Number(station.data.dockRadius);
      const radius = Math.max(PORT_SAFE_SPAWN_RADIUS_WU, Number.isFinite(dataRadius) ? dataRadius + 900 : 0);
      if (tooClose(station, radius)) return false;
    }
    for (const gate of active.gates || []) {
      if (tooClose(gate, 1000)) return false;
    }
    return true;
  },

  // B3: check if the pirate should flee at ≤30% hull (dumping cargo). Once flagged, it's DONE.
  _checkPirateFlee() {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished || ob.pirateFled) return;
    if (this._pirateId == null) return;
    const beat = BEATS[ob.currentBeat];
    if (!beat || beat.key !== 'snare') return;
    const pirate = this.state.entities && this.state.entities.get(this._pirateId);
    if (!pirate || !pirate.alive) return;
    if ((pirate.hull / (pirate.hullMax || 1)) <= PIRATE_HULL_FLEE_FRAC) {
      ob.pirateFled = true;
      // Force the AI to flee + dump cargo (the interdiction ends; no death required).
      if (pirate.data && pirate.data.ai) {
        pirate.data.ai.forceFlee = true;
      }
      this.bus.emit('loot:drop', { pos: { x: pirate.pos.x, z: pirate.pos.z }, credits: 0, items: [{ id: 'cmdty_stolen_goods', qty: 2 }] });
      const fresh = BEATS[ob.currentBeat];
      if (fresh && fresh.done === 'pirateGone') this._beatDone(fresh);
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
    // B0/B1 point at the beacon; B4 points at Helios station; others clear the onboarding waypoint.
    let target = null;
    if (beat && (beat.key === 'wake' || beat.key === 'derelict')) target = this._findBeacon();
    else if (beat && beat.key === 'dock') target = this._findHelios();
    if (!target || !target.pos) {
      if (existing && existing.onboarding) st.nav.waypoint = null;
      return;
    }
    st.nav.waypoint = {
      onboarding: true,
      pos: { x: target.pos.x, z: target.pos.z },
      label: target.label || (beat && beat.line) || 'Objective',
    };
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
    el.innerHTML = '<div class="sf-ob-card"><div class="sf-ob-kicker"><span>Objective</span><span class="sf-ob-count"></span></div>'
      + '<div class="sf-ob-body"></div><div class="sf-ob-steps"></div></div>';
    root.appendChild(el);
    this._panel = el;
  },

  // Render the current beat into the objective panel (the one-verb line + progress for B2).
  _refreshBeatPanel() {
    if (!this._panel || this._storyMode) return;
    const ob = this.state.onboarding; if (!ob) return;
    const beat = BEATS[ob.currentBeat];
    const idx = ob.currentBeat < 0 ? -1 : ob.currentBeat;
    const body = this._panel.querySelector('.sf-ob-body');
    const count = this._panel.querySelector('.sf-ob-count');
    const steps = this._panel.querySelector('.sf-ob-steps');
    if (count) count.textContent = (idx >= 0 ? (idx + 1) : 0) + ' / ' + BEATS.length;
    if (body && beat) {
      body.innerHTML = '';
      const titleEl = document.createElement('div');
      titleEl.className = 'sf-ob-title';
      titleEl.textContent = beat.line || '';
      body.appendChild(titleEl);
      // B2 shows 47-A sample collection progress.
      if (beat.key === 'seam') {
        const progressEl = document.createElement('div');
        progressEl.className = 'sf-ob-progress';
        progressEl.textContent = 'SAMPLE: ' + Math.min(ob.oreCollected || 0, SEAM_ORE_TARGET) + ' / ' + SEAM_ORE_TARGET;
        body.appendChild(progressEl);
      }
    }
    if (steps) {
      steps.innerHTML = '';
      BEATS.forEach((b, i) => {
        const d = document.createElement('div');
        const isDone = ob.beatDoneAt[b.key] != null;
        d.className = 'sf-ob-dot' + (isDone ? ' done' : (i === idx ? ' curr' : ''));
        steps.appendChild(d);
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
