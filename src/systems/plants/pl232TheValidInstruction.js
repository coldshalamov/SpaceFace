// PL-232 The valid instruction — "Once a shift, Points Dunmore routes a string through a
// clear lane and the whole yard obeys instantly, right or wrong | Obey with them; or hold
// your ground — the string parts around you, and you were valid too"
//
// SEAM NOTE (honest): Tethys Trade Hub is the station_tethys body in sector_tethys_junction
// (src/data/sectors.js:478). Once a shift on the shared plant clock, Points Dunmore's
// instruction goes out on the yard channel and a REAL string — neutral strangers
// (makeShipEntitySpec, team 2, passive) nose-to-tail — walks the clear lane this shift
// (hash-picked per shift, one of two). The yard obeys instantly: the movers hold their
// lane from the first tick. The player has the same two valid choices the yard has:
// ride the lane with them (obey), or hold ground in the lane — each mover parts around
// the player's position at close range, and Dunmore marks you valid too. Cut the string
// across and the string will not yield its lane: movers honk and hold line.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the string,
//   clears session state (tuning.memoryCap).
// - One instruction per shift; movers' positions advance only in update().

import { hash32 } from '../../core/rng.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_232_INSTRUCTION_EVENT = 'plants:pl232:instruction';
export const PL_232_OBEYED_EVENT = 'plants:pl232:obeyed';
export const PL_232_PARTED_EVENT = 'plants:pl232:parted';
export const PL_232_CUT_EVENT = 'plants:pl232:cut';

export const VALID_INSTRUCTION_TUNING = Object.freeze({
  sectorId: 'sector_tethys_junction',
  stationId: 'station_tethys',
  shiftLengthS: 120,
  instructionPhaseS: 14,      // the instruction goes out this deep into each shift
  laneOffsetWu: 420,
  laneLengthWu: 420,
  laneWidthWu: 46,            // the clear lane's corridor
  bearingSalt: 'plantsPl232Lanes',
  stringCount: 4,
  moverSpacingWu: 64,
  moverSpeedWu: 15,
  transitS: 30,               // the string clears the lane this fast
  holdGateSpeed: 3,           // "hold your ground"
  obeyGateSpeed: 6,
  divertRadiusWu: 52,         // a mover parts around a grounded body inside this
  divertPadWu: 22,
  moverHulls: Object.freeze(['ship_mule', 'ship_wasp', 'ship_mule', 'ship_drifter']),
  factionId: 'faction_mts',
  memoryCap: 8,
});

export const DUNMORE_COPY = 'Clear lane. String through. Move.';
export const DUNMORE_VALID_COPY = 'You were valid too.';

/** The lane this shift uses, hash-picked per shift: two parallel clear lanes. */
export function laneFor(shiftIndex, origin, t = VALID_INSTRUCTION_TUNING) {
  const which = hash32('plantsPl232Lane', String(shiftIndex)) % 2;
  const side = which === 0 ? -1 : 1;
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const perp = { x: -dir.z, z: dir.x };
  const entry = {
    x: origin.x + perp.x * side * t.laneOffsetWu - dir.x * t.laneLengthWu / 2,
    z: origin.z + perp.z * side * t.laneOffsetWu - dir.z * t.laneLengthWu / 2,
  };
  return {
    which,
    from: entry,
    to: { x: entry.x + dir.x * t.laneLengthWu, z: entry.z + dir.z * t.laneLengthWu },
    dir,
  };
}

