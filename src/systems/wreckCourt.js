// Wreck Court session. Player verbs operate on a materialized incident.
// Money, heat, and world facts are intents on the ruling. This module does not
// write credits, law, reputation, or the save envelope.
//
// Not registered. The unapplied adapter in src/data/wreckCourt/ADAPTER.md is the
// seam into salvage scan and the single writers.

import { DT, ageFromTemperature, bodyVisible } from '../data/wreckCourt/physics.js';
import {
  ballisticFit,
  closestApproach,
  deflagrationFit,
  ejectionFit,
  headingRateFit,
  mirrorFit,
  pointMassFit,
  tangentScore,
} from '../data/wreckCourt/reconstruct.js';
import { evaluateHypothesis, publicHypothesis } from '../data/wreckCourt/support.js';
import {
  WRECK_COURT_ENTRY_CASE,
  WRECK_COURT_FIELD_MANUAL,
  WRECK_COURT_SCHEMA_VERSION,
  materializeCase,
  caseDef,
  WRECK_COURT_CASE_IDS,
} from '../data/wreckCourt/index.js';

const GRAPPLE_RANGE = 280;
const TOW_FORCE = 16000;
const ASSAY_RANGE = 18;

function cloneBody(body) {
  return {
    ...body,
    scar: body.scar ? { ...body.scar, faces: (body.scar.faces || []).map((f) => ({ ...f })) } : null,
    cargo: body.cargo ? { ...body.cargo } : null,
    magazine: body.magazine ? { ...body.magazine } : null,
  };
}

function findBody(session, id) {
  return session.bodies.find((b) => b.id === id) || null;
}

function revealed(session, body) {
  return !!(body && (session.revealed[body.id] || bodyVisible(body, session.player, session.bodies)));
}

function refreshRevealed(session) {
  for (const body of session.bodies) {
    if (body.departed) continue;
    if (bodyVisible(body, session.player, session.bodies)) session.revealed[body.id] = true;
  }
}

function measurement(session, id, record) {
  session.notebook.measurements[id] = record;
  return record;
}

function publicBody(session, body) {
  const known = !!session.revealed[body.id];
  if (!known || body.departed) return null;
  return {
    id: body.id,
    variant: body.variant,
    x: body.x,
    z: body.z,
    heading: body.heading,
    radius: body.radius,
    destroyed: !!body.destroyed,
    historySpoiled: !!body.historySpoiled,
    role: body.role,
  };
}

function evidenceScene(session) {
  return {
    bodies: session.bodies.map((b) => publicBody(session, b)).filter(Boolean),
  };
}

function strippedHypothesis(h) {
  return { id: h.id, statement: h.statement, requires: h.requires, falsifiedBy: h.falsifiedBy };
}

export function listCourtCases() {
  return WRECK_COURT_CASE_IDS.slice();
}

export function openCourt({ caseId, seed }) {
  const scene = materializeCase(caseId, seed);
  const session = {
    schema: WRECK_COURT_SCHEMA_VERSION,
    caseId: scene.caseId,
    seed: scene.seed,
    title: scene.title,
    access: scene.access,
    briefing: scene.briefing,
    uncertainty: scene.uncertainty,
    presentTime: scene.presentTime,
    assayPoints: scene.assayPoints.map((p) => ({ ...p })),
    player: { ...scene.playerStart },
    bodies: scene.bodies.map(cloneBody),
    hypotheses: scene.hypotheses,
    revealed: Object.create(null),
    grappled: null,
    simTime: 0,
    notebook: { measurements: Object.create(null) },
    actionLog: [],
    ruling: null,
    _truth: scene.truth,
  };
  refreshRevealed(session);
  return session;
}

export function proofTruth(session) {
  return {
    caseId: session.caseId,
    seed: session.seed,
    cause: session._truth.cause,
    plausibleWrong: session._truth.plausibleWrong,
    uncertainty: session._truth.uncertainty,
    events: session._truth.events.map((e) => ({ ...e })),
    presentTime: session._truth.presentTime,
  };
}

