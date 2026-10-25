// Row 444 GOLD-LEDGER — the case board reaches a real save: the save system's own
// serialize→loadEnvelope path carries pins/links, and a pin whose evidence never
// landed in the restored state is dropped on the way in. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { fnv1a } from '../src/save/checksum.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  pinEvidence, linkEvidence, shipLedgerBoard,
  SHIP_LEDGER_VERGE_EVIDENCE_PAGES,
} from '../src/systems/shipLedger.js';

const VERGE_A = SHIP_LEDGER_VERGE_EVIDENCE_PAGES[0].pageId; // verge.kell_paper_trail
const VERGE_B = SHIP_LEDGER_VERGE_EVIDENCE_PAGES[1].pageId; // verge.archive_file
const VERGE_A_KEY = SHIP_LEDGER_VERGE_EVIDENCE_PAGES[0].vergeKey;
const VERGE_B_KEY = SHIP_LEDGER_VERGE_EVIDENCE_PAGES[1].vergeKey;

// The restore writes vitals through Three-style vectors — a minimal shim with the two
// calls the load path makes (pos.set(x,y,z), prevPos.copy(pos), vel.set).
function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  };
}

function bootState() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.story = { verge: { evidence: {} } };
  state.player.credits = 4321;
  state.player.cargo = { items: {}, capVolume: 40, capMass: 40, usedMass: 0 };
  // The restore needs a live player entity, not just the profile — the same fixture the
  // model-truth round trip builds.
  const player = makeShipEntitySpec({
    id: state.nextEntityId++, defId: 'ship_kestrel', pos: { x: 0, z: 0 }, team: 0,
  });
  player.type = 'ship'; player.alive = true;
  player.pos = vec(0, 0); player.prevPos = vec(0, 0); player.vel = vec(0, 0);
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: player.data.fittings }];
  state.player.activeShipIndex = 0;
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  save.state = state;
  save.bus = { emit() {}, on() { return () => {}; }, off() {} };
  save.helpers = {
    routeCombatDamage() {}, getCombatCapabilities() { return null; },
    getEntity(id) {
      const e = state.entities.get(id);
      // The restore's entity rebuild produces plain {x,z} poses — upgrade whatever it made
      // so the saved-pose write (pos.set/prevPos.copy/vel.set) has the vec contract.
      if (e) {
        if (e.pos && typeof e.pos.set !== 'function') e.pos = vec(e.pos.x, e.pos.z);
        if (e.prevPos && typeof e.prevPos.copy !== 'function') e.prevPos = vec(e.prevPos.x, e.prevPos.z);
        if (e.vel && typeof e.vel.set !== 'function') e.vel = vec(e.vel.x, e.vel.z);
      }
      return e;
    },
    player() { return state.entities.get(state.playerId); },
    spawnEntity(spec) {
      const ent = { ...spec, id: state.nextEntityId++, alive: true };
      if (!ent.pos) ent.pos = vec(0, 0);
      if (!ent.prevPos) ent.prevPos = vec(ent.pos.x, ent.pos.z);
      if (!ent.vel) ent.vel = vec(0, 0);
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
  };
  save.registry = { get() { return null; } };
  return state;
}

test('a real save→load round trip through the save system keeps pins and links', () => {
  const state = bootState();
  state.story.verge.evidence[VERGE_A_KEY] = true;
  state.story.verge.evidence[VERGE_B_KEY] = true;
  assert.equal(pinEvidence(state, VERGE_A).ok, true);
  assert.equal(pinEvidence(state, VERGE_B).ok, true);
  assert.equal(linkEvidence(state, VERGE_A, VERGE_B).ok, true);
  assert.equal(shipLedgerBoard(state).pins.length, 2);

  const envelope = save.serialize('roundtrip');
  const persisted = JSON.parse(JSON.stringify(envelope.data));
  assert.equal(persisted.shipLedger.board.pins.length, 2, 'the board rides the envelope');
  assert.equal(persisted.shipLedger.board.links.length, 1);

  // Same-state load (the save path restores into the live state): the board survives intact.
  delete state.shipLedger;
  const ok = save.loadEnvelope(envelope, 'roundtrip');
  assert.equal(ok, true);
  const board = shipLedgerBoard(state);
  assert.ok(board, 'the board restores');
  assert.deepEqual(board.pins, [VERGE_A, VERGE_B]);
  assert.deepEqual(board.links, [[VERGE_B, VERGE_A]], 'links keep canonical sorted order');
});

test('a pin whose evidence never landed is dropped on restore, and its links go with it', () => {
  const state = bootState();
  state.story.verge.evidence[VERGE_A_KEY] = true;
  state.story.verge.evidence[VERGE_B_KEY] = true;
  pinEvidence(state, VERGE_A);
  pinEvidence(state, VERGE_B);
  linkEvidence(state, VERGE_A, VERGE_B);
  const envelope = save.serialize('roundtrip');

  // The evidence that earned the second pin never lands in the restored state — corrupt the
  // envelope the way a partial save would: the board records the pin but the evidence is gone.
  const storyBag = envelope.data.story || (envelope.data.missions && envelope.data.missions.story);
  assert.ok(storyBag && storyBag.verge, 'story rides the envelope');
  storyBag.verge.evidence[VERGE_B_KEY] = false;
  envelope.checksum = fnv1a(JSON.stringify(envelope.data)); // re-stamp after the corruption
  delete state.shipLedger;
  const ok = save.loadEnvelope(envelope, 'roundtrip');
  assert.equal(ok, true);
  const board = shipLedgerBoard(state);
  assert.deepEqual(board.pins, [VERGE_A], 'the unfound pin is dropped');
  assert.deepEqual(board.links, [], 'a link needing the dropped pin cannot survive');
});

test('an untouched run still serializes no board', () => {
  const state = bootState();
  const envelope = save.serialize('roundtrip');
  const data = JSON.parse(JSON.stringify(envelope.data));
  assert.equal(Object.keys(data.shipLedger || {}).includes('board'), false,
    'a lazy board writes the absent bag');
});
