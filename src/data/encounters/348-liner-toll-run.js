// 348 — Liner toll run through a customs picket. (SF-137: the gate line is real.)
//
// A named liner holds short of a customs gate line while a cutter picket sits the
// post. The gate is a place, not a flag: two pylon posts astride the lane mark the
// authorized corridor, and a parallel bypass gap down-lane is where the picket's
// scan authority does not reach. Three honest routes through one visible line:
//
//   request_crossing — the player hails the picket and the liner is waved through
//                      the gate NOW; escorting her out pays (+MTS rep, contract cr).
//   wait             — the hold is a legitimate delay; on schedule the picket
//                      waves the liner through the same gate itself.
//   run_the_gap      — the player waves the liner down the unguarded bypass; the
//                      moment she commits into the corridor the picket declares
//                      the run and goes weapons-free on its author. The crossing
//                      completes under fire, and the picket's faction keeps the
//                      receipt.
//
// Or the old way: break the picket and the lane clears itself. Authorization and
// the liner's position inside the corridor decide the outcome — never a hidden
// switch. The crossing test is a point-in-corridor read against the gate line,
// so sector orientation can never invert what counts as "through".
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 348;
export const trigger = deepFreeze({
  id: 'liner_toll_run',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.5,
  zoneTypes: ['trade_lane'],
  script: 'selfRegistered',
  fallbackScript: 'convoy',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  gates: {},
});

// Gate geometry (world units): the post straddles the lane; the liner waits
// HOLD_BACK short of it; the authorized corridor is GATE_HALF wide astride the
// post, the bypass runs BYPASS_OFF to one side. CROSS_AT is the exit ordinate —
// past it the liner is through the line; COMMIT_AT is where the picket calls a
// gap run while she is still inside the corridor.
const WINDOW_S = 240;
const HOLD_S = 75;              // the legitimate delay: on schedule the gate opens
const HOLD_BACK_WU = 430;
const GATE_HALF_WU = 150;
const BYPASS_OFF_WU = 430;
const BYPASS_HALF_WU = 150;
const COMMIT_AT_WU = 40;
const CROSS_AT_WU = 300;
const EXIT_WU = 950;
const PYLON_LINGER_S = 60;

