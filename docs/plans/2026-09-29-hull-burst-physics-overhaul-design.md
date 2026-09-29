<!-- LIFETIME: DURABLE -->
# Hull Burst and the physics overhaul — design

Status: owner-validated design, 2026-09-29 (extended the same day with the arcade loot loop, §7, and the
open-sandbox rules, §8). Informative rationale: this file does not dispatch work or
grant a lease. Implementation is admitted through the ordinary program queue (`build_map.md` §1).
Product authority stays `design/VISION.md` ("The Massline is a signature mechanic", "Combat should feel
delightfully abusive").

## 0. Read this first (handoff)

**Where this came from.** One owner conversation on 2026-09-29, run as a structured brainstorm: one
question at a time, every design section shown in plain language and approved before the next. Do not
re-run the brainstorm. Reopen only what is listed in §11.

**The owner's intent, in their own words** (quoted or closely paraphrased; this is the "why" that the
tables below compress):

- *The worry.* The game "sometimes veers into being" an Endless Sky clone. They want it to "lean into
  its lane": combat and gameplay "very in-tune with the physics of this game", "a lot of the combat and
  gameplay … playing with physics". Existing seeds they named: attacks that "make other ships fly off or
  stick to different locations".
- *The diagnosis.* The Massline's value is capped because the only relevance of the ship's location is
  "where you take damage" and "where your bullets come from". So it is a "one-trick pony to avoid
  things". "If we make the ship's location more important, then maybe the massline, which exists to
  manipulate the ship's location, becomes immediately more important."
- *The shield idea.* "A gravity/magnet shield that threw enemies off at high speeds if it just touched
  them"; "a fire shield that basically just does so much damage it's an instant kill"; "maybe not a
  full shield all around but a front sort of bumper with a cooler name, a front cone with cool VFX that
  does different things that would be useful to manipulate the environment or attack enemies".
- *The tumble feel.* "If I blast an enemy ship I don't want him flying against the impact and staying
  roughly still like a fly buzzing against the wind. I'd want a satisfying effect and the ship tumbling
  out of control off into another direction and pinging off of objects."
- *The arcade feel (second message).* "More like the type of fun fast paced sort of almost arcade-style
  gameplay." Enemies "drop things and magnet them into the ship's hull". The hold should be "only a
  vague sometimes problem that's cool to upgrade"; "I don't want to make this the kind of game wherein
  you kill something and then look at its loot and weigh its value against how much room you have in
  your pack and then decide to leave it there". Post-processing wrecks (a salvage skill) is fine as a
  secondary thing, "not the primary thing when you kill something". The dopamine target: "you get a good
  throw on 3 enemies and they blast into an asteroid field and they burst, and there's shiny winnings
  that come out of them and accelerate towards you and bling into you … it's like points … it's a pain in
  the ass to have to collect them manually".
- *The sandbox.* "Every object being a primitive and possible ammunition"; "loosen or expand the rules or
  possibilities to maximize the fun of this sandbox and increase the number of things a player can do
  within it by chaining these primitives".

**Status.** Build is under way as of 2026-09-29 (owner goal: implement the whole design while preparing
the demo). §10 is the build order: vertical slices A-H, each a playable piece of the owner's
"throw three enemies into an asteroid field and the winnings bling into you" sentence, judged by one
fixed-seed scene. The owner delegated the plan's ordering ("the advisor can write a better plan"), so the
slice order in §10 replaced an earlier layered order the same day; the owner rulings in §2 did not change.
This file has a pointer row in `docs/TASK_ROUTER.md` but is not a queue packet: whoever starts a slice
admits it through the `build_map.md` §1 flow.

**How to read the certainty.** §2's table is explicit owner choices. Everything in §3-§8 was shown to the
owner and approved as written, but every *number* in it (durations, ratios, percentages, radii) is an
agent placeholder that nothing has tuned. "Verified <date>" means read from code that day. Anything
marked "unverified" or "hypothesis" is exactly that: check it before building on it.

**Working agreement for whoever builds this** (repo rules, restated because they bite):

- No git worktrees (owner rule 2026-08-23: each costs 4-16 GB). Sections of the tree are kept isolated
  by exact paths instead.
- The tree is shared and hot with other lanes: stage exact paths, commit by pathspec, `git add -N` new
  files, and read `git show --stat HEAD` afterward (`AGENTS.md` §3).
- Finish each slice end to end and reachable on the default route (`AGENTS.md` §6, "Wired features").
- The owner does not read code. Report in plain language, leading with done / not done.
- No long test or soak runs in session; goldens are never re-recorded to pass; frontend edits stay
  minimal and follow ORRERY (`design/frontend/ORRERY.md`, library `src/ui/orrery/`, lane status
  `design/frontend/ORRERY_HANDOFF.md` §2).

## 1. The problem

The Massline is a one-trick pony. The only thing the player's *position* does is decide where damage
lands and where bullets leave. Contact is one-way and free (the player takes no impact damage; the Ram
Plate is a damage multiplier), so a hull has no reason to be anywhere in particular, and the tool that
moves the hull (the Massline) inherits that irrelevance. Swinging around a rock is play, and swinging
around an enemy is only bullet dodging.

Thesis: **make the hull a third channel.** If the ship's body does something where it is, then the
Massline becomes the best way to put it there fast and aimed.

What already exists and is not a new invention (verified 2026-09-29):

- All Massline2 features are ON in the production profile (`src/runtime/runtimeProfiles.js`):
  throw, tumble, impact damage, hitchhiking, six rope heads.
- The five number-key field powers (`src/data/fields.js`, kernel `src/core/fields/fieldKernel.js`,
  system `src/systems/fields.js`): Well (pull), Repulsor (shove ring), Clearing Cone (player-attached
  forward wedge, `halfAngleRad` 0.56, strength 260). They are gentle lane-clearing tools, with no
  high-speed fling, no kill, and no Massline coupling.
