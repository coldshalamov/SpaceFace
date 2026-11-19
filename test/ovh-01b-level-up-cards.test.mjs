// OVH-01b — the Pilot Tree's cards. There is no jsdom in this repo, so the view runs on a small
// hand-written DOM that implements exactly what the view touches. The sim deals, the screen asks:
// every assertion about a choice is an assertion about the INTENT the screen puts on the bus.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { PILOT_REROLL_SCRAP } from '../src/systems/runSession.js';
import {
  PILOT_BREATH_MAX_S,
  PILOT_CARD_INTENT,
  PILOT_CARDS_SCREEN_ID,
  PILOT_PICK_TIME_SCALE,
  PILOT_PICK_TIME_SOURCE,
  PILOT_REROLL_INTENT,
  createPilotBreathController,
  createPilotCardsView,
  pilotBreathSeconds,
  pilotCardFace,
  pilotCardsScreen,
  readPilotHand,
  reducedMotionOn,
} from '../src/ui/pilotCards.js';
import { PILOT_CARDS_CSS } from '../src/ui/pilotCardsCss.js';
import { survivalHud } from '../src/ui/survivalHud.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

// --- the smallest DOM the view needs ---------------------------------------------------------
class FakeEl {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.styleProps = {};
    this.className = '';
    this._text = '';
    this.hidden = false;
    this.id = '';
    this.title = '';
    this.style = { setProperty: (k, v) => { this.styleProps[k] = v; }, width: '' };
    this.classList = {
      contains: (c) => this.className.split(/\s+/).includes(c),
      add: (...c) => { for (const x of c) if (!this.classList.contains(x)) this.className = `${this.className} ${x}`.trim(); },
      remove: (...c) => { this.className = this.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
    };
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...nodes) { for (const n of nodes) { if (typeof n === 'string') this._text += n; else this.appendChild(n); } }
  appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); n.parentNode = null; return n; }
  replaceChildren() { for (const c of this.children) c.parentNode = null; this.children = []; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() {
    if (this.attrs.disabled) return;
    for (const fn of this.listeners.click || []) fn({ target: this });
  }
  focus() { this.ownerDocument.activeElement = this; }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}

function fakeDoc() {
  const doc = {
    activeElement: null,
    head: null,
    documentElement: null,
    body: null,
    listeners: {},
    createElement(tag) { return new FakeEl(tag, doc); },
    getElementById() { return null; },
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { doc.listeners[type] = (doc.listeners[type] || []).filter((f) => f !== fn); },
  };
  doc.head = new FakeEl('head', doc);
  doc.body = new FakeEl('body', doc);
  doc.documentElement = new FakeEl('html', doc);
  return doc;
}

function fakeBus() {
  const events = [];
  const subs = {};
  return {
    events,
    emit(event, payload) { events.push({ event, payload }); for (const fn of subs[event] || []) fn(payload); },
    on(event, fn) { (subs[event] ||= []).push(fn); return () => { subs[event] = subs[event].filter((f) => f !== fn); }; },
    of(event) { return events.filter((e) => e.event === event).map((e) => e.payload); },
  };
}

function runState({ cards = ['gunner_hollow_point', 'bruiser_billiards', 'evolution_orbital_saw'], banked = 1, credits = 400, points = { gunner: 5, bruiser: 3, rigger: 5 } } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.ui.screenStack = [];
  state.run = {
    kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 3, seed: 47, level: 4, credits,
    pilot: { nodes: [], points: { ...points }, banked, offer: cards ? { cards: [...cards], rerolls: 0 } : null },
  };
  return state;
}

function mountView(state, opts = {}) {
  const doc = fakeDoc();
  const bus = fakeBus();
  const host = doc.createElement('div');
  const closes = [];
  const clock = { t: 1000 };
  const view = createPilotCardsView({
    state, bus, host, doc, mode: opts.mode || 'screen', now: () => clock.t, onClose: (r) => closes.push(r),
  });
  return { doc, bus, host, view, closes, clock };
}

const key = (k) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false });

