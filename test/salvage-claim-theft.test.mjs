// Salvage claim theft — a staked wreck defends itself against the player's beam.
// U12 (WF-06): traffic salvors plant salvorClaimedBy flags; the player drains wrecks
// through _drainWreck, which bypasses the claim protocol. Stripping another crew's
// stake protests in their name and reports payload_theft through the law owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { mining } from '../src/systems/mining.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';

function rig({ lawImpl = null } = {}) {
  const bus = createBus();
  const reports = [];
  const lawStub = {
    reportIncident(request) {
      reports.push(structuredClone(request));
      if (lawImpl) return lawImpl(request, reports.length);
      return { accepted: true, incidentReceiptId: `law:incident:test:${reports.length}` };
    },
  };
  const state = {
    mode: 'flight',
    simTime: 100,
    tick: 6000,
    meta: { seed: 5150 },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { targetId: null, cargo: { items: {}, usedVolume: 0, capVolume: 40 } },
    world: { currentSectorId: 'sector_helios_prime' },
    rng: () => 0.5,
  };
  const pods = [];
  const mine = Object.create(mining);
  mine.init({
    state,
    bus,
    helpers: { spawnEntity(spec) { const pod = { id: 900 + pods.length, ...spec }; pods.push(pod); return pod; } },
    registry: { get: (id) => (id === 'lawSecurity' ? lawStub : null) },
  });
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 10, hull: 100, hullMax: 100,
    data: { ai: {} },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const events = { toasts: [], jumped: [], yields: [] };
  bus.on('toast', (p) => events.toasts.push(structuredClone(p)));
  bus.on('salvage:claimJumped', (p) => events.jumped.push(structuredClone(p)));
  bus.on('mining:yield', (p) => events.yields.push(structuredClone(p)));
  return { state, bus, mine, player, events, reports, pods };
}

function stakedWreck(t, { id = 41, claimant = 'wr_salvor_7', pool = null } = {}) {
  const wreck = {
    id, type: 'wreck', alive: true, team: -1,
    pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 50, hull: 10, hullMax: 10,
    data: {
      salvagePool: pool || { cmdty_scrap_polymer: 20 },
      salvorClaimedBy: claimant,
    },
  };
  t.state.entities.set(wreck.id, wreck);
  t.state.entityList.push(wreck);
  return wreck;
}

function salvorCrew(t, { id = 51, recordId = 'wr_salvor_7', name = 'Cutter Annick' } = {}) {
  const crew = {
    id, type: 'ship', alive: true, team: 2,
    pos: { x: 340, z: 20 }, vel: { x: 0, z: 0 }, radius: 6, mass: 10, hull: 100, hullMax: 100,
    data: { ai: {}, worldRecordId: recordId, shipName: name },
  };
  t.state.entities.set(crew.id, crew);
  t.state.entityList.push(crew);
  return crew;
}

function drain(t, wreck, dt = 3) {
  t.mine._drainWreck(t.player, wreck, 18, dt);
}

test('stripping a staked wreck protests and reports the theft', () => {
  const t = rig();
  const wreck = stakedWreck(t);
  const crew = salvorCrew(t);
  drain(t, wreck);
  assert.ok(t.events.yields.length > 0, 'beam takes goods');
  assert.equal(t.reports.length, 1);
  const report = t.reports[0];
  assert.equal(report.kind, 'payload_theft');
  assert.equal(report.offenderStableId, 'player');
  assert.equal(report.offenderEntityId, 1);
  assert.equal(report.victimEntityId, crew.id, 'live crew witnesses its own robbery');
  assert.equal(report.reportId, `claimjump:${wreck.id}:wr_salvor_7`);
  assert.equal(t.events.jumped.length, 1);
  assert.equal(t.events.jumped[0].wreckId, wreck.id);
  assert.equal(t.events.jumped[0].accepted, true);
  assert.deepEqual(t.events.jumped[0].took, { cmdty_scrap_polymer: 10 });
  assert.equal(t.events.toasts.length, 1);
  assert.match(t.events.toasts[0].text, /Cutter Annick: That's our wreck, hauler — law's been called\./);
});

