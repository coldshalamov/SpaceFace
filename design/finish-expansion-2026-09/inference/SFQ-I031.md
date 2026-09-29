# SFQ-I031 — Physical finish does not pay twice

**Kind:** bounded directed INFERENCE candidate. **State:** NOT ADMITTED.

Program: [SFQ-P08](../programs/08-missions.md). Starting owner candidate: `src/systems/missions.js`. The captain must resolve its exact current file/function and reproduction before handing it to a low-context worker. This is not permission to create the candidate path if absent.

## Do exactly this

Add the missing idempotence guard at a named mission settlement boundary.

## Done when

Repeated receipt/reload yields one payout.

## Do not

Do not ignore all repeated events globally.

## Preconditions

[SFQ-B061](../builds/SFQ-B061.md) must already hold where relevant. If missing, name the dependency and return to the captain; do not brainstorm a new subsystem. If already true, use the current native disposition and take the next assigned useful item.

## Proof and return

Reproduce the specified case before/after, plus one repeated or negative case. Use the existing deterministic fixture/seed and current authority. Visual, audio or input work needs the corresponding real observation, not a claim from static code. Preserve foreign paths. Return the exact change and evidence actually obtained under the native INFERENCE lifecycle. See [workflow](../workflows/04_INFERENCE_WORKER.md).

Source context: [S14](../audit/SOURCES.md#s14), [S16](../audit/SOURCES.md#s16), [S17](../audit/SOURCES.md#s17).