export function publicView(session) {
  refreshRevealed(session);
  const bodies = [];
  const rumors = [];
  for (const body of session.bodies) {
    const row = publicBody(session, body);
    if (!row) continue;
    bodies.push(row);
    if (body.flavor) rumors.push({ bodyId: body.id, text: body.flavor });
  }
  return {
    caseId: session.caseId,
    seed: session.seed,
    title: session.title,
    access: session.access,
    briefing: session.briefing,
    uncertainty: session.uncertainty,
    fieldManual: WRECK_COURT_FIELD_MANUAL,
    verbs: ['scan', 'position', 'grapple', 'release', 'tow', 'compare', 'moveObstruction', 'bringPod', 'reconstruct', 'file'],
    player: { x: session.player.x, z: session.player.z },
    bodies,
    assayPoints: session.assayPoints.map((p) => ({ ...p })),
    hypotheses: session.hypotheses.map(publicHypothesis),
    grappled: session.grappled,
    simTime: session.simTime,
    ruling: session.ruling ? { ...session.ruling, intents: session.ruling.intents } : null,
    rumors,
  };
}

export function notebook(session) {
  return JSON.parse(JSON.stringify(session.notebook));
}

export function supportReport(session, hypothesisId) {
  const hypothesis = session.hypotheses.find((h) => h.id === hypothesisId);
  if (!hypothesis) return { id: hypothesisId, supported: false, contradicted: false, missing: ['unknown claim'] };
  return evaluateHypothesis(strippedHypothesis(hypothesis), session.notebook, evidenceScene(session));
}

export function supportedClaims(session) {
  return session.hypotheses
    .map((h) => evaluateHypothesis(strippedHypothesis(h), session.notebook, evidenceScene(session)))
    .filter((row) => row.supported)
    .map((row) => row.id);
}

function fail(error) {
  return { ok: false, error };
}

function scanVisual(body) {
  return {
    variant: body.variant,
    damaged: body.integrity < 0.9 || !!(body.scar),
    dead: body.integrity <= 0 || !!body.destroyed,
    heading: body.heading,
    group: body.transponderGroup,
    turrets: !!body.turrets,
    transponderHostile: !!body.transponderHostile,
    volatile: !!body.volatile,
    sealedCargo: !!(body.cargo && body.cargo.sealed),
    scar: body.scar ? { nx: body.scar.nx, nz: body.scar.nz } : null,
  };
}

function scanStructure(session, body) {
  const faces = [];
  const scar = body.scar;
  if (scar) {
    for (const face of scar.faces || []) {
      const dx = session.player.x - body.x;
      const dz = session.player.z - body.z;
      if (face.nx * dx + face.nz * dz > 0) faces.push({ kind: face.kind, nx: face.nx, nz: face.nz });
    }
  }
  const station = session.bodies.find((b) => b.variant === 'wc_station' && !b.destroyed);
  let facesStation = false;
  if (station && scar && station.id !== body.id) {
    const dx = station.x - body.x;
    const dz = station.z - body.z;
    const dl = Math.hypot(dx, dz) || 1;
    const nl = Math.hypot(scar.nx, scar.nz) || 1;
    facesStation = (scar.nx / nl) * (dx / dl) + (scar.nz / nl) * (dz / dl) > 0.65;
  }
  return {
    faces,
    hasGroove: faces.some((f) => f.kind === 'groove'),
    facesStation,
    hasPlate: body.variant === 'wc_plate',
    nx: scar ? scar.nx : null,
    nz: scar ? scar.nz : null,
  };
}

function rememberStructure(session, body, data) {
  const id = `scan:${body.id}:structure`;
  const prior = session.notebook.measurements[id];
  if (!prior) {
    return measurement(session, id, { id, kind: 'scan', mode: 'structure', targetId: body.id, spoiled: false, data });
  }
  const faces = prior.data.faces.slice();
  for (const face of data.faces) {
    if (!faces.some((f) => f.kind === face.kind && f.nx === face.nx && f.nz === face.nz)) faces.push(face);
  }
  prior.data = {
    ...prior.data,
    ...data,
    faces,
    hasGroove: prior.data.hasGroove || data.hasGroove,
    facesStation: prior.data.facesStation || data.facesStation,
  };
  return prior;
}

