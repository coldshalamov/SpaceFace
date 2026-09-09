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
- Browser and Electron are shells of the same game; they must share player saves and must not drift
  as separate copies.

## Verified workspace facts

- Root `review/README.md` is the durable residue of the 2026-08 thermonuclear review; long `review/` ledgers were deleted on purpose so they cannot mislead—treat “leads” as hints, not mandates (full text remains in git history).
- When code and docs disagree, check `git log` which side moved before changing either; agents often update code and leave prose behind, and “fixing to the doc” has regressed real fixes.
- Many `.test.mjs` files are unwired from `check:*`; do not blindly glob-enable them into CI—audit and wire high-value clusters only.
- Tractor module `magnetRange` is still unwired in mining (UI no longer advertises inert numbers); drill-fade still mutates ship physics from UI—both are verified deferred work, not free cleanups.
- Playable-flight `buildComposedShip` is gated off the combat thread; mid-fight authored upgrades settle to the visible procedural ship unless a prewarmed/prepared boundary exists. Do not reintroduce sync composition on the playable path.

## Maintenance

Add a line only when a lesson is verified against live code or confirmed owner feedback, and say
which. Re-verify a line before acting on it if it names code state; if live truth has moved, update
or delete the line in the same change (see `POLICY_MANIFEST.md`).
