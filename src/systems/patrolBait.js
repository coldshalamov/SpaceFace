// inf-patrol-bait — the raider band trick.
//
// THE TRICK: a losing Reach raider squad spoofs the law's own band. The nearest lawful
// patrol hears "Concord" demanding a Meridian (or Drift, or Vael…) checkpoint tithe at
// gunpoint; the victim party hears the "patrol" open fire on the band. Within a beat the
// two lawful parties are hammering each other through the ordinary hostility oracle —
// the patrol's lawful dispatch stamp and the victim's self-defense retaliation stamp —
// while the raiders hang wide with cold guns and watch the law do their work for them.
//
// THE COUNTERPLAY is the one the pilot already owns: a scanner pulse. `data.scanned`
// (scanner's own transponder-verification stamp) burns the mask — the spoof cannot survive
// an actual verification — and both parties stand down on the next beat. The trick also
// ends on its own short clock, when the raider dies, or when either party dies.
//
// OWNERSHIP: this module is the only writer of `data.baitTrick` (on the raider),
// `data.baitDispatch` (on the patrol hull) and `data.baitBlame` (on victim guards). It
// stamps and later restores exactly the AI fields its trick set — ai.securityTargetId,
// ai.retaliationTargetId, ai.roe, ai.passive — and never touches a hull another script
// drives (forcePlayerTarget arcs, named aces, promoted pilots, onboarding wings).
// Deterministic: hash32(seed, raider, minute) arms it, state.simTime clocks it; no
// Math.random, no wall clock, no Three.js. Hosted by encounterDirector's 1 Hz block,
// the same beat that hosts the towed-lure pursuit pass.
import { hash32 } from '../core/rng.js';
import { indexedShipLikeScan } from '../world/livingWorldViews.js';
import { RulesOfEngagement } from '../ai/doctrine.js';

/** A trick needs all three parties in one patch of water: the raider is the witness anchor. */
export const BAIT_WITNESS_RADIUS_WU = 1500;
/** A raider who is winning the straight fight does not cheat. This hurt fraction arms the trick. */
export const BAIT_HURT_FRAC = 0.65;
/** How long the spoofed band stays up — short, so the trick reads as a beat, not a state. */
export const BAIT_MASK_WINDOW_S = 16;
/** The misattributed stamps ride the mask plus a beat, then both parties stand down. */
export const BAIT_BLAME_HOLD_S = 16;
/** One trick per raider per long stretch — rarely and memorably, not every lane. */
export const BAIT_COOLDOWN_S = 240;
/** When the arm conditions hold, this share of minutes actually run the trick. */
export const BAIT_ARM_GATE_PCT = 40;
/** Victim guards stamped into the cross-fire per trick — bounded, like every crowd write. */
export const BAIT_AFFECT_MAX = 4;

const dist2Of = (a, b) => {
  if (!a || !b || !a.pos || !b.pos) return Infinity;
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  return dx * dx + dz * dz;
};

const callsignFor = (factionId) => {
  if (factionId === 'faction_mts') return 'MERIDIAN SCREEN';
  if (factionId === 'faction_dmc') return 'DRIFT CUTTER';
  if (factionId === 'faction_vael') return 'VAEL WARDEN';
  if (factionId === 'faction_free') return 'FREE BERTH WATCH';
  return 'CONVOY SCREEN';
};

function aiOf(entity) {
  return (entity && entity.data && entity.data.ai) || null;
}

function factionOf(entity) {
  return (entity && entity.factionId) || (entity && entity.data && entity.data.factionId) || null;
}

function isOrganizedParty(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  const ai = data.ai || {};
  return ai.lawful === true || !!data.factionPresence;
}

/** A raid hull that may run the trick: hostile-culture, driving itself, no authored arc. */
function isBaitRaider(entity) {
  if (!entity || entity.alive === false || entity.team !== 1) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (!ai || ai.passive === true || ai.forcePlayerTarget === true) return false;
  if (data.promotedPilot || data.namedAceId || ai.namedAceId || data.onboardingRaidWing) return false;
  const faction = factionOf(entity);
  return faction === 'faction_reach' || ai.archetype === 'pirate';
}

function hullFracOf(entity) {
  const max = Number(entity && entity.hullMax);
  const hull = Number(entity && entity.hull);
  if (!Number.isFinite(max) || !Number.isFinite(hull) || max <= 0) return 1;
  return hull / max;
}

function say(bus, from, text, dedupeKey) {
  if (!bus || typeof bus.emit !== 'function') return;
  bus.emit('comms:log', { from, text, kind: 'encounter', dedupeKey });
  bus.emit('patrolBait:voice', { from, text, dedupeKey });
}

/**
 * One 1 Hz pass. Opens the trick when a losing raider, a lawful patrol and another
 * lawful party share water on a gated minute; maintains the stamps while it runs;
 * burns it on scan or expiry. Returns the live trick count (a number for tests).
 */
