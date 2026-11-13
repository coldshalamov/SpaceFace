// PL-151 No papers — "Once the works makes parts, a hail on a private channel offers to buy the
// lot, unlogged: *"No papers. Better price."* | Sell dark, and watch honest haulers give your
// lane a miss; or refuse, and the hail comes back weekly, polite"
// The quoted line *"No papers. Better price."* is final copy, emitted verbatim every hail.
//
// Mechanics (physical, no menus): the hail opens a BUY WINDOW — a buyer buoy hangs in the dark
// near the yard for tuning.buyWindowS. Selling dark is a physical act: jettison cargo pods
// (data.playerJettisonOrigin pods — your own jettisons) close to the buyer inside the window
// and the buyer takes them and pays, unlogged. The consequence rides a story flag the yard
// family reads: honest haulers give your lane a miss (PL-146's caller stops coming). Refuse —
// let the window close on nothing — and the hail comes back weekly, polite, up to its cap.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   Credits and junk choices come from hash32 over pod identity.
// - No Three.js, no DOM. Credits move only through the existing economy:grantCredits seam.
// - Session state on `this`; destroy() unsubscribes, removes owned entities, clears Maps.
// - One open buy window at a time; posted pods tracked in a bounded Map (tuning.memoryCap).

import { hash32 } from '../../core/rng.js';

export const PL_151_HAIL_EVENT = 'plants:pl151:hail';
export const PL_151_DARK_SALE_EVENT = 'plants:pl151:darkSale';

export const NO_PAPERS_TUNING = Object.freeze({
  dayLengthS: 240,
  firstHailDelayS: 60,        // "once the works makes parts" — a beat after the first module
  hailRepeatS: 7 * 240,       // the polite weekly return
  maxHails: 4,                // then the private channel goes quiet for good
  buyWindowS: 45,
  buyerRadiusWu: 90,          // spill range: pods left this close are "posted in"
  buyerOffsetWu: 70,
  restSpeedWu: 8,             // a posted pod has stopped moving
  returnDelayS: 2.5,          // the buyer collects after a beat
  creditsPerMassUnit: 3,      // unlogged pay: better price, no receipt
  memoryCap: 8,               // bounded posted-pod ledger
});

export const PL_151_DARK_SOLD_FLAG = 'plantsPl151DarkSold';

export const JUNK_COMMODITIES = Object.freeze([
  'cmdty_scrap_metal',
  'cmdty_salvage_electronics',
  'cmdty_alloys',
  'cmdty_silicate',
]);

export function junkFor(podId) {
  const h = hash32('plantsPl151Junk', String(podId));
  return JUNK_COMMODITIES[h % JUNK_COMMODITIES.length];
}

export function darkPayFor(mass, podId, t = NO_PAPERS_TUNING) {
  const m = Math.max(0, Number(mass) || 0);
  const wobble = (hash32('plantsPl151Pay', String(podId)) % 25) / 100; // 0..0.24, deterministic
  return Math.max(1, Math.round(m * t.creditsPerMassUnit * (1 + wobble)));
}

