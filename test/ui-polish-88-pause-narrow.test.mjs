// Review #499 — pause in a narrow desktop window (≤760 wide) takes the column, and follows a resize
// across 760 in both directions instead of keeping the composition it was mounted with.
import assert from 'node:assert/strict';
import test from 'node:test';

import { pauseScreen } from '../src/ui/screens/pause.js';
import { spatialFocusTarget, padFocusTarget } from '../src/ui/input.js';

function installMiniDom({ desktop = true, width = 1280 } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, matchMedia: globalThis.matchMedia };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this._class = new Set(); this._text = '';
      this.hidden = false; this.tabIndex = 0; this.style = { setProperty() {}, removeProperty() {} };
      const owner = this;
      this.classList = { add(...names) { names.forEach((name) => name && owner._class.add(name)); }, remove(...names) { names.forEach((name) => owner._class.delete(name)); }, contains(name) { return owner._class.has(name); } };
      this.dataset = new Proxy(Object.create(null), { set(target, key, value) { target[key] = value; owner.attributes.set('data-' + String(key), String(value)); return true; }, deleteProperty(target, key) { delete target[key]; owner.attributes.delete('data-' + String(key)); return true; } });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) { this._class.clear(); String(value || '').split(/\s+/).forEach((name) => name && this._class.add(name)); }
    get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    set innerHTML(value) { if (value === '') this.textContent = ''; }
    getAttribute(name) { return name === 'class' ? this.className : (this.attributes.get(name) ?? null); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = value; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { if (child) { child.parentElement = this; this.children.push(child); } return child; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
    removeEventListener() {}
    dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this, type, preventDefault() {} }); }
    focus() { globalThis.document.activeElement = this; }
    contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const matches = (node) => {
        if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
        if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1);
        if (selector.startsWith('[')) { const hit = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/); return !!hit && (hit[2] == null ? node.getAttribute(hit[1]) != null : node.getAttribute(hit[1]) === hit[2]); }
        return node.tagName === selector.toUpperCase();
      };
      const result = [];
      const visit = (node) => { for (const child of node.children) { if (matches(child)) result.push(child); visit(child); } };
      visit(this); return result;
    }
  }
  const body = new Mini('body');
  globalThis.document = { body, documentElement: body, head: new Mini('head'), activeElement: body, createElement: (tag) => new Mini(tag), getElementById: () => null };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: width, innerHeight: 720 };
  // The desktop shell is what lets Quit Game act; the web build has none (test below).
  if (desktop) globalThis.window.spacefaceShell = { quit() {} };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const watchers = new Set();
  globalThis.matchMedia = (query) => ({ get matches() { return /max-width:760px/.test(query) && globalThis.window.innerWidth <= 760; },
    addEventListener(type, fn) { if (type === 'change') watchers.add(fn); }, removeEventListener(type, fn) { watchers.delete(fn); } });
  return { watchers, resize(w) { const was = globalThis.window.innerWidth <= 760; globalThis.window.innerWidth = w; if ((w <= 760) !== was) for (const fn of [...watchers]) fn({ matches: w <= 760 }); }, restore() { globalThis.document = previous.document; globalThis.window = previous.window; globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.cancelAnimationFrame = previous.cancelAnimationFrame; globalThis.matchMedia = previous.matchMedia; } };
}

const makeCtx = () => ({ state: { mode: 'paused', missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' } }, bus: { emit() {}, on() { return () => {}; } }, screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } } });
const hints = (root) => root.querySelectorAll('.sf-pause-key-verb').map((node) => node.textContent);
const column = (root) => root.classList.contains('orr-pause--phone') && !root.classList.contains('orr-pause');
const dial = (root) => root.classList.contains('orr-pause') && !root.classList.contains('orr-pause--phone');

test('pause at 700 wide is the column, and its key strip does not promise a category level', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root), 'a 700-wide window takes the column');
    assert.ok(hints(root).includes('Move'));
    assert.ok(!hints(root).includes('Category') && !hints(root).includes('Item'), 'no ↑↓ CATEGORY / ←→ ITEM over a flat list');
    assert.ok(root.querySelectorAll('button').some((b) => b.textContent.startsWith('Resume')));
  } finally { dom.restore(); }
});

