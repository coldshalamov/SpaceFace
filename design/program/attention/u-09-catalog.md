# U-09 catalog — system surfaces (crew/nemesis/mail/docket/survey/scan/ship)
surveyCopy.js + scanReveal.js are clean. scanReveal's wreck-loss report maps `loss.kind` →
spoken noun (WRECK_LOSS_NOUN): only 5 kinds covered; others fall back to 'hauler'.
Landed: +6 noun coverage keys (patrol/pirate/convoy/courier/miner/tanker) — dormant rows
until the aftermath writer emits those kinds; same default path when it doesn't.
