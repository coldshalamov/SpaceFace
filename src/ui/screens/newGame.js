// New Game screen (ARCHITECTURE §1.3 step 7, §5; design/specs/09).
// Pilot name + starter-ship (Hitch / id ship_kestrel) preview + difficulty -> emit game:new.
// The save system handles game:new (newGame()), seeds GameState and switches to flight.
import { MODULES } from '../../data/modules.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { WEAPONS } from '../../data/weapons.js';
import { coreText } from '../localizedCoreCopy.js';

const STYLE_ID = 'sf-new-game-style';
const STARTER_SHIP = 'ship_kestrel';
const FITTABLE_BY_ID = new Map();
for (const item of [...WEAPONS, ...MODULES]) FITTABLE_BY_ID.set(item.id, item);
const DIFFICULTIES = [
  ['casual', 'Casual', 'Much softer combat for learning and QA.'],
  ['standard', 'Standard', 'Softer hits on you; slightly easier kills.'],
  ['veteran', 'Veteran', 'Full combat baseline. No damage padding.'],
  ['ironman', 'Ironman', 'Veteran combat. Death ends the run.'],
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
  // New Game–specific styles only. The shared menu fascia (plate, buttons, headings, slot
  // rows, form primitives) lives in styles/menu.css — previously a copy of that whole block
  // was pasted here and into every other menu screen.
  s.textContent = `
  /* ship history lore block on new game screen */
  .sf-ng-lore { margin-top:10px; padding:10px 12px; border-left:2px solid var(--danger);
    background:rgba(237,105,97,.05); border-radius:0 2px 2px 0; display:flex; flex-direction:column; gap:4px; }
  .sf-ng-lore__line { font-size:11px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.06em; }
  .sf-ng-lore__quote { font-size:12px; color:var(--ink); font-style:italic; line-height:1.5; }
  .sf-ng-lore__attr { font-size:10px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.1em; text-align:right; }
  .sf-ng-route { margin-top:10px; padding:10px 12px; border:1px solid var(--panel-edge); border-radius:2px;
    background:rgba(219,152,56,.05); display:grid; gap:8px; }
  .sf-ng-route__title { font-family:var(--mono); font-size:10px; color:var(--accent); letter-spacing:.14em; text-transform:uppercase; }
  .sf-ng-route__steps { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
  .sf-ng-route__step { min-width:0; border:1px solid rgba(219,152,56,.18); border-radius:2px; padding:7px 8px;
    background:rgba(12,14,16,.6); }
  .sf-ng-route__step b { display:block; font-size:12px; color:var(--ink); margin-bottom:2px; overflow-wrap:anywhere; }
  .sf-ng-route__step span { display:block; font-size:11px; color:var(--ink-dim); line-height:1.35; overflow-wrap:anywhere; }
  @media (max-width:520px) { .sf-ng-route__steps { grid-template-columns:1fr; } }
  /* New Game keeps its decision actions in view while the detailed setup content scrolls. */
  .sf-menu.sf-ng-shell { width:min(420px,calc(100vw - 32px)); min-width:0; height:min(88vh,820px);
    max-height:calc(100vh - 24px); padding:0; gap:0; overflow:hidden; }
  .sf-ng-header { flex:0 0 auto; margin:0; padding:20px 30px 14px;
    border-bottom:1px solid var(--panel-edge); }
  .sf-menu .sf-ng-body { flex:1 1 auto; min-height:0; overflow-x:hidden; overflow-y:auto;
    display:flex; flex-direction:column; gap:14px; padding:16px 30px; scrollbar-gutter:stable; }
  .sf-menu .sf-ng-footer { flex:0 0 auto; margin:0; padding:14px 30px 18px;
    border-top:1px solid var(--panel-edge); background:rgba(12,14,15,.96); }
  /* Authored starter portrait. A pre-rendered production view avoids decoding the flight GLB in a
     second WebGL context while preserving the exact ship identity and material work. */
  .sf-ng-preview { position: relative; flex: 0 0 auto; height: 150px; margin: 6px 0 10px; border: 1px solid var(--panel-edge);
    border-radius: 2px; overflow: hidden; background: radial-gradient(ellipse at 50% 70%, #171a1d, #0a0c0d 80%); }
  .sf-ng-preview__still { width: 100%; height: 100%; display: block; object-fit: cover; object-position: 50% 49%; }
  /* Warmup veil (spec2/03 §3): the Launch disabled-state never shows >300ms — async warmup
     happens behind this veil, not a bare disabled button. */
  .sf-ng-warmup { position:absolute; inset:0; display:flex; flex-direction:column; gap:12px;
    align-items:center; justify-content:center; background:rgba(11,13,14,.92); border-radius:3px;
    opacity:0; pointer-events:none; transition:opacity .15s ease; z-index:5; }
  .sf-ng-warmup.open { opacity:1; pointer-events:auto; }
  .sf-ng-warmup__spin { width:22px; height:22px; border-radius:50%; border:2px solid var(--panel-edge);
    border-top-color:var(--accent); animation:sf-ng-spin .8s linear infinite; }
  @keyframes sf-ng-spin { to { transform:rotate(360deg); } }
  .sf-ng-warmup__txt { font-family:var(--mono); font-size:11px; letter-spacing:.18em;
    color:var(--ink-dim); text-transform:uppercase; }
  /* First-run splash (spec2/03 §3): full-screen black, 2.5s, single line. */
  .sf-firstrun-splash { position:fixed; inset:0; z-index:3200; background:#000; display:flex;
    align-items:center; justify-content:center; opacity:0; transition:opacity .5s ease;
    pointer-events:auto; }
  .sf-firstrun-splash.open { opacity:1; }
  .sf-firstrun-splash__line { font-family:"IBM Plex Mono","Consolas",ui-monospace,monospace;
    font-size:15px; letter-spacing:.16em;
    color:#f1ede2; text-align:center; max-width:80vw; line-height:1.6; text-transform:sentence; }
  `;
  document.head.appendChild(s);
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
  rootEl.dataset.stamp = 'CONTRACT INTAKE / NEW OPERATOR';
  const header = document.createElement('header'); header.className = 'sf-ng-header';
  const h = document.createElement('h1'); h.textContent = title; header.appendChild(h);
  rootEl.appendChild(header);
  return rootEl;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

// First-run splash (spec2/03 §3): after START, a single full-screen line on black, 2.5s, then B0.
// Fires only once per profile (localStorage flag), so returning players skip straight into flight.
const FIRST_RUN_LINE = 'Helios System. Third shift. The manifest is wrong.';
const FIRST_RUN_FLAG = 'sf.firstRunIntroSeen';
function showFirstRunSplash(ctx) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  if (localStorage.getItem(FIRST_RUN_FLAG)) {
    if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:done', { skipped: true });
    return; // already seen — no splash
  }
  localStorage.setItem(FIRST_RUN_FLAG, '1');
  if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:active', { line: FIRST_RUN_LINE });
  const splash = document.createElement('div');
  splash.className = 'sf-firstrun-splash';
  splash.setAttribute('role', 'status');
  splash.setAttribute('aria-live', 'polite');
  splash.setAttribute('aria-atomic', 'true');
  const line = document.createElement('div');
  line.className = 'sf-firstrun-splash__line';
  line.textContent = FIRST_RUN_LINE;
  splash.appendChild(line);
  (document.getElementById('ui-root') || document.body).appendChild(splash);
  // Fade in, hold ~2.5s, fade out, remove. The game boots underneath; B0 fires once the splash lifts.
  requestAnimationFrame(() => {
    splash.classList.add('open');
    setTimeout(() => {
      splash.classList.remove('open');
      setTimeout(() => {
        if (splash.parentNode) splash.remove();
        if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:done', { skipped: false });
      }, 600);
    }, 2500);
  });
}

