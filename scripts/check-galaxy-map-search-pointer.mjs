#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { installFirstLightPromptHandler } from './player-truth/routes.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const EVIDENCE_DIR = fileURLToPath(new URL('../.devshots/', import.meta.url));
const EVIDENCE_PATH = fileURLToPath(new URL('../.devshots/galaxy-map-search-pointer-evidence.json', import.meta.url));
const SCREENSHOT_TEMP_PATH = path.join(EVIDENCE_DIR, `.galaxy-map-active-objective-search.${process.pid}.pending.png`);
const EVIDENCE_TEMP_PATH = `${EVIDENCE_PATH}.${process.pid}.pending`;

function projectedMapPosition(pos) {
  return pos ? { x: Math.fround(pos.x), z: Math.fround(pos.z) } : null;
}

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
  await installFirstLightPromptHandler(page, () => {});
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'pointer regression must use the canonical root');
  await bootNewGame(page);
  if (process.argv.includes('--palette-handoff')) await runPaletteHandoff(page);
  else await runPointerRegression(page);
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  await rm(SCREENSHOT_TEMP_PATH, { force: true }).catch(() => {});
  await rm(EVIDENCE_TEMP_PATH, { force: true }).catch(() => {});
}

async function runPointerRegression(page) {
  const objective = await readActiveObjectiveTarget(page);
  const { sourceId, label: searchLabel } = objective;
  assert.equal(objective.sampleSlot, 'boulder:helios_boulder_rim',
    'a fresh opening contract must select the authored sample slot');
  if (objective.targetEntityId != null) {
    assert.equal(objective.targetSlot, objective.sampleSlot,
      'the chart must target the materialized sample slot');
  }

  await page.keyboard.press('KeyM');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#sf-galaxymap .gm-scale-btn[data-focus="local"]').click();
  await page.waitForFunction(() => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    return screen?._activeLevel?.() === 'local';
  }, null, { timeout: 10_000 });
  // The chart's visible objective control remains available even when its pin lies outside the
  // local canvas field. Leave the control unclicked so the typed result must acquire selection.
  const marker = page.locator('#sf-galaxymap .gm-locate-goal');
  await marker.waitFor({ state: 'visible', timeout: 10_000 }).catch(async error => {
    const binding = await page.evaluate(async missionId => {
      const state = window.SF.state;
      const { activeMapGoal } = await import('/src/ui/galaxyMap.js');
      const wp = state.nav?.waypoint;
      const mission = state.missions?.active?.find(m => m.id === missionId);
      const source = mission?.params?.sampleSource;
      const body = state.entities.get(wp?.targetEntityId);
      const nearby = state.entityList.filter(e => e.type === 'asteroid' && e.data?.fieldId === source?.fieldId)
        .filter(e => e.data?.asteroidSlotId === source?.slotId || e.id === body?.id).slice(0, 3);
      return { sector: state.world?.currentSectorId, mode: state.mode, tracked: state.ui?.trackedMissionId,
        teaching: { active: state.onboarding?.active, stage: state.onboarding?.stage }, goal: activeMapGoal(state),
        wp, mission: mission && { tag: mission.storyTag, sector: mission.destSectorId,
          recovered: mission.params?.sampleRecovered, source },
        bodies: [...new Set([body, ...nearby])].filter(Boolean).map(e => ({ id: e.id, type: e.type, alive: e.alive,
          life: e.occupantGeneration, home: e.homeSectorId, field: e.data?.fieldId, slot: e.data?.asteroidSlotId,
          resource: e.data?.activityObjectSlotId, pos: e.pos })) };
    }, objective.missionId);
    throw new Error(`Public 47-A objective is missing in the chart: ${JSON.stringify(binding)}`, { cause: error });
  });
  const markerLabel = (await marker.locator('.gm-locate-name').innerText()).trim();
  assert.equal(markerLabel.toLowerCase(), searchLabel.toLowerCase());
  const search = await typeAfterPalette(page, searchLabel);

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
  assert.equal(expected?.id, objective.targetEntityId ?? sourceId,
    `the active-objective row must bind the current target: ${JSON.stringify({ objective, expected })}`);
  assert.equal(expected?.sourceId, 'active-map-goal', `expected synthetic active-goal row, got ${JSON.stringify(expected)}`);
  // The chart can read the live Float32 body pose while the mission retains its Float64 fix.
  assert.deepEqual(projectedMapPosition(expected?.pos), projectedMapPosition(objective.pos),
    `the searchable objective must point at the current mission fix: ${JSON.stringify({ objective, expected })}`);
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

  // Hold the real action node across several inspector refresh cadences, then activate its center.
  // Record the click and wait for the authoritative course to reach the presentation mirror.
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
  const actionTrace = await page.evaluate(() => window.__MAP_ACTION_TRACE__ || []);
  const navAfter = await page.waitForFunction(label => {
    const nav = window.SF?.state?.nav;
    const autopilot = nav?.autopilot;
    if (!autopilot?.active || autopilot.label !== label) return false;
    return {
      autopilot: autopilot ? {
        active: autopilot.active,
        status: autopilot.status,
        targetEntityId: autopilot.targetEntityId == null ? null : String(autopilot.targetEntityId),
        label: autopilot.label,
        target: autopilot.target ? { x: autopilot.target.x, z: autopilot.target.z } : null,
      } : null,
      missionId: nav?.waypoint?.missionId ?? null,
      mapVisible: document.querySelector('#sf-galaxymap')?.classList.contains('sf-screen--visible') || false,
    };
  }, objective.label, { timeout: 10_000 }).then(handle => handle.jsonValue());
  assert.equal(actionTrace.length, 1, `physical primary-action click must bubble once: ${JSON.stringify(actionTrace)}`);
  assert.equal(actionTrace[0].selectedId, expected.id,
    `physical primary action must retain selected target through activation: ${JSON.stringify(actionTrace[0])}`);
  assert.equal(navAfter.autopilot?.targetEntityId, objective.targetEntityId,
    `autopilot target identity must match the current objective: ${JSON.stringify(navAfter)}`);
  assert.deepEqual(projectedMapPosition(navAfter.autopilot?.target), projectedMapPosition(objective.pos),
    `autopilot must target the selected objective position: ${JSON.stringify(navAfter)}`);
  assert.equal(navAfter.autopilot?.label, objective.label);
  if (objective.explicitlyTracked) assert.equal(navAfter.missionId, objective.missionId);
  assert.equal(actionTrace[0].mapVisible, false,
    `successful primary action must pop the map: ${JSON.stringify(actionTrace[0])}`);

  const evidence = {
    schema: 'spaceface.galaxy_map_search_pointer.v1',
    expected, markerLabel, routingContext, center, hitBefore, pointerTrace, pointerSelected,
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
}