test('cards render the offer\'s nodes in order, verbatim, with branch colour and points', () => {
  const state = runState();
  const { view } = mountView(state);
  const cards = view.root.all((n) => n.dataset.nodeId);
  assert.deepEqual(cards.map((c) => c.dataset.nodeId), ['gunner_hollow_point', 'bruiser_billiards', 'evolution_orbital_saw']);
  assert.deepEqual(cards.map((c) => c.dataset.index), ['0', '1', '2']);
  const texts = view.root.all((n) => n.className === 'pc__text').map((n) => n.textContent);
  assert.equal(texts[0], 'Shots tear unshielded hulls 50 % faster.');
  assert.equal(texts[1], 'A rock you shot kills the first enemy it meets at speed, whatever its hull.');
  assert.deepEqual(view.root.all((n) => n.className === 'pc__name').map((n) => n.textContent),
    ['Hollow Point', 'Billiards', 'Orbital Saw']);
  // "Bruiser 3": the branch's held points ride the card; colour is a custom property, name is text.
  const branch = view.root.all((n) => n.className === 'pc__branch').map((n) => n.textContent);
  assert.equal(branch[0], 'Gunner5');
  assert.equal(branch[1], 'Bruiser3');
  assert.equal(branch[2], 'Gunner 5 · Rigger 5');
  assert.ok(cards.every((c) => c.styleProps['--pc']));
  assert.equal(pilotCardFace(state, 'bruiser_billiards').branchLine, 'Bruiser 3');
  // A capstone and an evolution wear their own frame.
  assert.equal(pilotCardFace(state, 'bruiser_newtons_cradle').frame, 'capstone');
  assert.equal(pilotCardFace(state, 'evolution_orbital_saw').frame, 'evolution');
  assert.equal(pilotCardFace(state, 'gunner_hollow_point').frame, 'standard');
});

test('a hand of one or two lays out; no hand, no breath', () => {
  for (const n of [1, 2]) {
    const state = runState({ cards: ['gunner_hollow_point', 'bruiser_billiards'].slice(0, n) });
    const { view } = mountView(state);
    assert.equal(view.cards.length, n);
    assert.equal(view.elements.hand.dataset.count, String(n));
    // a digit past the hand is still this screen's key, and sends no intent
    assert.equal(view.key(key('3')), true);
  }
  const none = runState({ cards: null });
  assert.equal(readPilotHand(none), null);
  const noBank = runState({ banked: 0 });
  assert.equal(readPilotHand(noBank), null, 'a hand with no banked pick is not shown');
  const { closes } = mountView(none);
  assert.deepEqual(closes, ['done']);
});

test('1/2/3 and a click ask the owner through run:pilotCardRequested; the view never deals', () => {
  const state = runState();
  const { view, bus } = mountView(state);
  assert.equal(view.key(key('2')), true);
  assert.deepEqual(bus.of(PILOT_CARD_INTENT), [{ index: 1 }]);
  // The answer is pending until the run changes: a second press does not double-send.
  assert.equal(view.key(key('1')), true);
  assert.equal(bus.of(PILOT_CARD_INTENT).length, 1);
  // The owner commits; the screen follows state and closes when no hand remains.
  state.run.pilot.nodes.push('bruiser_billiards');
  state.run.pilot.banked = 0;
  state.run.pilot.offer = null;
  view.tick(1100);
  assert.equal(view.closed, true);

  const second = mountView(runState());
  second.view.cards[2].click();
  assert.deepEqual(second.bus.of(PILOT_CARD_INTENT), [{ index: 2 }]);
  // Source pin: the screen only ever speaks intents.
  assert.equal(second.bus.of('run:pilotCardChosen').length, 0);
});

test('a second banked pick shows the fresh hand in place and restarts the breath', () => {
  const state = runState({ banked: 2 });
  const { view, clock, closes } = mountView(state);
  view.key(key('1'));
  state.run.pilot.banked = 1;
  state.run.pilot.offer = { cards: ['gunner_drum', 'ghost_decoy'], rerolls: 0 };
  clock.t += 5000;
  view.tick(clock.t);
  assert.deepEqual(view.cards.map((c) => c.dataset.nodeId), ['gunner_drum', 'ghost_decoy']);
  assert.equal(closes.length, 0, 'the fresh hand got a fresh breath');
  view.key(key('1'));
  assert.equal(view.elements.status.textContent, '');
});

