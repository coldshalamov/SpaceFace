Implemented all four units; no commits made.

- **STORY-09:** Refusing a trap writes one memory line, and the same broker’s next offer recalls it.
- **STORY-10:** Each ace defeat produces one cited headline naming the ace and venue.
- **STORY-11:** The barkeep names the ledger’s most-cited deed; different histories produce different replies.
- **WORLD-44:** Witnessed lawful pirate kills name the saved hull; unwitnessed kills produce no headline.

The writers already retained the facts, but their readers lacked these connections. Refusals now use stable broker identities with a 128-debt cap, and barkeep replies use existing citation counts. Rescue news follows lawSecurity’s witness verdict while preserving the physical wreck.

| Focused test | Result |
|---|---:|
| `test/inf-story-09-declined-trap-remembered.test.mjs` | 2 passed |
| `test/inf-story-10-ace-defeat-news.test.mjs` | 1 passed |
| `test/inf-story-11-barkeep-cites-deed.test.mjs` | 1 passed |
| `test/inf-world-44-witnessed-kill-headline.test.mjs` | 3 passed |

**Focused total: tests 7 · pass 7 · fail 0.** Nearby regressions: 58 passed.

Added copy, verbatim with test values; names, venues, choices and witness counts use live records:

> Declined Rook Huxley's offer: Divert to Concord.

> Rook Huxley: "You refused my last offer. I remember."

> Yara No-Cut defeated at Helios Prime; Red Latch Crew loses its captain. Source: ship's combat log.

> Toll Saint Venn defeated at Helios Prime; Sker Hooks loses its captain. Source: ship's combat log.

> Your ship's ledger keeps coming back to this: Towed in a survivor pod at Helios Station.

> Your ship's ledger keeps coming back to this: Destroyed a hostile Red Latch raider at Helios Station.

> Raider destroyed at Helios Prime; Sable Mercy saved. Source: 1 eyewitness report.

Other changed paths:

```text
src/data/moralTraps.js
src/systems/moralMemory.js
src/systems/moralTrap.js
src/systems/missions.js
src/systems/aceMemory.js
src/systems/shipLedger.js
src/systems/aftermathWrecks.js
src/systems/lawSecurity.js
src/ui/marketNews.js
src/ui/station/barContacts.js
test/helpers/infStoryScenario.mjs
test/world-remembers-rivalry.test.mjs
```

In `missions.js`, INF-C owns only the helper import and board-return change; concurrent foreign hunks remain preserved.

Remaining validation issues: two heir-return failures also reproduce against HEAD and were excluded from the passing regression run. Baseline finished **13/17**, reporting board drift, expected-hash differences and a physical-branches timeout. Reload hashes matched.

Adventure completed **300 simulation seconds** with route PASS, but player-truth remains **INCOMPLETE** for readability, hardware frame time and offscreen markers: [verdict](C:/Users/93rob/Documents/GitHub/SpaceFace/scratch/player-truth/inf-c-story-world-20261017/verdict.md), [contact sheet](C:/Users/93rob/Documents/GitHub/SpaceFace/scratch/player-truth/inf-c-story-world-20261017/contact-sheet.jpg).

