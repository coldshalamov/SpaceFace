# 04 — Stealth, observable attention, positional attacks, and raiding

**Outcome:** stealth is a way to choose and avoid fights, prepare an unfair opening, and steal rewards from stronger opposition. The player can tell whose attention they have and why. Planning only. Evidence: E05/E06/E08/E10. Research: R03. Dependencies: 02 and stable relevant behavior from 03; content integration with 07/10.

## Do not conflate three different kinds of heat

Physical signature is how detectable a ship is: thrust, boost, power activity, fire, and cloak suppression. Observer awareness is what a particular enemy has perceived and remembers. Legal wanted heat is the jurisdiction's response to witnessed crimes. They may exchange accepted events, but they are not one scalar.

`cloak.js` already supplies dynamic signature-radius behavior and a shared concealment gate. `PerceptionMemory` already supplies observer-specific contact age/confidence. `engagementAuthority.js` remains the final authorization for hostility/fire; `systems/heat.js` owns wanted heat. Extend these seams rather than adding an unrelated global stealth manager with its own contacts, target IDs, or crime rules.

A dark material is not concealment. A visible model does not grant AI knowledge of its exact position. Awareness icons cannot be decorative guesses made in the HUD.

## Observable awareness model

Map the current perception/AI facts to a small set of useful states. Add minimal authoritative state only where the existing owners cannot express a necessary distinction.

| State | Actual enemy knowledge/behavior | Player-facing signal |
|---|---|---|
| Unaware | No actionable evidence of this player | Quiet baseline; no permanent alarm icon |
| Suspicious | An uncertain signal or disturbance, not a precise confirmed target | A filling/question-style mark and a look/investigate action |
| Investigating | Pursuing a particular last-known point or evidence source | Directional search intent and an uncertainty area where appropriate |
| Confirmed | Adequate observed evidence; engagement still subject to faction/ROE | Clear alert transition, facing response, and threat indication |
| Searching/lost | Contact lost; last fix ages, prediction uncertainty grows | Searching mark distinct from a live tracking lock |
| Disengaged | Search expires or the actor returns to its role | Observable relaxation and return route, not instantaneous amnesia |

An alert is per observer. One guard noticing a noise must not instantly give all guards perfect position. Shared reports have a source, delay, accuracy, lifetime, and communication range. A loud confirmed battle can legitimately alert a group; a faint disturbance should propagate uncertainty, not clairvoyance.

Use thresholds with hysteresis and bounded evidence decay. Preserve the existing sensor eligibility gate: no direct entity-map reads around concealment. Inspect every firing, pursuit, missile, scanner, squad, and special-enemy consumer. If a confidence accumulator is needed, its inputs and update cadence must be deterministic, and its thresholds should be calibrated through traceable encounters rather than magic UI percentages.

## Detection geometry and feedback

Define sensor classes deliberately. Basic close-range detection may be omnidirectional; a long-range active scan or weapon search can be directional. Do not assume a universal rear blind cone for every radar-equipped ship. Give particular enemies a readable facing and forward-sensitive capability so positioning matters without rewriting all sensors as human eyesight.

Distinguish hull facing from velocity and independently rotating turret/sensor facing. A backward-flying ship has not turned its stern into its bow. Occluding world geometry, real scan sweeps, and signature variation should use existing query authorities. Low-confidence last fixes must not update from the target's hidden live transform.

On an observable enemy, use a restrained overhead awareness mark anchored to its body, not a floating generic warning unrelated to who saw the player. Show the most relevant detection cause near the player: boost noise, active scan, shot, hull breach, or nearby observer. Do not reveal an unseen enemy's exact location merely to explain detection. An unlocalized warning can state that a scan or unknown contact exposed the player.

Reduced-motion/flash modes preserve the same state distinctions. Multiple enemies entering suspicion should group sound and low-priority receipts while retaining the individual dangerous observer. A red exclamation by itself is insufficient if it never identifies the transition or decays visibly.

## Cloak behavior and a feasible route

Keep the existing cloak, charge, scanner counterplay, missile lock loss, and fire-break behavior unless a measured redesign is explicitly adopted. Existing source comments describe runtime-only cloak state that restores decloaked; that policy requires deliberate treatment for a stealth raid. Do not silently make Continue replenish an exploitable invisibility cycle or erase the guard's durable alarm/loot history.

A stealth route must be feasible with the actual fitted module. Check:

`available concealment time >= approach time + interaction time + exposed exit time + recovery margin`

Use real inertial travel and input demands, not straight-line distance divided by an unattainable speed. Where the existing energy duration is insufficient, design safe shadow/cover pockets, patrol openings, and recharge opportunities first. A cloak-duration upgrade can be a real progression choice; permanent invisibility is not the default fix.

Define each meaningful action's signal consequences from accepted simulation actions: quiet coast; thrust/boost; tether/reel; gathering or throwing mass; deploying a pylon; opening a container; scanning; firing; and taking damage. Failed button presses and rejected deployments should not produce fictitious signature or crime. Preview and help must accurately disclose revealing actions.

