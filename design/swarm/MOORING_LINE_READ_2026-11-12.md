# The Mooring Line: let the specialist ask its question

## Actual experience and decision

The authored act already exists at rounds 26–28, after Forge Regent. Its description promises an exposed committed hull, a contest over the tether, then a combined Anchor/Raider pressure test. But its original recipe puts eighteen ordinary ships on the field before the staged specialist. In a production-manifest native round-26 probe, thirteen ships and 246 Brood were present by tick120. The Bruiser appeared among nineteen ships by tick240. The stock lab pilot died at271. This is not evidence that an earned round-26 build is too weak; it is evidence that the promised solitary first read is absent.

The increment retains the act's actual bodies, bearings, finite ship debt and room physics. It moves only the staged specialist entrance to the first active read and defers the other owed population. Round26 gives the original Bruiser fourteen active-flight seconds among loose mass. Round27 gives the original Raider sixteen seconds while the existing furnace remains active. Round28 presents the original Anchor/Raider pair together for eighteen seconds while the shutter room remains active. The forecast event is retained and begins after that read, not removed. Existing packet owners then deliver the finite remainder.

The draft forecast uses the same score to explain what the player will face. The pilot may use a clear throw/loaded line or fight with guns. No equipment, model, second spawn owner, motion, collision, damage, reward, completion or save law is added. The room is not made harmless: native round28 still killed the scripted pilot against the two specialists before the crowd.

## Source scope

Exact parent: ee7671f139de61be3d93b4a0f3be02f055745965, freshly verified PR942 head. Shared checkout stays untouched. Candidate files are isolated overlays, not another checkout.

- `src/data/swarmFoundryScore.js`: three act-specific readable windows and matching preparation text.
- `src/systems/survivalWavePlanner.js`: honors explicit staged timing only when both a canonical Foundry score and an existing authored act apply.
- `test/swarm-mooring-read.test.mjs`: finite recipe, room, exclusion, idle/pause, native-owner admission and full finite-debt conservation checks.
- `test/swarm-foundry-score.test.mjs`: keeps the existing round28 event forecast assertions, now verifying absent before and present after the new authored read.
- `test/swarm-regent-entrance.test.mjs`: keeps its room/act assertion while recognizing the new Mooring score.
- `test/swarm-foundry-anchor-act.test.mjs`: replaces the obsolete future-frontier assumption with explicit identities for the already-existing Regent and subsequent Mooring act.

## Evidence

Focused new suite:7/7. Each owner case conserves the full original finite Brood budget as alive+pending+removed+held splitter/mother/late/Hive/machine reserves before and after admission. It does not exhaust every later birth/death lifecycle.

Plan comparison:195 unaffected plans byte-equivalent; nine intended plans retain original package content except staged atTick and readAfterTicks, exact quota/concurrency, act identity and room phase. Matrix covers three seeds, normal/dense variants, Foundry/Hive and rounds1,10,15,20–30,32–34.

Native production manifest with synthetic public inputs, actual AI/flight/physics/weapons:
- Round26 candidate: sole Bruiser through the read, normal package admission begins tick840; pilot alive at901, hull140. Baseline dies271 amid the crowd.
- Round27 candidate: sole Raider through the read; normal package admission begins960; pilot alive1021, hull140.
- Round28 candidate: original Anchor/Raider pair, no Brood during the read; pilot dies445. No successful combined-pressure completion is claimed.

These stage each round with a stock lab build. Earlier rounds are not earned, controller choices are scripted, and different encounter populations necessarily change subsequent trajectories. No hardware-input, rendered readability, full encounter victory, learned tether execution, performance, economy, full-run balance or Swarm Continue acceptance follows from these probes.

Final aggregate94/98; unchanged exact-parent adjacent suites43/47 reproduce the same four obsolete wave21-frontier assertions. No assertion was removed to hide those failures. The new event timing cases pass. Frozen source loader obtains all imported project JS/MJS/JSON/TS from exact parent Git objects except the declared candidate files. Installed dependencies and native assets remain environment-provided; direct filesystem reads are not globally audited.

No publication, merge or deployment by author.
