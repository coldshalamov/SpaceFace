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
  if (scene && typeof scene.add === 'function') scene.add(light);

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
      const rot = mesh.rotation && Number.isFinite(mesh.rotation.y)
        ? mesh.rotation.y
        : (Number.isFinite(entity.rot) ? entity.rot : 0);
      const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
      const aft = radius * 0.82;
      light.position.set(
        mesh.position.x - Math.cos(rot) * aft,
        1.35,
        mesh.position.z - Math.sin(rot) * aft,
      );
      light.color.setRGB(sample.r, sample.g, sample.b);
      light.intensity = sample.intensity * (flashReduce ? 0.22 : 0.85);
      light.distance = 18 + radius * 1.4;
    },

    dispose() {
      if (light.parent) light.parent.remove(light);
    },
  };
}
