import assert from 'node:assert/strict';
import test from 'node:test';
import { makeDocument } from './helpers/mini-dom.mjs';
import { chooseHangarHull, listHulls, openSwarmHangar, showHangarRunOptions, showHangarShips } from '../scripts/player-truth/routes.mjs';

// This fixture tests route actors against visible public controls. It deliberately keeps
// duplicate legacy preset buttons hidden, as the live screen does. Pixel hit testing and
// the real screen's keyboard behavior belong to check-swarm-hangar-ux.mjs.
function fixture() {
  const doc = makeDocument();
  const clicks = [];
  const make = (tag, attrs = {}, text = '') => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.textContent = text;
    return node;
  };
  const title = make('section', { 'data-screen': 'mainMenu' });
  const entry = make('button', { 'data-action': 'swarm' }, 'Swarm'); title.append(entry);
  const hangar = make('section', { 'data-screen': 'crucible', class: 'orr-swarm-hangar', 'data-prep-step': '0' });
  const ships = make('section');
  const run = make('section');
  const kits = make('section');
  const legacy = make('section'); legacy.hidden = true;
  legacy.append(make('button', { class: 'sf-crd-hull', 'data-starter-id': 'ricochet_runner' }, 'Hornet'));
  legacy.append(make('button', { class: 'sf-crd-hull', 'data-starter-id': 'physics_toolkit' }, 'Hornet'));
  legacy.addEventListener('click', () => assert.fail('The actor clicked a hidden legacy control'));
  const hulls = [
    { id: 'ship_hornet', name: 'Hornet', kits: ['ricochet_runner', 'physics_toolkit', 'hull:ship_hornet'] },
    { id: 'ship_wasp', name: 'Wasp', kits: ['wasp_guns', 'locked_kit', 'hull:ship_wasp'] },
    { id: 'ship_locked', name: 'Locked ship', locked: true, kits: [] },
  ];
  function select(row) {
    for (const button of ships.querySelectorAll('[data-swarm-hull]')) {
      button.setAttribute('aria-pressed', String(button.dataset.swarmHull === row.id));
    }
    kits.innerHTML = '';
    for (const [index, id] of row.kits.entries()) {
      const button = make('button', { 'data-swarm-kit': id, 'aria-pressed': String(index === 0), 'aria-disabled': String(id === 'locked_kit') }, id);
      button.addEventListener('click', () => {
        clicks.push(`kit:${id}`);
        for (const other of kits.children) other.setAttribute('aria-pressed', String(other === button));
      });
      kits.append(button);
    }
  }
  for (const row of hulls) {
    const button = make('button', { 'data-swarm-hull': row.id, 'aria-disabled': String(!!row.locked), 'aria-pressed': 'false' });
    button.append(make('strong', {}, row.name));
    button.addEventListener('click', () => { clicks.push(`hull:${row.id}`); select(row); });
    ships.append(button);
  }
  ships.append(kits);
  function show(step) {
    hangar.setAttribute('data-prep-step', String(step));
    ships.hidden = step !== 0; run.hidden = step !== 1;
  }
  for (const index of [0, 1]) {
    const button = make('button', { 'data-swarm-step': String(index) });
    button.addEventListener('click', () => { clicks.push(`step:${index}`); show(index); });
    hangar.append(button);
  }
  run.append(make('section', { class: 'sf-crd-row--arena' }));
  for (const ruleset of ['swarm', 'scored']) {
    const button = make('button', { class: 'sf-crd-mode', 'data-ruleset': ruleset, 'aria-pressed': String(ruleset === 'swarm') });
    button.addEventListener('click', () => {
      clicks.push(`mode:${ruleset}`);
      for (const other of run.querySelectorAll('.sf-crd-mode')) other.setAttribute('aria-pressed', String(other === button));
    });
    run.append(button);
  }
  hangar.append(ships, run, legacy); doc.body.append(title, hangar);
  select(hulls[0]); show(0); hangar.hidden = true;
  entry.addEventListener('click', () => { clicks.push('title:swarm'); title.hidden = true; hangar.hidden = false; });
  const visible = node => {
    for (let parent = node; parent; parent = parent.parentElement) if (parent.hidden) return false;
    return true;
  };
  const locator = selector => {
    const nodes = () => [...doc.querySelectorAll(selector.replaceAll(':visible', ''))]
      .filter(node => !selector.includes(':visible') || visible(node));
    const first = () => {
      const node = nodes()[0];
      assert.ok(node, `No public control matches ${selector}`);
      return node;
    };
    return {
      first() { return this; },
      async click() {
        const node = first();
        assert.ok(visible(node), `The route tried to click hidden ${selector}`);
        assert.notEqual(node.getAttribute('aria-disabled'), 'true');
        node.click();
      },
      async waitFor() { assert.ok(visible(first()), `Hidden awaited control: ${selector}`); },
      async getAttribute(name) { return first().getAttribute(name); },
      async evaluateAll(read) { return read(nodes()); },
    };
  };
  return { page: { locator }, clicks, hangar };
}

test('the route opens on ships and inventories distinct visible hulls, not hidden starter aliases', async () => {
  const { page, clicks, hangar } = fixture();
  await openSwarmHangar(page);
  assert.equal(hangar.dataset.prepStep, '0');
  assert.deepEqual((await listHulls(page)).map(row => [row.id, row.face, row.locked]), [
    ['ship_hornet', 'Hornet', false], ['ship_wasp', 'Wasp', false], ['ship_locked', 'Locked ship', true],
  ]);
  await showHangarRunOptions(page, 'scored');
  assert.equal(hangar.dataset.prepStep, '1');
  assert.deepEqual(await listHulls(page), [], 'hidden ship choices are not reported as visible run settings');
  await showHangarShips(page);
  assert.equal(hangar.dataset.prepStep, '0');
  assert.deepEqual(clicks, ['title:swarm', 'step:1', 'mode:scored', 'step:0']);
});

test('a legacy starter argument selects the visible hull followed by its visible loadout', async () => {
  const { page, clicks } = fixture();
  await openSwarmHangar(page);
  const chosen = await chooseHangarHull(page, 'wasp_guns');
  assert.equal(chosen.id, 'ship_wasp');
  assert.deepEqual(clicks, ['title:swarm', 'hull:ship_hornet', 'hull:ship_wasp', 'kit:wasp_guns']);
});

test('a hull name selects its recommended loadout and an explicit bare ID selects its own equipment option', async () => {
  const { page, clicks } = fixture();
  await openSwarmHangar(page);
  assert.equal((await chooseHangarHull(page, 'Wasp')).id, 'ship_wasp');
  await chooseHangarHull(page, 'hull:ship_hornet');
  assert.deepEqual(clicks, ['title:swarm', 'hull:ship_wasp', 'hull:ship_hornet', 'kit:hull:ship_hornet']);
});

test('locked or absent choices fail instead of launching a substitute', async () => {
  const { page, clicks } = fixture();
  await openSwarmHangar(page);
  await assert.rejects(chooseHangarHull(page, 'ship_locked'), /locked for this profile/);
  assert.deepEqual(clicks, ['title:swarm']);
  await assert.rejects(chooseHangarHull(page, 'locked_kit'), /locked for this profile/);
  assert.equal(clicks.some(click => click === 'kit:locked_kit'), false);
  await assert.rejects(chooseHangarHull(page, 'missing_kit'), /not offered/);
});
