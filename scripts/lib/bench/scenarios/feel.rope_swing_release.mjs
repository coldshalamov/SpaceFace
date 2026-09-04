// B7 rope swing & release — stretch, hold, and 5 s retention on the REAL path.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// This module replaces the inline verbBench toy (K=2400, 80 WU, 195 WU/s, 1 ms spring
// integrator). It boots the live rapier-dynamic authority, the combat attachment owner, and
// tetherGameplay in production-relative order. Nothing here integrates a spring, a position, a
// velocity, or a release trajectory. The line constrains; we sample.
//
// Vision: "Swing around a huge asteroid and let go flying." "The rope is a rope."
// This step MEASURES. It does not fix. Unmet / UNMEASURED bars are the result.

import { MASSIVE_ANCHOR_MIN_MASS } from '../../../../src/combat/masslineTargetScoring.js';
import { combat } from '../../../../src/systems/combat.js';
import { tetherGameplay } from '../../../../src/systems/tetherGameplay.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../realPath.mjs';

const PLAYER_HULL_ID = 'ship_kestrel';
const AUTHORED_LENGTH_WU = 100;
const SWING_CRUISE_MULT = 1.5;
const SWING_TICKS = 180;
const COAST_TICKS = 300;
const TETHER_DEF_ID = 'tether_standard';
// Clearly heavier than MASSIVE_ANCHOR_MIN_MASS (1800). Static so the ship swings around it.
const HEAVY_ANCHOR_MASS = 240_000;
const ANCHOR_RADIUS = 28;
const ANCHOR_POS = Object.freeze({ x: 0, z: 0 });
const PLAYER_POS = Object.freeze({ x: AUTHORED_LENGTH_WU, z: 0 });

// Canonical production-relative update order (authoritativeSystemManifest.js):
// actions → flightSlot → physics → combat → tetherGameplay.
const SYSTEMS = Object.freeze(['actions', 'flightV3', 'physics', combat, tetherGameplay]);