test('pause follows a resize across 760: 700 → 1280 → 700', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    dom.resize(1280);
    assert.ok(dial(root), 'widening past 760 remounts on the dial');
    assert.deepEqual(hints(root).slice(-2), ['Category', 'Item']);
    dom.resize(1000); // no crossing: no remount churn
    assert.ok(dial(root));
    dom.resize(700);
    assert.ok(column(root), 'narrowing back under 760 remounts the column');
    assert.ok(hints(root).includes('Move'));
    assert.equal(dom.watchers.size, 1, 'each remount swaps its watcher, it does not stack them');
  } finally { dom.restore(); }
});

test('pause opened at 1280 then narrowed to 700 leaves the dial for the column', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(dial(root));
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(root.querySelectorAll('.orr-brief').length, 0, 'the brief stays in the column, not a reading on the right');
  } finally { dom.restore(); }
});

// ---- review #499 follow-ups (ui-polish-91) ----

const verbs = (root) => root.querySelectorAll('button').filter((b) => b.getAttribute('data-action') != null);
const focusedAction = () => { const a = globalThis.document.activeElement; return a && a.getAttribute ? a.getAttribute('data-action') : null; };

// Lay the column out as it reads: a verb owns its row unless it banks, and a banked run shares rows
// in its group. Rects are what the pad's spatial focus walks (src/ui/input.js moveFocus).
function layColumn(root) {
  let y = 0; let x = 0; let lastGroup = null; let lastBank = false;
  for (const button of verbs(root)) {
    const li = button.parentElement;
    const group = li && li.dataset ? li.dataset.group : null;
    const bank = !!(li && li.dataset && li.dataset.bank);
    if (bank && lastBank && group === lastGroup) x += 140; else { y += 44; x = 24; }
    const rect = { left: x, top: y, right: x + 120, bottom: y + 32, width: 120, height: 32 };
    button.getBoundingClientRect = () => rect;
    lastGroup = group; lastBank = bank;
  }
}

test('gamepad in the column at 700: the d-pad walks every verb from Resume and back, no hidden category level', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    layColumn(root);
    const all = verbs(root);
    assert.ok(all.length >= 8, 'the column carries the whole verb list');
    for (const b of all) assert.notEqual(b.getAttribute('aria-hidden'), 'true', `${b.getAttribute('data-action')} is pad-focusable`);
    const reached = new Set();
    let at = all.find((b) => b.textContent.startsWith('Resume'));
    assert.ok(at, 'Resume leads');
    reached.add(at);
    // down through the rows; along each banked row with right
    for (let guard = 0; guard < 64; guard++) {
      for (let r = spatialFocusTarget(all, at, 'right'); r; r = spatialFocusTarget(all, r, 'right')) reached.add(r);
      const next = spatialFocusTarget(all, at, 'down');
      if (!next) break;
      at = next; reached.add(at);
    }
    assert.equal(reached.size, all.length, 'every verb is reachable by d-pad in the column');
    // and up walks back to Resume
    for (let guard = 0; guard < 64; guard++) { const up = spatialFocusTarget(all, at, 'up'); if (!up) break; at = up; }
    assert.ok(at.textContent.startsWith('Resume'), 'up returns to Resume');
    assert.deepEqual(hints(root).slice(-1), ['Move'], 'the strip names the column\'s one level');
  } finally { dom.restore(); }
});

test('a resize across 760 keeps the focused verb, not Resume', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    const pick = verbs(root).find((b) => !b.textContent.startsWith('Resume') && b.getAttribute('aria-disabled') !== 'true');
    assert.ok(pick);
    const action = pick.getAttribute('data-action');
    pick.focus();
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(focusedAction(), action, 'the same verb holds focus in the column');
    assert.notEqual(globalThis.document.activeElement, pick, 'on the rebuilt button, not the detached one');
    dom.resize(1280);
    assert.ok(dial(root));
    assert.equal(focusedAction(), action, 'and again back on the dial');
  } finally { dom.restore(); }
});

test('a resize with focus outside pause does not pull focus into it', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    globalThis.document.activeElement = globalThis.document.body;
    dom.resize(700);
    assert.ok(column(root));
    assert.equal(globalThis.document.activeElement, globalThis.document.body);
  } finally { dom.restore(); }
});

