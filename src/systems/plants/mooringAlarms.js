// PL-176 Through the moorings — Boost across a field of parked ships: alarms chirp in sequence as you pass.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Boost across a field of parked ships and every alarm chirps in sequence as
//   you pass, a wave of complaint following you to the far side
//   What the player can do: Cut the boost; or listen to the whole field complain
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via MOORING_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; parked ships never
//   move — alarms and complaint barks only, so this plant leases nobody.
// - Cooldowns per ship key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { plantMapOrder } from '../plantEntityViews.js';

export const PLANTS_MOORING_ALARM_EVENT = 'plants:mooringAlarm';
export const PLANTS_MOORING_WAVE_EVENT = 'plants:mooringComplaintWave';

export const MOORING_COMPLAINTS = Object.freeze([
  'Hey! Watch the paint!',
  'Who authorized a slalom?',
  'Settle down out there!',
  'Some of us are moored!',
]);

export const MOORING_TUNING = Object.freeze({
  boostSpeedWu: 150,          // player counts as boosting above this speed
  parkedSpeedWu: 4,           // a hull below this speed is parked
  alarmRadiusWu: 130,         // the alarm wakes when the boosting player is this close
  shipChirpCooldownS: 6,      // per-ship alarm cooldown
  waveWindowS: 20,            // complaints inside this window form one pass's wave
  waveAlarmCount: 5,          // alarms in the window before the whole field is "complaining"
  scanBudget: 48,             // entities examined per update tick (bounded walk)
  memoryCap: 48,              // bounded per-ship rows
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a parked ship (dead in the water, not the player, not a gate prop).
 */
export function isParkedShip(entity, state = null, tuning = MOORING_TUNING) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  const speed = Math.hypot(finite(entity.vel && entity.vel.x), finite(entity.vel && entity.vel.z));
  return speed <= tuning.parkedSpeedWu || data.parked === true;
}

/**
 * Decision helper (pure): is the boosting player inside this parked ship's alarm radius?
 */
export function mooringAlarmHit(player, ship, tuning = MOORING_TUNING) {
  if (!player || !ship || !player.pos || !ship.pos || !player.vel) return null;
  const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  if (!(speed >= tuning.boostSpeedWu)) return null;
  const d = Math.hypot(finite(player.pos.x) - finite(ship.pos.x), finite(player.pos.z) - finite(ship.pos.z));
  const reach = tuning.alarmRadiusWu + finite(ship.radius, 6);
  if (!(d <= reach)) return null;
  return { dist: d, speed };
}

/**
 * Memory-row builder (pure): per-ship alarm bookkeeping, FIFO + stale eviction at the cap.
 */
export function mooringRowFor(memory, shipId, now, cap = MOORING_TUNING.memoryCap) {
  if (!memory || !shipId) return null;
  let row = memory.get(shipId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > MOORING_TUNING.shipChirpCooldownS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastAlarmAt: -Infinity, alarms: 0, lastAt: now };
    memory.set(shipId, row);
  }
  return row;
}

/**
 * Standalone plant: walks a bounded slice of the entity list each tick, chirping alarms in
 * sequence (ordered by proximity along the pass) as the boosting player crosses the field.
 */
export const mooringAlarmsPlant = {
  modes: ['flight'],
  name: 'plantsPl176',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._mooringMemory = new Map();
    this._mooringCursor = 0;
    this._mooringWave = { startAt: -Infinity, alarms: 0, fired: false };
    if (this.bus && typeof this.bus.on === 'function') {
      this._mooringOff = [
        this.bus.on('sector:exit', () => this._mooringReset()),
        this.bus.on('save:loaded', () => this._mooringReset()),
      ];
    }
  },

  _mooringReset() {
    this._mooringMemory = new Map();
    this._mooringCursor = 0;
    this._mooringWave = { startAt: -Infinity, alarms: 0, fired: false };
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);
    const player = this.state.entities
      && (typeof this.state.entities.get === 'function' ? this.state.entities.get(this.state.playerId) : null)
      || (Array.isArray(this.state.entities) ? this.state.entities.find((e) => e.id === this.state.playerId) : null);
    if (!player || player.alive === false) return;

    const entities = this.state.entities;
    const size = Array.isArray(entities) ? entities.length : entities.size;
    if (!size) return;

    // Bounded round-robin scan: at most scanBudget entities per tick, sector-scoped.
    const budget = Math.min(MOORING_TUNING.scanBudget, size);
    const start = this._mooringCursor;
    this._mooringCursor = (start + budget) % size;
    if (!player.pos || !player.vel
      || Math.hypot(finite(player.vel.x), finite(player.vel.z)) < MOORING_TUNING.boostSpeedWu) return;
    const ents = plantMapOrder(this.state);
    const hits = [];
    for (let i = 0; i < budget; i += 1) {
      const idx = (start + i) % size;
      const ent = ents[idx];
      if (!isParkedShip(ent, this.state)) continue;
      const hit = mooringAlarmHit(player, ent);
      if (hit) hits.push({ ent, hit });
    }

    // Nearest first: the alarm wave follows the player across the field.
    hits.sort((a, b) => a.hit.dist - b.hit.dist);
    for (const { ent } of hits) {
      const row = mooringRowFor(this._mooringMemory, ent.id, now);
      if (!row) continue;
      row.lastAt = now;
      if (now - row.lastAlarmAt < MOORING_TUNING.shipChirpCooldownS) continue;
      row.lastAlarmAt = now;
      row.alarms += 1;

      const data = ent.data || (ent.data = {});
      data.lampsFlashing = true;
      data.lampFlashUntil = now + 0.6;

      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('audio:cue', {
          id: 'warning',
          position: { x: ent.pos.x, z: ent.pos.z },
          gain: 0.5,
          rate: 1.6,
        });
        this.bus.emit(PLANTS_MOORING_ALARM_EVENT, { shipId: ent.id, alarms: row.alarms, t: now });
      }
    }

    // Wave of complaint: enough alarms inside the window and the whole field grumbles once.
    if (hits.length > 0) {
      if (now - this._mooringWave.startAt > MOORING_TUNING.waveWindowS) {
        this._mooringWave = { startAt: now, alarms: 0, fired: false };
      }
      this._mooringWave.alarms += hits.length;
      if (!this._mooringWave.fired && this._mooringWave.alarms >= MOORING_TUNING.waveAlarmCount) {
        this._mooringWave.fired = true;
        const complaint = MOORING_COMPLAINTS[hash32(this._mooringWave.startAt | 0, 'moorWave', this.state.world?.currentSectorId || 's') % MOORING_COMPLAINTS.length];
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_MOORING_WAVE_EVENT, { alarms: this._mooringWave.alarms, text: complaint, t: now });
          if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
            this.helpers.voice.say({
              channel: 'comms',
              id: 'plants:pl176:wave',
              text: complaint,
              kind: 'traffic',
              ttl: 4,
            });
          }
        }
      }
    }
  },

  destroy() {
    if (this._mooringOff) {
      for (const off of this._mooringOff) {
        if (typeof off === 'function') off();
      }
      this._mooringOff = null;
    }
  },
};
