// Direct-only encounter scripts for R2 unique-wreck complications.
// Consequences remain inside encounterDirector's spawn/resolve facade and deterministic clock.

const ESCAPE_RADIUS = 3200;

function startHostile(d, live, state) {
  const player = d.player();
  if (!player) return d.abort(live, 'no_player');
  const ships = Array.isArray(live.plan && live.plan.ships) ? live.plan.ships : [];
  if (!ships.length) return d.abort(live, 'no_authored_squad');
  const ids = d.spawnShips(live, ships);
  if (!ids.length) return d.abort(live, 'no_budget');

  const boss = d.entsOf(live)[0];
  if (boss && live.shape.bossName) {
    boss.data = boss.data || {};
    boss.data.encounterBoss = true;
    boss.data.ai = boss.data.ai || {};
    boss.data.ai.name = live.shape.bossName;
  }
  live.phase = 'conflict';
  live.deadlineAt = d.now() + (live.shape.windowS || 300);
  d.say(live, 'alert', live.shape.telegraph, null, { literal: true, primary: true });
  return live;
}

function tickHostile(d, live, state, now) {
  const player = d.player();
  if (!player) return d.abort(live, 'no_player');
  if (d.aliveCount(live) === 0) return d.resolve(live, 'cleared', { speak: false });
  if (d.minDist2ToSquad(live, player) >= ESCAPE_RADIUS * ESCAPE_RADIUS || now >= live.deadlineAt) {
    d.despawnAll(live, 15);
    return d.resolve(live, 'escaped', { speak: false });
  }
  return null;
}

function directOnlyScript() {
  return Object.freeze({
    start: startHostile,
    fire: startHostile,
    tick: tickHostile,
  });
}

// The Choir-Tender investigator is an audit, not an ambush: one lawful cutter holds station
// and offers the wreck's own report/loot choice. 'report' files the claim with relief control
// (small standing gain); 'loot' — or silence — keeps the goods and takes the adverse filing.
// The hull never fires first; ordinary lawful self-defense still applies if the pilot shoots.
function startInvestigatorAudit(d, live, state) {
  const player = d.player();
  if (!player) return d.abort(live, 'no_player');
  const ships = Array.isArray(live.plan && live.plan.ships) ? live.plan.ships : [];
  if (!ships.length) return d.abort(live, 'no_authored_squad');
  const ids = d.spawnShips(live, ships);
  if (!ids.length) return d.abort(live, 'no_budget');

  const boss = d.entsOf(live)[0];
  if (boss && live.shape.bossName) {
    boss.data = boss.data || {};
    boss.data.encounterBoss = true;
    boss.data.ai = boss.data.ai || {};
    boss.data.ai.name = live.shape.bossName;
  }
  live.phase = 'offer';
  live.deadlineAt = d.now() + (live.shape.windowS || 240);
  d.say(live, 'alert', live.shape.telegraph, null, { literal: true, primary: true });
  d.offerChoices(live, ['report', 'loot'], live.shape.timeoutChoice || 'loot', live.deadlineAt);
  return live;
}

function chooseInvestigatorAudit(d, live, state, choiceId) {
  if (live.phase !== 'offer') return;
  if (choiceId === 'report') {
    d.rep('faction_scn', 4, 'relief_claim_filed');
    d.despawnAll(live, 40);
    return d.resolve(live, 'reported');
  }
  if (choiceId === 'loot') {
    d.rep('faction_scn', -4, 'relief_claim_adverse');
    d.despawnAll(live, 40);
    return d.resolve(live, 'adverse');
  }
}

function tickInvestigatorAudit(d, live, state, now) {
  if (live.phase !== 'offer') return null;
  const player = d.player();
  if (!player) return d.abort(live, 'no_player');
  if (d.aliveCount(live) === 0) return d.resolve(live, 'cleared', { speak: false });
  if (now >= live.deadlineAt) {
    return chooseInvestigatorAudit(d, live, state, live.shape.timeoutChoice || 'loot');
  }
  return null;
}

export const uniqueWreckChoirTenderInvestigator = Object.freeze({
  start: startInvestigatorAudit,
  fire: startInvestigatorAudit,
  choose: chooseInvestigatorAudit,
  tick: tickInvestigatorAudit,
});

export const uniqueWreckHeldMass = directOnlyScript();
export const uniqueWreckPingElite = directOnlyScript();
export const uniqueWreckSilverDraftCleaner = directOnlyScript();
export const uniqueWreckCassandraHardliners = directOnlyScript();
export const uniqueWreckNestbreakerAdmirers = directOnlyScript();
