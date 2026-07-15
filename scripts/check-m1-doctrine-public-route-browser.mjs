#!/usr/bin/env node
// M1.5 public-player-route acceptance.
//
// Canonical root -> New Game -> Launch -> F claim -> RMB mine -> dock/undock -> visible REFUSE
// -> ordinary helm counterplay. Runtime inspection is read-only and observers only append to the
// probe-owned window.__M1_DOCTRINE_ROUTE__ array. No game event is emitted and no game state,
// entity, position, mission, AI record, or scenario fact is assigned by this probe.

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'alpha', 'm1-doctrine-counterplay-public-route');
const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const ACTORS = Object.freeze([
  'scavenger_interceptor',
  'scavenger_harasser',
  'scavenger_thief',
]);
const OBSERVED_EVENTS = Object.freeze([
  'ai:telegraph',
  'ai:doctrinePhase',
  'combat:fire',
  'combat:damage',
  'combat:actionStarted',
  'tether:attached',
  'tether:broken',
  'scenario:safeOpeningDemand',
  'scenario:scavengerResponse',
]);

await mkdir(OUT_DIR, { recursive: true });
const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
let browser = null;
let context = null;
let page = null;

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--incognito', '--no-first-run', '--disable-extensions'],
  });
  context = await browser.newContext({ viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const issues = collectPageIssues(page, { includeWarnings: true, ignoreProbeWarnings: true });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', 'route must use the canonical root without debug flags');
  await bootNewGame(page);
  await installObservers(page);
  await screenshot(page, '01-authored-cold-open.png');

  const launch = await readSnapshot(page);
  assert.equal(launch.player.alive, true, 'normal Launch must leave the player alive');
  assert.equal(launch.storyBeatIndex, 0, 'route must start at the real first 47-A beat');
  assert.equal(launch.safeOpening.spindleClaimed, false, 'route must not begin with an injected claim');
  assert.deepEqual(
    launch.actors.map((actor) => ({ actorId: actor.actorId, team: actor.team, passive: actor.passive })),
    ACTORS.map((actorId) => ({ actorId, team: 0, passive: true })),
    'the three authored doctrine actors must begin neutral and dormant',
  );

  await claimSpindle(page);
  await screenshot(page, '02-spindle-claimed.png');
  // Let the public tether Focus lease finish easing out before the next ordinary aim gesture.
  // This keeps the proof honest: the marked rock must actually be visible, not merely nearby in world space.
  await page.waitForTimeout(2_000);
  await recoverB0Sample(page);
  await screenshot(page, '03-recovery-objective-complete.png');
  await deliverAtHelios(page);
  await screenshot(page, '04-first-delivery-docked.png');
  await undock(page);

  const harasserId = await actorEntityId(page, 'scavenger_harasser');
  await flyPublicMapCourseToEntity(page, harasserId, {
    timeoutMs: 150_000,
    stopWhen: 'demand',
  });
  await page.waitForFunction(() => {
    const safe = window.SF?.state?.scenario?.safeOpening;
    return !!(safe && Number.isFinite(safe.demandIssuedAt));
  }, null, { timeout: 15_000 });
  await page.locator('.sf-endgame__c-no').waitFor({ state: 'visible', timeout: 15_000 });
  await screenshot(page, '05-visible-refuse-demand.png');

  const beforeRefuse = await readSnapshot(page);
  await page.locator('.sf-endgame__c-no').click();
  await page.waitForFunction(() => window.SF?.state?.scenario?.safeOpening?.response === 'refuse', null, {
    timeout: 5_000,
  });
  const refused = await readSnapshot(page);
  assert.equal(round3(refused.safeOpening.noFireUntilS - refused.safeOpening.responseObservedAtS), 12,
    'visible REFUSE must author the exact twelve-second response window');

  // Keep ordinary helm authority alive during the protected window, but do not attack or mutate.
  await defensiveHelm(page, 11_600, 'KeyD');
  const protectedEvents = await readEvents(page);
  const actorIds = new Map(refused.actors.map((actor) => [actor.entityId, actor.actorId]));
  const earlyFire = protectedEvents.filter((event) => event.type === 'combat:fire'
    && actorIds.has(event.payload?.ownerId)
    && event.simTime < refused.safeOpening.noFireUntilS);
  assert.deepEqual(earlyFire, [], 'no authored doctrine actor may fire inside the exact REFUSE window');
  await screenshot(page, '06-exact-no-fire-window.png');

  const combat = await exerciseCounterplay(page, refused.safeOpening.noFireUntilS);
  const end = await readSnapshot(page);
  assert.equal(end.player.alive, true, 'player must survive the doctrine counterplay route');
  assert.equal(end.actors.every((actor) => actor.activated && actor.team === 1 && actor.passive === false), true,
    'all three named doctrine actors must activate after visible refusal');
  assert.ok(Math.max(...combat.samples.flatMap((sample) => sample.actors.map((actor) => actor.distance))) < 4_000,
    'the authored encounter must stay in a readable local combat frame');

  const phases = phasesByDoctrine(combat.phaseEvents);
  assertIncludes(phases.interceptor_flyby, ['engine_flare', 'strike'], 'interceptor readable run');
  assert.ok(phases.interceptor_flyby.includes('extend') || phases.interceptor_flyby.includes('reform'),
    `interceptor must visibly leave its strike instead of spin-fighting: ${phases.interceptor_flyby.join(', ')}`);
  assertIncludes(phases.ranged_disengager, ['charge_cue'], 'ranged readable charge');
  assert.ok(phases.ranged_disengager.includes('fire_window') || phases.ranged_disengager.includes('retreat'),
    `ranged ship must expose a fire/closing counter-window: ${phases.ranged_disengager.join(', ')}`);
  assertIncludes(phases.tether_control_raider, ['spool_cue', 'attach_window', 'escape'],
    'tether raider spool-and-denial counterplay');
  const physical = physicalDoctrineReceipts(combat);
  assert.equal(physical.interceptorFired, true, 'interceptor strike must produce a real weapon discharge');
  assert.equal(physical.interceptorExtended, true, 'interceptor must increase separation after its closest strike pass');
  assert.equal(physical.rangedFiredOrRetreated, true, 'ranged doctrine must fire or enter a player-forced retreat');
  assert.equal(physical.tetherAttempted, true, 'tether raider must start a real action_attach attempt');
  assert.equal(physical.tetherResolved, true, 'vector counterplay must deny the attach or produce attach/break receipts');
  assert.equal(end.playerTetheredByScavenger, false,
    'boost/vector response must leave the player free of the scavenger tether');

  const errorIssues = issues.errorIssues();
  assert.deepEqual(errorIssues, [], `canonical route produced runtime errors: ${JSON.stringify(errorIssues)}`);

  const artifacts = [
    '01-authored-cold-open.png',
    '02-spindle-claimed.png',
    '03-recovery-objective-complete.png',
    '04-first-delivery-docked.png',
    '05-visible-refuse-demand.png',
    '06-exact-no-fire-window.png',
    ...combat.screenshots,
    'route-report.json',
  ];
  const report = {
    schema: 'spaceface.m1DoctrinePublicRoute.v2',
    primaryAcceptance: true,
    route: {
      start: 'canonical root -> Main Menu -> New Game -> Launch',
      actions: [
        'F claim/latch/cut',
        'M/local-map search/select/Set Course autopilot',
        'RMB mine',
        'N/search/Set Waypoint autopilot',
        'E dock',
        'visible Undock',
        'visible REFUSE',
        'W/A/D/Shift counterplay',
      ],
      injectedState: false,
      emittedGameplayEvents: false,
    },
    beforeRefuse,
    refused,
    end,
    phases,
    physical,
    telegraphs: combat.telegraphs,
    samples: combat.samples,
    pageErrors: errorIssues,
    nonBlockingDiagnostics: [{
      id: 'dense-field-autopilot-avoidance-deadlock',
      observedRoute: 'visible local-map recovery-rock course',
      observed: { initialDistance: 556.85, distanceAfter25S: 512.67, status: 'avoiding' },
      disposition: 'lead-owned V3 obstacle filter now ignores explicitly non-colliding bodies; acceptance uses the visible local-map course',
    }],
  };
  await writeFile(path.join(OUT_DIR, 'route-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(OUT_DIR, 'evidence.json'), JSON.stringify({
    schema: 'spaceface.alphaEvidence.v1',
    taskId: 'm1-doctrine-counterplay-public-route',
    worktreeId: 'master',
    route: 'canonical root -> New Game -> F claim -> RMB recovery -> Helios delivery -> visible REFUSE -> helm counterplay',
    viewport: VIEWPORT,
    runtime: { kind: 'browser', gpu: 'canonical WebGL runtime' },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: true,
    checks: [
      { name: 'cold open neutral and dormant', status: 'pass' },
      { name: 'first delivery unlocks same-sector combat graduation', status: 'pass' },
      { name: 'visible REFUSE preserves exact twelve-second no-fire window', status: 'pass' },
      { name: 'interceptor tell, strike, and clean egress', status: 'pass' },
      { name: 'ranged charge and close-or-break-LOS window', status: 'pass' },
      { name: 'tether spool, denied attach, and escape', status: 'pass' },
      { name: 'player survives and remains untethered', status: 'pass' },
      { name: 'runtime errors absent', status: 'pass' },
    ],
    artifacts: artifacts.map((name) => ({
      kind: name.endsWith('.png') ? 'screenshot' : 'report',
      path: `.devshots/alpha/m1-doctrine-counterplay-public-route/${name}`,
    })),
    notes: [
      'Every gameplay action was a visible button click or ordinary keyboard/mouse input.',
      'Window.SF was used only for read-only observations and probe-owned event recording.',
      'No gameplay event, entity, mission, AI record, scenario fact, or position was injected.',
      'A visible-map course probe found a dense-field V3 avoidance deadlock caused by a non-colliding claimed payload; the lead repaired that obstacle filter, and this route exercises the same public course.',
    ],
  }, null, 2) + '\n');

  console.log(`M1 doctrine public route OK (${combat.phaseEvents.length} phase events, ${combat.telegraphs.length} telegraphs)`);
} finally {
  if (page) await releaseKeys(page).catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

async function bootNewGame(page) {
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.registry && window.SF?.bus), null, {
    timeout: 30_000,
  });
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) await page.keyboard.press('Space');
  await page.locator('[data-screen="mainMenu"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-screen="newGame"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    // Production enters flight only after authoredCriticalVisualReadiness(player + Helios) passes;
    // checking moving mesh handles again here races later HLOD/traffic swaps and is stricter than
    // the actual launch contract. Flight mode is therefore the authoritative completed gate.
    return state?.mode === 'flight' && player?.alive !== false && player?.hull > 0;
  }, null, { timeout: 120_000 });
  const begin = page.getByRole('button', { name: /begin/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.locator('#gl-canvas').focus();
}

async function installObservers(page) {
  await page.evaluate((names) => {
    if (window.__M1_DOCTRINE_ROUTE_INSTALLED__) return;
    window.__M1_DOCTRINE_ROUTE_INSTALLED__ = true;
    window.__M1_DOCTRINE_ROUTE__ = [];
    for (const type of names) {
      window.SF.bus.on(type, (payload) => {
        const record = {
          type,
          tick: window.SF.state.tick,
          simTime: window.SF.state.simTime,
          payload: payload && typeof payload === 'object' ? JSON.parse(JSON.stringify(payload)) : payload,
        };
        window.__M1_DOCTRINE_ROUTE__.push(record);
        if (window.__M1_DOCTRINE_ROUTE__.length > 800) window.__M1_DOCTRINE_ROUTE__.shift();
      });
    }
  }, OBSERVED_EVENTS.slice());
}

async function claimSpindle(page) {
  const spindleId = await page.evaluate(() => (window.SF.state.entityList || [])
    .find((entity) => entity?.data?.scenarioActorId === 'evidence_spindle_47a')?.id ?? null);
  assert.notEqual(spindleId, null, '47-A evidence spindle must exist in normal play');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await aimAt(page, spindleId);
    await page.keyboard.press('KeyF');
    const claimed = await page.waitForFunction(() => window.SF?.state?.scenario?.safeOpening?.spindleClaimed === true,
      null, { timeout: 3_000 }).then(() => true).catch(() => false);
    if (claimed) break;
  }
  assert.equal((await readSnapshot(page)).safeOpening.spindleClaimed, true,
    'ordinary F must claim the visible evidence spindle');
  // F is an edge toggle. Give the released latch edge one fixed-step before issuing the cut edge,
  // then prove RMB is no longer owned by throw-arm before attempting the mission beam.
  await page.waitForTimeout(220);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('KeyF');
    const cut = await page.waitForFunction(() => window.SF?.state?.player?.tether?.active !== true,
      null, { timeout: 2_000 }).then(() => true).catch(() => false);
    if (cut) return;
    await page.waitForTimeout(220);
  }
  assert.fail('ordinary F toggle must cut the evidence-spindle tether after the claim');
}

