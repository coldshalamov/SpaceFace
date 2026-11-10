import { SITE, getScenario, sitePoint } from './scenarios.js';

// Feature-owned state only. All motion and hull changes are intents for the existing physics /
// combat owners. In particular, a route becoming clear is never a receipt that a pod arrived.
export const CRISIS_SCHEMA_VERSION = 1;
const PHASES = new Set(['preview', 'active', 'recovery', 'settled']);
const STATUSES = new Set(['at-risk', 'safe', 'stranded', 'lost', 'recovered']);
const MAX_HISTORY = 40;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const point = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const speed = (b) => Math.hypot(b?.vel?.x || 0, b?.vel?.z || 0);
const readBody = (bodies, role) => bodies instanceof Map ? bodies.get(role) : bodies?.[role];

export function createCrisisRecord(scenarioId, cycle = 0) {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new TypeError(`Unknown industrial crisis: ${scenarioId}`);
  return {
    schemaVersion: CRISIS_SCHEMA_VERSION, scenarioId, cycle: clamp(Math.trunc(cycle), 0, 1000000),
    phase: 'active', elapsed: 0, revision: 0, stableS: 0,
    flags: {}, heat: {}, exposure: {}, losses: {}, lastMotion: {}, history: [],
    outcome: null, status: Object.fromEntries(scenario.bodies.map((b) => [b.role, 'at-risk'])),
  };
}

/** Bounded, JSON-only restoration; unknown scenarios cannot materialize an accidental new site. */
export function normalizeCrisisRecord(value) {
  const scenario = getScenario(value?.scenarioId);
  if (!scenario || !value || typeof value !== 'object') return null;
  const result = createCrisisRecord(scenario.id, value.cycle);
  result.phase = PHASES.has(value.phase) ? value.phase : 'preview';
  result.elapsed = clamp(value.elapsed, 0, 604800);
  result.revision = clamp(Math.trunc(value.revision), 0, Number.MAX_SAFE_INTEGER);
  result.stableS = clamp(value.stableS, 0, 30);
  for (const def of scenario.bodies) {
    const role = def.role;
    result.status[role] = STATUSES.has(value.status?.[role]) ? value.status[role] : 'at-risk';
    result.heat[role] = clamp(value.heat?.[role], 0, 4);
    result.exposure[role] = clamp(value.exposure?.[role], 0, 120);
    if (value.losses?.[role] === true) result.losses[role] = true;
    const motion = value.lastMotion?.[role];
    if (point(motion?.pos) && point(motion?.vel)) result.lastMotion[role] = {
      pos: { x: motion.pos.x, z: motion.pos.z }, vel: { x: motion.vel.x, z: motion.vel.z },
    };
  }
  for (const [key, item] of Object.entries(value.flags || {}).slice(0, 96)) {
    if (!/^[a-zA-Z][a-zA-Z0-9:_-]{0,90}$/.test(key)) continue;
    if (typeof item === 'boolean') result.flags[key] = item;
    else if (Number.isFinite(item)) result.flags[key] = clamp(item, 0, 604800);
  }
  result.history = (Array.isArray(value.history) ? value.history : []).slice(-MAX_HISTORY)
    .filter((e) => typeof e?.id === 'string' && typeof e.text === 'string')
    .map((e) => ({ id: e.id.slice(0, 100), text: e.text.slice(0, 240),
      kind: ['warn', 'success', 'info', 'loss'].includes(e.kind) ? e.kind : 'info',
      role: scenario.bodies.some((b) => b.role === e.role) ? e.role : null,
      at: clamp(e.at, 0, result.elapsed) }));
  if (result.phase === 'settled') result.outcome = summarizeIndustrialCrisis(result);
  return result;
}

function emit(record, out, id, text, kind = 'info', role = null) {
  const key = `said:${id}`;
  if (record.flags[key]) return;
  record.flags[key] = true;
  const event = { id, text, kind, role, at: record.elapsed };
  record.history.push(event);
  if (record.history.length > MAX_HISTORY) record.history.shift();
  out.events.push(event);
  record.revision += 1;
}