test('an unstaked wreck strips silently', () => {
  const t = rig();
  const wreck = stakedWreck(t, { claimant: null });
  drain(t, wreck);
  assert.ok(t.events.yields.length > 0, 'beam takes goods');
  assert.equal(t.reports.length, 0);
  assert.equal(t.events.jumped.length, 0);
  assert.equal(t.events.toasts.length, 0);
});

test('one protest per window; the report id stays stable across re-protests', () => {
  const t = rig();
  stakedWreck(t, { pool: { cmdty_scrap_polymer: 60 } });
  salvorCrew(t);
  const wreck = t.state.entities.get(41);
  drain(t, wreck, 1);
  drain(t, wreck, 1);
  assert.equal(t.reports.length, 1, 'cooldown swallows the second drain');
  t.state.simTime += 13;
  drain(t, wreck, 1);
  assert.equal(t.reports.length, 2, 'a later pass protests again');
  assert.equal(t.reports[0].reportId, t.reports[1].reportId, 'law sees one incident per stake');
});

test('a denied report still protests, without claiming the law came', () => {
  const t = rig({ lawImpl: () => ({ accepted: false, reason: 'no_jurisdiction' }) });
  stakedWreck(t);
  salvorCrew(t);
  drain(t, t.state.entities.get(41));
  assert.equal(t.reports.length, 1);
  assert.equal(t.events.jumped[0].accepted, false);
  assert.match(t.events.toasts[0].text, /back off the claim\./);
  assert.doesNotMatch(t.events.toasts[0].text, /law's been called/);
});

test('a stake with no live crew still counts — the flag is the claim', () => {
  const t = rig();
  stakedWreck(t);
  drain(t, t.state.entities.get(41));
  assert.equal(t.reports.length, 1);
  assert.equal(t.reports[0].victimEntityId, null);
  assert.match(t.events.toasts[0].text, /^Salvor crew: That's our wreck/);
});

test('the jumped stake lands in the ledger as a raid', () => {
  const t = rig();
  const ledger = Object.create(provenanceLedger);
  ledger.init({ state: t.state, bus: t.bus });
  stakedWreck(t);
  salvorCrew(t);
  drain(t, t.state.entities.get(41));
  const chains = t.state.provenance.chains;
  assert.ok(chains.length > 0, 'a chain opens');
  const nodes = chains.flatMap((c) => c.nodes || []);
  const raid = nodes.find((n) => n && n.outcome === 'raided');
  assert.ok(raid, 'consequence node records the raid');
  assert.equal(raid.bodyId, 'wreck:41');
  assert.match(raid.text, /stake jumped by the player/);
});

test('coming back to the same stake gets recognized', () => {
  const t = rig();
  stakedWreck(t, { pool: { cmdty_scrap_polymer: 60 } });
  salvorCrew(t);
  const wreck = t.state.entities.get(41);
  drain(t, wreck, 1);
  assert.doesNotMatch(t.events.toasts[0].text, /You again/);
  t.state.simTime += 13;
  drain(t, wreck, 1);
  assert.equal(t.events.toasts.length, 2);
  assert.match(t.events.toasts[1].text, /You again\?!/);
  assert.equal(t.events.jumped[1].visits, 2);
});

test('authored staked sources protest through the ledger path too', () => {
  const t = rig();
  t.mine.helpers.salvage = {
    source: () => ({ extracted: false, remainingQty: 20, remainingPool: { cmdty_scrap_polymer: 20 } }),
    drainSource: ({ requested }) => ({
      ok: true,
      taken: { ...requested },
      source: { remainingPool: {}, remainingQty: 0 },
    }),
  };
  const wreck = stakedWreck(t);
  wreck.data.salvageSourceKey = 'src:test:staked-1';
  salvorCrew(t);
  const completed = [];
  t.bus.on('salvage:completed', (p) => completed.push(p));
  drain(t, wreck);
  assert.equal(t.events.jumped.length, 1, 'authored takes also count as theft');
  assert.equal(t.reports.length, 1);
  assert.equal(completed.length, 1, 'completion still fires alongside the protest');
});

test("the player's own stake is never theft", () => {
  const t = rig();
  stakedWreck(t, { claimant: 'player:myself' });
  drain(t, t.state.entities.get(41));
  assert.ok(t.events.yields.length > 0, 'beam takes goods');
  assert.equal(t.reports.length, 0);
  assert.equal(t.events.jumped.length, 0);
});
