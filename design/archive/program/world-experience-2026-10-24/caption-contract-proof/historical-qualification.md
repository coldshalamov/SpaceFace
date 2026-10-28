# Caption startup contract repair — 2026-10-24

## Source and ownership
Public master pinned to 7f41416abe78be34f9e92256b86a557b94457843, re-read at 18:51 UTC. Exporter and bridge bytes unchanged from the initial 18:46 read.
Causative commit: 18ea461d2689bae9ec286e84a51d422734326a4d (2026-10-24 18:03:25 UTC). It replaced an inert bridge with a consumer of a missing formatCaptionText export and missing baseText/authored resolver fields.
Fresh complete open-PR head census at 18:52 UTC matched retained path ownership. PR559 head de5ec5b860e534cc556e7c11d325f783c3ff766b owns the bridge/audioSystem adapter; neither is changed here. No active captions.js or new focused-test owner was found.

## Scope
Add a real presentation formatter in src/ui/captions.js. Its translator receives source text once, then a directional template once with already translated caption and numeric clock placeholders. The canonical runtime interpolates placeholder values once. English formatting keeps existing punctuation. Only integer clock values 1–12 produce a bearing.
Add baseText and authored resolver fields without changing legacy text/clock, frozen rows, authored copy, fallback logic or cue behavior.
Add test/caption-format-bridge-contract.test.mjs. No adapter, audioSystem, renderer, workflow, package registration or generated catalog modifications.

## Baseline proof
RAM-only Node v24.19.0 SourceTextModule linking exact immutable public exporter and importer, with explicit bark/massline/localization boundary doubles:
(node:5) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
{"utc":"2026-10-24T18:53:23.144Z","node":"v24.19.0","ref":"7f41416abe78be34f9e92256b86a557b94457843","resolver":{"recipeId":"sfx_mining_impact","text":"The rock chips, 8 o'clock.","urgency":"normal","event":"mining.impact","clock":8},"hasBaseText":false,"hasAuthored":false}
EXPECTED LINK FAILURE: SyntaxError: The requested module '../ui/captions.js' does not provide an export named 'formatCaptionText'