test('re-roll shows its Scrap price and is disabled when the purse is short', () => {
  const short = runState({ credits: PILOT_REROLL_SCRAP - 1 });
  const a = mountView(short);
  assert.equal(a.view.elements.rerollPrice.textContent, `${PILOT_REROLL_SCRAP} Scrap`);
  assert.equal(a.view.elements.reroll.getAttribute('aria-disabled'), 'true');
  a.view.elements.reroll.click();
  assert.equal(a.bus.of(PILOT_REROLL_INTENT).length, 0, 'a short purse sends nothing');
  assert.match(a.view.elements.status.textContent, /needs 150 Scrap/);
  assert.match(a.view.elements.purse.textContent, /1 Scrap short/);

  const rich = runState({ credits: PILOT_REROLL_SCRAP });
  const b = mountView(rich);
  assert.equal(b.view.elements.reroll.getAttribute('aria-disabled'), 'false');
  assert.equal(b.view.key(key('r')), true);
  assert.deepEqual(b.bus.of(PILOT_REROLL_INTENT), [{}]);
});

test('the breath lasts 4 s and stretches up to 10 s while picks wait', () => {
  assert.equal(pilotBreathSeconds(1), 4);
  assert.equal(pilotBreathSeconds(2), 6);
  assert.equal(pilotBreathSeconds(3), 8);
  assert.equal(pilotBreathSeconds(9), PILOT_BREATH_MAX_S);
  assert.equal(PILOT_BREATH_MAX_S, 10);

  const one = mountView(runState({ banked: 1 }));
  one.clock.t += 3900;
  assert.equal(one.view.tick(one.clock.t), true);
  one.clock.t += 200;
  assert.equal(one.view.tick(one.clock.t), false);
  assert.deepEqual(one.closes, ['timeout']);

  const three = mountView(runState({ banked: 3 }));
  three.clock.t += 7900;
  assert.equal(three.view.tick(three.clock.t), true, 'three waiting picks hold the breath open past 4 s');
  assert.match(three.view.elements.timerWord.textContent, /Closes in 1 s/);
  three.clock.t += 200;
  assert.equal(three.view.tick(three.clock.t), false);

  // The overlay mode has no clock at all.
  const overlay = mountView(runState({ banked: 1 }), { mode: 'overlay' });
  overlay.clock.t += 60000;
  assert.equal(overlay.view.tick(overlay.clock.t), true);
  assert.equal(overlay.view.elements.timer.hidden, true);
});

test('Esc and Later send the breath away and leave the pick banked', () => {
  const state = runState();
  const { view, closes, bus } = mountView(state);
  assert.equal(view.key(key('Escape')), true);
  assert.deepEqual(closes, ['later']);
  assert.equal(state.run.pilot.banked, 1);
  assert.equal(bus.of(PILOT_CARD_INTENT).length, 0);
});

