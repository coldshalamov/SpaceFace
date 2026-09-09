#!/usr/bin/env node
// PQ-019A presentation COUNTS — the functional half of the headed presentation row.
//
// Sibling of scripts/capture-pq019a-acceptance.mjs, which is deliberately left untouched: that
// script owns the stills and states in its own header that it measures nothing. This one collects
// the functional counts the H1 batch asks for, on the same ordinary New Game route, at the same
// subjects.
//
// WHAT THIS RECORDS — counts, states and booleans only:
//   * draw calls, triangles, lines and points for ONE frame at each framing (renderer.info.render,
//     reset immediately before a single forced render so the numbers describe exactly that frame);
//   * compiled program count and geometry/texture residency counts (renderer.info.programs/memory);
//   * GPU admission state per subject (presentationAdmission) and authored asset state;
//   * residency shape: whether the subject presents through static batches or pooled instances.
//
// WHAT THIS DOES NOT RECORD — and must never be made to record: frame times, p95/p99, hitch counts,
// or any millisecond-valued field. Matched performance is Phase H3 on a quiet machine. H1 runs
// contended by design, so a timing sampled here would be noise wearing a number's clothes. There is
// deliberately no clock read anywhere in this file.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.resolve(ROOT, process.env.SF_PQ019A_COUNTS_DIR
  || 'design/program/roadmap/evidence/h1/row3-pq019a-presentation');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const SECTOR_ID = 'sector_tethys_junction';
const SCHEDULE_ID = 'pq019a-counts-route';
const ADMISSION_TIMEOUT_MS = Math.max(5_000, Number(process.env.SPACEFACE_ADMISSION_TIMEOUT_MS) || 120_000);

// Same framing triple as the stills route, expressed against each subject's own radius.
const FRAMINGS = Object.freeze([
  Object.freeze({ name: 'close', zoomRadii: 3.0, offsetRadii: 1.3 }),
  Object.freeze({ name: 'default', zoomRadii: 5.5, offsetRadii: 2.0 }),
  Object.freeze({ name: 'far', zoomRadii: 11.0, offsetRadii: 3.2 }),
]);
const CAMERA_ZOOM_MAX = 330; // src/render/camera.js

const FACILITIES = Object.freeze([
  Object.freeze({ id: 'heist_launcher', role: 'heist_launcher_visual', label: 'Tethys Surface Launcher' }),
  Object.freeze({ id: 'lawful_catcher', role: 'lawful_catcher_visual', label: 'Concord Lawful Catcher' }),
  Object.freeze({ id: 'fence_receiver', role: 'fence_receiver_visual', label: 'Quiet Fence Receiver' }),
]);

function systemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || null;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function findEntity(page, role) {
  return page.waitForFunction((wanted) => {
    const entity = window.SF.state.entityList.find((candidate) => (
      candidate?.alive !== false && candidate.data?.heistFacilityRole === wanted
    ));
    return entity ? entity.id : null;
  }, role, { timeout: 60_000 }).then((handle) => handle.jsonValue());
}

