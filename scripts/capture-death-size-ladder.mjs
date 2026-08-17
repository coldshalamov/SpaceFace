#!/usr/bin/env node
// Plan31 public-route evidence for the real Combat kill -> phased VFX size ladder. Each frame
// starts from New Game, spawns a production enemy definition, and lets Combat publish the lethal
// receipt. This script never calls the VFX emitter or fabricates an entity:killed event.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'plan31-death-size-ladder-live');
const REPORT = path.join(OUT, 'report.json');
const SOURCE_FILES = Object.freeze([
  'scripts/capture-death-size-ladder.mjs',
  'src/systems/combat.js',
  'src/render/vfx.js',
  'test/arcade-core-death-size-ladder.test.mjs',
]);
// Each tier is killed once and photographed at several moments of its own death so the ladder
// reads as TIMELINES, not single instants (a lone frame can always land in a between-pulse valley
// or a late fade and prove nothing about cadence). Live route runs the kinetic cause schedule,
// so frame times are fractions of each tier's real kinetic duration: small 0.72*0.78 s,
// ordinary 0.72 s, capital 0.72*1.65 s for both heavy and capital (shared clock, different
// radius). Frames trigger on the resident's own age, not wall time, because each screenshot
// round-trip costs 150-250 ms and would otherwise overrun the small tiers' whole death.
const KINETIC_CLASS_DURATION = Object.freeze({ small: 0.72 * 0.78, ordinary: 0.72, capital: 0.72 * 1.65 });
const AGE_FRACTIONS = Object.freeze([0.12, 0.35, 0.6, 0.85]);
const CASES = Object.freeze([
  { tier: 'light', enemyTypeId: 'dart_swarmer', level: 2, classId: 'small', radius: 8,
    file: '01-light-real-kill' },
  { tier: 'medium', enemyTypeId: 'marauder_brawler', level: 4, classId: 'ordinary', radius: 18,
    file: '02-medium-real-kill' },
  { tier: 'heavy', enemyTypeId: 'heavy_gunship', level: 7, classId: 'capital', radius: 31,
    file: '03-heavy-real-kill' },
  { tier: 'capital', enemyTypeId: 'dreadnought_boss', level: 10, classId: 'capital', radius: 60,
    file: '04-capital-real-kill' },
]);
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

assert.ok(executablePath, 'Chrome or Edge is required for the Plan31 capture');
await mkdir(OUT, { recursive: true });
const sourceCandidateSha256 = sha256(execFileSync('git', ['diff', '--', ...SOURCE_FILES], { cwd: ROOT }));
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const captures = [];

