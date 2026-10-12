// Player-truth telemetry reader (scripts/player-truth). Observer only.
//
// Nothing imports this file from the game. The harness loads it into a live debug page through a
// <script type="module"> tag and calls installPlayerTruthReader(window) — until then it is inert.
// It reads window.SF.state, the render scene/camera and the event bus; it never writes game
// state, never emits on the bus, never changes a mesh, material or camera. Listeners it adds are
// passive and only record (first input time, kill events, long tasks).
//
// One sample per animation frame (registered after the game's own frame callback, so the camera
// and meshes are the ones the player just saw). The harness drains samples every second or so.

export const PLAYER_TRUTH_CLASSES = Object.freeze([
  'player', 'enemy', 'asteroid', 'projectile', 'pickup', 'fx', 'neutral', 'station', 'other',
]);
const CLS = Object.fromEntries(PLAYER_TRUTH_CLASSES.map((c, i) => [c, i]));
const SHIPLIKE = new Set(['ship', 'drone', 'reaver', 'fauna', 'freighter']);
const PROJECTILE_LIKE = new Set(['projectile', 'charge', 'vectormine', 'missile', 'mine']);

/** Classify a live entity for the player-truth harness. Pure; exported for fixture tests. */
export function classifyEntity(e, playerId, playerTeam) {
  if (!e) return 'other';
  if (e.id === playerId) return 'player';
  const t = e.type;
  if (t === 'asteroid') return 'asteroid';
  if (PROJECTILE_LIKE.has(t)) return 'projectile';
  if (t === 'pickup') return 'pickup';
  if (t === 'fx') return 'fx';
  if (t === 'station') return 'station';
  if (SHIPLIKE.has(t)) {
    const d = e.data || {};
    const ai = d.ai || {};
    const combat = d.combat || {};
    const hostile = !!d.runRole
      || ai.huntPlayer || ai.forcePlayerTarget
      || (Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(playerTeam))
      || (playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId))
      || (e.team != null && e.team !== playerTeam && e.team !== 0 && e.team !== 2 && !ai.passive);
    return hostile ? 'enemy' : 'neutral';
  }
  return 'other';
}

function isAdditive(mat, THREE) {
  if (!mat) return false;
  if (mat.blending === THREE.AdditiveBlending) return true;
  return !!(mat.transparent && mat.depthWrite === false
    && (mat.isPointsMaterial || mat.isSpriteMaterial || mat.isShaderMaterial));
}

