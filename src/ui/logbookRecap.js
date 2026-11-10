import { logbookRecap } from '../chronicler/logbook.js';
import { createLogbookMedia, logbookStill } from './logbookMedia.js';
import { el, words } from './kit/index.js';
import { injectLogbookLayouts } from './orrery/logbookLayouts.js';

export const LOGBOOK_RECAP_MS = 20000;
export function createRecapClock(now = () => performance.now()) {
  let elapsed = 0, previous = null, wasAvailable = false, page = -1;
  return {
    reset() { elapsed = 0; previous = null; wasAvailable = false; page = -1; },
    step(count, available = true) {
      const current = now();
      if (previous !== null && wasAvailable) elapsed += Math.max(0, current - previous);
      previous = current; wasAvailable = available;
      if (!available) return { visible: false, page };
      page = Math.min(count - 1, Math.floor(elapsed / (LOGBOOK_RECAP_MS / Math.max(1, count))));
      return { visible: count > 0 && elapsed < LOGBOOK_RECAP_MS, page };
    },
  };
}

export function createLogbookRecap(ctx, options = {}) {
  const { state, bus } = ctx, offs = [], media = createLogbookMedia(ctx, options.media);
  const doc = options.document || globalThis.document, clock = createRecapClock(options.now);
  let pending = false, entries = [], shown = -1, root = null, lastScan = -Infinity;
  const now = options.now || (() => performance.now());
  const hide = () => { pending = false; if (root) root.hidden = true; };
  const on = (type, fn) => { const off = bus?.on?.(type, fn); if (typeof off === 'function') offs.push(off); };
  on('save:loaded', () => { entries = logbookRecap(state); pending = true; shown = -1; clock.reset(); media.reload(); });
  for (const event of ['game:new', 'game:load', 'save:restoring', 'game:exitToMenu', 'player:death']) on(event, hide);
  const paint = entry => {
    if (!doc?.getElementById('ui-root')) return;
    injectLogbookLayouts(doc);
    if (!root) { root = el('aside', 'orr-logbook-recap'); root.setAttribute('aria-label', 'Previously on your run'); doc.getElementById('ui-root').appendChild(root); }
    root.replaceChildren(el('div', 'k-eyebrow', 'Previously, on your run…'));
    const still = logbookStill(state, entry);
    if (still) { const image = el('img'); image.src = still; image.alt = 'Recorded moment from your run'; root.appendChild(image); }
    root.append(el('h2', 'k-display', entry.title), el('p', 'k-sentence', entry.body),
      words([{ action: 'dismiss', label: 'Back to the run' }], { row: true, onPick: hide }));
    root.hidden = false;
  };
  on('logbook:stillReady', () => { if (pending && shown >= 0 && root && !root.hidden) paint(entries[shown]); });
  return {
    frame() {
      if (now() - lastScan >= 500) { lastScan = now(); void media.frame(); }
      if (!pending) return;
      // Never spend the recap behind loading/menu chrome. It is presentation time, not sim time.
      const available = state.mode === 'flight' && !state.paused && !state.ui?.screenStack?.length && !doc?.hidden;
      const next = clock.step(entries.length, available);
      if (!available) { if (root) root.hidden = true; return; }
      if (!next.visible) { hide(); return; }
      if (shown !== next.page || root?.hidden) { shown = next.page; paint(entries[shown]); }
    },
    dispose() { for (const off of offs) off(); media.dispose(); root?.remove(); root = null; },
  };
}
