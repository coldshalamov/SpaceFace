// ROCK-03 probe: same-frame triplanar on/off pairs + GPU program census on the Swarm and Helios
// routes the packet names. Run through the game lock:
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/rock03-probe.mjs [--round=1] [--out=dir]
//
// For each route: boot, pin quality, freeze the sim, wait for rock bodies, then shoot
//   <frame>-tp-on.png   (the ROCK-03 surface family live)
//   <frame>-tp-off.png  (authored flat look — the pre-triplanar floor)
//   crop-<frame>-rock-<i>.png per on-screen asteroid (on/off pair)
// and report renderer.info program counts, how many programs carry the triplanar token, and the
// render pass count, before and after the toggle (proving "no programs beyond the shared family").
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true'];
}));
const PORT = Number(args.port || 8173);
const ROUND = Number(args.round || 1);
const SECTOR = args.sector || 'helios_core';
const OUT = resolve(args.out || `.devshots/fleet/looks/rock03/probe`);
const ROUTES = (args.routes || 'swarm,helios').split(',');
const WANT_ROCKS = Number(args.rocks || 4);
const [VW, VH] = (args.viewport || '1280x720').split('x').map(Number);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[rock03]', ...a);

const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
await sleep(2500);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = { out: OUT, routes: {} };

// Screenshots ship at DSF x CSS-px density; rock bounds are CSS coords — scale into pixel space.
const DSF = 3;
function cropPng(bytes, box, pad = 8) {
  const img = PNG.sync.read(bytes);
  const l = Math.max(0, Math.floor(box.left * DSF) - pad), t = Math.max(0, Math.floor(box.top * DSF) - pad);
  const r = Math.min(img.width, Math.ceil(box.right * DSF) + pad), b = Math.min(img.height, Math.ceil(box.bottom * DSF) + pad);
  const w = r - l, h = b - t;
  if (w <= 0 || h <= 0) return null;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(img, out, l, t, w, h, 0, 0);
  return PNG.sync.write(out);
}

