#!/usr/bin/env node
// Public-route/default-camera visual proof for small interactive entity families that must never
// disappear behind the fail-hidden unknown-type policy. Fixtures are injected only after a public
// new-game launch; the surrounding world, camera, renderer, and visual factory remain production.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'runtime-visual-coverage');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

assert.ok(browserPath, 'Chrome or Edge is required');
await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready'
      && String(player?.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: 120_000 });

  const ids = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const mine = window.SF.helpers.spawnEntity({
      type: 'mine',
      pos: { x: player.pos.x - 18, z: player.pos.z + 6 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 8,
      hull: 30,
      hullMax: 30,
      collides: false,
      flags: { noInterp: true },
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'mine', mine: true, armed: false, armedAt: state.simTime + 3600,
        triggerRadius: 0, ownerId: player.id,
      },
    });
    const charge = window.SF.helpers.spawnEntity({
      type: 'charge',
      pos: { x: player.pos.x - 24, z: player.pos.z + 16 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 1.2,
      mass: 0.5,
      collides: false,
      flags: { noInterp: true },
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: player.id,
        hostId: null, localOffset: null, localRot: null, armed: false,
        spawnedAt: state.simTime,
      },
    });
    window.__SF_RUNTIME_VISUAL_FIXTURES__ = { mine: mine.id, charge: charge.id };
    return { ...window.__SF_RUNTIME_VISUAL_FIXTURES__ };
  });

  await page.waitForFunction((entityIds) => Object.values(entityIds).every((id) => {
    const entity = window.SF.state.entities.get(id);
    return entity?.mesh && entity.mesh.visible !== false && !entity.mesh.userData?.visualBuildFailed;
  }), ids, { timeout: 30_000 });

  const captures = [];
  for (const scenario of [
    { key: 'mine', state: 'unarmed', file: 'mine-unarmed-default-camera.png', tx: -18, tz: 6, armed: false, minPixels: 18 },
    { key: 'mine', state: 'armed', file: 'mine-armed-default-camera.png', tx: -18, tz: 6, armed: true, minPixels: 18 },
    { key: 'charge', state: 'unarmed', file: 'impulse-charge-unarmed-default-camera.png', tx: -24, tz: 16, armed: false, minPixels: 3 },
    { key: 'charge', state: 'armed', file: 'impulse-charge-armed-default-camera.png', tx: -24, tz: 16, armed: true, minPixels: 3 },
  ]) {
    const receipt = await page.evaluate(async ({ id, framing }) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(id);
      const x = player.pos.x + framing.tx;
      const z = player.pos.z + framing.tz;
      if (target.pos?.set) target.pos.set(x, 0, z);
      else { target.pos.x = x; target.pos.z = z; }
      target.prevPos?.copy?.(target.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      target.flags = { ...(target.flags || {}), noInterp: true };
      target.data.armed = framing.armed;
      if (target.type === 'mine') {
        target.data.armedAt = framing.armed ? state.simTime : state.simTime + 3600;
        target.data.triggerRadius = 0;
      }
      for (const fixtureId of Object.values(window.__SF_RUNTIME_VISUAL_FIXTURES__ || {})) {
        const fixture = state.entities.get(fixtureId);
        if (fixture?.mesh) fixture.mesh.visible = fixture.id === target.id;
      }
      // Use the shipped default gameplay camera, not the minimum zoom clamp.
      state.camera.zoom = 72;
      window.SF.bus.emit('camera:zoom', { level: 72 });
      state.render?.cameraCtrl?.snapToPlayer?.();
      // Keep the object itself unobstructed. The targeting circle is deliberately omitted because
      // it is larger than a physically scaled charge and would otherwise become the screenshot's
      // primary shape instead of the authored mesh.
      state.player.targetId = null;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const meshNames = [];
      const materialNames = [];
      const camera = state.render.camera;
      target.mesh.updateWorldMatrix?.(true, true);
      const world = target.mesh.getWorldPosition(target.mesh.position.clone());
      const ndc = world.clone().project(camera);
      const viewportWidth = state.render.renderer?.domElement?.clientWidth || innerWidth;
      const viewportHeight = state.render.renderer?.domElement?.clientHeight || innerHeight;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      target.mesh.traverse((object) => {
        if (!object.isMesh) return;
        meshNames.push(object.name || '(unnamed)');
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material) materialNames.push(material.name || material.type);
        const geometry = object.geometry;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox?.();
        const box = geometry.boundingBox;
        if (!box) return;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              const point = box.min.clone().set(x, y, z);
              object.localToWorld(point);
              point.project(camera);
              if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
              const sx = (point.x * 0.5 + 0.5) * viewportWidth;
              const sy = (-point.y * 0.5 + 0.5) * viewportHeight;
              minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
              minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
            }
          }
        }
      });
      return {
        id: target.id,
        type: target.type,
        effectivelyVisible: target.mesh.visible !== false,
        interactionKind: target.mesh.userData?.interactionKind || null,
        visualLanguage: target.mesh.userData?.visualLanguage || null,
        visualBuildFailed: target.mesh.userData?.visualBuildFailed === true,
        requestedArmed: framing.armed,
        visualArmed: target.mesh.userData?.visualArmed === true,
        cameraZoom: state.camera.zoom,
        screen: {
          x: (ndc.x * 0.5 + 0.5) * viewportWidth,
          y: (-ndc.y * 0.5 + 0.5) * viewportHeight,
          ndcZ: ndc.z,
        },
        pixelBounds: {
          minX, minY, maxX, maxY,
          width: Number.isFinite(minX) ? maxX - minX : 0,
          height: Number.isFinite(minY) ? maxY - minY : 0,
        },
        meshNames,
        materialNames: [...new Set(materialNames)],
      };
    }, { id: ids[scenario.key], framing: scenario });
    const file = path.join(OUT, scenario.file);
    const buffer = await page.screenshot({ path: file, type: 'png' });
    captures.push({
      scenario: `${scenario.key}-${scenario.state}`,
      path: path.relative(ROOT, file).replaceAll('\\', '/'),
      sha256: sha256(buffer),
      receipt,
    });
  }

  const stateAndPixelAcceptance = captures.map((capture, index) => (
    capture.receipt.visualArmed === capture.receipt.requestedArmed
    && Math.max(capture.receipt.pixelBounds.width, capture.receipt.pixelBounds.height) >= [18, 18, 3, 3][index]
  ));
  const report = {
    schema: 'spaceface.runtimeVisualCoverage.v1',
    route: server.baseUrl,
    cameraPolicy: 'shipped-default-zoom-72-with-surrounding-world-visible',
    captures,
    pageErrors,
    stateAndPixelAcceptance,
    ok: pageErrors.length === 0 && stateAndPixelAcceptance.every(Boolean),
  };
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join('\n')}`);
  assert.equal(captures[0].receipt.interactionKind, 'combat-mine');
  assert.equal(captures[2].receipt.interactionKind, 'impulse-charge');
  assert.ok(captures.every((capture) => capture.receipt.effectivelyVisible && !capture.receipt.visualBuildFailed));
  assert.ok(captures.every((capture) => capture.receipt.cameraZoom === 72), 'captures must use the shipped default zoom');
  assert.ok(stateAndPixelAcceptance.every(Boolean), 'fixtures must show truthful arming state and occupy measurable pixels at default zoom');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
