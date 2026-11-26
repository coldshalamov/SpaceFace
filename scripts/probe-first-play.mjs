// probe-first-play — the first press after a fresh load must start exactly like the second.
// Boots N fresh browser profiles in a row against ONE game server (so the loopback player store
// persists between launches, as the Electron Documents drawer does for the owner), and on each:
//   1. reads the title's Swarm door (a brand-new player must not be offered a resume),
//   2. presses SWARM, samples the pilot's position from the press to a few seconds into flight,
//   3. asserts the pilot starts at the run's spawn with hostiles in view, not at (0,0).
// Read-only observer: it presses public buttons and reads window.SF, nothing else.
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-play.mjs [--launches=2] [--no-rehearsal]
// --no-rehearsal strips the worker's boot rehearsal from the init directive (diagnosis only).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { waitForPageCondition } from './lib/playwrightCspPolling.mjs';
import { launchChromium } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, waitBootOverlayGone } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const LAUNCHES = Math.max(1, Number(arg('launches', 2)) || 2);
const NO_REHEARSAL = process.argv.includes('--no-rehearsal');
const OUT = path.join(ROOT, '.devshots', 'demo', 'wave2', 'engine-first-play', NO_REHEARSAL ? 'no-rehearsal' : 'default');
// The pilot must open within this distance of the nearest hostile hull (the arena is a few
// hundred metres across; the bug put the pilot ~2.9 km from the Foundry at the origin).
const HOSTILE_IN_VIEW_WU = 900;
// Watch this long into flight: the first-play teleport landed up to ~7 s in.
const WATCH_MS = Math.max(1000, Number(arg('watch', 10000)) || 10000);

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
const report = { noRehearsal: NO_REHEARSAL, launches: [], steps: [] };
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? 'ok ' : 'XX '} ${name} — ${detail}`);
};

const readPilot = () => {
  const s = window.SF && window.SF.state;
  if (!s) return null;
  const p = s.entities && s.entities.get && s.entities.get(s.playerId);
  let ships = 0; let nearest = Infinity;
  if (p && p.pos && Array.isArray(s.entityList)) {
    for (const e of s.entityList) {
      if (!e || e.alive === false || e.type !== 'ship' || e.id === s.playerId || !e.pos) continue;
      if (e.faction === 'player' || e.team === 'player' || e.allied === true) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < HOSTILE_IN_VIEW_WU_PAGE) ships++;
      if (d < nearest) nearest = d;
    }
  }
  return {
    t: Math.round(performance.now()),
    mode: s.mode,
    phase: s.run && s.run.phase,
    wave: s.run && s.run.wave,
    playerId: s.playerId,
    pos: p && p.pos ? { x: Math.round(p.pos.x), z: Math.round(p.pos.z) } : null,
    hostilesNear: ships,
    nearestHostile: Number.isFinite(nearest) ? Math.round(nearest) : null,
  };
};

let browser = null;
try {
  for (let launch = 1; launch <= LAUNCHES; launch++) {
    const tag = `launch ${launch}`;
    // A fresh browser per launch: empty profile, cold caches, a new worker: a real first load.
    ({ browser } = await launchChromium(chromium, {
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    }));
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => step(`${tag} page error`, false, String(e.message || e).slice(0, 300)));
    await page.addInitScript(({ noRehearsal, near }) => {
      window.HOSTILE_IN_VIEW_WU_PAGE = near;
      if (!noRehearsal) return;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function patched(msg, ...rest) {
        if (msg && msg.kind === 'init' && msg.bootRehearsal === true) msg = { ...msg, bootRehearsal: false };
        return post.call(this, msg, ...rest);
      };
    }, { noRehearsal: NO_REHEARSAL, near: HOSTILE_IN_VIEW_WU });
    await bootToMenu(page, server.baseUrl, step);
    const door = await page.evaluate(() => {
      const b = document.querySelector('#screens button[data-action="swarm"]');
      return { text: b ? b.innerText.replace(/\s+/g, ' ').trim() : null, rehearsal: window.__SF_BOOT_REHEARSAL__ || null };
    });
    step(`${tag} swarm door`, !/resume/i.test(door.text || ''), `"${door.text}" · rehearsal ${door.rehearsal ? `${Math.round(door.rehearsal.ms)} ms ok=${door.rehearsal.ok}` : 'off'}`);

    await page.evaluate((src) => {
      const read = new Function(`return (${src})();`);
      window.__SF_FIRSTPLAY__ = [];
      window.__SF_FIRSTPLAY_TICK__ = setInterval(() => {
        const r = read();
        if (r) window.__SF_FIRSTPLAY__.push(r);
      }, 100);
      // Bus journal (names only) so a teleport can be lined up against what the game announced.
      window.__SF_EVLOG__ = [];
      const bus = window.SF && window.SF.bus;
      if (bus && typeof bus.emit === 'function' && !bus.__firstPlayWrapped) {
        const emit = bus.emit.bind(bus);
        bus.__firstPlayWrapped = true;
        bus.emit = (name, payload) => {
          if (window.__SF_EVLOG__.length < 20000) {
            const text = name === 'alert' && payload ? `:${payload.key || ''}:${payload.text || payload.action || ''}` : '';
            window.__SF_EVLOG__.push([Math.round(performance.now()), String(name) + text]);
          }
          return emit(name, payload);
        };
      }
      // The sim's own pilot (worker truth via the read-only probeState rpc), not the main mirror.
      window.__SF_SIMLOG__ = [];
      let busy = false;
      window.__SF_SIMLOG_TICK__ = setInterval(() => {
        if (busy || !window.SF || typeof window.SF.laneRpc !== 'function') return;
        busy = true;
        const t = Math.round(performance.now());
        Promise.resolve(window.SF.laneRpc('probeState', {})).then((reply) => {
          const r = reply && (reply.result || reply);
          const pl = r && r.player;
          const nat = pl && pl.native;
          window.__SF_SIMLOG__.push({ t, tick: r && r.tick, mode: r && r.mode, ts: r && r.timeScale,
            pos: pl && pl.pos ? [Math.round(pl.pos.x), Math.round(pl.pos.z)] : null,
            body: nat && nat.position ? [Math.round(nat.position.x), Math.round(nat.position.z)] : null,
            sleeping: nat ? nat.sleeping : null,
            fo: r && r.world && r.world.frameOrigin ? [Math.round(r.world.frameOrigin.x), Math.round(r.world.frameOrigin.z)] : null });
        }).catch(() => {}).finally(() => { busy = false; });
      }, 150);
    }, readPilot.toString());
    await page.locator('#screens button[data-action="swarm"]:visible').click({ timeout: 60_000 });
    await waitForPageCondition(page, () => window.SF?.state?.mode === 'flight' && window.SF?.state?.run?.phase === 'active',
      null, { timeout: 240_000 });
    await waitBootOverlayGone(page, 60_000).catch(() => {});
    await page.waitForTimeout(WATCH_MS);
    const samples = await page.evaluate(() => { clearInterval(window.__SF_FIRSTPLAY_TICK__); return window.__SF_FIRSTPLAY__; });
    const simlog = await page.evaluate(() => { clearInterval(window.__SF_SIMLOG_TICK__); return window.__SF_SIMLOG__ || []; });
    const evlog = await page.evaluate(() => window.__SF_EVLOG__ || []);
    await page.screenshot({ path: path.join(OUT, `launch-${launch}-flight.png`) }).catch(async () => {
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: path.join(OUT, `launch-${launch}-flight.png`) });
    });
    const flight = samples.filter((r) => r.mode === 'flight' && r.pos);
    const first = flight[0] || null;
    const last = flight[flight.length - 1] || null;
    // The largest frame-to-frame jump of the pilot while in flight (a teleport shows here).
    let jump = 0; let jumpAt = null;
    for (let i = 1; i < flight.length; i++) {
      const a = flight[i - 1].pos; const b = flight[i].pos;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > jump) { jump = d; jumpAt = [flight[i - 1].t, flight[i].t]; }
    }
    // Events (deduped runs) announced from 1.5 s before the jump to its landing sample.
    const around = [];
    if (jumpAt && jump >= 400) {
      for (const [t, name] of evlog) {
        if (t < jumpAt[0] - 1500 || t > jumpAt[1]) continue;
        const prev = around[around.length - 1];
        if (prev && prev.name === name) prev.n++; else around.push({ t, name, n: 1 });
      }
    }
    const atOrigin = (r) => r && r.pos && Math.hypot(r.pos.x, r.pos.z) < 5;
    report.launches.push({ launch, door, first, last, maxJumpPer100ms: Math.round(jump), jumpAt,
      eventsAroundJump: around.map((e) => `${e.t} ${e.name}${e.n > 1 ? ` x${e.n}` : ''}`), samples: samples.length,
      sim: simlog.map((r) => `${r.t} t${r.tick} ${r.mode} ts${r.ts} pos=${r.pos} body=${r.body} sleep=${r.sleeping} fo=${r.fo}`),
      trail: samples.map((r) => `${r.t} ${r.mode}/${r.phase} w${r.wave} p${r.playerId} ${r.pos ? `(${r.pos.x},${r.pos.z})` : "-"} near=${r.hostilesNear}/${r.nearestHostile}`) });
    step(`${tag} flight start`, !!first && !atOrigin(first),
      first ? `pilot at (${first.pos.x}, ${first.pos.z}) phase ${first.phase}, nearest hostile ${first.nearestHostile} WU` : 'no flight sample');
    step(`${tag} hostiles in view`, !!last && last.hostilesNear > 0 && !atOrigin(last),
      last ? `${WATCH_MS / 1000} s in: pilot at (${last.pos.x}, ${last.pos.z}), ${last.hostilesNear} hostiles within ${HOSTILE_IN_VIEW_WU} WU (nearest ${last.nearestHostile})` : 'no sample');
    step(`${tag} no teleport`, jump < 400, `largest 100 ms move ${Math.round(jump)} WU`);
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    browser = null;
  }
} catch (err) {
  step('route error', false, String(err && err.message || err).slice(0, 400));
  report.error = String(err && err.stack || err);
} finally {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = report.steps.filter((s) => s.ok === false);
console.log(failed.length ? `FAIL ${failed.length} step(s)` : 'PASS — every first press starts in the fight');
process.exit(failed.length ? 1 : 0);
