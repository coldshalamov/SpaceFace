// src/ai/lootSweep.js — FIGHT-15: clearing a raid's escort wing flips the survivors to looting.
//
// The escorts were the screen. When the last of them dies the surviving raid hulls stop trading
// fire for the fight's sake and run the physical sweep: each eligible survivor breaks off toward
// the nearest live loose spill pod, contact-collects it through the ordinary `pickup:collected`
// acceptance seam, then runs a finite leave leg and rides the ordinary actor lifecycle. The take
// is booked onto `ai.stolenLoot` — the durable custody shape ambientPredation already owns — so
// pursuit fire knocks the freight back out as real pods and a kill respills it; nothing enters a
// parallel cargo ledger.
//
// This is a listener and a rule, not a system. encounterDirector calls in from its squadKill
// routing (escort-wing-down check), its 1 Hz tick (errand bookkeeping), its `pickup:collected`
// subscription (the take receipt), and save:loaded (orphan-stamp sweep). Every physical write
// still belongs to the ordinary owners: physics detects the contact, the cargo pod entity is the
// freight, `ai.stolenLoot` is the ledger, ambientJettisonUnderPressure / ambientRaiderDestroyed
// already see it.
//
// Determinism: simTime / tick / stable entity ids only. No RNG draw (bark pick is a hash of
// seed+id). Save safety: the errand book is a WeakMap on GameState — never serialized. The
// hunter's `ai.lootSweep` stamp can ride an ai-bag across a save, so sweepStaleLootSweeps()
// releases every orphaned stamp on save:loaded (fail closed, same shape as podHunt).
//
// Not covered on purpose: hulls already under a flee/surrender order (pirateDisengage / parley /
// wingMorale own them), freight-custody pods (the convoy custody script and its stamped raider own
// those — a sweeping hull keeps to loose spill), survivor pods / orchard fruit / world-site
// salvage, pods under pickup embargo, pods on the player's tow line, and a pod the sweeping hull
// jettisoned itself.

import { hash32 } from '../core/rng.js';
import { podHuntBarkFor } from '../data/barks.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { ambientObjective } from './ambientPredation.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from './doctrine.js';

export const LOOT_SWEEP = Object.freeze({
  seekRadiusWu: 1400,     // a survivor will run this far for a pod — the spilled field, not the lane
  scanS: 14,              // hang-and-scan window when the spill is empty at flip time
  errandDeadlineS: 45,    // hard cap on the whole sweep — then the hull resumes its posture
  leaveS: 18,             // after a take the hull runs for the lane this long
  leaveRadiusWu: 1500,    // flee anchor distance from where the take happened
  contactPadWu: 6,        // contact range = hull radius + pod radius - 4 + this
  maxErrands: 6,          // concurrent sweeps in the sector — bounded
  hitEpsilon: 0.01,       // any real hull loss during the sweep ends it (self-defence)
});

// The two sweep barks live in the bark catalogue (src/data/barks.js POD_HUNT_BARKS), faction-voiced.
const BARK_BREAK = 'pirate_loot_sweep_break';
const BARK_TAKE = 'pirate_loot_sweep_take';

// Roles that can peel off to loot: the raid's own fighters and boss — never the dead screen's row,
// never a scripted hauler/pickup/target row.
const SWEEP_ROLES = new Set(['squad', 'raider', 'boss']);

const books = new WeakMap();

function book(state) {
  let b = books.get(state);
  if (!b) {
    b = { errands: {}, byPod: {} };
    books.set(state, b);
  }
  return b;
}

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function d2(a, b) {
  const dx = finite(a && a.x) - finite(b && b.x);
  const dz = finite(a && a.z) - finite(b && b.z);
  return dx * dx + dz * dz;
}

function say(ctx, { id, key, kind, factionId, hunterId }) {
  const seed = ctx.state.meta && ctx.state.meta.seed;
  const text = podHuntBarkFor(key, factionId, hash32(seed == null ? 0 : seed, hunterId, key));
  if (!text) return;
  const voice = ctx.helpers && ctx.helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({ channel: 'bark', text, kind, ttl: 4, id, key, factionId: factionId || 'faction_reach' });
  } else if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('toast', { text, kind, ttl: 4 });
  }
}

/**
 * A pod a sweeping hull may take: live loose spill — commodity freight or ore with a positive
 * amount, carrying no custody/title/mission marker that belongs to another owner. Freight custody
 * pods are excluded even though an outlaw may legally take one on contact: the custody script owns
 * their receipt.
 */
