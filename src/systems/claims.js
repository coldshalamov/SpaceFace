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
//   - RELAY dispatches a PHYSICAL CARRIER to the linked station and sells at the destination's REAL
//     market price less the fee (the proven outpost autosell −20%), pressing that market honestly.
//     No economy peer / no market price → freight is held, never converted to fabricated profit.
//
// Carrier model (spec.convoy — schema claim_carrier_v1, see _dispatchCarrier):
//   ONE persistent record per relay shipment carries the whole life of that freight: its MANIFEST,
//   CUSTODY (site → carrier → delivered/site/lost), route + time-derived PROGRESS, the live entity
//   it is BOUND to while the player shares its sector, its telegraphed INTERCEPT state, and its
//   single SETTLEMENT. The record is the authority and the ship is its body: progress is a pure
//   function of (simTime, departedAt, transitS, holdS), so the run advances identically off-screen
//   and materialized. Materializing binds the existing record to one hull at the position the
//   record already holds — cargo never duplicates (custody left the store at dispatch and lives in
//   the manifest until exactly one settlement) and never teleports (the hull is placed at the
//   record's own last position, and de-materializing keeps it). Every terminal path — arrival,
//   intercept, a destroyed hull, an abandoned engagement — funnels through _settleCarrier, which
//   refuses a second settlement for the same record.
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
//   (A carrier already in flight is the one thing that keeps advancing while the player is in
//   another sector. It still carries the legacy relay's risk, but that risk can only ever SCHEDULE
//   a telegraphed cut off-screen — it can never take the freight there. An uncontested strike
//   holds the run in place with its manifest whole until the player is present for a physical
//   outcome, so no unseen die ever deletes player property.)
//
// Single-writer: claims owns only state.claims. Credits route through economy intents, cargo
// through the cargo helpers; claims never writes credits/cargo caches/reputation/heat directly.
// Determinism: all rolls draw from a dedicated seeded stream (state.claims.meta.rngSeed, created
// lazily on first commission so unspecialized saves and the 47a golden keep their exact shape).
// PERSISTENCE: serialize()/deserialize() capture state.claims (bodies + spec state + meta +
// migration receipt) with a specVersion stamp; older saves default bodies to spec:null and run the
// F6-owned legacy-outpost migration exactly once (see _migrateLegacyOutposts). A carrier record
// rides in spec.convoy and is healed + RESUMED by _normalizeCarrier on load (a pre-carrier convoy
// upgrades in place; the entity binding is dropped and re-established from the record's position).
import {
  BODY_MODULES, BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE, CLAIM_COST,
  BODY_SPECIALIZATIONS, BODY_SPECIALIZATION_BY_ID,
} from '../data/claimableBodies.js';
import { techDisplayName } from '../data/tech.js';
import { addCargo, removeCargo } from './cargo.js';
import { makeShipEntitySpec } from './ships.js';
import { drawSeeded, hash32 } from '../core/rng.js';
import { SECTORS, dangerIndex } from '../data/sectors.js';
import { OUTPOSTS } from '../data/automation.js';
import { outpostOutputGoodId } from './automation.js';

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
// ── Physical carrier contract ─────────────────────────────────────────────────────────────────
export const CLAIM_CARRIER_SCHEMA = 'claim_carrier_v1';
export const CARRIER_HULL_ID = 'ship_mule';        // the freighter hull traffic already flies
export const CARRIER_TEAM = 2;                     // neutral civilian, same as ambient freight
export const CARRIER_INTERCEPT_PROGRESS = 0.35;    // where along the run a cut can happen
export const CARRIER_INTERCEPT_WARNING_S = 45;     // telegraph window before the strike lands
export const CARRIER_INTERVENTION_R = 900;         // player must be this close to contest the cut
export const CARRIER_ENGAGE_TIMEOUT_S = 240;       // an engaged cut the player walks away from
export const CARRIER_PARTIAL_LOSS_FRAC = 0.5;      // a half-fought cut bleeds, it does not settle
export const CARRIER_RESYNC_WU = 25;               // hull drift the record tolerates before a snap
export const CARRIER_ATTACKER_RANGE = Object.freeze([2, 3]);
const MAX_RECEIPTS = 8;                    // per-body receipt ring (the ledger's memory)
const SLING_BODY_CLEARANCE_WU = 160;
const SLING_STATION_CLEARANCE_WU = 180;
const SLING_MIN_ROUTE_WU = 520;
const SLING_LATERAL_OFFSETS_WU = Object.freeze([0, 160, -160, 280, -280]);
const CLAIM_DAY_SECONDS = 600;

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

/** Units aboard a carrier — the single truth for "how much freight is in custody". */
function manifestTotal(manifest) {
  let total = 0;
  for (const line of Array.isArray(manifest) ? manifest : []) {
    total += Math.max(0, Math.floor(Number(line && line.qty) || 0));
  }
  return total;
}

