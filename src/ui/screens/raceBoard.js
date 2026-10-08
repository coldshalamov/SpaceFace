// RACE-01 circuits board. Aside from the title, not a sixth verb. Three levels, five
// contracts that lock the stern camera, practice that does not. A fresh flight is the
// only way onto a sector you are not already in.

import { el, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { confirm } from '../confirm.js';
import {
  RACE_LEVELS,
  practiceContractForLevel,
  raceLevelById,
  racingSeedFor,
  storyContracts,
} from '../../data/raceLevels.js';
import { readRaceRecords, normalizeSteeringView, STEERING_VIEWS } from '../../systems/racingSteer.js';
import { armRacingContract, stageRacingLaunch } from '../racingLaunch.js';

function storageOf() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function fmtRecord(seconds) {
  if (!Number.isFinite(seconds)) return 'no mark';
  return `${seconds.toFixed(2)}s`;
}

function pop(ctx) {
  const mgr = (ctx && ctx.screenManager)
    || (ctx && ctx.screens)
    || (ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui') && ctx.registry.get('ui').screenManager);
  if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
}

function inFlight(ctx) {
  return !!(ctx && ctx.state && ctx.state.mode === 'flight');
}

function hereSector(ctx) {
  return ctx && ctx.state && ctx.state.world && ctx.state.world.currentSectorId || null;
}

async function launchFresh(ctx, contractId, level) {
  const live = inFlight(ctx);
  const ok = await confirm({
    title: live ? 'Leave this flight?' : 'New flight',
    body: live
      ? `${level.name} starts a new flight. The run you are in is left behind. A save already on disk is not overwritten until you save.`
      : `${level.name} starts a new flight on this circuit. Your campaign save is not opened, and the Veil is not charted on it.`,
    confirmLabel: 'Launch',
    cancelLabel: 'Back',
  });
  if (!ok || !ctx || !ctx.bus) return;
  stageRacingLaunch(contractId);
  ctx.bus.emit('game:new', { seed: racingSeedFor(contractId) });
}

function runContract(ctx, contractId) {
  const levelId = contractId && contractId.startsWith('practice_')
    ? contractId.slice('practice_'.length)
    : null;
  const story = storyContracts().find((row) => row.id === contractId);
  const level = raceLevelById(story ? story.levelId : levelId);
  if (!level) return;
  if (!inFlight(ctx)) {
    launchFresh(ctx, contractId, level);
    return;
  }
  if (hereSector(ctx) === level.sectorId) {
    const result = armRacingContract(ctx, contractId, { allowEnterSector: false });
    if (result && result.ok && !result.reused) pop(ctx);
    return;
  }
  launchFresh(ctx, contractId, level);
}

function cycleView(ctx, labelEl) {
  const g = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay;
  const cur = normalizeSteeringView(g && g.steeringView);
  const next = STEERING_VIEWS[(STEERING_VIEWS.indexOf(cur) + 1) % STEERING_VIEWS.length];
  if (g) g.steeringView = next;
  if (ctx && ctx.bus) {
    ctx.bus.emit('settings:changed', { section: 'gameplay', key: 'steeringView', value: next });
  }
  if (labelEl) labelEl.textContent = `Steering view: ${next}`;
}

export const raceBoardScreen = {
  id: 'raceBoard',

  mount(rootEl, ctx) {
    injectDeckplate();
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen');
    rootEl.setAttribute('aria-label', 'Circuits');
    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title', 'Circuits'));
    title.appendChild(el('p', 'k-sentence',
      'Three laps on terrain already in the sky. Five contracts lock the stern camera. Practice does not. Overhead stays the default until you change it.'));
    rootEl.appendChild(title);

    const view = el('p', 'k-sentence', '');
    const viewBtn = el('button', 'k-word', 'Cycle steering view');
    viewBtn.type = 'button';
    viewBtn.addEventListener('click', () => { cue('confirm'); cycleView(ctx, view); });
    const pref = normalizeSteeringView(ctx && ctx.state && ctx.state.settings
      && ctx.state.settings.gameplay && ctx.state.settings.gameplay.steeringView);
    view.textContent = `Steering view: ${pref}`;
    rootEl.appendChild(view);
    rootEl.appendChild(viewBtn);

    const records = readRaceRecords(storageOf());
    const stories = storyContracts();
    for (const level of RACE_LEVELS) {
      const block = el('section', '');
      block.appendChild(el('h2', 'k-t-sub', level.name));
      block.appendChild(el('p', 'k-sentence', level.blurb));
      block.appendChild(el('p', 'k-sentence',
        `${level.terrain}. Best ${fmtRecord(Number(records[level.id]))}.`));
      const practice = practiceContractForLevel(level.id);
      if (practice) {
        const b = el('button', 'k-word', 'Practice');
        b.type = 'button';
        b.addEventListener('click', () => { cue('confirm'); runContract(ctx, practice.id); });
        block.appendChild(b);
      }
      for (const row of stories.filter((item) => item.levelId === level.id)) {
        const b = el('button', 'k-word', row.title);
        b.type = 'button';
        b.title = row.summary;
        b.addEventListener('click', () => { cue('confirm'); runContract(ctx, row.id); });
        block.appendChild(b);
        block.appendChild(el('p', 'k-sentence', row.summary));
      }
      rootEl.appendChild(block);
    }

    const back = el('button', 'k-word', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => { cue('back'); pop(ctx); });
    rootEl.appendChild(back);
    this._root = rootEl;
  },

  unmount() {
    if (this._root) this._root.innerHTML = '';
    this._root = null;
  },

  update() {},
};