export function createPl151NoPapers() {
  return {
    name: 'plantsPl151',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._worksLive = false;     // "once the works makes parts"
      this._modulesBuilt = 0;
      this._nextHailAt = null;
      this._hails = 0;
      this._buyerId = null;
      this._windowUntil = null;
      this._posted = new Map();    // podId -> postedAt
      this._collectAt = new Map(); // podId -> collection beat
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:moduleBuilt', () => {
        this._modulesBuilt += 1;
        if (this._modulesBuilt === 1 && this._nextHailAt == null) {
          this._nextHailAt = this._now() + NO_PAPERS_TUNING.firstHailDelayS;
        }
      });
      on('sector:exit', () => this._closeWindow(false));
      on('save:loaded', () => this._closeWindow(false));
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._closeWindow(true);
      this._worksLive = false;
      this._modulesBuilt = 0;
      this._nextHailAt = null;
      this._hails = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _closeWindow(hard) {
      const rm = this.helpers?.removeEntity;
      if (this._buyerId != null && typeof rm === 'function') rm(this._buyerId);
      this._buyerId = null;
      this._windowUntil = null;
      this._posted?.clear();
      this._collectAt?.clear();
      if (hard) { this._hails = 0; this._nextHailAt = null; this._worksLive = false; this._modulesBuilt = 0; }
    },

    _entities(state) {
      const ents = state?.entities;
      if (!ents) return [];
      if (typeof ents.values === 'function') return [...ents.values()];
      if (Array.isArray(ents)) return ents;
      return [];
    },

    _hail() {
      const now = this._now();
      const t = NO_PAPERS_TUNING;
      this._hails += 1;
      this._nextHailAt = now + t.hailRepeatS; // fired: the next one is a week away, polite
      this.bus?.emit('comms:popup', {
        id: `plants:pl151:hail:${this._hails}`,
        sender: 'Private channel',
        category: 'story',
        text: 'No papers. Better price.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'warning' });
      this.bus?.emit(PL_151_HAIL_EVENT, { hail: this._hails, t: now });
      // Open the buy window: the buyer hangs in the dark near the yard.
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function') {
        const anchor = this._yardPos();
        if (anchor) {
          if (this._buyerId != null) this.helpers?.removeEntity?.(this._buyerId);
          const ent = spawn({
            type: 'beacon',
            pos: { x: anchor.x + t.buyerOffsetWu, z: anchor.z - t.buyerOffsetWu * 0.5 },
            vel: { x: 0, z: 0 },
            radius: 6,
            mass: 1e6,
            hull: 1,
            hullMax: 1,
            data: {
              parentType: 'story_prop',
              storyPropKind: 'plants_no_papers_buyer',
              plantsPl151Buyer: true,
              scanLabel: 'A buyer in the dark — no papers, no log',
              swarmFloorPad: { label: 'No papers — buyer' },
              lampsFlashing: true,
              lampFlashUntil: now + t.buyWindowS, // the slow private-channel blink, the whole window
              windowUntil: now + t.buyWindowS,
            },
          });
          if (ent && ent.id != null) this._buyerId = ent.id;
        }
      }
      this._windowUntil = now + t.buyWindowS;
    },

    _yardPos() {
      for (const e of this._entities(this.state)) {
        if (e?.alive !== false && e?.data?.plantsPl147Part != null) {
          return { x: Number(e.pos?.x) - NO_PAPERS_TUNING.buyerOffsetWu, z: Number(e.pos?.z) };
        }
      }
      // No works part lying about: hang the buyer on the first claimed body.
      for (const e of this._entities(this.state)) {
        if (e?.alive !== false && e?.data?.claim === true) {
          return { x: Number(e.pos?.x ?? e?.x), z: Number(e.pos?.z ?? e?.z) };
        }
      }
      // The buyer finds you: the yard is where your hull is.
      const player = this.state?.entities?.get ? this.state.entities.get(this.state.playerId) : null;
      if (player?.pos && Number.isFinite(player.pos.x)) {
        return { x: Number(player.pos.x), z: Number(player.pos.z) };
      }
      return null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = NO_PAPERS_TUNING;
      const flags = this._flags();
      if (!this._worksLive && this._modulesBuilt >= 1) this._worksLive = true;
      // Schedule and fire hails.
      if (this._worksLive && flags?.[PL_151_DARK_SOLD_FLAG] !== true
          && this._hails < t.maxHails && this._nextHailAt != null && now >= this._nextHailAt
          && this._windowUntil == null) {
        this._hail();
      }
      const windowOpen = this._windowUntil != null && now < this._windowUntil;
      if (this._windowUntil != null && !windowOpen) {
        // Refused by silence: the hail comes back weekly, polite.
        this._closeWindow(false);
        if (flags?.[PL_151_DARK_SOLD_FLAG] !== true && this._hails < t.maxHails) {
          this._nextHailAt = now + t.hailRepeatS;
        } else {
          this._nextHailAt = null;
        }
      }
      if (!windowOpen) return;
      const buyer = this._buyerId != null && s.entities?.get ? s.entities.get(this._buyerId) : null;
      if (!buyer || buyer.alive === false) { this._windowUntil = null; return; }
      const bx = Number(buyer.pos?.x);
      const bz = Number(buyer.pos?.z);
      if (!Number.isFinite(bx) || !Number.isFinite(bz)) return;
      // Watch the spill range: your own jettisoned pods, parked close, are "posted in".
      for (const e of this._entities(s)) {
        if (!e || e.alive === false || e.id === s.playerId) continue;
        const d = e.data;
        if (!d?.playerJettisonOrigin || d.plantsPl151Taken) continue;
        const px = Number(e.pos?.x);
        const pz = Number(e.pos?.z);
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
        const speed = Math.hypot(Number(e.vel?.x) || 0, Number(e.vel?.z) || 0);
        if (Math.hypot(px - bx, pz - bz) > t.buyerRadiusWu || speed > t.restSpeedWu) continue;
        if (!this._posted.has(e.id) && this._posted.size < t.memoryCap) {
          this._posted.set(e.id, now);
          this._collectAt.set(e.id, now + t.returnDelayS);
        }
      }
      // The buyer collects after a beat and pays, unlogged.
      for (const [podId, at] of this._collectAt) {
        if (now < at) continue;
        this._collectAt.delete(podId);
        const pod = s.entities?.get ? s.entities.get(podId) : null;
        if (!pod || pod.alive === false) { this._posted.delete(podId); continue; }
        const mass = Number(pod.physicsBody?.mass ?? pod.mass) || 0;
        const pay = darkPayFor(mass, podId, t);
        this.helpers?.removeEntity?.(podId);
        this._posted.delete(podId);
        this.bus?.emit('economy:grantCredits', { amount: pay, reason: 'plants:pl151_dark_sale' });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        const firstSale = flags?.[PL_151_DARK_SOLD_FLAG] !== true;
        if (firstSale) {
          flags[PL_151_DARK_SOLD_FLAG] = true;
          this.bus?.emit('comms:popup', {
            id: `plants:pl151:sold:${Math.round(now)}`,
            sender: 'Private channel',
            category: 'story',
            text: 'Sold, unlogged. Honest haulers skip your lane now.',
            ttl: 9,
            persist: false,
          });
        }
        this.bus?.emit(PL_151_DARK_SALE_EVENT, { podId, mass, pay, firstSale, t: now });
        this._windowUntil = Math.min(this._windowUntil ?? now, now + 1); // sale closes the window
        break;
      }
    },
  };
}

export const pl151NoPapers = createPl151NoPapers();
