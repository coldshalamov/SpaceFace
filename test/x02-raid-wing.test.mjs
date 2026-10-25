// X-02 (row 560): the Claim Jumper's wing — a staged hostile that holds fire until the latch,
// answers for its crew, and runs at 30% hull or when the lesson lands.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { onboarding, BEATS } from '../src/systems/onboarding.js';
import { authorizeAIEngagement, isOnboardingRaidWingAuthorized } from '../src/ai/engagementAuthority.js';
import { stepEgressExits } from '../src/ai/egressExit.js';

let nextId = 500;
function rig({ clinic = false } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, hull: 140, hullMax: 140,
    data: { ai: {} },
  };
  const entities = new Map([[1, player]]);
  const state = {
    mode: 'flight', playerId: 1, simTime: 0, tick: 0, meta: { seed: 4242 }, rng: mulberry32(4242),
    player: { hints: {}, tether: { active: false } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities,
    entityList: [player],
    world: { currentSectorId: 'sector_helios_prime' },
    onboarding: {
      active: true, finished: false, currentBeat: 0,
      beatDoneAt: {}, firedFollowups: {}, pace: clinic
        ? { swing: { clinicOpenedAtS: 1, clinicLesson: 'raid' } } : { swing: {} },
      raid: { active: true, ids: {}, gunKills: 0, strayKills: 0 },
      rescue: { ids: {} },
    },
    settings: { gameplay: {} }, ui: {},
    missions: { active: [] },
    factions: {},
  };
  const spawned = [];
  const removed = [];
  const bus = createBus();
  const comms = [];
  const said = [];
  bus.on('comms:popup', (p) => comms.push(p));
  const helpers = {
    hash32, mulberry32, voice: { say: (p) => { said.push(p); return true; } },
    spawnEntity(spec) {
      const e = { id: nextId++, alive: true, ...spec, data: spec.data || {}, pos: { ...spec.pos } };
      entities.set(e.id, e); state.entityList.push(e); spawned.push(e);
      return e;
    },
    removeEntity(id) {
      const e = entities.get(id);
      if (e) { e.alive = false; removed.push(id); }
    },
  };
  const ob = { ...onboarding };
  ob.init({ state, bus, helpers, registry: { get: () => null } });
  // Find the raid beat index (key 'raid') and stand the rail on it.
  const beatIdx = (ob.constructor === onboarding.constructor) && null;
  return { state, bus, ob, spawned, removed, comms, said, entities };
}

function setRaidBeat(h) {
  h.state.onboarding.currentBeat = BEATS.findIndex((b) => b.key === 'raid');
  return h.state.onboarding.currentBeat;
}

function stage(h, opts) {
  setRaidBeat(h);
  h.ob._spawnRaidCast(opts || {});
  return h.state.onboarding.raid;
}

test('X-02 a normal stage spawns one wing on hold_fire; a clinic stage spawns none', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  assert.ok(wing, 'the wing stages beside the tow');
  assert.equal(wing.data.ai.roe, 'hold_fire');
  assert.equal(wing.data.onboardingRaidWing, true);
  assert.equal(wing.data.ai.squadId, 'claim_jumper_wing');
  const raider = h.entities.get(raid.ids.raider);
  assert.equal(raider.data.ai.squadId, 'claim_jumper_wing', 'wingmate stamp is shared');
  assert.equal(wing.hullMax, 60);
  assert.equal(wing.data.weapons.length, 1);
  const pulse = wing.data.weapons[0];
  assert.equal(pulse.defId, 'wpn_pulse_laser_s');
  assert.equal(pulse.dmg, 2);
  assert.equal(pulse.rof, 2);
  assert.equal(pulse.impulsePerHit, 0);

  const c = rig({ clinic: true });
  const craid = stage(c);
  assert.equal(craid.ids.wing == null, true, 'the clinic keeps its unarmed tableau');
});

test('X-02 the bridge: before the latch the wing is denied; after it the player at (0,0) is legal', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  const player = h.entities.get(1);
  // The bridge itself: the wing record exists but fire is held — the AUTHORITY denial to pin
  // is the pre-latch roe, and the bridge gate's other conditions.
  assert.equal(authorizeAIEngagement({ state: h.state, self: wing, target: player }).ok !== true, true,
    'hold_fire refuses before the latch');
  // A different hostile at the same spot is still denied by station protection.
  const impostor = h.ob.helpers && null;
  const stranger = { id: 777, type: 'ship', alive: true, team: 1, pos: { x: 200, z: 0 },
    data: { onboardingRaidWing: false, ai: { roe: 'weapons_free', motive: 'raid',
      engagementTrigger: 'provoked', zoneId: 'helios', approachTelegraph: 'shown' } } };
  h.entities.set(777, stranger);
  const out = authorizeAIEngagement({ state: h.state, self: stranger, target: player });
  assert.equal(out.ok !== true, true, 'a different hostile at the same spot is still denied');
  // After the latch: roe goes free and the bridge admits the wing specifically.
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(wing.data.ai.roe, 'weapons_free');
  assert.equal(isOnboardingRaidWingAuthorized(h.state, wing, player), true);
  assert.ok(h.comms.some((c) => c.text === 'Hands off his boat.'), 'the wing speaks for its crew');
});

