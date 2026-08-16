#!/usr/bin/env node
// Canonical root -> New Game -> Launch captures for Plan 15's remaining world tells. The observer
// stages actors inside the shipped default camera, then waits on the real mine/field/physics,
// Weapons/Physics interception, or Combat repair receipt before capturing.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan15-specialist-world-tells');
const SOURCE_FILES = [
  'src/systems/mines.js',
  'src/systems/encounterScripts.js',
  'src/render/specialistWorldTells.js',
  'src/render/vfx.js',
  'src/audio/audioSystem.js',
  'src/data/specialistFamily.js',
  'src/data/enemies.js',
  'test/mine-layer.test.mjs',
  'test/specialist-world-tells.test.mjs',
  'test/specialist-family-contract.test.mjs',
  'scripts/capture-specialist-world-tells.mjs',
];
const SCENARIOS = [
  { id: 'jackal_repulsed_wake', file: '01-jackal-repulsed-wake-default-camera.png' },
  { id: 'pd_physical_intercept', file: '02-pd-physical-intercept-default-camera.png' },
  { id: 'tender_green_weld', file: '03-tender-green-weld-default-camera.png' },
];
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyIds = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((id) => id.trim()).filter(Boolean))
  : null;
const selectedScenarios = onlyIds ? SCENARIOS.filter((scenario) => onlyIds.has(scenario.id)) : SCENARIOS;
assert.ok(selectedScenarios.length > 0, '--only must name at least one known specialist capture');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

assert.ok(browserPath, 'Chrome or Edge is required');
await mkdir(OUT, { recursive: true });
const sourceDiff = execFileSync('git', ['diff', '--', ...SOURCE_FILES], { cwd: ROOT });
const sourceCandidateSha256 = sha256(sourceDiff);
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const captures = [];

async function launchCanonicalPage() {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.alive !== false && player?.mesh?.visible !== false;
  }, null, { timeout: 120_000 });
  return { page, pageErrors };
}

