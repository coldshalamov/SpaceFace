# Economic red team (SF-CLOUD-13)

Adversarial search over real SpaceFace economy actions. The tool boots the live
economy, cargo, faction, ship, mission, crafting, mining, and automation writers
and looks for credit loops. It does not invent prices or write credits except as
the opening scenario stake.

```
node tools/economic-redteam/cli.mjs --seed 1845 --sequences 500
node --test tools/economic-redteam/test.mjs
node tools/economic-redteam/cli.mjs --smoke
```

Receipts land in `tools/economic-redteam/artifacts/`.

Production edits for the two reproduced loops are withheld in `FIX.patch` and
described in `ADAPTER.md`. Shared credit and cargo writers were not modified.
