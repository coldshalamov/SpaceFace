import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';

// Execute the production nested allocator/flush owners with a small DOM geometry boundary.
// This checks ordering and placement; it does not simulate browser layout cost or pixels.
const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const names = new Set(['readReceiptRect', 'setReceiptStyle', 'setReceiptPlacementMode',
  'prepareReceiptLaneSize', 'prepareReceiptCaptionSize',
  'freeOverlayBands', 'placeCaptionInSafeSlot', 'placeOrdinaryCaptionInSafeBands',
  'placeReceiptLane', 'flushReceiptLane']);
const owners = [];
const extraNames = new Set(['placeExternalFlightCaptions', 'restoreYieldedFlightVisuals',
  'yieldFlightVisual', 'registerExternalFlightCaption', 'refreshExternalFlightCaption',
  'releaseExternalFlightCaption', 'clearExternalFlightCaptionPlacement',
  'refreshFlightTextObstacleSnapshot', 'plateBox', 'objectiveEdgeObstacles',
  'invalidateObjectiveEdgeBoxes', 'invalidateTransientOverlayGeometry', 'invalidateAndPlaceHudOverlays']);
const extraOwners = new Map();
let overlayResizeOwner;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'AssignmentExpression' && node.left?.name === 'overlayLayoutObserver'
    && node.right?.type === 'NewExpression' && node.right.callee?.name === 'ResizeObserver') {
    const callback = node.right.arguments[0];
    overlayResizeOwner = source.slice(callback.start, callback.end);
  }
  if (node.type === 'FunctionDeclaration' && extraNames.has(node.id?.name)) {
    extraOwners.set(node.id.name, source.slice(node.start, node.end));
    return;
  }
  if (node.type === 'FunctionDeclaration' && names.has(node.id?.name)) {
    owners.push(source.slice(node.start, node.end));
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(parse(source, { sourceType: 'module' }));

function fixture({ mode = 'shared', cards = 1, captionHeight = 56, captionSlot = true,
  externalOwner = false } = {}) {
  const events = [], reads = new Map();
  let dirty = false, flushes = 0;
  const read = (name, kind = 'rect') => {
    reads.set(`${name}:${kind}`, (reads.get(`${name}:${kind}`) || 0) + 1);
    events.push(`read:${name}:${kind}`);
    if (dirty) { flushes++; dirty = false; }
  };
  function element(name, box) {
    const el = { name, hidden: false, isConnected: true, dataset: {},
      matches: () => false, closest: () => null, contains: other => el === other,
      classList: { contains: () => false } };
    el.box = { ...box };
    el.style = new Proxy({}, { set(target, key, value) {
      events.push(`write:${name}:${key}`);
      if (key !== 'pointerEvents' && key !== 'opacity') dirty = true;
      target[key] = value;
      return true;
    } });
    el.getBoundingClientRect = () => {
      read(name);
      const left = Number.parseFloat(el.style.left) || el.box.left;
      const top = Number.parseFloat(el.style.top) || el.box.top;
      const width = Number.parseFloat(el.style.width) || el.box.width;
      const height = Math.min(el.box.height, Number.parseFloat(el.style.maxHeight) || Infinity);
      return { left, top, right: left + width, bottom: top + height, width, height };
    };
    Object.defineProperty(el, 'scrollHeight', { configurable: true,
      get() { read(name, 'scroll'); return el.box.height; } });
    return el;
  }
  const obstacle = element('mission', { left: 20, top: 240, width: 400, height: 80 });
  const control = element('touch', { left: 320, top: 520, width: 100, height: 160 });
  control.closest = selector => selector === '#sf-touch-overlay' ? {} : null;
  const caption = element('caption', { left: 0, top: 0, width: 120, height: captionHeight });
  caption.hidden = captionHeight === 0;
  caption.classList.contains = name => name === 'show' && !caption.hidden;
  // The profile is living combat with an already placed caption; first/moved columns are
  // exercised separately below. Starting constraints match the production final writer.
  Object.assign(caption.style, { position: 'absolute', left: '12px', right: 'auto', bottom: 'auto',
    width: 'fit-content', textAlign: 'center', transform: 'none' });
  events.length = 0;
  dirty = false;
  const receiptCards = Array.from({ length: cards }, (_, i) => element(`card${i}`, { left: 0, top: 0, width: 300, height: 44 }));
  const laneRoot = element('lane', { left: 0, top: 0, width: 300, height: cards * 44 });
  laneRoot.querySelector = () => receiptCards[0] || null;
  laneRoot.querySelectorAll = () => receiptCards;
  const layout = { viewport: { width: 1000 }, receipt: { width: 300, height: 50 } };
  const slot = { x: 12, width: 400, ...(captionSlot ? { captionSlot: { x: 12, width: 120 } } : {}) };
  let externalPlacements = 0;
  let published = [];
  let performanceNow = 0;
  const pendingTimers = [];
  const context = {
    Set,
    performance: { now: () => performanceNow },
    setTimeout: (fn) => { pendingTimers.push(fn); return pendingTimers.length; },
    clearTimeout: (id) => { if (id > 0 && id <= pendingTimers.length) pendingTimers[id - 1] = null; },
    root: { querySelectorAll: () => [obstacle], querySelector: () => true },
    document: { querySelectorAll: () => [], getElementById: id => id === 'toasts' ? laneRoot : null },
    window: { innerWidth: 1000, innerHeight: 720 },
    caption, toastsLaneEl: laneRoot, alertsEl: null, lastReceiptObstacle: null, lastCaptionObstacleVisible: null,
    externalFlightCaptions: new Set(), yieldedFlightVisuals: new Map(),
    externalCaptionOpacity: new Map(), overlayLayoutObserver: null,
    leftContext: null, rightDock: null,
    flightTextObstacleCache: { publish(entries) { published = entries; } },
    externalCaptionsStale: true, flightTextObstaclesStale: true, alertLanePlacementStale: true,
    receiptLanePlacementDirty: true,
    objectiveEdgeObstacles: () => ({}), responsiveOverlayObstacles: () => [control, obstacle],
    overlaySafeSlot: () => slot, resolveObjectiveHudLayout: () => layout,
    placeAlertLaneInSafeBands() {},
    placeExternalFlightCaptions() { externalPlacements++; },
    placeFlightReadouts() {}, refreshFlightTextObstacleSnapshot() {},
    invalidateReceiptLane() { context.receiptLanePlacementDirty = true; },
    setStyle(el, key, value) {
      const cache = el._sfStyle || (el._sfStyle = {});
      if (cache[key] !== value) { cache[key] = value; el.style[key] = value; }
    },
    getComputedStyle: () => ({ rowGap: '4px' }),
  };
  const extraCode = externalOwner ? [...extraOwners].filter(([name]) =>
    !['objectiveEdgeObstacles', 'invalidateObjectiveEdgeBoxes', 'invalidateTransientOverlayGeometry',
      'invalidateAndPlaceHudOverlays'].includes(name)).map(([, code]) => code).join('\n') : '';
  const api = runInNewContext(`let receiptPlacementMode = ${JSON.stringify(mode)};
    let receiptGeometryRects = new Map();
    let receiptGeometryReusable = false;
    let flightTextObstacleSnapshotAt = -Infinity;
    let flightTextObstacleRetry = null;
    const FLIGHT_TEXT_OBSTACLE_MIN_MS = 100;
    ${owners.join('\n')}; ${extraCode}; ({ freeOverlayBands, flushReceiptLane, placeReceiptLane, readReceiptRect,
      placeCaptionInSafeSlot, ${owners.some(s => s.startsWith('function setReceiptPlacementMode')) ? 'setReceiptPlacementMode,' : ''}
      ${owners.some(s => s.startsWith('function setReceiptStyle')) ? 'setReceiptStyle,' : ''}
      ${externalOwner ? 'registerExternalFlightCaption, refreshExternalFlightCaption, releaseExternalFlightCaption,' : ''}
      cacheActive: () => receiptGeometryRects !== null })`, context);
  return { ...api, context, slot, layout, obstacle, control, caption, laneRoot, receiptCards, reads, events,
    read, element, resetMeasurements() { reads.clear(); events.length = 0; dirty = false; flushes = 0; },
    advanceNow(ms) { performanceNow += ms; },
    flushTimers() { for (const fn of pendingTimers.splice(0)) { if (fn) fn(); } },
    get published() { return published; },
    get flushes() { return flushes; }, get externalPlacements() { return externalPlacements; } };
}

test('settled obstacles are read once across alternate bands and duplicate responsive candidates', () => {
  const fx = fixture();
  fx.freeOverlayBands(fx.slot, 720, fx.layout);
  fx.freeOverlayBands(fx.slot.captionSlot, 720, fx.layout);
  assert.equal(fx.reads.get('mission:rect'), 1, 'same element is not measured again for each selector or slot');
  assert.equal(fx.reads.get('touch:rect'), 1, 'real touch controls share the settled read');
});

test('flush batches wrapping constraints before measurement and reuses caption height', () => {
  const original = fixture({ mode: 'original' });
  const shared = fixture();
  original.flushReceiptLane();
  shared.flushReceiptLane();
  assert.deepEqual({ ...shared.laneRoot.style }, { ...original.laneRoot.style });
  assert.deepEqual({ ...shared.caption.style }, { ...original.caption.style });
  const firstRead = shared.events.findIndex(event => event.startsWith('read:'));
  assert.ok(shared.events.indexOf('write:lane:width') < firstRead);
  assert.ok(shared.events.indexOf('write:caption:maxWidth') < firstRead);
  assert.equal(shared.reads.get('caption:scroll'), 1);
  assert.equal(original.reads.get('caption:scroll'), 2);
  assert.equal(shared.flushes, 1, 'the small geometry boundary needs one read after the batch');
  assert.equal(original.flushes, 3, 'original alternates size/position writes and reads');
  assert.equal(shared.cacheActive(), false, 'no element geometry survives flush return');
});

test('actual geometry writes invalidate the whole settled stage; unchanged writes do not', () => {
  const fx = fixture();
  const before = JSON.stringify(fx.freeOverlayBands(fx.slot, 720, fx.layout));
  fx.setReceiptStyle(fx.obstacle, 'top', '40px');
  const after = JSON.stringify(fx.freeOverlayBands(fx.slot, 720, fx.layout));
  assert.notEqual(after, before);
  assert.equal(fx.reads.get('mission:rect'), 2);
  assert.equal(fx.reads.get('touch:rect'), 2, 'clear conservatively covers other boxes/ancestors');
  fx.setReceiptStyle(fx.obstacle, 'top', '40px');
  fx.freeOverlayBands(fx.slot, 720, fx.layout);
  assert.equal(fx.reads.get('mission:rect'), 2);
});

test('the next flush measures current mission/control geometry with no TTL or stale snapshot', () => {
  const fx = fixture({ captionSlot: false });
  fx.flushReceiptLane();
  const before = fx.laneRoot.style.top;
  fx.obstacle.box.top = 0;
  fx.obstacle.box.height = 600;
  fx.control.box.top = 600;
  fx.context.receiptLanePlacementDirty = true;
  fx.flushReceiptLane();
  assert.notEqual(fx.laneRoot.style.top, before);
  assert.equal(fx.reads.get('mission:rect'), 2);
  assert.equal(fx.reads.get('touch:rect'), 2);
  const reads = [...fx.reads];
  fx.flushReceiptLane();
  assert.deepEqual([...fx.reads], reads, 'a clean flush does no allocation or measurement');
});

test('caption-only, receipts-only and overflowing shared bands retain original placement and access', () => {
  for (const options of [
    { cards: 0 }, { captionHeight: 0 }, { cards: 0, captionHeight: 0 },
    { cards: 2, captionHeight: 600, captionSlot: false },
  ]) {
    const original = fixture({ ...options, mode: 'original' });
    const shared = fixture(options);
    const focused = {};
    for (const fx of [original, shared]) {
      fx.context.document.activeElement = focused;
      fx.laneRoot.focus = fx.caption.focus = () => assert.fail('placement must not move focus');
      fx.flushReceiptLane();
      assert.equal(fx.context.document.activeElement, focused);
      assert.equal(fx.externalPlacements, 1, 'external captions retain their original placement turn');
    }
    assert.deepEqual({ ...shared.laneRoot.style }, { ...original.laneRoot.style }, JSON.stringify(options));
    assert.deepEqual({ ...shared.caption.style }, { ...original.caption.style }, JSON.stringify(options));
    if (options.captionHeight === 600) {
      assert.equal(shared.caption.style.overflowY, 'auto');
      assert.equal(shared.caption.style.pointerEvents, 'auto', 'overflow remains reachable');
    }
    if (options.cards === 0 && options.captionHeight !== 0) {
      assert.equal(shared.reads.get('mission:rect'), 1, 'no discarded receipt-band walk before caption-only placement');
      assert.equal(original.reads.get('mission:rect'), 3);
      assert.equal(shared.flushes, 1, 'caption-only wrapping is also prepared before obstacles');
      assert.equal(original.flushes, 2);
    }
  }
});

test('a moved fit-content column keeps the original final height read and overflow decision', () => {
  const fx = fixture();
  fx.caption.style.left = '800px';
  const columns = [];
  Object.defineProperty(fx.caption, 'scrollHeight', { get() {
    fx.read('caption', 'scroll');
    columns.push([fx.caption.style.left, fx.caption.style.right, fx.caption.style.maxWidth]);
    return Number.parseFloat(fx.caption.style.maxWidth) < 200 ? 400 : 56;
  } });
  fx.flushReceiptLane();
  assert.deepEqual(columns, [['800px', 'auto', '120px'], ['800px', 'auto', '400px'], ['12px', 'auto', '400px']]);
  assert.equal(fx.caption.style.maxWidth, '400px');
  assert.equal(fx.caption.style.overflowY, 'visible');
});

test('exclusions and yielded parents still filter current blockers before band allocation', () => {
  const fx = fixture();
  const none = fx.freeOverlayBands(fx.slot, 720, fx.layout, new Set([fx.obstacle, fx.control]));
  assert.deepEqual(JSON.parse(JSON.stringify(none)), [{ top: 8, bottom: 712 }]);
  const parent = { contains: el => el === fx.obstacle };
  fx.context.yieldedFlightVisuals.set(parent, '');
  const bands = fx.freeOverlayBands(fx.slot, 720, fx.layout, fx.control);
  assert.deepEqual(JSON.parse(JSON.stringify(bands)), [{ top: 8, bottom: 712 }]);
});

test('mode switching invalidates placement without changing receipt content and errors release cache', () => {
  const fx = fixture();
  const cards = fx.receiptCards.slice();
  assert.throws(() => fx.setReceiptPlacementMode('typo'), /placement mode/i);
  for (const mode of ['original', 'shared', 'original', 'shared']) {
    assert.equal(fx.setReceiptPlacementMode(mode), mode);
    assert.equal(fx.context.receiptLanePlacementDirty, true);
    fx.flushReceiptLane();
    assert.deepEqual(fx.receiptCards, cards);
    assert.equal(fx.cacheActive(), false);
  }
  fx.context.receiptLanePlacementDirty = true;
  fx.context.overlaySafeSlot = () => { throw new Error('layout owner failed'); };
  assert.throws(() => fx.flushReceiptLane(), /layout owner failed/);
  assert.equal(fx.cacheActive(), false, 'failure cannot retain an element snapshot');
});

test('out-of-flow placement retains siblings but evicts moved descendants and ancestors', () => {
  const fx = fixture();
  const child = fx.receiptCards[0];
  const ancestor = fx.element('hud', { left: 0, top: 0, width: 1000, height: 720 });
  fx.laneRoot.contains = el => el === child || el === fx.laneRoot;
  ancestor.contains = el => el === fx.laneRoot || el === child;
  for (const el of [fx.obstacle, fx.control, fx.laneRoot, child, ancestor]) fx.readReceiptRect(el);
  fx.setReceiptStyle(fx.laneRoot, 'width', '220px');
  for (const el of [fx.obstacle, fx.control, fx.laneRoot, child, ancestor]) fx.readReceiptRect(el);
  assert.equal(fx.reads.get('mission:rect'), 1);
  assert.equal(fx.reads.get('touch:rect'), 1);
  for (const name of ['lane', 'card0', 'hud']) assert.equal(fx.reads.get(`${name}:rect`), 2);
});

test('real external caption search and final publisher share settled obstacles through wrapping writes', t => {
  const metrics = [];
  for (const mode of ['original', 'shared']) {
    const fx = fixture({ mode, externalOwner: true, captionSlot: false });
    for (let i = 0; i < 3; i++) {
      const notice = fx.element(`external${i}`, { left: 0, top: 0, width: 120, height: 48 });
      fx.registerExternalFlightCaption(notice);
    }
    assert.equal(fx.reads.size, 0, 'registration defers geometry to the pre-paint flush');
    fx.flushReceiptLane();
    fx.resetMeasurements();
    for (const notice of fx.context.externalFlightCaptions) fx.refreshExternalFlightCaption(notice);
    fx.flushReceiptLane();
    assert.equal(fx.published.filter(entry => entry.owner === 'flight-caption').length, 3);
    for (const entry of fx.published.filter(entry => entry.owner === 'flight-caption')) {
      assert.ok(entry.rect.top >= 8 && entry.rect.bottom <= 712);
    }
    metrics.push({ mode, missionReads: fx.reads.get('mission:rect'), touchReads: fx.reads.get('touch:rect'),
      fixtureReadAfterWriteBoundaries: fx.flushes });
    if (mode === 'shared') {
      assert.equal(fx.reads.get('mission:rect'), 1, 'caption width/position writes cannot dirty a sibling mission');
      assert.equal(fx.reads.get('touch:rect'), 1, 'controls are not reread by each caption and the publisher');
    }
  }
  assert.ok(metrics[0].missionReads > metrics[1].missionReads);
  assert.ok(metrics[0].touchReads > metrics[1].touchReads);
  assert.ok(metrics[0].fixtureReadAfterWriteBoundaries > metrics[1].fixtureReadAfterWriteBoundaries);
  t.diagnostic(JSON.stringify(metrics));
});

test('a settled external caption keeps its cap and avoids repeated size-write layout boundaries', () => {
  const fx = fixture({ externalOwner: true, cards: 0, captionHeight: 0 });
  const notice = fx.element('external', { left: 0, top: 0, width: 120, height: 48 });
  fx.registerExternalFlightCaption(notice);
  fx.flushReceiptLane();
  const placement = { ...notice.style };
  fx.resetMeasurements();
  fx.refreshExternalFlightCaption(notice);
  fx.flushReceiptLane();
  assert.deepEqual({ ...notice.style }, placement);
  assert.equal(fx.flushes, 0, 'unchanged natural wrapping does not toggle maxHeight none -> px');
  assert.equal(fx.reads.get('external:scroll'), 1, 'settled column reuses its measured height at final placement');
});

test('responsive resize, moving obstacles and arriving/refreshed/released critical text use current geometry', () => {
  const fx = fixture({ externalOwner: true, captionHeight: 0, cards: 0, captionSlot: false });
  fx.flushReceiptLane();
  const notice = fx.element('critical', { left: 0, top: 0, width: 120, height: 56 });
  notice.dataset.flightCritical = 'true';
  fx.registerExternalFlightCaption(notice);
  fx.flushReceiptLane();
  const top = Number.parseFloat(notice.style.top);
  assert.ok(top >= 8 && top + 56 <= 232, 'new critical text places in the largest clear band before the first paint');
  fx.context.window.innerWidth = 390;
  fx.context.window.innerHeight = 844;
  fx.layout.viewport.width = 390;
  fx.slot.width = 366;
  fx.obstacle.box = { left: 12, top: 8, width: 366, height: 200 };
  fx.control.box = { left: 250, top: 620, width: 128, height: 216 };
  fx.refreshExternalFlightCaption(notice);
  fx.flushReceiptLane();
  assert.equal(notice.style.maxWidth, '366px');
  assert.ok(Number.parseFloat(notice.style.top) >= 208);
  assert.ok(Number.parseFloat(notice.style.top) + 56 <= 612);
  fx.obstacle.box.height = 400;
  fx.refreshExternalFlightCaption(notice);
  fx.flushReceiptLane();
  assert.ok(Number.parseFloat(notice.style.top) >= 408, 'a moving/growing obstacle is remeasured on the next flush');
  assert.equal(fx.releaseExternalFlightCaption(notice), true);
  fx.advanceNow(150);
  fx.flushReceiptLane();
  fx.flushTimers();
  assert.equal(notice.style.top, '', 'release restores caller placement');
  assert.equal(fx.published.some(entry => entry.owner === 'flight-caption'), false);
  assert.equal(fx.context.externalCaptionOpacity.size, 0);
  const reads = [...fx.reads];
  fx.flushReceiptLane();
  assert.deepEqual([...fx.reads], reads, 'no repeated read after cleanup settles');
});

test('transient invalidation preserves structural boxes; resize batches objective reads before one changed CSS write', () => {
  const events = [];
  const structural = (name, left) => ({ isConnected: true, getBoundingClientRect() {
    events.push(`read:${name}`);
    return { left, top: 400, right: left + 100, bottom: 700, width: 100, height: 300 };
  } });
  const left = structural('left', 12), right = structural('right', 880), rail = structural('rail', 20);
  let dockValue = '';
  const context = {
    objectiveEdgeBoxes: { stale: true }, leftContext: left, rightDock: right,
    orreryCluster: { host: { querySelector: () => rail } }, root: { querySelector: () => rail },
    readReceiptRect: el => el.getBoundingClientRect(),
    document: { documentElement: { style: {
      getPropertyValue: () => dockValue,
      setProperty(key, value) { events.push(`write:${key}`); dockValue = value; },
    } } },
    externalCaptionsStale: false, flightTextObstaclesStale: false, alertLanePlacementStale: false,
    receiptLanePlacementDirty: false,
    invalidateReceiptLane() { context.receiptLanePlacementDirty = true; },
  };
  const api = runInNewContext([...extraOwners].filter(([name]) =>
    ['plateBox', 'objectiveEdgeObstacles', 'invalidateObjectiveEdgeBoxes',
      'invalidateTransientOverlayGeometry', 'invalidateAndPlaceHudOverlays'].includes(name))
    .map(([, code]) => code).join('\n') +
    '; ({ objectiveEdgeObstacles, invalidateTransientOverlayGeometry, invalidateAndPlaceHudOverlays })', context);
  api.objectiveEdgeObstacles();
  assert.deepEqual(events, ['read:left', 'read:right', 'read:rail', 'write:--sf-rightdock-left']);
  events.length = 0;
  for (let i = 0; i < 20; i++) {
    api.invalidateTransientOverlayGeometry();
    api.objectiveEdgeObstacles();
  }
  assert.deepEqual(events, [], 'moving callouts do not remeasure settled structural boxes');
  for (const key of ['externalCaptionsStale', 'flightTextObstaclesStale', 'alertLanePlacementStale',
    'receiptLanePlacementDirty']) assert.equal(context[key], true, `${key} still invalidates`);
  api.invalidateAndPlaceHudOverlays();
  api.objectiveEdgeObstacles();
  assert.deepEqual(events, ['read:left', 'read:right', 'read:rail'], 'resize remeasures, unchanged CSS is not rewritten');
  events.length = 0;
  const notice = {};
  const resize = runInNewContext(`(${overlayResizeOwner})`, {
    externalFlightCaptions: new Set([notice]),
    invalidateTransientOverlayGeometry: api.invalidateTransientOverlayGeometry,
    invalidateAndPlaceHudOverlays: api.invalidateAndPlaceHudOverlays,
  });
  resize([{ target: notice }]);
  api.objectiveEdgeObstacles();
  assert.deepEqual(events, [], 'caption-only ResizeObserver delivery keeps the structural cache');
  resize([{ target: notice }, { target: left }]);
  api.objectiveEdgeObstacles();
  assert.deepEqual(events, ['read:left', 'read:right', 'read:rail'], 'mixed delivery still remeasures real HUD resize');
});
