// C01-05 — the room does the twist: the course round's own mechanic, run through the
// canonical owners rather than dealt as an event card.
//
// G08-02's `swarmTwistFor` answers the twist a wave's course row names. This system arms
// that twist on `run:wavePlanned`, activates it on `run:waveStarted`, ticks it on the
// table clock, and tears it down on wave clear / run end / save load. Each mechanic is a
// small module below; none of them owns another system's state:
//
//   - freight rides, warnings and reversals go through the freightLane owner (its events
//     and its `freight:reverseRequested` request seam);
//   - floor prices go through swarmFloor's `swarm:floorSaleRequested` sale seam;
//   - the purse moves only through `run:spendRequested` / `swarm:bonusChip` receipts;
//   - tethers are created and cut through the combat attachments service;
//   - doctrines steer bodies through setEntityDoctrine — never velocity writes;
//   - arena light is a presentation request on the bus (`swarm:arenaLights`), consumed by
//     render/sectorDimmer — the sim never reaches into the renderer.
//
// Lifecycle mirrors the wave owner: planned (arm, resolve the twist) → started (activate)
// → cleared/ended/loaded (teardown; nothing survives a boundary or a save round-trip).

import { setEntityDoctrine } from '../ai/doctrine.js';
import {
  swarmTwistFor,
  SWARM_RIDER_STILL_TICKS,
  SWARM_RIDER_CARRY_EXIT_SCALE,
  SWARM_LIGHTS_OUT_INTENSITY,
  SWARM_LIGHTS_OUT_RAMP_S,
  SWARM_THEFT_FRACTION,
  SWARM_YARDMASTER_REVERSALS,
  SWARM_EMG_SECONDS,
  SWARM_EMG_PRICE_FACTOR,
  SWARM_QUIET_HOLD_TICKS,
} from '../data/swarmTwists.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { getCombatKernel } from '../combat/kernel.js';
import { SWARM_DROP_DEFS } from '../data/swarmDrops.js';

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function liveSwarmRun(state) {
  const run = state && state.run;
  return run && run.kind === 'survival' && isSwarmRuleset(run.ruleset) ? run : null;
}

function entityAt(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const e = state.entities.get(id) || null;
  return e && e.alive !== false ? e : null;
}

function simTime(state) {
  return state && Number.isFinite(state.simTime) ? state.simTime : 0;
}

/**
 * Round 12 — Delivery. Three Reavers ride the freight string seated on its containers:
 * the wave owner spawns them at member positions on `freight:departed` and receipts
 * `swarm:freightRiders`, and this module pins each stamped rider to its box while the
 * `swarmFreightRider` ride stamp holds (the module is the single writer of a riding
 * body's seat). At the lane midpoint each rider steps off and fights. Cut a container
 * loose before the midpoint and it carries its rider away ballistically — the rider
 * only hops off to fight if the box stalls mid-room, and is routed if it sails out.
 */
