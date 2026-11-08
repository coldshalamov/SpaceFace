# Scale 4: the freight comes home

## Reasoning from the actual beginning
The background W1 review omitted the practical B1 alloy→Scale 4 leg. Current source already contains the actual `alloy_run` prerequisite waypoint (`kesslerScalePending` in `kesslerScaleWorksite.js`), a retained paired plate/stamp receipt, and the prior different-load return contact. These were not missing writers to recreate. The opportunity here is the physical return leg: make “freight retained” usable, so the pilot knows which cargo remains, why a live Line prevents collection, and that a 20t body stamp does not mean 20 units of commodity.

Fresh origin/master remains `f95de0eb1ba7560839209936afba48c7b96fe41a`. NOW and `6ebfabe` reservations checked; the exact scale owner had only our three-line comparison hook and no other current exact claim. Lane B onboarding/encounter/audio files remain untouched. This does not relocate a heist board or claim to resolve Elroy fate; those leads require their own canonical owner evidence.

## Player-facing implementation
`kesslerFreightRecovery.js` adds one nearby, nearest weighed cargo-pod recovery locator. It reads the actual still-live jettisoned payload and its actual Scale 4 receipt, remaining commodity amount, and occupant generation. It names cargo units separately from physical body mass. The label tells the pilot to release the line first when the **same exported `isMasslineLatchedPickup` predicate used by the actual collector** blocks pickup, then approach to collect as cargo space allows. No cargo is moved by this helper.

The indicator is explicitly a **LAST FIX**, because Scale 4's calendar update samples it rather than following every physics frame. Its 18-WU ring is a locator, not the collision hull or pickup acceptance boundary. A partially collected pod updates its remaining quantity on the next owner sample; a collected/removed/empty or distant pod removes the locator. Mode, dock, sector/run/venue and owner cleanup also remove it. It is not a durable route marker or a saved tether.

No acquisition, weighing, count, variance, receipt, cargo capacity, collection, sale, payment, mission or physics law changes. Normal receipt and cargo owners keep authority. The weighed stock can still be moved, used, partly collected or left behind.

## Exact scope and restoration
Four paths:
- `src/systems/kesslerScale.js`: import and isolated derived-read/cleanup hooks. Before `/tmp/kesslerScale.before-recovery.js`, patch `/tmp/kesslerScale.recovery.increment.patch`.
- New `src/systems/kesslerFreightRecovery.js`.
- New `test/kessler-freight-recovery.test.mjs`.
- This note.

Preserve the prior `kesslerComparisonContact.js` dependency and existing Scale 4 worksite baseline. No held/reserved edits, new models, worktrees, publication, merge or deployment.

## Evidence and review corrections
Six focused tests, **55/55 combined author and independent read-only review pass**, with final evidence approved within stated limits:

```
node --test test/kessler-freight-recovery.test.mjs test/kessler-comparison-contact.test.mjs test/kessler-scale.test.mjs test/kessler-scale-worksite.test.mjs test/kessler-open-ticket.test.mjs test/rope-scale-kessler-evidence.test.mjs
```

Actual cargo jettison and mining pickup fixtures return 17u once, and partial volume-capacity collection leaves the correct remainder without reweighing. Actual entity serialization retains the physical cargo receipt but excludes the transient guide. It does not test disk/UI Continue or reconstruct a physical haul. Initial fixture capped mass instead of the actual hard volume cap; corrected the test, not the cargo law.

Independent review caught that an initial custom latch read differed from the real collector (foreign attachment versus player mirrors/telemetry/body flags). The helper now imports the canonical read-only predicate. Regressions cover current player-owned stamped attachment, stale target generation, foreign attachment, telemetry and entity latch flags. It does not invent a stronger pickup policy than the owner actually uses.

The native probe starts with fixture B1 alloy completion and 17u of fixture-owned iron, then removes that cargo through real jettison, catches via actual input, flies/tows it into Scale 4, waits for the actual reading, cuts the Line, and lets the ordinary collector return the contents. Actual worksite dressing is materialized by the normal scale owner. At **101.8667 simulation seconds**, one reading is **18.8t plate versus 20t body stamp**, **17u returns**, no credit grants occur, and the recovery guide retires at the next sampled owner update. **1,890 guide frames** are observed. The native return proves the immediate physical measuring/recovery loop, not the earlier mined/purchased alloy acquisition and delivery mission.

There are **24 observed player–pod contacts**, all pair `1:7`; no observed contacts with other bodies or worksite dressing in this probe. They remain a handling/acceptance concern, not a clean-flight claim. An initial test wrongly expected locator removal within two physics frames after mining consumed the body; waiting for the real calendar owner sample reflects actual behavior, and LAST FIX explicitly bounds the presentation. A subsequent test-only active approach after cutting also completed (106.8333s) but retained the same 24 contacts, so it does not establish a cleaner route; the reviewed baseline native test was restored unchanged. No mechanic or collision law was changed to hide these observations.

## Remaining acceptance
Source integrated and tested, not published or user accepted. This is not a full mine→skim→dock→alloy delivery→Scale 4 campaign acceptance. Initial stock and alloy completion are fixtures; the ensuing flight/catch/read/cut/collection are actual owners. Rendered scanner interaction, locator legibility amid live traffic, full world population, audio, disk/UI Continue, and contact-free recovery remain unverified. Branch-specific character reactions/Elroy fate were considered but not inferred from legacy flags or claimed implemented here.
