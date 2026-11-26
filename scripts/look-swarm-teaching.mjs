// look-swarm-teaching — DEMO-SWARM-TUTOR-1 looked at on the real screen.
//
// Boots a fresh profile to the title, presses SWARM (one press to the fight), and samples the
// teaching lane from the first frame of control: which cards are on the glass, how many at once,
// where they sit, and when they retire. Then dies and presses Again to prove the second round
// does not re-teach the codex or power cards.
//
//   node scripts/look-swarm-teaching.mjs
//   (through the lock: node scripts/fleet/game-lock.mjs run -- node scripts/look-swarm-teaching.mjs)
//
// Read-only observer: presses public buttons, watches window.SF and the DOM, writes PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { waitForPageCondition } from './lib/playwrightCspPolling.mjs';
import { launchChromium } from './player-truth/browser.mjs';
import { startBenchServer } from './lib/benchServer.mjs';
import { bootToMenu, waitBootOverlayGone } from './player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.devshots', 'swarm', 'teaching', String(Date.now()));

const server = await startBenchServer();
const { chromium } = await loadPlaywright();
let browser = null;
const report = { steps: [], samples: [] };
const writeReport = () => {
  try { mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8'); } catch { /* best effort */ }
};
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? 'ok ' : 'XX '} ${name} — ${detail}`);
};

// What the teaching lane is drawing right now: every live .sf-teach node, its words and its box.
const readLane = () => {
  const visible = (el) => {
    if (!el || el.hidden) return false;
    if (el.classList && el.classList.contains('sf-teach--out')) return false; // retiring ghost
    let self = true;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      // The element's own opacity is the entrance/exit transition only — cosmetic. Ancestor
      // opacity is real: a card in a faded-out subtree is genuinely invisible.
      if (!self && Number(cs.opacity || 1) <= 0.01) return false;
      self = false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  return {
    cards: [...document.querySelectorAll('.sf-teach')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: String(el.innerText || '').replace(/\n{2,}/g, '\n').trim(),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        onGlass: visible(el),
        cls: el.className,
        chain: (() => {
          const out = [];
          for (let n = el; n && n.nodeType === 1 && out.length < 8; n = n.parentElement) {
            const cs = getComputedStyle(n);
            out.push((n.id ? '#' + n.id : (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : n.tagName)) +
              ':' + cs.display.slice(0, 4) + '/' + cs.visibility.slice(0, 4) + '/o' + String(cs.opacity || '1').slice(0, 4));
          }
          return out;
        })(),
      };
    }),
    // The other two teachers that used to draw on their own seats, so a regression names itself.
    castStrip: !!document.querySelector('.sf-swhud__cast:not([hidden])'),
    powerCaption: !!document.querySelector('.orr-visor__caption:not([hidden])'),
    speechPill: (() => {
      const el = document.querySelector('#alerts .sf-alert--floor');
      return el && getComputedStyle(el).visibility !== 'hidden'
        ? String(el.innerText || '').trim().slice(0, 160) : '';
    })(),
    simTime: Number(window.SF?.state?.simTime) || 0,
    wave: window.SF?.state?.run?.wave ?? null,
    phase: window.SF?.state?.run?.phase ?? null,
    bootOverlay: (() => {
      const el = document.getElementById('boot-overlay');
      if (!el) return 'absent';
      const cs = getComputedStyle(el);
      return cs.display === 'none' ? 'hidden' : `visible:${Math.round(cs.opacity ? Number(cs.opacity) * 100 : 100)}%`;
    })(),
    lane: typeof window.__sfTeachLane === 'function' ? window.__sfTeachLane() : null,
    events: (window.__teachProbeEvents || []).slice(-6),
  };
};

async function sample(page, label, { shot = true } = {}) {
  const lane = await page.evaluate(readLane).catch(() => null);
  if (!lane) return null;
  report.samples.push({ label, ...lane });
  console.log(`   ${label}: ${lane.cards.length} card(s)` +
    (lane.cards.length ? ` — ${lane.cards.map((c) => `"${c.text.split('\n')[0]}"`).join(' | ')}` : '') +
    ` · castStrip=${lane.castStrip} · powerCaption=${lane.powerCaption}` +
    (lane.speechPill ? ` · pill="${lane.speechPill}"` : ''));
  if (shot) await page.screenshot({ path: path.join(OUT, `${label}.png`) }).catch(() => {});
  return lane;
}

try {
  ({ browser } = await launchChromium(chromium, {
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  }));
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => step('page error', false, String(e.message || e).slice(0, 300)));
  await bootToMenu(page, server.baseUrl, step);
  step('title', true, 'main menu visible');

  await page.locator('#screens button[data-action="swarm"]:visible').click({ timeout: 60_000 });
  await page.evaluate(() => {
    try { window.SF.bus.emit('debug:invulnerable', { on: true }); } catch { /* dev only */ }
  }).catch(() => {});

  // Observer trace: wrap the bus emit (call-through, never swallowing) so the report can separate
  // "the wave never offered a card" from "offered but never seated" — the two failure shapes a
  // card count alone cannot tell apart.
  await page.evaluate(() => {
    const bus = window.SF && window.SF.bus;
    if (!bus || bus.__teachProbeWrapped) return;
    bus.__teachProbeWrapped = true;
    window.__teachProbeEvents = [];
    const orig = bus.emit.bind(bus);
    const WATCH = /^(swarm:teach|encounter:castAnnounced|game:new|run:started|ui:loadingHidden|tether:latched)/;
    bus.emit = (name, payload) => {
      if (WATCH.test(String(name))) {
        try {
          window.__teachProbeEvents.push({
            t: Math.round(performance.now()), name,
            detail: name === 'encounter:castAnnounced' ? `wave=${payload && payload.wave} line="${String(payload && payload.line || '').slice(0, 50)}"`
              : name === 'swarm:teach' ? `id=${payload && payload.id}`
              : '',
          });
        } catch { /* observer only */ }
      }
      return orig(name, payload);
    };
  }).catch(() => {});

  // Sample from the click onward: the teaching cards live ~6 s each and the round reaches control
  // while the boot veil is still lifting, so waiting for "flight mode" first would miss them all.
  // The window must outlast the LOAD, not just the cards: on a shared headless host the round-1
  // scene build alone has measured past 90 s (round1-after.png caught "89% — step 17" after the
  // old 90 s window closed), and a wave that has not started cannot offer a single card.
  const clickedAt = Date.now();
  const seen = [];
  let controlAt = null;
  let veilDownAt = null;
  let veilSeenUp = false;
  let lastRecordAt = 0;
  const ROUND1_CAP_MS = 300_000;
  while (Date.now() - clickedAt < ROUND1_CAP_MS) {
    const lane = await page.evaluate(readLane).catch(() => null);
    if (lane) {
      if (controlAt == null && lane.phase === 'active') controlAt = Date.now();
      const label = `t${String(Math.round((Date.now() - clickedAt) / 100) / 10).replace('.', 'p')}`;
      const cardsKey = lane.cards.filter((c) => c.onGlass).map((c) => c.text.split('\n')[0]).join('|');
      const prev = seen[seen.length - 1];
      const prevKey = prev ? prev.cards.filter((c) => c.onGlass).map((c) => c.text.split('\n')[0]).join('|') : null;
      // Record every change plus a wall-clock periodic heartbeat (never a count-based one — a long
      // quiet load otherwise compresses to a single sample and the evidence goes blind).
      if (cardsKey !== prevKey || Date.now() - lastRecordAt > 4_000) {
        lastRecordAt = Date.now();
        seen.push({ label, ...lane });
        report.samples.push({ label, ...lane });
        const onGlass = lane.cards.filter((c) => c.onGlass);
        console.log(`   ${label}: phase=${lane.phase} wave=${lane.wave} · ${onGlass.length} on glass`
          + ` (${lane.cards.length} node(s))` +
          (onGlass.length ? ` — ${onGlass.map((c) => `"${c.text.split('\n')[0]}" @${c.x},${c.y}`).join(' | ')}` : '') +
          ` · castStrip=${lane.castStrip} · powerCaption=${lane.powerCaption} · veil=${lane.bootOverlay}` +
          (lane.lane ? ` · lane[v=${lane.lane.visible || "-"} q=${(lane.lane.queued || []).length}]` : '') +
          (lane.events && lane.events.length ? ` · ev=[${lane.events.map((e) => `${e.name}@${e.t}`).join(',')}]` : ''));
        writeReport();
        if (onGlass.length || (lane.lane && lane.lane.visible)) await page.screenshot({ path: path.join(OUT, `${label}.png`) }).catch(() => {});
      }
      // Stop a little after the last card has gone and nothing new is arriving.
      const sawCard = seen.some((s) => s.cards.some((c) => c.onGlass));
      if (sawCard && !lane.cards.some((c) => c.onGlass) && controlAt != null && Date.now() - controlAt > 20_000) break;
      // Or stop when a live round has run long enough for the brief and the first-sighting card to
      // have both lived their reads — silence past that is a verdict, not a wait.
      if (typeof lane.bootOverlay === 'string' && lane.bootOverlay.startsWith('visible')) {
        veilSeenUp = true;
        veilDownAt = null;
      }
      const veilDownNow = lane.bootOverlay === 'hidden' || lane.bootOverlay === 'absent';
      if (veilDownNow && veilSeenUp && veilDownAt == null) veilDownAt = Date.now();
      if (!sawCard && veilDownAt != null && Date.now() - veilDownAt > 45_000) break;
    }
    await page.waitForTimeout(140);
  }
  await page.screenshot({ path: path.join(OUT, 'round1-after.png') }).catch(() => {});
  step('round 1 live', true, controlAt ? `${((controlAt - clickedAt) / 1000).toFixed(1)} s to a live round` : 'sampled');

  const maxAtOnce = Math.max(0, ...seen.map((s) => s.cards.filter((c) => c.onGlass).length));
  const distinct = new Set(seen.flatMap((s) => s.cards.filter((c) => c.onGlass).map((c) => c.text.split('\n')[0])));
  step('one card at a time', maxAtOnce <= 1, `most cards on the glass at once: ${maxAtOnce}`);
  step('a teaching card appears at round start', (seen.some((s) => s.cards.some((c) => c.onGlass))),
    `cards seen: ${[...distinct].join(' | ') || '(none)'}`);
  step('the codex strip does not draw in Swarm', !seen.some((s) => s.castStrip),
    'top-left cast strip stayed hidden');
  step('the power caption does not draw in Swarm', !seen.some((s) => s.powerCaption),
    'power-bar caption stayed hidden');
  // Every card sits in the left margin (never over the centre of the fight).
  const offMargin = seen.flatMap((s) => s.cards).filter((c) => c.onGlass && (c.x > 480 || c.x < 0));
  step('cards stay in the margin', offMargin.length === 0,
    offMargin.length ? `${offMargin.length} card(s) outside the left margin` : 'all cards within x < 480');
  // The lane drains: after ~7 s of control nothing teaching should be left on the glass.
  const tail = seen[seen.length - 1];
  const tailOnGlass = tail ? tail.cards.filter((c) => c.onGlass) : [];
  step('cards retire on their own', tailOnGlass.length === 0,
    tailOnGlass.length ? `still up: "${tailOnGlass[0].text.split('\n')[0]}"` : 'lane empty at the last sample');

  // ── Again: die, then take Run Over's Again and check the second round.
  await page.evaluate(() => {
    try { window.SF.bus.emit('debug:invulnerable', { on: false }); } catch { /* dev only */ }
  }).catch(() => {});
  const died = await waitForPageCondition(page,
    () => window.SF?.state?.run?.phase === 'ended' || window.SF?.state?.run?.phase === 'inactive',
    null, { timeout: 240_000 }).then(() => true).catch(() => false);
  if (died) {
    step('run ended', true, 'Run Over reached');
    await page.waitForTimeout(1500);
    const again = page.locator('.sf-runover [data-action="again"]:visible').first();
    if (await again.count()) {
      await again.click({ timeout: 20_000 }).catch(() => {});
      // Same rule as round 1: sample from the press, not from "flight mode" — the cards live ~6 s
      // and the second round reaches control before the veil has fully lifted.
      const againAt = Date.now();
      const againSeen = [];
      let againRecordAt = 0;
      let againActiveAt = null;
      let againVeilDownAt = null;
          let againVeilSeenUp = false;
      while (Date.now() - againAt < 240_000) {
        const lane = await page.evaluate(readLane).catch(() => null);
        if (lane) {
          if (againActiveAt == null && lane.phase === 'active') againActiveAt = Date.now();
          const onGlass = lane.cards.filter((c) => c.onGlass);
          const key = onGlass.map((c) => c.text.split('\n')[0]).join('|');
          const prev = againSeen[againSeen.length - 1];
          const prevKey = prev ? prev.cards.filter((c) => c.onGlass).map((c) => c.text.split('\n')[0]).join('|') : null;
          if (key !== prevKey || Date.now() - againRecordAt > 4_000) {
            againRecordAt = Date.now();
            const label = `again-t${String(Math.round((Date.now() - againAt) / 100) / 10).replace('.', 'p')}`;
            againSeen.push({ label, ...lane });
            report.samples.push({ label, ...lane });
            console.log(`   ${label}: phase=${lane.phase} wave=${lane.wave} · ${onGlass.length} on glass` +
              (onGlass.length ? ` — ${onGlass.map((c) => `"${c.text.split('\n')[0]}"`).join(' | ')}` : '') +
              ` · castStrip=${lane.castStrip} · powerCaption=${lane.powerCaption}` +
              (lane.speechPill ? ` · pill="${lane.speechPill}"` : ''));
            if (onGlass.length || (lane.lane && lane.lane.visible)) await page.screenshot({ path: path.join(OUT, `${label}.png`) }).catch(() => {});
          }
          const sawCard = againSeen.some((s) => s.cards.some((c) => c.onGlass));
          if (sawCard && !onGlass.length && againActiveAt != null && Date.now() - againActiveAt > 20_000) break;
          if (typeof lane.bootOverlay === 'string' && lane.bootOverlay.startsWith('visible')) {
            againVeilSeenUp = true;
            againVeilDownAt = null;
          }
          const againVeilDown = lane.bootOverlay === 'hidden' || lane.bootOverlay === 'absent';
          if (againVeilDown && againVeilSeenUp && againVeilDownAt == null) againVeilDownAt = Date.now();
          if (!sawCard && againVeilDownAt != null && Date.now() - againVeilDownAt > 45_000) break;
        }
        await page.waitForTimeout(140);
      }
      await page.screenshot({ path: path.join(OUT, 'again-after.png') }).catch(() => {});
      const againTexts = againSeen.flatMap((s) => s.cards.filter((c) => c.onGlass).map((c) => c.text));
      const againMax = Math.max(0, ...againSeen.map((s) => s.cards.filter((c) => c.onGlass).length));
      step('Again: still one card at a time', againMax <= 1, `most at once: ${againMax}`);
      step('Again: the codex card does not return',
        !againTexts.some((t) => /Light enough to throw/i.test(t)),
        againTexts.length ? `${againTexts.length} card(s) seen: ${againTexts.map((t) => t.split('\n')[0]).join(' | ')}` : 'no cards at all');
      step('Again: the power card does not return',
        !againTexts.some((t) => /Gathers rocks at your bow|Blasts everything ahead/i.test(t)),
        'no power caption card on the second round');
      step('Again: no codex strip or power caption either',
        !againSeen.some((s) => s.castStrip || s.powerCaption),
        'both stayed hidden');
      step('Again: the round brief is the one card that may come back',
        againSeen.some((s) => s.cards.some((c) => c.onGlass && /rushing pack|Catch one Wasp|whip it through/i.test(c.text))),
        againSeen.some((s) => s.cards.length) ? 'round brief seen' : 'no card on the second round');
    } else {
      step('Again button', false, 'Run Over showed no Again control');
    }
  } else {
    step('run ended', false, 'the run never ended inside the wait — Again not exercised');
  }
} catch (err) {
  step('route error', false, String(err && err.message || err).slice(0, 400));
  report.error = String(err && err.stack || err);
} finally {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`report: ${path.relative(ROOT, path.join(OUT, 'report.json'))}`);
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = report.steps.filter((s) => s.ok === false);
console.log(failed.length ? `FAIL ${failed.length} step(s)` : 'PASS — one teaching card at a time');
process.exit(failed.length ? 1 : 0);
