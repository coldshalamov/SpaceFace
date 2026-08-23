// Asteroid Works render contract — the contact ring the clamp arms are built from.
//
// WHY THIS FILE EXISTS. asteroidRenderer3d.syncMachineArms used to build a machine's clamp arms
// from `projection.machines[i].geo`, which is an alias of asteroidSites' cached `rt.geo[id]`. That
// cache is rebuilt wholesale when a neighbour is bored, so until the screen's projection cache
// caught up the arms kept clamping a cell the player had already hollowed out. The renderer now
// walks its own CONTACT_RING over the LIVE drill field instead — which is the same field-truth
// rule asteroidSites.canInstall already states for itself ("the live session field when drilling,
// else the durable record").
//
// That correctness now rests on the renderer's private ring being byte-identical in ORDER and
// MEANING to siteProduction's unexported RING_OFFSETS. The renderer reports a divergence to the
// console at module load but deliberately does NOT throw: uiRoot.registerScreens() swallows a
// module-evaluation rejection with a console.warn and skips the screen, so throwing would delete
// the entire mining board from the game while boot and every headless check stayed green. This
// file is the hard gate that fails a build instead.
//
// Pure per test/AGENTS.md: no DOM, no WebGL, no canvas, no wall clock. It calls only exported
// pure helpers. The pixels themselves still need a runtime probe — see
// scripts/capture-asteroid-works.mjs and the renderer's machineContacts() hook.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CONTACT_RING, contactRingDivergence } from '../src/ui/asteroid/asteroidRenderer3d.js';
import { contactKind, contactProfile } from '../src/systems/siteProduction.js';

/** The renderer's own signature rule, reproduced here so a reorder cannot pass silently. */
function ringSignature(field, cols, rows, col, row) {
  const parts = [];
  for (const [dc, dr] of CONTACT_RING) {
    const c = col + dc;
    const r = row + dr;
    const tile = (c >= 0 && c < cols && r >= 0 && r < rows && field[c]) ? field[c][r] : null;
    const kind = contactKind(tile);
    parts.push(`${c},${r},${kind},${kind === 'ore' ? (tile.ore || '') : ''}`);
  }
  return parts.join(';');
}

test('renderer CONTACT_RING agrees with the sim ring on every kind and on the boundary', () => {
  assert.equal(
    contactRingDivergence(), null,
    'asteroidRenderer3d.CONTACT_RING no longer matches siteProduction.contactProfile — the clamp '
    + 'arms would be built for different cells than the sim pays yield for',
  );
});

test('CONTACT_RING is the eight neighbours in reading order, centre excluded', () => {
  // Pinned literally: contactRingDivergence() compares the two sides, so a matching reorder of
  // BOTH would still pass. This is the renderer half held still.
  assert.deepEqual(CONTACT_RING.map((o) => [o[0], o[1]]), [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]);
  assert.equal(CONTACT_RING.length, 8);
  assert.ok(Object.isFrozen(CONTACT_RING), 'a mutable ring could be reordered at runtime');
  assert.ok(
    !CONTACT_RING.some(([dc, dr]) => dc === 0 && dr === 0),
    'the seat itself is never a contact — a machine sits on a hollow cell',
  );
});

test('contactKind maps every drill tile type the renderer can meet', () => {
  assert.equal(contactKind(null), 'empty', 'out of bounds contributes nothing');
  assert.equal(contactKind(undefined), 'empty');
  assert.equal(contactKind({ type: 'empty' }), 'empty');
  assert.equal(contactKind({ type: 'dirt' }), 'matrix');
  assert.equal(contactKind({ type: 'rock' }), 'basalt');
  assert.equal(contactKind({ type: 'gas' }), 'gas');
  assert.equal(contactKind({ type: 'vein', ore: 'ore_iron' }), 'ore');
  // A vein with no ore id is not a payable contact; it must not read as ore or the arm would be
  // painted for a material the sim never credits.
  assert.equal(contactKind({ type: 'vein', ore: null }), 'basalt');
  // A machine housing stamped onto a hollow cell (asteroidSites._stampStructures writes
  // tile.structure and leaves tile.type alone) stays hollow, so it never grows a clamp arm.
  assert.equal(contactKind({ type: 'empty', structure: 'm_1' }), 'empty');
});

