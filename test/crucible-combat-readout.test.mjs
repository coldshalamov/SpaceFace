import assert from 'node:assert/strict';
import test from 'node:test';
import { crucibleCombatLines, crucibleFittingDescription, mountCrucibleCombatReadout } from '../src/ui/crucibleCombatReadout.js';
import { crucibleFocus, CRUCIBLE_FOCUS_CLASS } from '../src/ui/crucibleFocus.js';
import { crucibleDraftScreen, offerCardLines } from '../src/ui/screens/crucibleDraft.js';
import { resolveActionLabel } from '../src/systems/input.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';

function fixture() {
  const ship = { id: 1, alive: true, cap: 100, data: {
    weapons: [{ defId: 'wpn_snarl_s', _cooldown: 0, _heat: 0 }],
    impulseCharges: { throwCdT: 0 },
  } };
  return {
    simTime: 10, playerId: 1, entities: new Map([[1, ship]]), entityList: [ship],
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    ui: { screenStack: [] }, camera: { zoom: 144 },
    settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: ['mod_bank_shot', 'wpn_snarl_s', 'mod_repulsion_trap_s'] }],
      cargo: { items: { cmdty_impulse_charge: 3 } } },
  };
}
const line = (state, id) => crucibleCombatLines(state).find(row => row.id === id);

test('Pilot, Classic and Helm use the live charge action, including remaps and unbinding', () => {
  const state = fixture();
  for (const [scheme, expected] of [['pilot', 'Y'], ['classic', 'Y'], ['helm-assist', 'Q']]) {
    state.settings.gameplay.controlScheme = scheme;
    assert.equal(resolveActionLabel(state, 'chargeThrow'), expected);
    assert.equal(line(state, 'trap').text, `Trap — ${expected} · 3 remaining · armed`);
    assert.equal(crucibleFittingDescription('mod_repulsion_trap_s', state), `Trap — ${expected} drop behind you`);
  }
  state.settings.controls.bindings.chargeThrow = ['KeyK', 'ArrowUp'];
  assert.match(line(state, 'trap').text, /^Trap — K\/Up ·/);
  state.settings.controls.bindings.chargeThrow = [];
  assert.match(line(state, 'trap').text, /^Trap — unbound ·/);
});

test('fitting guidance explains primary fire and never invents a separate web key', () => {
  const state = fixture();
  assert.equal(crucibleFittingDescription('mod_bank_shot', state), 'Banking — primary fire (LMB)');
  assert.equal(crucibleFittingDescription('wpn_snarl_s', state), 'Snarl — fires with guns (LMB)');
  state.settings.controls.bindings.fire = ['KeyP'];
  assert.equal(crucibleFittingDescription('wpn_snarl_s', state), 'Snarl — fires with guns (P)');
  assert.match(line(state, 'mod_bank_shot').text, /primary fire \(P\)/);
  assert.equal(crucibleFittingDescription('mod_shield_booster_s', state), 'Always active while fitted');
  assert.equal(crucibleFittingDescription('missing', state), '');
  for (const offer of SWARM_DRAFT_OFFERS) {
    assert.ok(offerCardLines(offer, state).activation, `${offer.defId} has visible activation guidance`);
  }
});

test('only the flown hull contributes toys; inventory, parked hulls and duplicate fittings do not', () => {
  const state = fixture();
  const before = structuredClone(state);
  assert.equal(crucibleCombatLines(state).length, 3);
  assert.deepEqual(state, before, 'readout never creates combat runtime or changes the fitting');
  state.player.ownedShips[0].fittings.push('mod_bank_shot', 'wpn_snarl_s');
  assert.equal(crucibleCombatLines(state).length, 3);
  state.player.ownedShips.push({ fittings: [] });
  state.player.activeShipIndex = 1;
  state.player.inventory = ['mod_repulsion_trap_s'];
  assert.deepEqual(crucibleCombatLines(state), []);
});

