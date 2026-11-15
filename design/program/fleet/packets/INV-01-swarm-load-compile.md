# INV-01 — Why does a Swarm round take 43 s to "prepare the visuals"? (READ-ONLY investigation)

**You change no tracked file.** You may create files only under `.devshots/fleet/inv01/`. Your output is
your RECEIPT.md: findings with `file:line` evidence and measured numbers. Every claim must cite either a
line of code you read or a number you measured; mark anything else "UNVERIFIED".

## The measured problem
Headed Chrome on this laptop (Intel Arc), from pressing PLAY on the Swarm screen to the first hostile:
53.3 s. Of that, the loading screen line "Preparing the visuals" ("Compiling shaders and render
pipelines" → "Linking the first-flight render pipelines" → "Still preparing the visuals") takes **42.8 s**.
Source: `.devshots/fleet/firsthour/load-split/load-split.json`. The target for the whole load is ≤ 10 s.

## Questions to answer, in order
1. Which code runs during that phase? Find the loading-screen strings above in `src/` and trace what
   each stage waits on (warm-up / precompile code, `renderer.compile`, program polling,
   `KHR_parallel_shader_compile`, any queue pacer; `src/render/bloom.js` ~600–850 has some of it).
2. How many distinct WebGL programs are compiled for the first Swarm round, and what are they?
   Measure: write a probe under `.devshots/fleet/inv01/` that boots `/?swarmRound=1` headless
   (copy the boot loop from `scripts/fleet/looks/scene-census.mjs`) and, once flying, reads
   `renderer.info.programs` (each program has `name`, `cacheKey`). Group them by material type and
   by which `#define`s / onBeforeCompile hooks differ. Run it ONLY through the lock:
   `node scripts/fleet/game-lock.mjs run -- node .devshots/fleet/inv01/probe.mjs`
3. Which programs are near-duplicates (the same material with one varying define such as fog,
   shadows, instancing, skinning, vertex colours, a light count)? Estimate how many programs
   would remain if those were unified. Light counts matter a lot: three.js recompiles every lit
   material when the number of lights changes. Check whether the Nocturne fixed-residency light
   setup (`src/render/nocturne/`) actually keeps the light count constant from loading into flight.
4. Is compile serialized (waiting on one program before starting the next), or are all programs
   submitted first and then polled? Does anything force a synchronous `getProgramParameter`/
   `getShaderParameter` (which blocks on ANGLE) before linking completes?
5. Does anything compile again after the first frame of flight (a second cohort), for example the
   bloom chain, the arena lights, VFX materials, or post-processing?

## The receipt
Use the protocol's headings, but put the answers under **What the player now sees or feels** as:
a table of program groups (count, material, varying defines, where created file:line), the stage
timeline with code locations, and your ranked list of the 3 changes that would cut the most
seconds, each with the evidence. Include the probe's raw JSON path.
