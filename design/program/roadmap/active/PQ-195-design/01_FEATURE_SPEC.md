# BREAKAWAY — feature specification

## 1. The direction

**Make a valuable moving industrial load the centre of a situation the player can physically rewrite.**

You arrive beside a working route. A caged flywheel assembly is moving to a facility that needs it. Raiders are interested because the cargo is valuable. The lawful receiver wants its machine repaired; an illicit receiver wants the same machine. Your Massline can turn this shipment into a tow, a rescue, an improvised wrecking ball, a theft, or an escape problem. The story follows the actual body and its custody—not a mission icon pretending to be cargo.

The promise is simple enough for a trailer: **take the load, make trouble, get it home.** The depth comes from the fact that “take,” “trouble,” and “home” depend on what the surrounding world is doing.

A large addition is warranted here, but a large new subsystem is not. BREAKAWAY composes existing physical-cargo, tether, combat, mission, law and aftermath capabilities around one excellent encounter and a reusable physical receiver. Its first release must feel coherent even before any second load class exists.

## 2. Why this addition wins the ROI comparison

This is a design judgment under uncertainty, not an estimated financial return. The relevant numerator is useful player decisions and memorable situations per unit of integrated, maintainable work. The denominator includes testing, save migration, rendering, onboarding and regression risk—not just the number of lines an agent can generate.

| Candidate | Main benefit | Main cost/risk | Decision |
|---|---|---|---|
| More sectors or mission text | More places to visit | Large content burden; can reproduce the same play everywhere | Not first |
| Another broad bomb catalogue | Combat combinations | Overlaps the owner's current bomb programme; requires substantial VFX and tuning | Integrate later, do not duplicate |
| Fully modular capital ship destruction | Spectacular encounters | New collision, damage, asset and save complexity across many parts | Too large as the next ROI bet |
| Expanded fleet/industrial management | Long-term progression | Risks taking the player away from personal piloting | Secondary |
| A generalized procedural story director | Combinatorial content | High abstraction cost before proving one situation is good | Explicitly rejected for this packet |
| **BREAKAWAY** | One object connects piloting, combat, heists, rescue, work and consequences | Requires good capture/custody/save integration and two tasteful assets | **Selected** |

The repo already contains a capsule launch schedule, physical catch/fence contacts, a deterministic terminal arbiter and a two-phase receiver handoff. The novel work should concentrate on the **experience around those seams**: a readable and useful load, a physical rather than touch-to-delete receiver, a meaningful choice of destination, and a consequence the player can see. See the source audit for exact owners.

This recommendation is conditional on the core ship being usable. A bad controller will make a great cargo encounter miserable. A hitch when the player releases the load will destroy authorship. Existing feel/performance regressions remain defects to fix, not problems this feature is supposed to camouflage.

## 3. The 90-second story we are building toward

A voice on the industrial channel says, “Berth Three is down a flywheel. That assembly in transit is the replacement.” The words describe something visible: a large caged spindle, a receiver waiting with its rails open, and a short queue of work that cannot proceed.

You approach. A raider starts an intelligible run toward the shipment. You can shoot it, interrupt it with a shove, pull the cargo off its line, or leave the escort to handle it. When you latch the spindle, your ship and the load both respond. Nothing becomes an inventory icon. You have acquired a new physical relationship, not a magical weapon slot.

A second pursuer comes too close. You swing the spindle across its line and cut. The load continues on the tangent and hits the pursuer hard enough to change the situation. There is a brief metallic release snap, a heavy asymmetric impact and a readable separation of bodies. No automatic “finisher” substitutes for your maneuver.

Now the assembly is going somewhere inconvenient. Recovering it costs attention and position. You decide whether to use it again or turn toward the receiver. The docking machine has a generous mouth and an understandable speed limit. Enter the mouth; allow the load to move fully into the rails; the machine arrests it through bounded force; the assembly settles. Only then does custody pass to the receiver and the mission settle.

Berth Three starts working. The queue moves. A named actor acknowledges what you actually delivered. Or you sent it to the Quiet and the legitimate operation is still waiting. Either outcome must be legible and persistent.

The 90-second description is a composition target, not a mandatory timer. Competent play can be faster. Cautious recovery may be slower. Do not add invisible urgency to force everyone through a predetermined duration.

## 4. What the player gains

The player gains a **reusable physical opportunity**, not a new keybind or a permanently stronger gun.

The same object can be a valuable obligation, temporary cover, a moving anchor, a target to defend, a load to rescue, or a heavy impactor. These uses are not chosen from a radial menu. They follow from its mass, motion, durability, custody and location. Enemy reactions and local economic meaning make the object more than a physics toy.