function doScan(session, targetId, mode) {
  const body = findBody(session, targetId);
  if (!body) return fail('missing_body');
  if (!revealed(session, body)) return fail('not_visible');
  if (body.destroyed && mode !== 'visual') return fail('destroyed');
  if (mode === 'spectro' && body.volatile && !body.destroyed) {
    body.destroyed = true;
    body.historySpoiled = true;
    body.cargo = null;
    const id = `scan:${body.id}:spectro`;
    const record = measurement(session, id, {
      id, kind: 'scan', mode, targetId: body.id, spoiled: true,
      data: { cooked: true, material: null },
    });
    return { ok: true, measurement: record, destroyed: body.id };
  }
  if (mode === 'trajectory') {
    const id = `scan:${body.id}:trajectory`;
    const prior = session.notebook.measurements[id];
    if (prior && !prior.spoiled) return { ok: true, measurement: prior };
    const rock = session.bodies.find((b) => b.variant === 'wc_rock' && !b.destroyed);
    const spoiled = !!body.historySpoiled;
    const data = spoiled
      ? { spoiled: true, vx: null, vz: null }
      : {
        spoiled: false,
        x: body.x,
        z: body.z,
        vx: body.vx,
        vz: body.vz,
        tangent: rock ? tangentScore(body, body, rock) : null,
      };
    if (!spoiled) body.trajectoryLocked = true;
    const record = measurement(session, id, { id, kind: 'scan', mode, targetId: body.id, spoiled, data });
    return { ok: true, measurement: record };
  }
  if (mode === 'structure') {
    const record = rememberStructure(session, body, scanStructure(session, body));
    return { ok: true, measurement: record };
  }
  const id = `scan:${body.id}:${mode}`;
  const prior = session.notebook.measurements[id];
  if (prior) return { ok: true, measurement: prior };
  let data = null;
  if (mode === 'visual') data = scanVisual(body);
  else if (mode === 'spectro') data = { material: body.scar ? body.scar.material : null, cooked: false };
  else if (mode === 'mass') data = { mass: body.mass, mu: body.mu || 0 };
  else if (mode === 'thermal') data = { temperature: body.temperature, age: ageFromTemperature(body.temperature) };
  else if (mode === 'magazine') {
    if (!body.magazine) data = { present: false, remaining: null, capacity: null, unfired: false };
    else {
      data = {
        present: true,
        remaining: body.magazine.remaining,
        capacity: body.magazine.capacity,
        unfired: body.magazine.remaining === body.magazine.capacity,
      };
    }
  } else if (mode === 'signal') data = { group: body.transponderGroup, looped: false };
  else if (mode === 'fuel') data = { remaining: body.fuel, capacity: body.fuelCapacity };
  else return fail('bad_mode');
  const record = measurement(session, id, { id, kind: 'scan', mode, targetId: body.id, spoiled: false, data });
  return { ok: true, measurement: record };
}

function doPosition(session, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return fail('bad_position');
  const dist = Math.hypot(x - session.player.x, z - session.player.z);
  session.player.x = x;
  session.player.z = z;
  session.simTime += dist / 80;
  refreshRevealed(session);
  return { ok: true };
}

function crushCheck(session, mover) {
  const crushed = [];
  for (const other of session.bodies) {
    if (other.id === mover.id || other.destroyed || other.departed || other.fixed) continue;
    const dist = Math.hypot(other.x - mover.x, other.z - mover.z);
    if (dist > mover.radius + other.radius) continue;
    const rel = Math.hypot(mover.vx - other.vx, mover.vz - other.vz);
    if (rel > 8 && (other.crushable || other.fragile)) {
      other.destroyed = true;
      other.historySpoiled = true;
      crushed.push(other.id);
    }
  }
  return crushed;
}

function doTow(session, targetId, heading, seconds) {
  const body = findBody(session, targetId);
  if (!body) return fail('missing_body');
  if (body.destroyed) return fail('destroyed');
  if (body.fixed || body.mass > 20000) return fail('too_massive');
  if (!revealed(session, body)) return fail('not_visible');
  const dist = Math.hypot(body.x - session.player.x, body.z - session.player.z);
  if (session.grappled !== body.id && dist > GRAPPLE_RANGE) return fail('out_of_range');
  session.grappled = body.id;
  const accel = TOW_FORCE / body.mass;
  const steps = Math.max(1, Math.round((seconds || 1) / DT));
  const crushed = [];
  for (let i = 0; i < steps; i += 1) {
    body.vx += Math.cos(heading) * accel * DT;
    body.vz += Math.sin(heading) * accel * DT;
    body.x += body.vx * DT;
    body.z += body.vz * DT;
    crushed.push(...crushCheck(session, body));
  }
  session.simTime += steps * DT;
  if (!body.trajectoryLocked) body.historySpoiled = true;
  refreshRevealed(session);
  return { ok: true, crushed: [...new Set(crushed)], spoiled: body.historySpoiled };
}

