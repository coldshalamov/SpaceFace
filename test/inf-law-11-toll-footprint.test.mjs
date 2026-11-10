import test from 'node:test';
import assert from 'node:assert/strict';
import { footprintChains, footprintScreen, footprintSources, nodeWhy } from '../src/ui/screens/footprint.js';
import { lawScenario } from './helpers/infLawScenario.mjs';

test('LAW-11 [4242] a paid toll is one settled Footprint row, including on re-read and reload', () => {
  const { state, law, events } = lawScenario();
  const paid = events('law:obligationPaid');
  const bill = { kind: 'toll', causeId: 'helios:passage:4242', label: 'Helios passage toll', amountCr: 120 };
  law.noteComposedObligation(bill);
  law.payComposedObligation({ ...bill, amountCr: 40 });
  assert.equal(footprintChains(state).length, 0, 'partial payments are still open');
  law.payComposedObligation({ kind: bill.kind, causeId: bill.causeId });
  assert.equal(paid.filter((row) => row.status === 'paid').length, 1);
  assert.equal(state.player.credits, 4880, 'the authored toll is unchanged');

  const rows = footprintChains(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'obligation:toll:helios:passage:4242');
  assert.equal(rows[0].open, false);
  assert.equal(rows[0].outcome, 'settled');
  assert.equal(rows[0].t, 100);
  assert.equal(nodeWhy(rows[0].nodes[0]), 'Toll settled — Helios passage toll · 120 cr.');
  assert.equal(footprintSources(state, rows)[0].name, 'Toll · settled');
  assert.deepEqual(footprintChains(state), rows);
  assert.equal(state.provenance.chains.length, 0, 'reading does not append to another owner');

  // Drive the screen's actual refresh seam without a DOM/layout test.
  const screen = Object.create(footprintScreen);
  screen._ctx = { state };
  screen._board = screen._record = { hidden: false };
  screen._stateHost = { hidden: true };
  for (const name of ['_paintHeader', '_ensureSelection', '_showBoard', '_renderHang', '_renderBoard', '_renderRecord', '_renderVerbs', '_queueEdgeDraw']) screen[name] = () => {};
  screen.refresh(screen._ctx);
  screen.refresh(screen._ctx);
  assert.deepEqual(screen._chains, rows, 'the default Footprint reader includes the paid row once');

  const saved = structuredClone(law.serialize());
  law.deserialize(saved);
  assert.deepEqual(footprintChains(state), rows, 'Continue keeps the settled payment stamp');
  assert.equal(law.payComposedObligation(bill).reason, 'already_paid');
  assert.equal(law.composedDisposition()[0].advertisePay, false);
  assert.equal(paid.length, 2, 're-read, load, and duplicate payment emit no extra payment');
});
