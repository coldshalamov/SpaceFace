#!/usr/bin/env node
// capture-works-release-part.mjs — PQ-131.00 proof that an authored release part loads,
// renders and disposes in the Asteroid Works renderer.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'asteroid-works');
const EVIDENCE_DIR = join(ROOT, 'assets', 'works', 'evidence', 'PQ-131.00');
const VIEWPORT = { width: 1920, height: 1080 };

const MIN_BOX_PX = 24;
const MIN_MASK_COUNT = 200;
const MIN_MASK_AREA_FRAC = 0.04;
const MIN_MASK_MEDIAN_LUMA = 24;
const MIN_MASK_STDEV_LUMA = 6.0;
const MIN_MASK_CHANGED_FRAC = 0.50;
const MIN_TRI_DELTA = 64;

const NEGATIVE_ONLY = process.argv.includes('--negative-control');

const { chromium } = await loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });

let server = null;
let browser = null;
let issues = null;
const failures = [];

function snapPath(name) {
  return join(OUT_DIR, name);
}

function fail(message) {
  failures.push(message);
}

function lodPrefixOk(names, prefix) {
  return names.every((name) => String(name).toUpperCase().startsWith(prefix));
}

function lodPrefixFor(nodeLod) {
  return nodeLod === 'lod1' ? 'LOD1_' : 'LOD0_';
}

function presentationKey(p, includeVisibleChildCount = true) {
  if (!p) return null;
  const parts = [
    p.toneMapping,
    p.outputColorSpace,
    p.clearColor,
    p.clearAlpha,
    p.overrideMaterialNull,
    p.backgroundIsBaseline,
    p.environmentIsBaseline,
    p.autoClear,
    p.renderTargetNull,
  ];
  if (includeVisibleChildCount) parts.push(p.visibleChildCount);
  return parts.join('|');
}