function doCompare(session, aId, bId) {
  const a = session.notebook.measurements[`scan:${aId}:trajectory`];
  const b = session.notebook.measurements[`scan:${bId}:trajectory`];
  if (!a || !b) return fail('need_trajectory');
  const id = aId < bId ? `compare:${aId}:${bId}` : `compare:${bId}:${aId}`;
  if (a.spoiled || b.spoiled || a.data.spoiled || b.data.spoiled) {
    const record = measurement(session, id, { id, kind: 'compare', spoiled: true, data: { spoiled: true } });
    return { ok: true, measurement: record };
  }
  const fit = closestApproach(a.data, b.data);
  const record = measurement(session, id, {
    id, kind: 'compare', spoiled: false,
    data: { ...fit, sigma: 2.5 },
  });
  return { ok: true, measurement: record };
}

function sampleOf(session, id) {
  const traj = session.notebook.measurements[`scan:${id}:trajectory`];
  const mass = session.notebook.measurements[`scan:${id}:mass`];
  const thermal = session.notebook.measurements[`scan:${id}:thermal`];
  if (!traj || traj.spoiled || traj.data.spoiled) return null;
  return {
    id,
    x: traj.data.x,
    z: traj.data.z,
    vx: traj.data.vx,
    vz: traj.data.vz,
    mass: mass && Number.isFinite(mass.data.mass) ? mass.data.mass : null,
    age: thermal ? thermal.data.age : null,
  };
}

function doReconstruct(session, action) {
  const ids = action.targetIds || [];
  const samples = ids.map((id) => sampleOf(session, id)).filter(Boolean);
  const group = action.group || null;
  let data = null;
  if (action.model === 'ballistic') data = { ...ballisticFit(samples), group };
  else if (action.model === 'heading_rate') data = { ...headingRateFit(samples), group };
  else if (action.model === 'deflagration') data = { ...deflagrationFit(samples), group };
  else if (action.model === 'ejection') {
    const pod = sampleOf(session, action.podId);
    data = { ...ejectionFit(pod, samples), group };
  } else if (action.model === 'point_mass') {
    const gravScan = Object.values(session.notebook.measurements).find((m) => m.mode === 'mass' && m.data && m.data.mu > 0);
    const gravBody = gravScan ? findBody(session, gravScan.targetId) : null;
    const gravity = gravBody ? { mu: gravBody.mu, x: gravBody.x, z: gravBody.z, soft: Math.max(50, gravBody.radius) } : null;
    data = { ...pointMassFit(samples, gravity), group };
  } else if (action.model === 'mirror') {
    const plate = findBody(session, action.mirrorId);
    const struct = session.notebook.measurements[`scan:${action.mirrorId}:structure`];
    const frag = sampleOf(session, action.fragmentId);
    const shooter = sampleOf(session, action.shooterId);
    if (!frag || !struct || !struct.data || !plate) return fail('need_plate');
    data = {
      ...mirrorFit({ ...frag, shooter }, { x: plate.x, z: plate.z, nx: struct.data.nx, nz: struct.data.nz }),
      group,
    };
  } else return fail('bad_model');
  const id = `reconstruct:${action.model}:${group || action.fragmentId || action.podId || ids.slice().sort().join('+')}`;
  const record = measurement(session, id, { id, kind: 'reconstruct', spoiled: false, data });
  return { ok: true, measurement: record };
}

