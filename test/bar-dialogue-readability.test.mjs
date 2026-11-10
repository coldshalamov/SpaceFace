import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { buildReply, generateContacts } from '../src/ui/station/barContacts.js';
import { injectStationStandard } from '../src/ui/orrery/stationStandard.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// Mount the production controller. This small DOM models its text, focus and scroll calls,
// not a browser's CSS geometry. Actual compact geometry has a separate browser regression.
function mount({ reduceMotion = false } = {}) {
  const saved = Object.fromEntries(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  const doc = fakeDom(), make = doc.createElement, frames = new Map(); let frameId = 0;
  const unescape = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  doc.createElement = tag => {
    const node = make(tag.toUpperCase()); node.ownerDocument = doc; node.isConnected = true;
    node.hidden = false; node.offsetWidth = 260; node.clientHeight = 180; node.scrollTop = 0;
    node.style.removeProperty = () => {}; node.style.getPropertyValue = () => '';
    node.hasAttribute = key => node.getAttribute(key) != null;
    node.removeEventListener = (name, fn) => { node.listeners[name] = (node.listeners[name] || []).filter(item => item !== fn); };
    node.getBoundingClientRect = () => ({ left: 0, right: 260, top: 0, bottom: 180, width: 260, height: 180 });
    node.contains = other => node === other || node.children.some(child => child.contains(other));
    node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; };
    node.remove = () => node.parentNode?.removeChild(node);
    node.replaceChildren = (...children) => { node.children = []; node.append(...children); };
    node.scrollIntoView = options => { node.lastScroll = options; };
    node.closest = selector => {
      const matches = selector.startsWith('.') ? node.classList.contains(selector.slice(1))
        : selector.startsWith('[') && node.hasAttribute(selector.slice(1,-1));
      return matches ? node : node.parentNode?.closest(selector) || null;
    };
    node.focus = () => {
      doc.activeElement = node;
      for (let parent = node; parent; parent = parent.parentNode) for (const fn of parent.listeners.focusin || []) fn({ target: node });
    };
    node.click = () => {
      for (let parent = node; parent; parent = parent.parentNode) for (const fn of parent.listeners.click || []) fn({ target: node, preventDefault() {}, stopPropagation() {} });
    };
    const selectors = new Map(); let html = '';
    node.querySelector = selector => {
      if (selectors.has(selector)) return selectors.get(selector);
      if (selector === '.sx-choice') return node.buttons?.[0] || null;
      if (selector === '.sx-talk__reply.is-said') return selectors.get('.sx-talk__reply')?.classList.contains('is-said') ? selectors.get('.sx-talk__reply') : null;
      return null;
    };
    node.querySelectorAll = selector => {
      if (selector === '.sx-talk__role, .sx-choice') return [selectors.get('.sx-talk__role'), ...(node.buttons || [])].filter(Boolean);
      if (selector.includes('[data-choice]') || selector === '.sx-choice') return node.buttons || [];
      if (selector === '.sx-choice.is-current') return (node.buttons || []).filter(b => b.classList.contains('is-current'));
      return [];
    };
    node.insertAdjacentElement = (_where, child) => node.parentNode?.appendChild(child);
    Object.defineProperty(node, 'innerHTML', { get: () => html, set(value) {
      html = value; selectors.clear(); node.children = []; node.buttons = [];
      for (const name of ['sx-bar__hang', 'sx-bar__rail', 'sx-bar__stage', 'sx-bar__leads', 'sx-talk', 'sx-talk__id', 'sx-talk__choices']) {
        if (!value.includes(name)) continue;
        const item = doc.createElement('div'); item.className = name; node.appendChild(item); selectors.set(`.${name}`, item);
      }
      for (const match of value.matchAll(/<(p|h2) class="([^"]+)"[^>]*>([^<]*)<\/(?:p|h2)>/g)) {
        const item = doc.createElement(match[1]); item.className = match[2]; item.textContent = unescape(match[3]); node.appendChild(item);
        for (const name of match[2].split(' ')) selectors.set(`.${name}`, item);
      }
      for (const match of value.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-choice="([^"]+)"([^>]*)>([^<]*)<\/button>/g)) {
        const item = doc.createElement('button'); item.className = match[1]; item.setAttribute('data-choice', match[2]);
        item.disabled = / disabled/.test(match[3]); item.textContent = unescape(match[4]); node.appendChild(item); node.buttons.push(item);
      }
    } });
    return node;
  };
  doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body');
  if (reduceMotion) doc.documentElement.classList.add('sf-reduce-motion');
  doc.querySelector = () => null; doc.querySelectorAll = () => [];
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  globalThis.document = doc; globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const sim = createSimulation({ seed: 4242, systems: [], updateOrder: [] });
  sim.state.ui.docked = true; sim.state.ui.dockedStationId = 'station_helios';
  const ctx = { state: sim.state, bus: sim.bus }; const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  const key = (target, key) => { let prevented = false; for (const fn of stage.listeners.keydown) fn({ target, key, preventDefault() { prevented = true; } }); return prevented; };
  const flushFrames = now => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); };
  return { doc, sim, ctx, screen, stage, key, frames, flushFrames,
    close() { screen.dispose(); sim.dispose(); flushFrames(10000); for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('mounted Bar keeps the entire response during animation frames and retains its opener', () => {
  const h = mount(); try {
    const contact = generateContacts('station_helios', h.sim.state)[0];
    const button = h.stage.buttons[0]; assert.ok(button);
    const expected = buildReply(contact.role, button.getAttribute('data-choice'), h.ctx, 'station_helios', contact).text;
    button.click();
    const reply = h.stage.querySelector('.sx-talk__reply'); assert.equal(reply.textContent, expected);
    assert.equal(h.doc.activeElement, reply);
    h.flushFrames(0);
    assert.equal(reply.textContent, expected, 'the first animation frame cannot replace the consequence with a partial line');
    assert.ok(h.stage.querySelector('.sx-talk__memory').textContent.length);
    assert.equal(h.stage.buttons.length, 3);
    h.screen.onHide(); h.screen.onShow();
    assert.equal(h.stage.querySelector('.sx-talk__reply').textContent, expected, 'reopening retains the complete response');
  } finally { h.close(); }
});

for (const reduceMotion of [false, true]) test(`mounted Bar retires label animation across reopen and disposal (reduced motion: ${reduceMotion})`, () => {
  const h = mount({ reduceMotion }); try {
    const first = h.stage.buttons[0], label = first.textContent;
    h.flushFrames(0);
    if (reduceMotion) assert.equal(first.textContent, label);
    else {
      assert.notEqual(first.textContent, label, 'exercise the actual decrypt driver, not just an inert label');
      assert.equal(first.getAttribute('aria-label'), label, 'animation retains the accessible choice name');
    }
    h.screen.onHide(); h.screen.onShow();
    assert.equal(first.textContent, label, 'replacing the stage retires the old label animation');
    const current = h.stage.buttons[0], currentLabel = current.textContent;
    current.click();
    const answer = h.stage.querySelector('.sx-talk__reply').textContent;
    h.flushFrames(0);
    assert.equal(h.stage.querySelector('.sx-talk__reply').textContent, answer);
    h.screen.dispose();
    assert.equal(current.textContent, currentLabel);
    h.flushFrames(10000);
    assert.equal(h.frames.size, 0, 'disposed drivers cannot schedule another animation frame');
    assert.equal(h.stage.querySelector('.sx-talk__reply').textContent, answer);
  } finally { h.close(); }
});

test('mounted Bar reveals keyboard and gamepad-focused choices without committing previews', async () => {
  const h = mount(); const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let input, gamepad;
  try {
    const [first,, last] = h.stage.buttons;
    first.focus(); assert.equal(h.key(first, 'End'), true);
    assert.equal(h.doc.activeElement, last); assert.deepEqual(last.lastScroll, { block: 'nearest', inline: 'nearest' });
    assert.equal(h.stage.querySelector('.sx-talk__reply').classList.contains('is-said'), false);
    assert.equal(h.key(last, 'Home'), true); assert.equal(h.doc.activeElement, first);
    assert.equal(h.key(first, '3'), true); assert.equal(h.doc.activeElement, last);
    assert.equal(h.key(last, '3'), true); assert.equal(h.stage.querySelector('.sx-talk__reply').classList.contains('is-said'), true);
    const screens = h.doc.createElement('main'); screens.appendChild(h.screen.el);
    screens.querySelector = () => h.screen.el; screens.querySelectorAll = () => [h.screen.el];
    const getById = h.doc.getElementById; h.doc.getElementById = id => id === 'screens' ? screens : getById(id);
    h.screen.el.querySelectorAll = () => h.stage.buttons;
    h.stage.buttons.forEach((b,i) => { b.getBoundingClientRect = () => ({ left:0, right:260, top:i*48, bottom:i*48+44, width:260, height:44 }); });
    let pressed = -1;
    Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ getGamepads:() => [{ id:'Synthetic Bar pad', index:0, connected:true, mapping:'standard', timestamp:1,
      axes:[0,0,0,0], buttons:Array.from({length:17}, (_,i) => ({pressed:i===pressed,value:i===pressed?1:0})) }] } });
    const { createGamepad } = await import('../src/systems/gamepad.js');
    const { createUiInput } = await import('../src/ui/input.js');
    const state = h.sim.state; state.settings.controls = { gamepad:{enabled:true} }; state.mode = 'flight'; state.timeScale = 0;
    gamepad = createGamepad({ state, bus:h.sim.bus });
    input = createUiInput({ state, bus:h.sim.bus, gamepad }, { isOpen:()=>true, top:()=> 'station', locked:()=>true, getActiveScreenDef:()=>h.screen });
    h.stage.buttons[0].focus(); pressed=13; input.tick(0.016); pressed=-1; input.tick(0.016);
    assert.equal(h.doc.activeElement, h.stage.buttons[1]);
    assert.deepEqual(h.doc.activeElement.lastScroll, { block:'nearest', inline:'nearest' });
    const c = generateContacts('station_helios', h.sim.state)[0];
    const expected = buildReply(c.role, h.stage.buttons[1].getAttribute('data-choice'), h.ctx, 'station_helios', c).text;
    pressed=0; input.tick(0.016); pressed=-1; input.tick(0.016);
    assert.equal(h.stage.querySelector('.sx-talk__reply').textContent, expected, 'gamepad A commits the focused choice');
    assert.equal(h.doc.activeElement, h.stage.querySelector('.sx-talk__reply'));
  } finally { input?.dispose(); gamepad?.dispose?.(); h.close(); if (savedNavigator) Object.defineProperty(globalThis,'navigator',savedNavigator); else delete globalThis.navigator; }
});

test('the shared compact Bar CSS keeps context, wrapping and real touch targets', () => {
  const doc = fakeDom(); injectStationStandard(doc);
  const css = doc.getElementById('sf-station-standard').textContent;
  const compact = css.slice(css.indexOf('/* A response is a complete reading'), css.indexOf('/* On a short landscape Market'));
  assert.match(compact, /white-space:normal/); assert.match(compact, /overflow-wrap:anywhere/);
  assert.match(compact, /sx-talk__head \.sx-talk__memory \{ display:block/);
  assert.match(compact, /sx-talk__head \.sx-talk__role \{ display:block/);
  assert.match(compact, /sx-talk__head > \.sx-talk__avatar \{ display:block/);
  assert.match(compact, /min-height:44px/); assert.match(compact, /overflow:visible/);
  assert.doesNotMatch(compact, /not\(\[data-sf-mobile/);
});
