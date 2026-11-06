import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from './helpers/fake-dom.mjs';
import {
  measureControlReachability, resolveBenchControl, snapshotBenchControls,
} from '../tools/ui-bench-controls.js';

function fixture() {
  const doc = fakeDom(), nodes = new Map();
  doc.defaultView = { innerWidth: 700, innerHeight: 460,
    getComputedStyle: el => ({ display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto', ...el.style }) };
  doc.querySelectorAll = selector => nodes.get(selector) || [];
  doc.elementFromPoint = () => null;
  const add = (selector, text, box = [520, 410, 100, 26]) => {
    const el = doc.createElement('button');
    el.textContent = text;
    el.contains = node => node === el || el.children.includes(node);
    el.getBoundingClientRect = () => {
      const [left, top, width, height] = box;
      return { left, top, width, height, right: left + width, bottom: top + height };
    };
    nodes.set(selector, [...(nodes.get(selector) || []), el]);
    doc.elementFromPoint = () => el;
    return el;
  };
  return { doc, add };
}

const BUY = '.sx-mkt [data-mode="buy"]';

function control(label, { action = '', parentLabel = 'Crucible' } = {}) {
  const parent = {
    id: '',
    parentElement: null,
    getAttribute: name => name === 'aria-label' ? parentLabel : null,
  };
  return {
    tagName: 'BUTTON', id: '', dataset: { action }, innerText: label, textContent: label,
    parentElement: parent,
    getAttribute: name => name === 'aria-label' ? null : (name === 'data-action' ? action : null),
  };
}

test('a partly off-frame BUY is a finding even when its centre can be clicked', () => {
  const { doc, add } = fixture();
  add(BUY, 'BUY 1', [520, 450, 100, 26]);
  assert.match(measureControlReachability(doc, 'station')[0], /Market BUY.*700×460.*viewport/);
});

test('a receipt covering BUY is named as the failed centre hit', () => {
  const { doc, add } = fixture();
  add(BUY, 'BUY 1');
  doc.elementFromPoint = () => ({ tagName: 'DIV', className: 'sx-receipt', getAttribute: () => null });
  assert.match(measureControlReachability(doc, 'station')[0], /Market BUY.*700×460.*centre.*sx-receipt/);
});

test('hit testing uses the currently visible intersection instead of a clipped center', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1', [20, 30, 100, 30]);
  const clip = doc.createElement('div');
  clip.style.overflowX = 'hidden';
  clip.getBoundingClientRect = () => ({ left: 20, top: 30, right: 60, bottom: 60, width: 40, height: 30 });
  clip.clientWidth = 40; clip.clientHeight = 30;
  clip.appendChild(buy);
  doc.elementFromPoint = (x) => x <= 60 ? buy : null;
  assert.deepEqual(measureControlReachability(doc, 'station'), [],
    'the visible part of a clipped control has a real hit target');
});

test('a control clipped by a scrollable ancestor is not called intercepted before scrolling', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1', [520, 500, 100, 26]);
  const scroll = doc.createElement('div');
  scroll.style.overflowY = 'auto';
  scroll.getBoundingClientRect = () => ({ left: 500, top: 200, right: 650, bottom: 400, width: 150, height: 200 });
  scroll.clientWidth = 150; scroll.clientHeight = 200;
  scroll.scrollWidth = 150; scroll.scrollHeight = 520;
  scroll.appendChild(buy);
  doc.elementFromPoint = () => scroll;
  assert.deepEqual(measureControlReachability(doc, 'station'), [],
    'the scrollport can reveal this control, so its unscrolled center is not an interception');
});

test('an inner scrollport can reveal a control through an overlapping fixed outer clip', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1', [520, 500, 100, 26]);
  const frame = doc.createElement('div');
  frame.style.overflowY = 'hidden';
  frame.getBoundingClientRect = () => ({ left: 500, top: 200, right: 650, bottom: 400, width: 150, height: 200 });
  frame.clientWidth = 150; frame.clientHeight = 200;
  const scroll = doc.createElement('div');
  scroll.style.overflowY = 'auto';
  scroll.getBoundingClientRect = () => ({ left: 510, top: 210, right: 640, bottom: 370, width: 130, height: 160 });
  scroll.clientWidth = 130; scroll.clientHeight = 160;
  scroll.scrollWidth = 130; scroll.scrollHeight = 520;
  scroll.appendChild(buy);
  frame.appendChild(scroll);
  doc.elementFromPoint = () => scroll;
  assert.deepEqual(measureControlReachability(doc, 'station'), [],
    'the inner scroll can bring the control into the overlapping aperture of both clips');
});