async function stageJackalWake(page) {
  await page.evaluate(async () => {
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const witness = {
      defaultCameraZoom: state.camera.zoom,
      mineIds: [],
      before: {},
      repulsor: null,
      placed: [],
    };
    window.__SF_SPECIALIST_CAPTURE__ = witness;
    window.SF.bus.on('fields:deployed', (payload) => {
      if (payload?.kind === 'repulsor') witness.repulsor = JSON.parse(JSON.stringify(payload));
    });
    window.SF.bus.on('mines:placed', (payload) => witness.placed.push(JSON.parse(JSON.stringify(payload))));
    const jackal = window.SF.helpers.spawnEntity(makeEnemySpawnSpec('mine_layer_jackal', 5, {
      x: player.pos.x + 142,
      z: player.pos.z + 22,
    }, { engagementTrigger: 'plan15_canonical_visual_capture' }));
    witness.jackalId = jackal.id;
    const offsets = [[48, -46], [70, 0], [92, 46]];
    for (let index = 0; index < offsets.length; index++) {
      const [x, z] = offsets[index];
      const mine = window.SF.helpers.placeMine({
        ownerId: jackal.id,
        pos: { x: player.pos.x + x, z: player.pos.z + z },
        vel: { x: -4 - index, z: index - 1 },
        team: jackal.team,
        factionId: jackal.factionId,
        armDelayS: 20,
        mineLayerWake: true,
        telegraph: index === 0,
      });
      witness.mineIds.push(mine.id);
      witness.before[mine.id] = { x: mine.pos.x, z: mine.pos.z, vx: mine.vel.x, vz: mine.vel.z };
    }
    // Ask the shipped renderer owner to queue then fully drain these post-launch boundaries before
    // the screenshot; this does not construct a capture-only visual and keeps the exact ordinary
    // mine factory admission. Live play retains its normal bounded drain.
    const renderOwner = window.SF.registry.get('render');
    renderOwner?.reconcileMeshes?.();
    renderOwner?._drainMeshBuildQueue?.(Infinity);
  });
  // Use the shipped input owner; directly toggling the action bag races input's per-frame edge map.
  // A fresh headed page can briefly retain focus on the launch button, so retry the same physical
  // key only when the deployed receipt proves the first edge was not observed.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.down('Digit6');
    await page.waitForTimeout(180);
    await page.keyboard.up('Digit6');
    await page.waitForTimeout(120);
    if (await page.evaluate(() => !!window.__SF_SPECIALIST_CAPTURE__?.repulsor)) break;
  }
  try {
    await page.waitForFunction(() => {
      const witness = window.__SF_SPECIALIST_CAPTURE__;
      if (!witness?.repulsor || witness.mineIds.length !== 3) return false;
      return witness.mineIds.every((id) => {
        const mine = window.SF.state.entities.get(id);
        const mesh = mine?.mesh || window.SF.state.render?.meshes?.get?.(id);
        return mine?.alive !== false && mine.physicsBody?.dynamic === true
          && mesh?.visible !== false && mesh?.userData?.visualLanguage === 'armored-proximity-mine'
          && mine.vel.x > 0 && mine.pos.x > witness.before[id].x;
      });
    }, null, { timeout: 20_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const witness = window.__SF_SPECIALIST_CAPTURE__;
      const state = window.SF.state;
      return {
        tick: state.tick,
        witness,
        specialist: window.SF.registry.get('vfx')?.inspect?.().specialistWorldTells,
        mines: witness?.mineIds?.map((id) => {
          const mine = state.entities.get(id);
          const mesh = mine?.mesh || state.render?.meshes?.get?.(id);
          return { id, alive: mine?.alive, pos: mine?.pos, vel: mine?.vel,
            dynamic: mine?.physicsBody?.dynamic, wake: mine?.data?.mineLayerWake,
            mesh: mesh?.userData?.visualLanguage || null };
        }),
      };
    });
    throw new Error(`Jackal capture did not reach displaced visible mines: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  // Let the deployment flash settle while the still-live physics velocity rails remain rooted on
  // each displaced mine. This keeps the captured read on the mine path rather than the field pulse.
  await page.waitForTimeout(420);
}

async function stagePdIntercept(page) {
  await page.evaluate(async () => {
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const { WEAPONS } = await import('/src/data/weapons.js');
    const { bindPdInterceptorProjectile } = await import('/src/combat/projectileInterception.js');
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const witness = { defaultCameraZoom: state.camera.zoom, receipt: null, fires: [] };
    window.__SF_SPECIALIST_CAPTURE__ = witness;
    const ward = window.SF.helpers.spawnEntity(makeEnemySpawnSpec('reaver_pirate', 4, {
      x: player.pos.x + 180,
      z: player.pos.z,
    }, {
      zoneId: 'zone_plan15_pd_capture', motive: 'assigned_interdiction',
      engagementTrigger: 'authorized_hostile_spawn',
    }));
    const pd = window.SF.helpers.spawnEntity(makeEnemySpawnSpec('pd_screen_escort', 5, {
      x: player.pos.x + 120,
      z: player.pos.z,
    }, {
      zoneId: 'zone_plan15_pd_capture', motive: 'assigned_interdiction',
      engagementTrigger: 'authorized_hostile_spawn',
    }));
    const squadId = `plan15-pd-capture-${state.tick}`;
    ward.data.ai.squadId = squadId;
    ward.data.ai.encounterRole = 'leader';
    ward.data.ai.passive = true;
    if (ward.vel?.set) ward.vel.set(0, 0, 0);
    else { ward.vel.x = 0; ward.vel.z = 0; }
    pd.data.ai.squadId = squadId;
    pd.data.ai.escortTargetId = ward.id;
    pd.data.ai.forcePlayerTarget = false;
    pd.data.ai.roe = 'hold_fire';
    pd.data.ai.passive = true;
    pd.data.ai.pirateDisengaged = false;
    pd.data.ai.sanctuaryWithdrawn = false;
    pd.data.ai.activity = {
      kind: 'screen', targetId: ward.id, reason: 'plan15_visual_capture',
      anchor: { x: pd.pos.x, z: pd.pos.z }, leashRadius: 2600, startedTick: state.tick,
    };
    witness.wardId = ward.id;
    witness.pdId = pd.id;
    window.SF.bus.on('combat:fire', (payload) => {
      if (payload?.ownerId === pd.id) witness.fires.push(JSON.parse(JSON.stringify(payload)));
    });
    window.SF.bus.on('combat:projectileIntercepted', (payload) => {
      if (payload?.shooterId !== pd.id || payload?.defenderId !== ward.id || witness.receipt) return;
      witness.receipt = JSON.parse(JSON.stringify(payload));
    });
    const missile = WEAPONS.find((row) => row.id === 'wpn_missile_rack_m');
    const incomingRuntime = {
      ...missile, defId: missile.id, slotIndex: 90, facing: 'front', facingAngle: 0,
      gimbalArc: Math.PI, muzzleOffset: [0.8, 0], _cooldown: 0, _heat: 0,
    };
    const angle = Math.atan2(ward.pos.z - player.pos.z, ward.pos.x - player.pos.x);
    player.rot = angle;
    const incoming = window.SF.registry.get('weapons')._spawnProjectile(
      player, incomingRuntime, missile, angle, ward, true, state,
    );
    witness.incomingId = incoming.id;
    const flak = WEAPONS.find((row) => row.id === 'wpn_flak_turret_s');
    const interceptorRuntime = {
      ...flak, defId: flak.id, slotIndex: 91, facing: 'turret', facingAngle: 0,
      gimbalArc: Math.PI, muzzleOffset: [0.8, 0], _cooldown: 0, _heat: 0,
    };
    const interceptAngle = Math.atan2(incoming.pos.z - pd.pos.z, incoming.pos.x - pd.pos.x);
    pd.rot = interceptAngle;
    const interceptor = window.SF.registry.get('weapons')._spawnProjectile(
      pd, interceptorRuntime, flak, interceptAngle, incoming, false, state,
    );
    if (!bindPdInterceptorProjectile(interceptor, {
      defenderId: ward.id,
      sourceId: pd.id,
      sourcePartId: null,
      shooterId: pd.id,
      incomingId: incoming.id,
      assignedTick: state.tick,
    })) throw new Error('PD capture could not bind the production interceptor projectile');
    witness.interceptorId = interceptor.id;
  });
  try {
    await page.waitForFunction(() => {
      const witness = window.__SF_SPECIALIST_CAPTURE__;
      const tell = window.SF.registry.get('vfx')?.inspect?.().specialistWorldTells;
      return !!witness?.receipt && witness.receipt.incomingId === witness.incomingId
        && witness.receipt.interceptorId === witness.interceptorId
        && tell?.activePd > 0 && tell?.pdBladeInstances > 0;
    }, null, { timeout: 20_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const state = window.SF.state;
      const witness = window.__SF_SPECIALIST_CAPTURE__;
      const pd = state.entities.get(witness.pdId);
      const ward = state.entities.get(witness.wardId);
      const incoming = state.entities.get(witness.incomingId);
      return {
        witness,
        tick: state.tick,
        physics: state.physicsRuntime?.diagnostics,
        pd: pd && { alive: pd.alive, pos: pd.pos, intent: pd.data?.intent, ai: pd.data?.ai, runtime: pd.data?.pdScreenRuntime },
        ward: ward && { alive: ward.alive, pos: ward.pos },
        incoming: incoming && { alive: incoming.alive, pos: incoming.pos, vel: incoming.vel, data: incoming.data },
        projectiles: state.entityList.filter((entity) => entity?.type === 'projectile')
          .map((entity) => ({ id: entity.id, alive: entity.alive, ownerId: entity.ownerId, pos: entity.pos, data: entity.data })),
      };
    });
    throw new Error(`PD capture did not reach a physical intercept: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

async function stageTenderWeld(page) {
  await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const stagingX = player.pos.x + 3600;
    const stagingZ = player.pos.z + 2600;
    if (player.pos?.set) player.pos.set(stagingX, 0, stagingZ);
    else { player.pos.x = stagingX; player.pos.z = stagingZ; }
    player.prevPos?.copy?.(player.pos);
    if (player.vel?.set) player.vel.set(0, 0, 0);
    else { player.vel.x = 0; player.vel.z = 0; }
    state.render?.cameraCtrl?.snapToPlayer?.();
    const encounterId = `plan15-tender-capture-${state.tick}`;
    const witness = {
      defaultCameraZoom: state.camera.zoom,
      encounterId,
      request: null,
      receipt: null,
      damageReceipts: 0,
      targetId: null,
      droneId: null,
    };
    window.__SF_SPECIALIST_CAPTURE__ = witness;
    window.SF.bus.on('combat:hullRepaired', (payload) => {
      if (payload?.encounterId !== encounterId || witness.receipt) return;
      witness.receipt = JSON.parse(JSON.stringify(payload));
    });
    window.SF.bus.on('combat:damage', (payload) => {
      if (payload?.targetId === witness.targetId) witness.damageReceipts++;
    });
    const director = window.SF.registry.get('encounterDirector');
    witness.request = director.requestAuthoredEncounter({
      shapeId: 'specialist_repair_tender',
      encounterId,
      sectorId: state.world.currentSectorId,
      anchor: { x: player.pos.x + 120, z: player.pos.z + 20 },
      zoneType: 'derelict_field',
      zoneRadius: 260,
      force: true,
    });
    const timer = setInterval(() => {
      if (witness.receipt) { clearInterval(timer); return; }
      const live = state.encounterDirector?.live?.[encounterId];
      const repair = live?.data?.repairTender;
      const drone = repair?.droneIds?.length ? state.entities.get(repair.droneIds[0]) : null;
      const wing = (live?.ids || [])
        .map((id) => state.entities.get(id))
        .filter((entity) => entity?.alive !== false && entity.data?.ai?.encounterCompositionRole === 'light')
        .sort((left, right) => right.hullMax - left.hullMax)[0];
      if (!drone || !wing || live.phase !== 'conflict') return;
      witness.targetId = wing.id;
      witness.droneId = drone.id;
      if (wing.hull < wing.hullMax - 12) return;
      window.SF.registry.get('combat').ensureKernel().routeDamage({
        attackerId: player.id,
        targetId: wing.id,
        packet: {
          channels: { kinetic: 30, thermal: 0, ion: 0, plasma: 0, phase: 0 },
          penetration: 1,
          flags: {},
          source: { kind: 'weapon', id: 'plan15_visual_capture' },
        },
        origin: { kind: 'weapon', id: 'plan15_visual_capture' },
      });
    }, 50);
  });
  await page.waitForFunction(() => {
    const witness = window.__SF_SPECIALIST_CAPTURE__;
    const tell = window.SF.registry.get('vfx')?.inspect?.().specialistWorldTells;
    return witness?.request?.ok === true && witness?.receipt?.cue === 'green_weld_flashes'
      && witness.receipt.applied > 0 && witness.damageReceipts > 0
      && tell?.activeWeld > 0 && tell?.weldBarInstances > 0;
  }, null, { timeout: 35_000 });
}

