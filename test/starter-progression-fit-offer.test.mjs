// SR-01 earned rack pointer — when a berth event (a sale, a docked payout, or a post-rail
// arrival) leaves the pilot able to afford a verb-changing module on THIS station's rack,
// the tutorial voice names it once per profile. The pointer is earned, not scripted: it must
// only fire while berthed, only for a real hull-compatible offer actually in reach, and never
// re-pitch a module the pilot already holds. Seed 4242 starter: Helios racks Veil Step (4200)
// and Swing Drive S (5100); the swing drive leads because it extends the taught latch verb.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { BEATS, onboarding as onboardingProto } from '../src/systems/onboarding.js';

const CHOICE_BEAT = BEATS.findIndex((beat) => beat.key === 'choice');
const STARTER_FIT = ['wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', 'mod_drill_amp', null];
const SWING_LINE = "Your credits cover the yard's Swing Drive S.";
const VEIL_LINE = "Your credits cover the yard's Veil Step.";
const BOARD_LINE = "The board's holding work that fits.";

function makeHarness({ credits = 4000, rail = 'finished', hintsOn = true } = {}) {
  const state = createGameState(47);
  state.mode = 'station';
  state.simTime = 720;
  state.player.credits = credits;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: STARTER_FIT.slice() }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.settings = state.settings || {};
  state.settings.gameplay = { ...(state.settings.gameplay || {}), tutorialHints: hintsOn };
  state.onboarding = rail === 'finished'
    ? { active: false, finished: true }
    : { active: true, finished: false, currentBeat: CHOICE_BEAT, beatDoneAt: {}, firedFollowups: {}, tutorialLog: [], beatAction: '' };

  const bus = createBus();
  const said = [];
  bus.on('tutorial:say', (p) => said.push(p && p.text));
  const onboarding = Object.create(onboardingProto);
  onboarding.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } }, registry: { get: () => null } });
  return {
    state, bus, said, onboarding,
    sell(stationId = 'station_helios') {
      bus.emit('economy:tradeCompleted', { side: 'sell', stationId, commodityId: 'cmdty_ore_iron', qty: 3, total: 120 });
    },
  };
}

test('a sale that closes the rack gap names the exact module it buys', () => {
  const h = makeHarness({ credits: 4000 });
  h.sell();
  assert.deepEqual(h.said, [], 'nothing is pitched before the price is actually in reach');
  assert.equal(h.state.player.hints.fitOffer, undefined, 'the pointer stays unspent');

  h.state.player.credits = 5200;
  h.sell();
  assert.deepEqual(h.said, [SWING_LINE]);
  assert.equal(h.state.player.hints.fitOffer, true);
});

test('the pointer spends itself once per profile', () => {
  const h = makeHarness({ credits: 9000 });
  h.sell();
  h.sell();
  h.bus.emit('economy:grantCredits', { amount: 400, reason: 'mission' });
  assert.deepEqual(h.said, [SWING_LINE], 'later berth events stay silent');
});

test('a docked payout earns it too; the same credit event in flight does not', () => {
  const berthed = makeHarness({ credits: 5200 });
  berthed.bus.emit('economy:grantCredits', { amount: 400, reason: 'mission:complete' });
  assert.deepEqual(berthed.said, [SWING_LINE]);

  const flying = makeHarness({ credits: 5200 });
  flying.state.mode = 'flight';
  flying.state.ui.docked = false;
  flying.state.ui.dockedStationId = null;
  flying.bus.emit('economy:grantCredits', { amount: 400, reason: 'bounty' });
  assert.deepEqual(flying.said, [], 'an in-flight bounty is not a berth event');
  assert.equal(flying.state.player.hints.fitOffer, undefined, 'and spends nothing');
});

