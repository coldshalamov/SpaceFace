// Packet 01 — the live flight Cluster speaks the arsenal presentation: each socket's words, mark and tip
// follow the EFFECTIVE verb (a rig that is a scoop in a planet band, a bomb that drops, a Gyre that is
// holding a ball), collapsed nodes read as well as unfolded keys, a support verb the ship does not carry
// takes no seat, and a press on a socket is passed to flight so reading a tip never costs a shot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountOrreryCluster, readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';
import { passPressToFlight } from '../src/ui/orrery/flightCluster.js';
import { previewOrdnanceState } from '../src/ui/orrery/flightPreview.js';
import { PLANET_REGION_RANK } from '../src/data/planets.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function installDom() {
  const previous = globalThis.document;
  const doc = fakeDom();
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create(tag);
    node.remove = () => {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
      node.parentNode = null;
    };
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  const canvas = doc.createElement('canvas');
  canvas.id = 'gl-canvas';
  canvas.dispatched = [];
  canvas.dispatchEvent = (event) => { canvas.dispatched.push(event); return true; };
  const lookup = doc.getElementById;
  doc.getElementById = (id) => (id === 'gl-canvas' ? canvas : lookup(id));
  globalThis.document = doc;
  return { doc, canvas, restore() { globalThis.document = previous; } };
}

function fixture(extra = {}) {
  const state = previewOrdnanceState();
  Object.assign(state, extra);
  state.entities.get(1).data.defId = 'ship_kestrel';
  return state;
}
// A verb is a collapsed node (data-group = its name) until it is the armed one, then an unfolded key (data-slot = its index).
const SLOT_OF = { Pull: '1', Shove: '2', Pin: '3', Bomb: '4', Rig: '5', Line: '6', Gyre: '7', Cloak: '8' };
const socketOf = (root, name) => findAll(root, (n) => n.getAttribute && (n.getAttribute('data-group') === name || n.getAttribute('data-slot') === SLOT_OF[name]))[0];
const wordsOf = (node) => findAll(node, (n) => n.className === 'orr-cluster__keyword')[0]?.textContent;
const iconOf = (node) => findAll(node, (n) => /\borr-cluster__icon\b/.test(n.className))[0];

function mount(state, t) {
  const root = t.doc.createElement('div');
  const mounted = mountOrreryCluster(root, state, {});
  const player = state.entities.get(state.playerId);
  mounted.update(state, player, true);
  return { root, mounted, player };
}

test('collapsed nodes speak the effective verb: words, authored mark, state and tip all follow the arsenal', () => {
  const t = installDom();
  const state = fixture();
  let view;
  try {
    view = mount(state, t);
    const pull = socketOf(view.root, 'Pull');
    assert.equal(wordsOf(pull), 'Pull · Draws in');
    assert.match(iconOf(pull).innerHTML, /data-arsenal="field_well_standard"/, 'a collapsed node draws the same authored mark as an unfolded key');
    assert.equal(iconOf(pull).getAttribute('data-glyph-source'), 'authored');
    assert.match(pull.className, /\bis-node\b/, 'it is still a node');
    assert.match(pull.className, /\bis-cooldown\b/, 'and it carries the live state, not just the unfolded key');
    assert.match(pull.getAttribute('data-why'), /^Pull · Draws in — Place a gravity well at your aim point/);
    assert.match(wordsOf(socketOf(view.root, 'Shove')), /^Shove · Pushes away \+ 2 blasts$/);
    assert.equal(wordsOf(socketOf(view.root, 'Gyre')), 'Gyre · Release', 'the Gyre is holding a ball in the fixture');
    assert.equal(wordsOf(socketOf(view.root, 'Cloak')), 'Cloak · Ready');
    // the rig follows the planet band — words, mark and tip together, before any press
    assert.equal(wordsOf(socketOf(view.root, 'Rig')), 'Rig · Clear a path');
    state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim } };
    view.mounted.update(state, view.player, true);
    const rig = socketOf(view.root, 'Rig');
    assert.equal(wordsOf(rig), 'Rig · Harvest ore');
    assert.match(iconOf(rig).innerHTML, /data-arsenal="field_skim_standard"/);
    assert.match(rig.getAttribute('data-why'), /^Rig · Harvest ore — You are in a planet band, so Rig opens the skim scoop/);
    // the bomb names its payload and stock; a dry rack keeps the family mark and says so
    assert.equal(wordsOf(socketOf(view.root, 'Bomb')), 'Bomb · throw Charge ×3');
    state.player.cargo.items.cmdty_impulse_charge = 0;
    state.bombs = { selectedId: null, rack: { cells: [null, null] } };
    view.mounted.update(state, view.player, true);
    const bomb = socketOf(view.root, 'Bomb');
    assert.equal(wordsOf(bomb), 'Bomb · none left');
    assert.equal(iconOf(bomb).getAttribute('data-glyph-source'), 'family', 'no authored drawing: the generic mark is marked generic');
  } finally { view?.mounted.dispose(); t.restore(); }
});