try {
  server = await startFreshServer();
  // Headed system Chrome/Edge with a real GPU — the repo's proven route to authored-visual
  // readiness (headless SwiftShader times out the ship-visual gate; see the alpha baseline probe).
  const executablePath = findSystemBrowser();
  browser = await chromium.launch(executablePath ? {
    headless: false,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--force-device-scale-factor=1'],
  } : { headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  issues = collectPageIssues(page);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sf.cinematicSeen', '1');
      localStorage.setItem('sf.firstRunIntroSeen', '1');
    } catch (_) {}
  });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });

  await page.evaluate(async () => {
    const ready = window.SF.state.render && window.SF.state.render.authoredPartLibraryReady;
    if (ready && typeof ready.then === 'function') await ready.catch(() => {});
  });

  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'Works Proof', difficulty: 'standard' });
  });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 120000 });
  await page.waitForTimeout(1500);

  const opened = await page.evaluate(() => {
    const sf = window.SF;
    const st = sf.state;
    const cargo = st.player.cargo;
    cargo.capVolume = Math.max(cargo.capVolume, 400);
    for (const [k, q] of Object.entries({
      cmdty_regocrete: 30, cmdty_control_unit: 8, cmdty_refined_metals: 10,
      cmdty_electronics: 6, cmdty_purified_silica: 6,
    })) cargo.items[k] = (cargo.items[k] || 0) + q;
    const ast = st.entityList.find((e) => e && e.alive !== false && e.type === 'asteroid'
      && e.data && (e.data.yieldU || 0) > 10);
    if (!ast) return { ok: false };
    st.ui.pendingDrillAsteroidId = ast.id;
    sf.ctx.screenManager.pushScreen('drill');
    return { ok: true, asteroidId: ast.id };
  });
  if (!opened.ok) throw new Error('no live asteroid found for the works proof');
  await page.waitForFunction(() => !!window.SF.state.drill, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const c = document.querySelector('.ast-canvas');
    return !!(c && c.__ast3d && typeof c.__ast3d.mountWorksProof === 'function');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const before = await waitRendererSettled(page);
  const presentationBaseline = await page.evaluate(() => {
    return document.querySelector('.ast-canvas').__ast3d.rendererPresentation();
  });
  const normalSession = await page.evaluate(() => {
    const hook = document.querySelector('.ast-canvas').__ast3d;
    return {
      worksStats: hook.worksStats(),
      observerAttached: hook.worksProofObserverAttached(),
      armed: hook.worksProofArmed(),
      rendererInfo: hook.rendererInfo(),
    };
  });
  if (normalSession.worksStats !== null) {
    fail('normalSession: worksStats() must be null before the proof is armed');
  }
  if (normalSession.observerAttached) {
    fail('normalSession: observer must not be attached before the proof is armed');
  }

  const parked = await page.evaluate(() => {
    const hook = document.querySelector('.ast-canvas').__ast3d;
    const d = window.SF.state.drill;
    const cell = hook.worksProofCell;
    d.avatar.col = cell.col;
    d.avatar.row = cell.row;
    d.avatar.fromCol = cell.col;
    d.avatar.fromRow = cell.row;
    d.avatar.moveDuration = 0;
    d.avatar.moveElapsed = 0;
    d.avatar.faceDir = 'down';
    hook.setZoomRegister('work');
    hook.frameCell(cell.col, cell.row);
    return cell;
  });
  await page.waitForTimeout(400);

  const mounted = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.mountWorksProof());
  if (!mounted || !mounted.ok) {
    throw new Error('drill_platform did not load: ' + JSON.stringify(mounted));
  }
  if (!mounted.stats || mounted.stats.loaded !== 1) {
    throw new Error(`stats().loaded !== 1 (${JSON.stringify(mounted.stats)})`);
  }

  const inScene = await waitMounted(page);
  if (!inScene) throw new Error('drill_platform never appeared in the works scene');

  await page.waitForTimeout(400);
  const presentationBeforeProbe = await page.evaluate(() => {
    return document.querySelector('.ast-canvas').__ast3d.rendererPresentation();
  });

  const workCompare = await page.evaluate(() => {
    const hook = document.querySelector('.ast-canvas').__ast3d;
    hook.setZoomRegister('work');
    return hook.compareWorksProof();
  });

  const workGate = assertMasked(workCompare, 'work');
  if (!workCompare || workCompare.shadowsSuppressed !== true) {
    fail('work: compareWorksProof did not report shadowsSuppressed: true');
  }
  const workLod = (workCompare && workCompare.lod) || { visible: [], hidden: [], nodeLod: null, tags: [] };
  const workPrefix = lodPrefixFor(workLod.nodeLod || 'lod0');
  assertLodSet(workLod.visible, workPrefix, 'work');
  if (workLod.nodeLod && workLod.nodeLod !== 'lod0') {
    fail(`work: worksNodeLod is ${workLod.nodeLod}, expected lod0`);
  }

  const negative = await runNegativeControls(page, 'work');

  const presentationAfterProbe = await page.evaluate(() => {
    return document.querySelector('.ast-canvas').__ast3d.rendererPresentation();
  });
  if (presentationKey(presentationBeforeProbe) !== presentationKey(presentationAfterProbe)) {
    fail(
      `renderer presentation changed across probes: before=${JSON.stringify(presentationBeforeProbe)} `
      + `after=${JSON.stringify(presentationAfterProbe)}`,
    );
  }
  if (presentationKey(presentationBaseline, false) !== presentationKey(presentationAfterProbe, false)) {
    fail(
      `renderer presentation drifted from pre-mount baseline: `
      + `baseline=${JSON.stringify(presentationBaseline)} after=${JSON.stringify(presentationAfterProbe)}`,
    );
  }

  const workPng = 'pq-131.00-work.png';
  await page.screenshot({ path: snapPath(workPng), type: 'png' });

  const untagged = (mounted.stats && mounted.stats.untaggedMeshes) || (workLod.untaggedMeshes) || 0;
  if (untagged) console.warn('WARN untagged works meshes:', untagged);

  let siteLod = null;
  let sitePng = null;
  let afterLoad = null;
  let hide1 = null;
  let hide2 = null;
  let disposePath = null;
  let tearingDownMount = null;

  if (!NEGATIVE_ONLY) {
    await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      hook.setZoomRegister('site');
    });
    await page.waitForTimeout(700);
    siteLod = await page.evaluate(() => document.querySelector('.ast-canvas').__ast3d.worksLod());
    const siteTags = ((siteLod && siteLod.tags) || []).slice().sort();
    let expectSiteLod = 'lod0';
    for (let i = 0; i < siteTags.length; i++) {
      if (siteTags[i] === 'lod1') { expectSiteLod = 'lod1'; break; }
    }
    if ((siteLod && siteLod.nodeLod) !== expectSiteLod) {
      fail(`site: worksNodeLod is ${siteLod && siteLod.nodeLod}, expected ${expectSiteLod} (tags=${JSON.stringify(siteTags)})`);
    }
    assertLodSet((siteLod && siteLod.visible) || [], lodPrefixFor(expectSiteLod), 'site');
    const workSet = (workLod.visible || []).slice().sort().join('|');
    const siteSet = ((siteLod && siteLod.visible) || []).slice().sort().join('|');
    if (expectSiteLod !== (workLod.nodeLod || 'lod0')) {
      if (!workSet || !siteSet || workSet === siteSet) {
        fail(`LOD sets did not differ: work=[${workLod.visible}] site=[${(siteLod && siteLod.visible) || []}]`);
      }
    }

    sitePng = 'pq-131.00-site.png';
    await page.screenshot({ path: snapPath(sitePng), type: 'png' });

    afterLoad = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      return {
        info: hook.rendererInfo(),
        stats: hook.worksStats(),
        register: hook.zoomRegister,
        lod: hook.worksLod(),
      };
    });

    await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      hook.setZoomRegister('work');
      hook.frameCell(hook.worksProofCell.col, hook.worksProofCell.row);
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => { document.querySelector('.ast-canvas').__ast3dDisposeInfo = null; });
    await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      const el = hook.worksHostElement;
      if (!el) throw new Error('worksHostElement is missing');
      el.setAttribute('hidden', '');
    });
    hide1 = await waitDisposeInfo(page);
    assertDisposeSnapshot(hide1, before, 'hide1');

    await page.evaluate(async () => {
      const c = document.querySelector('.ast-canvas');
      c.__ast3dDisposeInfo = null;
      const hook = c.__ast3d;
      await hook.worksRetireSettled();
      hook.worksHostElement.removeAttribute('hidden');
    });
    const remount1 = await waitMounted(page);
    if (!remount1) fail('hide#1 remount: worksProofMounted never became true');
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      document.querySelector('.ast-canvas').__ast3d.worksHostElement.setAttribute('hidden', '');
    });
    hide2 = await waitDisposeInfo(page);
    assertDisposeSnapshot(hide2, before, 'hide2');

    await page.evaluate(async () => {
      const c = document.querySelector('.ast-canvas');
      c.__ast3dDisposeInfo = null;
      const hook = c.__ast3d;
      await hook.worksRetireSettled();
      hook.worksHostElement.removeAttribute('hidden');
    });
    const remount2 = await waitMounted(page);
    if (!remount2) fail('hide#2 remount: worksProofMounted never became true');
    await page.waitForTimeout(400);

    tearingDownMount = await page.evaluate(async () => {
      const c = document.querySelector('.ast-canvas');
      c.__ast3dDisposeInfo = null;
      const hook = c.__ast3d;
      hook.disposeWorksProof();
      return hook.mountWorksProof();
    });
    if (!tearingDownMount || tearingDownMount.ok !== false || tearingDownMount.reason !== 'tearing-down') {
      fail(
        'tearing-down: mountWorksProof did not return { ok:false, reason:tearing-down } got '
        + JSON.stringify(tearingDownMount),
      );
    }
    disposePath = await waitDisposeInfo(page);
    assertDisposeSnapshot(disposePath, before, 'disposePath');
  }

  const receiptPath = join(EVIDENCE_DIR, 'renderer_info.json');
  let prior = null;
  if (NEGATIVE_ONLY && existsSync(receiptPath)) {
    try { prior = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch (_) { prior = null; }
  }

  const receipt = {
    unit: 'PQ-131.00',
    viewport: VIEWPORT,
    negativeOnly: NEGATIVE_ONLY,
    cell: parked,
    mount: {
      ok: mounted.ok,
      id: mounted.id,
      stats: mounted.stats,
      hooks: mounted.hooks,
      colourSpace: mounted.colourSpace,
      transform: mounted.transform || null,
      nativeBounds: mounted.transform ? mounted.transform.native : null,
      nodeLod: mounted.nodeLod || (workLod && workLod.nodeLod) || null,
    },
    afterLoadStats: afterLoad ? afterLoad.stats : ((prior && prior.afterLoadStats) || mounted.stats || null),
    afterLoadRegister: afterLoad ? afterLoad.register : ((prior && prior.afterLoadRegister) || 'work'),
    lod: {
      work: workLod,
      site: siteLod || (prior && prior.lod && prior.lod.site) || null,
    },
    untaggedMeshes: untagged,
    pixels: {
      box: workCompare && workCompare.box,
      mounted: workCompare && workCompare.mounted && workCompare.mounted.pixels,
      unmounted: workCompare && workCompare.unmounted && workCompare.unmounted.pixels,
      delta: workCompare && workCompare.delta,
    },
    scenePass: {
      mounted: workCompare && workCompare.mounted && workCompare.mounted.scenePass,
      unmounted: workCompare && workCompare.unmounted && workCompare.unmounted.scenePass,
    },
    mask: workCompare && workCompare.mask,
    shadowsSuppressed: !!(workCompare && workCompare.shadowsSuppressed),
    masked: {
      real: workCompare && workCompare.masked,
      black: negative.black && negative.black.masked,
      flat: negative.flat && negative.flat.masked,
      ghost: negative.ghost && negative.ghost.masked,
    },
    gate: {
      real: attachFloors(workGate),
      black: attachFloors(negative.blackGate),
      flat: attachFloors(negative.flatGate),
      ghost: attachFloors(negative.ghostGate),
      restored: attachFloors(negative.restoredGate),
    },
    negativeCaught: {
      black: negative.blackFailed,
      flat: negative.flatFailed,
      ghost: negative.ghostFailed,
    },
    normalSession,
    tearingDownMount,
    presentation: {
      baseline: presentationBaseline,
      beforeProbe: presentationBeforeProbe,
      afterProbe: presentationAfterProbe,
    },
    before,
    afterLoad: afterLoad ? afterLoad.info : (prior && prior.afterLoad) || null,
    hide1: hide1 || (prior && prior.hide1) || null,
    hide2: hide2 || (prior && prior.hide2) || null,
    disposePath: disposePath || (prior && prior.disposePath) || null,
    afterDispose: disposePath || hide1 || (prior && prior.afterDispose) || null,
    deltas: {
      load: afterLoad ? {
        geometries: afterLoad.info.memory.geometries - before.memory.geometries,
        textures: afterLoad.info.memory.textures - before.memory.textures,
        programs: afterLoad.info.programs - before.programs,
      } : ((prior && prior.deltas && prior.deltas.load) || null),
      hide1: hide1 ? memoryDelta(hide1, before) : ((prior && prior.deltas && prior.deltas.hide1) || null),
      hide2: hide2 ? memoryDelta(hide2, before) : ((prior && prior.deltas && prior.deltas.hide2) || null),
      disposePath: disposePath ? memoryDelta(disposePath, before) : ((prior && prior.deltas && prior.deltas.disposePath) || null),
    },
    pngs: sitePng ? [workPng, sitePng] : ((prior && prior.pngs) || [workPng]),
    failures: failures.slice(),
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  copySnap(workPng);
  if (sitePng) copySnap(sitePng);
  console.log('PQ-131.00 renderer.info before', JSON.stringify(before));
  console.log('PQ-131.00 renderer.info after-load', JSON.stringify(afterLoad && afterLoad.info));
  console.log('PQ-131.00 hide1', JSON.stringify(hide1));
  console.log('PQ-131.00 hide2', JSON.stringify(hide2));
  console.log('PQ-131.00 disposePath', JSON.stringify(disposePath));
  console.log('PQ-131.00 normalSession', JSON.stringify(normalSession));
  console.log('PQ-131.00 tearingDownMount', JSON.stringify(tearingDownMount));
  console.log('PQ-131.00 shadowsSuppressed', JSON.stringify(!!(workCompare && workCompare.shadowsSuppressed)));
  console.log('PQ-131.00 stats', JSON.stringify(mounted.stats));
  console.log('PQ-131.00 transform', JSON.stringify(mounted.transform || null));
  console.log('PQ-131.00 colourSpace sample', JSON.stringify((mounted.colourSpace || []).slice(0, 3)));
  console.log('PQ-131.00 projected box', JSON.stringify(workCompare && workCompare.box));
  console.log('PQ-131.00 mask', JSON.stringify(workCompare && workCompare.mask));
  console.log('PQ-131.00 masked real', JSON.stringify(workCompare && workCompare.masked));
  console.log('PQ-131.00 masked black', JSON.stringify(negative.black && negative.black.masked));
  console.log('PQ-131.00 masked flat', JSON.stringify(negative.flat && negative.flat.masked));
  console.log('PQ-131.00 masked ghost', JSON.stringify(negative.ghost && negative.ghost.masked));
  console.log('PQ-131.00 gate real', JSON.stringify(attachFloors(workGate)));
  console.log('PQ-131.00 gate black', JSON.stringify(attachFloors(negative.blackGate)));
  console.log('PQ-131.00 gate flat', JSON.stringify(attachFloors(negative.flatGate)));
  console.log('PQ-131.00 gate ghost', JSON.stringify(attachFloors(negative.ghostGate)));
  console.log('PQ-131.00 negative caught', JSON.stringify({
    black: negative.blackFailed,
    flat: negative.flatFailed,
    ghost: negative.ghostFailed,
  }));
  console.log('PQ-131.00 presentation', JSON.stringify(receipt.presentation));
  console.log('PQ-131.00 scene-pass mounted', JSON.stringify(workCompare && workCompare.mounted && workCompare.mounted.scenePass));
  console.log('PQ-131.00 scene-pass unmounted', JSON.stringify(workCompare && workCompare.unmounted && workCompare.unmounted.scenePass));
  console.log('PQ-131.00 lod work', JSON.stringify(workLod));
  console.log('PQ-131.00 lod site', JSON.stringify(siteLod));
  console.log('PQ-131.00 captures written to', OUT_DIR, 'and', EVIDENCE_DIR);

  const errors = pageErrors(issues);
  if (errors.length) fail('page errors: ' + errors.map((e) => e.text || e).join(' | '));
} catch (err) {
  fail(err && err.message ? err.message : String(err));
  try {
    const errors = pageErrors(issues);
    if (errors.length) fail('page errors: ' + errors.map((e) => e.text || e).join(' | '));
  } catch (_) {}
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.kill) await server.kill().catch(() => {});
}

