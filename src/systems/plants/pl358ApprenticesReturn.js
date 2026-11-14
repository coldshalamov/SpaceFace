// PL-358 The apprentice's return — "An apprentice you were decent to back at Helios turns up
// at Vesta years later, carrying exactly the part your build has been missing, at their own
// cost."
// What the player can do: Pay their price; or haggle them down — apprentices talk to
// journeymen, and journeymen set prices.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - SEAM NOTE (honest): the game has no per-hull price haggling seam, so the row's choice
//   maps to its physical verbs. "Decent to back at Helios" = a completed stranger tow at
//   Helios (shared towWatch view, released alive). "Years later" = real elapsed sim time.
//   The apprentice is an authored hull (darkStretch convention) carrying a REAL protocol part
//   pod (the piece your build has been missing). "Pay their price" = take the part beside
//   them, no shoving. "Haggle them down" = a shove-class physics:impact receipt: once is a
//   warning (they hold on), twice and they leave WITH the part — and journeymen set prices:
//   no apprentice returns for the journeyman window. Documented substitute, not a fake.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes + despawns owned.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_APPRENTICE_EVENT = 'plants:pl358:apprentice';

export const APPRENTICE_TUNING = Object.freeze({
  plId: 'pl358',
  heliosSectorId: 'sector_helios_prime',
  vestaSectorId: 'sector_vesta_forge',
  yearsS: 600,               // "years later" at the table clock
  journeymanS: 1800,         // journeymen set prices: no return this long
  holdS: 8,                  // a completed Helios tow
  approachRangeWu: 700,
  giveRangeWu: 60,
  holdRangeWu: 90,
  memoryCap: 4,
});

