import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createStuntDetector } from '../src/combat/stuntTaxonomy.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { bulletTime, MOMENT_EVENT } from '../src/systems/bulletTime.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { createRunState } from '../src/core/runState.js';

function hostileReceipt(over = {}) {
  return {
    tick: 100, targetId: 'raider_1', otherId: 'rock_a', surface: 'craft',
    deltaV: 40, exchangedMomentum: 1800,
    targetHostile: true, damageApplied: true, targetKilled: true,
    hullDamage: 0, targetHullMax: 200,
    provenance: { actorId: 'player' },
    ...over,
  };
}

test('razor release alone mints no trick; gun and unrelated kills while towing mint none', () => {
  const d = createStuntDetector({ playerId: 'player' });
  assert.equal(d.processEvent('tether:releaseRated', {
    tick: 10, sourceId: 'player', targetId: 'rock_a', classification: 'razor',
    releaseScore: 0.95, angularSpeed: 5, tangentialSpeed: 50,
  }).length, 0);

  d.processEvent('tether:attached', {
    tick: 20, sourceId: 'player', targetId: 'ore_pod', isTow: true, relSpeed: 10,
  });
  assert.equal(d.processEvent('entity:killed', {
    tick: 30, id: 'raider_x', killerId: 'player', weaponId: 'wpn_autocannon_m',
  }).length, 0);
  assert.equal(d.processEvent('entity:killed', {
    tick: 40, id: 'raider_y', killerId: 'player', cause: 'ship_collision',
  }).length, 0);
  assert.equal(d.processEvent('entity:killed', {
    tick: 45, id: 'ore_pod', killerId: 'player', cause: 'ship_collision',
  }).length, 0);
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 50, targetId: 'ore_pod', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'tow_kill');
  assert.equal(out[0].consequence.victimId, 'ore_pod');
});

test('numeric source id 0 tows and kills correctly; unknown actors mint nothing', () => {
  const d = createStuntDetector({ playerId: 0 });
  d.processEvent('tether:attached', {
    tick: 5, sourceId: 0, targetId: 'pod', isTow: true, relSpeed: 10,
  });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 10, targetId: 'pod', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
    provenance: { actorId: 0 },
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].actorId, 0);

  const guest = createStuntDetector({ playerId: 'player' });
  guest.processEvent('tether:attached', {
    tick: 5, sourceId: 'npc_tug', targetId: 'pod', isTow: true, relSpeed: 10,
  });
  assert.equal(guest.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 10, targetId: 'pod', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
    provenance: { actorId: 'npc_tug' },
  })).length, 0);
});

test('controllerId attachment is honored as the live tow owner', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('tether:attached', {
    tick: 5, controllerId: 'player', actorId: 'npc_hull', targetId: 'pod', isTow: true, relSpeed: 10,
  });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 10, targetId: 'pod', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'tow_kill');
});

test('tether break clears only the matching target', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('tether:attached', {
    tick: 5, sourceId: 'player', targetId: 'pod_b', isTow: true, relSpeed: 10,
  });
  d.processEvent('tether:broke', { tick: 6, sourceId: 'player', targetId: 'pod_a' });
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 10, targetId: 'pod_b', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
  })).length, 1);
  d.processEvent('tether:broke', { tick: 12, sourceId: 'player', targetId: 'pod_b' });
  const afterBreak = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 14, targetId: 'pod_b', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 26, exchangedMomentum: 800, targetHullMax: 60,
  }));
  assert.ok(!afterBreak.some((t) => t.trickId === 'tow_kill'));
});

test('hitstun provenance actor wins over the struck-mass attackerId', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('combat:hitstunImpulse', {
    tick: 5, victimId: 'raider_1', attackerId: 'debris_chunk',
    provenance: { actorId: 'player', weaponId: 'wpn_concussion_cannon_m' }, deltaV: 25,
  });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 8, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
    provenance: { actorId: 'debris_chunk' },
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'rock_discovery');
  assert.equal(out[0].actorId, 'player');
});

