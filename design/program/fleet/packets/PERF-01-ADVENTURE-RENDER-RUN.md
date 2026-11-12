# PERF-01-ADVENTURE-RENDER-RUN — Isolate the render cost in steady Adventure

The previous held-thrust run crossed sectors before the render-off and trace arms. Use the
same ordinary route while holding position, with only the two render arms left to resolve.

```
node scripts/fleet/game-lock.mjs run -- node scripts/probe-main-thread-profile.mjs --baseline-source=.devshots/source-baselines/stand-in-fleet-final.json --hold-still --experiments=skip-render,no-post --ms=15000 --trace --label=stand-in-perf01-adventure-render
```

Read-only. Leave all tracked paths and Git state alone. Wait through the game lock without an
outer timeout. In the receipt record the loaded source, renderer, neighboring baseline deltas
and native render/driver cost from the trace. Keep partial evidence if the flight fails.
