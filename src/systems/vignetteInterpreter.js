// Lived vignettes — one phase machine for externalOnly easter-egg encounters.
//
// The campaign director's day cap is not a place to pour more life: extra weighted shapes
// steal the three ambient slots and reshuffle every seeded schedule. These runtimes are
// requested explicitly (gates.externalOnly) and always resolve, so a civilian beat cannot
// sit in dir.live forever (stale retirement only covers combat).
//
// A runtime may write live.* and intent on hulls it spawned. Credits and reputation go
// through d.grant / d.charge / d.rep. No Math.random, no wall clock.
//
// A choice may carry `requires: { module }` or `requires: { commodity, qty }`. Without that
// hardware the choice is omitted from the offer and choose() ignores it. The timeout choice
// stays open so the scene can still leave. This reads fittings and cargo; it never writes them.

import { hasFittedModule } from '../core/fittedModules.js';

const HOP_CAP = 12;
const MOTIONS = new Set(['hold', 'orbit', 'creep', 'ring', 'weave', 'depart', 'face', 'chase', 'tow', 'column', 'vulture']);
const AWAIT_KINDS = new Set([
  'latched', 'strained', 'displaced', 'near', 'released', 'settled', 'parked',
  'clearOfActors', 'formation', 'trail', 'visit', 'oppositeSides', 'depart',
  'meet', 'gapCross',
]);

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function entPos(e) {
  return e && e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z) ? e.pos : null;
}

function roleEnt(d, live, state, v, role) {
  const id = v.roleIds && v.roleIds[role];
  if (id == null) return null;
  return (state.entities && typeof state.entities.get === 'function' && state.entities.get(id)) || null;
}

