// Spectrum case model. The forward pass reads authored poses so the sensor can
// hear them. Everything handed back is an allow-listed public view: bearings,
// uncertainty, motion class, and (only once the observations justify it) a fix.
// Scanner `recordAnomalyBearing` is the baseline / bearing-delta gate. The point
// passed into it lies on the heard ray, never on the hidden source.

import { recordAnomalyBearing, signalStrengthFor } from '../scanner.js';
import { spectrumCaseById } from '../../data/spectrum/scenarios.js';
import {
  AUDIBLE,
  BACKTRACK_AGREE_WU,
  BRAKE_HOLD_WU_S,
  DRIFT_SPEED_WU_S,
  DWELL_SPEED_WU_S,
  ECHO_POWER,
  JAM_REJECT,
  LOG_CAP,
  MANEUVER_SPEED_WU_S,
  MIN_BASELINE_WU,
  MIN_BEARING_DELTA_DEG,
  PAYOFF_RADIUS_WU,
  RECORDING_GAP_WU_S,
  REQUIRED_PINGS,
  REVEAL_AREA_WU2,
  SAMPLE_CAP,
  SCANNER_GATE_PINGS,
  SIGMA_WU,
  SPECTRUM_SCHEMA,
  TOW_RANGE_WU,
} from '../../data/spectrum/constants.js';
import {
  bearingDeg,
  bounceOnSegment,
  dirFromBearing,
  dist2,
  foldEcho,
  pointAlong,
  reflectPoint,
  segmentBlocked,
} from './geometry.js';
import { solveTrack } from './solve.js';

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function clonePoint(point) {
  return { x: round3(point.x), z: round3(point.z) };
}

function placed(point, origin) {
  return point ? { x: point.x + origin.x, z: point.z + origin.z } : point;
}

export function bindSpectrumWorld(model, origin = { x: 0, z: 0 }, poses = {}) {
  const base = spectrumCaseById(model.caseId);
  if (!base) return false;
  const coordinate = (v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1e9 ? Number(v) : 0;
  model.origin = { x: coordinate(origin?.x), z: coordinate(origin?.z) };
  const at = (p) => placed(p, model.origin);
  model.liveDefinition = { ...base, search: { ...base.search, ...at(base.search) },
    emitters: base.emitters.map((e) => ({ ...e, pos: at(e.pos), center: at(e.center) })),
    occluders: base.occluders.map((e) => ({ ...e, pos: at(e.pos), center: at(e.center) })),
    reflectors: base.reflectors.map((r) => ({ ...r, a: at(r.a), b: at(r.b) })),
    props: base.props.map((p) => ({ ...p, pos: at(p.pos) })),
    sled: base.sled ? at(base.sled) : null,
  };
  model.liveBound = true;
  model.livePoses = poses;
  return true;
}

function definitionOf(model) { return model?.liveDefinition || spectrumCaseById(model?.caseId); }

export function createSpectrumModel(caseId, simTime, seed = 1) {
  const def = spectrumCaseById(caseId);
  if (!def) return null;
  const propPos = {};
  for (let i = 0; i < def.props.length; i++) {
    const prop = def.props[i];
    propPos[prop.id] = { x: prop.pos.x, z: prop.pos.z };
  }
  return {
    schemaVersion: SPECTRUM_SCHEMA,
    caseId: def.id,
    armedAt: Number(simTime) || 0,
    seed: (Number(seed) >>> 0) || 1,
    propPos,
    towed: {},
    tracks: {},
    nextTrack: 1,
    focusKey: null,
    manualFocus: false,
    reversed: false,
    revealed: false,
    resolved: false,
    identity: 'UNRESOLVED',
    fix: null,
    velocity: null,
    fixTime: null,
    area: null,
    lastTime: Number(simTime) || 0,
    log: [],
    receipts: [],
    ops: 0,
    flags: { contradiction: false, jammed: false, wrong: false, reversed: false },
    jamWu: 0,
  };
}

function poseOf(emitter, time, model) {
  if (model.liveBound) return model.livePoses?.emitters?.[emitter.id] || null;
  if (emitter.propId && model.propPos[emitter.propId]) {
    const placed = model.propPos[emitter.propId];
    return { x: placed.x, z: placed.z, vx: 0, vz: 0 };
  }
  if (emitter.motion === 'linear') {
    const vx = emitter.vel ? emitter.vel.x : 0;
    const vz = emitter.vel ? emitter.vel.z : 0;
    return {
      x: emitter.pos.x + vx * time,
      z: emitter.pos.z + vz * time,
      vx,
      vz,
    };
  }
  if (emitter.motion === 'arc') {
    const angle = (emitter.phase || 0) + (emitter.omega || 0) * time;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const radius = emitter.orbit;
    return {
      x: emitter.center.x + c * radius,
      z: emitter.center.z + s * radius,
      vx: -s * radius * emitter.omega,
      vz: c * radius * emitter.omega,
    };
  }
  return { x: emitter.pos.x, z: emitter.pos.z, vx: 0, vz: 0 };
}

function occluderPoses(def, time, model) {
  const out = [];
  for (let i = 0; i < def.occluders.length; i++) {
    const occ = def.occluders[i];
    if (model.liveBound) {
      const live = model.livePoses?.occluders?.[occ.id];
      if (live) out.push({ id: occ.id, ...live });
      continue;
    }
    if (occ.propId && model.propPos[occ.propId]) {
      const placed = model.propPos[occ.propId];
      out.push({ id: occ.id, x: placed.x, z: placed.z, r: occ.r });
      continue;
    }
    if (occ.motion === 'sweep') {
      const angle = (occ.phase || 0) + (occ.omega || 0) * time;
      out.push({
        id: occ.id,
        x: occ.center.x + Math.cos(angle) * occ.orbit,
        z: occ.center.z + Math.sin(angle) * occ.orbit,
        r: occ.r,
      });
      continue;
    }
    out.push({ id: occ.id, x: occ.pos.x, z: occ.pos.z, r: occ.r });
  }
  return out;
}

function emitterPower(emitter, model) {
  if (emitter.beforeReverse != null || emitter.afterReverse != null) {
    return model.reversed ? Number(emitter.afterReverse ?? emitter.power ?? 1) : Number(emitter.beforeReverse ?? 0);
  }
  if (emitter.armOnTow && !model.towed[emitter.propId]) return 0;
  return Number(emitter.power ?? 1);
}

function jammerGain(emitter, model) {
  return emitter.jamUntilReverse && model.reversed ? 0 : Number(emitter.jamGain) || 0;
}

function jamAmount(def, observer, time, model) {
  let jam = 0;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    const gain = jammerGain(emitter, model);
    if (!emitter.jamRadius || gain <= 0) continue;
    const pose = poseOf(emitter, time, model);
    if (!pose) continue;
    const distance = dist2(observer, pose);
    if (distance >= emitter.jamRadius) continue;
    jam = Math.max(jam, gain * (1 - distance / emitter.jamRadius));
  }
  return jam;
}

