// SpaceFace — Station, Jump Gate, and Derelict Wreckage dynamic mechanical life.
//
// In an A-list game, world infrastructure is active and mechanical:
//   1. Jump Gate Event Horizon: Counter-rotating containment rings, breathing portal warp vortex,
//      and approach energy spin-up.
//   2. Space Station Mechanisms: Continuous smooth centrifuge/habitation ring rotation, sweeping
//      sensor dishes, and docking bay sequential chase lights.
//   3. Derelict Wrecks: Eerie zero-G dead-drift tumbling, venting decompression micro-puffs, and
//      intermittent electrical short-circuit arc discharges.
//   4. Dock Pulse: berthing is two-sided — the centrifuge eases while the berth seats (and surges
//      on release) with a sub-percent contact thump, matched to the docked station by stationId.
//      Ring rates are size-scaled (ω = √(a/r)) so big stations turn slower for the same gravity.
//
// PURE RENDER-ONLY PRESENTATION: Determinism-safe, zero per-frame allocation.

import { resolveStationSideEventVfxProfile } from './stationSideEventVfx.js';

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

// --- Dock pulse: the station answers the berthing -------------------------------------------
// Berthing is a two-sided event — the ship clunks (shipMicroMotion) and the station breathes.
// On dock the centrifuge eases to quarter speed for ~1.2 s: traffic control holds the ring while
// the berth seats, the way a port holds cranes while a ship makes fast. On undock the ring surges
// briefly as the clamps let go. A sub-percent scale thump/dip carries the mechanical contact
// (transform-only — station materials are shared, so the pulse never touches emissive).
export const DOCK_PULSE_RING_S = 1.2;

/**
 * Ring rate under a dock pulse. Outside the window (or for unknown kinds) the base rate passes
 * through untouched. Pure.
 */
export function resolveDockRingRate(baseRate, kind, ageS) {
  const base = Number(baseRate);
  if (!Number.isFinite(base)) return 0;
  const age = Number(ageS);
  if (!Number.isFinite(age) || age < 0) return base;
  if (kind === 'docked') {
    if (age >= DOCK_PULSE_RING_S) return base;
    // Ease down over 0.25 s, hold, recover by 1.2 s.
    const down = Math.min(1, age / 0.25);
    const up = clamp((age - 0.55) / (DOCK_PULSE_RING_S - 0.55), 0, 1);
    const ease = down * down * (3 - 2 * down);
    const recover = up * up * (3 - 2 * up);
    return base * (1 - 0.75 * ease * (1 - recover));
  }
  if (kind === 'undocked') {
    if (age >= 0.8) return base;
    return base * (1 + 0.6 * Math.exp(-age * 4));
  }
  return base;
}

/** Green pass speeds the rings, amber hold eases them, red refusal nearly stops them. */
export function resolveGateVerdictRingRate(baseRate, kind) {
  const base = Number(baseRate);
  if (!Number.isFinite(base)) return 0;
  if (kind === 'pass' || kind === 'green') return base * 1.65;
  if (kind === 'hold' || kind === 'amber') return base * 0.85;
  if (kind === 'refusal' || kind === 'refuse' || kind === 'red') return base * 0.35;
  return base;
}

/**
 * Dock contact thump: +0.8% swell seating on dock, −0.6% dip releasing on undock. Pure.
 */
export function resolveDockScalePing(kind, ageS) {
  const age = Number(ageS);
  if (!Number.isFinite(age) || age < 0) return 1;
  if (kind === 'docked') {
    if (age >= 0.5) return 1;
    return 1 + 0.008 * Math.sin((age / 0.5) * Math.PI);
  }
  if (kind === 'undocked') {
    if (age >= 0.4) return 1;
    return 1 - 0.006 * Math.sin((age / 0.4) * Math.PI);
  }
  return 1;
}

/**
 * Centrifuge size scaling: ω = √(a/r) — a ring twice the radius spins ~0.7x for the same
 * perceived gravity. Clamped so extremes stay readable. NaN-safe.
 */
export function resolveRingSizeFactor(radius) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r <= 0) return 1;
  return clamp(Math.sqrt(60 / r), 0.4, 1.6);
}

// --- Station work arms (FB-076) ---------------------------------------------------------------
// station:sideEvent is the station's real operating state — while an event is live the matching
// hardware articulates once: reach, hold, settle. Constant decorative spinning was rejected
// (SF-215); nothing here moves without a live event. The kind → articulation mapping lives on
// the VFX profiles in stationSideEventVfx.js — one profile row owns both the light and the arm.
export function resolveStationArmArticulation(kind) {
  const profile = resolveStationSideEventVfxProfile(kind);
  return (profile && profile.arm) || null;
}