function distBetween(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function playerOf(d, state) {
  const p = d.player && d.player();
  if (p && p.alive !== false && entPos(p)) return p;
  const id = state && state.playerId;
  const e = id != null && state.entities ? state.entities.get(id) : null;
  return e && e.alive !== false && entPos(e) ? e : null;
}

// A physical subject must be a live body with a finite pose: dead contacts, recycled ids,
// and NaN positions are 'gone', never readable as satisfying the ask.
function subjectEnt(e) {
  return e && e.alive !== false && entPos(e) ? e : null;
}

// Velocity the step may read. A body with no velocity field rests at zero; a body carrying
// a non-finite component is corrupt — NaN must never coerce into a stop sign.
function velOf(e) {
  if (!e || !e.vel) return { x: 0, z: 0 };
  const x = Number(e.vel.x), z = Number(e.vel.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function speedOf(e) {
  const v = velOf(e);
  return v ? Math.hypot(v.x, v.z) : NaN;
}

function tetherOf(state) {
  return state && state.player ? state.player.tether || null : null;
}

// Every physical predicate observes; it never moves a body, touches the tether, or writes
// credits. A missing/dead/non-finite subject is a 'gone' marker the await aborts on.
// `true` completes the step, 'gone' aborts the await, false keeps it running.
function evalAwaitStep(d, live, state, v, step, now) {
  const player = playerOf(d, state);
  if (!player) return 'gone';
  const subj = (step.subject === 'prop')
    ? roleEnt(d, live, state, v, 'prop')
    : player;
  if (step.subject === 'prop' && !subjectEnt(subj)) return 'gone';
  const tether = tetherOf(state);
  const propId = v.roleIds && v.roleIds.prop;
  const latchedToProp = !!tether && tether.active === true
    && propId != null && String(tether.targetId) === String(propId);
  const holdS = num(step.holdS, 0);
  const heldFor = (ok) => {
    if (ok) {
      if (v.holdSince == null) v.holdSince = now;
      return now - v.holdSince >= holdS - 1e-9;
    }
    v.holdSince = null;
    return false;
  };
  switch (step.kind) {
    case 'latched':
      if (latchedToProp) v.latchedPropId = propId;
      return latchedToProp;
    // Amended bar (plan gate): 'the line is working' = an active latch that has finished
    // its capture and carries real load — tether.load ≥ 0.35 — held 2 s, not the legacy
    // strain ratio which never reaches 0.05 under a real tow.
    case 'strained': {
      const ok = latchedToProp && tether.phase !== 'slack'
        && num(tether.load, 0) >= num(step.loadMin, 0.35);
      return heldFor(ok);
    }
    case 'displaced': {
      const prop = roleEnt(d, live, state, v, 'prop');
      const start = v.entityStarts && v.entityStarts[propId];
      if (!subjectEnt(prop) || !start) return 'gone';
      return latchedToProp && distBetween(prop.pos, start) >= num(step.dist, 120);
    }
    case 'near': {
      const target = roleEnt(d, live, state, v, step.of);
      if (!subjectEnt(target)) return 'gone';
      return distBetween(subj.pos, target.pos) <= num(step.dist, 60);
    }
    case 'visit': {
      const target = roleEnt(d, live, state, v, step.of);
      if (!subjectEnt(target)) return 'gone';
      const inside = distBetween(player.pos, target.pos) <= num(step.dist, 70);
      // An arrival only counts after an observed departure from that same ring. While the
      // step is active, seeing the player outside arms it; stepping inside armed completes
      // it. Starting inside the ring — or sitting still across an overlapping pair — can
      // never satisfy the ask: the ring must be exited and re-entered for real.
      if (!inside) { v.visitArmed = true; return false; }
      return v.visitArmed === true;
    }
    case 'released':
      return propId == null || String(tether && tether.targetId) !== String(propId);
    case 'settled': {
      const prop = roleEnt(d, live, state, v, 'prop');
      if (!subjectEnt(prop)) return 'gone';
      const speed = speedOf(prop);
      if (!Number.isFinite(speed)) return 'gone';
      return heldFor(speed <= num(step.maxSpeed, 5));
    }
    case 'parked': {
      const prop = roleEnt(d, live, state, v, 'prop');
      const hull = roleEnt(d, live, state, v, step.at);
      if (!subjectEnt(prop) || !subjectEnt(hull)) return 'gone';
      const speed = speedOf(prop);
      if (!Number.isFinite(speed)) return 'gone';
      const ok = distBetween(prop.pos, hull.pos) <= num(step.dist, 30)
        && String(tether && tether.targetId) !== String(propId)
        && speed <= num(step.maxSpeed, 3);
      return heldFor(ok);
    }
    case 'clearOfActors': {
      const prop = roleEnt(d, live, state, v, 'prop');
      if (!subjectEnt(prop)) return 'gone';
      for (const role of step.of || []) {
        const hull = roleEnt(d, live, state, v, role);
        if (!subjectEnt(hull)) return 'gone';
        if (distBetween(prop.pos, hull.pos) < num(step.dist, 180)) return false;
      }
      return true;
    }
    case 'formation': {
      const leader = roleEnt(d, live, state, v, step.of);
      if (!subjectEnt(leader)) return 'gone';
      const range = distBetween(player.pos, leader.pos);
      const inFormation = range >= num(step.min, 60) && range <= num(step.max, 180);
      if (!inFormation) {
        v.formationStart = null;
        return heldFor(false);
      }
      // Only travel accompanied in this uninterrupted station-keeping interval counts.
      // Entry-time travel, or travel before a range break / preceding step, is not work.
      if (!v.formationStart) v.formationStart = { x: leader.pos.x, z: leader.pos.z };
      return heldFor(true)
        && distBetween(leader.pos, v.formationStart) >= num(step.leaderProgress, 100);
    }
    case 'trail': {
      const leader = roleEnt(d, live, state, v, step.of);
      const start = v.entityStarts && v.entityStarts[v.roleIds[step.of]];
      if (!subjectEnt(leader) || !start) return 'gone';
      const pv = velOf(player), lv = velOf(leader);
      if (!pv || !lv) return 'gone';
      const range = distBetween(player.pos, leader.pos);
      const hx = Math.cos(leader.rot || 0), hz = Math.sin(leader.rot || 0);
      const behind = ((player.pos.x - leader.pos.x) * hx + (player.pos.z - leader.pos.z) * hz) < 0;
      const relSpeed = Math.hypot(pv.x - lv.x, pv.z - lv.z);
      // Trailing is formation work too: range, wake-side station, matched speed — and the
      // lead must actually be getting somewhere, not parked on its entry mark.
      const ok = range >= num(step.min, 60) && range <= num(step.max, 180)
        && behind && relSpeed <= num(step.maxRelSpeed, 8)
        && distBetween(leader.pos, start) >= num(step.leaderProgress, 100);
      return heldFor(ok);
    }
    case 'oppositeSides': {
      const hull = roleEnt(d, live, state, v, step.of);
      if (!subjectEnt(hull)) return 'gone';
      // Track which half of the hull's local axis the player occupies; the step finishes
      // when they cross to the other half, inside the 100–160 WU band, after ≥120 WU of
      // accumulated player travel while the step is live.
      const dx = player.pos.x - hull.pos.x;
      const dz = player.pos.z - hull.pos.z;
      const range = Math.hypot(dx, dz);
      const hx = Math.cos(hull.rot || 0), hz = Math.sin(hull.rot || 0);
      const side = (dx * -hz + dz * hx) >= 0 ? 1 : -1;
      if (v.sideStart == null) v.sideStart = side;
      v.playerTravel = num(v.playerTravel, 0)
        + (v.lastPlayerPos ? distBetween(player.pos, v.lastPlayerPos) : 0);
      const ok = side !== v.sideStart
        && range >= num(step.min, 100) && range <= num(step.max, 160)
        && v.playerTravel >= num(step.travel, 120);
      if (ok) return true;
      if (side !== v.sideStart) v.sideStart = side; // a crossing outside the band restarts
      return false;
    }
    case 'depart': {
      v.playerTravel = num(v.playerTravel, 0)
        + (v.lastPlayerPos ? distBetween(player.pos, v.lastPlayerPos) : 0);
      const anchor = live.anchor || v.playerStart;
      if (!anchor) return false;
      return v.playerTravel >= num(step.dist, 180)
        && distBetween(player.pos, anchor) >= num(step.far, 1000);
    }
    case 'meet': {
      const target = roleEnt(d, live, state, v, step.of);
      if (!subjectEnt(target)) return 'gone';
      const speed = speedOf(player);
      if (!Number.isFinite(speed)) return 'gone';
      const ok = distBetween(player.pos, target.pos) <= num(step.dist, 60)
        && speed <= num(step.maxSpeed, 5);
      return heldFor(ok);
    }
    case 'gapCross': {
      const a = roleEnt(d, live, state, v, (step.of || [])[0]);
      const b = roleEnt(d, live, state, v, (step.of || [])[1]);
      if (!subjectEnt(a) || !subjectEnt(b)) return 'gone';
      // The gap is the bounded segment between the two hulls. Crossing it means the
      // player's signed perpendicular distance to the AB line changed sides between
      // observations AND the interpolated crossing point landed on the segment itself,
      // inside `within` of its midpoint — sliding along the axis or crossing the line's
      // extension past the hulls does not count.
      const abx = b.pos.x - a.pos.x, abz = b.pos.z - a.pos.z;
      const lenSq = abx * abx + abz * abz;
      const len = Math.sqrt(lenSq) || 1;
      const nx = -abz / len, nz = abx / len;
      const sideOf = (x, z) => ((x - a.pos.x) * nx + (z - a.pos.z) * nz);
      const perp = sideOf(player.pos.x, player.pos.z);
      const prev = v.gapPrev || null;
      v.gapPrev = { perp, x: player.pos.x, z: player.pos.z };
      if (!prev || (prev.perp >= 0) === (perp >= 0)) return false;
      const denom = prev.perp - perp;
      const frac = Math.abs(denom) > 1e-9 ? prev.perp / denom : 0.5;
      const cx = prev.x + (player.pos.x - prev.x) * frac;
      const cz = prev.z + (player.pos.z - prev.z) * frac;
      const rel = lenSq > 0 ? ((cx - a.pos.x) * abx + (cz - a.pos.z) * abz) / lenSq : 0.5;
      if (rel < 0 || rel > 1) return false; // crossed the line beyond the hulls' ends
      const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
      return distBetween({ x: cx, z: cz }, mid) <= num(step.within, 60);
    }
    default:
      return 'gone';
  }
}

function enterAwait(d, live, state, phase) {
  const now = d.now();
  const v = live.vars.vAwait = {
    phaseId: phase.id,
    stepIndex: 0,
    startedAt: now,
    lastAt: now,
    holdSince: null,
    playerStart: null,
    entityStarts: {},
    lastPlayerPos: null,
    playerTravel: 0,
    latchedPropId: null,
    roleIds: {},
  };
  const player = playerOf(d, state);
  if (player) {
    v.playerStart = { x: player.pos.x, z: player.pos.z };
    v.lastPlayerPos = { x: player.pos.x, z: player.pos.z };
  }
  for (const id of live.ids || []) {
    const role = live.roles && live.roles[id];
    if (!role) continue;
    const e = state.entities && state.entities.get ? state.entities.get(id) : null;
    if (subjectEnt(e)) {
      v.roleIds[role] = id;
      v.entityStarts[id] = { x: e.pos.x, z: e.pos.z };
    }
  }
  live.deadlineAt = now + Math.max(1, num(phase.timeoutS, 120));
}

function stepAwait(d, live, state, spec, phase, byId, now) {
  const v = live.vars.vAwait;
  if (!v) return d.abort(live, 'await_missing');
  const player = playerOf(d, state);
  if (now >= live.deadlineAt) {
    // A post-commit timeout is never silent: the paid toll, the aborted tow — the scene
    // acknowledges what the player did before it closes. The debit stands.
    if (phase.timeoutLine) d.say(live, 'info', phase.timeoutLine, null, { literal: true });
    return d.abort(live, 'physical_timeout');
  }
  // Stationary work brakes the cast toward their captured entry positions; escort
  // recipes keep their passive procession via keepMotion.
  if (!phase.keepMotion) {
    for (const id of live.ids || []) {
      const e = state.entities && state.entities.get ? state.entities.get(id) : null;
      const start = v.entityStarts[id];
      if (e && e.type === 'ship' && start) steerToward(e, start.x, start.z, 40);
    }
  }
  while (v.stepIndex < phase.steps.length) {
    const result = evalAwaitStep(d, live, state, v, phase.steps[v.stepIndex], now);
    if (result === 'gone') return d.abort(live, 'physical_subject_gone');
    if (result !== true) {
      if (player) v.lastPlayerPos = { x: player.pos.x, z: player.pos.z };
      return;
    }
    v.stepIndex += 1;
    v.holdSince = null;
    v.formationStart = null;
    v.playerTravel = 0;
    // Per-step observation state resets: a fresh step cannot inherit an arming, a side
    // marker, or a gap approach from the step before it.
    v.visitArmed = null;
    v.sideStart = null;
    v.gapPrev = null;
    if (player) v.lastPlayerPos = { x: player.pos.x, z: player.pos.z };
  }
  live.vars.vAwait = null;
  if (!phase.next) return d.abort(live, 'no_next');
  live.vars.vPhase = phase.next;
  hop(d, live, state, spec, byId);
}

// Vignettes own destinations, not a second helm. Passive/hold-fire actors opt into the
// same tactical navigation that clears solid scenery and freight for other pilots.
function steerToward(e, tx, tz, slow, motion = 'hold', velocity = null) {
  if (!e || !e.pos) return;
  const dx = tx - e.pos.x;
  const dz = tz - e.pos.z;
  const distance = Math.hypot(dx, dz);
  const stop = slow || 80;
  const remaining = velocity && motion !== 'depart' ? distance : Math.max(0, distance - stop);
  const data = e.data || (e.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  ai.allowPassiveManeuver = true;
  ai.roe = 'hold_fire';
  ai.activity = {
    ...ai.activity,
    kind: motion === 'hold' || motion === 'face' ? 'loiter' : 'transit',
    reason: `vignette_motion:${motion}`,
    anchor: {
      x: e.pos.x + (distance > 0 ? dx / distance * remaining : 0),
      z: e.pos.z + (distance > 0 ? dz / distance * remaining : 0),
    },
    anchorVelocity: velocity,
    targetId: null,
    preferredRange: 0,
  };
  // Retain the authored endpoint for observers, but never overwrite the maneuver's
  // thruster request. Firing remains forbidden by passive + ROE at the final adapter.
  const intent = data.intent || (data.intent = {});
  intent.tx = tx;
  intent.tz = tz;
  intent.fire = false;
}

function phaseOf(byId, id) {
  return byId.get(id) || null;
}

function hardwareSatisfied(state, requires) {
  if (!requires || typeof requires !== 'object') return true;
  const moduleId = typeof requires.module === 'string' ? requires.module : '';
  const commodityId = typeof requires.commodity === 'string' ? requires.commodity : '';
  if (!moduleId && !commodityId) return true;
  if (moduleId && !hasFittedModule(state, moduleId)) return false;
  if (commodityId) {
    const need = Math.max(1, Math.floor(Number(requires.qty) || 1));
    const items = state && state.player && state.player.cargo && state.player.cargo.items;
    const held = Math.floor(Number(items && items[commodityId]) || 0);
    if (held < need) return false;
  }
  return true;
}

function choiceOpen(state, spec, choiceId) {
  if (spec && choiceId === spec.timeoutChoice) return true;
  const choice = spec && Array.isArray(spec.choices)
    ? spec.choices.find((row) => row && row.id === choiceId)
    : null;
  if (!choice) return true;
  return hardwareSatisfied(state, choice.requires);
}

function rememberSeen(state, id, outcome) {
  const dir = state && state.encounterDirector;
  if (!dir) return;
  if (!dir.stats || typeof dir.stats !== 'object') dir.stats = {};
  if (!dir.stats.livedSeen || typeof dir.stats.livedSeen !== 'object') dir.stats.livedSeen = {};
  dir.stats.livedSeen[id] = outcome || 'seen';
}

export function applyMotion(d, live, motion, now) {
  // Vignettes own destinations, not a second helm — and only for hulls. Props on live.ids
  // are tetherable scene objects (spawnProp marks them parentType 'story_prop'), never
  // pilots: no AI helm instructions reach them. Everything else on the cast keeps its
  // legacy steering — bare fixture entities count too.
  const ships = d.entsOf(live).filter((e) => e && e.pos
    && !(e.data && e.data.parentType === 'story_prop'));
  if (!ships.length || !motion) return;
  const origin = live.vars.motionOrigin || live.anchor || ships[0].pos;
  const t = now - (live.vars.motionT0 ?? now);
  const sceneAxis = live.data && live.data.sceneAxis;
  const ux = sceneAxis && Number.isFinite(sceneAxis.ux) ? sceneAxis.ux : 1;
  const uz = sceneAxis && Number.isFinite(sceneAxis.uz) ? sceneAxis.uz : 0;
  if (motion === 'chase') {
    const runner = ships[0];
    if (!runner || !runner.pos) return;
    steerToward(runner, origin.x + ux * 700, origin.z + uz * 700, 40, motion);
    const hx = Math.cos(runner.rot || 0);
    const hz = Math.sin(runner.rot || 0);
    for (let i = 1; i < ships.length; i++) {
      steerToward(ships[i], runner.pos.x - hx * 60 * i, runner.pos.z - hz * 60 * i, 30,
        motion, { x: runner.vel?.x || 0, z: runner.vel?.z || 0 });
    }
    return;
  }
  if (motion === 'tow') {
    const tug = ships[0];
    if (!tug || !tug.pos) return;
    const cruise = (Number(tug.maxSpeed) || 120) * 0.22;
    steerToward(tug, origin.x + ux * 500, origin.z + uz * 500, 40, motion,
      { x: ux * cruise, z: uz * cruise });
    const hx = Math.cos(tug.rot || 0);
    const hz = Math.sin(tug.rot || 0);
    for (let i = 1; i < ships.length; i++) {
      steerToward(ships[i], tug.pos.x - hx * 55 * i, tug.pos.z - hz * 55 * i, 20,
        motion, { x: tug.vel?.x || 0, z: tug.vel?.z || 0 });
    }
    return;
  }
  if (motion === 'column') {
    for (let i = 0; i < ships.length; i++) {
      const distance = 700 - 90 * i;
      steerToward(ships[i], origin.x + ux * distance, origin.z + uz * distance, 40, motion);
    }
    return;
  }
  if (motion === 'hold' || motion === 'face') {
    if (motion === 'face' && ships.length >= 2) {
      steerToward(ships[0], ships[1].pos.x, ships[1].pos.z, 110);
      steerToward(ships[1], ships[0].pos.x, ships[0].pos.z, 110);
      for (let i = 2; i < ships.length; i++) steerToward(ships[i], origin.x, origin.z, 70);
    } else {
      const player = d.player && d.player();
      const tx = player && player.pos ? player.pos.x : origin.x;
      const tz = player && player.pos ? player.pos.z : origin.z;
      for (const ship of ships) steerToward(ship, tx, tz, 160);
    }
    return;
  }
  if (motion === 'depart') {
    // The hailer is ships[0]. They leave. The rest hold the berth.
    for (let i = 1; i < ships.length; i++) steerToward(ships[i], origin.x, origin.z, 40);
    const ship = ships[0], tx = origin.x + 900, tz = origin.z + 220;
    const dx = tx - ship.pos.x, dz = tz - ship.pos.z, distance = Math.hypot(dx, dz);
    const speed = Number(ship.propulsion?.maxSpeed || ship.data?.derived?.propulsion?.maxSpeed || ship.maxSpeed) || 0;
    const velocity = distance > 60
      ? { x: dx / distance * speed, z: dz / distance * speed } : { x: 0, z: 0 };
    steerToward(ship, tx, tz, 60, motion, velocity);
    return;
  }
  const speed = motion === 'vulture' ? 0.7 : motion === 'orbit' ? 0.55 : motion === 'weave' ? 0.8 : motion === 'creep' ? 0.22 : 0.35;
  const radius = motion === 'vulture' ? 95 : motion === 'ring' ? 220 : motion === 'creep' ? 40 : 160;
  for (let i = 0; i < ships.length; i++) {
    const ang = t * speed + (i / ships.length) * Math.PI * 2;
    const ox = motion === 'creep' ? origin.x + t * 28 : origin.x;
    const oz = motion === 'creep' ? origin.z + Math.sin(t * 0.4) * 30 : origin.z;
    const tx = ox + Math.cos(ang) * radius;
    const tz = oz + Math.sin(ang) * (motion === 'weave' ? radius * 0.45 : radius);
    // The authored point is moving. Its derivative lets the shared tracker match
    // that motion instead of braking toward zero velocity inside the ring.
    const velocity = {
      x: (motion === 'creep' ? 28 : 0) - Math.sin(ang) * radius * speed,
      z: (motion === 'creep' ? Math.cos(t * 0.4) * 12 : 0)
        + Math.cos(ang) * (motion === 'weave' ? radius * 0.45 : radius) * speed,
    };
    steerToward(ships[i], tx, tz, motion === 'creep' ? 50 : 36, motion, velocity);
  }
}

function runVerb(d, live, state, spec, phase) {
  const verb = phase.verb;
  if (verb === 'say') {
    const overlay = live.data && live.data.livedOverlay;
    const text = phase.id === 'work_line' && overlay && overlay.line
      ? overlay.line
      : phase.line || '';
    if (text) {
      d.say(live, phase.channel || 'info', text, null, {
        literal: true,
        primary: phase.primary === true,
      });
    }
    return true;
  }
  if (verb === 'spawn') {
    const anchor = live.anchor || { x: 0, z: 0 };
    const overlay = live.data && live.data.livedOverlay;
    live.ids = live.ids || [];
    live.roles = live.roles || {};
    live.plan = live.plan || {};
    live.plan.ships = (spec.cast || []).map((member, index) => ({
      archetype: member.archetype,
      level: member.level || 2,
      pos: { x: anchor.x + (member.dx || 0), z: anchor.z + (member.dz || 0) },
      factionId: member.factionId || spec.factionId || 'faction_free',
      context: 'convoy_civilian',
      role: member.role,
      passive: true,
      team: 2,
      scanLabel: overlay && overlay.crew
        ? `${overlay.crew} ${index + 1}`
        : member.scanLabel || spec.title,
    }));
    const ids = d.spawnShips(live, live.plan.ships) || [];
    if (ids.length < (spec.cast || []).length) {
      d.abort(live, 'spawn_failed');
      return false;
    }
    return true;
  }
  if (verb === 'prop') {
    const anchor = live.anchor || { x: 0, z: 0 };
    const prop = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + (phase.dx || 40), z: anchor.z + (phase.dz || -24) },
      radius: phase.radius || 8,
      mass: phase.mass || 40,
      scanLabel: phase.scanLabel || spec.title,
      storyPropKind: spec.id,
      tetherable: true,
    });
    if (!prop || prop.id == null) {
      d.abort(live, 'prop_failed');
      return false;
    }
    live.ids = live.ids || [];
    live.roles = live.roles || {};
    live.ids.push(prop.id);
    live.roles[prop.id] = phase.role || 'prop';
    if (prop.data) prop.data.masslineTetherable = true;
    return true;
  }
  if (verb === 'grant') {
    if (phase.amount > 0) d.grant(phase.amount, phase.reason || spec.id);
    return true;
  }
  // A toll is a debit, not a payout: the phase asks the sole credits writer to take the
  // amount through the same event route every other system uses (never a direct write).
  // A hull that cannot cover the count does not get the marked lane — the scene aborts
  // with a reason instead of silently clamping the balance at zero.
  if (verb === 'cost') {
    const amount = Math.round(phase.amount || 0);
    if (amount <= 0) return true;
    const credits = state && state.player ? (state.player.credits | 0) : 0;
    if (credits < amount) {
      d.abort(live, 'insufficient_funds');
      return false;
    }
    d.charge(amount, phase.reason || spec.id);
    return true;
  }
  if (verb === 'rep') {
    if (phase.factionId && phase.delta) d.rep(phase.factionId, phase.delta, phase.reason || spec.id);
    return true;
  }
  if (verb === 'resolve') {
    rememberSeen(state, spec.id, phase.outcome);
    d.resolve(live, phase.outcome || 'done', { speak: true });
    return false;
  }
  if (verb === 'abort') {
    d.abort(live, phase.reason || 'aborted');
    return false;
  }
  // An explicit no-op keeps demoted color/branch-speech phase IDs as real phases — never
  // the unknown-verb fallthrough, so the validator can reject an unrecognized verb.
  if (verb === 'noop') return true;
  if (verb === 'charge') {
    const amount = Math.round(phase.amount || 0);
    if (amount <= 0) return true;
    const credits = state && state.player ? (state.player.credits | 0) : 0;
    if (credits < amount) {
      d.abort(live, 'insufficient_funds');
      return false;
    }
    d.charge(amount, phase.reason || spec.id);
    return true;
  }
  return true;
}

function hop(d, live, state, spec, byId) {
  let hops = 0;
  while (hops++ < HOP_CAP) {
    const phase = phaseOf(byId, live.vars.vPhase);
    if (!phase) return d.abort(live, 'bad_phase');
    if (phase.verb === 'await') {
      // A blocking physical phase: the offer's timeout choice or a chosen branch lands
      // here and nothing advances until the ordered steps complete — or the bounded
      // deadline aborts. Choices that arrive mid-await are ignored (the phase is not an
      // offer, so choose() returns).
      live.phase = phase.id;
      live.vars.vAt = d.now();
      live.vars.motion = phase.keepMotion ? live.vars.motion : null;
      enterAwait(d, live, state, phase);
      return;
    }
    if (phase.verb === 'offer' || phase.verb === 'motion') {
      live.phase = phase.id;
      live.vars.vAt = d.now();
      live.vars.motionT0 = d.now();
      live.vars.motionOrigin = live.anchor ? { x: live.anchor.x, z: live.anchor.z } : null;
      live.vars.motion = phase.motion || (phase.verb === 'motion' ? 'hold' : null);
      if (phase.verb === 'offer') {
        const ids = (phase.choiceIds || (spec.choices || []).map((choice) => choice.id))
          .filter((id) => choiceOpen(state, spec, id));
        live.deadlineAt = d.now() + (phase.windowS || 50);
        d.offerChoices(live, ids, spec.timeoutChoice, live.deadlineAt);
      } else {
        live.deadlineAt = d.now() + (phase.seconds || 6);
      }
      return;
    }
    const keep = runVerb(d, live, state, spec, phase);
    if (!keep) return;
    if (!phase.next) return d.abort(live, 'no_next');
    live.vars.vPhase = phase.next;
  }
  return d.abort(live, 'hop_cap');
}

export function compileVignette(spec) {
  if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.phases) || !spec.phases.length) {
    throw new Error('compileVignette: spec needs id and phases');
  }
  const byId = new Map(spec.phases.map((phase) => [phase.id, phase]));
  if (!byId.has(spec.start || spec.phases[0].id)) {
    throw new Error(`compileVignette ${spec.id}: missing start phase`);
  }
  for (const phase of spec.phases) {
    if (phase.motion && !MOTIONS.has(phase.motion)) {
      throw new Error(`compileVignette ${spec.id}: bad motion ${phase.motion}`);
    }
    if (phase.next && !byId.has(phase.next)) {
      throw new Error(`compileVignette ${spec.id}: dangling next ${phase.next}`);
    }
    if (phase.onChoice) {
      for (const dest of Object.values(phase.onChoice)) {
        if (!byId.has(dest)) throw new Error(`compileVignette ${spec.id}: dangling choice ${dest}`);
      }
    }
    // An offer whose timeout choice does not resolve can never leave the phase — the deadline
    // would re-issue it every tick forever, wedging the live slot. Reject at compile time.
    if (phase.verb === 'offer' && !(phase.onChoice && phase.onChoice[spec.timeoutChoice])) {
      throw new Error(`compileVignette ${spec.id}: offer phase ${phase.id} missing timeout choice`);
    }
    if (phase.verb === 'await') {
      const roles = new Set((spec.cast || []).map((member) => member && member.role));
      roles.add('prop');
      if (!Array.isArray(phase.steps) || !phase.steps.length) {
        throw new Error(`compileVignette ${spec.id}: await phase ${phase.id} needs steps`);
      }
      if (!phase.next || !byId.has(phase.next)) {
        throw new Error(`compileVignette ${spec.id}: await phase ${phase.id} has no valid next`);
      }
      if (!Number.isFinite(Number(phase.timeoutS)) || Number(phase.timeoutS) <= 0) {
        throw new Error(`compileVignette ${spec.id}: await phase ${phase.id} needs a positive timeoutS`);
      }
      for (const step of phase.steps) {
        if (!step || !AWAIT_KINDS.has(step.kind)) {
          throw new Error(`compileVignette ${spec.id}: await ${phase.id} unknown step kind ${step && step.kind}`);
        }
        const refs = [step.of, step.at].flat().filter(Boolean);
        for (const role of refs) {
          if (typeof role === 'string' && !roles.has(role)) {
            throw new Error(`compileVignette ${spec.id}: await ${phase.id} references missing role ${role}`);
          }
        }
        for (const [key, val] of Object.entries(step)) {
          if (['kind', 'of', 'at', 'subject'].includes(key)) continue;
          if (typeof val === 'number' && (!Number.isFinite(val) || val <= 0)) {
            throw new Error(`compileVignette ${spec.id}: await ${phase.id} step ${step.kind} non-positive ${key}`);
          }
        }
      }
    }
  }

  return Object.freeze({
    fire(d, live, state) {
      live.vars = live.vars || {};
      live.vars.vPhase = spec.start || spec.phases[0].id;
      live.vars.vAt = d.now();
      hop(d, live, state, spec, byId);
    },
    tick(d, live, state, now) {
      if (!live || live.phase === 'done') return;
      const phase = phaseOf(byId, live.vars && live.vars.vPhase);
      if (!phase) return;
      const motion = (live.vars && live.vars.motion) || phase.motion;
      if (motion) applyMotion(d, live, motion, now);
      if (phase.verb === 'await') {
        stepAwait(d, live, state, spec, phase, byId, now);
        return;
      }
      if (phase.verb === 'offer' && now >= (live.deadlineAt || 0)) {
        this.choose(d, live, state, spec.timeoutChoice);
        return;
      }
      if (phase.verb === 'motion' && now >= (live.deadlineAt || 0)) {
        if (!phase.next) return d.abort(live, 'no_next');
        live.vars.vPhase = phase.next;
        hop(d, live, state, spec, byId);
      }
    },
    choose(d, live, state, choiceId) {
      if (!live || live.phase === 'done') return;
      const phase = phaseOf(byId, live.vars && live.vars.vPhase);
      if (!phase || phase.verb !== 'offer') return;
      const dest = phase.onChoice && phase.onChoice[choiceId];
      if (!dest) return;
      if (!choiceOpen(state, spec, choiceId)) return;
      live.vars.vPhase = dest;
      hop(d, live, state, spec, byId);
    },
  });
}