// World-units the ship still has to travel to leave every active curtain.
// A rejected pulse prints this distance. It is never a hardcoded zero.
function jamClearanceWu(def, observer, time, model) {
  let clearance = 0;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    const gain = jammerGain(emitter, model);
    if (!emitter.jamRadius || gain <= 0) continue;
    const pose = poseOf(emitter, time, model);
    if (!pose) continue;
    const distance = dist2(observer, pose);
    if (distance >= emitter.jamRadius) continue;
    clearance = Math.max(clearance, emitter.jamRadius - distance);
  }
  return clearance;
}

function toneOf(emitter, byId) {
  if (emitter.copies) {
    const source = byId.get(emitter.copies);
    if (source) return source.tone;
  }
  return emitter.tone;
}

function chartedEcho(observer, target, reflectors, occluders) {
  let best = null;
  for (let i = 0; i < reflectors.length; i++) {
    const mirror = reflectors[i];
    if (!mirror.charted) continue;
    const image = reflectPoint(target, mirror.a, mirror.b);
    const bounce = bounceOnSegment(observer, image, mirror.a, mirror.b);
    if (!bounce) continue;
    if (segmentBlocked(observer, bounce, occluders)) continue;
    const path = dist2(observer, bounce) + dist2(bounce, target);
    const direct = dist2(observer, target);
    const apparent = bearingDeg(observer, image);
    const folded = foldEcho(observer, apparent, mirror.a, mirror.b);
    const score = ECHO_POWER / (1 + path);
    if (!best || score > best.score) {
      best = {
        apparent,
        folded,
        extra: Math.max(0, path - direct),
        score,
        path,
      };
    }
  }
  return best;
}

function bodyPose(def, model, time) {
  if (model.liveBound) return model.livePoses?.body || null;
  if (def.bodyId === 'sled' && def.sled) return { x: def.sled.x, z: def.sled.z, vx: 0, vz: 0 };
  for (let i = 0; i < def.emitters.length; i++) {
    if (def.emitters[i].id === def.bodyId) return poseOf(def.emitters[i], time, model);
  }
  return null;
}

function leadPoint(model, time) {
  if (!model.fix) return null;
  const dt = (Number(time) || 0) - (Number(model.fixTime) || 0);
  const velocity = model.velocity || { x: 0, z: 0 };
  return {
    x: model.fix.x + velocity.x * dt,
    z: model.fix.z + velocity.z * dt,
  };
}

function evalReverse(def, model, time) {
  const spec = def.reverse;
  if (!spec) return;
  let raider = null;
  for (let i = 0; i < def.emitters.length; i++) {
    if (def.emitters[i].id === spec.raiderId) raider = def.emitters[i];
  }
  if (!raider) return;
  const from = poseOf(raider, time, model);
  if (!from) return;
  const occluders = occluderPoses(def, time, model);
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    if (emitter.role !== spec.fromRole && emitter.role !== spec.toRole) continue;
    const power = emitterPower(emitter, model);
    if (power <= 0) continue;
    const pose = poseOf(emitter, time, model);
    if (!pose) continue;
    if (segmentBlocked(from, pose, occluders)) continue;
    const score = power / (1 + dist2(from, pose));
    if (score > bestScore) {
      best = emitter;
      bestScore = score;
    }
  }
  const next = !!(best && best.role === spec.toRole);
  if (next && !model.reversed && !model.flags.reversed) {
    model.flags.reversed = true;
    model.receipts.push('Deception reversed. Your buoy holds their lock.');
  }
  model.reversed = next;
}

function ensureTrack(model, emitter, tone) {
  const existing = Object.values(model.tracks);
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].sourceId === emitter.id) return existing[i];
  }
  const key = `T${model.nextTrack++}`;
  const track = {
    key,
    sourceId: emitter.id,
    tone,
    chartLabel: emitter.chartLabel || null,
    samples: [],
    gate: null,
    lastBearing: null,
    lastApparent: null,
    lastReason: null,
    lastVia: null,
    motionClass: 'UNKNOWN',
    claim: null,
    contradiction: false,
    area: null,
    estimate: null,
    velocity: null,
    estimateTime: null,
    heardWhileClaimSilent: false,
    dwells: 0,
    decoded: null,
    echo: false,
  };
  model.tracks[key] = track;
  return track;
}