async function recoverB0Sample(page) {
  assert.equal(await page.evaluate(() => window.SF?.state?.player?.tether?.active === true), false,
    'B0 mining must begin after the public F cut has settled');
  const target = await page.evaluate(() => {
    const state = window.SF.state;
    const mission = (state.missions?.active || []).find((entry) => entry?.storyTag === 'campaign47a:b0:recovery');
    const wanted = mission?.params?.samplePos || state.nav?.waypoint?.pos || null;
    const player = state.entities.get(state.playerId);
    let best = null;
    let bestD = Infinity;
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || entity.type !== 'asteroid' || !entity.pos) continue;
      const origin = wanted || player.pos;
      const d = Math.hypot(entity.pos.x - origin.x, entity.pos.z - origin.z);
      if (d < bestD) { bestD = d; best = entity; }
    }
    return best ? { id: best.id, pos: { x: best.pos.x, z: best.pos.z } } : null;
  });
  assert(target, 'B0 must expose a live recovery asteroid');
  console.log(`[m1-doctrine-route] B0 fixture: ${JSON.stringify(await readB0Fixture(page, target.id))}`);
  await flyPublicMapCourseToEntity(page, target.id, { arrivalRadius: 70, timeoutMs: 180_000 });
  await latchMineableTarget(page, target.id);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await aimAt(page, target.id);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(500);
    const liveBeam = await page.evaluate((targetId) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(targetId);
      const mining = window.SF.registry.get('mining');
      return {
        targetId,
        targetAlive: target?.alive !== false,
        distance: target?.pos ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
        tetherActive: state.player?.tether?.active === true,
        fireGroup: state.input?.fireGroup ?? null,
        miningLockTargetId: mining?._lockTargetId ?? null,
        beaming: mining?._beaming === true,
      };
    }, target.id);
    console.log(`[m1-doctrine-route] live beam ${attempt + 1}: ${JSON.stringify(liveBeam)}`);
    const done = await page.waitForFunction(() => (window.SF?.state?.missions?.active || [])
      .some((mission) => mission?.storyTag === 'campaign47a:b0:recovery' && mission?.params?.sampleRecovered === true),
    null, { timeout: 15_000 }).then(() => true).catch(() => false);
    await page.mouse.up({ button: 'right' });
    if (done) {
      await page.waitForTimeout(180);
      await page.keyboard.press('KeyF');
      await page.waitForFunction(() => window.SF?.state?.player?.tether?.active !== true, null, { timeout: 3_000 });
      return;
    }
    const diagnostic = await page.evaluate((targetId) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(targetId);
      const mission = (state.missions?.active || []).find((entry) => entry?.storyTag === 'campaign47a:b0:recovery');
      return {
        attemptTargetId: targetId,
        targetAlive: target?.alive !== false,
        distance: target?.pos ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
        tetherActive: state.player?.tether?.active === true,
        fireGroup: state.input?.fireGroup ?? null,
        miningLockTargetId: window.SF.registry.get('mining')?._lockTargetId ?? null,
        samplePos: mission?.params?.samplePos || null,
      };
    }, target.id);
    console.log(`[m1-doctrine-route] mining attempt ${attempt + 1}: ${JSON.stringify(diagnostic)}`);
    await page.keyboard.down('Space');
    await page.waitForTimeout(300);
    await page.keyboard.up('Space');
  }
  assert.fail('ordinary RMB mining must recover the B0 assay sample');
}

