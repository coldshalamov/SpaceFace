#!/usr/bin/env node
// X1 lineup capture — the ordinary route: title -> Swarm -> Ricochet Foundry.
//
// Produces a genuine prop turntable, not a chase drive-by: the capture builds an isolated
// perspective camera, aims it at the plate's own bounding-box centre, and orbits AROUND that
// centre (six 60° views plus a true edge-on frame and an underside frame). Gate / furnace /
// shutter close-ups use the same aimed camera. One wide frame is taken on the ordinary gameplay
// chase camera, then the HUD is hidden for the finish evidence.
//
//   node scripts/capture-x1-lineup.mjs [--out=.devshots/x1] [--wait=24000]
//   SF_GL=d3d11 node scripts/capture-x1-lineup.mjs     # real GPU instead of SwiftShader
//
// Writes a manifest with each frame's projected AABB width AND visible silhouette width, so
// captions can cite the picture instead of the box corners.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const OUT = ROOT + (args.out || '.devshots/x1') + '/';
mkdirSync(OUT, { recursive: true });

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: process.env.SF_GL === 'd3d11'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling'],
});

const errors = [];
const frames = [];
let routeFrame = null;
let page = null;
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });

  // The ordinary first-run route: splash -> motion -> First light -> title.
  async function clickText(text, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const clicked = await page.evaluate((wanted) => {
        const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
        const match = buttons.find((b) => b.textContent.trim() === wanted)
          || buttons.find((b) => b.textContent.includes(wanted));
        if (!match) return false;
        match.click();
        return true;
      }, text);
      if (clicked) return true;
      await page.waitForTimeout(150);
    }
    return false;
  }

  if (await clickText('CLICK OR PRESS ANY KEY', 4000)) await page.waitForTimeout(800);
  if (!(await clickText('Full', 4000))) {
    // A profile that has already chosen a motion setting skips the dialog.
  }
  await page.waitForTimeout(800);
  if (!(await clickText('PLAY', 4000))) {
    // First light may already be recorded.
  }
  if (!(await clickText('Swarm', 90000))) {
    // Fall back to the old Crucible door.
    if (!(await clickText('Crucible', 10000))) throw new Error('no Swarm or Crucible entry');
    await clickText('Quick play', 20000);
    await clickText('Choose ship & kit', 20000);
    await clickText('Launch', 60000);
  }
  // Pick the Foundry by its authored arena id, not by a label guess. The tiles carry
  // data-arena-id; clicking the first matching tile is the same selection a player makes.
  const picked = await page.evaluate(() => {
    const tile = document.querySelector('button[data-arena-id="helios_core"]');
    if (!tile) return false;
    tile.click();
    return true;
  });
  if (picked) await page.waitForTimeout(400);

  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && s?.run?.kind === 'survival' && s?.run?.phase !== 'inactive';
  }, null, { timeout: 300000 });
  // A first-run modal can survive the launch; dismiss it once, then let the room settle.
  if (await page.evaluate(() => document.body.classList.contains('ui-modal-open'))) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }

  const settle = Math.max(6000, Number(args.wait) || 24000);
  await page.waitForTimeout(settle);

  const arena = await page.evaluate(() => {
    const s = window.SF.state;
    const kinds = {};
    for (const entity of s.entities.all ? s.entities.all() : [...s.entities.values()]) {
      const kind = entity?.data?.roomKind;
      if (kind) kinds[kind] = (kinds[kind] || 0) + 1;
    }
    return {
      arenaId: s.run?.arenaId || null,
      wave: s.run?.wave ?? null,
      sector: s.world?.currentSectorId ?? null,
      foundry: kinds,
    };
  });

  // Hide the HUD for the finish evidence. The wide frame is a real gameplay chase frame; the
  // rest are isolated aimed-camera frames (below).
  await page.addStyleTag({ content: '#ui-root, #hud { display: none !important; }' });

  // Frame the wide shot: park the hull on the play side of the bank plate so the authored
  // furniture is ahead of the ship in the ordinary chase composition. This is a capture-rig
  // pose (position writes reconcile through the SG-02 pose path), not a fake outcome.
  const wideSetup = await page.evaluate(() => {
    const s = window.SF.state;
    const entities = s.entities.all ? s.entities.all() : [...s.entities.values()];
    const plate = entities.find((e) => e?.data?.roomKind === 'plate' && e.mesh);
    if (!plate) return { ok: false, reason: 'no plate' };
    const p = s.entities.get(s.playerId);
    if (!p) return { ok: false, reason: 'no player' };
    const platePos = { x: plate.pos.x, z: plate.pos.z };
    if (typeof p.pos.set === 'function') p.pos.set(platePos.x, 0, platePos.z - 240);
    else { p.pos.x = platePos.x; p.pos.z = platePos.z - 240; }
    p.prevPos?.copy?.(p.pos);
    if (p.vel?.set) p.vel.set(0, 0, 0);
    else { p.vel.x = 0; p.vel.z = 0; }
    p.rot = Math.PI / 2; // nose toward +Z, with the plate ahead of the camera
    p.flags = { ...(p.flags || {}), noInterp: true };
    s.camera.zoom = 96;
    window.SF.bus.emit('camera:zoom', { level: 96 });
    s.render?.cameraCtrl?.snapToPlayer?.();
    return { ok: true, plate: platePos };
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + 'after-foundry-wide-1600.png', timeout: 180000 });
  // The committed wide is kept from 2026-11-06; this run's route pose is recorded separately so
  // the manifest never claims the committed file is the new capture.
  routeFrame = { name: 'after-foundry-wide-1600.png', camera: 'ordinary gameplay chase', wideSetup };

  // Isolated aimed camera. One render per evaluate; the PNG is read back from the live canvas
  // synchronously, so the next rAF cannot overwrite the frame before it is encoded.
  async function aimedFrame(name, job) {
    const result = await page.evaluate(async (spec) => {
      const SF = window.SF;
      const state = SF.state;
      const THREE = SF.THREE;
      const render = state.render;
      if (!render?.renderer || !render?.scene || !render?.camera) {
        return { ok: false, reason: 'no live renderer' };
      }
      const entities = state.entities.all ? state.entities.all() : [...state.entities.values()];
      let created = null;
      let target = entities.find((e) => e?.data?.roomKind === spec.kind && e.mesh);
      if (!target && spec.isolated) {
        // The furnace/shutter only exist on their authored wave phases. Their finish still
        // needs a close-up, so render the factory's own prop in isolation and label it as such.
        const mod = await import('/src/render/visualFactory.js');
        const factory = mod.createVisualFactory();
        const radius = spec.kind === 'furnace' ? 34 : spec.kind === 'shutter' ? 20 : 16;
        created = factory.build({
          id: `capture-${spec.kind}`, type: 'station', radius,
          data: { roomOwner: 'survival-arena', roomKind: spec.kind },
        });
        render.scene.add(created);
        target = { mesh: created };
      }
      if (!target) return { ok: false, reason: `no ${spec.kind}` };
      const root = target.mesh;
      const saved = [];
      for (const e of entities) {
        if (e.mesh && e.mesh !== root) {
          saved.push([e.mesh, e.mesh.visible]);
          e.mesh.visible = false;
        }
      }
      // Isolate the prop from the asteroid field, VFX pools and every other scene sibling.
      // Walk the root's ancestor chain and hide each sibling (lights stay lit). This is the
      // difference between a real prop turntable and a chase frame with rocks in front of it.
      const savedScene = [];
      let node = root;
      while (node && node !== render.scene) {
        const parent = node.parent;
        if (parent) {
          for (const child of parent.children) {
            if (child === node || child.isLight) continue;
            savedScene.push([child, child.visible]);
            child.visible = false;
          }
        }
        node = parent;
      }
      const bg = render.spaceBg?.group || null;
      const bgVisible = bg ? bg.visible : null;
      if (bg) bg.visible = false;
      const width = Number(spec.width) || 1600;
      const height = Number(spec.height) || 1000;
      const savedSize = render.renderer.getSize(new THREE.Vector2());
      const savedPixelRatio = render.renderer.getPixelRatio();
      try {
        render.renderer.setPixelRatio(1);
        render.renderer.setSize(width, height, false);
        root.updateWorldMatrix(true, true);
        const rootVisible = root.visible;
        const rootParent = root.parent ? (root.parent.type || 'Object3D') : null;
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const cam = render.camera.clone();
        cam.up.set(0, 1, 0);
        cam.aspect = width / Math.max(1, height);
        const vfov = cam.fov * Math.PI / 180;
        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
        const fill = Math.max(0.2, Math.min(0.95, spec.fill || 0.62));
        const elev = (spec.elevationDeg || 0) * Math.PI / 180;
        const yaw = (spec.yawDeg || 0) * Math.PI / 180;
        const dir = new THREE.Vector3(
          Math.cos(elev) * Math.cos(yaw),
          Math.sin(elev),
          Math.cos(elev) * Math.sin(yaw),
        );
        // Fit the bounding SPHERE, not the axis-aligned x/y extents: the plate's long axis can
        // be rotated onto the camera's view width, which made an x-only fit crop the deck.
        const distanceMin = Math.max(1, sphere.radius * 0.85);
        let distance = Math.max(
          sphere.radius / (fill * Math.tan(vfov / 2)),
          sphere.radius / (fill * Math.tan(hfov / 2)),
          distanceMin,
        );
        const place = (d) => {
          cam.position.copy(center).addScaledVector(dir, d);
          cam.lookAt(center);
          cam.near = Math.max(0.1, d / 100);
          cam.far = Math.max(2000, d * 20);
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld(true);
        };
        const measure = () => {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < 8; i++) {
            const corner = new THREE.Vector3(
              i & 1 ? box.max.x : box.min.x,
              i & 2 ? box.max.y : box.min.y,
              i & 4 ? box.max.z : box.min.z,
            ).project(cam);
            minX = Math.min(minX, corner.x);
            maxX = Math.max(maxX, corner.x);
            minY = Math.min(minY, corner.y);
            maxY = Math.max(maxY, corner.y);
          }
          return {
            width: Math.max(0, (maxX - minX) / 2) * 100,
            height: Math.max(0, (maxY - minY) / 2) * 100,
          };
        };
        // Two-pass fit: the first sphere estimate gets close, then the projected extent (which
        // includes the plate's long axis at this yaw) sets the final distance.
        place(distance);
        for (let i = 0; i < 3; i++) {
          const extent = measure();
          // Edge-on: fit the WIDTH only. The slab's near edge projects a tall vertical wedge at
          // a grazing angle; letting that height drive the fit collapses the camera into the
          // plate. The width is the readable dimension for the edge frame.
          const largest = spec.fitWidth ? extent.width : Math.max(extent.width, extent.height);
          if (largest < 0.5) break;
          distance = Math.max(distanceMin, distance * (largest / (fill * 100)));
          place(distance);
        }
        const final = measure();
        const aabbWidthPct = final.width;
        const aabbHeightPct = final.height;
        const prevTarget = render.renderer.getRenderTarget();
        const prevClear = new THREE.Color();
        render.renderer.getClearColor(prevClear);
        const prevAlpha = render.renderer.getClearAlpha();
        render.renderer.setRenderTarget(null);
        render.renderer.setClearColor(0x07090c, 1);
        render.renderer.render(render.scene, cam);
        // X1 final review: the projected AABB is not the picture. Read the default framebuffer
        // in the same task as the draw and measure the pixels that differ from the capture clear.
        // This is the visible silhouette (alpha/depth mask equivalent), not the box corners.
        const visible = (() => {
          const gl = render.renderer.getContext();
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          const clear = [7, 9, 12];
          let minX = width;
          let maxX = -1;
          let minY = height;
          let maxY = -1;
          let count = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const dr = pixels[i] - clear[0];
              const dg = pixels[i + 1] - clear[1];
              const db = pixels[i + 2] - clear[2];
              if (dr * dr + dg * dg + db * db <= 36) continue;
              count += 1;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          if (!count) return null;
          return {
            widthPct: Number((((maxX - minX + 1) / width) * 100).toFixed(1)),
            heightPct: Number((((maxY - minY + 1) / height) * 100).toFixed(1)),
            pixelPct: Number(((count / (width * height)) * 100).toFixed(2)),
          };
        })();
        const dataUrl = render.renderer.domElement.toDataURL('image/png');
        const drawCalls = render.renderer.info?.render?.calls ?? null;
        const triangles = render.renderer.info?.render?.triangles ?? null;
        render.renderer.setClearColor(prevClear, prevAlpha);
        render.renderer.setRenderTarget(prevTarget);
        return {
          ok: true,
          dataUrl,
          isolated: !!created,
          rootVisible,
          rootParent,
          drawCalls,
          triangles,
          aabbWidthPct: Number(aabbWidthPct.toFixed(1)),
          aabbHeightPct: Number(aabbHeightPct.toFixed(1)),
          visibleWidthPct: visible ? visible.widthPct : null,
          visibleHeightPct: visible ? visible.heightPct : null,
          visiblePixelPct: visible ? visible.pixelPct : null,
          distance: Number(distance.toFixed(1)),
          cameraPos: [Number(cam.position.x.toFixed(1)), Number(cam.position.y.toFixed(1)), Number(cam.position.z.toFixed(1))],
          renderSize: `${width}x${height}`,
          size: { x: Number(size.x.toFixed(2)), y: Number(size.y.toFixed(2)), z: Number(size.z.toFixed(2)) },
          center: { x: Number(center.x.toFixed(2)), y: Number(center.y.toFixed(2)), z: Number(center.z.toFixed(2)) },
        };
      } finally {
        render.renderer.setPixelRatio(savedPixelRatio);
        render.renderer.setSize(savedSize.x, savedSize.y, false);
        for (const [mesh, visible] of saved) mesh.visible = visible;
        for (const [obj, visible] of savedScene) obj.visible = visible;
        if (bg) bg.visible = bgVisible;
        if (created) render.scene.remove(created);
      }
    }, job);
    if (!result.ok) {
      frames.push({ name, error: result.reason || 'aimed frame failed' });
      return;
    }
    const base64 = String(result.dataUrl).replace(/^data:image\/png;base64,/, '');
    writeFileSync(OUT + name, Buffer.from(base64, 'base64'));
    frames.push({
      name,
      camera: result.isolated
        ? 'isolated prop render (factory buildFoundryToy)'
        : 'isolated aimed camera (live prop)',
      cameraYawDeg: job.yawDeg,
      cameraElevationDeg: job.elevationDeg,
      aabbWidthPct: result.aabbWidthPct,
      aabbHeightPct: result.aabbHeightPct,
      visibleWidthPct: result.visibleWidthPct,
      visibleHeightPct: result.visibleHeightPct,
      visiblePixelPct: result.visiblePixelPct,
      distance: result.distance,
      renderSize: result.renderSize,
      cameraPos: result.cameraPos,
      render: { calls: result.drawCalls, triangles: result.triangles, rootVisible: result.rootVisible, rootParent: result.rootParent },
      propSize: result.size,
      propCenter: result.center,
    });
  }

  // Six orbit views around the plate's own centre; then the two diagnostic elevations the
  // chase camera can never show. `fill` is the target fraction of the viewport width.
  for (let i = 0; i < 6; i++) {
    await aimedFrame(`turntable-${String(i).padStart(2, '0')}.png`, {
      kind: 'plate', yawDeg: i * 60, elevationDeg: 24, fill: 0.62, fitWidth: true,
    });
  }
  await aimedFrame('turntable-edge.png', {
    kind: 'plate', yawDeg: 90, elevationDeg: 6, fill: 0.62, fitWidth: true,
  });
  await aimedFrame('turntable-underside.png', {
    kind: 'plate', yawDeg: 90, elevationDeg: -24, fill: 0.62, fitWidth: true,
  });
  await aimedFrame('after-plate-close-1600.png', {
    kind: 'plate', yawDeg: 18, elevationDeg: 26, fill: 0.62, fitWidth: true,
  });

  // The second review finding: the gate/block/shutter finish needs its own close-up, not only
  // the bank plate. Each prop is framed by its own bounds. Furnace/shutter live on authored wave
  // phases; when they are absent from wave 1 the factory's own prop is rendered in isolation
  // and the manifest labels that honestly.
  for (const [kind, name] of [
    ['gate', 'close-gate-1600.png'],
    ['furnace', 'close-furnace-1600.png'],
    ['shutter', 'close-shutter-1600.png'],
    ['crate', 'close-block-1600.png'],
  ]) {
    await aimedFrame(name, { kind, yawDeg: 35, elevationDeg: 20, fill: 0.58, isolated: true });
  }

  const manifest = {
    schema: 'spaceface.x1.lineup.v1',
    capturedAt: new Date().toISOString(),
    viewport: { width: 1600, height: 1000 },
    arena,
    route: 'title -> Swarm -> Ricochet Foundry (data-arena-id helios_core)',
    hud: 'hidden',
    measurement: {
      aabbWidthPct: 'projected bounding-box corners; an envelope, not the picture',
      visibleWidthPct: 'default-framebuffer pixels differing from the 0x07090c capture clear (visible silhouette)',
    },
    committedWide: {
      file: 'after-foundry-wide-1600.png',
      note: 'The existing 2026-11-06 gameplay chase frame is kept: the bank plate is bottom-centre at ~21% width. The capture script also takes a route frame, but this pass did not replace the committed wide.',
      camera: 'ordinary gameplay chase',
    },
    routeFrame,
    frames,
    errors: [...new Set(errors)].slice(0, 20),
    captureCommand: 'node scripts/capture-x1-lineup.mjs --out=.devshots/x1-final --wait=15000',
  };
  writeFileSync(OUT + 'capture-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await page?.close().catch(() => {});
  await browser.close().catch(() => {});
  server.close();
}
