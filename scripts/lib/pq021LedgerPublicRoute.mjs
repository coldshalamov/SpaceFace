// PQ-021 public route — the two ORDINARY ways a player reads the Ship's Ledger.
//
//   station : dock -> Ledger destination -> entry -> evidence detail -> return
//   flight  : K    -> Codex -> Ledger tab -> entry -> evidence detail -> close
//
// Shared by the Browser probe (scripts/probe-pq021-ledger-route.mjs) and the Electron entry
// (scripts/check-pq021-ledger-route-electron.mjs), following the professional-travel pattern:
// one route module, two thin runtime entries, one schema.
//
// EARNING IS NOT INJECTED. The preparation phase drives the same seven authored Cathedral
// operations through the LIVE registry's ordinary operation API —
// `registry.get('asteroidSites').applyWorldSiteBeamOperation(...)`, the exact call
// src/systems/mining.js:287 makes for the player's industrial beam. If that does not yield five
// pages the route FAILS; there is no receipt-writing fallback, because a fabricated page would
// make every downstream assertion meaningless.
//
// The one declared shortcut is travel: the probe places the player in sector_ceres_belt through the
// game's own sector-enter path rather than flying there, and records that in the receipt. Travel is
// not evidence state — no page can be minted by arriving.

import { CATHEDRAL_ROUTE } from '../../test/pq021-cathedral-route-harness.mjs';
import { WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS } from '../../src/data/wreckCathedralEvidenceCatalog.js';

export const PQ021_ROUTE_SCHEMA = 'spaceface.pq021-ledger-route.v1';
export const SITE_ID = 'world_site_wreck_cathedral';
export const SECTOR_ID = 'sector_ceres_belt';
export const MAX_FIGURE_WIDTH_PX = 900;
export const START_TIMEOUT_MS = 90_000;
export const DOCK_TIMEOUT_MS = 15_000;

export const PQ021_SCREENSHOTS = Object.freeze([
  'station-ledger-list.png',
  'station-ledger-evidence.png',
  'flight-codex-ledger-list.png',
  'flight-codex-ledger-evidence.png',
]);

export function repoRel(root, absolute) {
  return String(absolute).slice(String(root).length).replace(/\\/g, '/').replace(/^\/+/, '');
}

function fail(message) {
  throw new Error(`[pq021-route] ${message}`);
}

async function waitForVisible(page, selector, timeoutMs, label) {
  try {
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 10;
    }, selector, { timeout: timeoutMs });
  } catch (_) {
    fail(`${label} never became visible (${selector})`);
  }
}

async function clickButtonByText(page, text) {
  return page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => (candidate.textContent || '').replace(/\s+/g, ' ').trim() === label
        && !candidate.disabled && candidate.offsetParent !== null);
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

/** Boot a real run to flight through the ordinary main-menu route. */
export async function bootToFlight(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).search !== '') fail('the route must use the canonical root URL with no query flags');
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && window.SF.ctx,
    null, { timeout: 15_000 });
  await waitForVisible(page, '[data-screen="mainMenu"]', 15_000, 'main menu');
  if (!(await clickButtonByText(page, 'New Game'))) fail('main menu did not expose New Game');
  await waitForVisible(page, '[data-screen="newGame"] .sf-ng-route', 10_000, 'new-game rail');
  if (!(await clickButtonByText(page, 'Launch'))) fail('new game did not expose Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });
}

/**
 * Earn all five pages inside the live runtime through the ordinary operation API.
 * Returns the per-step log. Throws if fewer than five pages are minted.
 */