function starterShip(ctx) {
  const ships = ctx.state.content && ctx.state.content.ships;
  if (Array.isArray(ships)) return ships.find((s) => s.id === STARTER_SHIP) || null;
  if (ships && typeof ships === 'object') return ships[STARTER_SHIP] || null;
  return null;
}

function starterLoadoutRows() {
  const labels = {
    weapon: 'Primary',
    mining: 'Mining',
    engine: 'Drive',
    shield: 'Shield',
    cargo: 'Cargo',
    utility: 'Utility',
  };
  return (NEW_GAME.fittedModules || [])
    .map((id) => FITTABLE_BY_ID.get(id))
    .filter(Boolean)
    .map((def) => [labels[def.slotType] || def.slotType, def.name]);
}

let refs = null;

export const newGameScreen = {
  id: 'newGame',

  mount(rootEl, ctx) {
    injectStyle();
    if (refs && refs.unsubStartFailed) {
      try { refs.unsubStartFailed(); } catch (e) {}
    }
    shell(rootEl, coreText('newGame'), 'sf-menu-narrow');
    rootEl.classList.remove('sf-menu-narrow');
    rootEl.classList.add('sf-ng-shell');
    rootEl.style.width = '';

    const body = el('div', 'sf-ng-body');
    rootEl.appendChild(body);

    // Pilot name
    const nameRow = el('div', 'sf-row');
    const nameLabel = el('label', null, coreText('pilotName'));
    nameLabel.htmlFor = 'sf-ng-pilot-name';
    nameRow.appendChild(nameLabel);
    const nameCtl = el('div', 'sf-ctl');
    const name = el('input'); name.id = 'sf-ng-pilot-name'; name.type = 'text'; name.maxLength = 20; name.value = 'Wren'; name.style.flex = '1';
    nameCtl.appendChild(name); nameRow.appendChild(nameCtl); body.appendChild(nameRow);

    // Difficulty
    const diffRow = el('div', 'sf-row');
    const diffLabel = el('label', null, coreText('difficulty'));
    diffLabel.htmlFor = 'sf-ng-difficulty';
    diffRow.appendChild(diffLabel);
    const diffCtl = el('div', 'sf-ctl');
    const diff = el('select');
    diff.id = 'sf-ng-difficulty';
    DIFFICULTIES.forEach(([val, txt]) => { const o = el('option', null, txt); o.value = val; if (val === 'standard') o.selected = true; diff.appendChild(o); });
    diffCtl.appendChild(diff); diffRow.appendChild(diffCtl); body.appendChild(diffRow);
    const diffDesc = el('p', 'sf-muted', '');
    body.appendChild(diffDesc);
    const setDesc = () => { const d = DIFFICULTIES.find((x) => x[0] === diff.value); diffDesc.textContent = d ? d[2] : ''; };
    diff.addEventListener('change', setDesc); setDesc();

    // Seed. A real player feature — a shareable, reproducible universe — and the ONLY way to make
    // the run's procedural content repeatable. Board offers are drawn from
    // `hash32(state.meta.seed, ...)` (missions.js `_generateOffers`), so the seed already decides
    // which contracts, commodities and destinations a save will ever see; until now nothing could
    // set it, and `resetRunState` fell back to `Date.now() ^ random`, re-rolling every boot.
    //
    // Blank means "surprise me" and keeps the existing random behaviour, so the default experience
    // is unchanged. The plumbing below it already existed end to end — `game:new` carries opts,
    // `resetRunState` honours `opts.seed` (main.js:589) — only this affordance was missing.
    const seedRow = el('div', 'sf-row');
    const seedLabel = el('label', null, 'Universe seed');
    seedLabel.htmlFor = 'sf-ng-seed';
    seedRow.appendChild(seedLabel);
    const seedCtl = el('div', 'sf-ctl');
    const seed = el('input');
    seed.id = 'sf-ng-seed';
    seed.type = 'text';
    seed.inputMode = 'numeric';
    seed.maxLength = 10;
    seed.placeholder = 'Random';
    seed.setAttribute('aria-describedby', 'sf-ng-seed-desc');
    seed.style.flex = '1';
    seedCtl.appendChild(seed); seedRow.appendChild(seedCtl); body.appendChild(seedRow);
    const seedDesc = el('p', 'sf-muted', 'Leave blank for a random universe. The same seed always produces the same contracts and markets.');
    seedDesc.id = 'sf-ng-seed-desc';
    body.appendChild(seedDesc);

    const route = el('div', 'sf-ng-route');
    route.setAttribute('aria-label', coreText('firstMinutes'));
    route.innerHTML =
      '<div class="sf-ng-route__title">' + coreText('firstMinutes') + '</div>' +
      '<div class="sf-ng-route__steps">' +
        '<div class="sf-ng-route__step"><b>Wake at the beacon</b><span>Thrust to the beacon. One verb at a time.</span></div>' +
        '<div class="sf-ng-route__step"><b>Tether the derelict</b><span>Latch, winch, cut. The vacuum shows itself.</span></div>' +
        '<div class="sf-ng-route__step"><b>Mine the first seam</b><span>Pulse, beam the bright seams, ride the heat.</span></div>' +
        '<div class="sf-ng-route__step"><b>Dock and pick work</b><span>Sell at Helios, then choose haul, bounty, or survey.</span></div>' +
      '</div>';
    body.appendChild(route);

    // Starter ship preview — ship identity comes first, then stats.
    // The Tessera has a history. The player should feel it before they click Launch.
    body.appendChild(el('h2', null, 'Starting Ship'));
    // A stable authored source render keeps New Game responsive and avoids loading the same 20 MiB
    // flight hull into a second renderer. Flight still admits the full production Kestrel.
    const previewWrap = el('div', 'sf-ng-preview');
    const previewStill = el('img', 'sf-ng-preview__still');
    previewStill.src = 'assets/ships/release/ui/kestrel_v5_starter_portrait.png';
    previewStill.alt = 'Authored three-quarter view of the Kestrel starter ship';
    previewStill.decoding = 'async';
    previewStill.fetchPriority = 'high';
    previewStill.draggable = false;
    previewWrap.appendChild(previewStill);
    body.appendChild(previewWrap);
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
    for (const [slot, name] of starterLoadoutRows()) addStat(slot, name);
    body.appendChild(grid);

    // The friend's favor, in two lines. No cutscene. Just the facts.
    const lore = el('div', 'sf-ng-lore');
    lore.innerHTML =
      '<span class="sf-ng-lore__line">Impounded 14 months. Nobody touched it.</span>' +
      '<span class="sf-ng-lore__quote">“She’s yours. Don’t ask what happened to the last crew.”</span>' +
      '<span class="sf-ng-lore__attr">— KAEL</span>';
    body.appendChild(lore);

    // Foot: Back / Launch
    const foot = el('footer', 'sf-foot sf-ng-footer');
    const back = el('button', 'sf-btn'); back.textContent = coreText('back'); back.style.width = 'auto';
    back.addEventListener('click', () => nav(ctx, 'popScreen'));
    const launch = el('button', 'sf-btn sf-btn--primary'); launch.textContent = coreText('launch'); launch.style.width = 'auto';
    let launching = false;
    let veilTimer = null;
    // The disabled state must never be the visible resting state for >300ms (spec2/03 §3): async
    // warmup happens behind a veil (spinner overlay), not a bare disabled button.
    const showWarmupVeil = () => {
      let veil = rootEl.querySelector('.sf-ng-warmup');
      if (!veil) {
        veil = el('div', 'sf-ng-warmup');
        veil.innerHTML = '<span class="sf-ng-warmup__spin"></span><span class="sf-ng-warmup__txt">Launching</span>';
        rootEl.appendChild(veil);
      }
      veil.classList.add('open');
    };
    const hideWarmupVeil = () => {
      const veil = rootEl.querySelector('.sf-ng-warmup');
      if (veil) veil.classList.remove('open');
    };
    const setLaunching = (active) => {
      launching = !!active;
      launch.disabled = launching;
      back.disabled = launching;
      name.disabled = launching;
      diff.disabled = launching;
      launch.textContent = launching ? coreText('launching') : coreText('launch');
      if (launching) {
        // Veil the warmup after 300ms so the disabled button itself is never the resting state.
        if (veilTimer) clearTimeout(veilTimer);
        veilTimer = setTimeout(showWarmupVeil, 300);
      } else {
        if (veilTimer) { clearTimeout(veilTimer); veilTimer = null; }
        hideWarmupVeil();
      }
    };
    const restoreLaunch = () => setLaunching(false);
    const unsubStartFailed = ctx.bus.on('game:startFailed', restoreLaunch);
    launch.addEventListener('click', () => {
      if (launching) return;
      setLaunching(true);
      const pilot = (name.value || '').trim() || 'Pilot';
      // Only forward a seed when the player actually supplied a usable one. `resetRunState`
      // requires a finite positive number and otherwise randomises, so passing NaN or 0 through
      // would silently mean "random" while looking deliberate.
      const rawSeed = Number.parseInt(String(seed.value || '').trim(), 10);
      const seedOpt = Number.isFinite(rawSeed) && rawSeed > 0 ? { seed: rawSeed >>> 0 } : {};
      // First-run splash (spec2/03 §3): a single full-screen line on black, 2.5s, then B0.
      try { showFirstRunSplash(ctx); } catch (e) { /* non-blocking */ }
      ctx.bus.emit('game:new', { name: pilot, shipId: STARTER_SHIP, difficulty: diff.value, ...seedOpt });
    });
    foot.appendChild(back); foot.appendChild(launch);
    rootEl.appendChild(foot);

    refs = { name, launch, setLaunching, unsubStartFailed, ctx };
  },

  onShow() {
    if (refs && refs.setLaunching) refs.setLaunching(false);
    if (refs && refs.name) try { refs.name.focus(); refs.name.select(); } catch (e) {}
  },
  onHide() {},
  refresh() {},
};
