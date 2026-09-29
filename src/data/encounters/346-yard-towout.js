// 346 — Yard tow-out on a real yard machine (SF-136).
//
// A dead MTS hauler drifts into a working yard machine's intake — an authored
// environmentalMachinery kill machine bound by stable world identity at fire time
// (no offer before its physical premise exists). The danger is the machine's OWN
// law: fixed field geometry in its site frame, the shared warning/surge/calm cycle,
// and the field kernel's shove-into-anvil crumple payoff. Nothing here chases the
// hauler with a private radius, and nothing here asserts damage that did not
// occur: 'crushed' resolves only when the machinery really destroyed the hull,
// 'withdrawn' resolves an expired offer with the hauler truthfully still afloat.
// The player tows it clear (latch/tow verbs), times the calm beats, or accepts the
// salvage after a real loss. Reuses the tow verb; the aftermath is the world's own
// death path plus one encounter debris grant at the true death position.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  ALL_KILL_MACHINE_BY_ID,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinesForSector,
  pointInsideKillMachine,
} from '../environmentalMachinery.js';

export const encounterOrder = 346;
export const trigger = deepFreeze({
  id: 'yard_towout',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.5,
  zoneTypes: ['civilian_core'],
  // The premise is a REAL machine: only sectors whose civilian core sits within
  // MACHINE_REACH_WU of an authored kill machine may schedule it (helios claim
  // cracker, rift fissure cracker, tethys weigh clamp — measured on the live data).
  // Everywhere else there is no yard jaw, so there is no offer.
  gates: {
    sectorIds: ['sector_helios_prime', 'sector_haumea_rift', 'sector_tethys_junction'],
  },
  // Self-registered runtime (below) dispatches by shapeId; the legacy script labels must name
  // real ENCOUNTER_SCRIPTS keys for check tooling — 'salvage' is not one. Sibling modules leave
  // fallbackScript unset so the schedule label defaults to 'whisper'.
  script: 'selfRegistered',
  pressureCost: 20,
  cooldownS: 600,
  proximity: true,
});

const MACHINE_REACH_WU = 1500;   // zone anchor → nearest machine root; beyond it there is no scene
const SPAWN_PAD_WU = 22;         // hauler spawns this far upstream of the intake edge
const DRIFT_THROTTLE = 0.02;     // the dying hull's last burn: a crawl on a fixed collision course
const CLEAR_PAD_WU = 80;         // real safe zone: hazardRadius + this, outside the field geometry
const STABLE_CLEAR_TICKS = 2;    // outward separation must hold this many director ticks
const WINDOW_S = 150;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

/** Nearest authored kill machine to the zone anchor, or null when no yard is reachable. */
function yardMachineFor(live) {
  const machines = killMachinesForSector(live.sectorId);
  if (!machines.length || !live.anchor) return null;
  let best = null;
  let bestDist = Infinity;
  for (const machine of machines) {
    const d = dist(live.anchor, machine.globalPos);
    if (d < bestDist && d <= MACHINE_REACH_WU) {
      best = machine;
      bestDist = d;
    }
  }
  return best;
}

/** Upstream spawn point: just outside the intake's gather geometry, inside the clear bar. */
function intakeUpstreamPos(machine) {
  const field = machine.fields[0];
  const center = killMachineFieldCenter(machine, field);
  const dir = killMachineFieldDir(machine, field);
  return {
    x: center.x - dir.x * (field.radius + SPAWN_PAD_WU),
    z: center.z - dir.z * (field.radius + SPAWN_PAD_WU),
  };
}

