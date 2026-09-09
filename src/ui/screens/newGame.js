// New Game screen (ARCHITECTURE §1.3 step 7, §5; design/specs/09).
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, new game): the sky; the starter
// hull lit in its rig on the stage with its name and one sentence saying how it plays; the
// difficulty as four words in a row with the live one bright and its sentence beneath; the pilot's
// name as an underlined field; the seed in fine print; New Run+ as a two-word toggle when it applies;
// the loadout as four quiet words; one primary word at the bottom: Launch.
// Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS.
// Pilot name + starter ship (Hitch / id ship_kestrel) + difficulty -> emit game:new. The save system
// handles game:new (newGame()), seeds GameState and switches to flight.
import { MODULES } from '../../data/modules.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { WEAPONS } from '../../data/weapons.js';
import { coreText } from '../localizedCoreCopy.js';
import { el, words, settle, cue } from '../kit/index.js';
import { createStageHull } from './stageHull.js';

const STARTER_SHIP = 'ship_kestrel';
const FITTABLE_BY_ID = new Map();
for (const item of [...WEAPONS, ...MODULES]) FITTABLE_BY_ID.set(item.id, item);
const DIFFICULTIES = [
  ['casual', 'Casual', 'Much softer combat for learning and QA.'],
  ['standard', 'Standard', 'Softer hits on you; slightly easier kills.'],
  ['veteran', 'Veteran', 'Full combat baseline. No damage padding.'],
  ['ironman', 'Ironman', 'Veteran combat. Death ends the run.'],
];
const DEFAULT_DIFFICULTY = 'standard';
// The hull's one sentence. No ship def carries a blurb or tagline today (audited 2026-09-07), so the
// task file's literal stands until the ship data grows one.
const STARTER_BLURB = 'Turns wide. Sluggish under load. Stops badly.';
// The sheet's stage zoom for the new-game hull (Task B §1.1).
const STAGE_ZOOM = 1.1;

export function parseUniverseSeed(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const seed = Number(text);
  return Number.isSafeInteger(seed) && seed > 0 && seed <= 0xffffffff ? seed : null;
}