async function benchOn(page) {
  await page.evaluate(() => {
    window.__rock03 = {
      ready: () => !!(window.SF && window.SF.registry && window.SF.timeEffects),
      render: () => window.SF.registry.get('render'),
      hideHud: () => {
        let main = null;
        try { main = window.SF.registry.get('render').renderer.domElement; } catch (e) {}
        if (!main) { let area = 0; for (const c of document.querySelectorAll('canvas')) { const a = c.clientWidth * c.clientHeight; if (a > area) { area = a; main = c; } } }
        if (!main) return false;
        document.querySelectorAll('.sfb-keep').forEach((n) => n.classList.remove('sfb-keep'));
        for (let n = main; n && n !== document.documentElement; n = n.parentElement) n.classList.add('sfb-keep');
        let st = document.getElementById('sfb-hud-style');
        if (!st) { st = document.createElement('style'); st.id = 'sfb-hud-style'; document.head.appendChild(st); }
        st.textContent = 'body *:not(.sfb-keep){visibility:hidden !important}';
        return true;
      },
      freeze: (on) => { if (on) window.SF.timeEffects.set('bench:freeze', { scale: 0 }); else window.SF.timeEffects.clear('bench:freeze'); },
      rocks: () => {
        const h = window.SF.helpers, out = [];
        const r = window.SF.registry.get('render');
        const dsf = window.devicePixelRatio || 1;
        const vw = window.innerWidth, vh = window.innerHeight;
        const wp = { x: 0, y: 0, z: 0 };
        for (const e of window.SF.state.entityList || []) {
          const isRock = e && e.pos && (e.type === 'asteroid'
            || (e.data && /^place_rock_/.test(String(e.data.placeId || ''))));
          if (!e || e.alive === false || !isRock) continue;
          const rad = Number(e.radius); if (!(rad > 0)) continue;
          // worldToScreen reports DEVICE px and its onScreen flag compares against the CSS
          // viewport — normalize to CSS px and test onScreen ourselves. Place-prop records
          // carry a record pos, so aim at the live mesh's world position when it exists.
          const root = r._meshes && r._meshes.get(e.id);
          if (root && root.matrixWorld) {
            wp.x = root.matrixWorld.elements[12]; wp.y = root.matrixWorld.elements[13]; wp.z = root.matrixWorld.elements[14];
          } else { wp.x = e.pos.x; wp.y = 0; wp.z = e.pos.z; }
          const p0 = h.worldToScreen({ x: wp.x, y: wp.y, z: wp.z }, {});
          if (!p0) continue;
          const c0x = p0.x / dsf, c0y = p0.y / dsf;
          const px = h.worldToScreen({ x: wp.x + rad, y: wp.y, z: wp.z }, {});
          const pz = h.worldToScreen({ x: wp.x, y: wp.y, z: wp.z + rad }, {});
          if (!px || !pz) continue;
          const rx = Math.max(Math.abs(px.x / dsf - c0x), Math.abs(pz.x / dsf - c0x));
          const ry = Math.max(Math.abs(px.y / dsf - c0y), Math.abs(pz.y / dsf - c0y));
          const on = c0x - rx <= vw && c0x + rx >= 0 && c0y - ry <= vh && c0y + ry >= 0;
          if (!on || !(rx > 5) || !(ry > 5) || rx > 460) continue;
          out.push({ id: e.id, typeId: e.data && e.data.typeId, placeId: e.data && e.data.placeId,
            boulderId: e.data && e.data.authoredBoulderId, cx: c0x, cy: c0y,
            bounds: { left: c0x - rx, right: c0x + rx, top: c0y - ry, bottom: c0y + ry } });
        }
        return out;
      },
      census: () => {
        const r = window.SF.registry.get('render');
        const info = r && r.renderer && r.renderer.info;
        const programs = info && info.programs ? info.programs : [];
        const tp = programs.filter((p) => String(p.cacheKey || '').includes('spaceface-rock-triplanar')).map((p) => p.name || 'program');
        let tpMaterials = 0, rockMaterials = 0;
        try {
          r.scene.traverse((o) => {
            const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            for (const m of mats) {
              if (m && m.userData && m.userData.spacefaceTriplanarRock) tpMaterials++;
            }
          });
        } catch (e) {}
        return {
          programCount: programs.length,
          triplanarPrograms: tp.length,
          triplanarProgramNames: tp.slice(0, 12),
          renderCalls: info ? info.render.calls : null,
          triangles: info ? info.render.triangles : null,
          tpMaterialsInScene: tpMaterials,
          passes: (() => { try { const fx = r._postFx || r._composer || null; return fx && fx.passes ? fx.passes.length : null; } catch (e) { return null; } })(),
        };
      },
      tp: async (on) => {
        const m = await import('/src/render/rockTriplanar.js');
        m.setRockTriplanarEnabled(on);
        return m.rockTriplanarReady();
      },
      // Move the player next to the nearest asteroid of a typeId through the sanctioned
      // same-sector teleport (writes pos + prevPos, resyncs the physics body), then zoom in.
      gotoType: (typeId, range = 140, zoom = null, placeIdLike = null, largest = false, noPlace = false) => {
        const s = window.SF.state;
        const player = (s.entityList || []).find((e) => e && e.isPlayer && e.pos);
        if (!player) return null;
        let best = null, bd = Infinity, br = -1;
        for (const e of s.entityList || []) {
          const isRock = e && e.pos && (e.type === 'asteroid'
            || (e.data && /^place_rock_/.test(String(e.data.placeId || ''))));
          if (!e || e.alive === false || !isRock) continue;
          if (typeId && e.data && e.data.typeId !== typeId) continue;
          if (placeIdLike && !(e.data && (String(e.data.placeId || '').includes(placeIdLike)
            || String(e.data.authoredBoulderId || '').includes(placeIdLike)))) continue;
          if (noPlace && e.data && e.data.placeId) continue;
          const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
          const r = Number(e.radius) || 0;
          if (largest ? r > br : d < bd) { bd = d; br = r; best = e; }
        }
        if (!best) return null;
        const w = window.SF.registry.get('world');
        if (!w || typeof w.relocatePlayerInSector !== 'function') return null;
        // entity pos is GLOBAL sim coords — the frame relocatePlayerInSector writes. (The render
        // scene is sector-local; don't aim at the mesh's local pos.)
        w.relocatePlayerInSector({ x: best.pos.x + range, z: best.pos.z + range * 0.4 }, { reason: 'rock03-look-probe' });
        if (zoom) s.camera.zoom = zoom;
        return { id: best.id, typeId: best.data && best.data.typeId, placeId: best.data && best.data.placeId,
          boulderId: best.data && best.data.authoredBoulderId, was: bd };
      },
      // Closed-loop aim: project the target's mesh, then re-relocate the player by the world-space
      // delta that would put the target at (tx, ty) CSS px. Handles record-frame positions and
      // axis signs without guessing. Returns the final meshState row.
      aimAt: (id, wantX = 640, wantY = 360) => {
        const s = window.SF.state, w = window.SF.registry.get('world'), r = window.SF.registry.get('render');
        const e = (s.entityList || []).find((x) => x && x.id === id);
        const player = (s.entityList || []).find((x) => x && x.isPlayer && x.pos);
        const root = e && r._meshes && r._meshes.get(e.id);
        if (!e || !player || !root || !w.relocatePlayerInSector) return null;
        const dsf = window.devicePixelRatio || 1;
        const mw = root.matrixWorld.elements;
        const p0 = window.SF.helpers.worldToScreen({ x: mw[12], y: mw[13], z: mw[14] }, {});
        const p1 = window.SF.helpers.worldToScreen({ x: mw[12] + 1, y: mw[13], z: mw[14] }, {});
        const p2 = window.SF.helpers.worldToScreen({ x: mw[12], y: mw[13], z: mw[14] + 1 }, {});
        if (!p0 || !p1 || !p2) return null;
        const ex = (p1.x - p0.x) / dsf, ez = (p2.x - p0.x) / dsf;
        const fx = (p1.y - p0.y) / dsf, fz = (p2.y - p0.y) / dsf;
        // The camera rides the player: moving the player by Δ shifts the target's projection by
        // −proj(Δ). Solve the CURRENT offset (p0 − want) in world units and add it — the target
        // then projects at `want` because the camera moved away by the same delta.
        const dxPx = (p0.x / dsf - wantX), dyPx = (p0.y / dsf - wantY);
        const det = ex * fz - ez * fx; if (Math.abs(det) < 1e-6) return null;
        const dwx = (dxPx * fz - dyPx * ez) / det, dwz = (ex * dyPx - fx * dxPx) / det;
        // The solved delta is a pure world translation — apply it to the player's global pos,
        // the frame relocatePlayerInSector writes. Moving the player by Δ shifts the camera by
        // Δ and the target's projection by −proj(Δ).
        w.relocatePlayerInSector({ x: player.pos.x + dwx, z: player.pos.z + dwz }, { reason: 'rock03-aim' });
        return window.__rock03.meshState(id);
      },
      zoom: (z) => { window.SF.state.camera.zoom = z; },
      // Material truth for one entity: every material under its render root, the installed
      // triplanar family, texture bindings, and live uniform values (what the shader actually got).
      materialInfo: (id) => {
        const r = window.SF.registry.get('render');
        const e = (window.SF.state.entityList || []).find((x) => x && x.id === id);
        const root = e && r._meshes && r._meshes.get(e.id);
        if (!root) return null;
        const seen = new Map();
        root.traverse((o) => {
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of mats) {
            if (!m || seen.has(m.uuid)) continue;
            // Live uniform state: three keeps the compiled uniforms on renderer.properties.
            let live = null;
            try {
              const props = r.renderer.properties.get(m);
              const u = props && props.uniforms;
              if (u) live = {
                sfTpOn: u.sfTpOn && u.sfTpOn.value,
                sfTpEmber: u.sfTpEmber && u.sfTpEmber.value,
                sfTpTile: u.sfTpTile && u.sfTpTile.value,
                sfTpFloor: u.sfTpFloor && u.sfTpFloor.value,
                sfTpRim: u.sfTpRim && u.sfTpRim.value ? [u.sfTpRim.value.x, u.sfTpRim.value.y, u.sfTpRim.value.z] : null,
                albedoBound: !!(u.sfTpAlbedo && u.sfTpAlbedo.value && u.sfTpAlbedo.value.isTexture),
                normalBound: !!(u.sfTpNormal && u.sfTpNormal.value && u.sfTpNormal.value.isTexture),
                normalIsPlaceholder: !!(u.sfTpNormal && u.sfTpNormal.value && u.sfTpNormal.value.isDataTexture),
              };
            } catch (_) {}
            seen.set(m.uuid, {
              name: m.name || null,
              type: m.type || null,
              tpFamily: m.userData && m.userData.spacefaceTriplanarRock || null,
              hasMap: !!m.map, hasNormalMap: !!m.normalMap,
              color: m.color ? [m.color.r.toFixed(2), m.color.g.toFixed(2), m.color.b.toFixed(2)] : null,
              emissive: m.emissive ? [m.emissive.r.toFixed(2), m.emissive.g.toFixed(2), m.emissive.b.toFixed(2)] : null,
              emissiveIntensity: m.emissiveIntensity,
              role: m.userData && m.userData.spacefaceMaterialRole || null,
              illustrated: !!(m.userData && m.userData.spacefaceIllustratedSurface),
              roughness: m.roughness, metalness: m.metalness,
              objectName: o.name || null, objectType: o.type || null,
              live,
            });
          }
        });
        return [...seen.values()];
      },
      // Dump every relevant frame for one entity: entity pos (sim), mesh world pos (render),
      // player pos, camera pos — to see which frames agree.
      frames: (id) => {
        const s = window.SF.state, r = window.SF.registry.get('render');
        const e = (s.entityList || []).find((x) => x && x.id === id);
        const player = (s.entityList || []).find((x) => x && x.isPlayer && x.pos);
        const root = e && r._meshes && r._meshes.get(e.id);
        const mw = root && root.matrixWorld ? root.matrixWorld.elements : null;
        const cam = r.camera && r.camera.position;
        return {
          entPos: e && e.pos ? { x: Math.round(e.pos.x), z: Math.round(e.pos.z) } : null,
          meshPos: mw ? { x: Math.round(mw[12]), z: Math.round(mw[14]) } : null,
          playerPos: player ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
          camPos: cam ? { x: Math.round(cam.x), y: Math.round(cam.y), z: Math.round(cam.z) } : null,
          sector: s.world && s.world.currentSectorId,
        };
      },
      // Mesh-admission truth for one entity: does a render body exist, and what authored state?
      meshState: (id) => {
        const r = window.SF.registry.get('render');
        const e = (window.SF.state.entityList || []).find((x) => x && x.id === id);
        const player = (window.SF.state.entityList || []).find((x) => x && x.isPlayer && x.pos);
        const root = e && r._meshes && r._meshes.get(e.id);
        const dsf = window.devicePixelRatio || 1;
        let wx = e && e.pos.x, wy = 0, wz = e && e.pos.z;
        if (root && root.matrixWorld) {
          wx = root.matrixWorld.elements[12]; wy = root.matrixWorld.elements[13]; wz = root.matrixWorld.elements[14];
        }
        const sc = e && window.SF.helpers.worldToScreen({ x: wx, y: wy, z: wz }, {});
        const cx = sc ? sc.x / dsf : 0, cy = sc ? sc.y / dsf : 0;
        const on = !!sc && cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight;
        return {
          id, alive: e ? e.alive : null, hasMesh: !!root,
          authoredState: root && root.userData ? root.userData.authoredAssetState : null,
          dist: e && player ? Math.round(Math.hypot(wx - player.pos.x, wz - player.pos.z)) : null,
          meshPos: root ? { x: Math.round(wx), z: Math.round(wz) } : null,
          screen: sc ? { x: Math.round(cx), y: Math.round(cy), on } : null,
          camZoom: window.SF.state.camera && window.SF.state.camera.zoom,
        };
      },
    };
    return true;
  });
  await page.evaluate(() => window.__rock03.ready());
}

