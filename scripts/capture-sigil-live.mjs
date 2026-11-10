// The selection sigil on the LIVE game route.
//
// The lab proves the instrument renders; this proves it is wired. It boots the real game, launches
// into flight, marks a real contact through the real player selection field, and screenshots the
// live picture so the mark can be judged in the actual chase camera with the actual post pipeline,
// HUD and sky. No fixture and no render-side injection: if the sigil is not in the real frame,
// this finds nothing.
//   node scripts/capture-sigil-live.mjs [--out=.devshots/sigil-live]
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
const OUT = ROOT + (args.out || '.devshots/sigil-live') + '/';
mkdirSync(OUT, { recursive: true });

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling'],
});

const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });

  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New Game')), null, { timeout: 120000 });
  const click = (label) => page.evaluate((wanted) => {
    const live = [...document.querySelectorAll('button')].filter((x) => x.getClientRects().length && !x.disabled);
    const b = live.find((x) => x.textContent.trim() === wanted) || live.find((x) => x.textContent.includes(wanted));
    if (!b) return false;
    b.click();
    return true;
  }, label);
  await click('New Game');
  await page.waitForTimeout(600);
  await click('Launch');
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && !!s.entities?.get(s.playerId) && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 300000 });

  // SwiftShader never finishes the post-opening GPU admission, so every non-opening body would stay
  // a resolving marker. Release it, then take the hardware picture: full res and the shipping post.
  await page.evaluate(async () => {
    const lib = await import('/src/render/partsLibrary.js');
    lib.resumeAuthoredUpgradeQueueAfterOpening(window.SF.state.render.scene);
    const r = window.SF.registry?.get?.('render');
    try { r._adaptive?.setEnabled(false); } catch (_) {}
    window.SF.state.render.dynResScale = 1;
    try { r._applySize(); } catch (_) {}
    try { r.bloom?.setOptions({ bloom: true }); } catch (_) {}
  });

  // Mark a real contact the way the player does: through the live selection field.
  const marked = await page.evaluate(() => {
    const s = window.SF.state;
    const p = s.entities.get(s.playerId);
    if (!p) return 'no player';
    let best = null;
    let bestD = Infinity;
    for (const e of s.entities.values()) {
      if (!e || e.id === s.playerId || e.alive === false || !e.pos) continue;
      if (e.type !== 'ship' && e.type !== 'drone' && e.type !== 'asteroid') continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return 'no contact to mark';
    // A pirate hull, so the live picture shows the hostile emblem and not the friendly rosette.
    best.data = best.data || {};
    best.data.ai = Object.assign({}, best.data.ai, { huntPlayer: true });
    // Park it ahead of the player, inside the chase camera's frame.
    best.pos.x = p.pos.x + 62;
    best.pos.z = p.pos.z + 10;
    best.vel = best.vel || { x: 0, z: 0 };
    best.vel.x = 0;
    best.vel.z = 0;
    s.player.targetId = best.id;
    s.player.gunTargetId = best.id;
    const sigil = (window.SF.registry?.get?.('vfx') || window.SF.vfx)?._selectionSigil;
    return { markedId: best.id, type: best.type, radius: best.radius, wired: !!sigil, inspect: sigil ? sigil.inspect() : null };
  });
  console.log('marked:', JSON.stringify(marked));
  if (!marked || typeof marked !== 'object' || !marked.wired) {
    failures.push(`the live route presented no marked subject: ${JSON.stringify(marked)}`);
  }

  // The game runs its own loop, so the instrument animates on its own. Sample it as it lives.
  for (const at of [0.5, 2.0, 6.0, 18.0]) {
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const sigil = (window.SF.registry?.get?.('vfx') || window.SF.vfx)?._selectionSigil;
      if (!sigil || !sigil.mesh) return null;
      return {
        ...sigil.inspect(),
        phase: +sigil.mesh.material.uniforms.uPhase.value.toFixed(3),
        age: +sigil.mesh.material.uniforms.uAge.value.toFixed(2),
        primary: '#' + sigil.mesh.material.uniforms.uPrimary.value.getHexString(),
        renderOrder: sigil.mesh.renderOrder,
        inScene: !!sigil.mesh.parent,
      };
    });
    await page.screenshot({ path: `${OUT}live_t${String(at).replace('.', 'p')}s.png` });
    console.log(`live ~${at}s ${JSON.stringify(state)}`);
    if (!state || !state.visible) failures.push(`~${at}s: the sigil is not visible on the live route`);
  }
  if (errors.length) failures.push(`page errors: ${errors.slice(0, 4).join(' | ')}`);
  console.log(`\nwrote live frames to ${OUT}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('selection sigil live capture OK');