// Arm/crane/loader/gantry/boom hardware on the station model — same lazy-scan convention as the
// sensor dishes above: authored kits that name nodes this way articulate for free.
const ARM_NODE_PATTERN = /arm|crane|loader|gantry|clamp|boom/i;

/**
 * The shared reach envelope: swing out over the first fifth, hold on target through the work,
 * settle home by the end. 0..1, NaN-safe. Reduced motion scales amplitude at the caller —
 * the envelope itself, and therefore the reach direction, never changes.
 */
export function resolveStationArmReach(ageS, durationS) {
  const duration = Math.max(0.5, Number.isFinite(durationS) ? durationS : 0.5);
  const progress = clamp((Number(ageS) || 0) / duration, 0, 1);
  const out = clamp(progress / 0.22, 0, 1);
  const back = clamp((progress - 0.74) / 0.26, 0, 1);
  const outE = out * out * (3 - 2 * out);
  const backE = back * back * (3 - 2 * back);
  return outE * (1 - backE);
}

/**
 * Per-event arm pose in deltas off the captured node base. `bearingLocal` is the work site's
 * bearing relative to the station's own yaw, so a reach swings TOWARD the work, a release
 * swings away, and a slide/stroke ride their own axes. Returns {reach01, stroke01, yaw, slide,
 * pitch} — the caller adds them to captured bases; nothing here accumulates.
 */
export function resolveStationArmPose(articulation, ageS, durationS, bearingLocal, reducedMotion) {
  const pose = { reach01: 0, stroke01: 0, yaw: 0, slide: 0, pitch: 0 };
  if (!articulation) return pose;
  const reach = resolveStationArmReach(ageS, durationS);
  const amp = articulation.amplitude * (reducedMotion ? 0.5 : 1);
  const progress = clamp((Number(ageS) || 0) / Math.max(0.5, Number.isFinite(durationS) ? durationS : 0.5), 0, 1);
  pose.reach01 = reach;
  const bearing = Number.isFinite(bearingLocal) ? bearingLocal : 0;
  const toward = clamp(bearing, -1, 1); // radians of swing toward the work site
  if (articulation.duty === 'release-and-return') {
    pose.yaw = -toward * reach * amp * 2 - reach * amp * 0.4; // open the cradle away from the lane
  } else if (articulation.duty === 'slide-track') {
    pose.slide = reach * amp;
  } else if (articulation.duty === 'stroke-and-return') {
    // The loader pumps twice per event: a double stroke on the reach envelope.
    pose.stroke01 = Math.abs(Math.sin(progress * Math.PI * 2)) * reach;
    pose.pitch = pose.stroke01 * amp;
  } else if (articulation.duty === 'sweep') {
    pose.yaw = Math.sin(progress * Math.PI * 2) * reach * amp;
  } else {
    pose.yaw = toward * reach * amp * 2 + reach * amp * 0.4;  // arm reaches toward the berth side
    pose.pitch = reach * amp * 0.25;
  }
  return pose;
}