async function flyPublicMapCourseToEntity(page, entityId, {
  arrivalRadius = 70,
  timeoutMs = 180_000,
  stopWhen = 'arrival',
} = {}) {
  const initialCourseTarget = await readCourseDiagnostic(page, entityId);
  await releaseKeys(page);
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => {
    const manager = window.SF?.registry?.get?.('ui')?.screenManager;
    return manager?.top?.() === 'galaxyMap'
      && manager?.getActiveScreenDef?.()?._activeLevel?.() === 'local';
  }, null, { timeout: 20_000 });

  const searchLabel = await page.waitForFunction((id) => {
    const manager = window.SF?.registry?.get?.('ui')?.screenManager;
    const screen = manager?.getActiveScreenDef?.();
    const target = screen?._clickTargets?.find((entry) => entry?.entityId === id
      || entry?.targetEntityId === id || entry?.id === id);
    const waypoint = window.SF?.state?.nav?.waypoint;
    const label = target?.name || target?.label
      || (String(waypoint?.targetEntityId) === String(id) && (waypoint.mapLabel || waypoint.label || waypoint.reason));
    return typeof label === 'string' && label.trim() ? label.trim() : null;
  }, entityId, { timeout: 20_000 }).then((handle) => handle.jsonValue());
  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 8_000 });
  await search.fill(searchLabel);
  const resultIndex = await page.waitForFunction((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const list = screen?._searchResultsList;
    if (!Array.isArray(list)) return null;
    const idx = list.findIndex((entry) =>
      String(entry?.entityId ?? entry?.targetEntityId ?? entry?.id) === String(id));
    return idx >= 0 ? idx + 1 : null;
  }, entityId, { timeout: 8_000 }).then((handle) => handle.jsonValue()).then((encoded) => encoded - 1);
  assert(resultIndex != null && resultIndex >= 0,
    `B0 objective search must list entity ${entityId} under label ${searchLabel}`);
  const result = page.locator(`.gm-search-item[data-idx="${resultIndex}"]`);
  await result.waitFor({ state: 'visible', timeout: 8_000 });
  // Search-row pointer hit-testing is tracked separately; keep this acceptance route on the
  // public keyboard path while retaining exact entity-ID selection and the physical course click.
  for (let index = 0; index < resultIndex; index += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const selected = screen?._selectedTarget;
    return selected && String(selected.entityId ?? selected.targetEntityId ?? selected.id) === String(id);
  }, entityId, { timeout: 8_000 });
  const setCourse = page.locator('#gm-set-course-btn:visible');
  await setCourse.waitFor({ state: 'visible', timeout: 8_000 });
  assert.equal(await setCourse.isEnabled(), true, 'selected B0 marker must enable the public map course action');
  const courseBox = await setCourse.boundingBox();
  assert(courseBox, 'public B0 course action must have a pointer target');
  await page.mouse.click(courseBox.x + courseBox.width / 2, courseBox.y + courseBox.height / 2);
  await page.waitForFunction((id) => {
    const autopilot = window.SF?.state?.nav?.autopilot;
    return autopilot?.active === true && String(autopilot.targetEntityId) === String(id);
  }, entityId, { timeout: 8_000 });

  if (stopWhen === 'demand') {
    const demanded = await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      return player?.alive !== false && Number.isFinite(state?.scenario?.safeOpening?.demandIssuedAt);
    }, null, { timeout: timeoutMs }).then(() => true).catch(() => false);
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    await page.keyboard.up('Space');
    await releaseKeys(page);
    const finalCourseTarget = demanded ? null : await readCourseDiagnostic(page, entityId);
    assert.equal(demanded, true,
      `public map course must reach the harasser demand envelope: ${JSON.stringify({ initialCourseTarget, finalCourseTarget })}`);
    return;
  }

  const arrivalReceipt = await page.waitForFunction(({ id, radius }) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const target = state?.entities?.get(id);
    if (!player || player.alive === false || !target?.pos) return false;
    const autopilot = state.nav?.autopilot;
    const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    const speed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
    if (autopilot?.active === false && autopilot?.status === 'arrived'
      && String(autopilot.targetEntityId) === String(id) && distance <= radius) return 'arrived';
    if (autopilot?.active === true && autopilot?.status === 'braking'
      && String(autopilot.targetEntityId) === String(id)
      && distance <= radius + 1.5 && speed < 12) return 'terminal-brake';
    return false;
  }, { id: entityId, radius: arrivalRadius }, { timeout: timeoutMs })
    .then((handle) => handle.jsonValue()).catch(() => null);
  if (arrivalReceipt === 'terminal-brake') {
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => window.SF?.state?.nav?.autopilot?.active === false, null, { timeout: 3_000 });
  }
  const diagnostic = await page.evaluate((id) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(id);
    return {
      alive: player?.alive !== false && player?.hull > 0,
      distance: target?.pos ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
      autopilot: state.nav?.autopilot || null,
    };
  }, entityId);
  assert.equal(diagnostic.alive, true, `player must survive B0 public-map course: ${JSON.stringify(diagnostic)}`);
  assert.ok(arrivalReceipt, `B0 public-map course must reach the recovery rock: ${JSON.stringify(diagnostic)}`);
}

