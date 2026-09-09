// PQ-184.01 — the visible-window list, driven by a 2,000-row fixture against the production
// component (`src/ui/virtualList.js`), not a copy of it.
//
// The DOM here follows the harness the ship-ledger and band-UI tests already use: a hand-rolled
// MiniNode/MiniDocument with no layout box. That absence is the point — it is exactly why the
// component takes its geometry as input. A list that could only read `clientHeight` back off the
// element would mount zero rows here and the fixture could not exist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createVirtualList } from '../src/ui/virtualList.js';

const ROW_COUNT = 2000;
const ROW_EXTENT = 30;
const VIEWPORT = 600; // 20 rows fit; with the default overscan of 4 the window stays well under 40

// ---------------------------------------------------------------------------------------------
// Minimal DOM. Same shape as test/depth-program-a2-ship-ledger.test.mjs, plus the few members the
// list touches: className, style-less elements, attribute-based `closest`, and focus tracking.
// ---------------------------------------------------------------------------------------------

class MiniNode {
  constructor(tagName = '', fragment = false) {
    this.tagName = String(tagName).toUpperCase();
    this.isFragment = fragment;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
  }

  append(...nodes) { for (const node of nodes) this.appendChild(node); }

  appendChild(node) {
    if (!node) return node;
    if (node.isFragment) {
      for (const child of [...node.children]) this.appendChild(child);
      node.children = [];
      return node;
    }
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }

  // One listener per type is enough for this harness and matches the existing ledger stub.
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    const set = this.listeners.get(type);
    if (set) { set.delete(listener); if (!set.size) this.listeners.delete(type); }
  }

  listenerCount() {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  dispatch(type, event = {}) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) listener({ ...event, target: event.target || this });
  }

  // Attribute selectors only — that is all the component uses (`[data-vlist-key]`).
  closest(selector) {
    const attr = /^\[([^\]]+)\]$/.exec(selector);
    if (attr && this.attributes.has(attr[1])) return this;
    return this.parentNode && this.parentNode.closest ? this.parentNode.closest(selector) : null;
  }

  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}

class MiniDocument {
  constructor() { this.activeElement = null; this.head = null; }
  createElement(tagName) {
    const node = new MiniNode(tagName);
    node.ownerDocument = this;
    return node;
  }
  createDocumentFragment() {
    const node = new MiniNode('', true);
    node.ownerDocument = this;
    return node;
  }
}

function withDom(fn) {
  const previousDocument = globalThis.document;
  const previousResizeObserver = globalThis.ResizeObserver;
  const documentRef = new MiniDocument();
  globalThis.document = documentRef;
  // No ResizeObserver in this host, exactly like a node run of a screen module. The component must
  // degrade to explicit refresh() rather than throw.
  delete globalThis.ResizeObserver;
  try {
    return fn(documentRef);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousResizeObserver;
  }
}

// ---------------------------------------------------------------------------------------------
// The fixture: 2,000 rows shaped like the station market's commodity rows (stable id, a name to
// sort by, a price that ticks) so the component is exercised the way a real consumer would.
// ---------------------------------------------------------------------------------------------

function makeRows(count = ROW_COUNT) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `cmdty_${String(i).padStart(4, '0')}`,
      name: `Commodity ${String(count - i).padStart(4, '0')}`, // name order is the reverse of id order
      price: 100 + ((i * 37) % 900),
      family: ['ore', 'volatiles', 'tech', 'bio'][i % 4],
    });
  }
  return rows;
}

function mountList(documentRef, overrides = {}) {
  const host = documentRef.createElement('div');
  const built = [];
  const list = createVirtualList({
    el: host,
    rowExtent: ROW_EXTENT,
    viewportExtent: VIEWPORT,
    items: makeRows(),
    role: 'tablist',
    ariaLabel: 'Commodities',
    renderRow(item, info) {
      built.push(item.id);
      const node = documentRef.createElement('button');
      node.className = 'sx-mkt-row' + (info.selected ? ' is-active' : '');
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(info.selected));
      node.textContent = `${item.name} — ${item.price} cr`;
      return node;
    },
    ...overrides,
  });
  return { host, list, built };
}

// A row element among the container's children (the spacers sit at either end).
function mountedRows(host) {
  return host.children.filter((child) => child.hasAttribute('data-vlist-key'));
}

