// SP2-157 — THE ERIS LAST POD. The line has held longer than the writs that ignore it.
//
// The Drift Choir — three dead habitat pods strung on one old tether line inside Eris
// Margin's west fog (the authored one-off `oneoff_drift_choir`, world.js materializes the
// last pod as a real ropeable body). The Margin Fence chair story is live (the director's
// special500.SP2-079 memory row): an empty chair, a daily beer, waiting for whoever reels
// in the last pod. This file is the payoff made real:
//
//   * Three hearings under the line's roll-call bell. Each firing under the bell is one
//     hearing — the bell rings, the fog answers, the barkeep says one thing more — and the
//     bell keeps its own cadence: a hearing only counts a visit's length after the previous
//     one, so a single stop under the line cannot stack the count. The count and its stamp
//     are plain-named story flags owned solely by this runtime.
//   * After the third hearing the fraying last pod can finally go. The player latches it
//     with the massline and cuts — and the impulse on the break decides the ending, the
//     same telemetry input masslineImpactDamage reads:
//       - a clean cut (deliberate `tether_cut` at or under the clean-load bar) comes off
//         like a knot untying: the chair is claimed, the house pours.
//       - a hard yank (a break under load — a loaded cut above the bar, or the line letting
//         go on its own law) wakes the line: the whole choir swings once, and the bar does
//         not speak to the player for a sector week.
//
// Deterministic: simTime, positions, and the break payload's own impulse numbers. No rng.
// Gates hold on the director's durable special500.SP2-079 row (read through
// crSituationKit.priorOutcome); with the gates unmet the encounter aborts inert — no flag,
// no line, no outcome. The one-time terminal state lives on the durable situation record.
import { deepFreeze, defineEncounter } from './catalog.js';
import { CAL_DAY_S, CAL_WEEK_DAYS } from '../worldCalendar.js';
import { priorOutcome, settleSituation } from '../../systems/crSituationKit.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../../core/physicsAuthority.js';

export const encounterOrder = 1311;
export const trigger = deepFreeze({
  id: 'eris_last_pod',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.7,
  zoneTypes: ['nebula_fog'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 240,
  proximity: true,
  rare: true,
  gates: {
    sectorIds: ['sector_eris_margin'],
    // The chair story must be live first: the director's durable row for SP2-079.
    requiresCompletedShape: 'special500.SP2-079',
  },
});

export const LAST_POD = Object.freeze({
  sectorId: 'sector_eris_margin',
  choirOneOffId: 'oneoff_drift_choir',
  // The visit radius under the roll-call bell.
  bellWu: 420,
  hearingsNeeded: 3,
  // One live visit window; the beat re-fires on its cooldown until the pod is down.
  visitWindowS: 150,
  // The bell's own cadence: a hearing counts a visit's length after the previous one, so
  // one stop under the line cannot stack the roll call.
  hearingGapS: 900,
  // A clean cut arrives at or under this line impulse. Pinned to the massline break law's
  // own scale (attachment break maxImpulse 2200, src/data/combatDefs.js): a relaxed line
  // cuts near zero; half the break load and more is a yank, not a cut.
  cleanCutMaxImpulse: 900,
  // The house's silence, in the world calendar's own weeks (5 sector days).
  sectorWeekS: CAL_WEEK_DAYS * CAL_DAY_S,
  flagBells: 'eris_choir_bells',
  flagBellHeardAt: 'eris_choir_bell_heard_at',
  flagChair: 'eris_choir_chair_claimed',
  flagBarSilentUntil: 'eris_choir_bar_silent_until',
  contextShapeId: 'special500.SP2-079',
});

const WAKE_IMPULSE = Object.freeze({ x: 0, z: 220 });   // one bounded perpendicular swing
const WAKE_TORQUE = 6;                                   // the slow roll of a pod coming about

function flagOf(state, key) {
  return state && state.story && state.story.flags ? state.story.flags[key] : undefined;
}

function setFlag(state, key, value) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  state.story.flags[key] = value;
}

