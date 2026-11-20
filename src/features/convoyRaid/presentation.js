/**
 * SWITCHBACK's physical-readability layer. This module never owns an entity,
 * applies an impulse, advances a timer, or changes a mission result.
 *
 * The pure, reusable frame is also the contract for a HUD/accessible receipt.
 * Three is injected only into the renderer factory, keeping the public feature
 * entry importable by node:test and by the deterministic simulation.
 */

export const SWITCHBACK_PRESENTATION_LIMITS = Object.freeze({
  bodies: 6, couplers: 5, escorts: 3, physicalSegments: 72, cueSegments: 256,
});

const P = SWITCHBACK_PRESENTATION_LIMITS;
const TAU = Math.PI * 2;
const FINITE_LIMIT = 1e8;
const EMPTY = Object.freeze([]);
const COLOR = Object.freeze({
  rail: 0xa8b9be, target: 0x7ef4db, warning: 0xffb955, danger: 0xff715c,
  quiet: 0xe8e3cf, lawful: 0xb4dcff, illicit: 0x7ef4db, broken: 0x898c94,
});
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? clamp(v, -FINITE_LIMIT, FINITE_LIMIT) : fallback;
const idOf = v => typeof v === 'string' || Number.isSafeInteger(v) ? v : null;
const boundedText = (v, fallback = '') => typeof v === 'string' ? v.slice(0, 96) : fallback;

function blankBody() {
  return { id: null, role: '', target: false, x: 0, z: 0, vx: 0, vz: 0,
    angle: 0, halfLength: 1, halfWidth: 1, radius: 1, lost: false };
}
function blankCoupler() {
  return { id: null, ax: 0, az: 0, bx: 0, bz: 0, midX: 0, midZ: 0,
    length: 0, strain: 0, integrity: 1, braced: false, severed: false,
    targetBoundary: false, quietProgress: 0, valid: false };
}
function blankEscort() {
  return { id: null, x: 0, z: 0, toX: 0, toZ: 0, mode: '', valid: false };
}
function blankReceiver() { return { x: 0, z: 0, radius: 0, valid: false, selected: false }; }

/** Allocate once when a run/presentation owner starts, then reuse via write... . */
export function createSwitchbackPresentationFrame() {
  return {
    schemaVersion: 1, runId: '', active: false, visible: false, simTime: 0,
    mode: '', phase: '', targetId: null, targetSerial: '', targetIndex: -1,
    targetDetached: false, targetAlone: false, targetLost: false,
    forkCrossed: false, targetSpeed: 0, receiverHoldS: 0, noise: 0,
    bodyCount: 0, couplerCount: 0, escortCount: 0, recoveryCount: 0,
    bodies: Array.from({ length: P.bodies }, blankBody),
    couplers: Array.from({ length: P.couplers }, blankCoupler),
    escorts: Array.from({ length: P.escorts }, blankEscort),
    recovery: Array.from({ length: P.escorts }, () => ({ ax: 0, az: 0, bx: 0, bz: 0 })),
    fork: { x: 0, z: 0, nx: 1, nz: 0, halfWidth: 0, valid: false },
    lawful: blankReceiver(), illicit: blankReceiver(),
    // Scratch belongs to presentation only, never save it in the raid state.
    _connected: new Uint8Array(P.bodies),
    _status: { runId: null, mode: null, phase: null, targetSerial: null, targetLost: null,
      targetDetached: null, targetAlone: null, forkCrossed: null, braced: null, strained: null, outcome: null },
    readout: { title: 'SWITCHBACK', target: '', objective: '', status: '',
      couplerLegend: 'Twin rails: coupled. Open jaws: severed. Cross braces: locked. Teeth: rising strain.',
      targetLegend: 'Double corner brackets and three bars mark the target carriage.',
      severity: 'info' },
  };
}

