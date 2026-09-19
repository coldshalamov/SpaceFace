# SpaceFace — The Chronicler

**A world can remember without inventing what happened.**

This is the completed, dependency-free module requested by `01-chronicler.zip`, with working source, a real-bus fixture, automated tests, and integration instructions. It observes SpaceFace's events, retains significant episodes, proves documentary links between them, and offers evidence-backed stories to news, radio, station greetings, and other consumers.

The supplied brief explicitly assigns registry/save/producer wiring to your local engineer. This package follows that boundary: **additive implementation, not a replacement checkout or a claim that live SpaceFace has already been modified.** No GitHub branch or PR was created.

## Run it immediately

Node.js 20 or newer; validated here with Node.js 22.16.0. No install, server, API key, dependency, or build is needed.

```sh
cd SpaceFace-Chronicler
node repo/scripts/test-chronicler.mjs
node repo/scripts/demo-chronicler.mjs
```

The same commands work on Windows, macOS, and Linux. `npm test` runs the module suite plus three installer safety tests; `npm run demo` is an optional demo alias.

For machine-readable demo output:

```sh
node repo/scripts/demo-chronicler.mjs --json
```

For the fixed-step stress/replay harness:

```sh
node repo/scripts/soak-chronicler.mjs --hours=63 --seeds=4242,8008 --out=soak.json
```

Use `--hours=1 --seeds=4242` for a smaller run. This is a **synthetic module fixture, not 63 hours of actual gameplay**. Multiple seeds run in isolated Node processes; each seed compares uninterrupted execution with a mid-inbox save/restore.

## What is implemented

The Chronicler keeps a bounded causal archive, not an ever-growing event log. It snapshots compact facts, associates explicitly named encounters and ace histories, resolves typed source references, and ranks meaningful episodes. A collision can become a remembered wreck; processed salvage can acquire a documented owner; a proven sale can acquire a legal consequence. Missing evidence remains missing.

The module includes persistent legend observations, deterministic news publication through the current `news:publish` input, deferred radio offers, contextual station/sector recollection, an optional voice-arbiter bridge, save/load lifecycle handling, producer replay suppression, overload shedding, audience boundaries, and isolated read APIs. It does not change credits, inventory, heat, bounties, faction standing, or gameplay titles.

### A small demonstration

The fixed-seed fixture supplies actual-shaped kill/wreck events and explicit opt-in cargo/legal receipts. Its news text is:

> Morrow was destroyed in a collision with a structure in Helios. Its wreck was subsequently processed for salvage. You recovered 8 units of salvage. 4 of those units were sold at helios dock for 240 credits. A fencing investigation receipt explicitly names that sale as its cause.

An hour later, a station recall offers:

> 1 sim-hour ago: Remember Morrow? The wreck was cut, the cargo sold, and the sale drew a recorded legal consequence. Helios has a history now.

The same demo deliberately tests a native-only salvage completion followed by an unsourced sale. It produces **zero complete chains**, correctly. A dramatic sentence is not a cargo ledger.

## Verified results

`evidence/tests.tap` records **61 passing automated tests**, including 1,176 kill-causality comparisons against the supplied production helper inside one test.

`evidence/soak-63h.json` records two seeds, each executed twice: uninterrupted and save/restored. Each run performs **13,608,001 fixed-step update calls**, for **54,432,004 calls total**. Both pairs have identical final snapshot hashes and emitted-event hashes, including event timing. All **315 supplied complete causal chains** were recognized per trajectory: 164 for seed 4242 and 151 for seed 8008.

The final fixture runs stayed within the 96-story/2,048-recent-key bounds, had no queue drops or invalid source links, and sampled a maximum serialized snapshot of **625,598 bytes**. That is a measured fixture value, not a universal upper bound or an in-game frame-time guarantee. See `VERIFICATION.md` for the performance measurements and limitations.

## Integration

Start with **`INTEGRATION-NOTES.md`**. The `repo/` directory is a repository-relative overlay containing new files only. Do not replace SpaceFace's `package.json` with this package's root harness file.

An optional collision-safe copier previews the additions and refuses to replace different existing files:

```sh
node install.mjs "/path/to/SpaceFace"
node install.mjs "/path/to/SpaceFace" --apply
```

A repository-relative `spaceface-chronicler.patch` is also included for a normal `git apply --check` / `git apply` workflow. Use the copier or the patch, not both.

Copying the files does **not** register the system or modify save whitelists. The integration notes explain those explicit changes, campaign/run isolation, the news/voice consumers, and where authoritative cargo-origin receipts are needed for complete economic/legal chains.

## Package map

| Path | Purpose |
|---|---|
| `repo/src/systems/chronicler.js` | Registry-compatible owner and lifecycle |
| `repo/src/chronicler/normalize.js` | Compact, defensive event adapters |
| `repo/src/chronicler/ledger.js` | Incident grouping, causal graph, source quantities, retention, legends |
| `repo/src/chronicler/narrative.js` | Evidence-only story/radio language and contextual ranking |
| `repo/src/chronicler/persistence.js` | Versioned snapshot validation and atomic restore |
| `repo/src/chronicler/schema.js` | State schema, bounded configuration, shared primitives |
| `repo/src/chronicler/voiceBridge.js` | Optional existing-voice-arbiter adapter |
| `repo/tests/chronicler/` | Real-bus fixture and automated regressions |
| `repo/scripts/` | Cross-platform test, demo, and soak runners |
| `fixtures/` | Two unmodified input-packet files for standalone execution |
| `evidence/` | Actual test, demo, and final replay results |
| `MANIFEST.json` | File inventory and SHA-256 integrity hashes |

The archive deliberately excludes the original large systems, assets, and unrelated game code. Existing event emitters remain their systems' responsibility. The Chronicler supplies memory, not an imaginary second universe.