function markLoss(record, out, role, text, cause, sourceRole = null) {
  if (record.losses[role]) return;
  record.losses[role] = true;
  record.status[role] = 'lost';
  out.intents.push({ type: 'damage', role, amount: 55, cause, sourceRole });
  emit(record, out, `lost:${role}`, text, 'loss', role);
}

function damageCrew(record, out, def, sourceRole) {
  if (record.status[def.role] === 'safe' || record.status[def.role] === 'lost') return;
  const exposure = record.exposure[def.role] || 0;
  if (exposure >= 3 && record.status[def.role] !== 'stranded') {
    record.status[def.role] = 'stranded';
    out.intents.push({ type: 'damage', role: def.role, amount: 35, cause: 'industrial-thermal', sourceRole });
    emit(record, out, `stranded:${def.role}`, `${def.label}: thrusters gone. The pod is intact; tow it to the refuge.`, 'warn', def.role);
  }
  if (exposure >= 11) markLoss(record, out, def.role, `${def.label}: the survival compartment was breached.`, 'industrial-thermal', sourceRole);
}

function inSite(body, anchor) { return point(body?.pos) && distance(body.pos, anchor) <= SITE.radius; }
function alive(body) { return !!body && body.alive !== false && point(body.pos); }
function bodyDef(scenario, role) { return scenario.bodies.find((b) => b.role === role); }

function closestApproach(moving, fixed) {
  if (!alive(moving) || !alive(fixed)) return { threatens: false, seconds: Infinity, miss: Infinity };
  const px = moving.pos.x - fixed.pos.x, pz = moving.pos.z - fixed.pos.z;
  const vx = (moving.vel?.x || 0) - (fixed.vel?.x || 0);
  const vz = (moving.vel?.z || 0) - (fixed.vel?.z || 0);
  const v2 = vx * vx + vz * vz;
  if (v2 < 0.04) return { threatens: false, seconds: Infinity, miss: Math.hypot(px, pz) };
  const t = -(px * vx + pz * vz) / v2;
  const miss = Math.hypot(px + vx * Math.max(0, t), pz + vz * Math.max(0, t));
  return { threatens: t >= 0 && t < 90 && miss < (moving.radius || 8) + (fixed.radius || 8) + 3,
    seconds: t, miss };
}

function contactSpeed(record, a, b, aRole, bRole, contacts) {
  if (!alive(a) || !alive(b)) return 0;
  for (const contact of contacts || []) {
    if ((contact.aRole === aRole && contact.bRole === bRole)
      || (contact.aRole === bRole && contact.bRole === aRole)) {
      return Math.max(0, Number(contact.speed) || 0, Number(contact.impulse) / Math.max(1, a.mass || 1) || 0);
    }
  }
  const maxDistance = (a.radius || 8) + (b.radius || 8) + 0.6;
  if (distance(a.pos, b.pos) > maxDistance) return 0;
  // Native collision resolution may already have stopped the pair. Previous admitted-body
  // velocity is retained across save, so the physical impact still has its pre-contact energy.
  const av = record.lastMotion[aRole]?.vel || a.vel || { x: 0, z: 0 };
  const bv = record.lastMotion[bRole]?.vel || b.vel || { x: 0, z: 0 };
  return Math.hypot(av.x - bv.x, av.z - bv.z);
}

function thermalExposure(record, scenario, bodies, anchor, sources, dt, out) {
  for (const def of scenario.bodies) {
    if (!['crew', 'cargo'].includes(def.kind)) continue;
    const target = readBody(bodies, def.role);
    if (!alive(target) || !inSite(target, anchor) || record.status[def.role] === 'safe'
      || record.status[def.role] === 'recovered') continue;
    let source = null;
    for (const candidate of sources) {
      if (candidate.role === def.role) continue;
      const body = readBody(bodies, candidate.role);
      if (alive(body) && inSite(body, anchor) && distance(target.pos, body.pos) < candidate.radius + def.radius) {
        source = candidate; break;
      }
    }
    record.exposure[def.role] = Math.max(0, (record.exposure[def.role] || 0) + (source ? dt : -dt * 0.35));
    if (def.kind === 'crew') damageCrew(record, out, def, source?.role || null);
    else if (record.exposure[def.role] >= 7) markLoss(record, out, def.role,
      `${def.label}: contents damaged. The container can still be recovered as salvage.`, 'industrial-thermal', source?.role || null);
  }
}