export function createInfrastructureMotionTracker() {
  const infrastructureStates = new Map();
  // Boundary root → record side index (keyed by boundaryRoot stamps) — batched
  // releases probe it instead of rescanning every record's dish/arm refs.
  const boundaryIndex = new Map();
  let busSubscribers = [];
  let lastSimTime = 0;
  // Latest berthing pulse. dock:docked carries { stationId }; dock:undocked carries {} so the
  // undock pulse reuses the last docked station — berths always release where they seated.
  const dockPulse = { stationId: null, kind: null, t0: -1 };
  const gatePulse = { sectorId: null, kind: null, t0: -1 };
  // FB-076 — one live articulation record per station, keyed off the same stationId the dock
  // pulse uses. start/settle stamps make the record inspectable; the envelope writes the pose.
  const armWork = new Map();

  function onDocked(payload) {
    const stationId = payload && (payload.stationId != null ? payload.stationId : payload.id);
    dockPulse.stationId = stationId != null ? String(stationId) : null;
    dockPulse.kind = 'docked';
    dockPulse.t0 = lastSimTime;
  }

  function onUndocked(payload) {
    const stationId = payload && (payload.stationId != null ? payload.stationId : payload.id);
    if (stationId != null) dockPulse.stationId = String(stationId);
    dockPulse.kind = 'undocked';
    dockPulse.t0 = lastSimTime;
  }

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busSubscribers.push(bus.on('dock:docked', onDocked));
    busSubscribers.push(bus.on('dock:undocked', onUndocked));
    busSubscribers.push(bus.on('gate:verdict', (payload) => {
      if (!payload) return;
      gatePulse.sectorId = payload.sectorId != null ? String(payload.sectorId) : null;
      gatePulse.kind = payload.type || payload.kind || null;
      gatePulse.t0 = lastSimTime;
    }));
    // FB-076 — a side event is the station doing work: arm one articulation record per event.
    busSubscribers.push(bus.on('station:sideEvent', (payload) => {
      if (!payload) return;
      const articulation = resolveStationArmArticulation(payload.kind);
      const stationId = payload.stationId != null ? String(payload.stationId) : null;
      if (!articulation || !stationId) return;
      armWork.set(stationId, {
        kind: payload.kind,
        articulationId: articulation.id,
        eventId: payload.eventId != null ? String(payload.eventId) : null,
        t0: lastSimTime,
        durationS: Number.isFinite(payload.durationS) ? payload.durationS : null,
        bearing: Number.isFinite(payload.bearing) ? payload.bearing : 0,
        startedS: lastSimTime,
        settledS: -1,
      });
    }));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    infrastructureStates.clear();
    dockPulse.stationId = null;
    dockPulse.kind = null;
    dockPulse.t0 = -1;
    gatePulse.sectorId = null;
    gatePulse.kind = null;
    gatePulse.t0 = -1;
    armWork.clear();
  }

  function getState(entityId) {
    let rec = infrastructureStates.get(entityId);
    if (!rec) {
      const h = hashId(entityId);
      const phase = ((h & 0xff) / 255) * Math.PI * 2;
      const driftRate = 0.008 + (((h >> 8) & 0xff) / 255) * 0.018;
      const dishSweepSpeed = 0.4 + (((h >> 16) & 0xff) / 255) * 0.6;

      rec = {
        phase,
        driftRate,
        dishSweepSpeed,
        driftRotX: phase * 0.4,
        driftRotY: phase * 0.7,
        driftRotZ: phase * 0.2,
        portalSwirl: 0,
        portalScale: 1.0,
        portalBase: -1,    // captured lazily — portal/hubGlow bases are R-scaled at build
        hubGlowBase: -1,
        arcTimer: 0,
        arcIntensity: 0,
        arcCount: 0,
        hash: h,
        dishNodes: null,   // lazy [{ node, baseY }] — swept sensor hardware, scanned once
        dishScanned: false,
        armNodes: null,    // lazy [{ node, baseY, baseZ, basePX }] — articulating work hardware
        armScanned: false,
        boundaryRoot: null, // boundary root the scanned refs live under — the release index key
      };
      infrastructureStates.set(entityId, rec);
    }
    return rec;
  }

  function noteBoundaryRoot(rec, mesh) {
    if (rec.boundaryRoot !== mesh) {
      if (rec.boundaryRoot) boundaryIndex.delete(rec.boundaryRoot);
      rec.boundaryRoot = mesh;
      boundaryIndex.set(mesh, rec);
    }
  }

  function dropBoundaryIndex(rec) {
    if (rec && rec.boundaryRoot) {
      boundaryIndex.delete(rec.boundaryRoot);
      rec.boundaryRoot = null;
    }
  }

  function releaseInfrastructureRefs(rec) {
    if (!rec) return;
    dropBoundaryIndex(rec);
    rec.dishNodes = null;
    rec.dishScanned = false;
    rec.armNodes = null;
    rec.armScanned = false;
  }

  function updateGateMotion(entity, mesh, simTime, frameDt, playerEntity, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    noteBoundaryRoot(rec, mesh);
    const reducedMotion = options.motionReduce === true;
    lastSimTime = simTime;

    // Detect player distance for gate activation spin-up
    let approachFactor = 0;
    if (playerEntity && playerEntity.pos && entity.pos) {
      const dx = playerEntity.pos.x - entity.pos.x;
      const dz = playerEntity.pos.z - entity.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 400) {
        approachFactor = Math.max(0, 1 - dist / 400.0);
      }
    }

    const swirlSpeed = (0.7 + approachFactor * 1.8) * (reducedMotion ? 0.3 : 1.0);
    rec.portalSwirl += swirlSpeed * dt;

    // Portal breathing & expansion
    const breath = Math.sin(simTime * 2.2 + rec.phase) * (0.04 + approachFactor * 0.08);
    rec.portalScale = 1.0 + breath;

    // Find and animate gate components. This tracker is the sole transform owner — bases are
    // captured on first contact because build code pre-scales nodes by the structure radius.
    if (mesh.userData) {
      const innerRing = mesh.userData.innerRing;
      const portal = mesh.userData.portal;
      const hubGlow = mesh.userData.hubGlow;
      const lens = mesh.userData.lensMesh;

      if (innerRing) innerRing.rotation.z = rec.portalSwirl * 0.65;
      if (lens) {
        // Counter-rotating shimmer layer: simTime drives the shader's ring drift, the mesh's own
        // swirl parallaxes against the portal disc beneath it.
        lens.rotation.z = rec.portalSwirl * 1.35;
        const lensMat = lens.material;
        if (lensMat && lensMat.uniforms && lensMat.uniforms.uTime) {
          lensMat.uniforms.uTime.value = simTime * (reducedMotion ? 0.25 : 1.0);
        }
      }
      if (portal) {
        if (rec.portalBase < 0) {
          rec.portalBase = (portal.scale && Number.isFinite(portal.scale.x)) ? portal.scale.x : 1;
        }
        portal.rotation.z = -rec.portalSwirl;
        if (portal.scale && typeof portal.scale.setScalar === 'function') {
          portal.scale.setScalar(rec.portalBase * rec.portalScale);
        }
        // The face's internal drift (event-horizon shader) rides the same reduced-motion
        // convention as the lens: the mesh's onBeforeRender multiplies its clock by this.
        // Named motionScale — the cosmetic shader clock is not the sim's audited timeScale.
        const portalMat = portal.material;
        if (portalMat && portalMat.userData && portalMat.uniforms && portalMat.uniforms.uTime) {
          portalMat.userData.motionScale = reducedMotion ? 0.25 : 1.0;
        }
      }
      if (hubGlow) {
        if (rec.hubGlowBase < 0) {
          rec.hubGlowBase = (hubGlow.scale && Number.isFinite(hubGlow.scale.x)) ? hubGlow.scale.x : 1;
        }
        if (hubGlow.scale && typeof hubGlow.scale.setScalar === 'function') {
          hubGlow.scale.setScalar(rec.hubGlowBase * (1.0 + breath * 1.5));
        }
      }
    }
  }

  function updateStationMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    noteBoundaryRoot(rec, mesh);
    const reducedMotion = options.motionReduce === true;
    lastSimTime = simTime;

    // Continuous rotation of habitation rings — per-station rate variety from the id hash,
    // size-scaled so big rings turn slower for the same perceived gravity.
    let ringRate = (0.03 + rec.dishSweepSpeed * 0.04)
      * resolveRingSizeFactor(entity.radius);
    // Berthing pulse for the station being docked at (matched by stationId or entity id).
    let scalePing = 1;
    const data = entity.data || {};
    if (dockPulse.t0 >= 0 && dockPulse.stationId != null && !reducedMotion) {
      const sid = data.stationId != null ? String(data.stationId) : null;
      if (sid === dockPulse.stationId || String(entity.id) === dockPulse.stationId) {
        const age = simTime - dockPulse.t0;
        ringRate = resolveDockRingRate(ringRate, dockPulse.kind, age);
        scalePing = resolveDockScalePing(dockPulse.kind, age);
      }
    }
    if (gatePulse.t0 >= 0 && simTime - gatePulse.t0 < 2 && !reducedMotion) {
      const sectorId = data && data.sectorId != null ? String(data.sectorId) : null;
      if (sectorId && sectorId === gatePulse.sectorId) {
        ringRate = resolveGateVerdictRingRate(ringRate, gatePulse.kind);
      }
    }
    if (!reducedMotion) {
      const ring1 = mesh.userData && mesh.userData.ring1;
      // gapLocked rings carry a real corridor arc aligned to the collision proxy's navigable
      // gap — spinning them would swing the drawn opening away from the collider's opening.
      if (ring1 && !(ring1.userData && ring1.userData.gapLocked)) {
        ring1.rotation.z += ringRate * dt;
      }
      const ring2 = mesh.userData && mesh.userData.ring2;
      if (ring2) {
        ring2.rotation.z -= ringRate * 0.7 * dt;
      } else if (mesh.children) {
        // Fallback: name-matched secondary ring (procedural builds register userData.ring2).
        for (const child of mesh.children) {
          if (child.name && child.name.indexOf('ring2') >= 0) {
            child.rotation.z -= ringRate * 0.7 * dt;
          }
        }
      }
    }

    // Sensor-dish sweep: slow yaw hunting on dish/radar/antenna hardware. Procedural stations
    // have none today; authored station kits that name nodes this way light up for free.
    if (!rec.dishScanned) {
      rec.dishScanned = true;
      if (mesh.children) {
        for (const child of mesh.children) {
          const n = child.name ? child.name.toLowerCase() : '';
          if ((n.indexOf('dish') >= 0 || n.indexOf('radar') >= 0 || n.indexOf('antenna') >= 0)
              && child.rotation) {
            if (!rec.dishNodes) rec.dishNodes = [];
            rec.dishNodes.push({
              node: child,
              baseY: Number.isFinite(child.rotation.y) ? child.rotation.y : 0,
            });
          }
        }
      }
    }
    if (rec.dishNodes) {
      // Dishes keep sweeping through a berthing — they are tracking the arrival, not holding
      // with the ring. Traffic control watches closest exactly when the ring stands down.
      const sweep = reducedMotion ? 0 : Math.sin(simTime * rec.dishSweepSpeed + rec.phase) * 1.2;
      for (let i = 0; i < rec.dishNodes.length; i++) {
        const d = rec.dishNodes[i];
        d.node.rotation.y = d.baseY + sweep;
      }
    }

    // Station work arms (FB-076): a live side event articulates the matching arm/crane/loader/
    // gantry/boom node once — reach, hold, settle — then rests at its captured base. Reduced
    // motion halves amplitude but keeps the reach direction. No event: no motion.
    if (!rec.armScanned) {
      rec.armScanned = true;
      if (mesh.children) {
        for (const child of mesh.children) {
          const n = child.name ? String(child.name) : '';
          if (n && ARM_NODE_PATTERN.test(n) && child.rotation) {
            if (!rec.armNodes) rec.armNodes = [];
            rec.armNodes.push({
              node: child,
              baseY: Number.isFinite(child.rotation.y) ? child.rotation.y : 0,
              baseZ: Number.isFinite(child.rotation.z) ? child.rotation.z : 0,
              basePX: child.position && Number.isFinite(child.position.x) ? child.position.x : 0,
            });
          }
        }
      }
    }
    const armStationId = data.stationId != null ? String(data.stationId) : String(entity.id);
    const work = armWork.get(armStationId) || armWork.get(String(entity.id)) || null;
    if (work && rec.armNodes && rec.armNodes.length) {
      const articulation = resolveStationArmArticulation(work.kind);
      const durationS = work.durationS || 30;
      const age = simTime - work.t0;
      if (age <= durationS && articulation) {
        // The work site's bearing, carried by the event, in the station's own frame.
        const stationRot = Number.isFinite(entity.rot) ? entity.rot : 0;
        const bearingLocal = work.bearing - stationRot;
        const pose = resolveStationArmPose(articulation, age, durationS, bearingLocal, reducedMotion);
        const slideWu = Math.max(2, Math.min(24, (Number(entity.radius) || 10) * 0.3));
        for (const a of rec.armNodes) {
          a.node.rotation.y = a.baseY + pose.yaw;
          a.node.rotation.z = a.baseZ + pose.pitch;
          if (a.node.position && typeof a.node.position.set === 'function') {
            a.node.position.set(a.basePX + pose.slide * slideWu, a.node.position.y, a.node.position.z);
          } else if (a.node.position) {
            a.node.position.x = a.basePX + pose.slide * slideWu;
          }
        }
      } else {
        // Settle: the event ended — arms come home and the record closes out.
        for (const a of rec.armNodes) {
          a.node.rotation.y = a.baseY;
          a.node.rotation.z = a.baseZ;
          if (a.node.position) a.node.position.x = a.basePX;
        }
        work.settledS = simTime;
        armWork.delete(armStationId);
      }
    }

    // Dock contact thump on the root scale (multiplicative off the captured base — the fence
    // never writes scale, so this cannot drift against pose updates).
    if (mesh.scale && (scalePing !== 1 || rec.stationScaleDirty)) {
      if (!Number.isFinite(rec.stationBaseX)) {
        rec.stationBaseX = Number.isFinite(mesh.scale.x) ? mesh.scale.x : 1;
        rec.stationBaseY = Number.isFinite(mesh.scale.y) ? mesh.scale.y : 1;
        rec.stationBaseZ = Number.isFinite(mesh.scale.z) ? mesh.scale.z : 1;
      }
      if (typeof mesh.scale.set === 'function') {
        mesh.scale.set(rec.stationBaseX * scalePing, rec.stationBaseY * scalePing, rec.stationBaseZ * scalePing);
      } else if (typeof mesh.scale.setScalar === 'function') {
        mesh.scale.setScalar(rec.stationBaseX * scalePing);
      }
      // Static-presentation station roots keep matrixAutoUpdate=false (PERF-59): the pulse is a
      // transform write, so compose it here or the walk never sees it.
      if (mesh.matrixAutoUpdate === false) mesh.updateMatrix();
      rec.stationScaleDirty = scalePing !== 1;
    }
  }

  function updateWreckMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    noteBoundaryRoot(rec, mesh);
    const reducedMotion = options.motionReduce === true;
    lastSimTime = simTime;

    // Slow zero-G dead drift: a bounded wobble riding the entity's real yaw. Wrecks now carry an
    // elongated capsule collider aligned with the spine, so the visual may only oscillate around
    // the sim-authored heading — an accumulating tumble would swing the drawn hulk through space
    // the collider doesn't occupy.
    if (!reducedMotion) {
      rec.driftRotX += rec.driftRate * 0.7 * dt;
      rec.driftRotY += rec.driftRate * dt;
      rec.driftRotZ += rec.driftRate * 0.5 * dt;

      // Apply to first child or mesh root
      const body = (mesh.children && mesh.children[0]) || mesh;
      body.rotation.x = Math.sin(rec.driftRotX) * 0.16;
      body.rotation.y = Math.sin(rec.driftRotY) * 0.10;
      body.rotation.z = Math.cos(rec.driftRotZ) * 0.12;
    }

    // Intermittent electrical arc discharge — deterministic schedule from the id hash (each
    // strike advances the mix), and the discharge physically JOLTS the dead hull: a brief
    // asymmetric twitch riding on the drift pose.
    rec.arcTimer -= dt;
    if (rec.arcTimer <= 0) {
      const next = hashId(String(entity.id) + ':' + rec.arcCount);
      rec.arcCount++;
      rec.arcTimer = 1.2 + ((next & 0xff) / 255) * 3.5;
      rec.arcIntensity = 1.0;
    }
    if (rec.arcIntensity > 0) {
      rec.arcIntensity = Math.max(0, rec.arcIntensity - dt * 6.0);
      if (!reducedMotion) {
        const body = (mesh.children && mesh.children[0]) || mesh;
        const jolt = rec.arcIntensity * rec.arcIntensity * 0.028;
        body.rotation.y += Math.sin(simTime * 71.0 + rec.phase) * jolt;
        body.rotation.z += Math.cos(simTime * 83.0 + rec.phase * 1.7) * jolt;
      }
    }
  }

  /** FB-076 — the live articulation record for a station, or null when no work is armed. */
  function stationArmRecord(stationId) {
    return stationId == null ? null : (armWork.get(String(stationId)) || null);
  }

  // Same teardown contract as the other motion trackers: the entity outlives its mesh, so
  // the record drops Object3D references (scanned dish/arm nodes) while keeping motion state.
  function releaseEntityMesh(entityId) {
    releaseInfrastructureRefs(infrastructureStates.get(entityId));
  }

  // Ids recycle across save restore; a record keyed by a reused id can keep dish/arm node
  // references into a retired station mesh — release by mesh identity too. The boundary-root
  // side index keys each record on the root its scanned refs hang under; a missed entry pins
  // the record's refs until the periodic prune — the same outcome an unbatched release gave.
  function releaseMesh(mesh) {
    if (!mesh) return;
    releaseInfrastructureRefs(boundaryIndex.get(mesh));
  }

  // Batched twin of releaseMesh for mass-despawn sweeps: O(pending.size) via
  // the boundary-root index instead of one registry pass per evicted root.
  function releaseMeshSet(meshes) {
    if (!meshes || meshes.size === 0) return;
    for (const mesh of meshes) {
      releaseInfrastructureRefs(boundaryIndex.get(mesh));
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of infrastructureStates.keys()) {
      if (!activeEntityIds.has(id)) {
        dropBoundaryIndex(infrastructureStates.get(id));
        infrastructureStates.delete(id);
      }
    }
  }

  return {
    bindEvents,
    unbindEvents,
    updateGateMotion,
    updateStationMotion,
    updateWreckMotion,
    prune,
    releaseEntityMesh,
    releaseMesh,
    releaseMeshSet,
    stationArmRecord,
  };
}

export const globalInfrastructureMotion = createInfrastructureMotionTracker();
