#!/usr/bin/env node
// Normal-route acceptance for the two authored geological landmarks. The fixtures use the
// production world-dressing entity contract; only their placement is controlled for matched
// close/default/far evidence and a bounded transform-stability probe.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'graphics', 'geology-landmark-live');
const ADMISSION_TIMEOUT_MS = Math.max(5_000, Number(process.env.SPACEFACE_ADMISSION_TIMEOUT_MS) || 120_000);

function systemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || null;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

await mkdir(OUT, { recursive: true });
const server = await acquireVisualProbeServer({
  explicitUrl: process.env.SPACEFACE_CAPTURE_URL || null,
  root: ROOT,
});
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: systemBrowser(),
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
page.on('pageerror', (error) => errors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() === 'warning' || message.type() === 'error') {
    consoleMessages.push({ type: message.type(), text: message.text() });
  }
});

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state), null, { timeout: 45_000 });
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

  const fixtureIds = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const spawn = (placeId, name, x, z, radius, rot) => window.SF.helpers.spawnEntity({
      type: 'fx',
      factionId: null,
      pos: { x, z },
      rot,
      radius,
      mass: 0,
      collides: false,
      ttl: Infinity,
      flags: { noInterp: true },
      data: {
        placeId,
        placeScale: 1,
        worldDressing: true,
        paletteClass: 'belt',
        sectorId: state.world.currentSectorId,
        homeSectorId: state.world.currentSectorId,
        name,
        visualRadius: radius,
        placeRadius: radius,
      },
    });
    const seamed = spawn(
      'place_asteroid_seamed',
      'Survey Seam Marker',
      player.pos.x + 34,
      player.pos.z + 12,
      18,
      3.49,
    );
    const graffiti = spawn(
      'place_asteroid_graffiti',
      'Prospector Graffiti Marker',
      player.pos.x - 34,
      player.pos.z + 12,
      16,
      2.59,
    );
    return { seamed: seamed.id, graffiti: graffiti.id };
  });

  try {
    await page.waitForFunction(({ seamed, graffiti }) => [seamed, graffiti].every((id) => {
      const entity = window.SF.state.entities.get(id);
      return entity?.presentationAdmission === 'ready'
        && entity?.mesh?.userData?.authoredAssetState === 'authored'
        && entity?.mesh?.userData?.authoredReadableFallbackRetained === false;
    }), fixtureIds, { timeout: ADMISSION_TIMEOUT_MS });
  } catch (error) {
    const admissionDiagnostics = await page.evaluate(async (ids) => {
      const { getAuthoredAssetDiagnostic } = await import('/src/render/assetLoader.js');
      const entries = await Promise.all(Object.entries(ids).map(async ([key, id]) => {
        const entity = window.SF.state.entities.get(id);
        const mesh = entity?.mesh;
        const placeId = entity?.data?.placeId || null;
        const diagnostic = placeId
          ? await getAuthoredAssetDiagnostic(
            window.SF.state.render.renderer,
            `assets/ships/release/parts/places/${placeId}.glb`,
            'place',
          )
          : null;
        return [key, {
          id,
          alive: entity?.alive ?? null,
          type: entity?.type || null,
          position: entity?.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
          presentationAdmission: entity?.presentationAdmission || null,
          hasMesh: !!mesh,
          meshName: mesh?.name || null,
          authoredAssetState: mesh?.userData?.authoredAssetState || null,
          authoredAssetMode: mesh?.userData?.authoredAssetMode || null,
          authoredReadableFallbackRetained: mesh?.userData?.authoredReadableFallbackRetained ?? null,
          hasUpgradeRequest: typeof mesh?.userData?.requestAuthoredUpgrade === 'function',
          visibleChildren: mesh?.children?.filter((child) => child.visible !== false).map((child) => child.name) || [],
          loaderDiagnostic: diagnostic ? {
            name: diagnostic.name || null,
            message: diagnostic.message || String(diagnostic),
            errors: diagnostic.errors || null,
            warnings: diagnostic.warnings || null,
          } : null,
        }];
      }));
      return Object.fromEntries(entries);
    }, fixtureIds);
    console.error('Geology authored-admission timeout diagnostics:');
    console.error(JSON.stringify(admissionDiagnostics, null, 2));
    console.error('Captured browser warnings/errors:');
    console.error(JSON.stringify(consoleMessages, null, 2));
    throw error;
  }

  const scenarios = [
    ['seamed-close', fixtureIds.seamed, { dx: 20, dz: 8, zoom: 48 }],
    ['seamed-default', fixtureIds.seamed, { dx: 38, dz: 14, zoom: 72 }],
    ['seamed-far', fixtureIds.seamed, { dx: 72, dz: 24, zoom: 140 }],
    ['graffiti-close', fixtureIds.graffiti, { dx: 20, dz: 8, zoom: 48 }],
    ['graffiti-default', fixtureIds.graffiti, { dx: 38, dz: 14, zoom: 72 }],
    ['graffiti-far', fixtureIds.graffiti, { dx: 72, dz: 24, zoom: 140 }],
  ];
  const captures = [];

  for (const [scenario, id, framing] of scenarios) {
    const receipt = await page.evaluate(async ({ id, framing }) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(id);
      if (!target?.pos || !target?.mesh) throw new Error(`missing geological landmark ${id}`);

      const x = target.pos.x - framing.dx;
      const z = target.pos.z - framing.dz;
      if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
      else { player.pos.x = x; player.pos.z = z; }
      player.prevPos?.copy?.(player.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      player.rot = 0;
      player.prevRot = 0;
      player.flags = { ...(player.flags || {}), noInterp: true };
      state.camera.zoom = framing.zoom;
      window.SF.bus.emit('camera:zoom', { level: framing.zoom });
      state.render?.cameraCtrl?.snapToPlayer?.();
      state.player.targetId = target.id;

      // Let the render loop apply the camera move and select the active runtime LOD before sampling
      // the receipt. Sampling immediately after the state mutation can describe the previous frame
      // even though the screenshot below contains the newly selected LOD.
      await new Promise((resolve) => setTimeout(resolve, 900));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const profiles = await import('/src/data/entityInteractionProfiles.js');
      const materials = [];
      const materialIds = new Set();
      const fallbackRenderables = [];
      const visibleMeshes = [];
      const effectivelyVisible = (object) => {
        let current = object;
        while (current) {
          if (current.visible === false) return false;
          if (current === target.mesh) break;
          current = current.parent;
        }
        return true;
      };
      target.mesh.traverse?.((object) => {
        const isRenderable = object.isMesh || object.isSprite || object.isPoints || object.isLine;
        if (!isRenderable || !effectivelyVisible(object)) return;
        if (/^SF_PlaceFallback_/.test(String(object.name || ''))) {
          fallbackRenderables.push(object.name);
        }
        const list = Array.isArray(object.material)
          ? object.material
          : (object.material ? [object.material] : []);
        const metadataLod = Number(object.userData?.['spaceface.lodLevel']);
        const nameLod = /^LOD(\d+)_/.exec(String(object.name || ''));
        visibleMeshes.push({
          name: object.name || '(unnamed)',
          lodLevel: Number.isFinite(metadataLod) ? metadataLod : (nameLod ? Number(nameLod[1]) : null),
          triangles: Math.floor((object.geometry?.index?.count
            ?? object.geometry?.getAttribute?.('position')?.count
            ?? 0) / 3),
          materials: list.filter(Boolean).map((material) => material.name || '(unnamed)'),
        });
        for (const material of list) {
          if (!material || materialIds.has(material.uuid)) continue;
          materialIds.add(material.uuid);
          materials.push({
            name: material.name || '(unnamed)',
            role: material.userData?.spacefaceMaterialRole || null,
            textureRole: material.userData?.['spaceface.textureRole'] || null,
            roughness: Number.isFinite(material.roughness) ? material.roughness : null,
            metalness: Number.isFinite(material.metalness) ? material.metalness : null,
            maps: {
              baseColor: !!material.map,
              normal: !!(material.normalMap || material.bumpMap),
              roughness: !!material.roughnessMap,
              metalness: !!material.metalnessMap,
              ao: !!material.aoMap,
              emissive: !!material.emissiveMap,
            },
          });
        }
      });
      const profile = profiles.interactionProfileForEntity(target);
      return {
        id: target.id,
        type: target.type,
        name: profiles.interactionDisplayName(target),
        profile,
        placeId: target.data?.placeId || null,
        worldDressing: target.data?.worldDressing === true,
        collides: target.collides === true,
        authoredState: target.mesh.userData?.authoredAssetState || null,
        authoredMode: target.mesh.userData?.authoredAssetMode || null,
        authoredVisualRoot: target.mesh.userData?.authoredVisualRoot || null,
        authoredCompositionId: target.mesh.userData?.authoredCompositionId || null,
        readableFallbackRetained: target.mesh.userData?.authoredReadableFallbackRetained ?? null,
        rootUuid: target.mesh.uuid,
        hullUuid: target.mesh.userData?.hull?.uuid || null,
        visualBounds: target.mesh.userData?.hull?.userData?.visualBounds
          || target.mesh.userData?.visualBounds
          || null,
        fallbackRenderables,
        visibleMeshes,
        visibleTriangles: visibleMeshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
        activeLods: [...new Set(visibleMeshes.map((mesh) => mesh.lodLevel).filter(Number.isFinite))].sort(),
        materials,
      };
    }, { id, framing });
    const file = path.join(OUT, `${scenario}.png`);
    const buffer = await page.screenshot({ path: file });
    captures.push({
      scenario,
      path: path.relative(ROOT, file).replaceAll('\\', '/'),
      sha256: sha256(buffer),
      framing,
      receipt,
    });
  }

  const stability = await page.evaluate(async (ids) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(ids.seamed);
    const companion = state.entities.get(ids.graffiti);
    const midpointX = (target.pos.x + companion.pos.x) * 0.5;
    const midpointZ = (target.pos.z + companion.pos.z) * 0.5;
    const playerX = midpointX - 44;
    const playerZ = midpointZ - 18;
    if (typeof player.pos.set === 'function') player.pos.set(playerX, 0, playerZ);
    else { player.pos.x = playerX; player.pos.z = playerZ; }
    player.prevPos?.copy?.(player.pos);
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    player.flags = { ...(player.flags || {}), noInterp: true };
    state.camera.zoom = 90;
    window.SF.bus.emit('camera:zoom', { level: 90 });
    state.render?.cameraCtrl?.snapToPlayer?.();
    state.player.targetId = null;

    await new Promise((resolve) => setTimeout(resolve, 800));
    const fixedCamera = state.render.camera;
    fixedCamera.updateWorldMatrix?.(true, false);
    const fixedViewProjection = fixedCamera.projectionMatrix.clone().multiply(fixedCamera.matrixWorldInverse.clone());
    return new Promise((resolve) => {
      const rows = [];
      let frame = 0;
      const sample = () => {
        const camera = state.render.camera;
        camera.updateWorldMatrix?.(true, false);
        const cameraWorld = camera.position.clone();
        camera.getWorldPosition?.(cameraWorld);
        const width = state.render.renderer?.domElement?.clientWidth || window.innerWidth || 1;
        const height = state.render.renderer?.domElement?.clientHeight || window.innerHeight || 1;
        const samples = {};
        for (const [key, id] of Object.entries(ids)) {
          const entity = state.entities.get(id);
          const root = entity.mesh;
          const hull = root.userData?.hull || root;
          root.updateWorldMatrix(true, true);
          hull.updateWorldMatrix?.(true, true);
          const world = root.position.clone();
          root.getWorldPosition(world);
          const hullWorld = hull.position.clone();
          hull.getWorldPosition?.(hullWorld);
          const projected = world.clone().project(camera);
          const fixedProjected = world.clone().applyMatrix4(fixedViewProjection);
          samples[key] = {
            rootUuid: root.uuid,
            hullUuid: root.userData?.hull?.uuid || null,
            authoredState: root.userData?.authoredAssetState || null,
            worldX: world.x,
            worldY: world.y,
            worldZ: world.z,
            hullWorldX: hullWorld.x,
            hullWorldY: hullWorld.y,
            hullWorldZ: hullWorld.z,
            screenX: (projected.x + 1) * 0.5 * width,
            screenY: (1 - projected.y) * 0.5 * height,
            fixedScreenX: (fixedProjected.x + 1) * 0.5 * width,
            fixedScreenY: (1 - fixedProjected.y) * 0.5 * height,
          };
        }
        rows.push({
          frame,
          camera: {
            uuid: camera.uuid,
            worldX: cameraWorld.x,
            worldY: cameraWorld.y,
            worldZ: cameraWorld.z,
            zoom: camera.zoom,
            matrixWorld: Array.from(camera.matrixWorld.elements),
          },
          samples,
        });
        frame += 1;
        if (frame < 240) requestAnimationFrame(sample);
        else resolve(rows);
      };
      requestAnimationFrame(sample);
    });
  }, fixtureIds);

  const summarizeStability = (key) => {
    let maxWorldStep = 0;
    let maxHullWorldStep = 0;
    let maxScreenStep = 0;
    let maxFixedCameraScreenStep = 0;
    let maxWorldStepFrame = null;
    let maxScreenStepFrame = null;
    let maxScreenStepDelta = null;
    const rootUuids = new Set();
    const hullUuids = new Set();
    const states = new Set();
    for (let index = 0; index < stability.length; index += 1) {
      const current = stability[index].samples[key];
      rootUuids.add(current.rootUuid);
      hullUuids.add(current.hullUuid);
      states.add(current.authoredState);
      if (index === 0) continue;
      const previous = stability[index - 1].samples[key];
      const worldStep = Math.hypot(
        current.worldX - previous.worldX,
        current.worldY - previous.worldY,
        current.worldZ - previous.worldZ,
      );
      const screenDelta = {
        x: current.screenX - previous.screenX,
        y: current.screenY - previous.screenY,
      };
      const screenStep = Math.hypot(
        current.screenX - previous.screenX,
        current.screenY - previous.screenY,
      );
      const hullWorldStep = Math.hypot(
        current.hullWorldX - previous.hullWorldX,
        current.hullWorldY - previous.hullWorldY,
        current.hullWorldZ - previous.hullWorldZ,
      );
      maxHullWorldStep = Math.max(maxHullWorldStep, hullWorldStep);
      maxFixedCameraScreenStep = Math.max(maxFixedCameraScreenStep, Math.hypot(
        current.fixedScreenX - previous.fixedScreenX,
        current.fixedScreenY - previous.fixedScreenY,
      ));
      if (worldStep > maxWorldStep) {
        maxWorldStep = worldStep;
        maxWorldStepFrame = index;
      }
      if (screenStep > maxScreenStep) {
        maxScreenStep = screenStep;
        maxScreenStepFrame = index;
        maxScreenStepDelta = screenDelta;
      }
    }
    return {
      frames: stability.length,
      maxWorldStep,
      maxHullWorldStep,
      maxScreenStep,
      maxFixedCameraScreenStep,
      maxWorldStepFrame,
      maxScreenStepFrame,
      maxScreenStepDelta,
      rootUuids: [...rootUuids],
      hullUuids: [...hullUuids],
      authoredStates: [...states],
    };
  };
  const stabilitySummary = {
    seamed: summarizeStability('seamed'),
    graffiti: summarizeStability('graffiti'),
  };
  console.log('Geology landmark stability diagnostics:');
  console.log(JSON.stringify({
    summary: stabilitySummary,
    cameraAtSeamedMax: stabilitySummary.seamed.maxScreenStepFrame == null
      ? null
      : {
        previous: stability[stabilitySummary.seamed.maxScreenStepFrame - 1]?.camera || null,
        current: stability[stabilitySummary.seamed.maxScreenStepFrame]?.camera || null,
      },
    cameraAtGraffitiMax: stabilitySummary.graffiti.maxScreenStepFrame == null
      ? null
      : {
        previous: stability[stabilitySummary.graffiti.maxScreenStepFrame - 1]?.camera || null,
        current: stability[stabilitySummary.graffiti.maxScreenStepFrame]?.camera || null,
      },
  }, null, 2));

  console.log('Geology landmark visible-LOD/material diagnostics:');
  console.log(JSON.stringify(captures.map(({ scenario, receipt }) => ({
    scenario,
    placeId: receipt.placeId,
    visibleTriangles: receipt.visibleTriangles,
    textureRoles: receipt.materials.map(({ textureRole }) => textureRole),
  })), null, 2));

  for (const capture of captures) {
    const { receipt } = capture;
    assert.equal(receipt.type, 'fx', `${capture.scenario}: production world-dressing type`);
    assert.equal(receipt.worldDressing, true, `${capture.scenario}: world-dressing identity`);
    assert.equal(receipt.collides, false, `${capture.scenario}: non-colliding landmark`);
    assert.equal(receipt.profile.kind, 'unknown', `${capture.scenario}: not advertised as a mineable asteroid`);
    assert.equal(receipt.profile.mineable, false, `${capture.scenario}: not mineable`);
    assert.equal(receipt.profile.drillable, false, `${capture.scenario}: not drillable`);
    assert.equal(receipt.profile.beamExtractable, false, `${capture.scenario}: not beam-extractable`);
    assert.equal(receipt.authoredState, 'authored', `${capture.scenario}: authored asset mounted`);
    assert.equal(receipt.authoredVisualRoot, 'authored-root', `${capture.scenario}: authored root active`);
    assert.equal(receipt.readableFallbackRetained, false, `${capture.scenario}: no retained placeholder`);
    assert.deepEqual(receipt.fallbackRenderables, [], `${capture.scenario}: no visible fallback renderables`);
    const expectedTriangles = receipt.placeId === 'place_asteroid_seamed' ? 8_340 : 9_876;
    assert.equal(receipt.visibleTriangles, expectedTriangles,
      `${capture.scenario}: one reviewed LOD0 geometry set is presented after runtime batching`);
    const expectedTextureRoles = receipt.placeId === 'place_asteroid_seamed'
      ? new Set(['seamed_fracture_dust', 'seamed_mineral_vein', 'seamed_regolith_matrix', 'seamed_strata_exposure', 'seamed_survey_alloy', 'seamed_survey_marking'])
      : new Set(['graffiti_fresh_break', 'graffiti_hardware_alloy', 'graffiti_paint_bone', 'graffiti_paint_red', 'graffiti_recess_dust', 'graffiti_regolith_matrix']);
    const actualTextureRoles = new Set(receipt.materials.map((material) => material.textureRole));
    assert.deepEqual(actualTextureRoles, expectedTextureRoles,
      `${capture.scenario}: reviewed visible material roles survive runtime batching`);
    const actualRoles = new Set(receipt.materials.map((material) => material.role));
    assert(actualRoles.has('geology'), `${capture.scenario}: explicit runtime geology role`);
    assert(actualRoles.has('mechanical'), `${capture.scenario}: explicit runtime intervention hardware role`);
    assert(actualRoles.has('warning'), `${capture.scenario}: non-emissive authored marking role`);
    assert(receipt.materials.every((material) => (
      material.maps.baseColor
      && material.maps.normal
      && material.maps.roughness
      && material.maps.metalness
      && material.maps.ao
    )), `${capture.scenario}: every semantic material carries complete PBR maps`);
  }
  for (const [key, result] of Object.entries(stabilitySummary)) {
    assert.equal(result.frames, 240, `${key}: full motion sample`);
    assert.deepEqual(result.authoredStates, ['authored'], `${key}: authored state stable`);
    assert.equal(result.rootUuids.length, 1, `${key}: boundary root does not swap`);
    assert.equal(result.hullUuids.length, 1, `${key}: authored hull does not swap`);
    assert(result.maxWorldStep < 0.001, `${key}: no world-space flicker/jig (${result.maxWorldStep})`);
    assert(result.maxHullWorldStep < 0.001, `${key}: authored hull remains fixed (${result.maxHullWorldStep})`);
    assert(result.maxFixedCameraScreenStep < 0.01,
      `${key}: no fixed-camera screen-space flicker/jig (${result.maxFixedCameraScreenStep})`);
  }
  assert.deepEqual(errors, [], 'normal route has no page errors');

  const report = {
    status: 'pass',
    baseUrl: server.baseUrl,
    fixtureIds,
    captures,
    stability: stabilitySummary,
    pageErrors: errors,
  };
  await writeFile(path.join(OUT, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Geology landmark live acceptance PASS — ${captures.length} captures, 240 stability frames each`);
  console.log(JSON.stringify(stabilitySummary, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
