# Player experience acceptance: hands, meaning, feedback and recovery

**Added November 17, 2026 after the owner's hands-on correction. Reviewed baseline: `4bbe545d550a4c43e720df18c254b1c8d190d8a1`.** This chapter changes the priority of the whole review. It is an implementation brief and an acceptance standard for the existing game. The accompanying correction to controls is a limited repair; it does not certify the remaining interface.

## What the initial review missed

The owner showed the hand contortion involved in holding `5` while steering on a laptop. That observation should have been part of the first flight review. A feature can exist in code, emit the correct event, produce the intended force and remain practically unusable. Reviewing each subsystem in isolation concealed the work a player must perform across them.

The source explains how the mistake acquired a veneer of consistency. The five powers share a default hold-to-preview/release-to-use policy. Rig uses that policy even though its result is a persistent on/off clearing cone or planetary scoop. Its description says to press again to fold it. The HUD has an icon-only presentation path. These pieces each have a rationale; together they fail to teach when the tool starts, whether it remains active and whether the key must stay down. An unrelated onboarding lesson says Pin holds a tumbling pod, whereas Pin actually launches an anchor for the tether. [Activation policy](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/powerVerbs.js) · [Input resolution](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/input.js) · [HUD adapter](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/ui/orrery/hudAdapter.js) · [Situational teaching](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/onboarding/powerSituations.js) · [Actual power descriptions](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/data/arsenalWords.js)

The initial review praised a correct Armory debit and a coherent visual voice. Those are observations about transaction arithmetic and appearance. They did not justify the broader favorable assessment of usability. The corrected conclusion is that essential interaction paths require repair before claims about professional polish or release readiness are credible.

There is no evidence here of deliberate sabotage. The observed failure is a development process accepting component completion without verifying the human task. More instructions about caring for players will not repair that by themselves. The acceptance evidence has to change.

## Define the action before assigning the control

Every visible feature needs a short interaction specification that answers the following questions in ordinary player terms:

1. What am I trying to accomplish, and how do I discover the action without already knowing its name?
2. What else must my hands and attention do at the same time?
3. Is this a tap, a hold, a toggle, a selection followed by confirmation, or a press that starts an aimed placement?
4. What changes immediately, what persists, what does it cost, and how do I stop or cancel it?
5. How can I tell that it worked, failed, is still running, or is unavailable?
6. What happens if I pause, lose focus, die, change context, remap the control, or return tomorrow?

Write the answers before implementation. If the proposed default requires a finger already occupied by a mandatory simultaneous action, change the interaction. A remapping menu is valuable, but an ordinary player should not need to redesign the basic controls before the game becomes playable.

### Physical input budget

For the ordinary keyboard/mouse layout, the right hand is already aiming. The left hand must retain directional authority, and its thumb may be boosting. A sustained reach to the number row competes with steering. Which exact chord is uncomfortable varies with hands and hardware; the product requirement is to avoid making a sustained reach necessary for essential play.

The same reasoning applies to controllers. A face-button hold can occupy the thumb needed for the right aiming stick. A chord can consume a shoulder already used for boost or braking. On touch, a held action can steal a thumb from either movement or aim. Count the concurrent jobs on the actual device; do not infer parity from the presence of a binding.

| Interaction type | Appropriate default behavior | What must be visible | SpaceFace application |
|---|---|---|---|
| Immediate reaction | Activate on press; holding or release adds no second activation | Immediate effect, cooldown and an intelligible rejection reason | Shove repulsor and detonation. Its combined explosive effect must be disclosed. |
| Persistent tool | Tap on, tap off; no sustained key is necessary | Tool name plus actual ON/OFF state; state follows the simulation, including automatic shutdown | Clearing cone and planetary scoop. Show the context-specific name, not just Rig. |
| Aimed placement | Aim and commit according to an explicitly chosen interaction; preview is clearly distinguished from the live effect | Placement boundary, effect forecast, commit/cancel instruction and cost | Pull, Pin and Bomb. Existing preview preference can remain for these actions, subject to physical playtesting. |
| Continuous output | Hold only where the default location permits the rest of the task; provide an equivalent toggle option where useful | Whether output is currently active, plus depletion/overheat state | Fire, boost, mining and gathering. Evaluate each alongside movement and aim. |
| Infrequent selection | One tap, or a deliberate menu choice with predictable return | Current choice and consequence before commitment | Map layers, fitted ordnance, navigation and loadout selection. |

These are product rules. A clever animation or elegant shared handler does not override the job the action performs. Keep implementation in existing owners: `powerVerbs`, the input resolver, preview policy, binding resolver and presentation adapters. A new framework is unnecessary unless an observed inconsistency cannot be removed in those owners.

