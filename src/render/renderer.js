// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { createChaseCamera } from './camera.js';
import { createStarfield } from './starfield.js';
import { createVisualFactory } from './visualFactory.js';
import { createBloom } from './bloom.js';

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();
const _pt = new THREE.Vector3();
const _v2 = new THREE.Vector2();

export const render = {
  name: 'render',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    const state = ctx.state, bus = ctx.bus;

    const canvas = document.getElementById('gl-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.settings.video.pixelRatioCap || 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x060912, 1);

    const scene = new THREE.Scene();
    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);

    const cam = createChaseCamera(state);
    const starfield = createStarfield(scene);
    const vf = createVisualFactory();

    // Preload the menu background (the only generated .jpg we use — the rest are captioned
    // contact-sheet references and are replaced by procedural materials / inline SVG).
    { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }

    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
    try { this.bloom = createBloom(renderer, window.innerWidth, window.innerHeight); }
    catch (err) { console.warn('[render] bloom unavailable, falling back:', err); this.bloom = null; }
    this._meshes = new Map(); // entityId -> Object3D

    state.render.scene = scene;
    state.render.renderer = renderer;
    state.render.camera = cam.obj;
    state.camera.obj = cam.obj;

    ctx.helpers.worldToScreen = (v) => this.worldToScreen(v);
    ctx.helpers.raycastToPlane = (ndc) => this.raycastToPlane(ndc);
    ctx.helpers.addTrauma = (a) => cam.addTrauma(a);

    bus.on('entity:spawned', ({ id, entity }) => {
      const m = vf.build(entity);
      if (!m) return;
      m.position.set(entity.pos.x, 0, entity.pos.z);
      m.rotation.y = -entity.rot;
      entity.mesh = m; entity.view = { root: m };
      this._meshes.set(id, m);
      scene.add(m);
    });
    bus.on('entity:destroyed', ({ id }) => {
      const m = this._meshes.get(id);
      if (m) { scene.remove(m); disposeObject(m); this._meshes.delete(id); }
    });
    bus.on('camera:shake', ({ amount }) => cam.addTrauma(amount || 0.3));
    bus.on('camera:zoom', ({ delta, level }) => { if (level != null) cam.setZoom(level); else cam.setZoom(state.camera.zoom + (delta || 0)); });
    // Live-apply video settings changes. Without this, dragging Bloom strength / FOV / particle
    // quality in the settings screen did nothing (only the initial value was used) — a "slider that
    // doesn't work" sore thumb. We forward the values to the systems that own them.
    bus.on('settings:changed', (p) => {
      if (!p || p.section !== 'video') return;
      const vd = state.settings.video;
      if (this.bloom) this.bloom.setOptions({ bloom: vd.bloom, strength: vd.bloomStrength, threshold: vd.bloomThreshold });
      // FOV: the feel system (feel.js) adds a transient punch on top of this base. We update the
      // camera's base fov here; feel.frame() re-derives its cached base from settings when no punch
      // is active, so the slider and the punch never fight.
      if (p.key === 'fov' || p.key == null) {
        const camObj = state.render.camera;
        if (camObj && camObj.isPerspectiveCamera && typeof vd.fov === 'number') {
          camObj.fov = vd.fov;
          camObj.updateProjectionMatrix();
        }
      }
    });
    // On sector change, reconcile rather than blindly clearing: the new sector's entities are
    // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
    // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
    // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
    bus.on('sector:enter', () => this.reconcileMeshes());

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('wheel', (ev) => cam.setZoom(state.camera.zoom + Math.sign(ev.deltaY) * 6), { passive: true });
  },

  clearAllMeshes(keepPlayer) {
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
  },

  // Self-healing entity<->mesh reconciliation. Guarantees every alive, renderable entity has a
  // scene mesh and that meshes for gone entities are disposed — independent of event ordering.
  // This is the safety net that makes the world actually render (entity:spawned alone was being
  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
  reconcileMeshes() {
    const state = this.state;
    // remove meshes whose entity no longer exists or has died
    for (const [id, m] of this._meshes) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); }
    }
    // build meshes for alive entities that lack one (fx are particle-managed by vfx -> mark + skip)
    for (const e of state.entityList) {
      if (e._noMesh || this._meshes.has(e.id)) continue;
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      m.position.set(e.pos.x, 0, e.pos.z);
      m.rotation.y = -e.rot;
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
    }
  },

  syncEntityViews(alpha) {
    for (const e of this.state.entityList) {
      const m = e.mesh; if (!m) continue;
      const hull = m.userData && m.userData.hull;   // bankable inner group (ships only)
      if (e.flags.noInterp) {
        m.position.set(e.pos.x, 0, e.pos.z); m.rotation.y = -e.rot;
        if (hull && e.bank != null) hull.rotation.x = -e.bank; // roll around forward axis; +bank dips right wing
      } else {
        m.position.x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        m.position.z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        m.position.y = 0;
        let dr = e.rot - e.prevRot;
        dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI; if (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y = -(e.prevRot + dr * alpha);
        // interpolate bank for a smooth roll (prevBank snapshotted in core.preStep each step)
        if (hull && e.bank != null) {
          const pb = e.prevBank || 0;
          hull.rotation.x = -(pb + (e.bank - pb) * alpha);
        }
      }
    }
  },

  renderFrame(alpha, frameDt) {
    this.reconcileMeshes();
    this.syncEntityViews(alpha);
    this.cam.follow(frameDt);
    this.starfield.recenter(this.cam.obj.position);
    if (this.bloom && this.state.settings.video.bloom !== false) this.bloom.render(this.scene, this.cam.obj);
    else this.renderer.render(this.scene, this.cam.obj);
  },

  worldToScreen(v) {
    _pt.set(v.x, v.y || 0, v.z).project(this.cam.obj);
    return {
      x: (_pt.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_pt.y * 0.5 + 0.5) * window.innerHeight,
      onScreen: _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1,
    };
  },

  raycastToPlane(ndc) {
    _v2.set(ndc.x, ndc.y);
    _ray.setFromCamera(_v2, this.cam.obj);
    const hit = _ray.ray.intersectPlane(_plane, _pt);
    return hit ? { x: hit.x, z: hit.z } : { x: 0, z: 0 };
  },

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.bloom) this.bloom.setSize(window.innerWidth, window.innerHeight);
    this.cam.onResize();
  },
};

function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) { const mm = Array.isArray(c.material) ? c.material : [c.material]; mm.forEach((m) => m.dispose()); }
  });
}
