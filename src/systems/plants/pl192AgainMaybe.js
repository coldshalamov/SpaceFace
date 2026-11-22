// PL-192 Again, maybe — "Hyperion | Again, maybe. Mags says one thing about every ship that clears
// the Cut. Clear it clean and yours is: *'Again, maybe.'* | Earn the maybe | DRAFT 2026-11-11"
// The quoted line "Again, maybe." is final copy from the row.
//
// SEAM NOTE (honest): the Cut is sector_hyperion_cut (verified in src/data/frontierRegions/
// west.js; the sector card is literally named Hyperion Cut). Mags exists only in the row, so he
// speaks through the ordinary comms seams (helpers.voice.say + comms:popup, category 'traffic')
// at the moment your ship CLEARS the sector. "Clean" is staged honestly: no death receipts off
// your hull between entry and exit — the Cut saw no violence near you.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy() clears the armed record and Maps.
// - Bounded ledgers (tuning.memoryCap); one maybe per clean exit; re-arms on re-entry.
// - Reads canonical entity:killed receipts; never writes hulls or invents kills.

import { hash32 } from '../../core/rng.js';

export const PL_192_MAYBE_EVENT = 'plants:pl192:maybe';
export const PL_192_BLOODY_EVENT = 'plants:pl192:bloody';

export const MAGS_LINE = 'Again, maybe.';
export const MAGS_SENDER = 'MAGS';

export const AGAIN_MAYBE_TUNING = Object.freeze({
  sectorId: 'sector_hyperion_cut',
  blameRadiusWu: 400,          // a death this close to you dirties the exit
  memoryCap: 4,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

export const AGAIN_MAYBE_SALT = hash32('plantsPl192', AGAIN_MAYBE_TUNING.sectorId);

export const pl192AgainMaybe = {
  modes: ['flight'],
  name: 'plantsPl192',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._armed = null;          // { enteredAt, kills } | null
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p = {}) => {
      if (p?.sectorId === AGAIN_MAYBE_TUNING.sectorId) {
        this._armed = { enteredAt: this._now(this.state), kills: 0 };
      }
    });
    on('sector:exit', (p = {}) => this._onExit(p));
    on('entity:killed', (p = {}) => this._onKilled(p));
    on('save:loaded', () => { this._armed = null; });
    on('game:newGame', () => { this._armed = null; });
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._armed = null;
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _player(s) {
    return typeof s?.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _onKilled(p) {
    const s = this.state;
    if (!s || !this._armed || !p) return;
    const player = this._player(s);
    if (!player?.pos) return;
    const victimPos = (p.pos && Number.isFinite(p.pos.x))
      ? p.pos
      : (p.id != null && typeof s.entities?.get === 'function' ? s.entities.get(p.id)?.pos : null);
    if (!victimPos || !Number.isFinite(victimPos.x)) return;   // honest limit: unlocated deaths never blame
    const d = Math.hypot(victimPos.x - player.pos.x, victimPos.z - player.pos.z);
    if (d <= AGAIN_MAYBE_TUNING.blameRadiusWu) this._armed.kills += 1;
  },

  _onExit(p) {
    const s = this.state;
    if (!s) return;
    if (p?.sectorId && p.sectorId !== AGAIN_MAYBE_TUNING.sectorId) return;
    const armed = this._armed;
    this._armed = null;
    if (!armed) return;
    const now = this._now(s);
    if (armed.kills === 0) {
      // Cleared it clean: yours is the maybe.
      this.bus?.emit(PL_192_MAYBE_EVENT, { kills: 0, enteredAt: armed.enteredAt, t: now });
      if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({ channel: 'comms', id: 'plants:pl192:maybe', text: MAGS_LINE, kind: 'traffic', ttl: 4 });
      } else {
        this.bus?.emit('voice:say', { channel: 'comms', id: 'plants:pl192:maybe', text: MAGS_LINE, ttl: 4 });
      }
      this.bus?.emit('comms:popup', {
        id: 'plants:pl192:maybe', sender: MAGS_SENDER, category: 'traffic',
        text: MAGS_LINE, ttl: 6, persist: false,
      });
    } else {
      // The Cut saw violence off your hull: no line this time.
      this.bus?.emit(PL_192_BLOODY_EVENT, { kills: armed.kills, enteredAt: armed.enteredAt, t: now });
    }
  },

  update() {
    // Event-driven plant: entry/exit/kills carry everything. No per-frame work.
  },
};
