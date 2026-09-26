// Shared list controls (UX-3): a search box + filter-chips + sortable-column header used to make
// the game's long lists (market table, shipyard hulls, outfitting shop, mission log, help codex)
// sortable, filterable, and searchable. Every screen shares the same controls so the affordance is
// consistent — once you've sorted the market you expect to sort the shipyard the same way.
//
// This is a pure helper: it returns DOM elements + a `getFilters()` accessor and emits no events.
// Each screen owns its own filter/sort state and its own list render; this just standardizes the UI.
//
// USAGE (sort + search):
//   const ctrls = createListControls({
//     search: true,
//     placeholder: 'Search commodities…',
//     onSearch: (q) => { filterState.q = q; render(); },
//   });
//   wrap.appendChild(ctrls.el);
//
// USAGE (sortable header cell):
//   buildSortHeader({ key:'price', label:'Price', activeKey: sort.key, dir: sort.dir, onSort: (k) => { ... } })

let _styleInjected = false;
function injectStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.id = 'sf-listcontrols-style';
  // Deckplate-first with legacy fallbacks: where the system is injected these read --dp-*
  // (type at the 12px floor, the lamp for live state, machined radii); anywhere else they render
  // exactly the legacy values. Chips are buttons and get the global :focus-visible ring.
  s.textContent = `
  .sf-lc { display:flex; align-items:center; gap:var(--dp-gap, var(--sp-2)); flex-wrap:wrap; margin-bottom:var(--dp-pad, var(--sp-3)); }
  .sf-lc__search { flex:1; min-width:160px; max-width:340px; font-family:inherit;
    background:var(--dp-field, rgba(5,9,18,.6)); color:var(--dp-ink, var(--ink)); border:1px solid var(--dp-rule-hi, var(--panel-edge));
    border-radius:var(--dp-r-instrument, var(--r-md)); padding:var(--dp-gap, var(--sp-2)) var(--dp-pad, var(--sp-3)); font-size:var(--dp-fs-data, var(--t-sm));
    pointer-events:auto; transition:border-color var(--dp-d-settle, var(--dur)) var(--dp-ease-lamp, var(--ease)), box-shadow var(--dp-d-settle, var(--dur)) var(--dp-ease-lamp, var(--ease)); }
  .sf-lc__search:focus { outline:none; border-color:var(--dp-lamp, var(--accent));
    box-shadow:0 0 0 2px var(--dp-lamp-bloom, rgba(79,143,221,.18)); }
  /* Authored placeholder tint — the browser default gray reads low-contrast on the dark face. */
  .sf-lc__search::placeholder { color:var(--dp-ink-mute, var(--ink-mute)); opacity:1; }
  .sf-lc__chips { display:flex; gap:calc(var(--dp-u, 4px) * 1); flex-wrap:wrap; }
  .sf-lc__chip { font-family:inherit; cursor:pointer; pointer-events:auto; border-radius:var(--dp-r-instrument, var(--r-pill));
    padding:calc(var(--dp-u, 4px) * .75) calc(var(--dp-u, 4px) * 2.75); font-size:var(--dp-fs-etch, var(--t-xs)); letter-spacing:.04em;
    background:var(--dp-field-ink, rgba(132,160,200,.08)); color:var(--dp-ink-dim, var(--ink-dim)); border:1px solid var(--dp-rule, var(--panel-edge));
    transition:color var(--dp-d-cut, var(--dur)) var(--dp-ease-lamp, var(--ease)), border-color var(--dp-d-cut, var(--dur)) var(--dp-ease-lamp, var(--ease)), background-color var(--dp-d-cut, var(--dur)) var(--dp-ease-lamp, var(--ease)); }
  .sf-lc__chip:hover { color:var(--dp-ink, var(--ink)); border-color:var(--dp-rule-hi, var(--panel-edge-2)); }
  .sf-lc__chip.active { color:var(--dp-lamp-hot, #fff); background:var(--dp-field-ink-hi, rgba(79,143,221,.18)); border-color:var(--dp-lamp-dim, var(--accent)); }
  /* Sortable header cell — used inside existing .st-row-head style grids */
  .sf-sort { cursor:pointer; pointer-events:auto; user-select:none; display:inline-flex;
    align-items:center; gap:3px; transition:color var(--dp-d-cut, var(--dur)) var(--dp-ease-lamp, var(--ease));
    background:transparent; border:0; padding:0; color:inherit; font:inherit;
    letter-spacing:inherit; text-transform:inherit; }
  .sf-sort:hover { color:var(--dp-ink, var(--ink)); }
  .sf-sort:focus-visible { outline:2px solid var(--dp-lamp-hot, var(--accent)); outline-offset:2px; }
  .sf-sort.active { color:var(--dp-lamp, var(--accent)); }
  .sf-sort__arrow { font-size:.7em; opacity:.55; }
  .sf-sort.active .sf-sort__arrow { opacity:1; }
  `;
  document.head.appendChild(s);
}

