# 01 — The user's own words (highest-fidelity source)

> Source: `ORIGINALS/SpaceFace_Dev_Plans.txt` (~106 KB, ~2,142 lines, 4 AI turns +
> 3 user turns). This file quotes the user **verbatim** with line numbers.
>
> **Why this file exists:** the user explicitly worried that "descriptions from the
> agent's responses or deliverables may have lost some nuance" from the long planning
> conversation. The user's own words are the authority for intent. Where a design
> package says X and the user said Y in a more vivid or specific way, **Y wins for
> intent**. Live code and the user's *current* direction still outrank both.
>
> Line numbers refer to `SpaceFace_Dev_Plans.txt`. Speaker tags: the AI is `Codex:`,
> the user's turns begin with `User:`.

---

## A. Conversation shape (so you can navigate the original)

| Lines | Speaker | Topic |
|---|---|---|
| 1–404 | Codex | Opening manifesto: "World Site layer," 10 interaction verbs, 6 content categories, sector archetypes, automation-as-narrative, 3 first builds (Wreck Cathedral, transforming industrial claim, recomposed sector). |
| **412–604** | **User** | **The decisive pushback.** "The game mechanics don't support that." Describes the actual broken state. Praises massline, savages the G/trackpad mode. Asks "revenue streams for what?" Demands physics weapons, GTA-in-space, planet slingshots, anti-cartoon image gen, and *documents to pilfer for ideas*. |
| 609–803 | Codex | Delivers the Depth Playbook. Concedes the Wreck Cathedral should NOT be first. Gives the corrected dependency chain. |
| **809–815** | **User** | Short gravity brainstorm: "what additional gravity/physics features could we add?" Proposes dark-matter/neutron-star balls, gravity minigame. |
| 820–1644 | Codex | Massive gravity response: distinguishes massline/impulse/gravity/mass-manipulation; Gravity Ride minigame; Mass Seed; gravity weapons; alternative masslines; planetary activities. |
| **1650–1895** | **User** | **Long refinement.** "Take artistic liberties with the physics." 3-signal targeting. Slingshot-chain fantasy (red/green gradient). Massline on Space bar. Meteor hitchhiking. Gravity blast / anti-gravity cone / anti-gravity bomb. "Every weapon should knock back." Emergent play styles. Alternative masslines. Atmospheric skimming (reverses himself mid-message). GTA-in-space. Expendable swarm enemies. Warns about over-ambition. Asks for a detailed dev-format breakdown. |
| 1899–2140 | Codex | Delivers the Gravity & Massline Expansion Package. Central UVP: "assisted relational physics." |

---

## B. The load-bearing quotes (verbatim, with line numbers)

These are the statements that shape intent most. Preserve them; do not paraphrase.

### B1. The decisive pushback — the actual game can't yet do the vision (L412–418)

> **L412–414:** "yeah but the game mechanics just don't really support a lot of that, and that may be an area that we have to work on / because you can't really 'fly through the split hull' when right now you can float straight through a station's walls like it's vapor, there may be a spherical core that is solid, but it's completely unrelated to the shape of the actual station"

> **L414–415:** "I think there's some thing where I have to dock in a certain part, but it just means mozying around into and out of the walls of it and bonking the core until I am in the right area"

> **L416:** "It's a top-down game and I fly with the arrow keys, idk what it would even look like to cut braces with a mining beam"

> **L417–418:** "right now LMD pew-pews little bullets in a steady stream like gallaga, RMB shoots a janky HTML-bloom 'laser' (the kind that is just a slightly-opaque reddish tube inside of a slightly less opaque reddish tube and they both enlarge and get bigger slightly, so it 'pulses') and I shoot it at asteroids and it goes '+1 Iron Ore' every once in a while / that's about it"

**Why it matters:** Every later design doc is a response to this. The "compound collision
proxxies → targetable components → contextual operations" dependency chain exists
*because* of this quote. If a build step skips that chain and goes straight to a
hero site, it is repeating the original mistake.

### B2. The massline — what works, what's broken, the assist the user keeps pushing for (L421–447)

> **L421:** "I've been trying to get the agents to build a sort of system where when I am tethered to something and I hold the forward and left/right buttons it sort of detects that I'm trying to spin and keeps my left/right turning speed perfect to maintain perfect angular inertia and taughtness on the tether, because right now I either turn too fast or too slow"

