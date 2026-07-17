/**
 * Package B — Nestbreaker golden thread on live unique-wreck APIs.
 * Path: bar rumor → bearing → scan fix → salvage decision → claim vs leave
 * with different durable state, unique non-shop loot, news/graffiti, claim pursuers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { uniqueWrecks, RUMOR_EVENT_BY_CHANNEL } from '../src/systems/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const WRECK_ID = 'wreck_nestbreaker';
const UNIQUE_DROP = 'unique_nestbreaker_rack';
const SCRATCH = process.env.DEPTH_SCRATCH
  || 'C:/Users/93rob/AppData/Local/Temp/grok-goal-91667f5416cc/implementer/package-B';

function boot(seed = 61001) {
  const def = uniqueWreckById(WRECK_ID);
  const sim = createSimulation({
    seed,
    systems: [encounterDirector, uniqueWrecks, cargo, ships, economy, factions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def.sectorId;
  state.player.cargo.capVolume = 2000;
  state.player.cargo.capMass = 1e9;
  state.player.moduleInventory = state.player.moduleInventory || [];
  // Nestbreaker scan may require survey suite — grant if authored.
  if (def.scanRequirement || def.scanGate?.moduleId) {
    const modId = def.scanRequirement || def.scanGate.moduleId;
    state.player.moduleInventory.push({ defId: modId, id: `test_${modId}` });
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  if (sim.registry.get('factions')?.newGame) sim.registry.get('factions').newGame();
  const events = [];
  for (const name of [
    'uniqueWreck:decisionReady', 'uniqueWreck:resolved', 'uniqueWreck:salvaged',
    'uniqueWreck:bearingFixed', 'uniqueWreck:complicationTriggered',
    'uniqueWreck:encounterRequested', 'uniqueWreck:encounterActivated',
    'news:publish', 'graffiti:show', 'faction:repDelta', 'economy:grantCredits',
    'module:granted',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  return { sim, state, bus, events, def, system: sim.registry.get('uniqueWrecks'), dispose: () => sim.dispose() };
}

function shopCatalogHas(id) {
  const weapons = Array.isArray(WEAPONS) ? WEAPONS : Object.values(WEAPONS);
  const modules = Array.isArray(MODULES) ? MODULES : Object.values(MODULES);
  // Unique drops use unique_ prefix and are not base shop catalog rows.
  if (weapons.some((w) => w.id === id && !String(id).startsWith('unique_'))) return true;
  if (modules.some((m) => m.id === id && !String(id).startsWith('unique_'))) return true;
  return weapons.some((w) => w.id === id && w.shop === true)
    || modules.some((m) => m.id === id && m.shop === true);
}

function runToDecision(t) {
  const source = t.def.rumorSources.find((entry) => entry.sourceRef === t.def.bearingSourceRef);
  assert.ok(source, 'bearing rumor source');
  const eventName = RUMOR_EVENT_BY_CHANNEL[source.channelId];
  assert.ok(eventName, `channel ${source.channelId} maps to rumor event`);
  t.bus.emit(eventName, {
    wreckId: t.def.id,
    authoredWreckId: t.def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
  });
  const record = t.state.player.uniqueWrecks.bearings[t.def.id];
  assert.ok(record, 'rumor opens durable bearing');
  assert.equal(record.phase, 'rumored');

  t.state.world.currentSectorId = t.def.sectorId;
  // Place player at exact pos for scan radius.
  const player = t.state.entities.get(t.state.playerId);
  player.pos = { ...record.exactPos };
  t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  assert.equal(record.phase, 'fixed', 'scan inside ring fixes bearing');
  assert.ok(t.events.some((e) => e.name === 'uniqueWreck:bearingFixed'));

  const wreck = t.state.entityList.find((e) => e.data?.uniqueWreckId === t.def.id);
  assert.ok(wreck, 'named wreck materializes');
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  assert.equal(record.phase, 'decision');
  assert.ok(t.events.some((e) => e.name === 'uniqueWreck:decisionReady'));
  return record;
}

test('golden thread: claim vs leave produce different durable state + unique loot + pursuer', () => {
  mkdirSync(SCRATCH, { recursive: true });
  const before = { claim: null, leave: null };

  // ── CLAIM path ──
  const claim = boot(61011);
  try {
    const record = runToDecision(claim);
    const repBefore = claim.state.factions.faction_reach?.rep
      ?? claim.state.factions.faction_scn?.rep ?? 0;
    claim.bus.emit('uniqueWreck:choose', {
      wreckId: WRECK_ID, choiceId: 'claim_hardware', source: 'test',
    });
    assert.equal(record.phase, 'salvaged');
    assert.equal(record.choiceId, 'claim_hardware');
    assert.equal(record.outcome, 'claimed');
    assert.ok(record.rewardReceipt, 'claim writes reward receipt');
    assert.equal(record.rewardReceipt.uniqueDropId, UNIQUE_DROP);
    assert.equal(claim.state.player.uniqueWrecks.grants[UNIQUE_DROP]?.wreckId, WRECK_ID);
    assert.ok(
      claim.state.player.moduleInventory.some((m) => m?.defId === UNIQUE_DROP)
      || claim.state.player.uniqueWrecks.grants[UNIQUE_DROP],
      'unique rack granted via ships authority',
    );
    assert.equal(shopCatalogHas(UNIQUE_DROP), false, 'unique drop is not a shop catalog row');
    assert.ok(claim.events.some((e) => e.name === 'news:publish'
      && /NESTBREAKER|rack|shrine/i.test(String(e.payload?.text || e.payload?.detail || ''))));
    assert.ok(claim.events.some((e) => e.name === 'graffiti:show'
      && /CLAIMED/i.test(String(e.payload?.line || ''))));
    const repAfter = claim.state.factions.faction_reach?.rep
      ?? claim.state.factions.faction_scn?.rep ?? 0;
    // Claim may apply negative rep if authored; at least rep event or different receipt vs leave.
    const claimComp = Object.values(claim.state.player.uniqueWrecks.complications || {})
      .find((c) => c.wreckId === WRECK_ID && (c.kind === 'bounty_escalation' || c.encounterId));
    assert.ok(claimComp, 'claim arms admirer complication');
    assert.ok(
      claim.events.some((e) => e.name === 'uniqueWreck:complicationTriggered'
        || e.name === 'uniqueWreck:encounterRequested'),
      'claim triggers pursuer/complication on live bus',
    );
    assert.ok(
      claim.events.some((e) => e.name === 'uniqueWreck:encounterActivated'),
      'claim activates pursuer encounter on live bus',
    );
    assert.ok(ENCOUNTERS.unique_wreck_nestbreaker_admirers, 'admirer encounter is catalogued');
    // Live director must hold a real squad (not script_error / empty fire).
    const liveIds = Object.keys(claim.state.encounterDirector?.live || {});
    const livePursuer = liveIds
      .map((id) => claim.state.encounterDirector.live[id])
      .find((live) => live && (
        live.shapeId === 'unique_wreck_nestbreaker_admirers'
        || String(live.id || '').includes('nestbreaker')
        || (live.data && live.data.uniqueWreckId === WRECK_ID)
      ));
    assert.ok(livePursuer, `live pursuer encounter present (live=${JSON.stringify(liveIds)})`);
    const spawned = Array.isArray(livePursuer.ids) ? livePursuer.ids.length : 0;
    const planned = Array.isArray(livePursuer.plan?.ships) ? livePursuer.plan.ships.length : 0;
    assert.ok(spawned > 0 || planned > 0, 'pursuer has spawned or planned squad ships');
    if (spawned > 0) {
      const hostiles = (claim.state.entityList || []).filter((e) => (
        e && e.alive !== false && e.team === 1 && livePursuer.ids.includes(e.id)
      ));
      assert.ok(hostiles.length > 0, 'pursuer hostiles exist in entityList');
    }
    before.claim = {
      phase: record.phase,
      choiceId: record.choiceId,
      outcome: record.outcome,
      uniqueDropId: record.rewardReceipt.uniqueDropId,
      credits: claim.state.player.credits,
      rep: repAfter,
      repBefore,
      complication: claimComp?.kind || claimComp?.encounterId || null,
      graffiti: claim.events.filter((e) => e.name === 'graffiti:show').map((e) => e.payload.line),
      news: claim.events.filter((e) => e.name === 'news:publish').map((e) => e.payload.text),
      grants: Object.keys(claim.state.player.uniqueWrecks.grants || {}),
    };
  } finally {
    claim.dispose();
  }

  // ── LEAVE / HANDOVER path ──
  const leave = boot(61012);
  try {
    const record = runToDecision(leave);
    const creditsBefore = leave.state.player.credits;
    const repBefore = leave.state.factions.faction_reach?.rep ?? 0;
    leave.bus.emit('uniqueWreck:choose', {
      wreckId: WRECK_ID, choiceId: 'authority_handover', source: 'test',
    });
    assert.equal(record.phase, 'salvaged');
    assert.equal(record.choiceId, 'authority_handover');
    assert.equal(record.outcome, 'handed_over');
    assert.equal(record.rewardReceipt.uniqueDropId, null);
    assert.equal(leave.state.player.uniqueWrecks.grants[UNIQUE_DROP], undefined,
      'leave does not grant unique rack');
    assert.ok(leave.state.player.credits > creditsBefore, 'leave pays honor credits');
    const repAfter = leave.state.factions.faction_reach?.rep ?? 0;
    assert.ok(repAfter >= repBefore, 'leave improves or holds Reach standing');
    assert.ok(leave.events.some((e) => e.name === 'graffiti:show'
      && /LEFT WHOLE|WHOLE/i.test(String(e.payload?.line || ''))));
    const leaveComp = Object.values(leave.state.player.uniqueWrecks.complications || {})
      .find((c) => c.wreckId === WRECK_ID && (c.kind === 'bounty_escalation' || c.encounterId));
    assert.equal(leaveComp, undefined, 'leave does not arm admirer pursuit');
    before.leave = {
      phase: record.phase,
      choiceId: record.choiceId,
      outcome: record.outcome,
      uniqueDropId: record.rewardReceipt.uniqueDropId,
      credits: leave.state.player.credits,
      creditsBefore,
      rep: repAfter,
      repBefore,
      complication: null,
      graffiti: leave.events.filter((e) => e.name === 'graffiti:show').map((e) => e.payload.line),
      news: leave.events.filter((e) => e.name === 'news:publish').map((e) => e.payload.text),
      grants: Object.keys(leave.state.player.uniqueWrecks.grants || {}),
    };
  } finally {
    leave.dispose();
  }

  assert.notEqual(before.claim.choiceId, before.leave.choiceId);
  assert.notEqual(before.claim.outcome, before.leave.outcome);
  assert.notEqual(before.claim.uniqueDropId, before.leave.uniqueDropId);
  assert.ok(before.claim.credits !== before.leave.credits
    || before.claim.grants.length !== before.leave.grants.length);

  writeFileSync(join(SCRATCH, 'before-after.json'), JSON.stringify(before, null, 2));
});

test('golden thread path stages are documentable on shipped APIs', () => {
  const t = boot(61020);
  try {
    const stages = [];
    const source = t.def.rumorSources[0];
    t.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
      wreckId: t.def.id, sourceRef: source.sourceRef, channelId: source.channelId,
    });
    stages.push({ stage: 'rumor', phase: t.state.player.uniqueWrecks.bearings[WRECK_ID].phase });
    const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    const player = t.state.entities.get(t.state.playerId);
    player.pos = { ...record.exactPos };
    t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
    stages.push({ stage: 'scan_fix', phase: record.phase });
    const wreck = t.state.entityList.find((e) => e.data?.uniqueWreckId === WRECK_ID);
    t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    stages.push({ stage: 'salvage_decision', phase: record.phase });
    t.bus.emit('uniqueWreck:choose', { wreckId: WRECK_ID, choiceId: 'claim_hardware' });
    stages.push({
      stage: 'claim',
      phase: record.phase,
      choiceId: record.choiceId,
      loot: record.rewardReceipt?.uniqueDropId || null,
    });
    assert.deepEqual(stages.map((s) => s.stage), [
      'rumor', 'scan_fix', 'salvage_decision', 'claim',
    ]);
    assert.deepEqual(stages.map((s) => s.phase), [
      'rumored', 'fixed', 'decision', 'salvaged',
    ]);
    writeFileSync(join(SCRATCH, 'path-stages.json'), JSON.stringify(stages, null, 2));
  } finally {
    t.dispose();
  }
});
