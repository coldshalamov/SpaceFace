#!/usr/bin/env node
// check-pq021-ledger-hosts.mjs — PQ-021 Phase 4 two-host DOM proof, headless.
//
// Mounts the ONE Ship's Ledger panel factory under the two host configurations the live game uses:
//
//   station : src/ui/station/screens/ledger.js -> createShipLedgerPanel(ctx, { hostId: 'station', ... })
//   codex   : src/ui/screens/codex.js:406      -> createShipLedgerPanel(ctx, { hostId: 'codex', headingLevel: 2 })
//
// The Codex *screen* is not booted here on purpose: parity is a property of the shared factory under
// those two hostIds, and booting the whole Codex screen would prove the screen, not the panel. The
// live keyboard route through the real Codex screen is the separate route harness.
//
// The state under test is EARNED, not authored: the same node harness the focused test uses drives
// the seven authored Cathedral operations through the ordinary beam-operation API, then the record
// is passed through the ordinary sites serializer so this page reads exactly what a Continue holds.
//
// Real stylesheets are linked in the same order index.html + stationApp.js load them, so every
// measurement reflects the real cascade rather than a synthetic one.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import {
  earnCathedralEvidence,
  makeCathedralHarness,
  SITE_ID,
} from '../test/pq021-cathedral-route-harness.mjs';
import { WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS } from '../src/data/wreckCathedralEvidenceCatalog.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'pq021');
const HARNESS_PATH = 'pq021-ledger-host-harness';
const MEDIA_PREFIX = 'assets/ships/release/media/wreck-cathedral/';
// The panel is authored for a bounded evidence figure, not a full-bleed hero. An image wider than
// this in the mounted host means no crop is being applied at all.
const MAX_FIGURE_WIDTH_PX = 900;
// The panel's authored figure cap (src/ui/screens/shipLedger.js). The station host column is made wider
// than this on purpose so the cap is what bounds the figure, not the container.
const FIGURE_CAP_PX = 720;

const { chromium } = await loadPlaywright();

let server = null;
let browser = null;
const failures = [];
const report = {};

function check(label, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    failures.push(`${label}: ${err && err.message ? err.message : String(err)}`);
    return false;
  }
}

