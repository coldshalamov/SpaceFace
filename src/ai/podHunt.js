// src/ai/podHunt.js — THE WORLD ANSWERS, C7: a wounded pirate breaks off to take a survivor pod.
//
// A crewed hull dies and ejects a survivor pod. A hostile pirate-class hull that is already hurt
// (hull <= POD_HUNT.hullFractionMax) would rather take the easy ransom than keep trading fire with
// the player. For the length of the errand it is NOT pressing the player: the player-facing aggro
// fields are parked, the doctrine becomes a hold-fire TRANSIT onto the pod (the same shape
// ambientPredation uses for pod recovery), and the hull's prior posture is snapshotted so the
// errand can hand it back. The pod is the lever: release the tow, or just leave the pod adrift,
// and the pursuer goes for it — the player sheds a pursuer by sacrificing a pod.
//
// This is a listener and a rule, not a system. survivorPod.js (the pod owner) calls in from its
// `survivorPod:ejected` listener and its update tick, and keeps every write the pod owns: the pod's
// removal, the `survivorPod:captured` receipt and the moral-memory note all go through its
// _resolveCausal path via ctx.capture. This file only steers the hunter and keeps the errand book.
//
// Determinism: simTime / tick / stable entity ids only. No RNG draw (bark pick is a hash of seed+id).
// Save safety: the errand book (`survivorPod.hunt`) is NOT serialized. The hunter's `ai.podHunt`
// stamp can ride an ai-bag across a save, so sweepStalePodHunts() releases every orphaned stamp on
// save:loaded (fail closed, same shape as ambientPredation's rematerialization sweep).
//
// Not covered on purpose: hulls already under a flee/surrender order (pirateDisengage / parley /
// wingMorale own them), pods of the hunter's own faction (no ransom on your own crew), the player's
// own wreck pod, and pods the player is towing (the pirate hovers, hold-fire, until the tow ends or
// the errand lapses — it cannot cut a tether it does not own).

import { hash32 } from '../core/rng.js';
import { indexedShipLikeScan } from '../world/livingWorldViews.js';
import { isActiveCombatant } from '../systems/pirateDisengage.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from './doctrine.js';

export const POD_HUNT = Object.freeze({
  hullFractionMax: 0.5,     // hull fraction at/below which a pirate prefers the easy ransom
  seekRadiusWu: 900,        // pod must sit this close to the hunter to be worth the detour
  errandDeadlineS: 45,      // hard cap on the errand — then the pirate resumes its posture
  cooldownS: 60,            // refractory after a lapsed / interrupted errand (no instant re-peel)
  leaveS: 20,               // after a capture the pirate runs for the lane this long
  leaveRadiusWu: 1500,      // flee anchor distance from where the capture happened
  scanEveryTicks: 15,       // catch-up scan cadence (0.25 s @ 60 Hz); the eject event is immediate
  refreshEveryTicks: 10,    // re-assert doctrine + live pod anchor (the pod drifts)
  contactPadWu: 6,          // contact range = hunter radius + pod radius - 4 + this (ambient recovery)
  maxErrands: 3,            // concurrent errands in the sector — bounded
  hitEpsilon: 0.01,         // any real hull loss during the errand ends it (self-defence)
});

const CAPTURE_LINES = Object.freeze([
  'Survivor pod is ours. Ransom goes to whoever wants them back.',
  'Pod secured. The crew is worth more breathing — name your price, spacer.',
  'Got the pod. Survivors ride with us until someone pays.',
]);
const DISPATCH_LINES = Object.freeze([
  'Pod in the drift. Easier ransom than a fight — breaking off.',
  'Survivors floating loose. We take the pod, you take the rest of the day.',
  'Cutting off the attack. A drifting pod pays better than you do.',
]);

