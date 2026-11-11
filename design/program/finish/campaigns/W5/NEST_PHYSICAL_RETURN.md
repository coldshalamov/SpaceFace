# The Nest: return to the carrier, not loose scrap

Unpublished seven-file increment over draft PR #939 head
`18368855a0893a2035e3252d091a5ff61ba37074`, parent tree
`d097ad5067be2b4ea2b1dde70cb6c4ba500e6eeb`. Freshly checked open, draft and unmerged.
No shared working-tree source, held path, model, user computer, execution thread,
merge, deployment or publication was changed.

## Diagnosis and chosen road

Normal-input continuation from the preserved earned reattached wasp:1 checkpoint
exposed an actual false-positive. Rapier produced a Wasp/baffle collision at
(8805.704, 25505.652), while the carrier was over 500 WU away. The prior runtime
credited a coupling breach, consumed the Wasp through combat and paid its existing
reward. The baffle was an independent 400t dynamic prop, not physically joined to
its carrier, but historical player-latch gating meant it was still classified as
an intact assembly. Distance to that loose baffle was enough to damage the ship's
abstract return counter. That baseline is rejected evidence, not the next checkpoint.

A real structural coupling would require its own joint, break policy and save
lifecycle. Snapping bodies back into place would erase physical history. Simply
reducing the credited tear threshold to a baffle diameter would instead allow both
passively drifting baffles to finish this visit as emptied. That alternative was
implemented only in a rejected isolated candidate, tested and discarded.

The chosen correction separates physical targeting from the existing attributed
tear outcome. Actual loose material is scrap. Its carrier flank becomes the real
return target. Passive separation does not award a player tear, vent the brood,
refill ammunition or finish the encounter. Existing 120-WU player-tear, finite
launch, ordinary combat death and settlement owners remain.

## Player-facing result

- Once a baffle moves one diameter (24 WU) from its carrier-relative socket, it is
  permanently detached. Its label identifies scrap, and the carrier-owned target
  guide moves to the actual exposed flank. A later drift back does not reseat it.
- A Wasp must actually hit that carrier flank, or an exposed still-seated assembly.
  Distant scrap, mere proximity, wrong flank, unhandled Wasps and stale occupants
  cannot breach the ship. No virtual hole or new physical collider is introduced.
- Passive detachment never increments tornDoors or triggers the vent/empty route.
  An eligible seated player latch can still earn the original 120-WU tear. Latching
  already-separated scrap cannot acquire that attribution retroactively.
- The Journal reports real breaches out of three, actual surviving launched Wasps,
  insufficient finite ammunition, and the gun/withdrawal alternatives. It directs
  returns to the carrier instead of detached pieces.
- Contact-time surface pose and exposure evidence survive pending-return saves.
  Legacy unconsumed contacts lacking this evidence are discarded conservatively;
  credited returns and existing deaths are not invented, undone or repaid.

The historical seated-latch attribution policy remains: a latch made while the
assembly is seated can retain tear eligibility after release. This increment does
not promise a continuous-pull-only requirement. Old saves without the new eligibility
fact conservatively require a new seated latch rather than inventing its history.

## Native earned result

The source-qualified production runtime uses its real input system, Rapier backend,
combat owner and save/title Continue seams. The input checkpoint is the earlier
`nest-arrival/native/reattach-v1/reattached-slots.json`, with the six genuinely launched
compact Wasps, zero return credit and 1,206 credits. No actor, health, position,
progression, credit, combat contact or terminal outcome is injected by the harness.

The corrected pilot reels the actual wasp:1 and tows/orbits near the carrier. At
physics tick **123355**, Rapier reports carrier 4341 / Wasp 4345 contact, impulse
**353.379525**, at **(8383.579, 25869.442)**. A second actual contact follows. The
regular combat owner consumes wasp:1 and the encounter records **1/3**, consumed
slot `[1]`. The carrier remains alive at 460 hull. Credits remain **1,206**, with
**zero credited tears**, six launches and no remaining brood. The other five Wasps
remain finite actors, including their actual damage.

An independent native replay reproduces the same actual pair, contact tick and
result. The first-return encounter/read-model hashes are the final hashes. The
post-impact visit admission changed subsequently only to repair the following
Continue issue; source cohorts are separate in the artifact audit.

## Playable Continue and collision clearance

After a physical return, generic combat persistence restores the struck carrier
itself, moving at approximately 0.234 WU/s. The old visit gate treated any carrier
pose divergence above 0.01 WU as invalid. The native diagnostic showed the proven
carrier drifting normally while the visit remained absent. A snapshot retaining
1/3 alone was therefore not playable-Continue acceptance.

The visit now adopts that already-restored carrier only with matching encounter,
shape, sector, fingerprint, Atlas model, 520t/radius 30 dynamic recipe and finite
motion. It never rewinds the body's pose, speed or damage. Unproven assemblies
still fail closed. A moved carrier remains an obstacle to missing actors.

