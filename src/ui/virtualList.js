// Shared visible-window list (PQ-184.01). One list component every long surface mounts, so a
// 2,000-row table costs the same DOM as a 20-row one.
//
// WHY THIS SHAPE:
//
// 1. GEOMETRY IS INJECTABLE, NOT MEASURED-ONLY. The window is derived from `rowExtent` +
//    `viewportExtent` + a scroll offset this module owns. A component that could only read
//    `clientHeight`/`scrollTop` back off the DOM would be undrivable in the repo's node test
//    harness (a hand-rolled MiniNode with no layout box), and would also read 0 during the frame
//    a screen is mounted-but-hidden. The offset is therefore tracked here and *mirrored* to the
//    real element when one exists — headless and headed take the identical code path.
//
// 2. IT IMPOSES NO ROLE AND NO MARKUP. The live station market rail is a horizontal `tablist` of
//    `role="tab"` buttons; the ledger is a vertical `ol` of `li`. Callers keep their own element,
//    role, classes and row content; this module only decides WHICH rows exist right now, and
//    stamps the three attributes windowing would otherwise break (`aria-setsize`,
//    `aria-posinset`, roving `tabindex`).
//
// 3. SELECTION IS BY KEY, NEVER BY INDEX. Sorting, filtering and price ticks all reorder the
//    array; an index-keyed selection silently jumps to a different commodity. `setItems` re-finds
//    the selected key in the new array, so the row you picked stays the row you picked.
//
// 4. ACCESSIBLE COUNTS ARE THE POINT. With ~20 of 2,000 rows in the DOM, assistive tech would
//    announce "1 of 20" without an explicit set size. Every mounted row carries its true position
//    in the full list.
//
// 5. THE GAP IS PART OF THE GEOMETRY. The live station rail is `display:flex; gap:6px`, and a flex
//    gap sits between EVERY pair of items — including the spacers. `rowExtent` is therefore the
//    row PITCH (card size + gap), and each spacer gives one gap back so the mounted rows land on
//    exactly the offsets the un-windowed list would have used. A spacer that computes to zero is
//    hidden outright rather than sized to 0: a zero-width flex item still costs its neighbouring
//    gap, which would push the first card 6 px off the rail's left edge.
//
// The caller still owns data shaping — sort, filter and search happen in the screen and arrive
// here as a finished array, exactly as `listControls.js` documents for the shared list controls.

const DEFAULT_OVERSCAN = 4;
// Enough to fill any realistic surface if a caller supplies neither a layout box nor an explicit
// viewport. Never 0: a zero viewport would mount nothing and read as "the list is broken".
const FALLBACK_VIEWPORT_EXTENT = 480;

let styleInjected = false;

// The spacers are the only markup this module owns, so they are the only thing it styles. Injected
// lazily rather than at import time so a headless import of a consumer screen stays DOM-free.
function injectStyle() {
  if (styleInjected || typeof document === 'undefined' || !document.head) return;
  if (typeof document.createElement !== 'function') return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'sf-virtual-list-style';
  style.textContent = `
  /* Spacers stand in for the unmounted rows. flex:0 0 auto so a flex rail (the market's
     .sx-mkt__list is display:flex) cannot shrink them and collapse the scroll range. */
  .sf-vlist__spacer { flex:0 0 auto; pointer-events:none; }
  `;
  document.head.appendChild(style);
}

function toInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : (value > hi ? hi : value);
}

function defaultGetKey(item, index) {
  if (item && typeof item === 'object') {
    if (item.id != null) return String(item.id);
    if (item.key != null) return String(item.key);
  }
  if (item != null && typeof item !== 'object') return String(item);
  return `#${index}`;
}

// `style` is absent on the node test harness and on document fragments; every write is optional.
function setExtent(node, axis, px) {
  if (!node) return;
  // Always expose the logical extent as an attribute: it is the only channel a DOM without layout
  // (tests, and any future headless budget probe) can assert the scroll range through.
  if (typeof node.setAttribute === 'function') node.setAttribute('data-extent', String(px));
  if (!node.style) return;
  // A zero spacer is removed from layout, not merely sized to zero: inside a gapped flex or grid
  // container a 0 px item still contributes its gap, which would offset the whole visible window.
  node.style.display = px > 0 ? '' : 'none';
  const size = `${px}px`;
  if (axis === 'x') {
    node.style.width = size;
    node.style.minWidth = size;
  } else {
    node.style.height = size;
    node.style.minHeight = size;
  }
  // A flex container ignores width/height on a 0-basis child; set the basis too so the spacer
  // holds its ground in both a block and a flex list.
  node.style.flex = `0 0 ${size}`;
}