test('a support verb the ship does not carry takes no seat, and unbound keys show no phantom key', () => {
  const t = installDom();
  const state = fixture();
  state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s']; // no cloak
  state.settings = { controls: { bindings: { gyreSnare: [] } } };
  let view;
  try {
    view = mount(state, t);
    assert.equal(socketOf(view.root, 'Cloak'), undefined, 'no cloak fitted, no cloak socket');
    const gyre = socketOf(view.root, 'Gyre');
    assert.ok(gyre, 'the Gyre is a baseline verb');
    const key = findAll(gyre, (n) => n.tagName === 'b')[0];
    assert.equal(key && key.textContent, '—', 'an unbound verb shows an empty key, not a default');
    // fitting a cloak brings its socket in without remounting
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_cloak_mk1'];
    view.mounted.update(state, view.player, true);
    assert.ok(socketOf(view.root, 'Cloak'), 'a fitted cloak appears');
  } finally { view?.mounted.dispose(); t.restore(); }
});

test('the readout model names every verb, its effective label, and the owners\' states', () => {
  const state = fixture();
  const model = readOrdnanceModel(state, null, undefined);
  assert.deepEqual(Object.keys(model).sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(model['1'].label, 'Pull · Draws in');
  assert.equal(model['4'].label, 'Bomb · throw Charge ×3');
  assert.equal(model['4'].count, 3);
  assert.equal(model['7'].state, 'armed', 'a held ball is the armed Gyre');
  assert.equal(model['8'].passive, true, 'the cloak is a latch, not the Hand\'s choice');
  assert.equal(model['0'].label, undefined, 'the drive lamp keeps its band name');
  const noCloak = readOrdnanceModel(fixture({ player: { ...fixture().player, ownedShips: [{ fittings: [] }] } }), null, undefined);
  assert.equal(noCloak['8'].hidden, true);
});

test('a press on a socket is passed to the flight canvas, once, unchanged', () => {
  const t = installDom();
  const state = fixture();
  let view;
  try {
    view = mount(state, t);
    const socket = socketOf(view.root, 'Pull');
    // A real press arrives as pointerdown then mousedown: the input owner listens for the mouse press, the
    // world-object gesture (right-button select / mine) for the pointer press. Both reach the canvas.
    let prevented = 0;
    const press = (type, init) => { for (const fn of socket.listeners[type] || []) fn({ type, preventDefault() { prevented += 1; }, ...init }); };
    press('pointerdown', { button: 0, buttons: 1, clientX: 84, clientY: 641, pointerId: 1, pointerType: 'mouse' });
    press('mousedown', { button: 0, buttons: 1, clientX: 84, clientY: 641 });
    assert.deepEqual(t.canvas.dispatched.map((ev) => ev.type), ['pointerdown', 'mousedown'], 'the press reaches the canvas the owners listen on');
    for (const forwarded of t.canvas.dispatched) {
      assert.equal(forwarded.button, 0);
      assert.equal(forwarded.clientX, 84);
      assert.equal(forwarded.clientY, 641);
      assert.equal(forwarded.bubbles, false, 'a forwarded press does not bubble a second time');
    }
    assert.equal(t.canvas.dispatched[0].pointerId, 1);
    assert.equal(prevented, 1, 'only the mouse press is prevented: that is what stops the socket taking keyboard focus from flight');
    assert.equal(passPressToFlight(t.canvas.dispatched[1], t.doc), false, 'a forwarded press is never forwarded again');
    // the right button (mining) passes too; and the socket swallows the browser menu
    press('mousedown', { button: 2, buttons: 2, clientX: 10, clientY: 11 });
    assert.equal(t.canvas.dispatched.length, 3);
    assert.equal(t.canvas.dispatched[2].button, 2);
    let menu = false;
    for (const fn of socket.listeners.contextmenu || []) fn({ preventDefault() { menu = true; } });
    assert.equal(menu, true);
    // labels and counts never take the cursor
    const css = findAll(t.doc.head, (n) => n.id === 'sf-orrery-cluster-style')[0]?.textContent || '';
    assert.match(css, /\.orr-cluster__keytag, \.orr-cluster__count \{ pointer-events:none; \}/);
  } finally { view?.mounted.dispose(); t.restore(); }
});