try {
  // ---- 1. EARN the evidence in node, then persist it the ordinary way. -------------------------
  const h = makeCathedralHarness();
  const run = earnCathedralEvidence(h);
  assert.equal(run.log.length, 7, 'the earning route must complete all seven operations');
  const persisted = JSON.parse(JSON.stringify(h.system.serialize()));
  const earnedRecord = persisted.worldById[SITE_ID];
  assert.equal(
    Object.keys(earnedRecord.evidenceReceiptsByPageId).length,
    5,
    'the persisted record must carry all five earned pages',
  );

  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1460, height: 900 }, deviceScaleFactor: 1 });

  // Real listener / timer / observer accounting, installed before any module runs.
  await page.addInitScript(() => {
    const counters = {
      addListener: 0, removeListener: 0, byType: {},
      intervals: 0, timeouts: 0, rafs: 0, observers: 0,
    };
    window.__sfCounters = counters;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      counters.addListener += 1;
      counters.byType[type] = (counters.byType[type] || 0) + 1;
      return add.call(this, type, ...rest);
    };
    EventTarget.prototype.removeEventListener = function (type, ...rest) {
      counters.removeListener += 1;
      counters.byType[type] = (counters.byType[type] || 0) - 1;
      return remove.call(this, type, ...rest);
    };
    const setIntervalRaw = window.setInterval;
    window.setInterval = function (...args) { counters.intervals += 1; return setIntervalRaw.apply(this, args); };
    const rafRaw = window.requestAnimationFrame;
    window.requestAnimationFrame = function (...args) { counters.rafs += 1; return rafRaw.apply(this, args); };
    const ObserverRaw = window.MutationObserver;
    window.MutationObserver = class extends ObserverRaw {
      constructor(...args) { super(...args); counters.observers += 1; }
    };
  });

  // Every media request the page makes, in order — the ground truth for "one request per open".
  const mediaRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes(MEDIA_PREFIX)) mediaRequests.push(url.slice(url.indexOf(MEDIA_PREFIX)));
  });
  // A failed subresource logs a generic "Failed to load resource" with no URL, so console text alone
  // cannot attribute it. Track the non-OK responses separately and judge attribution from those.
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/i.test(msg.text())) return;
    consoleErrors.push(msg.text());
  });
  const badResponses = [];
  const abortedRequests = [];
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const errorText = (failure && failure.errorText) || 'unknown';
    // An aborted request is the cleanup working, not a defect: closing a detail or hiding a host
    // calls removeAttribute('src'), which cancels an image still in flight. Counted, not failed.
    if (/ERR_ABORTED|net::ERR_ABORTED|aborted/i.test(errorText)) {
      abortedRequests.push(`${errorText} ${request.url()}`);
      return;
    }
    badResponses.push(`FAILED(${errorText}) ${request.url()}`);
  });

  await page.route(`**/${HARNESS_PATH}`, (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>PQ-021 Ledger host harness</title>
<link rel="stylesheet" href="/styles/ui.css">
<link rel="stylesheet" href="/styles/fonts.css">
<link rel="stylesheet" href="/styles/accessibility.css">
<link rel="stylesheet" href="/styles/station.css">
<style>
  body { margin:0; background:#05080e; overflow:auto; }
  /* Both live hosts render inside #ui-root, so the real ui.css font-size / --ui-scale rule applies.
     Only its fixed positioning is neutralised, so the two columns can be measured side by side. */
  #ui-root { position: static !important; pointer-events: auto !important; contain: none !important; }
  #ui-root > div.hostcol { position: static !important; width: 700px; display: inline-block; vertical-align: top; }
  /* Deliberately WIDER than the panel's 720px figure cap, so the cap actually binds and the
     measurement is the rule rather than the container. Roughly the real station panel width at a
     1460px viewport. The codex column stays narrower than the cap, so both regimes are measured. */
  #ui-root > div#station-host.hostcol { width: 1000px; }
</style>
</head><body>
<div id="ui-root">
<div id="station-host" class="hostcol sx-app"></div><div id="codex-host" class="hostcol"></div>
</div>
</body></html>`,
  }));

  await page.goto(`${server.baseUrl}${HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.styleSheets.length >= 4, null, { timeout: 15000 });

  // ---- 2. Mount both hosts from the real modules. ----------------------------------------------
  const mountReport = await page.evaluate(async ({ record, siteId }) => {
    const [panelMod, stationMod] = await Promise.all([
      import('/src/ui/screens/shipLedger.js'),
      import('/src/ui/station/screens/ledger.js'),
    ]);
    const busEmits = [];
    const ctx = {
      state: { meta: { seed: 47 }, story: {}, sites: { worldOrder: [siteId], worldById: { [siteId]: record } } },
      bus: { emit(name, payload) { busEmits.push({ name, payload }); } },
    };
    window.__ctx = ctx;
    window.__busEmits = busEmits;
    window.__panelMod = panelMod;
    window.__stationMod = stationMod;

    // station host: through the real lifecycle adapter, exactly as stationApp mounts it.
    const station = stationMod.createLedgerScreen(ctx);
    document.getElementById('station-host').appendChild(station.el);
    station.onShow();

    // codex host: the same factory with the same options codex.js:406 passes.
    const codex = panelMod.createShipLedgerPanel(ctx, { hostId: 'codex', headingLevel: 2 });
    document.getElementById('codex-host').appendChild(codex.el);
    codex.onShow();

    window.__hosts = { station, codex };
    return { mounted: true, stationClass: station.el.className };
  }, { record: earnedRecord, siteId: SITE_ID });
  assert.equal(mountReport.mounted, true);

  // ---- 3. Information parity between the two hosts. ---------------------------------------------
  const parity = await page.evaluate(() => {
    const readRows = (root) => [...root.querySelectorAll('.st-ledger-entry')].map((li) => {
      const body = li.querySelector('.st-ledger-entry-body');
      const button = li.querySelector('[data-ledger-evidence]');
      return {
        type: li.getAttribute('data-ledger-entry-type'),
        cycle: li.querySelector('.st-ledger-cycle').textContent,
        line: li.querySelector('.st-ledger-line').textContent,
        aria: body ? body.getAttribute('aria-label') : null,
        pageId: button ? button.getAttribute('data-ledger-evidence') : null,
        buttonLabel: button ? button.textContent : null,
        buttonAria: button ? button.getAttribute('aria-label') : null,
      };
    });
    const collectIds = (root) => [...root.querySelectorAll('[id]')].map((el) => el.id);
    const station = document.getElementById('station-host');
    const codex = document.getElementById('codex-host');
    return {
      stationRows: readRows(station),
      codexRows: readRows(codex),
      stationIds: collectIds(station),
      codexIds: collectIds(codex),
      stationLabelledBy: station.querySelector('.st-ledger').getAttribute('aria-labelledby'),
      codexLabelledBy: codex.querySelector('.st-ledger').getAttribute('aria-labelledby'),
      stationHeadingTag: station.querySelector('.st-sub-h').tagName,
      codexHeadingTag: codex.querySelector('.st-sub-h').tagName,
      stationStatus: station.querySelector('.st-ledger-status').textContent,
      codexStatus: codex.querySelector('.st-ledger-status').textContent,
      duplicateIds: (() => {
        const all = [...collectIds(station), ...collectIds(codex)];
        return all.filter((id, i) => all.indexOf(id) !== i);
      })(),
      documentImages: document.querySelectorAll('img').length,
    };
  });
  report.parity = parity;

  check('row parity', () => {
    assert.deepEqual(parity.codexRows, parity.stationRows,
      'both hosts must render identical row information');
    assert.equal(parity.stationRows.length, 5, 'exactly the five earned rows are listed');
    assert.deepEqual(
      parity.stationRows.map((row) => row.pageId).sort(),
      [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort(),
    );
  });
  check('status parity', () => {
    assert.equal(parity.codexStatus, parity.stationStatus);
  });
  check('no duplicate DOM ids across hosts', () => {
    assert.deepEqual(parity.duplicateIds, [], `duplicate ids: ${parity.duplicateIds.join(', ')}`);
  });
  check('each host names itself from its own heading', () => {
    assert.equal(parity.stationLabelledBy, 'st-ledger-station-title');
    assert.equal(parity.codexLabelledBy, 'st-ledger-codex-title');
    assert.ok(parity.stationIds.includes(parity.stationLabelledBy));
    assert.ok(parity.codexIds.includes(parity.codexLabelledBy));
  });
  check('exactly two images exist, one per host', () => {
    assert.equal(parity.documentImages, 2, 'one bounded figure per mounted host, never a gallery');
  });

  // ---- 4. Media: every page's authored image admits, at its admitted asset id. -------------------
  const media = await page.evaluate(async ({ pageIds }) => {
    const out = [];
    const settle = (img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) return resolve('complete');
      const done = (kind) => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); resolve(kind); };
      const onLoad = () => done('load');
      const onError = () => done('error');
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onError);
      setTimeout(() => done('timeout'), 20000);
    });
    for (const hostId of ['station', 'codex']) {
      const root = document.getElementById(`${hostId}-host`);
      for (const pageId of pageIds) {
        const button = root.querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`);
        button.click();
        const img = root.querySelector('.st-ledger-figure-img');
        const settled = await settle(img);
        const figure = root.querySelector('.st-ledger-figure');
        const rect = img.getBoundingClientRect();
        const style = getComputedStyle(img);
        out.push({
          host: hostId,
          pageId,
          settled,
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          caption: root.querySelector('.st-ledger-figure-caption').textContent,
          provenance: root.querySelector('.st-ledger-provenance').textContent,
          detailTitle: root.querySelector('.st-ledger-detail-title').textContent,
          fragment: root.querySelector('.st-ledger-detail-fragment').textContent,
          body: root.querySelector('.st-ledger-detail-body').textContent,
          figureState: figure.getAttribute('data-ledger-figure-state'),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          renderedWidth: Math.round(rect.width),
          renderedHeight: Math.round(rect.height),
          objectFit: style.objectFit,
          maxWidth: style.maxWidth,
          figureBoxWidth: Math.round(figure.getBoundingClientRect().width),
          hostColumnWidth: Math.round(root.getBoundingClientRect().width),
          listHiddenWhileReading: root.querySelector('.st-ledger-list').hidden,
        });
        // return to the list so the next open is a fresh arm, exactly like a player browsing
        root.querySelector('[data-ledger-back]').click();
      }
    }
    return out;
  }, { pageIds: [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS] });
  report.media = media;

  check('all five images admit in both hosts', () => {
    for (const entry of media) {
      assert.notEqual(entry.settled, 'error', `${entry.host}/${entry.pageId} failed to load ${entry.src}`);
      assert.notEqual(entry.settled, 'timeout', `${entry.host}/${entry.pageId} never settled`);
      assert.ok(entry.naturalWidth > 0, `${entry.host}/${entry.pageId} has no decoded pixels`);
      assert.equal(entry.figureState, 'admitted');
      assert.ok(entry.alt && entry.alt.length > 10, `${entry.host}/${entry.pageId} is missing alt text`);
      assert.ok(entry.caption, `${entry.host}/${entry.pageId} is missing a caption`);
      assert.match(entry.provenance, /^Provenance: wreck_cathedral\//);
      assert.ok(entry.body && entry.body !== entry.fragment, 'page copy exceeds the flight fragment');
      assert.equal(entry.listHiddenWhileReading, true, 'the bounded list yields to one open page');
    }
    assert.equal(media.length, 10, 'five pages read in each of two hosts');
  });

  check('station and codex show identical media information', () => {
    // Layout measurements are deliberately excluded: the two columns are different widths on
    // purpose (to make the figure cap bind), so geometry differs while INFORMATION must not.
    const byHost = (host) => media.filter((entry) => entry.host === host).map(({
      host: _host, renderedWidth: _w, renderedHeight: _h, settled: _s,
      figureBoxWidth: _fw, hostColumnWidth: _cw, ...rest
    }) => rest);
    assert.deepEqual(byHost('codex'), byHost('station'),
      'the two hosts must resolve identical media, copy, and provenance');
  });

  check('media renders at a bounded crop rather than natural size', () => {
    const oversized = media.filter((entry) => entry.renderedWidth > MAX_FIGURE_WIDTH_PX);
    assert.deepEqual(
      oversized.map((entry) => `${entry.host}/${entry.pageId}=${entry.renderedWidth}px`),
      [],
      `authored media is rendering unconstrained (natural ${media[0].naturalWidth}x${media[0].naturalHeight}); `
      + 'no crop or max-width is being applied by any loaded stylesheet',
    );
  });

  check('the 720px figure cap binds — the bound is the rule, not the container', () => {
    // NON-VACUITY. With a host column narrower than the cap, `width:100%` alone yields a passing
    // number whether or not the max-width rule exists. The station column is 1000px wide precisely
    // so the cap has to do the work; deleting the rule makes this fail with 1000.
    const station = media.filter((entry) => entry.host === 'station');
    assert.ok(station.length === 5, 'five station opens were measured');
    for (const entry of station) {
      assert.ok(entry.hostColumnWidth > FIGURE_CAP_PX,
        `the station column (${entry.hostColumnWidth}px) must exceed the cap for this to prove anything`);
      assert.equal(entry.renderedWidth, FIGURE_CAP_PX,
        `${entry.pageId}: figure is ${entry.renderedWidth}px in a ${entry.hostColumnWidth}px column — the cap is not binding`);
    }
    // The narrower host proves the figure still fills a column below the cap rather than being fixed.
    for (const entry of media.filter((item) => item.host === 'codex')) {
      assert.ok(entry.renderedWidth < FIGURE_CAP_PX && entry.renderedWidth > 0,
        `${entry.pageId}: codex figure should track its ${entry.hostColumnWidth}px column, got ${entry.renderedWidth}px`);
    }
  });

  check('the crop is lossless — no authored evidence is cut out of the frame', () => {
    // THE ASSERTION THAT MATTERS. `object-fit: cover` is lossless only while the source aspect and
    // the box aspect agree. Every authored image is 16:9 today and the box is 16:9, so nothing is
    // cropped — but if a future page ships 4:3, `cover` would silently cut the frame and every other
    // assertion here would still pass (it loads, it decodes, it is admitted, it is under the width
    // bound). The packet forbids hiding evidence to pass, so the aspect agreement is asserted.
    for (const entry of media) {
      const natural = entry.naturalWidth / entry.naturalHeight;
      const rendered = entry.renderedWidth / entry.renderedHeight;
      assert.ok(Math.abs(rendered - natural) / natural <= 0.01,
        `${entry.host}/${entry.pageId}: rendered aspect ${rendered.toFixed(4)} differs from authored `
        + `${natural.toFixed(4)} (${entry.naturalWidth}x${entry.naturalHeight} -> `
        + `${entry.renderedWidth}x${entry.renderedHeight}) — object-fit:cover is cropping evidence`);
    }
  });

  // ---- 5. Exactly one request per open; nothing while hidden. ------------------------------------
  const requestsAfterReads = mediaRequests.length;
  report.requests = { afterFirstReads: requestsAfterReads, urls: [...mediaRequests] };
  check('exactly one media request per opened page', () => {
    assert.equal(requestsAfterReads, 10, `expected 10 requests for 5 pages x 2 hosts, saw ${requestsAfterReads}`);
    assert.equal(new Set(mediaRequests).size, 5, 'five distinct authored assets were requested');
  });

  // ---- 6. Hidden / reopen cleanup, repeated host switching. ---------------------------------------
  const beforeCycles = await page.evaluate(() => ({
    counters: JSON.parse(JSON.stringify(window.__sfCounters)),
    nodes: document.querySelectorAll('*').length,
    images: document.querySelectorAll('img').length,
  }));
  const requestsBeforeHiddenCycles = mediaRequests.length;

  const cycles = await page.evaluate(async ({ pageIds }) => {
    const settle = (img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) return resolve('complete');
      const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); resolve('settled'); };
      img.addEventListener('load', done);
      img.addEventListener('error', done);
      setTimeout(done, 8000);
    });
    const observed = [];
    for (let pass = 0; pass < 3; pass += 1) {
      for (const hostId of ['station', 'codex']) {
        const root = document.getElementById(`${hostId}-host`);
        const host = window.__hosts[hostId];
        const pageId = pageIds[pass % pageIds.length];
        root.querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`).click();
        const img = root.querySelector('.st-ledger-figure-img');
        await settle(img);
        // Host goes hidden mid-read: detail must collapse and the image source must be released.
        host.onHide();
        observed.push({
          pass,
          hostId,
          pageId,
          detailHiddenAfterHide: root.querySelector('.st-ledger-detail').hidden,
          srcAfterHide: img.getAttribute('src'),
          onloadAfterHide: img.onload,
          onerrorAfterHide: img.onerror,
          altAfterHide: img.getAttribute('alt'),
          rowsWhileHidden: root.querySelectorAll('.st-ledger-entry').length,
        });
        host.onShow();
        observed[observed.length - 1].rowsAfterReshow = root.querySelectorAll('.st-ledger-entry').length;
        observed[observed.length - 1].imagesAfterReshow = root.querySelectorAll('img').length;
      }
    }
    return observed;
  }, { pageIds: [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS] });

  const afterCycles = await page.evaluate(() => ({
    counters: JSON.parse(JSON.stringify(window.__sfCounters)),
    nodes: document.querySelectorAll('*').length,
    images: document.querySelectorAll('img').length,
    busEmits: window.__busEmits.length,
  }));
  report.cycles = { observed: cycles, before: beforeCycles, after: afterCycles };
  report.requests.afterHiddenCycles = mediaRequests.length;

  check('onHide collapses the detail and releases the image in every cycle', () => {
    for (const entry of cycles) {
      assert.equal(entry.detailHiddenAfterHide, true, `${entry.hostId} pass ${entry.pass}: detail stayed open`);
      assert.equal(entry.srcAfterHide, null, `${entry.hostId} pass ${entry.pass}: image source survived hide`);
      assert.equal(entry.onloadAfterHide, null, 'load handler detached');
      assert.equal(entry.onerrorAfterHide, null, 'error handler detached');
      assert.equal(entry.altAfterHide, null, 'alt released with the source');
      assert.equal(entry.rowsAfterReshow, 5, 'reopen restores exactly the five rows');
      assert.equal(entry.imagesAfterReshow, 1, 'reopen restores exactly one figure per host');
    }
  });

  check('repeated host switching leaks no node, image, listener, timer, or observer', () => {
    assert.equal(afterCycles.images, beforeCycles.images, 'image element count is stable');
    assert.equal(afterCycles.nodes, beforeCycles.nodes, 'DOM node count is stable across cycles');
    assert.equal(
      afterCycles.counters.addListener - afterCycles.counters.removeListener,
      beforeCycles.counters.addListener - beforeCycles.counters.removeListener,
      'net listener balance is unchanged by show/hide cycles',
    );
    assert.equal(afterCycles.counters.intervals, beforeCycles.counters.intervals, 'no interval was armed');
    assert.equal(afterCycles.counters.rafs, beforeCycles.counters.rafs, 'no rAF was armed');
    assert.equal(afterCycles.counters.observers, beforeCycles.counters.observers, 'no MutationObserver was armed');
  });

  check('a hidden host issues no media request', () => {
    // 6 opens across the cycles; anything beyond that came from a hidden host refreshing.
    const issued = mediaRequests.length - requestsBeforeHiddenCycles;
    assert.ok(issued <= 6, `hidden hosts issued extra media requests (${issued} for 6 opens)`);
  });

  // ---- 7. Focus order and focus return. -----------------------------------------------------------
  const focus = await page.evaluate(({ pageId }) => {
    const root = document.getElementById('station-host');
    const opener = root.querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`);
    opener.focus();
    const beforeOpen = document.activeElement === opener;
    opener.click();
    const back = root.querySelector('[data-ledger-back]');
    const focusOnBack = document.activeElement === back;
    const tabbables = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null || el === document.activeElement)
      .map((el) => el.className.split(' ')[0] || el.tagName);
    back.click();
    return {
      beforeOpen,
      focusOnBack,
      focusReturnedToOpener: document.activeElement === opener,
      openerIsEvidenceButton: document.activeElement === opener
        && document.activeElement.getAttribute('data-ledger-evidence') === pageId,
      tabbablesWhileReading: tabbables,
    };
  }, { pageId: WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS[0] });
  report.focus = focus;

  check('focus moves into the opened page and returns to its opener', () => {
    assert.equal(focus.beforeOpen, true, 'the evidence button is focusable');
    assert.equal(focus.focusOnBack, true, 'opening moves focus to the page-level Back control');
    assert.equal(focus.focusReturnedToOpener, true, 'Back returns focus to the exact opener');
    assert.equal(focus.openerIsEvidenceButton, true, 'the restored opener is the row that was activated');
    assert.ok(focus.tabbablesWhileReading.length > 0, 'the open page exposes reachable controls');
  });

  // ---- 8. Non-color semantics + legibility at normal and increased text scale. --------------------
  const scale = await page.evaluate(async ({ pageId }) => {
    const measureHost = (hostId) => {
      const root = document.getElementById(`${hostId}-host`);
      const title = root.querySelector('.st-ledger-detail-title');
      const body = root.querySelector('.st-ledger-detail-body');
      const prov = root.querySelector('.st-ledger-provenance');
      const box = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fontSize: style.fontSize,
          color: style.color,
          clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        };
      };
      return { title: box(title), body: box(body), provenance: box(prov) };
    };
    const openBoth = () => {
      for (const hostId of ['station', 'codex']) {
        document.getElementById(`${hostId}-host`)
          .querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`).click();
      }
    };
    const closeBoth = () => {
      for (const hostId of ['station', 'codex']) {
        document.getElementById(`${hostId}-host`).querySelector('[data-ledger-back]').click();
      }
    };
    openBoth();
    const normalBoth = { station: measureHost('station'), codex: measureHost('codex') };
    // The shipped text-scale knob is `--ui-scale` (ui.css:13 default, ui.css:45 drives #ui-root
    // font-size; Settings > Video range 0.75-1.5). Driving the browser root font-size instead would
    // move nothing and pass vacuously, because #ui-root pins its own px base.
    document.documentElement.style.setProperty('--ui-scale', '1.5');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const enlargedBoth = { station: measureHost('station'), codex: measureHost('codex') };
    document.documentElement.style.removeProperty('--ui-scale');
    closeBoth();

    const root = document.getElementById('station-host');
    const measure = () => {
      const title = root.querySelector('.st-ledger-detail-title');
      const body = root.querySelector('.st-ledger-detail-body');
      const prov = root.querySelector('.st-ledger-provenance');
      const box = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fontSize: style.fontSize,
          color: style.color,
          clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        };
      };
      return { title: box(title), body: box(body), provenance: box(prov) };
    };
    // Non-color semantics: the row type is carried by text + a data attribute, not by colour alone.
    const row = root.querySelector('.st-ledger-entry');
    return {
      normal: normalBoth.station,
      enlarged: enlargedBoth.station,
      byHost: { normal: normalBoth, enlarged: enlargedBoth },
      stationRootFontSize: getComputedStyle(document.getElementById('station-host')).fontSize,
      uiRootFontSize: getComputedStyle(document.getElementById('ui-root')).fontSize,
      typeText: row.querySelector('.st-ledger-type').textContent,
      typeAttr: row.getAttribute('data-ledger-entry-type'),
      rowAria: row.querySelector('.st-ledger-entry-body').getAttribute('aria-label'),
      figureStateAttr: root.querySelector('.st-ledger-figure').getAttribute('data-ledger-figure-state'),
    };
  }, { pageId: WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS[0] });
  report.textScale = scale;

  check('page copy stays legible and unclipped at normal and 150% text scale', () => {
    for (const host of ['station', 'codex']) {
      for (const [label, box] of Object.entries(scale.byHost.normal[host])) {
        assert.equal(box.clipped, false, `${host}/${label} is clipped at normal text scale`);
        assert.ok(parseFloat(box.fontSize) >= 13, `${host}/${label} is below a legible base size`);
      }
      for (const [label, box] of Object.entries(scale.byHost.enlarged[host])) {
        assert.equal(box.clipped, false, `${host}/${label} is clipped at 150% text scale`);
      }
    }
  });

  check('the Ledger panel itself pins no font size (it tracks --ui-scale where the host allows)', () => {
    // Non-vacuity, and the attribution that matters: in the Codex host — which sits directly under
    // #ui-root — every panel string grows with --ui-scale, proving the panel declares no px sizes of
    // its own. The station host does NOT grow, and the cause is one line of the station design
    // system: styles/station.css `.sx-app { font-size:15px }` pins the entire Orbital Command app.
    // That is a station-wide property, not a Ledger regression, and it is outside this write surface.
    for (const label of Object.keys(scale.byHost.normal.codex)) {
      const before = parseFloat(scale.byHost.normal.codex[label].fontSize);
      const after = parseFloat(scale.byHost.enlarged.codex[label].fontSize);
      assert.ok(after > before * 1.4,
        `codex/${label} did not track --ui-scale (${before}px -> ${after}px at 1.5x)`);
    }
    assert.equal(scale.stationRootFontSize, '15px',
      'the measured station pinning is still 15px — revisit this note if station.css changes');
  });
  check('meaning is carried without colour', () => {
    assert.equal(scale.typeText, 'WITNESS', 'the row type is spelled out, not colour-coded');
    assert.equal(scale.typeAttr, 'witness');
    assert.ok(scale.rowAria.includes('CYCLE'), 'the row exposes its cycle to assistive tech');
    assert.equal(scale.figureStateAttr, 'idle', 'figure state is an attribute, not a colour');
  });

  // ---- 9. Failure state, driven by a REAL error event (test-only bogus id). ------------------------
  const failure = await page.evaluate(async () => {
    // TEST ONLY: point one lookup at an asset id that was never admitted. Product code is untouched;
    // this rewrites the src on the live element to force the browser's real error event.
    const root = document.getElementById('codex-host');
    const pageId = root.querySelector('[data-ledger-evidence]').getAttribute('data-ledger-evidence');
    root.querySelector(`[data-ledger-evidence="${CSS.escape(pageId)}"]`).click();
    const img = root.querySelector('.st-ledger-figure-img');
    const errored = new Promise((resolve) => {
      const done = () => resolve(true);
      img.addEventListener('error', done, { once: true });
      setTimeout(() => resolve(false), 10000);
    });
    img.setAttribute('src', '/assets/ships/release/media/wreck-cathedral/evidence.not_admitted.png');
    const sawError = await errored;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const figure = root.querySelector('.st-ledger-figure');
    return {
      sawError,
      figureState: figure.getAttribute('data-ledger-figure-state'),
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt'),
      caption: root.querySelector('.st-ledger-figure-caption').textContent,
      stillHasCopy: root.querySelector('.st-ledger-detail-body').textContent.length > 0,
    };
  });
  report.failure = failure;

  check('an unadmitted asset renders an explicit accessible failure, never a substitute', () => {
    assert.equal(failure.sawError, true, 'the browser really failed the request');
    assert.equal(failure.figureState, 'failed');
    assert.equal(failure.src, null, 'the failed source is released, not swapped for another image');
    assert.match(failure.alt, /not admitted|unavailable/i, 'the failure is expressible as text');
    assert.match(failure.caption, /not admitted|unavailable/i);
    assert.equal(failure.stillHasCopy, true, 'the page copy survives a media failure');
  });

  check('the only failed request is the deliberate unadmitted asset', () => {
    assert.deepEqual(consoleErrors, [], `unexpected console errors: ${consoleErrors.join(' | ')}`);
    const unexpected = badResponses.filter((entry) => !entry.includes('evidence.not_admitted'));
    assert.deepEqual(unexpected, [], `unexpected failed requests: ${unexpected.join(' | ')}`);
    assert.equal(badResponses.length, 1, 'exactly one request failed, and it was the planted one');
    // Aborts are permitted, but only for the authored media the panel itself released.
    const strayAborts = abortedRequests.filter((entry) => !entry.includes(MEDIA_PREFIX));
    assert.deepEqual(strayAborts, [], `aborted requests outside the evidence media: ${strayAborts.join(' | ')}`);
  });
  report.badResponses = badResponses;
  report.abortedRequests = abortedRequests;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'ledger-hosts.json'), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: path.join(OUT_DIR, 'ledger-hosts.png'), fullPage: false });
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

