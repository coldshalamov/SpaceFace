# 00 — Rulings: where the owner's latest words change the written design

**Director, 2026-11-18.** The owner described the whole game in one sitting on 2026-11-18 (the
"two maxima" message, preserved in `01_THE_GAME.md` §0). Several of those sentences contradict
documents that agents are told outrank everything (`design/game/09–20`, `design/FEEL_CONTRACT.md`,
build-map rows). An executing agent that finds the conflict will follow the older page and undo the
work. This page settles every conflict once. **Where this page and an older page disagree, this page
wins. Where this page is silent, the older page stands.**

Authority, highest first:

1. The owner's own words, newest first (2026-11-18 is the newest).
2. `design/VISION.md` (Parts I and II).
3. **This folder, `design/overhaul/`.**
4. `design/game/09–20` and the rulings in `design/game/README.md`.
5. `design/FEEL_CONTRACT.md` bars, as amended below.
6. Everything else (build map, older programs, packets).

---

## Conflicts between the owner's latest words and the written design

### R1 — Progression: a skill tree and experience, alongside the rope

- **Was:** doc 10 D3 — "One ladder: your rope gets stronger. No experience points… Research points go."
- **Owner, 2026-11-18:** "there should be skill points and probably experience of some sort… skill and
  equipment trees… you could spread all your points and credits across the tree but you'd be kind of
  weak, you'd have to really find your niche and maximize it."
- **Ruling:** three ladders, each one a sentence a player can say, each one physical:
  1. **The Pilot Tree** — *how I fight.* One skill tree, shared by both doors, whose branches are
     fighting styles. Earned with experience from everything you do. Swarm fills it in minutes and
     resets it every run; Adventure fills it over tens of hours and keeps it. (`06_PROGRESSION_AND_ECONOMY.md`)
  2. **Line Class** — *what my rope can take.* Earned by tonnes moved, both doors, as now.
  3. **Ship and gear** — *what I fly and carry.* Bought, found, salvaged, forged.
- **What survives from D3:** its purpose. A new player can say how they get stronger in one breath:
  *"I level my pilot to specialise, my rope grows by hauling weight, and I buy or steal gear."*
  Research points still go. The radial Research screen is rebuilt as the Pilot Tree; equipment stops
  being researched and is bought, found or made instead.

### R2 — Jobs: Freelancer labor is the start of Adventure, and every job is physical

- **Was:** doc 10 D10 — "Fly-there-and-dock jobs (cargo, bulk, passenger, smuggling) stop being
  offered as headline work until they involve the Line."
- **Owner:** "you hit gigs or steal or work. You get money for missions, you mine asteroids, sell the
  stuff… you can become a trader. You can also be a pirate."
- **Ruling:** trading, hauling, bounty work, piracy and laser mining are the first economy of
  Adventure. D10's real complaint stays law: **no job may be a menu plus empty travel.** Cargo is
  carried visibly or towed; routes have interceptors; piracy is cracking a hauler and Lining its pods;
  a trade run can be ambushed and turned into a fight or an escape. (`05_ADVENTURE.md` §1)

### R3 — Buying: gear on the floor, skills on cards

- **Was:** doc 12 — "Nothing is bought in a menu."
- **Owner:** "the customization UI in Swarm needs to basically make that system accessible… relatively
  limited set of decisions at any one point."
- **Ruling:** two different things.
  - **Gear** (guns, Taps, the Crate, the Forge, doors, traps) is bought on the floor, mid-round, by
    flying to it. Doc 12 stands.
  - **Skills** (the Pilot Tree) are picked from three cards at level-up, in the breath between rounds,
    never over a live fight unless the player asks for it (`04_SWARM.md` §3).
  - The between-round **Armory / "Ship equipment" screen and its "Browse all" catalog are retired from
    Swarm.** The Bench every tenth round (refit, change ship, cash out) is the one menu.

### R4 — The yard: a place you play, inside and out

