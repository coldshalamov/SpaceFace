/**
 * GLASSWAKE production render adapter.
 *
 * The host passes its already-loaded THREE namespace and scene (the same pattern as the VFX
 * owner's local-coordinate bridge). There is no second renderer, particle pool, render loop,
 * body art, clock or simulation. Two folded front surfaces and two retained line batches draw
 * the weather's instruments; the normal entity renderer draws the actual wrecks and pods.
 */
import { buildStormCueFrame, createStormCueBuffer, STORM_CUE_PALETTE } from './cues.js';

const TAU = Math.PI * 2;
const FRONT_STATIONS = 96;
const FRONT_SECTIONS = 5;
const LIVE_SEGMENTS = 1024;
const FORECAST_SEGMENTS = 512;
const Y = 0.85;
const identityLocal = (x, z, out) => { out.x = x; out.z = z; return out; };

/** Numeric render bounds, exposed so a focused check can assert admissions without a GPU. */
export const STORM_PRESENTATION_BUDGET = Object.freeze({
  frontMeshes: 2,
  frontVertices: (FRONT_STATIONS + 1) * FRONT_SECTIONS * 2,
  frontTriangles: FRONT_STATIONS * (FRONT_SECTIONS - 1) * 2 * 2,
  lineBatches: 2,
  liveSegments: LIVE_SEGMENTS,
  forecastSegments: FORECAST_SEGMENTS,
  maxDrawCalls: 4,
  lights: 0,
  particles: 0,
});

function createLineBatch(THREE, parent, name, capacity, opacity, order, toLocal) {
  const positions = new Float32Array(capacity * 6);
  const colors = new Float32Array(capacity * 6);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity,
    depthWrite: false, depthTest: true, toneMapped: false,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = name; mesh.renderOrder = order; mesh.frustumCulled = false;
  parent.add(mesh);
  const local = { x: 0, z: 0 };
  const color = new THREE.Color();
  let count = 0, dropped = 0;
  return {
    mesh, material,
    begin() { count = 0; dropped = 0; },
    line(ax, az, bx, bz, tint, y = Y) {
      if (count >= capacity) { dropped++; return false; }
      if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) ||
          !Number.isFinite(bz) || !Number.isFinite(y)) return false;
      const offset = count * 6;
      toLocal(ax, az, local);
      positions[offset] = local.x; positions[offset + 1] = y; positions[offset + 2] = local.z;
      toLocal(bx, bz, local);
      positions[offset + 3] = local.x; positions[offset + 4] = y; positions[offset + 5] = local.z;
      color.setHex(tint);
      colors[offset] = colors[offset + 3] = color.r;
      colors[offset + 1] = colors[offset + 4] = color.g;
      colors[offset + 2] = colors[offset + 5] = color.b;
      count++;
      return true;
    },
    finish(opacityOverride) {
      geometry.setDrawRange(0, count * 2);
      mesh.visible = count > 0;
      if (Number.isFinite(opacityOverride)) material.opacity = opacityOverride;
      if (count) { positionAttribute.needsUpdate = true; colorAttribute.needsUpdate = true; }
      return count;
    },
    get dropped() { return dropped; },
    dispose() { parent.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}