function bodyIndex(frame, id) {
  for (let i = 0; i < frame.bodyCount; i++) if (frame.bodies[i].id === id) return i;
  return -1;
}
function copyReceiver(out, source, selected) {
  out.valid = !!source && Number.isFinite(source.x) && Number.isFinite(source.z)
    && Number.isFinite(source.radius) && source.radius > 0;
  out.x = finite(source?.x); out.z = finite(source?.z);
  out.radius = clamp(finite(source?.radius), 0, 180); out.selected = selected;
}

/**
 * Read only projection of the controller and train. `options.escortBodies` is
 * an optional array of current physics observations {id,x,z}; orders alone
 * never invent an escort's position. `options.simTime` is the authoritative
 * sim clock. No wall time, independent animation clock, or Three objects.
 */
export function writeSwitchbackPresentationFrame(out, raid, train, options = {}) {
  out.visible = !!raid && !!train && options.visible !== false;
  out.active = out.visible && raid.phase === 'running';
  out.bodyCount = out.couplerCount = out.escortCount = out.recoveryCount = 0;
  out.targetIndex = -1; out.targetLost = true; out.targetDetached = false; out.targetAlone = false;
  out.fork.valid = out.lawful.valid = out.illicit.valid = false;
  if (!out.visible) return out;
  out.runId = boundedText(raid.runId);
  out.simTime = Math.max(0, finite(options.simTime, finite(raid.startedAt) + finite(raid.elapsed)));
  out.mode = raid.mode === 'theft' ? 'theft' : raid.mode === 'escort' ? 'escort' : '';
  out.phase = boundedText(raid.phase);
  out.targetId = idOf(raid.targetId ?? train.targetId);
  out.targetSerial = boundedText(raid.targetSerial, 'MARKED FREIGHT');
  out.forkCrossed = raid.forkCrossed === true;
  out.receiverHoldS = Math.max(0, finite(raid.receiverHoldS));
  out.noise = Math.max(0, finite(raid.noise));
  const bodies = Array.isArray(train.bodies) ? train.bodies : EMPTY;
  out.bodyCount = Math.min(P.bodies, bodies.length);
  for (let i = 0; i < out.bodyCount; i++) {
    const src = bodies[i], dest = out.bodies[i];
    dest.id = idOf(src.id); dest.role = src.role === 'tug' ? 'tug' : 'carriage';
    dest.target = src.id === out.targetId; dest.lost = src.lost === true || !(src.hp > 0);
    dest.x = finite(src.x); dest.z = finite(src.z); dest.vx = finite(src.vx); dest.vz = finite(src.vz);
    dest.angle = finite(src.angle); dest.radius = clamp(finite(src.radius, 3), .25, 60);
    dest.halfLength = clamp(finite(src.halfLength, dest.radius), .25, 80);
    dest.halfWidth = clamp(finite(src.halfWidth, dest.radius), .25, 60);
    if (dest.target) { out.targetIndex = i; out.targetLost = dest.lost; out.targetSpeed = Math.hypot(dest.vx, dest.vz); }
  }
  const couplers = Array.isArray(train.couplers) ? train.couplers : EMPTY;
  out.couplerCount = Math.min(P.couplers, couplers.length);
  for (let i = 0; i < out.couplerCount; i++) {
    const src = couplers[i], dest = out.couplers[i];
    const ai = bodyIndex(out, src.aId), bi = bodyIndex(out, src.bId);
    dest.id = idOf(src.id); dest.valid = ai >= 0 && bi >= 0;
    dest.quietProgress = raid.quietLatch?.couplerId === src.id
      ? clamp(finite(raid.quietLatch.heldS) / Math.max(.01, finite(raid.quietLatch.requiredS, 1)), 0, 1) : 0;
    dest.severed = src.severed === true; dest.braced = finite(src.braceUntil) > out.simTime;
    dest.integrity = clamp(finite(src.integrity, 1), 0, 1);
    dest.strain = clamp(finite(src.strain), 0, 1);
    dest.targetBoundary = src.aId === out.targetId || src.bId === out.targetId;
    if (!dest.valid) continue;
    const a = out.bodies[ai], b = out.bodies[bi];
    dest.valid = !a.lost && !b.lost;
    // The exact train solver endpoints: A's rear, B's front, in XZ yaw.
    dest.ax = a.x - Math.cos(a.angle) * a.halfLength;
    dest.az = a.z - Math.sin(a.angle) * a.halfLength;
    dest.bx = b.x + Math.cos(b.angle) * b.halfLength;
    dest.bz = b.z + Math.sin(b.angle) * b.halfLength;
    dest.midX = (dest.ax + dest.bx) * .5; dest.midZ = (dest.az + dest.bz) * .5;
    dest.length = Math.hypot(dest.bx - dest.ax, dest.bz - dest.az);
  }
  // Six-node reachability, bounded independently of malformed save input.
  out._connected.fill(0);
  if (out.targetIndex >= 0 && !out.targetLost) out._connected[out.targetIndex] = 1;
  for (let pass = 0; pass < P.bodies; pass++) {
    let changed = false;
    for (let i = 0; i < out.couplerCount; i++) {
      const src = couplers[i], cue = out.couplers[i];
      if (!cue.valid || cue.severed) continue;
      const ai = bodyIndex(out, src.aId), bi = bodyIndex(out, src.bId);
      if ((out._connected[ai] || out._connected[bi]) && !(out._connected[ai] && out._connected[bi])) {
        out._connected[ai] = out._connected[bi] = 1; changed = true;
      }
    }
    if (!changed) break;
  }
  let connectedCount = 0, connectedTug = false;
  for (let i = 0; i < out.bodyCount; i++) if (out._connected[i]) {
    connectedCount++; if (out.bodies[i].role === 'tug') connectedTug = true;
  }
  out.targetDetached = !out.targetLost && !connectedTug;
  out.targetAlone = !out.targetLost && connectedCount === 1;
  const fork = train.route?.fork;
  out.fork.valid = !!fork && Number.isFinite(fork.x) && Number.isFinite(fork.z)
    && Number.isFinite(fork.halfWidth) && fork.halfWidth > 0;
  if (out.fork.valid) {
    out.fork.x = finite(fork.x); out.fork.z = finite(fork.z);
    const n = Math.hypot(finite(fork.nx), finite(fork.nz));
    out.fork.nx = n > .001 ? fork.nx / n : 1; out.fork.nz = n > .001 ? fork.nz / n : 0;
    out.fork.halfWidth = clamp(fork.halfWidth, 1, 180);
  }
  copyReceiver(out.lawful, train.route?.receivers?.lawful, out.mode === 'escort');
  copyReceiver(out.illicit, train.route?.receivers?.illicit, out.mode === 'theft');
  const orders = Array.isArray(raid.escortOrders) ? raid.escortOrders : EMPTY;
  const escortBodies = options.escortBodies || EMPTY;
  for (let i = 0; i < Math.min(P.escorts, orders.length); i++) {
    const order = orders[i], cue = out.escorts[out.escortCount];
    let escort = null;
    for (let j = 0; j < Math.min(P.escorts, escortBodies.length); j++) if (escortBodies[j].id === order.escortId) {
      escort = escortBodies[j]; break;
    }
    if (!escort || !Number.isFinite(escort.x) || !Number.isFinite(escort.z)) continue;
    cue.id = idOf(order.escortId); cue.x = finite(escort.x); cue.z = finite(escort.z);
    cue.toX = finite(order.x, cue.x); cue.toZ = finite(order.z, cue.z);
    cue.mode = boundedText(order.mode); cue.valid = true; out.escortCount++;
  }
  const recovery = options.recoveryLinks || EMPTY;
  for (let i = 0; i < Math.min(P.escorts, recovery.length); i++) {
    const source = recovery[i];
    if (!Number.isFinite(source.ax) || !Number.isFinite(source.az)
      || !Number.isFinite(source.bx) || !Number.isFinite(source.bz)) continue;
    const dest = out.recovery[out.recoveryCount++];
    dest.ax = finite(source.ax); dest.az = finite(source.az); dest.bx = finite(source.bx); dest.bz = finite(source.bz);
  }
  updateReadout(out, raid);
  return out;
}