The new receiver also gives skilled releases an understandable destination. It turns “I launched something” into “I launched the right thing into the right place.” Its art explains why it can stop a heavy assembly; its rules explain why a glancing touch or overspeed pass does not count.

## 5. One release, three slices

### Slice A — the load and the receiving machine

Upgrade a configured variant of the existing scheduled capsule run. Use the existing launch owner before requiring a new moving carrier or detachment system. Materialize one SP-07 body with the authored spindle visual, an eligible Massline socket and correct momentum. Give one receiver the authored capture fork and the tested mechanical capture rules.

Two successful approaches must work: a deliberate low-speed tow and a clean free-flight release into the fork. A player who misses must be able to circle back, recover the assembly and try again. A receive contact alone must not teleport or consume it.

This is the first end-to-end milestone. It includes ordinary-route access, save/load and a settled mission receipt—not just a laboratory. Complete it before adding more pressure actors.

### Slice B — The Third Shift, the complete authored encounter

Compose the load with a real obligation, two possible destinations and a small opposing group. “The Third Shift” is candidate copy, not a declaration that a new named location or faction already exists. Bind it to the current Tethys facilities where possible. Rename its surface copy to current canon during integration without altering its mechanical purpose.

A lawful recovery offer registers the payload at the legitimate receiver. A theft-oriented offer uses the existing fence/law rules. These are two policies over one physical object and one mechanical receiver, not two implementations. Existing Capsule Run must retain its historical semantics unless deliberately migrated.

Add at most two pursuing light hulls and one optional specialist within the ordinary spawn-budget arbiter. Reuse current archetypes and their tactical owner. A fourth NPC may provide the industrial reaction or salvage response; it is not an excuse to add decorative traffic.

The result must support intervention, theft, rescue and non-intervention without a popup telling the player which role they selected. Contract acceptance can establish permission; a physical action establishes possession; the law owner establishes whether an offense is witnessed. These facts are separate.

### Slice C — the transport breakaway

After Slice B works, attach the spindle to an actual moving carrier using the existing physics/attachment owner. A clearly authored transport clamp becomes a combat subsystem. Disabling it releases a real body that keeps its current velocity and angular velocity. That clamp is a **transport attachment**, not permission to make the player's normal Massline fragile.

The release can be voluntary, a recovery after carrier disablement, or a player-caused interception. The release itself creates no bonus impulse. Weapons may have delivered impulse before release; that physical motion must remain. Do not impart a second “cinematic” push on top of it.

This slice extends the signature to moving traffic. It must not delay the first complete capsule/receiver experience while agents build a universal detachable-ships framework.

## 6. The SP-07 flywheel assembly

SP-07 is industrial hardware. It is not a treasure chest, glowing orb, explosive barrel or generic shipping cube.

The authored candidate has an enclosed cylindrical rotor, open polygonal load collars, long structural cage rails, machined bearing bands, a single asymmetric service spine, and a lifting lug. Those features serve readable functions: the collars take impacts, the core is valuable machinery, the rails explain structure, and the service spine tells orientation.

The candidate mass is **180 mass units**, inherited from the inspected capsule tuning rather than chosen to force a new mass scale. The new model's conservative XZ radius is **16 WU**; its measured geometry bounds and exact counts are in the asset manifest. These are candidate authoring values. The shipping proxy must be reviewed against the game's current physical scale and visible silhouette.

Use one dynamic body. Prefer a conservative simple proxy initially. If its broad proxy causes visually false contacts, replace it with a small capsule/compound approximation owned by physics; do not use thousands of mesh triangles as collision shapes. The visible lifting lug is not a snagging collider.

The assembly has condition because it is a physical obligation, but condition must not make every creative use economically stupid. Retain most of the base reward for a working, battered delivery. A modest condition bonus can reward careful handling; it must not exceed the opportunity cost of using the object in interesting ways.

The included quote helper proposes a maximum quality bonus of 15% of the base payout. It is not a new payout owner or a balance result. At a sample base of 1,800 credits, 80% condition yields a 216-credit quality bonus. The actual base must come from current contract/economy tuning. Do not silently overwrite Capsule Run's existing matrix-selected payouts.

## 7. Durability without making the toy self-defeating

There are two bad extremes. An invulnerable super-heavy object can trivialize every encounter. A fragile premium object makes players afraid to use the signature move. We want a durable cage with bounded consequences.

Use existing combat and fragile-cargo owners to implement condition change. Ordinary contact with a light hostile should not destroy the spindle. A committed terrain slam, sustained weapons fire or crushing contact can cause meaningful damage. Any body-to-body damage must consume the same contact/impulse provenance as the rest of the game, without double-counting the thrown-object hit and the collision.

