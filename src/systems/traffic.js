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
import { massline2Flag } from '../data/featureFlags.js';
import {
  regionalTrafficDensityMultiplier,
  regionalTrafficRoleWeights,
} from './regionalEcology.js';

const FREIGHTER_SHIP = 'ship_mule'; // a freighter hull from data/ships.js (cargo-capable, slow)
// Core pocket density (spec2/04 §4: core 6–9 concurrent). Cap keeps perf predictable.
const MAX_PER_SECTOR = 8;
const CORE_MIN_TRAFFIC = 6;    // high-security / high-tpm cores never feel empty
const DEFAULT_TRAFFIC = 3;     // sectors without explicit trafficPerMin get a small ambient count
const SPEED = 28;              // wu/s — slow, reads as a heavy freighter
const DOCK_RANGE = 60;         // how close before "docking" (trading)
const TRADE_INTERVAL_S = 8;    // min seconds between trades per freighter (staggered)
const POCKET_CLUSTER_R = 420;  // first freighters cluster near a pocket station for sensor density
// How many neighbouring rock faces one refinery's barges will spread across before repeating. Small
// on purpose: the point is that a shift works ONE seam together, close enough that the barges share
// a frame with each other and with anything passing. See _pickWorkableAsteroidNear.
const MINER_FIELD_SPREAD_CAP = 4;

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
  // A heavy neutral liner on a real station route. `speed` is descriptive only; the live motion
  // path is the V3 NPC boost intent in update(), which keeps momentum honest and tether-shareable.
  express:  { ship: 'ship_mule',     team: 2, speed: 247, archetype: 'fleeing_trader', weight: 3,
              label: 'Express Liner', docks: true, trades: true, express: true },
  // ── The working trades (design/fiction/THE_WORKING_TRADES.md) ─────────────────────────────────
  // Hulls chosen from the dossiers, not from what was convenient: the Ranger's long-endurance
  // utility spine is why a surveyor flies one and why "surveyors who cannot afford a Ranger fake
  // the trade on a Hitch and die of range"; the Pelican is a barge frame, which is what a salvor
  // needs to drag cut plate home; the Drifter's speed is why a tender gets off the berth fast when
  // somebody is venting.
  surveyor: { ship: 'ship_ranger',   team: 2, speed: 34, archetype: 'passive', weight: 9,
              label: 'Survey Rig', docks: true, trades: false },
  salvor:   { ship: 'ship_pelican',  team: 2, speed: 40, archetype: 'fleeing_trader', weight: 7,
              label: 'Salvage Cutter', docks: true, trades: true },
  tender:   { ship: 'ship_drifter',  team: 2, speed: 66, archetype: 'passive', weight: 6,
              label: 'Repair Tender', docks: true, trades: false },
};

// Causal role mix for a sector (spec §12.2). Hostile/pirate sectors tilt toward raiders; industrial
// sectors toward miners/haulers; secure faction sectors toward patrols/escorts.
export function trafficRoleMixForSector(sector, state = null) {
  const sec = sector || {};
  const out = {};
  for (const [id, role] of Object.entries(TRAFFIC_ROLES)) out[id] = role.weight;
  const numericSecurity = Number.isFinite(sec.security) ? sec.security : null;
  const tier = Number.isFinite(sec.tier) ? sec.tier : 0;
  // Industrial (mining/refinery) sectors: more miners + haulers.
  if (sec.industries && (sec.industries.mining || sec.industries.refinery)) { out.miner *= 2.5; out.hauler *= 1.5; }
  // A sector with authored ROCK is a sector somebody cuts, whether or not an `industries` flag was
  // ever set on it. Read the contents, not only the label.
  //
  // Concrete case this exists for: `sector_helios_prime` authors 70 asteroids across two named
  // fields — the comments in sectors.js call one of them "the starter seam" — and Helios Station
  // carries a standing iron shortage (`marketEquilibriumFactors: { cmdty_ore_iron: 0.09 }`). It has
  // no `industries` flag, so the miner weight stayed at its base 16 while the `security >= 0.9`
  // branch below multiplied patrol x1.6 and hauler x1.4 on top of it. Measured result across
  // repeated live captures of the sector every new player starts in: **zero barges**, consistently
  // 1 hauler + 4 patrols. The economy said iron was short and nobody was mining it.
  //
  // Deliberately weaker than the explicit flag (x1.7 vs x2.5) and NOT applied on top of it: a
  // declared mining economy should still out-mine a core sector that merely happens to have rocks.
  else if (Array.isArray(sec.fields) && sec.fields.some((f) => f && (f.count | 0) > 0)) {
    out.miner *= 1.7;
  }
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
  // Call-time gate: headless/golden and explicit flag-off sessions retain the exact prior role mix.
  if (!massline2Flag('hitchhiking')) out.express = 0;
  return state ? regionalTrafficRoleWeights(state, sec.id, out) : out;
}
function pickRole(roleWeights, rng) {
  let total = 0; for (const w of Object.values(roleWeights)) total += Math.max(0, w);
  if (total <= 0) return 'hauler';
  let r = rng() * total;
  for (const [id, w] of Object.entries(roleWeights)) { r -= Math.max(0, w); if (r <= 0) return id; }
  return 'hauler';
}

