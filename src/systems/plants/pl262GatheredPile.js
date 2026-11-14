// PL-262 The gathered pile — "Lose cargo overboard in a lane; by the time you circle back it
// is collected in a neat cluster with a marker, nobody claiming salvage."
// What the player can do: Take only yours; or take the lot — gatherers watch, and gatherers
// gossip at market scales.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "Lose cargo overboard" is the real cargo:jettisoned dump receipt; the pods are the real
//   jettisoned payloads near the dump. HONEST LIMIT: pods are physics bodies owned by the
//   kernel, so the plant does not move them into a cluster; the gatherers' marker stands over
//   the pods (a real story-prop beacon with a floor-pad label) and the pile is stamped in pod
//   data (plantsPl262Gathered / plantsPl262Stray).
// - Take only yours: collecting your own gathered pods is yours; the marker goes home when
//   the pile is yours again.
// - Take the lot: a stray from somebody else's spill inside the pile collected by the player
//   is theft the gatherers saw — gossip at market scales: the next dock runs you past the
//   scales (station stamp plantsPl262GossipUntil + refusal lamps + receipt).
// - Bounded Maps with tuning.memoryCap; cooldowns per station; RESET on sector:exit /
//   save:loaded / game:new / game:newGame; destroy() unsubscribes + despawns owned.

export const PLANTS_PILE_EVENT = 'plants:pl262:pile';
export const PLANTS_GOSSIP_EVENT = 'plants:pl262:gossip';

export const PILE_TUNING = Object.freeze({
  plId: 'pl262',
  gatherDelayS: 20,          // "by the time you circle back"
  pileRadiusWu: 60,
  gossipUntilS: 600,
  dockRadiusFallbackWu: 90,
  memoryCap: 16,
});

