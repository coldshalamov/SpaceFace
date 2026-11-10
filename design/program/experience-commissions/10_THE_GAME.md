# 10 — The game: the verdict, the decisions, and what changes in the plans

**From the creative director, 2026-11-10.** Seven scouts read the code against `design/VISION.md`. This page says what the finished game is, where today's build falls short of it, and what is decided. Where it differs from 09 on order, this page wins.

## 1. The verdict

**The game the vision describes is a hit, and the hard part of it already exists.**

The vision is one sentence: *a box of dangerous toys with consequences.* You grab something with the Line, swing it, let go, and the room rearranges itself — and the people in the room have opinions about it.

That is a new verb. The gravity gun was one. The grappling hook in Just Cause was one. Games built on a verb that good, in a world worth using it on, are the ones people clip, share and replay. And the verb is real in this code today: a slingshot release is graded on timing; mass decides who moves; heavy wrecks shed chunks you can grab as ammunition; one power piles enemies up and another detonates the pile.

So this is not a game in search of an idea. It is a strong idea buried under five specific mistakes. Fix those five and I will say it without hedging: **finished, this is a game people show each other.** What follows is how.

## 2. The hook, and the one test everything is judged by

> **Grab anything. Swing it. Throw it into everything else. Then deal with what you caused.**

**The ten-second test.** Take any ten seconds of ordinary play. Is something being thrown, something reacting, and can a stranger tell what happened? Every decision below exists to make more ten-second stretches pass. A feature that cannot improve that test does not belong near the centre.

## 3. Where the build falls short — five mistakes

**1. There are two games in the code, and new players get the weaker one.** Swarm has the hard-hitting powers the vision describes: Pull is a 1.2-second yank, Shove is a punch, thrown bodies kill what they hit. Adventure — the default new game — still runs the old soft versions: Pull is a nine-second field that drifts things together at walking pace, Shove is a seven-second ring, and throws only kill in Swarm. Even the keys differ: the Line is on Space in one mode and the right mouse button in the other. Adventure asks for about thirty keys.

**2. The machine cannot keep up.** The simulation runs at a fraction of real time in busy scenes; the Foundry was last measured near fifteen frames a second. A throw cannot feel good at that speed. (EC-G11.)

**3. The best moment is in minute two, and then the game takes it away.** The opening has you fling a raider into a rock. It is real and it is good. Then come ten minutes of "thrust past forty, brake below ten", about twenty verbs, and the story's hook delivered as text about ships you never saw. Twelve separate systems compete to tell you what to do next.

**4. You cannot see yourself getting stronger.** There is no experience bar, which is right. There is something better: the Line has eight classes, earned by tonnes moved, and each class lets you control heavier things — exactly the vision's "what can I do now?" But it levels up silently. Meanwhile four other ladders (research, two sets of mode unlocks, standings) never connect; most parts change a number you cannot feel; nothing you fit appears on the ship; and the hold shows "N units · X u vol" with no prices and a scan-risk figure that is hard-coded.

