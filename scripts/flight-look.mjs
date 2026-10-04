// Flight look: boot the real game, New Game -> Launch, and screenshot the live flight picture
// (full post pipeline, HUD optional) at the default chase zoom and the close zoom.
//   node scripts/flight-look.mjs [--wait=20] [--zooms=144,58] [--hud] [--out=.devshots/flight-look]
//   node scripts/flight-look.mjs --act=thrust,fire     # also shoot each zoom while thrusting/firing/boosting
import { mkdirSync, existsSync } from 'node:fs';
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
const OUT = ROOT + (args.out || '.devshots/flight-look') + '/';
const zooms = String(args.zooms || '144,58').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  // SF_GL=d3d11 shoots on the machine's real GPU (seconds per frame, the shipping driver path);
  // the default stays the software rasterizer so captures work on a GPU-less host.
  args: process.env.SF_GL === 'd3d11'
    ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling'],
});

async function clickButton(page, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await page.evaluate((wanted) => {
      const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
      const match = buttons.find((b) => b.textContent.trim() === wanted) || buttons.find((b) => b.textContent.includes(wanted));
      if (!match) return false;
      match.click();
      return true;
    }, label);
    if (clicked) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const consoleLines = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(m.text().slice(0, 400)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New Game')), null, { timeout: 120000 });
  if (!(await clickButton(page, 'New Game', 30000))) throw new Error('New Game button not clickable');
  if (!(await clickButton(page, 'Launch', 60000))) throw new Error('Launch button not clickable');
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && !!s.entities?.get(s.playerId) && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 300000 });
  // SwiftShader never completes the post-opening GPU admission that releases the authored upgrade
  // queue, so every non-opening body would stay a resolving marker. Release it for the capture.
  await page.evaluate(async () => {
    const lib = await import('/src/render/partsLibrary.js');
    lib.resumeAuthoredUpgradeQueueAfterOpening(window.SF.state.render.scene);
  });
  if (args.ship) {
    const swapped = await page.evaluate((defId) => {
      const ships = window.SF.registry?.get?.('ships');
      if (!ships) return 'no ships system';
      const ok = ships.buyShip({ defId, grant: true, setActive: true });
      const s = window.SF.state; const p = s.entities.get(s.playerId);
      return `buy=${ok} active=${p?.data?.defId}`;
    }, String(args.ship));
    console.log('ship swap', swapped);
  }
  if (args.sector) {
    // Jump to a non-opening sector through the same entry point a gate/drive jump uses, so the
    // sector materializes at full presence before we aim.
    const jumped = await page.evaluate((sectorId) => {
      const world = window.SF.registry?.get?.('world');
      if (!world?.enterSector) return 'no world.enterSector';
      world.enterSector(sectorId, { fromJump: true, via: 'drive', fromSectorId: window.SF.state.world?.currentSectorId });
      return `sector=${window.SF.state.world?.currentSectorId}`;
    }, String(args.sector));
    console.log('sector', jumped);
    await page.waitForTimeout(4000);
  }
  const aimList = args.aims
    ? String(args.aims).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // The chase camera follows player position only — park the player `aimDist` WU +Z of the
  // named station so the place sits on screen.
  async function aimAt(token, dist) {
    return page.evaluate(({ token, dist }) => {
      const s = window.SF.state;
      const matches = (e) => {
        const d = e.data || {};
        return d.stationId === token || d.archetypeGlb === token || d.poiId === token
          || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
          || e.placeId === token || (e.data && e.data.placeId) === token
          || e.id === token || e.id === `${token}/root`;
      };
      let target = null;
      for (const e of s.entities.values()) if (matches(e)) { target = e; break; }
      // POI lane marks and most dressing are presentation rows, not live entities.
      if (!target) {
        for (const row of s.world?.dressing?.rows || []) {
          if (row && row.alive !== false && matches(row)) { target = row; break; }
        }
      }
      if (!target) return 'no station match';
      // Same-sector teleports must go through relocatePlayerInSector: a raw pos+prevPos write
      // emits no transform record, so the presented hull stays parked at the old spot and the
      // chase camera (which follows the presented pose) frames empty space.
      const world = window.SF.registry?.get?.('world');
      const moved = world && world.relocatePlayerInSector
        ? world.relocatePlayerInSector({ x: target.pos.x, z: target.pos.z + dist }, { reason: 'flight-look:aim' })
        : false;
      if (!moved) {
        const p = s.entities.get(s.playerId);
        p.pos.x = target.pos.x;
        p.pos.z = target.pos.z + dist;
        if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
        if (p.prevPos) { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
      }
      return `${target.id} at (${target.pos.x.toFixed(0)},${target.pos.z.toFixed(0)}) relocated=${moved}`;
    }, { token: String(token), dist: Number(dist ?? args.aimDist ?? 260) });
  }

  // The chase camera aims at the player, not the target — aimDist just parks the player near
  // the target, so at wide zooms the target drifts to a frame edge (the hub sat cut off at
  // the bottom). Centre it: unproject screen-centre onto the target's height plane, shift the
  // player by that world delta, and iterate until the target's NDC lands under ~3% of centre.
  async function centreOn(token) {
    for (let i = 0; i < 4; i++) {
      const r = await page.evaluate(async (token) => {
        const THREE = await import('three');
        const s = window.SF.state;
        let tx, tz, ty = 0;
        let targetEntity = null;
        if (token.startsWith('pos:')) {
          const [x, z] = token.slice(4).split('~').map(Number);
          tx = x; tz = z;
        } else if (token.startsWith('rocknear:')) {
          // 'rocknear:x~z' — centre on the nearest live asteroid-field rock to (x,z); used
          // to proof procedural geology bodies that never become entities.
          const [x, z] = token.slice(9).split('~').map(Number);
          const rocks = s.world?.asteroidField?.rocks || [];
          let best = null, bestD = Infinity;
          for (const r of rocks) {
            if (!r || r.alive === false) continue;
            const d = (r.pos.x - x) ** 2 + (r.pos.z - z) ** 2;
            if (d < bestD) { bestD = d; best = r; }
          }
          if (!best) return 'no rock near ' + token;
          tx = best.pos.x; tz = best.pos.z;
        } else {
          const matches = (e) => {
            const d = e.data || {};
            return d.stationId === token || d.archetypeGlb === token || d.poiId === token
              || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
              || e.placeId === token || (e.data && e.data.placeId) === token
              || e.id === token || e.id === `${token}/root`;
          };
          for (const e of s.entities.values()) if (matches(e)) { targetEntity = e; break; }
          if (!targetEntity) for (const row of s.world?.dressing?.rows || []) {
            if (row && row.alive !== false && matches(row)) { targetEntity = row; break; }
          }
          if (!targetEntity) return 'no match ' + token;
          tx = targetEntity.pos.x; tz = targetEntity.pos.z; ty = targetEntity.pos.y || 0;
        }
        const cam = s.render && s.render.camera;
        if (!cam || !cam.projectionMatrix) return 'no camera';
        const camPos = new THREE.Vector3();
        cam.getWorldPosition(camPos);
        // M2 floating origin: scene XZ is frame-local (global - world.frameOrigin). tx/tz and
        // player.pos are galactic-global, so convert both sides of the projection.
        const fo = (s.world && s.world.frameOrigin) || { x: 0, z: 0 };
        const lx = tx - fo.x, lz = tz - fo.z;
        const ndc = new THREE.Vector3(lx, ty, lz).project(cam);
        // Whole-body fit: project the target visual's bounding-box corners to NDC so a
        // centred anchor can't still leave a large body clipped at a frame edge.
        let fit = null;
        try {
          const scene = s.render && s.render.scene;
          const t = targetEntity;
          let root = (t && (t.data?.authoredVisualRoot || t.object3d)) || null;
          if (!root && scene && t) {
            root = scene.getObjectByName(`station:${t.id}`)
              || scene.getObjectByName(`place:${t.id}`)
              || scene.getObjectByName(t.id)
              || null;
          }
          if (!root && scene && t) {
            const want = [t.stationId, t.placeId, t.data?.stationId, t.data?.placeId,
              t.data?.archetypeGlb, t.data?.worldSiteId]
              .filter((w) => typeof w === 'string' && w.length >= 5);
            want.push(`station:${t.id}`, `place:${t.id}`);
            const re = new RegExp(want.map((w) => String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
            const hits = [];
            scene.traverse((o) => {
              if (!o.isMesh) return;
              for (let n = o; n; n = n.parent) {
                const ud = n.userData || {};
                const tag = `${n.name} ${ud.placeId || ''} ${ud.archetypeGlb || ''} ${ud.stationId || ''} ${ud.entityId || ''}`;
                if (want.length && re.test(tag)) { hits.push(o); break; }
              }
            });
            if (hits.length) root = hits;
          }
          if (root) {
            const box = new THREE.Box3();
            const items = Array.isArray(root) ? root : [root];
            for (const o of items) box.expandByObject(o);
            if (isFinite(box.min.x)) {
              let mx = 0, my = 0;
              for (const cx of [box.min.x, box.max.x])
                for (const cy of [box.min.y, box.max.y])
                  for (const cz of [box.min.z, box.max.z]) {
                    const p = new THREE.Vector3(cx, cy, cz).project(cam);
                    if (Math.abs(p.x) > mx) mx = Math.abs(p.x);
                    if (Math.abs(p.y) > my) my = Math.abs(p.y);
                  }
              fit = { ndcMaxX: +mx.toFixed(2), ndcMaxY: +my.toFixed(2), inside: mx < 1 && my < 1, meshes: items.length };
            }
          }
        } catch { /* fit is best-effort evidence */ }
        const centre = new THREE.Vector3(0, 0, 0.5).unproject(cam).sub(camPos);
        const planeT = centre.y ? (ty - camPos.y) / centre.y : 0;
        // camPos is frame-local too — lift the screen-centre ground point back to global
        // before differencing against global tx/tz.
        const c0x = camPos.x + centre.x * planeT + fo.x, c0z = camPos.z + centre.z * planeT + fo.z;
        const dx = tx - c0x, dz = tz - c0z;
        const p = s.entities.get(s.playerId);
        const world = window.SF.registry?.get?.('world');
        // Damped step: the chase camera lags the player, so the full projected delta
        // overshoots and the NDC error oscillates across passes.
        const dest = { x: p.pos.x + dx * 0.7, z: p.pos.z + dz * 0.7 };
        const moved = world && world.relocatePlayerInSector
          ? world.relocatePlayerInSector(dest, { reason: 'flight-look:centre' })
          : false;
        if (!moved) {
          p.pos.x = dest.x; p.pos.z = dest.z;
          if (p.prevPos) { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
        }
        // Kill drift either way — a settling player slides the chase frame off the target
        // between the centre pass and the screenshot.
        if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
        return { ndcX: +ndc.x.toFixed(3), ndcY: +ndc.y.toFixed(3), dx: +dx.toFixed(1), dz: +dz.toFixed(1), moved, fit };
      }, String(token));
      if (typeof r === 'string') { console.log('centre', token, r); return r; }
      console.log('centre', token, `pass ${i}: ndc=(${r.ndcX},${r.ndcY}) d=(${r.dx},${r.dz}) moved=${r.moved}`);
      if (Math.abs(r.ndcX) < 0.03 && Math.abs(r.ndcY) < 0.03) { console.log('centre', token, 'ok', JSON.stringify(r)); return r; }
      if (i === 3) console.log('centre', token, 'last', JSON.stringify(r));
      await page.waitForTimeout(1600);
    }
    console.log('centre', token, 'best-effort after 4 passes');
  }

  // Stations hide their procedural fallback while 'awaiting-authored-admission', so a shot
  // taken before the boundary admits shows floating overlay over empty space. Gate the
  // capture on the aimed entity reaching an authored state with real meshes.
  async function waitAimGate(token, authoredWait) {
    if (!(authoredWait > 0)) return;
    const deadline = Date.now() + authoredWait * 1000;
    for (;;) {
      const ok = await page.evaluate(async ({ token, minSpan }) => {
        // The authored queue only pumps on a display rAF; under software GL that pump can
        // stall with jobs pending and nothing in flight. Actively pump so the target's
        // boundary can reach 'authored' instead of waiting out a dead clock.
        const s = window.SF.state;
        try {
          const lib = await import('/src/render/partsLibrary.js');
          // Dormant dressing rows and off-runway bodies sit 'awaiting-authored-admission'
          // because the renderer's spatial prefetch never issued their request. Issue it
          // ourselves — requestAuthoredUpgrade is idempotent (returns the live promise).
          s.render?.scene?.traverse?.((o) => {
            const ud = o.userData || {};
            if (ud.authoredAssetState === 'awaiting-authored-admission'
                && typeof ud.requestAuthoredUpgrade === 'function') {
              try { ud.requestAuthoredUpgrade(s.render.renderer, s.render.scene, { reason: 'flight-look:prefetch' }); } catch (_) {}
            }
          });
          lib.pumpAuthoredUpgradeQueue(window.SF.state.render.scene);
        } catch (_) {}
        const matches = (e) => {
          const d = e.data || {};
          return d.stationId === token || d.archetypeGlb === token || d.poiId === token
            || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
        || e.placeId === token || (e.data && e.data.placeId) === token
            || e.id === token || e.id === `${token}/root`;
        };
        // Dressing rows never get row.mesh — the renderer's mesh map holds their boundary.
        // Station boundaries also live in the scene as `*AuthoredAssetBoundary` nodes keyed
        // by userData (stationId/placeId/archetypeGlb), not under e.mesh — collect every id
        // the matching entities imply, then scan the scene for boundary nodes that carry one.
        const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
        const rows = [...s.entities.values(), ...(s.world?.dressing?.rows || [])];
        const hit = rows.find(matches);
        if (!hit) return false;
        const hd = hit.data || {};
        // station entities carry stationTypeId ('trade_hub'), not the place id — derive it.
        const tokens = new Set([token, hit.id, hd.stationId, hd.placeId, hd.archetypeGlb, hd.landmarkGlb,
          hd.stationTypeId ? `place_station_${hd.stationTypeId}` : null].filter(Boolean));
        const roots = [hit.mesh, renderMeshes && renderMeshes.get(hit.id)].filter(Boolean);
        const scene = s.render?.scene;
        if (scene) scene.traverse((o) => {
          const ud = o.userData || {};
          if (!ud.authoredAssetState) return;
          if (tokens.has(ud.stationId) || tokens.has(ud.placeId) || tokens.has(ud.archetypeGlb)
            || tokens.has(ud.worldSiteId)) roots.push(o);
        });
        for (const root of roots) {
          const st = root.userData && root.userData.authoredAssetState;
          if (!(typeof st === 'string' && st.startsWith('authored'))) continue;
          // 'authored' marks the decision, not the draw: the render package may still be
          // compiling, leaving an empty root. Require a real mesh below it — and, when a
          // large body is expected (stations), one that spans the body, so a handful of
          // overlay pieces alone cannot satisfy the gate.
          let meshes = 0, span = 0;
          root.traverse((o) => {
            if (!o.isMesh || !o.visible || !o.geometry) return;
            meshes++;
            o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox;
            const s = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
            if (s > span) span = s;
          });
          if (meshes > 0 && span >= minSpan) return true;
        }
        return false;
      }, { token: String(token), minSpan: Number(args.aimMinSpan || 0) });
      if (ok) { console.log('aim-authored ok', token); return; }
      if (Date.now() > deadline) {
        console.log('aim-authored TIMEOUT — capture proceeds with whatever is admitted', token);
        return;
      }
      await page.waitForTimeout(1000);
    }
  }

  // 'authored' marks the boundary's decision; the render package then compiles behind every
  // other queued admission. Under software GL that queue drains slowly, so a shot taken right
  // after admission can still catch procedural-hidden space. Wait the queue out.
  async function drainQueue() {
    const queueWait = Number(args.queueWait ?? 240);
    if (!(queueWait > 0)) return;
    try {
      await page.waitForFunction(async () => {
        const lib = await import('/src/render/partsLibrary.js');
        const s = window.SF?.state?.render?.scene;
        if (!s) return true;
        try { lib.pumpAuthoredUpgradeQueue(s); } catch (_) {}
        const q = lib.describeAuthoredUpgradeQueue(s);
        if (!q) return true;
        return q.pending === 0 && q.inFlight === 0 && !q.running && !q.compiling;
      }, null, { timeout: queueWait * 1000, polling: 500 });
      console.log('queue drained');
    } catch {
      console.log('queue drain TIMEOUT — capture proceeds');
    }
  }

  if (args.aim) {
    console.log('aim', await aimAt(String(args.aim)));
    await waitAimGate(String(args.aim), Number(args.aimAuthoredWait || 180));
  }
  // The boundary can report 'authored' while the entity's render package still sits in the
  // admission queue (job keys end in ':<entityId>', e.g. 'critical-hub:2'), leaving the body
  // undrawn with only overlay pieces attached. Wait until no queued job owns this entity.
  async function waitTargetJobs(token) {
    const targetId = await page.evaluate((tok) => {
      const s = window.SF.state;
      const matches = (e) => {
        const d = e.data || {};
        return d.stationId === tok || d.archetypeGlb === tok || d.poiId === tok
          || d.landmarkGlb === tok || d.placeId === tok || d.worldSiteId === tok
          || e.placeId === tok || e.id === tok || e.id === `${tok}/root`;
      };
      for (const e of s.entities.values()) if (matches(e)) return e.id;
      for (const row of s.world?.dressing?.rows || []) if (row && matches(row)) return row.id;
      return null;
    }, token);
    if (targetId == null) return;
    try {
      await page.waitForFunction(async (id) => {
        const lib = await import('/src/render/partsLibrary.js');
        const q = lib.describeAuthoredUpgradeQueue(window.SF.state.render.scene);
        if (!q || !q.jobs) return true;
        const suffix = ':' + id;
        return !q.jobs.some((job) => String(job.key || '').endsWith(suffix));
      }, targetId, { timeout: 240000, polling: 2000 });
      console.log(`aim-jobs drained for ${targetId}`);
    } catch {
      console.log('aim-jobs TIMEOUT — capture proceeds');
    }
  }
  if (args.faction) {
    // Dev override: force a faction onto the aimed station and re-admit its authored
    // boundary so the faction overlay rebuilds (trade-hub overlay proof, packet 4).
    const rep = await page.evaluate(({ token, faction }) => {
      const s = window.SF.state;
      const matches = (e) => {
        const d = e.data || {};
        return d.stationId === token || d.archetypeGlb === token || d.poiId === token
          || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
          || e.placeId === token || (e.data && e.data.placeId) === token
          || e.id === token || e.id === `${token}/root`;
      };
      let target = null;
      for (const e of s.entities.values()) if (matches(e)) { target = e; break; }
      if (!target) for (const row of s.world?.dressing?.rows || []) {
        if (row && row.alive !== false && matches(row)) { target = row; break; }
      }
      if (!target) return 'no match';
      target.factionId = faction;
      if (target.data) target.data.factionId = faction;
      const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
      const td = target.data || {};
      const tokens = new Set([target.id, td.stationId, td.placeId, td.archetypeGlb, td.landmarkGlb,
        td.stationTypeId ? `place_station_${td.stationTypeId}` : null].filter(Boolean));
      let root = target.mesh || (renderMeshes && renderMeshes.get(target.id));
      if (!root && s.render?.scene) s.render.scene.traverse((o) => {
        const ud = o.userData || {};
        if (root || !ud.authoredAssetState) return;
        if (tokens.has(ud.stationId) || tokens.has(ud.placeId) || tokens.has(ud.archetypeGlb)
          || tokens.has(ud.worldSiteId)) root = o;
      });
      if (!root) return `no boundary root for ${target.id}`;
      const ud = root.userData || {};
      ud.authoredAssetState = 'awaiting-authored-admission';
      delete ud.authoredUpgradePromise;
      if (typeof ud.requestAuthoredUpgrade !== 'function') return 'no requestAuthoredUpgrade hook';
      const p = ud.requestAuthoredUpgrade(s.render.renderer, s.render.scene, { reason: 'flight-look:faction' });
      return `faction=${faction} on ${target.id}; re-admission ${p ? 'queued' : 'refused'}`;
    }, { token: String(args.aim || ''), faction: String(args.faction) });
    console.log('faction-override', rep);
    try {
      await page.waitForFunction(async ({ token }) => {
        try {
          const lib = await import('/src/render/partsLibrary.js');
          lib.pumpAuthoredUpgradeQueue(window.SF.state.render.scene);
        } catch (_) {}
        const s = window.SF.state;
        const matches = (e) => {
          const d = e.data || {};
          return d.stationId === token || d.archetypeGlb === token || d.poiId === token
            || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
          || e.placeId === token || (e.data && e.data.placeId) === token
            || e.id === token || e.id === `${token}/root`;
        };
        const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
        const hit = [...s.entities.values()].find(matches);
        if (!hit) return false;
        const hd = hit.data || {};
        const tokens = new Set([token, hit.id, hd.stationId, hd.placeId, hd.archetypeGlb, hd.landmarkGlb,
          hd.stationTypeId ? `place_station_${hd.stationTypeId}` : null].filter(Boolean));
        const roots = [hit.mesh, renderMeshes && renderMeshes.get(hit.id)].filter(Boolean);
        const scene = s.render?.scene;
        if (scene) scene.traverse((o) => {
          const ud = o.userData || {};
          if (!ud.authoredAssetState) return;
          if (tokens.has(ud.stationId) || tokens.has(ud.placeId) || tokens.has(ud.archetypeGlb)
            || tokens.has(ud.worldSiteId)) roots.push(o);
        });
        for (const root of roots) {
          const st = root.userData && root.userData.authoredAssetState;
          if (!(typeof st === 'string' && st.startsWith('authored'))) continue;
          let meshes = 0, span = 0;
          root.traverse((o) => {
            if (!o.isMesh || !o.visible || !o.geometry) return;
            meshes++;
            o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox;
            const s = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
            if (s > span) span = s;
          });
          if (meshes > 0 && span >= minSpan) return true;
        }
        return false;
      }, { token: String(args.aim || ''), minSpan: Number(args.aimMinSpan || 0) }, { timeout: 180000, polling: 1000 });
      console.log('faction authored ok');
    } catch {
      console.log('faction authored TIMEOUT — capture proceeds with whatever is admitted');
    }
  }
  // Dev override: stamp a claim spec onto a claimable POI (spec_refinery/spec_relay/
  // spec_bastion, or 'owned' for the unspecialized base) and re-admit its authored boundary so
  // the claim-outpost body rebuilds — same seam as the faction override.
  async function applyClaim(aimToken, claim) {
    const rep = await page.evaluate(({ token, claim }) => {
      const s = window.SF.state;
      const matches = (e) => {
        const d = e.data || {};
        return d.stationId === token || d.archetypeGlb === token || d.poiId === token
          || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
          || e.placeId === token || (e.data && e.data.placeId) === token
          || e.id === token || e.id === `${token}/root`;
      };
      let target = null;
      for (const e of s.entities.values()) if (matches(e)) { target = e; break; }
      if (!target) for (const row of s.world?.dressing?.rows || []) {
        if (row && row.alive !== false && matches(row)) { target = row; break; }
      }
      if (!target) return 'no match';
      if (!target.data) target.data = {};
      target.data.claimOwned = true;
      target.data.claimSpecId = claim === 'owned' ? null : claim;
      const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
      const td = target.data || {};
      const tokens = new Set([target.id, td.stationId, td.placeId, td.archetypeGlb, td.landmarkGlb,
        td.stationTypeId ? `place_station_${td.stationTypeId}` : null].filter(Boolean));
      let root = target.mesh || (renderMeshes && renderMeshes.get(target.id));
      if (!root && s.render?.scene) s.render.scene.traverse((o) => {
        const ud = o.userData || {};
        if (root || !ud.authoredAssetState) return;
        if (tokens.has(ud.stationId) || tokens.has(ud.placeId) || tokens.has(ud.archetypeGlb)
          || tokens.has(ud.worldSiteId)) root = o;
      });
      if (!root) return `no boundary root for ${target.id}`;
      const ud = root.userData || {};
      ud.authoredAssetState = 'awaiting-authored-admission';
      delete ud.authoredUpgradePromise;
      if (typeof ud.requestAuthoredUpgrade !== 'function') return 'no requestAuthoredUpgrade hook';
      const p = ud.requestAuthoredUpgrade(s.render.renderer, s.render.scene, { reason: 'flight-look:claim' });
      return `claim=${claim} on ${target.id}; re-admission ${p ? 'queued' : 'refused'}`;
    }, { token: String(aimToken || ''), claim: String(claim) });
    console.log('claim-override', rep);
    try {
      await page.waitForFunction(async ({ token }) => {
        try {
          const lib = await import('/src/render/partsLibrary.js');
          lib.pumpAuthoredUpgradeQueue(window.SF.state.render.scene);
        } catch (_) {}
        const s = window.SF.state;
        const matches = (e) => {
          const d = e.data || {};
          return d.stationId === token || d.archetypeGlb === token || d.poiId === token
            || d.landmarkGlb === token || d.placeId === token || d.worldSiteId === token
            || e.placeId === token || (e.data && e.data.placeId) === token
            || e.id === token || e.id === `${token}/root`;
        };
        const renderMeshes = window.SF.registry?.get?.('render')?._meshes;
        const hit = [...s.entities.values()].find(matches);
        if (!hit) return false;
        const hd = hit.data || {};
        const tokens = new Set([token, hit.id, hd.stationId, hd.placeId, hd.archetypeGlb, hd.landmarkGlb,
          hd.stationTypeId ? `place_station_${hd.stationTypeId}` : null].filter(Boolean));
        const roots = [hit.mesh, renderMeshes && renderMeshes.get(hit.id)].filter(Boolean);
        const scene = s.render?.scene;
        if (scene) scene.traverse((o) => {
          const ud = o.userData || {};
          if (!ud.authoredAssetState) return;
          if (tokens.has(ud.stationId) || tokens.has(ud.placeId) || tokens.has(ud.archetypeGlb)
            || tokens.has(ud.worldSiteId)) roots.push(o);
        });
        for (const root of roots) {
          const st = root.userData && root.userData.authoredAssetState;
          if (!(typeof st === 'string' && st.startsWith('authored'))) continue;
          let meshes = 0;
          root.traverse((o) => { if (o.isMesh && o.visible && o.geometry) meshes++; });
          if (meshes > 0) return true;
        }
        return false;
      }, { token: String(aimToken || '') }, { timeout: 180000, polling: 1000 });
      console.log('claim authored ok');
    } catch {
      console.log('claim authored TIMEOUT — capture proceeds with whatever is admitted');
    }
  }
  if (args.claim) await applyClaim(String(args.aim || ''), String(args.claim));
  if (args.siteOps) {
    // Dev override: mark every operation on a world site complete so the site advances to
    // its final stage and the stage body (e.g. claim-outpost spec) rebuilds in flight.
    const rep = await page.evaluate(async (siteId) => {
      const s = window.SF.state;
      const rec = s.sites && s.sites.worldById && s.sites.worldById[siteId];
      if (!rec) return 'no site record ' + siteId;
      const mod = await import('/src/data/worldSiteManifests.js');
      const manifests = mod.WORLD_SITE_MANIFESTS || mod.default || [];
      const manifest = manifests.find((m) => m.id === siteId);
      if (!manifest) return 'no manifest ' + siteId;
      rec.completedOperations = rec.completedOperations || {};
      for (const op of manifest.operations || []) {
        rec.completedOperations[op.id] = rec.completedOperations[op.id]
          || { id: op.id, stateTo: op.to, dev: true };
      }
      const sys = window.SF.registry?.get?.('asteroidSites');
      if (sys && typeof sys._syncWorldSites === 'function') sys._syncWorldSites();
      return `ops=${Object.keys(rec.completedOperations).length}`;
    }, String(args.siteOps));
    console.log('site-ops', rep);
    await page.waitForTimeout(6000);
  }
  if (args.aim) await waitTargetJobs(String(args.aim));
  await drainQueue();
  if (args.aim) await centreOn(String(args.aim));
  await page.waitForTimeout(Number(args.wait || 20) * 1000);
  // SwiftShader trips the software-renderer emergency profile (third-resolution, bloom off). A
  // look capture wants the hardware picture: full resolution and the shipping bloom/ink post.
  const hq = await page.evaluate(() => {
    const r = window.SF.registry?.get?.('render');
    if (!r) return 'no render system';
    try { r._adaptive?.setEnabled(false); } catch (_) {}
    window.SF.state.render.dynResScale = 1;
    try { r._applySize(); } catch (e) { return 'applySize ' + e.message; }
    try { r.bloom?.setOptions({ bloom: true }); } catch (_) {}
    return 'ok';
  });
  console.log('hq', hq);
  if (!args.hud) await page.addStyleTag({ content: '#hud, .hud, [class*="hud"], #ui-root > *:not(canvas) { visibility: hidden !important; }' });
  if (aimList.length) {
    // Multi-aim mode (--aims=a,b,c): one boot, several targets. Each aim relocates the
    // player, waits for that target's authored boundary + package jobs, drains the global
    // queue, then shoots — shots are named flight_<token>_z<zoom>.png. A token of the form
    // 'pos:x~z' relocates the player to a raw sector position — needed for dressing rows
    // that stay dormant (alive=false) until the player is near, so they can never match
    // the name matcher from a distance.
    for (const token of aimList) {
      let centreToken = null;
      if (token.startsWith('sec:')) {
        // Sector hop mid-run — same entry point as --sector so the sector materializes
        // at full presence before the next aims.
        const sectorId = token.slice(4);
        const jumped = await page.evaluate((sectorId) => {
          const world = window.SF.registry?.get?.('world');
          if (!world?.enterSector) return 'no world.enterSector';
          world.enterSector(sectorId, { fromJump: true, via: 'drive', fromSectorId: window.SF.state.world?.currentSectorId });
          return `sector=${window.SF.state.world?.currentSectorId}`;
        }, sectorId);
        console.log('sec', jumped);
        await page.waitForTimeout(Number(args.secWait || 6) * 1000);
        continue;
      }
      if (token.startsWith('claim:')) {
        // 'claim:<spec>@<target>' — aim at the target, stamp the claim override, shoot.
        // spec 'owned' yields the unspecialized base body.
        const body = token.slice(6);
        const at = body.lastIndexOf('@');
        const spec = at >= 0 ? body.slice(0, at) : 'owned';
        const target = at >= 0 ? body.slice(at + 1) : body;
        console.log('aim', target, await aimAt(target));
        await waitAimGate(target, Number(args.aimAuthoredWait || 90));
        await applyClaim(target, spec);
        await waitTargetJobs(target);
        await drainQueue();
        for (const zoom of zooms) {
          await page.evaluate((z) => { const c = window.SF.state.camera; c.zoom = z; c.targetZoom = z; c.zoomTarget = z; }, zoom);
          await page.waitForTimeout(Number(args.settle || 6) * 1000);
          // Re-centre after the settle — drift during the wait slides the target off-frame.
          await centreOn(target);
          await page.waitForTimeout(800);
          const safe = `claim_${spec}_${target}`.replace(/[^\w.-]/g, '_');
          await page.screenshot({ path: `${OUT}flight_${safe}_z${zoom}.png`, timeout: 180000 });
          console.log('shot', safe, 'zoom', zoom);
        }
        continue;
      }
      if (token.startsWith('pos:') || token.startsWith('rocknear:') || token.startsWith('wreckfield:')) {
        // 'wreckfield:' resolves itself in-page: relocate to the first live wreck-aftermath
        // dressing row in the current sector (prefer a hero wreck_* body over debris).
        let px, pz;
        if (token.startsWith('wreckfield:')) {
          const hit = await page.evaluate(() => {
            const s = window.SF.state;
            const rows = [...(s.world?.dressing?.rows || []), ...(s.entityList || [])]
              .filter((r) => r && r.alive !== false && r.data && r.data.wreckAftermath === true);
            const hero = rows.find((r) => /_wreck_/.test(r.data.placeId || '')) || rows[0];
            return hero ? { x: hero.pos.x, z: hero.pos.z, id: hero.data.placeId || hero.id } : null;
          });
          if (!hit) { console.log('aim', token, 'no wreck aftermath rows'); continue; }
          console.log('wreckfield ->', hit.id, Math.round(hit.x), Math.round(hit.z));
          px = hit.x; pz = hit.z + 140;
          centreToken = `pos:${px}~${hit.z}`;
        } else {
          [px, pz] = token.split(':')[1].split('~').map(Number);
        }
        const rep = await page.evaluate(({ x, z }) => {
          const world = window.SF.registry?.get?.('world');
          const moved = world && world.relocatePlayerInSector
            ? world.relocatePlayerInSector({ x, z }, { reason: 'flight-look:aimpos' })
            : false;
          return `pos(${x},${z}) relocated=${moved}`;
        }, { x: px, z: pz });
        console.log('aim', token, rep);
        if (token.startsWith('rocknear:')) {
          // Park the player beside the nearest rock, not on it — centreOn then frames the
          // rock while the hull reads beside it for scale.
          const off = await page.evaluate(({ x, z }) => {
            const s = window.SF.state;
            const rocks = s.world?.asteroidField?.rocks || [];
            let best = null, bestD = Infinity;
            for (const r of rocks) {
              if (!r || r.alive === false) continue;
              const d = (r.pos.x - x) ** 2 + (r.pos.z - z) ** 2;
              if (d < bestD) { bestD = d; best = r; }
            }
            if (!best) return 'no rock';
            const world = window.SF.registry?.get?.('world');
            const dest = { x: best.pos.x + best.radius * 1.6, z: best.pos.z + best.radius * 0.9 };
            if (world?.relocatePlayerInSector) world.relocatePlayerInSector(dest, { reason: 'flight-look:rocknear' });
            return `rock@${Math.round(best.pos.x)},${Math.round(best.pos.z)} r=${best.radius} type=${best.data?.typeId || '?'}`;
          }, { x: px, z: pz });
          console.log('rocknear', off);
        }
        // Let dormant dressing rows wake, then issue the authored requests the renderer's
        // spatial prefetch skipped and pump the queue until the area's bodies admit.
        const posWaitMs = Number(args.posWait || 8) * 1000;
        const posDeadline = Date.now() + posWaitMs;
        for (;;) {
          await page.evaluate(async () => {
            const s = window.SF.state;
            try {
              const lib = await import('/src/render/partsLibrary.js');
              s.render?.scene?.traverse?.((o) => {
                const ud = o.userData || {};
                if (ud.authoredAssetState === 'awaiting-authored-admission'
                    && typeof ud.requestAuthoredUpgrade === 'function') {
                  try { ud.requestAuthoredUpgrade(s.render.renderer, s.render.scene, { reason: 'flight-look:prefetch' }); } catch (_) {}
                }
              });
              lib.pumpAuthoredUpgradeQueue(s.render.scene);
            } catch (_) {}
          });
          if (Date.now() > posDeadline) break;
          await page.waitForTimeout(1000);
        }
        await drainQueue();
      } else {
        console.log('aim', token, await aimAt(token));
        await waitAimGate(token, Number(args.aimAuthoredWait || 120));
        await waitTargetJobs(token);
        await drainQueue();
      }
      for (const zoom of zooms) {
        await page.evaluate((z) => { const c = window.SF.state.camera; c.zoom = z; c.targetZoom = z; c.zoomTarget = z; }, zoom);
        await page.waitForTimeout(Number(args.settle || 6) * 1000);
        // Centre per shot, not once per aim: the player drifts during settle waits and the
        // chase camera follows the player, so a single centre pass leaves the target cut
        // at the frame edge at shot time.
        await centreOn(centreToken || token);
        await page.waitForTimeout(800);
        const safe = token.replace(/[^\w.-]/g, '_');
        await page.screenshot({ path: `${OUT}flight_${safe}_z${zoom}.png`, timeout: 180000 });
        console.log('shot', token, 'zoom', zoom);
      }
    }
  } else {
    for (const zoom of zooms) {
      await page.evaluate((z) => { const c = window.SF.state.camera; c.zoom = z; c.targetZoom = z; c.zoomTarget = z; }, zoom);
      await page.waitForTimeout(Number(args.settle || 6) * 1000);
      if (args.aim) { await centreOn(String(args.aim)); await page.waitForTimeout(800); }
      await page.screenshot({ path: `${OUT}flight_z${zoom}.png`, timeout: 180000 });
      console.log('shot zoom', zoom);
      // --act=thrust,boost,fire: a second frame per zoom with the ship doing something, so the
      // plume, the guns and the light they throw on the hull are judged in the same picture.
      if (args.act) {
        const acts = String(args.act).split(',');
        const size = page.viewportSize();
        if (acts.includes('thrust')) await page.keyboard.down('KeyW');
        if (acts.includes('boost')) await page.keyboard.down('ShiftLeft');
        if (acts.includes('fire')) { await page.mouse.move(size.width * 0.72, size.height * 0.5); await page.mouse.down(); }
        await page.waitForTimeout(Number(args.actMs || 1400));
        await page.screenshot({ path: `${OUT}flight_z${zoom}_act.png`, timeout: 180000 });
        if (acts.includes('fire')) await page.mouse.up();
        if (acts.includes('boost')) await page.keyboard.up('ShiftLeft');
        if (acts.includes('thrust')) await page.keyboard.up('KeyW');
        console.log('shot zoom', zoom, 'act', acts.join('+'));
      }
    }
  }
  const info = await page.evaluate(async () => {
    const THREE = await import('three');
    const s = window.SF.state; const p = s.entities.get(s.playerId);
    const root = p.mesh; const out = [];
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      for (let n = o; n && n !== root; n = n.parent) if (!n.visible) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out.push({ name: o.name, geo: o.geometry.type, mat: o.material?.name, count: o.count, min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)) });
    });
    let queue = null;
    try { queue = (await import('/src/render/partsLibrary.js')).describeAuthoredUpgradeQueue(window.SF.state.render.scene); } catch (e) { queue = String(e); }
    const ud = root.userData || {};
    return { defId: p.data?.defId, rot: p.rot, state: ud.authoredAssetState, phase: ud.authoredPreparePhase, requested: ud.authoredUpgradeRequestedAt, err: String(ud.authoredAssetError || ud.authoredFailure || ''), queue, meshes: out };
  });
  (await import('node:fs')).writeFileSync(OUT + 'player-meshes.json', JSON.stringify(info, null, 1));
  console.log(JSON.stringify(info).slice(0, 4000));
  if (errors.length) console.log('pageErrors', errors.slice(0, 5));
  (await import('node:fs')).writeFileSync(OUT + 'console.txt', consoleLines.join('\n'));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
