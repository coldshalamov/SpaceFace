// Pure native settings controls. The screen controller remains the only settings state owner.
// Shared by production and isolated browser tests, including preview-versus-commit semantics.
import { el, words } from '../kit/dom.js';
import { cue } from '../kit/sound.js';

let controlId = 0;

function nextControlId() { controlId += 1; return `sf-settings-control-${controlId}`; }

export function bindCommittedRange(input, valueLabel, fmt, onValue) {
  // Track fill: a range's CSS may read --sf-range-fill so the value is visible at a glance,
  // not just in the numeric readout.
  const paint = () => {
    const min = Number(input.min) || 0;
    const max = Number(input.max);
    const span = Number.isFinite(max) && max > min ? max - min : 100;
    const pct = ((parseFloat(input.value) - min) / span) * 100;
    input.style.setProperty('--sf-range-fill', `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
  };
  const publish = (persist) => {
    paint();
    const value = parseFloat(input.value);
    onValue(value, persist);
    valueLabel.textContent = fmt(value);
  };
  input.addEventListener('input', () => publish(false));
  input.addEventListener('change', () => publish(true));
  paint();
}

export function paneBuilder(pane) {
  let list = null;
  const rowsList = () => {
    if (!list) { list = el('ul', 'k-rows'); pane.appendChild(list); }
    return list;
  };
  const row = () => {
    const li = el('li', 'k-row k-row--static');
    rowsList().appendChild(li);
    return li;
  };
  const labelled = (labelText, forId) => {
    const li = row();
    const label = el(forId ? 'label' : 'span', 'k-t-body k-62', labelText);
    if (forId) label.htmlFor = forId;
    li.appendChild(label);
    return { li, label };
  };
  return {
    /** A range and its value: the only control that is a slider, because the value is a number. */
    slider(labelText, get, min, max, step, fmt, onInput) {
      const id = nextControlId();
      const { li, label: labelEl } = labelled(labelText, id);
      labelEl.htmlFor = id;
      const ctl = el('div', 'k-words k-words--row');
      const r = el('input', 'k-range'); r.id = id; r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
      const v = el('span', 'k-t-emph', fmt(get()));
      bindCommittedRange(r, v, fmt, onInput);
      ctl.appendChild(r); ctl.appendChild(v); li.appendChild(ctl);
      return li;
    },
    /** Two words, Off · On, the live one pressed. */
    toggle(labelText, get, onChange) {
      const { li, label } = labelled(labelText, null);
      label.id = nextControlId();
      const sync = (on) => {
        for (const b of ctl.querySelectorAll('.k-word')) b.setAttribute('aria-pressed', String((b.dataset.action === 'on') === !!on));
      };
      const ctl = words([{ action: 'off', label: 'Off' }, { action: 'on', label: 'On' }], {
        row: true, size: 'body', ariaLabel: labelText,
        onPick: (action) => { const nv = action === 'on'; if (nv === !!get()) { sync(nv); return; } onChange(nv); sync(nv); },
      });
      ctl.setAttribute('aria-labelledby', label.id);
      sync(get());
      li.appendChild(ctl);
      return li;
    },
    /** A tri-state as three words (touch controls: Auto · On · Off). */
    choice(labelText, options, get, onPick) {
      const { li, label } = labelled(labelText, null);
      label.id = nextControlId();
      const sync = (value) => {
        for (const b of ctl.querySelectorAll('.k-word')) b.setAttribute('aria-pressed', String(b.dataset.action === 'choice:' + value));
      };
      const ctl = words(options.map(([val, txt]) => ({ action: 'choice:' + val, label: txt })), {
        row: true, size: 'body', ariaLabel: labelText,
        onPick: (action) => { const val = action.slice('choice:'.length); onPick(val); sync(get()); },
      });
      ctl.setAttribute('aria-labelledby', label.id);
      sync(get());
      li.appendChild(ctl);
      return li;
    },
    select(labelText, get, options, onChange) {
      const id = nextControlId();
      const { li, label: labelEl } = labelled(labelText, id);
      labelEl.htmlFor = id;
      const sel = el('select', 'k-select'); sel.id = id;
      options.forEach(([val, txt]) => { const o = el('option', '', txt); o.value = val; if (val === get()) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => { cue('confirm'); onChange(sel.value); });
      li.appendChild(sel);
      return li;
    },
    /** An action label and its key as a word; pressing the word enters capture. */
    key(labelText, keyText, onPress, { digit = false } = {}) {
      const { li } = labelled(labelText, null);
      const btn = el('button', 'k-word k-word--body sf-bind-btn' + (digit ? ' sf-bind-btn--digit' : ''), keyText);
      btn.type = 'button';
      btn.addEventListener('click', () => onPress(btn));
      li.appendChild(btn);
      return btn;
    },
    /** A fixed shortcut: its label with the note beneath, the key on the right. */
    shortcut(labelText, keyText, note) {
      const li = row();
      const cell = el('div');
      cell.appendChild(el('span', 'k-row__name', labelText));
      if (note) cell.appendChild(el('div', 'k-row__sub', note));
      li.appendChild(cell);
      li.appendChild(el('span', 'k-t-emph', keyText));
      return li;
    },
    /** A section header inside the rows. */
    header(text) {
      const li = row();
      li.appendChild(el('div', 'k-caps', text));
      return li;
    },
    /** A quiet sentence between lists. */
    note(text) {
      list = null;
      const p = el('p', 'k-sentence k-38 sf-muted', text);
      pane.appendChild(p);
      return p;
    },
    /** A word that acts (Reset to defaults). */
    word(labelText, onClick, note) {
      list = null;
      const wrap = el('div', 'k-words k-words--row');
      const b = el('button', 'k-word k-word--body', labelText);
      b.type = 'button';
      b.addEventListener('click', () => { cue('confirm'); onClick(); });
      wrap.appendChild(b);
      if (note) wrap.appendChild(el('span', 'k-t-fine k-38', note));
      pane.appendChild(wrap);
      return b;
    },
    /** Start a fresh list (after a note or header block). */
    break() { list = null; },
  };
}
