#!/usr/bin/env node
// Live-route evidence for PQ-134.01 arcade structural VFX wiring.
// Boots the real browser route, starts a new game, and forces kill / hard-collision
// through the domain bus only. Screenshots and inspect() come from the same run.
//
// Usage: node scripts/probe-arcade-structural-fx.mjs [--out <dir>]

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT = path.resolve(arg('out', path.join(ROOT, '.devshots', 'graphics', 'arcade-structural-fx')));
const WIDTH = 1440;
const HEIGHT = 900;
const KILL_PNG = path.join(OUT, '01-kill.png');
const KILL_LATE_PNG = path.join(OUT, '01b-kill-late.png');
const COLLISION_PNG = path.join(OUT, '02-hard-collision.png');
const COLLISION_LATE_PNG = path.join(OUT, '02b-hard-collision-late.png');
// Blades live 0.16 s and arcs 0.20 s, so a 220 ms shot catches only the shards. The early shot is
// timed to the blade/arc envelope peak; the late shot keeps the shard-flight evidence.
const PEAK_MS = 45;
const LATE_MS = 200;
const INSPECT_JSON = path.join(OUT, 'inspect.json');

function findSystemBrowser() {
  return [
    process.env.SF_BROWSER_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find((c) => existsSync(c)) || null;
}

/** Read the live pool telemetry off the running game. Never reaches into the pool itself. */
async function readArcadeInspect(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const vfx = sf.registry && sf.registry.get && sf.registry.get('vfx');
    return vfx && typeof vfx.inspect === 'function' ? vfx.inspect().arcadeStructuralFx : null;
  });
}

function spawnedOf(inspect, kind) {
  if (!inspect || !inspect.pools || !inspect.pools[kind]) return null;
  return inspect.pools[kind].spawned;
}

/**
 * The whole point of this probe is to prove the MOUNT, so it must fail loudly rather than print
 * image paths over empty telemetry. Every condition here distinguishes "wired" from "unwired".
 */
function assertDelta(failures, label, before, after, kind, expect) {
  const b = spawnedOf(before, kind);
  const a = spawnedOf(after, kind);
  if (b === null || a === null) {
    failures.push(`${label}: ${kind} telemetry unavailable (inspect().arcadeStructuralFx was null) — the pool is not mounted`);
    return;
  }
  const delta = a - b;
  if (expect === 'positive' && delta <= 0) {
    failures.push(`${label}: expected ${kind} to spawn, delta was ${delta}`);
  }
  if (expect === 'zero' && delta !== 0) {
    failures.push(`${label}: expected ${kind} NOT to spawn, delta was ${delta}`);
  }
}

async function dismissTutorial(page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"], .dismiss, .close')];
    for (const node of nodes) {
      if (/skip|dismiss|close|got it/i.test(node.textContent || '')) {
        node.click();
      }
    }
  });
}

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required');
const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
});
const page = await context.newPage();
const issues = [];
const failures = [];
page.on('pageerror', (error) => issues.push(String(error?.message || error)));

try {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'Arcade Structural FX', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf && sf.state && sf.state.entities.get(sf.state.playerId);
    return sf.state.mode === 'flight' && player && player.mesh;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(600);

  const baselineInspect = await readArcadeInspect(page);

  await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const pos = {
      x: player.pos.x + 8,
      z: player.pos.z + 4,
    };
    sf.bus.emit('entity:killed', {
      id: 'probe-structural-victim',
      killerId: sf.state.playerId,
      type: 'ship',
      pos,
      radius: 8,
      victimClass: 'fighter',
      vel: { x: 14, z: 6 },
      targetVelocity: { x: 14, z: 6 },
      direction: { x: 1, z: 0.2 },
      presentation: {
        version: 1,
        cause: 'kinetic',
        position: pos,
        direction: { x: 1, z: 0.2 },
        targetVelocity: { x: 14, z: 6 },
      },
    });
  });
  await page.waitForTimeout(PEAK_MS);
  await page.screenshot({ path: KILL_PNG });
  await page.waitForTimeout(LATE_MS);
  await page.screenshot({ path: KILL_LATE_PNG });
  const killInspect = await readArcadeInspect(page);

  await page.evaluate(() => {
    const sf = window.SF;
    const player = sf.state.entities.get(sf.state.playerId);
    const pos = {
      x: player.pos.x + 6,
      z: player.pos.z - 3,
    };
    sf.bus.emit('combat:collisionConsequence', {
      schemaVersion: 1,
      tick: sf.state.tick,
      targetId: 'probe-structural-tumble',
      otherId: 'probe-structural-wall',
      surface: 'terrain',
      exchangedMomentum: 90,
      deltaV: 28,
      control: 'tumble',
      staggerTicks: 12,
      impactDamage: 8,
      debrisCount: 4,
      pos,
      normal: { x: 0.8, z: 0.6 },
    });
  });
  await page.waitForTimeout(PEAK_MS);
  await page.screenshot({ path: COLLISION_PNG });
  await page.waitForTimeout(LATE_MS);
  await page.screenshot({ path: COLLISION_LATE_PNG });
  const collisionInspect = await readArcadeInspect(page);

  await writeFile(INSPECT_JSON, JSON.stringify({
    baseline: baselineInspect,
    kill: killInspect,
    collision: collisionInspect,
    issues,
  }, null, 2));

  // entity:killed must produce all three primitive families; a hard collision adds arcs and shards
  // and deliberately no blades. Asserting the SHAPE (not tuned counts) keeps this honest without
  // pinning art direction.
  assertDelta(failures, 'entity:killed', baselineInspect, killInspect, 'blades', 'positive');
  assertDelta(failures, 'entity:killed', baselineInspect, killInspect, 'arcs', 'positive');
  assertDelta(failures, 'entity:killed', baselineInspect, killInspect, 'shards', 'positive');
  assertDelta(failures, 'collisionConsequence', killInspect, collisionInspect, 'blades', 'zero');
  assertDelta(failures, 'collisionConsequence', killInspect, collisionInspect, 'arcs', 'positive');
  assertDelta(failures, 'collisionConsequence', killInspect, collisionInspect, 'shards', 'positive');
  if (collisionInspect && collisionInspect.pools) {
    for (const kind of ['blades', 'arcs', 'shards']) {
      const pool = collisionInspect.pools[kind];
      if (pool.highWater > pool.capacity) {
        failures.push(`${kind} high-water ${pool.highWater} exceeded capacity ${pool.capacity}`);
      }
    }
  }
  if (issues.length) failures.push(`page errors during the run: ${issues.join(' | ')}`);
} finally {
  await context.close();
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close().catch(() => {});
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`arcade structural probe FAILED (${failures.length} check(s)); telemetry in ${INSPECT_JSON}`);
  process.exit(1);
}

console.log(KILL_PNG);
console.log(KILL_LATE_PNG);
console.log(COLLISION_PNG);
console.log(COLLISION_LATE_PNG);
console.log(INSPECT_JSON);
process.exit(0);
