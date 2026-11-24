// Packet 01 — the live flight Cluster speaks the arsenal presentation: each socket's words, mark and tip
// follow the EFFECTIVE verb (an armed charge that is the next detonate, a Gather that is holding a ball),
// collapsed nodes read as well as unfolded keys, support verbs the bar does not seat take no seat, and a
// press on a socket is passed to flight so reading a tip never costs a shot.
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
const SLOT_OF = { Pull: '1', Shove: '2', Pin: '3', Bomb: '4', Plow: '5', Line: '6', Gather: '7', Cloak: '8' };
const socketOf = (root, name) => findAll(root, (n) => n.getAttribute && (n.getAttribute('data-group') === name || n.getAttribute('data-slot') === SLOT_OF[name]))[0];
const wordsOf = (node) => findAll(node, (n) => n.className === 'orr-cluster__keyword')[0]?.textContent;
const shortWordsOf = (node) => findAll(node, (n) => n.className === 'orr-cluster__keyshort')[0]?.textContent;
const iconOf = (node) => findAll(node, (n) => /\borr-cluster__icon\b/.test(n.className))[0];

function mount(state, t) {
  const root = t.doc.createElement('div');
  const mounted = mountOrreryCluster(root, state, {});
  const player = state.entities.get(state.playerId);
  mounted.update(state, player, true);
  return { root, mounted, player };
}

test('visor sockets show a short action name with the authored mark and the full tip', () => {
  const t = installDom();
  const state = fixture();
  let view;
  try {
    view = mount(state, t);
    const pull = socketOf(view.root, 'Pull');
    assert.equal(wordsOf(pull), 'Pull');
    assert.match(iconOf(pull).innerHTML, /data-arsenal="field_well_standard"/);
    assert.equal(iconOf(pull).getAttribute('data-glyph-source'), 'authored');
    assert.equal(pull.getAttribute('data-slot'), '1');
    assert.match(pull.className, /\bis-cooldown\b/, 'the socket carries the live state');
    // c7aef99cfe tip contract: "Name — short action (key)", with the live state reason on its own line.
    assert.match(pull.getAttribute('data-why'), /^Pull — Drags everything near the cursor together \(1\)/);
    assert.match(pull.getAttribute('data-why'), /Recharging — 1s/, 'the cooldown reason rides the same tip');
    assert.match(socketOf(view.root, 'Shove').getAttribute('data-why'), /^Shove — Blasts everything ahead of you away \(2\)/);
    // 2e6c4a3626/R17: armed ordnance answers slot 4's own Detonate tile, not a "+N blasts" on Shove.
    assert.match(socketOf(view.root, 'Bomb').getAttribute('data-why'), /^Detonate — Sticks a charge\. Press again to detonate \(4\)/,
      'the fixture\'s armed charge reads as the press-again Detonate tile');
    assert.equal(wordsOf(socketOf(view.root, 'Shove')), 'Shove', 'no narrow word either');
    assert.match(socketOf(view.root, 'Line').getAttribute('data-why'), /^Line — Hook anything/);
    // S5: the flight bar is six sockets — the five powers and the Line. Gather and Cloak are
    // support verbs on the context wheel and take no seat here at all.
    assert.equal(socketOf(view.root, 'Gather'), undefined, 'the Gather has no flight-bar socket');
    assert.equal(socketOf(view.root, 'Cloak'), undefined, 'the Cloak has no flight-bar socket');
    // the Plow keeps its own mark and tip through a planet band — the scoop no longer repaints the key
    assert.match(socketOf(view.root, 'Plow').getAttribute('data-why'), /^Plow — Gathers rocks at your bow\. Press again to launch \(5\)/);
    assert.equal(wordsOf(socketOf(view.root, 'Plow')), 'Plow');
    state.planet = { active: true, player: { regionRank: PLANET_REGION_RANK.skim } };
    view.mounted.update(state, view.player, true);
    const rig = socketOf(view.root, 'Plow');
    assert.equal(wordsOf(rig), 'Plow', 'R17: a planet band does not repaint the key as a scoop');
    assert.equal(rig.getAttribute('aria-pressed'), 'false');
    assert.match(iconOf(rig).innerHTML, /data-arsenal="field_cone_standard"/);
    // an empty rack unmounts the ordnance socket rather than promising a payload that is not there
    state.player.cargo.items.cmdty_impulse_charge = 0;
    state.bombs = { selectedId: null, rack: { cells: [null, null] } };
    view.mounted.update(state, view.player, true);
    assert.equal(socketOf(view.root, 'Bomb'), undefined, 'nothing aboard and an empty rack: no ordnance socket');
  } finally { view?.mounted.dispose(); t.restore(); }
});