function doBringPod(session, targetId, assayId) {
  const body = findBody(session, targetId);
  const assay = session.assayPoints.find((p) => p.id === assayId);
  if (!body) return fail('missing_body');
  if (!assay) return fail('missing_assay');
  if (body.destroyed) return fail('destroyed');
  if (!body.cargo) return fail('not_cargo');
  if (!revealed(session, body)) return fail('not_visible');
  const near = Math.hypot(body.x - session.player.x, body.z - session.player.z);
  if (near > GRAPPLE_RANGE) return fail('out_of_range');
  session.grappled = body.id;
  const stepsCap = Math.round(45 / DT);
  for (let i = 0; i < stepsCap; i += 1) {
    const dx = assay.x - body.x;
    const dz = assay.z - body.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist < ASSAY_RANGE) break;
    const heading = Math.atan2(dz, dx);
    const accel = TOW_FORCE / body.mass;
    body.vx += Math.cos(heading) * accel * DT;
    body.vz += Math.sin(heading) * accel * DT;
    // Damp so the pod arrives instead of orbiting the buoy.
    body.vx *= 0.9;
    body.vz *= 0.9;
    body.x += body.vx * DT;
    body.z += body.vz * DT;
    session.simTime += DT;
  }
  if (!body.trajectoryLocked) body.historySpoiled = true;
  const dist = Math.hypot(assay.x - body.x, assay.z - body.z);
  if (dist > ASSAY_RANGE) return fail('assay_not_reached');
  body.vx = 0;
  body.vz = 0;
  const data = {
    declared: body.cargo.declared,
    actual: body.cargo.actual,
    mismatch: body.cargo.declared !== body.cargo.actual,
  };
  body.cargo = { ...body.cargo, sealed: false };
  const id = `assay:${body.id}:${assay.id}`;
  const record = measurement(session, id, { id, kind: 'assay', targetId: body.id, spoiled: false, data });
  return { ok: true, measurement: record };
}

function applyEffects(session, effects) {
  for (const effect of effects || []) {
    if (effect.kind === 'stamp') {
      const body = findBody(session, effect.targetId);
      if (body && !body.destroyed) body.stamp = effect.stamp;
    } else if (effect.kind === 'depart') {
      const body = findBody(session, effect.targetId);
      if (!body || body.destroyed || body.fixed) continue;
      const accel = 6;
      const steps = Math.round((effect.seconds || 4) / DT);
      for (let i = 0; i < steps; i += 1) {
        body.vx += Math.cos(effect.heading) * accel * DT;
        body.vz += Math.sin(effect.heading) * accel * DT;
        body.x += body.vx * DT;
        body.z += body.vz * DT;
      }
      body.departedOrder = true;
    }
  }
}

function doFile(session, hypothesisId) {
  if (session.ruling && session.ruling.status === 'accepted') return fail('already_ruled');
  const hypothesis = session.hypotheses.find((h) => h.id === hypothesisId);
  if (!hypothesis) return fail('unknown_claim');
  const report = evaluateHypothesis(strippedHypothesis(hypothesis), session.notebook, evidenceScene(session));
  if (!report.supported) {
    session.ruling = {
      status: 'unaccepted',
      hypothesisId,
      statement: hypothesis.statement,
      situation: 'The filing does not close on the evidence in hand. The wrecks stay as they are.',
      intents: {
        economy: { type: 'credit', amount: 0, payee: 'none', reason: `${session.caseId}:unaccepted` },
        heat: null,
        worldFacts: [],
      },
    };
    return { ok: true, ruling: session.ruling };
  }
  const cons = hypothesis.consequence;
  applyEffects(session, cons.effects);
  session.ruling = {
    status: 'accepted',
    hypothesisId,
    statement: hypothesis.statement,
    situation: cons.situation,
    intents: {
      economy: { type: 'credit', amount: cons.payout_cr, payee: cons.payee, reason: `${session.caseId}:${hypothesisId}` },
      heat: cons.heat ? { ...cons.heat } : null,
      worldFacts: (cons.worldFacts || []).map((f) => ({ ...f })),
    },
  };
  refreshRevealed(session);
  return { ok: true, ruling: session.ruling };
}

