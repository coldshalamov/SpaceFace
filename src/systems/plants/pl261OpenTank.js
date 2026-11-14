// PL-261 The open tank — "Come in dry to a dark waystation and the fuel hatch is unlocked,
// exactly one tank's worth, the tab chalked to nobody."
// What the player can do: Take the tank; or drain the lot — the next arrival finds it locked,
// with your name chalked.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "Come in dry" is the real player fuel bag (state.player.fuel); a "dark waystation" is a
//   small station (size 'S') or one whose services lack refuel — no invented registry.
// - The tank is a REAL jettisoned-cargo pod (persistent, physicsBody mass, tetherable) with
//   exactly one tank's worth; taking it is the real pickup:collected receipt, and the only
//   direct fuel write outside dock services (same seam honesty as goodPatch's hull write).
// - Drain the lot: a second tank taken inside the drain window locks the hatch — the next
//   arrival (cooldown) finds it locked with your name chalked (station stamp
//   plantsPl261LockedUntil + visible chalk pad).
// - Bounded Maps with tuning.memoryCap; per-station day cooldowns; RESET on sector:exit /
//   save:loaded / game:new / game:newGame; destroy() unsubscribes + despawns owned.

import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PLANTS_TANK_EVENT = 'plants:pl261:tank';
export const PLANTS_LOCKED_EVENT = 'plants:pl261:locked';

export const OPEN_TANK_TUNING = Object.freeze({
  plId: 'pl261',
  dryFrac: 0.15,             // come in dry
  oneTankUnits: 25,          // exactly one tank's worth
  dayLengthS: 240,
  drainWindowS: 300,         // a second take this soon (a day + slack) is draining the lot
  lockedUntilS: 600,         // the next arrival finds it locked
  podRadius: 4,
  memoryCap: 8,
});

export const PL_261_LOCKED_STAMP = 'plantsPl261LockedUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: is this station a dark waystation (small, or no refuel service)? */
export function isDarkWaystation(station) {
  if (!station || station.type !== 'station') return false;
  const d = station.data || {};
  if (d.isGate || d.isWormhole) return false;
  if (d.size === 'S') return true;
  const services = Array.isArray(d.services) ? d.services : null;
  return services != null && !services.includes('refuel');
}

export function createPl261OpenTank() {
  return {
    name: 'plantsPl261',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._tanks = new Map();       // stationId -> tank pod id (live offers)
      this._takenAt = new Map();     // stationId -> last take simTime
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('pickup:collected', (p = {}) => this._onPickup(p || {}));
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
      if (this._tanks) this._tanks.clear();
      if (this._takenAt) this._takenAt.clear();
    },

    update(dt) {
      // Event-driven: the receipts above carry this plant; the family shape keeps the hook.
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
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
      if (!fuel) return;
      const now = this._now();
      const station = this._stationById(p.stationId);
      if (!station || !isDarkWaystation(station)) return;
      const day = Math.floor(now / OPEN_TANK_TUNING.dayLengthS);
      const tankId = this._tanks.get(p.stationId);
      if (tankId != null) {
        const tank = s.entities && s.entities.get ? s.entities.get(tankId) : null;
        if (tank && tank.alive !== false) return; // the hatch is already open
        this._tanks.delete(p.stationId);
      }
      if (station.data && Number.isFinite(station.data[PL_261_LOCKED_STAMP]) && station.data[PL_261_LOCKED_STAMP] > now) return;
      const dry = Number.isFinite(fuel.max) && fuel.max > 0 && fuel.current <= fuel.max * OPEN_TANK_TUNING.dryFrac;
      if (!dry) return;
      const lastKey = `${p.stationId}:${day}`;
      if (this._takenAt.get(lastKey)) return; // one unlock per waystation day
      this._takenAt.set(lastKey, now);
      while (this._takenAt.size >= OPEN_TANK_TUNING.memoryCap * 2) this._takenAt.delete(this._takenAt.keys().next().value);
      this._spawnTank(station, now);
    },

    _spawnTank(station, now) {
      const stationId = (station.data && station.data.stationId) || station.id;
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId: 'cmdty_gas_hydrogen',
        amount: OPEN_TANK_TUNING.oneTankUnits,
        radius: OPEN_TANK_TUNING.podRadius,
        pos: { x: finite(station.pos.x) + 30, z: finite(station.pos.z) + 18 },
        vel: { x: 0, z: 0 },
        ownerId: null,
        ownerName: 'THE HATCH',
      }, this.helpers);
      if (!pod || pod.id == null) return;
      pod.data = pod.data || {};
      pod.data.plantsPl261OpenTank = true;
      pod.data.swarmFloorPad = { label: 'OPEN TANK — ONE' };
      pod.data.scanLabel = "The fuel hatch was left unlocked — one tank's worth, tab chalked to nobody";
      this._tanks.set(stationId, pod.id);
      const id = `plants:pl261:open:${stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE HATCH', category: 'traffic', text: "The hatch is unlocked. One tank's worth, tab chalked to nobody.", ttl: 7, persist: false });
      this.bus.emit('audio:cue', { id: 'sfx_vent_chime', position: null, gain: 0.35, rate: 0.9 });
      this.bus.emit(PLANTS_TANK_EVENT, { kind: 'unlocked', stationId, podId: pod.id, t: now });
    },

    _onPickup(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || p.pickupId == null) return;
      if (p.collectorId !== s.playerId) return;
      let owner = null;
      for (const [stationId, tankId] of this._tanks) {
        if (tankId === p.pickupId) { owner = stationId; break; }
      }
      if (owner == null) return;
      this._tanks.delete(owner);
      const now = this._now();
      const fuel = this._fuelBag();
      const prevTake = this._takenAt.get(`take:${owner}`);
      const last = Number.isFinite(prevTake) ? prevTake : -Infinity;
      this._takenAt.set(`take:${owner}`, now);
      while (this._takenAt.size >= OPEN_TANK_TUNING.memoryCap * 2) this._takenAt.delete(this._takenAt.keys().next().value);
      if (fuel && Number.isFinite(fuel.max)) {
        fuel.current = Math.min(fuel.max, fuel.current + OPEN_TANK_TUNING.oneTankUnits);
      }
      this.bus.emit(PLANTS_TANK_EVENT, { kind: 'taken', stationId: owner, t: now });

      // Drain the lot: a second tank inside the drain window locks the hatch.
      if (now - last >= 0 && now - last <= OPEN_TANK_TUNING.drainWindowS) {
        const station = this._stationById(owner);
        if (station) {
          station.data = station.data || {};
          station.data[PL_261_LOCKED_STAMP] = now + OPEN_TANK_TUNING.lockedUntilS;
          this._spawnChalk(station, now);
        }
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
        this.bus.emit(PLANTS_LOCKED_EVENT, { stationId: owner, until: now + OPEN_TANK_TUNING.lockedUntilS, t: now });
      }
    },

    _spawnChalk(station, now) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !station.pos) return;
      const player = this.state.entities && this.state.entities.get
        ? this.state.entities.get(this.state.playerId) : null;
      const who = String((player && player.data && (player.data.callsign || player.data.name)) || 'SOMEBODY');
      spawnEntity({
        type: 'beacon',
        pos: { x: finite(station.pos.x) - 34, z: finite(station.pos.z) - 14 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl261_chalk',
          plantsPl261Chalk: true,
          scanLabel: `Chalk on the hatch: LOCKED — ${who}`,
          swarmFloorPad: { label: 'LOCKED' },
          masslineTetherable: true,
        },
      });
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
  };
}

export const pl261OpenTank = createPl261OpenTank();
