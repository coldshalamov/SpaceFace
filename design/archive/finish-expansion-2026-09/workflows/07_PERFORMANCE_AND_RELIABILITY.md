# Performance and reliability investigation

## Record the conditions

Build SHA, mode, seed, save, hardware, renderer/backend flags, viewport/resolution, quality and host contention. A clean VM may make comparative diagnosis easier, but current repo policy does not permit waiting indefinitely for it before doing development work. State noise and confidence honestly.

## Reproduce the player symptom

Correlate a visible hitch with frame timing and owner work. Separate CPU simulation, render submission, GPU work, asset download/decode/upload, shader compilation, DOM/layout and scheduler failures. Average FPS is insufficient. For memory, repeat actual travel/dock/refit/load cycles and inspect retaining paths; a rising cache is not automatically a leak, and a fixed historical leak is not proof all lifetimes are correct.

## Intervene causally

Choose one named cause. Prefer correct indices, bounded locality, allocation reduction, batching, shared material ownership, actual-asset prewarming, disposal and sensible cadence. Do not change the default picture to make the measurement pass. A synthetic material warmup that differs from the real shader key proves little.

Compare identical routes. Preserve deterministic gameplay when the change is cosmetic/work scheduling. If a legitimate gameplay change alters goldens, explain the causal fields and review them; never overwrite expected data merely because it is red.

## Failure-domain honesty

An in-page watchdog cannot execute while its entire main thread receives no tasks. A worker heartbeat can help only when messages can still be processed. Distinguish renderer starvation from a permanent application latch. Do not use a fashionable primitive as a diagnosis.

## Reliability

Interrupt transactions, transitions and asset loads at their boundaries. Test stale request completion, older save schemas, missing optional content, device disconnect, pointer loss and recoverable context errors. Restore safely or show a real exit. Do not catch every exception and pretend the world is valid.

## Output

One causal finding, one implemented improvement, before/after evidence under declared conditions, preserved invariants and unresolved limits. Put remaining confirmed defects in the existing ledger. This workflow does not create a second profiler dashboard or proof bureaucracy.
