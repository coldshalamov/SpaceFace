// Playtest audit probe — one clean run walks the reachable player surface and writes
// per-beat screenshots + a text/DOM census to .devshots/playtest-<route>/ for cheap review.
//
//   node scripts/probe-playtest.mjs --route=screens            # title -> flight -> station -> edges
//   node scripts/probe-playtest.mjs --route=screens --only=t01-title
//   node scripts/probe-playtest.mjs --list
//
// Requires the shared harness (scripts/lib/playtest.mjs). Same isolation contract as
// probe-demo-path: own port, empty player store, headless chromium.

import path from 'node:path';
import { bootPlaytest, beat, clickWord, observe, finish, sleep, shotNow, ROOT } from './lib/playtest.mjs';

const ARGS = process.argv.slice(2);
const argVal = (name, dflt) => {
  const a = ARGS.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : dflt;
};
const ONLY = new Set(argVal('only', '').split(',').map((s) => s.trim()).filter(Boolean));
const ROUTE = argVal('route', 'screens');
const OUT_DIR = path.join(ROOT, '.devshots', `playtest-${ROUTE}`);
// Beats are sequential and later ones depend on earlier state, so --only is a STOP-AFTER
// list (same contract as probe-demo-path's SF_DEMO_STOP_AFTER): run until every named beat
// has executed, then stop.
const beatsDone = new Set();
const allDone = () => ONLY.size > 0 && [...ONLY].every((id) => beatsDone.has(id));
const BEATS_DONE = Symbol('beats-done');

async function B(ctx, id, note, fn, opts) {
  const r = await beat(ctx, id, note, fn, opts);
  beatsDone.add(id);
  if (allDone()) throw BEATS_DONE;
  return r;
}

async function snap(ctx) { return ctx.page.evaluate(() => window.__SF_PT_SNAP__()); }
async function screenOf(ctx) { const s = await snap(ctx); return s && s.screen; }
async function modeOf(ctx) { const s = await snap(ctx); return s && s.mode; }

// Escape pops the top screen; if the screen doesn't change, click a back-like word.
async function backOut(ctx, fromScreen) {
  await ctx.page.keyboard.press('Escape');
  await sleep(700);
  if ((await screenOf(ctx)) !== fromScreen) return 'esc';
  const hit = await ctx.page.evaluate(() => {
    const w = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
      .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /back|return|close|resume|depart|undock|exit/i.test(e.textContent || ''))[0];
    if (!w) return null;
    w.click();
    return (w.textContent || '').trim();
  });
  await sleep(700);
  return hit || 'stuck';
}

// Walk one title verb: open, census, leave. Records the destination screen id.
async function walkVerb(ctx, id, pattern) {
  await B(ctx, id, `title verb ${pattern}`, async () => {
    const before = await screenOf(ctx);
    const clicked = await clickWord(ctx, pattern, 12_000);
    await sleep(1400);
    const s = await snap(ctx);
    await shotNow(ctx, `${id}-open`);
    const dest = s.screen;
    observe(ctx, 'note', 'title', `verb "${clicked}" -> screen=${dest} controls=${s.controls.length}`);
    const back = await backOut(ctx, dest);
    // A1: after popping, no screen besides the base should still be mounted+visible.
    const after = await snap(ctx);
    const leftovers = (after.screens || []).filter((x) => x.visible && x.id !== after.screen);
    if (leftovers.length) {
      observe(ctx, 'defect', 'screens', `after Esc-pop of ${dest}: still-visible screens ${JSON.stringify(leftovers.map((x) => x.id))} (top=${after.screen})`);
    }
    return { verb: clicked, from: before, to: dest, backVia: back, leftovers };
  });
}

async function pressKey(ctx, key, settleMs = 900) {
  await ctx.page.keyboard.press(key);
  await sleep(settleMs);
}

async function waitMode(ctx, want, timeoutMs = 120_000) {
  await ctx.page.waitForFunction((w) => window.SF && window.SF.state && window.SF.state.mode === w, want, { timeout: timeoutMs });
}

async function travelToStation(ctx, stationId, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.autopilot(id), stationId);
  let lastD = Infinity;
  while (Date.now() < deadline) {
    const s = await ctx.page.evaluate((id) => ({
      d: window.__SF_PT_HELPERS__.distTo(id),
      inRange: window.__SF_PT_HELPERS__.stationInRange(),
      docked: window.__SF_PT_HELPERS__.docked(),
      hostiles: window.__SF_PT_HELPERS__.hostilesNear(420),
      alive: (() => { const p = window.__SF_PT_HELPERS__.player(); return p && p.alive !== false; })(),
    }), stationId);
    if (s.docked) return { docked: true };
    if (!s.alive) return { dead: true, d: s.d };
    if (s.d <= (await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.dockRange(id), stationId)) * 1.05) {
      return { arrived: true, d: s.d };
    }
    // Autopilot can drop on manual-input/lost-target — re-engage instead of timing out dumbly.
    const apLive = await ctx.page.evaluate(() =>
      !!(window.SF.state.nav && window.SF.state.nav.autopilot && window.SF.state.nav.autopilot.active));
    if (!apLive) await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.autopilot(id), stationId);
    lastD = s.d;
    await sleep(1500);
  }
  return { timeout: true, d: lastD };
}

// ---------------------------------------------------------------- routes

