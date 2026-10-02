#!/usr/bin/env node
// Does the station's tab strip tell the truth about which tab is active?
//
// The station review found that on Shipworks and Industry the NEIGHBOURING tab also carried the
// dark active-fill block, so fill alone lied and only the thin underline was honest. A control that
// lies about state is not a styling nit — it is the shell misreporting where the player is.
//
// For every tab, this records each nav item's selected state and the channels that can signal it
// (background fill, the ::after lamp bar, label ink, and the rail's is-chosen marker), then reports
// any item that is painted active while not selected, selected while not painted, or out-signalled
// by a quiet tile — and whether the rail marker agrees with aria-selected.
//
// Usage: node scripts/probe-station-tab-state.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WIDTH = Math.max(1024, Number(process.env.SF_CAPTURE_WIDTH) || 1440);
const HEIGHT = Math.max(700, Number(process.env.SF_CAPTURE_HEIGHT) || 900);
const OUT = join(ROOT, '.devshots', 'station-overflow');
const TABS = ['market', 'shipworks', 'industry', 'contracts', 'factions', 'bar', 'ledger'];
mkdirSync(OUT, { recursive: true });

function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(baseUrl); if (r.status) return { child, baseUrl }; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server start timeout');
}

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: process.env.SF_CAPTURE_HEADLESS === '1', args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ } });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 30000 });
  await page.evaluate(() => { window.SF.bus.emit('game:new', { name: 'Tab State', seed: 47 }); window.SF.bus.emit('ui:closeAll', {}); });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  await page.evaluate(() => {
    const st = window.SF.state;
    const station = st.entityList.find((e) => e && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    window.SF.bus.emit('dock:docked', { stationId: station.data.stationId });
  });
  await page.waitForSelector('[data-screen="station"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  const results = [];
  for (const tab of TABS) {
    await page.evaluate((id) => {
      const root = document.querySelector('[data-screen="station"]');
      const t = root && (root.querySelector(`[data-nav="${id}"]`) || root.querySelector(`[data-tab="${id}"]`));
      if (t) t.click();
    }, tab);
    // Do not sleep and hope. A fixed wait measured mid-fade and produced phantom failures at 450ms,
    // and still flaked at 900ms on a loaded machine — the OUTGOING tab's fill had not finished
    // fading, so it briefly outscored the incoming one. Wait for every tile's fill to stop moving.
    //
    // The marker MUST be cleared after the click. A first version left it holding the previous
    // tab's settled value, so the very first poll matched it, declared the paint settled, and read
    // the state from BEFORE the click — which made the flake worse rather than better.
    await page.evaluate(() => { window.__sfTabPaint = null; });
    await page.waitForTimeout(350);
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-screen="station"]');
      if (!root) return false;
      const now = [...root.querySelectorAll('[data-nav]')]
        .map((el) => getComputedStyle(el).backgroundColor).join('|');
      const settled = window.__sfTabPaint === now;
      window.__sfTabPaint = now;
      return settled;
    }, null, { timeout: 8000, polling: 200 }).catch(() => {});
    const r = await page.evaluate((expected) => {
      const root = document.querySelector('[data-screen="station"]');
      const items = [...root.querySelectorAll('[data-nav]')];
      const opaque = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c || '');
        if (!m) return false;
        const p = m[1].split(',').map((n) => parseFloat(n));
        return p.length < 4 || p[3] > 0.02;
      };
      const read = items.map((el) => {
        const cs = getComputedStyle(el);
        const before = getComputedStyle(el, '::after');
        const id = el.getAttribute('data-nav');
        return {
          id,
          selected: el.getAttribute('aria-selected') === 'true' || el.classList.contains('is-active'),
          classes: [...el.classList].join(' '),
          // A NEXT suggestion is allowed to share the bright ink — it carries its own bead above
          // the word, so a tied label is a designed second mark, not a strip lying about location.
          next: el.hasAttribute('data-dp-next'),
          filled: opaque(cs.backgroundColor) || cs.backgroundImage !== 'none',
          bg: cs.backgroundColor,
          // The lamp bar is a 2px-tall ::after that exists on EVERY tile at width:0 — height alone
          // cannot tell quiet from lit, so the bar only counts when it is actually drawn wide —
          // and not at all when the orrery sheet sets the pseudo-element display:none.
          underline: before.content !== 'none' && before.display !== 'none'
            && (parseFloat(before.height) || 0) > 0.5
            && (parseFloat(before.width) || 0) > 4 && (parseFloat(before.opacity) || 1) > 0.05,
          color: cs.color,
        };
      });
      // This stylesheet redefines the same selectors at several depths, and reading it by eye has
      // produced wrong causes before. Report every rule that actually matches and sets a background,
      // in cascade order, so the winner is observed rather than inferred.
      const matchedBg = (el) => {
        const out = [];
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          if (!rules) continue;
          const walk = (list, media) => {
            for (const rule of list) {
              if (rule.cssRules && rule.conditionText !== undefined) { walk(rule.cssRules, rule.conditionText); continue; }
              if (!rule.selectorText) continue;
              let hit = false;
              try { hit = el.matches(rule.selectorText); } catch { hit = false; }
              if (!hit) continue;
              const bg = rule.style && (rule.style.getPropertyValue('background') || rule.style.getPropertyValue('background-color') || rule.style.getPropertyValue('background-image'));
              if (bg) out.push({ href: (sheet.href || '').split('/').pop(), media: media || null, selector: rule.selectorText.slice(0, 80), bg: bg.slice(0, 90) });
            }
          };
          walk(rules, null);
        }
        return out;
      };
      const activeEl = items.find((el) => el.getAttribute('aria-selected') === 'true' || el.classList.contains('is-active'));
      const attnEl = items.find((el) => el.classList.contains('is-attention'));

      // SALIENCE, not alpha. Alpha alone says amber-at-7% and white-at-5.5% are nearly equal; on a
      // dark teal ground the saturated hue is plainly hotter. Composite each tile's fill over the
      // strip ground and score how far it departs from that ground in both lightness and colour.
      // Selection must be the most salient fill on the strip — an invariant no alpha tweak can
      // satisfy by accident, and the one the eye actually obeys.
      const parseC = (c) => {
        const m = /rgba?\(([^)]+)\)/.exec(c || '');
        if (!m) return null;
        const p = m[1].split(',').map((n) => parseFloat(n));
        return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p.length > 3 ? p[3] : 1 };
      };
      const strip = document.querySelector('.sxb-ops') || (items[0] && items[0].parentElement);
      let groundEl = strip;
      let ground = null;
      while (groundEl && !ground) {
        const c = parseC(getComputedStyle(groundEl).backgroundColor);
        if (c && c.a > 0.5) ground = c;
        groundEl = groundEl.parentElement;
      }
      ground = ground || { r: 8, g: 14, b: 18, a: 1 };
      const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const salience = (el) => {
        const c = parseC(getComputedStyle(el).backgroundColor);
        if (!c) return 0;
        const over = {
          r: c.a * c.r + (1 - c.a) * ground.r,
          g: c.a * c.g + (1 - c.a) * ground.g,
          b: c.a * c.b + (1 - c.a) * ground.b,
        };
        const dl = Math.abs(lum(over) - lum(ground));
        const dc = Math.sqrt((over.r - ground.r) ** 2 + (over.g - ground.g) ** 2 + (over.b - ground.b) ** 2);
        return +(dl + dc).toFixed(2);
      };
      // The strip no longer signals with tile fills — the lamp bar (::after) is the paint channel:
      // width 0 on a quiet tile, 100% amber on the current one, 34% bone on hover. Score it with
      // the same ground-distance metric, weighted by how much of the tile the bar actually paints
      // and its opacity, so a collapsed bar contributes nothing and the lit bar dominates.
      const lampSalience = (el) => {
        const a = getComputedStyle(el, '::after');
        if (a.display === 'none') return 0;
        const w = parseFloat(a.width) || 0;
        const o = a.opacity === '' ? 1 : parseFloat(a.opacity);
        const c = parseC(a.backgroundColor);
        if (!c || c.a <= 0.02 || w < 2 || o <= 0.02) return 0;
        const over = {
          r: c.a * c.r + (1 - c.a) * ground.r,
          g: c.a * c.g + (1 - c.a) * ground.g,
          b: c.a * c.b + (1 - c.a) * ground.b,
        };
        const dl = Math.abs(lum(over) - lum(ground));
        const dc = Math.sqrt((over.r - ground.r) ** 2 + (over.g - ground.g) ** 2 + (over.b - ground.b) ** 2);
        const box = el.getBoundingClientRect();
        const coverage = box.width > 0 ? Math.min(1, w / box.width) : 0;
        return +((dl + dc) * o * coverage).toFixed(2);
      };
      // The third channel is the word itself: the current tab's label burns at full bone while the
      // quiet ones sit at half alpha. Same ground-distance metric, read off `color`.
      const inkSalience = (el) => {
        const c = parseC(getComputedStyle(el).color);
        if (!c) return 0;
        const over = {
          r: c.a * c.r + (1 - c.a) * ground.r,
          g: c.a * c.g + (1 - c.a) * ground.g,
          b: c.a * c.b + (1 - c.a) * ground.b,
        };
        const dl = Math.abs(lum(over) - lum(ground));
        const dc = Math.sqrt((over.r - ground.r) ** 2 + (over.g - ground.g) ** 2 + (over.b - ground.b) ** 2);
        return +(dl + dc).toFixed(2);
      };
      const salienceById = {};
      const lampById = {};
      const fillById = {};
      const inkById = {};
      for (const el of items) {
        const id = el.getAttribute('data-nav');
        fillById[id] = salience(el);
        lampById[id] = lampSalience(el);
        inkById[id] = inkSalience(el);
        // A tab's signal is whichever channel paints it hardest: the legacy fill, the lamp bar, or
        // the word's own ink.
        salienceById[id] = Math.max(fillById[id], lampById[id], inkById[id]);
      }

      const sel = read.filter((x) => x.selected).map((x) => x.id);
      // "painted active but not selected" is the lie the review found.
      const liars = read.filter((x) => !x.selected && x.filled).map((x) => x.id);
      // Unpainted means nothing distinguishes the current tile at all: no fill, no lit lamp bar,
      // and an ink no brighter than the dimmest quiet neighbour.
      const quietInks = read.filter((x) => !x.selected).map((x) => inkById[x.id]);
      const quietInk = quietInks.length ? Math.min(...quietInks) : -Infinity;
      const unpainted = read.filter((x) => x.selected && !x.filled && !x.underline
        && inkById[x.id] <= quietInk + 4).map((x) => x.id);
      // The ruled rail under the strip carries the binary truth: its is-chosen tick must sit under
      // the aria-selected tile. Ticks are built one per button in order, so indices align. Scoped
      // to the nav group — other station rows can carry the same rail furniture.
      const navRow = root.querySelector('.sx-dock__group--nav');
      const railTicks = navRow ? [...navRow.querySelectorAll('.orr-stationrow__tick')] : [];
      const selIdx = items.findIndex((el) => el.getAttribute('aria-selected') === 'true' || el.classList.contains('is-active'));
      const chosenIdx = railTicks.findIndex((t) => t.classList.contains('is-chosen'));
      const markerId = chosenIdx >= 0 && items[chosenIdx] ? items[chosenIdx].getAttribute('data-nav') : null;
      const markerMatches = railTicks.length ? (chosenIdx === selIdx) : null;
      return { expected, selectedIds: sel, filledLiars: liars, selectedButUnpainted: unpainted, read,
        activeBgRules: activeEl ? matchedBg(activeEl) : [], attentionBgRules: attnEl ? matchedBg(attnEl) : [],
        salienceById, fillById, lampById, inkById,
        markerMatches, markerId,
        // RANKING IS NOT ENOUGH, and finding that out cost a wrong claim. The broken version put
        // selection at 37.1 and attention at 31.4 — selection still ranked first, so a
        // "selection is the most salient" rule passed on the very layout it was written to catch.
        // What was actually wrong was the MARGIN: 1.18x is not a distinction the eye can use when
        // the weaker fill is the more saturated hue. Require real separation.
        activeSalience: sel.length === 1 ? salienceById[sel[0]] : null,
        runnerUpSalience: sel.length === 1
          ? Math.max(0, ...Object.entries(salienceById)
            .filter(([id]) => id !== sel[0] && !read.find((x) => x.id === id && x.next)).map(([, v]) => v))
          : null,
        activeIsMostSalient: sel.length === 1 && Object.entries(salienceById)
          .every(([id, v]) => {
            if (id === sel[0]) return true;
            if (v < salienceById[sel[0]]) return true;
            // a NEXT suggestion may tie the bright word; it may never out-burn it
            const nextTile = read.find((x) => x.id === id);
            return !!(nextTile && nextTile.next && v <= salienceById[sel[0]]);
          }),
        // The selected tab must wear the SELECTION colour. When the attention tab was also the
        // selected tab it wore the attention colour instead, and no ranking rule could see it
        // because that colour still outscored every quiet neighbour.
        activeFill: activeEl ? getComputedStyle(activeEl).backgroundColor : null,
        attentionFill: attnEl ? getComputedStyle(attnEl).backgroundColor : null,
        activeIsAlsoAttention: !!(activeEl && attnEl && activeEl === attnEl) };
    }, tab);
    results.push(r);
    const margin = r.runnerUpSalience > 0 ? (r.activeSalience / r.runnerUpSalience) : Infinity;
    r.margin = Number.isFinite(margin) ? +margin.toFixed(2) : null;
    console.log(`${tab.padEnd(10)} selected=[${r.selectedIds.join(',')}]  `
      + `salience ${r.activeSalience} vs ${r.runnerUpSalience}  margin ${r.margin === null ? 'inf' : r.margin + 'x'}`
      + `  marker ${r.markerMatches === null ? 'none' : (r.markerMatches ? 'on selection' : 'at ' + r.markerId)}`
      + `${r.activeIsAlsoAttention ? '  (also the attention tab)' : ''}`);
  }
  writeFileSync(join(OUT, 'tab-state.json'), JSON.stringify(results, null, 2));
  // The selection fill, learned from a tab that is NOT the attention tab. The attention tab must
  // wear that same fill when selected; before the fix it wore amber instead, and no ranking rule
  // could see it because amber still outscored every quiet neighbour.
  const plain = results.find((r) => r.activeFill && !r.activeIsAlsoAttention);
  const selectionFill = plain ? plain.activeFill : null;
  const MIN_MARGIN = 2;
  const failures = [];
  for (const r of results) {
    for (const id of r.selectedButUnpainted) failures.push(`${r.expected}: ${id} is selected but unpainted`);
    if (!r.activeIsMostSalient) failures.push(`${r.expected}: selection is not the most salient signal on the strip`);
    // The rail marker is the binary truth channel — when it exists it must sit under the selected
    // tab, and its agreement is what separates the bright word from a merely loud neighbour. Only
    // when there is NO marker does the margin law hold alone: a strip with nothing but paint
    // between "current" and "loudest quiet" needs real separation the eye can use.
    if (r.markerMatches === false) {
      failures.push(`${r.expected}: the rail's chosen tick sits under ${r.markerId}, not the selected tab`);
    } else if (r.markerMatches === null && r.margin !== null && r.margin < MIN_MARGIN) {
      failures.push(`${r.expected}: selection only ${r.margin}x the next signal (needs ${MIN_MARGIN}x)`
        + ' — a margin the eye cannot use when the weaker signal is the more saturated hue');
    }
    if (selectionFill && r.activeFill && r.activeFill !== selectionFill) {
      failures.push(`${r.expected}: selected tab wears ${r.activeFill}, not the selection fill ${selectionFill}`);
    }
  }
  console.log(`\nselection fill ${selectionFill}   attention fill ${(results[0] || {}).attentionFill}`);
  console.log(`TOTAL tab-state failures: ${failures.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  if (failures.length) process.exitCode = 1;
  console.log('wrote →', join(OUT, 'tab-state.json'));
} catch (err) {
  console.error('probe-station-tab-state failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}