test('X-02 at 18 hull the wing flees, disarms, and the bridge closes behind it', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  wing.hull = 18;
  h.ob._stepRaidWing();
  assert.equal(raid.wingDone, true);
  assert.equal(wing.data.ai.forceFlee, true);
  assert.equal(wing.data.ai.roe, 'hold_fire');
  assert.equal(isOnboardingRaidWingAuthorized(h.state, wing, h.entities.get(1)), false,
    'a fleeing wing may not fire');
  assert.ok(h.comms.some((c) => c.text === "Not for his cut. I'm gone."), 'the exit speaks once');
});

test('X-02 the wing speaks once per arming, including after a player-death restage', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  const openings = () => h.comms.filter((c) => c.text === 'Hands off his boat.').length;
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(openings(), 1, 're-latching an armed wing does not repeat its opening');
  assert.equal(wing.data.ai.roe, 'weapons_free');

  h.ob._respawnRaidRaider(null);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(openings(), 1, 'gun-kill restage keeps the armed wing quiet');

  h.bus.emit('player:death');
  assert.equal(wing.data.ai.roe, 'hold_fire');
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(openings(), 2, 'the disarmed wing announces its next arming');
  assert.equal(wing.data.ai.roe, 'weapons_free');
});

test('X-02 restages keep the wing id; after wingDone no wing respawns', () => {
  const h = rig();
  const raid = stage(h);
  const wingId = raid.ids.wing;
  h.ob._respawnRaidRaider('Another one, then. Latch him this time.');
  assert.equal(h.state.onboarding.raid.ids.wing, wingId, 'a gun-kill restage keeps the wing');
  // After wingDone the slot stays empty even on a full respawn.
  h.state.onboarding.raid.wingDone = true;
  h.ob._spawnRaidCast({ wing: 'respawn' });
  assert.equal(h.state.onboarding.raid.ids.wing == null, true, 'fled or dead, it never returns');
});

test('X-02 a wing kill ends its part without completing or restaging the beat', () => {
  const h = rig();
  const raid = stage(h);
  const wingId = raid.ids.wing;
  h.bus.emit('entity:killed', { id: wingId, killerId: 1, pos: { x: 0, z: 0 } });
  assert.equal(raid.wingDone, true);
  assert.equal(h.state.onboarding.raid.ids.raider != null, true, 'the tow stays staged');
  assert.equal(h.removed.includes(wingId), false, 'no restage delete either');
});

test('X-02 a wing stray into the towed raider converges like a gun kill', () => {
  const h = rig();
  const raid = stage(h);
  const wingId = raid.ids.wing;
  h.bus.emit('entity:killed', { id: raid.ids.raider, killerId: wingId, pos: { x: 0, z: 0 } });
  assert.equal(h.state.onboarding.raid.strayKills, 1, 'the stray is counted, not narrated');
  const raider2 = h.state.onboarding.raid.ids.raider;
  assert.ok(raider2 != null, 'the beat restages for the stray');
  h.bus.emit('entity:killed', { id: raider2, killerId: wingId, pos: { x: 0, z: 0 } });
  assert.equal(h.state.onboarding.raid.strayKills, 2);
  assert.ok(Number.isFinite(h.state.onboarding.beatDoneAt.raid), 'the second stray resolves the beat');
});

