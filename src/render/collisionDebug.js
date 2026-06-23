// Collision / socket / landing-contact debug visualization (spec §12.5: "debug-visualize collision,
// sockets, and landing contacts").
//
// A render-side debug overlay (OFF by default; toggled at runtime). When on, it draws — per ship mesh —
// the collision primitive (the entity radius, since render-mesh collision is not the default for moving
// ships, §12.5 #1), the named attachment sockets (§9.9), and the landing-contact points (skids). This
// is the art/engineering check that weapons/mining clear the hull (§12.5 #6) and that sockets sit where
// gameplay expects. It reads sim state only to position overlays and issues its own debug draws.
//
// Idiom mirrors diagnostics.js: lazy-create, no per-frame allocation when off, toggle via setDebug/on.
import * as THREE from 'three';

// Reused geometries/materials (created once; the overlay pool reuses one set of line objects).
const SOCKET_COLORS = {
  weapon: 0xff5577, mining: 0xffaa33, engine: 0x33ccff, utility: 0x88ff66,
  cargo: 0xffcc44, vfx: 0xaa66ff, camera: 0xffffff, default: 0x66ddff,
};

/**
 * Attach a debug-visualization controller to a render system instance.
 * @param {object} renderSys - the object exposing { scene, _meshes, cam } (the renderer's `this`)
 * @returns {{ on:boolean, setDebug(on:boolean):void, toggle():boolean, update():void, dispose():void }}
 */
export function createCollisionDebug(renderSys) {
  let on = false;
  // One reusable THREE.Group of overlay objects, repurposed each frame. Kept out of culling/frustum.
  const group = new THREE.Group();
  group.name = 'SF_DebugCollision';
  group.visible = false;
  group.frustumCulled = false;
  if (renderSys && renderSys.scene) renderSys.scene.add(group);

  // A pool of debug primitives we reposition/recolor rather than reallocating each frame.
  const ringGeo = new THREE.RingGeometry(0.985, 1.0, 48); // unit-radius ring; scaled per entity
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x33ddaa, transparent: true, opacity: 0.7 });
  const socketGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const contactGeo = new THREE.SphereGeometry(0.22, 6, 5);
  const contactMat = new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.85 });
  // We reuse a single material per socket color (memoized).
  const socketMatCache = new Map();
  const socketMat = (role) => {
    const c = SOCKET_COLORS[role] || SOCKET_COLORS.default;
    if (socketMatCache.has(c)) return socketMatCache.get(c);
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
    socketMatCache.set(c, m);
    return m;
  };

  // Live pools (created lazily on first update while on; capped so a huge scene can't thrash).
  const rings = [];      // [{ mesh, forEntity }]
  const sockets = [];    // [{ mesh, role }]
  const contacts = [];   // [{ mesh }]
  const MAX_ENTITIES = 64;

  function ensureCapacity(needRings, needSockets, needContacts) {
    while (rings.length < needRings && rings.length < MAX_ENTITIES) {
      const m = new THREE.Mesh(ringGeo, ringMat); m.frustumCulled = false; group.add(m); rings.push({ mesh: m });
    }
    while (sockets.length < needSockets) {
      // role assigned per-use below; default material placeholder
      const m = new THREE.Mesh(socketGeo, socketMat('default')); m.frustumCulled = false; group.add(m); sockets.push({ mesh: m, role: null });
    }
    while (contacts.length < needContacts) {
      const m = new THREE.Mesh(contactGeo, contactMat); m.frustumCulled = false; group.add(m); contacts.push({ mesh: m });
    }
  }

  // Hide every pooled object (cheaper than add/remove each frame).
  function hideAll() {
    for (const r of rings) r.mesh.visible = false;
    for (const s of sockets) s.mesh.visible = false;
    for (const c of contacts) c.mesh.visible = false;
  }

  // Per-frame: walk the render system's entity meshes and lay overlays on each ship.
  function update() {
    if (!on || !renderSys || !renderSys._meshes) return;
    hideAll();
    const meshes = renderSys._meshes;
    let ri = 0, si = 0, ci = 0;
    // Gather landing-contact + socket markers per mesh in one traversal.
    for (const [, root] of meshes) {
      if (ri >= MAX_ENTITIES) break;
      if (!root.userData || !root.userData.hull) continue; // ships only (have a bankable hull group)
      // --- collision primitive: the entity radius as a ground-plane ring ---
      // We approximate position from the mesh (already synced to entity pos by syncEntityViews).
      const r = rings[ri] || (ensureCapacity(ri + 1, si, ci), rings[ri]);
      const ent = root.userData.__lastEntity;
      const radius = (ent && ent.radius) || (root.userData.renderContract && 14) || 8;
      r.mesh.visible = true;
      r.mesh.position.set(root.position.x, 0.05, root.position.z);
      r.mesh.scale.setScalar(radius);
      r.mesh.rotation.x = -Math.PI / 2; // lay flat on the XZ plane
      ri++;

      // --- sockets + landing contacts: walk the hull group once ---
      root.traverse((o) => {
        if (o.userData && o.userData.spacefaceSocket && o.name) {
          if (si >= sockets.length) ensureCapacity(ri, si + 1, ci);
          const s = sockets[si]; if (!s) return;
          o.updateWorldMatrix(true, false);
          const role = o.userData.role || 'default';
          if (s.role !== role) { s.mesh.material = socketMat(role); s.role = role; }
          s.mesh.visible = true;
          s.mesh.position.setFromMatrixPosition(o.matrixWorld);
          si++;
        }
        if (o.name && /Skid|Landing|Landing_Skid/i.test(o.name)) {
          if (ci >= contacts.length) ensureCapacity(ri, si, ci + 1);
          const c = contacts[ci]; if (!c) return;
          o.updateWorldMatrix(true, false);
          c.mesh.visible = true;
          c.mesh.position.setFromMatrixPosition(o.matrixWorld);
          ci++;
        }
      });
    }
  }

  function setDebug(v) {
    on = !!v;
    group.visible = on;
    if (!on) hideAll();
  }
  function toggle() { setDebug(!on); return on; }

  function dispose() {
    setDebug(false);
    if (renderSys && renderSys.scene) renderSys.scene.remove(group);
    ringGeo.dispose(); ringMat.dispose(); socketGeo.dispose(); contactGeo.dispose(); contactMat.dispose();
    for (const m of socketMatCache.values()) m.dispose();
    socketMatCache.clear();
  }

  return { get on() { return on; }, setDebug, toggle, update, dispose };
}
