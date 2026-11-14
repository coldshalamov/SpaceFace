# 18 — Sound, look, and how we know it is finished

**From the lead designer, 2026-11-10.** The last piece. Sound and look are short here because their rules already exist (`design/program/finish/bible/FEEL.md`, `LOOK.md`); this says what to make first. The second half is the part that matters most: how a finished game is told apart from one that only passes its checks.

## 1. Sound — the throw has to be heard

The audio library has a size ceiling (about 12 MiB) and is near it. So: **few sounds, layered and pitched by the physics**, not a recording per event.

### The rope is an instrument
| Moment | Sound |
|---|---|
| latch | a hard metallic *clack* |
| tension | a creak that **rises in pitch with the load** — the player hears how heavy it is |
| the swing | wind, louder with speed |
| release | a *twang*, then a falling whoosh that follows the thrown body away |
| impact | a crunch scaled by mass, with a low thud you feel under it |
| a perfect release | one clean bell-like overtone on the twang. Players will chase that note |
| line strain near breaking | the creak splits into two notes |

### One voice per gun family
Pew: *tik*. Hose: a buzzsaw. Thump: *whump* and a ring. Needle: a rising whine, a crack, silence after. Burn: a tone that climbs as metal heats. Boom: a hiss, then a thump with a tail. Two guns in one family differ by pitch and tail, not by a new recording.

### Places keep time
Every town's **Shift** is audible from the approach: the Helios horn, the Ceres Bell, the Vesta pour, the Tethys train, Phoebe's hush. The freight lane's klaxon is the same in every arena, so the player learns it once.

### Music
- **Towns:** one short theme each, in three layers that fade in and out — *quiet*, *working*, *trouble*. The world's state mixes the music; no track changes.
- **Swarm:** one driving loop per arena that **adds a layer every ten rounds**, drops to almost nothing in the four-second breath, and comes back on the round's name.
- **Bosses:** the arena's own loop, with the boss's instrument on top.
- **Silence is used.** Round 29 (*Quiet*) and Orcus Shadow are the proof.

### Voices
Madame Kiln and Static carry most of it. Eight words, never over a fight, never the same line twice in a run.

## 2. Look — what to fix first

Rules are in `bible/LOOK.md`. In order of what a new player notices:

1. **Enemies you can tell apart** (EC-G08) — the authored colour, shape and size, drawn.
2. **Bodies that visibly carry force.** A thrown ship tumbles. A hit hull dents and trails. A melted one sags and glows. What you did to it stays on it.
3. **The rope as a diagram.** Thick, bright, taut or slack, coloured by class. For a moment in every swing the screen should look like a drawing of tension.
4. **Towns lit by themselves** — windows, signs, work lamps — with a landmark that reads in silhouette (EC-G03).
5. **Wreckage that stays.** The room at the end of a round should look like what happened in it.
6. **Light that lands.** An explosion lights the walls and the hulls near it. A pour lights the foundry.

**The rule over all of it:** effects show force; they never replace it. Switch the effects off and the bodies must still go where the picture said.

## 3. How we know it is finished

### Three looks before any plan is called done

| Look | Who | What they get | Passes when |
|---|---|---|---|
| **The builder's look** | whoever built it | a before and an after, by the same fast tool | they can point at the difference |
| **The stranger's look** | a fresh agent that has not read the plan or the code | captures only (the Stranger packet, EC-G17) and the questions | the answers are right and specific |
| **The owner's ten minutes** | the owner | the game, ten minutes, the card below | four ticks out of five |

Passing checks is necessary and proves nothing about fun. A plan with green checks and a failed look is **not done**.

### The owner's ten-minute card

Play ten minutes. Tick or do not.

1. **I threw something into something, and it was satisfying.**
2. **Nothing froze, jumped or stuttered.**
3. **I could read everything on screen, and nothing overlapped.**
4. **I always knew what I could do next.**
5. **I want another go.**

Anything unticked goes back, with one sentence about what happened. This card is the most valuable test the project has, because it is the only one made by a player.

### The bar for the whole game

The game is finished when all of these are true at once. (Items 1–10 are from [10 — The game](10_THE_GAME.md) §5.)

1. Any ten seconds of play passes the ten-second test.
2. Thirty seconds from the title to the first throw, in either door.
3. Sixty frames a second in Swarm round twenty and in crowded Helios, with no freeze and no jump.
4. A stranger sorts the enemies into kinds by sight.
5. A new player says how they get stronger in one sentence.
6. There is always exactly one "next".
7. Each of the five towns passes the Stranger Test.
8. A Swarm run can be won, and a first win takes several tries.
9. No cut-off word, overlap or off-style popup in the first hour.
10. A player tells a story afterwards that nobody scripted.
11. One loadout screen, in both doors, with a working TRY IT.
12. The Chart passes the orientation test.
13. Every book of the story can be followed with the text switched off.
14. The owner ticks five out of five, three sessions running.

### What could still stop it being great

Honest list, with what guards against each.

| Risk | Guard |
|---|---|
| **Feel cannot be tuned blind.** Agents cannot feel a throw. | Traces and ten-second clips for every change; the owner's ten minutes as the final word; one feel profile for both doors so it is tuned once |
| **The machine.** Nothing feels good at fifteen frames a second. | EC-G11 first, with a two-minute proof at each step; no plan may buy speed by removing what is on screen |
| **Scope.** Fifty-eight plans is a lot. | Six in flight; one slice per plan; five towns before any other; Swarm before Adventure |
| **Two feels drift apart again.** | One profile file. A difference between the doors is a defect on the classes list |
| **Agents grade their own work.** | The stranger's look; the recorder refuses a unit without evidence |
| **The interface regresses.** | The Inspector (EC-G16) fails the build, not warns |
| **Invention creeps back in.** | Agents build what is written — 11 to 16 and the plants — and suggest in one line. The lead designer writes |
| **Plans pile up again.** | No new plan documents. From here it is builds, looks and the card |

### What I believe

The verb is new and it already works. The world it lives in is written, town by town and round by round. The plan builds the playground first, proves it in fifteen-minute runs, and lets the long game inherit it. Every piece has something to look at and somebody other than its builder to look.

If this is built as written and held to the card, it is a game people show each other and keep installed — the horde mode you play for one more run, in a world you actually want to go and bother. What the plan cannot do is play it for you: the last ten per cent of feel comes from the owner's ten minutes, week after week, and from sending things back.
