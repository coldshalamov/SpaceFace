// PQ-195.02 — the capture fork's read instrument (the D5 contextual-instrument ruling).
//
// WHAT THIS IS: the ordinary flight HUD's bottom-left contextual column (.sf-leftcontext) gains ONE
// transient entry while the player is towing or bringing the SP-07 load toward the catcher fork. It
// reports, in words: the load's identity, the approach speed against the fork's 100 WU/s limit, the
// mouth alignment, and the capture kernel's own phase. A player who never read a word of the packet
// aborts a too-fast approach because the instrument said so, not because a colour changed.
//
// WHAT THIS IS NOT: a fourth permanent HUD anchor. The instrument is created by the always-mounted
// hud.js (the createPowerRail pattern), mounts its own subtree INTO the existing contextual column,
// and fully detaches that subtree when the situation is not live. It is not the packet lab's
// standalone load card, it never uses promptDeck (this is continuous state, not a decision), and it
// never opens a voice channel — the one-voice cue lines stay owned by heistMissionRuntime.
//
// OWNERSHIP: read-only. It reads state.heistFacilities (schedule + the kernel's capture state), the
// load entity and the authored fork geometry. It writes only its own DOM subtree and never touches
// sim state, the bus, credits or custody. Headless-guarded: with no document every DOM path is a
// no-op, and the pure read model runs in Node for the focused test.
//
// GRAMMAR: every state reads from text alone; colour only ever reinforces. The kernel phases are
// mechanical substates, so they are translated into the §5 interface vocabulary and never printed
// raw. No animation, so reduced-motion needs no variant; the reduced-motion/flash classes are still
// set from the shared accessibility flags so the surface is honest about the settings it honors.

import { getMotionReduced, getFlashReduced } from './accessibility.js';
import {
  BREAKAWAY_CAPTURE_FORK,
  BREAKAWAY_SP07,
  PQ019_HEIST_SECTOR_ID,
  heistLaunchVariant,
  projectBreakawayForkMouth,
} from '../data/heistFacilities.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

const STYLE_ID = 'sf-fork-inst-css';

/**
 * The approach region, in WU from the fork mouth. Beyond this the fork is not the player's problem
 * yet and the instrument stays away; inside it (or on the line, or inside the bay) it reveals.
 */
export const FORK_INSTRUMENT_RANGE_WU = 400;

/**
 * Player-facing vocabulary (design/program/roadmap/active/PQ-195-design/03_ART_AND_SOUND.md §5).
 * Every entry is words a pilot would say. No FSM id, no receipt id, no colour-only signal.
 */
export const FORK_INSTRUMENT_COPY = Object.freeze({
  kicker: 'CATCHER FORK',
  transit: 'Assembly in transit',
  coupled: 'Load coupled',
  braking: 'Arresting load',
  settling: 'Verifying custody',
  // `ready` is a fresh custody CANDIDATE; the arbiter still decides. It must not claim the deal.
  ready: 'Verifying custody',
  tooFast: (limit) => `Approach at ${limit} WU/s or less`,
  offMouth: 'Come through the open end',
  lost: 'Bring the assembly around again',
  aligned: 'Lined up with the open end',
  offCentre: 'Off the mouth centre-line',
  inBay: 'In the fork bay',
  guideSlow: 'Slow the assembly before contact',
  guideLineUp: 'Line the assembly up with the mouth',
  guideRecover: 'Recover it and try the approach again',
  guideApproach: 'Bring it through the open end under 100 WU/s',
});

let _receiverCache = null;

/**
 * World-space receiver geometry for a fork, derived from the same authored socket projection the
 * facility owner samples (`heistFacilities._forkReceiver`). Deriving here rather than duplicating
 * numbers is what keeps the instrument's mouth agreement with the machine.
 */
export function forkReceiverWorld(fork = BREAKAWAY_CAPTURE_FORK) {
  if (_receiverCache && _receiverCache.id === fork.id) return _receiverCache;
  const mouth = projectBreakawayForkMouth(fork);
  const world = sectorLocalToGlobalForSector({ x: mouth.x, z: mouth.z }, PQ019_HEIST_SECTOR_ID);
  _receiverCache = Object.freeze({
    id: fork.id,
    x: world.x,
    z: world.z,
    nx: mouth.nx,
    nz: mouth.nz,
    halfWidth: fork.halfWidth,
    depth: fork.depth,
    maxEntrySpeed: fork.maxEntrySpeed,
  });
  return _receiverCache;
}