function cleanGate(record) {
  if (!record) return null;
  return {
    schemaVersion: 1,
    samples: (record.samples || []).map((sample) => ({
      origin: { x: sample.origin.x, z: sample.origin.z },
      bearingDeg: sample.bearingDeg,
      sampledAt: sample.sampledAt,
    })),
    requiredPings: record.requiredPings,
    minBaselineWu: record.minBaselineWu,
    minBearingDeltaDeg: record.minBearingDeltaDeg,
    revealed: false,
    fixedPos: null,
  };
}

function motionClass(track, solved) {
  if (!solved || track.samples.length < 2) return 'UNKNOWN';
  const last = track.samples[track.samples.length - 1];
  const dir = dirFromBearing(last.bearingDeg);
  const estimatedRadial = solved.velocity.x * dir.x + solved.velocity.z * dir.z;
  if (last.motif && Math.abs(last.chirp - estimatedRadial) > RECORDING_GAP_WU_S) return 'RECORDING';
  if (solved.speed < DRIFT_SPEED_WU_S) return 'STATIONARY';
  if (solved.speed < MANEUVER_SPEED_WU_S) return 'DRIFTING';
  return 'MANEUVERING';
}

function recomputeTrack(def, track) {
  const solved = solveTrack(track.samples, def.search);
  if (!solved) {
    track.area = null;
    track.estimate = null;
    track.velocity = null;
    track.motionClass = 'UNKNOWN';
    return;
  }
  track.area = solved.area;
  track.estimate = { x: solved.position.x, z: solved.position.z };
  track.velocity = { x: solved.velocity.x, z: solved.velocity.z };
  track.estimateTime = solved.t;
  track.motionClass = motionClass(track, solved);
  if (track.claim && (track.claim === 'STATIONARY' || track.claim === 'DRIFTING' || track.claim === 'MANEUVERING')) {
    track.contradiction = track.motionClass !== 'UNKNOWN' && track.motionClass !== 'RECORDING'
      && track.motionClass !== track.claim;
  } else {
    track.contradiction = false;
  }
  if (track.motionClass === 'RECORDING') {
    let dwells = 0;
    let motif = null;
    for (let i = 0; i < track.samples.length; i++) {
      const sample = track.samples[i];
      if (sample.dwell && sample.motif) {
        dwells += 1;
        motif = sample.motif;
      }
    }
    track.dwells = dwells;
    track.decoded = dwells >= 2 && motif ? { x: motif.x, z: motif.z } : null;
  }
}

function holdFix(model, def, track) {
  if (!track || !track.estimate || def.solve === 'backtrack') return;
  model.revealed = true;
  model.fix = { x: track.estimate.x, z: track.estimate.z };
  model.velocity = { x: track.velocity.x, z: track.velocity.z };
  model.fixTime = track.estimateTime;
  model.identity = def.publicName;
  model.area = track.area;
  model.focusKey = track.key;
}

function revokeReveal(model) {
  if (!model || model.resolved || !model.revealed) return;
  model.revealed = false;
  model.fix = null;
  model.velocity = null;
  model.fixTime = null;
  model.area = null;
  model.identity = 'UNRESOLVED';
}

function trackHoldsReveal(def, model, track) {
  if (!track || track.samples.length < REQUIRED_PINGS) return false;
  if (track.area == null || track.area > REVEAL_AREA_WU2) return false;
  if (def.solve === 'fix-after-reverse' && !model.reversed) return false;
  if (def.solve === 'survivor' && !track.heardWhileClaimSilent) return false;
  if (def.wantClass && track.motionClass !== def.wantClass) return false;
  if (track.contradiction) return false;
  return true;
}

function considerReveal(def, model) {
  if (def.solve === 'backtrack') {
    const impacts = [];
    const tracks = Object.values(model.tracks);
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track.decoded || !track.estimate || track.area == null || track.area > REVEAL_AREA_WU2) continue;
      impacts.push({
        x: track.estimate.x - track.decoded.x * def.silenceS,
        z: track.estimate.z - track.decoded.z * def.silenceS,
      });
    }
    if (impacts.length < 3) {
      revokeReveal(model);
      return;
    }
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < impacts.length; i++) {
      sx += impacts[i].x;
      sz += impacts[i].z;
    }
    const mean = { x: sx / impacts.length, z: sz / impacts.length };
    let worst = 0;
    for (let i = 0; i < impacts.length; i++) worst = Math.max(worst, dist2(impacts[i], mean));
    if (worst > BACKTRACK_AGREE_WU) {
      revokeReveal(model);
      return;
    }
    model.revealed = true;
    model.fix = mean;
    model.velocity = { x: 0, z: 0 };
    model.fixTime = model.lastTime;
    model.identity = def.publicName;
    model.area = worst;
    return;
  }
  let track = model.tracks[model.focusKey];
  if (def.solve === 'survivor') {
    const tracks = Object.values(model.tracks);
    track = null;
    for (let i = 0; i < tracks.length; i++) {
      const candidate = tracks[i];
      if (!trackHoldsReveal(def, model, candidate)) continue;
      track = candidate;
    }
  }
  if (!trackHoldsReveal(def, model, track)) {
    revokeReveal(model);
    return;
  }
  holdFix(model, def, track);
}

function pushLog(model, entry) {
  model.log.push(entry);
  if (model.log.length > LOG_CAP) model.log.splice(0, model.log.length - LOG_CAP);
}

function publicTracks(model) {
  const tracks = Object.values(model.tracks);
  tracks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return tracks.map((track) => ({
    key: track.key,
    chartLabel: track.chartLabel,
    motionClass: track.motionClass,
    claim: track.claim,
    contradiction: track.contradiction === true,
    sampleCount: track.samples.length,
    area: track.area == null ? null : Math.round(track.area),
    bearingDeg: track.lastApparent == null ? null : round3(track.lastApparent),
    via: track.lastVia,
    reason: track.lastReason,
    echo: track.echo === true,
    decoded: track.decoded ? { x: round3(track.decoded.x), z: round3(track.decoded.z) } : null,
  }));
}

