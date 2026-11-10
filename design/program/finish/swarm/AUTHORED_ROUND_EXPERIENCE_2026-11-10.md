<!-- LIFETIME: DESIGN_PROPOSAL -->
# Swarm: author the run, not just the next collision

2026-11-10. Creative-direction proposal grounded in the inspected implementation. This file
does not change runtime behavior, supersede the master plan, claim release acceptance, or
authorize publication. Its purpose is to turn the existing tools into designed levels.

## 1. The player promise

The owner's stated intent:

> the swarn mode is supposed to be an evolving challange with different enemies and powers and shopping in between some of the rounds like a tower defense game, it needs to be a physics playground demolition derby with an arcade point style system that the player uses to prepare for the next round it's like black ops zombies, it progressively gets harder and harder until you die. it's like 'how far can you go?' but with customization and levelup mechanisms

The current request adds: “Same with the swarm levels, those levels have to be designed ...”

**Design promise:** You learn a dangerous room, turn it into your weapon, spend what you earn
to change your next fight, and survive long enough for the room to become spectacularly more
dangerous. Your eventual death should suggest a different preparation or decision next time.

The Zombies reference supplies anticipation, a dependable round ritual, recognizable special
rounds, preparation under scarcity, and the urge to beat your previous depth. Tower defense
supplies choosing and maintaining a useful position. The demolition derby supplies persistent
physical consequences. None requires adding a second tower-defense mode, a new currency, or
a tutorial menu.

The authored unit is a complete round: **a spatial question, a readable opening, escalating
pressure, an earned clear, and a preparation decision whose value becomes visible next round.**
An encounter is not finished because four enemies spawn correctly. It is finished when a
player can understand their relationship, choose among viable responses, and recognize the
consequence in ordinary play.

## 2. Evidence and status boundaries

Status keys used below:

- **Existing source:** inspected in the local shared checkout. This establishes code/data,
  not that the current release contains it or that ordinary play feels good.
- **Published draft:** inspected in PR #942 at head
  `cb43fbb67b3d53d704cbca268ddf64ba8f841dd1`. Published is not merged, deployed, or accepted.
- **Local candidate:** present as uncommitted work, separate from #942's exact closure.
- **Planned:** authored by this proposal; not implemented by this file.
- **Unknown:** requires exact-build integration or player-route evidence.

The inspected checkout HEAD is `7dc248acec452df4afcd0a5b71ad0507cd6c17ec`, with substantial
concurrent work. The proposal preserves it all. #942 was read through GitHub, including its
current head and the turret commit immediately before it. Older PR-body test/CI snapshots
belong to the heads they name, not automatically to the latest head.

### What we can build on

| Ingredient | Evidence | Status and consequence |
|---|---|---|
| One-press opening | `src/data/swarmQuickStart.js`: Foundry, Ricochet Runner, Contender, no initial armory | Existing source. Preserve the ordinary entry rather than adding setup gates. |
| Finite rounds | `swarmMode.js`, `survivalWavePlanner.js`, `survivalWave.js` | Existing source. Ships own clear progress; Brood are supplemental pressure. A timer is not the ordinary win condition. |
| Pressure and horde | `swarmMode.js`, `swarmBrood.js` data | Existing source. Ten simultaneous ships at round 1; ship concurrency tops at 30. Brood population starts at 100 and reaches 400 at round 21, reduced on most bosses. These are separate populations. |
| Learnable ship characters | `swarmCharacter.js`, `swarmSpecialists.js`, planner debut packages | Existing source. Distinct silhouette/ability/counter contracts and delayed newcomer arrivals already exist. |
| Early physical compositions | `swarmOpeningVolley.js`, `swarmOpeningFlanks.js`, `swarmOpeningSpitter.js`, `swarmOpeningCrossfire.js` | Published draft. Round 1 throws through three mites, 2 opposes flanks, 3 isolates a Spitter, 4 combines throw and acid dodge. These are conditional openings, not full-round scripts. |
| Boss becomes ammunition | #942 boss-chunk increment `09622b7821f3ca3dba7255ec7597202b655d5138` | Published draft. Native chunk release/contact and attributed payment have scoped evidence. The fixture starts later directly; no earned boss-to-next-round journey was demonstrated. |
| Enemy cooperation has physical counters | #942 Shield Linker and salvage increments; `swarmMachine.js` | Published draft. Throwing mass can cut links, and catching loose salvage interrupts welders. The relevant families arrive very late. |
| Shelter actually matters | #942 turret increment `4143764e2d19091d4506935f4ce671713fd6a442` | Published draft. Stone clips damage and the transported visible beam. Only turret presentation was transported in this increment. |
| Bank counter has a route | #942 current head; `swarmBank.js` | Published draft. Full conservative native-envelope sidestep admission, alternate flank or ordinary fallback. It is not a guarantee against arbitrary later obstacle movement. |
| Four sizes of ammunition | `swarmArenaLadder.js` | Existing source. Pebbles → boulders at wave 4 or 25 t → monoliths at wave 7 or 80 t → wreck-sized matter at wave 10 or 180 t. Smaller classes remain. |
| Spatial preparation | `swarmFortify.js` data and system, `swarmFortifyPanel.js` | Existing source. Five devices, six sockets, facing, repair and turret rearm. Do not describe it as only four devices based on older prose. |
| Build growth | `swarmDraft.js`, `swarmWeaponLevels.js`, `swarmPerks.js`, `swarmHangar.js` | Existing source. Verb offers, legendaries, call-ins, gun levels, two perk slots and persistent Hangar growth already exist. |
| Arena personalities | `survivalArenas.js`, `arenaModuleLibrary.js`, `swarmEvents.js`, `swarmOpticArenas.js` | Existing source. Seven different physics laws, with actual installation seams. |
| General Brood worker presentation | `swarmBroodPresentation.js`, dirty transport/render hunks, `BROOD_WORKER_VIEW.md` | Local candidate. Do not count it as part of inspected #942. The report records nonpixel production-host/presenter evidence, not browser or full-run acceptance. |

