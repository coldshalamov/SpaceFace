// Sandbox testing screen (DEV ONLY — never ships in build/web).
//
// A human-facing dev harness for reaching mid-game features without playing for an hour. Quick-setup
// cards launch a preconfigured game; a fine-tune panel overrides the defaults. Every action drives
// the REAL new-game pipeline then mutates live state through the canonical system writers — see
// src/ui/sandbox/sandboxSetup.js for the contract and writer order.
//
// Three production guards (root AGENTS.md §6 one game path): (1) IS_DEV folds false at build time so
// the module is dead-code-eliminated, (2) the main-menu button is IS_DEV-gated, (3) mount() bails
// if IS_DEV is false. Gameplay itself never forks.

import { IS_DEV } from '../../core/devMode.js';
import { SHIPS } from '../../data/ships.js';
import { SECTORS } from '../../data/sectors.js';
import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { ENEMY_TYPES } from '../../data/enemies.js';
import {
  SCENARIO_PRESETS, requestSandboxGame,
  giveAndEquipItem, spawnEnemyNow, spawnTargetsNow,
} from '../sandbox/sandboxSetup.js';

const STYLE_ID = 'sf-sandbox-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Sandbox-specific layout only. The shared menu fascia (plate, headings, ledger buttons) lives
  // in styles/menu.css. We deliberately use the same .sf-menu tokens so the testing screen reads as
  // part of the game's instrument language rather than a foreign devtools panel.
  s.textContent = `
  .screen.sf-sandbox { max-width: 760px; }
  .sf-sandbox .sf-section-h { margin: 18px 0 8px; }
  .sf-sandbox-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .sf-sandbox-card {
    text-align: left; cursor: pointer; padding: 12px 14px; border-radius: var(--r-md, 6px);
    background: linear-gradient(180deg, rgba(78,195,230,.05), transparent);
    border: 1px solid var(--panel-edge, #1d3350); color: var(--ink, #d3e6ff);
    font-family: var(--font); transition: border-color .15s var(--ease), background .15s var(--ease);
  }
  .sf-sandbox-card:hover, .sf-sandbox-card:focus-visible {
    border-color: var(--accent, #39d0ff);
    background: linear-gradient(180deg, rgba(78,195,230,.10), transparent);
  }
  .sf-sandbox-card__title { font-weight: 600; letter-spacing: .04em; margin-bottom: 4px; }
  .sf-sandbox-card__desc { font-size: var(--t-xs, 12px); color: var(--ink-dim, #84a0c8); line-height: 1.4; }
  .sf-sandbox-finetune { display: grid; grid-template-columns: max-content 1fr; gap: 8px 12px; align-items: center; }
  .sf-sandbox-finetune label { color: var(--ink-dim, #84a0c8); font-size: var(--t-xs, 12px); }
  .sf-sandbox-finetune select, .sf-sandbox-finetune input[type=number] {
    background: var(--panel-2, #111d30); color: var(--ink, #d3e6ff); border: 1px solid var(--panel-edge, #1d3350);
    border-radius: 4px; padding: 5px 7px; font-family: var(--mono); font-size: 13px; width: 100%;
  }
  .sf-sandbox-checks { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 4px 0 0; }
  .sf-sandbox-checks label {
    display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
    color: var(--ink, #d3e6ff); font-size: var(--t-sm, 13px);
  }
  .sf-sandbox-launch { margin-top: 16px; }
  .sf-sandbox-livehint {
    font-size: var(--t-xs, 12px); color: var(--ink-mute, #5a7aa0);
    font-style: italic; margin-bottom: 8px;
  }
  .sf-sandbox-live { display: flex; flex-direction: column; gap: 8px; }
  .sf-sandbox-picker { display: grid; grid-template-columns: 70px 1fr max-content; gap: 8px; align-items: center; }
  .sf-sandbox-picker__label { color: var(--ink-dim, #84a0c8); font-size: var(--t-xs, 12px); }
  .sf-sandbox-picker select {
    background: var(--panel-2, #111d30); color: var(--ink, #d3e6ff);
    border: 1px solid var(--panel-edge, #1d3350); border-radius: 4px;
    padding: 5px 7px; font-family: var(--mono); font-size: 12px; min-width: 0;
  }
  .sf-sandbox-picker button:disabled { opacity: .45; cursor: not-allowed; }
  @media (max-width: 560px) {
    .sf-sandbox-cards { grid-template-columns: 1fr; }
    .sf-sandbox-finetune { grid-template-columns: 1fr; }
    .sf-sandbox-picker { grid-template-columns: 1fr; }
  }
  `;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Build a labeled picker row: [label] [select?] [action button]. select may be null (button-only). */
