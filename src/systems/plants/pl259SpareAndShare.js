// PL-259 Spare and share — "Jettison a working spare where a broken-down hull can reach it,
// and word outruns you home — the next three docks chalk your berthing PAID."
// What the player can do: Farm it with a fake breakdown — the chalks stop, and one dock bills
// you for the wasted tow.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Standalone plant on real seams: cargo:jettisoned (cargo.js, the player's real dump
//   receipt) + a real broken-down hull (data.disabled/derelict/engineDead/deadInWater/
//   surrendered) + pickup:collected (who actually took the pod) + dock:range for the chalks.
// - The chalk is visible: a station-side dressing prop with a swarmFloorPad label plus the
//   namespaced station stamp plantsPl259PaidUntil (other systems may read).
// - Farming = dropping a "spare" for a broken-down hull and taking it back yourself: the
//   chalks stop, and the next dock bills you for the wasted tow (stamp plantsPl259BilledUntil
//   + refusal lamps). The bill is a receipt stamp — credits stay economy's single writer.
// - Bounded Maps with tuning.memoryCap; cooldowns per hull; session state RESET on
//   sector:exit / save:loaded / game:new / game:newGame; destroy() unsubscribes + despawns.

export const PLANTS_SPARE_EVENT = 'plants:pl259:deed';
export const PLANTS_SPARE_CHALK_EVENT = 'plants:pl259:chalk';
export const PLANTS_SPARE_BILL_EVENT = 'plants:pl259:bill';

export const SPARE_TUNING = Object.freeze({
  plId: 'pl259',
  reachWu: 260,              // "where a broken-down hull can reach it"
  chalksPerDeed: 3,          // the next three docks chalk your berthing PAID
  paidUntilS: 300,           // the chalk's lifetime on the board
  farmCooldownS: 1800,       // the chalks stop for a long while after farming
  offerMemoryS: 120,         // how long an offered pod remembers its hull
  dockRadiusFallbackWu: 90,
  memoryCap: 16,
});

export const PL_259_PAID_STAMP = 'plantsPl259PaidUntil';
export const PL_259_BILLED_STAMP = 'plantsPl259BilledUntil';
export const PL_259_OFFER_STAMP = 'plantsPl259OfferedFor';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: is this hull genuinely broken down (the real distress stamps traffic writes)? */
export function isBrokenDown(e) {
  if (!e || e.alive === false || e.type !== 'ship') return false;
  const d = e.data || {};
  return !!(d.disabled || d.derelict || d.engineDead || d.deadInWater || d.surrendered);
}

