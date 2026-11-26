// Reuses the repository INF-095 station-shell DOM harness; no renderer or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStationApp } from '../src/ui/station/stationApp.js';

// INF-095: the docked station app stays subscribed after undock (the screen is cached, not
// released). Every mission tick / trade completion then runs a full hidden render — DOM writes
// on a tree nobody sees, plus stale receipts greeting the next dock. Suspend that work while
// hidden; onShow recomputes everything, so resume needs no catch-up.
let domWrites = 0;

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    // CSSStyleDeclaration: the Ladder's scroll cursor writes custom properties through setProperty.
    this.style = {
      setProperty(k, v) { this[k] = String(v); },
      removeProperty(k) { delete this[k]; },
      getPropertyValue(k) { return this[k] ?? ''; },
    };
    this.attributes = {};
    this.parentNode = null;
    this.hidden = true;
    this.isConnected = true;
    this.tabIndex = 0;
    this.className = '';
    this.id = '';
    this._cls = new Set();
    this._listeners = {};
    this._bySel = new Map();
    let text = '';
    let html = '';
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); domWrites += 1; },
      configurable: true,
    });
    Object.defineProperty(this, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); this._hasHtml = html.length > 0; domWrites += 1; },
      configurable: true,
    });
    this.classList = {
      add: (...names) => names.forEach((n) => this._cls.add(n)),
      remove: (...names) => names.forEach((n) => this._cls.delete(n)),
      toggle: (n, force) => {
        const on = force === undefined ? !this._cls.has(n) : !!force;
        if (on) this._cls.add(n); else this._cls.delete(n);
        return on;
      },
      contains: (n) => this._cls.has(n),
    };
  }
  querySelector(sel) {
    if (!this._bySel.has(sel)) {
      const child = new FakeEl('div');
      child._hasHtml = true; // selector hits address parsed markup; reads behave
      this._bySel.set(sel, child);
    }
    return this._bySel.get(sel);
  }
  querySelectorAll() { return []; }
  getElementsByClassName() { return []; }
  appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; }
  append(...nodes) { nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); }); }
  prepend(...nodes) { nodes.flat().reverse().forEach((n) => { if (typeof n === 'string') return; this.children.unshift(n); if (n) n.parentNode = this; }); }
  replaceChildren(...nodes) {
    for (const c of this.children) if (c) c.parentNode = null;
    this.children = [];
    nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); });
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    if (child) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners[type] || [];
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  }
  setAttribute(k, v) { this.attributes[String(k)] = String(v); }
  getAttribute(k) { return this.attributes[String(k)] ?? null; }
  removeAttribute(k) { delete this.attributes[String(k)]; }
  hasAttribute(k) { return String(k) in this.attributes; }
  closest() { return null; }
  contains() { return false; }
  focus() {}
  click() { for (const fn of this._listeners.click || []) fn({ target: this }); }
  get firstChild() {
    if (this.children.length) return this.children[0];
    // innerHTML-built subtrees are not parsed here; stand in a stable implicit child so
    // parsed-content reads (modeEl.firstChild) behave. No production path removes it.
    if (this._hasHtml) {
      if (!this._implicit) this._implicit = new FakeEl('div');
      return this._implicit;
    }
    return null;
  }
  get lastChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  get childElementCount() { return this.children.length; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
}

function installDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: () => null,
    head,
    body,
    activeElement: null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return () => {
    if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
    if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    if (prev.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prev.caf;
  };
}

function fakeBus() {
  const handlers = {};
  return {
    handlers,
    on(event, fn) {
      (handlers[event] = handlers[event] || []).push(fn);
      return () => {
        const list = handlers[event] || [];
        const at = list.indexOf(fn);
        if (at >= 0) list.splice(at, 1);
      };
    },
    off(event, fn) {
      const list = handlers[event] || [];
      const at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
    emit(event, payload) {
      for (const fn of [...(handlers[event] || [])]) fn(payload);
    },
    count(event) { return (handlers[event] || []).length; },
  };
}

function makeState() {
  return {
    mode: 'flight',
    simTime: 100,
    player: {
      credits: 500,
      cargo: { usedVolume: 0, capVolume: 40, items: {} },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      stats: {},
    },
    fuel: { current: 10, max: 20 },
    entities: new Map([[1, {
      id: 1, hull: 100, hullMax: 100, shield: 50, shieldMax: 50,
      armorHp: 0, armorMax: 0, data: {},
    }]]),
    playerId: 1,
    missions: { active: [], completed: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { dockedStationId: 'station_helios' },
    settings: { video: {}, gameplay: {}, audio: {}, controls: {} },
    nav: {},
    input: { actions: {} },
  };
}

function serviceQuoteStub() {
  return { amount: 0, cost: 0, detail: 'ok', buttonLabel: 'Do', disabled: false, chips: [] };
}


import { lawSecurity } from '../src/systems/lawSecurity.js';
test('full production stationApp mounts reachable docked law controls and cleans them up', () => {
 const restoreDom=installDom();
 try {
  const state=makeState(),bus=fakeBus();state.ui.docked=true;state.player.heat=.2;state.meta={seed:4242};
  const station={id:2,type:'station',alive:true,factionId:'faction_mts',pos:{x:0,z:0},data:{stationId:'station_helios'}};
  state.entities.set(2,station);state.entityList=[...state.entities.values()];
  const law=Object.create(lawSecurity);law.init({state,bus,helpers:{},registry:{get(){return null;}}});
  bus.emit('dock:docked',{stationId:'station_helios'});
  const ctx={state,bus,screenMemory:{read:()=>null,write(){},get:()=>null,set(){}}};
  const app=createStationApp(new FakeEl('div'),ctx,{serviceQuote:serviceQuoteStub});
  app.onShow(ctx);
  const crown=app.el.querySelector('.sxb-crown');
  const panel=crown.children.find(n=>n.className==='sxb-law-fine');
  assert.ok(panel,'actual stationApp hook appends widget in persistent crown');assert.equal(panel.hidden,false);
  assert.equal(panel.getAttribute('aria-label'),'Law desk');
  assert.equal(panel.children[0].getAttribute('role'),'status');
  for (const button of panel.children.slice(1)) { assert.equal(button.tagName,'BUTTON'); assert.equal(button.type,'button'); assert.ok(button.textContent.trim().length > 0); }
  const work=panel.children.find(n=>n.getAttribute('data-law-fine-choice')==='work');
  assert.equal(work.tagName,'BUTTON');assert.ok(work.textContent.includes('Work'));
  work.click();assert.equal(state.lawSecurity.fineOffer.status,'working');law.keepalive(2);app.refresh(ctx,{periodic:true});
  assert.match(panel.children[0].textContent,/2.0 \/ 4s/);
  app.onHide();assert.equal(panel.hidden,true);app.onShow(ctx);assert.equal(panel.hidden,false);
  app.onHide();app.onShow(ctx);law.keepalive(2);assert.equal(state.lawSecurity.fineOffer.status,'paid');assert.equal(panel.hidden,true);
  const before=bus.count('law:fineAssessed');app.dispose();assert.equal(panel.parentNode,null);assert.equal(bus.count('law:fineAssessed'),before-1);
 } finally {restoreDom();}
});