export async function earnInRuntime(page) {
  const result = await page.evaluate(async ({ route, sectorId, siteId }) => {
    const sf = window.SF;
    const registry = sf.ctx && sf.ctx.registry;
    const sites = registry && registry.get && registry.get('asteroidSites');
    if (!sites || typeof sites.applyWorldSiteBeamOperation !== 'function') {
      return { ok: false, reason: 'asteroidSites is not reachable from the live registry' };
    }

    // Declared shortcut: travel. Arriving mints nothing; it only materializes the site's entities
    // so the payload can be physically delivered.
    //
    // Use the game's OWN intentional-jump entry point. The world system owns currentSectorId
    // (src/systems/world.js:404) and re-derives it every frame, so assigning it directly is reverted
    // and the Ceres entities are despawned again. That defect was found by running
    // scripts/check-pq021-ledger-keyboard-route.mjs against the live game, where it surfaced as the
    // payload being missing at settlement.
    const world = sf.ctx.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') {
      return { ok: false, reason: 'the world system exposes no enterSector entry point' };
    }
    world.enterSector(sectorId, { fromJump: true });
    for (let i = 0; i < 40 && sf.state.world.currentSectorId !== sectorId; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (sf.state.world.currentSectorId !== sectorId) {
      return { ok: false, reason: `the world stayed in ${sf.state.world.currentSectorId}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));

    const record = () => sf.state.sites && sf.state.sites.worldById && sf.state.sites.worldById[siteId];
    if (!record()) return { ok: false, reason: 'the Cathedral site record never materialized in Ceres' };

    const liveEntities = (worldRecordId) => [...sf.state.entities.values()].filter((entity) =>
      entity && entity.alive !== false && entity.data && entity.data.worldRecordId === worldRecordId);

    const log = [];
    let tick = Math.max(600, (sf.state.tick | 0) + 600);
    for (const step of route) {
      if (step.towPayloadId) {
        // The released payload materializes on the owner's sync, not synchronously with the cut.
        for (let i = 0; i < 20 && !liveEntities(`${siteId}/payload/${step.towPayloadId}`)[0]; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const payload = liveEntities(`${siteId}/payload/${step.towPayloadId}`)[0];
        const receiver = liveEntities(`${siteId}/component/${step.componentId}`)[0];
        if (!payload || !receiver) {
          return {
            ok: false,
            reason: `payload/receiver missing for ${step.operationId}`,
            sector: sf.state.world.currentSectorId,
            payloadStatus: record().payloads && record().payloads[step.towPayloadId]
              && record().payloads[step.towPayloadId].status,
            log,
          };
        }
        payload.pos = { x: receiver.pos.x, z: receiver.pos.z };
        payload.vel = { x: 0, z: 0 };
      }
      for (const amount of step.partials || [step.threshold]) {
        sf.state.tick = tick;
        if (Number.isFinite(sf.state.simTime)) sf.state.simTime = tick / 60;
        const applied = sites.applyWorldSiteBeamOperation({
          siteId,
          componentId: step.componentId,
          verb: step.verb,
          amount,
          requestStreamId: 'player-industrial-beam',
          requestSequence: tick,
          tick,
        });
        // duplicate() returns ok:true with a null receipt — a pass that asserts only `ok` earns
        // nothing and still reports success.
        if (!applied.ok || applied.duplicate || !(applied.moved > 0)) {
          return { ok: false, reason: `${step.operationId}: ${applied.reason || 'no progress'}`, log };
        }
        log.push({ operationId: step.operationId, tick, amount, moved: applied.moved });
        tick += 120;
      }
      if (!record().completedOperations[step.operationId]) {
        return { ok: false, reason: `${step.operationId} did not complete durably`, log };
      }
    }
    return {
      ok: true,
      log,
      pageIds: Object.keys(record().evidenceReceiptsByPageId).sort(),
      stageId: record().stageId,
      evidenceRevision: record().evidenceRevision,
    };
  }, { route: CATHEDRAL_ROUTE.map((step) => ({ ...step })), sectorId: SECTOR_ID, siteId: SITE_ID });

  if (!result.ok) fail(`in-runtime earning failed: ${result.reason}`);
  if (result.pageIds.length !== 5) {
    fail(`in-runtime earning produced ${result.pageIds.length} pages, not five`);
  }
  return result;
}

/** Read every evidence page inside one mounted host root, returning what the player can see. */
async function readHost(page, rootSelector, hostLabel) {
  return page.evaluate(async ({ selector, pageIds, host }) => {
    const root = document.querySelector(selector);
    if (!root) throw new Error(`${host}: no Ledger panel at ${selector}`);
    const settle = (img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) return resolve('complete');
      const done = (kind) => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
        resolve(kind);
      };
      const onLoad = () => done('load');
      const onError = () => done('error');
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
      setTimeout(() => done('timeout'), 20_000);
    });

    const rows = [...root.querySelectorAll('.st-ledger-entry')].map((li) => ({
      type: li.getAttribute('data-ledger-entry-type'),
      cycle: li.querySelector('.st-ledger-cycle').textContent,
      line: li.querySelector('.st-ledger-line').textContent,
      pageId: li.querySelector('[data-ledger-evidence]')
        ? li.querySelector('[data-ledger-evidence]').getAttribute('data-ledger-evidence') : null,
    }));

    const pages = [];
    for (const pageId of pageIds) {
      const opener = root.querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`);
      if (!opener) throw new Error(`${host}: no evidence control for ${pageId}`);
      opener.focus();
      opener.click();
      const img = root.querySelector('.st-ledger-figure-img');
      const settled = await settle(img);
      const rect = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      const back = root.querySelector('[data-ledger-back]');
      pages.push({
        pageId,
        settled,
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        caption: root.querySelector('.st-ledger-figure-caption').textContent,
        provenance: root.querySelector('.st-ledger-provenance').textContent,
        title: root.querySelector('.st-ledger-detail-title').textContent,
        fragment: root.querySelector('.st-ledger-detail-fragment').textContent,
        body: root.querySelector('.st-ledger-detail-body').textContent,
        figureState: root.querySelector('.st-ledger-figure').getAttribute('data-ledger-figure-state'),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        objectFit: style.objectFit,
        focusOnBack: document.activeElement === back,
      });
      back.click();
      pages[pages.length - 1].focusReturnedToOpener = document.activeElement === opener;
    }
    return {
      host,
      labelledBy: root.getAttribute('aria-labelledby'),
      rows,
      pages,
      images: root.querySelectorAll('img').length,
    };
  }, { selector: rootSelector, pageIds: [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS], host: hostLabel });
}

