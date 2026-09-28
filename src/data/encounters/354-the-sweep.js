// 354 — THE SWEEP (CR-CHAIN braid: a wreck towed through a search).
// An SCN customs pair is sweeping a corridor band — two cutters shuttling the search line
// back and forth — and a marked prize hull sits on the far side of the band. The braid is
// the player's tow: latch the wreck and drag it through the sweep's off-beat. The line is
// real, the patrol is real, the detection is real — a wrecker's hull inside a sweeper's
// scan reach burns the run and drops the cutters from inspection to interdiction.
// Drag it through clean and the fence pays; get burned and it becomes a fight with the
// law, or you cut the prize loose and walk.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 354;
export const trigger = deepFreeze({
  id: 'sweep_wreck_tow',
  tier: 'minor',
  deck: 'patrol',
  weight: 0.9,
  // A lawful search needs lawful space — checkpoints, cores, and held lanes.
  zoneTypes: ['border_checkpoint', 'trade_lane', 'civilian_core'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 32,
  cooldownS: 800,
  proximity: true,
  fireWithinWu: 460,
  gates: {
    minSecurity: 0.3,
    maxSecurity: 0.9,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const SWEEP_HALF_WU = 620;      // each cutter shuttles this far along the corridor line
const SWEEP_SPEED = 46;         // slow inspection pace — the off-beat is readable
const BAND_HALF_WU = 210;       // corridor band half-width the tow must cross
const SCAN_RADIUS_WU = 300;     // a marked hull this close to a sweeper is burned
const WRECK_FAR_WU = 430;       // prize sits this far past the band on the far side
const CLEAR_WU = 300;           // wreck this far out the near side is lifted clean
const SWEEP_DEADLINE_S = 150;

// Same contract as the rest of the braid set: resolving must not stamp the cast.
function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function sideOf(corridor, p) {
  // Signed distance along the corridor normal: positive = the prize's far side.
  return (p.x - corridor.x) * corridor.n.x + (p.z - corridor.z) * corridor.n.z;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || SWEEP_DEADLINE_S);
    const center = live.plan && live.plan.zoneCenter;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = live.plan.ships;
    // No civilian block in this shape: the planner marks the squad's role 'squad'.
    const cutterSpecs = ships.filter((sh) => sh && sh.role === 'squad');
    if (!cutterSpecs.length) return d.abort(live, 'no_cast');

    const rng = d.stream(live, 'sweep_layout');
    const theta = rng() * Math.PI * 2;
    // Corridor line direction (the sweepers' shuttle axis) and the crossing normal.
    const axis = { x: Math.cos(theta), z: Math.sin(theta) };
    const n = { x: -axis.z, z: axis.x };
    // The player approaches the corridor from the side nearer them — the prize is always
    // across the band, never behind the player.
    const player = d.player();
    const pSide = player && player.pos
      ? Math.sign((player.pos.x - center.x) * n.x + (player.pos.z - center.z) * n.z) || 1
      : 1;
    const corridor = { x: center.x, z: center.z, axis, n, nearSide: -pSide };
    live.data.sweep = { corridor, burned: false, wreckId: null };

    // Cutters ride the corridor line, phased apart so their sweep legs overlap.
    const sweepers = [];
    let ci = 0;
    for (const spec of cutterSpecs) {
      const phase = (ci / cutterSpecs.length) * 2 - 0.5; // -0.5, +0.5 for two cutters
      const pos = {
        x: center.x + axis.x * SWEEP_HALF_WU * phase,
        z: center.z + axis.z * SWEEP_HALF_WU * phase,
      };
      spec.pos.x = pos.x; spec.pos.z = pos.z;
      sweepers.push({
        a: { x: center.x - axis.x * SWEEP_HALF_WU, z: center.z - axis.z * SWEEP_HALF_WU },
        b: { x: center.x + axis.x * SWEEP_HALF_WU, z: center.z + axis.z * SWEEP_HALF_WU },
        leg: ci % 2 === 0 ? 'b' : 'a', // staggered: never both at the same end together
      });
      ci++;
    }

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'squad') < 1) return d.abort(live, 'no_budget');

    const spawnedCutters = d.entsOf(live, 'squad');
    spawnedCutters.forEach((cutter, i) => {
      const sw = sweepers[i % sweepers.length];
      cutter.data = cutter.data || {};
      const cai = cutter.data.ai || (cutter.data.ai = {});
      cai.passive = true;
      cai.holdPosition = true;
      cutter.data.scanLabel = 'SCN CUTTER — SWEEPING';
      const target = sw.leg === 'b' ? sw.b : sw.a;
      const dx = target.x - cutter.pos.x, dz = target.z - cutter.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      cutter.vel = { x: (dx / len) * SWEEP_SPEED, z: (dz / len) * SWEEP_SPEED };
      sw.entityId = cutter.id;
    });
    live.data.sweep.sweepers = sweepers;

    // The prize: a marked hull past the far edge of the band — tetherable debris under
    // the ordinary salvage contract, carrying a manifest worth the risk. Far side is
    // opposite the player's approach: the sweep stands between the player and the prize.
    const wreckPos = {
      x: center.x - n.x * (BAND_HALF_WU + WRECK_FAR_WU) * pSide,
      z: center.z - n.z * (BAND_HALF_WU + WRECK_FAR_WU) * pSide,
    };
    const wreck = d.spawnWreck(live, {
      pos: wreckPos,
      pool: { cmdty_ore_einsteinium: 3, cmdty_exotic_xenium: 1 },
      scanLabel: 'MARKED HULL — HELD FOR AUCTION',
    });
    if (!wreck) return d.abort(live, 'no_wreck');
    live.data.sweep.wreckId = wreck.id;
    live.data.sweep.wreckSide = -pSide; // the far side the wreck starts on

    live.phase = 'conflict';
    d.say(live, 'alert',
      'CUSTOMS SWEEP: an SCN pair is working the corridor — a marked hull is parked past the line.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'SCN SWEEP LEAD',
      text: 'Corridor sweep in effect. Anything on a hook comes through on manifest or not at all.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const sweep = live.data.sweep;
    if (!sweep) return;
    const wreck = state.entities.get(sweep.wreckId);

    // Drive the sweep legs: velocity toward the current waypoint, flip on arrival.
    for (const sw of sweep.sweepers || []) {
      const cutter = state.entities.get(sw.entityId);
      if (!cutter || cutter.alive === false || cutter.data?.ai?.passive === false) continue;
      const target = sw.leg === 'b' ? sw.b : sw.a;
      const dx = target.x - cutter.pos.x, dz = target.z - cutter.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 45) {
        sw.leg = sw.leg === 'b' ? 'a' : 'b';
      } else {
        cutter.vel = { x: (dx / dist) * SWEEP_SPEED, z: (dz / dist) * SWEEP_SPEED };
      }
    }

    if (!wreck || wreck.alive === false) {
      // The prize is gone — collected by the player is the honest clean end; destroyed
      // under the sweep reads the same to the cutters.
      releaseCast(live);
      return d.resolve(live, 'prize_gone', { speak: false });
    }

    const wreckSide = sideOf(sweep.corridor, wreck.pos);

    // Detection: the marked hull inside a sweeper's scan reach burns the tow.
    if (!sweep.burned) {
      for (const sw of sweep.sweepers || []) {
        const cutter = state.entities.get(sw.entityId);
        if (!cutter || cutter.alive === false || !cutter.pos) continue;
        const dx = wreck.pos.x - cutter.pos.x, dz = wreck.pos.z - cutter.pos.z;
        if (dx * dx + dz * dz <= SCAN_RADIUS_WU * SCAN_RADIUS_WU) {
          sweep.burned = true;
          const player = d.player();
          for (const sw2 of sweep.sweepers || []) {
            const c2 = state.entities.get(sw2.entityId);
            if (!c2 || c2.alive === false) continue;
            const cd = c2.data || (c2.data = {});
            const cai = cd.ai || (cd.ai = {});
            cai.passive = false;
            cai.holdPosition = false;
            cd.scanLabel = 'SCN CUTTER — INTERDICTING';
            if (player) {
              (cd.combat || (cd.combat = {})).targetId = player.id;
              cai.targetId = player.id;
              cai.pursueTargetId = player.id;
            }
          }
          d.rep('faction_scn', -2, 'sweep_burned');
          d.emit('comms:log', {
            from: 'SCN SWEEP LEAD',
            text: 'Unmanifested hull on a line — drop the prize and stand to, or we cut it loose ourselves.',
            kind: 'encounter',
          });
          d.emit('encounter:hostileCommitted', { encounterId: live.id, reason: 'sweep_burned' });
          break;
        }
      }
    }

    // The lift: the marked hull dragged clear out the near side resolves clean only while
    // unburned — a burned tow that still makes the far bank is a fight won, not a lift.
    if (Math.sign(wreckSide) !== Math.sign(sweep.wreckSide || -1)
      && Math.abs(wreckSide) > BAND_HALF_WU + CLEAR_WU) {
      if (!sweep.burned) {
        d.grant(240, 'sweep:lifted');
        d.emit('comms:log', {
          from: 'LANE FENCE',
          text: 'Clean pull. The sweep never even logged the line. Manifest says the hull was always here.',
          kind: 'encounter',
        });
        releaseCast(live);
        return d.resolve(live, 'lifted', { speak: true });
      }
      if (d.aliveCount(live, 'squad') === 0) {
        releaseCast(live);
        return d.resolve(live, 'fought_through', { speak: true });
      }
    }

    if (sweep.burned && d.aliveCount(live, 'squad') === 0) {
      // The sweep pair is down — the law lost this one. Prize stays where it lies.
      releaseCast(live);
      return d.resolve(live, 'fought_through', { speak: true });
    }

    if (now >= live.deadlineAt) {
      // The sweep ships out on schedule — burned or not, the corridor opens.
      releaseCast(live);
      return d.resolve(live, sweep.burned ? 'burned_gone' : 'sweep_ends', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'patrol',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_scn',
  },
  motive: 'lawful_inspection',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_scn',
  context: 'patrol',
  title: 'THE SWEEP',
  primaryLine: 'CUSTOMS SWEEP: an SCN pair is working the corridor — a marked hull is parked past the line.',
  squad: {
    archetypes: ['customs_cutter'],
    size: [2, 2],
    doctrine: 'official',
    formation: 'line',
  },
  bark: null,
  telegraph: 'A customs pair is sweeping the corridor — a marked hull sits past their line.',
  deadlineS: SWEEP_DEADLINE_S,
  aftermath: {
    flee: 'The sweep moves on. The marked hull keeps its place.',
    kill: 'The corridor goes quiet — the wreck stays where the law left it.',
  },
  receipts: {
    lifted: 'LIFTED — the marked hull crossed the line unseen. The fence pays clean.',
    fought_through: 'SWEEP BROKEN — the cutters are down and the corridor is yours.',
    prize_gone: 'The marked hull is gone — the sweep logs a blank.',
    burned_gone: 'You were made. The sweep shipped out with the report.',
    sweep_ends: 'The sweep ended on schedule. The corridor is just a lane again.',
  },
});
