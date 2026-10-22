// faction_fulfillment.js — W-FULFILLMENT (build_map §34.5 row 518, bible 02 §11).
//
// The Fulfillment is the thesis made into a machine: autonomous trains on fixed routes,
// forever fulfilling every order ever placed. Done-when:
//   · re-router haulers on fixed routes — constant speed, they never deviate, never fire first
//   · hitchhiking (E-25): latch a hauler and it tows you across the sector
//   · derailment (E-24): enough mass off the line spills backordered goods; escorts re-rail
//   · Administrative Boarding (E-19): a white pod files your cargo into an open order
//   · Order #0000001 (E-20): the oldest open order closes — Sump's broom — and the
//     oldest-open-order counter visibly advances
//
// Deterministic: routes, rerails and filing read simTime and state.rng only.

import {
  FULFILLMENT_ROUTES,
  FULFILLMENT_DERAIL,
  FULFILLMENT_HITCHHIKE,
  FULFILLMENT_BOARDING,
  FULFILLMENT_ORDER_ONE,
  FULFILLMENT_BARKS,
  fulfillmentOrderLabel,
} from '../data/factions/fulfillment.js';
import { removeCargo } from './cargo.js';

const FACTION_ID = 'faction_fulfillment';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const speedOf = (e) => Math.hypot(e.vel?.x || 0, e.vel?.z || 0);

/** Fresh serializable Fulfillment record: trains, derailments, the open-order ledger. */
export function ensureFulfillmentState(state) {
  if (!state.fulfillment || typeof state.fulfillment !== 'object') {
    state.fulfillment = {
      trains: {}, orders: {}, nextOrderSeq: 2, hitchedTrainId: null,
    };
  }
  const f = state.fulfillment;
  if (!f.trains || typeof f.trains !== 'object') f.trains = {};
  if (!f.orders || typeof f.orders !== 'object') f.orders = {};
  if (!Number.isInteger(f.nextOrderSeq) || f.nextOrderSeq < 2) f.nextOrderSeq = 2;
  // Order #0000001 is always on the ledger until it closes (E-20).
  if (!f.orders[FULFILLMENT_ORDER_ONE.seq]) {
    f.orders[FULFILLMENT_ORDER_ONE.seq] = {
      seq: FULFILLMENT_ORDER_ONE.seq,
      item: FULFILLMENT_ORDER_ONE.item,
      destination: FULFILLMENT_ORDER_ONE.destination,
      addressee: FULFILLMENT_ORDER_ONE.addressee,
      failedYears: FULFILLMENT_ORDER_ONE.failedYears,
      status: 'open', origin: 'original',
    };
  }
  return f;
}

export function routeById(routeId) {
  return FULFILLMENT_ROUTES.routes[routeId] || null;
}

/** The smallest open order seq — the counter the world watches tick. */
export function oldestOpenOrderSeq(state) {
  const f = ensureFulfillmentState(state);
  let best = null;
  for (const key of Object.keys(f.orders)) {
    const o = f.orders[key];
    if (o && o.status === 'open' && (best == null || o.seq < best)) best = o.seq;
  }
  return best;
}

export function oldestOpenOrderLabel(state) {
  const seq = oldestOpenOrderSeq(state);
  return seq == null ? '#———————' : fulfillmentOrderLabel(seq);
}

/** Spawn a re-router hauler on a route leg. Returns the entity. The hauler enters at the
 * previous waypoint so legIndex is the waypoint it is visibly heading to from tick one. */