/**
 * The pure classifier — the whole meaning of the instrument, DOM-free.
 *
 * Precedence is the one-voice rule applied to a continuous surface: an actionable refusal outranks a
 * recovery outranks a status. A too-fast approach always says to slow down BEFORE any contact; an
 * off-centre approach always says to come through the open end; a load that slipped back out says to
 * bring it around again. `aligned` is true only when the whole body clears the rails.
 */
export function classifyForkInstrument(input = {}) {
  const phase = typeof input.phase === 'string' ? input.phase : 'outside';
  const speedLimit = Number.isFinite(input.speedLimit) ? input.speedLimit : BREAKAWAY_CAPTURE_FORK.maxEntrySpeed;
  const halfWidth = Number.isFinite(input.halfWidth) ? input.halfWidth : BREAKAWAY_CAPTURE_FORK.halfWidth;
  const radius = Number.isFinite(input.radius) ? input.radius : BREAKAWAY_SP07.radius;
  const speed = Number.isFinite(input.speed) ? input.speed : 0;
  const lateral = Number.isFinite(input.lateral) ? input.lateral : 0;
  const entryCount = Number.isInteger(input.entryCount) ? input.entryCount : 0;
  const tethered = !!input.tethered;
  const tooFast = speed > speedLimit + 1e-9;
  const aligned = Math.abs(lateral) + radius <= halfWidth + 1e-9;

  if (phase === 'outside') {
    if (tooFast) {
      return { statusKey: 'too_fast', statusWord: FORK_INSTRUMENT_COPY.tooFast(speedLimit), guidanceWord: FORK_INSTRUMENT_COPY.guideSlow, tooFast, aligned };
    }
    if (entryCount > 0) {
      return { statusKey: 'lost', statusWord: FORK_INSTRUMENT_COPY.lost, guidanceWord: FORK_INSTRUMENT_COPY.guideRecover, tooFast, aligned };
    }
    if (!aligned) {
      return { statusKey: 'off_mouth', statusWord: FORK_INSTRUMENT_COPY.offMouth, guidanceWord: FORK_INSTRUMENT_COPY.guideLineUp, tooFast, aligned };
    }
    if (tethered) {
      return { statusKey: 'coupled', statusWord: FORK_INSTRUMENT_COPY.coupled, guidanceWord: FORK_INSTRUMENT_COPY.guideApproach, tooFast, aligned };
    }
    return { statusKey: 'transit', statusWord: FORK_INSTRUMENT_COPY.transit, guidanceWord: FORK_INSTRUMENT_COPY.guideApproach, tooFast, aligned };
  }
  if (phase === 'braking') {
    return { statusKey: 'braking', statusWord: FORK_INSTRUMENT_COPY.braking, guidanceWord: null, tooFast, aligned };
  }
  if (phase === 'settling' || phase === 'ready') {
    return { statusKey: 'settling', statusWord: FORK_INSTRUMENT_COPY.settling, guidanceWord: null, tooFast, aligned };
  }
  // An unknown future phase still renders as words, never as a raw id.
  return { statusKey: 'transit', statusWord: FORK_INSTRUMENT_COPY.transit, guidanceWord: FORK_INSTRUMENT_COPY.guideApproach, tooFast, aligned };
}

/**
 * The live read model, or null when the fork is not the player's situation right now.
 *
 * Live means: flight, a launched capture-fork variant with its real load present, and the load is
 * tethered, already in the machine, or inside the approach region. Everything else collapses to
 * null so the instrument unmounts.
 */