export function publicSpectrum(model) {
  if (!model) return null;
  const last = model.log.length ? model.log[model.log.length - 1] : null;
  return {
    schemaVersion: SPECTRUM_SCHEMA,
    caseId: model.caseId,
    identity: model.identity,
    revealed: model.revealed === true,
    resolved: model.resolved === true,
    reversed: model.reversed === true,
    focusKey: model.focusKey,
    area: model.area == null ? (last && last.area != null ? last.area : null) : Math.round(model.area),
    fix: model.revealed && model.fix ? clonePoint(model.fix) : null,
    velocity: model.revealed && model.velocity
      ? { x: round3(model.velocity.x), z: round3(model.velocity.z) }
      : null,
    tracks: publicTracks(model),
    log: model.log.slice(),
    receipts: model.receipts.slice(),
    observer: last && last.observer ? clonePoint(last.observer) : null,
    bearingDeg: last && last.bearingDeg != null ? last.bearingDeg : null,
    reason: last ? last.reason : null,
    accepted: last ? last.accepted === true : false,
    jamWu: Math.max(0, Math.round(Number(model.jamWu) || 0)),
    props: publicProps(model),
  };
}

function publicProps(model) {
  const def = definitionOf(model);
  if (!def || !Array.isArray(def.props)) return [];
  const out = [];
  for (let i = 0; i < def.props.length; i++) {
    const prop = def.props[i];
    const placed = model.propPos && model.propPos[prop.id];
    if (!placed) continue;
    out.push({ id: prop.id, kind: prop.kind, x: round3(placed.x), z: round3(placed.z) });
  }
  return out;
}

function noteContradiction(model, track) {
  if (!track.contradiction || model.flags.contradiction) return;
  model.flags.contradiction = true;
  model.receipts.push('Claim and motion disagree. The return is not doing what it says.');
}

