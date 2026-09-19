# Local evaluation: distinguish a better instrument from a nicer story

## What the packet already establishes

The supplied September actual-game ledger reports thousands of attach/cut cycles with sharply
seed-dependent payoff. It also reports empty late-game encounters. Therefore a ten-hour kill
count alone cannot isolate Massline quality: target availability and pilot strategy confound it.
The existing Crucible harness explicitly rejects fake runtimes and fabricated contacts. Keep
that rule. This packet's reduced fixture is a component instrument, not an exception to it.

## Gate A — preserve contracts first

Run the supplied component tests and the repository's real baseline/input/attachment/weapon/
specialized-head/drill suites. Confirm accepted/rejected operations, current collision telemetry,
no new body-state writer, feature flags, UI lifecycle, save restoration, sector boundaries and
fixed-tape determinism. Review the intentional old expectation changes listed in integration notes.

Stop for a swallowed cut, a double release receipt, moving a destination while a shot is queued,
positive cut-added impulse, falsely green stale field prediction, or altered unrelated gunnery.
No score can buy its way past these invariants.

## Gate B — production mechanics matrix

Use the same actual runtime, loadout, RNG seeds and targets for old/new variants. Save both run
hashes, input tape, canonical contacts, attachment events, release cues and damage receipts.
Include ordinary standard line and Elastic Whip, with light/equal/heavy endpoints, static/coasting/
turning victims, translating center of mass, and slack/radial/near-taut starts. Include active fields,
a spool endpoint, a denied reel/cut, a lost target and a reset during a pending snap.

Seeds 4242 and 8008 preserve comparability with the packet; reserve additional seeds before tuning.
Do not optimize to the two familiar seeds and relabel them a general result.

Compare physical exit speed, radial speed, angular rate, observed radius, work already charged by
the authoritative owner, actual collision impulse/damage, and true hit/miss by released payload id.
Record false green and false negative cues against actual geometry separately from a moving target
choosing to maneuver *after* a correct constant-velocity forecast.

**Never credit a kill scheduled by the harness. Never integrate a stand-in body instead of SG-02.**

## Gate C — measure a pilot who can see the instrument

Retain the old timeout pilot as a negative control. Add one modest cue-using pilot that sees only
the same public facts as a human: current line phase, winch direction, pair motion, and visible
release cue/window. It must not inspect future seeded trajectories, hidden AI decisions, the
physics oracle or the eventual contact log. Use the same pilot policy across variants, with each
variant's own instrument. Record the policy, not only its score.

Separate these questions:

| Question | Measurement |
|---|---|
| Does the input obey? | Neutral travel, hold-release cuts, rejected-command phantom work |
| Does the instrument tell the truth? | Current cue confusion matrix under declared assumptions |
| Can timing be learned? | Within-subject manual timing-error reduction across repeated attempts |
| Is skill worth anything? | Actual useful impacts per deliberate release, with matched opportunities |
| Is the risk intentional? | Recovery success, damage taken while drawing, deliberate aborts |
| Is it expressive? | Different viable radius/speed/mass-ratio solutions, not one timer macro |

A cue-using policy beating a timeout policy does not by itself prove the new response curve is
better. Run ablations: new grammar only; new contact cue only; new motor only; complete Cadence.
This prevents crediting a motor gain for a perception fix, or vice versa.

## Gate D — human learning, not synthetic declarations of fun

Counterbalance variant order and hide names such as “improved.” Give each participant the same
brief controls explanation and practice allowance. A practical first pilot study is 8–12 people
with approximately 20 scored throws per condition; this is an exploratory study, not a powered
population claim. Match target opportunities and retain misses/aborts rather than censoring them.

Ask before revealing a result: “Where do you expect this mass to go?” Then compare intention,
release timing and actual trajectory. The central acceptance is perceptual causality: a player
should increasingly predict and intentionally choose their outcome. Also ask whether recovery
feels controllable and whether a failed shot has an understandable cause.

Set a go/no-go threshold before observing the study. A reasonable product hypothesis is a clear
within-person reduction in timing error and fewer accidental cuts, without loss of expert peak
maneuvers or unacceptable extra input burden. Do not turn an invented exact percentage into a
fake statistical standard. Analyze the distribution and uncertainty, not just the average.

## Gate E — integration and performance

Capture the real HUD in motion at the target desktop/mobile layouts. The pre-release instrument
must be visible before an armed throw. Do not display an old green cone alongside a contradictory
new contact cue. Test menus, pointer capture, remapping, extraction-vs-throw RMB arbitration,
reduced motion, reload and disposal. No additional rAF should appear in the production HUD.

Profile 60 Hz field-assisted decisions and the 15 Hz coast forecast on the actual lowest supported
machine. Measure p50/p95/p99 CPU cost, allocations and frame time; report entity/field counts.
Check that one active pair cannot create unbounded histories or listener growth. The Python/
Chromium lab evidence is not a GPU result for the real Three.js renderer.

## What would falsify this design

Players can read a release but cannot build one; experts lose controllable high-energy techniques;
substantial post-neutral travel remains; conditional windows look certain during radial/field
motion; or learned play still provides no useful payoff under matched live opportunities. Any of
those deserves a design correction. “The tests passed” is not a defense against a bad game.