> **L423:** "so it automatically maintains the perfect turning speed because what else could I possibly be trying to do holding these 2 buttons tethered to something besides spin and slingshot off of it)"

> **L427:** "right now the combat is kind of weak: pew-pew the enemy with LMB, maybe tether them first with F / that's about it"

> **L447:** "the massline is the closest but there's a very finite set of things you can do practically 'spin>>launch' and 'tether>>shoot' and the rest is totally inhibitory: do anything else with the massline and you're just stuck to something"

**Why it matters:** The user has been asking for **orbit assist** in his own words since
the first turn. The design package formalized it; the build plan puts it at SF-05. This
is the single most-confirmed user intent in the whole corpus.

### B3. The failed G/trackpad dogfight mode — chronic, user-owned uncertainty (L431–437)

> **L431–432:** "like, I was trying to make a dogfight combat flight system, because it was hard to hit the enemy, so maybe when I press G it would auto-target and all I have to do is shoot, and then the trackpad would steer the ship, so I could zip around / but that's been a mess, it's still broken"

> **L433:** "it was like 'ship flies towards the cursor' and that sucked"

> **L434–435:** "the agent made it (when I suggested a more joystick-like control) more like 'there's an incomprehensible arrow that comes out of the ship, and the trackpad controls the direction of the arrow, but the ship just flails around totally randomly in no relation to the direction of the arrow' / I think in that case it made like a right arrow turn right, and keep turning right, like spin right until the arrow is left and then spin left, and if the arrow is forward thrust, or something. It was a complete mess, my ship would just spin and flail randomly and sometimes thrust off"

> **L437:** "I shopped an idea where maybe I draw a path with my cursor and it would follow that path, so maybe I'd have more control and I would learn to create these gesture movements (which was the whole point of the mode in the first place)"

**Why it matters:** SF-07 ("Replace Flailing Gesture Flight with Target-Relative Dogfight
Control") exists because of this. The user is genuinely uncertain whether trackpad
dogfight is even possible; the design doc offers two alternatives (target-relative slot
controller, command-curve pure-pursuit). **A reviewer should not assume either is
correct — this is the single biggest open control decision.** The user flies with
**a trackpad**, not a joystick.

### B4. The "sameness" diagnosis — the user's own framing of the core problem (L439–440)

> **L439–440:** "The biggest things I'm noticing are the 'sameness' of the world visually, and the 'sameness' of the experience gameplay-wise, which comes from the primitives not really lending themselves to complex combination in clever ways. The physics massline stuff maybe could do that, but 'pew-pew=damage' isn't really creative, you hold the button until they're dead / the 'W goes forward' dynamic isn't new or fun / the 'press E to bring up a screen' isn't really fun"

**Why it matters:** This is the *actual product thesis* in the user's voice. Two
samenesses: **world sameness** (sectors look/feel the same) and **verb sameness**
(hold-button interactions). Every design doc is an attack on one or both.

### B5. "Revenue streams for what?" — the motivational vacuum (L443–453)

> **L443–445:** "I'm trying to get the mining/drilling minigame activated when the massline is hooked to an asteroid with 'B' to be more in-depth and strategic of a minigame with automation and revenue streams, but revenue streams for what? / A higher damage 'pew-pew' gun? the enemy dies quicker with less 'pew-pews' total? / That's not really a motivator"

> **L452–453:** "as far as the mining>>drones>>storage>>process>>fabricate>>expand>>production thing, yeah I'm working towards it but again: Why? / What's the end goal? to get a better pew-pew out of the deal?"

**Why it matters:** The automation/progression docs (SF-24, SF-25, SF-26, and depth
Stage 0–6) only succeed if they answer this. The design package's answer (which you
should preserve): industry builds **new verbs and physical capabilities** — massline
heads, physics weapons, deployables, route infrastructure, station assembly, gravity
anchors — **not bigger numbers**. If a build step's reward is "+X% yield," it fails
this test.

### B6. Physics weapons and environment use — the user's own proposals (L455–459)

