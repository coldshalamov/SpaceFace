#!/usr/bin/env node
// Focused probe: new game → flight → accept the Yard Perimeter Writ → Track Nav → local map →
// search 'Rook Nine' → Enter → click the inspector's primary action. Reproduces the public
// hunt-acquire leg of check-m3-player-facing-public-route.mjs without the ~10 min preamble,
// and dumps the click chain (button state, elementFromPoint, ui:setCourse emissions, resulting
// autopilot) so a no-arm failure names which half failed. Read-only diagnostic.
// Usage: node scripts/probe-map-track-target.mjs
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function findSystemBrowser() {
  const candidates = process.platform === 'win32' ? [
    process.env.SPACEFACE_BROWSER_EXE,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : [
    process.env.SPACEFACE_BROWSER_EXE,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port), SPACEFACE_PLAYER_STORE_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}/`;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 25000);
    const tryFetch = async () => {
      for (let i = 0; i < 50; i++) {
        try {
          const r = await fetch(baseUrl);
          if (r.status) { clearTimeout(t); resolve(); return; }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 200));
      }
      clearTimeout(t);
      reject(new Error('server fetch timeout'));
    };
    tryFetch();
    child.on('error', reject);
    child.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return { child, baseUrl };
}

async function pointerClick(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error('no bounding box');
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
}

const DUMP = `(() => {
  const state = window.SF?.state;
  const nav = state?.nav;
  const mission = (state?.missions?.active || [])
    .find((m) => m?.originCareer === 'hunter' && m?.originContractId === 'yard_writ');
  const btn = document.querySelector('#gm-set-course-btn');
  const rect = btn ? btn.getBoundingClientRect() : null;
  const top = rect && rect.width > 0
    ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
  const inspector = document.querySelector('.gm-inspector-content');
  return {
    autopilot: nav?.autopilot ? {
      active: nav.autopilot.active, label: nav.autopilot.label,
      targetEntityId: nav.autopilot.targetEntityId, status: nav.autopilot.status,
    } : null,
    navWaypoint: nav?.waypoint ? { kind: nav.waypoint.kind, label: nav.waypoint.label } : null,
    missionTargets: (mission?.targetEntityIds || []).map(String),
    missionStatus: mission?.status || null,
    trackedMissionId: state?.ui?.trackedMissionId || null,
    buttonText: btn?.textContent?.trim() || null,
    buttonHidden: btn?.hidden ?? null,
    buttonDisabled: btn?.disabled ?? null,
    interceptor: top && top !== btn && !(btn && btn.contains(top))
      ? top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + '.' + String(top.className || '')
      : null,
    courses: (window.__TRACK_DEBUG__?.courses || []),
    searchItems: [...document.querySelectorAll('.gm-search-item-name')].map((el) => el.textContent.trim()),
    inspectorHead: inspector ? String(inspector.innerText || '').replace(/\\s+/g, ' ').slice(0, 400) : null,
    mapVisible: !!document.querySelector('#sf-galaxymap:not([hidden])'),
  };
})()`;

let server = null;
let browser = null;
try {
  server = await startServer();
  const { chromium } = await loadPlaywright();
  const executablePath = findSystemBrowser();
  browser = await chromium.launch({
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* ok */ }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err && err.message || err).slice(0, 300)));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Track Probe', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const st = window.SF && window.SF.state;
    const p = st && st.entities && st.entities.get(st.playerId);
    return !!(st && st.mode === 'flight' && p && p.alive !== false && p.hull > 0);
  }, null, { timeout: 120000 });
  console.log('[probe] flight reached');

  // Accept the authored hunter writ through the public mission log.
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'visible', timeout: 20000 });
  const hunterCard = page.locator('[data-screen="missionLog"] [data-testid="mission-log-career-chip"][data-career-id="hunter"]');
  await hunterCard.waitFor({ state: 'visible', timeout: 20000 });
  await hunterCard.locator('button[data-career-act="originAccept"]').click();
  await page.waitForTimeout(1500);

  const authoredMission = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = state.missions.active.find((m) => m?.status === 'active'
      && m.originCareer === 'hunter' && m.originContractId === 'yard_writ');
    const target = mission && state.entities.get(mission.targetEntityIds[0]);
    return { id: mission?.id || null, targetId: target?.id || null,
      targetName: target?.data?.name || null, alive: target ? target.alive !== false : null };
  });
  console.log('[probe] mission:', JSON.stringify(authoredMission));

  // Track Nav on the writ row (the route's public path).
  const writRow = page.locator(`[data-screen="missionLog"] .k-row[data-id="${authoredMission.id}"]`);
  await writRow.waitFor({ state: 'visible', timeout: 20000 });
  await pointerClick(page, writRow);
  const trackButton = page.locator(`[data-screen="missionLog"] button[data-act="track"][data-mid="${authoredMission.id}"]`);
  await trackButton.waitFor({ state: 'visible', timeout: 20000 });
  await pointerClick(page, trackButton);
  await page.waitForFunction((mid) => String(window.SF?.state?.ui?.trackedMissionId) === String(mid),
    authoredMission.id, { timeout: 10000 });
  console.log('[probe] tracked mission armed');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-screen="missionLog"]', { state: 'hidden', timeout: 10000 });

  // Recreate the run-11 nav residue: the route arrives here straight off a COMPLETED Helios
  // course — nav.waypoint/autopilot still hold the 'arrived' residue the undock left behind.
  // The search-priority rule gives any entry matching waypoint.targetEntityId top rank, so the
  // stale residue is the one state difference a fresh boot cannot produce on its own.
  await page.evaluate(() => {
    const st = window.SF.state;
    const helios = (st.stations && [...st.stations.values ? st.stations.values() : []][0]) || null;
    const stationId = helios && (helios.id || (helios.data && helios.data.stationId));
    const ent = st.entities && [...st.entities.values()].find((e) => e && e.data && e.data.isStation);
    st.nav.waypoint = {
      kind: 'station', label: 'Helios Station', stationId: stationId || 'station_helios',
      targetEntityId: ent ? ent.id : 2, sectorId: st.nav.sectorId || null,
      pos: ent && ent.pos ? { x: ent.pos.x, z: ent.pos.z } : null,
    };
    st.nav.autopilot = {
      active: false, status: 'arrived', label: 'Helios Station',
      targetEntityId: ent ? ent.id : 2,
      target: ent && ent.pos ? { x: ent.pos.x, z: ent.pos.z } : null,
      arrivalRadius: 90,
    };
  });
  console.log('[probe] stale Helios residue injected');
  await page.locator('#gl-canvas').focus();
  await page.keyboard.press('KeyM');
  const galaxyMap = page.locator('#sf-galaxymap');
  await galaxyMap.waitFor({ state: 'visible', timeout: 20000 });
  const searchInput = galaxyMap.locator('.gm-search-input');
  await page.keyboard.press('/');
  const searchFocused = await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true, null, { timeout: 1000 },
  ).then(() => true, () => false);
  if (!searchFocused) await pointerClick(page, searchInput);
  await page.keyboard.type('Rook Nine');
  await galaxyMap.locator('.gm-search-item-name', { hasText: 'Rook Nine' }).first()
    .waitFor({ state: 'visible', timeout: 10000 });
  console.log('[probe] pre-enter:', await page.evaluate(DUMP));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  console.log('[probe] post-enter:', await page.evaluate(DUMP));

  const trackTarget = galaxyMap.locator('#gm-set-course-btn');
  await trackTarget.waitFor({ state: 'visible', timeout: 10000 });
  const btnText = (await trackTarget.innerText()).trim();
  console.log('[probe] button label:', btnText);

  await page.evaluate(() => {
    window.__TRACK_DEBUG__ = { courses: [] };
    window.SF.bus.on('ui:setCourse', (payload) => {
      window.__TRACK_DEBUG__.courses.push({
        type: payload?.type || null, label: payload?.label || null,
        targetEntityId: payload?.targetEntityId ?? null,
        autopilot: payload?.autopilot ?? null,
      });
    });
  });
  await pointerClick(page, trackTarget);
  await page.waitForTimeout(1200);
  const postClick = await page.evaluate(DUMP);
  console.log('[probe] post-click:', postClick);

  // Retry once like the route does — only when the first click did not arm the quarry track.
  if (!(postClick.autopilot && postClick.autopilot.active === true
    && postClick.missionTargets.includes(String(postClick.autopilot.targetEntityId)))) {
    await pointerClick(page, trackTarget);
    await page.waitForTimeout(1200);
    console.log('[probe] post-retry:', await page.evaluate(DUMP));
  }

  // Mechanism check for the run-12 interception: the actions band is a shrinkable scrollport
  // (flex 0 1 auto / overflow auto). Reopen the map, re-select the contact, then squeeze the
  // viewport height until the inspector column overflows and report whether the button's own
  // rect slides under the parity key — i.e. whether elementFromPoint at the button center hits
  // the key instead of the button.
  if (!(await galaxyMap.isVisible().catch(() => false))) {
    await page.locator('#gl-canvas').focus();
    await page.keyboard.press('KeyM');
    await galaxyMap.waitFor({ state: 'visible', timeout: 20000 });
  }
  const searchInput2 = galaxyMap.locator('.gm-search-input');
  await pointerClick(page, searchInput2);
  await page.keyboard.type('Rook Nine');
  await galaxyMap.locator('.gm-search-item-name', { hasText: 'Rook Nine' }).first()
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1440, height: 620 });
  await page.waitForTimeout(400);
  const squeeze = await page.evaluate(() => {
    const btn = document.querySelector('#gm-set-course-btn');
    const actions = document.querySelector('.gm-inspector-actions');
    const key = document.querySelector('.gm-parity-key');
    const inspector = document.querySelector('.gm-right-inspector');
    if (!btn || !actions || !key || !inspector) return { missing: true };
    const rect = btn.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const keyRect = key.getBoundingClientRect();
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const describe = (el) => el ? el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '') + '.' + String(el.className || '') : 'none';
    return {
      buttonRect: { y: Math.round(rect.y), h: Math.round(rect.height) },
      actionsRect: { y: Math.round(actionsRect.y), h: Math.round(actionsRect.height) },
      keyRect: { y: Math.round(keyRect.y), h: Math.round(keyRect.height) },
      inspectorScroll: { scrollTop: Math.round(inspector.scrollTop),
        clientH: Math.round(inspector.clientHeight), scrollH: Math.round(inspector.scrollHeight) },
      actionsScroll: { scrollTop: Math.round(actions.scrollTop),
        clientH: Math.round(actions.clientHeight), scrollH: Math.round(actions.scrollHeight) },
      interceptor: (top === btn || btn.contains(top)) ? null : describe(top),
      btnClipped: rect.bottom > actionsRect.bottom,
    };
  });
  console.log('[probe] squeeze 620px:', squeeze);
  // The CSS fix keeps the button fully painted inside the band; if it sits below the column's
  // own scroll fold, a player scrolls to reach it — verify scrollIntoView restores hit-testing.
  await page.evaluate(() => {
    const btn = document.querySelector('#gm-set-course-btn');
    if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
  });
  await page.waitForTimeout(300);
  const afterScroll = await page.evaluate(() => {
    const btn = document.querySelector('#gm-set-course-btn');
    const rect = btn ? btn.getBoundingClientRect() : null;
    const top = rect && rect.width > 0
      ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
    return {
      buttonRect: rect ? { y: Math.round(rect.y), h: Math.round(rect.height) } : null,
      interceptor: (top && btn && top !== btn && !btn.contains(top))
        ? top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + '.' + String(top.className || '')
        : null,
    };
  });
  console.log('[probe] squeeze+scroll:', afterScroll);
  await page.setViewportSize({ width: 1440, height: 900 });
} catch (err) {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ok */ }
  try { if (server && server.child) server.child.kill(); } catch { /* ok */ }
}