For initial tuning, require two light-ship impacts to leave the load usable and a low-speed delivery viable. This is a test target, not permission to scale damage arbitrarily by enemy identity. Review the relative momentum/energy ranges and choose a cage response through the existing damage layer.

Do not change player collision immunity. Do not make ordinary Masslines break because the new transport clamp can be shot. Do not globally weaken terrain damage. Do not quietly brake thrown enemies or the cargo back to their cruise cap.

When the assembly is genuinely destroyed, the original delivery obligation has failed. Its rotor or wreck can produce one reduced-value recovery opportunity through existing aftermath/salvage ownership. This is not a resurrection of the original payload and not a second full reward. A duplicate destroy callback or reload must never duplicate that opportunity.

## 8. The capture fork

The catcher should look like a machine capable of arresting a moving mass. It has two substantial rails, an open mouth, a rear arrestor, small status lamps and energy-handling hardware. Avoid a glowing goal circle, magic bubble, instant inventory pickup or invisible wall across the mouth.

The candidate mechanical geometry uses an inward normal and mouth origin. Its clear half-width is **27 WU**, usable depth **72 WU**, entry speed at most **100 WU/s**, and lateral entry speed at most **50 WU/s**. The body must fit by its extents, not merely have its centre cross a line. For the supplied radius of 16 WU, there is 22 WU of total lateral clearance.

A centre crossing the mouth in the forward direction acquires the receiver. The load is allowed to move fully into the bay before braking begins; otherwise a slow approach would stop outside the region required for completion. Only an acquired load inside the physical bay receives arresting impulse. Behind the receiver, beside it, or far from it, the machine has no effect.

The receiver stops the load with bounded dissipative force. At rest, it does not reverse the load to fake alignment. If the player or an enemy pulls the assembly back out, capture is lost. If the receiver closes, it stops acquiring and releases its claim. The load remains physical.

When the centre is sufficiently inside, speed is no more than **8 WU/s**, spin no more than **0.45 rad/s**, and these conditions remain true for **21 consecutive 60 Hz physics ticks**, the receiver has a fresh custody candidate. That is 0.35 seconds. It is still not a completed mission or an economic payment.

The explicit semantic phases are `outside`, `braking`, `settling` and `ready`. Those are mechanical substates, not a replacement heist FSM. The existing heist arbiter still decides the terminal outcome and the existing receiver owner still consumes the body.

## 9. Physical braking and why the limits are plausible

For mass m and speed v, momentum magnitude is m v. A bounded impulse J cannot exceed F_max times dt. The supplied damping plan uses the exact exponential damping fraction over the step and saturates its magnitude by that force bound:

```
fraction = 1 - exp(-rate * dt)
J_magnitude = min(m * |v| * fraction, F_max * dt)
J_vector = -normalize(v) * J_magnitude
```

This cannot reverse motion in a single step and does not add kinetic energy. The receiver is attached to a station, so it is intentionally an energy sink. That is different from free-space drag or a governor destroying earned velocity.

At 100 WU/s, mass 180 and force limit 36,000, the constant-force stopping-distance lower bound is 25 WU. The actual damped tail is longer. The 72 WU bay must contain the body extents and that tail. The real-Rapier fixture at 80 WU/s settles successfully; this is evidence for the mechanism, not proof that every approach across the shipping game's collision geometry is accepted.

A high-speed rejection is not a mission failure. It is a refused capture. The rear stop and rails still behave physically, and the player can recover the load. Do not secretly lower a fast body's velocity to make the acceptance test green.

## 10. Permission, possession and custody

**Permission** is a legal/contract fact. A lawful recovery contract can register an assembly for a particular receiver. A fence may accept the same physical object under an illicit agreement. The law owner decides jurisdiction, witness evidence and enforcement.

**Possession** is a physical relationship. The player towing a load does not automatically own it. The line being cut does not erase prior acts, contracts or legal memory.

**Custody** is a receiver-owner fact. The correct load has entered the correct machine, settled, remained there and been consumed by an authorized handoff. History saying “this body touched this facility once” is not sufficient.

The UI must keep these distinctions visible without turning flight into paperwork. Use “authorized recovery,” “ownership unresolved,” or an actual witnessed-theft state from existing owners. Never show WANTED just because a player pressed the tether button. Never pay for the same physical assembly twice by changing its destination label.

## 11. Enemy pressure that creates choices

Opposition should make the load interesting, not simply punish the fact that it is heavy. Use a small number of differentiated actions.

The interceptor commits to an approach toward the load or the tug. Its path gives a player a chance to cross that approach with the spindle. The raider trying to recover cargo has an understandable objective and is willing to abandon a bad attack. An optional specialist can threaten a line or deny a receiving approach, but only with the already-established specialist rules and a clear response window.

