// Local racing records, own-best ghost selection, earned trail tint selection, and the one
// explicitly opt-in station arena. This screen reads the timeTrials ledger and emits intents only.
import {
  TIME_TRIAL_TICK_RATE,
  VESTA_STATION_ARENA,
  timeTrialLocalBoard,
} from '../../../data/timeTrialCourses.js';
import { escapeHtml } from '../../comms.js';

function formatTicks(ticks) {
  if (!Number.isFinite(ticks)) return '—';
  return `${(ticks / TIME_TRIAL_TICK_RATE).toFixed(2)} s`;
}

export function createTrialsScreen(ctx) {
  const root = document.createElement('div');
  root.className = 'sx-trials';
  let queuedTierId = null;
  const subscriptions = [];

  function state() { return ctx?.state || {}; }
  function bus() { return ctx?.bus || null; }

  function render() {
    const board = timeTrialLocalBoard(state());
    const stationId = state().ui?.dockedStationId || null;
    const courses = board.courses.map((course) => {
      const ghostDisabled = course.hasRenderableGhost ? '' : ' disabled aria-disabled="true"';
      const ghostLabel = course.ghostEnabled ? 'Hide own best' : 'Race own best';
      return `<article class="sx-trial-card">` +
        `<div><span class="sx-trial-card__sector">${escapeHtml(course.sectorId.replace(/^sector_/, '').replace(/_/g, ' '))}</span>` +
        `<h2>${escapeHtml(course.name)}</h2>` +
        `<p>${course.entryFeeCr} cr per run · ${course.bestTicks == null ? 'No local finish yet' : `${escapeHtml(course.bestMedal || 'finish')} · ${formatTicks(course.bestTicks)}`}</p></div>` +
        `<button type="button" class="sx-trials__button" data-trial-ghost="${escapeHtml(course.id)}" ` +
        `data-enabled="${course.ghostEnabled ? 'true' : 'false'}"${ghostDisabled}>${ghostLabel}</button>` +
        `</article>`;
    }).join('');

    const stockSelected = board.selectedTrailTint == null;
    const tints = board.trailTints.filter((tint) => tint.unlocked).map((tint) =>
      `<button type="button" class="sx-trials__tint${tint.selected ? ' is-selected' : ''}" ` +
      `data-trial-tint="${escapeHtml(tint.id)}" aria-pressed="${tint.selected ? 'true' : 'false'}">` +
      `<span style="--trial-tint:${escapeHtml(tint.color)}"></span>${escapeHtml(tint.id.replace(/^trail_/, '').replace(/_/g, ' '))}</button>`,
    ).join('');

    const arenaHere = stationId === VESTA_STATION_ARENA.stationId;
    const arenaRows = board.arena.map((tier) => {
      const disabled = tier.unlocked ? '' : ' disabled aria-disabled="true"';
      const score = tier.bestScore == null ? 'No clear' : `${tier.bestScore.toLocaleString('en-US')} pts · ${formatTicks(tier.bestTicks)}`;
      return `<article class="sx-arena-tier${tier.cleared ? ' is-cleared' : ''}">` +
        `<div><h3>${escapeHtml(tier.name)}</h3><p>${score}</p><small>${tier.creditReward} cr first-clear purse</small></div>` +
        `<button type="button" class="sx-trials__button" data-arena-tier="${escapeHtml(tier.id)}"${disabled}>Launch match</button>` +
        `</article>`;
    }).join('');

    root.innerHTML =
      `<section class="sx-trials__section"><header><div><span class="sx-trials__eyebrow">DEVICE RECORDS</span>` +
      `<h2>Flight trials</h2></div><p>Your records stay on this save. No network board.</p></header>` +
      `<div class="sx-trials__course-grid">${courses}</div></section>` +
      `<section class="sx-trials__section"><header><div><span class="sx-trials__eyebrow">EARNED WAKE</span>` +
      `<h2>Trail tint</h2></div><p>Changes leftover contrail light; your drive keeps its own identity.</p></header>` +
      `<div class="sx-trials__tints"><button type="button" class="sx-trials__tint${stockSelected ? ' is-selected' : ''}" ` +
      `data-trial-tint="stock" aria-pressed="${stockSelected ? 'true' : 'false'}"><span class="is-stock"></span>stock drive</button>${tints}</div></section>` +
      `<section class="sx-trials__section${arenaHere ? '' : ' is-muted'}"><header><div><span class="sx-trials__eyebrow">FORGEYARD</span>` +
      `<h2>Station arena</h2></div><p>${arenaHere ? 'Optional real-combat ladder. First-clear purse only.' : 'Forgeyard Arena is posted at Vesta Forge.'}</p></header>` +
      (arenaHere ? `<div class="sx-trials__arena">${arenaRows}</div>` : '') +
      `<p class="sx-trials__status" role="status" aria-live="polite"></p></section>`;
  }

  root.addEventListener('click', (event) => {
    const ghost = event.target.closest('[data-trial-ghost]');
    if (ghost && !ghost.disabled) {
      bus()?.emit('timeTrial:selectGhost', {
        courseId: ghost.getAttribute('data-trial-ghost'),
        enabled: ghost.getAttribute('data-enabled') !== 'true',
      });
      render();
      return;
    }
    const tint = event.target.closest('[data-trial-tint]');
    if (tint) {
      bus()?.emit('timeTrial:selectTrailTint', { tintId: tint.getAttribute('data-trial-tint') });
      render();
      return;
    }
    const arena = event.target.closest('[data-arena-tier]');
    if (arena && !arena.disabled) {
      queuedTierId = arena.getAttribute('data-arena-tier');
      bus()?.emit('timeTrial:arenaRequest', { tierId: queuedTierId });
    }
  });

  function listen(event, handler) {
    const off = bus()?.on?.(event, handler);
    if (typeof off === 'function') subscriptions.push(off);
  }
  listen('timeTrial:arenaQueued', (payload) => {
    if (!queuedTierId || payload.tierId !== queuedTierId) return;
    queuedTierId = null;
    bus()?.emit('dock:undocked', { committed: true, intent: 'explicit', source: 'sx-trials-arena' });
  });
  listen('timeTrial:arenaRejected', (payload) => {
    queuedTierId = null;
    const status = root.querySelector('.sx-trials__status');
    if (status) status.textContent = `Arena unavailable: ${String(payload.reason || 'request rejected').replace(/_/g, ' ')}.`;
  });
  for (const event of ['timeTrial:ghostSelected', 'timeTrial:trailTintSelected', 'timeTrial:arenaCompleted']) {
    listen(event, render);
  }

  render();
  return {
    el: root,
    onShow: render,
    refresh: render,
    onHide() {},
    dispose() { for (const off of subscriptions) off(); },
  };
}

export default createTrialsScreen;