> **L455–456:** "maybe if there was different guns that I could aim with the cursor that'd blow up at that point and do some physics thing with the ships, I've thought maybe making guns that affect the enemy physically in different ways, like make an explosion like a grenade gun and blast the enemies out in different directions / but that's only cool if they're not just flying out into space and coming back, or just getting lost out there"

> **L457–458:** "it'd maybe be better if there was more structures and asteroids for them to get dashed against / and then I could research or buy different kinds of weapons... especially if I didn't take physics damage and I could blast myself off in different directions with them or with bombs I drop behind me or something"

> **L459:** "it's possible that maybe I'd want to research or buy different kinds of masslines too, maybe one that lets me move them with the cursor, so I could fling things at will with the mouse"

**Why it matters:** This is the user inventing (a) physics weapons, (b) environment-as-
weapon (enemies dashed against terrain), (c) player immunity to physics damage +
blast-self-off mobility, (d) bombs-dropped-behind for propulsion, (e) cursor-fling
massline. The design package formalized all five.

### B7. Planets, gravity, GTA-in-space, alive universe (L463–482)

> **L463:** "there really should be more things going on in this universe, besides me, making it feel alive, there should be a lot of world going on outside of what I'm doing that I'm just a part of that I could find ways to interact with"

> **L463 (GTA framing — recurring pillar):** "like caravans with security that I could rob if I wanted, like GTA in space would be a cool selling point"

> **L479–480:** "especially if the planets were colossal and actually had gravity and things orbited realistically... I can see it being cool to actually do gravity slingshots off of things like planets, especially if there was a way to chain them together and fling from planet to planet to planet in ways that'd actually get me places faster, but the mechanics of how I'd make that happen in this game makes my head hurt / but also being able to knock enemies to near the planet and they get sucked in and they burn up in the atmosphere horribly, that'd be cool if it were animated right."

> **L482:** "but maybe having personality by real things happening, not just 'these guys are pirates because the HUD says they're pirates', all the NPCs look and act the same, there's no scripted movements at all"

**Why it matters:** "GTA in space" is a **declared UVP pillar** (reaffirmed L1704).
"Atmosphere burns enemies horribly, animated right" is the seed of SF-14's reentry
vertical slice. "NPCs all look and act the same" is the seed of SF-15 NPC jobs and
SF-31 visual families.

### B8. Sector sameness — the vivid description (L587)

> **L587:** "the sectors are largely the same, idk what we'd need to make those happen, probably some more models and also some skins so we have primitives to mix and still feel fresh... right now it's a cluster of things, and it feels like the agents that made it thought it'd be a loading screen between sector-levels and I forced it to be open-world and now they're like just bolted together with a giant mass of empty space behind them, and it all connects a sector that's 99% empty and then a cluster of station+asteroids+npcs+enemies in the middle, all kind of the same"

**Why it matters:** This is the lived experience the SF-21 "recompose one sector into
activity pockets" prompt is trying to fix. Note the user already diagnosed the cause:
"loading screen bolted into open world." A reviewer should confirm the live repo no
longer matches this before treating it as current.

### B9. The 1950s-cartoon image-gen failure (L589)

> **L589:** "they seem like they're really prone to making the images cartoony, like I had them make character headshots for the bar in the stations when you talk to people and 100% of the time they made them cartoony like the cover of a 1950s sci fi novel drawing"

**Why it matters:** This drives the elaborate anti-cartoon image discipline in
depth-playbook 06 and the prompting glossary. The bar character portraits are the
specific recurring failure. Any image-pipeline build step must demonstrably avoid
this — not just assert "photorealistic" in a prompt.

### B10. What the user wants FROM the deliverable — the spec (L591–604)

> **L591–592:** "Ultimately what I need to get is a long and detailed sort of ideas or building plan, and the failure modes that I get from this a lot is overambitious ideas... ok fine good idea but how?... Agents can't do everything, and a lot of things they wouldn't be able to do very easily or well, or it'd be likely to screw up"

> **L595–598:** "regardless though, I do need to get a long list of ideas maybe even in the form of descriptions or something of the type of game aspects / What I need is some documents I can save that I can systematically pilfer for ideas to keep my agents churning away / If they're detailed enough that I don't have to explain it again, I can paste one section in to another thread on Pro mode and it'll expound upon it, I drop that into a claude code session, and I have the result a little while later"

