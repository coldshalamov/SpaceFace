#!/usr/bin/env node
// Normal-camera readability capture for the CR creative situations (encounters 1200+).
//
//   node scripts/capture-creative-situations.mjs [--seed=4242] [--only=the_wedge] [--viewport=960x540]
//
// Real New Game route in headless Chrome (SwiftShader), then for each situation: world.enterSector
// to its gated sector, the encounter director's own requestAuthoredEncounter on a zone of its type
// ahead of the player, and screenshots through the ordinary follow camera (no camera override).
// Reachability is proven separately by the seed-4242 director-roll tests; this only answers
// "is the premise readable in one look". Writes PNG frames + contact-sheet.jpg + captures.json to
// design/program/creative-situations/.
/* global window */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'design/program/creative-situations');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SEED = Number(args.seed || 4242);
const [VW, VH] = String(args.viewport || '960x540').split('x').map(Number);

export const SITUATIONS = [
  { shapeId: 'the_wedge', title: '1200 THE WEDGE', sectorId: 'sector_vesta_forge', zoneType: 'refinery_approach', ahead: 70,
    read: 'ore pods jam the feed lane; haulers queue; fuel racks drift beside it' },
  { shapeId: 'the_cold_shoulder', title: '1201 THE COLD SHOULDER', sectorId: 'sector_veil_nebula', zoneType: 'nebula_fog', ahead: 90,
    read: 'two boarders clamped to an ice hauler; ice pods in the gap' },
  { shapeId: 'the_kick_start', title: '1202 THE KICK START', sectorId: 'sector_tethys_junction', zoneType: 'trade_lane', ahead: 60,
    read: 'dead tug coasting at a picket; berth buoy off its side; fuel rack' },
  { shapeId: 'the_declaration', title: '1203 THE DECLARATION', sectorId: 'sector_tethys_junction', zoneType: 'border_checkpoint', ahead: 60,
    read: 'loose stolen-goods pods drift toward a customs cutter' },
  { shapeId: 'the_mine_garden', title: '1204 THE MINE GARDEN', sectorId: 'sector_pallas_drift', zoneType: 'ambush_lane', ahead: 60,
    read: 'holed freighter; its pods drift inside an armed Reach minefield' },
].filter((s) => !args.only || String(args.only).split(',').includes(s.shapeId));

const log = (...m) => console.log('[creative-capture]', ...m);

