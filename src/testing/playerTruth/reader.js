// Player-truth telemetry reader (scripts/player-truth). Observer only.
//
// Nothing imports this file from the game. The harness loads it into a live debug page through a
// <script type="module"> tag and calls installPlayerTruthReader(window) — until then it is inert.
// It reads window.SF.state, the render scene/camera and the event bus; it never writes game
// state, never emits on the bus, never changes a mesh, material or camera. Listeners it adds are
// passive and only record (first input time, kill events, long tasks).
//
// One sample per animation frame (registered after the game's own frame callback, so the camera
// and meshes are the ones the player just saw). Expensive VFX and pixel readback passes are
// wall-gated below; the entity/scene identity census is skipped for known preparation/menu modes,
// when the player-truth grader cannot consume it. Those samples retain scalar route/timing state
// without carrying stale rows into the first flight sample. The harness drains samples every second.

import { encodePlayerTruthRows } from './packedRows.js';
import { isKnownGeometryPreservingShaderHook } from '../../render/shaderPoseProvenance.js';

export const PLAYER_TRUTH_CLASSES = Object.freeze([
  'player', 'enemy', 'asteroid', 'projectile', 'pickup', 'fx', 'neutral', 'station', 'other',
]);
const CLS = Object.fromEntries(PLAYER_TRUTH_CLASSES.map((c, i) => [c, i]));
const SHIPLIKE = new Set(['ship', 'drone', 'reaver', 'fauna', 'freighter']);
const PROJECTILE_LIKE = new Set(['projectile', 'charge', 'vectormine', 'missile', 'mine']);
// The player-truth checks only grade world rows during flight. Keep this list explicit so a
// future non-flight mode does not silently lose diagnostic rows until its reader contract is known.
const PREPARATION_MODES = new Set(['loading', 'menu', 'paused']);

/**
 * True when `#screens` is the surface on top of the flight canvas.
 * screenManager shows that container with `display:flex` and hides it with
 * `display:none` plus `aria-hidden`. `top()` can already be null on the same
 * frame the container is still shown, so the pixel checks read this, not only the stack id.
 */
export function screensOverlayOpen(root) {
  if (!root || typeof root !== 'object') return false;
  const display = root.style && root.style.display;
  if (display === 'none') return false;
  const hidden = typeof root.getAttribute === 'function' && root.getAttribute('aria-hidden') === 'true';
  if (hidden) return false;
  if (display === 'flex' || display === 'block') return true;
  if (typeof root.getClientRects === 'function') return root.getClientRects().length > 0;
  return false;
}

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

/** Target instrumentation identifies a subject; it is not a weapon/contact obscuring it. */
export function isPlayerTruthInstrumentation(object) {
  for (let node = object; node && !node.isScene; node = node.parent) {
    if (node.userData?.presentationRole === 'target-instrument'
        // Retained rigid batches are a second draw of source geometry, outside the entity root.
        // The authored source remains visible for ownership masks; counting this diagnostic copy
        // as an unowned body would double-occlude the player and erase the candidate's attribution.
        || node.userData?.spacefaceRigidOpaqueBatch === true) return true;
  }
  return false;
}

