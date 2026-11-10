// Counterweight Circuit — authoritative ordered attempt state machine.
//
// Pure logic module: it consumes the observation frame physical.js builds from
// live bodies/attachments/impacts and advances the authored leg order for the
// event definition. It never moves bodies, never reads Three.js/DOM, never
// uses ambient randomness or wall time — state.simTime comes in via the frame.
//
// Phases: staged (course materialized, clock not armed) → running →
// complete | failed | cancelled. A missable leg can retry the attempt back to
// an earlier leg (recovering a missed release or gate is a valid physical
// route); a destroyed or lost load fails for real.

export function createAttemptState(def, opts = {}) {
  return {
    eventId: def.id,
    attemptId: opts.attemptId || 0,
    practice: opts.practice === true,
    phase: 'staged',
    legIndex: 0,
    legStartedAt: null,
    armedAt: null,
    finishedAt: null,
    elapsedS: null,
    reason: null,
    reasonDetail: null,
    // Per-attempt observation memory. Bounded: one entry per authored leg/role.
    mem: {
      sweepRad: {},
      lastBearing: {},
      dwellS: {},
      attachSeen: {},
      legStartedAt: {},
      transitAt: {},
      insideSince: {},
      impacts: 0,
      maxImpactDp: 0,
      conditionAtStart: {},
      conditions: {},
      roleWitness: {},
      swingLine: {},
      arrivalSpeed: null,
      retriesByLeg: {},
    },
    // Live leg status for the read model: 'pending' | 'active' | 'done' | 'missed'
    legStatus: def.legs.map(() => 'pending'),
    result: null,
  };
}

function legActive(state, def) {
  if (state.phase === 'staged' || state.phase === 'running') {
    return def.legs[state.legIndex] || null;
  }
  return null;
}

function markLegs(state) {
  for (let i = 0; i < state.legStatus.length; i++) {
    if (i < state.legIndex) state.legStatus[i] = 'done';
    else if (i === state.legIndex) state.legStatus[i] = 'active';
    else state.legStatus[i] = 'pending';
  }
}

function recordRetry(state, index) {
  const counts = state.mem.retriesByLeg ||= {};
  counts[index] = Math.min(999, Math.max(0, Number(counts[index]) || 0) + 1);
}

function finish(state, phase, obs, reason, detail) {
  state.phase = phase;
  state.finishedAt = obs.simTime;
  state.elapsedS = state.armedAt != null ? Math.max(0, obs.simTime - state.armedAt) : null;
  state.reason = reason || null;
  state.reasonDetail = detail ?? null;
  state.mem.conditions = {};
  for (const [role, body] of Object.entries(obs.bodies || {})) {
    if (Number.isFinite(body?.hull) && Number.isFinite(body?.hullMax) && body.hullMax > 0)
      state.mem.conditions[role] = Math.max(0, Math.min(1, body.hull / body.hullMax));
  }
  if (phase !== 'running') markLegs(state);
}

function roleBody(obs, role) {
  return obs.bodies && obs.bodies[role] ? obs.bodies[role] : null;
}

function lineTo(obs, role) {
  const body = roleBody(obs, role);
  if (!body || body.id == null || !Array.isArray(obs.lines)) return null;
  for (const line of obs.lines) {
    if (line.bId === body.id || line.aId === body.id) return line;
  }
  return null;
}

function bodySpeed(obs, role, zoneVel) {
  const body = roleBody(obs, role);
  if (!body) return Infinity;
  const vx = body.vel.x - (zoneVel ? zoneVel.x : 0);
  const vz = body.vel.z - (zoneVel ? zoneVel.z : 0);
  return Math.hypot(vx, vz);
}

function zoneOf(obs, def, roleKey) {
  const spec = def.bodies.find((b) => b.role === roleKey);
  if (!spec || !spec.zone) return null;
  const body = roleBody(obs, roleKey);
  if (!body) return null;
  const zone = spec.zone;
  const off = zone.offset || { x: 0, z: 0 };
  return { x: body.pos.x + off.x, z: body.pos.z + off.z, radius: zone.radius, vel: body.vel };
}

function insideZone(obs, def, role, zoneRole) {
  const body = roleBody(obs, role);
  const zone = zoneOf(obs, def, zoneRole);
  if (!body || !zone) return false;
  return Math.hypot(body.pos.x - zone.x, body.pos.z - zone.z) <= zone.radius;
}

