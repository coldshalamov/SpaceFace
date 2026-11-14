// PL-300 The kind checker — "A customs checker waves a small overweight with a chalk:
// 'Next time, fix it.' Fix it and the next overweight is waved too.
// Fix it before you return; or come back the same — the checker remembers exactly, and
// stops waving entirely"
//
// Customs-station meeting (per row note): the trigger is dock:range at a customs station —
// a station whose profile services contain 'scan' and 'toll' — while your cargo mass reads
// above the station's tolerance. The wave is a chalk: one exact comms line, plus a real
// chalk prop (a swarmFloorPad-labeled pad on the apron) carrying the chalk text.
//
// - Fix it before you return: come back inside the fix window reading under tolerance and
//   the checker grants the waiver — the NEXT overweight is waved too (one more chalk).
// - Come back the same: overweight again after the window closed with no fixed return, and
//   the checker remembers exactly: waves stop entirely (refusedUntil stamp) — one final
//   line, then silence at every customs dock after.
//
// ECONOMY-OWNER HANDOFF (documented per task): this module writes NO economy mutation. The
// "waive" is a narrative stamp + a real receipt event (`kind:'waved'`, carrying stationId
// and the over-mass) that the toll/customs owner may honor; the actual toll charge remains
// owned by its canonical writer and is untouched here.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now; no Three.js/DOM.
// - Bounded Maps capped by tuning.memoryCap; caps: one chalk prop live; TTL despawns.
// - Nothing runs while docked (dock:range is only the seam); the player is never the NPC.

import { stationInfo } from '../../economy/stationMarketProfile.js';

export const KIND_CHECKER_EVENT = 'plants:kindChecker';

export const KIND_CHECKER_TUNING = Object.freeze({
  plId: 'pl300',
  toleranceMass: 30,           // the station's overweight tolerance at docking
  fixWindowS: 600,             // fix it before you return
  waiverSeasonS: 1800,         // the granted waiver's season
  refusedSeasonS: 3600,        // "stops waving entirely": a very long memory
  chalkPadTtlS: 300,
  memoryCap: 8,
});

export const KIND_CHECKER_CALLSIGN = 'CUSTOMS CHECKER';
export const KIND_CHECKER_CHALK_LINE = 'Next time, fix it.';
export const KIND_CHECKER_WAVE_AGAIN_LINE = 'Waved again. Keep it clean.';
export const KIND_CHECKER_REFUSE_LINE = 'No more waves for you.';
export const KIND_CHECKER_CHALK_LABEL = 'NEXT TIME — FIX IT';
export const KIND_CHECKER_WAIVER_LABEL = 'CHECKER — WAIVER GOOD';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is this station profile a customs post (checker territory)? */
export function isCustomsStation(info) {
  if (!info || !Array.isArray(info.services)) return false;
  return info.services.includes('scan') && info.services.includes('toll');
}

/** Pure: how far over the tolerance is this cargo mass (0 when inside it)? */
export function overweightOf(cargoMass, tolerance = KIND_CHECKER_TUNING.toleranceMass) {
  return Math.max(0, finite(cargoMass, 0) - finite(tolerance, 0));
}

/** Pure: the checker's verdict for this docking. */
export function checkerVerdict({ overMass, waved, waiverUntil, refusedUntil, fixedInWindow, now, tuning = KIND_CHECKER_TUNING }) {
  if (finite(overMass, 0) <= 0) return 'clean';
  if (Number.isFinite(refusedUntil) && now < refusedUntil) return 'refused';
  if (Number.isFinite(waiverUntil) && now < waiverUntil) return 'waved';
  if (waved && fixedInWindow) return 'waived';
  if (waved) return 'overdue';
  return 'first_over';
}