export function createPl259SpareAndShare() {
  return {
    name: 'plantsPl259',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._offers = new Map();       // podId -> { forHullId, offeredAt }
      this._served = new Set();       // pods already taken once: never a fresh offer again
      this._deeds = new Map();        // hullId -> lastDeedAt (cooldown bookkeeping)
      this._chalkIds = new Map();     // chalk prop id -> expireAt (owned marks live and die with the stamp)
      this._chalkCredits = 0;
      this._farmUntil = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('cargo:jettisoned', (p = {}) => this._onJettison(p));
      on('pickup:collected', (p = {}) => this._onPickup(p));
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
      this._despawnAllChalks();
      if (this._offers) this._offers.clear();
      if (this._served) this._served.clear();
      if (this._deeds) this._deeds.clear();
      this._chalkCredits = 0;
      this._farmUntil = -Infinity;
      this.state = null;
      this.bus = null;
    },

    _reset() {
      this._despawnAllChalks();
      if (this._offers) this._offers.clear();
      if (this._served) this._served.clear();
      if (this._deeds) this._deeds.clear();
      this._chalkCredits = 0;
      this._farmUntil = -Infinity;
    },

    update(dt) {
      // Expired chalk marks come off the board with their PAID stamp; otherwise this plant
      // is event-driven and the receipts above carry it.
      if (!this._chalkIds || this._chalkIds.size === 0) return;
      const now = this._now();
      for (const [id, expireAt] of this._chalkIds) {
        if (Number.isFinite(expireAt) && now < expireAt) continue;
        this._despawnChalk(id);
      }
    },

    _despawnChalk(id) {
      this._chalkIds.delete(id);
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm === 'function') rm(id);
    },

    _despawnAllChalks() {
      if (!this._chalkIds) return;
      for (const id of [...this._chalkIds.keys()]) this._despawnChalk(id);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _dockRadius(station) {
      const d = station && station.data;
      if (d && Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
      return SPARE_TUNING.dockRadiusFallbackWu;
    },

    _stations() {
      const idx = this.state && this.state.entityIndex;
      if (idx && Array.isArray(idx.stations)) return idx.stations;
      const list = this.state && Array.isArray(this.state.entityList) ? this.state.entityList : [];
      return list.filter((e) => e && e.type === 'station');
    },

    _nearestStation(pos, maxWu = Infinity) {
      let best = null;
      let bestD = maxWu;
      for (const st of this._stations()) {
        if (!st || st.alive === false || !st.pos) continue;
        const d = st.data || {};
        if (d.isGate || d.isWormhole) continue;
        const dd = Math.hypot(st.pos.x - pos.x, st.pos.z - pos.z);
        if (dd <= bestD) { bestD = dd; best = st; }
      }
      return best;
    },

    /** The dump: a working spare dropped where a broken-down hull can reach it. */
    _onJettison(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || !p.commodityId) return;
      const now = this._now();
      if (now < this._farmUntil) return; // the chalks stop
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return;
      // The broken-down hull within reach (never the player).
      let needy = null;
      let needyD = SPARE_TUNING.reachWu;
      const ents = s.entities;
      const scan = (e) => {
        if (!e || e.alive === false || e.id === s.playerId || !isBrokenDown(e) || !e.pos) return;
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d <= needyD) { needyD = d; needy = e; }
      };
      if (ents && typeof ents.values === 'function') { for (const e of ents.values()) scan(e); }
      else if (Array.isArray(ents)) { for (const e of ents) scan(e); }
      else if (Array.isArray(s.entityList)) { for (const e of s.entityList) scan(e); }
      if (!needy) return;
      // The freshly jettisoned pod nearest the dump point.
      let pod = null;
      let podD = SPARE_TUNING.reachWu;
      const scanPod = (e) => {
        if (!e || e.alive === false || e.type !== 'payload' || !e.data || !e.data.jettisonedCargo || !e.pos) return;
        if (this._offers.has(e.id) || this._served.has(e.id)) return; // offered or taken once: the fresh dump is the one that counts
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d <= podD) { podD = d; pod = e; }
      };
      if (ents && typeof ents.values === 'function') { for (const e of ents.values()) scanPod(e); }
      else if (Array.isArray(ents)) { for (const e of ents) scanPod(e); }
      else if (Array.isArray(s.entityList)) { for (const e of s.entityList) scanPod(e); }
      if (!pod) return;
      pod.data = pod.data || {};
      pod.data[PL_259_OFFER_STAMP] = needy.id;
      while (this._offers.size >= SPARE_TUNING.memoryCap) this._offers.delete(this._offers.keys().next().value);
      this._offers.set(pod.id, { forHullId: needy.id, offeredAt: now });
    },

    /** Who actually took it: the needy hull taking the working spare — or you taking it back. */
    _onPickup(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || p.pickupId == null) return;
      const offer = this._offers.get(p.pickupId);
      if (!offer) return;
      this._offers.delete(p.pickupId);
      while (this._served.size >= SPARE_TUNING.memoryCap) this._served.delete(this._served.values().next().value);
      this._served.add(p.pickupId);
      const now = this._now();
      const collector = s.entities && s.entities.get ? s.entities.get(p.collectorId) : null;
      if (p.collectorId !== s.playerId && isBrokenDown(collector)) {
        // The cooldown is per hull: a deed is three docks chalked PAID, not three docks per
        // pod — the same broken hull re-fed inside the offer-memory window earns no more.
        const lastDeedAt = this._deeds.get(offer.forHullId);
        if (Number.isFinite(lastDeedAt) && now - lastDeedAt < SPARE_TUNING.offerMemoryS) return;
        // Word outruns you home: the next three docks chalk your berthing PAID.
        this._chalkCredits = Math.min(SPARE_TUNING.chalksPerDeed, this._chalkCredits + SPARE_TUNING.chalksPerDeed);
        while (this._deeds.size >= SPARE_TUNING.memoryCap) this._deeds.delete(this._deeds.keys().next().value);
        this._deeds.set(offer.forHullId, now);
        this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
        this.bus.emit(PLANTS_SPARE_EVENT, { forHullId: offer.forHullId, credits: this._chalkCredits, t: now });
      } else if (p.collectorId === s.playerId) {
        // Farm it with a fake breakdown: take the "spare" back yourself.
        this._chalkCredits = 0;
        this._farmUntil = now + SPARE_TUNING.farmCooldownS;
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
        this.bus.emit(PLANTS_SPARE_BILL_EVENT, { kind: 'farm', until: this._farmUntil, t: now });
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null) return; // payloads without shipId are not docking receipts
      if (p.shipId !== s.playerId) return;
      if (!p.inRange || !p.stationId) return;
      const now = this._now();
      const station = this._nearestStationById(p.stationId);
      if (!station) return;
      // One dock bills you for the wasted tow.
      if (now < this._farmUntil) {
        if (!(station.data && Number.isFinite(station.data[PL_259_BILLED_STAMP]) && station.data[PL_259_BILLED_STAMP] > now)) {
          station.data = station.data || {};
          station.data[PL_259_BILLED_STAMP] = now + SPARE_TUNING.paidUntilS;
          station.data.dockLampsFlashing = true;
          station.data.dockLampFlashUntil = now + 0.6;
          this._spawnChalk(station, now, 'TOW ON THE BILL');
          const id = `plants:pl259:bill:${p.stationId}:${Math.round(now)}`;
          this.bus.emit('comms:popup', { id, sender: 'DOCKMASTER', category: 'traffic', text: 'Chalks stopped. One dock bills the wasted tow.', ttl: 7, persist: false });
          this.bus.emit(PLANTS_SPARE_BILL_EVENT, { kind: 'billed', stationId: p.stationId, t: now });
        }
        return;
      }
      if (this._chalkCredits <= 0) return;
      if (station.data && Number.isFinite(station.data[PL_259_PAID_STAMP]) && station.data[PL_259_PAID_STAMP] > now) return;
      this._chalkCredits -= 1;
      station.data = station.data || {};
      station.data[PL_259_PAID_STAMP] = now + SPARE_TUNING.paidUntilS;
      this._spawnChalk(station, now, 'BERTHING PAID');
      const id = `plants:pl259:chalk:${p.stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'DOCKMASTER', category: 'traffic', text: 'Word outran you. Berthing chalked PAID.', ttl: 7, persist: false });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.45, rate: 1.0 });
      this.bus.emit(PLANTS_SPARE_CHALK_EVENT, { stationId: p.stationId, creditsLeft: this._chalkCredits, t: now });
    },

    _nearestStationById(stationId) {
      for (const st of this._stations()) {
        if (!st || st.alive === false) continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },

    /** The visible chalk mark: a board-side dressing prop with a floor-pad label. */
    _spawnChalk(station, now, label) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !station.pos) return;
      const r = this._dockRadius(station);
      const a = (Math.abs(Math.round(now)) % 6283) / 1000;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: station.pos.x + Math.cos(a) * (r + 14), z: station.pos.z + Math.sin(a) * (r + 14) },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl259_chalk',
          plantsPl259Chalk: true,
          scanLabel: `Dock board chalk: ${label.toLowerCase()}`,
          swarmFloorPad: { label },
          masslineTetherable: true,
          expireAt: now + SPARE_TUNING.paidUntilS,
        },
      });
      if (ent && ent.id != null) {
        while (this._chalkIds.size >= SPARE_TUNING.memoryCap) this._despawnChalk(this._chalkIds.keys().next().value);
        this._chalkIds.set(ent.id, now + SPARE_TUNING.paidUntilS);
      }
    },
  };
}

export const pl259SpareAndShare = createPl259SpareAndShare();
