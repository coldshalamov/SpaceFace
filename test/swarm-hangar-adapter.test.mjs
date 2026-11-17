import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/mini-dom.mjs';
import { createCruciblePreparation } from '../src/ui/orrery/cruciblePreparation.js';
import { SHIPS } from '../src/data/ships.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';

function fixture() {
  const env = installDom(), doc = env.document;
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
  settings.append(hullRow); stage.append(settings); foot.append(enter); root.append(title, stage, foot);
  doc.body.append(root);
  const calls = [];
  adapter = createCruciblePreparation({ root, title, stage, foot, enter, hullChoices,
    read: () => state, stageFactory: () => {
      calls.push(['create']);
      return {
        show(id, options) { calls.push(['show', id, options]); },
        activate() { calls.push(['activate']); }, deactivate() { calls.push(['deactivate']); },
        release() { calls.push(['release']); }, restore() { calls.push(['restore']); },
        dispose() { calls.push(['dispose']); },
      };
    } });
  assert.ok(adapter, 'exercise the actual hangar adapter, not the fallback document route');
  return { root, state, enter, adapter, calls,
    steps: root.querySelectorAll('.sf-hangar-step').filter(node => node.tagName === 'BUTTON'),
    close() { adapter.dispose(); env.restore(); } };
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
