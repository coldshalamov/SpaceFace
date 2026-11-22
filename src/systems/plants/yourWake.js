// PL-194 Your wake — Boost past a working crew and their work scatters; ore piles drift, tethers swing.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Boost past a working crew and their work scatters — ore piles drift, tethers
//   swing, and the crews hold up whatever is at hand
//   What the player can do: Slow down past work; or owe three crews in one pass
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via WAKE_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; crews hold up whatever
//  is at hand (lamps + voice), so this plant steers nobody.
// - Cooldowns per crew key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';

export const PLANTS_WAKE_SCATTER_EVENT = 'plants:wakeScatter';
export const PLANTS_WAKE_OWE_EVENT = 'plants:wakeOwe';

export const WAKE_CREW_LINES = Object.freeze([
  'Hey! The piles!',
  'Watch the tethers!',
  'Mind the stack!',
]);

export const WAKE_TUNING = Object.freeze({
  boostSpeedWu: 150,          // the player is boosting above this
  wakeRadiusWu: 150,          // a crew inside this of the boosting player feels the wake
  crewCooldownS: 8,           // per-crew scatter cooldown
  pileRadiusWu: 90,           // pods within this of the crew are their work
  pushPerTickWu: 2.2,         // pod velocity increment per tick along the wake
  passGapS: 3,                // a boost gap longer than this ends the pass
  crewsForOwe: 3,             // three crews in one pass and you owe
  scanBudget: 40,             // entities examined per update tick (bounded walk)
  memoryCap: 32,              // bounded crew rows
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a working crew — a civilian hull at work near its ore piles.
 */
export function isWorkingCrew(entity, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  if (data.ai && data.ai.pirate === true) return false;
  const role = String(data.trafficRole || data.role || (data.ai && data.ai.role) || '').toLowerCase();
  return data.working === true || role.includes('miner') || role.includes('worker') || role.includes('crew');
}

/**
 * Decision helper (pure): wake push direction for a pod — along the player's velocity, or null
 * when the player is not actually boosting.
 */
export function wakePush(player, tuning = WAKE_TUNING) {
  if (!player || !player.vel) return null;
  const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  if (!(speed >= tuning.boostSpeedWu)) return null;
  return { x: finite(player.vel.x) / speed, z: finite(player.vel.z) / speed, speed };
}

/**
 * Memory-row builder (pure): per-crew scatter bookkeeping, FIFO + stale eviction at the cap.
 */
export function wakeRowFor(memory, crewId, now, cap = WAKE_TUNING.memoryCap) {
  if (!memory || !crewId) return null;
  let row = memory.get(crewId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > WAKE_TUNING.crewCooldownS * 6) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastScatterAt: -Infinity, scatters: 0, lastAt: now };
    memory.set(crewId, row);
  }
  return row;
}

/**
 * Standalone plant: a bounded walk each tick finds working crews inside the boosting player's
 * wake, scatters their piles, and tallies the pass for the owe-three bill.
 */
export const yourWakePlant = {
  modes: ['flight'],
  name: 'plantsPl194',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._wakeMemory = new Map();
    this._wakePass = { startAt: -Infinity, lastBoostAt: -Infinity, crews: [] };
    this._wakeCursor = 0;
    if (this.bus && typeof this.bus.on === 'function') {
      this._wakeOff = [
        this.bus.on('sector:exit', () => this._wakeReset()),
        this.bus.on('save:loaded', () => this._wakeReset()),
      ];
    }
  },

  _wakeReset() {
    this._wakeMemory = new Map();
    this._wakePass = { startAt: -Infinity, lastBoostAt: -Infinity, crews: [] };
    this._wakeCursor = 0;
  },

  _wakeEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  _wakeEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);
    const player = this._wakeEntityById(this.state.playerId);
    if (!player || player.alive === false || !player.pos) return;

    const push = wakePush(player);
    if (!push) {
      // Not boosting: the pass window decays.
      if (now - this._wakePass.lastBoostAt > WAKE_TUNING.passGapS) {
        this._wakePass = { startAt: -Infinity, lastBoostAt: -Infinity, crews: [] };
      }
      return;
    }
    if (this._wakePass.startAt < 0) this._wakePass.startAt = now;
    this._wakePass.lastBoostAt = now;

    const ents = this._wakeEntities();
    const budget = Math.min(WAKE_TUNING.scanBudget, ents.length);
    for (let i = 0; i < budget; i += 1) {
      const idx = (this._wakeCursor + i) % ents.length;
      const ent = ents[idx];
      if (!isWorkingCrew(ent, this.state)) continue;
      const cd = Math.hypot(finite(ent.pos.x) - finite(player.pos.x), finite(ent.pos.z) - finite(player.pos.z));
      if (cd > WAKE_TUNING.wakeRadiusWu) continue;

      const row = wakeRowFor(this._wakeMemory, ent.id, now);
      if (!row) continue;
      row.lastAt = now;
      if (now - row.lastScatterAt < WAKE_TUNING.crewCooldownS) continue;
      row.lastScatterAt = now;
      row.scatters += 1;

      // Their work scatters: pods drift along the wake.
      let pushed = 0;
      for (const other of ents) {
        if (!other || other.alive === false || other.type !== 'cargo' || !other.pos) continue;
        const pd = Math.hypot(finite(other.pos.x) - finite(ent.pos.x), finite(other.pos.z) - finite(ent.pos.z));
        if (pd > WAKE_TUNING.pileRadiusWu) continue;
        other.vel = other.vel || { x: 0, z: 0 };
        other.vel.x += push.x * WAKE_TUNING.pushPerTickWu;
        other.vel.z += push.z * WAKE_TUNING.pushPerTickWu;
        pushed += 1;
      }

      // The crews hold up whatever is at hand.
      const data = ent.data || (ent.data = {});
      data.lampsFlashing = true;
      data.lampFlashUntil = now + 1.0;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_WAKE_SCATTER_EVENT, {
          crewId: ent.id,
          pushed,
          scatters: row.scatters,
          t: now,
        });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            id: `plants:pl194:${ent.id}`,
            text: WAKE_CREW_LINES[hash32(String(ent.id), 'wakeLine', row.scatters) % WAKE_CREW_LINES.length],
            kind: 'traffic',
            ttl: 3,
          });
        }
      }

      // Owe three crews in one pass.
      if (!this._wakePass.crews.includes(ent.id)) this._wakePass.crews.push(ent.id);
      if (this._wakePass.crews.length >= WAKE_TUNING.crewsForOwe) {
        const crews = this._wakePass.crews.length;
        this._wakePass = { startAt: -Infinity, lastBoostAt: -Infinity, crews: [] };
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_WAKE_OWE_EVENT, { crews, t: now });
          this.bus.emit('comms:popup', {
            id: 'plants:pl194:owe',
            sender: 'FIELD CREWS',
            category: 'traffic',
            text: 'Three crews. You owe.',
            ttl: 6,
          });
        }
      }
    }
    this._wakeCursor = (this._wakeCursor + budget) % Math.max(1, ents.length);
  },

  destroy() {
    if (this._wakeOff) {
      for (const off of this._wakeOff) {
        if (typeof off === 'function') off();
      }
      this._wakeOff = null;
    }
  },
};
