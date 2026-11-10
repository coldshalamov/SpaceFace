#!/usr/bin/env node
// ANI-01 live proof: fire a real scanner pulse and verify the Kestrel's MOTION_KESTREL_DISH rig
// lifts ~0.42 m, yaws, then parks back at rest — driven entirely by the authored motion bank and
// the source-gated bus wiring. Fails closed on missing rig, no lift, no yaw, or a bad park.
// Emits .devshots/ani01-dish-{rest,scan}.jpg as visual evidence.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { _electron: electron } = await loadPlaywright();

const BOOT_MS = Number(process.env.SF_ANI01_BOOT_MS) || 90_000;
const FLIGHT_MS = Number(process.env.SF_ANI01_FLIGHT_MS) || 120_000;
const SCAN_MS = Number(process.env.SF_ANI01_SCAN_MS) || 9_500;
const SAMPLE_MS = 90;
const MIN_LIFT_M = 0.25;
const MIN_YAW_RAD = 0.2;
const PARK_EPS = 0.06;

let app;
try {
  app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: BOOT_MS });
  const page = await app.firstWindow({ timeout: BOOT_MS });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: BOOT_MS });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: BOOT_MS });
  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    const p = s?.entities?.get(s.playerId);
    return s?.mode === 'flight' && p && p.alive !== false;
  }, null, { timeout: FLIGHT_MS });
  await page.waitForTimeout(1500);

  // Close the chase cam so the dish rig is readable in the evidence frames.
  await page.evaluate(() => { window.SF.bus.emit('camera:zoom', { level: 52 }); });
  await page.waitForTimeout(900);

  const rig = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    if (!player || !player.mesh) return { error: 'no player mesh' };
    const found = {};
    player.mesh.traverse((o) => {
      if (o.name === 'MOTION_KESTREL_DISH') found.dish = o;
      else if (o.name === 'MOTION_KESTREL_DISH_STEM') found.stem = o;
      else if (o.name === 'MOTION_KESTREL_DISH_FEED') found.feed = o;
    });
    let authoredRoot = null;
    player.mesh.traverse((o) => {
      if (!authoredRoot && o.userData && Array.isArray(o.userData.authoredMotionControllers)) authoredRoot = o;
    });
    return {
      dish: !!found.dish,
      stem: !!found.stem,
      feed: !!found.feed,
      hasDriver: typeof player.mesh.userData.updateAuthoredMotion === 'function',
      controllerCount: authoredRoot ? authoredRoot.userData.authoredMotionControllers.length : 0,
      restDish: found.dish ? found.dish.position.toArray() : null,
      restStem: found.stem ? found.stem.position.toArray() : null,
    };
  });
  if (rig.error) throw new Error(`ANI-01 probe: ${rig.error}`);
  console.log(`[ani01] rig dish=${rig.dish} stem=${rig.stem} feed=${rig.feed} boundaryDriver=${rig.hasDriver} controllers=${rig.controllerCount}`);
  if (!(rig.dish && rig.stem && rig.feed)) {
    throw new Error('ANI-01 probe: MOTION_KESTREL_DISH rig missing from player ship mesh');
  }
  if (!rig.hasDriver || rig.controllerCount < 1) {
    throw new Error('ANI-01 probe: no authored motion driver on the ship boundary');
  }

  await page.screenshot({ path: '.devshots/ani01-dish-rest.jpg', quality: 85, type: 'jpeg' });

  // Fire the real scanner input edge — KeyC is the shipped scanPulse binding. Writing
  // state.input.actions directly does not work (the input system recomputes edge flags
  // every frame), so this goes through a trusted key event like a player's finger would.
  const samples = [];
  const t0 = Date.now();
  await page.keyboard.press('KeyC');
  while (Date.now() - t0 < SCAN_MS) {
    const s = await page.evaluate(() => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      let dish = null;
      let stem = null;
      player.mesh.traverse((o) => {
        if (o.name === 'MOTION_KESTREL_DISH') dish = o;
        else if (o.name === 'MOTION_KESTREL_DISH_STEM') stem = o;
      });
      return {
        simTime: state.simTime,
        stemY: stem ? stem.position.y : null,
        dishYaw: dish ? Math.atan2(
          2 * (dish.quaternion.w * dish.quaternion.y + dish.quaternion.x * dish.quaternion.z),
          1 - 2 * (dish.quaternion.y * dish.quaternion.y + dish.quaternion.x * dish.quaternion.x),
        ) : null,
        ctrlState: null,
      };
    });
    samples.push(s);
    if (samples.length === 25) {
      await page.screenshot({ path: '.devshots/ani01-dish-scan.jpg', quality: 85, type: 'jpeg' });
    }
    // Second evidence frame at the yaw extreme (~2.5 s into the clip).
    if (samples.length === 35) {
      await page.screenshot({ path: '.devshots/ani01-dish-yaw.jpg', quality: 85, type: 'jpeg' });
    }
    await page.waitForTimeout(SAMPLE_MS);
  }

  const lifts = samples.map((s) => s.stemY).filter((v) => v != null);
  const yaws = samples.map((s) => Math.abs(s.dishYaw)).filter((v) => v != null);
  const peakLift = Math.max(...lifts.map((y) => y - rig.restStem[1]));
  const peakYaw = Math.max(...yaws);
  const endLift = Math.abs(lifts[lifts.length - 1] - rig.restStem[1]);
  const endYaw = Math.abs(samples[samples.length - 1].dishYaw || 0);

  const verdict = {
    ok: peakLift >= MIN_LIFT_M && peakYaw >= MIN_YAW_RAD && endLift <= PARK_EPS && endYaw <= 0.05,
    peakLift: Number(peakLift.toFixed(4)),
    peakYaw: Number(peakYaw.toFixed(4)),
    endLift: Number(endLift.toFixed(4)),
    endYaw: Number(endYaw.toFixed(4)),
    samples: samples.length,
    pageErrors: summarizeIssues(issues.errorIssues()),
  };
  console.log(JSON.stringify(verdict, null, 2));
  if (!verdict.ok) process.exitCode = 1;
} catch (error) {
  console.error('[ani01] probe failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
}