async function settle(page, ms = 700) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(ms);
}

// Wait for the hop target's render body to admit and land on screen (shelf records need sim
// ticks after the teleport to promote). Returns the last meshState row for the report.
async function waitForTarget(page, id, timeout = 45_000) {
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < timeout) {
    st = await page.evaluate((i) => window.__rock03.meshState(i), id);
    if (st && st.hasMesh && st.screen && st.screen.on) return st;
    await sleep(1500);
  }
  return st;
}

async function shotPair(page, frame) {
  await page.evaluate(() => window.__rock03.hideHud());
  await page.evaluate(() => window.__rock03.freeze(true));
  await settle(page, 1200);
  const rocks = await page.evaluate(() => window.__rock03.rocks());
  log(`${frame}: ${rocks.length} asteroid bodies on screen`, JSON.stringify(rocks.map((r) => `${r.typeId}${r.placeId || r.boulderId ? ':' + (r.placeId || r.boulderId) : ''}@${Math.round(r.cx)},${Math.round(r.cy)}`)));
  const ready = await page.evaluate(() => window.__rock03.tp(true));
  log(`${frame}: triplanar library ready = ${ready}`);
  await settle(page, 900);
  const onBytes = await page.screenshot({ path: join(OUT, `${frame}-tp-on.png`) });
  const censusOn = await page.evaluate(() => window.__rock03.census());
  await page.evaluate(() => window.__rock03.tp(false));
  await settle(page, 900);
  const offBytes = await page.screenshot({ path: join(OUT, `${frame}-tp-off.png`) });
  const censusOff = await page.evaluate(() => window.__rock03.census());
  await page.evaluate(() => window.__rock03.tp(true));
  await settle(page, 400);
  let i = 0;
  const ordered = rocks.slice().sort((a, b) => (b.bounds.right - b.bounds.left) - (a.bounds.right - a.bounds.left));
  for (const rock of ordered.slice(0, 10)) {
    const tag = `${i}-${rock.typeId || 'rock'}${rock.placeId || rock.boulderId ? '-' + String(rock.placeId || rock.boulderId).replace('place_rock_', '') : ''}`;
    const on = cropPng(onBytes, rock.bounds); const off = cropPng(offBytes, rock.bounds);
    if (on) writeFileSync(join(OUT, `crop-${frame}-on-${tag}.png`), on);
    if (off) writeFileSync(join(OUT, `crop-${frame}-off-${tag}.png`), off);
    i++;
  }
  report.routes[frame] = { rocks: rocks.map((r) => ({ id: r.id, typeId: r.typeId, placeId: r.placeId })), censusOn, censusOff };
  log(`${frame}: programs ${censusOn.programCount} (tp ${censusOn.triplanarPrograms}) calls ${censusOn.renderCalls} passes ${censusOn.passes} | tp-off programs ${censusOff.programCount}`);
  await page.evaluate(() => window.__rock03.freeze(false));
}

