// Spill vultures — CH-14's open-lane half. A violence-spilled freight pod is an
// opportunity another pilot can see: scavenger skiffs converge from outside work
// range (the approach is the tell), race the player — and each other — to the
// pods, and fly out with whatever they grabbed. A laden vulture killed spills its
// stolen hold through the ordinary kill-cargo path (data.cargo.items).
//
// Ownership mirrors charonSalvageSupply: traffic.js owns the wiring, this module
// owns its own hulls' steer language (data.intent) and lifecycle. Entirely
// transient — no save schema, no durable records. Deterministic: every timing
// rides state.simTime and hash32 over the run seed; never wall time, never
// ambient randomness. Custody is respected: a pod with title (freight custody
// annotation, the player's own jettison, an active pickup embargo, or a
// player-collect-only mark) is never taken — the raid script, the claim owners
// and the law intake keep their seams.

import { hash32 } from '../core/rng.js';
import { syncEntitySectorMembership } from '../core/coreSystem.js';
import { sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { finiteWholePickupAmount } from '../core/pickupAcceptance.js';

const SEED_OF = (state) => (state && state.meta && state.meta.seed >>> 0) || 1;

const MAX_OPPORTUNITIES = 2;
const OPP_TTL_S = 90;
const CLAIM_RADIUS_WU = 26;
const RING_MIN_WU = 1100;
const RING_SPREAD_WU = 550;
const DEPART_RING_WU = 1500;
const HOLD_CAP_UNITS = 8;
const HARRY_S = 4.5;
const RIVAL_RICH_QTY = 6;
const MERGE_RADIUS_WU = 300;

// A panic jettison is the hauler's own appeasement dump — the raid script owns
// that story. Vultures answer violence: gunfire, battle damage, a breached hold.
const VIOLENCE_CAUSE = /combat|shipjack|breach|fire|damage/;

const live = (state, id) => {
  const entity = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
  return entity && entity.alive !== false ? entity : null;
};

const tables = new WeakMap();
function book(state) {
  let entry = tables.get(state);
  if (!entry) {
    entry = { opps: [], vultures: new Map() };
    tables.set(state, entry);
  }
  return entry;
}

export function ownsSpillVultureHull(state, entity) {
  return !!(entity && entity.data && entity.data.spillVulture);
}

function oppById(state, oppId) {
  return book(state).opps.find((opp) => opp && opp.id === oppId) || null;
}

function livePods(state, opp) {
  const out = [];
  for (const id of opp.podIds) {
    const pod = live(state, id);
    if (pod) out.push(pod);
  }
  return out;
}

function clusterCenter(state, opp) {
  const pods = livePods(state, opp);
  if (!pods.length) return { x: opp.x, z: opp.z };
  let x = 0, z = 0;
  for (const pod of pods) { x += pod.pos.x; z += pod.pos.z; }
  return { x: x / pods.length, z: z / pods.length };
}

function pruneExpired(state, now) {
  const b = book(state);
  for (let i = b.opps.length - 1; i >= 0; i--) {
    const opp = b.opps[i];
    const stale = now - opp.firstT > OPP_TTL_S
      || (!livePods(state, opp).length && !opp.vultureIds.some((id) => live(state, id)));
    if (!stale) continue;
    for (const id of opp.vultureIds) {
      const vulture = live(state, id);
      if (vulture) retireVulture(vulture);
      b.vultures.delete(id);
    }
    b.opps.splice(i, 1);
  }
}

function registerOpportunity(o, payload) {
  const state = o.state;
  const sectorId = state.world && state.world.currentSectorId;
  if (!sectorId || !payload || !Array.isArray(payload.podIds) || !payload.podIds.length) return false;
  if (payload.sectorId && payload.sectorId !== sectorId) return false;
  if (!VIOLENCE_CAUSE.test(String(payload.cause || ''))) return false;

  const b = book(state);
  const now = Number(state.simTime) || 0;
  const carrier = live(state, payload.carrierId);
  const firstPod = live(state, payload.podIds[0]);
  const pos = firstPod ? { x: firstPod.pos.x, z: firstPod.pos.z }
    : carrier ? { x: carrier.pos.x, z: carrier.pos.z } : null;
  if (!pos) return false;

  // A second line off the same wreck joins the one convergence already forming.
  const existing = b.opps.find((opp) => opp.sectorId === sectorId
    && opp.commodityId === payload.commodityId
    && Math.hypot(opp.x - pos.x, opp.z - pos.z) <= MERGE_RADIUS_WU);
  if (existing) {
    for (const id of payload.podIds) if (!existing.podIds.includes(id)) existing.podIds.push(id);
    existing.qtyTotal += Number(payload.qty) || 0;
    existing.firstT = now;
    return true;
  }

  pruneExpired(state, now);
  if (b.opps.length >= MAX_OPPORTUNITIES) {
    // The oldest convergence folds before a fresh one is minted — bounded, FIFO.
    const oldest = b.opps.shift();
    for (const id of oldest.vultureIds) {
      const vulture = live(state, id);
      if (vulture) retireVulture(vulture);
      b.vultures.delete(id);
    }
  }
  const seed = SEED_OF(state);
  b.opps.push({
    id: `spill_vultures_${hash32(seed, 'spill-opp', sectorId, payload.podIds[0], Math.round(now * 10)).toString(36)}`,
    sectorId,
    x: pos.x,
    z: pos.z,
    commodityId: payload.commodityId || null,
    qtyTotal: Number(payload.qty) || 0,
    ownerId: payload.ownerId || null,
    ownerName: payload.ownerName || null,
    podIds: payload.podIds.slice(0, 6),
    vultureIds: [],
    waves: 0,
    firstT: now,
    dispatchAt: now + 3.5 + (hash32(seed, 'spill-delay', payload.podIds[0]) % 45) / 10,
    playerScooped: false,
    harried: false,
  });
  return true;
}

function spawnVulture(o, opp, slot) {
  const state = o.state;
  const seed = SEED_OF(state);
  const angle = (hash32(seed, 'vulture-arr', opp.id, slot) % 628) / 100;
  // The skiff arrives from outside work range and flies in — never materialized
  // on top of the pods. A ring point that falls out of the sector folds inward.
  let radius = RING_MIN_WU + (hash32(seed, 'vulture-ring', opp.id, slot) % RING_SPREAD_WU);
  let pos = null;
  for (let attempt = 0; attempt < 3 && !pos; attempt++) {
    const candidate = {
      x: opp.x + Math.cos(angle) * radius,
      z: opp.z + Math.sin(angle) * radius,
    };
    if (sectorMembershipAtGlobal(candidate) === opp.sectorId) pos = candidate;
    else radius *= 0.55;
  }
  if (!pos) return null;

  const archetype = hash32(seed, 'vulture-kind', opp.id, slot) % 2 === 0
    ? 'wasp_swarmer' : 'reaver_pirate';
  const entity = o.helpers && typeof o.helpers.spawnEntity === 'function'
    ? o.helpers.spawnEntity({
      type: 'ship',
      team: 1,
      pos: { x: pos.x, z: pos.z },
      vel: { x: 0, z: 0 },
      rot: angle + Math.PI,
      radius: 8,
      mass: 14,
      hull: 48,
      hullMax: 48,
      factionId: 'faction_reach',
      data: {
        defId: archetype === 'reaver_pirate' ? 'ship_corsair' : 'ship_wasp',
        shipClass: 'fighter',
        // Deliberately NO trafficRole (the wreck ecology's precedent): traffic's
        // adoption must never claim this hull or mint it a phantom manifest.
        role: 'scavenger',
        // The ordinary kill-spill schema: a laden vulture that dies scatters its
        // stolen hold through the shipped kill-reward path — no special case.
        cargo: { items: {} },
        spillVulture: {
          oppId: opp.id,
          slot,
          state: 'converge',
          holdQty: 0,
          harried: false,
          harryUntil: 0,
        },
        ai: {
          doctrine: 'scavenger',
          archetype: 'reaver',
          motive: 'spill_scavenge',
          engagementTrigger: 'spill_claim',
          zoneId: opp.sectorId,
          passive: true,
        },
      },
    }) : null;
  if (!entity) return null;
  entity.homeSectorId = opp.sectorId;
  if (entity.data) {
    entity.data.homeSectorId = opp.sectorId;
    if (entity.data.sectorId == null) entity.data.sectorId = opp.sectorId;
  }
  syncEntitySectorMembership(state && state.entityIndex, entity);
  book(state).vultures.set(entity.id, opp.id);
  opp.vultureIds.push(entity.id);
  return entity;
}

// Shared NPC steer language: local-frame move axes plus an aim angle. While the
// vulture works, this module owns the hull's intent.
function steer(entity, target, holdPosition = false) {
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = {});
  const dx = target.x - entity.pos.x;
  const dz = target.z - entity.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const cf = Math.cos(entity.rot || 0);
  const sf = Math.sin(entity.rot || 0);
  if (holdPosition) {
    intent.moveX = 0;
    intent.moveZ = 0;
  } else {
    intent.moveZ = Math.max(-1, Math.min(1, cf * ux + sf * uz));
    intent.moveX = Math.max(-1, Math.min(1, -sf * ux + cf * uz));
  }
  intent.aimAngle = Math.atan2(dz, dx);
  intent.fire = false;
}

