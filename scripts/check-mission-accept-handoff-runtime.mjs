#!/usr/bin/env node
// check-mission-accept-handoff-runtime.mjs — browser smoke for the Accept + Track loop.
//
// DESIGN TRUTH (src/ui/station/): Contracts board → "Accept & Track" a commodity job. That seeds an
// active + tracked mission and a trade nav waypoint (sim logic). The loop is then legible: Market
// flags the tracked contract's commodity ("buy it here"), and Mission Log opens on the J binding.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { BINDINGS } from '../src/ui/bindings.js';
import { collectPageIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { installCspSafePlaywrightPolling } from './lib/playwrightCspPolling.mjs';
import { reportStationHandoffFailure, installStationHandoffTimingObserver, startStationHandoffTrace } from './lib/stationHandoffDiagnostics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const START_TIMEOUT_MS = 90000;
const DOCK_TIMEOUT_MS = 15000;
const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
let acceptTrace = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });
  installCspSafePlaywrightPolling(page);
  await page.addInitScript(installStationHandoffTimingObserver);
  // The probe server runs with the player store unmounted (see spawnProbeServer) — isolated
  // harnesses never touch the machine save drawer, and store calls take the localStorage path.
  const issues = collectPageIssues(page, { playerStoreMounted: false, includeWarnings: true });
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'mission handoff probe must use the canonical root URL with no query flags');
  // Headless boot is roughly TWICE as slow as a real GPU here, and not because the game is slow:
  // SwiftShader does not expose KHR_parallel_shader_compile, so THREE compiles every program
  // serially on the main thread. Measured on this machine: window.SF.ctx ready at 11,977 ms
  // headless against this 15,000 ms budget — an 80% margin that any load at all tips over, and
  // it did, intermittently, across five checks. A real GPU HAS the extension (verified), so
  // this is an environment allowance, not a behavioural assertion being loosened. Everything
  // these checks actually assert happens after boot and is untouched.
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx, null, { timeout: 30000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15000, 'main menu');
  assert.equal(await clickButton(page, 'New Game'), true, 'main menu should expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10000, 'new-game first-session rail');
  await page.evaluate(() => {
    window.__sfMissionHandoffLaunch = { started: false, failure: null };
    const bus = window.SF && window.SF.bus;
    if (!bus || typeof bus.on !== 'function') return;
    bus.on('game:started', () => { window.__sfMissionHandoffLaunch.started = true; });
    bus.on('game:startFailed', (payload) => {
      window.__sfMissionHandoffLaunch.failure = {
        code: String(payload?.code || '').slice(0, 200),
        stage: String(payload?.stage || '').slice(0, 200),
        error: String(payload?.error || payload?.message || payload || '').slice(0, 400),
      };
    });
  });
  assert.equal(await clickButton(page, 'Launch'), true, 'New Game should expose Launch');
  await page.waitForFunction(() => {
    if (window.__sfMissionHandoffLaunch?.failure) {
      throw new Error(`game:startFailed ${JSON.stringify(window.__sfMissionHandoffLaunch.failure)}`);
    }
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const render = state && state.render;
    return !!(state && state.mode === 'flight'
      && window.__sfMissionHandoffLaunch?.started === true
      && player && player.alive && player.hull > 0
      && render && render.flightVeilHoldsSim !== true
      && Number.isFinite(render.firstPlayableFrameAt));
  }, null, { timeout: START_TIMEOUT_MS, polling: 250 }).catch(async (error) => {
    const detail = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      const render = state && state.render;
      const player = state && state.entities && state.entities.get(state.playerId);
      return {
        launch: window.__sfMissionHandoffLaunch,
        mode: state && state.mode,
        tick: state && state.tick,
        simTime: state && state.simTime,
        player: player ? { id: player.id, alive: player.alive !== false, hull: player.hull } : null,
        flightVeilHoldsSim: render && render.flightVeilHoldsSim,
        firstPlayableFrameAt: render && render.firstPlayableFrameAt != null
          ? render.firstPlayableFrameAt : null,
        firstPicturePhase: render && render.openingFirstPicturePhase != null
          ? render.openingFirstPicturePhase : null,
      };
    }).catch(() => null);
    throw new Error(`${error.message} :: Mission handoff launch state ${JSON.stringify(detail)} :: page errors ${JSON.stringify(issues.errorIssues())}`);
  });

  const dockTarget = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((e) =>
      e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId && !e.data.isGate);
    if (!station) throw new Error('No dockable station entity found in first-session sector');
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return { stationId: station.data.stationId };
  });
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock after dock')
    .catch((error) => reportDockHandoffFailure(page, dockTarget, issues, error));
  // On the worker lane ui.dockedStationId is sim-authored — the screen mounts on the
  // docked emit while the station id still travels the inputFold→mirror round trip.
  await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    return !!(s && s.ui && typeof s.ui.dockedStationId === 'string' && s.ui.dockedStationId);
  }, null, { timeout: DOCK_TIMEOUT_MS }).catch((error) =>
    reportStationHandoffFailure(page, { boundary: 'mission dock identity', dockTarget }, issues, error));

  // Seed a live commodity contract on this station's board (a bulk_trade the market here can buy).
  const seeded = await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf.state;
    const stationId = state.ui.dockedStationId;
    const market = state.economy && state.economy.markets && state.economy.markets[stationId];
    const cmdtyId = market ? Object.keys(market)[0] : 'cmdty_ore_iron';
    // pick any other known station as the destination
    let dest = null;
    for (const e of (state.entityList || [])) {
      if (e && e.type === 'station' && e.data && e.data.stationId && e.data.stationId !== stationId) { dest = e.data; break; }
    }
    const offer = {
      id: 'handoff_probe_bulk_trade',
      type: 'bulk_trade',
      factionId: 'faction_mts',
      title: 'Probe tracked cargo loop',
      risk: 0,
      reward: 1200,
      stationId,
      cargo: { commodityId: cmdtyId, qty: 6 },
      destinationName: dest ? (dest.name || dest.stationId) : 'Depot',
      destStationId: dest ? dest.stationId : null,
      params: { cmdtyId, qty: 6 },
    };
    // The canonical worker owns the board. A transport acknowledgement and a successful
    // method dispatch wrap the posting owner's verdict; neither alone proves it took the row.
    // A facade mutation after refusal would only fabricate the UI half of this handoff.
    const rpc = { op: 'missionsCall', args: { method: 'postBoardOffer', offer } };
    let response = null;
    let error = null;
    try {
      if (typeof sf.laneRpc !== 'function') throw new Error('laneRpc unavailable');
      response = await sf.laneRpc(rpc.op, rpc.args);
    } catch (cause) { error = String(cause?.message || cause).slice(0, 600); }
    const result = response?.result?.result;
    const posted = response?.ok === true && response.result?.ok === true
      && result?.ok === true && result.offerId === offer.id;
    let diag = null;
    try { diag = typeof sf.simLaneDiag === 'function' ? sf.simLaneDiag() : null; }
    catch (_) { /* Optional observation cannot replace the posting owner's verdict. */ }
    return { ok: posted, stationId, cmdtyId, posted, rpc: {
      ...rpc, response: JSON.stringify(response)?.slice(0, 1600) ?? null, error,
    }, lane: diag ? { lane: diag.lane, replyCount: diag.replyCount,
      missionDomainApplied: Object.fromEntries(Object.entries(diag.domainAppliedKeys || {})
        .filter(([key]) => /^missions(?:\.|$)/.test(key)).slice(0, 32)) } : null };
  });
  assert.equal(seeded.ok, true,
    'missions owner should post a commodity contract on the docked board: ' + JSON.stringify(seeded));

  // Go to Contracts, select the seeded offer, and Accept & Track it.
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="contracts"]');
  await waitForVisible(page, '[data-screen="station"] .sx-ct', 8000, 'Contracts board');
  // The board owner's posting event publishes the changed missions mirror in its reply.
  // Wait for that authoritative row before expecting its rendered control.
  await page.waitForFunction((sid) => {
    const b = window.SF && window.SF.state && window.SF.state.missions && window.SF.state.missions.boards;
    return !!(b && b[sid]
      && (b[sid].slots || []).some((o) => o && o.id === 'handoff_probe_bulk_trade'));
  }, seeded.stationId, { timeout: 20000 }).catch(async (error) => {
    // Failure-only read: distinguish an absent authoritative offer from a late facade mirror.
    // The failed deadline remains the verdict even if this RPC's reply publishes the board.
    let observationTimer;
    const authoritativeBoard = await Promise.race([page.evaluate(async (stationId) => {
      let timer;
      const rpc = { op: 'missionsCall', args: { method: 'boardSlots', stationId } };
      try {
        const response = await Promise.race([
          window.SF.laneRpc(rpc.op, rpc.args),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('boardSlots observation exceeded 1500ms')), 1500);
          }),
        ]);
        const slots = response?.result?.result;
        return { ...rpc, response: JSON.stringify(response)?.slice(0, 1600) ?? null,
          hasSeededOffer: Array.isArray(slots) ? slots.includes('handoff_probe_bulk_trade') : null };
      } catch (cause) { return { ...rpc, error: String(cause?.message || cause).slice(0, 600) }; }
      finally { clearTimeout(timer); }
    }, seeded.stationId), new Promise((resolve) => {
      observationTimer = setTimeout(() => resolve({ error: 'boardSlots page observation exceeded 2000ms' }), 2000);
    })]).catch((cause) => ({ error: String(cause?.message || cause).slice(0, 600) }))
      .finally(() => clearTimeout(observationTimer));
    return reportStationHandoffFailure(page,
      { boundary: 'posted mission mirror', seeded, authoritativeBoard }, issues, error);
  });
  await page.waitForFunction(() => !!document.querySelector('[data-screen="station"] .sx-ct-row[data-mid="handoff_probe_bulk_trade"]'), null, { timeout: 6000 }).catch((error) =>
    reportStationHandoffFailure(page, { boundary: 'posted mission row', seeded }, issues, error));
  const before = await page.evaluate(() => window.SF.state.missions.active.filter((m) => m && m.status === 'active').length);

  await domClick(page, '[data-screen="station"] .sx-ct-row[data-mid="handoff_probe_bulk_trade"]');
  await page.waitForTimeout(150);
  // STALE-BASELINE REPAIR (2026-07-27). This probe used to look for a separate `[data-track]` ghost
  // button in the dossier footer. The object-centric station redesign (f22c193e, shipped 88f558da)
  // merged accept and track into ONE commit control — the dossier footer now renders
  // `[data-accept]` labelled "Accept + Bind Route", and missions.acceptMission auto-tracks the new
  // instance before it emits mission:accepted. So the probe was asserting a control the game
  // deliberately no longer has, while the LOOP it exists to protect — accept seeds an active AND
  // tracked mission — was working the whole time. The selector is corrected; every downstream
  // assertion below is unchanged, and the disabled-state check is new so a readiness-gated dossier
  // reports "blocked" rather than silently clicking nothing.
  // Query and activate in one page callback so a repaint cannot detach a pre-queried node.
  // A valid activation starts the hold and worker request exactly once. The controller disables
  // its still-labelled "Accept" key while that RPC is pending; this is distinct from an authored
  // readiness blocker, which says "Cannot accept…" and renders the actual reason.
  // Browser-process tracing can still finish when a main-thread task prevents
  // the failure-only page snapshot from running. Keep it to this one handoff.
  acceptTrace = await startStationHandoffTrace(browser);
  const commit = await page.evaluate(attemptSeededMissionAccept);
  // HOLD-COMMIT RACE (probe-robustness, 2026-10-03). A synthetic click on [data-accept] arms the
  // dossier's assistive-tech auto-hold (450ms + ~260ms retract). On a frame-starved host the hold
  // fires after this callback; on a live-frame host it may already have fired — acceptMission then
  // filters the consumed offer off the board and [data-accept] legitimately disappears. Either
  // outcome proves the control worked, so a missing button must fall back to the accept's own
  // evidence (the mission is active + tracked) before asserting.
  const consumed = !(commit && commit.found) ? await page.evaluate((prev) => {
    const state = window.SF.state;
    const active = (state.missions.active || []).filter((m) => m && m.status === 'active');
    const trackedId = state.ui && state.ui.trackedMissionId;
    const accepted = active.find((m) => m.sourceOfferId === 'handoff_probe_bulk_trade' && m.id === trackedId);
    return { grew: active.length > prev, tracked: !!(trackedId && accepted) };
  }, before) : { grew: false, tracked: false };
  assert.equal(
    (commit && commit.found) || (consumed.grew && consumed.tracked), true,
    'Contracts dossier should expose an accept-and-bind control for the offer: ' + JSON.stringify({ commit, consumed }),
  );
  assert.equal(!!(commit && commit.found
    && (commit.readinessBlocked || (commit.disabled && !commit.pending))), false,
    'the seeded offer should be route-clear, not readiness-blocked: ' + JSON.stringify(commit));

  // Accept + Track continuity: the seeded mission becomes active AND tracked (nav waypoint plotting
  // is owned by the sim and covered by check:market-nav; here we assert the UI-driven continuity).
  // The accept mutates sim-side on the worker lane; missions.active crosses back on its own
  // hot domain leaf (every publish pass), so the timeout covers several publish rounds.
  await page.waitForFunction((prev) => {
    const state = window.SF.state;
    const active = (state.missions.active || []).filter((m) => m && m.status === 'active');
    const trackedId = state.ui && state.ui.trackedMissionId;
    const tracked = trackedId && active.find((m) => m.id === trackedId
      && m.sourceOfferId === 'handoff_probe_bulk_trade');
    return !!(active.length > prev && tracked);
  }, before, { timeout: 10000 }).catch((error) =>
    reportAcceptHandoffFailure(page, { before, seeded, commit, consumed }, issues, error))
    .finally(() => acceptTrace.stop());

  // Plot a trade course for the tracked commodity (what tracking a cargo job does in flight); the
  // Market must then flag it. Run the shipped helper in the page realm so its laneSetNavWaypoint
  // call reaches the worker when the canonical route is running there, then wait for the mirror.
  const navSeed = await page.evaluate(async () => {
    const sf = window.SF;
    const state = sf.state;
    const sid = state.ui.dockedStationId;
    const cid = Object.keys((state.economy.markets && state.economy.markets[sid]) || { cmdty_ore_iron: 1 })[0];
    const { applyTradeNavigation } = await import('/src/ui/market/tradeLogic.js');
    applyTradeNavigation({ state, bus: sf.bus }, sid, cid);
    return { stationId: sid, commodityId: cid };
  });
  await page.waitForFunction(({ stationId, commodityId }) => {
    const wp = window.SF && window.SF.state && window.SF.state.nav && window.SF.state.nav.waypoint;
    return !!(wp && wp.kind === 'trade' && wp.stationId === stationId && wp.commodityId === commodityId);
  }, navSeed, { timeout: DOCK_TIMEOUT_MS }).catch((error) =>
    reportStationHandoffFailure(page, { boundary: 'trade waypoint mirror', navSeed }, issues, error));

  const active = await page.evaluate(() => {
    const state = window.SF.state;
    const trackedId = state.ui.trackedMissionId;
    const activePanel = document.querySelector('[data-screen="station"] .sx-ct__active');
    const trackedRow = document.querySelector('[data-screen="station"] .sx-job.is-tracked');
    return {
      trackedId,
      activePanelText: (activePanel && activePanel.textContent || '').replace(/\s+/g, ' ').trim(),
      hasTrackedRow: !!trackedRow,
    };
  });
  assert.ok(active.trackedId, 'a mission should be tracked after Accept & Track');
  assert.ok(active.hasTrackedRow, 'Active Operations should mark the tracked job');

  // Market flags the tracked contract commodity (buy it here to load the job).
  await domClick(page, '[data-screen="station"] .sx-dock [data-nav="market"]');
  await waitForVisible(page, '[data-screen="station"] .sx-mkt', 8000, 'Market instrument')
    .catch((error) => reportMarketHandoffFailure(page, { seeded, acceptedTrackedId: active.trackedId }, issues, error));
  await page.waitForFunction(() => !!document.querySelector('[data-screen="station"] .sx-mkt-tracked')
    || !!document.querySelector('[data-screen="station"] .sx-mkt-row.is-tracked'), null, { timeout: 6000 })
    .catch((cause) => reportMarketHandoffFailure(page, { seeded, acceptedTrackedId: active.trackedId }, issues,
      new Error('Market should flag the tracked-contract commodity after Accept & Track', { cause })));
  const market = await page.evaluate(() => ({
    callout: (document.querySelector('[data-screen="station"] .sx-mkt-tracked') || {}).textContent || '',
    trackedRow: !!document.querySelector('[data-screen="station"] .sx-mkt-row.is-tracked'),
  }));
  assert.match(market.callout, /tracked contract/i, 'Market should show a tracked-contract callout: ' + JSON.stringify(market));
  assert.equal(market.trackedRow, true, 'Market should mark the tracked commodity row');

  // Mission Log opens on the canonical binding while docked.
  await page.keyboard.press(String(BINDINGS.missionLog.code || 'KeyJ').replace(/^Key/, ''));
  await waitForVisible(page, '[data-screen="missionLog"]', 10000, 'Mission Log opened from station via binding');

  assert.deepEqual(issues.errorIssues(), [], 'mission handoff probe should not record page errors');
  console.log('Mission accept+track OK: Contracts Accept & Track -> active/tracked/waypoint -> Market callout -> Mission Log');
  console.log('Dock target:', dockTarget.stationId, 'commodity:', seeded.cmdtyId);
} catch (err) {
  throw err;
} finally {
  if (acceptTrace) await acceptTrace.stop();
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

// Observe a failed handoff without retrying the actor, changing the deadline, or masking its error.
async function reportDockHandoffFailure(page, dockTarget, issues, originalError) {
  return reportHandoffFailure(page, collectDockHandoffSnapshot, 'dock visibility',
    { dockTarget }, issues, originalError);
}

async function reportAcceptHandoffFailure(page, attempt, issues, originalError) {
  return reportHandoffFailure(page, collectAcceptHandoffSnapshot, 'Accept & Track continuity',
    { attempt }, issues, originalError);
}

async function reportMarketHandoffFailure(page, attempt, issues, originalError) {
  return reportHandoffFailure(page, collectMarketHandoffSnapshot, 'Market tracking',
    { attempt }, issues, originalError);
}

async function reportHandoffFailure(page, collector, label, context, issues, originalError) {
  let timer;
  const recent = (rows) => rows.slice(-8).map((row) => ({
    ...row, text: String(row.text || '').slice(0, 1200),
  }));
  try {
    const snapshot = await Promise.race([
      page.evaluate(collector),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' snapshot exceeded 2000ms')), 2000);
      }),
    ]);
    console.error('[mission-handoff] ' + label + ' snapshot:', JSON.stringify({
      ...context, ...snapshot,
      pageErrors: recent(issues.errorIssues()), pageWarnings: recent(issues.warningIssues()),
    }));
  } catch (diagnosticError) {
    try { console.error('[mission-handoff] ' + label + ' snapshot unavailable:', diagnosticError?.message,
      JSON.stringify({ ...context,
        pageErrors: recent(issues.errorIssues()), pageWarnings: recent(issues.warningIssues()) })); }
    catch (_) { /* Even a diagnostic logging failure cannot replace the original assertion. */ }
  } finally {
    clearTimeout(timer);
  }
  throw originalError;
}

