# Tally assessor lifecycle handoff

This increment keeps the named assessor as one finite authored actor across live, far-actor, and durable-save residency. It preserves the assessor body and phase during restoration and prevents generic traffic adoption from assigning ordinary freight to that assessor, while unrelated freight still adopts normally.

The earlier five-source public candidate failed its generic-adoption regression: traffic attempted to assign an ordinary freight manifest to the named assessor, triggering the test guard (`generic freight forbidden`). The added `src/systems/traffic.js` filter excludes the named assessor from generic freight adoption.

## CPU validation

Run from the repository root with Node.js and the repository's normal dependencies:

```sh
unset NODE_OPTIONS NODE_PATH NODE_COMPILE_CACHE
export NODE_DISABLE_COMPILE_CACHE=1
timeout -k 3 30 node --max-old-space-size=256 --test --test-name-pattern='^(actual live assessor shelf suppresses replacement on next owner cadence|actual shelf promotion retains authored assessor body and presentation|repeated shelf serialize/restore promotes one same authored assessor with exact cargo job phase|generic traffic adoption does not mint freight for named assessor|durable capture and actual world rematerialization retain phase and authored body|ordinary normalized body survives shelf promotion without healing thrusters|durable-only existing assessor defers owner mint and preserves cargo job phase|top-level far identity claim cannot be treated as absent or promoted generically|refuses duplicate-live without replacing a claimed resident|refuses duplicate-far without replacing a claimed resident|refuses wrong-def without replacing a claimed resident|refuses wrong-shape without replacing a claimed resident|refuses wrong-mass without replacing a claimed resident|refuses wrong-phase without replacing a claimed resident|refuses wrong-sector without replacing a claimed resident|refuses lost without replacing a claimed resident|refuses job-mirror without replacing a claimed resident|normalized contract refuses negative-revision unchanged|normalized contract refuses negative-health unchanged|normalized contract refuses unknown-thruster unchanged|normalized contract refuses unknown-attachment unchanged|normalized contract refuses unknown-body unchanged|ordinary unrelated freighter still adopts once and retains its manifest|real Tally command settlement enables Towline once without duplicate finite rewards|legacy durable assessor restores finite state with canonical body and truthful patrol fallback|damaged durable assessor restores body revision and thruster health without healing)$' test/tally-three-lifecycle.test.mjs test/tally-three-prerequisite-chain.test.mjs
```

Result: 26 selected CPU tests passed. Three native lifecycle callbacks were excluded from this CPU invocation. These CPU results do not establish native physics/receiver admission, browser behavior, or full-game acceptance.

## Native lifecycle validation

A separate bounded invocation passed all three native callbacks: actual combat death versus virtualization, live durable Continue, and shelved Continue. It used the exact six-source candidate on public parent 042025912f3109b9064eb9a2642efa96d13f7073 and the public vendored Rapier bundle. The run exited successfully in 1.244 seconds, used one simulation step and six backend preparations, and peaked at 272,392,192 bytes of process-group RSS.

The checks retained current entity/generation identity, unique assessor residency, normalized damaged body and disputed phase, native mass 68 with one collider, and no invented freight. A test-only bounded facade added current-native identity observations; its exact delta, TAP output and all 914 loaded provider hashes are recorded in [the native lifecycle evidence](evidence/tally-three-native-lifecycle.json). Independent outcome review SHA-256: 9aacd67a33019f035036ddd0186b22bdd1e5388ab6aa10166bcaeef94c8577e0.

These are 26 CPU passes and three native passes from separate invocations. The native fixtures use authored starting conditions and real production combat, bodies and SaveSystem loading. They do not establish organic delivery, rendered UI, whole-game acceptance, or exact native-world adoption.

## Next step

Exercise ordinary Tally delivery and the resulting Towline cleanup through real player controls and commands, preserving finite original cargo, native towing and witnessed receipts. Do not substitute authored eligibility or receipt injection for that route.
