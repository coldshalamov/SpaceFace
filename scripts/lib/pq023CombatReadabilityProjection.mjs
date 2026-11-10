export const PQ023_COMBAT_READABILITY_CELLS = Object.freeze([
  Object.freeze({ key: 'autocannon', browserFile: 'pq023-impact-autocannon-02.png' }),
  Object.freeze({ key: 'flak', browserFile: 'pq023-impact-flak-02.png' }),
  Object.freeze({ key: 'small', browserFile: '06-small-01.png' }),
  Object.freeze({ key: 'small-reduced', browserFile: 'pq023-reduced-small-01.png' }),
  Object.freeze({ key: 'dense', browserFile: 'pq023-dense-representative.png' }),
]);

export const PQ023_SMALL_DESTRUCTION_SALIENCE_CELLS = Object.freeze(
  PQ023_COMBAT_READABILITY_CELLS.filter(({ key }) => (
    key === 'small' || key === 'small-reduced' || key === 'dense'
  )),
);

function normalizeProfile(value) {
  return {
    weaponId: value?.weaponId || null,
    family: value?.family || null,
    variant: value?.variant || null,
    mode: value?.mode || null,
    primaryShape: value?.primaryShape || null,
    fragmentCount: Number(value?.fragmentCount) || 0,
    lightPeak: Number(value?.lightPeak) || 0,
  };
}

function normalizeRuntime(value) {
  return {
    observed: !!value,
    particles: Number(value?.particles) || 0,
    sprites: Number(value?.sprites) || 0,
    spriteKinds: [...(value?.spriteKinds || [])].map(Number).sort((a, b) => a - b),
    trailStreaks: Number(value?.trailStreaks) || 0,
    combatBeams: Number(value?.combatBeams) || 0,
    maxFlashSize1: Number(value?.maxFlashSize1) || 0,
    maxTrailLength: Number(value?.maxTrailLength) || 0,
    motionReduce: value?.settings?.motionReduce === true,
    flashReduce: value?.settings?.flashReduce === true,
  };
}

function normalizeCells(cells, specs) {
  const byKey = new Map((cells || []).map((row) => [row.key, row]));
  return specs.map(({ key }) => ({
    key,
    runtime: normalizeRuntime(byKey.get(key)?.runtime),
  }));
}

export function buildPq023CombatReadabilityProjection({ impactProfiles, cells }) {
  return {
    schema: 'spaceface.pq023-combat-readability-projection.v1',
    impactProfiles: {
      autocannon: normalizeProfile(impactProfiles?.autocannon),
      flak: normalizeProfile(impactProfiles?.flak),
    },
    cells: normalizeCells(cells, PQ023_COMBAT_READABILITY_CELLS),
  };
}

export function buildPq023SmallDestructionSalienceProjection({ cells }) {
  return {
    schema: 'spaceface.pq023-small-destruction-salience-projection.v1',
    cells: normalizeCells(cells, PQ023_SMALL_DESTRUCTION_SALIENCE_CELLS),
  };
}

export function validatePq023CombatReadabilityProjection(projection) {
  const problems = [];
  const byKey = new Map((projection?.cells || []).map((row) => [row.key, row.runtime]));
  const autocannon = byKey.get('autocannon');
  const flak = byKey.get('flak');
  const small = byKey.get('small');
  const reduced = byKey.get('small-reduced');
  const dense = byKey.get('dense');

  if (projection?.impactProfiles?.autocannon?.mode === projection?.impactProfiles?.flak?.mode) {
    problems.push('autocannon and flak modes are not distinct');
  }
  if (![autocannon, flak, small, reduced, dense].every((runtime) => runtime?.observed === true)) {
    problems.push('one or more required combat-readability cells are missing');
    return problems;
  }
  if (flak.sprites < 1) problems.push('flak has no compact visible core');
  if (flak.trailStreaks < 6) problems.push('flak has no full-volume fragment release');
  if (small.sprites < 2) problems.push('small destruction has no readable hot breakup body');
  if (small.trailStreaks < 2) problems.push('small destruction has no asymmetric fragment snap');
  if (small.spriteKinds.includes(1)) problems.push('small destruction borrowed the ordinary ring grammar');
  if (reduced.motionReduce !== true || reduced.flashReduce !== true) {
    problems.push('reduced small-destruction cell did not apply both accessibility owners');
  }
  if (reduced.spriteKinds.includes(1)) problems.push('reduced small destruction borrowed a ring');
  if (dense.combatBeams < 1) problems.push('dense representative lost the connected combat beam');
  if (dense.sprites + dense.trailStreaks <= small.sprites + small.trailStreaks) {
    problems.push('dense representative did not exceed the isolated small-breakup load');
  }
  return problems;
}

export function validatePq023SmallDestructionSalienceProjection(projection) {
  const problems = [];
  const byKey = new Map((projection?.cells || []).map((row) => [row.key, row.runtime]));
  const small = byKey.get('small');
  const reduced = byKey.get('small-reduced');
  const dense = byKey.get('dense');

  if (![small, reduced, dense].every((runtime) => runtime?.observed === true)) {
    problems.push('one or more required small-destruction cells are missing');
    return problems;
  }
  if (small.sprites < 3) problems.push('normal small destruction lost its hot asymmetric body');
  if (small.trailStreaks < 3) problems.push('normal small destruction lost its three-point fragment envelope');
  if (small.maxFlashSize1 < 1.4) problems.push('normal small destruction hot footprint is undersized');
  if (small.maxTrailLength < 3.0) problems.push('normal small destruction fragment envelope is undersized');
  if (small.spriteKinds.includes(1)) problems.push('normal small destruction borrowed the ordinary ring grammar');
  if (reduced.motionReduce !== true || reduced.flashReduce !== true) {
    problems.push('reduced small-destruction cell did not apply both accessibility owners');
  }
  if (reduced.spriteKinds.includes(1)) problems.push('reduced small destruction borrowed the ordinary ring grammar');
  if (dense.combatBeams < 1) problems.push('dense representative lost the connected combat beam');
  if (dense.sprites + dense.trailStreaks <= small.sprites + small.trailStreaks) {
    problems.push('dense representative did not exceed the isolated small-breakup load');
  }
  return problems;
}
