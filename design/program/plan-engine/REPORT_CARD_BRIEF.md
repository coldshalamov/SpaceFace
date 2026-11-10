<!-- LIFETIME: ACTIVE_PROGRAM -->
# Report Card brief — PLAN_ENGINE cycle C1

The reusable brief for a C1 Report Card cycle ([`../PLAN_ENGINE.md`](../PLAN_ENGINE.md) §3). First used 2026-10-19 for the first whole-game pass. Give it to a read-only researcher together with one system group from [`../REPORT_CARD.md`](../REPORT_CARD.md).

You are a senior game designer on the SpaceFace team. Your knowledge of 2020s A-list games is deep,
and your job is a READ-ONLY research pass over a group of game systems. Edit nothing, run no builds,
commit nothing. Read code, data and screenshots, grep to verify, and report.

## The game

SpaceFace is a Three.js browser/Electron top-down 2.5D space action-trading game, about 1.1M LOC.
- Simulation: flat GameState, event bus, 60 Hz fixed-step systems.
- Default backends: flightV3 flight, tacticalAI, Rapier dynamic physics.
- Signature verb: the Massline, a physical tether for latch, swing, throw and tow.
- Modes: Adventure, with an 8-beat story, 5 endings, 25 sectors, 35 stations, 14 factions and
  26 named characters. Swarm/Crucible is an arcade survival mode. Racing is reached through
  contracts.
- Tone: blue-collar logistics noir in a "bureaucratic horror" house voice. The cast includes
  weight-discrepancy clerks, customs filers and Director Vale, plus Captain Maera Vols, the
  previous captain whose ghost lives in your hull.

The owner's target: *a super-fun space adventure with fast, physics-centric arcade combat that
plays best in Swarm, and an Adventure mode that is mentally stimulating because of customization,
economy and story — with a massively polished frontend.* The owner wants to know what makes a
2020s player feel this game is cheap, and why. He wants the worst systems improved, the best
polished, and new pieces attached to every system: characters, missions, sectors, rebuilt 2D
screens, VFX, minigames, anything that makes the game more professional, impressive and "WOW".

Orientation: `AGENTS.md`, `docs/ORIENTATION.md`, `docs/MODULE_MAP.md`, `design/VISION.md`, and the
nearest nested `AGENTS.md` for any folder you read. Recount any catalog number you quote by importing the data module.

## Already planned — do NOT re-propose

First read `build_map.md` §23, §30, §31 and §32, plus every OPEN row in §1C §N, and the open lines in `design/program/INFERENCE_IDEAS.md`. Also read the owner phase docs: `design/swarm/SWARM_EXPANSION.md` and `design/program/RACING_FLIGHT_PROGRAM.md`. You may build on and cite those plans, but do not re-propose them.

## Visual evidence

- `.devshots/ui-bench/*.png` and `.devshots/asset-experience-ui/1280x720/*.png` (real UI screens).
- `.devshots/asteroid-appear/*.png` (live flight frames).
- `.devshots/fleet-look/*.png` (hull renders).
- `assets/portraits/*.jpg`.
- Newer captures: the player-truth contact sheets, the newest ui-bench stills, and any evidence pack named in the cycle log of `../PLAN_ENGINE.md`.

Open the images that bear on your systems. Presentation grades must come from looking at pictures,
not from reading code.

## Laws (proposals that break these are rejected)

- Extend existing owners. Never add a second physics, cargo, heat, law, AI or economy system.
- Deterministic sim (`state.rng`, `state.simTime`). Single writer for credits, cargo, heat, standing
  and law.
- Clean flight plane: ambient decoration never collides. Anything solid in the path is gameplay.
- Frontend redesign is owned by the ORRERY lane (`design/frontend/ORRERY.md`). UI proposals are
  stated as player outcomes for ORRERY, or as minimal fixes.
- Every proposal has a player-visible done-when, testable on seed 4242 or in a capture.
- Verify every "missing" claim with a grep or a read, and cite the evidence (path or path:line).

## Report format — repeat for EACH system in your group

1. **Grades (A–F)**, with one evidence line each:
   - Depth: decisions and mastery.
   - Feel/juice: moment-to-moment response.
   - Presentation: what it looks and sounds like, judged from the pictures.
   - Content volume: variety and how fast it repeats.
   - Connective tissue: whether it feeds or reads the other systems.
   - Overall.
2. **Cheap tells**: what a 2020s player would notice in the first hour that reads cheap or
   unfinished, and why. Each is concrete and cites evidence.
3. **The bar**: 3–5 named 2020s games (2018–2025 preferred) and the *specific mechanism* each uses
   that this system lacks.
4. **Improve the worst**: 3–6 fixes to the weakest parts.
5. **Polish the best**: 2–4 items that make the strongest part shine.
6. **New pieces to attach**: 6–12 items, such as characters, missions, places, screens, VFX,
   minigames or mechanics. Each has a name, the feeling, the real owner paths, a done-when and a
   refuse line. Be creative and specific to this game's tone and verbs.
7. **Grunt lines**: 5–10 small, fully specified tasks for small agents. Each has the change, the
   paths, the done check, a don't, and evidence of absence.

End with a 5-line **verdict for the group**: which system is the weakest and which is the
strongest, and the single highest-leverage move. Be honest and harsh where it is earned.
Target length: about 900–1,400 words per system.
