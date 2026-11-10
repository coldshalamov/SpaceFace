// Read-only journal projection. The Chronicler remains the sole writer of its archive.
import { buildStoryView, recallText } from './narrative.js';

export const LOGBOOK_LIMIT = 16;
export function logbookRunKey(state) {
  return `${state?.meta?.seed ?? 0}:${state?.meta?.createdAt || 'legacy'}`;
}

export function logbookEntries(state, { opening = true } = {}) {
  const now = Number.isFinite(state?.simTime) ? state.simTime : 0;
  const stories = Array.isArray(state?.chronicler?.stories) ? state.chronicler.stories : [];
  const entries = stories.filter(story => story?.nodes?.length).map(story => {
    const view = buildStoryView(story);
    return view && { id: view.id, revision: view.revision, title: view.title,
      body: recallText(view, now), at: view.updatedAt || 0, kind: view.kind,
      citation: `${view.id}:r${view.revision}`, facts: story.nodes };
  }).filter(Boolean).sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id)))
    .slice(0, LOGBOOK_LIMIT);
  if (!entries.length && opening) entries.push({ id: 'opening', revision: 0,
    title: 'The page is yours', at: now, kind: 'departure', facts: [], citation: null,
    body: 'Your ship is here. The next choice is yours. As the run unfolds, the things you do and the people who remember them will find their way onto these pages.' });
  return entries;
}

export function logbookRecap(state) {
  const entries = logbookEntries(state);
  // Three short passages divide the twenty-second return without turning the record into stats.
  return entries.slice(0, 3).reverse();
}
