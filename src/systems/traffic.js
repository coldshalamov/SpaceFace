// Ambient NPC traffic (V2 §28b / cut-list #2 visible-haulers). Spawns benign freighter ships that
// ply station-to-station routes, making populated space feel ALIVE and — now that the economy
// wallet bug is fixed — actually moving market prices via aiTrader:requestTrade. This is the §31-Q16
// trick: a *sample* of visible ships consistent with the aggregate economy flow, not a full sim
// of every trader in the universe.
//
// Design:
//   - Spawns on sector:enter, scaled by sector.trafficPerMin (data exists, was unused) with a sane
//     default. Capped small (<=6) so perf is predictable — these are flavour + economy nudge, not a
//     swarm. Frontier sectors with trafficPerMin:0 get none (matches their "hollow" identity).
//   - Each freighter is team 2 (neutral; visualFactory renders team 2 gold, distinct from player
//     blue and hostile red). ai._isHostile returns true for cross-team by default, BUT these
//     freighters set ai.archetype='fleeing_trader' + ai.passive=true and the AI is gated to skip
//     them (see ai.update) so they never attack anyone — they just fly routes. They CAN be attacked
//     by the player (piracy!) which raises heat via the heat system.
//   - Route logic: pick a random station in-sector, fly toward it (slow, no boost), on proximity
//     "dock" (emit aiTrader:requestTrade with a small random commodity/qty), wait briefly, pick a
//     new station. Loop. Despawn on sector:leave (view-gated, V2 §34).
//   - Single-writer: traffic owns only its own spawned entities (tracked in state.traffic); it
//     never touches player state. Economy impact is via the event bus.

import { makeShipEntitySpec } from './ships.js';
import { drawSeeded, hash32 } from '../core/rng.js';

const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
const MAX_PER_SECTOR = 6;
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
const DOCK_RANGE = 60;         // how close before "docking" (trading)
const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)

