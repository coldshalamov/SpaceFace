import test from 'node:test';
import assert from 'node:assert/strict';
import { KITE_CORNER_PROGRAM as P, kiteCornerAvailable, kiteCornerDuration, kiteCornerMoment, kiteCornerPassSeconds } from '../src/data/kiteCornerProgram.js';
import { RED_KITE_GATES, redKiteClass } from '../src/data/redKite.js';
import { createKiteCornerScreen } from '../src/ui/orrery/kiteCornerProgram.js';

test('the public reel binds to actual course, medium hull and bounded recorded samples', () => {
  assert.equal(kiteCornerAvailable(), true); assert.deepEqual(P.gate, RED_KITE_GATES[0]);
  for (const p of P.passes) {
    assert.equal(p.hullClass, redKiteClass({ radius: p.radius })); assert.equal(p.hullClass, 'medium');
    assert(p.poses.length <= 300); assert(p.poses.at(-1)[0] <= 1800);
    assert.equal(p.elapsedTicks, p.exitTick - p.entranceTick);
    assert(p.entranceTick < p.gateTick && p.gateTick < p.exitTick);
    for (let i = 1; i < p.poses.length; i++) assert.equal(p.poses[i][0] - p.poses[i - 1][0], 6);
  }
  assert.equal(P.passes[0].elapsedTicks, 289); assert.equal(P.passes[1].elapsedTicks, 248);
  assert.deepEqual(P.passes[0].poses.filter(p => p[0] < 134), P.passes[1].poses.filter(p => p[0] < 134));
});
test('the measured late turn genuinely runs wider, not just a different caption', () => {
  const g = P.gate.pos, n = P.outgoing;
  const excursion = p => Math.max(...p.poses.filter(row => row[0] >= p.gateTick)
    .map(row => Math.abs((row[1] - g.x) * -n.nz + (row[2] - g.z) * n.nx)));
  assert(excursion(P.passes[0]) > 170); assert(excursion(P.passes[1]) < 50);
  assert.equal(P.passes[0].entranceTick, P.passes[1].entranceTick);
  assert.equal(P.passes[0].gateTick, P.passes[1].gateTick);
});
test('changed course and malformed tapes fail closed instead of claiming current results', () => {
  const p = structuredClone(P); p.courseVersion++; assert.equal(kiteCornerAvailable(p), false);
  p.courseVersion--; p.gate.pos.x++; assert.equal(kiteCornerAvailable(p), false);
  p.gate.pos.x--; p.passes[0].poses[1][0] = p.passes[0].poses[0][0]; assert.equal(kiteCornerAvailable(p), false);
  for (const mutate of [p => { p.gate.pos = null; }, p => { p.passes[0] = null; },
    p => { p.outgoing.nx += .1; }, p => { p.passes[0].hullClass = 'light'; },
    p => { p.passes[0].poses[0][0] = .5; }, p => { p.passes[0].poses[0] = null; }]) {
    const bad = structuredClone(P); mutate(bad); assert.equal(kiteCornerAvailable(bad), false);
  }
});
test('programme has an introduction, two genuine sampled passes and a bounded ending', () => {
  assert.equal(kiteCornerMoment(-5).beat, 'course'); assert.equal(kiteCornerMoment(4).beat, 'wide');
  assert.equal(kiteCornerMoment(4 + kiteCornerPassSeconds(P.passes[0])).beat, 'cleaner');
  assert.equal(kiteCornerMoment(999).beat, 'end'); assert(kiteCornerDuration() < 30);
  const m = kiteCornerMoment(6); assert.deepEqual(m.pose, P.passes[m.index].poses[m.poseIndex]);
});
test('each pass holds its real completed final frame, including selectable stills', () => {
  let boundary = 4;
  for (const p of P.passes) {
    boundary += kiteCornerPassSeconds(p);
    const moment = kiteCornerMoment(boundary - .001);
    assert.deepEqual(moment.pose, p.poses.at(-1)); assert(moment.pose[0] >= p.exitTick);
  }
});