**5. The world is wide and thin.** Sector two differs from sector one mostly by numbers. Enemies are authored in fifteen looks and drawn in one. Towns have no toys. (09's Town Recipe, and EC-G08.)

## 4. The decisions

**D1 — One game, two doors.** Swarm's feel becomes the game's feel everywhere: the same powers, the same throws that kill, the same keys. Six things for the hands — move, aim, fire, Line, boost, and five powers — and everything else is contextual or automatic. Adventure is Swarm's verbs in a world that remembers. *(New: EC-G18.)*

**D2 — Swarm ships first, as the proof.** It is the hook in fifteen minutes: thirty seconds from the title to the first throw. Finish it until people replay it — enemies you can tell apart, a room with walls, things to buy on the floor, waves with names, an ending you can win, a secret in every arena. Everything Swarm gains, Adventure inherits. *(EC-A01, EC-Z01, EC-G08, EC-C01.)*

**D3 — One ladder: your rope gets stronger.** Line Class I to VIII is *the* progression. No experience points. You level by moving weight, in either mode. Each class is a size of thing you can now throw and one new move, and reaching it is an event: the cable thickens, the screen says what you can now hold, a town remarks on it. Credits buy sideways choices — Line heads and parts that add an ability you can feel in thirty seconds. Research points go; the tech tree becomes the parts catalogue. Standings are keys to places. Paint and titles are earned, not sold. *(New: EC-G19.)*

**D4 — The world is gated by weight.** This is what makes the ladder and the world one thing. Every town holds something too heavy for you today: the Ninth Mouth's door at Ceres, a white-hot plate at Vesta, the hull on Sker's Chop Line, the moonlet at Ashfall. You see it early. You come back when your rope is stronger. No keys, no level requirements — you try, and it either moves or it does not.

**D5 — Five towns to a finished standard before any other.** Helios (home), Tethys (the crossroads), Ceres (the mine), Vesta (the forge), Sker (the den). These get the full recipe. Other core sectors are **outposts**: a landmark, two faces, the toy, your mark, one job. The frontier is **waystations**: a landmark, one face, the toy, your mark — small on purpose, built in one pass.

**D6 — The first ten minutes keep the throw and lose the drills.** The opening's own best beats, in order, with nothing between them: latch, reel, swing a rock through a wreck, fling the raider, take the salvage or leave it, outrun the search. Then the Skim happens **in front of you** — the black-line ship takes the tow and the escorts die on screen. Then one job. Flight drills, the extra verbs and the powers arrive later, one at a time, in situations. *(EC-G10.)*

**D7 — One voice says what is next.** One line on screen, one marker, one owner. Twelve guidance systems become one leader and eleven sources that feed it. *(EC-G09, EC-G16.)*

**D8 — Dying makes a job, not a loading screen.** Your wreck and your spilled cargo stay where you died. You wake at the nearest berth with a line to it on the map, and somebody else — Juno, a salvor, a scavenger — is already heading there. *(EC-G12.)*

**D9 — The story stays, and gets shown.** You are Wren, flying the *Tessera*, carrying Contract 47-A: 12.4 tonnes that the paperwork keeps getting wrong. Kessler, Rook, Slate and Director Vale are the cast, with a face each. The mystery is about **weight** — which is also the game's verb and its ladder. That is not a coincidence to waste. The Road Cast in 09 are additions around this spine, not replacements.

**D10 — Stop, fold or cut.**

- Six choices before a new game → none. Defaults, with "custom" behind one button.
- The title sells two doors, **Adventure** and **Swarm**, side by side. Crucible folds into Swarm as its course.
- Keys for bullet time, cloak, gyre, bomb cycling, cargo dump, travel drive, full stop, winch → one context wheel.
- Research points. Achievements that reward nothing. The second "Ledger". The fake scan-risk number.
- Fly-there-and-dock jobs (cargo, bulk, passenger, smuggling) stop being offered as headline work until they involve the Line.
- No new mission templates, no new bark lists, no new modes, until the five towns and Swarm pass.

## 5. The bar for "finished"

1. Any ten seconds of play passes the ten-second test.
2. Thirty seconds from the title to the first throw, in either door.
3. Sixty frames a second in Swarm round twenty and in crowded Helios, with no freeze and no jump.
4. A stranger sorts the enemies into kinds by sight.
5. A new player can say how they get stronger in one sentence.
6. There is always exactly one "next".
7. Each of the five towns passes the Stranger Test.
8. A Swarm run can be won, and a first win takes several tries.
9. No cut-off word, overlap or off-style popup in the first hour.
10. A player can tell a story afterwards that nobody scripted.

## 6. Order of work — this replaces 09 §7

No more than six in flight.

| Wave | Build | Why |
|---|---|---|
| **0 — the floor** | EC-G11 never freeze · EC-G18 one feel, one set of keys · EC-G17 the workbench · EC-G16 one glass | The throw has to feel right at full speed in both doors before anything is built on it. |
| **1 — Swarm, finished** | EC-G08 enemies you can tell apart · EC-A01 the Foundry · EC-Z01 · EC-C01 the ending · EC-G19 the ladder · EC-G20 the Rig | The proof. One arena, thirty rounds, winnable, replayable. |
| **2 — the first hour** | EC-G10 first ten minutes · EC-S01 Helios with EC-G01 and EC-G06 · EC-G09 one next · EC-S03 Tethys · EC-G21 the Chart | The second door, opened properly. |
| **3 — the five towns** | EC-S02 Ceres · EC-S05 Vesta · EC-S07 Sker · EC-G15 · EC-G04 · EC-G12 · EC-G07 | Weight gates, heists, toys. |
| **4 — more Swarm, more world** | EC-A02–A07 · EC-Z02–Z04 · the outposts (EC-S04, S06, S08, S09, S10, S11) | From the kits. |
| **5 — the frontier** | the waystations (EC-S12–S25) · EC-G05 · EC-G14 | One pass each. |

## 7. What changes in the commissions

- **New:** EC-G18 (one feel, one set of keys), EC-G19 (one ladder, an honest hold), EC-G20 (the Rig — one loadout screen for both doors) and EC-G21 (the Chart — the map as a navigation instrument).
- **Amended cards:** EC-G07, G09, G10, G12 and EC-S03 carry a dated amendment; every sector card now states its tier.
- **Unchanged:** the Town Recipe, the Road Cast, the Stranger Test and the rules for builders in 09.

## 8. The written content — build from these, do not invent

Agents build well from something specific and badly from "make it good". So the specific things are written:

- **[11 — The Armory](11_THE_ARMORY.md)** — one set of toys for both doors: ships as ways to move (the Saucer and the Tank in detail), gun families and the Kick stat, three bends for each power, Line heads, mods that are trades, and ten builds worth chasing.
- **[12 — Swarm: the Pit](12_SWARM_THE_PIT.md)** — the whole run: what is on the floor, the drops, the freight lanes, fifteen enemies and the answer to each, thirty rounds by name, the bosses, Madame Kiln.
- **[13 — Jobs and heists](13_JOBS_AND_HEISTS.md)** — the five towns, every job and heist beat by beat, the street moments, and the long game of building your own yard.
- **`design/program/INFERENCE_PLANTS.md`** (on master) — sixty chance events, secrets, street moments and radio lines. INFERENCE agents build these as written; they do not invent them.