async function waitSim(page, seconds, wallMs = 120000) {
  const start = await page.evaluate(() => window.SF.state.simTime || 0);
  await page.waitForFunction(([s0, dt]) => (window.SF.state.simTime || 0) >= s0 + dt, [start, seconds], { timeout: wallMs, polling: 250 });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 240)));
  const shots = [];
  try {
    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.registry), null, { timeout: 240000 });
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 240000 });
    await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 60000 });
    await page.fill('#sf-ng-seed', String(SEED)).catch(() => {});
    await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 60000 });
    await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 600000 });
    log('flight; seed', await page.evaluate(() => window.SF.state.meta && window.SF.state.meta.seed));
    for (const s of SITUATIONS) {
      await page.evaluate((sectorId) => window.SF.registry.get('world').enterSector(sectorId), s.sectorId);
      await page.waitForFunction((sectorId) => window.SF.state.world.currentSectorId === sectorId
        && (window.SF.state.entities.get(window.SF.state.playerId) || {}).presentationAdmission === 'ready', s.sectorId, { timeout: 300000, polling: 500 });
      await waitSim(page, 1.5);
      // Stage on the sector's own zone of the encounter's type — the place the director's day
      // plan books it — not beside the entry station. The ship is set down at the zone's edge.
      // Opt-in (--zone=1): on the 2026-10-12 run, live zone hazards resolved 1200/1201 before the
      // first frame and a mine hit the ship in 1204, so the default stages beside the entry point.
      const zone = args.zone ? zonesForSector(s.sectorId).find((z) => z.type === s.zoneType) : null;
      const origin = sectorGlobalOrigin(s.sectorId) || { x: 0, z: 0 };
      const zc = zone ? { x: origin.x + (zone.x ?? zone.center.x), z: origin.z + (zone.z ?? zone.center.z) } : null;
      if (zc) {
        await page.evaluate((c) => {
          const st = window.SF.state, p = st.entities.get(st.playerId);
          p.pos.x = c.x - 160; p.pos.z = c.z;
          if (p.prevPos) { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
          if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
          p.angVel = 0; p.rot = 0; p.prevRot = 0;
          p.flags = Object.assign({}, p.flags, { noInterp: true });
        }, zc);
        await waitSim(page, 2);
      }
      const res = await page.evaluate((sit) => {
        const st = window.SF.state, p = st.entities.get(st.playerId);
        const fx = Math.cos(p.rot), fz = Math.sin(p.rot);
        const anchor = sit.zc ? { ...sit.zc } : { x: p.pos.x + fx * sit.ahead, z: p.pos.z + fz * sit.ahead };
        const r = window.SF.registry.get('encounterDirector').requestAuthoredEncounter({
          shapeId: sit.shapeId, encounterId: `capture_${sit.shapeId}`, sectorId: sit.sectorId, anchor,
          zoneType: sit.zoneType, zoneRadius: 600, force: true });
        return { ok: r && r.ok, reason: r && r.reason, anchor, player: { x: p.pos.x, z: p.pos.z, rot: p.rot } };
      }, { ...s, zc });
      log(s.shapeId, JSON.stringify(res));
      if (!res.ok) { shots.push({ ...s, file: null, sub: `NOT STAGED: ${res.reason}` }); continue; }
      await waitSim(page, 1);
      // Arrival: put the ship where a pilot flying in would first hold the scene — short of the
      // authored cluster's centroid, nose on it — through the same pos-write + noInterp resync the
      // world owner uses for entry placement. The follow camera is left alone.
      const arrived = await page.evaluate(([shapeId, back]) => {
        const st = window.SF.state, p = st.entities.get(st.playerId);
        const live = Object.values(st.encounterDirector.live || {}).find((l) => l.shapeId === shapeId);
        const ids = new Set((live && live.ids) || []);
          for (const sub of Object.values((live && live.data) || {})) {
            if (!sub || typeof sub !== 'object') continue;
            for (const [k, v] of Object.entries(sub)) {
              if (/Ids$/.test(k) && Array.isArray(v)) v.forEach((x) => Number.isFinite(x) && ids.add(x));
              else if (/Id$/.test(k) && Number.isFinite(v)) ids.add(v);
            }
          }
        const pts = [...ids].map((id) => st.entities.get(id)).filter((e) => e && e.alive !== false && e.pos && e.id !== st.playerId).map((e) => e.pos);
        if (!pts.length) return null;
        const med = (k) => pts.map((q) => q[k]).sort((a, b) => a - b)[pts.length >> 1];
        const mx = med('x'), mz = med('z');
        const core = pts.filter((q) => Math.hypot(q.x - mx, q.z - mz) <= 300);
        const cx = core.reduce((a, q) => a + q.x, 0) / core.length, cz = core.reduce((a, q) => a + q.z, 0) / core.length;
        let dx = p.pos.x - cx, dz = p.pos.z - cz; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        p.pos.x = cx + dx * back; p.pos.z = cz + dz * back;
        if (p.prevPos) { p.prevPos.x = p.pos.x; p.prevPos.z = p.pos.z; }
        if (p.vel) { p.vel.x = 0; p.vel.z = 0; if ('y' in p.vel) p.vel.y = 0; }
        p.angVel = 0; p.rot = Math.atan2(-dz, -dx); p.prevRot = p.rot;
        p.flags = Object.assign({}, p.flags, { noInterp: true });
        return { centroid: { x: Math.round(cx), z: Math.round(cz) }, core: core.length, of: pts.length };
      }, [s.shapeId, s.back || Number(args.back || 40)]);
      log(s.shapeId, 'arrival', JSON.stringify(arrived));
      for (const [i, after] of [[0, 2.5], [1, 6]]) {
        await waitSim(page, i === 0 ? after : after - 2.5);
        const file = path.join(OUT, `${s.shapeId}-${i}.png`);
        await page.screenshot({ path: file, type: 'png' });
        const facts = await page.evaluate(([shapeId, vw, vh]) => {
          const st = window.SF.state;
          const live = Object.values(st.encounterDirector.live || {}).find((l) => l.shapeId === shapeId);
          const w2s = window.SF.helpers && window.SF.helpers.worldToScreen;
          const bodies = [];
          const ids = new Set((live && live.ids) || []);
          for (const sub of Object.values((live && live.data) || {})) {
            if (!sub || typeof sub !== 'object') continue;
            for (const [k, v] of Object.entries(sub)) {
              if (/Ids$/.test(k) && Array.isArray(v)) v.forEach((x) => Number.isFinite(x) && ids.add(x));
              else if (/Id$/.test(k) && Number.isFinite(v)) ids.add(v);
            }
          }
          for (const id of ids) {
            if (id === st.playerId) continue;
            const e = st.entities.get(id);
            if (!e || e.alive === false || !e.pos || typeof w2s !== 'function') continue;
            // The renderer's own projection (frame membrane / sector-local origin), as the HUD uses it.
            const v = w2s({ x: e.pos.x, z: e.pos.z }) || {};
            const x = Number(v.x) || 0; const y = Number(v.y) || 0;
            const inFrame = !!v.onScreen && !v.behind && x >= 0 && x <= vw && y >= 0 && y <= vh;
            bodies.push({ id, type: e.type, role: (e.data && (e.data.crRole || e.data.role || e.data.kind)) || null, x: Math.round(x), y: Math.round(y), inFrame, mesh: !!e.mesh || !!e.renderObj || e.presentationAdmission === 'ready' });
          }
          return { phase: live && live.phase, simTime: +(st.simTime || 0).toFixed(1), bodies };
        }, [s.shapeId, VW, VH]);
        const inFrame = facts.bodies.filter((b) => b.inFrame).length;
        shots.push({ ...s, file, bodies: facts.bodies, sub: `${s.sectorId.replace('sector_', '')} · ${s.zoneType} · t+${after}s · ${facts.phase || 'resolved'} · ${inFrame}/${facts.bodies.length} bodies in frame` });
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
  await contactSheet(shots);
  writeFileSync(path.join(OUT, 'captures.json'), `${JSON.stringify({ seed: SEED, viewport: `${VW}x${VH}`, renderer: 'headless Chrome + SwiftShader',
    route: 'main menu -> New Game -> Launch -> world.enterSector(gated sector) -> encounterDirector.requestAuthoredEncounter(zone of its type, ahead of player) -> normal follow camera',
    shots: shots.map((s) => ({ shapeId: s.shapeId, file: s.file ? path.relative(ROOT, s.file) : null, sub: s.sub, bodies: s.bodies || [] })), pageErrors }, null, 2)}\n`);
  log('wrote', path.relative(ROOT, path.join(OUT, 'contact-sheet.jpg')), 'pageErrors', pageErrors.length);
}

async function contactSheet(shots) {
  const TW = 480, TH = 270, COLS = 2, HEAD = 22, FOOT = 20;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tiles = [];
  for (const s of shots) {
    const sx = TW / VW, sy = TH / VH;
    const rings = (s.bodies || []).filter((b) => b.inFrame).map((b) => `<circle cx="${(b.x * sx).toFixed(1)}" cy="${(HEAD + b.y * sy).toFixed(1)}" r="9" fill="none" stroke="#ffd34d" stroke-width="1.5" stroke-dasharray="3 2"/>`).join('');
    const svg = `<svg width="${TW}" height="${TH + HEAD + FOOT}" xmlns="http://www.w3.org/2000/svg">
      ${rings}<rect width="100%" height="${HEAD}" fill="#111"/><text x="6" y="16" font-family="DejaVu Sans" font-size="13" font-weight="bold" fill="#f0f0f0">${esc(s.title)} — ${esc(s.read).slice(0, 52)}</text>
      <rect y="${HEAD + TH}" width="100%" height="${FOOT}" fill="#111"/><text x="6" y="${HEAD + TH + 14}" font-family="DejaVu Sans" font-size="11" fill="#cfcfcf">${esc(s.sub).slice(0, 80)}</text></svg>`;
    const img = s.file ? await sharp(s.file).resize(TW, TH, { fit: 'fill' }).toBuffer()
      : await sharp({ create: { width: TW, height: TH, channels: 3, background: '#300' } }).png().toBuffer();
    tiles.push(await sharp({ create: { width: TW, height: TH + HEAD + FOOT, channels: 3, background: '#000' } })
      .composite([{ input: img, top: HEAD, left: 0 }, { input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer());
  }
  const rows = Math.ceil(tiles.length / COLS), H = TH + HEAD + FOOT;
  await sharp({ create: { width: TW * COLS, height: Math.max(1, rows) * H, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * TW, top: Math.floor(i / COLS) * H })))
    .jpeg({ quality: 82 }).toFile(path.join(OUT, 'contact-sheet.jpg'));
}

main().catch((e) => { console.error(e); process.exit(1); });
