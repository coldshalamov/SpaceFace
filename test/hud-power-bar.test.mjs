import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { FLIGHT_POWER_COPY, readRailModel } from '../src/ui/powerRail.js';
import {
  consumePowerCaption,
  createCooldownTracker,
  isFirstSwarmRunOnProfile,
  POWER_CAPTION_LIMIT,
  readOrdnanceModel,
} from '../src/ui/orrery/hudAdapter.js';
import { arsenalIcon } from '../src/ui/orrery/arsenalGlyphs.js';
import { resolveHudAttention } from '../src/ui/hudAttention.js';
import { hasNearbyClaimableOrOwnedBody } from '../src/ui/fieldBuild/fieldBuildMode.js';

const FORBIDDEN_FLIGHT_WORDS = /\b(Well|Repulsor|Seed|Field|Cone|Rig|Gyre|Massline|Mass Seed)\b/i;

function baseState(extra = {}) {
  const player = {
    id: 1, type: 'ship', team: 1, alive: true,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    cap: 80, capMax: 100,
    data: { defId: 'ship_kestrel', weapons: [{ range: 900 }] },
  };
  return {
    mode: 'flight',
    simTime: 240,
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player],
    fields: { active: [], cooldowns: {} },
    massSeed: { phase: 'idle' },
    player: {
      cargo: { items: { cmdty_impulse_charge: 4 } },
      massSeed: { cooldownUntil: 0 },
      hints: {},
    },
    bombs: { selectedId: 'bomb_frag', rack: { sockets: 2, cells: [{ id: 'bomb_frag', count: 4 }] }, cooldowns: {} },
    onboarding: { startedAt: 0 },
    ...extra,
  };
}

test('HUD-POWER-BAR: six tiles share one plain-word grammar with no forbidden jargon', () => {
  const bindings = { pull: ['Digit1'], shove: ['Digit2'], pin: ['Digit3'], bomb: ['Digit4'], rig: ['Digit5'], tether: ['KeyF'] };
  const state = baseState();
  const ord = readOrdnanceModel(state, createCooldownTracker(), bindings);
  assert.deepEqual(
    ['1', '2', '3', '4', '5', '6'].map((id) => [ord[id].key, ord[id].label]),
    [['1', 'Pull'], ['2', 'Shove'], ['3', 'Pin'], ['4', 'Bomb'], ['5', 'Plow'], ['RMB / F', 'Line']],
  );
  for (const id of ['1', '2', '3', '4', '5', '6']) {
    const copy = FLIGHT_POWER_COPY[Number(id)];
    assert.ok(ord[id].briefTip.includes(copy.caption), `slot ${id} briefTip carries canonical one-line caption`);
    assert.doesNotMatch(ord[id].label, FORBIDDEN_FLIGHT_WORDS, `slot ${id} label avoids forbidden jargon`);
    assert.doesNotMatch(ord[id].briefTip, FORBIDDEN_FLIGHT_WORDS, `slot ${id} briefTip avoids forbidden jargon`);
    assert.doesNotMatch(ord[id].tip, FORBIDDEN_FLIGHT_WORDS, `slot ${id} tip avoids forbidden jargon`);
  }
  assert.equal(ord['4'].count, 4, 'Bomb carries numeric stock count for ×4 badge');
});

test('HUD-POWER-BAR: cooldown seconds, armed Detonate, active rings, and loaded Plow live on the tiles', () => {
  const bindings = { pull: ['Digit1'], shove: ['Digit2'], pin: ['Digit3'], bomb: ['Digit4'], rig: ['Digit5'], tether: ['KeyF'] };
  const state = baseState({
    simTime: 100,
    fields: {
      active: [{ kind: 'well', tag: 'player', expireAt: 105 }],
      cooldowns: { repulsor: 104.2 },
      coneActive: true,
      plowRockCount: 3,
    },
    massSeed: { phase: 'active', expireAt: 112 },
    player: {
      cargo: { items: { cmdty_impulse_charge: 4 } },
      massSeed: { cooldownUntil: 0 },
      armedChargeCount: 1,
      tether: { active: true, targetId: 9 },
    },
  });
  const ord = readOrdnanceModel(state, createCooldownTracker(), bindings);
  assert.equal(ord['1'].running, true, 'Pull running ring lights while well is active');
  assert.equal(ord['2'].state, 'cooldown', 'Shove enters cooldown');
  assert.equal(ord['2'].cooldownSec, 5, 'Shove cooldown displays whole seconds ceiling');
  assert.equal(ord['3'].running, true, 'Pin running ring lights while Pin is active');
  assert.equal(ord['4'].label, 'Detonate', 'Armed charge flips Bomb tile label to Detonate');
  assert.equal(ord['4'].detonate, true, 'Armed charge sets pulsing detonate state');
  assert.equal(ord['4'].count, 4, 'Armed charge keeps stock count visible');
  assert.equal(ord['5'].label, 'Launch', 'Loaded Plow reads Launch');
  assert.equal(ord['5'].plowCount, 3, 'Loaded Plow carries rock count');
  assert.equal(ord['5'].running, true, 'Active Plow carries active ring');
  assert.equal(ord['6'].running, true, 'Active Line carries active ring');
});

