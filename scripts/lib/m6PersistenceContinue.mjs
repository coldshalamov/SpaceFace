// M6 cold title-Continue persistence proof (public inputs only).
//
// Assumes the page is already on the normal player route and docked via
// runBrowserPublicRoute (or equivalent public dock path). Proves:
//   1) F5 quick-save survives page.reload → real title Continue
//   2) finite credits + sorted cargo equality (RAM ↔ sf.save.quick ↔ post-Continue)
//   3) exactly one active mission id/type/status/objectiveProgress/objectiveTarget
//      plus trackedMissionId rebind after save:loaded
//
// Forbidden: state injection, bus.emit to fake dock/accept/load, localStorage writes,
// board seeding, load interception, quality/settings mutations.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Contract marks required for a green M6 cold-continue proof. */
export const M6_REQUIRED_MARKS = Object.freeze([
  'mission-tab-opened',
  'mission-accepted',
  'one-active-mission',
  'undocked',
  'save-written',
  'envelope-matches-ram',
  'cold-reloaded',
  'title-continue-clicked',
  'save-loaded-flight',
  'economy-restored-continue',
  'mission-restored-continue',
  'tracked-mission-rebound',
]);

/** Public DOM / role selectors used by the live path (contract-tested). */
export const M6_SELECTORS = Object.freeze({
  stationScreen: '[data-screen="station"]',
  missionsTab: '[data-screen="station"] [role="tab"][data-tab="missions"]',
  missionsPanel: '[data-screen="station"] .st-missions',
  acceptButton:
    '[data-screen="station"] button[data-act="accept"]:not([disabled])',
  acceptButtonPreferred:
    '[data-screen="station"] button.st-mission-accept[data-act="accept"]:not([disabled]), '
    + '[data-screen="station"] button.st-ops-btn--accept[data-act="accept"]:not([disabled])',
  acceptedBanner: '[data-screen="station"] .st-mission-accepted',
  mainMenu: '[data-screen="mainMenu"]',
  continueRole: { role: 'button', name: 'Continue', exact: true },
  saveEnvelopeKey: 'sf.save.quick',
  saveSlot: 'quick',
});

export const M6_SCREENSHOTS = Object.freeze({
  missionsAccepted: '07-missions-accepted.png',
  preReloadFlight: '08-pre-reload-saved.png',
  mainMenuContinue: '09-main-menu-continue.png',
  postContinueFlight: '10-post-continue-flight.png',
});

const FLIGHT_TIMEOUT_MS = 150_000;
const SAVE_TIMEOUT_MS = 20_000;
const ACCEPT_TIMEOUT_MS = 20_000;

/**
 * Run the cold-continue persistence sequence from a docked station hub.
 *
 * @param {import('playwright').Page} page
 * @param {{
 *   outputDir: string,
 *   expectedRootUrl: string,
 *   log?: (line: string) => void,
 *   flightTimeoutMs?: number,
 *   saveTimeoutMs?: number,
 * }} options
 */