if (failures.length) {
  console.error('PQ-021 two-host Ledger check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nreport: .devshots/pq021/ledger-hosts.json`);
  process.exitCode = 1;
} else {
  const first = report.media[0];
  console.log('PQ-021 two-host Ledger check OK');
  console.log(`  rows/host           ${report.parity.stationRows.length} (identical across hosts)`);
  console.log(`  media               ${report.media.length} opens, ${report.requests.afterFirstReads} requests, `
    + `${new Set(report.requests.urls).size} distinct assets`);
  console.log(`  figure              natural ${first.naturalWidth}x${first.naturalHeight} -> rendered `
    + `${first.renderedWidth}x${first.renderedHeight} (object-fit: ${first.objectFit})`);
  console.log(`  cycles              nodes ${report.cycles.before.nodes} -> ${report.cycles.after.nodes}, `
    + `images ${report.cycles.before.images} -> ${report.cycles.after.images}`);
  console.log(`  listeners (net)     ${report.cycles.before.counters.addListener - report.cycles.before.counters.removeListener}`
    + ` -> ${report.cycles.after.counters.addListener - report.cycles.after.counters.removeListener}`);
  console.log(`  timers/rafs/obs     ${report.cycles.after.counters.intervals}/${report.cycles.after.counters.rafs}/${report.cycles.after.counters.observers}`);
  console.log(`  report              .devshots/pq021/ledger-hosts.json`);
}

// ---- local dev server, same pattern as check-station-tab-navigation-runtime.mjs -------------------

async function startFreshServer() {
  const port = await findFreePort(8230);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + String(chunk)).slice(-4000); });
  child.stderr.on('data', (chunk) => { output = (output + String(chunk)).slice(-4000); });
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode != null) throw new Error(`Dev server exited before becoming reachable\n${output}`);
    if (await reachable(url)) return { baseUrl: url, kill: () => child.kill() };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`Dev server did not become reachable at ${url}\n${output}`);
}

async function reachable(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok || response.status === 404;
  } catch (_) {
    return false;
  }
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port += 1) if (await isPortFree(port)) return port;
  throw new Error('No free local port found for the PQ-021 Ledger host check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