function collectDockHandoffSnapshot() {
  const sf = window.SF;
  const state = sf?.state;
  const player = state?.entities?.get?.(state.playerId);
  const ui = sf?.registry?.get?.('ui');
  const inspect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { present: false };
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { present: true, connected: el.isConnected, hidden: el.hidden,
      ariaHidden: el.getAttribute('aria-hidden'), display: style.display,
      visibility: style.visibility, opacity: style.opacity,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  };
  return {
    mode: state?.mode ?? null, tick: state?.tick ?? null, simTime: state?.simTime ?? null,
    player: player ? { id: player.id, alive: player.alive, hull: player.hull } : null,
    docked: state?.ui?.docked ?? null, dockedStationId: state?.ui?.dockedStationId ?? null,
    screenStack: Array.isArray(state?.ui?.screenStack) ? state.ui.screenStack.slice() : null,
    topScreen: ui?.screenManager?.top?.() ?? null,
    stationRegistered: ui?._registeredScreens?.has?.('station') ?? null,
    station: inspect('[data-screen="station"]'), dock: inspect('[data-screen="station"] .sx-dock'),
  };
}

// Self-contained actor callback: readiness comes from the live dossier's authored explanation.
function attemptSeededMissionAccept() {
  const key = document.querySelector('[data-screen="station"] .sx-dossier [data-accept="handoff_probe_bulk_trade"]')
    || document.querySelector('[data-screen="station"] [data-accept="handoff_probe_bulk_trade"]');
  if (!key) return { found: false };
  const ariaLabel = String(key.getAttribute('aria-label') || '').slice(0, 600);
  const gate = document.querySelector('[data-screen="station"] .sx-dossier__gate.k-bad');
  const reason = String(gate?.textContent || '').trim().slice(0, 600);
  const readinessBlocked = !!gate || /^Cannot accept\b/.test(ariaLabel);
  const pending = key.disabled && !readinessBlocked && /^Accept\b/.test(ariaLabel);
  const attempt = { found: true, disabled: !!key.disabled, pending, readinessBlocked,
    label: String(key.textContent || '').trim().slice(0, 300), ariaLabel,
    reason: reason || (readinessBlocked ? ariaLabel : null) };
  if (key.disabled || readinessBlocked) return attempt;
  key.click();
  return { ...attempt, activated: true, connected: key.isConnected };
}

