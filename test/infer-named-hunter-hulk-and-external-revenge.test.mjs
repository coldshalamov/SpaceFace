// U5 (WF-09): killing a named hunter with lossLedger live preserves the authored
// "<Captain>'s Hulk" scanLabel and attaches black-box killer provenance for the target
// panel; killing an externally bound named captain (externalNamed) records deathTick /
// killedBy and escalates surviving NAMED_CAPTAINS for the revenge-vow hunt.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { NAMED_CAPTAINS } from '../src/data/encounters.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { objectInfoLine, targetDisplayName } from '../src/ui/targetPanel.js';

const SECTOR = 'sector_io_reach';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [lossLedger, encounterDirector] });
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 100,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel', intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    director: sim.registry.get('encounterDirector'),
    player,
  };
}

test('with lossLedger active, a killed named hunter keeps its authored Hulk scanLabel and black-box killer', () => {
  const t = boot(4242);
  const res = t.director.requestAuthoredEncounter({
    shapeId: 'named_hunter',
    encounterId: 'u5:hunter-hulk',
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(res.ok, true);
  const live = t.state.encounterDirector.live['u5:hunter-hulk'];
  const captainName = live.vars.name;
  const bossId = Number(Object.keys(live.roles).find((k) => live.roles[k] === 'boss'));
  const boss = t.state.entities.get(bossId);
  // Stamp shipDefId so lossLedger._handleEntityKilled records a sector loss on the boss kill
  boss.data.defId = 'ship_hornet';
  boss.alive = false;
  t.state.tick = 120;
  t.bus.emit('entity:killed', { id: boss.id, killerId: t.player.id, type: 'ship', pos: { ...boss.pos } });
  t.sim.step(1);

  const hulks = [...t.state.entities.values()].filter((e) => e.type === 'wreck');
  assert.equal(hulks.length, 1);
  const hulk = hulks[0];
  assert.equal(hulk.data.scanLabel, `${captainName}'s Hulk`,
    'lossLedger._tagWreck preserves the authored captain hulk scanLabel instead of overwriting it');
  assert.equal(targetDisplayName(hulk), `${captainName}'s Hulk`);
  assert.equal(hulk.data.provenance.killerLabel, 'You');
  assert.ok(hulk.data.provenance.lossId, 'sector loss provenance is merged without dropping killerLabel');

  hulk.data.scanned = true;
  const facts = objectInfoLine(hulk, t.state, t.player, 50);
  assert.match(facts, /Killer: You/, `scanned hulk names its killer: ${facts}`);
});

test('killing an externally bound named captain records killedBy/deathTick and triggers the survivor revenge vow', () => {
  const t = boot(4242);
  const externalCap = NAMED_CAPTAINS[0];
  const extShip = t.sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 200, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10,
    mass: 100,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_hornet', name: externalCap.name },
  });
  t.bus.emit('encounter:namedCaptainBound', { captainId: externalCap.id, entityId: extShip.id });

  const voices = [];
  const defeats = [];
  t.bus.on('encounter:voice', (p) => voices.push(p));
  t.bus.on('encounter:namedCaptainDefeated', (p) => defeats.push(p));

  extShip.alive = false;
  t.state.tick = 300;
  t.bus.emit('entity:killed', { id: extShip.id, killerId: t.player.id, type: 'ship', pos: { ...extShip.pos } });

  assert.equal(defeats.length, 1);
  assert.equal(defeats[0].captainId, externalCap.id);
  assert.equal(defeats[0].captainName, externalCap.name);
  assert.equal(defeats[0].byPlayer, true);

  const rec = t.state.encounterDirector.named[externalCap.id];
  assert.equal(rec.alive, false);
  assert.equal(rec.killedBy, 'player');
  assert.equal(rec.deathTick, 300);

  for (const survivor of NAMED_CAPTAINS) {
    if (survivor.id === externalCap.id) continue;
    assert.equal(t.state.encounterDirector.named[survivor.id].tier, 1,
      `surviving captain ${survivor.id} escalates grudge tier after external captain kill`);
  }

  // Next named_hunter encounter speaks the revenge vow for the externally killed captain
  const next = t.director.requestAuthoredEncounter({
    shapeId: 'named_hunter',
    encounterId: 'u5:revenge-answer',
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(next.ok, true);
  const answerLive = t.state.encounterDirector.live['u5:revenge-answer'];
  const escorts = Object.values(answerLive.roles).filter((r) => r === 'escort').length;
  const answerDef = NAMED_CAPTAINS.find((c) => c.id === answerLive.data.captainId);
  assert.equal(escorts, answerDef.escort.size[0] + 1, 'survivor flies with +1 revenge wingman');
  assert.ok(
    voices.some((v) => v.encounterId === 'u5:revenge-answer' && v.text.includes(`flies for ${externalCap.name}`)),
    'survivor entrance vows revenge for the externally killed captain',
  );
});