export async function runM6PersistenceContinue(page, {
  outputDir,
  expectedRootUrl,
  log = () => {},
  flightTimeoutMs = FLIGHT_TIMEOUT_MS,
  saveTimeoutMs = SAVE_TIMEOUT_MS,
} = {}) {
  assert(page, 'M6 persistence helper requires a Playwright page');
  assert(outputDir, 'M6 persistence helper requires an output directory');
  assert(expectedRootUrl, 'M6 persistence helper requires the canonical root URL');

  const marks = [];
  const mark = (name, detail = {}) => {
    const record = { name, at: new Date().toISOString(), ...detail };
    marks.push(record);
    log(`[m6-persist] ${name}${detail.note ? ` — ${detail.note}` : ''}`);
    return record;
  };
  const screenshots = [];
  const urlChecks = [];

  const recordCanonicalUrl = (boundary) => {
    const check = inspectCanonicalUrl(page.url(), expectedRootUrl);
    urlChecks.push({ boundary, ...check });
    assert.deepEqual(check.failures, [],
      `${boundary} left the canonical root: ${JSON.stringify(check)}`);
    return check;
  };

  assert.equal(
    await page.evaluate(() => window.SF?.state?.ui?.docked === true),
    true,
    'M6 persistence sequence must start docked (public route)',
  );
  await page.locator(M6_SELECTORS.stationScreen).waitFor({ state: 'visible', timeout: 20_000 });
  recordCanonicalUrl('docked-start');

  // --- Missions tab (public click) ---
  const missionsTab = page.locator(M6_SELECTORS.missionsTab).first();
  await missionsTab.waitFor({ state: 'visible', timeout: 20_000 });
  await missionsTab.click({ timeout: 10_000 });
  await page.locator(M6_SELECTORS.missionsPanel).waitFor({ state: 'visible', timeout: 15_000 });
  mark('mission-tab-opened');

  // --- Accept first enabled public offer ---
  const beforeActive = await page.evaluate(() => (
    (window.SF?.state?.missions?.active || []).filter((m) => m && m.status === 'active').length
  ));
  assert.equal(beforeActive, 0,
    `M6 proof requires zero active missions before accept; got ${beforeActive}`);

  const acceptBtn = page.locator(M6_SELECTORS.acceptButtonPreferred).first();
  const preferredVisible = await acceptBtn.isVisible().catch(() => false);
  const acceptTarget = preferredVisible
    ? acceptBtn
    : page.locator(M6_SELECTORS.acceptButton).first();
  await acceptTarget.waitFor({ state: 'visible', timeout: ACCEPT_TIMEOUT_MS });
  const acceptMeta = await acceptTarget.evaluate((button) => ({
    mid: button.getAttribute('data-mid') || null,
    disabled: !!button.disabled,
    className: button.className || '',
  }));
  assert.equal(acceptMeta.disabled, false, `Accept control must be enabled: ${JSON.stringify(acceptMeta)}`);
  await acceptTarget.click({ timeout: 10_000 });

  await page.waitForFunction((prevCount) => {
    const active = (window.SF?.state?.missions?.active || [])
      .filter((m) => m && m.status === 'active');
    const trackedId = window.SF?.state?.ui?.trackedMissionId;
    return active.length === prevCount + 1
      && trackedId
      && active.some((m) => m.id === trackedId);
  }, beforeActive, { timeout: ACCEPT_TIMEOUT_MS });

  const acceptedBanner = page.locator(M6_SELECTORS.acceptedBanner);
  // Banner is best-effort UI confirmation; mission state is the acceptance gate.
  await acceptedBanner.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

  const preSaveMission = await readMissionSnapshot(page);
  assert.equal(preSaveMission.activeCount, 1, 'exactly one active mission after accept');
  assert.ok(preSaveMission.mission, 'accepted mission snapshot missing');
  assert.equal(preSaveMission.mission.status, 'active');
  assert.ok(Number.isFinite(preSaveMission.mission.objectiveProgress),
    'objectiveProgress must be finite');
  assert.ok(Number.isFinite(preSaveMission.mission.objectiveTarget),
    'objectiveTarget must be finite');
  assert.equal(preSaveMission.trackedMissionId, preSaveMission.mission.id,
    'accept must auto-track the accepted mission');
  mark('mission-accepted', {
    offerId: acceptMeta.mid,
    missionId: preSaveMission.mission.id,
    type: preSaveMission.mission.type,
  });
  mark('one-active-mission', { mission: preSaveMission.mission });
  screenshots.push(await captureScreenshot(page, outputDir, M6_SCREENSHOTS.missionsAccepted));

  // --- Undock (public KeyE) then F5 quick-save ---
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.SF?.state?.ui?.docked === false, null, { timeout: 20_000 });
  mark('undocked');

  await armSaveLoadObservers(page);
  const ramEconomy = await readEconomySnapshot(page);
  assert.ok(Number.isFinite(ramEconomy.credits), 'credits must be finite before save');
  await page.keyboard.press('F5');
  await page.waitForFunction(
    (key) => window.__M6_PERSIST_EVENTS__?.saved === true && !!localStorage.getItem(key),
    M6_SELECTORS.saveEnvelopeKey,
    { timeout: saveTimeoutMs },
  );

  const ramMission = await readMissionSnapshot(page);
  assert.equal(ramMission.activeCount, 1, 'exactly one active mission at save time');
  assert.deepEqual(ramMission.mission, preSaveMission.mission,
    'mission identity must be stable from accept through F5');
  const envelope = await readQuickSaveEnvelope(page);
  assert.equal(envelope.hasEnvelope, true, 'sf.save.quick envelope must exist after F5');
  assert.ok(envelope.bytes > 100, `quick-save payload too small: ${envelope.bytes}`);

  assert.deepEqual(envelope.economy, ramEconomy,
    'sf.save.quick economy must match live RAM at F5');
  assert.deepEqual(envelope.mission, ramMission.mission,
    'sf.save.quick mission fields must match live RAM at F5');
  mark('save-written', {
    slot: M6_SELECTORS.saveSlot,
    bytes: envelope.bytes,
    credits: ramEconomy.credits,
    cargoKinds: Object.keys(ramEconomy.cargoItems).length,
  });
  mark('envelope-matches-ram', {
    economy: ramEconomy,
    mission: ramMission.mission,
  });
  screenshots.push(await captureScreenshot(page, outputDir, M6_SCREENSHOTS.preReloadFlight));
  recordCanonicalUrl('pre-reload');

  // --- Cold reload → title Continue (real load path) ---
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null, {
    timeout: 60_000,
  });
  assert.equal(new URL(page.url()).search, '', 'cold reload must stay on the canonical player root');
  recordCanonicalUrl('post-reload');
  mark('cold-reloaded');

  await dismissIntroIfPresent(page);
  await waitForVisibleScreen(page, 'mainMenu', 30_000);

  // Envelope must still be present after reload (same origin localStorage).
  const postReloadEnvelope = await readQuickSaveEnvelope(page);
  assert.equal(postReloadEnvelope.hasEnvelope, true,
    'sf.save.quick must survive page.reload before Continue');
  assert.deepEqual(postReloadEnvelope.economy, ramEconomy,
    'disk economy must survive page.reload');
  assert.deepEqual(postReloadEnvelope.mission, ramMission.mission,
    'disk mission must survive page.reload');

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('[data-screen="mainMenu"] button')]
      .find((candidate) => candidate.textContent?.trim() === 'Continue');
    return !!button && !button.disabled;
  }, null, { timeout: 20_000 });
  screenshots.push(await captureScreenshot(page, outputDir, M6_SCREENSHOTS.mainMenuContinue));

  await armSaveLoadObservers(page);
  await continueButton.click({ timeout: 30_000 });
  mark('title-continue-clicked');

  await page.waitForFunction(() => (
    window.__M6_PERSIST_EVENTS__?.loaded === true
    && window.SF?.state?.mode === 'flight'
  ), null, { timeout: flightTimeoutMs });

  await page.waitForFunction(flightReadyInPage, null, { timeout: flightTimeoutMs });
  mark('save-loaded-flight');
  recordCanonicalUrl('post-continue-flight');

  const liveEconomy = await readEconomySnapshot(page);
  const liveMission = await readMissionSnapshot(page);

  assert.deepEqual(liveEconomy, ramEconomy,
    'credits + cargo must round-trip exactly through cold title Continue');
  mark('economy-restored-continue', {
    credits: liveEconomy.credits,
    cargoKinds: Object.keys(liveEconomy.cargoItems).length,
  });

  assert.equal(liveMission.activeCount, 1,
    `exactly one active mission after Continue; got ${liveMission.activeCount}`);
  assert.ok(liveMission.mission, 'post-Continue mission snapshot missing');
  assert.deepEqual(liveMission.mission, ramMission.mission,
    'mission id/type/status/progress/target must round-trip through cold Continue');
  mark('mission-restored-continue', { mission: liveMission.mission });

  assert.equal(liveMission.trackedMissionId, ramMission.mission.id,
    'trackedMissionId must rebind to the sole active mission after save:loaded');
  mark('tracked-mission-rebound', { trackedMissionId: liveMission.trackedMissionId });

  screenshots.push(await captureScreenshot(page, outputDir, M6_SCREENSHOTS.postContinueFlight));

  const markNames = marks.map((entry) => entry.name);
  for (const required of M6_REQUIRED_MARKS) {
    assert.ok(markNames.includes(required), `missing required mark: ${required}`);
  }

  return {
    pass: true,
    marks,
    markNames,
    screenshots,
    urlChecks,
    preSave: {
      economy: ramEconomy,
      mission: ramMission.mission,
      trackedMissionId: ramMission.trackedMissionId,
    },
    envelope: {
      economy: envelope.economy,
      mission: envelope.mission,
      bytes: envelope.bytes,
      version: envelope.version,
    },
    postContinue: {
      economy: liveEconomy,
      mission: liveMission.mission,
      trackedMissionId: liveMission.trackedMissionId,
    },
    inputSource: 'keyboard-mouse',
    injectedState: false,
  };
}

