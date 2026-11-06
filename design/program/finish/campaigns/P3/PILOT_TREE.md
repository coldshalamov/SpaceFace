# P3 — One pilot, one progression (design doc, for the owner's approval)

**2026-11-06, Lane 4 (SHIP).** Nothing in this document is implemented. Master plan P3 says:
"design doc first (the tree, ~40 nodes, every node a verb change with a preview), owner-approved".
This is that document. Implementation starts only after the owner says yes.

---

## 1. What is wrong today

A player has **four progressions that never meet**:

| System | Where it lives | What it gives | What it counts |
|---|---|---|---|
| Research | `src/data/tech.js` — 35 nodes in 4 radial branches (combat 17, industry 7, logistics 7, drives 4) | unlocks ships and modules | credits + research points |
| Crucible perks | `src/data/swarmPerks.js` — 6 perks in run slots | run-only modifiers | a run's draft picks |
| Swarm draft | run-scoped card picks | run-only strength | the run |
| Ranks / standing | career + faction reputation | mission access, prices | play, but shown as a number |

Nothing in that table is *the player*. There is no answer to "what can I do that I could not do
yesterday", which is the sentence `design/VISION.md` says progression must produce: *"Progression
means increasing physical agency … 'What can I do now?' — not 'my damage number went from 170 to
212.'"*

Research is not a tree of verbs. It is a **catalogue with a price**: it opens the shop. That is a
useful thing, and it should stay — as the place **parts come from**, not as the character.

## 2. The shape

**One pilot.** A pilot level fed by everything the player does — Adventure contracts, Crucible
rounds, Swarm waves, salvage, trades, first-time deeds. One bank, one number, one screen.

**Five branches, each a verb.** A branch may only contain nodes that change *what you can do*; a
node that only raises a number is rejected at design time. Each node card must show a one-line
**preview** of the action it unlocks, written as a thing you can do, not a percentage.

| Branch | The verb it grows | Already in the game as |
|---|---|---|
| **Gunnery** | put damage where you meant it | weapons, gunnery arc, target lead |
| **Line Work** | attach, swing, reel, throw | Massline heads, spool, reel, swing drive |
| **Piloting** | arrive, turn, stop, break away | drive, thrusters, brake, boost, blink |
| **Engineering** | keep the machine running under load | power, heat, reactor, shield, repair |
| **Salvage & Trade** | turn wreckage and cargo into an advantage | mining, magnet, cargo, hidden hold, market |

**Run-scoped stays run-scoped.** Crucible perks and the Swarm draft are the *run's* build; they keep
their own picks and their own pacing. What changes is vocabulary: a perk says which branch it
belongs to ("Engineering"), so a Swarm player learns the same five words the Adventure uses. A run
never writes pilot XP into the main tree except through the normal end-of-run award.

**Research becomes the blueprint catalogue.** The radial screen keeps its rings and its light, and
changes job: it is *where parts come from*. Node names become part families ("Heavy autocannon",
"Frame coupler"), and the panel says which branch would use it. No new currency.

## 3. The tree — 40 nodes, 8 per branch

Every node below is a **verb change**. The `Preview` column is the sentence the node card prints
before the player spends a point; it is written as an action, not a stat. Costs are pilot points
(1 per node; branch capstones cost 2).

### Gunnery — "put damage where you meant it"

| # | Node | Verb change | Preview |
|---|---|---|---|
| G1 | Steady Hand | the first shot after a turn lands where you aimed | "Turn, then shoot, and the first bolt still goes where the nose points." |
| G2 | Cold Barrel | guns fire from a cold start without a spool delay | "Your first shot leaves the rail the instant you press." |
| G3 | Split Trigger | fire two mounts at two different targets | "Hold your aim on one hull and send the second gun at another." |
| G4 | Ranging Shot | see the exact impact point before you fire | "A mark shows where the shot will land before you spend it." |
| G5 | Line Shot *(capstone)* | fire down your own Massline at anything it touches | "Shoot along the line and hit whatever the line is holding." |
| G6 | Ricochet Read | see a shot's bounce off a surface before committing | "Aim at a wall and the bank shows you the second hit." |
| G7 | Hold Fire | charge a shot for a heavier, slower round | "Hold the trigger to load a heavier round and release it when it matters." |
| G8 | Called Shot | spend a long aim to hit one system on a hull | "Pick a system and take the time to hit exactly that." |