test('gun readiness follows cooldown, heat vent and capacitor, then returns to armed', () => {
  const state = fixture();
  const ship = state.entities.get(1);
  const gun = ship.data.weapons[0];
  assert.equal(line(state, 'wpn_snarl_s').status, 'armed');
  gun._cooldown = 0.8;
  assert.equal(line(state, 'wpn_snarl_s').status, 'cooldown');
  gun._cooldown = 0;
  gun._heat = 100;
  assert.equal(line(state, 'wpn_snarl_s').status, 'cooldown');
  gun._heat = 0;
  ship.data.weaponVentUntil = 11;
  assert.match(line(state, 'wpn_snarl_s').text, /cooling$/);
  state.simTime = 11;
  ship.cap = 0;
  assert.equal(line(state, 'wpn_snarl_s').status, 'cooldown');
  ship.cap = 100;
  assert.equal(line(state, 'wpn_snarl_s').status, 'armed');
  ship.data.weapons = [];
  assert.match(line(state, 'mod_bank_shot').text, /needs a projectile weapon$/);
  state.player.ownedShips[0].fittings = ['mod_bank_shot', 'wpn_beam_laser_m'];
  ship.data.weapons = [{ defId: 'wpn_beam_laser_m', _heat: 0, _cooldown: 0 }];
  assert.match(line(state, 'mod_bank_shot').text, /needs a projectile weapon$/);
});

test('Trap keeps empty/cooldown and deployed/arming facts distinct, ignoring foreign or dead charges', () => {
  const state = fixture();
  const ship = state.entities.get(1);
  const trap = { id: 3, type: 'charge', alive: true,
    data: { ownerId: 1, chargeId: 'charge_repulsion_trap', armed: false } };
  state.entityList.push(trap,
    { ...trap, data: { ...trap.data, ownerId: 2 } },
    { ...trap, alive: false },
    { ...trap, data: { ...trap.data, chargeId: 'charge_standard' } });
  state.player.cargo.items.cmdty_impulse_charge = 2;
  ship.data.impulseCharges.throwCdT = 0.5;
  assert.equal(line(state, 'trap').text, 'Trap — Y · 2 remaining · cooldown · 1 arming');
  trap.data.armed = true;
  ship.data.impulseCharges.throwCdT = 0;
  assert.equal(line(state, 'trap').text, 'Trap — Y · 2 remaining · armed · 1 deployed');
  state.player.cargo.items.cmdty_impulse_charge = 0;
  assert.equal(line(state, 'trap').text, 'Trap — Y · 0 remaining · empty · 1 deployed');
  trap.alive = false;
  assert.equal(line(state, 'trap').text, 'Trap — Y · 0 remaining · empty');
});

