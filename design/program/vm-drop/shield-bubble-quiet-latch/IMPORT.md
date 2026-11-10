# IMPORT — shield-bubble-quiet-latch (#159)

## What

Quiet-latch idle per-entity `shieldBubble` presentation inside `syncEntityViews`
(~4.74–4.97× median / ≥3.04× floor on bare master @ 40 ships).

## Apply

```
git am --ignore-space-change design/program/vm-drop/shield-bubble-quiet-latch/patches/*.patch
```

Base: master tip `97c88f92b` (at package time).

## Claims

Portable syncEntityViews residual after #157/#158 — not soft-GPU fps.

## Owner-GPU

No headed verification required for this CPU latch. Picture contract ON
(latched = already-hidden bubble).
