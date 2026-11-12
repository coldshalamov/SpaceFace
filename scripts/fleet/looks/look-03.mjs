// LOOK-03 diagnostic, extended from throw.mjs. Logs projected bodies/materials and bright regions
// for every saved frame. Screenshot and observer sample are adjacent, not a frozen simulation pair.
// Start a Swarm round, latch the nearest light enemy with the Line (tap RMB on
// it), swing by flying an arc, press RMB again to release toward the pack, and photograph a strip of
// frames from latch to two seconds after release. Also records what the game itself reports: latches,
// throws, kills and their causes. A throw during the latch press is reported separately.
// This looks at the throw, camera beats, chain/kill callouts, drops and crush/applause credit.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/look-03.mjs [outPrefix] [round]
//
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { brightRegions, bodiesUnderRegion } from './look-03-pixels.mjs';

const PORT = 8173;
let browser = null;
const out = process.argv[2] || '.devshots/fleet/looks/throw/run';
const round = Number(process.argv[3] || 2);
mkdirSync(dirname(out), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
// A lock waiter may wait 45 minutes; the actual browser job stays below the five-minute limit.
const watchdog = setTimeout(() => { console.error('LOOK-03 exceeded 285 seconds; closing browser');
  if (browser) void browser.close(); server.kill(); }, 285_000);

try {
  await sleep(2500);
  browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/?swarmRound=${round}`, { waitUntil: 'commit', timeout: 90_000 });

  // Reach the fight: answer first-run prompt, launch the round from the armory, wait for live hostiles.
  const t0 = Date.now();
  let live = 0;
  while (Date.now() - t0 < 220_000) {
    const ok = page.locator('.sf-confirm__ok');
    if (await ok.first().isVisible().catch(() => false)) await ok.first().click().catch(() => {});
    const launch = page.getByText(/Launch round/i).first();
    if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
    live = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s || s.mode !== 'flight') return 0;
      return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
    }).catch(() => 0);
    if (live >= 3) break;
    await sleep(1500);
  }
  console.log(`fight live: ${live} hostiles after ${Math.round((Date.now() - t0) / 1000)} s`);
  if (live < 3) throw new Error('Swarm fight did not become live within 220 seconds');
  await page.evaluate(async () => {
    window.__look03Three = await import('/vendor/three.module.js');
    const { createWorldObjectPicker } = await import('/src/render/worldObjectPicking.js');
    window.__look03Picker = createWorldObjectPicker({ state: window.SF.state,
      getViewport: () => ({ width: innerWidth, height: innerHeight }) });
  });

  // Listen to what the game reports.
  await page.evaluate(() => {
    const log = (window.__throwLog = []);
    const bus = window.SF && window.SF.bus;
    const sim = () => (window.SF && window.SF.state && window.SF.state.simTime) || 0;
    for (const ev of ['tether:latched', 'massline:throw', 'massline:selfSling', 'entity:killed', 'combat:collisionConsequence', 'tether:cut', 'swarm:drop:spawned', 'pickup:collected']) {
      bus && bus.on && bus.on(ev, (p) => {
        const s = window.SF && window.SF.state;
        const imp = p && p.impactorId != null && s && s.entities && s.entities.get(p.impactorId);
        log.push({ ev, t: +sim().toFixed(2), id: p && (p.id ?? p.payloadId ?? p.victimId), cause: p && (p.cause || p.source || (p.impactorId != null ? 'impactor' : undefined)), killer: p && p.killerId, type: p && p.type,
          impactor: imp ? `${imp.type}:${(imp.data && (imp.data.freight ? 'freight' : imp.data.shipClass || imp.data.kind)) || imp.defId || ''}` : (p && p.impactorId != null ? `gone:${p.impactorId}` : undefined),
          pos: p && p.pos ? [Math.round(p.pos.x), Math.round(p.pos.z)] : undefined });
      });
    }
  });

  await page.mouse.click(640, 360); // focus the canvas
  // The nearest LIGHT hostile that is on screen (inside the HUD-free middle of the frame).
  let pick = null;
  for (let tries = 0; tries < 40 && !pick; tries++) {
    pick = await page.evaluate(() => {
      const s = window.SF.state; const h = window.SF.helpers;
      const me = s.entities.get(s.playerId);
      const cands = [];
      for (const e of s.entityList || []) {
        if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
        if (Number.isFinite(e.mass) && e.mass > 32) continue;
        const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
        if (!scr || !scr.onScreen || scr.x < 300 || scr.x > 980 || scr.y < 140 || scr.y > 600) continue;
        cands.push({ id: e.id, mass: e.mass, dist: Math.round(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)), scr });
      }
      cands.sort((a, b) => a.dist - b.dist);
      return cands[0] || null;
    });
    if (!pick) await sleep(500);
  }
  if (!pick) { console.log('no light hostile on screen to latch'); }
  const frames = [];
  const samples = [];
  const shot = async (label) => { const p = `${out}-${String(frames.length).padStart(2, '0')}-${label}.png`; const sample = await page.evaluate(() => {
      const s = window.SF.state;
      const meshes = s.render.meshes;
      const hovered = s.render.scene?.getObjectByName('worldObjectHover');
      const { Box3, Vector3 } = window.__look03Three;
      const boundsOf = (root) => {
        if (!root) return null;
        const box = new Box3().setFromObject(root);
        if (box.isEmpty()) return null;
        const points = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const p = new Vector3(x, y, z).project(s.render.camera);
          points.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
        }
        return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
          top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
      };
      const materialInfo = (m) => ({ name: m.name, uuid: m.uuid, type: m.type,
        color: m.color?.getHexString(), emissive: m.emissive?.getHexString(),
        emissiveIntensity: m.emissiveIntensity, roughness: m.roughness, metalness: m.metalness,
        map: m.map?.source?.data?.src || m.map?.name || null,
        userData: { role: m.userData?.spacefaceSharedMaterialRole,
          bareRock: m.userData?.spacefaceBareRock, familylessRock: m.userData?.spacefaceFamilylessRock,
          illustrated: m.userData?.spacefaceIllustratedSurface } });
      const entities = (s.entityList || []).filter(e => e.alive !== false &&
        (e.type === 'asteroid' || e.type === 'ship' || e.radius > 8
          || e.id === s.player?.targetId || e.id === s.player?.tether?.targetId)).map(e => {
        const root = meshes?.get(e.id) || e.mesh;
        const leaves = [];
        root?.traverse(n => { if (n.material) leaves.push({ name: n.name, visible: n.visible,
          userData: { adopted: n.userData?.asteroidInstanceAdopted, poolLeafVisible: n.userData?.poolLeafVisible },
          material: (Array.isArray(n.material) ? n.material : [n.material]).map(materialInfo) }); });
        return { id: e.id, type: e.type, defId: e.defId ?? null, typeId: e.data?.typeId ?? null,
          data: e.data, radius: e.radius, bounds: boundsOf(root),
          screen: window.SF.helpers.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {}), leaves };
      });
      const hoverRoot = s.render.worldObjectHover?.subject;
      const hoverEntity = (s.entityList || []).find(e => (meshes?.get(e.id) || e.mesh) === hoverRoot);
      const pointer = s.input?.pointerScreen;
      const aimed = pointer && window.__look03Picker.pick(pointer.x, pointer.y);
      const aimedBody = aimed ? { id: aimed.entity.id, type: aimed.entity.type, defId: aimed.entity.defId ?? null,
        typeId: aimed.entity.data?.typeId ?? null,
        material: (Array.isArray(aimed.leaf.material) ? aimed.leaf.material : [aimed.leaf.material]).map(materialInfo) } : null;
      return { hoveredId: hoverEntity?.id, hoveredType: hoverEntity?.type, hoveredDefId: hoverEntity?.defId,
        aimedBody,
        hoveredMaterials: entities.find(e => e.id === hoverEntity?.id)?.leaves,
        simTime: s.simTime, tag: document.querySelector('.sf-aimtag')?.textContent,
        tagVisible: document.querySelector('.sf-aimtag')?.classList.contains('visible'),
        selectedId: s.player?.targetId, tetherTargetId: s.player?.tether?.targetId,
        pointer: pointer ? { x: pointer.x, y: pointer.y, active: pointer.active } : null,
        aim: s.input?.aimWorld, hoveredVisible: hovered?.visible, entities };
    });
    const png = await page.screenshot({ path: p });
    const regions = brightRegions(png).map(region => ({ ...region, candidates: bodiesUnderRegion(region, sample.entities) }));
    const hits = await page.evaluate(points => points.map(point => {
      const hit = window.__look03Picker.pick(point.x, point.y);
      return hit ? { id: hit.entity.id, type: hit.entity.type, defId: hit.entity.defId ?? null,
        typeId: hit.entity.data?.typeId ?? null,
        leaf: hit.leaf.name, material: (Array.isArray(hit.leaf.material) ? hit.leaf.material : [hit.leaf.material])
          .map(m => ({ name: m.name, uuid: m.uuid, type: m.type })) } : null;
    }), regions.map(r => r.sample));
    regions.forEach((region, i) => { region.bodyAtSample = hits[i]; });
    samples.push({ frame: p, ...sample, regions });
    writeFileSync(`${out}-materials.json`, JSON.stringify(samples, null, 2));
    console.log('frame', JSON.stringify({ frame: p, simTime: sample.simTime, tag: sample.tag,
      hoveredId: sample.hoveredId, hoveredType: sample.hoveredType, hoveredDefId: sample.hoveredDefId,
      aimedBody: sample.aimedBody, hoveredMaterials: sample.hoveredMaterials, tagVisible: sample.tagVisible,
      selectedId: sample.selectedId, tetherTargetId: sample.tetherTargetId,
      regions: regions.map(r => ({ pixels: r.pixels, meanLuma: r.meanLuma, bounds: r.bounds, bodyAtSample: r.bodyAtSample,
        candidates: r.candidates.map(e => ({ id: e.id, type: e.type, defId: e.defId,
          materials: e.leaves.flatMap(l => l.material) })) })) }));
    frames.push(p); };
  const latchedCount = () => page.evaluate(() => (window.__throwLog || []).filter((e) => e.ev === 'tether:latched').length);

  // Latch: a real press (down, ~120 ms, up) on the target; confirm the game reports the latch, else re-pick.
  let latched = false;
  for (let attempt = 0; attempt < 4 && pick && !latched; attempt++) {
    console.log('target', JSON.stringify(pick));
    await page.mouse.move(pick.scr.x, pick.scr.y, { steps: 3 });
    await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
    for (let i = 0; i < 10 && !latched; i++) { await sleep(150); latched = (await latchedCount()) > 0; }
    if (!latched) {
      console.log('no latch on attempt', attempt + 1);
      pick = await page.evaluate(() => {
        const s = window.SF.state; const h = window.SF.helpers; const me = s.entities.get(s.playerId);
        const c = [];
        for (const e of s.entityList || []) {
          if (!e || e.alive === false || e.type !== 'ship' || e.isPlayer || e.team === 0) continue;
          if (Number.isFinite(e.mass) && e.mass > 32) continue;
          const scr = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
          if (!scr || !scr.onScreen || scr.x < 300 || scr.x > 980 || scr.y < 140 || scr.y > 600) continue;
          c.push({ id: e.id, mass: e.mass, dist: Math.round(Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)), scr });
        }
        c.sort((a, b) => a.dist - b.dist); return c[0] || null;
      });
    }
  }
  console.log(latched ? 'LATCHED' : 'never latched — the swing below is only flight');
  const throwsBeforeSwing = await page.evaluate(() =>
    (window.__throwLog || []).filter((e) => e.ev === 'massline:throw').length);
  if (throwsBeforeSwing) console.log(`premature throws before swing: ${throwsBeforeSwing}`);
  await shot('latch');
  // Swing: an arc — thrust and turn, aim sweeping around.
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
  for (let i = 0; i < 6; i++) { await page.mouse.move(640 + 260 * Math.cos(i * 0.6), 360 + 200 * Math.sin(i * 0.6), { steps: 2 }); await sleep(200); if (i % 2 === 0) await shot('swing'); }
  await page.keyboard.up('KeyD');
  // Release toward the densest hostile cluster with a fresh RMB press.
  const aim = await page.evaluate(() => {
    const s = window.SF.state; const h = window.SF.helpers;
    const hs = (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0);
    if (!hs.length) return null;
    const c = hs.reduce((a, e) => ({ x: a.x + e.pos.x / hs.length, z: a.z + e.pos.z / hs.length }), { x: 0, z: 0 });
    return h.worldToScreen({ x: c.x, y: 0, z: c.z }, {});
  });
  const releaseAt = await page.evaluate(() => window.SF.state.simTime);
  await page.mouse.move(aim && Number.isFinite(aim.x) ? aim.x : 640, aim && Number.isFinite(aim.y) ? aim.y : 200, { steps: 2 });
  await page.mouse.down({ button: 'right' }); await sleep(120); await page.mouse.up({ button: 'right' });
  await page.keyboard.up('KeyW');
  for (let i = 0; i < 6; i++) await shot('release');      // back to back: the release beat
  for (let i = 0; i < 6; i++) { await sleep(300); await shot('after'); }

  const log = await page.evaluate(() => window.__throwLog || []);
  writeFileSync(`${out}-events.json`, JSON.stringify(log, null, 2));
  const count = (ev) => log.filter((e) => e.ev === ev).length;
  const kills = log.filter((e) => e.ev === 'entity:killed');
  console.log(`events: latched ${count('tether:latched')} · throws ${count('massline:throw')} · self-slings ${count('massline:selfSling')} · cuts ${count('tether:cut')} · kills ${kills.length} (${kills.map((k) => k.cause || '?').join(', ')}) · drops ${count('swarm:drop:spawned')}`);
  console.log(`throws after the release input: ${log.filter((e) => e.ev === 'massline:throw' && e.t + .005 >= releaseAt).length}`);
  console.log(`frames: ${frames.length} → ${out}-NN-*.png`);
  await browser.close();
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