async function collectReceipt(page, scenarioId) {
  return page.evaluate((id) => {
    const state = window.SF.state;
    const vfx = window.SF.registry.get('vfx');
    const group = state.render.scene.getObjectByName('Plan15SpecialistHardWorldTells');
    let spriteCount = 0;
    let pointCount = 0;
    let transparentMaterialCount = 0;
    group?.traverse?.((object) => {
      if (object.isSprite) spriteCount++;
      if (object.isPoints) pointCount++;
      if (object.material?.transparent === true) transparentMaterialCount++;
    });
    const witness = window.__SF_SPECIALIST_CAPTURE__;
    const mines = (witness.mineIds || []).map((mineId) => {
      const mine = state.entities.get(mineId);
      const mesh = mine?.mesh || state.render?.meshes?.get?.(mineId);
      const meshNames = [];
      mesh?.traverse?.((object) => { if (object.isMesh) meshNames.push(object.name || '(unnamed)'); });
      return {
        id: mineId,
        alive: mine?.alive !== false,
        dynamic: mine?.physicsBody?.dynamic === true,
        material: mine?.physicsBody?.material || null,
        pos: mine?.pos ? { x: mine.pos.x, z: mine.pos.z } : null,
        vel: mine?.vel ? { x: mine.vel.x, z: mine.vel.z } : null,
        before: witness.before?.[mineId] || null,
        visualLanguage: mesh?.userData?.visualLanguage || null,
        meshNames,
      };
    });
    return {
      scenarioId: id,
      routeMode: state.mode,
      cameraZoom: state.camera.zoom,
      defaultCameraZoom: witness.defaultCameraZoom,
      witness,
      specialistWorldTells: vfx?.inspect?.().specialistWorldTells || null,
      specialistSubsystem: vfx?.inspect?.().subsystems?.lastFrame?.specialistPresentation || 0,
      group: {
        drawSurfaces: group?.children?.length || 0,
        spriteCount,
        pointCount,
        transparentMaterialCount,
      },
      mines,
    };
  }, scenarioId);
}

