# IMPORT — shader-readiness-no-isprogram (#169)

## What

`src/render/bloom.js` has two readiness waits: the pooled batch `drain()` and the owned per-compile
`checkProgramsReady` poll. Both asked `gl.isProgram()` once per 2 s per context as a handle-validity recheck
(`programHandleInvalid`). isProgram is a synchronous round trip that **waits for the GPU process to drain every
queued link**.

In flight, streamed admissions keep programs pending, so each recheck stalled the main thread behind the whole link
queue while the drawables it guarded were already hidden (`hideUnreadySceneDrawables`). Across 12 master-bloom runs
this cost **0.42–4.9 s of isProgram per 30 s of flight**, and 7 of the 12 runs had a single in-flight freeze of
**1.7–3.8 s**. Owner iGPU note in bloom.js: 10–28 ms per call.

With the patch, handle validity comes from:

- the `webglcontextlost` generation (unchanged);
- three's `destroy()` clearing `program.program` (unchanged);
- **new:** `program.isReady() === null`. three's `isReady()` returns
  `getProgramParameter(COMPLETION_STATUS_KHR)`, which WebGL answers with `null`, never `false`, for a handle the
  context does not own (three caches that null). A dead handle is therefore seen on the next non-blocking poll,
  which is sooner than the old ≥1 s recheck.

Nothing else changes:
- Admission still settles only when every program reports COMPLETION_STATUS true.
- The same programs are compiled, with the same keys and the same draws, so the picture is identical.
- There is no dummy prewarm and bloom is not touched.

## The one behavior change (owner decision)

A handle the driver silently forgets while WebGL still vouches for it (the "pathological silent handle loss" the
recheck bounded; bloom.js says it was never observed and that the two real invalidation paths are caught without
it) used to be caught within ~1–2 s. It is now bounded by the waits' existing 20 s deadlines: `drain` timeoutMs and
`readinessTimeoutMs`. Both resolve and let admission continue.

`test/scene-pipeline-readiness-batch.test.mjs` pinned the old ≥1 recheck ("many long links share one native handle
recheck budget"). That test is replaced by a zero-isProgram assertion, and two tests are added for null-handle
settling (batch path and owned-poll path).

## Apply

```
git am --ignore-space-change design/program/vm-drop/shader-readiness-no-isprogram/patches/*.patch
```

- Base: master `97c88f92b`. Verified tree `a11da49da` (= scratch `ef721f941`).
- Independent of #166/#167/#168. It applies with all of them and on `vm-work/stack-20260924u`.
