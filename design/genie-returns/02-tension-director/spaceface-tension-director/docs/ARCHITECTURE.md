# Architecture and tuning

## The design problem

A combat scheduler answers “which eligible thing may fire?” This component answers a different
question: “given what the player just experienced, should the next eligible thing add load,
offer a different activity, or leave room to recover?” Keeping those responsibilities separate
prevents a dramatic preference from becoming a permission to cheat the simulation.

The controller has three layers: measurement, an authored arc with feedback, and bounded intent.
It is not a black-box optimizer and does not learn hidden difficulty penalties. Its internal
state and every phase transition are inspectable.

## Measurement

Player-attributed damage, outcomes, mining, tethers, exploration, transactions and receipts feed
180 ten-second bins. Each of seven action channels saturates at one occupied bin per ten seconds:
repeatedly pressing the same key cannot inflate activity diversity. Incoming damage saturates at
four maximum-protection pools per bin; offer/delivery/resolution counts saturate at 32 per bin.
Window edges are approximate by less than ten seconds. Immediate hull and burst guards do not
wait for those window boundaries.

The measurement separates:

1. **Offer:** a telegraph was published.
2. **Materialization:** the ordinary owner reported at least one spawned entity.
3. **Engagement:** a combat roster is nearby in XZ, or the player exchanged real damage recently.
4. **Resolution:** the ordinary owner published an outcome.

A timer can authorize a build-up. It cannot manufacture evidence for steps 2–4. All four can be
inspected independently. This distinction is important because an empty content schedule and
a relaxed player can look similar in an event histogram while requiring different engineering.

Observed pressure uses recent incoming loss, current protection, engagement and nearby encounter
count. Fatigue integrates sustained load and decays during active low-pressure time. These are
control heuristics, not calibrated psychometric estimates. Five-minute action entropy and dominant
activity share select among three authored motifs; they do not prove that the player had choices.

## State machine

| Phase | Policy intention | Normal exit |
| --- | --- | --- |
| Quiet | Suppress new campaign combat; allow civilian life | Authored breathing interval completed |
| Opportunity | Admit an eligible opportunity, with major combat reserved | Actual engagement, or commitment window |
| Build | Permit bounded combat accumulation and context-biased selection | Actual engagement; otherwise diagnose a missed build |
| Peak | Recognize observed conflict; spend a bounded commitment budget | Contact release, resolution, or commitment budget spent |
| Aftermath | Suppress additional campaign combat and permit consequences/collection | Authored release completed |
| Recovery | Protect a distressed player from new director-controlled combat | Minimum 90 active seconds AND recovery conditions |

Actual ongoing combat can persist while the requested phase is quiet or aftermath. These labels
are **control intentions**, not assertions that the world obeyed. Existing squads are neither
removed nor made harmless. The separate observed-pressure line must remain visible in analysis.

An empty build returns to opportunity. After two missed builds, it releases to aftermath and
selects a fresh arc instead of marching through a fictional peak. A critical hull or large loss
overrides ordinary dwell and enters recovery on the next decision. Recovery never times out into
new danger simply because the player has not repaired: its duration is intentionally unbounded,
although state storage and computational work remain bounded.

### Authored motifs and chapters

| Motif | Quiet | Opportunity | Build | Peak budget | Aftermath |
| --- | ---: | ---: | ---: | ---: | ---: |
| Voyage | 65 s | 115 s | 105 s | 60 s | 85 s |
| Discovery | 85 s | 155 s | 85 s | 45 s | 100 s |
| Hunt | 50 s | 85 s | 125 s | 75 s | 90 s |

Motif choice is a deterministic score of activity dominance, recent verbs, confidence and fatigue,
with a penalty for recent motifs and explicit tie-breaking order. Discovery defers major combat.
There are three ten-minute acts in each 1,800-active-second chapter. Later acts extend build/release
budgets and modestly adjust requested targets; they do not scale enemy statistics. Confidence rises
only with player-attributed successful outcomes and falls after defeat. A passive ten-hour save
therefore does not accumulate automatic power or a hidden “you have played long enough” punishment.

