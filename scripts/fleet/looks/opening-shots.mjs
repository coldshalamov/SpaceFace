// LOOK-05A look: the first sector's opening in one run (spawn, the marked tow can, the derelict carrier,
// the Helios approach) plus what Nocturne (local lights / media) actually holds in each place.
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/opening-shots.mjs <outPrefix>
import { chromium as rawChromium } from 'playwright';
import { quietChromium } from '../../lib/quietLaunch.mjs';
const chromium = quietChromium(rawChromium);
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const PORT = 8173;
const out = process.argv[2] || '.devshots/fleet/looks/look05a/open';
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
try {
  await sleep(2500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?sector=sector_helios_prime&shot=1`);
  await page.waitForFunction(() => window.__sfShotReady === true, null, { timeout: 300000 });
  await sleep(1500);
  const report = {};
  const nocturne = () => page.evaluate(() => {
    const n = window.SF.state.render && window.SF.state.render.nocturne;
    const c = n && n.content; if (!c) return { present: !!n };
    const recs = [];
    for (const r of c.records.values()) recs.push({ id: r.entity.id, type: r.entity.type, arch: r.archetype, lights: r.lights.length, on: r.lights.filter((l) => l.source.enabled).length, def: r.entity.defId || (r.entity.data && (r.entity.data.stationId || r.entity.data.scenarioActorId)) });
    return { present: true, enabled: n.enabled, media: c.media.length, comp: c.compositionId, diag: c.diagnostics, recs };
  });
  const place = async (x, z, label) => {
    await page.evaluate(([x, z]) => { const s = window.SF.state; window.SF.registry.get('world').relocatePlayerInSector({ x, z }, { reason: 'look' }); const p = s.entities.get(s.playerId); p.vel.x = 0; p.vel.z = 0; }, [x, z]);
    await sleep(3500);
    report[label] = await nocturne();
    report[label].playerAt = await page.evaluate(() => { const s = window.SF.state; const p = s.entities.get(s.playerId); return [Math.round(p.pos.x), Math.round(p.pos.z)]; });
    await page.screenshot({ path: `${out}-${label}.png` });
  };
  // Sector-local numbers in the data are offset in world space, so anchor every spot to a real entity.
  const anchors = await page.evaluate(() => {
    const s = window.SF.state; const at = (f) => { const e = s.entityList.find(f); return e ? { x: e.pos.x, z: e.pos.z } : null; };
    return {
      player: at((e) => e.id === s.playerId),
      spindle: at((e) => e.data && e.data.scenarioActorId === 'evidence_spindle_47a'),
      carrier: at((e) => e.data && e.data.scenarioActorId === 'carrier_wreck_bourse'),
      station: at((e) => e.type === 'station' && e.data && e.data.stationId === 'station_helios'),
    };
  });
  report.anchors = anchors;
  report.near = await page.evaluate((a) => window.SF.state.entityList.filter((e) => e.pos && Math.hypot(e.pos.x - a.x, e.pos.z - a.z) < 1500 && e.type !== 'ship' && e.type !== 'pickup' && e.type !== 'asteroid')
    .map((e) => ({ id: e.id, type: e.type, r: Math.round(e.radius || 0), dx: Math.round(e.pos.x - a.x), dz: Math.round(e.pos.z - a.z), k: Object.keys(e.data || {}).filter((k) => /poi|place|station|kind|scenario|archetype|lightFixture|nocturne/i.test(k)).map((k) => k + '=' + String(typeof e.data[k] === 'object' ? '[obj]' : e.data[k]).slice(0, 40)).join(' ') })), anchors.spindle);
  const off = (a, dx, dz) => [a.x + dx, a.z + dz];
  const spots = [
    [...off(anchors.spindle, -92, 0), 'spawn'],
    [...off(anchors.spindle, -45, 30), 'spindle'],
    [...off(anchors.carrier, -50, -110), 'derelict'],
    [...off(anchors.spindle, 258, -20), 'threshold'],
    [...off(anchors.station, -150, 40), 'helios'],
  ];
  for (const [x, z, label] of spots) await place(x, z, `after-${label}`);
  // Then switch the LOOK-05A additions off in the live session and shoot the same places again.
  await page.evaluate((thr) => {
    window.__thr = thr;
    const SF = window.SF; const s = SF.state;
    for (const e of s.entityList.slice()) {
      const d = e.data || {};
      if (d.scenarioActorId === 'evidence_spindle_47a') { d.nocturne = false; d.luminous = false; }
      if (d.scenarioActorId === 'carrier_wreck_bourse') { d.emergencyLight = false; d.smoke = false; }
      if (e.type === 'asteroid' && e.pos && Math.hypot(e.pos.x - (window.__thr.x), e.pos.z - (window.__thr.z)) < 125 && SF.helpers.removeEntity) SF.helpers.removeEntity(e.id);
    }
  }, { x: anchors.spindle.x + 258, z: anchors.spindle.z - 20 });
  await sleep(1500);
  for (const [x, z, label] of spots) await place(x, z, `before-${label}`);
  writeFileSync(`${out}-report.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report).slice(0, 3000));
  await browser.close();
} finally { server.kill(); }
