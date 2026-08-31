#!/usr/bin/env node
// Browser witness for the real Sandbox -> Combat Lab route. This intentionally uses the public
// form and Relaunch control; state reads are observer evidence after each live UI action.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FOUNDRY_ROUTE = process.argv.includes('--foundry');
const VISUAL_REVIEW = process.argv.includes('--visual-review');
const PLAYER_STORE_DIR = mkdtempSync(join(tmpdir(), FOUNDRY_ROUTE
  ? 'spaceface-crucible-foundry-route-'
  : 'spaceface-crucible-lab-route-'));
const SEED = 1864401122;
const STARTER_ID = FOUNDRY_ROUTE ? 'foundry_smart_bank' : 'physics_toolkit';
const ARENA_ID = FOUNDRY_ROUTE ? 'helios_core' : 'lagrange_crucible';
const ENEMY_PACKAGE_ID = VISUAL_REVIEW ? 'mirrorjaw_foreman' : 'wasp_flight';
const START_WAVE = VISUAL_REVIEW ? 10 : 1;
const EXPECTED = FOUNDRY_ROUTE
  ? Object.freeze({ sectorId: 'sector_helios_prime', x: 400, z: 0 })
  : Object.freeze({ sectorId: 'sector_helios_prime', x: -500, z: 800 });
const EXPECTED_HULL_ID = FOUNDRY_ROUTE ? 'ship_drifter' : 'ship_hornet';
const EXPECTED_FITTINGS = FOUNDRY_ROUTE
  ? Object.freeze([[0, 'wpn_pulse_laser_m'], [7, 'mod_bank_shot'], [8, 'mod_smart_bank']])
  : Object.freeze([[0, 'wpn_concussion_cannon_m'], [1, 'wpn_gravity_marker_s'], [2, 'wpn_momentum_sink_s']]);
const POSITION_EPSILON = 1e-6;
const BROWSER_CLOSE_TIMEOUT_MS = 5000;
const ELECTRON_ROUTE = process.argv.includes('--electron');
if (VISUAL_REVIEW && !FOUNDRY_ROUTE) {
  throw new Error('Foundry visual review requires --foundry');
}
if (VISUAL_REVIEW && ELECTRON_ROUTE) {
  throw new Error('Foundry visual review is intentionally Browser-only');
}
const RUNTIME_LABEL = ELECTRON_ROUTE ? 'Electron' : 'Browser';
const SCREENSHOT_SUFFIX = ELECTRON_ROUTE ? '-electron' : '';
const ROUTE_SLUG = VISUAL_REVIEW ? 'foundry-visual-review' : (FOUNDRY_ROUTE ? 'foundry' : 'lagrange');
const EVIDENCE_DIR = join(ROOT, '.devshots', FOUNDRY_ROUTE ? 'crucible-foundry-route' : 'crucible-lab-route');
const REPORT_PATH = join(EVIDENCE_DIR, `${ROUTE_SLUG}-report${SCREENSHOT_SUFFIX}.json`);

