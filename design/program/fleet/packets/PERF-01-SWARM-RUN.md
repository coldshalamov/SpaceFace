# PERF-01-SWARM-RUN — Record the Swarm 20 diagnostic matrix

Run this exact command once. Let the game lock wait without a wrapper timeout.

```
node scripts/fleet/game-lock.mjs run -- node scripts/probe-main-thread-profile.mjs --baseline-source=.devshots/source-baselines/stand-in-publish.json --swarm-round=20 --hold-still --experiments=skip-render,no-post,hide-hud --ms=15000 --trace --label=stand-in-perf01-swarm20
```

This is a read-only profiling task. No tracked edits or other game instances. Record the exit status,
loaded route and renderer, neighboring baseline deltas, missing or ineffective arms, and trace path
in the receipt. Report an early end of the round or death as such and retain the partial evidence.