### The gaps that matter to level design

1. **Several composers speak at once.** Ship debuts, Brood debuts, room phases, events, mass
   tiers, and shop growth each have their own clocks. The first boss at round 5 shares its
   debut with Detonator Dart and Spore Drift. Round 9 introduces Warden Escort and Lantern
   Cyst. Round 15 combines Foreman, Patrol Lawman and Wake Eel. These are live data collisions,
   not necessarily proven bad fights, but they contradict a dependable one-new-question
   teaching sequence.
2. **The first four openings do not own the whole fight.** Brood staging does not establish
   that full-size ship fire, the room field and the camera leave that lesson readable.
   The source also gates these openings on zero Line rating. A player buying a Line upgrade
   can bypass the next authored opening. The level must account for that choice deliberately.
3. **A legal placement is not a designed place.** Reusing safe surviving props is correct.
   Falling back safely is correct. Neither establishes how often a player gets the intended
   experience after moving, throwing, shopping, or upgrading. Measure that on earned runs.
4. **The round counter and horde can tell different stories.** Killing Brood earns rewards
   but does not discharge the ship cohort. The player must understand why the round continues
   after a spectacular crowd kill, without showing two equally loud counters.
5. **A good late mechanic can be almost invisible to most players.** Machine family debuts
   are rounds 26/32/38/44/52/58/64. Link-cutting and beam shelter need later authored acts,
   but polishing a wave-64 fixture does not finish the first ten minutes.
6. **Growth needs a trustworthy payoff.** The local `bossWasCleared()` checks rounds 10, 20,
   30... against the current 5, 15, 25... boss predicate. A direct pure-function probe returned
   false, and cash-out fraction 0.5, after cleared waves 5, 10, 15 and 20. This is a concrete
   local-source progression inconsistency, not a fresh remote or UI diagnosis. Separately,
   the ladder awards its first boss milestone at 5 but its next checkpoint starts at 11.
   Decide whether that skip is intended before teaching players a checkpoint promise.
7. **We cannot yet judge the actual image from this audit.** No new browser playthrough,
   screenshot review, hardware-input session or laptop performance measurement was performed
   for this design. In particular, the published narrow turret feed is not general horde
   presentation. A visible horde is a prerequisite to approving these levels.

## 3. Level grammar: one foreground question, many physical answers

Every authored round should specify the following before implementation:

| Field | What must be decided |
|---|---|
| Question | What decision is this round asking the player to make? One sentence. |
| Foreground threat | One new threat or one familiar combination. Which tell gets visual and audio priority? |
| Spatial relation | Where are the player, tool, threat, danger and escape relative to each other? |
| Alternative | What works if the player shoots, moves, or uses another build instead of the featured trick? |
| Opening / pressure / finish | How does the first readable beat become a crowd fight and then an earned clear? |
| Preparation | What purchase or Fortify placement has an obvious payoff here? What does saving buy later? |
| Persistent consequence | Which original rock, wreck, device or scar can carry into the following round? |
| Fallback | What legal alternate composition preserves the question if its preferred geometry is unavailable? |
| Read | What a player sees, does and feels, with actual-camera evidence required later. |

**Foreground ownership is a plan decision, not another simulation manager.** Extend the
existing wave-plan data so the ship planner, Brood owner, arena installation and preview read
the same intent. Keep damage, physical motion, stock, scoring, and phase transitions with
their current owners. Do not replace the current phase machine or add a competing director.

