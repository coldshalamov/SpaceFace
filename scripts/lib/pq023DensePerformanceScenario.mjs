import assert from 'node:assert/strict';

const DENSE_SOURCE = 'accepted-pq023-dense-representative';
const DENSE_OFFSETS = Object.freeze([[-8, -5], [0, -7], [8, -4], [-7, 6], [3, 5], [9, 7]]);
const CRITICAL_CUES = Object.freeze(['shield.collapse', 'subsystem.disabled', 'tether.break']);
const DENSE_REPEAT_MS = 1_800;

export async function bootPq023DensePerformanceRoute(page, rootUrl, fixedSeed) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate((seed) => {
    window.SF.bus.emit('game:new', { name: 'PQ-023 H3 Dense Cue Performance', seed });
  }, fixedSeed);
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight'
      && sf.state.ui?.docked !== true
      && player?.mesh
      && String(player.mesh.userData?.authoredAssetState || '').startsWith('authored')
      && !!sf?.registry?.get?.('vfx')?._scene
      && !!sf?.registry?.get?.('presentationOrchestrator')?._emitCue;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(800);
  return page.evaluate(() => ({
    recordedSeed: window.SF?.state?.meta?.seed ?? null,
    sectorId: window.SF?.state?.world?.currentSectorId || null,
  }));
}

