// Loot shards (Wave M2 §4.3, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The finding that reframed this feature: pickup MAGNETISM already ships (mining._updatePickups —
// homing vacuum: inherits player velocity + relative approach, pickups only). The real chore was
// that a ship kill drops ONLY a salvage wreck you must sit on with the beam. So: on a player kill
// of a hostile ship, ALSO emit the shipped `loot:drop` seam with an immediate victim-scaled burst —
// materials from hull class/cargo, plus physical credit chips. Mining spawns each entry as its own
// pickup; cargo still owns commodity collection, and credit chips settle through economy on scoop.
// The bulk salvage wreck (and the whole salvage career) is untouched.
//
// Deterministic: each victim gets a stateless roll derived from the CURRENT run seed plus durable
// victim identity. There is no private cursor to serialize or accidentally carry across New Game.
// The core sim PRNG is never consumed by reward selection; pickup presentation still owns its
// ordinary placement draws downstream.
//
// D2 — civilian manifest cargo body (AQUARIUM-REPAIRS):
// A destroyed manifest-carrying civilian hull used to leave only cargoManifest strings on a dead
// entity. On death we spawn EXACTLY ONE tetherable `payload` via spawnPayloadEntity (industrial-beam
// pattern) whose salvagePool is that manifest. Cargo state stays cargo-owned — the payload carries
// a salvagePool snapshot, not a second cargo writer. Hostiles still take the shard path only.
//
// Payload cost / cap declaration:
// - Entity: one dynamic `payload` (collides, mass ≥ 20, hull, ownership stamp).
// - Save: flags.persistent so save/Continue round-trips the body (type `payload` is NOT a
//   world-record durable candidate — entityHasDurableMarkers excludes it).
// - Cap: MAX_CIVILIAN_MANIFEST_PAYLOADS live bodies. Excess disposes the oldest
//   (lowest entity id) — same bounded-eviction idea as aftermath wreck markers. Sector transition
//   despawns un-anchored transient payloads via handlePayloadSectorTransition; these bodies set
//   transientSector:false so a claimed/persistent body survives sector change while the cap still
//   bounds total residency.
import { spawnPayloadEntity } from '../combat/industrialBeam.js';
import { applyStyleMultiplier, styleMultiplierOf } from '../combat/killCause.js';
import { createVictimRewardRng, missionOwnsReward } from '../combat/rewardEligibility.js';
import { massline2Flag } from '../data/featureFlags.js';
import {
  isCreditChipItem,
  killResearchPointsForVictim,
  rollKillRewardItems,
} from '../data/killRewards.js';
import { isHostileToPlayer } from './scanner.js';

const SHARD_REWARD_SALT = 'loot_shards_reward_v3';

/** Live-resident cap for civilian-manifest cargo bodies (see file header). */
export const MAX_CIVILIAN_MANIFEST_PAYLOADS = 6;
export const CIVILIAN_MANIFEST_PAYLOAD_TYPE = 'civilian_manifest';

export function lootShardItemsFor(seed, victim) {
  const rng = createVictimRewardRng(seed, victim, SHARD_REWARD_SALT);
  return rollKillRewardItems(rng, victim);
}

/**
 * AC-08: scale the value of an already-rolled burst, never its substance.
 *
 * Runs strictly after `lootShardItemsFor` so the victim-local RNG stream, its draw order, and every
 * material line survive byte-identical — same array length, same order, same material objects. Only
 * credit chips are rewritten, and their `grantReason` (the economy's dedupe key) is preserved.
 */
export function scaleCreditChipItems(items, multiplier) {
  if (!Array.isArray(items)) return [];
  const scale = Number(multiplier);
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return items;
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isCreditChipItem(item)) {
      out.push(item);
      continue;
    }
    // Both fields carry the chip's value downstream (mining reads `credits` first, then `amount`).
    const credits = applyStyleMultiplier(item.credits, scale);
    out.push({ ...item, credits, amount: credits });
  }
  return out;
}

/** Expected-value helper for tests and balance audit (basePrice at equilibrium). */
export function lootShardBasePriceEv(items, commodityBasePriceById) {
  if (!Array.isArray(items) || !commodityBasePriceById) return 0;
  let total = 0;
  for (const it of items) {
    if (!it || !it.commodityId) continue;
    const price = Number(commodityBasePriceById.get?.(it.commodityId)
      ?? commodityBasePriceById[it.commodityId]) || 0;
    total += price * Math.max(0, Number(it.qty) || 0);
  }
  return total;
}

