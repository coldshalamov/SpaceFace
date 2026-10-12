# Doctrine arena

Executable counterplay tournament. It boots the authoritative runtime (`flightV3`, `aiPorts`,
`weapons`, `combat`, `collisionConsequences`, `physics`) and does **not** start `tacticalAI`.
Policies live in `src/ai/counterplay/` and only emit intents.

```bash
node tools/doctrine-arena/cli.mjs --probe=cp_feint_break_courier --seed=17 --tape=resists
node --test tools/doctrine-arena/test/counterplay.test.mjs
```

Held-out seeds are `101`, `409`, `1601`. Development seeds are `17`, `43`, `89`.
The global AI adapter is described in `src/ai/counterplay/ADAPTER.md` and is not applied.