export async function installPq023DensePerformanceScenario(page) {
  return page.evaluate(({ denseSource, denseOffsets, criticalCues, denseRepeatMs }) => {
    const sf = window.SF;
    const state = sf?.state;
    const player = state?.entities?.get(state.playerId);
    const vfx = sf?.registry?.get?.('vfx');
    const weapons = sf?.registry?.get?.('weapons');
    const orchestrator = sf?.registry?.get?.('presentationOrchestrator');
    const fittedWeapon = player?.data?.weapons?.find((weapon) => weapon && weapon.slotIndex === 0)
      || player?.data?.weapons?.[0];
    const parent = player?.mesh?.parent || vfx?._scene;
    if (!state || !player?.mesh || !vfx || !weapons || !orchestrator?._emitCue
        || !fittedWeapon || !parent) {
      throw new Error('PQ-023 H3 requires authored player, VFX, weapons, cue owner, and render scene');
    }

    const direction = weapons._hardpointDir(player, fittedWeapon, player.rot, 0);
    const forward = { x: Math.cos(direction), z: Math.sin(direction) };
    const muzzle = weapons._muzzle(player, fittedWeapon, direction);
    const targetRadius = Math.max(2, Number(player.radius) || 14);
    const targetCenter = {
      x: muzzle.x + forward.x * 31.5,
      z: muzzle.z + forward.z * 31.5,
    };
    const targetContact = {
      x: targetCenter.x - forward.x * (targetRadius + 0.4),
      z: targetCenter.z - forward.z * (targetRadius + 0.4),
    };

    sf.bus.emit('camera:zoom', { level: 88 });
    const previous = window.__PQ023_H3__;
    previous?.dispose?.();
    const oldTarget = window.__PQ023_H3_TARGET__;
    if (oldTarget?.parent) oldTarget.parent.remove(oldTarget);
    const target = player.mesh.clone(true);
    const local = vfx._toLocalXZ(targetCenter.x, targetCenter.z, { x: 0, z: 0 });
    target.name = 'SF_PQ023_H3_Accepted_Dense_Target';
    target.position.set(local.x, player.mesh.position.y, local.z);
    target.rotation.copy(player.mesh.rotation);
    target.rotation.y += Math.PI;
    target.scale.copy(player.mesh.scale);
    target.traverse((node) => {
      node.userData = { ...(node.userData || {}), pq023H3DenseTarget: true };
    });
    parent.add(target);
    window.__PQ023_H3_TARGET__ = target;

    const spatialContract = {
      provenance: 'accepted H1 live hardpoint and cloned authored target route',
      sourceEntityId: player.id,
      fittedWeaponId: fittedWeapon.defId,
      hardpointIdx: fittedWeapon.slotIndex,
      direction,
      forward,
      muzzle: { x: muzzle.x, y: 0.25, z: muzzle.z },
      targetCenter,
      targetContact: { x: targetContact.x, y: 0.25, z: targetContact.z },
      pathLength: Math.hypot(targetContact.x - muzzle.x, targetContact.z - muzzle.z),
    };

    const emptyPools = () => ({
      particles: 0,
      sprites: 0,
      trailStreaks: 0,
      combatBeams: 0,
      explosions: 0,
    });
    const readPools = () => ({
      particles: Number(vfx._liveCount) || 0,
      sprites: Number(vfx._liveSpriteCount) || 0,
      trailStreaks: Number(vfx._liveTrailStreakCount) || 0,
      combatBeams: Number(vfx._combatBeams?.activeCount) || 0,
      explosions: Number(vfx._explosions?.activeCount) || 0,
    });
    const readCapacities = () => ({
      particles: Number(vfx._cap) || 0,
      sprites: Number(vfx._spriteBatches?.capacity) || 0,
      trailStreaks: Number(vfx._ts?.length) || 0,
      combatBeams: Number(vfx._combatBeams?.maxBeams) || 0,
      explosions: Number(vfx._explosions?.capacity) || 0,
    });
    const resetPools = () => {
      vfx._combatBeams?.clear();
      vfx._explosions?.clear();
      while (vfx._liveTrailStreakCount > 0) vfx._retireTrailStreak(vfx._activeTrailStreaks[0]);
      while (vfx._liveSpriteCount > 0) vfx._retireSprite(vfx._activeSprites[0]);
      while (vfx._liveCount > 0) vfx._retireParticle(vfx._activeParticles[0]);
      vfx._integrateParticles(0);
      vfx._integrateSprites(0);
      vfx._commitTrailStreakInstances();
      vfx._decayEventLights?.(999);
    };
    const newTrace = (mode) => ({
      mode,
      active: false,
      source: null,
      pulseCount: 0,
      beamRefreshCount: 0,
      criticalAttempted: 0,
      criticalEmitted: 0,
      criticalSuppressed: 0,
      flavorAttempted: 0,
      flavorSuppressed: 0,
      peakPools: emptyPools(),
    });

    const harness = {
      source: denseSource,
      spatialContract,
      capacities: readCapacities(),
      trace: newTrace('idle'),
      preflight: null,
      burstTimer: null,
      beamTimer: null,
      monitorFrame: null,
      disposed: false,
      updatePeak() {
        const pools = readPools();
        for (const key of Object.keys(pools)) {
          this.trace.peakPools[key] = Math.max(this.trace.peakPools[key], pools[key]);
        }
      },
      resetTrace(mode) {
        this.trace = newTrace(mode);
      },
      stopTimers() {
        if (this.burstTimer != null) clearInterval(this.burstTimer);
        if (this.beamTimer != null) clearInterval(this.beamTimer);
        this.burstTimer = null;
        this.beamTimer = null;
      },
      refreshBeam() {
        const beamReceipt = {
          weaponId: 'wpn_beam_laser_m',
          ownerId: spatialContract.sourceEntityId,
          hardpointIdx: spatialContract.hardpointIdx,
          beamKey: 'pq023-h3-dense-beam',
          continuous: true,
          phase: 'update',
          origin: spatialContract.muzzle,
          from: spatialContract.muzzle,
          to: spatialContract.targetContact,
          dir: spatialContract.forward,
        };
        vfx._onFire(beamReceipt);
        this.trace.beamRefreshCount += 1;
        this.updatePeak();
      },
      pulse() {
        const serial = this.trace.pulseCount;
        this.trace.pulseCount += 1;
        const tick = state.tick;
        for (let index = 0; index < 10; index += 1) {
          const cueId = index % 2 === 0 ? 'combat.damage.applied' : 'combat.near_miss';
          const emitted = orchestrator._emitCue(cueId, {
            attackerId: spatialContract.sourceEntityId,
            targetId: state.playerId,
            applied: 4 + index,
            position: spatialContract.targetCenter,
          }, {
            sourceEvent: 'pq023:h3:dense:flavor',
            sequence: `p${serial}-t${tick}-f${index}`,
          });
          this.trace.flavorAttempted += 1;
          if (!emitted) this.trace.flavorSuppressed += 1;
        }
        for (const cueId of criticalCues) {
          const emitted = orchestrator._emitCue(cueId, {
            attackerId: spatialContract.sourceEntityId,
            targetId: state.playerId,
            subsystemId: 'drive',
            applied: 40,
            position: spatialContract.targetCenter,
          }, {
            sourceEvent: 'pq023:h3:dense:critical',
            sequence: `p${serial}-t${tick}-c-${cueId}`,
          });
          this.trace.criticalAttempted += 1;
          if (emitted) this.trace.criticalEmitted += 1;
          else this.trace.criticalSuppressed += 1;
        }
        for (let index = 0; index < denseOffsets.length; index += 1) {
          const [offsetX, offsetZ] = denseOffsets[index];
          vfx._queueExplosion({
            pos: { x: targetCenter.x + offsetX, z: targetCenter.z + offsetZ },
            radius: index % 3 === 0 ? 8 : 4,
            direction: { x: 0.8, z: index % 2 ? -0.6 : 0.6 },
            type: index % 3 === 0 ? 'ship' : 'small-object',
          }, index % 3 === 0 ? 'ordinary' : 'small');
        }
        vfx._onDamage({
          weaponId: 'wpn_beam_laser_m',
          attackerId: spatialContract.sourceEntityId,
          targetId: 'pq023-h3-target',
          pos: spatialContract.targetContact,
          approach: spatialContract.forward,
          normal: { x: -spatialContract.forward.x, z: -spatialContract.forward.z },
          hullHit: true,
          amount: 5,
        });
        this.refreshBeam();
        this.updatePeak();
      },
      prewarmDense() {
        this.stopTimers();
        resetPools();
        this.resetTrace('preflight');
        this.trace.active = true;
        this.trace.source = denseSource;
        vfx._explosions._serial = 5105;
        this.pulse();
      },
      finishPrewarm() {
        const trace = structuredClone(this.trace);
        this.trace.active = false;
        resetPools();
        this.preflight = {
          denseSurfacesWarmed: true,
          pulseCount: trace.pulseCount,
          peakPools: trace.peakPools,
          cleanupPools: readPools(),
          poolCapacities: readCapacities(),
        };
        this.resetTrace('prewarmed');
        return structuredClone(this.preflight);
      },
      beginFloor() {
        this.stopTimers();
        resetPools();
        this.resetTrace('floor');
        this.updatePeak();
      },
      startDense() {
        this.stopTimers();
        resetPools();
        this.resetTrace('target');
        this.trace.active = true;
        this.trace.source = denseSource;
        vfx._explosions._serial = 5105;
        this.pulse();
        this.burstTimer = setInterval(() => this.pulse(), denseRepeatMs);
        this.beamTimer = setInterval(() => this.refreshBeam(), 80);
      },
      stopDense() {
        this.stopTimers();
        this.trace.active = false;
        resetPools();
      },
      snapshot(profileId, repetition, pairId) {
        this.updatePeak();
        const playerMesh = player.mesh || player.view?.root || null;
        const rawAssetState = playerMesh?.userData?.authoredAssetState || null;
        return {
          profileId,
          repetition,
          pairId,
          recordedSeed: state.meta?.seed ?? null,
          sectorId: state.world?.currentSectorId || null,
          mode: state.mode || null,
          docked: state.ui?.docked === true,
          playerControlExposed: state.mode === 'flight' && state.ui?.docked !== true,
          player: {
            entityId: player.id,
            admission: String(rawAssetState).startsWith('authored') ? 'ready' : null,
            assetState: String(rawAssetState).startsWith('authored') ? 'authored' : rawAssetState,
          },
          pose: {
            x: Number(player.pos?.x),
            z: Number(player.pos?.z),
            rot: Number(player.rot) || 0,
            cameraZoom: Number(state.camera?.zoom) || null,
            selectedTargetId: state.targetId ?? state.ui?.targetId ?? state.combat?.targetId ?? null,
          },
          spatialContract: {
            sourceEntityId: spatialContract.sourceEntityId,
            fittedWeaponId: spatialContract.fittedWeaponId,
            pathLength: spatialContract.pathLength,
          },
          poolCapacities: readCapacities(),
          livePools: readPools(),
          dense: structuredClone(this.trace),
        };
      },
      cleanup() {
        this.stopTimers();
        this.trace.active = false;
        resetPools();
        if (target.parent) target.parent.remove(target);
        window.__PQ023_H3_TARGET__ = null;
        this.disposed = true;
        if (this.monitorFrame != null) cancelAnimationFrame(this.monitorFrame);
        this.monitorFrame = null;
        return {
          driverStopped: this.burstTimer == null && this.beamTimer == null,
          targetRemoved: !target.parent,
          livePools: readPools(),
          poolCapacities: readCapacities(),
        };
      },
      dispose() {
        return this.cleanup();
      },
    };

    const monitor = () => {
      if (harness.disposed) return;
      harness.updatePeak();
      harness.monitorFrame = requestAnimationFrame(monitor);
    };
    harness.monitorFrame = requestAnimationFrame(monitor);
    window.__PQ023_H3__ = harness;
    return { spatialContract, poolCapacities: harness.capacities };
  }, {
    denseSource: DENSE_SOURCE,
    denseOffsets: DENSE_OFFSETS,
    criticalCues: CRITICAL_CUES,
    denseRepeatMs: DENSE_REPEAT_MS,
  });
}

