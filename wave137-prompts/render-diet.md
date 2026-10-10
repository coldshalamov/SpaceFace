# Wave 137 audit — render-traversal lane (scoped from the W136 blind-global reviewer's B1)

You are a performance auditor for **SpaceFace** (WebGL/Three.js space game). Repository `coldshalamov/SpaceFace`; work on branch `devin/1791504143-perf-w120` — pull latest and audit HEAD (e982b5a96 or later). This lane exists because the W136 blind global reviewer flagged **B1 — whole-scene `scene.updateMatrixWorld` + `projectObject` traversal ≥2×/frame under the GRAPH route (owner-measured ~11ms pre-park) — as missed by every existing lane**. Audit-only: no code, no PR, no app run (SwiftShader box — Electron presents 0 frames; CPU-side harness metrics and mechanism probes are valid, GPU conclusions must be tagged hardware-unverified). Golden pin `0b33dde1` untouched.

## Your mandate

Produce an evidence-labeled bottleneck map and a concrete, ranked optimization plan for the render-traversal workload. This is AUDIT, not implementation — findings + fix sketches + risk ranking, tagged per the campaign contract (MECHANISM VERIFIED / PERFORMANCE VERIFIED / UNVERIFIED).

1. Enumerate every per-frame (or per-presented-frame) full-subtree walk on the GRAPH route: `scene.updateMatrixWorld`, `projectObject` (frustum culling + render-list build), shadow-map render passes' own traversals, any manual `traverse`/`traverseVisible`/`traverseAncestors` on the hot path, visibility/park sweeps, census collects that still walk whole subtrees per frame. For each: caller, frequency, subtree size class, and whether it's owner-measured or inferred.
2. Where traversals duplicate each other in one frame (updateMatrixWorld + projectObject both walk the full graph; shadow passes re-walk), classify what's structurally avoidable vs engine-mandated.
3. The W121 sketch (still unimplemented per the global report): a flat drawable registry replacing traversal-driven collection — locate it in wave121-reports/global.md, assess what it proposed, what's changed since, and whether a bounded variant (dirty-marked subgraph walks, cached render-list segments per stable subtree, visible-set memoization keyed on transform epochs) is implementable without touching presented-frame correctness.
4. Measure what you can headlessly: count scene-graph node census on the real boot sequence if a headless scene can be built from the test harness; otherwise bound by static analysis (mesh count per sector, dirty-flag fan-out). Tag every cost claim with its evidence level.
5. Rank a concrete approach order with risk: render-list diet (flat registry), matrix-world skip for static subtrees (autoUpdate=false subtrees), projectObject pruning vs precomputed visible sets, shadow-pass traversal dedup. For each: what breaks (dynamic reparents, animated nodes, the popin lanes' own admission machinery), effort S/M/L, expected win.
6. Check the interplay with PR #260 (the sim-worker adoption — devin/s1-sim-worker): does anything in B1's scope move off-main, or is it all main-thread render work unaffected by the lane flip.

## Output contract

Commit your report to the wave137-reports/ directory on branch `devin/perf-wave-prompts` in the sf-prompts repo (clone https://github.com/coldshalamov/SpaceFace if needed — the prompts live on branch devin/perf-wave-prompts of that repo under wave137-reports/). Name it `render-diet.md`. Format:

```md
# Wave 137 audit — render-traversal lane
saturated: <true|false>
## Bottleneck map (per-frame traversals, callers, sizes, evidence)
## Findings (ranked — each with evidence label, impact, effort, risk, fix sketch)
## Approach ranking (with what-breaks analysis)
## Interaction with PR #260 / prior wave machinery
## Hardware-unverified claims (needs real-GPU box)
```

Saturation definition (campaign contract): saturated:true ONLY when there is no unaddressed material evidence-supported optimization in this lane's scope — an enumerated approach list with ranked fixes is evidence of saturated:false. Be specific: file:line citations, mechanism probes where headless-checkable.
