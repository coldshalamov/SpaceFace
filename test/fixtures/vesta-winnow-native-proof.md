# Optional Winnow native diagnostics

These are opt-in diagnostics, not default tests or CI. They run the production
runtime with actors, ordinary hazards, machinery and native physics active.

## Scope

The initial stage forces encounter eligibility, clears the authored raiders through
the real combat owner, and places the player before native motion. Those are
scenario setup, not ordinary arrival or keyboard-combat proof. After setup,
player towing, flight and release use normal input controls. No cargo/carrier
pose, velocity, collision or immunity override is used. Collection still requires
actual native contact, matching velocity, released player line and existing calm;
Forge acceptance still uses the real receiver gate and one economy authority.

The revisit diagnostic starts from a genuine pre-berth Save. It observes the real
stock write, checks duplicate receipts and three Continue cycles, then exercises
actual sector lifecycle exit/return. That is not a gate-travel proof. A final
player-only position setup puts the Hail presentation in range after settlement
and lifecycle checks; it does not move cargo or the carrier.

## Commands

From the repository root, after normal project dependency installation:

```sh
proof=$(mktemp -d)
VESTA_PROOF_DIR="$proof/01" VESTA_STOP_STAGE=admitted \
  node test/fixtures/vesta-winnow-assisted-hold-diagnostic.mjs > "$proof/01.log" 2>&1
VESTA_PROOF_DIR="$proof/02" VESTA_STOP_STAGE=transport \
  VESTA_RESUME="$proof/01/admitted.json.gz" \
  node test/fixtures/vesta-winnow-assisted-hold-diagnostic.mjs > "$proof/02.log" 2>&1
```

Each stage is bounded to160 simulated seconds. `CHECKPOINT transport` means
actual custody succeeded; `STALL` or `BOUNDED_END` is not success even if the
process exits normally. Preserve the output and inspect the cause. A legitimate
bounded checkpoint can be resumed using its saved path, the same desired stage,
and a fresh output directory; do not restart the episode or edit the Save.

After `transport.json.gz` exists, continue that exact file with
`VESTA_STOP_STAGE=berth`, again using a fresh output directory. Then either continue
its `berth.json.gz` with `VESTA_STOP_STAGE=delivered`, or run the final assertion
probe:

```sh
VESTA_RESUME=/absolute/path/to/berth.json.gz VESTA_PROOF_DIR="$proof/revisit" \
  node test/fixtures/vesta-winnow-revisit-diagnostic.mjs > "$proof/revisit.log" 2>&1
```

The final probe requires `VESTA_RESUME` and prints
`PASS_NATIVE_RECEIVER_CONTINUE_REVISIT` only after its assertions pass. Both
scripts use a fresh OS temporary output directory when `VESTA_PROOF_DIR` is
omitted. Keep Save files, logs and their hashes together. No credentials,
publication or external execution environment is needed.

## Recorded bounded result

The reviewed original-source run admitted the original Tann after genuine prior
work completion at47.6667s. Real player release occurred in calm at270.4s;
native contact transferred one original2u pod at286.05s. Transport Continue
reached the pre-berth Save at305.15s; berth Continue accepted at310.1167s.

Final-source receiver verification observed exactly+2 Copper stock once, four
matching receipt retries with zero extra stock/credits, and one original Tann
world identity through three Continues and a sector revisit. Existing worker
STATUS then reported10u original,2u Forge accepted and8u loose. This is one
optional recovery route, not full-batch recovery or P08 normal production.

Known separate limitation in the tested baseline: repeated Continue accumulated
alive, co-located Forge/Yard station aliases. Diagnostics record them without
cleanup. The focused cargo route result is not whole-world Save/Continue
acceptance; that baseline issue remains a separate repair.
