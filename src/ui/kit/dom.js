// Kit presentation builders. Keyboard navigation is scoped to each component root.
// No global keyboard listener, network request, or gameplay-state mutation occurs here.
import { cue } from './sound.js';

export function el(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '' && text != null) element.textContent = String(text);
  return element;
}

function enabled(element) { return !element.disabled && element.getAttribute('aria-disabled') !== 'true'; }
function roving(root, elements, { row = false, onMove } = {}) {
  const items = () => elements().filter(enabled);
  const focusEntry = preferred => {
    const all = items();
    const target = preferred && all.includes(preferred) ? preferred : all[0];
    for (const item of elements()) item.tabIndex = item === target ? 0 : -1;
    return target;
  };
  focusEntry(items().find(item => item.getAttribute('aria-current') === 'true' || item.getAttribute('aria-selected') === 'true'));
  root.addEventListener('focusin', event => {
    const item = items().find(candidate => candidate === event.target || candidate.contains(event.target));
    if (item) focusEntry(item);
  });
  root.addEventListener('keydown', event => {
    const all = items();
    if (!all.length) return;
    const index = all.findIndex(item => item === document.activeElement || item.contains(document.activeElement));
    if (index < 0) return;
    const keys = row ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    let next = index;
    if (event.key === keys[0]) next = Math.max(0, index - 1);
    else if (event.key === keys[1]) next = Math.min(all.length - 1, index + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    else return;
    event.preventDefault();
    if (next !== index) { focusEntry(all[next]).focus(); cue('move'); onMove?.(all[next]); }
  });
}

/** Buttons keep native Enter/Space activation. Roving focus has exactly one Tab stop. */
export function words(items, { row = false, onPick, onMove, size = 'menu', ariaLabel = 'Actions' } = {}) {
  if (!['menu', 'emph', 'body', 'fine'].includes(size)) throw new RangeError('Invalid word size');
  if (items.filter(item => item.primary).length > 1) throw new Error('A words group has at most one primary action');
  const list = el('ul', row ? 'k-words k-words--row' : 'k-words');
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', ariaLabel);
  list.setAttribute('aria-orientation', row ? 'horizontal' : 'vertical');
  const buttons = [];
  for (const item of items) {
    const li = el('li'); li.setAttribute('role', 'none');
    const button = el('button', 'k-word' + (size === 'menu' ? '' : ` k-word--${size}`)
      + (item.primary ? ' k-word--primary' : '') + (item.danger ? ' k-word--danger' : ''), item.label);
    button.type = 'button'; button.dataset.action = String(item.action);
    button.setAttribute('role', 'menuitem');
    if (item.disabled) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); }
    if (item.current) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      if (!enabled(button)) { cue('deny'); return; }
      cue('confirm'); onPick?.(item.action, button);
    });
    buttons.push(button); li.append(button);
    if (item.sub) li.append(el('div', 'k-word-sub', item.sub));
    list.append(li);
  }
  roving(list, () => buttons, { row, onMove: button => onMove?.(button.dataset.action, button) });
  return list;
}

function choose(root, item) {
  for (const row of root.querySelectorAll('[aria-selected]')) row.setAttribute('aria-selected', String(row === item));
}
function selectable(element, pick) {
  element.addEventListener('click', pick);
  element.addEventListener('keydown', event => {
    if (event.target !== element || !['Enter', ' '].includes(event.key) || event.repeat) return;
    event.preventDefault(); pick();
  });
}

export function rows(items, { cols, onPick, ariaLabel = 'Items' } = {}) {
  const list = el('ul', 'k-rows');
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', ariaLabel);
  if (cols) list.style.setProperty('--k-row-cols', cols);
  const entries = [];
  for (const [index, item] of items.entries()) {
    const row = el('li', 'k-row'); row.dataset.id = String(item.id);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(item.selected === true));
    row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(items.length));
    const name = el('div'); name.append(el('span', 'k-row__name', item.name));
    if (item.sub) name.append(el('div', 'k-row__sub', item.sub));
    row.append(name, el('span', 'k-row__num', item.num ?? ''));
    selectable(row, () => { choose(list, row); cue('confirm'); onPick?.(item.id, row); });
    entries.push(row); list.append(row);
  }
  roving(list, () => entries);
  return list;
}

/** A row-selectable grid retains native table geometry and keyboard sorting buttons. */
export function table({ head, body, onPick, onSort, ariaLabel = 'Register' }) {
  const wrap = el('div', 'k-table-wrap');
  const grid = el('table', 'k-table'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', ariaLabel);
  const thead = el('thead'); const header = el('tr');
  for (const [index, column] of head.entries()) {
    const th = el('th', `k-caps${column.num ? ' k-num' : ''}`); th.scope = 'col';
    if (onSort) {
      th.setAttribute('aria-sort', 'none');
      const button = el('button', 'k-sort', column.label); button.type = 'button';
      button.addEventListener('click', () => {
        const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        for (const other of header.children) other.setAttribute('aria-sort', 'none');
        th.setAttribute('aria-sort', direction); cue('confirm'); onSort(index, direction, tbody);
      });
      th.append(button);
    } else th.textContent = column.label;
    header.append(th);
  }
  thead.append(header); const tbody = el('tbody');
  for (const item of body) {
    if (item.cells.length !== head.length) throw new RangeError('Kit table row has the wrong cell count');
    const row = el('tr'); row.dataset.id = String(item.id); row.setAttribute('aria-selected', String(item.selected === true));
    item.cells.forEach((text, index) => row.append(el('td', head[index].num ? 'k-num' : index === 0 ? 'k-name' : '', text)));
    selectable(row, () => { choose(tbody, row); cue('confirm'); onPick?.(item.id, row); });
    tbody.append(row);
  }
  grid.append(thead, tbody); wrap.append(grid);
  roving(tbody, () => [...tbody.rows]);
  return wrap;
}

export function hero(number, word, { size = 'num', signal = false } = {}) {
  if (!['num', 'title', 'hero'].includes(size)) throw new RangeError('Invalid hero size');
  const block = el('div', 'k-hero' + (size === 'num' ? '' : ` k-hero--${size}`) + (signal ? ' k-hero--signal' : ''));
  block.append(el('div', 'k-hero__n', number));
  if (word) block.append(el('div', 'k-hero__w', word));
  return block;
}
export function title(text, sub) {
  const header = el('header', 'k-title'); header.append(el('h1', 'k-display k-t-title', text));
  if (sub) header.append(el('p', 'k-t-emph k-62', sub));
  return header;
}
