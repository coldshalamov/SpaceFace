# SF-229 — Bomb families with recognizable mechanisms

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE EAR · PQ-158; CV-EAR, CV-HAND · [WF-13](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-13_AUDIO_MUSIC_AND_WORLD_SOUND.md) / [WF-12](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/16-audio.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Give each current payload a distinct mechanical identity at release, arming and detonation while preserving shared bay handling and bounded voice counts.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

Eight unrelated loud explosions lack language; one pitch-shifted sample is too weak a distinction.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/audio/audioSystem.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/audioSystem.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/audio/cuePriorityBus.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/cuePriorityBus.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/audio/environmentMix.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/environmentMix.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/audio/bombAudio.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/bombAudio.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/data/audioRecipes.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/audioRecipes.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/ui/captions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/captions.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Follow the canonical event to the current sound binding and priority policy. Check whether a silent result is missing sample readiness, authorization or mixing rather than a missing recipe.
2. **Implement the chosen mechanism.** Reuse bombAudio and current recipes rather than adding a parallel binding. Emphasize physical differences—concussion pressure, singularity tension, goo rupture, EMP crackle—through timbre/envelope, with phase driven by the actual payload. Share low-level synthesis/sample layers where appropriate but keep critical tells distinguishable.
3. **Keep the player-facing chain complete.** Provide concise semantic captions or existing visual equivalent for important direction/state. Keep music and ambient beds out of the way of the action.
4. **Cover lifecycle and counterexamples.** Test first gesture, mute/unmute, suspended context, repeated events, overlapping sources and pooled/removed entities. Inspect voice counts and release behavior.
5. **Converge on the played result.** Listen through a complete fight and a quiet work cycle, not isolated sample playback. Adjust hierarchy and spectral separation before increasing gains or adding layers.

## Ownership and non-goals

Do not add a second audio update loop or AudioContext. Preserve gesture resume, bounded voices, sample licensing and desired-loop recovery. Critical information needs a nonaudio equivalent; loudness is not importance.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Deploy several payloads in a mixed fight, including zero-ammo refusal and a destroyed unarmed bomb. Phase sounds match reality, loops stop on terminal state and no payload remains identifiable only by an optional spoken label.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Start with no gesture/unlock, enter normal flight, combine engines, rope, impacts and comms, then pause/resume and revisit a quieter destination.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq-165-01-captions.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-165-01-captions.test.mjs)
- [`test/pq-158-05-mix.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-158-05-mix.test.mjs)
- [`test/cv-ear-field-deploy-voices.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/cv-ear-field-deploy-voices.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq-165-01-captions.test.mjs test/pq-158-05-mix.test.mjs test/cv-ear-field-deploy-voices.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