test('Rig status survives key release and uses the current binding in its keycap', () => {
  const t = installDom();
  const state = fixture();
  state.settings = { controls: { bindings: { rig: ['KeyJ'] } } };
  state.fields.coneActive = true;
  state.input = { actions: { rig: { pressed: false, held: false } } };
  let view;
  try {
    view = mount(state, t);
    let rig = socketOf(view.root, 'Plow');
    assert.equal(wordsOf(rig), 'Plow');
    assert.equal(shortWordsOf(rig), 'Plow');
    assert.equal(findAll(rig, n => n.tagName === 'b')[0]?.textContent, 'J');
    assert.equal(rig.getAttribute('aria-pressed'), 'true', 'a running Plow reads pressed');
    assert.match(rig.getAttribute('data-why'), /^Plow — Gathers rocks at your bow\. Press again to launch \(J\)/);
    assert.match(rig.className, /\bis-running\b/, 'the running field carries its live class');
    assert.doesNotMatch(rig.className, /is-held|is-firing/);
    // The attempted second press is not itself an ON signal; the owner has switched it off.
    state.fields.coneActive = false;
    state.input.actions.rig = { pressed: true, held: true };
    view.mounted.update(state, view.player, true);
    rig = socketOf(view.root, 'Plow');
    assert.equal(wordsOf(rig), 'Plow');
    assert.equal(rig.getAttribute('aria-pressed'), 'false');
    assert.doesNotMatch(rig.className, /is-active|is-running|is-held|is-firing/);
  } finally { view?.mounted.dispose(); t.restore(); }
});

test('a support verb the ship does not carry takes no seat, and unbound keys show no phantom key', () => {
  const t = installDom();
  const state = fixture();
  state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s']; // no cloak
  state.settings = { controls: { bindings: { pull: [] } } };
  let view;
  try {
    view = mount(state, t);
    assert.equal(socketOf(view.root, 'Cloak'), undefined, 'no cloak fitted, no cloak socket');
    const pull = socketOf(view.root, 'Pull');
    assert.ok(pull, 'the Pull socket still mounts');
    const key = findAll(pull, (n) => n.tagName === 'b')[0];
    assert.ok(!key || key.textContent === '', 'an unbound verb shows no keycap');
    // fitting a cloak still leaves the bar at six sockets — the support verbs live on the wheel
    state.player.ownedShips[0].fittings = ['wpn_pulse_laser_s', 'mod_cloak_mk1'];
    view.mounted.update(state, view.player, true);
    assert.equal(socketOf(view.root, 'Cloak'), undefined, 'a fitted cloak stays off the six-tile bar');
  } finally { view?.mounted.dispose(); t.restore(); }
});

test('the readout model names every verb, its effective label, and the owners\' states', () => {
  const state = fixture();
  const model = readOrdnanceModel(state, null, undefined);
  assert.deepEqual(Object.keys(model).sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(model['1'].label, 'Pull');
  assert.equal(model['4'].label, 'Detonate', 'an armed charge answers as the next press: Detonate');
  assert.equal(model['4'].count, 3);
  assert.equal(model['7'].state, 'armed', 'a held ball is the armed Gather');
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