async function readCourseDiagnostic(page, entityId) {
  return page.evaluate((id) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    const target = state?.entities?.get(id);
    const station = (state?.entityList || []).find((entity) => entity?.alive !== false
      && entity?.data?.stationId === 'station_helios');
    const distance = (a, b) => a?.pos && b?.pos
      ? Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
      : null;
    return {
      simTime: state?.simTime ?? null,
      player: player ? {
        pos: { x: player.pos?.x ?? null, z: player.pos?.z ?? null },
        speed: Math.hypot(player.vel?.x || 0, player.vel?.z || 0),
        alive: player.alive !== false,
      } : null,
      target: target ? {
        pos: { x: target.pos?.x ?? null, z: target.pos?.z ?? null },
        speed: Math.hypot(target.vel?.x || 0, target.vel?.z || 0),
        alive: target.alive !== false,
        actorId: target.data?.scenarioActorId || null,
        passive: target.data?.ai?.passive === true,
        team: target.team ?? null,
      } : null,
      station: station ? { pos: { x: station.pos?.x ?? null, z: station.pos?.z ?? null } } : null,
      playerToTarget: distance(player, target),
      playerToStation: distance(player, station),
      targetToStation: distance(target, station),
      autopilot: state?.nav?.autopilot || null,
      safeOpening: state?.scenario?.safeOpening || null,
    };
  }, entityId);
}

async function latchMineableTarget(page, targetId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let projected = await aimAt(page, targetId);
    if (!projected.onScreen) projected = (await settleArrivedTargetIntoView(page, targetId)).projected;
    assert.ok(Number.isFinite(projected.x) && Number.isFinite(projected.y),
      `marked B0 recovery rock ${targetId} must expose a projectable edge bearing before F latch: ${JSON.stringify(projected)}`);
    await page.keyboard.press('KeyF');
    const exact = await page.waitForFunction((id) => {
      const tether = window.SF?.state?.player?.tether;
      return tether?.active === true && tether.targetId === id;
    }, targetId, { timeout: 3_000 }).then(() => true).catch(() => false);
    if (exact) return;
    if (await page.evaluate(() => window.SF?.state?.player?.tether?.active === true)) {
      await page.keyboard.press('KeyF');
      await page.waitForTimeout(220);
    }
  }
  assert.fail(`ordinary F must latch the marked B0 recovery rock ${targetId}`);
}

