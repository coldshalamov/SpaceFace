// Docking corridor system (PQ-008 / SF-08 → F18).
//
// Truthful exterior docking for stations that declare a collisionProxyManifest with a `docking`
// block (today: Helios trade hub). The manifest owns the geometry; this system owns the runtime:
//
//   1. Classifies the player against the corridor/capture volumes each tick (pure math from the
//      manifest module — speed/heading gates, berth proximity).
//   2. Inside the capture volume, applies a BOUNDED PD capture assist toward the berth through the
//      physics-command membrane (queuePhysicsImpulse). Never a teleport, never a direct velocity
//      write, never control seizure: the assist is an additive, clamped impulse that fades as the
//      pilot's own input grows (player input always blends), and it is exactly zero at the berth.
//   3. Publishes a readout (state.dockingCorridor) for HUD/debug consumers, plus the sim-side
//      proxy geometry on state.physicsRuntime.collisionProxies — the debug-overlay data seam.
//      Renderer-lease paths are untouched (STEP 7 forbidden list); a render-side overlay consumes
//      this surface in the integration step.
//
// Determinism: no rng, no wall time. Golden-safety: this system is NOT in the sf-sim curated
// harness list, so the 47a golden never executes it; stations without a manifest are skipped and
// legacy radius docking is untouched (physics.updateDockRange owns the dock:range gate).

import {
  computeCaptureAssist,
  corridorStateFor,
  effectiveCorridorBearingDeg,
  proxyWorldPrimitives,
  resolveBerthWorld,
  resolveCollisionProxyManifest,
} from '../data/collisionProxyManifests.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export const DOCKING_CORRIDOR_SCHEMA_VERSION = 1;