export async function prewarmPq023DenseScenario(page) {
  await page.evaluate(() => window.__PQ023_H3__.prewarmDense());
  await page.waitForFunction(() => {
    const trace = window.__PQ023_H3__?.trace;
    return trace?.mode === 'preflight'
      && trace.pulseCount === 1
      && trace.peakPools?.particles >= 50
      && trace.peakPools?.sprites >= 62
      && trace.peakPools?.trailStreaks >= 31
      && trace.peakPools?.combatBeams >= 1
      && trace.peakPools?.explosions >= 6;
  }, null, { timeout: 30_000 });
  // The ordinary lifecycle is 1.42 s; cover it once so every phased surface reaches the renderer
  // before either measured arm starts, then explicitly empty the owned pools.
  await page.waitForTimeout(1_600);
  const preflight = await page.evaluate(() => window.__PQ023_H3__.finishPrewarm());
  await page.waitForTimeout(250);
  return preflight;
}

export async function beginPq023Floor(page) {
  await page.evaluate(() => window.__PQ023_H3__.beginFloor());
  await page.waitForTimeout(250);
}

export async function startPq023DenseTarget(page) {
  await page.evaluate(() => window.__PQ023_H3__.startDense());
  await page.waitForFunction(() => {
    const trace = window.__PQ023_H3__?.trace;
    return trace?.active === true
      && trace.pulseCount >= 2
      && trace.beamRefreshCount >= 8
      && trace.criticalSuppressed === 0
      && trace.flavorSuppressed > 0
      && trace.peakPools?.particles >= 50
      && trace.peakPools?.sprites >= 62
      && trace.peakPools?.trailStreaks >= 31
      && trace.peakPools?.combatBeams >= 1
      && trace.peakPools?.explosions >= 6;
  }, null, { timeout: 30_000 });
}

