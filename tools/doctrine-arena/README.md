# Doctrine arena

Executable counterplay tournament. This arena is a separate tape from shipping play.
It boots the authoritative runtime (`flightV3`, `aiPorts`, `weapons`, `combat`,
`collisionConsequences`, `physics`) and must not start `tacticalAI`. Shipping play
still wires `src/systems/tacticalAI.js`. A doctrine change moves the tape. Editing
only `tacticalAI.js` does not, because the tape never constructs that system.
Policies live in `src/ai/counterplay/` and only emit intents.

```bash
node tools/doctrine-arena/cli.mjs --probe=cp_feint_break_courier --seed=17 --tape=resists
node --test tools/doctrine-arena/test/counterplay.test.mjs
```

Held-out seeds are `101`, `409`, `1601`. Development seeds are `17`, `43`, `89`.
The production tactical adapter is active and described in `src/ai/counterplay/ADAPTER.md`.
`test/counterplay-production.test.mjs` covers the live tactical owner and native physical verbs.
Use `--pilot=stationary` for a fixed target when probing physical shot outcomes.
