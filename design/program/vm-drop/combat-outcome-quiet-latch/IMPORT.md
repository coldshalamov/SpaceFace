# IMPORT — combat-outcome-quiet-latch (#163)

## What

Quiet-latch the `combatOutcome` 4-tick `shipLike` forceFlee / fsm:flee scan when
the last scan recorded nothing (~2.05× median @30k / ~2.38× @100k warmed;
floor ≥1.80× on bare master).

## Apply

```
git am --ignore-space-change design/program/vm-drop/combat-outcome-quiet-latch/patches/*.patch
```

Base: master tip `97c88f92b` (at package time). Am-verify tip `8a6d29ada`.

## Claims

Portable registry.step residual after #162, not soft-GPU fps. Fresh ungated
subsystem. It does not rediscover packCombat / stampNear / lifetime / classify /
trust-sleep / bandRadio / traffic / law / factionPresence / aiEncounter /
difficultyDirector.

## Owner-GPU

No headed verification required for this CPU latch. Picture contract ON. The
change is observer-only receipt state and draws nothing.