> **L600–601:** "it might be obvious to me that we need more things in this game... but the agents don't seem to be able to tell what's obvious and what's not, like the wreckage system, they'd do all that just to make the wreckage a glowing ball I RMB and such iron ore out of / So I need it to be detailed enough in each section to actually be able to get it through to them what it is and how they should be making it"

> **L603–604 (the agent failure-mode diagnosis — CRITICAL):** "I'm also know really knowledgable with the frontend techniques and physics techniques and everything in between enough in game dev to use the right words when I prompt, so it's keeping the work from coming out nearly as advanced-looking as a lot of the vibe-coding demos I'm seeing online, those people are devs and know the words to use to signal quality and advanced techniques, and when I say 'use advanced techniques' well, a human would know what that means, but a failure mode of LLM agents is they'll take that vagueness as a license to quit early / they do the absolute minimum required to technically satisfy the requirement in the loosest of interpretations"

**Why it matters:** This is the **root cause of every anti-slop / anti-placeholder /
"forbidden shortcuts" clause** in the build plan. The user has directly experienced
agents satisfying the letter while violating the spirit. Your build steps must be
specific enough that "the absolute minimum technically-satisfying interpretation"
still produces the right thing. Vague verbs like "make it polished" or "use advanced
techniques" must be replaced with named techniques + observable behavior + forbidden
shortcut + evidence (the prompting glossary's core pattern).

### B11. Artistic liberties vs strict physics — a direct correction of Codex (L1650–1652)

> **L1650 (CRITICAL — user rejecting physics-purity framing):** "I think for the sake of gameplay it'd probably be a better direction to take artistic liberties with the physics. It might be fun to have a sort of in-game puzzle of slingshotting off of planets or gravitational bodies of some sort. It doesn't need to be gravity that does so, it could be massline physics that do it"

> **L1652 (the Spider-Man framing — vivid, load-bearing):** "detach flying off (doesn't require real gravitational physics, simply flinging off planets like spiderman is fun enough, maybe some gravitational pull that means it's optimal not to get too close, or maybe the 'gravity' is ostensibly what makes me orbit/spin so perfectly around the thing)"

**Why it matters:** The design agent had just spent a long turn on physics purity
(why a stationary well can't give permanent speed). The user waved it off. The UVP
became **"assisted relational physics — because it is fun, not because the cable
equation survives peer review."** A naive summary might re-flatten this to "implement
realistic gravity" — the user explicitly did NOT want that. The constraint is
**coherence** (preview physics == gameplay physics; no invisible teleports; visual
shape == collision shape), not realism.

### B12. The 3-signal targeting system — the user's own design (L1650)

> **L1650:** "the problem being aim, right now one has to aim at the thing to tether to it, it won't be easily coordinated aiming at something and hitting F and holding thrust+left/right to spin around it, and boost with Shift, and F to release, just to aim again with the trackpad. That would be too hard, there would have to be some way that the game knows what you're trying to tether to. Tethering simply the closest thing is one approach, but that might have failure modes if there's a lot of things around."

> **L1650 (the 3 signals, fully specified by user):** "so a function that prefers the closer thing, and a function that prefers the thing in the direction I'm turning towards, and a function that prefers the thing that's closest to the center of my cursor, so there would be a sort of priority-targeting that would be balancing these 3 things (closeness to me, direction of my arrow key or direction key, closeness to the center of my cursor) to maximize the chances of me tethering the thing I want to tether"

> **L1650 (intent-detection philosophy — load-bearing):** "The proper massline gameplay would require that there be systems like that, that maximize the likelihood of tethering the desired thing, by being designed around the things I'd likely be doing, detecting what I'm trying to do, and assisting it"

**Why it matters:** SF-03 (Intent-Aware Tether Acquisition) is the user's own design,
formalized. The user's 3 signals are: **(1) closeness to ship, (2) turn-key direction,
(3) cursor center**. The design package expanded this to ~8 weighted signals (adds
forward-trajectory relevance, relative mass, current route, combat focus, candidate
memory/hysteresis). A reviewer should confirm the 3 user-named signals are the
highest-weighted and that the expansion doesn't dilute them.

### B13. The slingshot-chain fantasy — the red/green gradient, the camera (L1656)

> **L1656:** "I can however see it being fun to have some situation where I'm tethered and spinning and boosting around a planet that I gather speed more and more, the camera zooms out the faster I'm going (that should probably happen to some extent regardless) and maybe either there's some predetermined order of planets that are logged in the game or I would select a line of planets I would slingshot off of and the screen would have a sort of red gradient that would show around the edges of the screen that means 'don't release now' and when I get in the section of the orbit that I should release it starts turning green and then flicks red again when I lose my chance and I time it just right when it's about to turn red again, release and fly to the next slingshot tether place and then do it again"

**Why it matters:** This is SF-06 (Shared Release Predictor + Validated Sling Course +
Speed-Language Presentation) verbatim from the user. Three load-bearing specifics:
**(1) camera zooms out with speed (should happen "regardless"), (2) screen-edge
red→green→red release-timing gradient, (3) time the release "just right when it's
about to turn red again."** The design package preserved all three. A reviewer should
confirm the build step preserves the screen-edge vignette specifically (it's an
accessibility concern — red/green alone is forbidden, so shape/pulse differences must
accompany it).

### B14. Tether button placement — Space bar (L1663–1664)

> **L1663–1664:** "There's also the issue of how does someone hit the 'right' button 'currently D' and hit the tether button 'currently F' at the same time to trigger that? / it's possible tether might have to be upgraded to a more central feature and be triggered with the thumb with the space bar"

**Why it matters:** SF-04 (Massline Input Grammar) must resolve this. The design
package recommends Spacebar (thumb-accessible) with F as alias/legacy, but softens it
to "rebindable." This is also a **locked input contract** issue — `src/systems/input.js`
is Lead-only-edit per repo rules. A build step here needs lead coordination.

### B15. Meteor-express hitchhiking (L1668)

> **L1668:** "Tethering a passing meteorite would also be a possible way of hitching a ride to another sector if it was fast enough, maybe those would have a trajectory where they're fairly slow in some regions but they're on a course to fling off of planets that are themselves moving in a useful formation, achieving much much faster speeds, so that'd be a cool ride to shoot past planets flinging off of them past enemy bases too fast to catch, maybe drop a bomb on them or something on the way"

**Why it matters:** This is the seed of the "Meteor Express" + Frame Coupler
hitchhiking concept (SF-16 and gravity package Brief 11). Note: **the user's version
has the meteor itself slingshot off moving planets** — a chained multi-body dynamic
that the design package simplified. Preserve the user's richer version as the target
fantasy even if the first vertical slice is simpler.

### B16. Gravity / anti-gravity weapons — user proposals (L1672–1678)

> **L1672:** "The mass seed is probably something that'd be useful I can see, shooting it out to suck all the enemies into a small area and then shooting a torpedo at them or something"

> **L1675:** "Also perhaps having a gravity blast or something I could set off that'd blast enemies away from me could be useful in getting away, or a forward facing cone of anti-gravity that'd knock objects and enemies out of my way would be useful in getting out of asteroid fields or debris fields"

> **L1678:** "An anti-gravity bomb that blows enemies away from an area I shoot it to, and they'd get dashed on nearby asteroids or sucked into planet gravitational fields or something"

**Why it matters:** User-originated: Mass Seed (suck enemies in), gravity blast (radial
push away), forward anti-gravity cone (clear debris), anti-gravity bomb (placed AoE
push, environment payoff). The design package mapped these to Mass Seed Well mode,
Repulsor Seed, Directional Gravity Cone, Vector Mine respectively.

### B17. VFX quality — load-bearing complaint (L1680–1681)

> **L1680–1681:** "Also each of these things would all need a really attractive VFX, and right now the VFX is fairly simplistic and nintendo 64ish / it would need to be upgraded graphically to really feel like a real game and I don't know the exact words, techniques, and software I have to ask the agents to create in order to make that happen"

**Why it matters:** This is why the VFX technical direction (gravity package doc 05)
and the prompting glossary exist. "Nintendo 64ish" is the user's bar for the current
state. The user explicitly does NOT know the technique names — your build steps must
supply them (instanced particles, shader ribbons, SDF rings, distortion buffers,
depth-aware soft particles, mesh shockwaves, pooled lights — see digest §2.E).

### B18. Every weapon should knock back — a clear preference (L1686)

> **L1686:** "it's probably likely that we should make every weapon in this game knock back enemies at least a little bit, maybe not the beginning or basic cannon or maybe the beginning starter cannon is just so weak you barely notice it, but it would make sense that the physics effects of the weapons would be the more attractive part of the game, every gun works a little differently, maybe some guns don't do a lot of damage but knock the hell out of the enemies and I can basically shoot it as much as I want could be a preferred weapon, using the environment more against enemies"

**Why it matters:** SF-09 (Universal Weapon Impulse and Collision-Consequence Kernel)
exists because of this. Every weapon gets an `impulsePerHit`. The starter cannon is
explicitly exempted (so weak you barely notice). Some weapons are explicitly
"low-damage, high-knockback."

### B19. Emergent play styles — design philosophy, verbatim (L1688)

> **L1688:** "The fun in a lot of games comes from finding preferred playing styles that aren't really just chosen on a customization screen explicitly, but arise from the players creativity in the game universe utilizing game mechanics"

**Why it matters:** This is the design philosophy that justifies "setup/payoff" combat,
the gravity-weapon combinations, and the alternative massline heads. The game should
**not** present a class-selection screen; styles should emerge from tool combinations.
A build step that adds an explicit "class" or "loadout menu" violates this.

### B20. Alternative masslines — user's own framing (L1690–1696)

> **L1690:** "The microfiliment one could lend more combat verbs but controlling it might be confusing, I guess I can target where it flings (right now it hard-targets specifically at an enemy, the massline does, if it didn't it'd be hard to target at all, but maybe some types are free-target) with the cursor, maybe somewhere between targeting and turning and dragging the other end I could direct it in ways that'd do something"

> **L1692 (dragnet — user's own idea):** "also maybe even a massline dragnet might be an alright idea, where I can drop a net behind me and it spreads and grabs anything that falls into it, and I'd probably have to have a big ship for that, but it could be kind of fun and destructive to gobble up enemies and drag them into a planet and release them when they're past the point of no return"

> **L1694 (twin bridle — USER'S REFRAMING, differs from Codex's):** "The twin bridle can be cool, attaching a massline to one thing and the next F shoots a massline to something else, tethering them together, making them spin out of control, that sounds like it'd be more interesting than tethering myself between 2 things, somehow targeting them both simultaneously and getting something from both that I couldn't get from one"

> **L1696 (combine-verbs plea — load-bearing design directive):** "Shooting a horizontal line out too as a weapon that'd wrap around whatever it hits would also be kind of fun, idk if there's maybe some optimal ways to combine more of these gameplay verbs into more concentrated primitives instead of all different weapons"

**Why it matters — twin bridle especially:** The user's twin bridle is **object-to-object**
(tether two world bodies together, watch them spin). Codex's original was ship-between-
two-anchors. Codex corrected in the package response (L2045). **A reviewer must
confirm the build step implements the user's object-to-object version, not the
ship-between-two version.** SF-29 (Twin Bridle World-to-World Tether) gets this right
by name; double-check the prompt body does too.

The "combine verbs into concentrated primitives" plea (L1696) is the design directive
behind "one input grammar, many heads" and "shape input not outcome." Preserve it.

### B21. Atmospheric skimming — the user changed his mind mid-message (L1698–1700)

> **L1698:** "atmospheric skimming might be an alright sort of mini-idea, where I can drag some sort of thing to collect the atmosphere as a resource so tethering to a planet and drawing myself in would allow me to get to the best place to do so in the atmosphere while I spin, and the distance covered combined with the atmospheric density at that place would determine how quickly I get the resource, while also avoiding being sucked into their gravity and crashing, so it's combining primitives"

> **L1700 (the gap that MUST be filled):** "so maybe atmosphere isn't such a bad idea after all. But that all implies that I'd need to have a function to lengthen the massline instead of just reel it in (right now holding F reels it in, nothing extends it)"

**Why it matters:** Two nuances a summary would lose: **(1)** earlier in the same
message (L1655) the user was skeptical of atmosphere; he reversed conditionally —
*only if* it combines the massline-spin primitive. **(2)** The user spotted a missing
primitive: **line pay-OUT** (the massline currently only reels in). SF-04 must add
pay-out. The build plan includes this (SF-04 title explicitly: "Reel, Pay-Out, and
Cut"). Confirm it.

### B22. GTA-in-space as a declared UVP pillar (L1704)

> **L1704:** "I like the idea of differentiating the game as a sort of GTA-in-space crime game, that hasn't really been done much, so heists and things are a cool area to explore"

**Why it matters:** This is a **product positioning** statement, not just a feature
request. Heists (SF-16), crime loops, caravan robbery, cargo theft, heat/pursuit/
laundering — these are load-bearing for the game's identity, not optional flavor.

### B23. Enemy design — expendable swarm for twitchy-fun (L1706)

> **L1706:** "All of these things would likely be the best if enemies are really expendable and easily killed instead of now being kind of difficult and requiring a lot of shooting, maybe ship-fights-the-swarm kind of gameplay could make it twitchy-fun with gravity and physics-based attacks more often and cooler guns"

**Why it matters:** Current enemies are "kind of difficult and require a lot of
shooting." The user wants **expendable swarm enemies** so physics combat happens often.
This affects every combat build step (SF-09, SF-10, SF-13, SF-14, SF-28): enemies
should be light, die to setup-payoff, not be HP sponges. The design package's enemy
tiers (light/medium/heavy/boss) make light the dominant tier. A reviewer should
confirm the live enemy balance reflects this.

### B24. Restraint warning — correcting Codex's over-ambition (L1851)

> **L1851:** "are good, some of the ideas are a lot of work for minimal benefit, sometimes a little too complex and just doing too much, but it could lend the game variety if it were done with a measure of restraint"

**Why it matters:** The user is explicitly warning against feature creep. The depth
docs and gravity package contain **a lot** of ideas (10 physics weapons, 8 massline
heads, 6 sector archetypes, 9 mission templates, black holes, Lagrange nodes, etc.).
The build plan correctly gates most of these behind "first prove one." A reviewer
should resist scope expansion in the corrected build steps — when in doubt, cut.

### B25. The format the user wants — final spec, load-bearing (L1891–1895)

> **L1891–1892:** "I think that refines maybe what the plans could be and I need to get from you a sort of detailed breakdown of the ideas and directions we're trying to build in, from a dev point of view, also explaining examples of why and how / Agents do their best work when it's like 'here's the problem, here's what it causes, this is why it's bad, here's the proposed solution, here's the general direction of how you should do it' so they have context to work with and understand the point so they don't drift assuming"

> **L1895:** "THat's ultimately what I need is the sort of 'this is why it's cool, here's what you could do with it' and then the 'here's how you'd do it and what it'd look like' and all that kind of planning"

**Why it matters:** This defines the **format your build steps should take.** Each
concrete step should read as: *problem → consequence → why it's bad → proposed
solution → general direction of how → what it looks like.* This is exactly the
format the SF-XX prompts already use (they have `<problem>`, `<consequences>`,
`<why_this_is_cool>`, `<implementation_direction>`, `<player_observable_checkpoint>`
sections). Your corrected build steps should preserve this shape.

---

## C. Distinct ideas the user personally proposed (vs accepted from the AI)

Filtered to user-originated items (the user said it first, in their own voice):

1. **Orbit-assist controller** (L421, L423, L1661) — detect spin intent, maintain perfect angular velocity/tautness.
2. **3-signal priority targeting** (L1650) — closeness + turn-direction + cursor-center.
3. **Mass Seed origin** (L810) — "balls of dark matter or neutron star chunks with a lot of gravity I could swing off of."
4. **Gravity-slingshot obstacle-course minigame** (L813, L1656).
5. **Slingshot-chain release-timing UI** (L1656) — screen-edge red→green→red.
6. **Camera zoom-out with speed** (L1656) — "should happen regardless."
7. **Meteor-express hitchhiking** (L1668).
8. **Massline on Space bar** (L1664) — thumb-accessible.
9. **Anti-gravity forward cone** (L1675).
10. **Anti-gravity bomb** (L1678).
11. **Universal weapon knockback** (L1686) — every gun imparts impulse; starter exempt.
12. **Massline dragnet** (L1692) — drop a spreading net behind a big ship.
13. **Twin bridle as object-to-object** (L1694) — NOT ship-between-two.
14. **Horizontal transverse line weapon** (L1696).
15. **Verb-consolidation plea** (L1696) — concentrated primitives over many weapons.
16. **Atmospheric skimming via massline** (L1698) — conditional on combining primitives.
17. **Line pay-OUT function** (L1700) — massline must extend, not only reel in.
18. **GTA-in-space as UVP pillar** (L463, L1704).
19. **Expendable swarm enemies** (L1706).
20. **Emergent play-style philosophy** (L1688) — styles arise from creativity, not menus.
21. **Burn-up enemies in atmosphere** (L480) — "if animated right."
22. **Path-drawing cursor control** for the G/dogfight mode (L437).
23. **Cursor-controlled fling massline** (L459).
24. **No physics damage to self + blast-self-off mobility** (L458).
25. **Bombs dropped behind for propulsion** (L458).
26. **Image-gen anti-cartoon directive** (L589) — "1950s sci fi novel drawing" 100% of the time.
27. **Restraint preference** (L1851) — some ideas are "a lot of work for minimal benefit."
28. **The why-and-how document format** (L1891–1895).

---

## D. Places where user and AI talked past each other / user corrected AI

These are the highest-risk nuance-loss points. A summary that picked one side would be wrong.

1. **The decisive correction (L412–604).** Codex opened assuming the game could support
   "fly through the split hull" / "cut braces." User immediately corrected: top-down,
   fly through walls like vapor, solid core unrelated to mesh. Codex conceded (L623):
   *"Your objection about the Wreck Cathedral was decisive. The wreck itself should not
   be the first build."* **Risk:** a build step that starts with a hero site before the
   collision/component primitives repeats the original mistake.

2. **Physics realism vs fun (L1650).** Codex spent a long turn on physics purity. User
   waved it off: *"take artistic liberties... simply flinging off planets like spiderman
   is fun enough."* **Risk:** a summary might re-flatten to "implement realistic gravity."
   The constraint is **coherence**, not realism.

3. **Atmosphere ambivalence (L1655 vs L1698).** User first skeptical, then conditionally
   in favor — *only if* it combines the massline-spin primitive *and* line pay-out exists.
   **Risk:** a binary "wants atmosphere / doesn't" loses the condition.

4. **Twin Bridle scope (L1694).** User's version is object-to-object; Codex's original
   was ship-between-two. Codex corrected in the package. **Risk:** a build step using
   Codex's pre-correction version.

5. **G/trackpad mode (L431–437, L593).** User genuinely uncertain whether trackpad
   dogfight is possible. Codex offers two alternatives. **Risk:** treating either
   alternative as settled when the user owns the uncertainty.

6. **Industrial-site splitting (L450).** User pushed back on splitting station functions
   into industrial sites as "low ROI... more chances for ugly UIs." Codex accepted.
   **Risk:** a build step that re-introduces station-function splitting.

7. **Flyby-focus is currently broken (L1652).** User casually notes "there's a flyby
   focus that slows time (which btw doesn't work right now)." **Risk:** a build step
   that depends on flyby-focus without first fixing it.

8. **"Revenue streams for what?" (L443, L452).** User twice challenges the automation
   premise. Codex's answer: industry builds **verbs and physical capabilities**, not
   bigger numbers. **Risk:** a build step whose reward is a numerical buff.

---

## E. External references the user invokes

- **Galaga** (L417) — the current pew-pew combat.
- **GTA / "GTA in space"** (L463, L1704) — declared UVP pillar.
- **Spider-Man** (L1652) — the slingshot-fun framing.
- **Vibe-coding demos online** (L603) — the quality bar the user sees others hit.
- **1950s sci-fi novel cover art** (L589) — the cartoon image-gen failure.
- **Nintendo 64** (L1680) — current VFX quality.
- **Freelancer** — referenced ONLY in the atlas pack (`00_COMMON_CONTEXT.md` L64–72),
  NOT in the conversation thread. Treat it as an atlas-stream reference, not a user
  reference, unless the user confirms.

The user's tooling context: **3 coding agents with image-gen**, **Pro-mode planning
threads** dropped into **Claude Code sessions**, **trackpad** as primary input
(not joystick).
