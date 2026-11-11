// Gratitude parcel — the freighter you saved sends cargo later. The opening raid's
// earned-escape fact (a defended raid whose working barge kept its load, recorded by
// the causal ledger) is currently worth one dock hail. This owner closes the loop:
// when that barge next makes a real delivery, it arms one parcel, and on the next
// close pass to the player it launches a gift pod titled to the player — law-clean
// to scoop, an ordinary body through the ordinary routes — with the captain's line
// spoken from the hull that owed it.
//
// The cause ledger stays the single writer of its own saved state: this module reads
// it and never writes it. Everything here is runtime (a WeakMap keyed by state, a
// paid-fingerprint set) — no new save fields, no durable records. Deterministic:
// proximity and timing ride state.simTime; the pod is the shipped jettison spawn.

import { spawnJettisonedCargoPod } from '../systems/lootShards.js';
import { COMMODITIES } from '../data/commodities.js';

const COMMODITY_IDS = new Set(COMMODITIES.map((commodity) => commodity.id));
const PARCEL_PASS_WU = 900;
const PARCEL_QTY = 2;

const tables = new WeakMap();
function book(state) {
  let entry = tables.get(state);
  if (!entry) {
    entry = { armed: null, paid: new Set() };
    tables.set(state, entry);
  }
  return entry;
}

const live = (state, id) => {
  const entity = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
  return entity && entity.alive !== false ? entity : null;
};

function player(state) {
  return state.playerId != null ? live(state, state.playerId) : null;
}

function owedCause(state, payload) {
  const causes = state.aftermathWrecks && state.aftermathWrecks.causes;
  if (!causes || !payload) return null;
  const rows = Object.values(causes);
  for (let i = 0; i < rows.length; i++) {
    const cause = rows[i];
    // Exactly the earned-escape fact: a defended raid whose adopted working barge
    // flew on with the load. A generic 'defended' never becomes personal gratitude.
    if (!cause || cause.shapeId !== 'opening_hauler_raid') continue;
    if (cause.outcome !== 'defended' || cause.adoptedWorkingBarge !== true
      || cause.resolutionMethod !== 'physical_escape') continue;
    if (String(cause.carrierWorldRecordId || '') !== String(payload.freighterKey || '')) continue;
    return cause;
  }
  return null;
}

/**
 * A real delivery by a hauler the player once defended arms one parcel. The
 * freight-arrival intent is the proof the load actually got there.
 */
export function gratitudeParcelArrivalReceipt(o, payload) {
  const state = o.state;
  if (!state || !payload) return false;
  const b = book(state);
  const cause = owedCause(state, payload);
  if (!cause || !cause.fingerprint) return false;
  if (b.paid.has(cause.fingerprint)) return false;
  if (b.armed && b.armed.fingerprint === cause.fingerprint) return false;
  b.armed = {
    fingerprint: cause.fingerprint,
    freighterId: payload.freighterId != null ? payload.freighterId : null,
    carrierWorldRecordId: cause.carrierWorldRecordId || null,
    stationId: payload.stationId || null,
    sectorId: state.world && state.world.currentSectorId,
    manifestId: cause.manifestId || null,
    commodityId: cause.commodityId || null,
    armedAt: Number(state.simTime) || 0,
  };
  return true;
}

function commodityFor(cause) {
  const id = cause && typeof cause.commodityId === 'string' ? cause.commodityId : '';
  return COMMODITY_IDS.has(id) ? id : 'cmdty_food';
}

export function stepGratitudeParcel(o) {
  const state = o.state;
  if (!state || !state.world) return false;
  const b = book(state);
  const parcel = b.armed;
  if (!parcel) return false;

  const hauler = parcel.freighterId != null ? live(state, parcel.freighterId) : null;
  if (!hauler) {
    // The saved hull died or left before the pass: the debt stays unpaid and the
    // next honest arrival re-arms it. Nothing is minted from a dead hull.
    b.armed = null;
    return false;
  }
  const me = player(state);
  if (!me || !me.pos || !hauler.pos) return false;
  if (state.world.currentSectorId !== parcel.sectorId) return false;
  const dist = Math.hypot(hauler.pos.x - me.pos.x, hauler.pos.z - me.pos.z);
  if (dist > PARCEL_PASS_WU) return false;

  // The pass: one gift pod, titled to the player, launched by the saved hull.
  const commodityId = commodityFor(parcel);
  const pod = o.helpers && typeof o.helpers.spawnEntity === 'function'
    ? spawnJettisonedCargoPod(state, {
      commodityId,
      amount: PARCEL_QTY,
      unitMass: 0.8,
      ownerId: state.playerId,
      ownerName: (hauler.data && hauler.data.name) || hauler.name || 'the captain',
      pos: hauler.pos,
    }, o.helpers) : null;
  if (!pod) return false;
  if (pod.data) {
    pod.data.gratitudeParcel = {
      causeFingerprint: parcel.fingerprint,
      from: (hauler.data && hauler.data.name) || 'the captain',
      armedAt: parcel.armedAt,
    };
  }
  b.paid.add(parcel.fingerprint);
  b.armed = null;
  if (o.bus && typeof o.bus.emit === 'function') {
    try {
      o.bus.emit('gratitude:parcel', {
        entityId: hauler.id,
        podId: pod.id,
        commodityId,
        qty: PARCEL_QTY,
        from: (hauler.data && hauler.data.name) || 'the captain',
        t: Number(state.simTime) || 0,
      });
    } catch { /* a listener must not corrupt the pass */ }
  }
  return true;
}

/** A hard sector exit folds the armed pass; the unpaid debt waits for a later arrival. */
export function releaseGratitudeParcel(o) {
  const state = o.state;
  if (!state) return false;
  const b = book(state);
  b.armed = null;
  return true;
}