// X-02 review round 2: a morale scatter exits through pirateDisengage's markFleeing shape —
// fsm/passive/pirateDisengaged over a FLEE record — without touching wingDone. A later latch
// must adopt that honest exit, not restamp a dead-letter ATTACK_RUN on a routed hull.
test('X-02 a morale-scattered wing is adopted as done and never re-arms', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(wing.data.ai.roe, 'weapons_free');
  assert.equal(wing.data.combat.targetId, 1);
  // markFleeing's shape, as a tumble-shock rout would leave it.
  wing.data.ai.fsm = 'flee';
  wing.data.ai.passive = true;
  wing.data.ai.pirateDisengaged = true;
  wing.data.ai.roe = 'hold_fire';
  const openings = () => h.comms.filter((c) => c.text === 'Hands off his boat.').length;
  assert.equal(openings(), 1);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(raid.wingDone, true, 'the rout is adopted, not re-armed');
  assert.equal(wing.data.ai.roe, 'hold_fire', 'no dead-letter weapons_free');
  assert.equal(wing.data.ai.forcePlayerTarget, false, 'the player pin clears with the slot');
  assert.equal(wing.data.combat.targetId, null, 'the stale target clears');
  assert.equal(openings(), 1, 'a routed wing does not announce a second arming');
  // _stepRaidWing reaches the same state on its own for a scatter between beats.
  const h2 = rig();
  const raid2 = stage(h2);
  const wing2 = h2.entities.get(raid2.ids.wing);
  wing2.data.ai.fsm = 'surrender';
  wing2.data.ai.pirateDisengaged = true;
  h2.ob._stepRaidWing();
  assert.equal(raid2.wingDone, true, 'the beat step adopts an honest exit too');
  assert.equal(wing2.data.ai.fsm, 'surrender', 'the honest record is not restamped');
});

// X-02 review round 3: the adoption must not fire on a TEMPORARY hold. wingMorale's
// leader-killed scatter and difficultyDirector's pin-release stamp bare forceFlee/fsm:'flee'
// with no durable marker and are built to expire so the hull re-presses — the raider is the
// squad's fallback leader, so a gun kill on it scatters the wing for a few seconds mid-lesson.
test('X-02 a temporary scatter or pacing hold is not adopted — the wing still re-arms', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  // wingMorale._scatter's shape: forceFlee + fsm:'flee' + a private until — no
  // pirateDisengaged, no motiveSatisfied, no pirateDisengage record.
  wing.data.ai.forceFlee = true;
  wing.data.ai.fsm = 'flee';
  wing.data.ai._wingMoraleUntil = 12;
  wing.data.ai._moraleUntil = 12;
  wing.data.morale = 'scattered';
  h.ob._stepRaidWing();
  assert.equal(raid.wingDone == null || raid.wingDone === false, true,
    'a leader-killed shock is not an exit');
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(raid.wingDone == null || raid.wingDone === false, true,
    'the latch does not adopt a scattered wing');
  assert.equal(wing.data.ai.roe, 'weapons_free', 'the scatter still arms for the lesson');
  // The shock lapses (wingMorale deletes its own stamps) and the wing re-presses.
  delete wing.data.ai.forceFlee;
  delete wing.data.ai.fsm;
  delete wing.data.ai._wingMoraleUntil;
  delete wing.data.ai._moraleUntil;
  delete wing.data.morale;
  h.ob._stepRaidWing();
  assert.equal(raid.wingDone == null || raid.wingDone === false, true,
    'an expired hold leaves the slot open');
  assert.equal(wing.data.ai.roe, 'weapons_free', 'the re-pressed wing keeps its armament');
  // ...and its own authored exit still lands afterwards.
  wing.hull = 18;
  h.ob._stepRaidWing();
  assert.equal(raid.wingDone, true, 'the scripted hull exit still works');
  assert.equal(wing.data.ai.roe, 'hold_fire');
  // The pacing hold shape (difficultyDirector) — forceFlee alone — is likewise transient.
  const h2 = rig();
  const raid2 = stage(h2);
  const wing2 = h2.entities.get(raid2.ids.wing);
  wing2.data.ai.forceFlee = true;
  wing2.data.ai._pacingFleeUntil = 9;
  h2.ob._stepRaidWing();
  assert.equal(raid2.wingDone == null || raid2.wingDone === false, true,
    'a bounded pacing hold is not an exit');
});

// X-02 review round 3 seam: the player dies to the wing mid-raid. The death restage stands
// the wing down for replay — every player pin it could carry clears — and a wing that already
// left honestly keeps its rout instead of being parked mid-field as a LOITER.
test('X-02 a player-death restage disarms cleanly and respects an honest exit', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(wing.data.ai.roe, 'weapons_free');
  // Stale pins a live fire loop could leave on the hull — the restage must drop all of them.
  wing.data.ai.huntPlayer = true;
  wing.data.combat.lockTarget = 1;
  h.bus.emit('player:death');
  assert.equal(wing.data.ai.roe, 'hold_fire', 'the wing stands down for the restage');
  assert.equal(wing.data.ai.activity && wing.data.ai.activity.reason, 'onboarding_raid:standdown');
  assert.equal(wing.data.ai.forcePlayerTarget, false);
  assert.equal(wing.data.ai.huntPlayer, false, 'the hunt pin clears with the disarm');
  assert.equal(wing.data.combat.targetId, null);
  assert.equal(wing.data.combat.lockTarget, null, 'a stale lock does not follow the respawn');
  assert.equal(raid.ids.wing, wing.id, 'the slot survives for the replay');
  assert.equal(raid.wingDone == null || raid.wingDone === false, true, 'a live wing is not done');
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(wing.data.ai.roe, 'weapons_free', 'the replayed lesson re-arms on the latch');
  // A wing that already routed keeps its honest record through the restage.
  const h2 = rig();
  const raid2 = stage(h2);
  const wing2 = h2.entities.get(raid2.ids.wing);
  wing2.data.ai.fsm = 'flee';
  wing2.data.ai.passive = true;
  wing2.data.ai.pirateDisengaged = true;
  wing2.data.ai.roe = 'hold_fire';
  wing2.data.ai.activity = { kind: 'flee', reason: 'pirate_disengage:test', targetId: null };
  h2.bus.emit('player:death');
  assert.equal(wing2.data.ai.activity.reason, 'pirate_disengage:test',
    'a routed hull keeps fleeing instead of parking');
  h2.ob._stepRaidWing();
  assert.equal(raid2.wingDone, true, 'the routed record still closes the slot');
});

