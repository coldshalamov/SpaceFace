// a11y-danger-captions — the warnings a deaf player must not miss speak in words, not ids.
//
// FB-123 guarantees every non-blip recipe resolves to a caption, but the fallback is the
// recipe id's own words at the family's urgency: `sfx_subsystem_drive_disabled` read as
// "Subsystem drive disabled." at NORMAL urgency, `sfx_mining_gas_hazard` as "Mining gas hazard."
// — words that name a file, not the moment, and none of them flagged the player's eye the way
// the sound itself cuts through the mix. The danger family now carries authored captions at the
// urgency the moment deserves: capability loss and hull breach are high, the telegraphs and
// warnings a pilot must act on are warn. The fallback stays for everything else.
import test from 'node:test';
import assert from 'node:assert/strict';

import { captionForGameplayRecipe } from '../src/ui/captions.js';

const DANGER_HIGH = [
  ['sfx_subsystem_disabled', 'A subsystem burns out.'],
  ['sfx_subsystem_drive_disabled', 'A drive subsystem goes down.'],
  ['sfx_subsystem_sensor_disabled', 'A sensor subsystem goes dark.'],
  ['sfx_subsystem_weapon_disabled', 'A weapon subsystem fails.'],
  ['sfx_hull_decompress', 'A hull breaches.'],
  ['sfx_mining_gas_hazard', 'Gas vents from the seam.'],
];
const DANGER_WARN = [
  ['sfx_combat_near_miss', 'A round slips past.'],
  ['sfx_doctrine_ranged_charge', 'A hostile lines up a shot.'],
  ['sfx_swarm_alert_tick', 'The chain is about to break.'],
  ['sfx_travel_interdiction', 'You are being pulled over.'],
  ['sfx_mining_fracture_warning', 'The rock is about to fracture.'],
  ['sfx_mining_heat_warning', 'The drill is running hot.'],
];

test('capability loss and breach captions are authored and high-urgency', () => {
  for (const [id, text] of DANGER_HIGH) {
    const cap = captionForGameplayRecipe(id, {}, null);
    assert.equal(cap.text, text, id);
    assert.equal(cap.urgency, 'high', `${id} urgency`);
    assert.equal(cap.authored, true, `${id} is authored, not the family fallback`);
  }
});

test('telegraphs and act-on-this warnings are authored and warn-urgency', () => {
  for (const [id, text] of DANGER_WARN) {
    const cap = captionForGameplayRecipe(id, {}, null);
    assert.equal(cap.text, text, id);
    assert.equal(cap.urgency, 'warn', `${id} urgency`);
    assert.equal(cap.authored, true, `${id} is authored`);
  }
});

test('nothing outside the family changed: an uncovered recipe still falls back honestly', () => {
  const cap = captionForGameplayRecipe('sfx_vent_chime', { category: 'cue' }, null);
  assert.equal(cap.authored, false, 'the family fallback remains the default');
  assert.equal(cap.urgency, 'normal');
  assert.match(cap.text, /^Vent chime\.$/);
  assert.equal(captionForGameplayRecipe('sfx_ui_confirm', {}, null), null,
    'ui blips stay uncaptioned');
});