function stepDrift(record, scenario, context, out) {
  const { bodies, anchor, dt, links } = context;
  const transport = readBody(bodies, 'transport');
  const storageRoles = ['storageA', 'storageB'];
  let threatened = false;
  let nearestS = Infinity;
  for (const role of storageRoles) {
    const storage = readBody(bodies, role);
    if (!alive(storage)) continue;
    const trajectory = closestApproach(transport, storage);
    if (!record.losses[role] && trajectory.threatens && inSite(transport, anchor)) {
      threatened = true; nearestS = Math.min(nearestS, trajectory.seconds);
    }
    const hit = contactSpeed(record, transport, storage, 'transport', role, links?.contacts);
    if (hit >= 1.2 && inSite(storage, anchor)) {
      markLoss(record, out, role, `${bodyDef(scenario, role).label} ruptured on impact. Move the leaking tank away from the other one.`, 'industrial-impact', 'transport');
      if (!record.flags[`leak:${role}`]) record.flags[`leak:${role}`] = record.elapsed || 0.000001;
      if (!record.losses.transport) markLoss(record, out, 'transport', 'Morrow: its loading frame buckled. The hull remains recoverable.', 'industrial-impact', role);
    }
  }
  if (nearestS < 10) emit(record, out, 'drift-close', 'Morrow is on the tanks’ line. A sideways shove now changes the impact point.', 'warn', 'transport');
  const sources = [];
  for (const role of storageRoles) {
    const began = record.flags[`leak:${role}`];
    const source = readBody(bodies, role);
    if (began && record.elapsed - began < 22 && alive(source) && inSite(source, anchor)
      && distance(source.pos, sitePoint(SITE.safeBerth, anchor)) > SITE.safeRadius) {
      sources.push({ role, radius: 30 });
      for (const otherRole of storageRoles) {
        if (otherRole === role || record.losses[otherRole]) continue;
        const other = readBody(bodies, otherRole);
        if (alive(other) && distance(source.pos, other.pos) < 38) {
          record.heat[otherRole] = Math.min(2, (record.heat[otherRole] || 0) + dt / 6);
          if (record.heat[otherRole] >= 1) {
            markLoss(record, out, otherRole, `${bodyDef(scenario, otherRole).label} ruptured in the first tank’s hot spill.`, 'industrial-spill', role);
            record.flags[`leak:${otherRole}`] = record.elapsed || 0.000001;
          }
        }
      }
    }
  }
  thermalExposure(record, scenario, bodies, anchor, sources, dt, out);
  const inert = !threatened && sources.length === 0
    && ((!alive(transport) && record.flags['missing:transport'])
      || (alive(transport) && (!inSite(transport, anchor) || speed(transport) < 0.6 || nearestS === Infinity)));
  record.stableS = inert ? record.stableS + dt : 0;
  if (record.stableS >= 2) enterRecovery(record, scenario, out,
    record.losses.storageA || record.losses.storageB ? 'The spill has stopped spreading. The surviving crews and machinery are still yours to recover.'
      : 'Morrow’s path is clear of both tanks. The loading crews are moving to the refuge.');
  return sources;
}

export function corridorBlockers(scenario, bodies, anchor = SITE.anchor) {
  if (!scenario?.corridor) return [];
  const lane = scenario.corridor;
  return lane.blockers.map((role) => ({ role, body: readBody(bodies, role) }))
    .filter(({ body }) => alive(body) && body.pos.x > anchor.x + lane.start.x - 8
      && body.pos.x < anchor.x + lane.end.x + 8
      && Math.abs(body.pos.z - anchor.z) < lane.halfWidth + (body.radius || 8))
    .sort((a, b) => a.body.pos.x - b.body.pos.x);
}

