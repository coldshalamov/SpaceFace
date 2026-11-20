// DRAW-COST-1 verification probe. Records, per rendered frame: triangles submitted, draw calls,
// ships per whole-ship LOD tier, per-ship projected bounding-sphere px, tier swaps, and any frame
// where a presented ship had no drawable. Around every tier swap it captures the ship's own screen
// rect (readPixels) and pixel-diffs consecutive frames: a blank frame or a silhouette pop shows.
//
// Routes (deterministic, same seed across runs):
//   --route=swarm     ?swarmRound=<round> (dev route; arena seed is fixed per arena)
//   --route=adventure ?sector=<id>        (dev sector jump; default run seed)
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-lod-cost.mjs \
//     [--route=swarm] [--round=18] [--sector=helios_core] [--ms=45000] [--tag=before]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const { PNG } = createRequire(import.meta.url)('pngjs');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROUTE = arg('route', 'swarm');
const ROUND = arg('round', '18');
const SECTOR = arg('sector', 'helios_core');
const SAMPLE_MS = Number(arg('ms', 45000));
const TAG = arg('tag', ROUTE);
const OUT = path.join(ROOT, '.devshots', 'lod-cost', `probe-lod-cost-${TAG}`);
mkdirSync(OUT, { recursive: true });
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
let exitCode = 0;
const consoleLines = [];
try {
  const launchQuery = ROUTE === 'adventure' ? `?sector=${encodeURIComponent(SECTOR)}` : `?swarmRound=${encodeURIComponent(ROUND)}`;
  const base = `http://127.0.0.1:${port}/${launchQuery}`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=1600,900'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { const t = m.text(); if (/lod|whole-ship|demotion|error|warn/i.test(t)) consoleLines.push(`${m.type()}: ${t.slice(0, 300)}`); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  const t0 = Date.now();
  while (true) {
    const ok = await page.evaluate(() => { const s = window.SF.state; return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt); });
    if (ok) break;
    if (Date.now() - t0 > 560000) throw new Error('no flight');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const loadS = (Date.now() - t0) / 1000;
  await page.bringToFront();

  // ---- in-page recorder ----------------------------------------------------
  // The game's render RAF is registered before this loop, so each tick runs after the frame's
  // presents. tris/calls come from the diagnostics mirror: installDiagnostics owns
  // renderer.info.autoReset=false and mirrors whole-frame totals into __THREE_GAME_DIAGNOSTICS__
  // .info BEFORE it resets render.* — reading it here yields the real per-frame submission.
  await page.evaluate(async () => {
    const { projectedShipDiameterPx } = await import('/src/render/lod.js');
    const S = window.SF.state;
    const renderer = S.render.renderer;
    const diag = window.__THREE_GAME_DIAGNOSTICS__ || null;
    const meshes = S.render.meshes;
    const R = {
      seq: 0, frames: [], swaps: [], blanks: [], captures: [], captureQueue: [], lastLevel: new Map(),
      captureLeft: 0, censusTick: 0, errors: [],
      t0: performance.now(), lastTick: performance.now(),
    };
    window.__lodProbe = R;
    const findBoundary = (mesh) => {
      if (!mesh) return null;
      if (mesh.userData && (mesh.userData.wholeShipLodFamilyInstalled || mesh.userData.authoredAssetState)) return mesh;
      let found = null;
      mesh.traverse((o) => { if (!found && o.userData && (o.userData.wholeShipLodFamilyInstalled || o.userData.authoredAssetState)) found = o; });
      return found || mesh;
    };
    // CSS-pixel rect centered on the ship, sized to its projected diameter plus margin. The Node
    // side drains captureQueue and takes real compositor screenshots — the drawing buffer is not
    // preserved in play (presentPath.js), so readPixels here would only ever see a cleared buffer.
    const shipScreenRect = (mesh, pxHint) => {
      const cam = S.camera && S.camera.obj;
      if (!cam || !mesh) return null;
      const v = new mesh.position.constructor();
      mesh.getWorldPosition ? mesh.getWorldPosition(v) : v.copy(mesh.position);
      v.project(cam);
      if (v.z > 1) return null;
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      const size = Math.max(120, Math.min(360, Math.round((Number.isFinite(pxHint) ? pxHint : 160) * 1.5)));
      const x = Math.max(0, Math.min(innerWidth - size, Math.round(sx - size / 2)));
      const y = Math.max(0, Math.min(innerHeight - size, Math.round(sy - size / 2)));
      // Two gates: captureMargin lets edge ships be screenshotted; strictlyOnScreen (center inside
      // the viewport) is the drawable-blank gate — past the edge the game legitimately culls the
      // boundary and zero drawables is correct, not a defect.
      return { clip: { x, y, width: size, height: size }, cx: Math.round(sx), cy: Math.round(sy),
        onScreen: sx >= -size / 2 && sx <= innerWidth + size / 2 && sy >= -size / 2 && sy <= innerHeight + size / 2,
        strictlyOnScreen: sx >= 0 && sx <= innerWidth && sy >= 0 && sy <= innerHeight };
    };
    const queueShipCapture = (mesh, seq, shipId, lvl, px) => {
      const r = shipScreenRect(mesh, px);
      if (!r || !r.onScreen) return;
      R.captureQueue.push({ seq, t: +(performance.now() - R.t0).toFixed(1), shipId, lvl, ...r });
      if (R.captureQueue.length > 64) R.captureQueue.splice(0, R.captureQueue.length - 64);
    };
    const viewport = () => {
      const vp = S.render && S.render.viewport;
      if (vp && vp.width > 0 && vp.height > 0) return vp;
      return { width: innerWidth, height: innerHeight };
    };
    R.tick = () => {
      const now = performance.now();
      const seq = ++R.seq;
      const render = S.render || {};
      const frame = {
        seq, t: +(now - R.t0).toFixed(1),
        tris: diag && diag.info ? diag.info.triangles : -1,
        calls: diag && diag.info ? diag.info.calls : -1,
        ms: +(now - R.lastTick).toFixed(2),
        zoom: Number.isFinite(S.camera && S.camera.liveZoom) ? +S.camera.liveZoom.toFixed(1) : null,
        simTime: +((Number(S.simTime) || 0)).toFixed(2),
        tiers: { lod0: 0, lod1: 0, lod2: 0, none: 0 },
        ships: {},
      };
      R.lastTick = now;
      const vp = viewport();
      const doCensus = (R.censusTick++ % 6 === 0) || R.captureLeft > 0;
      for (const [id, mesh] of meshes) {
        const e = S.entities.get(id);
        if (!e || e.type !== 'ship' || e.alive === false || e.isPlayer) continue;
        const b = findBoundary(mesh);
        const ud = (b && b.userData) || {};
        const lvl = ud.wholeShipLodActiveLevel || (ud.lod && ud.lod.level) || 'none';
        if (frame.tiers[lvl] != null) frame.tiers[lvl]++; else frame.tiers.none++;
        const radius = Math.max(Number(e.radius) * 2 || 0, ud.hlod && Number(ud.hlod.visualRadius) || 0, 1);
        const px = projectedShipDiameterPx(mesh.position, radius, S.camera && S.camera.obj, vp);
        const prev = R.lastLevel.get(id);
        const pending = !!ud.wholeShipLodTransitionPromise;
        if (prev != null && prev !== lvl) {
          R.swaps.push({ id, from: prev, to: lvl, seq, t: frame.t, px: Math.round(px) });
          R.captureLeft = Math.max(R.captureLeft, 10);
          R.captureShipId = id;
          R.captureShipLvl = lvl;
        }
        R.lastLevel.set(id, lvl);
        const desired = ud.wholeShipLodDesiredLevel;
        frame.ships[id] = { l: lvl, px: Number.isFinite(px) ? Math.round(px) : -1 };
        if (desired && desired !== lvl) frame.ships[id].w = desired;
        if (pending) { R.captureLeft = Math.max(R.captureLeft, 4); R.captureShipId = id; R.captureShipLvl = lvl; }
        if (doCensus) {
          let drawables = 0, tris = 0;
          (b || mesh).traverseVisible((o) => {
            if (o.isMesh || o.isInstancedMesh) {
              drawables++;
              const g = o.geometry;
              const n = g && (g.index ? g.index.count : (g.attributes && g.attributes.position ? g.attributes.position.count : 0));
              tris += Math.floor(n / 3) * (o.isInstancedMesh ? o.count : 1);
            }
          });
          frame.ships[id].t = tris;
          // The packet's gate is a ship that committed a presented tier drawing nothing while
          // it is on the glass. Off-screen ships get visible=false roots (legit culling), and
          // ships still streaming an authored root legitimately wear a resolving marker instead.
          if (drawables === 0 && lvl !== 'none') {
            const r = shipScreenRect(b || mesh, px);
            if (r && r.strictlyOnScreen) {
              R.blanks.push({ id, seq, t: frame.t, lvl, cx: r.cx, cy: r.cy,
                boundaryVisible: !!(b || mesh).visible });
            }
          }
          if (pending || R.captureShipId === id) frame.ships[id].d = drawables;
        }
      }
      if (R.captureLeft > 0) {
        R.captureLeft--;
        const mesh = meshes.get(R.captureShipId);
        if (mesh) queueShipCapture(findBoundary(mesh) || mesh, seq, R.captureShipId, R.captureShipLvl,
          frame.ships[R.captureShipId] ? frame.ships[R.captureShipId].px : undefined);
      }
      R.frames.push(frame);
    };
    const loop = () => { try { R.tick(); } catch (err) { R.errors.push(String(err && err.message || err)); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });

  // ---- driver: baseline -> zoom out (demote) -> hold -> zoom back in (promote) ------------
  const tFlight = Date.now();
  const at = async (sec, fn) => { const wait = tFlight + sec * 1000 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); try { await fn(); } catch {} };
  const zoom = (level) => page.evaluate((lv) => window.SF.bus.emit('camera:zoom', { level: lv }), level);
  // Drain the in-page capture queue into real compositor screenshots. Latency puts each shot a
  // frame or three after the tick that queued it — that is exactly the post-swap window the
  // packet wants inspected. The per-frame drawable census inside the page catches the
  // single-frame gap a screenshot can miss.
  const capRecords = [];
  let drainBusy = false;
  const drainOnce = async () => {
    if (drainBusy) return;
    drainBusy = true;
    try {
      const reqs = await page.evaluate(() => (window.__lodProbe ? window.__lodProbe.captureQueue.splice(0) : [])).catch(() => []);
      for (const q of reqs) {
        const name = `swap-${String(q.seq).padStart(5, '0')}-s${q.shipId ?? 'x'}-${String(capRecords.length).padStart(3, '0')}.png`;
        try {
          await page.screenshot({ path: path.join(OUT, name), clip: q.clip });
          capRecords.push({ ...q, file: name });
        } catch {}
      }
    } finally { drainBusy = false; }
  };
  const drainer = setInterval(() => { void drainOnce(); }, 120);
  await page.mouse.move(1100, 300);
  await at(2, async () => { if (ROUTE === 'adventure') { await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW'); } });
  await at(6, async () => { await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW'); });
  await at(10, () => zoom(230));
  await at(14, () => zoom(330));
  // Far hold: a long burn rides speed zoom past the manual max so small contacts cross the
  // demote bands. Demotions dwell ~0.5 s then join the paced decode/compose/compile queue —
  // each sibling takes seconds of sliced frame budget, and zooming back in republishes lod0
  // which cancels in-flight loads. The hold must outlast the drain or no swap ever commits.
  await at(18, async () => { await page.keyboard.down('KeyW'); await page.waitForTimeout(6000); await page.keyboard.up('KeyW'); });
  const farEnd = Math.min(Math.max(30, SAMPLE_MS / 1000 - 30), 130);
  await at(farEnd, () => zoom(200));
  await at(farEnd + 2, () => zoom(110));
  // Near hold: promotions commit immediately.
  await at(Math.max(farEnd + 4, SAMPLE_MS / 1000 - 4), () => page.screenshot({ path: path.join(OUT, 'late.png') }).catch(() => {}));
  await new Promise((r) => setTimeout(r, Math.max(0, tFlight + SAMPLE_MS - Date.now())));
  const data = await page.evaluate(() => {
    const R = window.__lodProbe || {};
    return { frames: R.frames || [], swaps: R.swaps || [], blanks: R.blanks || [], errors: R.errors || [] };
  });
  clearInterval(drainer);
  await drainOnce();

  // ---- analyze captured PNGs: near-black fraction + diff vs the same ship's prior shot ------
  const prevByShip = new Map();
  for (const rec of capRecords) {
    try {
      const png = PNG.sync.read(readFileSync(path.join(OUT, rec.file)));
      const n = png.width * png.height;
      let dark = 0, sum = 0, max = 0, changed = 0;
      // The hull is centered in the rect; a legitimately drawn small ship still sits in mostly
      // black space. The blank signal is the center region going dark, not the whole rect.
      const c0x = Math.floor(png.width * 0.3), c1x = Math.ceil(png.width * 0.7);
      const c0y = Math.floor(png.height * 0.3), c1y = Math.ceil(png.height * 0.7);
      let darkCenter = 0, nCenter = 0;
      const prev = prevByShip.get(rec.shipId);
      const canDiff = prev && prev.width === png.width && prev.height === png.height;
      for (let p = 0; p < n; p++) {
        const i = p * 4;
        const lum = png.data[i] + png.data[i + 1] + png.data[i + 2];
        if (lum < 36) dark++;
        const px = p % png.width, py = (p / png.width) | 0;
        if (px >= c0x && px < c1x && py >= c0y && py < c1y) { nCenter++; if (lum < 36) darkCenter++; }
        if (canDiff) {
          const d = Math.abs(png.data[i] - prev.data[i]) + Math.abs(png.data[i + 1] - prev.data[i + 1]) + Math.abs(png.data[i + 2] - prev.data[i + 2]);
          sum += d; if (d > max) max = d; if (d > 48) changed++;
        }
      }
      rec.darkPct = +(100 * dark / n).toFixed(1);
      rec.darkCenter = +(100 * darkCenter / Math.max(1, nCenter)).toFixed(1);
      rec.mean = canDiff ? +(sum / n / 3).toFixed(2) : null;
      rec.max = canDiff ? max : null;
      rec.changedPct = canDiff ? +(100 * changed / n).toFixed(1) : null;
      prevByShip.set(rec.shipId, png);
    } catch (err) { rec.error = String((err && err.message) || err); }
  }
  data.captures = capRecords;
  writeFileSync(path.join(OUT, 'lod-cost.json'), JSON.stringify({ route: ROUTE, round: ROUND, sector: SECTOR, loadS, ...data }, null, 1));
  writeFileSync(path.join(OUT, 'console.log'), consoleLines.join('\n'));

  // ---- summary -------------------------------------------------------------
  const fail = [];
  const L = [];
  const farEndMs = Math.min(58, SAMPLE_MS / 1000 - 14) * 1000;
  const windows = {
    baseline: data.frames.filter((f) => f.t < 9000),
    far: data.frames.filter((f) => f.t >= 14000 && f.t < farEndMs),
    near: data.frames.filter((f) => f.t >= farEndMs + 2000),
  };
  const stat = (fs, key) => {
    const vals = fs.map((f) => f[key]).filter(Number.isFinite).sort((a, b) => a - b);
    return vals.length ? { p50: vals[Math.floor(vals.length / 2)], p95: vals[Math.floor(vals.length * 0.95)], max: vals[vals.length - 1] } : {};
  };
  L.push(`route=${ROUTE} round=${ROUND} sector=${SECTOR} load->flight ${loadS.toFixed(1)}s frames=${data.frames.length} swaps=${data.swaps.length} blankFrames=${data.blanks.length}`);
  for (const [name, fs] of Object.entries(windows)) {
    if (!fs.length) continue;
    const tris = stat(fs, 'tris'), calls = stat(fs, 'calls'), ms = stat(fs, 'ms');
    const tiers = { lod0: 0, lod1: 0, lod2: 0, none: 0 };
    for (const f of fs) for (const k of Object.keys(tiers)) tiers[k] += f.tiers[k] || 0;
    L.push(`${name}: frames=${fs.length} tris p50=${tris.p50} p95=${tris.p95} calls p50=${calls.p50} presentMs p50=${ms.p50} p95=${ms.p95} max=${ms.max} shipFrames=${JSON.stringify(tiers)}`);
  }
  L.push('--- swaps');
  for (const s of data.swaps.slice(0, 80)) L.push(`  t=${s.t}s seq=${s.seq} ship#${s.id} ${s.from}->${s.to} px=${s.px}`);
  L.push('--- blank frames (ship boundary visible, zero drawable meshes)');
  for (const b of data.blanks.slice(0, 40)) L.push(`  t=${b.t}s seq=${b.seq} ship#${b.id} lvl=${b.lvl}`);
  L.push('--- captured rect diffs around swaps (diff vs this ship\'s previous captured frame)');
  for (const c of data.captures) L.push(`  seq=${c.seq} t=${c.t}s ship#${c.shipId} lvl=${c.lvl || '?'} mean=${c.mean} max=${c.max} changedPct=${c.changedPct} darkPct=${c.darkPct} darkCenter=${c.darkCenter} ${c.file || ''}`);
  if (data.errors.length) { L.push('--- probe errors'); for (const e of data.errors.slice(0, 20)) L.push('  ' + e); }
  if (data.blanks.length) fail.push(`${data.blanks.length} frame(s) where a ship with a committed tier had no drawable`);
  // A dead-black rect center only implicates the ship when the surrounding clip is lit — a
  // dark center inside an already-dark region (night nebula, asteroid shadow) is ambiguous and
  // the structural blank census is the authority there.
  const blankish = data.captures.filter((c) => c.darkCenter > 90 && c.darkPct < 50 && c.lvl && c.lvl !== 'none');
  if (blankish.length) fail.push(`${blankish.length} near-black ship centers in captured frames around swaps`);
  writeFileSync(path.join(OUT, 'summary.txt'), L.join('\n'));
  console.log(L.slice(0, 60).join('\n'));
  console.log(`\nlod-cost.json + summary.txt -> ${OUT}`);
  if (fail.length) { console.log(`FAIL: ${fail.join('; ')}`); exitCode = 1; } else console.log('PASS: every presented ship kept a drawable; no blank captured frame');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
process.exit(exitCode);