test('missing fields, failed damage, civilian targets, and harmless skims mint nothing', () => {
  const d = createStuntDetector({ playerId: 'player' });
  assert.equal(d.processEvent('combat:collisionConsequence', {
    tick: 5, targetId: 'raider_1', otherId: 'rock_a', surface: 'terrain',
    deltaV: 40, exchangedMomentum: 900, provenance: { actorId: 'player' },
  }).length, 0);
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 6, damageApplied: false, hullDamage: 60,
  })).length, 0);
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 7, targetHostile: false,
  })).length, 0);
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 8, targetId: 'raider_skim', otherId: 'asteroid_shear', surface: 'terrain',
    deltaV: 60, exchangedMomentum: 3000, targetKilled: false, hullDamage: 0, helmLossSeconds: 0,
  })).length, 0);
});

test('death before consequence retains the causal impulse root', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('combat:hitstunImpulse', {
    tick: 5, actorId: 'player', victimId: 'raider_1',
    weaponId: 'wpn_concussion_cannon_m', deltaV: 25,
  });
  assert.equal(d.processEvent('entity:killed', {
    tick: 6, id: 'raider_1', killerId: 'player', cause: 'collision_terrain',
  }).length, 0);
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 6, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'rock_discovery');
  assert.equal(out[0].causeChain[0].type, 'kinetic_impulse');
});

test('a foreign impulse on the struck body cannot steal the player root', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('combat:hitstunImpulse', {
    tick: 50, actorId: 'npc_tug', victimId: 'raider_1',
    weaponId: 'npc_shove', deltaV: 25,
  });
  d.processEvent('tether:releaseRated', {
    tick: 100, sourceId: 'player', targetId: 'rock_a', classification: 'razor',
    releaseScore: 0.92, angularSpeed: 4.5, tangentialSpeed: 42,
  });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 140, targetId: 'raider_1', otherId: 'rock_a', surface: 'craft',
    deltaV: 40, exchangedMomentum: 1800, targetHullMax: 120,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'bolas');
  assert.equal(out[0].rootTick, 100);
  assert.equal(out[0].causeChain[0].entityId, 'player');
});

test('a reused contact without stored impulse falls back to bounded appliedTick provenance', () => {
  const d = createStuntDetector({ playerId: 'player' });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 100, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
    provenance: { actorId: 'player', appliedTick: 95 },
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'rock_discovery');
  assert.equal(out[0].rootTick, 95);
});

test('stale or future appliedTick provenance mints no causal root', () => {
  const d = createStuntDetector({ playerId: 'player' });
  const stale = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 300, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
    provenance: { actorId: 'player', appliedTick: 95 },
  }));
  assert.equal(stale.length, 0);

  const future = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 400, targetId: 'raider_2', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
    provenance: { actorId: 'player', appliedTick: 500 },
  }));
  assert.equal(future.length, 0);
});

test('a harmless causal bounce banks a shot on the material terminal; ambient bounce does not', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('combat:hitstunImpulse', {
    tick: 5, actorId: 'player', victimId: 'rock_a',
    weaponId: 'wpn_concussion_cannon_m', deltaV: 25,
  });
  assert.equal(d.processEvent('combat:collisionConsequence', {
    tick: 10, targetId: 'rock_a', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 18, exchangedMomentum: 700,
    targetHostile: false, damageApplied: false,
    provenance: { actorId: 'player' },
  }).length, 0);
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 20, targetId: 'raider_1', otherId: 'rock_a', surface: 'craft',
    deltaV: 35, exchangedMomentum: 1200, targetHullMax: 100,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'bank_shot');

  const ambient = createStuntDetector({ playerId: 'player' });
  ambient.processEvent('combat:collisionConsequence', {
    tick: 10, targetId: 'rock_a', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 18, exchangedMomentum: 700,
    targetHostile: false, damageApplied: false,
    provenance: { actorId: 'npc_tug' },
  });
  const ambientOut = ambient.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 20, targetId: 'raider_1', otherId: 'rock_a', surface: 'craft',
    deltaV: 35, exchangedMomentum: 1200, targetHullMax: 100,
  }));
  assert.equal(ambientOut.length, 0);
});

test('one multi-matching collision emits a single primary with razor modifier', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('tether:releaseRated', {
    tick: 100, sourceId: 'player', targetId: 'rock_a', classification: 'razor',
    releaseScore: 0.92, angularSpeed: 4.5, tangentialSpeed: 42,
  });
  d.processEvent('tether:whipImpact', {
    tick: 160, sourceId: 'player', targetId: 'rock_a', victimId: 'raider_1',
    relSpeed: 58, mass: 45, momentum: 2600,
  });
  const out = d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 165, targetId: 'raider_1', otherId: 'rock_a', surface: 'craft',
    deltaV: 40, exchangedMomentum: 2600, targetHullMax: 120,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].trickId, 'bolas');
  assert.ok(out[0].modifiers.includes('razor_release'));
  assert.ok(out[0].name.startsWith('Razor '));
  assert.equal(typeof out[0].episodeId, 'string');
});

