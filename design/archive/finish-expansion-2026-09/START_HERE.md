# SpaceFace — finish the game, then expand its possibilities

**A source-grounded design and execution dossier.** Prepared September 28–29, 2026 from a pinned review of the current repository, PR 170, and the owner's original alien planning thread. This is a ZIP handoff, not a repository mutation. No game build, playtest, performance measurement, asset render or PR merge was performed while making it.

## Start in this order

1. Give an orchestrating agent `prompts/BOOT_AGENT.txt` and this entire folder in the SpaceFace checkout. It must read the checkout's current `AGENTS.md` and `build_map.md` first.
2. Read `direction/01_PRODUCT_AND_FINISH_SCOPE.md`, `audit/01_CURRENT_BUILD_AUDIT.md`, and `integration/01_ADMISSION_AND_CROSSWALK.md`. These prevent stale fixes, speculative scope growth, and a competing queue.
3. Select the first useful production slice from `direction/02_BUILD_MAP.md`. `FIRST_WAVE.md` offers parallel lanes, not a command to run all of them.
4. Open the matching program in `programs/`, then its specific `builds/` packet. Missions, model briefs, and VFX/audio briefs are linked to those programs. Small directed work belongs in `inference/` after its dependencies are actually available.

For browsing, open `INDEX.html` locally. It is a static searchable document navigator, not a runtime or dispatch service. `catalog/task_catalog.json` and the CSV projections are machine-readable **candidate inventories**. Their status does not replace the repository queue. Local IDs have the `SFQ-` prefix to avoid pretending they are existing PQ or AE assignments.

## What this pack does

It organizes 24 whole-game programs, 240 build-plan candidates, 96 bounded INFERENCE candidates, 36 mission/scenario briefs, 36 model-family briefs, and 32 VFX/audio-family briefs. The breadth is a reservoir. It is **not** a promise to implement every idea and is **not** the launch feature count. Individual plans frequently finish, connect, repair or curate existing content rather than add another system.

The immediate product is a fast physical toy, a rewarding local world, and a complete way to interact with both. The alien extension gives matter additional behavior. The machines give selected spaces and workpieces additional rules. Neither should displace the ordinary game or make the current core wait for speculative inventions.

## The current source baseline

- Master inspected at `9a30ffc00204a943ed9307deb56cb8bf23687ad9`.
- Alien PR 170 inspected at `580ed7bb99de164253f6bb43fd9fc385ae3c1504`, then open and unmerged.
- Default flight: V3. Default AI: SG-06 tactical. Default physics: Rapier dynamic. Simulation: fixed 60 Hz, XZ plane, separate rendering.
- G-mode dynamic relative combat stick already exists. Meaningful-hit cruise filtering already exists. Do not revive old draw-to-fly or chip-damage diagnoses as if nothing changed.
- ORRERY is the current frontend direction. Forge is the current flyable-hull asset pipeline. This pack creates neither a replacement UI style nor an asset loader.

See `audit/SOURCES.md` for exact sources, ranges and provenance. A source file's existence is not proof of its live selection, visual quality or successful player route. The receiving agent must revalidate against the current checkout and preserve concurrent work.

## The standard of completion

A stranger can boot, understand what to do, fly responsively, create a satisfying physical outcome, receive clear feedback, earn and fit something useful, fail without losing the entire game, and return to a world that remembers the event. Selected late content adds surprise without dissolving those rules. Every retained route survives ordinary save/load, input, device and asset failures.

“A-list” is the owner's quality aspiration. This plan makes that aspiration testable in pieces; no document, metric or agent review can guarantee critical reception or commercial success. The final scope and quality verdict must be based on the actual moving, sounding, playable game.

## Safe packaging and adoption

Copy this folder to a supporting design location such as `design/finish-expansion-2026-09/` if the receiving agent needs durable repo context. Preserve its files as source plans. Add only the appropriate family link to the existing plan registry/build map, and map selected units to current owners. Do not replace root `AGENTS.md`, `build_map.md`, the queue, ORRERY, Forge or historical plans wholesale. The current user authorization is to plan; implementation agents should follow their actual assigned implementation scope.

`python tools/validate_pack.py` checks this handoff's internal IDs, references, dependency DAG and relative links. An optional `--repo /path/to/SpaceFace` reports candidate path existence; it does not run game tests or certify the feature. The included validation report concerns this document package only.
