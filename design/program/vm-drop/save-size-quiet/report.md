# save-size-quiet — headless save-byte growth over 120 sim-minutes

Measured on the idle Grok Bot VM. **Report only** — no save-system or gameplay code was changed.

## Result (primary)

| Marker | Sim time | Playtime (`playtimeS`) | Stored JS length (primary) | Stored UTF-8 bytes | `serializeData` UTF-8 |
|---|---|---|---|---|---|
| start | 0 min | 0.0 s | **103 598** | 103 602 | 103 459 |
| 30min | 30 min | 1800.0 s | **687 320** | 687 410 | 687 264 |
| 60min | 60 min | 3600.0 s | **718 069** | 718 087 | 717 941 |
| 120min | 120 min | 7200.0 s | **736 967** | 737 061 | 736 915 |

- Wall duration of the sampler: **73343 ms (~1.2 min)**, not 2 wall-hours — headless fixed-step is accelerated.
- Growth start→120: **+633 369** JS chars (~7.1×). Most growth is in the first 30 sim-minutes (+583 722); 30→60 (+30 749); 60→120 (+18 898).

## How saves were sampled

1. Closest existing headless playthrough: `scripts/check-release-soak.mjs --full` / `scripts/lib/releaseSoakSession.mjs` (accelerated ~45 sim-minute campaign). That path does not emit mid-session save-byte markers at 0/30/60/120.
2. Job-local harness `measure-save-size.mjs` (this folder only) reuses the **same system stack and boot pattern** as `releaseSoakSession.mjs` (`createSimulation` + soak systems including real `save` / `serializeData`).
3. At each marker the harness calls `save.save('save_size_quiet')` into an in-memory `localStorage`, then records:
   - **storedJsLength** — `localStorage` string `.length` after `save()` (same definition as browser release-soak `saveBytes`)
   - **storedUtf8Bytes** — `Buffer.byteLength(raw, 'utf8')`
   - **serializeUtf8Bytes** — UTF-8 size of `JSON.stringify(save.serializeData())`
4. Between markers the sim advances at `SIM_DT` (1/60 s) with light scripted activity (zone steering, periodic trade pulse, dock/undock every 10 sim-minutes) so the payload is not a frozen new-game blob.
5. Seed **47**, sector **`sector_sker_haven`** (release-soak defaults).

Raw JSON: `samples.json`. Run logs: `run-stdout.log`, `run-stderr.log`.

## Master SHA

`0fd64234a71147fd16f47f7a5f988d30fe758e3f` (`origin/master` at measure time). Branch tip before this job commit: `beddb1691718ed4db842791bd84fce107fe5c5a2` (`vm-drop`).

## Environment

- Host: Linux Grok Bot VM, x86_64 KVM guest, **8** Xeon logical cores
- When: 2026-09-21 ~23:49–23:50 EDT (America/New_York) — wall ~73 s for 120 sim-minutes
- Load around run: ~0.5–1.5; otherwise idle for game probes (no Cursor cloud agents for this job)
- GPU: **software / soft GPU** — Playwright Chromium probe reported `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Headless soak itself does not use GPU; this is the box GPU note.
- Node: v20.x; no discrete GPU (`nvidia-smi` absent)

## What fell short of a 2-hour wall session

| Attempt | Outcome |
|---|---|
| Browser release-soak with `--cycles=2 --min-duration-ms=7200000` (records `saveBytes` per cycle) | **Blocked.** Without `CHROME_PATH`, Linux Chrome is not found (finder is Windows-oriented). With `CHROME_PATH=/opt/google/chrome/chrome` + `DISPLAY=:4`, boot failed: `#cinematic-splash` stayed visible past the 5 s hide timeout under SwiftShader. See `pilot-stdout.log`. |
| Stock headless `check-release-soak.mjs --full` | Completes ~45 sim-minutes in ~44 s wall; does not sample save bytes at 0/30/60/120. |
| This job harness | **120 sim-minutes** with honest byte samples at the four markers; wall ~1.2 min (accelerated). |

So: sim-time markers match the job (0/30/60/120). Wall-clock two hours was **not** achieved with available scripts on this soft-GPU box.

## Artifacts (this folder only)

- `measure-save-size.mjs` — job-local sampler (imports soak stack; does not change save code)
- `samples.json` — full structured receipt
- `run-stdout.log` / `run-stderr.log` — harness output
- `pilot-stdout.log` — browser soak failure witness
- `report.md` / `DONE.md`

No live game files, assets, or `VM_LANES.md` were modified.