try {
  for (const scenario of selectedScenarios) {
    const { page, pageErrors } = await launchCanonicalPage();
    try {
      if (scenario.id === 'jackal_repulsed_wake') await stageJackalWake(page);
      else if (scenario.id === 'pd_physical_intercept') await stagePdIntercept(page);
      else await stageTenderWeld(page);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      const receipt = await collectReceipt(page, scenario.id);
      const file = path.join(OUT, scenario.file);
      const png = await page.screenshot({ path: file, type: 'png', fullPage: false });
      captures.push({
        scenario: scenario.id,
        path: path.relative(ROOT, file).replaceAll('\\', '/'),
        sha256: sha256(png),
        receipt,
        pageErrors,
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  const sharedOk = captures.every((capture) => capture.pageErrors.length === 0
    && capture.receipt.routeMode === 'flight'
    && capture.receipt.cameraZoom === capture.receipt.defaultCameraZoom
    && capture.receipt.group.drawSurfaces === 6
    && capture.receipt.group.spriteCount === 0
    && capture.receipt.group.pointCount === 0
    && capture.receipt.group.transparentMaterialCount === 0);
  const report = {
    schema: 'spaceface.plan15SpecialistWorldTellCapture.v1',
    route: 'public root -> New Game -> Launch -> production owner events inside shipped default camera',
    cameraPolicy: 'shipped fresh-run default camera; actors staged locally; no zoom or camera override',
    acceptanceScope: 'integration-candidate component evidence only; no whole-asset or A-list claim',
    sourceCandidateSha256,
    selectedScenarios: selectedScenarios.map((scenario) => scenario.id),
    sourceFiles: SOURCE_FILES,
    captures,
    ok: sharedOk && captures.every((capture) => {
      if (capture.scenario === 'jackal_repulsed_wake') {
        return capture.receipt.witness.repulsor?.kind === 'repulsor'
          && capture.receipt.mines.length === 3
          && capture.receipt.specialistWorldTells.mineWakeVertices >= 24
          && capture.receipt.specialistWorldTells.mineWakeBladeInstances >= 9
          && capture.receipt.mines.every((mine) => mine.dynamic && mine.material === 'projectile'
            && mine.vel.x > 0 && mine.pos.x > mine.before.x
            && mine.visualLanguage === 'armored-proximity-mine');
      }
      if (capture.scenario === 'pd_physical_intercept') {
        return capture.receipt.witness.receipt?.incomingId === capture.receipt.witness.incomingId
          && capture.receipt.witness.receipt?.interceptorId === capture.receipt.witness.interceptorId
          && capture.receipt.specialistWorldTells.activePd > 0;
      }
      return capture.receipt.witness.receipt?.cue === 'green_weld_flashes'
        && capture.receipt.witness.receipt?.applied > 0
        && capture.receipt.witness.damageReceipts > 0
        && capture.receipt.specialistWorldTells.activeWeld > 0;
    }),
  };
  await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'all Plan 15 captures must preserve canonical routing and exact owner receipts');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