function createDeliveryModule(host) {
  const riders = new Map(); // riderId → { memberId, released, stillTicks }
  let lane = null; // { x0, z0, x1, z1, dir }

  function release(riderId, rec, reason) {
    if (!rec || rec.released) return;
    rec.released = true;
    const state = host.state;
    const rider = entityAt(state, riderId);
    if (rider && rider.data) rider.data.swarmFreightRider = null;
    if (!rider) return;
    if (reason === 'carried') {
      // Cut loose and hauled out of the room — the wave counts the rider as routed:
      // it flees rather than holding the round open from outside the fight.
      rider.data.forceFlee = { reason: 'swarm_delivery_carried', atTick: finite(state && state.tick) };
      setEntityDoctrine(rider, { activity: { kind: 'flee', reason: 'swarm_delivery_carried' } });
    } else {
      setEntityDoctrine(rider, {
        activity: { kind: 'attack_run', reason: 'survival_pursuit',
          targetId: state && state.playerId != null ? state.playerId : null, anchor: null },
        roe: 'weapons_free',
      });
    }
  }

  return {
    onSwarmFreightRiders(payload) {
      if (!payload || payload.wave !== host.wave) return;
      lane = payload.lane && typeof payload.lane === 'object' ? { ...payload.lane } : null;
      const list = Array.isArray(payload.riders) ? payload.riders : [];
      for (const pair of list) {
        const rider = entityAt(host.state, pair && pair.id);
        const member = entityAt(host.state, pair && pair.memberId);
        if (!rider || !member) continue;
        rider.data.swarmFreightRider = { memberId: member.id, wave: host.wave };
        // The ride is the tell — a seated rider holds fire until it steps off the box.
        setEntityDoctrine(rider, { activity: { kind: 'hail_hold', reason: 'swarm_delivery' } });
        riders.set(rider.id, { memberId: member.id, released: false, stillTicks: 0 });
      }
    },
    update() {
      if (!lane) return;
      const dir = lane.dir === -1 ? -1 : 1;
      const midX = (finite(lane.x0) + finite(lane.x1)) / 2;
      const half = Math.abs(finite(lane.x1, 400) - finite(lane.x0, -400)) / 2;
      for (const [riderId, rec] of riders) {
        if (rec.released) continue;
        const rider = entityAt(host.state, riderId);
        if (!rider) { rec.released = true; continue; }
        const member = entityAt(host.state, rec.memberId);
        if (!member) { release(riderId, rec, 'member_lost'); continue; }
        // The seat: the rider is wherever its box is, sharing its motion.
        rider.pos.x = finite(member.pos && member.pos.x);
        rider.pos.z = finite(member.pos && member.pos.z);
        if (rider.vel) {
          rider.vel.x = finite(member.vel && member.vel.x);
          rider.vel.z = finite(member.vel && member.vel.z);
        }
        const onString = member.data && member.data.freightString != null;
        if (onString) {
          // Still riding the string — step off at the midpoint along the travel direction.
          if ((member.pos.x - midX) * dir >= 0) release(riderId, rec, 'midpoint');
          continue;
        }
        // Cut loose before the midpoint: the box carries its rider away ballistically.
        // The ride only ends where the box does — stalled in the room or past the exit.
        const speed = Math.hypot(finite(member.vel && member.vel.x), finite(member.vel && member.vel.z));
        rec.stillTicks = speed < 25 ? rec.stillTicks + 1 : 0;
        if (rec.stillTicks >= SWARM_RIDER_STILL_TICKS) {
          release(riderId, rec, 'stalled');
        } else if (Math.abs(member.pos.x - midX) > half * SWARM_RIDER_CARRY_EXIT_SCALE) {
          release(riderId, rec, 'carried');
        }
      }
    },
    onEntityKilled(payload) {
      const id = payload && payload.id;
      if (id == null) return;
      riders.delete(id);
      for (const [riderId, rec] of riders) {
        if (rec.memberId === id && !rec.released) release(riderId, rec, 'member_lost');
      }
    },
    teardown() {
      for (const [riderId, rec] of riders) {
        if (!rec.released) release(riderId, rec, 'wave_end');
        const rider = entityAt(host.state, riderId);
        if (rider && rider.data) rider.data.swarmFreightRider = null;
      }
      riders.clear();
      lane = null;
    },
  };
}

/**
 * Round 13 — Lights Out. The room falls to a quarter light over two seconds and
 * holds there until the round resolves. The request rides `swarm:arenaLights` and
 * the render phase's sectorDimmer answers by scaling only the four-light sector
 * rig — lamps, engine glows and lane lights live outside that rig and stay lit,
 * which is the whole tell ("your own lamps and the lane lights are all you have").
 */
function createLightsOutModule(host) {
  return {
    activate() {
      host._arenaLights(SWARM_LIGHTS_OUT_INTENSITY, SWARM_LIGHTS_OUT_RAMP_S, 'swarm_lights_out');
    },
    teardown() {
      host._arenaLights(1, SWARM_LIGHTS_OUT_RAMP_S, 'swarm_lights_restore');
    },
  };
}

