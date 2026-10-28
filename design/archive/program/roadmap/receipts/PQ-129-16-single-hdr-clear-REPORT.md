# PQ-129.16 — Single HDR scene clear

Status: kept same-picture production optimization; PQ-129.16 remains open.

## Direct result

`createBloom().renderScenePass()` explicitly cleared the full-resolution HDR target and then called
`renderer.render()` while Three's `autoClear` was still enabled. Three r184 clears again from
`WebGLBackground.render()` when `autoClear` is true. The scene pass now temporarily disables
`autoClear`, retains the existing explicit clear, and restores the caller's state in `finally`.

This does not remove a pass, object, shadow, effect, pixel, or authored quality setting. It removes
one redundant full-resolution color/depth/stencil clear from every presented frame.

The result-bearing Intel D3D11 Continue route retained three changing canvas hashes. Against the
same route immediately before the candidate, `bloomScene` p95 fell from 258.8 ms to 111.7 ms
(56.8%) and average fell from 147.7 ms to 111.2 ms (24.7%). The candidate classified 115 hitches
across 118 observed frames with 97.4% named coverage, so the game is still hitching and the
main-scene owner remains open.

Candidate report SHA-256:
`5970548AC80F3AAD576CEF185310A6BDAA615B9323F326CACC0A59B1B365DE1F`
for `.devshots/runtime-witness/report.json`.

Matched baseline report SHA-256:
`D7DE8014E5208F54E2D62A3963B542335EFE39EA2303F0EE9B44EE508B99059C`.

## Routing

PQ-129.02 named bloom and PQ-129.03 narrowed it to the full HDR scene render, which satisfies the
campaign's early Wave C promotion rule. This is a kept slice inside PQ-129.16, not completion of the
leaf. The queue's stale `.12` dependency is not being rewritten while that shared file contains a
protected foreign hunk; the active packet and this receipt preserve the measured disposition.

Next: keep the exact picture and bound the shadow refresh work included inside `bloomScene`. Do not
tune downsample/composite, disable bloom, reduce render scale, shrink shadows, or cut population.

## Verification

- `node --test test/bloom-pass-timing-scratch.test.mjs` — 4/4 pass; the harness models Three's
  implicit auto-clear and requires exactly one HDR scene-target clear.
- `npm run probe:runtime-witness -- --continue --sector-entry` — first candidate trace reached the
  public sector boundary and measured `bloomScene` p95 39.9 ms, but its final sampling tail froze;
  retained as supporting evidence, not the decisive result.
- `npm run probe:runtime-witness -- --continue` — decisive headed Intel run above; nonzero status is
  expected while the truthful verdict remains `hitching`.
- `npm run check:baseline` before the candidate — 11/12 top-level groups passed; the massline group
  had 24/26 green children and two assertion-free 150 s timeouts under shared host contention.
