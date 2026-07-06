# Baseline snapshot — before world.js->spawnBudget client edit

Captured: session 2026-07-05 (post Wave-1 integration, pre world.js budget edit).

## check:sim:compare (47-A) — current failure (must stay identical after edit)
```
AssertionError [ERR_ASSERTION]: 47-A Phase 0 tape should exercise projectile collision
```

## Perf budget of record (design/CURRENT_BUILD_STATUS.md, 2026-07-04 audit)
- draw calls 78; render phase 5.6 ms; sim frame 2.9 ms; UI 1.1 ms; 30fps floor pass; authored fallback count 0.
- Strict raf.frame.p95: 16.9 ms vs 16.7 ms target (remaining polish, pre-existing).

## Live-ship cap invariant (target of the world.js edit)
- spawnBudget MAX=12. After edit: ambient headroom=8 (reserve<=8), encounters use remaining>=4. Total live <=12.
