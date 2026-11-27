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

test('HUD-POWER-BAR: planetary scoop never claims the independent Plow socket', () => {
  const state = baseState({ planet: { active: true, player: { collectorOn: true } } });
  const bindings = { rig: ['Digit5'] };
  assert.equal(readRailModel(state, state.simTime)[5].state, 'ready');
  assert.equal(readRailModel(state, state.simTime)[5].running, false);
  assert.notEqual(readOrdnanceModel(state, createCooldownTracker(), bindings)['5'].running, true);
  state.fields.coneActive = true;
  assert.equal(readRailModel(state, state.simTime)[5].running, true);
  assert.equal(readOrdnanceModel(state, createCooldownTracker(), bindings)['5'].running, true);
});

test('HUD-POWER-BAR: flight glyphs use one precise stroke and distinct geometry at compact size', () => {
  const ids = [
    'field_well_standard', 'field_repulsor_standard', 'field_seed_standard',
    'power_charge', 'field_cone_standard', 'power_massline',
    'power_travel_burn', 'field_skim_standard', 'power_gyre', 'mod_cloak_mk1',
  ];
  // Strip the outer SVG: data-arsenal alone must not make duplicate drawings pass.
  const geometry = svg => svg.slice(svg.indexOf('>') + 1, -6);
  const marks = ids.map(id => {
    const svg = arsenalIcon(id, 32, '', true);
    assert.match(svg, /viewBox="0 0 24 24" width="32" height="32"/, id);
    assert.match(svg, /stroke="currentColor" stroke-width="1.62" stroke-linecap="butt" stroke-linejoin="bevel"/, id);
    assert.match(svg, /aria-hidden="true" focusable="false"/, id);
    const inner = geometry(svg);
    assert.ok(inner.length > 0, id);
    assert.doesNotMatch(inner, /stroke-width=|stroke-linecap=|stroke-linejoin=|<image|<text|<filter|<animate/, id);
    return inner;
  });
  assert.equal(new Set(marks).size, ids.length, 'different verbs have different drawings, not just different IDs');

  // Pull and Shove must remain distinguishable even without their HUD state colors.
  assert.match(marks[0], /fill="currentColor" stroke="none"/, 'Pull has a solid accumulation point');
  assert.match(marks[1], /<circle cx="12" cy="12" r="[\d.]+"\/>/, 'Shove has a hollow origin');
  assert.doesNotMatch(marks[1], /fill="currentColor"/, 'Shove does not share Pull’s filled center');

  const bomb = arsenalIcon('power_charge', 44, '', true);
  assert.match(bomb, /arsenal-fuse-lamp/);
  assert.match(bomb, /arsenal-fuse-rays/);
  for (const id of ['bomb_frag', 'bomb_emp', 'bomb_thermite']) {
    assert.equal(geometry(arsenalIcon(id, 44, '', true)), geometry(bomb), id + ' keeps the Bomb socket and fuse');
  }
  for (const id of ['mod_cloak_mk2', 'unique_quietcloak']) {
    assert.equal(geometry(arsenalIcon(id, 32, '', true)), marks[9], id + ' keeps the Cloak verb');
  }
  const labeled = arsenalIcon('field_well_standard', 44, 'Pull & gather', true);
  assert.match(labeled, /role="img" aria-label="Pull &amp; gather"/);
  assert.match(labeled, /width="44" height="44"/);
  assert.equal(arsenalIcon('not_a_real_power', 32, '', true), '');
  assert.equal(arsenalIcon('bomb_not_in_catalog', 32, '', true), '');
  assert.equal(arsenalIcon({ defId: 'field_well_standard' }, 32, '', true), arsenalIcon('field_well_standard', 32, '', true));
  assert.equal(arsenalIcon({ id: 'bomb_emp' }, 44, '', true), arsenalIcon('bomb_emp', 44, '', true));

  // The armory/outfit glyphs keep their established drawing style and fallback behavior.
  assert.match(arsenalIcon('field_well_standard', 24), /stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/);
  assert.notEqual(geometry(arsenalIcon('field_well_standard', 32)), marks[0]);
  assert.equal(arsenalIcon('wpn_railgun_m', 24, '', true), arsenalIcon('wpn_railgun_m', 24));
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
