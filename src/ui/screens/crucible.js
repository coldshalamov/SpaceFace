// The Crucible door (PQ-133 / CRU-018) and the run results surface.
//
// The door picks a hull and a seed and launches through the ordinary New Game route
// (src/ui/crucibleLaunch.js). The results surface explains how the run ended and offers the same
// seed again. Neither writes state.run, the phase, or a fitting.

import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import {
  CRUCIBLE_ARENA_ID,
  crucibleSetupFor,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../crucibleLaunch.js';

const STYLE_ID = 'sf-crucible-door-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-menu.sf-crucible-door { gap:16px; padding:32px 36px; min-width:400px; max-width:min(92vw,720px); }
  #screens .sf-menu.sf-crucible-door h1 { justify-content:center; margin:0; padding-bottom:10px;
    font-family:var(--mono); letter-spacing:.28em; font-size:22px; text-transform:uppercase; }
  .sf-menu.sf-crucible-door .sf-crd-sub { text-align:center; color:var(--ink-dim); font-size:13px;
    line-height:1.55; margin-top:-8px; }
  .sf-menu.sf-crucible-door .sf-crd-hulls { display:grid; gap:10px;
    grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }
  .sf-menu.sf-crucible-door .sf-crd-hull { display:flex; flex-direction:column; gap:5px; text-align:left;
    border:1px solid var(--line); border-radius:2px; background:rgba(255,255,255,.03);
    padding:12px 14px; cursor:pointer; color:var(--ink); font:inherit; }
  .sf-menu.sf-crucible-door .sf-crd-hull[aria-pressed="true"] { border-color:var(--accent-3); }
  .sf-menu.sf-crucible-door .sf-crd-hull .n { font-family:var(--mono); letter-spacing:.14em;
    font-size:13px; text-transform:uppercase; }
  .sf-menu.sf-crucible-door .sf-crd-hull .d { font-size:12px; color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-seed { display:flex; gap:10px; align-items:center;
    justify-content:center; font-family:var(--mono); font-size:12px; color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-seed input { width:130px; background:rgba(0,0,0,.3);
    border:1px solid var(--line); color:var(--ink); font:inherit; padding:6px 8px; border-radius:2px; }
  .sf-menu.sf-crucible-door .sf-crd-foot { display:flex; gap:10px; justify-content:center; margin-top:4px; }
  .sf-menu.sf-crucible-results .sf-crd-headline { text-align:center; font-size:15px; line-height:1.6;
    color:var(--ink); border:1px solid var(--line); border-radius:2px; padding:12px 14px;
    background:rgba(255,255,255,.03); }
  .sf-menu.sf-crucible-results .sf-crd-grid { display:grid; grid-template-columns:auto 1fr;
    gap:6px 22px; align-items:center; font-family:var(--mono); font-size:13px; }
  .sf-menu.sf-crucible-results .sf-crd-grid .k { color:var(--ink-dim); font-size:11px; letter-spacing:.06em; }
  .sf-menu.sf-crucible-results .sf-crd-grid .v { text-align:right; }
  .sf-menu.sf-crucible-results .sf-crd-picks { font-size:12px; color:var(--ink-dim); line-height:1.6; }
  `;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function hullBlurb(starter) {
  const count = Array.isArray(starter.loadout) ? starter.loadout.length : 0;
  return `${starter.hullId.replace(/^ship_/, '')} · ${count} hardpoint${count === 1 ? '' : 's'} fitted`;
}

/** A fresh seed for the door. UI-only: the sim's determinism starts once the seed is chosen. */
function freshSeed() {
  const now = Date.now() >>> 0;
  return normalizeSeed((now ^ (now >>> 13) ^ 0x9e3779b9) >>> 0);
}

export const crucibleScreen = {
  id: 'crucible',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible-door');
    rootEl.dataset.stamp = 'CRUCIBLE / SURVIVAL';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-title');

    const previous = lastCrucibleSetup();
    let starterId = COMBAT_LAB_STARTER_PACKAGES[0].id;
    if (previous) {
      const match = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.hullId === previous.hullId);
      if (match) starterId = match.id;
    }

    const h = el('h1', null, 'Crucible');
    h.id = 'sf-crucible-title';
    rootEl.appendChild(h);
    rootEl.appendChild(el(
      'div',
      'sf-crd-sub',
      'Ten waves in Helios Core. Every wave you rearm; every ten you refit. '
      + 'Nothing you earn here follows you home.',
    ));

    const hulls = el('div', 'sf-crd-hulls');
    const buttons = [];
    for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sf-crd-hull';
      card.dataset.starterId = starter.id;
      card.setAttribute('aria-pressed', String(starter.id === starterId));
      card.appendChild(el('div', 'n', starter.label));
      card.appendChild(el('div', 'd', hullBlurb(starter)));
      card.addEventListener('click', () => {
        starterId = starter.id;
        for (const other of buttons) {
          other.setAttribute('aria-pressed', String(other.dataset.starterId === starterId));
        }
      });
      buttons.push(card);
      hulls.appendChild(card);
    }
    rootEl.appendChild(hulls);

    const seedRow = el('div', 'sf-crd-seed');
    seedRow.appendChild(el('span', null, 'SEED'));
    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.inputMode = 'numeric';
    seedInput.setAttribute('aria-label', 'Run seed');
    seedInput.value = String(previous ? previous.seed : freshSeed());
    seedRow.appendChild(seedInput);
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'sf-btn';
    reroll.textContent = 'New seed';
    reroll.addEventListener('click', () => { seedInput.value = String(freshSeed()); });
    seedRow.appendChild(reroll);
    rootEl.appendChild(seedRow);

    const foot = el('div', 'sf-crd-foot');
    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'sf-btn sf-btn--primary';
    enter.textContent = 'Enter the Crucible';
    enter.addEventListener('click', () => {
      const setup = crucibleSetupFor({
        starterId,
        seed: normalizeSeed(seedInput.value),
        arenaId: CRUCIBLE_ARENA_ID,
      });
      if (!setup.ok || !setup.value) {
        ctx.bus.emit('toast', { text: 'Crucible setup invalid', kind: 'error', ttl: 4 });
        return;
      }
      requestCrucibleRun(ctx.bus, setup.value);
    });
    foot.appendChild(enter);

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'sf-btn';
    back.textContent = 'Back';
    back.addEventListener('click', () => ctx.bus.emit('ui:popScreen', {}));
    foot.appendChild(back);
    rootEl.appendChild(foot);

    if (typeof enter.focus === 'function') {
      try { enter.focus(); } catch { /* focus is best-effort */ }
    }
  },
};

function resultsOwner(ctx) {
  const registry = ctx && ctx.registry;
  if (!registry || typeof registry.get !== 'function') return null;
  return registry.get('survivalResults') || null;
}

/** Rows for the results grid. Exported so a check can assert them without a DOM. */
export function resultRows(result) {
  if (!result) return [];
  return [
    ['Outcome', result.outcome === 'victory' ? 'Survived' : (result.outcome === 'aborted' ? 'Abandoned' : 'Lost')],
    ['Reached', `Wave ${result.deepestWave || result.wave || 0} of 10`],
    ['Kills', String(result.kills || 0)],
    ['Score', String(result.score || 0)],
    ['Salvage', `${result.credits || 0} cr`],
    ['Level', `${result.level || 1} · ${result.xp || 0} xp`],
    ['Seed', String(result.seed || 0)],
  ];
}

export const crucibleResultsScreen = {
  id: 'crucibleResults',
  data: { locked: true },

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible-door', 'sf-crucible-results');
    rootEl.dataset.stamp = 'CRUCIBLE / FLIGHT RECORD';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-results-title');

    const owner = resultsOwner(ctx);
    const result = owner && typeof owner.lastResult === 'function' ? owner.lastResult() : null;

    const h = el('h1', null, result && result.outcome === 'victory' ? 'Arena Cleared' : 'Run Over');
    h.id = 'sf-crucible-results-title';
    rootEl.appendChild(h);

    rootEl.appendChild(el('div', 'sf-crd-headline', result ? result.headline : 'The run ended.'));

    const grid = el('div', 'sf-crd-grid');
    for (const [label, value] of resultRows(result)) {
      grid.appendChild(el('div', 'k', label));
      grid.appendChild(el('div', 'v', value));
    }
    rootEl.appendChild(grid);

    if (result && result.picks && result.picks.length) {
      const verbs = result.picks.map((p) => p.verb).filter(Boolean).join(' · ');
      if (verbs) rootEl.appendChild(el('div', 'sf-crd-picks', `Build: ${verbs}`));
    }

    const foot = el('div', 'sf-crd-foot');

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'sf-btn sf-btn--primary';
    again.textContent = 'Run it again — same seed';
    again.addEventListener('click', () => {
      const setup = lastCrucibleSetup();
      if (!setup) {
        ctx.bus.emit('ui:replaceScreen', { id: 'crucible' });
        return;
      }
      // Restart is a real New Game: runSession.newGame resets the envelope to inactive, so the
      // begin below is accepted exactly as it was the first time.
      requestCrucibleRun(ctx.bus, setup);
    });
    foot.appendChild(again);

    const newSeed = document.createElement('button');
    newSeed.type = 'button';
    newSeed.className = 'sf-btn';
    newSeed.textContent = 'New run';
    newSeed.addEventListener('click', () => ctx.bus.emit('ui:replaceScreen', { id: 'crucible' }));
    foot.appendChild(newSeed);

    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'sf-btn';
    menu.textContent = 'Main menu';
    menu.addEventListener('click', () => {
      // Same teardown pause uses: main.js consumes game:exitToMenu and returns state.mode to
      // 'menu', runSession aborts and clears the run envelope.
      ctx.bus.emit('game:over:dismissed', {});
      ctx.bus.emit('game:exitToMenu', { source: 'crucible_results' });
      ctx.bus.emit('ui:closeAll', {});
      ctx.bus.emit('ui:pushScreen', { id: 'mainMenu' });
    });
    foot.appendChild(menu);

    rootEl.appendChild(foot);
    if (typeof again.focus === 'function') {
      try { again.focus(); } catch { /* focus is best-effort */ }
    }
  },
};