function collectAcceptHandoffSnapshot() {
  const state = window.SF?.state;
  const stationId = state?.ui?.dockedStationId;
  const slots = state?.missions?.boards?.[stationId]?.slots;
  const posted = Array.isArray(slots) ? slots : [];
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  const offer = posted.find((row) => row?.id === 'handoff_probe_bulk_trade');
  const selected = document.querySelector('[data-screen="station"] .sx-ct-row[aria-selected="true"]');
  const key = document.querySelector('[data-screen="station"] .sx-dossier [data-accept]');
  const ring = key?.querySelector('.dp-holdring');
  return {
    mode: state?.mode ?? null, tick: state?.tick ?? null, simTime: state?.simTime ?? null,
    docked: state?.ui?.docked ?? null, dockedStationId: stationId ?? null,
    trackedMissionId: state?.ui?.trackedMissionId ?? null,
    activeCount: active.filter((row) => row?.status === 'active').length,
    active: active.slice(0, 32).map((row) => ({ id: row?.id ?? null,
      status: row?.status ?? null, sourceOfferId: row?.sourceOfferId ?? null })),
    boardPresent: Array.isArray(slots), boardCount: posted.length,
    postedIds: posted.slice(0, 32).map((row) => row?.id ?? null),
    offer: offer ? { id: offer.id, type: offer.type, reward: offer.reward,
      collateral: offer.collateral ?? null, destStationId: offer.destStationId ?? null,
      requirementUnmet: offer.requirementUnmet ?? null, lockedReason: offer.lockedReason ?? null } : null,
    selectedOfferId: selected?.getAttribute('data-mid') ?? null,
    acceptKey: key ? { missionId: key.getAttribute('data-accept'), connected: key.isConnected,
      disabled: key.disabled, holding: key.classList.contains('is-holding'),
      label: String(key.textContent || '').trim().slice(0, 300),
      ariaLabel: String(key.getAttribute('aria-label') || '').slice(0, 600),
      holdProgress: ring?.style?.getPropertyValue('--sf-hold-p') ?? null } : null,
  };
}