/**
 * Round 18 — Highway Robbery. Every Reaver the wave seats carries the thief stamp;
 * the first one that touches the pilot lifts 15% of the run purse through the purse
 * owner's debit seam (`run:spendRequested`, reason `swarm:theft` — the wallet's
 * negative award) and runs the authored forceFlee egress for the nearest gate.
 * Killed before it exits, the thief drops exactly what it took through the
 * `swarm:bonusChip` reward pipeline, so the loot is an ordinary chip you can scoop.
 * The course suppresses any dealt card on the round — the robbery IS the event.
 */
function createHighwayRobberyModule(host) {
  const thieves = new Set(); // thief ids stamped this round
  let busy = false;          // one robbery at a time — first toucher is the thief

  // The wave owner's wave-started handler seats the tick-0 package before this
  // module's runs — spawn events for it precede the module entirely. Stamping is
  // therefore lazy: the update sweep and the touch path both stamp on sight.
  function stampIfThief(e) {
    if (!e || !e.data || e.data.swarmThief) return e;
    if (e.data.runCohort !== 'survival' || e.data.lootTableId !== 'reaver_pirate') return e;
    e.data.swarmThief = { stolen: 0, done: false };
    thieves.add(e.id);
    return e;
  }

  function thief(id) {
    const e = entityAt(host.state, id);
    return e && e.data && e.data.swarmThief ? e : null;
  }

  function rob(thiefEntity) {
    const t = thiefEntity.data.swarmThief;
    if (!t || t.done) return;
    t.done = true;
    const run = liveSwarmRun(host.state);
    const purse = run && Number.isFinite(run.credits) ? Math.max(0, Math.floor(run.credits)) : 0;
    const stolen = Math.floor(purse * SWARM_THEFT_FRACTION);
    t.stolen = stolen;
    if (stolen > 0 && host.bus && typeof host.bus.emit === 'function') {
      host.bus.emit('run:spendRequested', {
        credits: stolen, reason: 'swarm:theft', wave: host.wave,
        pos: { x: finite(thiefEntity.pos && thiefEntity.pos.x), z: finite(thiefEntity.pos && thiefEntity.pos.z) },
      });
    }
    // Out through the nearest gate — the authored egress resolves the body as 'fled',
    // so a successful robber leaves the fight and still lets the round clear.
    thiefEntity.data.ai = thiefEntity.data.ai || {};
    thiefEntity.data.ai.forceFlee = true;
    setEntityDoctrine(thiefEntity, { activity: { kind: 'flee', reason: 'swarm_robbery' } });
  }

  return {
    update() {
      const list = host.state && host.state.entityList;
      if (!Array.isArray(list)) return;
      for (const e of list) stampIfThief(e);
    },
    onEntitySpawned(payload) {
      stampIfThief((payload && payload.entity) || entityAt(host.state, payload && payload.id));
    },
    onPhysicsImpact(payload) {
      if (busy || !payload) return;
      const playerId = host.state && host.state.playerId;
      if (playerId == null) return;
      const a = thief(stampIfThief(entityAt(host.state, payload.aId)) && payload.aId);
      const b = thief(stampIfThief(entityAt(host.state, payload.bId)) && payload.bId);
      // A theft requires the pilot at one end of the contact — two Reavers clipping
      // each other is just a collision, not a robbery.
      const culprit = payload.aId === playerId ? b : payload.bId === playerId ? a : null;
      if (!culprit) return;
      busy = true;
      try { rob(culprit); } finally { busy = false; }
    },
    onEntityKilled(payload) {
      const id = payload && payload.id;
      if (id == null || !thieves.has(id)) return;
      // The corpse still carries its stamp and its position — read the raw record,
      // not entityAt's alive filter.
      const body = host.state && host.state.entities && typeof host.state.entities.get === 'function'
        ? host.state.entities.get(id) : null;
      const t = body && body.data && body.data.swarmThief;
      if (t && t.stolen > 0 && !t.dropped && body.pos) {
        t.dropped = true;
        // The reward owner mints an entitled chip at the corpse — the same pipeline an
        // earned kill chip rides, so the recovered purse is loot, not a ledger line.
        if (host.bus && typeof host.bus.emit === 'function') {
          host.bus.emit('swarm:bonusChip', {
            credits: t.stolen, pos: { x: finite(body.pos.x), z: finite(body.pos.z) },
            reason: 'swarm:theft', wave: host.wave,
          });
        }
      }
      thieves.delete(id);
    },
    onEntityRetired(payload) {
      // A thief that reaches a gate keeps its take — 'fled' is the robbery landing.
      thieves.delete(payload && payload.id);
    },
    teardown() { thieves.clear(); busy = false; },
  };
}