export function createPl232TheValidInstruction() {
  return {
    name: 'plantsPl232',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._moverIds = [];
      this._activeShift = null;   // shift index with a string live
      this._lane = null;
      this._shiftSeen = -1;
      this._stringStart = null;
      this._obeyedShift = null;
      this._partedShift = null;
      this._cutShift = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._resetVisit());
      on('save:loaded', () => this._resetVisit());
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
      this._despawnString();
      this._resetVisit();
    },

    _resetVisit() {
      this._despawnString();
      this._activeShift = null;
      this._lane = null;
      this._shiftSeen = -1;
      this._stringStart = null;
      this._obeyedShift = null;
      this._partedShift = null;
      this._cutShift = null;
    },

    _despawnString() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._moverIds || []) rm(id);
      }
      this._moverIds = [];
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _spawnString(origin, shiftIndex) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = VALID_INSTRUCTION_TUNING;
      this._despawnString();
      const lane = laneFor(shiftIndex, origin, t);
      for (let i = 0; i < t.stringCount; i += 1) {
        const back = i * t.moverSpacingWu;
        const spec = makeShipEntitySpec(t.moverHulls[i % t.moverHulls.length], {
          team: 2,
          factionId: t.factionId,
          pos: { x: lane.from.x - lane.dir.x * back, z: lane.from.z - lane.dir.z * back },
          rot: Math.atan2(lane.dir.z, lane.dir.x),
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl232Mover = true;
        spec.data.parentType = 'story_prop';
        spec.data.stringShift = shiftIndex;
        spec.data.stringSlot = i;
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._moverIds.push(ent.id);
      }
      this._activeShift = shiftIndex;
      this._lane = lane;
      this._stringStart = this._now();
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== VALID_INSTRUCTION_TUNING.sectorId) { this._resetVisit(); return; }
      const station = stationOf(s, VALID_INSTRUCTION_TUNING.stationId);
      if (!station?.pos) { this._resetVisit(); return; }
      const t = VALID_INSTRUCTION_TUNING;
      const now = this._now();

      // Once a shift, the instruction and the string.
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const phase = ((now % t.shiftLengthS) + t.shiftLengthS) % t.shiftLengthS;
      if (shiftIndex !== this._shiftSeen) {
        this._shiftSeen = shiftIndex;
        if (this._activeShift != null && this._activeShift !== shiftIndex) {
          this._despawnString();
          this._activeShift = null;
          this._lane = null;
        }
      }
      if (this._activeShift == null && phase >= t.instructionPhaseS) {
        this._spawnString(station.pos, shiftIndex);
        this.bus?.emit('comms:popup', {
          id: `plants:pl232:instruction:${shiftIndex}`,
          sender: 'Points Dunmore',
          category: 'traffic',
          text: DUNMORE_COPY,
          ttl: 7,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'warning' });
        this.bus?.emit(PL_232_INSTRUCTION_EVENT, {
          shift: shiftIndex, lane: this._lane?.which, t: now,
        });
      }

      if (this._activeShift == null || !this._lane) return;
      const lane = this._lane;

      // The string walks its lane and obeys instantly, right or wrong.
      const elapsed = now - this._stringStart;
      const progress = Math.min(1, elapsed / t.transitS);
      const head = {
        x: lane.from.x + lane.dir.x * t.laneLengthWu * progress,
        z: lane.from.z + lane.dir.z * t.laneLengthWu * progress,
      };
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      const playerPos = player?.pos || null;
      const speed = player ? Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0) : 0;

      let groundedNearby = false;
      this._moverIds.forEach((id, i) => {
        const mover = id != null && s.entities?.get ? s.entities.get(id) : null;
        if (!mover?.pos) return;
        const back = i * t.moverSpacingWu;
        let mx = head.x - lane.dir.x * back;
        let mz = head.z - lane.dir.z * back;
        // Hold your ground and the string parts around you, then closes up behind.
        if (playerPos && speed <= t.holdGateSpeed) {
          const dxp = playerPos.x - mx;
          const dzp = playerPos.z - mz;
          const dp = Math.hypot(dxp, dzp);
          if (dp < t.divertRadiusWu) {
            groundedNearby = true;
            const side = (dxp * lane.dir.z - dzp * lane.dir.x) >= 0 ? -1 : 1;
            mx += lane.dir.z * side * t.divertPadWu;
            mz += -lane.dir.x * side * t.divertPadWu;
          }
        }
        mover.pos.x = mx;
        mover.pos.z = mz;
        mover.rot = Math.atan2(lane.dir.z, lane.dir.x);
      });
      if (groundedNearby && this._partedShift !== this._activeShift) {
        this._partedShift = this._activeShift;
        this.bus?.emit('comms:popup', {
          id: `plants:pl232:valid:${this._activeShift}`,
          sender: 'Points Dunmore',
          category: 'traffic',
          text: DUNMORE_VALID_COPY,
          ttl: 7,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_232_PARTED_EVENT, { shift: this._activeShift, t: now });
      }

      if (!playerPos) return;

      // The player's two valid choices share the lane with the string.
      const rel = {
        x: playerPos.x - lane.from.x,
        z: playerPos.z - lane.from.z,
      };
      const along = rel.x * lane.dir.x + rel.z * lane.dir.z;
      const across = rel.x * lane.dir.z - rel.z * lane.dir.x;
      const inCorridor = along >= -40 && along <= t.laneLengthWu + 40
        && Math.abs(across) <= t.laneWidthWu / 2 + 14;
      if (!inCorridor) return;
      const alongSpeed = (Number(player.vel?.x) || 0) * lane.dir.x + (Number(player.vel?.z) || 0) * lane.dir.z;
      if (speed <= t.holdGateSpeed) {
        // Holding ground is valid; the parting above already answered.
        return;
      }
      if (alongSpeed >= t.obeyGateSpeed && this._obeyedShift !== this._activeShift) {
        // Obey with them: ride the clear lane the string's way.
        this._obeyedShift = this._activeShift;
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_232_OBEYED_EVENT, { shift: this._activeShift, t: now });
        return;
      }
      // Moving across the string's way: the string will not yield its lane.
      if (Math.abs(alongSpeed) < t.obeyGateSpeed * 0.5 && this._cutShift !== this._activeShift) {
        this._cutShift = this._activeShift;
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_232_CUT_EVENT, { shift: this._activeShift, t: now });
      }
    },
  };
}

export const pl232TheValidInstruction = createPl232TheValidInstruction();
