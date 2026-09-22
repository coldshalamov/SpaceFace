/**
 * Cold-gas slipstream ribbons and the nozzle cooldown light.
 *
 * Ribbons are curved sheets: a bright core, darker edges, and a bend that follows the
 * slide. They are engine-jet vocabulary, not smoke cards. The light is one warm pool
 * under the player's bells so nearby rock and dock faces pick up the cooldown.
 */

import * as THREE from 'three';
import { globalShipMicroMotion } from './shipMicroMotion.js';
import { sampleBellThermal, writeSlipstreamState } from '../presentation/flightOverheadMath.js';

const SEGMENTS = 8;
const COLS = 3;
const RIBBON_COUNT = 2;

function createRibbonMesh() {
  const vertCount = (SEGMENTS + 1) * COLS;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const row = i * COLS;
    const next = (i + 1) * COLS;
    indices.push(row, row + 1, next, row + 1, next + 1, next);
    indices.push(row + 1, row + 2, next + 1, row + 2, next + 2, next + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.name = 'slipstream-ribbon';
  return {
    mesh,
    positions,
    colors,
    positionAttr: geo.getAttribute('position'),
    colorAttr: geo.getAttribute('color'),
  };
}

function fillRibbon(ribbon, pose) {
  const {
    originX, originZ, outX, outZ, slideX, slideZ,
    length, width, intensity, time, reduced,
  } = pose;
  const positions = ribbon.positions;
  const colors = ribbon.colors;
  const curlAmp = reduced ? 0 : length * 0.07;
  const tx = outX * 0.42 + slideX * 0.85;
  const tz = outZ * 0.42 + slideZ * 0.85;
  const tlen = Math.hypot(tx, tz) || 1;
  const wx = -tz / tlen;
  const wz = tx / tlen;
  const perpX = -slideZ;
  const perpZ = slideX;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const along = t * length;
    const bow = Math.sin(t * Math.PI);
    const curl = Math.sin(time * 5.5 + t * 6.2) * curlAmp * bow;
    const px = originX + outX * along * 0.42 + slideX * along * 0.85 + perpX * curl;
    const pz = originZ + outZ * along * 0.42 + slideZ * along * 0.85 + perpZ * curl;
    const py = 0.55 + bow * 0.22;
    const w = width * (0.28 + bow * 0.72) * (1 - t * 0.62);
    const fade = (1 - t * 0.85) * intensity;
    for (let c = 0; c < COLS; c++) {
      const u = c - 1;
      const o = (i * COLS + c) * 3;
      positions[o] = px + wx * w * u;
      positions[o + 1] = py;
      positions[o + 2] = pz + wz * w * u;
      const edge = Math.abs(u);
      const core = 1 - edge;
      const hot = fade * (0.22 + core * 0.78);
      const cool = fade * 0.28 * (0.4 + edge);
      colors[o] = Math.min(1, hot * 0.78 + cool);
      colors[o + 1] = Math.min(1, hot * 0.9 + cool * 1.05);
      colors[o + 2] = Math.min(1, hot * 1.05 + cool * 1.15);
    }
  }
  ribbon.positionAttr.needsUpdate = true;
  ribbon.colorAttr.needsUpdate = true;
  ribbon.mesh.visible = true;
}

function hideRibbon(ribbon) {
  if (ribbon.mesh.visible) ribbon.mesh.visible = false;
}

export function createFlightOverheadPresentation(scene) {
  const ribbons = [createRibbonMesh(), createRibbonMesh()];
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
    scene.add(ribbons[0].mesh);
    scene.add(ribbons[1].mesh);
    scene.add(light);
  }

  function drawSide(index, side, entity, mesh, slip, slideX, slideZ, reduced, time) {
    const ribbon = ribbons[index];
    if (!slip.active || !side) {
      hideRibbon(ribbon);
      return;
    }
    const rot = mesh && mesh.rotation && Number.isFinite(mesh.rotation.y)
      ? mesh.rotation.y
      : (Number.isFinite(entity.rot) ? entity.rot : 0);
    const cf = Math.cos(rot);
    const sf = Math.sin(rot);
    const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
    const x = mesh && mesh.position ? mesh.position.x : 0;
    const z = mesh && mesh.position ? mesh.position.z : 0;
    const reach = radius * 0.62;
    fillRibbon(ribbon, {
      originX: x + (-sf) * side * reach,
      originZ: z + cf * side * reach,
      outX: -sf * side,
      outZ: cf * side,
      slideX,
      slideZ,
      length: radius * (0.9 + slip.intensity * 1.35),
      width: radius * (0.05 + slip.intensity * 0.06),
      intensity: reduced ? slip.intensity * 0.45 : slip.intensity,
      time,
      reduced,
    });
  }

  return {
    sync(entity, mesh, _dt, state, a11y) {
      const reduced = !!(a11y && a11y.reducedMotion);
      const flashReduce = !!(a11y && a11y.reducedFlash);
      const rec = entity && entity.id != null ? globalShipMicroMotion.peekRecord(entity.id) : null;
      const slip = rec && rec.slipstream;
      const active = !!(slip && slip.active);
      writeSlipstreamState(state, active, slip ? slip.intensity : 0);
      if (!entity || !mesh || !active) {
        hideRibbon(ribbons[0]);
        hideRibbon(ribbons[1]);
      } else {
        const vel = entity.vel || {};
        const vx = Number.isFinite(vel.x) ? vel.x : 0;
        const vz = Number.isFinite(vel.z) ? vel.z : 0;
        const speed = Math.hypot(vx, vz);
        const slideX = speed > 0.5 ? vx / speed : 0;
        const slideZ = speed > 0.5 ? vz / speed : 0;
        const time = Number.isFinite(a11y && a11y.simTime) ? a11y.simTime : 0;
        if (slip.yawCouple) {
          drawSide(0, 1, entity, mesh, slip, slideX, slideZ, reduced, time);
          drawSide(1, -1, entity, mesh, slip, slideX, slideZ, reduced, time);
        } else {
          drawSide(0, slip.side || 1, entity, mesh, slip, slideX, slideZ, reduced, time);
          hideRibbon(ribbons[1]);
        }
      }

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
      for (let i = 0; i < RIBBON_COUNT; i++) {
        const ribbon = ribbons[i];
        if (ribbon.mesh.parent) ribbon.mesh.parent.remove(ribbon.mesh);
        ribbon.mesh.geometry.dispose();
        ribbon.mesh.material.dispose();
      }
      if (light.parent) light.parent.remove(light);
    },
  };
}