/**
 * Build a search box + optional filter chips row. Returns { el, getQuery, setQuery, setChips }.
 * @param {object} opts
 * @param {boolean} [opts.search=true]
 * @param {string} [opts.placeholder='Search…']
 * @param {function(string)} [opts.onSearch]  - called (debounced) on input
 * @param {Array<{key,label,active}>} [opts.chips] - initial chip set; clicking toggles
 * @param {function(string)} [opts.onChip]
 */
export function createListControls(opts) {
  opts = opts || {};
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'sf-lc';

  let query = '';
  let searchTimer = null;
  const onSearch = typeof opts.onSearch === 'function' ? opts.onSearch : () => {};

  if (opts.search !== false) {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'sf-lc__search';
    input.placeholder = opts.placeholder || 'Search…';
    input.setAttribute('aria-label', input.placeholder);
    input.value = '';
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase();
      // debounce so typing a long query doesn't re-render the whole list per keystroke
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => onSearch(query), 110);
    });
    wrap.appendChild(input);
  }

  let chipEls = [];
  let chips = [];
  const onChip = typeof opts.onChip === 'function' ? opts.onChip : () => {};
  if (Array.isArray(opts.chips) && opts.chips.length) {
    const chipWrap = document.createElement('div');
    chipWrap.className = 'sf-lc__chips';
    chips = opts.chips.slice();
    for (const c of chips) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-lc__chip' + (c.active ? ' active' : '');
      // Toggle chip: .active alone is style-only — without aria-pressed the on/off state is
      // invisible to assistive tech (the sort header beside it already declares its state).
      b.setAttribute('aria-pressed', c.active ? 'true' : 'false');
      b.textContent = c.label;
      b.addEventListener('click', () => {
        c.active = !c.active;
        b.classList.toggle('active', c.active);
        b.setAttribute('aria-pressed', c.active ? 'true' : 'false');
        onChip(c.key, c.active);
      });
      chipWrap.appendChild(b);
      chipEls.push({ key: c.key, el: b });
    }
    wrap.appendChild(chipWrap);
  }

  return {
    el: wrap,
    getQuery: () => query,
    setQuery: (q) => { query = (q || '').toLowerCase(); const i = wrap.querySelector('.sf-lc__search'); if (i) i.value = q || ''; },
  };
}

/**
 * Build a sortable column-header label. Clicking toggles asc/desc/active for that key.
 * @param {object} opts
 * @param {string} opts.key        - the sort key this header represents
 * @param {string} opts.label      - the visible label
 * @param {string} opts.activeKey  - the currently-active sort key (or '')
 * @param {'asc'|'desc'} opts.dir  - current direction
 * @param {function(string)} opts.onSort - called with the key when clicked
 * @returns {HTMLElement}
 */
export function buildSortHeader({ key, label, activeKey, dir, onSort }) {
  const active = activeKey === key;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sf-sort' + (active ? ' active' : '');
  btn.setAttribute('data-sk', key);
  btn.setAttribute('data-label', label);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.setAttribute('aria-label', sortHeaderAria(label, active, dir));
  btn.textContent = label;
  const arrow = document.createElement('span');
  arrow.className = 'sf-sort__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = active ? (dir === 'asc' ? '▲' : '▼') : '↕';
  btn.appendChild(arrow);
  btn.addEventListener('click', () => { if (typeof onSort === 'function') onSort(key); });
  return btn;
}

export function sortHeaderAria(label, active, dir) {
  const current = active ? `currently sorted ${dir === 'asc' ? 'ascending' : 'descending'}` : 'not sorted';
  const next = active && dir === 'asc' ? 'descending' : 'ascending';
  return `${label}, ${current}. Activate to sort ${next}.`;
}