async function settleArrivedTargetIntoView(page, targetId, timeoutMs = 3_000) {
  const before = await readArrivedTargetView(page, targetId);
  assert.equal(before.autopilot?.active, false,
    `camera settle must never cancel active autopilot: ${JSON.stringify(before)}`);
  assert.ok(before.autopilot?.status === 'arrived' || before.autopilot?.status === 'manual',
    `camera settle requires a public arrival or terminal-brake receipt: ${JSON.stringify(before)}`);
  let projected = before.projected;
  await page.keyboard.down('Space');
  try {
    const deadline = Date.now() + timeoutMs;
    while (!projected?.onScreen && Date.now() < deadline) {
      if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
        await page.mouse.move(
          Math.max(4, Math.min(VIEWPORT.width - 4, projected.x)),
          Math.max(4, Math.min(VIEWPORT.height - 4, projected.y)),
        );
      }
      await page.waitForTimeout(100);
      projected = (await readArrivedTargetView(page, targetId)).projected;
    }
  } finally {
    await page.keyboard.up('Space').catch(() => {});
  }
  if (!projected?.onScreen) {
    await page.keyboard.down('KeyW');
    try {
      const creepDeadline = Date.now() + 2_000;
      while (!projected?.onScreen && Date.now() < creepDeadline) {
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          await page.mouse.move(
            Math.max(4, Math.min(VIEWPORT.width - 4, projected.x)),
            Math.max(4, Math.min(VIEWPORT.height - 4, projected.y)),
          );
        }
        await page.waitForTimeout(100);
        projected = (await readArrivedTargetView(page, targetId)).projected;
      }
    } finally {
      await page.keyboard.up('KeyW').catch(() => {});
      await page.keyboard.down('Space');
      await page.waitForTimeout(320);
      await page.keyboard.up('Space');
    }
  }
  await page.waitForTimeout(120);
  const after = await readArrivedTargetView(page, targetId);
  const point = after.projected || { x: VIEWPORT.width * 0.6, y: VIEWPORT.height * 0.5, onScreen: false };
  await page.mouse.move(
    Math.max(4, Math.min(VIEWPORT.width - 4, point.x)),
    Math.max(4, Math.min(VIEWPORT.height - 4, point.y)),
  );
  return { before, after, projected: point };
}

async function readArrivedTargetView(page, targetId) {
  return page.evaluate((id) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(id);
    const projected = target && window.SF.helpers.worldToScreen?.({ x: target.pos.x, y: 0, z: target.pos.z });
    return {
      speed: player?.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : null,
      projected: projected ? { x: projected.x, y: projected.y, onScreen: projected.onScreen === true } : null,
      autopilot: state.nav?.autopilot ? {
        active: state.nav.autopilot.active === true,
        status: state.nav.autopilot.status,
        targetEntityId: state.nav.autopilot.targetEntityId,
      } : null,
    };
  }, targetId);
}

async function deliverAtHelios(page) {
  await releaseKeys(page);
  const station = await readStation(page);
  await page.keyboard.press('KeyN');
  await page.locator('#sf-galaxymap').waitFor({ state: 'visible', timeout: 20_000 });

  await page.keyboard.press('/');
  const search = page.locator('.gm-search-input');
  await search.waitFor({ state: 'visible', timeout: 8_000 });
  const shortcutFocused = await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true,
    null,
    { timeout: 1_000 },
  ).then(() => true, () => false);
  if (!shortcutFocused) await search.click();
  await search.fill('Helios Station');
  const hit = page.locator('.gm-search-item-name', { hasText: 'Helios Station' }).first();
  await hit.waitFor({ state: 'visible', timeout: 12_000 });
  await search.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => {
    const screen = window.SF?.registry?.get?.('ui')?.screenManager?.getActiveScreenDef?.();
    const selected = screen?._selectedTarget;
    return selected && String(selected.entityId ?? selected.targetEntityId ?? selected.id) === String(id);
  }, station.id, { timeout: 8_000 });
  const setWaypointButton = page.getByRole('button', { name: 'Set Waypoint', exact: true });
  await setWaypointButton.waitFor({ state: 'visible', timeout: 12_000 });
  assert.match(await page.locator('.gm-inspector-content').innerText(), /Helios Station/i,
    'map inspector must visibly identify the exact selected Helios station');
  await clickHeliosWaypointWithPointer(page, setWaypointButton, station.id);

  const dockPrompt = page.locator('.sf-alert--dock');
  const deadline = Date.now() + 150_000;
  let lastApproach = null;
  while (Date.now() < deadline) {
    lastApproach = await page.evaluate(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      return {
        alive: !!(player && player.alive !== false && player.hull > 0),
        pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null,
        autopilotActive: state?.nav?.autopilot?.active === true,
        autopilotStatus: state?.nav?.autopilot?.status || null,
        autopilotTargetEntityId: state?.nav?.autopilot?.targetEntityId ?? null,
        autopilotLabel: state?.nav?.autopilot?.label || null,
      };
    });
    assert.equal(lastApproach.alive, true,
      `player must survive public Helios autopilot approach: ${JSON.stringify(lastApproach)}`);
    if (await dockPrompt.isVisible().catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  assert.equal(await dockPrompt.isVisible().catch(() => false), true,
    `exact public Helios waypoint must reach the physical dock prompt: ${JSON.stringify(lastApproach)}`);
  assert.match((await dockPrompt.innerText()).trim(), /\bE\b.*\bDOCK\b|\bDOCK\b.*\bE\b/i,
    'physical dock prompt must expose the ordinary E binding');
  await page.locator('#gl-canvas').focus();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyE');
    if (await page.evaluate(() => window.SF?.state?.ui?.docked === true)) break;
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === true, null, { timeout: 20_000 });
  const snapshot = await readSnapshot(page);
  assert.equal(snapshot.docked, true, 'ordinary E must dock at Helios Station');
  assert.ok(snapshot.storyBeatIndex >= 1, 'first sample delivery must advance the real 47-A story');
}

async function clickHeliosWaypointWithPointer(page, locator, stationEntityId) {
  const deadline = Date.now() + 10_000;
  let lastBox = null;
  while (Date.now() < deadline) {
    lastBox = await locator.boundingBox().catch(() => null);
    if (lastBox && lastBox.width > 2 && lastBox.height > 2) {
      await page.mouse.click(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2);
      const armed = await page.waitForFunction((id) => {
        const autopilot = window.SF?.state?.nav?.autopilot;
        return autopilot?.active === true
          && String(autopilot.targetEntityId) === String(id)
          && /Helios Station/i.test(String(autopilot.label || ''));
      }, stationEntityId, { timeout: 750 }).then(() => true, () => false);
      if (armed) return;
    }
    await page.waitForTimeout(50);
  }
  assert.fail(`visible Set Waypoint did not arm exact Helios autopilot: ${JSON.stringify(lastBox)}`);
}

async function undock(page) {
  const button = page.getByRole('button', { name: /undock/i }).first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  const box = await button.boundingBox();
  assert(box, 'visible Undock control must have a pointer target');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
  await page.waitForFunction(() => window.SF?.state?.mode === 'flight' && window.SF?.state?.ui?.docked !== true,
    null, { timeout: 10_000 });
  await page.locator('#gl-canvas').focus();
}

