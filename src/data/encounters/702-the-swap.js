// 702 — THE SWAP (E-07, Quiet signature). Two runners across a rock field toss a sealed
// crate between hulls to keep it off your manifest. Catching it mid-air with the Line is
// the game's cleanest skill shot — and the first throw is the decoy. The REAL crate rides
// the second throw back. Interfere and they say nothing at all: your route just got sold
// (state.story.flags.quiet_sold_route — the mark they leave).
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as QUIET } from '../factions/quiet.js';

export const encounterOrder = 702;
export const trigger = deepFreeze({
  id: 'the_swap',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.8,
  zoneTypes: ['derelict_field', 'mining_belt', 'ambush_lane'],
  script: 'selfRegistered',
  fallbackScript: 'traderRun',
  pressureCost: 22,
  cooldownS: 1100,
  proximity: true,
  fireWithinWu: 640,
  gates: { maxSecurity: 0.55 },   // the Quiet does not work under a full customs weir
});

const JUGGLE = (QUIET.custom && QUIET.custom.juggling) || {};
const DECOY = (QUIET.custom && QUIET.custom.decoyPods) || {};
const SWAP = (QUIET.custom && QUIET.custom.theSwap) || {};
const SOLD = (QUIET.custom && QUIET.custom.soldRoutes) || {};
const WINDUP_S = Math.max(0.5, Number(JUGGLE.windupS) || 2.2);
const FLIGHT_S = Math.max(1, Number(JUGGLE.handoffFlightS) || 4.5);
const CATCH_WU = Math.max(10, Number(JUGGLE.catchRadiusWu) || 60);
const BEAT_S = 1.0;              // the receiver's glove beat before it throws back
const SPREAD_WU = 820;           // the runners' standoff across the field
const REAL_VALUE_CR = Math.max(0, Number(SWAP.realCrateValueCr) || 2600);
const DEADLINE_S = 90;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function markRouteSold(d, live, why) {
  // The mark they leave: a route you used gets sold — next time it is patrolled.
  const state = d.state;
  const story = state.story || (state.story = { flags: {} });
  story.flags[SOLD.markFlag || 'quiet_sold_route'] = {
    atS: d.now(), sectorId: live.sectorId || null, reason: why,
  };
  d.emit('quiet:routeSold', {
    encounterId: live.id, sectorId: live.sectorId || null, reason: why, t: d.now(),
  });
  d.emit('comms:log', { from: '—', text: '…', kind: 'encounter' }); // the Quiet often says nothing
}

function pinToHolder(crate, holder) {
  crate.pos.x = holder.pos.x + 18;
  crate.pos.z = holder.pos.z + 10;
  crate.vel.x = 0; crate.vel.z = 0;
}