function stepCorridor(record, scenario, context, out) {
  const { bodies, anchor, dt } = context;
  const wreck = readBody(bodies, 'hotWreck');
  const blockers = corridorBlockers(scenario, bodies, anchor);
  for (const role of scenario.corridor.blockers) if (!blockers.some((b) => b.role === role)) {
    emit(record, out, `cleared:${role}`, `${bodyDef(scenario, role).label} is clear. The pods have more lane.`, 'success', role);
  }
  if (blockers.length === 0) emit(record, out, 'corridor-clear', 'The lane is open. Watch the pods cross; the hot wreck can still catch them.', 'success');
  const nearLane = alive(wreck) && inSite(wreck, anchor)
    && Math.abs(wreck.pos.z - anchor.z) < 62 && wreck.pos.x < anchor.x + 105;
  const sources = nearLane ? [{ role: 'hotWreck', radius: 28 }] : [];
  thermalExposure(record, scenario, bodies, anchor, sources, dt, out);
  // The source is finite hot slag: a diverted carrier cools out of the work envelope. Merely
  // opening the lane never cools it, and holding it still near a pod remains hazardous.
  if ((alive(wreck) && !nearLane) || record.flags['missing:hotWreck']) record.stableS += dt;
  else record.stableS = 0;
  const peopleSafe = scenario.crewRoles.every((role) => ['safe', 'lost'].includes(record.status[role]));
  if (peopleSafe) emit(record, out, 'crews-clear', 'The shelter crews are accounted for. The hot carrier and medical cargo still need a clear berth.', 'info');
  if (record.stableS >= 2) enterRecovery(record, scenario, out,
    'The hot carrier is outside the shelter lane. Bring any dark pods and the medical pallet to the refuge.');
  return sources;
}

function stepCascade(record, scenario, context, out) {
  const { bodies, anchor, dt, links } = context;
  const reactor = readBody(bodies, 'reactor');
  const coupler = readBody(bodies, 'coupler');
  const machineA = readBody(bodies, 'machineA');
  const initialCoupler = sitePoint(bodyDef(scenario, 'coupler').offset, anchor);
  const separated = alive(coupler) && distance(coupler.pos, initialCoupler) > scenario.connection.detachDistance;
  const isolated = alive(reactor) && alive(machineA)
    && distance(reactor.pos, machineA.pos) > scenario.connection.isolationDistance;
  // false is meaningful; absent owner data is not proof of a severed cable.
  if (!record.flags.disconnected && (links?.powerConnected === false || separated || isolated)) {
    record.flags.disconnected = true;
    out.intents.push({ type: 'sever', linkId: 'power' });
    emit(record, out, 'power-isolated', 'Feed disconnected. The machines are no longer drawing the fault.', 'success', 'coupler');
  }
  const sources = [];
  const connected = !record.flags.disconnected;
  for (const role of ['machineA', 'machineB']) {
    const machine = readBody(bodies, role);
    const feedReaches = connected && alive(coupler) && alive(machine) && distance(machine.pos, coupler.pos) < 70;
    const rate = role === 'machineA' ? 1 / 22 : 1 / 38;
    record.heat[role] = clamp((record.heat[role] || 0) + (feedReaches ? dt * rate : -dt * 0.12), 0, 2);
    if (record.heat[role] >= 0.45) emit(record, out, `heat:${role}`,
      `${bodyDef(scenario, role).label} is heating through its feed. The bright coupling is the connection.`, 'warn', role);
    if (record.heat[role] >= 1) markLoss(record, out, role,
      `${bodyDef(scenario, role).label} seized. Isolate the feed to save the other machine.`, 'industrial-power', 'reactor');
    if (record.losses[role] && record.heat[role] > 0.2) sources.push({ role, radius: 34 });
  }
  thermalExposure(record, scenario, bodies, anchor, connected ? sources : [], dt, out);
  if (!connected) {
    // An isolated component no longer supplies electrical or thermal damage to other bodies.
    // Residual heat remains visible while cooling, but is not an invisible continuing feed.
    record.stableS += dt;
    if (record.stableS >= 0.5) enterRecovery(record, scenario, out,
      'The circuit is dead. Intact machines are preserved; the damaged units remain useful salvage.');
  } else record.stableS = 0;
  return connected ? sources : [];
}