try {
  for (let index = 0; index < CASES.length; index++) {
    const captureCase = CASES[index];
    const page = await context.newPage();
    const issues = collectPageIssues(page);
    try {
      await page.addInitScript(() => {
        try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignored */ }
      });
      await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry),
        null, { timeout: 45_000 });
      await page.evaluate((seed) => window.SF.bus.emit('game:new', { name: 'Plan31 Death Ladder', seed }), 3100 + index);
      await page.waitForFunction(() => {
        const sf = window.SF;
        const player = sf?.state?.entities?.get(sf.state.playerId);
        return sf?.state?.mode === 'flight' && player?.alive !== false && player?.mesh
          && !!sf?.registry?.get?.('combat') && !!sf?.registry?.get?.('vfx')?._explosions;
      }, null, { timeout: 90_000 });
      await page.waitForTimeout(700);

      const setup = await page.evaluate(async ({ enemyTypeId, level }) => {
        const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
        const sf = window.SF;
        const state = sf.state;
        const player = state.entities.get(state.playerId);
        const capture = { kill: null, defaultZoom: state.camera.zoom };
        window.__SF_PLAN31_CAPTURE__ = capture;
        sf.bus.on('entity:killed', (payload) => {
          if (payload?.id === window.__SF_PLAN31_CAPTURE__.enemyId) {
            window.__SF_PLAN31_CAPTURE__.kill = JSON.parse(JSON.stringify(payload));
          }
        });
        const spec = makeEnemySpawnSpec(enemyTypeId, level, {
          x: player.pos.x + 95,
          z: player.pos.z + 12,
        }, { engagementTrigger: 'plan31_live_death_ladder_capture' });
        const enemy = sf.helpers.spawnEntity(spec);
        capture.enemyId = enemy.id;
        capture.spawnRadius = enemy.radius;
        capture.spawnClass = enemy.data?.shipClass || null;
        capture.enemyTypeId = enemy.data?.lootTableId || null;
        return capture;
      }, captureCase);

      await page.waitForFunction((enemyId) => {
        const enemy = window.SF.state.entities.get(enemyId);
        return enemy?.mesh && enemy.mesh.visible !== false;
      }, setup.enemyId, { timeout: 60_000 });

      await page.evaluate((enemyId) => {
        const sf = window.SF;
        const enemy = sf.state.entities.get(enemyId);
        const player = sf.state.entities.get(sf.state.playerId);
        sf.registry.get('combat').kill(enemy, player.id, {
          origin: { kind: 'weapon', id: 'wpn_autocannon_m' },
          packet: {
            source: { kind: 'weapon', weaponId: 'wpn_autocannon_m' },
            hit: {
              pos: { x: enemy.pos.x, z: enemy.pos.z },
              approach: { x: 1, z: 0 },
              normal: { x: -1, z: 0 },
            },
          },
        });
      }, setup.enemyId);
      await page.waitForFunction(() => !!window.__SF_PLAN31_CAPTURE__?.kill, null, { timeout: 10_000 });
      const killTime = Date.now();
      const tierDuration = KINETIC_CLASS_DURATION[captureCase.classId];
      for (let timeIndex = 0; timeIndex < AGE_FRACTIONS.length; timeIndex++) {
        // Lead the target by ~120 ms of evaluate/screenshot round-trip so the frame lands near
        // the intended age rather than past it. First frame of the small tier fires immediately.
        const targetAge = AGE_FRACTIONS[timeIndex] * tierDuration - 0.12;
        await page.waitForFunction((threshold) => {
          const sf = window.SF;
          const vfx = sf.registry.get('vfx');
          const cap = window.__SF_PLAN31_CAPTURE__;
          const resident = vfx._explosions.entries.find((entry) => entry.active
            && Math.abs(entry.x - cap.kill.pos.x) < 0.01
            && Math.abs(entry.z - cap.kill.pos.z) < 0.01);
          return !resident || resident.age >= threshold;
        }, targetAge, { timeout: 10_000, pollingInterval: 20 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

        const receipt = await page.evaluate(({ expectedClassId, enemyId }) => {
          const sf = window.SF;
          const vfx = sf.registry.get('vfx');
          const kill = window.__SF_PLAN31_CAPTURE__.kill;
          const resident = vfx._explosions.entries.find((entry) => entry.active
            && entry.classId === expectedClassId
            && Math.abs(entry.x - kill.pos.x) < 0.01
            && Math.abs(entry.z - kill.pos.z) < 0.01);
          const screen = sf.helpers.worldToScreen({ x: kill.pos.x, y: 0, z: kill.pos.z });
          // Deterministic pool dump: what did this kill actually put in the streak/sprite pools,
          // in world units? Answers whether size reaches the render path independent of eyeballs.
          const near = (x, z) => Math.abs(x - kill.pos.x) < 90 && Math.abs(z - kill.pos.z) < 90;
          const streaks = [];
          for (const t of vfx._ts || []) {
            if (!t.alive || !near(t.x, t.z)) continue;
            streaks.push({
              width: +(0.42 * t.size0).toFixed(2),
              length: +(t.size0 * (t.stretch || 1)).toFixed(1),
              age: +t.age.toFixed(2), life: +t.life.toFixed(2),
            });
            if (streaks.length >= 12) break;
          }
          const sprites = [];
          for (const s of vfx._spr || []) {
            if (!s.alive || !near(s.x, s.z)) continue;
            sprites.push({
              kind: s.kind, size0: +s.size0.toFixed(1), size1: +s.size1.toFixed(1),
              age: +s.age.toFixed(2), life: +s.life.toFixed(2), op0: +s.op0.toFixed(2),
            });
            if (sprites.length >= 12) break;
          }
          return {
            routeMode: sf.state.mode,
            cameraZoom: sf.state.camera.zoom,
            defaultCameraZoom: window.__SF_PLAN31_CAPTURE__.defaultZoom,
            enemyId,
            enemyTypeId: window.__SF_PLAN31_CAPTURE__.enemyTypeId,
            kill,
            resident: resident ? {
              classId: resident.classId,
              radius: resident.radius,
              age: resident.age,
              phaseIndex: resident.phaseIndex,
            } : null,
            screen,
            streaks,
            sprites,
            activeExplosionCount: vfx._explosions.activeCount,
          };
        }, { expectedClassId: captureCase.classId, enemyId: setup.enemyId });

        const imagePath = path.join(OUT, `${captureCase.file}-t${timeIndex + 1}.png`);
        const png = await page.screenshot({ path: imagePath, type: 'png' });
        captures.push({
          ...captureCase,
          timeIndex,
          ageFraction: AGE_FRACTIONS[timeIndex],
          wallMsSinceKill: Date.now() - killTime,
          setup,
          receipt,
          path: path.relative(ROOT, imagePath).replaceAll('\\', '/'),
          sha256: sha256(png),
          issues: summarizeIssues(issues.issues),
        });
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  const report = {
    schema: 'spaceface.plan31.deathSizeLadderCapture.v1',
    route: 'root -> game:new -> production makeEnemySpawnSpec -> Combat.kill -> entity:killed -> production phased VFX -> shipped chase camera',
    cameraPolicy: 'fresh-run default chase camera and zoom for all four tiers',
    sourceCandidateSha256,
    captures,
    ok: captures.length === CASES.length * AGE_FRACTIONS.length && captures.every((capture) => {
      // Late frames may legitimately catch the site after the resident finished (residue puffs
      // and physical wreck outlive it); only early/mid frames must still hold the live resident.
      const residentRequired = capture.ageFraction <= 0.6;
      return capture.issues.length === 0
        && capture.setup.spawnRadius === capture.radius
        && capture.setup.spawnClass === capture.receipt.kill.victimClass
        && capture.receipt.kill.radius === capture.radius
        && (!residentRequired || (capture.receipt.resident?.classId === capture.classId
          && capture.receipt.resident?.radius === capture.radius))
        && capture.receipt.screen.onScreen
        && capture.receipt.cameraZoom === capture.receipt.defaultCameraZoom;
    }),
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'all four real kills must preserve the public route, footprint and size cadence');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
