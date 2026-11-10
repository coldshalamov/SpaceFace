# IMPORT — faction-presence-quiet-latch (#160)

## What

Quiet-latch empty `factionPresence` per-tick shipLike walks (fulfillment
fixed-route anchors + pitborn-gone probes) (~7.92–8.23× median / ≥6.01× floor
on bare master @ 40 idle ships).

## Apply

```
git am --ignore-space-change design/program/vm-drop/faction-presence-quiet-latch/patches/*.patch
```

Base: master tip `97c88f92b` (at package time).

## Claims

Portable registry.step residual after #159 — not soft-GPU fps. Fresh ungated
subsystem (not packCombat / stampNear / lifetime / classify / trust-sleep /
bandRadio / traffic / law rediscovery).

## Owner-GPU

No headed verification required for this CPU latch. Picture contract ON
(latched = no fixed-route / pitborn presence work).