## Controller and authority limits

Requested pressure approaches its target by at most +0.018 or −0.05 per decision. Target caps are
0.58 casual, 0.70 standard and 0.78 veteran/ironman. These are dimensionless control targets, not
incoming/outgoing damage multipliers.

Combat pressure accrual is bounded to 0.15–1.25 times the existing rate. Civilian accrual is
bounded by the consumer to 0.65–1.30. Long recovery can still fill a pressure pool; the original
rolling quota, live cap and spacing gates prevent draining it as a burst. The policy adds a
40–60 second normal meaningful-encounter gap, with the read port defensively clamped to 30–90.
No existing gap or budget is weakened.

Candidate ordering adds at most ±20 seconds of contextual bias to the authored due time. The
preferred deck and recent shape repetition influence this small score. Older work wins when
its age advantage exceeds the maximum score difference. Input index breaks exact ties. The
controller never invents a candidate, bypasses its gates, or calls an encounter script directly.

A policy lease lasts three simulation seconds. Invalid/expired policies are ignored, restoring
neutral accrual and the existing consumer rhythm. This isolates the scheduler from a missing,
disabled or broken controller. It is graceful degradation, not a guarantee that old-world combat
will stop when the controller itself fails.

## Time semantics and lifecycle

All gameplay time comes from `state.simTime`. Decisions run at most once per simulation second;
the initial observation does not accrue an active second. Extra 60 Hz calls do not increase cadence.
Large time jumps make one protected decision rather than replaying dozens of encounter beats.
A rewind requires a compatible restore or an explicit protected reset. Pause/dock/tutorial/survival
states freeze the active arc clock; event windows still use simulation timestamps. Reentry buys
20 active seconds without new campaign combat. Even between scheduled decisions, a fractional-tick
resume installs a temporary protective lease; it cannot fall through to the legacy spawn gate.

No random draw is needed. This preserves the host's RNG sequence, rather than merely claiming
that a separate RNG happened to be seeded. Exact determinism assumes the same ordered facts,
sensor observations, clock sequence and owner snapshot in the same numerical environment; it is
not a cross-engine IEEE-754 or whole-game determinism certification.

## Storage and work budget

| Structure | Hard capacity |
| --- | ---: |
| History | 180 bins × 12 channels |
| Diagnostic ring | 192 records |
| Semantic deduplication | 64 identities |
| Recent shapes | 8 |
| Recent motifs | 3 |
| Sensor live-roster scan | 16 encounters |
| Sensor entity lookups | Up to 16 IDs per scanned combat roster |
| Pending-supply scan | 64 candidates |

The new sensor never iterates the world's entire entity map. Truncated scans set a diagnostic and
close new combat admission conservatively. The *existing* campaign pump still scans its pending
items; the patch adds bounded work per candidate, not a promise that the original whole scheduler
is constant-time. History reduction is fixed-size at 1 Hz. The fixture's largest sampled serialized
owner snapshot is reported in `TEST-REPORT.md`; it is not a heap-allocation or low-end-PC frame-time
measurement. All diagnostic/counter values should be checked under the actual profiler before
claiming a production performance budget.

## Deliberate exclusions

No new encounter catalog, dynamic rescheduler, inventory reward, economy rewrite, AI damage
adaptation, police immunity, renderer feature, music layer, on-screen HUD, story-memory database,
or guaranteed release from existing combat is added. There is no new dependency. The existing
`difficultyDirector` retains its damage/pin-release authority; the new owner merely honors its
published recovery stance.

## Tuning order

First establish that eligible supply actually reaches the player and the new owner is in both
runtime manifests. Then tune recovery false positives, phase dwell, and novelty preference.
Only afterward adjust pressure rates. Raising pressure gain to compensate for an exhausted catalog
is a feedback controller shouting at an unplugged loudspeaker.

Change one family of constants at a time, retain the same seeds/input tapes, and compare requested
versus delivered pressure, meaningful choices, unintended harm, economic loops and long quiet gaps.
Do not optimize for sinusoidal plots, phase-transition counts, or maximum event density. A plot
can look alive while the player is still bored.