export function looseSweepPod(state, pod, hunter, now, opts = {}) {
  if (!pod || pod.alive === false || !pod.pos || !pod.data) return false;
  const d = pod.data;
  if (d.kind !== 'cargo' && d.kind !== 'ore') return false;
  if (!(Number(d.amount) > 0)) return false;
  if (d.freightCustodyPod || d.survivorPod || d.orchardId != null || d.worldSiteId != null) return false;
  if (d.playerCollectOnly === true) return false;
  if (Number(d.pickupEmbargoUntil) > finite(now)) return false;
  if (hunter && d.ownerId != null && d.ownerId === hunter.id) return false;
  if (opts.playerTowedPodId != null && opts.playerTowedPodId === pod.id) return false;
  return true;
}

function nearestSweepPod(state, hunter, b, now, opts) {
  const reach2 = LOOT_SWEEP.seekRadiusWu * LOOT_SWEEP.seekRadiusWu;
  let best = null;
  let bestD2 = Infinity;
  // Jettisoned freight pods are `payload` bodies; loose ore/kill-loot chips are `pickup`s.
  for (const bucket of ['payloads', 'pickups']) {
    const list = indexedTypeScan(state, bucket);
    for (let i = 0; i < list.length; i++) {
      const pod = list[i];
      if (!pod || pod.id == null || b.byPod[pod.id] != null) continue;
      if (!looseSweepPod(state, pod, hunter, now, opts)) continue;
      const dist = d2(hunter.pos, pod.pos);
      if (dist > reach2) continue;
      if (dist < bestD2 || (dist === bestD2 && best && pod.id < best.id)) {
        best = pod;
        bestD2 = dist;
      }
    }
  }
  return best;
}

/** A live raid member that may peel off: fighter roles, same faction as the fallen screen, not
 * already under another owner's order. */
function eligibleSurvivor(state, live, entityId, factionId) {
  const role = live.roles && live.roles[entityId];
  if (!SWEEP_ROLES.has(role)) return null;
  const e = entityById(state, entityId);
  if (!e || e.alive === false || !e.pos || !e.data || !e.data.ai) return null;
  if (e.type !== 'ship' && e.type !== 'drone') return null;
  if (factionId != null && e.factionId !== factionId) return null;
  const ai = e.data.ai;
  if (ai.lootSweep || ai.podHunt) return null;
  // A hull the freight-custody owner already stamped (freightSweeperCustodyId) works that
  // record's pod ledger — the generic sweep never double-books a custody sweeper.
  if (e.data.freightSweeperCustodyId != null) return null;
  // A hull bound to an ambient-predation objective owns a custody ledger already — its own pod
  // list, pressure-shed, and respill. Hijacking it to sweep would corrupt that book.
  if (ambientObjective(e)) return null;
  if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.forceFlee === true || ai.pirateDisengaged === true) return null;
  return e;
}

function contactRange(hunter, pod) {
  return Math.max(1, finite(hunter.radius) + finite(pod.radius) - 4) + LOOT_SWEEP.contactPadWu;
}

function snapshotPosture(ai) {
  return {
    activity: ai.activity || null,
    roe: ai.roe == null ? null : ai.roe,
    forcePlayerTarget: ai.forcePlayerTarget === true,
    huntPlayer: ai.huntPlayer === true,
  };
}

function restorePosture(ai, snap) {
  const s = snap || {};
  if (s.activity) ai.activity = s.activity; else delete ai.activity;
  if (s.roe != null) ai.roe = s.roe; else delete ai.roe;
  if (s.forcePlayerTarget) ai.forcePlayerTarget = true;
  if (s.huntPlayer) ai.huntPlayer = true;
}