test('a replayed contact on the same episode pays zero', () => {
  const d = createStuntDetector({ playerId: 'player' });
  d.processEvent('combat:hitstunImpulse', {
    tick: 5, actorId: 'player', victimId: 'raider_1',
    weaponId: 'wpn_concussion_cannon_m', deltaV: 25,
  });
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 8, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
  })).length, 1);
  assert.equal(d.processEvent('combat:collisionConsequence', hostileReceipt({
    tick: 30, targetId: 'raider_1', otherId: 'asteroid_face', surface: 'terrain',
    deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
  })).length, 0);
});

test('detector histories stay bounded under sustained traffic', () => {
  const d = createStuntDetector({ playerId: 'player' });
  for (let i = 0; i < 200; i += 1) {
    d.processEvent('combat:hitstunImpulse', {
      tick: i, actorId: 'player', victimId: `victim_${i}`,
      weaponId: 'wpn_concussion_cannon_m', deltaV: 25,
    });
  }
  assert.ok(d.recentImpulses.size <= 128, `impulses ${d.recentImpulses.size} > 128`);
  for (let i = 0; i < 300; i += 1) {
    d.processEvent('combat:collisionConsequence', hostileReceipt({
      tick: 1000 + i, targetId: `raider_${i}`, otherId: 'asteroid_face', surface: 'terrain',
      deltaV: 30, exchangedMomentum: 900, targetHullMax: 80,
    }));
  }
  assert.ok(d._settledContacts.size <= 256, `settled ${d._settledContacts.size} > 256`);
  assert.ok(d.detectedTricks.length <= 64, `tricks ${d.detectedTricks.length} > 64`);
});

function bootMoment() {
  const state = {
    mode: 'flight', playerId: 'player', simTime: 0, tick: 0,
    massline2: {}, settings: { video: {}, accessibility: {} },
    input: { actions: {} },
  };
  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const sys = Object.create(bulletTime);
  sys.init({ state, bus, timeEffects, helpers: {} });
  const seen = { moments: [], cues: [] };
  bus.on(MOMENT_EVENT, (m) => seen.moments.push(m));
  bus.on('audio:cue', (c) => seen.cues.push(c));
  return { state, bus, sys, timeEffects, seen };
}

let episodeSeq = 0;
function momentTrick(over = {}) {
  episodeSeq += 1;
  const tick = over.tick ?? 0;
  return {
    trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'uncommon',
    actorId: 'player', targetId: 'raider_1', secondaryIds: ['rock_a'],
    episodeId: `ep_${episodeSeq}`,
    rootId: `root_${episodeSeq}`,
    rootTick: over.rootTick ?? tick,
    causeChain: [{ step: 1 }, { step: 2 }],
    consequence: { victimId: 'raider_1', killed: true, hullDamage: 0, hullMax: 100 },
    metrics: { relSpeed: 58, mass: 45, momentum: 2610 },
    tick,
    ...over,
  };
}

test('moment admission needs player actor, episode, chain, material consequence, and rating', () => {
  const h = bootMoment();
  h.bus.emit('stunt:trickDetected', momentTrick({ actorId: 'npc_tug' }));
  h.bus.emit('stunt:trickDetected', momentTrick({ episodeId: '' }));
  h.bus.emit('stunt:trickDetected', momentTrick({ rootId: '' }));
  h.bus.emit('stunt:trickDetected', momentTrick({ rootTick: null }));
  h.bus.emit('stunt:trickDetected', momentTrick({ tick: 50, rootTick: 700 }));
  h.bus.emit('stunt:trickDetected', momentTrick({ causeChain: [{ step: 1 }] }));
  h.bus.emit('stunt:trickDetected', momentTrick({ consequence: null }));
  h.bus.emit('stunt:trickDetected', momentTrick({
    consequence: { victimId: 'raider_1', killed: false, hullDamage: 0 },
  }));
  h.bus.emit('stunt:trickDetected', momentTrick({ rarity: 'common', metrics: {} }));
  assert.equal(h.seen.moments.length, 0);
  h.bus.emit('stunt:trickDetected', momentTrick());
  assert.equal(h.seen.moments.length, 1);
});