function holdAt(ent, live, now, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 90,
      startedTick: Math.round(now * 60),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

function transitTo(ent, live, now, anchor, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: 4000,
      startedTick: Math.round(now * 60),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** along/lateral ordinates of pos against the gate frame (post, lane axis u, normal n). */
function gateOrdinates(gate, pos) {
  const dx = pos.x - gate.post.x, dz = pos.z - gate.post.z;
  return { along: dx * gate.u.x + dz * gate.u.z, lateral: dx * gate.n.x + dz * gate.n.z };
}

function releaseLiner(d, live, route) {
  const run = live.data.tollrun;
  const liner = d.entsOf(live, 'liner')[0];
  if (!liner || !run || run.released) return;
  run.released = route;
  const post = run.post, u = run.u, n = run.n;
  const lateral = route === 'gap' ? BYPASS_OFF_WU * run.gapSide : 0;
  const exit = {
    x: post.x + u.x * EXIT_WU + n.x * lateral,
    z: post.z + u.z * EXIT_WU + n.z * lateral,
  };
  transitTo(liner, live, d.now(), exit, `liner_toll_run:${route}_run`);
}

// The pylons are the visible gate line; on resolve they stand down rather than
// litter the lane. Stamped despawn, never a teleported erase.
function retirePylons(d, live) {
  const now = d.now();
  for (const id of (live.data && live.data.pylonIds) || []) {
    const ent = d.state && d.state.entities ? d.state.entities.get(id) : null;
    if (ent && ent.alive !== false) {
      ent.data = ent.data || {};
      ent.data.despawnAt = now + PYLON_LINGER_S;
    }
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WINDOW_S;
    const ships = live.plan && live.plan.ships || [];
    const linerSpec = ships.find((sh) => sh && sh.role === 'liner');
    const cutterSpecs = ships.filter((sh) => sh && sh.role === 'cutter');
    if (!linerSpec || !cutterSpecs.length) return d.abort(live, 'no_cast');

    // The gate sits on the zone anchor astride the lane bearing. The lane axis
    // is the bearing the player actually approached on (the read she saw), with
    // a seeded fallback when the approach lands on the post itself.
    const post = live.plan && live.plan.zoneCenter
      ? { x: live.plan.zoneCenter.x, z: live.plan.zoneCenter.z }
      : (live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: 0, z: 0 });
    const rng = d.stream(live, 'tollrun_layout');
    const p = d.player();
    let ux = post.x - (p && p.pos ? p.pos.x : post.x - 1);
    let uz = post.z - (p && p.pos ? p.pos.z : post.z);
    let ul = Math.hypot(ux, uz);
    if (!(ul > 1)) {
      const a = rng() * Math.PI * 2;
      ux = Math.cos(a); uz = Math.sin(a); ul = 1;
    }
    const u = { x: ux / ul, z: uz / ul };
    const n = { x: -u.z, z: u.x };
    const gapSide = rng() < 0.5 ? -1 : 1;
    live.data.tollrun = {
      post, u, n, gapSide,
      holdEndAt: d.now() + HOLD_S,
      released: null,          // 'gate' | 'gap' | 'schedule'
      picketHot: false,
      scheduledSaid: false,
    };

    // Placement: the liner holds HOLD_BACK short of the post; the picket line
    // sits astride the gate mouth; the pylons draw the authorized corridor.
    linerSpec.pos = {
      x: post.x - u.x * HOLD_BACK_WU + n.x * (rng() - 0.5) * 60,
      z: post.z - u.z * HOLD_BACK_WU + n.z * (rng() - 0.5) * 60,
    };
    cutterSpecs.forEach((spec, i) => {
      const off = (i - (cutterSpecs.length - 1) / 2) * 110;
      spec.pos = {
        x: post.x - u.x * 60 + n.x * off,
        z: post.z - u.z * 60 + n.z * off,
      };
    });
    const ids = d.spawnShips(live, [linerSpec, ...cutterSpecs]);
    if (!ids.length || d.aliveCount(live, 'liner') < 1 || d.aliveCount(live, 'cutter') < 1) {
      return d.abort(live, 'no_budget');
    }

    const liner = d.entsOf(live, 'liner')[0];
    holdAt(liner, live, d.now(), 'liner_toll_run:gate_hold');
    for (const cutter of d.entsOf(live, 'cutter')) {
      holdAt(cutter, live, d.now(), 'liner_toll_run:picket_post');
    }

    live.data.pylonIds = [];
    for (const side of [-1, 1]) {
      const pylon = d.spawnProp(live, {
        pos: { x: post.x + n.x * GATE_HALF_WU * side, z: post.z + n.z * GATE_HALF_WU * side },
        radius: 10,
        scanLabel: 'GATE PYLON — LANE HOLD',
        tetherable: false,
      });
      if (pylon && pylon.id != null) live.data.pylonIds.push(pylon.id);
    }

    live.phase = 'hold';
    live.approach = { signal: 'liner_gate_line', contacts: ids.length, t: d.now() };
    d.say(live, 'alert', 'liner_toll_run_alert', null, { primary: true });
    d.offerChoices(
      live,
      live.shape.choices.map((c) => c.id),
      live.shape.timeoutChoice,
      live.data.tollrun.holdEndAt,
    );
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const run = live.data.tollrun;
    const liner = d.entsOf(live, 'liner')[0] || null;
    if (!liner) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'lost', { speak: false });
    }

    // The picket's own timetable: a legitimate hold opens the gate on schedule.
    if (!run.released && now >= run.holdEndAt) {
      if (!run.scheduledSaid) {
        run.scheduledSaid = true;
        d.say(live, 'bark', 'GATE PICKET: hold expired — cleared on schedule. Liner, you are through the line.', null, { literal: true });
      }
      releaseLiner(d, live, 'schedule');
    }

    const ords = gateOrdinates(run, liner.pos);
    const inGateBand = Math.abs(ords.lateral) <= GATE_HALF_WU;
    const inGapBand = Math.abs(ords.lateral - BYPASS_OFF_WU * run.gapSide) <= BYPASS_HALF_WU;

    // A gap run is a crime while it is still a geometry problem: the moment the
    // liner commits into the bypass corridor the picket declares the run and
    // goes weapons-free on the run's author — the player who waved her through.
    if (run.released === 'gap' && !run.picketHot && ords.along > COMMIT_AT_WU && inGapBand) {
      run.picketHot = true;
      d.say(live, 'alert', 'GATE PICKET: unauthorized crossing — that run has an author. Weapons free.', null, { literal: true });
      d.setPassive(live, false, 'cutter');
    }

    if (ords.along > CROSS_AT_WU) {
      if (inGateBand && (run.released === 'gate' || run.released === 'schedule')) {
        retirePylons(d, live);
        if (run.released === 'gate') {
          d.grant(350, 'liner:tollrun');
          d.rep('faction_mts', 4, 'liner_toll_run');
          d.despawnAll(live, 15, 'cutter');
          return d.resolve(live, 'escorted', { speak: true });
        }
        d.despawnAll(live, 20);
        return d.resolve(live, 'delayed', { speak: true });
      }
      // Through anywhere else — gap corridor or the open lane — the crossing is
      // real and unauthorized. If the picket somehow held fire to here, it opens now.
      retirePylons(d, live);
      if (!run.picketHot) { run.picketHot = true; d.setPassive(live, false, 'cutter'); }
      d.rep(live.plan && live.plan.factionId || 'faction_scn', -5, 'liner_toll_run_gate_run');
      return d.resolve(live, 'bypassed', { speak: true });
    }

    if (d.aliveCount(live, 'cutter') < 1) {
      // The picket flies the zone's flag (the planner fields it zone-local), so
      // the rep hit lands on whoever actually held the gate line.
      retirePylons(d, live);
      d.rep(live.plan && live.plan.factionId || 'faction_scn', -4, 'liner_toll_run_picket_broken');
      d.despawnAll(live, 15, 'liner');
      return d.resolve(live, 'ran', { speak: true });
    }

    if (now >= live.deadlineAt) {
      retirePylons(d, live);
      d.despawnAll(live, 12);
      return d.resolve(live, 'delayed', { speak: false });
    }
  },

  choose(d, live, state, choiceId) {
    const run = live.data.tollrun;
    if (!run || run.released || live.phase === 'done') return;
    if (choiceId === 'request_crossing') {
      // The permission route: the picket waves her through NOW, ahead of schedule.
      d.say(live, 'alert', 'GATE PICKET: crossing request logged. Liner, you are waved through — escort sees her out.', null, { literal: true });
      releaseLiner(d, live, 'gate');
      return;
    }
    if (choiceId === 'run_the_gap') {
      d.say(live, 'bark', 'ESCORT CHANNEL: the liner takes the gap. The picket will read the run when she commits.', null, { literal: true });
      releaseLiner(d, live, 'gap');
      return;
    }
    // 'wait' (and the offer timeout): no answer is an honest answer — the hold
    // runs its course and the gate opens on schedule.
  },

  event(d, live, state, name, p) {
    if (live.phase === 'done') return;
    const run = live.data.tollrun;
    if (name === 'playerHitSquad' && p && p.targetId != null
      && live.roles && live.roles[p.targetId] === 'cutter' && !run.picketHot) {
      // Touching the picket is the old answer: the gate defends itself.
      run.picketHot = true;
      d.say(live, 'alert', 'GATE PICKET: contact on the gate line — the picket answers.', null, { literal: true });
      d.setPassive(live, false, 'cutter');
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'escort',
    place: trigger.zoneTypes,
    twist: 'named',
    actor: 'customs_cutter',
  },
  // A scout watches the approach grow on the scope: the liner's gate-line signal
  // at 1500 WU resolves into the liner's hold plus the picket's post astride her lane.
  scoutApproach: {
    signal: 'liner_gate_line',
    rangeWu: 1500,
    resolves: 'liner_hold_and_picket_post',
  },
  verbs: ['escort', 'fight', 'outrun'],
  title: 'LINER AT THE GATE',
  choices: [
    { id: 'request_crossing', label: 'Hail the picket — wave her through now' },
    { id: 'run_the_gap', label: 'Wave her through the unguarded gap' },
    { id: 'wait', label: 'Hold — let the scan run its course' },
  ],
  timeoutChoice: 'wait',
  roster: [
    { cast: 'liner', archetype: 'mule_trader', team: 2, passive: true },
    { cast: 'cutter', archetype: 'customs_cutter', team: 2 },
  ],
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['customs_cutter'],
    size: [2, 2],
    clusterRadius: 90,
    minSeparation: 40,
    team: 2,
    doctrine: 'official',
    formation: 'line',
  },
  // Role names only — no `enabled`, so the planner borrows carrierRole/raiderRole
  // for the plan ships and leaves plan.predation null: no custody, no authority.
  // The picket keeps a customs name so the scope never reads it as raiders.
  predation: {
    carrierRole: 'liner',
    raiderRole: 'cutter',
  },
  bark: 'liner_toll_run_alert',
  transitS: WINDOW_S,
  receipts: {
    escorted: 'WAVED THROUGH — the liner cleared the gate on your hail. MTS logs the escort.',
    delayed: 'HELD ON SCHEDULE — the hold ran its course and the gate opened itself.',
    bypassed: 'GAP RUN COMPLETE — the liner slipped the picket. The gate keeps your name.',
    ran: 'PICKET BROKEN — the lane clears itself and the picket\'s flag keeps the receipt.',
    lost: 'LINER LOST — the gate line holds; there is no crossing left to argue about.',
  },
});