function createFrontSurface(THREE, parent, index, toLocal) {
  const vertices = (FRONT_STATIONS + 1) * FRONT_SECTIONS;
  const positions = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  const indices = new Uint16Array(FRONT_STATIONS * (FRONT_SECTIONS - 1) * 6);
  let at = 0;
  for (let station = 0; station < FRONT_STATIONS; station++) {
    for (let section = 0; section < FRONT_SECTIONS - 1; section++) {
      const a = station * FRONT_SECTIONS + section;
      const b = a + FRONT_SECTIONS;
      indices[at++] = a; indices[at++] = b; indices[at++] = a + 1;
      indices[at++] = a + 1; indices[at++] = b; indices[at++] = b + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    depthWrite: false, depthTest: true, toneMapped: false, forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = index ? 'GLASSWAKE_outer_front' : 'GLASSWAKE_inner_front';
  mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.visible = false;
  parent.add(mesh);
  const local = { x: 0, z: 0 };
  const color = new THREE.Color();
  return {
    mesh,
    update(front, visible, reducedMotion) {
      mesh.visible = !!visible && front.radius > 0 && front.gapHalfAngle < Math.PI;
      if (!mesh.visible) return;
      material.opacity = front.opacity;
      color.setHex(front.color);
      // The removed wedge is the actual safe opening. Cosmetic roll never changes its angle,
      // radial boundaries or silhouette footprint. The raised crest supplies depth/parallax.
      const start = front.gapAngle + front.gapHalfAngle;
      const span = TAU - front.gapHalfAngle * 2;
      let cursor = 0;
      for (let station = 0; station <= FRONT_STATIONS; station++) {
        const fraction = station / FRONT_STATIONS;
        const a = start + fraction * span;
        const ca = Math.cos(a), sa = Math.sin(a);
        const roll = reducedMotion ? 0 : Math.sin(a * 8 - front.phase * 5) * 0.15;
        // Slope into the cut makes the opening unmistakable without hiding its exact outline.
        const cutFade = Math.min(1, fraction * 16, (1 - fraction) * 16);
        for (let section = 0; section < FRONT_SECTIONS; section++) {
          const cross = section / (FRONT_SECTIONS - 1);
          const r = front.radius + (cross * 2 - 1) * front.halfWidth;
          toLocal(front.x + ca * r, front.z + sa * r, local);
          positions[cursor] = local.x;
          positions[cursor + 1] = Y + Math.sin(cross * Math.PI) * front.lift * (1 + roll) * cutFade;
          positions[cursor + 2] = local.z;
          const shade = (0.25 + 0.65 * Math.sin(cross * Math.PI) + 0.1 * cross) * (0.5 + 0.5 * cutFade);
          colors[cursor] = color.r * shade;
          colors[cursor + 1] = color.g * shade;
          colors[cursor + 2] = color.b * shade;
          cursor += 3;
        }
      }
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
    },
    dispose() { parent.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}

function arc(batch, x, z, radius, start, end, segments, tint, dashed = false, y = Y) {
  if (!(radius > 0) || !Number.isFinite(start + end)) return;
  const steps = Math.min(128, Math.max(1, segments | 0));
  for (let i = 0; i < steps; i++) {
    if (dashed && (i & 1)) continue;
    const a = start + (end - start) * i / steps;
    const b = start + (end - start) * (i + 1) / steps;
    batch.line(x + Math.cos(a) * radius, z + Math.sin(a) * radius,
      x + Math.cos(b) * radius, z + Math.sin(b) * radius, tint, y);
  }
}

function arrow(batch, x, z, a, length, tint, y = Y + 0.6) {
  const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  const tipX = x + dx * length * 0.5, tipZ = z + dz * length * 0.5;
  batch.line(x - dx * length * 0.5, z - dz * length * 0.5, tipX, tipZ, tint, y);
  batch.line(tipX - dx * length * 0.4 + nx * length * 0.3, tipZ - dz * length * 0.4 + nz * length * 0.3,
    tipX, tipZ, tint, y);
  batch.line(tipX - dx * length * 0.4 - nx * length * 0.3, tipZ - dz * length * 0.4 - nz * length * 0.3,
    tipX, tipZ, tint, y);
}

function frontOutline(batch, front, dashed) {
  const start = front.gapAngle + front.gapHalfAngle;
  const end = start + TAU - 2 * front.gapHalfAngle;
  arc(batch, front.x, front.z, Math.max(1, front.radius - front.halfWidth), start, end, 64, front.color, dashed);
  arc(batch, front.x, front.z, front.radius + front.halfWidth, start, end, 64, front.color, dashed);
  if (dashed) return;
  // Front one has single teeth; front two has paired teeth. Their identity survives grayscale.
  for (let i = 0; i < 14; i++) {
    const a = start + (end - start) * (i + 0.5) / 14;
    for (let tooth = 0; tooth < front.toothCount; tooth++) {
      const ta = a + tooth * 0.022;
      const r = front.radius + front.halfWidth;
      const len = 3 + front.windup * 5;
      batch.line(front.x + Math.cos(ta) * r, front.z + Math.sin(ta) * r,
        front.x + Math.cos(ta) * (r + len), front.z + Math.sin(ta) * (r + len), front.color);
    }
  }
  for (let side = -1; side <= 1; side += 2) {
    const a = front.gapAngle + side * front.gapHalfAngle;
    batch.line(front.x + Math.cos(a) * (front.radius - front.halfWidth), front.z + Math.sin(a) * (front.radius - front.halfWidth),
      front.x + Math.cos(a) * (front.radius + front.halfWidth), front.z + Math.sin(a) * (front.radius + front.halfWidth), STORM_CUE_PALETTE.gap);
  }
}

function sampleBracket(batch, sample) {
  // Open diamond brackets leave the authored physical pod visible. Charge fills an external arc.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const tipX = sample.x + Math.cos(a) * sample.radius;
    const tipZ = sample.z + Math.sin(a) * sample.radius;
    for (let side = -1; side <= 1; side += 2) {
      const b = a + side * Math.PI / 2;
      batch.line(tipX, tipZ, tipX * 0.65 + (sample.x + Math.cos(b) * sample.radius) * 0.35,
        tipZ * 0.65 + (sample.z + Math.sin(b) * sample.radius) * 0.35, sample.color, 1.8);
    }
  }
  if (sample.charge > 0) arc(batch, sample.x, sample.z, sample.radius + 2.6,
    -Math.PI / 2, -Math.PI / 2 + TAU * sample.charge, 20, sample.color, false, 1.9);
  if (sample.ready) {
    const r = sample.radius;
    batch.line(sample.x - r * 0.35, sample.z - r - 4, sample.x, sample.z - r - 1.5, sample.color, 2);
    batch.line(sample.x, sample.z - r - 1.5, sample.x + r * 0.55, sample.z - r - 7, sample.color, 2);
  }
}

function createHud(document, container) {
  if (!document?.createElement || !container?.appendChild) return null;
  const element = document.createElement('section');
  element.className = 'sf-glasswake-instrument';
  element.setAttribute('aria-label', 'Glasswake storm expedition');
  element.style.cssText = 'position:absolute;left:20px;top:76px;max-width:min(360px,calc(100% - 40px));pointer-events:none;color:#e9f4f6;font:13px/1.45 system-ui,sans-serif;text-shadow:0 1px 3px #000;background:linear-gradient(90deg,rgba(5,14,21,.78),rgba(5,14,21,.18));border-left:2px solid #bcebf2;padding:8px 12px;z-index:18;';
  const title = document.createElement('strong');
  const objective = document.createElement('div');
  const forecast = document.createElement('div');
  const pocket = document.createElement('div');
  const samples = document.createElement('div');
  title.style.cssText = 'font-size:12px;letter-spacing:.14em;';
  objective.style.cssText = 'margin-top:3px;';
  forecast.style.cssText = 'margin-top:4px;font-size:12px;';
  pocket.style.cssText = 'font-size:12px;';
  samples.style.cssText = 'font-size:12px;opacity:.86;';
  element.appendChild(title); element.appendChild(objective); element.appendChild(forecast); element.appendChild(pocket); element.appendChild(samples);
  // Only semantic changes reach the live region. Second-by-second countdowns remain readable
  // without repeatedly interrupting screen-reader navigation or combat audio.
  const live = document.createElement('span');
  live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  live.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  element.appendChild(live); container.appendChild(element);
  let revision = -1, announcement = '';
  return {
    element,
    update(cues) {
      element.hidden = !cues.active;
      if (!cues.active || revision === cues.hud.revision) return;
      revision = cues.hud.revision;
      title.textContent = cues.hud.title;
      objective.textContent = cues.hud.text;
      forecast.textContent = cues.hud.forecast;
      pocket.textContent = cues.hud.pocket;
      samples.textContent = cues.hud.samples;
      const navigation = !cues.weatherActive ? 'The storm has passed. Return charged pods to the receiver.' :
        cues.gap.aligned ? 'Storm gap is open.' : 'Wait for the forecast opening.';
      const message = `${cues.hud.text} ${navigation} ${cues.hud.samples}`;
      if (message !== announcement) { live.textContent = message; announcement = message; }
    },
    hide() { element.hidden = true; },
    dispose() { element.remove(); },
  };
}

/**
 * Public production entry. Call once at VFX-owner admission, then update during vfx.update
 * (between prepareFrame and drawPreparedFrame). `toLocal(x,z,out)` is the existing owner's
 * floating-origin conversion. Dispose on renderer/world teardown. Context recovery uses the
 * host renderer's normal restoration of Three buffer resources; no external handles survive.
 */
export function createStormChasePresentation({ THREE, scene, toLocal = identityLocal, document = null, container = null } = {}) {
  if (!THREE?.Group || !THREE?.BufferGeometry || !THREE?.BufferAttribute || !scene?.add || !scene?.remove) {
    throw new TypeError('GLASSWAKE presentation requires the live THREE namespace and scene');
  }
  const group = new THREE.Group();
  group.name = 'GLASSWAKE'; group.visible = false; scene.add(group);
  const cues = createStormCueBuffer();
  const frontSurfaces = [createFrontSurface(THREE, group, 0, toLocal), createFrontSurface(THREE, group, 1, toLocal)];
  const live = createLineBatch(THREE, group, 'GLASSWAKE_current_instruments', LIVE_SEGMENTS, 0.8, 5, toLocal);
  const future = createLineBatch(THREE, group, 'GLASSWAKE_forecast_trace', FORECAST_SEGMENTS, 0.28, 4, toLocal);
  const hud = createHud(document, container);
  const cueOptions = { forecast: null, samples: null, covers: null, extraction: null, objective: null, settings: null,
    expeditionActive: null, returnRemainingS: 0 };
  const stats = { active: false, liveSegments: 0, forecastSegments: 0, meshes: 0, droppedSegments: 0, disposed: false };
  let disposed = false;

  function clear() {
    group.visible = false; stats.active = false; stats.meshes = 0;
    stats.liveSegments = stats.forecastSegments = stats.droppedSegments = 0;
    cues.active = false;
    for (const surface of frontSurfaces) surface.mesh.visible = false;
    live.begin(); live.finish(); future.begin(); future.finish(); hud?.hide();
    return stats;
  }

  return {
    group, cues, stats, budget: STORM_PRESENTATION_BUDGET,
    update(view, settings = {}) {
      if (disposed) return stats;
      if (!view?.frame || view.active === false) return clear();
      cueOptions.forecast = view.forecast;
      cueOptions.samples = view.samples;
      cueOptions.covers = view.covers;
      cueOptions.extraction = view.extraction;
      cueOptions.objective = view.objective;
      cueOptions.settings = settings;
      cueOptions.expeditionActive = view.active;
      cueOptions.returnRemainingS = view.objective?.returnRemainingS;
      buildStormCueFrame(view.frame, cueOptions, cues);
      if (!cues.active) return clear();
      group.visible = true;
      stats.active = true;
      live.begin(); future.begin();
      for (let i = 0; i < frontSurfaces.length; i++) {
        frontSurfaces[i].update(cues.fronts[i], i < cues.frontCount, cues.reducedMotion);
        if (i < cues.frontCount) frontOutline(live, cues.fronts[i], false);
        if (i < cues.futureFrontCount) frontOutline(future, cues.futureFronts[i], true);
      }
      if (cues.weatherActive) arc(live, cues.eye.x, cues.eye.z, cues.eye.radius, 0, TAU, 64, STORM_CUE_PALETTE.eye);
      // Four cardinal inward ticks make the quiet eye read as a refuge, not a third front.
      for (let i = 0; cues.weatherActive && i < 4; i++) {
        const a = i * Math.PI / 2;
        live.line(cues.eye.x + Math.cos(a) * (cues.eye.radius - 5), cues.eye.z + Math.sin(a) * (cues.eye.radius - 5),
          cues.eye.x + Math.cos(a) * cues.eye.radius, cues.eye.z + Math.sin(a) * cues.eye.radius, STORM_CUE_PALETTE.eye);
      }
      if (cues.weatherActive && Math.hypot(cues.eye.vx, cues.eye.vz) > 0.01) arrow(live, cues.eye.x, cues.eye.z,
        Math.atan2(cues.eye.vz, cues.eye.vx), 12, STORM_CUE_PALETTE.eye);
      for (let i = 0; i < cues.arrowCount; i++) {
        const a = cues.arrows[i];
        for (let chevron = 0; chevron < a.chevrons; chevron++) arrow(live,
          a.x - Math.cos(a.angle) * chevron * a.length * 0.55,
          a.z - Math.sin(a.angle) * chevron * a.length * 0.55,
          a.angle, a.length, a.color, 3.4);
      }
      if (cues.gap.aligned) {
        const r = cues.frontCount ? cues.fronts[cues.frontCount - 1].radius + cues.fronts[cues.frontCount - 1].halfWidth + 14 : cues.eye.radius;
        arrow(live, cues.eye.x + Math.cos(cues.gap.angle) * r, cues.eye.z + Math.sin(cues.gap.angle) * r,
          cues.gap.angle + Math.PI, 15, STORM_CUE_PALETTE.gap);
      }
      if (cues.pathCount > 1) {
        for (let i = 1; i < cues.pathCount; i++) {
          const a = cues.path[i - 1], b = cues.path[i];
          for (let part = 0; part < 8; part += 2) {
            future.line(a.x + (b.x - a.x) * part / 8, a.z + (b.z - a.z) * part / 8,
              a.x + (b.x - a.x) * (part + 1) / 8, a.z + (b.z - a.z) * (part + 1) / 8, STORM_CUE_PALETTE.forecast);
          }
        }
        arc(future, cues.futureEye.x, cues.futureEye.z, cues.futureEye.radius, 0, TAU, 48, STORM_CUE_PALETTE.forecast, true);
      }
      for (let i = 0; i < cues.sampleCount; i++) sampleBracket(live, cues.samples[i]);
      for (let i = 0; i < cues.coverCount; i++) {
        const c = cues.covers[i], dx = Math.cos(c.angle), dz = Math.sin(c.angle), nx = -dz, nz = dx;
        const start = c.radius * 1.12, endWidth = c.radius * 1.12 + c.reach * 0.12;
        // Continuous shoulders describe the lee direction around real authored heavy cover.
        // No closed boundary claims complete protection or overrides the actual force sampler.
        future.line(c.x + dx * c.radius, c.z + dz * c.radius,
          c.x + dx * c.reach, c.z + dz * c.reach, STORM_CUE_PALETTE.cover, 0.65);
        for (let side = -1; side <= 1; side += 2) future.line(
          c.x + dx * c.radius + nx * start * side, c.z + dz * c.radius + nz * start * side,
          c.x + dx * c.reach + nx * endWidth * side, c.z + dz * c.reach + nz * endWidth * side,
          STORM_CUE_PALETTE.cover, 0.65);
        if (c.pinned) {
          const px = c.x - dx * (c.radius + 6), pz = c.z - dz * (c.radius + 6);
          live.line(px - 4, pz - 4, px + 4, pz + 4, STORM_CUE_PALETTE.cover, 1.6);
          live.line(px + 4, pz - 4, px - 4, pz + 4, STORM_CUE_PALETTE.cover, 1.6);
        }
      }
      for (let i = 0; i < cues.pocketCount; i++) {
        const p = cues.pockets[i], batch = p.open ? live : future;
        arc(batch, p.x, p.z, p.radius, 0, TAU, 40, STORM_CUE_PALETTE.pocket, !p.open, 0.7);
        // One/two/three inward radial notches name increasing reward tiers without relying on hue.
        for (let mark = 0; mark < p.valueTier; mark++) {
          const a = -Math.PI / 2 + (mark - (p.valueTier - 1) / 2) * 0.18;
          batch.line(p.x + Math.cos(a) * p.radius, p.z + Math.sin(a) * p.radius,
            p.x + Math.cos(a) * (p.radius - 6), p.z + Math.sin(a) * (p.radius - 6), STORM_CUE_PALETTE.pocket, 0.7);
        }
      }
      if (cues.extraction.active) {
        const e = cues.extraction;
        // Double octagon is deliberately distinct from circular weather and diamond samples.
        arc(live, e.x, e.z, e.radius, Math.PI / 8, TAU + Math.PI / 8, 8, STORM_CUE_PALETTE.extraction);
        arc(live, e.x, e.z, e.radius + 4, Math.PI / 8, TAU + Math.PI / 8, 8, STORM_CUE_PALETTE.extraction);
        live.line(e.x - 4, e.z, e.x + 4, e.z, STORM_CUE_PALETTE.extraction);
        live.line(e.x, e.z - 4, e.x, e.z + 4, STORM_CUE_PALETTE.extraction);
      }
      stats.liveSegments = live.finish(cues.reducedFlash ? 0.58 : 0.8);
      stats.forecastSegments = future.finish(cues.reducedFlash ? 0.2 : 0.28);
      stats.meshes = (live.mesh.visible ? 1 : 0) + (future.mesh.visible ? 1 : 0) +
        (frontSurfaces[0].mesh.visible ? 1 : 0) + (frontSurfaces[1].mesh.visible ? 1 : 0);
      stats.droppedSegments = live.dropped + future.dropped;
      hud?.update(cues);
      return stats;
    },
    clear,
    dispose() {
      if (disposed) return;
      clear(); disposed = true; stats.disposed = true;
      for (const surface of frontSurfaces) surface.dispose();
      live.dispose(); future.dispose(); hud?.dispose(); scene.remove(group);
    },
  };
}
