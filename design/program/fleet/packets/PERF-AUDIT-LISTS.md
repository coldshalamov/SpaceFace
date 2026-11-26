# PERF-AUDIT-LISTS — four checklists for the frame-rate engineers

**For:** a careful reader of code. **Kind:** read-only audit. **Change no source file.** No game
boots, no test runs: this is reading and listing. Write only under
`.devshots/director/fable/audits/`.

## Why

The game runs at 8 frames a second in a Swarm round-6 fight on the owner's laptop. Five engineers
are fixing it right now (scene, HUD, simulation, GPU, measurement). The cause is a pattern, not one
bug: work that only needs to be recent is done in full on every frame or every simulation step.
Each engineer needs a complete list of where that pattern lives in their area, so that "zero
per-frame document reads" and the like can be checked off line by line instead of found one profile
at a time. Completeness matters more than commentary.

## The four lists

Each list is a plain text file, one finding per line, tab-separated:
`file:line <TAB> enclosing function <TAB> what it does <TAB> how often it runs <TAB> note`.
"How often" is one of: `per-frame`, `per-step` (simulation tick), `per-event`, `on-change`,
`on-open`, `unknown`. Decide it by reading the callers up to the frame loop
(`src/core/presentationRunner.js` `frame`, `src/ui/uiRoot.js` `frame`, `src/ui/hud.js` `frame`,
`src/render/renderer.js` `prepareFrame` / `drawPreparedFrame`) or the simulation step. When you
cannot tell, write `unknown` and say what you would need to know. Sort each file by "how often"
(`per-frame` first), then by path.

### A. `audits/ui-layout-reads.txt` — document reads in the interface

Every call in `src/ui/**` to: `querySelector`, `querySelectorAll`, `getElementById`,
`getElementsByClassName`, `getBoundingClientRect`, `getClientRects`, `offsetWidth`, `offsetHeight`,
`offsetLeft`, `offsetTop`, `offsetParent`, `clientWidth`, `clientHeight`, `scrollWidth`,
`scrollHeight`, `scrollTop`, `getComputedStyle`, `checkVisibility`, `matches`, `closest`,
`innerText`, `elementFromPoint`, `measureText`. Flag in the note any that follows a style, class
or text write in the same function (a forced layout). Then a second section in the same file:
every `requestAnimationFrame` callback and every `setInterval` / repeating `setTimeout` registered
under `src/ui/**`, with what it does each time.

### B. `audits/sim-hot-path-events.txt` — the event bus inside the simulation step

Every `bus.emit(` / `emit(` call under `src/systems/**`, `src/sim/**`, `src/ai/**`,
`src/combat/**`, `src/core/**` that can run during a simulation step: the event name, whether it
fires `per-step` unconditionally, `per-step` per entity, or only when something happens; and for
each `per-step` event, the listeners registered for it anywhere in `src/**` (`bus.on('name'`).
Then a second section: every system registered in the step order (find the registry the worker
steps through; `ARCHITECTURE.md` and `docs/SYSTEM_REGISTRY.md` say where) with one line saying
what it does and whether its work is visible to the player every tick (movement, firing, hits) or
only needs to be recent (planning, sensing, bookkeeping, economy, law, ambient life).

### C. `audits/scene-static-nodes.txt` — scene objects that never move

Every place under `src/render/**` that creates a `THREE.Group`, `Object3D`, `Mesh`,
`InstancedMesh`, `Points`, `Line` or `Sprite` and adds it to the scene: what it is (ship part,
arena set piece, station, rock, effect, helper), whether it moves after creation, whether
`matrixAutoUpdate` / `matrixWorldAutoUpdate` is switched off anywhere for it, and whether it
creates a new material per object (`new THREE.Mesh...Material(` inside a per-object function)
where a shared one would do. A second section: every `onBeforeRender` / `onAfterRender` hook and
what it does per draw.

### D. `audits/frame-path-allocations.txt` — garbage made every frame on the main thread

In functions that run per frame under `src/render/renderer.js` (`prepareFrame`, `syncEntityViews`,
`syncEntityViewsSteps`, `drawPreparedFrame`, `serviceRenderMeshResidency`), `src/render/vfx.js`
(`update` and what it calls), `src/render/snapshotFence.js`, `src/render/npcJobSignatureVfx.js`,
`src/render/camera.js`, `src/core/presentationRunner.js` and `src/core/simLaneMain.js`
(`applyTickReply`, `applyClockReply`, `drainClockReplies` and what they call): every `new`
(vectors, matrices, arrays, Maps, Sets, objects), every array or object literal, every
`.map(` / `.filter(` / `.slice(` / spread / `Object.keys(` / `JSON.` call, every closure created
inside a loop.

## How to work

`rg` (ripgrep) with line numbers is the tool: `rg -n "getBoundingClientRect" src/ui`. The two
biggest files are `src/render/renderer.js` (about 36,000 lines) and `src/ui/hud.js` (about 8,000):
read around each hit; do not try to read them whole. A profile that shows where the time goes
today is in `.devshots/frame-cost/owner-r6/cur-r0.json` (`profile.self`, `profile.inclusive`): use
it to check that the hottest functions are covered by your lists, and say so at the top of each
file.

## Done when

The four files exist, each starts with three lines saying how many findings it has per "how
often" class and which hot functions from the profile it covers, and a fifth file
`audits/SUMMARY.txt` gives, for each list, the ten findings you judge most costly and why. In the
receipt: the counts, anything surprising, and what you could not classify.
