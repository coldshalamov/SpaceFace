# OVH-01b [FE] — Level up without a pause; three cards in the breath

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically; other agents keep
> uncommitted work in the same files. Follow `docs/UI_VISUAL_ITERATION.md`: shoot the screen, open
> the PNG yourself, fix what you see, `--walk` the controls you changed. Builds on OVH-01a (the
> engine: `src/data/pilotTree.js`, `run.pilot`, `drawPilotOffer` / `choosePilotCard` /
> `rerollPilotOffer`, `pilotHas`, `pilotPoints`) — use only that API.

**Design:** `design/overhaul/04_SWARM.md` §2 (the run, beat by beat) and §3 (the three cards), and
`design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2. The owner: fast specialisation, replay from
builds; "you could spread all your points… but you'd be kind of weak."

## The route (director, 2026-11-19 — read before building)

- **The sim deals; the screen never does.** OVH-01a2 makes the run owner deal a hand into
  `state.run.pilot.offer` (`{ cards: [nodeId, nodeId, nodeId], rerolls }`) the moment a pick is
  banked, and again after each choice while `state.run.pilot.banked > 0`. The screen only decides
  **when to show** the hand that is already there. Never call `drawPilotOffer`, `choosePilotCard` or
  `rerollPilotOffer` from UI code.
- **The screen asks through intents** on the bus, exactly like the draft screen's
  `run:draftPickRequested`: `run:pilotCardRequested` `{ index }` and `run:pilotRerollRequested` `{}`.
  It reads back `state.run.pilot` (offer, banked, nodes, points) and the owner's refusal receipt.
- **Card faces** come from `getPilotCard(id)` (`name`, `text`, `branch`, `tier`, `kind`) and the
  branch's points from `pilotPoints(state, branch)`, both in `src/data/pilotTree.js`. Branch names
  and mottos: `PILOT_BRANCHES`.
- **A hand may hold fewer than three cards**; lay out one or two cleanly. No hand, no breath.
- **Only built nodes are dealt** (`src/data/pilotLive.js`). For the bench shot and your tests, seed
  `state.run.pilot.offer` directly with real node ids; do not edit the live list.
- **The round's end.** Today a Swarm round ends into the between-round draft screen (a full pause).
  Do not edit `src/ui/screens/crucibleDraft.js` or `crucible.js` (another agent's uncommitted work
  lives there). Find the moment the round ends (the phase change the draft opens on) and show the
  breath **before** the draft takes over: if the draft screen is pushed on that event, push the
  cards screen on top of it so the player resolves the hand first and the draft is revealed when the
  cards close. Never let the two race or hide each other.

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