function emit(o, event, payload) {
  if (o.bus && typeof o.bus.emit === 'function') {
    try { o.bus.emit(event, payload); } catch { /* a listener must not corrupt the run */ }
  }
}

function retireVulture(entity) {
  const work = entity.data && entity.data.spillVulture;
  if (work) work.state = 'gone';
  entity.alive = false;
}

// Despawn is silent: the getaway line already spoke on the turn (the bark seam
// needs a live hull), so the ring exit itself carries no event.
function releaseVulture(o, entity) {
  const state = o.state;
  const work = entity.data && entity.data.spillVulture;
  if (work) work.state = 'gone';
  entity.alive = false;
  book(state).vultures.delete(entity.id);
}

function stepVulture(o, opp, entity, now) {
  const work = entity.data && entity.data.spillVulture;
  if (!work) return false;
  const center = clusterCenter(o.state, opp);
  const dist = Math.hypot(entity.pos.x - center.x, entity.pos.z - center.z);

  // A convergence can die under a skiff still inbound: if the field is swept
  // while it flies, the take (or its absence) decides the turn now, not an
  // orbit around an empty point.
  if (work.state === 'converge' || work.state === 'claim') {
    const pods = livePods(o.state, opp);
    if (!pods.length && work.holdQty > 0) {
      work.state = 'depart';
      emit(o, 'vultures:departed', {
        entityId: entity.id,
        oppId: opp.id,
        sectorId: opp.sectorId,
        holdQty: work.holdQty,
        hold: cloneHold(entity),
        t: now,
      });
    } else if (!pods.length && work.holdQty <= 0) {
      releaseVulture(o, entity);
      return false;
    }
  }

  if (work.state === 'harry') {
    if (now >= work.harryUntil) { work.state = 'claim'; }
    else {
      const player = live(o.state, o.state.playerId);
      if (player) steer(entity, player.pos);
      else work.state = 'claim';
      return true;
    }
  }

  if (work.state === 'converge') {
    if (dist <= CLAIM_RADIUS_WU * 3) work.state = 'claim';
    steer(entity, center);
    return true;
  }

  if (work.state === 'claim') {
    const pods = livePods(o.state, opp);
    if (work.holdQty >= HOLD_CAP_UNITS || (!pods.length && work.holdQty > 0)) {
      // The turn outward IS the getaway tell: the departure line lands on the
      // turn, while the hull is still in view and its hold is what it carries.
      work.state = 'depart';
      emit(o, 'vultures:departed', {
        entityId: entity.id,
        oppId: opp.id,
        sectorId: opp.sectorId,
        holdQty: work.holdQty,
        hold: cloneHold(entity),
        t: now,
      });
    } else if (!pods.length) {
      // Nothing left to take and nothing aboard: the sky is empty, fold quietly.
      releaseVulture(o, entity);
      return false;
    } else {
      // Work the cluster: closest live pod. Physics asks contact collectors
      // through the ordinary seam; the receipt listener settles the take.
      let nearest = pods[0];
      let best = Infinity;
      for (const pod of pods) {
        const d = Math.hypot(pod.pos.x - entity.pos.x, pod.pos.z - entity.pos.z);
        if (d < best) { best = d; nearest = pod; }
      }
      steer(entity, nearest.pos);
    }
    return true;
  }

  if (work.state === 'depart') {
    const away = {
      x: center.x + Math.cos(work.exitAngle || 0) * DEPART_RING_WU,
      z: center.z + Math.sin(work.exitAngle || 0) * DEPART_RING_WU,
    };
    steer(entity, away);
    if (dist >= DEPART_RING_WU) releaseVulture(o, entity);
    return true;
  }
  return true;
}