test('covered then shown: a crossing while another screen is over pause lands on the right composition', () => {
  const dom = installMiniDom({ width: 1280 });
  try {
    const root = globalThis.document.createElement('div');
    const ctx = makeCtx();
    pauseScreen.mount(root, ctx);
    assert.ok(dial(root));
    // covered (Settings over pause): the window narrows without a change event reaching pause
    globalThis.window.innerWidth = 700;
    assert.ok(dial(root), 'nothing rebuilt while covered and unnotified');
    pauseScreen.onShow(ctx);
    assert.ok(column(root), 'shown again at 700, pause rebuilds as the column');
    assert.ok(hints(root).includes('Move'));
    assert.equal(dom.watchers.size, 1, 'the show-time remount swaps the watcher');
    // covered again, this time the change event does arrive; show must not rebuild a second time
    dom.resize(1280);
    assert.ok(dial(root));
    const list = root.querySelector('.sf-pause-words');
    pauseScreen.onShow(ctx);
    assert.ok(dial(root));
    assert.equal(root.querySelector('.sf-pause-words'), list, 'no second rebuild on show');
  } finally { dom.restore(); }
});

// ---- ui-polish-93: the d-pad walks the column in order at 700 ----

// The column as Chromium lays it out at 700x800 (tools/ui-bench.html?screen=pause, measured):
// a full-width RESUME over left-aligned banked rows. [left, top, width, height] in list order.
const COLUMN_700 = [[42, 361, 616, 49], [42, 439, 92, 23], [148, 439, 51, 23], [213, 439, 52, 23], [42, 491, 152, 23],
  [208, 491, 79, 23], [301, 491, 251, 23], [42, 515, 141, 23], [42, 567, 159, 23], [215, 567, 66, 23], [295, 567, 143, 23],
  [452, 567, 105, 23], [42, 618, 66, 23], [122, 618, 74, 23], [209, 618, 57, 23], [42, 670, 201, 23], [42, 721, 91, 23], [42, 773, 106, 23]];

test('d-pad Down/Up at 700 step every verb in list order from Resume (no jump to Achievements)', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    const all = verbs(root);
    assert.equal(all.length, COLUMN_700.length, 'the measured layout covers every verb');
    all.forEach((b, i) => { const [left, top, width, height] = COLUMN_700[i]; const rect = { left, top, width, height, right: left + width, bottom: top + height }; b.getBoundingClientRect = () => rect; });
    const resume = all[0];
    assert.ok(resume.textContent.startsWith('Resume'));
    const expected = all.map((b) => b.getAttribute('data-action'));
    // the cause: pure geometry picks the word under Resume's centre, skipping the rows above it
    assert.notEqual(spatialFocusTarget(all, resume, 'down'), all[1], 'geometric picking alone skips Settings..Help');
    const down = [resume];
    for (let at = resume, n; (n = padFocusTarget(all, at, 'down')); at = n) { down.push(n); if (down.length > 40) break; }
    assert.deepEqual(down.map((b) => b.getAttribute('data-action')), expected, 'Down walks the exact list order and stops at the last verb');
    const up = [down[down.length - 1]];
    for (let at = up[0], n; (n = padFocusTarget(all, at, 'up')); at = n) { up.push(n); if (up.length > 40) break; }
    assert.deepEqual(up.map((b) => b.getAttribute('data-action')), [...expected].reverse(), 'Up walks it back to Resume');
    // the dial keeps its geometric two-level walk: no linear mark above 760
    dom.resize(1280);
    assert.ok(dial(root));
    assert.ok(verbs(root).every((b) => { for (let p = b.parentElement; p; p = p.parentElement) if (p.getAttribute('data-pad-linear') != null) return false; return true; }), 'the dial list is not linear');
  } finally { dom.restore(); }
});