export function forkInstrumentModel(state) {
  if (!state || state.mode !== 'flight') return null;
  if (state.ui && state.ui.docked) return null;
  const sector = state.world && state.world.currentSectorId;
  if (sector && sector !== PQ019_HEIST_SECTOR_ID) return null;

  const owned = state.heistFacilities;
  const schedule = owned && owned.schedule;
  if (!schedule || !schedule.scheduleId) return null;
  const variant = heistLaunchVariant(schedule.variantId);
  if (!variant || variant.custody !== 'capture_fork' || !variant.fork) return null;

  const entities = state.entities;
  const load = entities && typeof entities.get === 'function'
    ? entities.get(schedule.capsuleEntityId)
    : null;
  if (!load || load.alive === false || !load.pos) return null;

  const receiver = forkReceiverWorld(variant.fork);
  const dx = load.pos.x - receiver.x;
  const dz = load.pos.z - receiver.z;
  const depth = dx * receiver.nx + dz * receiver.nz;
  const lateral = -dx * receiver.nz + dz * receiver.nx;
  const vx = Number.isFinite(load.vel && load.vel.x) ? load.vel.x : 0;
  const vz = Number.isFinite(load.vel && load.vel.z) ? load.vel.z : 0;
  const speed = Math.hypot(vx, vz);

  const capture = owned.capture;
  const phase = capture && typeof capture.phase === 'string' ? capture.phase : 'outside';
  const entryCount = capture && Number.isInteger(capture.entryCount) ? capture.entryCount : 0;

  // The tether mirror lives on state.player (the player-state record), not on the player entity —
  // same consumer seam hud.js uses for the tow readout.
  const tether = state.player && state.player.tether;
  const tethered = !!(tether && tether.active && tether.targetId === load.id);
  const acquired = phase !== 'outside';
  const distance = Math.hypot(dx, dz);
  if (!acquired && !tethered && distance > FORK_INSTRUMENT_RANGE_WU) return null;

  const radius = Number.isFinite(load.radius) ? load.radius : variant.payload.radius;
  const cls = classifyForkInstrument({
    phase,
    speed,
    speedLimit: receiver.maxEntrySpeed,
    lateral,
    halfWidth: receiver.halfWidth,
    radius,
    tethered,
    entryCount,
  });

  const alignmentWord = acquired ? FORK_INSTRUMENT_COPY.inBay
    : (cls.aligned ? FORK_INSTRUMENT_COPY.aligned : FORK_INSTRUMENT_COPY.offCentre);
  const speedText = `${Math.round(speed)} / ${receiver.maxEntrySpeed} WU/s`;
  const ariaLabel = `${variant.payload.name}. ${cls.statusWord}. ${speedText}. ${alignmentWord}`;

  return Object.freeze({
    loadId: load.id,
    identity: variant.payload.name,
    phase,
    tethered,
    acquired,
    depth,
    lateral,
    distance,
    speed,
    speedLimit: receiver.maxEntrySpeed,
    speedText,
    aligned: cls.aligned,
    tooFast: cls.tooFast,
    statusKey: cls.statusKey,
    statusWord: cls.statusWord,
    guidanceWord: cls.guidanceWord,
    alignmentWord,
    ariaLabel,
  });
}

/**
 * The DOM controller. `mount(host)` names the existing contextual column; `update(state)` attaches
 * exactly one entry while `forkInstrumentModel` is live and detaches it when it is not.
 */