test('a replayed trick far from the live tick never fires', () => {
  const h = bootMoment();
  h.state.tick = 2000;
  h.bus.emit('stunt:trickDetected', momentTrick({ tick: 100, rootTick: 90 }));
  assert.equal(h.seen.moments.length, 0);
  h.state.tick = 2000;
  h.bus.emit('stunt:trickDetected', momentTrick({ tick: 2000, rootTick: 1400 }));
  assert.equal(h.seen.moments.length, 0);
});

test('12 s global cooldown gates moment, stinger, and pulse alike', () => {
  const h = bootMoment();
  h.bus.emit('stunt:trickDetected', momentTrick());
  assert.equal(h.seen.moments.length, 1);
  assert.equal(h.seen.cues.filter((c) => c.id === 'moment.stinger').length, 1);
  h.state.simTime = 5;
  h.state.tick = 300;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: 'clothesline', tick: 300 }));
  assert.equal(h.seen.moments.length, 1);
  assert.equal(h.seen.cues.filter((c) => c.id === 'moment.stinger').length, 1);
  h.state.simTime = 13;
  h.state.tick = 780;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: 'clothesline', tick: 780 }));
  assert.equal(h.seen.moments.length, 2);
  assert.equal(h.seen.cues.filter((c) => c.id === 'moment.stinger').length, 2);
});

test('same primary id within 30 s is gated even after the global cooldown', () => {
  const h = bootMoment();
  h.bus.emit('stunt:trickDetected', momentTrick());
  h.state.simTime = 13;
  h.state.tick = 780;
  h.bus.emit('stunt:trickDetected', momentTrick({ tick: 780 }));
  assert.equal(h.seen.moments.length, 1);
  h.state.simTime = 31;
  h.state.tick = 1860;
  h.bus.emit('stunt:trickDetected', momentTrick({ tick: 1860 }));
  assert.equal(h.seen.moments.length, 2);
});

test('at most three moments per 60 s window', () => {
  const h = bootMoment();
  const ids = ['wrecking_ball', 'bolas', 'well_golf', 'dead_mans_mass', 'tow_kill'];
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: ids[0] }));
  h.state.simTime = 13;
  h.state.tick = 780;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: ids[1], tick: 780 }));
  h.state.simTime = 26;
  h.state.tick = 1560;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: ids[2], tick: 1560 }));
  assert.equal(h.seen.moments.length, 3);
  h.state.simTime = 39;
  h.state.tick = 2340;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: ids[3], tick: 2340 }));
  assert.equal(h.seen.moments.length, 3);
  h.state.simTime = 61;
  h.state.tick = 3660;
  h.bus.emit('stunt:trickDetected', momentTrick({ trickId: ids[4], tick: 3660 }));
  assert.equal(h.seen.moments.length, 4);
});

test('a repeated root family never re-fires the moment or its stinger', () => {
  const h = bootMoment();
  const trick = momentTrick();
  h.bus.emit('stunt:trickDetected', trick);
  h.state.simTime = 3;
  h.state.tick = 180;
  h.bus.emit('stunt:trickDetected', {
    ...trick, trickId: 'bolas', targetId: 'raider_2', episodeId: 'ep_b', tick: 180,
  });
  assert.equal(h.seen.moments.length, 1);
  assert.equal(h.seen.cues.filter((c) => c.id === 'moment.stinger').length, 1);
});

test('an expired causal root stays silent even with a fresh target', () => {
  const h = bootMoment();
  const trick = momentTrick({ rootId: 'shared_root', rootTick: 0 });
  h.bus.emit('stunt:trickDetected', trick);
  h.state.simTime = 13;
  h.state.tick = 780;
  h.bus.emit('stunt:trickDetected', {
    ...trick, targetId: 'raider_2', episodeId: 'ep_b', tick: 780, rootTick: 0,
  });
  assert.equal(h.seen.moments.length, 1);
  h.state.simTime = 31;
  h.state.tick = 1860;
  h.bus.emit('stunt:trickDetected', {
    ...trick, targetId: 'raider_3', episodeId: 'ep_c', tick: 1860, rootTick: 0,
  });
  assert.equal(h.seen.moments.length, 1);
});

