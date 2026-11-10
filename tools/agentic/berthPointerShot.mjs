// On-glass evidence for SR-01's earned berth pointer (PR #302 review):
// drive the real game to the Helios B5 berth in a rendered browser, then catch
// the one-voice floor pill while it shows
//   A) "The board's holding work that fits."  (choice:sold followup — no offer in reach)
//   B) "Your credits cover the yard's <module>."  (earned rack pointer — offer in reach)
//
// Public/real path used: menu → New Game → Launch (routes.mjs public controls),
// physics-emitted dock:range, the E dock key, the market's own ui:sell seam
// (economy.handleTrade → economy:tradeCompleted), and the contract-payout event
// economy:grantCredits (the real credit writer). The voice line renders through
// tutorial:say → voiceArbiter → #alerts .sf-alert--floor — no DOM fixture.
//
// Documented skip-ahead/dev hooks (allowed by the review):
//   1. state.onboarding.currentBeat = 10 — rail treated as complete through B3;
//      the real dock:docked then finishes B4 and opens B5 exactly as a live rail does.
//   2. Player entity teleported onto the resolved berth anchor (import of the
//      production dockRange/manifest modules), velocity zeroed — replaces flying there.
//   3. economy.chargeCredits(amount, 'onglass_debug') — the sole credit writer,
//      to hold the post-sale total under Veil Step's 4,200 offer for shot A.
//   4. cargo.addCargo('cmdty_ore_iron', qty) — the sole cargo writer, so the
//      ui:sell sale has real units to settle.
//
// Usage: node tools/agentic/berthPointerShot.mjs [--out=<dir>]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBenchServer } from '../../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../../scripts/lib/load-playwright.mjs';
import { launchChromium } from '../../scripts/player-truth/browser.mjs';
import { bootToMenu, adventureToFlight } from '../../scripts/player-truth/routes.mjs';

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i > 0 ? process.argv[i + 1] : '/workspace/orchestra/state/redline/302/onglass';
})();
const DOCK_BEAT_INDEX = 10; // BEATS[..] 'dock' → next real dock:docked opens 'choice' (B5)

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
const { browser } = await launchChromium(chromium, {
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const log = (...a) => console.log('[onglass]', ...a);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => log('pageerror:', String(e).slice(0, 200)));
  await bootToMenu(page, server.baseUrl, (name, ok, detail) => log(`step ${name} ${ok ? 'ok' : 'FAIL'} ${detail || ''}`));
  await adventureToFlight(page, (name, ok, detail) => log(`step ${name} ${ok ? 'ok' : 'FAIL'} ${detail || ''}`));

  // ── Skip-ahead 1+2: rail at the dock beat; player on the resolved berth anchor ──
  const berth = await page.evaluate(async (dockBeatIndex) => {
    const SF = window.SF;
    const ob = SF.state.onboarding;
    if (!ob) return { err: 'no onboarding state' };
    ob.currentBeat = dockBeatIndex;
    const player = SF.state.entities.get(SF.state.playerId);
    const station = (SF.state.entityList || []).find((e) => e && e.type === 'station' && e.data && e.data.stationId === 'station_helios' && e.alive !== false);
    if (!station || !player) return { err: 'station/player missing', station: !!station, player: !!player };
    const { resolveCollisionProxyManifest, resolveDockAnchor } = await import('/src/data/collisionProxyManifests.js');
    const manifest = resolveCollisionProxyManifest(station);
    const anchor = manifest && manifest.docking ? resolveDockAnchor(station, manifest, player) : null;
    const px = anchor ? anchor.x : station.pos.x + (station.radius || 80) + 40;
    const pz = anchor ? anchor.z : station.pos.z;
    player.pos.x = px; player.pos.z = pz;
    player.vel.x = 0; player.vel.z = 0;
    return { stationId: 'station_helios', anchor: !!anchor, px, pz, dockRadius: anchor && anchor.dockRadius, speedGate: anchor && anchor.speedGate, beat: ob.currentBeat };
  }, DOCK_BEAT_INDEX);
  log('berth hook:', JSON.stringify(berth));
  if (berth.err) throw new Error('berth hook failed: ' + JSON.stringify(berth));

  // physics publishes dock:range → press the real dock key
  await page.waitForFunction(() => window.SF.state.ui && window.SF.state.ui.dockInRange === true, null, { timeout: 30000 });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.SF.state.ui && window.SF.state.ui.docked === true, null, { timeout: 30000 });
  const afterDock = await page.evaluate(() => ({ beat: window.SF.state.onboarding.currentBeat, credits: window.SF.state.player.credits, station: window.SF.state.ui.dockedStationId }));
  log('docked:', JSON.stringify(afterDock));

  const floorText = () => page.evaluate(() => {
    const el = document.querySelector('#alerts .sf-alert--floor .sf-alert__text');
    return el ? el.textContent.trim() : null;
  });
  const shootFloor = async (want, file) => {
    const t0 = Date.now();
    let got = null;
    while (Date.now() - t0 < 8000) {
      got = await floorText();
      if (got && got.includes(want)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    log(`floor (${want}):`, JSON.stringify(got));
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, file) });
    if (!got || !got.includes(want)) throw new Error(`floor never showed "${want}" (saw "${got}")`);
    return got;
  };

  // ── Shot A: board line — hold the post-sale total under every verb-fit offer ──
  const preA = await page.evaluate(async () => {
    const SF = window.SF;
    SF.bus.emit('economy:chargeCredits', { amount: 1100, reason: 'onglass_debug' }); // hook 3 — sole credit writer
    const { addCargo } = await import('/src/systems/cargo.js');                       // hook 4 — sole cargo writer
    addCargo(SF.state, 'cmdty_ore_iron', 3);
    return { credits: SF.state.player.credits, ore: SF.state.player.cargo && SF.state.player.cargo.items && SF.state.player.cargo.items.cmdty_ore_iron };
  });
  log('pre-A:', JSON.stringify(preA));
  await page.evaluate(() => window.SF.bus.emit('ui:sell', { commodityId: 'cmdty_ore_iron', qty: 3 }));
  const shotA = await shootFloor('holding work', 'onglass-board-line.png');
  const postA = await page.evaluate(() => ({ credits: window.SF.state.player.credits }));
  log('post-A credits:', JSON.stringify(postA));

  // ── Shot B: earned line — a contract payout leaves a verb-fit in reach ──
  await page.evaluate(() => window.SF.bus.emit('economy:grantCredits', { amount: 1400, reason: 'contract_payout' }));
  const shotB = await shootFloor('credits cover', 'onglass-earned-line.png');
  const postB = await page.evaluate(() => ({ credits: window.SF.state.player.credits, fitOffer: window.SF.state.player.hints && window.SF.state.player.hints.fitOffer }));
  log('post-B:', JSON.stringify(postB));

  console.log(JSON.stringify({ ok: true, shotA, shotB, berth, afterDock, postA, postB }));
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