### Line Work — "attach, swing, reel, throw"

| # | Node | Verb change | Preview |
|---|---|---|---|
| L1 | Quick Hitch | latch a body in one press, at a longer reach | "Aim at anything within reach and it is on the line." |
| L2 | Two-Handed | hold two bodies on the line at once | "Hold two things: one in each hand." |
| L3 | Reel Under Load | reel while the line is under tension without losing the grip | "Pull something heavy while it is pulling back." |
| L4 | Brake Throw | spend your stored swing as one shove | "Swing, then brake, and the line throws what it was holding." |
| L5 | Anchor Shot *(capstone)* | fire an anchor into a surface and winch yourself | "Put an anchor in a wall and pull yourself to it." |
| L6 | Slack Line | let a towed body drift free without releasing it | "Drop the tension without dropping the tow." |
| L7 | Trip Line | a line across a lane trips whatever crosses it | "String a line across a lane and let the next hull find it." |
| L8 | Line Reading | see the load a line is carrying before you take it | "Look at a tow and see its weight and pull before you commit." |

### Piloting — "arrive, turn, stop, break away"

| # | Node | Verb change | Preview |
|---|---|---|---|
| P1 | Vector Flip | turn the nose without changing your course | "Kick the nose round and keep going the way you were going." |
| P2 | Short Brake | stop from speed in half the distance | "Stop in the space you actually have." |
| P3 | Boost Chain | spend boost twice without waiting for a full charge | "Boost, then boost again before you have caught your breath." |
| P4 | Drift Steering | steer while sliding | "Point one way and travel another and still steer the slide." |
| P5 | Threading *(capstone)* | pass through a gap at speed without clipping | "Fly a gap at full speed and come out the other side." |
| P6 | Mass Reading | see how a body will move when you hit it | "Look at a rock and see which way it will go." |
| P7 | Launch Assist | leave a dock or an anchor at speed | "Leave the berth already moving." |
| P8 | Long Burn | hold travel speed through a turn | "Turn at travel speed without dropping out of the burn." |

### Engineering — "keep the machine running under load"

| # | Node | Verb change | Preview |
|---|---|---|---|
| E1 | Load Shedding | shut down one system to keep another running | "Kill the lights to keep the guns fed." |
| E2 | Heat Dump | dump stored heat as a visible flare | "Vent the heat you cannot use, and light up while you do it." |
| E3 | Cold Restart | bring a dead system back once per fight | "Bring one dead system back without docking." |
| E4 | Split Bus | run two systems off one capacitor without dropping either | "Feed two systems when the capacitor can only feed one." |
| E5 | Manual Vent *(capstone)* | vent the reactor to survive a lethal overload | "Blow the reactor to keep the hull." |
| E6 | Field Patch | repair one subsystem mid-flight | "Patch one broken system while you fly." |
| E7 | Shield Weave | share shield between two hulls | "Give some of your shield to the ship beside you." |
| E8 | Draw Reading | see what each fitted system is costing you | "Look at the bank and see which part is eating the margin." |

### Salvage & Trade — "turn wreckage and cargo into an advantage"

