# SF20-19 final bounded independent behavior/consumer review

**Verdict: no remaining material findings in the reviewed behavior and consumer scope.** This supersedes the open findings in `REPORT.md` for the exact source hashes below. It is not browser/GPU/visual acceptance or a full SF20-19 completion claim.

## Reviewed source identity

- survivalDraft: `1212a5720ac9c10ecc0a28ecb59d8f744a10dbecbae19780680efc94f850cefa`
- crucibleDraft: `25ab63b155075c653f2a7aac9a50371f34af4f70b49cf1eec16ffd71f00107bf`
- crucibleArmory: `c3759e39b1f47946e7cf15f233acbf6a884e8b38a201a5bda0d01d008705ae1e`
- cruciblePreparationLayouts: `1d18b8621f7d179c22e3af3436734f94001aec3e59ba18961334ba50fbe5fa3b`
- pipSpannerCrew: `f4c15323ffa823f8d8342b2d9210dcf532fab9945c7f1bed930ff343ccd80c76`
- pipSpannerPreview: `b031af2d5f1af8cfd909088d60979907696621aa461f0b4cc28e22849a6cb76a`
- Current repository runSession preimage: `47f1d25ab7653f09151b76f6a5572f1deaa5e37f45d826151c11bff72e24cdf6`

`final-source-sha256.txt` contains exact paths. The reviewer did not alter any candidate or repository source.

## Fresh verification

1. **104/104 owner and existing related tests passed**: `final-composed-owner-tests.log`
2. **31/31 UI, mounted-screen, and preparation tests passed**: `final-ui-31.log`
3. **13/13 reviewer test entries completed successfully**: `final-adversarial-tests.log`. Eight are direct consumer/rollback assertions; five are diagnostic probes whose emitted outcomes were independently inspected. The owner suite includes assertion-based coverage of those same preparation and target invariants.

The final runs use `final-overlay.mjs`, which preserves the *current* integration checkout's runSession, including its newer `transferRunLifetime` changes, and adds only the two conditional transaction-ID echo fields in memory. This avoids treating the older wallet proposal snapshot as the latest shared source. The loader overlays the candidate UI/behavior and writes no source. Root still owns merging the two lines and verifying the composed result after integration.

## Findings closed

- Same persistent Install control cannot double-click into an automatically selected second item; a completed selected row remains unarmed until explicit selection changes
- Synthesis PENDING precedes mutation, recursive preparation purchases are locked out, and interrupted conversion restores original mounted instances through the ships owner
- Callback-driven run/player replacement is checked around each rollback mutation, preventing old run instance IDs from fitting into a replacement campaign player
- An active hull/repair-entity change interrupts forward synthesis; it cannot accept a receipt naming a different mount
- A retired refund does not write its notice into a newly started armory
- Post-debit validation rejects changed quote inputs and same-ID or different-ID repair-entity replacement
- Current nonpurchase refusals remain visible, with a separate scoped accepted receipt preserving exact item/mount/amount
- Receipt choreography is scoped to run, wave, armory generation, and actual current result, so previous repairs/fittings cannot masquerade as current acceptance
- Late detached hull-image failures cannot replace newly selected equipment art
- Skipped/lost compilation retains the usable schematic rather than promoting a blank authored canvas
- Hiding the armory during PENDING prevents terminal notifications and purchase tails from stealing next-screen focus

Preserved contracts observed in tests/source include synchronous legacy callers, exactly-once correlated purchase settlement, stale requests, no-receipt uncertainty (`charged: null`), immediate launch, zero simulation-clock advancement, a real milestone repair, close/reopen state re-read, reduced-motion/flash and hidden-tab behavior, and generation-guarded preview loading/disposal. No alternate wallet, inventory, physics body, or asset-loading owner is introduced.

## Remaining evidence boundaries

- No browser or actual GPU was run; no screenshot, pixel quality, compiled-driver lifetime, or visual-performance claim
- Keyboard/gamepad evidence is real screen/control code over a DOM platform fixture, not a physical-device session
- Campaign isolation is covered by focused resource and owner-lifetime fixtures, not a complete campaign-save restore playthrough
- The parent's actual-GLB reconstruction/art review is separate evidence and was not relabeled as performed by this reviewer
- Aggregate repository/release checks and the final integrated commit remain the integration owner's responsibility

The review was intentionally bounded to the submitted owner/consumer implementation and directly related regression fixes. Broader unrelated systems were not certified.
