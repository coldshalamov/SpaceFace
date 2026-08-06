// UIUX-OUTFITTING-SPEND-CONFIRMATION-TESTS-001
// Acceptance test for outfitting spend confirmation.
// Verifies that paid module purchases in the station Outfitting shop are gated by the shared
// confirm() dialog, that cancel restores focus without emitting ui:buyModule, that accept emits
// exactly one ui:buyModule with the original module id, and that high-cost spends use the danger
// confirmation variant. Tests production exports and the live source integration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  describeOutfittingPurchase,
  describeOutfittingSpendConfirm,
  isOutfittingSpendDanger,
} from '../src/ui/screens/outfitting.js';
import { confirm, isConfirmOpen } from '../src/ui/confirm.js';

const OUTFIT_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/outfitting.js', import.meta.url)),
  'utf8',
);
const SHIPWORKS_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/station/screens/shipworks.js', import.meta.url)),
  'utf8',
);

const ALL_BUYABLE = new Map([
  ...MODULES.map((d) => [d.id, d]),
  ...WEAPONS.filter((w) => !MODULES.some((m) => m.id === w.id)).map((d) => [d.id, d]),
]);

// ── Minimal fake DOM sufficient for confirm.js ───────────────────────────────

function installDom() {
  const byId = new Map();

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
    const re = /([a-zA-Z\-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(attrPart)) !== null) attrs.set(m[1], m[2]);
    return attrs;
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
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get textContent() {
      if (this.children.length) {
        return this.children.map((c) => c.textContent).join('');
      }
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
          const parent = stack[stack.length - 1];
          parent._textContent += text;
          if (end === -1) break;
          i = end;
          continue;
        }
        // comment skip
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
        if (!openMatch) { i++; continue; }
        const [, tag, attrPart] = openMatch;
        const selfClosing = attrPart.trim().endsWith('/');
        const child = document.createElement(tag);
        const attrs = parseAttrs(attrPart);
        for (const [k, v] of attrs) {
          child.setAttribute(k, v);
          if (k === 'class') child.className = v;
          if (k === 'id') {
            child.id = v;
            if (child.isConnected) byId.set(v, child);
          }
        }
        const parent = stack[stack.length - 1];
        parent.appendChild(child);
        if (!selfClosing) stack.push(child);
        i += openMatch[0].length - openMatch[3].length;
      }
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    }
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument || globalThis.document;
      child.isConnected = this.isConnected;
      this.children.unshift(child);
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
    dispatchEvent(ev) {
      const list = this._listeners.get(ev.type) || [];
      for (const fn of list) fn({ ...ev, target: this, currentTarget: this });
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    click() {
      this.dispatchEvent({ type: 'click' });
    }
    focus(opts) {
      void opts;
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
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
      return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 };
    }
  }

  function matchSelector(el, sel) {
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
    if (sel.includes('[')) {
      const attr = sel.slice(sel.indexOf('[') + 1, sel.indexOf(']'));
      const [name, val] = attr.split('=');
      if (val != null) return el.getAttribute(name) === val.replace(/"/g, '');
      return el.getAttribute(name) != null;
    }
    return el.tagName === sel.toUpperCase();
  }

  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const uiRoot = new FakeElement('div');
  uiRoot.id = 'ui-root';
  body.appendChild(uiRoot);

  let activeElement = body;
  const doc = {
    body,
    head,
    documentElement: body,
    get activeElement() { return activeElement; },
    set activeElement(v) { activeElement = v; },
    getElementById(id) { return byId.get(id) || null; },
    querySelector(sel) { return body.querySelector(sel); },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    createElement(tagName) {
      const el = new FakeElement(tagName);
      el.ownerDocument = doc;
      return el;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  uiRoot.ownerDocument = doc;

  globalThis.document = doc;
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};

  return { body, uiRoot, byId };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findButton(dialog, cls) {
  return dialog.querySelector('.' + cls);
}

function getConfirmDialog() {
  const root = document.getElementById('sf-confirm-root');
  return root && root.querySelector('.sf-confirm');
}

// ── Spend-danger threshold unit ─────────────────────────────────────────────

{
  assert.equal(isOutfittingSpendDanger(0, 10000), false, 'zero-cost actions are never danger');
  assert.equal(isOutfittingSpendDanger(100, 0), false, 'unaffordable spend is not danger when no credits');
  assert.equal(isOutfittingSpendDanger(6000, 10000), true, 'spend >=50% of available credits is danger');
  assert.equal(isOutfittingSpendDanger(4999, 10000), false, 'spend just under 50% is not danger');
  assert.equal(isOutfittingSpendDanger(9500, 10000), true, 'near-total spend is danger');
  assert.equal(isOutfittingSpendDanger(300, 10000), false, 'small spend leaving a healthy balance is not danger');
  assert.equal(isOutfittingSpendDanger(9600, 10000), true, 'spend leaving <=500 CR operational reserve is danger');
  assert.equal(isOutfittingSpendDanger(9400, 10000), true, 'spend at 94% of credits is danger');
  assert.equal(isOutfittingSpendDanger(420, 900), true, 'sub-50% spend leaving <=500 CR reserve is danger');
  assert.equal(isOutfittingSpendDanger(350, 900), false, 'sub-50% spend leaving >500 CR reserve is not danger');
}

// ── Confirm-option builder ──────────────────────────────────────────────────

{
  const freeMod = [...ALL_BUYABLE.values()].find((d) => d.price <= 0);
  if (freeMod) {
    assert.equal(describeOutfittingSpendConfirm(freeMod, 10000), null, 'zero-cost modules skip confirm');
  }

  const paidMod = { id: 'mod_test_cheap', name: 'Cheap Module', price: 1500, slotType: 'shield', size: 'S' };
  const fitOpts = describeOutfittingSpendConfirm(paidMod, 10000, { fitSlotIndex: 1 });
  assert.ok(fitOpts, 'paid module produces confirm options');
  assert.equal(fitOpts.title, 'Buy ' + paidMod.name + '?', 'confirm names the module');
  assert.match(fitOpts.body, /1,500 CR/, 'confirm states the cost');
  assert.equal(fitOpts.confirmLabel, 'Buy & Fit', 'fit-capable purchase labels Buy & Fit');
  assert.equal(fitOpts.danger, false, 'affordable purchase under threshold is not danger');

  const invOpts = describeOutfittingSpendConfirm(paidMod, 10000, {});
  assert.equal(invOpts.confirmLabel, 'Buy', 'inventory-only purchase labels Buy');
  assert.match(invOpts.body, /Goes to module inventory/, 'inventory purchase explains destination');

  const thinOpts = describeOutfittingSpendConfirm({ ...paidMod, price: 440 }, 900, { fitSlotIndex: 1 });
  assert.equal(thinOpts.danger, true, 'sub-50% spend leaving thin reserve is danger');
  assert.match(thinOpts.body, /operationally thin/, 'danger body warns about thin reserve');

  const halfOpts = describeOutfittingSpendConfirm({ ...paidMod, price: 5000 }, 10000, { fitSlotIndex: 1 });
  assert.equal(halfOpts.danger, true, 'spend at exactly 50% is danger');

  const noCreditsOpts = describeOutfittingSpendConfirm(paidMod, 0, { fitSlotIndex: 1 });
  assert.equal(noCreditsOpts.danger, false, 'unaffordable purchase is not flagged danger');
}

// ── Shared confirm modal behavior ───────────────────────────────────────────

{
  installDom();
  const opener = document.createElement('button');
  opener.id = 'test-opener';
  document.body.appendChild(opener);
  opener.focus();
  assert.equal(document.activeElement, opener, 'fixture focus starts on opener');

  let result = null;
  confirm({ title: 'Buy module?', body: 'Cost: 6,000 CR.', confirmLabel: 'Buy', danger: false }).then((v) => { result = v; });
  assert.equal(isConfirmOpen(), true, 'confirm is open before resolution');

  const dialog = getConfirmDialog();
  assert.ok(dialog, 'dialog element is rendered');
  assert.equal(dialog.getAttribute('role'), 'dialog', 'dialog has role=dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true', 'dialog has aria-modal=true');

  const cancelBtn = findButton(dialog, 'sf-confirm__cancel');
  const okBtn = findButton(dialog, 'sf-confirm__ok');
  assert.ok(cancelBtn, 'cancel button rendered');
  assert.ok(okBtn, 'confirm button rendered');
  assert.equal(document.activeElement, okBtn, 'non-danger confirm focuses OK by default');

  cancelBtn.click();
  await sleep(200);
  assert.equal(result, false, 'cancel resolves false');
  assert.equal(isConfirmOpen(), false, 'confirm closed after cancel');
  assert.equal(document.activeElement, opener, 'cancel restores focus to opener');
}

{
  installDom();
  const opener = document.createElement('button');
  opener.id = 'test-opener-2';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  confirm({ title: 'Buy module?', body: 'Cost: 6,000 CR.', confirmLabel: 'Buy', danger: false }).then((v) => { result = v; });
  const dialog = getConfirmDialog();
  const okBtn = findButton(dialog, 'sf-confirm__ok');
  okBtn.click();
  await sleep(200);
  assert.equal(result, true, 'accept resolves true');
  assert.equal(isConfirmOpen(), false, 'confirm closed after accept');
}

{
  installDom();
  const opener = document.createElement('button');
  opener.id = 'test-opener-danger';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  confirm({ title: 'Buy expensive module?', body: 'Cost: 9,600 CR.', confirmLabel: 'Buy', danger: true }).then((v) => { result = v; });
  const dialog = getConfirmDialog();
  const title = dialog.querySelector('#sf-confirm-title');
  const cancelBtn = findButton(dialog, 'sf-confirm__cancel');
  const okBtn = findButton(dialog, 'sf-confirm__ok');

  assert.equal(title.classList.contains('sf-confirm__title--danger'), true, 'danger title has danger class');
  assert.ok(okBtn.classList.contains('sf-btn--danger'), 'danger confirm button uses danger variant');
  assert.equal(document.activeElement, cancelBtn, 'danger confirm defaults focus to Cancel');

  // Stray Enter on default-focused danger must NOT commit.
  dialog.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {}, stopPropagation() {} });
  await sleep(200);
  assert.equal(result, false, 'Enter on danger default-focus resolves false (safe default)');
  assert.equal(document.activeElement, opener, 'focus restored after danger cancel');
}

