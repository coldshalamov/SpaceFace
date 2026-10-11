// Read-only recognition for the circuit board, including visits from adventure flight.
import { el } from './kit/index.js';
import { RACE_LEVELS } from '../data/raceLevels.js';
import { CUP_HEATS, RACING_DIFFICULTIES, RACING_RIVALS, readRacingCareer,
  racingRecognitionStatus } from '../systems/racingCareer.js';

export function renderRacingRecognition(storage) {
  const career = readRacingCareer(storage), section = el('section', 'race-board-result dp-glass');
  section.setAttribute('aria-label', 'Local circuit recognition');
  section.append(el('h2', 'k-t-sub', 'Circuit recognition'),
    el('p', 'k-sentence', 'Your meetings and cup honors on this device.'));
  const status = racingRecognitionStatus(storage);
  if (status !== 'ready') {
    const message = el('p', 'k-sentence', status === 'not_stored'
      ? 'The latest result was not stored. Earlier local recognition is shown below.'
      : 'Local storage is unavailable. Results are not stored on this device.');
    message.setAttribute('role', 'status'); section.appendChild(message);
  }
  for (const rival of RACING_RIVALS) {
    const row = career.rivals?.[rival.id];
    let note = 'Not yet met on the grid.';
    if (row) {
      const course = RACE_LEVELS.find(level => level.id === row.lastLevelId)?.name;
      const difficulty = RACING_DIFFICULTIES.find(level => level.id === row.lastDifficulty)?.name;
      const last = row.lastOutcome === 'retired' ? 'Rival retired'
        : Number.isFinite(row.lastGapS) ? `${Math.abs(row.lastGapS).toFixed(2)}s ${row.lastOutcome}`
          : `You finished ${row.lastOutcome}`;
      note = `${row.meetings} ${row.meetings === 1 ? 'meeting' : 'meetings'} · ${row.wins} ${row.wins === 1 ? 'win' : 'wins'}. Last: ${last} at ${course} (${difficulty}).`;
    }
    section.appendChild(el('p', 'k-sentence', `${rival.name} · ${rival.style} — ${note}`));
  }
  const honors = RACING_DIFFICULTIES.filter(level => career.cups[level.id]);
  if (!honors.length) section.appendChild(el('p', 'k-sentence', 'Cup honors: finish all three heats to earn recognition across the host courses.'));
  else {
    section.appendChild(el('p', 'k-sentence', `Cup host courses: ${CUP_HEATS.map(heat => heat.name).join(' · ')}.`));
    for (const difficulty of honors) {
      const row = career.cups[difficulty.id];
      section.appendChild(el('p', 'k-sentence', `${row.medal} · ${difficulty.name} cup · best ${row.points}/18 · ${row.finishes} completed.`));
    }
  }
  return section;
}