## Candidate proof
Executed the complete new test source against candidate captions.js, unchanged public recipeCaptions.js and unchanged public localization/runtime.js. Bark/massline dependencies and full gameLocalization catalog initialization were explicit synthetic boundaries. The localization boundary delegates to the real runtime; formatter translation tests exercise a small real French catalog. No source rewriting, test extraction, browser, WebAudio, audioSystem initialization or full-game execution occurred.
(node:5) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PINS {"src/ui/captions.js":{"bytes":15996,"gitBlob":"e827f18717b2fc26a83ca8d1bec641a826b5cb4a","sha256":"f204d6136f2dc04248fc188fda3e2133d114bcfbb696b5e31771a335466eda5c"},"src/audio/recipeCaptions.js":{"bytes":2514,"gitBlob":"f8790f2ea12028f5a88250ffab2222b4f616f306","sha256":"b6511be2f2b8c50d56bfdc23ad6692bfa0065439b019f91b2344dbf1a32b67c0"},"src/localization/runtime.js":{"bytes":6794,"gitBlob":"907a0dbdbdddbe1261ff37347c7d7550e275461a","sha256":"551586b4e41c306401178b0113bce7b9c7daa5de081b4d6d58a5f2b6a1995bea"},"test/caption-format-bridge-contract.test.mjs":{"bytes":7160,"gitBlob":"8a8ddb69d8cf09ae1ddb90671cf4cc557880af81","sha256":"10f8e0ab52141c9adb74dca6c600b61b017088a6199d0c4d488017ba237de0fa"}}
BOUNDARY: actual captions, bridge, localization runtime; bark/massline data and full gameLocalization catalog pipeline doubled; no audioSystem, WebAudio, browser or game initialization.
UTC 2026-10-24T18:53:35.679Z
✔ formatter preserves English punctuation and bounds the optional direction (1.733112ms)
✔ formatter translates base and template exactly once with real runtime interpolation (2.050138ms)
✔ resolver adds raw text and authorship without changing legacy directional text (0.814376ms)
✔ real recipe bridge emits raw metadata and formats the bearing only once (1.021504ms)
✔ real recipe bridge preserves suppression, directional dedupe and clock rewind (0.473325ms)
✔ real bridge localization uses the runtime pseudo path without raw placeholders (1.096613ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 20.480212


This is bounded contract and module-link evidence, not a full production-import, default npm-gate or browser-startup acceptance claim. Hosted direct execution of the focused test and subsequent startup verification remain necessary. The unrelated legacy anvil receiver test and all containing aggregates were not run. Publication does not authorize merge or deployment.

## Existing committed regression tests
Unmodified test/inf50-al-pr-13.test.mjs and test/inf50-al-pr-15.test.mjs also passed with the six new contract cases: 8/8, twice.
The expanded bounded graph contains the real audioRecipes table and its twelve imported recipe modules. Ruud's non-audio sector placement dependency is additionally doubled; placement values are not under test. The actual full recipe table remains intact.
test/seed-se-01-recipe-caption-bridge.test.mjs was inspected but not executed: it imports the full audioSystem/init graph, outside this bounded loader. The new tests do execute the unchanged production recipe bridge's emission, suppression, dedupe and localization functions.
Final repeated output:
(node:2) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
PINS {"src/ui/captions.js":{"bytes":15996,"gitBlob":"e827f18717b2fc26a83ca8d1bec641a826b5cb4a","sha256":"f204d6136f2dc04248fc188fda3e2133d114bcfbb696b5e31771a335466eda5c"},"src/audio/recipeCaptions.js":{"bytes":2514,"gitBlob":"f8790f2ea12028f5a88250ffab2222b4f616f306","sha256":"b6511be2f2b8c50d56bfdc23ad6692bfa0065439b019f91b2344dbf1a32b67c0"},"src/localization/runtime.js":{"bytes":6794,"gitBlob":"907a0dbdbdddbe1261ff37347c7d7550e275461a","sha256":"551586b4e41c306401178b0113bce7b9c7daa5de081b4d6d58a5f2b6a1995bea"},"test/caption-format-bridge-contract.test.mjs":{"bytes":7160,"gitBlob":"8a8ddb69d8cf09ae1ddb90671cf4cc557880af81","sha256":"10f8e0ab52141c9adb74dca6c600b61b017088a6199d0c4d488017ba237de0fa"},"test/inf50-al-pr-13.test.mjs":{"bytes":2533,"gitBlob":"6e695b057da4a58af090a21d772db812db5a91de","sha256":"31a63e55cbe48bb65735eade473d062ad004fb888a97443148175220c68fbf68"},"test/inf50-al-pr-15.test.mjs":{"bytes":1164,"gitBlob":"64b4447d951b1b7da95b7f75d59ebb1fd9b61e3e","sha256":"9c4d373b7890c53411374bd5f97ecf9715aff1aa2c1219521e58a5fc15ff7d1e"},"src/data/audioRecipes.js":{"bytes":161633,"gitBlob":"88f7040b7627485f55bc3c090a56bb82034180b1","sha256":"63883b9803c4f1aaf1226f448790b1e8c028899fcac6ebe5a64bc1b9f3856816"},"src/data/morrow.js":{"bytes":3999,"gitBlob":"8c7559cb1a49dc3cf3d92d907bdac43e46f18e16","sha256":"9ddf56668341d636829f854003173ccd7a42fffde6f4178c2e072ff4d65413ce"},"src/data/vesper.js":{"bytes":4877,"gitBlob":"1084fd8a0d02c1f31f01f8d94eb3695db2ab2f15","sha256":"edd6ca036f5b7ab494409f02dcba0ea7ca191ca0ae8baef6096f6d7a05977ca3"},"src/data/bracket.js":{"bytes":4655,"gitBlob":"914072b00a982ee79a196f9f6a0a19941e36a8f4","sha256":"b126151c6ba6122c808788103e7f5e83558442f9ca102bafe6c35a22197123e1"},"src/data/ravel.js":{"bytes":4972,"gitBlob":"ad404c766c71d91cb596a600738b53054dc518ba","sha256":"475024866dce8365c2e629868758e41bf205173bcf9eed34648126a6db3667d4"},"src/data/solstice.js":{"bytes":5944,"gitBlob":"89aa7eb7c4c63ebdc6ebf400a652088bdb70f949","sha256":"9035caef17bb705c4dea4d14014c0cabda76fc32a9441f97025020c0ebeceac4"},"src/data/rubric.js":{"bytes":12194,"gitBlob":"ad3417b8015fb472741d71841bab2edd65f66a93","sha256":"067c44e7e7c1f6bc721185d02c7c1ce3cda0fddfb723444d3f93ae3f951eea3b"},"src/data/ruckus.js":{"bytes":5051,"gitBlob":"2952fddf26d77e7c6bd17ba35d34446724e78037","sha256":"fab617554e607bb41f324a63de17ab759af8dd488c4a46a615ee4b1230908973"},"src/data/ruud.js":{"bytes":5449,"gitBlob":"a369691c1cd654a4603a4704d45fc08dd7ef0ac6","sha256":"2b281356c00a0b30dd2a2136d3ec16c9300ca9e2052066bd1623cd22dd3a8a15"},"src/data/docket.js":{"bytes":7519,"gitBlob":"504e2ac077e612e55115d69bf26d3d9e9ab7ba02","sha256":"4ed630e869cf59d09998b43a9056df52ff831b2006549afe5dd5ee114d547ba4"},"src/data/bolusAudio.js":{"bytes":2853,"gitBlob":"952498dab9136403901855fe53b5f407c4c057ff","sha256":"b703665128ae56ac63b419aae7d7d96cef98270c65022988475793c50821dc7d"},"src/data/secondRinseAudio.js":{"bytes":1050,"gitBlob":"63dee0991df926e750b56a3dd67ab2c9f3ad0c4e","sha256":"4f988f6207d1a08040cf558a90c3b3f897acfd8bcaf5f1d8e20b9c5c8b3f9e4d"},"src/data/discoveryAudio.js":{"bytes":1932,"gitBlob":"717263b84fdc1abc3a39cbb4f0fe848188f95f6b","sha256":"25ca2d9d685f995a96619c379d51906c2d78f7333d83d6be66f8a6ac37ba649f"}}
BOUNDARY: actual captions, bridge, localization runtime; bark/massline data and full gameLocalization catalog pipeline doubled; Ruud non-audio placement coordinates doubled; real full audio recipe table + 12 recipe modules; no audioSystem, WebAudio, browser or game initialization.
UTC 2026-10-24T18:57:11.702Z
✔ formatter preserves English punctuation and bounds the optional direction (2.038568ms)
✔ formatter translates base and template exactly once with real runtime interpolation (8.992765ms)
✔ resolver adds raw text and authorship without changing legacy directional text (1.074535ms)
✔ real recipe bridge emits raw metadata and formats the bearing only once (8.160267ms)
✔ real recipe bridge preserves suppression, directional dedupe and clock rewind (1.678663ms)
✔ real bridge localization uses the runtime pseudo path without raw placeholders (2.1103ms)
✔ seed 4242: first-hour recipes do not use id-built captions (2.818741ms)
✔ seed 4242: a telegraph from 8 o'clock captions as 8 o'clock (0.507791ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 78.731392


## Historical five-case checkpoint
Before the sixth pseudo-locale bridge case was appended, the first five contract cases passed at 18:53:01.533 UTC, 5 tests / 5 pass / 0 fail / 0 skipped. Source blob was the same e827f18717b2fc26a83ca8d1bec641a826b5cb4a; historical test blob was d0108a3bbddfddc857d8ca6eac458bef9dd9f84a. The final six-case test is 8a8ddb69d8cf09ae1ddb90671cf4cc557880af81.

## Publication hygiene
This is an authored public-safe evidence digest, not a raw private session export. Repository-relative paths, immutable Git pins and test stdout are retained; no private workspace paths, tool/session identifiers, credentials or account secrets are included. Only immutable blobs were created during preparation; no branch/ref, merge or deployment was performed.