if (failures.length) {
  console.error('capture-works-release-part FAIL:\n' + failures.join('\n'));
  process.exitCode = 1;
}

function memoryDelta(snap, before) {
  return {
    geometries: snap.memory.geometries - before.memory.geometries,
    textures: snap.memory.textures - before.memory.textures,
    programs: snap.programs - before.programs,
    rendererLive: snap.rendererLive,
  };
}

function evaluateMasked(compare) {
  const mask = compare && compare.mask;
  const masked = compare && compare.masked;
  const stats = masked && masked.stats;
  const delta = masked && masked.delta;
  const boxPixels = (mask && mask.width && mask.height) ? (mask.width * mask.height) : 0;
  const areaFloor = Math.max(MIN_MASK_COUNT, MIN_MASK_AREA_FRAC * boxPixels);
  const mounted = compare && compare.mounted && compare.mounted.scenePass;
  const unmounted = compare && compare.unmounted && compare.unmounted.scenePass;
  const triRise = (mounted && unmounted) ? (mounted.triangles - unmounted.triangles) : 0;
  return {
    MASK_AREA: {
      value: stats ? stats.count : 0,
      floor: areaFloor,
      pass: !!(stats && stats.count >= areaFloor),
    },
    MASK_LIT: {
      value: stats ? stats.medianLuma : 0,
      floor: MIN_MASK_MEDIAN_LUMA,
      pass: !!(stats && stats.medianLuma >= MIN_MASK_MEDIAN_LUMA),
    },
    MASK_VARIETY: {
      value: stats ? stats.stdevLuma : 0,
      floor: MIN_MASK_STDEV_LUMA,
      pass: !!(stats && stats.stdevLuma >= MIN_MASK_STDEV_LUMA),
    },
    MASK_CHANGED: {
      value: delta ? delta.changedFrac : 0,
      floor: MIN_MASK_CHANGED_FRAC,
      pass: !!(delta && delta.changedFrac >= MIN_MASK_CHANGED_FRAC),
    },
    TRI_DELTA: {
      value: triRise,
      floor: MIN_TRI_DELTA,
      pass: triRise >= MIN_TRI_DELTA,
    },
  };
}

