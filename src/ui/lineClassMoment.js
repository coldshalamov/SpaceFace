// src/ui/lineClassMoment.js — G19-01: the rope getting stronger is an event the player sees.
//
// systems/lineProgression.js emits `line:classChanged` when the tonnage ladder crosses a class
// threshold; until now only the radio answered. This module turns that event into the moment:
// the discovery-plate surface shows the three authored lines (class name, the new hold, the new
// move) for ~4 s, and the achievement fanfare — the existing unlock cue — sounds once.
// The cable hardware itself re-reads the new class colour/width on its own frame; this file
// owns only the words and the sound.
import { LINE_CLASS_NAMES, lineClassForIndex } from '../data/lineProgression.js';

// Existing authored cue for an unlocked deed (src/data/audioRecipes.js). Played through the
// ordinary audio:cue lane; no new audio authored.
const CLASS_UP_CUE = 'sfx_achievement_fanfare';

/** The exact three lines the plate carries for a class index, or null for an unknown one. */
export function lineClassMomentLines(classIndex) {
  const row = LINE_CLASS_NAMES[Math.trunc(Number(classIndex))];
  if (!row) return null;
  const cls = lineClassForIndex(classIndex);
  return [
    `LINE CLASS ${cls.label} — ${row.name.toUpperCase()}`,
    `You can now hold: ${row.hold}`,
    `New move: ${row.move}`,
  ];
}

export function createLineClassMoment(ctx) {
  const bus = ctx && ctx.bus;
  const plate = ctx && ctx.plate;
  if (!bus || typeof bus.on !== 'function') return { destroy() {} };
  const off = bus.on('line:classChanged', (p = {}) => {
    const lines = lineClassMomentLines(p.classIndex);
    if (!lines) return;
    if (plate && typeof plate.show === 'function') {
      plate.show({
        key: `line-class:${Math.trunc(Number(p.classIndex))}`,
        title: lines[0],
        lines: lines.slice(1),
        ttlS: 4,
      });
    }
    if (typeof bus.emit === 'function') bus.emit('audio:cue', { id: CLASS_UP_CUE, gain: 0.75, duck: true });
  });
  return {
    destroy() { if (typeof off === 'function') off(); },
  };
}