test('d-pad off either end of the column at 700 falls back to geometry (Up from Resume reaches the contract link)', () => {
  const dom = installMiniDom({ width: 700 });
  try {
    const root = globalThis.document.createElement('div');
    pauseScreen.mount(root, makeCtx());
    assert.ok(column(root));
    const list = verbs(root);
    list.forEach((b, i) => { const [left, top, width, height] = COLUMN_700[i]; const rect = { left, top, width, height, right: left + width, bottom: top + height }; b.getBoundingClientRect = () => rect; });
    const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
    const minTop = Math.min(...COLUMN_700.map((r) => r[1]));
    const maxBottom = Math.max(...COLUMN_700.map((r) => r[1] + r[3]));
    const contract = globalThis.document.createElement('a');
    contract.textContent = 'Contract 47-A';
    contract.getBoundingClientRect = () => box(COLUMN_700[0][0], Math.max(0, minTop - 40), 160, 24);
    const below = globalThis.document.createElement('button');
    below.textContent = 'below';
    below.getBoundingClientRect = () => box(COLUMN_700[0][0], maxBottom + 16, 160, 24);
    root.append(contract, below);
    const all = [contract, ...list, below];
    assert.equal(padFocusTarget(all, list[0], 'up'), contract, 'Up from Resume leaves the column for the contract link');
    assert.equal(padFocusTarget(all, list[0], 'up'), spatialFocusTarget(all, list[0], 'up'));
    const last = list[list.length - 1];
    assert.equal(padFocusTarget(all, last, 'down'), spatialFocusTarget(all, last, 'down'), 'Down from the last verb is geometric');
    assert.equal(padFocusTarget(all, last, 'down'), below);
    assert.equal(padFocusTarget(all, list[0], 'down'), list[1], 'inside the list it still steps in order');
  } finally { dom.restore(); }
});

// ---- ui-polish-94: the 1280 dial walks its categories, as its foot strip says ----

// The dial as Chromium lays it out at 1280x720 (tools/ui-bench.html?screen=pause, measured once):
// [left, top, width, height] by verb. Rows: Resume | Game | Ship | Reference | Media | Play | Dev | Exit.
// The bench's state also offers Local Map (M) in Ship; the stub state here does not, and runs as the
// web build (no Quit Game), so every mounted verb has a measured box. The tracked-contract link (a
// role=link SPAN, tabindex 0) sits up right in the brief.
const DIAL_1280 = {
  'Resume': [299, 263, 154, 32],
  'Settings': [414, 304, 67, 16], 'Save': [503, 304, 35, 16], 'Load': [560, 304, 36, 16],
  'Mission Log (J)': [411, 338, 94, 16], 'My Ship': [527, 338, 59, 16], 'Operations (Automation)': [608, 338, 198, 16],
  'Help / Controls': [515, 371, 125, 16], 'Codex': [662, 371, 48, 16], 'Achievements': [732, 371, 110, 16], 'Statistics': [864, 371, 81, 16],
  'Photo': [437, 405, 48, 16], 'Replay': [507, 405, 54, 16], 'Clips': [583, 405, 42, 16],
  'Physics challenges': [414, 438, 151, 16], 'Sandbox': [392, 472, 67, 16], 'Main Menu': [385, 505, 76, 16],
};
const CONTRACT_1280 = [820, 146, 282, 48];
const ROW_FIRSTS_1280 = ['Resume', 'Settings', 'Mission Log (J)', 'Help / Controls', 'Photo', 'Physics challenges', 'Sandbox', 'Main Menu'];
const label = (b) => b && b.textContent.trim();
const labels = (xs) => xs.map(label);

function mountDial1280() {
  const dom = installMiniDom({ width: 1280, desktop: false });
  const root = globalThis.document.createElement('div');
  pauseScreen.mount(root, makeCtx());
  const box = ([left, top, width, height]) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const list = verbs(root);
  for (const b of list) { const r = DIAL_1280[label(b)]; assert.ok(r, `measured box for ${label(b)}`); const rect = box(r); b.getBoundingClientRect = () => rect; }
  const contract = globalThis.document.createElement('span');
  contract.setAttribute('role', 'link'); contract.setAttribute('tabindex', '0'); contract.textContent = 'Contract 47-A';
  contract.getBoundingClientRect = () => box(CONTRACT_1280);
  root.append(contract);
  const by = (name) => list.find((b) => label(b) === name);
  return { dom, root, list, contract, by, all: [contract, ...list] };
}

