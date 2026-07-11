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
//     new station. Loop. Hard sector:exit cleans up freighters; continuous membership handoff
//     preserves still-alive traffic (world residency owns scoped despawn; M2-C1).
//   - Single-writer: traffic owns only its own spawned entities (tracked in state.traffic); it
//     never touches player state. Economy impact is via the event bus.

import { makeShipEntitySpec } from './ships.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import {
  RECORD_KIND,
  stableRecordId,
} from '../world/worldRecords.js';
import {
  buildCargoManifest,
  buildArrivalIntent,
  buildLossIntent,
  filterNewFreightIntents,
  mergeAppliedFreightIds,
  pressureShareRecipe,
  abstractBaselineVolume,
  FREIGHT_TRADING_ROLES,
  FREIGHT_MARKET_KEYS_FALLBACK,
  liveVolumeForSector,
} from '../economy/freightCausality.js';
import { pickNamedLaneContact } from '../data/laneContacts.js';

const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
// Core pocket density (spec2/04 §4: core 6–9 concurrent). Cap keeps perf predictable.
const MAX_PER_SECTOR = 8;
const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
const DOCK_RANGE = 60;         // how close before "docking" (trading)
const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)
const POCKET_CLUSTER_R = 420;  // first freighters cluster near a pocket station for sensor density

// Causal traffic roles (spec §12.1). Each role is a distinct, READABLE behavior — not a combat-AI
// skin. The hull + speed + archetype encode the role's identity; the update loop encodes its
// behavior. Spawn weights form the causal model (spec §12.2): the role mix depends on sector
// context — industrial sectors get more miners/haulers, hostile sectors get suspicious traffic,
// secure faction sectors get patrols/escorts. team 2 = neutral/civilian traffic (gold); actual red
// hostiles must come from combat/world/mission spawns, not passive scenery.
const TRAFFIC_ROLES = {
  hauler:   { ship: 'ship_mule',     team: 2, speed: 26, archetype: 'fleeing_trader', weight: 30,
              label: 'Cargo Hauler', docks: true, trades: true },
  courier:  { ship: 'ship_kestrel',  team: 2, speed: 52, archetype: 'fleeing_trader', weight: 18,
              label: 'Courier', docks: true, trades: true },
  miner:    { ship: 'ship_pelican',  team: 2, speed: 30, archetype: 'fleeing_trader', weight: 16,
              label: 'Mining Barge', docks: true, trades: true, seeks: 'asteroid' },
  patrol:   { ship: 'ship_wasp',     team: 2, speed: 44, archetype: 'passive', weight: 14,
              label: 'System Patrol', docks: false, orbits: true },
  escort:   { ship: 'ship_wasp',     team: 2, speed: 40, archetype: 'passive', weight: 8,
              label: 'Convoy Escort', docks: false, escorts: true },
  smuggler: { ship: 'ship_drifter',  team: 2, speed: 46, archetype: 'fleeing_trader', weight: 6,
              label: 'Smuggler', docks: true, trades: true },
  pirate:   { ship: 'ship_hornet',   team: 2, speed: 50, archetype: 'fleeing_trader', weight: 5,
              label: 'Raider', docks: false, flees: true },
  rescue:   { ship: 'ship_drifter',  team: 2, speed: 48, archetype: 'passive', weight: 3,
              label: 'Rescue Craft', docks: true, trades: false },
};

