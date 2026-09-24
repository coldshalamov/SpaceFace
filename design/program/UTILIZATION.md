<!-- LIFETIME: DURABLE -->
# Utilization — checkouts, models, and the one picture

This note records the 2026-09-24 cleanup decisions. It does not open a packet, grant a lease, or
outrank `build_map.md`. The route is §26. Fielding stays §13B / `PQ-136`. The picture stays §13D /
`PQ-193` and `PQ-050`. The look stays Lacquer & Starlight plus the Orrery.

## Checkouts

A registered worktree is a full copy of the game (about 5.6 GB) plus, often, a junction named
`node_modules` that points at the real install. Deleting that junction with a recursive remove
follows the link and destroys the game's install. Unlink the junction with `rmdir` first, confirm
`node_modules/three` still exists, then `git worktree remove`. A file named `NUL` has to be
deleted with the `\\?\` prefix or the folder will not go away.

On 2026-09-24 the checkouts last touched on or before 2026-09-21 were removed. Their commits
stay on branches. They were not merged. Master had other people's uncommitted work, and several
of the branches are an older UI or an older copy of a file master has since grown. Do not merge
`archive/pre-ui-audio` or `archive/soak-wt-overlay`. Those are September snapshots. Landing them
would delete files the game has now.

Left in place on purpose (touched 2026-09-22 or later, or locked): `pq040-native`,
`pq040-acceptance`, `pq033-candidate`, `pq033-floor-v2`, the `C:\tmp\sf-*` comparison checkouts,
`pq033-premerge`, `sf-head-check`, and the locked `.tmp/headwt`. Two of those detached tips also
have safety branches, `archive/sf-pq033-soak` and `archive/sf-head-check`, so a later removal
cannot drop the commits. Do not remove the folders while they are still in use.

| Branch | What it was | What to do with it |
|---|---|---|
| `fleet-pause`, `fleet-station2`, `fleet-title` | Field Hardware pause, station, and title | Superseded by the Orrery. Do not merge. |
| `fleet-toys` | Mines rebuilt as machined ordnance | The census test is not on master. `visualFactory.js` on master is the newer file. If mines still read as toys, replay that commit's mine hunks only. |
| `pq195-third-shift` | Raider pressure through the spawn budget | The raider test is already on master. The branch's jobs file is an older copy. Do not merge. |
| `pq205-bombs` | Bomb telegraphs as matter | The presentation file matches master. Archive only. |
| `pq210-frame`, `pq210-quiet` | Frame budget and yielding harnesses | The main files match master. Archive only. |
| `pq210-hudlook`, `pq210-motion` | Demo HUD and the motion-ask screen | Do not restyle the Orrery back to that HUD. |
| `pq033-verify-evidence` | The September 15 redock-stall investigation, plus five diagnostic scripts saved on the way out | Do not merge into the live soak. Read it only if `PQ-033.02` is missing a result this branch actually proved. |
| `archive/soak-wt2`, `archive/soak-wt3` | September 16 soak and render fixes, including kept-mesh re-key | The live soak is the later `C:\tmp` checkout. Do not merge this older line over it. |
| `archive/soak-wt-overlay` | A dirty September 16 snapshot, including Hornet texture edits | Rescue only. Do not merge. |
| `archive/pre-ui-audio` | Psychoacoustic layer plus a large uncommitted September 17 tree | Listen for the hush / near-miss / hull-breach treatment before porting any of it. Do not merge the branch. |
| `archive/ricochet-foundry` | A physical Ricochet Foundry arena and authoritative banking. The files are not on master. | This is the one stale branch that is a real missing feature. Land it on its own, when master is quiet, not as part of a cleanup. |
| `archive/pq033-premerge` | Latch `ownerDefer` once flight is playable | The same commits are already on `pq033-verify-evidence`. The folder stayed because it was touched on 2026-09-22. |

## Models

The game's models are about 5.5 GB. They are not the disk problem. The disk problem is the extra
checkouts and old captures. Do not delete a hull to save space.

What the player can buy is Hitch, Pelican, Wasp, Mule, Drifter, Hornet, Ironback, Hawser, Bastion,
Atlas, Ranger, Warden, Colossus, and Leviathan. Packaged whole bodies for those identities stay.
Hitch is frozen.

Already paid for, and already planned as variety rather than as new commissions:

- Corsair Blade becomes the raider body that today aliases the Ashline Rig (`PQ-050.15`).
- Reaver Hook becomes the pirate side of that same hull so the two stop matching.
- Helios Arclight is a heavy hauler with no live sibling. It needs a presentation pass, not a new mesh from nothing.
- Span's MTS, DMC, and Reach kits, and Wasp's militia, escort, and patrol kits, are faction paint and parts on hulls we already fly.
- The volatiles tanker and the inspection cutter are packaged bodies held out of traffic until a chase-camera look says they belong.
- The yard tug is already live. Do not rebuild it.

A factory `*_production_v1` that is not the live selector stays on the shelf until §13D says to
promote it. Swapping one onto traffic early has already made ships invisible. Source blends and the
small third-party donor kits (Helios v3, Ashline v2) stay. They are the editable source, and
together the donor kits are under half a gigabyte.

A model is a delete only when it is a byte copy of a live release, nothing in the release manifest
or the reachability check points at it, and the triage has no FIELD or VARIANT job for it. A
same-size scan did not find a packaged hull that failed that test. The old Wasp and Pelican files,
and Hitch sculpts v2 and v3, are still named by the parts manifest or by art tools, so they stayed.
Retire those names, then delete the files. No packaged hull was deleted in this pass.

The one unused silhouette worth a ship, rather than a delete, is the Reaver hook: it should become
the pirate that currently wears someone else's hull. The heavier factory remasters of Dart, Lode,
Rig, and the work boats should replace those same jobs once one of them beats the live file at the
chase camera. Hornet needs that finish in place. Colossus and Leviathan are both live and too
close in weight; one of them has to read as the flagship. None of that is a new commission.

## The picture

Do not invent a style. Hulls are painted working vessels under warm starlight: couriers sea-green,
mining ochre, service copper, freight blue-grey, patrol slate, rescue ivory. Large faces stay quiet
color. The glass is an instrument of light, quieter than the hull. Performance comes from one
material family, packaged LODs, and not loading station furniture ahead of hulls. It does not come
from turning the picture down.

The five jobs are in §26. Nothing in this note adds a sixth.

## Scratch

Old capture folders in `.devshots` from before 2026-09-22 were deleted. A folder still being
written was left, including anything touched on or after that date. Tool caches (`.pytest_cache`,
`.ruff_cache`) were deleted. Safety copies of source (the `*-backup*` trees) were left, because
they can still hold an edit that never landed. The models were not the disk problem. The extra
checkouts were.