function cloneHold(entity) {
  const items = entity.data && entity.data.cargo && entity.data.cargo.items;
  const out = {};
  if (items) for (const id of Object.keys(items)) out[id] = items[id];
  return out;
}

export function stepSpillVultures(o) {
  const state = o.state;
  if (!state || !state.world) return false;
  const sectorId = state.world.currentSectorId;
  const now = Number(state.simTime) || 0;
  const b = book(state);
  pruneExpired(state, now);
  for (const opp of b.opps) {
    if (opp.sectorId !== sectorId) continue;
    // Step live vultures; release references to hulls residency already ate.
    for (let i = opp.vultureIds.length - 1; i >= 0; i--) {
      const id = opp.vultureIds[i];
      const entity = live(state, id);
      if (!entity) { opp.vultureIds.splice(i, 1); b.vultures.delete(id); continue; }
      stepVulture(o, opp, entity, now);
    }
    if (opp.vultureIds.length) continue;
    if (now < opp.dispatchAt) continue;
    if (!livePods(state, opp).length) continue;
    // One replacement wave at most: a convergence wiped twice stays wiped, so a
    // player who clears the field is not farm for endless skiffs.
    if (opp.waves >= 2) continue;
    // Dispatch: a rich spill draws a rival as well as a claimant — the two
    // jostle for the same pods, and the player can out-fly either.
    const count = opp.qtyTotal >= RIVAL_RICH_QTY ? 2 : 1;
    opp.waves += 1;
    for (let slot = 0; slot < count; slot++) {
      const entity = spawnVulture(o, opp, slot);
      if (!entity) continue;
      const work = entity.data.spillVulture;
      work.exitAngle = Math.atan2(entity.pos.z - opp.z, entity.pos.x - opp.x);
      emit(o, 'vultures:dispatch', {
        entityId: entity.id,
        oppId: opp.id,
        sectorId,
        commodityId: opp.commodityId,
        qty: opp.qtyTotal,
        rivals: count,
        t: now,
      });
    }
  }
  return true;
}