function throwCrate(crate, from, to) {
  // Deterministic ballistic: flat flight, no gravity — the skill shot is the intercept.
  const dx = to.pos.x - from.pos.x, dz = to.pos.z - from.pos.z;
  crate.vel.x = dx / FLIGHT_S;
  crate.vel.z = dz / FLIGHT_S;
  crate.data.flight = { toId: to.id, t: 0 };
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const a = ships.find((s) => s && s.role === 'squad');
    const b = ships.find((s) => s && s.role === 'escort');
    if (a) a.pos = { x: center.x - SPREAD_WU / 2, z: center.z };
    if (b) b.pos = { x: center.x + SPREAD_WU / 2, z: center.z + 60 };
    const ids = d.spawnShips(live, [a, b].filter(Boolean));
    if (ids.length < 2) return d.abort(live, 'no_cast');
    const [runnerA, runnerB] = d.entsOf(live, 'squad').concat(d.entsOf(live, 'escort'));
    for (const r of [runnerA, runnerB]) {
      if (!r) continue;
      const ai = r.data && (r.data.ai || (r.data.ai = {}));
      if (ai) { ai.passive = true; ai.holdPosition = true; }
      if (r.data) r.data.scanLabel = 'QUIET RUNNER — NO MANIFEST';
    }
    if (!runnerA || !runnerB) return d.abort(live, 'no_cast');

    // Two sealed crates. The decoy is the show — it reads 220 t to anything that scans it.
    const decoy = d.spawnCargoPod(live, {
      pos: { x: runnerA.pos.x, z: runnerA.pos.z }, vel: { x: 0, z: 0 },
      commodityId: 'cmdty_machine_parts', amount: 1, unitMass: 12,
      ownerName: 'unclaimed', factionId: 'faction_quiet',
    });
    const real = d.spawnCargoPod(live, {
      pos: { x: runnerB.pos.x, z: runnerB.pos.z }, vel: { x: 0, z: 0 },
      commodityId: 'cmdty_contraband_med', amount: 4, unitMass: 8,
      ownerName: 'unclaimed', factionId: 'faction_quiet',
    });
    if (!decoy || !real) return d.abort(live, 'no_bodies');
    decoy.data.scanLabel = 'SEALED CRATE — READS HEAVY';
    decoy.data.decoySpoofMassT = Number(DECOY.spoofMassT) || 220;
    decoy.data.swapDecoy = true;
    real.data.scanLabel = 'SEALED CRATE';
    real.data.swapReal = true;
    real.data.realValueCr = REAL_VALUE_CR;

    live.data.swap = {
      runnerAId: runnerA.id, runnerBId: runnerB.id,
      decoyId: decoy.id, realId: real.id,
      phase: 'windup', phaseAt: d.now(),
      throwNo: 0,
    };
    live.phase = 'conflict';
    d.say(live, 'alert', 'Two hulls, one crate, no manifest. Watch the hands.', null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const rec = live.data && live.data.swap;
    if (!rec || live.phase === 'done') return;
    if (name === 'tetherAttached' && payload) {
      const caughtId = payload.targetId;
      const playerId = (d.player() && d.player().id) || state.playerId;
      const byPlayer = payload.actorId === playerId || payload.controllerId === playerId || !playerId;
      if (!byPlayer) return;
      if (caughtId === rec.decoyId) {
        const decoy = state.entities.get(rec.decoyId);
        if (decoy && decoy.data) { decoy.data.decoySpoofMassT = 0; decoy.data.scanLabel = 'DECOY — BALLAST AND A LIE'; }
        markRouteSold(d, live, 'player_interference');
        releaseCast(live);
        return d.resolve(live, 'decoy_caught', { speak: true });
      }
      if (caughtId === rec.realId) {
        d.grant(REAL_VALUE_CR, 'the_swap_real_crate');
        d.rep('faction_quiet', -2, 'the_swap_crate_caught');
        markRouteSold(d, live, 'crate_caught');
        releaseCast(live);
        return d.resolve(live, 'crate_caught', { speak: true });
      }
    }
    if ((name === 'entityGone' || name === 'squadKill') && payload) {
      if (payload.id === rec.runnerAId || payload.id === rec.runnerBId) {
        d.rep('faction_quiet', -3, 'the_swap_runner_downed');
        markRouteSold(d, live, 'runner_downed');
        releaseCast(live);
        return d.resolve(live, 'runner_downed', { speak: true });
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.swap;
    if (!rec) return;
    const runnerA = state.entities.get(rec.runnerAId);
    const runnerB = state.entities.get(rec.runnerBId);
    const decoy = state.entities.get(rec.decoyId);
    const real = state.entities.get(rec.realId);

    const flight = (crate, catcher) => {
      if (!crate || crate.alive === false || !crate.pos) return 'gone';
      if (!crate.data || !crate.data.flight) return 'held';
      const dx = crate.pos.x - catcher.pos.x, dz = crate.pos.z - catcher.pos.z;
      return (dx * dx + dz * dz <= CATCH_WU * CATCH_WU) ? 'landed' : 'flying';
    };

    switch (rec.phase) {
      case 'windup': {
        if (decoy && runnerA) pinToHolder(decoy, runnerA);
        if (real && runnerB) pinToHolder(real, runnerB);
        if (now - rec.phaseAt >= WINDUP_S) {
          rec.phase = 'flight1'; rec.phaseAt = now; rec.throwNo = 1;
          if (decoy && runnerA && runnerB) throwCrate(decoy, runnerA, runnerB);
          d.emit('comms:log', { from: '—', text: '…', kind: 'encounter' });
        }
        return;
      }
      case 'flight1': {
        const st = flight(decoy, runnerB || runnerA);
        if (st === 'landed') {
          rec.phase = 'beat'; rec.phaseAt = now;
          if (decoy && decoy.data) decoy.data.flight = null;
          if (decoy && runnerB) pinToHolder(decoy, runnerB);
        } else if (st === 'gone') {
          rec.phase = 'beat'; rec.phaseAt = now;
        }
        if (now >= live.deadlineAt) return finish(d, live, 'swap_completed');
        return;
      }
      case 'beat': {
        if (now - rec.phaseAt >= BEAT_S) {
          rec.phase = 'flight2'; rec.phaseAt = now; rec.throwNo = 2;
          // The second throw carries the real crate, back the way the show came from.
          if (real && runnerB && runnerA) throwCrate(real, runnerB, runnerA);
          d.emit('comms:log', { from: '—', text: '…', kind: 'encounter' });
        }
        return;
      }
      case 'flight2': {
        const st = flight(real, runnerA || runnerB);
        if (st === 'landed' || st === 'gone') {
          return finish(d, live, 'swap_completed');
        }
        if (now >= live.deadlineAt) return finish(d, live, 'swap_completed');
        return;
      }
      default:
        if (now >= live.deadlineAt) return finish(d, live, 'swap_completed');
        return;
    }

    function finish(dd, lv, outcome) {
      markRouteSold(dd, lv, 'swap_completed');
      releaseCast(lv);
      return dd.resolve(lv, outcome, { speak: true });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'trade',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_quiet',
  },
  motive: 'contraband_handoff',
  engagementTrigger: 'none',
  factionId: 'faction_quiet',
  context: 'civilian',
  title: 'THE SWAP',
  primaryLine: 'Two hulls, one crate, no manifest. Watch the hands.',
  squad: {
    archetypes: ['quiet_ghost'],
    size: [1, 1],
    doctrine: 'ghost',
    formation: 'none',
    passive: true,
  },
  escort: {
    archetypes: ['quiet_ghost'],
    size: [1, 1],
    doctrine: 'ghost',
    formation: 'none',
    factionId: 'faction_quiet',
    context: 'civilian',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'Two Quiet runners stand off across the rock field — a sealed crate between them.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The runners finish their handoff somewhere darker.',
    kill: 'The crate drifts unclaimed. The route remembers you.',
  },
  receipts: {
    crate_caught: 'CAUGHT — the real crate, mid-air. The cleanest catch in the lanes.',
    decoy_caught: 'A DECOY — ballast and a lie. The real crate walked the other way.',
    swap_completed: 'SWAPPED — the handoff finished. Your route is already sold.',
    runner_downed: 'A runner down. The Quiet files the route and the debt.',
    subject_gone: 'The field forgets the hands it never saw.',
  },
});