/** Ambient count from trafficPerMin — core pockets floor at CORE_MIN_TRAFFIC. */
function ambientCountForSector(sector, state = null) {
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
  // Explicit zero remains authored silence. Otherwise ecology changes embodied freight density
  // within the existing cap; the corresponding role mix also changes actual market manifests.
  if (count > 0 && state) {
    count = Math.min(MAX_PER_SECTOR, Math.max(1, Math.round(
      count * regionalTrafficDensityMultiplier(state, sector && sector.id),
    )));
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
  // A dense high-security hub gets exactly one scheduled express service: rare within the six-to-
  // eight ship pocket, but reliably learnable in default play. Other sectors retain the weighted
  // seeded role draw. The replacement is deterministic and never removes the guaranteed patrol.
  if (massline2Flag('hitchhiking') && out.length >= CORE_MIN_TRAFFIC) {
    let first = out.indexOf('express');
    if (first < 0) {
      first = out.length - 1;
      if (out[first] === 'patrol') first = Math.max(1, first - 1);
      out[first] = 'express';
    }
    for (let i = first + 1; i < out.length; i++) {
      if (out[i] === 'express') out[i] = (i % 2 === 0) ? 'hauler' : 'courier';
    }
  }
  return out;
}

export const traffic = {
  name: 'traffic',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._registry = ctx.registry || null;
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
    this.bus.on('save:loaded', () => {
      const sectorId = this.state.world && this.state.world.currentSectorId;
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
    });
    const refreshClaimTravel = () => this._applyClaimTravelHooks(
      this.state.world && this.state.world.currentSectorId,
    );
    this.bus.on('claim:infrastructureActive', refreshClaimTravel);
    this.bus.on('claim:infrastructureStatus', refreshClaimTravel);
    this.bus.on('worldSite:operationReceipt', ({ siteId, receipt } = {}) => {
      // Held tools publish progress every fixed tick. Traffic topology changes only on completion;
      // projecting all sites and scanning freighters for every partial tick is pure hot-path waste.
      if (receipt?.complete !== true) return;
      const record = siteId && this.state.sites && this.state.sites.worldById && this.state.sites.worldById[siteId];
      this._applyWorldSiteTrafficHooks(record && record.sectorId);
    });
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
    const count = ambientCountForSector(sector, this.state);
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
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      return;
    }

    const roleWeights = trafficRoleMixForSector(sector, this.state);
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
      const target = def.express
        ? this._pickExpressDestination(stations, station)
        : this._pickStation(stations);
      const manifest = this._assignManifest(ent, role, target, sectorId);
      this._active.push(ent.id);
      const rec = {
        id: ent.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 2 + i * 1.5, // stagger trades so they don't all hit the market at once
        orbitPhase: this._rng() * Math.PI * 2, // patrols orbit on a per-ship phase
        dockSeq: 0,
        manifest,
      };
      if (def.express) this._stampExpressRoute(ent, rec, station, target, sectorId, already + i);
      this.state.traffic.freighters.push(rec);
      // World Site service routes reserve one existing ambient slot before the general NPC job
      // producer claims eligible haulers. Later spawns see the existing hook and remain available
      // to their ordinary jobs, so this changes ownership for exactly one deterministic hull.
      this._applyWorldSiteTrafficHooks(sectorId);
      this._applyClaimTravelHooks(sectorId);
      // PQ-014: a miner/hauler/patrol hull naturally receives a deterministic NPC job here. The job
      // (not this ad-hoc stepper) then flies it; the update() dispatch yields for any hull with a
      // jobId. No-op when the runtime is absent (e.g. the sf-sim golden harness) or the route can't
      // be built (no asteroid field / too few stations) — the hull keeps its ambient stepper.
      this._maybeAssignJob(ent, role, station, target, stations, sectorId);
    }
    this._ensureNamedLaneContact(sectorId, sector, stations);
    this._applyWorldSiteTrafficHooks(sectorId);
    this._applyClaimTravelHooks(sectorId);
  },

  _applyWorldSiteTrafficHooks(sectorId) {
    if (!sectorId) return 0;
    const owner = this._registry && this._registry.get && this._registry.get('asteroidSites');
    if (!owner || typeof owner.worldSiteTrafficHooks !== 'function') return 0;
    const hooks = owner.worldSiteTrafficHooks(sectorId);
    if (!hooks.length) return 0;
    this._ensureState();
    let assigned = 0;
    for (const hook of hooks) {
      const rootWorldRecordId = `${hook.siteId}/root`;
      const root = entityWithWorldRecord(this.state, rootWorldRecordId);
      const station = this._sectorStations().find((candidate) => stationIdentity(candidate) === hook.stationId);
      if (!root || !station) continue;
      const existing = this.state.traffic.freighters.find((rec) => rec && rec.worldSiteRoute
        && rec.worldSiteRoute.hookId === hook.id
        && liveEntity(this.state, rec.id));
      if (existing) continue;
      const eligibleRoles = new Set(hook.eligibleRoles || []);
      const available = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && !(entity.data && (entity.data.jobId
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId)))
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
      // World-record rematerialization preserves the durable entity tag but rebuilds the transient
      // traffic record. Rebind that same ambient slot before looking for a new one; otherwise the
      // preserved tag excludes its owner from candidates and the authored route silently vanishes
      // after a leave/return or Continue.
      const marked = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && entity.data && entity.data.worldSiteTrafficHookId === hook.id
          && (eligibleRoles.has(rec.role) || isWorldSiteTrafficFallbackRole(rec.role))
          && !entity.data.jobId)
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)))[0];
      const preferred = available.find(({ rec }) => eligibleRoles.has(rec.role));
      // Seeded ambient mixes can legitimately contain no authored preferred role (for example,
      // a high-security pocket of escorts, patrols, a working miner, and an express liner). Keep
      // the population cap honest: reserve one idle civilian hull already in the pocket rather
      // than spawning a ninth ship or silently dropping the service. Combat-pattern roles remain
      // unavailable so the fallback cannot steal a patrol, escort, or raider from its owner.
      const fallback = available.find(({ rec }) => isWorldSiteTrafficFallbackRole(rec.role));
      const chosen = marked || preferred || fallback;
      if (!chosen) continue;
      chosen.rec.worldSiteRoute = {
        hookId: hook.id,
        stationId: hook.stationId,
        siteWorldRecordId: rootWorldRecordId,
        endpoint: 'site',
        label: hook.label,
      };
      chosen.rec.targetId = root.id;
      const data = chosen.entity.data || (chosen.entity.data = {});
      data.worldSiteTrafficHookId = hook.id;
      data.trafficLabel = hook.label || data.trafficLabel;
      assigned += 1;
    }
    return assigned;
  },

  _applyClaimTravelHooks(sectorId) {
    if (!sectorId) return 0;
    const owner = this._registry && this._registry.get && this._registry.get('claims');
    const hooks = owner && typeof owner.travelInfrastructureHooks === 'function'
      ? owner.travelInfrastructureHooks(sectorId)
      : [];
    this._ensureState();
    const activeIds = new Set(hooks.map((hook) => hook.id));
    for (const rec of this.state.traffic.freighters) {
      if (!rec || !rec.claimTravelRoute || activeIds.has(rec.claimTravelRoute.hookId)) continue;
      const entity = liveEntity(this.state, rec.id);
      if (entity && entity.data) {
        delete entity.data.claimTravelTrafficHookId;
        if (entity.data.trafficLabel === rec.claimTravelRoute.label) delete entity.data.trafficLabel;
      }
      delete rec.claimTravelRoute;
    }
    if (!hooks.length) return 0;
    let assigned = 0;
    const stations = this._sectorStations();
    for (const hook of hooks) {
      const station = stations.find((candidate) => stationIdentity(candidate) === hook.stationId);
      if (!station || !hook.slingPos) continue;
      const existing = this.state.traffic.freighters.find((rec) => rec && rec.claimTravelRoute
        && rec.claimTravelRoute.hookId === hook.id
        && liveEntity(this.state, rec.id));
      if (existing) continue;
      const eligibleRoles = new Set(hook.eligibleRoles || []);
      const available = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && !(entity.data && (entity.data.jobId
            || entity.data.worldSiteTrafficHookId
            || entity.data.claimTravelTrafficHookId)))
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
      const marked = this.state.traffic.freighters
        .map((rec) => ({ rec, entity: liveEntity(this.state, rec && rec.id) }))
        .filter(({ rec, entity }) => rec && entity
          && entity.data && entity.data.claimTravelTrafficHookId === hook.id
          && (eligibleRoles.has(rec.role) || isWorldSiteTrafficFallbackRole(rec.role))
          && !entity.data.jobId)
        .sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)))[0];
      const preferred = available.find(({ rec }) => eligibleRoles.has(rec.role));
      const fallback = available.find(({ rec }) => isWorldSiteTrafficFallbackRole(rec.role));
      const chosen = marked || preferred || fallback;
      if (!chosen) continue;
      chosen.rec.claimTravelRoute = {
        hookId: hook.id,
        stationId: hook.stationId,
        slingPos: { x: hook.slingPos.x, z: hook.slingPos.z },
        endpoint: 'sling',
        label: hook.label,
      };
      chosen.rec.targetId = null;
      const data = chosen.entity.data || (chosen.entity.data = {});
      data.claimTravelTrafficHookId = hook.id;
      data.trafficLabel = hook.label || data.trafficLabel;
      assigned += 1;
    }
    return assigned;
  },

  // PQ-014 — natural NPC job assignment. Civilian traffic IS the natural producer for the three
  // job kinds: role 'miner' → miner job (home refinery ↔ asteroid field), 'hauler' → hauler job
  // (origin → destination terminal run), 'patrol' → patrol job (cyclic beat around a station).
  // Other roles keep their ambient stepper. Builds the route from the same in-sector stations /
  // asteroids the ambient steppers already use, so no new spawn fountain and no new geometry authority.
  _maybeAssignJob(ent, role, originStation, target, stations, sectorId) {
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return;                 // runtime not registered → strict no-op
    if (!ent || !ent.data || !ent.data.worldRecordId) return; // no stable identity → not a durable job
    if (ent.data.worldSiteTrafficHookId || ent.data.claimTravelTrafficHookId) return; // infrastructure owns this slot
    const spec = this._buildJobSpec(role, ent, originStation, target, stations, sectorId);
    if (spec) assign(ent, spec);
  },

  _buildJobSpec(role, ent, originStation, target, stations, sectorId) {
    const home = originStation && originStation.pos ? originStation : (stations && stations[0]);
    if (!home || !home.pos) return null;
    if (role === 'miner') {
      // The seam this refinery actually works, not a rock drawn uniformly from the whole 4200-unit
      // sector. `spread` walks the nearest few faces so a shift's barges sit beside each other
      // instead of stacking on one; it is derived from the live job count, so it is deterministic
      // and does not consume the traffic RNG stream (which would move every later seeded draw).
      const spread = this.state.npcJobs && this.state.npcJobs.byId
        ? Object.keys(this.state.npcJobs.byId).length % MINER_FIELD_SPREAD_CAP
        : 0;
      const rockId = this._pickWorkableAsteroidNear(this.state, home, spread);
      const rock = rockId != null && this.state.entities ? this.state.entities.get(rockId) : null;
      if (!rock || !rock.pos) return null; // no field to work → keep the ambient miner stepper
      return {
        kind: 'miner', sectorId,
        route: [
          { id: 'home:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Refinery' },
          { id: 'field:' + rockId, pos: { x: rock.pos.x, z: rock.pos.z }, label: 'Belt' },
        ],
      };
    }
    if (role === 'hauler') {
      const dest = (target && target.pos && target !== home) ? target : this._pickExpressDestination(stations, home);
      if (!dest || !dest.pos) return null; // only one station → nowhere to haul to
      return {
        kind: 'hauler', sectorId,
        route: [
          { id: 'origin:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Origin' },
          { id: 'dest:' + stationIdentity(dest), pos: { x: dest.pos.x, z: dest.pos.z }, label: 'Destination' },
        ],
        payload: { commodity: 'cmdty_ore_iron', units: 40 },
      };
    }
    if (role === 'surveyor') {
      // A grid, not a beat. The dossier's shift is "crab the grid — pulse, wait, pulse, log", so
      // the marks are laid out as an offset lattice rather than a ring: a ring reads as a patrol
      // circling something, and a surveyor is covering ground nobody has charted.
      const cx = home.pos.x; const cz = home.pos.z;
      const marks = [[300, 120], [520, -180], [180, -420], [-160, -140]];
      return {
        kind: 'surveyor', sectorId,
        route: marks.map(([ox, oz], i) => ({
          id: 'mark' + i, pos: { x: cx + ox, z: cz + oz }, label: 'Mark ' + (i + 1),
        })),
      };
    }
    if (role === 'salvor') {
      // Salvors work the dead, so the site must actually be a wreck. Without one there is nothing
      // to cut and the hull keeps its ambient stepper — a salvor stripping a live rock would be a
      // miner, and the fiction is emphatic that those are different trades.
      const wreck = this._nearestOfTypeTo(this.state, home, 'wreck');
      if (!wreck) return null;
      return {
        kind: 'salvor', sectorId,
        route: [
          { id: 'yard:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Scrap Yard' },
          { id: 'hulk:' + wreck.id, pos: { x: wreck.pos.x, z: wreck.pos.z }, label: 'Hulk' },
        ],
        payload: { commodity: 'cmdty_scrap_metal', units: 24 },
      };
    }
    if (role === 'tender') {
      // A call-out: berth to client hull and back. The client is another station rather than a
      // moving ship, because a tender's WORK phase holds station and welding onto something that
      // flies away mid-repair would contradict the "soft target by necessity" the Code promises.
      // The NEAREST other berth, not the most interesting one. A call-out is by definition local:
      // you are the rig that can be there before the seal fails. Measured before this constraint
      // existed, `_pickExpressDestination` handed a tender a client **12,757 units** away — a
      // three-minute transit leg at its planning speed, for a job whose whole premise is urgency,
      // and a hull that consequently spends its entire observable life in `transit`.
      const client = this._nearestStationTo(stations, home);
      if (!client || !client.pos) return null;
      return {
        kind: 'tender', sectorId,
        route: [
          { id: 'berth:' + stationIdentity(home), pos: { x: home.pos.x, z: home.pos.z }, label: 'Berth' },
          { id: 'client:' + stationIdentity(client), pos: { x: client.pos.x, z: client.pos.z }, label: 'Call-out' },
        ],
      };
    }
    if (role === 'patrol') {
      const R = 200; const cx = home.pos.x; const cz = home.pos.z;
      return {
        kind: 'patrol', sectorId,
        route: [
          { id: 'beat0', pos: { x: cx + R, z: cz }, label: 'Beat 1' },
          { id: 'beat1', pos: { x: cx, z: cz + R }, label: 'Beat 2' },
          { id: 'beat2', pos: { x: cx - R, z: cz }, label: 'Beat 3' },
          { id: 'beat3', pos: { x: cx, z: cz - R }, label: 'Beat 4' },
        ],
      };
    }
    return null;
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
    if (role === 'express') {
      ent.data.hitchable = true;
      ent.data.scanLabel = 'EXPRESS LINER · HITCHABLE';
      if (!ent.data.trafficLabel) ent.data.trafficLabel = 'Express Liner';
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
      const target = (stations && stations.length)
        ? (role === 'express'
            ? (this._expressDestinationFromItinerary(stations, d.itinerary) || this._pickStation(stations))
            : this._pickStation(stations))
        : null;
      // Preserve durable cargo manifest across rematerialize / continuous handoff (M2).
      let manifest = d.cargoManifest || null;
      if (!manifest || !Array.isArray(manifest.lines)) {
        manifest = this._assignManifest(e, role, target, sectorId);
      } else {
        e.data.cargoManifest = manifest;
      }
      const rec = {
        id: e.id,
        role,
        targetId: target ? target.id : null,
        waitT: 0,
        nextTradeT: 2 + adoptIdx * 1.5,
        orbitPhase: this._rng() * Math.PI * 2,
        dockSeq: d.freightDockSeq | 0,
        manifest,
      };
      if (role === 'express') {
        this._stampTrafficDurableIdentity(e, sectorId, role, TRAFFIC_ROLES.express, adoptIdx);
        this._stampExpressRoute(e, rec, null, target, sectorId, adoptIdx, true);
      }
      this.state.traffic.freighters.push(rec);
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

  _pickExpressDestination(stations, origin) {
    if (!stations || !stations.length) return null;
    const choices = stations.filter((station) => station && station !== origin);
    if (!choices.length) return origin || stations[0];
    return choices[Math.floor(this._rng() * choices.length)] || choices[0];
  },

  _expressDestinationFromItinerary(stations, itinerary) {
    const id = itinerary && itinerary.destinationStationId;
    if (!id) return null;
    return stations.find((station) => stationIdentity(station) === id) || null;
  },

  _stampExpressRoute(entity, rec, origin, destination, sectorId, seq, preserve = false) {
    if (!entity || !rec || rec.role !== 'express') return;
    const data = entity.data || (entity.data = {});
    let itinerary = preserve && data.itinerary && data.itinerary.kind === 'express_hitch_route'
      ? data.itinerary
      : null;
    if (!itinerary) {
      const originId = stationIdentity(origin) || 'local_departure';
      const destinationId = stationIdentity(destination) || originId;
      const seed = (this.state.meta && this.state.meta.seed) || 1;
      const slot = hash32(seed, sectorId, 'express-hitch-slot', seq | 0) % 6;
      itinerary = {
        kind: 'express_hitch_route',
        routeId: `express:${sectorId}:${originId}>${destinationId}`,
        sectorId,
        originStationId: originId,
        destinationStationId: destinationId,
        serviceLabel: 'Express Hitch Line',
        departureSlotS: slot * 30,
        hitchable: true,
        transitIntent: 'v3_boost',
      };
      data.itinerary = itinerary;
    }
    const routeLabel = `${stationName(origin, itinerary.originStationId)} → ${stationName(destination, itinerary.destinationStationId)}`;
    data.hitchable = true;
    data.trafficLabel = `EXPRESS LINER · ${routeLabel}`;
    data.scanLabel = `${data.trafficLabel} · HITCHABLE`;
    rec.itinerary = itinerary;
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

    let lostWorldSiteRoute = false;
    let lostClaimTravelRoute = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const rec = list[i];
      const e = state.entities.get(rec.id);
      if (!e || !e.alive) {
        if (rec && rec.worldSiteRoute) lostWorldSiteRoute = true;
        if (rec && rec.claimTravelRoute) lostClaimTravelRoute = true;
        list.splice(i, 1);
        continue;
      }
      // PQ-014: when this hull carries a live NPC job, npcJobsRuntime owns its steering. Traffic
      // yields entirely (no setIntent) so there is exactly one intent writer per job hull per tick.
      if (e.data && e.data.jobId) continue;
      const role = TRAFFIC_ROLES[rec.role] || TRAFFIC_ROLES.hauler;

      if (rec.worldSiteRoute) {
        this._stepWorldSiteRoute(e, rec, stations, dt);
        continue;
      }
      if (rec.claimTravelRoute) {
        this._stepClaimTravelRoute(e, rec, stations, dt);
        continue;
      }

      // Role-specific behavior dispatch (spec §12.1). Each role has a distinct, readable behavior.
      if (role.orbits) { this._stepOrbit(e, rec, stations, dt); continue; }       // patrol
      if (role.flees) { this._stepFlee(e, rec, stations, state); continue; }       // pirate/raider
      if (role.seeks === 'asteroid') { this._stepMiner(e, rec, stations, state); continue; } // miner
      if (role.escorts) { this._stepEscort(e, rec, list, state); continue; }       // convoy escort

      // resolve current target (it may have despawned)
      let target = state.entities.get(rec.targetId);
      if (!target || !target.alive) {
        target = role.express
          ? this._pickExpressDestination(stations, null)
          : this._pickStation(stations);
        rec.targetId = target ? target.id : null;
        if (!target) continue;
        if (role.express) {
          this._stampExpressRoute(e, rec, null, target,
            (state.world && state.world.currentSectorId) || 'unknown', i);
        }
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
        const nextTarget = role.express
          ? this._pickExpressDestination(stations, target)
          : this._pickStation(stations);
        rec.targetId = nextTarget.id;
        if (role.express) {
          // Each completed leg advances the durable itinerary while retaining stable ship identity.
          e.data.itinerary = null;
          this._stampExpressRoute(e, rec, target, nextTarget,
            (state.world && state.world.currentSectorId) || 'unknown', rec.dockSeq | 0);
        }
        setIntent(e, 0, 0, false, false, null, aimAngle);
        continue;
      }
      // drive: face the target, thrust forward. moveZ=1 means forward along the nose.
      const expressBoost = !!(role.express && massline2Flag('hitchhiking'));
      setIntent(e, 0, 1, expressBoost, false, null, aimAngle);
      // V3 reads this intent and applies real thrust. Traffic never writes velocity, so a latched
      // player receives only the Rapier constraint pull and whatever momentum the liner earns.
    }
    if (lostWorldSiteRoute) {
      this._applyWorldSiteTrafficHooks(state.world && state.world.currentSectorId);
    }
    if (lostClaimTravelRoute) {
      this._applyClaimTravelHooks(state.world && state.world.currentSectorId);
    }
  },

  _stepWorldSiteRoute(entity, rec, stations, dt) {
    const route = rec.worldSiteRoute;
    const site = entityWithWorldRecord(this.state, route.siteWorldRecordId);
    const station = stations.find((candidate) => stationIdentity(candidate) === route.stationId);
    const target = route.endpoint === 'station' ? station : site;
    if (!target || !target.pos) {
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    rec.targetId = target.id;
    if (rec.waitT > 0) {
      rec.waitT = Math.max(0, rec.waitT - dt);
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    const dx = target.pos.x - entity.pos.x;
    const dz = target.pos.z - entity.pos.z;
    const aim = Math.atan2(dz, dx);
    if (Math.hypot(dx, dz) < DOCK_RANGE) {
      route.endpoint = route.endpoint === 'station' ? 'site' : 'station';
      rec.waitT = 2.5;
      setIntent(entity, 0, 0, false, false, null, aim);
      return;
    }
    setIntent(entity, 0, 1, false, false, null, aim);
  },

  _stepClaimTravelRoute(entity, rec, stations, dt) {
    const route = rec.claimTravelRoute;
    const station = stations.find((candidate) => stationIdentity(candidate) === route.stationId);
    const target = route.endpoint === 'station'
      ? station && station.pos
      : route.slingPos;
    if (!target) {
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    rec.targetId = route.endpoint === 'station' && station ? station.id : null;
    if (rec.waitT > 0) {
      rec.waitT = Math.max(0, rec.waitT - dt);
      setIntent(entity, 0, 0, false, false, null, entity.rot);
      return;
    }
    const dx = target.x - entity.pos.x;
    const dz = target.z - entity.pos.z;
    const aim = Math.atan2(dz, dx);
    if (Math.hypot(dx, dz) < DOCK_RANGE) {
      route.endpoint = route.endpoint === 'station' ? 'sling' : 'station';
      rec.waitT = 2.5;
      setIntent(entity, 0, 0, false, false, null, aim);
      return;
    }
    // This is a normal V3 intent. The infrastructure chooses the job's two physical endpoints;
    // it never assigns position or velocity and never bypasses NPC thrust/turn authority.
    setIntent(entity, 0, 1, true, false, null, aim);
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

  /**
   * The rock a barge working out of `home` would actually cut: the nearest workable one, with a
   * deterministic spread so a shift's barges do not all stack on the same face.
   *
   * WHY THIS EXISTS. `_pickAsteroid` samples the sector's asteroid index UNIFORMLY, which is right
   * for its original callers (the ambient stepper wandering to some rock) and wrong for commissioning
   * a durable job. A sector is 4200 units in radius, so a uniformly-drawn field waypoint routinely
   * sends a barge past several hundred identical rocks to cut one across the map. Measured in
   * `sector_helios_prime`: live job hulls sitting 1083, 1694, 1841, 3815 and **13491** units from the
   * player, with the working ones effectively never in the same place as anything else.
   *
   * That is a fiction problem before it is a density problem — no crew burns a shift's fuel to reach
   * an identical rock — and it is a density problem because extraction ends up nowhere near the
   * refinery that eats the ore, so neither the player nor any other NPC ever shares a frame with it.
   *
   * `spread` picks the Nth-nearest rather than always the 1st, so several barges out of one refinery
   * work neighbouring faces instead of stacking on one. It is an index, not a random draw: the caller
   * derives it from the hull's own spawn ordinal so the result stays deterministic.
   */
  _pickWorkableAsteroidNear(state, home, spread = 0) {
    if (!home || !home.pos) return this._pickAsteroid(state);
    const indexed = state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1
      ? state.entityIndex.asteroids
      : null;
    const source = indexed && indexed.length ? indexed : (state.entityList || []);
    // Keep the best (spread + 1) by distance without sorting the whole field. The candidate count is
    // tiny and bounded, so this stays a single linear pass over the index.
    const wanted = Math.max(1, Math.min(MINER_FIELD_SPREAD_CAP, (spread | 0) + 1));
    const bestId = new Array(wanted).fill(null);
    const bestD2 = new Array(wanted).fill(Infinity);
    for (const rock of source) {
      if (!rock || rock.type !== 'asteroid' || !rock.alive || !rock.pos) continue;
      const dx = rock.pos.x - home.pos.x;
      const dz = rock.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      for (let i = 0; i < wanted; i++) {
        if (d2 >= bestD2[i]) continue;
        for (let j = wanted - 1; j > i; j--) { bestD2[j] = bestD2[j - 1]; bestId[j] = bestId[j - 1]; }
        bestD2[i] = d2;
        bestId[i] = rock.id;
        break;
      }
    }
    // Fewer rocks than the requested rank: fall back down the list rather than returning null, so a
    // thin field still yields a job instead of silently dropping the barge to its ambient stepper.
    for (let i = wanted - 1; i >= 0; i--) if (bestId[i] != null) return bestId[i];
    return null;
  },

  /**
   * The nearest OTHER station to `home`, or null when `home` is the only berth in reach.
   *
   * Distinct from `_pickExpressDestination`, which deliberately reaches for a far, interesting
   * endpoint because an express liner's whole point is crossing the map. Local trades need the
   * opposite: the berth you can actually be at before the seal fails.
   */
  _nearestStationTo(stations, home) {
    if (!Array.isArray(stations) || !home || !home.pos) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const st of stations) {
      if (!st || st === home || !st.pos) continue;
      const dx = st.pos.x - home.pos.x;
      const dz = st.pos.z - home.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = st; }
    }
    return best;
  },

  /**
   * Nearest live entity of `type` to `anchor`, or null. Used to bind a working job to a real body
   * (a salvor's hulk) rather than a coordinate, so the site can be resolved again at render time
   * and the job dies honestly when the body does.
   *
   * Linear over the entity list, but this runs once per hull at commission — never per frame.
   */
  _nearestOfTypeTo(state, anchor, type) {
    if (!anchor || !anchor.pos || !state) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const e of state.entityList || []) {
      if (!e || e.type !== type || e.alive === false || !e.pos) continue;
      const dx = e.pos.x - anchor.pos.x;
      const dz = e.pos.z - anchor.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
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
    const lostWorldSiteRoute = !!(rec && rec.worldSiteRoute);
    const lostClaimTravelRoute = !!(rec && rec.claimTravelRoute);
    const ent = this.state.entities && this.state.entities.get && this.state.entities.get(p.id);
    const role = (rec && rec.role)
      || (ent && ent.data && ent.data.trafficRole)
      || null;
    if (!rec && !(ent && ent.data && ent.data.trafficRole)) return;
    if (role && !FREIGHT_TRADING_ROLES.includes(role) && !(rec && rec.manifest && rec.manifest.totalQty)) {
      // Non-trading traffic (patrol/escort) — drop tracking only.
      if (idx >= 0) list.splice(idx, 1);
      if (lostWorldSiteRoute) {
        this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
      }
      if (lostClaimTravelRoute) {
        this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
      }
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
    if (lostWorldSiteRoute) {
      this._applyWorldSiteTrafficHooks(this.state.world && this.state.world.currentSectorId);
    }
    if (lostClaimTravelRoute) {
      this._applyClaimTravelHooks(this.state.world && this.state.world.currentSectorId);
    }
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

function stationIdentity(station) {
  if (!station) return null;
  const data = station.data || {};
  const id = data.stationId || data.id || station.id;
  return id == null ? null : String(id);
}

function entityWithWorldRecord(state, worldRecordId) {
  if (!state || !state.entities || !worldRecordId) return null;
  for (const entity of state.entities.values()) {
    if (entity && entity.alive !== false && entity.data && entity.data.worldRecordId === worldRecordId) return entity;
  }
  return null;
}

function liveEntity(state, id) {
  const entity = state && state.entities && state.entities.get && state.entities.get(id);
  return entity && entity.alive !== false ? entity : null;
}

function stableTrafficKey(entity) {
  return String(entity && entity.data && entity.data.worldRecordId || entity && entity.id || '');
}

function isWorldSiteTrafficFallbackRole(roleId) {
  const role = TRAFFIC_ROLES[roleId];
  return !!role && !role.orbits && !role.escorts && !role.flees;
}

function stationName(station, fallback) {
  const data = station && station.data || {};
  return String(data.name || data.label || fallback || 'Local');
}
