#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });

const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
let browser = null;
let context = null;

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--incognito', '--no-first-run', '--disable-extensions'],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'pointer regression must use the canonical root');
  await bootNewGame(page);
  const targetId = await claimAndReadB0Target(page);

  await page.keyboard.press('KeyM');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    return screen?._activeLevel?.() === 'local';
  }, null, { timeout: 10_000 });
  const searchLabel = await page.waitForFunction((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const target = screen?._clickTargets?.find((entry) => String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id) === String(id));
    return String(target?.name || target?.label || '').trim() || null;
  }, targetId, { timeout: 20_000 }).then((handle) => handle.jsonValue());
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 5_000 });
  await search.fill(searchLabel);

  const searchState = await page.evaluate((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const list = screen?._searchResultsList;
    const index = Array.isArray(list)
      ? list.findIndex((entry) => String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id) === String(id))
      : -1;
    return {
      index,
      input: document.querySelector('.gm-search-input')?.value || null,
      level: screen?._activeLevel?.() || null,
      listLength: Array.isArray(list) ? list.length : null,
      firstIds: Array.isArray(list) ? list.slice(0, 8).map((entry) => String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id)) : [],
    };
  }, targetId);
  const resultIndex = searchState.index;
  assert.equal(resultIndex >= 0, true,
    `exact B0 row must remain in filtered search: ${JSON.stringify({ targetId, searchLabel, searchState })}`);
  const result = page.locator(`.gm-search-item[data-idx="${resultIndex}"]`);
  await result.waitFor({ state: 'visible', timeout: 10_000 });
  const expected = await page.evaluate((idx) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const target = screen?._searchResultsList?.[idx];
    return target ? {
      id: String(target.entityId ?? target.targetEntityId ?? target.id),
      name: target.name,
      kind: target.kind,
      pos: { x: target.x, z: target.z },
    } : null;
  }, resultIndex);
  assert.equal(expected?.id, String(targetId), `expected exact B0 row, got ${JSON.stringify(expected)}`);
  const routingContext = await page.evaluate((id) => {
    const state = window.SF.state;
    const trackedId = state.ui?.trackedMissionId;
    const tracked = (state.missions?.active || []).find((mission) => mission?.id === trackedId);
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    return {
      targetId: String(id),
      waypoint: state.nav?.waypoint ? JSON.parse(JSON.stringify(state.nav.waypoint)) : null,
      trackedMission: tracked ? {
        id: tracked.id,
        status: tracked.status,
        samplePos: tracked.params?.samplePos || null,
        targetEntityIds: (tracked.targetEntityIds || []).map(String),
      } : null,
      list: (screen?._searchResultsList || []).map((entry, index) => ({
        index,
        id: String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id),
        name: entry?.name,
        pos: { x: entry?.x, z: entry?.z },
      })).filter((entry) => entry.index < 8 || entry.id === String(id)),
    };
  }, targetId);

  await page.evaluate(() => {
    window.__MAP_POINTER_TRACE__ = [];
    const describe = (node) => node instanceof Element
      ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className ? `.${String(node.className).trim().replace(/\s+/g, '.')}` : ''}`
      : String(node?.nodeName || node);
    const record = (phase) => (event) => {
      window.__MAP_POINTER_TRACE__.push({
        phase,
        type: event.type,
        target: describe(event.target),
        path: event.composedPath().slice(0, 8).map(describe),
      });
    };
    document.addEventListener('pointerdown', record('document-capture'), { capture: true, once: true });
    document.addEventListener('click', record('document-capture'), { capture: true, once: true });
    document.querySelector('.gm-search-results')?.addEventListener('click', record('results-capture'), { capture: true, once: true });
  });

  const box = await result.boundingBox();
  assert(box && box.width > 2 && box.height > 2, 'search row must have a real pointer-sized box');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hitBefore = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    const row = document.querySelector('.gm-search-item.selected') || document.querySelector('.gm-search-item');
    const describe = (node) => node instanceof Element
      ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.className ? `.${String(node.className).trim().replace(/\s+/g, '.')}` : ''}`
      : null;
    return {
      hit: describe(hit),
      hitRow: describe(hit?.closest?.('.gm-search-item')),
      rowPointerEvents: row ? getComputedStyle(row).pointerEvents : null,
      resultsPointerEvents: row?.parentElement ? getComputedStyle(row.parentElement).pointerEvents : null,
      resultsZIndex: row?.parentElement ? getComputedStyle(row.parentElement).zIndex : null,
    };
  }, center);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(100);
  const pointerSelected = await selectedTarget(page);
  const pointerTrace = await page.evaluate(() => window.__MAP_POINTER_TRACE__ || []);

  // The same public search must remain keyboard-navigable to a distinct result. This differential
  // proves that a red pointer assertion belongs to hit testing/event routing, not search resolution.
  await search.fill(searchLabel);
  const keyboardExpected = await page.evaluate((pointerId) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const list = screen?._searchResultsList || [];
    const index = list.findIndex((entry) => String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id) !== String(pointerId));
    const target = index >= 0 ? list[index] : null;
    return target ? {
      index,
      id: String(target.entityId ?? target.targetEntityId ?? target.id),
      name: target.name,
      kind: target.kind,
    } : null;
  }, expected.id);
  assert(keyboardExpected, 'search must expose a second row for independent keyboard selection');
  await search.focus();
  for (let index = 0; index < keyboardExpected.index; index += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const keyboardSelected = await selectedTarget(page);
  assert.equal(keyboardSelected?.id, keyboardExpected.id,
    `keyboard Enter must select a different visible row ${keyboardExpected.id}: ${JSON.stringify(keyboardSelected)}`);

  // Hold the real action node across several inspector refresh cadences, then activate it from its
  // physical center. The document-bubble trace observes the synchronous ui:setCourse result before
  // the next sim tick can legitimately report arrival and clear a very-near waypoint.
  const actionBefore = await page.evaluate(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const button = document.querySelector('#gm-set-course-btn');
    window.__MAP_ACTION_SCREEN__ = screen;
    window.__MAP_ACTION_BUTTON__ = button;
    return {
      connected: !!button?.isConnected,
      hidden: button?.hidden ?? null,
      disabled: button?.disabled ?? null,
      selectedId: screen?._selectedTarget
        ? String(screen._selectedTarget.entityId ?? screen._selectedTarget.targetEntityId ?? screen._selectedTarget.id)
        : null,
    };
  });
  await page.waitForTimeout(400);
  const actionStable = await page.evaluate(() => {
    const button = document.querySelector('#gm-set-course-btn');
    const held = window.__MAP_ACTION_BUTTON__;
    const screen = window.__MAP_ACTION_SCREEN__;
    return {
      sameNode: button === held,
      connected: !!held?.isConnected,
      hidden: held?.hidden ?? null,
      disabled: held?.disabled ?? null,
      selectedId: screen?._selectedTarget
        ? String(screen._selectedTarget.entityId ?? screen._selectedTarget.targetEntityId ?? screen._selectedTarget.id)
        : null,
    };
  });
  assert.deepEqual(actionBefore, {
    connected: true,
    hidden: false,
    disabled: false,
    selectedId: keyboardExpected.id,
  }, `selected result must expose a usable primary action: ${JSON.stringify(actionBefore)}`);
  assert.deepEqual(actionStable, {
    sameNode: true,
    connected: true,
    hidden: false,
    disabled: false,
    selectedId: keyboardExpected.id,
  }, `inspector refresh must preserve the primary action node and selection: ${JSON.stringify(actionStable)}`);

  await page.evaluate(() => {
    window.__MAP_ACTION_TRACE__ = [];
    document.addEventListener('click', (event) => {
      if (!event.composedPath().includes(window.__MAP_ACTION_BUTTON__)) return;
      const state = window.SF?.state;
      const selected = window.__MAP_ACTION_SCREEN__?._selectedTarget;
      const autopilot = state?.nav?.autopilot;
      window.__MAP_ACTION_TRACE__.push({
        selectedId: selected
          ? String(selected.entityId ?? selected.targetEntityId ?? selected.id)
          : null,
        autopilot: autopilot ? {
          active: autopilot.active,
          status: autopilot.status,
          targetEntityId: autopilot.targetEntityId == null ? null : String(autopilot.targetEntityId),
          label: autopilot.label,
        } : null,
        mapVisible: document.querySelector('#sf-galaxymap')?.classList.contains('sf-screen--visible') || false,
      });
    }, { once: true });
  });
  const actionBox = await page.locator('#gm-set-course-btn').boundingBox();
  assert(actionBox && actionBox.width > 2 && actionBox.height > 2,
    `primary action must retain a real pointer-sized box: ${JSON.stringify({ actionBefore, actionStable, actionBox })}`);
  const actionCenter = { x: actionBox.x + actionBox.width / 2, y: actionBox.y + actionBox.height / 2 };
  const actionHit = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return {
      id: hit?.id || null,
      closestId: hit?.closest?.('button')?.id || null,
    };
  }, actionCenter);
  assert.equal(actionHit.closestId, 'gm-set-course-btn',
    `primary action center must hit the button: ${JSON.stringify({ actionCenter, actionHit })}`);
  await page.mouse.click(actionCenter.x, actionCenter.y);
  await page.waitForTimeout(100);
  const actionTrace = await page.evaluate(() => window.__MAP_ACTION_TRACE__ || []);
  const navAfter = await page.evaluate(() => {
    const autopilot = window.SF?.state?.nav?.autopilot;
    return {
      autopilot: autopilot ? {
        active: autopilot.active,
        status: autopilot.status,
        targetEntityId: autopilot.targetEntityId == null ? null : String(autopilot.targetEntityId),
        label: autopilot.label,
      } : null,
      mapVisible: document.querySelector('#sf-galaxymap')?.classList.contains('sf-screen--visible') || false,
    };
  });
  assert.equal(actionTrace.length, 1, `physical primary-action click must bubble once: ${JSON.stringify(actionTrace)}`);
  assert.equal(actionTrace[0].selectedId, keyboardExpected.id,
    `physical primary action must retain selected target through activation: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].autopilot?.active, true,
    `ui:setCourse must synchronously arm autopilot: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].autopilot?.targetEntityId, keyboardExpected.id,
    `autopilot must target the selected search result: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].mapVisible, false,
    `successful primary action must pop the map: ${JSON.stringify(actionTrace[0])}`);

  const evidence = {
    expected, routingContext, center, hitBefore, pointerTrace, pointerSelected,
    keyboardExpected, keyboardSelected, actionBefore, actionStable, actionCenter,
    actionHit, actionTrace, navAfter,
  };
  assert.equal(pointerSelected?.id, expected.id,
    `real row-center pointer click must select exact result: ${JSON.stringify(evidence)}`);
  console.log(`Galaxy-map search pointer OK: ${JSON.stringify(evidence)}`);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function bootNewGame(page) {
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), null, {
    timeout: 30_000,
  });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, null, { timeout: 120_000 });
  const begin = page.getByRole('button', { name: /begin/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.locator('#gl-canvas').focus();
}

async function claimAndReadB0Target(page) {
  const spindleId = await page.evaluate(() => (window.SF.state.entityList || [])
    .find((entity) => entity?.data?.scenarioActorId === 'evidence_spindle_47a')?.id ?? null);
  assert.notEqual(spindleId, null, '47-A evidence spindle must exist in normal play');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await aimAt(page, spindleId);
    await page.keyboard.press('KeyF');
    const claimed = await page.waitForFunction(() => window.SF?.state?.scenario?.safeOpening?.spindleClaimed === true,
      null, { timeout: 3_000 }).then(() => true).catch(() => false);
    if (claimed) break;
  }
  assert.equal(await page.evaluate(() => window.SF?.state?.scenario?.safeOpening?.spindleClaimed === true), true,
    'ordinary F must claim the visible evidence spindle');
  await page.waitForTimeout(220);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('KeyF');
    const cut = await page.waitForFunction(() => window.SF?.state?.player?.tether?.active !== true,
      null, { timeout: 2_000 }).then(() => true).catch(() => false);
    if (cut) break;
    await page.waitForTimeout(220);
  }
  assert.equal(await page.evaluate(() => window.SF?.state?.player?.tether?.active === true), false,
    'ordinary F must cut the evidence-spindle tether');
  const targetId = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = (state.missions?.active || []).find((entry) => entry?.storyTag === 'campaign47a:b0:recovery');
    const wanted = mission?.params?.samplePos || state.nav?.waypoint?.pos || null;
    const player = state.entities.get(state.playerId);
    let best = null;
    let bestDistance = Infinity;
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid' || !entity.pos) continue;
      const origin = wanted || player.pos;
      const distance = Math.hypot(entity.pos.x - origin.x, entity.pos.z - origin.z);
      if (distance < bestDistance) { bestDistance = distance; best = entity; }
    }
    return best?.id ?? null;
  });
  assert.notEqual(targetId, null, 'B0 must expose a live recovery asteroid');
  return targetId;
}

async function aimAt(page, entityId) {
  const point = await page.evaluate((id) => {
    const entity = window.SF.state.entities.get(id);
    const projected = entity && window.SF.helpers.worldToScreen?.({ x: entity.pos.x, y: 0, z: entity.pos.z });
    return projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)
      ? { x: projected.x, y: projected.y }
      : { x: innerWidth * 0.6, y: innerHeight * 0.5 };
  }, entityId);
  await page.mouse.move(
    Math.max(4, Math.min(VIEWPORT.width - 4, point.x)),
    Math.max(4, Math.min(VIEWPORT.height - 4, point.y)),
  );
  await page.waitForTimeout(80);
}

async function selectedTarget(page) {
  return page.evaluate(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const target = screen?._selectedTarget;
    return target ? {
      id: String(target.entityId ?? target.targetEntityId ?? target.id),
      name: target.name,
      kind: target.kind,
    } : null;
  });
}