// ── snapshots (read-only observation) ─────────────────────────────────────────

export async function readEconomySnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const items = state?.player?.cargo?.items || {};
    return {
      credits: Number(state?.player?.credits),
      cargoItems: Object.fromEntries(
        Object.entries(items).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  });
}

export async function readMissionSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const active = (state?.missions?.active || []).filter((m) => m && m.status === 'active');
    const primary = active[0] || null;
    return {
      activeCount: active.length,
      trackedMissionId: state?.ui?.trackedMissionId ?? null,
      mission: primary ? normalizeMissionIdentity(primary) : null,
      allIds: active.map((m) => m.id),
    };

    function normalizeMissionIdentity(m) {
      return {
        id: m.id,
        type: m.type,
        status: m.status,
        objectiveProgress: Number(m.objectiveProgress),
        objectiveTarget: Number(m.objectiveTarget),
      };
    }
  });
}

export async function readQuickSaveEnvelope(page) {
  return page.evaluate((key) => {
    let raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return { hasEnvelope: false, bytes: 0, economy: null, mission: null, version: null };
    }
    if (!raw) {
      return { hasEnvelope: false, bytes: 0, economy: null, mission: null, version: null };
    }
    let env;
    try {
      env = JSON.parse(raw);
    } catch {
      return { hasEnvelope: false, bytes: raw.length, economy: null, mission: null, version: null };
    }
    const data = env?.data || {};
    const items = data.cargo?.items || data.player?.cargo?.items || {};
    const credits = data.player?.credits;
    const missionsRoot = normalizeMissionSavePayload(data.missions);
    const active = (missionsRoot.active || []).filter((m) => m && (m.status === 'active' || !m.status));
    const primary = active[0] || null;
    return {
      hasEnvelope: true,
      bytes: raw.length,
      version: env?.version ?? null,
      economy: {
        credits: Number(credits),
        cargoItems: Object.fromEntries(
          Object.entries(items).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      mission: primary
        ? {
          id: primary.id,
          type: primary.type,
          status: primary.status || 'active',
          objectiveProgress: Number(primary.objectiveProgress),
          objectiveTarget: Number(primary.objectiveTarget),
        }
        : null,
      activeCount: active.length,
    };

    function normalizeMissionSavePayload(d) {
      if (!d || typeof d !== 'object') return {};
      if (d.missions && !d.boards && !d.active) {
        return Object.assign({}, d.missions, { story: d.story || d.missions.story });
      }
      return d;
    }
  }, M6_SELECTORS.saveEnvelopeKey);
}

// ── host helpers ──────────────────────────────────────────────────────────────

async function armSaveLoadObservers(page) {
  await page.evaluate(() => {
    window.__M6_PERSIST_EVENTS__ = { saved: false, loaded: false };
    if (!window.SF?.bus) return;
    window.SF.bus.once('save:completed', () => {
      window.__M6_PERSIST_EVENTS__.saved = true;
    });
    window.SF.bus.once('save:loaded', () => {
      window.__M6_PERSIST_EVENTS__.loaded = true;
    });
  });
}

function flightReadyInPage() {
  const state = window.SF?.state;
  if (!state || state.mode !== 'flight') return false;
  const player = state.entities?.get(state.playerId)
    || state.entityList?.find((entity) => entity?.id === state.playerId);
  if (!player || player.alive === false) return false;
  const data = player.mesh?.userData || {};
  const authoredReady = data.authoredAssetState === 'authored'
    && data.authoredVisualRoot === 'authored-root'
    && data.authoredReadableFallbackRetained === false;
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashVisible = !!(splash && !splash.hidden && getComputedStyle(splash).display !== 'none'
    && Number(getComputedStyle(splash).opacity || 1) > 0.01);
  return authoredReady && !modalOpen && !splashVisible;
}

async function dismissIntroIfPresent(page) {
  const splash = page.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await page.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  }
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot-overlay');
    if (!boot) return true;
    const style = getComputedStyle(boot);
    return boot.hidden || style.display === 'none' || Number(style.opacity || 1) <= 0.01;
  }, null, { timeout: 30_000 }).catch(() => {});
}

