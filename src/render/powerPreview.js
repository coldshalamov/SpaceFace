// Row 493 (CRAFT-POWERS): the held-key power preview. Draws the plan from src/data/powerPreview.js
// in the power's own tint: the shapes the release makes (a field ring, the cone wedge, the scoop
// sheet, a throw or drift line, blast rings) and, for every body it moves, a ring plus the
// predicted path ending in an arrowhead. A heavy the field barely moves reads muted; a power that
// cannot fire yet (recharging, empty) draws dim. Presentation only: it never touches sim state.
// Every stroke — rings included — is a flat ribbon of constant width in world units: a WebGL line
// is always one pixel (the busy field effects swallow it), and a scaled ring mesh would fatten with
// the body. Every pool is built once, so a held key allocates nothing per frame; nothing animates
// (reduced-motion safe).
const TINT_HEX = Object.freeze({
  amber: 0xf0a33a, red: 0xe04836, blue: 0x4a9de0, orange: 0xe07830, white: 0xf4f1e8,
});
const SHRUG_HEX = 0x8a919c;
const BODY_POOL = 24;      // matches the plan's cap (nearest bodies first)
const RING_POOL = 8;       // field, blast, lock and trap rings
const OUTLINE_POOL = 6;    // wedge, sheet and route outlines
const OUTLINE_POINTS = 96;
const PATH_POINTS = 20;    // a field path is 16 points; a blast arrow 2–4
const PATH_HALF_WU = 0.45; // ~0.9 WU stroke
const OUTLINE_HALF_WU = 0.35;
const BODY_RING_HALF_WU = 0.55;
const MARKED_RING_HALF_WU = 0.9;
const AREA_RING_HALF_WU = 0.5;
const BODY_RING_SEGMENTS = 40;
const AREA_RING_SEGMENTS = 96;
const ARROW_LEN_WU = 6;
const ARROW_HALF_WU = 3.2;
const Y = 0.6;
const BLOCKED_DIM = 0.35;
const ROLE_OPACITY = Object.freeze({
  field: 0.55, blast: 0.7, armed: 0.38, lock: 0.6, trap: 0.5, fold: 0.3, route: 0.5,
});

