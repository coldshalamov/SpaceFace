// The Pull collector's knot (packet 05): a deployed gather-and-launch built from the existing owners.
//
//   • the FIELD is the Pull well — same kernel, same emitter, same lifecycle (fields.js owns it);
//   • the KNOT is a real physical body: the first eligible body to reach the emitter becomes the
//     core, every other eligible body that touches it merges in through the SAME capture
//     transaction Gyre uses (reserve -> planMeal -> applyMeal), so its collision mass is the sum of
//     what it ate;
//   • the THROW is Gyre's thrown-aggregate lifecycle (`adoptThrownAggregate`): watch, retire,
//     hand-back, save meta and kill credit are one implementation, not two.
//
// This module is the small runtime between them. It is a LIBRARY called by the fields system (one
// call site per lifecycle seam), not a registered system: no new tick, no second body store, no
// second gravity kernel — the well pulls, this only holds, counts and releases. Runtime mirror only;
// nothing here is serialized (a knot is physical, non-persistent matter, exactly like a Gyre core).
//
// Determinism: no rng, no wall clock; every choice is a pure function of the entity set the spatial
// query returns in its deterministic order.

import { queryPhysicalBodies } from '../combat/physicalEffects.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { occupantGenerationOf } from '../core/entity.js';
import { COLLECTOR_KNOT as K } from '../data/collectorKnot.js';
import { GYRE_ABSORBABLE_TYPES } from '../data/gyreSnare.js';
import { environmentMaterialOf } from '../data/environmentMaterials.js';
import {
  MATTER_REFUSAL, explainRefusal, createCaptureLedger, memberRef, refMatches, launchPlan, burstPlan, springAccel,
} from './aggregateMass.js';
import { matterRefusal, matterRadius, matterMass, matterIsDynamic, hasProtectedContent } from './aggregateEligibility.js';
import { planMeal, applyMeal } from './aggregateCapture.js';
import { stashLifetime, restoreLifetime } from './aggregateLifetime.js';

const RULES = Object.freeze({ types: new Set(GYRE_ABSORBABLE_TYPES), maxRadius: K.maxKnotRadius });
const REFUSE_KEYS = Object.freeze(['protected', 'too-heavy', 'anchored', 'collectible', 'claimed', 'saturated']);
const REFUSE_PRIORITY = Object.freeze(['saturated', 'too-heavy', 'anchored', 'protected', 'collectible', 'claimed']);
const WEAPON_ID = 'wpn_pull_collector';
const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

function freshRefuse() {
  return { protected: 0, 'too-heavy': 0, anchored: 0, collectible: 0, claimed: 0, saturated: 0 };
}

function freshKnot(rec) {
  return {
    fieldId: rec.fieldId, emitterId: rec.emitterId,
    coreRef: null, mass: 0, radius: 0, members: [], absorbs: 0,
    ledger: createCaptureLedger({ capacity: K.maxMembers }),
    nextAbsorbTick: 0, refuse: freshRefuse(), latched: { protected: false, anchored: false, collectible: false, saturated: false },
    burst: null, lostCount: 0,
  };
}

function topRefusal(refuse) {
  for (let i = 0; i < REFUSE_PRIORITY.length; i++) if (refuse[REFUSE_PRIORITY[i]] > 0) return REFUSE_PRIORITY[i];
  return null;
}

/** Aim direction for a throw from `from`: toward the aim point, else the ship's nose. */
export function knotThrowDirection(state, player, from, out = { x: 1, z: 0 }) {
  const aw = state && state.input && state.input.aimWorld;
  if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z) && from) {
    const dx = aw.x - from.x, dz = aw.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len > 1) { out.x = dx / len; out.z = dz / len; return out; }
  }
  const rot = finite(player && player.rot);
  out.x = Math.cos(rot); out.z = Math.sin(rot);
  return out;
}

/** The launch tuning object `launchPlan` reads (the data table already has exactly those keys). */
export const KNOT_LAUNCH_TUNING = K;

