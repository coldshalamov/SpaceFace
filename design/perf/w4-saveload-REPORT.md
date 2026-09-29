# Wave-4 Lane Report — Save/Load Streaming

Lane question: *can save serialize only what changed (dirty-journal delta), or move
serialization off the atomic step where provably state-consistent — with byte- or
semantically-identical saves?*

Branch: `devin/1790661003-w4-saveload` off `origin/master` (9354c8410).

## Verdict

**Patch landed (small, provably identical).** The synchronous whole-world serialize already
exists on the write path but is *not* the pole: ~8 ms per save on this box. The measured
reload boundary is ~98 ms, of which ~80% is **restore semantics** (state application), not
serialization-format work — no chunked/delta format can reduce bytes-that-must-be-applied.
The one structural redundancy found and removed: the pre-load **rollback capture** paid a
second full `serialize()` + full `_prepareEnvelope` — i.e. two more `JSON.stringify` +
`fnv1a` passes over the entire world — to build an in-memory copy that is **never written
to storage**. It now runs `serializeData()` → `_prepareEnvelope` on a checksum-less
envelope: the checksum's job is verifying *stored/transmitted bytes*; on a self-produced,
synchronously-consumed envelope the verify is a tautology (`_prepareEnvelope` already skips
verification when `env.checksum` is absent — the same seam `save-restore-atomicity.test.mjs`
uses via `delete envelope.checksum`). Preflight bound-walk, `clonePlain`, migrations, and
`normalizeRestorableData` are unchanged; `_rollbackCaptureActive` strict-serializer mode is
preserved around `serializeData()`.

## Cost breakdown (node24 --cpu-prof, `run 47a --reload-at 600`, 20 save+reload cycles)

| Stage | ms / 20 reloads | ms / boundary | Share |
|---|---|---|---|
| `serialize()` envelope build | 158 | 7.9 | 8% |
| — `serializeData` (34 subsystem readers) | ~47 | ~2.3 | |
| — `safeStringify`+`fnv1a` (checksum mint) | ~108 | ~5.4 | |
| `loadEnvelope` total | 1790 | 89.5 | 92% |
| — `_prepareEnvelope` (preflight + checksum re-verify + `clonePlain` + migrate/normalize) | ~150 | ~7.5 | 8% |
| — `_captureRollbackSnapshot` (was: 2nd serialize + full prepare) | 273 → **95** | 13.7 → **4.8** | 14% → 5% |
| — `_restore` (deserializers + rebuild) | ~1360 → ~1440* | ~68–72 | ~70% |
| —— largest leaf: economy `deserialize` → `reseedSyntheticPriceHistories` → `pricePointAt`/`priceMult` | ~643–707 | ~32–35 | ~33% |

*restore-side drift between runs is box noise (pricePointAt self-time ±10%); the structural
delta is entirely in `_captureRollbackSnapshot` (−65%) and the inner `_prepareEnvelope`
(−57%).*

`structuredClone`: not on the sf-sim path (the worker encode is browser-only); the journal
uses `cloneBoundaryPayload` per dirty fact — cheap, bounded (256-entry ring).
IO: none on the harness path (`localStorage` is browser-only); `save()` additionally
re-stringifies the envelope once for the write — normal and unchanged.

## What was evaluated and rejected

- **Delta/journal save format** (dirty-facts-only envelope): the produced envelope would no
  longer be byte-identical and the checksum/version contract would fork — violates the lane
  constraint. The existing `saveDirtyJournal.js` is already the right shape: a bounded
  *notification* layer peeked at snapshot boundaries, acknowledged only after the full
  compatibility save lands — it supplements, never replaces, the full envelope.
- **Splitting capture across ticks**: `saveSystem.js` documents why — "Capture every
  subsystem exactly once in one coherent JS task. Splitting live-state readers across
  future ticks cannot produce an authoritative snapshot." Live state mutates between ticks;
  a torn capture is not state-consistent (autosave-slice-DIAGNOSIS called this the
  atomicity flaw; autosave-defer-REPORT shipped calm-window deferral instead).
- **Checksum-verify skip for arbitrary in-process envelopes** (WeakMap hint from
  `serialize()` → `_prepareEnvelope`): saves ~5 ms but fails the provable-identity bar —
  a caller mutating `env.data` between `serialize()` and `loadEnvelope()` would silently
  pass integrity today-rejected. Only the rollback path (adjacent synchronous calls, no
  interleaving possible) is airtight.
- **Economy price-history reseed (~33 ms/reload)**: the real restore pole, but it is
  economy-domain recomputation (cycle factors → seeded histories), not serialization —
  belongs to an economy lane, not this one.
- **Autosave main-thread slice**: already engineered — capture is one coherent task,
  `encode_part` JSON.stringify+fnv1a runs in `saveWorker`, dispatch is batched across
  scheduled hops, and calm-window deferral shipped (`autosave-defer-REPORT.md`).

## Research citations

- **Unity Data-Shards** (Saesentsessis/Unity-Data-Shards): dirty-bit shards serialize only
  changed blobs into one contiguous arena; envelope cached per slot — the reference design
  for incremental writes (rejected here on the identity constraint).
- **Unity `NetworkBehaviour.OnSerialize(initialState)`**: snapshot-then-delta — first sync
  full, later syncs dirty bits only.
- **ESEngine incremental serialization**: base snapshot + `serializeIncremental` diff —
  needs per-entity change granularity this codebase's subsystem serializers don't expose.
- **MDN Structured clone algorithm / Transferable objects** + js-web-workers postMessage
  bottleneck analysis: `postMessage` deep-clones *synchronously on the sender* — already
  mitigated here by per-part `encode_part` batching; transferable `ArrayBuffer` transport
  (dok-buffer-transport) is the next step only if a measured clone pole appears.
- **Write-behind/write-back caching** (UXPLIMA `WriteBehindStorage`; write-buffering
  patterns survey): dirty-flag tick-flush with last-write-wins coalescing — what the dirty
  journal + ack-through-sequence already implements.

## Verification

- `node --test` save battery: `save-restore-atomicity` 4/4, `bounded-autosave`,
  `capital-boss-save-roundtrip`, `m6-corrupt-save-recovery`, `e5-save-parity` — **40/40 pass**.
- Golden: `run 47a --seed 47 --ticks 720 --expect test/47a.telemetry.expected.json --hash
  --repeat 20 --reload-at 600` → sha256 **`cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`**,
  identical to baseline, deterministic across 20 cycles.
- cpu-prof A/B: `_captureRollbackSnapshot` 273.4 → 95.3 ms per 20 reloads (−178 ms,
  **−8.9 ms per save+reload boundary**); `reloadThroughSave` 1954.7 → 1873.8 ms.
  Profiles: `.devshots/w4-saveload/{before,after}.cpuprofile`.
