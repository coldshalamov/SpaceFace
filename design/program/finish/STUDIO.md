# SpaceFace production studio

The controller owns product direction, integration and release. Workers own a complete player
outcome through investigation, implementation and its relevant direct check. The Finish lane
boards remain the product backlog; this document describes how the team executes them.

## Departments and current production

| Department | Responsibility | Current concrete work |
|---|---|---|
| Direction and integration | Select the next material outcome, resolve contradictory intent, integrate and publish coherent changes | Whole-game checklist, PR reconciliation, startup and recovery, final build-map/history review |
| Gameplay and physics | Movement, collision, combat, tools, progression and their single writers | Hull-footprint inertia; public recovery buoy targeting, winching and paid delivery |
| Technical art and assets | Source/release identity, physical envelopes, materials, LOD, authored appearance and runtime cost | Deterministic asset-physics inventory, then ranked asset batches and inspected fixes |
| Interface and game feel | Screen composition, input, feedback, accessibility and visual iteration | Fitted ship callouts, compact trading, mobile HUD, prompt coordination |
| Platforms and release | Deployed browser, iPhone/WebKit, desktop packaging, performance and recovery | Sol owns the deployed iPhone blocker through diagnosis, staged deployment and relevant recheck |
| Tools and production support | Compact context packets, ownership, asset sharding, repeatable local iteration and useful failure reports | Existing agent runner/loop plus Finish factory packets and operational leases |

These are responsibilities, not permanent locks on every file in a department. Exact current
write sets and actual work determine ownership.

## Work flows through outcomes

1. **Discover.** Start from a player symptom, a selected plan, an existing coverage finding or an
   asset-inventory signal. Reuse completed source reads. Turn an inkling into a specific question
   capable of changing the game, with the relevant owner, intended experience and smallest useful
   observation. Do not call every unfamiliar implementation intentional.
2. **Choose.** Prioritize broken player routes, physically incorrect behavior, inaccessible controls,
   crashes and frame stalls ahead of additional content. For a creative decision, seek contrasting
   gameplay, visual and technical proposals; the controller chooses a coherent direction.
3. **Build.** Give one worker a bounded outcome, source base, input identities and exact write set.
   Preserve canonical physics, damage, save and input owners. A discovered adjacent defect becomes
   an owned repair or a concrete lane item, rather than a dismissal as “pre-existing.”
4. **Challenge.** Use an independent Sol or other suitable reviewer where a material cross-owner,
   platform, correctness or visual risk warrants it. Review the actual candidate and its player
   consequences. Agreement and reviewer counts are not acceptance.
5. **Exercise.** Use the existing no-boot loop for development, then the ordinary route for the
   player outcome. Open the image for a visual claim. Measure a matched change for a performance
   claim. After a failure, change the relevant cause before repeating that check.
6. **Integrate.** The controller reconciles the candidate with current work, commits exact paths,
   fetches and merges remote updates, publishes, and updates the existing lane/outcome records.
   Keep implementation, focused behavior, player route, deployment and device results distinct.

Workers continue through concrete feedback. A prepared command, syntax check, screenshot count,
inventory or test-only feature does not finish a player-facing assignment. When an outcome really
closes, take the next material item; do not manufacture more review for the completed one.

## Asset processing

Use `scripts/report-asset-physics.mjs` to produce analysis inputs and divide them by asset
identity. The default partition covers the 15 canonical ships. `--catalog=release` covers all
418 release assets in 352 families, with role-specific metadata for structures, ship visuals and
components. `--ids` and `--shard=INDEX/COUNT` select bounded follow-up batches. Record the input
hashes before dispatch; membership and metadata coverage do not establish player reachability.

An asset packet carries its source/release hashes, runtime use, render bounds and origin, collision
proxy, mass/inertia/COM policy, relevant material rules and LOD identity. Workers distinguish a
measurement, a plausible concern and a demonstrated defect. Texture color does not establish
physical density, and decorative content does not automatically need ship physics.

Process data in broad batches, then spend expert attention on ranked anomalies: an omitted hull
dimension in inertia, an offset physical envelope, an inappropriate fallback, a lost articulated
pivot, an unreadable effect, excessive geometry or a material that fails on a target backend.
Modify authored/generated assets through their existing compiler and manifest owners. Review the
result in its real context, preserving the appearance that gives each ship or place its identity.

## Capacity and durable handoffs

Use `scripts/finish-factory.mjs` for operational packets and leases under the ignored studio run
directory. Packets point back to a Finish board; they do not create another product status authority.
Readonly asset analysis may share inputs. Mutation workers must have disjoint write paths, and
live GPU experiments have one current owner. Workers return candidates; the controller decides
integration and acceptance.

The native tool currently permits three workers alongside the controller. Keep those slots useful
across mobile, interface, gameplay/assets and successive waves. Large data jobs can be sharded
independently of model concurrency. Additional LLM capacity must be verified before dispatch:
the November 2 standalone CLI canary rejected `gpt-6-luna` for its ChatGPT-account backend despite
the desktop model catalog listing it. That route is blocked; no alternate model/account is silently
substituted and no additional worker is claimed to be running.

Every returned packet records its actual source/input identity, changed paths, direct checks,
artifacts and material remaining work. Keep context compact enough for another worker to act on it.
Blocked provider/device access is recorded honestly while independent game work continues. The
five additional ChatGPT Pro creation jobs retain their original provider requirement and remain
unsent while the intended Pro account is usage-locked until November 4; do not substitute Work.