/**
 * Round 19 — The Law. Lawmen and Cutters stop for the amber lane lights: the
 * freight owner's `freight:warning` holds every cohort law hull at an anchor just
 * outside the corridor (a lawman caught in the band steps out first), weapons
 * still free — The Law waits for traffic, it does not go harmless. `freight:clear`
 * releases them back onto the pilot. The wave owner seats the opening package
 * before this module exists, so holds sweep live entities rather than a spawn ledger.
 */
const THE_LAW_IDS = new Set(['patrol_lawman', 'customs_cutter']);
const THE_LAW_LANE_MARGIN = 70; // z clearance out of the freight corridor

function createTheLawModule(host) {
  const held = new Set(); // law ids currently holding for a string
  let activeLane = null;  // the lane amber owes the room — held until the string clears

  function cohortLaw(e) {
    return e && e.data && e.data.runCohort === 'survival' && THE_LAW_IDS.has(e.data.lootTableId);
  }

  function holdOne(e, zLane) {
    if (!cohortLaw(e) || held.has(e.id)) return;
    held.add(e.id);
    // Step out of the corridor before holding — the stop happens OUTSIDE the lane.
    const ex = finite(e.pos && e.pos.x);
    const ez = finite(e.pos && e.pos.z);
    const side = ez === zLane ? (e.id % 2 === 0 ? -1 : 1) : Math.sign(ez - zLane);
    const holdZ = Math.abs(ez - zLane) < THE_LAW_LANE_MARGIN ? zLane + side * THE_LAW_LANE_MARGIN : ez;
    setEntityDoctrine(e, {
      activity: { kind: 'hail_hold', reason: 'swarm_the_law', anchor: { x: ex, z: holdZ } },
      roe: 'weapons_free',
    });
  }

  function holdAll(lane) {
    const list = host.state && host.state.entityList;
    if (!Array.isArray(list)) return;
    const zLane = finite(lane && lane.z0, 0);
    for (const e of list) holdOne(e, zLane);
  }

  function releaseAll() {
    for (const id of held) {
      const e = entityAt(host.state, id);
      if (!e) continue;
      setEntityDoctrine(e, {
        activity: { kind: 'attack_run', reason: 'survival_pursuit',
          targetId: host.state && host.state.playerId != null ? host.state.playerId : null, anchor: null },
        roe: 'weapons_free',
      });
    }
    held.clear();
  }

  return {
    onFreightWarning(payload) {
      if (payload && payload.wave === host.wave) {
        activeLane = payload;
        holdAll(payload);
      }
    },
    onEntitySpawned(payload) {
      // A reinforcement that materializes under amber observes the same lights.
      if (!activeLane) return;
      const e = (payload && payload.entity) || entityAt(host.state, payload && payload.id);
      if (e) holdOne(e, finite(activeLane.z0, 0));
    },
    onFreightClear(payload) {
      if (payload) { activeLane = null; releaseAll(); }
    },
    onEntityKilled(payload) { held.delete(payload && payload.id); },
    onEntityRetired(payload) { held.delete(payload && payload.id); },
    teardown() { activeLane = null; releaseAll(); },
  };
}

/**
 * Round 20 — The Yardmaster. Twice during the boss fight the module asks the
 * freight owner to throw the lane: `freight:reverseRequested` flips the armed
 * direction, the owner re-paints the amber immediately, and the next string to
 * depart runs the new way. The module never touches a container — the lane is
 * the single writer of its own direction, so a mid-fight string keeps its heading.
 */