- **Was:** doc 17 §6 — "It is a place you can fly up to, never a management screen."
- **Owner:** the rover inside the asteroid, building next to materials, "the physical layout of the
  asteroid becomes a type of strategy puzzle… kind of like Mindustry", drones, security, passive income.
- **Ruling:** both are kept. The yard has an **outside** you fly around (lamps, a dock port, a hopper,
  drones flying real lanes, turrets you drilled to the surface) and an **inside** you play with the
  rover (the dig board). The board is a spatial puzzle driven by your own hands, not a dashboard. The
  current **Base Operations** and **Automation** screens (cr/min, "cap load", "headroom") are retired as
  primary interfaces. (`05_ADVENTURE.md` §3–§5)

### R5 — Guns: damage and kick are a trade, not a hierarchy

- **Was:** build-map row 482 ("guns become the nudge and the finisher"), `src/data/weapons.js` starter
  comment, doc 17 §3 ("A player who only shoots is always poor"), pinned by
  `test/zc-a34-guns-nudge.test.mjs`.
- **Owner:** "are you going to get the minigun which blasts tons of tiny bullets and soak them with
  constant damage but not knock them back visibly at all, or the cannon gun that wallops them… so hard
  they become a weapon themselves."
- **Ruling:** every gun sits on one curve — more damage, less kick; more kick, less damage. A pure-gun
  build can win a Swarm run (that is how Crimsonland is played). Kills by collision still pay more
  Scrap (doc 17 stays), so the physics path is richer and louder, but the gun path is not poor. The
  starter gun stops being deliberately weak. The pinned test is rewritten with this sentence in its
  message, per FEEL_CONTRACT D2. (`03_COMBAT.md` §3)

### R6 — Planning documents

- **Was:** doc 10 §8 — "From here there are no new plan documents."
- **Owner, 2026-11-18:** "keep a set of running documents planning out all the changes and improvements."
- **Ruling:** this folder is that set. It amends `design/game/` where it says so and is updated in
  place as work lands (the ledger in `02_INSPECTION_LEDGER.md`). No other plan bank is started beside it.

---

## Conflicts between two things the owner has said

### R7 — "Start with everything" (2026-10-21) and "much of the game is locked behind doors" (2026-11-18)

- The 10-21 ruling was about **verbs**: the owner said gating powers behind tutorials or unlocks is not
  the fix for weak powers.
- The 11-18 vision is about **strength and specialisation**: "imagine the excitement when a player
  unlocks that badass weapon or ship that makes them a god in Adventure."
- **Reading that satisfies both:** every *verb* is available from the first minute in both doors — the
  Line, guns, boost, and all five powers in their base form. Progression unlocks *versions*: bends,
  heads, capstones, Forged guns, heavier hulls, a stronger rope. Nothing basic is researched or taught
  before it can be used; the god-tier forms are earned.

### R8 — "Sound off, never propose audio" (2026-10-21) and "no lapse in quality anyone would notice" (2026-11-18)

- **Reading that satisfies both:** the game must read completely with sound off — every sound has a
  visual twin — because that is how the owner plays. Audio still gets an A-list pass, because players
  and anyone watching a stream will have sound on. It is the **last** lane and never displaces picture
  or feel work (`09_SOUND.md`). Delete that file if the owner wants it gone.

### R9 — VISION "never collapse into an X4-style empire manager / a crafting treadmill / disconnected minigames" and the owner's asteroid industry

- **Reading:** R4, plus three hard rules. The interior board is entered from the ship and its work is
  seen outside (turret shafts fire in 3D space; drones fly real lanes). Industry exists to pay for the
  fight and is defended by fighting (raids are Swarm rounds on your own ground). There is no screen
  whose main content is income per minute.

---

## Conflicts between the owner's latest complaints and the feel contract

### R10 — The camera answers the player, not the room

- **Was:** FEEL_CONTRACT B9 — "Every collision with ΔV ≥ 8 WU/s produces hitstop and camera trauma
  scaled by exchanged momentum."
