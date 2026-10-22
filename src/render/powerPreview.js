// Row 493 (CRAFT-POWERS): the held-key power preview — one pooled outline + predicted path per
// affected body, in the power's own tint. Presentation-only: consumes the deterministic plan
// from src/data/powerPreview.js; it never touches sim state.
const TINT_HEX = Object.freeze({
  amber: 0xf0a33a, red: 0xe04836, blue: 0x4a9de0, orange: 0xe07830, white: 0xf4f1e8,
});
const POOL = 24;

export function createPowerPreview({ THREE, scene }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const rings = [];
  const lines = [];
  for (let i = 0; i < POOL; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1.0, 40),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    group.add(ring);
    rings.push(ring);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }));
    line.visible = false;
    group.add(line);
    lines.push(line);
  }

  return {
    group,
    /** @param {ReturnType<import('../data/powerPreview.js').powerPreviewPlan>} plan */
    update(plan, toLocal = null) {
      const loc = (x, z, out = { x: 0, z: 0 }) => (toLocal ? toLocal(x, z, out) : (out.x = x, out.z = z, out));
      const show = !!(plan && plan.moves && plan.moves.length);
      group.visible = show;
      if (!show) { for (const r of rings) r.visible = false; for (const l of lines) l.visible = false; return; }
      const hex = TINT_HEX[plan.tint] ?? 0xffffff;
      for (let i = 0; i < POOL; i++) {
        const m = plan.moves[i];
        const ring = rings[i], line = lines[i];
        if (!m) { ring.visible = false; line.visible = false; continue; }
        const p0 = loc(m.x, m.z, ring.userData._p0 || (ring.userData._p0 = { x: 0, z: 0 }));
        const p1 = loc(m.toX, m.toZ, ring.userData._p1 || (ring.userData._p1 = { x: 0, z: 0 }));
        const r = Math.max(4, (m.radius || 8) * 1.15);
        ring.scale.set(r, r, 1);
        ring.position.set(p0.x, 0.5, p0.z);
        ring.material.color.setHex(hex);
        ring.visible = true;
        const arr = line.geometry.attributes.position.array;
        arr[0] = p0.x; arr[1] = 0.5; arr[2] = p0.z;
        arr[3] = p1.x; arr[4] = 0.5; arr[5] = p1.z;
        line.geometry.attributes.position.needsUpdate = true;
        line.material.color.setHex(hex);
        line.visible = (p1.x !== p0.x || p1.z !== p0.z); // pin: no path, just the ring
      }
    },
    dispose() {
      scene.remove(group);
      for (const r of rings) { r.geometry.dispose(); r.material.dispose(); }
      for (const l of lines) { l.geometry.dispose(); l.material.dispose(); }
    },
  };
}