function spacerExtents(host) {
  const spacers = host.children.filter((child) => child.getAttribute('role') === 'presentation');
  return spacers.map((s) => Number(s.getAttribute('data-extent')));
}

// ---------------------------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------------------------

test('2,000 rows mount a bounded window, not 2,000 elements', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);

    const rows = mountedRows(host);
    assert.equal(list.getItems().length, ROW_COUNT, 'the component still owns all 2,000 items');
    assert.ok(rows.length > 0, 'a non-empty list must mount at least one row');
    // 20 rows fit the viewport; overscan 4 each side. Anything near 2,000 means no windowing.
    assert.ok(
      rows.length <= 40,
      `expected a bounded window, mounted ${rows.length} of ${ROW_COUNT}`,
    );
    assert.equal(list.getMountedCount(), rows.length, 'the row pool tracks the window, not the data');

    // The unmounted rows are accounted for by the spacers, so the scroll range is still 2,000 rows
    // deep even though only ~29 elements exist.
    const [lead, tail] = spacerExtents(host);
    const range = list.getRange();
    assert.equal(lead, range.start * ROW_EXTENT);
    assert.equal(tail, (ROW_COUNT - range.end) * ROW_EXTENT);
    assert.equal(lead + rows.length * ROW_EXTENT + tail, ROW_COUNT * ROW_EXTENT);
  });
});

test('the window stays bounded while scrolling the whole 2,000-row range', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);
    let worst = 0;
    const seen = new Set();
    for (let offset = 0; offset <= list.getMaxScroll(); offset += ROW_EXTENT * 7) {
      list.setScrollOffset(offset);
      const rows = mountedRows(host);
      worst = Math.max(worst, rows.length);
      for (const row of rows) seen.add(row.getAttribute('data-vlist-key'));
    }
    assert.ok(worst <= 40, `window grew to ${worst} rows while scrolling`);
    // Scrolling the full range must actually reveal the whole list, not just re-show the head.
    assert.ok(seen.size > 1500, `scrolling only ever mounted ${seen.size} distinct rows`);

    // The last row is reachable, and the tail spacer collapses at the bottom.
    list.setScrollOffset(list.getMaxScroll());
    const keys = mountedRows(host).map((r) => r.getAttribute('data-vlist-key'));
    assert.ok(keys.includes('cmdty_1999'), 'the final row must mount at the end of the range');
    assert.equal(spacerExtents(host)[1], 0, 'nothing is left below the last row');
  });
});

test('selection survives sorting, filtering and data updates by stable identity', () => {
  withDom((documentRef) => {
    const { list } = mountList(documentRef);
    const rows = makeRows();

    list.setSelectedKey('cmdty_1200');
    assert.equal(list.getSelectedKey(), 'cmdty_1200');
    const indexBefore = list.getActiveIndex();

    // Sort by name — which is the exact reverse of id order, so every index moves.
    const sorted = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    list.setItems(sorted);
    assert.equal(list.getSelectedKey(), 'cmdty_1200', 'a sort must not move the selection');
    assert.notEqual(list.getActiveIndex(), indexBefore, 'the fixture must actually reorder');
    assert.equal(list.getItems()[list.getActiveIndex()].id, 'cmdty_1200');

    // A price tick: same identities, new objects. Selection is untouched.
    list.setItems(sorted.map((r) => ({ ...r, price: r.price + 1 })));
    assert.equal(list.getSelectedKey(), 'cmdty_1200');

    // A filter that KEEPS the selection.
    const keepsIt = sorted.filter((r) => r.family === 'ore' || r.id === 'cmdty_1200');
    list.setItems(keepsIt);
    assert.equal(list.getSelectedKey(), 'cmdty_1200', 'a filter that keeps the row keeps it selected');

    // A filter that REMOVES it falls to the first remaining row — reported through the return
    // value, not a re-entrant onSelect.
    const dropsIt = sorted.filter((r) => r.id !== 'cmdty_1200').slice(0, 50);
    const result = list.setItems(dropsIt);
    assert.equal(result.selectedKey, dropsIt[0].id);
    assert.equal(list.getSelectedKey(), dropsIt[0].id);
    assert.equal(list.getActiveIndex(), 0);
  });
});