export function applyMeasure(model, origin, velocity, simTime) {
  const def = model && definitionOf(model);
  if (!def || !origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null;
  const time = Number(simTime);
  if (!Number.isFinite(time)) return null;
  const elapsed = time - model.armedAt;
  model.lastTime = time;
  model.ops += 1;
  evalReverse(def, model, elapsed);

  const observer = { x: origin.x, z: origin.z };
  const speed = Math.hypot(velocity && velocity.x || 0, velocity && velocity.z || 0);
  const jam = jamAmount(def, observer, elapsed, model);
  if (jam >= JAM_REJECT) {
    model.jamWu = jamClearanceWu(def, observer, elapsed, model);
    if (!model.flags.jammed) {
      model.flags.jammed = true;
      const leave = Math.round(model.jamWu);
      model.receipts.push(`Noise floor high. Leave the curtain (${leave} WU) and pulse again.`);
    }
    pushLog(model, {
      t: round3(time),
      reason: 'jammed',
      accepted: false,
      bearingDeg: null,
      via: null,
      chirp: null,
      area: focusedArea(model),
      observer: clonePoint(observer),
      identity: model.identity,
      revealed: model.revealed === true,
    });
    maybeFinishMechanism(model);
    return publicSpectrum(model);
  }
  model.jamWu = 0;

  const byId = new Map(def.emitters.map((row) => [row.id, row]));
  const occluders = occluderPoses(def, elapsed, model);
  const candidates = [];
  let sawBlocked = false;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    model.ops += 1;
    if (emitter.role === 'jammer') continue;
    const power = emitterPower(emitter, model);
    if (power <= 0) continue;
    const pose = poseOf(emitter, elapsed, model);
    if (!pose) continue;
    const blocked = segmentBlocked(observer, pose, occluders);
    if (blocked) {
      sawBlocked = true;
      const echo = chartedEcho(observer, pose, model.liveBound
        ? (model.livePoses?.reflectors || []) : def.reflectors, occluders);
      if (!echo) continue;
      const strength = signalStrengthFor(echo.path, def.horizon) * power * ECHO_POWER;
      if (strength < AUDIBLE) continue;
      candidates.push({
        emitter, via: 'echo', strength, pose, power,
        bearing: echo.apparent,
        folded: echo.folded,
        extra: echo.extra,
      });
      continue;
    }
    const distance = dist2(observer, pose);
    const strength = signalStrengthFor(distance, def.horizon) * power;
    if (strength < AUDIBLE) continue;
    candidates.push({
      emitter, via: 'direct', strength, pose, power,
      bearing: bearingDeg(observer, pose),
      folded: null,
      extra: null,
    });
  }
  candidates.sort((a, b) => b.strength - a.strength || (a.emitter.id < b.emitter.id ? -1 : 1));

  if (!candidates.length) {
    pushLog(model, {
      t: round3(time),
      reason: sawBlocked ? 'occluded' : 'inaudible',
      accepted: false,
      bearingDeg: null,
      via: null,
      chirp: null,
      area: focusedArea(model),
      observer: clonePoint(observer),
      identity: model.identity,
      revealed: model.revealed === true,
    });
    maybeFinishMechanism(model);
    return publicSpectrum(model);
  }

  const groups = [];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const tone = toneOf(cand.emitter, byId);
    let group = null;
    for (let g = 0; g < groups.length; g++) {
      if (groups[g].tone !== tone) continue;
      const delta = Math.abs(groups[g].bearing - cand.bearing) % 360;
      const wrapped = Math.min(delta, 360 - delta);
      if (wrapped <= 14) {
        group = groups[g];
        break;
      }
    }
    if (!group) {
      group = { tone, bearing: cand.bearing, loudest: cand, members: [] };
      groups.push(group);
    }
    group.members.push(cand);
  }

  const claimedAudible = new Set();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].loudest.emitter.claim) claimedAudible.add(groups[i].tone);
  }

  let primary = null;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const cand = group.loudest;
    const track = ensureTrack(model, cand.emitter, group.tone);
    const constraintBearing = cand.folded ? cand.folded.bearingDeg : cand.bearing;
    const constraintOrigin = cand.folded ? cand.folded.origin : observer;
    const synthetic = pointAlong(constraintOrigin, constraintBearing, 1000);
    const gated = recordAnomalyBearing(track.gate, constraintOrigin, synthetic, {
      requiredPings: SCANNER_GATE_PINGS,
      minBaselineWu: MIN_BASELINE_WU,
      minBearingDeltaDeg: MIN_BEARING_DELTA_DEG,
    }, time);
    track.gate = cleanGate(gated.record);
    track.lastApparent = cand.bearing;
    track.lastVia = cand.via;
    track.echo = cand.via === 'echo';
    track.claim = cand.emitter.claim || track.claim;
    if (cand.emitter.chartLabel) track.chartLabel = cand.emitter.chartLabel;
    if (!gated.accepted) {
      track.lastReason = gated.reason || 'rejected';
      if (!primary) primary = { track, accepted: false, cand, reason: track.lastReason };
      continue;
    }
    const dir = dirFromBearing(constraintBearing);
    const sourceRadial = cand.pose.vx * dir.x + cand.pose.vz * dir.z;
    const shipRadial = (velocity && velocity.x || 0) * dir.x + (velocity && velocity.z || 0) * dir.z;
    // Opening range-rate. A stationary return heard from a moving ship is not zero.
    let chirp = sourceRadial - shipRadial;
    let motif = null;
    if (cand.emitter.modulation === 'recording' && cand.emitter.recordedVel) {
      motif = { x: cand.emitter.recordedVel.x, z: cand.emitter.recordedVel.z };
      chirp = Math.hypot(motif.x, motif.z);
    }
    const sigmaWu = SIGMA_WU * (1 + jam * 3);
    track.samples.push({
      t: time,
      origin: { x: constraintOrigin.x, z: constraintOrigin.z },
      player: { x: observer.x, z: observer.z },
      bearingDeg: constraintBearing,
      apparentDeg: cand.bearing,
      sigmaWu,
      chirp,
      motif,
      via: cand.via,
      extra: cand.extra,
      dwell: speed <= DWELL_SPEED_WU_S,
    });
    if (track.samples.length > SAMPLE_CAP) track.samples.splice(0, track.samples.length - SAMPLE_CAP);
    if (!cand.emitter.claim && !claimedAudible.has(group.tone)) track.heardWhileClaimSilent = true;
    track.lastReason = null;
    track.lastBearing = constraintBearing;
    recomputeTrack(def, track);
    noteContradiction(model, track);
    if (!primary || cand.strength > primary.cand.strength) {
      primary = { track, accepted: true, cand, reason: null };
    }
  }

  if (!model.manualFocus) {
    let loudestAccepted = null;
    const tracks = Object.values(model.tracks);
    for (let i = 0; i < groups.length; i++) {
      const sourceId = groups[i].loudest.emitter.id;
      let track = null;
      for (let k = 0; k < tracks.length; k++) {
        if (tracks[k].sourceId === sourceId) track = tracks[k];
      }
      if (!track || track.lastReason) continue;
      if (!loudestAccepted || groups[i].loudest.strength > loudestAccepted.strength) {
        loudestAccepted = { key: track.key, strength: groups[i].loudest.strength };
      }
    }
    if (loudestAccepted) model.focusKey = loudestAccepted.key;
    else if (primary) model.focusKey = primary.track.key;
  }
  considerReveal(def, model);

  const focus = model.tracks[model.focusKey] || (primary && primary.track) || null;
  pushLog(model, {
    t: round3(time),
    reason: primary && primary.accepted ? 'ok' : (primary && primary.reason) || 'rejected',
    accepted: !!(primary && primary.accepted),
    bearingDeg: primary ? round3(primary.cand.bearing) : null,
    via: primary ? primary.cand.via : null,
    chirp: primary && primary.accepted ? round3(primary.track.samples[primary.track.samples.length - 1].chirp) : null,
    area: focus && focus.area != null ? Math.round(focus.area) : null,
    observer: clonePoint(observer),
    identity: model.identity,
    revealed: model.revealed === true,
    motionClass: focus ? focus.motionClass : 'UNKNOWN',
    focus: model.focusKey,
  });
  maybeFinishMechanism(model);
  return publicSpectrum(model);
}

function focusedArea(model) {
  const track = model.tracks[model.focusKey];
  return track && track.area != null ? Math.round(track.area) : null;
}

export function applyFocus(model, keyOrClass) {
  if (!model) return false;
  const tracks = Object.values(model.tracks);
  if (!keyOrClass) return false;
  const want = String(keyOrClass);
  let found = model.tracks[want] || null;
  if (!found) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].motionClass === want || tracks[i].chartLabel === want) {
        found = tracks[i];
        break;
      }
    }
  }
  if (!found) return false;
  model.focusKey = found.key;
  model.manualFocus = true;
  const def = definitionOf(model);
  if (def) considerReveal(def, model);
  maybeFinishMechanism(model);
  return true;
}

export function applyTow(model, propId, to, player, simTime) {
  if (model?.liveBound) return { ok: false, reason: 'physical-tow-required' };
  if (!model || !model.propPos[propId] || !to || !player) return { ok: false, reason: 'no-prop' };
  const prop = model.propPos[propId];
  if (dist2(player, prop) > TOW_RANGE_WU) return { ok: false, reason: 'out-of-range' };
  if (dist2(prop, to) > TOW_RANGE_WU) return { ok: false, reason: 'throw-short' };
  prop.x = to.x;
  prop.z = to.z;
  model.towed[propId] = true;
  const def = definitionOf(model);
  const time = Number(simTime);
  if (def && Number.isFinite(time)) {
    model.lastTime = time;
    evalReverse(def, model, time - model.armedAt);
    if (def.payoff === 'tow' && model.revealed && def.towProp === propId) {
      const anchor = bodyPose(def, model, time - model.armedAt);
      if (anchor && dist2(prop, anchor) <= (def.towRadius || PAYOFF_RADIUS_WU)) {
        finish(model, def);
      }
    }
  }
  return { ok: true, reversed: model.reversed === true };
}