// Only the handoff's mission identities and Market surface are observed; never dump game state.
function collectMarketHandoffSnapshot() {
  const state = window.SF?.state;
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  const trackedId = state?.ui?.trackedMissionId;
  const mission = (row) => row ? { id: row.id ?? null, sourceOfferId: row.sourceOfferId ?? null,
    status: row.status ?? null, cmdtyId: row.params?.cmdtyId ?? null,
    cargoCommodityId: row.cargo?.commodityId ?? null } : null;
  const waypoint = state?.nav?.waypoint;
  const root = document.querySelector('[data-screen="station"]');
  const query = (selector) => root?.querySelector(selector);
  const rows = [...(root?.querySelectorAll('.sx-mkt-row') || [])];
  const filters = [...(root?.querySelectorAll('[data-market-filter][aria-pressed="true"]') || [])];
  const selected = query('.sx-mkt-row[aria-selected="true"]');
  const callout = query('.sx-mkt-tracked');
  return {
    trackedMissionId: trackedId ?? null,
    trackedInstance: mission(active.find((row) => row?.id === trackedId)),
    acceptedInstances: active.filter((row) => row?.sourceOfferId === 'handoff_probe_bulk_trade').slice(0, 32).map(mission),
    waypoint: waypoint ? { kind: waypoint.kind ?? null, commodityId: waypoint.commodityId ?? null,
      stationId: waypoint.stationId ?? null } : null,
    docked: state?.ui?.docked ?? null, dockedStationId: state?.ui?.dockedStationId ?? null,
    operation: root?.getAttribute('data-operation') ?? null, view: root?.getAttribute('data-view') ?? null,
    marketPresent: !!query('.sx-mkt'), rowCount: rows.length,
    rows: rows.slice(0, 64).map((row) => ({ commodityId: row.getAttribute('data-cmdty'),
      tracked: row.classList.contains('is-tracked'), selected: row.getAttribute('aria-selected') === 'true' })),
    flaggedCommodityIds: rows.filter((row) => row.classList.contains('is-tracked')).slice(0, 64)
      .map((row) => row.getAttribute('data-cmdty')),
    selectedCommodityId: selected?.getAttribute('data-cmdty') ?? null,
    filters: filters.slice(0, 16).map((el) => el.getAttribute('data-market-filter')),
    search: String(query('[data-market-search]')?.value || '').slice(0, 300),
    callout: callout ? { state: callout.getAttribute('data-tracked-state'),
      text: String(callout.textContent || '').trim().slice(0, 600) } : null,
  };
}

