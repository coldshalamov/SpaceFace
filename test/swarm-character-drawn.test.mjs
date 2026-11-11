// G08-01 — the character sheet reaches the draw. swarmCharacterDrawSpec is the pure seam:
// it reads the stamp waveMaterialization writes onto data.swarmCharacter and returns the
// { scale, accentHex } the authored compose applies to the hull fit and the accent tint.
// An entity without the stamp draws exactly as before; a malformed stamp draws as if absent.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SWARM_CHARACTER_SHEET,
  swarmCharacterFor,
} from '../src/data/swarmCharacter.js';
import { SWARM_FEEL_PROFILE } from '../src/data/swarmFeelProfile.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { applySwarmFeelSpec } from '../src/systems/waveMaterialization.js';
import {
  swarmCharacterDrawSpec,
  swarmRosterShipExemplarSpecs,
} from '../src/render/partsLibrary.js';

const hexFor = (hue) => `#${(hue & 0xffffff).toString(16).padStart(6, '0')}`;

test('every sheet row resolves to its own draw scale and accent hue', () => {
  for (const row of SWARM_CHARACTER_SHEET) {
    const entity = {
      type: 'ship',
      team: 1,
      radius: row.radius,
      data: {
        swarmCharacter: {
          silhouette: row.silhouette,
          scale: row.scale,
          hue: row.hue,
          tier: row.tier,
          abilityId: row.abilityId,
          tellId: row.tellId,
        },
      },
    };
    const spec = swarmCharacterDrawSpec(entity);
    assert.equal(spec.scale, row.scale, `${row.enemyId} draws at its sheet scale`);
    assert.equal(spec.accentHex, hexFor(row.hue),
      `${row.enemyId} wears its sheet hue on the accent channel`);
  }
});

test('a live materialization stamp lands the sheet values on the draw spec', () => {
  for (const row of SWARM_CHARACTER_SHEET) {
    const spec = makeEnemySpawnSpec(row.enemyId, 1, { x: 0, z: 0 });
    assert.ok(spec, `${row.enemyId} builds a spec`);
    applySwarmFeelSpec(spec, row.enemyId, SWARM_FEEL_PROFILE);
    const draw = swarmCharacterDrawSpec(spec);
    assert.equal(draw.scale, row.scale, `${row.enemyId} draws at its sheet scale`);
    assert.equal(draw.accentHex, hexFor(row.hue),
      `${row.enemyId} wears its sheet hue on the accent channel`);
    // The draw scale is presentation only: the sim body numbers stay the sheet's.
    assert.equal(spec.radius, row.radius, `${row.enemyId} keeps the sheet collision radius`);
    assert.equal(spec.mass, row.mass, `${row.enemyId} keeps the sheet mass`);
  }
});

test('unstamped entities keep the unchanged draw defaults', () => {
  for (const entity of [
    { type: 'ship', team: 0, radius: 8, data: {} },
    { type: 'ship', team: 1, radius: 8 },
    { type: 'place' },
    {},
    null,
    undefined,
    { type: 'ship', data: { swarmCharacter: null } },
    { type: 'ship', data: { swarmCharacter: 'wasp' } },
  ]) {
    const spec = swarmCharacterDrawSpec(entity);
    assert.equal(spec.scale, 1);
    assert.equal(spec.accentHex, null);
  }
});

test('a partial or malformed stamp falls back per-field rather than drawing garbage', () => {
  const cases = [
    { swarmCharacter: { scale: 1.5 }, expected: { scale: 1.5, accentHex: null } },
    { swarmCharacter: { hue: 0xff3524 }, expected: { scale: 1, accentHex: '#ff3524' } },
    { swarmCharacter: { scale: -1, hue: 0xffb42a }, expected: { scale: 1, accentHex: '#ffb42a' } },
    { swarmCharacter: { scale: NaN, hue: 0x8f1d22 }, expected: { scale: 1, accentHex: '#8f1d22' } },
    { swarmCharacter: { scale: '1.5', hue: 'red' }, expected: { scale: 1, accentHex: null } },
    { swarmCharacter: { scale: 1.35, hue: 0x1ffa53a }, expected: { scale: 1.35, accentHex: '#ffa53a' } },
  ];
  for (const { swarmCharacter, expected } of cases) {
    const spec = swarmCharacterDrawSpec({ type: 'ship', data: { swarmCharacter } });
    assert.equal(spec.scale, expected.scale, `scale for ${JSON.stringify(swarmCharacter)}`);
    assert.equal(spec.accentHex, expected.accentHex, `hue for ${JSON.stringify(swarmCharacter)}`);
  }
});

test('the warm exemplars carry the stamp — coverage resolves the palette a spawn will draw', () => {
  for (const spec of swarmRosterShipExemplarSpecs('test:ship:')) {
    const enemyId = spec.data.lootTableId;
    const row = swarmCharacterFor(enemyId);
    if (!row) continue;
    const draw = swarmCharacterDrawSpec(spec);
    assert.equal(draw.scale, row.scale, `${enemyId} exemplar draws at its sheet scale`);
    assert.equal(draw.accentHex, hexFor(row.hue),
      `${enemyId} exemplar carries the sheet hue`);
  }
});