export function createForkInstrument() {
  return {
    host: null,
    root: null,
    _nodes: null,
    _sig: '',

    mount(host) {
      this.host = host || this.host;
      return this;
    },

    get mounted() {
      return !!(this.root && this.root.parentNode);
    },

    update(state) {
      if (typeof document === 'undefined') return null;
      const model = forkInstrumentModel(state);
      if (!model) {
        this._detach();
        return null;
      }
      const nodes = this._ensureDom();
      if (!nodes) return null;
      this._attach();
      this._paint(nodes, model, state);
      return model;
    },

    destroy() {
      this._detach();
      this.root = null;
      this._nodes = null;
      this._sig = '';
      this.host = null;
    },

    _attach() {
      if (!this.host || !this.root) return;
      if (this.root.parentNode !== this.host) this.host.appendChild(this.root);
    },

    _detach() {
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    },

    _paint(nodes, model, state) {
      const reducedMotion = getMotionReduced()
        || !!(state.settings && state.settings.video && state.settings.video.motionReduce);
      const reducedFlash = getFlashReduced()
        || !!(state.settings && state.settings.accessibility && state.settings.accessibility.flashReduce);
      const sig = [
        model.identity, model.statusWord, model.speedText, model.alignmentWord,
        model.guidanceWord || '', model.tooFast ? 'fast' : 'ok', reducedMotion ? 'rm' : 'full',
        reducedFlash ? 'rf' : 'ff',
      ].join('|');
      if (sig === this._sig) return;
      this._sig = sig;

      nodes.title.textContent = model.identity;
      nodes.status.textContent = model.statusWord;
      nodes.speed.textContent = model.speedText;
      nodes.align.textContent = model.alignmentWord;
      if (model.guidanceWord) {
        nodes.guidance.textContent = model.guidanceWord;
        nodes.guidance.hidden = false;
      } else {
        nodes.guidance.hidden = true;
      }
      // Colour only ever reinforces the words: a too-fast or off-centre approach is louder, never
      // the only channel.
      const caveat = !model.acquired && (model.tooFast || !model.aligned);
      nodes.root.className = 'sf-fork-inst'
        + (caveat ? ' sf-fork-inst--caution' : '')
        + (reducedMotion ? ' sf-fork-inst--reduced-motion' : '')
        + (reducedFlash ? ' sf-fork-inst--reduced-flash' : '');
      nodes.root.setAttribute('aria-label', model.ariaLabel);
    },

    _ensureDom() {
      if (this.root) return this._nodes;
      this._injectCss();
      const root = document.createElement('div');
      root.className = 'sf-fork-inst';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');

      const make = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text != null) el.textContent = text;
        root.appendChild(el);
        return el;
      };
      const kicker = make('div', 'sf-fork-inst__kicker', FORK_INSTRUMENT_COPY.kicker);
      const title = make('div', 'sf-fork-inst__title');
      const status = make('div', 'sf-fork-inst__status');
      const row = make('div', 'sf-fork-inst__row');
      const speed = document.createElement('span');
      speed.className = 'sf-fork-inst__speed';
      row.appendChild(speed);
      const align = make('div', 'sf-fork-inst__align');
      const guidance = make('div', 'sf-fork-inst__guidance');
      guidance.hidden = true;

      this.root = root;
      this._nodes = { root, kicker, title, status, speed, align, guidance };
      return this._nodes;
    },

    _injectCss() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      // Own lease: this block styles only .sf-fork-inst*. It never redefines a shared selector.
      style.textContent = `
  .sf-fork-inst { display:flex; flex-direction:column; gap:4px; min-width:210px;
    padding:9px 11px; border-left:2px solid var(--sf-edge);
    background:rgba(6,12,22,.62); color:var(--sf-paper); }
  .sf-fork-inst--caution { border-left-color:var(--sf-foe); }
  .sf-fork-inst__kicker { font-family:var(--sf-subhead-face); font-weight:600; font-size:12px;
    letter-spacing:.08em; text-transform:uppercase; color:var(--sf-calm); }
  .sf-fork-inst__title { font-family:var(--sf-subhead-face); font-weight:600; font-size:13px;
    color:var(--sf-paper); }
  .sf-fork-inst__status { font-family:var(--sf-data-face); font-weight:600; font-size:13px;
    color:var(--sf-goal, #e3a13d); }
  .sf-fork-inst--caution .sf-fork-inst__status { color:var(--sf-foe); }
  .sf-fork-inst__row { display:flex; align-items:baseline; gap:8px; }
  .sf-fork-inst__speed { font-family:var(--sf-data-face); font-weight:500; font-size:12px;
    font-variant-numeric:tabular-nums; color:var(--sf-paper); }
  .sf-fork-inst__align { font-family:var(--sf-subhead-face); font-weight:500; font-size:12px;
    color:var(--sf-calm); }
  .sf-fork-inst__guidance { font-family:var(--sf-subhead-face); font-weight:500; font-size:12px;
    color:var(--sf-paper); }
  /* No animation or transition anywhere: the surface is static text, so reduced-motion has nothing
     to suppress and reduced-flash has no strobe to dull. The classes only record the honored setting. */
  @media (forced-colors: active) {
    .sf-fork-inst { background:Canvas; border-left:2px solid CanvasText; }
  }
  @media (max-width: 900px) {
    .sf-fork-inst { min-width:0; padding:7px 9px; }
  }
`;
      (document.head || document.body).appendChild(style);
    },
  };
}
