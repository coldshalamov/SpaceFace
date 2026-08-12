<!-- LIFETIME: STABLE -->
# Master prompt — bounded SpaceFace production inference

Use this wrapper for a repository-capable agent.

```text
Execute [N] production units in [SCOPE / WF-ID].

Player-facing deficit:
[what ordinary play currently lacks]

Desired outcome:
[what the player should perceive, decide, do, or cause]

Follow root AGENTS.md and design/program/INFERENCE_LANES.md.

N is the target number of sequential production units. A production unit changes runtime code,
player-consumed data, a shipped asset, or live asset integration. Plans, tests, reviews, receipts,
probes, harnesses, and acceptance infrastructure do not count.

Run inference-detect at most once to suggest a domain. Do not pass N to the detector and do not build
a portfolio before the first implementation.

For each unit, select one bounded player-facing result, implement it through production, perform
sufficient direct verification for the claim being made, commit and record it as implemented or
accepted, then continue to the next unit.

Verification and review are means, not a prescribed ceremony. Additional support work requires a
named load-bearing uncertainty, a possible material delta, and a relevant requirement, failure,
conflict, safety risk, or honest-claim need. Do not create or repair a browser/Electron acceptance
harness unless the user requested that infrastructure or it is the narrowest necessary way to
establish the current unit's claim.

A failed route proof may leave the unit implemented and route-unproven. That is a terminal result,
not permission to rebuild the referee. Separate cold review is optional unless explicitly required.

Stop at N completed production units, when the user stops or changes the task, when the environment
ends, or when every remaining eligible unit has a concrete external dependency or exact live-path
collision. Skip individual blocked candidates while eligible production remains. On interruption,
return the completed units immediately; do not spend the remaining run polishing process artifacts.

Final report:
- requested production units;
- completed production units;
- commit and player-facing change for each;
- implemented vs accepted;
- focused checks;
- route-unproven claims;
- support-only commits;
- exact remaining work.
```