function enterRecovery(record, scenario, out, text) {
  if (record.phase !== 'active') return;
  record.phase = 'recovery';
  record.flags.threatEnded = true;
  for (const role of scenario.equipmentRoles) if (!record.losses[role]) record.status[role] = 'safe';
  emit(record, out, 'recovery', text, 'info');
}

function drive(role, goal, speedLimit = 8) {
  return { type: 'drive', role, goal, speed: speedLimit, maxForce: 100 };
}

function stepRescue(record, scenario, { bodies, anchor }, out) {
  const refuge = sitePoint(SITE.safeBerth, anchor);
  const blockers = corridorBlockers(scenario, bodies, anchor);
  for (const def of scenario.bodies) {
    const b = readBody(bodies, def.role);
    if (!alive(b)) continue;
    const atRefuge = distance(b.pos, refuge) <= SITE.safeRadius + def.radius && speed(b) <= 12;
    if (atRefuge && record.status[def.role] !== 'safe' && record.status[def.role] !== 'recovered') {
      if (def.kind === 'crew' && record.losses[def.role]) continue;
      record.status[def.role] = record.losses[def.role] ? 'recovered' : 'safe';
      emit(record, out, `recovered:${def.role}`, `${def.label}: ${record.losses[def.role] ? 'damaged unit recovered as salvage' : 'safe at the refuge'}.`, 'success', def.role);
    }
    if (def.kind !== 'crew') continue;
    if (record.status[def.role] === 'safe') {
      out.intents.push(drive(def.role, refuge, 0));
      continue;
    }
    if (record.status[def.role] === 'stranded' || record.status[def.role] === 'lost') continue;
    if (record.scenarioId === 'corridor') {
      const laneEndX = anchor.x + scenario.corridor.end.x;
      const obstruction = blockers.find(({ body }) => body.pos.x + (body.radius || 8) >= b.pos.x);
      if (obstruction && b.pos.x < laneEndX) {
        const stoppingX = obstruction.body.pos.x - (obstruction.body.radius || 8) - def.radius - 3;
        out.intents.push(drive(def.role, { x: Math.max(b.pos.x, stoppingX), z: anchor.z },
          stoppingX <= b.pos.x + 2 ? 0 : 8));
      } else if (b.pos.x < laneEndX - 3) out.intents.push(drive(def.role, { x: laneEndX, z: anchor.z }, 8));
      else out.intents.push(drive(def.role, refuge, 8));
    } else if (record.phase !== 'active' || record.flags.disconnected) {
      out.intents.push(drive(def.role, refuge, 8));
    }
  }
}