export const scenario = {
  id: 'feel.rope_swing_release',
  label: 'B7 Rope Swing & Tangential Speed Retention (REAL PATH)',

  async run(seed) {
    const eventTrace = [];
    const host = await bootRealPath({
      seed,
      systems: [...SYSTEMS],
      hulls: [{
        hullId: PLAYER_HULL_ID,
        pos: { x: PLAYER_POS.x, z: PLAYER_POS.z },
        rot: 0,
        isPlayer: true,
        factionId: 'faction_free',
      }],
    });

    try {
      const player = host.player;
      const anchor = host.spawnObstacle({
        pos: { x: ANCHOR_POS.x, z: ANCHOR_POS.z },
        radius: ANCHOR_RADIUS,
        mass: HEAVY_ANCHOR_MASS,
        inertiaY: 80_000,
        hull: 4000,
        dynamic: false,
        data: {
          benchRealPath: 'heavy-anchor',
          bar: 'B7',
          massiveAnchorMinMass: MASSIVE_ANCHOR_MIN_MASS,
        },
      });

      writeHandsOff(host.state);
      host.step(1);
      host.assertBodies([player], 'feel.rope_swing_release');
      const proof = host.proof();
      if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
        throw new Error(
          `feel.rope_swing_release: real path is not ready (sg02Ready=${proof.sg02Ready}, backend=${proof.backend})`,
        );
      }

      const cruise = readCruiseSpeed(player);
      const cruiseSpeed = cruise.cruiseSpeed;
      const setupTangential = cruiseSpeed * SWING_CRUISE_MULT;
      eventTrace.push({
        tick: host.state.tick | 0,
        type: 'rope_swing:setup',
        data: {
          hullId: PLAYER_HULL_ID,
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          authoredLength: AUTHORED_LENGTH_WU,
          setupTangential,
          anchorId: anchor.id,
          anchorMass: finite(anchor.mass),
          anchorDynamic: false,
          playerId: player.id,
        },
      });

      const kernel = combatKernel(host);
      const physicsPort = combatPhysics(host);
      const ownerProof = ownerLiveness(host, proof);
      if (!kernel || typeof kernel.attachments?.create !== 'function') {
        return unmeasuredResult({
          eventTrace,
          proof,
          ownerProof,
          reason: 'missing attachment owner',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: { anchorMass: finite(anchor.mass), setupTangential },
        });
      }
      if (!physicsPort || typeof physicsPort.getAttachmentTelemetry !== 'function') {
        return unmeasuredResult({
          eventTrace,
          proof,
          ownerProof,
          reason: 'missing SG-02 attachment telemetry',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: { anchorMass: finite(anchor.mass), setupTangential },
        });
      }

      // Setup only: latch a 100 WU line at rest, then give the hull a tangential relative speed.
      // noInterp forces SG-02 to accept a written pose/velocity even when the jump is small.
      player.flags = player.flags || {};
      player.flags.noInterp = true;
      player.pos.x = ANCHOR_POS.x + AUTHORED_LENGTH_WU;
      player.pos.z = ANCHOR_POS.z;
      if (player.prevPos) {
        player.prevPos.x = player.pos.x;
        player.prevPos.z = player.pos.z;
      }
      player.vel.x = 0;
      player.vel.z = 0;
      writeHandsOff(host.state);
      host.step(1);

      const created = host.withFeatures(() => kernel.attachments.create({
        defId: TETHER_DEF_ID,
        ownerId: player.id,
        targetId: anchor.id,
        sourceWorld: { x: ANCHOR_POS.x + AUTHORED_LENGTH_WU, y: 0, z: ANCHOR_POS.z },
        targetWorld: { x: ANCHOR_POS.x, y: 0, z: ANCHOR_POS.z },
      }));
      if (!created || created.ok !== true || !created.attachment) {
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: ownerLiveness(host, host.proof()),
          reason: `missing attachment (${(created && created.reason) || 'create_failed'})`,
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: { setupTangential, anchorMass: finite(anchor.mass) },
        });
      }

      const attachmentId = created.attachment.id;
      const authoredLength = Number.isFinite(created.attachment.restLength) && created.attachment.restLength > 0
        ? created.attachment.restLength
        : AUTHORED_LENGTH_WU;
      eventTrace.push({
        tick: host.state.tick | 0,
        type: 'tether:attached',
        data: { attachmentId, authoredLength, defId: TETHER_DEF_ID },
      });

      player.flags = player.flags || {};
      player.flags.noInterp = true;
      player.vel.x = 0;
      player.vel.z = setupTangential;
      writeHandsOff(host.state);
      host.step(1);

      const speedAfterSetup = planarSpeed(player);
      if (!(speedAfterSetup > 0.5 * setupTangential)) {
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: ownerLiveness(host, host.proof()),
          reason: 'initial tangential relative speed was not established',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: {
            setupTangential,
            speedAfterSetup,
            authoredLength,
            attachmentId,
            anchorMass: finite(anchor.mass),
          },
        });
      }

      const life = {
        broken: false,
        cut: false,
        released: false,
        physicsBroken: false,
      };
      host.bus.on('tether:broken', () => { life.broken = true; });
      host.bus.on('tether:cut', () => { life.cut = true; });
      host.bus.on('tether:released', () => { life.released = true; });
      host.bus.on('physics:attachmentBroken', (payload) => {
        if (payload && payload.attachmentId === attachmentId) life.physicsBroken = true;
      });

      let peakDistance = 0;
      let tensionSamples = 0;
      let tetherMirrorTicks = 0;
      let sg02AttachmentsMax = 0;
      let premature = false;
      let firstLoadedTick = null;

      const sampleLine = () => {
        const telemetry = physicsPort.getAttachmentTelemetry({
          attachmentId,
          physicsHandle: created.attachment.physicsHandle,
          tick: host.state.tick,
        });
        const attachment = kernel.attachments.get(attachmentId);
        const physicsSys = host.runtime.getSystem('physics');
        const diag = (physicsSys && physicsSys._diag) || {};
        if (Number.isFinite(diag.sg02Attachments)) {
          sg02AttachmentsMax = Math.max(sg02AttachmentsMax, diag.sg02Attachments);
        }
        const mirror = host.state.player && host.state.player.tether;
        if (mirror && mirror.active === true && mirror.attachmentId === attachmentId) tetherMirrorTicks += 1;
        if (!attachment || attachment.state !== 'active') {
          premature = true;
          return { telemetry: null, attachment, active: false };
        }
        if (telemetry && Number.isFinite(telemetry.tension)) {
          tensionSamples += 1;
          if (Number.isFinite(telemetry.distance) && telemetry.distance > peakDistance) {
            peakDistance = telemetry.distance;
          }
          if (firstLoadedTick == null && telemetry.phase && telemetry.phase !== 'slack') {
            firstLoadedTick = host.state.tick | 0;
          }
        } else if (telemetry && Number.isFinite(telemetry.distance)) {
          tensionSamples += 1;
          if (telemetry.distance > peakDistance) peakDistance = telemetry.distance;
        }
        return { telemetry, attachment, active: true };
      };

      writeHandsOff(host.state);
      host.step(SWING_TICKS, {
        before: ({ state }) => { writeHandsOff(state); },
        after: () => {
          const snap = sampleLine();
          if (!snap.active) return false;
          return true;
        },
      });

      const liveProof = ownerLiveness(host, host.proof());
      liveProof.tetherMirrorTicks = tetherMirrorTicks;
      liveProof.sg02AttachmentsMax = sg02AttachmentsMax;
      liveProof.tensionSamples = tensionSamples;
      liveProof.attachmentId = attachmentId;

      if (tensionSamples < 1) {
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: liveProof,
          reason: 'no tension samples',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: {
            authoredLength,
            setupTangential,
            speedAfterSetup,
            attachmentId,
            anchorMass: finite(anchor.mass),
          },
        });
      }

      if (premature || life.broken || life.physicsBroken) {
        const peakStretch = authoredLength > 0 ? Math.max(0, peakDistance - authoredLength) / authoredLength : null;
        eventTrace.push({
          tick: host.state.tick | 0,
          type: 'rope_swing:premature',
          data: { peakDistance, peakStretch, broken: life.broken, physicsBroken: life.physicsBroken },
        });
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: liveProof,
          reason: 'premature disappearance',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: {
            authoredLength,
            maxLength: peakDistance || null,
            maxStretchRatio: peakStretch,
            lineHeld: false,
            setupTangential,
            speedAfterSetup,
            attachmentId,
            anchorMass: finite(anchor.mass),
          },
        });
      }

      const tangBefore = tangentialRelativeSpeed(player, anchor);
      const speedBefore = planarSpeed(player);
      eventTrace.push({
        tick: host.state.tick | 0,
        type: 'rope_swing:pre_release',
        data: { tangentialSpeed: tangBefore, speed: speedBefore, peakDistance, tensionSamples },
      });

      writeHandsOff(host.state, { cut: true });
      host.step(1, {
        before: ({ state }) => { writeHandsOff(state, { cut: true }); },
      });

      const stillAttached = (() => {
        const attachment = kernel.attachments.get(attachmentId);
        return !!(attachment && attachment.state === 'active');
      })();
      if (stillAttached) {
        const cut = host.withFeatures(() => kernel.attachments.cut(attachmentId, player.id, 'tether_cut'));
        if (!cut || cut.ok !== true) {
          return unmeasuredResult({
            eventTrace,
            proof: host.proof(),
            ownerProof: liveProof,
            reason: 'failed release',
            cruiseSpeed,
            cruiseField: cruise.cruiseField,
            extras: {
              authoredLength,
              maxLength: peakDistance || null,
              maxStretchRatio: authoredLength > 0 ? Math.max(0, peakDistance - authoredLength) / authoredLength : null,
              lineHeld: true,
              tangentialSpeedBeforeRelease: tangBefore,
              setupTangential,
              speedAfterSetup,
              attachmentId,
              anchorMass: finite(anchor.mass),
            },
          });
        }
        writeHandsOff(host.state);
        host.step(1);
      }

      const afterAttachment = kernel.attachments.get(attachmentId);
      const released = !afterAttachment || afterAttachment.state !== 'active';
      if (!released) {
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: liveProof,
          reason: 'failed release',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: {
            authoredLength,
            maxLength: peakDistance || null,
            maxStretchRatio: authoredLength > 0 ? Math.max(0, peakDistance - authoredLength) / authoredLength : null,
            lineHeld: true,
            tangentialSpeedBeforeRelease: tangBefore,
            setupTangential,
            speedAfterSetup,
            attachmentId,
            anchorMass: finite(anchor.mass),
          },
        });
      }

      const tangAfter = tangentialRelativeSpeed(player, anchor);
      const speedAfter = planarSpeed(player);
      eventTrace.push({
        tick: host.state.tick | 0,
        type: 'tether:released',
        data: { tangentialSpeed: tangAfter, speed: speedAfter, cut: life.cut, released: life.released },
      });

      const coastSpeeds = [];
      writeHandsOff(host.state);
      host.step(COAST_TICKS, {
        before: ({ state }) => { writeHandsOff(state); },
        after: () => {
          coastSpeeds.push(planarSpeed(player));
        },
      });

      if (coastSpeeds.length < COAST_TICKS) {
        return unmeasuredResult({
          eventTrace,
          proof: host.proof(),
          ownerProof: liveProof,
          reason: 'missing coast samples',
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          extras: {
            authoredLength,
            maxLength: peakDistance || null,
            maxStretchRatio: authoredLength > 0 ? Math.max(0, peakDistance - authoredLength) / authoredLength : null,
            lineHeld: true,
            tangentialSpeedBeforeRelease: tangBefore,
            tangentialSpeedAfterRelease: tangAfter,
            setupTangential,
            speedAfterSetup,
            attachmentId,
            coastSamples: coastSpeeds.length,
            anchorMass: finite(anchor.mass),
          },
        });
      }

      const speedAt5s = coastSpeeds[coastSpeeds.length - 1];
      const peakStretch = authoredLength > 0 ? Math.max(0, peakDistance - authoredLength) / authoredLength : null;
      const retained = tangBefore > 0 ? speedAt5s / tangBefore : null;
      const lineHeld = true;
      const stretchMet = Number.isFinite(peakStretch) && peakStretch < 0.10;
      const heldMet = lineHeld === true;
      const retainedMet = Number.isFinite(retained) && retained >= 0.95;

      eventTrace.push({
        tick: host.state.tick | 0,
        type: 'rope_swing:coast',
        data: { speedAt5s, retained, coastSamples: coastSpeeds.length, peakStretch },
      });

      const finalProof = host.proof();
      const finalOwners = ownerLiveness(host, finalProof);
      finalOwners.tetherMirrorTicks = tetherMirrorTicks;
      finalOwners.sg02AttachmentsMax = sg02AttachmentsMax;
      finalOwners.tensionSamples = tensionSamples;
      finalOwners.tensionOwnerRan = tensionSamples > 0 && sg02AttachmentsMax > 0;
      finalOwners.tetherGameplayRan = tetherMirrorTicks > 0;
      finalOwners.attachmentOwnerRan = true;

      return {
        eventTrace,
        metrics: {
          cruiseSpeed,
          cruiseField: cruise.cruiseField,
          authoredLength,
          maxLength: peakDistance,
          maxStretchRatio: peakStretch,
          lineHeld,
          tangentialSpeedBeforeRelease: tangBefore,
          tangentialSpeedAfterRelease: tangAfter,
          speedBeforeRelease: speedBefore,
          speedAfterRelease: speedAfter,
          speedAt5s,
          speedRetainedFraction: retained,
          setupTangential,
          speedAfterSetup,
          swingCruiseMult: SWING_CRUISE_MULT,
          hullId: PLAYER_HULL_ID,
          anchorMass: finite(anchor.mass),
          anchorId: anchor.id,
          attachmentId,
          tensionSamples,
          coastSamples: coastSpeeds.length,
          firstLoadedTick,
          dt: REAL_PATH_DT,
          realPath: finalProof,
          owners: finalOwners,
          barMet: stretchMet && heldMet && retainedMet,
          bars: [
            {
              bar: 'B7',
              label: 'peak stretch on a 100 WU line at 1.5x cruise',
              value: peakStretch,
              unit: 'fraction',
              met: stretchMet,
              note: `authored ${authoredLength} WU; peak line ${peakDistance.toFixed(3)} WU`,
            },
            {
              bar: 'B7',
              label: 'line held until commanded release',
              value: lineHeld ? 1 : 0,
              unit: 'bool',
              met: heldMet,
            },
            {
              bar: 'B7',
              label: 'tangential speed kept 5 s after release',
              value: retained,
              unit: 'fraction',
              met: retainedMet,
              note: `before ${tangBefore.toFixed(2)} WU/s; 5 s ${speedAt5s.toFixed(2)} WU/s`,
            },
          ],
        },
      };
    } finally {
      host.dispose();
    }
  },
};

