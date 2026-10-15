// Probe-only observer: browser callbacks, successful world submissions and simulation are
// separate clocks. Three's info.render.frame includes warm-up and post-processing draws.
export function installGameCadenceProbe() {
  window.__SF_GAME_CADENCE__?.stop?.();
  const sf = window.SF;
  const render = sf?.registry?.get?.('render') || sf?.render || sf?.state?.render;
  const owner = typeof render?.drawPreparedFrame === 'function' ? render : null;
  const original = owner?.drawPreparedFrame;
  let submissions = 0;
  let motionSubmissions = 0;
  let lastMotionTick = null;
  let lastMotionSim = null;
  let lastMotionSubmit = null;
  const motionSubmissionGaps = [];
  let lastSubmit = null;
  let previous = null;
  let lastSimAdvance = performance.now();
  let frameId = null;
  const rows = [];
  const submissionGaps = [];
  const started = performance.now();
  const actualMesh = {
    eligibleSamples: 0,
    poseChanges: 0,
    identicalPoses: 0,
    missingSamples: 0,
    identityBoundaryResets: 0,
    poseChangeGaps: [],
    staleMs: [],
    identity: null,
    lastPose: null,
    lastPoseChangedAt: null,
  };
  const resetActualMeshPose = () => {
    actualMesh.identity = null;
    actualMesh.lastPose = null;
    actualMesh.lastPoseChangedAt = null;
  };
  const observeActualMesh = (now, st) => {
    if (st?.mode !== 'flight' || !(st.timeScale > 0)) {
      resetActualMeshPose();
      return;
    }
    const playerId = st.playerId;
    const player = st.entities?.get?.(playerId) || null;
    const velocity = player?.vel || player?.velocity || null;
    const speed = velocity
      ? Math.hypot(Number(velocity.x) || 0, Number(velocity.z) || 0)
      : 0;
    if (!(speed >= 20)) {
      actualMesh.lastPose = null;
      actualMesh.lastPoseChangedAt = null;
      return;
    }
    const origin = st.world?.frameOriginSeq;
    const generation = player?.occupantGeneration;
    if (playerId == null || origin == null || generation == null) {
      resetActualMeshPose();
      return;
    }
    const identity = `${playerId}:${origin}:${generation}`;
    if (actualMesh.identity !== null && actualMesh.identity !== identity) {
      actualMesh.identityBoundaryResets++;
      actualMesh.lastPose = null;
      actualMesh.lastPoseChangedAt = null;
    }
    actualMesh.identity = identity;
    const mesh = st.render?.meshes?.get?.(playerId) || null;
    const elements = mesh?.matrixWorld?.elements;
    const finitePose = elements && [elements[12], elements[13], elements[14]].every(Number.isFinite);
    if (!mesh?.visible || !mesh?.parent || !finitePose) {
      actualMesh.missingSamples++;
      actualMesh.lastPose = null;
      actualMesh.lastPoseChangedAt = null;
      return;
    }
    const pose = { x: elements[12], y: elements[13], z: elements[14] };
    actualMesh.eligibleSamples++;
    if (!actualMesh.lastPose) {
      actualMesh.lastPose = pose;
      actualMesh.lastPoseChangedAt = now;
      actualMesh.staleMs.push(0);
      return;
    }
    const stale = actualMesh.lastPoseChangedAt == null
      ? 0
      : Math.max(0, now - actualMesh.lastPoseChangedAt);
    actualMesh.staleMs.push(stale);
    const moved = Math.abs(pose.x - actualMesh.lastPose.x) > 1e-4
      || Math.abs(pose.y - actualMesh.lastPose.y) > 1e-4
      || Math.abs(pose.z - actualMesh.lastPose.z) > 1e-4;
    if (moved) {
      actualMesh.poseChanges++;
      if (actualMesh.lastPoseChangedAt != null) actualMesh.poseChangeGaps.push(stale);
      actualMesh.lastPoseChangedAt = now;
    } else {
      actualMesh.identicalPoses++;
    }
    actualMesh.lastPose = pose;
  };
  const wrapped = function (...args) {
    const result = original.apply(this, args);
    if (result === true) {
      const now = performance.now();
      if (sf.state.mode === 'flight') {
        if (lastSubmit !== null) submissionGaps.push(now - lastSubmit);
        lastSubmit = now;
        submissions++;
        if (sf.state.timeScale > 0
            && (sf.state.tick !== lastMotionTick || sf.state.simTime !== lastMotionSim)) {
          if (lastMotionSubmit !== null) motionSubmissionGaps.push(now - lastMotionSubmit);
          lastMotionSubmit = now;
          lastMotionTick = sf.state.tick;
          lastMotionSim = sf.state.simTime;
          motionSubmissions++;
        }
      }
      observeActualMesh(now, sf.state);
    }
    return result;
  };
  if (owner) owner.drawPreparedFrame = wrapped;
  const sample = (now) => {
    const st = sf.state;
    if (!previous || st.tick !== previous.tick || st.simTime !== previous.sim
        || st.mode !== 'flight' || !(st.timeScale > 0)) lastSimAdvance = performance.now();
    const row = {
      t: now, mode: st.mode, timeScale: st.timeScale,
      sim: st.simTime, tick: st.tick, submissions, motionSubmissions,
      simStaleMs: Math.max(0, performance.now() - lastSimAdvance),
      worldStaleMs: Math.max(0, lastSubmit === null ? performance.now() - started : performance.now() - lastSubmit),
      calls: st.render?.diagnostics?.info?.calls ?? null,
    };
    if (previous) row.gapMs = now - previous.t;
    rows.push(row);
    previous = row;
    frameId = requestAnimationFrame(sample);
  };
  frameId = requestAnimationFrame(sample);
  window.__SF_GAME_CADENCE__ = {
    stop() {
      cancelAnimationFrame(frameId);
      if (owner && owner.drawPreparedFrame === wrapped) owner.drawPreparedFrame = original;
      return { started, ended: performance.now(), submissionObserved: !!owner, rows,
        submissionGaps, motionSubmissionGaps,
        actualMesh: {
          observed: actualMesh.eligibleSamples > 0,
          eligibleSamples: actualMesh.eligibleSamples,
          poseChanges: actualMesh.poseChanges,
          identicalPoses: actualMesh.identicalPoses,
          missingSamples: actualMesh.missingSamples,
          identityBoundaryResets: actualMesh.identityBoundaryResets,
          poseChangeGaps: actualMesh.poseChangeGaps,
          staleMs: actualMesh.staleMs,
          condition: 'successful game draw; flight; timeScale > 0; speed >= 20; finite visible attached player mesh',
        } };
    },
  };
}

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null;
  return {
    count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99),
    max: sorted.at(-1) ?? null, over50: sorted.filter(v => v > 50).length,
    over100: sorted.filter(v => v > 100).length,
  };
}