// Causal role mix for a sector (spec §12.2). Hostile/pirate sectors tilt toward raiders; industrial
// sectors toward miners/haulers; secure faction sectors toward patrols/escorts.
function roleMixForSector(sector) {
  const sec = sector || {};
  const out = {};
  for (const [id, role] of Object.entries(TRAFFIC_ROLES)) out[id] = role.weight;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  // Industrial (mining/refinery) sectors: more miners + haulers.
  if (sec.industries && (sec.industries.mining || sec.industries.refinery)) { out.miner *= 2.5; out.hauler *= 1.5; }
  // Hostile/danger sectors: more suspicious raiders, fewer civilians.
  const threat = sec.threat || sec.danger;
  if (threat === 'high' || sec.security === 'lawless' || (numericSecurity != null && numericSecurity <= 0.35) || tier >= 3) {
    out.pirate *= 4; out.courier *= 0.4; out.escort *= 2;
  }
  // Secure faction sectors: more patrols + escorts, no suspicious raider traffic in the safe lanes.
  if (sec.security === 'secure' || sec.factionControl === 'strong' || (numericSecurity != null && numericSecurity >= 0.6)) {
    out.patrol *= 2.5; out.escort *= 1.8; out.pirate = 0;
  }
  // Professional core pocket (Helios-class): licensed traders + one lawful presence — no smuggler
  // scenery in the first-hour safe lane (smugglers still exist elsewhere via lower security).
  if (numericSecurity != null && numericSecurity >= 0.9) {
    out.smuggler = 0;
    out.pirate = 0;
    out.hauler *= 1.4;
    out.courier *= 1.2;
    out.patrol *= 1.6;
  }
  return out;
}
function pickRole(roleWeights, rng) {
  let total = 0; for (const w of Object.values(roleWeights)) total += Math.max(0, w);
  if (total <= 0) return 'hauler';
  let r = rng() * total;
  for (const [id, w] of Object.entries(roleWeights)) { r -= Math.max(0, w); if (r <= 0) return id; }
  return 'hauler';
}

/** Ambient count from trafficPerMin — core pockets floor at CORE_MIN_TRAFFIC. */
function ambientCountForSector(sector) {
  const tpm = sector && sector.trafficPerMin;
  let count;
  if (typeof tpm === 'number') {
    // denser reading for high-tpm cores: tpm/3 instead of /4 so Helios (18) → 6
    count = Math.min(MAX_PER_SECTOR, Math.round(tpm / 3));
  } else {
    count = DEFAULT_TRAFFIC;
  }
  const sec = Number.isFinite(sector && sector.security) ? sector.security : null;
  if (sec != null && sec >= 0.85 && count > 0) {
    count = Math.min(MAX_PER_SECTOR, Math.max(CORE_MIN_TRAFFIC, count));
  }
  return count;
}

/**
 * Professional first-hour mix: guarantee ≥1 lawful patrol + majority traders in high-sec.
 * Pure: takes pre-picked roles and returns a corrected array of the same length.
 */
function ensurePocketRoleMix(roles, sector) {
  const sec = Number.isFinite(sector && sector.security) ? sector.security : null;
  if (sec == null || sec < 0.85 || !roles.length) return roles;
  const out = roles.slice();
  const hasPatrol = out.includes('patrol');
  if (!hasPatrol) out[0] = 'patrol';
  // Prefer traders for remaining civilian slots (readable ambient economy).
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 'smuggler' || out[i] === 'pirate') out[i] = (i % 2 === 0) ? 'hauler' : 'courier';
  }
  return out;
}

