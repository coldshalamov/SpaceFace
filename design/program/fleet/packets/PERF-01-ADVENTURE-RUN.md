# PERF-01-ADVENTURE-RUN — Record the Adventure diagnostic matrix

Run this exact diagnostic command once and let the game lock wait without a wrapper timeout:

```
node scripts/fleet/game-lock.mjs run -- node scripts/probe-main-thread-profile.mjs --baseline-source=.devshots/source-baselines/stand-in-perf01.json --experiments=hide-hud,no-post,render-scale=0.5,no-shadows,skip-render --ms=15000 --trace --label=stand-in-perf01-adventure
```

This is a read-only profiling task. No source, Git, queue, reference, or other tracked changes.
Do not run another browser or game. When the command finishes, write the runner receipt with
the exit status, actual route/renderer, coverage, each variant's neighboring baseline deltas,
and whether an arm failed to apply. If the measurement fails, report the failure and leave the
evidence intact. The command is the one named check and may exceed five minutes.