function entityById(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function hullFraction(entity) {
  const max = Math.max(1, Number(entity && entity.hullMax) || 1);
  return Math.max(0, Math.min(1, (Number(entity && entity.hull) || 0) / max));
}

function d2(a, b) {
  const dx = finite(a && a.x) - finite(b && b.x);
  const dz = finite(a && a.z) - finite(b && b.z);
  return dx * dx + dz * dz;
}

/** The errand book, READ without creating (keeps the quiet default route allocation-free). */
function peekHunt(own) {
  return own && own.hunt && typeof own.hunt === 'object' ? own.hunt : null;
}

function ensureHunt(own) {
  if (!own.hunt || typeof own.hunt !== 'object') own.hunt = {};
  const h = own.hunt;
  if (!h.byPod || typeof h.byPod !== 'object') h.byPod = {};
  if (!h.errands || typeof h.errands !== 'object') h.errands = {};
  if (!h.cooldown || typeof h.cooldown !== 'object') h.cooldown = {};
  if (!h.seen || typeof h.seen !== 'object') h.seen = {};
  return h;
}

function say(ctx, { id, text, kind, factionId }) {
  const voice = ctx.helpers && ctx.helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({ channel: 'bark', text, kind, ttl: 4, id, factionId: factionId || 'faction_reach' });
  } else if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('toast', { text, kind, ttl: 4 });
  }
}

function lineFor(lines, state, hunterId, salt) {
  const seed = state.meta && state.meta.seed;
  return lines[hash32(seed == null ? 0 : seed, hunterId, salt) % lines.length];
}

function liveCausalRec(ctx, podId) {
  const rec = ctx.own && ctx.own.causal && ctx.own.causal.byEntityId
    ? ctx.own.causal.byEntityId[podId] : null;
  return rec && !rec.resolved ? rec : null;
}

/** A pod a pirate may go after: an unresolved causal pod that is not the player's wreck pod. */
function huntablePod(ctx, pod) {
  return !!(pod && pod.alive !== false && ctx.isHuntablePod(pod) && liveCausalRec(ctx, pod.id));
}

function onCooldown(h, hunterId, now) {
  const until = h.cooldown[hunterId];
  return Number.isFinite(until) && now < until;
}

/** Wounded pirate-class hull that can take an errand right now (pod-independent checks). */
function woundedHunter(state, h, e, now) {
  if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
  if (e.id === state.playerId) return false;
  const ai = e.data && e.data.ai;
  if (!ai || ai.podHunt || ai.pirateDisengaged === true) return false;
  if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.forceFlee === true) return false;
  if (h.errands[e.id] || onCooldown(h, e.id, now)) return false;
  const frac = hullFraction(e);
  if (!(frac > 0 && frac <= POD_HUNT.hullFractionMax)) return false;
  return isActiveCombatant(e, state);
}

function collectWounded(state, h, now) {
  const out = [];
  const list = indexedShipLikeScan(state);
  for (let i = 0; i < list.length; i++) {
    if (woundedHunter(state, h, list[i], now)) out.push(list[i]);
  }
  return out;
}

function nearestHunterFor(pod, hunters, podFactionId) {
  const reach2 = POD_HUNT.seekRadiusWu * POD_HUNT.seekRadiusWu;
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < hunters.length; i++) {
    const e = hunters[i];
    if (podFactionId && e.factionId === podFactionId) continue; // no ransom on your own crew
    const dist = d2(e.pos, pod.pos);
    if (dist > reach2) continue;
    if (dist < bestD2 || (dist === bestD2 && best && e.id < best.id)) {
      best = e;
      bestD2 = dist;
    }
  }
  return best;
}