export const traffic = {
  name: 'traffic',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    // live freighter records: id -> {targetId, waitT, nextTradeT, manifest, dockSeq}
    this._ensureState();
    this._active = []; // entity ids we spawned (for cleanup)
    this._stationScratch = [];

    this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
    // Canonical seam is sector:exit (world never emits sector:leave). Continuous handoffs prune
    // dead tracking only; hard exits fully clean up freighters.
    this.bus.on('sector:exit', (p) => this._onSectorExit(p));
    // ECON-P2: freighter loss → owner-safe scarcity intents + named news (no wallet writes).
    this.bus.on('entity:killed', (p) => this._onEntityKilled(p));
  },

  _onSectorExit(p) {
    if (p && (p.continuous || p.noTeleport)) {
      this._pruneDead();
      return;
    }
    this._cleanup();
  },

  _onSectorEnter(p) {
    const continuous = !!(p && (p.continuous || p.noTeleport));
    if (continuous) {
      // Soft handoff: keep still-alive freighters; only top-up ambient for the new membership.
      this._pruneDead();
    } else {
      this._cleanup(); // hard enter: wipe previous sector's freighters (view-gated)
    }
    const sector = p && p.sector;
    if (!sector || !this.helpers || !this.helpers.spawnEntity) return;
    const sectorId = sector.id || (p && p.sectorId) || (this.state.world && this.state.world.currentSectorId) || 'unknown';
    this._resetRngForSector(sectorId);
    // Density from trafficPerMin; high-sec cores floor at CORE_MIN_TRAFFIC (spec2/04 core pocket).
    // Explicit trafficPerMin:0 still means "hollow" (frontier silence).
    const count = ambientCountForSector(sector);
    if (count <= 0) return;

    const stations = this._sectorStations();
    if (stations.length < 1) return; // nowhere to haul to

    // Continue / rematerialize: adopt live convoy freighters (world.records) before ambient top-up
    // so we never double freighters after hard enter rematerialized durable traffic.
    this._adoptRematerializedTraffic(sectorId, stations);

    // Continuous or after adopt: only top-up toward the target count.
    const already = (this.state.traffic.freighters || []).length;
    const need = Math.max(0, count - already);
    if (need <= 0) {
      this._ensureNamedLaneContact(sectorId, sector, stations);
      return;
    }

    const roleWeights = roleMixForSector(sector);
    const roles = [];
    for (let i = 0; i < need; i++) roles.push(pickRole(roleWeights, () => this._rng()));
    const pocketRoles = ensurePocketRoleMix(roles, sector);

    // Pocket anchor: cluster the first freighters near the busiest station so sensor-range
    // density holds for the first-hour Helios play space (not scattered to far yards only).
    const pocketStation = this._pocketStation(stations, sectorId);

    for (let i = 0; i < need; i++) {
      const role = pocketRoles[i] || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const station = (i < Math.min(4, need) && pocketStation)
        ? pocketStation
        : (stations[Math.floor(this._rng() * stations.length)] || stations[0]);
      // spawn near the station but offset so they don't overlap it
      const ang = this._rng() * Math.PI * 2;
      const r = (i < Math.min(4, need))
        ? (90 + this._rng() * (POCKET_CLUSTER_R * 0.45))
        : (140 + this._rng() * 120);
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      const aiSpec = {
        archetype: def.archetype,
        passive: true, // traffic never opens fire on a clean player
      };
      // Lawful patrol presence: WANTED gate is the only path to hostility (scanner/aiPorts).
      if (role === 'patrol' || role === 'escort') {
        aiSpec.lawful = true;
        aiSpec.spawnContext = 'patrol';
      } else {
        aiSpec.spawnContext = 'convoy_civilian';
      }
      const spec = makeShipEntitySpec(def.ship, {
        team: def.team,                    // 2 neutral civilian
        factionId: sector.factionId || 'faction_free',
        pos,
        ai: aiSpec,
      });
      const ent = this.helpers.spawnEntity(spec);
      if (!ent) continue;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, already + i);
      const target = this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._active.push(ent.id);
      this.state.traffic.freighters.push({
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 2 + i * 1.5, // stagger trades so they don't all hit the market at once
        orbitPhase: this._rng() * Math.PI * 2, // patrols orbit on a per-ship phase
        dockSeq: 0,
        manifest,
      });
    }
    this._ensureNamedLaneContact(sectorId, sector, stations);
  },

  /**
   * Prefer Helios Station (or first station) as the pocket density anchor so ≥3 freighters
   * sit inside default radar/sensor range of the first-hour play space.
   */
  _pocketStation(stations, sectorId) {
    if (!stations || !stations.length) return null;
    if (sectorId === 'sector_helios_prime') {
      for (const s of stations) {
        const id = (s.data && (s.data.stationId || s.data.id)) || s.id;
        if (id === 'station_helios') return s;
      }
    }
    return stations[0];
  },

  /**
   * Stamp exactly one deterministic named lane contact onto ambient traffic in this sector
   * (or spawn a dedicated freighter if none match the contact's role). Reuses freight causality
   * manifests — no parallel economy authority. Idempotent per sector presence.
   */
  _ensureNamedLaneContact(sectorId, sector, stations) {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    // Already have a live named contact?
    for (const rec of list) {
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (e && e.alive && e.data && e.data.namedLaneContactId) return;
    }
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const contact = pickNamedLaneContact(sectorId, seed);
    if (!contact) return;

    // Prefer an existing freighter with matching role. If none matches, spawn the authored
    // contact's own role/hull; never put a courier identity on a patrol (or vice versa).
    let rec = list.find((r) => r.role === contact.role) || null;
    let ent = rec && this.state.entities.get(rec.id);
    if (!ent || !ent.alive) {
      if (!this.helpers || !this.helpers.spawnEntity || !stations || !stations.length) return;
      const role = contact.role || 'hauler';
      const def = TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler;
      const station = this._pocketStation(stations, sectorId) || stations[0];
      const ang = this._rng() * Math.PI * 2;
      const r = 110 + this._rng() * 80;
      const pos = { x: station.pos.x + Math.cos(ang) * r, z: station.pos.z + Math.sin(ang) * r };
      const aiSpec = {
        archetype: def.archetype,
        passive: true,
        spawnContext: (role === 'patrol' || role === 'escort') ? 'patrol' : 'convoy_civilian',
      };
      if (role === 'patrol' || role === 'escort') aiSpec.lawful = true;
      const spec = makeShipEntitySpec(contact.ship || def.ship, {
        team: def.team,
        factionId: (sector && sector.factionId) || 'faction_free',
        pos,
        ai: aiSpec,
      });
      ent = this.helpers.spawnEntity(spec);
      if (!ent) return;
      this._stampTrafficDurableIdentity(ent, sectorId, role, def, list.length);
      const target = this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._active.push(ent.id);
      rec = {
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 3,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: 0,
        manifest,
      };
      list.push(rec);
    }
    this._stampNamedLaneContact(ent, contact);
  },

  _stampNamedLaneContact(ent, contact) {
    if (!ent || !contact) return;
    if (!ent.data) ent.data = {};
    ent.data.namedLaneContactId = contact.id;
    ent.data.name = contact.name;
    ent.data.callsign = contact.callsign;
    ent.data.gimmick = contact.gimmick;
    ent.data.trafficLabel = contact.callsign;
    ent.data.scanLabel = contact.callsign;
    if (ent.data.ai) {
      ent.data.ai.name = contact.name;
      // Named patrol keeps lawful; named freighter stays passive civilian.
      if (contact.role === 'patrol' || contact.role === 'escort') {
        ent.data.ai.lawful = true;
        ent.data.ai.spawnContext = 'patrol';
      }
    }
  },

  /**
   * Stamp homeSectorId + stable worldRecordId before first demotion so capture/kill never
   * attaches homeless freighters to the wrong sector bag.
   */
  _stampTrafficDurableIdentity(ent, sectorId, role, def, seq) {
    if (!ent) return;
    if (!ent.data) ent.data = {};
    ent.data.trafficRole = role;
    // Don't clobber a named lane callsign already stamped.
    if (!ent.data.namedLaneContactId) {
      ent.data.trafficLabel = (def && def.label) || role;
    }
    ent.data.role = role; // readability for target panel / scanner
    ent.homeSectorId = sectorId;
    ent.data.homeSectorId = sectorId;
    if (ent.data.sectorId == null) ent.data.sectorId = sectorId;
    // AI readability tags (hostility still team/passive/lawful + WANTED gate — never factionId).
    if (!ent.data.ai) ent.data.ai = {};
    if (role === 'patrol' || role === 'escort') {
      ent.data.ai.lawful = true;
      if (!ent.data.ai.spawnContext) ent.data.ai.spawnContext = 'patrol';
    } else if (!ent.data.ai.spawnContext) {
      ent.data.ai.spawnContext = 'convoy_civilian';
    }
    if (ent.data.worldRecordId) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const qx = ent.pos ? Math.round(ent.pos.x / 4) * 4 : 0;
    const qz = ent.pos ? Math.round(ent.pos.z / 4) * 4 : 0;
    const key = `traffic:${role || 'hauler'}:${seq | 0}:${qx}:${qz}`;
    const recordId = stableRecordId(seed, sectorId, RECORD_KIND.CONVOY, key);
    ent.data.worldRecordId = recordId;
    ent.data.identityKey = key;
    ent.data.durable = true;
    ent.data.recordCreatedTick = this.state.tick | 0;
  },

  /**
   * Bind rematerialized convoy freighters into traffic tracking without re-spawning.
   */
  _adoptRematerializedTraffic(sectorId, stations) {
    if (!sectorId) return;
    const tracked = new Set((this.state.traffic.freighters || []).map((f) => f && f.id));
    const list = this.state.entityList || [];
    let adoptIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'ship' || e.isPlayer) continue;
      const d = e.data || {};
      if (!d.trafficRole && !d.worldRecordId) continue;
      // Only adopt freighters that look like traffic/convoy.
      if (!d.trafficRole && !(d.durable && d.worldRecordId)) continue;
      if (!d.trafficRole) continue;
      const home = e.homeSectorId || d.homeSectorId || d.sectorId;
      if (home && home !== sectorId) continue;
      if (tracked.has(e.id)) continue;
      // Ensure durable stamps survive even if rematerialize omitted a field.
      if (!e.homeSectorId && !d.homeSectorId) {
        e.homeSectorId = sectorId;
        d.homeSectorId = sectorId;
      }
      if (d.sectorId == null) d.sectorId = sectorId;
      if (!d.worldRecordId) {
        this._stampTrafficDurableIdentity(e, sectorId, d.trafficRole, { label: d.trafficLabel }, adoptIdx);
      }
      tracked.add(e.id);
      this._active.push(e.id);
      const role = d.trafficRole || 'hauler';
      const target = (stations && stations.length) ? this._pickStation(stations) : null;
      // Preserve durable cargo manifest across rematerialize / continuous handoff (M2).
      let manifest = d.cargoManifest || null;
      if (!manifest || !Array.isArray(manifest.lines)) {
        manifest = this._assignManifest(e, role, target, sectorId);
      } else {
        e.data.cargoManifest = manifest;
      }
      this.state.traffic.freighters.push({
        id: e.id,
        role,
        targetId: target ? target.id : null,
        waitT: 0,
        nextTradeT: 2 + adoptIdx * 1.5,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: d.freightDockSeq | 0,
        manifest,
      });
      adoptIdx++;
    }
  },

  _sectorStations() {
    const index = this.state.entityIndex;
    if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.dockStations)) {
      return index.dockStations;
    }
    const out = this._stationScratch || (this._stationScratch = []);
    out.length = 0;
    const stations = this.state.entityList || [];
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
    this._ensureState();
    this.state.traffic.freighters = [];
    // Hard exit drops the view — clear arrival/loss ledgers so rematerialized freighters
    // can re-dock without colliding with prior sector dockSeq intent ids. Continuous
    // handoff uses _pruneDead only and keeps the ledger (M2 durable identity).
    this.state.traffic.appliedArrivalIds = [];
    this.state.traffic.appliedLossIds = [];
  },

  /** Drop tracking for freighters already despawned by residency demotion (continuous handoff). */
  _pruneDead() {
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    const aliveIds = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = this.state.entities && this.state.entities.get(rec.id);
      if (!e || !e.alive) list.splice(i, 1);
      else aliveIds.push(rec.id);
    }
    this._active = aliveIds;
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
      const role = TRAFFIC_ROLES[rec.role] || TRAFFIC_ROLES.hauler;

      // Role-specific behavior dispatch (spec §12.1). Each role has a distinct, readable behavior.
      if (role.orbits) { this._stepOrbit(e, rec, stations, dt); continue; }       // patrol
      if (role.flees) { this._stepFlee(e, rec, stations, state); continue; }       // pirate/raider
      if (role.seeks === 'asteroid') { this._stepMiner(e, rec, stations, state); continue; } // miner
      if (role.escorts) { this._stepEscort(e, rec, list, state); continue; }       // convoy escort

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
        // arrived: emit owner-safe freight arrival (manifest → stock pressure), wait, re-route
        rec.nextTradeT -= dt;
        if (rec.nextTradeT <= 0 && role.trades) {
          this._emitArrival(e, rec, target);
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

  // ── Role behaviors (spec §12.1) ────────────────────────────────────────────────────────────
  // Patrols orbit a station on a slow circular track — a readable "on duty" presence.
  _stepOrbit(e, rec, stations, dt) {
    const station = stations[0];
    if (!station) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    rec.orbitPhase = (rec.orbitPhase || 0) + dt * 0.25;
    const R = 180;
    const tx = station.pos.x + Math.cos(rec.orbitPhase) * R;
    const tz = station.pos.z + Math.sin(rec.orbitPhase) * R;
    const aim = Math.atan2(tz - e.pos.z, tx - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Pirates/raiders flee from the nearest hostile (the player) — they raid weak targets but bolt
  // when outmatched. Distinct from combat AI: they never engage, they disengage.
  _stepFlee(e, rec, stations, state) {
    const player = state.entities.get(state.playerId);
    if (player && player.alive) {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 500) { // flee directly away from the player
        const aim = Math.atan2(dz, dx);
        setIntent(e, 0, 1, true, false, null, aim); // boost away
        return;
      }
    }
    // no threat: loiter toward a station
    const station = stations[Math.floor((rec._fleeIdx == null ? (rec._fleeIdx = 0) : rec._fleeIdx))];
    const tgt = station || stations[0];
    if (!tgt) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const aim = Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x);
    setIntent(e, 0, 1, false, false, null, aim);
  },

  // Miners seek asteroids, "mine" (orbit the rock), then haul the ore to a station. Distinct from
  // haulers: their target is an asteroid, not a station, until they return to dock.
  _stepMiner(e, rec, stations, state) {
    if (rec.carrying) {
      // return to a station to offload, then seek a new rock
      const tgt = state.entities.get(rec.targetId);
      if (tgt && tgt.type === 'station' && tgt.alive) {
        const dist = Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z);
        if (dist < DOCK_RANGE) { rec.carrying = false; rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id; rec.waitT = 2; setIntent(e, 0, 0, false, false, null, e.rot); return; }
        setIntent(e, 0, 1, false, false, null, Math.atan2(tgt.pos.z - e.pos.z, tgt.pos.x - e.pos.x)); return;
      }
      rec.targetId = this._pickStation(stations).id; return;
    }
    let rock = state.entities.get(rec.targetId);
    if (!rock || rock.type !== 'asteroid' || !rock.alive) { rec.targetId = this._pickAsteroid(state) || this._pickStation(stations).id; rock = state.entities.get(rec.targetId); }
    if (!rock) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    const dist = Math.hypot(rock.pos.x - e.pos.x, rock.pos.z - e.pos.z);
    if (dist < 40) { rec.carrying = true; rec.targetId = this._pickStation(stations).id; rec.waitT = 1.5; setIntent(e, 0, 0, false, false, null, e.rot); return; }
    setIntent(e, 0, 1, false, false, null, Math.atan2(rock.pos.z - e.pos.z, rock.pos.x - e.pos.x));
  },

  _pickAsteroid(state) {
    const indexed = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1
      ? state.entityIndex.asteroids
      : null;
    if (indexed && indexed.length) {
      const tries = Math.min(indexed.length, 8);
      for (let i = 0; i < tries; i++) {
        const rock = indexed[Math.floor(this._rng() * indexed.length)];
        if (rock && rock.type === 'asteroid' && rock.alive) return rock.id;
      }
      for (const rock of indexed) {
        if (rock && rock.type === 'asteroid' && rock.alive) return rock.id;
      }
      return null;
    }
    let picked = null;
    let seen = 0;
    for (const e of state.entityList || []) {
      if (!e || e.type !== 'asteroid' || !e.alive) continue;
      seen += 1;
      if (this._rng() < 1 / seen) picked = e;
    }
    return picked ? picked.id : null;
  },

  // Escorts convoy with the nearest civilian freighter — they shadow it, distinct from patrols.
  _stepEscort(e, rec, list, state) {
    let ward = null, wd = Infinity;
    for (const r of list) {
      if (r.role === 'escort' || r.role === 'patrol' || r.role === 'pirate') continue;
      const w = state.entities.get(r.id);
      if (!w || !w.alive) continue;
      const d = Math.hypot(w.pos.x - e.pos.x, w.pos.z - e.pos.z);
      if (d < wd) { wd = d; ward = w; }
    }
    if (!ward) { setIntent(e, 0, 0, false, false, null, e.rot); return; }
    // hold station ~80 units behind the ward
    const back = ward.rot || 0;
    const tx = ward.pos.x - Math.cos(back) * 80;
    const tz = ward.pos.z - Math.sin(back) * 80;
    setIntent(e, 0, 1, false, false, null, Math.atan2(tz - e.pos.z, tx - e.pos.x));
  },

  /**
   * Deterministic cargo manifest from station market keys (ECON-P2). Stamped on entity.data
   * so scanners / rematerialize / continuous handoff can read it without re-rolling.
   */
  _assignManifest(ent, role, station, sectorId) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (ent && ent.id != null ? String(ent.id) : `traffic:${role}`);
    const stationId = station && station.data && station.data.stationId;
    const market = stationId
      && this.state.economy
      && this.state.economy.markets
      && this.state.economy.markets[stationId];
    const manifest = buildCargoManifest({
      seed,
      freighterKey,
      role: role || 'hauler',
      market: market || FREIGHT_MARKET_KEYS_FALLBACK,
    });
    if (ent) {
      if (!ent.data) ent.data = {};
      ent.data.cargoManifest = manifest;
      if (sectorId && ent.data.sectorId == null) ent.data.sectorId = sectorId;
    }
    return manifest;
  },

  /**
   * Owner-safe arrival: emit aiTrader:requestTrade per manifest line (economy stock-only path).
   * Idempotent per freighter dockSeq. Never writes credits/cargo/stock/rep/heat here.
   */
  _emitArrival(entity, rec, station) {
    const stationId = station && station.data && station.data.stationId;
    if (!stationId || !rec) return;
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (entity && entity.data && entity.data.worldRecordId)
      || String(rec.id);
    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    const role = rec.role || 'hauler';
    if (!FREIGHT_TRADING_ROLES.includes(role)) return;

    let manifest = rec.manifest
      || (entity && entity.data && entity.data.cargoManifest)
      || null;
    if (!manifest || !Array.isArray(manifest.lines) || !manifest.lines.length) {
      manifest = this._assignManifest(entity, role, station, sectorId);
      rec.manifest = manifest;
    }

    // Conservation: live arrivals share the old abstract lane budget with sectorSim pressure.
    const liveVol = liveVolumeForSector(this.state, sectorId);
    // Use a unit baseline floor so a quiet field still allows embodied trade; sectorSim
    // scales its own abstract share with the same recipe against the real baseline.
    const recipe = pressureShareRecipe({
      baselineVolume: Math.max(liveVol, abstractBaselineVolume({
        lanePressure: 0.25, days: 0.25, goodsCount: Math.max(1, (manifest.lines || []).length),
      })),
      liveVolume: liveVol || manifest.totalQty || 0,
    });

    const dockSeq = rec.dockSeq | 0;
    const intent = buildArrivalIntent({
      seed,
      freighterKey,
      freighterId: rec.id,
      stationId,
      sectorId,
      dockSeq,
      manifest,
      liveScale: recipe.liveScale > 0 ? recipe.liveScale : 1,
    });

    const t = this.state.traffic;
    const fresh = filterNewFreightIntents([intent], t.appliedArrivalIds);
    if (!fresh.length) {
      rec.dockSeq = dockSeq + 1;
      return; // already applied this dock intent
    }

    for (const trade of intent.trades) {
      this.bus.emit('aiTrader:requestTrade', {
        stationId: trade.stationId,
        commodityId: trade.commodityId,
        side: trade.side,
        qty: trade.qty,
        cause: intent.cause,
        source: intent.source,
        intentId: intent.intentId,
        freighterId: rec.id,
      });
    }
    this.bus.emit('freight:arrival', intent);
    t.appliedArrivalIds = mergeAppliedFreightIds(t.appliedArrivalIds, fresh);
    rec.dockSeq = dockSeq + 1;
    if (entity && entity.data) entity.data.freightDockSeq = rec.dockSeq;

    // After delivery, refresh manifest for the next leg (still deterministic per dockSeq key).
    const nextKey = `${freighterKey}:leg:${rec.dockSeq}`;
    const nextManifest = buildCargoManifest({
      seed,
      freighterKey: nextKey,
      role,
      market: (this.state.economy && this.state.economy.markets && this.state.economy.markets[stationId])
        || FREIGHT_MARKET_KEYS_FALLBACK,
    });
    rec.manifest = nextManifest;
    if (entity && entity.data) entity.data.cargoManifest = nextManifest;
  },

  /**
   * Owner-safe loss on freighter kill: scarcity pressure + named news payload.
   * Idempotent per freighterKey. Does not write wallet/cargo/rep/heat.
   */
  _onEntityKilled(p) {
    if (!p || p.id == null) return;
    this._ensureState();
    const list = this.state.traffic.freighters || [];
    let rec = null;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === p.id) { rec = list[i]; idx = i; break; }
    }
    const ent = this.state.entities && this.state.entities.get && this.state.entities.get(p.id);
    const role = (rec && rec.role)
      || (ent && ent.data && ent.data.trafficRole)
      || null;
    if (!rec && !(ent && ent.data && ent.data.trafficRole)) return;
    if (role && !FREIGHT_TRADING_ROLES.includes(role) && !(rec && rec.manifest && rec.manifest.totalQty)) {
      // Non-trading traffic (patrol/escort) — drop tracking only.
      if (idx >= 0) list.splice(idx, 1);
      return;
    }

    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const freighterKey = (ent && ent.data && ent.data.worldRecordId)
      || (rec && rec.id != null ? String(rec.id) : String(p.id));
    const sectorId = p.sectorId
      || (this.state.world && this.state.world.currentSectorId)
      || null;
    const stationId = this._nearestStationId(ent && ent.pos)
      || (rec && rec.targetId && this._stationIdForEntity(rec.targetId));
    const manifest = (rec && rec.manifest)
      || (ent && ent.data && ent.data.cargoManifest)
      || buildCargoManifest({ seed, freighterKey, role: role || 'hauler', market: FREIGHT_MARKET_KEYS_FALLBACK });

    const intent = buildLossIntent({
      seed,
      freighterKey,
      freighterId: p.id,
      stationId,
      sectorId,
      manifest,
      killerId: p.killerId,
      seq: this.state.tick | 0,
    });

    const t = this.state.traffic;
    const fresh = filterNewFreightIntents([intent], t.appliedLossIds);
    if (fresh.length) {
      for (const pr of intent.pressures) {
        if (!pr.stationId) continue;
        this.bus.emit('economy:applyTradePressure', {
          stationId: pr.stationId,
          good: pr.good,
          commodityId: pr.commodityId,
          vol: pr.vol,
          sectorId: pr.sectorId,
          source: pr.source,
          cause: pr.cause,
          intentId: intent.intentId,
          freighterId: p.id,
        });
      }
      this.bus.emit('freight:loss', intent);
      if (intent.news) {
        this.bus.emit('news:headline', {
          ...intent.news,
          headline: null, // presentation may fill from newsTemplates
        });
      }
      t.appliedLossIds = mergeAppliedFreightIds(t.appliedLossIds, fresh);
    }

    if (idx >= 0) list.splice(idx, 1);
    const activeIdx = this._active.indexOf(p.id);
    if (activeIdx >= 0) this._active.splice(activeIdx, 1);
  },

  _nearestStationId(pos) {
    if (!pos) return null;
    const stations = this._sectorStations();
    let best = null;
    let bestD = Infinity;
    for (const s of stations) {
      if (!s || !s.pos) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best && best.data && best.data.stationId ? best.data.stationId : null;
  },

  _stationIdForEntity(entityId) {
    const e = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    return e && e.data && e.data.stationId ? e.data.stationId : null;
  },

  _ensureState() {
    if (!this.state.traffic) this.state.traffic = { freighters: [] };
    if (!Array.isArray(this.state.traffic.freighters)) this.state.traffic.freighters = [];
    if (!Array.isArray(this.state.traffic.appliedArrivalIds)) this.state.traffic.appliedArrivalIds = [];
    if (!Array.isArray(this.state.traffic.appliedLossIds)) this.state.traffic.appliedLossIds = [];
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
    this.state.traffic = {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      rngSeed: hash32(this.state.meta && this.state.meta.seed, 'traffic', 'boot'),
    };
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
