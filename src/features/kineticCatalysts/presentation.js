// Read-only force presentation. These are surfaces around existing authored
// bodies, never substitute hulls, pickups, colliders or force sources.
// The injected batch is the production SweptSurfaceBatch (begin/add/end/dispose).
import { KINETIC_LIMITS } from './catalog.js';

export const CATALYST_PRESENTATION_LIMITS = Object.freeze({
  activeSurfaces: 56, residueSurfaces: 24, maxSurfaces: 80,
  residueSeconds: 0.38, descriptorFloats: 36,
});
const TAU = Math.PI * 2;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
const boundedPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z)
  && Math.abs(p.x) <= KINETIC_LIMITS.maxCoordinate && Math.abs(p.z) <= KINETIC_LIMITS.maxCoordinate;
const TINTS = Object.freeze({
  magazine: Object.freeze([0.28, 0.66, 1]),
  echo: Object.freeze([1, 0.53, 0.15]),
  bridge: Object.freeze([0.3, 0.92, 0.64]),
  ivory: Object.freeze([0.88, 0.94, 1]),
});
const IDS = new Set(['orbital_magazine', 'aftershock_core', 'load_bridge']);

/** Retain one frame per renderer; pool storage is reused at every update. */
export function createCatalystPresentationFrame() {
  return {
    surfaces: [], keys: [], status: null, count: 0,
    pool: Array.from({ length: CATALYST_PRESENTATION_LIMITS.activeSurfaces },
      // World positions stay double precision until the renderer subtracts its
      // floating origin. Quantizing first makes distant bridge endpoints jitter.
      () => new Float64Array(CATALYST_PRESENTATION_LIMITS.descriptorFloats)),
  };
}

function writer(frame, options, now) {
  const origin = boundedPoint(options.origin) ? options.origin : { x: 0, z: 0 };
  const motion = options.reducedMotion !== true;
  const flashScale = options.reducedFlash === true ? 0.56 : 1;
  function surface(key, center, type, a0, a1, start, end, width, tint, settings = {}) {
    if (!boundedPoint(center) || frame.count >= CATALYST_PRESENTATION_LIMITS.activeSurfaces) return false;
    const d = frame.pool[frame.count];
    d.fill(0);
    d[0] = center.x - origin.x; d[1] = 0.6; d[2] = center.z - origin.z;
    d[4] = type; d[5] = a0; d[6] = a1; d[7] = start;
    d[8] = end; d[9] = clamp(width, 0.08, 6); d[10] = finite(settings.lift, 0.5);
    d[11] = finite(settings.bow);
    d[12] = tint[0]; d[13] = tint[1]; d[14] = tint[2];
    d[15] = clamp(finite(settings.alpha, 0.76) * flashScale, 0, 1);
    d[16] = motion ? finite(settings.flow, 0.7) : 0;
    d[17] = motion ? finite(settings.phase) : 0;
    d[18] = motion ? finite(settings.travel) : 0;
    d[19] = finite(settings.style, 0);
    d[20] = 1; d[21] = finite(settings.taper, 0.6); d[22] = 1;
    // The shader uses this radius to bound powered volume. Lines use their actual
    // endpoint distance; circular force boundaries use the kernel's true radius.
    d[23] = clamp(finite(settings.radius, Math.max(Math.abs(start), Math.abs(end)) + width), 1, 5000);
    d[24] = finite(settings.born, Math.max(0, now - 0.2));
    d[25] = finite(settings.attack, 0.15); d[26] = -1; d[27] = CATALYST_PRESENTATION_LIMITS.residueSeconds;
    d[28] = finite(settings.family, type === 0 ? 2 : 5);
    d[29] = settings.boundary ? 1 : finite(settings.role, 2);
    d[30] = motion ? finite(settings.phase) : 0; d[31] = finite(settings.flex, 0.3);
    d[32] = d[0]; d[33] = d[2]; d[34] = 4; d[35] = 0.15;
    if (!d.every(Number.isFinite)) return false;
    frame.surfaces.push(d); frame.keys.push(key); frame.count++;
    return true;
  }
  function line(key, a, b, width, color, settings) {
    if (!boundedPoint(a) || !boundedPoint(b)) return;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01 || length > 5000) return;
    surface(key, a, 1, Math.atan2(dz, dx), 0, 0, length, width, color,
      { ...settings, radius: length + width });
  }
  function arc(key, center, radius, start, end, width, color, settings) {
    if (!(radius > 0) || radius > 5000) return;
    surface(key, center, 0, start, end, radius, radius, width, color,
      { ...settings, radius: radius + width });
  }
  function chevron(key, center, angle, size, color, settings = {}) {
    const length = clamp(size, 1, 15), c = Math.cos(angle), s = Math.sin(angle);
    const tip = { x: center.x + c * length, z: center.z + s * length };
    for (const sign of [-1, 1]) {
      const start = { x: center.x - c * length * 0.2 - s * length * 0.5 * sign,
        z: center.z - s * length * 0.2 + c * length * 0.5 * sign };
      line(key, start, tip, 0.5, color, settings);
    }
  }
  return { line, arc, chevron, motion };
}