function claim(ctx, hunter, pod, now) {
  const { state } = ctx;
  const h = ensureHunt(ctx.own);
  const data = hunter.data || (hunter.data = {});
  const ai = data.ai || (data.ai = {});
  const combat = data.combat || (data.combat = {});
  const intent = data.intent || (data.intent = {});
  const tick = state.tick | 0;
  const rec = {
    hunterId: hunter.id,
    podId: pod.id,
    phase: 'seek',
    startedAt: now,
    deadlineAt: now + POD_HUNT.errandDeadlineS,
    lastHull: finite(hunter.hull),
    lastRefreshTick: tick,
    snapshot: {
      activity: ai.activity || null,
      roe: ai.roe == null ? null : ai.roe,
      forcePlayerTarget: ai.forcePlayerTarget === true,
      huntPlayer: ai.huntPlayer === true,
    },
  };
  h.errands[hunter.id] = rec;
  h.byPod[pod.id] = hunter.id;
  ai.podHunt = { podId: pod.id, phase: 'seek', since: now };
  // Aggro drops: the player is no longer this hull's business until the errand ends.
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;
  intent.fire = false;
  intent.fireGroup = null;
  assertSeekDoctrine(state, hunter, pod, rec);
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('survivorPod:huntDispatched', {
      entityId: pod.id,
      hunterId: hunter.id,
      factionId: hunter.factionId || null,
      hullFraction: hullFraction(hunter),
      t: now,
    });
  }
  say(ctx, {
    id: `podHunt:go:${pod.id}`,
    kind: 'podHunt',
    text: lineFor(DISPATCH_LINES, state, hunter.id, 'podHuntGo'),
    factionId: hunter.factionId,
  });
  return rec;
}

function contactRange(hunter, pod) {
  return Math.max(1, finite(hunter.radius) + finite(pod.radius) - 4) + POD_HUNT.contactPadWu;
}