function harness({ reduced = false, station = 'station_ceres' } = {}) {
  const previous = globalThis.document;
  const make = tagName => ({ tagName, children: [], attributes: {}, style: {}, listeners: new Map(), textContent: '',
    appendChild(n) { this.children.push(n); n.parent = this; return n; },
    replaceChildren(...ns) { this.children = []; ns.forEach(n => this.appendChild(n)); },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    addEventListener(k, f) { if (!this.listeners.has(k)) this.listeners.set(k, new Set()); this.listeners.get(k).add(f); },
    removeEventListener(k, f) { this.listeners.get(k)?.delete(f); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); },
    click() { if (this.disabled) return; for (const f of this.listeners.get('click') || []) f({ target: this }); },
  });
  const doc = make('document'); doc.createElement = make; doc.createElementNS = (_, tag) => make(tag); doc.hidden = false;
  globalThis.document = doc;
  const listeners = new Map(), scheduled = new Map(); let next = 0, returned = 0;
  const state = { ui: { docked: true, dockedStationId: station }, player: { credits: 1500, cargo: { items: {} } } };
  const bus = { on(k, f) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(f); },
    off(k, f) { listeners.get(k)?.delete(f); } };
  const screen = createKiteCornerScreen({ state, bus }, { motionReduced: () => reduced,
    requestFrame: f => { const id = ++next; scheduled.set(id, f); return id; },
    cancelFrame: id => scheduled.delete(id), onReturn: () => returned++ });
  const nodes = () => { const out = []; const walk = n => { out.push(n); n.children.forEach(walk); }; walk(screen.el); return out; };
  return { screen, state, doc, scheduled, listeners, nodes, returned: () => returned, setReduced: value => { reduced = value; },
    button: text => nodes().find(n => n.tagName === 'button' && n.textContent === text),
    emit: k => { for (const f of listeners.get(k) || []) f(); },
    frame(now) { const rows = [...scheduled]; scheduled.clear(); rows.forEach(([, f]) => f(now)); },
    close() { screen.dispose(); globalThis.document = previous; } };
}
test('optional programme playback uses one callback, ends, and never changes campaign state', () => {
  const h = harness(), before = structuredClone(h.state);
  try { h.screen.onShow(); assert.equal(h.scheduled.size, 1); h.screen.onShow(); assert.equal(h.scheduled.size, 1);
    h.frame(0); h.frame(5000); assert.equal(h.scheduled.size, 1);
    h.frame(30000); assert.equal(h.scheduled.size, 0); assert(h.nodes().some(n => n.textContent.includes('Wide 4.82 s · Cleaner 4.13 s')));
    assert.deepEqual(h.state, before); h.button('Return to services').click(); assert.equal(h.returned(), 1);
  } finally { h.close(); }
});
test('reduced motion starts paused with inspectable stills and native keyboard controls', () => {
  const h = harness({ reduced: true });
  try { h.screen.onShow(); assert.equal(h.scheduled.size, 0); assert.equal(h.button('Play').disabled, true);
    h.button('Wide pass').click(); assert(h.nodes().some(n => n.tagName === 'h3' && n.textContent === 'Left it late'));
    h.button('Cleaner pass').click(); assert(h.nodes().some(n => n.tagName === 'h3' && n.textContent === 'Make the handoff'));
    assert.equal(h.scheduled.size, 0); assert(h.nodes().some(n => n.tagName === 'input' && n.type === 'range'));
  } finally { h.close(); }
});
test('hide, hidden document, station change, undock and dispose retire playback and listeners', () => {
  const h = harness();
  try { h.screen.onShow(); h.screen.onHide(); assert.equal(h.scheduled.size, 0);
    assert([...h.listeners.values()].every(set => set.size === 0)); assert.equal(h.doc.listeners.get('visibilitychange').size, 0);
    h.screen.onShow(); h.doc.hidden = true; h.frame(1); assert.equal(h.scheduled.size, 0);
    h.doc.hidden = false; h.screen.onShow(); h.state.ui.dockedStationId = 'station_io'; h.screen.refresh(); assert.equal(h.scheduled.size, 0);
    h.state.ui.dockedStationId = 'station_ceres'; h.screen.onShow(); h.emit('dock:undocked'); assert.equal(h.scheduled.size, 0);
    h.screen.dispose(); assert([...h.listeners.values()].every(set => set.size === 0));
    assert.equal(h.doc.listeners.get('visibilitychange').size, 0);
  } finally { h.close(); }
});
test('changing reduced-motion preference updates playback and controls without reopening', () => {
  const h = harness({ reduced: true });
  try { h.screen.onShow(); assert.equal(h.button('Play').disabled, true);
    h.setReduced(false); h.screen.refresh(); assert.equal(h.button('Play').disabled, false);
    h.button('Play').click(); assert.equal(h.scheduled.size, 1);
    h.setReduced(true); h.frame(0); assert.equal(h.scheduled.size, 0);
    assert.equal(h.button('Play').disabled, true);
    assert(h.nodes().some(n => n.textContent.startsWith('Reduced motion:')));
  } finally { h.close(); }
});
test('the reel never starts for a different berth', () => {
  const h = harness({ station: 'station_io' }); try { h.screen.onShow(); assert.equal(h.scheduled.size, 0); } finally { h.close(); }
});

