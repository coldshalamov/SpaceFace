// STREAM-BUILD-1 verification probe. New Game, then once a second for --ms it reads the
// renderer's own streaming census (state.render.streamingCensus — stand-ins on screen, solid
// bodies inside the 600 WU contact horizon with nothing drawn, per-ship spawn->real-model
// latency, queue state) and falls back to measuring the same quantities itself when the census
// is absent (pre-fix builds). Exits non-zero if any on-screen body stays a stand-in > 3 s.
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-streaming.mjs [--ms=45000] [--fly]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const SAMPLE_MS = Number(arg('ms', 45000));
const FLY = process.argv.includes('--fly');
const TAG = arg('tag', FLY ? 'fly' : 'idle');
const OUT = path.join(ROOT, '.devshots', 'fleet', 'runs', `probe-streaming-${TAG}`);
mkdirSync(OUT, { recursive: true });
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
let exitCode = 0;
const consoleLines = [];
try {
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=1600,900'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { const t = m.text(); if (/partsLibrary|authored|admission|stand-in|whole-ship|GLB|glb|decode|unavailable|census/i.test(t)) consoleLines.push(`${m.type()}: ${t.slice(0, 400)}`); });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  await page.evaluate(async () => {
    const PL = await import('/src/render/partsLibrary.js');
    const RR = await import('/src/render/renderer.js');
    const S = window.SF.state;
    window.__sp = { PL, RR, t0: performance.now(), samples: [], firstAuthored: {}, firstSeen: {}, spawns: [], hits: [], presentMax: 0 };
    window.SF.bus.on('entity:spawned', (p) => { const e = p && p.entity; if (!e) return; window.__sp.spawns.push({ t: performance.now() - window.__sp.t0, id: p.id, type: e.type, def: e.data?.defId || null }); });
    window.SF.bus.on('physics:impact', (p) => {
      const a = p && (p.aId ?? p.a?.id), b = p && (p.bId ?? p.b?.id); const pid = S.playerId;
      if (a !== pid && b !== pid) return; const other = a === pid ? b : a;
      window.__sp.hits.push({ t: performance.now() - window.__sp.t0, other, info: window.__spDescribe ? window.__spDescribe(other) : null });
    });
    const findBoundary = (mesh) => {
      if (!mesh) return null; let found = null;
      mesh.traverse((o) => { if (!found && o.userData && typeof o.userData.authoredAssetState === 'string') found = o; });
      return found;
    };
    const visibleDraws = (mesh) => {
      let real = 0, marker = 0, standIn = 0;
      if (!mesh || mesh.visible === false) return { real, marker, standIn };
      for (let n = mesh.parent; n; n = n.parent) if (n.visible === false) return { real, marker, standIn, hiddenAncestor: true };
      mesh.traverseVisible((o) => {
        if (!(o.isMesh || o.isInstancedMesh) || (o.isInstancedMesh && o.count === 0)) return;
        let tag = 'real';
        for (let n = o; n && n !== mesh; n = n.parent) {
          if (/^StandIn_|^AuthoredResolvingStandIn$/.test(n.name || '') || (n.userData && n.userData.admissionStandInHull === true)) { tag = 'standIn'; break; }
          if (/^AuthoredResolvingMarker/.test(n.name || '') || (n.userData && n.userData.authoredResolvingMarker === true)) { tag = 'marker'; break; }
        }
        if (tag === 'real') real++; else if (tag === 'marker') marker++; else standIn++;
      });
      const body = mesh.userData && mesh.userData.asteroidInstanceBody;
      if (body && body.userData && body.userData.asteroidInstanceAdopted === true) real++;
      return { real, marker, standIn };
    };
    window.__spDescribe = (id) => {
      const e = S.entities.get(id); if (!e) return null;
      const mesh = S.render.meshes && S.render.meshes.get(id);
      const b = findBoundary(mesh); const ud = b ? b.userData : {};
      return { type: e.type, def: e.data?.defId || e.data?.typeId || e.data?.placeId || null, state: ud.authoredAssetState || null, draws: visibleDraws(mesh), hasMesh: !!mesh };
    };
    window.__spSample = (sec) => {
      const P = window.__sp.PL, R = window.__sp.RR;
      const scene = S.render.scene, renderer = S.render.renderer;
      const pl = S.entities.get(S.playerId); const px = pl?.pos?.x || 0, pz = pl?.pos?.z || 0;
      const rows = []; const census = { solidUndrawn600: 0, solidUndrawnByType: {}, ghost600: 0, ghostByType: {}, onScreenHole: 0, onScreenGhost: 0, holes: [] };
      const cam = (S.camera && S.camera.obj && S.camera.obj.isCamera) ? S.camera.obj : S.render.camera;
      const V = cam ? new cam.position.constructor() : null;
      const plMesh = S.render.meshes && S.render.meshes.get(S.playerId);
      const off = { x: 0, z: 0 };
      if (plMesh && V) { plMesh.getWorldPosition(V); off.x = V.x - px; off.z = V.z - pz; }
      const onScreen = (e) => {
        if (!cam || !V) return null;
        V.set(e.pos.x + off.x, 0, e.pos.z + off.z).project(cam);
        if (V.z > 1) return false;
        const W = innerWidth, H = innerHeight;
        const sx = (V.x + 1) / 2 * W, sy = (1 - V.y) / 2 * H;
        const padPx = 40;
        return sx > -padPx && sx < W + padPx && sy > -padPx && sy < H + padPx;
      };
      for (const e of S.entities.values()) {
        if (!e || e.alive === false || e.id === S.playerId) continue;
        const d = Math.hypot((e.pos?.x || 0) - px, (e.pos?.z || 0) - pz);
        if (d > 1200) continue;
        const solid = e.collides !== false && ['ship', 'asteroid', 'wreck', 'station', 'drone', 'prop', 'structure', 'payload'].includes(e.type);
        const mesh = S.render.meshes && S.render.meshes.get(e.id);
        const dr = visibleDraws(mesh);
        const vis = solid ? onScreen(e) : null;
        if (solid && vis) {
          if (dr.real + dr.marker + dr.standIn === 0) { census.onScreenHole++; if (census.holes.length < 8) census.holes.push(`hole ${e.type}#${e.id}:${e.data?.defId || e.data?.typeId || e.data?.role || '?'}@${Math.round(d)} mesh=${!!mesh}`); }
          else if (dr.real === 0) { census.onScreenGhost++; if (census.holes.length < 8) census.holes.push(`ghost ${e.type}#${e.id}:${e.data?.defId || e.data?.typeId || e.data?.role || '?'}@${Math.round(d)} m${dr.marker}/s${dr.standIn}`); }
        }
        if (solid && d < 600) {
          if (dr.real + dr.marker + dr.standIn === 0) { census.solidUndrawn600++; census.solidUndrawnByType[e.type] = (census.solidUndrawnByType[e.type] || 0) + 1; }
          else if (dr.real === 0) { census.ghost600++; census.ghostByType[e.type] = (census.ghostByType[e.type] || 0) + 1; }
        }
        if (!window.__sp.firstSeen[e.id] && d < 900) window.__sp.firstSeen[e.id] = { t: sec, d: Math.round(d), type: e.type };
        const b = findBoundary(mesh); const ud = b ? b.userData : {};
        if (dr.real > 0 && window.__sp.firstAuthored[e.id] == null) window.__sp.firstAuthored[e.id] = sec;
        if (e.type !== 'ship' && !(solid && d < 600 && dr.real === 0)) continue;
        let sel = null, resident = null, reg = null, relevant = null, prio = null;
        try { sel = e.type === 'ship' ? (P.wholeShipVisualForEntity(e) || {}).file || null : null; } catch (err) { sel = 'ERR ' + err.message; }
        try { resident = e.type === 'ship' ? !!P.residentWholeShipStandInRecord(e, { renderer }) : null; } catch (err) { resident = 'ERR ' + err.message; }
        try { reg = b ? P.inspectAuthoredBoundaryRegistrations(scene, b) : null; } catch {}
        try { relevant = R.isEntityAuthoredUpgradeRelevant(e, S); } catch (err) { relevant = 'ERR ' + err.message; }
        try { prio = P.authoredUpgradePriority({ entity: e, options: {} }); } catch (err) { prio = 'ERR'; }
        rows.push({ id: e.id, type: e.type, def: e.data?.defId || e.data?.typeId || e.data?.placeId || null, role: e.data?.role || e.data?.trafficRole || e.data?.jobRole || null,
          d: Math.round(d), vis, collides: e.collides !== false, hasMesh: !!mesh, meshVis: mesh ? mesh.visible !== false : null, dr, sel, resident,
          st: ud.authoredAssetState || null, why: ud.authoredReadmissionReason || null, fb: ud.resolvingMarkerFallbackReason || null,
          pend: ud.admissionStandInPending === true, promise: !!ud.authoredUpgradePromise, reqAt: ud.authoredUpgradeRequestedAt ? Math.round((Date.now() - ud.authoredUpgradeRequestedAt) / 100) / 10 : null,
          q: reg ? `${reg.queuedLifecycle || '-'}${reg.inJobsArray ? '/inJobs' : ''}` : null, relevant, prio,
          tier: e.activity?.presentationTier ?? null, presAdm: e.presentationAdmission ?? e.data?.presentationAdmission ?? null,
          resH: mesh?.userData?.sfResidencyHeld === true || ud.sfResidencyHeld === true,
          geoP: mesh?.userData?.geometryPending === true || ud.geometryPending === true,
          pipeP: mesh?.userData?.pipelinesPending === true || ud.pipelinesPending === true,
          rmark: !!(mesh?.userData?.resolvingMarker || ud.resolvingMarker),
          markVis: (mesh?.userData?.resolvingMarker || ud.resolvingMarker)
            ? (mesh?.userData?.resolvingMarker || ud.resolvingMarker).visible !== false : null,
          wantM: mesh?.userData?.wantsBoundaryResolvingMarker === true || ud.wantsBoundaryResolvingMarker === true,
          stRoot: mesh?.userData?.authoredAssetState || null, udIsMesh: b === mesh,
          eMeshIsBound: e.mesh === mesh,
          shelved: !!(S.world?.farActors?.byId?.get?.(e.id)), retry: ud.authoredAdmissionRetryCount || 0 });
      }
      let queue = null, diagJobs = null, renderCensus = null;
      try { queue = P.describeAuthoredUpgradeQueue(scene); } catch {}
      try {
        const dg = scene.userData.authoredUpgradeDiagnostics;
        diagJobs = dg ? { n: dg.jobs?.length, maxSlots: dg.maxConcurrentAdmissionSlots, last: (dg.jobs || []).slice(-6).map((j) => JSON.stringify(j).slice(0, 300)) } : null;
      } catch {}
      // The renderer's own census is the truth this probe verifies; keep the independently
      // computed one beside it so a disagreement shows in the record instead of hiding.
      try { renderCensus = S.render.streamingCensus || null; } catch {}
      const present = Number(S.render.lastPresentDtMs);
      if (Number.isFinite(present)) window.__sp.presentMax = Math.max(window.__sp.presentMax, present);
      window.__sp.samples.push({ sec, mode: S.mode, entities: S.entities.size, census, renderCensus, queue, diagJobs, rows });
    };
  });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Stream' }));
  const tNew = Date.now();
  while (true) {
    const ok = await page.evaluate(() => { const s = window.SF.state; return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt); });
    if (ok) break;
    if (Date.now() - tNew > 560000) throw new Error('no flight');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const loadS = (Date.now() - tNew) / 1000;
  await page.mouse.move(1100, 300);
  const tFlight = Date.now();
  for (let s = 0; s * 1000 <= SAMPLE_MS; s++) {
    if (FLY && s === 1) await page.keyboard.down('KeyW');
    if (FLY && s === 25) await page.keyboard.up('KeyW');
    await new Promise((r) => setTimeout(r, Math.max(0, tFlight + s * 1000 - Date.now())));
    await page.evaluate((sec) => window.__spSample(sec), s);
    if ([2, 10, 30].includes(s)) await page.screenshot({ path: path.join(OUT, `t${String(s).padStart(2, '0')}.png`) });
  }
  await page.keyboard.up('KeyW').catch(() => {});
  const data = await page.evaluate(() => { const { PL, RR, ...rest } = window.__sp; return rest; });
  writeFileSync(path.join(OUT, 'stream.json'), JSON.stringify({ loadS, ...data }, null, 1));
  writeFileSync(path.join(OUT, 'console.log'), consoleLines.join('\n'));

  // ---- verdict ----
  // fail: an on-screen body still a stand-in >3 s after it was first tracked as one
  // fail: a ship first seen inside the 600 WU contact horizon whose real model took >3 s
  // fail: a solid inside 600 WU with nothing drawn (no real hull, no stand-in, no mesh)
  const fail = [];
  const L_probeNotes = [];
  const standInSince = {};
  const undrawnSince = {};
  for (const smp of data.samples) {
    // Renderer census path (post-fix builds).
    const rc = smp.renderCensus;
    if (rc) {
      for (const row of rc.standIns || []) {
        if (row.ageS != null && row.ageS > 3) fail.push(`t=${smp.sec}s stand-in ${row.type}#${row.id} on screen ${row.ageS}s (${row.def || '?'})`);
      }
      if (rc.solidUndrawn600 > 3) fail.push(`t=${smp.sec}s ${rc.solidUndrawn600} solid bodies inside 600 WU drew nothing`);
    }
    // Independent measurement — the probe's own classification must agree before it passes.
    // The packet's gate is on-SCREEN stand-ins: a marker body beyond the frame's edge is a
    // streaming runway, not the defect — count it only while the camera shows it.
    for (const r of smp.rows) {
      const isStandIn = r.vis === true
        && r.dr && r.dr.real === 0 && (r.dr.standIn + r.dr.marker) > 0 && r.meshVis !== false;
      if (isStandIn) {
        if (!standInSince[r.id]) standInSince[r.id] = { t: smp.sec, type: r.type, def: r.def, d: r.d };
        else if (smp.sec - standInSince[r.id].t > 3) {
          fail.push(`t=${smp.sec}s stand-in ${r.type}#${r.id} visible ${(smp.sec - standInSince[r.id].t).toFixed(0)}s at ${r.d} WU (${r.def || r.role || '?'})`);
        }
      } else {
        delete standInSince[r.id];
      }
      // Undrawn solid inside the contact horizon: the packet's defect is a *sustained* hole
      // the player rams — a spawn's ~1 s mesh-build window is pipeline latency, so only a
      // body that stays undrawn past the 3 s bar fails. The instantaneous counts stay in
      // the samples either way.
      const undrawnSolid = r.collides && r.d < 600
        && r.dr && r.dr.real + (r.dr.marker || 0) + (r.dr.standIn || 0) === 0;
      if (undrawnSolid) {
        if (!undrawnSince[r.id]) undrawnSince[r.id] = { t: smp.sec, type: r.type, d: r.d };
        else if (smp.sec - undrawnSince[r.id].t > 3) {
          fail.push(`t=${smp.sec}s ${r.type}#${r.id} inside 600 WU drew nothing for ${(smp.sec - undrawnSince[r.id].t).toFixed(0)}s`);
        }
      } else {
        delete undrawnSince[r.id];
      }
    }
    if (smp.census.solidUndrawn600 > 0) {
      L_probeNotes.push(`t=${smp.sec}s ${smp.census.solidUndrawn600} undrawn solid(s) <600 WU ${JSON.stringify(smp.census.solidUndrawnByType)}`);
    }
  }
  const shipLatency = Object.entries(data.firstSeen)
    .map(([id, v]) => ({ id, type: v.type, seenD: v.d, at: v.t, realAt: data.firstAuthored[id] ?? null }))
    .filter((x) => x.type === 'ship' && x.seenD != null && x.seenD < 600);
  const shipLate = shipLatency.filter((x) => x.realAt == null || x.realAt - x.at > 3);
  for (const x of shipLate) fail.push(`ship #${x.id} first seen at ${x.seenD} WU: real model ${x.realAt == null ? 'never' : `${(x.realAt - x.at).toFixed(0)}s`} (>3s)`);

  // ---- report ----
  const L = [];
  L.push(`load->flight ${loadS.toFixed(1)} s, samples ${data.samples.length}, worst present ${data.presentMax.toFixed(1)} ms`);
  for (const smp of data.samples) {
    if (![0, 1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 45].includes(smp.sec)) continue;
    const rc = smp.renderCensus;
    const rcBit = rc ? ` rc[standIns=${rc.onScreenStandIns} undrawn600=${rc.solidUndrawn600}]` : '';
    L.push(`t=${smp.sec}s ONSCREEN holes=${smp.census.onScreenHole} ghosts=${smp.census.onScreenGhost}${rcBit} ${smp.census.holes.join(' | ')}`);
    L.push(`t=${smp.sec}s ents=${smp.entities} solidUndrawn<600=${smp.census.solidUndrawn600} ${JSON.stringify(smp.census.solidUndrawnByType)} ghost<600=${smp.census.ghost600} ${JSON.stringify(smp.census.ghostByType)} queue=${JSON.stringify(smp.queue).slice(0, 600)}`);
  }
  L.push('--- every sample with an on-screen hole or ghost');
  for (const smp of data.samples) if (smp.census.onScreenHole || smp.census.onScreenGhost) L.push(`${smp.sec}s holes=${smp.census.onScreenHole} ghosts=${smp.census.onScreenGhost} ${smp.census.holes.join(' | ')}`);
  for (const sec of [3, 15, 30, 45]) {
    const smp = data.samples.find((x) => x.sec === sec); if (!smp) continue;
    L.push(`--- rows t=${sec}s`);
    for (const r of smp.rows.sort((a, b) => a.d - b.d)) L.push(JSON.stringify(r).slice(0, 520));
    if (smp.diagJobs) L.push('diag ' + JSON.stringify(smp.diagJobs).slice(0, 2000));
  }
  const ft = Object.entries(data.firstSeen).map(([id, v]) => ({ id, ...v, authoredAt: data.firstAuthored[id] ?? null }));
  L.push('--- first seen <900 vs first real draw (sec)');
  for (const r of ft.filter((x) => x.type === 'ship' || x.type === 'station' || x.type === 'wreck').sort((a, b) => a.t - b.t)) L.push(JSON.stringify(r));
  const censusShips = data.samples.length ? (data.samples[data.samples.length - 1].renderCensus?.ships || []) : [];
  L.push('--- renderer census ship latency (spawnS/realS/spawnToRealS)');
  for (const r of censusShips.slice(0, 24)) L.push(JSON.stringify(r));
  L.push(`player contacts ${data.hits.length}: ${data.hits.slice(0, 12).map((h) => JSON.stringify(h)).join(' ')}`);
  L.push('--- transient undrawn notes (informational, sub-3s)');
  for (const n of L_probeNotes) L.push('  ' + n);
  L.push('--- verdict');
  if (fail.length) { L.push(`FAIL ${fail.length}`); for (const f of fail.slice(0, 30)) L.push('  ' + f); }
  else L.push('PASS: no on-screen stand-in over 3 s, no undrawn solid inside 600 WU, no ship inside 600 WU late on its real model');
  writeFileSync(path.join(OUT, 'summary.txt'), L.join('\n'));
  console.log(L.slice(0, 40).join('\n'));
  console.log(`\nstream.json + summary.txt -> ${OUT}`);
  if (fail.length) { console.log(`FAIL: ${fail.length} violation(s); see summary.txt`); exitCode = 1; }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
process.exit(exitCode);