test('boring a neighbour releases that contact from the ring signature', () => {
  // The whole point of reading the live field: the signature must change the instant the tile
  // does, without waiting for a projection rebuild.
  const cols = 3;
  const rows = 3;
  const field = [];
  for (let c = 0; c < cols; c++) {
    field[c] = [];
    for (let r = 0; r < rows; r++) field[c][r] = { type: 'vein', ore: 'ore_iron' };
  }
  field[1][1] = { type: 'empty' };            // the seat

  const before = ringSignature(field, cols, rows, 1, 1);
  assert.ok(before.includes('0,0,ore,ore_iron'), before);
  assert.equal(contactProfile(field, 1, 1, cols, rows).solid, 8);

  field[0][0] = { type: 'empty' };            // the player bores one neighbour
  const after = ringSignature(field, cols, rows, 1, 1);
  assert.notEqual(after, before, 'a bored neighbour must change the ring signature');
  assert.ok(after.includes('0,0,empty,'), after);
  assert.equal(contactProfile(field, 1, 1, cols, rows).solid, 7, 'the sim agrees it is gone');
});

test('the ring signature and the sim profile stay cell-for-cell identical as the field changes', () => {
  const cols = 5;
  const rows = 5;
  const field = [];
  for (let c = 0; c < cols; c++) {
    field[c] = [];
    for (let r = 0; r < rows; r++) {
      const m = (c + r) % 5;
      if (m === 0) field[c][r] = { type: 'vein', ore: `ore_${c}_${r}` };
      else if (m === 1) field[c][r] = { type: 'gas' };
      else if (m === 2) field[c][r] = { type: 'rock' };
      else if (m === 3) field[c][r] = { type: 'empty' };
      else field[c][r] = { type: 'dirt' };
    }
  }

  // Every legal seat on the board, including the corners where five neighbours are off-field.
  const seats = [[0, 0], [2, 2], [4, 4], [0, 2], [4, 0]];
  const bores = [null, [1, 1], [3, 3], [0, 1], [4, 3]];

  for (const bore of bores) {
    if (bore) field[bore[0]][bore[1]] = { type: 'empty' };
    for (const [col, row] of seats) {
      const seat = field[col][row];
      field[col][row] = { type: 'empty' };
      const cells = contactProfile(field, col, row, cols, rows).cells;
      const simSig = cells
        .map((c) => `${c.col},${c.row},${c.kind},${c.kind === 'ore' ? (c.ore || '') : ''}`)
        .join(';');
      assert.equal(
        ringSignature(field, cols, rows, col, row), simSig,
        `seat ${col},${row} after boring ${bore ? bore.join(',') : 'nothing'}`,
      );
      field[col][row] = seat;
    }
  }
});

test('the renderer module evaluates in plain Node and reports its ring without throwing', async () => {
  // Guards two things at once: the file parses and its whole import graph resolves (no DOM or
  // canvas touched at module scope), and the module-load ring probe stays non-fatal. A throw here
  // would be swallowed by uiRoot.registerScreens() in the real game and silently remove the
  // mining screen, so it must never be the failure mode.
  //
  // The cache-buster is load-bearing: this file's static import at the top already evaluated the
  // module before any test ran, so importing the plain specifier would return the cached instance
  // and the console spy below would capture nothing. A distinct specifier forces a fresh
  // evaluation with the spy installed. (`three` keeps its own specifier, so it stays cached.)
  const errors = [];
  const realError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };
  let mod;
  try {
    mod = await import(`../src/ui/asteroid/asteroidRenderer3d.js?fresh=${Date.now()}`);
  } finally {
    console.error = realError;
  }
  assert.equal(typeof mod.createAsteroidRenderer3d, 'function');
  assert.equal(typeof mod.contactRingDivergence, 'function');
  assert.deepEqual(
    errors.filter((e) => e.includes('CONTACT_RING')), [],
    'module load reported a ring divergence',
  );
});