test('dock and death clear the live pulse but keep rate-limit history', () => {
  const h = bootMoment();
  const trick = momentTrick();
  h.bus.emit('stunt:trickDetected', trick);
  h.bus.emit('player:death', {});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.timeEffects.getEffectiveScale(), 1);
  h.state.simTime = 5;
  h.state.tick = 300;
  h.bus.emit('stunt:trickDetected', {
    ...trick, trickId: 'bolas', tick: 300,
  });
  assert.equal(h.seen.moments.length, 1, 'episode history survived death');
  h.bus.emit('game:newGame', {});
  h.bus.emit('stunt:trickDetected', {
    ...trick, trickId: 'bolas', tick: 300,
  });
  assert.equal(h.seen.moments.length, 2, 'new game re-arms the highlight stream');
});

test('run:started clears moment history for the new session', () => {
  const h = bootMoment();
  const trick = momentTrick();
  h.bus.emit('stunt:trickDetected', trick);
  h.bus.emit('run:started', {});
  h.bus.emit('stunt:trickDetected', { ...trick });
  assert.equal(h.seen.moments.length, 2);
});

test('reduced motion suppresses the slow request but keeps the moment', () => {
  const h = bootMoment();
  h.state.settings.video.motionReduce = true;
  h.bus.emit('stunt:trickDetected', momentTrick());
  assert.equal(h.seen.moments.length, 1);
  assert.equal(h.state.massline2.moment.totalMoments, 1);
  h.sys.update(1 / 60, h.state);
  assert.equal(h.timeEffects.getEffectiveScale(), 1);
});

function bootRewards() {
  const state = {
    mode: 'flight', playerId: 'player', simTime: 0, tick: 0,
    run: { ...createRunState({ kind: 'survival' }), phase: 'active', wave: 2 },
    entities: new Map(), stunts: { combo: { lastTricks: [] } },
    massline2: {}, settings: {}, input: { actions: {} },
  };
  state.entities.set('raider_1', {
    id: 'raider_1', type: 'ship', alive: false, data: { runCohort: 'survival' },
  });
  const bus = createBus();
  const sys = Object.create(survivalRewards);
  sys.init({ state, bus });
  const awards = [];
  bus.on('run:awardRequested', (a) => awards.push(a));
  return { state, bus, sys, awards };
}

function runTrick(over = {}) {
  return {
    trickId: 'bolas', name: 'Bolas', rarity: 'uncommon',
    actorId: 'player', targetId: 'raider_1', episodeId: 'ep_1',
    consequence: { victimId: 'raider_1', killed: true, hullDamage: 0, hullMax: 100 },
    tick: 10,
    ...over,
  };
}

test('run stunt score pays a marked cohort victim once, on the real combo step', () => {
  const h = bootRewards();
  h.state.stunts.combo.lastTricks.push({ episodeId: 'ep_1', points: 165 });
  h.bus.emit('stunt:trickDetected', runTrick());
  assert.equal(h.awards.length, 1);
  assert.equal(h.awards[0].score, 165);
  assert.equal(h.awards[0].reason, 'stunt');
  h.bus.emit('stunt:trickDetected', runTrick());
  assert.equal(h.awards.length, 1, 'duplicate episode must not pay twice');
});

test('run stunt score rejects nonplayer, noncohort, and trick-only inputs', () => {
  const h = bootRewards();
  h.state.stunts.combo.lastTricks.push({ episodeId: 'ep_1', points: 165 });
  h.bus.emit('stunt:trickDetected', runTrick({ actorId: 'npc_tug' }));
  h.bus.emit('stunt:trickDetected', runTrick({
    episodeId: 'ep_2', targetId: 'debris_1',
    consequence: { victimId: 'debris_1', killed: true, hullDamage: 0, hullMax: 10 },
  }));
  h.bus.emit('stunt:trickDetected', runTrick({
    episodeId: 'ep_3', targetId: 'raider_2',
    consequence: { victimId: 'raider_1', killed: true, hullDamage: 0, hullMax: 100 },
  }));
  h.bus.emit('stunt:trickDetected', runTrick({
    episodeId: 'ep_4',
    consequence: null,
  }));
  assert.equal(h.awards.length, 0);

  h.state.entities.set('raider_1', {
    id: 'raider_1', type: 'ship', alive: false, data: { runCohort: 'survival' },
  });
  h.state.stunts.combo.lastTricks.push({ episodeId: 'ep_5', points: 165 });
  h.bus.emit('stunt:trickDetected', runTrick({ episodeId: 'ep_5' }));
  assert.equal(h.awards.length, 1);

  h.bus.emit('stunt:trickDetected', runTrick({
    episodeId: 'ep_6',
    consequence: { victimId: 'raider_1', killed: true, hullDamage: 0, hullMax: 100 },
  }));
  assert.equal(h.awards.length, 1, 'a trick with no scored combo step pays nothing');
});

