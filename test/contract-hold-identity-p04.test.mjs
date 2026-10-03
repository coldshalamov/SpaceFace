// Research E (build_map §1C row 277 / CONTRACT-IDENTITY, P04) — the Contracts tab commits the
// exact offer that was held, never a different one the drain window happened to paint.
//
// The defect: `drainAndCommit` ran a ~260 ms rAF retract, then accepted through
// `key.isConnected ? key : acceptKey()` — a detached A key fell back to the dossier's CURRENT
// accept node, so remove-A/paint-B inside the drain committed B. The repair captures the held
// offer's identity and stated terms at fire time; the commit lands only on that still-valid
// offer. Selection/context change, hide and dispose retire the pending commit; an unchanged
// repainted offer still accepts exactly once; the accept owner revalidates the intent as usual.
//
// No jsdom in this repo — the screen is mounted on a scoped fake DOM whose dossier parses the
// accept node out of the real dossier markup (the pq024/probe pattern), and a fake clock + rAF
// queue drives the hold and the drain deterministically.
import assert from 'node:assert/strict';

let clockNow = 10_000;

function makeClassList(node) {
  return {
    add(...names) { for (const n of names) node._classes.add(n); },
    remove(...names) { for (const n of names) node._classes.delete(n); },
    toggle(name, force) {
      const want = force === undefined ? !node._classes.has(name) : !!force;
      if (want) node._classes.add(name); else node._classes.delete(name);
    },
    contains(name) { return node._classes.has(name); },
  };
}

class CtNode {
  constructor(tagName, doc) {
    this.ownerDocument = doc;
    this.tagName = String(tagName || 'div').toUpperCase();
    this._classes = new Set();
    this.classList = makeClassList(this);
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {}, cssText: '' };
    this.listeners = {};
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this._innerHTML = '';
    this._textContent = '';
  }
  set innerHTML(html) { this._innerHTML = String(html); if (this._onHtml) this._onHtml(this._innerHTML); }
  get innerHTML() { return this._innerHTML; }
  set textContent(v) { this._textContent = String(v); }
  get textContent() { return this._textContent; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  fire(type, event = {}) {
    const ev = {
      target: this, currentTarget: this, button: 0, repeat: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...event,
    };
    for (const fn of [...(this.listeners[type] || [])]) fn(ev);
    return ev;
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...kids) { for (const k of kids) this.appendChild(k); }
  insertBefore(node, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    node.parentNode = this;
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    return node;
  }
  insertAdjacentElement(_pos, node) { return this.appendChild(node); }
  remove() { this.isConnected = false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }
}

class AcceptNode extends CtNode {
  constructor(doc, missionId, disabled) {
    super('button', doc);
    this.attributes['data-accept'] = missionId;
    this.disabled = !!disabled;
    this._classes.add('sx-ct-commit');
  }
  closest(sel) {
    if (typeof sel !== 'string') return null;
    if (!sel.includes('data-accept') && !sel.includes('sx-ct-commit')) return null;
    if (sel.includes(':not(:disabled)') && this.disabled) return null;
    return this;
  }
  querySelector() { return null; }
}

// The fake document: every element that receives the Contracts frame markup gets the four mounted
// regions wired in; the dossier region parses each repainted markup for the real accept node so a
// repaint detaches the key a hold armed on — the exact P04 window.
function makeContractsDom() {
  const doc = {
    activeElement: null,
    head: null,
    body: null,
    documentElement: {
      dataset: {},
      _classes: new Set(),
      classList: null,
    },
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
    createElement(tag) {
      const node = new CtNode(tag, doc);
      node._onHtml = (html) => { if (html.includes('sx-ct__dossier')) wireScreen(node); };
      return node;
    },
    createElementNS(ns, tag) { return new CtNode(tag, doc); },
  };
  doc.head = new CtNode('head', doc);
  doc.body = new CtNode('body', doc);
  doc.documentElement.classList = makeClassList(doc.documentElement);

  const screens = [];
  function wireScreen(root) {
    const regions = {};
    for (const sel of ['.sx-ct-dispatch__label', '.sx-ct__board', '.sx-ct__dossier', '.sx-ct__active']) {
      regions[sel] = new CtNode('div', doc);
    }
    const dossier = regions['.sx-ct__dossier'];
    let accept = null;
    dossier._onHtml = (html) => {
      if (accept) accept.isConnected = false; // a repaint detaches the key the hold armed on
      accept = null;
      const tag = html.match(/<button[^>]*\bdata-accept="([^"]*)"[^>]*>/);
      if (tag) accept = new AcceptNode(doc, tag[1], /\sdisabled(?:\s|=|>)/.test(tag[0]));
    };
    dossier.querySelector = (sel) => {
      if (typeof sel !== 'string') return null;
      if (sel.includes('sx-ct-commit')) {
        if (!accept) return null;
        if (sel.includes(':not(:disabled)') && accept.disabled) return null;
        return accept;
      }
      return null;
    };
    dossier.currentAccept = () => accept;
    root.querySelector = (sel) => regions[sel] || null;
    root.querySelectorAll = () => [];
    screens.push({ root, regions, board: regions['.sx-ct__board'], dossier });
  }
  return { doc, screens, last: () => screens[screens.length - 1] };
}

