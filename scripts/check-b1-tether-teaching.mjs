#!/usr/bin/env node
// check-b1-tether-teaching.mjs — B1 massline control truth + production reel event path.
//
// Proves:
//   1. B1 entry copy does not teach G (combat computer / auto-fire).
//   2. Cut follow-up listens for production tether:reel (never dead tether:reelMax).
//   3. Follow-up fires once when tether:reel payload.after <= TETHER_REEL_MAX_WU (60).
//   4. Loose reel ticks (after > 60) do not teach cut.
//   5. B1 DONE still resolves on tether:released.
//
// Drives the real onboarding system over the event bus — no synthetic reelMax event.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBus } from "../src/core/eventBus.js";
import { onboarding } from "../src/systems/onboarding.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, "src/systems/onboarding.js"), "utf8");
const attachmentSrc = readFileSync(join(ROOT, "src/combat/attachments.js"), "utf8");

let sections = 0;
function ok(label) {
  sections++;
  console.log("  PASS " + label);
}

assert.doesNotMatch(src, /Latch it\. G\./, "B1 must not teach Latch it. G. (G is combat computer)");
assert.doesNotMatch(src, /tether:reelMax/, "B1 must not listen for dead tether:reelMax");
assert.match(src, /line:\s*'Latch it\. Massline\.'/, "B1 entry uses neutral massline verb (control prompt authority)");
assert.match(src, /on:\s*'tether:reel'/, "B1 cut follow-up is gated on production tether:reel");
assert.match(src, /bus\.on\('tether:reel'/, "onboarding must subscribe to tether:reel");
assert.match(src, /_onTetherReel/, "onboarding must gate reel follow-up via _onTetherReel");
assert.match(src, /TETHER_REEL_MAX_WU\s*=\s*60/, "tight-reel threshold stays at 60 wu");
assert.match(attachmentSrc, /bus\.emit\('tether:reel'/, "attachments.reel is the production tether:reel emitter");
assert.doesNotMatch(attachmentSrc, /tether:reelMax/, "attachments must not emit tether:reelMax");
ok("static B1 control + event contract");

function makeHarness() {
  const bus = createBus();
  const toasts = [];
  const state = {
    meta: { seed: 47 },
    simTime: 100,
    settings: { gameplay: { tutorialHints: true } },
    player: { hints: {} },
    playerId: "player",
    entities: new Map(),
    entityList: [],
    world: { activeSector: { stations: [], gates: [] } },
    nav: {},
    story: { beatIndex: 0 },
    onboarding: {
      active: true,
      finished: false,
      currentBeat: 1,
      beatDoneAt: {},
      firedFollowups: {},
      oreCollected: 0,
      pirateFled: false,
      tutorialLog: [],
    },
  };
  bus.on("toast", (p) => toasts.push(p));
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers: {}, registry: null });
  return { sys, state, bus, toasts };
}

function tutorialTexts(h) {
  const log = (h.state.onboarding && h.state.onboarding.tutorialLog) || [];
  return log.map((e) => e.text);
}

const h = makeHarness();
h.state.simTime = 110;
h.bus.emit("tether:reel", {
  actorId: "player",
  targetId: "wreck",
  attachmentId: "att1",
  before: 120,
  after: 90,
});
assert.equal(h.state.onboarding.firedFollowups["derelict:tether:reel"], undefined, "after=90 > 60 must not fire the cut follow-up");
assert.ok(!tutorialTexts(h).some((t) => /Cut and coast/i.test(t)), "loose reel must not emit Cut and coast");

h.state.simTime = 120;
h.bus.emit("tether:reel", {
  actorId: "player",
  targetId: "wreck",
  attachmentId: "att1",
  before: 72,
  after: 58,
});
assert.equal(h.state.onboarding.firedFollowups["derelict:tether:reel"], true, "after=58 <= 60 must fire the cut follow-up once");
assert.ok(tutorialTexts(h).some((t) => t === "Cut and coast. Tap tether to cut."), "tight reel must say the cut follow-up line");
assert.equal(tutorialTexts(h).filter((t) => /Cut and coast/i.test(t)).length, 1, "cut follow-up must fire exactly once");

h.state.simTime = 125;
h.bus.emit("tether:reel", {
  actorId: "player",
  targetId: "wreck",
  attachmentId: "att1",
  before: 58,
  after: 40,
});
assert.equal(tutorialTexts(h).filter((t) => /Cut and coast/i.test(t)).length, 1, "repeat tight reel must not re-fire cut follow-up");
ok("tether:reel tight/loose gate + once-only");

const h2 = makeHarness();
h2.state.simTime = 105;
h2.bus.emit("tether:latched", { targetId: "wreck" });
assert.equal(h2.state.onboarding.firedFollowups["derelict:tether:latched"], true, "tether:latched must fire the winch follow-up");
assert.ok(tutorialTexts(h2).some((t) => t === "Winch in. Hold tether to reel."), "latch follow-up line must match authored BEATS table");
h2.state.simTime = 140;
h2.bus.emit("tether:released", { targetId: "wreck" });
assert.ok(h2.state.onboarding.beatDoneAt.derelict != null, "B1 DONE must still resolve on tether:released");
ok("latch follow-up + release DONE preserved");

const h3 = makeHarness();
h3.state.simTime = 130;
h3.bus.emit("tether:reel", {
  actorId: "player", targetId: "wreck", attachmentId: "att1",
  before: 80, after: 60,
});
assert.equal(h3.state.onboarding.firedFollowups["derelict:tether:reel"], true, "after=60 must count as tight (<= TETHER_REEL_MAX_WU)");
ok("boundary after=60 is tight");

const h4 = makeHarness();
h4.bus.emit("tether:reel", { before: 100 });
h4.bus.emit("tether:reel", { after: NaN });
assert.equal(h4.state.onboarding.firedFollowups["derelict:tether:reel"], undefined, "missing/NaN after must not fire cut follow-up");
ok("invalid reel payload is a no-op");

console.log("[check-b1-tether-teaching] PASS — " + sections + " sections green");