// The sanctioned passive-ship steer (claim-beacon idiom): write the flight intent,
// flightV3 thrusts it. Scaled far down — the hauler is dying, not commuting. The
// TARGET is the machine's anvil: a world-fixed point. The machine never moves.
function aimHaulerIntoThroat(hauler, machine, throttle) {
  if (!hauler || !hauler.pos || !machine) return;
  const target = machine.anvil.pos;
  const dx = target.x - hauler.pos.x;
  const dz = target.z - hauler.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const cf = Math.cos(hauler.rot || 0);
  const sf = Math.sin(hauler.rot || 0);
  const data = hauler.data || (hauler.data = {});
  const intent = data.intent || (data.intent = {});
  intent.moveZ = clamp1((cf * ux + sf * uz) * throttle);
  intent.moveX = clamp1((-sf * ux + cf * uz) * throttle);
  intent.aimAngle = Math.atan2(dz, dx);
  intent.fire = false;
}

function clearHaulerIntent(hauler) {
  if (!hauler || !hauler.data) return;
  const intent = hauler.data.intent;
  if (!intent) return;
  intent.moveZ = 0;
  intent.moveX = 0;
  intent.fire = false;
}

/** The encounter's aftermath grant after a REAL machinery kill: the load becomes
 *  salvage where the hull actually died. Spawned once, after the death — never instead of it. */
