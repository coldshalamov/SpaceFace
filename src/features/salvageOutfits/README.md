# Competing salvage outfits

> Local integration: this feature is now wired into the production browser/Node registries, public interaction, save/reset, worker transport and existing presentation owners. Commission-time integration instructions below describe those seams; no feature flag is required.

Scoped production candidate for SpaceFace, based exactly on
`34310c836bf80216b869331c54b777c231a637ee`.

The finite salvage race, physical work, bargaining, memory, persistence and presentation
adapters are implemented here. Apply the shared imports in [INTEGRATION.md](INTEGRATION.md)
during local integration. This candidate deliberately does not modify the shared registries,
generated encounter index, save envelope, worker transport, UI host, assets or packages.

## The playable loop

**Keel Union** operates an authored Pitborn Hawser. It approaches deliberately, handles the
heavy drive cradle, respects divided work and remembers a kept bargain. **Latchkey** operates
the smaller, faster authored Kestrel/Hitch hull. It reaches light prizes quickly, changes targets
when another cable has custody, and can overcommit to a cradle beyond its working limit.

Both outfits fly through Flight V3 under exclusive NPC-job control leases. They must approach
an original body, acquire a native attachment, tow it to the receiving apron, and slow both
ends before intake. A timer cannot declare cargo delivered. Their hulls can be damaged and
destroyed through the existing combat system.

Each opportunity has three separate, mineable, towable wreck bodies:

| Original | Mass | Initial scrap | Practical role |
| --- | ---: | ---: | --- |
| Drive cradle | 280 | 12 | Heavy prize; Keel's equipment is suited to it |
| Radiator frame | 100 | 7 | Useful independent recovery or cooperative share |
| Sealed tooling rack | 35 | 4 | Quick partial success, even after losing the main prize |

All quantities belong to those physical originals. Ordinary mining releases ordinary pickups
and reduces what remains for towing. Recovery pays eight credits per remaining scrap unit
through the existing economy owner. The receiver accounts the same units into the existing
Ceres refinery or Vesta outlying yard; it never gives the player a second copy of the cargo.

### Three situations and practical choices

- **Three pieces, three claims:** Keel approaches the cradle while Latchkey races for the
  radiator. The player can race, take another piece, or negotiate a split.
- **A second pair of hands:** Keel can recover the heavy original while the player recovers
  the radiator. Both actual deliveries earn the cooperation bonus, starting at 80 credits.
- **More load than cable:** Latchkey attempts the heavy original, then its real loaded line
  slips after six simulated seconds. The original stays where physics left it. A rescue
  bargain pays its remaining recovery value plus 50 credits only if the player delivers it.

**Split** reserves the cradle for Keel and both smaller pieces for the player. The smaller
pieces may be beam-recovered; this is remembered as a kept split. **Cooperate** requires the
original cradle received from Keel and the original radiator received from the player.
Mining or destroying a required original makes that completion bonus unavailable. An actual
partial recovery still pays its remaining value. Refusal and cancel leave the crews working
and create no scripted hostility or payment.

Claims communicate intended work. They do not install a new legal ownership system. A
player cable establishes actual custody. Breaking an accepted promise changes future terms;
ordinary combat, mining and local-law owners retain their usual authority.

## Finding and reading the crews

The generated encounter catalog adds the civilian proximity shape
`pro_salvage_outfits`. Its eligible authored places are derelict fields, mining belts and
refinery approaches in Ceres and Vesta.

`discovery.js` also submits a normal authored encounter request when a pilot comes within
480 world units of an eligible, previously unworked zone. This makes the feature accessible
on a late first visit instead of waiting hours for one weighted deck draw. The existing
director still applies pressure, pacing, eligibility and spawn admission: no `force` flag and
no direct-spawn fallback. There is one proximity identity per authored zone, a twelve-minute
local cooldown, and only one working site per sector through the ordinary discovery routes.
Returning to a completed site cannot reset its originals. Other authored zones provide the
next meeting; the ordinary random deck also remains available.

The overlay marks both crews with different shapes and names. Dashed lines show approach
intent before attachment; solid lines show towing. Cargo labels show the claim. The receiving
apron says to bring both ends in slowly. The existing prompt deck owns choices and their input;
scanning a crew reopens current terms. Radio uses the existing one-voice floor, with sound
emitted only after that same line is actually surfaced. The overlay has no independent frame
loop, flashes, shake or new key listeners.

## What persists and what changes next time