The opening can briefly stage a legible relationship without removing all danger. Once the
question is understood, pressure should come from a new angle or a consequence, not simply
from every unlocked enemy appearing together. Keep the existing dodgeable tells. When a
newcomer is the foreground, an unrelated arrival must not erase its first tell.

Every featured physical solution is an advantage, not an input exam. Shooting the opening
mites is allowed. Missing the first throw should create a salvageable messy fight. A novice
learns that the rock would have made it easier; the game does not withhold round completion.

## 4. Foundry as a place

**Planned room identity: a working scrapyard organized around a throwing court.** The player
should remember “the bank by the furnace” and “my left-side turret,” not only a circular
spawn radius. The first seven rounds reuse the same landmarks while changing their meaning.

### Readable layout

- **Center: the throwing court.** Room for a starter ship to thrust and brake; two crosswise
  exits. One small throwable in easy reach with a clear line through fodder. More ammunition
  is nearby, but not all props are highlighted at once.
- **Left shoulder: the return bank.** A real reflective face, with a readable front and an
  open route around its end. It first catches a throw, later blocks a charger, and eventually
  supports a player-built reflector or turret angle.
- **Right shoulder: the furnace side.** Machinery announces its changing state in the world.
  Its dangerous space has an outside route. A moving part must visibly explain the impulse.
- **Outer spokes: preparation positions.** Existing front/port/starboard sockets remain the
  canonical Fortify sites. Their approaches are actual routes, not merely UI circles.
- **Beyond the playable pocket: a quiet industrial silhouette.** It establishes place without
  resembling active ammunition or obscuring the real boundary. No invisible enclosing wall.

These are topological commitments, not immutable world coordinates. Use the existing spawn-local
frame and native footprint checks. The local opening terrain already authors shoulders at
roughly ±150 WU and extends outward on rounds 2–3. Preserve original body identities; never
teleport a thrown prop back into a picture. If the player changes the room, the next encounter
must adapt to that room rather than undo the player's work.

### Existing visual kit to compose before commissioning art

`foundryFurniture.js` supplies shared rendered/contact dimensions for gates, shutters and
furnace bodies. `arenaFinish.js` supplies machined geometry and a three-value metal palette.
`foundryPlate.js`/`foundryBankSurface.js` supply bank surfaces. `swarmOpticArenas.js` already
places a Foundry fuse. `swarmArenaLadder.js` references existing rock, place and aftermath
families. Published specialist ship manifests include Swarm Warden, Jackal and Anchor hulls.

Compose this kit into landmarks, then judge the gameplay view. Do not infer an actual enclosed
foundry from `foundryEnvironment.js`: its active environment is deep-space reflection lighting,
not a visible room. Also do not mistake the ten-room Cull ladder for the seven selectable
Swarm arenas. They are different catalogs.

Asset requests, if the assembled scene still needs them: one unmistakable furnace silhouette,
one bank end-cap that explains a traversable exit, and one restrained gate state treatment.
Each must solve a named view/collision problem. A broad new arena-art pack is not the next slice.

## 5. The authored Foundry opening: rounds 1–7

All full-round arrangements below are **planned**. Existing opening behavior and published
physics are called out explicitly. Population totals are current baseline data, not proposed
new quotas or measured durations. Stake/mutator scaling can change the actual plan.

### Round 1: Throw the first strike

**Current foundation:** published three-mite lane beyond an eligible pebble; remaining Brood
held until the beat ends or the trio dies. Baseline: 15 ships / 100 Brood, 10 ship concurrency.

- **Sees:** a bright, reachable rock; three small approaching bodies lined beyond it; a bank
  behind them. The first full-size Wasp is recognizable as the round-progress enemy.
- **Does:** shoots to establish immediate power, then pulls or catches the rock and releases
  it through the group. A missed throw leaves guns and a crosswise exit available.
- **Feels:** “I did that,” followed by the delight that the room now contains more usable wreckage.
- **Pressure:** the successful throw opens the existing paced reserve. Full-size ship timing
  must leave that first causal chain readable; the rest of the round is a short actual fight.
- **After:** one visible improvement is affordable. The opening should reach its first choice
  faster than the later 60–90-second target. Do not lengthen it merely to match that band.
- **Proof:** an ordinary release, native impact, and player-attributed award on the same
  original rock. The known environmental fixture kill is not enough for this claim.

### Round 2: Choose which side to hold

**Current foundation:** published opposing Brood flanks, conditional on the surviving court;
Reaver ship debut. Baseline: 34 ships / 115 Brood, 11 ship concurrency.

- **Sees:** two approaches around the same bank, with the Reaver's call readable on one side.
  The side the player improved is visibly better defended.
- **Does:** commits to a flank, takes out the caller, then crosses the court while that pack
  scatters. A Fortify device can hold the other side briefly; it cannot clear both sides alone.
