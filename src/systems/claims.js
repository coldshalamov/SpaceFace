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
const RELAY_LOSS_BASE = 0.05;              // convoy loss floor in unlawful space…
const RELAY_LOSS_DANGER = 0.25;            // …plus danger scaling, capped:
const RELAY_LOSS_CAP = 0.35;
const MAX_RECEIPTS = 8;                    // per-body receipt ring (the ledger's memory)

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
    }
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
      spec: null,           // operating identity (see specialize())
    };
    this.state.claims.bodies.push(body);
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
    if (player.credits < mod.cost) {
      const missing = mod.cost - (Number(player.credits) || 0);
      this.bus.emit('toast', { text: 'Need ' + fmtCr(missing) + ' more cr for ' + mod.name, kind: 'error', ttl: 3 });
      return false;
    }
    this.bus.emit('economy:chargeCredits', { amount: mod.cost, reason: 'build_module' });
    body.modules.push(modId);
    // teleporter auto-links to the nearest station on build (the lane it collapses)
    if (mod.effect === 'teleport') {
      body.linkedStationId = this._nearestStationId(body);
      this.bus.emit('toast', { text: 'Teleporter linked to ' + (this._stationName(body.linkedStationId) || 'nearest station'), kind: 'good', ttl: 4 });
    } else {
      this.bus.emit('toast', { text: '✓ Built: ' + mod.name + ' on ' + body.name, kind: 'good', ttl: 3.5 });
    }
    this.bus.emit('claim:moduleBuilt', { bodyId, modId });
    this.bus.emit('audio:cue', { id: 'confirm' });
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
    this.bus.emit('toast', { text: '✓ Commissioned: ' + def.name + ' — ' + body.name, kind: 'good', ttl: 4 });
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

  // Per-tick: specialization behavior + legacy passive effects. Bodies WITHOUT a specialization
  // keep the original module behavior (refinery module refines from the player hold); a
  // commissioned body runs its operating identity instead (store-based, physical logistics).
  update(dt, state) {
    const bodies = state.claims && state.claims.bodies;
    if (!bodies || !bodies.length) return;
    let anySpec = false;
    for (const body of bodies) {
      if (body.spec) {
        anySpec = true;
        this._tickSpec(body, dt, state);
      } else if (body.modules.includes('mod_refinery')) {
        const mod = BODY_MODULE_BY_ID.get('mod_refinery');
        const rate = (mod.refineRate || 0.5) * dt; // ore-units this tick
        this._tickRefinery(body, rate);
      }
    }
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
          const revenue = Math.round(convoy.qty * unit * (1 - def.saleFee));
          this.bus.emit('economy:grantCredits', { amount: revenue, reason: 'claim_relay_sale' });
          this.bus.emit('economy:applyTradePressure', { stationId: convoy.destStationId, good: convoy.goodId, vol: convoy.qty });
          spec.totals.soldTotalCr += revenue;
          this._receipt(body, 'convoy_sold', 'Convoy sold ' + convoy.qty + 'u at ' + (this._stationName(convoy.destStationId) || convoy.destStationId),
            { goodId: convoy.goodId, qty: convoy.qty, destStationId: convoy.destStationId, revenueCr: revenue });
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
      if (!spec || spec.status === 'raided') continue;
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
        const bastionDef = BODY_SPECIALIZATION_BY_ID.get('spec_bastion');
        const lossFrac = bastion && bastionDef ? bastionDef.coveredLossFrac : SPEC_RAID_LOSS_FRAC;
        let lostU = 0;
        for (const bucket of [spec.store.input, spec.store.output]) {
          for (const id in bucket) {
            const lost = Math.floor((bucket[id] || 0) * lossFrac);
            if (lost > 0) {
              bucket[id] -= lost;
              lostU += lost;
              if (bucket[id] <= 0) delete bucket[id];
            }
          }
        }
        spec.totals.lostU += lostU;
        spec.totals.raidsSuffered += 1;
        spec.status = 'raided';
        spec.statusUntil = t + SPEC_RAID_COOLDOWN_S;
        this._receipt(body, 'raid_hit', 'Raided — lost ' + lostU + 'u of stored goods', { lostU });
        this.bus.emit('claim:raided', { bodyId: body.id, lostU });
        this.bus.emit('toast', { text: body.name + ' raided (-' + lostU + ' goods)', kind: 'warn', ttl: 4 });
      }
    }
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
      totals: { refinedTotalU: 0, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0 },
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
    if (!claims.meta) claims.meta = { rngSeed: 0, upkeepAccum: 0, raidAccum: 0 };
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
    const list = this.state.entityList || [];
    for (const e of list) {
      if (!e || !e.alive || !e.data || e.data.poiId !== body.poiId) continue;
      if (!e.data.claimBaseName) e.data.claimBaseName = e.data.name || body.name;
      e.data.name = def ? e.data.claimBaseName + ' — ' + def.name : e.data.claimBaseName;
      e.data.claimSpecId = def ? def.id : null;
    }
  },

  _applyAllPoiLabels() {
    for (const body of (this.state.claims && this.state.claims.bodies) || []) {
      if (body.spec) this._applyPoiLabel(body);
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
      b.spec = 'spec' in b ? this._normalizeSpec(b.spec) : null;
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