{
  installDom();
  const opener = document.createElement('button');
  opener.id = 'test-opener-keyboard';
  document.body.appendChild(opener);
  opener.focus();

  let result = null;
  confirm({ title: 'Buy module?', body: 'Cost: 6,000 CR.', confirmLabel: 'Buy', danger: true }).then((v) => { result = v; });
  const dialog = getConfirmDialog();
  const okBtn = findButton(dialog, 'sf-confirm__ok');

  dialog.dispatchEvent({ type: 'keydown', key: 'Tab', preventDefault() {}, stopPropagation() {} });
  assert.equal(document.activeElement, okBtn, 'Tab moves focus from Cancel to Confirm');

  dialog.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {}, stopPropagation() {} });
  await sleep(200);
  assert.equal(result, true, 'Enter commits after Tab moves focus to Confirm');
}

{
  installDom();
  const opener = document.createElement('button');
  opener.id = 'test-opener-replace';
  document.body.appendChild(opener);
  opener.focus();

  let firstResult = null;
  let secondResult = null;
  confirm({ title: 'First?', body: 'First dialog.', confirmLabel: 'OK' }).then((v) => { firstResult = v; });
  confirm({ title: 'Second?', body: 'Second dialog.', confirmLabel: 'OK' }).then((v) => { secondResult = v; });

  await sleep(200);
  // Only the second dialog should remain open; the first is auto-cancelled.
  assert.equal(firstResult, false, 'opening a second confirm auto-cancels the first');
  assert.equal(secondResult, null, 'second confirm is still pending');
  assert.equal(isConfirmOpen(), true, 'second confirm is open');

  const dialog = getConfirmDialog();
  const okBtn = findButton(dialog, 'sf-confirm__ok');
  okBtn.click();
  await sleep(200);
  assert.equal(secondResult, true, 'second confirm resolves normally');
}

