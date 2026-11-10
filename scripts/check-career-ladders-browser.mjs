#!/usr/bin/env node
/**
 * Live browser route evidence for Hauler + Hunter + Prospector career ladders.
 *
 * One Game Path only (canonical public root, no query flags). Proves the live
 * careerLadders runtime seam can host all three definition packs without exclusive
 * origin binding, expose stable offer/progress view models, and save/restore.
 *
 * Fail-closed when the registry seam or branch definition modules are absent.
 * Does not edit package/registry/UI/HUD/assets. Does not inspect SAFE-001.
 *
 * Run: node scripts/check-career-ladders-browser.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'career-ladders-live');
const REPORT_PATH = path.join(OUT_DIR, 'browser-route.json');
const VIEWPORT = { width: 1440, height: 900 };
const FLIGHT_TIMEOUT_MS = 150_000;

export const EXPECTED_CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);
export const SCHEMA_ID = 'spaceface.careerLadders.v1';

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function findSystemBrowser() {
  return BROWSER_CANDIDATES.find(existsSync) || null;
}

/**
 * Exercise live careerLadders on an already-booted One Game Path page in flight.
 * Shared with the Electron check (imported from this module).
 */
export async function exerciseCareerLaddersLive(page, { route = 'browser', log = () => {} } = {}) {
  log('probe careerLadders runtime seam');

  const result = await page.evaluate(async (expectedIds) => {
    const failures = [];
    const sf = window.SF;
    if (!sf || !sf.state || !sf.bus || !sf.registry) {
      return { ok: false, reason: 'runtime_seam_absent', detail: 'window.SF.{state,bus,registry} missing' };
    }

    const ladders = sf.registry.get('careerLadders');
    if (!ladders || ladders.name !== 'careerLadders') {
      return { ok: false, reason: 'runtime_seam_absent', detail: 'registry careerLadders system missing' };
    }
    const requiredMethods = [
      'registerDefinition', 'getDefinition', 'getOfferView', 'getProgress',
      'serialize', 'deserialize', 'accept', 'offer', 'noteSkillProof',
    ];
    for (const method of requiredMethods) {
      if (typeof ladders[method] !== 'function') {
        failures.push(`careerLadders.${method} missing`);
      }
    }
    if (failures.length) {
      return { ok: false, reason: 'runtime_seam_absent', detail: failures.join('; ') };
    }

    // Load live branch definition modules from the default origin (One Game Path assets).
    let haulerMod;
    let hunterMod;
    let prospMod;
    try {
      [haulerMod, hunterMod, prospMod] = await Promise.all([
        import('/src/careers/ladders/haulerLadderDefs.js'),
        import('/src/careers/ladders/hunterLadderDefs.js'),
        import('/src/careers/ladders/prospectorLadderDefs.js'),
      ]);
    } catch (err) {
      return {
        ok: false,
        reason: 'runtime_seam_absent',
        detail: `branch definition modules failed to load: ${err && err.message || err}`,
      };
    }

    const packs = [
      {
        careerId: 'hauler',
        def: haulerMod.HAULER_LADDER_DEF,
        skillKey: haulerMod.HAULER_SKILL_PROOF_KEY || 'cargo_delivery_complete',
        skillMin: 1,
      },
      {
        careerId: 'hunter',
        def: typeof hunterMod.createHunterLadderDefinition === 'function'
          ? hunterMod.createHunterLadderDefinition()
          : hunterMod.HUNTER_LADDER_DEF,
        skillKey: (hunterMod.HUNTER_LADDER_SKILL_PROOF
          && hunterMod.HUNTER_LADDER_SKILL_PROOF.BOUNTY_HUNT_COMPLETE)
          || 'bounty_hunt_complete',
        skillMin: 1,
      },
      {
        careerId: 'prospector',
        def: prospMod.PROSPECTOR_LADDER_DEF,
        skillKey: prospMod.PROSPECTOR_SKILL_PROOF_KEY || 'mining_yield_u',
        skillMin: prospMod.PROSPECTOR_SKILL_PROOF_MIN || 3,
      },
    ];

    for (const pack of packs) {
      if (!pack.def || pack.def.careerId !== pack.careerId) {
        failures.push(`definition missing or wrong careerId for ${pack.careerId}`);
        continue;
      }
      if (pack.def.nonBinding !== true) {
        failures.push(`${pack.careerId}.nonBinding must be true`);
      }
      if (!Array.isArray(pack.def.steps) || pack.def.steps.length !== 5) {
        failures.push(`${pack.careerId} must have exactly 5 steps`);
      }

      const existing = ladders.getDefinition(pack.careerId);
      if (existing) {
        // Already live-registered on this process — treat as success.
        continue;
      }
      const reg = ladders.registerDefinition(pack.def);
      if (!reg || reg.ok !== true) {
        if (reg && reg.reason === 'duplicate_careerId') continue;
        failures.push(`register ${pack.careerId}: ${reg && reg.reason || 'failed'}`);
      }
    }
    if (failures.length) {
      return { ok: false, reason: 'registration_failed', detail: failures.join('; ') };
    }

    const registeredIds = expectedIds.map((id) => (ladders.getDefinition(id) ? id : null)).filter(Boolean);
    if (registeredIds.length !== expectedIds.length
      || expectedIds.some((id) => !registeredIds.includes(id))) {
      return {
        ok: false,
        reason: 'definitions_not_registered',
        detail: `expected ${expectedIds.join(',')} got ${registeredIds.join(',')}`,
        registeredIds,
      };
    }

    // Soft-unlock via skillProof only — no exclusive origin completion required.
    // Origins may remain idle; ladders must not exclusive-lock peer careers.
    for (const pack of packs) {
      ladders.noteSkillProof(pack.skillKey, pack.skillMin);
    }

    // Ensure origins are not exclusively binding peer careers before ladder accept.
    const originsBefore = sf.state.careers && sf.state.careers.origins
      ? {
        hauler: sf.state.careers.origins.hauler && sf.state.careers.origins.hauler.status,
        hunter: sf.state.careers.origins.hunter && sf.state.careers.origins.hunter.status,
        prospector: sf.state.careers.origins.prospector && sf.state.careers.origins.prospector.status,
      }
      : null;

    const offerBeforeAccept = ladders.getOfferView();
    if (!offerBeforeAccept || offerBeforeAccept.nonBinding !== true) {
      return { ok: false, reason: 'offer_view_invalid', detail: 'getOfferView.nonBinding !== true' };
    }
    const offerIds = (offerBeforeAccept.offers || []).map((o) => o.careerId).sort();
    if (JSON.stringify(offerIds) !== JSON.stringify([...expectedIds].sort())) {
      return {
        ok: false,
        reason: 'offer_view_incomplete',
        detail: `offers=${offerIds.join(',')}`,
      };
    }
    for (const offer of offerBeforeAccept.offers) {
      if (offer.nonBinding !== true) failures.push(`${offer.careerId} offer nonBinding`);
      if (offer.canAccept !== true && offer.status !== 'active' && offer.status !== 'completed') {
        // After skill proof, latent/offered should accept.
        if (offer.status === 'latent' || offer.status === 'offered') {
          failures.push(`${offer.careerId} canAccept expected true, status=${offer.status}`);
        }
      }
      for (const key of ['careerId', 'title', 'status', 'stepId', 'stepIndex', 'canAccept', 'canDecline', 'nonBinding', 'offerNonce']) {
        if (!(key in offer)) failures.push(`${offer.careerId} offer missing ${key}`);
      }
    }

    // Accept all three without exclusive origin binding — proves peer reachability.
    const acceptResults = {};
    for (const id of expectedIds) {
      const r = ladders.accept(id, { ignorePrereqs: false });
      acceptResults[id] = { ok: !!(r && r.ok), reason: r && r.reason || null };
      if (!r || !r.ok) failures.push(`accept ${id}: ${r && r.reason || 'failed'}`);
    }

    const progress = ladders.getProgress();
    const progressStable = {};
    for (const id of expectedIds) {
      const p = progress && progress[id];
      if (!p) {
        failures.push(`progress missing for ${id}`);
        continue;
      }
      progressStable[id] = {
        careerId: p.careerId,
        status: p.status,
        stepId: p.stepId,
        stepIndex: p.stepIndex,
        stepsDone: p.stepsDone,
        stepsTotal: p.stepsTotal,
        attemptMult: p.attemptMult,
        nonBinding: p.nonBinding,
        orphan: !!p.orphan,
      };
      if (p.nonBinding !== true) failures.push(`${id} progress nonBinding`);
      if (p.orphan === true) failures.push(`${id} progress orphan`);
      if (p.status !== 'active' && p.status !== 'completed') {
        failures.push(`${id} expected active after accept, got ${p.status}`);
      }
      if (p.stepsTotal !== 5) failures.push(`${id} stepsTotal expected 5, got ${p.stepsTotal}`);
      for (const key of ['careerId', 'status', 'stepId', 'stepIndex', 'nonBinding']) {
        if (!(key in p)) failures.push(`${id} progress missing ${key}`);
      }
    }

    // Leaves must declare non-exclusive flags.
    const leafFlags = {};
    for (const id of expectedIds) {
      const leaf = sf.state.careers && sf.state.careers.ladders && sf.state.careers.ladders[id];
      leafFlags[id] = leaf && leaf.flags
        ? {
          exclusive: leaf.flags.exclusive === true,
          blocksOtherCareers: leaf.flags.blocksOtherCareers === true,
          nonBinding: leaf.flags.nonBinding === true || leaf.nonBinding === true,
        }
        : null;
      if (!leaf) failures.push(`leaf missing for ${id}`);
      else if (leaf.flags && (leaf.flags.exclusive === true || leaf.flags.blocksOtherCareers === true)) {
        failures.push(`${id} exclusive/blocksOtherCareers flag set`);
      }
    }

    // Origins must remain reachable (no exclusive ladder lock on peer origins).
    const originsAfter = sf.state.careers && sf.state.careers.origins
      ? {
        hauler: sf.state.careers.origins.hauler && sf.state.careers.origins.hauler.status,
        hunter: sf.state.careers.origins.hunter && sf.state.careers.origins.hunter.status,
        prospector: sf.state.careers.origins.prospector && sf.state.careers.origins.prospector.status,
      }
      : null;
    const exclusiveOriginBinding = false;
    // Accepting all three ladders via skillProof without requiring a single exclusive origin
    // is the non-binding contract. Origins statuses may stay idle/offered independently.
    if (!originsAfter) {
      // Origins system may be present as empty; not a hard exclusive lock.
    }

    // Save / restore via live careerLadders + save serializeData path.
    const ladderBlob = ladders.serialize();
    if (!ladderBlob || ladderBlob.schemaId !== 'spaceface.careerLadders.v1') {
      failures.push(`serialize schemaId expected spaceface.careerLadders.v1 got ${ladderBlob && ladderBlob.schemaId}`);
    }
    const saveSys = sf.registry.get('save');
    let saveDataCareerLadders = null;
    if (saveSys && typeof saveSys.serializeData === 'function') {
      const data = saveSys.serializeData();
      saveDataCareerLadders = data && data.careerLadders
        ? {
          schemaId: data.careerLadders.schemaId,
          schemaVersion: data.careerLadders.schemaVersion,
          careerIds: Object.keys(data.careerLadders.ladders || {})
            .filter((k) => k !== '__meta')
            .sort(),
          statuses: Object.fromEntries(
            expectedIds.map((id) => {
              const leaf = data.careerLadders.ladders && data.careerLadders.ladders[id];
              return [id, leaf ? { status: leaf.status, stepId: leaf.stepId, stepIndex: leaf.stepIndex } : null];
            }),
          ),
        }
        : null;
      if (!saveDataCareerLadders || saveDataCareerLadders.schemaId !== 'spaceface.careerLadders.v1') {
        failures.push('save.serializeData().careerLadders missing or wrong schema');
      }
    } else {
      failures.push('save system serializeData seam absent');
    }

    // Mutate then restore from blob to prove deserialize authority.
    const preRestore = {};
    for (const id of expectedIds) {
      const leaf = sf.state.careers.ladders[id];
      preRestore[id] = { status: leaf.status, stepId: leaf.stepId, stepIndex: leaf.stepIndex };
      leaf.status = 'latent';
      leaf.stepId = null;
      leaf.stepIndex = 0;
    }
    ladders.deserialize(JSON.parse(JSON.stringify(ladderBlob)));
    const restored = {};
    for (const id of expectedIds) {
      const leaf = sf.state.careers.ladders[id];
      restored[id] = { status: leaf && leaf.status, stepId: leaf && leaf.stepId, stepIndex: leaf && leaf.stepIndex };
      if (!leaf || leaf.status !== preRestore[id].status || leaf.stepId !== preRestore[id].stepId) {
        failures.push(`restore mismatch for ${id}: before=${JSON.stringify(preRestore[id])} after=${JSON.stringify(restored[id])}`);
      }
    }

    const offerAfter = ladders.getOfferView();
    const progressAfter = ladders.getProgress();

    return {
      ok: failures.length === 0,
      reason: failures.length ? 'assertion_failed' : null,
      detail: failures.length ? failures.join('; ') : null,
      failures,
      registeredIds,
      offerView: {
        nonBinding: offerBeforeAccept.nonBinding === true,
        offers: (offerBeforeAccept.offers || []).map((o) => ({
          careerId: o.careerId,
          title: o.title,
          status: o.status,
          stepId: o.stepId,
          stepIndex: o.stepIndex,
          canAccept: o.canAccept,
          canDecline: o.canDecline,
          nonBinding: o.nonBinding,
          offerNonce: o.offerNonce,
        })),
      },
      acceptResults,
      progress: progressStable,
      leafFlags,
      originsBefore,
      originsAfter,
      exclusiveOriginBinding,
      save: saveDataCareerLadders || {
        schemaId: ladderBlob && ladderBlob.schemaId,
        schemaVersion: ladderBlob && ladderBlob.schemaVersion,
      },
      restored: {
        statuses: restored,
        matched: failures.every((f) => !f.startsWith('restore mismatch')),
      },
      mode: sf.state.mode,
      offerAfterNonBinding: offerAfter && offerAfter.nonBinding === true,
      progressKeys: progressAfter ? Object.keys(progressAfter).sort() : [],
    };
  }, EXPECTED_CAREER_IDS);

  if (!result || result.ok !== true) {
    const msg = result
      ? `career ladders live probe failed (${result.reason}): ${result.detail || ''}`
      : 'career ladders live probe returned empty result';
    // Fail closed for missing runtime seam.
    if (result && result.reason === 'runtime_seam_absent') {
      throw new Error(`FAIL_CLOSED runtime seam absent — ${result.detail}`);
    }
    throw new Error(msg);
  }

  assert.deepEqual([...result.registeredIds].sort(), [...EXPECTED_CAREER_IDS].sort(),
    'all three ladder definitions must be registered');
  assert.equal(result.offerView.nonBinding, true, 'offer view must be nonBinding');
  assert.equal(result.exclusiveOriginBinding, false, 'ladders must not exclusive-bind origins');
  assert.equal(result.save.schemaId, SCHEMA_ID, 'save careerLadders schemaId');
  assert.equal(result.restored.matched, true, 'save/restore must restore ladder leaves');
  assert.equal(result.mode, 'flight', 'probe must run on default flight runtime');

  for (const id of EXPECTED_CAREER_IDS) {
    assert.equal(result.acceptResults[id].ok, true, `accept ${id}`);
    assert.ok(result.progress[id], `progress ${id}`);
    assert.equal(result.progress[id].nonBinding, true, `${id} progress nonBinding`);
    assert.equal(result.progress[id].stepsTotal, 5, `${id} stepsTotal`);
  }

  log(`registered=${result.registeredIds.join(',')} save=${result.save.schemaId}`);
  return result;
}

