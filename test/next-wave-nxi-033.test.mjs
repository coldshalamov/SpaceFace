// NXI-033 — a used-up fitted magazine stays recognizable on the rack.
import test from 'node:test';
import assert from 'node:assert/strict';

import { BOMB_DEFS } from '../src/data/bombs.js';
import { readBombBayModel } from '../src/ui/powerRail.js';

const FRAG = BOMB_DEFS.bomb_frag;
const CONCUSSION = BOMB_DEFS.bomb_concussion;

function bayState(cells, selectedId = null) {
  return {
    mode: 'flight',
    playerId: 1,
    bombs: { selectedId, rack: { cells } },
    entities: { get(id) { return id === 1 ? { alive: true, flags: {} } : null; } },
    entityList: [],
  };
}

test('NXI-033: a dry fitted cell stays named and is not a sellable empty rack', () => {
  const state = bayState([{ id: FRAG.id, count: 0 }]);
  const model = readBombBayModel(state, 0);
  assert.equal(model.name, FRAG.shortName);
  assert.ok(model.description.includes(FRAG.name), model.description);
  assert.ok(model.description.includes('×0'), model.description);
  assert.notEqual(model.badge, 'RACK EMPTY');
  assert.equal(model.state, 'empty');
  assert.equal(state.bombs.selectedId, null);
});

test('NXI-033: a loaded cell still owns the socket, and an unknown dry socket stays an empty rack', () => {
  const loaded = bayState([{ id: FRAG.id, count: 2 }], FRAG.id);
  const loadedModel = readBombBayModel(loaded, 0);
  assert.equal(loadedModel.name, FRAG.shortName);
  assert.ok(loadedModel.description.includes('×2 loaded'), loadedModel.description);
  assert.equal(loadedModel.badge, 'BAY');

  const sibling = bayState([
    { id: FRAG.id, count: 0 },
    { id: CONCUSSION.id, count: 1 },
  ]);
  const siblingModel = readBombBayModel(sibling, 0);
  assert.equal(siblingModel.name, CONCUSSION.shortName);
  assert.ok(siblingModel.description.includes('×1 loaded'), siblingModel.description);

  const unknown = bayState([{ id: 'not_a_bomb', count: 0 }]);
  const unknownModel = readBombBayModel(unknown, 0);
  assert.equal(unknownModel.name, 'Bay');
  assert.equal(unknownModel.badge, 'RACK EMPTY');
});