export const dockingCorridor = {
  name: 'dockingCorridor',

  init(ctx) {
    this.bus = ctx && ctx.bus || null;
    // Cache of static proxy geometry per station entity, keyed with pos/rot/proxy stamp. Geometry
    // only recomputes when the station record actually changes (sector entry), never per frame.
    this._proxyGeometryCache = new Map();
  },

  destroy() {
    if (this._proxyGeometryCache) this._proxyGeometryCache.clear();
  },

  update(dt, state) {
    if (!state || !state.entities) return;
    const player = state.playerId != null ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || state.mode !== 'flight'
      || (player.flags && player.flags.docked) || (state.ui && state.ui.docked === true)) {
      this._publish(state, null, null);
      return;
    }

    // Nearest manifest station wins — only one corridor can reasonably engage at a time.
    const stations = (state.entityIndex && (state.entityIndex.dockStations || state.entityIndex.stations)) || state.entityList || [];
    let best = null;
    for (const station of stations) {
      if (!station || !station.alive || station.type !== 'station') continue;
      const manifest = resolveCollisionProxyManifest(station);
      if (!manifest || !manifest.docking) continue;
      const corridor = corridorStateFor(manifest, station, player.pos, player.vel);
      if (!corridor) continue;
      if (!best || corridor.distCenter < best.corridor.distCenter) best = { station, manifest, corridor };
    }

    // Pilot input magnitude for the assist blend. Read-only over the sim input contract.
    const input = state.input || {};
    const inputMag = Math.max(
      Math.abs(finite(input.moveX)),
      Math.abs(finite(input.moveZ)),
      Math.abs(finite(input.turnIntent)),
      input.brake ? 1 : 0,
    );

    // Bounded PD capture assist through the physics-command membrane. computeCaptureAssist owns
    // the engagement gates (inside the capture volume, speed gate, heading gate) and covers BOTH
    // the capture and berthed phases — gating on phase === 'capture' here would cut the assist
    // exactly when the ship gets close and let it coast into the core deck. The impulse is
    // additive on the membrane: the pilot's own thrust command is never overwritten, only
    // supplemented.
    let assistApplied = null;
    if (best && dt > 0) {
      const assist = computeCaptureAssist(best.manifest, best.station, player.pos, player.vel, inputMag);
      if (assist && (assist.x !== 0 || assist.z !== 0)) {
        const mass = positive(player.physicsBody && player.physicsBody.mass, positive(player.mass, 1));
        queuePhysicsImpulse(player, { x: assist.x * mass * dt, y: 0, z: assist.z * mass * dt });
        assistApplied = { ax: assist.x, az: assist.z };
      }
    }

    this._publish(state, best, assistApplied);
  },

  _publish(state, best, assistApplied) {
    const corridor = best && best.corridor;
    state.dockingCorridor = {
      schemaVersion: DOCKING_CORRIDOR_SCHEMA_VERSION,
      stationId: best ? best.station.data && best.station.data.stationId || null : null,
      proxyId: best ? best.manifest.id : null,
      phase: corridor ? corridor.phase : 'none',
      distToBerth: corridor ? corridor.distToBerth : null,
      distCenter: corridor ? corridor.distCenter : null,
      speed: corridor ? corridor.speed : null,
      headingOk: corridor ? corridor.headingOk : null,
      inCorridor: corridor ? corridor.inCorridor : false,
      inCapture: corridor ? corridor.inCapture : false,
      berthed: corridor ? corridor.berthed : false,
      berth: corridor ? { x: corridor.berth.x, z: corridor.berth.z } : null,
      assist: assistApplied,
    };
    this._publishProxyDiagnostics(state);
  },

  // Sim-side debug publication: proxy primitives, berth, and corridor volumes in world space on
  // the physicsRuntime diagnostics surface. The existing render-side debug overlay seam can draw
  // this without any renderer-lease edits (STEP 7: publish data, reuse the existing drawing seam).
  _publishProxyDiagnostics(state) {
    const runtime = state.physicsRuntime || (state.physicsRuntime = {});
    const stations = (state.entityIndex && (state.entityIndex.dockStations || state.entityIndex.stations)) || state.entityList || [];
    const out = [];
    const seen = new Set();
    for (const station of stations) {
      if (!station || !station.alive || station.type !== 'station') continue;
      const manifest = resolveCollisionProxyManifest(station);
      if (!manifest) continue;
      const data = station.data || {};
      const key = `${data.collisionProxy}|${finite(station.pos && station.pos.x)}|${finite(station.pos && station.pos.z)}|${finite(station.rot)}|${data.corridorBearingDeg}`;
      let entry = this._proxyGeometryCache.get(station.id);
      if (!entry || entry.key !== key) {
        entry = {
          key,
          frozen: Object.freeze({
            entityId: station.id,
            stationId: data.stationId || null,
            proxyId: manifest.id,
            flags: manifest.flags,
            pos: { x: finite(station.pos && station.pos.x), z: finite(station.pos && station.pos.z) },
            rot: finite(station.rot),
            corridorBearingDeg: manifest.docking ? effectiveCorridorBearingDeg(manifest, station) : null,
            berth: manifest.docking ? resolveBerthWorld(station, manifest) : null,
            corridor: manifest.docking ? Object.freeze({
              mouthRadius: manifest.docking.corridor.mouthRadius * (corridorScale(manifest, station)),
              halfWidthDeg: manifest.docking.corridor.halfWidthDeg,
              speedGate: manifest.docking.corridor.speedGate,
              headingGateDeg: manifest.docking.corridor.headingGateDeg,
              captureOuterRadius: manifest.docking.capture.outerRadius * (corridorScale(manifest, station)),
              captureHalfWidth: manifest.docking.capture.halfWidth * (corridorScale(manifest, station)),
              captureSpeedGate: manifest.docking.capture.speedGate,
            }) : null,
            primitives: Object.freeze(proxyWorldPrimitives(station, manifest)),
          }),
        };
        this._proxyGeometryCache.set(station.id, entry);
      }
      seen.add(station.id);
      out.push(entry.frozen);
    }
    for (const id of this._proxyGeometryCache.keys()) {
      if (!seen.has(id)) this._proxyGeometryCache.delete(id);
    }
    runtime.collisionProxies = out;
  },
};

function corridorScale(manifest, station) {
  const data = station && station.data || {};
  const reference = manifest.referenceRadius === 'dockRadius' ? data.dockRadius : null;
  return positive(reference, positive(station && station.radius, 1));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default dockingCorridor;