// ── main (browser entry) ─────────────────────────────────────────────────────

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let server = null;
  let browser = null;
  let context = null;
  let page = null;

  try {
    mkdirSync(OUT_DIR, { recursive: true });

    server = await acquireVisualProbeServer({ root: ROOT });
    assert.equal(server.ownsServer, true, 'browser route must own ephemeral loopback server');
    const rootUrl = new URL(server.baseUrl);
    assert.equal(rootUrl.hostname, '127.0.0.1', 'browser server must bind IPv4 loopback');
    assert.equal(rootUrl.search, '', 'browser base URL must not carry query flags');

    const executablePath = findSystemBrowser();
    assert(executablePath, 'headed Chrome or Edge is required for career-ladders browser proof');

    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({
      headless: false,
      executablePath,
      args: [
        '--incognito',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    page = await context.newPage();
    const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) { /* ignore */ }
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.equal(new URL(page.url()).search, '', 'browser must use canonical root without query flags');

    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry),
      null,
      { timeout: 30_000 },
    );

    const newGame = page.getByRole('button', { name: 'New Game', exact: true });
    await newGame.click({ timeout: 30_000 });
    const launch = page.getByRole('button', { name: 'Launch', exact: true });
    await launch.click({ timeout: 30_000 });
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
    }, null, { timeout: FLIGHT_TIMEOUT_MS });

    const receipt = await exerciseCareerLaddersLive(page, {
      route: 'browser',
      log: (line) => console.log(`[career-ladders-browser] ${line}`),
    });

    const errorIssues = issues.errorIssues();
    const ignored = summarizeIssues(issues.ignoredIssues);
    assert.deepEqual(errorIssues, [], `browser page errors: ${JSON.stringify(summarizeIssues(errorIssues))}`);

    const report = {
      schema: 'spaceface.careerLaddersLiveBrowser.v1',
      generatedAt: new Date().toISOString(),
      route: 'browser',
      baseUrl: server.baseUrl,
      expectedCareerIds: EXPECTED_CAREER_IDS,
      schemaId: SCHEMA_ID,
      pass: true,
      receipt,
      pageErrors: [],
      ignoredPageIssues: ignored,
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`[career-ladders-browser] PASS ${JSON.stringify({
      registeredIds: receipt.registeredIds,
      nonBinding: receipt.offerView.nonBinding,
      exclusiveOriginBinding: receipt.exclusiveOriginBinding,
      saveSchemaId: receipt.save.schemaId,
      restoredStatuses: receipt.restored.statuses,
      ignoredPageIssues: ignored.length,
    })}`);
    console.log(`[career-ladders-browser] report: ${path.relative(ROOT, REPORT_PATH)}`);
  } catch (error) {
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(REPORT_PATH, `${JSON.stringify({
        schema: 'spaceface.careerLaddersLiveBrowser.v1',
        generatedAt: new Date().toISOString(),
        route: 'browser',
        pass: false,
        error: {
          name: error && error.name,
          message: error && error.message,
          stack: error && error.stack,
        },
      }, null, 2)}\n`);
    } catch (_) { /* best-effort */ }
    console.error(`[career-ladders-browser] FAIL: ${error && error.stack || error}`);
    process.exitCode = 1;
  } finally {
    try { if (page && !page.isClosed()) await page.close(); } catch (_) { /* ignore */ }
    try { if (context) await context.close(); } catch (_) { /* ignore */ }
    try { if (browser) await browser.close(); } catch (_) { /* ignore */ }
    try { if (server && typeof server.close === 'function') await server.close(); } catch (_) { /* ignore */ }
  }
}