/** station: dock -> Ledger destination -> entry -> evidence -> return */
export async function runStationReadRoute(page, { screenshot }) {
  const docked = await page.evaluate(() => {
    const sf = window.SF;
    const station = sf.state.entityList && sf.state.entityList.find((entity) => entity
      && entity.alive !== false && entity.type === 'station' && entity.data
      && entity.data.stationId && !entity.data.isGate);
    if (!station) return null;
    sf.bus.emit('dock:docked', { stationId: station.data.stationId });
    return station.data.stationId;
  });
  if (!docked) fail('no dockable station was reachable for the station read route');
  await waitForVisible(page, '[data-screen="station"] .sx-dock', DOCK_TIMEOUT_MS, 'command dock');

  const opened = await page.evaluate(() => {
    const tab = document.querySelector('[data-screen="station"] .sx-dock [data-nav="ledger"]');
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!opened) fail('the command dock exposes no Ledger destination');
  await waitForVisible(page, '[data-screen="station"] .st-ledger', DOCK_TIMEOUT_MS, 'station Ledger panel');
  await screenshot('station-ledger-list.png');
  const read = await readHost(page, '[data-screen="station"] .st-ledger', 'station');
  await page.evaluate(() => {
    const root = document.querySelector('[data-screen="station"] .st-ledger');
    const opener = root.querySelector('[data-ledger-evidence]');
    if (opener) opener.click();
  });
  await screenshot('station-ledger-evidence.png');
  await page.evaluate(() => {
    const back = document.querySelector('[data-screen="station"] .st-ledger [data-ledger-back]');
    if (back) back.click();
  });
  return { stationId: docked, ...read };
}

/** flight: K -> Codex -> Ledger tab -> entry -> evidence -> close */
export async function runFlightReadRoute(page, { screenshot }) {
  await page.evaluate(() => {
    const undock = document.querySelector('[data-screen="station"] .sx-dock [data-act="undock"]');
    if (undock) undock.click();
    else window.SF.bus.emit('dock:undocked', {});
  });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.state.mode === 'flight',
    null, { timeout: DOCK_TIMEOUT_MS });

  // The ordinary keyboard route: K is BINDINGS.codex (src/ui/bindings.js:24), handled at
  // src/ui/input.js:222-224 -> screenManager.pushScreen('codex'). Pressed on the page, not dispatched
  // straight into the screen manager.
  await page.keyboard.press('k');
  await waitForVisible(page, '[data-screen="codex"]', DOCK_TIMEOUT_MS, 'codex screen after K');

  const tabbed = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[data-screen="codex"] .sf-tabbar .sf-tab')]
      .find((button) => (button.textContent || '').trim() === 'Ledger');
    if (!tab) return false;
    tab.click();
    return true;
  });
  if (!tabbed) fail('the Codex screen exposes no Ledger tab');
  await waitForVisible(page, '[data-screen="codex"] .st-ledger', DOCK_TIMEOUT_MS, 'codex Ledger panel');
  await screenshot('flight-codex-ledger-list.png');
  const read = await readHost(page, '[data-screen="codex"] .st-ledger', 'codex');
  await page.evaluate(() => {
    const opener = document.querySelector('[data-screen="codex"] .st-ledger [data-ledger-evidence]');
    if (opener) opener.click();
  });
  await screenshot('flight-codex-ledger-evidence.png');
  return read;
}

