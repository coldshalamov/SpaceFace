// Loot shards (Wave M2 §4.3, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The finding that reframed this feature: pickup MAGNETISM already ships (mining._updatePickups —
// homing vacuum: inherits player velocity + relative approach, pickups only). The real chore was
// that a ship kill drops ONLY a salvage wreck you must sit on with the beam. So: on a player kill
// of a hostile ship, ALSO emit the shipped `loot:drop` seam with an immediate shard burst — mining
// spawns every item entry as its own pickup, the magnet flies them into the hull, and cargo remains
// the collection writer. The bulk salvage wreck (and the whole salvage career) is untouched.
//
// Deterministic: each victim gets a stateless roll derived from the CURRENT run seed plus durable
// victim identity. There is no private cursor to serialize or accidentally carry across New Game.
// The core sim PRNG is never consumed by reward selection; pickup presentation still owns its
// ordinary placement draws downstream.
import { createVictimRewardRng, missionOwnsReward } from '../combat/rewardEligibility.js';
import { massline2Flag } from '../data/featureFlags.js';
import { isHostileToPlayer } from './scanner.js';

const SHARD_REWARD_SALT = 'loot_shards_reward_v2';
const SHARD_SCRAP_PICKUPS = 2;
const SHARD_SCRAP_MIN = 4;
const SHARD_SCRAP_MAX = 6;          // each scrap pickup rolls in [MIN, MAX]
const SHARD_ELECTRONICS_QTY = 2;

export function lootShardItemsFor(seed, victim) {
  const rng = createVictimRewardRng(seed, victim, SHARD_REWARD_SALT);
  const items = [];
  for (let i = 0; i < SHARD_SCRAP_PICKUPS; i++) {
    items.push({
      commodityId: 'cmdty_scrap_metal',
      qty: SHARD_SCRAP_MIN + Math.floor(rng() * (SHARD_SCRAP_MAX - SHARD_SCRAP_MIN + 1)),
    });
  }
  items.push({ commodityId: 'cmdty_salvage_electronics', qty: SHARD_ELECTRONICS_QTY });
  return items;
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
    if (payload.killerId !== state.playerId) return;   // shards are earned, not ambient
    const victim = payload.id != null && state.entities && state.entities.get
      ? state.entities.get(payload.id) : null;
    const type = victim ? victim.type : payload.type;
    if (type !== 'ship' && type !== 'drone') return;
    if (payload.id === state.playerId) return;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    // Contracts own contract-target rewards. The feature promise is an ambient hostile-kill burst,
    // not a second mission payout or a piracy bounty. Fail closed when the killed entity is already
    // unavailable instead of rewarding an unverifiable/neutral kill.
    if (missionOwnsReward(victim)) return;
    if (!victim || !player) return;
    // Production combat snapshots canonical hostility before synchronous damage consequences can
    // grant a clean victim retaliation authority. Older publishers fall back to current live truth.
    const targetHostileToPlayer = typeof payload.targetHostileToPlayer === 'boolean'
      ? payload.targetHostileToPlayer
      : !!isHostileToPlayer(victim, player.team, state);
    if (!targetHostileToPlayer) return;
    const pos = (victim && victim.pos) || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const items = lootShardItemsFor(state.meta && state.meta.seed, victim);
    this.bus.emit('loot:drop', { pos: { x: pos.x, z: pos.z }, items });
  },
};
