# 17 — The ladder, the prices, and what keeps a player for fifty hours

**From the lead designer, 2026-11-10.** Numbers here are **starting values to tune by play**, not law. What is law is the shape: what each step gives you, and that a player can always say what they are working toward. Built by EC-G19 (the ladder), EC-A01 and EC-Z01 (Swarm prices) and EC-G05 (the yard).

## 1. The eight classes of rope

One sentence a player can say: *"My rope gets stronger the more weight I move, and each class lets me throw something bigger."* Earned by tonnes moved in **either** door. The thresholds already exist in `src/data/lineProgression.js`; keep them unless play says otherwise.

| Class | Called | You can now hold | The new move | The moment |
|---|---|---|---|---|
| **I** | Thread | pods, crates, Wasps, small rocks | **Swing** — latch and arc | the raider into the rock, minute two |
| **II** | Cord | fighters, medium rocks, a bus (just) | **Throw** — release is graded and named on screen | the Helios counterweight |
| **III** | Cable | loaded containers, Bruisers, a container string | **Whip** — snap the line to fling what is on it without a swing | the Whole String at Tethys |
| **IV** | Hawser | crewed light ships, big rocks, doors | **Anchor** — plant yourself and hold against a pull | the Ninth Mouth's door |
| **V** | Chain | haulers, hot plates, heavies | **Drag** — tow at full boost | the Plate at Vesta |
| **VI** | Girder | hulls off hooks, station modules | **Tear** — pull parts off something bigger than you | the hull off Sker's Chop Line |
| **VII** | Span | sections of a capital wreck | **Orbit** — keep a body circling you as a shield, then send it | the Ashfall plate |
| **VIII** | the Massline | a moonlet | **Sling a moonlet** | the last tow |

**Each class-up is an event.** The cable visibly thickens and changes colour. The screen says the class, its name and one thing you can now hold. Static says *"New rope in the lanes. Mind your cargo."* The next town you dock at has noticed.

**Pacing target:** Class II inside the first hour. III by hour three. V around hour ten. VIII is for people who love the game. A good Swarm player gets there faster than a careful hauler, and that is fine.

## 2. What money is for

Money buys **sideways** — a different way to play — never simply more. The ladder is the only thing that goes up.

| When | You have about | You are choosing between |
|---|---|---|
| start | 5,000 | nothing yet |
| 20 minutes | 4,000 spare | **your first Line head** (3,500): Coupler or Breaker. This purchase must exist, must fit the starter ship, and must change what your hands do |
| hour 1 | 12,000 | a second gun family, or the Pelican |
| hour 3 | 30,000 | a second ship that moves differently, or your first power bend |
| hour 6 | 80,000 | a Forged gun at Vesta (a job plus a fee), or a heavy hull |
| hour 12 | 200,000 | the first module of your own yard |
| hour 25+ | more than you need | the yard, and what it takes to defend it |

- **Every way of earning pays within a third of every other.** Today hauling pays three times hunting and four times mining. A player should choose work because they like the work.
- **A kill by collision pays more than a kill by gun**, everywhere. The game pays you to play it the way it wants to be played.
- **Nothing in a shop is described with a percentage.**

## 3. Scrap — the Swarm economy

Scrap exists only inside a run. It is earned in seconds and spent on the floor.

| Earn | Scrap |
|---|---|
| a kill by gun | 10 |
| a kill by collision — thrown, slammed, crushed, under the freight | 25 |
| each link in a chain | +5, rising |
| a round cleared | 50 × the round |
| a boss | 1,000 |

| Spend | Scrap |
|---|---|
| a wall gun | 500 |
| the Crate | 950 |
| a Tap | 1,500 · 2,000 · 2,500 · 3,000 |
| a door | 750 · 1,250 · 2,000 |
| a trap | 400, then a cooldown |
| the Forge | 5,000 |