async function waitForAdmission(page, targetId) {
  await page.waitForFunction((id) => {
    const entity = window.SF.state.entities.get(id);
    if (!entity || entity.presentationAdmission !== 'ready') return false;
    return String(entity.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, targetId, { timeout: ADMISSION_TIMEOUT_MS });
}

// Park the player so the subject is in frame at `framing`, then reset renderer.info, render exactly
// one frame, and read the counts back. The reset+single-render pairing is what makes the draw call
// number describe this frame rather than an arbitrary accumulation.
async function sampleAtFraming(page, targetId, framing) {
  return page.evaluate(async ({ targetId, framing, zoomMax }) => {
    const state = window.SF.state;
    const subject = state.entities.get(targetId);
    const player = state.entities.get(state.playerId);
    if (!subject || !player) return { error: 'missing-subject-or-player' };

    const radius = Math.max(4, Number(subject.radius) || 0);
    const offset = radius * framing.offsetRadii;
    const x = subject.pos.x + offset;
    const z = subject.pos.z + offset;
    if (player.pos.set) player.pos.set(x, 0, z); else Object.assign(player.pos, { x, z });
    player.prevPos?.copy?.(player.pos);
    player.vel?.set?.(0, 0, 0);
    state.render?.cameraCtrl?.snapToPlayer?.();
    const zoom = Math.min(zoomMax, Math.max(24, radius * framing.zoomRadii));
    state.camera && (state.camera.zoom = zoom);
    window.SF.bus.emit('camera:zoom', { zoom });

    const render = state.render;
    const renderer = render?.renderer;
    const scene = render?.scene;
    const camera = render?.camera;
    if (!renderer || !scene || !camera) return { error: 'renderer-unavailable' };

    // One frame, cleanly attributed.
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.render(scene, camera);

    const info = renderer.info;
    const root = subject.mesh || subject.view?.root || null;
    let visibleMeshes = 0;
    let staticBatchSurfaces = 0;
    let instanceProxySurfaces = 0;
    let subjectTriangles = 0;
    if (root) {
      root.traverse((object) => {
        if (!object?.isMesh) return;
        let visible = true;
        for (let cursor = object; cursor; cursor = cursor.parent) {
          if (cursor.visible === false) { visible = false; break; }
          if (cursor === root) break;
        }
        if (!visible) return;
        visibleMeshes++;
        if (object.userData?.spacefaceStaticBatch) staticBatchSurfaces++;
        if (object.userData?.spacefaceInstanceProxy) instanceProxySurfaces++;
        const geometry = object.geometry;
        const index = geometry?.getIndex?.() ?? geometry?.index;
        if (index && Number.isFinite(index.count)) subjectTriangles += Math.floor(index.count / 3);
        else {
          const position = geometry?.getAttribute?.('position');
          if (position && Number.isFinite(position.count)) subjectTriangles += Math.floor(position.count / 3);
        }
      });
    }

    let scenePools = 0;
    let sceneStaticBatches = 0;
    scene.traverse((object) => {
      if (object?.isInstancedMesh && object.userData?.spacefaceInstancePool) scenePools++;
      else if (object?.isMesh && object.userData?.spacefaceStaticBatch) sceneStaticBatches++;
    });

    return {
      framing: framing.name,
      zoom,
      subjectRadius: Number(subject.radius) || 0,
      // ── the frame's own counts ──
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      programCount: Array.isArray(info.programs) ? info.programs.length : null,
      residentGeometries: info.memory.geometries,
      residentTextures: info.memory.textures,
      // ── admission / residency for this subject ──
      presentationAdmission: subject.presentationAdmission ?? null,
      authoredAssetState: root?.userData?.authoredAssetState ?? null,
      authoredCompositionId: root?.userData?.authoredCompositionId ?? null,
      visibleMeshes,
      subjectTriangles,
      staticBatchSurfaces,
      instanceProxySurfaces,
      sceneStaticBatches,
      scenePools,
    };
  }, { targetId, framing, zoomMax: CAMERA_ZOOM_MAX });
}

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: 'png' });
  const info = await stat(file);
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative(file)} must be a real PNG`);
  return { file: relative(file), bytes: info.size, sha256: createHash('sha256').update(bytes).digest('hex') };
}

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ explicitUrl: process.env.SPACEFACE_CAPTURE_URL || null, root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: systemBrowser(),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

const samples = [];
let gpu = null;

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry), null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    return state.entities.get(state.playerId)?.presentationAdmission === 'ready';
  }, null, { timeout: ADMISSION_TIMEOUT_MS });

  gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    };
  });

  await page.evaluate((sectorId) => {
    window.SF.registry.get('world').enterSector(sectorId);
  }, SECTOR_ID);

  for (const facility of FACILITIES) {
    const subjectId = await findEntity(page, facility.role);
    // Fly there first, THEN wait for the authored asset to decode — the prefetch runway only
    // admits what is near the player.
    await sampleAtFraming(page, subjectId, FRAMINGS[1]);
    await waitForAdmission(page, subjectId);
    for (const framing of FRAMINGS) {
      const sample = await sampleAtFraming(page, subjectId, framing);
      assert.ok(!sample.error, `${facility.id}/${framing.name}: ${sample.error}`);
      assert.equal(sample.presentationAdmission, 'ready', `${facility.id} must be admitted at ${framing.name}`);
      assert.ok(sample.visibleMeshes > 0, `${facility.id} must present visible geometry at ${framing.name}`);
      assert.ok(sample.drawCalls > 0, `${facility.id} must issue draw calls at ${framing.name}`);
      const shot = await screenshot(page, `${facility.id}-${framing.name}.png`);
      samples.push({ subject: facility.id, label: facility.label, ...sample, ...shot });
    }
  }

  // ── the physical capsule, on a real scheduled launch ────────────────────────────────────────
  let capsuleError = null;
  try {
    await page.evaluate(({ scheduleId }) => {
      const state = window.SF.state;
      const launcher = state.entityList.find((e) => e.data?.heistFacilityRole === 'heist_launcher_head');
      const catcher = state.entityList.find((e) => e.data?.heistFacilityRole === 'lawful_catcher_head');
      const player = state.entities.get(state.playerId);
      const x = launcher.pos.x + (catcher.pos.x - launcher.pos.x) * 0.6;
      const z = launcher.pos.z + (catcher.pos.z - launcher.pos.z) * 0.6;
      if (player.pos.set) player.pos.set(x, 0, z); else Object.assign(player.pos, { x, z });
      player.prevPos?.copy?.(player.pos);
      player.vel?.set?.(0, 0, 0);
      state.render?.cameraCtrl?.snapToPlayer?.();
      window.SF.bus.emit('heist:requestLaunchSchedule', { scheduleId, launchAtSimT: state.simTime + 31 });
    }, { scheduleId: SCHEDULE_ID });

    const capsuleId = await page.waitForFunction(() => {
      const capsule = window.SF.state.entityList.find((e) => (
        e?.alive !== false && e.data?.heistFacilityRole === 'cargo_capsule'
      ));
      return capsule ? capsule.id : null;
    }, null, { timeout: 120_000 }).then((handle) => handle.jsonValue());

    for (const framing of FRAMINGS) {
      const sample = await sampleAtFraming(page, capsuleId, framing);
      if (sample.error) { capsuleError = sample.error; break; }
      const shot = await screenshot(page, `heist_capsule-${framing.name}.png`);
      samples.push({ subject: 'heist_capsule', label: 'Cargo capsule (in flight)', ...sample, ...shot });
    }
  } catch (error) {
    capsuleError = String(error?.message || error);
  }

  const report = {
    informational_contended: true,
    informational_contended_note:
      'Phase H1 ran contended by design. This file deliberately contains NO timing field of any kind — '
      + 'draw calls, triangles, program counts and residency counts are per-frame COUNTS, not measurements '
      + 'of speed. Matched performance is Phase H3.',
    row: 'H1 row 3 — PQ-019A presentation counts',
    route: `New Game -> ${SECTOR_ID}`,
    seedControl: 'none — ordinary New Game UI route; this capture does not claim deterministic scene layout',
    viewport: VIEWPORT,
    gpu,
    capsuleError,
    pageErrors,
    samples,
  };
  await writeFile(path.join(OUT, 'presentation-counts.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('PQ-019A presentation counts PASS');
  console.log(JSON.stringify({ gpu, sampleCount: samples.length, capsuleError, pageErrors: pageErrors.length }, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close?.().catch?.(() => {});
}