function attachFloors(gate) {
  if (!gate) return null;
  const out = {};
  const ids = Object.keys(gate).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const row = gate[id];
    out[id] = { value: row.value, floor: row.floor, pass: row.pass };
  }
  return out;
}

function failedRuleIds(gate) {
  if (!gate) return [];
  const ids = Object.keys(gate).sort();
  const failed = [];
  for (let i = 0; i < ids.length; i++) {
    if (!gate[ids[i]].pass) failed.push(ids[i]);
  }
  return failed;
}

function assertMasked(compare, label) {
  assertPlacement(compare && compare.box, label);
  const gate = evaluateMasked(compare);
  const ids = Object.keys(gate).sort();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const row = gate[id];
    if (!row.pass) {
      fail(
        `${label}: ${id} ${row.value} below floor ${row.floor}`,
      );
    }
  }
  return gate;
}

function assertNegativeFails(compare, label, mode, requiredId) {
  const gate = evaluateMasked(compare);
  const failed = failedRuleIds(gate);
  if (!failed.length) {
    fail(`${label}: ${mode} control passed the masked gate`);
  }
  if (requiredId && (!gate[requiredId] || gate[requiredId].pass)) {
    fail(
      `${label}: ${mode} control must trip ${requiredId} `
      + `(value=${gate[requiredId] && gate[requiredId].value} floor=${gate[requiredId] && gate[requiredId].floor} failed=[${failed.join(',')}])`,
    );
  }
  return { gate, failed };
}

