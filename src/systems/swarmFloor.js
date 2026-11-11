// A01-04/A01-05 — the Foundry floor's buyable pads (arena helios_core, Lane 2).
//
// Two wall-gun pads (Pulse Laser by the south gate, Concussion Cannon in the northeast corner,
// 500 each), THE CRATE (950), which sells a random hull-compatible gun and relocates after
// every third pull to one of three authored spots, never the same spot twice in a row —
// and the A01-05 hardware: THE FORGE behind the furnace on the north wall (5000, once per
// gun per run) and two TAPS mid-floor selling run-long modifiers at stepping prices.
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
import { makeStream } from '../core/rng.js';
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
  SWARM_FLOOR_FORGE_RADIUS,
  SWARM_FLOOR_PAD_RETRY_S,
  SWARM_FLOOR_REFUSAL_FLASH_S,
  SWARM_FLOOR_CRATE_MOVE_S,
  SWARM_FLOOR_CRATE_LABEL,
  swarmFloorPlanFor,
  wallGunLabel,
} from '../data/swarmFloor.js';
import {
  SWARM_FORGE_PRICE,
  SWARM_FORGE_LABEL,
  SWARM_FORGE_RECORD_KIND,
  SWARM_TAP_RECORD_KIND,
  SWARM_TAP_PRICES,
  SWARM_TAP_MAX_PURCHASES,
  swarmTapModById,
  swarmForgeFormName,
  swarmTapLabel,
} from '../data/swarmMods.js';
import {
  swarmHeldWeaponDefId,
  swarmTapAvailable,
  swarmTapCount,
  swarmTapsSoldOut,
} from './playerModifiers.js';