- **Feels:** “That purchase changed my plan.” This round establishes preparation as spatial,
  not just a larger damage number.
- **Pressure:** begin with one flank, then reveal the opposite approach. Do not make a second
  debut compete with the Reaver. Keep the court's escape open through the second arrival.
- **After:** offer a useful gun/handling continuation, a defensive alternative, and saving.
  Preview the next Spitter in one short line rather than listing the entire unlocked roster.

### Round 3: Dodge the mark, keep the room

**Current foundation:** published isolated first Spitter opening. Baseline: 38 ships / 130 Brood.

- **Sees:** the Spitter, its landing marker, and a clear sidestep all in the gameplay view.
  A stationary escape endpoint outside the camera is not adequate.
- **Does:** moves after the mark commits, brakes in the safe strip, then returns fire or throws
  the rock. Later acid marks make the player abandon one favored position temporarily.
- **Feels:** first apprehension, then confidence: the threat was understandable and avoidable.
- **Pressure:** rehearse the same threat from a second bearing before mixing it with dense
  fodder. No new ship mechanic in this round. The player's chosen defense must remain reachable.
- **After:** preparation focuses on mobility, crowd gathering, or repair. Saving is valid if
  the player is already comfortable; the next round asks them to perform both learned actions.

### Round 4: Throw, then move

**Current foundation:** published mites ahead plus Spitter behind, with checked throw and escape
lanes. Baseline: 42 ships / 145 Brood. Choir Zealot currently also debuts here.

- **Sees:** the familiar throwing line and the familiar acid tell from the opposing side.
- **Does:** starts the throw, cuts/releases, and moves crosswise rather than admiring the hit.
  A gun-first player can kill the Spitter and use the same opening to retreat.
- **Feels:** competence under pressure: two familiar rules now make a new problem.
- **Pressure:** the combination is the foreground. Stage the Zealot only after that opening
  resolves, or move its teaching beat to a later available round; do not silently erase it.
  The boulder-tier transition must retain a small throwable for unupgraded builds.
- **After:** the first deliberate boss preparation. Show Iron Maw's actual counter and the
  player's current useful options. Repair and a meaningful upgrade must compete with buying
  a fortification, rather than the starting purse paying for everything at once.

### Round 5: Break Iron Maw

**Current foundation:** first boss is Iron Maw, not round 10. Baseline: 23 ships / 100 Brood,
15 ship concurrency. Existing capital score owns its attacks and exposed parts.

- **Sees:** the familiar court occupied by one unmistakably heavy body. The boss's attack and
  the object available to exploit it form the dominant image. Small enemies are ammunition.
- **Does:** survives a telegraphed attack, uses the recovery to put loose mass into a vulnerable
  side, and opens a repeatable opportunity. Guns remain useful for fodder and finishing.
- **Feels:** intimidation becoming control. The player beats a machine by understanding it.
- **Pressure:** keep the boss as the only new foreground lesson. Detonator Dart and Spore Drift
  currently unlock here; author their first readable appearances elsewhere or after the boss
  lesson is established. Retain finite population/accounting, not endless adds as a time tax.
- **Payoff:** its original chunks stay in the room. Show one reachable useful piece, not a
  screen-wide white burst. Not every new pilot can wield the 464 t chunk used in the published
  fixture. Prove an appropriate piece is available for the actual player's rating, or provide
  a useful shove/cover role without pretending a too-heavy piece is throwable.
- **After:** a compact reward moment, a build-defining decision and an invitation to continue.
  The end of this boss is the beginning of a more powerful run, not a victory screen.

### Round 6: Make the wreck work for you

**Current foundation:** Mine-Layer Jackal debut; boss-chunk contact adapter. Baseline: 42 ships /
175 Brood. The current mass-gap machinery can also compete for attention here.

- **Sees:** recognizable wreckage left by the boss and one Jackal laying a visible mine route.
  A surviving Fortify device is damaged, empty, or useful for a clear physical reason.
- **Does:** bowls a usable original chunk through fodder, or leads pursuers across the mine
  route while staying outside it. This is a payoff for the preceding victory, with real risk.
- **Feels:** “The thing that nearly killed me is now my weapon.”
- **Pressure:** let the first wreck use complete before tightening a corridor. If the full-size
  mass-gap wall is foreground, the Jackal should support that same question, not add a separate
  one. Keep one route that a light, gun-focused build can use without moving a monolith.
- **After:** repair/rearm versus further personal power becomes meaningful. Do not respawn a
  deleted or thrown boss piece just to force a rehearsed screenshot.

### Round 7: Let the charge spend itself

**Current foundation:** Charger debut and existing Bank composition, with the published escape
correction. Baseline: 42 ships / 190 Brood, 18 ship concurrency; monolith tier becomes available.

