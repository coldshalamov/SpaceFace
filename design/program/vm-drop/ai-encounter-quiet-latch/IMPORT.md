# IMPORT — ai-encounter-quiet-latch (#161)

## What

Quiet-latch empty `aiEncounter` per-tick shipLike walks (authored reinforcement
callers) (~3.96–4.13× median / ≥3.34× floor on bare master @ 40 idle ships).

## Apply

```
git am --ignore-space-change design/program/vm-drop/ai-encounter-quiet-latch/patches/*.patch
```

Base: master tip `97c88f92b` (at package time).

## Claims

Portable registry.step residual after #160 — not soft-GPU fps. Fresh ungated
subsystem (not packCombat / stampNear / lifetime / classify / trust-sleep /
bandRadio / traffic / law / factionPresence rediscovery).

## Owner-GPU

No headed verification required for this CPU latch. Picture contract ON
(latched = no reinforcement-author scan / ensure* work).
