// PL-357 The warm grid — "Dock with an empty charge and the berth's grid tops you to launch
// minimum before the meter even wakes."
// What the player can do: Take the minimum; or drain the grace daily — the grid meters you
// from zero, and the grace goes to someone else.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "Empty charge" is the real player fuel bag (state.player.fuel); the top-up to launch
//   minimum is the only direct fuel seam outside dock services (same honesty as goodPatch's
//   hull write), once per station per day.
// - Drain the grace daily: docking dry again the very next day after a grace makes it a
//   streak; at the streak the grid meters you from zero (station stamp plantsPl357MeteredUntil,
//   refusal lamps) and the grace goes to someone else — no more top-ups there while metered.
// - Bounded Maps with tuning.memoryCap; per-station day memory; RESET on sector:exit /
//   save:loaded / game:new / game:newGame; destroy() unsubscribes.

export const PLANTS_GRID_EVENT = 'plants:pl357:grid';
export const PLANTS_METERED_EVENT = 'plants:pl357:metered';

export const WARM_GRID_TUNING = Object.freeze({
  plId: 'pl357',
  dryFrac: 0.12,
  launchMinUnits: 25,        // tops you to launch minimum
  dayLengthS: 240,
  streakToMeter: 3,          // drain the grace daily and the grid catches on
  meteredS: 900,             // metered from zero this long
  memoryCap: 12,
});

export const PL_357_METERED_STAMP = 'plantsPl357MeteredUntil';
export const PL_357_GRACE_STAMP = 'plantsPl357GraceDay';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl357WarmGrid() {
  return {
    name: 'plantsPl357',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._streaks = new Map();   // stationId -> { day, count }
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      if (this._streaks) this._streaks.clear();
    },

    update(dt) {
      // Event-driven: the receipts above carry this plant; the family shape keeps the hook.
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _stationById(stationId) {
      const s = this.state;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (s && Array.isArray(s.entityList) ? s.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },

    _fuelBag() {
      // The fuel bag is state-level (gameState.js); some harnesses mirror it on player.
      const s = this.state;
      return (s && s.player && s.player.fuel) || (s && s.fuel) || null;
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const fuel = this._fuelBag();
      if (!fuel || !Number.isFinite(fuel.max) || fuel.max <= 0) return;
      const now = this._now();
      const day = Math.floor(now / WARM_GRID_TUNING.dayLengthS);
      const station = this._stationById(p.stationId);
      if (!station) return;
      const d = station.data || (station.data = {});

      const metered = Number.isFinite(d[PL_357_METERED_STAMP]) && d[PL_357_METERED_STAMP] > now;
      if (metered) {
        d.dockLampsFlashing = true;
        d.dockLampFlashUntil = now + 0.6;
        const id = `plants:pl357:metered:${p.stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'THE GRID', category: 'traffic', text: 'Grid meters you from zero. Grace went elsewhere.', ttl: 7, persist: false });
        this.bus.emit(PLANTS_METERED_EVENT, { stationId: p.stationId, t: now });
        return;
      }

      const dry = fuel.current <= fuel.max * WARM_GRID_TUNING.dryFrac;
      if (!dry) return;
      const graceDay = d[PL_357_GRACE_STAMP];
      const streak = this._streaks.get(p.stationId) || { day: -1, count: 0 };

      // Draining the grace daily: dry again the very next day after a grace.
      if (Number.isFinite(graceDay) && day === graceDay + 1) {
        streak.count = (streak.day === day - 1 || streak.day === -1 ? streak.count : 0) + 1;
        streak.day = day;
        while (this._streaks.size >= WARM_GRID_TUNING.memoryCap) this._streaks.delete(this._streaks.keys().next().value);
        this._streaks.set(p.stationId, streak);
        if (streak.count >= WARM_GRID_TUNING.streakToMeter) {
          d[PL_357_METERED_STAMP] = now + WARM_GRID_TUNING.meteredS;
          d.dockLampsFlashing = true;
          d.dockLampFlashUntil = now + 0.8;
          this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.85 });
          this.bus.emit(PLANTS_METERED_EVENT, { stationId: p.stationId, until: d[PL_357_METERED_STAMP], t: now });
          return;
        }
      } else {
        streak.count = 0;
        streak.day = day;
        this._streaks.set(p.stationId, streak);
      }

      // The warm grid: tops you to launch minimum before the meter even wakes.
      if (graceDay === day) return; // once per station day
      fuel.current = Math.max(fuel.current, Math.min(fuel.max, WARM_GRID_TUNING.launchMinUnits));
      d[PL_357_GRACE_STAMP] = day;
      const id = `plants:pl357:grace:${p.stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE GRID', category: 'traffic', text: 'Topped to launch minimum. The meter never woke.', ttl: 6, persist: false });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.4, rate: 1.0 });
      this.bus.emit(PLANTS_GRID_EVENT, { stationId: p.stationId, fuel: fuel.current, t: now });
    },
  };
}

export const pl357WarmGrid = createPl357WarmGrid();
