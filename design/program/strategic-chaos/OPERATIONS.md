# Three operations — authored situations, not implemented missions

These are concrete implementation briefs for SC-11. They reuse existing places, actors and owners. Resolve current canon and source IDs during preflight. The internal working titles below are not newly approved lore. Each operation should be built and qualified independently before expanding the set.

## 1. Ceres Freight Disaster

**Place and parties.** Use the existing Ceres refinery/ambush activity pockets. Industrial workers want throughput; the freighter captain wants the finite shipment delivered; raiders want cargo rather than every ship dead; the patrol wants a lawful corridor and responds to witnessed incidents. A salvage opportunist can be added only through an existing actor/job owner, not an infinite spawn trick.

**Information.** On approach, the player can observe a departing load, suspicious intercept positioning and known protection geometry. Scanning or close observation may reveal a vulnerable component or timing window. Do not expose exact raider plans before they are observable.

**Defense plan.** Screen the freighter, use terrain to deny the raider approach, interrupt a disabling specialist, then decide whether to chase or finish escorting. The benefit is delivered cargo and a surviving contact; the cost is exposure, damaged escorts or a lost chance to loot.

**Theft plan.** Disable rather than annihilate the freighter, separate a real cargo lot, create an escape opportunity and deal with witnesses/search. Cargo legality and ship custody are actual existing rules. No mission-specific immunity or instant completion after selecting Steal.

**Physical improvisation.** Use a small hostile hull, mass aggregate or industrial workpiece to break formation or open the route. Collateral, spilled cargo, witness reactions and recovery come from the physical event. A miss is a valid outcome; the encounter must not secretly steer the projectile.

**Failure and aftermath.** The player can retreat, save a pod while losing freight, recover part of a lot or return to an abandoned wreck. Shipment loss changes only the supported finite supply/service chain. Captain memory reflects actual survival and observation. Unclaimed cargo cannot pay every revisit.

**Evidence.** Existing B12 remains the signature-receipt gate. Separately record actor/incident/lot linkage and compare matched defense/theft/intervention trials. Measured delivery, survival, damage, cargo, heat and resource expenditure reveal tradeoffs, not a universal best strategy.

## 2. Contested Salvage Recovery

**Place and parties.** Choose an existing recoverable wreck/yard/tender situation. The player seeks a particular physical module or cargo; a legitimate recovery crew wants its claim honored; another crew wants valuable material; a survivor or working tug has a goal independent of the loot. Reuse the existing salvage-outfit implementation if present; do not build duplicate crews from a dated plan.

**Information.** The claim, usable attachment points, instability and departure intentions need readable cues. Exact contents require the appropriate existing scan/inspection. Visible intent is not omniscient inventory disclosure.

**Cooperation plan.** Stabilize or tow the wreck, protect the recovery and negotiate a supported share through current settlement. This sacrifices immediate exclusivity for safety, access or a later relationship.

**Competitive plan.** Race to a loose physical component, block a rival's approach or redirect the target into a reachable place. Distinguish competitive behavior from automatically becoming lethal enemies. Stealing owned material has the actual legal/reputational consequences.

**Rescue-first plan.** Spend the limited time securing a person or tug while valuable salvage drifts away. A later legitimate lead or service can follow an observed rescue; it must not reimburse every sacrifice with a hidden jackpot.

**Failure and aftermath.** A broken tow, lost component, captured tug or rival extraction changes who has custody. Recovery can continue with fewer resources. Do not reset all actors to their opening pose when the player leaves. A remembered outcome changes the next interaction, not just a line of exposition.

**Evidence.** Track the original finite component through possession transitions; test simultaneous claims, aborted handoff, actor replacement and Continue. Compare quantity recovered, risk, time, relationships and actual return opportunities.

## 3. Defense of a Working Facility

**Place and parties.** Use the site completed in SC-06, such as the existing working-battlefield machinery. Workers need the facility operational, attackers want to interrupt or seize a finite strategic resource, the player has a chosen contract, and a neutral shipment or repair crew creates a conflicting priority.

**Information.** Show operating cycles, exposed parts, protected geometry and the approaching force through observed evidence. Unknown offscreen reinforcements are not always exact countdowns. If a countdown is shown, it must have a known source.

**Hold plan.** Use wing orders and shielding to keep the route open while protecting the vulnerable component. High throughput is possible but requires staying exposed.

**Sabotage plan.** Temporarily disable part of the facility or redirect machinery to deny attackers an advantage. This can save lives while reducing immediate production. Damage is not automatically repaired when the contract resolves.

**Evacuation/counterattack plan.** Withdraw workers or the finite resource, exploit the enemy's committed approach, then choose whether to return. A tactical retreat is not mission failure disguised by UI if it satisfies a supported alternate objective.

**Failure and aftermath.** Partial operation, damaged infrastructure, captured cargo and dead actors remain distinct outcomes. Recovery is a physical job using existing service/resource owners. Do not replace every loss with a larger enemy wave or a softlock.

**Evidence.** Show objective completion from actual outcomes, conservation of the resource, distinct plans and readable feedback. Test foreign actors entering the fight. Assess mass/geometry interaction and incoming-threat readability under dense effects.

## Authoring law

Use the existing encounter/mission data and generic `spaceface.simScenario.v1` lab. These briefs are not new runtime schemas. Author one ordinary offer/arrival → action → outcome → settlement → return route at a time. Never award an objective from a dialogue choice that merely stated intent. Player freedom is evaluated by materially different outcomes from reusable rules, not a count of menu options.