## The first repair and its limits

The immediate repair is one coherent change across input, preview, teaching and feedback: Shove activates on press; Rig toggles on press; the aimed powers retain the player's preview preference. A held Rig key no longer draws a preview that implies the tool depends on continued holding. The HUD names the actual cone or scoop and shows its real state. Descriptions distinguish the three interaction classes. The false Pin lesson must be removed. Custom bindings and explicit unbound actions must keep their meaning.

This does not establish that all combat bindings are comfortable, that aimed preview is the best long-term default, or that the rest of the HUD is legible. It removes a confirmed contradiction and creates a reusable policy seam. The next assessment should decide whether aimed powers need a select-then-confirm interaction, an optional radial selector, or another arrangement, using observed errors and hand use. Do not replace a troublesome hold with a modal targeting state that silently steals the primary weapon.

Useful evidence has distinct scopes:

| Evidence | What it establishes | What remains open |
|---|---|---|
| Owner's photographs and report | The reported play path imposes an unacceptable hand position and unclear interaction | Exact running build, every alternative binding and other players' experience |
| Source trace | Default policy, descriptions, preview path and state ownership at the reviewed commit | Whether those exact bytes are the live release |
| Input-to-domain test | Real sampled key events cause the correct cone/pulse behavior without repeat/release errors | Physical comfort, screen visibility and perceptual latency |
| Actual rendered HUD | Names and state fit and remain legible in the photographed configuration | Other viewports, text sizes and dynamic combat situations |
| Ordinary live task | A player can find, understand, operate and recover on that build/device | Unsupported devices or untested modes |

Do not combine these into a single green status. If a browser cannot render the exact candidate, mark live acceptance unverified. Keep the implementation reviewable while preserving that limitation.

## Rewrite descriptions around decisions

At the moment of use, a description should say what happens, what it affects, how to activate it, and the principal cost or danger. Follow with deeper mechanics only when they change the decision. Lore belongs where the player has time to read it. Mechanical jargon can be retained when it earns a stable meaning and is explained on first use.

For example, a cone description should communicate: pushes loose objects ahead of the ship; tap to turn on and tap again to turn off. It should use the current binding and current context. A phrase such as “64-degree wedge” can be useful in extended details, but does not answer the first question of how to operate the thing. Where a tool consumes energy, ammunition or money, disclose the actual cost; do not invent a drain or guaranteed outcome that the live owner does not implement.

Pin's text should describe the launched anchor and the subsequent tether interaction. Shove's text must disclose that it also detonates armed ordnance. An ostensibly defensive button with an undisclosed explosive side effect is a trust problem. Bomb should name the currently selected payload and the resource it consumes. If its fallback can change from a cargo charge to a call-in or bay weapon, communicate the actual selection before the press. [Power and payload resolution](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/powerVerbs.js) · [Live rail state](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/ui/powerRail.js)

Audit tutorials, HUD hints, Help, Settings, contextual lessons and marketing descriptions against the same behavior. Updating one canonical string will not fix a contradictory hard-coded lesson elsewhere. Conversely, indiscriminate global text replacement can destroy a context-specific instruction. Trace the actual consumer.

## Whole-game task matrix

The review unit is an ordinary task with a beginning, a decision, an action, a result and a recovery. Assign an accountable owner to each complete row, even if implementation crosses several modules. The chapters linked in the review supply subsystem detail; this table supplies the missing player acceptance.