test('a selected row far outside the window is scrolled back into view', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);
    assert.equal(list.getScrollOffset(), 0);

    list.setSelectedKey('cmdty_1750');
    const keys = mountedRows(host).map((r) => r.getAttribute('data-vlist-key'));
    assert.ok(keys.includes('cmdty_1750'), 'selecting a distant row must mount it');
    assert.ok(list.getScrollOffset() > 0, 'and must move the scroll offset to reach it');

    // Scroll away, then ask for the selection back — the explicit contract the screens call.
    list.setScrollOffset(0);
    assert.ok(!mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_1750'));
    list.scrollSelectedIntoView();
    assert.ok(
      mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_1750'),
      'scrollSelectedIntoView must bring the selection back',
    );
  });
});

test('keyboard reaches every row including the first and last, and focus lands on it', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);

    const activeRow = () => documentRef.activeElement;
    const keyOf = (node) => (node ? node.getAttribute('data-vlist-key') : null);

    // End: row 1,999 is nowhere near the DOM before this keypress.
    host.dispatch('keydown', { key: 'End' });
    assert.equal(list.getActiveKey(), 'cmdty_1999');
    assert.equal(keyOf(activeRow()), 'cmdty_1999', 'End must focus the real last row element');
    assert.equal(activeRow().getAttribute('tabindex'), '0', 'the focused row is the tab stop');

    // Home: back to row 0, equally far away.
    host.dispatch('keydown', { key: 'Home' });
    assert.equal(list.getActiveKey(), 'cmdty_0000');
    assert.equal(keyOf(activeRow()), 'cmdty_0000');

    // Exactly one tab stop exists among the mounted rows.
    const tabStops = mountedRows(host).filter((r) => r.getAttribute('tabindex') === '0');
    assert.equal(tabStops.length, 1, 'roving tabindex must expose exactly one tab stop');

    // Arrows walk one row at a time and stay on the focused element.
    host.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(list.getActiveKey(), 'cmdty_0001');
    assert.equal(keyOf(activeRow()), 'cmdty_0001');
    host.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(list.getActiveKey(), 'cmdty_0000');

    // Arrow-up at the top does not wrap past the start.
    host.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(list.getActiveKey(), 'cmdty_0000');

    // PageDown advances by a viewport of rows and the target is mounted and focused.
    host.dispatch('keydown', { key: 'PageDown' });
    assert.equal(list.getActiveKey(), 'cmdty_0020');
    assert.equal(keyOf(activeRow()), 'cmdty_0020');

    // Enter selects the focused row.
    host.dispatch('keydown', { key: 'Enter' });
    assert.equal(list.getSelectedKey(), 'cmdty_0020');
  });
});

test('every row is reachable by held ArrowDown from the first to the last', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef, { items: makeRows(120) });
    host.dispatch('keydown', { key: 'Home' });
    const visited = [list.getActiveKey()];
    for (let i = 0; i < 200; i++) {
      host.dispatch('keydown', { key: 'ArrowDown' });
      const key = list.getActiveKey();
      if (visited[visited.length - 1] !== key) visited.push(key);
      if (key === 'cmdty_0119') break;
    }
    assert.equal(visited.length, 120, 'arrowing down must visit all 120 rows exactly once each');
    assert.equal(visited[0], 'cmdty_0000');
    assert.equal(visited[119], 'cmdty_0119');
    assert.equal(new Set(visited).size, 120, 'no row may be skipped or repeated');
  });
});

test('accessible counts report the full list while only a window is mounted', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);
    assert.equal(host.getAttribute('role'), 'tablist', 'the caller keeps its own container role');
    assert.equal(host.getAttribute('aria-label'), 'Commodities');
    assert.equal(host.getAttribute('data-vlist-total'), String(ROW_COUNT));
    // `aria-rowcount` belongs to the table/grid family. The market rail is a tablist, and its row
    // total reaches assistive tech through per-row aria-setsize/aria-posinset instead — stamping
    // an invalid ARIA pairing on the container would be a regression, not a courtesy.
    assert.equal(host.getAttribute('aria-rowcount'), null, 'a tablist must not claim a row count');

    list.setScrollOffset(ROW_EXTENT * 900);
    for (const row of mountedRows(host)) {
      const index = Number(row.getAttribute('data-vlist-index'));
      assert.equal(
        row.getAttribute('aria-setsize'), String(ROW_COUNT),
        'each row must report the true 2,000-row set size, not the mounted count',
      );
      assert.equal(
        row.getAttribute('aria-posinset'), String(index + 1),
        'each row must report its true position in the full list',
      );
      assert.equal(row.getAttribute('role'), 'tab', 'the caller keeps its own row role');
    }

    // The set size follows a data change rather than going stale.
    list.setItems(makeRows(37));
    assert.equal(host.getAttribute('data-vlist-total'), '37');
    for (const row of mountedRows(host)) {
      assert.equal(row.getAttribute('aria-setsize'), '37');
    }
  });
});

