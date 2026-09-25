# DONE — guard-the-wins

## Summary

Backlog #70 patch series is ready to import. Three guards:

| Guard | Command | What it does |
|---|---|---|
| Zero shader links after first present | `npm run check:zero-shader-links-after-first-frame` | Fails if `RendererInfoMonitor` records any mid-flight shader compilation after `markFirstPresentedFrame` |
| Scoreboard | `npm run perf:scoreboard` | One wrapper over launch-to-flight profile, sector-entry witness, and the zero-shader check |
| Resource plateau soak | `npm run check:resource-plateau-soak` | Asserts geometries/textures/programs plateau after warmup over a long soak |

Focused tests: `npm run check:guard-the-wins` → **11/11 pass**.

## Before / after baseline

| | ok | failed | wallMs | notes |
|---|---|---|---|---|
| before (untouched master `0612d2b9f`) | false | save-schema, sim-compare, sim-v3, sim | 30642 | already on master |
| after (scratch with patches) | false | save-schema, sim-compare, sim-v3, sim | 34147 | **same four**; no new reds |

See `baseline-before.md` / `baseline-after.md` and the JSON receipts.

## Soft-GPU / wall-time note

This VM is soft-GPU (SwiftShader/llvmpipe). A literal 20 wall-minute headed soak is impractical
here and would not produce owner-GPU resource numbers. The plateau **assertion** is covered by
offline `--samples-json=` unit tests (flat series passes; climbing series fails). For a shortened
live soft-GPU run use:

```bash
npm run check:resource-plateau-soak -- --live --wall-s=120 --sim-minutes=20
```

Label any GPU fps/absolute resource counts as soft-GPU. Owner-GPU should run `--wall-s=1200`.

## Evidence

- Patches: `patches/0001` … `0004`
- Focused tests: `test/guard-the-wins.test.mjs` (11 pass)
- npm scripts: `check:zero-shader-links-after-first-frame`, `perf:scoreboard`,
  `check:resource-plateau-soak`, `check:guard-the-wins` (also appended to `check:perf-packets`)
- Scratch branch kept **local only** (not pushed): `vm-work/guard-the-wins` @ `5e16031d90df4eb275b9d9db95a9d3c7666d7243`

## Risks for the importer

- Live probe/scoreboard/soak need Playwright + a running game server; offline JSON modes are the
  CI-safe path.
- `probe:renderer-info` now exits 1 on mid-flight shader links **or** draw-call p95 over budget —
  a pre-existing mid-flight link on owner GPU will go red (that is the point of the guard).
- Scoreboard phases spawn real Electron/browser witnesses; run on a quiet machine.
- Picture contract untouched: no bloom/shadow changes.
