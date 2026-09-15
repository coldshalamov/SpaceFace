import { test } from "node:test";
import assert from "node:assert/strict";
import { bindStuntEvidence, bodyLife, observeConstraint, observeRelease, journalFor } from "../src/combat/stuntEvidence.js";
import { boundStuntNarrative, observeStuntWitnesses, sampledStuntWitnesses, observerProfile, witnessLineOfSight, qualifyStuntTitles, sendWitnessReports, deliverWitnessReports, knownStuntTitles, stuntDossierForNetwork, STUNT_TITLE_RULES } from "../src/combat/stuntWitnesses.js";
import { resolveEntity } from "../src/ui/entityResolver.js";
import { createTitlesSystem } from "../src/systems/titles.js";
import { barkDirector } from "../src/systems/barkDirector.js";
import { voiceArbiter } from "../src/ui/voiceArbiter.js";
import { buildShipLedger } from "../src/systems/shipLedger.js";
function busFor() {
  const handlers = /* @__PURE__ */ new Map(), events = [];
  return { events, on(k, f) {
    if (!handlers.has(k)) handlers.set(k, /* @__PURE__ */ new Set());
    handlers.get(k).add(f);
  }, off(k, f) {
    handlers.get(k)?.delete(f);
  }, emit(k, p) {
    events.push({ k, p });
    for (const f of [...handlers.get(k) || []]) f(p);
  } };
}
function hull(id, x, z, extra = {}) {
  return { id, type: "ship", alive: true, collides: true, radius: 2, mass: 100, hull: 100, hullMax: 100, team: 1, pos: { x, z }, vel: { x: 0, z: 0 }, data: { displayName: `Hull ${id}`, encounterId: "encounter:1" }, ...extra };
}
function scene() {
  const p = hull(0, 0, 0, { team: 0 }), source = hull(1, 20, 0), target = hull(2, 50, 0), witness = hull(3, 20, 50, { factionId: "faction_free" });
  const state = { tick: 0, simTime: 0, mode: "flight", playerId: 0, player: {}, entities: new Map([p, source, target, witness].map((e) => [e.id, e])), meta: { seed: 17 }, world: { currentSectorId: "sector:a" }, settings: { audio: { master: 1 }, accessibility: { captions: true } }, story: { titles: { byId: {} }, titlesSeen: [] } };
  bindStuntEvidence(state);
  const bus = busFor(), titles = createTitlesSystem();
  titles.init({ state, bus });
  return { state, bus, titles, p, source, target, witness };
}
function evidence(s) {
  const { state, p, source, target } = s;
  const attachment = { id: "rope:1", ownerId: p.id, owner: { entity: p }, target: { entity: source }, springState: { lastTension: 5 }, defId: "grapple" };
  for (let i = 0; i < 6; i++) {
    state.tick = i;
    state.simTime = i / 60;
    observeConstraint(attachment, { x: i, z: 0 }, { x: i + 1, z: 0 }, i, state);
    observeStuntWitnesses(state);
  }
  state.tick = 6;
  observeRelease(attachment.id, 6, "player", state);
  for (let i = 6; i <= 12; i++) {
    state.tick = i;
    state.simTime = i / 60;
    observeStuntWitnesses(state);
  }
  const root = [...journalFor(state).roots.values()][0], life = bodyLife(target, state);
  return { trickId: "bolas", name: "Bolas", actorId: 0, targetId: 2, episodeId: root.id, rootId: root.id, rootTick: root.tick, tick: 12, firstPayoffTick: 12, amendmentDeadline: 192, victimLives: [{ lifeId: life.id, dead: true }], consequence: { killed: true, hullDamage: 100, hullMax: 100 }, causeChain: root.nodes.map((n) => ({ ...n, type: n.kind })), evidenceRevision: 2, sourceName: "Thrown Hull", targetName: "Victim Hull" };
}
function narration(s, { voice = true } = {}) {
  const helpers = {};
  const arbiter = Object.create(voiceArbiter);
  if (voice) arbiter.init({ state: s.state, bus: s.bus, helpers });
  const barks = Object.create(barkDirector);
  barks.init({ state: s.state, bus: s.bus, helpers });
  return { barks, arbiter, helpers };
}
function advance(s, barks, arbiter, to) {
  for (let i = s.state.tick + 1; i <= to; i++) {
    s.state.tick = i;
    s.state.simTime = i / 60;
    barks._advanceStuntBarks();
    arbiter?.update(1 / 60, s.state);
  }
}
test("live observation requires six source, transfer and payoff samples and preserves actor zero", () => {
  const s = scene(), trick = evidence(s), w = sampledStuntWitnesses(s.state, trick);
  assert.ok(w.some((w2) => w2.id === 3 && w2.sourceTicks === 6 && w2.transferTicks === 6 && w2.payoffTicks === 6));
  s.bus.emit("stunt:trickDetected", trick);
  assert.equal(s.state.story.titles.stuntIncidents.length, 1);
  assert.equal(s.state.story.titles.byId.title_bolas.title, "Knotmaker");
  assert.equal(s.state.story.titles.stuntIncidents[0].encounterId, "encounter:1");
});
test("forged witnesses, disabled sensors, occlusion and late arrival cannot grant recognition", () => {
  for (const kind of ["forged", "disabled", "occluded", "late"]) {
    const s = scene();
    if (kind === "disabled") s.witness.data.sensorsEnabled = false;
    if (kind === "occluded") s.state.entities.set(4, hull(4, 20, 25, { type: "asteroid", radius: 18 }));
    if (kind === "late") s.witness.pos = { x: 1e3, z: 1e3 };
    const trick = evidence(s);
    if (kind === "forged") {
      s.state.story.titles.stuntWitnessing.episodes = {};
      trick.witnesses = [{ id: 3, sourceTicks: 999, transferTicks: 999, payoffTicks: 999 }];
    }
    s.bus.emit("stunt:trickDetected", trick);
    assert.equal(s.state.story.titles.byId.title_bolas, void 0, kind);
    assert.equal(s.state.story.titles.stuntIncidents[0].visibility, "black-box", kind);
  }
});
test("observer life reuse and dead terminal cannot manufacture observation", () => {
  const s = scene(), trick = evidence(s);
  s.state.entities.set(3, hull(3, 20, 50));
  assert.ok(!sampledStuntWitnesses(s.state, trick).some((w) => w.id === 3));
  s.target.alive = false;
  const empty = scene(), t = evidence(empty);
  empty.state.story.titles.stuntWitnessing.episodes[t.rootId].observers = {};
  empty.target.alive = false;
  assert.deepEqual(sampledStuntWitnesses(empty.state, t), []);
});
test("sensor ranges and actual terrain block visibility", () => {
  const s = scene();
  assert.equal(observerProfile(s.state, s.witness).range, 180);
  s.witness.data.role = "patrol";
  assert.equal(observerProfile(s.state, s.witness).range, 300);
  s.state.entities.set(7, hull(7, 20, 25, { type: "asteroid", radius: 10 }));
  assert.equal(witnessLineOfSight(s.state, s.witness, s.source.pos, [1]), false);
  s.state.entities.get(7).pos.x = 80;
  assert.equal(witnessLineOfSight(s.state, s.witness, s.source.pos, [1]), true);
});
test("one incident acquires local title, actual voice delivery and ledger evidence", () => {
  const s = scene(), n = narration(s), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  const incident = s.state.story.titles.stuntIncidents[0];
  assert.equal(incident.barkStatus, "queued");
  assert.equal(s.bus.events.filter((e) => e.k === "barkDirector:voice").length, 0);
  advance(s, n.barks, n.arbiter, 90);
  assert.equal(incident.barkStatus, "delivered");
  assert.equal(s.bus.events.filter((e) => e.k === "barkDirector:voice").length, 1);
  s.bus.emit("stunt:trickAmended", { ...trick, modifiers: { razorRelease: "razor" } });
  assert.equal(s.state.story.titles.stuntIncidents.length, 1);
  assert.equal(s.bus.events.filter((e) => e.k === "barkDirector:voice").length, 1);
  const ledger = buildShipLedger(s.state).entries.find((e) => e.type === "stunt");
  assert.match(ledger.text, /Thrown Hull/);
  assert.match(ledger.text, /locally witnessed/);
  assert.equal(ledger.stuntDetail.rootId, trick.rootId);
  n.barks.destroy();
});
test("accepted voice queue is not delivery; reload retries pending exactly once", () => {
  const s = scene(), n = narration(s, { voice: false }), trick = evidence(s);
  n.barks.helpers.voice = { say: () => true };
  s.bus.emit("stunt:trickDetected", trick);
  advance(s, n.barks, null, 90);
  assert.equal(s.state.story.titles.stuntIncidents[0].barkStatus, "submitted");
  assert.equal(s.state.story.titles.stuntIncidents[0].barkDelivered, void 0);
  s.state.barkDirector = JSON.parse(JSON.stringify(s.state.barkDirector));
  s.bus.emit("save:loaded", {});
  assert.equal(s.state.barkDirector.stuntRecognition.pending[0].status, "queued");
  n.barks.destroy();
});
test("muted voice gives actual transcript and both disabled records suppression", () => {
  for (const captions of [true, false]) {
    const s = scene(), n = narration(s, { voice: false }), trick = evidence(s);
    s.state.settings.audio.muted = true;
    s.state.settings.accessibility.captions = captions;
    s.bus.emit("stunt:trickDetected", trick);
    advance(s, n.barks, null, 90);
    const incident = s.state.story.titles.stuntIncidents[0];
    assert.equal(incident.barkStatus, captions ? "delivered" : "suppressed");
    assert.equal(s.bus.events.filter((e) => e.k === "comms:popup").length, captions ? 1 : 0);
    assert.equal(s.bus.events.filter((e) => e.k === "barkDirector:voice").length, 0);
    n.barks.destroy();
  }
});
test("public network knowledge requires a real delivered report, surviving sender death", () => {
  const s = scene(), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  const incident = s.state.story.titles.stuntIncidents[0], station = hull(8, 100, 100, { type: "station", factionId: "faction_free" });
  s.state.entities.set(8, station);
  sendWitnessReports(s.state, incident, s.bus);
  assert.equal(incident.visibility, "witnessed");
  assert.equal(s.state.story.titles.stuntWitnessing.reports.length, 1);
  s.witness.alive = false;
  s.state.tick = 100;
  deliverWitnessReports(s.state, s.bus);
  assert.equal(incident.visibility, "reported");
  const newcomer = hull(9, 10, 50, { factionId: "faction_free" });
  s.state.entities.set(9, newcomer);
  assert.equal(knownStuntTitles(s.state, newcomer)[0].title, "Knotmaker");
  deliverWitnessReports(s.state, s.bus);
  assert.equal(incident.reports.length, 1);
});
test("a delivered report opens the faction and port dossier; other networks stay ignorant", () => {
  const s = scene(), trick = evidence(s);
  s.witness.factionId = "faction_scn";
  s.bus.emit("stunt:trickDetected", trick);
  const incident = s.state.story.titles.stuntIncidents[0];
  s.state.entities.set(8, hull(8, 100, 100, { type: "station", factionId: "faction_scn", data: { stationId: "station_helios", displayName: "Helios Station" } }));
  assert.equal(stuntDossierForNetwork(s.state, "faction_scn"), null, "witnessed-only is not a public file");
  sendWitnessReports(s.state, incident, s.bus);
  s.state.tick = 100;
  deliverWitnessReports(s.state, s.bus);
  const rap = stuntDossierForNetwork(s.state, "faction_scn");
  assert.equal(rap.titles[0].title, "Knotmaker");
  assert.equal(rap.incidents[0].id, incident.id);
  assert.match(rap.incidents[0].account, /under load/);
  assert.match(rap.incidents[0].harm, /destroyed/);
  assert.equal(rap.incidents[0].disposition, "reported");
  assert.equal(stuntDossierForNetwork(s.state, "faction_dmc"), null, "a network with no report learns nothing");
  const faction = resolveEntity(s.state, "faction:faction_scn");
  assert.ok(faction.facts.some((f) => f.k === "Pilot on file" && /Knotmaker/.test(f.v)));
  assert.ok(faction.lines.some((l) => l.label === "Incident" && /under load/.test(l.text)));
  assert.ok(faction.lines.some((l) => l.label === "On file" && /delivered report/.test(l.text)));
  const station = resolveEntity(s.state, "station:station_helios");
  assert.ok(station.lines.some((l) => l.label === "Incident" && /under load/.test(l.text)));
});
test("failed receiver life and unsupported unrelated knowledge do not propagate", () => {
  const s = scene(), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  const incident = s.state.story.titles.stuntIncidents[0];
  s.state.entities.set(8, hull(8, 100, 100, { type: "station", factionId: "faction_free" }));
  sendWitnessReports(s.state, incident, s.bus);
  s.state.entities.set(8, hull(8, 100, 100, { type: "station", factionId: "faction_free" }));
  s.state.tick = 100;
  deliverWitnessReports(s.state, s.bus);
  assert.equal(incident.visibility, "witnessed");
  assert.deepEqual(knownStuntTitles(s.state, s.state.entities.get(8)), []);
});
test("all sixteen mastery rules exist; Rock Tutor needs three lives in at least two incidents", () => {
  const s = scene(), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  const base = s.state.story.titles.stuntIncidents[0];
  assert.equal(STUNT_TITLE_RULES.length, 16);
  const first = { ...base, id: "rock:1", rootId: "rock:1", trickId: "rock_discovery", victimLives: [{ lifeId: "a" }, { lifeId: "b" }] };
  qualifyStuntTitles(s.state, first, s.bus);
  assert.equal(s.state.story.titles.byId.title_rock_discovery, void 0);
  qualifyStuntTitles(s.state, { ...first, id: "rock:2", rootId: "rock:2", victimLives: [{ lifeId: "c" }] }, s.bus);
  assert.equal(s.state.story.titles.byId.title_rock_discovery.title, "Rock Tutor");
});
test("title citations and delivered bark settlements survive JSON and visible ledger eviction", () => {
  const s = scene(), n = narration(s), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  advance(s, n.barks, n.arbiter, 90);
  s.state.story = JSON.parse(JSON.stringify(s.state.story));
  s.state.barkDirector = JSON.parse(JSON.stringify(s.state.barkDirector));
  s.state.story.titles.stuntIncidents = [];
  s.bus.emit("save:loaded", {});
  s.bus.emit("stunt:trickDetected", trick);
  assert.equal(s.state.story.titles.stuntIncidents.length, 0);
  assert.equal(s.state.story.titles.byId.title_bolas.citations[0].incidentId, trick.episodeId);
  assert.equal(s.state.barkDirector.stuntRecognition.pending.length, 0);
  assert.ok(JSON.stringify({ story: s.state.story, barks: s.state.barkDirector }).length < 512 * 1024);
  n.barks.destroy();
});
test("every title qualifies only its distinct incident mastery and qualified observation", () => {
  for (const rule of STUNT_TITLE_RULES) {
    const s = scene(), trick = evidence(s);
    s.bus.emit("stunt:trickDetected", trick);
    const base = s.state.story.titles.stuntIncidents[0];
    s.state.story.titles.byId = {};
    s.state.story.titles.stuntProgress = {};
    for (let i = 0; i < rule.count; i++) {
      const incident = { ...base, id: `${rule.trickId}:${i}`, rootId: `root:${rule.trickId}:${i}`, trickId: rule.trickId, encounterId: `encounter:${i % 2}`, threatEpisodeId: `threat:${i}`, bankCorridorId: `corridor:${i}`, escaped: true, materialCombat: true, victimLives: [{ lifeId: `victim:${i}` }], modifiers: { collateralCount: 3, razorRelease: "razor", closeShave: true }, witnesses: base.witnesses.map((w) => ({ ...w, terminalLives: ["a", "b", "c"] })) };
      qualifyStuntTitles(s.state, { ...incident, witnesses: [], visibility: "black-box" }, s.bus);
      assert.equal(s.state.story.titles.byId[rule.id], void 0, `${rule.title} needs observation`);
      qualifyStuntTitles(s.state, incident, s.bus);
      if (i < rule.count - 1) assert.equal(s.state.story.titles.byId[rule.id], void 0, `${rule.title} needs mastery`);
    }
    assert.equal(s.state.story.titles.byId[rule.id]?.title, rule.title);
  }
});
test("source/transfer observations cannot be backfilled from future payoff samples", () => {
  const s = scene(), trick = evidence(s);
  for (let i = 13; i < 25; i++) {
    s.state.tick = i;
    observeStuntWitnesses(s.state);
  }
  assert.deepEqual(sampledStuntWitnesses(s.state, trick), []);
});
test("saturated visible narrative retains title evidence with bounded detailed history", () => {
  const s = scene(), trick = evidence(s);
  s.bus.emit("stunt:trickDetected", trick);
  const base = s.state.story.titles.stuntIncidents[0];
  const large = { ...base, chain: Array.from({ length: 32 }, (_, i) => ({ ...trick.causeChain[i % trick.causeChain.length], detail: "actual observed impulse and trajectory ".repeat(3) })), witnesses: Array.from({ length: 8 }, (_, i) => ({ ...base.witnesses[0], id: i + 3, name: `Observer ${i}` })) };
  s.state.story.titles.stuntIncidents = Array.from({ length: 240 }, (_, i) => structuredClone({ ...large, id: `incident:${i}` }));
  s.state.tick = 500;
  boundStuntNarrative(s.state);
  assert.equal(s.state.story.titles.stuntIncidents.filter((i) => i.detailRetained !== false).length, 8);
  assert.ok(s.state.story.titles.byId.title_bolas.citations[0].evidence.chain.length > 0);
  const bytes = Buffer.byteLength(JSON.stringify(s.state.story.titles));
  assert.ok(bytes < 384 * 1024, `${bytes} narrative bytes`);
});
test("nonlethal Bolas, dead and player-owned observers cannot acquire Knotmaker", () => {
  for (const kind of ["nonlethal", "dead", "owned"]) {
    const s = scene(), trick = evidence(s);
    if (kind === "nonlethal") trick.consequence = { killed: false, hullDamage: 30, hullMax: 100, helmLossSeconds: 1 };
    if (kind === "dead") s.witness.alive = false;
    if (kind === "owned") s.witness.ownerId = 0;
    s.bus.emit("stunt:trickDetected", trick);
    assert.equal(s.state.story.titles.byId.title_bolas, void 0, kind);
  }
});