// ── Source integration assertions for outfitting.js ─────────────────────────

{
  // The single Buy handler must exist and gate paid purchases with confirm().
  assert.match(OUTFIT_SOURCE, /shopList\.addEventListener\('click',\s*async\s*\(ev\)\s*=>\s*\{/, 'outfitting shop has a single async click handler');
  assert.match(OUTFIT_SOURCE, /if\s*\(buyConfirmBusy\s*\|\|\s*isConfirmOpen\(\)\)\s*return/, 'handler has re-entry guard while a confirm is open');
  assert.match(OUTFIT_SOURCE, /describeOutfittingSpendConfirm\(def,\s*credits,\s*\{[\s\S]*?fitSlotIndex:\s*payload\.fitSlotIndex[\s\S]*?\}\)/, 'handler builds confirm options from the production helper');
  assert.match(OUTFIT_SOURCE, /ok\s*=\s*await\s+confirm\(confirmOpts\)/, 'paid module awaits confirm before proceeding');
  assert.match(OUTFIT_SOURCE, /if\s*\(!ok\)\s*\{[\s\S]*?ctx\.bus\.emit\('audio:cue',\s*\{\s*id:\s*'ui_deny'\s*\}\);[\s\S]*?return;\s*\}/, 'cancel emits ui_deny and returns without buy');
  assert.match(OUTFIT_SOURCE, /ctx\.bus\.emit\('ui:buyModule',\s*payload\)/, 'handler emits ui:buyModule after confirmation');

  // Confirm that the payload passed to ui:buyModule carries the original defId and optional fitSlotIndex.
  const buyEmitIndex = OUTFIT_SOURCE.indexOf("ctx.bus.emit('ui:buyModule', payload)");
  const confirmAwaitIndex = OUTFIT_SOURCE.indexOf('ok = await confirm(confirmOpts)');
  assert.ok(buyEmitIndex > confirmAwaitIndex, 'ui:buyModule emit follows the confirm await');
  assert.match(OUTFIT_SOURCE, /const\s+payload\s*=\s*\{\s*defId\s*\}/, 'payload starts with original defId');
  assert.match(OUTFIT_SOURCE, /payload\.fitSlotIndex\s*=\s*fitSlotIndex/, 'payload preserves optional fitSlotIndex');

  // Focus restoration: the button is focused before confirm so cancel restores to it.
  assert.match(OUTFIT_SOURCE, /btn\.focus\(\{\s*preventScroll:\s*true\s*\}\)/, 'handler focuses the Buy button before opening confirm');
}

// ── Default Shipworks source integration ──────────────────────────────

{
  assert.match(SHIPWORKS_SOURCE, /chooserEl\.addEventListener\('click',\s*async\s*\(ev\)\s*=>\s*\{/, 'default Shipworks chooser has one async click handler');
  assert.match(SHIPWORKS_SOURCE, /if\s*\(buyConfirmBusy\s*\|\|\s*isConfirmOpen\(\)\)\s*return/, 'Shipworks blocks purchase re-entry while confirmation is open');
  assert.match(SHIPWORKS_SOURCE, /describeOutfittingSpendConfirm\(def,\s*credits,\s*\{\s*fitSlotIndex:\s*slotIndex\s*\}\)/, 'Shipworks uses the shared module-spend description');
  assert.match(SHIPWORKS_SOURCE, /ok\s*=\s*await\s+confirm\(confirmOpts\)/, 'Shipworks awaits paid-spend confirmation');
  assert.match(SHIPWORKS_SOURCE, /if\s*\(!ok\)\s*\{[\s\S]*?return;\s*\}/, 'Shipworks cancellation returns before purchase');
  const shipworksBuyIndex = SHIPWORKS_SOURCE.indexOf("ctx.bus.emit('ui:buyModule', { defId, fitSlotIndex: slotIndex })");
  const shipworksConfirmIndex = SHIPWORKS_SOURCE.indexOf('ok = await confirm(confirmOpts)');
  assert.ok(shipworksBuyIndex > shipworksConfirmIndex, 'default-route module purchase follows confirmation');
}

// ── describeOutfittingPurchase still reports disabled states correctly ───────

{
  const mod = { id: 'mod_shield_booster_s', name: 'Shield Booster S', price: 6000, slotType: 'shield', size: 'S', requiresTech: 'tech_deflectors' };
  const slots = [{ type: 'shield', size: 'S' }];

  const locked = describeOutfittingPurchase(mod, { credits: 10000, researchedNodes: [] }, slots, []);
  assert.equal(locked.disabled, true, 'unresearched module is disabled');

  const poor = describeOutfittingPurchase(mod, { credits: 1000, researchedNodes: ['tech_deflectors'] }, slots, []);
  assert.equal(poor.disabled, true, 'unaffordable module is disabled');

  const fit = describeOutfittingPurchase(mod, { credits: 10000, researchedNodes: ['tech_deflectors'] }, slots, []);
  assert.equal(fit.disabled, false, 'affordable researched module with open slot is enabled');
  assert.equal(fit.label, 'Buy & Fit', 'open compatible slot shows Buy & Fit');
  assert.equal(fit.fitSlotIndex, 0, 'fitSlotIndex points at the open slot');
}

console.log('outfitting-spend-confirmation: all acceptance checks passed');
