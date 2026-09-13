# Worktree checkpoint — 2026-09-13

This handoff replaces the removed full working copies. Candidate commits remain on their named
branches; do not re-create a worktree until taking one bounded next action.

| Branch | Commit | Disposition | Validation recorded | Next action |
| --- | --- | --- | --- | --- |
| `codex/pq19304-capsule` | `34caed7f7ab17d50c5a8872e2ce906ef60127722` | Parked source/release candidate; not integrated because shared manifests were owned by other work. | Source/release hashes and a component-scoped visual review were recorded; this does not close whole-asset gates. | Recreate only when the manifest paths are free; run runtime/release acceptance. |
| `codex/pq19304-hulk` | `e62350bb6a954fc5049dca0420a7561735fc72f8` | Parked 47A Bourse admission candidate; it fixes early residency/placement, but does not make the old wreck art acceptable. | Focused route/first-flight/admission tests: 25/25; `check-47a-visual-assets`: 37 ok. | Promote only with an accepted Bourse art source/release candidate. |
| `codex/pq19305-drone` | `b632371653350863bf00aa7564294a3a8b357f2e` | Parked mining-drone source/release candidate; main manifest paths were owned by other work. | Drone tests 10/10, playable checks 16/16, selected release transaction, component-scoped KEEP review. | Recreate only when manifests are free; perform route-level acceptance before integration. |
| `codex/pq19403-arena` | `8667b120ac926ddba2eb0034e29a00e32078b3e6` | Parked Arena Foundry release/runtime candidate; integration waits on foreign manifest ownership. | Place builder 10/10; package binding; live Crucible route reached `phase: live`, hull drawn, one prop; component review KEEP. | Recreate only when manifest paths are free, then integrate and rerun the focused release/runtime checks. |
| `codex/pq19304-bourse-art` | `a4a538ddb7dd0830af926f32653187277b224107` | Source-only Bourse wreck revision; **REVISE**, not a release candidate. | Blender/export/reimport, socket/tangent/bake/LOD checks passed. Controller review found the forward material treatment too pale/clean and the far read too generic. | One bounded material/readability source pass, then independent visual review before any release work. |
| `codex/worktree-handoff-20260913` | this commit | Renderer diagnosis only; no product diff. | Full capture reproduced a ~5 s first-flight bloom shader-link brick, failed-closed opening binding, delayed ready signal, and an uninstrumented second New Game WebGL preview context. | Recreate only for a source-causal renderer fix with a direct route regression, not another exploratory audit. |

## Removal record

The following full worktrees were clean when removed: Bourse art, capsule, Bourse admission,
mining drone, and the renderer-diagnosis checkout. Arena Foundry contained one untracked 155 KB
root-level `place_ui_arena_foundry.blend`; it was discarded as a stale, unreferenced duplicate.
The committed canonical source is
`assets/ships/ui_arena_foundry/source/place_ui_arena_foundry.blend`, which is the only path used
by the builder and authoring manifest.

The empty `SpaceFace-pq019-reconcile` directory had no Git worktree registration or artifact and
was removed separately. The detached `C:\Users\93rob\AppData\Local\Temp\sf-head-check` checkout
was clean, its commit was already an ancestor of `master`, and it was removed as an unneeded 6 GB
temporary worktree.