export const APPRENTICE_CALLSIGN = 'APPRENTICE';
export const PL_358_PART_STAMP = 'plantsPl358Part';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl358ApprenticesReturn() {
  return {
    name: 'plantsPl358',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();
      this._decentAt = null;
      this._apprenticeId = null;
      this._partPodId = null;
      this._arrivedSector = null;
      this._shoves = 0;
      this._journeymanUntil = -Infinity;
      this._warned = false;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      // The summon runs in update() off the live sector read (no enter handler needed).
      on('physics:impact', (p = {}) => this._onImpact(p || {}));
      on('pickup:collected', (p = {}) => this._onPickup(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
      this._pl358TowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'pl358', () => this._memory);
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
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm === 'function') {
        if (this._apprenticeId != null) rm(this._apprenticeId);
        if (this._partPodId != null) rm(this._partPodId);
      }
      if (this._memory) this._memory.clear();
      this._apprenticeId = null;
      this._partPodId = null;
      this._arrivedSector = null;
      this._shoves = 0;
      this._warned = false;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _player() {
      const s = this.state;
      return s && s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();

      // Decency ledger: a completed stranger tow at Helios.
      const sector = (s.world && s.world.currentSectorId) || 's1';
      if (sector === APPRENTICE_TUNING.heliosSectorId) {
        const target = towTargetIdOf(s, this._memory, now);
        if (target != null && target !== s.playerId) {
          const e = s.entities && s.entities.get ? s.entities.get(target) : null;
          if (e && e.type === 'ship' && e.alive !== false) {
            if (!this._tow || this._tow.targetId !== target) this._tow = { targetId: target, since: now };
          } else {
            this._settleTow(now);
          }
        } else {
          this._settleTow(now);
        }
      }

      // The return: Vesta, years later, journeyman window closed.
      if (this._apprenticeId == null && sector === APPRENTICE_TUNING.vestaSectorId
          && this._decentAt != null && now - this._decentAt >= APPRENTICE_TUNING.yearsS
          && now >= this._journeymanUntil) {
        this._summon(now);
      }

      // The apprentice holds alongside while the part waits.
      if (this._apprenticeId != null) {
        const apprentice = s.entities && s.entities.get ? s.entities.get(this._apprenticeId) : null;
        const player = this._player();
        if (!apprentice || apprentice.alive === false) { this._apprenticeId = null; return; }
        if (player && player.pos) {
          const d = Math.hypot(apprentice.pos.x - player.pos.x, apprentice.pos.z - player.pos.z);
          const aim = Math.atan2(player.pos.z - apprentice.pos.z, player.pos.x - apprentice.pos.x);
          requestTrafficReaction(this, apprentice, {
            moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: d <= APPRENTICE_TUNING.holdRangeWu,
          }, 2);
          // Gone at their own cost if the part is taken and you are away — the walk-off.
          if (this._partPodId == null && d > APPRENTICE_TUNING.approachRangeWu * 1.2) {
            releaseTrafficReaction(this, apprentice);
            if (typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(this._apprenticeId);
            this._apprenticeId = null;
          }
        }
        if (now >= this._arrivedSector + 300) {
          // The visit ends: part unclaimed, apprentice gone, no grudge.
          this._depart(now, 'visit_ended');
        }
      }
    },

    _settleTow(now) {
      const tow = this._tow;
      this._tow = null;
      if (!tow) return;
      const s = this.state;
      const e = s.entities && s.entities.get ? s.entities.get(tow.targetId) : null;
      if (e && e.alive !== false && now - tow.since >= APPRENTICE_TUNING.holdS) {
        this._decentAt = now;
        this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: 'decent_at_helios', targetId: tow.targetId, t: now });
      }
    },

    _summon(now) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      const player = this._player();
      if (typeof spawnEntity !== 'function' || !player || !player.pos) return;
      const spec = makeShipEntitySpec('ship_mule', {
        team: 2, factionId: 'faction_free',
        pos: { x: player.pos.x + APPRENTICE_TUNING.approachRangeWu * 0.4, z: player.pos.z - 60 },
        ai: { archetype: 'hauler', passive: true },
      });
      const ent = spawnEntity(spec);
      if (!ent || ent.id == null) return;
      ent.data = ent.data || {};
      ent.data.callsign = APPRENTICE_CALLSIGN;
      ent.data.plants = { ...(ent.data.plants || {}), [APPRENTICE_TUNING.plId]: { role: 'apprentice' } };
      this._apprenticeId = ent.id;
      this._arrivedSector = now;
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId: 'cmdty_inertial_datum',
        amount: 1,
        radius: 4,
        pos: { x: finite(ent.pos.x) - 10, z: finite(ent.pos.z) + 6 },
        vel: { x: 0, z: 0 },
        ownerId: ent.id,
        ownerName: APPRENTICE_CALLSIGN,
      }, this.helpers);
      if (pod && pod.id != null) {
        pod.data = pod.data || {};
        pod.data[PL_358_PART_STAMP] = true;
        pod.data.swarmFloorPad = { label: 'THE MISSING PART' };
        pod.data.scanLabel = 'Exactly the part your build has been missing — carried at their own cost';
        this._partPodId = pod.id;
      }
      const id = `plants:pl358:return:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: APPRENTICE_CALLSIGN, category: 'story', text: 'You were decent to me at Helios. I carried the part at my own cost.', ttl: 9, persist: false });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: 'returned', apprenticeId: ent.id, podId: pod ? pod.id : null, t: now });
    },

    /** Haggle them down: a shove is answered — once a warning, twice they leave with it. */
    _onImpact(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || this._apprenticeId == null) return;
      const hit = p.aId === this._apprenticeId || p.bId === this._apprenticeId;
      if (!hit || p.causalActorId !== s.playerId) return;
      const now = this._now();
      this._shoves += 1;
      if (this._shoves === 1 && !this._warned) {
        this._warned = true;
        const apprentice = s.entities.get(this._apprenticeId);
        if (apprentice) {
          apprentice.data = apprentice.data || {};
          apprentice.data.lampsFlashing = true;
          apprentice.data.lampFlashUntil = now + 1.2;
        }
        const id = `plants:pl358:warn:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: APPRENTICE_CALLSIGN, category: 'traffic', text: 'They hold the part tighter and say nothing.', ttl: 5, persist: false });
        this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: 'haggled', shoves: 1, t: now });
        return;
      }
      // Journeymen set prices: they leave with the part.
      const rm = this.helpers && this.helpers.removeEntity;
      if (this._partPodId != null && typeof rm === 'function') rm(this._partPodId);
      this._partPodId = null;
      this._depart(now, 'haggled_away');
      this._journeymanUntil = now + APPRENTICE_TUNING.journeymanS;
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
      const id = `plants:pl358:journeymen:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE JOURNEYMEN', category: 'traffic', text: 'Apprentices talk to journeymen. The price is set now.', ttl: 7, persist: false });
      this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: 'journeymen', until: this._journeymanUntil, t: now });
    },

    /** Pay their price: take the part beside them, no shoving. */
    _onPickup(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || p.pickupId !== this._partPodId || p.collectorId !== s.playerId) return;
      this._partPodId = null;
      const now = this._now();
      const apprentice = this._apprenticeId != null ? s.entities.get(this._apprenticeId) : null;
      if (apprentice) {
        apprentice.data = apprentice.data || {};
        apprentice.data.lampsFlashing = true;
        apprentice.data.lampFlashUntil = now + 1.5;
        releaseTrafficReaction(this, apprentice);
      }
      const id = `plants:pl358:paid:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: APPRENTICE_CALLSIGN, category: 'story', text: 'Their price, paid in full. They are gone before the ring lights.', ttl: 6, persist: false });
      this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: 'paid', t: now });
      if (this._apprenticeId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._apprenticeId);
        this._apprenticeId = null;
      }
    },

    _depart(now, why) {
      const rm = this.helpers && this.helpers.removeEntity;
      const s = this.state;
      const apprentice = this._apprenticeId != null && s.entities && s.entities.get
        ? s.entities.get(this._apprenticeId) : null;
      if (apprentice) releaseTrafficReaction(this, apprentice);
      if (this._apprenticeId != null && typeof rm === 'function') rm(this._apprenticeId);
      this._apprenticeId = null;
      this.bus.emit(PLANTS_APPRENTICE_EVENT, { kind: why, t: now });
    },
  };
}

export const pl358ApprenticesReturn = createPl358ApprenticesReturn();