function assertSeekDoctrine(state, hunter, pod, rec) {
  setEntityDoctrine(hunter, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason: 'loot_sweep:seek',
      anchor: { x: pod.pos.x, z: pod.pos.z },
      leashRadius: LOOT_SWEEP.seekRadiusWu * 2,
      preferredRange: contactRange(hunter, pod),
      startedTick: state.tick | 0,
      deadlineTick: (state.tick | 0) + Math.ceil(LOOT_SWEEP.errandDeadlineS * 60),
      targetId: pod.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
  const ai = hunter.data.ai;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  rec.phase = 'seek';
  ai.lootSweep.phase = 'seek';
}

function assertScanDoctrine(state, hunter, rec) {
  setEntityDoctrine(hunter, {
    activity: {
      kind: ActivityKind.LOITER,
      reason: 'loot_sweep:scan',
      anchor: { x: hunter.pos.x, z: hunter.pos.z },
      leashRadius: 500,
      startedTick: state.tick | 0,
      deadlineTick: (state.tick | 0) + Math.ceil(LOOT_SWEEP.scanS * 60),
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
  const ai = hunter.data.ai;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
}

function startLeaving(ctx, b, rec, hunter, pod) {
  const { state } = ctx;
  const ai = hunter.data.ai;
  const now = finite(state.simTime);
  const player = entityById(state, state.playerId);
  const fromX = pod && pod.pos ? pod.pos.x : finite(player && player.pos && player.pos.x, hunter.pos.x);
  const fromZ = pod && pod.pos ? pod.pos.z : finite(player && player.pos && player.pos.z, hunter.pos.z);
  let dx = hunter.pos.x - fromX;
  let dz = hunter.pos.z - fromZ;
  let len = Math.hypot(dx, dz);
  if (!(len > 0.001)) {
    dx = Math.cos(finite(hunter.rot));
    dz = Math.sin(finite(hunter.rot));
    len = 1;
  }
  const tick = state.tick | 0;
  rec.phase = 'leave';
  rec.leaveUntil = now + LOOT_SWEEP.leaveS;
  ai.lootSweep.phase = 'leave';
  ai.lootSweep.podId = null;
  if (pod && b.byPod[pod.id] === hunter.id) delete b.byPod[pod.id];
  setEntityDoctrine(hunter, {
    activity: {
      kind: ActivityKind.FLEE,
      reason: 'loot_sweep:leave',
      anchor: {
        x: hunter.pos.x + (dx / len) * LOOT_SWEEP.leaveRadiusWu,
        z: hunter.pos.z + (dz / len) * LOOT_SWEEP.leaveRadiusWu,
      },
      leashRadius: LOOT_SWEEP.leaveRadiusWu * 1.5,
      startedTick: tick,
      deadlineTick: tick + Math.ceil(LOOT_SWEEP.leaveS * 60),
      targetId: null,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** Flip one survivor onto the sweep: park the fight posture, stamp the durable loot-sweep mark,
 * claim the nearest loose pod (or hold a scan while the field is empty), and speak once. */
function startErrand(ctx, b, live, hunter, now) {
  const { state } = ctx;
  const data = hunter.data || (hunter.data = {});
  const ai = data.ai || (data.ai = {});
  const combat = data.combat || (data.combat = {});
  const rec = {
    hunterId: hunter.id,
    liveId: live.id,
    factionId: hunter.factionId || null,
    podId: null,
    phase: 'scan',
    startedAt: now,
    deadlineAt: now + LOOT_SWEEP.errandDeadlineS,
    leaveUntil: null,
    lastHull: finite(hunter.hull),
    collected: 0,
    snapshot: snapshotPosture(ai),
  };
  b.errands[hunter.id] = rec;
  ai.lootSweep = {
    phase: 'scan',
    podId: null,
    liveId: live.id,
    collected: 0,
    posture: rec.snapshot,
  };
  // Aggro drops: the player is no longer this hull's business until the errand ends.
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;

  const pod = nearestSweepPod(state, hunter, b, now, ctx);
  if (pod) {
    rec.podId = pod.id;
    b.byPod[pod.id] = hunter.id;
    ai.lootSweep.podId = pod.id;
    assertSeekDoctrine(state, hunter, pod, rec);
  } else {
    assertScanDoctrine(state, hunter, rec);
  }
  if (typeof ctx.disarm === 'function') ctx.disarm(hunter);
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('encounter:lootSweepDispatched', {
      liveId: live.id,
      hunterId: hunter.id,
      podId: rec.podId,
      factionId: hunter.factionId || null,
      t: now,
    });
  }
  say(ctx, {
    id: `lootSweep:go:${hunter.id}`,
    kind: 'lootSweep',
    key: BARK_BREAK,
    hunterId: hunter.id,
    factionId: hunter.factionId,
  });
  return rec;
}

/** Give the hull back its pre-sweep posture. `restore:false` leaves a foreign owner's order alone. */
function endErrand(ctx, b, rec, { restore = true, reason = 'released' } = {}) {
  const { state } = ctx;
  const hunter = entityById(state, rec.hunterId);
  const now = finite(state.simTime);
  delete b.errands[rec.hunterId];
  if (rec.podId != null && b.byPod[rec.podId] === rec.hunterId) delete b.byPod[rec.podId];
  const ai = hunter && hunter.data && hunter.data.ai;
  if (ai && ai.lootSweep) {
    delete ai.lootSweep;
    if (restore) restorePosture(ai, rec.snapshot);
  }
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('encounter:lootSweepEnded', {
      liveId: rec.liveId, hunterId: rec.hunterId, reason, collected: rec.collected, t: now,
    });
  }
}

function tickErrand(ctx, b, rec, now) {
  const { state } = ctx;
  const hunter = entityById(state, rec.hunterId);
  if (!hunter || hunter.alive === false || !hunter.data || !hunter.data.ai) {
    delete b.errands[rec.hunterId];
    if (rec.podId != null && b.byPod[rec.podId] === rec.hunterId) delete b.byPod[rec.podId];
    return;
  }
  const ai = hunter.data.ai;
  if (!ai.lootSweep) {
    // The stamp went away without the book (another owner cleared it): the errand is over.
    delete b.errands[rec.hunterId];
    if (rec.podId != null && b.byPod[rec.podId] === rec.hunterId) delete b.byPod[rec.podId];
    return;
  }

  if (rec.phase === 'leave') {
    if (now >= rec.leaveUntil) endErrand(ctx, b, rec, { restore: false, reason: 'withdrew' });
    else if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.pirateDisengaged === true) {
      endErrand(ctx, b, rec, { restore: false, reason: 'foreign_order' });
    }
    return;
  }

  // Another owner (pirateDisengage / parley / wing morale) took the hull's orders: stand down
  // without restoring a weapons-free posture onto a hull that has been told to run.
  if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.forceFlee === true || ai.pirateDisengaged === true) {
    endErrand(ctx, b, rec, { restore: false, reason: 'foreign_order' });
    return;
  }
  // A hit during the sweep snaps the hull back to the fight — loot is not worth dying for.
  const hull = finite(hunter.hull);
  if (hull < rec.lastHull - LOOT_SWEEP.hitEpsilon) {
    endErrand(ctx, b, rec, { reason: 'under_fire' });
    return;
  }
  rec.lastHull = hull;

  if (now >= rec.deadlineAt) {
    if (rec.collected > 0) startLeaving(ctx, b, rec, hunter, entityById(state, rec.podId));
    else endErrand(ctx, b, rec, { reason: 'empty' });
    return;
  }

  if (rec.phase === 'seek') {
    const pod = entityById(state, rec.podId);
    if (!pod || !looseSweepPod(state, pod, hunter, now, ctx)) {
      // Collected by someone else first, despawned, or claimed: drop the claim and re-scan.
      if (rec.podId != null && b.byPod[rec.podId] === rec.hunterId) delete b.byPod[rec.podId];
      rec.podId = null;
      ai.lootSweep.podId = null;
      const next = nearestSweepPod(state, hunter, b, now, ctx);
      if (next) {
        rec.podId = next.id;
        b.byPod[next.id] = hunter.id;
        ai.lootSweep.podId = next.id;
        assertSeekDoctrine(state, hunter, next, rec);
      } else {
        rec.phase = 'scan';
        ai.lootSweep.phase = 'scan';
        assertScanDoctrine(state, hunter, rec);
      }
      return;
    }
    // The pod drifts: keep the doctrine anchor on its live position.
    const activity = ai.activity;
    if (!activity || activity.kind !== ActivityKind.TRANSIT || activity.targetId !== pod.id
      || !activity.anchor || activity.anchor.x !== pod.pos.x || activity.anchor.z !== pod.pos.z) {
      assertSeekDoctrine(state, hunter, pod, rec);
    }
    return;
  }

  // phase 'scan': hover the spill field; a late-dropping pod still gets taken.
  const pod = nearestSweepPod(state, hunter, b, now, ctx);
  if (pod) {
    rec.podId = pod.id;
    b.byPod[pod.id] = hunter.id;
    ai.lootSweep.podId = pod.id;
    assertSeekDoctrine(state, hunter, pod, rec);
  }
}

/**
 * Escort-wing-down entry point — the director calls this when a squadKill leaves a live record
 * with zero remaining escorts. Every surviving fighter of the fallen screen's faction peels onto
 * the spill; returns how many hulls took the errand.
 */
export function lootSweepOnEscortDown(ctx, live, escortFactionId) {
  if (!ctx || !ctx.state || !live || !Array.isArray(live.ids)) return 0;
  const { state } = ctx;
  const b = book(state);
  const now = finite(state.simTime);
  let dispatched = 0;
  for (const entityId of live.ids.slice()) {
    if (Object.keys(b.errands).length >= LOOT_SWEEP.maxErrands) break;
    const hunter = eligibleSurvivor(state, live, entityId, escortFactionId);
    if (!hunter) continue;
    startErrand(ctx, b, live, hunter, now);
    dispatched++;
  }
  return dispatched;
}

/** The director's 1 Hz tick — errand bookkeeping for every live sweep. */
export function tickLootSweeps(ctx) {
  if (!ctx || !ctx.state) return;
  const b = book(ctx.state);
  const now = finite(ctx.state.simTime);
  for (const hunterId of Object.keys(b.errands)) {
    tickErrand(ctx, b, b.errands[hunterId], now);
  }
}

/**
 * `pickup:collected` receipt writer — the sweeping hull's take books onto `ai.stolenLoot` (the
 * durable custody ledger pressure-shed and kill-respill already own) and the hull runs its leave
 * leg. Returns true when this listener wrote the receipt. Freight-custody and other titled pods
 * are left to their real owners — a sweeping hull keeps to loose spill.
 */
export function lootSweepPickupCollected(ctx, payload) {
  const p = payload || {};
  if (!ctx || !ctx.state || p.collectorId == null || p.pickupId == null) return false;
  const { state } = ctx;
  const collector = entityById(state, p.collectorId);
  const ai = collector && collector.data && collector.data.ai;
  const stamp = ai && ai.lootSweep;
  if (!stamp || stamp.phase === 'leave') return false;
  const pod = entityById(state, p.pickupId);
  const now = finite(state.simTime);
  if (!looseSweepPod(state, pod, collector, now, ctx)) return false;
  const qty = Math.max(0, Math.floor(Number(p.amount) || 0));
  if (!(qty > 0)) return false;
  p.acceptedAmount = qty;
  p.rejectedAmount = 0;

  const data = pod.data || {};
  if (!ai.stolenLoot || typeof ai.stolenLoot !== 'object') {
    ai.stolenLoot = {
      lines: [],
      victimId: data.stolenFromId != null ? data.stolenFromId : (data.ownerId != null ? data.ownerId : null),
      manifestId: data.manifestId != null ? data.manifestId : null,
    };
  }
  const loot = ai.stolenLoot;
  if (!Array.isArray(loot.lines)) loot.lines = [];
  const commodityId = p.commodityId || data.commodityId || null;
  const existing = loot.lines.find((line) => line && line.commodityId === commodityId);
  if (existing) existing.qty = (existing.qty | 0) + qty;
  else loot.lines.push({ commodityId, qty });

  stamp.collected = (stamp.collected | 0) + qty;
  const b = book(state);
  const rec = b.errands[collector.id];
  if (rec) {
    rec.collected = stamp.collected;
    if (rec.podId != null && b.byPod[rec.podId] === collector.id) delete b.byPod[rec.podId];
    rec.podId = null;
    startLeaving(ctx, b, rec, collector, pod);
  }
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('encounter:lootSweepCollected', {
      liveId: stamp.liveId != null ? stamp.liveId : null,
      hunterId: collector.id,
      podId: pod.id,
      commodityId,
      qty,
      t: now,
    });
  }
  say(ctx, {
    id: `lootSweep:take:${collector.id}:${pod.id}`,
    kind: 'lootSweep',
    key: BARK_TAKE,
    hunterId: collector.id,
    factionId: collector.factionId,
  });
  return true;
}

/**
 * save:loaded sweep — the errand book does not survive a save, so any `ai.lootSweep` stamp still
 * riding an ai-bag is an orphan: restore the snapshotted posture and release the hull to its
 * ordinary owner rather than leave a phantom doctrine on it.
 */
export function sweepStaleLootSweeps(state) {
  if (!state || !state.entities || typeof state.entities.forEach !== 'function') return 0;
  let swept = 0;
  state.entities.forEach((e) => {
    const ai = e && e.data && e.data.ai;
    if (!ai || !ai.lootSweep) return;
    const posture = ai.lootSweep.posture;
    delete ai.lootSweep;
    restorePosture(ai, posture);
    swept++;
  });
  return swept;
}
