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
} from '../data/swarmTwists.js';
import { isSwarmRuleset } from './survivalSwarm.js';

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
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
      const culprit = (payload.aId === playerId ? b : payload.bId === playerId ? a : null)
        || (a && b ? a : null);
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

const MODULES = {
  delivery: createDeliveryModule,
  lights_out: createLightsOutModule,
  highway_robbery: createHighwayRobberyModule,
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