- **Sees:** a Charger opposite a rock, a Spitter claiming one side, and an open route on the
  other. The rock is still real cover/ammunition, not a special invulnerable tutorial prop.
- **Does:** baits the charge, sidesteps and brakes; the Charger strikes the rock. Then the
  player chooses whether to leave that cover in place or throw it through the next push.
- **Feels:** mastery with a cost: using the best weapon can remove the safest shelter.
- **Pressure:** the existing Bank should not repeat verbatim on every later eligible round.
  Its later variants must change a decision, such as a second approach or moved cover.
- **After:** show the earned depth and preview the sniper. The next attempt should be tempting
  even if the player dies here. A terrain kill without player provenance must not fabricate
  points; readable success does not require a fraudulent score award.

## 6. Rounds 8–15: build a recognizable second movement

This is planned level direction, not a request to implement all eight rounds before validating
1–7. Keep current legal enemy unlocks unless the shared authored schedule explicitly changes them.

| Round | Player sees / does / feels | Authored relationship and preparation payoff |
|---|---|---|
| 8, Sightline | A Lancer charges across the open court; get behind the original bank, then attack from its end; feel clever rather than chased everywhere. | Cover is a temporary resource. A turret/reflector placement supports one angle. Minor event must not hide the first charge line. Verify the Lancer's own LOS behavior; Machine turret cover does not prove it. |
| 9, Break the Guard | One visible Warden protects a valuable threat; separate or kill it, then exploit the opening; feel deliberate target priority. | Delay Lantern Cyst's independent debut beat. Introduce it only after the guard relationship is clear, or reschedule it. Two support tells at once are a later combination. |
| 10, Hold the Yard | A telegraphed machinery/mines event crosses prepared routes; defend the useful side and abandon the compromised one; feel the fortification plan under stress. | Special round, not an extra boss. Existing major-event slot and post-round refit support it. Corsair debut is staged into the same route question after the event's first warning. |
| 11, Scrape Them Off | Leechers interfere with escape; use a known safe surface or other valid counter, then resume offense; feel vulnerable without losing control. | A short recovery encounter after the major event. Debut should not coincide with an unseen new wall or instant full-density surround. |
| 12, Reveal the Hunter | A Quiet Ghost disturbs the room; bring it through a visible field, then punish its reveal; feel hunting replace panic. | Reward a gravity/field build without making that purchase mandatory. Author a visible alternative reveal/counter using existing mechanics. |
| 13, Lose the Habit | Cutter's EMP threatens a usual power rotation; leave its ring and use guns or cover; feel adaptable. | Glassback also unlocks now. Put that second lesson in a separated beat or move it. Do not take away every fallback while teaching power denial. |
| 14, Clear the Screen | A PD escort defeats careless ordnance; prioritize it before the big bomb; feel the value of preparation and restraint. | Preview the Foreman. A poor build can repair and change one part; do not demand a complete expensive rebuild. |
| 15, Cross the Foreman | The boss commits to an authored pass; cross behind it and use the room; feel a recognizable second exam rather than a larger Maw. | Current boss score is the foundation. Lawman and Wake Eel debuts must not compete with the first boss tell. A successful build performs something visibly impossible in round 1. |

The 60–90-second ordinary-round target in the active Swarm direction remains a pacing target,
not a forced clock. A strong build may clear faster. A boss earns more time through distinct
phases, not inflated health. In the existing source `swarmLevel()` stays at 1: preserve that
anti-health-inflation principle.

## 7. Preparation and progression are part of each level

### A round-end ritual with different emphasis

Keep the currently supported between-round armory and manual next-round launch. Every round
can have a short stop; only selected stops need a substantial shopping/fortifying decision.
This meets the owner's requested rhythm without immediately rewriting phase cadence.

1. The fight truly resolves. Let the cause of the final kill finish visibly.
2. Show the round clear and what was earned, once.
3. Show the next specific problem and a small useful set of choices in the existing shop.
4. Let the player repair, buy, Fortify, save their credits, or launch. No countdown forces a pick.

After rounds 1/3/6, emphasize a quick continuation. After 2, emphasize defending a flank. After
4, emphasize boss preparation. After 5, emphasize a build-changing payoff. After 7, emphasize
cover and the next ranged threat. Advanced browsing remains available but does not compete
with the three meaningful choices on entry. These are presentation emphases, not new tabs.

### Make the wallet produce decisions

The existing default Contender purse is **750 credits**. Current Fortify costs are **80** for
Gravity Beacon, **90** for Reflector Fin, **120** for Repulsor Pylon, **150** for Tesla Pair and
**180** for Kinetic Turret. Their sum is **620**. Even before earnings, the default purse can
cover the prices of all five device types, subject to placement limits. Therefore “choose one
defense or an upgrade” is not yet an established scarcity claim.