function bootConsequences(routeDamage) {
  const bus = createBus();
  const state = {
    mode: 'flight', playerId: 'player', tick: 42, simTime: 0.7,
    entities: new Map(), combat: {}, factions: {}, settings: {},
  };
  state.entities.set('player', {
    id: 'player', type: 'ship', team: 0, alive: true,
    hull: 100, hullMax: 100, mass: 50, vel: { x: 0, z: 0 }, data: {},
  });
  const target = {
    id: 'raider_1', type: 'ship', team: 1, alive: true,
    hull: 100, hullMax: 200, mass: 45, vel: { x: 0, z: 0 },
    data: { encounter: { id: 'enc_1' } },
  };
  const other = { id: 'asteroid_1', type: 'asteroid', mass: 1000, vel: { x: 0, z: 0 } };
  state.entities.set(target.id, target);
  state.entities.set(other.id, other);
  const sys = Object.create(collisionConsequences);
  sys.init({ state, bus, registry: { get: (id) => (id === 'combat' ? { kernel: { routeDamage } } : null) } });
  const receipts = [];
  bus.on('combat:collisionConsequence', (r) => receipts.push(r));
  return { state, bus, sys, target, other, receipts };
}

test('live contact emits an enriched consequence through a real damage route', () => {
  const h = bootConsequences(({ targetId, packet }) => {
    const e = h.state.entities.get(targetId);
    const dmg = Object.values((packet && packet.channels) || {})
      .reduce((sum, v) => sum + (Number(v) || 0), 0);
    e.hull = Math.max(0, e.hull - dmg);
    if (e.hull <= 0) e.alive = false;
    return { ok: true };
  });
  h.state.combat.entities = {
    raider_1: {
      statuses: {
        status_tumbling: {
          id: 'status_tumbling', applyTick: 42,
          data: { startedAt: 1.0, until: 3.5 },
        },
      },
    },
  };
  h.sys._resolveTarget(h.target, h.other, { pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 } }, 1350, 42, {
    actorId: 'player', weaponId: 'wpn_concussion_cannon_m', tag: 'weapon_shove', appliedTick: 42,
  }, false);
  assert.equal(h.receipts.length, 1);
  const receipt = h.receipts[0];
  assert.ok(Object.isFrozen(receipt));
  assert.equal(receipt.targetHostile, true);
  assert.equal(receipt.targetType, 'ship');
  assert.equal(receipt.otherType, 'asteroid');
  assert.equal(receipt.damageApplied, true);
  assert.ok(receipt.hullDamage > 0, `hullDamage ${receipt.hullDamage} must reflect the routed packet`);
  assert.equal(receipt.targetHullMax, 200);
  assert.equal(receipt.targetKilled, h.target.alive === false);
  assert.equal(receipt.helmLossSeconds, 2.5);

  const d = createStuntDetector({ playerId: 'player' });
  const tricks = d.processEvent('combat:collisionConsequence', receipt);
  assert.equal(tricks.length, 1, 'a real live contact consequence must reach the detector');
});

test('a material collision without a timed causal root remains unclaimed', () => {
  const detector = createStuntDetector({ playerId: 'player' });
  assert.deepEqual(detector.processEvent('combat:collisionConsequence', hostileReceipt({
    surface: 'terrain', provenance: { actorId: 'player' },
  })), []);
});

test('failed damage routing reports damageApplied false and mints no stunt', () => {
  const h = bootConsequences(() => ({ ok: false }));
  h.sys._resolveTarget(h.target, h.other, { pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 } }, 1350, 42, {
    actorId: 'player', weaponId: 'wpn_concussion_cannon_m', tag: 'weapon_shove', appliedTick: 42,
  }, false);
  assert.equal(h.receipts.length, 1);
  const receipt = h.receipts[0];
  assert.equal(receipt.damageApplied, false);
  assert.equal(receipt.hullDamage, 0);
  assert.equal(receipt.targetKilled, false);
  const d = createStuntDetector({ playerId: 'player' });
  assert.equal(d.processEvent('combat:collisionConsequence', receipt).length, 0);
});