function logHas(model, reason) {
  const log = model.log || [];
  for (let i = 0; i < log.length; i++) if (log[i] && log[i].reason === reason) return true;
  return false;
}

function sampleOrigins(model) {
  const origins = [];
  const tracks = Object.values(model.tracks || {});
  for (let i = 0; i < tracks.length; i++) {
    const samples = tracks[i].samples || [];
    for (let s = 0; s < samples.length; s++) {
      if (samples[s] && samples[s].origin) origins.push(samples[s].origin);
    }
  }
  return origins;
}

function baselinesDiverge(origins) {
  const baselines = [];
  for (let i = 0; i < origins.length; i++) {
    for (let j = i + 1; j < origins.length; j++) {
      const dx = origins[j].x - origins[i].x;
      const dz = origins[j].z - origins[i].z;
      if (Math.hypot(dx, dz) < MIN_BASELINE_WU) continue;
      baselines.push({ x: dx, z: dz });
    }
  }
  for (let i = 0; i < baselines.length; i++) {
    for (let j = i + 1; j < baselines.length; j++) {
      const a = baselines[i];
      const b = baselines[j];
      const al = Math.hypot(a.x, a.z) || 1;
      const bl = Math.hypot(b.x, b.z) || 1;
      const cos = (a.x * b.x + a.z * b.z) / (al * bl);
      if (cos < 0.94) return true;
    }
  }
  return false;
}

function focusedTrack(model) {
  return model.tracks && model.focusKey ? model.tracks[model.focusKey] : null;
}

function lastChirp(track) {
  if (!track || !track.samples || !track.samples.length) return 0;
  const sample = track.samples[track.samples.length - 1];
  return Number(sample.chirp) || 0;
}

function maybeFinishMechanism(model) {
  if (!model || model.resolved || !model.revealed) return false;
  const def = definitionOf(model);
  if (!def) return false;
  const focus = focusedTrack(model);
  if (def.payoff === 'parallax' && baselinesDiverge(sampleOrigins(model))) {
    finish(model, def);
    return true;
  }
  if (def.payoff === 'window' && logHas(model, 'occluded') && focus && focus.motionClass === 'DRIFTING') {
    finish(model, def);
    return true;
  }
  if (def.payoff === 'shadow' && logHas(model, 'occluded') && focus && focus.motionClass === 'STATIONARY') {
    finish(model, def);
    return true;
  }
  if (def.payoff === 'jam' && logHas(model, 'jammed')) {
    finish(model, def);
    return true;
  }
  if (def.payoff === 'dwell') {
    const tracks = Object.values(model.tracks);
    let recordings = 0;
    let read = 0;
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].motionClass !== 'RECORDING') continue;
      recordings += 1;
      if ((tracks[i].dwells || 0) >= 2) read += 1;
    }
    if (recordings >= 3 && read === recordings) {
      finish(model, def);
      return true;
    }
  }
  if (def.payoff === 'live' && focus && focus.motionClass === 'DRIFTING' && logHas(model, 'jammed')) {
    const tracks = Object.values(model.tracks);
    const recording = tracks.find((track) => track.motionClass === 'RECORDING');
    if (recording && Math.abs(lastChirp(focus) - lastChirp(recording)) > RECORDING_GAP_WU_S) {
      finish(model, def);
      return true;
    }
  }
  return false;
}

function spoofSeparated(model) {
  const focus = focusedTrack(model);
  if (!focus || focus.motionClass !== 'DRIFTING') return false;
  if (Math.abs(lastChirp(focus)) < DRIFT_SPEED_WU_S) return false;
  const tracks = Object.values(model.tracks);
  return tracks.some((track) => track !== focus && track.contradiction === true
    && Math.abs(lastChirp(track)) + 8 < Math.abs(lastChirp(focus)));
}

function applySpoof(model, def, velocity) {
  if (!model.revealed || !model.fix) return { ok: false, reason: 'no-fix' };
  if (!spoofSeparated(model)) return { ok: false, reason: 'spoof-not-split' };
  const earned = model.velocity || { x: 0, z: 0 };
  const vx = velocity && velocity.x || 0;
  const vz = velocity && velocity.z || 0;
  if (Math.hypot(vx, vz) <= BRAKE_HOLD_WU_S) return { ok: false, reason: 'dead-stop' };
  if (Math.hypot(vx - earned.x, vz - earned.z) > BRAKE_HOLD_WU_S) return { ok: false, reason: 'velocity-mismatch' };
  finish(model, def);
  return { ok: true, resolved: true };
}

function applyTone(model, def, velocity) {
  if (!model.revealed || !model.fix) return { ok: false, reason: 'no-fix' };
  const track = focusedTrack(model);
  if (!track || track.motionClass !== 'DRIFTING') return { ok: false, reason: 'wrong-tone' };
  if (Math.abs(lastChirp(track)) < DRIFT_SPEED_WU_S) return { ok: false, reason: 'tone-quiet' };
  const tracks = Object.values(model.tracks);
  const quiet = tracks.some((other) => other !== track && other.samples && other.samples.length && Math.abs(lastChirp(other)) < DRIFT_SPEED_WU_S);
  if (!quiet) return { ok: false, reason: 'no-chord' };
  const earned = model.velocity || { x: 0, z: 0 };
  const vx = velocity && velocity.x || 0;
  const vz = velocity && velocity.z || 0;
  if (Math.hypot(vx, vz) <= BRAKE_HOLD_WU_S) return { ok: false, reason: 'dead-stop' };
  if (Math.hypot(vx - earned.x, vz - earned.z) > BRAKE_HOLD_WU_S) return { ok: false, reason: 'velocity-mismatch' };
  finish(model, def);
  return { ok: true, resolved: true };
}