The only conservative broad-phase exception is per missing baffle: its saved
position must be within 3 WU of the **current rotated carrier socket**. It is not a
blanket exemption based on nominal saved geometry or carrier movement. The original
released Atlas skin versus radius12 baffle has native clearance 3.110235 WU; a
separate current-source native geometry probe tests 72 directions around each
3-WU deviation boundary and finds minimum separation 0.110235 WU. Displaced/non-nominal
baffle sites and every missing Wasp still test against the actual carrier. The
underlying native admission remains in place. The geometry probe uses the observed
carrier recipe and actual shape builders; it does not claim full factory acceptance.

On final source, the earned **active 1/3** checkpoint passes two title Continues with
an actual live carrier/cast, retained consumed slot1/dead Wasp, finite brood, unchanged
credits, no terminal receipt, and the real mission-owner Journal showing 1/3.

## Alternate failure and truthful consequences

A further native tow attempt catches real wasp:3 but fails to keep the pilot near the
carrier. It travels beyond the existing 3000-WU boundary. This is **failed piloting**,
not a successful second return or three-return victory. The canonical owner records
`carrier_escapes` at simulation time 2086.083333 and Rook says the surviving carrier
remains a Reach threat, directing the pilot to Tethys for the Registry Writ. Credits
stay 1,206. The existing journey owner records the Nest decision; it does not claim
the carrier was destroyed or gutted.

Final-source title Continue retains that exact alternate receipt and the actual
mission waypoint **Tethys board — Registry Writ**, without a duplicate handoff or
payment. This alternate terminal save is kept separately from the active 1/3 save.
Physical Tethys travel/Registry acceptance and a native three-return victory remain
unverified. The active 1/3 checkpoint is the preferred next continuation when pursuing
the return route; the escape checkpoint records a real alternate outcome.

## Exact scope and verification

Seven files:
1. `src/data/encounters/705-the-nest.js`: detached targeting, seated attribution,
   bounded pending-impact surface evidence and honest guidance.
2. `src/data/nestVisit.js`: return/progress/ammunition/loose-baffle Journal reads.
3. `src/systems/nestVisit.js`: provenance-checked actual carrier-motion adoption and
   per-site conservative assembly clearance.
4. `test/nest-socket-return.test.mjs`: 13 focused physical-target/save/guidance groups.
5. `test/nest-carrier-motion-continue.test.mjs`: 18 carrier/clearance/adversarial groups.
6. `scripts/test-nest-runtime.mjs`: one fixture now seats the baffle at the actual
   rotated socket before claiming its seated latch. Its original behavioral
   expectation is unchanged; no golden or pass condition is weakened.
7. This report.

Final focused 84/84 and aggregate 392/392 pass, with no failures or skips. The aggregate
includes existing route/outcome/provenance, actual Three target-indicator graph,
combat rejection and neighboring journey checks. Independent source/aggregate,
additional adversarial tests, first-return replay and final active Continue are
recorded separately by the reviewer. Player labels and the type floor pass (2,554 declarations inspected); the direct
production route script passes 28 groups. These are not folded into the unit count.
These are scoped checks, not full hosted CI or release acceptance.

Failed intermediate harnesses/candidates remain available: an initial baseline
runner omitted its new test from the overlay; the auto-tear alternative was rejected;
the rotated old fixture was geometrically inconsistent; Continue-v1 retained the
receipt without restoring a live cast; and the first type-floor invocation used the
wrong working directory. The first direct route invocation omitted Node’s required
VM-modules switch; its corrected invocation passes. None is relabeled as a pass. Corrected final runs have
separate source identities and evidence names.

## Limits and reproduction

This is simulation/native physics evidence through programmatic public controls and
controller seams, not rendered clicking or a human handling assessment. The earned
pilot has inherited invulnerability and transient load protection. Collisions and
the failed follow-on tow are not hidden. No rendered/audio, FPS, full New Game,
unprotected-combat, three-return-victory or Registry-journey acceptance is claimed.
No browser permission restriction was retried or circumvented. No models were made.

CWD `/workspace/shared/SpaceFace`:

```
D=/workspace/shared/nest-return
HELIOS_OVERLAY="$D/overlay.json" HELIOS_RUN=review \
  node --require "$D/exact-fs.cjs" --loader "$D/exact-loader.mjs" "$D/run-tests.mjs"
python3 "$D/audit.py"
```

For native replay, layer the requested harness text at virtual
`scripts/nest-return-native.mjs` over current overlay.json and change only its OUT
directory. Input saves and original evidence are immutable. The manifest binds
candidate source, exact-parent imports/filesystem reads and each harness cohort.
Source missing from the parent overlay comes only from pinned Git base f95de0e,
with every consumed untouched blob checked against the exact 18368855 parent tree.
Inherited replacement-decoded UTF-8 import bytes are distinguished from raw Git
bytes. The shared checkout's unrelated edits are not used.
