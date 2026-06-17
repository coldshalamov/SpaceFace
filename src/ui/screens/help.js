// Help / controls cheat-sheet (ARCHITECTURE §5.6; design/specs/09).
// Read-only keybind grid. Built from state.settings.keybinds when present, else the
// documented defaults. Dismissed via the Close button or ESC (screen manager handles ESC).

const STYLE_ID = 'sf-menu-style';

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-menu { display:flex; flex-direction:column; gap:14px; padding:26px 30px; min-width:360px;
    max-width:min(92vw,920px); max-height:88vh; overflow:auto; pointer-events:auto; }
  .sf-menu-narrow { min-width:300px; width:340px; }
  .sf-menu-wide { width:min(92vw,820px); }
  .sf-menu h1 { margin:0 0 4px; font-family:var(--mono); letter-spacing:.32em; font-size:20px;
    color:var(--accent); text-shadow:0 0 18px rgba(57,208,255,.45); text-transform:uppercase; text-align:center; }
  .sf-menu h2 { margin:14px 0 4px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu .sf-col { display:flex; flex-direction:column; gap:8px; }
  .sf-menu button.sf-btn { width:100%; text-align:center; padding:11px 14px; font-size:14px; letter-spacing:.06em; }
  .sf-menu .sf-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .sf-menu .sf-row > label { color:var(--ink-dim); font-size:13px; flex:0 0 38%; }
  .sf-menu .sf-row > .sf-ctl { flex:1; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); }
  .sf-menu select, .sf-menu input[type=text], .sf-menu input[type=number] {
    font-family:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--panel-edge);
    border-radius:5px; padding:6px 8px; pointer-events:auto; }
  .sf-menu .sf-val { font-family:var(--mono); color:var(--accent); min-width:46px; text-align:right; }
  .sf-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--panel-edge); padding-bottom:8px; flex-wrap:wrap; }
  .sf-tabbar button.sf-tab.active { border-color:var(--accent); color:#fff; box-shadow:0 0 10px rgba(57,208,255,.35); }
  .sf-menu .sf-grid2 { display:grid; grid-template-columns:auto 1fr; gap:6px 18px; align-items:center; font-size:13px; }
  .sf-menu .sf-grid2 .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; }
  .sf-menu .sf-grid2 .v { color:var(--ink); }
  .sf-menu .sf-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
  .sf-menu .sf-muted { color:var(--ink-mute); font-size:12px; }
  .sf-slot { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--panel-edge);
    border-radius:6px; background:var(--panel); }
  .sf-slot.sel { border-color:var(--accent); box-shadow:0 0 10px rgba(57,208,255,.3); }
  .sf-slot .sf-slot-main { flex:1; min-width:0; }
  .sf-slot .sf-slot-name { font-size:14px; color:var(--ink); }
  .sf-slot .sf-slot-sub { font-size:11px; color:var(--ink-mute); font-family:var(--mono); }
  .sf-slot.empty .sf-slot-name { color:var(--ink-mute); font-style:italic; }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1'); h.textContent = title; rootEl.appendChild(h);
  return rootEl;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// action -> default human-readable key. Sections group the grid.
const SECTIONS = [
  ['Flight', [
    ['Throttle forward / reverse', 'moveUp', '↑↓ / W S'],
    ['Steer (yaw + bank)', 'aim', '←→ / A D'],
    ['Aim weapons', 'aim', 'Mouse'],
    ['Boost', 'boost', 'Shift'],
    ['Fire group 1', 'fire1', 'LMB / Space'],
    ['Fire group 2', 'fire2', 'RMB'],
    ['Mine beam', 'mine', 'RMB on rock'],
    ['Auto-fire toggle', 'autoFire', 'F'],
    ['Select weapon group', 'weaponGroup', 'Q / E'],
  ]],
  ['Interface', [
    ['Cycle target', 'cycleTarget', 'Tab'],
    ['Dock', 'dock', 'Enter (when prompted)'],
    ['Pause', 'pause', 'ESC / P'],
    ['Star-map', 'map', 'M'],
    ['Tech tree', 'tech', 'T'],
    ['Missions / journal', 'missions', 'J'],
    ['Help', 'help', 'F1 / H'],
    ['Quick save', 'quicksave', 'F5'],
    ['Quick load', 'quickload', 'F9'],
  ]],
];

function keyLabel(binds, action, def) {
  const code = binds && binds[action];
  if (!code) return def;
  // Normalize common KeyboardEvent.code values to a friendly label.
  return String(code).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
}

export const helpScreen = {
  id: 'help',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Controls', 'sf-menu-wide');
    const body = el('div', 'sf-col');
    rootEl.appendChild(body);

    const foot = el('div', 'sf-foot');
    const close = el('button', 'sf-btn'); close.textContent = 'Close'; close.style.width = 'auto';
    close.addEventListener('click', () => nav(ctx, 'popScreen'));
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._body = body;
    this._render(ctx);
  },

  _render(ctx) {
    if (!this._body) return;
    const binds = ctx.state.settings.keybinds || {};
    this._body.innerHTML = '';
    SECTIONS.forEach(([heading, rows]) => {
      this._body.appendChild(el('h2', null, heading));
      const grid = el('div', 'sf-grid2');
      rows.forEach(([label, action, def]) => {
        grid.appendChild(el('div', 'k', keyLabel(binds, action, def)));
        grid.appendChild(el('div', 'v', label));
      });
      this._body.appendChild(grid);
    });
    this._body.appendChild(el('p', 'sf-muted', 'UI owns menu keys; flight system owns movement & fire (ARCHITECTURE §5.6).'));
  },

  onShow(ctx) { this._render(ctx); },
  onHide() {},
  refresh(ctx) { this._render(ctx); },
};