/** Call only from the fixed simulation owner after native admission; no wall-clock catchup. */
export function stepIndustrialCrisis(record, input = {}) {
  const out = { events: [], intents: [], settled: record?.phase === 'settled' };
  const scenario = getScenario(record?.scenarioId);
  if (!scenario || !PHASES.has(record.phase) || record.phase === 'preview') return out;
  const dt = clamp(input.dt, 0, 0.25);
  if (dt <= 0) return out;
  const context = { bodies: input.bodies || {}, anchor: point(input.anchor) ? input.anchor : SITE.anchor,
    dt, links: input.links || {} };
  const missing = new Set(Array.isArray(context.links.missingRoles) ? context.links.missingRoles : []);
  for (const def of scenario.bodies) {
    if (record.physical?.rows?.[def.role]?.tombstone === true) missing.add(def.role);
    if (!missing.has(def.role)) continue;
    record.flags[`missing:${def.role}`] = true;
    if (!record.losses[def.role] || record.status[def.role] !== 'lost') {
      record.losses[def.role] = true;
      record.status[def.role] = 'lost';
      emit(record, out, `destroyed:${def.role}`, `${def.label}: destroyed. The record will not replace it.`, 'loss', def.role);
    }
  }
  if (!scenario.bodies.some((def) => alive(readBody(context.bodies, def.role))) && missing.size === 0) return out;
  if (record.phase !== 'settled') record.elapsed += dt;
  let hazards = [];
  if (record.phase === 'active') {
    if (scenario.id === 'drift') hazards = stepDrift(record, scenario, context, out);
    if (scenario.id === 'corridor') hazards = stepCorridor(record, scenario, context, out);
    if (scenario.id === 'cascade') hazards = stepCascade(record, scenario, context, out);
  } else {
    for (const role of Object.keys(record.heat)) record.heat[role] = Math.max(0, record.heat[role] - dt * 0.12);
  }
  stepRescue(record, scenario, context, out);
  // Recovering the last person is arrival at a real berth. Cargo may remain an optional physical
  // recovery after settlement, and a disabled pod never receives automatic rescue credit.
  const peopleResolved = scenario.crewRoles.every((r) => ['safe', 'lost'].includes(record.status[r]));
  const cargoResolved = scenario.cargoRoles.every((r) => ['safe', 'lost', 'recovered'].includes(record.status[r]));
  if (record.phase === 'recovery' && peopleResolved && cargoResolved) {
    record.phase = 'settled';
    emit(record, out, 'settled', 'Hinge Works has recorded the people and equipment that made it. Loose salvage remains where you left it.', 'info');
  }
  for (const def of scenario.bodies) {
    const b = readBody(context.bodies, def.role);
    if (alive(b)) record.lastMotion[def.role] = {
      pos: { x: b.pos.x, z: b.pos.z }, vel: { x: b.vel?.x || 0, z: b.vel?.z || 0 },
    };
  }
  if (record.phase === 'settled') record.outcome = summarizeIndustrialCrisis(record);
  out.hazards = hazards;
  out.settled = record.phase === 'settled';
  return out;
}

/** Voluntary closure records unresolved people honestly; it never turns a refusal into a rescue. */
export function finalizeIndustrialCrisis(record) {
  if (!getScenario(record?.scenarioId) || record.phase === 'preview') return null;
  record.phase = 'settled';
  record.flags.voluntaryClosure = true;
  record.revision += 1;
  record.outcome = summarizeIndustrialCrisis(record);
  return record.outcome;
}

export function summarizeIndustrialCrisis(record) {
  const scenario = getScenario(record?.scenarioId);
  if (!scenario) return null;
  const group = (roles) => {
    const named = { saved: [], lost: [], stranded: [], recovered: [], unresolved: [] };
    for (const role of roles) {
      const label = bodyDef(scenario, role).label;
      const status = record.status[role];
      if (record.losses[role]) named.lost.push(label);
      if (status === 'safe' && !record.losses[role]) named.saved.push(label);
      else if (status === 'recovered') named.recovered.push(label);
      else if (status === 'stranded') named.stranded.push(label);
      else if (!record.losses[role] && status !== 'safe') named.unresolved.push(label);
    }
    return { saved: named.saved.length, lost: named.lost.length, stranded: named.stranded.length,
      recovered: named.recovered.length, unresolved: named.unresolved.length, total: roles.length, named };
  };
  const people = group(scenario.crewRoles), equipment = group(scenario.equipmentRoles), cargo = group(scenario.cargoRoles);
  return {
    scenarioId: scenario.id, cycle: record.cycle, people, equipment, cargo,
    peopleSaved: people.saved, peopleLost: people.lost, peopleStranded: people.stranded,
    equipmentSaved: equipment.saved, equipmentLost: equipment.lost, cargoSaved: cargo.saved,
    cargoLost: cargo.lost, salvageRecovered: equipment.recovered + cargo.recovered,
    saved: [...people.named.saved, ...equipment.named.saved, ...cargo.named.saved],
    lost: [...people.named.lost, ...equipment.named.lost, ...cargo.named.lost],
    stranded: people.named.stranded, unresolved: [...people.named.unresolved, ...equipment.named.unresolved, ...cargo.named.unresolved],
    text: `${people.saved}/${people.total} crews safe; ${people.lost} lost${people.stranded ? `; ${people.stranded} stranded` : ''}. ${equipment.saved}/${equipment.total} machines preserved${equipment.lost ? `; ${equipment.lost} damaged beyond service` : ''}${cargo.total ? `. ${cargo.saved}/${cargo.total} cargo recovered` : ''}.`,
  };
}