function applyOccult(model, def, player, simTime) {
  if (!model.revealed || !player) return { ok: false, reason: 'no-fix' };
  const elapsed = Number(simTime) - model.armedAt;
  const occluders = occluderPoses(def, elapsed, model);
  let lantern = null;
  let wreck = null;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    if (emitter.role === 'decoy') lantern = emitter;
    if (emitter.id === def.bodyId) wreck = emitter;
  }
  if (!lantern || !wreck) return { ok: false, reason: 'no-body' };
  const lanternPose = poseOf(lantern, elapsed, model);
  const wreckPose = poseOf(wreck, elapsed, model);
  if (!lanternPose || !wreckPose) return { ok: false, reason: 'no-body' };
  if (!segmentBlocked(player, lanternPose, occluders)) return { ok: false, reason: 'lantern-visible' };
  if (segmentBlocked(player, wreckPose, occluders)) return { ok: false, reason: 'wreck-shadowed' };
  const tracks = Object.values(model.tracks);
  const heard = tracks.some((track) => track.sourceId === def.bodyId && track.heardWhileClaimSilent);
  if (!heard) return { ok: false, reason: 'lantern-still-loud' };
  finish(model, def);
  return { ok: true, resolved: true };
}

function arriveOnBody(model, def, player, simTime) {
  const time = Number(simTime);
  const elapsed = time - model.armedAt;
  const body = bodyPose(def, model, elapsed);
  const lead = leadPoint(model, time);
  if (!body || !lead) return { ok: false, reason: 'no-body' };
  const onBody = dist2(player, body) <= PAYOFF_RADIUS_WU;
  const onFix = dist2(player, lead) <= PAYOFF_RADIUS_WU;
  if (onBody && onFix) {
    finish(model, def);
    return { ok: true, resolved: true };
  }
  if (!model.flags.wrong) {
    model.flags.wrong = true;
    model.receipts.push('Fix not held. That hull is not the return.');
  }
  return { ok: false, reason: onFix ? 'wrong-body' : 'off-fix' };
}

function lineToStolenIsBlocked(def, model, elapsed) {
  const spec = def.reverse;
  if (!spec) return false;
  let raider = null;
  let stolen = null;
  for (let i = 0; i < def.emitters.length; i++) {
    const emitter = def.emitters[i];
    if (emitter.id === spec.raiderId) raider = emitter;
    if (emitter.role === spec.fromRole) stolen = emitter;
  }
  if (!raider || !stolen) return false;
  const from = poseOf(raider, elapsed, model);
  const target = poseOf(stolen, elapsed, model);
  if (!from || !target) return false;
  return segmentBlocked(from, target, occluderPoses(def, elapsed, model)) != null;
}

function applyMatch(model, def, player, velocity, simTime) {
  if (!model.revealed || !model.fix) return { ok: false, reason: 'no-fix' };
  const earned = model.velocity || { x: 0, z: 0 };
  const earnedSpeed = Math.hypot(earned.x, earned.z);
  if (earnedSpeed < MANEUVER_SPEED_WU_S) return { ok: false, reason: 'not-an-intercept' };
  const vx = velocity && velocity.x || 0;
  const vz = velocity && velocity.z || 0;
  if (Math.hypot(vx, vz) <= BRAKE_HOLD_WU_S) return { ok: false, reason: 'dead-stop' };
  if (Math.hypot(vx - earned.x, vz - earned.z) > BRAKE_HOLD_WU_S) {
    return { ok: false, reason: 'velocity-mismatch' };
  }
  return arriveOnBody(model, def, player, simTime);
}

function applyBlock(model, def, player, velocity, simTime) {
  const speed = Math.hypot(velocity && velocity.x || 0, velocity && velocity.z || 0);
  if (speed > BRAKE_HOLD_WU_S) return { ok: false, reason: 'still-moving' };
  if (!model.revealed || !model.fix) return { ok: false, reason: 'no-fix' };
  const elapsed = Number(simTime) - model.armedAt;
  evalReverse(def, model, elapsed);
  if (!model.reversed) return { ok: false, reason: 'decoy-unset' };
  if (!lineToStolenIsBlocked(def, model, elapsed)) return { ok: false, reason: 'line-open' };
  return arriveOnBody(model, def, player, simTime);
}

export function applyBrake(model, player, velocity, simTime) {
  if (!model || model.resolved || !player) return { ok: false, reason: 'idle' };
  const def = definitionOf(model);
  if (!def) return { ok: false, reason: 'idle' };
  if (def.payoff === 'match') return applyMatch(model, def, player, velocity, simTime);
  if (def.payoff === 'block' || def.payoff === 'decoy') return applyBlock(model, def, player, velocity, simTime);
  if (def.payoff === 'tone') return applyTone(model, def, velocity);
  if (def.payoff === 'spoof') return applySpoof(model, def, velocity);
  if (def.payoff === 'occult') return applyOccult(model, def, player, simTime);
  if (def.payoff !== 'brake') return { ok: false, reason: 'no-brake-payoff' };
  const speed = Math.hypot(velocity && velocity.x || 0, velocity && velocity.z || 0);
  if (speed > BRAKE_HOLD_WU_S) return { ok: false, reason: 'still-moving' };
  if (!model.revealed || !model.fix) return { ok: false, reason: 'no-fix' };
  return arriveOnBody(model, def, player, simTime);
}