function drawMagazine(snapshot, frame, w, now) {
  const owner = snapshot.owner;
  if (!boundedPoint(owner)) return;
  const bodies = (Array.isArray(snapshot.orbit) ? snapshot.orbit : []).slice(0, 3).filter(boundedPoint);
  const chassisRadius = clamp(finite(owner.radius, 12) + 5, 8, 40);
  // Three open teeth survive a monochrome display. Filled slots are longer;
  // these are capacity brackets, not a second spherical force footprint.
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 - 0.7;
    w.arc('magazine:capacity', owner, chassisRadius, a, a + (i < bodies.length ? 0.85 : 0.28),
      0.68, i < bodies.length ? TINTS.magazine : TINTS.ivory,
      { boundary: true, alpha: i < bodies.length ? 0.8 : 0.28, flow: 0 });
  }
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i], key = `orbit:${String(body.id)}`;
    const dx = body.x - owner.x, dz = body.z - owner.z;
    const angle = Math.atan2(dz, dx), distance = Math.hypot(dx, dz);
    // A partial path on the real current radius exposes the orbit's hand and
    // room to miss. It never visually drags the real body to an ideal circle.
    const sign = body.sign === -1 ? -1 : 1;
    if (distance > 1) w.arc(key, owner, distance, angle - sign * 0.7, angle - sign * 0.12,
      0.5, TINTS.magazine, { born: body.acquiredAt, flow: sign, phase: i / 3, alpha: 0.42 });
    const vx = finite(body.vx) - finite(owner.vx), vz = finite(body.vz) - finite(owner.vz);
    const speed = Math.hypot(vx, vz), velocityAngle = speed > 0.01 ? Math.atan2(vz, vx) : angle + sign * Math.PI / 2;
    const radius = clamp(finite(body.bodyRadius, finite(body.radius, 3)) + 2, 3, 28);
    w.arc(key, body, radius, velocityAngle + 0.4, velocityAngle + 2.35,
      0.75, TINTS.magazine, { born: body.acquiredAt, role: 3, family: 1, phase: i / 3 });
    w.arc(key, body, radius, velocityAngle - 2.35, velocityAngle - 0.4,
      0.75, TINTS.magazine, { born: body.acquiredAt, role: 3, family: 1, phase: i / 3 + 0.25 });
    if (speed > 0.1) {
      // This is measured relative velocity, not a predicted perfect launch.
      const scale = Math.min(0.28, 22 / speed);
      const end = { x: body.x + vx * scale, z: body.z + vz * scale };
      w.line(key, body, end, 0.48, TINTS.ivory, { flow: 0, alpha: 0.65, boundary: true });
      w.chevron(key, end, velocityAngle, 2.6, TINTS.ivory, { flow: 0, alpha: 0.62, boundary: true });
    }
  }
  frame.status = {
    label: 'ORBITAL MAGAZINE', text: `${bodies.length}/3 bodies · ${snapshot.rigActive ? 'Rig braking · half drain' : 'capacitor drain while loaded'}`,
    hint: 'Shove releases the measured tangential momentum.', warning: bodies.length > 0,
    count: bodies.length, capacity: 3,
  };
}