export function projectIndustrialCrisis(record, input = {}) {
  const scenario = getScenario(record?.scenarioId);
  if (!scenario) return null;
  const bodies = input.bodies || {}, anchor = point(input.anchor) ? input.anchor : SITE.anchor;
  const summary = summarizeIndustrialCrisis(record);
  const motion = (role) => readBody(bodies, role) || record.lastMotion[role]
    || { pos: sitePoint(bodyDef(scenario, role).offset, anchor), vel: bodyDef(scenario, role).velocity };
  const hazard = motion(scenario.threatRole);
  let severity = record.phase === 'active' ? 0.35 : 0;
  const paths = [], connections = [], hazards = [];
  if (scenario.id === 'drift') {
    const course = ['storageA', 'storageB'].map((role) => ({ role, ...closestApproach(hazard, motion(role)) }));
    const nearest = course.filter((r) => r.threatens).sort((a, b) => a.seconds - b.seconds)[0];
    if (nearest) severity = clamp(1 - nearest.seconds / 30, 0.25, 1);
    paths.push({ from: { ...hazard.pos }, to: { x: hazard.pos.x + (hazard.vel?.x || 0) * 20,
      z: hazard.pos.z + (hazard.vel?.z || 0) * 20 }, blocked: !!nearest, kind: 'trajectory' });
    for (const role of ['storageA', 'storageB']) if (record.flags[`leak:${role}`]
      && record.elapsed - record.flags[`leak:${role}`] < 22 && record.phase === 'active') {
      hazards.push({ role, pos: { ...motion(role).pos }, radius: 30, intensity: 0.7 });
    }
  }
  if (scenario.id === 'corridor') {
    paths.push({ from: sitePoint(scenario.corridor.start, anchor), to: sitePoint(scenario.corridor.end, anchor),
      blocked: corridorBlockers(scenario, bodies, anchor).length > 0, kind: 'evacuation' });
    paths.push({ from: sitePoint(scenario.corridor.end, anchor), to: sitePoint(SITE.safeBerth, anchor), blocked: false, kind: 'evacuation' });
    if (record.phase === 'active') hazards.push({ role: 'hotWreck', pos: { ...hazard.pos }, radius: 28, intensity: 0.8 });
  }
  if (scenario.id === 'cascade') {
    severity = Math.max(record.heat.machineA || 0, record.heat.machineB || 0);
    const connected = !record.flags.disconnected;
    connections.push({ fromRole: 'reactor', toRole: 'coupler', from: { ...motion('reactor').pos }, to: { ...motion('coupler').pos }, connected });
    for (const role of ['machineA', 'machineB']) {
      connections.push({ fromRole: 'coupler', toRole: role, from: { ...motion('coupler').pos }, to: { ...motion(role).pos },
        connected: connected && distance(motion(role).pos, motion('coupler').pos) < 70 });
      if ((record.heat[role] || 0) > 0.4) hazards.push({ role, pos: { ...motion(role).pos }, radius: 14,
        intensity: clamp(record.heat[role], 0, 1) });
    }
  }
  return {
    scenarioId: scenario.id, label: scenario.label, phase: record.phase,
    hint: record.phase === 'active' || record.phase === 'preview' ? scenario.firstHint : scenario.recoveryHint,
    severity: record.phase === 'active' ? clamp(severity, 0, 1) : 0,
    statusLine: record.phase === 'preview' ? 'Traffic is holding. Inspect the site, then choose whether to assist.' : summary.text,
    ...summary, hazards, paths, connections,
    safeBerth: sitePoint(SITE.safeBerth, anchor), safeRadius: SITE.safeRadius,
    bodies: scenario.bodies.map((def) => ({ role: def.role, label: def.label, kind: def.kind,
      status: record.status[def.role], heat: record.heat[def.role] || 0,
      pos: { ...motion(def.role).pos }, vel: { ...motion(def.role).vel }, radius: def.radius })),
    events: record.history.slice(-5),
  };
}
