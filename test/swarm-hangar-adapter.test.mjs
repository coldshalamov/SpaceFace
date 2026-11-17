import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, dispatch } from './helpers/mini-dom.mjs';
import { createCruciblePreparation } from '../src/ui/orrery/cruciblePreparation.js';
import { SHIPS } from '../src/data/ships.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';

function fixture({ noMount = false } = {}) {
  const env = installDom(), doc = env.document;
  const observers = [];
  const priorObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  };
  const notifyVisual = () => { for (const observer of observers) if (!observer.disconnected) observer.callback(); };
  const create = doc.createElement;
  doc.createElement = tag => {
    const node = create(tag);
    node.replaceChildren = (...children) => {
      for (const child of [...node.children]) child.remove();
      node.textContent = ''; node.append(...children);
    };
    node.prepend = (...children) => {
      for (const child of [...children].reverse()) node.insertBefore(child, node.firstChild);
    };
    return node;
  };
  const make = (tag, cls = '') => { const node = doc.createElement(tag); node.className = cls; return node; };
  const root = make('div'), title = make('header', 'k-title'), stage = make('div', 'k-stage');
  const foot = make('footer'), enter = make('button', 'k-word--primary');
  const arena = make('div', 'orr-door-hero'), arenaImage = make('img', 'orr-door-hero__art is-on');
  const arenaWords = make('div', 'orr-door-hero__words'), arenaName = make('p', 'orr-door-hero__name');
  arenaName.textContent = 'Ricochet Foundry'; arenaWords.append(arenaName); arena.append(arenaImage, arenaWords);
  const settings = make('ul', 'sf-crd-settings'), hullRow = make('li', 'sf-crd-row--hull');
  const state = { starterId: 'ricochet_runner', ruleset: 'swarm', stake: 'exhibition', arenaLabel: 'Ricochet Foundry' };
  let adapter;
  for (const kit of COMBAT_LAB_STARTER_PACKAGES) {
    const control = make('button', 'sf-crd-hull'); control.dataset.starterId = kit.id;
    control.addEventListener('click', () => { state.starterId = kit.id; adapter?.update(); });
    hullRow.append(control);
  }
  const hullChoices = SHIPS.map(ship => ({ hullId: ship.id, earned: !ship.swarmEarned, earnText: 'Earn the ship in Swarm.' }));
  for (const hull of hullChoices) {
    const control = make('button', 'sf-crd-anyhull-ship'); control.dataset.starterId = `hull:${hull.hullId}`;
    control.addEventListener('click', () => { if (hull.earned) { state.starterId = control.dataset.starterId; adapter?.update(); } });
    hullRow.append(control);
  }
  settings.append(hullRow); stage.append(settings); foot.append(enter); root.append(title, stage, arena, foot);
  doc.body.append(root);
  const calls = [];
  let preview;
  adapter = createCruciblePreparation({ root, title, stage, foot, enter, hullChoices,
    read: () => state, stageFactory: (host, options) => {
      calls.push(['create']);
      let canvas = make('canvas'), mounted = !noMount, readyFired = false;
      canvas.width = 640; canvas.height = 360;
      const poster = make('img', 'k-stage__poster');
      host.append(canvas, poster);
      preview = {
        get canvas() { return canvas; }, poster, hasMount: () => mounted,
        show(id, fit) { calls.push(['show', id, fit]); host.classList.remove('is-live'); poster.src = `${id}.webp`; },
        settle() {
          host.classList.add('is-live');
          // Match stageHull's once-only arrival hook. Later hull/fit arrivals must be
          // observed from the current stage, rather than relying on a second callback.
          if (!readyFired) { readyFired = true; options.onReady?.(); }
          notifyVisual();
        },
        activate() { calls.push(['activate']); }, deactivate() { calls.push(['deactivate']); },
        release() { calls.push(['release']); mounted = false; canvas.remove(); },
        restore() {
          calls.push(['restore']); mounted = !noMount; host.classList.remove('is-live');
          canvas = make('canvas'); canvas.width = 640; canvas.height = 360; host.append(canvas);
        },
        dispose() { calls.push(['dispose']); mounted = false; canvas.remove(); },
      };
      return preview;
    } });
  assert.ok(adapter, 'exercise the actual hangar adapter, not the fallback document route');
  return { root, state, enter, adapter, calls, notifyVisual, arenaImage, arenaWords, arenaName,
    get preview() { return preview; },
    steps: root.querySelectorAll('.sf-hangar-step').filter(node => node.tagName === 'BUTTON'),
    close() {
      adapter.dispose(); env.restore();
      if (priorObserver === undefined) delete globalThis.MutationObserver;
      else globalThis.MutationObserver = priorObserver;
    } };
}

