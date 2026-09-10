<!-- LIFETIME: STABLE -->
# Fleet command structure

Written 2026-09-10 after a campaign that ran this structure implicitly and left nothing behind.
This is the tier model, the routing rule, and the escalation path. Evidence for every claim is in
`~/.claude/skills/delegate-llm-work/references/model-profiles.md`.

## The three tiers

| Tier | Who | Uses | Spend |
|---|---|---|---|
| **Authority** | the advisor, and GPT-6 Astra | Direction between waves; the design question a grunt cannot answer; the batched review of several returned leaves | **Sparingly.** Astra costs ~10.6k tokens to answer "reply ALIVE". Never per-leaf. |
| **Controller** | the orchestrating model | Writes packets, verifies every claim, commits by pathspec, owns `NOW.md` and the queue, does anything needing vision | Mid. Never does token-heavy investigation itself. |
| **Grunt** | cursor Grok 4.6 xhigh · GLM 5.3 / flash · opencode-go grok-4.6 · muse-spark 1.3 | All implementation, all measurement, all repo-wide auditing | **Most of the budget belongs here.** |

Reviews sit beside the tiers: a **subagent** reviews a returned leaf when the call needs taste; a
**grunt** reviews it when the call is mechanical. One data point says a Claude subagent review costs
~109k tokens — real money — so route the first pass to a grunt and spend a subagent only when the
grunt's verdict is ambiguous.

## When to escalate to Authority

Escalate — do not grind — when any of these is true:

- **Every knob is tuned and the bar still fails.** This is the highest-value Astra call there is. On
  2026-09-10 it took a measurement receipt that said "tuning is exhausted" and proved by arithmetic
  that the *model* was unsatisfiable: wave duration was a function of kill throughput, throughput
  varied 2.3x across seeds, so the band needed a quota >= 30 and <= 26 simultaneously. A grunt would
  have tuned forever.
- **Two failed repair cycles with the same causal model.** Record the falsified model first.
- **A decision that changes what the game is**, not how it is built.
- **Before committing to an approach, and before declaring done.** These are advisor calls.

Escalate *up* for judgement. Escalate *down* for work. The controller never does a grunt's reading.

## The routing rule that decides quality

**A grunt writes an honest receipt when the packet names the specific way THAT unit gets faked, and
pads when it does not.** Six dispatches with a quoted rejection line each found a real defect; the
one without it stamped `DONE` over an unmet clause and overwrote a prior agent's receipt.

So spend the packet budget on:

1. The exact quoted rejection line for this leaf.
2. A named gap worth more than the task ("no proof shows the PLAYER causing this — that half is
   worth more than a fourth hazard" produced exactly that scenario).
3. "An unmet clause means NOT DONE."
4. "Append to an existing receipt. Never rewrite it."
5. "Scratch files stay inside the repo. Never `/tmp`."
6. The known-red table, so nobody burns an hour on a foreign failure.

## The controller's non-negotiables

- **Never trust a receipt's headline.** One reported 13.15x; re-running its own test at integration
  gave 2.537x. The worker was honest and the headline was still wrong. One re-run is the cheapest
  correction in the loop.
- **Verify an authority's incidental claims.** Astra asserted a live HP-scaling route without tracing
  it. Put "verify this before acting on it" into the implementation packet — the claim held that
  time, but the habit is the protection.
- **Judge a lane by file mtimes, not log size.** One log grew for six hours after the lane stopped
  writing code. Another produced nothing for two hours and then delivered the campaign's best
  artifact. Silence is not death and volume is not progress.
- **Never run a whole-game check while lanes are mid-write.** `check:playable` reported GAME IS
  BROKEN twice; the cause was a missing comma in a file a lane was saving at that instant.
- **Liveness before deference.** Five checkpoints claimed tasks that were stale 12–64 hours with
  untouched files. Every one was a ghost.

## Model routing, current

| Task shape | First | Second | Never |
|---|---|---|---|
| Bounded physics/feel change, named files | cursor Grok 4.6 xhigh | opencode-go/grok-4.6 | its own reviewer |
| Data tables, perception, colour, sim listeners | GLM 5.3 / flash | Grok | GLM on anything visual it must judge itself |
| Repo-wide mechanical audit | GLM 5.3 (budget 2.5 h; forbid subagent fan-out) | — | any model that must fan out |
| The stuck-plan question | **Astra** | the advisor | a grunt |
| Batched multi-leaf review | Astra | a subagent | per-leaf anything |
| Adversarial review of one returned diff | a grunt first | a subagent as tiebreaker | the implementer's own model |
| Anything needing eyes on a picture | **the controller** | — | every grunt in this fleet |

The last row is why the controller stays in the loop: on 2026-09-10 two of the highest-priority
ready units in the whole queue were blocked purely because no grunt in the fleet has verified vision.

## Quota is a first-class constraint

Probe every route with a ten-second `Reply with exactly: ALIVE` at session start and write the result
down with the date. Routes die on weekly and rolling windows, not just on balance. When a route dies
mid-campaign, its packet is still valid — leave it on disk named and re-dispatch it verbatim later
rather than re-planning the work.
