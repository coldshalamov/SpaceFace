// PL-267 The queue pass — "Give up your berth slot to a visibly overloaded hauler and the
// dockmaster chalks you PREFERRED on the board for a week."
// What the player can do: Shout at the overloaded one instead — PREFERRED becomes LAST, in
// the same chalk.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - The berth slot is the player's real dock:range hold; "visibly overloaded" is a REAL
//   civilian hauler whose mass is far over its class (the dispatch passes ships with mass).
//   Giving up the slot = leaving dock range while the overloaded hauler is closing, and the
//   hauler then takes the berth (reaches dock radius) — a counted yield.
// - HONEST LIMIT: the game has no player comm/honk input, so "shout" is its physical
//   substitute: a shove-class physics:impact receipt by the player against the overloaded
//   hauler during its approach. One shout voids PREFERRED; two become LAST in the same
//   chalk. Documented substitute, not a silent fake.
// - The chalk is visible (station-side prop + swarmFloorPad) and stamps
//   plantsPl267PreferredUntil / plantsPl267LastUntil on the station for other systems.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes + despawns.

export const PLANTS_QUEUE_EVENT = 'plants:pl267:queue';

export const QUEUE_TUNING = Object.freeze({
  shoutCadenceS: 0.6,         // physics re-emits per grind frame — one shove, one shout
  plId: 'pl267',
  heavyMassMult: 40,          // "visibly overloaded": mass well over a hull's class
  vacateWindowS: 25,          // the hauler must take the berth this soon after the yield
  dockRadiusFallbackWu: 90,
  chalkWeekS: 600,            // PREFERRED on the board for a week (table clock)
  shoutGraceS: 2,             // impacts inside the grace of the yield are the shout
  memoryCap: 8,
});

export const PL_267_PREFERRED_STAMP = 'plantsPl267PreferredUntil';
export const PL_267_LAST_STAMP = 'plantsPl267LastUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: a visibly overloaded civilian hauler. */
export function isOverloadedHauler(e, state = null) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
  if (state && e.id === state.playerId) return false;
  const data = e.data || {};
  if (data.isGate || data.isWormhole || data.disabled || data.derelict) return false;
  const role = String(data.trafficRole || data.role || (data.ai && (data.ai.role || data.ai.archetype)) || '').toLowerCase();
  if (!role.includes('hauler') && !role.includes('freighter')) return false;
  const mass = finite(e.mass, 0) || finite(data.physicsBody && data.physicsBody.mass, 0);
  return mass >= QUEUE_TUNING.heavyMassMult;
}

