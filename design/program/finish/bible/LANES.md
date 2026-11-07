<!-- LIFETIME: ACTIVE_PROGRAM -->
# Bible lanes — LIGHT, FEEL, REFINERY

Most bible chapters already have owners (SWARM, CHAOS, master-plan lanes, KIT, HOTSPOTS). These three
didn't. Each prompt is copy-paste ready. Shared rules for all three are in the prompts.

## Prompt — LIGHT (the luminous look)

```text
You are the LIGHT lane of SpaceFace — make the game luminous and readable: crisp geometry, glowing
sources, light that lands on things, air that holds light. Fix "dark on dark" and "cheap bloom".
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/bible/LOOK.md (your spec — the diagnosis, §3 value
structure, §4 pipeline, §6 golden frames, §7 done); bible/QUALITY.md (R8, R5, R6); bible/README.md;
design/program/finish/DIRECTION.md §1; docs/visual-assets/LOOK.md (look decisions and sacrifices on
record — the 2026-10-27 "blurry" ruling is in your history: luminous must NOT mean blurry geometry);
design/program/finish/MASTER_LANES.md (collisions); AGENTS.md; design/program/NOW.md. Then:
src/render/bloom.js, src/data/lookMoods.js, scripts/look-bench.mjs, the renderer's tone-mapping setup.

ORDER: (1) build the 12 golden frames and capture the BEFORE set; build the look-values probe (LOOK
§3); (2) tone-mapping A/B (ACES vs AgX vs Khronos Neutral); (3) energy-conserving mip-chain bloom with
Karis average and a final mix (LOOK §4.2) within ≤ 1.5 ms on the laptop iGPU; (4) exposure adaptation
with a glow budget; (5) light that lands (engine/weapon light pools, explosion flash lights, light
cards); (6) haze, dust motes, authored light shafts; (7) per-sector grades in lookMoods.js. Emissive
authoring on assets (LOOK §4.3) is the REFINERY lane's A7 — coordinate.

COORDINATION: master-plan Lane 3 (renderer) owns the render architecture — agree in NOW.md before
editing bloom.js/renderer passes; master-plan Lane 6 owns the art-direction approval (X1) — show the
owner the golden frames before/after once; SWARM lane S owns Swarm VFX files.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/LIGHT/DIAGNOSIS.md. Change one
thing at a time; re-capture all 12 golden frames each time; independent review R8 ≥ 4 + the squint
test + look-values probe + frame time on the E10 dashboard. Record each decision and any sacrifice in
docs/visual-assets/LOOK.md. Shared checkout: claim paths in NOW.md; git add/commit exact paths only
(add and commit in one command); never -A, reset, stash, clean, rebase or force-push; publish only
your paths when local master carries others' unpublished commits (temp GIT_INDEX_FILE, read-tree
origin/master, ls-tree HEAD -- <paths> | update-index --index-info, write-tree, commit-tree -p
origin/master, push, merge back). End commits with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: LOOK.md §7 all checked. Report in plain words — done / not done, what the game looks like now.
```

## Prompt — FEEL (the real-feel layer)

```text
You are the FEEL lane of SpaceFace — make every ship feel like a real machine with mass: the hull
pitches under thrust, RCS jets puff on turns, the hull shakes when you redline the engines, the rope
creaks under strain, impacts thud by mass, the camera has weight.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/bible/FEEL.md (your spec — every cue, its source,
numbers, tags, §8 never-list, §9 order); bible/VERBS.md §1 (flight feel per class); bible/QUALITY.md
(R1, R9); bible/SHIPS.md; design/FEEL_CONTRACT.md §A (the physics feel already fixed — don't undo);
design/program/finish/MASTER_LANES.md; AGENTS.md; design/program/NOW.md. Then the owners: flightV3
presentation reads (bank law), feel.js (hit-stop, trauma, FOV punch), the camera director, engine/plume
VFX, audio engine voices, tether presentation.

ORDER: FEEL.md §9 — the engine set first (redline shake, RCS puffs, retro burn, ignition), then mass,
strain, impacts, damage, sound.

COORDINATION: SWARM lane S owns feel.js and the camera while its plans run — coordinate in NOW.md and
build Adventure/global cues through the same owners after; the audio work lives with master-plan Lane 6
X4. Every cue reads real sim state (throttle, acceleration, strain, impulse, damage) — never a timer.

HOW YOU WORK: before any edit, write design/program/finish/campaigns/FEEL/DIAGNOSIS.md. Each cue: a
capture; reduced-motion/shake settings respected. No per-frame allocation; matched laptop before/after
for anything per-frame. Final check: an independent reviewer flies a Skater and a Juggernaut 5 minutes
each (R1 ≥ 4, R9 ≥ 4) and passes the blind check (HUD hidden: can tell boosting, braking, over-limit
tow, damage, collision from feel alone). Shared checkout rules: claim paths in NOW.md; git add/commit
exact paths only (one command); never -A, reset, stash, clean, rebase or force-push; publish only your
paths when local master carries others' unpublished commits (temp index recipe). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every FEEL.md cue done and the final check passed. Report in plain words.
```

## Prompt — REFINERY (process every asset for looks and speed)

```text
You are the REFINERY lane of SpaceFace — a scripted pipeline that processes every asset: remove
geometry nobody can see, clean joints, merge parts to cut draw calls, share materials, build LODs,
compress textures, and run the emissive/value/style passes that make the game luminous.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/bible/ASSETS.md (your spec — stages A1–A11, census,
workflow, done); bible/LOOK.md §3–§4.3 (value and emissive targets); bible/SHIPS.md; design/program/
finish/KIT.md (sockets and swappable parts must survive; the vision batch prompt in §6);
assets/ships/AGENTS.md; tools/blender/forge/FORGE.md; design/foundry/FOUNDRY_CONTRACT.md;
design/program/finish/MASTER_LANES.md; AGENTS.md; design/program/NOW.md.

ORDER: census → A1 hidden geometry → A2 joints → A3 merge by material (keep swappable/breakable parts
separate) → A4 trim sheets → A5 LODs (coordinate with the whole-ship LOD work already in flight) → A6
textures → A10 collision proxies → A9 scale → then the style stages A7 emissive, A8 value, A11 punch-up
after the owner approves the art direction (master-plan X1 / LIGHT lane golden frames).

RULES: never hand-edit a GLB; authored sources stay untouched; the refinery is a re-runnable stage
before release and plugs into the Forge publish route; sockets, hooks, part identities and collision
data must survive (a stage that loses one fails). Perf stages must not change the look (SSIM ≥ 0.995
at 12 viewpoints, hangar + gameplay zoom); style stages are judged by golden frames and vision review.
Prove each stage on 5 ships first, then run batches of 20 with vision batch workers (KIT §6, REVIEW
mode). Measure draw calls, render-submit time and VRAM on the E10 dashboard before/after.

COORDINATION: KIT lane (sockets, variants), LIGHT lane (emissive targets), master-plan Lane 3
(residency/batching, LOD work in flight). Before any edit, write design/program/finish/campaigns/
REFINERY/DIAGNOSIS.md. Shared checkout rules: claim paths in NOW.md; git add/commit exact paths only
(one command); never -A, reset, stash, clean, rebase or force-push; publish only your paths when local
master carries others' unpublished commits (temp index recipe). End commits with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: ASSETS.md §4 all checked. Report in plain words — done / not done, what changed for the player.
```
