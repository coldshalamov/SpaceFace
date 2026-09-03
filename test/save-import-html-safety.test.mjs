import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEconomyEventType,
  normalizeRestoredEconomyEvent,
} from '../src/systems/economy.js';
import { marketEventTypeHtml } from '../src/ui/screens/market.js';
import {
  canonicalCargoItemId,
  cargoItemLabelHtml,
  cargoItemRefAttr,
  normalizeCargoItemKey,
} from '../src/ui/screens/stationHub.js';
import { automation, normalizeAutomationRecordId } from '../src/systems/automation.js';
import { automationRecordRefAttr } from '../src/ui/screens/automationPanel.js';
import { normalizeProvenanceText } from '../src/systems/provenanceLedger.js';
import { footprintReadoutHtml } from '../src/ui/screens/footprint.js';

const HOSTILE = '"><img src=x onerror=alert(1)>';

test('save-derived event types are allowlisted on restore and encoded at the market sink', () => {
  assert.equal(normalizeEconomyEventType(HOSTILE), null);
  assert.equal(normalizeRestoredEconomyEvent({ type: HOSTILE }), null);

  const restored = normalizeRestoredEconomyEvent({ type: ' SHORTAGE ' });
  assert.equal(restored.type, 'shortage');

  const rendered = marketEventTypeHtml(HOSTILE);
  assert.doesNotMatch(rendered, /<(?:img|svg|script)\b/i);
  assert.match(rendered, /&lt;IMG/i);
});

test('cargo keys remain visible as escaped text but cannot become malformed sell attributes', () => {
  assert.equal(normalizeCargoItemKey(HOSTILE), HOSTILE);
  assert.equal(canonicalCargoItemId(HOSTILE), null);
  assert.equal(cargoItemRefAttr(HOSTILE), '');

  const label = cargoItemLabelHtml(HOSTILE);
  assert.doesNotMatch(label, /<(?:img|svg|script)\b/i);
  assert.match(label, /&lt;img/i);

  assert.equal(canonicalCargoItemId('cmdty_ore_iron'), 'cmdty_ore_iron');
  assert.equal(cargoItemRefAttr('cmdty_ore_iron'), 'cmdty_ore_iron');
});

test('restored automation identities are canonicalized before escaped data-ref rendering', () => {
  assert.equal(normalizeAutomationRecordId(HOSTILE, 'drone_1'), 'drone_1');
  const ref = automationRecordRefAttr(HOSTILE, 'drone_1');
  assert.equal(ref, 'drone_1');
  assert.doesNotMatch(ref, /["'<>]/);

  const restored = {
    drones: [{ id: HOSTILE }],
    traders: [],
    outposts: [],
    fleet: [],
  };
  automation._normalizeAutomation.call({ state: { world: { currentSectorId: null } } }, restored);
  assert.equal(restored.drones[0].id, 'drone_1');
  assert.doesNotMatch(restored.drones[0].id, /["'<>]/);
});

test('provenance text stays text data and the selected readout encodes it', () => {
  assert.equal(normalizeProvenanceText(HOSTILE), HOSTILE);
  const rendered = footprintReadoutHtml(
    { rootKind: 'incident', outcome: 'witnessed_only', open: false, nodes: [] },
    { k: 'incident', text: HOSTILE },
    { player: { bounty: 0 } },
  );
  assert.doesNotMatch(rendered, /<(?:img|svg|script)\b/i);
  assert.match(rendered, /&lt;img/i);
});
