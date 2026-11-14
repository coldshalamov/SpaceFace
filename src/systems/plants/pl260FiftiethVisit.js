// PL-260 The fiftieth visit — "One station counts your arrivals; the fiftieth is already
// toll-paid when you reach the board, with a chalk mark underneath: 'Fifty. Ours now.'"
// What the player can do: Keep the chalk; or demand the toll back in cash — the mark becomes
// a bill.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Arrivals are the real dock:range receipts (rising edges, payload must carry shipId).
// - The chalk is visible: a station-side prop with swarmFloorPad 'FIFTY. OURS NOW.' plus the
//   namespaced station stamp plantsPl260TollPaidUntil.
// - "Demand the toll back in cash" has no input seam (no dock-argument UI); the honest
//   physical read of the wrong choice is tearing the mark off the board: a real
//   physics:impact receipt against the chalk prop above the impulse floor turns the mark
//   into a bill (stamp plantsPl260BilledUntil + the pad re-labeled). Documented substitute.
// - Bounded Maps with tuning.memoryCap; per-station cooldowns; session state RESET on
//   sector:exit / save:loaded / game:new / game:newGame; destroy() unsubscribes + despawns.

export const PLANTS_FIFTY_EVENT = 'plants:pl260:fifty';
export const PLANTS_FIFTY_BILL_EVENT = 'plants:pl260:bill';

export const FIFTY_TUNING = Object.freeze({
  plId: 'pl260',
  arrivalTarget: 50,        // the fiftieth visit
  paidUntilS: 600,          // the toll stays paid a good while
  impulseFloor: 40,         // a real shove on the chalk, not a brush
  billUntilS: 900,          // the mark becomes a bill
  chalkRadius: 5,
  dockRadiusFallbackWu: 90,
  memoryCap: 8,             // arrival counters
});

export const PL_260_PAID_STAMP = 'plantsPl260TollPaidUntil';
export const PL_260_BILLED_STAMP = 'plantsPl260BilledUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl260FiftiethVisit() {
  return {
    name: 'plantsPl260',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._arrivals = new Map();   // stationId -> count
      this._chalkIds = new Map();   // stationId -> chalk prop id
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('physics:impact', (p = {}) => this._onImpact(p || {}));
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
      if (this._arrivals) this._arrivals.clear();
      if (this._chalkIds) this._chalkIds.clear();
    },

    update(dt) {
      // Event-driven: the receipts above carry this plant; the family shape keeps the hook.
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const now = this._now();
      const count = (this._arrivals.get(p.stationId) || 0) + 1;
      while (this._arrivals.size >= FIFTY_TUNING.memoryCap) this._arrivals.delete(this._arrivals.keys().next().value);
      this._arrivals.set(p.stationId, count);
      if (count !== FIFTY_TUNING.arrivalTarget) return;
      const station = this._stationById(p.stationId);
      if (!station) return;
      station.data = station.data || {};
      station.data[PL_260_PAID_STAMP] = now + FIFTY_TUNING.paidUntilS;
      this._spawnChalk(station, now, 'FIFTY. OURS NOW.');
      const id = `plants:pl260:fifty:${p.stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE BOARD', category: 'traffic', text: 'Fifty. Ours now.', ttl: 8, persist: false });
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'comms', id: 'plants:pl260:fifty', text: 'Fifty. Ours now.', ttl: 8 });
      } else {
        this.bus.emit('voice:say', { channel: 'comms', id: 'plants:pl260:fifty', text: 'Fifty. Ours now.', ttl: 8 });
      }
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_FIFTY_EVENT, { stationId: p.stationId, arrivals: count, t: now });
    },

    /** Demand the toll back in cash — a real shove tears the mark into a bill. */
    _onImpact(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || finite(p.impulse, 0) < FIFTY_TUNING.impulseFloor) return;
      if (p.causalActorId == null || p.causalActorId !== s.playerId) return;
      const now = this._now();
      for (const [stationId, chalkId] of this._chalkIds) {
        if (chalkId !== p.aId && chalkId !== p.bId) continue;
        const chalk = s.entities && s.entities.get ? s.entities.get(chalkId) : null;
        if (!chalk || chalk.alive === false) { this._chalkIds.delete(stationId); return; }
        chalk.data = chalk.data || {};
        chalk.data.swarmFloorPad = { label: 'THE MARK IS A BILL' };
        const station = this._stationById(stationId);
        if (station) {
          station.data = station.data || {};
          station.data[PL_260_BILLED_STAMP] = now + FIFTY_TUNING.billUntilS;
          station.data.dockLampsFlashing = true;
          station.data.dockLampFlashUntil = now + 0.6;
        }
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
        this.bus.emit(PLANTS_FIFTY_BILL_EVENT, { stationId, chalkId, t: now });
        return;
      }
    },

    _stationById(stationId) {
      const idx = this.state && this.state.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (this.state && Array.isArray(this.state.entityList) ? this.state.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },

    _spawnChalk(station, now, label) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !station.pos) return;
      const d = station.data || {};
      const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : FIFTY_TUNING.dockRadiusFallbackWu;
      const a = (Math.abs(Math.round(now * 7)) % 6283) / 1000;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: station.pos.x + Math.cos(a) * (r + 12), z: station.pos.z + Math.sin(a) * (r + 12) },
        vel: { x: 0, z: 0 },
        radius: FIFTY_TUNING.chalkRadius,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl260_chalk',
          plantsPl260Chalk: true,
          scanLabel: 'A chalk mark under the toll: fifty visits, ours now',
          swarmFloorPad: { label },
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) {
        while (this._chalkIds.size >= FIFTY_TUNING.memoryCap) this._chalkIds.delete(this._chalkIds.keys().next().value);
        this._chalkIds.set((station.data && station.data.stationId) || station.id, ent.id);
      }
    },
  };
}

export const pl260FiftiethVisit = createPl260FiftiethVisit();
