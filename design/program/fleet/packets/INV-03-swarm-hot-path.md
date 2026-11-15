# INV-03 — Per-frame waste in the Swarm fight (READ-ONLY code audit)

**You change no tracked file and start no game or browser.** Your output is your RECEIPT.md. Every
finding must cite `file:line` and quote the line. Anything you cannot point to in code, leave out.

## Background
SpaceFace runs a 60 Hz simulation (a worker) and a three.js renderer on the main thread. In a busy Swarm
round (dozens of hostile ships, rocks, projectiles, explosions) the main thread is nearly saturated.
Garbage-collection pauses and per-frame work cause hitches.

## Find, in code that runs EVERY FRAME or EVERY ENTITY UPDATE during a Swarm round:
1. Allocations: `new THREE.Vector3/Color/Matrix4/Quaternion/Object3D`, `new Array`, object or array
   literals, `.map/.filter/.slice/.concat/Object.keys/Object.entries/JSON.*`, template strings, closures
   created inside per-frame functions. Skip anything already hoisted to a module-level scratch variable.
2. Creating materials, geometries or textures at runtime per spawn (not cached or pooled), and
   `material.needsUpdate = true` or `.clone()` on a material per spawn/frame (this forces shader work).
3. DOM work per frame: writing `textContent`/`innerHTML`/`style` when the value didn't change,
   reading layout (`getBoundingClientRect`, `offsetWidth`) per frame, querying the DOM per frame.
4. O(n²) loops over entities per frame (nested loops over `entityList`) without a spatial grid.
Start from the per-frame entry points: search `src/render/` and `src/ui/` for `frame(`, `update(`,
`tick(`, `render(`, `requestAnimationFrame`, and the Swarm HUD (`src/ui/*swarm*`, `src/ui/hud*.js`).
Follow calls only as deep as needed.

## The receipt
Under **What the player now sees or feels**, list findings ranked by likely cost (entities × frequency),
max 25, each as: `file:line` — the quoted line — what it allocates/does — how often it runs (per frame,
per entity per frame, per spawn) — the plain fix (hoist, cache, dirty-check, pool). Be strict: a wrong
finding wastes the lead's time; when unsure, leave it out.
