import * as THREE from 'three';
import { globalToFrame } from '../../core/coordinates.js';
import { SHIPBREAKING_YARD_SITE } from './layouts.js';

// Informational geometry, never substitutes for an authored body. One bounded draw, no particles,
// no light flashes, no idle animation; shape and color both distinguish free/attached/unsafe.
export const YARD_CUE_COLORS = Object.freeze({ attached: [1, .79, .35], free: [.35, .95, .8], danger: [1, .34, .24], neutral: [.83, .89, 1], receiver: [.45, .87, 1] });
const MAX_VERTICES = 4096;
const framePosition = (pos, state) => pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)
  ? globalToFrame(pos, state?.world?.frameOrigin) : null;
function currentPosition(module, state) {
  if (!module) return null;
  if (!state?.entities?.get || module.entityId == null) return framePosition(module.pos, state);
  const entity = state.entities.get(module.entityId);
  // A recycled entity id must not carry an old work ticket's brackets into unrelated traffic.
  if (!entity || entity.alive === false || entity.data?.shipbreakingJobId !== module.jobId
    || entity.data?.shipbreakingModuleId !== module.id) return null;
  return entity.mesh?.position || framePosition(entity.pos, state);
}
export function createShipbreakingYardRenderer({ scene, readView = state => state?.shipbreakingYardView } = {}) {
  const positions = new Float32Array(MAX_VERTICES * 3), colors = new Float32Array(MAX_VERTICES * 3);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('color', color); geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .86,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  // Flat annotation ribbons retain readable width on WebGL implementations that ignore lineWidth.
  const lines = new THREE.Mesh(geometry, material); lines.name = 'ShipbreakingYard_AttachmentAndReceiverCues';
  lines.frustumCulled = false; lines.renderOrder = 7;
  let count = 0, disposed = false, currentScene = null;
  const mount = next => { if (next === currentScene) return; lines.removeFromParent(); currentScene = next || null; currentScene?.add(lines); };
  const vertex = (x, z, y, rgb) => {
    const offset = count * 3;
    positions[offset] = x; positions[offset + 1] = y; positions[offset + 2] = z;
    colors[offset] = rgb[0]; colors[offset + 1] = rgb[1]; colors[offset + 2] = rgb[2]; count++;
  };
  const segment = (ax, az, bx, bz, rgb, y = 5) => {
    if (count + 6 > MAX_VERTICES || !Number.isFinite(ax) || !Number.isFinite(az)
      || !Number.isFinite(bx) || !Number.isFinite(bz)) return;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < .001) return;
    const nx = -dz / length * .4, nz = dx / length * .4;
    vertex(ax + nx, az + nz, y, rgb); vertex(ax - nx, az - nz, y, rgb); vertex(bx + nx, bz + nz, y, rgb);
    vertex(bx + nx, bz + nz, y, rgb); vertex(ax - nx, az - nz, y, rgb); vertex(bx - nx, bz - nz, y, rgb);
  };
  const diamond = (x, z, radius, rgb) => {
    segment(x, z - radius, x + radius, z, rgb); segment(x + radius, z, x, z + radius, rgb);
    segment(x, z + radius, x - radius, z, rgb); segment(x - radius, z, x, z - radius, rgb);
  };
  const brackets = (x, z, radius, rgb) => {
    const wing = radius * .26;
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
      segment(x + sx * radius, z + sz * radius, x + sx * (radius - wing), z + sz * radius, rgb);
      segment(x + sx * radius, z + sz * radius, x + sx * radius, z + sz * (radius - wing), rgb);
    }
  };
  const receiverMarks = (x, z, radius) => {
    // The native gate is circular. Keep every visible stroke inside that threshold;
    // square corner brackets would wrongly invite loads beyond the accepted radius.
    const r = Math.max(1, radius - .5), step = Math.PI * 2 / 16;
    for (let i = 0; i < 16; i++) {
      const a = i * step + step * .12, b = (i + 1) * step - step * .12;
      segment(x + Math.cos(a) * r, z + Math.sin(a) * r,
        x + Math.cos(b) * r, z + Math.sin(b) * r, YARD_CUE_COLORS.receiver);
    }
  };
  mount(scene);
  return {
    name: 'shipbreakingYardRenderer', root: lines,
    update(state) {
      if (disposed) return;
      mount(scene || state?.render?.scene);
      const view = readView(state); count = 0;
      lines.visible = !!view?.visible
        && (!state?.world || state.world.currentSectorId === SHIPBREAKING_YARD_SITE.sectorId)
        && (!state?.mode || state.mode === 'flight')
        && (!state?.run || state.run.kind === 'adventure');
      if (!lines.visible) { geometry.setDrawRange(0, 0); return; }
      const receiver = view.receiver, rp = framePosition(receiver?.pos || receiver, state);
      if (receiver && rp) {
        const r = Math.max(12, Number(receiver.radius) || 38);
        receiverMarks(rp.x, rp.z, r);
        // Paired threshold marks say "bring the load inside", not "click a distant marker".
        segment(rp.x - r * .35, rp.z, rp.x - r * .12, rp.z, YARD_CUE_COLORS.receiver);
        segment(rp.x + r * .12, rp.z, rp.x + r * .35, rp.z, YARD_CUE_COLORS.receiver);
      }
      for (const job of view.jobs || []) {
        for (const coupling of job.couplings || []) {
          if (coupling.status !== 'connected') continue;
          const a = currentPosition(job.modules?.find(module => module.id === coupling.a), state) || (!state?.entities ? framePosition(coupling.posA, state) : null);
          const b = currentPosition(job.modules?.find(module => module.id === coupling.b), state) || (!state?.entities ? framePosition(coupling.posB, state) : null);
          if (!a || !b) continue;
          const rgb = coupling.safe === false || coupling.strained === true ? YARD_CUE_COLORS.danger : YARD_CUE_COLORS.attached;
          segment(a.x, a.z, b.x, b.z, rgb);
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
          const nx = -dz / length, nz = dx / length, x = (a.x + b.x) * .5, z = (a.z + b.z) * .5;
          // Coupling jaws are explicit bars across the link. Unsafe adds an X; no color-only warning.
          const half = Math.min(4, Math.max(2.5, length * .1));
          segment(x - nx * half, z - nz * half, x + nx * half, z + nz * half, rgb);
          if (coupling.strained === true) {
            const tx = dx / length * 2.5, tz = dz / length * 2.5;
            segment(x - nx * half + tx, z - nz * half + tz, x + nx * half + tx, z + nz * half + tz, rgb);
            segment(x - nx * half - tx, z - nz * half - tz, x + nx * half - tx, z + nz * half - tz, rgb);
          }
          if (coupling.safe === false) {
            segment(x - half, z - half, x + half, z + half, rgb);
            segment(x + half, z - half, x - half, z + half, rgb);
          }
        }
        for (const module of job.modules || []) {
          const pos = currentPosition(module, state); if (!pos || (module.status === 'delivered' || module.status === 'lost')) continue;
          const selected = (module.id === view.selectedModuleId && (!view.selectedJobId || job.id === view.selectedJobId))
            || (!!view.selectedEntityId && module.entityId === view.selectedEntityId);
          const radius = Math.max(7, Number(module.radius) + 3 || 10);
          if (module.status === 'free') diamond(pos.x, pos.z, radius, YARD_CUE_COLORS.free);
          else if (selected) brackets(pos.x, pos.z, radius, YARD_CUE_COLORS.attached);
          if (selected) brackets(pos.x, pos.z, radius + 3, YARD_CUE_COLORS.neutral);
        }
      }
      geometry.setDrawRange(0, count); position.needsUpdate = true; color.needsUpdate = true;
    },
    reset() { lines.visible = false; count = 0; geometry.setDrawRange(0, 0); },
    dispose() { if (disposed) return; disposed = true; mount(null); geometry.dispose(); material.dispose(); },
  };
}

/** Registry-shaped adapter. The runtime writes the read model; this renderer only consumes it. */
export function createShipbreakingYardRenderSystem() {
  return {
    name: 'shipbreakingYardRender',
    init(context) { this._driver?.dispose(); this._ctx = context; this._driver = null; },
    update(_dt, state) {
      if (!this._driver && state?.render?.scene) this._driver = createShipbreakingYardRenderer({
        readView: s => s.shipbreakingYardView || this._ctx?.registry?.get?.('shipbreakingYard')?.readModel?.() });
      this._driver?.update(state);
    },
    newGame() { this._driver?.reset(); },
    destroy() { this._driver?.dispose(); this._driver = null; this._ctx = null; },
  };
}
export const shipbreakingYardRender = createShipbreakingYardRenderSystem();
export default shipbreakingYardRender;
