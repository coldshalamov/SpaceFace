<!-- LIFETIME: ACTIVE_PROGRAM -->
# SpaceFace report card — every system, graded against 2020s A-list games

Maintained by [`PLAN_ENGINE.md`](./PLAN_ENGINE.md) cycle C1, using the brief in
[`plan-engine/REPORT_CARD_BRIEF.md`](./plan-engine/REPORT_CARD_BRIEF.md). The tier ladder (Bronze
works · Silver feels good · Gold WOW) is defined in
[`build_map.md` §32.5](../../build_map.md#325-the-bronze--silver--gold-ladder-how-every-system-is-graded).

**First pass: 2026-10-19.** Seven read-only researchers each covered three systems. They read the
live code and the real captures (`.devshots/ui-bench`, `.devshots/asteroid-appear`,
`.devshots/fleet-look`, `scratch/player-truth/baseline/swarm-active/contact-sheet.jpg`). Every
"missing" claim was checked with a grep or a read. Feel grades for motion that no capture shows are
provisional.

The rows these grades produced are `build_map.md` §1C §N **456–481**; the design record is
§32.7. The small tasks are in `INFERENCE_IDEAS.md` § REPORT CARD.

## Grades

Columns: Depth · Feel · Presentation · Content · Connective tissue.

| System | Group | D | F | P | C | Ct | Overall | Tier | Weakest part | Strongest part |
|---|---|---|---|---|---|---|---|---|---|---|
| Flight & camera | A | A− | B | C | B | C+ | **B−** | Bronze+ | First-minute frame and wording: tiny hull, "DRIVE NUM LOCK", m/s versus WU/S | Camera director with an anti-flap governor; three flight models |
| Massline & stunts | A | A | A− | C+ | B+ | A− | **B+** | Silver− | Believability: the line passes through rock, throws leave the frame, callouts are flat | 17 tricks recognised from physical evidence, wired to 16+ owners |
| Weapons, hit feedback, VFX | A | B+ | B− | C | B+ | C+ | **B−** | Bronze+ | The Swarm wrapper: the Adventure aftermath card borrows keys 1–2, and the controller stays silent | Directional impact VFX and the vent chain |
| Enemies, AI, bosses | B | A− | C+ | C | B− | B+ | **B−** | Bronze+ | Boss counters are authored and validated but never shown in Adventure; champions reuse grunt hulls | Nemesis: a bounded, deterministic learner |
| Swarm / Crucible | B | B+ | A− | B− | B | D+ | **B** | Bronze+ | The player-truth baseline never leaves round 1 in 300 s; round 10 has no boss script | The Crucible door and results screens; the juice layer |
| Racing, league, minigames | B | B | C | C− | B− | D | **C+** | Bronze | Physics Venues is two dropdowns; the race board is a form | The Range and the Kinetic League rules ("good toys in a drawer") |
| Sectors, travel, galaxy map | C | B+ | C | B− | B | C+ | **C+** | Bronze | 10 sectors are a name plus a hazard circle; interdiction is a dice roll on arrival | The galaxy chart; sling rings |
| Traffic, NPC life, factions | C | B+ | D+ | C | C | C+ | **C** | Bronze− | 211 lived vignettes from one template; the toll that pays you | Six NPC job kinds with distinct phases; faction grudges and forgiveness |
| Law, crime, custody | C | A− | B− | B | C+ | B | **B−** | Silver− | Reach: law in 3 sectors, 1 of 12 court cases reachable | The WANTED ladder and the physical custody chain |
| Economy & trade | D | B− | C | B− | B | A− | **B−** | Bronze+ | The explanation layer: "Last move: Cyclic demand"; no risk on routes | Cause-and-effect wiring (depletion → demand, freight, shortages → contracts) |
| Missions, set pieces, heists | D | B | C+ | C | C− | B+ | **C+** | Bronze | The vignette layer; 30 bounty names that come back after you kill them; three heists, one door | Hand-built physical jobs (Mine Garden); twists that change a job rather than fail it |
| Industry, mining, automation | D | B− | C | D+ | C | C− | **C−** | Bronze− | The shop advertises 672/min against a 113/min cap; three hull-plate recipes; "AST-355" | Site placement rules, drill hazards, rich-core timing |
| Story, characters, endings | E | B− | B | A− | B− | C− | **B−** | Bronze+ | Memory: 12 of 15 contact counters never move; the finale names 2 of 15 contacts | The bar: portrait, voice arc, memory line |
| Ship progression & customization | E | A− | C+ | B+ | A− | C | **B** | Silver− | Fits barely show on the hull; paint is unearned; synergies are labels | The verb ladder: every research node is a player verb |
| Discovery, aliens, precursors | E | A− | C− | D+ | B+ | C− | **C+** | Bronze | Computed anatomy never displayed; alien moments arrive as warning toasts; no sound | The scanner's clue memory and Spectrum deduction |
| Flight HUD | F1 | B+ | C+ | C+ | B | B | **C+** | Bronze | The first two minutes: news over the tutorial, a drive key that may open Help, markers over the rail | The Massline release diamond and cadence readout |
| Menus & 2D screens | F1 | A− | B− | B | B | B+ | **B** | Silver− | Statistics (zeros), race board (a form), game over (fallback only) | Market, bar and Crucible door — top-tier |
| Onboarding & first 30 min | F1 | A− | C+ | C | B+ | B+ | **B−** | Bronze+ | The hook is a wordless bark; steps 4–9 re-teach flying; "Kestrel" versus "Hitch" | The move-first order: latch → raid → consequence |
| Audio & music | F2 | A− | B | C | D | B− | **C+** | Bronze | About 36 s of authored music; one voice clip per faction while 439 per-line WAVs go unused | The score engine (phases, 25 keys, bar quantization) |
| Meta & replayability | F2 | B+ | C | C+ | C− | C+ | **C+** | Bronze | Dead photo Look button on default settings; statistics of zeros; "NO TAPE" | NG+ carry-overs, branching post-ending chains, daily seed and share codes |
| Settings, access, save, boot | F2 | A− | D+ | B− | B | B | **B−** | Silver− (plumbing) / Bronze (boot) | 23–87 s before control; settings fits three rows per screen | Rebinding, separate motion and flash settings, shape-backed colour, resilient saves |

**Weakest five:** Industry (C−) · Traffic/NPC life (C) · Racing/minigames (C+) · Discovery (C+) ·
Sectors/travel (C+).

**Strongest five:** Massline (B+) · Ship progression (B) · Menus (B) · Swarm (B; conditional on
row 456) · Law depth (A−).

**No system is Gold yet.** Milestone M1 (First Hour Gold) is the first gate.

## The pattern behind the grades

Every group found the same shape: **deep simulation, quiet surface.** Designed things the player
never meets:
- boss counters that are validated and never displayed;
- 12 contact counters with no writer;
- computed creature anatomy that is never drawn;
- 11 court cases that only the lab can reach;
- 439 voiced lines that are never played;
- a photo button wired to a graph that is off by default.

The fastest road to A-list is **surfacing what already exists**. New systems come after. That is
why rows 456–481 are mostly "show it, wire it, fix the lie", and the new pieces wait behind them.

## Cheap tells a stranger meets first (fix order)

1. Swarm leaks the Adventure aftermath card, which borrows keys 1–2 (row 456).
2. The drive's fallback key H also opens Help (row 457).
3. News scrolls over the first tutorial step (row 457).
4. A muted player never reads the hook: the premise is a wordless bark (row 457).
5. The ship is called "Kestrel" in the tutorial and "Hitch" on the HUD (row 457).
6. The same two filler lines appear in about 180 vignettes, and paying a toll earns +36 credits
   (row 459).
7. The shop advertises 672/min while the cap is 113/min (row 466).
8. "Last move: Cyclic demand" (row 465).
9. "Cause unrecorded", "NO TAPE", a statistics sheet of zeros, a dead photo Look button (rows 471,
   479).
10. Boss moves have authored counters that nobody sees (row 463).
11. Physics Venues is dropdowns behind a confirm dialog (row 472).
12. The station tab rail clips the last row on three screens (row 479).
13. Alien first contact is styled as a hazard warning (row 468).
14. 23–87 s before first control, with a tenths-of-a-second stopwatch (row 473).

## Next cycle

The next C1 pass takes the oldest grades first. All are dated 2026-10-19, so it starts with group A
and re-grades after rows 456/457/475 land. A C2 Stranger Pass with fresh captures of Swarm in
motion, an Adventure boss fight and a race in flight is owed before any presentation grade moves
up.