try {
  if (ROUTES.includes('swarm')) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
    await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${ROUND}&dev=fleetlook`, { waitUntil: 'commit', timeout: 120_000 });
    const splash = page.locator('#cinematic-splash');
    if (await splash.count().catch(() => 0)) { await splash.click({ timeout: 4000 }).catch(() => {}); await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {}); }
    while (Date.now() - t0 < 300_000) {
      if (await page.evaluate(() => !!(window.SF && window.SF.registry && window.SF.state && window.SF.state.mode === 'flight')).catch(() => false)) break;
      const launch = page.getByText(/Launch round/i).first();
      if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
      await sleep(1500);
    }
    await benchOn(page);
    let rocks = 0; const tr = Date.now();
    while (Date.now() - tr < 120_000) {
      rocks = await page.evaluate(() => window.__rock03.rocks().length);
      if (rocks >= WANT_ROCKS) break;
      const launch = page.getByText(/Launch round/i).first();
      if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
      await sleep(1500);
    }
    log(`swarm: ${rocks} asteroids on screen after ${Math.round((Date.now() - t0) / 1000)} s`);
    await shotPair(page, `swarm-r${ROUND}`);
    // Zoom onto the nearest slag body (the ember-vein family ROCK-03 repairs) for a readable
    // close-up of the on/off pair.
    const hop = await page.evaluate(() => window.__rock03.gotoType(null, 100, 45, 'slag', true));
    log('swarm: hopped to slag', JSON.stringify(hop));
    if (hop) {
      const st = await waitForTarget(page, hop.id, 20_000);
      log('swarm: target mesh state', JSON.stringify(st));
      const mats = await page.evaluate((id) => window.__rock03.materialInfo(id), hop.id);
      log('swarm: target materials', JSON.stringify(mats));
      await settle(page, 1500);
      await shotPair(page, `swarm-r${ROUND}-slag`);
      await page.evaluate(() => window.__rock03.zoom(144));
    }
    await page.close();
  }

  if (ROUTES.includes('helios')) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
    await page.goto(`http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(SECTOR)}&shot=1&dev=fleetlook`, { waitUntil: 'commit', timeout: 120_000 });
    const splash = page.locator('#cinematic-splash');
    if (await splash.count().catch(() => 0)) { await splash.click({ timeout: 4000 }).catch(() => {}); await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {}); }
    const w0 = Date.now();
    while (Date.now() - w0 < 300_000) {
      if (await page.evaluate(() => window.__sfShotReady === true).catch(() => false)) break;
      await sleep(1500);
    }
    log(`helios: shot ready after ${Math.round((Date.now() - t0) / 1000)} s`);
    await benchOn(page);
    await settle(page, 2000);
    let rocks = 0; const tr = Date.now();
    while (Date.now() - tr < 90_000) {
      rocks = await page.evaluate(() => window.__rock03.rocks().length);
      if (rocks >= 2) break;
      await sleep(1500);
    }
    log(`helios: ${rocks} asteroids on screen`);
    await shotPair(page, 'helios');
    // ROCK-03 issue 3: the packet names the Helios field rocks (ast_metallic). The opening frame
    // holds none in view, so hop the player next to a helios_boulder_* rock — the named
    // ast_metallic boulders near spawn (radius ~20 at {600,-300}) — and take the same frozen
    // on/off pair there. Bodies for a fresh region stream in over sim ticks, so wait for them
    // BEFORE shotPair freezes the clock.
    const hop = await page.evaluate(() => window.__rock03.gotoType('ast_metallic', 100, 60, 'helios_boulder', true));
    log('helios: hopped to', JSON.stringify(hop));
    if (hop) {
      let st = await waitForTarget(page, hop.id);
      log('helios: target mesh state', JSON.stringify(st));
      const mats = await page.evaluate((id) => window.__rock03.materialInfo(id), hop.id);
      log('helios: target materials', JSON.stringify(mats));
      for (let i = 0; i < 3; i++) {
        if (st && st.screen && st.screen.on && st.screen.x > 640 && st.screen.x < 1150) break;
        const aimed = await page.evaluate((id) => window.__rock03.aimAt(id, 880, 380), hop.id);
        await settle(page, 1000);
        st = aimed || await page.evaluate((id) => window.__rock03.meshState(id), hop.id);
        log(`helios: aim ${i}`, JSON.stringify(st));
      }
      await settle(page, 1500);
      await shotPair(page, 'helios-metallic');
      await page.evaluate(() => window.__rock03.zoom(144));
    }
    await page.close();
  }
  if (ROUTES.includes('ashfall')) {
    // Slag-monolith close-up: the packet's ember-vein proof needs a body big enough that the
    // fissure web resolves on screen (pebbles/boulders put the veins under a pixel). Ashfall's
    // claim site anchors place_rock_slag_monolith, the largest authored slag body.
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
    await page.goto(`http://127.0.0.1:${PORT}/?sector=sector_ashfall_reach&shot=1&dev=fleetlook`, { waitUntil: 'commit', timeout: 120_000 });
    const splash = page.locator('#cinematic-splash');
    if (await splash.count().catch(() => 0)) { await splash.click({ timeout: 4000 }).catch(() => {}); await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {}); }
    const w0 = Date.now();
    while (Date.now() - w0 < 300_000) {
      if (await page.evaluate(() => window.__sfShotReady === true).catch(() => false)) break;
      await sleep(1500);
    }
    log(`ashfall: shot ready after ${Math.round((Date.now() - t0) / 1000)} s`);
    await benchOn(page);
    const hop = await page.evaluate(() => window.__rock03.gotoType(null, 150, 45, 'slag_monolith', true));
    log('ashfall: hopped to', JSON.stringify(hop));
    if (hop) {
      const fr = await page.evaluate((id) => window.__rock03.frames(id), hop.id);
      log('ashfall: frames', JSON.stringify(fr));
      let st = await waitForTarget(page, hop.id);
      log('ashfall: target mesh state', JSON.stringify(st));
      for (let i = 0; i < 4; i++) {
        if (st && st.screen && st.screen.on && st.screen.x > 700 && st.screen.x < 1150) break;
        const aimed = await page.evaluate((id) => window.__rock03.aimAt(id, 900, 360), hop.id);
        await settle(page, 1200);
        st = aimed || await page.evaluate((id) => window.__rock03.meshState(id), hop.id);
        log(`ashfall: aim ${i}`, JSON.stringify(st));
      }
      await settle(page, 1500);
      await shotPair(page, 'ashfall-slag');
      await page.evaluate(() => window.__rock03.zoom(144));
    }
    await page.close();
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log(`report ${join(OUT, 'report.json')}`);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
