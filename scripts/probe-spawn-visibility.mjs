// Spawn visibility: how long does a mid-flight spawn go undrawn, and how long until its authored
// model (not a procedural stand-in) is on screen? The owner's "models don't load in time".
//
//   node scripts/probe-spawn-visibility.mjs            Crucible swarm, seed 4242
//   node scripts/probe-spawn-visibility.mjs --open     open-route New Game
//   options: --ms=40000 (sample window after flight starts)
//
// Per spawned ship / wreck / asteroid / pickup: spawn -> first drawn frame, spawn -> authored state,
// whether it was already drawn before the spawn (a promoted field rock) and blank frames in its first
// 3 s. Pooled common rocks count as drawn through the shared instanced batch. Diagnosis only.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadPlaywright } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/load-playwright.mjs')).href);
const OPEN = process.argv.includes('--open');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const SAMPLE_MS = Number(arg('ms', 40000));
function cpuSnapshot() { let idle = 0, total = 0; for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; } return { idle, total }; }
const freePort = () => new Promise((res, rej) => { const p = createNetServer(); p.once('error', rej); p.listen(0, '127.0.0.1', () => { const { port } = p.address(); p.close(() => res(port)); }); });
const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' } });
const { chromium } = await loadPlaywright();
let browser;
try {
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=1600,900'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch {} });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150000 });
  if (OPEN) await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Spawn' }));
  else await page.evaluate(async () => { const l = await import('/src/ui/crucibleLaunch.js'); const s = l.crucibleSetupFor({ seed: 4242 }); l.requestCrucibleRun(window.SF.bus, s.value, s.ruleset); });
  await page.waitForFunction(() => { const s = window.SF.state; return s.mode === 'flight' && Number.isFinite(s.render && s.render.firstPlayableFrameAt); }, null, { timeout: 560000 });
  await page.bringToFront();
  await page.mouse.move(1100, 300);
  await page.keyboard.down('KeyW');
  const c0 = cpuSnapshot();
  await page.evaluate(() => {
    const S = window.SF.state;
    const track = new Map();
    window.__spawnTrack = track;
    const t0 = performance.now();

    const drawnNow = (mesh) => {
      if (!mesh || mesh.visible === false) return 0;
      for (let n = mesh.parent; n; n = n.parent) if (n.visible === false) return 0;
      let d = 0;
      mesh.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh) && !(o.isInstancedMesh && o.count === 0)) d++; });
      const body = mesh.userData && mesh.userData.asteroidInstanceBody;
      if (body && body.userData && body.userData.asteroidInstanceAdopted === true) d++;
      return d;
    };
    window.SF.bus.on('entity:spawned', (p) => {
      const e = p && p.entity;
      if (!e || (e.type !== 'ship' && e.type !== 'wreck' && e.type !== 'asteroid' && e.type !== 'pickup')) return;
      const preMesh = S.render && S.render.meshes && S.render.meshes.get(p.id);
      track.set(p.id, { preDrawn: drawnNow(preMesh) > 0, preMesh: !!preMesh, id: p.id, type: e.type, def: (e.data && (e.data.defId || e.data.enemyId || e.data.typeId)) || null, spawnAt: performance.now() - t0, meshAt: null, drawAt: null, authoredAt: null, lastState: null, nearWhileBlank: 0, framesBlank: 0 });
    });
    const tick = () => {
      const now = performance.now() - t0;
      const meshes = S.render && S.render.meshes;
      const player = S.entities && S.entities.get(S.playerId);
      for (const row of track.values()) {
        if (row.drawAt != null && row.authoredAt != null) continue;
        const ent = S.entities && S.entities.get(row.id);
        if (!ent || ent.alive === false) { row.dead = true; continue; }
        const mesh = meshes && meshes.get(row.id);
        if (mesh && row.meshAt == null) row.meshAt = now;
        let drawables = 0;
        if (mesh && mesh.visible !== false) {
          let hidden = false;
          for (let n = mesh.parent; n; n = n.parent) if (n.visible === false) { hidden = true; break; }
          if (!hidden) mesh.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh) && !(o.isInstancedMesh && o.count === 0)) drawables++; });
          // Pooled common rocks hide their own leaf and draw through the shared instanced batch.
          const body = mesh.userData && mesh.userData.asteroidInstanceBody;
          if (!hidden && body && body.userData && body.userData.asteroidInstanceAdopted === true) drawables++;
        }
        const st = mesh && mesh.userData && mesh.userData.authoredAssetState || null;
        row.lastState = st;
        if (drawables > 0 && row.drawAt == null) row.drawAt = now;
        if (row.authoredAt == null && (st === 'authored' || st === 'procedural-settled' || st === 'same-semantic-fallback')) row.authoredAt = now;
        if (drawables === 0 && now - row.spawnAt < 3000) {
          row.framesBlank++;
          if (player && ent.pos && Math.hypot(ent.pos.x - player.pos.x, ent.pos.z - player.pos.z) < 450) row.nearWhileBlank++;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(SAMPLE_MS);
  const c1 = cpuSnapshot();
  const rows = await page.evaluate(() => [...window.__spawnTrack.values()]);
  const busyPct = 100 * (1 - (c1.idle - c0.idle) / (c1.total - c0.total));
  const lines = [`route ${OPEN ? 'OPEN' : 'CRUCIBLE 4242'}  sample ${SAMPLE_MS} ms  host busy ${busyPct.toFixed(0)} %  spawns ${rows.length}`];
  const fmt = (v, base) => (v == null ? '   —  ' : `${((v - base) / 1000).toFixed(2).padStart(6)}`);
  const byType = {};
  for (const r of rows) {
    const k = `${r.type}:${r.def}`;
    const g = byType[k] || (byType[k] = { n: 0, blank: [], authored: [], near: 0, never: 0 });
    g.n++;
    if (r.drawAt != null) g.blank.push((r.drawAt - r.spawnAt) / 1000); else if (!r.dead) g.never++;
    if (r.authoredAt != null) g.authored.push((r.authoredAt - r.spawnAt) / 1000);
    g.near += r.nearWhileBlank;
  }
  const stat = (a) => { if (!a.length) return '—'; const s = [...a].sort((x, y) => x - y); return `p50 ${s[Math.floor(s.length / 2)].toFixed(2)} max ${s[s.length - 1].toFixed(2)}`; };
  for (const [k, g] of Object.entries(byType)) lines.push(`  ${k.padEnd(40)} n ${String(g.n).padStart(3)}  spawn->drawn s ${stat(g.blank).padEnd(22)} spawn->authored s ${stat(g.authored).padEnd(22)} never-drawn ${g.never}  near-blank-frames ${g.near}`);
  const promoted = rows.filter((r) => r.preDrawn);
  const gaps = promoted.map((r) => r.framesBlank);
  lines.push(`  visible BEFORE spawn (promoted while on glass): ${promoted.length}; of those went blank after: ${gaps.filter((g) => g > 0).length}; blank frames max ${gaps.length ? Math.max(...gaps) : 0}`);
  lines.push(`  had a mesh before spawn: ${rows.filter((r) => r.preMesh).length} / ${rows.length}`);
  lines.push('  slowest to draw:');
  for (const r of [...rows].filter((x) => x.drawAt != null).sort((a, b) => (b.drawAt - b.spawnAt) - (a.drawAt - a.spawnAt)).slice(0, 8)) {
    lines.push(`    #${r.id} ${r.type}:${r.def}  drawn ${fmt(r.drawAt, r.spawnAt)} s  authored ${fmt(r.authoredAt, r.spawnAt)} s  state ${r.lastState}  near-blank ${r.nearWhileBlank}`);
  }
  const never = rows.filter((x) => x.drawAt == null && !x.dead);
  if (never.length) lines.push(`  never drawn (alive): ${never.slice(0, 10).map((r) => `#${r.id} ${r.type}:${r.def} state=${r.lastState}`).join(' | ')}`);
  console.log(lines.join('\n'));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
