// A01-04 — the Foundry floor's buyable pads (arena helios_core, Lane 2).
//
// Two wall-gun pads (Pulse Laser by the south gate, Concussion Cannon in the northeast corner,
// 500 each) and THE CRATE (950), which sells a random hull-compatible gun and relocates after
// every third pull to one of three authored spots, never the same spot twice in a row.
//
// HOW A PAD WORKS
// ---------------
// A pad is an ordinary `type:'pickup'` entity — physics' contact collection IS the fly-through,
// the radar's pickup mark IS the floor mark, and the pickup visual (lit gem + beacon ring) IS
// the lit pad. Two authored deviations keep a till from behaving like loot:
//
//   * `data.playerCollectOnly` — only the player's hull ever asks for a receipt, so a passing
//     hostile cannot vacuum the till.
//   * The pad accepts NOTHING. On `pickup:collected` this owner stamps `acceptedAmount: 0`, so
//     the acceptance contract treats every crossing as fully refused and the pad survives —
//     the ordinary retry ledger then rate-limits repeat attempts for free.
//
// HOW A BUY WORKS
// ---------------
// The purse is never touched directly. A crossing emits `run:spendRequested` — the same intent
// the armory draft uses — and waits for the synchronous `run:spent` receipt before fitting.
// Fitting goes through `ships.fitModule`, the same armory seam as every other module: the gun
// lands in the first empty compatible weapon slot, else replaces the lowest-index (primary)
// mountable one. A refused fit refunds through `run:awardRequested` exactly as the draft does.
//
// Short of the price, the pad refuses visibly: `swarm:floorPadRefused` (the label layer flashes
// red over it), the one-line `Need N more` toast, and the ordinary deny cue.
//
// Determinism: the Crate's catalogue pick and its spot choice both draw from `state.rng`, and
// every clock is `state.simTime`. The director is hosted on the survivalArena slot beside the
// freight lane: init() once, arm() from _onWavePlanned, update() every fixed tick, teardown()
// with the room. Crate pulls and the spot cursor are run-scoped — they survive the room's
// per-wave re-arm and reset only when the run ends.

import { validateRunState } from '../core/runState.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { buildSlotList, fits } from './ships.js';
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { FOUNDRY_ARENA_ID } from './swarmArena.js';
import {
  SWARM_FLOOR_PAD_KIND,
  SWARM_FLOOR_WALL_GUN_PRICE,
  SWARM_FLOOR_CRATE_PRICE,
  SWARM_FLOOR_CRATE_PULLS_PER_MOVE,
  SWARM_FLOOR_PAD_RADIUS,
  SWARM_FLOOR_CRATE_RADIUS,
  SWARM_FLOOR_PAD_RETRY_S,
  SWARM_FLOOR_REFUSAL_FLASH_S,
  SWARM_FLOOR_CRATE_MOVE_S,
  SWARM_FLOOR_CRATE_LABEL,
  swarmFloorPlanFor,
  wallGunLabel,
} from '../data/swarmFloor.js';

const FLOOR_OWNER = 'survival-floor';
const SPEND_REASON = 'swarm_floor_pad';
const REFUND_REASON = 'swarm_floor:refund';
const CRATE_PAD_ID = 'foundry-crate';
const BUY_CUE = 'sfx_ui_confirm';
const DENY_CUE = 'sfx_ui_error';
const LIFT_CUE = 'sfx_dock_clunk';
const SETTLE_CUE = 'sfx_dock_clunk';

const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

function weaponName(defId) {
  const def = WEAPON_BY_ID.get(defId);
  return (def && def.name) || defId || 'weapon';
}

/**
 * The hosted director. ctx is the system ctx ({ state, bus, helpers, registry }); arm/update/
 * teardown are called from the survivalArena slot.
 */
