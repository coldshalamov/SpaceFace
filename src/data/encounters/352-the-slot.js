// 352 — THE SLOT (CR-CHAIN braid: clothesline on rocks that are already there).
// A blockade runner is pinned in a rock pocket and the only clean lane out is the gap
// between two belt stones already on the field. The raiders pressing it are angled to
// funnel every juke through the same slot — so the pursuit keeps crossing one corridor.
// Nothing is strung yet: the braid is that the corridor is real. A line latched rock-to-
// rock across the gap clotheslines whatever crosses it — stuntRecognition already pays
// the 'clothesline' grade for exactly that. The player supplies the rope; the world
// supplies the gate, the chase, and the pressure.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 352;
export const trigger = deepFreeze({
  id: 'rock_slot_chase',
  tier: 'minor',
  deck: 'combat',
  weight: 1.0,
  // The braid needs real stones: belt and derelict zones are where the field already
  // carries big anchorable rocks. If the fire-time scan finds no gate, the script aborts
  // honest — the situation cannot exist without the corridor.
  zoneTypes: ['mining_belt', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 30,
  cooldownS: 700,
  proximity: true,
  fireWithinWu: 420,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

// Gate geometry: two anchorable rocks close enough to read as one corridor, wide enough
// that a ship threading it is a clean miss by accident and a clean hit on a strung line.
const GATE_MIN_SEP_WU = 170;    // narrower and the chase stops threading it
const GATE_MAX_SEP_WU = 430;    // wider and the corridor stops reading as a slot
const GATE_SEARCH_RADIUS_WU = 700; // rocks this far from the zone anchor count as local
const RUNNER_FLEE_SPEED = 74;
const RAIDER_PRESS_SPEED = 88;
const RAID_DEADLINE_S = 100;
const ESCAPE_RANGE_WU = 1400;

function findGate(state, center) {
  const rocks = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
    const dx = e.pos.x - center.x, dz = e.pos.z - center.z;
    if (dx * dx + dz * dz > GATE_SEARCH_RADIUS_WU * GATE_SEARCH_RADIUS_WU) continue;
    rocks.push(e);
  }
  let best = null;
  for (let i = 0; i < rocks.length; i++) {
    for (let j = i + 1; j < rocks.length; j++) {
      const a = rocks[i], b = rocks[j];
      const sep = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      const gap = sep - (a.radius || 0) - (b.radius || 0);
      if (sep < GATE_MIN_SEP_WU || sep > GATE_MAX_SEP_WU || gap < 60) continue;
      const midx = (a.pos.x + b.pos.x) / 2, midz = (a.pos.z + b.pos.z) / 2;
      // Score: prefer the slot nearest the encounter anchor — the player saw this pair.
      const dcost = Math.hypot(midx - center.x, midz - center.z);
      if (!best || dcost < best.dcost) {
        best = { a, b, mid: { x: midx, z: midz }, sep, dcost };
      }
    }
  }
  return best;
}

// Same contract as 344/350/351: resolving must not stamp the cast for despawn.
function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || RAID_DEADLINE_S);
    const center = live.plan && live.plan.zoneCenter;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_zone_anchor');
    }
    const gate = findGate(state, center);
    if (!gate) return d.abort(live, 'no_gate');
    live.data.gate = {
      aId: gate.a.id, bId: gate.b.id,
      mid: { x: gate.mid.x, z: gate.mid.z },
    };

    const ships = live.plan.ships;
    const runnerSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const raiderSpecs = ships.filter((sh) => sh && sh.role === 'raider');
    if (!runnerSpec || !raiderSpecs.length) return d.abort(live, 'no_cast');

    // Corridor axis: perpendicular to the gate line. The runner is pinned just past the
    // slot on the far side; the raiders press from astern on the near side, fanned so any
    // juke still routes through the gap — the pursuit corridor IS the slot.
    const gx = gate.b.pos.x - gate.a.pos.x, gz = gate.b.pos.z - gate.a.pos.z;
    const glen = Math.hypot(gx, gz) || 1;
    const gateLine = { x: gx / glen, z: gz / glen };
    const corridor = { x: -gateLine.z, z: gateLine.x }; // perpendicular = the slot's axis
    const rng = d.stream(live, 'slot_layout');
    if (rng() < 0.5) { corridor.x = -corridor.x; corridor.z = -corridor.z; } // either approach reads the same

    runnerSpec.pos.x = gate.mid.x + corridor.x * 130;
    runnerSpec.pos.z = gate.mid.z + corridor.z * 130;
    const runnerVel = { x: corridor.x * RUNNER_FLEE_SPEED, z: corridor.z * RUNNER_FLEE_SPEED };

    let ri = 0;
    const raiderVels = [];
    for (const spec of raiderSpecs) {
      // Spread astern along the gate line so the flank pressure walls the corridor.
      const lateral = (ri - (raiderSpecs.length - 1) / 2) * gate.sep * 0.7;
      spec.pos.x = gate.mid.x - corridor.x * 320 + gateLine.x * lateral;
      spec.pos.z = gate.mid.z - corridor.z * 320 + gateLine.z * lateral;
      const dx = runnerSpec.pos.x - spec.pos.x, dz = runnerSpec.pos.z - spec.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      raiderVels.push({ x: (dx / len) * RAIDER_PRESS_SPEED, z: (dz / len) * RAIDER_PRESS_SPEED });
      ri++;
    }

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const runner = d.entsOf(live, 'hauler')[0];
    runner.vel = { x: runnerVel.x, z: runnerVel.z };
    const rdata = runner.data || (runner.data = {});
    const rai = rdata.ai || (rdata.ai = {});
    rai.forceFlee = true;
    rai.moraleImmune = true;
    rdata.jobKind = 'runner';
    rdata.scanLabel = 'BLOCKADE RUNNER — PINNED';

    const spawnedRaiders = d.entsOf(live, 'raider');
    spawnedRaiders.forEach((raider, i) => {
      if (raiderVels[i]) raider.vel = { x: raiderVels[i].x, z: raiderVels[i].z };
      const rd = raider.data || (raider.data = {});
      (rd.combat || (rd.combat = {})).targetId = runner.id;
      if (rd.ai) {
        rd.ai.targetId = runner.id;
        rd.ai.pursueTargetId = runner.id;
      }
    });

    live.phase = 'conflict';
    d.say(live, 'alert',
      'LANE WATCH: a runner is pinned between the stones — the press is on, one corridor wide.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'BLOCKADE RUNNER',
      text: 'They keep herding me at the same gap. If somebody strung a line across that slot, this chase would end itself.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const runner = d.entsOf(live, 'hauler')[0] || null;
    const raidersAlive = d.aliveCount(live, 'raider') > 0;

    if (!runner) {
      releaseCast(live);
      return d.resolve(live, 'runner_down', { speak: true });
    }

    if (!raidersAlive) {
      d.grant(160, 'slot:runner_saved');
      d.rep('faction_mts', 3, 'slot_cleared');
      d.emit('comms:log', {
        from: 'BLOCKADE RUNNER',
        text: 'Press broke. That gap owes you one — I owe you two.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'runner_saved', { speak: true });
    }

    // Outran the press: far enough from the player that the chase is over.
    const player = d.player();
    if (player && player.pos && runner.pos) {
      const dx = runner.pos.x - player.pos.x;
      const dz = runner.pos.z - player.pos.z;
      if (dx * dx + dz * dz > ESCAPE_RANGE_WU * ESCAPE_RANGE_WU) {
        releaseCast(live);
        return d.resolve(live, 'runner_escaped', { speak: true });
      }
    }

    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'press_over', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'corsair_raider',
  },
  motive: 'cargo_raid',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'THE SLOT',
  primaryLine: 'LANE WATCH: a runner is pinned between the stones — the press is on, one corridor wide.',
  squad: {
    archetypes: ['corsair_raider', 'wasp_swarmer'],
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
  telegraph: 'A runner is being herded at a rock slot — one corridor, over and over.',
  deadlineS: RAID_DEADLINE_S,
  aftermath: {
    flee: 'The runner threads the slot once more and is gone.',
    kill: 'The press packs up. The stones hold their gap for the next chase.',
  },
  receipts: {
    runner_saved: 'SLOT HELD — the press broke. The corridor is just rocks again.',
    runner_down: 'RUNNER DOWN — the slot claimed nothing; the press did.',
    runner_escaped: 'RUNNER AWAY — through the gap and gone downrange.',
    press_over: 'The press burned out over the stones. The slot stays what it is.',
  },
});