- **Owner (in the previous agent's session):** shaking on shots and hits "considering how many swarms of
  tons of objects and enemies are in this game, would just cause the whole screen to violently shake
  out of control all the time."
- **Ruling:** the camera moves for **your ship** (you were hit hard, you boosted, you were thrown) and
  for **your hero beats** (a throw kill on a heavy, a perfect release, a boss phase break) — one at a
  time, through `src/render/shakeAdmission.js`. Every other impact is felt **on the body that was hit**:
  a flash, a directional spark spray, a dent that stays, a tumble, a sound. Hitstop is presentation-only,
  ≤ 60 ms, at most once per 0.8 s, and only on hero beats. B9 is rewritten to this. (`03_COMBAT.md` §6)

### R11 — Physics stays honest; the world stays calm because its actors are competent

- **Was:** FEEL_CONTRACT B6 — terrain is lethal regardless of who caused the speed (provenance-blind).
- **Owner:** NPCs "didn't really know how to control the flight physics so they're constantly crashing
  into each other and triggering chain reactions of pinball crashing and everything's exploding."
- **Ruling:** B6 stays — a hull that meets rock at speed is hurt, whoever caused it. The world stays
  calm by four means, in this order: (1) loose rocks rest until something disturbs them; (2) NPC pilots
  manage speed near obstacles and each other; (3) spawns are clear of bodies and collision courses;
  (4) **one safety net:** a contact between two bodies that neither the player nor a hazard has moved in
  the last 3 s cannot kill and cannot open a law incident (capped at 15 % of hull). That is the only
  provenance rule in the physics. (`03_COMBAT.md` §5)

### R12 — The rope never refuses: mass decides who moves

- **Was:** the "one weight rule" (2026-11-16, `src/data/lineProgression.js` `entityOverLineClass`,
  `src/systems/lineProgression.js` overclass heat and snap): a body heavier than the class ceiling
  (20 t at class I) shows **TOO HEAVY**, slows reel and turn, and snaps the line after ~8 s.
- **Owner:** "when you're small the tether makes you swing around THEM like a little mosquito or
  hummingbird they can't hit… when you play a huge ship… when you tether something and pull, YOU PULL
  THEM."
- **Seen at HEAD 301d3fb074:** a brown asteroid under the cursor in Swarm round 3 reads TOO HEAVY. The
  rope solver (Rapier, `src/core/constraints/masslineController.js` header) already makes the lighter
  body move — the progression overlay is what blocks the fantasy.
- **Ruling:** latching is always allowed. The aim tag names the relationship instead of refusing:
  **ANCHOR** (it is much heavier — you will swing around it), **TOW** (it is much lighter — it comes with
  you), **TUG** (evenly matched — whoever thrusts wins). Line Class becomes the rope's tension budget,
  winch power and reach. Overload makes the line pay out and slip; it never snaps on a timer.
  "TOO HEAVY" is deleted everywhere. (`03_COMBAT.md` §2)

---

## Rulings of 2026-11-20 (the owner's words that day, and what follows from them)

### R13 — One rule, and no rule may block work

- **Owner:** "We have one rule: make a good game… I just don't want any agent ever deciding there's a
  blocker, or leaving work behind without finishing it."
- **Ruling:** the root `AGENTS.md` is the only rulebook. Every review-before-landing step, hold,
  parked state, lane, claim and ordering rule in this folder and elsewhere is void, including the
  Codex-review steps written in `11_ORDER_OF_WORK.md` and the older rows of `12_PIPELINE.md`. Work
  is reviewed after it lands and fixed forward.

### R14 — Built the way a game released today would be

- **Owner:** performance fixes "shouldn't be nuked to the stone age… make sure we have an appropriate
  modern solution for everything… you know what techniques wouldn't be caught dead in a modern
  A-list game."
- **Ruling:** slowness is fixed with architecture (data layout, shared queries, batching,
  time-slicing, streaming, prediction), never by making the game dumber, uglier or emptier. Every
  technique is chosen by asking what a current release does for that problem.

### R15 — Swarm is a horde; nothing holds enemies back

- **Owner:** "This is supposed to be a swarm shoot-em-up dogfight game, kind of like a spaceship
  Crimsonland… a lot of enemies are supposed to be able to attack at once." "In regular Adventure
  combat there's a radius that the enemies can even see… but in a mode like Swarm you'd want heat to
  be on the entire level… there just shouldn't be rules that only allow like 5 enemies to attack
  while the others are frozen."
- **Ruling:**
  - **Swarm:** every enemy in the arena knows where the player is and comes for them. No limit on
    simultaneous attackers, no attack permission, no spectators. The engine, enemy brains and
    drawing are sized for 200–300 attackers on screen.
  - **Adventure:** enemies have senses (a perception radius, an alert state, allies called within
    earshot, a leash back to their post). Whoever is engaged fights; whoever has not noticed the
    player does not.
  - **Everywhere:** if an enemy is not attacking, the reason is visible in the world (it has not
    seen you, it is out of range, reloading, fleeing, blocked). Group coordination shapes where a
    crowd comes from; it never restrains the crowd.
  - Fairness comes from numbers: fodder hits lightly and dies quickly; the dangerous attacks keep a
    readable wind-up.

### R16 — Life near the player, calm at the start, no silent respawn

- **Owner:** "Some places feel overcrowded, not like a real place… agents would find weird proxies for
  'action in the first 30 seconds', which apparently just means to flood units into the first sector."
  And: sectors "too empty or too crowded"; rocks should "respawn at logical times" without a
  depopulated galaxy and without the "move a bit to the left and it respawns brand new" feel.
- **Ruling:** one owner decides who is in a sector, from a cast sheet with roles and doors. The
  opening is a working harbour seen at a distance; the player chooses the first fight. Killed ships
  stay dead until a replacement arrives through a gate. Worked rocks look worked and recover over
  hours of play; a belt never falls under about 40 % stock; rocks the player built in never change.
  This replaces both "Helios needs more density" (older plans) and "no new world content" (2026-11-19).

### R17 — The powers and the Line say what they do

- **Owner:** "I can't tell what any of the powers do." "My actions don't do what I'd expect."
- **Ruling:**
  - The five powers are **Pull, Shove, Pin, Bomb, Plow** on 1–5, and the **Line** on right mouse and
    F. One name each, everywhere.
  - Every power acts **on press, at the cursor**. "Aim first" (hold to preview, release to fire) is
    a Settings option, off by default.
  - **Pin** nails a point in space: cast on a body it stakes that body for a few seconds; cast on
    empty space it plants a post the Line can swing on.
  - **Bomb:** press 4 again to detonate. Shove does not detonate by rule.
  - **Plow** never changes mode silently.
  - The Line's two buttons are one button with one grammar (tap to latch, tap to throw, hold to reel).
  - Nothing steals keys 1–5 in flight. Esc never starts a round. No prompt prints a blank or the
    word "unbound".
  - State lives on the power's tile and in the effect itself, never in a floating status chip.

### R18 — Plain words and human units

- **Owner:** "the UI is often filled with gibberish language."
- **Ruling:** `08_INTERFACE.md` §5's banned list stands and grows (Massline, Mass Seed, Gyre, Well,
  Repulsor, Cone and Rig as player-facing names are added). Distances read `m` and `km`, speeds
  `m/s`. US spelling. A check (`npm run check:plain-words`) fails on a banned word.

## Decisions the director made that the owner may want to overrule

These are judgment calls inside the owner's vision, made so work can proceed. Each is easy to flip.

1. **Swarm level-up picks wait for the breath between rounds** (with an option to pick at once in slow
   motion). The alternative is Crimsonland's instant pause at every level.
2. **Line Class stays as a separate ladder** from the Pilot Tree, because tonnes moved is the most
   SpaceFace-specific progression there is. The alternative is folding it into the Rigging branch.
3. **The Swarm run's money starts at zero** and is earned on the floor; difficulty changes pressure only.
   Today's 2,400 / 750 / 250 / 0 starting purses go.
