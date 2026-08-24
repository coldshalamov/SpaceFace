// Outfitting tab hide/show contract: switching away from the panel must park the 3D stage
// (and cancel the pending double-rAF resize); switching back must restore it.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  load(url, context, nextLoad) {
    const path = String(url).split('?')[0];
    if (path.endsWith('/shipEngineeringStage.js') || path.endsWith('\\shipEngineeringStage.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          export const SHIP_ENGINEERING_GAUGE_DEFS = [];
          export function createShipEngineeringStage() {
            const fake = globalThis.__outfitStageFake;
            if (!fake) throw new Error('outfitting-stage-hide: missing fake stage');
            fake.created += 1;
            return fake;
          }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

function makeFakeStage() {
  return {
    created: 0,
    active: false,
    resizeCount: 0,
    setShip() {},
    setActive(value) { this.active = !!value; },
    setPowerFlow() {},
    setHighlightSlot() {},
    setGauges() {},
    setLabel() {},
    resize() { this.resizeCount += 1; },
    dispose() {},
  };
}

function installDom() {
  const byId = new Map();
  const rafQueue = new Map();
  let nextRaf = 1;

  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
    toggle(v, force) {
      if (force === undefined) force = !this.values.has(v);
      if (force) this.values.add(v); else this.values.delete(v);
      return force;
    }
  }

  function parseAttrs(attrPart) {
    const attrs = new Map();
    const re = /([a-zA-Z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(attrPart)) !== null) {
      attrs.set(m[1], m[2] ?? m[3] ?? m[4] ?? '');
    }
    return attrs;
  }

  function matchSelector(el, sel) {
    const parts = String(sel).trim().split(/(?=[.#\[])/);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('#')) {
        if (el.id !== part.slice(1)) return false;
      } else if (part.startsWith('.')) {
        if (!el.classList.contains(part.slice(1))) return false;
      } else if (part.startsWith('[')) {
        const attr = part.slice(1, part.endsWith(']') ? -1 : part.length);
        const eq = attr.indexOf('=');
        if (eq < 0) {
          if (el.getAttribute(attr) == null) return false;
        } else {
          const name = attr.slice(0, eq);
          const val = attr.slice(eq + 1).replace(/^["']|["']$/g, '');
          if (el.getAttribute(name) !== val) return false;
        }
      } else if (el.tagName !== part.toUpperCase()) {
        return false;
      }
    }
    return true;
  }

  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.ownerDocument = null;
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this._listeners = new Map();
      this.style = {};
      this.dataset = {};
      this._className = '';
      this._textContent = '';
      this._innerHTML = '';
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.id = '';
      this.nodeType = 1;
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get textContent() {
      if (this.children.length) return this.children.map((c) => c.textContent).join('');
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v == null ? '' : v);
      this.children.length = 0;
      this._innerHTML = '';
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(html) {
      this._innerHTML = String(html || '');
      this.children.length = 0;
      this._textContent = '';
      if (!this._innerHTML) return;
      const stack = [this];
      let i = 0;
      while (i < this._innerHTML.length) {
        if (this._innerHTML[i] !== '<') {
          const end = this._innerHTML.indexOf('<', i);
          const text = this._innerHTML.slice(i, end === -1 ? this._innerHTML.length : end);
          stack[stack.length - 1]._textContent += text;
          if (end === -1) break;
          i = end;
          continue;
        }
        if (this._innerHTML.slice(i, i + 4) === '<!--') {
          const end = this._innerHTML.indexOf('-->', i);
          i = end === -1 ? this._innerHTML.length : end + 3;
          continue;
        }
        const closeMatch = this._innerHTML.slice(i).match(/^<\/([a-zA-Z0-9]+)\s*>/);
        if (closeMatch) {
          const tag = closeMatch[1].toUpperCase();
          if (stack.length > 1 && stack[stack.length - 1].tagName === tag) stack.pop();
          i += closeMatch[0].length;
          continue;
        }
        const openMatch = this._innerHTML.slice(i).match(/^<([a-zA-Z0-9]+)([^>]*)>([\s\S]*)/);
        if (!openMatch) { i += 1; continue; }
        const [, tag, attrPart] = openMatch;
        const selfClosing = attrPart.trim().endsWith('/') || /^(br|img|hr|input|meta|link|path|circle|polygon)$/i.test(tag);
        const child = document.createElement(tag);
        const attrs = parseAttrs(attrPart.replace(/\/\s*$/, ''));
        for (const [k, v] of attrs) {
          child.setAttribute(k, v);
          if (k === 'class') child.className = v;
          if (k === 'id') child.id = v;
        }
        stack[stack.length - 1].appendChild(child);
        if (!selfClosing) stack.push(child);
        i += openMatch[0].length - openMatch[3].length;
      }
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) {
      if (child.nodeType === 11) {
        const kids = child.children.slice();
        for (const k of kids) this.appendChild(k);
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      child.isConnected = false;
      if (child.id && byId.get(child.id) === child) byId.delete(child.id);
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    closest(sel) {
      for (let n = this; n; n = n.parentNode) {
        if (n.tagName && matchSelector(n, sel)) return n;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchSelector(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200 };
    }
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const doc = {
    body,
    head,
    documentElement: body,
    activeElement: body,
    getElementById(id) { return byId.get(id) || null; },
    querySelector(sel) { return body.querySelector(sel); },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = doc;
      return el;
    },
    createElementNS(_ns, tagName) {
      return doc.createElement(tagName);
    },
    createDocumentFragment() {
      const frag = new FakeElement('#fragment');
      frag.nodeType = 11;
      frag.ownerDocument = doc;
      return frag;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  body.ownerDocument = doc;
  head.ownerDocument = doc;

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
  };
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextRaf++;
    rafQueue.set(id, cb);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

  return {
    pendingRaf() { return rafQueue.size; },
    flushRaf() {
      const batch = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of batch) cb(0);
    },
  };
}

function playerCtx() {
  return {
    bus: { emit() {} },
    state: {
      player: {
        credits: 5000,
        ownedShips: [{
          defId: 'ship_kestrel',
          fittings: ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s'],
          weapons: null,
        }],
        activeShipIndex: 0,
        moduleInventory: [],
        researchedNodes: [],
      },
      missions: { active: [] },
      ui: {},
    },
  };
}

let createOutfittingPanel;
let raf;

test.before(async () => {
  raf = installDom();
  ({ createOutfittingPanel } = await import('../src/ui/screens/outfitting.js'));
});

test('outfitting panel parks the hidden 3D stage and restores it on show', () => {
  const stage = makeFakeStage();
  globalThis.__outfitStageFake = stage;
  const panel = createOutfittingPanel(playerCtx());

  assert.equal(typeof panel.onShow, 'function', 'panel exposes onShow');
  assert.equal(typeof panel.onHide, 'function', 'panel exposes onHide');

  panel.onShow({ stationId: 'station_helios_orbital' });
  assert.ok(stage.created >= 1, 'showing Outfitting creates the engineering stage');
  assert.equal(stage.active, true, 'onShow activates the stage');
  assert.ok(raf.pendingRaf() >= 1, 'onShow schedules a pending resize frame');

  const resizeAtShow = stage.resizeCount;
  panel.onHide();
  assert.equal(stage.active, false, 'onHide deactivates the stage');
  assert.equal(raf.pendingRaf(), 0, 'onHide cancels the pending double-rAF resize');
  raf.flushRaf();
  raf.flushRaf();
  assert.equal(stage.resizeCount, resizeAtShow, 'a cancelled refit must not resize after hide');
  assert.equal(stage.active, false, 'flushing leftover frames must not revive the hidden stage');

  panel.onShow({ stationId: 'station_helios_orbital' });
  assert.equal(stage.active, true, 'onShow reactivates the parked stage');
  raf.flushRaf();
  assert.ok(raf.pendingRaf() >= 1, 'the inner resize frame is still pending after the first rAF');
  const resizeAfterOuter = stage.resizeCount;
  panel.onHide();
  assert.equal(stage.active, false, 'onHide parks the stage after the outer rAF');
  assert.equal(raf.pendingRaf(), 0, 'onHide cancels the inner pending resize');
  raf.flushRaf();
  assert.equal(stage.resizeCount, resizeAfterOuter, 'the inner refit must not run after hide');

  panel.onShow({ stationId: 'station_helios_orbital' });
  assert.equal(stage.active, true, 'a later onShow fully restores the preview');
  raf.flushRaf();
  raf.flushRaf();
  assert.ok(stage.resizeCount > resizeAfterOuter, 'onShow restoration re-fits the visible stage');
  assert.equal(stage.active, true, 'the restored stage stays active after refit');

  panel.dispose();
});