async function waitForVisibleScreen(page, screenName, timeoutMs) {
  await page.waitForFunction((name) => {
    const el = document.querySelector(`[data-screen="${name}"]`);
    if (!el || el.hidden) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
  }, screenName, { timeout: timeoutMs });
}

async function captureScreenshot(page, outputDir, name) {
  const absolute = path.join(outputDir, name);
  await page.screenshot({ path: absolute, type: 'png', animations: 'disabled' });
  return name;
}

function inspectCanonicalUrl(actualUrl, expectedRootUrl) {
  const failures = [];
  let actual;
  let expected;
  try {
    actual = new URL(actualUrl);
    expected = new URL(expectedRootUrl);
  } catch (error) {
    return {
      pass: false,
      expected: expectedRootUrl,
      actual: actualUrl,
      failures: [`invalid URL: ${error.message}`],
    };
  }
  if (actual.origin !== expected.origin) {
    failures.push(`origin mismatch: ${actual.origin} !== ${expected.origin}`);
  }
  if ((actual.pathname || '/') !== (expected.pathname || '/')) {
    failures.push(`pathname mismatch: ${actual.pathname} !== ${expected.pathname}`);
  }
  if (actual.search) failures.push(`query flags present: ${actual.search}`);
  if (actual.hash) failures.push(`hash present: ${actual.hash}`);
  return {
    pass: failures.length === 0,
    expected: expected.href,
    actual: actual.href,
    origin: actual.origin,
    pathname: actual.pathname,
    search: actual.search,
    hash: actual.hash,
    failures,
  };
}

