#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const EVIDENCE_DIR = fileURLToPath(new URL('../.devshots/', import.meta.url));
const EVIDENCE_PATH = fileURLToPath(new URL('../.devshots/galaxy-map-search-pointer-evidence.json', import.meta.url));
const SCREENSHOT_TEMP_PATH = path.join(EVIDENCE_DIR, `.galaxy-map-active-objective-search.${process.pid}.pending.png`);
const EVIDENCE_TEMP_PATH = `${EVIDENCE_PATH}.${process.pid}.pending`;

let server = null;
let browser = null;
let context = null;

try {
  server = await acquireVisualProbeServer({ root: ROOT });
  const { chromium } = await loadPlaywright();
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
  const objective = await readActiveObjectiveTarget(page);
  const { sourceId, label: searchLabel } = objective;

  await page.keyboard.press('KeyM');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    return screen?._activeLevel?.() === 'local';
  }, null, { timeout: 10_000 });
  const canvasObjective = await page.waitForFunction(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const target = screen?._clickTargets?.find((entry) => entry?.objective === true);
    return target ? {
      id: target.id,
      name: String(target.name || target.label || '').trim(),
      targetEntityId: target.targetEntityId == null ? null : String(target.targetEntityId),
      pos: { x: target.x, z: target.z },
    } : null;
  }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue());
  assert.equal(canvasObjective.name.length > 0, true, 'canvas objective must have a visible label');
  assert.deepEqual(canvasObjective.pos, objective.pos,
    `canvas marker and searchable objective must share the persisted position: ${JSON.stringify({ objective, canvasObjective })}`);
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 5_000 });
  await search.fill(searchLabel);

  const searchState = await page.evaluate((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const list = screen?._searchResultsList;
    const index = Array.isArray(list)
      ? list.findIndex((entry) => String(entry?.id) === String(id))
      : -1;
    const match = index >= 0 ? list[index] : null;
    return {
      index,
      input: document.querySelector('.gm-search-input')?.value || null,
      level: screen?._activeLevel?.() || null,
      listLength: Array.isArray(list) ? list.length : null,
      firstIds: Array.isArray(list) ? list.slice(0, 8).map((entry) => String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id)) : [],
      match: match ? {
        sourceId: match.id,
        name: match.name,
        kind: match.kind,
        objective: match.objective === true,
        targetEntityId: match.targetEntityId == null ? null : String(match.targetEntityId),
      } : null,
    };
  }, sourceId);
  const resultIndex = searchState.index;
  assert.equal(resultIndex >= 0, true,
    `exact active-objective row must remain in filtered search: ${JSON.stringify({ objective, searchState })}`);
  assert.deepEqual(searchState.match, {
    sourceId: 'active-map-goal',
    name: searchLabel,
    kind: 'waypoint',
    objective: true,
    targetEntityId: objective.targetEntityId,
  }, `search must resolve the synthetic active-goal row, not an ambient contact: ${JSON.stringify(searchState)}`);
  const result = page.locator(`.gm-search-item[data-idx="${resultIndex}"]`);
  await result.waitFor({ state: 'visible', timeout: 10_000 });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: SCREENSHOT_TEMP_PATH, type: 'png', animations: 'disabled' });
  const expected = await page.evaluate((idx) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const target = screen?._searchResultsList?.[idx];
    return target ? {
      id: String(target.entityId ?? target.targetEntityId ?? target.id),
      sourceId: target.id,
      name: target.name,
      kind: target.kind,
      objective: target.objective === true,
      pos: { x: target.x, z: target.z },
    } : null;
  }, resultIndex);
  assert.equal(expected?.id, sourceId, `expected exact active-objective row, got ${JSON.stringify(expected)}`);
  assert.equal(expected?.sourceId, 'active-map-goal', `expected synthetic active-goal row, got ${JSON.stringify(expected)}`);
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
  }, sourceId);

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
  await search.fill('asteroid');
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

  // Return to the exact active-objective row before exercising the persistent action node.
  await search.fill(searchLabel);
  await search.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const actionSelected = await selectedTarget(page);
  assert.equal(actionSelected?.id, expected.id,
    `keyboard must restore the active objective before course activation: ${JSON.stringify(actionSelected)}`);

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
    selectedId: expected.id,
  }, `selected result must expose a usable primary action: ${JSON.stringify(actionBefore)}`);
  assert.deepEqual(actionStable, {
    sameNode: true,
    connected: true,
    hidden: false,
    disabled: false,
    selectedId: expected.id,
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
          target: autopilot.target ? { x: autopilot.target.x, z: autopilot.target.z } : null,
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
        target: autopilot.target ? { x: autopilot.target.x, z: autopilot.target.z } : null,
      } : null,
      mapVisible: document.querySelector('#sf-galaxymap')?.classList.contains('sf-screen--visible') || false,
    };
  });
  assert.equal(actionTrace.length, 1, `physical primary-action click must bubble once: ${JSON.stringify(actionTrace)}`);
  assert.equal(actionTrace[0].selectedId, expected.id,
    `physical primary action must retain selected target through activation: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].autopilot?.active, true,
    `ui:setCourse must synchronously arm autopilot: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].autopilot?.targetEntityId, objective.targetEntityId,
    `autopilot target identity must match the persisted objective: ${JSON.stringify(actionTrace[0])}`);
  assert.deepEqual(actionTrace[0].autopilot?.target, objective.pos,
    `autopilot must target the selected objective position: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].autopilot?.label, objective.label,
    `autopilot must retain the selected objective label: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(actionTrace[0].mapVisible, false,
    `successful primary action must pop the map: ${JSON.stringify(actionTrace[0])}`);

  const evidence = {
    schema: 'spaceface.galaxy_map_search_pointer.v1',
    expected, routingContext, center, hitBefore, pointerTrace, pointerSelected,
    keyboardExpected, keyboardSelected, actionBefore, actionStable, actionCenter,
    actionHit, actionTrace, navAfter,
  };
  assert.equal(pointerSelected?.id, expected.id,
    `real row-center pointer click must select exact result: ${JSON.stringify(evidence)}`);
  const screenshotBytes = await readFile(SCREENSHOT_TEMP_PATH);
  const screenshotSha256 = createHash('sha256').update(screenshotBytes).digest('hex');
  const screenshotName = `galaxy-map-active-objective-search-${screenshotSha256.slice(0, 16)}.png`;
  const screenshotPath = path.join(EVIDENCE_DIR, screenshotName);
  try {
    await rename(SCREENSHOT_TEMP_PATH, screenshotPath);
  } catch (error) {
    const existing = await readFile(screenshotPath).catch(() => null);
    assert(existing && existing.equals(screenshotBytes),
      `content-addressed screenshot publish failed: ${String(error && error.message || error)}`);
    await rm(SCREENSHOT_TEMP_PATH, { force: true });
  }
  evidence.screenshot = `.devshots/${screenshotName}`;
  evidence.screenshotSha256 = screenshotSha256;
  await writeFile(EVIDENCE_TEMP_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  // Publish the manifest last. A crash leaves either the prior matching pair or no accepted JSON.
  await rm(EVIDENCE_PATH, { force: true });
  await rename(EVIDENCE_TEMP_PATH, EVIDENCE_PATH);
  console.log(`Galaxy-map search pointer OK: ${JSON.stringify(evidence)}`);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  await rm(SCREENSHOT_TEMP_PATH, { force: true }).catch(() => {});
  await rm(EVIDENCE_TEMP_PATH, { force: true }).catch(() => {});
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

async function readActiveObjectiveTarget(page) {
  const objective = await page.waitForFunction(() => {
    const state = window.SF.state;
    const waypoint = state.nav?.waypoint;
    const label = String(waypoint?.label || waypoint?.sectorName || waypoint?.reason || waypoint?.mapLabel || '').trim();
    if (!waypoint?.pos || !Number.isFinite(waypoint.pos.x) || !Number.isFinite(waypoint.pos.z) || !label) return null;
    return {
      sourceId: 'active-map-goal',
      targetEntityId: waypoint.targetEntityId == null ? null : String(waypoint.targetEntityId),
      label,
      pos: { x: waypoint.pos.x, z: waypoint.pos.z },
      waypointId: waypoint.id || waypoint.markerId || null,
      onboarding: waypoint.onboarding === true,
    };
  }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue());
  assert.equal(objective.onboarding, true,
    `canonical New Game must begin with a real onboarding objective: ${JSON.stringify(objective)}`);
  return objective;
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
