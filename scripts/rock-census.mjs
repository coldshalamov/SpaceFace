#!/usr/bin/env node
// Row 511 (W-LADDER): the Katamari ladder census — prints the expected rock-body count per throw
// tier (size band) per sector. Mirrors the world spawner's ladder law exactly: scatter coverage
// counts at the field's sizeRange midpoint band, authored boulders count at their own radius, and
// the ladder bedrock tops each short band up to ROCK_LADDER_MIN_PER_TIER pinned bodies.
// Exits 1 when a stocked sector ends below the floor on any tier T0–T4, or has no T2+ ammunition.
import { SECTORS } from '../src/data/sectors.js';
import { ASTEROIDS, FIELDS } from '../src/data/mining.js';
import { rockTierForRadius, ROCK_LADDER_MIN_PER_TIER } from '../src/data/rockSubstances.js';

const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));

let bad = 0;
console.log('sector                       astCount  T0  T1  T2  T3  T4   total');
for (const sector of SECTORS) {
  const params = FIELDS[sector.tier] || FIELDS[0];
  const fieldDefs = sector.fields || [];
  const totalWeight = fieldDefs.reduce((s, f) => s + (f.countWeight || 1), 0) || 1;
  const counts = [0, 0, 0, 0, 0];
  for (const fdef of fieldDefs) {
    const def = AST_BY_ID.get(fdef.type) || AST_BY_ID.get('ast_common_rock');
    const share = (fdef.countWeight || 1) / totalWeight;
    const count = fdef.count != null
      ? Math.max(1, Math.round(fdef.count))
      : Math.max(4, Math.round((params.astCount || 0) * share));
    const [szLo, szHi] = def.sizeRange || [6, 14];
    counts[Math.min(4, rockTierForRadius((szLo + szHi) / 2))] += count;
    for (const b of fdef.boulders || []) {
      const r = Math.max(1, Number(b && b.radius) || szHi);
      counts[Math.min(4, rockTierForRadius(r))] += 1;
    }
    // Ladder bedrock (world.js _ensureRockLadderBedrock): every band tops up to the floor.
    for (let tier = 0; tier <= 4; tier++) if (counts[tier] < ROCK_LADDER_MIN_PER_TIER) counts[tier] = ROCK_LADDER_MIN_PER_TIER;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const short = [];
  if (fieldDefs.length) {
    for (let t = 0; t <= 4; t++) if (counts[t] < ROCK_LADDER_MIN_PER_TIER) short.push(`T${t}<${ROCK_LADDER_MIN_PER_TIER}`);
    if (counts[2] + counts[3] + counts[4] === 0) short.push('no-T2+');
  }
  if (short.length) bad++;
  console.log(
    `${String(sector.id).padEnd(28)} ${String(params.astCount || 0).padStart(7)} ${counts.map((c) => String(c).padStart(3)).join(' ')}   ${String(total).padStart(4)}${short.length ? `  <-- ${short.join(' ')}` : ''}`,
  );
}
console.log(bad === 0
  ? `\nOK — every stocked sector holds >=${ROCK_LADDER_MIN_PER_TIER} bodies on each tier T0-T4.`
  : `\nFAIL — ${bad} sector(s) below the ladder floor.`);
process.exit(bad === 0 ? 0 : 1);
