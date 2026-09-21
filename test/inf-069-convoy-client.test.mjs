// INF-069 — one mission contact's three-state arc. The convoy client's exchange is bound to
// live receipts: its reaction fires on the first real salvage credit (once, persisted), its
// thanks fires only inside dock settlement for a manifest actually delivered (full or short),
// and abandonment/expiry closes the file with no thanks. It can neither thank for
// unperformed work nor re-introduce itself after the job resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { convoyClientVoice } from '../src/systems/missions.js';

const successor = (params = {}) => ({
  type: 'salvage_retrieval',
  status: 'active',
  mutationTag: 'salvage',
  params: { cmdtyId: 'cmdty_scrap_metal', qty: 4, ...params },
});

test('the arc answers approach, full delivery, short delivery, and loss distinctly', () => {
  const reacting = convoyClientVoice(successor(), 'recovering', 'Helios');
  assert.equal(reacting.sender, 'Helios Salvage Desk', 'a reachable contact speaks');
  assert.match(reacting.text, /bring what's left/i, 'reaction answers the approach, not the outcome');

  const full = convoyClientVoice(successor(), 'completed', 'Helios');
  assert.match(full.text, /thanks/i, 'full delivery earns thanks');
  assert.match(full.text, /4u/, 'thanks names the manifest actually delivered');

  const partial = convoyClientVoice(
    successor({ completionMethod: 'partial_recovery' }), 'completed', 'Helios',
  );
  assert.doesNotMatch(partial.text, /thanks/i, 'short delivery is settled, never thanked');
  assert.match(partial.text, /short manifest/i, 'short delivery says what it is');

  const cold = convoyClientVoice(successor(), 'failed', 'Helios');
  assert.doesNotMatch(cold.text, /thanks/i, 'abandonment is never thanked');
  assert.match(cold.text, /closed/i, 'abandonment closes the file');
});

test('the voice never leaks onto other contracts or outcomes', () => {
  assert.equal(convoyClientVoice({ type: 'salvage_retrieval', params: {} }, 'completed', 'H'), null, 'ordinary salvage keeps its own voice');
  assert.equal(convoyClientVoice({ type: 'escort', params: {} }, 'completed', 'H'), null, 'the escort keeps its own voice');
  assert.equal(convoyClientVoice(successor(), 'accepted', 'H'), null, 'no voice for unsettled states');
});

test('the wiring binds the voice to settlement and first credit only', () => {
  const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /convoyClientVoice\(m, 'completed', this\._stationName\(m && m\.destStationId\)\)/,
    'thanks is authored inside dock settlement',
  );
  assert.match(
    source,
    /convoyClientVoice\(m, 'failed', this\._stationName\(m && m\.destStationId\)\)/,
    'the cold file is authored inside loss settlement',
  );
  assert.match(
    source,
    /convoyClientReacted = true;/,
    'the reaction carries a persisted once-flag',
  );
  assert.match(
    source,
    /'[^']* Salvage Desk'/,
    'settlement speaks as the home desk, not the board',
  );
});
