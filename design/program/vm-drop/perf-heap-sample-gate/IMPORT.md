# IMPORT — perf-heap-sample-gate (#165)

## What

The presentation loop now reads `performance.memory.usedJSHeapSize` only while
Tier-1 perf counters are live. The read used to happen every frame and was
discarded, because Tier-1 is off by default. Removed: about **50–61 µs per
presented frame** (median 52 µs) at frame cadence in Electron.

## Apply

```
git am --ignore-space-change design/program/vm-drop/perf-heap-sample-gate/patches/*.patch
```

Base: master tip `97c88f92b`. Am-verify tip `330d70d7a`. Independent of #164;
both-applied tip `d374c3891`.

## Owner-GPU

Nothing is drawn. Captures with Tier-1 enabled still sample the heap every frame.
