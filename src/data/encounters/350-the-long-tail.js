// 350 — THE LONG TAIL (CR-CHAIN braid: a volatile pod as a moving mine).
// A breached fuel-cell courier is already running from raiders down the lane, and its hold is
// shedding volatile pods astern — a drifting trail of live explosives strung through the pursuit
// corridor. Nothing about the mine is scripted: any hull that clips a pod at closing speed cooks
// it off (lootShards volatile-slam path → radial impulse), so the raiders are threading a moving
// minefield to reach the courier, and the player's verbs all braid on the same physical objects —
// shoot a pod beside a pursuer, latch one and sling it, shove a raider into the line, clothesline
// a chase pair across the tail, or just scoop the freight while everyone else burns.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 350;
export const trigger = deepFreeze({
  id: 'volatile_tail',
  tier: 'minor',
  deck: 'combat',
  weight: 1.1,
  zoneTypes: ['trade_lane', 'refinery_approach', 'outlaw_zone'],
  // Self-registered runtime (below) wins fire/tick dispatch by shapeId; 'whisper' stays on the
  // schedule item so legacy planner tooling has a known label to inspect.
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 38,
  cooldownS: 660,
  proximity: true,
  // The tail only reads if the player can see it — slide the formation inside the usual reach.
  fireWithinWu: 340,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

// Tail geometry: pods drift along the courier's flee line at a fraction of its speed, so the
// trail stretches behind it and lies across the raiders' pursuit corridor.
const TRAIL_SEEDED_PODS = 5;       // already shed when the player arrives — the visible tail
const TRAIL_SHED_MAX = 9;          // live shed budget while the courier runs
const TRAIL_SHED_PERIOD_S = 3.6;
const TRAIL_SPACING_WU = 26;       // seeded pod spacing astern of the courier
const TRAIL_POD_VEL_FRac = 0.45;   // shed pods keep this fraction of the courier's velocity
const COURIER_FLEE_SPEED = 56;     // WU/s initial flee velocity stamped on the courier
const ESCAPE_RANGE_WU = 1500;      // courier this far from the player is judged escaped
const RAID_DEADLINE_S = 95;

function fleeDirection(haulerPos, raiderPos, rng) {
  let dx = haulerPos.x - raiderPos.x;
  let dz = haulerPos.z - raiderPos.z;
  const len = Math.hypot(dx, dz);
  if (len > 1e-3) return { x: dx / len, z: dz / len };
  // Degenerate overlap: pick a fixed-seed lane direction so the tail still lays straight.
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a), z: Math.sin(a) };
}

function raiderCentroid(ships) {
  let x = 0, z = 0, n = 0;
  for (const sh of ships) {
    if (!sh || !sh.pos || sh.role !== 'raider') continue;
    x += sh.pos.x; z += sh.pos.z; n++;
  }
  return n > 0 ? { x: x / n, z: z / n } : null;
}