/** True when a cargoManifest carries at least one positive commodity line. */
export function validCivilianManifestForPayload(manifest) {
  if (!manifest || !Array.isArray(manifest.lines) || manifest.lines.length === 0) return false;
  let total = 0;
  for (let i = 0; i < manifest.lines.length; i++) {
    const line = manifest.lines[i];
    if (!line || typeof line.commodityId !== 'string' || !line.commodityId) return false;
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) return false;
    total += qty;
  }
  return total > 0;
}

/** Map manifest lines → salvagePool object (industrial-beam / mining drain shape). */
export function salvagePoolFromManifest(manifest) {
  const pool = {};
  if (!manifest || !Array.isArray(manifest.lines)) return pool;
  for (let i = 0; i < manifest.lines.length; i++) {
    const line = manifest.lines[i];
    if (!line || typeof line.commodityId !== 'string') continue;
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    pool[line.commodityId] = (pool[line.commodityId] || 0) + qty;
  }
  return pool;
}

function isCivilianManifestPayload(entity) {
  return !!(entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
}

/**
 * Bound live civilian-manifest payloads. Disposes oldest (lowest id) first — mirrors the
 * aftermath-wreck MAX_PER_SECTOR splice eviction pattern without inventing a new ledger.
 */
export function enforceCivilianManifestPayloadCap(state, bus, max = MAX_CIVILIAN_MANIFEST_PAYLOADS) {
  if (!state || !Number.isFinite(max) || max < 0) return 0;
  const found = [];
  const list = state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (isCivilianManifestPayload(list[i])) found.push(list[i]);
    }
  } else if (state.entities && typeof state.entities.values === 'function') {
    for (const entity of state.entities.values()) {
      if (isCivilianManifestPayload(entity)) found.push(entity);
    }
  }
  if (found.length <= max) return 0;
  found.sort((a, b) => (a.id | 0) - (b.id | 0));
  const drop = found.length - max;
  let removed = 0;
  for (let i = 0; i < drop; i++) {
    const entity = found[i];
    if (!entity) continue;
    entity.alive = false;
    if (state.entities && typeof state.entities.delete === 'function') {
      state.entities.delete(entity.id);
    }
    if (Array.isArray(state.entityList)) {
      const idx = state.entityList.indexOf(entity);
      if (idx >= 0) state.entityList.splice(idx, 1);
    }
    if (bus && typeof bus.emit === 'function') {
      bus.emit('entity:destroyed', { id: entity.id, type: 'payload', reason: 'manifest_payload_cap' });
    }
    removed += 1;
  }
  return removed;
}

