// Presentation-only stunt phrasing. Reuse the two stunt recipes; never touch combo scoring.
import { scoreNoteHz, STEM_BPM } from './scoreDirector.js';

const NOTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
export function stuntLinkRate(acts, identity) {
  // The combo caps at 32 acts. A diatonic staircase stays audible across that whole range.
  const step = Math.max(0, Math.min(31, Math.floor(Number(acts) || 1) - 1));
  const index = step % 7;
  return scoreNoteHz(NOTES[index], 4 + Math.floor(step / 7) + (index > 1 ? 1 : 0), identity) / 880;
}

export function stuntBankTier(bank) {
  const points = Math.max(0, Number(bank && bank.points) || 0);
  return points >= 2000 ? 2 : points >= 500 ? 1 : 0;
}

export function stuntScoreBpm(musicState) {
  return STEM_BPM[musicState === 'combat' ? 'C' : musicState === 'tense' ? 'B' : musicState === 'docked' ? 'D' : 'A'];
}

// Double-time performance sixteenths nest inside the score's sixteenths. Their 59–65 ms
// interval lets musical payoffs wait for the grid without delaying physical impact voices.
export function stuntGridTime(now, anchor = 0, bpm = 122, stride = 1) {
  const unit = 60 / bpm / 8 * stride;
  return anchor + Math.ceil((now - anchor) / unit - 1e-9) * unit;
}
