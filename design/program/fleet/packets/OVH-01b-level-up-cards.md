# OVH-01b [FE] — Level up without a pause; three cards in the breath

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically; other agents keep
> uncommitted work in the same files. Follow `docs/UI_VISUAL_ITERATION.md`: shoot the screen, open
> the PNG yourself, fix what you see, `--walk` the controls you changed. Builds on OVH-01a (the
> engine: `src/data/pilotTree.js`, `run.pilot`, `drawPilotOffer` / `choosePilotCard` /
> `rerollPilotOffer`, `pilotHas`, `pilotPoints`) — use only that API.

**Design:** `design/overhaul/04_SWARM.md` §2 (the run, beat by beat) and §3 (the three cards), and
`design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2. The owner: fast specialisation, replay from
builds; "you could spread all your points… but you'd be kind of weak."

## Do

1. **Level up, no pause.** On `run:levelUp`: a short chime cue, the XP bar flashes once, and
   "LEVEL n" rides the bar for ~1.2 s. A small "+1 pick" chip sits by the bar while picks are banked.
   Nothing stops the fight.
2. **The breath.** When a round ends and a pick is banked, the room dims and three cards rise over
   it: icon, name, one sentence (the node's text, verbatim), the branch's colour and its points
   (e.g. "Bruiser 3"). Press **1 / 2 / 3** or click. **Re-roll** shows its Scrap price and is disabled
   when the purse is short. The breath lasts 4 s and stretches up to 10 s while picks wait; a second
   banked pick deals a fresh hand right after the first choice. A capstone or evolution card wears a
   distinct frame. Reduced motion: no rise animation.
3. **The alternative setting** (Settings › Gameplay): "Pick at once" — cards appear the moment a pick
   is banked, the fight runs at 15 % speed until you choose (presented-clock slowdown through the
   existing time-effects owner, never a sim hack).
4. Keyboard, mouse, gamepad and touch all reach every card (follow the input/rebind contract).
5. **Tests:** cards render the offer's three nodes in order; 1/2/3 choose through `choosePilotCard`;
   re-roll disabled when short; the breath extends while picks wait; reduced motion has no animation.
6. **Shoot it** (add a bench shot with a seeded offer if none fits), open the PNGs, fix overlap and
   legibility, `--walk` the cards.

**Files:** a new `src/ui/pilotCards.js` (+ its stylesheet), the XP-bar spot in the Swarm HUD
(`src/ui/survivalHud.js`), a Gameplay setting row, the bench shot, the tests. **Not:** the engine
files (OVH-01a) beyond reading them.

**Done when:** a played round shows the level-up tick without a pause and the breath's three cards,
seen on screen by the director.