test('a post-rail berth arrival earns it without a sale', () => {
  const h = makeHarness({ credits: 5200 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.deepEqual(h.said, [SWING_LINE]);
});

test('a module the pilot already holds is never re-pitched', () => {
  const h = makeHarness({ credits: 5200 });
  h.state.player.moduleInventory = [{ instanceId: 'inst-1', defId: 'mod_swing_drive_s' }];
  h.sell();
  assert.deepEqual(h.said, [VEIL_LINE], 'the next affordable verb-fit is named instead');

  const full = makeHarness({ credits: 99999 });
  full.state.player.moduleInventory = [
    { instanceId: 'inst-1', defId: 'mod_swing_drive_s' },
    { instanceId: 'inst-2', defId: 'mod_veil_step' },
    { instanceId: 'inst-3', defId: 'mod_gravity_bumper_s' },
  ];
  full.sell();
  assert.deepEqual(full.said, [], 'nothing on this rack is new');
});

test('B5: the earned pointer replaces the generic board followup for the same sale', () => {
  const h = makeHarness({ credits: 5200, rail: 'choice' });
  h.sell();
  assert.deepEqual(h.said, [SWING_LINE]);
  assert.equal(h.state.onboarding.firedFollowups['choice:sold'], true,
    'the static followup is spent so one sale never plays two guidance lines');
  assert.equal(h.state.onboarding.beatAction, SWING_LINE,
    'the persistent objective carries the same earned line');

  h.sell();
  assert.deepEqual(h.said, [SWING_LINE], 'a second sale adds nothing');
});

test('B5: a sale whose contract payout speaks the pointer first still plays one line', () => {
  const h = makeHarness({ credits: 4000, rail: 'choice' });
  // economy and missions register before onboarding (registry order): the sale completes a
  // bulk_trade contract, its payout lands, and economy:grantCredits reaches onboarding
  // before economy:tradeCompleted does.
  const bus = h.bus;
  h.state.player.credits = 4000;
  const realEmit = bus.emit.bind(bus);
  bus.emit = (type, p) => {
    if (type === 'economy:tradeCompleted') {
      h.state.player.credits += 1500;
      realEmit('economy:grantCredits', { amount: 1500, reason: 'mission:complete' });
    }
    return realEmit(type, p);
  };
  h.sell();
  assert.deepEqual(h.said, [SWING_LINE], 'the payout-earned pointer replaces the board followup');
  assert.equal(h.state.onboarding.beatAction, SWING_LINE);
  assert.equal(h.state.onboarding.firedFollowups['choice:sold'], true);
});

test('B5 with nothing in reach keeps the truthful board pointer', () => {
  const h = makeHarness({ credits: 4000, rail: 'choice' });
  h.sell();
  assert.deepEqual(h.said, [BOARD_LINE]);
  assert.equal(h.state.onboarding.firedFollowups['choice:sold'], true);
  assert.equal(h.state.player.hints.fitOffer, undefined, 'the rack pointer stays unspent');
});

test('tutorial hints off stays silent and spends nothing', () => {
  const h = makeHarness({ credits: 5200, hintsOn: false });
  h.state.onboarding = { active: false, finished: false };
  h.sell();
  h.bus.emit('economy:grantCredits', { amount: 400 });
  assert.deepEqual(h.said, []);
  assert.equal(h.state.player.hints.fitOffer, undefined);
});

test('stale trade station ids and in-flight dock remnants cannot spend an earned berth hint', () => {
  const h = makeHarness({credits: 5200});
  h.sell('station_tethys');
  assert.deepEqual(h.said, []); assert.equal(h.state.player.hints.fitOffer, undefined);
  h.state.mode = 'flight'; h.state.ui.docked = false;
  h.sell();
  assert.deepEqual(h.said, []); assert.equal(h.state.player.hints.fitOffer, undefined);
  h.state.mode = 'station'; h.state.ui.docked = true; h.state.physicsVenueSession = true;
  h.sell();
  assert.deepEqual(h.said, []); assert.equal(h.state.player.hints.fitOffer, undefined);
});

test('outfit budget and modules already held on another owned hull constrain the rack pointer', () => {
  const h = makeHarness({credits: 5200});
  h.state.player.ownedShips.push({defId: 'ship_kestrel', fittings: ['mod_swing_drive_s']});
  h.sell();
  assert.deepEqual(h.said, [VEIL_LINE], 'an already owned parked module is not sold as a new verb');
  const blocked = makeHarness({credits: 99999});
  blocked.state.player.ownedShips[0].fittings[2] = 'mod_engine_warp_l';
  blocked.sell();
  assert.deepEqual(blocked.said, [], 'a loadout beyond its engine capacity cannot accept this promised fit');
  assert.equal(blocked.state.player.hints.fitOffer, undefined);
});