function unmeasuredResult({
  eventTrace,
  proof,
  ownerProof,
  reason,
  cruiseSpeed = null,
  cruiseField = 'unresolved',
  extras = {},
}) {
  eventTrace.push({
    tick: 0,
    type: 'rope_swing:unmeasured',
    data: { reason, ...extras },
  });
  return {
    eventTrace,
    metrics: {
      cruiseSpeed,
      cruiseField,
      authoredLength: extras.authoredLength != null ? extras.authoredLength : AUTHORED_LENGTH_WU,
      maxLength: extras.maxLength != null ? extras.maxLength : null,
      maxStretchRatio: extras.maxStretchRatio != null ? extras.maxStretchRatio : null,
      lineHeld: extras.lineHeld != null ? extras.lineHeld : null,
      tangentialSpeedBeforeRelease: extras.tangentialSpeedBeforeRelease != null
        ? extras.tangentialSpeedBeforeRelease
        : null,
      tangentialSpeedAfterRelease: extras.tangentialSpeedAfterRelease != null
        ? extras.tangentialSpeedAfterRelease
        : null,
      speedAt5s: null,
      speedRetainedFraction: extras.speedRetainedFraction != null ? extras.speedRetainedFraction : null,
      setupTangential: extras.setupTangential != null ? extras.setupTangential : null,
      speedAfterSetup: extras.speedAfterSetup != null ? extras.speedAfterSetup : null,
      hullId: PLAYER_HULL_ID,
      anchorMass: extras.anchorMass != null ? extras.anchorMass : HEAVY_ANCHOR_MASS,
      attachmentId: extras.attachmentId || null,
      tensionSamples: extras.tensionSamples != null ? extras.tensionSamples : 0,
      coastSamples: extras.coastSamples != null ? extras.coastSamples : 0,
      dt: REAL_PATH_DT,
      realPath: proof,
      owners: ownerProof,
      unmeasured: true,
      unmeasuredReason: reason,
      barMet: false,
      bars: [
        unmeasuredBar('peak stretch on a 100 WU line at 1.5x cruise', 'fraction', reason),
        unmeasuredBar('line held until commanded release', 'bool', reason),
        unmeasuredBar('tangential speed kept 5 s after release', 'fraction', reason),
      ],
    },
  };
}