test('the hangar keeps its GPU preview out of prewarm, the arena step and hidden screens', () => {
  const f = fixture();
  try {
    assert.equal(f.calls.length, 0, 'mounting the hidden screen uses only its authored poster');
    f.adapter.setActive(true);
    assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[1], 'ship_hornet');
    f.steps[1].click();
    assert.equal(f.calls.filter(call => call[0] === 'release').length, 1);
    const retired = f.calls.length;
    f.state.starterId = 'hull:ship_wasp'; f.adapter.update();
    f.adapter.setActive(true);
    assert.equal(f.calls.length, retired, 'arena settings never redraw or restore the hidden ship');
    f.steps[0].click();
    assert.equal(f.calls.filter(call => call[0] === 'restore').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[1], 'ship_wasp');
    f.adapter.setActive(false);
    const hidden = f.calls.length;
    f.state.starterId = 'energy_baseline'; f.adapter.update();
    assert.equal(f.calls.length, hidden);
    f.adapter.setActive(true);
    assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[1], 'ship_kestrel');
  } finally { f.close(); }
});

test('readiness follows the current visible hull and resets across fitting changes, release and disposal', () => {
  const f = fixture();
  try {
    assert.equal(f.root.dataset.kReady, '0');
    f.adapter.setActive(true);
    assert.equal(f.root.dataset.kReady, '0', 'a pending authored preview is not ready');
    f.preview.settle();
    assert.equal(f.root.dataset.kReady, '1');
    assert.equal(f.root.dataset.hangarVisual, 'ship-live');
    f.state.starterId = 'hull:ship_hornet'; f.adapter.update();
    assert.equal(f.root.dataset.kReady, '0', 'the previous fit cannot vouch for its replacement');
    f.preview.settle();
    assert.equal(f.root.dataset.kReady, '1');
    f.steps[1].click();
    f.preview.settle();
    assert.equal(f.root.dataset.kReady, '0', 'a released ship callback cannot ready the arena image');
    f.adapter.setActive(false); f.preview.settle();
    assert.equal(f.root.dataset.hangarVisual, 'inactive');
    f.adapter.setActive(true);
    assert.equal(f.root.dataset.kReady, '0', 'a restored context must establish readiness again');
    f.preview.settle();
    assert.equal(f.root.dataset.kReady, '1');
    f.adapter.dispose(); f.preview.settle();
    assert.equal(f.root.dataset.kReady, '0', 'late completion cannot ready a disposed screen');
  } finally { f.close(); }
});

test('only a missing preview mount can use a successfully decoded authored poster', async () => {
  const mounted = fixture();
  try {
    mounted.adapter.setActive(true);
    Object.assign(mounted.preview.poster, { complete: true, naturalWidth: 2400, decode: async () => {} });
    dispatch(mounted.preview.poster, 'load');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(mounted.root.dataset.kReady, '0', 'a covering poster cannot waive a pending or failed authored mount');
  } finally { mounted.close(); }

  const f = fixture({ noMount: true });
  try {
    f.adapter.setActive(true);
    let finish;
    Object.assign(f.preview.poster, { complete: true, naturalWidth: 2400,
      decode: () => new Promise(resolve => { finish = resolve; }) });
    dispatch(f.preview.poster, 'load');
    await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0', 'load alone is not a successful decode');
    finish(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '1');
    assert.equal(f.root.dataset.hangarVisual, 'ship-poster', 'the fallback is never labelled live');
  } finally { f.close(); }
});