Do an earned-run economy pass alongside the first level slice. Log starting wallet, actual
earnings, repair spending, chosen purchases and remaining wallet after each round. Pick the
smallest existing stake/purse/price adjustment that gives a novice one meaningful choice without
punishing necessary repairs. Do not pick a new exact purse from this desk audit. Keep Exhibition
generous and the explicitly harder stakes distinct. Never silently rewrite an active run's stake.

Keep existing run credits as the spendable arcade reward and score as the performance record.
Say which number can be spent. Do not imply that buying a turret consumes high score, or invent
a score-to-credit conversion. No additional currency is proposed.

### Three concrete build promises using existing content

| Build | Early decision | Mid-run change | What the player should actually do differently |
|---|---|---|---|
| Wrecker | Reel/Whip or improved Line handling | Appropriate mass tier plus Graviton Heart or other compatible room upgrade | Gather a pack, carry a heavier object, release through it, then fight around the resulting wreck. |
| Bank Gunner | Bank/Carom with a deliberate reflector facing | Pierce/Fork or a compatible gun-level purchase | Choose angles and bounce lanes rather than circle-strafing every target. Cover and ammunition can be the same object. |
| Yard Defender | Gravity Beacon or a chosen turret lane | Tesla/Repulsor support, repair and real rearm choices | Funnel danger, protect a useful device and rotate when its lane becomes unsafe. Remaining mobile beats unattended automation. |

These are examples, not new classes or hard-locked recipes. A damage-increasing gun level is
useful, but must not displace every verb-changing offer. Test at least two mixed builds and a
player who buys imperfectly. Enemy counterweights should create a decision, not invalidate the
player's investment whenever the recommender notices a dominant build.

### Persistent progress

Use existing stars, arena unlocks, perks and Hangar rather than introducing another tree.
Recommended semantic direction: the first boss is a milestone; the player can immediately see
what it earned; defeat ends the run with a clear deepest-round record; retry is easy.

Before promising a “continue after this boss” checkpoint, reconcile the 5/15 boss cadence with
10-round zones, current checkpoint starts at 11/21, refits at 10/20, and the banking helper.
A checkpoint at 6 after the first boss would preserve the newly learned wreck payoff; that is
a **proposed rule change**, requiring save/record compatibility and explicit UI text. It is not
already implemented. Until decided, say the exact existing checkpoint start instead of
promising contiguous progress. The 1–7 vertical slice can be accepted without inventing a new
checkpoint system, but not with a false banking/reward promise.

## 8. The other arenas need different decisions, not merely different colors

The seven selectable arena laws already exist. Develop each after the Foundry's complete
opening works. Preserve their actual module/field owners and authored assets.

| Arena | Spatial signature to author | First lesson → combination → special-round payoff |
|---|---|---|
| Ricochet Foundry (`helios_core`) | Throwing court, bank shoulders, furnace side | Bank a group → throw while dodging acid → defend or abandon a prepared lane. |
| Lagrange Crucible | Two anchor points and an open sling corridor | Let a well curve a throw → cross a moving pull while a pursuer commits → turn a room-wide tide into an escape. |
| Cinder Sluice | A readable upstream/downstream channel with a side pocket | Ride the flow out of danger → release mass upstream and meet it downstream → survive a surge by choosing when to leave shelter. |
| Cryo Drift | A cold island, a hot edge and breakable material between | See stored/slowed momentum → break or move a plate to release pressure → thaw changes yesterday's shelter into flying ammunition. |
| Storm Lattice | Separated conductive routes and a readable safe gap | Make one visible circuit → reposition a conductor while avoiding an energized route → choose which lane to power for a crowd kill. |
| Asteroid Mill | A dense seam with deliberate entry and exit lanes | Break useful matter loose → fight while the seam becomes debris → choose ore opportunity versus keeping an escape open during the grind. |
| The Hive | Living boundaries with breaches you can remember | Open a passage → decide whether to kill a sac or preserve the route → the room closes while you carry its own remains through the breach. |

These signatures use existing laws as starting points. Specific circuit damage, thermal
release, wall motion and payout must be verified at their actual owners before scripting a
claim around them. No asset or prose name alone proves the mechanic.

For each arena author a short opening, a three-round combination act and a boss interaction.
Do not deploy the same six room tokens with different labels and call it seven finished levels.
The menu image, live silhouette and collision layout must describe the same place.

## 9. Endless escalation after the opening

After the first 15 rounds, escalation should increasingly test combinations and commitment.
Keep horde caps and bounded costs. Repeated health growth is not the difficulty design.

- **16–25: space control.** Tether raider, brawler and anchor controller change where the player
  can operate. Reuse familiar banks and escapes, then require a relocation. Foreground one
  relationship, such as breaking the control hull before moving a heavy object.