// Release the cast to world ownership without despawn stamps — the raid resolving must not
// delete the fleeing courier or the raiders mid-fight; they keep being world entities.
function releaseSquadToWorld(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function shedOnePod(d, live, state, courier, rng) {
  const pos = courier && courier.pos;
  if (!pos) return;
  const vel = courier.vel || { x: 0, z: 0 };
  const speed = Math.hypot(vel.x, vel.z);
  const lat = (rng() - 0.5) * 22; // small lateral scatter so the tail reads as debris, not beads
  const ux = speed > 1e-3 ? vel.x / speed : 0;
  const uz = speed > 1e-3 ? vel.z / speed : 0;
  d.spawnCargoPod(live, {
    pos: {
      x: pos.x - ux * 9 - uz * lat,
      z: pos.z - uz * 9 + ux * lat,
    },
    vel: { x: vel.x * TRAIL_POD_VEL_FRac, z: vel.z * TRAIL_POD_VEL_FRac },
    commodityId: 'cmdty_fuel_cells',
    amount: rng() < 0.3 ? 2 : 1,
    ownerId: courier.id != null ? courier.id : null,
    ownerName: 'fuel tender',
    factionId: 'faction_mts',
  });
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || RAID_DEADLINE_S);
    const ships = live.plan.ships;
    const haulerSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const centroid = raiderCentroid(ships);
    if (!haulerSpec || !centroid) return d.abort(live, 'no_cast');

    // Re-place the plan's positions into the tail layout before materialization: the courier
    // keeps its anchor, the raiders fan out astern of it along its flee vector, so the pursuit
    // corridor and the pod trail land on the same line.
    const rng = d.stream(live, 'tail_layout');
    const dir = fleeDirection(haulerSpec.pos, centroid, rng);
    let ri = 0;
    for (const sh of ships) {
      if (!sh || !sh.pos || sh.role !== 'raider') continue;
      const back = 150 + ri * 52;
      const lat = (rng() - 0.5) * 90;
      sh.pos.x = haulerSpec.pos.x - dir.x * back - dir.z * lat;
      sh.pos.z = haulerSpec.pos.z - dir.z * back + dir.x * lat;
      ri++;
    }
    live.data.tailDir = dir;

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const courier = d.entsOf(live, 'hauler')[0];
    // The courier is mid-run when the player arrives: already at flee speed, hull mauled, hold
    // breached — and shedding. The spilled cargo field stays authored so a courier kill still
    // physically sheds the unshed remainder through the ordinary violence-spill path.
    const holdQty = 10 + Math.round(d.stream(live, 'hold')() * 6);
    const cdata = courier.data || (courier.data = {});
    const cai = cdata.ai || (cdata.ai = {});
    cai.forceFlee = true;
    cai.moraleImmune = true; // the script owns its exit — it does not rout twice off one scare
    courier.vel = { x: dir.x * COURIER_FLEE_SPEED, z: dir.z * COURIER_FLEE_SPEED };
    courier.hull = Math.max(1, Math.round((courier.hullMax || courier.hull || 60) * 0.55));
    cdata.jobKind = 'hauler';
    cdata.cargo = { cmdty_fuel_cells: holdQty };
    cdata.scanLabel = 'FUEL TENDER — HOLD BREACHED';

    for (const raider of d.entsOf(live, 'raider')) {
      const rdata = raider.data || (raider.data = {});
      if (rdata.ai) rdata.ai.targetId = courier.id;
      (rdata.combat || (rdata.combat = {})).targetId = courier.id;
      if (rdata.ai) rdata.ai.pursueTargetId = courier.id;
    }

    // The seeded tail: pods already shed astern, drifting down the flee line slower than the
    // courier — the moving mine the raiders are about to thread.
    const podRng = d.stream(live, 'tail_pods');
    for (let i = 0; i < TRAIL_SEEDED_PODS; i++) {
      const back = 26 + i * TRAIL_SPACING_WU;
      const lat = (podRng() - 0.5) * 30;
      d.spawnCargoPod(live, {
        pos: {
          x: courier.pos.x - dir.x * back - dir.z * lat,
          z: courier.pos.z - dir.z * back + dir.x * lat,
        },
        vel: {
          x: dir.x * COURIER_FLEE_SPEED * TRAIL_POD_VEL_FRac,
          z: dir.z * COURIER_FLEE_SPEED * TRAIL_POD_VEL_FRac,
        },
        commodityId: 'cmdty_fuel_cells',
        amount: podRng() < 0.3 ? 2 : 1,
        ownerId: courier.id,
        ownerName: 'fuel tender',
        factionId: 'faction_mts',
      });
    }
    live.data.tail = { remaining: TRAIL_SHED_MAX, nextShedAt: d.now() + 2.0 };

    live.phase = 'conflict';
    d.say(live, 'alert',
      'DISTRESS RELAY: Fuel tender shedding volatiles under pursuit — its whole tail is live.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'MTS FUEL TENDER',
      text: 'Hold\'s breached — I\'m shedding the cells! Anything that touches that tail cooks. Stay off my line!',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const courier = d.entsOf(live, 'hauler')[0] || null;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;
    const tail = live.data.tail;

    // Live shed: while the courier runs with hold left, it keeps dropping volatile pods astern.
    // It sheds only while actually moving — a stopped tender has no tail to lay.
    if (courier && tail && tail.remaining > 0 && now >= tail.nextShedAt) {
      const vel = courier.vel || { x: 0, z: 0 };
      if (Math.hypot(vel.x, vel.z) > 6) {
        shedOnePod(d, live, state, courier, d.stream(live, `tail_shed_${tail.remaining}`));
        tail.remaining--;
      }
      tail.nextShedAt = now + TRAIL_SHED_PERIOD_S;
    }

    if (!courier) {
      // The tender is down; the spilled tail stays physical. The raiders keep being pirates —
      // release the cast rather than fading hulls out from under whatever happens next.
      releaseSquadToWorld(live);
      return d.resolve(live, 'courier_down', { speak: true });
    }

    if (!raidersAlive) {
      d.grant(220, 'convoy:guard');
      d.rep('faction_mts', 4, 'tail_defended');
      d.emit('comms:log', {
        from: 'MTS FUEL TENDER',
        text: 'Tail\'s clear. Salvage what\'s still drifting if you want it — I am not going back for it.',
        kind: 'encounter',
      });
      releaseSquadToWorld(live); // the courier keeps flying; the pods stay physical
      return d.resolve(live, 'defended', { speak: true });
    }

    // The courier outran the pursuit: far enough from the player that the raid is over.
    const player = d.player();
    if (player && player.pos && courier.pos) {
      const dx = courier.pos.x - player.pos.x;
      const dz = courier.pos.z - player.pos.z;
      if (dx * dx + dz * dz > ESCAPE_RANGE_WU * ESCAPE_RANGE_WU) {
        releaseSquadToWorld(live);
        return d.resolve(live, 'courier_escaped', { speak: true });
      }
    }

    if (now >= live.deadlineAt) {
      releaseSquadToWorld(live);
      return d.resolve(live, 'raid_over', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'mule_trader',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE LONG TAIL',
  primaryLine: 'DISTRESS RELAY: Fuel tender shedding volatiles under pursuit — its whole tail is live.',
  squad: {
    archetypes: ['reaver_pirate', 'wasp_swarmer'],
    size: [2, 3],
    doctrine: 'thief',
    formation: 'loose',
  },
  civilian: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'Volatile freight shedding across the lane — the trail is live.',
  deadlineS: RAID_DEADLINE_S,
  aftermath: {
    flee: 'The tender runs the tail dry and vanishes downlane.',
    kill: 'The tail keeps drifting — volatile pods, ownerless, still hot.',
  },
  receipts: {
    defended: 'TAIL DEFENDED — the tender lives. Its spilled cells drift ownerless on the lane.',
    courier_down: 'TENDER DOWN — the raiders took it. The tail is still out there, still live.',
    courier_escaped: 'TENDER AWAY — it shed the last of the hold and cleared the lane.',
    raid_over: 'The pursuit burned out. Pods from the tail are still drifting the lane.',
  },
});
