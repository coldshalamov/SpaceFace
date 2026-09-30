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

/** Bench A/B: production default ON. Far latch skips station corridor walk + publish. */
let DOCKING_CORRIDOR_FAR_QUIET = true;
export function setDockingCorridorFarQuietForBench(enabled) {
  DOCKING_CORRIDOR_FAR_QUIET = enabled !== false;
}
export function getDockingCorridorFarQuietForBench() {
  return DOCKING_CORRIDOR_FAR_QUIET !== false;
}

/** Rescan while latched (0.5 s @ 60 Hz) so a creeping approach still wakes. */
const DOCKING_CORRIDOR_FAR_RESCAN_TICKS = 30;
/** Wake when the player moves this far from the armed pose (WU²). */
const DOCKING_CORRIDOR_FAR_WAKE_MOVE2 = 100 * 100;
/**
 * Far arm radius = max(floor, mouthRadius * scale * mult). Beyond this the corridor
 * readout is approach-only noise — latch skips the station walk + proxy publish.
 * Mouth*4 keeps a comfortable approach band before the latch drops.
 */
const DOCKING_CORRIDOR_FAR_MOUTH_MULT = 4;
const DOCKING_CORRIDOR_FAR_FLOOR_WU = 600;

function publishDockingCorridorQuiet(state, latched) {
  const world = state && state.world;
  if (!world) return;
  const rt = world.dockingCorridorRuntime || (world.dockingCorridorRuntime = {});
  rt.quietLatched = !!latched;
}

