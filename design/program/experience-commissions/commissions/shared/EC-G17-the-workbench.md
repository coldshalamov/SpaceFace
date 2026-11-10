# EC-G17 — The workbench — see your own work in under a minute

**Direct execution commission · Shared tooling**
**Commissioned by the creative director, 2026-11-09.** Standard and build order: [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md).
**Native parents:** `Q2`, `Q5`, `E10`; tooling lives in `scripts/` and `tools/`.

## Why this exists

This game has about 5,500 test files and a check command that chains roughly 400 steps, and it still ships things that look or play wrong. Tests prove a rule held. They do not show an agent what it made.

What an agent can already do quickly is good: shoot any interface screen over a still in seconds (`node scripts/ui-bench.mjs --shot=<id> --walk`), run a behaviour in the no-boot simulation lab (`node scripts/agent-loop.mjs sim <scenario> --trace`), and play three public-input rounds of Swarm with a contact sheet (`npm run player-truth -- --mode=swarm --arena="<name>" --rounds=3`).

What is missing is what every commission needs. A survey of the tools on 2026-11-09 found five gaps. This commission closes them, once, for everyone who comes after.

## The five tools

### 1. `look` — go there and show me

One command that takes the game straight to a place and hands back a picture.

- a sector and a named spot in it, **or** a Swarm arena and a round number (round twenty, boss on — today three rounds is the practical ceiling);
- a seed, so the same command shows the same scene;
- the normal gameplay camera, never a debug view;
- output: one still, and optionally a ten-second clip, in a folder the agent can open.

Today only Helios and Ceres can be captured this way, through a hard-coded script (`scripts/capture-sector-identity.mjs`). Every sector commission currently has to write its own copy. Build the general one on the existing dev entry (`?dev=`, `devseed`, `devsetup`).

### 2. Worst-case text for the bench

A switch on the bench that fills every screen with the nastiest content the game can produce: the longest names, the biggest numbers, a label twice the length of English, empty lists and very long ones. Cut-off text is currently found by luck. With this it is found every time.

### 3. The census — is it actually in the game

A scripted tour of the ordinary route that lists every ship, enemy, job, contact and prop defined in data and marks each one **seen** or **never seen**. "Defined in data and never met in play" is this project's most common silent failure. The census turns it into a list with names on it.

### 4. Before and after, one line

One command that runs the same crowded scene on the base and on your change, back to back in the same session, and prints a single pass or fail with the frame-time numbers beside it. The parts exist (`scripts/capture-gameplay.mjs`, `scripts/check-hitch-budget.mjs`, `scripts/compare-perf-baseline.mjs`); nobody has to remember how to chain them. It must run both sides in one sitting, because this machine swings from 60 to 40 frames a second with background load.

### 5. The Stranger packet

One command that gathers a three-minute clip and a handful of stills of a place into a folder, together with the five Stranger Test questions and **nothing else** — no brief, no code. A fresh reviewing agent is handed only that folder. Its answers are the acceptance record for a commission.

## How to build this without fooling yourself

- Each tool is finished when a different agent, given only its one-line usage, gets a correct result first try.
- Each tool is used on a real commission before it is called done: `look` on Tethys, the census on Helios, the packet on whichever town is in flight.
- Speed is the feature. If `look` takes longer than a minute for a still, it will not be used; find out why and fix that.
- No new test files for the tools beyond one smoke test each. The point is fewer, better looks — not more tests.

## Finish line

- Every commission's "how to check your work" section fits in three commands.
- The census runs on the whole ordinary route and its never-seen list is filed against the owning commissions.
- The Stranger packet has been used to accept, or to reject, at least one town.

## Explicitly reject

A dashboard. A framework. Another layer of checks that must pass. A tool that needs its own documentation page to use.