test('arena readiness requires the selected decoded image and rejects stale, failed and hidden completions', async () => {
  const f = fixture();
  try {
    const decodes = [];
    Object.assign(f.arenaImage, { src: 'foundry.webp', complete: true, naturalWidth: 2000,
      decode: () => new Promise((resolve, reject) => decodes.push({ resolve, reject })) });
    f.adapter.setActive(true); f.steps[1].click();
    await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0');
    f.arenaImage.src = 'ceres.webp'; f.state.arenaLabel = 'Ceres Belt';
    f.arenaName.textContent = 'Ceres Belt'; f.arenaWords.classList.add('is-turning'); f.adapter.update();
    await Promise.resolve();
    decodes[0].resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0', 'the former arena decode cannot ready the new selection');
    decodes[1].resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0', 'the arena caption is still changing');
    f.arenaWords.classList.remove('is-turning'); f.notifyVisual();
    assert.equal(f.root.dataset.kReady, '1');
    assert.equal(f.root.dataset.hangarVisual, 'arena-image');
    f.arenaImage.src = 'missing.webp'; f.adapter.update(); await Promise.resolve();
    decodes[2].reject(new Error('decode failed')); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0', 'failed arena assets do not become ready');
    f.arenaImage.src = 'late.webp'; f.adapter.update(); await Promise.resolve();
    f.adapter.setActive(false); decodes[3].resolve();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.root.dataset.kReady, '0');
    assert.equal(f.root.dataset.hangarVisual, 'inactive');
  } finally { f.close(); }
});

test('visible hangar refreshes do not reactivate the preview, while hull and fitting changes still render', () => {
  const f = fixture();
  try {
    f.adapter.setActive(true);
    const firstFit = f.calls.find(call => call[0] === 'show');
    const arrived = f.calls.length;
    f.adapter.update();
    f.state.stake = 'veteran'; f.state.arenaLabel = 'Ceres Belt';
    f.adapter.update();
    f.adapter.setActive(true);
    assert.equal(f.calls.length, arrived,
      'refreshing unchanged preview content must not redraw or restart rotation');

    f.root.querySelectorAll('.sf-hangar-kit').find(node => node.dataset.swarmKit === 'hull:ship_hornet').click();
    const sameHullFit = f.calls.filter(call => call[0] === 'show').at(-1);
    assert.equal(sameHullFit[1], 'ship_hornet');
    assert.notDeepEqual(sameHullFit[2].fittings, firstFit[2].fittings);
    assert.equal(sameHullFit[2].preserveView, true, 'equipment changes preserve the current ship view');
    assert.equal(f.calls.filter(call => call[0] === 'activate').length, 1);

    f.root.querySelectorAll('.sf-hangar-hull').find(node => node.dataset.swarmHull === 'ship_kestrel').click();
    const changedHull = f.calls.filter(call => call[0] === 'show').at(-1);
    assert.equal(changedHull[1], 'ship_kestrel');
    assert.equal(changedHull[2].preserveView, false, 'a different hull receives its own framing');
    assert.equal(f.calls.filter(call => call[0] === 'show').length, 3,
      'each actual hull or fitting change reaches the renderer exactly once');
    assert.equal(f.calls.filter(call => call[0] === 'activate').length, 1);

    f.adapter.setActive(false);
    f.adapter.setActive(true);
    assert.equal(f.calls.filter(call => call[0] === 'restore').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'activate').length, 2,
      'a released preview must reactivate when the hangar becomes visible again');
    assert.equal(f.calls.filter(call => call[0] === 'show').at(-1)[1], 'ship_kestrel');
    f.adapter.update();
    assert.equal(f.calls.filter(call => call[0] === 'activate').length, 2);
  } finally { f.close(); }
});

