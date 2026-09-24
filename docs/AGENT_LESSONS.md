<!-- LIFETIME: STABLE -->
# Agent lessons — owner preferences and verified workspace facts

Moved verbatim from root `AGENTS.md` so the front door stays small. These are hard-won corrections
from real failures, not style preferences. Read before proposing behavior changes, judging code
quality, planning graphics/VFX work, or declaring a bug fixed. Root `AGENTS.md` routes here.

## Owner preferences

- Does not read or judge agent-created code; wants plain-language triage, verified options, and a clear safe set—not code dumps, check names, or requests to weigh technical risk.
- Skeptical of agent-labeled “bugs”; verify against live code and git history before changing behavior, and prefer obvious/safe honesty fixes first—misattributed fixes have made things worse.
- When handed a large agent review, wants what is safe to do now; leaves safe-vs-risky judgment to the agent once that bar is clear.
- Does not want stale agent ledgers left in the repo, and does not want valuable unverified findings deleted blind—distill durable disposition (done / rejected / verified-open / leads) then remove the pile.
- Treat hitching as structural: reject quality cuts, triangle-count trims, and ~2% easy-road opts as the performance plan; major refactors are discussable. Prefer cheap Node count gates over repeated headed browser soaks.
- Dynamic graphics: Hitch, default quality, and the chase-frame ship stay full. A stranger must not see a blank lock, a box or floating engine, then a different ship. If a stranger can tell detail was dropped, too much was dropped. “Shave a little” means hide a fastener at a few dozen pixels (`hlod.js` garnish tags), never a cheaper species of hull, an impostor, or a modular stand-in while the real body loads. Empty-admission substrate plus a packaged complete body is the path; do not unhide junk to beat a pop-in. Process: [`design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md`](../design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md). Owner confirmation 2026-09-09.
- When a plan is authorized, drive it through without stop-and-go “continue?” pauses.
- Never stop halfway through a job. The owner cannot finish leftover technical work; a half-done
  commit with “revise / gates open / source candidate” leaves the game broken forever. “Do this one
  job and stop” means finish that job, then do not start another — not ship a half-built version.
- For graphics and VFX, do not hype work as A-list; place each technique honestly against modern
  games (name it, when it was current, what it would take to go further). Do not treat the existing
  implementation primitive as the design and silently fatten or tweak it—ground the effect in how
  the real thing behaves, present the real option space before implementing, then implement that
  technique rather than a cheap stand-in (solid cones, spark sprays, billboard smoke, blurry
  squares, transparency ramps, CSS glows, or a still image stretched and bolted to the ship) that
  only technically satisfies the brief. Never satisfy a player-facing visual brief with a
  camera-facing soft square or disc except distant background stars. If the player can fly past it,
  it is not a star.
- When the player reports a freeze or other play-blocking bug, find the actual cause on the real
  play path and verify that freeze is gone before claiming it fixed; do not paper it over with
  catch-and-continue or scatter unrelated nearby changes.
- Captures are not the review method (owner, 2026-09-16). Headed stills, frame strips, capture
  matrices, and Chromium soaks slowed production to a crawl. Default proof is reading the live
  owner and printing a number from a fixed-seed scenario or a focused test. A still is allowed
  only when the claim is purely visual and no structural check can falsify it; look in-session
  and delete it. Timed-out Chromium, a missing GPU, or a capture-harness failure never blocks
  `implemented`. Packet prose that says “scenario + capture” means the scenario. Art remaster
  KEEP/REVISE is the exception: that claim *is* the picture.
- INFERENCE is considered play, not the first row that compiles (owner, 2026-09-16). Bare
  `INFERENCE` (no spec) means look at the game, find what is weak or ill-built, complete
  that, then rotate to a different kind of weakness you also saw. `inference-detect.mjs`
  is an optional count hint, not the assignment — scripts cannot see architectural
  mistakes. Named scopes still think and build the whole playable thing (a mission
  includes placement, script, people, and density). Three thin board entries is a
  failed run. Law: `design/program/INFERENCE_LANES.md`. Prompt:
  `design/program/INFERENCE_GOAL.txt`. Captures remain not the review.
- Browser and Electron are shells of the same game; they must share player saves and must not drift
  as separate copies.
- The outside resources for this game are a named list, not a search (owner, 2026-09-22).
  CAS, Elementary Audio, a few Sonniss recordings, Kenney only to fill a missing cue, and the
  named CC0 material and lighting sources. `meshoptimizer` is already here and is how a far hull
  stays the same ship. Unreal Engine code is not a source we can paste in. The list and the
  refusals: [`OPEN_SOURCE_INTAKE.md`](./OPEN_SOURCE_INTAKE.md) §0. A grunt catalog line stays
  inside the files it names.

## Verified workspace facts

- Root `review/README.md` is the durable residue of the 2026-08 thermonuclear review; long `review/` ledgers were deleted on purpose so they cannot mislead—treat “leads” as hints, not mandates (full text remains in git history).
- When code and docs disagree, check `git log` which side moved before changing either; agents often update code and leave prose behind, and “fixing to the doc” has regressed real fixes.
- Many `.test.mjs` files are unwired from `check:*`; do not blindly glob-enable them into CI—audit and wire high-value clusters only.
- Tractor module `magnetRange` is still unwired in mining (UI no longer advertises inert numbers); drill-fade still mutates ship physics from UI—both are verified deferred work, not free cleanups.
- Playable-flight `buildComposedShip` is gated off the combat thread; mid-fight authored upgrades settle to the visible procedural ship unless a prewarmed/prepared boundary exists. Do not reintroduce sync composition on the playable path.
- Live play mounts a zero-draw admission substrate (`directAuthoredMount`) and publishes only `PACKAGED_LIVE_WHOLE_SHIP_FILES`. Zoom-out does not swap whole-ship GLBs today: Hitch LOD1/2 are packaged but the player is forced LOD0; Wasp/factory LOD siblings are not on that allowlist. Station/place HLOD hides tagged flourishes only and forbids a silhouette proxy. A ship that is not closing (closing speed ≤ 1) can skip authored prefetch and pop late — that is a runway race, not a reason to show a box. Verified 2026-09-09 against `visualOverrides.js`, `partsLibrary.js`, `hlod.js`, `authoredAdmissionPolicy.js`.

## Maintenance

Add a line only when a lesson is verified against live code or confirmed owner feedback, and say
which. Re-verify a line before acting on it if it names code state; if live truth has moved, update
or delete the line in the same change (see `POLICY_MANIFEST.md`).