test('an inner scroll can reveal a control when its scrollport only partly overlaps a fixed outer clip', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1', [520, 450, 100, 26]);
  const frame = doc.createElement('div');
  frame.style.overflowY = 'hidden';
  frame.getBoundingClientRect = () => ({ left: 500, top: 200, right: 650, bottom: 340, width: 150, height: 140 });
  frame.clientWidth = 150; frame.clientHeight = 140;
  const scroll = doc.createElement('div');
  scroll.style.overflowY = 'auto';
  scroll.getBoundingClientRect = () => ({ left: 510, top: 300, right: 640, bottom: 460, width: 130, height: 160 });
  scroll.clientWidth = 130; scroll.clientHeight = 160;
  scroll.scrollWidth = 130; scroll.scrollHeight = 520;
  scroll.appendChild(buy);
  frame.appendChild(scroll);
  doc.elementFromPoint = () => scroll;
  assert.deepEqual(measureControlReachability(doc, 'station'), [],
    'the 40px shared aperture can contain the 26px control after inner scrolling');
});

test('non-scrollable clipping remains a reachability failure', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1', [520, 300, 100, 26]);
  const clip = doc.createElement('div');
  clip.style.overflowY = 'hidden';
  clip.getBoundingClientRect = () => ({ left: 500, top: 200, right: 650, bottom: 260, width: 150, height: 60 });
  clip.clientWidth = 150; clip.clientHeight = 60;
  clip.appendChild(buy);
  doc.elementFromPoint = () => clip;
  assert.match(measureControlReachability(doc, 'station').join('\n'), /Market BUY.*non-scrollable ancestor/);
});

test('controls behind an active modal are deferred while its own blocked action is still reported', () => {
  const { doc, add } = fixture();
  const behind = add(BUY, 'BUY 1', [520, 410, 100, 26]);
  const modal = doc.createElement('dialog');
  modal.getBoundingClientRect = () => ({ left: 150, top: 100, right: 550, bottom: 400, width: 400, height: 300 });
  const dialogBuy = doc.createElement('button');
  dialogBuy.textContent = 'BUY confirmation';
  dialogBuy.getBoundingClientRect = () => ({ left: 300, top: 300, right: 400, bottom: 330, width: 100, height: 30 });
  modal.appendChild(dialogBuy);
  modal.contains = node => node === modal || node === dialogBuy;
  dialogBuy.contains = node => node === dialogBuy;
  modal.querySelectorAll = selector => selector.includes('button') ? [dialogBuy] : [];
  doc.querySelectorAll = selector => selector === 'dialog:modal' ? [modal]
    : selector === BUY ? [behind] : [];
  doc.elementFromPoint = () => ({ tagName: 'DIV', className: 'dialog-shield' });
  assert.match(measureControlReachability(doc, 'station').join('\n'), /Active dialog action BUY confirmation.*dialog-shield/);
  assert.doesNotMatch(measureControlReachability(doc, 'station').join('\n'), /Market BUY BUY 1/,
    'the underlying station action is not mislabeled as a dialog failure');
});

test('hidden or non-interactive controls stay in the measure instead of disappearing', () => {
  for (const [property, value] of [['pointerEvents', 'none'], ['visibility', 'hidden'], ['opacity', '0'], ['display', 'none']]) {
    const { doc, add } = fixture();
    add(BUY, 'BUY 1').style[property] = value;
    assert.match(measureControlReachability(doc, 'station')[0], /Market BUY.*700×460.*style/);
  }
});

test('an invisible ancestor fails visibility, while a descendant hit passes', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1'), label = doc.createElement('span');
  buy.appendChild(label);
  doc.elementFromPoint = () => label;
  assert.deepEqual(measureControlReachability(doc, 'station'), []);
  const parent = doc.createElement('div');
  parent.appendChild(buy);
  parent.style.opacity = '0';
  assert.match(measureControlReachability(doc, 'station')[0], /style.*opacity/);
});

test('a control can explicitly restore visibility inside a hidden ancestor', () => {
  const { doc, add } = fixture();
  const buy = add(BUY, 'BUY 1'), parent = doc.createElement('div');
  parent.appendChild(buy);
  parent.style.visibility = 'hidden';
  buy.style.visibility = 'visible';
  assert.deepEqual(measureControlReachability(doc, 'station'), []);
});