// Minimal DOM with mutation accounting: these tests prove lifecycle and writes, not browser layout.
function installDocument(t) {
  const prior = globalThis.document;
  const doc = { writes: 0, activeElement: null };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
      this.attributes = {}; this.listeners = {}; this._text = ''; this._hidden = false;
      this.dataset = new Proxy({}, { set: (target, key, value) => { doc.writes++; target[key] = value; return true; } });
      const classes = new Set();
      this.classList = {
        toggle(name, on) { doc.writes++; if (on) classes.add(name); else classes.delete(name); },
        remove(name) { doc.writes++; classes.delete(name); }, contains: name => classes.has(name),
      };
    }
    set textContent(value) { doc.writes++; this._text = value; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set hidden(value) { doc.writes++; this._hidden = value; }
    get hidden() { return this._hidden; }
    appendChild(child) { doc.writes++; child.parentNode = this; this.children.push(child); return child; }
    remove() { if (this.parentNode) { doc.writes++; this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
    setAttribute(name, value) { doc.writes++; this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    focus() { doc.activeElement = this; }
    click() { if (!this.disabled) this.listeners.click?.(); }
  }
  doc.createElement = tag => new Element(tag);
  doc.body = doc.createElement('body'); doc.head = doc.createElement('head');
  doc.getElementById = id => doc.head.children.find(child => child.id === id) || null;
  globalThis.document = doc;
  t.after(() => { if (prior === undefined) delete globalThis.document; else globalThis.document = prior; });
  return doc;
}

test('unchanged readouts perform zero DOM writes, even as cooldown fractions change', t => {
  const doc = installDocument(t);
  const state = fixture();
  const readout = mountCrucibleCombatReadout(doc.body);
  state.entities.get(1).data.impulseCharges.throwCdT = 0.6;
  assert.equal(readout.update(state), true);
  const count = doc.writes;
  state.entities.get(1).data.impulseCharges.throwCdT = 0.5;
  state.simTime += 1 / 60;
  assert.equal(readout.update(state), false);
  assert.equal(doc.writes, count);
  assert.equal(readout.root.getAttribute('aria-live'), 'off');
  assert.equal(readout.root.getAttribute('role'), null, 'no implicit live status announcements');
  state.entities.get(1).data.impulseCharges.throwCdT = 0;
  assert.equal(readout.update(state), true);
  assert.match(readout.root.textContent, /3 remaining · armed/);
  state.player.ownedShips[0].fittings = [];
  readout.update(state);
  assert.equal(readout.root.hidden, true);
  assert.equal(readout.root.children.length, 0);
  readout.release(); readout.release();
  assert.equal(doc.body.children.length, 0);
});

test('focus updates readiness before its unchanged-state return and releases on exit, reset and reinit', t => {
  const doc = installDocument(t);
  const state = fixture();
  const focus = Object.create(crucibleFocus);
  const zooms = [];
  const ctx = { state, bus: { emit: (event, payload) => zooms.push([event, payload]) } };
  focus.init(ctx);
  focus.update(1 / 60, state);
  const root = focus._combatReadout.root;
  assert.equal(doc.body.classList.contains(CRUCIBLE_FOCUS_CLASS), true);
  assert.equal(doc.body.children.length, 1);
  const count = doc.writes;
  focus.update(1 / 60, state);
  assert.equal(doc.writes, count);
  state.player.cargo.items.cmdty_impulse_charge = 0;
  focus.update(1 / 60, state);
  assert.equal(focus._combatReadout.root, root);
  assert.match(root.textContent, /0 remaining · empty/);
  assert.equal(zooms.length, 1, 'readiness does not reapply the camera');
  state.run.phase = 'draft'; focus.update(1 / 60, state);
  assert.equal(root.hidden, true);
  state.run.phase = 'active'; focus.update(1 / 60, state);
  assert.equal(root.hidden, false);
  focus.init(ctx);
  assert.equal(doc.body.children.length, 0);
  focus.update(1 / 60, state); focus.newGame();
  assert.equal(doc.body.children.length, 0);
  focus.update(1 / 60, state);
  state.run.phase = 'ended'; focus.update(1 / 60, state);
  assert.equal(doc.body.children.length, 0);
  assert.equal(doc.body.classList.contains(CRUCIBLE_FOCUS_CLASS), false);
  state.run.kind = 'adventure'; state.run.phase = 'active'; focus.update(1 / 60, state);
  assert.equal(doc.body.children.length, 0);
  focus.destroy(); focus.destroy();
});

test('modal, lab, Adventure and dead-player states do not show flight guidance', () => {
  const state = fixture();
  state.ui.screenStack.push('settings');
  assert.deepEqual(crucibleCombatLines(state), []);
  state.ui.screenStack = [];
  for (const kind of ['lab', 'adventure']) {
    state.run.kind = kind; assert.deepEqual(crucibleCombatLines(state), []);
  }
  state.run.kind = 'survival'; state.entities.get(1).alive = false;
  assert.deepEqual(crucibleCombatLines(state), []);
  assert.deepEqual(crucibleCombatLines(null), []);
});

test('armory guidance is visible and in the accessible name without adding controls or changing purchase intents', t => {
  const doc = installDocument(t);
  const state = fixture(); state.run.phase = 'draft';
  state.settings.controls.bindings.chargeThrow = ['KeyK'];
  const emitted = [];
  const ctx = { state, bus: { emit: (...args) => emitted.push(args) } };
  const screen = Object.create(crucibleDraftScreen);
  let refreshes = 0; screen.refresh = () => { refreshes++; };
  const offer = { id: 'trap-offer', defId: 'mod_repulsion_trap_s', name: 'Repulsion Trap',
    verb: 'Trap', blurb: 'Drop behind you.', price: 28, available: true, slotIndex: 3 };
  const card = screen._buildCard(ctx, offer, 1);
  assert.equal(card.tagName, 'BUTTON'); assert.equal(card.type, 'button');
  assert.match(card.textContent, /Trap — K drop behind you/);
  assert.match(card.getAttribute('aria-label'), /Trap — K drop behind you/);
  assert.equal(card.children.some(child => child.tagName === 'BUTTON'), false);
  card.focus(); assert.equal(doc.activeElement, card);
  card.click();
  assert.deepEqual(emitted, [['run:draftPickRequested', { offerId: 'trap-offer' }]]);
  assert.equal(refreshes, 1);
  const unavailable = screen._buildCard(ctx, { ...offer, available: false, unavailableReason: 'Not enough credits' }, 1);
  unavailable.click(); assert.equal(emitted.length, 1);
  assert.match(unavailable.getAttribute('aria-label'), /Not enough credits/);
});