export function tickPatrolBaits(state, bus = null) {
  if (!state || !state.entities || typeof state.entities.forEach !== 'function') return 0;
  const now = Number(state.simTime) || 0;
  const raiders = [];
  const patrols = [];
  const parties = [];
  state.entities.forEach((entity) => {
    if (!entity || entity.alive === false || entity.type !== 'ship') return;
    if (entity.team === 0) return;
    const data = entity.data || {};
    if (data.foldAberrant) return;
    if (isBaitRaider(entity)) raiders.push(entity);
    else if (aiOf(entity) && aiOf(entity).lawful === true) patrols.push(entity);
    if (isOrganizedParty(entity)) parties.push(entity);
  });
  if (!raiders.length) return 0;

  let live = 0;
  for (const raider of raiders) {
    const trick = raider.data.baitTrick;
    if (trick && trick.maskUntil != null) {
      // Maintenance first: a live trick is only ever maintained by this pass.
      if (maintainTrick(state, bus, raider, now)) live += 1;
      continue;
    }
    if (tryOpenTrick(state, bus, raider, patrols, parties, now)) live += 1;
  }
  return live;
}

function maintainTrick(state, bus, raider, now) {
  const trick = raider.data.baitTrick;
  const burnReason = trickBurnReason(raider, now);
  if (burnReason) {
    clearBaitTrick(state, bus, raider, burnReason, now);
    return false;
  }
  // A party the trick killed early: drop just that name from the stamps it holds.
  const patrol = trick.patrolId != null ? entityById(state, trick.patrolId) : null;
  if (!patrol || patrol.alive === false) {
    clearBaitTrick(state, bus, raider, 'patrol_lost', now);
    return false;
  }
  return true;
}

function trickBurnReason(raider, now) {
  const trick = raider.data.baitTrick;
  if (raider.alive === false) return 'raider_lost';
  // The counterplay the pilot already owns: a scan resolved the hull after the spoof went
  // live and the mask died. A hull scanned before it ever lied carries a watermark instead.
  const data = raider.data || {};
  if (data.scanned === true && data.baitScanWatermark !== true) return 'scanned';
  if (Number(trick.blameUntil) <= now) return 'expired';
  return null;
}

