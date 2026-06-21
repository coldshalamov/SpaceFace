// New Game screen (ARCHITECTURE §1.3 step 7, §5; design/specs/09).
// Pilot name + starter-ship (Kestrel) preview + difficulty -> emit game:new {name,shipId,difficulty}.
// The save system handles game:new (newGame()), seeds GameState and switches to flight.

const STYLE_ID = 'sf-menu-style';
const STARTER_SHIP = 'ship_kestrel';
const DIFFICULTIES = [
  ['casual', 'Casual', 'Damage x0.7, prices x0.9, no rep decay.'],
  ['standard', 'Standard', 'The baseline experience.'],
  ['veteran', 'Veteran', 'Damage x1.4, prices x1.15.'],
  ['ironman', 'Ironman', 'x1.4, single save slot, permadeath.'],
];

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
  /* ship history lore block on new game screen */
  .sf-ng-lore { margin-top:10px; padding:10px 12px; border-left:2px solid var(--danger);
    background:rgba(255,84,112,.04); border-radius:0 5px 5px 0; display:flex; flex-direction:column; gap:4px; }
  .sf-ng-lore__line { font-size:11px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.06em; }
  .sf-ng-lore__quote { font-size:12px; color:var(--ink); font-style:italic; line-height:1.5; }
  .sf-ng-lore__attr { font-size:10px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.1em; text-align:right; }
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

function starterShip(ctx) {
  const ships = ctx.state.content && ctx.state.content.ships;
  if (Array.isArray(ships)) return ships.find((s) => s.id === STARTER_SHIP) || null;
  if (ships && typeof ships === 'object') return ships[STARTER_SHIP] || null;
  return null;
}

let refs = null;

export const newGameScreen = {
  id: 'newGame',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'New Game', 'sf-menu-narrow');
    rootEl.classList.remove('sf-menu-narrow');
    rootEl.style.width = '420px';

    // Pilot name
    const nameRow = el('div', 'sf-row');
    nameRow.appendChild(el('label', null, 'Pilot name'));
    const nameCtl = el('div', 'sf-ctl');
    const name = el('input'); name.type = 'text'; name.maxLength = 20; name.value = 'Wren'; name.style.flex = '1';
    nameCtl.appendChild(name); nameRow.appendChild(nameCtl); rootEl.appendChild(nameRow);

    // Difficulty
    const diffRow = el('div', 'sf-row');
    diffRow.appendChild(el('label', null, 'Difficulty'));
    const diffCtl = el('div', 'sf-ctl');
    const diff = el('select');
    DIFFICULTIES.forEach(([val, txt]) => { const o = el('option', null, txt); o.value = val; if (val === 'standard') o.selected = true; diff.appendChild(o); });
    diffCtl.appendChild(diff); diffRow.appendChild(diffCtl); rootEl.appendChild(diffRow);
    const diffDesc = el('p', 'sf-muted', '');
    rootEl.appendChild(diffDesc);
    const setDesc = () => { const d = DIFFICULTIES.find((x) => x[0] === diff.value); diffDesc.textContent = d ? d[2] : ''; };
    diff.addEventListener('change', setDesc); setDesc();

    // Starter ship preview — ship identity comes first, then stats.
    // The Tessera has a history. The player should feel it before they click Launch.
    rootEl.appendChild(el('h2', null, 'Starting Ship'));
    const ship = starterShip(ctx);
    const grid = el('div', 'sf-grid2');
    const addStat = (k, v) => { grid.appendChild(el('div', 'k', k)); grid.appendChild(el('div', 'v', v)); };
    addStat('Designation', 'TESSERA');
    addStat('Registry', 'VHL-4471-T');
    addStat('Hull', ship ? String(ship.hull) : '120');
    addStat('Shield', ship ? String(ship.shield) : '40');
    addStat('Cargo', (ship ? ship.cargo : 40) + ' u');
    addStat('Prev. Operator', 'REDACTED — INCIDENT 7741');
    addStat('Crew Status', 'NO SURVIVORS ON RECORD');
    addStat('Credits', '5,000 cr');
    rootEl.appendChild(grid);

    // The friend's favor, in two lines. No cutscene. Just the facts.
    const lore = el('div', 'sf-ng-lore');
    lore.innerHTML =
      '<span class="sf-ng-lore__line">Impounded 14 months. Nobody touched it.</span>' +
      '<span class="sf-ng-lore__quote">“She’s yours. Don’t ask what happened to the last crew.”</span>' +
      '<span class="sf-ng-lore__attr">— KAEL</span>';
    rootEl.appendChild(lore);

    // Foot: Back / Launch
    const foot = el('div', 'sf-foot');
    const back = el('button', 'sf-btn'); back.textContent = 'Back'; back.style.width = 'auto';
    back.addEventListener('click', () => nav(ctx, 'popScreen'));
    const launch = el('button', 'sf-btn'); launch.textContent = 'Launch'; launch.style.width = 'auto';
    launch.addEventListener('click', () => {
      const pilot = (name.value || '').trim() || 'Pilot';
      ctx.bus.emit('game:new', { name: pilot, shipId: STARTER_SHIP, difficulty: diff.value });
    });
    foot.appendChild(back); foot.appendChild(launch);
    rootEl.appendChild(foot);

    refs = { name };
  },

  onShow() { if (refs && refs.name) try { refs.name.focus(); refs.name.select(); } catch (e) {} },
  onHide() {},
  refresh() {},
};
