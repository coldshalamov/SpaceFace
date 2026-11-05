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
function visit(node) {
  if (!node || typeof node !== 'object') return;
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

function fixture({ mode = 'shared', cards = 1, captionHeight = 56, captionSlot = true } = {}) {
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
  const context = {
    Set,
    root: { querySelectorAll: () => [obstacle], querySelector: () => true },
    document: { querySelectorAll: () => [], getElementById: () => laneRoot },
    window: { innerWidth: 1000, innerHeight: 720 },
    caption, toastsLaneEl: laneRoot, lastReceiptObstacle: null, lastCaptionObstacleVisible: null,
    externalFlightCaptions: new Set(), yieldedFlightVisuals: new Map(),
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
  const api = runInNewContext(`let receiptPlacementMode = ${JSON.stringify(mode)};
    let receiptGeometryRects = new Map();
    ${owners.join('\n')}; ({ freeOverlayBands, flushReceiptLane, placeReceiptLane,
      placeCaptionInSafeSlot, ${owners.some(s => s.startsWith('function setReceiptPlacementMode')) ? 'setReceiptPlacementMode,' : ''}
      ${owners.some(s => s.startsWith('function setReceiptStyle')) ? 'setReceiptStyle,' : ''}
      cacheActive: () => receiptGeometryRects !== null })`, context);
  return { ...api, context, slot, layout, obstacle, control, caption, laneRoot, receiptCards, reads, events,
    read, get flushes() { return flushes; }, get externalPlacements() { return externalPlacements; } };
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