export function spawnHauler(state, helpers, { routeId, legIndex = 0, orderCrateSeq = null, role = 're-router-hauler' }) {
  const route = routeById(routeId);
  if (!route) return null;
  const n = route.waypoints.length;
  const prev = route.waypoints[((legIndex - 1) % n + n) % n];
  const e = helpers.spawnEntity({
    type: 'ship', team: 1, factionId: FACTION_ID,
    pos: { x: prev.x, z: prev.z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 26, mass: 300, hull: 1e9, hullMax: 1e9, collides: true,
    data: {
      fulfillmentTrain: true, routeId, legIndex,
      role, name: 'Re-router Hauler', scannable: true,
      scanLabel: `FULFILLMENT TRAIN · ${routeId} · fixed route · never fires first`,
      roe: 'never_first',
    },
  });
  if (orderCrateSeq != null) e.data.orderCrate = { orderSeq: orderCrateSeq };
  ensureFulfillmentState(state).trains[e.id] = {
    routeId, legIndex, derailed: false, rerailAt: null, spills: 0,
  };
  return e;
}

export const fulfillmentRoutes = {
  name: 'fulfillmentRoutes',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    ensureFulfillmentState(this.state);
  },

  _trainRec(state, e) {
    const f = ensureFulfillmentState(state);
    const d = e.data.fulfillmentTrain === true ? e.data : null;
    if (!d) return null;
    const rec = f.trains[e.id] || (f.trains[e.id] = {
      routeId: d.routeId, legIndex: d.legIndex | 0, derailed: false, rerailAt: null, spills: 0,
    });
    return rec;
  },

  /** Fixed-route drive: constant speed on the leg line; it never deviates. Trains are
   * kinematic rails — "moving terrain" — so the system integrates their pose itself and
   * no physics impulse can argue with the route. */
  _driveTrain(state, e, rec, dt) {
    const route = routeById(rec.routeId);
    if (!route || rec.derailed) { if (rec.derailed) { e.vel.x = 0; e.vel.z = 0; } return; }
    const wps = route.waypoints, n = wps.length;
    const target = wps[rec.legIndex % n];
    const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= FULFILLMENT_ROUTES.arriveRadius) {
      rec.legIndex = (rec.legIndex + 1) % n;
      if (route.loop !== true && rec.legIndex === 0) rec.legIndex = n - 1;
      e.data.legIndex = rec.legIndex;
      return;
    }
    const ux = dx / d, uz = dz / d;
    e.vel.x = ux * route.speed;
    e.vel.z = uz * route.speed;
    e.pos.x += e.vel.x * dt;
    e.pos.z += e.vel.z * dt;
    // Line lock: pull the hull back onto the leg segment so bumps never read as a turn.
    const prev = wps[((rec.legIndex - 1) % n + n) % n];
    const lx = target.x - prev.x, lz = target.z - prev.z;
    const len2 = lx * lx + lz * lz;
    if (len2 > 0) {
      const t = Math.max(0, Math.min(1, ((e.pos.x - prev.x) * lx + (e.pos.z - prev.z) * lz) / len2));
      const px = prev.x + lx * t, pz = prev.z + lz * t;
      const k = Math.min(1, FULFILLMENT_ROUTES.lineLockStrength);
      e.pos.x += (px - e.pos.x) * k;
      e.pos.z += (pz - e.pos.z) * k;
    }
  },

  /** E-24: enough incoming mass at enough speed knocks the train off the line. */
  _checkDerail(state, e, rec) {
    if (rec.derailed) {
      if (state.simTime >= rec.rerailAt) this._rerail(state, e, rec);
      return;
    }
    for (const body of state.entityList) {
      if (body === e || !body || body.alive === false || body.factionId === FACTION_ID) continue;
      if (body.data?.fulfillmentTrain || body.type === 'garden') continue;
      const mass = Number(body.mass) || 0;
      if (mass < FULFILLMENT_DERAIL.impactMassMin) continue;
      const rr = e.radius + (Number(body.radius) || 0) + 4;
      if (dist2(body.pos, e.pos) > rr * rr) continue;
      const rel = Math.hypot((body.vel?.x || 0) - (e.vel?.x || 0), (body.vel?.z || 0) - (e.vel?.z || 0));
      if (rel < FULFILLMENT_DERAIL.impactSpeedMin) continue;
      this._derail(state, e, rec, body);
      return;
    }
  },

  _derail(state, e, rec, body) {
    rec.derailed = true;
    rec.spills += 1;
    const escortNear = this._escortNear(state, e);
    rec.rerailAt = state.simTime + (escortNear ? FULFILLMENT_DERAIL.rerailWithEscortS : FULFILLMENT_DERAIL.rerailAloneS);
    e.vel.x = 0; e.vel.z = 0;
    e.data.derailed = true;
    this._spill(state, e, rec);
    // The Clerk's crate is a physical drop — derailing it is how E-20 becomes deliverable.
    if (e.data.orderCrate) {
      const seq = e.data.orderCrate.orderSeq;
      this.helpers.spawnEntity({
        type: 'cargo_pod', team: 0,
        pos: { x: e.pos.x + 30, z: e.pos.z + 10 }, vel: { x: 6, z: -4 },
        radius: 10, mass: 8, hull: 40, hullMax: 40, collides: true,
        data: {
          orderCrateSeq: seq, name: `Order ${fulfillmentOrderLabel(seq)} Crate`,
          scanLabel: `ORDER ${fulfillmentOrderLabel(seq)} · ${FULFILLMENT_ORDER_ONE.itemLabel} · addressed to ${FULFILLMENT_ORDER_ONE.destination}`,
          scannable: true,
        },
      });
      delete e.data.orderCrate;
    }
    this.bus.emit('fulfillment:derailed', {
      trainId: e.id, routeId: rec.routeId, byId: body.id, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: FULFILLMENT_BARKS.derail, speaker: 'Fulfillment' });
    this.bus.emit('toast', { text: 'DERAILMENT — backordered goods in the lane', tone: 'info' });
  },

  _rerail(state, e, rec) {
    rec.derailed = false;
    rec.rerailAt = null;
    e.data.derailed = false;
    this.bus.emit('fulfillment:rerailed', { trainId: e.id, routeId: rec.routeId, tick: state.tick });
    this.bus.emit('comms:log', { text: FULFILLMENT_BARKS.rerail, speaker: 'Fulfillment' });
  },

  _escortNear(state, e) {
    const r2 = FULFILLMENT_DERAIL.escortScanR * FULFILLMENT_DERAIL.escortScanR;
    for (const s of state.entityList) {
      if (s === e || !s || s.alive === false || s.factionId !== FACTION_ID) continue;
      if (dist2(s.pos, e.pos) <= r2) return true;
    }
    return false;
  },

  /** The loot pinata: decades-old backordered goods scatter on seeded arcs. */
  _spill(state, e, rec) {
    const count = FULFILLMENT_DERAIL.spillPodsMin
      + Math.floor(state.rng() * (FULFILLMENT_DERAIL.spillPodsMax - FULFILLMENT_DERAIL.spillPodsMin + 1));
    for (let i = 0; i < count; i++) {
      const a = state.rng() * Math.PI * 2;
      const r = FULFILLMENT_DERAIL.spillScatterR * (0.4 + state.rng() * 0.6);
      this.helpers.spawnEntity({
        type: 'cargo_pod', team: 0,
        pos: { x: e.pos.x + Math.cos(a) * r, z: e.pos.z + Math.sin(a) * r },
        vel: { x: Math.cos(a) * FULFILLMENT_DERAIL.spillSpeed, z: Math.sin(a) * FULFILLMENT_DERAIL.spillSpeed },
        radius: 8, mass: 6, hull: 30, hullMax: 30, collides: true,
        data: {
          backorderedGood: true, rarity: FULFILLMENT_DERAIL.goodRarity,
          name: 'Backordered Goods', scannable: true,
          scanLabel: `BACKORDERED GOODS · filed ${10 + Math.floor(state.rng() * 15)} years ago · rarity ${FULFILLMENT_DERAIL.goodRarity}`,
          lootValue: 90 + Math.floor(state.rng() * 400),
        },
      });
    }
  },

  /** E-25: a latched hauler tows the player down its own fixed route. */
  _hitchhike(state) {
    const f = ensureFulfillmentState(state);
    const player = state.entities.get(state.playerId);
    const tether = state.player?.tether;
    const train = tether && tether.active ? state.entities.get(tether.targetId) : null;
    const riding = player && player.alive !== false && train && train.alive !== false
      && train.data?.fulfillmentTrain === true && !f.trains[train.id]?.derailed;
    if (riding) {
      player.vel.x = train.vel.x;
      player.vel.z = train.vel.z;
      if (f.hitchedTrainId !== train.id) {
        f.hitchedTrainId = train.id;
        this.bus.emit('fulfillment:hitchhike', { trainId: train.id, routeId: train.data.routeId, tick: state.tick });
        this.bus.emit('toast', { text: 'HITCHHIKE — riding the route', tone: 'info' });
        this.bus.emit('comms:log', { text: FULFILLMENT_HITCHHIKE.boardLine, speaker: 'Fulfillment' });
      }
    } else if (f.hitchedTrainId != null) {
      f.hitchedTrainId = null;
      this.bus.emit('comms:log', { text: FULFILLMENT_HITCHHIKE.alightLine, speaker: 'Fulfillment' });
    }
  },

  /** E-19 Administrative Boarding: approach → attach → file cargo into an open order. */
  _boarding(state, e, dt) {
    const pod = e.data.fulfillmentBoardingPod;
    const player = state.entities.get(state.playerId);
    if (!pod || !player || player.alive === false) return;
    const B = FULFILLMENT_BOARDING;
    const speed = speedOf(e);
    if (pod.phase !== 'flung' && pod.phase !== 'depart' && speed > B.flingSpeed) {
      pod.phase = 'flung';
      this.bus.emit('fulfillment:boardingFlung', { podId: e.id, tick: state.tick });
      this.bus.emit('comms:log', { text: B.flungLine, speaker: 'Fulfillment' });
    }
    if (pod.phase === 'approach') {
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      e.vel.x = (dx / d) * B.podSpeed;
      e.vel.z = (dz / d) * B.podSpeed;
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      if (d <= B.dockRadius) {
        pod.phase = 'filing';
        pod.filingUntil = state.simTime + B.filingTimeS;
        this.bus.emit('fulfillment:boardingDocked', { podId: e.id, tick: state.tick });
        this.bus.emit('comms:log', { text: B.approachLine, speaker: 'Fulfillment' });
      }
    } else if (pod.phase === 'filing') {
      e.vel.x = player.vel.x; e.vel.z = player.vel.z;
      e.pos.x = player.pos.x + player.radius + e.radius * 0.5;
      e.pos.z = player.pos.z;
      if (state.simTime >= pod.filingUntil) {
        this._fileCargo(state, pod);
        pod.phase = 'depart';
      }
    } else if (pod.phase === 'depart' || pod.phase === 'flung') {
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      e.vel.x = (dx / d) * B.podSpeed;
      e.vel.z = (dz / d) * B.podSpeed;
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      if (d > 1200) this.helpers.removeEntity(e.id, { reason: 'fulfillment_pod_departed' });
    }
  },

  /** Filed cargo becomes an open order — recoverable at the order's address. */
  _fileCargo(state, pod) {
    const f = ensureFulfillmentState(state);
    const items = state.player?.cargo?.items || {};
    let remaining = FULFILLMENT_BOARDING.cargoUnitsFiled;
    const filed = {};
    for (const id of Object.keys(items)) {
      if (remaining <= 0) break;
      const took = removeCargo(state, id, remaining);
      if (took > 0) { filed[id] = took; remaining -= took; }
    }
    const seq = f.nextOrderSeq++;
    f.orders[seq] = {
      seq, status: 'open', origin: 'administrative_boarding',
      filedItems: filed, address: `route depot ${seq}`,
      filedAt: state.simTime,
    };
    this.bus.emit('fulfillment:cargoFiled', { podSeq: pod.orderSeq, orderSeq: seq, filed, tick: state.tick });
    this.bus.emit('comms:log', { text: FULFILLMENT_BOARDING.filedLine, speaker: 'Fulfillment' });
    this.bus.emit('toast', {
      text: `ORDER ${fulfillmentOrderLabel(seq)} OPENED — cargo filed to ${f.orders[seq].address}`,
      tone: 'warn',
    });
  },

  /**
   * E-20: deliver Order #0000001 (by hand, at the Pit). Closes the ticket, pays off in
   * Sump's broom, and the oldest-open-order counter visibly advances.
   */
  deliverOrderOne(state) {
    const f = ensureFulfillmentState(state);
    const order = f.orders[FULFILLMENT_ORDER_ONE.seq];
    if (!order || order.status !== 'open') return false;
    order.status = 'closed';
    order.closedAt = state.simTime;
    order.deliveredBy = state.playerId;
    // The counter ticks: a fresh open order takes the oldest slot's place in the queue.
    if (!f.orders[f.nextOrderSeq]) {
      f.orders[f.nextOrderSeq] = {
        seq: f.nextOrderSeq, status: 'open', origin: 'standing',
        filedItems: {}, address: `route depot ${f.nextOrderSeq}`,
      };
      f.nextOrderSeq += 1;
    }
    this.bus.emit('fulfillment:orderOneClosed', { seq: FULFILLMENT_ORDER_ONE.seq, tick: state.tick });
    this.bus.emit('comms:log', { text: FULFILLMENT_ORDER_ONE.closeLine, speaker: 'LOG' });
    this.bus.emit('toast', { text: FULFILLMENT_ORDER_ONE.payoffLine, tone: 'good' });
    return true;
  },

  update(dt, state) {
    ensureFulfillmentState(state);
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data) continue;
      if (e.data.fulfillmentTrain === true) {
        const rec = this._trainRec(state, e);
        this._checkDerail(state, e, rec);
        this._driveTrain(state, e, rec, dt);
      } else if (e.data.fulfillmentBoardingPod) {
        this._boarding(state, e, dt);
      }
    }
    this._hitchhike(state);
  },
};

export default fulfillmentRoutes;
