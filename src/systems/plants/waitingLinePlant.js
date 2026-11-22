// PL-221 The waiting line — "Once, your hull snags on a line that was already waiting for you.
// Nothing on the other end. It lets go the moment you slow. Slow down; or run full boost, and
// it holds on a while"
//
// A seeded, once-per-sector meeting: a line strung between two story-prop buoys (nothing on
// the other end — the buoys are the only physical trace). Crossing the line segment at speed
// snags the player: each tick inside the snag the line applies a bounded drag impulse against
// the player's velocity through the physics authority (never a direct vel write). Slowing
// below letGoSpeedWu lets go immediately. Running full boost holds it on: the snag persists
// (drag keeps applying) up to holdOnMaxS. The line then lets go on its own and the meeting
// is spent for the sector.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. No NPC hulls at all: the line is physics + props.
// - Physical: the drag is a real impulse through the physics authority; the segment is
//   real geometry between two real buoys (segmentCrossesLine, pure).
// - Bounded Maps capped by tuning.memoryCap; one snag per sector (cooldown by shape).
// - Nothing runs while docked; gates/wormholes excluded; the player is never an NPC.

import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { hash32 } from '../../core/rng.js';

export const WAITING_LINE_EVENT = 'plants:waitingLine';

export const WAITING_LINE_TUNING = Object.freeze({
  plId: 'pl221',
  spawnChancePct: 40,
  lineLenWu: 420,              // buoy to buoy
  snagSpeedWu: 70,             // crossing slower than this never snags
  letGoSpeedWu: 30,            // it lets go the moment you slow below this
  // The line's drag as a physical decel: ~150 wu/s^2 sits below a boosting reaction drive
  // (~267 wu/s^2 with boostAccelMult on mainAccel 124 — full boost can hold speed against
  // it, so "run full boost and it holds on a while" is true) but well above a coasting
  // hull, which bleeds speed and lets go.
  dragAccelWuPerS2: 150,
  holdOnMaxS: 6,               // run full boost and it holds on a while
  strangerTtlS: 1200,
  memoryCap: 8,
});

export const WAITING_LINE_BUOY_LABEL = 'Waiting line end — nothing on the other end';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure segment crossing test: did segment AB cross segment CD between ticks? */
export function segmentCrossesLine(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (px, py, qx, qy, rx, ry) => {
    const val = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
    return val > 0 ? 1 : (val < 0 ? -1 : 0);
  };
  const d1 = d(ax, az, bx, bz, cx, cz);
  const d2 = d(ax, az, bx, bz, dx, dz);
  const d3 = d(cx, cz, dx, dz, ax, az);
  const d4 = d(cx, cz, dx, dz, bx, bz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export const waitingLinePlant = {
  modes: ['flight'],
  name: 'plants221',

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
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const enc = this._memory.get('enc');
    if (!enc || enc.spent) return;
    const buoyA = this._entity(enc.buoyAId);
    const buoyB = this._entity(enc.buoyBId);
    const player = this._player();
    if (!buoyA || !buoyB || !player || !player.pos) return;

    const step = finite(dt, 1 / 60);
    const prev = enc.lastPlayerPos;
    const cur = { x: finite(player.pos.x), z: finite(player.pos.z) };
    const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));

    if (!enc.snag) {
      if (prev && speed >= WAITING_LINE_TUNING.snagSpeedWu) {
        const crossed = segmentCrossesLine(
          prev.x, prev.z, cur.x, cur.z,
          finite(buoyA.pos.x), finite(buoyA.pos.z),
          finite(buoyB.pos.x), finite(buoyB.pos.z),
        );
        if (crossed) {
          enc.snag = true;
          enc.snagStartAt = now;
          this._cue('warning', cur, 0.9, 0.8);
          this.bus.emit(WAITING_LINE_EVENT, { kind: 'snagged', speed: Math.round(speed), t: now });
        }
      }
      enc.lastPlayerPos = cur;
      return;
    }

    // Snagged: hold while boosting, let go the moment the player slows.
    if (speed < WAITING_LINE_TUNING.letGoSpeedWu) {
      this._letGo(enc, now, 'slowed');
      enc.lastPlayerPos = cur;
      return;
    }
    if (now - enc.snagStartAt >= WAITING_LINE_TUNING.holdOnMaxS) {
      this._letGo(enc, now, 'held_on_max');
      enc.lastPlayerPos = cur;
      return;
    }
    // Bounded drag against the player's velocity through the physics authority: a physical
    // decel (dragAccelWuPerS2 * dt * mass), never a direct vel write.
    const vlen = speed || 1;
    const dv = WAITING_LINE_TUNING.dragAccelWuPerS2 * step;
    const mass = finite(player.mass, 1) || 1;
    if (typeof queuePhysicsImpulse === 'function') {
      queuePhysicsImpulse(player, {
        x: (-finite(player.vel.x) / vlen) * dv * mass,
        z: (-finite(player.vel.z) / vlen) * dv * mass,
      }, { tick: s.tick });
    }
    enc.lastPlayerPos = cur;
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
    while (this._memory.size >= WAITING_LINE_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnBuoy(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: WAITING_LINE_BUOY_LABEL,
        storyPropKind: 'waiting_line_buoy',
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'buoy', expiresAt: this._now() + WAITING_LINE_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl221', 'spawn') % 100 >= WAITING_LINE_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    // A line across the lane, waiting: two buoys and the segment between them.
    const half = WAITING_LINE_TUNING.lineLenWu / 2;
    const buoyA = this._spawnBuoy({ x: base.x + 200, z: base.z + half });
    const buoyB = this._spawnBuoy({ x: base.x + 200, z: base.z - half });
    if (!buoyA || !buoyB) { this._despawnOwned(); return; }
    this._capMemory();
    this._memory.set('enc', {
      buoyAId: buoyA.id,
      buoyBId: buoyB.id,
      snag: false,
      snagStartAt: null,
      spent: false,
      lastPlayerPos: null,
    });
  },

  _letGo(enc, now, reason) {
    enc.snag = false;
    enc.spent = true; // once, per sector
    this.bus.emit(WAITING_LINE_EVENT, { kind: 'let_go', reason, t: now });
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
      this.bus.emit(WAITING_LINE_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