test('every station destination is measured by its player-facing name', () => {
  const { doc, add } = fixture();
  add('.sx-dock__group--nav [role="tab"]', 'LEDGER', [-5, 410, 80, 26]);
  assert.match(measureControlReachability(doc, 'station')[0], /Station tab LEDGER.*viewport/);
});

test('absent and not-yet-present receipts do not create findings; visible receipts are checked', () => {
  const { doc, add } = fixture();
  assert.deepEqual(measureControlReachability(doc, 'station'), []);
  const receipt = add('.sx-receipt', 'TRADE CLEARED', [700, 400, 180, 26]);
  receipt.hidden = true;
  assert.deepEqual(measureControlReachability(doc, 'station'), []);
  receipt.hidden = false;
  assert.match(measureControlReachability(doc, 'station')[0], /TRADE CLEARED.*viewport/);
});

test('title and pause menu primaries use the same reachability rules', () => {
  for (const [surface, selector] of [['mainMenu', '.orr-title [data-action], .orr-title--phone [data-action]'], ['pause', '.orr-pause [data-action], .orr-pause--phone [data-action]']]) {
    const { doc, add } = fixture();
    add(selector, 'Resume', [520, 450, 100, 26]);
    assert.match(measureControlReachability(doc, surface)[0], /Resume.*700×460.*viewport/);
  }
});

test('an action the product removed on purpose (hidden row) is not a fault, but CSS-hiding an applicable action is', () => {
  const { doc, add } = fixture();
  const quit = add('.orr-title [data-action], .orr-title--phone [data-action]', 'Quit');
  quit.hidden = true;
  assert.deepEqual(measureControlReachability(doc, 'mainMenu'), []);
  const row = { nodeType: 1, hidden: true };
  const inRow = fixture();
  const cont = inRow.add('.orr-title [data-action], .orr-title--phone [data-action]', 'Continue');
  cont.parentElement = row;
  assert.deepEqual(measureControlReachability(inRow.doc, 'mainMenu'), [], 'a hidden containing row is the same intent');
  const css = fixture();
  css.add('.orr-title [data-action], .orr-title--phone [data-action]', 'New Game').style.display = 'none';
  assert.match(measureControlReachability(css.doc, 'mainMenu')[0], /Title menu New Game.*style prevents reachability/);
});

test('phone title and pause menus are measured: an off-frame phone Resume is a finding', () => {
  const pause = fixture();
  pause.add('.orr-pause [data-action], .orr-pause--phone [data-action]', 'Resume', [20, 470, 120, 40]);
  assert.match(measureControlReachability(pause.doc, 'pause')[0], /Pause menu Resume.*viewport/);
  const title = fixture();
  title.add('.orr-title [data-action], .orr-title--phone [data-action]', 'New Game', [20, 455, 120, 40]);
  assert.match(measureControlReachability(title.doc, 'mainMenu')[0], /Title menu New Game.*viewport/);
});

test('control identity resolves after reinventory shifts indices and reports a missing control', () => {
  const original = snapshotBenchControls([control('Continue', { action: 'continue' }), control('Training opening', { action: 'training' })]);
  const target = original[1];
  const currentTraining = control('Training opening', { action: 'training' });
  const currentContinue = control('Continue', { action: 'continue' });

  const resolved = resolveBenchControl([control('Back', { action: 'back' }), currentTraining, currentContinue], target.identity);
  assert.equal(resolved.element, currentTraining, 'the recorded control is found by semantic identity after its index changes');
  assert.equal(resolveBenchControl([control('Continue', { action: 'continue' })], target.identity), null,
    'a control absent after reset is explicit instead of falling through to another index');
});

test('control identity includes semantic container context for repeated labels', () => {
  const left = control('Continue', { action: 'continue', parentLabel: 'Draft options' });
  const right = control('Continue', { action: 'continue', parentLabel: 'Run controls' });
  const rows = snapshotBenchControls([left, right]);
  assert.notEqual(rows[0].identity, rows[1].identity);
  assert.equal(resolveBenchControl([right, left], rows[1].identity).element, right);
});

test('indistinguishable controls remain untried when a duplicate disappears on reset', () => {
  const first = control('Continue'), second = control('Continue');
  const rows = snapshotBenchControls([first, second]);
  assert.equal(resolveBenchControl([first, second], rows[0].identity), null);
  assert.equal(resolveBenchControl([second], rows[0].identity), null,
    'the remaining duplicate must not impersonate the missing original');
});