**What that should feel like.** Round three: you can afford your first wall gun. Round five, after the Iron Maw: a door or a Tap, not both. Round ten: the Forge is in sight if you have been throwing things instead of shooting them. Round twenty: you are choosing your fourth Tap. A player who only shoots is always poor. That is the lesson, and nobody has to say it.

**The spending test (from 12):** in a real ten-round run the player crosses the room to buy something at least six times. If they do not, prices are wrong or the floor is.

## 4. The hours

What a player is doing, and what they are working toward, at each point. If any row has no answer in the built game, that is the gap to close.

| Hour | Doing | Working toward | Just got |
|---|---|---|---|
| **0–1** | the opening; Helios; first Swarm runs | Class II; a first Line head | the swing, the throw, a lamp with their name |
| **1–5** | the five towns' first jobs; the story to Elroy; the Foundry to round ten | Class III–IV; a second ship; the first heist | a build they can name |
| **5–15** | heists; the outposts; picking a side; Swarm to round twenty and a second arena | Class V–VI; a Forged gun; the Course | a ship that is recognisably theirs |
| **15–30** | the rim; the frontier; the yard; first raids; winning the Course | Class VII; the story's last act | a place of their own |
| **30–50** | the last tow; a door; the other arenas; the other builds; the other doors | Class VIII; all seven arenas won | an ending, and a world that remembers it |
| **50+** | the Nightly; Kiln's Dares; defending a bigger yard; a second run down a different door | mastery | a reason to show somebody |

## 5. What brings a player back to the Pit

Three things, all cheap, all after the Course is winnable.

**Kiln's Dares.** Three optional dares offered at the start of a run, one line each, paid in Scrap and in something to wear.
*"Round five without firing."* · *"Nothing but the Fridge."* · *"Buy nothing till ten."* · *"Kill the Maw with its own spit."* · *"One Tap. Choose well."* · *"Ride the freight for a full round."* · *"No power twice in a row."* · *"Open every door by round eight."* · *"Win it in a Mule."* · *"Let the room do it: no kills by gun."*

**The Nightly.** One arena, one starting ship, one twist, the same for everyone that day, chosen from the date — no server needed. At the end the game shows a short code of your result that you can paste to a friend, and reads theirs back as a ghost score on your board.

**Marks.** Things you have done that show on your ship and on Berth Boards: a round reached, a boss killed a strange way, an arena's secret found. Never a number that makes you stronger.

## 6. The yard — the long game

The owner's direction: drill into a rock and it becomes yours; it mines itself; you build round it; you defend it. Built on the Asteroid Works and automation the game already has. **It is a place you can fly up to, never a management screen.**

| Step | What you do with your hands | What you see |
|---|---|---|
| **Claim** | tow a drill head into a rock and set it | a lamp comes on in the rock |
| **Hopper** | tow a hopper beside it | ore visibly filling it |
| **Line** | string your own freight lane to the nearest town | haulers you did not hire start using it |
| **Works** | add a module that turns ore into parts | parts you can fit, made at home |
| **Walls and traps** | tow in plates, a crusher, a gate | your own arena |
| **Turrets** | tow each one where you want it | arcs of fire on the Chart |
| **Raid** | somebody notices | **a named Swarm round, on your ground**, with your lane, your traps and your turrets |

A raid you lose costs a module, not the yard. A raid you win puts the wrecks in your hopper. The yard is where the two doors become one house: everything the Pit taught you, defending something Adventure let you build.

## How to build this and check your own work

- **The ladder first, one class boundary**, announced properly, in both doors.
- **Prices are tuned by watching runs**, not by a spreadsheet: `npm run player-truth -- --mode=swarm --rounds=3` and the no-screen bench (`scripts/lib/bench/crucibleBench.mjs`) for long runs. Record what the player could afford at rounds 3, 5, 10 and 20.
- **The sentence test:** after twenty minutes a new player says how they get stronger in one sentence. After an hour they say what they are saving for.
- **Ways this gets faked:** a class-up that changes a number and nothing in the hands; a first purchase that is a stat; a yard that is a menu; a dare that is a checkbox with no line from Kiln.
