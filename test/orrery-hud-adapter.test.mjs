// ORRERY Phase 1: the live flight HUD feeds the Cluster through one pure adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOrdnanceGroups, createCooldownTracker, readOrdnanceModel, readClusterModel, mountOrreryCluster,
  shipUnderInstrumentBox,
} from '../src/ui/orrery/hudAdapter.js';
import { speedPhase } from '../src/ui/orrery/flightCluster.js';
import { staticVerbSentence } from '../src/data/arsenalWords.js';
import { RAIL_SLOTS, SUPPORT_SLOTS } from '../src/ui/powerRail.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { resolveImpulseChargeCapacity } from '../src/systems/impulseCharges.js';
import { DEFAULTS } from '../src/systems/input.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

function fakeState(extra = {}) {
  const entities = new Map();
  const player = {
    id: 7, alive: true, type: 'ship',
    hull: 60, hullMax: 120, shield: 30, shieldMax: 60, armorHp: 12, armorMax: 40,
    cap: 45, capMax: 90, maxSpeed: 150, rot: 0, vel: { x: 0, z: 100 },
    boost: { energy: 25, max: 100 },
    data: { weapons: [], impulseCharges: { throwCdT: 0 } },
  };
  entities.set(7, player);
  return {
    state: { playerId: 7, entities, entityList: [...entities.values()], simTime: 10, player: { cargo: { items: {} } }, fields: {}, ...extra },
    player,
  };
}

test('every rail slot lands in exactly one group, keyed by its rail index', () => {
  const groups = buildOrdnanceGroups(null);
  const ids = groups.flatMap((g) => g.slots.map((s) => s.id));
  assert.deepEqual(ids.sort(), [...RAIL_SLOTS, ...SUPPORT_SLOTS].map((s) => String(s.index)).sort(),
    'the rank plus the Gyre and the cloak (support verbs beside the rank)');
  for (const g of groups) {
    assert.ok(g.name && g.icon, 'each group carries a name and an icon');
    for (const s of g.slots) assert.ok(s.name && s.icon && s.key, `slot ${s.id} carries a name, icon and key`);
  }
});

test('the cluster model reads the same sources as the old instruments', () => {
  const { state, player } = fakeState();
  const m = readClusterModel(state, player, { ordnance: {} });
  assert.equal(m.hull, 60);
  assert.equal(m.hullMax, 120);
  assert.equal(m.shield, 30);
  assert.equal(m.armor, 12);
  assert.equal(m.energy, 45, 'energy is the capacitor, as the live HUD reads it');
  assert.equal(m.energyMax, 90);
  assert.equal(m.speed, 100);
  assert.equal(m.speedRef, 150);
  assert.equal(m.boost, 0.25);
  assert.equal(m.tether, null, 'no line, no tether instrument');
  // velocity along +z with the nose at rot 0 (+x): the ship is sliding 90° off its nose
  assert.equal(Math.round(m.drift), 90);
});