test('returning to a cached hangar reopens the selected ship without resetting its loadout or run choices', () => {
  const f = fixture();
  try {
    f.adapter.setActive(true);
    f.root.querySelectorAll('.sf-hangar-hull').find(node => node.dataset.swarmHull === 'ship_kestrel').click();
    assert.equal(f.state.starterId, 'energy_baseline');
    f.state.stake = 'veteran'; f.state.arenaLabel = 'Ceres Belt';
    f.adapter.update();
    const chosen = structuredClone(f.state);
    const manifest = f.root.querySelector('.sf-hangar-manifest').textContent;
    const fit = f.calls.filter(call => call[0] === 'show').at(-1);
    f.steps[1].click();
    assert.equal(f.root.dataset.prepStep, '1');
    f.adapter.setActive(false);
    const hidden = f.calls.length;
    f.adapter.update();
    assert.equal(f.calls.length, hidden, 'the hidden cached hangar must not draw while the armory is active');

    f.adapter.setActive(true);
    f.adapter.focus();
    assert.equal(f.root.dataset.prepStep, '0');
    assert.equal(f.steps[0].getAttribute('aria-current'), 'step');
    assert.equal(f.root.querySelector('#sf-hangar-ships').hidden, false);
    assert.equal(f.root.querySelector('#sf-hangar-run').hidden, true);
    assert.equal(f.enter.hidden, true, 'returning cannot expose equipment review ahead of the ship');
    assert.deepEqual(f.state, chosen, 'returning must preserve the canonical preset, arena and difficulty');
    assert.equal(f.root.querySelector('.sf-hangar-manifest').textContent, manifest);
    assert.equal(f.root.querySelectorAll('.sf-hangar-hull').find(node => node.dataset.swarmHull === 'ship_kestrel')
      .getAttribute('aria-pressed'), 'true');
    assert.equal(f.root.querySelectorAll('.sf-hangar-kit').find(node => node.dataset.swarmKit === 'energy_baseline')
      .getAttribute('aria-pressed'), 'true');
    assert.deepEqual(f.calls.filter(call => call[0] === 'show').at(-1), fit,
      'the restored preview must show the same real hull and fitted equipment');
    assert.equal(f.root.ownerDocument.activeElement, f.steps[0]);
  } finally { f.close(); }
});

test('changing only the rules or funds updates readiness and explains how to finish equipment', () => {
  const f = fixture();
  try {
    f.state.starterId = 'hull:ship_wasp'; f.adapter.update(); f.steps[1].click();
    assert.equal(f.enter.disabled, false);
    assert.equal(f.enter.textContent, 'Review equipment →');
    f.state.ruleset = 'scored'; f.adapter.update();
    assert.equal(f.enter.disabled, true);
    assert.match(f.root.querySelector('.sf-hangar-fit-note').textContent, /Choose a loadout with a weapon/);
    f.state.ruleset = 'swarm'; f.state.stake = 'ironbound'; f.adapter.update();
    assert.equal(f.enter.disabled, true);
    assert.match(f.root.querySelector('.sf-hangar-footer-note').textContent, /no starting credits/);
    f.state.stake = 'contender'; f.adapter.update();
    assert.equal(f.enter.disabled, false);
    assert.match(f.root.querySelector('.sf-hangar-fit-note').textContent, /Choose and buy equipment/);
    f.state.starterId = 'ricochet_runner'; f.state.threatIds = ['draftless']; f.adapter.update();
    assert.equal(f.enter.disabled, false);
    assert.equal(f.enter.textContent, 'Launch challenge');
    assert.match(f.root.querySelector('.sf-hangar-fit-note').textContent, /take into the challenge/);
  } finally { f.close(); }
});

test('visible ship controls preserve locks, separate kit choices and label actual mount types', () => {
  const f = fixture();
  try {
    const hulls = f.root.querySelectorAll('.sf-hangar-hull');
    assert.equal(hulls.length, SHIPS.length);
    hulls.find(node => node.dataset.swarmHull === 'ship_saucer').click();
    assert.equal(f.state.starterId, 'ricochet_runner');
    assert.match(f.root.querySelector('.sf-hangar-selection-status').textContent, /Earn the ship/);
    hulls.find(node => node.dataset.swarmHull === 'ship_kestrel').click();
    assert.equal(f.state.starterId, 'energy_baseline');
    const choices = f.root.querySelectorAll('.sf-hangar-kit');
    assert.ok(choices.every(node => node.dataset.swarmKit === 'hull:ship_kestrel'
      || COMBAT_LAB_STARTER_PACKAGES.find(kit => kit.id === node.dataset.swarmKit)?.hullId === 'ship_kestrel'));
    const manifest = f.root.querySelector('.sf-hangar-manifest').textContent;
    assert.match(manifest, /Shield 1/); assert.match(manifest, /Engine 1/);
    assert.equal(f.root.querySelectorAll('[role="tabpanel"]').length, 0, 'step navigation uses ordinary labelled sections');
  } finally { f.close(); }
});
