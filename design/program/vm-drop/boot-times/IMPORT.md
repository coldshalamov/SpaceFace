# boot-times — outbox import

## What it is

A measured cold-boot report: three idle-machine runs from page navigation to first playable flight control, with loader stage timings. Software-GPU (SwiftShader) baseline on the Grok Bot VM.

## Live path that would receive it later

None as a binary. An owner may copy numbers into demo-readiness / perf notes, or re-run `measure-boot-times.mjs` on real GPU hardware. This folder does not replace any live probe under `scripts/`.

## What was not wired

- No edits to `src/`, `styles/`, loader, or npm scripts.
- No PR, no merge to master.
- Cinematic splash was skipped (`sf.cinematicSeen`) for a stable boot clock; a human cold open that watches the splash will add that hold.
- Title-menu button order (DEMO: Crucible first) was not changed; first *enabled* control observed was New Game (no saves).

vm-drop tip before this job: `a3e5206a88e8123edb735b1dc309559ccae4aa44`  
origin/master at measure: `0fd64234a71147fd16f47f7a5f988d30fe758e3f`