test('a grid-role container does get aria-rowcount', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef, { role: 'grid' });
    assert.equal(host.getAttribute('aria-rowcount'), String(ROW_COUNT));
    list.setItems(makeRows(12));
    assert.equal(host.getAttribute('aria-rowcount'), '12');
    list.setItems([]);
    assert.equal(host.getAttribute('aria-rowcount'), '0');
  });
});

test('an empty list mounts no rows, reports zero, and can be refilled', () => {
  withDom((documentRef) => {
    let emptyBuilt = 0;
    const { host, list } = mountList(documentRef, {
      renderEmpty() {
        emptyBuilt++;
        const node = documentRef.createElement('div');
        node.className = 'sx-mkt-browser__empty';
        node.textContent = 'No commodities match this filter.';
        return node;
      },
    });

    list.setItems([]);
    assert.equal(mountedRows(host).length, 0, 'an empty list mounts no rows');
    assert.equal(list.getMountedCount(), 0);
    assert.equal(list.getSelectedKey(), null);
    assert.equal(host.getAttribute('data-vlist-total'), '0');
    assert.equal(emptyBuilt, 1, 'the empty state is rendered once');
    assert.equal(host.children.length, 1, 'only the empty node is mounted — no stray spacers');

    // Keyboard on an empty list is inert rather than throwing.
    assert.doesNotThrow(() => host.dispatch('keydown', { key: 'End' }));
    assert.equal(list.getActiveKey(), null);

    // Refilling restores a real window.
    list.setItems(makeRows(500));
    assert.ok(mountedRows(host).length > 0, 'refilling must mount rows again');
    assert.equal(host.getAttribute('data-vlist-total'), '500');
  });
});

test('the window follows a resize, and shrinking the data clamps the scroll offset', () => {
  withDom((documentRef) => {
    let viewportExtent = VIEWPORT;
    // Overrides the viewport only. A partial measure() must be safe: the component keeps owning
    // the scroll offset rather than reading NaN back out of a host with no layout.
    const { host, list } = mountList(documentRef, { measure: () => ({ viewportExtent }) });
    const before = mountedRows(host).length;

    viewportExtent = VIEWPORT * 3; // the station panel was widened
    list.refresh();
    const after = mountedRows(host).length;
    assert.ok(after > before, `a larger viewport must mount more rows (${before} -> ${after})`);
    assert.ok(after <= 80, 'but still a bounded window, not the whole list');

    viewportExtent = 120; // and narrowed
    list.refresh();
    assert.ok(mountedRows(host).length < after, 'a smaller viewport must mount fewer rows');

    // Scrolled deep, then the list shrinks under us: the offset must not strand the view past the
    // end with an empty window.
    viewportExtent = VIEWPORT;
    list.refresh();
    list.setScrollOffset(list.getMaxScroll());
    list.setItems(makeRows(10));
    assert.ok(list.getScrollOffset() <= list.getMaxScroll(), 'offset must clamp to the new range');
    assert.ok(mountedRows(host).length > 0, 'a shrunken list must still show its rows');
    assert.equal(mountedRows(host).length, 10);
  });
});

test('a hidden list does not rebuild, and show/hide/destroy leak no listeners', () => {
  withDom((documentRef) => {
    const { host, list, built } = mountList(documentRef);
    const listenersWhileLive = host.listenerCount();
    assert.ok(listenersWhileLive > 0, 'the list must actually bind listeners to test teardown');

    list.onHide();
    const builtAtHide = built.length;
    list.setItems(makeRows());
    list.setScrollOffset(ROW_EXTENT * 500);
    list.refresh();
    assert.equal(built.length, builtAtHide, 'a hidden list must not rebuild rows for nobody');
    assert.equal(list.isHidden(), true);

    list.onShow();
    assert.ok(built.length > builtAtHide, 'showing again rebuilds the visible window');
    assert.ok(mountedRows(host).length > 0);

    // Repeated show/hide must not stack listeners.
    list.onHide(); list.onShow(); list.onHide(); list.onShow();
    assert.equal(host.listenerCount(), listenersWhileLive, 'show/hide cycles must not stack listeners');

    list.destroy();
    assert.equal(host.listenerCount(), 0, 'destroy must remove every listener it added');
    assert.equal(host.children.length, 0, 'destroy must empty the container');
    assert.equal(list.getMountedCount(), 0, 'destroy must release the row pool');
    assert.equal(list.isDestroyed(), true);
    assert.doesNotThrow(() => list.destroy(), 'destroy must be idempotent');
    assert.doesNotThrow(() => host.dispatch('keydown', { key: 'End' }));
  });
});