export function createSwarmFloorDirector(ctx) {
  const bus = ctx && ctx.bus;
  const helpers = (ctx && ctx.helpers) || {};
  const registry = (ctx && ctx.registry) || null;
  const state = ctx && ctx.state;

  let armed = null;             // { arenaId, at, wave, seed, spots: {x,z}[] }
  let pads = [];                // { rec, entity, spot:{x,z}, moving:null|{from,to,t0,dur,toSpot} }
  let padsById = new Map();     // entityId -> pad
  let pending = null;           // the purchase a spend receipt is expected to resolve
  let crate = { spotIndex: 0, pulls: 0 };   // run-scoped Crate memory
  let unsubs = [];

  function emit(name, payload) {
    if (bus && typeof bus.emit === 'function') bus.emit(name, payload);
  }

  function ships() {
    return registry && typeof registry.get === 'function' ? registry.get('ships') : null;
  }

  function activeLoadout() {
    const player = state && state.player;
    const shipsList = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
    const owned = shipsList[(player && player.activeShipIndex) || 0];
    const shipDef = owned && SHIP_BY_ID.get(owned.defId);
    return shipDef ? { owned, shipDef } : null;
  }

  /**
   * Where a bought gun lands: the first EMPTY slot that mounts it, else the lowest-index
   * (primary) slot that mounts it — the armory's own add-before-swap order. Null when no
   * mountable slot exists, or when every mountable slot already carries this exact def.
   */
  function padSlotIndex(def) {
    const loadout = activeLoadout();
    if (!loadout) return null;
    const fittings = Array.isArray(loadout.owned.fittings) ? loadout.owned.fittings : [];
    const mountable = buildSlotList(loadout.shipDef)
      .filter((slot) => slot.type === 'weapon' && fits(slot, def));
    const empty = mountable.find((slot) => !fittings[slot.index]);
    if (empty) return empty.index;
    const swap = mountable.find((slot) => fittings[slot.index] !== def.id);
    return swap ? swap.index : null;
  }

  /**
   * The slot a dealt def would land in — or null when the armory's whole gate refuses it.
   * `fits` answers mount legality; the owner's `moduleFitBlocker` adds the rest (research and
   * earn ledgers, head conflicts, outfit budget, cargo headroom). THE CRATE only ever deals
   * from the dealable set, so a locked or unbudgetable gun can never be sold and refunded.
   */
  function dealableSlotIndex(def) {
    const slotIndex = padSlotIndex(def);
    if (slotIndex == null) return null;
    const sys = ships();
    if (sys && typeof sys.moduleFitBlocker === 'function') {
      const blocker = sys.moduleFitBlocker({
        shipIndex: (state.player && state.player.activeShipIndex) || 0,
        slotIndex,
        def,
      });
      if (blocker) return null;
    }
    return slotIndex;
  }

  /** Every catalogue weapon the flown hull can mount AND the armory would actually bolt on. */
  function crateCatalogue() {
    const loadout = activeLoadout();
    if (!loadout) return [];
    return WEAPONS.filter((def) => def && def.slotType === 'weapon'
      && dealableSlotIndex(def) != null);
  }

  function rollCrateDefId() {
    const catalogue = crateCatalogue();
    if (!catalogue.length) return null;
    const rng = state && typeof state.rng === 'function' ? state.rng : null;
    const pick = Math.floor((rng ? rng() : 0) * catalogue.length) % catalogue.length;
    return catalogue[pick].id;
  }

  function _spawnPad({ rec, spot, radius }) {
    if (typeof helpers.spawnEntity !== 'function') return null;
    const entity = helpers.spawnEntity({
      type: 'pickup',
      team: 0,
      pos: { x: spot.x, z: spot.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius,
      mass: 1,
      collides: true,
      data: {
        roomOwner: FLOOR_OWNER,
        kind: SWARM_FLOOR_PAD_KIND,
        // The generic pipeline requires a positive amount to publish a collectible event at
        // all; the pad's acceptance stamp is always zero, so the amount never leaves.
        amount: 1,
        playerCollectOnly: true,
        swarmFloorPad: rec,
      },
    });
    if (!entity || entity.id == null) return null;
    const pad = { rec, entity, spot: { x: spot.x, z: spot.z }, moving: null };
    pads.push(pad);
    padsById.set(entity.id, pad);
    return pad;
  }

  function arm({ arenaId = null, at = null, installedAt = null, wave = 0, seed = 1 } = {}) {
    teardown('rearm');
    if (arenaId !== FOUNDRY_ARENA_ID) return;
    const plan = swarmFloorPlanFor(arenaId);
    const anchor = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : null;
    if (!plan || !anchor) return;
    const spots = plan.crateSpots.map((offset) => ({ x: anchor.x + offset.dx, z: anchor.z + offset.dz }));
    armed = { arenaId, at: { x: anchor.x, z: anchor.z }, installedAt, wave, seed, spots };
    for (const spec of plan.wallGuns) {
      const def = WEAPON_BY_ID.get(spec.defId);
      _spawnPad({
        rec: {
          padId: spec.id,
          kind: 'wall_gun',
          defId: spec.defId,
          price: SWARM_FLOOR_WALL_GUN_PRICE,
          label: wallGunLabel(def && def.name, SWARM_FLOOR_WALL_GUN_PRICE),
        },
        spot: { x: anchor.x + spec.dx, z: anchor.z + spec.dz },
        radius: SWARM_FLOOR_PAD_RADIUS,
      });
    }
    const spot = spots[Math.max(0, Math.min(crate.spotIndex, spots.length - 1))];
    crate.spotIndex = Math.max(0, Math.min(crate.spotIndex, spots.length - 1));
    _spawnPad({
      rec: {
        padId: CRATE_PAD_ID,
        kind: 'crate',
        defId: null,
        price: SWARM_FLOOR_CRATE_PRICE,
        label: SWARM_FLOOR_CRATE_LABEL,
      },
      spot,
      radius: SWARM_FLOOR_CRATE_RADIUS,
    });
    emit('swarm:floorArmed', {
      arenaId, wave,
      pads: pads.map((pad) => ({ padId: pad.rec.padId, kind: pad.rec.kind,
        label: pad.rec.label, price: pad.rec.price,
        pos: { x: pad.spot.x, z: pad.spot.z } })),
    });
  }

  function _refuse(pad, run, reason, missing) {
    const rec = pad.rec;
    const now = simTimeOf(state);
    if (pad.entity && pad.entity.data && pad.entity.data.swarmFloorPad) {
      pad.entity.data.swarmFloorPad.refusedUntil = now + SWARM_FLOOR_REFUSAL_FLASH_S;
    }
    emit('swarm:floorPadRefused', {
      padId: rec.padId, kind: rec.kind, reason,
      price: rec.price, available: run && Number.isFinite(run.credits) ? run.credits : 0,
      missing: missing || 0,
      pos: { x: pad.spot.x, z: pad.spot.z },
    });
    emit('toast', {
      text: reason === 'insufficient_funds'
        ? `Need ${missing} more · ${rec.label.split('·')[0].trim()}`
        : `${rec.label.split('·')[0].trim()} does not fit your hull.`,
      kind: 'warn',
      ttl: 2,
    });
    emit('audio:cue', { id: DENY_CUE, position: { x: pad.spot.x, z: pad.spot.z }, gain: 0.5 });
  }

  function _attemptPurchase(pad) {
    const run = liveSwarmRun(state);
    if (!run) return;
    const rec = pad.rec;
    const price = rec.price;
    if (run.credits < price) {
      _refuse(pad, run, 'insufficient_funds', price - run.credits);
      return;
    }
    const defId = rec.kind === 'crate' ? rollCrateDefId() : rec.defId;
    const def = defId ? WEAPON_BY_ID.get(defId) : null;
    const slotIndex = def ? dealableSlotIndex(def) : null;
    if (!def || slotIndex == null) {
      _refuse(pad, run, 'cannot_mount', 0);
      return;
    }
    pending = { padId: rec.padId, kind: rec.kind, defId, slotIndex, price };
    emit('run:spendRequested', { credits: price, reason: SPEND_REASON });
    // The receipt resolves synchronously inside the emit; a still-open pending means no wallet
    // owner answered (headless host without runSession) — drop it so a later crossing retries.
    pending = null;
  }

  function _onSpent(payload) {
    if (!pending || !payload || payload.reason !== SPEND_REASON || payload.credits !== pending.price) return;
    const job = pending;
    pending = null;
    const pad = pads.find((row) => row.rec.padId === job.padId);
    const sys = ships();
    const fitted = !!(sys && typeof sys.fitModule === 'function'
      && sys.fitModule({ slotIndex: job.slotIndex, defId: job.defId }));
    if (!fitted) {
      emit('run:awardRequested', { credits: job.price, reason: REFUND_REASON });
      emit('toast', {
        text: `${weaponName(job.defId)} could not be fitted — ${job.price} cr refunded`,
        kind: 'warn', ttl: 3,
      });
      return;
    }
    emit('audio:cue', {
      id: BUY_CUE, gain: 0.8,
      position: pad ? { x: pad.spot.x, z: pad.spot.z } : undefined,
    });
    emit('toast', {
      text: job.kind === 'crate'
        ? `THE CRATE · ${weaponName(job.defId)}`
        : `${weaponName(job.defId)} fitted`,
      kind: 'good', ttl: 3,
    });
    emit('swarm:floorPadBought', {
      padId: job.padId, kind: job.kind, defId: job.defId, slotIndex: job.slotIndex,
      price: job.price,
      pos: pad ? { x: pad.spot.x, z: pad.spot.z } : null,
    });
    if (job.kind !== 'crate' || !pad) return;
    crate.pulls += 1;
    if (crate.pulls % SWARM_FLOOR_CRATE_PULLS_PER_MOVE === 0) _startCrateMove(pad);
  }

  function _onSpendRejected(payload) {
    if (!pending || !payload || payload.reason !== SPEND_REASON) return;
    const job = pending;
    pending = null;
    const pad = pads.find((row) => row.rec.padId === job.padId);
    if (pad) {
      const run = liveSwarmRun(state);
      _refuse(pad, run, 'insufficient_funds',
        Math.max(0, job.price - (Number(payload.available) || 0)));
    }
  }

  function _onCollected(payload) {
    if (!armed || !payload) return;
    const pad = padsById.get(payload.pickupId);
    if (!pad || !pad.entity || pad.entity.alive === false) return;
    if (payload.collectorId !== state.playerId) return;
    // The pad never yields amount — stamping zero makes every crossing a full refusal, so the
    // body survives and physics' ordinary retry ledger paces the next attempt for free.
    payload.acceptedAmount = 0;
    payload.acceptanceRetryAt = simTimeOf(state) + SWARM_FLOOR_PAD_RETRY_S;
    if (pad.moving) return;
    _attemptPurchase(pad);
  }

  function _startCrateMove(pad) {
    const spots = armed && armed.spots;
    if (!spots || spots.length < 2) return;
    const choices = spots.map((_, i) => i).filter((i) => i !== crate.spotIndex);
    const rng = state && typeof state.rng === 'function' ? state.rng : null;
    const next = choices[Math.floor((rng ? rng() : 0) * choices.length) % choices.length];
    const from = { x: pad.entity.pos.x, z: pad.entity.pos.z };
    const to = spots[next];
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const dur = Math.max(0.01, SWARM_FLOOR_CRATE_MOVE_S, dist / 160);
    const now = simTimeOf(state);
    pad.moving = { from, to, t0: now, dur, toSpot: next };
    emit('swarm:floorCrateMoved', {
      fromSpot: crate.spotIndex, toSpot: next, pulls: crate.pulls,
      pos: { x: from.x, z: from.z },
    });
    emit('audio:cue', { id: LIFT_CUE, position: { x: from.x, z: from.z }, gain: 0.55, rate: 0.8 });
    crate.spotIndex = next;
  }

  function update(_dt, st) {
    const s = st || state;
    if (!armed) return;
    const now = simTimeOf(s);
    for (const pad of pads) {
      const entity = pad.entity;
      if (!entity || entity.alive === false || !entity.pos) continue;
      if (pad.moving) {
        const move = pad.moving;
        const t = Math.min(1, Math.max(0, (now - move.t0) / move.dur));
        entity.pos.x = move.from.x + (move.to.x - move.from.x) * t;
        entity.pos.z = move.from.z + (move.to.z - move.from.z) * t;
        if (entity.vel) { entity.vel.x = 0; entity.vel.z = 0; }
        if (t >= 1) {
          pad.spot = { x: move.to.x, z: move.to.z };
          pad.moving = null;
          emit('audio:cue', { id: SETTLE_CUE, position: { x: entity.pos.x, z: entity.pos.z }, gain: 0.6 });
        }
      } else {
        // A pad is a bolted fixture: fields and freight can shove its body, the spot cannot move.
        entity.pos.x = pad.spot.x;
        entity.pos.z = pad.spot.z;
        if (entity.vel) { entity.vel.x = 0; entity.vel.z = 0; }
      }
    }
  }

  function teardown(reason) {
    const st = ctx && ctx.state;
    for (const pad of pads) {
      const entity = pad.entity;
      if (entity && entity.alive !== false) {
        entity.alive = false;
        emit('entity:retired', {
          id: entity.id, occupantGeneration: entity.occupantGeneration,
          type: entity.type, pos: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
          reason: `floor-${reason}`, owner: FLOOR_OWNER, simTime: simTimeOf(st),
        });
      }
    }
    pads = [];
    padsById.clear();
    armed = null;
    pending = null;
    if (reason === 'run_ended' || reason === 'destroy' || reason === 'new_game') {
      crate = { spotIndex: 0, pulls: 0 };
    }
  }

  return {
    init() {
      if (!bus || typeof bus.on !== 'function') return;
      unsubs.push(bus.on('pickup:collected', (p) => _onCollected(p)));
      unsubs.push(bus.on('run:spent', (p) => _onSpent(p)));
      unsubs.push(bus.on('run:spendRejected', (p) => _onSpendRejected(p)));
    },
    arm,
    update,
    teardown,
    destroy() {
      teardown('destroy');
      for (const off of unsubs) if (typeof off === 'function') off();
      unsubs = [];
    },
    diagnostics() {
      return {
        armed: !!armed,
        pads: pads.map((pad) => ({
          padId: pad.rec.padId, kind: pad.rec.kind, price: pad.rec.price,
          pos: pad.entity && pad.entity.pos
            ? { x: pad.entity.pos.x, z: pad.entity.pos.z } : null,
          moving: !!pad.moving,
        })),
        crate: { ...crate },
      };
    },
    // Test seams.
    get _armed() { return armed; },
    get _pads() { return pads; },
    get _crate() { return crate; },
  };
}