function updateReadout(frame, raid) {
  let braced = false, strained = false;
  for (let i = 0; i < frame.couplerCount; i++) {
    const c = frame.couplers[i]; if (!c.valid || c.severed) continue;
    braced ||= c.braced; strained ||= c.strain > .45;
  }
  // Text allocation only on a semantic transition, not on every render frame.
  const old = frame._status, outcome = raid.outcome || '';
  if (old.runId === frame.runId && old.mode === frame.mode && old.phase === frame.phase
    && old.targetSerial === frame.targetSerial && old.targetLost === frame.targetLost
    && old.targetDetached === frame.targetDetached && old.targetAlone === frame.targetAlone
    && old.forkCrossed === frame.forkCrossed && old.braced === braced && old.strained === strained
    && old.outcome === outcome) return;
  old.runId = frame.runId; old.mode = frame.mode; old.phase = frame.phase; old.targetSerial = frame.targetSerial;
  old.targetLost = frame.targetLost; old.targetDetached = frame.targetDetached; old.targetAlone = frame.targetAlone;
  old.forkCrossed = frame.forkCrossed; old.braced = braced; old.strained = strained; old.outcome = outcome;
  const r = frame.readout;
  r.target = `${frame.targetSerial} · ${frame.targetLost ? 'LOST' : frame.targetAlone ? 'FREE CARRIAGE' : frame.targetDetached ? 'DETACHED CHAIN' : 'COUPLED'}`;
  r.severity = frame.targetLost ? 'danger' : braced || strained ? 'warn' : 'info';
  if (frame.phase === 'settled') {
    r.objective = 'Run settled'; r.status = boundedText(raid.outcome, 'Complete'); return;
  }
  if (frame.targetLost) {
    r.objective = 'The marked carriage is lost.'; r.status = 'Surviving freight remains physical.';
  } else if (frame.mode === 'escort') {
    r.objective = 'Protect the marked freight to its lawful receiver.';
    r.status = frame.targetDetached ? 'Recover the straggler. Keep the receiver approach slow.'
      : 'Stay with the train; escorts will recover loose freight.';
  } else if (!frame.targetDetached) {
    r.objective = 'Free the marked carriage, then cross the extraction fork.';
    r.status = braced ? 'CROSS BRACES: latch locked. Wait for the service window or overload it.'
      : strained ? 'TEETH: load rising. A severed link releases the chain at its current velocity.'
        : 'Open both adjacent couplers for a single-carriage theft. Pull, Shove, Pin or Rig change the load.';
  } else if (!frame.forkCrossed) {
    r.objective = 'Tow or steer the marked freight through the fork arrows.';
    r.status = frame.targetAlone ? 'One carriage free. Its momentum is yours to manage.'
      : 'A chain came loose. Another coupler cut reduces the mass you must steer.';
  } else {
    r.objective = 'Deliver the marked freight to the receiver and brake to settle.';
    r.status = 'The carriage and your ship must both reach the receiver. A fly-by does not deliver.';
  }
}

