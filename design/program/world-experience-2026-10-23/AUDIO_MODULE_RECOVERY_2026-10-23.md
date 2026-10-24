# Audio caption behavior after placeholder landing

The original candidate was based on `808d4a99c5c7010a0fb6cf7b9edeaf5393a738e9`, where the imported recipe-caption and trailer-score modules were absent. New upstream commit `91495d09f62ccd652dfbc529c99edd11e2adbf3b` supplies explicitly inert placeholders: recipe captions emit nothing and text passes through unchanged; trailer scoring binds nothing and returns a no-op disposer.

This reconciled candidate replaces only the recipe-caption placeholder with a new functional adapter. It does not claim to recover the author's uncommitted original modules. Upstream's trailerScore file and audioSystem import, bind and dispose hooks are preserved unchanged. Existing trailer staging still routes actual cues through `audio:cue`.

## Scope

- Delegate recipe text to the existing gameplay-caption resolver and localization API, emitting generated text only after voice admission.
- Preserve same-call caption ownership for named events, relay/fuel/mine/anomaly, field deployment, visual cues, instrument and radio presentation. Named/physical text retains its existing audio-independent behavior where authored.
- Keep four explicitly cosmetic place accents free of repetitive generated captions. This is not a blanket suppression of ambient semantic warnings.
- Register the focused test gate and its default-chain invocation; add only the recipeCaptions and already imported barkPcmCache preloads.
- Do not change the simulation, rewards, saves, audio admission, synthesis or mixing.

## Verification and limits

Root and independent review each reran the bounded focused VM suite after restoring the three upstream trailer hooks: **16 passed, 0 failed**. Removing exactly those three restored lines reproduces the previously reviewed candidate byte-for-byte. Syntax checking passed. The suite exercises actual production methods and ten subscriptions, real synthesis, selected recipe rows, the caption resolver, localization runtime and trailer staging, with explicit WebAudio/runtime/locale-inventory boundaries. It is not a complete audioSystem import or initialization test.

The earlier differential fixture against original audio source with a functional helper recorded 7 passes and 9 failures. This is preserved as historical fixture evidence, not an executed original-application result. Previous public-head hosted results do not qualify this new reconciliation.

The known cross-event damage-caption defect remains unresolved: the preserved diagnostic produces one admitted shield voice and two captions (16 passes, 1 failure). Visual and raw-damage producers do not carry a trustworthy shared receipt identity, and visual presentation can be absent or throttled. Blanket raw-caption suppression would lose useful warnings. No global duplicate-elimination claim is made.

Bark/instructor/instrument changes include source-reviewed paths not exercised end-to-end. Full initialization, binder lifecycle, translated catalogs, real WebAudio, browser output, ordinary gameplay and Save/Continue acceptance remain open. The retained trailer placeholder is not an implemented trailer-scoring system.