function drawEcho(snapshot, frame, w, now) {
  const echo = snapshot.echo;
  if (!echo || !boundedPoint(echo)) {
    const cooldown = Math.max(0, finite(snapshot.cooldowns?.echoUntil) - now);
    frame.status = { label: 'AFTERSHOCK CORE', text: cooldown > 0 ? `Recovery ${cooldown.toFixed(1)} s` : 'Ready · next Shove leaves one echo',
      hint: 'The echo stays at the original cast point.', warning: false };
    return;
  }
  const radius = clamp(echo.radius, 1, 5000), total = Math.max(0.01, finite(echo.dueAt) - finite(echo.createdAt));
  const remaining = Math.max(0, finite(echo.dueAt) - now), progress = clamp(remaining / total, 0, 1);
  const key = `echo:${String(echo.id ?? echo.createdAt)}`;
  // Four separated outward lips mark the exact footprint. No radius pulse and no
  // flashing fill can conceal the boundary or imply a different physical range.
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4;
    w.arc(key, echo, radius, a + 0.12, a + Math.PI / 2 - 0.12, 0.65, TINTS.echo,
      { born: echo.createdAt, family: 3, boundary: true, flow: 0, alpha: 0.78 });
    const edge = { x: echo.x + Math.cos(a) * radius, z: echo.z + Math.sin(a) * radius };
    w.chevron(key, edge, a, 5, TINTS.echo, { born: echo.createdAt, family: 3, flow: 0, boundary: true, alpha: 0.72 });
  }
  // Countdown is information, not decorative movement: three teeth deplete in
  // order even with reduced motion. The full footprint remains constant.
  for (let i = 0; i < 3; i++) {
    const tooth = clamp(progress * 3 - i, 0, 1);
    if (tooth <= 0.001) continue;
    const a = i * TAU / 3 + 0.3;
    w.arc(key, echo, Math.max(3, radius * 0.16), a, a + tooth * 0.95,
      1.3, TINTS.ivory, { born: echo.createdAt, family: 3, flow: 0, boundary: true, alpha: 0.88 });
  }
  // A powered, non-boundary membrane supplies the build/release lifecycle even
  // when the echo is cast into empty space. The center remains hollow.
  w.arc(key, echo, radius * 0.62, -0.55, 0.55, 1.8, TINTS.echo,
    { born: echo.createdAt, family: 3, flow: 0.5, travel: 0, alpha: 0.32, lift: 1.2 });
  frame.status = { label: 'AFTERSHOCK CORE', text: `Echo in ${remaining.toFixed(2)} s · world point fixed`,
    hint: echo.grounded ? 'Pin narrowed the footprint. Stay clear of the remaining ring.' : 'Move clear; your own hull can be caught.',
    warning: true, remaining, radius };
}

function drawBridge(snapshot, frame, w, now) {
  const bridge = snapshot.bridge;
  if (!bridge || !boundedPoint(bridge.a) || !boundedPoint(bridge.b)) {
    frame.status = { label: 'LOAD BRIDGE', text: 'Pin a body, then Pull a second load',
      hint: 'Tow the first body into the Pin ring to hitch it.', warning: false };
    return;
  }
  const a = bridge.a, b = bridge.b, dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01 || length > 5000) return;
  const angle = Math.atan2(dz, dx), nx = -dz / length, nz = dx / length;
  const key = `bridge:${String(a.id)}:${String(b.id)}`;
  const tensioned = bridge.braced === true || snapshot.rigActive === true;
  const slack = tensioned ? 0.6 : Math.min(6, length * 0.04);
  for (const sign of [-1, 1]) {
    const aa = { x: a.x + nx * 1.2 * sign, z: a.z + nz * 1.2 * sign };
    const bb = { x: b.x + nx * 1.2 * sign, z: b.z + nz * 1.2 * sign };
    w.line(key, aa, bb, tensioned ? 0.88 : 0.55, TINTS.bridge,
      { bow: sign * slack, phase: sign * 0.25, flow: sign, alpha: 0.68, born: bridge.createdAt, family: 5 });
  }
  // The pinned endpoint has three teeth; the loose end has two open jaws.
  // Endpoint roles and mass asymmetry remain distinguishable without hue.
  for (let i = 0; i < 3; i++) {
    const aa = angle + i * TAU / 3;
    w.arc(key, a, clamp(finite(a.radius, 3) + 3, 4, 30), aa, aa + 0.65, 0.8, TINTS.ivory,
      { boundary: true, flow: 0, family: 1, born: bridge.createdAt });
  }
  for (const sign of [-1, 1]) w.arc(key, b, clamp(finite(b.radius, 3) + 3, 4, 30),
    angle + sign * 0.6, angle + sign * 2.2, 0.7, TINTS.bridge,
    { boundary: true, flow: 0, family: 1, born: bridge.createdAt });
  const age = Math.max(0, now - finite(bridge.lastImpulseAt, -100));
  if (age < 0.45) {
    const t = w.motion ? clamp(age / 0.45, 0.12, 0.88) : 0.5;
    const p = { x: a.x + dx * t, z: a.z + dz * t };
    const direction = bridge.lastSourceId === b.id ? angle + Math.PI : angle;
    w.chevron(key, p, direction, 4.5, TINTS.ivory,
      { flow: 0, alpha: 0.75 * (1 - age / 0.45), born: now - 0.2, boundary: true });
  }
  const fraction = clamp(finite(bridge.fraction, tensioned ? 0.45 : 0.3), 0, 0.5);
  frame.status = { label: 'LOAD BRIDGE', text: `${Math.round(fraction * 100)}% transfer ceiling · ${tensioned ? 'Rig braced · increased drain' : 'live tension · capacitor drain'}`,
    hint: 'Three teeth mark the pinned end. A heavier partner receives less velocity.', warning: true,
    endpointIds: [a.id, b.id], fraction };
}