/** One-shot convenience for diagnostics/tests; use write... with a retained frame in production. */
export function projectSwitchbackPresentation(raid, train, options) {
  return writeSwitchbackPresentationFrame(createSwitchbackPresentationFrame(), raid, train, options);
}

/**
 * Production view adapter. `THREE` is the game's installed Three namespace.
 * `toLocalXZ(x,z,out)` is the renderer's floating-origin conversion. Omit it
 * only in renderers whose scene uses absolute world coordinates.
 *
 * Physical links are lit six-facet rods; this is constraint geometry, never a
 * substitute for the authored tug/carriage/escort bodies. Target/route glyphs
 * are explicit world-space affordances with shape and text equivalents.
 */
export function createSwitchbackPresentation(THREE, scene, options = {}) {
  if (!THREE?.InstancedMesh || !THREE?.BufferGeometry || !scene?.add) {
    throw new TypeError('SWITCHBACK presentation requires the game Three namespace and scene.');
  }
  const root = new THREE.Group(); root.name = 'SF_SwitchbackPhysicalCues';
  const railGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .68,
    roughness: .34, emissive: 0x162527, emissiveIntensity: .3, flatShading: true });
  const rails = new THREE.InstancedMesh(railGeometry, railMaterial, P.physicalSegments);
  rails.name = 'SF_SwitchbackCouplerRods'; rails.count = 0; rails.frustumCulled = false;
  rails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Admit the instance-color buffer during construction, not on the first
  // visible coupling update (where it could change shader defines mid-frame).
  rails.setColorAt(0, new THREE.Color(0xffffff));
  rails.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  const lineGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(P.cueSegments * 6), colors = new Float32Array(P.cueSegments * 6);
  const positionAttribute = new THREE.BufferAttribute(positions, 3), colorAttribute = new THREE.BufferAttribute(colors, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage); colorAttribute.setUsage(THREE.DynamicDrawUsage);
  lineGeometry.setAttribute('position', positionAttribute); lineGeometry.setAttribute('color', colorAttribute);
  lineGeometry.setDrawRange(0, 0);
  const cueMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    opacity: .87, depthTest: true, depthWrite: false, toneMapped: false });
  const cues = new THREE.LineSegments(lineGeometry, cueMaterial);
  cues.name = 'SF_SwitchbackTargetForkBraceTells'; cues.frustumCulled = false;
  root.add(rails); root.add(cues); scene.add(root);
  const pose = new THREE.Object3D(), axis = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color(), localA = { x: 0, z: 0 }, localB = { x: 0, z: 0 };
  let disposed = false, physicalCount = 0, cueCount = 0;
  let reducedMotion = false, reducedFlash = false;
  const localize = typeof options.toLocalXZ === 'function' ? options.toLocalXZ
    : (x, z, out) => { out.x = x; out.z = z; return out; };

  function line(ax, az, bx, bz, color, y = 2.4) {
    if (cueCount >= P.cueSegments) return;
    localize(ax, az, localA); localize(bx, bz, localB);
    if (!Number.isFinite(localA.x) || !Number.isFinite(localA.z)
      || !Number.isFinite(localB.x) || !Number.isFinite(localB.z)) return;
    const n = cueCount++ * 6;
    positions[n] = localA.x; positions[n + 1] = y; positions[n + 2] = localA.z;
    positions[n + 3] = localB.x; positions[n + 4] = y; positions[n + 5] = localB.z;
    tint.setHex(color);
    for (let k = 0; k < 6; k += 3) { colors[n + k] = tint.r; colors[n + k + 1] = tint.g; colors[n + k + 2] = tint.b; }
  }
  function rod(ax, az, bx, bz, radius, color, y = .65) {
    if (physicalCount >= P.physicalSegments) return;
    localize(ax, az, localA); localize(bx, bz, localB);
    axis.set(localB.x - localA.x, 0, localB.z - localA.z);
    const length = axis.length();
    if (!Number.isFinite(length) || length < .001) return;
    pose.position.set((localA.x + localB.x) * .5, y, (localA.z + localB.z) * .5);
    axis.multiplyScalar(1 / length); pose.quaternion.setFromUnitVectors(up, axis);
    pose.scale.set(radius, length, radius); pose.updateMatrix();
    rails.setMatrixAt(physicalCount, pose.matrix); tint.setHex(color); rails.setColorAt(physicalCount++, tint);
  }
  function arrow(x, z, tx, tz, size, color, y = 2.4) {
    const nx = -tz, nz = tx;
    line(x - tx * size + nx * size * .55, z - tz * size + nz * size * .55, x, z, color, y);
    line(x - tx * size - nx * size * .55, z - tz * size - nz * size * .55, x, z, color, y);
  }
  function drawCoupler(c) {
    if (!c.valid || c.length < .001) return;
    const tx = (c.bx - c.ax) / c.length, tz = (c.bz - c.az) / c.length, nx = -tz, nz = tx;
    const gauge = .42, stub = Math.min(c.length * .18, 1.8);
    if (c.severed) {
      // Four finite stubs: the gap remains genuinely open, even with bloom off.
      for (let side = -1; side <= 1; side += 2) {
        const ox = nx * gauge * side, oz = nz * gauge * side;
        rod(c.ax + ox, c.az + oz, c.ax + tx * stub + ox, c.az + tz * stub + oz, .17, COLOR.broken);
        rod(c.bx + ox, c.bz + oz, c.bx - tx * stub + ox, c.bz - tz * stub + oz, .17, COLOR.broken);
      }
      return;
    }
    const tone = c.braced ? COLOR.warning : c.strain > .7 ? COLOR.danger : COLOR.rail;
    for (let side = -1; side <= 1; side += 2) {
      const ox = nx * gauge * side, oz = nz * gauge * side;
      rod(c.ax + ox, c.az + oz, c.bx + ox, c.bz + oz, .19, tone);
    }
    // A mechanically legible latch across the actual anchor span.
    const collar = 1.05;
    rod(c.midX - nx * collar, c.midZ - nz * collar, c.midX + nx * collar, c.midZ + nz * collar, .24, tone);
    if (c.braced) {
      const arm = Math.min(c.length * .27, 2.8), wide = 1.2;
      rod(c.midX - tx * arm - nx * wide, c.midZ - tz * arm - nz * wide,
        c.midX + tx * arm + nx * wide, c.midZ + tz * arm + nz * wide, .16, tone, 1.1);
      rod(c.midX - tx * arm + nx * wide, c.midZ - tz * arm + nz * wide,
        c.midX + tx * arm - nx * wide, c.midZ + tz * arm - nz * wide, .16, tone, 1.1);
    }
    const teeth = c.strain >= .75 ? 3 : c.strain >= .45 ? 2 : c.strain > .15 ? 1 : 0;
    for (let i = 0; i < teeth; i++) {
      const offset = (i - (teeth - 1) / 2) * 2.1;
      arrow(c.midX + tx * offset + nx * 2, c.midZ + tz * offset + nz * 2, nx, nz, 1.4, COLOR.warning, 2.7);
    }
    if (c.targetBoundary) {
      // Paired nicks identify both cuts needed for a single marked carriage.
      for (let side = -1; side <= 1; side += 2) {
        const x = c.midX + nx * side * 2.6, z = c.midZ + nz * side * 2.6;
        line(x - tx * .9, z - tz * .9, x + tx * .9, z + tz * .9, COLOR.target, 2.5);
      }
    }
    if (c.quietProgress > 0) {
      // Fill length carries progress; no flashing is required to understand it.
      const x = c.midX + nx * 3.7, z = c.midZ + nz * 3.7;
      line(x - tx * 2, z - tz * 2, x + tx * (c.quietProgress * 4 - 2), z + tz * (c.quietProgress * 4 - 2), COLOR.quiet, 2.8);
    }
  }
  function drawTarget(body) {
    if (!body || body.lost) return;
    const tx = Math.cos(body.angle), tz = Math.sin(body.angle), nx = -tz, nz = tx;
    const half = body.halfLength + 2.2, width = body.halfWidth + 1.8, arm = Math.min(half * .32, 3.8);
    const y = Math.max(3, Math.min(8, body.halfWidth * .7));
    // Two nested corner brackets and three dorsal bars remain recognizable in monochrome.
    for (let band = 0; band < 2; band++) for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
      const along = (half + band * 1.05) * sx, across = (width + band * 1.05) * sz;
      const x = body.x + tx * along + nx * across, z = body.z + tz * along + nz * across;
      line(x, z, x - tx * sx * arm, z - tz * sx * arm, COLOR.target, y);
      line(x, z, x - nx * sz * arm, z - nz * sz * arm, COLOR.target, y);
    }
    for (let i = -1; i <= 1; i++) {
      const x = body.x + tx * i * 2, z = body.z + tz * i * 2;
      line(x + nx * (width + 3), z + nz * (width + 3), x + nx * (width + 5.2), z + nz * (width + 5.2), COLOR.target, y);
    }
    // Match the authored encounter's verbal "double-chevron" identification.
    // Two explicit arrows sit on the marked hull rather than on a HUD proxy.
    arrow(body.x + tx * (half * .35), body.z + tz * (half * .35), tx, tz, 3.2, COLOR.target, y + .2);
    arrow(body.x + tx * (half * .35 - 3.6), body.z + tz * (half * .35 - 3.6), tx, tz, 3.2, COLOR.target, y + .2);
  }
  function drawFork(fork, crossed) {
    if (!fork.valid) return;
    const tx = fork.nx, tz = fork.nz, nx = -tz, nz = tx, half = fork.halfWidth;
    const color = crossed ? COLOR.quiet : COLOR.target;
    for (let side = -1; side <= 1; side += 2) {
      const x = fork.x + nx * half * side, z = fork.z + nz * half * side;
      line(x - tx * 7, z - tz * 7, x + tx * 7, z + tz * 7, color);
      line(x + tx * 7, z + tz * 7, x + tx * 7 - nx * side * 5, z + tz * 7 - nz * side * 5, color);
      arrow(x + tx * 2 - nx * side * 4, z + tz * 2 - nz * side * 4, tx, tz, 4, color);
    }
    // Dashes depict a crossing plane, not a solid wall or a blocking collider.
    for (let i = -2; i <= 2; i++) {
      const from = half * (i / 3 - .075), to = half * (i / 3 + .075);
      line(fork.x + nx * from, fork.z + nz * from, fork.x + nx * to, fork.z + nz * to, color, .9);
    }
  }
  function drawReceiver(receiver, color, holdS) {
    if (!receiver.valid) return;
    const radius = receiver.radius, gap = Math.PI / 18;
    // Eight interrupted arcs make a berth; an inner square indicates lawful
    // custody, an inner diamond marks the side-fork receiver.
    for (let i = 0; i < 16; i++) {
      if (i % 2 && !receiver.selected) continue;
      const a = i * TAU / 16 + gap * .3, b = (i + 1) * TAU / 16 - gap * .3;
      line(receiver.x + Math.cos(a) * radius, receiver.z + Math.sin(a) * radius,
        receiver.x + Math.cos(b) * radius, receiver.z + Math.sin(b) * radius, color, .9);
    }
    const phase = color === COLOR.lawful ? Math.PI / 4 : 0;
    for (let i = 0; i < 4; i++) {
      const a = phase + i * Math.PI / 2, b = a + Math.PI / 2, r = radius * .68;
      line(receiver.x + Math.cos(a) * r, receiver.z + Math.sin(a) * r,
        receiver.x + Math.cos(b) * r, receiver.z + Math.sin(b) * r, color, 1.1);
      if (receiver.selected) arrow(receiver.x + Math.cos(a) * radius * .8,
        receiver.z + Math.sin(a) * radius * .8, -Math.cos(a), -Math.sin(a), Math.min(5, radius * .2), color, 1.2);
    }
    if (receiver.selected && holdS > 0) {
      // Static settling teeth, bounded; progression remains controller-owned.
      const count = Math.min(6, Math.ceil(holdS * 2));
      for (let i = 0; i < count; i++) line(receiver.x - 5 + i * 2, receiver.z - 2,
        receiver.x - 5 + i * 2, receiver.z + 2, COLOR.quiet, 1.5);
    }
  }
  function drawEscort(cue) {
    if (!cue.valid) return;
    const dx = cue.toX - cue.x, dz = cue.toZ - cue.z, distance = Math.hypot(dx, dz);
    if (distance < .1) return;
    const tx = dx / distance, tz = dz / distance;
    const len = Math.min(20, distance), color = cue.mode === 'chase' ? COLOR.danger : COLOR.lawful;
    arrow(cue.x + tx * len, cue.z + tz * len, tx, tz, 3.5, color, 4);
    if (cue.mode === 'recover') {
      // A second reversed arrow is the recovery tell, distinct from pursuit.
      arrow(cue.x + tx * (len - 5), cue.z + tz * (len - 5), -tx, -tz, 2.4, color, 4);
    } else if (cue.mode === 'guard' || cue.mode === 'screen') {
      const nx = -tz, nz = tx, x = cue.x + tx * (len + 2), z = cue.z + tz * (len + 2);
      line(x - nx * 3.5, z - nz * 3.5, x + nx * 3.5, z + nz * 3.5, color, 4);
    }
  }

  return {
    root,
    update(frame, settings = {}) {
      if (disposed) return;
      physicalCount = cueCount = 0;
      const a11y = settings.accessibility || settings;
      reducedMotion = !!(settings.video?.motionReduce || a11y.reducedMotion || a11y.motionReduce);
      reducedFlash = !!(settings.video?.flashReduce || a11y.reducedFlash || a11y.flashReduce);
      root.visible = frame?.visible === true;
      if (root.visible) {
        // No orbit, strobe, shake or autonomous clock; reduced motion retains
        // the same unambiguous topology. Flash reduction only lowers luminance.
        railMaterial.emissiveIntensity = reducedFlash ? .1 : .3;
        cueMaterial.opacity = reducedFlash ? .58 : .87;
        for (let i = 0; i < Math.min(P.couplers, frame.couplerCount); i++) drawCoupler(frame.couplers[i]);
        if (frame.targetIndex >= 0 && frame.targetIndex < frame.bodyCount) drawTarget(frame.bodies[frame.targetIndex]);
        if (frame.active) {
          if (frame.mode === 'theft') drawFork(frame.fork, frame.forkCrossed);
          drawReceiver(frame.lawful, COLOR.lawful, frame.receiverHoldS);
          drawReceiver(frame.illicit, COLOR.illicit, frame.receiverHoldS);
          for (let i = 0; i < Math.min(P.escorts, frame.escortCount); i++) drawEscort(frame.escorts[i]);
          for (let i = 0; i < Math.min(P.escorts, frame.recoveryCount); i++) {
            const link = frame.recovery[i];
            const dx = link.bx - link.ax, dz = link.bz - link.az, length = Math.hypot(dx, dz);
            if (length > .1) {
              // This line exists only for an actual runtime recovery spring.
              // Surface insets keep it out of the authored hull, while both
              // endpoints still track the real paired bodies at render time.
              const tx = dx / length, tz = dz / length, inset = Math.min(9, length * .2);
              rod(link.ax + tx * inset, link.az + tz * inset,
                link.bx - tx * inset, link.bz - tz * inset, .14, COLOR.lawful, 1.2);
              arrow((link.ax + link.bx) * .5, (link.az + link.bz) * .5, -tx, -tz, 2.6, COLOR.lawful, 2.6);
            }
          }
        }
      }
      rails.count = physicalCount; rails.visible = physicalCount > 0;
      rails.instanceMatrix.needsUpdate = true;
      if (rails.instanceColor) rails.instanceColor.needsUpdate = true;
      lineGeometry.setDrawRange(0, cueCount * 2); cues.visible = cueCount > 0;
      positionAttribute.needsUpdate = true; colorAttribute.needsUpdate = true;
    },
    inspect() { return { disposed, physicalSegments: physicalCount, cueSegments: cueCount,
      physicalCapacity: P.physicalSegments, cueCapacity: P.cueSegments, reducedMotion, reducedFlash }; },
    dispose() {
      if (disposed) return;
      disposed = true; physicalCount = cueCount = 0;
      root.removeFromParent(); rails.dispose?.(); railGeometry.dispose(); railMaterial.dispose();
      lineGeometry.dispose(); cueMaterial.dispose();
    },
  };
}
