# 08 — Interface: the world shows it first, the screen says it once

**Director, 2026-11-18.** The Deckplate/Orrery kit is the one UI system (memory: "Deckplate is the one
UI system", "ORRERY is the frontend authority") and the Stage (G16) is the one popup door; both stay.
This page says what each screen must become. Follow `docs/UI_VISUAL_ITERATION.md` for the loop.

## 1. Principles

1. **The world shows state first.** Shields are a shell on the hull, heat glows in the vents, rope
   strain is the cable's colour and its creak, a dying ship smokes. The HUD only says what the world
   cannot.
2. **One voice per moment** (doc 20 rule 2): the objective line says what's next, the aim tag says the
   verb, and at most one other thing speaks. In a fight: ≤ 3 lines of text besides the instruments.
3. **Plain words.** Eight words or fewer for voices; no internal names (§5).
4. **Every screen answers in one glance:** where am I, what can I do, what should I do next.
5. **The look is the acceptance.** `scripts/ui-bench.mjs` finds geometry defects; it passed
   `station-shipworks` with text stacked over the hull diagram (`02` C3). A screen is done when a fresh
   reviewer has looked at it at 1280×720, 1366×650 and a phone size.

## 2. From launch to the title

| Screen | Today | Becomes |
|---|---|---|
| Boot film | captured frame almost black (`02` A1); boot 38.5 s | bright and specific from its first frame; ≤ 6 s; skippable at once; never holds the game's own start-up (`10` §2) |
| "First light" prompt | cryptic modal (`02` A2) | **deleted.** First run uses shipped defaults; reduced motion, flashing, contrast, text size and captions live in Settings › Access, and the OS reduced-motion setting is honoured automatically |
| Title | two door cards over a murky scene with a placeholder-looking faceted rock (`02` A3) | the two doors over **a lit place at its best moment** — Helios harbour at golden hour with traffic working (`07` §5); Settings, Help and More beneath; nothing that reads as unfinished |

## 3. Swarm screens

| Screen | Becomes |
|---|---|
| PLAY | the Foundry key art (keep), one PLAY button, three remembered selectors: arena, Kiln's mood, hull (`04` §7) |
| More | Gauntlet, Foundry Block, Daily, Practice, records — one level down |
| Loading | a real picture of the room being entered, a progress line, the controls card; no "Crucible", no wireframe sweep (`02` A6) |
| **Level-up cards** (new) | three cards over the dimmed room in the breath: branch colour, icon, name, one line that says what changes in your hands; 1/2/3, click or pad; Re-roll with its Scrap price; the tree path lit faintly behind (`04` §3) |
| Floor pads | a lamp, a price sign readable across the room at the default zoom, a radar mark (doc 12) |
| The Bench (rounds 10, 20) | refit, change ship, cash out — the one menu in a run |
| Run Over | `04` §8 |
| Hangar | starting options, records, the Pilot Tree reference, Kiln's Dares, the Nightly |
| Retired | the between-round Armory/"Ship equipment" screen, Browse all, Fortify (`04` §2, §5) |

## 4. The flight HUD (both doors)

**Layout — four corners and one lane:**

- **Bottom-left:** speed, hull/shield, energy/heat, and the verbs you own: 1–5 powers, the Line, boost.
  No empty sockets, no unbound slots (Gyre and Cloak today, `02` B9), no truncated labels ("Tap 5 C.").
- **Bottom-right:** the radar.
- **Top-left:** Adventure — one objective line with distance; Swarm — round name, hostiles left, Scrap.
- **Top-centre lane:** the round name and Kiln's line (Swarm), the style meter (`04` §4), the boss bar.
  One thing at a time, queued through the Stage.

**World marks:**

- **The aim tag** sits on the body under the cursor and says the verb with its binding:
  `RMB · ANCHOR`, `RMB · TOW`, `RMB · TUG`, `RMB · THROW` (`03` §2). Never over empty space (`02` B11);
  always inside a safe margin clear of the HUD.
- **Off-screen markers** are edge arrows with an icon, the kind and the distance. The unlabelled red
  "ruler" boxes go (`02` B10).
- **No status chips for effects.** "WELL — ENGAGED 3S", "REPULSOR — FADING 1S": the effect shows its
  own time (a ring that fades, a cable that slackens).

**Off during a fight:** Overhead / Circuits buttons, RADIO OFF, the Field Build chip, scanner lists,
world news, comms nudges. They return in calm flight.

## 5. Words — the banned list

No player-facing string may contain any of these (internal or developer language seen on screen at
301d3fb074 or 0c6f73de87):

`Crucible` · `AFTERMATH` · `FIELD RESPONSE` · `IGNITION` / `FLARE` / `NOVA` as tier names · `MIXED +2` /
`TERRAIN +2` / `DIRECT +2` · `Converged on` · `Unknown weapon` · `? unknown` · `STALE` · `TOO HEAVY` ·
`pressure %` · `cr/min` · `headroom` · `cap load` · `RESEARCH POINTS` · `Bay screen` · `Station wire` ·
`banked into the hangar` · `Ship fix` · `Hdg` · faction ids on Swarm enemies

A check reads the generated English catalogue (`src/localization/catalogs/en-US.generated.js`) and
live captured DOM text for the list and fails the gate on a hit. Add words as reviewers find them.

## 6. Pause

- In Swarm, the pause brief shows the run only (no campaign contract — FIX-05 claims fixed; verify).
- **DEV · SANDBOX is not in player builds.** MEDIA (photo, replay, clips) and Physics Challenges stay
  only if each is finished; anything unfinished is unreachable (`01` §8.8).

## 7. The station becomes a hangar

Today (`02` C2, C3): a dark dashboard with seven tabs, a command palette, two news crawls, sliders and a
shipworks view where the ship is a capsule under overlapping text. The Freelancer model instead:

- **Docking sweeps the camera into a lit bay** where your own ship, with every fitted part visible
  (doc `KIT.md`, "visible Freelancer loadouts"), is the hero of the frame. Crew and cranes work around it.
- **Four places along the bay:** **Jobs** (the board), **Market**, **Shipyard** (ship · fit · paint;
  fitting shows the part bolted on), **Bar** (people, rumours, story). Plus **Undock**.
- Hull, fuel, repair and rearm are one **Service** strip in the bay, done with one press.
- **Retired:** the Ctrl+K command palette, the Bay screen and Station wire crawls, the Ledger tab,
  Factions as a tab (standing shows on the job board and in the bar), Industry as a tab (your works live
  on the Chart and at the yard, `05` §4).
- Every card fits at 1280×720 with nothing stacked on the ship.

## 8. The Chart

One map (local, system, galaxy as zoom levels of the same map). At most three inspector tabs — **Here**,
**Route**, **Jobs** — in plain words: "Helios Station — market, fuel, repairs — 1.1 k away". No
coordinates, headings or jargon (`02` C4). A "My works" layer shows each claim's state (`05` §4).

## 9. The board inside the rock

`05` §3 and `07` §8. One objective line; a short tool bar of only what can be built; hover shows
contacts and their yields; drilling a contact warns; Heat and Charge as diegetic gauges on the rover.

## 10. Settings, Help, Controls, Access — to inspect

Not yet looked at by the director (`02` A8, A9). Doc 19's floor applies: text ≥ 12 px at 1280×720,
reduced motion and flash honoured, colour never the only signal, every action rebindable, every control
reachable by pad.

## 11. Acceptance for every screen

1. `node scripts/ui-bench.mjs --shot=<id> --walk` at 1280×720, 1366×650 and 390×844; zero findings.
2. A fresh reviewer opens every PNG and answers the one-glance questions (§1.4) correctly.
3. The banned-words check passes.
4. In the live game, reached through the ordinary route, it looks like the bench.
