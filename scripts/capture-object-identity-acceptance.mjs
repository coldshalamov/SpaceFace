#!/usr/bin/env node
// Public-launch capture of the exact live player/station/asteroid identities plus one diagnostic
// unstable-reactor wreck. Entity repositioning is an evaluation surface only; models, materials,
// target HUD, camera, lighting, post, and interaction classification are the normal game route.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { captureSpectorFrame, summarizeSpectorCapture } from './lib/spectorCapture.mjs';
import { verifyBoundSurfaceTextures } from './lib/surfaceTextureReceipt.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'object-identity');
const SURFACE_BUILD_RECEIPT_PATH = path.join(ROOT, 'assets', 'ships', 'm4_helios_hub', 'textures', 'surface-map-build.json');
const surfaceBuildReceipt = JSON.parse(await readFile(SURFACE_BUILD_RECEIPT_PATH, 'utf8'));

function systemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || null;
}

await mkdir(OUT, { recursive: true });
const externalBaseUrl = process.env.SPACEFACE_CAPTURE_URL || null;
const server = externalBaseUrl
  ? { baseUrl: externalBaseUrl, close: async () => {} }
  : await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: systemBrowser(),
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const errors = [];
let evidence = null;
page.on('pageerror', (error) => errors.push(String(error && error.stack || error)));

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  // The runtime deliberately admits exact authored identities through a bounded
  // queue. A fixed one-second delay races that queue on catalog-heavy sectors
  // and can mistake healthy invisible/pending ships for a failed swap. Keep the
  // strict all-live-ship assertion below, but wait for its actual settled state.
  await page.waitForFunction(() => {
    const ships = window.SF.state.entityList.filter((entity) => (
      entity && entity.alive !== false && entity.type === 'ship'
    ));
    return ships.length > 0 && ships.every((entity) => (
      entity.presentationAdmission === 'ready'
        && String(entity.mesh?.userData?.authoredAssetState || '').startsWith('authored')
    ));
  }, null, { timeout: 120_000 });
  await page.waitForTimeout(500);

  const inventory = await page.evaluate(async () => {
    const state = window.SF.state;
    const profiles = await import('/src/data/entityInteractionProfiles.js');
    const auditMaterials = (root) => {
      const seen = new Set();
      const materials = [];
      root?.traverse?.((object) => {
        const list = Array.isArray(object?.material) ? object.material : (object?.material ? [object.material] : []);
        for (const material of list) {
          if (!material || seen.has(material.uuid)) continue;
          seen.add(material.uuid);
          const coverage = material.userData?.spacefacePbrCoverage || null;
          const fallback = material.userData?.spacefaceProceduralPbrFallback || null;
          materials.push({
            name: material.name || '(unnamed)',
            type: material.type || null,
            role: material.userData?.spacefaceMaterialRole || null,
            maps: {
              baseColor: !!material.map,
              normalDetail: !!(material.normalMap || material.bumpMap),
              roughness: !!material.roughnessMap,
              metalness: !!material.metalnessMap,
              ao: !!material.aoMap,
            },
            roughness: Number.isFinite(material.roughness) ? material.roughness : null,
            metalness: Number.isFinite(material.metalness) ? material.metalness : null,
            authoredComplete: coverage?.complete ?? null,
            sourceRemasterRequired: material.userData?.spacefacePbrRemasterRequired ?? null,
            fallback: fallback ? { ...fallback, supplied: { ...(fallback.supplied || {}) } } : null,
          });
        }
      });
      return {
        materials,
        counts: {
          total: materials.length,
          authoredComplete: materials.filter((row) => row.authoredComplete === true).length,
          runtimeComplete: materials.filter((row) => row.maps.baseColor && row.maps.normalDetail
            && row.maps.roughness && row.maps.metalness).length,
          proceduralFallback: materials.filter((row) => !!row.fallback).length,
          sourceRemasterRequired: materials.filter((row) => row.sourceRemasterRequired === true).length,
        },
      };
    };
    const player = state.entities.get(state.playerId);
    const entities = state.entityList.filter((entity) => entity && entity.alive !== false);
    const station = entities.find((entity) => entity.type === 'station'
      && (entity.data?.stationId === 'station_helios' || entity.id === 'station_helios'));
    const commonRocks = entities.filter((entity) => entity.type === 'asteroid' && entity.pos
      && entity.data?.typeId === 'ast_common_rock');
    const asteroids = commonRocks.length
      ? commonRocks
      : entities.filter((entity) => entity.type === 'asteroid' && entity.pos);
    asteroids.sort((a, b) => (
      Math.hypot(a.pos.x - player.pos.x, a.pos.z - player.pos.z)
      - Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z)
    ));
    const asteroidVariants = [];
    const seenAsteroidVariants = new Set();
    for (const asteroid of asteroids) {
      const body = asteroid.mesh?.userData?.asteroidInstanceBody;
      const variant = body?.userData?.asteroidInstanceVariant;
      if (!Number.isInteger(variant) || seenAsteroidVariants.has(variant)) continue;
      seenAsteroidVariants.add(variant);
      asteroidVariants.push({ id: asteroid.id, variant });
    }
    asteroidVariants.sort((a, b) => a.variant - b.variant);
    let reactor = entities.find((entity) => profiles.isUnstableReactorWreck(entity));
    if (!reactor) {
      const dueAt = Number(state.simTime || 0) + 60;
      reactor = window.SF.helpers.spawnEntity({
        type: 'wreck',
        pos: { x: player.pos.x + 220, z: player.pos.z + 80 },
        vel: { x: 0.45, z: -0.2 },
        rot: 0.3,
        angVel: 0.12,
        radius: 12,
        mass: 240,
        hull: 80,
        hullMax: 80,
        data: {
          parentType: 'reactor',
          unstableReactor: { dueAt, damage: 18, vented: false, burst: false, towedClear: false },
          salvagePool: 25,
        },
      });
    }
    return {
      playerId: player.id,
      playerVisual: {
        defId: player.data?.defId || player.defId || null,
        appearanceId: player.data?.appearanceId || player.data?.appearance?.id || null,
        admission: player.presentationAdmission || null,
        authoredState: player.mesh?.userData?.authoredAssetState || 'missing',
        authoredVisualRoot: player.mesh?.userData?.authoredVisualRoot || null,
        authoredCompositionId: player.mesh?.userData?.authoredCompositionId || null,
        authoredParts: player.mesh?.userData?.authoredParts || [],
        readableFallbackRetained: player.mesh?.userData?.authoredReadableFallbackRetained ?? null,
        shipConstruction: player.mesh?.userData?.shipConstruction || null,
        temporaryDrawables: player.mesh?.userData?.authoredAdmissionTemporaryDrawables ?? null,
        surfaceAudit: auditMaterials(player.mesh),
      },
      stationId: station && station.id,
      stationSurfaceAudit: auditMaterials(station?.mesh),
      asteroidId: asteroids[0] && asteroids[0].id,
      asteroidVariants,
      reactorId: reactor && reactor.id,
      ships: entities.filter((entity) => entity.type === 'ship').map((entity) => ({
        id: entity.id,
        admission: entity.presentationAdmission || null,
        authored: entity.mesh?.userData?.authoredAssetState || 'missing',
        shipConstruction: entity.mesh?.userData?.shipConstruction || null,
        readableFallbackRetained: entity.mesh?.userData?.authoredReadableFallbackRetained ?? null,
      })),
    };
  });

  assert(inventory.stationId != null, 'Helios station must exist on the public route');
  assert(inventory.asteroidId != null, 'a live asteroid must exist on the public route');
  assert.deepEqual(inventory.asteroidVariants.map((entry) => entry.variant), [0, 1, 2, 3, 4],
    'normal-route evidence must cover all five deterministic common-rock silhouettes');
  assert(inventory.reactorId != null, 'reactor wreck fixture must exist');
  assert.deepEqual(inventory.ships.filter((ship) => ship.admission !== 'ready' || ship.authored !== 'authored'), [],
    'every live ship must be authored and action-admitted before capture');
  assert.deepEqual(inventory.ships.filter((ship) => (
    ship.shipConstruction !== 'authored-direct' || ship.readableFallbackRetained !== false
  )), [], 'every live ship must mount directly from the authored catalog without a retained stand-in');

  const captures = [];
  await page.evaluate(() => {
    const state = window.SF.state;
    state.camera.zoom = 72;
    window.SF.bus.emit('camera:zoom', { level: 72 });
    state.render?.cameraCtrl?.snapToPlayer?.();
    state.player.targetId = null;
  });
  await page.waitForTimeout(900);
  const starterFile = path.join(OUT, 'starter-kestrel.png');
  await page.screenshot({ path: starterFile });
  captures.push({
    scenario: 'starter-kestrel',
    file: path.relative(ROOT, starterFile).replaceAll('\\', '/'),
    receipt: inventory.playerVisual,
  });
  const captureScenarios = [
    // The authored Helios mesh is intentionally much larger than its docking radius. Use the real
    // maximum tactical zoom, but keep its center inside the chase aperture: a 500 wu offset placed
    // the station entirely beyond the public camera's ~176 wu horizontal safe half-width.
    ['helios-station', inventory.stationId, { dx: 110, dz: 0, zoom: 330 }],
    // Small interaction targets must sit inside the ordinary 72 wu chase aperture. A diagonal
    // offset keeps both the player silhouette and the target visible instead of hiding one behind
    // the other along the camera's projected depth axis.
    ['mineable-asteroid', inventory.asteroidId, { dx: 36, dz: 14, zoom: 72 }],
    ['unstable-reactor-wreck', inventory.reactorId, { dx: 22, dz: 10, zoom: 72 }],
  ];
  for (const entry of inventory.asteroidVariants) {
    if (entry.id === inventory.asteroidId) continue;
    captureScenarios.push([
      `mineable-asteroid-v${entry.variant}`,
      entry.id,
      { dx: 36, dz: 14, zoom: 72 },
    ]);
  }
  for (const [scenario, id, framing] of captureScenarios) {
      const receipt = await page.evaluate(async ({ id, framing }) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(id);
      const profiles = await import('/src/data/entityInteractionProfiles.js');
      assertTarget(target);
      const nextX = target.pos.x - framing.dx;
      const nextZ = target.pos.z - framing.dz;
      if (typeof player.pos.set === 'function') player.pos.set(nextX, 0, nextZ);
      else { player.pos.x = nextX; player.pos.z = nextZ; }
      if (player.prevPos?.copy) player.prevPos.copy(player.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      player.rot = 0;
      player.prevRot = 0;
      player.flags = player.flags || {};
      // The live Rapier owner is authoritative after the next fixed step. Mark this evaluation-only
      // relocation for a one-shot body resync or it will correctly restore the pre-capture pose.
      player.flags.noInterp = true;
      state.camera.zoom = framing.zoom;
      window.SF.bus.emit('camera:zoom', { level: framing.zoom });
      state.render?.cameraCtrl?.snapToPlayer?.();
      state.player.targetId = target.id;
      const profile = profiles.interactionProfileForEntity(target);
      const asteroidBody = target.mesh?.userData?.asteroidInstanceBody || null;
      return {
        id: target.id,
        type: target.type,
        label: profiles.interactionDisplayName(target),
        profile,
        authoredState: target.mesh?.userData?.authoredAssetState || null,
        presentationAdmission: target.presentationAdmission || null,
        placeId: target.data?.placeId || target.data?.archetypeGlb || null,
        framing,
        distance: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
        visualBounds: target.mesh?.userData?.hull?.userData?.visualBounds
          || target.mesh?.userData?.visualBounds
          || null,
        asteroidSurface: asteroidBody ? {
          variant: asteroidBody.userData?.asteroidInstanceVariant ?? null,
          variantName: asteroidBody.geometry?.userData?.spacefaceGeology?.variantName || null,
          flatShading: asteroidBody.material?.flatShading ?? null,
          vertexColors: asteroidBody.material?.vertexColors ?? null,
          hasBaseColor: !!asteroidBody.material?.map,
          hasNormal: !!asteroidBody.material?.normalMap,
          hasOrm: !!(asteroidBody.material?.roughnessMap && asteroidBody.material?.metalnessMap),
          baseColorUrl: asteroidBody.material?.map?.source?.data?.currentSrc
            || asteroidBody.material?.map?.source?.data?.src || null,
          normalUrl: asteroidBody.material?.normalMap?.source?.data?.currentSrc
            || asteroidBody.material?.normalMap?.source?.data?.src || null,
          ormUrl: asteroidBody.material?.roughnessMap?.source?.data?.currentSrc
            || asteroidBody.material?.roughnessMap?.source?.data?.src || null,
          baseColorRepeat: asteroidBody.material?.map?.repeat?.toArray?.() || null,
          vertexCount: asteroidBody.geometry?.getAttribute?.('position')?.count || 0,
          geology: asteroidBody.geometry?.userData?.spacefaceGeology || null,
          pbrAttribute: (() => {
            const attribute = asteroidBody.geometry?.getAttribute?.('sfGeologyPbr');
            return attribute ? { count: attribute.count, itemSize: attribute.itemSize } : null;
          })(),
          materialRoles: asteroidBody.material?.userData?.spacefaceMaterialRoles || null,
          surfaceModel: asteroidBody.material?.userData?.spacefaceSurfaceModel || null,
          shaderKey: asteroidBody.material?.customProgramCacheKey?.() || null,
          emissive: asteroidBody.material?.emissive?.getHex?.() ?? null,
          emissiveIntensity: asteroidBody.material?.emissiveIntensity ?? null,
        } : null,
        asteroidOwnedRenderables: asteroidBody ? (() => {
          const rows = [];
          target.mesh?.traverse?.((object) => {
            if (!(object?.isMesh || object?.isSprite || object?.isPoints || object?.isLine)) return;
            const materials = (Array.isArray(object.material) ? object.material : [object.material])
              .filter(Boolean)
              .map((material) => {
                const color = material.color?.toArray?.() || null;
                const emissive = material.emissive?.toArray?.() || null;
                return {
                  uuid: material.uuid || null,
                  name: material.name || null,
                  color,
                  emissive,
                  emissiveIntensity: material.emissiveIntensity ?? null,
                  yellowLike: !!color && color[0] > 0.45 && color[1] > 0.28
                    && color[2] < Math.min(color[0], color[1]) * 0.72,
                };
              });
            rows.push({
              uuid: object.uuid || null,
              name: object.name || null,
              type: object.type || null,
              visible: object.visible !== false,
              asteroidBaseBody: object === asteroidBody,
              materials,
            });
          });
          return rows;
        })() : null,
      };

      function assertTarget(value) {
        if (!value || value.alive === false || !value.pos) throw new Error(`missing target ${id}`);
      }
      }, { id, framing });
    if (scenario === 'helios-station') receipt.surfaceAudit = inventory.stationSurfaceAudit;
    if (scenario.startsWith('mineable-asteroid')) {
      const surface = receipt.asteroidSurface;
      assert.equal(surface?.geology?.schema, 'spaceface.commonRockGeology.v4');
      assert.deepEqual(surface?.materialRoles, ['matrix', 'fracture', 'regolith', 'ferrite']);
      assert.equal(surface?.pbrAttribute?.itemSize, 4);
      assert.equal(surface?.pbrAttribute?.count, surface?.vertexCount);
      assert.deepEqual(surface?.geology?.pbrAttributeChannels,
        ['ao', 'roughness', 'metalness', 'normalStrength']);
      assert.equal(surface?.shaderKey, 'spaceface-common-rock-geology-pbr-v4');
      assert.equal(surface?.emissive, 0, 'common rock must not read as molten/emissive');
      assert.equal(surface?.emissiveIntensity, 0);
      const asteroidOwnedYellow = receipt.asteroidOwnedRenderables.flatMap((renderable) => (
        renderable.materials.filter((material) => material.yellowLike)
          .map((material) => ({ renderable: renderable.name, material }))
      ));
      assert.deepEqual(asteroidOwnedYellow, [],
        'a yellow sliver in the frame cannot be authored or emissive asteroid geometry');
      receipt.yellowSliverAudit = {
        asteroidOwnedRenderableCount: receipt.asteroidOwnedRenderables.length,
        asteroidOwnedNonBodyRenderableCount: receipt.asteroidOwnedRenderables
          .filter((row) => !row.asteroidBaseBody).length,
        asteroidOwnedYellow,
        conclusion: 'the common-rock root owns no yellow renderable; any yellow sliver is an unrelated world/HUD marker occluded by the rock',
      };
      receipt.surfaceByteProvenance = await verifyBoundSurfaceTextures({
        buildReceipt: surfaceBuildReceipt,
        role: 'rock',
        urls: {
          basecolor: surface?.baseColorUrl,
          normal: surface?.normalUrl,
          orm: surface?.ormUrl,
        },
      });
      assert.equal(receipt.surfaceByteProvenance.allMatch, true,
        'live common-rock textures must byte-match the deterministic Rock023-derived build receipt');
    }
    await page.waitForTimeout(scenario === 'helios-station' ? 1800 : 900);
    receipt.targetPanelText = await page.evaluate(() => {
      const panel = document.querySelector('.sf-target');
      return panel && getComputedStyle(panel).display !== 'none'
        ? (panel.innerText || panel.textContent || '').replace(/\s+/g, ' ').trim()
        : null;
    });
    receipt.afterWait = await page.evaluate((targetId) => {
      const state = window.SF.state;
      const target = state.entities.get(targetId);
      return {
        simTime: state.simTime,
        playerTargetId: state.player.targetId,
        exists: !!target,
        alive: target?.alive ?? null,
        unstableReactor: target?.data?.unstableReactor || null,
      };
    }, id);
    const file = path.join(OUT, `${scenario}.png`);
    await page.screenshot({ path: file });
    captures.push({ scenario, file: path.relative(ROOT, file).replaceAll('\\', '/'), receipt });
  }

  // Fixed-framing multiframe proof for the exact five live common-rock buckets. This catches the
  // historical failure where the hidden source leaf and its instanced submission briefly disagreed
  // about ownership or coordinate space, producing a two-body-width jump that a still cannot show.
  const asteroidStability = [];
  for (const { id, variant } of inventory.asteroidVariants) {
    await page.evaluate(({ targetId }) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(targetId);
      if (!player || !target) throw new Error(`missing stability target ${targetId}`);
      const nextX = target.pos.x - 36;
      const nextZ = target.pos.z - 14;
      if (typeof player.pos.set === 'function') player.pos.set(nextX, 0, nextZ);
      else { player.pos.x = nextX; player.pos.z = nextZ; }
      if (player.prevPos?.copy) player.prevPos.copy(player.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      player.rot = 0;
      player.prevRot = 0;
      player.flags = player.flags || {};
      player.flags.noInterp = true;
      state.camera.zoom = 72;
      window.SF.bus.emit('camera:zoom', { level: 72 });
      state.render?.cameraCtrl?.snapToPlayer?.();
      state.player.targetId = target.id;
    }, { targetId: id });
    await page.waitForTimeout(900);

    const firstFrameFile = path.join(OUT, `stability-v${variant}-frame-00.png`);
    const lastFrameFile = path.join(OUT, `stability-v${variant}-frame-23.png`);
    await page.screenshot({ path: firstFrameFile });
    const samples = [];
    for (let frame = 0; frame < 24; frame++) {
      samples.push(await page.evaluate(({ targetId, expectedVariant, frame }) => {
        const state = window.SF.state;
        const target = state.entities.get(targetId);
        const body = target?.mesh?.userData?.asteroidInstanceBody || null;
        const center = target && window.SF.helpers.worldToScreen({
          x: target.pos.x, y: 0, z: target.pos.z,
        });
        const edgeX = target && window.SF.helpers.worldToScreen({
          x: target.pos.x + target.radius, y: 0, z: target.pos.z,
        });
        const edgeZ = target && window.SF.helpers.worldToScreen({
          x: target.pos.x, y: 0, z: target.pos.z + target.radius,
        });
        const radiusPx = center && Math.max(
          Math.hypot(edgeX.x - center.x, edgeX.y - center.y),
          Math.hypot(edgeZ.x - center.x, edgeZ.y - center.y),
        );
        const membership = window.SF.helpers.asteroidInstanceMembership?.(targetId) || null;
        return {
          frame,
          simTime: state.simTime,
          expectedVariant,
          targetId: target?.id ?? null,
          entityPosition: target ? [target.pos.x, target.pos.z] : null,
          projectedCentroid: center || null,
          projectedRadiusPx: radiusPx || 0,
          rootUuid: target?.mesh?.uuid || null,
          bodyUuid: body?.uuid || null,
          geometryUuid: body?.geometry?.uuid || null,
          materialUuid: body?.material?.uuid || null,
          sourceBodyVisible: body?.visible ?? null,
          rootLocalPosition: target?.mesh?.position?.toArray?.() || null,
          cameraPosition: state.camera?.obj?.position?.toArray?.() || null,
          cameraQuaternion: state.camera?.obj?.quaternion?.toArray?.() || null,
          membership,
        };
      }, { targetId: id, expectedVariant: variant, frame }));
      if (frame < 23) await page.waitForTimeout(50);
    }
    await page.screenshot({ path: lastFrameFile });

    const identityFingerprints = new Set(samples.map((sample) => JSON.stringify([
      sample.targetId,
      sample.rootUuid,
      sample.bodyUuid,
      sample.geometryUuid,
      sample.materialUuid,
      sample.membership?.variant,
      sample.membership?.sourceRootUuid,
      sample.membership?.sourceLeafUuid,
      sample.membership?.poolMeshUuid,
    ])));
    const ownershipFingerprints = new Set(samples.map((sample) => JSON.stringify([
      sample.membership?.registered,
      sample.membership?.adopted,
      sample.membership?.submitted,
      sample.membership?.submittedIndex,
      sample.sourceBodyVisible,
    ])));
    let maxCentroidStepPx = 0;
    let maxWorldStep = 0;
    for (let frame = 1; frame < samples.length; frame++) {
      const before = samples[frame - 1];
      const after = samples[frame];
      maxCentroidStepPx = Math.max(maxCentroidStepPx, Math.hypot(
        after.projectedCentroid.x - before.projectedCentroid.x,
        after.projectedCentroid.y - before.projectedCentroid.y,
      ));
      maxWorldStep = Math.max(maxWorldStep, Math.hypot(
        after.entityPosition[0] - before.entityPosition[0],
        after.entityPosition[1] - before.entityPosition[1],
      ));
    }
    const projectedRadiusPx = Math.max(...samples.map((sample) => sample.projectedRadiusPx));
    const centroidDiscontinuityLimitPx = Math.max(4, projectedRadiusPx * 0.35);
    const analysis = {
      sampleCount: samples.length,
      sampleIntervalMs: 50,
      identityFingerprintCount: identityFingerprints.size,
      ownershipFingerprintCount: ownershipFingerprints.size,
      maxCentroidStepPx,
      projectedRadiusPx,
      centroidDiscontinuityLimitPx,
      maxWorldStep,
      stableIdentity: identityFingerprints.size === 1,
      stableOwnership: ownershipFingerprints.size === 1,
      noCentroidDiscontinuity: maxCentroidStepPx <= centroidDiscontinuityLimitPx,
      sourceLeafHiddenWhileInstanceSubmitted: samples.every((sample) => (
        sample.sourceBodyVisible === false
          && sample.membership?.registered === true
          && sample.membership?.adopted === true
          && sample.membership?.submitted === true
          && sample.membership?.variant === variant
      )),
    };
    assert.equal(analysis.stableIdentity, true, `asteroid variant ${variant} changed render identity`);
    assert.equal(analysis.stableOwnership, true, `asteroid variant ${variant} changed pool ownership`);
    assert.equal(analysis.noCentroidDiscontinuity, true,
      `asteroid variant ${variant} jumped ${maxCentroidStepPx}px (limit ${centroidDiscontinuityLimitPx}px)`);
    assert.equal(analysis.sourceLeafHiddenWhileInstanceSubmitted, true,
      `asteroid variant ${variant} did not preserve exact one-owner submission`);
    const frameEvidence = [];
    for (const [frame, file] of [[0, firstFrameFile], [23, lastFrameFile]]) {
      const bytes = await readFile(file);
      frameEvidence.push({
        frame,
        file: path.relative(ROOT, file).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    asteroidStability.push({
      id,
      variant,
      frames: frameEvidence,
      analysis,
      samples,
    });
  }

  const spectorCapture = await captureSpectorFrame(page);
  const spectorFile = path.join(OUT, 'spector-frame.json');
  await writeFile(spectorFile, `${JSON.stringify(spectorCapture, null, 2)}\n`);
  evidence = {
    schema: 'spaceface.objectIdentityAcceptance.v2',
    route: server.baseUrl,
    inventory,
    captures,
    asteroidStability,
    spector: {
      file: path.relative(ROOT, spectorFile).replaceAll('\\', '/'),
      summary: summarizeSpectorCapture(spectorCapture),
    },
    errors,
  };
  assert.deepEqual(errors, []);
} finally {
  const video = page.video();
  await context.close();
  if (video && evidence) {
    const videoFile = path.join(OUT, 'common-rock-stability-normal-route.webm');
    await video.saveAs(videoFile);
    const videoBytes = await readFile(videoFile);
    evidence.stabilityVideo = {
      file: path.relative(ROOT, videoFile).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(videoBytes).digest('hex'),
      scenarios: evidence.inventory?.asteroidVariants?.map?.((entry) => `common-rock-v${entry.variant}`) || [],
      camera: 'normal-route chase camera, zoom 72, stationary player framing',
      settings: '1440x900; normal gameplay route; no standalone asset preview',
    };
    await writeFile(path.join(OUT, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  }
  await browser.close();
  await server.close();
}