export function createPl267QueuePass() {
  return {
    name: 'plantsPl267',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._holding = null;        // { stationId, since }
      this._yields = new Map();    // stationId -> { at, haulerId }
      this._shouts = new Map();    // haulerId -> count
      this._chalkIds = new Map();  // chalk prop id -> expireAt (owned marks live and die with the stamp)
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
      this._holding = null;
      if (this._yields) this._yields.clear();
      if (this._shouts) this._shouts.clear();
      this._despawnAllChalks();
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

    _entities() {
      const s = this.state;
      const ents = s && s.entities;
      if (ents && typeof ents.values === 'function') return [...ents.values()];
      if (Array.isArray(ents)) return ents;
      return Array.isArray(s && s.entityList) ? s.entityList : [];
    },

    _stationById(stationId) {
      for (const st of this._entities()) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      // Expired chalk marks come off the board with their week stamp.
      for (const [id, expireAt] of this._chalkIds) {
        if (Number.isFinite(expireAt) && now < expireAt) continue;
        this._despawnChalk(id);
      }
      // Did a yielded-to hauler take the berth?
      for (const [stationId, y] of this._yields) {
        if (y.done) continue;
        if (y.shouted >= 1) { y.done = true; continue; } // shouted down: PREFERRED never grants
        const station = this._stationById(stationId);
        const hauler = s.entities && s.entities.get ? s.entities.get(y.haulerId) : null;
        if (!station || !hauler || hauler.alive === false) { y.done = true; continue; }
        const d = station.data || {};
        const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : QUEUE_TUNING.dockRadiusFallbackWu;
        const dd = Math.hypot(hauler.pos.x - station.pos.x, hauler.pos.z - station.pos.z);
        if (dd <= r && now - y.at <= QUEUE_TUNING.vacateWindowS) {
          y.done = true;
          this._grantPreferred(station, now);
        } else if (now - y.at > QUEUE_TUNING.vacateWindowS) {
          y.done = true;
        }
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.stationId) return;
      const now = this._now();
      if (p.inRange) {
        this._holding = { stationId: p.stationId, since: now };
        return;
      }
      // Giving up the berth slot: you were holding and an overloaded hauler is closing.
      if (!this._holding || this._holding.stationId !== p.stationId) return;
      const station = this._stationById(p.stationId);
      this._holding = null;
      if (!station || !station.pos) return;
      const d = station.data || {};
      const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : QUEUE_TUNING.dockRadiusFallbackWu;
      let hauler = null;
      let haulerD = r * 3;
      for (const e of this._entities()) {
        if (!e || e.alive === false || !isOverloadedHauler(e, s) || !e.pos) continue;
        const dd = Math.hypot(e.pos.x - station.pos.x, e.pos.z - station.pos.z);
        if (dd <= haulerD) { haulerD = dd; hauler = e; }
      }
      if (!hauler) return;
      while (this._yields.size >= QUEUE_TUNING.memoryCap) this._yields.delete(this._yields.keys().next().value);
      this._yields.set(p.stationId, { stationId: p.stationId, at: now, haulerId: hauler.id, done: false });
      this.bus.emit(PLANTS_QUEUE_EVENT, { kind: 'yielded', stationId: p.stationId, haulerId: hauler.id, t: now });
    },

    /** Shout at the overloaded one: PREFERRED becomes LAST, in the same chalk. */
    _onImpact(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.causalActorId !== s.playerId) return;
      const now = this._now();
      for (const [, y] of this._yields) {
        if (y.done || (p.aId !== y.haulerId && p.bId !== y.haulerId)) continue;
        if (now - y.at > QUEUE_TUNING.vacateWindowS) continue;
        const station = this._stationById(y.stationId);
        if (!station) break;
        // One shove, one shout: physics re-emits per grind frame, so a cadence guard
        // keeps a held shove from collapsing the two-shove beat into one contact.
        if (y.lastShoutAt != null && now - y.lastShoutAt < QUEUE_TUNING.shoutCadenceS) continue;
        y.lastShoutAt = now;
        const count = (this._shouts.get(y.haulerId) || 0) + 1;
        while (this._shouts.size >= QUEUE_TUNING.memoryCap) this._shouts.delete(this._shouts.keys().next().value);
        this._shouts.set(y.haulerId, count);
        y.shouted = count;
        station.data = station.data || {};
        station.data[PL_267_PREFERRED_STAMP] = -Infinity;
        if (count >= 2) {
          // LAST, in the same chalk: the yield is settled.
          y.done = true;
          station.data[PL_267_LAST_STAMP] = now + QUEUE_TUNING.chalkWeekS;
          this._spawnChalk(station, now, 'LAST');
        }
        this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
        this.bus.emit(PLANTS_QUEUE_EVENT, { kind: count >= 2 ? 'last' : 'voided', stationId: (station.data && station.data.stationId) || station.id, haulerId: y.haulerId, shouts: count, t: now });
        break;
      }
    },

    _grantPreferred(station, now) {
      const stationId = (station.data && station.data.stationId) || station.id;
      const stationData = station.data || (station.data = {});
      if (Number.isFinite(stationData[PL_267_LAST_STAMP]) && stationData[PL_267_LAST_STAMP] > now) return;
      stationData[PL_267_PREFERRED_STAMP] = now + QUEUE_TUNING.chalkWeekS;
      this._spawnChalk(station, now, 'PREFERRED');
      const id = `plants:pl267:preferred:${stationId}:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'DOCKMASTER', category: 'traffic', text: 'Gave up your slot. Board chalks you PREFERRED.', ttl: 7, persist: false });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.45, rate: 1.0 });
      this.bus.emit(PLANTS_QUEUE_EVENT, { kind: 'preferred', stationId, until: stationData[PL_267_PREFERRED_STAMP], t: now });
    },

    _spawnChalk(station, now, label) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !station.pos) return;
      const d = station.data || {};
      const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : QUEUE_TUNING.dockRadiusFallbackWu;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: station.pos.x + (r + 10), z: station.pos.z - 8 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl267_chalk',
          plantsPl267Chalk: true,
          scanLabel: `The dock board chalk: ${label}`,
          swarmFloorPad: { label },
          masslineTetherable: true,
          expireAt: now + QUEUE_TUNING.chalkWeekS,
        },
      });
      if (ent && ent.id != null) {
        while (this._chalkIds.size >= QUEUE_TUNING.memoryCap) this._despawnChalk(this._chalkIds.keys().next().value);
        this._chalkIds.set(ent.id, now + QUEUE_TUNING.chalkWeekS);
      }
    },
  };
}

export const pl267QueuePass = createPl267QueuePass();