/** Pure bounded geometry generation; `snapshot` is never mutated or retained. */
export function buildCatalystPresentation(snapshot, options = {}, output = null) {
  const frame = output || createCatalystPresentationFrame();
  frame.surfaces.length = 0; frame.keys.length = 0; frame.count = 0; frame.status = null;
  if (!snapshot || !IDS.has(snapshot.catalystId)) return frame;
  const now = Math.max(0, finite(options.simTime, finite(snapshot.simTime)));
  const w = writer(frame, options, now);
  if (snapshot.catalystId === 'orbital_magazine') drawMagazine(snapshot, frame, w, now);
  else if (snapshot.catalystId === 'aftershock_core') drawEcho(snapshot, frame, w, now);
  else drawBridge(snapshot, frame, w, now);
  return frame;
}

/**
 * Production adapter. Renderer construction supplies:
 *   new SweptSurfaceBatch(scene, {capacity:80,name:'SF_KineticCatalysts',fieldVolume:true})
 * Pass renderer's existing `toLocal(x,z,out)` when floating origins are enabled.
 * Update from the normal render pass using simulation time/settings, never a new RAF.
 */
export function createCatalystPresentationAdapter({ surfaceBatch, toLocal = null, ownsBatch = true } = {}) {
  if (!surfaceBatch || !['begin', 'add', 'end'].every(k => typeof surfaceBatch[k] === 'function')) {
    throw new TypeError('Kinetic catalyst presentation requires the existing SweptSurfaceBatch API.');
  }
  const frame = createCatalystPresentationFrame();
  const scratch = new Float32Array(36), local = { x: 0, z: 0 };
  let previous = [], residues = [], lastTime = -1, catalystId = null, disposed = false;
  function project(d, origin) {
    scratch.set(d);
    if (toLocal) {
      toLocal(d[0], d[2], local); scratch[0] = local.x; scratch[2] = local.z;
      toLocal(d[32], d[33], local); scratch[32] = local.x; scratch[33] = local.z;
    } else if (boundedPoint(origin)) {
      scratch[0] = d[0] - origin.x; scratch[2] = d[2] - origin.z;
      scratch[32] = d[32] - origin.x; scratch[33] = d[33] - origin.z;
    }
    return scratch.every(Number.isFinite) ? scratch : null;
  }
  return {
    update(snapshot, options = {}) {
      if (disposed) return { count: 0, residues: 0, status: null };
      const now = Math.max(0, finite(options.simTime, finite(snapshot?.simTime)));
      const nextId = snapshot?.catalystId ?? null;
      if (now < lastTime || nextId !== catalystId) { previous = []; residues = []; }
      lastTime = now; catalystId = nextId;
      buildCatalystPresentation(snapshot, { ...options, simTime: now, origin: { x: 0, z: 0 } }, frame);
      // A producer may omit cosmetic birth metadata. Retain the first seen
      // birth per physical identity so a powered, stationary bridge still flows.
      const births = new Map(previous.map(row => [row.key, row.data[24]]));
      for (let i = 0; i < frame.count; i++) {
        if (births.has(frame.keys[i])) frame.surfaces[i][24] = births.get(frame.keys[i]);
      }
      const keys = new Set(frame.keys);
      for (const prev of previous) {
        if (keys.has(prev.key) || prev.data[29] === 1 || residues.length >= CATALYST_PRESENTATION_LIMITS.residueSurfaces) continue;
        const d = prev.data.slice();
        d[26] = now; d[29] = 2;
        residues.push({ data: d, until: now + CATALYST_PRESENTATION_LIMITS.residueSeconds });
      }
      residues = residues.filter(row => row.until > now);
      surfaceBatch.begin(now, options.reducedMotion === true, options.reducedFlash === true);
      for (const d of frame.surfaces) { const localData = project(d, options.origin); if (localData) surfaceBatch.add(localData); }
      for (const row of residues) { const localData = project(row.data, options.origin); if (localData) surfaceBatch.add(localData); }
      surfaceBatch.end();
      previous = frame.surfaces.map((data, i) => ({ key: frame.keys[i], data: data.slice() }));
      return { count: frame.count, residues: residues.length, status: frame.status };
    },
    clear() {
      if (disposed) return;
      previous = []; residues = []; catalystId = null;
      surfaceBatch.begin(Math.max(0, lastTime), true, true); surfaceBatch.end();
    },
    dispose() {
      if (disposed) return;
      previous = []; residues = []; disposed = true;
      if (ownsBatch && typeof surfaceBatch.dispose === 'function') surfaceBatch.dispose();
      else { surfaceBatch.begin(Math.max(0, lastTime), true, true); surfaceBatch.end(); }
    },
  };
}
