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

export function parseUniverseSeed(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const seed = Number(text);
  return Number.isSafeInteger(seed) && seed > 0 && seed <= 0xffffffff ? seed : null;
}

function readNewGamePlusCandidate(ctx) {
  try {
    const save = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('save');
    return save && typeof save.getNewGamePlusCandidate === 'function'
      ? save.getNewGamePlusCandidate()
      : null;
  } catch (error) {
    return null;
  }
}

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
  /* ship history lore block: a quiet dossier note — hairline top rule, hanging
     italic quote, mono attribution. No alert-red box. */
  .sf-ng-lore { margin-top:14px; padding:13px 0 0; border:0; border-top:1px solid var(--mf-line-2);
    background:none; display:flex; flex-direction:column; gap:5px; }
  .sf-ng-lore__line { font-size:10px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.12em; text-transform:uppercase; }
  .sf-ng-lore__quote { margin-top:3px; font-family:var(--mf-ui); font-size:13px; color:#d7e0e7; font-style:italic; line-height:1.55; }
  .sf-ng-lore__attr { font-size:9.5px; color:var(--ink-mute); font-family:var(--mono); letter-spacing:.22em; text-align:right; }
  /* FIRST 15 MINUTES: hairline ledger cells, no tinted boxes. */
  .sf-ng-route { margin-top:6px; padding:0; border:0; background:none; display:grid; gap:10px; }
  .sf-ng-route__title { display:flex; align-items:center; gap:10px; font-family:var(--mono); font-size:10px;
    color:var(--ink-mute); letter-spacing:.22em; text-transform:uppercase; }
  .sf-ng-route__title::after { content:""; flex:1; height:1px; background:linear-gradient(90deg, var(--mf-line-2), transparent); }
  .sf-ng-route__steps { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 18px; }
  .sf-ng-route__step { min-width:0; border:0; border-top:1px solid var(--mf-line-2); background:none; padding:8px 0 0; }
  .sf-ng-route__step b { display:block; font-family:var(--mf-display); font-weight:600; font-size:12.5px;
    letter-spacing:.05em; color:var(--ink); margin-bottom:3px; overflow-wrap:anywhere; }
  .sf-ng-route__step span { display:block; font-size:11px; color:var(--ink-dim); line-height:1.4; overflow-wrap:anywhere; }
  @media (max-width:520px) { .sf-ng-route__steps { grid-template-columns:1fr; } }
  /* New Game keeps its decision actions in view while the detailed setup content scrolls. */
  .sf-menu.sf-ng-shell { width:min(540px,calc(100vw - 32px)); min-width:0; height:min(88vh,820px);
    max-height:calc(100vh - 24px); padding:0; gap:0; overflow:hidden; }
  .sf-ng-header { flex:0 0 auto; margin:0; padding:22px 32px 15px;
    border-bottom:1px solid var(--mf-line-1); }
  .sf-menu .sf-ng-body { flex:1 1 auto; min-height:0; overflow-x:hidden; overflow-y:auto;
    display:flex; flex-direction:column; gap:15px; padding:18px 32px 20px; scrollbar-gutter:stable; }
  .sf-menu .sf-ng-footer { flex:0 0 auto; margin:0; padding:14px 32px 18px;
    border-top:1px solid var(--mf-line-1); background:rgba(6,9,13,.55); }
  /* Authored starter portrait: film-frame treatment — inner hairline frame, bottom
     scrim, and a mono caption. A pre-rendered production view avoids decoding the
     flight GLB in a second WebGL context while preserving the exact ship identity. */
  .sf-ng-preview { position: relative; flex: 0 0 auto; height: 190px; margin: 4px 0 2px; border: 1px solid var(--mf-line-2);
    border-radius: 2px; overflow: hidden; background: radial-gradient(ellipse at 50% 72%, #141a22, #070a0e 82%); }
  .sf-ng-preview::before { content:""; position:absolute; inset:7px; border:1px solid rgba(94,205,235,.22);
    pointer-events:none; z-index:1; }
  .sf-ng-preview::after { content:""; position:absolute; inset:0;
    background:linear-gradient(180deg, transparent 58%, rgba(4,7,11,.78) 100%); pointer-events:none; }
  .sf-ng-preview__still { width: 100%; height: 100%; display: block; object-fit: cover; object-position: 50% 49%; }
  .sf-ng-preview__cap { position:absolute; left:14px; bottom:10px; z-index:2; font-family:var(--mono);
    font-size:9px; letter-spacing:.24em; text-transform:uppercase; color:rgba(157,220,240,.9); }
  .sf-ng-legacy { display:grid; gap:9px; padding:12px 0; border-top:1px solid var(--mf-line-2);
    border-bottom:1px solid var(--mf-line-2); }
  .sf-ng-legacy__toggle { display:flex; align-items:center; gap:9px; color:var(--ink); font-family:var(--mf-display);
    font-size:13px; letter-spacing:.04em; cursor:pointer; }
  .sf-ng-legacy__toggle input { margin:0; }
  .sf-ng-legacy__meta { font-family:var(--mono); color:var(--ink-mute); font-size:9.5px;
    letter-spacing:.1em; line-height:1.5; text-transform:uppercase; }
  .sf-ng-legacy__select { width:100%; }
  /* Registry stats: hairline-ruled ledger; redacted entries get the marker-block treatment. */
  .sf-menu .sf-ng-body .sf-grid2 { gap:0 20px; font-size:12.5px; }
  .sf-menu .sf-ng-body .sf-grid2 .k { font-family:var(--mono); font-size:9.5px; letter-spacing:.16em;
    text-transform:uppercase; color:var(--ink-mute); padding:5px 0; border-bottom:1px solid rgba(148,178,205,.08); }
  .sf-menu .sf-ng-body .sf-grid2 .v { color:var(--ink); padding:5px 0; border-bottom:1px solid rgba(148,178,205,.08); }
  .sf-menu .sf-ng-body .sf-grid2 .v.v--redacted { font-family:var(--mono); font-size:11px; letter-spacing:.1em;
    color:var(--ink-mute); background:linear-gradient(90deg, rgba(233,239,244,.07), rgba(233,239,244,.02)); padding-left:7px; }
  /* Warmup veil (spec2/03 §3): the Launch disabled-state never shows >300ms — async warmup
     happens behind this veil, not a bare disabled button. */
  .sf-ng-warmup { position:absolute; inset:0; display:flex; flex-direction:column; gap:12px;
    align-items:center; justify-content:center; background:rgba(4,7,11,.94); border-radius:3px;
    opacity:0; pointer-events:none; transition:opacity .15s ease; z-index:5; }
  .sf-ng-warmup.open { opacity:1; pointer-events:auto; }
  .sf-ng-warmup__spin { width:22px; height:22px; border-radius:50%; border:1px solid var(--mf-line-2);
    border-top-color:var(--accent); animation:sf-ng-spin .8s linear infinite; }
  @keyframes sf-ng-spin { to { transform:rotate(360deg); } }
  .sf-ng-warmup__txt { font-family:var(--mono); font-size:10px; letter-spacing:.24em;
    color:var(--ink-dim); text-transform:uppercase; }
  /* First-run splash (spec2/03 §3): full-screen black, 2.5s, single line. */
  .sf-firstrun-splash { position:fixed; inset:0; z-index:3200; background:#000; display:flex;
    align-items:center; justify-content:center; opacity:0; transition:opacity .5s ease;
    pointer-events:auto; }
  .sf-firstrun-splash.open { opacity:1; }
  .sf-firstrun-splash__line { font-family:"IBM Plex Mono","Consolas",ui-monospace,monospace;
    font-size:13px; letter-spacing:.14em;
    color:#dfe7ec; text-align:center; max-width:80vw; line-height:1.7; text-transform:sentence; }
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

    // New Run+ is opt-in and read-only until Launch. The save owner revalidates this exact slot and
    // selection at the transition boundary; the UI never copies a whole prior run into the event.
    const newGamePlusCandidate = readNewGamePlusCandidate(ctx);
    let legacyToggle = null;
    let legacySelect = null;
    if (newGamePlusCandidate) {
      const legacy = el('section', 'sf-ng-legacy');
      legacy.setAttribute('aria-labelledby', 'sf-ng-legacy-label');
      const toggleLabel = el('label', 'sf-ng-legacy__toggle');
      legacyToggle = el('input');
      legacyToggle.type = 'checkbox';
      legacyToggle.id = 'sf-ng-legacy-enabled';
      toggleLabel.appendChild(legacyToggle);
      const toggleText = el('span', null, 'New Run+');
      toggleText.id = 'sf-ng-legacy-label';
      toggleLabel.appendChild(toggleText);
      legacy.appendChild(toggleLabel);
      const grudgeCount = Number(newGamePlusCandidate.grudgeCount) || 0;
      const meta = el(
        'div',
        'sf-ng-legacy__meta',
        `${newGamePlusCandidate.sourceEndingTitle} · keep one item · ${grudgeCount} unresolved hunter ${grudgeCount === 1 ? 'grudge' : 'grudges'}`,
      );
      meta.id = 'sf-ng-legacy-desc';
      legacy.appendChild(meta);
      const keepsakeLabel = el('label', null, 'Carried keepsake');
      keepsakeLabel.htmlFor = 'sf-ng-legacy-keepsake';
      legacy.appendChild(keepsakeLabel);
      legacySelect = el('select', 'sf-ng-legacy__select');
      legacySelect.id = 'sf-ng-legacy-keepsake';
      legacySelect.disabled = true;
      legacySelect.setAttribute('aria-describedby', 'sf-ng-legacy-desc');
      for (const item of newGamePlusCandidate.keepsakes || []) {
        const option = el('option', null, `${item.unique ? 'RELIC · ' : ''}${item.name} · ${item.size || '?'} ${item.slotType}`);
        option.value = item.defId;
        legacySelect.appendChild(option);
      }
      legacyToggle.addEventListener('change', () => { legacySelect.disabled = !legacyToggle.checked; });
      legacy.appendChild(legacySelect);
      body.appendChild(legacy);
    }

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
    previewWrap.appendChild(el('span', 'sf-ng-preview__cap', 'Kestrel hull · Tessera — impound lot 7'));
    body.appendChild(previewWrap);
    const ship = starterShip(ctx);
    const grid = el('div', 'sf-grid2');
    const addStat = (k, v, vCls) => {
      grid.appendChild(el('div', 'k', k));
      grid.appendChild(el('div', vCls ? 'v ' + vCls : 'v', v));
    };
    addStat('Designation', 'TESSERA');
    addStat('Registry', 'VHL-4471-T');
    addStat('Hull', ship ? String(ship.hull) : '120');
    addStat('Shield', ship ? String(ship.shield) : '40');
    addStat('Cargo', (ship ? ship.cargo : 40) + ' u');
    addStat('Prev. Operator', 'REDACTED — INCIDENT 7741', 'v--redacted');
    addStat('Crew Status', 'NO SURVIVORS ON RECORD', 'v--redacted');
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
      seed.disabled = launching;
      if (legacyToggle) legacyToggle.disabled = launching;
      if (legacySelect) legacySelect.disabled = launching || !legacyToggle.checked;
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
      const rawSeed = parseUniverseSeed(seed.value);
      const seedOpt = rawSeed == null ? {} : { seed: rawSeed };
      const newGamePlusOpt = legacyToggle && legacyToggle.checked && legacySelect && legacySelect.value
        ? { newGamePlus: { slot: newGamePlusCandidate.sourceSlot, keepsakeId: legacySelect.value } }
        : {};
      // First-run splash (spec2/03 §3): a single full-screen line on black, 2.5s, then B0.
      try { showFirstRunSplash(ctx); } catch (e) { /* non-blocking */ }
      ctx.bus.emit('game:new', {
        name: pilot,
        shipId: STARTER_SHIP,
        difficulty: diff.value,
        ...seedOpt,
        ...newGamePlusOpt,
      });
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
