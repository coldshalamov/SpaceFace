# Furnace Detail: arrival, physical work and return

## Status and parent

Isolated candidate on PR #939, commit `7cce26833827da6bb0bf6c94f7c036b1be590fa1`.
Revision 2 withdraws the earlier capstan archive after re-init and overload review.
The frozen first-arrival partial remains unchanged. This extension adds local physical
handling equipment to the authored scene, not a Line-class grant or a hired-tow shortcut.
Final mechanical evidence and remaining visual gate are recorded in the accompanying
HANDOFF and RESULT. No merge, deployment, shared-checkout edit or model edit is included.

## The authored experience

Mira's retained Scale 4 slip leads to the existing Furnace Detail on Tethys's Contracts
board. The original measured freight remains the player's cargo. The job still calls for
four marked repair-mite sites and three finite 40 t quarantined pods at the Closed Refinery.
The abandoned hulk has no speaking crew. Jorah keeps his separate living-yard freight job.
CR-FEED introduces the work, the repair fauna and frag collateral. Casket worms are not
mission targets. The working Ceres host later reads the actual job record.

The player's earned Class I controls 20 t. The scene and Mission Log explicitly warn that
sustained holding of a 40 t pod can overheat and snap that Line. The local solution is a
fixed CR-FEED quarantine gantry at the large intake, using the existing maintenance-gantry
asset. Three actual native ropes hold the same fresh original loads in their waiting
positions. The gantry is visible/selectable infrastructure, not a disguised ship or Jorah.
No cargo pose, velocity, mass or class progression is overwritten.

After clearing the four marked mite sites, right-click the gantry and Hail. The first two
offer lines disclose the included 40 t yard winch, no charge, actual-receipt requirement,
650 WU attendance, Save/Continue pause and cable/load risk. WINCH POD n winds one drum at
a time; HOLD stops shortening, not momentum. RELEASE TO MANUAL cuts the yard line. A
player-controlled line takes custody instead of competing with the gantry. Status and
receipts remain separate. Physical intake alone consumes cargo; the mission owner alone
settles payment. A held or released pod may still move or coast into intake.

On returning to the living Ceres berth, the existing host distinguishes original receipts,
losses, the 480 cr contract settlement and recorded Casket losses. The work does not reopen
the Closed Refinery, declare the entire ecology dead, or release withheld 47-A payment.
The original post-work inspection and onward Book 2 route remain owned by their systems.

## Finite equipment and consequences

The gantry is a fixed native body with 600 hull, not an invulnerable UI marker. Damage and
true destruction persist. Its cables use canonical attachment spring/reel/break behavior.
The local rating is 16,000 force, K640, damping ratio 1.15, 14 WU/s drum speed, 55 WU minimum,
900 WU reach, and the existing generic attachment limits. The capped spring alone does
not guarantee that its high generic tension-break threshold can be reached. A local safety
trip therefore measures live endpoint separation: beyond 900 WU, the next coarse owner
update cuts the actual cable through the canonical attachment service. The pod keeps its
pose, velocity, hull and identity. Saved custody becomes released with null drum length;
there is a clear overrun warning, no replacement, receipt or grant, and no automatic reset.
The trip applies while held or winding, without requiring player attendance. Cargo radius 12 couples at 1.25
to a standard NPC 260 field: at most 325 WU/s² from that cone. 16,000/40 t is 400 WU/s². This
is a local operating margin, not immunity to the aggregate 820 field acceleration bound.
Strong combined fields and interference can still overwhelm equipment. There is no field
suppression, mass discount, endpoint teleport or invisible reward.

The earlier 4,200-force trial stalled because a live NPC cone pushed the cargo outward at
about 120.275 WU/s², exceeding the line's 105 WU/s² force/mass. Native raw-contact diagnostics
found no physical wall; centered anchors and a fixed root were verified. Increasing only
reel speed or bypassing the native stretch guard was not used as a solution.

Only genuinely fresh, unhandled originals receive initial waiting moorings. Old saved
moved poses remain unchanged and receive no silent cable. A reachable moved original can
be explicitly reattached at its current gap. Out-of-reach originals are not replaced.
Break/release/manual custody and drum length are saved by mission+slot, never by durable
entity ID. Continue restores the logical held setting once and requires fresh consent to
wind. Routine sector teardown is distinguished from true damage by retired object identity
and attachment endpoint generations, including recycled IDs and delayed destruction.
Retired-body identity survives production-owner re-initialization until deferred receipts
flush. Re-initialization never turns intentional teardown into damage or repairs true loss.
If true destruction was already queued before re-init, its receipt disables the equipment
and removes any prematurely materialized successor through the retired-body teardown path.

## Ownership and guardrails

- `furnaceIntake.js`: existing consumption owner schedules local scene and capstan controller.
- `furnaceCapstan.js`: owns equipment lifecycle, saved custody and local operator consent.
  It requests canonical attachments and never writes pod motion, receipt or money.
- `combatDefs.js`: one finite infrastructure attachment definition, no player-Line changes.
- `furnaceWorksite.js`: fresh issue layout, real current-position focus and handling advice.
- `furnaceArrivalScene.js`: read projection, nonphysical approach marker, once-per-job scene.
- `contactHail.js` / `furnaceShiftContact.js`: pure offers/responses and Jorah's existing identity.
- Existing Ceres `barContacts.js`, `furnaceDetailConversation.js`, `screens/bar.js`: bounded
  host conversation and actual record. Optional log navigation cannot outlive its visit.

The scanner's existing validated hail ingress is unchanged. Offers bind one request,
anchor object/generation, original pod object/generation, mission, slot, mode and cable.
Choice handling rechecks TTL, current target, sector, range, actual lot and custody, then
consumes consent once before any command. Clear/hide, save restore, new game and sector
exit invalidate pending offers. Original lost/received lots are never replaced.

All seven excluded source paths remain unmodified and absent from the source backup.
No asset/model owner, canonical mission/economy/cargo/ecology/save/physics owner is replaced.

## Acceptance boundaries

Revision 2 tests use real Rapier with deliberately staged outward accelerations. A single
325 WU/s² cone-equivalent holds a 620 WU cable at a peak distance of 637.66 WU. Sustained
820 WU/s² trips held and reeling cables at 1128.75 WU on the 0.5 s owner cadence, rather
than retaining a 190,356 WU cable after 30 s as the withdrawn version did. These are stress
fixtures, not evidence that the earned route encounters the aggregate field ceiling.

The final earned-input run must start from the independently earned Tethys Scale 4 disk
save and exercise board acceptance, paid frag stock, dark lane, keyboard approach, actual
frag inputs, the existing hail controller, real ropes/intake, all three original receipts,
actual 480 cr payment, mid-job and completed title Continue, and physical Ceres return.
The exact native script, immutable overlay hashes and results are retained locally.

Unit/controller tests include explicitly staged malformed, moved, released, broken,
cancelled, lost and recycled-generation cases. These are not alternate piloted endings.
Modeled DOM tests exercise actual controllers but are not browser geometry. The available
browser aborted before opening a page because its singleton socket was denied; repeating
that operation by another route was not attempted. No GPU-rendered approach, mouse-pick
geometry, visible cable mesh, readable on-screen prompt, browser storage integration,
full-game performance or release CI certification is claimed. Those remain acceptance gates.