- **26–37: organized opposition.** Existing authored ship acts at 26–28 and 32–34 and Machine
  formation/sawblade introductions are substantial seeds. Align them across the population
  clocks. A formation asks for a crossing shot; a blade asks the player to leave a habitual orbit.
- **38–51: fight over resources.** Repair Drone and Magnet Sentry make debris contested.
  The player sees the weld begin on an original body, catches that body, then decides whether
  to keep it as cover, throw it, or deny it to the enemy. No score for catching alone.
- **52–63: dismantle a network.** Shield Linker and Assembler turn familiar ammunition into
  a way to interrupt cooperation. Show the shielded target, the link and its source together.
  One surviving protection source must remain visible when a second link is cut.
- **64 onward: shelter under fire.** Machine beam sweep gives the late defensive build a real
  question: retain cover or spend it. Combine with a known flanker only after the shelter rule
  has been demonstrated. Do not add a new untelegraphed attack just to kill a strong build.

For repeat cycles vary one major relationship at a time: approach orientation, second support,
moving cover, temporarily unavailable lane, or reserve arrival. The player should recognize the
old problem and the new complication. Boss recurrence needs changed context, not a Roman numeral
and invisible HP. Deep rounds should end because readable pressure exceeds execution or the build
has an exploitable weakness, not because every family is equally active everywhere.

## 10. Next coherent vertical slice: Foundry, first launch to round 7

**Deliverable:** one playable, earned run from the ordinary Swarm entry through the first four
lessons, meaningful shopping/Fortify, Iron Maw, reuse of its wreckage, and the Charger Bank.
The run may end in death; it must support an immediate honest retry. A short video/capture set
of that route is the design evidence. This is one player outcome, even if implementation uses
several exact-path commits.

### Work packages that serve that single outcome

1. **Make the whole fight visible on the real execution route.** Reconcile the separately
   reviewed general Brood projection candidate with #942's turret transport. Preserve generation,
   pause, retirement and retry behavior. Verify bodies, acid tells, pools, links when present,
   and original physical props together. A missing horde is an integration blocker, not a
   level-balance opinion. This does not authorize blindly replacing shared render/core files.
2. **Author the shared 1–7 score.** Use existing plan packages and opening helpers. Introduce
   one plan-owned foreground cue/beat description if necessary, with explicit ship, Brood,
   arena and event consumers. Resolve round-5 collisions and the upgraded-Line bypass. Choose
   useful legal fallback variants; preserve finite budgets and original prop identities.
3. **Build the persistent court and preparation payoffs.** Reuse inspected physical furniture
   and Fortify owners. Ensure the same routes survive ordinary movement and are readable after
   throws. The round-end display previews the actual next plan, not an unlocked catalog.
4. **Complete boss → wreck → next fight.** Earn the Maw through prior rounds, defeat it using
   the live score, obtain a piece useful to the actual loadout, and put that same piece to use
   in round 6. Do not substitute an injected boss or canonical attachment for this final proof.
5. **Tune the run economy and resolve relevant reward truth.** Measure choices and repair
   costs on earned play. Check the current banking inconsistency on the exact integrated build
   and fix it only within the accepted progression scope. Keep checkpoint redesign explicit.
6. **Rehearse and correct the whole journey.** Exercise the default novice build, a Line-upgraded
   build, a gun-focused build, an imperfect shopping choice and a same-seed retry. Fix failures
   that undermine the run before commissioning the next arena or polishing a remote late wave.

### Existing integration seams

| Concern | Canonical seam / likely exact files |
|---|---|
| Round schedule and legal composition | `src/data/swarmMode.js`, `src/systems/survivalWavePlanner.js`; existing `SWARM_ACT` is a precedent, not permission to overwrite unrelated acts. |
| Brood staging and finite population | `src/data/swarmBrood.js`, `src/systems/swarmBrood.js`, `swarmOpening*.js`, `swarmBank.js`; preserve lifecycle and native-reference safeguards already reviewed. |
| Original room bodies and mass tiers | `src/systems/swarmArena.js`, `src/data/swarmOpeningTerrain.js`, `swarmArenaLadder.js`, existing arena installations. |
| Threat visibility | `src/data/swarmBroodPresentation.js` candidate, `swarmTurretPresentation.js`, precise transport/main-lane/render hunks; no gameplay ownership in a draw projection. |
| Preparation | `src/systems/survivalDraft.js`, `src/ui/screens/crucibleDraft.js`, `src/ui/swarmFortifyPanel.js`, existing Fortify intents and receipts. |
| Preview | `src/data/swarmLadder.js` `swarmRoundPreview()` and existing UI. It presently previews the major event helper; compare actual minor event selection before promising the event. |
| Rewards and continuation | `runSession` remains sole run/wallet writer; `survivalRun`, `survivalResults`, `survivalRecords`, existing Hangar/ladder pure helpers. |
| State and input | Existing save, generation, pause, rebind and worker contracts. No new movement owner or duplicate native simulation. |