async function domClick(page, selector) {
  const ok = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, selector);
  assert.equal(ok, true, 'probe should be able to click: ' + selector);
}

async function waitForVisible(page, selector, timeoutMs, label) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 10;
  }, selector, { timeout: timeoutMs }).catch((err) => { throw new Error('Timed out waiting for ' + label + ': ' + err.message); });
}

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const exact = [...document.querySelectorAll('button')].find((b) => normalize(b.textContent) === normalize(wanted));
    const button = exact || [...document.querySelectorAll('button')].find((b) => normalize(b.textContent).includes(normalize(wanted)));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
}

async function startFreshServer() {
  const port = await findFreePort(8310);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawnProbeServer(port);
  await waitForReachable(url, child);
  return { baseUrl: url, kill: () => child.kill() };
}

function spawnProbeServer(port) {
  // SPACEFACE_PLAYER_STORE_DIR='' is the designed explicit unmount — a probe must not write
  // autosaves into the machine's real player save drawer. The unmounted route 404s fast and
  // the client takes its localStorage fallback, so no store request can stall under load.
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.probeOutput = () => output.trim();
  return child;
}

async function waitForReachable(url, child) {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable at ${url}\n${child.probeOutput ? child.probeOutput() : ''}`);
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error('Dev server did not become reachable at ' + url);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the mission handoff runtime check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  try { const res = await fetch(url, { method: 'GET' }); return !!res.ok; } catch (_) { return false; }
}