const ROUTES = {
  'screens': async (ctx) => {
    await B(ctx, 't01-title', 'normal-route title: verbs, lit pick, save state line', async () => {
      await ctx.page.waitForFunction(() =>
        document.body.dataset.kScreen === 'mainMenu'
        || !!document.querySelector('.screen[data-screen="mainMenu"]'), null, { timeout: 60_000 });
      await sleep(2500); // let the title scene present before measuring
      const s = await snap(ctx);
      observe(ctx, 'note', 'title', `title census: controls=${s.controls.map((c) => c.text).join(' | ').slice(0, 300)}`);
      return { verbs: s.controls.filter((c) => c.tag !== 'input').map((c) => c.text) };
    });

    // Walk every title surface that doesn't start a run or quit.
    await walkVerb(ctx, 't02-verb-settings', /settings/i);

    await B(ctx, 't02b-settings-toggle', 'settings: flip first switch, verify is-on, restore', async () => {
      await clickWord(ctx, /settings/i, 10_000).catch(() => {});
      await sleep(1200);
      // A settings toggle = .k-words--row with exactly off|on words; state = .is-on on the group
      // (the word text never changes). Flip to the opposite state, verify, restore to original.
      const flipped = await ctx.page.evaluate(() => {
        const group = [...document.querySelectorAll('.k-words--row')]
          .filter((g) => {
            const acts = [...g.querySelectorAll('.k-word')].map((w) => w.dataset.action);
            return g.offsetParent !== null && !g.closest('#toasts,#alerts,#toast-live') && acts.length === 2 && acts.includes('off') && acts.includes('on');
          })[0];
        if (!group) return { found: false };
        const rowLabel = (group.closest('.k-row') || group.parentElement || group).textContent.trim().slice(0, 60);
        const wasOn = group.classList.contains('is-on');
        const word = group.querySelector(`.k-word[data-action="${wasOn ? 'off' : 'on'}"]`);
        if (!word) return { found: false };
        word.click();
        return { found: true, rowLabel, wasOn, clicked: wasOn ? 'off' : 'on' };
      });
      await sleep(600);
      const stateAfter = await ctx.page.evaluate(() => {
        const group = [...document.querySelectorAll('.k-words--row')]
          .filter((g) => {
            const acts = [...g.querySelectorAll('.k-word')].map((w) => w.dataset.action);
            return g.offsetParent !== null && acts.length === 2 && acts.includes('off') && acts.includes('on');
          })[0];
        return group ? { isOn: group.classList.contains('is-on'), rowLabel: (group.closest('.k-row') || group).textContent.trim().slice(0, 60) } : null;
      });
      await shotNow(ctx, 't02b-toggled');
      const restored = await ctx.page.evaluate((wantOn) => {
        const group = [...document.querySelectorAll('.k-words--row')]
          .filter((g) => {
            const acts = [...g.querySelectorAll('.k-word')].map((w) => w.dataset.action);
            return g.offsetParent !== null && acts.length === 2 && acts.includes('off') && acts.includes('on');
          })[0];
        if (!group) return null;
        const isOn = group.classList.contains('is-on');
        if (isOn !== wantOn) { const w = group.querySelector(`.k-word[data-action="${wantOn ? 'on' : 'off'}"]`); if (w) w.click(); }
        return true;
      }, flipped.wasOn);
      await pressKey(ctx, 'Escape', 700);
      await sleep(600);
      const s = await snap(ctx);
      if (!flipped.found) observe(ctx, 'defect', 'settings', 'settings screen: no Off/On switch group found');
      else if (!stateAfter || stateAfter.isOn === flipped.wasOn) observe(ctx, 'defect', 'settings', `settings switch "${flipped.rowLabel}" click did not flip is-on`);
      return { flipped, stateAfter, restored, screen: s.screen };
    });

    await walkVerb(ctx, 't03-verb-newgame', /new game|adventure/i);
    await walkVerb(ctx, 't04-verb-load', /^load\b/i);
    await walkVerb(ctx, 't05-verb-crucible', /crucible/i);
    await walkVerb(ctx, 't06-verb-archive', /archive/i);
    await walkVerb(ctx, 't07-verb-sandbox', /sandbox/i);
    await walkVerb(ctx, 't08-verb-credits', /credits/i);
    await walkVerb(ctx, 't09-verb-achievements', /achievements/i);

    await B(ctx, 't10-title-afk', 'idle 16s on title — attract tape should swap in (12s arm)', async () => {
      await sleep(16_000);
      const s = await snap(ctx);
      return { screen: s.screen, textHead: (s.text || '').slice(0, 120) };
    });

    await B(ctx, 'f01-newgame-start', 'New Game -> config -> start -> first flight frame', async () => {
      await clickWord(ctx, /new game|adventure/i, 12_000);
      await sleep(1500);
      const cfg = await snap(ctx);
      await shotNow(ctx, 'f01-config');
      const started = await ctx.page.evaluate(() => {
      const w = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live')
            && /begin|launch|start|depart|embark|fly|confirm|create|accept|go/i.test(e.textContent || '')
            && !/back|cancel|return/i.test(e.textContent || ''))[0];
        if (!w) return null;
        w.click();
        return (w.textContent || '').trim();
      });
      await waitMode(ctx, 'flight', 90_000);
      return { configScreen: cfg.screen, startVerb: started, mode: await modeOf(ctx) };
    });

    await B(ctx, 'f02-hud', 'free flight HUD census', async () => {
      await ctx.page.evaluate(() => { window.SF.state.nav.autopilot = { active: false, target: null, label: '', arrivalRadius: 36, status: 'idle' }; });
      await ctx.page.keyboard.down('w');
      await sleep(1200);
      await ctx.page.keyboard.up('w');
      const s = await snap(ctx);
      return { screen: s.screen, mode: s.mode, controls: s.controls.length, player: s.player };
    });

    // Flight instruments: each binding opens a screen; census, then close. i/l are HUD overlays
    // (sf-cargo-panel / #sf-comm-backlog) that never set ui.screen — detect the overlay instead.
    const INSTRUMENTS = [
      ['i01-localmap', 'm', 'screen'], ['i02-starmap', 'n', 'screen'], ['i03-missionlog', 'j', 'screen'],
      ['i04-cargo', 'i', 'overlay', '.sf-cargo-panel.open, .sf-cargo-panel[class*="open"], [class*="cargo-panel"]'],
      ['i05-codex', 'k', 'screen'], ['i06-comms', 'l', 'overlay', '#sf-comm-backlog, .sf-comm-backlog'],
      ['i07-techtree', 't', 'screen'],
    ];
    for (const [id, key, kind, sel] of INSTRUMENTS) {
      await B(ctx, id, `flight instrument '${key}'`, async () => {
        await pressKey(ctx, key);
        const opened = await snap(ctx);
        const overlayVisible = kind === 'overlay'
          ? await ctx.page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null && (e.offsetWidth > 0 || e.offsetHeight > 0)), sel)
          : null;
        await shotNow(ctx, `${id}-open`);
        const back = await backOut(ctx, opened.screen);
        const visible = kind === 'overlay' ? overlayVisible : opened.screen;
        if (!visible) observe(ctx, 'defect', 'flight-screens', `key ${key} produced no ${kind === 'overlay' ? 'overlay' : 'screen'} (screen=${opened.screen})`);
        observe(ctx, 'note', 'flight-screens', `key ${key} -> screen=${opened.screen} overlay=${overlayVisible} controls=${opened.controls.length}`);
        return { key, screen: opened.screen, overlayVisible, backVia: back };
      });
    }

    await B(ctx, 'e01-pause', 'Esc pause menu + resume', async () => {
      await pressKey(ctx, 'Escape', 1200);
      const paused = await snap(ctx);
      await shotNow(ctx, 'e01-pause-open');
      let resumed = null;
      if (paused.screen && paused.screen !== 'flight' && paused.screen !== 'mainMenu') {
        const w = await ctx.page.evaluate(() => {
          const b = [...document.querySelectorAll('.k-word, button, [role="button"]')]
            .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /resume|return|continue|back/i.test(e.textContent || ''))[0];
          if (!b) return null; b.click(); return (b.textContent || '').trim();
        });
        resumed = w;
        await sleep(900);
      }
      return { pauseScreen: paused.screen, pauseText: (paused.text || '').slice(0, 200), resumeVerb: resumed, after: await screenOf(ctx) };
    });

    await B(ctx, 'e02-resize-small', 'viewport 960x600 mid-flight', async () => {
      await ctx.page.setViewportSize({ width: 960, height: 600 });
      await sleep(1200);
      await shotNow(ctx, 'e02-small');
      return { screen: await screenOf(ctx) };
    });
    await B(ctx, 'e03-resize-ultrawide', 'viewport 2560x900 mid-flight', async () => {
      await ctx.page.setViewportSize({ width: 2560, height: 900 });
      await sleep(1200);
      await shotNow(ctx, 'e03-ultrawide');
      const r = { screen: await screenOf(ctx) };
      await ctx.page.setViewportSize({ width: 1600, height: 900 });
      await sleep(900);
      return r;
    });

    await B(ctx, 'e04-toggle-spam', 'rapid instrument toggling m,n,m,Esc', async () => {
      for (const k of ['m', 'n', 'm', 'Escape']) await pressKey(ctx, k, 220);
      await sleep(900);
      const s = await snap(ctx);
      return { screen: s.screen, mode: s.mode };
    });

    await B(ctx, 's01-travel-dock', 'autopilot to nearest station and dock', async () => {
      const stations = await ctx.page.evaluate(() => window.__SF_PT_HELPERS__.stationIds());
      if (!stations.length) { observe(ctx, 'defect', 'stations', 'no station entities in adventure world'); return { stations: [] }; }
      const dists = await ctx.page.evaluate((ids) => ids.map((id) => ({ id, d: window.__SF_PT_HELPERS__.distTo(id) })), stations);
      dists.sort((a, b) => a.d - b.d);
      const target = dists[0].id;
      const r = await travelToStation(ctx, target, 4 * 60_000);
      if (!r.arrived) { observe(ctx, 'rough-edge', 'stations', `travel to ${target} ended ${JSON.stringify(r)}`); return { target, ...r }; }
      await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.dock(id), target);
      await sleep(1800);
      await shotNow(ctx, 's01-docked');
      const s = await snap(ctx);
      return { target, ...r, docked: s.docked, screen: s.screen };
    });

    // Station screens: the real tabs are [data-nav] tiles in the dock group, not .k-word rows.
    await B(ctx, 's02-station-walk', 'walk every station tab/screen', async () => {
      const s0 = await snap(ctx);
      const tabs = await ctx.page.evaluate(() =>
        [...document.querySelectorAll('[data-nav]')].map((el) => ({
          id: el.dataset.nav,
          label: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        })).filter((t) => t.id));
      const visited = [];
      for (const tab of tabs) {
        if (/undock|depart|launch|back|close|quit/i.test(tab.id + ' ' + tab.label)) continue;
        // Close whatever modal the last tab opened before navigating.
        await ctx.page.evaluate(() => {
          const pop = document.querySelector('.sx-pop:not([hidden]) [data-action="close"], .sx-pop:not([hidden]) .k-word, [role="dialog"] button');
          if (pop && pop.offsetParent !== null) pop.click();
        });
        await ctx.page.evaluate((id) => {
          const el = document.querySelector(`[data-nav="${id}"]`);
          if (el) el.click();
        }, tab.id);
        await sleep(1100);
        await shotNow(ctx, `s02-tab-${tab.id.replace(/[^a-z0-9]+/gi, '-').slice(0, 24)}`);
        const s = await snap(ctx);
        visited.push({ tab: tab.id, label: tab.label, screen: s.screen, controls: s.controls.length, textHead: (s.text || '').slice(0, 160) });
      }
      observe(ctx, 'note', 'station', `station tabs walked: ${visited.map((v) => `${v.tab}(${v.screen || 'panel'})`).join(' | ')}`);
      return { dockedAt: s0.dockedStationId, visited };
    });
  },

  // Edge states: hostile input + lifecycle seams on the real path.
  async edge(ctx) {
    await B(ctx, 'x01-title', 'title census (post-A1-fix run)', async () => {
      await ctx.page.waitForFunction(() =>
        document.body.dataset.kScreen === 'mainMenu'
        || !!document.querySelector('.screen[data-screen="mainMenu"]'), null, { timeout: 60_000 });
      await sleep(2500);
      const s = await snap(ctx);
      return { screen: s.screen, controls: s.controls.length };
    });

    await newGameToFlight(ctx);

    await B(ctx, 'x02-undock-none', 'E pressed while not docked — should be a no-op or benign', async () => {
      await pressKey(ctx, 'e', 800);
      return { screen: await screenOf(ctx), mode: await modeOf(ctx) };
    });

    await B(ctx, 'x05-rapid-toggles', 'open/close spam: m Esc n Esc j Esc t Esc', async () => {
      for (const k of ['m', 'Escape', 'n', 'Escape', 'j', 'Escape', 't', 'Escape']) await pressKey(ctx, k, 260);
      await sleep(900);
      const s = await snap(ctx);
      const leftovers = (s.screens || []).filter((x) => x.visible && x.id !== s.screen);
      if (leftovers.length) observe(ctx, 'defect', 'screens', `toggle-spam leftovers visible: ${JSON.stringify(leftovers.map((x) => x.id))}`);
      return { screen: s.screen, mode: s.mode, leftovers };
    });

    await B(ctx, 'x06-job-accept', 'dock -> Missions -> ACCEPT an offer -> confirm it is tracked', async () => {
      const stations = await ctx.page.evaluate(() => window.__SF_PT_HELPERS__.stationIds());
      if (!stations.length) return { stations: 0 };
      const dists = await ctx.page.evaluate((ids) => ids.map((id) => ({ id, d: window.__SF_PT_HELPERS__.distTo(id) })), stations);
      dists.sort((a, b) => a.d - b.d);
      const r = await travelToStation(ctx, dists[0].id, 8 * 60_000);
      if (!r.arrived && !r.docked) { observe(ctx, 'rough-edge', 'stations', `job-accept travel ended ${JSON.stringify(r)}`); return { travel: r }; }
      if (!r.docked) { await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.dock(id), dists[0].id); await sleep(1800); }
      await ctx.page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-nav]')].find((n) => /mission/i.test(n.dataset.nav || ''));
        if (el) el.click();
      });
      await sleep(1300);
      await shotNow(ctx, 'x06-missions');
      // Pick the row that actually carries a commit verb (DISPATCH THIS JOB / ACCEPT / TAKE ON) —
      // services rows like "Sell what you hauled" match job-y words but commit nothing.
      const row = await ctx.page.evaluate(() => {
        const isVerb = (t) => /dispatch this job|^\s*accept|take on|take contract|sign on/i.test(t || '');
        const rows = [...document.querySelectorAll('li, tr, [data-offer], .offer, .job, [class*="offer"], [class*="job"]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live'));
        for (const el of rows) {
          const btn = [...el.querySelectorAll('button, .k-word, [role="button"], [data-action]')].find((b) => isVerb(b.textContent));
          if (btn) { btn.click(); return (el.textContent || '').trim().slice(0, 80); }
        }
        // No inline verb — select the first plausible offer row, then find the commit verb
        // in the detail pane it opens.
        const cand = rows.find((el) => /deliver|transport|escort|scan|mine|haul|cargo|convoy|passenger|survey|bounty/i.test(el.textContent || '') && !/sell what/i.test(el.textContent || ''));
        if (cand) cand.click();
        const bare = [...document.querySelectorAll('button, .k-word, [role="button"], [data-action]')]
          .find((b) => b.offsetParent !== null && !b.closest('#toasts,#alerts,#toast-live') && isVerb(b.textContent));
        if (bare) { bare.click(); return (cand ? '(row+pane) ' : '(pane) ') + (bare.textContent || '').trim(); }
        return cand ? '(row selected, no verb) ' + (cand.textContent || '').trim().slice(0, 60) : null;
      });
      await sleep(900);
      const blocked = await ctx.page.evaluate(() =>
        /blocked/i.test(document.body.innerText || '') && /need\s+\d/i.test(document.body.innerText || ''));
      const accepted = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live')
            && /dispatch this job|^\s*accept|take on|sign|take contract/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(1500);
      await shotNow(ctx, 'x06-accepted');
      const after = await snap(ctx);
      if (accepted && !(after.text || '').match(/track|job|mission|contract|objective/i)) {
        observe(ctx, 'rough-edge', 'missions', `accepted an offer but no tracking hint surfaced (screen=${after.screen})`);
      }
      return { station: dists[0].id, row, blocked, acceptVerb: accepted, screen: after.screen, textHead: (after.text || '').slice(0, 200) };
    });

    await B(ctx, 'x03-pause-quit', 'Esc -> pause -> quit/abandon to title mid-flight', async () => {
      // If a prior beat left us docked, undock so Esc opens the flight pause, not a station exit.
      await ctx.page.evaluate(() => { const H = window.__SF_PT_HELPERS__; if (H.docked()) H.undock(window.SF.state.ui.dockedStationId); });
      await sleep(1200);
      // First Esc may be consumed closing a residual screen the undock helper left open. screen=null
      // is the flight HUD — keep pressing until 'pause'; two consecutive nulls means it never opened.
      let p = null, nulls = 0;
      for (let i = 0; i < 3; i++) {
        await pressKey(ctx, 'Escape', 1000);
        p = await snap(ctx);
        if (p.screen === 'pause') break;
        if (p.screen === null && ++nulls >= 2) break;
      }
      await shotNow(ctx, 'x03-pause');
      const quit = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /main menu/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(1600);
      // "Main Menu" opens an sf-confirm dialog — its affirmative button is labelled the same.
      // Scope to the confirm root so we never hit the neighbouring "Quit Game" row.
      const confirm = await ctx.page.evaluate(() => {
        const root = document.querySelector('#sf-confirm-root');
        if (!root) return null;
        const b = [...root.querySelectorAll('.k-word, button, [role="button"]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /main menu|confirm|yes|leave/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(1600);
      const s = await snap(ctx);
      if (s.screen !== 'mainMenu' && quit) observe(ctx, 'rough-edge', 'lifecycle', `quit verb "${quit}" landed on screen=${s.screen}, mode=${s.mode}`);
      return { pauseScreen: p.screen, quitVerb: quit, confirmVerb: confirm, screen: s.screen, mode: s.mode };
    });

    await B(ctx, 'x04-resume-continue', 'Continue from title after quit — run state should restore', async () => {
      const s0 = await snap(ctx);
      const hasContinue = (s0.controls || []).some((c) => /continue/i.test(c.text || ''));
      if (!hasContinue) return { screen: s0.screen, continueAvailable: false };
      await clickWord(ctx, /continue/i, 10_000);
      await sleep(3000);
      const s = await snap(ctx);
      if (s.mode !== 'flight') observe(ctx, 'defect', 'lifecycle', `Continue landed mode=${s.mode} screen=${s.screen}, expected flight`);
      return { screen: s.screen, mode: s.mode, continueAvailable: true, simTime: s.simTime, player: s.player };
    });

    await B(ctx, 'x07-quicksave', 'F5 quick-save then F9 quick-load — same run state back', async () => {
      const mode = await ctx.page.evaluate(() => window.SF.state.mode);
      if (mode !== 'flight') return { skipped: `mode=${mode}` };
      const before = await ctx.page.evaluate(() => {
        const p = window.SF.state.player || {};
        return { credits: p.credits, simTime: Math.round((window.SF.state.simTime || 0) * 10) / 10 };
      });
      await pressKey(ctx, 'F5', 1500);
      const savedAt = await ctx.page.evaluate(() => window.SF.state.meta && window.SF.state.meta.lastSavedAt);
      await pressKey(ctx, 'F9', 4000);
      const s = await snap(ctx);
      const after = await ctx.page.evaluate(() => {
        const p = window.SF.state.player || {};
        return { credits: p.credits, simTime: Math.round((window.SF.state.simTime || 0) * 10) / 10 };
      });
      const drift = after && before ? Math.abs(after.simTime - before.simTime) : null;
      if (savedAt == null) observe(ctx, 'defect', 'save', 'F5 produced no lastSavedAt — quick-save may be dead');
      else if (s.mode !== 'flight' || (after && after.credits !== before.credits)) observe(ctx, 'rough-edge', 'save', `F9 reload landed mode=${s.mode} credits ${before.credits}->${after && after.credits}`);
      return { before, savedAt, after, mode: s.mode, simDrift: drift };
    });
  },

  // Economy loop: flight -> find rock -> mine it -> ore/cargo receipt.
  async loop(ctx) {
    await B(ctx, 'l01-boot', 'title -> new game -> flight', async () => {
      await ctx.page.waitForFunction(() =>
        document.body.dataset.kScreen === 'mainMenu'
        || !!document.querySelector('.screen[data-screen="mainMenu"]'), null, { timeout: 60_000 });
      await sleep(1500);
      await newGameToFlight(ctx);
      const s = await snap(ctx);
      return { screen: s.screen, mode: s.mode };
    });

    await B(ctx, 'l02-rock', 'autopilot to nearest asteroid', async () => {
      const rock = await ctx.page.evaluate(() => {
        const H = window.__SF_PT_HELPERS__;
        const p = H.player();
        if (!p) return null;
        let best = null, bd = Infinity;
        for (const e of window.SF.state.entities.values()) {
          if (!e || e.type !== 'asteroid' || e.alive === false || !e.pos) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) return null;
        window.SF.state.nav.autopilot = {
          active: true, targetEntityId: best.id, target: null,
          label: 'playtest-rock', arrivalRadius: 80, status: 'cruise',
        };
        return { id: best.id, d0: Math.round(bd) };
      });
      if (!rock) { observe(ctx, 'note', 'mining', 'no asteroid entities near spawn'); return null; }
      let d = rock.d0;
      for (let i = 0; i < 60; i++) {
        await sleep(1500);
        d = await ctx.page.evaluate((id) => {
          const p = window.__SF_PT_HELPERS__.player();
          const e = window.SF.state.entities.get(id);
          return e ? Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z)) : Infinity;
        }, rock.id);
        if (d <= 160) break;
      }
      await shotNow(ctx, 'l02-at-rock');
      return { rock, d };
    });

    await B(ctx, 'l03-mine', 'hold RMB on the rock — beam bites, ore receipt shows', async () => {
      const before = await ctx.page.evaluate(() => {
        const c = window.SF.state.player && window.SF.state.player.cargo;
        return c ? JSON.stringify(c).slice(0, 120) : null;
      });
      await ctx.page.mouse.move(800, 450);
      await ctx.page.mouse.down({ button: 'right' });
      await sleep(6000);
      await shotNow(ctx, 'l03-beaming');
      await sleep(8000);
      await ctx.page.mouse.up({ button: 'right' });
      const s = await snap(ctx);
      const after = await ctx.page.evaluate(() => {
        const c = window.SF.state.player && window.SF.state.player.cargo;
        return c ? JSON.stringify(c).slice(0, 120) : null;
      });
      const t = s.text || '';
      if (before === after && !/ore|platinum|nickel|yield|extract|cargo|mass/i.test(t)) {
        observe(ctx, 'rough-edge', 'mining', '14s RMB near a rock produced no cargo change or yield signal');
      }
      return { screen: s.screen, mode: s.mode, cargoBefore: before, cargoAfter: after, textHead: t.slice(0, 260) };
    });

    await B(ctx, 'l04-sell', 'dock -> market IN HOLD -> SELL the mined ore -> credits up', async () => {
      const stations = await ctx.page.evaluate(() => window.__SF_PT_HELPERS__.stationIds());
      if (!stations.length) return { stations: 0 };
      const dists = await ctx.page.evaluate((ids) => ids.map((id) => ({ id, d: window.__SF_PT_HELPERS__.distTo(id) })), stations);
      dists.sort((a, b) => a.d - b.d);
      const r = await travelToStation(ctx, dists[0].id, 8 * 60_000);
      if (!r.arrived && !r.docked) return { travel: r };
      if (!r.docked) { await ctx.page.evaluate((id) => window.__SF_PT_HELPERS__.dock(id), dists[0].id); await sleep(1800); }
      const crBefore = await ctx.page.evaluate(() => window.SF.state.player && window.SF.state.player.credits);
      await ctx.page.evaluate(() => { const el = [...document.querySelectorAll('[data-nav]')].find((n) => /market/i.test(n.dataset.nav || '')); if (el) el.click(); });
      await sleep(1300);
      await shotNow(ctx, 'l04-market');
      // Switch to the IN HOLD filter, then sell the first row's commodity once.
      const inHold = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /in hold/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(900);
      const sold = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('button, [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /^sell/i.test((e.textContent || '').trim()) && !/sell what|selling/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(1200);
      const crAfter = await ctx.page.evaluate(() => window.SF.state.player && window.SF.state.player.credits);
      if (sold && crAfter <= crBefore) observe(ctx, 'rough-edge', 'market', `SELL clicked but credits did not rise (${crBefore} -> ${crAfter})`);
      return { inHold, sellVerb: sold, credits: [crBefore, crAfter] };
    });

    await B(ctx, 'l05-outfit', 'shipworks -> buy something affordable -> undock', async () => {
      await ctx.page.evaluate(() => { const el = [...document.querySelectorAll('[data-nav]')].find((n) => /shipworks|ship/i.test(n.dataset.nav || '')); if (el) el.click(); });
      await sleep(1400);
      await shotNow(ctx, 'l05-shipworks');
      const verbs = await ctx.page.evaluate(() =>
        [...document.querySelectorAll('button, .k-word, [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live'))
          .map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 40));
      // Undock back to flight.
      const undock = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('[data-nav], .k-word, button')].find((e) => /undock/i.test((e.textContent || '') + ' ' + (e.dataset.nav || '')));
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(2200);
      const s = await snap(ctx);
      return { shipworksVerbs: verbs.slice(0, 20), undockVerb: undock, screen: s.screen, mode: s.mode, docked: s.docked };
    });

    await B(ctx, 'l06-jump', 'request a gate jump to a neighbor sector -> arrive + autosave', async () => {
      const from = await ctx.page.evaluate(() => window.SF.state.world.currentSectorId);
      const neighbors = await ctx.page.evaluate((id) =>
        (window.SF.state.world.sectors[id] && window.SF.state.world.sectors[id].neighbors) || [], from);
      if (!neighbors.length) return { from, neighbors: 0 };
      const target = neighbors[0];
      await ctx.page.evaluate((t) => window.SF.bus.emit('world:requestJump', { targetSectorId: t, via: 'gate' }), target);
      await sleep(400);
      const j0 = await ctx.page.evaluate(() => ({ state: window.SF.state.jump.state, chargeNeeded: window.SF.state.jump.chargeNeeded }));
      // GATE_CHARGE is 3s; poll up to 40s for the arrive transition.
      let arrived = false, sector = null;
      for (let i = 0; i < 80 && !arrived; i++) {
        sector = await ctx.page.evaluate(() => window.SF.state.world.currentSectorId);
        arrived = sector === target;
        if (!arrived) await sleep(500);
      }
      await sleep(1500);
      await shotNow(ctx, 'l06-arrived');
      const s = await snap(ctx);
      if (!arrived) observe(ctx, 'defect', 'travel', `gate jump to ${target} never arrived (state=${j0.state})`);
      else if (!/helios/i.test(sector) === /helios/i.test(from)) { /* same-sector guard */ }
      return { from, target, jumpStart: j0, arrived, sector, mode: s.mode, saveNow: !!(await ctx.page.evaluate(() => window.SF.state.meta && window.SF.state.meta.lastSavedAt)) };
    });

    await B(ctx, 'l07-hail', 'target nearest ship -> HAIL -> tactical hail deck opens', async () => {
      const picked = await ctx.page.evaluate(() => {
        const st = window.SF.state;
        const p = st.entities.get(st.playerId);
        let best = null, bd = Infinity;
        for (const e of st.entities.values()) {
          if (!e || e.id === st.playerId || e.alive === false) continue;
          if (e.type !== 'ship' && e.type !== 'drone') continue;
          const d = Math.hypot((e.pos ? e.pos.x : e.x) - p.pos.x, (e.pos ? e.pos.z : e.z) - p.pos.z);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) return null;
        st.player.targetId = best.id;
        return { id: best.id, type: best.type, d: Math.round(bd) };
      });
      if (!picked) return { contact: null };
      await sleep(1200);
      const avail = await ctx.page.evaluate(() => {
        const b = document.querySelector('#sf-contact-hail');
        return { exists: !!b, text: b && (b.textContent || '').trim(), disabled: b && b.disabled };
      });
      await ctx.page.evaluate(() => { const b = document.querySelector('#sf-contact-hail'); if (b) b.click(); });
      await sleep(1500);
      await shotNow(ctx, 'l07-hail');
      const deck = await ctx.page.evaluate(() => ({
        open: !!document.querySelector('.sf-drawer--haildeck, .sf-haildeck'),
        facts: (document.querySelector('[data-k="deck-facts"]') || {}).textContent || '',
      }));
      const s = await snap(ctx);
      if (picked.d <= 5200 && !deck.open) observe(ctx, 'rough-edge', 'comms', `HAIL clicked for contact ${picked.id} @ ${picked.d}WU but no hail deck opened (avail=${JSON.stringify(avail)})`);
      return { contact: picked, avail, deckOpen: deck.open, screen: s.screen };
    });

    await B(ctx, 'l08-death', 'synthetic ship_destroyed -> gameOver screen presents Continue/respawn', async () => {
      // The kill path itself is proven by combat c04b; this verifies the adventure-mode
      // gameOver presentation + respawn affordance, which no other beat reaches.
      await ctx.page.evaluate(() => {
        const st = window.SF.state;
        const p = st.entities.get(st.playerId);
        const pos = p && p.pos ? { x: p.pos.x, z: p.pos.z } : { x: 0, z: 0 };
        window.SF.bus.emit('player:death', { victimId: st.playerId, killerId: null, recoverable: true, victimVel: { x: 0, z: 0 }, pos });
        window.SF.bus.emit('game:over', { reason: 'ship_destroyed', recoverable: true, receipt: { reason: 'probe' } });
      });
      await sleep(2500);
      const s = await snap(ctx);
      await shotNow(ctx, 'l08-gameover');
      const verbs = await ctx.page.evaluate(() =>
        [...document.querySelectorAll('button, .k-word, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live'))
          .map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 24));
      // Click the recovery/continue verb if present and verify we return to flight.
      const recover = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('button, .k-word, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live')
            && /continue|recover|respawn|rebuild|fly again|wake/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(2500);
      const s2 = await snap(ctx);
      if (s.screen !== 'gameOver' && s.screen !== null) observe(ctx, 'rough-edge', 'death', `game:over landed screen=${s.screen}`);
      if (recover && s2.mode !== 'flight' && !s2.docked) observe(ctx, 'rough-edge', 'death', `recovery verb "${recover}" left mode=${s2.mode} screen=${s2.screen}`);
      return { screen: s.screen, verbs: verbs.slice(0, 14), recoverVerb: recover, afterScreen: s2.screen, afterMode: s2.mode };
    });
  },

  // Crucible: open from title, launch quick play, fight briefly, observe combat UI, then leave.
  async combat(ctx) {
    await B(ctx, 'c01-door', 'title -> Crucible door', async () => {
      await clickWord(ctx, /crucible/i, 12_000);
      await sleep(1400);
      const s = await snap(ctx);
      return { screen: s.screen, controls: s.controls.length };
    });

    await B(ctx, 'c01b-labdoors', 'crucible door -> Share codes / Practice room sub-screens', async () => {
      const out = {};
      for (const re of [/share codes/i, /practice room/i]) {
        const opened = await ctx.page.evaluate((src) => {
          const rx = new RegExp(src, 'i');
          const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
            .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && rx.test(e.textContent || ''))[0];
          if (!b) return null; b.click(); return (b.textContent || '').trim();
        }, re.source);
        await sleep(1400);
        const s = await snap(ctx);
        await shotNow(ctx, 'c01b-' + re.source.replace(/[^a-z]/gi, ''));
        out[re.source] = { verb: opened, screen: s.screen, mode: s.mode, controls: s.controls.length };
        // back out: Esc, then re-open crucible door if we fell all the way to title.
        await pressKey(ctx, 'Escape', 700);
        await sleep(900);
        const s2 = await snap(ctx);
        if (s2.screen === 'mainMenu') {
          await clickWord(ctx, /crucible/i, 10_000);
          await sleep(1200);
        }
      }
      return out;
    });

    await B(ctx, 'c02-launch', 'Quick play -> crucible flight', async () => {
      const clicked = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /quick play|launch|begin|fight|enter/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(2500);
      const s = await snap(ctx);
      return { verb: clicked, screen: s.screen, mode: s.mode };
    });

    await B(ctx, 'c03-fight', 'thrust + fire for 20s — combat HUD, target reads, damage', async () => {
      const before = await snap(ctx);
      await ctx.page.keyboard.down('w');
      await sleep(3000);
      await ctx.page.keyboard.up('w');
      // Fire whatever is bound (Space = fire in most sims; also click-to-fire fallback).
      for (let i = 0; i < 8; i++) { await ctx.page.keyboard.press(' '); await sleep(400); }
      await shotNow(ctx, 'c03-firing');
      await sleep(9000);
      const s = await snap(ctx);
      return {
        screen: s.screen, mode: s.mode, hostiles: s.hostilesNear,
        textHead: (s.text || '').slice(0, 300), player: s.player,
      };
    });

    await B(ctx, 'c04-deathwatch', 'idle 30s in arena — death/results screen if hull fails', async () => {
      await sleep(30_000);
      const s = await snap(ctx);
      await shotNow(ctx, 'c04-late');
      return { screen: s.screen, mode: s.mode, player: s.player, textHead: (s.text || '').slice(0, 200) };
    });

    await B(ctx, 'c04b-death', 'wound hull to near-zero, let the swarm finish -> results/death path', async () => {
      const pre = await ctx.page.evaluate(() => {
        const p = window.__SF_PT_HELPERS__.player();
        if (p) { p.hull = 2; if (p.shield) p.shield = 0; }
        return p && p.hull;
      });
      let s = null;
      for (let i = 0; i < 45; i++) {
        await sleep(2000);
        s = await snap(ctx);
        const t = s.text || '';
        if ((s.player && s.player.alive === false) || /results|game over|destroyed|wrecked|killed|replay/i.test(t)) break;
      }
      await shotNow(ctx, 'c04b-death');
      return { preHull: pre, screen: s.screen, mode: s.mode, alive: s.player && s.player.alive, textHead: (s.text || '').slice(0, 220) };
    });

    await B(ctx, 'c05-exit', 'leave crucible (pause -> quit or results -> menu)', async () => {
      await pressKey(ctx, 'Escape', 900);
      const p = await snap(ctx);
      const verb = await ctx.page.evaluate(() => {
        const b = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /main menu|leave|abandon|exit|concede|forfeit/i.test(e.textContent || ''))[0];
        if (!b) return null; b.click(); return (b.textContent || '').trim();
      });
      await sleep(1500);
      await ctx.page.evaluate(() => {
        const root = document.querySelector('#sf-confirm-root') || document;
        const b = [...root.querySelectorAll('.k-word, button, [role="button"]')]
          .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live') && /main menu|confirm|yes|leave|forfeit/i.test(e.textContent || ''))[0];
        if (b) b.click();
      });
      await sleep(1500);
      const s = await snap(ctx);
      return { pauseScreen: p.screen, verb, screen: s.screen, mode: s.mode };
    });
  },
};

