#!/usr/bin/env node
// Normal-route, real-renderer acceptance for projectile impacts and phased destruction.
// This drives the live VFX owner after a normal New Game boot; it does not use a standalone preview.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  buildPq023CombatReadabilityProjection,
  buildPq023SmallDestructionSalienceProjection,
  PQ023_COMBAT_READABILITY_CELLS,
  PQ023_SMALL_DESTRUCTION_SALIENCE_CELLS,
  validatePq023CombatReadabilityProjection,
  validatePq023SmallDestructionSalienceProjection,
} from './lib/pq023CombatReadabilityProjection.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PQ023_H1 = process.env.SF_PQ023_H1 === '1';
const PQ023_COMBAT_READABILITY_ONLY = process.env.SF_PQ023_COMBAT_READABILITY === '1';
const PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY =
  process.env.SF_PQ023_SMALL_DESTRUCTION_SALIENCE === '1';
const PQ023_TARGETED_CONTINUATION =
  PQ023_COMBAT_READABILITY_ONLY || PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY;
const OUT = process.env.SF_COMBAT_CAPTURE_DIR
  ? path.resolve(ROOT, process.env.SF_COMBAT_CAPTURE_DIR)
  : path.join(ROOT, '.devshots', 'graphics', 'combat-vfx-acceptance');
const BASE_URL = process.env.SF_PROBE_URL || '';
const WIDTH = 1440;
const HEIGHT = 900;

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for combat VFX acceptance capture');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: BASE_URL, root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: !PQ023_H1,
  executablePath,
  args: [
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--force-device-scale-factor=1',
  ],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();