function createYardmasterModule(host) {
  let index = 0;
  let startTick = null; // the round's own opening tick — the authored throws count from HERE
  return {
    activate() {
      startTick = host.state && Number.isInteger(host.state.tick) ? host.state.tick : null;
    },
    update() {
      if (index >= SWARM_YARDMASTER_REVERSALS.length) return;
      const tick = host.state && Number.isInteger(host.state.tick) ? host.state.tick : null;
      if (tick == null) return;
      if (startTick == null) startTick = tick;
      if (tick - startTick < SWARM_YARDMASTER_REVERSALS[index]) return;
      index += 1;
      if (host.bus && typeof host.bus.emit === 'function') {
        host.bus.emit('freight:reverseRequested', {
          wave: host.wave, reversal: index, tick, requestedBy: 'swarm:yardmaster',
        });
      }
    },
    teardown() { index = 0; startTick = null; },
  };
}

/**
 * Round 22 — Chain Gang. Every cohort hull flies shackled to a partner through the
 * real attachments service (`attachment_snarl`, tether socket to tether socket),
 * so a Line latch on one member drags the other by the snarl spring — the physics
 * authority owns the pull; the module only owns who is chained to whom. New
 * arrivals queue in spawn order and pair off as partners become available; the
 * last odd man of a spawn-quiet window chains onto the previous link's tail so
 * the gang never runs a free member.
 */
const SWARM_GANG_ODD_GRACE_TICKS = 30;

function createChainGangModule(host) {
  const queue = [];        // member ids awaiting a partner, in arrival order
  const queuedAt = new Map();
  let lastTailId = null;   // target of the most recent link — the odd man's anchor

  function service() {
    try {
      const kernel = host.ctx && getCombatKernel(host.ctx);
      return kernel && kernel.attachments;
    } catch (_) { return null; }
  }

  function living(id) {
    const st = host.state;
    const e = st && st.entities && typeof st.entities.get === 'function' ? st.entities.get(id) : null;
    return e && e.alive !== false ? e : null;
  }

  function gangEligible(e) {
    return !!(e && e.data && e.data.runCohort === 'survival'
      && e.data.swarmGangMember !== true
      && e.type === 'ship');
  }

  function stamp(e) {
    if (!gangEligible(e)) return;
    e.data.swarmGangMember = true;
    queue.push(e.id);
    queuedAt.set(e.id, host.state && Number.isInteger(host.state.tick) ? host.state.tick : 0);
  }

  function bind(owner, target) {
    const svc = service();
    if (!svc || !owner || !target || owner === target) return false;
    const res = svc.create({ defId: 'attachment_snarl', ownerId: owner.id, targetId: target.id });
    if (!res || res.ok !== true || !res.attachment) return false;
    owner.data.swarmGangPartner = target.id;
    target.data.swarmGangPartner = owner.id;
    owner.data.swarmGangAttachment = res.attachment.id;
    lastTailId = target.id;
    return true;
  }

  function dequeue(id) {
    const at = queue.indexOf(id);
    if (at >= 0) queue.splice(at, 1);
    queuedAt.delete(id);
  }

  function drain() {
    while (queue.length >= 2) {
      const a = living(queue[0]);
      const b = living(queue[1]);
      if (!a) { dequeue(queue[0]); continue; }
      if (!b) { dequeue(queue[1]); continue; }
      // A refused bind keeps the pair queued — the service declines while its
      // physics port is down, and the next tick's drain asks again.
      if (!bind(a, b)) break;
      dequeue(a.id); dequeue(b.id);
    }
    // Odd man out: if no partner has arrived within the grace window, the gang
    // grows a chain link — the odd member shackles to the previous link's tail.
    if (queue.length === 1) {
      const odd = living(queue[0]);
      const tail = living(lastTailId);
      const waited = odd && tail
        && Number.isInteger(host.state && host.state.tick)
        && host.state.tick - (queuedAt.get(odd.id) || 0) >= SWARM_GANG_ODD_GRACE_TICKS;
      if (waited) {
        const oddId = odd.id;
        bind(odd, tail);
        dequeue(oddId);
      }
    }
  }

  function sweep() {
    const st = host.state;
    for (const e of (st && st.entityList) || []) {
      if (gangEligible(e)) stamp(e);
    }
  }

  return {
    activate() { sweep(); drain(); },
    onEntitySpawned(p) {
      const e = p && (p.entity || living(p.id));
      if (e) stamp(e);
      drain();
    },
    onEntityDestroyed(p) { if (p && p.id != null) dequeue(p.id); },
    onEntityRetired(p) { if (p && p.id != null) dequeue(p.id); },
    update() { sweep(); drain(); },
    teardown() { queue.length = 0; queuedAt.clear(); lastTailId = null; },
  };
}

