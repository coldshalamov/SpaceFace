// The Crucible door (PQ-133 / CRU-018) and the run results surface.
//
// The door picks a hull and a seed and launches through the ordinary New Game route
// (src/ui/crucibleLaunch.js). The results surface explains how the run ended and offers the same
// seed again. Neither writes state.run, the phase, or a fitting.

import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import { WEAPONS } from '../../data/weapons.js';
import {
  CRUCIBLE_ARENA_ID,
  crucibleSetupFor,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../crucibleLaunch.js';
import { SURVIVAL_UNLOCK_CATALOG } from '../../data/survivalUnlocks.js';
import { loadCrucibleMeta } from '../../systems/survivalRecords.js';
import { meetsUnlockCondition } from '../../systems/survivalUnlocks.js';
import { compileAttackSpec } from '../../combat/attackSpec.js';
import { causalKindsFromSpec } from '../../systems/adventureMigration.js';

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
    color:var(--sf-paper); border:1px solid var(--line); border-radius:2px; padding:12px 14px;
    background:rgba(255,255,255,.03); }
  .sf-menu.sf-crucible-results .sf-crd-grid { display:grid; grid-template-columns:auto 1fr;
    gap:6px 22px; align-items:baseline; }
  .sf-menu.sf-crucible-results .sf-crd-grid .k { font-family:var(--sf-subhead-face); font-weight:600;
    font-size:12px; letter-spacing:.06em; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crd-grid .v { text-align:right; font-family:var(--sf-data-face);
    font-weight:500; font-size:13px; font-variant-numeric:tabular-nums; color:var(--sf-paper); }

  /* The flight record. Bands, not a second styling system: the plate differs between a clear and a
     death by WHICH bands exist and which one leads, never by re-skinning the same rows.
     No animation anywhere in this block, so reduced-motion needs no variant. */
  .sf-menu.sf-crucible-results .sf-crres__band { display:flex; flex-direction:column; gap:7px;
    padding:10px 0 0; border-top:1px solid var(--line); }
  .sf-menu.sf-crucible-results .sf-crres__band-title { font-family:var(--sf-subhead-face);
    font-weight:600; font-size:12px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__lead { font-size:13px; line-height:1.55;
    color:var(--sf-paper); }
  .sf-menu.sf-crucible-results .sf-crres__empty { text-align:center; font-size:13px;
    line-height:1.55; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__chain { display:grid; grid-template-columns:auto 1fr;
    gap:5px 18px; align-items:baseline; }
  .sf-menu.sf-crucible-results .sf-crres__chain-k { font-family:var(--sf-subhead-face);
    font-weight:600; font-size:12px; letter-spacing:.06em; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__chain-v { font-size:13px; line-height:1.45;
    color:var(--sf-paper); }
  .sf-menu.sf-crucible-results .sf-crres__chain-v[data-role="foe"] { color:var(--sf-foe); }
  .sf-menu.sf-crucible-results .sf-crres__vitals { display:flex; flex-wrap:wrap; gap:4px 14px;
    align-items:baseline; }
  .sf-menu.sf-crucible-results .sf-crres__vital-word { font-family:var(--sf-subhead-face);
    font-weight:600; font-size:12px; letter-spacing:.06em; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__vital-fig { font-family:var(--sf-data-face);
    font-weight:500; font-size:13px; font-variant-numeric:tabular-nums; color:var(--sf-foe);
    margin-left:5px; }
  .sf-menu.sf-crucible-results .sf-crres__hit { display:flex; align-items:center; gap:9px;
    flex-wrap:wrap; }
  .sf-menu.sf-crucible-results .sf-crres__hit-name { flex:0 1 auto; font-size:13px;
    color:var(--sf-paper); }
  .sf-menu.sf-crucible-results .sf-crres__hit-track { position:relative; flex:1 1 60px;
    min-width:60px; height:4px; background:rgba(211,230,255,.16); }
  .sf-menu.sf-crucible-results .sf-crres__hit-fill { position:absolute; inset:0 auto 0 0; width:0;
    background:var(--sf-foe); }
  .sf-menu.sf-crucible-results .sf-crres__hit-fig { font-family:var(--sf-data-face); font-weight:500;
    font-size:12px; font-variant-numeric:tabular-nums; color:var(--sf-foe); white-space:nowrap; }
  .sf-menu.sf-crucible-results .sf-crres__build { display:flex; flex-wrap:wrap; gap:6px 8px;
    align-items:baseline; }
  .sf-menu.sf-crucible-results .sf-crres__step { display:inline-flex; align-items:baseline; gap:5px;
    border-left:2px solid var(--sf-you); padding:2px 8px;
    background:color-mix(in srgb, var(--sf-you) 6%, transparent); }
  .sf-menu.sf-crucible-results .sf-crres__step-word { font-family:var(--sf-subhead-face);
    font-weight:600; font-size:12px; letter-spacing:.06em; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__step-fig { font-family:var(--sf-data-face); font-weight:500;
    font-size:12px; font-variant-numeric:tabular-nums; color:var(--sf-calm); }
  .sf-menu.sf-crucible-results .sf-crres__step-verb { font-family:var(--sf-subhead-face);
    font-weight:600; font-size:15px; color:var(--sf-you); }
  /* THE RECORD BAND — the door's answer to "why play again". Per the phase's own rule, nothing
     here is power: the ladder lists possibilities still closed and the exact condition that opens
     each, so the reason to return is the shape of the next run, never a bigger number. */
  .sf-menu.sf-crucible-door .sf-crd-rec { display:grid; gap:10px; padding-top:12px;
    border-top:1px solid var(--panel-edge); }
  .sf-menu.sf-crucible-door .sf-crd-rec__figs { display:grid; gap:8px;
    grid-template-columns:repeat(auto-fit,minmax(84px,1fr)); }
  .sf-menu.sf-crucible-door .sf-crd-fig { display:flex; flex-direction:column; gap:2px; }
  .sf-menu.sf-crucible-door .sf-crd-fig b { font-family:var(--mono); font-size:18px; line-height:1;
    color:var(--ink); font-variant-numeric:tabular-nums; }
  .sf-menu.sf-crucible-door .sf-crd-fig span { font-size:12px; color:var(--ink-dim);
    letter-spacing:.06em; text-transform:uppercase; }
  .sf-menu.sf-crucible-door .sf-crd-rec__head { display:flex; align-items:baseline;
    justify-content:space-between; gap:12px; font-size:12px; letter-spacing:.08em;
    text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-ladder { display:grid; gap:4px; max-height:196px;
    overflow-y:auto; overscroll-behavior:contain; }
  .sf-menu.sf-crucible-door .sf-crd-lock { display:grid; grid-template-columns:14px minmax(0,1fr) auto;
    gap:9px; align-items:baseline; padding:5px 7px; border-radius:3px; font-size:13px; }
  .sf-menu.sf-crucible-door .sf-crd-lock__m { font-family:var(--mono); font-size:12px; line-height:1.3; }
  .sf-menu.sf-crucible-door .sf-crd-lock__n { min-width:0; color:var(--ink); }
  .sf-menu.sf-crucible-door .sf-crd-lock__c { font-size:12px; color:var(--ink-dim);
    font-variant-numeric:tabular-nums; text-align:right; }
  /* Colour by MEANING, not by decoration: open is settled paper, closed is the goal you can still
     reach. Nothing here is a warning, because nothing here is going wrong. */
  .sf-menu.sf-crucible-door .sf-crd-lock.is-open { background:color-mix(in srgb, var(--ink) 5%, transparent); }
  .sf-menu.sf-crucible-door .sf-crd-lock.is-open .sf-crd-lock__m { color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-lock.is-shut .sf-crd-lock__n { color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-lock.is-shut .sf-crd-lock__m { color:var(--sf-goal, #e3a13d); }
  .sf-menu.sf-crucible-door .sf-crd-runs { display:grid; gap:3px; }
  .sf-menu.sf-crucible-door .sf-crd-run { display:grid;
    grid-template-columns:auto minmax(0,1fr) auto; gap:9px; align-items:baseline;
    font-size:12px; font-variant-numeric:tabular-nums; color:var(--ink-dim); }
  .sf-menu.sf-crucible-door .sf-crd-run b { font-family:var(--mono); color:var(--ink); font-weight:600; }
  .sf-menu.sf-crucible-door .sf-crd-none { font-size:12px; color:var(--ink-dim); }
  /* CAUSAL TAGS — how the finished build put damage in. Colour carries MEANING here: the routes
     that bend or spread a shot read as the live signal, and plain DIRECT stays paper, because
     "it went where you pointed it" is not a distinction worth heat. */
  .sf-menu.sf-crucible-results .sf-crres__causal-lead { color:var(--ink-dim); font-size:13px;
    line-height:1.5; margin-top:6px; }
  .sf-menu.sf-crucible-results .sf-crres__causal { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .sf-menu.sf-crucible-results .sf-crres__causal-tag {
    padding:3px 8px; border-radius:2px; font-family:var(--mono); font-size:12px;
    letter-spacing:.08em; color:var(--ink);
    background:color-mix(in srgb, var(--sx-cool, #62cfe0) 16%, transparent);
    box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--sx-cool, #62cfe0) 34%, transparent);
  }
  .sf-menu.sf-crucible-results .sf-crres__causal-tag[data-kind="direct"] {
    background:color-mix(in srgb, var(--ink) 8%, transparent);
    box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--ink) 18%, transparent);
  }
  @media (forced-colors: active) {
    .sf-menu.sf-crucible-results .sf-crres__causal-tag {
      border:1px solid CanvasText; background:Canvas; color:CanvasText; forced-color-adjust:none;
    }
  }
  /* forced-colors strips the share bars; the figure beside every bar is the surviving channel. */
  @media (forced-colors: active) {
    .sf-menu.sf-crucible-results .sf-crres__hit-track { background:Canvas; border:1px solid CanvasText; }
    .sf-menu.sf-crucible-results .sf-crres__hit-fill { background:Highlight; forced-color-adjust:none; }
    .sf-menu.sf-crucible-results .sf-crres__step { border-left:2px solid CanvasText; background:Canvas; }
  }
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

/* --- THE RECORD BAND ------------------------------------------------------------------------
   The Crucible's answer to "why come back". The map's phase-10 exit gate asks for reasons to
   replay beyond raw score AND for a fresh account to stay competitive, and those two pull against
   each other unless the reward is possibility rather than power. Every unlock in the catalog is
   zero on all seven power axes, so this band shows the SHAPE of what is still closed and the exact
   condition that opens it. A returning player gets more ways to play and not one point of damage.
   ------------------------------------------------------------------------------------------- */

/**
 * Phrase the earn condition as the thing the player would go and do.
 *
 * Every kind the catalog actually uses gets a real sentence. The generic fallback exists only so a
 * kind added later still renders something, and a test fails if a live kind ever reaches it — a
 * player reading "pick and waves 10" has been told nothing.
 *
 * Note the two different keys: pick_and_waves carries minWaves, the rest carry min. Reading only
 * `min` printed "clear wave 0" for four of the five starters.
 */
export function unlockConditionText(entry) {
  if (!entry) return '';
  if (entry.defaultUnlocked) return 'open from the start';
  const earn = entry.earn;
  if (!earn || typeof earn !== 'object') return 'condition not yet set';
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  switch (earn.kind) {
    case 'pick_and_waves': {
      const waves = num(earn.minWaves != null ? earn.minWaves : earn.min);
      return earn.verb ? `run ${earn.verb} to wave ${waves}` : `run it to wave ${waves}`;
    }
    case 'waves_cleared': return `clear wave ${num(earn.min)}`;
    case 'deepest_wave': return `reach wave ${num(earn.min)}`;
    case 'authored_victory': return 'win the authored run';
    case 'victory_and_physics_pick': return 'win with a physics verb';
    default: return `${String(earn.kind).replace(/_/g, ' ')} ${num(earn.min)}`;
  }
}

/** One row per catalog entry: is it open, and if not, what opens it. Stable, catalog-ordered. */
export function unlockLadderRows(profile) {
  const owned = (profile && profile.unlocks) || {};
  const stats = (profile && profile.records) || null;
  return SURVIVAL_UNLOCK_CATALOG.map((entry) => {
    let open = !!entry.defaultUnlocked || !!owned[entry.id];
    if (!open && stats) {
      // Ask the systems layer rather than re-deriving the rule here; a second copy would drift.
      try { open = !!meetsUnlockCondition(entry, profile); } catch { open = false; }
    }
    return {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      blurb: entry.blurb,
      open,
      condition: open ? '' : unlockConditionText(entry),
    };
  });
}

/** The lifetime figures, each keeping its own word. */
export function lifetimeFigures(profile) {
  const life = (profile && profile.records && profile.records.lifetime) || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return [
    { key: 'runs', label: 'Runs', value: n(life.runs) },
    { key: 'victories', label: 'Won', value: n(life.victories) },
    { key: 'deepestWave', label: 'Deepest', value: n(life.deepestWave) },
    { key: 'bestScore', label: 'Best score', value: n(life.bestScore) },
    { key: 'bestKills', label: 'Best kills', value: n(life.bestKills) },
  ];
}

const OUTCOME_WORD = Object.freeze({ victory: 'WON', defeat: 'LOST', aborted: 'LEFT' });

/** The most recent runs, newest first. Reads history as stored; never re-sorts by score. */
export function recentRunRows(profile, limit = 5) {
  const hist = (profile && Array.isArray(profile.history)) ? profile.history : [];
  return hist.slice(0, Math.max(0, limit)).map((run) => ({
    outcome: OUTCOME_WORD[run && run.outcome] || String((run && run.outcome) || '—').toUpperCase(),
    wave: Number(run && run.wave) || 0,
    score: Number(run && run.score) || 0,
    arena: (run && run.arenaId) || '',
  }));
}

function renderRecordBand(profile) {
  const band = el('div', 'sf-crd-rec');

  const figs = el('div', 'sf-crd-rec__figs');
  for (const f of lifetimeFigures(profile)) {
    const cell = el('div', 'sf-crd-fig');
    cell.appendChild(el('b', null, String(f.value)));
    cell.appendChild(el('span', null, f.label));
    figs.appendChild(cell);
  }
  band.appendChild(figs);

  const rows = unlockLadderRows(profile);
  const openCount = rows.filter((r) => r.open).length;
  const head = el('div', 'sf-crd-rec__head');
  // The heading and the figure must count the same thing. "Still to open" beside "1 / 14" read as
  // one-of-fourteen-remaining when it meant one-of-fourteen-open — the label and the number were
  // describing opposite sets.
  head.appendChild(el('span', null, 'Unlocks'));
  head.appendChild(el('span', null, `${openCount} of ${rows.length} open`));
  band.appendChild(head);

  const ladder = el('div', 'sf-crd-ladder');
  ladder.setAttribute('role', 'list');
  // Closed first — the band exists to show what is still ahead, so the answer sits at the top.
  const ordered = [...rows.filter((r) => !r.open), ...rows.filter((r) => r.open)];
  for (const r of ordered) {
    const row = el('div', `sf-crd-lock ${r.open ? 'is-open' : 'is-shut'}`);
    row.setAttribute('role', 'listitem');
    // A glyph, not colour alone: forced-colors and colour-blind readers get the same answer.
    row.appendChild(el('span', 'sf-crd-lock__m', r.open ? '+' : '·'));
    const name = el('span', 'sf-crd-lock__n', r.label);
    name.title = r.blurb || '';
    row.appendChild(name);
    row.appendChild(el('span', 'sf-crd-lock__c', r.open ? 'open' : r.condition));
    row.setAttribute('aria-label', `${r.label}. ${r.open ? 'Open.' : 'Closed — ' + r.condition + '.'}`);
    ladder.appendChild(row);
  }
  band.appendChild(ladder);

  const runs = recentRunRows(profile);
  if (runs.length) {
    const rhead = el('div', 'sf-crd-rec__head');
    rhead.appendChild(el('span', null, 'Recent runs'));
    band.appendChild(rhead);
    const list = el('div', 'sf-crd-runs');
    for (const r of runs) {
      const row = el('div', 'sf-crd-run');
      row.appendChild(el('b', null, r.outcome));
      row.appendChild(el('span', null, `wave ${r.wave}`));
      row.appendChild(el('span', null, `${r.score}`));
      list.appendChild(row);
    }
    band.appendChild(list);
  } else {
    band.appendChild(el('div', 'sf-crd-none', 'No runs recorded yet. The first one starts the record.'));
  }

  return band;
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
      'Thirty waves in three acts. Every wave you rearm; every ten you refit. '
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
    seedInput.spellcheck = false; seedInput.autocomplete = 'off';
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

    // The record band goes last, below the verb: the door's job is to start a run, and the reason
    // to start another one is context for that, not a competitor for it. Reading the profile must
    // never be able to stop the door opening, so a broken or absent profile just omits the band.
    try {
      const profile = loadCrucibleMeta();
      if (profile) rootEl.appendChild(renderRecordBand(profile));
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[crucible] record band skipped:', err && err.message ? err.message : err);
      }
    }

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

/* ------------------------------------------------------------------------------------------------
 * The flight record — pure text builders.
 *
 * PQ-133 review question 7 asks whether a player can explain every link of a kill from what is on
 * screen. survivalResults already publishes the whole causal receipt; until now the plate printed
 * one sentence of it and dropped the rest. Everything below turns that receipt into words.
 *
 * All of it is DOM-free and exported so the wording is assertable in a node test. Read-only: these
 * take the copy handed back by lastResult() and never touch a system.
 * --------------------------------------------------------------------------------------------- */

const WEAPON_NAME_BY_ID = new Map(WEAPONS.map((def) => [def.id, def.name]));

/**
 * The bearings a defeat receipt actually carries (impactDirection in src/combat/playerDefeat.js
 * publishes exactly these, uppercase). Anything else renders as "bearing unknown" rather than a
 * guess — the grammar's enumerated-bank rule: the UI never invents an explanatory phrase.
 */
export const BEARING_WORDS = Object.freeze({
  FRONT: 'Off the bow',
  AFT: 'Astern',
  PORT: 'To port',
  STARBOARD: 'To starboard',
  CONTACT: 'Point blank',
});

/** Which side it came from, as a phrase a person says. */
export function bearingWord(direction) {
  return BEARING_WORDS[String(direction || '').toUpperCase()] || 'Bearing unknown';
}

/** The layer the killing damage went through. Enumerated: `dominantLayer` has three live values. */
export const BREACH_PHRASES = Object.freeze({
  hull: 'Through the hull',
  armor: 'Through the armour',
  shield: 'Through the shields',
});

export function breachPhrase(layer) {
  return BREACH_PHRASES[String(layer || '').toLowerCase()] || 'Breach point unknown';
}

/**
 * A weapon id as a player reads it. The damage trail carries ids (`wpn_autocannon_m`), not labels,
 * and an id is frequently null — a hit whose weapon nothing recorded still has to name itself.
 */
export function weaponDisplayName(weaponId) {
  if (!weaponId) return 'Unidentified fire';
  const known = WEAPON_NAME_BY_ID.get(weaponId);
  if (known) return known;
  const words = String(weaponId).replace(/^(wpn|unique)_/, '').split('_').filter(Boolean);
  if (!words.length) return 'Unidentified fire';
  return words
    .map((word) => (word.length === 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * What was actually taking the player apart, aggregated by weapon rather than dumped as eight rows.
 * Amounts are applied damage, so they are fractional — they round once, here, at display.
 * Sorted by damage done, heaviest first; ties settle by name so the order never wobbles.
 */
export function damageBreakdown(trail) {
  const entries = Array.isArray(trail) ? trail : [];
  const byWeapon = new Map();
  let rawTotal = 0;
  let hits = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const name = weaponDisplayName(entry.weaponId);
    const raw = Number(entry.amount);
    const amount = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const bucket = byWeapon.get(name) || { weapon: name, hits: 0, raw: 0 };
    bucket.hits += 1;
    bucket.raw += amount;
    byWeapon.set(name, bucket);
    rawTotal += amount;
    hits += 1;
  }
  const rows = [...byWeapon.values()]
    .sort((a, b) => (b.raw - a.raw) || (a.weapon < b.weapon ? -1 : a.weapon > b.weapon ? 1 : 0))
    .map((bucket) => ({
      weapon: bucket.weapon,
      hits: bucket.hits,
      amount: Math.round(bucket.raw),
      share: rawTotal > 0 ? bucket.raw / rawTotal : 0,
    }));
  return { hits, total: Math.round(rawTotal), rows };
}

/** The sentence over the damage rows. Every figure keeps its word. */
export function lastSecondsLead(trail) {
  const { hits, total } = damageBreakdown(trail);
  if (!hits) return 'Nothing landed on you in the last seconds of the run.';
  if (hits === 1) return `The last hit took ${total} damage off you.`;
  return `The last ${hits} hits took ${total} damage off you.`;
}

/**
 * The draft, in the order it was taken. `picks` is the story of the run: a Crucible build is a
 * sequence of verbs, not a stat sheet. A pick with no verb still names itself from its weapon id.
 */
export function buildSteps(picks) {
  const entries = Array.isArray(picks) ? picks : [];
  const steps = [];
  for (const pick of entries) {
    if (!pick || typeof pick !== 'object') continue;
    const verb = typeof pick.verb === 'string' && pick.verb
      ? pick.verb
      : (pick.defId ? weaponDisplayName(pick.defId) : '');
    if (!verb) continue;
    const wave = Number.isInteger(pick.wave) && pick.wave > 0 ? pick.wave : null;
    steps.push({ wave, verb, text: wave ? `Wave ${wave} ${verb}` : verb });
  }
  return steps;
}

/** The sentence over the build chain. */
export function buildLead(picks) {
  const count = buildSteps(picks).length;
  if (!count) return 'No draft taken — you flew the loadout you launched with.';
  if (count === 1) return '1 draft changed what your guns do:';
  return `${count} drafts changed what your guns do:`;
}

/**
 * Who, with what, from which side, through which layer. Empty when no defeat receipt was published
 * — which happens on a victory, on an abandoned run, AND on a defeat that carries no receipt
 * (`run:ended` defaults its outcome to 'defeat' whether or not anything killed the player).
 */
export function killChainRows(defeat) {
  if (!defeat) return [];
  const killer = defeat.attacker
    ? (defeat.faction ? `${defeat.attacker} — ${defeat.faction}` : defeat.attacker)
    : 'Unidentified attacker';
  return [
    ['Killed by', killer],
    ['Its weapon', defeat.weapon || 'Unidentified weapon'],
    ['It came from', bearingWord(defeat.direction)],
    ['It got in', breachPhrase(defeat.dominantLayer)],
  ];
}

/**
 * What was left of the ship at the end. A vital the receipt did not measure is DROPPED, never
 * reported: `Number(null)` is 0, so coercing here would tell a player their armour was at 0% when
 * in fact nothing measured it. The test for that is the reason this reads the raw value.
 */
export function vitalsFigures(defeat) {
  const vitals = defeat && defeat.vitalsPct;
  if (!vitals || typeof vitals !== 'object') return [];
  return [['Shields', vitals.shield], ['Armour', vitals.armor], ['Hull', vitals.hull]]
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([word, value]) => ({ word, text: `${Math.round(value)}%` }));
}

/**
 * The screen's identity word, and the stamp above it. A clear and a death are not one plate.
 *
 * `aborted` is deliberately NEUTRAL — "Run Ended", not "Run Abandoned". The outcome conflates two
 * unrelated events: the player leaving the arena, and the arena failing to build a wave
 * (survivalResults._onPlanFailed publishes 'aborted' under the headline "The arena could not build
 * wave N"). Nothing published tells them apart, so any title that blames the player would sit in
 * the largest text on the screen contradicting the sentence directly beneath it. The results grid's
 * 'Abandoned' row predates this and is pinned by its own test; the fix belongs at the source.
 */
export function resultTitle(result) {
  if (result && result.outcome === 'victory') return 'Arena Cleared';
  if (result && result.outcome === 'aborted') return 'Run Ended';
  return 'Run Over';
}

export function resultStamp(result) {
  if (result && result.outcome === 'victory') return 'CRUCIBLE / ARENA CLEARED';
  return 'CRUCIBLE / FLIGHT RECORD';
}

/** The band name for a section. The damage band means something different after a clear. */
export function sectionTitle(id, outcome) {
  if (id === 'kill_chain') return 'How it ended';
  if (id === 'last_seconds') return outcome === 'defeat' ? 'The last seconds' : 'What you weathered';
  if (id === 'ledger') return 'Run ledger';
  if (id === 'build') return 'What you built';
  return '';
}

/**
 * Which bands the plate carries and which one leads. This — not a restyle — is what makes a clear
 * and a death different screens: a clear leads with the build that got you there and has no kill
 * chain at all; a death leads with what killed you and ends on the build that failed to stop it.
 *
 * Branching is on `outcome`, never on "is there a defeat receipt": a defeat can publish none.
 */
export function resultSectionOrder(result) {
  if (!result) return [];
  if (result.outcome === 'victory') return ['build', 'last_seconds', 'ledger'];
  if (result.outcome === 'aborted') return ['ledger', 'build', 'last_seconds'];
  if (result.defeat) return ['kill_chain', 'last_seconds', 'ledger', 'build'];
  return ['last_seconds', 'ledger', 'build'];
}

/* --- band renderers. DOM assembly only; every word above them is already decided. --- */

function renderKillChain(band, defeat) {
  const chain = el('div', 'sf-crres__chain');
  const rows = killChainRows(defeat);
  for (const [label, value] of rows) {
    chain.appendChild(el('div', 'sf-crres__chain-k', label));
    const v = el('div', 'sf-crres__chain-v', value);
    // Threat colour on the two rows that name the enemy. The label beside each is the channel that
    // survives forced-colors and colour blindness; the tint is never the only one.
    if (label === 'Killed by' || label === 'Its weapon') v.dataset.role = 'foe';
    chain.appendChild(v);
  }
  band.appendChild(chain);

  const vitals = vitalsFigures(defeat);
  if (!vitals.length) return;
  band.appendChild(el('div', 'sf-crres__lead', 'What was left of you when it landed:'));
  const row = el('div', 'sf-crres__vitals');
  for (const vital of vitals) {
    const pair = el('span', null);
    pair.appendChild(el('span', 'sf-crres__vital-word', vital.word));
    pair.appendChild(el('span', 'sf-crres__vital-fig', vital.text));
    row.appendChild(pair);
  }
  band.appendChild(row);
}

function renderLastSeconds(band, trail) {
  band.appendChild(el('div', 'sf-crres__lead', lastSecondsLead(trail)));
  const { rows } = damageBreakdown(trail);
  for (const row of rows) {
    const line = el('div', 'sf-crres__hit');
    line.appendChild(el('span', 'sf-crres__hit-name', row.weapon));
    const track = el('span', 'sf-crres__hit-track');
    const fill = el('span', 'sf-crres__hit-fill');
    fill.style.width = `${Math.round(row.share * 100)}%`;
    track.appendChild(fill);
    line.appendChild(track);
    line.appendChild(el('span', 'sf-crres__hit-fig', `${row.hits} hit${row.hits === 1 ? '' : 's'}`));
    line.appendChild(el('span', 'sf-crres__hit-fig', `${row.amount} damage`));
    band.appendChild(line);
  }
}

function renderLedger(band, result) {
  const grid = el('div', 'sf-crd-grid');
  for (const [label, value] of resultRows(result)) {
    grid.appendChild(el('div', 'k', label));
    grid.appendChild(el('div', 'v', value));
  }
  band.appendChild(grid);
}

/**
 * HOW THIS BUILD LANDS ITS DAMAGE — the causal tags phase 5 deferred to the GPU lane.
 *
 * Read from the COMPILED SPEC, not from the run's hits. Nothing accumulates per-arrival counts
 * during a run yet, so any figure claiming "8 direct, 16 chained" would be a model presented as a
 * measurement. The kinds are exact and honest: this is what the fit you finished with actually
 * does with a shot. Damage that arrives by CHAIN is a different game from damage that arrives by
 * BANK, and until now the results screen could not say which one you had been playing.
 *
 * Picks mix weapons and modifiers in one list, so the weapon is whichever pick resolves to a known
 * weapon and everything else is treated as a modifier. No weapon, no band — a results screen must
 * never fail to open because a build could not be read.
 */
export function causalKindsFromPicks(picks) {
  const entries = Array.isArray(picks) ? picks : [];
  const ids = [];
  for (const pick of entries) {
    if (pick && typeof pick.defId === 'string' && pick.defId) ids.push(pick.defId);
  }
  if (!ids.length) return [];
  const weaponIds = new Set(WEAPONS.map((w) => w && w.id).filter(Boolean));
  const weaponId = ids.find((id) => weaponIds.has(id)) || null;
  if (!weaponId) return [];
  const modifiers = ids.filter((id) => id !== weaponId && !weaponIds.has(id));
  const compile = (mods) => {
    try {
      const out = compileAttackSpec({ weapon: weaponId, modifiers: mods });
      return out && out.ok === true && out.spec ? out : null;
    } catch (_) {
      return null;
    }
  };
  // One unknown modifier used to take the whole band down, even though the weapon read perfectly.
  // That happens for real: an old run whose trait has since been renamed or retired. Falling back
  // to the weapon alone says less than the truth but never says nothing, and never leaves a results
  // screen with a silently missing section that looks like a bug.
  const compiled = compile(modifiers) || compile([]);
  if (!compiled) return [];
  try {
    return causalKindsFromSpec(compiled.spec);
  } catch (_) {
    return [];
  }
}

/** One sentence over the tags, so the figures keep their word. */
export function causalKindsLead(kinds) {
  const list = Array.isArray(kinds) ? kinds : [];
  if (!list.length) return '';
  if (list.length === 1 && list[0] === 'DIRECT') {
    return 'Every shot arrived the plain way: straight into whatever you were pointing at.';
  }
  if (list.length === 1) return `This build put its damage in by one route: ${list[0].toLowerCase()}.`;
  return `This build had ${list.length} ways in: ${list.map((k) => k.toLowerCase()).join(', ')}.`;
}

function renderBuild(band, picks) {
  band.appendChild(el('div', 'sf-crres__lead', buildLead(picks)));
  const kinds = causalKindsFromPicks(picks);
  if (kinds.length) {
    band.appendChild(el('div', 'sf-crres__causal-lead', causalKindsLead(kinds)));
    const tags = el('div', 'sf-crres__causal');
    for (const kind of kinds) {
      const tag = el('span', 'sf-crres__causal-tag', kind);
      tag.setAttribute('data-kind', kind.toLowerCase());
      tags.appendChild(tag);
    }
    band.appendChild(tags);
  }
  const steps = buildSteps(picks);
  if (!steps.length) return;
  const chain = el('div', 'sf-crres__build');
  for (const step of steps) {
    const node = el('span', 'sf-crres__step');
    if (step.wave != null) {
      node.appendChild(el('span', 'sf-crres__step-word', 'Wave'));
      node.appendChild(el('span', 'sf-crres__step-fig', String(step.wave)));
    }
    node.appendChild(el('span', 'sf-crres__step-verb', step.verb));
    chain.appendChild(node);
  }
  band.appendChild(chain);
}

export const crucibleResultsScreen = {
  id: 'crucibleResults',
  data: { locked: true },

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-crucible-door', 'sf-crucible-results');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-crucible-results-title');

    const owner = resultsOwner(ctx);
    const result = owner && typeof owner.lastResult === 'function' ? owner.lastResult() : null;
    rootEl.dataset.stamp = resultStamp(result);

    const h = el('h1', null, resultTitle(result));
    h.id = 'sf-crucible-results-title';
    rootEl.appendChild(h);

    // The owner's sentence, verbatim. The structured chain below re-states it in fielded form; it
    // never rewrites it, because survivalResults owns the wording of the headline.
    rootEl.appendChild(el(
      'div',
      'sf-crd-headline',
      result && result.headline ? result.headline : 'The run ended.',
    ));

    if (!result) {
      // No record kept. Say so — a dead player must never be handed a blank plate — and still
      // offer every way out below.
      rootEl.appendChild(el(
        'div',
        'sf-crres__empty',
        'No flight record was kept for that run.',
      ));
    }

    for (const id of resultSectionOrder(result)) {
      const band = el('div', 'sf-crres__band');
      // A div carrying heading semantics rather than an <h2>: the shell already styles headings
      // inside .sf-menu and a real h2 would inherit the h1's flex/tracking rules.
      const bandTitle = el('div', 'sf-crres__band-title', sectionTitle(id, result.outcome));
      bandTitle.setAttribute('role', 'heading');
      bandTitle.setAttribute('aria-level', '2');
      band.appendChild(bandTitle);
      if (id === 'kill_chain') renderKillChain(band, result.defeat);
      else if (id === 'last_seconds') renderLastSeconds(band, result.damageTrail);
      else if (id === 'ledger') renderLedger(band, result);
      else if (id === 'build') renderBuild(band, result.picks);
      rootEl.appendChild(band);
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
