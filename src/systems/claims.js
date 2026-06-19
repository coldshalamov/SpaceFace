// Claimable bodies system (V2 §6 / M3). Owns state.claims — the player's claimed bodies and the
// modules built on them. The "you own a place" fantasy, scoped as base-as-node (not a tile grid).
//
// Verbs:
//   - CLAIM: fly near a claimable body POI, pay CLAIM_COST. Body becomes yours, with N module slots.
//   - BUILD: pay a module's cost, fit it into a free slot. The module provides a passive effect.
//   - TELEPORT: if a teleporter module is built, instant travel between the body and its linked
//     station (the V2 §8 lane-collapser — the milestone unlock that rewrites map geometry).
//
// Passive effects tick in update(): the refinery auto-refines ore into materials at a rate. The
// depot is a MOVE beacon the automation alphabet resolves to (named 'depot'). The defense battery
// reduces raid risk. The teleporter enables the fast-travel verb.
//
// Single-writer: claims owns only state.claims. Credits/cargo route through canonical writers.
// PERSISTENCE: claimable bodies are NOT yet serialized (documented TODO) — they persist in-memory
// this pass. A save v2->v3 migration is the follow-up once the save system is stable; the body's
// sectorId + POI id are stable seeds so re-derivation is deterministic (V2 §32).
import { BODY_MODULES, BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE, CLAIM_COST } from '../data/claimableBodies.js';
import { addCargo, removeCargo } from './cargo.js';

// Refinery conversion: 2 ore -> 1 refined material (the "lighter, dearer goods to ship" beat).
const REFINE_RATIO = 2;
const REFINE_MAP = { // raw ore -> refined commodity
  cmdty_ore_iron: 'cmdty_mat_alloys',
  cmdty_ore_copper: 'cmdty_mat_circuits',
  cmdty_ore_silicon: 'cmdty_mat_circuits',
  cmdty_ore_titanium: 'cmdty_mat_alloys',
  cmdty_ore_platinoid: 'cmdty_mat_components',
};

let _nextClaimId = 1;

export const claims = {
  name: 'claims',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    // state.claims: { bodies: [{ id, sectorId, poiId, name, size, slots, modules:[modId|null], linkedStationId, x, z }] }
    if (!this.state.claims) this.state.claims = { bodies: [] };
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
      this.bus.emit('toast', { text: 'Need ' + CLAIM_COST + ' credits to claim', kind: 'error', ttl: 3 });
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
      this.bus.emit('toast', { text: 'Research required: ' + mod.techReq, kind: 'error', ttl: 3 });
      return false;
    }
    if (player.credits < mod.cost) {
      this.bus.emit('toast', { text: 'Need ' + mod.cost + ' credits for ' + mod.name, kind: 'error', ttl: 3 });
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

  // Per-tick: passive effects. The refinery auto-refines ore -> materials at its rate. Other modules
  // are passive (their effect is queried on demand by other systems, not ticked here).
  update(dt, state) {
    const bodies = state.claims && state.claims.bodies;
    if (!bodies || !bodies.length) return;
    for (const body of bodies) {
      if (!body.modules.includes('mod_refinery')) continue;
      const mod = BODY_MODULE_BY_ID.get('mod_refinery');
      const rate = (mod.refineRate || 0.5) * dt; // ore-units this tick
      this._tickRefinery(body, rate);
    }
  },

  // Convert raw ore in cargo into refined materials at the given rate. Picks the most plentiful ore.
  _tickRefinery(body, oreUnits) {
    const cargo = this.state.player.cargo;
    if (!cargo || !cargo.items) return;
    // accumulate fractional conversion per-body so slow rates still progress
    body._refineAcc = (body._refineAcc || 0) + oreUnits;
    if (body._refineAcc < REFINE_RATIO) return; // not enough for one conversion yet
    const units = Math.floor(body._refineAcc / REFINE_RATIO);
    body._refineAcc -= units * REFINE_RATIO;
    // find the most plentiful refinable ore
    let bestOre = null, bestQty = 0;
    for (const ore of Object.keys(REFINE_MAP)) {
      const have = cargo.items[ore] || 0;
      if (have > bestQty) { bestQty = have; bestOre = ore; }
    }
    if (!bestOre || bestQty < units) return; // nothing to refine
    const out = REFINE_MAP[bestOre];
    removeCargo(this.state, bestOre, units);
    addCargo(this.state, out, units);
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

  // Public read API for a future Base screen.
  list() { return (this.state.claims && this.state.claims.bodies) || []; },
};
