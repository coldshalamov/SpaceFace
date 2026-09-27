// 347 — Archive dive on a dead core with scavengers inbound.
//
// A dead archive core drifts with a scannable signature while a scavenger flight
// closes to strip it. The player can scan it first (scan verb), fight off the
// scavengers, or let them strip it. Reuses the scan verb and the claim-and-clear
// consequence; new: the scan race as a civilian-deck pressure shape.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 347;
export const trigger = deepFreeze({
  id: 'archive_dive',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.5,
  zoneTypes: ['derelict_field'],
  script: 'haunted',
  fallbackScript: 'haunted',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
  gates: {},
});

const STRIP_RADIUS = 120;
const WINDOW_S = 180;
// A pulse credits the dive when the player fires it inside the unmodified pulse
// reach (scanner NEAR_SCAN_RADIUS). Range upgrades reach further; the gate stays
// conservative on purpose — the core's scout range is the same 1200 WU.
const PULSE_CREDIT_RADIUS = 1200;
const PULSES_TO_RECOVER = 3;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WINDOW_S;
    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs the core AND at least one scavenger: a core with nobody
    // racing for it resolves nothing honestly. (344 idiom.)
    if (!ids.length || d.aliveCount(live, 'core') < 1 || d.aliveCount(live, 'scavenger') < 1) {
      return d.abort(live, 'no_budget');
    }
    const core = d.entsOf(live, 'core')[0];
    core.data = core.data || {};
    core.data.scannable = true;
    core.data.scanProgress = 0;
    live.approach = {
      signal: 'archive_core_ping',
      contacts: ids.length,
      t: d.now(),
    };
    live.phase = 'dive';
    d.say(live, 'alert', 'archive_dive_alert', null, { primary: true });
  },

  event(d, live, state, name, payload) {
    if (live.phase === 'done' || name !== 'scanPulse') return;
    const core = d.entsOf(live, 'core')[0] || null;
    if (!core || core.data.scannable !== true) return;
    if (!payload || !payload.pos || !core.pos) return;
    if (dist(payload.pos, core.pos) > PULSE_CREDIT_RADIUS) return;
    core.data.scanProgress = Math.min(1, Number(core.data.scanProgress || 0) + 1 / PULSES_TO_RECOVER);
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    // entsOf only returns live hulls, so a missing core is a destroyed one.
    const core = d.entsOf(live, 'core')[0] || null;
    if (!core) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'core_lost', { speak: false });
    }
    if (Number(core.data.scanProgress) >= 1) {
      d.grant(250, 'archive:dive');
      d.rep('faction_archive', 4, 'archive_dive');
      // The recovered core stays behind for the archive crews; the flight scatters.
      d.despawnAll(live, 15, 'scavenger');
      return d.resolve(live, 'recovered', { speak: true });
    }
    const stripped = d.entsOf(live, 'scavenger').some((e) => (
      e.pos && core.pos && dist(e.pos, core.pos) <= STRIP_RADIUS
    ));
    if (stripped) {
      d.despawnAll(live, 12, 'scavenger');
      return d.resolve(live, 'stripped', { speak: true });
    }
    if (now >= live.deadlineAt) {
      d.despawnAll(live, 12);
      return d.resolve(live, 'stripped', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'archive',
    place: trigger.zoneTypes,
    twist: 'unique_wreck',
    actor: 'reaver_pirate',
  },
  // A scout watches the approach grow on the scope: the archive ping at 1200 WU
  // resolves into the core's drift plus the scavenger flight's inbound vectors.
  scoutApproach: {
    signal: 'archive_core_ping',
    rangeWu: 1200,
    resolves: 'core_drift_and_scavenger_vectors',
  },
  verbs: ['scan', 'salvage'],
  roster: [
    { cast: 'core', archetype: 'mule_trader', team: 2, passive: true },
    { cast: 'scavenger', archetype: 'reaver_pirate', team: 1 },
  ],
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_archive',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['reaver_pirate'],
    size: [3, 3],
    clusterRadius: 120,
    minSeparation: 40,
    team: 1,
    doctrine: 'thief',
    formation: 'wedge',
  },
  // Role names only — no `enabled`, so the planner borrows carrierRole/raiderRole
  // for the plan ships and leaves plan.predation null: no custody, no authority.
  predation: {
    carrierRole: 'core',
    raiderRole: 'scavenger',
  },
  cachePool: {
    cmdty_salvage_electronics: 2,
    cmdty_scrap_metal: 3,
  },
  bark: 'archive_dive_alert',
  transitS: 180,
});