async function flyPublicHelmToEntity(page, entityId, {
  arrivalRadius = 120,
  timeoutMs = 60_000,
  stopWhen = 'arrival',
} = {}) {
  await releaseKeys(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(420);
  await page.keyboard.up('Space');
  const deadline = Date.now() + timeoutMs;
  let bestDistance = Infinity;
  let stagnantTicks = 0;
  let escapeAttempts = 0;

  while (Date.now() < deadline) {
    const nav = await page.evaluate(({ id, stop }) => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const target = state.entities.get(id);
      if (!player || !target?.pos) return null;
      const dx = target.pos.x - player.pos.x;
      const dz = target.pos.z - player.pos.z;
      const distance = Math.hypot(dx, dz);
      const ux = distance > 0.001 ? dx / distance : Math.cos(player.rot || 0);
      const uz = distance > 0.001 ? dz / distance : Math.sin(player.rot || 0);
      return {
        alive: player.alive !== false && player.hull > 0,
        demanded: stop === 'demand' && Number.isFinite(state.scenario?.safeOpening?.demandIssuedAt),
        distance,
        desired: Math.atan2(dz, dx),
        rot: player.rot || 0,
        angVel: player.angVel || 0,
        speed: Math.hypot(player.vel.x || 0, player.vel.z || 0),
        closingSpeed: (player.vel.x || 0) * ux + (player.vel.z || 0) * uz,
        pos: { x: player.pos.x, z: player.pos.z },
      };
    }, { id: entityId, stop: stopWhen });
    assert(nav, `public helm target ${entityId} must stay live`);
    assert.equal(nav.alive, true, 'player must stay alive during public helm navigation');
    if (nav.demanded) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(700);
      await page.keyboard.up('Space');
      await releaseKeys(page);
      return nav;
    }
    if (stopWhen === 'arrival' && nav.distance <= arrivalRadius) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(1_500);
      await page.keyboard.up('Space');
      const settled = await page.evaluate((id) => {
        const state = window.SF.state;
        const player = state.entities.get(state.playerId);
        const target = state.entities.get(id);
        return {
          distance: Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z),
          speed: Math.hypot(player.vel.x || 0, player.vel.z || 0),
        };
      }, entityId);
      if (settled.distance <= arrivalRadius && settled.speed < 12) {
        await releaseKeys(page);
        return { ...nav, ...settled };
      }
      continue;
    }

    if (nav.distance < bestDistance - 8) {
      bestDistance = nav.distance;
      stagnantTicks = 0;
    } else {
      stagnantTicks += 1;
    }

    if (stagnantTicks >= 15) {
      // Back out of a dense-field contact, rotate the escape vector, then clear the hull laterally.
      // Every gesture is an ordinary public flight key; E remains forbidden because it also owns Dock.
      await page.keyboard.down('Space');
      await page.waitForTimeout(320);
      await page.keyboard.up('Space');
      await page.keyboard.down('KeyS');
      await page.waitForTimeout(800);
      await page.keyboard.up('KeyS');
      const turnKey = escapeAttempts % 2 === 0 ? 'KeyA' : 'KeyD';
      await page.keyboard.down(turnKey);
      await page.waitForTimeout(420);
      await page.keyboard.up(turnKey);
      await page.keyboard.down('KeyQ');
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(900);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyQ');
      escapeAttempts += 1;
      stagnantTicks = 0;
      continue;
    }

    const error = wrapAngle(nav.desired - nav.rot);
    const brakingDistance = Math.max(70, (nav.speed * nav.speed) / 145);
    if ((nav.distance - arrivalRadius) < brakingDistance && nav.closingSpeed > 20) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(170);
      await page.keyboard.up('Space');
      continue;
    }
    if (Math.abs(error) > 0.35 || Math.abs(nav.angVel) > 0.8) {
      await page.keyboard.up('KeyW').catch(() => {});
      await page.keyboard.up('ShiftLeft').catch(() => {});
      const desiredYaw = Math.max(-1, Math.min(1, error * 1.8 - nav.angVel * 0.9));
      if (Math.abs(desiredYaw) > 0.04) {
        const turnKey = desiredYaw > 0 ? 'KeyD' : 'KeyA';
        await page.keyboard.down(turnKey);
        await page.waitForTimeout(Math.min(48, 18 + Math.abs(error) * 10));
        await page.keyboard.up(turnKey);
      }
      await page.waitForTimeout(70);
      continue;
    }

    await page.keyboard.down('KeyW');
    if (nav.distance > 520 && Math.abs(error) < 0.18) await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(nav.distance > 350 ? 1_800 : 650);
    await page.keyboard.up('ShiftLeft').catch(() => {});
    await page.keyboard.up('KeyW');
  }

  await releaseKeys(page);
  const diagnostic = await page.evaluate(({ id, best }) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(id);
    return {
      player: { pos: player?.pos, vel: player?.vel, rot: player?.rot, hull: player?.hull },
      target: target ? { pos: target.pos, type: target.type } : null,
      distance: player && target?.pos ? Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : null,
      bestDistance: best,
    };
  }, { id: entityId, best: bestDistance });
  assert.fail(`public helm navigation timed out: ${JSON.stringify(diagnostic)}`);
}