/**
 * Round 24 — Everything Must Go. For the round's authored ninety seconds every
 * floor price halves — the module asks the floor owner through
 * `swarm:floorSaleRequested` and the director re-writes its own tills (wall guns,
 * Crate, Forge, Taps, labels included). The countdown chip is a presentation
 * flag on `state.render` — the HUD reads it, never counts for it. The doubled
 * spawn is the planner's own authored-plan edit, not this module's doing.
 */
function createEverythingMustGoModule(host) {
  let endsAt = null;

  function chip(write) {
    const st = host.state;
    if (!st) return;
    const render = st.render || (st.render = {});
    render.swarmTwistChip = write;
  }

  function saleRequest(factor) {
    if (host.bus && typeof host.bus.emit === 'function') {
      host.bus.emit('swarm:floorSaleRequested', {
        factor, wave: host.wave, requestedBy: 'swarm:everything_must_go',
      });
    }
  }

  return {
    activate() {
      const t = simTimeOf(host.state);
      endsAt = t + SWARM_EMG_SECONDS;
      saleRequest(SWARM_EMG_PRICE_FACTOR);
      chip({
        kind: 'sale', label: 'EVERYTHING MUST GO',
        endsAtSimTime: endsAt, totalS: SWARM_EMG_SECONDS, wave: host.wave,
      });
    },
    update() {
      if (endsAt == null) return;
      if (simTimeOf(host.state) < endsAt) return;
      endsAt = null;
      saleRequest(1);
      chip(null);
    },
    suspend() { chip(null); },
    teardown() {
      if (endsAt != null) saleRequest(1);
      endsAt = null;
      chip(null);
    },
  };
}

/**
 * Round 28 — Black Friday. One of each of the eight house drops lands on a ring
 * around the player at the round's open — the module names each id and its spot,
 * the drop owner owns the spawn, the ledger and the despawn. The crowd itself is
 * the cast's authored roster: every enemy type fields inside the room's own
 * opening-burst cap, no module law needed.
 */
const SWARM_BLACK_FRIDAY_RING_WU = 110;

function createBlackFridayModule(host) {
  return {
    activate() {
      const st = host.state;
      const player = st && st.entities && typeof st.entities.get === 'function'
        ? st.entities.get(st.playerId) : null;
      const cx = finite(player && player.pos && player.pos.x);
      const cz = finite(player && player.pos && player.pos.z);
      const n = SWARM_DROP_DEFS.length;
      for (let i = 0; i < n; i++) {
        const def = SWARM_DROP_DEFS[i];
        const angle = (i / n) * Math.PI * 2;
        if (host.bus && typeof host.bus.emit === 'function') {
          host.bus.emit('swarm:dropRequested', {
            dropId: def.id,
            pos: { x: cx + Math.cos(angle) * SWARM_BLACK_FRIDAY_RING_WU, z: cz + Math.sin(angle) * SWARM_BLACK_FRIDAY_RING_WU },
            wave: host.wave,
            reason: 'swarm:black_friday',
          });
        }
      }
    },
    teardown() {},
  };
}

/**
 * Round 29 — Quiet. The planner already slid the whole authored schedule to the
 * far side of the forty-second hold — every gate owed at tick 0 opens together
 * at tick 2400 — so the module's only job is the silence itself: a countdown
 * chip on the same `state.render` seam the sale uses, named for the round and
 * cleared the moment the room stops holding its breath.
 */
const SWARM_QUIET_HOLD_S = SWARM_QUIET_HOLD_TICKS / 60;