function bellCount(state) {
  const n = Number(flagOf(state, LAST_POD.flagBells));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Sim time of the last hearing, or -Infinity when the bell has not rung for this pilot. */
function lastHeardAt(state) {
  const t = Number(flagOf(state, LAST_POD.flagBellHeardAt));
  return Number.isFinite(t) ? t : -Infinity;
}

function barSilent(state) {
  const until = Number(flagOf(state, LAST_POD.flagBarSilentUntil));
  return Number.isFinite(until) && until > (state.simTime || 0);
}

/** The choir's last pod: the world one-off's physical body, live in this sector. */
function choirPod(state) {
  for (const e of (state.entities && state.entities.values()) || []) {
    if (e && e.alive !== false && e.data && e.data.oneOffId === LAST_POD.choirOneOffId) return e;
  }
  return null;
}

function playerPos(state) {
  const ent = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  return ent && ent.alive !== false && ent.pos ? ent : null;
}

function podDistance(state, pod) {
  const player = playerPos(state);
  if (!player || !pod || !pod.pos) return null;
  return Math.hypot(player.pos.x - pod.pos.x, player.pos.z - pod.pos.z);
}

/** The barkeep speaks through the band unless the house is not speaking to the player. */
function barkeepSays(d, live, state, text) {
  if (barSilent(state)) return false;
  d.say(live, 'info', text, null, { literal: true });
  return true;
}

const HEARING_LINES = Object.freeze({
  1: 'The bell over the line rings once. From down the fog, hulls answer by name, oldest '
    + 'first. The barkeep pours without looking: "Roll call. You listen, you count."',
  2: 'The bell again. The names answer in the same order. The barkeep: "Still the same '
    + 'roll. Nobody new. Nobody less."',
  3: 'The bell rings, and this time the fog answers wrong — a long creak off the line. '
    + 'The barkeep sets down the cloth: "The line has held longer than the writs that '
    + 'ignore it. When it goes, it goes quiet. You want the chair? Cut it clean. Cut it slow."',
});

export const runtime = Object.freeze({
  // The beat exists only where the line hangs, only for a pilot the chair story reached,
  // and only while the last pod is still on it.
  fireReady(state) {
    if (!state || !state.world || state.world.currentSectorId !== LAST_POD.sectorId) return false;
    if (!priorOutcome(state, LAST_POD.contextShapeId)) return false;
    if (priorOutcome(state, trigger.id)) return false;
    const pod = choirPod(state);
    if (!pod) return false;
    const dist = podDistance(state, pod);
    if (dist == null || dist > LAST_POD.bellWu) return false;
    // A hearing counts on the bell's own cadence: the first is free, and each later one
    // waits a visit's length since the previous ring.
    if (bellCount(state) >= LAST_POD.hearingsNeeded) return true;
    return ((state.simTime || 0) - lastHeardAt(state)) >= LAST_POD.hearingGapS;
  },

  fire(d, live, state) {
    const pod = choirPod(state);
    if (!pod) return d.abort(live, 'line_missing');
    if (!runtime.fireReady(state)) return d.abort(live, 'bell_not_for_you');
    const dist = podDistance(state, pod);
    if (dist == null || dist > LAST_POD.bellWu) return d.abort(live, 'off_the_bell');

    const bells = bellCount(state);
    live.vars.podId = pod.id;
    live.vars.startedAt = d.now();
    live.vars.latched = false;

    if (bells < LAST_POD.hearingsNeeded) {
      const hearing = bells + 1;
      setFlag(state, LAST_POD.flagBells, hearing);
      setFlag(state, LAST_POD.flagBellHeardAt, d.now());
      barkeepSays(d, live, state, HEARING_LINES[hearing] || HEARING_LINES[3]);
      // The count continues on a later visit; from the third hearing on, the pod is
      // cuttable under this bell.
      return null;
    }

    // A later visit under the bell, roll call already named: the frayed line still hangs.
    if (!barSilent(state)) {
      d.say(live, 'info',
        'The last pod hangs where it has always hung, its tether fuzzed to a halo of strays. '
        + 'The fog waits.',
        null, { literal: true });
    }
    return null;
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const vars = live.vars;
    const pod = choirPod(state);
    if (!pod || pod.id !== vars.podId) return d.abort(live, 'line_lost');

    const dist = podDistance(state, pod);
    if (dist == null) return d.abort(live, 'pilot_gone');

    // The live beat exists only under the bell; flying on stands it down (the next ring is
    // the bell's own cadence, judged by fireReady).
    if (dist > LAST_POD.bellWu) {
      return d.abort(live, 'left_the_bell');
    }

    if ((now - (vars.startedAt || 0)) > LAST_POD.visitWindowS) {
      return d.abort(live, 'bell_faded');
    }
    return null;
  },

  event(d, live, state, name, payload) {
    if (live.phase === 'done') return;
    const vars = live.vars;
    const pod = choirPod(state);
    if (!pod || pod.id !== vars.podId) return;
    const bells = bellCount(state);

    if (name === 'tetherAttached') {
      // The player's own line on the last pod, roll call named or not.
      if (!payload || payload.targetId !== pod.id || payload.actorId !== state.playerId) return;
      vars.latched = true;
      if (bells >= LAST_POD.hearingsNeeded) {
        barkeepSays(d, live, state,
          'The line takes your weight. The fog goes quiet. Cut it clean. Cut it slow.');
      }
      return;
    }

    if (name === 'tetherBroken') {
      if (!payload || payload.targetId !== pod.id) return;
      const impulse = Number(payload.impulse);
      const load = Number.isFinite(impulse) ? Math.abs(impulse) : Infinity;
      const playerCut = payload.reason === 'tether_cut'
        && (payload.actorId === state.playerId || payload.ownerId === state.playerId);
      const playerHeld = payload.actorId === state.playerId
        || payload.ownerId === state.playerId || payload.controllerId === state.playerId;

      if (!playerCut && !playerHeld) return; // not the player's line; the beat stays inert

      if (bells < LAST_POD.hearingsNeeded) {
        // Cut before the roll call named you: the world takes the sound and answers nothing.
        d.say(live, 'info',
          'The line parts before the roll call names you. The fog takes the sound. Nothing answers.',
          null, { literal: true });
        return d.abort(live, 'unnamed_cut');
      }

      if (playerCut && load <= LAST_POD.cleanCutMaxImpulse) {
        return claimChair(d, live, state, payload, load);
      }
      return wakeLine(d, live, state, payload, load);
    }
    return;
  },
});

/** The clean cut: the chair is claimed, the house pours. One-time, durable. */
function claimChair(d, live, state, payload, load) {
  const now = state.simTime || 0;
  setFlag(state, LAST_POD.flagChair, now);
  d.say(live, 'info',
    'The last pod comes off the line the way a knot unties — no sound at all. The fog stays '
    + 'quiet. The barkeep is already pouring: "Clean. The chair has never been used. It is '
    + 'used now. The beer on it is today\u2019s."',
    null, { literal: true, primary: true });
  d.emit('news:publish', {
    text: 'THE LINE\u2019S LAST POD CAME DOWN CLEAN — THE MARGIN FENCE CHAIR HAS A NAME ON IT',
    kind: 'quiet', sectorId: live.sectorId || LAST_POD.sectorId,
    source: 'eris_last_pod', eventId: 'eris_last_pod:claimed',
  });
  return settleSituation(d, live, state, 'claimed', {
    breakImpulse: Number.isFinite(load) ? Math.round(load) : null,
    bells: bellCount(state),
    reason: payload && payload.reason || null,
  });
}

/** The hard yank: the line wakes, every pod swings once, and the house goes silent. */
function wakeLine(d, live, state, payload, load) {
  const now = state.simTime || 0;
  const pod = choirPod(state);
  if (pod && pod.pos) {
    // The whole choir answers once. The last pod is the one real body on the line: it takes
    // the wake as a bounded authored swing through the physics membrane — no velocity reset,
    // no rng — and the fog carries the rest of the choir's single arc.
    queuePhysicsImpulse(pod, { ...WAKE_IMPULSE }, { externalEffect: true, cause: 'eris_last_pod:wake' });
    queuePhysicsTorqueImpulse(pod, WAKE_TORQUE, { externalEffect: true, cause: 'eris_last_pod:wake' });
  }
  setFlag(state, LAST_POD.flagBarSilentUntil, now + LAST_POD.sectorWeekS);
  d.say(live, 'info',
    'The line WAKES. The whole choir swings once — every pod, one slow arc, the dead shifting '
    + 'in their bunks — and goes still. The band says nothing. Neither will the bar.',
    null, { literal: true, primary: true });
  d.emit('news:publish', {
    text: 'THE ERIS TOW-LINE WOKE — THE WHOLE CHOIR SWUNG ONCE, AND THE FOG TOOK THE SOUND',
    kind: 'incidents', sectorId: live.sectorId || LAST_POD.sectorId,
    source: 'eris_last_pod', eventId: 'eris_last_pod:woken',
  });
  return settleSituation(d, live, state, 'woken', {
    breakImpulse: Number.isFinite(load) ? Math.round(load) : null,
    bells: bellCount(state),
    reason: payload && payload.reason || null,
    barSilentUntil: now + LAST_POD.sectorWeekS,
  });
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: 'nebula_fog',
    twist: 'named',
    actor: 'faction_quiet',
  },
  title: 'THE ERIS LAST POD',
  factionId: 'faction_quiet',
  motive: 'the line\u2019s last pod, the chair, and the cut that decides',
  choices: [],
});