export function act(session, action, opts = {}) {
  if (!action || !action.verb) return fail('bad_action');
  if (session.ruling && session.ruling.status === 'accepted' && action.verb !== 'file') {
    // The scene may still be read. Further tows after a ruling would be a second case.
  }
  let result;
  if (action.verb === 'scan') result = doScan(session, action.targetId, action.mode);
  else if (action.verb === 'position') result = doPosition(session, action.x, action.z);
  else if (action.verb === 'grapple') {
    const body = findBody(session, action.targetId);
    if (!body || !revealed(session, body)) result = fail('not_visible');
    else if (Math.hypot(body.x - session.player.x, body.z - session.player.z) > GRAPPLE_RANGE) result = fail('out_of_range');
    else {
      session.grappled = body.id;
      result = { ok: true, grappled: body.id };
    }
  } else if (action.verb === 'release') {
    session.grappled = null;
    result = { ok: true };
  } else if (action.verb === 'tow' || action.verb === 'moveObstruction') {
    result = doTow(session, action.targetId, action.heading, action.seconds || 4);
  } else if (action.verb === 'compare') result = doCompare(session, action.targetA, action.targetB);
  else if (action.verb === 'bringPod') result = doBringPod(session, action.targetId, action.assayId);
  else if (action.verb === 'reconstruct') result = doReconstruct(session, action);
  else if (action.verb === 'file') result = doFile(session, action.hypothesisId);
  else result = fail('bad_verb');
  if (result.ok && opts.record !== false) {
    session.actionLog.push(JSON.parse(JSON.stringify(action)));
  }
  return result;
}

export function serializeCourt(session) {
  return {
    v: WRECK_COURT_SCHEMA_VERSION,
    caseId: session.caseId,
    seed: session.seed,
    actions: session.actionLog.map((a) => ({ ...a })),
  };
}

export function restoreCourt(blob) {
  if (!blob || blob.v !== WRECK_COURT_SCHEMA_VERSION) throw new Error('bad wreck court save');
  const session = openCourt({ caseId: blob.caseId, seed: blob.seed });
  for (const action of blob.actions || []) act(session, action, { record: true });
  return session;
}

function ringPoints(session) {
  const points = [];
  for (const body of session.bodies) {
    if (body.departed || body.destroyed) continue;
    if (!body.occults && body.radius < 24) continue;
    const steps = body.occults ? 10 : 6;
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const dist = body.radius + 90;
      points.push({ x: body.x + Math.cos(a) * dist, z: body.z + Math.sin(a) * dist });
    }
  }
  return points;
}

const SCAN_MODES = ['visual', 'thermal', 'trajectory', 'mass', 'structure', 'magazine', 'signal', 'fuel'];

function scanVisible(session, modes, spectro) {
  refreshRevealed(session);
  for (const body of session.bodies) {
    if (!session.revealed[body.id] || body.destroyed) continue;
    for (const mode of modes) act(session, { verb: 'scan', targetId: body.id, mode });
    if (spectro && !body.volatile) act(session, { verb: 'scan', targetId: body.id, mode: 'spectro' });
  }
}

function reconstructFromNotebook(session) {
  const groups = new Map();
  for (const m of Object.values(session.notebook.measurements)) {
    if (m.kind !== 'scan' || m.mode !== 'signal' || !m.data || !m.data.group) continue;
    if (!groups.has(m.data.group)) groups.set(m.data.group, []);
    groups.get(m.data.group).push(m.targetId);
  }
  for (const [group, ids] of groups) {
    const unique = [...new Set(ids)];
    if (unique.length >= 2) {
      act(session, { verb: 'reconstruct', model: 'ballistic', targetIds: unique, group });
    }
    if (group === 'vent' && unique.length >= 4) {
      act(session, { verb: 'reconstruct', model: 'heading_rate', targetIds: unique, group });
      act(session, { verb: 'reconstruct', model: 'point_mass', targetIds: unique, group });
    }
    if (group === 'train' && unique.length >= 3) {
      act(session, { verb: 'reconstruct', model: 'deflagration', targetIds: unique, group });
    }
  }
  const pods = [];
  for (const m of Object.values(session.notebook.measurements)) {
    if (m.kind === 'scan' && m.mode === 'visual' && m.data && m.data.sealedCargo) pods.push(m.targetId);
  }
  for (const [group, ids] of groups) {
    if (ids.length < 3 || group === 'vent' || group === 'train' || group === 'decoy') continue;
    for (const podId of pods) {
      act(session, { verb: 'reconstruct', model: 'ejection', podId, targetIds: [...new Set(ids)], group });
    }
  }
  const trajIds = Object.values(session.notebook.measurements)
    .filter((m) => m.kind === 'scan' && m.mode === 'trajectory' && !m.spoiled)
    .map((m) => m.targetId);
  for (let i = 0; i < trajIds.length; i += 1) {
    for (let k = i + 1; k < trajIds.length; k += 1) {
      act(session, { verb: 'compare', targetA: trajIds[i], targetB: trajIds[k] });
    }
  }
  const plates = session.bodies.filter((b) => b.variant === 'wc_plate' && session.revealed[b.id]);
  const guns = session.bodies.filter((b) => b.turrets && session.revealed[b.id] && !b.destroyed);
  const rounds = session.bodies.filter((b) => b.variant === 'wc_round' && session.revealed[b.id]);
  for (const plate of plates) {
    for (const round of rounds) {
      for (const gun of guns) {
        act(session, {
          verb: 'reconstruct',
          model: 'mirror',
          mirrorId: plate.id,
          fragmentId: round.id,
          shooterId: gun.id,
          group: `${round.id}:${gun.id}`,
        });
      }
    }
  }
}

