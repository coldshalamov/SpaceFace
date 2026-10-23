import { buildStoryView } from './narrative.js';
import { SECTORS } from '../data/sectors.js';

const sectorNames = new Map(SECTORS.map(sector => [sector.id, sector.name]));
export function flightClock(seconds = 0) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Witnessed deeds, never a second archive or a new source of awards.
export function recordsWall(state) {
  return (state?.chronicler?.stories || []).filter(story => story?.nodes?.length).map(story => {
    const view = buildStoryView(story);
    const node = story.nodes.slice().sort((a, b) => (b.t || 0) - (a.t || 0))[0];
    const subject = story.nodes.find(fact => fact.subject?.name)?.subject?.name;
    const title = subject && view.title.startsWith('Loss recorded') ? `${subject} · ${view.title}` : view.title;
    return { id: story.id, title, text: view.summary,
      place: node.stationName || node.zoneName || node.sectorName || sectorNames.get(node.sectorId) || 'Position unrecorded',
      time: flightClock(node.t), at: Number(node.t) || 0, evidence: view.evidence };
  }).sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id))).slice(0, 24);
}

export function todayRankedRuns(profile, dateKey) {
  return (profile?.history || []).filter(run => run.dailyDateKey === dateKey && run.practice !== true)
    .map((run, index) => ({ run, index })).sort((a, b) => (b.run.score || 0) - (a.run.score || 0)
      || (b.run.deepestWave || b.run.wave || 0) - (a.run.deepestWave || a.run.wave || 0) || a.index - b.index)
    .slice(0, 5).map(({ run, index }, i) => ({ rank: i + 1, score: run.score || 0,
      wave: run.deepestWave || run.wave || 0, seed: run.seed, index }));
}
