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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.settings.video.pixelRatioCap || 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05070d, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070d, 0.00085);
    scene.add(new THREE.AmbientLight(0x3a4a66, 0.75));
    const key = new THREE.DirectionalLight(0xbcd6ff, 1.5); key.position.set(60, 140, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(0x5566ff, 0.5); rim.position.set(-70, 50, -60); scene.add(rim);

    const cam = createChaseCamera(state);
    const starfield = createStarfield(scene);
    const vf = createVisualFactory();

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
    bus.on('sector:enter', () => this.clearAllMeshes(/*keepPlayer*/ true));

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('wheel', (ev) => cam.setZoom(state.camera.zoom + Math.sign(ev.deltaY) * 6), { passive: true });
  },

  clearAllMeshes(keepPlayer) {
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
  },

  syncEntityViews(alpha) {
    for (const e of this.state.entityList) {
      const m = e.mesh; if (!m) continue;
      if (e.flags.noInterp) {
        m.position.set(e.pos.x, 0, e.pos.z); m.rotation.y = -e.rot;
      } else {
        m.position.x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        m.position.z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        m.position.y = 0;
        let dr = e.rot - e.prevRot;
        dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI; if (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y = -(e.prevRot + dr * alpha);
      }
    }
  },

  renderFrame(alpha, frameDt) {
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