/** Assert the acceptance contract over both hosts and return the receipt body. */
export function assertRouteContract({ earning, station, flight, runtimeLabel }) {
  const problems = [];
  const note = (condition, message) => { if (!condition) problems.push(message); };

  note(earning.pageIds.length === 5, 'in-runtime earning did not mint five pages');
  note(earning.stageId === 'archived', `site stage is ${earning.stageId}, expected archived`);

  for (const host of [station, flight]) {
    // A real run also projects the other receipt families (trade, loss, witness, ...), so the panel
    // legitimately lists more than five rows. Exactly five of them must be evidence pages. Asserting
    // a total of five here failed against the live game with six rows.
    const evidenceRows = host.rows.filter((row) => row.pageId);
    note(evidenceRows.length === 5,
      `${host.host}: ${evidenceRows.length} evidence rows of ${host.rows.length} total, expected 5`);
    note(host.images === 1, `${host.host}: ${host.images} images in the panel, expected exactly 1`);
    note(host.labelledBy === `st-ledger-${host.host}-title`,
      `${host.host}: accessible name points at ${host.labelledBy}`);
    for (const page of host.pages) {
      note(page.settled !== 'error' && page.settled !== 'timeout',
        `${host.host}/${page.pageId}: media did not admit (${page.settled})`);
      note(page.naturalWidth > 0, `${host.host}/${page.pageId}: no decoded pixels`);
      note(page.figureState === 'admitted', `${host.host}/${page.pageId}: figure state ${page.figureState}`);
      note(!!page.alt, `${host.host}/${page.pageId}: missing alt text`);
      note(/^Provenance: wreck_cathedral\//.test(page.provenance),
        `${host.host}/${page.pageId}: provenance not shown`);
      note(page.renderedWidth > 0 && page.renderedWidth <= MAX_FIGURE_WIDTH_PX,
        `${host.host}/${page.pageId}: figure rendered at ${page.renderedWidth}px (crop not applied)`);
      note(page.focusOnBack, `${host.host}/${page.pageId}: focus did not enter the open page`);
      note(page.focusReturnedToOpener, `${host.host}/${page.pageId}: focus did not return to its opener`);
    }
  }

  // Host parity: identical information, independent of which host rendered it.
  const informational = (host) => host.pages.map((page) => ({
    pageId: page.pageId, src: page.src, alt: page.alt, caption: page.caption,
    provenance: page.provenance, title: page.title, fragment: page.fragment, body: page.body,
  }));
  note(JSON.stringify(informational(flight)) === JSON.stringify(informational(station)),
    'station and Codex do not present identical page information');
  note(JSON.stringify(flight.rows.map((row) => row.pageId))
    === JSON.stringify(station.rows.map((row) => row.pageId)),
    'station and Codex do not list the same rows in the same order');

  return {
    schema: PQ021_ROUTE_SCHEMA,
    runtime: runtimeLabel,
    disposition: problems.length ? 'FAIL' : 'PASS',
    problems,
    earning: {
      method: 'in-runtime ordinary operation API (asteroidSites.applyWorldSiteBeamOperation)',
      declaredShortcut: 'travel only: the player is placed in sector_ceres_belt rather than flown there',
      operations: earning.log.length,
      pageIds: earning.pageIds,
      stageId: earning.stageId,
      evidenceRevision: earning.evidenceRevision,
    },
    hosts: { station, flight },
  };
}
