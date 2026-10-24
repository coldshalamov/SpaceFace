# Caption bridge regression coverage after external startup repair

## Landed repair, unlanded coverage
External PR595 merged as4eb30c840accfdf20a2a696bfb2c2550aeac4769, supplying the missing formatCaptionText export and baseText/authored resolver metadata. Its exporter72c549b6efa0b9632a9d5214ec397b307401883a and production bridgef8790f2ea12028f5a88250ffab2222b4f616f306 are preserved byte-for-byte. This draft changes no production source, adapter, audioSystem, catalog or renderer. PR559's bridge/audio scope is not duplicated or absorbed.

The six new tests exercise the landed formatter's valid English bearing/punctuation, absent direction, non-directional translation with the real localization runtime, raw resolver metadata, actual production bridge emission, suppression, directional deduplication, clock rewind and pseudo-path consistency. The focused gate also runs the two unchanged related first-hour and eight-o'clock regression files.

## Qualification and withdrawn assumptions
The original proposal reproduced the missing-export module-link failure and passed eight bounded checks before the external fix landed. It is historical evidence, not this draft's runtime change or present boot failure. Against the landed exporter, two original proposed expectations failed: invalid clock13 behavior was not demonstrated production input; translated direction used a deliberately supplied French fixture, while the shipped pipeline lacks the corresponding direction translation entries. Merely changing formatter routing would not establish a shipped-language fix.

Accordingly the production proposal is withdrawn. Compatible coverage preserves the established valid-input contract, without claiming bounds for unobserved inputs or a translated directional suffix. The untranslated direction gap remains open. Exact historical and requalification results are retained rather than relabeled as a successful fix.

The revised six-case file passed on the landed source in a bounded VM module graph using the real captions, recipe bridge and localization runtime. Bark/massline inventory and complete gameLocalization initialization were explicit boundaries. Earlier eight-case qualification included the actual recipe table and twelve recipe modules with Ruud placement doubled. Those earlier eight passes are not a current full-graph run. Hosted direct execution of all eight named tests remains pending.

No local audioSystem/WebAudio, browser startup or full game acceptance is claimed. The optional [bounded runner](caption-contract-proof/reproduce.cjs) uses explicit synthetic boundaries and is not the hosted gate. Run it from a checkout with node --experimental-vm-modules and its repository-relative path; it reads committed source files without modifying them. The default named gate imports the real checkout directly.

## Publication
Fresh sole public parent4eb30c840accfdf20a2a696bfb2c2550aeac4769. Scoped files: one new test, package alias/check-chain append, this report, two public-safe evidence digests and bounded reproduction runner. Existing package line endings and every earlier command's relative order are preserved. check:caption-format-bridge reaches static shard2/3 with eight expected TAP tests and no unclassified leaf. Shared runner/workflows untouched.

[Historical qualification](caption-contract-proof/historical-qualification.md) and [landed-source requalification](caption-contract-proof/landed-requalification.md) distinguish the former proposal from current coverage. No merge or deployment; broader startup/localization acceptance remains open.