export const PL_262_GATHERED_STAMP = 'plantsPl262Gathered';
export const PL_262_STRAY_STAMP = 'plantsPl262Stray';
export const PL_262_GOSSIP_STAMP = 'plantsPl262GossipUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl262GatheredPile() {
  return {
    name: 'plantsPl262',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._pending = new Map();   // dumpKey -> { podIds, at }
      this._piles = new Map();     // markerId -> { podIds, mine, strays, at }
      this._podToPile = new Map(); // podId -> markerId
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('cargo:jettisoned', (p = {}) => this._onJettison(p));
      on('pickup:collected', (p = {}) => this._onPickup(p || {}));
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
      this._despawnMarkers();
      if (this._pending) this._pending.clear();
      if (this._piles) this._piles.clear();
      if (this._podToPile) this._podToPile.clear();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      this._despawnMarkers();
      if (this._pending) this._pending.clear();
      if (this._piles) this._piles.clear();
      if (this._podToPile) this._podToPile.clear();
    },

    _despawnMarkers() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm !== 'function' || !this._piles) return;
      for (const markerId of this._piles.keys()) rm(markerId);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _entities() {
      const s = this.state;
      const ents = s && s.entities;
      if (ents && typeof ents.values === 'function') return [...ents.values()];
      if (Array.isArray(ents)) return ents;
      return Array.isArray(s && s.entityList) ? s.entityList : [];
    },

    _onJettison(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || !p.commodityId) return;
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return;
      const now = this._now();
      const key = `${Math.round(player.pos.x)}:${Math.round(player.pos.z)}:${Math.round(now)}`;
      const podIds = [];
      for (const e of this._entities()) {
        if (!e || e.alive === false || e.type !== 'payload' || !e.data || !e.data.jettisonedCargo || !e.pos) continue;
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d <= PILE_TUNING.pileRadiusWu) podIds.push(e.id);
      }
      if (!podIds.length) return;
      this._pending.set(key, { podIds, at: now, pos: { ...player.pos } });
      while (this._pending.size >= PILE_TUNING.memoryCap) this._pending.delete(this._pending.keys().next().value);
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      // Circle-back: pending dumps older than the gather delay become gathered piles.
      for (const [key, rec] of this._pending) {
        if (now - rec.at < PILE_TUNING.gatherDelayS) continue;
        this._pending.delete(key);
        this._gather(rec, now);
      }
    },

    /** The gatherers' marker: nobody claiming salvage, the pile stamped in pod data. */
    _gather(rec, now) {
      const s = this.state;
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function') return;
      const podIds = [];
      const strays = [];
      for (const e of this._entities()) {
        if (!e || e.alive === false || e.type !== 'payload' || !e.data || !e.data.jettisonedCargo || !e.pos) continue;
        const d = Math.hypot(e.pos.x - rec.pos.x, e.pos.z - rec.pos.z);
        if (d > PILE_TUNING.pileRadiusWu) continue;
        const ownerForeign = e.data.playerJettisonOrigin == null && e.data.ownerId !== s.playerId;
        if (ownerForeign) {
          e.data[PL_262_STRAY_STAMP] = true;
          strays.push(e.id);
        } else {
          e.data[PL_262_GATHERED_STAMP] = true;
        }
        podIds.push(e.id);
      }
      if (!podIds.length) return;
      const marker = spawnEntity({
        type: 'beacon',
        pos: { x: rec.pos.x, z: rec.pos.z },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_gathered_pile_marker',
          plantsPl262Marker: true,
          scanLabel: 'A neat cluster, gathered and marked — nobody claiming salvage',
          swarmFloorPad: { label: 'GATHERED — YOURS?' },
          masslineTetherable: true,
        },
      });
      if (!marker || marker.id == null) return;
      this._piles.set(marker.id, { podIds, strays, at: now, markerId: marker.id });
      for (const podId of podIds) {
        while (this._podToPile.size >= PILE_TUNING.memoryCap * 2) this._podToPile.delete(this._podToPile.keys().next().value);
        this._podToPile.set(podId, marker.id);
      }
      this.bus.emit(PLANTS_PILE_EVENT, { kind: 'gathered', markerId: marker.id, pods: podIds.length, strays: strays.length, t: now });
    },

    _onPickup(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || p.pickupId == null || p.collectorId !== s.playerId) return;
      const markerId = this._podToPile.get(p.pickupId);
      if (markerId == null) return;
      const pile = this._piles.get(markerId);
      if (!pile) { this._podToPile.delete(p.pickupId); return; }
      const now = this._now();
      const wasStray = pile.strays.includes(p.pickupId);
      pile.strays = pile.strays.filter((id) => id !== p.pickupId);
      pile.podIds = pile.podIds.filter((id) => id !== p.pickupId);
      this._podToPile.delete(p.pickupId);

      if (wasStray) {
        // Gatherers watch, and gatherers gossip at market scales.
        const player = s.entities.get(s.playerId);
        const station = player ? this._nearestStation(player.pos) : null;
        if (station) {
          station.data = station.data || {};
          station.data[PL_262_GOSSIP_STAMP] = now + PILE_TUNING.gossipUntilS;
        }
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.45, rate: 0.9 });
        this.bus.emit(PLANTS_GOSSIP_EVENT, { podId: p.pickupId, stationId: station ? (station.data && station.data.stationId) || station.id : null, t: now });
      } else {
        this.bus.emit(PLANTS_PILE_EVENT, { kind: 'reclaimed', podId: p.pickupId, t: now });
      }
      // All of yours back: the marker goes home.
      const mineLeft = pile.podIds.filter((id) => !pile.strays.includes(id));
      if (mineLeft.length === 0) {
        const rm = this.helpers && this.helpers.removeEntity;
        if (typeof rm === 'function') rm(markerId);
        for (const [podId, mid] of [...this._podToPile]) {
          if (mid === markerId) this._podToPile.delete(podId);
        }
        this._piles.delete(markerId);
        this.bus.emit(PLANTS_PILE_EVENT, { kind: 'cleared', markerId, t: now });
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const now = this._now();
      const station = this._stationById(p.stationId);
      if (!station || !station.data) return;
      const until = station.data[PL_262_GOSSIP_STAMP];
      if (!(Number.isFinite(until) && until > now)) return;
      station.data.dockLampsFlashing = true;
      station.data.dockLampFlashUntil = now + 0.6;
      const id = `plants:pl262:gossip:${p.stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE SCALES', category: 'traffic', text: 'Gatherers talk. The scales ran your lot twice.', ttl: 7, persist: false });
      this.bus.emit(PLANTS_GOSSIP_EVENT, { kind: 'at_scales', stationId: p.stationId, t: now });
    },

    _nearestStation(pos) {
      const idx = this.state && this.state.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : this._entities().filter((e) => e && e.type === 'station');
      let best = null;
      let bestD = Infinity;
      for (const st of list) {
        if (!st || st.alive === false || !st.pos) continue;
        const d = st.data || {};
        if (d.isGate || d.isWormhole) continue;
        const dd = Math.hypot(st.pos.x - pos.x, st.pos.z - pos.z);
        if (dd < bestD) { bestD = dd; best = st; }
      }
      return best;
    },

    _stationById(stationId) {
      const idx = this.state && this.state.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : this._entities().filter((e) => e && e.type === 'station');
      for (const st of list) {
        if (!st || st.alive === false) continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },
  };
}

export const pl262GatheredPile = createPl262GatheredPile();