async function typeAfterPalette(page, label) {
  const search = page.locator('.gm-search-input');
  const popup = page.locator('.gm-search-results');
  const paletteRow = popup.locator('[data-pal]').first();
  await search.waitFor({ state: 'visible', timeout: 5_000 });
  const resultRows = await popup.locator('#gm-place-results').elementHandle();
  const assertResultRowsConnected = async () => {
    assert.ok(await resultRows.evaluate(rows => rows.isConnected && rows === document.querySelector('#gm-place-results')),
      'the place finder must keep its mounted results node when commands open or close');
  };
  await page.keyboard.press('/');
  await paletteRow.waitFor({ state: 'visible', timeout: 5_000 });
  await assertResultRowsConnected();
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden', timeout: 5_000 });
  await assertResultRowsConnected();
  await search.click();
  await paletteRow.waitFor({ state: 'visible', timeout: 5_000 });
  await search.fill(label);
  await paletteRow.waitFor({ state: 'hidden', timeout: 5_000 });
  await assertResultRowsConnected();
  return search;
}

async function runPaletteHandoff(page) {
  const chart = page.locator('#sf-galaxymap');
  await page.keyboard.press('KeyN');
  await chart.waitFor({ state: 'visible', timeout: 15_000 });
  await chart.locator('.gm-scale-btn[data-focus="system"]').click();
  const label = 'Helios Station';
  await typeAfterPalette(page, label);
  const result = chart.locator('#gm-place-results button[data-idx]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await result.click({ timeout: 10_000 });
  const selected = await selectedTarget(page);
  assert.equal(selected?.name, label);
  assert.equal(selected?.kind, 'station');
  console.log('Galaxy-map palette handoff OK: typing selected the real Helios Station after Escape and reopen.');
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
    const openingContract = state.missions?.active?.find(mission => mission.id === waypoint.missionId
      && mission.status === 'active' && mission.params?.contractId === '47-A');
    if (!openingContract || label !== '47-A Recovery Site') return null;
    return {
      sourceId: 'active-map-goal',
      targetEntityId: waypoint.targetEntityId == null ? null : String(waypoint.targetEntityId),
      sampleSlot: openingContract.params.sampleSource?.slotId ?? null,
      targetSlot: state.entities.get(waypoint.targetEntityId)?.data?.asteroidSlotId ?? null,
      label,
      pos: { x: waypoint.pos.x, z: waypoint.pos.z },
      waypointId: waypoint.id || waypoint.markerId || null,
      missionId: openingContract.id,
      explicitlyTracked: state.ui?.trackedMissionId === openingContract.id,
    };
  }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue());
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