// X-02 review: entity ids recycle. A wing that egressed or died keeps its slot (wingDone guards
// the respawn), so the slot must never arm or delete whatever hull wears that id next.
test('X-02 review: a recycled wing id is never armed or removed', () => {
  const h = rig();
  const raid = stage(h);
  const wingId = raid.ids.wing;
  // The wing leaves without a kill receipt and its id is reused by an unrelated hull.
  const stranger = { id: wingId, type: 'ship', alive: true, team: 1, pos: { x: 9, z: 9 },
    data: { ai: { roe: 'hold_fire' } } };
  h.entities.set(wingId, stranger);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  assert.equal(stranger.data.ai.roe, 'hold_fire', 'a foreign hull is never armed');
  assert.equal(isOnboardingRaidWingAuthorized(h.state, stranger, h.entities.get(1)), false);
  h.ob._removeRaidActors();
  assert.equal(h.removed.includes(wingId), false, 'a foreign hull is never removed');
  assert.equal(raid.ids.wing, null);
});

// X-02 review round 7 (difficultyDirector seam): a pin-release hold is 300 s and built to
// lapse — but stepEgressExits retires ANY fleeing hull ≥960 WU out after a 12 s fade. On a
// live-beat wing that despawn is silent (no entity:killed, wingDone never set) and
// raid.ids.wing keeps blocking every keep/disarm restage: the beat loses its staged
// antagonist for good on a hold designed to expire. The same identity gate the other seams
// read exempts the live-beat hull — and releases a stamp already placed — while a wingDone
// exit still takes the bound.
test('X-02 a pacing-pinned wing off-field is never egress-despawned mid-beat', () => {
  const h = rig();
  const raid = stage(h);
  const wing = h.entities.get(raid.ids.wing);
  h.bus.emit('tether:latched', { targetId: raid.ids.raider });
  h.state.tick = 15;            // EGRESS_SCAN_TICKS boundary
  h.state.simTime = 100;
  // The pin-release shape: forceFlee + a far-future private hold, hull already off-field.
  wing.data.ai.forceFlee = true;
  wing.data.ai.moraleFleeReason = 'pacing_pin_release';
  wing.data.ai._pacingFleeUntil = 400;
  wing.pos.x = 4000;
  stepEgressExits(h.state, [wing], h.bus);
  assert.equal(wing.data.despawnAt == null, true, 'no despawn deadline on a live-beat wing');
  assert.equal(wing.alive, true);
  // A stamp landed before the exemption (a save recorded mid-hold) releases the same way —
  // the bound can never retire this hull while the beat still owns it.
  wing.data.despawnAt = 112;
  wing.data._egressExitAt = 112;
  stepEgressExits(h.state, [wing], h.bus);
  assert.equal(wing.data.despawnAt == null, true, 'a stale stamp releases on the live-beat wing');
  assert.equal(wing.data._egressExitAt == null, true);
  // The hold expiring on a still-resident hull is what re-presses the armed run.
  delete wing.data.ai.forceFlee;
  delete wing.data.ai._pacingFleeUntil;
  delete wing.data.ai.moraleFleeReason;
  assert.equal(isOnboardingRaidWingAuthorized(h.state, wing, h.entities.get(1)), true,
    'a survived hold re-opens the fire bridge');
  // Once the beat owns the exit (wingDone) the exemption ends: the same fleeing hull at the
  // same spot takes the ordinary despawn deadline — the bound still bounds the designed exit.
  wing.hull = 18;
  h.ob._stepRaidWing();
  assert.equal(raid.wingDone, true);
  stepEgressExits(h.state, [wing], h.bus);
  assert.ok(Number.isFinite(wing.data.despawnAt), 'a wingDone hull still takes the egress bound');
});