Successful cooperation and rescue record specific help events and improve the next bonus.
A rescued Latchkey leaves the light rack to the player and changes its real towing target.
After player violence it starts farther away, prefers smaller work and avoids another
overweight tow. Keel refuses another split/cooperation contract after an unresolved broken
promise. Memory retains counters plus the latest twelve concrete events per outfit.

Cold saves preserve stable cargo/crew keys, remaining pools, poses and velocities, hull damage,
claims, accepted terms, towing progress, memory and receipts. Numeric entity IDs and job leases
are transient. Restore adopts exact present originals or rematerializes their saved state,
waits for native admission, and reacquires the movement lease. No completed original is
respawned. A restored larger live salvage annotation is capped to the saved remainder.

Continuous sector membership preserves actual bodies and native lines. Intentional jumps
suspend materialized work with its actual progress; returning resumes that progress. Completed
crews physically fly away before their empty hulls retire. A player-attached workboat remains
in the world until that canonical attachment is gone. Fresh-run reset and teardown release
jobs, native lines and spawn reservations.

## Source ownership

| File | Responsibility |
| --- | --- |
| `index.js` | Runtime decisions, claims, agreements, receipts, memory and lifecycle |
| `physical.js` | Existing spawn budget, NPC jobs, Flight V3, native attachments and economy intake |
| `catalog.js` | Two outfits, three physical pieces, three situations and receiving markets |
| `discovery.js` | Bounded authored-zone proximity requests to the encounter director |
| `persistence.js` | Save normalization, durable keys, capture and restore ports |
| `readModel.js` | Bounded, read-only cues with current-occupant identity checks |
| `presentation.js` | Existing prompt deck, voice-floor mediation and static canvas cues |
| `integration.js` | Registered prompt adapter, worker-aware installation and concrete UI canvas mount |
| `INTEGRATION.md` | Copyable shared registration, save, worker and UI host edits |
| `../../data/encounters/8204-pro-salvage-outfits.js` | Ordinary encounter shape and runtime dispatch |
| `../../../test/pro-experiences-salvageOutfits.test.mjs` | Focused real-owner acceptance |

The feature writes its own saved subtree and owned annotations. Physics owns motion; the
combat attachment service owns cables; NPC jobs arbitrate movement control; mining owns beam
yield; economy owns money and station stock. No dependency on another commission is present.

## Verification and remaining acceptance

Run the focused suite on the exact base plus this candidate:

```sh
node --test --test-isolation=none test/pro-experiences-salvageOutfits.test.mjs
```

The final focused run passed **21 tests, with no failures or skips**. Before the generated
encounter index is rebuilt, the test uses Node 24's in-memory module hook to add only the
candidate encounter import/module entry. An already rebuilt index needs no hook. No gameplay
owner is replaced and no shared file is edited by that fixture. The proximity case verifies
real pressure and entry-pacing refusals before automatic native admission succeeds.

The suite exercises real simulation, native Rapier, combat attachments, NPC jobs, spawn budget,
mining, economy, encounter planning and save-envelope owners. It covers refusal/cancel, stale
callbacks, real competing tows, physical cooperation, lost required cargo, rescue, remembered
target changes, beam salvage, finite-pool inflation resistance, repeated settlement, two cold
restores, continuous membership, intentional-jump return, player-attached departure and reset.
The player fixture uses bounded native impulses to pilot a genuine body. This demonstrates
physical recovery and accounting, not keyboard/controller flight feel.

Diagnostic canvas renders of native approach and towing snapshots were inspected for readable
crew names, claims, target lines and the receiver. They use diagnostic hull outlines. Full
production-art, gameplay-camera, browser/Electron input and end-to-end worker acceptance still
belong to local integration. The supplied context omits binary art and several large source
files; exact-base dependencies needed by the native checks were fetched without changing them.

The existing generic wreck renderer chooses an authored aftermath component by numeric entity
ID. If rematerialization changes that ID, its component silhouette can change even though the
stable original key, quantity, pose, name and outcome persist. Fixing that renderer-wide asset
selection contract is outside the permitted scope. No substitute art or shared renderer shim
was introduced.

The saved ledger is bounded to 64 meetings, at most three concurrently working sites through
the owner API, and twelve memory events per outfit. The view projects at most three meetings,
six crews and eighteen cargo slots, preferring current work over completed history.

## Base provenance

The supplied context archive was verified against SHA-256
`683a5d9511cc095e996fc7e807294f5ea50f875243f45902175911f38d256a9d`, and
`HANDOFF_CONTEXT.json` identifies the exact base above. All 13,292 supplied tracked source
entries were hash-verified. The candidate adds files only inside the three commissioned paths.