function entityById(state, id) {
  if (id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  const hit = state.entities.get(id);
  if (hit != null) return hit;
  const numeric = Number(id);
  return Number.isFinite(numeric) ? state.entities.get(numeric) || null : null;
}

function tryOpenTrick(state, bus, raider, patrols, parties, now) {
  const data = raider.data || (raider.data = {});
  // Losing the straight fight is what makes a raider cheat — a winning squad never pays the trick.
  if (hullFracOf(raider) > BAIT_HURT_FRAC) return false;
  const last = Number(data.baitTrickLastAt) || -Infinity;
  if (now - last < BAIT_COOLDOWN_S) return false;
  const seed = Number(state.meta && state.meta.seed) || 0;
  const minute = Math.floor(now / 60);
  if (hash32(seed, raider.id, minute) % 100 >= BAIT_ARM_GATE_PCT) return false;

  const radius2 = BAIT_WITNESS_RADIUS_WU * BAIT_WITNESS_RADIUS_WU;
  let patrol = null;
  let patrolD2 = Infinity;
  for (const candidate of patrols) {
    if (candidate.data.baitDispatch) continue;
    if (aiOf(candidate) && aiOf(candidate).forcePlayerTarget === true) continue;
    const faction = factionOf(candidate);
    if (!faction || faction === factionOf(raider)) continue;
    const d2 = dist2Of(raider, candidate);
    if (d2 <= radius2 && d2 < patrolD2) {
      patrol = candidate;
      patrolD2 = d2;
    }
  }
  if (!patrol) return false;
  const patrolFaction = factionOf(patrol);
  const victims = [];
  for (const candidate of parties) {
    if (candidate.data.baitBlame || candidate === patrol) continue;
    if (aiOf(candidate) && aiOf(candidate).forcePlayerTarget === true) continue;
    const faction = factionOf(candidate);
    if (!faction || faction === patrolFaction || faction === factionOf(raider)) continue;
    if (dist2Of(raider, candidate) > radius2) continue;
    if (dist2Of(candidate, patrol) > radius2 * 4) continue;
    victims.push(candidate);
    if (victims.length >= BAIT_AFFECT_MAX) break;
  }
  if (!victims.length) return false;

  openBaitTrick(state, bus, raider, patrol, victims, now);
  return true;
}

/**
 * The beat: spoof the band, stamp the misattributed fight, speak three lines. The stamps
 * are ordinary AI fields — the canonical hostility oracle (engagementAuthority) does the
 * rest on its own: the patrol's lawful dispatch authorizes it against the "rogue" party,
 * the party's retaliation stamp authorizes the return fire.
 */
export function openBaitTrick(state, bus, raider, patrol, victims, now) {
  const data = raider.data || (raider.data = {});
  const trickId = `bait:${raider.id}:${Math.floor(now)}`;
  const blameUntil = now + BAIT_BLAME_HOLD_S;
  data.baitTrick = {
    trickId,
    patrolId: patrol.id,
    victimIds: victims.map((entity) => entity.id),
    armedAt: now,
    maskUntil: now + BAIT_MASK_WINDOW_S,
    blameUntil,
    saidTaunt: false,
  };
  data.baitTrickLastAt = now;
  // A hull the pilot already verified before the lie cannot be re-burned by an old scan.
  data.baitScanWatermark = data.scanned === true;

  const patrolAi = patrol.data.ai || (patrol.data.ai = {});
  patrol.data.baitDispatch = {
    trickId,
    targetId: victims[0].id,
    until: blameUntil,
    priorRoe: patrolAi.roe != null ? patrolAi.roe : null,
    priorSecurity: patrolAi.securityTargetId != null ? patrolAi.securityTargetId : null,
  };
  patrolAi.securityTargetId = victims[0].id;
  patrolAi.roe = RulesOfEngagement.WEAPONS_FREE;

  const victimFaction = factionOf(victims[0]);
  for (const victim of victims) {
    const ai = victim.data.ai || (victim.data.ai = {});
    victim.data.baitBlame = {
      trickId,
      targetId: patrol.id,
      until: blameUntil,
      wasPassive: ai.passive === true,
      priorRoe: ai.roe != null ? ai.roe : null,
      priorRetaliation: ai.retaliationTargetId != null ? ai.retaliationTargetId : null,
    };
    // A screen that was holding fire is now defending itself against a "rogue patrol":
    // the same activation a scripted hostile beat applies (eighthBellRuntime's warden flip).
    ai.passive = false;
    ai.retaliationTargetId = patrol.id;
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
  }

  if (bus && typeof bus.emit === 'function') {
    bus.emit('patrolBait:opened', {
      trickId,
      raiderId: raider.id,
      patrolId: patrol.id,
      victimIds: victims.map((entity) => entity.id),
      victimFaction: victimFaction || null,
      blameUntil,
      t: now,
    });
  }
  const victimCallsign = callsignFor(victimFaction);
  say(
    bus,
    'CONCORD',
    `${victimCallsign.toLowerCase()} formation, this is Concord patrol. Hold position for a checkpoint tithe — comply now or we open fire.`,
    `${trickId}:demand`,
  );
  say(
    bus,
    victimCallsign,
    'That is a lie — Concord never posts tithes on this lane. Screens, weapons free. Answer them.',
    `${trickId}:reply`,
  );
}

/**
 * The trick ends: scan burn, its own clock, or a dead party. Every AI field the trick
 * stamped is restored to exactly what it was; the stand-down lines fire once.
 */
export function clearBaitTrick(state, bus, raider, reason, now) {
  const trick = raider.data && raider.data.baitTrick;
  if (!trick) return;
  delete raider.data.baitTrick;
  const patrol = trick.patrolId != null ? entityById(state, trick.patrolId) : null;
  if (patrol && patrol.data && patrol.data.baitDispatch && patrol.data.baitDispatch.trickId === trick.trickId) {
    const ai = patrol.data.ai || {};
    const dispatch = patrol.data.baitDispatch;
    if (ai.securityTargetId === dispatch.targetId) {
      if (dispatch.priorSecurity != null) ai.securityTargetId = dispatch.priorSecurity;
      else delete ai.securityTargetId;
    }
    if (ai.roe === RulesOfEngagement.WEAPONS_FREE && dispatch.priorRoe != null) ai.roe = dispatch.priorRoe;
    delete patrol.data.baitDispatch;
    if (reason === 'expired' || reason === 'scanned') {
      say(
        bus,
        'CONCORD',
        reason === 'scanned'
          ? 'That was not Concord on your band — the raiders spoofed us. Break off, all parties. Watch for Reach hulls.'
          : 'Stand down — that band call was spoofed. The raiders played us both. Resume lanes.',
        `${trick.trickId}:standown`,
      );
    }
  }
  for (const victimId of trick.victimIds || []) {
    const victim = entityById(state, victimId);
    if (!victim || !victim.data || !victim.data.baitBlame || victim.data.baitBlame.trickId !== trick.trickId) continue;
    const ai = victim.data.ai || {};
    const blame = victim.data.baitBlame;
    if (ai.retaliationTargetId === blame.targetId) {
      if (blame.priorRetaliation != null) ai.retaliationTargetId = blame.priorRetaliation;
      else delete ai.retaliationTargetId;
    }
    if (blame.wasPassive === true) ai.passive = true;
    if (ai.roe === RulesOfEngagement.WEAPONS_FREE && blame.priorRoe != null) ai.roe = blame.priorRoe;
    delete victim.data.baitBlame;
  }
  if (bus && typeof bus.emit === 'function') {
    bus.emit('patrolBait:cleared', { trickId: trick.trickId, raiderId: raider.id, reason, t: now });
  }
  // The trick's one boast — spoken once, on the first close that is not a quiet expiry.
  if ((reason === 'scanned' || reason === 'raider_lost') && trick.saidTaunt !== true) {
    trick.saidTaunt = true;
    say(
      bus,
      'CRIMSON REACH',
      'We never fired a shot. Your law did all the work — keep the wreckage.',
      `${trick.trickId}:taunt`,
    );
  }
}