- The hitstun law (`HITSTUN_LAW`, `SHOVE_BEAT_LAW` in `src/combat/impulseKernel.js`): a hull loses the
  helm only when ΔV ≥ ~14% of its cruise speed (`uFloor` 0.14), the stun is short (1.0 s at k = 0.30,
  cap 3.5 s), and heavies (mass ≥ 150, `HEAVY_AS_TERRAIN_MASS`) shrug; a heavy gun-scale hit is
  u≈0.13, below the floor, so exactly zero stun. Delivered-impulse sources (`gun`, `weapon`, `bomb`,
  `impulse_charge`) also get the **shove beat** (owner direction 2026-09-21: a shove-class hit knocks a
  light hull about one screen, 126 WU, off its line, and the helm stays lost for that coast). Rope
  throws, well flings and terrain collisions keep their own tuned helm economies. Preserve all of that
  when retuning.
- Tumble is one helm-override writer for every delivered impulse (`src/systems/tumbleStates.js`) with a
  0.9 s recovery window at 0.35 thrust and no guns. Tumble kinds: collision, massline, weapon, well
  (`src/combat/tumbleStatus.js`), plus the RCS-disruptor exception.
- **Correction to an early assumption (verified 2026-09-29):** engines are already off while a hull is
  tumbling. The tumble control literal is `mode: 'tumbling'` with zero force (`tumbleStates.js`, near
  the end of the file). So the owner's "fly buzzing against the wind" is most likely (hypothesis,
  unmeasured) some mix of sub-floor hits that never stun at all, stuns that are too short, and the
  35% thrust returning in the recovery beat while the hull is still moving fast. Slice A starts by
  measuring which, with a fixed-seed harness, not by assuming.
- Weak arcs on big hulls (`src/data/weakPoints.js`, mostly rear) that only bullets can use.
- Stunt scoring with cause chains (`src/systems/stuntGrammar.js`, `src/combat/stuntTaxonomy.js`) and
  Open Line Contracts (`src/combat/stuntContracts.js`); credit parity between gun and physics kills
  (`src/data/killRewards.js`: "credits stay equal across gun and physics kills", stunts pay as
  salvage-rights chits).
- Four specialists that each break one player plan (`src/ai/specialistPlans.js`).
- Module patterns for build-defining verbs: Ram Plate, Swing Drive (`src/data/modules.js`; derived stats
  in `src/systems/ships.js`).

## 2. Owner decisions (2026-09-29)

| # | Question | Ruling |
|---|---|---|
| 1 | What gates the hull shield? | A **special attack that lasts a while**, upgradeable to last longer. Not a constant. |
| 2 | How are types chosen? | **One slot, one type.** Fit one hull-burst module at the station; each type is a build. |
| 3 | Shape | **Mostly front-facing.** The nose is the weapon; heading, spin and swing arcs matter. Volumes are cone/ring/sheet, never a sphere (field-kernel law). |
| 4 | Scope | **Full physics overhaul** (ground rules, burst family, tie-ins, enemies, pay, consequences). |
| 5 | Crash risk | **The player never takes physics or impact damage.** At worst a temporary stun and tumble. Ships that take too much pressure or impact tumble out of control, fly off in a new direction and ping off objects, and are **not acted on by their own propulsion** while tumbling. Nothing should "buzz against the wind." |
| 6 | Kill loot when the hold is full | **Overflow auto-converts to credits** at a scrap discount. Nothing is ever refused or left floating. Kills should feel like points: shiny winnings burst out and accelerate into the hull; collecting them by hand is a chore. |
| 7 | Hold size vs the economy | A **separate combat-loot salvage bay** (about 5x a normal hold, upgradeable). The ordinary cargo hold is untouched, because trade and mining income per trip scales with hold size and "5x everywhere" would multiply the whole economy. Raised and replaced after that consequence was explained. |
| 8 | How the sandbox loosens | **All three:** more things grabbable and throwable, a reaction table so touching primitives trigger each other, and every tool working on every movable object. |

Ruling 5 flips one existing rule: "the player ship never tumbles" (comment in `tumbleStates.js`;
asserted in `scripts/check-massline2.mjs`, `test/weapon-impulse-consequence.test.mjs`,
`test/massline-presentation-uvp.test.mjs`). Those assertions are updated as part of slice B, not
worked around. "Never damaged by physics" stays true and stays asserted
(`masslineImpactDamage.js` invariant).

**Alternatives the owner declined** (so nobody re-litigates them):

