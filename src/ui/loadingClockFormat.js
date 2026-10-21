/**
 * Format the elapsed loading clock as mm:ss — no hours placeholder, no tenths
 * digit (the loading readout is a reassurance, not a stopwatch).
 * @param {number} elapsedSeconds
 * @returns {string}
 */
export function formatLoadingClock(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(Math.floor(elapsed % 60)).padStart(2, '0');
  return `${mins}:${secs}`;
}
