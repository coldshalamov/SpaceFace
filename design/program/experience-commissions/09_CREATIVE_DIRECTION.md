# 09 — Creative direction, build order and how to check your own work

**From the creative director, 2026-11-09. This is the standard for all commissions.** Read [10 — The game](10_THE_GAME.md) first: it holds the verdict, the decisions and the current order. Each commission now opens with a *Director's card*. The card says what to build first and what must be true; this page says why, and how the pieces become one game.

Where a card and its brief disagree on **scope or order**, the card wins. On **ids, canon and who owns which state**, the brief wins. Nobody needs to write another plan. Build.

## 1. What is actually wrong

Three things, and none of them is a shortage of features.

1. **The machine stutters.** The simulation falls behind in a busy scene; the picture holds the last positions while decorations keep moving on their own clock; then everything jumps. EC-G11.
2. **The interface was never a system.** Every screen is placed by hand for every window size, and any gameplay system can invent its own popup. Four hundred small fixes could not converge. EC-G16.
3. **The world has parts but no places.** There are hulls, stations, jobs and factions. There is nowhere with a name you'd miss, nobody you'd recognise, nothing to fiddle with for its own sake, and nothing that looks different because you came. The sector commissions fix this — if they build *towns*, not content lists.

A fourth, about how we work: **there are more plans than finished things.** So every card names one slice to finish first, and a place is not started until the one before it passes.

## 2. What this game is about

Everyone who plays this has a job, a commute, a boss, and a place they get lunch. In their real life the work disappears into a screen and nobody sees it.

**Here, work is visible.** You tow the thing and the lights come on. You are late and a bus full of people is late. You fix a pump and a town remembers your name. The fantasy is not being the chosen one. It is being *known* — becoming a regular everywhere, and then deciding what those places become.

One line: **you are the new hauler with a rope, in a system held together by other people's shifts.**

The tone is warm and dry, working-class and funny, with real danger at the edges. The rope and the five powers make it physical and loud. Swarm is the same world with the volume all the way up.

## 3. The Town Recipe

A sector is a town when it has all seven. Each card fills these in.

1. **A landmark** — one big thing you could draw from memory. The town is recognisable from a single screenshot.
2. **A shift** — a clock the town keeps whether or not you are there. A horn, a bell, a pour, a hush. You can hear it from the approach.
3. **A street** — a lane you fly *through*, with lit fronts on both sides, not a station you fly *around*.
4. **Faces** — two to four named people, each with a berth or ship you can find, something they want, and a line you'd recognise them by.
5. **A toy** — one physical thing only this town has, fun to mess with when no job is active.
6. **An argument** — two locals who want things that cannot both happen. Jobs are how you take a side.
7. **Your mark** — one permanent, visible change after your first job here.

And **the Usual**: a Berth Board at the dock where you go from *stranger* to a nickname the town gave you for what you did.

Lines are eight words or fewer. Nobody explains the lore over the action.

## 4. The Road Cast — five people you meet everywhere

A world feels connected when the same person turns up in a different town.

| Who | What they are | Line |
|---|---|---|
| **Juno Castellane**, *Second Opinion* | Your foil. Started the same week you did. Takes every job you turn down, and towns credit her for it. Friendly, competitive, sometimes right. | *"You weren't using that job, were you?"* |
| **Late Benny**, bus *Patience* | The system's one passenger bus. Always behind, always arrives. Helios, Dione, Tethys, Phoebe. | *"We leave when we leave."* |
| **Mr. Tolliver**, repo tug *Kind Regards* | The Fulfillment's cheerful repossession man. You meet him towing away somebody's ship. Help him, or don't. | *"Nothing personal. It's itemised."* |
| **Static**, Lane Nine radio | The one radio voice. Reports what you did as local news, in every town, and calls the Pit. | *"Somebody rang the Ceres Bell. Twice."* |
| **Madame Kiln**, the Pit | Runs Swarm. Announces rounds as if the sponsors are listening. | *"Round nine. Don't embarrass anyone."* |

Bind an existing canon character to a role wherever one already fits; keep their name, give them this job.

## 5. The story, in three threads the sectors already hold

Arrange what exists; do not rewrite the campaign.

- **The Lamp** — who keeps the lights on. Starts with one dark lamp at Helios and ends with the windows in the Ashfall scar. This is the thread about home.
- **The Flag** — who is in charge. Dione's parade ground, Tethys's two halves, Io's repainted plate, Sker's gate. This is the thread about whose rules you live under.
- **The Weight** — something at the edge is getting heavier. The reading at Veil comes back heavy. The sounding at Proteus comes back heavy. A garden at Charon is growing on purpose. At Sedna the lights stop. In the Bolus there is ship paint under the wall. This is the thread about what is eating the work.

The ending is whichever thread you fed. **Swarm is the Pit** — the sport this world watches, called by Static and Kiln; your Pit record shows on Berth Boards.

## 6. The Stranger Test — the only acceptance that counts

Give a fresh reviewer who has **not** read the brief three minutes of ordinary play in the place. From the screen alone they must answer:

1. What is this place for?
2. Name one person here and what they want.
3. What can I mess with?
4. What changed because of me?
5. Why would I come back?

A wrong or generic answer to any of them means not done. A passing test suite does not change that.

## 7. Build order

