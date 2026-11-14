// PL-356 The parade berth — "Come home off a long deep-route run and your home berth is
// swept, lit, and stocked by whoever kept the light while you were gone."
// What the player can do: Dock and let them; or ghost the sector for months first — swept,
// yes, but cold.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - The home berth is the sector's first real station by deterministic pick (lowest
//   hash32(tract) order); absence is measured on real sector:enter/exit receipts.
// - A long deep-route run (absence >= deepRunS) is met with the parade: the berth lamp lit
//   (dockLampsFlashing), a stocked gift pod beside the berth, and the keeper's chalk. Ghost
//   the sector for months (absence >= ghostS) and it is still swept — the chalk and the
//   sweep stand — but cold: no lamp, no stock.
// - Docking at the home berth completes it: the keeper's line, once per arrival.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes + despawns owned props.

import { spawnJettisonedCargoPod } from '../lootShards.js';
import { hash32 } from '../../core/rng.js';

export const PLANTS_PARADE_EVENT = 'plants:pl356:parade';

export const PARADE_TUNING = Object.freeze({
  plId: 'pl356',
  deepRunS: 420,             // a long deep-route run
  ghostS: 1800,              // ghost the sector for months
  dockRadiusFallbackWu: 90,
  stockPods: 1,
  memoryCap: 8,
});

export const PARADE_HOME_LINE = 'Swept and stocked, by whoever kept the light.';
export const PARADE_COLD_LINE = 'Swept, yes. But the light was kept cold.';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: the sector's home berth — deterministic pick over real stations. */
export function homeBerthOf(state, sectorId) {
  const idx = state && state.entityIndex;
  const list = (idx && Array.isArray(idx.stations)) ? idx.stations
    : (state && Array.isArray(state.entityList) ? state.entityList.filter((e) => e && e.type === 'station') : []);
  let best = null;
  let bestKey = null;
  for (const st of list) {
    if (!st || st.alive === false || st.type !== 'station' || !st.pos) continue;
    const d = st.data || {};
    if (d.isGate || d.isWormhole) continue;
    const sid = String(d.stationId || st.id);
    const key = hash32('plantsPl356Home', sectorId || 's1', sid);
    if (bestKey == null || key < bestKey) { bestKey = key; best = st; }
  }
  return best;
}

export function createPl356ParadeBerth() {
  return {
    name: 'plantsPl356',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._leftAt = new Map();      // sectorId -> leave simTime
      this._done = new Set();        // one parade per arrival
      this._owned = [];              // spawned props/pods for this arrival
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p = {}) => this._onEnter(p));
      on('sector:exit', (p = {}) => this._onExit(p));
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
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
      this._clearOwned();
      if (this._leftAt) this._leftAt.clear();
      if (this._done) this._done.clear();
    },

    _clearOwned() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm !== 'function') return;
      for (const id of this._owned) rm(id);
      this._owned.length = 0;
    },

    update(dt) {
      // Event-driven: the receipts above carry this plant; the family shape keeps the hook.
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _onExit(p) {
      const s = this.state;
      const sectorId = (p && p.sectorId) || (s && s.world && s.world.currentSectorId);
      if (!sectorId) return;
      this._leftAt.set(sectorId, this._now());
      this._clearOwned();
    },

    _onEnter(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
      const now = this._now();
      const leftAt = this._leftAt.get(sectorId);
      const absence = leftAt != null ? now - leftAt : 0;
      if (absence < PARADE_TUNING.deepRunS) return;
      const home = homeBerthOf(s, sectorId);
      if (!home || !home.pos) return;
      const cold = absence >= PARADE_TUNING.ghostS;
      this._decorate(home, now, cold);
      this._done.add(`${sectorId}:${Math.round(now)}`);
      while (this._done.size > PARADE_TUNING.memoryCap) this._done.delete(this._done.values().next().value);
      this.bus.emit(PLANTS_PARADE_EVENT, { kind: cold ? 'cold' : 'parade', sectorId, homeId: (home.data && home.data.stationId) || home.id, absenceS: Math.round(absence), t: now });
    },

    _decorate(home, now, cold) {
      const d = home.data || (home.data = {});
      if (!cold) {
        // The berth lamp lit by whoever kept the light.
        d.dockLampsFlashing = true;
        d.dockLampFlashUntil = now + 3;
      }
      d.plantsPl356SweptAt = now;
      d.plantsPl356Cold = cold;
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !home.pos) return;
      const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : PARADE_TUNING.dockRadiusFallbackWu;
      const chalk = spawnEntity({
        type: 'beacon',
        pos: { x: home.pos.x - (r + 12), z: home.pos.z + 10 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl356_chalk',
          plantsPl356Chalk: true,
          scanLabel: cold ? 'Your berth, swept — nobody kept it warm' : 'Your berth, swept and lit while you were gone',
          swarmFloorPad: { label: cold ? 'SWEPT — COLD' : 'BERTH KEPT' },
          masslineTetherable: true,
        },
      });
      if (chalk && chalk.id != null) this._owned.push(chalk.id);
      if (cold) return;
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId: 'cmdty_ice_water',
        amount: PARADE_TUNING.stockPods,
        radius: 4,
        pos: { x: home.pos.x + (r + 8), z: home.pos.z - 12 },
        vel: { x: 0, z: 0 },
        ownerId: null,
        ownerName: 'THE KEEPER',
      }, this.helpers);
      if (pod && pod.id != null) {
        pod.data = pod.data || {};
        pod.data.swarmFloorPad = { label: 'STOCKED FOR YOU' };
        this._owned.push(pod.id);
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const sectorId = (s.world && s.world.currentSectorId) || 's1';
      const home = homeBerthOf(s, sectorId);
      if (!home) return;
      const homeId = (home.data && home.data.stationId) || home.id;
      if (homeId !== p.stationId) return;
      const now = this._now();
      const swept = home.data && Number.isFinite(home.data.plantsPl356SweptAt) && now - home.data.plantsPl356SweptAt <= PARADE_TUNING.ghostS;
      if (!swept) return;
      const cold = !!(home.data && home.data.plantsPl356Cold);
      const id = `plants:pl356:home:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE KEEPER', category: 'traffic', text: cold ? PARADE_COLD_LINE : PARADE_HOME_LINE, ttl: 8, persist: false });
      this.bus.emit('audio:cue', { id: cold ? 'sfx_vent_chime' : 'confirm', position: null, gain: 0.45, rate: 1.0 });
      this.bus.emit(PLANTS_PARADE_EVENT, { kind: cold ? 'docked_cold' : 'docked', homeId, t: now });
    },
  };
}

export const pl356ParadeBerth = createPl356ParadeBerth();
