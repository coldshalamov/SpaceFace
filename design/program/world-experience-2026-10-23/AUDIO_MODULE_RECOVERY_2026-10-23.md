# Audio caption helper recovery

This change restores the missing recipe-caption adapter used by the audio system and removes only the dangling trailer-score binding that prevented the module graph from resolving. Existing trailer staging continues to route its real voice through `audio:cue`.

## Scope

- Add `src/audio/recipeCaptions.js`, using the canonical gameplay-recipe caption resolver and localization API.
- In `src/audio/audioSystem.js`, preserve caption ownership at the existing same-call handlers, emit generated captions only for admitted voices, and remove the three references to the absent trailer-score module. Audio admission, synthesis, mixing, and the existing cue route are otherwise unchanged.
- Register one focused test gate and one invocation in the existing default check chain.
- Add the two direct audio-module preloads for `recipeCaptions.js` and the already imported `barkPcmCache.js`. No other preload or catalog entries change.

## Verification and limits

The reviewed bounded VM test passed 16/16. It exercises the actual audio methods and ten event handlers with the real caption resolver, localization/runtime, synth and selected recipe rows. Three candidate files passed syntax checks. The bounded harness uses explicit boundary doubles; this result is not a full production audio-system import/init, browser output, real WebAudio, or full-game startup acceptance.

A differential fixture comparison recorded 7 passes and 9 failures against the original audio source with the helper restored. This comparison is not a full original-application run.

A separate diagnostic remains intentionally failing (16 passed, 1 failed): an ordinary visual damage receipt followed by raw damage can produce two shield captions for one admitted voice. This cross-event ownership defect is preserved and explicitly unresolved; this change does not claim to fix it.

The existing diagnostic and differential evidence are retained separately from this public report.