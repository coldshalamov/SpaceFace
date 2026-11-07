// FB-058 — build identity reaches a screen.
//
// Packet law: shipworks shows the player's archetype badge from the Ship Sheet's own shape, never
// a second classifier; targetPanel shows a scanned NPC's badge only at the SF-133 disclosure stage
// (full/deep reveal), and that badge uses the Ship Sheet's vocabulary too. No loot-rarity ladder is
// added, and the old raw `variantBonuses` line is gone from the rows (the sheet delta is the one
// statement of what a fit changes).
import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBuildIdentity } from '../src/systems/buildIdentity.js';
import { fittingsFromDefaultModules } from '../src/systems/ships.js';
import { shipStatSheet } from '../src/ui/ship/shipStats.js';
import { targetBuildBadgeLabel } from '../src/ui/targetPanel.js';

test('the fit model’s classifier answers badge, tell, and drawback for a known pair', () => {
  // mod_ram_plate + mod_cargo_pod_m is the authored 'rammer_truck' synergy; its drawback is part
  // of the authored record and must reach the band verbatim.
  const identity = classifyBuildIdentity(['mod_ram_plate', 'mod_cargo_pod_m']);
  assert.equal(identity.id, 'rammer_truck');
  assert.equal(identity.label, 'Rammer-Truck', 'the hero badge reads the archetype');
  assert.match(identity.summary, /cargo/i);

  const tells = identity.synergyNotes.filter((n) => !n.hidden);
  assert.equal(tells.length, 1);
  const tell = tells[0];
  assert.equal(tell.active, true);
  assert.match(tell.text, /Rammer-Truck/);
  assert.match(tell.text, /Drawback: -turn rate from added mass/,
    'the tell carries its drawback, not just the benefit');
});

test('the NPC badge answers only at the SF-133 disclosure stage', () => {
  const warden = {
    data: {
      buildIdentity: { label: 'Gunship', basis: { shipId: 'ship_warden', role: 'gunship', modules: [] } },
      scanRevealed: { quality: 'deep' },
    },
  };
  const expected = shipStatSheet({
    shipId: 'ship_warden',
    fittings: fittingsFromDefaultModules('ship_warden', []),
  }).identity.label.toUpperCase();
  assert.notEqual(expected, 'GUNSHIP', 'fixture: the sheet vocabulary is not the scanner word');
  assert.equal(targetBuildBadgeLabel(warden), expected,
    'the badge speaks the Ship Sheet vocabulary, not the scanner hull-role word');

  for (const quality of ['contact', 'class', 'partial', null, undefined]) {
    const hidden = {
      data: {
        buildIdentity: { label: 'Gunship', basis: { shipId: 'ship_warden', modules: [] } },
        scanRevealed: quality ? { quality } : null,
      },
    };
    assert.equal(targetBuildBadgeLabel(hidden), null,
      `quality=${quality} never advertises hidden hardware`);
  }

  // A legacy stamp with no resolvable hull still answers its own label.
  assert.equal(targetBuildBadgeLabel({
    data: { buildIdentity: { label: 'Ghost Hauler' }, scanRevealed: { quality: 'deep' } },
  }), 'GHOST HAULER');

  // A full read with no classified build stays silent rather than inventing a badge.
  assert.equal(targetBuildBadgeLabel({ data: { scanRevealed: { quality: 'full' } } }), null);
});