/**
 * Create a visible-window list over `items`.
 *
 * @param {object} opts
 * @param {HTMLElement} [opts.el]            Existing scroll container to drive. One is created if absent.
 * @param {'x'|'y'} [opts.axis='y']          Scroll axis. The market rail is 'x'; most lists are 'y'.
 * @param {number} opts.rowExtent            Row PITCH along the axis in px — card size PLUS `gap`.
 *                                           Required and > 0.
 * @param {number} [opts.gap=0]              The container's flex/grid gap in px, if it has one.
 * @param {number} [opts.viewportExtent]     Viewport size along the axis when layout is unavailable.
 * @param {function():{viewportExtent:number,scrollOffset:number}} [opts.measure] Geometry override.
 * @param {number} [opts.overscan=4]         Rows mounted beyond each edge, to cover fast scrolls.
 * @param {Array} [opts.items=[]]            The finished (already sorted/filtered) row data.
 * @param {function(*,number):string} [opts.getKey] Stable identity per item. Defaults to `item.id`.
 * @param {function(*,object):HTMLElement} opts.renderRow Build one row element. Required.
 * @param {function():HTMLElement} [opts.renderEmpty] Node shown when `items` is empty.
 * @param {string} [opts.role]               Role for the container (e.g. 'tablist', 'listbox').
 * @param {string} [opts.ariaLabel]          Accessible name for the container.
 * @param {string} [opts.selectedKey]        Initially selected key.
 * @param {boolean} [opts.selectionFollowsFocus=false] Move selection with arrow keys (tablist style).
 * @param {function(string,*)} [opts.onSelect]   Fired when the selected key changes.
 * @param {function(string,*)} [opts.onActivate] Fired on Enter/Space or click.
 * @param {function(object)} [opts.onVisibleChange] Fired when the mounted range changes.
 */