export const lootShards = {
  id: 'lootShards',
  name: 'lootShards',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update() {},

  _onKilled(payload) {
    if (!massline2Flag('lootShards')) return;
    const state = this.state;
    const victim = payload.id != null && state.entities && state.entities.get
      ? state.entities.get(payload.id) : null;
    const type = victim ? victim.type : payload.type;
    if (type !== 'ship' && type !== 'drone') return;
    if (payload.id === state.playerId) return;
    if (!victim) return;
    // Contracts own contract-target rewards. Fail closed for mission hulls.
    if (missionOwnsReward(victim)) return;

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    // Production combat snapshots canonical hostility before synchronous damage consequences can
    // grant a clean victim retaliation authority. Older publishers fall back to current live truth.
    const targetHostileToPlayer = typeof payload.targetHostileToPlayer === 'boolean'
      ? payload.targetHostileToPlayer
      : !!(player && isHostileToPlayer(victim, player.team, state));

    // D2: non-hostile (civilian / traffic / convoy) hull with a real manifest → one cargo body.
    // Any killer: ambient predation and player piracy both leave a takeable body in the world.
    if (!targetHostileToPlayer) {
      this._trySpawnCivilianManifestPayload(payload, victim);
      return;
    }

    // Hostile path: player-earned shard burst only.
    if (payload.killerId !== state.playerId) return;
    if (!player) return;
    const pos = (victim && victim.pos) || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    // AC-08 style multiplier, read off the one immutable death receipt. An unclassified or absent
    // receipt pays ×1, so this stays byte-identical to the AC-01 burst for an ordinary kill.
    const styleMultiplier = styleMultiplierOf(payload.presentation && payload.presentation.style);
    const items = scaleCreditChipItems(
      lootShardItemsFor(state.meta && state.meta.seed, victim),
      styleMultiplier,
    );
    const vel = victim.vel && typeof victim.vel === 'object'
      ? {
        x: Number.isFinite(victim.vel.x) ? victim.vel.x : 0,
        z: Number.isFinite(victim.vel.z) ? victim.vel.z : 0,
      }
      : { x: 0, z: 0 };
    // Credits stay inside the physical chip items. A top-level credits field would look like
    // the authored combat grant-at-death receipt; AC-01 settles only on collection.
    this.bus.emit('loot:drop', {
      pos: { x: pos.x, z: pos.z },
      items,
      vel,
      source: 'kill_burst',
    });
    // Missions owns the one positive RP writer. Keep the receipt tied to this run-local entity
    // death so duplicate kill publication cannot pay twice; no XP or parallel progression wallet.
    const seed = state.meta && state.meta.seed;
    this.bus.emit('research:grant', {
      amount: applyStyleMultiplier(killResearchPointsForVictim(victim), styleMultiplier),
      source: 'hostile_kill',
      receiptId: `hostile-kill-rp:${seed == null ? 'run' : seed}:${victim.id}`,
    });
  },

  /**
   * Spawn exactly one payload carrying the victim's cargoManifest as salvagePool.
   * Cap: one per hull death; MAX_CIVILIAN_MANIFEST_PAYLOADS live bodies.
   */
  _trySpawnCivilianManifestPayload(payload, victim) {
    if (!victim || !victim.data) return null;
    // One payload per hull death — stamp survives if the dead entity lingers for a tick.
    if (victim.data.manifestPayloadDropped === true) return null;
    // PQ-047 freight custody owns the physical spill for authored manifest carriers (disable/death
    // pods through encounterScripts). Do not invent a second conserved body on the same hull.
    if (victim.data.freightRewardOwner === 'manifest_custody') return null;
    const custody = victim.data.freightCustody;
    if (custody && (custody.status === 'carrier' || custody.status === 'spilled'
      || custody.custodyId != null)) return null;
    const manifest = victim.data.cargoManifest;
    if (!validCivilianManifestForPayload(manifest)) return null;

    const pos = victim.pos || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;

    const pool = salvagePoolFromManifest(manifest);
    const radius = Math.max(3, Math.min(25, Math.round((Number(victim.radius) || 10) * 0.4)));
    const mass = Math.max(20, radius * 12);
    const vel = victim.vel && typeof victim.vel === 'object'
      ? {
        x: Number.isFinite(victim.vel.x) ? victim.vel.x * 0.15 : 0,
        z: Number.isFinite(victim.vel.z) ? victim.vel.z * 0.15 : 0,
      }
      : { x: 0, z: 0 };

    const entity = spawnPayloadEntity(this.state, {
      pos: { x: pos.x, z: pos.z },
      vel,
      radius,
      mass,
      hull: 100,
      hullMax: 100,
      // Unclaimed jettison: player takes custody via tether/beam, not auto-ownership.
      ownerId: null,
      factionId: victim.factionId || 'neutral',
      salvagePool: pool,
      payloadType: CIVILIAN_MANIFEST_PAYLOAD_TYPE,
      worldRecordId: null,
      transientSector: false,
    });
    entity.data.sourceVictimId = victim.id;
    entity.data.manifestId = typeof manifest.manifestId === 'string' ? manifest.manifestId : null;
    // Save/Continue: payloads are not world-record candidates; persist via entity flags.
    entity.flags = Object.assign({}, entity.flags, { persistent: true });
    victim.data.manifestPayloadDropped = true;

    enforceCivilianManifestPayloadCap(this.state, this.bus, MAX_CIVILIAN_MANIFEST_PAYLOADS);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('loot:manifestPayload', {
        payloadId: entity.id,
        victimId: victim.id,
        salvagePool: { ...entity.data.salvagePool },
      });
    }
    return entity;
  },
};
