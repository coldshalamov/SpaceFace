# SpaceFace — whole-game review and production plan

**November 17, 2026 · Reviewed source 4bbe545 · Windows/Electron and browser PC are the primary test targets in this review.**

## Correction after the owner's hands-on report

**Basic usability is a release blocker. The original review gave too much credit to implemented systems and too little weight to the physical and cognitive work of using them.** The owner supplied photographs of the hand position required to keep `5` held while steering. Source inspection confirms that the default input policy applies hold-to-preview/release-to-use to all five powers, including the on/off clearing cone. The HUD calls that power “Rig,” can hide its name behind an icon, and its description says “press.” A player receives incompatible lessons about the same action. This is a defect in the interaction contract, with consequences for every claim about combat quality, accessibility and commercial readiness. [Input policy](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/powerVerbs.js) · [Activation path](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/src/systems/input.js) · [Corrected interface review](40-interface-input-and-access.md)

**Read [62 · Player experience acceptance](62-player-experience-acceptance.md) before assigning further visible features.** It establishes the missing unit of review: a person discovers an action, understands it, performs it while carrying out the rest of the task, reads its result, and recovers from a mistake. An attractive screenshot, an event firing, a correct debit or a passing fixture proves only the part actually observed. None is sufficient evidence that this whole sequence works. [Draft implementation PR 1118](https://github.com/coldshalamov/SpaceFace/pull/1118) addresses immediate Shove/Rig activation and the corresponding teaching and feedback. Its 83 focused checks passed; fresh exact-build visual acceptance remains blocked, and the broad gate fails on pre-existing missing imports. A patch does not establish whole-game usability. [Verification detail](01-evidence-and-playtest.md)

## The opportunity after the interaction foundation works

**Build the game around one skill used for two different reasons.** In the Pit, a pilot learns to swing a ship through a pack and tries again because they can picture a better release. In Adventure, the same hands slow a load into a cradle and the dock comes back to life. SpaceFace already has enough machinery for both. The next investment should make those experiences reliable, visible and worth returning to.

On the public demo I grabbed a 1,690-tonne body, earned the grade “MESSY · NEVER SWUNG,” and died to a Wasp firing into my port side. I knew which direction the fatal shot came from. I understood much less about what my hands should do differently on the next swing. On retry I reached the Armory, fitted a 28-credit laser and carried the correct 989-credit balance into round two. This is a game with a working play loop and an identifiable visual voice. Its most persuasive features already exist in miniature.

The sharpest business risk is that a buyer can reach a different experience from the one its developers think they are selling. The public build I played still had separate Swarm and Crucible entries. The reviewed master already builds a different two-door title, and the project's own acceptance packet says later content had mostly been inspected through staged entry. On master, a player can also follow a correct-sounding encounter hint that the chosen boss score does not implement. These discrepancies spend player trust faster than another sector can earn it. [Playtest and evidence](01-evidence-and-playtest.md) · [Pinned first-hour design](https://github.com/coldshalamov/SpaceFace/blob/4bbe545d550a4c43e720df18c254b1c8d190d8a1/design/game/20_THE_FIRST_HOUR.md)

## Decisions I would make as director

0. **Restore the ability to understand and operate the game.** Put ordinary laptop keyboard and mouse play through the full movement + aim + attack + tool sequence. Correct contradictory instructions and visible state before extending the power set. Repeat on the currently supported controller and touch routes; a face-button hold can conflict with a thumb's aiming task too. Treat the owner's physical demonstration as failure evidence that outranks previous positive prose. [Player experience acceptance](62-player-experience-acceptance.md)

1. **Give Swarm the first commercial demonstration.** Sell a visible, deliberate throw with an identifiable victim and aftermath. Build the opening five rounds as a sequence of lessons that pay off at Iron Maw. Preserve the thirty-round victory and optional continuation. The deterministic planner and specialist behavior are strong enough to support genuinely different encounters. Round 26's advertised mutually protecting Wardens currently reject each other in the target selector. Fixing an encounter promise has higher value than adding another enemy name. [Combat and bosses](11-combat-enemies-and-bosses.md)
2. **Repair the reward for mastery before tuning its price.** On master, the default Exhibition stake of 2,400 became 1,200 permanent bounty when the production settlement function received zero kills, zero cleared waves and an untouched purse. The first hangar rank costs 100. Preserve the beginner's spending room and make permanent progress come from a player-earned source. Otherwise experimenting with a purchase can be less rewarding than losing immediately. [Swarm progression](12-swarm-runs-progression-and-side-modes.md)
3. **Ship one town a stranger can find, change and recognize tomorrow.** Lantern Ward already has a physical service route and a one-time 180-credit reward that survived a scripted save/restore. Start from the dark lamp in a normal approach, put a person where the pilot can find them, let the player mishandle the load and recover, and preserve both the visible lamp and the payout. Keep Cold Start as the central opening and give a player who takes the detour an unmistakable way back. Use that standard for the five major towns. [Adventure](20-adventure-and-campaign.md) · [Places and navigation](21-world-places-and-navigation.md)
4. **Treat the moving world as a release criterion.** Record the original boost/turn/tether symptom alongside the input, simulation clock, fresh ship poses and drawn landmark. A smooth spinner is entirely compatible with a stale world. Keep the same raster and art when comparing changes. Use the latest source and retained measurements to investigate the original defect through its observed symptom. [Frame pacing](30-runtime-and-frame-pacing.md)
5. **Spend the next art pass on decisions.** The public Armory already told me what a purchase cost, where it fitted and what I would have left. It spent much of its center showing the selected card's glyph again. Show the hardpoint, firing arc or next-wave trade-off there. Commission art to clarify boss vulnerabilities, lamp cradles and distinguishing silhouettes. [Interface](40-interface-input-and-access.md) · [Art and sound](41-art-sound-and-player-feedback.md)

## Production scorecard

Grades are director judgments about current evidence. A strength can coexist with an unverified release route.

| Dimension | Judgment | What would move the judgment |
|---|---|---|
| Identity and trailer potential | Strong. A physical release is distinctive in a few seconds. The public still set undersells the fight. | An uncoached viewer can explain a muted clip, then reproduce the idea in the demo. |
| Flight and combat | Promising mechanics, failed usability evidence. The owner's hand-position report and contradictory activation/teaching invalidate an overall “strong” judgment about the playing experience. | Maintain movement and aim while using each required combat action; identify its actual state and deliberately repeat the intended result. Then evaluate depth and balance. |
| Retention and progression | Specific and fixable incentive failures. Fast, legible retry and fair persistent rewards are especially valuable. | Earned rank and second-run control verified. Fresh and veteran Daily starts compared. Voluntary retry measured. |
| World and narrative | Serious authored depth in pockets. Navigation, optional work, local consequence and return are the seams to prove. | Two players take different actions in the same place and can identify what changed after Continue. |
| Economy and ownership | More promising than a conventional commodity loop. The cargo's owner and history can materially alter what the player can do. | An entrusted shipment survives spending and save/load. One changed price or service is traceable to an actual delivery or loss. |
| Visuals, UI and access | Fails the current player-facing standard. Visual identity exists, but does not compensate for hidden action names, misleading teaching or unclear mode changes. | An uncoached player can discover, explain, perform, read and reverse the essential actions at ordinary scale and under pressure. Inspect actual hands and actual rendered states. |
| Runtime, repository and delivery | Professional engineering ingredients. Release confidence is uneven. 291 registered roles and 5,888 test files are meaningful maintenance obligations. A failed release job, stale fixture and slow world need different remedies. | Public route, install/update/Continue and the original motion symptom checked on identified builds and devices. |
| Sales, reviews and long-tail demand | Unmeasured. The strongest positioning hypothesis joins a kinetic arena to a working harbour. | Real comprehension, voluntary return, comparable traffic sources and verbatim reasons to recommend or decline. |

## Reading map

| Document | What the next agent gets |
|---|---|
| [01 · Evidence and playtest](01-evidence-and-playtest.md) | Which build was played, public actions and outcomes, test results, historical evidence and limits. |
| [10 · Flight, Massline and camera](10-flight-line-and-camera.md) | Target acquisition, release feel, racing line, camera behavior and hitch reproduction. |
| [11 · Combat, enemies and bosses](11-combat-enemies-and-bosses.md) | Round-by-round contradictions, combat readability, counterplay and encounter repairs. |
| [12 · Swarm and side modes](12-swarm-runs-progression-and-side-modes.md) | Run economy, Armory, extraction, fair Daily, Gauntlet, racing, gallery, league and repeat play. |
| [20 · Adventure and campaign](20-adventure-and-campaign.md) | Cold Start, the first berth, branch behavior, endings and a test failure traced to the wrong actor. |
| [21 · World and navigation](21-world-places-and-navigation.md) | Town geography, map and travel, residents, authored work and visible persistent consequences. |
| [22 · Trade, industry and ownership](22-economy-industry-and-ownership.md) | Custody, prices, mining, fabrication, automation, operational costs and a viable first claim. |
| [23 · People, law and careers](23-people-law-and-emergent-careers.md) | Crew, recurring rivals, rescue, ship title and provenance tied to one proposed disputed salvage job. |
| [30 · Runtime and frame pacing](30-runtime-and-frame-pacing.md) | Within-session measurement, renderer and simulation separation, art/performance budgets. |
| [31 · Engineering and production](31-engineering-and-production.md) | CI diagnosis, hygiene, ownership, test validity, asset pipeline and agent packet size. |
| [32 · Save, release and support](32-save-release-and-player-support.md) | Save migration, Continue, recovery, packaging, channel claims and support handoff. |
| [40 · Interface, inputs and access](40-interface-input-and-access.md) | Public Armory purchase, priority HUD, popups, control language, touch, pad and localization. |
| [41 · Art, sound and feedback](41-art-sound-and-player-feedback.md) | Specific capture critique, silhouettes, physics cues, mix, captions and a playable art commission. |
| [50 · Commercial and retention](50-commercial-retention-and-measurement.md) | Demo and trailer proposal, repeat-play design, test cohorts and falsifiable business metrics. |
| [51 · Production order and agent brief](51-production-order-and-agent-brief.md) | Five initial packets, dependencies, owner queue crosswalk, stage gates and pasteable agent brief. |
| [60 · Complete coverage register](60-coverage-register.md) | All 291 production initialization IDs reconciled across 21 families, including 223 update roles, plus adjacent features outside the manifest. |
| [61 · Reproduce key findings](61-reproduce-key-findings.md) | Copy-pastable Node probes for settlement, Wardens and profile-dependent challenge starts, with expected outputs. |
| [62 · Player experience acceptance](62-player-experience-acceptance.md) | Correction to the initial review, physical input budgets, truthful action language, whole-game task matrix and concrete regression acceptance. |

**Start implementation with chapters 62 and 51.** Use chapter 60 when assigning a less familiar subsystem and chapter 01 when deciding how much confidence to put in a finding. This review proposes changes to the fleet's priorities. The proposed implementation sequence is ready for the lead to reconcile with the current queue.
