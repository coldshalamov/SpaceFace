// PL-168 Ruth's knock — "Any wreck in the garden's reach: bump it once before you Line
// it, and something knocks back, once."
// What the player can do: "Knock, always; or skip it, and the growth holds your line one
// beat too long on release."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no
//   Three.js/DOM imports.
// - All state on `this` (session-only); knock ledger bounded (tuning.memoryCap);
//   cooldown per wreck.
// - Anchors sector_charon_expanse / poi_charon_hull_garden (Three Hull Garden) with
//   station_expanse as fallback; wrecks are read from live entities (type 'wreck'), the
//   knock-back is an audio cue plus a stamped receipt on the wreck's data.
// - Honest limit: the actual tether delay on a skipped knock belongs to the tether
//   system (single writer); this plant records and announces the held beat and stamps
//   the wreck — it does not edit tether code.

export const PLANTS_RUTHS_KNOCK_EVENT = 'plants:ruthsKnock';

export const RUTHS_TUNING = Object.freeze({
  plId: 'pl168',
  sectorId: 'sector_charon_expanse',
  stationId: 'station_expanse',
  poiId: 'poi_charon_hull_garden',
  gardenRangeWu: 520,       // the garden's reach
  knockImpulseMin: 120,     // a bump, not a brush
  knockGraceS: 90,          // knock then Line inside this, and it answers clean
  knockCooldownS: 30,       // per wreck
  lineCatchRangeWu: 140,    // a throw landing this close Lines that wreck
  memoryCap: 12,            // wreck ledger entries
});

/** Pure: is `pos` in the garden's reach of `gardenPos`? */
export function inGarden(pos, gardenPos, rangeWu = RUTHS_TUNING.gardenRangeWu) {
  if (!pos || !gardenPos) return false;
  return Math.hypot(pos.x - gardenPos.x, pos.z - gardenPos.z) <= rangeWu;
}

/** Pure: the verdict for Lining a wreck — 'cleanLine' | 'heldBeat' | 'idle'. */
export function lineVerdict(knockedAt, now, graceS = RUTHS_TUNING.knockGraceS) {
  if (Number.isFinite(knockedAt) && now - knockedAt <= graceS) return 'cleanLine';
  if (Number.isFinite(knockedAt)) return 'idle';
  return 'heldBeat';
}

export const ruthsKnockPlant = {
  modes: ['flight'],
  name: 'plants168',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._knocks = new Map();   // wreckId -> knockedAt (bounded)
    this._heldOnce = new Set(); // wrecks that already announced a held beat
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('physics:impact', (p) => this._onImpact(p));
    on('massline:throw', (p) => this._onThrow(p));
    on('sector:exit', () => { this._knocks = new Map(); this._heldOnce = new Set(); });
  },

  update() { /* event-driven: knocks and Lines are facts, not sweeps */ },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._knocks = new Map();
    this._heldOnce = new Set();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _garden() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === RUTHS_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === RUTHS_TUNING.poiId) return e;
      }
    }
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const l of lists) {
      if (!l) continue;
      for (const e of l) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === RUTHS_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _wreck(id) {
    const s = this.state;
    const e = s.entities && s.entities.get(id);
    return e && e.alive !== false && e.type === 'wreck' ? e : null;
  },

  _rememberKnock(wreckId, now) {
    if (this._knocks.size >= RUTHS_TUNING.memoryCap && !this._knocks.has(wreckId)) {
      const oldest = this._knocks.keys().next().value;
      this._knocks.delete(oldest);
    }
    this._knocks.set(wreckId, now);
  },

  _onImpact(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== RUTHS_TUNING.sectorId) return;
    if (s && s.mode && s.mode !== 'flight') return;
    const aId = p.aId != null ? p.aId : p.entityId;
    const bId = p.bId != null ? p.bId : p.otherId;
    if (aId == null || bId == null) return;
    const garden = this._garden();
    if (!garden) return;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player) return;
    // one side is your hull, the other a wreck, both in the garden's reach
    const playerId = s.playerId;
    let wreckId = null;
    if (aId === playerId && this._wreck(bId)) wreckId = bId;
    else if (bId === playerId && this._wreck(aId)) wreckId = aId;
    if (wreckId == null) return;
    const wreck = this._wreck(wreckId);
    if (!inGarden(player.pos, garden.pos) || !inGarden(wreck.pos, garden.pos)) return;
    const impulse = Number(p.impulseMag != null ? p.impulseMag : p.impulse);
    if (!Number.isFinite(impulse) || impulse < RUTHS_TUNING.knockImpulseMin) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const last = this._knocks.get(wreckId);
    if (Number.isFinite(last) && now - last < RUTHS_TUNING.knockCooldownS) return;
    this._rememberKnock(wreckId, now);
    if (!wreck.data) wreck.data = {};
    wreck.data.plants168KnockedAt = now;
    // something knocks back, once
    this.bus.emit('audio:cue', { id: 'confirm', position: wreck.pos, gain: 0.7, rate: 0.6 });
    this.bus.emit(PLANTS_RUTHS_KNOCK_EVENT, { kind: 'knocked', wreckId, impulse, t: now });
  },

  _onThrow(p) {
    const s = this.state;
    if (!s || !this.bus || !p) return;
    if ((s.world && s.world.currentSectorId) !== RUTHS_TUNING.sectorId) return;
    if (s && s.mode && s.mode !== 'flight') return;
    const garden = this._garden();
    if (!garden) return;
    const player = s.entities && s.entities.get(s.playerId);
    if (!player || !player.pos || !inGarden(player.pos, garden.pos)) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    // the wreck you Line: the aim target, or the wreck your anchor lands beside
    let wreck = p.aimTargetId != null ? this._wreck(p.aimTargetId) : null;
    if (!wreck && player.pos) {
      const list = Array.isArray(s.entityList) ? s.entityList : [];
      for (const e of list) {
        if (e && e.alive !== false && e.type === 'wreck' && e.pos
          && Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) <= RUTHS_TUNING.lineCatchRangeWu
          && inGarden(e.pos, garden.pos)) { wreck = e; break; }
      }
    }
    if (!wreck || !inGarden(wreck.pos, garden.pos)) return;
    const verdict = lineVerdict(this._knocks.get(wreck.id), now);
    if (verdict === 'cleanLine') {
      // knocked first: the Line comes away clean
      this.bus.emit('audio:cue', { id: 'confirm', position: wreck.pos, gain: 0.6, rate: 1.0 });
      this.bus.emit(PLANTS_RUTHS_KNOCK_EVENT, { kind: 'cleanLine', wreckId: wreck.id, t: now });
      this._knocks.delete(wreck.id);
    } else if (verdict === 'heldBeat' && !this._heldOnce.has(wreck.id)) {
      this._heldOnce.add(wreck.id);
      if (!wreck.data) wreck.data = {};
      wreck.data.plants168HeldOnce = true;
      // skip the knock: the growth holds your line one beat too long on release
      this.bus.emit('audio:cue', { id: 'warning', position: wreck.pos, gain: 0.5, rate: 0.7 });
      this.bus.emit(PLANTS_RUTHS_KNOCK_EVENT, { kind: 'heldBeat', wreckId: wreck.id, t: now });
    }
  },
};