| # | Node | Verb change | Preview |
|---|---|---|---|
| T1 | Field Strip | take a part off a wreck and fit it without docking | "Pull a working part off a wreck and bolt it on where you are." |
| T2 | Eye for Value | see what a wreck or a hold is worth before you commit | "Look at a wreck and see the money in it." |
| T3 | Bulk Stow | carry an awkward load that will not fit a normal hold | "Take the long piece that will not fit anybody's hold." |
| T4 | Silent Hold | carry cargo that does not read on a scan | "Carry a load nobody can prove is there." |
| T5 | Yard Hands *(capstone)* | have a station build a part from your blueprint while you are away | "Order a part and come back to it finished." |
| T6 | Quick Sale | sell a whole hold in one transaction at one price | "Sell the lot in one press." |
| T7 | Salvage Line | tag wreckage and have it come to you | "Mark the wreckage and let it drift to your hold." |
| T8 | Market Ear | hear which station is paying before you arrive | "Know the price at the next station before you get there." |

**Rejected nodes (the rule in practice).** "+8% weapon damage", "+15% shield", "−10% heat" — these
are the nodes this design refuses. If a player cannot *do* something new, it is not a node; it
belongs in a part's tuning.

## 4. Level curve and where points come from

- **XP sources (one bank):** contracts completed, Crucible rounds (win or lose), Swarm waves, first
  kills of a class, first visits, first trades of a commodity, salvage recovered.
- **Level 5 in the first hour.** Target: a fresh save reaches **pilot level 5 within 60 minutes of
  ordinary play**, which is 5 points — enough to feel one branch start to open.
- **Curve:** levels 1–10 at ~120 XP each, 11–20 at ~260, 21–30 at ~520, 31–40 at ~1 000. Forty
  points is the whole tree, so the tree is a long-run goal and level 5 is the first decision.
- **No respec tax.** Points can be respent at any docked station for a flat credit fee; the tree is
  a build, not a trap.

## 5. What the screens do

- **The Ship Sheet (P1)** gains a pilot strip beside the ship: level, the branch you are deepest in,
  and points to spend. This is the "character screen" the owner asked for — a ship and a pilot in
  one frame.
- **THE SHIP / Shipworks `Record` band** gains a "Pilot" page: the five branches as five short
  ladders, each node with its verb and its preview. Locked nodes print what will unlock them.
- **Swarm draft and Crucible perks** tag each card with its branch word, so a run teaches the same
  five nouns.
- **Research** keeps its rings; its panels gain "Blueprint for: <part>" and the branch that uses it.

## 6. Implementation plan (after approval)

1. **One owner.** `src/systems/pilot.js` becomes the single writer: XP intake, level, points,
   spent nodes, and the derived verb set (`pilotCan(state, 'line.two_handed')`). Nothing else
   writes pilot state.
2. **Data.** `src/data/pilotTree.js`: the 40 nodes above as data — id, branch, tier, cost, verbs
   granted, preview sentence, prerequisite. One node = one `pilotCan` flag consumed by the sim.
3. **Save migration.** `saveVersion` bump with a migration that: keeps every existing research
   node as a blueprint; converts banked research points to nothing (they were spent on blueprints);
   awards pilot XP retroactively from counters the save already tracks (`kills`, `contracts`,
   `crucibleRuns`, `swarmWaves`, `creditsEarnedSinceStart`), floor 1, cap 12, so a veteran does not
   start at level 1 and a new save does not inherit a tree.
4. **Verb wiring, one branch at a time.** Each node lands only when its verb works and its preview
   is true. A node whose verb is not wired stays out of the tree.
5. **Verification.** A fresh save reaches level 5 inside the first hour; every node's effect is
   visible in a capture; an old save migrates and every fitted module still flies.

## 7. Decision requested

1. Approve the five branches and the 40 nodes (or name the ones to cut).
2. Approve "one pilot level from every mode" and "run perks stay run-scoped".
3. Approve research becoming the blueprint catalogue.
4. Confirm the level-5-in-the-first-hour pace.

On approval this document becomes `PILOT_TREE.md` (unchanged) plus an implementation checklist in
`STATUS.md`; the tree is then built node by node with the preview shown in the screen.