> **Superseded 2026-11-10:** the order of work is now in [10 — The game](10_THE_GAME.md) §6. The table below is kept for the record.

No more than **six** commissions in flight. A sector PR is ready to merge when its **Slice 1** passes the Stranger Test, the Inspector (EC-G16) and the smoothness run (EC-G11). The brief's remaining jobs follow in a second PR on the same place.

| Wave | Build | Why now |
|---|---|---|
| **0 — the floor** | EC-G11 never freeze · EC-G16 one glass · EC-G17 the workbench | Nothing built on a stutter or a broken popup will feel good, and nobody can judge work they cannot see. |
| **1 — one town, one arena** | EC-S01 Helios with EC-G01 faces and EC-G06 the mark · EC-A01 the Foundry with EC-Z01 · EC-G08 enemies you can tell apart · EC-G10 first ten minutes | Prove the recipe once. The Place Kit is lifted out of Helios and the Arena Kit out of the Foundry. |
| **2 — the first hour** | EC-S03 Tethys · EC-S02 Ceres · EC-S05 Vesta · EC-G15 the swing · EC-G04 sound and Static | The towns a new player reaches, and the toy three of them share. |
| **3 — the flags and the fire** | EC-S04 · S06 · S07 · S08 · EC-G08 named enemies · EC-A02–A04 · EC-Z02 | The Flag thread; Swarm gets its formations. |
| **4 — the edge** | EC-S09 · S10 · S11 · S19 · EC-A05–A07 · EC-Z03 · EC-Z04 | The Weight thread; Swarm gets its heavies and the Choir. |
| **5 — the long tail** | EC-S12–S18, S20–S25 · EC-C01 · EC-G05 · G07 · G09 · G12 · G14 | One at a time. Small and sparse towns are allowed to be small and sparse. |

EC-G02 (camera) and EC-G03 (light) travel with whichever town is being built; they never run alone.

## 8. Rules for whoever builds

- **You are trusted to invent.** Bold names on a card are fixed so the world stays consistent. Everything else is yours. Do not ask the owner what it should look like; decide, build it, look at it.
- **If an idea on the card plays badly, replace it** with something that fills the same line of the recipe, and say so in the PR.
- **Finish the slice before you start the next thing.** One town that passes beats five that nearly do.
- **The toy has to be fun with no job running.** If it is not, stop and fix that first; the jobs lean on it.
- **Do not add a system to add a feature.** Every card was written to use what the game already has — the rope, the powers, cargo, contacts, broadcasts.
- **Say what is not done.** A partial PR is welcome. A partial PR described as finished is the worst outcome there is.

## 9. What the code said when we looked (2026-11-09)

Four scouts read the code, not the status pages. These findings are the reason for the order above.

**The stutter is three faults, not one, and none of them needs a new engine.** When a simulation step runs long the worker throws the time away, so the whole game runs slow (0.11–0.40× in busy scenes). The smoothing buffer hides about a fifth of a second and then holds. Decorations — the gauge ring, idle spins, the backdrop, shader clocks — run on a second clock and keep moving through the hold. After a long silence the picture snaps. The step is slow because most of physics time is script walking every body, every tick makes about 1.5 MB of garbage, and the economy does 50 ms of work in one tick. Rebuild the tick scheduler and the body store; put everything on one clock. EC-G11 has the order and a two-minute proof for each step.

**Swarm's bestiary exists and is invisible.** Fifteen ship types and about thirty Brood families are authored with their own colour, shape, size and abilities. The look is stamped on each ship and never drawn; the ability names are read by nothing. The starter arena is not enclosed, so it reads as open space. The kill target stops rising at round six and the crowd at round sixteen. No run can be won. All spending is in a menu. Every one of these has a half-built seam already in the code. EC-G08, EC-A01, EC-Z01 and EC-C01 name them.

**INFERENCE was making the game bigger, not better.** Of the last forty units, eighteen were small new features with their own files and bark lists, twelve were one wording defect fixed a screen at a time, and none carried a before-and-after. It now has three kinds of unit — fix a class everywhere, finish a half-working thing, remove noise — a list of defect classes that compounds (`design/program/INFERENCE_CLASSES.md` on master), and a recorder that refuses a unit with no evidence. New features belong to commissions.

**Agents could not see their own work.** Interface stills, the simulation lab and three-round Swarm runs are fast and good. Going to a named place, starting Swarm at a chosen round, worst-case text, "is it actually in the game", and a one-line before-and-after did not exist. EC-G17 builds them once.

## 10. How the pieces fit — who does what

| Kind of work | Where it lives | Who it is for |
|---|---|---|
| Build a place, a mode, a system | A commission PR (`EC-*`). One slice, finished, then the next. | Stronger agents. Taste required. |
| Make what exists right | INFERENCE — class, finish or remove. Evidence required. | Any agent. Every unit leaves a check behind. |
| The older plans | The build map and the master plan. Reference for what was intended; the commission cards say what to build now. | Whoever needs the history. |

Three habits make the gains compound:

1. **A fix becomes a rule.** A defect found once is fixed everywhere and gets a check. It goes on the classes list.
2. **A place becomes a kit.** Helios yields the Place Kit; the Foundry yields the Arena Kit. Town two costs a fraction of town one.
3. **A look becomes a tool.** If you had to write a script to see your work, it goes into the workbench so the next agent does not.