export const kindCheckerPlant = {
  name: 'plants300',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map();
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
    on('dock:range', (p) => this._onDockRange(p));
  },

  update() {
    // The whole meeting lives on the dock:range seam; nothing per-tick.
    this._sweepExpired(this._now());
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _capMemory() {
    while (this._memory.size >= KIND_CHECKER_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnChalkPad(stationId, label, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    this._despawnChalk();
    const ent = spawnEntity({
      type: 'pickup',
      team: 0,
      pos: { x: 0, z: 0 }, // station-relative stamp; the pad records the station
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 6,
      mass: 1,
      collides: true,
      data: {
        kind: 'checker_chalk',
        amount: 1,
        playerCollectOnly: true,
        stationId,
        swarmFloorPad: { label },
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'chalk', expiresAt: now + KIND_CHECKER_TUNING.chalkPadTtlS });
    return ent;
  },

  _despawnChalk() {
    for (const [id, row] of [...this._owned]) {
      if (row.kind === 'chalk') this._remove(id);
    }
  },

  _onDockRange(p) {
    if (!this._flight() || !p || p.inRange !== true) return;
    const s = this.state;
    const now = this._now();
    const info = stationInfo(s, p.stationId);
    if (!isCustomsStation(info)) return;
    const player = this._player();
    if (!player) return;
    const cargoMass = Math.max(0, Number(player.cargo && player.cargo.usedMass) || 0);
    const over = overweightOf(cargoMass);

    const row = this._memory.get('checker') || {
      waved: false, wavedAt: null, fixedInWindow: false,
      waiverUntil: null, refusedUntil: null,
    };
    const verdict = checkerVerdict({
      overMass: over, waved: row.waved, waiverUntil: row.waiverUntil,
      refusedUntil: row.refusedUntil, fixedInWindow: row.fixedInWindow, now,
    });

    if (verdict === 'clean') {
      // Fix it before you return: an under-tolerance docking inside the fix window banks it.
      if (row.waved && !row.fixedInWindow
          && row.wavedAt != null && now - row.wavedAt <= KIND_CHECKER_TUNING.fixWindowS) {
        row.fixedInWindow = true;
        this.bus.emit(KIND_CHECKER_EVENT, { kind: 'fixed', stationId: p.stationId, t: now });
      }
      this._memory.set('checker', row);
      return;
    }

    if (verdict === 'refused') {
      // The checker remembers exactly. Silence after the one final line.
      this._memory.set('checker', row);
      this.bus.emit(KIND_CHECKER_EVENT, { kind: 'refused_silent', stationId: p.stationId, over, t: now });
      return;
    }

    if (verdict === 'first_over' || verdict === 'waived') {
      // The chalk: the small overweight waved, with the exact line.
      row.waved = true;
      row.wavedAt = now;
      if (verdict === 'waived') {
        // The NEXT overweight is waved too — the waiver's season refreshes.
        row.waiverUntil = now + KIND_CHECKER_TUNING.waiverSeasonS;
        this._say(`plants:${KIND_CHECKER_TUNING.plId}:waveagain:${now}`,
          KIND_CHECKER_CALLSIGN, KIND_CHECKER_WAVE_AGAIN_LINE, 6);
        this._spawnChalkPad(p.stationId, KIND_CHECKER_WAIVER_LABEL, now);
        this.bus.emit(KIND_CHECKER_EVENT, {
          kind: 'waved', waivedAgain: true, stationId: p.stationId, over, t: now,
        });
      } else {
        this._say(`plants:${KIND_CHECKER_TUNING.plId}:chalk:${now}`,
          KIND_CHECKER_CALLSIGN, KIND_CHECKER_CHALK_LINE, 7);
        this._spawnChalkPad(p.stationId, KIND_CHECKER_CHALK_LABEL, now);
        this.bus.emit(KIND_CHECKER_EVENT, {
          kind: 'waved', stationId: p.stationId, over, fixBy: now + KIND_CHECKER_TUNING.fixWindowS, t: now,
        });
      }
      this._memory.set('checker', row);
      return;
    }

    if (verdict === 'overdue') {
      // Come back the same: the checker remembers exactly, and stops waving entirely.
      row.refusedUntil = now + KIND_CHECKER_TUNING.refusedSeasonS;
      this._say(`plants:${KIND_CHECKER_TUNING.plId}:refuse:${now}`,
        KIND_CHECKER_CALLSIGN, KIND_CHECKER_REFUSE_LINE, 6);
      this._capMemory();
      this._memory.set('checker', row);
      this.bus.emit(KIND_CHECKER_EVENT, {
        kind: 'refused', stationId: p.stationId, over, until: row.refusedUntil, t: now,
      });
    }
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(KIND_CHECKER_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _say(id, sender, text, ttl) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl });
    } else {
      this.bus.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },
};
