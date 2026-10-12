# Economic red team (SF-CLOUD-13)

Adversarial search over real SpaceFace economy actions. The tool boots the live
economy, cargo, faction, ship, mission, crafting, mining, automation, and save
writers. The opening wallet is the live new-game default. Credits move only
through those writers.

| | |
|---|---|
| Base commit | `bc40effa746f91af080144ebceed7ba9a9db3b8f` |
| Reviewed head | `762303e38628abab85b628b4ff1fb19857fbdbc5` |
| Publish head | not committed here — the parent republishes `cursor/economic-redteam-28d1` |

```
node --test tools/economic-redteam/test.mjs
node tools/economic-redteam/cli.mjs --seed 1845 --sequences 500
```

Last run: 7 tests, 7 pass, 0 fail. The CLI completed 500 traces
(`integration-ready`, critique holds).

Receipts land in `tools/economic-redteam/artifacts/`. The minimized contraband
command list is `artifacts/contraband-minimized.json`.

Production edits are withheld in `FIX.patch` and described in `ADAPTER.md`.
`src/systems/economy.js` is owned by open PR 260. `src/systems/cargo.js` is free
and its hunk is the landing diff.
