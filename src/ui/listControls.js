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
  s.textContent = `
  .sf-lc { display:flex; align-items:center; gap:var(--sp-2); flex-wrap:wrap; margin-bottom:var(--sp-3); }
  .sf-lc__search { flex:1; min-width:160px; max-width:340px; font-family:inherit;
    background:rgba(5,9,18,.6); color:var(--ink); border:1px solid var(--panel-edge);
    border-radius:var(--r-md); padding:var(--sp-2) var(--sp-3); font-size:var(--t-sm);
    pointer-events:auto; transition:border-color var(--dur) var(--ease); }
  .sf-lc__search:focus { outline:none; border-color:var(--accent);
    box-shadow:0 0 0 2px rgba(57,208,255,.18); }
  .sf-lc__chips { display:flex; gap:var(--sp-1); flex-wrap:wrap; }
  .sf-lc__chip { font-family:inherit; cursor:pointer; pointer-events:auto; border-radius:var(--r-pill);
    padding:3px 11px; font-size:var(--t-xs); letter-spacing:.04em; text-transform:uppercase;
    background:rgba(132,160,200,.08); color:var(--ink-dim); border:1px solid var(--panel-edge);
    transition:all var(--dur) var(--ease); text-transform:none; }
  .sf-lc__chip:hover { color:var(--ink); border-color:var(--panel-edge-2); }
  .sf-lc__chip.active { color:#fff; background:rgba(57,208,255,.18); border-color:var(--accent); }
  /* Sortable header cell — used inside existing .st-row-head style grids */
  .sf-sort { cursor:pointer; pointer-events:auto; user-select:none; display:inline-flex;
    align-items:center; gap:3px; transition:color var(--dur) var(--ease);
    background:transparent; border:0; padding:0; color:inherit; font:inherit;
    letter-spacing:inherit; text-transform:inherit; }
  .sf-sort:hover { color:var(--ink); }
  .sf-sort:focus-visible { outline:1px solid var(--accent); outline-offset:2px; }
  .sf-sort.active { color:var(--accent); }
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
      b.textContent = c.label;
      b.addEventListener('click', () => {
        c.active = !c.active;
        b.classList.toggle('active', c.active);
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