test('clicking a row selects it and reports the key the caller gave it', () => {
  withDom((documentRef) => {
    const selected = [];
    const activated = [];
    const { host, list } = mountList(documentRef, {
      onSelect: (key) => selected.push(key),
      onActivate: (key) => activated.push(key),
    });

    list.setScrollOffset(ROW_EXTENT * 300);
    const row = mountedRows(host)[2];
    const key = row.getAttribute('data-vlist-key');
    host.dispatch('click', { target: row });

    assert.equal(list.getSelectedKey(), key);
    assert.deepEqual(selected, [key]);
    assert.deepEqual(activated, [key]);

    // A click on the container itself (not a row) is ignored rather than clearing the selection.
    host.dispatch('click', { target: host });
    assert.equal(list.getSelectedKey(), key);
    assert.deepEqual(selected, [key], 'no spurious selection event from a non-row click');
  });
});

test('clicking back onto the selected row moves the tab stop with it', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);
    list.setSelectedKey('cmdty_0000');

    // Arrow focus away from the selection without selecting anything (manual activation).
    host.dispatch('keydown', { key: 'ArrowDown' });
    host.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(list.getActiveKey(), 'cmdty_0002');
    assert.equal(list.getSelectedKey(), 'cmdty_0000', 'arrowing must not change the selection');

    // Click back on the still-selected row: selection is unchanged, but the tab stop must follow.
    const row = list.getRowElement('cmdty_0000');
    host.dispatch('click', { target: row });
    assert.equal(list.getSelectedKey(), 'cmdty_0000');
    assert.equal(list.getActiveKey(), 'cmdty_0000');
    const tabStops = mountedRows(host).filter((r) => r.getAttribute('tabindex') === '0');
    assert.equal(tabStops.length, 1, 'exactly one tab stop after clicking the selected row');
    assert.equal(tabStops[0].getAttribute('data-vlist-key'), 'cmdty_0000');
  });
});

test('a list with no selection does not gain one from a data update', () => {
  withDom((documentRef) => {
    const { list } = mountList(documentRef);
    assert.equal(list.getSelectedKey(), null, 'nothing is selected until something selects it');

    list.setItems(makeRows(300));
    assert.equal(
      list.getSelectedKey(), null,
      'a price tick must not light up a row the player never chose',
    );

    // Once a selection exists, the filtered-out fallback still applies.
    list.setSelectedKey('cmdty_0100');
    list.setItems(makeRows(300).filter((r) => r.id !== 'cmdty_0100'));
    assert.equal(list.getSelectedKey(), 'cmdty_0000');
  });
});

test('scrolling reuses row elements instead of rebuilding the window every tick', () => {
  withDom((documentRef) => {
    const { list, built } = mountList(documentRef);
    const afterMount = built.length;

    // One row of travel should cost about one new row, not a whole window rebuild.
    list.setScrollOffset(ROW_EXTENT);
    const cost = built.length - afterMount;
    assert.ok(cost <= 4, `scrolling one row rebuilt ${cost} rows; the pool is not being reused`);

    // A data update, by contrast, must rebuild — a reused row would show a stale price.
    const rebuiltFrom = built.length;
    list.setItems(makeRows().map((r) => ({ ...r, price: r.price + 5 })));
    assert.ok(built.length > rebuiltFrom, 'new data must re-render rows rather than reuse stale ones');
  });
});

test('the horizontal axis windows on width, as the station market rail needs', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef, { axis: 'x', rowExtent: 166, viewportExtent: 1200 });
    const rows = mountedRows(host);
    assert.ok(rows.length > 0 && rows.length <= 40, `horizontal window mounted ${rows.length} rows`);
    list.setScrollOffset(list.getMaxScroll());
    assert.ok(
      mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_1999'),
      'the horizontal rail must reach its last row',
    );
    assert.equal(spacerExtents(host)[1], 0);
  });
});