function unmeasuredBar(label, unit, reason) {
  return {
    bar: 'B7',
    label,
    value: null,
    unit,
    met: false,
    unmeasured: true,
    note: `UNMEASURED — ${reason}`,
  };
}

function combatKernel(host) {
  const actions = host.runtime.getSystem('actions');
  if (actions && actions.kernel) return actions.kernel;
  const combatSys = host.runtime.getSystem('combat');
  return combatSys && combatSys.kernel ? combatSys.kernel : null;
}

function combatPhysics(host) {
  const helpers = host.runtime.getHelpers && host.runtime.getHelpers();
  if (helpers && helpers.combatPhysics) return helpers.combatPhysics;
  const physicsSys = host.runtime.getSystem('physics');
  return physicsSys && physicsSys._sg02CombatPhysics ? physicsSys._sg02CombatPhysics : null;
}

function ownerLiveness(host, proof) {
  const physicsSys = host.runtime.getSystem('physics');
  const diag = (physicsSys && physicsSys._diag) || {};
  const tetherSys = host.runtime.getSystem('tetherGameplay');
  const combatSys = host.runtime.getSystem('combat');
  const actionsSys = host.runtime.getSystem('actions');
  const mirror = host.state.player && host.state.player.tether;
  return {
    sg02Ready: proof && proof.sg02Ready === true,
    backend: proof && proof.backend,
    sg02Attachments: Number.isFinite(diag.sg02Attachments) ? diag.sg02Attachments : 0,
    actionsSystem: !!(actionsSys && actionsSys.kernel),
    combatSystem: !!(combatSys && combatSys.kernel),
    tetherGameplaySystem: !!tetherSys,
    tetherMirrorActive: !!(mirror && mirror.active),
    tetherMirrorAttachmentId: (mirror && mirror.attachmentId) || null,
  };
}