const FLOOR_OWNER = 'survival-floor';
const SPEND_REASON = 'swarm_floor_pad';
const REFUND_REASON = 'swarm_floor:refund';
const CRATE_PAD_ID = 'foundry-crate';
const BUY_CUE = 'sfx_ui_confirm';
const DENY_CUE = 'sfx_ui_error';
const FORGE_CUE = 'sfx_station_machinery';
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
  let tapRng = null;            // the round's own seeded pour stream (never shares state.rng)
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

  /** The price a tap charges for its NEXT sale — the step for the count already bought. */
  function tapPriceNow() {
    const run = liveSwarmRun(state);
    if (!run) return SWARM_TAP_PRICES[0];
    const count = swarmTapCount(run);
    return count < SWARM_TAP_MAX_PURCHASES ? SWARM_TAP_PRICES[count] : null;
  }

  /**
   * One deterministic tap offer: the pool is the catalogue minus every `swarm_tap`
   * receipt on the run's own ledger minus anything the caller wants kept out —
   * the sibling pad's live offer, so the pair never pours the same bottle. The draw
   * rides the round's own seeded stream so the pour never perturbs the shared
   * `state.rng` sequence the Crate and the wave planner already own.
   */
  function rollTapOffer(excludeIds = []) {
    const run = liveSwarmRun(state);
    if (!run || swarmTapsSoldOut(run)) return null;
    const pool = swarmTapAvailable(run, excludeIds);
    if (!pool.length) return null;
    const draw = tapRng ? tapRng() : 0;
    return pool[Math.floor(draw * pool.length) % pool.length];
  }

  function tapPads() {
    return pads.filter((pad) => pad.rec && pad.rec.kind === 'tap');
  }

  function siblingTapOffer(pad) {
    const sib = tapPads().find((row) => row !== pad && row.rec && row.rec.modId);
    return sib ? [sib.rec.modId] : [];
  }

  /**
   * Re-roll one tap's label truth: the offer, the next price step, or SOLD OUT
   * once the run's four-bottle till is dry. The entity's swarmFloorPad record IS
   * the label record — this is the same write the arm made.
   */
  function refreshTapRec(pad) {
    const run = liveSwarmRun(state);
    const rec = pad.rec;
    if (!run || swarmTapsSoldOut(run)) {
      rec.modId = null;
      rec.price = null;
      rec.label = swarmTapLabel(null);
      return;
    }
    const price = tapPriceNow();
    const offer = rollTapOffer(siblingTapOffer(pad));
    rec.modId = offer ? offer.id : null;
    rec.price = price;
    rec.label = offer ? swarmTapLabel(offer, price) : swarmTapLabel(null);
  }

  /** After a sale both pads re-read their own till: this one re-rolls, the sibling re-prices. */
  function refreshAllTapRecs() {
    for (const pad of tapPads()) refreshTapRec(pad);
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
    // A01-05 — the Forge and the two Taps. Tap offers roll here, at round start,
    // from the mods this run does not own yet; the two pads never vend the same
    // bottle in the same round. The pour stream is keyed on the run's own seed and
    // the round number, so re-arms of the same round re-pour the same offers.
    tapRng = makeStream(seed, `swarm-tap:${wave}`);
    if (plan.forge) {
      _spawnPad({
        rec: {
          padId: plan.forge.id,
          kind: 'forge',
          defId: null,
          price: SWARM_FORGE_PRICE,
          label: SWARM_FORGE_LABEL,
        },
        spot: { x: anchor.x + plan.forge.dx, z: anchor.z + plan.forge.dz },
        radius: SWARM_FLOOR_FORGE_RADIUS,
      });
    }
    const tapSpecs = Array.isArray(plan.taps) ? plan.taps : [];
    const rolledOffers = [];
    for (const spec of tapSpecs) {
      const offer = rollTapOffer(rolledOffers.map((mod) => mod && mod.id));
      rolledOffers.push(offer);
      _spawnPad({
        rec: {
          padId: spec.id,
          kind: 'tap',
          defId: null,
          modId: offer ? offer.id : null,
          price: offer ? tapPriceNow() : null,
          label: offer ? swarmTapLabel(offer, tapPriceNow()) : swarmTapLabel(null),
        },
        spot: { x: anchor.x + spec.dx, z: anchor.z + spec.dz },
        radius: SWARM_FLOOR_PAD_RADIUS,
      });
    }
    emit('swarm:floorArmed', {
      arenaId, wave,
      pads: pads.map((pad) => ({ padId: pad.rec.padId, kind: pad.rec.kind,
        label: pad.rec.label, price: pad.rec.price, modId: pad.rec.modId ?? null,
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
        : rec.refuseText || `${rec.label.split('·')[0].trim()} does not fit your hull.`,
      kind: 'warn',
      ttl: 2,
    });
    emit('audio:cue', { id: DENY_CUE, position: { x: pad.spot.x, z: pad.spot.z }, gain: 0.5 });
  }

  /**
   * A refusal the pad voices itself — 'Already forged' is packet law, not a
   * computed deficit — the refusal event and the deny flash stay identical.
   */
  function _refuseText(pad, run, reason, text) {
    const rec = pad.rec;
    const now = simTimeOf(state);
    if (pad.entity && pad.entity.data && pad.entity.data.swarmFloorPad) {
      pad.entity.data.swarmFloorPad.refusedUntil = now + SWARM_FLOOR_REFUSAL_FLASH_S;
    }
    emit('swarm:floorPadRefused', {
      padId: rec.padId, kind: rec.kind, reason,
      price: rec.price, available: run && Number.isFinite(run.credits) ? run.credits : 0,
      missing: 0,
      pos: { x: pad.spot.x, z: pad.spot.z },
    });
    emit('toast', { text, kind: 'warn', ttl: 2 });
    emit('audio:cue', { id: DENY_CUE, position: { x: pad.spot.x, z: pad.spot.z }, gain: 0.5 });
  }

  function _attemptPurchase(pad) {
    const run = liveSwarmRun(state);
    if (!run) return;
    const rec = pad.rec;
    if (rec.kind === 'forge') { _attemptForge(pad, run); return; }
    if (rec.kind === 'tap') { _attemptTap(pad, run); return; }
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

  /**
   * THE FORGE — one gun, once per run. The receipt for a defId is the run ledger's
   * own `swarm_forge` row, so a forge survives re-arms and room teardowns. A held
   * Free Forge flag never touches the wallet; otherwise it is the ordinary
   * spend-then-commit flow the wall guns already use.
   */
  function _attemptForge(pad, run) {
    const rec = pad.rec;
    const heldId = swarmHeldWeaponDefId(state);
    if (!heldId) {
      _refuseText(pad, run, 'no_gun', 'No gun to forge');
      return;
    }
    const already = (run.modifiers || []).some(
      (row) => row && row.kind === SWARM_FORGE_RECORD_KIND && row.defId === heldId);
    if (already) {
      _refuseText(pad, run, 'already_forged', 'Already forged');
      return;
    }
    const free = !!(run.telemetry && run.telemetry.freeForge === true);
    if (!free && run.credits < SWARM_FORGE_PRICE) {
      _refuse(pad, run, 'insufficient_funds', SWARM_FORGE_PRICE - run.credits);
      return;
    }
    if (free) {
      _commitForge(pad, run, heldId, true);
      return;
    }
    pending = { padId: rec.padId, kind: 'forge', defId: heldId, price: SWARM_FORGE_PRICE };
    emit('run:spendRequested', { credits: SWARM_FORGE_PRICE, reason: SPEND_REASON });
    pending = null;
  }

  function _commitForge(pad, run, defId, free) {
    const def = WEAPON_BY_ID.get(defId);
    const form = swarmForgeFormName(defId, def && def.name);
    // The free pour is spent too — the flag clears the moment the forge answers.
    if (free && run.telemetry && typeof run.telemetry === 'object') {
      run.telemetry.freeForge = false;
    }
    emit('run:modifierRecordRequested', {
      record: {
        kind: SWARM_FORGE_RECORD_KIND, offerId: 'forge', defId,
        form, wave: Math.max(1, armed ? armed.wave : run.wave),
      },
      wave: armed ? armed.wave : run.wave,
    });
    const at = pad ? { x: pad.spot.x, z: pad.spot.z } : null;
    emit('audio:cue', { id: FORGE_CUE, position: at, gain: 0.9, rate: 0.8 });
    // A brief ship flash, through the generic presentation channel the rest of
    // the sim's visual receipts already ride — flash/vfx accessibility applies
    // inside the renderer, as for every cue.
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId) : null;
    emit('presentation:vfxCue', {
      id: 'swarm.forge', lane: 'swarm',
      position: player && player.pos ? { x: player.pos.x, z: player.pos.z } : at,
      magnitude: 1.5, particles: 22, lights: 1,
      sourceId: state.playerId, flashReduced: false,
    });
    emit('toast', { text: `THE FORGE · ${form}`, kind: 'good', ttl: 3 });
    emit('swarm:floorPadBought', {
      padId: pad ? pad.rec.padId : 'foundry-forge', kind: 'forge', defId, form,
      price: free ? 0 : SWARM_FORGE_PRICE, pos: at,
    });
  }

  /**
   * A TAP — one bottle per crossing, four for the run across both pads. The pad's
   * offer is rolled at round start and re-rolled after each pour; the price steps
   * on the run's committed count, not on the pad.
   */
  function _attemptTap(pad, run) {
    const rec = pad.rec;
    if (swarmTapsSoldOut(run)) {
      refreshTapRec(pad);
      _refuseText(pad, run, 'sold_out', 'TAP · SOLD OUT');
      return;
    }
    // A stale offer never vends twice: if the ledger owns this bottle already
    // (bought on the sibling pad) the tap re-pours before it charges.
    const owned = (run.modifiers || []).some(
      (row) => row && row.kind === SWARM_TAP_RECORD_KIND && row.offerId === rec.modId);
    if (!rec.modId || owned) refreshTapRec(pad);
    const mod = rec.modId ? swarmTapModById(rec.modId) : null;
    if (!mod) {
      _refuseText(pad, run, 'sold_out', 'TAP · SOLD OUT');
      return;
    }
    const price = SWARM_TAP_PRICES[swarmTapCount(run)];
    if (run.credits < price) {
      _refuse(pad, run, 'insufficient_funds', price - run.credits);
      return;
    }
    pending = { padId: rec.padId, kind: 'tap', modId: mod.id, price };
    emit('run:spendRequested', { credits: price, reason: SPEND_REASON });
    pending = null;
  }

  function _commitTap(job, pad) {
    const run = liveSwarmRun(state);
    const mod = swarmTapModById(job.modId);
    if (!run || !mod) return;
    emit('run:modifierRecordRequested', {
      record: {
        kind: SWARM_TAP_RECORD_KIND, offerId: mod.id,
        wave: Math.max(1, armed ? armed.wave : run.wave),
      },
      wave: armed ? armed.wave : run.wave,
    });
    const at = pad ? { x: pad.spot.x, z: pad.spot.z } : null;
    emit('audio:cue', { id: BUY_CUE, gain: 0.8, position: at });
    emit('toast', { text: `TAP · ${mod.name} — ${mod.text}`, kind: 'good', ttl: 4 });
    emit('swarm:floorPadBought', {
      padId: job.padId, kind: 'tap', modId: mod.id, price: job.price, pos: at,
    });
    refreshAllTapRecs();
  }

  function _onSpent(payload) {
    if (!pending || !payload || payload.reason !== SPEND_REASON || payload.credits !== pending.price) return;
    const job = pending;
    pending = null;
    const pad = pads.find((row) => row.rec.padId === job.padId);
    if (job.kind === 'forge') {
      _commitForge(pad, liveSwarmRun(state), job.defId, false);
      return;
    }
    if (job.kind === 'tap') {
      _commitTap(job, pad);
      return;
    }
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