function spawnCrushLeavings(d, live, pos) {
  if (!pos || typeof d.spawnWreck !== 'function') return;
  d.spawnWreck(live, {
    pos,
    pool: { cmdty_scrap_metal: 4, cmdty_ore_iron: 1 },
    scanLabel: 'Crusher leavings',
    storyPropKind: 'yard_crush_debris',
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    // No offer before its physical premise exists: bind a real yard machine first.
    const machine = yardMachineFor(live);
    if (!machine) return d.abort(live, 'no_machine');
    live.deadlineAt = d.now() + WINDOW_S;
    const ids = d.spawnShips(live, live.plan.ships);
    // The premise needs the hauler AND the yard skiff on the field: a partial
    // budget grant that lands one hull is a different encounter. (344 idiom.)
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'skiff') < 1) {
      return d.abort(live, 'no_budget');
    }
    const hauler = d.entsOf(live, 'hauler')[0];
    // Entity-level: the readers (convoyTargetDisabled, engagement gating) check
    // ent.disabled, not ent.data. A dead hauler is scenery that can be towed.
    hauler.disabled = true;
    // Place the cast at the machine: the hauler upstream of the intake (outside the
    // gather geometry, inside the clear bar), the skiff off-axis as the signaler.
    const spawnPos = intakeUpstreamPos(machine);
    hauler.pos.x = spawnPos.x;
    hauler.pos.z = spawnPos.z;
    const skiff = d.entsOf(live, 'skiff')[0];
    if (skiff && skiff.pos) {
      const field = machine.fields[0];
      const perp = { x: -killMachineFieldDir(machine, field).z, z: killMachineFieldDir(machine, field).x };
      skiff.pos.x = spawnPos.x + perp.x * 120;
      skiff.pos.z = spawnPos.z + perp.z * 120;
    }
    aimHaulerIntoThroat(hauler, machine, DRIFT_THROTTLE);
    live.data.towout = {
      machineId: machine.id,
      haulerId: hauler.id,
      latched: false,
      everInDanger: false,
      inDanger: false,
      clearStreak: 0,
      lastPos: { x: hauler.pos.x, z: hauler.pos.z },
    };
    live.approach = {
      signal: 'yard_crusher_clock',
      contacts: ids.length,
      t: d.now(),
    };
    live.phase = 'tow';
    d.say(live, 'alert', 'yard_towout_alert', null, { primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const tow = live.data.towout;
    if (!tow) return;
    const machine = ALL_KILL_MACHINE_BY_ID[tow.machineId];
    if (!machine) return d.abort(live, 'machine_missing');
    // entsOf only returns live hulls, so a missing hauler is a lost one.
    const hauler = d.entsOf(live, 'hauler')[0] || null;
    if (!hauler) {
      // Truth first: did the MACHINERY take it, or did it die elsewhere? A crush is
      // asserted only for a hull whose last living position was inside the jaw.
      if (tow.inDanger) {
        spawnCrushLeavings(d, live, tow.lastPos);
        d.despawnAll(live, 12, 'skiff');
        return d.resolve(live, 'crushed', { speak: true });
      }
      d.despawnAll(live, 12);
      return d.resolve(live, 'hauler_lost', { speak: false });
    }
    tow.lastPos = { x: hauler.pos.x, z: hauler.pos.z };
    tow.inDanger = pointInsideKillMachine(machine, hauler.pos);
    tow.everInDanger = tow.everInDanger || tow.inDanger;
    // The failing autopilot keeps the collision course until the tow owns the hull.
    if (!tow.latched) aimHaulerIntoThroat(hauler, machine, DRIFT_THROTTLE);
    // Real safe zone: outside the machine's own field geometry AND beyond its authored
    // hazard radius, held stable. A body just outside the true throat is still in play.
    const distRoot = dist(hauler.pos, machine.globalPos);
    const engaged = tow.everInDanger === true || tow.latched === true;
    const clear = engaged && !tow.inDanger && distRoot >= machine.hazardRadius + CLEAR_PAD_WU;
    tow.clearStreak = clear ? tow.clearStreak + 1 : 0;
    if (tow.clearStreak >= STABLE_CLEAR_TICKS) {
      d.grant(300, 'yard:towout');
      d.rep('faction_mts', 4, 'yard_towout');
      // The towed hauler stays in the world it was towed into; the skiff stands down.
      d.despawnAll(live, 15, 'skiff');
      // Shape receipts render raw (resolve() reads live.shape.receipts[outcome] verbatim;
      // vars interpolation only exists in the family fallback) — the amount is inlined.
      return d.resolve(live, 'towed', { speak: true });
    }
    if (now >= live.deadlineAt) {
      // The offer expires without a physical crush: the yard stands down. No damage is
      // asserted, no wreck is minted — the hauler is truthfully still afloat.
      d.despawnAll(live, 15, 'skiff');
      return d.resolve(live, 'withdrawn', { speak: true });
    }
  },

  event(d, live, state, name, p) {
    const tow = live && live.data && live.data.towout;
    if (!tow || name !== 'tetherAttached') return;
    if (!p || p.targetId !== tow.haulerId) return;
    // The tow owns the hull from here: a latched hull must not thrust against its rope.
    tow.latched = true;
    const hauler = d.entsOf(live, 'hauler')[0];
    clearHaulerIntent(hauler);
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'yard',
    place: trigger.zoneTypes,
    twist: 'depth',
    actor: 'mule_trader',
  },
  // A scout watches the approach grow on the scope: the crusher clock signal at
  // 900 WU resolves into the hauler's drift vector plus the jaw's fixed cycle.
  scoutApproach: {
    signal: 'yard_crusher_clock',
    rangeWu: 900,
    resolves: 'hauler_drift_and_crusher_countdown',
  },
  verbs: ['latch', 'tow'],
  roster: [
    { cast: 'hauler', archetype: 'mule_trader', team: 2, passive: true },
    { cast: 'skiff', archetype: 'mule_trader', team: 2, passive: true },
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
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  // Role names only — no `enabled`, so the planner borrows carrierRole/raiderRole
  // for the plan ships and leaves plan.predation null: no custody, no authority.
  // The skiff keeps a yard name so the scope never reads it as a raider.
  predation: {
    carrierRole: 'hauler',
    raiderRole: 'skiff',
  },
  bark: 'yard_towout_alert',
  transitS: 150,
  // Shape-level receipts (resolve() reads live.shape.receipts first): the outcome
  // lines name the machine law, never a fake crush.
  receipts: {
    towed: 'TOW CLEAR — the hauler rides out past the yard machine. 300 cr.',
    crushed: 'CRUSHED — the yard machine took the hauler. Its load is in the leavings.',
    withdrawn: 'YARD STANDS DOWN — the jaw never closed. The hauler is still out there.',
  },
});