export function spillVulturesPickupReceipt(o, payload) {
  const state = o.state;
  if (!state || !payload) return false;
  const collector = payload.collectorId != null ? live(state, payload.collectorId) : null;

  if (collector && collector.data && collector.data.spillVulture) {
    const podData = state.entities.get(payload.pickupId)?.data;
    // Titled pods keep their owners: the raid script's custody, the player's own
    // jettison (its embargo and law intake own those seams), reserved lots.
    if (!podData
      || podData.freightCustodyPod
      || podData.playerCollectOnly === true
      || podData.playerJettisonOrigin
      || (Number(podData.pickupEmbargoUntil) || 0) > (Number(state.simTime) || 0)) return false;
    const qty = finiteWholePickupAmount(payload.amount);
    if (!(qty > 0)) return false;
    payload.acceptedAmount = qty;
    payload.rejectedAmount = 0;
    const work = collector.data.spillVulture;
    const hold = collector.data.cargo && collector.data.cargo.items;
    if (hold && payload.commodityId) {
      hold[payload.commodityId] = (Math.floor(Number(hold[payload.commodityId]) || 0)) + qty;
    }
    if (work) {
      work.holdQty += qty;
      const opp = oppById(state, work.oppId);
      if (opp && !opp.podIds.includes(payload.pickupId)) opp.podIds.push(payload.pickupId);
    }
    emit(o, 'vultures:claimed', {
      entityId: collector.id,
      commodityId: payload.commodityId || null,
      qty,
      holdQty: work ? work.holdQty : qty,
      t: Number(state.simTime) || 0,
    });
    return true;
  }

  // The player out-flew the claimant to a pod: the nearest working vulture makes
  // one warning pass — bounded, once per convergence, never a second queue of aggression.
  if (payload.collectorId === state.playerId) {
    const now = Number(state.simTime) || 0;
    for (const opp of book(state).opps) {
      if (opp.harried || !opp.podIds.includes(payload.pickupId)) continue;
      const vulture = opp.vultureIds.map((id) => live(state, id))
        .find((entity) => entity && entity.data && entity.data.spillVulture
          && entity.data.spillVulture.state !== 'depart');
      if (!vulture) continue;
      opp.harried = true;
      const work = vulture.data.spillVulture;
      work.state = 'harry';
      work.harried = true;
      work.harryUntil = now + HARRY_S;
      emit(o, 'vultures:race', {
        entityId: vulture.id,
        oppId: opp.id,
        t: now,
      });
      return true;
    }
  }
  return false;
}

export function spillVulturesDestroyed(o, payload) {
  const state = o.state;
  const entity = payload && payload.entity;
  if (!state || !entity || !entity.data || !entity.data.spillVulture) return false;
  // Shelving, sector teardown and save restores are releases, not deaths: the
  // kill path (killRewards) only runs for real destruction, so anything else
  // must drop the reference without pretending the hold spilled.
  book(state).vultures.delete(entity.id);
  const work = entity.data.spillVulture;
  const opp = oppById(state, work.oppId);
  if (opp) {
    opp.vultureIds = opp.vultureIds.filter((id) => id !== entity.id);
    // A contested spill the player just cleared does not refill instantly: the
    // replacement wave (one at most) launches on this delay.
    opp.dispatchAt = (Number(state.simTime) || 0) + 18;
  }
  return true;
}

export function releaseSpillVultures(o) {
  const state = o.state;
  if (!state) return false;
  const b = book(state);
  for (const [id, oppId] of b.vultures) {
    const opp = oppById(state, oppId);
    if (opp) opp.vultureIds = [];
    const entity = live(state, id);
    if (entity) {
      if (entity.data) entity.data.spillVulture = null;
      entity.alive = false;
    }
  }
  b.vultures.clear();
  b.opps.length = 0;
  return true;
}

export function spillVulturesSpillReceipt(o, payload) {
  const state = o.state;
  if (!state || !payload) return false;
  return registerOpportunity(o, payload);
}
