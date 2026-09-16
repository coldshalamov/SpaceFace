// Claimable bodies system (V2 §6 / M3; specializations M5 / SPEC3-F6-26). Owns state.claims — the
// player's claimed bodies, the modules built on them, and each body's OPERATING IDENTITY (its
// specialization). The "you own a place" fantasy, scoped as base-as-node (not a tile grid).
//
// Verbs:
//   - CLAIM: fly near a claimable body POI, pay CLAIM_COST. Body becomes yours, with N module slots.
//   - BUILD: pay a module's cost, fit it into a free slot. The module provides a passive effect.
//   - COMMISSION: pay a specialization's cost to turn the claim into one of three working sites
//     (Industrial Refinery / Trade Relay / Defense Bastion). One identity per body; switching
//     requires empty site storage. See BODY_SPECIALIZATIONS in data/claimableBodies.js.
//   - DELIVER / WITHDRAW / COLLECT: move goods between the player hold and the site stores
//     (physical logistics — the base is a place you fly freight to, not a menu).
//   - TELEPORT: if a teleporter module is built, instant travel between the body and its linked
//     station (the V2 §8 lane-collapser — the milestone unlock that rewrites map geometry).
//   - BUILD THROUGHLINE: an Industrial Refinery consumes carried industrial goods to align one
//     permanent acceleration ring + nav relay toward a real station. Claims owns the durable
//     construction receipt; travelLanes and traffic consume it without becoming save writers.
//   - SENSOR POST: once per sector-day, emits one owned local-intel request. World validates and
//     records the fuzzy rumor; scanner only consumes the post's presence for non-combat POI range.
//
// Specialization behavior ticks in update():
//   - REFINERY converts delivered ore into refined goods (REFINE_MAP truth, 2:1) into an output
//     store the player hauls out. Its risk: upkeep + stored goods draw raiders in low-sec space.
//   - RELAY dispatches scheduled convoys to the linked station and sells at the destination's REAL
//     market price less the fee (the proven outpost autosell −20%), pressing that market honestly.
//     No economy peer / no market price → freight is held, never converted to fabricated profit.
//   - BASTION contests raids: it raises this body's defense rating, lends coverage to every claim
//     in the sector, and announces inbound raids (warning coverage). It never spawns combat, never
//     aggros lawful traffic, and never writes heat/reputation — raids are the only threats it acts
//     against, and only via the legacy raid dice it decomposes (see raidTripChance/repelChance).
//
// Raid model (moved from automation.js:824-846 — the same proven math, decomposed for receipts):
//   legacy pRaid = clamp(danger*0.4 / defenseMult, 0, 0.5)  ==  pTrip × (1 − pRepel)
//   where pTrip = clamp(danger*0.4, 0, 0.5) and pRepel = 1 − 1/max(1, defense/20).
//   Raids only roll in sectors below RAID_SECURITY_FLOOR (lawful space never raids player bases),
//   only against sites with stored goods, lose a bounded fraction (never the base), and freeze the
//   site for a recoverable cooldown. Claims never tick offline, so there is no off-screen loss.
//
// Single-writer: claims owns only state.claims. Credits route through economy intents, cargo
// through the cargo helpers; claims never writes credits/cargo caches/reputation/heat directly.
// Determinism: all rolls draw from a dedicated seeded stream (state.claims.meta.rngSeed, created
// lazily on first commission so unspecialized saves and the 47a golden keep their exact shape).
// PERSISTENCE: serialize()/deserialize() capture state.claims (bodies + spec state + meta +
// migration receipt) with a specVersion stamp; older saves default bodies to spec:null and run the
// F6-owned legacy-outpost migration exactly once (see _migrateLegacyOutposts).
import {
  BODY_MODULES, BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE, CLAIM_COST,
  BODY_SPECIALIZATIONS, BODY_SPECIALIZATION_BY_ID,
} from '../data/claimableBodies.js';
import { techDisplayName } from '../data/tech.js';
import { addCargo, removeCargo } from './cargo.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { SECTORS, dangerIndex, stationGrowthLadderFor } from '../data/sectors.js';
import { OUTPOSTS } from '../data/automation.js';
import { outpostOutputGoodId } from './automation.js';
import { isRunSealed } from '../core/runSeal.js';
import { farActorTableRadius } from '../world/farActorTable.js';
import { depotPatrolLine, stationFactionIdFor, stationGrowthReaction } from '../data/conflictReactions.js';

// Refinery conversion: 2 ore -> 1 refined material (the "lighter, dearer goods to ship" beat).
const REFINE_RATIO = 2;
const REFINE_MAP = { // raw ore -> refined commodity
  cmdty_ore_iron: 'cmdty_refined_metals',
  cmdty_ore_copper: 'cmdty_comp_circuitry',
  cmdty_silicate: 'cmdty_polymers',
  cmdty_ore_titanium: 'cmdty_alloys',
  cmdty_ore_platinoid: 'cmdty_alloys',
};
export const REFINABLE_ORE_IDS = Object.keys(REFINE_MAP);

// Specialization cadences and raid contract (legacy outpost truth, claim-scoped).
export const SPEC_UPKEEP_EVERY_S = 60;     // upkeep settles once a minute (outpost autosell cadence)
export const SPEC_RAID_EVERY_S = 600;      // raid roll window (automation OUTPOST_RAID_INTERVAL_S)
export const RAID_SECURITY_FLOOR = 0.5;    // sectors at/above this security never raid player bases
export const SPEC_RAID_LOSS_FRAC = 0.7;    // uncovered raid takes 70% of stored goods (legacy)
export const SPEC_RAID_COOLDOWN_S = 300;   // raided site freeze (legacy raidCooldown)
export const SPEC_DETERRENCE_S = 1200;     // a repelled raid buys 20 min of halved pressure
export const CLAIM_RAID_ATTACKER_RANGE = Object.freeze([4, 6]);
export const CLAIM_DEFENSE_WARNING_S = 150; // travel window before off-screen fallback
export const CLAIM_DEFENSE_ARRIVAL_R = 720; // reach the physical claim, not merely its sector
export const CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA = 'claim_travel_sling_v1';
const RELAY_LOSS_BASE = 0.05;              // convoy loss floor in unlawful space…
const RELAY_LOSS_DANGER = 0.25;            // …plus danger scaling, capped:
const RELAY_LOSS_CAP = 0.35;
const MAX_RECEIPTS = 8;                    // per-body receipt ring (the ledger's memory)
const SLING_BODY_CLEARANCE_WU = 160;
const SLING_STATION_CLEARANCE_WU = 180;
const SLING_MIN_ROUTE_WU = 520;
const SLING_LATERAL_OFFSETS_WU = Object.freeze([0, 160, -160, 280, -280]);
const CLAIM_DAY_SECONDS = 600;

// PQ-170.01 — station growth and depot dependency.
// A station gains an authored module because of PLAYER-supplied throughput: the sell side of the
// player's own market trades plus the freight the player's Trade Relay convoys land there. The
// ladder lives in data/sectors.js; claims owns the durable ledger (state.claims.stationGrowth,
// created lazily on the first counted unit so untraded saves and goldens keep their exact shape).
// A stocked Trade Relay is a DEPOT Concord's patrols depend on: while the player keeps freight in
// it, claims asks the encounter director (its public authored-request seam, the same one traffic
// uses for the depot pirate watch) to post a lawful patrol_beat rotation on the depot lane. Let the
// stores run dry, go cold, or get raided and the rotation is withdrawn — the presence degrades
// because the support did.
export const STATION_GROWTH_SCHEMA = 'station_growth_v1';
export const DEPOT_SUPPORT_GRACE_S = 90;         // dry stores tolerated before support lapses
export const DEPOT_PATROL_SHAPE_ID = 'patrol_beat';
export const DEPOT_PATROL_FACTION_ID = 'faction_scn'; // the shape flies the Concord flag everywhere
export const DEPOT_PATROL_ROTATION_GAP_S = 30;   // relief gap after a beat resolves (≈80% duty cycle)
export const DEPOT_PATROL_RETRY_S = 10;          // director denied / off-sector poll cadence
// A rotation only counts (and only earns Concord standing) after it actually held the lane for
// half a beat. The beat also resolves 'completed' when the far-actor table virtualizes the hulls
// seconds after the player flies off, so without a floor a post/leave/return loop would farm rep.
export const DEPOT_PATROL_CREDIT_FLOOR_S = 60;
export const DEPOT_PATROL_ANCHOR_FRAC = 0.35;    // rotation holds the lane a third of the way out
export const DEPOT_PATROL_ZONE_RADIUS_WU = 280;
// A rotation is a physical presence: it only posts while the player is inside the world's
// near-residency radius of the lane anchor (capped here), otherwise the far-actor table would
// virtualize the hulls two ticks after they spawned and the beat would churn spawns unseen.
export const DEPOT_PATROL_PRESENCE_RANGE_WU = 1400;
export const DEPOT_PATROL_ID_PREFIX = 'depot-patrol:';

function pointSegmentDistanceSquared(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (!(lengthSq > 0)) {
    const ox = px - ax;
    const oz = pz - az;
    return ox * ox + oz * oz;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const ox = px - (ax + dx * t);
  const oz = pz - (az + dz * t);
  return ox * ox + oz * oz;
}

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));
// Authored station records by id (PQ-170.01 growth resolves type/faction/name through these).
const STATION_DEF_BY_ID = (() => {
  const map = new Map();
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      if (station && station.id) map.set(station.id, { station, sector });
    }
  }
  return map;
})();
// F6 unification: which operating identity a legacy abstract outpost becomes.
const OUTPOST_TO_SPEC = {
  outpost_refinery: 'spec_refinery',
  outpost_fuelsynth: 'spec_refinery',
  outpost_habhub: 'spec_relay',
};

let _nextClaimId = 1;