function assertSeekDoctrine(state, hunter, pod, rec) {
  const ai = hunter.data.ai;
  setEntityDoctrine(hunter, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason: 'pod_hunt:capture',
      anchor: { x: pod.pos.x, z: pod.pos.z },
      leashRadius: POD_HUNT.seekRadiusWu * 2,
      preferredRange: contactRange(hunter, pod),
      startedTick: state.tick | 0,
      targetId: pod.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  rec.lastRefreshTick = state.tick | 0;
}

/** Give the hull back its pre-errand posture. `restore:false` leaves a foreign owner's order alone. */
function endErrand(ctx, rec, { restore = true, cooldownS = POD_HUNT.cooldownS, reason = 'released' } = {}) {
  const { state } = ctx;
  const h = ensureHunt(ctx.own);
  const hunter = entityById(state, rec.hunterId);
  const now = finite(state.simTime);
  delete h.errands[rec.hunterId];
  if (h.byPod[rec.podId] === rec.hunterId) delete h.byPod[rec.podId];
  if (cooldownS > 0) h.cooldown[rec.hunterId] = now + cooldownS;
  const ai = hunter && hunter.data && hunter.data.ai;
  if (ai && ai.podHunt) {
    delete ai.podHunt;
    if (restore) restorePosture(ai, rec.snapshot);
  }
  if (ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('survivorPod:huntEnded', {
      entityId: rec.podId, hunterId: rec.hunterId, reason, t: now,
    });
  }
}

function restorePosture(ai, snap) {
  const s = snap || {};
  if (s.activity) ai.activity = s.activity; else delete ai.activity;
  if (s.roe != null) ai.roe = s.roe; else delete ai.roe;
  if (s.forcePlayerTarget) ai.forcePlayerTarget = true;
  if (s.huntPlayer) ai.huntPlayer = true;
}

/** Pick the nearest eligible hunter for one pod (the shared dispatch path for event + scan). */
function dispatchForPod(ctx, pod, hunters) {
  const h = ensureHunt(ctx.own);
  if (h.byPod[pod.id] != null) return null;
  if (Object.keys(h.errands).length >= POD_HUNT.maxErrands) return null;
  const rec = liveCausalRec(ctx, pod.id);
  if (!rec) return null;
  const now = finite(ctx.state.simTime);
  const pool = hunters || collectWounded(ctx.state, h, now);
  const hunter = nearestHunterFor(pod, pool, rec.factionId || pod.factionId || null);
  if (!hunter) return null;
  const idx = pool.indexOf(hunter);
  if (idx >= 0) pool.splice(idx, 1); // one errand per hunter within a shared pass
  return claim(ctx, hunter, pod, now);
}

/**
 * survivorPod:ejected listener. Dispatches AT MOST ONCE per pod id (duplicate events are inert);
 * pods that find no wounded pirate on eject are picked up later by the cadence scan in tickPodHunts.
 */
export function onPodEjected(ctx, payload) {
  if (!ctx || !ctx.state || !payload) return null;
  if (payload.playerWreck === true || payload.source === 'player_wreck') return null;
  const pod = entityById(ctx.state, payload.entityId);
  if (!huntablePod(ctx, pod)) return null;
  const h = ensureHunt(ctx.own);
  if (h.seen[pod.id]) return null;
  h.seen[pod.id] = true;
  return dispatchForPod(ctx, pod, null);
}

function startLeaving(ctx, rec, hunter, pod) {
  const { state } = ctx;
  const ai = hunter.data.ai;
  const now = finite(state.simTime);
  const player = entityById(state, state.playerId);
  let dx = hunter.pos.x - finite(player && player.pos && player.pos.x, pod.pos.x);
  let dz = hunter.pos.z - finite(player && player.pos && player.pos.z, pod.pos.z);
  let len = Math.hypot(dx, dz);
  if (!(len > 0.001)) {
    dx = Math.cos(finite(hunter.rot));
    dz = Math.sin(finite(hunter.rot));
    len = 1;
  }
  const tick = state.tick | 0;
  rec.phase = 'leave';
  rec.leaveUntil = now + POD_HUNT.leaveS;
  ai.podHunt = { podId: rec.podId, phase: 'leave', since: now };
  setEntityDoctrine(hunter, {
    activity: {
      kind: ActivityKind.FLEE,
      reason: 'pod_hunt:leave',
      anchor: {
        x: hunter.pos.x + (dx / len) * POD_HUNT.leaveRadiusWu,
        z: hunter.pos.z + (dz / len) * POD_HUNT.leaveRadiusWu,
      },
      leashRadius: POD_HUNT.leaveRadiusWu * 1.5,
      startedTick: tick,
      deadlineTick: tick + Math.ceil(POD_HUNT.leaveS * 60),
      targetId: null,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

function tickErrand(ctx, rec, tick, now) {
  const { state } = ctx;
  const h = ensureHunt(ctx.own);
  const hunter = entityById(state, rec.hunterId);
  if (!hunter || hunter.alive === false || !hunter.data || !hunter.data.ai) {
    // The hunter died (or vanished): nothing to restore, the pod is simply unclaimed again.
    delete h.errands[rec.hunterId];
    if (h.byPod[rec.podId] === rec.hunterId) delete h.byPod[rec.podId];
    return;
  }
  const ai = hunter.data.ai;

  if (rec.phase === 'leave') {
    if (now >= rec.leaveUntil) endErrand(ctx, rec, { cooldownS: 0, reason: 'resumed' });
    else if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.pirateDisengaged === true) {
      endErrand(ctx, rec, { restore: false, cooldownS: 0, reason: 'foreign_order' });
    }
    return;
  }

  // Another owner (pirateDisengage / parley / wing morale) took the hull's orders: stand down
  // without restoring a weapons-free posture onto a hull that has been told to run.
  if (ai.fsm === 'flee' || ai.fsm === 'surrender' || ai.forceFlee === true || ai.pirateDisengaged === true) {
    endErrand(ctx, rec, { restore: false, reason: 'foreign_order' });
    return;
  }
  const pod = entityById(state, rec.podId);
  if (!pod || pod.alive === false || !liveCausalRec(ctx, rec.podId)) {
    // Rescued, expired, or taken by someone else first: resume the fight, no refractory.
    endErrand(ctx, rec, { cooldownS: 0, reason: 'pod_gone' });
    return;
  }
  if (now >= rec.deadlineAt) {
    endErrand(ctx, rec, { reason: 'deadline' });
    return;
  }
  const hull = finite(hunter.hull);
  if (hull < rec.lastHull - POD_HUNT.hitEpsilon) {
    // Shot while on the errand: the pirate fights back. (Sacrifice the pod; do not shoot the pirate.)
    endErrand(ctx, rec, { reason: 'hunter_hit' });
    return;
  }
  rec.lastHull = hull;

  const reach = contactRange(hunter, pod);
  if (d2(hunter.pos, pod.pos) <= reach * reach && !ctx.playerLatchedTo(pod.id)) {
    const podRec = liveCausalRec(ctx, pod.id);
    const captured = ctx.capture(podRec, pod, {
      reason: 'pirate_capture',
      captorId: hunter.id,
      captorFactionId: hunter.factionId || null,
    });
    if (captured) {
      delete h.byPod[rec.podId];
      h.cooldown[rec.hunterId] = now + POD_HUNT.leaveS + POD_HUNT.cooldownS;
      say(ctx, {
        id: `podHunt:took:${rec.podId}`,
        kind: 'podHunt',
        text: lineFor(CAPTURE_LINES, state, hunter.id, 'podHuntTook'),
        factionId: hunter.factionId,
      });
      startLeaving(ctx, rec, hunter, pod);
    }
    return;
  }
  if (tick - rec.lastRefreshTick >= POD_HUNT.refreshEveryTicks) assertSeekDoctrine(state, hunter, pod, rec);
}

/**
 * Per-tick pass. Zero work on a quiet sector: no live pod and no errand returns before any scan.
 * Order: steer/capture the active errands, then (on cadence) dispatch wounded pirates onto pods
 * that nobody has claimed — the catch-up for a pirate that was healthy when the pod ejected.
 */
export function tickPodHunts(ctx) {
  if (!ctx || !ctx.state || !ctx.own) return;
  const { state, own } = ctx;
  const h = peekHunt(own);
  const tick = state.tick | 0;
  const now = finite(state.simTime);
  if (h) {
    const ids = Object.keys(h.errands);
    for (let i = 0; i < ids.length; i++) {
      const rec = h.errands[ids[i]];
      if (rec) tickErrand(ctx, rec, tick, now);
    }
    // Prune bookkeeping for pods that are gone so the book stays bounded.
    if ((tick % POD_HUNT.scanEveryTicks) === 0) {
      for (const key of Object.keys(h.seen)) {
        if (!liveCausalRec(ctx, key)) delete h.seen[key];
      }
      for (const key of Object.keys(h.cooldown)) {
        if (!(h.cooldown[key] > now)) delete h.cooldown[key];
      }
    }
  }
  const podIds = own.causal && own.causal.byEntityId ? Object.keys(own.causal.byEntityId) : [];
  if (!podIds.length) return;
  if ((tick % POD_HUNT.scanEveryTicks) !== 0) return;
  const book = ensureHunt(own);
  if (Object.keys(book.errands).length >= POD_HUNT.maxErrands) return;
  const hunters = collectWounded(state, book, now);
  if (!hunters.length) return;
  podIds.sort((a, b) => Number(a) - Number(b));
  for (let i = 0; i < podIds.length && hunters.length; i++) {
    const pod = entityById(state, Number(podIds[i])) || entityById(state, podIds[i]);
    if (!huntablePod(ctx, pod) || book.byPod[pod.id] != null) continue;
    dispatchForPod(ctx, pod, hunters);
  }
}

/**
 * save:loaded sweep: the errand book is not serialized, but a hunter's ai-bag may be. Every
 * `ai.podHunt` stamp with no matching live errand is an orphan — park it back to a plain posture.
 */
export function sweepStalePodHunts(state, own) {
  if (!state) return 0;
  const h = peekHunt(own);
  let swept = 0;
  const list = indexedShipLikeScan(state);
  for (let i = 0; i < list.length; i++) {
    const ai = list[i] && list[i].data && list[i].data.ai;
    if (!ai || !ai.podHunt) continue;
    const live = h && h.errands && h.errands[list[i].id];
    if (live) continue;
    delete ai.podHunt;
    // The stamp's own doctrine reasons are the only thing to undo; a plain attack posture resumes.
    const reason = ai.activity && ai.activity.reason;
    if (typeof reason === 'string' && reason.startsWith('pod_hunt:')) {
      delete ai.activity;
      ai.roe = RulesOfEngagement.WEAPONS_FREE;
    }
    swept += 1;
  }
  if (own && own.hunt) {
    own.hunt.errands = {};
    own.hunt.byPod = {};
    own.hunt.cooldown = {};
    own.hunt.seen = {};
  }
  return swept;
}