export function createPowerPreview({ THREE, scene }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const basic = () => new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
  });
  // A strip of quads along up to `points` points: two vertices per point, indices fixed once.
  const ribbon = (points) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 6), 3));
    const index = new Uint16Array((points - 1) * 6);
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.set([a, b, c, b, d, c], i * 6);
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geo, basic());
    mesh.visible = false;
    mesh.frustumCulled = false; // rewritten in place; its bounds are never recomputed
    group.add(mesh);
    return mesh;
  };
  const arrow = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const mesh = new THREE.Mesh(geo, basic());
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  const bodyRings = [];
  const paths = [];
  const arrows = [];
  for (let i = 0; i < BODY_POOL + 1; i++) bodyRings.push(ribbon(BODY_RING_SEGMENTS + 1)); // +1: a plate's host
  for (let i = 0; i < BODY_POOL; i++) { paths.push(ribbon(PATH_POINTS)); arrows.push(arrow()); }
  const areaRings = [];
  for (let i = 0; i < RING_POOL; i++) areaRings.push(ribbon(AREA_RING_SEGMENTS + 1));
  const outlines = [];
  for (let i = 0; i < OUTLINE_POOL; i++) outlines.push(ribbon(OUTLINE_POINTS));

  const p0 = { x: 0, z: 0 };
  let toLocal = null;
  const loc = (x, z, out) => (toLocal ? toLocal(x, z, out) : ((out.x = x), (out.z = z), out));

  function hideFrom(list, start) {
    for (let i = start; i < list.length; i++) list[i].visible = false;
  }

  function tint(mesh, hex, opacity) {
    mesh.material.color.setHex(hex);
    mesh.material.opacity = opacity;
  }

  function vertex(arr, v, x, z) {
    loc(x, z, p0);
    arr[v * 3] = p0.x; arr[v * 3 + 1] = Y; arr[v * 3 + 2] = p0.z;
  }

  // A circle as a closed ribbon of constant stroke `half` either side of radius r.
  function placeRing(mesh, x, z, r, half, hex, opacity) {
    const arr = mesh.geometry.attributes.position.array;
    const segments = arr.length / 6 - 1;
    const inner = Math.max(0, r - half), outer = r + half;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      vertex(arr, i * 2, x + c * inner, z + s * inner);
      vertex(arr, i * 2 + 1, x + c * outer, z + s * outer);
    }
    mesh.geometry.setDrawRange(0, segments * 6);
    mesh.geometry.attributes.position.needsUpdate = true;
    tint(mesh, hex, opacity);
    mesh.visible = true;
  }

  // Writes a ribbon through world points (flat x,z pairs shifted by dx/dz). `closed` joins the last
  // point back to the first. Returns false when there is nothing to draw.
  function writeRibbon(mesh, pts, count, dx, dz, half, closed) {
    const arr = mesh.geometry.attributes.position.array;
    const cap = arr.length / 6;
    const n = Math.min(count + (closed ? 1 : 0), cap);
    if (n < 2) { mesh.visible = false; return false; }
    const px = (i) => pts[(i % count) * 2] + dx;
    const pz = (i) => pts[(i % count) * 2 + 1] + dz;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = px(b) - px(a), tz = pz(b) - pz(a);
      const len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      const x = px(i), z = pz(i);
      vertex(arr, i * 2, x - tz * half, z + tx * half);
      vertex(arr, i * 2 + 1, x + tz * half, z - tx * half);
    }
    mesh.geometry.setDrawRange(0, (n - 1) * 6);
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.visible = true;
    return true;
  }

  const shape = new Float64Array(OUTLINE_POINTS * 2);
  function areaOutline(mesh, a, hex, opacity) {
    tint(mesh, hex, opacity);
    if (a.kind === 'wedge') {
      const segs = 30;
      const base = Math.atan2(a.dirZ, a.dirX);
      shape[0] = a.x; shape[1] = a.z;
      let count = 1;
      for (let i = 0; i <= segs; i++) {
        const ang = base - a.half + (2 * a.half * i) / segs;
        shape[count * 2] = a.x + Math.cos(ang) * a.r; shape[count * 2 + 1] = a.z + Math.sin(ang) * a.r; count++;
      }
      return writeRibbon(mesh, shape, count, 0, 0, OUTLINE_HALF_WU, true);
    }
    if (a.kind === 'sheet') {
      const lx = -a.dirZ * a.halfWidth, lz = a.dirX * a.halfWidth;
      const fx = a.dirX * a.length, fz = a.dirZ * a.length;
      shape[0] = a.x + lx; shape[1] = a.z + lz;
      shape[2] = a.x + fx + lx; shape[3] = a.z + fz + lz;
      shape[4] = a.x + fx - lx; shape[5] = a.z + fz - lz;
      shape[6] = a.x - lx; shape[7] = a.z - lz;
      return writeRibbon(mesh, shape, 4, 0, 0, OUTLINE_HALF_WU, true);
    }
    const pts = a.points || []; // route: an open polyline
    return writeRibbon(mesh, pts, Math.min(pts.length / 2, OUTLINE_POINTS), 0, 0, OUTLINE_HALF_WU, false);
  }

  // A body's path as a ribbon that stops short of its end, plus a solid arrowhead at the end.
  function bodyPath(mesh, head, path, dx, dz, hex, opacity) {
    tint(mesh, hex, opacity);
    tint(head, hex, Math.min(1, opacity + 0.15));
    const count = Math.min(path.length / 2, PATH_POINTS);
    const ex = path[count * 2 - 2] + dx, ez = path[count * 2 - 1] + dz;
    const sx = path[0] + dx, sz = path[1] + dz;
    if (count < 2 || Math.hypot(ex - sx, ez - sz) < 1) { mesh.visible = false; head.visible = false; return; }
    // The last segment's direction points the arrowhead.
    let bx = path[count * 2 - 4] + dx, bz = path[count * 2 - 3] + dz;
    let ux = ex - bx, uz = ez - bz;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-6) { ux = ex - sx; uz = ez - sz; ul = Math.hypot(ux, uz) || 1; }
    ux /= ul; uz /= ul;
    writeRibbon(mesh, path, count, dx, dz, PATH_HALF_WU, false);
    const arr = head.geometry.attributes.position.array;
    vertex(arr, 0, ex + ux * ARROW_LEN_WU * 0.35, ez + uz * ARROW_LEN_WU * 0.35);
    vertex(arr, 1, ex - ux * ARROW_LEN_WU * 0.65 - uz * ARROW_HALF_WU, ez - uz * ARROW_LEN_WU * 0.65 + ux * ARROW_HALF_WU);
    vertex(arr, 2, ex - ux * ARROW_LEN_WU * 0.65 + uz * ARROW_HALF_WU, ez - uz * ARROW_LEN_WU * 0.65 - ux * ARROW_HALF_WU);
    head.geometry.attributes.position.needsUpdate = true;
    head.visible = true;
  }

  return {
    group,
    /**
     * @param {ReturnType<import('../data/powerPreview.js').powerPreviewPlan>} plan
     * @param {(x:number, z:number, out:{x:number,z:number}) => {x:number,z:number}} [localize]
     * @param {object} [state] read-only: rings follow each body's live position between plans
     */
    update(plan, localize = null, state = null) {
      toLocal = localize;
      if (!plan) {
        group.visible = false;
        hideFrom(bodyRings, 0); hideFrom(paths, 0); hideFrom(arrows, 0); hideFrom(areaRings, 0); hideFrom(outlines, 0);
        return false;
      }
      group.visible = true;
      const hex = TINT_HEX[plan.tint] ?? 0xffffff;
      const dim = plan.blocked ? BLOCKED_DIM : 1;
      let ri = 0, oi = 0;
      for (const a of plan.areas || []) {
        const opacity = (ROLE_OPACITY[a.role] ?? 0.5) * dim;
        if (a.kind === 'ring') {
          if (ri < areaRings.length) placeRing(areaRings[ri++], a.x, a.z, Math.max(1, a.r), AREA_RING_HALF_WU, hex, opacity);
        } else if (oi < outlines.length) {
          areaOutline(outlines[oi++], a, hex, opacity);
        }
      }
      hideFrom(areaRings, ri); hideFrom(outlines, oi);

      const entities = state && state.entities && typeof state.entities.get === 'function' ? state.entities : null;
      const moves = plan.moves || [];
      let bi = 0;
      for (let i = 0; i < paths.length; i++) {
        const m = moves[i];
        if (!m) { paths[i].visible = false; arrows[i].visible = false; continue; }
        const live = entities ? entities.get(m.id) : null;
        const dx = live && live.pos ? live.pos.x - m.x : 0;
        const dz = live && live.pos ? live.pos.z - m.z : 0;
        const color = m.shrug ? SHRUG_HEX : hex;
        const ringOpacity = (m.shrug ? 0.45 : m.marked ? 1 : 0.85) * dim;
        const r = Math.max(4, (m.radius || 8) * (m.marked ? 1.35 : 1.2) + 1.5);
        placeRing(bodyRings[bi++], m.x + dx, m.z + dz, r, m.marked ? MARKED_RING_HALF_WU : BODY_RING_HALF_WU, color, ringOpacity);
        bodyPath(paths[i], arrows[i], m.path || [m.x, m.z, m.toX, m.toZ], dx, dz, color, (m.shrug ? 0.4 : 0.75) * dim);
      }
      if (plan.host && bi < bodyRings.length) {
        const h = plan.host;
        const live = entities ? entities.get(h.id) : null;
        const hx = live && live.pos ? live.pos.x : h.x, hz = live && live.pos ? live.pos.z : h.z;
        placeRing(bodyRings[bi++], hx, hz, Math.max(4, h.radius * 1.3 + 1.5), MARKED_RING_HALF_WU, hex, 0.9 * dim);
      }
      hideFrom(bodyRings, bi);
      return true;
    },
    dispose() {
      scene.remove(group);
      for (const m of [...bodyRings, ...areaRings, ...paths, ...arrows, ...outlines]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