async function runNegativeControls(page, label) {
  let black = null;
  let blackResult = { gate: null, failed: [] };
  let flat = null;
  let flatResult = { gate: null, failed: [] };
  let ghost = null;
  let ghostResult = { gate: null, failed: [] };
  try {
    black = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      hook.worksProofNegativeControl('black');
      return hook.compareWorksProof();
    });
    blackResult = assertNegativeFails(black, label, 'black', 'MASK_LIT');

    flat = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      hook.worksProofNegativeControl('flat');
      return hook.compareWorksProof();
    });
    flatResult = assertNegativeFails(flat, label, 'flat', 'MASK_VARIETY');

    ghost = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      hook.worksProofNegativeControl('ghost');
      return hook.compareWorksProof();
    });
    ghostResult = assertNegativeFails(ghost, label, 'ghost');
  } finally {
    await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas') && document.querySelector('.ast-canvas').__ast3d;
      if (hook && typeof hook.worksProofNegativeControl === 'function') {
        hook.worksProofNegativeControl('off');
      }
    }).catch(() => {});
  }

  const restored = await page.evaluate(() => {
    const hook = document.querySelector('.ast-canvas').__ast3d;
    return hook.compareWorksProof();
  });
  const restoredGate = assertMasked(restored, `${label} restored`);
  return {
    black,
    blackGate: blackResult.gate,
    blackFailed: blackResult.failed,
    flat,
    flatGate: flatResult.gate,
    flatFailed: flatResult.failed,
    ghost,
    ghostGate: ghostResult.gate,
    ghostFailed: ghostResult.failed,
    restored,
    restoredGate,
  };
}