// ---------------------------------------------------------------------------------------------
// The live station rail: a gapped horizontal flex container whose rows draw their own selected
// state. These three are the cases a naive windowing pass gets wrong on a real screen.
// ---------------------------------------------------------------------------------------------

test('a gapped container places every row where an un-windowed list would', () => {
  withDom((documentRef) => {
    // The station market rail: 236px cards with a 6px flex gap, so the pitch is 242.
    const GAP = 6;
    const PITCH = 242;
    const { host, list } = mountList(documentRef, {
      axis: 'x', rowExtent: PITCH, gap: GAP, viewportExtent: 1200,
    });

    // A flex gap sits between EVERY pair of items, so the true content width of N rows is
    // N*pitch minus the trailing gap — and the spacers have to reproduce exactly that.
    const contentExtent = () => {
      const [lead, tail] = spacerExtents(host);
      const rows = mountedRows(host).length;
      const items = (lead > 0 ? 1 : 0) + rows + (tail > 0 ? 1 : 0);
      return lead + tail + rows * (PITCH - GAP) + Math.max(0, items - 1) * GAP;
    };
    const expected = ROW_COUNT * PITCH - GAP;

    // At the head: the lead spacer must be absent, or its own gap would shove card 0 off the rail.
    assert.equal(spacerExtents(host)[0], 0, 'nothing stands in front of the first row');
    assert.equal(contentExtent(), expected, 'head: total width matches the un-windowed rail');

    for (const offset of [PITCH, PITCH * 17 + 30, PITCH * 900, list.getMaxScroll()]) {
      list.setScrollOffset(offset);
      assert.equal(contentExtent(), expected, `width drifted at offset ${offset}`);
      // Row i sits at i*pitch: the lead spacer plus its gap has to equal the first row's offset.
      const [lead] = spacerExtents(host);
      const firstIndex = Number(mountedRows(host)[0].getAttribute('data-vlist-index'));
      assert.equal(
        lead + (lead > 0 ? GAP : 0), firstIndex * PITCH,
        `first mounted row landed off its true offset at ${offset}`,
      );
    }
    assert.equal(spacerExtents(host)[1], 0, 'nothing stands after the last row');
  });
});

test('a row whose selected state changed is rebuilt, not reused from the pool', () => {
  withDom((documentRef) => {
    // Rows draw their own selection, exactly as the market card writes `is-active`/aria-selected.
    const { host, list, built } = mountList(documentRef);
    const classOf = (key) => {
      const node = list.getRowElement(key);
      return node ? node.className : null;
    };
    const selectedOf = (key) => {
      const node = list.getRowElement(key);
      return node ? node.getAttribute('aria-selected') : null;
    };

    list.setSelectedKey('cmdty_0002');
    assert.match(classOf('cmdty_0002'), /is-active/, 'the newly selected row must show as selected');
    assert.equal(selectedOf('cmdty_0002'), 'true');

    const rebuilt = built.length;
    list.setSelectedKey('cmdty_0005');
    assert.match(classOf('cmdty_0005'), /is-active/, 'selection must move to the new row');
    assert.doesNotMatch(
      classOf('cmdty_0002'), /is-active/,
      'the previous row must lose its selected markup — a pooled row would keep it',
    );
    assert.equal(selectedOf('cmdty_0002'), 'false');
    // Only the two rows whose state changed are rebuilt; the rest of the window is still pooled.
    assert.ok(built.length - rebuilt <= 3, `changing selection rebuilt ${built.length - rebuilt} rows`);
  });
});

