#!/usr/bin/env node
// One-off: dump the phone mission tracker's box and children at 390x844 to find its height cost.
import { startBenchServer } from '../lib/benchServer.mjs';
import { loadPlaywright } from '../lib/load-playwright.mjs';

const server = await startBenchServer();
const playwright = await loadPlaywright();
let browser;
try {
  browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=mobileFlight&chrome=0&phone=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__BENCH_READY === true, null, { timeout: 120000 });
  await page.evaluate(async () => {
    document.documentElement.classList.add('sf-reduce-motion');
    await document.fonts.ready;
    for (let i = 0; i < 6; i += 1) await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 200));
  });
  const matched = await page.evaluate(() => {
    const t = document.querySelector('#hud .sf-mission-tracker');
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list, media) => {
        for (const r of list) {
          if (r.cssRules) walk(r.cssRules, r.conditionText || media);
          else if (r.selectorText) {
            try {
              if (t.matches(r.selectorText) && /display/.test(r.cssText)) hits.push(`${media || ''} | ${r.cssText.slice(0, 140)}`);
            } catch { /* pseudo selectors */ }
          }
        }
      };
      walk(rules, '');
    }
    return hits;
  });
  console.log('DISPLAY RULES MATCHING TRACKER:\n' + matched.join('\n'));
  const chain = await page.evaluate(() => {
    let el = document.querySelector('#hud .sf-mission-tracker');
    const out = [];
    while (el && out.length < 8) {
      out.push(`<${el.tagName.toLowerCase()} id="${el.id}" .${String(el.className?.baseVal ?? el.className).slice(0, 60)}>`);
      el = el.parentElement;
    }
    return out.join('\n');
  });
  console.log('PARENT CHAIN:\n' + chain);
  console.log('flag:', await page.evaluate(() => document.documentElement.outerHTML.slice(0, 300)));
  console.log('RADAR SVG TEXT:', await page.evaluate(() => {
    const svg = document.querySelector('#hud .sf-radar-orrery');
    if (!svg) return 'no svg';
    return [...svg.querySelectorAll('text,tspan,g')].map((el) => `${el.tagName}[${String(el.getAttribute('class') || '')}] display=${getComputedStyle(el).display} "${(el.textContent || '').trim().slice(0, 40)}"`).filter((s) => !s.endsWith('""')).join('\n');
  }));
  console.log('RADAR FLAGS:', await page.evaluate(() => {
    const d = document.querySelector('#hud .sf-radar');
    const c = d && d.querySelector('canvas');
    return JSON.stringify({ dial: d && `${d.clientWidth}x${d.clientHeight}`, canvas: c && `${c.width}x${c.height}`, canvasCss: c && `${c.clientWidth}x${c.clientHeight}` });
  }));
  const out = await page.evaluate(() => {
    const dump = (el, depth = 0) => {
      if (!el || depth > 3) return '';
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return `${'  '.repeat(depth)}<${el.tagName.toLowerCase()} .${String(el.className?.baseVal ?? el.className).slice(0, 50)}> ` +
        `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10} display:${cs.display} pos:${cs.position} ` +
        `font:${cs.fontSize}/${cs.lineHeight} ws:${cs.whiteSpace} ${el.hidden ? 'HIDDEN' : ''}\n` +
        [...el.children].map((c) => dump(c, depth + 1)).join('');
    };
    const t = document.querySelector('#hud .sf-mission-tracker');
    const w = document.querySelector('#hud .sf-radar-wrap');
    return 'TRACKER:\n' + dump(t) + '\nRADAR WRAP:\n' + dump(w);
  });
  console.log(out);
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