1. *Power source* (owner's words: "a kind of special attack that lasts however long, and it can be
   upgraded to last longer maybe, but not a constant thing"). Declined: energy/heat budget; always on but
   wearing down; and "charged by motion", which the agent had recommended so the Massline would power
   the shield. The Massline link is carried by speed-scaled hits instead (§5.1).
2. *Types.* Declined: several at once on separate keys; one ability with a mode dial.
3. *Shape.* Declined: mostly all-around ring; per-type free choice. Front-facing is the rule, with one or
   two ring exceptions allowed.
4. *Scope.* Declined: hull burst alone; hull burst plus three small connective rules. The owner took the
   full overhaul.
5. *Crash risk.* Declined, all three: real-but-forgiving damage (shield then hull); self-inflicted
   Massline mishaps only; shield-only damage. The owner wants **no physics damage to the player**.
6. *Full hold.* Declined: overflow stays as floating pickups; a full hold blocks materials only.
7. *Hold size.* The owner's first idea was "make the hold 5x bigger in all cases". Replaced with a
   separate salvage bay once the economy consequence was explained (trade and mining income scales with
   hold size). Also declined: combat loot never enters any hold.
8. *Sandbox loosening.* Nothing declined: all three were chosen.

## 3. The ground rules (slices A and B)

**Nothing is hurt by physics. Everything can lose control.**

1. **Player:** never takes impact damage from asteroids, ships or stations. A big-mass hit or an
   enemy physics attack can cost a short stun and tumble: a warning cue, a hard cap on duration
   (placeholder ≤ 1.0 s), the existing recovery window, then a short immunity window (placeholder
   2 s) so nobody can chain-stun-lock the player.
2. **Enemies lose control more easily.** Lower `uFloor` and lengthen the stun for light and medium
   hulls. Heavies keep shrugging (moving terrain); a heavy is shoved and briefly stunned but does not
   spin off.
3. **A tumbling ship is a projectile.** Thrust is already zero during a tumble (verified), so keep it
   that way and make sure nothing pushes back: the recovery beat's 35% thrust must not begin while the
   hull is still travelling fast. The hull carries its new velocity, pings off rocks and other hulls
   (check that the physics material table gives a visible bounce: `defaultMaterial` in
   `src/core/physicsAuthority.js`) and can knock others into tumbles. Its damage is what it hits while
   tumbling, attributed to the player.
4. **Recovery is a beat.** Damped spin, weak thrust, no guns: the window to finish or re-fling.

Retune-first: most of this is constants in the existing law plus a bounce check and the player's capped
stun, all on the existing tumble writer. Determinism: sim uses `state.rng` / `state.simTime`; no new ambient random.

## 4. Hull Burst modules (slices C and E)

A fitted `utility` module (pattern: Ram Plate, Swing Drive). Activated on a key. Runs for a duration,
then recharges for clearly longer than it lasted. Tech-tree tiers add duration, wedge length and
strength.

While active:

- a **front wedge** (the field-kernel cone volume, player-attached) sits at the nose;
- the player counts as **much heavier for collision mass**. The hitstun mass factor
  (`hitstunMassFactor`, clamped 0.5-2.2) caps this advantage, so light/medium hulls tumble on contact
  and heavies need the module's own kick on top;
- anything touched inside the wedge takes the module's effect, **scaled by closing speed**.

Starter roster:

1. **Gravity Bumper.** Hurls light and medium hulls away at high speed; they tumble, ricochet and
   trigger further tumbles. Heavies are shoved hard but keep flying. The Clearing Cone stays as the
   gentle utility; this is its violent cousin.
2. **Fire Lance.** Narrow, short wedge; contact kills light/medium hulls. Heavies ignite and burn
   (existing burn status). The finisher: you must fly straight at it.
3. **Grip Bumper.** Catches a light hull on the nose and carries it; when the burst ends or the
   player cuts it, the hull is released at the player's speed. A battering ram with a hostage, and
   the type where a Massline swing matters most.

Later types follow the same pattern (for example a cryo plow: freeze, then shatter on impact).

## 5. Tie-ins that make position matter (slice C; the fling-credit half is slice A)

1. **Speed scaling.** Burst effect scales with closing speed along the wedge. A crawling touch is a
   nudge; a full-speed hit is the module's full effect. A Massline swing is the fastest way to arrive
   at speed and aimed, so the loop is swing, ignite mid-swing, release into the group.
2. **Everything you fling is your weapon.** Hulls the burst sends tumbling count as the player's for
   what they hit. The stunt system already tracks cause chains and pays reputation and salvage-rights
   chits (never credits, §7.4), so "burst, ricochet, second ship dies" is a recognized trick with a
   chain bonus.
3. **Burst contact is a hit at the contact point.** Contact on a weak arc gets the weak-point bonus
   (`weakPoints.js`), so flying around to a big ship's rear becomes a hull skill.
4. **Position has four uses:** approach angle (the nose), arrival speed (the Massline), what is behind
   the target (rocks, hazards, other hulls), and which arc of the enemy is exposed.

## 6. Enemies, pay and consequences (slice H)

Enemies that answer the burst (same pattern as `specialistPlans.js`: each names the player plan it
breaks, has a verb and a telegraph):

- **Stabilizer.** Light support hull whose pulse cancels tumbling on nearby allies. Breaks "fling
  everyone and watch"; answer: kill it first or fling it.
- **Skirmisher.** Reads the burst warming up, keeps range, bolts when the wedge lights. Breaks "walk
  up and ram"; the answer is a Massline swing that closes the gap at speed.

Tether cutters and anchors stay. Heavies stay moving terrain; answer: fling something at them or take
the rear arc.

Pay and consequences (credit parity between kill styles is kept):

- **Physics writs:** new Open Line Contract offers whose answers include the burst (for example "clear
  the escort without firing a shot"). Completion is judged from causal trick receipts; cards are
  recognition, not score.
- **Loot follows the fling:** kill loot already inherits victim velocity, so where a hull is flung
  decides where its loot lands.
- **Collateral is real:** a tumbling hull that strikes a civilian or patrol counts as the player's
  harm (heat, reputation, scattered cargo) under the existing civilian-harm rules.

## 7. Arcade payoff loop (slice A; the salvage bay is slice D)

Goal (owner): fast, arcade-style, dopamine-forward. A good throw on three enemies into an asteroid field
should burst them into shiny winnings that accelerate toward the ship and "bling" into it as credits.

What exists (verified 2026-09-29): a player kill of a hostile already emits a victim-scaled burst of
pickups plus physical credit chips (`src/systems/lootShards.js`, recipes in `src/data/killRewards.js`,
victim velocity inheritance `KILL_BURST_VEL_INHERIT` 0.4). Every ship already has an 800 WU homing
pickup magnet (`MAGNET_RANGE`, `playerPickupMagnetRange` in `src/systems/mining.js`). Credit chips are
currency and never use the hold. The friction is the hold: the starter hull holds 250
(`src/data/ships.js`), one light-kill burst is about 68 units of material, and a full hold refuses
pickups (`resolvePickupAcceptance`), which recreates the "weigh the loot against my space" chore.

Rules:

1. **Every kill the player causes pays:** gun, fling, crush, chain. A hull the player flung that dies
   on a rock pays like a gun kill (same attribution as §5.2). Credit parity between kill styles stays.
2. **The burst carries the victim's momentum,** so kills over an asteroid field scatter loot across it.
3. **Beat, then homing.** After a short beat so the burst reads (placeholder 0.5-1.0 s), all loot from
   the player's kills homes to the hull from anywhere in the sector at rising speed: no radius limit,
   no expiry during the chase, bounded pickup count.
4. **Bling feedback.** Pitch-stepping pickup audio and a rolling counter that escalates with chain
   length. Chips are the points. **Conflict to resolve (§11.2):** the repo deliberately keeps credits
   equal across kill styles (`src/data/killRewards.js` header, AC-01) and pays stunts only as
   reputation + salvage-rights chits, never credits (`trickPay` in `src/systems/stuntCombo.js`,
   PQ-155.03). An earlier draft of this line said chain length "multiplies chip value"; that would break
   both rulings. Default proposal: per-kill credit chips stay flat by hull class, and the chain bonus
   rides the existing stunt-pay channel, shown as extra bonus chips of that kind landing with the same
   bling. Paying extra credits per chain needs the owner to override those two rulings.
5. **Salvage bay.** A separate combat-loot store, base about 5x the ship's ordinary hold
   (placeholder), upgradeable by module/tech. It auto-fills, is written only by the cargo owner, and
   never refuses a pickup: overflow is converted to credits by the economy owner at a scrap rate
   (placeholder 60% of reference value; **as built in slice A it is 8%**, section 13, because a light kill's materials are worth ~1,200 cr at reference against a ~65 cr chip). The ordinary hold and its trade/mining role are unchanged.
6. **Leaving banks it.** Loot still in flight when the player jumps or docks is banked instantly.
7. **Salvage skill (optional).** A fresh wreck lingers a few seconds; working it with the beam strips
   extra rare parts. A bonus for players who like it, never a requirement. The existing wreck-salvage
   career stays as it is.

Save: the salvage bay is persistent state, so it needs a save-schema version bump and migration
(`check:save-schema`).

Scope boundary: **not changing** trading, mining (ore pickups stay hold-gated), the ordinary cargo
hold, the wreck-salvage career, or credit parity between kill styles. The Loot Magnet Ring
(`mod_loot_magnet_s`) and tractor heads (`magnetRange`) keep their job for non-kill pickups; homing only
makes them redundant for kill loot.

Traps found while reading the loot code (verified 2026-09-29 unless noted):

- `lootShards` pays the hostile burst only when `entity:killed.killerId === playerId`
  (`src/systems/lootShards.js`, `_onKilled`). `masslineImpactDamage` routes its kinetic damage with
  `attackerId: playerId`, so whip, tumble and sweep kills likely qualify. **Unverified** for pure
  collision-consequence kills (`src/systems/collisionConsequences.js` provenance): confirm the
  `killerId` a rock-crush kill actually carries before promising "flung ships pay".
- `lootShards` returns early for victims that `missionOwnsReward` or `runOwnsReward` (Survival /
  Crucible). Those pay through a separate run-wallet path (`mining.js`, run chips; PQ-133 ruling 2:
  a run never touches the campaign wallet). The loop must be built for those paths on purpose, never by
  leaking run loot into campaign credits. The Crucible is also the natural first playground: endless
  arena, constant kills.
- Homing exclusions: facility-owned heist capsules are custody freight, and freshly jettisoned pods need
  separation time. The magnet code already special-cases both (`mining.js`, `_updatePickups`, near the
  `jettisonedCargo` handling). Do not home them.
- Anti-farm: chain pay must go through the existing threat admission and reward gates
  (`admitStuntThreat` in `src/combat/stuntScoring.js`, `runOwnsReward`, the one-authoritative-death
  ledger in `rewardEligibility.js`) so flinging spawned fodder cannot be farmed.

## 8. Every object is a primitive (slices F and G)

Goal (owner): every object is a primitive and possible ammunition; loosen or expand the rules to
maximize chaining. All three loosenings were chosen (decision 8).

What exists (verified 2026-09-29): dynamic bodies by default are ship, drone, payload, projectile,
pickup, wreck and asteroid chunks (`defaultDynamic` in `src/core/physicsAuthority.js`). Whole
asteroids, stations, beacons and mines are static. Massline tow candidates are wreck, payload, pickup
or entities flagged towable / fractureChunk / bulkHaul (`TOW_TYPES`, `isTowCandidate` in
`src/combat/masslineTargetScoring.js`); asteroids and stations serve as anchors. Reaction pieces exist
but are separate: volatile pod classes (`src/data/commodityVolatileClasses.js`), bomb payloads (frag,
concussion, singularity, goo, EMP, thermite, scrambler, anchor in `src/data/bombs.js`), and statuses
including cryo lock (`src/combat/statuses.js`, `src/combat/cryoLock.js`).

Rules:

1. **One physics door.** Every tool (Massline heads, burst wedges, bombs, fields) acts on any movable
   body through the physics-authority impulse and status seams. No "ships only" special cases inside
   tools.
2. **Size classes.** Small and medium asteroids become movable and throwable (dynamic on touch, asleep
   again afterward, with a hard cap on awake bodies); hard hits fracture them into chunks. Large
   asteroids stay anchors ("moving terrain"). Stations stay fixed and may shed debris.
3. **More grabbable things.** Mines, enemy missiles and beacons/buoys can be latched and thrown
   (catch a missile and return it).
4. **Reaction table.** One data table, material + state to outcome, driven by an event observer with
   no per-tick scans. Starter set: explosive (pods, mines, missiles blast and hurl neighbors), fire
   (ignites fuel and explosives, spreads between touching hulls), cold (freeze, then a hard hit
   shatters into shards), goo/grip (fuse hulls into one flingable lump), charge (arcs between metal
   hulls, kills thrust, tumbles them).
5. **Telegraph and attribution.** Every reaction has a readable telegraph and counts as the player's
   doing, so it feeds the chain bonus.

Risks to watch: the awake-body budget, reaction runaway (cap chain depth per second), and readability
of many simultaneous effects.

## 9. Safety, save and testing

- Feature switches default OFF in the frozen `legacy47a` profile so the deterministic goldens stay
  byte-identical; ON in `production`. Never edit `test/*.expected.json` to pass.
- Burst state is transient and unsaved. A save load, dock, jump or death ends it. It cannot stack.
- Allies in the wedge are nudged, never flung or harmed.
- Single writers hold: the economy owns credits (overflow conversion goes through it), the cargo
  owner writes the salvage bay, and homing loot, awake rocks and reaction chains are capped and
  event-driven. Frame cost is measured with the runtime witness, not by capture.
- Added proof numbers for §7-§8: share of kill loot collected with no pilot input (target: all of it),
  seconds from kill to last chip landing, chain length per fling, and a fixed-seed reaction chain
  (explosive pod into three hulls) that repeats identically.
- Frontend changes stay minimal and follow `design/frontend/ORRERY.md`; a HUD indicator is required
  (a feature is not done until it is reachable on the default route: shop, key, HUD, VFX, audio).
- Proof is a fixed-seed number, not a screenshot: share of light-ship hits that tumble, distance a
  flung hull travels, seconds the player is ever stunned. Then one targeted playthrough for the
  overall feel (`docs/VALIDATION_WORKFLOW.md`).

Known tuning risks (tune, do not solve now): player stun length, heavy resistance, and whether the
recharge reads as a special attack or a wait.

## 10. Build order: vertical slices

Reordered the same day the design was written (advisor review, at the owner's request that the plan be
built from the core intent). The first draft built in layers (rules, loot, burst framework, two more
bursts, speed scaling at stage 5), which left the owner's own sentence unplayable until late and shipped
the one mechanic that makes the Massline matter (arrival speed scaling the hit) after two bursts that
did not use it. Each slice below is a playable piece of: *"you get a good throw on 3 enemies and they
blast into an asteroid field and they burst, and there's shiny winnings that come out of them and
accelerate towards you and bling into you."*

**The yardstick: one fixed-seed scene.** Three light hostiles in front of an asteroid cluster, built in
slice A and re-run after every slice. Four numbers:

1. kills caused by physics, not guns;
2. **buzz count**: velocity reversals during a tumble (target 0);
3. seconds from the last kill to the last chip landing;
4. pilot inputs needed to collect the loot (target 0).

**A. The money shot with the verbs that already exist** (Massline throw, ramming; no new module). Behind
one production flag that is OFF in `legacy47a`. Demo-worthy on its own.

1. Measure the buzz first: each source (gun, bomb, repulsor, well, rope throw, ram) against light,
   medium and heavy hulls. Record stunned or not, stun length, distance travelled before the helm returns,
   and any velocity reversal. Bring the numbers to review before retuning.
2. Retune from those numbers (§3). Hold recovery thrust until speed has decayed, not for a fixed time.
3. Verify each link of the kill chain and fix whichever is broken: a tumbling hull that hits a rock takes
   speed-scaled damage; that damage names the player as attacker when the player caused the tumble;
   `killerId === playerId` so the loot burst fires; a tumbling hull that hits another hull stuns it (the
   "three enemies" chain). If any link is missing, the scene fails whatever bumpers come later.
4. Check that bounces are visible (`defaultMaterial`).
5. Loot homes to the hull after the short beat, from anywhere in the sector, for campaign kills and
   run-wallet kills (destination wallet unchanged), with overflow converted to credits through the economy
   owner. This alone removes the hold chore; the salvage bay is not needed for it.
6. Bling: pitch-stepping pickup audio and a rolling counter.

**B. Player stun, its own packet and flag.** Capped duration, immunity window, conservative threshold,
and the three "player never tumbles" assertions flipped (§2). Separate so it can be switched off for the
demo without touching A. The owner's cut-off sentence (§11.1) is answered here.

**C. Gravity Bumper, with speed scaling and weak-arc contact from day one.** Without speed scaling it is
a louder Clearing Cone and the Massline stays optional.

- Precondition: check the speed-governor exemption for Massline and slingshot velocity (§12). If earned
  speed is clamped before contact, speed scaling does nothing.
- Engine: leaning to the impulse kernel with the cone as the hit-test volume (§12); decide from the scene
  numbers.
- Wiring, all of it: the module definition and the UI surfaces §12 lists; a key and a gamepad binding
  (confirm whether `check-input-modalities` requires each verb reachable on every modality); the
  power-rail indicator; VFX, audio, one tech tier.
- Done when: the fling-distance ratio for a crawl-speed touch versus a full-swing hit is measured.

**D. Salvage bay.** The save-schema bump and a floor so small hulls get a usable bay. The chain bonus
rides the stunt-pay channel as the documented default (§7.4, §11.2).

**E. Fire Lance and Grip Bumper,** on C's framework.

**F. Movable small rocks, grabbable mines and missiles, and the one physics door (§8.1-8.3).** Gated on
runtime-witness numbers and a cap on awake bodies.

**G. The reaction table (§8.4-8.5),** with a cap on chain depth per second.

**H. Stabilizer, Skirmisher, physics writs, collateral (§6).**

Each slice is reachable in the real game before the next begins, and each ends with: focused test, the
47a golden hash unchanged, `check:baseline`, an independent reviewer who is handed the owner quotes from
§0 and the slice's done-when number and asked whether the slice delivers the owner's sentence, then a
pathspec commit. Where a file carries another lane's uncommitted edits, stage only your own hunks.

## 11. Open questions (settle these; nothing else is open)

1. **An unfinished owner sentence.** During the session the owner sent a message that read "The player
   should sti" and was cut off (it ran into the word "continue"). It was probably a note about how the
   player's stun should behave ("should still …"). Its content is unknown. Ask the owner one plain
   question in the first report after slice B is built (for example: while stunned, can the player still
   steer or shoot?), do not block on it, and do not guess beyond the placeholders in §3.1. Slice B has its
   own flag so the answer can change it without touching slice A.
2. **Chain-bonus currency.** See §7.4: flat credits plus a chain bonus on the stunt-pay channel
   (proposed default), or the owner overrides credit parity.
3. **Which key fires the burst.** Digit0-9 are all taken (0 brake, 1-3 ordnance, 4-9 deployables such as
   Well/Repulsor/Cone/Skim/bomb), Space/F is the Massline, Q/E strafe, R detonate, Y charge throw,
   C scan pulse, V cruise, X countermeasure, G auto-fire, B site beam
   (`src/systems/input.js`, verified 2026-09-29). Audit free keys against both scheme tables and
   `ui/bindings.js` the way the Digit4-9 audits did. Editing `input.js` needs task ownership and focused
   input/rebind/sim validation (`AGENTS.md` §6).
4. **The engine for the hurl:** field kernel or impulse kernel (§12).
5. **Player stun shape and length:** placeholders only (≤ 1.0 s, 2 s immunity).
6. **Numbers nobody has tuned:** the 5x salvage bay (small hulls hold only 120-160, so a 5x bay may
   want a flat floor), the 60% scrap rate, the 0.5-1.0 s homing beat, the burst recharge ratio, wedge
   size, and how hard heavies resist.
7. **Allies in the wedge** are nudged, never flung or harmed: an agent proposal, approved with the
   section but never discussed on its own.
8. **HUD.** A burst indicator, a salvage-bay meter and a chain counter are needed. Build them from ORRERY
   library elements; the existing number-key power rail (`src/ui/powerRail.js`) is the likely home for
   the indicator.

## 12. Implementation notes, seams and traps

- **Reference trail for a fitted module.** Follow `ramDamageDealtMult` end to end: definition and
  plain-words description in `src/data/modules.js`; derived stat in `src/systems/ships.js`; the effect in
  `src/systems/collisionConsequences.js` (`playerRamPlateImpact`, with its provenance tag); and the UI
  surfaces that list a module's verb, `src/ui/ship/shipBandModels.js`,
  `src/ui/station/outfittingGuidance.js`, `src/ui/ship/loadoutPresets.js`,
  `src/systems/buildIdentity.js`, `src/ui/crucibleCombatReadout.js`. A module that skips these is not
  wired. Tech gating is `requiresTech` in `src/data/tech.js`.
- **Field kernel or impulse kernel for the hurl.** The field cone is a sustained acceleration system
  built to be gentle: summed acceleration capped at `FIELD_MAX_ACCEL` 820 wu/s², heavy hulls shrug by
  mass coupling, at most `FIELD_MAX_ACTIVE` 6 fields (`src/data/fields.js`). A hurl "at high speed" that
  kills and tumbles probably wants a delivered impulse through the impulse kernel and hitstun law (a
  source kind like `impulse_charge`), using the cone only as the hit-test volume. Decide in slice C with
  a fixed-seed number. Either is acceptable if the visible result is the fling.
- **Heavier while the burst is on.** Candidate seam: the combat runtime's `physicsResponse.massScale`,
  already used by the pickup magnet and bombs (`mining.js`, near the `queuePhysicsImpulse` call).
  `hitstunMassFactor` caps the advantage at 2.2, so heavies need the module's own kick.
- **Fire Lance damage** goes through the combat kernel like `masslineImpactDamage._routeKinetic`
  (`scalarHitToDamagePacket`, `attackerId: playerId`), never direct hull writes; burn uses the existing
  status effects.
- **Grip Bumper** is a candidate for a short rigid attachment via `src/combat/attachments.js` (sockets,
  `sourceWorld`, the tow attach) or the existing Frame Coupler head (`masslineHeadFrameCoupler`).
  Release keeps the player's velocity.
- **Player tumble** must go through the physics command membrane (`writePhysicsControl`,
  `queuePhysicsTorqueImpulse` in `src/core/physicsAuthority.js`), not by editing `input.js` or flight.
  Live flight is `flightV3`; the compatibility `flight.js` is off-limits for gameplay fixes
  (`AGENTS.md` §5). Earned speed (slingshot, Massline) must not be clamped before contact: wave M2 left
  an open item, a speed-governor exemption for slingshot-tagged velocity (`tether.slingshot`,
  `massline:selfSling`). Check its current state before speed-scaled hits are tuned.
- **Checks that encode today's rules** and need deliberate updates, not workarounds:
  `scripts/check-massline2.mjs` (player never tumbles), `test/weapon-impulse-consequence.test.mjs`,
  `test/massline-presentation-uvp.test.mjs`, and the feel-contract bars that pin the tumble law
  (`design/FEEL_CONTRACT.md`; the shove screen of 126 WU and "a heavy keeps its helm at the speed a
  light hull loses it" are documented in `src/combat/impulseKernel.js`). Run `npm run check:baseline`,
  `npm run check:massline2` and the focused tests; do not re-record goldens.
- **Golden safety.** New switches are OFF in the frozen `legacy47a` profile and ON in `production`
  (`src/runtime/runtimeProfiles.js`, `src/data/featureFlags.js`); new systems stay out of the curated
  sf-sim list; new runtime state is unsaved except the salvage bay.
- **Objects.** The dynamic set is `defaultDynamic` (`src/core/physicsAuthority.js`); Massline tow
  candidates are `isTowCandidate` (`src/combat/masslineTargetScoring.js`); per-type behavior comes from
  `substanceFor`. Sleeping-rock design must respect the physics body budget; measure with
  `npm run probe:runtime-witness`.
- **Determinism.** Loot rolls are stateless (`createVictimRewardRng`: run seed plus victim identity);
  keep homing timing on `state.simTime`.
- **Related reading.** `design/revamp/MASSLINE_PHYSICS_IDENTITY.md` (wave M2: F frees you, RMB throws
  them, LMB shoots via tether fire control; `check:massline2`), `docs/MASSLINE_MECHANICS.md`,
  `design/VISION.md`, `design/program/INFERENCE_INTENTIONAL_FUN.md`, `design/FEEL_CONTRACT.md`.
- **Doc hygiene.** This file is `DURABLE`: rationale only, never a lease or dispatch. If it becomes a
  packet, follow the lifetimes in `docs/POLICY_MANIFEST.md`.

## 13. Slice A as built (2026-09-29): what exists, the numbers, the traps

Design rationale only; the code and `feel.fling_scene` are the authority. Two production-ON /
`legacy47a`-OFF flags (`src/data/featureFlags.js`, `src/runtime/runtimeProfiles.js`):
`combat.tumbleFling` (a knocked-loose hull is a projectile) and `combat.arcadeLoot`.

**The yardstick.** `scripts/lib/bench/scenarios/feel.fling_scene.mjs` (real runtime, production
damage router, live AI; results in `metrics.targets`, never `metrics.bars`, so no FEEL_CONTRACT bar
moves). Measured before, then after: head-on outbound speed when the helm returns -9.5 / +24 / +5.8 WU/s
-> 57.5 (0.55 of cruise, ~one screen); spin during a stun 0.59 -> 2.9 turns; rebound off a rock 0 ->
0.6 of impact speed; a kill after 3.4 s of flight credited to the victim -> credited to the player;
flung Wasp meets a second at closing 110: knock 12 -> 88 WU/s and the second dies (killerId = player);
busy-hold loot 10 of 21 floating -> 0; far loot (1500 / 3000 WU) never moved -> lands in ~3 / ~6 s.
**Not covered yet: a real Massline throw** (every arm delivers its hit with a concussion gun shot);
rope throws, whips, wells and tether shares write no impulse-provenance record, so their credit rides on
the stunt-evidence window.

**As built (constants are untuned placeholders).**

| Rule | Where | Value |
|---|---|---|
| Credit outlives the flight | `holdImpulseProvenance` (`src/combat/impulseKernel.js`), called from `tumbleStates._beginFromImpulse` | held to tumble end + 0.9 s; never revives a dead record, never re-stamps `appliedTick` (the RCS-disruptor latch reads it), extends only a record that caused the tumble or is already held |
| Free spin | `tumbleControl` (`src/systems/tumbleStates.js`) | zero force and zero torque while the helm is lost; recovery beat keeps real thruster torque |
| Head-on floor | `tumbleStates._cancelInboundVelocity` | a shove-class hit that takes the helm first cancels the hull's inbound velocity along the push (one impulse through the combat physics port) |
| Bounce | `src/core/sg02DynamicBodyOwner.js` (`_tumbling`, `_syncTumbleMaterial`, ricochet in `_applyStructuralGive`) | restitution 0.6 with the Max rule, contact bound 160 WU/s (was 40) for the loose hull AND anything it touches, angular drag 0.05/s (was 0.4), ricochet vs fixed bodies at 0.6 of closing (closing > 6 WU/s) |
| Chain | `PROJECTILE_HULL_LAW` + `resolveCollisionConsequence` `projectileStrike`; `collisionConsequences._resolveContact` | struck hull's knock = (1 + 0.6) x closing x mStriker / (mStriker + mTarget), only when the striker is tumbling or recovering, closing >= 20 WU/s, never lowers the solver's reading; loose-ness read once per contact so id order does not matter; the struck hull gets its own provenance record so its flight credit chains |
| Loot | `src/systems/mining.js` (`combatLoot`, `homeAt`, `_convertOverflowToCredits`) | 0.5 s beat, then home from any distance; overflow ore pays credits through `economy:grantCredits` at **8%** of reference value |

**Traps found the hard way.**

- The old "buzz" was not thrust: engines are already zero in a tumble. It is momentum arithmetic
  (deltaV minus closing speed) plus a counter-torque written from the first tumble tick that killed the
  spin in ~0.2 s, plus ship restitution 0 / Min rule / a 40 WU/s per-tick contact bound.
- **A spinning capsule does not bounce off a rock** even with restitution: the off-centre contact point
  moves faster than the approach, so the solver turns the impact into spin. The ricochet is enforced
  explicitly in the post-step contact pass (measured: a real Wasp rebounds 16.8 at 28 WU/s with no spin,
  ~0 with 4.3 rad/s).
- The ship contact material's `angularDamping` (0.4/s) is documented in the owner as an RCS model, so it
  is "acting on the hull with its own propulsion"; a loose hull drops to 0.05/s.
- Craft-on-craft consequences used to read ONLY the first solver tick's exchange, and the struck hull's own
  per-tick contact bound truncated the knock: both had to change for a chain to exist.
- Impulse provenance (`RECENT_IMPULSES`) lived 180 ticks and `tumbleStates._tickRcsLatches` deleted stale
  records every tick; drones are not scanned at all.
- SG-02 gives bodies only near the player (a static rock publishes no telemetry). A pickup beyond the
  physics ring has no body, so "home from anywhere" needed a direct position step for body-less combat loot.
- **The economy.** A light kill's materials are worth ~1,200 cr at reference against a ~65 cr chip (hauled
  ore is this economy's real payoff; chips are the points). The 60% overflow placeholder in section 7.5
  would have made a full hold pay ~10x the chip and combat the dominant income, so it was set to 8%
  (~one chip per fully refused burst). Owner may retune; run the career benchmarks on a quiet host.
- The frozen 47-A golden (`test/47a.telemetry.expected.json`) is stable under this work (both flags are OFF
  in `legacy47a`); another lane's commit `954a0ab8c` moved it independently. Gate on "identical to the
  commit before your change", not a fixed hash.
- Several commits swept other lanes' hunks (same-file pathspec commits while another lane edited the
  file). Stage by hunk, and read `git show --stat HEAD` afterwards.

**Slice A, closed (2026-09-29).** Bling (the converted-ore chime ladder and a floating '+N cr'), banking loot
in flight on dock or jump, homing for run-wallet chips (wallet unchanged), and the real Massline throw arms
(`feel.fling_scene` throw arms: a hull the player swings and throws on the line is the player's kill; rope
throws now write impulse provenance) all landed. Independent review of A/3-A/6 found four defects, fixed in
A/9: loot moved at twice its speed inside the physics ring (bodiless-ness was read from SG-02 telemetry,
which a production browser never publishes; it is now the port's `applyImpulse` answer), the inbound-velocity
cancel stacked for same-tick hits (one per hull per tick now), the floor impulse opened a second stunt-evidence
root (it now rides its hit's own impulse reason), and the tumble pair bound raised the player's per-contact
receipt (the player keeps the ordinary bound). Known and accepted: a flung hull can kill civilians and neutral
traffic, billed to the player; that is the section 6 collateral rule arriving early and the civilian-harm
rules apply to an attributed kill.

## 14. Slice C as built (2026-09-29): the Gravity Bumper

Commits `41858027b` (module, system, wiring, scene), `be53726e1` (key), `3c663b8dc` (readout, sound, flares),
`9ddc001c3` (Helios rack, scene through the input edge). No feature flag: the module has to be bought and
fitted, and `hullBurst` is registered in the production orders only (absent from `legacy47a`; the 47-A hash
is identical with and without the change, and with and without the input.js edit).

**What exists.**

| Piece | Where | Value |
|---|---|---|
| Module | `mod_gravity_bumper_s` (`src/data/modules.js`) | utility S, tier 2, 24,000 cr catalog, gated on Graviton Drives; Helios rack 12,000 cr (no research stop at that counter) |
| Tuning | `src/data/hullBurst.js` (`HULL_BURST_TYPES.gravity`, `resolveHullBurst(kind, rank)`) | window 6 s, recharge 18 s, reach 150 WU, half angle 0.5 rad opening with distance, nose width 18 WU, player counts 2.5x heavier, kick 8 WU/s, bounce 0.6, soft ceiling 260 WU/s, forward bias 0.65, non-hostile nudge <= 12 WU/s |
| Derived stat | `derived.hullBurstKind/Rank` (`src/systems/ships.js`) | one burst per hull; higher rank wins, ties by kind name |
| System | `src/systems/hullBurst.js` | runtime state `state.hullBurst` (unsaved); ready -> active -> cooling on sim time; a cut-short burst still owes the full recharge |
| Key | `hullBurst: ['Backslash']` (`src/systems/input.js`) | rebindable, in Settings and Help; no default pad button (none is free), no touch |
| Readout | `src/ui/fieldHud.js` (the bottom-centre field pill) | LIVE Ns / RECHARGING Ns / a 3 s "READY [key]" hint; one voice at a time |
| Source | `'hull_burst'` in `SHOVE_CLASS_HITSTUN_SOURCES` (`src/combat/impulseKernel.js`) | so it gets the shove beat and the outbound floor (no buzz) |

**The throw** is momentum, through the same impulse route an impulse-charge blast takes (port impulse, impulse
provenance naming the player, the one hitstun law), so slice A's tumble, projectile hull, chain credit and
loot all apply for free: `raw = (kick + 1.6 x closing) x bumperMass / (bumperMass + targetMass)`,
`deltaV = max x tanh(raw / max)` (a soft ceiling: a hard clamp gave a Wasp, a Drifter and a Bastion the same
number at speed). `closing` is the relative speed along the centre line. Every hostile ship or drone in the
wedge is thrown once per activation; non-hostile hulls are nudged and nothing else; rocks are never touched;
the player is never pushed.

**Measured** (`feel.bumper_scene`, real runtime, seed 4242, lit through the input edge): crawl-speed touch
9.8 WU in 3 s versus a 281 WU/s arrival 691.5 WU (70x); light / medium / heavy hulls given 229 / 193 / 115
WU/s (a Warden-class hull gets 0.50 of a Wasp, and loses its helm 0.5 s against 3.5 s); a thrown hull is still
leaving at 275 WU/s when its helm returns (no buzz); three live Wasps in front of a rock wall, one pass: 3 of
3 thrown, 3 kills all credited to the player, 21 of 21 pickups landed with no pilot input, +216 cr in 1.2 s.

**Traps.**

- The runtime instantiates its OWN copy of every system (`runtime.getSystem('hullBurst') !== hullBurst`), so a
  scene that calls the imported module's `activate()` lights a different object. Write the input edge instead.
- The shove beat (`SHOVE_BEAT_LAW`) gives any shove-class hit past `minU` 0.3 about one screen of travel
  whatever its size, so a "nudge" only exists below that: the kick is 8 WU/s on purpose.
- A parked target with live AI drifts on its own and pollutes a distance reading; the throw arms use AI-less
  hostile hulls (an encounter body on the hostile team) and the field arm keeps live AI on purpose.
- Several UI surfaces name a module's verb (`shipBandModels`, `outfittingGuidance`,
  `crucibleCombatReadout`, `buildIdentity`, `loadoutPresets`, the progression verb audit); the audit's vocabulary
  tables must learn a new mods key or `check:progression-verb-audit` goes red.
- The power rail is pinned to nine sockets by tests and the ORRERY cluster draws its ordnance groups from it,
  so the burst readout rides the existing field pill instead of a tenth socket.

**Still open in slice C:** a dedicated wedge visual (only the generic `hullburst.ignite` / `hullburst.hit`
flares exist), a pad default, Fire Lance and Grip Bumper on this framework (slice E), and speed-scaling
tuning against real Massline arrival speeds.