export const traffic = {
  name: 'traffic',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    // live freighter records: id -> {targetId, waitT, nextTradeT}
    this.state.traffic = { freighters: [], rngSeed: hash32(this.state.meta && this.state.meta.seed, 'traffic', 'boot') };
    this._active = []; // entity ids we spawned (for cleanup)

    this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
    this.bus.on('sector:leave', () => this._cleanup());
  },

  _onSectorEnter(p) {
    this._cleanup(); // wipe previous sector's freighters (view-gated)
    const sector = p && p.sector;
    if (!sector || !this.helpers || !this.helpers.spawnEntity) return;
    this._resetRngForSector(sector.id || (p && p.sectorId) || (this.state.world && this.state.world.currentSectorId) || 'unknown');
    // No freighters in the player's home on a brand-new game (feels dead before the economy warms),
    // and none where the sector explicitly says so. Otherwise a small ambient count.
    const tpm = sector.trafficPerMin;
    let count;
    if (typeof tpm === 'number') count = Math.min(MAX_PER_SECTOR, Math.round(tpm / 4));
    else count = DEFAULT_TRAFFIC;
    if (count <= 0) return;

    const stations = this._sectorStations();
    if (stations.length < 1) return; // nowhere to haul to

    for (let i = 0; i < count; i++) {
      const station = stations[Math.floor(this._rng() * stations.length)] || stations[0];
      // spawn near the station but offset so they don't overlap it
      const ang = this._rng() * Math.PI * 2;
      const r = 140 + this._rng() * 120;
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      const spec = makeShipEntitySpec(FREIGHTER_SHIP, {
        team: 2,                       // neutral (gold) — distinct from player/hostile
        factionId: sector.factionId || 'faction_free',
        pos,
        ai: { archetype: 'fleeing_trader', passive: true }, // passive: AI skips offensive behavior
      });
      const ent = this.helpers.spawnEntity(spec);
      if (!ent) continue;
      this._active.push(ent.id);
      this.state.traffic.freighters.push({
        id: ent.id,
        targetId: this._pickStation(stations).id,
        waitT: 0,
        nextTradeT: 2 + i * 1.5, // stagger trades so they don't all hit the market at once
      });
    }
  },

  _sectorStations() {
    const out = [];
    const stations = (this.state.entityIndex && this.state.entityIndex.dockStations) || this.state.entityList;
    for (const e of stations) {
      if (e.type === 'station' && e.alive && !(e.data && e.data.isGate)) out.push(e);
    }
    return out;
  },

  _pickStation(stations) {
    return stations[Math.floor(this._rng() * stations.length)] || stations[0];
  },

  _cleanup() {
    // The core system exposes helpers.removeEntity (marks alive=false; the renderer/physics GC it).
    // Fall back to a direct alive=false if the helper shape differs across builds.
    const helper = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
    if (!helper) {
      for (const id of this._active) { const e = this.state.entities.get(id); if (e) e.alive = false; }
    } else {
      for (const id of this._active) { try { helper(id); } catch (_) {} }
    }
    this._active = [];
    this.state.traffic.freighters = [];
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    this._ensureState();
    const list = state.traffic.freighters;
    if (!list || list.length === 0) return;
    const stations = this._sectorStations();
    if (stations.length === 0) return;

    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) { list.splice(i, 1); continue; }

      // resolve current target (it may have despawned)
      let target = state.entities.get(rec.targetId);
      if (!target || !target.alive) {
        target = this._pickStation(stations);
        rec.targetId = target ? target.id : null;
        if (!target) continue;
      }

      // waiting at station?
      if (rec.waitT > 0) {
        rec.waitT -= dt;
        setIntent(e, 0, 0, false, false, null, e.rot);
        continue;
      }

      // fly toward target
      const dx = target.pos.x - e.pos.x;
      const dz = target.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const aimAngle = Math.atan2(dz, dx);
      if (dist < DOCK_RANGE) {
        // arrived: emit a trade (moves the market), wait, pick a new destination
        rec.nextTradeT -= dt;
        if (rec.nextTradeT <= 0) {
          this._emitTrade(target);
          rec.nextTradeT = TRADE_INTERVAL_S + this._rng() * 6;
        }
        rec.waitT = 2.5 + this._rng() * 2;
        rec.targetId = this._pickStation(stations).id;
        setIntent(e, 0, 0, false, false, null, aimAngle);
        continue;
      }
      // drive: face the target, thrust forward. moveZ=1 means forward along the nose.
      setIntent(e, 0, 1, false, false, null, aimAngle);
      // clamp speed (intent is read by flight; we keep it simple — full forward, slow ship hull)
    }
  },

  // Emit a small randomized trade at the station — moves the market (now correctly, via the fixed
  // stock-pressure path) so NPC traffic is a real economic actor, not just scenery.
  _emitTrade(station) {
    const stationId = station.data && station.data.stationId;
    if (!stationId) return;
    const market = this.state.economy && this.state.economy.markets && this.state.economy.markets[stationId];
    if (!market) return;
    const ids = Object.keys(market);
    if (!ids.length) return;
    const commodityId = ids[Math.floor(this._rng() * ids.length)];
    const side = this._rng() < 0.5 ? 'buy' : 'sell';
    const qty = 3 + Math.floor(this._rng() * 18);
    this.bus.emit('aiTrader:requestTrade', { stationId, commodityId, side, qty });
  },

  _ensureState() {
    if (!this.state.traffic) this.state.traffic = { freighters: [] };
    if (!Array.isArray(this.state.traffic.freighters)) this.state.traffic.freighters = [];
    if (!Number.isFinite(this.state.traffic.rngSeed) || (this.state.traffic.rngSeed >>> 0) === 0) {
      this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', this.state.world && this.state.world.currentSectorId);
    }
  },

  _resetRngForSector(sectorId) {
    this._ensureState();
    this.state.traffic.rngSeed = hash32(this.state.meta && this.state.meta.seed, 'traffic', sectorId, this.state.tick || 0);
  },

  _rng() {
    this._ensureState();
    return drawSeeded(this.state.traffic, 'rngSeed', hash32(this.state.meta && this.state.meta.seed, 'traffic'));
  },

  newGame() {
    this._active = [];
    this.state.traffic = { freighters: [], rngSeed: hash32(this.state.meta && this.state.meta.seed, 'traffic', 'boot') };
  },
};

function setIntent(e, moveX, moveZ, boost, fire, fireGroup, aimAngle) {
  const data = e.data || (e.data = {});
  const intent = data.intent || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
  intent.moveX = moveX;
  intent.moveZ = moveZ;
  intent.boost = boost;
  intent.fire = fire;
  intent.fireGroup = fireGroup;
  intent.aimAngle = aimAngle;
}
