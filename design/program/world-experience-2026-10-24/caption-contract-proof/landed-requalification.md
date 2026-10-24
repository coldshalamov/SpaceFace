# Caption contract requalification after external PR595
2026-10-24 19:09 UTC. Public source base: 4eb30c840accfdf20a2a696bfb2c2550aeac4769.

PR595 independently landed the missing formatCaptionText export and baseText/authored metadata. Its captions.js blob is 72c549b6efa0b9632a9d5214ec397b307401883a. Earlier candidate source e827f18717b2fc26a83ca8d1bec641a826b5cb4a is superseded and must not be published as a boot repair. The public recipe bridge and localization runtime are unchanged.

Re-running the original six proposed contract tests against the landed source produced four passes and two failures. One failure was a defensive invalid-clock expectation (13), not a demonstrated production input. The other demonstrated that the landed formatter appends English "o'clock" after translating the base and never requests a translated direction template.
The latter used the real localization runtime with a deliberately supplied French catalog fixture. It does NOT establish that the shipped French catalog contains that translation.

A subsequent bounded read/evaluation of actual shipped pipeline.js showed no clock/o'clock phrase or glossary entry. Its translateMessage results, with English/store/bark inventory boundaries doubled, were:
fr-FR {"base":"Incoming telegraph.","template":"{caption}, {clock} o'clock."}
es-ES {"base":"Incoming telegraph.","template":"{caption}, {clock} o'clock."}
de-DE {"base":"Incoming telegraph.","template":"{caption}, {clock} o'clock."}
pt-BR {"base":"Incoming telegraph.","template":"{caption}, {clock} o'clock."}
(node:5) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Therefore merely routing the directional template through the existing translator is insufficient to claim a visible fix for the four shipped languages. Such a fix additionally needs reviewed localized template entries, which is outside this narrowly qualified source repair. No additional production edit is proposed here. The directional translation gap remains documented, not silently treated as fixed.

## Compatible regression coverage only
Revised test/caption-format-bridge-contract.test.mjs covers the external landed contract without imposing invalid-clock behavior or asserting that the directional suffix is translated. It retains valid English bearing and metadata, unchanged bridge emission, suppression, directional dedupe/time rewind, non-directional translation through the real runtime, and bridge pseudo-path consistency. Six tests pass:
(node:5) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PINS {"src/ui/captions.js":{"bytes":15611,"gitBlob":"72c549b6efa0b9632a9d5214ec397b307401883a","sha256":"145927233d7ba2fa7c0640225d8e2ae64124227c7d3c20c516e1ed4a87e0df47"},"src/audio/recipeCaptions.js":{"bytes":2514,"gitBlob":"f8790f2ea12028f5a88250ffab2222b4f616f306","sha256":"b6511be2f2b8c50d56bfdc23ad6692bfa0065439b019f91b2344dbf1a32b67c0"},"src/localization/runtime.js":{"bytes":6794,"gitBlob":"907a0dbdbdddbe1261ff37347c7d7550e275461a","sha256":"551586b4e41c306401178b0113bce7b9c7daa5de081b4d6d58a5f2b6a1995bea"},"test/caption-format-bridge-contract.test.mjs":{"bytes":6611,"gitBlob":"4a6e1a0536dda276c8455990728333b62c2ecbfe","sha256":"5f0f171dc445d2da40364f5e74c4d59bc1927aead4907cf8b8a6e8c8650e6ca2"}}
BOUNDARY: actual captions, bridge, localization runtime; bark/massline data and full gameLocalization catalog pipeline doubled; no audioSystem, WebAudio, browser or game initialization.
UTC 2026-10-24T19:09:28.676Z
✔ formatter preserves landed English punctuation and absent direction (1.765119ms)
✔ formatter translates a non-directional base exactly once through the real runtime (1.544094ms)
✔ resolver adds raw text and authorship without changing legacy directional text (0.896035ms)
✔ real recipe bridge emits raw metadata and formats the bearing only once (0.672911ms)
✔ real recipe bridge preserves suppression, directional dedupe and clock rewind (0.9836ms)
✔ real bridge localization uses the runtime pseudo path without raw placeholders (0.956223ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 21.64076


No source, adapter, renderer, workflow, branch/ref, merge or deployment change occurred. This is a public-safe authored evidence digest, not a raw private session export. No private paths or tool/session identifiers are included. Full production catalog initialization, audioSystem/WebAudio and browser startup remain outside this bounded execution.
