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

For each unit:
1. read only the relevant workflow and live owner;
2. compare no more than three candidate ideas;
3. make a production mutation;
4. run the cheapest focused checks that can falsify it;
5. perform one evidence-bound self-review;
6. fix verified in-scope defects once;
7. commit and record the unit as implemented or accepted;
8. continue to the next unit.

The first commit must contain production paths. Never make two support-only commits in a row.
Do not create or repair a browser/Electron acceptance harness unless the user explicitly requested
that infrastructure or one bounded repair is the only way to establish the current unit's claim.

A failed route proof may leave the unit implemented and route-unproven. That is a terminal result,
not permission to rebuild the referee. Separate cold review is optional unless explicitly required.

Stop at N completed production units, the user's declared product outcome, a concrete external
dependency, an exact live-path collision, or an unchanged failure fingerprint. On interruption,
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
