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

Result: 26 selected CPU tests passed. Three native lifecycle callbacks were excluded and were not run. These CPU results do not establish native physics/receiver admission, browser behavior, or full-game acceptance.

## Next step

Run and record the three excluded native lifecycle callbacks in a complete supported checkout. Until that result is available, keep native lifecycle acceptance unclaimed.