| Task | Questions the player must be able to answer | Required adverse case | Evidence and next change |
|---|---|---|---|
| Enter Adventure or Swarm | Which mode am I entering? Does this resume, start over, or change setup? Where do I click? | New player clicks the illustrated area, navigates by keyboard and backs out of setup | Entire intended control area responds; hover/focus/click states agree; plain action labels; no accidental overwrite |
| Move, aim, fire and use a power | Can I keep steering? Did it activate? Must I hold it? What is the key doing now? | Hold/release, quick tap, repeat, low energy, lost focus and a rebound key | Observe hands and screen together; test the actual game outcome; fix incompatible concurrent inputs before adding another power |
| Grab and throw | What can I attach to? Is it attached? Which motion builds a useful throw? How do I release? | Missed latch, unsuitable target, excessive strain, accidental cut and retry | Visible target/attachment/release result; failed throw teaches an actionable correction; return to control is immediate |
| Read a boss encounter | What is dangerous, what is vulnerable, and what can I do about it? | Follow the spoken instruction literally, attempt a wrong counter, recover | Name, callout, visible phase and damage window agree; correct color is not the only cue |
| Buy, fit or skip | What changes in my next move? What does it replace? What remains in my wallet? | Inspect without buying, insufficient funds, double activation, zero-spend launch | Stable inspect versus purchase semantics; baseline and outcome together; one debit; visible free exit |
| Find and complete a job | What is the next physical action? Where is the place? What belongs to me? | Detour, lose the marker, return after loading, accept another job | Recoverable route and current objective; reserved cargo identified at the point of sale; completion shown in the world |
| Mine, trade and process cargo | Is this ore mine? How much can I move? What is the net consequence? | Full hold, partial transaction, contract cargo, missing input or output space | Accurate quantity, ownership, cost and failure reason; no silent no-op; a clear way to free capacity |
| Use a map and travel | Where am I, where am I going, and can I afford the route? | Cancel, change target, insufficient fuel/funds, arrive and reopen | Destination and route survive relevant transitions; the next action stays visible; travel and tactical scale are distinguishable |
| Manage a base or operation | Is it operating? Why is it stopped? What can I change? | Missing worker/input/power, unprofitable output and an old save | Specific cause and actionable remedy; operating cost beside revenue; meaningful defaults and recoverable configuration |
| Handle dialogue, law and notices | Who is addressing me? Is there a deadline? What will this answer do? | Multiple notices, combat overlap, timeout and dismissal | One priority decision; truthful consequence; nonurgent text waits; prompt keys do not also fire weapons |
| Die and try again | What killed me? What could I change? What carries forward? | Immediate death, a held key across retry, abandoning a run | Useful cause and counter; readable result; no accidental spend or movement on return; honest progression |
| Save, quit and return | What is saved? Which session will continue? Can I recover if loading fails? | Interrupted load, old save, missing dependency and settings change | Identified save and consistent recovery; preserved ownership/bindings; return to a recognizable place and objective |
| Change input/access settings | What changes immediately? Can I undo it? Does the hint update? | Duplicate binding, explicitly unbound action, controller disconnect, large text and reduced motion | Valid alternatives, immediate truthful labels, persistent preferences and no lost route back |

Start with entry, combat, Armory and retry because they determine whether a first session can continue. Then finish the first Adventure job and return. Later systems inherit this standard; they should not be marked usable solely because a developer can teleport to a successful end state.

## Regression prevention that answers the actual complaint

For the present control failure, assert the domain outcome through real input sampling: with movement held, the first press enables the cone; holding does not retrigger; releasing does not disable it; the second press disables it. Repeat with the saved custom binding and planetary scoop context. Check that Shove responds on press and that aimed preview still commits once. Check that pause/focus changes cannot manufacture a fresh activation when input resumes. A test that only observes a `keydown` event would leave the original defect intact.

For descriptions, test consequential meaning where practical: the current Rig context maps to the same tool in the input owner and HUD; active state comes from the live tool, not a pressed key; the resolved binding matches the hint. Avoid tests whose only assertion is that a source file contains a favorable phrase.

For visual changes, inspect the actual rendered states at the intended laptop viewport and the smallest supported height, then at large text. Observe both ready and active states, a denial, pause and return. Automated rectangle checks can catch clipping; they cannot establish that a new player understood the display. Record the candidate commit, input device, viewport and outstanding limitation with the observation.

For the broader UX, use a short uncoached session. Give a goal such as “clear those rocks while continuing to fly” or “buy one useful improvement and enter round two.” Do not narrate the intended controls. Record the first hesitation, wrong interpretation, abandoned movement, unintended purchase or failed recovery. Ask what the player believed happened. Correct the earliest causal failure and repeat that task before expanding scope.

## Measures that reward a better game

The immediate measures are task completion without coaching, unintended actions, time until useful feedback, avoidable control conflict, recovery success and the player's explanation of the result. Count task attempts and record the build/device; a percentage without a denominator is decoration. Small formative sessions identify concrete failures, not population-wide conversion rates.

Connect those findings to later outcomes: intentional second use of a mechanic, voluntary retry after a comprehensible loss, informed purchase, return after Continue, and reasons to recommend the game. More playtime can result from confusion or wasted navigation. Prefer time spent making meaningful decisions and enjoying mastery. A player who stops because the game fights their hands has supplied decisive feedback regardless of the session-length metric.

**Next-agent acceptance:** implement one complete task, state the simultaneous input demands, make the teaching and feedback agree with its owner, show one mistake and its recovery, and keep unobserved claims open. When a regression appears, preserve the concrete failing scenario. The owner should not have to rediscover the same broken interaction every time another subsystem improves.
