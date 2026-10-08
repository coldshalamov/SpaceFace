// SFQ-B091 — survey, cut, and collect are different sheets. Fracture already draws
// its own stress line in vfx.js; these three had cue ids and no picture.

export const MINING_PHASE_SHEETS = Object.freeze({
  survey: Object.freeze({ phase: 'survey', color: '#7ec8ff', shape: 'ring' }),
  cut: Object.freeze({ phase: 'cut', color: '#ffb35c', shape: 'spark' }),
  collect: Object.freeze({ phase: 'collect', color: '#9dffb0', shape: 'bead' }),
});

export function miningPhaseSheet(cueId) {
  const id = String(cueId || '');
  if (id.startsWith('mining.survey.')) return MINING_PHASE_SHEETS.survey;
  if (id === 'mining.extraction.locked') return MINING_PHASE_SHEETS.cut;
  if (id === 'mining.yield.collected') return MINING_PHASE_SHEETS.collect;
  return null;
}

/**
 * Paint one phase. `draw.sprite` is the only side effect. Reduced motion is one
 * short sheet in the phase color — the phase is still named, the burst is not.
 * Returns the sprite count.
 */
export function paintMiningPhaseSheet(draw, sheet, pos, radius, reduced, rand) {
  if (!draw || typeof draw.sprite !== 'function' || !sheet || !pos) return 0;
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return 0;
  const roll = typeof rand === 'function' ? rand : () => 0;
  const x = pos.x;
  const z = pos.z;
  const r = Math.max(4, Number(radius) || 8);
  if (reduced) {
    draw.sprite({
      kind: 'flame', x, z, life: 0.36, size0: 3, size1: 8, op: 0.22,
      color: sheet.color, aspect: 0.5, roll: 0, vx: 0, vz: 0,
    });
    return 1;
  }
  if (sheet.shape === 'ring') {
    const base = roll() * Math.PI * 2;
    for (let i = 0; i < 6; i++) {
      const a = base + (i / 6) * Math.PI * 2;
      draw.sprite({
        kind: 'puff',
        x: x + Math.cos(a) * r * 0.85,
        z: z + Math.sin(a) * r * 0.85,
        life: 0.55,
        size0: r * 0.12,
        size1: r * 0.28,
        op: 0.4,
        color: sheet.color,
        aspect: 1,
        roll: a,
        vx: 0,
        vz: 0,
      });
    }
    return 6;
  }
  if (sheet.shape === 'spark') {
    const seam = roll() * Math.PI * 2;
    draw.sprite({
      kind: 'flame', x, z, life: 0.28, size0: r * 0.2, size1: r * 0.55, op: 0.7,
      color: sheet.color, aspect: 0.22, roll: seam, vx: 0, vz: 0,
    });
    draw.sprite({
      kind: 'flame', x, z, life: 0.4, size0: r * 0.1, size1: r * 0.3, op: 0.35,
      color: '#fff4e0', aspect: 0.18, roll: seam + 0.4, vx: 0, vz: 0,
    });
    return 2;
  }
  const a = roll() * Math.PI * 2;
  draw.sprite({
    kind: 'puff', x, z, life: 0.7, size0: r * 0.16, size1: r * 0.42, op: 0.66,
    color: sheet.color, aspect: 0.7, roll: 0,
    vx: Math.cos(a) * 2.4, vz: Math.sin(a) * 2.4,
  });
  return 1;
}