const walk = (items, from, dir) => { const out = [from]; for (let at = from, n; (n = padFocusTarget(items, at, dir)); at = n) { out.push(n); if (out.length > 40) break; } return out; };

test('d-pad Down/Up on the 1280 dial steps category by category (no skipped rows)', () => {
  const { dom, root, list, by, all } = mountDial1280();
  try {
    assert.ok(dial(root));
    assert.equal(list.length, 17);
    // the cause: pure geometry from Resume skips whole categories (Reference here)
    const geo = [list[0]];
    for (let at = list[0], n; (n = spatialFocusTarget(list, at, 'down')); at = n) { geo.push(n); if (geo.length > 40) break; }
    assert.notDeepEqual(labels(geo), ROW_FIRSTS_1280, 'geometry alone skips a category');
    assert.deepEqual(labels(walk(list, list[0], 'down')), ROW_FIRSTS_1280, 'Down lands on each category\'s first verb in turn');
    assert.deepEqual(labels(walk(list, by('Main Menu'), 'up')), [...ROW_FIRSTS_1280].reverse(), 'Up walks the categories back to Resume');
    // from inside a row, Up/Down go to the neighbouring category's first verb, not the word underneath
    assert.equal(label(padFocusTarget(all, by('Achievements'), 'down')), 'Photo');
    assert.equal(label(padFocusTarget(all, by('Achievements'), 'up')), 'Mission Log (J)');
  } finally { dom.restore(); }
});

test('d-pad Left/Right on the 1280 dial step verb by verb in list order', () => {
  const { dom, list, by, all } = mountDial1280();
  try {
    assert.deepEqual(labels(walk(list, list[0], 'right')), labels(list), 'Right walks every verb, rows in order');
    assert.deepEqual(labels(walk(list, list[list.length - 1], 'left')), labels([...list].reverse()), 'Left walks them back');
    assert.equal(label(padFocusTarget(all, by('My Ship'), 'right')), 'Operations (Automation)');
    // the ends stop, like the keyboard walk: no geometric bounce (Right from Main Menu was Sandbox)
    assert.equal(padFocusTarget(all, by('Main Menu'), 'right'), null);
    assert.equal(padFocusTarget(all, list[0], 'left'), null);
  } finally { dom.restore(); }
});

test('d-pad off the 1280 dial falls back to geometry, and only onto focusable targets', () => {
  const { dom, root, list, contract, by, all } = mountDial1280();
  try {
    // Up from Resume leaves the dial for the tracked-contract link, as the column does
    const upTarget = padFocusTarget(all, list[0], 'up');
    assert.equal(upTarget, spatialFocusTarget(all, list[0], 'up'));
    assert.ok(upTarget === contract, 'Up from Resume -> the contract link');
    assert.equal(typeof upTarget.focus, 'function');
    assert.equal(upTarget.getAttribute('tabindex'), '0', 'the link takes focus');
    const last = by('Main Menu');
    assert.equal(padFocusTarget(all, last, 'down'), null, 'nothing below Main Menu: Down stops');
    const below = globalThis.document.createElement('button');
    below.getBoundingClientRect = () => ({ left: 385, top: 560, width: 80, height: 16, right: 465, bottom: 576 });
    root.append(below);
    assert.ok(padFocusTarget([...all, below], last, 'down') === below, 'Down from Main Menu leaves the dial by geometry');
    // a candidate without focus() is never handed back
    const inert = { getBoundingClientRect: () => ({ left: 385, top: 560, width: 80, height: 16, right: 465, bottom: 576 }), getAttribute: () => null };
    assert.equal(padFocusTarget([...list, inert], last, 'down'), null);
    const marked = (attr) => (b) => { for (let p = b.parentElement; p; p = p.parentElement) if (p.getAttribute(attr) != null) return true; return false; };
    dom.resize(700);
    assert.ok(column(root));
    assert.ok(!verbs(root).some(marked('data-pad-grouped')), 'the column is not grouped');
    dom.resize(1280);
    assert.ok(dial(root));
    assert.ok(verbs(root).every(marked('data-pad-grouped')), 'the dial is grouped again');
  } finally { dom.restore(); }
});