const videoStartMs = Date.now();
const issues = [];
const captures = [];
const motionSegments = [];
let videoPath = null;
let report = null;
let gpu = null;
let pq023H1 = null;
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || error?.message || String(error) }));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push({ type: 'console.error', text: message.text() });
});

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Combat VFX Acceptance', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight'
      && player?.mesh
      && String(player.mesh.userData?.authoredAssetState || '').startsWith('authored')
      && !!sf?.registry?.get?.('vfx')?._scene;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(800);

  gpu = await readGpuContract(page);
  assert.equal(gpu.available, true, 'combat VFX acceptance requires WebGL');
  assert.doesNotMatch(gpu.renderer || '', /SwiftShader|llvmpipe|software/i,
    `combat VFX acceptance requires a real GPU path, got ${gpu.renderer}`);
  if (PQ023_H1) await installPq023CueObservers(page);

  const explosionOrigin = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    // Keep the acceptance subject near the player-centered camera. The previous +24 offset placed
    // capital residue against the left crop boundary, which made scale and opacity impossible to
    // judge honestly.
    return { x: player.pos.x + 15, z: player.pos.z + 5 };
  });
  const spatialContract = await prepareCaptureTarget(page);
  const origin = spatialContract.target.center;

  const weapons = [
    ['kinetic', 'wpn_autocannon_m'],
    ['rail', 'wpn_railgun_m'],
    ['plasma', 'wpn_plasma_cannon_m'],
    ['beam', 'wpn_beam_laser_m'],
    ['missile', 'wpn_missile_rack_m'],
  ];
  if (!PQ023_TARGETED_CONTINUATION) {
    for (let i = 0; i < weapons.length; i++) {
      const [family, weaponId] = weapons[i];
      await triggerMuzzle(page, { ...origin, family, weaponId, index: i, freezeMs: 16 });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-muzzle.png`, `${family} directional muzzle`);
      await page.waitForTimeout(180);

      await triggerFlight(page, { ...origin, family, weaponId, index: i, freezeMs: 18, motion: false });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-flight.png`, `${family} projectile or sustained-beam flight`);
      await stopBeam(page, { family, index: i });
      await page.waitForTimeout(180);

      await triggerImpact(page, { ...origin, weaponId, index: i, freezeMs: 16 });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-impact-contact.png`, `${family} impact contact`);
      await page.waitForTimeout(260);
      const releaseWait = family === 'rail' ? 42 : family === 'beam' ? 30
        : family === 'kinetic' ? 82 : family === 'plasma' ? 150 : 210;
      await triggerImpact(page, { ...origin, weaponId, index: i, freezeMs: releaseWait });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-impact-release.png`, `${family} impact release`);
      await page.waitForTimeout(360);

      await triggerMaterialImpact(page, { ...origin, weaponId, index: i, material: 'shield', freezeMs: 18 });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-shield.png`, `${family} shield-material response`);
      await page.waitForTimeout(360);

      await triggerMaterialImpact(page, { ...origin, weaponId, index: i, material: 'hull', freezeMs: 18 });
      await capture(`${String(i + 1).padStart(2, '0')}-${family}-hull.png`, `${family} hull-material response`);
      await page.waitForTimeout(520);
    }
  }

  if (PQ023_H1 && !PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY) {
    const impactProfiles = await readPq023ImpactProfiles(page);
    assert.notEqual(impactProfiles.flak.mode, impactProfiles.autocannon.mode,
      'PQ-023 flak and autocannon impact modes must remain distinct');
    const impactFrames = await capturePq023ImpactStrips(page);
    pq023H1 = { impactProfiles, impactFrames };
  }

  await setCaptureTargetVisible(page, false);

  const classes = [
    { classId: 'small', radius: 4, waits: [18, 70, 150, 300, 720] },
    { classId: 'ordinary', radius: 8, waits: [18, 95, 190, 430, 1050] },
    { classId: 'capital', radius: 15, waits: [20, 180, 430, 690, 1030, 2200] },
  ];
  const evidenceClasses = PQ023_TARGETED_CONTINUATION
    ? classes.filter((spec) => spec.classId === 'small')
    : classes;
  let fileIndex = weapons.length + 1;
  for (const spec of evidenceClasses) {
    for (let i = 0; i < spec.waits.length; i++) {
      const target = spec.waits[i];
      // Each strip frame starts a fresh lifecycle. page.screenshot itself can take hundreds of
      // milliseconds on the real route; sequential captures therefore cannot truthfully represent
      // closely spaced authored phase times.
      await triggerExplosion(page, { ...explosionOrigin, ...spec, freezeMs: target });
      await capture(
        `${String(fileIndex).padStart(2, '0')}-${spec.classId}-${String(i + 1).padStart(2, '0')}.png`,
        `${spec.classId} explosion ${target}ms`,
      );
      await page.waitForTimeout(140);
    }
    fileIndex++;
    await page.waitForTimeout(spec.classId === 'capital' ? 900 : 500);
  }

  const reducedClass = PQ023_TARGETED_CONTINUATION ? 'small' : 'ordinary';
  const reducedRadius = PQ023_TARGETED_CONTINUATION ? 4 : 8;
  const reducedWaits = [190, 500];
  const reducedPrefix = PQ023_TARGETED_CONTINUATION ? 'pq023-reduced-small' : '09-reduced-ordinary';
  await setCombatAccessibility(page, true);
  await triggerExplosion(page, {
    ...explosionOrigin,
    classId: reducedClass,
    radius: reducedRadius,
    freezeMs: reducedWaits[0],
  });
  await capture(`${reducedPrefix}-01.png`, `${reducedClass} explosion reduced motion and flash ${reducedWaits[0]}ms`);
  await page.waitForTimeout(180);
  await triggerExplosion(page, {
    ...explosionOrigin,
    classId: reducedClass,
    radius: reducedRadius,
    freezeMs: reducedWaits[1],
  });
  await capture(`${reducedPrefix}-02.png`, `${reducedClass} explosion reduced motion and flash ${reducedWaits[1]}ms`);
  await page.waitForTimeout(1000);

  await setCaptureTargetVisible(page, true);
  if (PQ023_TARGETED_CONTINUATION) {
    await triggerDenseDestruction(page, { ...explosionOrigin, freezeMs: 180 });
    await capture('pq023-dense-representative.png',
      'dense mixed destruction with connected beam 180ms');
  } else {
    await triggerDenseDestruction(page, { ...explosionOrigin, freezeMs: 180 });
    await capture('10-dense-destruction-01.png', 'dense mixed destruction readability 180ms', { resume: false });
    await capture('10-dense-combat-beam-01.png', 'dense mixed destruction with connected beam 180ms');
    await page.waitForTimeout(180);
    await triggerDenseDestruction(page, { ...explosionOrigin, freezeMs: 520 });
    await capture('10-dense-destruction-02.png', 'dense mixed destruction readability 520ms', { resume: false });
    await capture('10-dense-combat-beam-02.png', 'dense mixed destruction with connected beam 520ms');
  }

  // A still strip cannot reveal beam strobing, detached projectile wakes, texture-card pops, or
  // lifecycle discontinuities. Record a compact real-time reel using the same production pools and
  // camera; only simulation remains frozen so unrelated NPC combat cannot contaminate the proof.
  await setCombatAccessibility(page, false);
  await setCaptureTargetVisible(page, true);
  if (!PQ023_TARGETED_CONTINUATION) {
    for (let i = 0; i < weapons.length; i++) {
      const [family, weaponId] = weapons[i];
      const startMs = Date.now() - videoStartMs;
      await triggerMuzzle(page, { ...origin, family, weaponId, index: i, freezeMs: 1 });
      await advanceCombatMotion(page, 150, { family, stage: 'muzzle' });
      await triggerFlight(page, { ...origin, family, weaponId, index: i, freezeMs: 1, motion: true });
      const flightDuration = family === 'beam' ? 620 : family === 'rail' ? 260 : 480;
      const proofStep = family === 'beam' ? 140 : family === 'plasma' ? 120 : family === 'kinetic' ? 90 : 0;
      let proofAdvanced = 0;
      if (proofStep > 0) {
        for (let proofIndex = 0; proofIndex < 3; proofIndex++) {
          await advanceCombatMotion(page, proofStep, { family, stage: 'flight' });
          proofAdvanced += proofStep;
          await capture(
            `motion-${family}-${String(proofIndex + 1).padStart(2, '0')}.png`,
            `${family} consecutive production flight frame ${proofIndex + 1}`,
            { resume: false },
          );
        }
      }
      if (flightDuration > proofAdvanced) {
        await advanceCombatMotion(page, flightDuration - proofAdvanced, { family, stage: 'flight' });
      }
      await triggerImpact(page, { ...origin, weaponId, index: i, freezeMs: 1 });
      await advanceCombatMotion(page, family === 'missile' ? 680 : family === 'plasma' ? 520 : 360,
        { family, stage: 'impact' });
      await stopBeam(page, { family, index: i });
      motionSegments.push({
        scenario: `${family} muzzle, flight, and impact motion`,
        startMs,
        endMs: Date.now() - videoStartMs,
      });
    }
  }
  if (PQ023_H1 && !PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY) {
    const specs = PQ023_COMBAT_READABILITY_ONLY
      ? [
        { family: 'autocannon', weaponId: 'wpn_autocannon_m', scenario: 'autocannon directional incidence impact motion' },
        { family: 'flak', weaponId: 'wpn_flak_turret_s', scenario: 'flak proximity-burst impact motion' },
      ]
      : [{ family: 'flak', weaponId: 'wpn_flak_turret_s', scenario: 'flak proximity-burst impact motion' }];
    for (const spec of specs) {
      const startMs = Date.now() - videoStartMs;
      await triggerImpact(page, { weaponId: spec.weaponId, freezeMs: 1 });
      await advanceCombatMotion(page, 720, { family: spec.family, stage: 'impact' });
      motionSegments.push({
        scenario: spec.scenario,
        startMs,
        endMs: Date.now() - videoStartMs,
      });
    }
  }
  await setCaptureTargetVisible(page, false);
  for (const spec of evidenceClasses) {
    const durationMs = spec.classId === 'capital' ? 4800 : spec.classId === 'ordinary' ? 1700 : 1000;
    const startMs = Date.now() - videoStartMs;
    await triggerExplosion(page, { ...explosionOrigin, ...spec, freezeMs: 1 });
    await advanceCombatMotion(page, durationMs, { family: spec.classId, stage: 'destruction' });
    motionSegments.push({
      scenario: `${spec.classId} destruction lifecycle motion`,
      startMs,
      endMs: Date.now() - videoStartMs,
    });
  }

  await setCombatAccessibility(page, true);
  await setCaptureTargetVisible(page, false);
  {
    const startMs = Date.now() - videoStartMs;
    await triggerExplosion(page, {
      ...explosionOrigin,
      classId: reducedClass,
      radius: reducedRadius,
      freezeMs: 1,
    });
    for (let proofIndex = 0; proofIndex < 3; proofIndex++) {
      await advanceCombatMotion(page, 180, { family: `${reducedClass}-reduced`, stage: 'destruction' });
      await capture(
        `motion-reduced-${reducedClass}-${String(proofIndex + 1).padStart(2, '0')}.png`,
        `reduced-motion ${reducedClass} destruction frame ${proofIndex + 1}`,
        { resume: false },
      );
    }
    motionSegments.push({
      scenario: PQ023_TARGETED_CONTINUATION
        ? 'reduced-motion and reduced-flash small destruction'
        : 'reduced-motion and reduced-flash ordinary destruction',
      startMs,
      endMs: Date.now() - videoStartMs,
    });
  }

  await setCombatAccessibility(page, false);
  await setCaptureTargetVisible(page, true);
  {
    const startMs = Date.now() - videoStartMs;
    await triggerDenseDestruction(page, { ...explosionOrigin, freezeMs: 1 });
    for (let proofIndex = 0; proofIndex < 3; proofIndex++) {
      await advanceCombatMotion(page, 180, { family: 'dense', stage: 'destruction' });
      await capture(
        `motion-dense-destruction-${String(proofIndex + 1).padStart(2, '0')}.png`,
        `dense destruction motion frame ${proofIndex + 1}`,
        { resume: false },
      );
    }
    motionSegments.push({
      scenario: 'dense mixed destruction lifecycle motion',
      startMs,
      endMs: Date.now() - videoStartMs,
    });
  }

  if (PQ023_H1 && !PQ023_TARGETED_CONTINUATION) {
    const worldSite = await capturePq023WorldSiteSequences(page);
    pq023H1 = {
      ...pq023H1,
      worldSite,
      semanticProjection: buildPq023SemanticProjection({
        impactProfiles: pq023H1.impactProfiles,
        worldSite,
      }),
    };
  } else if (PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY) {
    const cells = PQ023_SMALL_DESTRUCTION_SALIENCE_CELLS.map((spec) => {
      const row = captures.find((captureRow) => path.basename(captureRow.path) === spec.browserFile);
      assert.ok(row, `missing targeted small-destruction cell ${spec.key}: ${spec.browserFile}`);
      return { key: spec.key, runtime: row.runtime };
    });
    const semanticProjection = buildPq023SmallDestructionSalienceProjection({ cells });
    assert.deepEqual(validatePq023SmallDestructionSalienceProjection(semanticProjection), [],
      'targeted Browser small-destruction projection failed closed');
    pq023H1 = {
      continuation: 'small-destruction-salience-only',
      retainedEvidenceNotRecaptured: [
        'Wreck Cathedral normal/reduced recovery and damage',
        'autocannon and flak impact differentiation',
        'rail, plasma, beam, and missile families',
        'ordinary and capital destruction',
      ],
      semanticProjection,
    };
  } else if (PQ023_COMBAT_READABILITY_ONLY) {
    const cells = PQ023_COMBAT_READABILITY_CELLS.map((spec) => {
      const row = captures.find((captureRow) => path.basename(captureRow.path) === spec.browserFile);
      assert.ok(row, `missing targeted combat-readability cell ${spec.key}: ${spec.browserFile}`);
      return { key: spec.key, runtime: row.runtime };
    });
    const semanticProjection = buildPq023CombatReadabilityProjection({
      impactProfiles: pq023H1.impactProfiles,
      cells,
    });
    assert.deepEqual(validatePq023CombatReadabilityProjection(semanticProjection), [],
      'targeted Browser combat-readability projection failed closed');
    pq023H1 = {
      ...pq023H1,
      continuation: 'combat-readability-only',
      retainedEvidenceNotRecaptured: [
        'Wreck Cathedral normal/reduced recovery and damage',
        'rail, plasma, beam, and missile families',
        'ordinary and capital destruction',
      ],
      semanticProjection,
    };
  }

  await page.evaluate(async () => {
    const { quiescePq023Capture } = await import('/scripts/lib/pq023CaptureCleanup.mjs');
    quiescePq023Capture(window.SF.state, window.__sfResetCombatVfx);
  });
  const contactSheets = await buildEvidenceSheets();

  const diagnostics = await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const vfx = sf.registry.get('vfx');
    const buckets = vfx?._spriteBatches;
    const beams = vfx?._combatBeams;
    const surfaces = [
      vfx?._shardMesh,
      vfx?._trailStreakPool?.mesh,
      buckets?.glow?.mesh,
      buckets?.ring?.mesh,
      buckets?.smoke?.mesh,
      buckets?.combustion?.mesh,
      beams?.core,
      beams?.halo,
    ].filter(Boolean);
    const textureMap = new Map();
    const materialStates = surfaces.map((surface) => {
      const material = surface.material;
      const textures = [material?.map, material?.uniforms?.uSpriteMap?.value].filter(Boolean);
      for (const texture of textures) {
        if (textureMap.has(texture.uuid)) continue;
        textureMap.set(texture.uuid, {
          name: texture.name || null,
          width: texture.image?.width || texture.source?.data?.width || null,
          height: texture.image?.height || texture.source?.data?.height || null,
          colorSpace: texture.colorSpace || null,
        });
      }
      return {
        surface: surface.name || surface.type,
        material: material?.name || material?.type || null,
        blending: material?.blending ?? null,
        transparent: !!material?.transparent,
        depthTest: material?.depthTest !== false,
        depthWrite: material?.depthWrite !== false,
        toneMapped: material?.toneMapped !== false,
      };
    });
    return {
      route: { mode: sf.state.mode, sectorId: sf.state.world?.currentSectorId || null },
      player: {
        id: player?.id || null,
        defId: player?.data?.defId || null,
        authoredAssetState: player?.mesh?.userData?.authoredAssetState || null,
      },
      explosionCapacity: vfx?._explosions?.capacity || 0,
      explosionActiveAfterCapture: vfx?._explosions?.activeCount || 0,
      liveParticles: vfx?._liveCount || 0,
      liveSprites: vfx?._liveSpriteCount || 0,
      trailStreaks: vfx?._liveTrailStreakCount || 0,
      combatBeams: vfx?._combatBeams?.activeCount || 0,
      poolCapacities: {
        particles: vfx?._cap || 0,
        sprites: buckets?.capacity || 0,
        trailStreaks: vfx?._ts?.length || 0,
        combatBeams: beams?.maxBeams || 0,
        explosions: vfx?._explosions?.capacity || 0,
      },
      persistentDrawBudget: {
        particleShards: vfx?._shardMesh ? 1 : 0,
        trailBatch: vfx?._trailStreakPool?.mesh ? 1 : 0,
        spriteBuckets: buckets ? 4 : 0,
        combatBeamLayers: beams?.core && beams?.halo ? 2 : 0,
        totalSurfaces: surfaces.length,
      },
      materialStates,
      textureStates: [...textureMap.values()],
    };
  });
  const acceptanceChecks = {
    noPageIssues: issues.length === 0,
    routeRemainsInFlight: diagnostics.route.mode === 'flight',
    playerAssetRemainsAuthored:
      String(diagnostics.player.authoredAssetState || '').startsWith('authored'),
    explosionPoolExists: diagnostics.explosionCapacity >= 3,
    explosionPoolClean: diagnostics.explosionActiveAfterCapture === 0,
    particlesClean: diagnostics.liveParticles === 0,
    spritesClean: diagnostics.liveSprites === 0,
    trailStreaksClean: diagnostics.trailStreaks === 0,
    combatBeamsClean: diagnostics.combatBeams === 0,
    spriteCapacityPreserved: diagnostics.poolCapacities.sprites === 256,
    trailCapacityPreserved: diagnostics.poolCapacities.trailStreaks === 96,
    combatBeamCapacityPreserved: diagnostics.poolCapacities.combatBeams === 16,
    spriteBucketBudgetPreserved: diagnostics.persistentDrawBudget.spriteBuckets === 4,
    combatBeamLayerBudgetPreserved: diagnostics.persistentDrawBudget.combatBeamLayers === 2,
    spatialPathIsNontrivial: spatialContract.pathLength > 10,
    muzzleUsesFrontNotEngine:
      spatialContract.source.muzzleToFrontSocket < spatialContract.source.muzzleToEngineSocket,
    captureCountComplete: PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY
      ? captures.length === 14
      : PQ023_COMBAT_READABILITY_ONLY
        ? captures.length === 22
        : captures.length === (PQ023_H1 ? 87 : 67),
    motionSegmentsComplete: motionSegments.length >= (PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY
      ? 3
      : PQ023_COMBAT_READABILITY_ONLY ? 5 : (PQ023_H1 ? 15 : 10)),
    contactSheetsComplete: contactSheets.length === (PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY ? 2 : 3),
    pq023WorldSiteSequenceComplete: !PQ023_H1 || PQ023_TARGETED_CONTINUATION
      || pq023H1?.semanticProjection?.worldSiteCueIds?.join(',')
        === 'world_site.recovery,world_site.damage,world_site.recovery,world_site.damage',
    pq023CombatReadabilityComplete: !PQ023_COMBAT_READABILITY_ONLY
      || (pq023H1?.semanticProjection?.cells?.length === 5
        && validatePq023CombatReadabilityProjection(pq023H1.semanticProjection).length === 0),
    pq023SmallDestructionSalienceComplete: !PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY
      || (pq023H1?.semanticProjection?.cells?.length === 3
        && validatePq023SmallDestructionSalienceProjection(pq023H1.semanticProjection).length === 0),
  };
  const failedAcceptanceChecks = Object.entries(acceptanceChecks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  report = {
    schema: 'spaceface.combatVfxAcceptance.v3',
    baseUrl: ownedServer.baseUrl,
    runtimeKind: 'browser',
    viewport: { width: WIDTH, height: HEIGHT },
    gpu,
    captures,
    motionSegments,
    contactSheets,
    spatialContract,
    diagnostics,
    acceptanceChecks,
    failedAcceptanceChecks,
    pq023H1,
    continuationMode: PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY
      ? 'small-destruction-salience-only'
      : PQ023_COMBAT_READABILITY_ONLY ? 'combat-readability-only' : null,
    informational_contended: PQ023_H1,
    informational_contended_note: PQ023_H1
      ? 'Phase H1 ran contended by design. videoTimeMs and motion-segment offsets are editorial navigation metadata only; no time-valued field is performance evidence. Matched performance remains Phase H3.'
      : null,
    noPerformanceEvidence: PQ023_H1,
    issues,
    ok: failedAcceptanceChecks.length === 0,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
} finally {
  const video = page.video();
  await context.close().catch(() => {});
  if (video) {
    try {
      const rawPath = await video.path();
      videoPath = path.join(OUT, 'combat-vfx-normal-route.webm');
      if (path.resolve(rawPath) !== path.resolve(videoPath)) await rename(rawPath, videoPath);
    } catch (_) {}
  }
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
  if (report) {
    if (videoPath && existsSync(videoPath)) {
      const bytes = await readFile(videoPath);
      report.video = {
        path: videoPath,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        scenarios: motionSegments.map((segment) => segment.scenario),
      };
    } else {
      report.video = null;
      report.ok = false;
    }
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
  if (videoPath) console.log(`video ${videoPath}`);
}

async function triggerImpact(targetPage, { weaponId, freezeMs }) {
  await targetPage.evaluate(({ id, holdMs }) => {
    const vfx = window.SF.registry.get('vfx');
    const spatial = window.__sfCombatSpatialContract;
    window.__sfResetCombatVfx?.();
    const approach = spatial.source.forward;
    const normal = { x: -approach.x, z: -approach.z };
    vfx._onProjectileHit({
      weaponId: id,
      pos: spatial.target.contact,
      approach,
      normal,
      damageType: id.includes('missile') ? 'explosive'
        : id.includes('plasma') ? 'thermal'
          : id.includes('beam') ? 'energy' : 'kinetic',
    });
    window.__sfFreezeCombatVfx?.(holdMs);
  }, { id: weaponId, holdMs: freezeMs });
}

async function prepareCaptureTarget(targetPage) {
  await targetPage.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const vfx = sf.registry.get('vfx');
    const weaponSystem = sf.registry.get('weapons');
    const parent = player?.mesh?.parent || vfx?._scene;
    const fittedWeapon = player?.data?.weapons?.find((weapon) => weapon && weapon.slotIndex === 0)
      || player?.data?.weapons?.[0];
    if (!player?.mesh || !parent || !weaponSystem || !fittedWeapon) {
      throw new Error('combat spatial evidence requires the authored player, weapons owner, and fitted hardpoint');
    }

    // The acceptance source is the actual live player hardpoint, not a point inferred from the test
    // target. This is the same direction/origin seam used by weapons._serviceWeapon and the emitted
    // combat:fire receipt on the normal route.
    const direction = weaponSystem._hardpointDir(player, fittedWeapon, player.rot, 0);
    const forward = { x: Math.cos(direction), z: Math.sin(direction) };
    const muzzle = weaponSystem._muzzle(player, fittedWeapon, direction);
    const authoredFrontSocket = vfx.helpers.socketWorldPos?.(player.id, 'SOCKET_Weapon_Front') || null;
    const engineTrailSocket = vfx.helpers.socketWorldPos?.(player.id, 'SOCKET_Trail_Main') || null;
    const targetCenter = {
      x: muzzle.x + forward.x * 31.5,
      z: muzzle.z + forward.z * 31.5,
    };
    const targetRadius = Math.max(2, Number(player.radius) || 14);
    const targetContact = {
      x: targetCenter.x - forward.x * (targetRadius + 0.4),
      z: targetCenter.z - forward.z * (targetRadius + 0.4),
    };

    // Use a normal tactical chase distance that holds the verified muzzle and target hull in the
    // same frame. This is the ordinary camera system and projection, not a standalone test camera.
    sf.state.camera.zoom = Math.max(88, Number(sf.state.camera.zoom) || 0);
    const previous = window.__sfCombatVfxCaptureTarget;
    if (previous?.parent) previous.parent.remove(previous);
    const target = player.mesh.clone(true);
    const local = vfx._toLocalXZ(targetCenter.x, targetCenter.z, { x: 0, z: 0 });
    target.name = 'SF_Combat_VFX_Acceptance_Target';
    target.position.set(local.x, player.mesh.position.y, local.z);
    // Head-on target pose exposes a hull/nose contact instead of visually conflating contact with
    // either ship's cyan engine ring. Source orientation and muzzle remain untouched and live.
    target.rotation.copy(player.mesh.rotation);
    target.rotation.y += Math.PI;
    target.scale.copy(player.mesh.scale);
    target.traverse((node) => {
      node.userData = { ...(node.userData || {}), combatVfxAcceptanceTarget: true };
    });
    parent.add(target);
    window.__sfCombatVfxCaptureTarget = target;
    window.__sfCombatTargetRadius = targetRadius;
    const contract = {
      provenance: 'normal-route weapons._hardpointDir + weapons._muzzle + combat:fire payload',
      source: {
        label: 'SOURCE · LIVE HITCH',
        entityId: player.id,
        center: { x: player.pos.x, z: player.pos.z },
        rotation: player.rot,
        forward,
        direction,
        hardpointIdx: fittedWeapon.slotIndex,
        fittedWeaponId: fittedWeapon.defId,
        muzzle: { x: muzzle.x, y: 0.25, z: muzzle.z },
        authoredFrontSocket,
        engineTrailSocket,
        muzzleToFrontSocket: authoredFrontSocket
          ? Math.hypot(muzzle.x - authoredFrontSocket.x, muzzle.z - authoredFrontSocket.z) : null,
        muzzleToEngineSocket: engineTrailSocket
          ? Math.hypot(muzzle.x - engineTrailSocket.x, muzzle.z - engineTrailSocket.z) : null,
      },
      target: {
        label: 'TARGET · TEST HULL',
        center: targetCenter,
        contact: { x: targetContact.x, y: 0.25, z: targetContact.z },
        radius: targetRadius,
        facing: direction + Math.PI,
      },
      pathLength: Math.hypot(targetContact.x - muzzle.x, targetContact.z - muzzle.z),
      camera: { type: 'normal gameplay chase', requestedZoom: sf.state.camera.zoom },
      screen: null,
    };
    window.__sfCombatSpatialContract = contract;

    const oldOverlay = document.getElementById('sf-combat-spatial-evidence');
    if (oldOverlay) oldOverlay.remove();
    const overlay = document.createElement('div');
    overlay.id = 'sf-combat-spatial-evidence';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;font:600 11px/1.2 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#e8fbff;text-shadow:0 1px 2px #000;background:transparent';
    const makeLabel = (key, text, color) => {
      const node = document.createElement('div');
      node.dataset.spatialKey = key;
      node.textContent = text;
      node.style.cssText = `position:absolute;padding:4px 7px;border:1px solid ${color};border-radius:3px;background:rgba(3,9,14,.82);color:${color};white-space:nowrap;box-shadow:0 0 8px rgba(0,0,0,.7)`;
      overlay.appendChild(node);
      return node;
    };
    const makeMarker = (key, color) => {
      const node = document.createElement('div');
      node.dataset.spatialKey = key;
      node.style.cssText = `position:absolute;width:9px;height:9px;margin:-5px 0 0 -5px;border:1px solid ${color};transform:rotate(45deg);box-shadow:0 0 5px ${color}`;
      overlay.appendChild(node);
      return node;
    };
    const nodes = {
      source: makeLabel('source', 'SOURCE · LIVE HITCH', '#52d7ff'),
      target: makeLabel('target', 'TARGET · TEST HULL', '#66e6a6'),
      muzzle: makeLabel('muzzle', 'MUZZLE · HARDPOINT 0', '#ffd27a'),
      contact: makeLabel('contact', 'CONTACT · HULL', '#ff9b72'),
      axis: makeLabel('axis', 'VERIFIED FIRE AXIS', '#d9f8ff'),
      muzzleMark: makeMarker('muzzle-mark', '#ffd27a'),
      contactMark: makeMarker('contact-mark', '#ff9b72'),
    };
    document.body.appendChild(overlay);
    window.__sfCombatSpatialOverlay = overlay;
    window.__sfUpdateCombatSpatialOverlay = () => {
      const screen = (point) => sf.helpers.worldToScreen({ x: point.x, y: point.y || 0, z: point.z });
      const sourceScreen = screen(contract.source.center);
      const targetScreen = screen(contract.target.center);
      const muzzleScreen = screen(contract.source.muzzle);
      const contactScreen = screen(contract.target.contact);
      contract.screen = { source: sourceScreen, target: targetScreen, muzzle: muzzleScreen, contact: contactScreen };
      const place = (node, point, dx, dy) => {
        node.style.left = `${Math.round(point.x + dx)}px`;
        node.style.top = `${Math.round(point.y + dy)}px`;
      };
      place(nodes.source, sourceScreen, -68, -96);
      place(nodes.target, targetScreen, -68, -96);
      place(nodes.muzzle, muzzleScreen, 10, 22);
      place(nodes.contact, contactScreen, -122, 22);
      place(nodes.muzzleMark, muzzleScreen, 0, 0);
      place(nodes.contactMark, contactScreen, 0, 0);
      const mid = { x: (muzzleScreen.x + contactScreen.x) * 0.5, y: (muzzleScreen.y + contactScreen.y) * 0.5 };
      nodes.axis.textContent = contactScreen.x < muzzleScreen.x
        ? '← VERIFIED FIRE AXIS'
        : 'VERIFIED FIRE AXIS →';
      place(nodes.axis, mid, -70, -34);
      return contract.screen;
    };
    window.__sfUpdateCombatSpatialOverlay();
    // The route is fully booted and authored before this point. Freeze deterministic simulation so
    // ambient NPC fire cannot enter the same VFX pools between our reset and the GPU screenshot;
    // acceptance effects below are advanced explicitly through their production render owners.
    window.__sfCombatOriginalTimeScale = sf.state.timeScale;
    sf.state.timeScale = 0;
    sf.state.accumulator = 0;
    const originalUpdate = vfx.update;
    window.__sfOriginalCombatVfxUpdate = originalUpdate;
    window.__sfResumeCombatVfx = () => {
      vfx.update = originalUpdate;
    };
    window.__sfResetCombatVfx = () => {
      // Keep the automatic emitter disabled for the whole evidence sequence. Existing frozen
      // projectiles and ships would otherwise keep writing wakes during async module imports even
      // though simulation is paused, contaminating the acceptance-owned pools.
      vfx.update = () => {};
      const projectile = window.__sfCombatProjectileVisual;
      if (projectile?.parent) projectile.parent.remove(projectile);
      window.__sfCombatProjectileVisual = null;
      window.__sfCombatProjectileEntity = null;
      window.__sfCombatProjectileProfile = null;
      window.__sfCombatProjectilePlanScratch = null;
      window.__sfCombatBuildProjectilePlan = null;
      window.__sfCombatBeamMotionReceipt = null;
      vfx._combatBeams?.clear();
      vfx._explosions?.clear();
      while (vfx._liveTrailStreakCount > 0) vfx._retireTrailStreak(vfx._activeTrailStreaks[0]);
      while (vfx._liveSpriteCount > 0) vfx._retireSprite(vfx._activeSprites[0]);
      while (vfx._liveCount > 0) vfx._retireParticle(vfx._activeParticles[0]);
      vfx._integrateParticles(0);
      vfx._integrateSprites(0);
      vfx._commitTrailStreakInstances();
    };
    window.__sfFreezeCombatVfx = (advanceMs = 16) => {
      let remaining = Math.max(1, Number(advanceMs) || 16) / 1000;
      while (remaining > 1e-6) {
        const step = Math.min(1 / 60, remaining);
        // Advance only the acceptance-owned combat pools. Calling the full VFX update here also
        // emits ambient ship thrusters/trails, polluting both the screenshot and the diagnostics
        // with unrelated instances while the player route continues normally around this frame.
        vfx._t += step;
        vfx._explosions?.update(step, vfx._explosionEmitter);
        vfx._combatBeams?.update(vfx._t, vfx._combatBeamLocalizer, null);
        vfx._integrateParticles(step);
        vfx._integrateSprites(step);
        vfx._integrateTrailStreaks(step);
        vfx._decayEventLights(step);
        remaining -= step;
      }
      vfx.update = () => {};
    };
  });
  await targetPage.waitForTimeout(900);
  return targetPage.evaluate(() => {
    window.__sfUpdateCombatSpatialOverlay?.();
    return window.__sfCombatSpatialContract;
  });
}

async function setCaptureTargetVisible(targetPage, visible) {
  await targetPage.evaluate((nextVisible) => {
    if (window.__sfCombatVfxCaptureTarget) window.__sfCombatVfxCaptureTarget.visible = nextVisible;
    if (window.__sfCombatSpatialOverlay) {
      window.__sfCombatSpatialOverlay.style.display = nextVisible ? 'block' : 'none';
      if (nextVisible) window.__sfUpdateCombatSpatialOverlay?.();
    }
  }, visible);
}

async function triggerMuzzle(targetPage, { family, weaponId, index, freezeMs }) {
  await targetPage.evaluate(({ familyId, id, i, holdMs }) => {
    const vfx = window.SF.registry.get('vfx');
    const spatial = window.__sfCombatSpatialContract;
    window.__sfResetCombatVfx?.();
    const from = spatial.source.muzzle;
    const to = spatial.target.contact;
    vfx._onFire({
      weaponId: id,
      ownerId: spatial.source.entityId,
      hardpointIdx: spatial.source.hardpointIdx,
      beamKey: `capture-beam-${i}`,
      continuous: familyId === 'beam',
      phase: 'begin',
      origin: from,
      from,
      to,
      dir: spatial.source.forward,
    });
    window.__sfFreezeCombatVfx?.(holdMs);
  }, { familyId: family, id: weaponId, i: index, holdMs: freezeMs });
}

async function triggerFlight(targetPage, { family, weaponId, index, freezeMs, motion }) {
  await targetPage.evaluate(async ({ familyId, id, i, holdMs, animate }) => {
    const vfx = window.SF.registry.get('vfx');
    const spatial = window.__sfCombatSpatialContract;
    window.__sfResetCombatVfx?.();
    if (familyId === 'beam') {
      const receipt = {
        weaponId: id,
        ownerId: spatial.source.entityId,
        hardpointIdx: spatial.source.hardpointIdx,
        beamKey: `capture-beam-${i}`,
        continuous: true,
        phase: 'update',
        origin: spatial.source.muzzle,
        from: spatial.source.muzzle,
        to: spatial.target.contact,
        dir: spatial.source.forward,
      };
      // Refresh through the real persistent-beam receipt seam so the body remains connected long
      // enough for the screenshot without retriggering its muzzle ignition.
      vfx._onFire(receipt);
      window.__sfCombatBeamMotionReceipt = receipt;
      await new Promise((resolve) => setTimeout(resolve, 45));
      vfx._onFire(receipt);
      vfx._onDamage({
        weaponId: id,
        attackerId: spatial.source.entityId,
        targetId: 'capture-target',
        pos: spatial.target.contact,
        approach: spatial.source.forward,
        normal: { x: -spatial.source.forward.x, z: -spatial.source.forward.z },
        hullHit: true,
        amount: 5,
      });
      window.__sfFreezeCombatVfx?.(holdMs);
      return;
    }
    const profiles = await import('/src/render/vfxProfiles.js');
    const visuals = await import('/src/render/visualFactory.js');
    const start = spatial.source.muzzle;
    const end = spatial.target.contact;
    const progress = animate ? 0.08 : 0.5;
    const entity = {
      id: `capture-projectile-${i}`,
      type: 'projectile',
      pos: {
        x: start.x + (end.x - start.x) * progress,
        z: start.z + (end.z - start.z) * progress,
      },
      vel: { x: spatial.source.forward.x * 180, z: spatial.source.forward.z * 180 },
      // Production weapons spawn every projectile at radius 0.7. Evidence must use that exact scale
      // or it can either hide a real readability problem or exaggerate a sub-pixel projectile.
      radius: 0.7,
      rot: spatial.source.direction,
      team: window.SF.state.entities.get(spatial.source.entityId)?.team ?? 0,
      ownerId: spatial.source.entityId,
      data: { weaponId: id, acceptancePath: { start, end, progress } },
    };
    const projectile = visuals.createVisualFactory().build(entity);
    if (projectile) {
      const local = vfx._toLocalXZ(entity.pos.x, entity.pos.z, { x: 0, z: 0 });
      projectile.name = `SF_Combat_VFX_${familyId}_Projectile`;
      projectile.position.set(local.x, 0.28, local.z);
      projectile.rotation.y = -entity.rot;
      projectile.traverse((node) => {
        node.userData = { ...(node.userData || {}), combatVfxAcceptanceProjectile: familyId };
      });
      vfx._scene.add(projectile);
      window.__sfCombatProjectileVisual = projectile;
    }
    const profile = profiles.resolveProjectileTrailProfile(id, entity.data);
    const scratch = profiles.createProjectileTrailSpawnPlanScratch();
    const plan = profiles.buildProjectileTrailSpawnPlan(profile, entity, 1, scratch);
    plan.emitSmoke = familyId === 'missile';
    vfx._executeProjectileTrailPlan(plan, vfx._projectileTrailDiag);
    window.__sfCombatProjectileEntity = entity;
    window.__sfCombatProjectileProfile = profile;
    window.__sfCombatProjectilePlanScratch = scratch;
    window.__sfCombatBuildProjectilePlan = profiles.buildProjectileTrailSpawnPlan;
    window.__sfFreezeCombatVfx?.(holdMs);
  }, { familyId: family, id: weaponId, i: index, holdMs: freezeMs, animate: !!motion });
}

async function stopBeam(targetPage, { family, index }) {
  if (family !== 'beam') return;
  await targetPage.evaluate((i) => {
    const spatial = window.__sfCombatSpatialContract;
    window.SF.registry.get('vfx')._onBeamStop({
      ownerId: spatial.source.entityId,
      beamKey: `capture-beam-${i}`,
    });
  }, index);
}

async function triggerMaterialImpact(targetPage, { weaponId, index, material, freezeMs }) {
  await targetPage.evaluate(({ id, i, materialId, holdMs }) => {
    const vfx = window.SF.registry.get('vfx');
    const spatial = window.__sfCombatSpatialContract;
    window.__sfResetCombatVfx?.();
    const approach = spatial.source.forward;
    const normal = { x: -approach.x, z: -approach.z };
    const receipt = {
      weaponId: id,
      attackerId: spatial.source.entityId,
      targetId: 'capture-target',
      pos: spatial.target.contact,
      approach,
      normal,
      factionId: 'union',
      amount: 8,
    };
    if (id.includes('beam')) {
      vfx._onFire({
        weaponId: id,
        ownerId: spatial.source.entityId,
        hardpointIdx: spatial.source.hardpointIdx,
        beamKey: `capture-beam-${i}`,
        continuous: true,
        phase: 'update',
        origin: spatial.source.muzzle,
        from: spatial.source.muzzle,
        to: spatial.target.contact,
        dir: spatial.source.forward,
      });
    }
    vfx._onProjectileHit(receipt);
    vfx._onDamage({
      ...receipt,
      shieldAbsorbed: materialId === 'shield',
      armorHit: materialId === 'hull',
      hullHit: materialId === 'hull',
    });
    window.__sfFreezeCombatVfx?.(holdMs);
  }, { id: weaponId, i: index, materialId: material, holdMs: freezeMs });
}

async function setCombatAccessibility(targetPage, reduced) {
  await targetPage.evaluate(async (enabled) => {
    const { setPq023AccessibilityPreference } = await import('/scripts/lib/pq023Accessibility.mjs');
    const state = window.SF.state;
    setPq023AccessibilityPreference(state.settings, enabled);
    window.SF.bus.emit('settings:changed', { section: 'video', key: null });
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: null });
  }, !!reduced);
}

async function triggerExplosion(targetPage, { x, z, classId, radius, freezeMs }) {
  await targetPage.evaluate(({ px, pz, cls, r, holdMs }) => {
    const vfx = window.SF.registry.get('vfx');
    window.__sfResetCombatVfx?.();
    vfx._explosions.clear();
    // Fixed temporal strips restart the lifecycle for every screenshot because screenshot encoding
    // itself takes longer than some authored phase intervals. Reset the presentation serial per
    // class so every frame samples the same irregular layout rather than a different event pattern.
    vfx._explosions._serial = cls === 'capital' ? 3103 : (cls === 'ordinary' ? 2102 : 1101);
    vfx._queueExplosion({
      pos: { x: px, z: pz },
      radius: r,
      direction: { x: 0.92, z: 0.38 },
      type: cls === 'capital' ? 'capital-structure' : 'ship',
    }, cls);
    window.__sfFreezeCombatVfx?.(holdMs);
  }, { px: x, pz: z, cls: classId, r: radius, holdMs: freezeMs });
}

async function triggerDenseDestruction(targetPage, { x, z, freezeMs }) {
  await targetPage.evaluate(async ({ px, pz, holdMs }) => {
    const { setPq023AccessibilityPreference } = await import('/scripts/lib/pq023Accessibility.mjs');
    const state = window.SF.state;
    setPq023AccessibilityPreference(state.settings, false);
    window.SF.bus.emit('settings:changed', { section: 'video', key: null });
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: null });
    const vfx = window.SF.registry.get('vfx');
    window.__sfResetCombatVfx?.();
    vfx._explosions.clear();
    vfx._explosions._serial = 5105;
    const offsets = [[-8, -5], [0, -7], [8, -4], [-7, 6], [3, 5], [9, 7]];
    for (let i = 0; i < offsets.length; i++) {
      const [ox, oz] = offsets[i];
      vfx._queueExplosion({
        pos: { x: px + ox, z: pz + oz },
        radius: i % 3 === 0 ? 8 : 4,
        direction: { x: 0.8, z: i % 2 ? -0.6 : 0.6 },
        type: i % 3 === 0 ? 'ship' : 'small-object',
      }, i % 3 === 0 ? 'ordinary' : 'small');
    }
    // Advance the destruction lifecycle to the requested evidence time first. Persistent beams
    // deliberately time out without receipts after 140 ms, so create/refresh the dense-combat beam
    // after that advance and commit a single frame. This preserves the true explosion phase while
    // proving the connected beam remains readable under the resulting particle load.
    window.__sfFreezeCombatVfx?.(holdMs);
    const spatial = window.__sfCombatSpatialContract;
    const beamReceipt = {
      weaponId: 'wpn_beam_laser_m',
      ownerId: spatial.source.entityId,
      hardpointIdx: spatial.source.hardpointIdx,
      beamKey: 'capture-dense-beam',
      continuous: true,
      phase: 'update',
      origin: spatial.source.muzzle,
      from: spatial.source.muzzle,
      to: spatial.target.contact,
      dir: spatial.source.forward,
    };
    vfx._onFire(beamReceipt);
    vfx._onDamage({
      weaponId: beamReceipt.weaponId,
      attackerId: spatial.source.entityId,
      targetId: 'capture-target',
      pos: spatial.target.contact,
      approach: spatial.source.forward,
      normal: { x: -spatial.source.forward.x, z: -spatial.source.forward.z },
      hullHit: true,
      amount: 5,
    });
    window.__sfFreezeCombatVfx?.(8);
  }, { px: x, pz: z, holdMs: freezeMs });
}

async function advanceCombatMotion(targetPage, durationMs, { family, stage }) {
  await targetPage.evaluate(({ duration, familyId, stageId }) => new Promise((resolve) => {
    const vfx = window.SF.registry.get('vfx');
    const projectile = window.__sfCombatProjectileVisual;
    const entity = window.__sfCombatProjectileEntity;
    const profile = window.__sfCombatProjectileProfile;
    const scratch = window.__sfCombatProjectilePlanScratch;
    const buildPlan = window.__sfCombatBuildProjectilePlan;
    const beamReceipt = window.__sfCombatBeamMotionReceipt;
    const started = performance.now();
    let previous = started;
    let trailCadence = 0;
    let beamCadence = 0;

    const frame = (now) => {
      const elapsed = now - started;
      const dt = Math.max(0, Math.min(1 / 30, (now - previous) / 1000));
      previous = now;

      if (stageId === 'flight' && projectile && entity) {
        // Move along the same authoritative source-to-contact segment shown in the evidence
        // overlay. The rate retains family identity while bounding every body before the hull so
        // consecutive frames can prove coherent forward travel instead of an offscreen teleport.
        const path = entity.data?.acceptancePath;
        const progressRate = familyId === 'rail' ? 3.0
          : familyId === 'kinetic' ? 1.7
            : familyId === 'plasma' ? 1.6
              : familyId === 'missile' ? 1.35 : 1.5;
        if (path) {
          path.progress = Math.min(0.92, path.progress + dt * progressRate);
          entity.pos.x = path.start.x + (path.end.x - path.start.x) * path.progress;
          entity.pos.z = path.start.z + (path.end.z - path.start.z) * path.progress;
        }
        const local = vfx._toLocalXZ(entity.pos.x, entity.pos.z, { x: 0, z: 0 });
        projectile.position.x = local.x;
        projectile.position.z = local.z;
        trailCadence += dt;
        if (trailCadence >= (familyId === 'missile' ? 0.055 : 0.04) && profile && scratch && buildPlan) {
          trailCadence = 0;
          const plan = buildPlan(profile, entity, 1, scratch);
          plan.emitSmoke = familyId === 'missile';
          vfx._executeProjectileTrailPlan(plan, vfx._projectileTrailDiag);
        }
      }

      if (stageId === 'flight' && beamReceipt) {
        beamCadence += dt;
        if (beamCadence >= 0.045) {
          beamCadence = 0;
          vfx._onFire(beamReceipt);
        }
      }

      vfx._t += dt;
      vfx._explosions?.update(dt, vfx._explosionEmitter);
      vfx._combatBeams?.update(vfx._t, vfx._combatBeamLocalizer, null);
      vfx._integrateParticles(dt);
      vfx._integrateSprites(dt);
      vfx._integrateTrailStreaks(dt);
      vfx._decayEventLights(dt);

      if (elapsed >= duration) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), { duration: durationMs, familyId: family, stageId: stage });
}

async function readGpuContract(targetPage) {
  return targetPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { available: false, vendor: null, renderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: debug
        ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
        : String(gl.getParameter(gl.VENDOR)),
      renderer: debug
        ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

async function installPq023CueObservers(targetPage) {
  await targetPage.evaluate(() => {
    window.__pq023H1CueEvents = [];
    const retain = (event, payload = {}) => {
      const row = {
        event,
        id: payload.id || null,
        sourceEvent: payload.sourceEvent || null,
        sourceReceiptId: payload.sourceReceiptId || null,
        subsystemId: payload.subsystemId || null,
        accessibilityText: payload.accessibilityText || null,
        reducedMotionMode: payload.reducedMotionMode || null,
        reducedFlashMode: payload.reducedFlashMode || null,
        tags: Array.isArray(payload.tags) ? [...payload.tags] : [],
        text: payload.text || null,
        shape: payload.shape || null,
        assertive: payload.assertive === true,
        reducedMotion: payload.reducedMotion === true,
        flashReduced: payload.flashReduced === true,
        reason: payload.reason || null,
      };
      window.__pq023H1CueEvents.push(row);
      if (window.__pq023H1CueEvents.length > 200) window.__pq023H1CueEvents.shift();
    };
    for (const event of [
      'presentation:cue',
      'presentation:caption',
      'presentation:cueApplied',
      'presentation:cueSuppressed',
    ]) window.SF.bus.on(event, (payload) => retain(event, payload || {}));
  });
}

async function readPq023ImpactProfiles(targetPage) {
  return targetPage.evaluate(async () => {
    const { resolveImpactPresentationProfile } = await import('/src/render/vfxProfiles.js');
    const pick = (weaponId) => {
      const profile = resolveImpactPresentationProfile(weaponId);
      return {
        weaponId,
        family: profile.family,
        variant: profile.variant || null,
        mode: profile.mode,
        primaryShape: profile.primaryShape,
        fragmentCount: profile.fragmentCount,
        lightPeak: profile.lightPeak,
      };
    };
    return {
      autocannon: pick('wpn_autocannon_m'),
      flak: pick('wpn_flak_turret_s'),
    };
  });
}

async function capturePq023ImpactStrips(targetPage) {
  const waits = [16, 48, 96, 180];
  const specs = [
    { key: 'autocannon', weaponId: 'wpn_autocannon_m' },
    { key: 'flak', weaponId: 'wpn_flak_turret_s' },
  ];
  const frames = [];
  for (const spec of specs) {
    for (let index = 0; index < waits.length; index += 1) {
      const freezeMs = waits[index];
      const file = `pq023-impact-${spec.key}-${String(index + 1).padStart(2, '0')}.png`;
      await triggerImpact(targetPage, { weaponId: spec.weaponId, freezeMs });
      await capture(file, `${spec.key} impact temporal frame ${index + 1}`, {
        resume: false,
        receipt: { weaponId: spec.weaponId, authoredPhaseOffsetMs: freezeMs },
      });
      frames.push({ file, weaponId: spec.weaponId, authoredPhaseOffsetMs: freezeMs });
      await targetPage.waitForTimeout(80);
    }
  }
  await targetPage.evaluate(() => window.__sfResumeCombatVfx?.());
  return frames;
}

async function capturePq023WorldSiteSequences(targetPage) {
  await targetPage.evaluate(() => {
    window.__sfResetCombatVfx?.();
    window.__sfResumeCombatVfx?.();
    const state = window.SF.state;
    state.timeScale = Number(window.__sfCombatOriginalTimeScale) || 1;
    state.accumulator = 0;
    if (window.__sfCombatSpatialOverlay) window.__sfCombatSpatialOverlay.style.display = 'none';
    if (window.__sfCombatVfxCaptureTarget) window.__sfCombatVfxCaptureTarget.visible = false;
    window.SF.registry.get('world').enterSector('sector_ceres_belt', {
      fromJump: true,
      via: 'gate',
      fromSectorId: 'sector_helios_prime',
    });
  });

  await waitForPq023CathedralRoot(targetPage, 'failed');
  const approach = await approachPq023Cathedral(targetPage);
  const initial = await waitForPq023CathedralState(targetPage, 'failed');
  const framing = await framePq023Cathedral(targetPage);
  assert.ok(framing.subjectNdc
    && Math.abs(framing.subjectNdc.x) <= 0.9
    && Math.abs(framing.subjectNdc.y) <= 0.9,
  `Wreck Cathedral must be in frame, got ${JSON.stringify(framing.subjectNdc)}`);

  const transitions = [];
  const sequences = [];
  await setPq023Accessibility(targetPage, false);

  const recoveryNormal = await applyPq023CathedralRecovery(targetPage);
  assert.equal(recoveryNormal.ok, true, `normal recovery owner rejected: ${recoveryNormal.reason || 'unknown'}`);
  transitions.push({ kind: 'recovery', reduced: false, owner: recoveryNormal });
  await waitForPq023CathedralState(targetPage, 'stabilized');
  sequences.push(await capturePq023WorldSiteFrames(targetPage, {
    key: 'recovery-normal',
    expectedStatus: 'stabilized',
    reduced: false,
  }));

  const damageNormal = await applyPq023CathedralDamage(targetPage);
  assert.equal(damageNormal.status, 'failed', 'normal damage owner must fail the stabilized hull');
  transitions.push({ kind: 'damage', reduced: false, owner: damageNormal });
  await waitForPq023CathedralState(targetPage, 'failed');
  sequences.push(await capturePq023WorldSiteFrames(targetPage, {
    key: 'damage-normal',
    expectedStatus: 'failed',
    reduced: false,
  }));

  await setPq023Accessibility(targetPage, true);
  const recoveryReduced = await applyPq023CathedralRecovery(targetPage);
  assert.equal(recoveryReduced.ok, true, `reduced recovery owner rejected: ${recoveryReduced.reason || 'unknown'}`);
  transitions.push({ kind: 'recovery', reduced: true, owner: recoveryReduced });
  await waitForPq023CathedralState(targetPage, 'stabilized');
  sequences.push(await capturePq023WorldSiteFrames(targetPage, {
    key: 'recovery-reduced',
    expectedStatus: 'stabilized',
    reduced: true,
  }));

  const damageReduced = await applyPq023CathedralDamage(targetPage);
  assert.equal(damageReduced.status, 'failed', 'reduced damage owner must fail the stabilized hull');
  transitions.push({ kind: 'damage', reduced: true, owner: damageReduced });
  await waitForPq023CathedralState(targetPage, 'failed');
  const reducedDamage = await capturePq023WorldSiteFrames(targetPage, {
    key: 'damage-reduced',
    expectedStatus: 'failed',
    reduced: true,
  });
  sequences.push(reducedDamage);

  const reducedSignatures = reducedDamage.frames.map((frame) => JSON.stringify(
    frame.fixtures.map((fixture) => [fixture.id, fixture.opacity, fixture.scale]),
  ));
  assert.equal(new Set(reducedSignatures).size, 1,
    'reduced-motion/flash damaged fixtures must hold a steady non-motion state');

  const cueEvents = await targetPage.evaluate(() => (
    window.__pq023H1CueEvents || []
  ).filter((row) => String(row.id || '').startsWith('world_site.')));
  const worldSiteCueIds = cueEvents
    .filter((row) => row.event === 'presentation:cue')
    .map((row) => row.id);
  assert.deepEqual(worldSiteCueIds, [
    'world_site.recovery',
    'world_site.damage',
    'world_site.recovery',
    'world_site.damage',
  ]);

  const captions = cueEvents
    .filter((row) => row.event === 'presentation:caption')
    .map((row) => ({
      id: row.id,
      text: row.text,
      shape: row.shape,
      assertive: row.assertive,
      reducedMotion: row.reducedMotion,
      flashReduced: row.flashReduced,
    }));
  assert.deepEqual(captions.map((row) => row.shape), ['ring', 'bracket', 'ring', 'bracket']);
  assert.match(captions[0]?.text || '', /restored\.$/);
  assert.match(captions[1]?.text || '', /failed\.$/);

  return {
    route: 'New Game -> production world.enterSector(Ceres) -> asteroidSites owner receipts',
    initial,
    approach,
    framing,
    transitions,
    sequences,
    cueEvents,
    worldSiteCueIds,
    captions,
    reducedDamageSteady: true,
  };
}

async function setPq023Accessibility(targetPage, reduced) {
  await targetPage.evaluate(async (enabled) => {
    const { setPq023AccessibilityPreference } = await import('/scripts/lib/pq023Accessibility.mjs');
    const state = window.SF.state;
    setPq023AccessibilityPreference(state.settings, enabled);
    window.SF.bus.emit('settings:changed', { section: 'video', key: null });
    window.SF.bus.emit('settings:changed', { section: 'accessibility', key: null });
  }, !!reduced);
}

async function applyPq023CathedralRecovery(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    const system = sf.registry.get('asteroidSites');
    window.__pq023WorldSiteSequence = (window.__pq023WorldSiteSequence || 9000) + 1;
    const result = system.applyWorldSiteBeamOperation({
      siteId: 'world_site_wreck_cathedral',
      componentId: 'cathedral_hull',
      verb: 'repair',
      amount: 48,
      requestStreamId: 'player-industrial-beam',
      requestSequence: window.__pq023WorldSiteSequence,
      tick: sf.state.tick,
    });
    return {
      ok: result.ok === true,
      duplicate: result.duplicate === true,
      reason: result.reason || null,
      moved: result.moved || 0,
      operationId: result.operationId || null,
      stageId: result.record?.stageId || null,
      status: result.record?.components?.cathedral_hull?.status || null,
    };
  });
}

async function applyPq023CathedralDamage(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const component = state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && (entity.data?.worldSiteImpactComponentId === 'cathedral_hull'
        || entity.data?.worldSiteComponentId === 'cathedral_hull'));
    if (!component) throw new Error('Cathedral hull has no live impact-owned component entity');
    sf.bus.emit('physics:impact', {
      aId: state.playerId,
      bId: component.id,
      dp: 240,
      tick: state.tick,
    });
    const record = state.sites?.worldById?.world_site_wreck_cathedral;
    return {
      actorPolicy: 'player-contact',
      componentRole: component.data?.role || null,
      dp: 240,
      stageId: record?.stageId || null,
      status: record?.components?.cathedral_hull?.status || null,
    };
  });
}

async function waitForPq023CathedralRoot(targetPage, expectedStatus) {
  const handle = await targetPage.waitForFunction((status) => {
    const sf = window.SF;
    const record = sf?.state?.sites?.worldById?.world_site_wreck_cathedral;
    const root = sf?.state?.entityList?.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    if (record?.components?.cathedral_hull?.status !== status || !root?.pos) return false;
    return {
      rootId: root.id,
      status,
      stageId: record.stageId,
      presentationAdmission: root.presentationAdmission || null,
    };
  }, expectedStatus, { timeout: 30_000 });
  return handle.jsonValue();
}

async function waitForPq023CathedralState(targetPage, expectedStatus) {
  const handle = await targetPage.waitForFunction((status) => {
    const sf = window.SF;
    const record = sf?.state?.sites?.worldById?.world_site_wreck_cathedral;
    const root = sf?.state?.entityList?.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    const authored = String(root?.mesh?.userData?.authoredAssetState || '').startsWith('authored');
    if (record?.components?.cathedral_hull?.status !== status
      || root?.presentationAdmission !== 'ready'
      || !authored) return false;
    return {
      rootId: root.id,
      status,
      stageId: record.stageId,
      revision: record.revision,
      presentationAdmission: root.presentationAdmission,
      authoredAssetState: root.mesh.userData.authoredAssetState,
    };
  }, expectedStatus, { timeout: 120_000 });
  return handle.jsonValue();
}

async function approachPq023Cathedral(targetPage) {
  return targetPage.evaluate(async () => {
    const {
      findLivePq023CathedralRoot,
      pq023CathedralApproachPose,
    } = await import('/scripts/lib/pq023CathedralFraming.mjs');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = findLivePq023CathedralRoot(state);
    const pose = pq023CathedralApproachPose(target);
    if (!player || !target || !pose) throw new Error('Cathedral approach subject is unavailable');
    if (typeof player.pos.set === 'function') player.pos.set(pose.x, 0, pose.z);
    else { player.pos.x = pose.x; player.pos.z = pose.z; }
    player.prevPos?.copy?.(player.pos);
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    player.rot = 0;
    player.prevRot = 0;
    player.flags = { ...(player.flags || {}), noInterp: true };
    state.camera.zoom = pose.zoom;
    window.SF.bus.emit('camera:zoom', { level: pose.zoom });
    state.render?.cameraCtrl?.snapToPlayer?.();
    await new Promise((resolve) => setTimeout(resolve, 650));
    return {
      targetId: target.id,
      targetPos: { x: target.pos.x, z: target.pos.z },
      playerPos: { x: player.pos.x, z: player.pos.z },
      cameraZoom: state.camera.zoom,
    };
  });
}

async function framePq023Cathedral(targetPage) {
  return targetPage.evaluate(async () => {
    const {
      findLivePq023CathedralRoot,
      pq023CathedralApproachPose,
    } = await import('/scripts/lib/pq023CathedralFraming.mjs');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = findLivePq023CathedralRoot(state);
    const pose = pq023CathedralApproachPose(target);
    if (!player || !target?.mesh || !pose) throw new Error('Cathedral framing subject is unavailable');
    const camera = state.render?.cameraCtrl?.obj
      || state.render?.cameraCtrl?.camera
      || state.render?.camera;
    const project = () => {
      if (!camera || !window.SF.THREE || !target.mesh?.getWorldPosition) return null;
      const point = new window.SF.THREE.Vector3();
      target.mesh.getWorldPosition(point);
      point.project(camera);
      return { x: point.x, y: point.y };
    };
    const settle = async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    const { radius, zoom } = pose;
    const dir = { x: -0.94, z: -0.34 };
    let offset = radius * 1.7;
    let ndc = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const x = target.pos.x + dir.x * offset;
      const z = target.pos.z + dir.z * offset;
      if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
      else { player.pos.x = x; player.pos.z = z; }
      player.prevPos?.copy?.(player.pos);
      if (player.vel?.set) player.vel.set(0, 0, 0);
      else { player.vel.x = 0; player.vel.z = 0; }
      player.rot = 0;
      player.prevRot = 0;
      player.flags = { ...(player.flags || {}), noInterp: true };
      state.camera.zoom = zoom;
      window.SF.bus.emit('camera:zoom', { level: zoom });
      state.render?.cameraCtrl?.snapToPlayer?.();
      await settle(attempt === 0 ? 1200 : 450);
      ndc = project();
      if (!ndc || (Math.abs(ndc.x) <= 0.9 && Math.abs(ndc.y) <= 0.9)) break;
      offset *= 0.62;
    }
    await settle(650);
    return {
      targetId: target.id,
      targetPos: { x: target.pos.x, z: target.pos.z },
      playerPos: { x: player.pos.x, z: player.pos.z },
      subjectNdc: ndc,
      cameraZoom: state.camera.zoom,
      camera: 'normal gameplay chase camera',
    };
  });
}

async function capturePq023WorldSiteFrames(targetPage, { key, expectedStatus, reduced }) {
  const startMs = Date.now() - videoStartMs;
  const framing = await framePq023Cathedral(targetPage);
  assert.ok(framing.subjectNdc
    && Math.abs(framing.subjectNdc.x) <= 0.9
    && Math.abs(framing.subjectNdc.y) <= 0.9,
  `${key} replacement root could not be framed`);
  const frames = [];
  for (let index = 0; index < 3; index += 1) {
    await targetPage.waitForTimeout(180);
    const receipt = await readPq023WorldSiteFrame(targetPage);
    assert.equal(receipt.status, expectedStatus, `${key} frame ${index + 1} status drifted`);
    assert.equal(receipt.settings.motionReduce, reduced, `${key} frame ${index + 1} motion profile drifted`);
    assert.equal(receipt.settings.flashReduce, reduced, `${key} frame ${index + 1} flash profile drifted`);
    assert.ok(receipt.subjectNdc
      && Math.abs(receipt.subjectNdc.x) <= 0.9
      && Math.abs(receipt.subjectNdc.y) <= 0.9,
    `${key} frame ${index + 1} missed the Cathedral`);
    const file = `pq023-cathedral-${key}-${String(index + 1).padStart(2, '0')}.png`;
    await capture(file, `Wreck Cathedral ${key} motion frame ${index + 1}`, {
      receipt,
    });
    frames.push({ file, ...receipt });
  }
  motionSegments.push({
    scenario: `Wreck Cathedral ${key} motion`,
    startMs,
    endMs: Date.now() - videoStartMs,
  });
  return { key, expectedStatus, reduced, framing, frames };
}

async function readPq023WorldSiteFrame(targetPage) {
  return targetPage.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const record = state.sites?.worldById?.world_site_wreck_cathedral;
    const root = state.entityList.find((entity) => entity?.alive !== false
      && entity.data?.worldSiteId === 'world_site_wreck_cathedral'
      && entity.data?.role === 'world_site_root');
    const camera = state.render?.cameraCtrl?.obj
      || state.render?.cameraCtrl?.camera
      || state.render?.camera;
    let subjectNdc = null;
    if (camera && root?.mesh?.getWorldPosition && sf.THREE) {
      const point = new sf.THREE.Vector3();
      root.mesh.getWorldPosition(point);
      point.project(camera);
      subjectNdc = { x: point.x, y: point.y };
    }
    const fixtures = [];
    root?.mesh?.traverse?.((object) => {
      const id = object.userData?.worldSitePresentationFixtureId;
      if (!id || !object.material) return;
      fixtures.push({
        id,
        opacity: Number(object.material.opacity.toFixed(6)),
        scale: Number((object.parent?.scale?.x || 0).toFixed(6)),
        visible: object.visible !== false && object.parent?.visible !== false,
      });
    });
    fixtures.sort((a, b) => a.id.localeCompare(b.id));
    return {
      stageId: record?.stageId || null,
      status: record?.components?.cathedral_hull?.status || null,
      revision: record?.revision || null,
      rootId: root?.id || null,
      presentationAdmission: root?.presentationAdmission || null,
      authoredAssetState: root?.mesh?.userData?.authoredAssetState || null,
      subjectNdc,
      fixtures,
      settings: {
        motionReduce: !!state.settings?.video?.motionReduce,
        flashReduce: !!state.settings?.accessibility?.flashReduce,
      },
    };
  });
}

function buildPq023SemanticProjection({ impactProfiles, worldSite }) {
  const profile = (value) => ({
    weaponId: value.weaponId,
    family: value.family,
    variant: value.variant,
    mode: value.mode,
    primaryShape: value.primaryShape,
    fragmentCount: value.fragmentCount,
    lightPeak: value.lightPeak,
  });
  return {
    schema: 'spaceface.pq023-cue-semantic-projection.v1',
    impactProfiles: {
      autocannon: profile(impactProfiles.autocannon),
      flak: profile(impactProfiles.flak),
    },
    worldSiteCueIds: [...worldSite.worldSiteCueIds],
    captions: worldSite.captions.map((row) => ({ ...row })),
    transitions: worldSite.transitions.map((row) => ({
      kind: row.kind,
      reduced: row.reduced,
      status: row.owner.status,
      stageId: row.owner.stageId,
    })),
    reducedDamageSteady: worldSite.reducedDamageSteady === true,
  };
}

async function buildEvidenceSheets() {
  const sheetSpecs = PQ023_SMALL_DESTRUCTION_SALIENCE_ONLY ? [
    {
      output: 'pq023-small-final-sheet.png',
      tile: '5x2',
      sources: [
        ...Array.from({ length: 5 }, (_, index) => `06-small-${String(index + 1).padStart(2, '0')}.png`),
        'pq023-reduced-small-01.png',
        'pq023-reduced-small-02.png',
        'motion-reduced-small-01.png',
        'motion-reduced-small-02.png',
        'motion-reduced-small-03.png',
      ],
    },
    {
      output: 'pq023-dense-guard-sheet.png',
      tile: '4x1',
      sources: [
        'pq023-dense-representative.png',
        'motion-dense-destruction-01.png',
        'motion-dense-destruction-02.png',
        'motion-dense-destruction-03.png',
      ],
    },
  ] : PQ023_COMBAT_READABILITY_ONLY ? [
    {
      output: 'pq023-impact-temporal-sheet.png',
      tile: '4x2',
      sources: ['autocannon', 'flak'].flatMap((key) => (
        Array.from({ length: 4 }, (_, index) => `pq023-impact-${key}-${String(index + 1).padStart(2, '0')}.png`)
      )),
    },
    {
      output: 'pq023-small-reduced-sheet.png',
      tile: '5x2',
      sources: [
        ...Array.from({ length: 5 }, (_, index) => `06-small-${String(index + 1).padStart(2, '0')}.png`),
        'pq023-reduced-small-01.png',
        'pq023-reduced-small-02.png',
        'motion-reduced-small-01.png',
        'motion-reduced-small-02.png',
        'motion-reduced-small-03.png',
      ],
    },
    {
      output: 'pq023-dense-readability-sheet.png',
      tile: '4x1',
      sources: [
        'pq023-dense-representative.png',
        'motion-dense-destruction-01.png',
        'motion-dense-destruction-02.png',
        'motion-dense-destruction-03.png',
      ],
    },
  ] : [
    {
      output: 'explosion-temporal-sheet.png',
      tile: '6x3',
      sources: [
        ...Array.from({ length: 5 }, (_, index) => `06-small-${String(index + 1).padStart(2, '0')}.png`),
        ...Array.from({ length: 5 }, (_, index) => `07-ordinary-${String(index + 1).padStart(2, '0')}.png`),
        ...Array.from({ length: 6 }, (_, index) => `08-capital-${String(index + 1).padStart(2, '0')}.png`),
      ],
    },
    {
      output: 'impact-contact-sheet.png',
      tile: '2x5',
      sources: ['kinetic', 'rail', 'plasma', 'beam', 'missile']
        .flatMap((family, index) => [
          `${String(index + 1).padStart(2, '0')}-${family}-impact-contact.png`,
          `${String(index + 1).padStart(2, '0')}-${family}-impact-release.png`,
        ]),
    },
    {
      output: 'reduced-dense-sheet.png',
      tile: '5x2',
      sources: [
        '09-reduced-ordinary-01.png',
        '09-reduced-ordinary-02.png',
        '10-dense-destruction-01.png',
        '10-dense-destruction-02.png',
        'motion-reduced-ordinary-01.png',
        'motion-reduced-ordinary-02.png',
        'motion-reduced-ordinary-03.png',
        'motion-dense-destruction-01.png',
        'motion-dense-destruction-02.png',
        'motion-dense-destruction-03.png',
      ],
    },
  ];
  const receipts = [];
  for (const spec of sheetSpecs) {
    const sourcePaths = spec.sources.map((file) => path.join(OUT, file));
    for (const sourcePath of sourcePaths) {
      if (!existsSync(sourcePath)) throw new Error(`contact-sheet source is missing: ${sourcePath}`);
    }
    const outputPath = path.join(OUT, spec.output);
    const montage = spawnSync('magick', [
      'montage',
      '-label', '%t',
      ...sourcePaths,
      '-thumbnail', '440x275>',
      '-tile', spec.tile,
      '-geometry', '+8+24',
      '-background', '#070a0e',
      '-fill', '#e7eef6',
      '-font', 'Arial',
      '-pointsize', '14',
      outputPath,
    ], { cwd: ROOT, encoding: 'utf8' });
    if (montage.status !== 0 || !existsSync(outputPath)) {
      throw new Error(`ImageMagick contact-sheet build failed for ${spec.output}: ${montage.stderr || montage.stdout}`);
    }
    const bytes = await readFile(outputPath);
    receipts.push({
      path: outputPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sources: spec.sources,
      command: `magick montage -label %t <${spec.sources.length} sources> -tile ${spec.tile} ${spec.output}`,
    });
  }
  return receipts;
}

async function capture(file, scenario, options = {}) {
  const fullPath = path.join(OUT, file);
  await page.evaluate(() => window.__sfUpdateCombatSpatialOverlay?.());
  await page.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const runtime = await page.evaluate(() => {
    const vfx = window.SF.registry.get('vfx');
    const liveSprites = vfx ? Array.from(
      { length: vfx._liveSpriteCount || 0 },
      (_, index) => vfx._spr[vfx._activeSprites[index]],
    ).filter(Boolean) : [];
    const liveStreaks = vfx ? Array.from(
      { length: vfx._liveTrailStreakCount || 0 },
      (_, index) => vfx._ts[vfx._activeTrailStreaks[index]],
    ).filter(Boolean) : [];
    const streakIndex = vfx?._liveTrailStreakCount > 0 ? vfx._activeTrailStreaks[0] : -1;
    const spriteIndex = vfx?._liveSpriteCount > 0 ? vfx._activeSprites[0] : -1;
    const streak = streakIndex >= 0 ? vfx._ts[streakIndex] : null;
    const sprite = spriteIndex >= 0 ? vfx._spr[spriteIndex] : null;
    const beam = vfx?._combatBeams?._entries?.find((entry) => entry.active) || null;
    const projectile = window.__sfCombatProjectileVisual;
    const spatial = window.__sfCombatSpatialContract;
    return {
      particles: vfx?._liveCount || 0,
      sprites: vfx?._liveSpriteCount || 0,
      spriteKinds: liveSprites.map((row) => row.kind)
        .filter(Number.isFinite).sort((a, b) => a - b),
      trailStreaks: vfx?._liveTrailStreakCount || 0,
      combatBeams: vfx?._combatBeams?.activeCount || 0,
      maxFlashSize1: liveSprites.reduce((max, row) => (
        row.kind === 0 ? Math.max(max, Number(row.size1) || 0) : max
      ), 0),
      maxTrailLength: liveStreaks.reduce((max, row) => (
        Math.max(max, (Number(row.size0) || 0) * (Number(row.stretch) || 0))
      ), 0),
      beamVisible: !!vfx?._combatBeams?.group?.visible,
      projectileVisual: projectile ? {
        name: projectile.name,
        visible: projectile.visible !== false,
        meshNames: projectile.children.map((child) => child.name || child.type),
        worldPosition: window.__sfCombatProjectileEntity?.pos || null,
        path: window.__sfCombatProjectileEntity?.data?.acceptancePath || null,
      } : null,
      spatial: spatial ? {
        pathLength: spatial.pathLength,
        source: spatial.source.center,
        muzzle: spatial.source.muzzle,
        target: spatial.target.center,
        contact: spatial.target.contact,
        screen: spatial.screen,
      } : null,
      sampleBeam: beam ? {
        fromX: beam.fromX, fromZ: beam.fromZ, toX: beam.toX, toZ: beam.toZ,
        widthMul: beam.widthMul, age: vfx._t - beam.lastSeen,
      } : null,
      sampleTrail: streak ? {
        x: streak.x, z: streak.z, age: streak.age, life: streak.life,
        width: streak.size0 * 0.42, length: streak.size0 * streak.stretch,
      } : null,
      sampleSprite: sprite ? {
        x: sprite.x, z: sprite.z, age: sprite.age, life: sprite.life,
        size0: sprite.size0, size1: sprite.size1, kind: sprite.kind,
      } : null,
      settings: {
        motionReduce: !!window.SF.state.settings.video.motionReduce,
        flashReduce: !!window.SF.state.settings.accessibility.flashReduce,
        particleQuality: window.SF.state.settings.video.particleQuality || null,
      },
    };
  });
  captures.push({
    path: fullPath,
    sha256,
    scenario,
    camera: 'normal gameplay chase camera',
    settings: runtime.settings,
    videoTimeMs: Date.now() - videoStartMs,
    runtime,
    receipt: options.receipt || null,
  });
  if (options.resume !== false) await page.evaluate(() => window.__sfResumeCombatVfx?.());
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
}

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
