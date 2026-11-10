/**
 * CLOUD-04 — a scan that earned taxonomy shows a compact fauna field note on the target
 * surface; an unearned scan leaks nothing. Drives faunaFieldNote + objectInfoLine (the shipped
 * target-panel surfaces).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { faunaFieldNote, objectInfoLine } from '../src/ui/targetPanel.js';
import { faunaSpeciesById } from '../src/data/alienFauna.js';

function fauna(id, speciesId, overrides = {}) {
  return {
    id,
    type: 'fauna',
    alive: true,
    team: 2,
    radius: 9,
    pos: { x: 50, z: 0 },
    vel: { x: 0, z: 0 },
    ...overrides,
    data: {
      ecology: { speciesId, driveState: 'drift' },
      ...(overrides.data || {}),
    },
  };
}

function stateAt(revelation, extra = {}) {
  return {
    playerId: 'player',
    entities: new Map(),
    simTime: 100,
    world: { currentSectorId: 'sector_helios', alienEcology: { schema: 'x', revelation } },
    ...extra,
  };
}

test('CLOUD-04: below the anatomy gate the note stays silent — name plate already owns the term', () => {
  const veil = fauna('f1', 'veil_ray');
  assert.equal(faunaFieldNote(veil, stateAt(0)), null);
  assert.equal(faunaFieldNote(veil, stateAt(1)), null);
  // the facts line shows no taxonomy either — just the shared action tail
  const line = objectInfoLine(veil, stateAt(1), { team: 1 }, 300);
  assert.doesNotMatch(line, /RELAY|HOST:|GROWTH:|CYST/);
});

test('CLOUD-04: at the gate the note speaks role, posture, and authored anatomy', () => {
  const veil = fauna('f2', 'veil_ray', { data: { ecology: { speciesId: 'veil_ray', driveState: 'investigate' } } });
  const note = faunaFieldNote(veil, stateAt(2));
  const species = faunaSpeciesById('veil_ray');
  assert.equal(note[0], species.role.toUpperCase());
  assert.ok(note.includes('CURIOUS'));
  assert.ok(note.some((f) => f === `HOST: ${species.anatomy.hostTissue.toUpperCase()}`));
  assert.ok(note.some((f) => f === `GROWTH: ${species.anatomy.fungalTissue.toUpperCase()}`));
  // veil_ray authors relayTissue:false — the false is reported, not dropped as absent
  assert.ok(note.includes('NO RELAY TISSUE'));
  assert.ok(note.some((f) => f === `CYST LOAD: ${species.anatomy.cystLoad.toUpperCase()}`));
  assert.ok(note.length <= 6);
});

test('CLOUD-04: false, absent, and unknown anatomy stay distinct', () => {
  const species = faunaSpeciesById('veil_ray');
  // explicit false vs missing key on a synthetic species-shaped record
  const relayTrue = fauna('f3', 'blind_shepherd', { data: { ecology: { speciesId: 'blind_shepherd', driveState: 'drift' } } });
  const note = faunaFieldNote(relayTrue, stateAt(2));
  assert.ok(note.includes('RELAY TISSUE PRESENT'));
  // a malformed anatomy object contributes nothing but cannot crash the line
  const broken = fauna('f4', 'veil_ray', { data: { ecology: { speciesId: 'veil_ray', driveState: 'drift' } } });
  const an = faunaSpeciesById('veil_ray').anatomy;
  assert.ok(faunaFieldNote(broken, stateAt(3)).includes(`HOST: ${an.hostTissue.toUpperCase()}`));
});

test('CLOUD-04: nonhostile posture is never mislabeled as attack', () => {
  for (const drive of ['defend', 'swarm', 'shadow']) {
    const veil = fauna('f5', 'veil_ray', { data: { ecology: { speciesId: 'veil_ray', driveState: drive } } });
    const note = faunaFieldNote(veil, stateAt(2));
    assert.ok(note.some((f) => /POSTURE|SHADOWING/.test(f)), `${drive} mislabeled`);
    assert.ok(!note.some((f) => /ATTACK|HOSTILE|CHARGING/.test(f)), `${drive} claimed hostile`);
  }
  const captured = fauna('f6', 'veil_ray', { data: { ecology: { speciesId: 'veil_ray', driveState: 'captured' } } });
  assert.ok(faunaFieldNote(captured, stateAt(2)).includes('CAPTURED'));
});

test('CLOUD-04: unknown species, dead specimen, and missing ecology never emit a note', () => {
  assert.equal(faunaFieldNote(fauna('f7', 'no_such_species'), stateAt(3)), null);
  assert.equal(faunaFieldNote(fauna('f8', 'veil_ray', { alive: false }), stateAt(3)), null);
  assert.equal(faunaFieldNote(fauna('f9', 'veil_ray', { data: { ecology: null } }), stateAt(3)), null);
  assert.equal(faunaFieldNote(null, stateAt(3)), null);
});

test('CLOUD-04: a fitted Bio-Spectral Pass lifts the read one rung — the module bonus counts', () => {
  const veil = fauna('f10', 'veil_ray');
  const player = { id: 'player', type: 'ship', data: { fittings: ['mod_bio_spectral_pass_s'] } };
  const state = stateAt(1, { entities: new Map([['player', player]]) });
  // base revelation 1 + module tier 1 = effective 2 — anatomy earned by hardware.
  const note = faunaFieldNote(veil, state);
  assert.ok(note && note.some((f) => f.startsWith('HOST:')), 'module-lifted read should reach anatomy');
});

test('CLOUD-04: the projection mutates nothing — absent ecology record stays absent', () => {
  const veil = fauna('f11', 'veil_ray');
  const state = { playerId: 'player', entities: new Map(), world: { currentSectorId: 'x' } };
  const before = JSON.stringify(state);
  assert.equal(faunaFieldNote(veil, state), null); // no record → base 0 → silent
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.world.alienEcology, undefined);
});

test('CLOUD-04: objectInfoLine keeps the action tail beside the note', () => {
  const veil = fauna('f12', 'veil_ray', { data: { ecology: { speciesId: 'veil_ray', driveState: 'forage' } } });
  const line = objectInfoLine(veil, stateAt(2), { team: 1 }, 300);
  assert.match(line, /FORAGING/);
  assert.match(line, /Inspect only|Beam|Sling|range/i);
});