export function createCollectorKnots(host) {
  const knots = new Map();
  const scratch = [];
  const spring = { ax: 0, az: 0 };
  const planScratch = {};
  const evidence = { kind: 'collector', tick: 0, provenance: null };
  const dirScratch = { x: 1, z: 0 };
  const live = { contains: (body) => host.state && host.state.entities && host.state.entities.get(body.id) === body };

  const entities = () => (host.state && host.state.entities) || null;
  const markVisual = () => (host.helpers && typeof host.helpers.markEntityVisualChanged === 'function'
    ? host.helpers.markEntityVisualChanged : null);

  function coreOf(knot) {
    const ents = entities();
    if (!knot.coreRef || !ents) return null;
    const e = ents.get(knot.coreRef.id);
    if (!e || e.alive === false || !e.pos) return null;
    return refMatches(e, knot.coreRef, occupantGenerationOf) ? e : null;
  }

  function emitRefusal(code, extra) {
    if (!host.bus) return;
    const words = explainRefusal(code);
    host.bus.emit('matter:refused', { tool: 'collector', code, short: words.short, text: words.text, ...extra });
  }

  function say(text, kind = 'warn') {
    if (host.bus) host.bus.emit('toast', { kind, text, ttl: 1.8 });
  }

  /** Free the knot's core as an ordinary physical body, authored lifetime back. Never deletes matter. */
  function freeCore(knot, reason) {
    const core = coreOf(knot);
    if (core && core.data && core.data.collectorCore) {
      delete core.data.collectorCore;
      restoreLifetime(core, false, host.state && host.state.simTime);
      const mark = markVisual();
      if (mark) mark(core);
    }
    if (core && host.bus) {
      host.bus.emit('collector:freed', { fieldId: knot.fieldId, id: core.id, mass: knot.mass, reason, tick: host.state && host.state.tick });
    }
    knot.coreRef = null; knot.mass = 0; knot.radius = 0; knot.members.length = 0; knot.absorbs = 0;
    knot.ledger.reset(); knot.nextAbsorbTick = 0;
  }

  /** A held core that collapsed under us (shot, swept, adopted): the matter it carried went with it. */
  function loseCore(knot, reason) {
    if (host.bus && knot.coreRef) {
      host.bus.emit('collector:lost', { fieldId: knot.fieldId, id: knot.coreRef.id, mass: knot.mass, reason, tick: host.state && host.state.tick });
    }
    knot.lostCount += 1;
    knot.coreRef = null; knot.mass = 0; knot.radius = 0; knot.members.length = 0; knot.absorbs = 0;
    knot.ledger.reset(); knot.nextAbsorbTick = 0;
  }

  function snag(state, knot, emitter) {
    const cands = queryPhysicalBodies(state, emitter.pos, K.mawRadius + K.maxKnotRadius, host.helpers, scratch, live);
    let best = null, bestD = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      if (!e || e.alive === false || !e.pos || e.id === state.playerId || e.id === emitter.id) continue;
      if (matterRefusal(e, RULES) !== null) continue;
      if (e.physicsBody === false) continue;
      const d = Math.hypot(e.pos.x - emitter.pos.x, e.pos.z - emitter.pos.z);
      if (d <= K.mawRadius && d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    best.data = best.data || {};
    best.data.collectorCore = knot.fieldId;
    stashLifetime(best); // a timed body held mid-gather must not die at its own deadline and take the knot with it
    knot.coreRef = memberRef(best, occupantGenerationOf);
    knot.mass = matterMass(best);
    knot.radius = matterRadius(best);
    knot.members.length = 0; knot.absorbs = 0;
    knot.ledger.reset();
    knot.nextAbsorbTick = (state.tick | 0) + K.absorbGapTicks;
    const mark = markVisual();
    if (mark) mark(best);
    if (host.bus) {
      host.bus.emit('collector:snagged', { fieldId: knot.fieldId, id: best.id, mass: knot.mass, radius: knot.radius, tick: state.tick });
      host.bus.emit('audio:cue', { id: 'gyre_snare_snag', gain: 0.6, rate: 1.0, position: { x: best.pos.x, z: best.pos.z } });
    }
    return true;
  }

  function absorb(state, knot, core, e, dx, dz, dist) {
    const reservation = knot.ledger.reserve(memberRef(e, occupantGenerationOf), matterMass(e));
    if (!reservation.ok) return false;
    const before = { mass: knot.mass, radius: knot.radius, absorbs: knot.absorbs, members: knot.members.length };
    try {
      const plan = planMeal(core, e, { mass: knot.mass, radius: knot.radius }, { dx, dz, dist }, K, K.maxKnotRadius, planScratch);
      knot.mass = plan.mass;
      knot.radius = plan.radius;
      knot.absorbs += 1;
      knot.members.push({ type: e.type, material: environmentMaterialOf(e), typeId: e.data?.typeId || null,
        mass: plan.em, radius: plan.er, nx: plan.nx, nz: plan.nz });
      evidence.tick = state.tick | 0;
      applyMeal({ helpers: host.helpers, evidence, ledger: knot.ledger, markVisual: markVisual() }, core, e, plan, reservation.ticket);
      if (host.bus) {
        host.bus.emit('collector:absorbed', {
          fieldId: knot.fieldId, id: e.id, coreId: core.id, victimId: e.id, mass: plan.em,
          knotMass: knot.mass, knotRadius: knot.radius, tick: state.tick,
        });
        host.bus.emit('audio:cue', { id: 'gyre_snare_absorb', gain: 0.5 + 0.3 * Math.min(1, plan.em / 160),
          rate: 1.1 - Math.min(0.4, plan.em / 200), position: { x: e.pos.x, z: e.pos.z } });
      }
      return true;
    } catch (err) {
      if (knot.ledger.cancel(reservation.ticket)) {
        knot.mass = before.mass; knot.radius = before.radius; knot.absorbs = before.absorbs; knot.members.length = before.members;
      }
      throw err;
    }
  }

  function tallyRefusal(knot, code) {
    if (code != null && Object.prototype.hasOwnProperty.call(knot.refuse, code)) knot.refuse[code] += 1;
  }

  function tickGather(state, knot, emitter, dt) {
    const core = coreOf(knot);
    if (knot.coreRef && !core) { loseCore(knot, 'core_lost'); }
    if (!knot.coreRef) { snag(state, knot, emitter); return; }
    const held = coreOf(knot);
    if (!held) return;
    // A cargo/quest owner can adopt a formerly empty body while it is held: it is theirs now.
    if (hasProtectedContent(held)) {
      freeCore(knot, 'adopted');
      say('Collector — knot reclaimed by its owner');
      return;
    }
    const away = Math.hypot(held.pos.x - emitter.pos.x, held.pos.z - emitter.pos.z);
    if (away > K.holdBreakDist) { freeCore(knot, 'strained'); say('Collector — knot torn loose'); return; }
    // Hold: spring to the emitter point, additive on the physics membrane (never overwrites a command).
    const mass = matterMass(held);
    springAccel(held.pos.x, held.pos.z, finite(held.vel && held.vel.x), finite(held.vel && held.vel.z),
      emitter.pos.x, emitter.pos.z, 0, 0, K.holdSpringK, K.holdDamping, K.holdMaxAccel, spring);
    evidence.tick = state.tick | 0;
    queuePhysicsImpulse(held, { x: spring.ax * mass * dt, y: 0, z: spring.az * mass * dt }, evidence);

    // Merge pass: bodies that touch the knot's skin join it, one per gap, nearest first.
    const reach = knot.radius + K.maxKnotRadius + K.absorbEpsilonWu;
    const cands = queryPhysicalBodies(state, held.pos, reach, host.helpers, scratch, live);
    const tick = state.tick | 0;
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      if (!e || e === held || e.id === held.id || e.id === state.playerId || e.id === emitter.id || e.alive === false || !e.pos) continue;
      const why = matterRefusal(e, RULES);
      const dx = held.pos.x - e.pos.x, dz = held.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const er = matterRadius(e);
      const touching = dist <= knot.radius + er + K.absorbEpsilonWu;
      if (why !== null) {
        if (touching && e.type !== 'projectile') tallyRefusal(knot, why);
        continue;
      }
      if (!touching) continue;
      if (knot.members.length >= K.maxMembers) { tallyRefusal(knot, MATTER_REFUSAL.SATURATED); continue; }
      if (tick < knot.nextAbsorbTick) continue;
      if (absorb(state, knot, held, e, dx, dz, dist)) knot.nextAbsorbTick = tick + K.absorbGapTicks;
    }
  }

  /** The throw is over (or the ball died mid-burst): the knot is empty again and gathers anew. */
  function endBurst(knot) {
    knot.burst = null;
    knot.coreRef = null; knot.mass = 0; knot.radius = 0; knot.members.length = 0; knot.absorbs = 0;
    knot.ledger.reset(); knot.nextAbsorbTick = 0;
    return true;
  }

  function tickBurst(state, knot) {
    const core = coreOf(knot);
    const burst = knot.burst;
    if (!core || burst.left <= 0) return endBurst(knot);
    // The five-tick burst belongs to this owner even after its emitter is gone. Re-check adoption
    // before each impulse: Gyre's own LAUNCH guard does not run for a collector-produced throw.
    if (hasProtectedContent(core)) {
      const gyre = host.registry && typeof host.registry.get === 'function' ? host.registry.get('gyreSnare') : null;
      if (gyre && typeof gyre.handBackThrownAggregate === 'function') gyre.handBackThrownAggregate(core);
      say('Collector — knot reclaimed by its owner');
      return endBurst(knot);
    }
    if (!core.data?.gyreLaunched || core.data.despawnAt == null) return endBurst(knot);
    evidence.tick = state.tick | 0;
    const first = burst.left === burst.ticks;
    queuePhysicsImpulse(core, {
      x: burst.perTick.x + (first ? burst.lateral.x : 0), y: 0,
      z: burst.perTick.z + (first ? burst.lateral.z : 0),
    }, evidence);
    burst.left -= 1;
    if (core.data && core.data.gyreLaunchMeta && first) core.data.gyreLaunchMeta.burst = true;
    if (burst.left <= 0) return endBurst(knot);
    return false;
  }

  function publishRefusals(state, knot) {
    if (!host.bus) return;
    for (const code of Object.keys(knot.latched)) {
      const count = knot.refuse[code];
      if (count > 0 && !knot.latched[code]) {
        knot.latched[code] = true;
        emitRefusal(code, { count, fieldId: knot.fieldId, tick: state.tick });
      } else if (count === 0) knot.latched[code] = false;
    }
  }

  const api = {
    /** Per-tick, flight only: for each deployed collector, snag / hold / merge / burst. */
    tick(state, rt, dt) {
      const seen = new Set();
      for (const id of Object.keys(rt.deployed)) {
        const rec = rt.deployed[id];
        if (!rec || !rec.collector) continue;
        seen.add(id);
        const emitter = state.entities && state.entities.get(rec.emitterId);
        if (!emitter || emitter.alive === false || !emitter.pos) continue; // the retire hook frees the knot
        let knot = knots.get(id);
        if (!knot) { knot = freshKnot(rec); knots.set(id, knot); }
        for (const k of REFUSE_KEYS) knot.refuse[k] = 0;
        if (knot.burst) { tickBurst(state, knot); continue; }
        tickGather(state, knot, emitter, dt);
        publishRefusals(state, knot);
      }
      // A knot still bursting outlives its emitter record; anything else without a record is stale.
      for (const [id, knot] of knots) {
        if (seen.has(id)) continue;
        if (knot.burst) { if (tickBurst(state, knot)) knots.delete(id); continue; }
        freeCore(knot, 'orphaned');
        knots.delete(id);
      }
    },

    /** The emitter is leaving (expired, shot down, replaced, cleared): set the knot free, never delete it. */
    free(fieldId, reason) {
      const knot = knots.get(fieldId);
      if (!knot) return false;
      if (!knot.burst) { freeCore(knot, reason || 'emitter_gone'); knots.delete(fieldId); }
      return true;
    },

    /** Sector boundary / load / new game: every knot is set free (the world is about to be replaced). */
    clear(reason) {
      for (const [id, knot] of knots) {
        if (!knot.burst) freeCore(knot, reason || 'cleared');
        knots.delete(id);
      }
    },

    get(fieldId) { return knots.get(fieldId) || null; },
    get size() { return knots.size; },

    /** The pilot's collector knot (maxActive is 1). */
    own(state, rt) {
      for (const id of Object.keys(rt.deployed)) {
        const rec = rt.deployed[id];
        if (rec && rec.collector) return { rec, knot: knots.get(id) || null };
      }
      return null;
    },

    coreOf,

    /**
     * What the Pull key means right now. Returns 'deploy' (nothing to focus: drop a collector),
     * 'replace' (an empty collector: recall it and drop a new one), 'release' (a knot: focus/commit)
     * or 'busy' (the throw is mid-burst: the press is ignored, never a second throw or a recall).
     */
    intent(state, rt) {
      const own = api.own(state, rt);
      if (!own) return 'deploy';
      if (own.knot && own.knot.burst) return 'busy';
      const core = own.knot ? coreOf(own.knot) : null;
      return core ? 'release' : 'replace';
    },

    /**
     * Commit the knot's release. Spends charge, throws FROM WHERE THE KNOT PHYSICALLY IS along the aim
     * vector, and hands the ball to Gyre's thrown-aggregate lifecycle. Every refusal has a code and
     * consumes nothing. Returns { ok, reason?, plan? }.
     */
    commit(state, rt, player) {
      const own = api.own(state, rt);
      const knot = own && own.knot;
      const core = knot ? coreOf(knot) : null;
      if (!knot || !core) return { ok: false, reason: MATTER_REFUSAL.UNAVAILABLE };
      const fail = (code, extra) => {
        emitRefusal(code, { fieldId: knot.fieldId, tick: state.tick, ...extra });
        if (host.bus) host.bus.emit('audio:cue', { id: 'ui_deny', gain: 0.6 });
        return { ok: false, reason: code };
      };
      if (hasProtectedContent(core)) {
        freeCore(knot, 'adopted');
        say('Collector — knot reclaimed by its owner');
        return fail(MATTER_REFUSAL.PROTECTED, {});
      }
      const reach = Math.hypot(core.pos.x - player.pos.x, core.pos.z - player.pos.z);
      if (reach > K.focusRange) {
        say(`Collector — knot is out of reach (${Math.round(reach)} wu)`);
        return fail(MATTER_REFUSAL.OUT_OF_RANGE, { need: K.focusRange, have: reach });
      }
      const plan = launchPlan(knot.mass, K);
      const cap = typeof player.cap === 'number' && Number.isFinite(player.cap) ? player.cap
        : (player.data && player.data.derived && player.data.derived.cap) || 0;
      if (cap < plan.chargeCost) {
        say(`Collector — needs ${Math.ceil(plan.chargeCost)} charge to throw`);
        return fail(MATTER_REFUSAL.DRY, { need: plan.chargeCost, have: cap });
      }
      const dir = knotThrowDirection(state, player, core.pos, dirScratch);
      const gyre = host.registry && typeof host.registry.get === 'function' ? host.registry.get('gyreSnare') : null;
      if (!gyre || typeof gyre.adoptThrownAggregate !== 'function') {
        say('Collector — nothing to carry the throw');
        return fail(MATTER_REFUSAL.UNAVAILABLE, {});
      }
      const members = knot.members.slice();
      const mass = knot.mass, radius = knot.radius, absorbs = knot.absorbs;
      // The charge is spent only once the throw is certain to be armed.
      const armed = gyre.adoptThrownAggregate(core, {
        mass, radius, absorbs, members, tuning: K, weaponId: WEAPON_ID, tag: 'collector_launch',
        clearMark: 'collectorCore', dir: { x: dir.x, z: dir.z }, source: 'collector',
      });
      if (!armed) return fail(MATTER_REFUSAL.UNAVAILABLE, {});
      player.cap = Math.max(0, cap - plan.chargeCost);
      // The burst is planned from the knot's own state: it is thrown where it sits, so there is no
      // carrier frame to strip (refVel = its own velocity) and no coil.
      const cv = { x: finite(core.vel && core.vel.x), z: finite(core.vel && core.vel.z) };
      const b = burstPlan({ mass: matterMass(core), dir, coreVel: cv, refVel: cv, speed: plan.speed, ticks: plan.ticks });
      knot.burst = { left: plan.ticks, ticks: plan.ticks, perTick: b.perTick, lateral: b.lateral };
      knot.coreRef = memberRef(core, occupantGenerationOf); // the burst keeps its handle on the flying ball
      if (host.bus) {
        host.bus.emit('collector:released', {
          fieldId: knot.fieldId, id: core.id, mass, radius, absorbs, speed: plan.speed, cost: plan.chargeCost,
          dir: { x: dir.x, z: dir.z }, origin: { x: core.pos.x, z: core.pos.z }, tick: state.tick,
        });
        const frac = Math.min(1, mass / K.maxClumpMass);
        host.bus.emit('audio:cue', { id: 'gyre_snare_launch', gain: 0.7 + 0.5 * frac, rate: 1.05 - 0.45 * frac,
          position: { x: core.pos.x, z: core.pos.z } });
        host.bus.emit('camera:shake', { amount: 0.2 + 0.2 * frac });
      }
      return { ok: true, plan };
    },

    /** The runtime mirror the rail, HUD and preview read. In place; one object for the whole session. */
    publish(state, fitted) {
      const fr = state.fieldsRuntime || (state.fieldsRuntime = {});
      const pub = fr.collector || (fr.collector = {
        fitted: false, active: false, fieldId: null, coreId: null, phase: 'off', mass: 0, radius: 0, members: 0, capacity: K.maxMembers,
        cost: 0, ready: false, refusal: null, refusals: freshRefuse(), next: 'DROP', maxMass: K.maxClumpMass,
        corePos: { x: 0, z: 0 }, burst: false,
      });
      pub.fitted = fitted === true;
      const rt = state.fields;
      const own = rt ? api.own(state, rt) : null;
      if (!own) {
        pub.active = false; pub.fieldId = null; pub.coreId = null; pub.phase = 'off'; pub.mass = 0; pub.radius = 0; pub.members = 0;
        pub.cost = 0; pub.ready = false; pub.refusal = null; pub.next = 'DROP'; pub.burst = false;
        for (const k of REFUSE_KEYS) pub.refusals[k] = 0;
        return pub;
      }
      const knot = own.knot;
      const core = knot ? coreOf(knot) : null;
      pub.active = true; pub.fieldId = own.rec.fieldId;
      pub.burst = !!(knot && knot.burst);
      pub.mass = core ? knot.mass : 0;
      pub.radius = core ? knot.radius : 0;
      pub.members = core ? knot.members.length : 0;
      pub.cost = core ? launchPlan(knot.mass, K).chargeCost : 0;
      pub.phase = pub.burst ? 'released' : core ? 'knot' : 'gathering';
      pub.ready = !!core && !pub.burst;
      pub.next = pub.ready ? 'RELEASE' : 'REPLACE';
      for (const k of REFUSE_KEYS) pub.refusals[k] = knot ? knot.refuse[k] | 0 : 0;
      pub.refusal = knot ? topRefusal(knot.refuse) : null;
      pub.coreId = core ? core.id : null;
      if (core) { pub.corePos.x = core.pos.x; pub.corePos.z = core.pos.z; }
      return pub;
    },
  };
  return api;
}