test('scrolling the active row away leaves a mounted tab stop and arrows resume from it', () => {
  withDom((documentRef) => {
    const { host, list } = mountList(documentRef);
    list.setSelectedKey('cmdty_0000');
    assert.equal(list.getActiveIndex(), 0);

    // The player wheel-scrolls far past the selection. Without a stand-in stop, no mounted row
    // would carry tabindex="0" and Tab would skip the whole rail.
    list.setScrollOffset(ROW_EXTENT * 900);
    const rows = mountedRows(host);
    const stops = rows.filter((r) => r.getAttribute('tabindex') === '0');
    assert.equal(stops.length, 1, 'exactly one mounted row must remain tab-reachable');
    const stopKey = stops[0].getAttribute('data-vlist-key');
    assert.equal(stopKey, rows[0].getAttribute('data-vlist-key'), 'the stop falls to the first mounted row');
    assert.equal(list.getSelectedKey(), 'cmdty_0000', 'scrolling must not change the selection');

    // The next arrow press steps from the row the player can actually see.
    host.dispatch('keydown', { key: 'ArrowDown' });
    const expected = `cmdty_${String(Number(stopKey.slice(6)) + 1).padStart(4, '0')}`;
    assert.equal(list.getActiveKey(), expected, 'arrows resume from the visible stand-in row');

    // A sort that moves the selection off screen must NOT lose it: the active index still points
    // at the selected row even though a stand-in is carrying the tab stop.
    list.setScrollOffset(0);
    list.setSelectedKey('cmdty_1500');
    list.setScrollOffset(0);
    assert.equal(list.getActiveIndex(), 1500, 'the active index keeps the selection off screen');
    assert.equal(
      mountedRows(host).filter((r) => r.getAttribute('tabindex') === '0').length, 1,
      'and a mounted row still carries the tab stop',
    );
  });
});

test('a live pitch correction re-windows without rebuilding the list', () => {
  withDom((documentRef) => {
    // A caller whose row size comes from CSS can only measure it once the element has a box.
    const { host, list } = mountList(documentRef, { axis: 'x', rowExtent: 242, viewportExtent: 1200 });
    assert.equal(list.getRowExtent(), 242);
    const before = mountedRows(host).length;

    list.setRowExtent(154); // the narrow breakpoint: smaller cards, so more of them fit
    assert.equal(list.getRowExtent(), 154);
    assert.ok(mountedRows(host).length > before, 'a smaller pitch must mount more rows');
    assert.equal(list.getItems().length, ROW_COUNT, 'and must not disturb the data');

    list.setScrollOffset(list.getMaxScroll());
    assert.ok(
      mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_1999'),
      'the last row is still reachable at the corrected pitch',
    );
  });
});

// Both of the following were found by driving the live station rail in a real browser, not here —
// they are pinned in the fixture so the next change to the module has to keep them.