export function summarizeGameCadence(record) {
  const rows = record.rows || [];
  const first = rows[0];
  const last = rows.at(-1);
  const wallMs = first && last ? last.t - first.t : 0;
  const frames = rows.slice(1).filter(r => r.mode === 'flight' && r.timeScale > 0);
  const activeMs = frames.reduce((sum, r) => sum + (r.gapMs || 0), 0);
  const healthyCallbacksFrozenWorld = frames.filter(r => r.gapMs <= 34 && r.worldStaleMs > 100);
  const healthyCallbacksFrozenSimulation = frames.filter(r => r.gapMs <= 34 && r.simStaleMs > 100);
  const simDelta = first && last ? last.sim - first.sim : 0;
  const submits = first && last ? last.submissions - first.submissions : 0;
  const motionObserved = record.submissionObserved
    && Number.isFinite(first?.motionSubmissions) && Number.isFinite(last?.motionSubmissions);
  const motionSubmits = motionObserved ? last.motionSubmissions - first.motionSubmissions : null;
  const actualMeshObserved = record.actualMesh?.observed === true;
  const actualMeshMissingSamples = record.actualMesh
    && (actualMeshObserved || record.actualMesh.missingSamples > 0)
    ? record.actualMesh.missingSamples : null;
  return {
    schema: 'spaceface.gameCadence.v1', wallMs, activeMs, simDelta,
    simWallRatio: wallMs > 0 ? simDelta * 1000 / wallMs : null,
    submissionObserved: record.submissionObserved,
    browserFps: activeMs > 0 ? frames.length * 1000 / activeMs : null,
    worldSubmitFps: record.submissionObserved && wallMs > 0 ? submits * 1000 / wallMs : null,
    // Counts distinct simulation snapshots submitted; actual mesh motion is summarized separately when observed.
    worldMotionFps: motionObserved && activeMs > 0 ? motionSubmits * 1000 / activeMs : null,
    motionSubmissionGaps: motionObserved ? distribution(record.motionSubmissionGaps || []) : null,
    callbackGaps: distribution(frames.map(r => r.gapMs)),
    submissionGaps: record.submissionObserved ? distribution(record.submissionGaps || []) : null,
    healthyCallbacksFrozenWorld: healthyCallbacksFrozenWorld.length,
    healthyCallbacksFrozenSimulation: healthyCallbacksFrozenSimulation.length,
    maxSimStaleMs: frames.reduce((max, r) => Math.max(max, r.simStaleMs || 0), 0),
    maxWorldStaleMs: frames.length ? Math.max(...frames.map(r => r.worldStaleMs)) : null,
    minDrawCalls: frames.some(r => Number.isFinite(r.calls)) ? Math.min(...frames.map(r => r.calls).filter(Number.isFinite)) : null,
    actualMeshObserved,
    actualMeshStatus: actualMeshObserved ? 'observed' : 'unavailable-no-eligible-samples',
    actualMeshEligibleSamples: actualMeshObserved ? record.actualMesh.eligibleSamples : null,
    actualMeshPoseChanges: actualMeshObserved ? record.actualMesh.poseChanges : null,
    actualMeshIdenticalPoses: actualMeshObserved ? record.actualMesh.identicalPoses : null,
    actualMeshMissingSamples,
    actualMeshIdentityBoundaryResets: record.actualMesh?.identityBoundaryResets ?? null,
    actualMeshPoseChangeGaps: actualMeshObserved
      ? distribution(record.actualMesh.poseChangeGaps || []) : null,
    actualMeshStaleMs: actualMeshObserved
      ? distribution(record.actualMesh.staleMs || []) : null,
    actualMeshCondition: record.actualMesh?.condition ?? null,
    actualMeshEvidenceLayer: 'successful draw CPU mesh pose; display scanout unmeasured',
    // Submission is a CPU-side success, not proof that the display scanned out new pixels.
    evidenceLayer: 'successful-game-submit; display scanout unmeasured',
  };
}
