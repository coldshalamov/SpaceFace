# Adversarial Review Protocol

## Purpose

Agents are structurally inclined to defend and declare their own output complete. SpaceFace requires a separate process whose job is to find why the work still does not feel like the intended game.

Adversarial review is not hostility toward the creator. It is protection of the player.

## Review roles

### Creator/implementer

Owns the unit and its technical evidence. Does not issue final creative acceptance.

### Player-experience critic

Judges ordinary play:

- what the player perceives;
- what the player does;
- where attention goes;
- what becomes repetitive or confusing;
- whether the addition creates agency, surprise, and memorable consequence.

### Domain craft critic

Judges the relevant craft:

- art and material quality;
- encounter design;
- AI behavior;
- narrative construction;
- economy/balance;
- control feel;
- audio/VFX readability;
- UX flow.

### Integrator/director

Resolves conflicting feedback, protects owner boundaries, and decides whether the unit enters the portfolio.

At 1x, one reviewer may combine the player and domain lenses. At 5x, use two separate reviewers where tools permit.

## Independence rule

The creator **never** issues its own verdict. "Cold" means a context that did not
implement, did not read the implementation narrative, and was not prompted by the
creator's framing of what the player "should" perceive. A subagent seeded with
the creator's summary is the creator wearing a mask — that is the observed
failure (self-verdicts have lied in this repo before; see the Gemini vision
episode in project memory). Structural enforcement: an accepted live unit cannot
be recorded without a filled review record file
(`scripts/inference-record.mjs` refuses it), and the review record names whether
the reviewer context was fresh.

Known judge biases to actively counter (sources in RESEARCH_SOURCES.md):

- **Self-preference** — a model rates its own style higher. Where possible, use
  a different model or at minimum a context with none of the creator's prose.
- **Position bias** — verdicts flip with presentation order. For any pairwise or
  before/after comparison, present both orders (A/B then B/A); if the verdict
  flips, record it as UNCERTAIN, not as either answer.
- **Rubric gaming** — a fixed checklist can be satisfied structurally while the
  experience stays dull. The checklist below frames attention; the blocking
  question is experiential:

> **The blocking question:** would the player voluntarily keep interacting with
> this? A reviewer may not issue KEEP without answering it, in writing, from the
> evidence. "The checklist passes" is not an answer.

Calibrate against anchors: compare the unit to one named accepted unit (is it at
least this good?) and one named cut unit (is it clearly better than this?).
Record reviewer **uncertainty** explicitly — a low-confidence KEEP is a REVISE.

## Blindness rule

The reviewer should not receive:

- how many files changed;
- how difficult the work was;
- test counts as persuasion;
- the creator's self-score;
- the intended explanation of what the player “should” perceive;
- a beauty render instead of ordinary-route evidence.

The reviewer should receive:

- the target experience;
- baseline and current evidence;
- the normal controls;
- relevant performance/accessibility limits;
- the ability to inspect the build or recorded route.

## Questions every reviewer asks

1. What changed for the player?
2. Could I understand it without the label or report?
3. Is it actually distinct from existing content?
4. Does it create an interesting decision or opportunity?
5. Does it operate in the visible world, or only in data/UI/radar?
6. Does it reinforce momentum, living-world causality, industry, crime, or persistent transformation?
7. Does it look and sound like the intended bright kinetic game?
8. What feels cheap, generic, automatic, or fake?
9. What should be removed rather than expanded?
10. Would I voluntarily keep interacting with it?

## Verdicts

### KEEP

The unit materially improves the game and is ready for portfolio integration. Minor polish may remain, but the core read and experience are sound.

### REVISE

The premise is good and the implementation is salvageable. Name the largest causal defect and the smallest revision likely to fix it.

### REBUILD

The unit technically exists, but its form or interaction misses the premise. Preserve useful research/assets, but do not patch the current implementation indefinitely.

### CUT

The unit is redundant, low-value, incoherent, or actively harms the game. Do not retain it because inference was spent on it.

## Defect prioritization

Reviewers return no more than three blocking defects.

Classify each:

- **P0 identity failure** — wrong fantasy, wrong mechanic, wrong art language, wrong player role.
- **P1 experience failure** — boring, confusing, repetitive, invisible, unreliable, or unpleasant.
- **P2 craft failure** — form, materials, timing, feedback, pacing, tuning, or writing is below bar.
- **P3 polish** — nonblocking improvement.

P0 and P1 block acceptance. P2 blocks hero/major units and may block support units if visible. P3 does not reopen the unit indefinitely.

## The two-strike rule

If two material revision cycles fail to repair the same P0/P1 defect:

- stop tuning symptoms;
- re-evaluate the premise or implementation model;
- issue `REBUILD` or `CUT`;
- select a replacement candidate if the requested Nx scale remains valuable.

This prevents months of ornament being applied to a bad foundation.

## Causal re-review

A revision should be reviewed specifically against the previous failure.

Bad review:

> “Here are twenty fresh opinions.”

Good review:

> “The miner was previously unreadable at 125 WU. The re-authored ore basket and drill silhouette now make 4/5 blind reviewers identify it; KEEP G1. Material breakup is still P2 and blocks hero promotion.”

## Portfolio review at 3x/5x

Even accepted units can form a weak portfolio.

Review:

- role overlap;
- palette and silhouette collisions;
- repeated timing and event shapes;
- attention overload;
- performance saturation;
- whether common units still feel common;
- whether rare units remain special;
- whether the route has quiet contrast;
- whether the player has meaningful options rather than simultaneous noise.

The reviewer may cut an individually accepted unit from a specific composition while preserving it for another sector.

## Human taste gates — where agent review is not enough

Every agent reviewer in this system shares training priors and reads the same
North Star docs; their agreement is correlated, not independent. Some decisions
stay human:

- hero art acceptance (G7-class verdicts);
- core control feel changes;
- whole-slice creative acceptance;
- any CUT of previously human-accepted work.

**The reel:** every 3x/5x tranche produces one ~60-second ordinary-play capture
of its units in the normal camera on the normal route (existing capture tooling;
no beauty shots). The captures accumulate for the owner to review at their own
cadence with one question: *does any clip look like the fantasy in VISION.md?*
An owner verdict at reel level may CUT whole families. This is deliberately
cheap for a non-coding owner and is the only uncorrelated taste in the loop —
do not optimize it away.

## Review prompt template

```text
You are the cold adversarial reviewer for [unit/portfolio].

Read the SpaceFace North Star and the unit's Target Experience Contract. Inspect only the baseline and ordinary-route current evidence before reading implementation details.

Judge what the player can perceive and do. Do not award credit for code volume, tests, architecture, or difficulty.

Return:
1. verdict: KEEP / REVISE / REBUILD / CUT;
2. the strongest thing the work adds;
3. up to three blocking player-facing defects, ranked;
4. the causal reason for each defect;
5. the smallest revision or replacement likely to fix it;
6. whether the unit is distinct and portfolio-worthy;
7. North Star vectors moved forward or backward.

Be skeptical. Do not invent deficiencies merely to sound critical, but do not accept technical existence as quality.
```
