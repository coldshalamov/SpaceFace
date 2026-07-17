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

export const uniqueWreckHeldMass = directOnlyScript();
export const uniqueWreckPingElite = directOnlyScript();
export const uniqueWreckSilverDraftCleaner = directOnlyScript();
export const uniqueWreckCassandraHardliners = directOnlyScript();
export const uniqueWreckNestbreakerAdmirers = directOnlyScript();
