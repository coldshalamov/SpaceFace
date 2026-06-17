// Core system: owns the entity store + lifecycle, the per-step prelude (tick/time/snapshot),
// the end-of-step lifetime sweep, and the cross-cutting helpers exposed via ctx.helpers (§4.3).
import { makeEntity } from './entity.js';
import { mulberry32, hash32, wrapAngle } from './rng.js';

const DAY_SECONDS = 600; // 10 sim-minutes per in-game "day" (faction decay/conflict cadence)

export const core = {
  name: 'core',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._lastDay = 0;

    const state = this.state, bus = this.bus;

    const spawnEntity = (spec) => {
      const e = makeEntity(spec);
      const id = state.freeIds.length ? state.freeIds.pop() : state.nextEntityId++;
      e.id = id;
      state.entities.set(id, e);
      state.entityList.push(e);
      bus.emit('entity:spawned', { id, type: e.type, entity: e });
      return e;
    };
    const getEntity = (id) => state.entities.get(id) || null;
    const removeEntity = (id) => { const e = state.entities.get(id); if (e) e.alive = false; };
    const queryRadius = (pos, r, out = []) => {
      out.length = 0;
      state.spatialHash.queryRadius(pos.x, pos.z, r, out);
      return out.filter((e) => {
        const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
        return dx * dx + dz * dz <= r * r;
      });
    };
    const player = () => state.entities.get(state.playerId) || null;

    Object.assign(ctx.helpers, {
      spawnEntity, getEntity, removeEntity, queryRadius, player,
      mulberry32, hash32, wrapAngle,
    });
    this.helpers = ctx.helpers;

    // force-kill (missions/console)
    bus.on('entity:kill', ({ id, killerId }) => {
      const e = state.entities.get(id);
      if (e && e.alive) { e.alive = false; e._killerId = killerId; }
    });
    bus.on('entity:spawnRequest', ({ spec }) => spawnEntity(spec));
  },

  // Prelude: advance clocks and snapshot interpolation state. Called by registry.step().
  preStep(dt, state) {
    state.tick++;
    state.simTime += dt;
    state.meta.playtimeS += dt;
    for (const e of state.entityList) {
      e.prevPos.copy(e.pos);
      e.prevRot = e.rot;
      e.prevBank = e.bank;   // snapshot roll for renderer interpolation (Phase 1 banking)
    }
    const day = Math.floor(state.simTime / DAY_SECONDS);
    if (day !== this._lastDay) {
      const elapsed = day - this._lastDay;
      this._lastDay = day; state.days = day;
      this.bus.emit('day:tick', { days: day, elapsed });
    }
  },

  // End-of-step: TTL/despawn, sweep dead entities, recycle ids, flush deferred events.
  lifetimeSweep(dt, state) {
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.alive && e.ttl !== Infinity) { e.ttl -= dt; if (e.ttl <= 0) e.alive = false; }
      if (e.alive && e.data && e.data.despawnAt != null && state.simTime >= e.data.despawnAt) e.alive = false;
      if (!e.alive) {
        this.bus.queue('entity:destroyed', {
          id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId,
        });
        state.entities.delete(e.id);
        state.freeIds.push(e.id);
        // swap-remove
        const last = list.pop();
        if (i < list.length) list[i] = last;
      }
    }
    this.bus.flush();
  },
};
