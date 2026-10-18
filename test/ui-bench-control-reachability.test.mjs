import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from './helpers/fake-dom.mjs';
import { measureControlReachability } from '../tools/ui-bench-controls.js';

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