/** Sanitize a persisted/dispatched manifest: whole units, no empty lines, stable order. */
function normalizeManifest(manifest) {
  const out = [];
  for (const line of Array.isArray(manifest) ? manifest : []) {
    const goodId = line && typeof line.goodId === 'string' ? line.goodId : null;
    const qty = Math.max(0, Math.floor(Number(line && line.qty) || 0));
    if (!goodId || qty <= 0) continue;
    const existing = out.find((entry) => entry.goodId === goodId);
    if (existing) existing.qty += qty;
    else out.push({ goodId, qty });
  }
  return out;
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
    this.helpers = ctx.helpers || null;
    // state.claims: { bodies: [{ id, sectorId, poiId, name, size, slots, modules:[modId|null],
    //   linkedStationId, x, z, spec }], specVersion, meta?, legacyMigration? }
    if (!this.state.claims) this.state.claims = { bodies: [] };
    // World respawns POI entities on sector entry — re-stamp specialization identity on them.
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('sector:enter', () => this._applyAllPoiLabels());
      this.bus.on('encounter:resolved', (payload) => this._onDefenseEncounterResolved(payload || {}));
      this.bus.on('claim:defenseIgnore', (payload) => {
        const body = this._body(payload && payload.bodyId);
        if (body && body.spec && body.spec.defense) this._settleDefense(body, 'ignored');
      });
      // A carrier is a real hull while the player shares its sector. Leaving the sector releases
      // the body without touching the record; a killed hull is a REAL loss of the freight aboard.
      this.bus.on('sector:exit', () => this._dematerializeAllCarriers('sector_exit'));
      this.bus.on('entity:killed', (payload) => this._onCarrierEntityKilled(payload || {}));
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
        ? {
          ...spec.convoy,
          etaS: Math.max(0, spec.convoy.arriveAt - t),
          progress: this._carrierProgress(spec.convoy, t),
          manifest: (spec.convoy.manifest || []).map((line) => ({ ...line })),
          interceptPhase: spec.convoy.intercept ? spec.convoy.intercept.phase : 'clear',
          interceptInS: spec.convoy.intercept && spec.convoy.intercept.phase === 'telegraphed'
            ? Math.max(0, spec.convoy.intercept.strikeAt - t)
            : 0,
        }
        : null,
      lastCarrierSettlement: spec.lastCarrierSettlement ? { ...spec.lastCarrierSettlement } : null,
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
    // A carrier already away is a physical object with its own custody: it keeps flying (and can
    // still be cut, bound to a hull, or settled) while its home site is cold, frozen, or raided.
    if (spec.convoy) this._tickCarrier(body, def, state, t);
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

  // Scheduled dispatch — only while staffed, only with a real destination + market truth. The
  // carrier already away is advanced by _tickCarrier (from _tickSpec), which runs even when this
  // site is cold or frozen.
  _tickSpecRelay(body, def, state) {
    const spec = body.spec;
    const t = state.simTime || 0;
    if (spec.convoy || spec.status !== 'active' || t < (spec.nextDispatchAt || 0)) return;
    spec.nextDispatchAt = t + def.dispatchEveryS;
    const dest = this._relayDestination(body);
    const economy = this._economyPeer();
    if (!dest || !economy) return;
    let bestGood = null, bestQty = 0;
    for (const id in spec.store.input) {
      const q = spec.store.input[id] || 0;
      if (q > bestQty) { bestQty = q; bestGood = id; }
    }
    if (!bestGood || bestQty < def.minLoadU) return;
    const qty = Math.min(def.convoyLoadU, bestQty);
    this._dispatchCarrier(body, def, t, dest, [{ goodId: bestGood, qty }]);
  },

  // ------------------------------------------------------------------------------------------
  // PHYSICAL CARRIER — one durable record per shipment (schema claim_carrier_v1).
  //
  // Custody is a chain with no forks: the units leave spec.store.input HERE and exist only in
  // carrier.manifest until exactly one settlement puts them somewhere real (a market sale, the
  // site store, or the loss ledger). Nothing else may add or remove freight from a live manifest
  // except _bleedCarrier (a fought cut) — and that mutation is recorded on the record itself.
  // ------------------------------------------------------------------------------------------
  _dispatchCarrier(body, def, t, destStationId, manifest) {
    const spec = body.spec;
    const lines = normalizeManifest(manifest);
    if (!spec || spec.convoy || !lines.length) return null;
    // custody transfer OUT of the site store — the only place freight enters a manifest
    for (const line of lines) {
      const have = Math.max(0, Math.floor(spec.store.input[line.goodId] || 0));
      line.qty = Math.min(line.qty, have);
      if (line.qty <= 0) continue;
      spec.store.input[line.goodId] = have - line.qty;
      if (spec.store.input[line.goodId] <= 0) delete spec.store.input[line.goodId];
    }
    const loaded = normalizeManifest(lines);
    if (!loaded.length) return null;
    const meta = this._ensureMeta();
    const seq = Math.max(1, meta.nextCarrierId | 0);
    meta.nextCarrierId = seq + 1;
    const transitS = Math.max(1, Number(def.transitS) || 1);
    const carrier = {
      schema: CLAIM_CARRIER_SCHEMA,
      id: `${body.id}:carrier:${seq}`,
      bodyId: body.id,
      sectorId: body.sectorId || null,
      name: `${body.name} freight run ${seq}`,
      custody: 'carrier',
      manifest: loaded,
      // legacy mirrors — every existing reader (ledger, Base screen, receipts) speaks these two
      goodId: loaded[0].goodId,
      qty: manifestTotal(loaded),
      destStationId,
      departedAt: t,
      transitS,
      arriveAt: t + transitS,
      holdS: 0,
      holdSince: 0,
      progress: 0,
      route: { from: { x: Number(body.x) || 0, z: Number(body.z) || 0 }, to: null },
      pos: { x: Number(body.x) || 0, z: Number(body.z) || 0 },
      entityId: null,
      materialized: false,
      intercept: this._freshIntercept(),
      settlement: null,
    };
    spec.convoy = carrier;
    this._syncCarrierRoute(body, carrier);
    this._receipt(body, 'convoy_dispatched', 'Convoy away — ' + carrier.qty + 'u to ' + (this._stationName(destStationId) || destStationId),
      { carrierId: carrier.id, goodId: carrier.goodId, qty: carrier.qty, destStationId });
    this.bus.emit('claim:carrierDispatched', {
      bodyId: body.id,
      carrierId: carrier.id,
      sectorId: carrier.sectorId,
      destStationId,
      manifest: carrier.manifest.map((line) => ({ ...line })),
      qty: carrier.qty,
      arriveAt: carrier.arriveAt,
    });
    return carrier;
  },

  _freshIntercept() {
    return {
      phase: 'clear',        // clear → telegraphed → engaged → resolved
      rolled: false,
      warnedAt: 0,
      strikeAt: 0,
      deadlineAt: 0,
      requested: false,
      deferredAt: 0,         // set when the strike came due with nobody there to see it
      encounterId: null,
      attackerFactionId: null,
      attackerName: null,
      attackerCount: 0,
    };
  },

  /**
   * Time-derived progress: a pure function of the record. This is exactly why the same shipment
   * advances identically whether or not anyone is watching — there is no per-frame integration to
   * diverge, and a save/load in the middle changes nothing.
   */
  _carrierProgress(carrier, t) {
    if (!carrier) return 0;
    const transitS = Math.max(1, Number(carrier.transitS) || 1);
    const held = Math.max(0, Number(carrier.holdS) || 0)
      + (carrier.holdSince ? Math.max(0, t - carrier.holdSince) : 0);
    const flown = t - (Number(carrier.departedAt) || 0) - held;
    return Math.max(0, Math.min(1, flown / transitS));
  },

  _tickCarrier(body, def, state, t) {
    const carrier = body.spec && body.spec.convoy;
    if (!carrier || carrier.settlement) return;
    if (!carrier.intercept) carrier.intercept = this._freshIntercept();
    carrier.progress = this._carrierProgress(carrier, t);
    this._syncCarrierRoute(body, carrier);
    this._advanceCarrierPos(carrier);
    this._tickCarrierIntercept(body, carrier, state, t);
    if (!body.spec.convoy || carrier.settlement) return;   // the cut settled it
    this._syncCarrierEmbodiment(body, carrier, state, t);
    if (carrier.intercept.phase === 'telegraphed' || carrier.intercept.phase === 'engaged') return;
    if (t >= carrier.arriveAt) this._settleCarrier(body, 'arrived', { def });
  },

  /** Resolve the destination end of the route once a real station endpoint is observable. */
  _syncCarrierRoute(body, carrier) {
    if (!carrier || !carrier.route) return;
    if (carrier.route.to) return;
    const station = this._stationEntity(carrier.destStationId);
    if (!station || !station.pos) return;                  // stays abstract until the pier is real
    if (!Number.isFinite(station.pos.x) || !Number.isFinite(station.pos.z)) return;
    carrier.route.to = { x: station.pos.x, z: station.pos.z };
  },

  /** The record's own position. Off-screen this is bookkeeping; materialized it drives the hull. */
  _advanceCarrierPos(carrier) {
    const route = carrier.route;
    if (!route || !route.from || !route.to) return;
    const p = Math.max(0, Math.min(1, Number(carrier.progress) || 0));
    carrier.pos = {
      x: route.from.x + (route.to.x - route.from.x) * p,
      z: route.from.z + (route.to.z - route.from.z) * p,
    };
  },

  // ── Telegraphed cut ───────────────────────────────────────────────────────────────────────
  // The old model rolled an invisible die at arrival. The same probability now buys a WARNING
  // with a window: the carrier holds at the cut point and the player can reach it and fight.
  // The die SCHEDULES a threat; it never resolves one. A strike that comes due with nobody at
  // the freight cannot delete it — the record simply HOLDS, in custody, manifest intact, until a
  // physical outcome exists in-sector. Only three things can ever settle a carrier 'lost': the
  // hull it is bound to is destroyed, an encounter that actually began returns a loss/abandon/
  // timeout verdict, or the manifest is physically stripped to zero by _bleedCarrier.
  _tickCarrierIntercept(body, carrier, state, t) {
    const cut = carrier.intercept;
    if (!cut || cut.phase === 'resolved') return;
    if (cut.phase === 'clear') {
      if (cut.rolled || carrier.progress < CARRIER_INTERCEPT_PROGRESS) return;
      cut.rolled = true;
      const sector = SECTOR_BY_ID.get(body.sectorId);
      const lawful = !sector || sector.security >= RAID_SECURITY_FLOOR;
      const pCut = lawful ? 0 : Math.min(RELAY_LOSS_BASE + dangerIndex(sector) * RELAY_LOSS_DANGER, RELAY_LOSS_CAP);
      if (!(pCut > 0) || this._rng() >= pCut) return;
      const [minAttackers, maxAttackers] = CARRIER_ATTACKER_RANGE;
      cut.phase = 'telegraphed';
      cut.warnedAt = t;
      cut.strikeAt = t + CARRIER_INTERCEPT_WARNING_S;
      cut.attackerFactionId = 'faction_reach';
      cut.attackerName = 'Reach cutters';
      cut.attackerCount = minAttackers + Math.floor(this._rng() * (maxAttackers - minAttackers + 1));
      carrier.holdSince = t;                                // the run stalls while it is threatened
      this._receipt(body, 'carrier_threatened', `${cut.attackerName} moving on the ${carrier.qty}u run — ${CARRIER_INTERCEPT_WARNING_S}s to reach it`,
        { carrierId: carrier.id, attackerCount: cut.attackerCount, strikeAt: cut.strikeAt });
      this.bus.emit('claim:carrierThreat', {
        bodyId: body.id,
        carrierId: carrier.id,
        sectorId: carrier.sectorId,
        pos: carrier.pos ? { ...carrier.pos } : null,
        destStationId: carrier.destStationId,
        qty: carrier.qty,
        attackerFactionId: cut.attackerFactionId,
        attackerName: cut.attackerName,
        attackerCount: cut.attackerCount,
        strikeAt: cut.strikeAt,
        countdownS: CARRIER_INTERCEPT_WARNING_S,
      });
      this.bus.emit('toast', {
        text: `FREIGHT ALERT — ${cut.attackerName} closing on ${body.name}'s ${carrier.qty}u run. ${CARRIER_INTERCEPT_WARNING_S}s.`,
        kind: 'warn', ttl: 6,
      });
      this.bus.emit('audio:cue', { id: 'warning' });
      return;
    }
    if (cut.phase === 'telegraphed') {
      if (t < cut.strikeAt) return;
      // The player standing with the carrier turns the cut into a real fight; otherwise it lands.
      if (this._playerNearCarrier(carrier, state)) {
        if (!cut.requested && this._requestCarrierEncounter(body, carrier, cut, t)) return;
        if (cut.phase === 'engaged') return;
        // no director budget for a set piece — presence alone still contests the cut
        this._releaseCarrierHold(carrier, t);
        cut.phase = 'resolved';
        this._receipt(body, 'carrier_escorted', 'Escort held the line — freight running again',
          { carrierId: carrier.id, attackerName: cut.attackerName });
        this.bus.emit('claim:carrierIntercept', {
          bodyId: body.id, carrierId: carrier.id, outcome: 'escorted', lostU: 0,
        });
        this.bus.emit('toast', { text: `Cutters broke off ${body.name}'s freight run`, kind: 'good', ttl: 4 });
        return;
      }
      // Nobody is at the freight. The threat does NOT become a loss — the run stalls where it is
      // and keeps its whole manifest until the player comes and something physical happens to it.
      if (!cut.deferredAt) {
        cut.deferredAt = t;
        if (!carrier.holdSince) carrier.holdSince = t;      // stay stalled, never drift into arrival
        this._receipt(body, 'carrier_held', `${cut.attackerName} shadowing the ${carrier.qty}u run — freight holding until someone reaches it`,
          { carrierId: carrier.id, attackerCount: cut.attackerCount, heldAt: t });
        this.bus.emit('claim:carrierHeld', {
          bodyId: body.id,
          carrierId: carrier.id,
          sectorId: carrier.sectorId,
          pos: carrier.pos ? { ...carrier.pos } : null,
          destStationId: carrier.destStationId,
          qty: carrier.qty,
          attackerFactionId: cut.attackerFactionId,
          attackerName: cut.attackerName,
          attackerCount: cut.attackerCount,
          heldAt: t,
        });
      }
      return;
    }
    if (cut.phase === 'engaged') {
      // Walking away from a fight you started is an answer. So is letting it run forever.
      const abandoned = !state.world || state.world.currentSectorId !== body.sectorId;
      if (abandoned || t >= (cut.deadlineAt || 0)) {
        this._settleCarrier(body, 'lost', {
          cause: abandoned ? 'abandoned' : 'overrun', attackerName: cut.attackerName,
        });
      }
    }
  },

  _requestCarrierEncounter(body, carrier, cut, t) {
    const registry = this.ctx && this.ctx.registry;
    const director = registry && typeof registry.get === 'function' ? registry.get('encounterDirector') : null;
    if (!director || typeof director.requestClaimDefense !== 'function' || !carrier.pos) return false;
    const encounterId = `claim-carrier:${carrier.id}`;
    const result = director.requestClaimDefense({
      encounterId,
      claimId: body.id,
      defenseId: carrier.id,
      sectorId: body.sectorId,
      anchor: { x: carrier.pos.x, z: carrier.pos.z },
      attackerFactionId: cut.attackerFactionId,
      attackerName: cut.attackerName,
      attackerCount: cut.attackerCount,
      motive: `A loaded ${body.name} freight run drew a Reach cutting crew onto the lane.`,
      deadlineAt: cut.strikeAt,
    });
    cut.requested = true;
    if (!result || result.ok === false) return false;
    cut.phase = 'engaged';
    cut.encounterId = result.encounterId || encounterId;
    cut.deadlineAt = t + CARRIER_ENGAGE_TIMEOUT_S;
    this._receipt(body, 'carrier_engaged', `${cut.attackerName} on the freight run — ${cut.attackerCount} ships`,
      { carrierId: carrier.id, encounterId: cut.encounterId });
    this.bus.emit('claim:carrierEngaged', {
      bodyId: body.id,
      carrierId: carrier.id,
      encounterId: cut.encounterId,
      sectorId: body.sectorId,
      pos: { ...carrier.pos },
      attackerCount: cut.attackerCount,
    });
    return true;
  },

  /** Encounter verdict for a cut. 'defended' frees the run; a mauled run bleeds and flies on. */
  _resolveCarrierEncounter(body, carrier, rawOutcome) {
    const cut = carrier.intercept;
    const t = this.state.simTime || 0;
    // Only a cut that is actually engaged has a verdict to receive. A duplicate/late resolution
    // for an already-resolved cut must not bleed the manifest a second time.
    if (!cut || cut.phase !== 'engaged') return false;
    if (String(rawOutcome || '').startsWith('aborted:')) {
      // the set piece never happened — fall back to the telegraph window, do not eat the freight
      cut.phase = 'telegraphed';
      cut.requested = false;
      cut.encounterId = null;
      cut.strikeAt = Math.max(cut.strikeAt || 0, t + 20);
      return true;
    }
    const outcome = ['defended', 'partial', 'retreated', 'timeout', 'destroyed', 'ignored'].includes(rawOutcome)
      ? rawOutcome : 'timeout';
    if (outcome === 'defended' || outcome === 'partial' || outcome === 'retreated') {
      const bleedFrac = outcome === 'defended' ? 0
        : (outcome === 'partial' ? CARRIER_PARTIAL_LOSS_FRAC * 0.5 : CARRIER_PARTIAL_LOSS_FRAC);
      const lostU = bleedFrac > 0 ? this._bleedCarrier(body, carrier, bleedFrac) : 0;
      this._releaseCarrierHold(carrier, t);
      cut.phase = 'resolved';
      if (!carrier.manifest.length) {
        this._settleCarrier(body, 'lost', { cause: 'stripped', attackerName: cut.attackerName });
        return true;
      }
      this._receipt(body, 'carrier_defended', lostU > 0
        ? `Cut fought off — ${lostU}u stripped, ${carrier.qty}u still running`
        : 'Cut fought off — freight intact and running', { carrierId: carrier.id, lostU, outcome });
      this.bus.emit('claim:carrierIntercept', { bodyId: body.id, carrierId: carrier.id, outcome, lostU });
      this.bus.emit('toast', {
        text: lostU > 0 ? `${body.name} freight run mauled — ${lostU}u lost, run continues`
          : `${body.name} freight run held — cutters driven off`,
        kind: lostU > 0 ? 'warn' : 'good', ttl: 5,
      });
      return true;
    }
    this._settleCarrier(body, 'lost', { cause: 'intercepted', attackerName: cut.attackerName, outcome });
    return true;
  },

  /** Freight physically stripped off a live manifest. Never a settlement — the run continues. */
  _bleedCarrier(body, carrier, frac) {
    let lostU = 0;
    for (const line of carrier.manifest) {
      const lost = Math.floor(line.qty * frac);
      if (lost <= 0) continue;
      line.qty -= lost;
      lostU += lost;
    }
    carrier.manifest = normalizeManifest(carrier.manifest);
    this._syncCarrierMirror(carrier);
    if (lostU > 0) body.spec.totals.lostU += lostU;
    return lostU;
  },

  _syncCarrierMirror(carrier) {
    carrier.qty = manifestTotal(carrier.manifest);
    carrier.goodId = carrier.manifest.length ? carrier.manifest[0].goodId : carrier.goodId;
  },

  _releaseCarrierHold(carrier, t) {
    if (carrier.holdSince) {
      carrier.holdS = Math.max(0, Number(carrier.holdS) || 0) + Math.max(0, t - carrier.holdSince);
      carrier.holdSince = 0;
    }
    carrier.arriveAt = (Number(carrier.departedAt) || 0) + Math.max(1, Number(carrier.transitS) || 1)
      + Math.max(0, Number(carrier.holdS) || 0);
  },

  // ── Materialization ───────────────────────────────────────────────────────────────────────
  // Binding, not spawning cargo: the hull is created at the position the record already holds and
  // carries no manifest of its own, so no other system can mint or duplicate this freight.
  _syncCarrierEmbodiment(body, carrier, state, t) {
    const inSector = !!state.world && state.world.currentSectorId === body.sectorId;
    const live = this._carrierEntity(carrier);
    if (!inSector || !carrier.route || !carrier.route.to || carrier.settlement) {
      if (live) this._dematerializeCarrier(carrier, 'offscreen');
      return;
    }
    if (!live) this._materializeCarrier(body, carrier, t);
    else this._driveCarrierEntity(carrier, live);
  },

  _carrierEntity(carrier) {
    if (!carrier || carrier.entityId == null) return null;
    const entity = this.state.entities && this.state.entities.get
      ? this.state.entities.get(carrier.entityId)
      : null;
    if (!entity || entity.alive === false) return null;
    // identity check — a recycled numeric id must never be mistaken for our carrier
    if (!entity.data || entity.data.claimCarrierId !== carrier.id) return null;
    return entity;
  },

  _materializeCarrier(body, carrier, t) {
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (typeof spawn !== 'function' || !carrier.pos) return null;
    const sector = SECTOR_BY_ID.get(body.sectorId);
    const heading = this._carrierHeading(carrier);
    const spec = makeShipEntitySpec(CARRIER_HULL_ID, {
      team: CARRIER_TEAM,
      factionId: (sector && sector.factionId) || 'faction_free',
      pos: { x: carrier.pos.x, z: carrier.pos.z },
      rot: heading,
      ai: null,                      // the RECORD flies this hull; no steering authority is added
    });
    const entity = spawn(spec);
    if (!entity) return null;
    const data = entity.data || (entity.data = {});
    data.claimCarrierId = carrier.id;
    data.claimId = body.id;
    data.name = carrier.name;
    data.trafficLabel = `${body.name} freight run`;
    // Display copy only. The real custody lives on the record — a hull that carried a live
    // manifest could be looted into existence twice.
    data.claimCarrierManifest = carrier.manifest.map((line) => ({ ...line }));
    data.claimCarrierDestStationId = carrier.destStationId;
    carrier.entityId = entity.id;
    carrier.materialized = true;
    carrier.materializedAt = t;
    this._driveCarrierEntity(carrier, entity);
    this.bus.emit('claim:carrierMaterialized', {
      bodyId: body.id, carrierId: carrier.id, entityId: entity.id, sectorId: body.sectorId,
      pos: { ...carrier.pos }, qty: carrier.qty,
    });
    return entity;
  },

  _carrierHeading(carrier) {
    const route = carrier.route;
    if (!route || !route.from || !route.to) return 0;
    return Math.atan2(route.to.z - route.from.z, route.to.x - route.from.x);
  },

  /**
   * The record steers; physics carries. Velocity comes from the route so the hull moves like a
   * ship (and reads correctly to trails, scanners and the camera), and position is only snapped
   * back when it has drifted off the record's own truth — the record, not the hull, is authority.
   */
  _driveCarrierEntity(carrier, entity) {
    if (!entity || !carrier.pos || !entity.pos) return;
    entity.rot = this._carrierHeading(carrier);
    if (!entity.vel) entity.vel = { x: 0, z: 0 };
    const holding = !!carrier.holdSince || carrier.progress >= 1;
    const route = carrier.route;
    if (holding || !route || !route.from || !route.to) {
      entity.vel.x = 0;
      entity.vel.z = 0;
    } else {
      const transitS = Math.max(1, Number(carrier.transitS) || 1);
      entity.vel.x = (route.to.x - route.from.x) / transitS;
      entity.vel.z = (route.to.z - route.from.z) / transitS;
    }
    const drift = Math.hypot(entity.pos.x - carrier.pos.x, entity.pos.z - carrier.pos.z);
    if (drift > CARRIER_RESYNC_WU) {
      entity.pos.x = carrier.pos.x;
      entity.pos.z = carrier.pos.z;
    }
  },

  _dematerializeCarrier(carrier, reason) {
    if (!carrier) return false;
    const entity = this._carrierEntity(carrier);
    // Release the binding BEFORE the hull goes away: a release must never be mistaken for a kill.
    carrier.entityId = null;
    carrier.materialized = false;
    if (entity) {
      const remove = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
      if (typeof remove === 'function') { try { remove(entity.id); } catch (_) { entity.alive = false; } }
      else entity.alive = false;
      this.bus.emit('claim:carrierDematerialized', { carrierId: carrier.id, entityId: entity.id, reason });
    }
    return true;
  },

  _dematerializeAllCarriers(reason) {
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      const carrier = body && body.spec && body.spec.convoy;
      if (carrier) this._dematerializeCarrier(carrier, reason);
    }
  },

  _onCarrierEntityKilled(payload) {
    if (!payload || payload.id == null) return;
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      const carrier = body && body.spec && body.spec.convoy;
      if (!carrier || carrier.entityId !== payload.id) continue;
      carrier.entityId = null;
      carrier.materialized = false;
      this._settleCarrier(body, 'lost', { cause: 'hull_destroyed' });
      return;
    }
  },

  _playerNearCarrier(carrier, state) {
    if (!carrier || !carrier.pos) return false;
    if (!state.world || state.world.currentSectorId !== carrier.sectorId) return false;
    const player = state.entities && state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return false;
    const dx = player.pos.x - carrier.pos.x;
    const dz = player.pos.z - carrier.pos.z;
    return dx * dx + dz * dz <= CARRIER_INTERVENTION_R * CARRIER_INTERVENTION_R;
  },

  // ── Settlement ────────────────────────────────────────────────────────────────────────────
  /**
   * The ONE place a manifest stops existing. Outcomes:
   *   'arrived' — sold at the destination's real price (or returned home when there is no market
   *               truth: this system never fabricates a price);
   *   'lost'    — intercepted, stripped, abandoned, or the hull was destroyed.
   * Re-entrant by construction (a hull can die inside the same tick an arrival settles), so the
   * guard is checked and armed BEFORE any credit/cargo/ledger effect runs.
   */
  _settleCarrier(body, outcome, detail = {}) {
    const spec = body && body.spec;
    const carrier = spec && spec.convoy;
    if (!carrier || carrier.settlement || carrier._settling) return false;
    carrier._settling = true;
    const t = this.state.simTime || 0;
    const def = detail.def || BODY_SPECIALIZATION_BY_ID.get(spec.id);
    const settlement = {
      id: `${carrier.id}:${outcome}`,
      carrierId: carrier.id,
      outcome,
      at: t,
      qty: carrier.qty,
      goodId: carrier.goodId,
      destStationId: carrier.destStationId,
      revenueCr: 0,
      returnedU: 0,
      lostU: 0,
      cause: detail.cause || null,
    };
    if (outcome === 'lost') {
      settlement.lostU = manifestTotal(carrier.manifest);
      spec.totals.lostU += settlement.lostU;
      this._receipt(body, 'convoy_lost', 'Convoy lost en route — ' + settlement.lostU + 'u gone',
        { carrierId: carrier.id, goodId: carrier.goodId, qty: settlement.lostU, destStationId: carrier.destStationId, cause: settlement.cause });
      this.bus.emit('toast', { text: 'Relay convoy lost near ' + body.name + ' (-' + settlement.lostU + ' goods)', kind: 'warn', ttl: 4 });
    } else {
      const economy = this._economyPeer();
      for (const line of carrier.manifest) {
        const unit = economy && economy.priceOf ? economy.priceOf(carrier.destStationId, line.goodId, 'sell') : null;
        if (!(unit > 0)) {
          // no market truth at arrival: freight comes home — never fabricate a price
          spec.store.input[line.goodId] = (spec.store.input[line.goodId] || 0) + line.qty;
          settlement.returnedU += line.qty;
          this._receipt(body, 'convoy_returned', 'No buyer found — freight returned',
            { carrierId: carrier.id, goodId: line.goodId, qty: line.qty, destStationId: carrier.destStationId });
          continue;
        }
        const revenue = Math.round(line.qty * unit * (1 - ((def && def.saleFee) || 0)));
        this.bus.emit('economy:grantCredits', { amount: revenue, reason: 'claim_relay_sale' });
        this.bus.emit('economy:applyTradePressure', { stationId: carrier.destStationId, good: line.goodId, vol: line.qty });
        spec.totals.soldTotalCr += revenue;
        settlement.revenueCr += revenue;
        this._receipt(body, 'convoy_sold', 'Convoy sold ' + line.qty + 'u at ' + (this._stationName(carrier.destStationId) || carrier.destStationId),
          { carrierId: carrier.id, goodId: line.goodId, qty: line.qty, destStationId: carrier.destStationId, revenueCr: revenue });
      }
    }
    carrier.manifest = [];
    carrier.qty = 0;
    carrier.custody = outcome === 'lost' ? 'lost' : (settlement.revenueCr > 0 ? 'delivered' : 'site');
    carrier.settlement = settlement;
    carrier.progress = outcome === 'lost' ? carrier.progress : 1;
    if (carrier.intercept) carrier.intercept.phase = 'resolved';
    delete carrier._settling;
    this._dematerializeCarrier(carrier, 'settled');
    // The record's proof outlives the record: the site keeps the last settlement so a reader can
    // always answer "what happened to that shipment?" after the carrier itself is gone.
    spec.lastCarrierSettlement = settlement;
    spec.convoy = null;
    this.bus.emit('claim:carrierSettled', { bodyId: body.id, sectorId: body.sectorId, ...settlement });
    return true;
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
    // A cut on a freight run borrows the same shape; match carriers before site defenses.
    const carrierBody = bodies.find((candidate) => candidate && candidate.spec && candidate.spec.convoy
      && candidate.spec.convoy.intercept
      && candidate.spec.convoy.intercept.encounterId === payload.encounterId);
    if (carrierBody) {
      this._resolveCarrierEncounter(carrierBody, carrierBody.spec.convoy, payload.outcome || 'timeout');
      return;
    }
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

  /**
   * Heal a persisted carrier back to the live schema and RESUME it — the shipment continues from
   * exactly where the record says it was, because progress is derived from the saved clock rather
   * than replayed. Entity binding is deliberately dropped: entity ids do not survive a Continue,
   * so the run re-materializes from its own position on the next tick in-sector.
   * A carrier from a pre-carrier save (goodId/qty/arriveAt only) is upgraded in place, never lost.
   */
  _normalizeCarrier(raw, body, def) {
    if (!raw || typeof raw !== 'object') return null;
    const manifest = Array.isArray(raw.manifest) && raw.manifest.length
      ? normalizeManifest(raw.manifest)
      : normalizeManifest([{ goodId: raw.goodId, qty: raw.qty }]);
    if (!manifest.length) return null;                      // nothing aboard → no carrier
    const departedAt = Number.isFinite(Number(raw.departedAt)) ? Number(raw.departedAt) : (this.state.simTime || 0);
    const transitS = Math.max(1, Number(raw.transitS) || Number((def && def.transitS)) || 1);
    // A save taken mid-hold must not gift the run the time it spent stalled: credit the elapsed
    // hold into the durable total before the restored record starts deriving progress again.
    const now = this.state.simTime || 0;
    const savedHoldSince = Math.max(0, Number(raw.holdSince) || 0);
    const holdS = Math.max(0, Number(raw.holdS) || 0)
      + (savedHoldSince > 0 ? Math.max(0, now - savedHoldSince) : 0);
    const from = raw.route && raw.route.from && Number.isFinite(Number(raw.route.from.x))
      ? { x: Number(raw.route.from.x), z: Number(raw.route.from.z) }
      : { x: Number(body.x) || 0, z: Number(body.z) || 0 };
    const to = raw.route && raw.route.to && Number.isFinite(Number(raw.route.to.x))
      ? { x: Number(raw.route.to.x), z: Number(raw.route.to.z) }
      : null;
    const savedCut = raw.intercept && typeof raw.intercept === 'object' ? raw.intercept : {};
    const intercept = Object.assign(this._freshIntercept(), savedCut);
    if (!['clear', 'telegraphed', 'engaged', 'resolved'].includes(intercept.phase)) intercept.phase = 'clear';
    // An engagement cannot survive the load that destroyed its encounter — fall back to the
    // telegraph so the player gets the window again instead of an unwinnable stranded cut.
    if (intercept.phase === 'engaged') {
      intercept.phase = 'telegraphed';
      intercept.requested = false;
      intercept.encounterId = null;
      intercept.strikeAt = Math.max(Number(intercept.strikeAt) || 0, (this.state.simTime || 0) + 20);
    }
    const carrier = {
      schema: CLAIM_CARRIER_SCHEMA,
      id: typeof raw.id === 'string' && raw.id ? raw.id : `${body.id}:carrier:restored`,
      bodyId: body.id,
      sectorId: raw.sectorId || body.sectorId || null,
      name: typeof raw.name === 'string' && raw.name ? raw.name : `${body.name} freight run`,
      custody: 'carrier',
      manifest,
      goodId: manifest[0].goodId,
      qty: manifestTotal(manifest),
      destStationId: raw.destStationId || null,
      departedAt,
      transitS,
      arriveAt: Number.isFinite(Number(raw.arriveAt)) ? Number(raw.arriveAt) : departedAt + transitS + holdS,
      holdS,
      holdSince: intercept.phase === 'telegraphed' ? now : 0,
      progress: 0,
      route: { from, to },
      pos: raw.pos && Number.isFinite(Number(raw.pos.x)) ? { x: Number(raw.pos.x), z: Number(raw.pos.z) } : { ...from },
      entityId: null,
      materialized: false,
      intercept,
      settlement: null,
    };
    carrier.progress = this._carrierProgress(carrier, this.state.simTime || 0);
    return carrier;
  },

  // Heal a deserialized spec to the full schema (legacy/partial saves).
  _normalizeSpec(spec, body) {
    if (!spec || typeof spec !== 'object' || !BODY_SPECIALIZATION_BY_ID.has(spec.id)) return null;
    const def = BODY_SPECIALIZATION_BY_ID.get(spec.id);
    const fresh = this._freshSpec(def);
    const out = Object.assign(fresh, spec);
    out.convoy = body ? this._normalizeCarrier(spec.convoy, body, def) : null;
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

  // Public read API for the Base screen.
  list() { return (this.state.claims && this.state.claims.bodies) || []; },

  /** The live carrier record for a claim (or null). Read-only view — claims stays its writer. */
  carrier(bodyId) {
    const body = this._body(bodyId);
    return (body && body.spec && body.spec.convoy) || null;
  },

  /**
   * Every shipment currently in custody, optionally scoped to one sector. Consumers (map, hud,
   * traffic) read this instead of re-deriving a route: the record already knows where the freight
   * is, whether it is embodied, and whether it is under threat.
   */
  carrierManifests(sectorId) {
    const out = [];
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      const carrier = body && body.spec && body.spec.convoy;
      if (!carrier) continue;
      if (sectorId && carrier.sectorId !== sectorId) continue;
      out.push({
        id: carrier.id,
        bodyId: body.id,
        name: carrier.name,
        sectorId: carrier.sectorId,
        custody: carrier.custody,
        manifest: (carrier.manifest || []).map((line) => ({ ...line })),
        qty: carrier.qty,
        destStationId: carrier.destStationId,
        pos: carrier.pos ? { ...carrier.pos } : null,
        progress: carrier.progress,
        materialized: carrier.materialized === true,
        entityId: carrier.entityId,
        interceptPhase: carrier.intercept ? carrier.intercept.phase : 'clear',
      });
    }
    return out;
  },

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
      b.spec = 'spec' in b ? this._normalizeSpec(b.spec, b) : null;
      const infrastructure = this._normalizeTravelInfrastructure(b.infrastructure, b);
      if (infrastructure) b.infrastructure = infrastructure;
      else delete b.infrastructure;
      if (b.spec && b.spec.defense && b.spec.defense.phase === 'engaged') {
        this._resumeDefenseIds.add(b.spec.defense.id);
      }
    }
    this.state.claims = { bodies, specVersion: 1 };
    if (data.meta && typeof data.meta === 'object') this.state.claims.meta = { ...data.meta };
    if (data.legacyMigration && typeof data.legacyMigration === 'object') {
      this.state.claims.legacyMigration = { ...data.legacyMigration };
    }
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
  },

  newGame() {
    this.state.claims = { bodies: [], specVersion: 1 };
    _nextClaimId = 1;
  },
};