function writeHandsOff(state, extra = {}) {
  writeRealPathInput(state, { moveX: 0, moveZ: 0, brake: false, boost: false });
  if (!state.input.actions) state.input.actions = {};
  state.input.actions.tetherFire = false;
  if (extra.cut) {
    state.input.actions.massline = { cut: true };
    state.input.actions.tetherCut = true;
  } else {
    if (state.input.actions.massline) state.input.actions.massline.cut = false;
    else state.input.actions.massline = { cut: false };
    state.input.actions.tetherCut = false;
  }
}

function readCruiseSpeed(entity) {
  const derived = entity && entity.data && entity.data.derived;
  const fromDerived = derived && derived.propulsion && derived.propulsion.combatSpeed;
  if (Number.isFinite(fromDerived) && fromDerived > 0) {
    return { cruiseSpeed: fromDerived, cruiseField: 'data.derived.propulsion.combatSpeed' };
  }
  const fromEntity = entity && entity.propulsion && entity.propulsion.combatSpeed;
  if (Number.isFinite(fromEntity) && fromEntity > 0) {
    return { cruiseSpeed: fromEntity, cruiseField: 'propulsion.combatSpeed' };
  }
  return { cruiseSpeed: 0, cruiseField: 'unresolved' };
}

function planarSpeed(entity) {
  return Math.hypot(finite(entity && entity.vel && entity.vel.x), finite(entity && entity.vel && entity.vel.z));
}

function tangentialRelativeSpeed(ship, anchor) {
  const dx = finite(ship && ship.pos && ship.pos.x) - finite(anchor && anchor.pos && anchor.pos.x);
  const dz = finite(ship && ship.pos && ship.pos.z) - finite(anchor && anchor.pos && anchor.pos.z);
  const dist = Math.hypot(dx, dz);
  const rx = dist > 1e-9 ? dx / dist : 1;
  const rz = dist > 1e-9 ? dz / dist : 0;
  const vx = finite(ship && ship.vel && ship.vel.x) - finite(anchor && anchor.vel && anchor.vel.x);
  const vz = finite(ship && ship.vel && ship.vel.z) - finite(anchor && anchor.vel && anchor.vel.z);
  const radial = vx * rx + vz * rz;
  const tx = vx - radial * rx;
  const tz = vz - radial * rz;
  return Math.hypot(tx, tz);
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