// Exercise the actual station owner block without importing/booting the berth renderer.
// Programme animation itself is exercised above; these doubles count owner handoffs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { markStationControl } from '../src/ui/station/stationBindingMap.js';
const stationSource = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');
function stationMountHarness() {
  const calls = [], controls = [];
  const node = () => ({ attributes: {}, dataset: {}, hidden: false,
    setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
    replaceChildren(n) { this.child = n; }, addEventListener(k, f) { this[k] = f; },
    focus() { calls.push('focus-entry'); }, classList: { toggle() {} } });
  const bodyEl = node(), state = { ui: { docked: true, dockedStationId: 'station_ceres' } };
  const screens = new Map(['market', 'contracts'].map(id => [id, {
    el: { id }, onShow() { calls.push(id + ':show'); }, onHide() { calls.push(id + ':hide'); }, refresh() { calls.push(id + ':refresh'); },
  }]));
  let returnToServices;
  const programme = { el: { querySelector() { return { focus() { calls.push('focus-programme'); } }; } },
    onShow() { calls.push('programme:show'); }, onHide() { calls.push('programme:hide'); }, refresh() { calls.push('programme:refresh'); } };
  const context = {
    document: { createElement() { const n = node(); controls.push(n); return n; } },
    helpEl: { parentNode: { insertBefore() {} } }, bodyEl, screenCache: screens,
    state: () => state, stationId: () => state.ui.dockedStationId, ctx: { state },
    createKiteCornerScreen(_ctx, opts) { returnToServices = opts.onReturn; return programme; },
    closePop() {}, setCommsOpen() {}, DESTINATIONS: [...screens.keys()].map(id => ({ id })),
    app: node(), rootEl: node(), dock: { setActive() {} }, stationOperationToSurface: id => id,
    applyDestinationRegister() {}, screenFor: dest => screens.get(dest.id), effects: { navigate() {}, syncPolicy() {} },
    isPhoneLayout: () => false, renderStatus() {}, applyDockAttention() {}, lastMissionAttention: null,
    markStationControl,
  };
  const mount = stationSource.slice(stationSource.indexOf("  // Kite's Corner borrows"), stationSource.indexOf('  // The register per destination'));
  const refresh = stationSource.slice(stationSource.indexOf('  function refresh(_nextCtx'), stationSource.indexOf('  // Implicit exits'));
  const active = stationSource.slice(stationSource.indexOf('  function activeScreen()'), stationSource.indexOf('\n  return {\n    el: app,'));
  const api = vm.runInNewContext(`let activeId = 'market', shown = true; ${mount}\n${refresh}\n${active}\n({ openKite, closeKite, navigate, refresh, syncKiteEntry, activeScreen, get activeId() { return activeId; }, get open() { return kiteOpen; } })`, context);
  return { api, calls, state, bodyEl, button: controls[0], programme, returnToServices: () => returnToServices() };
}
test('normal Ceres footer entry preserves the service and returns focus without campaign writes', () => {
  const h = stationMountHarness(), before = structuredClone(h.state);
  assert.equal(h.button.hidden, false); assert.equal(h.button.type, 'button');
  h.button.click(); assert.deepEqual(h.calls, ['market:hide', 'programme:show', 'focus-programme']);
  assert.equal(h.api.activeId, 'market'); assert.equal(h.api.activeScreen(), h.programme);
  h.returnToServices(); assert.deepEqual(h.calls.slice(3), ['programme:hide', 'market:show', 'focus-entry']);
  assert.equal(h.bodyEl.child.id, 'market'); assert.equal(h.button.attributes['aria-expanded'], 'false');
  assert.deepEqual(h.state, before);
});
test('rail navigation leaves the programme without hiding the previous service twice', () => {
  for (const target of ['market', 'contracts']) {
    const h = stationMountHarness(); h.api.openKite(); h.calls.length = 0; h.api.navigate(target);
    assert.deepEqual(h.calls, ['programme:hide', target + ':show']);
    assert.equal(h.api.activeId, target); assert.equal(h.api.open, false);
  }
});
test('station refresh owns only the visible programme and station changes stop it', () => {
  const h = stationMountHarness(); h.api.openKite(); h.calls.length = 0;
  h.api.refresh(null, { periodic: true }); assert.deepEqual(h.calls, ['programme:refresh']);
  h.state.ui.dockedStationId = 'station_io'; h.api.syncKiteEntry(); h.api.refresh(null, { periodic: true });
  assert.equal(h.button.hidden, true); assert.equal(h.api.open, false); assert.deepEqual(h.calls.slice(-2), ['programme:hide', 'market:show']);
  h.api.openKite(); assert.equal(h.api.open, false);
  h.state.ui.dockedStationId = 'station_ceres'; h.state.ui.docked = false;
  h.api.syncKiteEntry(); h.api.openKite(); assert.equal(h.button.hidden, true); assert.equal(h.api.open, false);
});
test('station hide/dispose and keyboard exit ownership retain their original routes', () => {
  assert.match(stationSource, /if \(kiteOpen\) closeKite\(false\);\n      else if \(scr/);
  assert.match(stationSource, /kiteButton\.removeEventListener\('click', openKite\);\n      kiteScreen\?\.dispose\(\)/);
  assert.match(stationSource, /ev\.key !== 'Escape'/);
  assert.match(stationSource, /setStationExitOwner/);
  assert.match(stationSource, /import \{ createStationLifePresenter \} from '\.\/stationLife\.js'/);
  assert.match(stationSource, /import \{ stationInfoFor \}/);
});

test('mission attention updates never reopen a hidden service or interrupt the programme', () => {
  const handler = stationSource.match(/subscribe\('mission:updated', \(payload = \{\}\) => \{([\s\S]*?)\n  \}\);/)[1];
  for (const onboardingChoice of [false, true]) {
    let got;
    vm.runInNewContext(`(() => { ${handler} })()`, { shown: true, kiteOpen: true, payload: { onboardingChoice },
      applyDockAttention(options) { got = options; } });
    assert.equal(got.allowAutoOpen, false); assert.equal(got.refreshActive, false);
  }
});