function pickerRow(labelText, select, actionBtn) {
  const row = document.createElement('div');
  row.className = 'sf-sandbox-picker';
  const lbl = el('span', 'sf-sandbox-picker__label', labelText);
  row.appendChild(lbl);
  if (select) row.appendChild(select);
  if (actionBtn) row.appendChild(actionBtn);
  return row;
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

export const sandboxScreen = {
  id: 'sandbox',

  mount(rootEl, ctx) {
    if (!IS_DEV) return; // production guard — should never be reached (registration is gated too)
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-menu-wide', 'sf-sandbox');
    rootEl.dataset.stamp = 'SANDBOX / TEST HARNESS';

    rootEl.appendChild(el('h1', null, 'Sandbox'));
    rootEl.appendChild(el('div', 'sf-menu-save-summary',
      'Dev testing harness. Pick a scenario or fine-tune below, then launch.'));

    // --- Quick-setup cards ---
    const cardsHeader = el('div', 'sf-section-h', 'QUICK SETUPS');
    rootEl.appendChild(cardsHeader);
    const cardGrid = el('div', 'sf-sandbox-cards');
    rootEl.appendChild(cardGrid);
    for (const preset of SCENARIO_PRESETS) {
      const card = el('button', 'sf-sandbox-card');
      card.type = 'button';
      card.appendChild(el('div', 'sf-sandbox-card__title', preset.title));
      card.appendChild(el('div', 'sf-sandbox-card__desc', preset.description));
      card.addEventListener('click', () => {
        requestSandboxGame(ctx.bus, preset.config);
      });
      cardGrid.appendChild(card);
    }

    // --- Fine-tune panel ---
    rootEl.appendChild(el('div', 'sf-section-h', 'FINE-TUNE (applies on launch)'));
    const fine = el('div', 'sf-sandbox-finetune');

    const shipLabel = el('label', null, 'Starting ship');
    shipLabel.htmlFor = 'sf-sandbox-ship';
    const shipSel = document.createElement('select');
    shipSel.id = 'sf-sandbox-ship';
    for (const ship of SHIPS) {
      const o = document.createElement('option');
      o.value = ship.id;
      o.textContent = ship.name + ' (tier ' + ship.tier + ')';
      shipSel.appendChild(o);
    }
    shipSel.value = 'ship_kestrel';
    fine.appendChild(shipLabel); fine.appendChild(shipSel);

    const sectorLabel = el('label', null, 'Start sector');
    sectorLabel.htmlFor = 'sf-sandbox-sector';
    const sectorSel = document.createElement('select');
    sectorSel.id = 'sf-sandbox-sector';
    for (const sec of SECTORS) {
      const o = document.createElement('option');
      o.value = sec.id;
      o.textContent = sec.name + ' (tier ' + sec.tier + ')';
      sectorSel.appendChild(o);
    }
    sectorSel.value = 'sector_helios_prime';
    fine.appendChild(sectorLabel); fine.appendChild(sectorSel);

    const creditsLabel = el('label', null, 'Credits');
    creditsLabel.htmlFor = 'sf-sandbox-credits';
    const creditsInput = document.createElement('input');
    creditsInput.type = 'number';
    creditsInput.id = 'sf-sandbox-credits';
    creditsInput.min = '0';
    creditsInput.step = '1000';
    creditsInput.value = '500000';
    fine.appendChild(creditsLabel); fine.appendChild(creditsInput);

    rootEl.appendChild(fine);

    // Toggles row
    const checks = el('div', 'sf-sandbox-checks');
    const toggles = [
      ['unlockAllTech', 'Unlock all tech', true],
      ['grantAllModules', 'Grant all weapons & modules', true],
      ['maxReputation', 'Max reputation (all factions)', false],
    ];
    const checkboxes = {};
    for (const [key, label, def] of toggles) {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = def;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(label));
      checks.appendChild(lbl);
      checkboxes[key] = cb;
    }
    rootEl.appendChild(checks);

    // --- Launch ---
    const launch = el('button', 'sf-btn sf-btn--primary sf-sandbox-launch', 'Launch with these settings');
    launch.type = 'button';
    launch.addEventListener('click', () => {
      const config = {
        shipId: shipSel.value || undefined,
        sectorId: sectorSel.value || undefined,
        credits: Math.max(0, parseInt(creditsInput.value, 10) || 0),
        unlockAllTech: checkboxes.unlockAllTech.checked,
        grantAllModules: checkboxes.grantAllModules.checked,
        maxReputation: checkboxes.maxReputation.checked,
      };
      requestSandboxGame(ctx.bus, config);
    });
    rootEl.appendChild(launch);

    // --- Live Tools (in-flight only) ---
    // These mutate the RUNNING game directly via system writers — they don't relaunch. Disabled
    // until a game is in flight; onShow() re-checks the mode and enables them.
    rootEl.appendChild(el('div', 'sf-section-h', 'LIVE TOOLS (use during flight)'));
    const liveHint = el('div', 'sf-sandbox-livehint',
      'Launch a game first, then re-open this screen (Esc → Sandbox) to use these.');
    rootEl.appendChild(liveHint);
    sandboxScreen._liveHintEl = liveHint;

    const live = el('div', 'sf-sandbox-live');

    // Weapon picker + Give & Equip
    const weaponSel = document.createElement('select');
    for (const w of WEAPONS) {
      const o = document.createElement('option');
      o.value = w.id;
      o.textContent = w.name + ' — ' + w.size + ' ' + w.damageType + ' (dps ' + (w.dps || '?') + ')';
      weaponSel.appendChild(o);
    }
    const giveWeaponBtn = el('button', 'sf-btn', 'Give & Equip');
    giveWeaponBtn.type = 'button';
    giveWeaponBtn.addEventListener('click', () => {
      if (weaponSel.value) giveAndEquipItem(sandboxScreen._ctx, weaponSel.value);
    });

    // Module picker + Give & Equip
    const moduleSel = document.createElement('select');
    for (const m of MODULES) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name + ' — ' + m.slotType + ' ' + m.size;
      moduleSel.appendChild(o);
    }
    const giveModuleBtn = el('button', 'sf-btn', 'Give & Equip');
    giveModuleBtn.type = 'button';
    giveModuleBtn.addEventListener('click', () => {
      if (moduleSel.value) giveAndEquipItem(sandboxScreen._ctx, moduleSel.value);
    });

    // Enemy picker + Spawn
    const enemySel = document.createElement('select');
    for (const e of ENEMY_TYPES) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.name + (e.aiArchetype ? ' (' + e.aiArchetype + ')' : '');
      enemySel.appendChild(o);
    }
    enemySel.value = 'wasp_swarmer';
    const spawnEnemyBtn = el('button', 'sf-btn', 'Spawn 1');
    spawnEnemyBtn.type = 'button';
    spawnEnemyBtn.addEventListener('click', () => {
      if (enemySel.value) spawnEnemyNow(sandboxScreen._ctx, enemySel.value, 1);
    });

    // Target drones button (no picker — fixed inert drone)
    const spawnTargetsBtn = el('button', 'sf-btn', 'Spawn 3 target drones');
    spawnTargetsBtn.type = 'button';
    spawnTargetsBtn.addEventListener('click', () => {
      spawnTargetsNow(sandboxScreen._ctx, 3);
    });

    live.appendChild(pickerRow('Weapon', weaponSel, giveWeaponBtn));
    live.appendChild(pickerRow('Module', moduleSel, giveModuleBtn));
    live.appendChild(pickerRow('Enemy', enemySel, spawnEnemyBtn));
    live.appendChild(pickerRow('Targets', null, spawnTargetsBtn));
    rootEl.appendChild(live);

    // Stash refs for onShow to enable/disable based on flight mode.
    sandboxScreen._liveEls = [weaponSel, moduleSel, enemySel, giveWeaponBtn, giveModuleBtn, spawnEnemyBtn, spawnTargetsBtn];

    // --- Back ---
    const back = el('button', 'sf-btn', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
    });
    rootEl.appendChild(back);

    sandboxScreen._ctx = ctx;
  },

  onShow(ctx) {
    // Live tools need a running game (a player entity exists). Both 'flight' and 'paused' count —
    // the sandbox is reachable from the pause menu, where mode is 'paused' but the game is live.
    // Mode flips to 'menu' only on the title screen / game-over, where no player entity exists.
    const c = ctx || sandboxScreen._ctx;
    const inGame = !!(c && c.state && c.state.playerId && c.state.entities.get(c.state.playerId));
    if (sandboxScreen._liveEls) {
      for (const elx of sandboxScreen._liveEls) { elx.disabled = !inGame; }
    }
    if (sandboxScreen._liveHintEl) {
      sandboxScreen._liveHintEl.style.display = inGame ? 'none' : '';
    }
  },
  onHide() {},
  refresh() {},
};

export default sandboxScreen;