function finish(model, def) {
  if (model.resolved) return;
  model.resolved = true;
  const name = String(def.publicName || 'Return').toLowerCase();
  model.receipts.push(`${name.charAt(0).toUpperCase()}${name.slice(1)} investigated. Discovery logged. No duplicate reward.`);
}

// Called only with the production attachment owner and the physical endpoint's
// current pose. No requested destination is ever applied to a body or a prop.
export function observeSpectrumTow(model, propId, pose, player, simTime, latched) {
  if (!model?.liveBound || !model.propPos[propId] || !pose || !player) return { ok: false, reason: 'no-prop' };
  const initial = model.liveDefinition.props.find((p) => p.id === propId)?.pos;
  model.propPos[propId] = { x: pose.x, z: pose.z };
  if (latched && initial && dist2(initial, pose) >= 16) model.towed[propId] = true;
  const def = definitionOf(model), time = Number(simTime);
  if (!model.towed[propId] || !Number.isFinite(time)) return { ok: false, reason: 'not-towed' };
  evalReverse(def, model, time - model.armedAt);
  if (def.payoff === 'tow' && model.revealed && def.towProp === propId) {
    const anchor = bodyPose(def, model, time - model.armedAt);
    if (anchor && dist2(pose, anchor) <= (def.towRadius || PAYOFF_RADIUS_WU)) finish(model, def);
  }
  return { ok: true, resolved: model.resolved === true, reversed: model.reversed === true };
}

export function serializeSpectrum(model) {
  if (!model) return null;
  const tracks = {};
  const keys = Object.keys(model.tracks);
  for (let i = 0; i < keys.length; i++) {
    const track = model.tracks[keys[i]];
    tracks[track.key] = {
      key: track.key,
      sourceId: track.sourceId,
      tone: track.tone,
      chartLabel: track.chartLabel,
      samples: track.samples.map((sample) => ({
        t: sample.t,
        origin: { x: sample.origin.x, z: sample.origin.z },
        player: sample.player ? { x: sample.player.x, z: sample.player.z } : null,
        bearingDeg: sample.bearingDeg,
        apparentDeg: sample.apparentDeg,
        sigmaWu: sample.sigmaWu,
        chirp: sample.chirp,
        motif: sample.motif ? { x: sample.motif.x, z: sample.motif.z } : null,
        via: sample.via,
        extra: sample.extra,
        dwell: sample.dwell === true,
      })),
      gate: track.gate,
      lastBearing: track.lastBearing,
      lastApparent: track.lastApparent,
      lastReason: track.lastReason,
      lastVia: track.lastVia,
      claim: track.claim,
      heardWhileClaimSilent: track.heardWhileClaimSilent === true,
      echo: track.echo === true,
    };
  }
  return {
    schemaVersion: SPECTRUM_SCHEMA,
    caseId: model.caseId,
    origin: model.origin ? { ...model.origin } : null,
    liveBound: model.liveBound === true,
    armedAt: model.armedAt,
    seed: model.seed,
    propPos: model.propPos,
    towed: model.towed,
    tracks,
    nextTrack: model.nextTrack,
    focusKey: model.focusKey,
    manualFocus: model.manualFocus === true,
    reversed: model.reversed === true,
    revealed: model.revealed === true,
    resolved: model.resolved === true,
    identity: model.identity,
    fix: model.fix ? { x: model.fix.x, z: model.fix.z } : null,
    velocity: model.velocity ? { x: model.velocity.x, z: model.velocity.z } : null,
    fixTime: model.fixTime,
    area: model.area,
    lastTime: model.lastTime,
    log: model.log.slice(),
    receipts: model.receipts.slice(),
    flags: { ...model.flags },
  };
}

export function hydrateSpectrum(data) {
  if (!data || data.schemaVersion !== SPECTRUM_SCHEMA || !spectrumCaseById(data.caseId)) return null;
  const model = createSpectrumModel(data.caseId, data.armedAt, data.seed);
  if (!model) return null;
  if (data.liveBound) bindSpectrumWorld(model, data.origin);
  model.propPos = data.propPos || model.propPos;
  model.towed = data.towed || {};
  model.nextTrack = data.nextTrack || 1;
  model.focusKey = data.focusKey || null;
  model.manualFocus = data.manualFocus === true;
  model.reversed = data.reversed === true;
  model.revealed = data.revealed === true;
  model.resolved = data.resolved === true;
  model.identity = data.identity || 'UNRESOLVED';
  model.fix = data.fix ? { x: data.fix.x, z: data.fix.z } : null;
  model.velocity = data.velocity ? { x: data.velocity.x, z: data.velocity.z } : null;
  model.fixTime = data.fixTime;
  model.area = data.area;
  model.lastTime = data.lastTime;
  model.log = Array.isArray(data.log) ? data.log.slice() : [];
  model.receipts = Array.isArray(data.receipts) ? data.receipts.slice() : [];
  model.flags = { contradiction: false, jammed: false, wrong: false, reversed: false, ...(data.flags || {}) };
  const def = definitionOf(model);
  const stored = data.tracks || {};
  const keys = Object.keys(stored);
  for (let i = 0; i < keys.length; i++) {
    const row = stored[keys[i]];
    if (!row || !row.key) continue;
    model.tracks[row.key] = {
      ...row,
      samples: Array.isArray(row.samples) ? row.samples.map((sample) => ({ ...sample })) : [],
      motionClass: 'UNKNOWN',
      contradiction: false,
      area: null,
      estimate: null,
      velocity: null,
      estimateTime: null,
      dwells: 0,
      decoded: null,
    };
    recomputeTrack(def, model.tracks[row.key]);
  }
  return model;
}

export function spectrumReceipts(model) {
  return model && model.receipts ? model.receipts.slice() : [];
}
