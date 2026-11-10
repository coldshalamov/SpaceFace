<!-- LIFETIME: DURABLE — cumulative creative investigation; retain lineage and dated changes. -->
# SpaceFace arcade design notebook

**Started 10 September 2026.** Companion to the [mechanical diagnosis](CRUCIBLE_ARCADE_POSTMORTEM.md), grounded in the [owner's vision](../VISION.md). This is a growing design argument about the game we want, not another defect ranking.

The desired experience is bigger than a functioning list of guns. You fly one wonderfully controllable ship through a crowd of physical opportunities. A fleeing enemy, a loose panel, a curling stream of bullets and a broken machine can all become ingredients. Your choices make something excessive happen; the resulting wreckage changes what you can do next.

The most promising missing layer is **combat that keeps giving you new material to improvise with**. Shooting should do more than subtract health. Flying should do more than relocate the ship. Destruction should do more than remove an enemy. Each can create the next opportunity.

## How this investigation accumulates

Keep the existing diagnosis and the ideas below. Stable idea IDs identify ideas, not priority or implementation packets. A later pass should develop an idea, connect it to another, add a new one, or record why an assumption changed. If an idea is abandoned or merged, retain a short reason and point to its replacement. Cumulative does not mean every idea must ship.

Entries describe proposed player experiences. Some extend existing code, some develop unimplemented plan seeds, and some are new combinations. **An idea being in a plan is not proof it is playable; a proposal here is not proof every supporting mechanic is absent.** Check the relevant seam when taking it into implementation, rather than conducting a fresh whole-repository audit for every brainstorm.

This notebook does not rewrite the global work queue or authorize unrelated implementation. Keep further investigation within the active request; no automatic recurring task is implied.

## First design pass: make the fight supply its own toys

### I01 — Scrap Halo: turn a kill into an object you can keep using

You destroy a fighter and two substantial plates survive. A magnetic collector draws a few eligible pieces into a loose, visible orbit around your ship. They intercept some incoming fire. You carve around a rock, release the orbit, and throw the plates tangentially through the pursuit.

The pleasure is choosing when to spend your protection. A crowded halo makes you look armed and dangerous, but throwing it creates a much stronger attack than keeping it forever. Pieces have mass, finite durability and gaps between them. It is not an invisible percentage damage reduction.

**Develop the idea:** reflective plates can bank your own fire, conductive pieces can relay a web attack, and a captured reactor core is a dangerous addition you may want to eject. A gravity shot can steal debris from the halo. Collect only a small number of gameplay pieces; ordinary dust remains cosmetic.

**Lineage:** the master plan already names orbiting debris shields and physical hull plates. This develops their collection, expenditure and interaction with the next move. Connects to I04, I07, I10 and I13.

### I02 — Wake Cutter as a drawn weapon

The player's flight path becomes a short-lived piece of combat geometry. Boost past the pack, hook around an asteroid, and leave a curved shear trail across the route they are about to take. The attack's shape comes from how you flew.

The base version briefly deflects pursuers and loose bodies across the trail. A thermal variant burns through a crossing; an electrical variant lets a conductive web feed into it. Another upgrade makes your bullets accelerate and stabilize while traveling along the wake. These variants should be choices with distinct behavior, not all effects applied simultaneously.

The skill is drawing a useful curve under pressure. Keep the trail short and tied to real movement, so endlessly circling the safest empty corner does not build a permanent death fence. The player should still need to lure, turn and commit.

**Lineage:** Wake Cutter and Wake Rider already appear in the master plan. The expansion here is a coherent movement-first build, including how it shapes pursuit and interacts with a web. Connects to I03, I06, I14 and I17.

### I03 — Rebound Skates: terrain can help you escape

A mobility fitting turns a controlled glancing contact into a powered redirect. Approach an asteroid obliquely and skim along it; aim the exit to peel away with retained speed. A more direct approach spends more momentum and gives a sharper turn. The rock is now part of your movement vocabulary.

This should make a crowded field feel like a playground. The player can use the outside of a large asteroid to turn more tightly than the pursuing pack, cross its route, and lay a wake behind the new line. It gives parkour a technique beyond “avoid the obstacle” or “attach the rope.”

Keep contact geometry meaningful and the response predictable. Do not magnetically snap the player onto invisible rails or require a tiny timing window. Existing collision forgiveness remains; this fitting rewards deliberate contact rather than making ordinary contact newly punitive. Different hulls can have different turning and energy tradeoffs.

**Connection:** I02 makes the carve leave an attack; I07 lets a moving panel become a temporary skate surface. Depends on the diagnosis's momentum-preservation finding.

### I04 — Return Cutter: aim the second pass with your ship

Fire a broad luminous cutter outward. It banks or pierces on its first traversal, then returns toward your moving ship. Instead of waiting for it, boost sideways so its return slices across the rear of the pack. You aim one attack with the cursor and another with your subsequent flight.

A return weapon should have a long enough visible arc to recognize. Catching it replenishes its charge; missing the catch can cost a brief recovery rather than deleting an expensive item. Limit how much it can turn on return, so where the player moves matters.

Build branches could favor a single heavy cutter, a pair of alternating crescents, or a returning seed that leaves web anchors where it banks. A tethered group is ideal material for the return path, but the weapon must remain enjoyable without a web.

**Lineage:** returning projectiles and Boomerang Edge are retained plan seeds. This adds the movement-directed second aiming problem and a concrete catch/recovery identity. Connects to I06 and I17.

## Second design thread: steal the enemy's advantages

### I05 — Catcher's Mitt: catch dangerous ordnance and throw it back

A short-range field at the bow can catch a limited amount of eligible physical ordnance. A heavy missile struggling against the field is more exciting than a generic shield meter. Turn the ship, release it into its former escort, and watch the explosion start on their side.

This need not be a frame-perfect parry system. It is a commitment to holding dangerous cargo at the front of your ship while still navigating. Capacity and the kinds of objects it can hold are legible. Beams and very large bodies follow different rules rather than being arbitrarily swallowed.

The field could also catch one loose coolant tank or reactor core. That makes it a crowd-control tool when no missiles are present. A stored projectile may be redirected by a bank plate, and holding a volatile core too long can create a visible reason to let it go.

**Connection:** the same captured body can feed I01's halo, I09's enemy equipment or I12's machine. Reuse physical projectiles and payloads rather than turn every capture into a new abstract ammo currency.

### I06 — Bullet Loom: your web becomes a route for fire

The owner already wants enemies webbed together. Take that one step further: with a specialized emitter, your own luminous shots can enter a loaded strand, travel visibly along it, and leave at a junction or endpoint. A badly spread pack can become a temporary firing network.

Imagine hitting the nearest trapped fighter while a ribbon of fire runs across the web to the enemies you cannot directly see behind it. Then shove one endpoint sideways: the web changes shape, and the attack route moves with it. Cutting a loaded strand releases the remaining pulse along the tangent.

This is different from an instant chain-lightning number applied to nearby enemies. The path itself should be visible and interruptible. Give it finite pulse capacity and a clear loss or split at branches. A simpler first version can conduct a single energy pulse through a line; the full projectile-guiding form is a later specialization.

**Lineage:** Massline Arc Welder, Conductive Path and Snarl are existing seeds. This proposal combines them into an aimed, moving attack network. Connects to I02, I04 and I10.

### I07 — Kite Shield: carry your own bank surface

Deploy a broad hull plate on a short articulated tether beside or ahead of the ship. It blocks a firing lane and provides a predictable surface for your bank gun. As you turn, it swings. You can fire into your own shield to redirect shots backward into pursuers.

The tradeoff is geometry: the plate protects one side, occupies space and can snag on terrain. An enemy shove can swing it out of position. Releasing it turns a defensive object into a tumbling projectile.

This gives a slower build an expressive answer to a swarm. It also makes “firing away from the enemy” readable: the player sees the plate and the outgoing stream. A skilled pilot can use a terrain anchor to swing the plate through a group before returning to cover.

**Lineage:** the planned Hullplate Projector already supports moving, banking and crushing. This develops its ship-relative handling and a full defensive gunship style. Connects to I01, I03 and I06.

### I08 — Harpooners that accidentally help you

An enemy tries to tether and reel you toward its squad. You boost around a heavy object so the line crosses the pursuit, then exploit the attacker as the far end of a moving trap. Alternatively, cut its engine and let its own reel haul it into the object it meant to drag you past.

The enemy's tool should obey enough of the same physical rules that recognizing it suggests a counter-trick. It remains threatening because it disturbs your route; it becomes satisfying because its power can be inverted.

Keep steering available under the pull. Avoid an attack that simply disables input until a timer expires. Make the tether source and loaded direction unmistakable. The line should not magically wrap around terrain unless that behavior is deliberately supported; the useful inversion can come from actual endpoints, crossing bodies and relative momentum.

**Connection:** I06 can exploit a hostile conductive line; I05 can hold an attached payload; I11 can supply a hinge or anchor. This extends existing tether-raider concepts rather than requiring another general AI framework.

### I09 — Equipment enemies: attack the toy, acquire an opportunity

Some enemies should carry conspicuous, physically useful equipment. A mine-layer has a rack that can be torn open, spilling armed mines. A shield tender carries a large reflective panel that becomes loose when its mounting breaks. A coolant carrier vents a moving cold cloud when punctured.

The player chooses whether to kill the ship directly or change the equipment's role in the encounter. A mine-layer behind the pack might be more valuable alive with its rack damaged than immediately exploded. That is a situational decision visible on the ship.

Use a few large, readable components rather than turning every tiny enemy into a subsystem-targeting exercise. Ordinary bullets can break an exposed mounting, while precise attacks or physical leverage offer better control. Equipment damage must affect behavior; a broken launcher cannot keep firing from an invisible replacement.

**Lineage:** material-bearing props and specialist enemies are in the plans. This joins them so enemy design supplies usable objects, not only threats. Connects to I01, I05 and I13.

## Third design thread: the arena should change because of what happened

### I10 — Wrecks with a useful middle life

Between “enemy alive” and “cosmetic debris,” keep a small number of useful states. A dying light ship can briefly coast as a hot body. A destroyed shield carrier can leave its plate. A broken core can remain volatile long enough to shove into the next arriving group.

This gives the player follow-through: shoot, recognize what remains, then exploit it. A heavy shot might launch the dying body through its neighbor. A collector build wants the plate; a chain build wants the core; a web build wants the new anchor.

The useful remnant must visually separate from ordinary debris. Keep only a few meaningful bodies and retire them through salvage, destruction or a readable decay. Do not fill the room with persistent collision junk. Preserve useful authored geometry when cleaning up.

**Connection:** I01 consumes wreck pieces, I06 uses them as network nodes, and I14 rewards acting before an opportunity expires. Builds should compete for different uses of the same remains.

### I11 — Break a route open; move a wall into the next fight

Give selected terrain a changeable structure: a cracked rib can be shot through, a hinged panel can swing, a loose plug can be pulled from a gap, and a supported slab can be dropped into the pursuit.

The important reward is a new route or attack angle, not the destruction animation. A player who knows the room can deliberately cut a shortcut when surrounded. A ricochet player may keep a panel intact because it provides a valuable bank.

Readable joints and fractures should advertise these possibilities. Preserve some immovable landmarks so the arena remains learnable. Destructibility is most useful when different parts have different jobs, not when every rock crumbles into the same confetti.

**Connection:** I07 can reposition the released panel; I03 can use the new surface; I08 can turn an enemy pull into the force that opens the route.

### I12 — Freewheel machines: put momentum somewhere and get it back

A refinery wheel, counterweight or rotating arm is a physical object the player can accelerate. Shoot or sling something into one side; later, its moving arm sweeps the incoming pack. A bank plate mounted on the wheel changes angle as it rotates.

The player is making machinery dangerous, not waiting for a scripted hazard cycle. A heavy projectile spins the wheel differently from a stream of light fire. A web tied to a moving part can drag enemies through the machine's path.

The machine needs inertia, predictable friction and a limited working envelope. It should remain useful after one interaction rather than permanently spinning at maximum speed. Enemies can also disturb it, making its current motion part of reading the fight.

**Connection:** I05 can supply a heavy captured missile, I06 can attach a network, and I11 can release a jammed arm. This develops the plans' moving machinery into a player-powered instrument.

### I13 — Break the boss to build the arena

A large enemy should lose useful physical components. Break off a shield plate and it becomes cover. Detach a launcher and it briefly fires along its tumbling orientation. Sever a cargo carriage and turn it into an obstacle for the boss's own next pass.

The encounter changes from fighting a complete machine to exploiting the pieces of that machine. Damage progress becomes a changing physical situation rather than only a shorter health bar and faster attack cadence.

Give each boss a small number of authored transformations. One might be a tug with dangerous cargo already contemplated in the plans; another could vacuum wreckage toward a furnace, inviting the player to send it a captured volatile payload. Its dangerous attack is also an opportunity.

Some pieces can remain for the next round, letting the player recognize “that is the shield I tore off.” This is a stronger arena memory than a medal on the result screen.

**Connection:** I09 introduces equipment reading on smaller enemies; I10 supplies persistent remnants; I12 lets the resulting room continue doing work.

## Fourth design thread: sustain the appetite for the next move

### I14 — Momentum dividend: a good move helps pay for another

Group destruction should produce a short-lived opportunity to keep moving: a burst of drive charge, cooling, or useful physical salvage. The feedback is immediate—make space, surge through it, scoop the reward and start a new attack.

Use the resources the game already has. Avoid a new stack of currencies, combo bars and mandatory trick grades. Ordinary gun kills must support a viable run; a successful bank, slam or group kill can make the resource return more efficient or spatially convenient.

The reward should encourage advancing through the space you created. It should not require stopping to collect every dot, nor demand reckless pickup collection while almost dead. A reasonable portion arrives reliably; optional surplus can tempt a bolder route.

Cap storage and diminishing repetition where needed so one safe farm does not supply permanent invulnerability. The aim is a rhythm of spending, exploiting and recovering, not a rigid trick-scoring game that punishes a player for shooting normally.

**Connection:** I02 spends movement energy; I01 supplies an alternative way to use the remains; I17 makes the next move spatially different.

### I15 — Buy a change in behavior, then feel it immediately

The rapid Swarm shop should regularly offer a purchase whose effect the player can explain as an action: “the cutter comes back through them,” “my web carries fire,” “I can keep a plate beside me,” or “the wreckage becomes my ammunition.”

Use recognizable branches rather than filling the catalog with dozens of tiny conditional percentages. Preserve the existing full cash armory and the freedom to save for a chosen item; useful suggestions should not replace it with a forced random three-card draft. Foundational gear should stay dependable enough that a player can pursue a build. Wild combinations and rare evolutions can add variation around that foundation.

The next round should offer an early, natural chance to use the purchase. A returning cutter gets a crossing lane; a web gets a connected pack; a scrap collector gets useful wreckage. This is encounter composition, not a frozen tutorial or a guaranteed scripted multikill.

Retain ordinary stat upgrades where they change a felt threshold—more collected plates, a wider capture cone, another useful bank—but show that changed possibility. A purchase should create an intention, not require a spreadsheet.

**Connection:** every other idea needs this path from curiosity to experimentation. This extends the existing fast cash loop rather than replacing it with a new economy.

### I16 — The round remembers your handiwork

Carry a bounded amount of meaningful change between rounds: the broken shortcut, one boss plate, a machine you left turning, or a couple of deployed defenses. Let the player improve a favorite circuit, then introduce enemies that make them reconsider it.

There should be enough continuity to form a personal relationship with the room. In a later attempt the player can try opening a different lane or preserving a different wall. “What should I change this time?” becomes part of the retry appeal.

Avoid making the arena steadily less playable as rubble accumulates. Preserve landmarks, recycle unimportant remains, and make major rebuilds or transformations readable. The player should be able to anticipate the next round from the room they can see.

**Connection:** I11 creates routes, I12 carries momentum, I13 supplies memorable remnants. This is a reason for a fixed arena to remain interesting across many rounds.

### I17 — Pressure with shape: a chase should bend, bunch and break

Think of enemy groups as shapes the player can change. A tail behind the player invites wake cutting. A front with a heavy leading body invites going around or through it. Two crossing streams create a collision opportunity. A small escort wrapped around a volatile carrier offers a tempting center.

Enemy roles should produce these shapes through behavior. A cutter predicts your route; a herder gently pushes its allies toward a lane; a heavy protects one side and leaves an exploitable wake. The crowd must still respond to the actual player rather than perform a pre-recorded formation.

Build breathing room from what the player accomplishes. If a spectacular maneuver clears a side of the room, let that route remain useful briefly. Do not immediately replace the same number of bodies directly in the cleared pocket. Reinforcements can be visibly arriving from another direction.

The end of a round should concentrate remaining threats into an understandable confrontation, not a long search. Keep the first rounds brisk and the later pressure dense; larger crowd-killing builds should face more interesting group arrangements, not only inflated health.

**Connection:** this makes I02, I04, I06 and I14 consistently useful. It develops the diagnosis's pursuit fix into authored encounter variety.

## Fifth design thread: give the game a recognizable sensory personality

### I18 — Choreograph the whole moving image

Imagine a dark, spacious combat field with large readable silhouettes: a bright curling allied stream, a tense web drawn taut, and warm hostile ordnance cutting across both. One ship is flung out of the knot, flashes on contact with rock, breaks into shaped pieces, and the light of its detonation runs back through the group.

The spectacle comes from those large changes in direction, shape and rhythm. More bloom over the same small, widely separated objects cannot substitute for them.

Give each family a recognizable moving form: cutters describe arcs, bank guns draw corners, webs show load, and repulsion opens a rapidly expanding gap in a crowd. Let impact deform the target's presentation briefly while physical force owns displacement. Emphasize important bodies enough that their fate remains legible among many targets.

Use the camera to hold the player, the committed attack and the nearest escape opportunity in a useful composition. Avoid automatic zoom changes that make opponents microscopic at the moment the player needs to read them. Preserve manual control and stable orientation.

Adventure can widen into beauty and quiet; combat can give foreground action stronger contrast without making the whole universe permanently drab. Distinctive industrial forms, materials and silhouettes matter as much as saturated particles.

**Connection:** every proposed toy must be readable in this common image. This is a direction to develop in motion, not a rule requiring a certain count of effects.

### I19 — Let the player hear a chain assembling

A caught missile should strain or rattle. A loaded web should tighten audibly as its force increases. A bank shot needs a distinct contact sound before the redirected hit. Large impacts need a short, forceful attack followed by debris that lets the scene breathe.

When a cascade spreads, organize its sounds into a rising sequence rather than play twenty identical explosions at full volume. Preserve the first decisive crash, imply the small repetitions, and punctuate the largest consequence. The sound should help the player recognize “that setup is working” even while looking at the escape route.

Builds should have different rhythms: the bank gun's chatter and sharp corners, the return cutter's outward and inward sweep, the web's tension followed by release, and the trap's brief arming cue followed by a sudden opening in the crowd.

This requires authored sound and a mix that survives dense play. It also makes quiet moments useful: the room settling after a round should expose the ticking machine or tumbling plate that remains.

**Connection:** I06, I12 and I13 create sustained states worth hearing, not just one-shot events. Accessibility and explicit audio preferences remain part of the design.

### I20 — Show the useful opportunity at the object

The interface should help the player act on the changing room. A caught missile visibly occupies the field; collected plates orbit the ship; a loaded web has recognizable tension; a cracked mounting looks breakable; a returning cutter has a visible route.

Small contextual cues can resolve ambiguity—what can be caught, which plate is held, where a release is aimed—without covering the battle in labels. Reserve persistent HUD space for survival, currently available tools and the round's progress. Do not require the player to read internal physics terms to exploit a toy.

After a striking event, briefly credit the cause in ordinary language and through the reward response. The valuable feedback is that the throw caused the crash and the crash caused the chain. A constant feed of elaborate trick names would become another visual burden.

**Connection:** this supports physical agency already described above. It is not a substitute for implementing the interaction or making it visible.

## Sixth design thread: bring the toys into a world worth owning them in

### I21 — Adventure should offer playful travel before and after combat

A quiet route can still be fun to fly: an anchor chain through a broken station, a gap in a mining lattice, a current that carries loose ice, or a massive freighter whose passage changes the surrounding debris.

These are invitations rather than mandatory timed races. A player can take the safe route, or thread the machinery because their ship is enjoyable and they now own a tool that makes the route possible. The same skills learned in Swarm acquire a sense of place.

Give the views room to work. A narrow, energetic passage opening onto a distant luminous world can make both movement and scale feel better than either uninterrupted clutter or an empty straight cruise.

**Connection:** I03, I07 and the existing Massline all gain peaceful uses. This retains the owner's “sprawling and beautiful” half of the game.

### I22 — Learn to covet a toy by seeing what it does

An enemy in Adventure uses a memorable piece of equipment. The player survives its trick, learns its shape, and gains a lead toward acquiring it. A working capture field on a salvage tug or an unusually destructive web in a pirate ambush can make the eventual upgrade mean something.

Acquisition should connect to that identity. Recover a shield plate from an abandoned carrier, win the trust of an industrial outfit for the winding head, or salvage a rare emitter from a dangerous wreck. Swarm supplies early access to the play style; Adventure supplies an earned relationship with the object and the freedom to take it elsewhere.

Do not require a separate bespoke campaign for every module. Use the existing contract, salvage, seller and research systems to give a few major toys a distinctive route, with ordinary purchasing supporting the rest.

**Connection:** I09 and I13 make equipment memorable before it becomes inventory.

### I23 — Contracts that want your new capability

After acquiring the toy, encounter a situation where it has several plausible uses. Recover an unstable core from a moving debris stream; free a convoy from a physical obstruction; prevent a raider from towing away a valuable hull; carry a fragile object through a firefight behind a Kite Shield.

The goal should be stated in world terms. The game need not demand “perform a web trick.” It should allow guns, towing, diversion or a clever combination, with the world reacting to what actually happens.

This is the long-form reward for having practiced the tool in Swarm. You recognize a possibility that a less equipped pilot would not have. Collateral can create a new story without arbitrarily forbidding the powerful technique.

**Connection:** this joins the existing living-world ambition to the combat toys, rather than surrounding the same dull combat with more dialogue.

## Seventh design thread: the pleasure of landing hits

**Added 10 September 2026 from the owner's clarification:** the desired feeling includes an enemy visibly and audibly taking a blow, damage popping out, occasional exciting critical hits, and the continuous satisfaction of fast arcade/RPG combat. This develops I18–I20; it does not replace those ideas or the earlier mechanical findings.

**Assessment of the current game: pieces exist, but the complete feeling is underdeveloped.** The preceding play review did not establish this as a consistent pleasure, and the current source explains several gaps:

- Damage numbers already appear immediately. Repeated hits on the same hull/layer aggregate within 0.14 seconds. The current normal text is 16 px, shield text 14 px and “big” text 24 px; the big category uses a damage threshold of 25 or a killing flag. A big number is not evidence of a critical-hit mechanic.
- Ordinary hull damage produces local smoke, combustion, fragments and a contact light. Shield breaks and kills receive stronger punctuation. Ordinary armor/hull hit-stop durations are zero. A generalized ship damage-state driver also exists, but persistent hull deterioration is a different job from a sharp reaction to each new hit.
- Positional weak-point bonuses exist for selected larger ship classes, with multipliers around 1.45–1.6 and a weak-point text cue. They are feature-flag gated and geometric. This is useful existing groundwork; it is not a general occasional-crit system for ordinary fighting. No general random-crit resolution or dedicated crit-number classification was found in the inspected damage and floating-text paths.
- Hit audio routing exists, but audio remains muted in the default settings. Its live artistic quality was not assessed in this pass.

This assessment combines the preceding play sample with current source inspection, not a new live audiovisual playtest. Sources: [floating damage text](../../src/ui/floatingText.js), [damage VFX](../../src/render/vfx.js), [hit emphasis](../../src/render/feel.js), [ship deterioration](../../src/render/ships/shipDamage.js), [weak-point definitions](../../src/data/weakPoints.js), [weak-point application](../../src/systems/combat.js), [damage resolution](../../src/combat/damage.js), [audio routing](../../src/audio/audioSystem.js), [defaults](../../src/core/gameState.js).

### I24 — The damage ding: every ordinary hit should feel like contact

An ordinary shot should produce one coordinated response: a sharp flash on the struck enemy, a small directional visual kick, a percussive hit sound, and a number that pops away from that same body. The response starts with contact and settles quickly enough for the next shot to articulate another beat. The player should enjoy landing three ordinary shots before any spectacular physics combination occurs.

**The ship takes the hit.** Briefly light the struck hull or a substantial portion of its silhouette, with a hot contact accent and a short recovery. A slight mesh recoil, tilt or compressed pose can make the blow feel bodily at the gameplay camera. Keep the effect recognizably attached to this enemy, rather than lighting the whole scene or spawning a detached spark somewhere nearby.

Distinguish a visual reaction from gameplay stun. Ordinary bullets can produce crisp visual recoil without repeatedly stopping the enemy's AI, reducing its real mass or moving its collider through terrain. Force weapons still own substantial physical displacement; a heavy body can visibly absorb a blow while resisting the throw. The player must perceive both “I hit it” and “this one is heavy.”

**The number lands with the hit.** Give the first number a brief scale punch, strong contrast and an upward or contact-directed drift that clears the hull. Keep it readable after the target moves or dies. Show actual applied damage; do not inflate numbers for spectacle. A large font should not cover the target's next attack.

Retain short aggregation for pellets and very rapid fire, but animate the accumulating total so subsequent hits visibly register. Do not silently merge a rare crit or shield-break payoff into an ordinary total. Damage numbers, hit shapes and sounds should agree about which event mattered.

**The sound supplies the “ding.”** Give ordinary contact a short, satisfying attack: shield contact can have a taut electrical note, armor a metallic crack, exposed hull a heavier crunch. Modest variation keeps sustained fire from sounding like the same cheap sample repeated. Prioritize the current target and significant hits when many things are happening.

**The gun and the victim share a rhythm.** Muzzle kick, projectile arrival, target reaction and number movement should feel causally joined. A rapid gun becomes a satisfying series of impacts; a heavy gun delivers a distinct single blow. This is not achieved by making all impacts equally bright or loud.

Screen-wide hit-stop is not required on every bullet. Most response belongs to the struck body. Reserve brief global punctuation for selected heavy impacts, breaks and major kills, with repetition control so a beam or chain does not turn continuous flying into constant pauses. Reduced-flash and reduced-motion settings should substitute gentler contrast and pose responses while retaining the information.

**Connection:** I18 gains a concrete contact language, I19 gains the ordinary-hit sound layer, and I20 gains damage information anchored to action. This is foundational feel work, not a reward gated behind an advanced build.

### I25 — Critical hits and earned big blows

Occasional critical hits belong in this game. They can give a rapid volley a surprising accent: ordinary hits chatter across a hull, then one lands with a sharper star-shaped contact, a heavier crunch and a larger, emphatic number. The enemy visibly reacts more strongly and loses the corresponding health.

The important distinction is between **ordinary hits that are already satisfying** and occasional stronger events. Do not make non-crits feel soft so the crit can compensate. Do not use “CRIT” as a decorative label on any number above a fixed threshold.

Develop two compatible sources of that payoff:

- **Occasional weapon crits:** a modest, readable chance of an empowered hit, with equipment that can specialize in it. Preserve the pleasure of an unexpected spike even for a player who is simply aiming well and firing.
- **Earned openings:** exposed weak points, a freshly broken shield, a damaged mounting, or a recent physical slam can create opportunities for an empowered strike. These should be recognizable states with a short useful window, not mandatory tiny targeting dots on every swarmer.

Keep their meanings understandable. A positional weak-point bonus need not be relabeled a lucky crit; both can receive special presentation, with the strongest applicable event owning the main cue. Decide deliberately how bonuses combine instead of accidentally multiplying every inherited projectile, web branch and death blast.

A few build directions make the system more than a damage stat:

- **Fracture rounds:** breaking protection prepares one especially forceful follow-up shot.
- **Execution coils:** earn stronger strikes against a target recently slammed or destabilized, giving ordinary guns a satisfying way to finish a physics setup.
- **Lucky chamber:** occasional empowered shots provide a distinct gun-focused play style without requiring environmental tricks.
- **Feedback capacitor:** a critical hit returns a limited amount of cooling or drive energy, connecting a damage spike to the next maneuver.

Resolve a crit once in the authoritative combat path and carry its identity with the actual damage event. The renderer, text and sound should present that same result. Random crits should use the simulation's seeded randomness. Balance the chance, multiplier and trigger unit for the weapon family so a shotgun's pellets or an extremely rapid beam do not accidentally create a wall of constant “special” hits.

A crit can increase damage without automatically multiplying knockback and stun. Reserve especially dramatic launches for force-oriented variants and appropriate light targets. That keeps heavies physically credible and allows crit gun builds to coexist with concussion and Massline builds.

**Connection:** the existing large-ship weak points are a starting point; I09's equipment, I06's web and I14's resource return create further opportunities. The critical-hit concept is retained as a proposed expansion, not claimed implemented.

### I26 — Hurt, break, launch, finish: the fast RPG combat rhythm

The broader feeling is a sequence of small and large payoffs while the player keeps moving. Ordinary shots visibly chew into protection; a shield snaps; an exposed hull recoils; a strong strike or slam produces a larger response; the enemy breaks apart and releases useful rewards. These events should overlap into a lively fight rather than require a prescribed combo sequence.

Different enemies should tell different short stories. A light swarmer may die after a few clean hits, with a sharp pop and a small spray of rewards. A protected fighter offers a satisfying break before the finish. A heavy shows a mounting fail, a plate separate or a drive become unstable while retaining its mass. Long, identical health bars on every target would flatten this rhythm.

Borrow the sense of accumulating vulnerability from the owner's fighting-game reference where it suits the physics. Damage can disrupt stabilizers, expose an engine or weaken a component so that a later shove becomes harder to recover from. Do not silently reduce every enemy's physical mass as its health falls, and do not make every near-dead target an uncontrollable ragdoll. The change should be visible, causal and appropriate to that enemy.

Give fast fire some rhythmic variation without requiring constant button changes: bright ordinary contact beats, occasional crit accents, the distinct crack of protection breaking, then the heavier finish. A web catching several ships should make the gun volley feel even better because the player can watch damage travel through the trapped group.

Damage over time and secondary chains need their own quieter visual and audio treatment so they do not compete equally with aimed hits. Finishers deserve clearer punctuation, but a dozen simultaneous small kills should read as one satisfying cascade rather than twelve global freezes and twelve overlapping labels.

Progression should make the rhythm evolve. More rounds, a returned cutter, a larger crit, a second target pierced or a web pulse spreading all change what the player sees and hears while fighting. The basic shot must already feel good in the first encounter. Adventure should not make the player grind to unlock convincing hit feedback.

**A concrete imagined beat:** your stream lands several bright pings across a pursuer, a larger crit number kicks out as its shield tears, and a concussion hit sends the exposed hull sideways. It strikes the rock, bursts, and catches the next two enemies; their damage numbers rise through the debris as you boost through the resulting gap. The ordinary pings are pleasurable, the crit is exciting, and the physical follow-through is the distinctive SpaceFace payoff.

**Connection:** this binds I24–I25 to the earlier crowd, web, wreckage, sound and reward ideas. A successful implementation should make a short ordinary fight satisfying as well as the advanced combination. No special showcase or expensive capture routine is required to ask whether the hits actually feel good.

## Combinations worth developing into complete play experiences

These are current creative preferences, not a new ranked replacement for the diagnosis or the other ideas.

**The Scrapyard Comet — I01 + I03 + I10 + I14.** You kill the front of the pack, gather a few surviving plates, skim an asteroid to reverse course, and fling the halo through the middle. The collision burst pays for the boost that takes you through the opening. The next wrecks start rebuilding your protection. The distinctive silhouette is a fast ship dragging an increasingly dangerous collection of objects.

**The Wire Artist — I02 + I06 + I08 + I17.** You draw the pursuit into a curved wake, bind the crowded section, and feed a stream through the moving strands. A hostile harpoon adds an unwanted loaded direction; you exploit or cut it while steering the group into terrain. The satisfaction is watching a layout you created become a temporary machine.

**The Demolition Courier — I05 + I09 + I11 + I12.** You catch a heavy missile, use a newly opened shortcut, and deposit it into a machine as the pack reaches the other side. Its impact starts the wheel moving, which sweeps loose mines from a damaged rack into the pursuers. Success produces a different room, not just fewer enemies.

**The Mirror Gunship — I04 + I07 + I13.** You carry a bank plate, fire through a forward approach while redirecting another stream behind you, and use your movement to aim a returning cutter. Breaking a boss's shielding supplies a larger, riskier plate. It is a slower build with strong spatial control, proving that “fast-paced game” need not mean every hull has the same speed.

Each should work as a recognizable build before combining everything. The game becomes richer when two ingredients interact naturally; it becomes confusing when one purchase automatically does six unrelated things.

## How this grows from the retained diagnosis

| Retained finding | Creative consequence developed here |
|---|---|
| Rock rejects banks; bank stream is sparse | I04 and I07 create return paths and player-positioned bank surfaces; I18 makes the path legible. Common asteroid banking still needs the original repair. |
| Flyby enemies disperse the crowd | I17 gives sustained pursuit different useful shapes; I02 and I06 turn those shapes into player-authored attacks. |
| Active flight brakes earned momentum | I03 makes retained momentum a terrain technique; I01 and I04 let movement aim a second attack. |
| Death chains are weak and narrowly gated | I10 adds useful wreck states; I01, I09 and I13 make destruction supply physical opportunities as well as damage. |
| Current web is a short physical chain | I06 develops a moving attack network; the already-planned hub and Capstan remain important and are not replaced. |
| Terrain lacks reliably useful relationships | I11, I12 and I16 create routes, powered machinery and continuity between rounds. |
| Weak urgency and sensory feedback | I14 and I17 shape spending and recovery; I18–I20 make the resulting physical situation readable; I24–I26 develop ordinary hit pleasure, critical strikes and the hurt-to-finish rhythm. |
| Adventure should reward earning the same toys | I21–I23 give movement, equipment acquisition and contracts a direct relationship to those toys. |

The broad prerequisite is a small set of trustworthy shared interactions: reflect, attach, release, conduct, displace, fracture and collect. A property should keep its meaning across a projectile, a loose part, an enemy component and an arena prop. Build these through the existing physics/combat owners; do not create a second miniature simulation for every weapon.

Keep computational work proportional to the useful bodies and interactions. A few large gameplay wreck pieces can coexist with abundant cosmetic fragments. A bounded web can still read as a large captured group. Bigger crowds need simpler common behavior and spatial queries. These are implementation problems to solve in service of the desired scale, not reasons to preemptively remove it.

## Design tensions to preserve for later passes

- **Power versus urgency:** a spectacular group kill should actually clear space. Pressure should rebuild visibly, not cancel the achievement immediately.
- **Physics versus control:** outcomes should follow mass and geometry, while aiming assistance and readable release previews make those rules usable at speed.
- **Rich combinations versus overload:** add shared interactions and distinct build choices; avoid assigning a new key, meter and currency to every idea.
- **Persistent destruction versus a usable room:** keep meaningful changes and landmarks; retire clutter. More persistence is not automatically more fun.
- **Spectacle versus legibility:** the player should be able to follow the spectacular event. More simultaneous brightness is not a substitute for shape, motion or sound.
- **Swarm generosity versus Adventure earning:** rapid access and experimentation in one mode, meaningful acquisition in the other, with consistent toy behavior and an enjoyable baseline in both.

These are productive tradeoffs to investigate, not reasons to flatten the game into safe generic compromises.

## Development record

**10 September 2026 — initial creative expansion.** Preserved all ten mechanical findings and added I01–I23. Recovered five supporting observations from the earlier report as R01–R05 in the diagnosis, retaining their original scope and evidence limits. Retained and developed existing plan seeds rather than presenting Wake Cutter, returning shots, orbiting debris, physical materials or hub webs as newly invented ideas. Added four combined build experiences and connected them to the diagnosis.

**10 September 2026 — hit feel and fast RPG combat.** Added I24–I26 in response to the owner's damage-ding, flash, damage-number and occasional-crit description. Inspected current hit presentation, floating text, damage resolution, large-ship weak points and default audio. Kept existing ingredients distinct from the proposed complete sensation; added coordinated ordinary-hit feedback, critical/earned strike opportunities and the broader damage-break-launch-finish rhythm. All earlier ideas and findings remain.

**Questions for the next creative pass:** Which enemy or arena response makes each combination surprising a second time? What playful interaction is missing from the weaker build styles? What would make a quiet Adventure route memorable with the same tools? Answer these by extending the relevant entries and adding new connections. If play disproves an idea, record the specific failure and revise it; do not erase the rest of the investigation.

Primary design sources: [VISION](../VISION.md), [Crucible master plan](CRUCIBLE_SURVIVAL_MASTER_PLAN.md), [physical-play grammar](../PHYSICAL_PLAY_GRAMMAR.md), [mechanical diagnosis](CRUCIBLE_ARCADE_POSTMORTEM.md). The existing [attack-trait catalog](../../src/data/attackTraits.js) supplies some adjacent building blocks; it does not establish that the composite experiences above are implemented.
