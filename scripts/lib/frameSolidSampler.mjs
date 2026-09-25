// In-page sampler for the "sacred player frame" defect class: things on the live screen that
// blink out, reload, regress from their authored body to a stand-in, or lose collision while the
// player is at them. Pass `installFrameSolidSampler` to page.evaluate; it must stay
// self-contained (no outer-scope references). Read the record back from window.__SF_FRAME__.
//
// Counters (all only while mode === 'flight' and the first playable frame has presented):
//   blinks          on-screen for two consecutive frames and visibility went true -> false
//   missingFrames   frames an on-screen entity drew nothing
//   stuckMissing    of those, frames where it had already been on screen >= 1 s
//   rootSwaps       the entity's mesh root object was replaced while on screen (rebuild/reload)
//   regressions     authoredAssetState left 'authored' while on screen (body -> stand-in)
//   stationNoCollider  frames the player was inside a station's dock envelope while that station
//                      was absent from the physics static set
export async function installFrameSolidSampler() {
  const SF = window.SF;
  const THREE = SF && SF.THREE;
  if (!SF || !SF.state || !THREE) throw new Error('window.SF / SF.THREE unavailable');
  const activity = await import('/src/core/worldActivityManager.js');
  const TYPES = new Set(['ship', 'station', 'asteroid', 'wreck', 'drone', 'freighter']);
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const track = new Map();
  const rec = {
    frames: 0, blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0,
    stationNearFrames: 0, stationNoCollider: 0, maxOnScreen: 0,
    byType: {}, offenders: {},
  };
  window.__SF_FRAME__ = rec;
  window.__SF_FRAME_STOP__ = false;

  const bump = (e, key) => {
    rec[key]++;
    const t = rec.byType[e.type] || (rec.byType[e.type] = { blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0 });
    t[key]++;
    const id = String(e.id);
    const o = rec.offenders[id] || (rec.offenders[id] = {
      type: e.type, defId: (e.data && (e.data.defId || e.data.stationId || e.data.stationTypeId)) || null,
      radius: e.radius, blinks: 0, missingFrames: 0, stuckMissing: 0, rootSwaps: 0, regressions: 0,
    });
    o[key]++;
  };
  const effectivelyVisible = (mesh, scene) => {
    if (!mesh || mesh.visible === false) return false;
    let node = mesh;
    while (node.parent) {
      node = node.parent;
      if (node.visible === false) return false;
    }
    return scene ? node === scene : true;
  };
  const visualRadius = (e) => Math.max(
    Number(e.radius) || 0,
    e.type === 'station' ? Number(e.data && e.data.dockRadius) || 0 : 0,
    Number(e.data && e.data.visualRadius) || 0,
  );

  const tick = () => {
    if (window.__SF_FRAME_STOP__ === true) return;
    requestAnimationFrame(tick);
    const state = SF.state;
    const render = state && state.render;
    const camera = render && render.camera;
    if (!state || state.mode !== 'flight' || !render || !Number.isFinite(render.firstPlayableFrameAt)) return;
    if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return;
    const scene = render.scene || null;
    const now = performance.now();
    rec.frames++;
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    const origin = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
    const ox = Number(origin.x) || 0;
    const oz = Number(origin.z) || 0;
    const player = state.entities && state.entities.get(state.playerId);
    let frame = null;
    let onScreenCount = 0;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !TYPES.has(e.type) || e.id === state.playerId) continue;
      sphere.center.set(e.pos.x - ox, 0, e.pos.z - oz);
      sphere.radius = Math.max(1, visualRadius(e));
      const onScreen = frustum.intersectsSphere(sphere);
      let t = track.get(e.id);
      if (!onScreen) {
        if (t) t.onSince = -1;
        if (t) t.prevOnScreen = false;
      } else {
        onScreenCount++;
        const mesh = e.mesh || null;
        const visible = effectivelyVisible(mesh, scene);
        const uuid = mesh ? mesh.uuid : null;
        const assetState = mesh && mesh.userData ? mesh.userData.authoredAssetState || null : null;
        if (!t) {
          t = { prevOnScreen: false, prevVisible: false, uuid, assetState, onSince: now };
          track.set(e.id, t);
        }
        if (t.onSince < 0) t.onSince = now;
        if (t.prevOnScreen) {
          if (t.prevVisible && !visible) bump(e, 'blinks');
          if (t.uuid && uuid && t.uuid !== uuid) bump(e, 'rootSwaps');
          if (t.assetState === 'authored' && assetState !== 'authored') bump(e, 'regressions');
        }
        if (!visible) {
          bump(e, 'missingFrames');
          if (now - t.onSince >= 1000) {
            bump(e, 'stuckMissing');
            const o = rec.offenders[String(e.id)];
            const reasons = o.reasons || (o.reasons = {});
            const add = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
            const ud = (mesh && mesh.userData) || {};
            const af = render.activityFrame;
            if (!mesh) add('noMesh');
            else if (mesh.visible === false) add('rootHidden');
            else if (!mesh.parent) add('detached');
            else add('ancestorHiddenOrOffScene');
            if (ud.pipelinesPending === true) add('pipelinesPending');
            if (ud.geometryPending === true) add('geometryPending');
            if (ud.authoredAdmissionSubstrate === true) add('admissionSubstrate');
            if (ud.authoredAssetState) add(`asset:${ud.authoredAssetState}`);
            add(`tier:${(e.activity && e.activity.presentationTier) || 'none'}`);
            add(`sim:${(e.activity && e.activity.simTier) || 'none'}`);
            if (af && af.renderGlassIds && af.renderGlassIds.has && af.renderGlassIds.has(e.id)) add('inGlassSet');
            if (af && af.renderRunwayIds && af.renderRunwayIds.has && af.renderRunwayIds.has(e.id)) add('inRunwaySet');
          }
        }
        t.prevOnScreen = true;
        t.prevVisible = visible;
        t.uuid = uuid;
        t.assetState = assetState;
      }
      if (e.type === 'station' && player && player.pos && !(e.data && (e.data.isGate || e.data.isWormhole))) {
        const envelope = (Number(e.data && e.data.dockRadius) || Number(e.radius) || 0) + 150;
        const dx = e.pos.x - player.pos.x;
        const dz = e.pos.z - player.pos.z;
        if (dx * dx + dz * dz <= envelope * envelope) {
          rec.stationNearFrames++;
          frame = frame || activity.getActivityFrame(state);
          const statics = frame && frame.exactStaticCells;
          if (!statics || statics.indexOf(e) < 0) rec.stationNoCollider++;
        }
      }
    }
    if (onScreenCount > rec.maxOnScreen) rec.maxOnScreen = onScreenCount;
  };
  requestAnimationFrame(tick);
  return true;
}

/** Keep the worst offenders only, so the record prints on one screen. */
export function summarizeFrameSolid(rec, limit = 8) {
  if (!rec) return null;
  const offenders = Object.entries(rec.offenders || {})
    .map(([id, o]) => ({ id, ...o, score: o.blinks * 10 + o.rootSwaps * 10 + o.regressions * 10 + o.stuckMissing }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { ...rec, offenders };
}