// ---------------------------------------------------------------- flight helpers

// New Game -> config -> start -> flight. Shared by routes that need a live run.
async function newGameToFlight(ctx) {
  await clickWord(ctx, /new game|adventure/i, 12_000);
  await sleep(1500);
  await ctx.page.evaluate(() => {
    const w = [...document.querySelectorAll('.k-word, button, [role="button"], [data-action]')]
      .filter((e) => e.offsetParent !== null && !e.closest('#toasts,#alerts,#toast-live')
        && /begin|launch|start|depart|embark|fly|confirm|create|accept|go/i.test(e.textContent || '')
        && !/back|cancel|return/i.test(e.textContent || ''))[0];
    if (w) w.click();
  });
  await waitMode(ctx, 'flight', 90_000);
  await sleep(800);
}

// ---------------------------------------------------------------- run

if (ARGS.includes('--list')) {
  console.log('routes:', Object.keys(ROUTES).join(', '));
  console.log('stops: pass --only=<beatId>[,<beatId>...] to end the run after those beats');
  process.exit(0);
}
if (!ROUTES[ROUTE]) { console.error(`unknown route ${ROUTE}`); process.exit(2); }
console.log(`probe-playtest route=${ROUTE} out=${OUT_DIR}${ONLY.size ? ` only=${[...ONLY].join(',')}` : ''}`);

const ctx = await bootPlaytest({ outDir: OUT_DIR });
try {
  await ROUTES[ROUTE](ctx);
} catch (e) {
  if (e !== BEATS_DONE) throw e;
} finally {
  await finish(ctx);
}