export const dockingCorridor = {
  name: 'dockingCorridor',

  init(ctx) {
    this.bus = ctx && ctx.bus || null;
    // Cache of static proxy geometry per station entity, keyed with pos/rot/proxy stamp. Geometry
    // only recomputes when the station record actually changes (sector entry), never per frame.
    this._proxyGeometryCache = new Map();
    // resolveCollisionProxyManifest is deterministic on entity.data.collisionProxy + model truth —
    // memoize per station entity so update() + _publishProxyDiagnostics() stop resolving it twice
    // per tick (a station's collisionProxy id never changes after spawn).
    this._manifestCache = new Map();
    this._farQuiet = null;
    for (const unsub of this._farQuietUnsubs || []) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    this._farQuietUnsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      const clear = () => { this._farQuiet = null; };
      this._farQuietUnsubs = [
        this.bus.on('sector:exit', clear),
        this.bus.on('sector:enter', clear),
        this.bus.on('game:new', clear),
        this.bus.on('save:loaded', clear),
      ];
    }
  },

  destroy() {
    if (this._proxyGeometryCache) this._proxyGeometryCache.clear();
    if (this._manifestCache) this._manifestCache.clear();
    this._farQuiet = null;
    for (const unsub of this._farQuietUnsubs || []) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    this._farQuietUnsubs = [];
  },

  _manifestFor(station) {
    const cache = this._manifestCache;
    if (cache) {
      const key = (station.data && station.data.collisionProxy) || '';
      const hit = cache.get(station.id);
      if (hit && hit.key === key) return hit.manifest;
      const manifest = resolveCollisionProxyManifest(station);
      cache.set(station.id, { key, manifest });
      return manifest;
    }
    return resolveCollisionProxyManifest(station);
  },

  update(dt, state) {
    if (!state || !state.entities) return;
    const player = state.playerId != null ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || state.mode !== 'flight'
      || (player.flags && player.flags.docked) || (state.ui && state.ui.docked === true)) {
      this._farQuiet = null;
      publishDockingCorridorQuiet(state, false);
      this._publish(state, null, null);
      return;
    }

    const tick = state.tick | 0;
    const membership = state.entityIndex && Number.isFinite(state.entityIndex.version)
      ? state.entityIndex.version
      : -1;
    const latchOn = DOCKING_CORRIDOR_FAR_QUIET !== false;
    if (latchOn) {
      const quiet = this._farQuiet;
      if (quiet
        && quiet.membership === membership
        && ((tick - (quiet.armedTick | 0)) < DOCKING_CORRIDOR_FAR_RESCAN_TICKS)) {
        const px = finite(player.pos && player.pos.x);
        const pz = finite(player.pos && player.pos.z);
        const mdx = px - quiet.x;
        const mdz = pz - quiet.z;
        if (mdx * mdx + mdz * mdz <= quiet.wakeMove2) {
          publishDockingCorridorQuiet(state, true);
          return;
        }
      }
    } else if (this._farQuiet) {
      this._farQuiet = null;
    }

    // Nearest manifest station wins — only one corridor can reasonably engage at a time.
    const stations = (state.entityIndex && (state.entityIndex.dockStations || state.entityIndex.stations)) || state.entityList || [];
    let best = null;
    let farArmR = DOCKING_CORRIDOR_FAR_FLOOR_WU;
    for (const station of stations) {
      if (!station || !station.alive || station.type !== 'station') continue;
      const manifest = this._manifestFor(station);
      if (!manifest || !manifest.docking) continue;
      const corridor = corridorStateFor(manifest, station, player.pos, player.vel);
      if (!corridor) continue;
      if (!best || corridor.distCenter < best.corridor.distCenter) {
        best = { station, manifest, corridor };
        const scale = corridorScale(manifest, station);
        const mouth = (manifest.docking.corridor.mouthRadius || 1) * scale;
        farArmR = Math.max(DOCKING_CORRIDOR_FAR_FLOOR_WU, mouth * DOCKING_CORRIDOR_FAR_MOUTH_MULT);
      }
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

    // Quiet far latch: after a probe shows the nearest docking station is beyond the
    // approach band, skip the station walk + proxy publish until the player moves,
    // membership bumps, or the 0.5 s rescan fires. Approach/capture/berthed never latch.
    if (latchOn) {
      const far = !best || best.corridor.distCenter > farArmR;
      if (far) {
        this._farQuiet = {
          armedTick: tick,
          membership,
          x: finite(player.pos && player.pos.x),
          z: finite(player.pos && player.pos.z),
          wakeMove2: DOCKING_CORRIDOR_FAR_WAKE_MOVE2,
          farArmR,
        };
        publishDockingCorridorQuiet(state, true);
      } else {
        this._farQuiet = null;
        publishDockingCorridorQuiet(state, false);
      }
    } else {
      this._farQuiet = null;
      publishDockingCorridorQuiet(state, false);
    }
  },

  _publish(state, best, assistApplied) {
    const corridor = best && best.corridor;
    // Retained readout: consumers read fields synchronously; every field is rewritten each tick.
    const berth = this._corridorBerth || (this._corridorBerth = { x: 0, z: 0 });
    const out = this._corridorReadout || (this._corridorReadout = {
      schemaVersion: DOCKING_CORRIDOR_SCHEMA_VERSION,
      stationId: null, proxyId: null, phase: 'none', distToBerth: null, distCenter: null,
      speed: null, headingOk: null, inCorridor: false, inCapture: false, berthed: false,
      berth: null, assist: null,
    });
    out.stationId = best ? best.station.data && best.station.data.stationId || null : null;
    out.proxyId = best ? best.manifest.id : null;
    out.phase = corridor ? corridor.phase : 'none';
    out.distToBerth = corridor ? corridor.distToBerth : null;
    out.distCenter = corridor ? corridor.distCenter : null;
    out.speed = corridor ? corridor.speed : null;
    out.headingOk = corridor ? corridor.headingOk : null;
    out.inCorridor = corridor ? corridor.inCorridor : false;
    out.inCapture = corridor ? corridor.inCapture : false;
    out.berthed = corridor ? corridor.berthed : false;
    // berth stays null outside a corridor — dockingCradle reads `!!readout.berth` as engagement.
    if (corridor) {
      berth.x = corridor.berth.x;
      berth.z = corridor.berth.z;
      out.berth = berth;
    } else {
      out.berth = null;
    }
    out.assist = assistApplied;
    state.dockingCorridor = out;
    this._publishProxyDiagnostics(state);
  },

  // Sim-side debug publication: proxy primitives, berth, and corridor volumes in world space on
  // the physicsRuntime diagnostics surface. The existing render-side debug overlay seam can draw
  // this without any renderer-lease edits (STEP 7: publish data, reuse the existing drawing seam).
  _publishProxyDiagnostics(state) {
    const runtime = state.physicsRuntime || (state.physicsRuntime = {});
    const stations = (state.entityIndex && (state.entityIndex.dockStations || state.entityIndex.stations)) || state.entityList || [];
    // Reuse the publish scratch every tick. Stations rarely move; cache the template-key on the
    // station so settled flight stops rebuilding `${proxy}|x|z|rot|bearing` strings and allocating
    // a fresh out[]/Set (fresh profile: _publishProxyDiagnostics ~20 ms self / 60 s).
    const out = this._proxyDiagOut || (this._proxyDiagOut = []);
    out.length = 0;
    const seen = this._proxyDiagSeen || (this._proxyDiagSeen = new Set());
    seen.clear();
    for (const station of stations) {
      if (!station || !station.alive || station.type !== 'station') continue;
      const manifest = this._manifestFor(station);
      if (!manifest) continue;
      const data = station.data || {};
      const px = finite(station.pos && station.pos.x);
      const pz = finite(station.pos && station.pos.z);
      const rot = finite(station.rot);
      const bearing = data.corridorBearingDeg;
      const proxyId = data.collisionProxy;
      let key = station._sfProxyDiagKey;
      if (!key
        || station._sfProxyDiagPx !== px
        || station._sfProxyDiagPz !== pz
        || station._sfProxyDiagRot !== rot
        || station._sfProxyDiagBearing !== bearing
        || station._sfProxyDiagProxy !== proxyId) {
        key = `${proxyId}|${px}|${pz}|${rot}|${bearing}`;
        station._sfProxyDiagKey = key;
        station._sfProxyDiagPx = px;
        station._sfProxyDiagPz = pz;
        station._sfProxyDiagRot = rot;
        station._sfProxyDiagBearing = bearing;
        station._sfProxyDiagProxy = proxyId;
      }
      let entry = this._proxyGeometryCache.get(station.id);
      if (!entry || entry.key !== key) {
        entry = {
          key,
          frozen: Object.freeze({
            entityId: station.id,
            stationId: data.stationId || null,
            proxyId: manifest.id,
            flags: manifest.flags,
            pos: { x: px, z: pz },
            rot,
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