function makeCtx(offersList) {
  const emitted = [];
  const handlers = {};
  const state = {
    simTime: 120,
    mode: 'flight',
    settings: {},
    playerId: 'player',
    player: { id: 'player', credits: 5_000_000, cargo: { capVolume: 100, usedVolume: 0, items: {} } },
    ui: { dockedStationId: 'station_alpha' },
    missions: {
      config: { maxActive: 8 },
      active: [],
      boards: { station_alpha: { slots: offersList, dispatchLabel: 'LIVE DISPATCH' } },
    },
  };
  const ctx = {
    state,
    station: { name: 'Alpha Station' },
    bus: {
      emit(type, payload = {}) { emitted.push({ type, payload }); },
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return () => {}; },
      off() {},
    },
  };
  return { ctx, state, emitted, handlers };
}

const offer = (id, title, reward, extra = {}) => ({
  id, title, type: 'delivery', reward,
  destStationId: 'station_beta', destSectorId: 'sector_beta',
  factionId: null, clauses: [], ...extra,
});

async function main() {
  // fake clock + rAF BEFORE the module is imported: the hold clock and the drain both read these.
  const rafState = { queue: [] };
  globalThis.requestAnimationFrame = (fn) => { rafState.queue.push(fn); return rafState.queue.length; };
  globalThis.cancelAnimationFrame = () => {};
  const priorPerformance = globalThis.performance;
  globalThis.performance = { now: () => clockNow };

  const dom = makeContractsDom();
  const reduceMotion = { flag: false };
  const realContains = dom.doc.documentElement.classList.contains.bind(dom.doc.documentElement.classList);
  dom.doc.documentElement.classList.contains = (name) => (name === 'sf-reduce-motion' ? reduceMotion.flag : realContains(name));
  globalThis.document = dom.doc;
  globalThis.window = { devicePixelRatio: 1, innerHeight: 900, addEventListener() {}, removeEventListener() {} };

  const { createContractsScreen } = await import('../src/ui/station/screens/contracts.js');

  const stepFrame = (dtMs = 16) => {
    clockNow += dtMs;
    const q = rafState.queue;
    rafState.queue = [];
    for (const fn of q) if (fn) fn(clockNow);
  };
  const advance = (totalMs, stepMs = 16) => {
    for (let t = 0; t < totalMs; t += stepMs) stepFrame(stepMs);
  };
  const acceptEmits = (emitted) => emitted.filter((e) => e.type === 'ui:acceptMission').map((e) => e.payload.missionId);

  try {
    // ── arm A → complete hold → remove A / paint B → the drain commits NOTHING ─────────────
    {
      const { ctx, state, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      assert(keyA && keyA.getAttribute('data-accept') === 'm_alpha', 'dossier A paints an armed Accept');

      sc.root.fire('pointerdown', { target: keyA, button: 0 });
      advance(600); // 450 ms hold fills and fires; the ~260 ms drain is still in flight
      state.missions.boards.station_alpha.slots = [offer('m_beta', 'Beta Haul', 9000)];
      screen.refresh(ctx); // remove A / paint B mid-drain — the classic P04 swap
      const keyB = sc.dossier.currentAccept();
      assert(keyB && keyB.getAttribute('data-accept') === 'm_beta' && keyB !== keyA,
        'the repaint detached A and painted B');
      assert.equal(keyA.isConnected, false, 'the armed key is detached');
      advance(600);
      assert.deepEqual(acceptEmits(emitted), [], 'no mission accepted — the drain never falls back to B');
      screen.dispose();
    }

    // ── same-ID repaint: the unchanged offer still accepts exactly once ────────────────────
    {
      const { ctx, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      sc.root.fire('pointerdown', { target: keyA, button: 0 });
      advance(600);
      screen.refresh(ctx); // identical offer repainted (duplicate updates, mission:updated churn)
      screen.refresh(ctx);
      const keyA2 = sc.dossier.currentAccept();
      assert(keyA2 && keyA2.getAttribute('data-accept') === 'm_alpha' && keyA2 !== keyA,
        'the same offer repainted under a new node');
      advance(600);
      assert.deepEqual(acceptEmits(emitted), ['m_alpha'], 'the held offer commits once through its fresh node');
      screen.dispose();
    }

    // ── changed terms: same id, different stated terms — nothing commits ───────────────────
    {
      const { ctx, state, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      sc.root.fire('pointerdown', { target: keyA, button: 0 });
      advance(600);
      state.missions.boards.station_alpha.slots = [offer('m_alpha', 'Alpha Run', 9000, { collateral: 1200 })];
      screen.refresh(ctx); // same id, repriced — not the contract the player held
      advance(600);
      assert.deepEqual(acceptEmits(emitted), [], 'changed terms refuse the commit');
      screen.dispose();
    }

    // ── selection change retires the drain ────────────────────────────────────────────────
    {
      const { ctx, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000), offer('m_beta', 'Beta Haul', 9000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow({ ...ctx, missionId: 'm_alpha' });
      const keyA = sc.dossier.currentAccept();
      assert(keyA && keyA.getAttribute('data-accept') === 'm_alpha', 'the focused offer is armed');
      sc.root.fire('keydown', { target: keyA, key: 'Enter' });
      advance(600);
      // the player picks another row before the drain lands — a selection change is a context change
      const rowB = { closest: (sel) => (sel === '[data-mid]' ? rowB : null), getAttribute: () => 'm_beta', focus() {} };
      sc.board.fire('click', { target: rowB });
      advance(600);
      assert.deepEqual(acceptEmits(emitted), [], 'a mid-drain selection change commits nothing');
      screen.dispose();
    }

    // ── screen hide / dispose retires the drain ──────────────────────────────────────────
    {
      const { ctx, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      sc.root.fire('pointerdown', { target: keyA, button: 0 });
      advance(600);
      screen.onHide();
      advance(600);
      assert.deepEqual(acceptEmits(emitted), [], 'a hidden screen never commits behind the player');
      screen.dispose();
    }

    // ── assistive (bare click) activation under reduced motion commits truthfully ────────
    {
      reduceMotion.flag = true;
      const { ctx, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      sc.root.fire('click', { target: keyA }); // no pointer/key held — assistive activation self-arms
      advance(800); // the auto hold still fills for 450 ms, then the motionless drain commits at once
      assert.deepEqual(acceptEmits(emitted), ['m_alpha'], 'reduced motion commits the held offer at once');
      screen.dispose();
      reduceMotion.flag = false;
    }

    // ── key-held activation, unchanged A: exactly one accept ────────────────────────────
    {
      const { ctx, emitted } = makeCtx([offer('m_alpha', 'Alpha Run', 5000)]);
      const screen = createContractsScreen(ctx);
      const sc = dom.last();
      screen.onShow(ctx);
      const keyA = sc.dossier.currentAccept();
      sc.root.fire('keydown', { target: keyA, key: 'Enter' });
      advance(1400);
      assert.deepEqual(acceptEmits(emitted), ['m_alpha'], 'unchanged A accepts exactly once');
      sc.root.fire('keyup', { target: keyA, key: 'Enter' });
      screen.dispose();
    }

    console.log('contract-hold-identity-p04: OK');
  } finally {
    globalThis.performance = priorPerformance;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  }
}

await main();