test('no drift is reported at a crawl, and missing numbers never become NaN', () => {
  const { state, player } = fakeState();
  player.vel = { x: 3, z: 2 };
  player.shieldMax = undefined;
  const m = readClusterModel(state, player, { ordnance: {} });
  assert.equal(m.drift, 0);
  for (const [k, v] of Object.entries(m)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} is finite`);
});

test('the rail states map onto the Cluster vocabulary', () => {
  const { state } = fakeState();
  state.player.tether = { active: true };
  state.fields.cooldowns = { well: 12 };
  state.player.cargo.items.cmdty_impulse_charge = 3;
  const ord = readOrdnanceModel(state, createCooldownTracker());
  // The five powers (owner 2026-10-22): 1 PULL · 2 SHOVE · 3 PIN · 4 BOMB · 5 RIG, the Line at 6.
  assert.equal(ord['6'].state, 'armed', 'an active line is the armed slot');
  assert.equal(ord['1'].state, 'cooldown', 'PULL (the well) on cooldown reads as cooling');
  assert.equal(typeof ord['1'].cooldown, 'number');
  assert.equal(ord['4'].count, 3, 'with a dry rack BOMB throws the charge, and the count rides along');
  assert.equal(ord['4'].arsenalId, 'power_charge', 'the bomb key shows the charge it will throw');
});

test('the cooldown tracker turns time-left into a rising fraction', () => {
  const frac = createCooldownTracker();
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 4000 }), 0);
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 1000 }), 0.75);
  assert.equal(frac(5, { state: 'ready' }), null);
  assert.equal(frac(5, { state: 'cooling', cooldownMs: 2000 }), 0, 'a fresh cooldown restarts the sweep');
});

test('the speed Scale phases against the displayed reading: asleep, flight, above reference', () => {
  assert.equal(speedPhase(0, 180), 'rest');
  assert.equal(speedPhase(0.4, 180), 'rest', 'below a crawl the numeral reads 0 and the instrument sleeps');
  assert.equal(speedPhase(0.5, 180), 'flight');
  assert.equal(speedPhase(90, 180), 'flight');
  assert.equal(speedPhase(180.4, 180), 'flight', 'the displayed numeral (180) is not above reference');
  assert.equal(speedPhase(180.6, 180), 'over', 'the displayed numeral (181) is above reference — ice');
  assert.equal(speedPhase(672, 400), 'over', 'travel and tether legitimately exceed the reference');
  assert.equal(speedPhase(-12, 400), 'rest');
  assert.equal(speedPhase(90, undefined), 'flight', 'a missing reference reads the 180 default');
  assert.equal(speedPhase(NaN, 180), 'rest', 'no reading, no light');
});

test('every ordnance key explains itself: one plain name, one-line caption, live keys and state', () => {
  const bindings = {
    pull: ['Digit1'], shove: ['KeyR', 'Digit2'], bomb: ['KeyY', 'Digit4'], tether: ['Space', 'KeyF'],
  };
  const { state } = fakeState();
  state.player.cargo.items.cmdty_impulse_charge = 2;
  const ord = readOrdnanceModel(state, createCooldownTracker(), bindings);
  // One canonical name and one-line caption per flight power — no jargon leaks.
  assert.equal(ord['4'].label, 'Bomb');
  assert.equal(ord['4'].count, 2);
  assert.equal(ord['4'].tip, 'Bomb — Sticks a charge. Press again to detonate (4 · Y)');
  assert.equal(ord['4'].briefTip, 'Bomb · 4\nSticks a charge. Press again to detonate');
  assert.equal(ord['6'].key, 'RMB / Space');
  assert.equal(ord['6'].tip, 'Line — Hook anything: swing on heavy things, throw light ones (RMB / Space)');
  assert.equal(ord['2'].tip, 'Shove — Blasts everything ahead of you away (2 · R)');
  const groups = buildOrdnanceGroups(bindings);
  const shove = groups.find((g) => g.name === 'Shove');
  assert.equal(shove.tip, 'Shove — Blasts everything ahead of you away (2)');
  assert.equal(groups.find((g) => g.name === 'Pull').slots[0].key, '1', 'the shelf reads as the number-row hotbar the player reaches for');
  assert.deepEqual(groups.map((g) => g.name), ['DRIVE', 'Pull', 'Shove', 'Pin', 'Bomb', 'Plow', 'Line', 'Gyre', 'Cloak']);
  const drive = groups.find((g) => g.name === 'DRIVE');
  assert.ok(drive && drive.slots.length === 1, 'the travel-drive lamp is its own group');
});

test('the mounted Cluster follows live rebinds, prompt key ownership, and an intentionally unbound Line', () => {
  const previous = globalThis.document;
  const doc = fakeDom();
  const create = doc.createElement;
  doc.createElement = tag => {
    const node = create(tag);
    node.remove = () => {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      node.parentNode = null;
    };
    return node;
  };
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  globalThis.document = doc;
  const { state, player } = fakeState({ settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {
    tether: ['KeyP'], forward: ['KeyI'], reverse: ['KeyK'], yawLeft: ['KeyJ'], yawRight: ['KeyL'], boost: ['KeyB'],
    pull: ['Digit3'], shove: ['Digit2', 'KeyR'],
  } } } });
  state.player.tether = { active: true, targetId: 8, load: 0.2 };
  state.entities.set(8, { mass: 40 });
  const root = doc.createElement('div');
  let mounted;
  const socket = (id = '6') => findAll(root, node => node.getAttribute('data-slot') === id)[0];
  const key = (id) => findAll(socket(id), node => node.tagName === 'b')[0]?.textContent;
  try {
    // hud.js still passes the legacy default table; the live state is authoritative.
    mounted = mountOrreryCluster(root, state, { bindings: DEFAULTS.BINDINGS });
    mounted.update(state, player, true);
    assert.equal(key(), 'RMB / P');
    assert.match(socket().getAttribute('data-why'), /I REEL.*K PAY OUT.*J\/L ORBIT.*B PUMP/);
    assert.match(socket().getAttribute('aria-label'), /I REEL/);
    assert.equal(socket().getAttribute('tabindex'), '0', 'the contextual controls remain focusable');
    state.settings.controls.bindings.tether = ['KeyU'];
    state.settings.controls.bindings.forward = ['KeyO'];
    mounted.update(state, player, true);
    assert.equal(key(), 'RMB / U', 'a rebind after mount updates the visible key as well as its tip');
    assert.match(socket().getAttribute('data-why'), /O REEL/);
    assert.doesNotMatch(socket().getAttribute('data-why'), /I REEL|\(Space · F\)/);
    const settled = socket();
    mounted.update(state, player, false);
    assert.equal(socket(), settled, 'an unchanged frame does not rebuild the sockets');
    assert.equal(key('1'), '3');
    assert.equal(key('2'), '2');
    setPromptDeck({ claimedDigits: [2, 3] });
    mounted.update(state, player, false);
    // R17 (2026-11-20): "Nothing may steal keys 1–5 in flight." Decisions answer on 6–9 and 0, so a
    // live decision never takes a power's key away from its socket.
    assert.equal(key('1'), '3', 'R17: a decision never borrows a power key');
    assert.equal(key('2'), '2', 'R17: a decision never borrows a power key');
    assert.equal(key(), 'RMB / U', 'Line does not change while a decision is up');
    setPromptDeck(null);
    mounted.update(state, player, false);
    assert.equal(key('1'), '3');
    assert.equal(key('2'), '2');
    state.settings.controls.bindings.tether = [];
    mounted.update(state, player, true);
    assert.equal(key(), 'RMB', 'clearing the keyboard binding leaves the mouse binding');
    assert.match(socket().getAttribute('data-why'), /Hold RMB for line control: .*REEL/,
      'the mouse Line still names the axes it really has');
    state.settings.controls.bindings.tether = ['KeyU'];
    state.player.tether.active = false;
    mounted.update(state, player, true);
    assert.doesNotMatch(socket().getAttribute('data-why'), /REEL|PAY OUT|ORBIT|PUMP/,
      'the active-line context disappears when the line is cut');
  } finally { setPromptDeck(null); mounted?.dispose(); globalThis.document = previous; }
});

test('the Cluster writes each tip to a hoverable, focusable socket (the tier-2 seat)', () => {
  const src = readFileSync(new URL('../src/ui/orrery/flightCluster.js', import.meta.url), 'utf8');
  assert.match(src, /k\.setAttribute\('tabindex', '0'\)/, 'a verb key answers keyboard focus');
  assert.match(src, /k\.setAttribute\(node \? 'data-group' : 'data-slot', id\)/, 'a socket names its verb');
  assert.match(src, /if \(tip\) k\.setAttribute\('data-why', tip\)/, 'the bank phrase rides the socket');
  assert.match(src, /if \(tip\) sk\.el\.setAttribute\('data-why', tip\)/, 'the live state line moves with the model');
  assert.match(src, /pointer-events:auto/, 'a verb key answers the cursor so the reveal can fire');
});

test('hud.js mounts the Cluster once and feeds it once per frame', () => {
  const src = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.equal((src.match(/mountOrreryCluster\(/g) || []).length, 1);
  assert.equal((src.match(/orreryCluster\.update\(/g) || []).length, 1);
  // with ORRERY on, the old left column is not an obstacle and the edge arrow avoids the instrument
  assert.match(src, /objectiveEdgeBoxes\.orrery = orreryCluster/);
});

test('D240: the under-ship dim zone is the measured cluster box plus the sprite pad', () => {
  const box = { left: 8, top: 372, right: 464, bottom: 696, width: 456, height: 324 };
  const pad = 26;
  assert.equal(shipUnderInstrumentBox({ x: 300, y: 500, onScreen: true }, box, pad), true, 'over the instrument');
  assert.equal(shipUnderInstrumentBox({ x: 490, y: 500, onScreen: true }, box, pad), true, 'just inside the pad');
  assert.equal(shipUnderInstrumentBox({ x: 500, y: 500, onScreen: true }, box, pad), false, 'past the pad stays lit');
  assert.equal(shipUnderInstrumentBox({ x: 300, y: 200, onScreen: true }, box, pad), false, 'above it stays lit');
  assert.equal(shipUnderInstrumentBox({ x: 300, y: 500, onScreen: false }, box, pad), false, 'off-screen projects never dim');
  assert.equal(shipUnderInstrumentBox(null, box, pad), false);
  assert.equal(shipUnderInstrumentBox({ x: 300, y: 500, onScreen: true }, null, pad), false, 'unmeasured box dims nothing');
});

test('D240: ship-under wiring — helpers feed the probe, the class lands on the Cluster, the CSS ghosts text', () => {
  const adapterSrc = readFileSync(new URL('../src/ui/orrery/hudAdapter.js', import.meta.url), 'utf8');
  const clusterSrc = readFileSync(new URL('../src/ui/orrery/flightCluster.js', import.meta.url), 'utf8');
  const hudSrc = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(adapterSrc, /shipUnderInstrumentBox\(w2s\(_shipWorld, _shipScreen\), clusterBox, SHIP_UNDER_PAD\)/,
    'the probe reuses the authoritative worldToScreen, never a parallel projection');
  assert.match(adapterSrc, /classList\.toggle\('is-ship-under', under\)/, 'the marker lands on the Cluster');
  assert.match(adapterSrc, /resize', markClusterBoxStale\)/, 'the box re-measures only when the layout step can move it');
  assert.match(clusterSrc, /\.orr-cluster\.is-ship-under .orr-cluster__keytag/, 'the floating key labels ghost back');
  assert.match(hudSrc, /mountOrreryCluster\(root, state, \{ [^}]*helpers \}\)/, 'hud.js hands the adapter its helpers');
});

test('D240: the live context strip is a measured obstacle again, for arrows and tells', () => {
  const src = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(src, /objectiveEdgeBoxes\.left = plateBox\(leftContext\)/,
    'the mission strip is an edge-arrow obstacle (the retired leftStack was not)');
  assert.match(src, /ResizeObserver\(invalidateAndPlaceHudOverlays\)[^}]*observe\(leftContext\)/s,
    'content-driven strip growth refreshes the box, not only window resizes');
  assert.match(src, /function invalidateAndPlaceHudOverlays\(\)\s*\{\s*invalidateObjectiveEdgeBoxes\(\)/s,
    'the observed invalidator still marks the edge boxes stale');
  assert.match(src, /const measuredLeft = objectiveEdgeObstacles\(\)\.left;[\s\S]{0,400}?reserved\.push\(measuredLeft\)/,
    'doctrine tells yield to the same measured strip');
  // ...and the tells resolve their seat from that reserved pool (74e6020171 replaced the per-frame
  // obstacle array with a reused blocker pool, so the call takes `reserved`, not a spread literal).
  assert.match(src, /resolveDoctrineTellPlacement\(w, h, proj, slotIndex, reserved,/,
    'the tell seat is solved against the reserved strip and touch controls');
});

test('a settled Cluster frame writes nothing: springs at rest ignore a repeat target', async () => {
  const { createSpring } = await import('../src/ui/orrery/motion.js');
  let paints = 0;
  const saved = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    const sp = createSpring({ value: 0, onUpdate: () => { paints += 1; } });
    sp.set(0);
    sp.set(0);
    assert.equal(paints, 0);
    sp.set(0.5, { instant: true });
    assert.equal(paints, 1);
    sp.set(0.5);
    assert.equal(paints, 1);
  } finally {
    globalThis.requestAnimationFrame = saved;
  }
});