function unsupportedBodyMaskPose(THREE, root) {
  if (!root) return true;
  let unsupported = false;
  root.traverseVisible(object => {
    if (!object.isMesh || isPlayerTruthInstrumentation(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(m => m && !m.transparent && m.opacity !== 0)) return;
    // Raw geometry bounds cannot constrain a shader displacement or a callback-driven pose.
    // Basic ID materials also cannot reproduce arbitrary source vertex hooks.
    if (object.isSkinnedMesh || Object.keys(object.geometry?.morphAttributes || {}).length
      || object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender
      || materials.some(m => m && !m.transparent && (m.isShaderMaterial || m.isRawShaderMaterial
        || m.displacementMap || (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
          && !isKnownGeometryPreservingShaderHook(m.onBeforeCompile))))) unsupported = true;
  });
  return unsupported;
}

/** Exact opaque geometry bounds, used only to reject nonoverlapping mask candidates. */
export function playerTruthOpaqueBounds(THREE, root, camera, vw, vh) {
  if (!root || unsupportedBodyMaskPose(THREE, root)) return null;
  const point = new THREE.Vector3();
  const bounds = [Infinity, Infinity, -Infinity, -Infinity]; let count = 0;
  root.traverseVisible(object => {
    if (!object.isMesh || object.isInstancedMesh || isPlayerTruthInstrumentation(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(m => m && !m.transparent && m.opacity !== 0)) return;
    const geometry = object.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    for (let i = 0; i < 8; i++) {
      point.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z).applyMatrix4(object.matrixWorld).project(camera);
      // Crossing the camera/clip plane cannot supply a conservative rejection.
      if (point.z < -1 || point.z > 1) { bounds[0] = -Infinity; bounds[2] = Infinity; }
      const x = (point.x * 0.5 + 0.5) * vw; const y = (-point.y * 0.5 + 0.5) * vh;
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
    count++;
  });
  return count ? bounds : null;
}

/** Two native ID/depth draws at the existing split cadence; never a screenshot proxy.
 * Only player-silhouette pixels occupied by a body's opaque geometry count as cover.
 * Caps/missing/unsupported evidence stay explicit UNKNOWN. All scene edits are temporary. */
export function measurePlayerTruthBodyOcclusion({ THREE, renderer, scene, camera,
  playerMesh, bodies, playerBox, vw, vh, width, height, draw, maxCandidates = 12,
  maskCache = null, silhouette = null, ownership = null }) {
  const rows = bodies.map(body => ({ id: body.id, cls: body.cls, ty: body.ty,
    status: 'unknown', reason: 'missing-opaque-geometry', box: null }));
  const receipt = { version: 1, method: 'native-opaque-id-depth', maxExtraDraws: 2,
    extraDraws: 0, candidateCap: maxCandidates, rows };
  if (!playerMesh || scene.overrideMaterial) return receipt;
  if (unsupportedBodyMaskPose(THREE, playerMesh)) {
    for (const row of rows) row.reason = 'unsupported-player-silhouette';
    return receipt;
  }
  if (!playerBox) return receipt;
  const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const candidates = [];
  bodies.forEach((body, i) => {
    if (body.mesh && unsupportedBodyMaskPose(THREE, body.mesh)) {
      rows[i].reason = 'unsupported-vertex-pose'; return;
    }
    const bounds = playerTruthOpaqueBounds(THREE, body.mesh, camera, vw, vh);
    rows[i].box = bounds?.every(Number.isFinite) ? bounds : null;
    if (!bounds) return;
    if (!overlaps(bounds, playerBox)) {
      Object.assign(rows[i], { status: 'measured', reason: 'disjoint-opaque-bounds', pixels: 0 });
    } else if (candidates.length >= maxCandidates) {
      rows[i].reason = 'candidate-cap';
    } else candidates.push({ ...body, row: rows[i], code: (candidates.length + 1) * 16 });
  });
  if (!candidates.length) return receipt;
  const within = (object, root) => {
    for (let node = object; node; node = node.parent) if (node === root) return true;
    return false;
  };
  const leaves = []; const materials = maskCache || new Map();
  let playerOpaque = 0; let playerUnsupported = false;
  scene.traverseVisible(object => {
    if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return;
    const owner = candidates.find(body => within(object, body.mesh));
    const player = within(object, playerMesh);
    const original = object.material;
    const source = Array.isArray(original) ? original : [original];
    const instrument = isPlayerTruthInstrumentation(object);
    const opaque = object.isMesh && !instrument && source.some(m => m && !m.transparent && m.opacity !== 0);
    const supported = opaque && (!(owner || player) || !object.isInstancedMesh)
      && source.every(m => !m || m.transparent || (!m.isShaderMaterial && !m.isRawShaderMaterial
        && !m.alphaTest && !m.clippingPlanes?.length && m.depthTest && m.depthWrite));
    if ((owner || player) && opaque && !supported) {
      if (owner) owner.row.reason = 'unsupported-opaque-material';
      if (player) playerUnsupported = true;
    }
    if (player && supported) playerOpaque++;
    const replacements = source.map(m => {
      const visible = !!(supported && m && !m.transparent && m.opacity !== 0);
      const code = player ? 255 : (owner ? owner.code : 0);
      const side = m?.side ?? THREE.FrontSide;
      const key = `${code}|${side}|${visible ? 1 : 0}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshBasicMaterial({
        color: player ? 0xffffff : new THREE.Color(code / 255, 0, 0),
        visible, side, depthTest: true, depthWrite: true,
        toneMapped: false, blending: THREE.NoBlending,
        });
        materials.set(key, material);
      }
      return material;
    });
    leaves.push({ object, visible: object.visible, layersMask: object.layers?.mask,
      material: original, replacement: Array.isArray(original) ? replacements : replacements[0],
      supported, player });
  });
  if (!playerOpaque || playerUnsupported) {
    if (!maskCache) for (const material of materials.values()) material.dispose();
    for (const candidate of candidates) candidate.row.reason = 'unsupported-player-silhouette';
    return receipt;
  }
  const prevTarget = renderer.getRenderTarget(); const prevAuto = renderer.info.autoReset;
  const prevShadow = renderer.shadowMap?.autoUpdate;
  const savedInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  const background = scene.background;
  const clearColor = renderer.getClearColor ? renderer.getClearColor(new THREE.Color()).clone() : null;
  const clearAlpha = renderer.getClearAlpha?.();
  silhouette ||= new Uint8Array(width * height * 4);
  ownership ||= new Uint8Array(silhouette.length);
  try {
    renderer.info.autoReset = false;
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
    scene.background = null; renderer.setClearColor?.(0x000000, 0);
    // Retained rigid batches suppress their direct draw with layer mask 0 while preserving the
    // canonical source for semantic readers. The temporary ID/depth pass uses the real camera
    // layers, so those sources still contribute to opaque ownership; restore the authored masks
    // before returning to the live route.
    const mask = camera?.layers && Number.isFinite(camera.layers.mask) ? camera.layers.mask : null;
    if (mask != null) {
      for (const leaf of leaves) {
        if (leaf.object.layers && Number.isFinite(leaf.layersMask)) leaf.object.layers.mask = mask;
      }
    }
    for (const leaf of leaves) {
      leaf.object.material = leaf.replacement;
      leaf.object.visible = leaf.supported && leaf.player;
    }
    receipt.extraDraws++; draw(silhouette);
    for (const leaf of leaves) leaf.object.visible = leaf.supported;
    receipt.extraDraws++; draw(ownership);
    let playerPixels = 0; const counts = new Map(candidates.map(body => [body.code, 0]));
    for (let k = 0; k < silhouette.length; k += 4) {
      if (silhouette[k] < 250 || silhouette[k + 1] < 250 || silhouette[k + 2] < 250) continue;
      playerPixels++;
      if (ownership[k + 1] > 1 || ownership[k + 2] > 1) continue;
      const code = Math.round(ownership[k] / 16) * 16;
      if (Math.abs(ownership[k] - code) <= 1 && counts.has(code)) counts.set(code, counts.get(code) + 1);
    }
    receipt.playerPixels = playerPixels;
    for (const body of candidates) {
      if (body.row.reason === 'unsupported-opaque-material') continue;
      if (!playerPixels) { body.row.reason = 'empty-player-silhouette'; continue; }
      const pixels = counts.get(body.code);
      Object.assign(body.row, { status: 'measured', reason: 'opaque-id-depth', pixels,
        playerPixels, fraction: pixels / playerPixels });
    }
  } catch (error) {
    receipt.error = String(error?.message || error).slice(0, 200);
    for (const body of candidates) body.row.reason = 'mask-draw-error';
  } finally {
    for (const leaf of leaves) {
      leaf.object.material = leaf.material;
      leaf.object.visible = leaf.visible;
      if (leaf.object.layers && Number.isFinite(leaf.layersMask)) {
        leaf.object.layers.mask = leaf.layersMask;
      }
    }
    scene.background = background;
    if (clearColor) renderer.setClearColor(clearColor, clearAlpha);
    renderer.setRenderTarget(prevTarget); renderer.info.autoReset = prevAuto;
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = prevShadow;
    Object.assign(renderer.info.render, savedInfo);
    if (!maskCache) for (const material of materials.values()) material.dispose();
  }
  return receipt;
}

/** Capture-local identity history also resolves deaths delivered after a slot is reused. */
export function createPlayerTruthLifeTracker() {
  const lives = new Map(); let serial = 0;
  const observe = (e) => {
    if (!e || !Number.isFinite(e.id)) return null;
    const gen = e.occupantGeneration ?? null;
    let history = lives.get(e.id);
    if (!history) { history = new Map([[gen, e.id]]); lives.set(e.id, history); return e.id; }
    if (history.has(gen)) return history.get(gen);
    // Unstamped compatibility rows keep their latest observed life; production rows are stamped.
    if (gen == null) return [...history.values()].at(-1);
    const uid = e.id + 1e6 * (++serial);
    history.set(gen, uid);
    return uid;
  };
  const receiptId = (p, current = null) => {
    if (!p || !Number.isFinite(p.id)) return null;
    const gen = p.occupantGeneration ?? p.entity?.occupantGeneration ?? null;
    const history = lives.get(p.id);
    if (gen != null) {
      if (history?.has(gen)) return history.get(gen);
      // An old-life receipt cannot borrow the new occupant's uid.
      return observe({ id: p.id, occupantGeneration: gen });
    }
    return current ? observe(current) : (history ? [...history.values()].at(-1) : p.id);
  };
  const identityFor = (id, generation) => lives.get(id)?.get(generation) ?? null;
  return { observe, receiptId, identityFor };
}

/** Read the presented contents once per admission/model change, rather than walking per frame. */
export function createPlayerTruthDrawIdentity() {
  const cache = new WeakMap();
  return (mesh) => {
    if (!mesh) return null;
    const ud = mesh.userData || {};
    // These are the renderer's publication seams: a commit replaces hull/marker or children;
    // distance LOD and admission phases stamp the root. Pose/animation is deliberately absent.
    const trigger = `${ud.authoredCompositionId || ud.assetId || ''}|${ud._appliedLodLevel || ud.lod?.level || ''}|${ud.authoredAssetState || ''}|${ud.hull?.uuid || ''}|${ud.resolvingMarker?.uuid || ''}|${mesh.children.map(child => child.uuid).join(',')}`;
    const prior = cache.get(mesh);
    if (prior?.trigger === trigger) return prior.signature;
    const leaves = [];
    const collect = (object) => {
      if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)
        || isPlayerTruthInstrumentation(object) || (object.isInstancedMesh && object.count === 0)) return;
      for (let node = object; node && node !== mesh; node = node.parent) {
        // Adopted asteroid source leaves are hidden locally because their geometry/material is
        // drawn by the shared instance bucket. LOD still owns poolLeafVisible for detail leaves.
        const pooled = node.userData?.asteroidInstanceAdopted === true
          && node.userData?.poolLeafVisible !== false;
        if (node.visible === false && !pooled) return;
      }
      const geometry = object.geometry;
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .filter(mat => mat && mat.visible !== false);
      if (!materials.length) return;
      leaves.push(`${geometry?.uuid || '-'}:${geometry?.drawRange?.start || 0}:${geometry?.drawRange?.count ?? '-'}:${materials.map(mat => `${mat?.uuid || '-'}@${mat?.version || 0}`).join(',')}`);
    };
    // Root visibility is measured by the popping check; retain its model identity while culled.
    mesh.traverse(collect);
    // Bounded key size even for a large station. Two independent 32-bit accumulators preserve
    // geometry/material identities without placing the entire authored tree into every key.
    let a = 2166136261; let b = 3339675911;
    for (const leaf of leaves.sort()) {
      for (let i = 0; i <= leaf.length; i++) {
        const code = i === leaf.length ? 0 : leaf.charCodeAt(i);
        a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 2246822519);
      }
    }
    const signature = `${leaves.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
    cache.set(mesh, { trigger, signature });
    return signature;
  };
}

export function installPlayerTruthReader(win, opts = {}) {
  if (win.__playerTruth) return win.__playerTruth;
  const SF = win.SF;
  if (!SF || !SF.state || !SF.THREE) throw new Error('player-truth: window.SF debug seam missing');
  const THREE = SF.THREE;
  const vfxEvery = Math.max(1, opts.vfxEvery || 4);
  const pxEvery = opts.pxEvery === 0 ? 0 : Math.max(1, opts.pxEvery || 24);
  // The live gate uses the defaults below (vfx every 4th frame, pixel split every 24th frame),
  // but a focused fixture may deliberately request another frame cadence. Keep those explicit
  // cadences exact unless they opt into a wall budget, so native-resolution tests remain about
  // readback semantics rather than scheduler policy.
  const defaultFrameCadence = (opts.vfxEvery == null || opts.vfxEvery === 4)
    && (opts.pxEvery == null || opts.pxEvery === 24);
  const visualEveryMs = Number.isFinite(opts.visualEveryMs)
    ? Math.max(0, opts.visualEveryMs) : (defaultFrameCadence ? 250 : 0);
  const pixelEveryMs = Number.isFinite(opts.pixelEveryMs)
    ? Math.max(0, opts.pixelEveryMs) : (defaultFrameCadence ? 1000 : 0);
  const GW = 48; const GH = 27;
  const keys = []; const keyIdx = new Map();
  const drawIdentity = createPlayerTruthDrawIdentity();
  const bodyMaskMaterials = new Map();
  const intern = (s) => { let i = keyIdx.get(s); if (i === undefined) { i = keys.length; keys.push(s); keyIdx.set(s, i); } return i; };
  const samples = []; const events = []; const longTasks = [];
  const v = new THREE.Vector3(); const box = new THREE.Box3();
  let frame = 0; let lastT = 0; let running = false; let raf = 0;
  let lastVfxAt = -Infinity; let lastPxAt = -Infinity;
  let firstInput = null;
  const now = () => win.performance.now();
  const simNow = () => +(SF.state.simTime || 0).toFixed(3);

  const onInput = (ev) => {
    if (!ev.isTrusted) return;
    const tgt = ev.target && ev.target.tagName ? ev.target.tagName : null;
    const rec = { t: now(), sim: simNow(), kind: ev.type, code: ev.code || ev.button, tgt };
    if (ev.type === 'keydown' && ev.repeat) return;
    const flightInput = ev.type === 'keydown' || (ev.type === 'mousedown' && tgt === 'CANVAS');
    if (!firstInput && SF.state.mode === 'flight' && flightInput) firstInput = rec;
    events.push({ ev: 'input', ...rec });
  };
  const INPUT_EVENTS = ['keydown', 'keyup', 'mousedown', 'mouseup'];
  for (const name of INPUT_EVENTS) win.addEventListener(name, onInput, { capture: true, passive: true });
  // Entity ids recycle through freeIds: a new occupant of an old id gets its own life id so a
  // recycled slot never reads as one body swapping model or popping.
  const lifeTracker = createPlayerTruthLifeTracker();
  const lifeId = lifeTracker.observe;
  const unsubs = [];
  if (SF.bus && typeof SF.bus.on === 'function') {
    const u1 = SF.bus.on('entity:killed', (p) => {
      const st = SF.state; const killer = p && p.killerId != null && st.entities && st.entities.get ? st.entities.get(p.killerId) : null;
      const victim = p && p.id != null && st.entities && st.entities.get ? st.entities.get(p.id) : null;
      events.push({ ev: 'killed', t: now(), sim: Number.isFinite(p?.simTime) ? p.simTime : simNow(), observedSim: simNow(),
        id: lifeTracker.receiptId(p, victim), rawId: p && p.id, occupantGeneration: p?.occupantGeneration ?? null,
        type: p && p.type, killerId: p?.killerId != null ? lifeTracker.receiptId({ id: p.killerId, occupantGeneration: p.killerOccupantGeneration }, killer) : null,
        killerType: killer ? killer.type : null, byPlayer: !!(p && p.killerId === st.playerId), hostile: !!(p && p.targetHostileToPlayer),
        phase: st.run && st.run.phase, wave: st.run && st.run.wave });
    });
    if (typeof u1 === 'function') unsubs.push(u1);
    const terminalEvents = { 'asteroid:destroyed': 'asteroid-destroyed', 'entity:destroyed': 'destroyed',
      'environment:detonated': 'environment-detonated', 'entity:retired': 'retired' };
    for (const type of Object.keys(terminalEvents)) {
      const unsub = SF.bus.on(type, (p) => {
        const victim = p?.id != null ? SF.state.entities?.get?.(p.id) : null;
        events.push({ ev: terminalEvents[type],
          t: now(), sim: Number.isFinite(p?.simTime) ? p.simTime : simNow(), observedSim: simNow(),
          id: lifeTracker.receiptId(p, victim), rawId: p?.id, occupantGeneration: p?.occupantGeneration ?? null,
          type: p?.type ?? (type === 'asteroid:destroyed' ? 'asteroid' : null), reason: p?.reason ?? null,
          pos: p?.pos ? { x: p.pos.x, z: p.pos.z } : null, owner: p?.owner ?? null,
          roomSolidId: p?.roomSolidId ?? null, wave: p?.wave ?? null });
      });
      if (typeof unsub === 'function') unsubs.push(unsub);
    }
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

  // Visible only when every ancestor is visible AND the chain reaches the scene: a detached
  // object keeps visible=true but draws nothing.
  function meshChainVisible(m) {
    let o = m;
    for (; o; o = o.parent) { if (!o.visible) return false; if (o.isScene) return true; }
    return false;
  }

  // Sky/backdrop layers (deep-field stars, nebula ribbons, planets painted behind the plane)
  // are additive but are the backdrop, not VFX over the play.
  const BACKDROP_NAME = /^(SF_|SpaceFace_ClipProof)?DeepField|^SpaceBackground$|^L\d[a-z]?[_-]|^UiStage(Stars|Sky)$/;
  function isBackdrop(o) {
    for (let n = o; n && !n.isScene; n = n.parent) if (n.name && BACKDROP_NAME.test(n.name)) return true;
    return false;
  }

  function playerRecord(st, p, mesh, cam, vw, vh) {
    const intent = st.flightRuntime?.angularIntent;
    const rec = { id: p.id, alive: p.alive !== false, x: p.pos.x, y: p.pos.y || 0, z: p.pos.z, vx: p.vel.x, vz: p.vel.z,
      rot: p.rot, angVel: p.angVel || 0, pitch: p.pitch || 0, bank: p.bank || 0, hull: p.hull, hullMax: p.hullMax,
      occupantGeneration: Number.isSafeInteger(p.occupantGeneration) ? p.occupantGeneration : null,
      angularIntent: intent ? { version: intent.version, source: intent.source, active: intent.active,
        kind: intent.kind, reason: intent.reason, playerId: intent.playerId, occupantGeneration: intent.occupantGeneration,
        tick: intent.tick, sim: intent.sim, dt: intent.dt, targetYawRate: intent.targetYawRate,
        angularAcceleration: intent.angularAcceleration } : null,
      mesh: !!mesh, vis: false, onScreen: false, box: null, lod: null, model: null, state: null, tris: 0, marker: false, meshId: null, drawn: null };
    if (!mesh) return rec;
    const ud = mesh.userData || {};
    rec.meshId = mesh.uuid.slice(0, 8);
    rec.vis = meshChainVisible(mesh);
    rec.lod = ud._appliedLodLevel || (ud.lod && ud.lod.level) || null;
    rec.model = ud.authoredCompositionId || ud.assetId || mesh.name || null;
    rec.state = ud.authoredAssetState || null;
    rec.drawn = drawIdentity(mesh);
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
    let overdraw = 0; let unbounded = 0; let backdrop = 0; let instruments = 0; const per = new Map();
    const sphere = new THREE.Sphere();
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
      if (cam.layers && o.layers && !cam.layers.test(o.layers)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const mat = mats.find((m) => isAdditive(m, THREE));
      if (!mat || (mat.opacity !== undefined && mat.opacity < 0.02 && !mat.isShaderMaterial)) return;
      if (isPlayerTruthInstrumentation(o)) { instruments++; return; }
      if (isBackdrop(o)) { backdrop++; return; }
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
      tOcc: tn ? +(tc / tn).toFixed(3) : null, tN: tn, unb: unbounded, bg: backdrop, nI: instruments, top };
  }

  // Per-pixel split of what additive layers contribute: render the same camera into a native-size
  // offscreen target three times (all, combat VFX hidden, backdrop hidden) inside one synchronous
  // call, restore visibility before returning — the displayed frame is never altered. Measured
  // before post-processing (bloom). Point shaders use the live drawing-buffer height and clamp
  // their pixel sizes: a 160×90 target enlarged those stars relative to every projected hull.
  // Keep the native raster, including DPR, rather than changing the authored shaders for a probe.
  let PW = 0; let PH = 0; let pxTarget = null; let bufA = null; let bufB = null; let bufC = null;
  let cMask = null; let bMask = null;
  const pxSize = new THREE.Vector2();
  function preparePixelRaster(renderer, vw, vh) {
    if (renderer.getDrawingBufferSize) renderer.getDrawingBufferSize(pxSize);
    else pxSize.set(renderer.domElement?.width || vw, renderer.domElement?.height || vh);
    const width = Math.floor(pxSize.x); const height = Math.floor(pxSize.y);
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
      return 'renderer has no drawable pixel raster';
    }
    if (width !== PW || height !== PH) {
      const pixels = width * height;
      const nextA = new Uint8Array(pixels * 4); const nextB = new Uint8Array(pixels * 4);
      const nextC = new Uint8Array(pixels * 4);
      const nextCombatMask = new Uint8Array(pixels); const nextBackdropMask = new Uint8Array(pixels);
      if (pxTarget) pxTarget.setSize(width, height);
      else pxTarget = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.NoColorSpace });
      PW = width; PH = height;
      bufA = nextA; bufB = nextB; bufC = nextC;
      cMask = nextCombatMask; bMask = nextBackdropMask;
    } else {
      cMask.fill(0); bMask.fill(0);
    }
    return null;
  }
  let pxAttributionAttempted = false;
  function isBackdropLayer(o) {
    if (isBackdrop(o)) return true;
    if (ownerOf(o) != null) return false;
    for (let n = o; n && !n.isScene; n = n.parent) if (n.renderOrder <= -50) return true;
    return false;
  }

  // One bounded diagnosis per reader lifetime, only after the ordinary split finds positive
  // threat pixels. This never replaces the grading mask or labels a whole threat box as hull.
  function attributeCombatSplit({ renderer, draw, combat, baseline, mask, boxes, vw, vh, lum, boxFrac }) {
    const maxExtraDraws = 8; const catalogCap = 64; const LUM = 10;
    const objectPath = (object) => {
      const names = [];
      for (let node = object; node && !node.isScene && names.length < 6; node = node.parent) {
        names.unshift((node.name || node.type || '').slice(0, 64));
      }
      return names.join('/');
    };
    const describe = (object, index) => ({
      index, id: object.uuid, name: (object.name || object.type || '').slice(0, 96),
      path: objectPath(object), owner: ownerOf(object), renderOrder: object.renderOrder,
      geometry: { id: object.geometry?.uuid, type: object.geometry?.type,
        boundingRadius: object.geometry?.boundingSphere?.radius ?? null,
        frustumCulled: object.frustumCulled, instanceCount: object.isInstancedMesh ? object.count : null },
      presentationRole: object.userData?.presentationRole || null,
      onBeforeRender: object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender,
      materials: (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).map((m) => ({
        id: m.uuid, name: m.name || '', type: m.type, blending: m.blending,
        depthTest: m.depthTest, depthWrite: m.depthWrite, opacity: m.opacity,
      })),
    });
    const receipt = { status: 'unresolved', maxExtraDraws, extraDraws: 0,
      candidateCount: combat.length, candidates: combat.slice(0, catalogCap).map(describe),
      catalogTruncated: Math.max(0, combat.length - catalogCap) };
    const region = new Uint8Array(PW * PH);
    for (const b of boxes) {
      if (!(boxFrac(mask, b) >= 0.5)) continue;
      const x0 = Math.max(0, Math.floor(b[0] / vw * PW)); const x1 = Math.min(PW - 1, Math.floor(b[2] / vw * PW));
      const y0 = Math.max(0, Math.floor(b[1] / vh * PH)); const y1 = Math.min(PH - 1, Math.floor(b[3] / vh * PH));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) region[(PH - 1 - y) * PW + x] = 1;
    }
    let originalPixels = 0;
    for (let k = 0; k < region.length; k++) if (region[k] && mask[k]) originalPixels++;
    receipt.originalPositiveThreatPixels = originalPixels;
    const pixels = new Uint8Array(PW * PH * 4);
    const measure = (omitted, stability = false) => {
      if (receipt.extraDraws >= maxExtraDraws) return null;
      const prior = omitted.map((o) => o.visible);
      for (const o of omitted) o.visible = false;
      try { receipt.extraDraws++; draw(pixels); }
      finally { omitted.forEach((o, i) => { o.visible = prior[i]; }); }
      let changed = 0; let peak = 0;
      for (let k = 0; k < region.length; k++) {
        if (!region[k] || (!stability && !mask[k])) continue;
        const delta = lum(baseline, k * 4) - lum(pixels, k * 4);
        const strength = stability ? Math.abs(delta) : delta;
        if (strength >= LUM) changed++;
        peak = Math.max(peak, strength);
      }
      return { positiveThreatPixels: changed,
        originalMaskFrac: originalPixels ? +(changed / originalPixels).toFixed(3) : null,
        peakLuminanceDelta: +peak.toFixed(1) };
    };
    const prevTarget = renderer.getRenderTarget(); const prevAuto = renderer.info.autoReset;
    const prevShadow = renderer.shadowMap ? renderer.shadowMap.autoUpdate : null;
    const saved = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.autoReset = false; if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
    try {
      // Per-draw animation or upload changes must not masquerade as a layer's causal delta.
      const stability = measure([], true);
      receipt.stability = { changedThreatPixels: stability.positiveThreatPixels,
        peakLuminanceDelta: stability.peakLuminanceDelta };
      if (receipt.stability.changedThreatPixels) {
        receipt.status = 'unstable-baseline';
        return receipt;
      }
      let group = combat.slice(); let measuredGroup = null; let measured = null;
      while (group.length > 1 && receipt.extraDraws < maxExtraDraws) {
        const left = group.slice(0, Math.ceil(group.length / 2));
        measured = measure(left); measuredGroup = left;
        group = measured.positiveThreatPixels ? left : group.slice(left.length);
      }
      if (group.length === 1 && measuredGroup?.[0] === group[0] && measuredGroup.length === 1) {
        // The last subset measurement already tested this exact individual.
      } else if (group.length === 1) {
        measured = measure(group); measuredGroup = group;
      }
      if (group.length === 1 && measured?.positiveThreatPixels) {
        receipt.status = 'contributor-found';
        receipt.contributor = { ...describe(group[0], combat.indexOf(group[0])), ...measured };
        receipt.unexaminedCandidateCount = combat.length - 1;
      } else {
        receipt.status = group.length > 1 || !measured ? 'budget-exhausted' : 'no-individual-delta';
        receipt.remainingCandidateCount = group.length;
        receipt.remainingCandidateIndices = group.slice(0, catalogCap).map((o) => combat.indexOf(o));
      }
    } catch (error) {
      receipt.status = 'diagnostic-error'; receipt.error = String(error?.message || error).slice(0, 200);
    } finally {
      renderer.setRenderTarget(prevTarget); renderer.info.autoReset = prevAuto;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = prevShadow;
      renderer.info.render.calls = saved.calls; renderer.info.render.triangles = saved.triangles;
    }
    return receipt;
  }
  function pixelSplit(renderer, scene, cam, vw, vh, playerBox, threatBoxes, playerMesh, bodies) {
    if (!renderer || !renderer.isWebGLRenderer || !renderer.readRenderTargetPixels) return { err: 'renderer is not WebGL' };
    const rasterError = preparePixelRaster(renderer, vw, vh);
    if (rasterError) return { err: rasterError };
    const combat = []; const back = []; let instruments = 0;
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => isAdditive(m, THREE))) return;
      // Keep the target instrument present in all three renders. Only combat/backdrop
      // contributions change; a selected enemy cannot occlude itself by being marked.
      if (isPlayerTruthInstrumentation(o)) { instruments++; return; }
      (isBackdropLayer(o) ? back : combat).push(o);
    });
    const prevTarget = renderer.getRenderTarget(); const prevAuto = renderer.info.autoReset;
    const prevShadow = renderer.shadowMap ? renderer.shadowMap.autoUpdate : null;
    const saved = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.autoReset = false; if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
    const draw = (buf) => { renderer.setRenderTarget(pxTarget); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(pxTarget, 0, 0, PW, PH, buf); };
    try {
      draw(bufA);
      for (const o of combat) o.visible = false; try { draw(bufB); } finally { for (const o of combat) o.visible = true; }
      for (const o of back) o.visible = false; try { draw(bufC); } finally { for (const o of back) o.visible = true; }
    } finally {
      renderer.setRenderTarget(prevTarget); renderer.info.autoReset = prevAuto; if (renderer.shadowMap) renderer.shadowMap.autoUpdate = prevShadow;
      renderer.info.render.calls = saved.calls; renderer.info.render.triangles = saved.triangles;
    }
    const LUM = 10; // ≥10/255 luminance added by the layer counts as covered
    const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    let cN = 0; let bN = 0;
    for (let k = 0; k < PW * PH; k++) {
      const i = k * 4; const a = lum(bufA, i);
      if (a - lum(bufB, i) >= LUM) { cMask[k] = 1; cN++; }
      if (a - lum(bufC, i) >= LUM) { bMask[k] = 1; bN++; }
    }
    // readRenderTargetPixels rows run bottom-up.
    const boxFrac = (mask, b) => {
      if (!b) return null;
      const x0 = Math.max(0, Math.floor(b[0] / vw * PW)); const x1 = Math.min(PW - 1, Math.floor(b[2] / vw * PW));
      const y0 = Math.max(0, Math.floor(b[1] / vh * PH)); const y1 = Math.min(PH - 1, Math.floor(b[3] / vh * PH));
      if (x1 < x0 || y1 < y0) return null;
      let n = 0; let c = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { n++; if (mask[(PH - 1 - y) * PW + x]) c++; }
      return n ? c / n : null;
    };
    const occ = (mask) => { let tn = 0; let tc = 0; for (const b of threatBoxes) { const f = boxFrac(mask, b); if (f != null) { tn++; if (f >= 0.5) tc++; } } return tn ? +(tc / tn).toFixed(3) : null; };
    const pc = boxFrac(cMask, playerBox); const pb = boxFrac(bMask, playerBox);
    const ct = occ(cMask);
    let attribution = null;
    const activePlay = SF.state.mode === 'flight'
      && (!(opts.rounds ?? (SF.state.run?.kind === 'survival')) || SF.state.run?.phase === 'active');
    if (activePlay && ct > 0 && !pxAttributionAttempted) {
      pxAttributionAttempted = true;
      attribution = attributeCombatSplit({ renderer, draw, combat, baseline: bufA, mask: cMask,
        boxes: threatBoxes, vw, vh, lum, boxFrac });
    }
    const bodyOcclusion = bodies.length ? measurePlayerTruthBodyOcclusion({
      THREE, renderer, scene, camera: cam, playerMesh, bodies, playerBox, vw, vh,
      width: PW, height: PH, draw, maskCache: bodyMaskMaterials,
      silhouette: bufB, ownership: bufC,
    }) : null;
    return { c: +(cN / (PW * PH)).toFixed(3), b: +(bN / (PW * PH)).toFixed(3), cp: pc == null ? null : +pc.toFixed(3), bp: pb == null ? null : +pb.toFixed(3),
      ct, bt: occ(bMask), nC: combat.length, nB: back.length, nI: instruments, rw: PW, rh: PH,
      ...(attribution ? { attribution } : {}), ...(bodyOcclusion ? { bodyOcclusion } : {}) };
  }

  function sample() {
    const t = now(); const dt = lastT ? t - lastT : 0; lastT = t; frame++;
    const st = SF.state; const r = st.render || {};
    const cam = r.camera; const scene = r.scene; const meshes = r.meshes;
    const canvas = r.renderer && r.renderer.domElement;
    const vw = canvas ? canvas.clientWidth : win.innerWidth; const vh = canvas ? canvas.clientHeight : win.innerHeight;
    const run = st.run || null;
    let screens = false;
    try { screens = screensOverlayOpen(win.document && win.document.getElementById('screens')); } catch { screens = false; }
    const s = { f: frame, t: +t.toFixed(1), dt: +dt.toFixed(1), sim: simNow(), tick: st.tick, mode: st.mode,
      top: SF.ctx && SF.ctx.screenManager && SF.ctx.screenManager.top ? SF.ctx.screenManager.top() : null,
      screens,
      run: run ? { kind: run.kind, rs: run.ruleset, ph: run.phase, w: run.wave, a: run.arenaId, res: run.resolvedThreat, sp: run.spawnedThreat, bud: run.threatBudget, sc: Number.isFinite(run.score) ? run.score : null } : null,
      vw, vh, p: null, e: [], info: null, vfx: null,
      ...(typeof opts.rounds === 'boolean' ? { roundMode: opts.rounds } : {}) };
    if (r.renderer && r.renderer.info) s.info = { calls: r.renderer.info.render.calls, tris: r.renderer.info.render.triangles };
    // While the flight reveal veil still covers the canvas the player sees the shell, not this
    // frame, so its pixels and VFX census measure nothing. The first pixelSplit also renders the
    // scene three times into its own target and reads it back (3-5 s on SwiftShader); landing
    // behind the veil it used to delay the game's own first draw by that much.
    const flightSample = st.mode === 'flight' && r.flightVeilHoldsSim !== true;
    const skipWorldCensus = PREPARATION_MODES.has(st.mode);
    let threatBoxes = null; let bodies = null;
    if (!skipWorldCensus) {
      const list = st.entityList || [];
      let player = null;
      for (const e of list) if (e.id === st.playerId) { player = e; break; }
      const playerTeam = player ? player.team : 1;
      if (player && player.pos) s.p = playerRecord(st, player, meshes && meshes.get(player.id), cam, vw, vh);
      threatBoxes = []; bodies = [];
      for (const e of list) {
          if (!e || e.alive === false || !e.pos || e.id === st.playerId) continue;
          const cls = classifyEntity(e, st.playerId, playerTeam);
          const m = meshes ? meshes.get(e.id) : null;
          let visCode = 0; let sx = -1; let sy = -1; let pr = 0; let key = -1;
          if (cam) {
            // Physics coordinates may be a fixed tick ahead of the interpolated/rebased picture.
            // The already-presented root matrix is the observation seam for pixel measurements.
            const matrix = m?.matrixWorld?.elements;
            const sc = screenOf(cam, matrix ? matrix[12] : e.pos.x,
              matrix ? matrix[13] : e.pos.y || 0, matrix ? matrix[14] : e.pos.z,
              Math.max(0.5, e.radius || 1), vw, vh);
            sx = Math.round(sc.sx); sy = Math.round(sc.sy); pr = +sc.pr.toFixed(1);
            if (m) {
              const vis = meshChainVisible(m);
              visCode = !vis ? 1 : (sc.inView ? 3 : 2);
              const ud = m.userData || {};
              key = intern(`${m.uuid.slice(0, 8)}|${ud.authoredCompositionId || ud.assetId || m.name || ''}|${ud._appliedLodLevel || (ud.lod && ud.lod.level) || ''}|${ud.authoredAssetState || ''}|draw:${drawIdentity(m)}`);
            } else if (sc.inView) visCode = 4; // no per-entity mesh (instanced/pooled) but inside the view
            // Friendly projectile luminosity stays in the screen/player coverage masks and the
            // readability census, but it is no threat to its own player. Removing that body in
            // the combat counterfactual must not classify its visible light as self-occlusion.
            const friendlyShot = cls === 'projectile' && (e.ownerId != null && e.ownerId === st.playerId
              || e.team != null && e.team === playerTeam);
            if ((cls === 'enemy' || cls === 'projectile' && !friendlyShot) && sc.inView) {
              threatBoxes.push([sx - pr, sy - pr, sx + pr, sy + pr]);
            }
          }
          const ty = intern(`${e.type}:${e.typeId || (e.data && (e.data.asteroidKind || e.data.kind || e.data.archetype || e.data.roomKind || e.data.propRole)) || ''}`);
          s.e.push([lifeId(e), CLS[cls], +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), +(e.vel ? e.vel.x : 0).toFixed(2), +(e.vel ? e.vel.z : 0).toFixed(2), sx, sy, pr, visCode, key, ty]);
          if (['station', 'neutral', 'other'].includes(cls) && [3, 4].includes(visCode)) {
            bodies.push({ id: lifeId(e), cls, ty, mesh: m });
          }
      }
    }
    const wallDue = (last, budget) => !Number.isFinite(last) || budget === 0 || t - last >= budget;
    if (flightSample && cam && scene && frame % vfxEvery === 0
        && wallDue(lastVfxAt, visualEveryMs)) {
      lastVfxAt = t;
      try { s.vfx = vfxScan(st, cam, scene, vw, vh, s.p && s.p.onScreen ? s.p.box : null, threatBoxes || []); } catch (err) { s.vfx = { err: String(err && err.message || err) }; }
    }
    if (flightSample && cam && scene && pxEvery && frame % pxEvery === 0
        && wallDue(lastPxAt, pixelEveryMs)) {
      lastPxAt = t;
      try { s.px = pixelSplit(r.renderer, scene, cam, vw, vh, s.p && s.p.onScreen ? s.p.box : null, threatBoxes || [],
        meshes?.get(st.playerId), bodies || []); } catch (err) { s.px = { err: String(err && err.message || err) }; }
    }
    // Harness window: wall ms this sample spent on the main thread (scan, vfx census, pixel
    // redraw + readback). The grader subtracts it from the next frame's dt and from any long
    // task it overlaps, so frame metrics describe the game, not the reader.
    const end = now();
    s.rw = +(end - t).toFixed(1);
    markReaderWindow(t, end, !!s.px);
    samples.push(s);
  }

  function markReaderWindow(start, end, px) {
    const perf = win.performance;
    if (!perf || typeof perf.measure !== 'function') return;
    try {
      perf.measure(px ? 'player-truth:reader:px' : 'player-truth:reader', { start, end });
      if (typeof perf.clearMeasures === 'function') perf.clearMeasures(px ? 'player-truth:reader:px' : 'player-truth:reader');
    } catch { /* measure is diagnostic only */ }
  }

  function loop() {
    if (!running) return;
    try { sample(); } catch (err) { events.push({ ev: 'readerError', t: now(), msg: String(err && err.message || err) }); }
    raf = win.requestAnimationFrame(loop);
  }

  const api = {
    version: 1,
    packBatch(batch) {
      for (const sample of batch.samples) {
        const packet = encodePlayerTruthRows(sample.e);
        if (packet) { sample.e = []; sample.ePacked = packet; }
      }
      return batch;
    },
    identityFor(id, generation) { return lifeTracker.identityFor(id, generation); },
    start() { if (running) return; running = true; lastT = 0; raf = win.requestAnimationFrame(loop); },
    stop() { running = false; if (raf) win.cancelAnimationFrame(raf); },
    drain({ maxSamples = 32 } = {}) {
      // CDP boxes every numeric value before Node can pack it. A screenshot/GPU wait
      // can leave minutes of observations queued; returning that entire batch creates
      // a multi-GB deserialization peak. Page the transfer, preserving every frame.
      const count = Math.max(1, Math.min(128, Math.trunc(maxSamples) || 32));
      const out = { samples: samples.splice(0, count), pendingSamples: samples.length,
        events: events.splice(0), longTasks: longTasks.splice(0), keys: keys.slice(), firstInput };
      return out;
    },
    dispose() {
      api.stop();
      if (pxTarget) pxTarget.dispose();
      for (const material of bodyMaskMaterials.values()) material.dispose();
      bodyMaskMaterials.clear();
      pxTarget = null; bufA = null; bufB = null; bufC = null; cMask = null; bMask = null;
      PW = 0; PH = 0;
      for (const name of INPUT_EVENTS) win.removeEventListener(name, onInput, { capture: true });
      for (const u of unsubs) try { u(); } catch { /* observer teardown */ }
      if (po) po.disconnect();
      delete win.__playerTruth;
    },
  };
  win.__playerTruth = api;
  return api;
}