Read exact diffs and current claims before any runtime edit. The files above are a dependency
map, not a lane-wide write reservation. Design should reduce integration work, not license a
wholesale import of the dirty checkout into #942.

### Acceptance: what makes this a finished level slice

- **Visible causality:** in the actual gameplay view, an observer can identify the throwable,
  intended target, danger cue and escape at each first encounter. The original object can be
  followed through the successful hit. Normal and reduced-motion/flash settings both work.
- **Earned sequence:** round 1 is launched normally; all subsequent rounds are earned; purchases
  use the real wallet; Fortify changes a later decision; the boss leaves real usable matter.
  Isolated fixtures remain valuable regression tests but do not replace this route.
- **Choice survives:** guns-only early survival is viable, the featured physical answer is
  materially rewarding, and an early Line upgrade does not remove the authored experience.
- **Learning survives pressure:** the first Spitter mark is seen before damage; the round-4
  throw-and-dodge can be executed with ordinary controls; the Bank's escape is on-screen and
  physically traversable. Later motion can still create honest danger.
- **Reward truth:** original player actions pay once, passive/environmental kills are not
  falsely attributed, the UI identifies spendable credits, and the post-boss reward matches
  what was actually earned. Brood spectacle does not lie about ship-clear progress.
- **Persistence and recovery:** same-seed retry starts fresh; pause does not consume the opening
  or invent attacks; ordinary Save/Continue, if offered for this run, restores a valid situation
  without stale presentation or phantom collision history. If unsupported, report the limit.
- **Pacing:** record actual first-choice time, round durations, time spent finding the last ship,
  forced repair spending and preparation time. Judge their pattern, not a single average.
- **Performance:** measure the complete ordinary route on the target hardware before accepting
  visual/placement additions. The current Bank publication records ~4.87 ms median in a
  saturated admission probe versus ~0.088 ms parent; the local full Brood transport report
  records ~2.17 ms p95 on its Node host. Neither is a GPU/frame-time result or a cheapness proof.

No new per-packet screenshot quota or broad test infrastructure is needed. Use existing focused
tests for changed contracts, ordinary-route captures for experience, and a matched performance
check for added work. Report implemented, focused-tested, route-accepted and unknown separately.

### Stop list for this slice

No new enemy family, currency, tier system, meta tree, room selector, general-purpose director,
physics engine, forced-throw tutorial gate, or broad asset pack. No additional wave-52/64
microfix is a substitute for finishing this route. Fix late mechanics only when they are a
regression of the integrated slice or a clearly separate authorized outcome.

## 11. Source record and checks performed for this proposal

- Owner wording supplied as verbatim conversation evidence by the parent task.
- Active taste/intent: `README.md` in this directory and the Finish master plan. Older claims
  such as wave-10 first boss or four Fortify devices were checked against current source.
- Local source inspection: the files cited above, plus `swarmEvents`, `swarmSupply`,
  `swarmCharacter`, `swarmWeaponLevels`, `swarmHangar`, `swarmPerks`, `combatLabSetups`,
  `survivalArenas`, `arenaModuleLibrary`, `foundryFurniture`, `arenaFinish`, and live read-model
  consumers. The local working tree was not treated as the remote PR closure.
- Remote read: [PR #942](https://github.com/coldshalamov/SpaceFace/pull/942), head
  [cb43fbb](https://github.com/coldshalamov/SpaceFace/commit/cb43fbb67b3d53d704cbca268ddf64ba8f841dd1),
  and preceding turret commit
  [4143764](https://github.com/coldshalamov/SpaceFace/commit/4143764e2d19091d4506935f4ce671713fd6a442).
  Its 429-case head aggregate is a recorded publication result, not a test rerun for this audit.
- Direct read-only Node probe: queried current pure helpers for rounds 1–15, their ship quotas,
  concurrency, Brood populations, bosses and debut clocks; queried the banking helper at
  cleared rounds 5/10/15/20. Those values support this file's specific numerical statements.
- No runtime files, existing design files, assets, tests, Git index or branch were changed by
  this task. No remote write, merge, deployment, new execution thread or separate checkout.
- Not performed: new browser/GPU inspection, user hardware play, full test suite, exact-head
  CI attribution, or a new balance measurement. The proposed slice remains planned.

**The next creative decision is the complete Foundry experience, not the next isolated adapter.**
The existing mechanics are enough to author it. The work is to make their order, place, reward
and consequence intelligible to a player who has not read the code.
