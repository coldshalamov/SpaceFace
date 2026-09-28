// 348 — Liner toll run through a customs picket.
//
// A named liner crosses a trade lane while a customs cutter picket holds a gate
// line demanding stop-and-scan. The player can fly escort, pay the toll pressure
// off by breaking the picket (and take the rep hit), or let the liner eat the
// delay. Reuses the escort frame and the toll deck; new: the gate line as a
// civilian-deck obstacle with three honest outcomes.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 348;
export const trigger = deepFreeze({
  id: 'liner_toll_run',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.5,
  zoneTypes: ['trade_lane'],
  script: 'convoy',
  fallbackScript: 'convoy',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  gates: {},
});

const WINDOW_S = 240;

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WINDOW_S;
    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs the liner AND the picket: a liner with no gate line is
    // just traffic, and a gate with no liner has nothing to hold. (344 idiom.)
    if (!ids.length || d.aliveCount(live, 'liner') < 1 || d.aliveCount(live, 'cutter') < 1) {
      return d.abort(live, 'no_budget');
    }
    const liner = d.entsOf(live, 'liner')[0];
    const anchor = (liner && liner.pos) || { x: 0, z: 0 };
    live.data.tollrun = { exitX: anchor.x + 1500 };
    live.approach = {
      signal: 'liner_gate_line',
      contacts: ids.length,
      t: d.now(),
    };
    live.phase = 'escort';
    d.say(live, 'alert', 'liner_toll_run_alert', null, { primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    // entsOf only returns live hulls, so a missing liner is a destroyed one.
    const liner = d.entsOf(live, 'liner')[0] || null;
    if (!liner) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'lost', { speak: false });
    }
    if (liner.pos && liner.pos.x >= live.data.tollrun.exitX) {
      d.grant(350, 'liner:tollrun');
      d.rep('faction_mts', 4, 'liner_toll_run');
      // The escorted liner flies on down the lane; the picket stands down.
      d.despawnAll(live, 15, 'cutter');
      return d.resolve(live, 'escorted', { speak: true });
    }
    if (d.aliveCount(live, 'cutter') < 1) {
      // The picket flies the zone's flag (the planner fields it zone-local), so
      // the rep hit lands on whoever actually held the gate line.
      d.rep(live.plan.factionId || 'faction_scn', -4, 'liner_toll_run_picket_broken');
      return d.resolve(live, 'ran', { speak: true });
    }
    if (now >= live.deadlineAt) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'delayed', { speak: false });
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
  // at 1500 WU resolves into the liner's course plus the picket's holding pattern.
  scoutApproach: {
    signal: 'liner_gate_line',
    rangeWu: 1500,
    resolves: 'liner_course_and_picket_line',
  },
  verbs: ['escort', 'fight', 'outrun'],
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
    squadRecipe: 'picket_wall',
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
  transitS: 240,
});
