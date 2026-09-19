# SpaceFace · Tension Director

**An implemented session-pacing controller, its campaign-consumer patches, and reproducible evidence.**

The director requests an arc. The simulation supplies the events. The instrumentation does not
confuse the two.

This delivery implements `02-tension-director.zip` against the source snapshots supplied in that
packet. It is not a whole SpaceFace checkout, a deployed GitHub change, or a claim that synthetic
fixtures meet the game's production fun-loop bars.

## Start here

Use Node.js 20 or newer. No package installation, build step, browser, network connection or
third-party runtime dependency is required.

```sh
npm test
npm run fixture
npm run verify
```

`npm test` discovers tests explicitly, including on Windows. The VM-modules flag is needed only
by the focused fixture that imports the actual campaign consumer while isolating unrelated world
content; it is **not** needed by the four shipped gameplay modules. Node prints an expected
experimental-VM warning during those tests.

`npm run fixture` generates six fixed-seed, thirty-minute sessions and their legacy A/B arms in
`evidence/generated/`. For the full delivered experiment:

```sh
npm run fixture -- --hours 10 --repeat --out evidence/reproduced
```

The six directed ten-hour sessions, their six legacy arms, and six repeated directed runs with a
midpoint owner-state round-trip total **180 simulated fixture-hours**. Open
`evidence/session-shape.html` for the supplied trace report, or inspect the raw JSON/CSV files in
`evidence/ten-hour/`. This is simulation time, not human playtesting.

## What is implemented

The pure controller keeps a thirty-minute, fixed-capacity history of player-attributed facts.
It uses protected quiet, opportunity, build, observed peak, aftermath, and recovery phases,
with three arc motifs selected from recent actions. Confidence responds to outcomes, not the
age of the save. Three ten-minute acts organize each thirty-minute chapter without raising
ship statistics.

The SpaceFace system adapter consumes the existing bus, samples bounded encounter-owned rosters
on the XZ plane, owns only `state.tensionDirector`, and exposes explicit debug/save/transaction
ports. There is no entity scan across the entire world, shared RNG draw, wall clock, DOM code,
AI damage rewrite, credit award, direct spawn, forced enemy disappearance, or new render loop.

The campaign consumer reads a short-lived policy to adjust bounded pressure accrual, prefer
contextually useful due encounters, reserve major combat for a commitment window, and protect
release periods. The original authored eligibility gates, spawn admission, budgets, cooldowns,
rolling quotas, live caps and scripts remain authoritative. Missing or expired policies return
to the original consumer behavior.

## Install into a checkout

Do not copy the old complete registry over unrelated newer work. Use the conservative installer:

```sh
node tools/install.mjs "/path/to/SpaceFace"
node tools/install.mjs "/path/to/SpaceFace" --apply
```

Stop other writers to the checkout while applying changes. The first command is a dry run. The second copies the four new modules, applies uniquely
matching context patches to the two supplied integration files, and inserts the system
immediately before `encounterDirector` in the production initialization, update, and calendar
manifest arrays. It preflights every file before writing, preserves unrelated edits and CRLF,
refuses conflicting existing implementations and symlinked destinations, and records backups.

The command prints its backup directory. Rollback refuses to destroy work changed since install:

```sh
node tools/install.mjs --rollback "/path/to/SpaceFace/.tension-director-backup-XXXXXX"
```

**Read `INTEGRATION-NOTES.md` before local acceptance.** A separately maintained Node-only
system lookup must import/materialize this system too. Exact persistence needs the host save
schema to carry its owned snapshot. Those host-owned files were not in the packet and are not
silently invented or overwritten here. The packet explicitly assigns final wiring and local
production checks to its integrator.

## Delivery map

| Location | Purpose |
| --- | --- |
| `repo/src/ai/tensionDirector.js` | Pure, deterministic feedback controller and validated snapshots |
| `repo/src/ai/tensionWindow.js` | Fixed-space rolling event histogram |
| `repo/src/ai/tensionPolicy.js` | Validated, leased read port and bounded consumer helpers |
| `repo/src/systems/tensionDirector.js` | Bus, game-state, lifecycle, sensors, debug and save adapter |
| `repo/src/systems/encounterDirector.js` | Complete supplied campaign consumer with targeted integration |
| `repo/src/core/registry.js` | Complete supplied registry with import and lookup entry |
| `patches/` | Small, reviewable diffs rather than blind file replacement |
| `repo/tests/tension-director/` | Behavioral, regression, lifecycle, fixture and installer tests |
| `fixture/` | Fixed-seed standalone harness, real bus, explicit dependency isolation |
| `tools/` | Installer, test discovery, integrity checks and trace report generation |
| `evidence/` | Test log, ten-hour raw traces, comparisons and readable session report |
| `docs/ARCHITECTURE.md` | State, control loop, invariants, limits and tuning rationale |
| `docs/ACCEPTANCE.md` | Production checks and a disciplined playtest/tuning protocol |
| `docs/BASELINE.json` | Exact source fingerprints and repository-baseline caveat |
| `AGENT-HANDOFF.md` | Local integration-agent instructions and evidence discipline |
| `TEST-REPORT.md` | What was run, what passed, and what remains unmeasured |

## Baseline and limits

The packet names commit `de9f3f1fc`; GitHub returned “No commit found” for that identifier during
this implementation. The uploaded files therefore define the patch baseline. The current
runtime-manifest and difficulty-owner interfaces were inspected separately. This discrepancy
is recorded, not hidden in a claim of exact master compatibility.

This module cannot cure an exhausted content schedule by multiplying zero supply. It diagnoses
that condition distinctly. It cannot prove meaningful choices from event counts, repair the
whole economy, resolve all pinned existing combat, or promise that a plotted waveform is fun.
The delivered acceptance protocol deliberately asks for those harder, production-level checks.
