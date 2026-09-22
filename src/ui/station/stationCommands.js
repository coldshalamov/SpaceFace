import { stationIcon } from './stationArt.js';
import { stationControlAttrs, stationControlLabel } from './stationBindingMap.js';

/** Searchable station command dialog. The supplied commands are intents, never mutations.
 * The input owns active-descendant focus; dialog owns Tab containment and focus restoration.
 * No shortcut runs while hidden. Escape is intercepted before station's departure handler.
 */
export function createStationCommands({ root, trigger, getCommands, canOpen = () => true }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'so-command-palette';
  trigger.setAttribute('aria-expanded', 'false');
  dialog.className = 'so-command-palette';
  dialog.setAttribute('aria-labelledby', 'so-command-title');
  dialog.innerHTML = `<div class="so-command-head"><div><span class="so-overline">Station access</span><h2 id="so-command-title">Where to next?</h2></div><button type="button" ${stationControlAttrs('close-palette')} data-close aria-label="${stationControlLabel('close-palette')}">${stationIcon('close')}</button></div>
    <div class="so-command-search">${stationIcon('search')}<input type="search" autocomplete="off" spellcheck="false" placeholder="Market, sell cargo, departure…" aria-label="Find a station service" role="combobox" aria-expanded="true" aria-controls="so-command-results" aria-autocomplete="list"/></div>
    <ul id="so-command-results" role="listbox" aria-label="Matching station commands"></ul>
    <p class="so-command-empty" role="status" hidden>No matching services. Try “cargo” or “missions”.</p>
    <footer><span><kbd>↑</kbd><kbd>↓</kbd> to choose</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></footer>`;
  root.append(dialog);
  const input = dialog.querySelector('input');
  const results = dialog.querySelector('ul');
  const empty = dialog.querySelector('.so-command-empty');
  let active = 0, filtered = [], restore = null, enabled = true, disposed = false;
  const stop = new AbortController();
  const on = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: stop.signal });

  function select(index) {
    if (!filtered.length) { input.removeAttribute('aria-activedescendant'); return; }
    active = Math.max(0, Math.min(filtered.length - 1, index));
    const options = [...results.children];
    options.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  }
  function render() {
    const query = input.value.trim().toLocaleLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    filtered = (getCommands() || []).filter(c => tokens.every(t => `${c.label} ${c.detail || ''} ${c.keywords || ''}`.toLocaleLowerCase().includes(t)));
    results.replaceChildren(...filtered.map((command, i) => {
      const item = document.createElement('li');
      item.id = `so-command-${i}`;
      item.dataset.command = String(i);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-disabled', String(!!command.disabled));
      item.innerHTML = `${stationIcon(command.icon || 'chevron')}<span class="so-command-copy"><strong></strong><small></small></span>${stationIcon('chevron')}`;
      item.querySelector('strong').textContent = command.label;
      item.querySelector('small').textContent = command.detail || '';
      return item;
    }));
    empty.hidden = filtered.length !== 0;
    select(0);
  }
  function close({ restoreFocus = true } = {}) {
    if (!dialog.open) return;
    dialog.close();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && restore?.isConnected) restore.focus({ preventScroll: true });
  }
  function open() {
    if (!enabled || disposed || !canOpen() || dialog.open) return;
    restore = document.activeElement;
    input.value = '';
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    render();
    input.focus({ preventScroll: true });
  }
  function execute(index) {
    const command = filtered[index];
    if (!command || command.disabled) return;
    close(); // close before navigate/other dialog; native modality must not swallow the result
    command.run();
  }
  on(trigger, 'click', open);
  on(input, 'input', render);
  on(results, 'pointermove', e => { const item = e.target.closest('[data-command]'); if (item) select(Number(item.dataset.command)); });
  on(results, 'click', e => { const item = e.target.closest('[data-command]'); if (item) execute(Number(item.dataset.command)); });
  on(dialog.querySelector('[data-close]'), 'click', () => close());
  on(dialog, 'cancel', e => { e.preventDefault(); close(); });
  on(dialog, 'click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
  on(window, 'keydown', e => {
    if (!enabled || disposed || e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.altKey && canOpen()) {
      e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) dialog.open ? close() : open(); return;
    }
    if (!dialog.open) return;
    // No command-dialog keystroke may become thrust, tab change, or a station exit.
    // Tab remains native so the browser retains focus containment.
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); select((active + 1) % Math.max(1, filtered.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select((active - 1 + filtered.length) % Math.max(1, filtered.length)); }
    else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); if (!e.repeat) execute(active); }
  }, { capture: true });
  return { open, close, get isOpen() { return dialog.open; },
    setEnabled(value) { enabled = !!value; if (!enabled) close({ restoreFocus: false }); },
    dispose() { disposed = true; close({ restoreFocus: false }); stop.abort(); dialog.remove(); },
  };
}