export async function readPq023DensePerformanceFacts(page, { profileId, repetition, pairId }) {
  return page.evaluate((input) => (
    window.__PQ023_H3__.snapshot(input.profileId, input.repetition, input.pairId)
  ), { profileId, repetition, pairId });
}

export async function cleanupPq023DensePerformanceScenario(page) {
  return page.evaluate(() => window.__PQ023_H3__.cleanup());
}

export async function readPq023GpuContract(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug
        ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
        : String(gl.getParameter(gl.VENDOR)),
      renderer: debug
        ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

export async function attachPq023SeparatedGpuAttribution(page, timingWindow) {
  const gpuCapture = await page.evaluate(async ({ requiredFrames }) => {
    const state = window.SF?.state;
    const timers = state?.render?.gpuTimers;
    assertCapability(timers);
    const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settingsSlice = () => JSON.stringify({
      video: state?.settings?.video || null,
      dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : null,
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
    });
    const routeSlice = () => JSON.stringify({
      mode: state?.mode || null,
      docked: state?.ui?.docked === true,
      sectorId: state?.world?.currentSectorId || null,
      visibility: document.visibilityState,
      denseActive: window.__PQ023_H3__?.trace?.active === true,
    });
    const settingsStart = settingsSlice();
    const routeStart = routeSlice();
    const startedAt = performance.now();
    let frameCount = 0;
    let drain = null;
    let report = null;
    try {
      timers.reset();
      timers.setEnabled(true);
      while (frameCount < requiredFrames) {
        await raf();
        frameCount += 1;
      }
      drain = await timers.drainPending({
        maxPolls: 120,
        timeoutMs: 2_000,
        yieldFn: raf,
      });
      report = timers.getReport();
    } finally {
      timers.setEnabled(false);
    }
    return {
      frameCount,
      durationMs: performance.now() - startedAt,
      settingsStable: settingsSlice() === settingsStart,
      routeStable: routeSlice() === routeStart,
      gpuTimers: {
        available: report?.available === true,
        status: report?.status || (report?.available ? 'available' : 'unavailable'),
        reason: report?.reason || null,
        extension: report?.extension || null,
        enabled: report?.enabled === true,
        lastDisjoint: report?.lastDisjoint === true,
        pending: report?.pending,
        lastInvalidation: report?.lastInvalidation || null,
        queryCounts: report?.queryCounts || null,
        captureValid: report?.captureValid === true,
        drain,
        terminals: report?.terminals || null,
        passes: report?.passes || null,
      },
    };

    function assertCapability(candidate) {
      if (!candidate
          || typeof candidate.reset !== 'function'
          || typeof candidate.setEnabled !== 'function'
          || typeof candidate.drainPending !== 'function'
          || typeof candidate.getReport !== 'function') {
        throw new Error('PQ-023 H3 requires the live GPU timer capability');
      }
    }
  }, { requiredFrames: 150 });

  assert(timingWindow?.attribution, 'timing window attribution is required');
  timingWindow.attribution.gpuTimers = gpuCapture.gpuTimers;
  timingWindow.attribution.measurementIsolation = {
    frameTimingGpuTimersEnabled: false,
    gpuAttributionSeparated: true,
    gpuAttributionFrameCount: gpuCapture.frameCount,
    gpuAttributionDurationMs: gpuCapture.durationMs,
    settingsStable: gpuCapture.settingsStable,
    routeStable: gpuCapture.routeStable,
  };
}

async function dismissTutorial(page) {
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
}

export { DENSE_SOURCE as PQ023_H3_DENSE_SOURCE };