Do not make every enemy a tether cutter. Do not spawn pressure continuously in proportion to how efficiently the player clears it. A successful physical hit should create actual room to act. Do not take a stolen assembly away with an offscreen outcome that ignores nearby bodies and current custody.

Budget opposition through `spawnBudget` and steer it through the existing tactical AI. The heist consumer can take a job-control lease where the current owner contract allows it; it does not write competing movement intent. If no legitimate responder is available, record that truth rather than materializing police to fulfil a narrative promise.

## 12. The local consequence

A return needs one visible cause-and-effect link, not a simulated galactic crisis. The lawful version restores a local industrial activity: an existing machine resumes, a real cargo task advances or an obstructed route clears. The illicit version pays through the fence and leaves the legitimate operation unresolved. A damaged return restores partial service or triggers a bounded repair continuation.

The condition and timing of the returned assembly must determine the result. Do not play the same “machine repaired” animation after a destroyed or stolen load. Bind presentation to an accepted receipt from the existing operation/mission owner, and preserve the consequence on save/load.

Use one named service fact and one changed activity. Do not add ten new production resources or another persistent economy to explain a single spindle. The qualitative world response is the first release obligation; calibrated market pressure can follow through the existing economy only where a real shortage mechanism already supports it.

## 13. First encounter onboarding

Do not replace the current first-hour sequence. Place the new contract where existing Massline teaching has happened or can be reused. The first lawful version should provide a clear opportunity to observe the load and receiver before pressure begins.

One contextual cue identifies the assembly and one identifies the receiving mouth. The player does not need a new mode, a new mandatory button, or a long explanation of angular momentum. The first useful instruction is “Bring the load through the open end at a manageable speed.” After a successful catch, the player can inspect details and experiment.

The receiver responds with truth: too fast, too lateral, load too large, receiver closed, unregistered shipment, or advance into the fork. Do not show all of those messages at once. Preserve the existing one-voice priority rules; safety still outranks mission guidance.

The second encounter can introduce a competing destination or an attack. The transport-clamp version comes after basic towing and receiving are understandable. This is sequencing within existing mission ownership, not another tutorial system.

## 14. Authored scenario bank

These are variants of the same system. They are not four mandatory launch features.

**The Third Shift — release target.** A legitimate operation needs the moving spindle. There is a clear receiver, one large useful anchor and an attack line that can be interrupted with the load. Success restores visible work. The player can tow carefully, throw cleanly or fight conventionally while protecting cargo.

**Quiet Freight — second content target.** The same assembly is wanted by the fence. A legitimate delivery route and an illicit receiving approach create a decision. Witnesses, patrols and custody remain real. An unwitnessed theft is not automatically guilt-free forever, but any later discovery must arise from supported law evidence rather than an omniscient script.

**Hard Landing — aftermath variant.** A carrier was disabled. The assembly survived but is stranded in an awkward physical position. Recovering it is a geometry problem with a modest continuation reward. There is no need to shoot anything. Keep the recovery shorter and more direct than the original heist.

**Cargo Under Fire — optional Crucible drill.** Reuse the same physical load/receiver to test throws and capture under a controlled cohort. It is a training/replay surface, not a second implementation or a requirement that Adventure players earn its tools in Swarm. Preserve the owner's existing farthest-round record and reward rules.

## 15. Non-goals and hard cuts

Do not build a universal object-disassembly framework. Do not turn every ship into a modular construction game. Do not add inventory Tetris, rarity tiers, a new currency, a new faction, a new sector, multiplayer, a procedural mission language, or another sandbox renderer to production.

Do not add an always-on cargo dashboard. Do not replace the game's speed gauge. Do not change the camera to imitate the generated concept art. Do not require photoreal textures to prove that the physical loop works, and do not mistake a simple prototype proxy for a shipping-quality asset.

Do not claim a reference demo is game integration. Do not close this task after adding a hidden URL, a console trigger, a Markdown plan or a standalone minigame. The first delivery must be found and completed on the ordinary SpaceFace route.

## 16. The release decision

The feature earns expansion only when fresh players can explain the load's purpose, latch or protect it without confusing controls, deliberately change at least one situation with it, and understand why the receiver accepted or refused it. Technical correctness is necessary. It is not evidence of fun by itself.

A poor result is not permission to add more variants. Diagnose the cause. If players never use the load physically, examine its mass, handling, approach geometry and opportunity—not just its reward. If they cannot finish, examine receiver language and physical tolerances—not just a bigger completion trigger. If the game hitches, repair the actual hot path—not the number of interesting things in the scene.

The finish line is not “cargo can be towed.” The finish line is **“I used the shipment to win the fight, barely got it into the dock, and the place started working because I brought it back.”**