function assertPlacement(box, label) {
  if (!box) {
    fail(`${label}: no projected screen box`);
    return;
  }
  if (!box.onScreen) fail(`${label}: projected box is off-screen ${JSON.stringify(box)}`);
  if (box.width < MIN_BOX_PX || box.height < MIN_BOX_PX) {
    fail(`${label}: projected box is trivial (${box.width.toFixed(1)}x${box.height.toFixed(1)} css px, floor ${MIN_BOX_PX})`);
  }
  if (box.visW < MIN_BOX_PX || box.visH < MIN_BOX_PX) {
    fail(`${label}: on-screen box is trivial (${box.visW.toFixed(1)}x${box.visH.toFixed(1)} css px)`);
  }
}

function assertLodSet(names, prefix, label) {
  if (!names.length) {
    fail(`${label}: visible LOD-tagged set is empty (expected ${prefix}*)`);
    return;
  }
  if (!lodPrefixOk(names, prefix)) {
    fail(`${label}: visible LOD-tagged names must all start with ${prefix}: ${JSON.stringify(names)}`);
  }
}

function assertDisposeSnapshot(snap, before, label) {
  if (!snap) {
    fail(`${label}: __ast3dDisposeInfo was null`);
    return;
  }
  if (!snap.rendererLive) fail(`${label}: rendererLive !== true`);
  if (!snap.memory) {
    fail(`${label}: snapshot has no memory block`);
    return;
  }
  const geoLeak = snap.memory.geometries > before.memory.geometries;
  const texLeak = snap.memory.textures > before.memory.textures;
  if (geoLeak || texLeak) {
    fail(
      `${label}: leak geometries ${before.memory.geometries} -> ${snap.memory.geometries}, `
      + `textures ${before.memory.textures} -> ${snap.memory.textures}`,
    );
  }
}

