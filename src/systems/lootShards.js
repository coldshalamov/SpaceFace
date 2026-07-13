// Loot shards (Wave M2 §4.3, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// The finding that reframed this feature: pickup MAGNETISM already ships (mining._updatePickups —
// range 420, accel 520, pickups only). The real chore was that a ship kill drops ONLY a salvage
// wreck you must sit on with the beam. So: on a player kill of a hostile ship, ALSO emit the
// shipped `loot:drop` seam with a small shard pool — mining spawns the pickups, the shipped
// magnet pulls them in, cargo collects them. The bulk salvage wreck (and the whole salvage
// career) is untouched; shards are pocket change that keeps the fun verbs (fling/tumble/throw)
// from ending in a parking chore.
//
// Deterministic: own mulberry32 stream (never the core sim PRNG), flag-gated, not in the sim
// harness.
import { massline2Flag } from '../data/featureFlags.js';
import { isHostileToPlayer } from './scanner.js';

const SHARD_SCRAP_MIN = 1;
const SHARD_SCRAP_MAX = 2;          // scrap qty rolls in [MIN, MAX]
const SHARD_ELECTRONICS_CHANCE = 0.35;

export const lootShards = {
  id: 'lootShards',
  name: 'lootShards',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const seed = (ctx.state.meta && ctx.state.meta.seed) || 1;
    this._rng = ctx.helpers.mulberry32(ctx.helpers.hash32(seed, 'lootShards'));
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
    // The feature promise is hostile-kill pocket change, not a piracy bounty. Fail closed when
    // the killed entity is already unavailable instead of rewarding an unverifiable/neutral kill.
    if (!victim || !player || !isHostileToPlayer(victim, player.team, state)) return;
    const pos = (victim && victim.pos) || payload.pos;
    if (!pos || !Number.isFinite(pos.x)) return;

    const items = [{
      commodityId: 'cmdty_scrap_metal',
      qty: SHARD_SCRAP_MIN + Math.floor(this._rng() * (SHARD_SCRAP_MAX - SHARD_SCRAP_MIN + 1)),
    }];
    if (this._rng() < SHARD_ELECTRONICS_CHANCE) {
      items.push({ commodityId: 'cmdty_salvage_electronics', qty: 1 });
    }
    this.bus.emit('loot:drop', { pos: { x: pos.x, z: pos.z }, items });
  },
};