function randomSeedText(ctx) {
  // A fresh seed for the "New seed" word. Cosmetic UI randomness (the run's seed is whatever the
  // field says when Launch is pressed), so Math.random is fine here; state.rng belongs to the sim.
  const rng = ctx && ctx.state && typeof ctx.state.rng === 'function' ? ctx.state.rng : Math.random;
  return String(1 + Math.floor(rng() * 0xfffffffe));
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

// First-run splash (spec2/03 §3): after START, a single full-screen line on black, 2.5s, then B0.
// Fires only once per profile (localStorage flag), so returning players skip straight into flight.
// It is a cinematic, not a screen: its rules live in styles/ui.css beside the Continue veil.
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
  // Fade in, hold ~2.5s, fade out, remove. Hold/fade clocks start now; rAF only adds the
  // visible class so a stalled frame cannot gate the opening tutorial.
  const finish = () => {
    if (splash.parentNode) splash.remove();
    if (ctx && ctx.bus) ctx.bus.emit('ui:firstRunSplash:done', { skipped: false });
  };
  requestAnimationFrame(() => splash.classList.add('open'));
  setTimeout(() => {
    splash.classList.remove('open');
    setTimeout(finish, 600);
  }, 2500);
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

// The first fifteen minutes (spec2/03 §1): the four beats a Steam-demo player should know before
// Launch. Rendered as four static kit rows under the loadout (check-new-game-first-run-rail).
const FIRST_MINUTES = [
  ['Wake at the beacon', 'Thrust to the beacon. One verb at a time.'],
  ['Tether the derelict', 'Latch, winch, cut. The vacuum shows itself.'],
  ['Mine the first seam', 'Pulse, beam the bright seams, ride the heat.'],
  ['Dock and pick work', 'Sell at Helios, then choose haul, bounty, or survey.'],
];

/** A form field: a label at body size 62 % and its control beneath, separated from the next by a hairline. */
function field(labelText, htmlFor) {
  const wrap = el('div');
  // A <label> only where it labels one control; a group of words gets a plain heading it points at.
  const label = el(htmlFor ? 'label' : 'div', 'k-t-body k-62', labelText);
  if (htmlFor) label.htmlFor = htmlFor;
  // The label sits on its own line above the control (a block wrapper; the kit's inputs are inline).
  const line = el('div');
  line.appendChild(label);
  wrap.appendChild(line);
  return { wrap, label };
}

let refs = null;

export const newGameScreen = {
  id: 'newGame',

  mount(rootEl, ctx) {
    if (refs && refs.unsubStartFailed) {
      try { refs.unsubStartFailed(); } catch (e) {}
    }
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', coreText('newGame'));

    // Title. `.sf-ng-header` is an inert hook the layout probe measures.
    const title = el('header', 'k-title sf-ng-header');
    title.appendChild(el('h1', 'k-display k-t-title', 'New game'));
    title.appendChild(el('p', 'k-t-emph k-62', 'One hull, one contract, the whole sky.'));
    rootEl.appendChild(title);

    // The form hangs on the left. `.sf-ng-body` is the scrolling region the layout probe measures.
    const body = el('div', 'k-hang sf-ng-body');
    rootEl.appendChild(body);
    // Launch guard (spec2/03 §3): one async start at a time. Set by setLaunching below.
    let launching = false;

    // Pilot name. spellcheck/autocapitalize off: a pilot callsign is not prose — the browser's red
    // squiggle and capitalization suggestions are noise on a name field.
    const pilot = field(coreText('pilotName'), 'sf-ng-pilot-name');
    const name = el('input', 'k-input'); name.id = 'sf-ng-pilot-name'; name.type = 'text'; name.maxLength = 20; name.value = 'Wren';
    name.spellcheck = false; name.autocapitalize = 'off'; name.autocomplete = 'off';
    pilot.wrap.appendChild(name);
    body.appendChild(pilot.wrap);
    body.appendChild(el('hr', 'k-rule'));

    // Difficulty: four words in a row, the live one bright, its sentence beneath. A hidden <select>
    // (#sf-ng-difficulty) mirrors the choice for the checks and probes that read it.
    const diffField = field(coreText('difficulty'));
    diffField.label.id = 'sf-ng-difficulty-label';
    const diff = el('select');
    diff.id = 'sf-ng-difficulty';
    diff.hidden = true; diff.tabIndex = -1; diff.setAttribute('aria-hidden', 'true');
    DIFFICULTIES.forEach(([val, txt]) => { const o = el('option', '', txt); o.value = val; if (val === DEFAULT_DIFFICULTY) o.selected = true; diff.appendChild(o); });
    const diffWords = words(DIFFICULTIES.map(([val, txt]) => ({ action: 'difficulty:' + val, label: txt })), {
      row: true, size: 'body', ariaLabel: coreText('difficulty'),
      onPick: (action) => this._setDifficulty(action.slice('difficulty:'.length)),
    });
    diffWords.setAttribute('aria-labelledby', diffField.label.id);
    const diffDesc = el('p', 'k-sentence', '');
    diffDesc.id = 'sf-ng-difficulty-desc';
    diffWords.setAttribute('aria-describedby', diffDesc.id);
    diffField.wrap.appendChild(diffWords);
    diffField.wrap.appendChild(diff);
    diffField.wrap.appendChild(diffDesc);
    body.appendChild(diffField.wrap);
    body.appendChild(el('hr', 'k-rule'));

    // Seed. A real player feature — a shareable, reproducible universe — and the ONLY way to make
    // the run's procedural content repeatable. Board offers are drawn from
    // `hash32(state.meta.seed, ...)` (missions.js `_generateOffers`), so the seed already decides
    // which contracts, commodities and destinations a save will ever see. Blank means "surprise me"
    // and keeps the random behaviour; `game:new` carries opts and `resetRunState` honours `opts.seed`.
    const seedField = field('Universe seed', 'sf-ng-seed');
    const seedRow = el('div', 'k-words k-words--row');
    const seed = el('input', 'k-input k-t-fine');
    seed.id = 'sf-ng-seed';
    seed.type = 'text';
    seed.inputMode = 'numeric';
    seed.maxLength = 10;
    seed.placeholder = 'Random';
    seed.spellcheck = false; seed.autocomplete = 'off';
    seed.setAttribute('aria-describedby', 'sf-ng-seed-desc');
    const newSeed = el('button', 'k-word k-word--fine', 'New seed');
    newSeed.type = 'button'; newSeed.dataset.action = 'newSeed';
    newSeed.addEventListener('click', () => { if (launching) return; seed.value = randomSeedText(ctx); cue('confirm'); });
    seedRow.appendChild(seed); seedRow.appendChild(newSeed);
    seedField.wrap.appendChild(seedRow);
    const seedDesc = el('p', 'k-t-fine k-38', 'Leave blank for a random universe. The same seed always produces the same contracts and markets.');
    seedDesc.id = 'sf-ng-seed-desc';
    seedField.wrap.appendChild(seedDesc);
    body.appendChild(seedField.wrap);
    body.appendChild(el('hr', 'k-rule'));

    // New Run+ is opt-in and read-only until Launch. The save owner revalidates this exact slot and
    // selection at the transition boundary; the UI never copies a whole prior run into the event.
    const newGamePlusCandidate = readNewGamePlusCandidate(ctx);
    let legacyOn = false;
    let legacyWords = null;
    let legacySelect = null;
    if (newGamePlusCandidate) {
      const legacyField = field('New Run+');
      legacyField.label.id = 'sf-ng-legacy-label';
      legacyWords = words([
        { action: 'legacy:off', label: 'Off' },
        { action: 'legacy:on', label: 'On' },
      ], {
        row: true, size: 'body', ariaLabel: 'New Run+',
        onPick: (action) => {
          legacyOn = action === 'legacy:on';
          for (const b of legacyWords.querySelectorAll('.k-word')) b.setAttribute('aria-pressed', String((b.dataset.action === 'legacy:on') === legacyOn));
          legacySelect.disabled = !legacyOn || launching;
        },
      });
      legacyWords.setAttribute('aria-labelledby', legacyField.label.id);
      for (const b of legacyWords.querySelectorAll('.k-word')) b.setAttribute('aria-pressed', String(b.dataset.action === 'legacy:off'));
      legacyField.wrap.appendChild(legacyWords);
      const grudgeCount = Number(newGamePlusCandidate.grudgeCount) || 0;
      const meta = el('p', 'k-t-fine k-38',
        `${newGamePlusCandidate.sourceEndingTitle} · keep one item · ${grudgeCount} unresolved hunter ${grudgeCount === 1 ? 'grudge' : 'grudges'}`);
      meta.id = 'sf-ng-legacy-desc';
      legacyField.wrap.appendChild(meta);
      const keepsakeLabel = el('label', 'k-t-fine k-38', 'Carried keepsake');
      keepsakeLabel.htmlFor = 'sf-ng-legacy-keepsake';
      legacyField.wrap.appendChild(keepsakeLabel);
      legacySelect = el('select', 'k-select');
      legacySelect.id = 'sf-ng-legacy-keepsake';
      legacySelect.disabled = true;
      legacySelect.setAttribute('aria-describedby', 'sf-ng-legacy-desc');
      for (const item of newGamePlusCandidate.keepsakes || []) {
        const option = el('option', '', `${item.unique ? 'Relic · ' : ''}${item.name} · ${item.size || '?'} ${item.slotType}`);
        option.value = item.defId;
        legacySelect.appendChild(option);
      }
      legacyField.wrap.appendChild(legacySelect);
      body.appendChild(legacyField.wrap);
      body.appendChild(el('hr', 'k-rule'));
    }

    // Loadout: four quiet words (the module names). Not buttons — nothing here is chosen.
    const loadoutField = field('Loadout');
    const loadout = el('ul', 'k-words k-words--row');
    loadout.setAttribute('aria-label', 'Loadout');
    for (const [slot, moduleName] of starterLoadoutRows()) {
      const li = el('li');
      const word = el('span', 'k-t-body k-62', moduleName);
      word.setAttribute('aria-disabled', 'true');
      word.title = slot;
      li.appendChild(word);
      loadout.appendChild(li);
    }
    loadoutField.wrap.appendChild(loadout);
    body.appendChild(loadoutField.wrap);
    body.appendChild(el('hr', 'k-rule'));

    // The first fifteen minutes: four static rows under the loadout.
    const route = el('div', 'sf-ng-route');
    route.setAttribute('aria-label', coreText('firstMinutes'));
    route.appendChild(el('div', 'k-caps', coreText('firstMinutes')));
    const steps = el('ul', 'k-rows sf-ng-route__steps');
    steps.style.setProperty('--k-row-cols', 'minmax(0, 1fr)');
    for (const [beat, verb] of FIRST_MINUTES) {
      const row = el('li', 'k-row k-row--static sf-ng-route__step');
      const cell = el('div');
      cell.appendChild(el('span', 'k-row__name', beat));
      cell.appendChild(el('div', 'k-row__sub', verb));
      row.appendChild(cell);
      steps.appendChild(row);
    }
    route.appendChild(steps);
    body.appendChild(route);

    // The stage: the hull in its rig, its name and its one sentence bottom-left.
    const stage = el('div', 'k-stage');
    const caption = el('div', 'k-stage__foot');
    const ship = starterShip(ctx);
    caption.appendChild(el('h2', 'k-display k-t-sub', (ship && ship.name) || 'Hitch'));
    caption.appendChild(el('p', 'k-sentence', STARTER_BLURB));
    stage.appendChild(caption);
    rootEl.appendChild(stage);
    this.hull = createStageHull(stage, { rootEl, zoom: STAGE_ZOOM });

    // Foot: Back, then Launch (the one primary word) — Launch stays the LAST footer button because
    // the capture matrix, the atlas, the review probe and the localization check all reach it as
    // `.sf-ng-footer button:last`. Each is its own Tab stop. `.sf-ng-footer` / `.sf-ng-launch` are
    // inert hooks.
    const foot = el('footer', 'k-foot sf-ng-footer');
    const footWord = (action, label, extra) => {
      const b = el('button', 'k-word k-word--emph' + (extra ? ' ' + extra : ''), label);
      b.type = 'button'; b.dataset.action = action;
      foot.appendChild(b);
      return b;
    };
    const back = footWord('back', coreText('back'));
    const launch = footWord('launch', coreText('launch'), 'k-word--primary sf-ng-launch');
    launch.addEventListener('click', () => {
      if (launch.getAttribute('aria-disabled') === 'true') { cue('deny'); return; }
      cue('confirm'); this._launch(ctx);
    });
    back.addEventListener('click', () => {
      if (back.getAttribute('aria-disabled') === 'true') { cue('deny'); return; }
      cue('confirm'); nav(ctx, 'popScreen');
    });
    rootEl.appendChild(foot);

    rootEl.appendChild(el('div', 'k-fine', 'Casual, Standard and Veteran deaths use insurance respawn. Ironman ends the run.'));

    // The word reads "Launching..." while the run boots and restores on game:startFailed.
    const setLaunching = (active) => {
      launching = !!active;
      const setWord = (b, disabled) => { if (disabled) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); };
      setWord(launch, launching);
      setWord(back, launching);
      setWord(newSeed, launching);
      name.disabled = launching;
      seed.disabled = launching;
      for (const b of diffWords.querySelectorAll('.k-word')) setWord(b, launching);
      if (legacyWords) for (const b of legacyWords.querySelectorAll('.k-word')) setWord(b, launching);
      if (legacySelect) legacySelect.disabled = launching || !legacyOn;
      launch.textContent = launching ? coreText('launching') : coreText('launch');
    };
    const restoreLaunch = () => setLaunching(false);
    const unsubStartFailed = ctx.bus.on('game:startFailed', restoreLaunch);

    refs = {
      root: rootEl, title, body, stage, foot, name, seed, diff, diffWords, diffDesc, launch, back,
      setLaunching, unsubStartFailed, ctx,
      isLaunching: () => launching,
      legacy: () => ({ on: legacyOn, select: legacySelect, candidate: newGamePlusCandidate }),
    };
    this._setDifficulty(DEFAULT_DIFFICULTY, { silent: true });
  },

  _setDifficulty(value, { silent = false } = {}) {
    if (!refs) return;
    const d = DIFFICULTIES.find((x) => x[0] === value) || DIFFICULTIES.find((x) => x[0] === DEFAULT_DIFFICULTY);
    refs.diff.value = d[0];
    refs.diffDesc.textContent = d[2];
    for (const b of refs.diffWords.querySelectorAll('.k-word')) {
      const live = b.dataset.action === 'difficulty:' + d[0];
      b.setAttribute('aria-pressed', String(live));
      // The row's single Tab stop is the live word; the kit's roving focus takes over inside the row.
      b.tabIndex = live ? 0 : -1;
    }
    if (!silent) refs.diff.dispatchEvent(new Event('change', { bubbles: true }));
  },

  _launch(ctx) {
    if (!refs) return;
    const launching = refs.isLaunching();
    if (launching) return;
    refs.setLaunching(true);
    const pilot = (refs.name.value || '').trim() || 'Pilot';
    // Only forward a seed when the player actually supplied a usable one. `resetRunState`
    // requires a finite positive number and otherwise randomises, so passing NaN or 0 through
    // would silently mean "random" while looking deliberate.
    const rawSeed = parseUniverseSeed(refs.seed.value);
    const seedOpt = rawSeed == null ? {} : { seed: rawSeed };
    const legacy = refs.legacy();
    const newGamePlusOpt = legacy.on && legacy.select && legacy.select.value && legacy.candidate
      ? { newGamePlus: { slot: legacy.candidate.sourceSlot, keepsakeId: legacy.select.value } }
      : {};
    // First-run splash (spec2/03 §3): a single full-screen line on black, 2.5s, then B0.
    try { showFirstRunSplash(ctx); } catch (e) { /* non-blocking */ }
    ctx.bus.emit('game:new', {
      name: pilot,
      shipId: STARTER_SHIP,
      difficulty: refs.diff.value,
      ...seedOpt,
      ...newGamePlusOpt,
    });
  },

  onShow(ctx) {
    if (!refs) return;
    cue('open');
    refs.setLaunching(false);
    try {
      settle(refs.title, { from: 'top', state: 'newGame:open' });
      settle(refs.body, { from: 'left', state: 'newGame:open' });
      settle(refs.stage, { from: 'right', state: 'newGame:open' });
      settle(refs.foot, { from: 'bottom', state: 'newGame:open' });
    } catch (e) { /* motion is cosmetic */ }
    if (this.hull && this.hull.hasMount()) {
      this.hull.activate(ctx);
      this.hull.show(STARTER_SHIP, { fittings: NEW_GAME.fittedModules });
    }
    try { refs.name.focus(); refs.name.select(); } catch (e) {}
  },
  onHide() {
    cue('close');
    if (this.hull) this.hull.deactivate();
  },
  refresh() {},
  dispose() {
    if (this.hull) { this.hull.dispose(); this.hull = null; }
    if (refs && refs.unsubStartFailed) { try { refs.unsubStartFailed(); } catch (e) {} }
    refs = null;
  },
};