export function installPlayerTruthReader(win, opts = {}) {
  if (win.__playerTruth) return win.__playerTruth;
  const SF = win.SF;
  if (!SF || !SF.state || !SF.THREE) throw new Error('player-truth: window.SF debug seam missing');
  const THREE = SF.THREE;
  const vfxEvery = Math.max(1, opts.vfxEvery || 4);
  const GW = 48; const GH = 27;
  const keys = []; const keyIdx = new Map();
  const intern = (s) => { let i = keyIdx.get(s); if (i === undefined) { i = keys.length; keys.push(s); keyIdx.set(s, i); } return i; };
  const samples = []; const events = []; const longTasks = [];
  const v = new THREE.Vector3(); const box = new THREE.Box3();
  let frame = 0; let lastT = 0; let running = false; let raf = 0;
  let firstInput = null;
  const now = () => win.performance.now();
  const simNow = () => +(SF.state.simTime || 0).toFixed(3);

  const onInput = (ev) => {
    if (!ev.isTrusted) return;
    const rec = { t: now(), sim: simNow(), kind: ev.type, code: ev.code || ev.button };
    if (ev.type === 'keydown' && ev.repeat) return;
    if (!firstInput && SF.state.mode === 'flight' && (ev.type === 'keydown' || ev.type === 'mousedown')) firstInput = rec;
    events.push({ ev: 'input', ...rec });
  };
  const INPUT_EVENTS = ['keydown', 'keyup', 'mousedown', 'mouseup'];
  for (const name of INPUT_EVENTS) win.addEventListener(name, onInput, { capture: true, passive: true });
  const unsubs = [];
  if (SF.bus && typeof SF.bus.on === 'function') {
    const u1 = SF.bus.on('entity:killed', (p) => {
      const st = SF.state; const killer = p && p.killerId != null && st.entities && st.entities.get ? st.entities.get(p.killerId) : null;
      events.push({ ev: 'killed', t: now(), sim: simNow(), id: p && p.id, type: p && p.type, killerId: p ? p.killerId : null,
        killerType: killer ? killer.type : null, byPlayer: !!(p && p.killerId === st.playerId), hostile: !!(p && p.targetHostileToPlayer),
        phase: st.run && st.run.phase, wave: st.run && st.run.wave });
    });
    if (typeof u1 === 'function') unsubs.push(u1);
  }
  let po = null;
  try {
    po = new win.PerformanceObserver((list) => { for (const en of list.getEntries()) longTasks.push({ t: en.startTime, d: en.duration, sim: simNow(), f: frame }); });
    po.observe({ type: 'longtask', buffered: true });
  } catch { po = null; }

  function screenOf(cam, x, y, z, r, vw, vh) {
    v.set(x, y, z).project(cam);
    const sx = (v.x * 0.5 + 0.5) * vw; const sy = (-v.y * 0.5 + 0.5) * vh;
    let pr = 0;
    if (cam.isPerspectiveCamera) {
      const dx = x - cam.position.x; const dy = y - cam.position.y; const dz = z - cam.position.z;
      const dist = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz));
      pr = r * (vh / 2) / (dist * Math.tan((cam.fov * Math.PI / 180) / 2));
    } else if (cam.isOrthographicCamera) {
      pr = r * vh * cam.zoom / Math.max(1e-6, cam.top - cam.bottom);
    }
    const inView = v.z > -1 && v.z < 1 && sx + pr >= 0 && sx - pr <= vw && sy + pr >= 0 && sy - pr <= vh;
    return { sx, sy, pr, inView };
  }

  function meshChainVisible(m) {
    for (let o = m; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  function playerRecord(st, p, mesh, cam, vw, vh) {
    const rec = { id: p.id, alive: p.alive !== false, x: p.pos.x, y: p.pos.y || 0, z: p.pos.z, vx: p.vel.x, vz: p.vel.z,
      rot: p.rot, angVel: p.angVel || 0, pitch: p.pitch || 0, bank: p.bank || 0, hull: p.hull, hullMax: p.hullMax,
      mesh: !!mesh, vis: false, onScreen: false, box: null, lod: null, model: null, state: null, tris: 0, marker: false, meshId: null };
    if (!mesh) return rec;
    const ud = mesh.userData || {};
    rec.meshId = mesh.uuid.slice(0, 8);
    rec.vis = meshChainVisible(mesh);
    rec.lod = ud._appliedLodLevel || (ud.lod && ud.lod.level) || null;
    rec.model = ud.authoredCompositionId || ud.assetId || mesh.name || null;
    rec.state = ud.authoredAssetState || null;
    rec.marker = !!(ud.resolvingMarker && ud.resolvingMarker.visible && meshChainVisible(ud.resolvingMarker));
    let tris = 0;
    mesh.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry; const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      tris += (n / 3) * (o.isInstancedMesh ? Math.max(1, o.count) : 1);
    });
    rec.tris = Math.round(tris);
    if (rec.vis && cam) {
      box.setFromObject(mesh);
      if (!box.isEmpty()) {
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let front = false;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
          if (v.z < 1 && v.z > -1) front = true;
          const sx = (v.x * 0.5 + 0.5) * vw; const sy = (-v.y * 0.5 + 0.5) * vh;
          x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
        }
        rec.box = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
        rec.onScreen = front && x1 > 0 && y1 > 0 && x0 < vw && y0 < vh;
      }
    }
    return rec;
  }

  function ownerOf(o) {
    for (let n = o; n; n = n.parent) {
      const ud = n.userData;
      if (ud && (ud.sfBoundEntityId != null || ud.presentationEntityId != null)) return ud.sfBoundEntityId != null ? ud.sfBoundEntityId : ud.presentationEntityId;
    }
    return null;
  }

  function vfxScan(st, cam, scene, vw, vh, playerBox, threatBoxes) {
    const grid = new Uint16Array(GW * GH);
    let overdraw = 0; let unbounded = 0; const per = new Map();
    const sphere = new THREE.Sphere();
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
      if (cam.layers && o.layers && !cam.layers.test(o.layers)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const mat = mats.find((m) => isAdditive(m, THREE));
      if (!mat || (mat.opacity !== undefined && mat.opacity < 0.02 && !mat.isShaderMaterial)) return;
      let r; let cx; let cy; let cz;
      if (o.isSprite) {
        o.getWorldPosition(v); cx = v.x; cy = v.y; cz = v.z; r = Math.max(o.scale.x, o.scale.y) * 0.5 * Math.max(1, o.matrixWorld.getMaxScaleOnAxis() / Math.max(1e-6, Math.max(o.scale.x, o.scale.y)));
      } else {
        const g = o.geometry; if (!g) return;
        if (!g.boundingSphere) { if (!o.frustumCulled) return; g.computeBoundingSphere(); }
        if (!g.boundingSphere) return;
        sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        cx = sphere.center.x; cy = sphere.center.y; cz = sphere.center.z; r = sphere.radius;
      }
      if (!Number.isFinite(r) || r <= 0) return;
      const s = screenOf(cam, cx, cy, cz, r, vw, vh);
      if (!s.inView) return;
      if (s.pr > Math.hypot(vw, vh) * 0.6) { unbounded++; return; }
      const x0 = Math.max(0, Math.floor((s.sx - s.pr) / vw * GW)); const x1 = Math.min(GW - 1, Math.floor((s.sx + s.pr) / vw * GW));
      const y0 = Math.max(0, Math.floor((s.sy - s.pr) / vh * GH)); const y1 = Math.min(GH - 1, Math.floor((s.sy + s.pr) / vh * GH));
      if (x1 < x0 || y1 < y0) return;
      const cells = (x1 - x0 + 1) * (y1 - y0 + 1);
      overdraw += cells;
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) grid[gy * GW + gx]++;
      const name = (o.name || o.parent && o.parent.name || o.type).slice(0, 48);
      const owner = ownerOf(o);
      const k = name + '#' + (owner == null ? '' : owner);
      const prev = per.get(k) || { name, owner, cells: 0, box: null };
      prev.cells += cells;
      const bx = [Math.round(s.sx - s.pr), Math.round(s.sy - s.pr), Math.round(s.sx + s.pr), Math.round(s.sy + s.pr)];
      prev.box = prev.box ? [Math.min(prev.box[0], bx[0]), Math.min(prev.box[1], bx[1]), Math.max(prev.box[2], bx[2]), Math.max(prev.box[3], bx[3])] : bx;
      per.set(k, prev);
    });
    let covered = 0; for (let i = 0; i < grid.length; i++) if (grid[i]) covered++;
    const fracCovered = (b) => {
      if (!b) return null;
      const x0 = Math.max(0, Math.floor(b[0] / vw * GW)); const x1 = Math.min(GW - 1, Math.floor(b[2] / vw * GW));
      const y0 = Math.max(0, Math.floor(b[1] / vh * GH)); const y1 = Math.min(GH - 1, Math.floor(b[3] / vh * GH));
      if (x1 < x0 || y1 < y0) return null;
      let n = 0; let c = 0;
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { n++; if (grid[gy * GW + gx]) c++; }
      return n ? +(c / n).toFixed(3) : null;
    };
    let tc = 0; let tn = 0;
    for (const b of threatBoxes) { const f = fracCovered(b); if (f != null) { tn++; if (f >= 0.5) tc++; } }
    const top = [...per.values()].sort((a, b) => b.cells - a.cells).slice(0, 5)
      .map((x) => [x.name, x.owner, +(x.cells / grid.length).toFixed(3), x.box]);
    return { cov: +(covered / grid.length).toFixed(3), od: +(overdraw / grid.length).toFixed(2), pOcc: fracCovered(playerBox),
      tOcc: tn ? +(tc / tn).toFixed(3) : null, tN: tn, unb: unbounded, top };
  }

  function sample() {
    const t = now(); const dt = lastT ? t - lastT : 0; lastT = t; frame++;
    const st = SF.state; const r = st.render || {};
    const cam = r.camera; const scene = r.scene; const meshes = r.meshes;
    const canvas = r.renderer && r.renderer.domElement;
    const vw = canvas ? canvas.clientWidth : win.innerWidth; const vh = canvas ? canvas.clientHeight : win.innerHeight;
    const run = st.run || null;
    const s = { f: frame, t: +t.toFixed(1), dt: +dt.toFixed(1), sim: simNow(), mode: st.mode,
      top: SF.ctx && SF.ctx.screenManager && SF.ctx.screenManager.top ? SF.ctx.screenManager.top() : null,
      run: run ? { kind: run.kind, rs: run.ruleset, ph: run.phase, w: run.wave, a: run.arenaId, res: run.resolvedThreat, sp: run.spawnedThreat, bud: run.threatBudget } : null,
      vw, vh, p: null, e: [], info: null, vfx: null };
    if (r.renderer && r.renderer.info) s.info = { calls: r.renderer.info.render.calls, tris: r.renderer.info.render.triangles };
    const list = st.entityList || [];
    let player = null;
    for (const e of list) if (e.id === st.playerId) { player = e; break; }
    const playerTeam = player ? player.team : 1;
    if (player && player.pos) s.p = playerRecord(st, player, meshes && meshes.get(player.id), cam, vw, vh);
    const threatBoxes = [];
    for (const e of list) {
      if (!e || e.alive === false || !e.pos || e.id === st.playerId) continue;
      const cls = classifyEntity(e, st.playerId, playerTeam);
      const m = meshes ? meshes.get(e.id) : null;
      let visCode = 0; let sx = -1; let sy = -1; let pr = 0; let key = -1;
      if (cam) {
        const sc = screenOf(cam, e.pos.x, e.pos.y || 0, e.pos.z, Math.max(0.5, e.radius || 1), vw, vh);
        sx = Math.round(sc.sx); sy = Math.round(sc.sy); pr = +sc.pr.toFixed(1);
        if (m) {
          const vis = meshChainVisible(m);
          visCode = !vis ? 1 : (sc.inView ? 3 : 2);
          const ud = m.userData || {};
          key = intern(`${m.uuid.slice(0, 8)}|${ud.authoredCompositionId || ud.assetId || m.name || ''}|${ud._appliedLodLevel || (ud.lod && ud.lod.level) || ''}|${ud.authoredAssetState || ''}`);
        } else if (sc.inView) visCode = 4; // no per-entity mesh (instanced/pooled) but inside the view
        if ((cls === 'enemy' || cls === 'projectile') && sc.inView) threatBoxes.push([sx - pr, sy - pr, sx + pr, sy + pr]);
      }
      s.e.push([e.id, CLS[cls], +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), +(e.vel ? e.vel.x : 0).toFixed(2), +(e.vel ? e.vel.z : 0).toFixed(2), sx, sy, pr, visCode, key, e.type === 'asteroid' || cls !== 'other' ? 0 : intern(e.type)]);
    }
    if (cam && scene && frame % vfxEvery === 0) {
      try { s.vfx = vfxScan(st, cam, scene, vw, vh, s.p && s.p.onScreen ? s.p.box : null, threatBoxes); } catch (err) { s.vfx = { err: String(err && err.message || err) }; }
    }
    samples.push(s);
  }

  function loop() {
    if (!running) return;
    try { sample(); } catch (err) { events.push({ ev: 'readerError', t: now(), msg: String(err && err.message || err) }); }
    raf = win.requestAnimationFrame(loop);
  }

  const api = {
    version: 1,
    start() { if (running) return; running = true; lastT = 0; raf = win.requestAnimationFrame(loop); },
    stop() { running = false; if (raf) win.cancelAnimationFrame(raf); },
    drain() {
      const out = { samples: samples.splice(0), events: events.splice(0), longTasks: longTasks.splice(0), keys: keys.slice(), firstInput };
      return out;
    },
    dispose() {
      api.stop();
      for (const name of INPUT_EVENTS) win.removeEventListener(name, onInput, { capture: true });
      for (const u of unsubs) try { u(); } catch { /* observer teardown */ }
      if (po) po.disconnect();
      delete win.__playerTruth;
    },
  };
  win.__playerTruth = api;
  return api;
}
