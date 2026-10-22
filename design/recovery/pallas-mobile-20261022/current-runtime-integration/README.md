# Current Pallas runtime integration recovery

Recovery only, not runtime publication or deployment. These 15 base64 chunks reconstruct pallas-runtime-integration-20261022.zip: 1,441,825 bytes, SHA256 40274b742e78621a0a5034348ea193e1c04bcfdde26451cb6bad6b67491224fb.

Download this directory, then run `python reassemble.py`. It checks every encoded/decoded chunk hash and the complete archive hash before extracting the guarded restore tool. Run the printed verify command. `restore.py ARCHIVE.zip --extract EMPTY_DIRECTORY` independently reconstructs all 69 exact outputs; `--apply CLEAN_CHECKOUT` checks every changed base blob before writing. Do not blindly extract archive contents over a checkout.

The ZIP contains 69 exact source/model/test outputs, portable manifest, restore tool, sanitized handoff, independent review outcomes and plain success logs. It contains no generated native state captures. The default native run passed 12/12 without capture files or state payload stdout. Full scoped checks: 41 focused, 66 generic renderer, 12 native, 2 asset and 3 latest-upstream pause tests passed. Original tests and finite native simulation guards are preserved.

Validated runtime tree: cf901b22a799323cc73b5f22e5b5c5b1dbf3a065. Public base: 065f9d293e036cc92040657d2923f0477932e3cd. Ordered public parents for the existing open PR488 are e7f6122f8d8f2985223940bfbb60eb4f66272561 and 065f9d293e036cc92040657d2923f0477932e3cd. No private ancestry. Source-equivalence proof from tested 53e master to 065 master is included. Runtime delivery, missing upstream HUD modules and browser/phone acceptance remain separate open work.
