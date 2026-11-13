// PL-125 Under the paint — "A scrape deep enough for the repair bay turns up a scratch under
// your hull's paint, older than your registration: 12.4 | Have it buffed out — it comes back
// with the next deep scrape; or leave it. It was there first"
//
// The number under the paint is 12.4 — exact from the row. The trigger is a real deep scrape:
// a physics:impact receipt naming the player with dp at or above the bay's threshold. The
// scratch rides the player's own entity data (`plantsPl125UnderPaint`). Buffing out is physical:
// an actual hull repair (measured hull rise) wipes the stamp — and the next deep scrape finds
// it again, because it was there first.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes everything, clears state.
// - One reveal per cooldown window (tuning.revealCooldownS); no stacking while revealed.
// - Buff detection: sampled hull rise >= tuning.buffHullGain while the scratch is revealed.

export const PL_125_REVEAL_EVENT = 'plants:pl125:reveal';
export const PL_125_BUFFED_EVENT = 'plants:pl125:buffed';

export const UNDER_PAINT_TUNING = Object.freeze({
  number: '12.4',             // exact from the row
  deepScrapeDp: 55,           // "a scrape deep enough for the repair bay"
  revealCooldownS: 30,        // scrapes inside the window add nothing new
  buffHullGain: 30,           // a real repair, measured on the hull
  memoryCap: 4,
});

export function isDeepScrapeForPlayer(payload, playerId, t = UNDER_PAINT_TUNING) {
  if (!payload || !Number.isFinite(playerId)) return false;
  const involved = payload.aId === playerId || payload.bId === playerId;
  if (!involved) return false;
  const dp = Number(payload.dp);
  return Number.isFinite(dp) && dp >= t.deepScrapeDp;
}

export function createPl125UnderPaint() {
  return {
    name: 'plantsPl125',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._revealed = false;
      this._lastRevealAt = -Infinity;
      this._hullSample = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => { this._hullSample = null; });
      on('save:loaded', () => { this._revealed = false; this._hullSample = null; });
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
      this._revealed = false;
      this._lastRevealAt = -Infinity;
      this._hullSample = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _player() {
      return this.state?.entities?.get ? this.state.entities.get(this.state.playerId) : null;
    },

    _onImpact(payload) {
      const player = this._player();
      const t = UNDER_PAINT_TUNING;
      if (!player) return;
      const now = this._now();
      if (now - this._lastRevealAt < t.revealCooldownS) return; // one reveal per window
      if (!isDeepScrapeForPlayer(payload, this.state.playerId, t)) return;
      // The scratch was there first: revealing it is a stamp, not a creation.
      this._revealed = true;
      this._lastRevealAt = now;
      this._hullSample = Number(player.hull) || 0;
      player.data = player.data || {};
      player.data.plantsPl125UnderPaint = t.number;
      player.data.plantsPl125UnderPaintAt = now;
      this.bus?.emit('comms:popup', {
        id: `plants:pl125:reveal:${Math.round(now)}`,
        sender: 'The repair bay',
        category: 'story',
        text: `Under your paint: ${t.number}. Older than your registration.`,
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'warning' });
      this.bus?.emit(PL_125_REVEAL_EVENT, {
        number: t.number,
        dp: Number(payload.dp),
        entityId: player.id,
        t: now,
      });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (!this._revealed) return;
      const player = this._player();
      if (!player) return;
      const hull = Number(player.hull);
      if (!Number.isFinite(hull)) return;
      if (this._hullSample == null) { this._hullSample = hull; return; }
      // Buffed out: the hull actually grew back while the scratch was showing.
      if (hull - this._hullSample >= UNDER_PAINT_TUNING.buffHullGain) {
        this._revealed = false;
        this._hullSample = null;
        delete player.data?.plantsPl125UnderPaint;
        delete player.data?.plantsPl125UnderPaintAt;
        const now = this._now();
        this.bus?.emit('comms:popup', {
          id: `plants:pl125:buffed:${Math.round(now)}`,
          sender: 'The repair bay',
          category: 'story',
          text: 'Buffed out. The next scrape finds it again.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit(PL_125_BUFFED_EVENT, { number: UNDER_PAINT_TUNING.number, t: now });
      } else {
        this._hullSample = hull;
      }
    },
  };
}

export const pl125UnderPaint = createPl125UnderPaint();