function fmtCr(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function sumStore(bucket) {
  let total = 0;
  for (const id in bucket) total += bucket[id] || 0;
  return total;
}

function materialName(id) {
  return String(id || 'material').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

function firstMissingModuleMaterial(mod, player) {
  const recipe = mod && mod.materials;
  if (!recipe || typeof recipe !== 'object') return null;
  const items = player && player.cargo && player.cargo.items || {};
  for (const id of Object.keys(recipe)) {
    const need = Math.max(0, Math.floor(Number(recipe[id]) || 0));
    const have = Math.max(0, Math.floor(Number(items[id]) || 0));
    if (have < need) return { id, need, have, missing: need - have };
  }
  return null;
}

// The raid dice, decomposed so bastions produce honest receipts instead of silently editing a
// probability. pTrip×(1−pRepel) equals the legacy automation pRaid for every reachable input.
export function raidTripChance(danger, opts = {}) {
  const base = Math.min(Math.max((danger || 0) * 0.4, 0), 0.5);
  return opts.deterred ? base * 0.5 : base;
}

export function repelChance(defenseRating) {
  return 1 - 1 / Math.max(1, (defenseRating || 0) / 20);
}

// A claim's effective defense rating: its own battery module, its own active garrison, and the
// stationed protection lent by an active Defense Bastion elsewhere in the same sector.
export function claimDefenseRating(body, bodies = []) {
  if (!body) return 0;
  let rating = 0;
  const battery = BODY_MODULE_BY_ID.get('mod_defense');
  if (body.modules && body.modules.includes('mod_defense')) rating += (battery && battery.defenseRating) || 0;
  const bastionDef = BODY_SPECIALIZATION_BY_ID.get('spec_bastion');
  if (body.spec && body.spec.id === 'spec_bastion' && body.spec.status === 'active' && bastionDef) {
    rating += bastionDef.defenseBonus || 0;
  }
  if (bastionDef) {
    const covered = bodies.some((b) => b && b !== body && b.sectorId === body.sectorId
      && b.spec && b.spec.id === 'spec_bastion' && b.spec.status === 'active');
    if (covered) rating += bastionDef.coverageBonus || 0;
  }
  return rating;
}

export const claims = {
  name: 'claims',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    // state.claims: { bodies: [{ id, sectorId, poiId, name, size, slots, modules:[modId|null],
    //   linkedStationId, x, z, spec }], specVersion, meta?, legacyMigration? }
    if (!this.state.claims) this.state.claims = { bodies: [] };
    // World respawns POI entities on sector entry — re-stamp specialization identity on them.
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('sector:enter', () => this._applyAllPoiLabels());
      // PQ-170.01: world respawns stations on sector entry — re-stamp the growth they earned.
      this.bus.on('sector:enter', () => this._stampAllStationGrowth());
      // PQ-170.01: player-supplied throughput. Only the SELL side supplies a station.
      this.bus.on('economy:tradeCompleted', (payload) => this._onTradeCompleted(payload || {}));
      // PQ-170.01: a Concord depot rotation resolving (beat elapsed, stood down) schedules the next.
      this.bus.on('encounter:resolved', (payload) => this._onDepotPatrolResolved(payload || {}));
      this.bus.on('encounter:resolved', (payload) => this._onDefenseEncounterResolved(payload || {}));
      this.bus.on('claim:defenseIgnore', (payload) => {
        const body = this._body(payload && payload.bodyId);
        if (body && body.spec && body.spec.defense) this._settleDefense(body, 'ignored');
      });
    }
    this._resumeDefenseIds = new Set();
  },

  // Is the POI at the given id already claimed by the player?
  isClaimed(poiId) {
    return (this.state.claims.bodies || []).some((b) => b.poiId === poiId);
  },

  // Claim the body at a POI. Validates credits + that it's unclaimed. POI def carries size/name/pos.
  claim(poi) {
    if (!poi || this.isClaimed(poi.id)) {
      this.bus.emit('toast', { text: 'Already claimed or invalid', kind: 'error', ttl: 3 });
      return false;
    }
    const player = this.state.player;
    if (player.credits < CLAIM_COST) {
      const missing = CLAIM_COST - (Number(player.credits) || 0);
      this.bus.emit('toast', { text: 'Need ' + fmtCr(missing) + ' more cr to claim ' + (poi.name || 'this body'), kind: 'error', ttl: 3 });
      return false;
    }
    // charge via the canonical economy path
    this.bus.emit('economy:chargeCredits', { amount: CLAIM_COST, reason: 'claim_body' });
    const size = poi.size || 'M';
    const body = {
      id: 'claim_' + (_nextClaimId++),
      sectorId: this.state.world && this.state.world.currentSectorId,
      poiId: poi.id,
      name: poi.name || 'Claimed Body',
      size,
      slots: BODY_SLOTS_BY_SIZE[size] || 3,
      modules: [],          // array of modIds built so far
      linkedStationId: null,
      x: poi.pos ? poi.pos.x : 0,
      z: poi.pos ? poi.pos.z : 0,
      claimedAt: this.state.simTime || 0,
      owned: true,          // canonical ownership truth used by map + authored place resolver
      spec: null,           // operating identity (see specialize())
    };
    this.state.claims.bodies.push(body);
    this._applyPoiLabel(body);
    this.bus.emit('toast', { text: '✓ Claimed: ' + body.name + ' (' + body.slots + ' module slots)', kind: 'good', ttl: 4 });
    this.bus.emit('claim:claimed', { body });
    this.bus.emit('audio:cue', { id: 'confirm' });
    return true;
  },

  // Build a module on a claimed body. Validates cost, tech, free slot, not-already-built.
  buildModule(bodyId, modId) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    const mod = BODY_MODULE_BY_ID.get(modId);
    if (!body || !mod) return false;
    if (body.modules.includes(modId)) {
      this.bus.emit('toast', { text: 'Already built: ' + mod.name, kind: 'error', ttl: 3 });
      return false;
    }
    if (body.modules.length >= body.slots) {
      this.bus.emit('toast', { text: 'No free module slots on ' + body.name, kind: 'error', ttl: 3 });
      return false;
    }
    const player = this.state.player;
    if (mod.techReq && !player.researchedNodes.includes(mod.techReq)) {
      this.bus.emit('toast', { text: 'Research required: ' + techDisplayName(mod.techReq), kind: 'error', ttl: 3 });
      return false;
    }
    if (mod.requiresSpec && (!body.spec || body.spec.id !== mod.requiresSpec || body.spec.status !== 'active')) {
      const spec = BODY_SPECIALIZATION_BY_ID.get(mod.requiresSpec);
      this.bus.emit('toast', {
        text: 'Commission ' + ((spec && spec.name) || mod.requiresSpec) + ' before building ' + mod.name,
        kind: 'error', ttl: 4,
      });
      return false;
    }
    const missingMaterial = firstMissingModuleMaterial(mod, player);
    if (missingMaterial) {
      this.bus.emit('toast', {
        text: 'Need ' + missingMaterial.missing + ' more ' + materialName(missingMaterial.id) + ' for ' + mod.name,
        kind: 'error', ttl: 4,
      });
      return false;
    }
    // A sling is not freely placed. The claim system resolves one deterministic, clear line from
    // this physical body to a real in-sector station before any credits or materials are spent.
    const travelRoute = mod.effect === 'travel_sling'
      ? this._prepareTravelInfrastructure(body, mod)
      : null;
    if (mod.effect === 'travel_sling' && !travelRoute) return false;
    if (player.credits < mod.cost) {
      const missing = mod.cost - (Number(player.credits) || 0);
      this.bus.emit('toast', { text: 'Need ' + fmtCr(missing) + ' more cr for ' + mod.name, kind: 'error', ttl: 3 });
      return false;
    }
    this.bus.emit('economy:chargeCredits', { amount: mod.cost, reason: 'build_module' });
    for (const id of Object.keys(mod.materials || {})) {
      removeCargo(this.state, id, mod.materials[id]);
    }
    body.modules.push(modId);
    // teleporter auto-links to the nearest station on build (the lane it collapses)
    if (mod.effect === 'teleport') {
      body.linkedStationId = this._nearestStationId(body);
      this.bus.emit('toast', { text: 'Teleporter linked to ' + (this._stationName(body.linkedStationId) || 'nearest station'), kind: 'good', ttl: 4 });
    } else if (mod.effect === 'travel_sling') {
      body.infrastructure = this._newTravelInfrastructure(body, mod, travelRoute);
      this._receipt(body, 'throughline_fabricated', 'Throughline ring and nav relay fabricated — alignment underway', {
        infrastructureId: body.infrastructure.id,
        stationId: body.infrastructure.stationId,
        distanceWU: body.infrastructure.distanceWU,
        materials: { ...(mod.materials || {}) },
      });
      this.bus.emit('claim:infrastructureConstructed', {
        bodyId: body.id,
        infrastructureId: body.infrastructure.id,
        stationId: body.infrastructure.stationId,
        stage: body.infrastructure.stage,
      });
      this.bus.emit('toast', {
        text: 'Throughline fabricated — ring and relay aligning to ' + (this._stationName(body.infrastructure.stationId) || 'station'),
        kind: 'good', ttl: 5,
      });
    } else if (mod.effect === 'sensor_post') {
      this.bus.emit('toast', {
        text: 'Sensor Post online — sector POI coverage and one local rumor per day',
        kind: 'good', ttl: 5,
      });
    } else {
      this.bus.emit('toast', { text: '✓ Built: ' + mod.name + ' on ' + body.name, kind: 'good', ttl: 3.5 });
    }
    this.bus.emit('claim:moduleBuilt', { bodyId, modId });
    this.bus.emit('audio:cue', { id: 'confirm' });
    this._applyPoiLabel(body);
    return true;
  },

  // ------------------------------------------------------------------------------------------
  // SPECIALIZATION — commission the claim into one of three operating identities (M5).
  // Deliberate action, exact cost, idempotent, and never inferred from UI state.
  // ------------------------------------------------------------------------------------------
  specialize(bodyId, specId) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    const def = BODY_SPECIALIZATION_BY_ID.get(specId);
    if (!body || !def) {
      this.bus.emit('toast', { text: 'Unknown claim or specialization', kind: 'error', ttl: 3 });
      return false;
    }
    if (body.spec && body.spec.id === specId) {
      this.bus.emit('toast', { text: 'Already commissioned: ' + def.name, kind: 'info', ttl: 3 });
      return false;
    }
    if (body.spec && (sumStore(body.spec.store.input) + sumStore(body.spec.store.output) > 0 || body.spec.convoy)) {
      this.bus.emit('toast', { text: 'Empty site storage before re-commissioning ' + body.name, kind: 'error', ttl: 3 });
      return false;
    }
    if (!body.modules.includes(def.requiresModule)) {
      const mod = BODY_MODULE_BY_ID.get(def.requiresModule);
      this.bus.emit('toast', { text: 'Build ' + ((mod && mod.name) || def.requiresModule) + ' first', kind: 'error', ttl: 3 });
      return false;
    }
    const player = this.state.player;
    if (player.credits < def.cost) {
      const missing = def.cost - (Number(player.credits) || 0);
      this.bus.emit('toast', { text: 'Need ' + fmtCr(missing) + ' more cr to commission ' + def.name, kind: 'error', ttl: 3 });
      return false;
    }
    this.bus.emit('economy:chargeCredits', { amount: def.cost, reason: 'claim_specialize' });
    body.spec = this._freshSpec(def);
    this._ensureMeta();
    this._receipt(body, 'commissioned', 'Commissioned as ' + def.name);
    this._emitDeploymentOnce(body, def);
    this.bus.emit('claim:specialized', { bodyId: body.id, specId: def.id });
    this.bus.emit('toast', {
      text: '✓ ' + def.short + ' online — ' + def.playerVerb,
      kind: 'good', ttl: 5,
    });
    this.bus.emit('audio:cue', { id: 'confirm' });
    this._applyPoiLabel(body);
    return true;
  },

  // Campaign B6 observes the canonical `asset:deployed` event. A commissioned claim is a real
  // player outpost, but the old claims path only emitted `claim:specialized`, leaving the story
  // step disconnected. Persist the receipt on the body (not the replaceable specialization) so
  // re-commissioning and save/reload cannot grant the deployment twice.
  _emitDeploymentOnce(body, def) {
    if (!body || body.deploymentReceipt) return false;
    const simTime = this.state.simTime || 0;
    const receipt = {
      receiptId: 'claim-deploy:' + body.id,
      kind: 'outpost',
      id: body.id,
      claimId: body.id,
      claimSpecId: def.id,
      sectorId: body.sectorId || null,
      simTime,
      source: 'claims',
    };
    body.deploymentReceipt = receipt;
    this.bus.emit('asset:deployed', { ...receipt });
    return true;
  },

  // Move goods from the player hold into the site store. Returns units actually moved.
  // Refinery accepts refinable ore only; relay accepts any freight; bastion takes none.
  deliverToClaim(bodyId, goodId, qty) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    const def = body && body.spec && BODY_SPECIALIZATION_BY_ID.get(body.spec.id);
    const ask0 = Math.floor(Number(qty) || 0);
    if (!body || !def || ask0 <= 0) return 0;
    if (def.id === 'spec_bastion') {
      this.bus.emit('toast', { text: 'The garrison takes no freight', kind: 'info', ttl: 3 });
      return 0;
    }
    if (def.id === 'spec_refinery' && !REFINE_MAP[goodId]) {
      this.bus.emit('toast', { text: 'Refinery takes raw ore only', kind: 'error', ttl: 3 });
      return 0;
    }
    const cap = def.id === 'spec_refinery' ? def.inputCapU : def.storeCapU;
    const room = Math.max(0, cap - sumStore(body.spec.store.input));
    const ask = Math.min(ask0, room);
    if (ask <= 0) {
      this.bus.emit('toast', { text: 'Site storage full on ' + body.name, kind: 'error', ttl: 3 });
      return 0;
    }
    const moved = removeCargo(this.state, goodId, ask);
    if (moved > 0) {
      body.spec.store.input[goodId] = (body.spec.store.input[goodId] || 0) + moved;
      this._receipt(body, 'delivered', 'Received ' + moved + 'u of freight', { goodId, qty: moved });
    }
    return moved;
  },

  // Pull unprocessed input back into the player hold. Returns units actually moved.
  withdrawFromClaim(bodyId, goodId, qty) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    if (!body || !body.spec) return 0;
    const have = body.spec.store.input[goodId] || 0;
    const ask = Math.min(Math.floor(Number(qty) || 0), have);
    if (ask <= 0) return 0;
    const accepted = addCargo(this.state, goodId, ask);
    if (accepted > 0) {
      body.spec.store.input[goodId] = have - accepted;
      if (body.spec.store.input[goodId] <= 0) delete body.spec.store.input[goodId];
      this._receipt(body, 'withdrawn', 'Released ' + accepted + 'u back to the hold', { goodId, qty: accepted });
    }
    return accepted;
  },

  // Move the whole output store into the player hold (partial when the hold is short on volume).
  // Returns units actually moved.
  collectFromClaim(bodyId) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    if (!body || !body.spec) return 0;
    const output = body.spec.store.output;
    let total = 0;
    for (const id of Object.keys(output)) {
      const accepted = addCargo(this.state, id, output[id]);
      if (accepted > 0) {
        output[id] -= accepted;
        if (output[id] <= 0) delete output[id];
        total += accepted;
      }
    }
    if (total > 0) {
      body.spec.outputFull = false;
      this._receipt(body, 'collected', 'Shipped out ' + total + 'u of goods', { qty: total });
    }
    return total;
  },

  // Honest operations readout for the Base screen and tests. Every number is computed from live
  // state with the SAME functions the tick uses — the UI never re-derives production/raid math.
  ledger(bodyId) {
    const bodies = (this.state.claims && this.state.claims.bodies) || [];
    const body = bodies.find((b) => b.id === bodyId);
    if (!body) return null;
    const spec = body.spec;
    const def = spec && BODY_SPECIALIZATION_BY_ID.get(spec.id);
    if (!spec || !def) {
      return { bodyId: body.id, name: body.name, specId: null, specName: null, status: null };
    }
    const t = this.state.simTime || 0;
    const sector = SECTOR_BY_ID.get(body.sectorId);
    const security = sector ? sector.security : 1;
    const danger = sector ? dangerIndex(sector) : 0;
    const rating = claimDefenseRating(body, bodies);
    const covered = bodies.some((b) => b !== body && b.sectorId === body.sectorId
      && b.spec && b.spec.id === 'spec_bastion' && b.spec.status === 'active');
    const deterred = (spec.deterrenceUntil || 0) > t;
    const meta = this.state.claims.meta;
    const out = {
      bodyId: body.id,
      name: body.name,
      specId: def.id,
      specName: def.name,
      status: spec.status,
      since: spec.since,
      upkeepPerMin: def.upkeepPerMin,
      upkeepDebt: Math.round(spec.upkeepDebt || 0),
      stores: {
        inputU: sumStore(spec.store.input),
        inputCapU: def.id === 'spec_refinery' ? def.inputCapU : (def.id === 'spec_relay' ? def.storeCapU : 0),
        outputU: sumStore(spec.store.output),
        outputCapU: def.id === 'spec_refinery' ? def.outputCapU : 0,
      },
      flows: {
        refinedTotalU: spec.totals.refinedTotalU,
        soldTotalCr: spec.totals.soldTotalCr,
        lostTotalU: spec.totals.lostU,
        upkeepPaidCr: spec.totals.upkeepPaidCr,
      },
      defense: { rating, coveredByBastion: covered },
      risk: {
        security,
        raidEligible: !!sector && security < RAID_SECURITY_FLOOR,
        tripChance: raidTripChance(danger, { deterred }),
        repelChance: repelChance(rating),
        lossFrac: covered ? BODY_SPECIALIZATION_BY_ID.get('spec_bastion').coveredLossFrac : SPEC_RAID_LOSS_FRAC,
        deterredUntil: spec.deterrenceUntil || 0,
        nextRollInS: meta ? Math.max(0, SPEC_RAID_EVERY_S - (meta.raidAccum || 0)) : SPEC_RAID_EVERY_S,
      },
      convoy: spec.convoy
        ? { ...spec.convoy, etaS: Math.max(0, spec.convoy.arriveAt - t) }
        : null,
      throughput: null,
      readiness: null,
      infrastructure: body.infrastructure ? {
        id: body.infrastructure.id,
        name: body.infrastructure.name,
        stage: body.infrastructure.stage,
        operational: body.infrastructure.operational === true,
        stationId: body.infrastructure.stationId,
        stationName: this._stationName(body.infrastructure.stationId) || body.infrastructure.stationId,
        distanceWU: body.infrastructure.distanceWU,
        ceilingMult: body.infrastructure.ceilingMult,
        rampMult: body.infrastructure.rampMult,
        alignRemainingS: body.infrastructure.stage === 'aligning'
          ? Math.max(0, (body.infrastructure.alignUntil || 0) - t)
          : 0,
        damagePolicy: body.infrastructure.damagePolicy,
      } : null,
      depot: this._depotSupportReadout(body),
      lastEvent: spec.receipts.length ? spec.receipts[spec.receipts.length - 1] : null,
      receipts: spec.receipts.slice(),
    };
    if (def.id === 'spec_refinery') {
      out.throughput = { refineRatePerS: def.refineRatePerS, refineRatio: REFINE_RATIO };
    } else if (def.id === 'spec_relay') {
      out.throughput = {
        convoyLoadU: def.convoyLoadU,
        minLoadU: def.minLoadU,
        dispatchEveryS: def.dispatchEveryS,
        transitS: def.transitS,
        saleFee: def.saleFee,
        destStationId: this._relayDestination(body, { resolve: false }),
      };
    } else if (def.id === 'spec_bastion') {
      out.readiness = {
        coveredBodies: bodies.filter((b) => b.sectorId === body.sectorId && b.spec).length,
        defenseBonus: def.defenseBonus,
        coverageBonus: def.coverageBonus,
        active: spec.status === 'active',
      };
    }
    return out;
  },

  // Teleport the player from a claimed body (with a teleporter) to its linked station. The V2 §8
  // lane-collapser in action. Returns true if the jump happened.
  teleportFrom(bodyId) {
    const body = (this.state.claims.bodies || []).find((b) => b.id === bodyId);
    if (!body || !body.modules.includes('mod_teleporter') || !body.linkedStationId) {
      this.bus.emit('toast', { text: 'No active teleporter on this body', kind: 'error', ttl: 3 });
      return false;
    }
    // route through the world system's jump-to-station path if available
    this.bus.emit('claim:teleportRequest', { bodyId, targetStationId: body.linkedStationId });
    this.bus.emit('toast', { text: 'Quantum jump engaged → ' + (this._stationName(body.linkedStationId) || 'station'), kind: 'info', ttl: 3 });
    return true;
  },

  // The depot beacon position for a body (where automation drones drop off). Used by the alphabet's
  // 'depot' beacon resolver via a future hook; for now returns the body's world pos.
  depotPos(bodyId) {
    const b = (this.state.claims.bodies || []).find((x) => x.id === bodyId);
    return b ? { x: b.x, z: b.z } : null;
  },

  _prepareTravelInfrastructure(body, mod) {
    const stationId = this._nearestStationId(body);
    const station = this._stationEntity(stationId);
    if (!station || !station.pos) {
      this.bus.emit('toast', { text: 'Throughline needs a live in-sector station endpoint', kind: 'error', ttl: 4 });
      return null;
    }
    const bx = Number(body.x);
    const bz = Number(body.z);
    const sx = Number(station.pos.x);
    const sz = Number(station.pos.z);
    if (![bx, bz, sx, sz].every(Number.isFinite)) return null;
    const dx = sx - bx;
    const dz = sz - bz;
    const centerDistance = Math.hypot(dx, dz);
    if (!(centerDistance >= SLING_MIN_ROUTE_WU)) {
      this.bus.emit('toast', { text: 'Throughline endpoint is too close for a safe acceleration corridor', kind: 'error', ttl: 4 });
      return null;
    }
    const axis = { x: dx / centerDistance, z: dz / centerDistance };
    const normal = { x: -axis.z, z: axis.x };
    const corridorRadiusWU = Math.max(1, Number(mod.corridorRadiusWU) || 240);
    let route = null;
    for (const lateral of SLING_LATERAL_OFFSETS_WU) {
      const from = {
        x: bx + axis.x * SLING_BODY_CLEARANCE_WU + normal.x * lateral,
        z: bz + axis.z * SLING_BODY_CLEARANCE_WU + normal.z * lateral,
      };
      const to = {
        x: sx - axis.x * SLING_STATION_CLEARANCE_WU + normal.x * lateral,
        z: sz - axis.z * SLING_STATION_CLEARANCE_WU + normal.z * lateral,
      };
      if (!this._travelInfrastructurePointClear(from, body, station)
        || !this._travelInfrastructurePointClear(to, body, station)
        || !this._travelInfrastructureCorridorClear(from, to, corridorRadiusWU, body, station)) continue;
      const routeDx = to.x - from.x;
      const routeDz = to.z - from.z;
      const distanceWU = Math.hypot(routeDx, routeDz);
      if (distanceWU > 0) route = { from, to, routeDx, routeDz, distanceWU };
      if (route) break;
    }
    if (!route) {
      this.bus.emit('toast', { text: 'No clear Throughline corridor between this claim and station', kind: 'error', ttl: 4 });
      return null;
    }
    // The support relay sits on the same saved line, far enough from both endpoints to be read as
    // a second structure rather than decoration bolted onto the ring or station.
    let support = null;
    for (const fraction of [0.55, 0.42, 0.68, 0.3, 0.8]) {
      const candidate = {
        x: route.from.x + route.routeDx * fraction,
        z: route.from.z + route.routeDz * fraction,
      };
      if (this._travelInfrastructurePointClear(candidate, body, station)) {
        support = candidate;
        break;
      }
    }
    if (!support) {
      this.bus.emit('toast', { text: 'No clear Throughline relay hardpoint along this route', kind: 'error', ttl: 4 });
      return null;
    }
    return {
      stationId,
      from: route.from,
      to: route.to,
      support,
      distanceWU: route.distanceWU,
    };
  },

  _travelInfrastructurePointClear(pos, body, station) {
    const list = this.state.entityList || [];
    for (const entity of list) {
      // A passing craft cannot invalidate a permanent surveyed hardpoint. Only static world bodies
      // participate in the build clearance test.
      if (!this._travelInfrastructureStaticBlocker(entity, body, station)) continue;
      const clearance = 72 + Math.max(0, Number(entity.radius) || 0);
      if (Math.hypot(entity.pos.x - pos.x, entity.pos.z - pos.z) < clearance) return false;
    }
    return true;
  },

  _travelInfrastructureCorridorClear(from, to, corridorRadiusWU, body, station) {
    const list = this.state.entityList || [];
    for (const entity of list) {
      if (!this._travelInfrastructureStaticBlocker(entity, body, station)) continue;
      const radius = corridorRadiusWU + Math.max(0, Number(entity.radius) || 0);
      if (pointSegmentDistanceSquared(
        entity.pos.x, entity.pos.z,
        from.x, from.z,
        to.x, to.z,
      ) < radius * radius) return false;
    }
    return true;
  },

  _travelInfrastructureStaticBlocker(entity, body, station) {
    if (!entity || entity.alive === false || entity === station || entity.collides === false) return false;
    if (body && body.poiId && entity.data && entity.data.poiId === body.poiId) return false;
    if (['ship', 'drone', 'projectile', 'pickup', 'payload', 'wreck'].includes(entity.type)) return false;
    return !!entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z);
  },

  _newTravelInfrastructure(body, mod, route) {
    const builtAt = Number(this.state.simTime) || 0;
    return {
      schema: CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA,
      id: `throughline:${body.id}`,
      bodyId: body.id,
      sectorId: body.sectorId,
      name: `${body.name} Throughline`,
      stationId: route.stationId,
      stage: 'aligning',
      operational: false,
      builtAt,
      alignUntil: builtAt + Math.max(0, Number(mod.alignTimeS) || 0),
      from: { x: route.from.x, z: route.from.z },
      to: { x: route.to.x, z: route.to.z },
      support: { x: route.support.x, z: route.support.z },
      distanceWU: route.distanceWU,
      corridorRadiusWU: Math.max(1, Number(mod.corridorRadiusWU) || 240),
      ceilingMult: Math.max(1, Number(mod.ceilingMult) || 1),
      rampMult: Math.max(1, Number(mod.rampMult) || 1),
      damagePolicy: 'claim_status',
      fabricationReceipt: {
        receiptId: `throughline-build:${body.id}`,
        builtAt,
        stationId: route.stationId,
        costCr: Math.max(0, Number(mod.cost) || 0),
        materials: { ...(mod.materials || {}) },
      },
    };
  },

  /** Visit durable Throughline records without allocating a per-frame array. */
  visitTravelInfrastructure(sectorId, visitor) {
    if (typeof visitor !== 'function') return 0;
    let count = 0;
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      const infrastructure = body && body.infrastructure;
      if (!infrastructure || infrastructure.schema !== CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA) continue;
      if (sectorId && body.sectorId !== sectorId) continue;
      visitor(infrastructure, body);
      count += 1;
    }
    return count;
  },

  activeTravelInfrastructure(sectorId) {
    const out = [];
    this.visitTravelInfrastructure(sectorId, (infrastructure, body) => {
      if (infrastructure.operational === true) out.push({ infrastructure, body });
    });
    return out;
  },

  travelInfrastructureHooks(sectorId) {
    return this.activeTravelInfrastructure(sectorId).map(({ infrastructure, body }) => ({
      id: infrastructure.id,
      bodyId: body.id,
      sectorId: body.sectorId,
      stationId: infrastructure.stationId,
      slingPos: { x: infrastructure.from.x, z: infrastructure.from.z },
      label: `${infrastructure.name} service run`,
      eligibleRoles: ['hauler', 'trader'],
    }));
  },

  _tickTravelInfrastructure(body, state) {
    const infrastructure = body && body.infrastructure;
    if (!infrastructure || infrastructure.schema !== CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA) return;
    const now = Number(state.simTime) || 0;
    if (infrastructure.stage === 'aligning' && now >= (Number(infrastructure.alignUntil) || 0)) {
      infrastructure.stage = 'active';
      if (body.spec) {
        this._receipt(body, 'throughline_active', 'Throughline aligned — physical corridor open to ' + (this._stationName(infrastructure.stationId) || infrastructure.stationId), {
          infrastructureId: infrastructure.id,
          stationId: infrastructure.stationId,
          distanceWU: infrastructure.distanceWU,
        });
      }
      this.bus.emit('claim:infrastructureActive', { bodyId: body.id, infrastructureId: infrastructure.id });
      if (body.sectorId === (state.world && state.world.currentSectorId)) {
        this.bus.emit('toast', { text: 'Throughline online · ' + body.name + ' ↔ ' + (this._stationName(infrastructure.stationId) || 'station'), kind: 'good', ttl: 5 });
      }
      this._applyPoiLabel(body);
    }
    const operational = infrastructure.stage === 'active'
      && !!body.spec && body.spec.id === 'spec_refinery' && body.spec.status === 'active';
    if (infrastructure.operational !== operational) {
      infrastructure.operational = operational;
      this._applyPoiLabel(body);
      this.bus.emit('claim:infrastructureStatus', {
        bodyId: body.id,
        infrastructureId: infrastructure.id,
        operational,
        reason: operational ? 'active' : (body.spec && body.spec.status) || infrastructure.stage,
      });
    }
  },

  // Per-tick: specialization behavior + legacy passive effects. Bodies WITHOUT a specialization
  // keep the original module behavior (refinery module refines from the player hold); a
  // commissioned body runs its operating identity instead (store-based, physical logistics).
  update(dt, state) {
    const bodies = state.claims && state.claims.bodies;
    if (!bodies || !bodies.length) return;
    let anySpec = false;
    for (const body of bodies) {
      this._tickSensorPost(body, state);
      if (body.spec) {
        anySpec = true;
        this._tickSpec(body, dt, state);
      } else if (body.modules.includes('mod_refinery')) {
        const mod = BODY_MODULE_BY_ID.get('mod_refinery');
        const rate = (mod.refineRate || 0.5) * dt; // ore-units this tick
        this._tickRefinery(body, rate);
      }
      this._tickDepotSupport(body, state);
      this._tickTravelInfrastructure(body, state);
    }
    this._tickRaidDefenses(bodies, state);
    if (!anySpec) return;
    const meta = this._ensureMeta();
    meta.upkeepAccum = (meta.upkeepAccum || 0) + dt;
    while (meta.upkeepAccum >= SPEC_UPKEEP_EVERY_S) {
      meta.upkeepAccum -= SPEC_UPKEEP_EVERY_S;
      this._settleUpkeep(bodies, state);
    }
    meta.raidAccum = (meta.raidAccum || 0) + dt;
    while (meta.raidAccum >= SPEC_RAID_EVERY_S) {
      meta.raidAccum -= SPEC_RAID_EVERY_S;
      this._rollRaids(bodies, state);
    }
  },

  _tickSensorPost(body, state) {
    if (!body || !Array.isArray(body.modules) || !body.modules.includes('mod_sensor_post')) return false;
    const dayIndex = Math.max(0, Math.floor((Number(state.simTime) || 0) / CLAIM_DAY_SECONDS));
    if (body.sensorPostLastRumorDay === dayIndex) return false;
    body.sensorPostLastRumorDay = dayIndex;
    this.bus.emit('claim:sensorPostRumor', { bodyId: body.id, sectorId: body.sectorId, dayIndex });
    return true;
  },

  _tickSpec(body, dt, state) {
    const spec = body.spec;
    const def = BODY_SPECIALIZATION_BY_ID.get(spec.id);
    if (!def) return;
    const t = state.simTime || 0;
    if (spec.status === 'raided') {
      if (t < (spec.statusUntil || 0)) return; // frozen: no work, no upkeep accrual
      spec.status = 'active';
      spec.statusUntil = 0;
      this._receipt(body, 'site_recovered', 'Crews back to work after the raid');
    }
    // Upkeep accrues while staffed; a cold (unpaid) site stops accruing until it's paid off.
    if (spec.status === 'active') spec.upkeepDebt = (spec.upkeepDebt || 0) + (def.upkeepPerMin / 60) * dt;
    if (def.id === 'spec_refinery') this._tickSpecRefinery(body, def, dt);
    else if (def.id === 'spec_relay') this._tickSpecRelay(body, def, state);
    // spec_bastion has no per-tick production — its work happens in _rollRaids + the ledger.
  },

  _tickSpecRefinery(body, def, dt) {
    const spec = body.spec;
    if (spec.status !== 'active') return;
    spec.acc = (spec.acc || 0) + def.refineRatePerS * dt;
    while (spec.acc >= REFINE_RATIO) {
      // most plentiful refinable ore with at least one whole batch
      let bestOre = null, bestQty = 0;
      for (const ore of REFINABLE_ORE_IDS) {
        const have = spec.store.input[ore] || 0;
        if (have >= REFINE_RATIO && have > bestQty) { bestQty = have; bestOre = ore; }
      }
      if (!bestOre) break; // starved — hold progress (bounded below)
      if (sumStore(spec.store.output) >= def.outputCapU) {
        if (!spec.outputFull) {
          spec.outputFull = true;
          this._receipt(body, 'output_full', 'Output store full — collect refined goods');
        }
        break;
      }
      spec.store.input[bestOre] -= REFINE_RATIO;
      if (spec.store.input[bestOre] <= 0) delete spec.store.input[bestOre];
      const out = REFINE_MAP[bestOre];
      spec.store.output[out] = (spec.store.output[out] || 0) + 1;
      spec.totals.refinedTotalU += 1;
      spec.acc -= REFINE_RATIO;
    }
    // don't bank unbounded progress while starved or full
    if (spec.acc > REFINE_RATIO * 4) spec.acc = REFINE_RATIO * 4;
  },

  _tickSpecRelay(body, def, state) {
    const spec = body.spec;
    const t = state.simTime || 0;
    // arrivals resolve even while cold — the convoy is already flying
    if (spec.convoy && t >= spec.convoy.arriveAt) {
      const convoy = spec.convoy;
      spec.convoy = null;
      const sector = SECTOR_BY_ID.get(body.sectorId);
      const danger = sector ? dangerIndex(sector) : 0;
      const lawful = !!sector && sector.security >= RAID_SECURITY_FLOOR;
      const pLoss = lawful ? 0 : Math.min(RELAY_LOSS_BASE + danger * RELAY_LOSS_DANGER, RELAY_LOSS_CAP);
      if (pLoss > 0 && this._rng() < pLoss) {
        spec.totals.lostU += convoy.qty;
        this._receipt(body, 'convoy_lost', 'Convoy lost en route — ' + convoy.qty + 'u gone',
          { goodId: convoy.goodId, qty: convoy.qty, destStationId: convoy.destStationId });
        this.bus.emit('toast', { text: 'Relay convoy lost near ' + body.name + ' (-' + convoy.qty + ' goods)', kind: 'warn', ttl: 4 });
      } else {
        const economy = this._economyPeer();
        const unit = economy && economy.priceOf ? economy.priceOf(convoy.destStationId, convoy.goodId, 'sell') : null;
        if (!(unit > 0)) {
          // no market truth at arrival: freight comes home — never fabricate a price
          spec.store.input[convoy.goodId] = (spec.store.input[convoy.goodId] || 0) + convoy.qty;
          this._receipt(body, 'convoy_returned', 'No buyer found — freight returned',
            { goodId: convoy.goodId, qty: convoy.qty, destStationId: convoy.destStationId });
        } else {
          // PQ-170.01: a station the player's freight grew keeps less of the sale.
          const saleFee = this._relaySaleFee(def, convoy.destStationId);
          const revenue = Math.round(convoy.qty * unit * (1 - saleFee));
          this.bus.emit('economy:grantCredits', { amount: revenue, reason: 'claim_relay_sale' });
          this.bus.emit('economy:applyTradePressure', { stationId: convoy.destStationId, good: convoy.goodId, vol: convoy.qty });
          spec.totals.soldTotalCr += revenue;
          this._receipt(body, 'convoy_sold', 'Convoy sold ' + convoy.qty + 'u at ' + (this._stationName(convoy.destStationId) || convoy.destStationId),
            { goodId: convoy.goodId, qty: convoy.qty, destStationId: convoy.destStationId, revenueCr: revenue, saleFee });
          // Relay freight landing at a real market is player-supplied throughput for that station.
          this._recordStationThroughput(convoy.destStationId, convoy.qty, 'relay_convoy', {
            goodId: convoy.goodId, bodyId: body.id,
          });
        }
      }
    }
    // scheduled dispatch — only while staffed, only with a real destination + market truth
    if (!spec.convoy && spec.status === 'active' && t >= (spec.nextDispatchAt || 0)) {
      spec.nextDispatchAt = t + def.dispatchEveryS;
      const dest = this._relayDestination(body);
      const economy = this._economyPeer();
      if (dest && economy) {
        let bestGood = null, bestQty = 0;
        for (const id in spec.store.input) {
          const q = spec.store.input[id] || 0;
          if (q > bestQty) { bestQty = q; bestGood = id; }
        }
        if (bestGood && bestQty >= def.minLoadU) {
          const qty = Math.min(def.convoyLoadU, bestQty);
          spec.store.input[bestGood] -= qty;
          if (spec.store.input[bestGood] <= 0) delete spec.store.input[bestGood];
          spec.convoy = { goodId: bestGood, qty, destStationId: dest, departedAt: t, arriveAt: t + def.transitS };
          this._receipt(body, 'convoy_dispatched', 'Convoy away — ' + qty + 'u to ' + (this._stationName(dest) || dest),
            { goodId: bestGood, qty, destStationId: dest });
        }
      }
    }
  },

  _settleUpkeep(bodies, state) {
    for (const body of bodies) {
      const spec = body.spec;
      const def = spec && BODY_SPECIALIZATION_BY_ID.get(spec.id);
      if (!spec || !def) continue;
      if (spec.status === 'raided') continue;
      const due = Math.round(spec.upkeepDebt || 0);
      if (due <= 0) continue;
      const credits = Math.round((state.player && state.player.credits) || 0);
      if (credits >= due) {
        this.bus.emit('economy:chargeCredits', { amount: due, reason: 'claim_upkeep' });
        spec.upkeepDebt = 0;
        spec.totals.upkeepPaidCr += due;
        if (spec.status === 'cold') {
          spec.status = 'active';
          this._receipt(body, 'upkeep_recovered', 'Crews paid — site back online');
          this.bus.emit('toast', { text: body.name + ' back online', kind: 'good', ttl: 3 });
        }
      } else if (spec.status === 'active') {
        spec.status = 'cold';
        this._receipt(body, 'upkeep_missed', 'Upkeep unpaid (' + fmtCr(due) + ' cr due) — site gone cold');
        this.bus.emit('toast', { text: body.name + ' gone cold — upkeep unpaid', kind: 'warn', ttl: 4 });
      }
    }
  },

  // The claim raid window (every SPEC_RAID_EVERY_S). Lawful space never raids; empty sites are not
  // targets; a raided site is frozen, never destroyed. Bastions warn (coverage), contest (repel
  // roll), soften losses, and buy deterrence — all via receipts, never silent.
  _rollRaids(bodies, state) {
    const t = state.simTime || 0;
    for (const body of bodies) {
      const spec = body.spec;
      if (!spec || spec.status === 'raided' || spec.defense) continue;
      const sector = SECTOR_BY_ID.get(body.sectorId);
      if (!sector || sector.security >= RAID_SECURITY_FLOOR) continue;
      const bastion = bodies.find((b) => b !== body && b.sectorId === body.sectorId
        && b.spec && b.spec.id === 'spec_bastion' && b.spec.status === 'active');
      const playerPresent = state.world && state.world.currentSectorId === body.sectorId;
      // No unseen dice deleting player property. Off-sector raids require an active bastion that
      // owns warning coverage; otherwise the risk waits until the player returns to counter it.
      if (!playerPresent && !bastion) continue;
      const stored = sumStore(spec.store.input) + sumStore(spec.store.output);
      if (stored <= 0) continue;
      const deterred = (spec.deterrenceUntil || 0) > t;
      const pTrip = raidTripChance(dangerIndex(sector), { deterred });
      if (this._rng() >= pTrip) continue;
      // raid inbound — warning coverage fires first
      if (bastion) {
        this._receipt(bastion, 'raid_warning', 'Raid warning — hostiles moving on ' + body.name);
        this.bus.emit('claim:raidWarning', { bodyId: body.id, bastionId: bastion.id, sectorId: body.sectorId });
      }
      const rating = claimDefenseRating(body, bodies);
      if (this._rng() < repelChance(rating)) {
        spec.totals.raidsRepelled += 1;
        spec.deterrenceUntil = t + SPEC_DETERRENCE_S;
        this._receipt(body, 'raid_repelled', 'Raid repelled — batteries held the line');
        this.bus.emit('claim:raidRepelled', { bodyId: body.id, defense: rating });
        this.bus.emit('toast', { text: 'Raid repelled at ' + body.name, kind: 'good', ttl: 4 });
      } else {
        const [minAttackers, maxAttackers] = CLAIM_RAID_ATTACKER_RANGE;
        this.beginRaidDefense(body.id, {
          bastionId: bastion && bastion.id,
          // Consume the existing dedicated raid-size draw, but map it onto the authored 4–6
          // swarm range rather than the legacy two-or-three abstraction.
          attackerCount: minAttackers + Math.floor(this._rng() * (maxAttackers - minAttackers + 1)),
        });
      }
    }
  },

  // Turn a tripped abstract raid into a durable response contract. Claims owns the warning and
  // settlement; the encounter director owns only the flyable combat set piece.
  beginRaidDefense(bodyId, options = {}) {
    const body = this._body(bodyId);
    const spec = body && body.spec;
    if (!body || !spec || spec.defense || spec.status === 'raided') return false;
    if (sumStore(spec.store.input) + sumStore(spec.store.output) <= 0) return false;
    const onboarding = this.state.onboarding;
    if (onboarding && onboarding.active && !onboarding.finished) return false;

    const meta = this._ensureMeta();
    const seq = Math.max(1, meta.nextRaidId | 0);
    meta.nextRaidId = seq + 1;
    const now = this.state.simTime || 0;
    const defenseId = `${body.id}:${seq}`;
    const attackerCount = Math.max(1, Math.min(6, Math.round(options.attackerCount || 2)));
    const previousWaypoint = this.state.nav && this.state.nav.waypoint
      ? JSON.parse(JSON.stringify(this.state.nav.waypoint)) : null;
    const defense = {
      id: defenseId,
      encounterId: `claim-defense:${defenseId}`,
      phase: 'warning',
      warnedAt: now,
      deadlineAt: now + CLAIM_DEFENSE_WARNING_S,
      requestedAt: null,
      attackerFactionId: 'faction_reach',
      attackerName: 'Reach scavengers',
      attackerCount,
      motive: `Stored freight at ${body.name} drew a Reach stripping crew to the seam.`,
      bastionId: options.bastionId || null,
      previousWaypoint,
    };
    spec.defense = defense;
    this._setDefenseWaypoint(body, defense);
    this._receipt(body, 'defense_warning', `${defense.attackerName} inbound — ${attackerCount} ships, ${CLAIM_DEFENSE_WARNING_S}s to respond`, {
      defenseId, attackerFactionId: defense.attackerFactionId, attackerCount,
    });
    this.bus.emit('claim:defenseWarning', {
      bodyId: body.id,
      defenseId,
      encounterId: defense.encounterId,
      sectorId: body.sectorId,
      pos: { x: body.x, z: body.z },
      attackerFactionId: defense.attackerFactionId,
      attackerName: defense.attackerName,
      attackerCount,
      motive: defense.motive,
      deadlineAt: defense.deadlineAt,
      countdownS: CLAIM_DEFENSE_WARNING_S,
    });
    this.bus.emit('toast', {
      text: `CLAIM ALERT — ${defense.attackerName}, ${attackerCount} ships. Reach ${body.name} in ${CLAIM_DEFENSE_WARNING_S}s.`,
      kind: 'warn', ttl: 7,
    });
    this.bus.emit('audio:cue', { id: 'warning' });
    return true;
  },

  _tickRaidDefenses(bodies, state) {
    const now = state.simTime || 0;
    for (const body of bodies) {
      const defense = body && body.spec && body.spec.defense;
      if (!defense) continue;
      if (defense.phase === 'warning') {
        if (now >= defense.deadlineAt) {
          this._settleDefense(body, 'ignored');
          continue;
        }
        this._setDefenseWaypoint(body, defense, { quiet: true });
        if (this._playerAtClaim(body, state)) this._requestDefenseEncounter(body, defense);
      } else if (defense.phase === 'engaged' && this._resumeDefenseIds && this._resumeDefenseIds.has(defense.id)) {
        // Continue can restore the claim while the player is still materializing in another
        // sector. Keep the durable retry token until the director actually accepts the encounter;
        // otherwise one wrong-sector/no-budget response would strand this defense forever.
        if (!state.world || state.world.currentSectorId !== body.sectorId) continue;
        if (now < (defense.retryAt || 0)) continue;
        if (this._requestDefenseEncounter(body, defense, { resume: true })) {
          this._resumeDefenseIds.delete(defense.id);
          delete defense.retryAt;
        } else {
          defense.retryAt = now + 2;
        }
      }
    }
  },

  _playerAtClaim(body, state) {
    if (!state.world || state.world.currentSectorId !== body.sectorId) return false;
    const player = state.entities && state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return false;
    const dx = player.pos.x - body.x;
    const dz = player.pos.z - body.z;
    return dx * dx + dz * dz <= CLAIM_DEFENSE_ARRIVAL_R * CLAIM_DEFENSE_ARRIVAL_R;
  },

  _requestDefenseEncounter(body, defense, options = {}) {
    const registry = this.ctx && this.ctx.registry;
    const director = registry && typeof registry.get === 'function' ? registry.get('encounterDirector') : null;
    const payload = {
      encounterId: defense.encounterId,
      claimId: body.id,
      defenseId: defense.id,
      sectorId: body.sectorId,
      anchor: { x: body.x, z: body.z },
      attackerFactionId: defense.attackerFactionId,
      attackerName: defense.attackerName,
      attackerCount: defense.attackerCount,
      motive: defense.motive,
      deadlineAt: defense.deadlineAt,
      resume: !!options.resume,
    };
    let result = null;
    if (director && typeof director.requestClaimDefense === 'function') result = director.requestClaimDefense(payload);
    else this.bus.emit('claim:defenseEncounterRequested', payload);
    if (!result || result.ok === false) return false;
    defense.phase = 'engaged';
    defense.encounterId = result.encounterId || defense.encounterId;
    defense.requestedAt = this.state.simTime || 0;
    this.bus.emit('claim:defenseStarted', { ...payload, encounterId: defense.encounterId });
    return true;
  },

  _onDefenseEncounterResolved(payload) {
    if (!payload || payload.shape !== 'claim_threat' || !payload.encounterId) return;
    const bodies = (this.state.claims && this.state.claims.bodies) || [];
    const body = bodies.find((candidate) => candidate && candidate.spec && candidate.spec.defense
      && candidate.spec.defense.encounterId === payload.encounterId);
    if (!body) return;
    if (String(payload.outcome || '').startsWith('aborted:')) {
      body.spec.defense.phase = 'warning';
      body.spec.defense.requestedAt = null;
      body.spec.defense.deadlineAt = Math.max(body.spec.defense.deadlineAt || 0, (this.state.simTime || 0) + 45);
      this._setDefenseWaypoint(body, body.spec.defense);
      return;
    }
    this._settleDefense(body, payload.outcome || 'timeout');
  },

  _settleDefense(body, rawOutcome) {
    const spec = body && body.spec;
    const defense = spec && spec.defense;
    if (!defense) return false;
    const outcome = ['defended', 'partial', 'retreated', 'timeout', 'destroyed', 'ignored'].includes(rawOutcome)
      ? rawOutcome : 'timeout';
    const settlement = {
      defended:  { lossFrac: 0,    rep: 3,  danger: -0.05, repairMin: 0,   cooldown: 0 },
      partial:   { lossFrac: 0.25, rep: 1,  danger: -0.01, repairMin: 0.5, cooldown: 120 },
      retreated: { lossFrac: 0.50, rep: -2, danger: 0.03,  repairMin: 1,   cooldown: 240 },
      timeout:   { lossFrac: 0.70, rep: -3, danger: 0.05,  repairMin: 1.5, cooldown: SPEC_RAID_COOLDOWN_S },
      ignored:   { lossFrac: 0.70, rep: -1, danger: 0.05,  repairMin: 1.5, cooldown: SPEC_RAID_COOLDOWN_S },
      destroyed: { lossFrac: 0.90, rep: -5, danger: 0.08,  repairMin: 3,   cooldown: SPEC_RAID_COOLDOWN_S * 2 },
    }[outcome];
    let lostU = 0;
    for (const bucket of [spec.store.input, spec.store.output]) {
      for (const id of Object.keys(bucket)) {
        const lost = Math.floor((bucket[id] || 0) * settlement.lossFrac);
        if (lost <= 0) continue;
        bucket[id] -= lost;
        lostU += lost;
        if (bucket[id] <= 0) delete bucket[id];
      }
    }
    const def = BODY_SPECIALIZATION_BY_ID.get(spec.id);
    spec.upkeepDebt = (spec.upkeepDebt || 0) + ((def && def.upkeepPerMin) || 0) * settlement.repairMin;
    spec.totals.lostU += lostU;
    if (outcome === 'defended') {
      spec.totals.raidsRepelled += 1;
      spec.deterrenceUntil = (this.state.simTime || 0) + SPEC_DETERRENCE_S;
    } else {
      spec.totals.raidsSuffered += 1;
      if (settlement.cooldown > 0) {
        spec.status = 'raided';
        spec.statusUntil = (this.state.simTime || 0) + settlement.cooldown;
      }
    }
    const sector = SECTOR_BY_ID.get(body.sectorId);
    if (sector && sector.factionId && settlement.rep) {
      this.bus.emit('faction:repDelta', { factionId: sector.factionId, delta: settlement.rep, reason: `claim_defense:${outcome}` });
    }
    this.bus.emit('sectorsim:impulse', { kind: `claim_defense_${outcome}`, sectorId: body.sectorId, danger: settlement.danger });
    const summary = outcome === 'defended'
      ? `Claim held — ${defense.attackerName} driven off; stores intact.`
      : `Claim defense ${outcome} — ${lostU}u lost; repair crews assigned.`;
    this._receipt(body, `defense_${outcome}`, summary, {
      defenseId: defense.id, encounterId: defense.encounterId, lostU,
      repDelta: settlement.rep, dangerDelta: settlement.danger,
    });
    spec.defense = null;
    this._restoreDefenseWaypoint(defense);
    this.bus.emit('claim:defenseResolved', {
      bodyId: body.id, defenseId: defense.id, encounterId: defense.encounterId,
      sectorId: body.sectorId, outcome, lostU, repDelta: settlement.rep,
      dangerDelta: settlement.danger,
      repairDebtCr: Math.round(((def && def.upkeepPerMin) || 0) * settlement.repairMin),
      text: summary,
    });
    this.bus.emit(outcome === 'defended' ? 'claim:raidRepelled' : 'claim:raided', {
      bodyId: body.id, defenseId: defense.id, outcome, lostU,
    });
    this.bus.emit('toast', { text: summary, kind: outcome === 'defended' ? 'good' : 'warn', ttl: 6 });
    return true;
  },

  _setDefenseWaypoint(body, defense, options = {}) {
    if (!this.state.nav) this.state.nav = { waypoint: null };
    const remaining = Math.max(0, Math.ceil((defense.deadlineAt || 0) - (this.state.simTime || 0)));
    const waypoint = {
      kind: 'claim_defense', markerKind: 'mission-objective', claimId: body.id, defenseId: defense.id,
      sectorId: body.sectorId, pos: { x: body.x, z: body.z }, label: `DEFEND ${body.name}`,
      reason: `${defense.attackerName} · ${defense.attackerCount} ships · respond at ${body.name} (${remaining}s)`,
      arrivalRadius: CLAIM_DEFENSE_ARRIVAL_R, deadline_s: defense.deadlineAt,
    };
    const current = this.state.nav.waypoint;
    if (!current || current.defenseId === defense.id || defense.phase === 'warning') {
      const changed = !current || current.defenseId !== defense.id || current.reason !== waypoint.reason;
      this.state.nav.waypoint = waypoint;
      if (changed && !options.quiet) this.bus.emit('nav:waypoint', waypoint);
    }
  },

  _restoreDefenseWaypoint(defense) {
    const nav = this.state.nav;
    if (!nav || !nav.waypoint || nav.waypoint.defenseId !== defense.id) return;
    nav.waypoint = defense.previousWaypoint || null;
    this.bus.emit('nav:waypoint', nav.waypoint);
  },

  _body(bodyId) {
    return ((this.state.claims && this.state.claims.bodies) || []).find((body) => body && body.id === bodyId) || null;
  },

  // Convert raw ore in cargo into refined materials at the given rate. Picks the most plentiful ore.
  // LEGACY module behavior for unspecialized bodies — a commissioned refinery uses site stores.
  _tickRefinery(body, oreUnits) {
    const cargo = this.state.player.cargo;
    if (!cargo || !cargo.items) return;
    // accumulate fractional conversion per-body so slow rates still progress
    body._refineAcc = (body._refineAcc || 0) + oreUnits;
    if (body._refineAcc < REFINE_RATIO) return; // not enough for one conversion yet
    const maxOutputs = Math.floor(body._refineAcc / REFINE_RATIO);
    // find the most plentiful refinable ore
    let bestOre = null, bestQty = 0;
    for (const ore of Object.keys(REFINE_MAP)) {
      const have = cargo.items[ore] || 0;
      if (have > bestQty) { bestQty = have; bestOre = ore; }
    }
    const outputs = Math.min(maxOutputs, Math.floor(bestQty / REFINE_RATIO));
    if (!bestOre || outputs <= 0) return; // nothing to refine
    body._refineAcc -= outputs * REFINE_RATIO;
    const out = REFINE_MAP[bestOre];
    removeCargo(this.state, bestOre, outputs * REFINE_RATIO);
    addCargo(this.state, out, outputs);
  },

  _nearestStationId(body) {
    let best = null, bestD = Infinity;
    const stations = (this.state.entityIndex && this.state.entityIndex.dockStations) || this.state.entityList;
    for (const e of stations) {
      if (!e.alive || e.type !== 'station' || (e.data && e.data.isGate)) continue;
      const d = (e.pos.x - body.x) ** 2 + (e.pos.z - body.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best && best.data && best.data.stationId;
  },

  _stationName(stationId) {
    if (!stationId) return null;
    const byStationId = this.state.entityIndex && this.state.entityIndex.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive && indexed.type === 'station' && indexed.data) return indexed.data.name || stationId;
    const stations = (this.state.entityIndex && this.state.entityIndex.stations) || this.state.entityList;
    for (const e of stations) {
      if (e.alive && e.type === 'station' && e.data && e.data.stationId === stationId) return e.data.name || stationId;
    }
    return stationId;
  },

  _stationEntity(stationId) {
    if (!stationId) return null;
    const byStationId = this.state.entityIndex && this.state.entityIndex.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    const stations = (this.state.entityIndex && this.state.entityIndex.stations) || this.state.entityList || [];
    for (const entity of stations) {
      if (entity && entity.alive !== false && entity.type === 'station'
        && entity.data && entity.data.stationId === stationId) return entity;
    }
    return null;
  },

  // Where this relay ships to: the teleporter-linked station if one exists, else a destination
  // resolved once — nearest station entity in-sector, falling back to the sector's authored
  // station data (so relays in other sectors still ship somewhere real).
  _relayDestination(body, opts = {}) {
    if (body.linkedStationId) return body.linkedStationId;
    if (body.spec && body.spec.destStationId) return body.spec.destStationId;
    if (opts.resolve === false) return null;
    let dest = this._nearestStationId(body) || null;
    if (!dest) {
      const sector = SECTOR_BY_ID.get(body.sectorId);
      const st = sector && sector.stations && sector.stations[0];
      dest = (st && st.id) || null;
    }
    if (dest && body.spec) body.spec.destStationId = dest;
    return dest;
  },

  _economyPeer() {
    const reg = this.ctx && this.ctx.registry;
    return reg && typeof reg.get === 'function' ? reg.get('economy') : null;
  },

  _freshSpec(def) {
    const t = this.state.simTime || 0;
    return {
      id: def.id,
      since: t,
      status: 'active',
      statusUntil: 0,
      store: { input: {}, output: {} },
      convoy: null,
      acc: 0,
      nextDispatchAt: def.dispatchEveryS ? t + def.dispatchEveryS : 0,
      destStationId: null,
      upkeepDebt: 0,
      deterrenceUntil: 0,
      outputFull: false,
      receipts: [],
      defense: null,
      totals: { refinedTotalU: 0, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0 },
    };
  },

  _normalizeTravelInfrastructure(raw, body) {
    if (!raw || typeof raw !== 'object' || !body || !Array.isArray(body.modules)
      || !body.modules.includes('mod_throughline_sling')) return null;
    const point = (value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.z))
      ? { x: Number(value.x), z: Number(value.z) }
      : null;
    const from = point(raw.from);
    const to = point(raw.to);
    const support = point(raw.support);
    const stationId = typeof raw.stationId === 'string' && raw.stationId ? raw.stationId : null;
    if (!from || !to || !support || !stationId) return null;
    const distanceWU = Math.hypot(to.x - from.x, to.z - from.z);
    if (!(distanceWU > 0)) return null;
    const stage = raw.stage === 'active' ? 'active' : 'aligning';
    const builtAt = Number.isFinite(Number(raw.builtAt)) ? Number(raw.builtAt) : 0;
    const savedReceipt = raw.fabricationReceipt && typeof raw.fabricationReceipt === 'object'
      ? raw.fabricationReceipt
      : {};
    return {
      schema: CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA,
      id: typeof raw.id === 'string' && raw.id ? raw.id : `throughline:${body.id}`,
      bodyId: body.id,
      sectorId: body.sectorId,
      name: typeof raw.name === 'string' && raw.name ? raw.name : `${body.name} Throughline`,
      stationId,
      stage,
      operational: stage === 'active' && !!body.spec
        && body.spec.id === 'spec_refinery' && body.spec.status === 'active',
      builtAt,
      alignUntil: Number.isFinite(Number(raw.alignUntil)) ? Number(raw.alignUntil) : 0,
      from,
      to,
      support,
      distanceWU,
      corridorRadiusWU: Math.max(1, Number(raw.corridorRadiusWU) || 240),
      ceilingMult: Math.max(1, Number(raw.ceilingMult) || 2),
      rampMult: Math.max(1, Number(raw.rampMult) || 2),
      damagePolicy: 'claim_status',
      fabricationReceipt: {
        receiptId: typeof savedReceipt.receiptId === 'string' && savedReceipt.receiptId
          ? savedReceipt.receiptId
          : `throughline-build:${body.id}`,
        builtAt: Number.isFinite(Number(savedReceipt.builtAt)) ? Number(savedReceipt.builtAt) : builtAt,
        stationId,
        costCr: Math.max(0, Number(savedReceipt.costCr) || 0),
        materials: savedReceipt.materials && typeof savedReceipt.materials === 'object'
          ? { ...savedReceipt.materials }
          : {},
      },
    };
  },

  // Heal a deserialized spec to the full schema (legacy/partial saves).
  _normalizeSpec(spec) {
    if (!spec || typeof spec !== 'object' || !BODY_SPECIALIZATION_BY_ID.has(spec.id)) return null;
    const def = BODY_SPECIALIZATION_BY_ID.get(spec.id);
    const fresh = this._freshSpec(def);
    const out = Object.assign(fresh, spec);
    out.store = spec.store && typeof spec.store === 'object'
      ? { input: { ...(spec.store.input || {}) }, output: { ...(spec.store.output || {}) } }
      : { input: {}, output: {} };
    out.receipts = Array.isArray(spec.receipts) ? spec.receipts.slice(-MAX_RECEIPTS) : [];
    out.defense = spec.defense && typeof spec.defense === 'object' ? { ...spec.defense } : null;
    out.totals = Object.assign(fresh.totals, spec.totals || {});
    if (!['active', 'cold', 'raided'].includes(out.status)) out.status = 'active';
    return out;
  },

  _receipt(body, kind, text, data) {
    const receipt = { t: this.state.simTime || 0, kind, text };
    if (data) receipt.data = data;
    body.spec.receipts.push(receipt);
    if (body.spec.receipts.length > MAX_RECEIPTS) body.spec.receipts.splice(0, body.spec.receipts.length - MAX_RECEIPTS);
    this.bus.emit('claim:receipt', { bodyId: body.id, receipt });
    return receipt;
  },

  // Claims meta (rng stream + cadence accumulators) is created LAZILY on first commission so
  // saves and goldens without specializations keep their exact state shape.
  _ensureMeta() {
    const claims = this.state.claims;
    if (!claims.meta) claims.meta = { rngSeed: 0, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 };
    if (!Number.isFinite(claims.meta.nextRaidId) || claims.meta.nextRaidId < 1) claims.meta.nextRaidId = 1;
    return claims.meta;
  },

  _rng() {
    const meta = this._ensureMeta();
    return drawSeeded(meta, 'rngSeed', hash32((this.state.meta && this.state.meta.seed) || 1, 'claims'));
  },

  // Stamp the specialization onto the claim's live POI entity so every surface that reads
  // entity data.name (local map, scanner, contacts) shows the operating identity. Display-only,
  // idempotent, re-applied on sector entry (world respawns POIs from data).
  _applyPoiLabel(body) {
    const def = body.spec && BODY_SPECIALIZATION_BY_ID.get(body.spec.id);
    const infrastructure = body.infrastructure;
    const throughline = infrastructure
      ? ` · THROUGHLINE ${infrastructure.operational ? 'ONLINE' : String(infrastructure.stage || 'OFFLINE').toUpperCase()}`
      : '';
    const list = this.state.entityList || [];
    for (const e of list) {
      if (!e || !e.alive || !e.data || e.data.poiId !== body.poiId) continue;
      if (!e.data.claimBaseName) e.data.claimBaseName = e.data.name || body.name;
      e.data.name = (def ? e.data.claimBaseName + ' — ' + def.name : e.data.claimBaseName) + throughline;
      e.data.claimOwned = body.owned === true;
      e.data.claimSpecId = def ? def.id : null;
      e.data.claimRole = def ? def.short : 'CLAIM';
      e.data.claimMapGlyph = def ? def.mapGlyph : '◆';
      e.data.claimMapColor = def ? def.mapColor : '#ffd24a';
      e.data.claimPlayerVerb = def ? def.playerVerb : 'Open the Base interface to build this claim.';
      e.data.claimTravelInfrastructureId = infrastructure ? infrastructure.id : null;
      e.data.claimTravelInfrastructureOperational = infrastructure ? infrastructure.operational === true : false;
      e.data.claimSensorPostActive = Array.isArray(body.modules) && body.modules.includes('mod_sensor_post');
    }
  },

  _applyAllPoiLabels() {
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      this._applyPoiLabel(body);
    }
  },

  // ------------------------------------------------------------------------------------------
  // F6-owned legacy migration: abstract automation outposts become claim specializations at a
  // free claimable body in their sector — or keep running untouched when none exists. Runs only
  // when loading a save older than specVersion 1, exactly once per load, and never duplicates:
  // an outpost is only converted after automation (its sole writer) confirms decommissioning.
  // ------------------------------------------------------------------------------------------
  _migrateLegacyOutposts() {
    const state = this.state;
    if (state.claims.legacyMigration) return;
    const a = state.automation;
    const automationSystem = this.ctx && this.ctx.registry && this.ctx.registry.get('automation');
    const outposts = a && Array.isArray(a.outposts) ? a.outposts.slice() : [];
    const receipt = { t: state.simTime || 0, migrated: 0, kept: 0, settledCr: 0 };
    for (const o of outposts) {
      const def = OUTPOST_BY_ID.get(o.defId);
      const specDef = BODY_SPECIALIZATION_BY_ID.get(OUTPOST_TO_SPEC[o.defId] || 'spec_relay');
      const poi = def && specDef ? this._findFreeClaimablePoi(o.sectorId) : null;
      if (!poi) { receipt.kept += 1; continue; }
      // Release through automation's public mutation method (fail-closed). An event here would be
      // descriptive only: automation has no releaseOutpost subscriber and remains the sole writer.
      const released = automationSystem && typeof automationSystem.decommissionOutpost === 'function'
        ? automationSystem.decommissionOutpost(o.id)
        : false;
      if (!released) { receipt.kept += 1; continue; }
      if (a.outposts.some((x) => x.id === o.id)) { receipt.kept += 1; continue; }
      const size = poi.size || 'M';
      const body = {
        id: 'claim_' + (_nextClaimId++),
        sectorId: o.sectorId,
        poiId: poi.id,
        name: poi.name || 'Reclaimed Outpost',
        size,
        slots: BODY_SLOTS_BY_SIZE[size] || 3,
        modules: [specDef.requiresModule], // the outpost's hardware IS the module — free carryover
        linkedStationId: null,
        x: 0,
        z: 0,
        claimedAt: state.simTime || 0,
        owned: true,
        spec: null,
      };
      body.spec = this._freshSpec(specDef);
      const qty = Math.round(o.storage || 0);
      if (qty > 0) {
        if (def.recipe && def.recipe.passive) {
          // passive hubs banked credit-value, not goods — settle it once, the same way the
          // outpost's own autosell would have (passive gross value == quantity).
          this.bus.emit('economy:grantCredits', { amount: qty, reason: 'claim_migration' });
          receipt.settledCr += qty;
        } else {
          // banked production carries over as the real output good (may exceed the new cap —
          // grandfathered; caps gate new intake, migration never destroys goods)
          body.spec.store.output[outpostOutputGoodId(def)] = qty;
        }
      }
      state.claims.bodies.push(body);
      this._receipt(body, 'migrated', 'Re-chartered from sector outpost');
      receipt.migrated += 1;
    }
    state.claims.legacyMigration = receipt;
    if (receipt.migrated > 0) {
      this.bus.emit('claims:migrated', { migrated: receipt.migrated, kept: receipt.kept });
      this.bus.emit('toast', { text: '✓ ' + receipt.migrated + ' outpost' + (receipt.migrated === 1 ? '' : 's') + ' re-chartered as claim operations', kind: 'good', ttl: 5 });
    }
  },

  _findFreeClaimablePoi(sectorId) {
    const sector = SECTOR_BY_ID.get(sectorId);
    if (!sector || !Array.isArray(sector.pois)) return null;
    return sector.pois.find((p) => p && p.claimable && !this.isClaimed(p.id)) || null;
  },

  // ------------------------------------------------------------------------------------------
  // PQ-170.01 — STATION GROWTH. Player-supplied throughput → authored station modules.
  // ------------------------------------------------------------------------------------------

  // The sell side of the player's own market trade supplies that station. Buys drain it and count
  // for nothing; a sealed Crucible run never grows the campaign's stations.
  _onTradeCompleted(payload) {
    if (!payload || payload.side !== 'sell' || !payload.stationId) return null;
    const qty = Math.floor(Number(payload.qty) || 0);
    if (qty <= 0) return null;
    if (isRunSealed(this.state)) return null;
    return this._recordStationThroughput(payload.stationId, qty, 'market_sell', {
      goodId: payload.commodityId || null,
    });
  },

  // Authored station record (type/faction/name/sector) with a live-entity fallback for stations the
  // world spawned from somewhere other than SECTORS. Unknown stations grow nothing.
  _stationDef(stationId) {
    const authored = STATION_DEF_BY_ID.get(stationId);
    if (authored) {
      const station = authored.station;
      return {
        stationId,
        type: station.type || 'trade_hub',
        factionId: station.factionId || authored.sector.factionId || null,
        name: station.name || stationId,
        sectorId: authored.sector.id,
      };
    }
    const entity = this._stationEntity(stationId);
    const data = entity && entity.data;
    if (!data || !data.stationTypeId) return null;
    return {
      stationId,
      type: data.stationTypeId,
      factionId: data.factionId || entity.factionId || null,
      name: data.stationBaseName || data.name || stationId,
      sectorId: data.sectorId || (this.state.world && this.state.world.currentSectorId) || null,
    };
  },

  _ensureStationGrowth(stationId) {
    const claims = this.state.claims;
    if (!claims.stationGrowth) claims.stationGrowth = {};
    let rec = claims.stationGrowth[stationId];
    if (rec) return rec;
    const def = this._stationDef(stationId);
    if (!def) return null;
    const t = this.state.simTime || 0;
    rec = claims.stationGrowth[stationId] = {
      schema: STATION_GROWTH_SCHEMA,
      stationId,
      sectorId: def.sectorId,
      factionId: def.factionId,
      name: def.name,
      type: def.type,
      throughputU: 0,
      rung: 0,
      modules: [],
      sources: { market_sell: 0, relay_convoy: 0 },
      firstSupplyAt: t,
      lastSupplyAt: t,
    };
    return rec;
  },

  /** Count `qty` units of player-supplied freight against `stationId`; gain every rung crossed. */
  _recordStationThroughput(stationId, qty, source, extra = {}) {
    const units = Math.floor(Number(qty) || 0);
    if (!stationId || units <= 0) return null;
    const rec = this._ensureStationGrowth(stationId);
    if (!rec) return null;
    rec.throughputU += units;
    rec.sources[source] = (rec.sources[source] || 0) + units;
    rec.lastSupplyAt = this.state.simTime || 0;
    const ladder = stationGrowthLadderFor({ type: rec.type });
    while (rec.rung < ladder.length && rec.throughputU >= ladder[rec.rung].throughputU) {
      this._gainStationModule(rec, ladder[rec.rung], source, extra);
    }
    this.bus.emit('station:throughput', {
      stationId, sectorId: rec.sectorId, factionId: rec.factionId,
      qty: units, source, throughputU: rec.throughputU, rung: rec.rung,
    });
    return rec;
  },

  _gainStationModule(rec, rung, source, extra = {}) {
    const t = this.state.simTime || 0;
    rec.rung += 1;
    const receiptId = `station-growth:${rec.stationId}:${rung.id}`;
    const module = {
      id: rung.id, name: rung.name, tag: rung.tag, rung: rec.rung,
      at: t, throughputU: rec.throughputU, source, receiptId,
    };
    rec.modules.push(module);
    const reaction = stationGrowthReaction({
      stationId: rec.stationId, stationName: rec.name, factionId: rec.factionId,
      moduleName: rung.name, throughputU: rec.throughputU, line: rung.line,
    });
    this._stampStationGrowth(rec);
    // The relay that fed it keeps the receipt too, so the Base ledger tells the same story.
    if (extra && extra.bodyId) {
      const body = this._body(extra.bodyId);
      if (body && body.spec) {
        this._receipt(body, 'station_grew', rec.name + ' gained ' + rung.name + ' on your convoys', {
          stationId: rec.stationId, moduleId: rung.id, rung: rec.rung, receiptId,
        });
      }
    }
    this.bus.emit('station:moduleGained', {
      stationId: rec.stationId, stationName: rec.name, sectorId: rec.sectorId, factionId: rec.factionId,
      moduleId: rung.id, moduleName: rung.name, tag: rung.tag, rung: rec.rung,
      throughputU: rec.throughputU, source, receiptId, text: reaction.text, dockLine: reaction.dockLine,
    });
    // Authored copy arrives verbatim on the ticker, the dock-arrival card and (through the news
    // surface) the toast — one voice, no second toast from here. receiptId is the ticker citation.
    this.bus.emit('news:publish', {
      text: reaction.text,
      kind: 'station_growth',
      stationId: rec.stationId,
      stationName: rec.name,
      sectorId: rec.sectorId,
      factionId: rec.factionId,
      moduleId: rung.id,
      receiptId,
      sourceRef: receiptId,
      eventId: receiptId,
      source: 'claims',
    });
    this.bus.emit('audio:cue', { id: 'confirm' });
    return module;
  },

  // Stamp earned growth onto the live station entity so every surface that reads a station's
  // data.name (contacts, target panel, local map, dock toasts) shows the module. Display-only,
  // idempotent, re-applied on sector entry because world respawns stations from data.
  _stampStationGrowth(rec) {
    if (!rec) return false;
    const entity = this._stationEntity(rec.stationId);
    const data = entity && entity.data;
    if (!data) return false;
    if (!data.stationBaseName) data.stationBaseName = data.name || rec.name || rec.stationId;
    const top = rec.modules.length ? rec.modules[rec.modules.length - 1] : null;
    data.name = top ? data.stationBaseName + ' · ' + top.tag : data.stationBaseName;
    data.stationGrowth = {
      rung: rec.rung,
      throughputU: rec.throughputU,
      label: top ? top.tag : null,
      modules: rec.modules.map((m) => m.name),
      lastReceiptId: top ? top.receiptId : null,
    };
    return true;
  },

  _stampAllStationGrowth() {
    const growth = this.state.claims && this.state.claims.stationGrowth;
    if (!growth) return 0;
    let stamped = 0;
    for (const stationId in growth) {
      if (this._stampStationGrowth(growth[stationId])) stamped += 1;
    }
    return stamped;
  },

  /** Relay sale fee at a station, less the cut a grown station gives the player's convoys. */
  _relaySaleFee(def, stationId) {
    const base = Math.max(0, Number(def && def.saleFee) || 0);
    const rec = this.stationGrowth(stationId);
    if (!rec || !(rec.rung > 0)) return base;
    const ladder = stationGrowthLadderFor({ type: rec.type });
    const step = ladder[rec.rung - 1];
    const cut = step ? Math.max(0, Number(step.relayFeeCut) || 0) : 0;
    // Fixed to four places so receipts and revenue never carry a binary-fraction artifact.
    return Math.max(0, Math.round((base - cut) * 10000) / 10000);
  },

  /** Public read: the growth record for a station, or null when nothing was ever supplied. */
  stationGrowth(stationId) {
    const growth = this.state.claims && this.state.claims.stationGrowth;
    return (growth && stationId && growth[stationId]) || null;
  },

  /** Public read: the authored ladder for a station id (type-resolved through SECTORS). */
  stationGrowthLadder(stationId) {
    const def = this._stationDef(stationId);
    return def ? stationGrowthLadderFor({ type: def.type }) : [];
  },

  _normalizeStationGrowth(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    let any = false;
    for (const stationId of Object.keys(raw)) {
      const rec = raw[stationId];
      if (!rec || typeof rec !== 'object') continue;
      const def = this._stationDef(stationId);
      const type = (typeof rec.type === 'string' && rec.type) || (def && def.type) || null;
      if (!type) continue;
      const ladder = stationGrowthLadderFor({ type });
      const throughputU = Math.max(0, Math.floor(Number(rec.throughputU) || 0));
      const modules = Array.isArray(rec.modules)
        ? rec.modules.filter((m) => m && typeof m.id === 'string').map((m) => ({
          id: m.id,
          name: typeof m.name === 'string' ? m.name : m.id,
          tag: typeof m.tag === 'string' ? m.tag : String(m.name || m.id).toUpperCase(),
          rung: Math.max(1, Math.floor(Number(m.rung) || 0)),
          at: Number.isFinite(Number(m.at)) ? Number(m.at) : 0,
          throughputU: Math.max(0, Math.floor(Number(m.throughputU) || 0)),
          source: typeof m.source === 'string' ? m.source : 'market_sell',
          receiptId: typeof m.receiptId === 'string' ? m.receiptId : `station-growth:${stationId}:${m.id}`,
        }))
        : [];
      // The rung is the count of modules actually gained; the ladder can only add rungs later.
      const rung = Math.min(ladder.length, modules.length);
      modules.length = rung;
      out[stationId] = {
        schema: STATION_GROWTH_SCHEMA,
        stationId,
        sectorId: (typeof rec.sectorId === 'string' && rec.sectorId) || (def && def.sectorId) || null,
        factionId: (typeof rec.factionId === 'string' && rec.factionId) || (def && def.factionId) || null,
        name: (typeof rec.name === 'string' && rec.name) || (def && def.name) || stationId,
        type,
        throughputU,
        rung,
        modules,
        sources: {
          market_sell: Math.max(0, Math.floor(Number(rec.sources && rec.sources.market_sell) || 0)),
          relay_convoy: Math.max(0, Math.floor(Number(rec.sources && rec.sources.relay_convoy) || 0)),
        },
        firstSupplyAt: Number.isFinite(Number(rec.firstSupplyAt)) ? Number(rec.firstSupplyAt) : 0,
        lastSupplyAt: Number.isFinite(Number(rec.lastSupplyAt)) ? Number(rec.lastSupplyAt) : 0,
      };
      any = true;
    }
    return any ? out : null;
  },

  // ------------------------------------------------------------------------------------------
  // PQ-170.01 — DEPOT DEPENDENCY. A stocked Trade Relay is a depot Concord's patrols run on.
  // ------------------------------------------------------------------------------------------

  _freshDepotSupport() {
    return {
      supported: false,
      since: 0,
      stockedAt: 0,
      dryAt: 0,
      lapsedAt: 0,
      lapseReason: null,
      rotations: 0,
      completedRotations: 0,
      patrol: { encounterId: null, requestedAt: 0, nextAt: 0, lastDenied: null, announced: false },
    };
  },

  _depotStocked(body) {
    const spec = body && body.spec;
    if (!spec || spec.id !== 'spec_relay' || spec.status !== 'active') return false;
    if (sumStore(spec.store.input) > 0) return true;
    return !!(spec.convoy && spec.convoy.qty > 0);
  },

  _tickDepotSupport(body, state) {
    const spec = body && body.spec;
    const isRelay = !!spec && spec.id === 'spec_relay';
    if (!isRelay) {
      if (body && body.depotSupport && body.depotSupport.supported) this._lapseDepotSupport(body, 'decommissioned');
      return;
    }
    const now = Number(state.simTime) || 0;
    const ds = body.depotSupport || (body.depotSupport = this._freshDepotSupport());
    if (this._depotStocked(body)) {
      ds.stockedAt = now;
      ds.dryAt = 0;
      if (!ds.supported) this._beginDepotSupport(body, ds, now);
    } else if (ds.supported) {
      if (spec.status !== 'active') {
        this._lapseDepotSupport(body, spec.status === 'raided' ? 'raided' : 'cold');
      } else {
        if (!ds.dryAt) ds.dryAt = now;
        if (now - ds.dryAt >= DEPOT_SUPPORT_GRACE_S) this._lapseDepotSupport(body, 'withdrawn');
      }
    }
    if (ds.supported) this._maintainDepotPatrol(body, ds, state, now);
  },

  _beginDepotSupport(body, ds, now) {
    ds.supported = true;
    ds.since = now;
    ds.lapsedAt = 0;
    ds.lapseReason = null;
    ds.patrol.nextAt = now;
    ds.patrol.lastDenied = null;
    ds.patrol.announced = false;
    this._receipt(body, 'depot_supported', 'Depot stocked — Concord patrol rotation requested for the lane');
    this.bus.emit('claim:depotSupport', {
      bodyId: body.id, sectorId: body.sectorId, supported: true, reason: 'stocked',
      factionId: DEPOT_PATROL_FACTION_ID,
    });
  },

  _lapseDepotSupport(body, reason) {
    const ds = body && body.depotSupport;
    if (!ds || !ds.supported) return false;
    const now = this.state.simTime || 0;
    ds.supported = false;   // set before the abort so the resolved handler never reschedules
    ds.lapsedAt = now;
    ds.lapseReason = reason;
    ds.dryAt = 0;
    ds.patrol.nextAt = 0;
    const encounterId = ds.patrol.encounterId;
    const liveMap = this.state.encounterDirector && this.state.encounterDirector.live;
    const live = liveMap && encounterId ? liveMap[encounterId] : null;
    const director = this._encounterDirector();
    if (live && director && typeof director.abort === 'function') {
      director.abort(live, 'depot_support_lapsed');
    }
    ds.patrol.encounterId = null;
    const line = depotPatrolLine(reason, { depot: body.name });
    if (body.spec) this._receipt(body, 'depot_lapsed', line, { reason });
    this.bus.emit('claim:depotSupport', {
      bodyId: body.id, sectorId: body.sectorId, supported: false, reason,
      factionId: DEPOT_PATROL_FACTION_ID, encounterId,
    });
    if (body.sectorId === (this.state.world && this.state.world.currentSectorId)) {
      this.bus.emit('toast', { text: line, kind: 'warn', ttl: 5 });
    }
    return true;
  },

  // Keep one lawful patrol_beat rotation live on the depot lane while support holds. The director
  // owns the set piece (spawn budget, doctrine, resolution); claims only asks, on a fixed cadence
  // off simTime, and treats `reused` as "still live" — so a post-load wipe or a spawn-cap denial
  // self-heals without reading director state.
  _maintainDepotPatrol(body, ds, state, now) {
    const patrol = ds.patrol;
    if (now < (patrol.nextAt || 0)) return false;
    patrol.nextAt = now + DEPOT_PATROL_RETRY_S;
    if (!state.world || state.world.currentSectorId !== body.sectorId) return false;
    const director = this._encounterDirector();
    if (!director || typeof director.requestAuthoredEncounter !== 'function') {
      patrol.lastDenied = 'no_director';
      return false;
    }
    const stationId = this._relayDestination(body);
    const station = this._stationEntity(stationId);
    const anchor = station && station.pos
      ? {
        x: body.x + (station.pos.x - body.x) * DEPOT_PATROL_ANCHOR_FRAC,
        z: body.z + (station.pos.z - body.z) * DEPOT_PATROL_ANCHOR_FRAC,
      }
      : { x: body.x + 200, z: body.z };
    if (!this._playerCanSeeLane(anchor, state)) {
      patrol.lastDenied = 'player_far';
      return false;
    }
    const rotation = patrol.encounterId ? ds.rotations : ds.rotations + 1;
    const encounterId = patrol.encounterId || `${DEPOT_PATROL_ID_PREFIX}${body.id}:${rotation}`;
    const result = director.requestAuthoredEncounter({
      shapeId: DEPOT_PATROL_SHAPE_ID,
      encounterId,
      sectorId: body.sectorId,
      anchor,
      zoneId: `depot-lane:${body.id}`,
      zoneName: `${body.name} depot lane`,
      zoneType: 'patrol_corridor',
      zoneRadius: DEPOT_PATROL_ZONE_RADIUS_WU,
      force: true,
      data: { claimDepotId: body.id, depotPatrol: true, rotation, stationId: stationId || null },
    });
    if (!result || result.ok !== true) {
      patrol.lastDenied = (result && result.reason) || 'denied';
      return false;
    }
    patrol.lastDenied = null;
    if (result.reused === true) return true;
    // A new rotation was actually posted.
    ds.rotations = rotation;
    patrol.encounterId = encounterId;
    patrol.requestedAt = now;
    this.bus.emit('claim:depotPatrolRotation', {
      bodyId: body.id, sectorId: body.sectorId, encounterId, rotation,
      factionId: DEPOT_PATROL_FACTION_ID, anchor, stationId: stationId || null,
    });
    // Announce once per support window; reliefs every couple of minutes stay quiet.
    if (!patrol.announced) {
      patrol.announced = true;
      const line = depotPatrolLine('posted', { depot: body.name });
      this._receipt(body, 'depot_patrol_posted', line, {
        encounterId, rotation, factionId: DEPOT_PATROL_FACTION_ID,
      });
      this.bus.emit('toast', { text: line, kind: 'good', ttl: 5 });
    }
    return true;
  },

  _playerCanSeeLane(anchor, state) {
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    if (!player || player.alive === false || !player.pos || !anchor) return false;
    let range = DEPOT_PATROL_PRESENCE_RANGE_WU;
    try {
      const radii = farActorTableRadius(state);
      if (radii && Number.isFinite(radii.enter) && radii.enter > 0) range = Math.min(range, radii.enter);
    } catch (_) { /* headless harness without activity runtime: keep the authored cap */ }
    const dx = player.pos.x - anchor.x;
    const dz = player.pos.z - anchor.z;
    return dx * dx + dz * dz <= range * range;
  },

  _onDepotPatrolResolved(payload) {
    const id = String((payload && payload.encounterId) || '');
    if (!id.startsWith(DEPOT_PATROL_ID_PREFIX)) return false;
    const bodyId = id.slice(DEPOT_PATROL_ID_PREFIX.length).split(':')[0];
    const body = this._body(bodyId);
    const ds = body && body.depotSupport;
    if (!ds || ds.patrol.encounterId !== id) return false;
    const now = this.state.simTime || 0;
    const heldS = now - (Number(ds.patrol.requestedAt) || 0);
    ds.patrol.encounterId = null;
    const aborted = String(payload.outcome || '').startsWith('aborted:');
    if (!aborted && heldS >= DEPOT_PATROL_CREDIT_FLOOR_S) {
      ds.completedRotations += 1;
      this.bus.emit('claim:depotPatrolCompleted', {
        bodyId: body.id, sectorId: body.sectorId, encounterId: id, rotation: ds.rotations,
        heldS, outcome: payload.outcome || 'completed', factionId: DEPOT_PATROL_FACTION_ID,
      });
    }
    if (ds.supported) {
      ds.patrol.nextAt = now + (aborted ? DEPOT_PATROL_RETRY_S : DEPOT_PATROL_ROTATION_GAP_S);
    }
    return true;
  },

  _depotSupportReadout(body) {
    const ds = body && body.depotSupport;
    if (!ds) return null;
    const t = this.state.simTime || 0;
    return {
      supported: ds.supported === true,
      since: ds.since,
      stocked: this._depotStocked(body),
      dryForS: ds.dryAt ? Math.max(0, t - ds.dryAt) : 0,
      graceS: DEPOT_SUPPORT_GRACE_S,
      lapsedAt: ds.lapsedAt,
      lapseReason: ds.lapseReason,
      patrolFactionId: DEPOT_PATROL_FACTION_ID,
      patrolLive: !!ds.patrol.encounterId,
      patrolEncounterId: ds.patrol.encounterId,
      rotations: ds.rotations,
      completedRotations: ds.completedRotations,
      lastDenied: ds.patrol.lastDenied,
    };
  },

  _normalizeDepotSupport(raw, body) {
    if (!raw || typeof raw !== 'object' || !body || !body.spec || body.spec.id !== 'spec_relay') return null;
    const fresh = this._freshDepotSupport();
    const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    fresh.supported = raw.supported === true;
    fresh.since = num(raw.since);
    fresh.stockedAt = num(raw.stockedAt);
    fresh.dryAt = num(raw.dryAt);
    fresh.lapsedAt = num(raw.lapsedAt);
    fresh.lapseReason = typeof raw.lapseReason === 'string' ? raw.lapseReason : null;
    fresh.rotations = Math.max(0, Math.floor(num(raw.rotations)));
    fresh.completedRotations = Math.max(0, Math.floor(num(raw.completedRotations)));
    // Live encounters never survive a load (the director rebuilds fresh); the next maintain pass
    // re-posts the rotation immediately when the depot is still stocked.
    fresh.patrol.encounterId = null;
    fresh.patrol.requestedAt = num(raw.patrol && raw.patrol.requestedAt);
    fresh.patrol.nextAt = 0;
    fresh.patrol.lastDenied = null;
    fresh.patrol.announced = !!(raw.patrol && raw.patrol.announced === true);
    return fresh;
  },

  /** Public read: bodies whose depot currently provisions a Concord rotation (optionally per sector). */
  supportedDepots(sectorId = null) {
    const out = [];
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      if (!body || !body.depotSupport || body.depotSupport.supported !== true) continue;
      if (sectorId && body.sectorId !== sectorId) continue;
      out.push(body);
    }
    return out;
  },

  _encounterDirector() {
    const registry = this.ctx && this.ctx.registry;
    return registry && typeof registry.get === 'function' ? registry.get('encounterDirector') : null;
  },

  // Public read API for the Base screen.
  list() { return (this.state.claims && this.state.claims.bodies) || []; },

  // Serialization (save system delegates via serialize/deserialize). state.claims is plain JSON.
  // Bodies (including spec state) deep-copy so the snapshot can't alias live buffers. The
  // module-level _nextClaimId counter is NOT serialized — deserialize re-derives it from the
  // highest restored claim id, which is robust to saves made before serialization existed.
  serialize() {
    const claims = this.state.claims || { bodies: [] };
    const out = {
      specVersion: 1,
      bodies: (claims.bodies || []).map((b) => JSON.parse(JSON.stringify(b))),
    };
    if (claims.meta) out.meta = { ...claims.meta };
    if (claims.legacyMigration) out.legacyMigration = { ...claims.legacyMigration };
    if (claims.stationGrowth) out.stationGrowth = JSON.parse(JSON.stringify(claims.stationGrowth));
    return out;
  },

  deserialize(data) {
    if (!data || typeof data !== 'object') {
      this.state.claims = { bodies: [], specVersion: 1 };
      _nextClaimId = 1;
      return;
    }
    const bodies = Array.isArray(data.bodies) ? data.bodies : [];
    for (const b of bodies) {
      // versioned default: bodies from older saves have no spec — they stay unspecialized
      // Presence in the claims store is the ownership proof. Older saves predate the explicit bit.
      b.owned = true;
      b.spec = 'spec' in b ? this._normalizeSpec(b.spec) : null;
      const infrastructure = this._normalizeTravelInfrastructure(b.infrastructure, b);
      if (infrastructure) b.infrastructure = infrastructure;
      else delete b.infrastructure;
      const depotSupport = this._normalizeDepotSupport(b.depotSupport, b);
      if (depotSupport) b.depotSupport = depotSupport;
      else delete b.depotSupport;
      if (b.spec && b.spec.defense && b.spec.defense.phase === 'engaged') {
        this._resumeDefenseIds.add(b.spec.defense.id);
      }
    }
    this.state.claims = { bodies, specVersion: 1 };
    if (data.meta && typeof data.meta === 'object') this.state.claims.meta = { ...data.meta };
    if (data.legacyMigration && typeof data.legacyMigration === 'object') {
      this.state.claims.legacyMigration = { ...data.legacyMigration };
    }
    const stationGrowth = this._normalizeStationGrowth(data.stationGrowth);
    if (stationGrowth) this.state.claims.stationGrowth = stationGrowth;
    // Re-derive _nextClaimId past any restored claim id so the next claim() can't collide. (We
    // don't trust a serialized counter even if one is present — deriving from the bodies is the
    // source of truth and survives legacy/partial saves.)
    _nextClaimId = 1;
    for (const b of this.state.claims.bodies) {
      const m = /^claim_(\d+)$/.exec(b && b.id || '');
      if (m) _nextClaimId = Math.max(_nextClaimId, (parseInt(m[1], 10) || 0) + 1);
    }
    // Saves older than specVersion 1 may still carry abstract automation outposts — the F6 path.
    if (data.specVersion == null) this._migrateLegacyOutposts();
    this._applyAllPoiLabels();
    this._stampAllStationGrowth();
  },

  newGame() {
    this.state.claims = { bodies: [], specVersion: 1 };
    _nextClaimId = 1;
  },
};