export function createVirtualList(opts = {}) {
  const renderRow = typeof opts.renderRow === 'function' ? opts.renderRow : null;
  if (!renderRow) throw new TypeError('createVirtualList: renderRow(item, info) is required');
  if (!(Number(opts.rowExtent) > 0)) {
    throw new TypeError('createVirtualList: rowExtent must be a positive number of px');
  }
  // Not const: a caller that derives the pitch from CSS can re-measure the live card once the
  // element has a layout box and correct it through setRowExtent() (see the station market rail).
  let rowExtent = Math.max(1, toInt(opts.rowExtent, 1));

  injectStyle();

  const axis = opts.axis === 'x' ? 'x' : 'y';
  const gap = Math.max(0, toInt(opts.gap, 0));
  const overscan = Math.max(0, toInt(opts.overscan, DEFAULT_OVERSCAN));
  const getKey = typeof opts.getKey === 'function' ? opts.getKey : defaultGetKey;
  const renderEmpty = typeof opts.renderEmpty === 'function' ? opts.renderEmpty : null;
  const measure = typeof opts.measure === 'function' ? opts.measure : null;
  const selectionFollowsFocus = opts.selectionFollowsFocus === true;
  const emit = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };

  const root = opts.el || (typeof document !== 'undefined' && document.createElement
    ? document.createElement('div')
    : null);
  if (!root) throw new TypeError('createVirtualList: no element and no document to create one');
  if (typeof root.setAttribute === 'function') {
    if (opts.role) root.setAttribute('role', opts.role);
    if (opts.ariaLabel) root.setAttribute('aria-label', opts.ariaLabel);
  }
  // `aria-rowcount` belongs to the table/grid family only. Stamping it on the market rail's
  // `tablist` would be an invalid ARIA pairing, so the row total reaches a tablist the way ARIA
  // intends — per-row `aria-setsize`/`aria-posinset`, which `tab` does accept. `data-vlist-total`
  // carries the same number with no ARIA meaning, for the fixture and any headless node probe.
  const countRole = String(opts.role || '');
  const usesRowCount = countRole === 'grid' || countRole === 'table' || countRole === 'treegrid';

  const makeSpacer = () => {
    const node = document.createElement('div');
    node.className = 'sf-vlist__spacer';
    node.setAttribute('aria-hidden', 'true');
    // role=presentation keeps a bare div from breaking a strict tablist/listbox child contract.
    node.setAttribute('role', 'presentation');
    setExtent(node, axis, 0);
    return node;
  };
  const leadSpacer = makeSpacer();
  const tailSpacer = makeSpacer();

  let items = Array.isArray(opts.items) ? opts.items.slice() : [];
  let keys = items.map((item, i) => getKey(item, i));
  let keyToIndex = buildKeyIndex(keys);

  let selectedKey = opts.selectedKey != null ? String(opts.selectedKey) : null;
  let activeIndex = selectedKey != null && keyToIndex.has(selectedKey) ? keyToIndex.get(selectedKey) : 0;
  let scrollOffset = 0;
  let hidden = false;
  let destroyed = false;
  let hadFocus = false;
  let range = { start: 0, end: 0 };
  // Row elements are reused while the data is unchanged, so scrolling costs a reorder rather than
  // a rebuild. Cleared whenever setItems lands, because any row could now be stale.
  let pool = new Map();
  // Selection and focus are rendered INTO the caller's row markup (the market card carries
  // `is-active` and `aria-selected`), so a pooled row whose selected/active state has moved on is
  // as stale as one with a changed price. Keyed the same as the pool; a mismatch rebuilds that row
  // and nothing else, which is why changing selection costs two rows rather than a whole window.
  let poolFlags = new Map();
  let resizeObserver = null;

  function buildKeyIndex(list) {
    const map = new Map();
    for (let i = 0; i < list.length; i++) if (!map.has(list[i])) map.set(list[i], i);
    return map;
  }

  function viewport() {
    if (measure) {
      const m = measure() || {};
      const v = Number(m.viewportExtent);
      if (Number.isFinite(v) && v > 0) return v;
    }
    const live = axis === 'x' ? root.clientWidth : root.clientHeight;
    if (Number.isFinite(live) && live > 0) return live;
    const declared = Number(opts.viewportExtent);
    if (Number.isFinite(declared) && declared > 0) return declared;
    return FALLBACK_VIEWPORT_EXTENT;
  }

  // The pitch counts one gap per row; the list as a whole has one fewer gap than rows, so the
  // trailing gap is given back. Matches what the browser lays out for an un-windowed list.
  function totalExtent() { return items.length ? items.length * rowExtent - gap : 0; }

  function maxScroll() { return Math.max(0, totalExtent() - viewport()); }

  // The window: the rows the viewport covers, widened by overscan on both sides.
  function computeRange() {
    if (!items.length) return { start: 0, end: 0 };
    const first = Math.floor(scrollOffset / rowExtent) - overscan;
    const visibleCount = Math.ceil(viewport() / rowExtent) + 1;
    const start = clamp(first, 0, Math.max(0, items.length - 1));
    const end = clamp(start + visibleCount + overscan * 2, 0, items.length);
    return { start, end };
  }

  function rowInfo(index) {
    return {
      index,
      key: keys[index],
      selected: keys[index] === selectedKey,
      active: index === activeIndex,
      total: items.length,
    };
  }

  // The three attributes windowing breaks. Everything else on the row belongs to the caller.
  function stampRow(node, index) {
    if (!node || typeof node.setAttribute !== 'function') return;
    node.setAttribute('aria-setsize', String(items.length));
    node.setAttribute('aria-posinset', String(index + 1));
    node.setAttribute('data-vlist-key', keys[index]);
    node.setAttribute('data-vlist-index', String(index));
    // Roving tabindex: exactly one row is tab-reachable, and it is always a mounted one because
    // every focus move scrolls its target into the window first.
    node.setAttribute('tabindex', index === activeIndex ? '0' : '-1');
  }

  function flagsOf(index) {
    return `${keys[index] === selectedKey ? 1 : 0}${index === activeIndex ? 1 : 0}`;
  }

  function buildRow(index) {
    const key = keys[index];
    const cached = pool.get(key);
    const flags = flagsOf(index);
    // A cached row whose selected/active state still matches is reused as-is; one whose state
    // moved is thrown away, because the caller drew that state into its own markup.
    if (cached && poolFlags.get(key) === flags) { stampRow(cached, index); return cached; }
    const node = renderRow(items[index], rowInfo(index));
    if (node) { stampRow(node, index); pool.set(key, node); poolFlags.set(key, flags); }
    return node;
  }

  function setCount(total) {
    if (typeof root.setAttribute !== 'function') return;
    root.setAttribute('data-vlist-total', String(total));
    if (usesRowCount) root.setAttribute('aria-rowcount', String(total));
  }

  // Scrolling — or a sort that moves the selection — can carry the active row out of the window,
  // and a tab stop that is not in the DOM drops the whole list out of the tab order. A mounted
  // stand-in carries the stop instead: the selected row while it is on screen, otherwise the first
  // mounted row. `activeIndex` itself is deliberately NOT moved, so re-sorting the data never
  // loses the player's place; the next keypress adopts the stand-in as its starting point, so an
  // arrow press always steps from a row that is actually visible.
  function tabStopIndex(window_) {
    if (!items.length) return 0;
    if (activeIndex >= window_.start && activeIndex < window_.end) return activeIndex;
    const selectedIndex = selectedKey != null ? keyToIndex.get(selectedKey) : undefined;
    if (selectedIndex != null && selectedIndex >= window_.start && selectedIndex < window_.end) {
      return selectedIndex;
    }
    return window_.start;
  }

  // `replaceChildren` detaches every child, and detaching the focused element sends focus back to
  // the document body — a wheel scroll would silently drop the player out of the list. Re-focus
  // the same element when it survives into the new window, with preventScroll so restoring focus
  // cannot fight the scroll that triggered the render.
  // Asks the DOM, not our own focusin bookkeeping: a host page that has not been given system
  // focus can set document.activeElement without ever firing focusin, and a restore gated on that
  // flag would silently stop working there.
  function focusedRowKey() {
    if (typeof document === 'undefined') return null;
    const active = document.activeElement;
    if (!active || typeof active.getAttribute !== 'function') return null;
    if (typeof root.contains === 'function' && !root.contains(active)) return null;
    return active.getAttribute('data-vlist-key');
  }

  function restoreFocus(key) {
    if (key == null) return;
    const node = pool.get(key);
    if (node && typeof node.focus === 'function') {
      try { node.focus({ preventScroll: true }); } catch { node.focus(); }
    }
  }

  function render() {
    if (destroyed || hidden) return range;
    const next = computeRange();
    const children = [];
    const refocusKey = focusedRowKey();

    if (!items.length) {
      pool.clear();
      poolFlags.clear();
      setExtent(leadSpacer, axis, 0);
      setExtent(tailSpacer, axis, 0);
      if (renderEmpty) {
        const node = renderEmpty();
        if (node) children.push(node);
      }
      root.replaceChildren(...children);
      setCount(0);
      range = next;
      emit(opts.onVisibleChange, { start: 0, end: 0, mounted: 0, total: 0 });
      return range;
    }

    // One gap per present spacer is handed back to the rows it stands in for; a spacer at either
    // end of the data computes to 0 and setExtent takes it out of layout entirely.
    setExtent(leadSpacer, axis, next.start > 0 ? next.start * rowExtent - gap : 0);
    const trailing = items.length - next.end;
    setExtent(tailSpacer, axis, trailing > 0 ? trailing * rowExtent - gap : 0);

    children.push(leadSpacer);
    const live = new Set();
    for (let i = next.start; i < next.end; i++) {
      const node = buildRow(i);
      if (node) { children.push(node); live.add(keys[i]); }
    }
    children.push(tailSpacer);

    // Drop pooled rows that left the window so the pool cannot grow to the full item count — the
    // whole point of the component is that memory tracks the window, not the data.
    for (const key of [...pool.keys()]) if (!live.has(key)) { pool.delete(key); poolFlags.delete(key); }

    // Stamped after the loop so it wins over the `-1` stampRow gave this row.
    const stop = tabStopIndex(next);
    if (stop !== activeIndex) {
      const stopNode = pool.get(keys[stop]);
      if (stopNode && typeof stopNode.setAttribute === 'function') stopNode.setAttribute('tabindex', '0');
    }

    root.replaceChildren(...children);
    setCount(items.length);
    range = next;
    if (refocusKey != null && live.has(refocusKey)) restoreFocus(refocusKey);
    emit(opts.onVisibleChange, {
      start: next.start, end: next.end, mounted: next.end - next.start, total: items.length,
    });
    return range;
  }

  // Owning the offset (rather than reading it back) is what makes the window identical headless
  // and headed; the write to the element is a mirror, not the source of truth.
  function applyScroll(px) {
    const nextOffset = clamp(Math.round(px), 0, maxScroll());
    const changed = nextOffset !== scrollOffset;
    scrollOffset = nextOffset;
    // A scroll container may declare `scroll-behavior: smooth` — the station market rail does.
    // Under it, this assignment ANIMATES: the element keeps reporting the old offset for the rest
    // of this task, and the window we just computed gets re-derived from every intermediate frame
    // on the way. Corrections this module makes land instantly; a smooth gesture the caller asks
    // for on its own (the rail's prev/next buttons call scrollBy themselves) is left alone.
    const style = root.style;
    const previous = style ? style.scrollBehavior : null;
    if (style) style.scrollBehavior = 'auto';
    if (axis === 'x') { if (typeof root.scrollLeft === 'number') root.scrollLeft = nextOffset; }
    else if (typeof root.scrollTop === 'number') root.scrollTop = nextOffset;
    if (style) style.scrollBehavior = previous || '';
    return changed;
  }

  // Scroll events are asynchronous. A host that writes `el.scrollLeft` and then refreshes its data
  // in the same task reaches us before our own scroll listener does, so the cached offset is a
  // frame behind — and mirroring it back would yank the player to where they used to be. Read the
  // element first whenever it has a scroll range to report.
  function syncScrollFromElement() {
    if (hidden || destroyed) return scrollOffset;
    const live = axis === 'x' ? root.scrollLeft : root.scrollTop;
    if (!Number.isFinite(live)) return scrollOffset;
    const limit = maxScroll();
    if (limit <= 0) return scrollOffset;
    scrollOffset = clamp(Math.round(live), 0, limit);
    return scrollOffset;
  }

  function scrollToIndex(index, { align = 'nearest' } = {}) {
    if (!items.length) return false;
    const i = clamp(toInt(index, 0), 0, items.length - 1);
    const rowStart = i * rowExtent;
    // The row ends one gap before the next row's pitch begins; scrolling to `rowStart + rowExtent`
    // would push a gap's worth of empty rail past the viewport edge on every End/PageDown.
    const rowEnd = rowStart + rowExtent - gap;
    const view = viewport();
    let target = scrollOffset;
    if (align === 'start') target = rowStart;
    else if (align === 'end') target = rowEnd - view;
    else if (rowStart < scrollOffset) target = rowStart;            // above the window — pull down
    else if (rowEnd > scrollOffset + view) target = rowEnd - view;  // below it — pull up
    const moved = applyScroll(target);
    if (moved) render();
    return moved;
  }

  function scrollToKey(key, options) {
    const index = keyToIndex.get(String(key));
    if (index == null) return false;
    return scrollToIndex(index, options);
  }

  // preventScroll: this module has already scrolled the target into the window, and letting the
  // browser make its own adjustment on top would move the box out from under the offset we own.
  function focusActive() {
    const node = pool.get(keys[activeIndex]);
    if (node && typeof node.focus === 'function') {
      try { node.focus({ preventScroll: true }); } catch { node.focus(); }
      hadFocus = true;
      return true;
    }
    return false;
  }

  // Move → scroll into the window → re-render (so the target is mounted) → focus it. That order is
  // what lets Home/End reach row 0 and row 1,999 when neither was in the DOM a moment earlier.
  function moveActive(index, { focus = true } = {}) {
    if (!items.length) return false;
    const next = clamp(index, 0, items.length - 1);
    if (next === activeIndex) { scrollToIndex(next); if (focus) focusActive(); return false; }
    activeIndex = next;
    // scrollToIndex re-renders only when the offset actually moved (End from row 1,998 may not
    // move it). Render here only in that case, so a keypress never costs two reorders.
    if (!scrollToIndex(next)) render();
    if (selectionFollowsFocus) setSelectedKey(keys[next], { scrollIntoView: false });
    if (focus) focusActive();
    return true;
  }

  function setSelectedKey(key, { scrollIntoView = true, notify = true } = {}) {
    const next = key == null ? null : String(key);
    if (next === selectedKey) return false;
    selectedKey = next;
    if (next != null && keyToIndex.has(next)) {
      activeIndex = keyToIndex.get(next);
      if (scrollIntoView) scrollToIndex(activeIndex);
    }
    render();
    if (notify) emit(opts.onSelect, selectedKey, selectedKey != null ? items[keyToIndex.get(selectedKey)] : null);
    return true;
  }

  /**
   * Swap the data. Selection survives by key: the same row stays selected across a sort, a filter
   * or a price tick, even though its index moved. A selection filtered out of the list falls to
   * the first remaining row, matching what the market screen already does by hand.
   *
   * That fallback is reported through the RETURN VALUE rather than `onSelect`: setItems is
   * normally called from inside a caller's own render, and firing a selection event back into it
   * mid-render is how re-entrant update loops start. Read `.selectedKey` to stay in sync.
   *
   * @returns {{selectedKey: (string|null), activeIndex: number}}
   */
  function setItems(nextItems, { preserveScroll = true } = {}) {
    // Adopt any scroll the element has taken but not yet reported, before the new data changes
    // what the range even is — otherwise "preserve scroll" preserves a stale number.
    if (preserveScroll) syncScrollFromElement();
    items = Array.isArray(nextItems) ? nextItems.slice() : [];
    keys = items.map((item, i) => getKey(item, i));
    keyToIndex = buildKeyIndex(keys);
    pool.clear(); // data may have changed under any key; rebuild rows on the next render
    poolFlags.clear();

    if (selectedKey != null && keyToIndex.has(selectedKey)) {
      activeIndex = keyToIndex.get(selectedKey);
    } else if (selectedKey != null && items.length) {
      // A selection that was filtered out falls to the first surviving row. A list that never had
      // a selection stays unselected — gaining one from a data tick alone would light up a row the
      // player never chose.
      selectedKey = keys[0];
      activeIndex = 0;
    } else {
      if (!items.length) selectedKey = null;
      activeIndex = 0;
    }
    applyScroll(preserveScroll ? scrollOffset : 0);
    render();
    return { selectedKey, activeIndex };
  }

  const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
  const PREV_KEYS = new Set(['ArrowUp', 'ArrowLeft']);

  /** Keyboard contract. Exposed so a screen owning its own key handling can delegate to it. */
  function handleKeydown(event) {
    if (!event || destroyed || !items.length) return false;
    const key = event.key;
    // Step from what the player can see. If a scroll left the active row off screen, the visible
    // stand-in that has been carrying the tab stop becomes the cursor before the key is applied.
    activeIndex = tabStopIndex(range);
    const page = Math.max(1, Math.floor(viewport() / rowExtent));
    let handled = true;
    if (NEXT_KEYS.has(key)) moveActive(activeIndex + 1);
    else if (PREV_KEYS.has(key)) moveActive(activeIndex - 1);
    else if (key === 'Home') moveActive(0);
    else if (key === 'End') moveActive(items.length - 1);
    else if (key === 'PageDown') moveActive(activeIndex + page);
    else if (key === 'PageUp') moveActive(activeIndex - page);
    else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      setSelectedKey(keys[activeIndex]);
      emit(opts.onActivate, keys[activeIndex], items[activeIndex]);
    } else handled = false;
    if (handled && typeof event.preventDefault === 'function') event.preventDefault();
    return handled;
  }

  function onScroll() {
    if (destroyed || hidden) return;
    const live = axis === 'x' ? root.scrollLeft : root.scrollTop;
    const measured = measure ? Number((measure() || {}).scrollOffset) : NaN;
    const nextOffset = Number.isFinite(measured) ? measured : Number(live);
    if (!Number.isFinite(nextOffset)) return;
    const clamped = clamp(Math.round(nextOffset), 0, maxScroll());
    if (clamped === scrollOffset) return;
    scrollOffset = clamped;
    // Native scrolling already moves the existing cards. Touch the DOM only when a row enters
    // or leaves the window, not for every pixel of a wheel or smooth-scroll animation.
    const next = computeRange();
    if (next.start !== range.start || next.end !== range.end) render();
  }

  function onClick(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;
    const row = target.closest('[data-vlist-key]');
    if (!row || typeof row.getAttribute !== 'function') return;
    const key = row.getAttribute('data-vlist-key');
    if (key == null || !keyToIndex.has(key)) return;
    activeIndex = keyToIndex.get(key);
    // Clicking the already-selected row is a no-op for setSelectedKey, but the roving tab stop
    // still has to move here — the player may have arrowed focus elsewhere before clicking back.
    if (!setSelectedKey(key, { scrollIntoView: false })) render();
    emit(opts.onActivate, key, items[activeIndex]);
  }

  function onFocusIn() { hadFocus = true; }
  function onFocusOut() { hadFocus = false; }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('scroll', onScroll);
    root.addEventListener('keydown', handleKeydown);
    root.addEventListener('click', onClick);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
  }

  // A resize changes how many rows fit, so the window must widen or narrow with it. Guarded: the
  // node harness and any non-browser host have no ResizeObserver, and there `refresh()` is the
  // caller's hook instead.
  function observeResize() {
    if (resizeObserver || typeof ResizeObserver !== 'function') return;
    resizeObserver = new ResizeObserver(() => { if (!hidden && !destroyed) render(); });
    try { resizeObserver.observe(root); } catch { resizeObserver = null; }
  }
  observeResize();

  render();

  return {
    el: root,

    /** Re-window and re-render against current geometry. A no-op while hidden. */
    refresh() { return render(); },

    /**
     * Correct the row pitch from a live measurement. A caller whose row size comes from CSS can
     * only learn the true value once the element has a layout box, and a breakpoint may change it
     * later; this keeps the window honest without rebuilding the list.
     * @param {number} px Card size PLUS the container gap.
     */
    setRowExtent(px) {
      const next = Math.max(1, toInt(px, rowExtent));
      if (next === rowExtent) return rowExtent;
      rowExtent = next;
      applyScroll(scrollOffset); // the range shrank or grew under the current offset
      render();
      return rowExtent;
    },
    getRowExtent() { return rowExtent; },

    setItems,
    getItems() { return items.slice(); },

    setSelectedKey,
    getSelectedKey() { return selectedKey; },
    getActiveKey() { return items.length ? keys[activeIndex] : null; },
    getActiveIndex() { return activeIndex; },

    scrollToIndex,
    scrollToKey,
    /** Bring the selected row back on screen — the "scroll selection into view" contract. */
    scrollSelectedIntoView() { return selectedKey == null ? false : scrollToKey(selectedKey); },
    getScrollOffset() { return scrollOffset; },
    setScrollOffset(px) { if (applyScroll(px)) render(); return scrollOffset; },
    getMaxScroll() { return maxScroll(); },

    handleKeydown,
    focusActive,
    moveActive,

    /** Introspection used by the fixture and by the budget probe. */
    getRange() { return { ...range }; },
    getMountedKeys() { return [...pool.keys()]; },
    getMountedCount() { return pool.size; },
    getRowElement(key) { return pool.get(String(key)) || null; },
    hasFocus() { return hadFocus; },

    onShow() {
      if (destroyed) return;
      hidden = false;
      observeResize();
      render();
    },

    // Matches createShipLedgerPanel's contract: a hidden host never rebuilds its list. Without
    // this, every background screen re-renders on each data tick for nobody to see.
    onHide() {
      hidden = true;
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch { /* already gone */ } resizeObserver = null; }
    },

    isHidden() { return hidden; },
    isDestroyed() { return destroyed; },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      hidden = true;
      if (typeof root.removeEventListener === 'function') {
        root.removeEventListener('scroll', onScroll);
        root.removeEventListener('keydown', handleKeydown);
        root.removeEventListener('click', onClick);
        root.removeEventListener('focusin', onFocusIn);
        root.removeEventListener('focusout', onFocusOut);
      }
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch { /* already gone */ } resizeObserver = null; }
      pool.clear();
      poolFlags.clear();
      if (typeof root.replaceChildren === 'function') root.replaceChildren();
    },
  };
}

/**
 * Parse one row element from an HTML string. The station screens build rows by string concat
 * (`visible.map(...).join('')`), so this is their one-line bridge to the element-returning
 * `renderRow` contract without rewriting their row markup.
 * @param {string} html
 * @returns {HTMLElement|null}
 */
export function rowFromHtml(html) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const holder = document.createElement('template');
  if ('innerHTML' in holder && holder.content) {
    holder.innerHTML = String(html);
    const first = holder.content.firstElementChild;
    if (first) return first;
  }
  const div = document.createElement('div');
  div.innerHTML = String(html);
  return div.firstElementChild || null;
}

export default createVirtualList;