const { chromium, _electron: electron } = await loadPlaywright();
let server = null;
let browser = null;
let electronApp = null;
let isolatedElectronLaunch = null;
let issues = null;
let phase = 'BOOT';
const results = [];
const routeEvidence = {};
const teardown = {};

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(9)} ${detail}`);
}

function routePassed() {
  return phase === 'CLEAN'
    && results.length > 0
    && results.some((result) => result.label === 'CLEAN' && result.ok)
    && results.every((result) => result.ok);
}

function saveEvidence(label, value) {
  routeEvidence[label] = value;
  return value;
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const available = await new Promise((resolve) => {
      const listener = createNetServer();
      listener.once('error', () => resolve(false));
      listener.once('listening', () => listener.close(() => resolve(true)));
      listener.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error('no free local port for Crucible Lab route');
}

async function startServer() {
  const port = await findFreePort(8460);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: PLAYER_STORE_DIR },
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`server exited before ready: ${output}`);
    try {
      if ((await fetch(baseUrl)).ok) return { baseUrl, kill: () => child.kill() };
    } catch { /* wait for the normal server root */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`server did not become reachable: ${output}`);
}

async function clickExact(page, label, root = null, { noWaitAfter = false } = {}) {
  const scope = root || page;
  const button = scope.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await button.isEnabled(), true, `${label} must be enabled`);
  await button.click({ noWaitAfter });
}

async function selectViaVisibleWidget(page, selector, value) {
  const root = page.locator(selector);
  const field = root.locator('.sf-select__field');
  await field.waitFor({ state: 'visible', timeout: 30000 });
  await field.click();
  const option = root.locator(`.sf-select__opt[data-value="${value}"]`);
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();
  await page.waitForFunction(([id, wanted]) => {
    const node = document.querySelector(id);
    return !!node && node.value === wanted;
  }, [selector, value], { timeout: 10000 });
}

async function readLiveWitness(page) {
  return page.evaluate((ownerId) => {
    const sf = window.SF;
    const state = sf && sf.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const ownedShip = state?.player?.ownedShips?.[state.player.activeShipIndex];
    const budget = sf && sf.ctx && sf.ctx.helpers && sf.ctx.helpers.spawnBudget;
    const arenaSystem = sf?.registry?.get?.('survivalArena');
    const arenaDiagnostics = arenaSystem?.diagnostics?.() || null;
    const renderOwner = sf?.registry?.get?.('render');
    const project = sf?.ctx?.helpers?.worldToScreen;
    const foundrySurfaces = (state && Array.isArray(state.entityList) ? state.entityList : [])
      .filter((entity) => entity && entity.alive && entity.data?.arenaSurface === true)
      .map((entity) => {
        const root = renderOwner?._meshes?.get?.(entity.id) || null;
        let visibleLeaves = 0;
        root?.traverse?.((leaf) => {
          if ((leaf.isMesh || leaf.isPoints || leaf.isLine) && leaf.visible !== false) visibleLeaves++;
        });
        const projection = typeof project === 'function' ? project(entity.pos) : null;
        return {
          id: entity.id,
          surfaceId: entity.data?.foundrySurface?.id || null,
          kind: entity.data?.foundrySurface?.kind || null,
          dynamic: entity.data?.foundrySurface?.dynamic === true,
          radarHidden: entity.data?.radarHidden === true,
          masslineTetherable: entity.data?.masslineTetherable === true,
          material: entity.surfaceMaterial || null,
          meshKind: root?.userData?.kind || null,
          rootVisible: root?.visible ?? null,
          visibleLeaves,
          projection: projection ? {
            x: Math.round(projection.x),
            y: Math.round(projection.y),
            onScreen: projection.onScreen === true,
          } : null,
        };
      })
      .sort((a, b) => String(a.surfaceId).localeCompare(String(b.surfaceId)));
    const owned = (state && Array.isArray(state.entityList) ? state.entityList : [])
      .filter((entity) => entity && entity.alive && budget && typeof budget.ownerForEntity === 'function'
        && budget.ownerForEntity(entity.id) === ownerId)
      .map((entity) => ({
        id: entity.id,
        enemyId: entity.data && entity.data.enemyId || null,
        pos: { x: entity.pos && entity.pos.x, z: entity.pos && entity.pos.z },
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const controls = document.querySelector('.sf-lab-runtime');
    const telemetry = document.querySelector('[aria-label="Combat Lab telemetry"]');
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const inViewport = (node) => {
      if (!visible(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
    };
    const seed = document.querySelector('#sf-sandbox-lab-seed');
    return {
      mode: state && state.mode,
      run: state && state.run ? {
        kind: state.run.kind,
        phase: state.run.phase,
        seed: state.run.seed,
        arenaId: state.run.arenaId,
      } : null,
      sectorId: state && state.world && state.world.currentSectorId,
      playerPos: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      playerBuild: ownedShip ? {
        hullId: ownedShip.defId || null,
        fittings: Array.isArray(ownedShip.fittings) ? [...ownedShip.fittings] : [],
      } : null,
      arenaDiagnostics,
      foundrySurfaces,
      owned,
      controlsVisible: visible(controls),
      runtimeControls: controls ? [...controls.querySelectorAll('button')].map((button) => ({
        label: button.getAttribute('aria-label') || button.textContent.trim(),
        disabled: button.disabled,
        inViewport: inViewport(button),
      })) : [],
      telemetryVisible: visible(telemetry),
      controlsInViewport: inViewport(controls),
      telemetryInViewport: inViewport(telemetry),
      telemetryText: telemetry ? telemetry.textContent.replace(/\s+/g, ' ').trim() : '',
      labForm: {
        starterId: document.querySelector('#sf-sandbox-lab-starter')?.value || null,
        hullId: document.querySelector('#sf-sandbox-lab-hull')?.value || null,
        enemyPackageId: document.querySelector('#sf-sandbox-lab-enemy')?.value || null,
        arenaId: document.querySelector('#sf-sandbox-lab-arena')?.value || null,
        seed: document.querySelector('#sf-sandbox-lab-seed')?.value || null,
        wave: document.querySelector('#sf-sandbox-lab-wave')?.value || null,
      },
      seedInput: seed ? { visible: visible(seed), width: seed.getBoundingClientRect().width } : null,
    };
  }, `combat-lab:${ENEMY_PACKAGE_ID}`);
}

async function readOpeningProgramWitness(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const receipt = state?.render?.openingSubmissionReceipt;
    const plan = state?.render?.openingSubmissionPlan;
    const validation = state?.render?.openingSubmissionPreSubmitValidation;
    const renderSystem = window.SF?.registry?.get?.('render');
    const renderer = renderSystem?.renderer;
    const current = renderer?.info?.programs || [];
    const keyList = (entries) => entries.map((entry) => String(
      typeof entry === 'string' ? entry : entry?.cacheKey || '',
    )).filter(Boolean).sort();
    const materialRows = [];
    for (const leaf of plan?.compileSubjects || []) {
      const materials = Array.isArray(leaf?.material) ? leaf.material : [leaf?.material];
      for (const material of materials) {
        if (!material) continue;
        const program = renderer?.properties?.get?.(material)?.currentProgram;
        materialRows.push({
          leaf: leaf.name || leaf.userData?.openingSubmissionPackage?.assetId || leaf.uuid || null,
          material: material.name || material.type || null,
          materialType: material.type || null,
          program: program?.cacheKey || null,
        });
      }
    }
    return {
      receiptRequiredCount: keyList(receipt?.required?.programCacheKeys || []).length,
      receiptBeforeCount: keyList(receipt?.before?.programCacheKeys || []).length,
      currentCount: keyList(current).length,
      missing: keyList(validation?.missingProgramKeys || []),
      uncaptured: keyList(validation?.uncapturedProgramKeys || []),
      withoutCurrentProgram: materialRows.filter((row) => !row.program),
    };
  });
}

async function waitForLabFlight(page, label, issues) {
  try {
    await page.waitForFunction(({ seed, arenaId }) => {
      const state = window.SF && window.SF.state;
      return !!(state && state.mode === 'flight' && state.run && state.run.kind === 'lab'
        && state.run.seed === seed && state.run.arenaId === arenaId);
    }, { seed: SEED, arenaId: ARENA_ID }, { timeout: 180000 });
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      return state?.mode === 'menu'
        || (state?.mode === 'flight' && state?.render?.openingSubmissionPreSubmitValidation != null);
    }, null, { timeout: 180000 });
    const admission = await page.evaluate(() => {
      const validation = window.SF?.state?.render?.openingSubmissionPreSubmitValidation;
      return {
        mode: window.SF?.state?.mode || null,
        validation: validation ? {
          ok: validation.ok === true,
          reason: validation.reason || null,
          baseline: validation.baseline || null,
          current: validation.current || null,
          missing: validation.missingProgramKeys || [],
          uncaptured: validation.uncapturedProgramKeys || [],
        } : null,
      };
    });
    if (admission.mode !== 'flight' || admission.validation?.ok !== true) {
      const programs = await readOpeningProgramWitness(page);
      throw new Error(`${label}: first visible submission was not admitted; ${JSON.stringify({ admission, programs })}`);
    }
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      const readiness = window.SF?.authoredVisualReadiness?.();
      return {
        mode: state && state.mode,
        run: state && state.run ? {
          kind: state.run.kind,
          phase: state.run.phase,
          seed: state.run.seed,
          arenaId: state.run.arenaId,
        } : null,
        loading: document.querySelector('[data-screen="loading"]')?.textContent.replace(/\s+/g, ' ').trim() || null,
        authoredReadiness: readiness ? {
          pipelineReady: readiness.pipelineReady === true,
          ready: readiness.ready === true,
          playerStatus: readiness.playerStatus || null,
          flightReadyBlockers: readiness.flightReadyBlockers || [],
        } : null,
        playerVisualTrace: Array.isArray(window.__sfCruciblePlayerVisualTrace?.samples)
          ? window.__sfCruciblePlayerVisualTrace.samples.slice(-20)
          : [],
      };
    });
    const pageErrors = issues ? summarizeIssues(issues.errorIssues()) : [];
    throw new Error(`${label}: ${error.message}; live=${JSON.stringify(diagnostic)}; pageErrors=${JSON.stringify(pageErrors)}`);
  }
}

async function waitForFoundryPresentation(page, label) {
  if (!FOUNDRY_ROUTE) return;
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const renderOwner = sf?.registry?.get?.('render');
      const tutorialBank = sf?.state?.entityList?.find?.((entity) => (
        entity?.alive !== false && entity?.data?.foundrySurface?.id === 'bank_west'
      ));
      return !!(tutorialBank && renderOwner?._meshes?.get?.(tutorialBank.id)?.userData?.kind
        === 'ricochet-foundry-surface');
    }, null, { timeout: 15000 });
    const admittedFrame = await page.evaluate(() => (
      window.SF?.registry?.get?.('render')?._entityFrame?.frameId ?? -1
    ));
    await page.waitForFunction((minimumFrame) => {
      const sf = window.SF;
      const renderOwner = sf?.registry?.get?.('render');
      const tutorialBank = sf?.state?.entityList?.find?.((entity) => (
        entity?.alive !== false && entity?.data?.foundrySurface?.id === 'bank_west'
      ));
      const root = tutorialBank && renderOwner?._meshes?.get?.(tutorialBank.id);
      if (!root || root.visible === false || (renderOwner?._entityFrame?.frameId ?? -1) < minimumFrame) return false;
      let visibleLeaves = 0;
      root.traverse?.((leaf) => {
        if ((leaf.isMesh || leaf.isPoints || leaf.isLine) && leaf.visible !== false) visibleLeaves++;
      });
      return visibleLeaves > 0;
    }, admittedFrame + 2, { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const sf = window.SF;
      const renderOwner = sf?.registry?.get?.('render');
      return {
        mode: sf?.state?.mode || null,
        tick: sf?.state?.tick ?? null,
        deferNoncritical: renderOwner?._deferNoncriticalMeshStreaming === true,
        reconcileDirty: renderOwner?._meshReconcileDirty === true,
        queueHead: renderOwner?._meshBuildQueueHead ?? null,
        queueLength: renderOwner?._meshBuildQueue?.length ?? null,
        meshCount: renderOwner?._meshes?.size ?? null,
        surfaces: (sf?.state?.entityList || []).filter((entity) => entity?.data?.arenaSurface === true)
          .map((entity) => ({
            id: entity.id,
            surfaceId: entity.data?.foundrySurface?.id || null,
            type: entity.type || null,
            noMesh: entity._noMesh === true,
            presentationTier: entity.activity?.presentationTier || null,
            openingComposition: entity.data?.render?.openingComposition === true,
            entityRootKind: entity.mesh?.userData?.kind || null,
            ownerRootKind: renderOwner?._meshes?.get?.(entity.id)?.userData?.kind || null,
            ownerRootVisible: renderOwner?._meshes?.get?.(entity.id)?.visible ?? null,
          })),
      };
    });
    throw new Error(`${label}: tutorial Foundry bank never entered presentation; ${error.message}; ${JSON.stringify(diagnostic)}`);
  }
}

async function waitForMirrorjawPresentation(page) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const boss = (state?.entityList || []).find((entity) => (
      entity?.alive !== false
      && (entity?.data?.lootTableId === 'mirrorjaw_foreman' || entity?.data?.enemyId === 'mirrorjaw_foreman')
    ));
    const root = boss && render?._meshes?.get?.(boss.id);
    return !!(boss && root && root.visible !== false);
  }, null, { timeout: 30000 });
}

async function requestMirrorjawAuthoredAdmission(page) {
  return page.evaluate(async () => {
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const boss = (state?.entityList || []).find((entity) => (
      entity?.alive !== false
      && (entity?.data?.lootTableId === 'mirrorjaw_foreman' || entity?.data?.enemyId === 'mirrorjaw_foreman')
    ));
    const root = boss && render?._meshes?.get?.(boss.id);
    const request = root?.userData?.requestAuthoredUpgrade;
    if (!boss || !root || typeof request !== 'function' || !render?.renderer || !render?.scene) {
      throw new Error('Mirrorjaw live authored boundary cannot receive its normal admission request');
    }
    const before = {
      admission: boss.presentationAdmission || null,
      authoredAssetState: root.userData?.authoredAssetState || null,
      playerTargetId: state?.player?.targetId ?? null,
      bossHull: boss.hull ?? null,
      bossHullMax: boss.hullMax ?? null,
      bossPhase: boss.data?.mirrorjawPhase ?? null,
    };
    // `requestAuthoredUpgrade` is the same boundary API used by renderer reconciliation. This
    // presentation-only review has no player movement/target action, so request the live boundary
    // directly rather than manufacturing a gameplay target or waiting for an impossible hidden draw.
    await request(render.renderer, render.scene);
    const after = {
      admission: boss.presentationAdmission || null,
      authoredAssetState: root.userData?.authoredAssetState || null,
      playerTargetId: state?.player?.targetId ?? null,
      bossHull: boss.hull ?? null,
      bossHullMax: boss.hullMax ?? null,
      bossPhase: boss.data?.mirrorjawPhase ?? null,
    };
    if (after.playerTargetId !== before.playerTargetId
      || after.bossHull !== before.bossHull
      || after.bossHullMax !== before.bossHullMax
      || after.bossPhase !== before.bossPhase) {
      throw new Error('Mirrorjaw authored admission mutated simulation-owned target, hull, or phase state');
    }
    return { bossId: boss.id, before, after, api: 'root.userData.requestAuthoredUpgrade' };
  });
}

async function waitForMirrorjawReviewLeaves(page) {
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const state = sf?.state;
      const render = sf?.registry?.get?.('render');
      const boss = (state?.entityList || []).find((entity) => (
        entity?.alive !== false
        && (entity?.data?.lootTableId === 'mirrorjaw_foreman' || entity?.data?.enemyId === 'mirrorjaw_foreman')
      ));
      const root = boss && render?._meshes?.get?.(boss.id);
      let visibleLeaves = 0;
      root?.traverse?.((leaf) => {
        if (!(leaf.isMesh || leaf.isPoints || leaf.isLine)) return;
        for (let node = leaf; node; node = node.parent) {
          if (node.visible === false) return;
        }
        visibleLeaves++;
      });
      const overlay = root?.getObjectByName?.('mirrorjaw-foreman-authored-overlay-frame');
      return root?.userData?.authoredAssetState === 'authored'
        && overlay?.visible !== false
        && visibleLeaves > 0;
    }, null, { timeout: 90000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const sf = window.SF;
      const state = sf?.state;
      const render = sf?.registry?.get?.('render');
      const boss = (state?.entityList || []).find((entity) => (
        entity?.alive !== false
        && (entity?.data?.lootTableId === 'mirrorjaw_foreman' || entity?.data?.enemyId === 'mirrorjaw_foreman')
      ));
      const root = boss && render?._meshes?.get?.(boss.id);
      let leaves = 0;
      let visibleLeaves = 0;
      root?.traverse?.((leaf) => {
        if (!(leaf.isMesh || leaf.isPoints || leaf.isLine)) return;
        leaves++;
        for (let node = leaf; node; node = node.parent) {
          if (node.visible === false) return;
        }
        visibleLeaves++;
      });
      return {
        bossId: boss?.id ?? null,
        bossAlive: boss?.alive !== false,
        admission: boss?.presentationAdmission || boss?.data?.presentationAdmission || null,
        rootName: root?.name || null,
        rootVisible: root?.visible ?? null,
        authoredAssetState: root?.userData?.authoredAssetState || null,
        authoredVisualRoot: root?.userData?.authoredVisualRoot || null,
        authoredUpgradePending: !!root?.userData?.authoredUpgradePromise,
        leaves,
        visibleLeaves,
        childStates: (root?.children || []).map((child) => ({
          name: child.name || null,
          visible: child.visible !== false,
          leaves: (() => {
            let count = 0;
            child.traverse?.((leaf) => { if (leaf.isMesh || leaf.isPoints || leaf.isLine) count++; });
            return count;
          })(),
        })),
        queueHead: render?._meshBuildQueueHead ?? null,
        queueLength: render?._meshBuildQueue?.length ?? null,
        queued: boss ? render?._meshBuildQueuedIds?.has?.(boss.id) === true : null,
        deferNoncritical: render?._deferNoncriticalMeshStreaming ?? null,
      };
    });
    throw new Error(`Mirrorjaw authored presentation did not become drawable; ${error.message}; ${JSON.stringify(diagnostic)}`);
  }
}

async function captureFoundryVisualReviewCanvas(page, path) {
  const canvas = page.locator('#gl-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  // Element screenshots still composite DOM siblings that overlap the canvas rectangle (HUD,
  // target label, radar). Read the WebGL canvas immediately after a prepared draw so visual-review
  // evidence contains only game pixels and cannot mistake an overlay label for boss geometry.
  const dataUrl = await page.evaluate(() => {
    const render = window.SF?.registry?.get?.('render');
    render?.drawPreparedFrame?.();
    const node = document.querySelector('#gl-canvas');
    return node instanceof HTMLCanvasElement ? node.toDataURL('image/png') : null;
  });
  assert.match(dataUrl || '', /^data:image\/png;base64,/, 'visual-review WebGL canvas exported a PNG');
  writeFileSync(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
}

async function stageFoundryVisualReviewCamera(page, view) {
  return page.evaluate((requestedView) => {
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const camera = state?.render?.camera;
    if (!camera?.isPerspectiveCamera || !camera.position || typeof camera.lookAt !== 'function') {
      throw new Error('scene-isolated review requires the live perspective render camera');
    }
    const boss = (state?.entityList || []).find((entity) => (
      entity?.alive !== false
      && (entity?.data?.lootTableId === 'mirrorjaw_foreman' || entity?.data?.enemyId === 'mirrorjaw_foreman')
    ));
    if (!boss?.pos) throw new Error('wave-10 visual review did not materialize Mirrorjaw');
    const surfaces = (state?.entityList || []).filter((entity) => entity?.alive !== false && entity?.data?.arenaSurface === true);
    const bossRoot = render?._meshes?.get?.(boss.id);
    if (!bossRoot) throw new Error('Mirrorjaw has no live render root for scene-isolated review');
    if (!window.__sfFoundryVisualReviewCamera) {
      const cameraCtrl = state?.render?.cameraCtrl || null;
      window.__sfFoundryVisualReviewCamera = {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        quaternion: { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w },
        up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
        fov: camera.fov,
        cameraCtrl,
        originalFollow: typeof cameraCtrl?.follow === 'function' ? cameraCtrl.follow : null,
        pose: null,
        rootVisibility: [...(render?._meshes || [])].map(([id, root]) => ({ id, root, visible: root?.visible !== false })),
        bossRoot,
        realBossObserver: {
          id: boss.id,
          pos: { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z },
          rot: boss.rot,
          data: { ...(boss.data || {}) },
        },
      };
    }
    const review = window.__sfFoundryVisualReviewCamera;
    const visibleLeaves = (root) => {
      let count = 0;
      root?.traverse?.((leaf) => {
        if (!(leaf.isMesh || leaf.isPoints || leaf.isLine)) return;
        for (let visibleNode = leaf; visibleNode; visibleNode = visibleNode.parent) {
          if (visibleNode.visible === false) return;
        }
        count++;
      });
      return count;
    };
    const renderableLeaves = (root) => {
      let count = 0;
      root?.traverse?.((leaf) => {
        if (leaf.isMesh || leaf.isPoints || leaf.isLine) count++;
      });
      return count;
    };
    const setPose = (position, target, fov, rootIds, presentationObserver = null) => {
      review.pose = { position, target, fov };
      review.rootIds = rootIds.map(String);
      review.presentationObserver = presentationObserver;
      review.applySceneIsolatedPresentation = () => {
        const keep = new Set(review.rootIds);
        for (const [id, root] of render?._meshes || []) {
          if (!review.rootVisibility.some((entry) => entry.root === root)) {
            review.rootVisibility.push({ id, root, visible: root?.visible !== false });
          }
        }
        for (const entry of review.rootVisibility) {
          if (entry.root) entry.root.visible = keep.has(String(entry.id));
        }
        if (review.presentationObserver && typeof review.bossRoot?.userData?.updateRuntimeState === 'function') {
          review.bossRoot.userData.updateRuntimeState(review.presentationObserver, state?.simTime);
        }
        camera.position.set(position.x, position.y, position.z);
        camera.up.set(0, 1, 0);
        camera.fov = fov;
        camera.lookAt(target.x, target.y, target.z);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
      };
      if (review.cameraCtrl && review.originalFollow && !review.sceneIsolatedFollow) {
        review.sceneIsolatedFollow = (...args) => {
          review.originalFollow.apply(review.cameraCtrl, args);
          review.applySceneIsolatedPresentation?.();
        };
      }
      if (review.cameraCtrl && review.sceneIsolatedFollow && review.cameraCtrl.follow !== review.sceneIsolatedFollow) {
        review.cameraCtrl.follow = review.sceneIsolatedFollow;
      }
      review.applySceneIsolatedPresentation();
      // This submits the already-live Three.js scene at the temporary camera pose.  It does not
      // advance simulation, alter the boss, or change any gameplay camera controller state.
      render?.drawPreparedFrame?.();
      return { position, target, fov };
    };
    if (requestedView === 'room') {
      const furnace = surfaces.find((entity) => entity.data?.foundrySurface?.id === 'furnace');
      const center = furnace?.pos || boss.pos;
      const surfaceIds = surfaces.map((entity) => entity.data?.foundrySurface?.id || null).filter(Boolean).sort();
      const pose = setPose(
        { x: center.x + 210, y: 940, z: center.z - 780 },
        { x: center.x, y: 0, z: center.z },
        60,
        surfaces.map((entity) => entity.id),
      );
      return {
        view: 'room',
        sceneIsolated: true,
        label: 'scene-isolated presentation evidence; presentation camera only',
        pose,
        surfaceIds,
        visibleRootIds: review.rootIds,
      };
    }
    const overlay = bossRoot.getObjectByName?.('mirrorjaw-foreman-authored-overlay-frame');
    const overlayRenderableLeaves = renderableLeaves(overlay);
    if (!overlay || overlayRenderableLeaves === 0) {
      throw new Error('Mirrorjaw authored overlay mirrorjaw-foreman-authored-overlay-frame has no renderable leaves');
    }
    const frontBearing = Number.isFinite(boss.rot) ? boss.rot : 0;
    const front = { x: Math.cos(frontBearing), z: Math.sin(frontBearing) };
    const right = { x: -front.z, z: front.x };
    const realPhase = boss.data?.mirrorjawPhase || bossRoot.userData?.mirrorjawVisualPhase || null;
    const realObserver = {
      id: boss.id,
      pos: { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z },
      rot: boss.rot,
      data: { ...(boss.data || {}), mirrorjawPhase: realPhase },
    };
    if (requestedView === 'mirrorjaw-front-three-quarter') {
      const pose = setPose(
        { x: boss.pos.x + front.x * 220 + right.x * 115, y: 156, z: boss.pos.z + front.z * 220 + right.z * 115 },
        { x: boss.pos.x, y: 8, z: boss.pos.z },
        42,
        [boss.id],
        realObserver,
      );
      const root = render?._meshes?.get?.(boss.id);
      const cameraBearing = Math.atan2(pose.position.z - boss.pos.z, pose.position.x - boss.pos.x);
      const relativeBearing = Math.atan2(
        Math.sin(cameraBearing - frontBearing),
        Math.cos(cameraBearing - frontBearing),
      );
      return {
        view: 'mirrorjaw-front-three-quarter',
        sceneIsolated: true,
        label: 'scene-isolated presentation evidence; elevated gameplay-local-front three-quarter camera only',
        pose,
        boss: {
          id: boss.id,
          pos: { x: boss.pos.x, z: boss.pos.z },
          rot: frontBearing,
          front,
          relativeBearing,
          hull: boss.hull,
          hullMax: boss.hullMax,
          realPhase,
          presentationPhase: realPhase,
          visibleLeaves: visibleLeaves(root),
          overlay: { name: overlay.name, visibleLeaves: visibleLeaves(overlay) },
        },
      };
    }
    if (requestedView === 'mirrorjaw-rear-final-phase') {
      const presentationPhase = 'unmoored_reactor';
      const presentationObserver = {
        id: boss.id,
        pos: { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z },
        rot: boss.rot,
        data: { ...(boss.data || {}), mirrorjawPhase: presentationPhase },
      };
      const pose = setPose(
        { x: boss.pos.x - front.x * 235 - right.x * 120, y: 144, z: boss.pos.z - front.z * 235 - right.z * 120 },
        { x: boss.pos.x, y: 12, z: boss.pos.z },
        40,
        [boss.id],
        presentationObserver,
      );
      const cameraBearing = Math.atan2(pose.position.z - boss.pos.z, pose.position.x - boss.pos.x);
      const relativeBearing = Math.atan2(
        Math.sin(cameraBearing - frontBearing),
        Math.cos(cameraBearing - frontBearing),
      );
      return {
        view: 'mirrorjaw-rear-final-phase',
        sceneIsolated: true,
        label: 'scene-isolated presentation evidence; rear three-quarter reactor view with cloned observer phase only',
        pose,
        boss: {
          id: boss.id,
          pos: { x: boss.pos.x, z: boss.pos.z },
          rot: frontBearing,
          front,
          relativeBearing,
          hull: boss.hull,
          hullMax: boss.hullMax,
          realPhase,
          presentationPhase,
          visibleLeaves: visibleLeaves(bossRoot),
          overlay: { name: overlay.name, visibleLeaves: visibleLeaves(overlay) },
        },
      };
    }
    throw new Error(`unknown Foundry visual review view ${requestedView}`);
  }, view);
}

async function restoreFoundryVisualReviewCamera(page) {
  return page.evaluate(() => {
    const original = window.__sfFoundryVisualReviewCamera;
    if (!original) return { restored: false, reason: 'no_scene_isolated_camera' };
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const camera = state?.render?.camera;
    if (!camera) throw new Error('scene-isolated review camera disappeared before restore');
    camera.position.set(original.position.x, original.position.y, original.position.z);
    camera.quaternion.set(original.quaternion.x, original.quaternion.y, original.quaternion.z, original.quaternion.w);
    camera.up.set(original.up.x, original.up.y, original.up.z);
    camera.fov = original.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    if (original.cameraCtrl && original.originalFollow) {
      original.cameraCtrl.follow = original.originalFollow;
    }
    for (const entry of original.rootVisibility || []) {
      if (entry.root) entry.root.visible = entry.visible;
    }
    if (original.realBossObserver && typeof original.bossRoot?.userData?.updateRuntimeState === 'function') {
      original.bossRoot.userData.updateRuntimeState(original.realBossObserver, state?.simTime);
    }
    render?.drawPreparedFrame?.();
    delete window.__sfFoundryVisualReviewCamera;
    return { restored: true };
  });
}

async function revealLabRuntime(page) {
  const controls = page.locator('.sf-lab-runtime');
  const telemetry = page.locator('[aria-label="Combat Lab telemetry"]');
  await controls.waitFor({ state: 'visible', timeout: 30000 });
  await telemetry.waitFor({ state: 'visible', timeout: 30000 });
  await controls.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await telemetry.evaluate((node) => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  await page.waitForFunction(() => {
    const intersectsViewport = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
    };
    const controlsNode = document.querySelector('.sf-lab-runtime');
    const telemetryNode = document.querySelector('[aria-label="Combat Lab telemetry"]');
    const usable = [...(controlsNode?.querySelectorAll('button') || [])]
      .filter((button) => ['Clear enemies', 'Invulnerable: off'].includes(button.getAttribute('aria-label') || button.textContent.trim()))
      .every((button) => !button.disabled && intersectsViewport(button));
    return intersectsViewport(controlsNode) && intersectsViewport(telemetryNode) && usable;
  }, null, { timeout: 30000 });
}

async function beginRelaunchTransitionWitness(page) {
  await page.evaluate(() => {
    const prior = window.__sfCrucibleRelaunchTransition;
    if (prior?.off) {
      for (const unsubscribe of prior.off) {
        if (typeof unsubscribe === 'function') unsubscribe();
      }
    }
    const sf = window.SF;
    const state = sf?.state;
    const render = sf?.registry?.get?.('render');
    const snapshot = () => ({
      mode: state?.mode || null,
      tick: state?.tick ?? null,
      postOpeningAdmissionReleased: render?._postOpeningPipelineAdmissionReleased === true,
    });
    const events = [];
    const capture = (kind, payload = {}) => {
      if (events.length < 24) events.push({ kind, ...snapshot(), ...payload });
    };
    const off = [
      sf?.bus?.on?.('mode:changed', (payload = {}) => capture('mode:changed', {
        mode: payload.mode || null,
        previousMode: payload.previousMode || null,
      })),
      sf?.bus?.on?.('game:loadingProgress', (payload = {}) => capture('game:loadingProgress', {
        stage: payload.id || null,
        transition: payload.transition || null,
      })),
      sf?.bus?.on?.('game:started', () => capture('game:started')),
    ].filter((unsubscribe) => typeof unsubscribe === 'function');
    window.__sfCrucibleRelaunchTransition = { initial: snapshot(), events, off, snapshot };
  });
}

async function waitForRelaunchLoadingWitness(page) {
  try {
    await page.waitForFunction(() => window.__sfCrucibleRelaunchTransition?.events
      ?.some((event) => event.kind === 'mode:changed' && event.mode === 'loading'), null, { timeout: 30000 });
    return page.evaluate(() => {
      const trace = window.__sfCrucibleRelaunchTransition;
      const loading = trace?.events?.find((event) => event.kind === 'mode:changed' && event.mode === 'loading') || null;
      return { initial: trace?.initial || null, loading, current: trace?.snapshot?.() || null };
    });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const trace = window.__sfCrucibleRelaunchTransition;
      return { initial: trace?.initial || null, events: trace?.events || [], current: trace?.snapshot?.() || null };
    });
    throw new Error(`Relaunch did not emit a loading transition; ${error.message}; ${JSON.stringify(diagnostic)}`);
  }
}

async function endRelaunchTransitionWitness(page) {
  return page.evaluate(() => {
    const trace = window.__sfCrucibleRelaunchTransition;
    if (!trace) return { initial: null, events: [], current: null };
    for (const unsubscribe of trace.off || []) {
      if (typeof unsubscribe === 'function') unsubscribe();
    }
    const result = { initial: trace.initial || null, events: [...trace.events], current: trace.snapshot?.() || null };
    delete window.__sfCrucibleRelaunchTransition;
    return result;
  });
}

async function readSandboxLayoutWitness(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.screen.sf-sandbox');
    const stage = root?.querySelector(':scope > .sf-stage');
    const apron = root?.querySelector(':scope > .sf-apron');
    if (!root || !stage || !apron) return null;
    const stageChildren = [...stage.children].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const stageContentBottom = stageChildren.reduce(
      (bottom, node) => Math.max(bottom, node.getBoundingClientRect().bottom),
      stage.getBoundingClientRect().top,
    );
    const apronTop = apron.getBoundingClientRect().top;
    return {
      overflowY: getComputedStyle(root).overflowY,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      stageContentBottom,
      apronTop,
      contentOverlapPx: Math.max(0, stageContentBottom - apronTop),
    };
  });
}

async function beginPlayerVisualTrace(page) {
  await page.evaluate(() => {
    const samples = [];
    const sample = () => {
      const sf = window.SF;
      const state = sf?.state;
      const render = sf?.registry?.get?.('render');
      const player = state?.entities?.get?.(state.playerId);
      const rendererMesh = render?._meshes?.get?.(state?.playerId);
      const userData = player?.mesh?.userData || {};
      samples.push({
        mode: state?.mode || null,
        playerId: state?.playerId ?? null,
        playerPresent: !!player,
        playerDefId: player?.data?.defId || null,
        playerFactionId: player?.factionId || null,
        playerData: player?.data ? {
          shipId: player.data.shipId || null,
          loadoutId: player.data.loadoutId || null,
          sectorId: player.data.sectorId || null,
        } : null,
        playerAssetState: userData.authoredAssetState || null,
        playerVisualRoot: userData.authoredVisualRoot || null,
        playerFailureReason: userData.authoredFailureReason || null,
        playerFailureMessage: userData.authoredFailureMessage || null,
        playerAdmission: player?.presentationAdmission || null,
        rendererMeshPresent: !!rendererMesh,
        deferNoncritical: state?.render?.deferNoncriticalMeshStreaming === true,
        meshReconcileDirty: render?._meshReconcileDirty === true,
      });
      if (samples.length > 120) samples.shift();
    };
    window.__sfCruciblePlayerVisualTrace = { samples, sample, interval: setInterval(sample, 100) };
    sample();
  });
}

async function endPlayerVisualTrace(page) {
  return page.evaluate(() => {
    const trace = window.__sfCruciblePlayerVisualTrace;
    if (!trace) return [];
    clearInterval(trace.interval);
    trace.sample();
    delete window.__sfCruciblePlayerVisualTrace;
    return trace.samples.slice(-20);
  });
}

async function beginLabSpawnReceipt(page) {
  await page.evaluate(() => {
    const rows = [];
    const bus = window.SF?.bus;
    const unsubscribe = bus?.on?.('entity:spawned', ({ entity } = {}) => {
      if (!entity || entity.id == null || !entity.pos) return;
      rows.push({
        id: entity.id,
        pos: { x: entity.pos.x, z: entity.pos.z },
        defId: entity.data?.defId || null,
        lootTableId: entity.data?.lootTableId || null,
        level: entity.data?.level ?? null,
      });
    });
    window.__sfCrucibleLabSpawnReceipt = { rows, unsubscribe };
  });
}

async function beginLabRelocationReceipt(page) {
  await page.evaluate(() => {
    const rows = [];
    const bus = window.SF?.bus;
    const unsubscribe = bus?.on?.('world:playerRelocated', (payload = {}) => {
      rows.push({
        sectorId: payload.sectorId || null,
        pos: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
        reason: payload.reason || null,
        tick: payload.tick ?? null,
      });
    });
    window.__sfCrucibleLabRelocationReceipt = { rows, unsubscribe };
  });
}

async function endLabRelocationReceipt(page) {
  return page.evaluate(() => {
    const receipt = window.__sfCrucibleLabRelocationReceipt;
    if (!receipt) return [];
    if (typeof receipt.unsubscribe === 'function') receipt.unsubscribe();
    delete window.__sfCrucibleLabRelocationReceipt;
    return receipt.rows;
  });
}

async function endLabSpawnReceipt(page) {
  return page.evaluate((ownerId) => {
    const receipt = window.__sfCrucibleLabSpawnReceipt;
    if (!receipt) return [];
    if (typeof receipt.unsubscribe === 'function') receipt.unsubscribe();
    delete window.__sfCrucibleLabSpawnReceipt;
    const budget = window.SF?.ctx?.helpers?.spawnBudget;
    return receipt.rows.filter((row) => budget?.ownerForEntity?.(row.id) === ownerId);
  }, `combat-lab:${ENEMY_PACKAGE_ID}`);
}

async function beginFoundryShotReceipt(page) {
  if (!FOUNDRY_ROUTE) return;
  await page.evaluate(() => {
    const rows = { fires: [], hits: [], damage: [] };
    const sf = window.SF;
    const state = sf?.state;
    const playerId = state?.playerId;
    const summarizeTarget = (targetId) => {
      const target = state?.entities?.get?.(targetId);
      return {
        targetId: targetId ?? null,
        targetType: target?.type || null,
        surfaceId: target?.data?.foundrySurface?.id || null,
        arenaSurface: target?.data?.arenaSurface === true,
        hostile: !!target && target.alive !== false
          && (target.type === 'ship' || target.type === 'drone')
          && target.team !== state?.entities?.get?.(playerId)?.team,
      };
    };
    const cap = (list, row) => {
      if (list.length < 120) list.push(row);
    };
    const off = [
      sf?.bus?.on?.('combat:fire', (payload = {}) => {
        if (payload.ownerId !== playerId || payload.weaponId !== 'wpn_pulse_laser_m') return;
        cap(rows.fires, {
          tick: state?.tick ?? null,
          ownerId: payload.ownerId ?? null,
          weaponId: payload.weaponId ?? null,
          dir: Number.isFinite(payload.dir) ? payload.dir : null,
          origin: payload.origin ? { x: payload.origin.x, z: payload.origin.z } : null,
        });
      }),
      sf?.bus?.on?.('projectile:hit', (payload = {}) => {
        if (payload.ownerId !== playerId || payload.weaponId !== 'wpn_pulse_laser_m') return;
        cap(rows.hits, {
          tick: state?.tick ?? null,
          ownerId: payload.ownerId ?? null,
          weaponId: payload.weaponId ?? null,
          pos: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
          normal: payload.normal ? { x: payload.normal.x, z: payload.normal.z } : null,
          hasBounced: payload.hasBounced === true,
          causalTags: Array.isArray(payload.causalTags) ? [...payload.causalTags] : [],
          ...summarizeTarget(payload.targetId),
        });
      }),
      sf?.bus?.on?.('combat:damage', (payload = {}) => {
        if (payload.attackerId !== playerId || payload.weaponId !== 'wpn_pulse_laser_m') return;
        cap(rows.damage, {
          tick: state?.tick ?? null,
          attackerId: payload.attackerId ?? null,
          weaponId: payload.weaponId ?? null,
          targetId: payload.targetId ?? null,
          amount: payload.amount ?? null,
          applied: payload.applied ?? null,
          origin: payload.origin || null,
          ...summarizeTarget(payload.targetId),
        });
      }),
    ].filter((unsubscribe) => typeof unsubscribe === 'function');
    window.__sfFoundryShotReceipt = { rows, off };
  });
}

async function endFoundryShotReceipt(page) {
  if (!FOUNDRY_ROUTE) return null;
  return page.evaluate(() => {
    const receipt = window.__sfFoundryShotReceipt;
    if (!receipt) return null;
    for (const unsubscribe of receipt.off || []) unsubscribe();
    delete window.__sfFoundryShotReceipt;
    return receipt.rows;
  });
}

async function fireFoundryShot(page, kind) {
  const aim = await page.waitForFunction((wanted) => {
    const sf = window.SF;
    const state = sf?.state;
    const player = state?.entities?.get?.(state?.playerId);
    const project = sf?.ctx?.helpers?.worldToScreen;
    if (!player || typeof project !== 'function') return false;
    if (wanted === 'bank') {
      const surfaces = (state.entityList || []).filter((entity) => (
        entity?.alive !== false && entity?.data?.arenaSurface === true && entity?.data?.foundrySurface
      ));
      const bank = surfaces.find((entity) => entity.data.foundrySurface.id === 'bank_west');
      if (!bank?.pos) return false;
      const bankData = bank.data.foundrySurface;
      const halfX = Number(bankData.halfLength);
      const halfZ = Number(bankData.halfWidth);
      if (!(halfX > 0 && halfZ > 0)) return false;
      const rotateToWorld = (local) => {
        const rot = Number.isFinite(bank.rot) ? bank.rot : 0;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        return { x: c * local.x - s * local.z, z: s * local.x + c * local.z };
      };
      const rotateToLocal = (world, origin) => {
        const rot = Number.isFinite(bank.rot) ? bank.rot : 0;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const x = world.x - origin.x;
        const z = world.z - origin.z;
        return { x: c * x + s * z, z: -s * x + c * z };
      };
      const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
      const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
      const scale = (v, amount) => ({ x: v.x * amount, z: v.z * amount });
      const dot = (a, b) => a.x * b.x + a.z * b.z;
      const obbBlocksSegment = (surface, start, end) => {
        const data = surface?.data?.foundrySurface;
        if (!data || !surface.pos || !Number.isFinite(data.halfLength) || !Number.isFinite(data.halfWidth)) return false;
        const rot = Number.isFinite(surface.rot) ? surface.rot : 0;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const toSurfaceLocal = (point) => {
          const x = point.x - surface.pos.x;
          const z = point.z - surface.pos.z;
          return { x: c * x + s * z, z: -s * x + c * z };
        };
        const from = toSurfaceLocal(start);
        const to = toSurfaceLocal(end);
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        let enter = 0;
        let exit = 1;
        for (const [origin, delta, half] of [[from.x, dx, data.halfLength + 1], [from.z, dz, data.halfWidth + 1]]) {
          if (Math.abs(delta) < 1e-8) {
            if (Math.abs(origin) > half) return false;
            continue;
          }
          let t0 = (-half - origin) / delta;
          let t1 = (half - origin) / delta;
          if (t0 > t1) [t0, t1] = [t1, t0];
          enter = Math.max(enter, t0);
          exit = Math.min(exit, t1);
          if (enter > exit) return false;
        }
        return enter > 0.002 && enter < 0.998;
      };
      const clearOfOtherFoundryObbs = (start, end) => !surfaces.some((surface) => (
        surface !== bank && obbBlocksSegment(surface, start, end)
      ));
      const faceSpecs = [
        { localNormal: { x: 1, z: 0 }, localPoint: { x: halfX, z: 0 }, tangentLimit: halfZ, tangentAxis: 'z' },
        { localNormal: { x: -1, z: 0 }, localPoint: { x: -halfX, z: 0 }, tangentLimit: halfZ, tangentAxis: 'z' },
        { localNormal: { x: 0, z: 1 }, localPoint: { x: 0, z: halfZ }, tangentLimit: halfX, tangentAxis: 'x' },
        { localNormal: { x: 0, z: -1 }, localPoint: { x: 0, z: -halfZ }, tangentLimit: halfX, tangentAxis: 'x' },
      ];
      const hostiles = (state.entityList || [])
        .filter((entity) => entity?.alive !== false && entity?.pos
          && (entity.type === 'ship' || entity.type === 'drone') && entity.team !== player.team)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      for (const hostile of hostiles) {
        const hostileScreen = project(hostile.pos);
        if (!hostileScreen?.onScreen) continue;
        for (const face of faceSpecs) {
          const normal = rotateToWorld(face.localNormal);
          const facePoint = add(bank.pos, rotateToWorld(face.localPoint));
          // The player-facing face is the only legal impact side for this route.  Mirror the
          // intended hostile through that plane, then intersect the player-to-mirror ray with it.
          if (dot(sub(player.pos, facePoint), normal) <= 0) continue;
          const mirroredHostile = sub(hostile.pos, scale(normal, 2 * dot(sub(hostile.pos, facePoint), normal)));
          const ray = sub(mirroredHostile, player.pos);
          const denominator = dot(ray, normal);
          if (Math.abs(denominator) < 1e-8) continue;
          const t = dot(sub(facePoint, player.pos), normal) / denominator;
          if (!(t > 0.002 && t < 0.998)) continue;
          const impact = add(player.pos, scale(ray, t));
          const localImpact = rotateToLocal(impact, bank.pos);
          if (Math.abs(localImpact[face.tangentAxis]) > face.tangentLimit - 1) continue;
          const impactScreen = project(impact);
          if (!impactScreen?.onScreen || impactScreen.x < 12 || impactScreen.x > innerWidth - 12
            || impactScreen.y < 12 || impactScreen.y > innerHeight - 12) continue;
          // The reflection leg is checked against every other live Foundry OBB, including
          // wall_south_w.  A candidate that would bank into that wall is rejected here.
          if (!clearOfOtherFoundryObbs(player.pos, impact) || !clearOfOtherFoundryObbs(impact, hostile.pos)) continue;
          return {
            x: Math.round(impactScreen.x),
            y: Math.round(impactScreen.y),
            targetId: hostile.id,
            surfaceId: bankData.id,
            aimPoint: { x: impact.x, z: impact.z },
            faceNormal: normal,
          };
        }
      }
      return false;
    }
    const obbBlocksDirectLine = (surface, target) => {
      const data = surface?.data?.foundrySurface;
      if (!data || !surface.pos || !target?.pos || !Number.isFinite(data.halfLength) || !Number.isFinite(data.halfWidth)) return false;
      const rot = Number.isFinite(surface.rot) ? surface.rot : 0;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const local = (point) => ({
        x: c * (point.x - surface.pos.x) + s * (point.z - surface.pos.z),
        z: -s * (point.x - surface.pos.x) + c * (point.z - surface.pos.z),
      });
      const start = local(player.pos);
      const end = local(target.pos);
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      let enter = 0;
      let exit = 1;
      for (const [origin, delta, half] of [[start.x, dx, data.halfLength], [start.z, dz, data.halfWidth]]) {
        if (Math.abs(delta) < 1e-8) {
          if (Math.abs(origin) > half) return false;
          continue;
        }
        let t0 = (-half - origin) / delta;
        let t1 = (half - origin) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        enter = Math.max(enter, t0);
        exit = Math.min(exit, t1);
        if (enter > exit) return false;
      }
      return enter > 0.02 && enter < 0.98;
    };
    for (const entity of state?.entityList || []) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      const matches = wanted === 'bank'
        ? entity.data?.foundrySurface?.id === 'bank_west'
        : (entity.type === 'ship' || entity.type === 'drone') && entity.team !== player.team;
      if (!matches) continue;
      if (wanted === 'hostile' && (state.entityList || []).some((surface) => obbBlocksDirectLine(surface, entity))) continue;
      const screen = project(entity.pos);
      if (!screen?.onScreen || screen.x < 12 || screen.x > innerWidth - 12 || screen.y < 12 || screen.y > innerHeight - 12) continue;
      return { x: Math.round(screen.x), y: Math.round(screen.y), targetId: entity.id, surfaceId: entity.data?.foundrySurface?.id || null };
    }
    return false;
  }, kind, { timeout: 15000 });
  assert.ok(aim, `Foundry ${kind} target is visible to the player cursor`);
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  return aim;
}

function matchingDamage(receipt, hit) {
  return receipt.damage.find((row) => row.targetId === hit.targetId && (row.applied || 0) > 0) || null;
}

function directShotEvidence(receipt, action) {
  assert.ok(receipt?.fires?.length > 0, 'direct shot was emitted by the live Pulse Laser input path');
  const hit = receipt.hits.find((row) => row.hostile && !row.hasBounced);
  assert.ok(hit, `direct shot reached a hostile without a surface bounce; ${JSON.stringify(receipt?.hits || [])}`);
  const damage = matchingDamage(receipt, hit);
  assert.ok(damage, `direct projectile hit routed damage through combat; ${JSON.stringify(receipt?.damage || [])}`);
  return { action, causal: 'DIRECT', fire: receipt.fires[0], hit, damage };
}

function bankShotEvidence(receipt, action) {
  assert.ok(receipt?.fires?.length > 0, 'bank shot was emitted by the live Pulse Laser input path');
  const surface = receipt.hits.find((row) => row.surfaceId === 'bank_west' && row.hasBounced);
  assert.ok(surface, `bank shot reached the visible bank_west surface with a reflected receipt; ${JSON.stringify(receipt?.hits || [])}`);
  const hit = receipt.hits.find((row) => row.hostile && row.hasBounced);
  assert.ok(hit, `reflected bank shot reached a hostile; ${JSON.stringify(receipt?.hits || [])}`);
  const damage = matchingDamage(receipt, hit);
  assert.ok(damage, `reflected bank shot routed damage through combat; ${JSON.stringify(receipt?.damage || [])}`);
  return { action, causal: 'BANK', fire: receipt.fires[0], surface, hit, damage };
}

async function waitForShotEvidence(page, kind, timeout = 12000) {
  await page.waitForFunction((wanted) => {
    const receipt = window.__sfFoundryShotReceipt?.rows;
    if (!receipt) return false;
    const damaged = (hit) => receipt.damage.some((row) => row.targetId === hit.targetId && (row.applied || 0) > 0);
    if (wanted === 'direct') return receipt.hits.some((row) => row.hostile && !row.hasBounced && damaged(row));
    const surface = receipt.hits.some((row) => row.surfaceId === 'bank_west' && row.hasBounced);
    return surface && receipt.hits.some((row) => row.hostile && row.hasBounced && damaged(row));
  }, kind, { timeout });
}

async function fireFoundryShotUntilEvidence(page, targetKind, evidenceKind = targetKind) {
  const actions = [];
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    actions.push(await fireFoundryShot(page, targetKind));
    try {
      await waitForShotEvidence(page, evidenceKind, 4500);
      return actions;
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error(`${evidenceKind} shot did not produce a linked player hit after ${actions.length} visible cursor attempts: ${lastError?.message || 'no receipt'}`);
  error.actions = actions;
  throw error;
}

function assertRunWitness(witness, label, { allowPaused = false } = {}) {
  assert.ok(
    witness.mode === 'flight' || (allowPaused && witness.mode === 'paused'),
    `${label}: game is ${allowPaused ? 'in flight or paused by the Lab screen' : 'in flight'}`,
  );
  assert.equal(witness.run?.kind, 'lab', `${label}: run kind is lab`);
  assert.equal(witness.run?.seed, SEED, `${label}: seed survives real game:new`);
  assert.equal(witness.run?.arenaId, ARENA_ID, `${label}: selected arena survives real game:new`);
  assert.equal(witness.sectorId, EXPECTED.sectorId, `${label}: Lab entered selected arena sector`);
  assert.ok(witness.playerPos, `${label}: player exists`);
  assert.equal(witness.playerBuild?.hullId, EXPECTED_HULL_ID, `${label}: selected hull is active`);
  for (const [slotIndex, defId] of EXPECTED_FITTINGS) {
    assert.equal(witness.playerBuild?.fittings?.[slotIndex], defId,
      `${label}: ${defId} is fitted in slot ${slotIndex} through the live ship owner`);
  }
  assert.ok(witness.owned.length > 0, `${label}: budget-owned Lab enemies materialized`);
  if (FOUNDRY_ROUTE) {
    assert.equal(witness.arenaDiagnostics?.lawId, ARENA_ID, `${label}: Foundry law owner is live`);
    assert.equal(witness.foundrySurfaces?.length, 12, `${label}: bounded Foundry geometry is live`);
    assert.equal(witness.foundrySurfaces.filter((row) => row.kind === 'plate').length, 2,
      `${label}: two fixed bank plates are present`);
    assert.equal(witness.foundrySurfaces.filter((row) => row.kind === 'loose_plate' && row.dynamic).length, 2,
      `${label}: two movable bank plates are present`);
    assert.ok(witness.foundrySurfaces.every((row) => row.radarHidden),
      `${label}: room architecture stays out of the tactical contact roster`);
    assert.equal(witness.foundrySurfaces.filter((row) => row.masslineTetherable).length, 2,
      `${label}: only the two loose plates advertise Massline interaction`);
    const built = witness.foundrySurfaces.filter((row) => row.meshKind != null);
    assert.ok(built.length > 0, `${label}: at least one in-glass Foundry collider is rendered`);
    assert.ok(built.every((row) => row.meshKind === 'ricochet-foundry-surface'),
      `${label}: every streamed Foundry collider owns the authored visual; ${JSON.stringify(built)}`);
    const tutorialBank = witness.foundrySurfaces.find((row) => row.surfaceId === 'bank_west');
    assert.equal(tutorialBank?.meshKind, 'ricochet-foundry-surface',
      `${label}: the entry-camera tutorial bank is visibly streamed; ${JSON.stringify(witness.foundrySurfaces)}`);
    assert.equal(tutorialBank?.rootVisible, true, `${label}: tutorial bank root is visible`);
    assert.ok(tutorialBank?.visibleLeaves > 0, `${label}: tutorial bank owns visible renderable leaves`);
    assert.equal(tutorialBank?.projection?.onScreen, true,
      `${label}: tutorial bank is actually inside the player camera; ${JSON.stringify(tutorialBank)}`);
  }
}

function assertRelocationReceipt(rows, label) {
  const receipt = rows.find((row) => row.reason === `sandbox:combat-lab:${ARENA_ID}`);
  assert.ok(receipt, `${label}: canonical world owner emitted the Combat Lab relocation receipt`);
  assert.equal(receipt.sectorId, EXPECTED.sectorId, `${label}: relocation receipt names the selected sector`);
  assert.ok(Math.abs(receipt.pos.x - EXPECTED.x) <= POSITION_EPSILON,
    `${label}: relocation receipt x is authored center`);
  assert.ok(Math.abs(receipt.pos.z - EXPECTED.z) <= POSITION_EPSILON,
    `${label}: relocation receipt z is authored center`);
}

function assertVisibleLabWitness(witness, label) {
  assertRunWitness(witness, label, { allowPaused: true });
  assert.equal(witness.labForm.starterId, STARTER_ID, `${label}: selected starter remains visible`);
  assert.equal(witness.labForm.hullId, EXPECTED_HULL_ID, `${label}: selected hull remains visible`);
  assert.equal(witness.labForm.enemyPackageId, ENEMY_PACKAGE_ID, `${label}: selected enemy package remains visible`);
  assert.equal(witness.labForm.arenaId, ARENA_ID, `${label}: selected arena remains visible`);
  assert.equal(witness.labForm.seed, String(SEED), `${label}: selected seed remains visible`);
  assert.equal(witness.labForm.wave, String(START_WAVE), `${label}: selected starting wave remains visible`);
  assert.equal(witness.seedInput?.visible, true, `${label}: seed input is visible`);
  assert.ok(witness.seedInput.width >= 96, `${label}: seed input remains legible (${witness.seedInput.width}px)`);
  assert.equal(witness.controlsVisible, true, `${label}: Combat Lab controls are visible`);
  assert.equal(witness.telemetryVisible, true, `${label}: Combat Lab telemetry is visible`);
  assert.equal(witness.controlsInViewport, true, `${label}: Combat Lab controls are in the viewport`);
  assert.equal(witness.telemetryInViewport, true, `${label}: Combat Lab telemetry is in the viewport`);
  for (const control of ['Clear enemies', 'Invulnerable: off']) {
    const button = witness.runtimeControls.find((entry) => entry.label === control);
    assert.ok(button, `${label}: ${control} control is mounted`);
    assert.equal(button.disabled, false, `${label}: ${control} control is usable after reopening`);
    assert.equal(button.inViewport, true, `${label}: ${control} control is in the viewport`);
  }
}

async function reopenLabFromPause(page) {
  await page.keyboard.press('P');
  await page.locator('[data-screen="pause"]').waitFor({ state: 'visible', timeout: 30000 });
  await clickExact(page, 'Sandbox', page.locator('[data-screen="pause"]'));
  await page.locator('#sf-sandbox-lab-arena').waitFor({ state: 'visible', timeout: 30000 });
}

function spawnReceiptDigest(receipt) {
  return JSON.stringify({
    owned: receipt
      .map(({ defId, lootTableId, level, pos }) => ({ defId, lootTableId, level, pos }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

async function closeBrowserWithinDeadline(instance) {
  if (!instance) return { opened: false, closed: true, timedOut: false };
  const closed = await Promise.race([
    instance.close().then(() => true).catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), BROWSER_CLOSE_TIMEOUT_MS)),
  ]);
  return {
    opened: true,
    closed: closed === true && (typeof instance.isConnected !== 'function' || !instance.isConnected()),
    timedOut: closed !== true,
  };
}

async function openBrowserRoute() {
  server = await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  // The browser route uses the same CSP-safe polling adapter as Electron.  Without it, the
  // initial readiness predicate can remain pending even after the page's normal root is loaded.
  installCspSafePlaywrightPolling(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch { /* browser storage unavailable */ }
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return page;
}

async function openElectronRoute() {
  if (!electron) throw new Error('this Playwright build has no _electron; cannot drive the desktop route');
  isolatedElectronLaunch = createIsolatedElectronLaunch({
    root: ROOT,
    taskId: FOUNDRY_ROUTE ? 'crucible-foundry-route' : 'crucible-lab-route',
    timeout: 180000,
    baseEnv: { ...process.env, SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1' },
  });
  electronApp = await electron.launch(isolatedElectronLaunch.options);
  // Attach before firstWindow(): a module-load failure can happen before Playwright returns the
  // first page, and the BOOT report must retain that runtime cause rather than only timing out.
  electronApp.on('window', (candidate) => {
    if (!issues) issues = collectPageIssues(candidate);
  });
  const page = await electronApp.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    win.setContentSize(1440, 900);
    win.show();
    win.focus();
    if (win.moveTop) win.moveTop();
  });
  await page.bringToFront().catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  assertIsolatedElectronRootUrl(page.url());
  return page;
}

try {
  console.log(`\nCrucible ${FOUNDRY_ROUTE ? 'Foundry ' : 'Lab '}${RUNTIME_LABEL} route\n`);
  const page = ELECTRON_ROUTE ? await openElectronRoute() : await openBrowserRoute();
  issues ||= collectPageIssues(page);

  phase = 'BOOT';
  console.log('  phase=BOOT navigating normal game root');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 90000 });
  if (ELECTRON_ROUTE) {
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 90000 });
  record(phase, true, `normal ${RUNTIME_LABEL.toLowerCase()} game root reached with isolated player store`);

  phase = 'SANDBOX';
  await clickExact(page, 'Sandbox');
  await page.locator('#sf-sandbox-lab-arena').waitFor({ state: 'visible', timeout: 30000 });
  record(phase, true, 'actual main-menu Sandbox control opened the Combat Lab form');

  phase = 'CONFIGURE';
  console.log('  phase=CONFIGURE selecting starter package');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-starter', STARTER_ID);
  console.log('  phase=CONFIGURE selecting enemy package');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-enemy', ENEMY_PACKAGE_ID);
  console.log('  phase=CONFIGURE selecting arena');
  await selectViaVisibleWidget(page, '#sf-sandbox-lab-arena', ARENA_ID);
  await page.locator('#sf-sandbox-lab-seed').fill(String(SEED));
  await page.locator('#sf-sandbox-lab-wave').fill(String(START_WAVE));
  await page.waitForFunction(() => {
    const launch = [...document.querySelectorAll('.sf-sandbox-lab-actions button')]
      .find((button) => button.textContent.trim() === 'Launch');
    return !!launch && !launch.disabled;
  }, null, { timeout: 10000 });
  await page.locator('#sf-sandbox-lab-seed').scrollIntoViewIfNeeded();
  const layout = await readSandboxLayoutWitness(page);
  assert.ok(layout, 'Sandbox stage/apron layout witness is available');
  assert.ok(layout.contentOverlapPx <= 1,
    `Sandbox stage content must not paint under its apron (${layout.contentOverlapPx}px overlap)`);
  assert.match(layout.overflowY, /auto|scroll/, 'long Sandbox chassis owns a real vertical scroll route');
  await page.screenshot({
    path: (() => {
      const dir = join(ROOT, '.devshots', FOUNDRY_ROUTE ? 'crucible-foundry-route' : 'crucible-lab-route');
      mkdirSync(dir, { recursive: true });
      return join(dir, `${ROUTE_SLUG}-config${SCREENSHOT_SUFFIX}.png`);
    })(),
    fullPage: false,
  });
  record(phase, true, `${ARENA_ID} · ${ENEMY_PACKAGE_ID} · wave ${START_WAVE} · seed ${SEED}`);

  phase = 'LAUNCH';
  const actions = page.locator('.sf-sandbox-lab-actions');
  await beginLabSpawnReceipt(page);
  await beginLabRelocationReceipt(page);
  await clickExact(page, 'Launch', actions, { noWaitAfter: true });
  await waitForLabFlight(page, 'launch', issues);
  const firstRelocationReceipt = await endLabRelocationReceipt(page);
  await waitForFoundryPresentation(page, 'launch');
  const firstSpawnReceipt = await endLabSpawnReceipt(page);
  const first = await readLiveWitness(page);
  assertRunWitness(first, 'launch');
  assertRelocationReceipt(firstRelocationReceipt, 'launch');
  assert.equal(firstSpawnReceipt.length, first.owned.length,
    'launch receipt records every budget-owned enemy at materialization before simulation movement');
  record(phase, true, `${first.owned.length} owned enemies · ${first.sectorId} · (${first.playerPos.x}, ${first.playerPos.z})`);
  if (FOUNDRY_ROUTE) {
    const dir = join(ROOT, '.devshots', 'crucible-foundry-route');
    mkdirSync(dir, { recursive: true });
    const flightPath = join(dir, `foundry-flight${SCREENSHOT_SUFFIX}.png`);
    if (VISUAL_REVIEW) {
      await captureFoundryVisualReviewCanvas(page, flightPath);
    } else {
      await page.screenshot({ path: flightPath, fullPage: false });
    }

    if (VISUAL_REVIEW) {
      await waitForMirrorjawPresentation(page);
      phase = 'VISUAL-ADMISSION';
      const mirrorjawAdmission = await requestMirrorjawAuthoredAdmission(page);
      await waitForMirrorjawReviewLeaves(page);
      saveEvidence('visualMirrorjawAdmission', mirrorjawAdmission);
      record(phase, true, `live authored boundary admitted Mirrorjaw ${mirrorjawAdmission.bossId} without simulation mutation`);
      let cameraStaged = false;
      try {
        phase = 'VISUAL-ROOM';
        const roomReview = await stageFoundryVisualReviewCamera(page, 'room');
        cameraStaged = true;
        assert.equal(roomReview.surfaceIds.length, 12, 'room review isolates all 12 Foundry surfaces');
        assert.equal(roomReview.visibleRootIds.length, 12, 'room review leaves no non-Foundry render roots visible');
        assert.ok(roomReview.surfaceIds.includes('furnace'), 'room review includes the Foundry furnace');
        assert.ok(roomReview.surfaceIds.some((id) => id.startsWith('shutter_')), 'room review includes a Foundry shutter');
        assert.ok(roomReview.surfaceIds.some((id) => id.startsWith('wall_')), 'room review includes Foundry wall hierarchy');
        assert.ok(roomReview.surfaceIds.some((id) => id.startsWith('bank_')), 'room review includes Foundry bank hierarchy');
        await captureFoundryVisualReviewCanvas(page, join(dir, 'foundry-review-room.png'));
        saveEvidence('visualRoom', roomReview);
        record(phase, true, 'scene-isolated presentation-only canvas composition captured with furnace, shutter, wall, and bank hierarchy');

        phase = 'VISUAL-MIRRORJAW-FRONT';
        await stageFoundryVisualReviewCamera(page, 'mirrorjaw-front-three-quarter');
        const mirrorjawFrontReview = await stageFoundryVisualReviewCamera(page, 'mirrorjaw-front-three-quarter');
        assert.ok(mirrorjawFrontReview.boss.visibleLeaves > 0, 'Mirrorjaw has visible renderable geometry in the elevated local-front three-quarter review');
        assert.ok(mirrorjawFrontReview.boss.overlay.visibleLeaves > 0, 'Mirrorjaw authored overlay has visible leaves in the elevated local-front three-quarter review');
        await captureFoundryVisualReviewCanvas(page, join(dir, 'foundry-review-mirrorjaw-front-three-quarter.png'));
        saveEvidence('visualMirrorjawFront', mirrorjawFrontReview);
        record(phase, true, `scene-isolated presentation-only local-front three-quarter Mirrorjaw canvas capture (boss ${mirrorjawFrontReview.boss.id})`);

        phase = 'VISUAL-MIRRORJAW-REAR';
        const mirrorjawRearReview = await stageFoundryVisualReviewCamera(page, 'mirrorjaw-rear-final-phase');
        assert.equal(mirrorjawRearReview.boss.presentationPhase, 'unmoored_reactor', 'rear presentation view uses the requested cloned-observer reactor phase');
        assert.ok(mirrorjawRearReview.boss.visibleLeaves > 0, 'Mirrorjaw has visible renderable geometry in the rear three-quarter review');
        assert.ok(mirrorjawRearReview.boss.overlay.visibleLeaves > 0, 'Mirrorjaw authored overlay has visible leaves in the rear three-quarter review');
        await captureFoundryVisualReviewCanvas(page, join(dir, 'foundry-review-mirrorjaw-rear-final-phase.png'));
        saveEvidence('visualMirrorjawRear', mirrorjawRearReview);
        record(phase, true, `scene-isolated presentation-only rear three-quarter reactor canvas capture (boss ${mirrorjawRearReview.boss.id}; real ${mirrorjawRearReview.boss.realPhase || 'none'} → presentation ${mirrorjawRearReview.boss.presentationPhase})`);
      } finally {
        if (cameraStaged) {
          phase = 'VISUAL-RESTORE';
          const restored = await restoreFoundryVisualReviewCamera(page);
          assert.equal(restored.restored, true, 'scene-isolated review camera is restored before teardown');
          saveEvidence('visualCameraRestore', restored);
          record(phase, true, 'scene-isolated presentation camera restored without gameplay mutation');
        }
      }
    } else {
    phase = 'DIRECT';
    await beginFoundryShotReceipt(page);
    let directReceipt = null;
    let directActions = [];
    try {
      directActions = await fireFoundryShotUntilEvidence(page, 'hostile', 'direct');
      directReceipt = await endFoundryShotReceipt(page);
    } catch (error) {
      directActions = Array.isArray(error?.actions) ? error.actions : directActions;
      directReceipt = await endFoundryShotReceipt(page);
      saveEvidence('directObserved', { actions: directActions, receipt: directReceipt });
      throw error;
    }
    saveEvidence('directObserved', { actions: directActions, receipt: directReceipt });
    const directEvidence = saveEvidence('direct', directShotEvidence(directReceipt, directActions));
    await page.screenshot({
      path: join(dir, `foundry-direct${SCREENSHOT_SUFFIX}.png`),
      fullPage: false,
    });
    record(phase, true, `Pulse Laser direct shot hit hostile ${directEvidence.hit.targetId} and dealt ${directEvidence.damage.applied}`);

    phase = 'BANK';
    await beginFoundryShotReceipt(page);
    let bankReceipt = null;
    let bankActions = [];
    try {
      bankActions = await fireFoundryShotUntilEvidence(page, 'bank');
      bankReceipt = await endFoundryShotReceipt(page);
    } catch (error) {
      bankActions = Array.isArray(error?.actions) ? error.actions : bankActions;
      bankReceipt = await endFoundryShotReceipt(page);
      saveEvidence('bankObserved', { actions: bankActions, receipt: bankReceipt });
      throw error;
    }
    saveEvidence('bankObserved', { actions: bankActions, receipt: bankReceipt });
    const bankEvidence = saveEvidence('bank', bankShotEvidence(bankReceipt, bankActions));
    await page.screenshot({
      path: join(dir, `foundry-bank${SCREENSHOT_SUFFIX}.png`),
      fullPage: false,
    });
    record(phase, true, `Pulse Laser bank shot reflected from ${bankEvidence.surface.surfaceId} into hostile ${bankEvidence.hit.targetId} for ${bankEvidence.damage.applied}`);
    }
  }

  if (!VISUAL_REVIEW) {
  phase = 'REOPEN';
  await reopenLabFromPause(page);
  await revealLabRuntime(page);
  const firstVisible = await readLiveWitness(page);
  assertVisibleLabWitness(firstVisible, 'reopened Lab');
  const firstSpawnDigest = spawnReceiptDigest(firstSpawnReceipt);
  await page.screenshot({
    path: (() => {
      const dir = join(ROOT, '.devshots', FOUNDRY_ROUTE ? 'crucible-foundry-route' : 'crucible-lab-route');
      mkdirSync(dir, { recursive: true });
      return join(dir, `${ROUTE_SLUG}-lab${SCREENSHOT_SUFFIX}.png`);
    })(),
    fullPage: false,
  });
  assert.match(firstVisible.telemetryText, /Live hostiles/i, 'telemetry surface identifies its hostile row');
  record(phase, true, 'reopened Lab controls and telemetry are visibly mounted');

  phase = 'RELAUNCH';
  await beginLabSpawnReceipt(page);
  await beginLabRelocationReceipt(page);
  await beginRelaunchTransitionWitness(page);
  let secondRelocationReceipt;
  let secondSpawnReceipt;
  let relaunchTransition;
  try {
    await clickExact(page, 'Relaunch same seed', page.locator('.sf-sandbox-lab-actions'), { noWaitAfter: true });
    await beginPlayerVisualTrace(page);
    const relaunchLoading = await waitForRelaunchLoadingWitness(page);
    assert.ok(['paused', 'flight'].includes(relaunchLoading.initial?.mode),
      `Relaunch starts from a live flight host mode; ${JSON.stringify(relaunchLoading.initial)}`);
    assert.equal(relaunchLoading.loading?.previousMode, relaunchLoading.initial?.mode,
      'Relaunch enters loading from the exact pre-click Lab host mode');
    assert.equal(relaunchLoading.loading?.postOpeningAdmissionReleased, false,
      'second loading transition resets the post-opening pipeline admission latch before the exact census');
    await waitForLabFlight(page, 'relaunch', issues);
    secondRelocationReceipt = await endLabRelocationReceipt(page);
    await waitForFoundryPresentation(page, 'relaunch');
    await endPlayerVisualTrace(page);
    secondSpawnReceipt = await endLabSpawnReceipt(page);
  } finally {
    relaunchTransition = await endRelaunchTransitionWitness(page);
    saveEvidence('relaunchTransition', relaunchTransition);
  }
  assert.ok(relaunchTransition.events.some((event) => event.kind === 'mode:changed' && event.mode === 'flight'),
    'Relaunch commits the captured loading transition back to flight');
  record(phase, true, 'actual Relaunch same seed re-entered the real game:new path');

  phase = 'REOPEN-2';
  await reopenLabFromPause(page);
  await revealLabRuntime(page);
  const secondVisible = await readLiveWitness(page);
  assertVisibleLabWitness(secondVisible, 'reopened relaunch Lab');
  assertRelocationReceipt(secondRelocationReceipt, 'relaunch');
  assert.equal(secondSpawnReceipt.length, secondVisible.owned.length,
    'relaunch receipt records every budget-owned enemy at materialization before simulation movement');
  assert.equal(spawnReceiptDigest(secondSpawnReceipt), firstSpawnDigest,
    'actual Relaunch same seed reproduces the deterministic owned-enemy materialization receipt');
  record(phase, true, 'reopened controls remain usable after the real Relaunch path');
  }

  phase = 'CLEAN';
  const errors = issues.errorIssues();
  assert.deepEqual(errors, [], `page errors: ${JSON.stringify(summarizeIssues(errors))}`);
  record(phase, true, 'no page errors or failed requests');
  console.log(`\nCRUCIBLE LAB ${RUNTIME_LABEL.toUpperCase()} ROUTE PASS`);
} catch (error) {
  const pageErrors = issues ? summarizeIssues(issues.errorIssues()) : [];
  const message = error && error.message ? error.message : String(error);
  record(phase, false, pageErrors.length
    ? `${message}; pageErrors=${JSON.stringify(pageErrors)}`
    : message);
  console.log(`\nCRUCIBLE LAB ${RUNTIME_LABEL.toUpperCase()} ROUTE FAIL`);
  process.exitCode = 1;
} finally {
  teardown.browser = await closeBrowserWithinDeadline(browser);
  if (server) {
    teardown.server = { opened: true, terminationRequested: server.kill() };
  } else {
    teardown.server = { opened: false, terminationRequested: false };
  }
  if (electronApp) {
    const closed = await electronApp.close().then(() => true).catch(() => false);
    teardown.electron = { opened: true, closed };
    try {
      isolatedElectronLaunch?.cleanup({ runtimeClosed: closed });
      teardown.electron.profileCleaned = closed;
    } catch {
      teardown.electron.profileCleaned = false;
    }
  } else {
    teardown.electron = { opened: false, closed: true, profileCleaned: true };
  }
  try {
    rmSync(PLAYER_STORE_DIR, { recursive: true, force: true });
    teardown.playerStore = { removed: true };
  } catch {
    teardown.playerStore = { removed: false };
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify({
    route: VISUAL_REVIEW ? 'ricochet-foundry-visual-review' : (FOUNDRY_ROUTE ? 'ricochet-foundry' : 'combat-lab'),
    runtime: RUNTIME_LABEL.toLowerCase(),
    passed: routePassed(),
    finalPhase: phase,
    results,
    evidence: routeEvidence,
    teardown,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}