/**
 * Write content-hashed evidence JSON + artifact digests under outputDir.
 * Returns the absolute evidence path and content hashes.
 */
export async function writeM6Evidence({
  root,
  outputDir,
  evidence,
  screenshots = [],
}) {
  const screenshotArtifacts = [];
  for (const name of screenshots) {
    const absolute = path.join(outputDir, name);
    const bytes = await readFile(absolute);
    screenshotArtifacts.push({
      kind: 'screenshot',
      path: path.relative(root, absolute).replace(/\\/g, '/'),
      name,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }

  // Stable body for content hashing: omit generatedAt so re-reads can re-verify.
  const body = {
    schema: evidence.schema,
    taskId: evidence.taskId,
    pass: evidence.pass,
    inputSource: evidence.inputSource,
    injectedState: evidence.injectedState,
    marks: evidence.marks,
    markNames: evidence.markNames,
    preSave: evidence.preSave,
    envelope: evidence.envelope,
    postContinue: evidence.postContinue,
    urlChecks: evidence.urlChecks,
    route: evidence.route,
    checks: evidence.checks,
    errors: evidence.errors,
    cleanup: evidence.cleanup,
    screenshots: screenshotArtifacts,
  };
  const canonical = `${stableStringify(body)}\n`;
  const contentHash = createHash('sha256').update(canonical).digest('hex');
  const full = {
    ...evidence,
    contentHash,
    // A JSON document cannot truthfully contain its own byte hash. Screenshots are embedded
    // claims; the report hash is written beside the report as a detached receipt below.
    artifacts: screenshotArtifacts,
  };
  const reportPath = path.join(outputDir, 'evidence.json');
  const finalText = `${JSON.stringify(full, null, 2)}\n`;
  const reportSha256 = createHash('sha256').update(finalText).digest('hex');
  await writeFile(reportPath, finalText, 'utf8');
  const receiptPath = path.join(outputDir, 'evidence.sha256');
  await writeFile(receiptPath, `${reportSha256}  evidence.json\n`, 'utf8');
  return {
    reportPath,
    receiptPath,
    contentHash,
    reportSha256,
    screenshots: screenshotArtifacts,
  };
}

/** Deterministic JSON stringify for content hashing (sorted object keys). */
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}