function bringSealedPods(session) {
  const assay = session.assayPoints[0];
  if (!assay) return;
  for (const m of Object.values(session.notebook.measurements)) {
    if (m.kind !== 'scan' || m.mode !== 'visual' || !m.data || !m.data.sealedCargo) continue;
    const body = findBody(session, m.targetId);
    if (!body || body.destroyed || !body.cargo) continue;
    act(session, { verb: 'position', x: body.x + body.radius + 30, z: body.z + 20 });
    act(session, { verb: 'bringPod', targetId: body.id, assayId: assay.id });
  }
}

/**
 * A player who only looks, from the published start, and files the one claim
 * those looks support. No per-case script.
 */
export function visualOnlyFiling(session) {
  scanVisible(session, ['visual'], false);
  const supported = supportedClaims(session);
  if (supported.length === 1) act(session, { verb: 'file', hypothesisId: supported[0] });
  return { supported, ruling: session.ruling };
}

/**
 * A player who walks the scene, samples every non-destructive instrument,
 * and files the one claim the notebook supports. Uses only act() and the
 * public notebook. No truth metadata.
 */
export function carefulInvestigation(session) {
  for (const point of ringPoints(session)) {
    act(session, { verb: 'position', x: point.x, z: point.z });
    scanVisible(session, SCAN_MODES, true);
  }
  scanVisible(session, SCAN_MODES, true);
  bringSealedPods(session);
  reconstructFromNotebook(session);
  const supported = supportedClaims(session);
  if (supported.length === 1) act(session, { verb: 'file', hypothesisId: supported[0] });
  return { supported, ruling: session.ruling };
}

export function buildAdventureOffer(seed) {
  const def = caseDef(WRECK_COURT_ENTRY_CASE);
  const numericSeed = (seed >>> 0) || 1;
  return {
    id: `wreck_court_${def.id}_${numericSeed}`,
    offerId: `wreck_court_${def.id}_${numericSeed}`,
    source: 'wreckCourt',
    type: 'recon_scan',
    tag: 'wreck_court',
    choice: null,
    title: def.title,
    summary: 'Read the wreckage in place. File the claim the bodies support.',
    brief: def.briefing,
    giver: 'Loss investigation communicator',
    stationId: null,
    reward_cr: 0,
    params: {
      wreckCourtCaseId: def.id,
      seed: numericSeed,
      scanTargets: 4,
      acceptsBy: 'physical_reconstruction',
    },
  };
}

export function openCourtFromOffer(offer) {
  if (!offer || !offer.params || !offer.params.wreckCourtCaseId) throw new Error('not a wreck court offer');
  return openCourt({ caseId: offer.params.wreckCourtCaseId, seed: offer.params.seed });
}

export function evidenceFingerprint(session) {
  refreshRevealed(session);
  const bodies = session.bodies
    .filter((b) => session.revealed[b.id])
    .map((b) => ({
      id: b.id,
      destroyed: !!b.destroyed,
      spoiled: !!b.historySpoiled,
      x: Math.round(b.x * 1000) / 1000,
      z: Math.round(b.z * 1000) / 1000,
      stamp: b.stamp || null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const measurements = Object.keys(session.notebook.measurements).sort();
  return { bodies, measurements, ruling: session.ruling ? session.ruling.hypothesisId : null, status: session.ruling ? session.ruling.status : null };
}

/**
 * Library shape for a future registry row. update() does not tick unless a
 * session has been mounted by the adapter. Mounting is not done here.
 */
export const wreckCourt = {
  name: 'wreckCourt',
  init() {},
  update() {},
};
