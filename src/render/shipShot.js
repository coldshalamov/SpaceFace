// Dev-only single-frame Kestrel hero capture (live pipeline for spec §16.2/§16.3/§22).
//
// Unlike shipPreview.js's rAF turntable (which depends on the browser frame clock and is fragile under
// headless --virtual-time-budget), this renders ONE still of the player Kestrel from a fixed 3/4 angle
// and POSTs it to the /__shot dev sink immediately. Robust in headless Chrome: no animation loop, no
// rAF, no virtual-time dependency — build, frame, render once, capture, done.
//
// Entry: ?dev=shipshot  (see main.js). Captures: kestrel_hero_live.jpg.
import * as THREE from 'three';
export async function runShipShot(SF) {
  const state = SF.state;
  const renderer = state.render && state.render.renderer;
  const scene = state.render && state.render.scene;
  const cam = state.render && state.render.camera;
  const vf = state.render && state.render.vf;
  if (!renderer || !scene || !cam || !vf) { console.warn('[shipShot] render handle missing'); return; }

  // Wait for the PMREM env-map bake so chrome/metal hulls read correctly.
  for (let i = 0; i < 40 && !state.render.envMap; i++) await new Promise((r) => setTimeout(r, 100));
  console.log('[shipShot] envMap', state.render.envMap ? 'ready' : 'not ready');

  // Build the player Kestrel through the LIVE factory — the hero override seam intercepts it, so this
  // is exactly the mesh gameplay shows (spec §22 "the ship shown in icon, shipyard, screenshot, and
  // gameplay is the same design").
  const ent = { id: 'shot_kestrel', type: 'ship', team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel', fittings: [] } };
  let mesh;
  try { mesh = vf.build(ent); }
  catch (err) { console.error('[shipShot] Kestrel build failed', err); return; }
  if (!mesh) { console.warn('[shipShot] no mesh'); return; }

  // Stage it in a clean temp group; hide live entities so only the Kestrel is in frame.
  const tmp = new THREE.Group(); scene.add(tmp);
  tmp.add(mesh);
  mesh.position.set(0, 0, 0);
  const hidden = [];
  for (const child of scene.children) { if (child !== tmp && child.userData && child.userData.kind) { child.visible = false; hidden.push(child); } }

  // Fixed 3/4 chase framing — the normal gameplay camera angle, so the still is representative.
  const prevPos = cam.position.clone();
  cam.position.set(34, 26, 34);
  cam.lookAt(0, 1.5, 0);

  // Render once and capture. preserveDrawingBuffer is on in dev (renderer.js) so toDataURL reads back.
  renderer.render(scene, cam);
  await new Promise((r) => setTimeout(r, 30)); // let the GPU finish
  try {
    const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
    const res = await fetch('/__shot?name=kestrel_hero_live', { method: 'POST', body: url });
    console.log('[shipShot] captured kestrel_hero_live.jpg ->', (await res.json()).file);
  } catch (err) { console.error('[shipShot] capture failed', err); }

  // Capture a Critical damage-state frame (spec §22: "damage state can be understood without only
  // reading the hull bar"). Drive the hero's damage driver to a low hull fraction, re-render, capture.
  if (typeof mesh.userData.updateDamageState === 'function') {
    const damaged = { id: 'shot_kestrel', hull: 80, hullMax: 1000 }; // ~8% -> critical
    for (let i = 0; i < 3; i++) mesh.userData.updateDamageState(damaged, performance.now() * 0.001 + i);
    renderer.render(scene, cam);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const url2 = renderer.domElement.toDataURL('image/jpeg', 0.88);
      const res2 = await fetch('/__shot?name=kestrel_hero_critical', { method: 'POST', body: url2 });
      console.log('[shipShot] captured kestrel_hero_critical.jpg ->', (await res2.json()).file);
    } catch (err) { console.error('[shipShot] critical capture failed', err); }
  }

  // ---- §18 Gate 6: bloom on/off diagnostic pair + frame-time report ----
  // Capture the same framing with bloom on and off so the diagnostic difference is visible, and dump
  // the diagnostics report (draw calls / tris / frame-time p95) to a JSON the live session reads.
  const video = (state.settings && state.settings.video) || {};
  const prevBloom = video.bloom;
  const captureAt = async (name, camPos) => {
    cam.position.set(camPos[0], camPos[1], camPos[2]);
    cam.lookAt(0, 1.5, 0);
    renderer.render(scene, cam);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
      const res = await fetch('/__shot?name=' + name, { method: 'POST', body: url });
      console.log('[shipShot] captured', name, '->', (await res.json()).file);
    } catch (err) { console.error('[shipShot] capture', name, 'failed', err); }
  };

  video.bloom = true; if (state.render.bloom) state.render.bloom.setOptions && state.render.bloom.setOptions({ bloom: true });
  await captureAt('kestrel_bloom_on', [34, 26, 34]);
  video.bloom = false;
  await captureAt('kestrel_bloom_off', [34, 26, 34]);
  video.bloom = prevBloom; // restore
  // Top-down smallest-scale view (the §22 'silhouette at smallest camera scale' bullet, live).
  await captureAt('kestrel_topdown', [0, 70, 0.01]);

  // Diagnostics report: draw calls / tris / frame-time. One sample isn't a p95, but it confirms the
  // pipeline runs and records the structure (real per-frame p95 needs the live loop on target HW).
  try {
    const diag = (typeof window !== 'undefined') && window.__THREE_GAME_DIAGNOSTICS__;
    if (diag && typeof diag.getReport === 'function') {
      const report = diag.getReport();
      await fetch('/__shot?name=kestrel_diagnostics', { method: 'POST', body: JSON.stringify(report) });
      console.log('[shipShot] diagnostics: calls=' + report.render.calls + ' tris=' + report.render.triangles + ' lastMs=' + (report.frameMs && report.frameMs.last));
    } else {
      console.log('[shipShot] diagnostics handle not yet available');
    }
  } catch (err) { console.error('[shipShot] diagnostics dump failed', err); }

  // Restore the scene so a subsequent live session isn't disturbed.
  cam.position.copy(prevPos);
  scene.remove(tmp);
  for (const c of hidden) c.visible = true;
}