test('reduced motion has no rise animation', () => {
  assert.match(PILOT_CARDS_CSS, /html\.sf-reduce-motion \.pc__card[^{]*\{\s*animation:none/);
  assert.match(PILOT_CARDS_CSS, /prefers-reduced-motion: reduce\)\s*\{\s*\.pc__card \{ animation:none/);
  // Without the setting the card animates; with it, the shipped class turns the animation off.
  assert.match(PILOT_CARDS_CSS, /\.pc__card \{[^}]*animation:pc-rise/s);
  const doc = fakeDoc();
  assert.equal(reducedMotionOn(doc), false);
  doc.documentElement.classList.add('sf-reduce-motion');
  assert.equal(reducedMotionOn(doc), true);
});

test('the screen is a locked modal that answers 1/2/3, R and Esc through onKey', () => {
  assert.equal(pilotCardsScreen.id, PILOT_CARDS_SCREEN_ID);
  assert.equal(pilotCardsScreen.data.locked, true);
  const state = runState();
  const doc = fakeDoc();
  const bus = fakeBus();
  const root = doc.createElement('div');
  pilotCardsScreen.mount(root, { state, bus });
  assert.equal(pilotCardsScreen.onKey(key('3')), true);
  assert.deepEqual(bus.of(PILOT_CARD_INTENT), [{ index: 2 }]);
  assert.equal(pilotCardsScreen.onKey(key('x')), false);
  pilotCardsScreen.onPadButton('x', { pressed: true });
  assert.equal(bus.of(PILOT_REROLL_INTENT).length, 0, 'a pick is pending, so the pad re-roll waits');
  pilotCardsScreen.onKey(key('Escape'));
  assert.deepEqual(bus.of('ui:closeScreen'), [{ id: PILOT_CARDS_SCREEN_ID }]);
  pilotCardsScreen.dispose();
});

test('the round-end breath is pushed over the draft once, never while a hand is absent', () => {
  const state = runState();
  const bus = fakeBus();
  const doc = fakeDoc();
  const ctl = createPilotBreathController({ state, bus, doc });
  ctl.tick(state);
  assert.equal(bus.of('ui:pushScreen').length, 0, 'mid-fight: nothing pushed');
  state.ui.screenStack = ['crucibleDraft'];
  ctl.tick(state);
  assert.deepEqual(bus.of('ui:pushScreen'), [{ id: PILOT_CARDS_SCREEN_ID }]);
  ctl.tick(state);
  state.ui.screenStack = ['crucibleDraft', PILOT_CARDS_SCREEN_ID];
  ctl.tick(state);
  assert.equal(bus.of('ui:pushScreen').length, 1, 'once per draft');
  // Dismissed: the screen pops; the same draft is not re-pushed.
  state.ui.screenStack = ['crucibleDraft'];
  ctl.tick(state);
  assert.equal(bus.of('ui:pushScreen').length, 1);
  // A new round's draft gets its own breath.
  state.ui.screenStack = [];
  ctl.tick(state);
  state.run.wave = 4;
  state.ui.screenStack = ['crucibleDraft'];
  ctl.tick(state);
  assert.equal(bus.of('ui:pushScreen').length, 2);
  ctl.destroy();

  const empty = runState({ cards: null });
  empty.ui.screenStack = ['crucibleDraft'];
  const bus2 = fakeBus();
  createPilotBreathController({ state: empty, bus: bus2, doc }).tick(empty);
  assert.equal(bus2.of('ui:pushScreen').length, 0, 'no hand, no breath');
});

test('Pick at once raises the cards over the fight and slows the presented clock to 15 % until a choice', () => {
  const state = runState();
  state.settings.gameplay.pilotPickAtOnce = true;
  const effects = createTimeEffects(state);
  const bus = fakeBus();
  const doc = fakeDoc();
  const ctl = createPilotBreathController({ state, bus, doc, timeEffects: effects });
  ctl.tick(state);
  assert.equal(ctl.overlayOpen, true);
  assert.equal(ctl.slowed, true);
  assert.deepEqual(effects.describeRequests()[PILOT_PICK_TIME_SOURCE], { scale: PILOT_PICK_TIME_SCALE });
  assert.equal(state.timeScale, 0.15);
  assert.equal(doc.body.children.length, 1);
  // 1/2/3 are the overlay's while it is up, caught before flight's ordnance keys.
  const handler = doc.listeners.keydown[0];
  const ev = { ...key('1'), preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  handler(ev);
  assert.equal(ev.prevented && ev.stopped, true);
  assert.deepEqual(bus.of(PILOT_CARD_INTENT), [{ index: 0 }]);
  // The owner commits the choice: the cards go, the clock returns.
  state.run.pilot.banked = 0;
  state.run.pilot.offer = null;
  ctl.tick(state);
  assert.equal(ctl.overlayOpen, false);
  assert.equal(state.timeScale, 1);
  assert.equal(doc.body.children.length, 0);

  // The setting off: a hand is never raised over the fight.
  const off = runState();
  const ctl2 = createPilotBreathController({ state: off, bus: fakeBus(), doc: fakeDoc(), timeEffects: createTimeEffects(off) });
  ctl2.tick(off);
  assert.equal(ctl2.overlayOpen, false);
});

test('level-up: LEVEL n rides the bar for ~1.2 s, the bar flashes once, a chime plays, nothing pauses', () => {
  const state = runState();
  state.simTime = 10;
  const bus = fakeBus();
  survivalHud.init({ state, bus });
  bus.emit('run:levelUp', { level: 5, previousLevel: 4, xp: 500, banked: 1 });
  assert.equal(survivalHud._earn, 'LEVEL 5');
  assert.ok(Math.abs(survivalHud._earnUntil - 11.2) < 1e-9, 'the line expires 1.2 s later');
  assert.ok(survivalHud._xpFlashUntil > 10 && survivalHud._xpFlashUntil < survivalHud._earnUntil);
  assert.ok(bus.of('audio:cue').some((c) => c.id === 'ui_confirm'));
  assert.equal(state.timeScale, 1, 'a level-up never touches the clock');
  assert.equal(bus.of('ui:pushScreen').length, 0);
  survivalHud.destroy();
});
