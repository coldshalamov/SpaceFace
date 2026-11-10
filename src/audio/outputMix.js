// Explicit output policies, applied on settings changes to the existing graph.
export function applyOutputMix(rt, audio = {}) {
  if (!rt || !rt.masterGain || !rt.limiter) return;
  rt.masterGain.channelCount = audio.mono ? 1 : 2;
  rt.masterGain.channelCountMode = 'explicit';
  rt.masterGain.channelInterpretation = 'speakers';
  const night = audio.nightMode === true;
  const values = night
    ? { threshold: -28, knee: 18, ratio: 6, attack: 0.003, release: 0.3 }
    : { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 };
  for (const [key, value] of Object.entries(values)) if (rt.limiter[key]) rt.limiter[key].value = value;
}

export function heatScoreLift(level) { return Math.min(0.45, Math.max(0, Number(level) || 0) * 0.09); }

export function stationIdentNotes(stationId) {
  if (!stationId) return [];
  let hash = 2166136261;
  for (const c of String(stationId)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const notes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  return [notes[hash % 7], notes[(hash >>> 4) % 7], 'A'];
}