test('HUD-POWER-BAR: flight icons render distinct glyphs with blinking fuse lamp on Bomb', () => {
  const bombSvg = arsenalIcon('power_charge', 24, '', true);
  assert.match(bombSvg, /arsenal-fuse-lamp/, 'Bomb flight glyph includes blinking fuse lamp');
  const fragSvg = arsenalIcon('bomb_frag', 24, '', true);
  assert.match(fragSvg, /arsenal-fuse-lamp/, 'Drift bomb flight glyph uses the same charge + fuse lamp');
  const shoveSvg = arsenalIcon('field_repulsor_standard', 24, '', true);
  const plowSvg = arsenalIcon('field_cone_standard', 24, '', true);
  const pinSvg = arsenalIcon('field_seed_standard', 24, '', true);
  const lineSvg = arsenalIcon('power_massline', 24, '', true);
  assert.equal(new Set([bombSvg, shoveSvg, plowSvg, pinSvg, lineSvg]).size, 5, 'all icons are distinct');
});

test('HUD-POWER-BAR: first-use caption shows 3 times per key in a save, and every time in first Swarm run', () => {
  const adv = baseState();
  for (let i = 0; i < POWER_CAPTION_LIMIT; i++) {
    const cap = consumePowerCaption(adv, 1);
    assert.equal(cap?.text, FLIGHT_POWER_COPY[1].caption);
  }
  assert.equal(consumePowerCaption(adv, 1), null, 'fourth press in Adventure stays quiet');
  assert.equal(consumePowerCaption(adv, 2)?.text, FLIGHT_POWER_COPY[2].caption, 'each key counts independently');

  const swarm = baseState({ run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } });
  const freshProfile = { history: [] };
  assert.equal(isFirstSwarmRunOnProfile(swarm, freshProfile), true);
  for (let i = 0; i < 6; i++) {
    assert.equal(consumePowerCaption(swarm, 3, { profile: freshProfile })?.text, FLIGHT_POWER_COPY[3].caption);
  }
  const veteranProfile = { history: [{ wave: 5 }] };
  assert.equal(isFirstSwarmRunOnProfile(swarm, veteranProfile), false);
});

test('HUD-POWER-BAR: resolveHudAttention yields one state — fight, teach, or calm', () => {
  // Teach: first two minutes of new Adventure save with no fight.
  assert.equal(resolveHudAttention(baseState({ simTime: 45 })), 'teach');
  // Calm: past two minutes with no hostile near and no recent hull hit.
  assert.equal(resolveHudAttention(baseState({ simTime: 240 })), 'calm');
  // Fight: hull hit in the last 8 s beats teach and calm.
  assert.equal(resolveHudAttention(baseState({ simTime: 45 }), { lastPlayerHullHitAt: 40 }), 'fight');
  assert.equal(resolveHudAttention(baseState({ simTime: 240 }), { lastPlayerHullHitAt: 233 }), 'fight');
  assert.equal(resolveHudAttention(baseState({ simTime: 240 }), { lastPlayerHullHitAt: 230 }), 'calm');
  // Fight: Swarm round active.
  assert.equal(resolveHudAttention(baseState({ simTime: 240, run: { kind: 'survival', phase: 'active', ruleset: 'swarm' } })), 'fight');
  // Fight: hostile inside weapons range.
  const hostileNear = baseState({ simTime: 240 });
  const raider = { id: 9, type: 'ship', team: 3, alive: true, pos: { x: 400, y: 0, z: 0 }, data: { ai: { huntPlayer: true } } };
  hostileNear.entities.set(9, raider);
  hostileNear.entityList.push(raider);
  assert.equal(resolveHudAttention(hostileNear), 'fight');
  // Calm: distant unengaged hostile outside weapons range.
  raider.pos.x = 2600;
  assert.equal(resolveHudAttention(hostileNear), 'calm');
  // Fight: distant hostile actively engaged with the player.
  raider.data.ai.targetId = 1;
  assert.equal(resolveHudAttention(hostileNear), 'fight');
});

test('HUD-POWER-BAR: readRailModel marks unowned bomb rack absent so no empty socket renders', () => {
  const s = baseState({
    player: { cargo: { items: {} }, massSeed: {} },
    bombs: { selectedId: null, rack: { sockets: 2, cells: [null, null] }, cooldowns: {} },
  });
  const m = readRailModel(s, 240);
  assert.equal(m[4].unowned, true);
  const ord = readOrdnanceModel(s, createCooldownTracker(), { bomb: ['Digit4'] });
  assert.equal(ord['4'].hidden, true, 'unowned power has no tile on the bar');
});

test('HUD-POWER-BAR: Field Build calm proximity and aim-cursor layering stay below HUD panels', () => {
  const emptyCalm = baseState({ simTime: 240 });
  assert.equal(hasNearbyClaimableOrOwnedBody(emptyCalm), false);
  const rock = { id: 77, type: 'asteroid', alive: true, radius: 32, pos: { x: 240, y: 0, z: 0 }, data: {} };
  emptyCalm.entities.set(77, rock);
  emptyCalm.entityList.push(rock);
  assert.equal(hasNearbyClaimableOrOwnedBody(emptyCalm), true);
  rock.pos.x = 2400;
  assert.equal(hasNearbyClaimableOrOwnedBody(emptyCalm), false);

  const hudCss = fs.readFileSync(new URL('../styles/hud-flight.generated.css', import.meta.url), 'utf8');
  assert.match(hudCss, /#aim-reticle\s*\{\s*z-index:\s*9;/, 'aim reticle sits under #hud panels');
  assert.match(hudCss, /#hud\s+\.sf-lockdiamond,\s*#hud\s+\.sf-leadpip,\s*#hud\s+\.sf-aimtag,\s*#hud\s+\.sf-cmark\s*\{\s*z-index:\s*5;/);
  assert.match(hudCss, /#hud\s*>\s*\.sf-leftcontext,\s*#hud\s+\.sf-rightdock,\s*#hud\s+\.orr-hud-cluster\s*\{\s*z-index:\s*14;/);
});