A cloak used mid-fight can break a tracking solution, but does not erase a projectile already on a ballistic collision course, cancel nearby blast damage, or make an opponent forget the last fix immediately. Conversely, an NPC cannot continue perfect aim simply because it was aggroed before the player cloaked.

## Positional and stealth-only actions

Provide distinct conditional opportunities, not a blanket damage multiplier for anything fired while a transparency flag is set. Prototype three roles through existing weapon/action/status machinery; final loadout exposure can be one fitted opener slot or a clear contextual variant rather than three permanent hotkeys.

| Candidate action | Required condition | Distinct payoff | Counterplay |
|---|---|---|---|
| Ambush burst | Concealed from the intended target at commit; valid range and weapon solution | A bounded first-volley advantage, such as brief shield disruption plus concentrated damage | Scans, close detection, poor approach, and normal cover |
| Drive sabotage | Concealed from that target AND inside its aft approach sector | Brief genuine drive/control interruption, useful for theft or repositioning | Guarded stern, supporting observer, hull-specific resistance |
| Rear breach | A valid rear opportunity, even while visible | Extra localized armor/impulse consequence rather than unrestricted all-damage amplification | Turn, screen the stern, force the attacker to disengage |

These are proposed gameplay identities, not claims that those actions already exist. Favor effects that open different decisions. Avoid turning every stealth opener into the same critical hit with another name.

Define rear geometry against the target's authoritative facing: with `u` from target to attacker and forward `f`, a rear cone can use `dot(f,u) <= -cos(halfAngle)`. Use surface distance for reach, not center distance that makes large targets oddly untouchable. The selected valid target displays a clear eligibility cue and the reason for refusal. Thresholds and cone width are prototype tuning to test against turn rates and actual approach ergonomics.

## Commit, reveal, hit: event ordering matters

Capture eligibility at the authoritative action commit before the firing event drops cloak. The action creates a bounded opener entitlement tied to source lifetime, target lifetime, and attack lineage. It is not a global buff that every later ricochet inherits.

On effect resolution, revalidate target existence, hostility/authorization, geometry required by that action, range/contact, and obstruction. A ranged hidden opener can remember that it began unseen; a rear-contact sabotage must still contact the relevant rear region. Define this distinction explicitly so the UI does not promise a guaranteed result against a turning target.

A multi-shot burst receives one bounded opener budget, apportioned through the existing attack lineage policy. Split children, chain hops, damage-over-time, and environmental explosions must not each receive the full opener multiplier. A missed action consumes or expires its entitlement according to an advertised rule. Do not allow a cloak flicker to repeatedly mint bonuses against the same alerted target.

Rearming requires a genuine break of observation and the appropriate cooldown/charge or encounter condition, not simply toggling cloak. Preserve alarm consequences across save/Continue and sector transitions as required by existing durable world identity. Exactly one accepted damage/status/reward event owns the result.

## Loot without killing the guardian

Author a complete strong-guard vault route. The guardian remains threatening; the chest or cargo cache is a separate physical/objective actor with its own custody and interaction conditions. Opening it must not be gated on allEnemiesDead. A player may sneak past, create a distraction, sabotage a sensor, steal a manageable valuable object, and withdraw.

The reward has physical and systemic costs: a visible container interaction, weight or tow burden, a signal-producing opening action, limited cargo capacity, or an exit exposed to patrols. The strongest loot need not be weightless currency that teleports to inventory. Do not make every chest explode into a mandatory boss fight.

Allow failure to become a chase, dropped cargo, partial recovery, or an improvised fight. Provide an escape geometry and readable search behavior. A boss may guard the objective rather than pursue infinitely across sectors. Loot acquired once stays acquired; closing/reopening, death, Continue, or leaving the sector cannot duplicate the item or reset the guard's alarm advantage without a documented world rule.

Include both peaceful evasion and predatory stealth tests. Players should be able to choose no kill, one surgical disable, or a noisy breakout. Rewards should recognize successful extraction, not only kill count.

## Acceptance and abuse cases

CEC-E must run via normal controls with the actual starting/fitted gear. Demonstrate: unseen bypass of a dangerous guard; suspicion caused by a disturbance; investigation of a last-known point; confirmed detection and a fair transition; a successful break of contact; a stealth-only opener; a rear-only opener while visible; a combined stealth/rear sabotage; and a no-kill loot extraction.

Test a second observer, scanner pulse, hull breach, already-fired missile, alarm sharing, pause/Continue mid-search, cargo-full pickup refusal, opener miss, rapid cloak toggles, target recycling, multishot/chain amplification, neutral witnesses, and legal wanted heat remaining independent. Test under the same performance pressure as combat so delayed sensing does not create unintentional invisibility or instant omniscience.

Closure requires a player to explain who noticed them, why, and what they can do next, with answers agreeing with the trace. A functioning cloak toggle alone does not close this packet.
