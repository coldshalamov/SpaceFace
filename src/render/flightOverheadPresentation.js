/**
 * Nozzle cooldown light, and the drift slipstream state the audio hiss reads.
 *
 * The light is one warm pool under the player's bells so nearby rock and dock faces pick up the
 * cooldown.
 *
 * The drawn cold-gas slipstream ribbons that used to live here are removed. They were two white
 * eight-segment strips with a sine curl, laid off the hull along the slide, and they read as a
 * cartoon smell-line trailing the ship, not as engine gas (owner, 2026-09-22). The slipstream
 * STATE is still published every frame, because audioSystem keys its drift hiss off it.
 */

import * as THREE from 'three';
import { globalShipMicroMotion } from './shipMicroMotion.js';
import { noteShadowCensusLightMutation } from './shadowDepthAdmission.js';
import { sampleBellThermal, writeSlipstreamState } from '../presentation/flightOverheadMath.js';

export function createFlightOverheadPresentation(scene) {
  const light = new THREE.PointLight(0xfff1e0, 0, 26, 2);
  light.name = 'nozzle-cooldown-light';
  light.castShadow = false;
  // Pool-light contract (vfx.js _initEventLights): three bakes the visible point-light COUNT into
  // every program key, so a light that toggles .visible relinks every lit material inside the next
  // presented bloomScene pass (~10 s brick on Intel/ANGLE). This light stays visible forever and
  // flashes via intensity only — it must also exist before the opening compile, so the renderer
  // mounts this module eagerly rather than on first slipstream activity.
  light.visible = true;
  if (scene && typeof scene.add === 'function') {
    scene.add(light);
    // Light-set mutation — the mount changes the rendered light census, so the
    // shadow memo must not serve the pre-mount signature.
    noteShadowCensusLightMutation();
  }

  return {
    sync(entity, mesh, _dt, state, a11y) {
      const flashReduce = !!(a11y && a11y.reducedFlash);
      const rec = entity && entity.id != null ? globalShipMicroMotion.peekRecord(entity.id) : null;
      const slip = rec && rec.slipstream;
      writeSlipstreamState(state, !!(slip && slip.active), slip ? slip.intensity : 0);

      const heat = rec && Number.isFinite(rec.bellHeat) ? rec.bellHeat : 0;
      const sample = sampleBellThermal(heat);
      const lit = sample.intensity > 0.02 && entity && mesh;
      if (!lit) {
        light.intensity = 0;
        return;
      }
      const meshYaw = mesh.rotation && Number.isFinite(mesh.rotation.y) ? mesh.rotation.y : null;
      const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
      const aft = radius * 0.82;
      // Root yaw is minus the heading. Three.js local +X is forward, so aft is
      // (-cos yaw, +sin yaw). A bare sim heading still uses (-cos, -sin).
      let aftX;
      let aftZ;
      if (meshYaw != null) {
        aftX = -Math.cos(meshYaw) * aft;
        aftZ = Math.sin(meshYaw) * aft;
      } else {
        const heading = Number.isFinite(entity.rot) ? entity.rot : 0;
        aftX = -Math.cos(heading) * aft;
        aftZ = -Math.sin(heading) * aft;
      }
      light.position.set(mesh.position.x + aftX, 1.35, mesh.position.z + aftZ);
      light.color.setRGB(sample.r, sample.g, sample.b);
      light.intensity = sample.intensity * (flashReduce ? 0.22 : 0.85);
      light.distance = 18 + radius * 1.4;
    },

    dispose() {
      // Light-set mutation — keep the shadow census memo honest on teardown.
      noteShadowCensusLightMutation();
      if (light.parent) light.parent.remove(light);
    },
  };
}