function bearingDelta(state, role, px, pz) {
  const prev = state.mem.lastBearing[role];
  state.mem.lastBearing[role] = Math.atan2(pz, px);
  if (prev == null) return 0;
  let d = state.mem.lastBearing[role] - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ── leg evaluators ───────────────────────────────────────────────────────────
// Each returns 'pending' | 'done'. 'miss' signals through leg.onMiss handling —
// a windowed leg that expires calls miss() instead.

function witnessBody(state, obs, role) {
  const body = roleBody(obs, role);
  if (!body || body.id == null || !Number.isInteger(body.occupantGeneration)) return false;
  const witness = state.mem.roleWitness[role];
  if (!witness) state.mem.roleWitness[role] = { id: body.id, generation: body.occupantGeneration };
  return !witness || (witness.id === body.id && witness.generation === body.occupantGeneration);
}

function evalAttach(state, def, leg, obs) {
  const line = lineTo(obs, leg.role);
  if (!line || !witnessBody(state, obs, leg.role)) return 'pending';
  state.mem.swingLine[leg.role] = line.id;
  return 'done';
}

function evalSwing(state, def, leg, obs) {
  const body = roleBody(obs, leg.role), anchor = roleBody(obs, leg.around);
  const line = lineTo(obs, leg.role), expected = state.mem.swingLine[leg.role];
  if (!body || !anchor || !witnessBody(state, obs, leg.role)) return 'pending';
  if (!line || line.id !== expected) return 'retry';
  // Slack cannot manufacture a swing. Restart the measurement when tension is
  // lost, so a later taut line cannot credit intervening unobserved motion.
  if (line.taut !== true) {
    delete state.mem.lastBearing[leg.role]; state.mem.sweepRad[leg.role] = 0;
    return 'pending';
  }
  const d = bearingDelta(state, leg.role, body.pos.x-anchor.pos.x, body.pos.z-anchor.pos.z);
  state.mem.sweepRad[leg.role] = (state.mem.sweepRad[leg.role] || 0) + d;
  return Math.abs(state.mem.sweepRad[leg.role]) >= leg.minSweepRad ? 'done' : 'pending';
}

function evalRelease(state, def, leg, obs) {
  if (lineTo(obs, leg.role)) return 'pending';
  const id = state.mem.swingLine[leg.role];
  return Array.isArray(obs.releases) && obs.releases.some(r => r.id === id && r.role === leg.role)
    ? 'done' : 'retry';
}

function evalTransit(state, def, leg, obs) {
  const body = roleBody(obs, leg.role);
  const gate = obs.gates?.[leg.gate] || (leg.gate === 'gate' || !leg.gate ? def.gate : null);
  if (!body || !gate) return 'pending';
  const prev = body.prevPos || body.pos;
  // Plane through gate.pos with axis = allowed crossing direction (its normal is
  // the crossing normal rotated 90° — we store axis as the gate's tangent line,
  // so the plane normal is (-axis.z, axis.x)).
  const nx = -gate.axis.z, nz = gate.axis.x;
  const dPrev = (prev.x - gateAbs(gate).x) * nx + (prev.z - gateAbs(gate).z) * nz;
  const dNow = (body.pos.x - gateAbs(gate).x) * nx + (body.pos.z - gateAbs(gate).z) * nz;
  if (dPrev === 0 || (dPrev < 0) === (dNow < 0)) return 'pending';
  // Crossed the plane this frame — check lateral offset within the gate width.
  const fraction = dPrev / (dPrev - dNow);
  const crossX = prev.x + (body.pos.x - prev.x) * fraction - gateAbs(gate).x;
  const crossZ = prev.z + (body.pos.z - prev.z) * fraction - gateAbs(gate).z;
  const lateral = Math.abs(crossX * gate.axis.x + crossZ * gate.axis.z);
  if (lateral > gate.halfWidth) return 'pending';
  if (leg.attached ? !lineTo(obs, leg.role) : !!lineTo(obs, leg.role)) return 'pending';
  return 'done';
}

function receiverWitness(obs, role, zoneRole) {
  const witness = obs.receivers?.[`${role}:${zoneRole}`];
  const body = roleBody(obs, role), receiver = roleBody(obs, zoneRole);
  if (!witness || !body || !receiver || witness.bodyId !== body.id
    || witness.bodyGeneration !== body.occupantGeneration || witness.receiverId !== receiver.id
    || witness.receiverGeneration !== receiver.occupantGeneration) return null;
  return witness;
}

function evalSeat(state, def, leg, obs) {
  const witness = receiverWitness(obs, leg.role, leg.zone);
  const key = `${leg.role}:${leg.zone}`;
  if (witness?.stable === true && Number.isFinite(witness.relativeSpeed)
    && witness.relativeSpeed <= leg.maxSpeed) {
    state.mem.arrivalSpeed = witness.relativeSpeed;
    state.mem.dwellS[key] = (state.mem.dwellS[key] || 0) + obs.dt;
    return state.mem.dwellS[key] >= leg.dwellS ? 'done' : 'pending';
  }
  state.mem.dwellS[key] = 0;
  return 'pending';
}

function evalContain(state, def, leg, obs) {
  return evalSeat(state, def, leg, obs);
}

function evalParkAll(state, def, leg, obs) {
  let worstSpeed = 0;
  for (const [role, zoneRole] of leg.pairs) {
    const witness = receiverWitness(obs, role, zoneRole);
    if ((leg.requireAttach && !state.mem.attachSeen[role]) || witness?.stable !== true
      || !Number.isFinite(witness.relativeSpeed) || witness.relativeSpeed > leg.maxSpeed) {
      state.mem.dwellS.parkAll = 0; return 'pending';
    }
    worstSpeed = Math.max(worstSpeed, witness.relativeSpeed);
  }
  state.mem.arrivalSpeed = worstSpeed;
  state.mem.dwellS.parkAll = (state.mem.dwellS.parkAll || 0) + obs.dt;
  return state.mem.dwellS.parkAll >= leg.dwellS ? 'done' : 'pending';
}

function evalReacquire(state, def, leg, obs) {
  return lineTo(obs, leg.role) && witnessBody(state, obs, leg.role) ? 'done' : 'pending';
}

const LEG_EVALUATORS = {
  attach: evalAttach,
  swing: evalSwing,
  release: evalRelease,
  transit: evalTransit,
  seat: evalSeat,
  contain: evalContain,
  parkAll: evalParkAll,
  reacquire: evalReacquire,
};

function gateAbs(gate) {
  return gate.absPos || gate.pos;
}

// ── constraints ─────────────────────────────────────────────────────────────
// Continuous checks every tick while running. A violated constraint returns a
// terminal {fail/cancel} outcome or records tracking memory.

function evalConstraints(state, def, obs) {
  for (const c of def.constraints || []) {
    if (c.kind === 'survive') {
      const body = roleBody(obs, c.role);
      if (!body || body.alive === false || !(body.hull > 0)) {
        return { outcome: 'fail', reason: 'destroyed', detail: c.role };
      }
    } else if (c.kind === 'playerOutside') {
      const anchor = roleBody(obs, c.role);
      if (anchor && obs.playerPos) {
        const d = Math.hypot(obs.playerPos.x - anchor.pos.x, obs.playerPos.z - anchor.pos.z);
        if (d < c.radius) return { outcome: 'fail', reason: c.reason || 'entered_zone', detail: c.role };
      }
    } else if (c.kind === 'insideBounds') {
      const body = roleBody(obs, c.role);
      const bounds = def.bounds;
      if (body && bounds) {
        const bp = bounds.absPos || bounds.pos;
        const d = Math.hypot(body.pos.x - bp.x, body.pos.z - bp.z);
        if (d > bounds.radius) {
          const key = `bounds:${c.role}`;
          state.mem.insideSince[key] = (state.mem.insideSince[key] || 0) + obs.dt;
          if (state.mem.insideSince[key] >= (c.graceS || 4)) {
            return { outcome: 'fail', reason: c.reason || 'lost', detail: c.role };
          }
        } else {
          state.mem.insideSince[`bounds:${c.role}`] = 0;
        }
      }
    } else if (c.kind === 'trackAttach') {
      for (const role of c.roles || []) {
        if (lineTo(obs, role) && witnessBody(state, obs, role)) state.mem.attachSeen[role] = true;
      }
    }
  }
  return null;
}

// ── the tick ────────────────────────────────────────────────────────────────
// Advance the attempt one fixed step. Returns an array of attempt events
// (bounded — a handful per transition) the runtime translates into results,
// receipts and recordings.

export function advanceAttempt(state, def, obs) {
  const events = [];
  if (!state || !def) return events;
  if (state.phase !== 'staged' && state.phase !== 'running') return events;

  // Arming: the medal clock starts when the player physically commits —
  // enters the commit ring around the staged course, or touches a line to it.
  if (state.phase === 'staged') {
    const armed = obs.committed === true;
    if (!armed) return events;
    state.phase = 'running';
    state.armedAt = obs.simTime;
    for (const body of def.bodies) {
      const live = roleBody(obs, body.role);
      if (live) state.mem.conditionAtStart[body.role] = live.hull;
    }
    markLegs(state);
    events.push({ type: 'armed', eventId: def.id, at: obs.simTime });
  }

  state.mem.roleWitness ||= {}; state.mem.swingLine ||= {};
  for (const [role, witness] of Object.entries(state.mem.roleWitness)) {
    const body = roleBody(obs, role);
    if (body && body.alive !== false && (body.id !== witness.id || body.occupantGeneration !== witness.generation)) {
      finish(state, 'failed', obs, 'identity_changed', role);
      return [{ type:'finished', outcome:'failed', reason:'identity_changed', detail:role, at:obs.simTime }];
    }
  }
  const violated = evalConstraints(state, def, obs);
  if (violated) {
    finish(state, violated.outcome === 'cancel' ? 'cancelled' : 'failed', obs, violated.reason, violated.detail);
    events.push({ type: 'finished', outcome: state.phase, reason: state.reason, detail: state.reasonDetail, at: obs.simTime });
    return events;
  }

  const leg = legActive(state, def);
  if (!leg) {
    finish(state, 'complete', obs, 'done', null);
    events.push({ type: 'finished', outcome: 'complete', reason: 'done', at: obs.simTime });
    return events;
  }

  if (state.mem.legStartedAt[state.legIndex] == null) state.mem.legStartedAt[state.legIndex] = obs.simTime;

  // Windowed legs expire into their authored miss route.
  if (leg.windowS != null && obs.simTime - state.mem.legStartedAt[state.legIndex] > leg.windowS) {
    const miss = leg.onMiss;
    if (miss && Number.isInteger(miss.retry)) {
      const missedIndex = state.legIndex;
      recordRetry(state, missedIndex);
      state.legIndex = miss.retry;
      resetLegMemory(state, def, miss.retry);
      markLegs(state);
      if (missedIndex !== state.legIndex) state.legStatus[missedIndex] = 'missed';
      events.push({ type: 'retry', leg: leg.kind, eventId: def.id, at: obs.simTime });
      return events;
    }
    finish(state, 'failed', obs, leg.kind === 'transit' ? 'missed_gate' : 'missed', leg.kind);
    events.push({ type: 'finished', outcome: 'failed', reason: state.reason, detail: state.reasonDetail, at: obs.simTime });
    return events;
  }

  const verdict = (LEG_EVALUATORS[leg.kind] || (() => 'pending'))(state, def, leg, obs);
  if (verdict === 'retry') {
    const missedIndex = state.legIndex;
    recordRetry(state, missedIndex);
    state.legIndex = 0; resetLegMemory(state, def, 0); markLegs(state);
    if (missedIndex !== state.legIndex) state.legStatus[missedIndex] = 'missed';
    events.push({ type:'retry', leg:leg.kind, eventId:def.id, at:obs.simTime });
    return events;
  }
  if (verdict === 'done') {
    events.push({ type: 'leg', leg: leg.kind, index: state.legIndex, eventId: def.id, at: obs.simTime });
    state.legIndex += 1;
    markLegs(state);
    if (state.legIndex >= def.legs.length) {
      finish(state, 'complete', obs, 'done', null);
      events.push({ type: 'finished', outcome: 'complete', reason: 'done', at: obs.simTime });
    }
    return events;
  }

  // Recoverable stall: a load that came to rest mid-flight while a release or
  // contain leg is open lets the pilot re-line and try again — a miss resets
  // only the legs after the retry point.
  if ((leg.kind === 'transit' || leg.kind === 'contain' || leg.kind === 'release') && leg.onMiss && Number.isInteger(leg.onMiss.retry)) {
    const body = roleBody(obs, leg.role);
    if (body && Math.hypot(body.vel.x, body.vel.z) < 1.5 && !lineTo(obs, leg.role)) {
      const key = `stall:${state.legIndex}`;
      state.mem.insideSince[key] = (state.mem.insideSince[key] || 0) + obs.dt;
      if (state.mem.insideSince[key] >= 3) {
        const missedIndex = state.legIndex;
        recordRetry(state, missedIndex);
        state.legIndex = leg.onMiss.retry;
        resetLegMemory(state, def, leg.onMiss.retry);
        markLegs(state);
        if (missedIndex !== state.legIndex) state.legStatus[missedIndex] = 'missed';
        events.push({ type: 'retry', leg: leg.kind, eventId: def.id, at: obs.simTime });
      }
    } else {
      state.mem.insideSince[`stall:${state.legIndex}`] = 0;
    }
  }

  return events;
}

// A retry clears only the legs being replayed: sweep accumulators, dwell and
// stall timers at indices ≥ retry are rebuilt; attachSeen survives (it is a
// fact about what already happened).
function resetLegMemory(state, def, fromLeg) {
  for (let i = fromLeg; i < def.legs.length; i++) {
    delete state.mem.legStartedAt[i];
  }
  state.mem.sweepRad = {};
  state.mem.lastBearing = {};
  state.mem.swingLine = {};
  state.mem.dwellS = {};
  state.mem.insideSince = {};
}

export function cancelAttempt(state, obs, reason, detail) {
  if (!state || (state.phase !== 'staged' && state.phase !== 'running')) return;
  finish(state, 'cancelled', obs, reason || 'cancelled', detail || null);
}
