import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REDUCED_MOTION_INFORMATION_CUES,
  buildReducedMotionContactCue,
} from '../src/ui/reducedMotionInformation.js';
import { buildDamageIndicatorCue } from '../src/ui/damageIndicators.js';
import {
  flightDestinationSurface,
  masslineTetherStatus,
  resolveFlightObjectiveCommand,
} from '../src/ui/hud.js';
import { lawChangeLine, stepLawHud } from '../src/ui/sectorLawPresenter.js';
import { admitReceipt, stuntDetectionReceipt } from '../src/ui/hudAttention.js';
import { resolveCollisionFeel } from '../src/render/feel.js';

test('Wave E2: Reduced motion keeps every gameplay fact while dropping camera shake and flash juice', () => {
  // 1. Hit direction & contact fact stay intact
  const contactCue = buildReducedMotionContactCue({
    aId: 'player_hull',
    bId: 'pirate_reaver_1',
    pos: { x: 150, z: -80 },
    otherPos: { x: 150, z: -80 },
  }, 'player_hull');

  assert.ok(contactCue, 'contact cue must be created for player impact');
  assert.equal(contactCue.attackerId, 'pirate_reaver_1', 'attacker id must stay preserved');
  assert.equal(contactCue.dominantLayer, 'hull', 'impact layer must stay preserved');
  assert.equal(contactCue.attackerPos.x, 150, 'hit direction coordinate X must stay preserved');
  assert.equal(contactCue.attackerPos.z, -80, 'hit direction coordinate Z must stay preserved');

  const shieldCue = buildDamageIndicatorCue({
    applied: 24,
    dominantLayer: 'shield',
    attackerId: 42,
    after: { shield: 50, shieldMax: 100 },
  });
  assert.equal(shieldCue.layer, 'shield');
  assert.equal(shieldCue.glyph, 'S', 'shield damage indicator glyph stays preserved');

  // Juice drops: collision feel returns null under reduced motion
  const feelWithMotion = resolveCollisionFeel({ dp: 120 }, {
    deltaV: 120, playerDistance: 0, motionReduce: false, mode: 'flight',
  });
  assert.ok(feelWithMotion, 'feel punch exists when motionReduce is false');

  const feelReduced = resolveCollisionFeel({ dp: 120 }, {
    deltaV: 120, playerDistance: 0, motionReduce: true, mode: 'flight',
  });
  assert.equal(feelReduced, null, 'camera shake/time freeze juice drops when motionReduce is true');

  // 2. Flight objective stays intact
  const state = {
    simTime: 45,
    settings: { video: { motionReduce: true }, accessibility: { reducedMotion: true } },
    story: { beatIndex: 1 },
    missions: { active: [] },
    nav: { targetId: 'station_helios' },
    ui: {},
  };
  const command = resolveFlightObjectiveCommand(state);
  const objective = flightDestinationSurface(state, command);
  assert.equal(objective.show, true, 'objective surface must stay visible under reduced motion');
  assert.ok(objective.line && objective.line.trim().length > 0, 'objective text line must not be empty');

  // 3. Law change stays intact
  const lawEvent = {
    type: 'change',
    profile: { sectorName: 'Helios Prime', level: 'HIGH_SECURITY', jurisdiction: 'Concord Core' },
  };
  const law = stepLawHud(null, lawEvent, state.simTime);
  assert.ok(law, 'law HUD element must be produced');
  assert.equal(law.mode, 'line');
  assert.equal(law.line, lawChangeLine(lawEvent.profile));
  assert.match(law.line, /HELIOS PRIME/, 'law change banner names the new sector');

  // 4. Stunt name stays intact
  const stunt = stuntDetectionReceipt(new Set(), { name: 'Kinetic Fling', episodeId: 'fling_101' });
  assert.equal(stunt.text, 'Kinetic Fling', 'stunt name must be preserved');
  assert.equal(stunt.channel, 'stunt');

  const admittedStunt = admitReceipt({
    text: stunt.text, kind: stunt.kind, channel: stunt.channel, combat: true,
  });
  assert.equal(admittedStunt.admit, true, 'stunt name remains admitted to HUD attention');

  // 5. Massline loaded status remains readable without vibration/shake
  const lineStatus = masslineTetherStatus({
    active: true, phase: 'loaded', load: 0.85, strain: 0.002, automaticBreakAllowed: false,
  });
  assert.match(String(lineStatus.text), /LOADED/i, 'taut line text status LOADED is preserved');
});