async function waitRendererSettled(page) {
  let last = null;
  for (let i = 0; i < 24; i++) {
    const info = await page.evaluate(() => {
      const hook = document.querySelector('.ast-canvas').__ast3d;
      return hook ? hook.rendererInfo() : null;
    });
    if (!info) {
      await page.waitForTimeout(250);
      continue;
    }
    if (
      last
      && last.memory.geometries === info.memory.geometries
      && last.memory.textures === info.memory.textures
    ) {
      return info;
    }
    last = info;
    await page.waitForTimeout(250);
  }
  return last;
}

async function waitMounted(page, timeout = 20000) {
  return page.waitForFunction(() => {
    const c = document.querySelector('.ast-canvas');
    const hook = c && c.__ast3d;
    return !!(hook && hook.worksProofMounted);
  }, null, { timeout }).then((h) => h.jsonValue()).catch(() => false);
}

async function waitDisposeInfo(page, timeout = 15000) {
  return page.waitForFunction(() => {
    const c = document.querySelector('.ast-canvas');
    return !!(c && c.__ast3dDisposeInfo);
  }, null, { timeout }).then(() => page.evaluate(() => {
    const c = document.querySelector('.ast-canvas');
    return c && c.__ast3dDisposeInfo;
  })).catch(() => null);
}

function copySnap(name) {
  const src = snapPath(name);
  const dest = join(EVIDENCE_DIR, name);
  if (!existsSync(src)) throw new Error('missing capture png ' + src);
  try {
    copyFileSync(src, dest);
  } catch {
    writeFileSync(dest, readFileSync(src));
  }
}

function pageErrors(collector) {
  if (!collector) return [];
  return collector.errorIssues().filter((issue) => {
    const text = String(issue.text || '');
    return !/__spaceface_player_store/.test(text);
  });
}

function findSystemBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find((candidate) => existsSync(candidate)) || null;
}

async function startFreshServer() {
  const port = await findFreePort(8230);
  const gameServer = createGameServer({ root: ROOT, async: true });
  await new Promise((resolve, reject) => {
    gameServer.once('error', reject);
    gameServer.once('listening', () => resolve());
    gameServer.listen(port, '127.0.0.1');
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    kill: () => new Promise((resolve, reject) => {
      if (!gameServer.listening) { resolve(); return; }
      gameServer.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port found for works release-part capture');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