test('a scroll the element has taken but not yet reported is adopted, not overwritten', () => {
  withDom((documentRef) => {
    const host = documentRef.createElement('div');
    host.clientHeight = VIEWPORT;
    host.clientWidth = 0;
    host.scrollTop = 0;
    const list = createVirtualList({
      el: host, rowExtent: ROW_EXTENT, items: makeRows(),
      renderRow: (item) => { const n = documentRef.createElement('button'); n.textContent = item.name; return n; },
    });

    // A host scrolls the box and refreshes its data in the SAME task. Scroll events are async, so
    // our listener has not run yet — mirroring the cached offset back here would drag the player
    // to where they used to be. (A wheel scroll under scroll-behavior:smooth does exactly this.)
    host.scrollTop = 300 * ROW_EXTENT;
    list.setItems(makeRows().map((r) => ({ ...r, price: r.price + 1 })));
    assert.equal(list.getScrollOffset(), 300 * ROW_EXTENT, 'the live offset must win over the cached one');
    assert.equal(host.scrollTop, 300 * ROW_EXTENT, 'and must not be written back to the stale value');
    assert.ok(mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_0300'));

    // An explicit reset is still a reset.
    list.setItems(makeRows(), { preserveScroll: false });
    assert.equal(list.getScrollOffset(), 0);
  });
});

test('the module scrolls instantly even when the container asks for smooth behaviour', () => {
  withDom((documentRef) => {
    const host = documentRef.createElement('div');
    host.clientHeight = VIEWPORT;
    host.clientWidth = 0;
    host.scrollTop = 0;
    // The live rail declares `scroll-behavior: smooth`. Under it a scrollTop write only STARTS an
    // animation: the element keeps reporting the old offset for the rest of the task and the
    // window gets re-derived from every intermediate frame, so End lands mid-list.
    const seen = [];
    host.style = {
      _b: 'smooth',
      get scrollBehavior() { return this._b; },
      set scrollBehavior(v) { this._b = v; seen.push(v); },
    };
    const list = createVirtualList({
      el: host, rowExtent: ROW_EXTENT, items: makeRows(),
      renderRow: (item) => { const n = documentRef.createElement('button'); n.textContent = item.name; return n; },
    });

    host.dispatch('keydown', { key: 'End' });
    assert.equal(list.getActiveKey(), 'cmdty_1999');
    assert.equal(list.getScrollOffset(), list.getMaxScroll(), 'End must land at the end in one step');
    assert.ok(seen.includes('auto'), 'the write must be forced instant');
    assert.equal(host.style.scrollBehavior, 'smooth', 'and the container keeps its own behaviour after');
  });
});

// The fixture above deliberately runs without layout. A real browser DOES report a layout box and
// DOES accept a scrollTop write, so that path needs its own proof: the component must measure the
// live element when it can, and mirror its offset back onto it so the browser's own scrollbar,
// wheel and trackpad agree with the window it rendered.
test('with a live layout box it measures the element and mirrors the offset back', () => {
  withDom((documentRef) => {
    const host = documentRef.createElement('div');
    // A browser-shaped element: a real viewport box and writable scroll offsets.
    host.clientHeight = VIEWPORT;
    host.clientWidth = 0;
    host.scrollTop = 0;
    host.scrollLeft = 0;

    const list = createVirtualList({
      el: host,
      rowExtent: ROW_EXTENT,
      items: makeRows(),
      // No viewportExtent and no measure(): the element's own box is the only source.
      renderRow: (item) => {
        const node = documentRef.createElement('button');
        node.textContent = item.name;
        return node;
      },
    });

    const windowed = mountedRows(host).length;
    assert.ok(windowed > 0 && windowed <= 40, `measured window mounted ${windowed} rows`);

    // Programmatic scroll must reach the element, or the browser's scrollbar would sit at the top
    // while the rendered window sat in the middle of the list.
    list.scrollToKey('cmdty_1500', { align: 'start' });
    assert.equal(host.scrollTop, 1500 * ROW_EXTENT, 'the offset must be mirrored onto the element');
    assert.ok(mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_1500'));

    // A user scroll (wheel/trackpad/scrollbar) moves the element first; the scroll event must pull
    // that value in and re-window against it.
    host.scrollTop = 300 * ROW_EXTENT;
    host.dispatch('scroll', {});
    assert.equal(list.getScrollOffset(), 300 * ROW_EXTENT);
    assert.ok(mountedRows(host).some((r) => r.getAttribute('data-vlist-key') === 'cmdty_0300'));

    // A browser can report a scroll beyond the range during rubber-banding; clamp rather than
    // mounting an empty window past the end.
    host.scrollTop = 999999;
    host.dispatch('scroll', {});
    assert.equal(list.getScrollOffset(), list.getMaxScroll());
    assert.ok(mountedRows(host).length > 0, 'an over-scroll must still show the tail of the list');

    list.destroy();
  });
});

test('native scrolling inside the mounted window does not reorder the DOM', () => {
  withDom((documentRef) => {
    const host = documentRef.createElement('div');
    host.clientHeight = VIEWPORT;
    host.scrollTop = 0;
    const list = createVirtualList({
      el: host, rowExtent: ROW_EXTENT, items: makeRows(),
      renderRow: () => documentRef.createElement('button'),
    });
    let reorders = 0;
    const replace = host.replaceChildren.bind(host);
    host.replaceChildren = (...nodes) => { reorders++; return replace(...nodes); };
    for (let px = 1; px < ROW_EXTENT; px++) {
      host.scrollTop = px;
      host.dispatch('scroll');
    }
    assert.equal(reorders, 0);
    assert.equal(list.getScrollOffset(), ROW_EXTENT - 1);
    host.scrollTop = ROW_EXTENT * 8;
    host.dispatch('scroll');
    assert.equal(reorders, 1, 'crossing the overscan boundary mounts the next window');
    list.destroy();
  });
});

test('the module holds no ambient DOM or timing dependencies at import time', async () => {
  const source = await readFile(new URL('../src/ui/virtualList.js', import.meta.url), 'utf8');
  // The sim/UI split: no wall clock, no ambient randomness, and no import-time DOM work.
  assert.ok(!/Math\.random\(/.test(source), 'no ambient randomness');
  assert.ok(!/Date\.now\(/.test(source), 'no wall clock');
  assert.match(source, /if \(styleInjected \|\| typeof document === 'undefined'/,
    'style injection stays lazy and guarded so a headless import is DOM-free');
  assert.match(source, /typeof ResizeObserver [!=]== 'function'/,
    'ResizeObserver use must be feature-detected for non-browser hosts');
});
