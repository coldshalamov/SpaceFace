import { test } from "node:test";
import assert from "node:assert/strict";
import { createTitlesSystem } from "../src/systems/titles.js";
import { STUNT_BARKS, stuntRecognitionBarkFor } from "../src/systems/barkDirector.js";
function fixture() {
  const handlers = /* @__PURE__ */ new Map();
  const bus = { on(k, f) {
    handlers.set(k, f);
  }, off(k) {
    handlers.delete(k);
  }, emit(k, p) {
    handlers.get(k)?.(p);
  } };
  const state = { mode: "flight", tick: 60, playerId: 0, entities: /* @__PURE__ */ new Map(), story: { titles: { byId: {} }, titlesSeen: [] } };
  const titles = createTitlesSystem();
  titles.init({ state, bus });
  return { state, bus, titles };
}
test("legacy final receipt and synthetic witnesses cannot create incidents or title", () => {
  const s = fixture();
  s.bus.emit("stunt:trickDetected", { trickId: "bolas", actorId: 0, tick: 60, episodeId: "invented", rootId: "invented", consequence: { killed: true }, causeChain: [{ kind: "impulse" }], witnesses: [{ id: 3, sourceTicks: 60, transferTicks: 60, payoffTicks: 60, provenance: "live-physical-samples" }] });
  assert.equal(s.state.story.titles.stuntIncidents, void 0);
  assert.equal(s.state.story.titles.byId.title_bolas, void 0);
  s.titles.destroy();
});
test("Survival and NPC receipts cannot create Adventure recognition", () => {
  for (const run of [{ kind: "survival", phase: "active" }, null]) {
    const s = fixture();
    s.state.run = run;
    s.bus.emit("stunt:trickDetected", { trickId: "bolas", actorId: run ? 0 : 7, consequence: { killed: true }, causeChain: [{}] });
    assert.equal(s.state.story.titles.stuntIncidents, void 0);
    s.titles.destroy();
  }
});
test("legacy bark catalog remains deterministic and covers every faction", () => {
  assert.equal(Object.keys(STUNT_BARKS).length, 8);
  for (const [faction, lines] of Object.entries(STUNT_BARKS)) {
    assert.equal(new Set(lines).size, 4);
    for (let i = 0; i < 4; i++) {
      const text = stuntRecognitionBarkFor(faction, i, { title: "Knotmaker" });
      assert.ok(text.includes("Knotmaker"));
      assert.equal(text, stuntRecognitionBarkFor(faction, i, { title: "Knotmaker" }));
    }
  }
});
