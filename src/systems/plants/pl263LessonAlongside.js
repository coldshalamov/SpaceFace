// PL-263 The lesson alongside — "Fly on a fresh Line class and an older hauler falls
// alongside, shows you one trick without a word, and is gone at the next mark."
// What the player can do: Learn it; or shove them off mid-lesson — nobody teaches you the
// next one.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Traffic ops mixin (hull-to-hull lane reaction): the older hauler is a REAL passing
//   civilian hull; NPC movement ONLY via requestTrafficReaction. Returns true only while the
//   hull is flying the lesson.
// - "Fresh Line class" is the real line:classChanged receipt (lineProgression.js), armed for
//   a bounded window in module memory; a worn civilian hauler (hull under max) is the elder.
// - The trick is physical: one leased boost burst + a lamp flash at the mark. Learning it is
//   holding alongside through the trick (stamp plantsPl263LearnedAt on the player hull).
//   Shoving them off mid-lesson is a real physics:impact receipt (causalActorId = player,
//   teacher hull) — nobody teaches you the next one (grudge window in module memory).
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game-new via RESET not unsubscribe.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_LESSON_EVENT = 'plants:pl263:lesson';
export const PLANTS_LESSON_SHOVE_EVENT = 'plants:pl263:shove';

export const LESSON_TUNING = Object.freeze({
  plId: 'pl263',
  armWindowS: 60,           // a fresh class looks for a teacher this long
  lessonRangeWu: 240,       // an elder within this of the fresh-class hull
  holdRangeWu: 80,          // falls alongside
  lessonS: 12,              // shows one trick, gone at the next mark
  trickAtFrac: 0.5,         // mid-lesson boost burst
  trickBeatS: 1.5,
  wearFrac: 0.96,           // an "older" hauler: hull worn under its max
  noTeachS: 1800,           // nobody teaches you the next one
  memoryCap: 8,
});

export const PL_263_LEARNED_STAMP = 'plantsPl263LearnedAt';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: a worn civilian hauler counts as the older hand. */
export function isOlderHauler(e, rec = null, state = null) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
  if (state && e.id === state.playerId) return false;
  const data = e.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  const role = String(
    (rec && rec.role) || data.trafficRole || data.role || (data.ai && (data.ai.role || data.ai.archetype)) || '',
  ).toLowerCase();
  if (!role.includes('hauler') && !role.includes('freighter') && !role.includes('tanker')) return false;
  const hullMax = finite(e.hullMax, 0);
  return hullMax > 0 && finite(e.hull, hullMax) < hullMax * LESSON_TUNING.wearFrac;
}

export const lessonOps = {
  _initLesson() {
    this._lessonArmed = null;          // { until }
    this._lessonRun = null;            // { hullId, since, tricked }
    this._lessonNoTeachUntil = -Infinity;
    this._lessonMemory = new Map();    // hullId -> last lesson simTime
    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = bus.on(event, fn);
      if (typeof off === 'function') this._lessonUnsubs.push(off);
    };
    this._lessonUnsubs = this._lessonUnsubs || [];
    on('line:classChanged', () => {
      const state = this.state;
      if (!state || (state.mode && state.mode !== 'flight')) return;
      const now = finite(state.simTime, 0);
      this._lessonArmed = { until: now + LESSON_TUNING.armWindowS };
    });
    on('physics:impact', (p = {}) => this._onLessonImpact(p));
    on('sector:exit', () => this._resetLesson());
    on('save:loaded', () => this._resetLesson());
    on('game:new', () => this._resetLesson());
    on('game:newGame', () => this._resetLesson());
  },

  _resetLesson() {
    if (this._lessonRun && this.state) {
      const e = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this._lessonRun.hullId) : null;
      if (e) releaseTrafficReaction(this, e);
    }
    this._lessonRun = null;
    this._lessonArmed = null;
    if (this._lessonMemory) this._lessonMemory.clear();
  },

  /** Shoving them off mid-lesson: nobody teaches you the next one. */
  _onLessonImpact(p) {
    const state = this.state;
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const run = this._lessonRun;
    if (!run) return;
    const teacherId = run.hullId;
    const hitTeacher = p.aId === teacherId || p.bId === teacherId;
    if (!hitTeacher || p.causalActorId !== state.playerId) return;
    const now = finite(state.simTime, 0);
    const teacher = state.entities && state.entities.get ? state.entities.get(teacherId) : null;
    if (teacher) releaseTrafficReaction(this, teacher);
    this._lessonNoTeachUntil = now + LESSON_TUNING.noTeachS;
    this._lessonRun = null;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
      this.bus.emit(PLANTS_LESSON_SHOVE_EVENT, { teacherId, until: this._lessonNoTeachUntil, t: now });
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: the armed window finds an older hauler and the
   * lesson flies alongside. Returns true only while this hull is flying the lesson.
   */
  _reactLesson(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || !e.pos || !player || player.alive === false || !player.pos) return false;
    const now = finite(state.simTime, 0);

    const run = this._lessonRun;
    if (run && run.hullId === e.id) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      const aim = Math.atan2(finite(player.pos.z) - finite(e.pos.z), finite(player.pos.x) - finite(e.pos.x));
      const trickNow = !run.tricked && (now - run.since) >= LESSON_TUNING.lessonS * LESSON_TUNING.trickAtFrac;
      requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: trickNow, fire: false, fireGroup: null, aimAngle: aim, brake: !trickNow,
      }, 2);
      if (trickNow) run.tricked = true;
      run.lastAt = now;
      const learned = d <= LESSON_TUNING.holdRangeWu;
      if (!run.done && now - run.since >= LESSON_TUNING.lessonS) {
        run.done = true;
        // Gone at the next mark: lamp flash, release, done.
        const data = e.data || (e.data = {});
        data.lampsFlashing = true;
        data.lampFlashUntil = now + 0.9;
        if (learned) {
          player.data = player.data || {};
          player.data[PL_263_LEARNED_STAMP] = now;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.4, rate: 1.0 });
            this.bus.emit(PLANTS_LESSON_EVENT, { kind: 'learned', teacherId: e.id, t: now });
          }
        } else {
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_LESSON_EVENT, { kind: 'missed', teacherId: e.id, t: now });
          }
        }
        releaseTrafficReaction(this, e);
        this._lessonRun = null;
      }
      return true;
    }
    if (run) return false;

    if (!this._lessonArmed || now > this._lessonArmed.until) return false;
    if (now < this._lessonNoTeachUntil) return false;
    if (!isOlderHauler(e, rec, state)) return false;
    const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
    if (d > LESSON_TUNING.lessonRangeWu) return false;
    const memory = this._lessonMemory instanceof Map ? this._lessonMemory : (this._lessonMemory = new Map());
    const last = memory.get(e.id);
    if (Number.isFinite(last) && now - last < LESSON_TUNING.armWindowS) return false;
    while (memory.size >= LESSON_TUNING.memoryCap) memory.delete(memory.keys().next().value);
    memory.set(e.id, now);
    this._lessonArmed = null;
    this._lessonRun = { hullId: e.id, since: now, tricked: false, done: false, lastAt: now };
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_LESSON_EVENT, { kind: 'fell_in', teacherId: e.id, t: now });
    }
    return true;
  },
};