async function exerciseCounterplay(page, noFireUntilS) {
  await page.waitForFunction((deadline) => window.SF.state.simTime >= deadline, noFireUntilS, {
    timeout: 8_000,
  });
  const samples = [];
  const screenshots = [];
  const captured = new Set();
  const deadline = Date.now() + 48_000;
  let cycle = 0;
  while (Date.now() < deadline) {
    // Vector breaks alternate direction; a brief coast lets the tug advertise its spool before the
    // next boost denies the attach. These are ordinary player helm gestures.
    const events = await readEvents(page);
    const unseenTelegraph = events.find((event) => event.type === 'ai:telegraph'
      && ACTORS.includes(actorIdForEvent(samples, event)) && !captured.has(event.payload?.kind));
    if (unseenTelegraph?.payload?.kind) {
      const kind = unseenTelegraph.payload.kind;
      captured.add(kind);
      const name = kind === 'engine_flare' ? '07-interceptor-engine-flare.png'
        : kind === 'weapon_charge' ? '08-ranged-charge-window.png'
          : '09-tether-spool-window.png';
      await screenshot(page, name);
      screenshots.push(name);
    }

    const tetherSpooling = events.slice(-30).some((event) => event.type === 'ai:telegraph'
      && event.payload?.doctrineId === 'tether_control_raider');
    const tetherAttempted = events.some((event) => event.type === 'combat:actionStarted'
      && actorIdForEvent(samples, event) === 'scavenger_thief' && event.payload?.actionId === 'action_attach');
    if (tetherSpooling && !tetherAttempted) {
      await page.waitForTimeout(240);
    } else if (tetherSpooling || cycle % 9 < 5) {
      await page.keyboard.down('KeyW');
      await page.keyboard.down(cycle % 2 === 0 ? 'KeyD' : 'KeyA');
      await page.keyboard.down('ShiftLeft');
      await page.waitForTimeout(tetherSpooling ? 420 : 260);
      await releaseKeys(page);
    } else {
      await page.keyboard.down(cycle % 2 === 0 ? 'KeyQ' : 'KeyE');
      await page.waitForTimeout(210);
      await releaseKeys(page);
    }
    samples.push(await readCombatSample(page));
    const phaseEvents = (await readEvents(page)).filter((event) => event.type === 'ai:doctrinePhase'
      && ACTORS.includes(actorIdFromSample(samples, event.payload?.entityId)));
    const phaseMap = phasesByDoctrine(phaseEvents);
    const receipts = physicalDoctrineReceipts({ samples, allEvents: await readEvents(page) });
    if (phaseMap.interceptor_flyby.includes('extend')
      && phaseMap.ranged_disengager.includes('charge_cue')
      && phaseMap.tether_control_raider.includes('escape')
      && receipts.interceptorFired
      && receipts.interceptorExtended
      && receipts.rangedFiredOrRetreated
      && receipts.tetherAttempted
      && receipts.tetherResolved) break;
    cycle += 1;
  }
  await releaseKeys(page);
  await screenshot(page, '10-counterplay-survived.png');
  screenshots.push('10-counterplay-survived.png');
  const allEvents = await readEvents(page);
  const namedEntityIds = new Set(samples.flatMap((sample) => sample.actors.map((actor) => actor.entityId))
    .filter((entityId) => entityId != null));
  return {
    samples,
    screenshots,
    allEvents,
    telegraphs: allEvents.filter((event) => event.type === 'ai:telegraph'
      && namedEntityIds.has(event.payload?.entityId)),
    phaseEvents: allEvents.filter((event) => event.type === 'ai:doctrinePhase'
      && namedEntityIds.has(event.payload?.entityId)),
  };
}

async function defensiveHelm(page, durationMs, turnKey) {
  const until = Date.now() + durationMs;
  while (Date.now() < until) {
    await page.keyboard.down('KeyW');
    await page.keyboard.down(turnKey);
    await page.waitForTimeout(280);
    await releaseKeys(page);
    await page.waitForTimeout(90);
  }
}

async function readCombatSample(page) {
  return page.evaluate((actorIds) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const inspection = window.SF.registry.get('ai')?.inspect?.() || {};
    const records = inspection.combatDoctrine || {};
    return {
      tick: state.tick,
      simTime: state.simTime,
      player: { alive: player.alive !== false && player.hull > 0, hull: player.hull, shield: player.shield },
      actors: actorIds.map((actorId) => {
        const entity = (state.entityList || []).find((item) => item?.data?.scenarioActorId === actorId);
        const doctrine = entity ? records[String(entity.id)] || null : null;
        return {
          actorId,
          entityId: entity?.id ?? null,
          doctrineId: doctrine?.doctrineId || entity?.data?.ai?.combatDoctrineId || null,
          phase: doctrine?.phase || null,
          outcome: doctrine?.outcome || null,
          distance: entity?.pos ? round1(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)) : null,
          speed: entity?.vel ? round1(Math.hypot(entity.vel.x || 0, entity.vel.z || 0)) : null,
        };
      }),
    };
  }, ACTORS.slice());
}

async function readSnapshot(page) {
  return page.evaluate((actorIds) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const safe = state.scenario?.safeOpening || {};
    const events = window.__M1_DOCTRINE_ROUTE__ || [];
    const responseEvent = [...events].reverse().find((event) => event.type === 'scenario:scavengerResponse');
    const actors = actorIds.map((actorId) => {
      const entity = (state.entityList || []).find((item) => item?.data?.scenarioActorId === actorId);
      return {
        actorId,
        entityId: entity?.id ?? null,
        team: entity?.team ?? null,
        passive: entity?.data?.ai?.passive ?? null,
        activated: entity?.data?._liveColdStartActivated === true,
        doctrineId: entity?.data?.ai?.combatDoctrineId || null,
        pos: entity?.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
      };
    });
    const playerTetheredByScavenger = Object.values(state.combat?.attachments?.byId || {}).some((attachment) => {
      const owner = state.entities.get(attachment?.actorId ?? attachment?.ownerId);
      return attachment?.targetId === state.playerId && actorIds.includes(owner?.data?.scenarioActorId);
    });
    return {
      tick: state.tick,
      simTime: state.simTime,
      player: { alive: player?.alive !== false && player?.hull > 0, hull: player?.hull, shield: player?.shield,
        pos: player?.pos ? { x: player.pos.x, z: player.pos.z } : null },
      docked: state.ui?.docked === true,
      storyBeatIndex: state.story?.beatIndex | 0,
      safeOpening: {
        spindleClaimed: safe.spindleClaimed === true,
        demandIssuedAt: safe.demandIssuedAt ?? null,
        response: safe.response || null,
        noFireUntilS: safe.noFireUntilS ?? null,
        responseObservedAtS: responseEvent?.simTime ?? state.simTime,
      },
      actors,
      playerTetheredByScavenger,
    };
  }, ACTORS.slice());
}

async function readStation(page) {
  return page.evaluate(() => {
    const entity = (window.SF.state.entityList || []).find((item) => item?.data?.stationId === 'station_helios');
    return entity?.pos ? { id: entity.id, pos: { x: entity.pos.x, z: entity.pos.z } } : null;
  }).then((station) => {
    assert(station, 'Helios Station must exist in the live sector');
    return station;
  });
}