function createQuietModule(host) {
  let endsAt = null;

  function chip(write) {
    const st = host.state;
    if (!st) return;
    const render = st.render || (st.render = {});
    render.swarmTwistChip = write;
  }

  return {
    activate() {
      endsAt = simTimeOf(host.state) + SWARM_QUIET_HOLD_S;
      chip({
        kind: 'quiet', label: 'QUIET',
        endsAtSimTime: endsAt, totalS: SWARM_QUIET_HOLD_S, wave: host.wave,
      });
    },
    update() {
      if (endsAt == null) return;
      if (simTimeOf(host.state) < endsAt) return;
      endsAt = null;
      chip(null);
    },
    suspend() { chip(null); },
    teardown() { endsAt = null; chip(null); },
  };
}

const MODULES = {
  delivery: createDeliveryModule,
  lights_out: createLightsOutModule,
  highway_robbery: createHighwayRobberyModule,
  the_law: createTheLawModule,
  the_yardmaster: createYardmasterModule,
  chain_gang: createChainGangModule,
  everything_must_go: createEverythingMustGoModule,
  black_friday: createBlackFridayModule,
  quiet: createQuietModule,
};

export const swarmCourseTwists = {
  name: 'swarmCourseTwists',
  init(ctx) {
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this.wave = 0;
    this._twist = null;
    this._mod = null;
    const on = (event, fn) => { this._unsubs.push(this.bus.on(event, fn)); };
    on('run:wavePlanned', (p) => this._onWavePlanned(p));
    on('run:waveStarted', (p) => this._onWaveStarted(p));
    on('run:waveCleared', () => this._teardown());
    on('run:ended', () => this._teardown());
    on('save:loaded', () => this._teardown());
    on('run:transitioned', (p) => {
      if (p && p.phase && p.phase !== 'active') this._suspend();
    });
    on('swarm:freightRiders', (p) => this._dispatch('onSwarmFreightRiders', p));
    on('freight:warning', (p) => this._dispatch('onFreightWarning', p));
    on('freight:departed', (p) => this._dispatch('onFreightDeparted', p));
    on('freight:released', (p) => this._dispatch('onFreightReleased', p));
    on('freight:clear', (p) => this._dispatch('onFreightClear', p));
    on('entity:killed', (p) => this._dispatch('onEntityKilled', p));
    on('entity:retired', (p) => this._dispatch('onEntityRetired', p));
    on('entity:spawned', (p) => this._dispatch('onEntitySpawned', p));
    on('entity:destroyed', (p) => this._dispatch('onEntityDestroyed', p));
    on('physics:impact', (p) => this._dispatch('onPhysicsImpact', p));
  },
  _onWavePlanned(payload) {
    const run = liveSwarmRun(this.state);
    this._teardown();
    if (!run) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    const twist = swarmTwistFor(wave, run.arenaId);
    if (!twist) return;
    this.wave = wave;
    this._twist = twist;
  },
  _onWaveStarted(payload) {
    const run = liveSwarmRun(this.state);
    if (!run || !this._twist) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    if (wave !== this.wave) return;
    const factory = MODULES[this._twist.id];
    if (typeof factory !== 'function') return;
    this._mod = factory(this);
    if (typeof this._mod.activate === 'function') this._mod.activate(payload);
  },
  _suspend() {
    if (this._mod && typeof this._mod.suspend === 'function') this._mod.suspend();
  },
  _teardown() {
    if (this._mod && typeof this._mod.teardown === 'function') {
      try { this._mod.teardown(); } catch { /* teardown is best-effort at a boundary */ }
    }
    this._mod = null;
    this._twist = null;
    this.wave = 0;
  },
  _dispatch(method, payload) {
    const mod = this._mod;
    if (mod && typeof mod[method] === 'function') mod[method](payload);
  },
  /** Presentation request on the frame bus — render/sectorDimmer owns the answer. */
  _arenaLights(level, fadeS, reason) {
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('swarm:arenaLights', { level, fadeS, reason, wave: this.wave });
    }
  },
  update(dt) {
    if (this._mod && typeof this._mod.update === 'function') this._mod.update(dt);
  },
  destroy() {
    this._teardown();
    for (const off of this._unsubs || []) { try { off(); } catch { /* unsub best-effort */ } }
    this._unsubs = [];
  },
};

/** Test + debugging surface: the armed twist id, for receipts and focused tests. */
export function activeSwarmTwistId(system = swarmCourseTwists) {
  return system && system._twist ? system._twist.id : null;
}
