# Foundry recovery: name the answer, not just the threat

Candidate based on `2475841538295f1d9a8b4fa49465a7de75d8bb8b`, November 12, 2026.
This is bounded polish to the existing rounds 11–13 scene, not a new encounter or
completion of the larger creative-direction mission.

## Creative decision and player purpose

The first exit offers safety. Staying introduces loss of control: a parasite
slows the ship, the Ghost forces relocation, then the Cutter and Glassback ask
for flank control and physical mass. The arena is an answer, not background.
The earned 1–13 run established progression but not deliberate discovery of these
late physical counters. Do not add damage nerfs, forced props or replacement
models on that evidence.

Source review found a narrower concrete presentation gap: the Leecher warns on
latch, but its successful scrape reads only as a generic collision kill. A broken
Glassback likewise has no specific confirmation. The candidate names those real
outcomes, then returns attention to flight:

- Rounds 11/12: **LEECHER SHED**, once per round, only after an accepted wall-scrape
  kill. A ram before latching or a gun kill is not shedding. Other parasites may
  remain, so the copy does not promise restored speed.
- Round 13: **SHELL BROKEN · LEAVE THE SHARDS**, once. A natural room impact can
  break a shell without earning player credit. The copy therefore names the
  changed hazard, not a successful throw or bonus.

No extra sound, hit-stop, shake, enemy, asset, payout or timer. Existing announce
presentation is reused. No new model brief is warranted.

## Reusable toolbox and actual owners

| Existing capability | Use here | Limit |
|---|---|---|
| [`swarmFoundryScore.js`](../../../../src/data/swarmFoundryScore.js) | Existing threat/answer sequence and protected foreground | No retiming or difficulty change |
| [`swarmBrood.js`](../../../../src/systems/swarmBrood.js), `stepLatched` | Emit factual counter receipt after accepted scrape | Kill attempts can be refused by marks/shields |
| Same owner, `kill` | Accepted Glassback death receipt | Never infer player custody from death alone |
| [`swarmJuice.js`](../../../../src/systems/swarmJuice.js) | Active ordinary Foundry gating, bounded words | One per verb/round; resets with run |
| [`swarmJuiceHud.js`](../../../../src/ui/swarmJuiceHud.js) | Existing arbitrary announce renderer, unchanged | Rendered readability still unreviewed |

## Evidence and limits

Focused initial batch: 17/17 passed; independent rerun 17/17 passed. Final extra
wrong-ruleset case brings the focused feedback file to 11/11; seven native cases
remain passed unchanged. Native scrape case contains six trajectories: stay,
scrape and pre-latch ram for both early and crowded 64-body terrain orders.
Only real scrape speaks; latch tick247, scrape310, +2 credits/+22 score, hull260.
Glassback gun/ram/held/cut and upper-bound mass trajectories preserve actual death
and payment semantics, including zero-credit natural impacts.

Broader regression: 90/94 passed. All four failures are the same existing
boss-card/bar/slam/audio expectation failures reproduced on the exact parent
(`swarm-juice.test.mjs`: parent33/37). They are not fixed or hidden here.

Round entry, kit and initial poses in the native tests are staged. Subsequent
keyboard/mouse input, flight-v3, Rapier, latch, scrape, shell contact and rewards
use production owners. This is not an earned 1–13 replay, mounted-UI playthrough,
visual review or audio review. No fresh pixels were produced. The known browser
executor limitation remains; no bypass, laptop or deployment was used.

## Open goals and next scene work

- **SF-WORLD-DIRECTION — active:** existing post-exit recovery arc retains its
  physical cause-and-effect identity. Next: earned round12 hull-loss intervals
  and round13 actual loose-mass eligibility, rather than another isolated tweak.
- **SF-SECTOR-COHERENCE — active:** Foundry's original surviving geometry remains
  the tool; no guaranteed replacement wall or stone. Next: rendered route/read.
- **SF-LIVING-WORLD — active:** shell's changed hazard gets a factual payoff;
  Adventure inhabitants, economy and mission consequences are not advanced here.
- **SF-GAME — active:** candidate source and staged native proofs reviewed;
  publication/integration/acceptance are separate. Visual comprehension,
  Save/Continue, earned late counter discovery, rounds14–20 remain open.
- **SF-ASSETBANK / SF-ASSET-QUALITY — review-only:** no model production or new
  asset request. Reused native surfaces and existing presentation.

Execution owner: dot creative direction. Next executable action: inspect the
already-earned round12/13 state to choose a substantial connected scene follow-on.
No user action is needed for this source candidate; full visual acceptance needs
an available authorized renderer. Existing schedules remain unchanged.
