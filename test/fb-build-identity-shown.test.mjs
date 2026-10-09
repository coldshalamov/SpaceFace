// FB-058 — build identity reaches a screen.
//
// Packet law: shipworks shows the player's archetype badge as a fifth hero band and prints each
// synergy tell WITH its drawback plus each unique module's `variantBonuses` as a "what is
// different" row; targetPanel shows a scanned NPC's badge only at the SF-133 disclosure stage
// (full/deep reveal). The UI reads the buildIdentity classifier — it never recomputes identity —
// and no loot-rarity ladder is added.
import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBuildIdentity } from '../src/systems/buildIdentity.js';
import { MODULES } from '../src/data/modules.js';
import { variantBonusWords } from '../src/ui/station/screens/shipworks.js';
import { targetBuildBadgeLabel } from '../src/ui/targetPanel.js';

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

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

test('a lone ram plate reads as a hull role, and no tell is claimed for a missing pair', () => {
  const identity = classifyBuildIdentity(['mod_ram_plate']);
  assert.equal(identity.synergyNotes.length, 0,
    'the synergy filter only yields complete pairs — no half-tell is advertised');
  assert.ok(identity.label.length > 0, 'the badge still answers a role read');
});

test('variantBonuses print as one "what is different" line per key', () => {
  const unique = MODULE_BY_ID.get('unique_choir_bell_aegis');
  assert.ok(unique && unique.unique, 'fixture: an authored unique module');
  const words = variantBonusWords(unique.variantBonuses);
  assert.match(words, /\+25 % shield flat/);
  assert.match(words, /\+50 % energy draw/, 'a cost is printed too — bonuses are not flattering-only');
  assert.match(words, /1 missile knockback uses \/ fight|missile knockback/);
});

test('the NPC badge answers only at the SF-133 disclosure stage', () => {
  const npc = {
    data: {
      buildIdentity: { label: 'Ghost Hauler' },
      scanRevealed: { quality: 'deep' },
    },
  };
  assert.equal(targetBuildBadgeLabel(npc), 'GHOST HAULER');

  for (const quality of ['contact', 'class', 'partial', null, undefined]) {
    const hidden = {
      data: {
        buildIdentity: { label: 'Ghost Hauler' },
        scanRevealed: quality ? { quality } : null,
      },
    };
    assert.equal(targetBuildBadgeLabel(hidden), null,
      `quality=${quality} never advertises hidden hardware`);
  }

  // A full read with no classified build stays silent rather than inventing a badge.
  assert.equal(targetBuildBadgeLabel({ data: { scanRevealed: { quality: 'full' } } }), null);
});