async function actorEntityId(page, actorId) {
  return page.evaluate((wantedActorId) => (window.SF.state.entityList || [])
    .find((entity) => entity?.alive !== false && entity?.data?.scenarioActorId === wantedActorId)?.id ?? null,
  actorId).then((entityId) => {
    assert.notEqual(entityId, null, `scenario actor ${actorId} must exist in the live route`);
    return entityId;
  });
}

async function aimAt(page, entityId) {
  const point = await page.evaluate((id) => {
    const entity = window.SF.state.entities.get(id);
    const projected = entity && window.SF.helpers.worldToScreen?.({ x: entity.pos.x, y: 0, z: entity.pos.z });
    return projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)
      ? { x: projected.x, y: projected.y, onScreen: projected.onScreen === true }
      : { x: innerWidth * 0.6, y: innerHeight * 0.5, onScreen: false };
  }, entityId);
  await page.mouse.move(
    Math.max(4, Math.min(VIEWPORT.width - 4, point.x)),
    Math.max(4, Math.min(VIEWPORT.height - 4, point.y)),
  );
  await page.waitForTimeout(80);
  return point;
}

async function readEvents(page) {
  return page.evaluate(() => (window.__M1_DOCTRINE_ROUTE__ || []).slice());
}

async function readB0Fixture(page, targetId) {
  return page.evaluate((id) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const target = state.entities.get(id);
    const nearbyAsteroids = state.entityList.filter((entity) => entity?.alive !== false
      && entity.type === 'asteroid' && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= 700)
      .map((entity) => ({ id: entity.id, pos: entity.pos, radius: entity.radius ?? entity.data?.radius ?? 0 }));
    const nearbyEntities = state.entityList.filter((entity) => entity?.alive !== false && entity?.pos
      && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= 250)
      .map((entity) => ({
        id: entity.id,
        type: entity.type,
        team: entity.team ?? null,
        pos: entity.pos,
        radius: entity.radius ?? entity.data?.radius ?? 0,
        alive: entity.alive !== false,
      }));
    return { player: { id: player.id, pos: player.pos, vel: player.vel, rot: player.rot },
      target: { id: target.id, pos: target.pos, radius: target.radius ?? target.data?.radius ?? 0 },
      nearbyAsteroids,
      nearbyEntities };
  }, targetId);
}

async function releaseKeys(page) {
  for (const key of ['KeyW', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'Space']) {
    await page.keyboard.up(key).catch(() => {});
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, name), type: 'png', animations: 'allow' });
}

function phasesByDoctrine(events) {
  const out = { interceptor_flyby: [], ranged_disengager: [], tether_control_raider: [] };
  for (const event of events || []) {
    const doctrineId = event.payload?.doctrineId;
    const phase = event.payload?.phase;
    if (out[doctrineId] && phase && !out[doctrineId].includes(phase)) out[doctrineId].push(phase);
  }
  return out;
}

function actorIdFromSample(samples, entityId) {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const match = samples[index].actors.find((actor) => actor.entityId === entityId);
    if (match) return match.actorId;
  }
  return null;
}

function actorIdForEvent(samples, event) {
  return actorIdFromSample(samples, event.payload?.entityId);
}

function physicalDoctrineReceipts({ samples = [], allEvents = [] }) {
  const actorByEntity = new Map(samples.flatMap((sample) => sample.actors || [])
    .filter((actor) => actor.entityId != null)
    .map((actor) => [actor.entityId, actor.actorId]));
  const eventActor = (event) => actorByEntity.get(
    event.payload?.ownerId ?? event.payload?.actorId ?? event.payload?.entityId,
  ) || null;
  const firedActors = new Set(allEvents.filter((event) => event.type === 'combat:fire').map(eventActor));

  const interceptorTimeline = samples.map((sample, index) => ({
    index,
    ...sample.actors.find((actor) => actor.actorId === 'scavenger_interceptor'),
  })).filter((actor) => Number.isFinite(actor.distance));
  const strikeDistances = interceptorTimeline.filter((actor) => actor.phase === 'strike');
  const minimumStrike = strikeDistances.reduce((best, actor) => (
    !best || actor.distance < best.distance ? actor : best
  ), null);
  const interceptorExtended = !!minimumStrike && interceptorTimeline.some((actor) => (
    actor.index >= minimumStrike.index
    && (actor.phase === 'extend' || actor.phase === 'reform')
    && actor.distance >= minimumStrike.distance + 60
  ));

  const tetherAttempts = allEvents.filter((event) => event.type === 'combat:actionStarted'
    && eventActor(event) === 'scavenger_thief' && event.payload?.actionId === 'action_attach');
  const thiefAttachments = allEvents.filter((event) => event.type === 'tether:attached'
    && eventActor(event) === 'scavenger_thief');
  const attachedThenBroken = thiefAttachments.some((attached) => allEvents.some((event) => (
    event.type === 'tether:broken'
    && (event.simTime ?? -Infinity) >= (attached.simTime ?? -Infinity)
    && (event.payload?.attachmentId == null
      || attached.payload?.attachmentId == null
      || event.payload.attachmentId === attached.payload.attachmentId)
  )));
  const deniedThenEscaped = tetherAttempts.some((attempt) => !thiefAttachments.some((attached) => (
    (attached.simTime ?? Infinity) >= (attempt.simTime ?? -Infinity)
  )) && samples.some((sample) => (
    sample.simTime >= (attempt.simTime ?? -Infinity)
    && sample.actors.some((actor) => actor.actorId === 'scavenger_thief' && actor.phase === 'escape')
  )));

  return {
    interceptorFired: firedActors.has('scavenger_interceptor'),
    interceptorExtended,
    rangedFiredOrRetreated: firedActors.has('scavenger_harasser') || samples.some((sample) => (
      sample.actors.some((actor) => actor.actorId === 'scavenger_harasser' && actor.phase === 'retreat')
    )),
    tetherAttempted: tetherAttempts.length > 0,
    tetherResolved: attachedThenBroken || deniedThenEscaped,
  };
}

function assertIncludes(actual, expected, label) {
  for (const value of expected) assert.ok(actual.includes(value), `${label} must include ${value}: ${actual.join(', ')}`);
}

function wrapAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function round1(value) { return Math.round(Number(value) * 10) / 10; }
function round3(value) { return Math.round(Number(value) * 1000) / 1000; }
