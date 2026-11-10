# Live ship contact sheet — outbox import

## What this is

Chase stills of every **packaged live wholeship LOD0** named by
`PACKAGED_LIVE_WHOLE_SHIP_FILES` (from `RENDER_PACKAGE_PILOTS` under
`assets/ships/release/parts/wholeships/`). Read and render only — **no remodel**,
no live GLB writes outside this folder.

For each ship: `play_chase.png`, `play_chase_abeam.png`, `play_chase_close.png`
via `spaceface_chase_camera.py` (D=144 / abeam / D=58) at 1600×900, EEVEE 16
samples, Blender 4.5.14 LTS.

Release meshopt GLBs are not Blender-importable (`EXT_meshopt_compression`).
Stills were rendered from the matching uncompressed mirrors at
`assets/ships/parts/wholeships/<same-filename>` — same live identities as the
packaged map. Evidence and full SHA-256 live in `build-report.json`
(schema `spaceface.vmDrop.liveShipContactSheet.v1`).

Source master tip at job start on this box: `0fd64234a71147fd16f47f7a5f988d30fe758e3f`  
vm-drop tip before this job: `cf8ec23f455d67dd67912a31fc86df0c9ff10503`  
Blender: `Blender 4.5.14 LTS`.

Rebuild:

```sh
blender --background --python design/program/vm-drop/live-ship-contact-sheet/render_live_contact_sheet.py
# or one hull:
blender --background --python design/program/vm-drop/live-ship-contact-sheet/render_glb_chase_stills.py -- \
  --glb assets/ships/parts/wholeships/kestrel.glb \
  --out design/program/vm-drop/live-ship-contact-sheet/stills/kestrel
```

## Ships covered (39 / 39)

| Ship | Slug | Live packaged relative | Stills |
|---|---|---|---|
| Apron shuttle | `apron_shuttle` | `wholeships/apron_shuttle.glb` | `stills/apron_shuttle/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ashline Dart | `ashline_dart` | `wholeships/ashline_dart.glb` | `stills/ashline_dart/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ashline Lode | `ashline_lode` | `wholeships/ashline_lode.glb` | `stills/ashline_lode/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ashline Rig | `ashline_rig` | `wholeships/ashline_rig.glb` | `stills/ashline_rig/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ashline Rig Corsair Blade | `ashline_rig_corsair_blade` | `wholeships/ashline_rig_corsair_blade.glb` | `stills/ashline_rig_corsair_blade/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Atlas | `atlas_production_v1` | `wholeships/atlas_production_v1.glb` | `stills/atlas_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Bastion | `bastion_production_v1` | `wholeships/bastion_production_v1.glb` | `stills/bastion_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Colossus | `colossus_production_v1` | `wholeships/colossus_production_v1.glb` | `stills/colossus_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Drifter | `drifter_production_v1` | `wholeships/drifter_production_v1.glb` | `stills/drifter_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Arclight | `helios_arclight` | `wholeships/helios_arclight.glb` | `stills/helios_arclight/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Cradle | `helios_cradle` | `wholeships/helios_cradle.glb` | `stills/helios_cradle/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Lark | `helios_lark` | `wholeships/helios_lark.glb` | `stills/helios_lark/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Span | `helios_span` | `wholeships/helios_span.glb` | `stills/helios_span/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Span DMC | `helios_span_dmc` | `wholeships/helios_span_dmc.glb` | `stills/helios_span_dmc/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Span MTS | `helios_span_mts` | `wholeships/helios_span_mts.glb` | `stills/helios_span_mts/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Helios Span Reach | `helios_span_reach` | `wholeships/helios_span_reach.glb` | `stills/helios_span_reach/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Hornet | `hornet_production_v1` | `wholeships/hornet_production_v1.glb` | `stills/hornet_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Inspection cutter | `inspection_cutter` | `wholeships/inspection_cutter.glb` | `stills/inspection_cutter/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ironback | `ironback_production_v1` | `wholeships/ironback_production_v1.glb` | `stills/ironback_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Hitch (Kestrel) | `kestrel` | `wholeships/kestrel.glb` | `stills/kestrel/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Leviathan | `leviathan_production_v1` | `wholeships/leviathan_production_v1.glb` | `stills/leviathan_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Massline Express Liner | `massline_express_liner_v1` | `wholeships/massline_express_liner_v1.glb` | `stills/massline_express_liner_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Mule | `mule_production_v1` | `wholeships/mule_production_v1.glb` | `stills/mule_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ore barge | `ore_barge` | `wholeships/ore_barge.glb` | `stills/ore_barge/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Pelican | `pelican_production_v1` | `wholeships/pelican_production_v1.glb` | `stills/pelican_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Prospector skiff | `prospector_skiff` | `wholeships/prospector_skiff.glb` | `stills/prospector_skiff/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Ranger | `ranger_production_v1` | `wholeships/ranger_production_v1.glb` | `stills/ranger_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Repair tender | `repair_tender` | `wholeships/repair_tender.glb` | `stills/repair_tender/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Rescue lifter | `rescue_lifter` | `wholeships/rescue_lifter.glb` | `stills/rescue_lifter/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Salvage cutter | `salvage_cutter` | `wholeships/salvage_cutter.glb` | `stills/salvage_cutter/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Scrap sweeper | `scrap_sweeper` | `wholeships/scrap_sweeper.glb` | `stills/scrap_sweeper/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Survey pin | `survey_pin` | `wholeships/survey_pin.glb` | `stills/survey_pin/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Volatiles tanker | `volatiles_tanker` | `wholeships/volatiles_tanker.glb` | `stills/volatiles_tanker/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Warden | `warden_production_v1` | `wholeships/warden_production_v1.glb` | `stills/warden_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Wasp free militia | `wasp_free_militia` | `wholeships/wasp_free_militia.glb` | `stills/wasp_free_militia/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Wasp MTS escort | `wasp_mts_escort` | `wholeships/wasp_mts_escort.glb` | `stills/wasp_mts_escort/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Wasp | `wasp_production_v1` | `wholeships/wasp_production_v1.glb` | `stills/wasp_production_v1/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Wasp SCN patrol | `wasp_scn_patrol` | `wholeships/wasp_scn_patrol.glb` | `stills/wasp_scn_patrol/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |
| Hawser / yard tug | `yard_tug` | `wholeships/yard_tug.glb` | `stills/yard_tug/play_chase.png` · `play_chase_abeam.png` · `play_chase_close.png` |

## Exact future live paths

None. This drop is pictures only. Do not replace any live GLB, manifest, or
render package from this folder.

## What is not wired / freeze notes

Nothing is wired. No live GLB, manifest, render package, source file outside
this folder, `src/`, `NOW.md`, or `VM_LANES.md` was changed. Hitch/Kestrel and
all other live hulls were read-only.

## Still SHA-256 (prefix)

See `build-report.json` for full digests.

- **Apron shuttle** (`apron_shuttle`): chase `7809484bb334bf3a…` abeam `6550e9740d657ec0…` close `93303f63ba75854d…`
- **Ashline Dart** (`ashline_dart`): chase `784f35e3be65f066…` abeam `d0d69fc8cbfa1d61…` close `0f4b197683d56f48…`
- **Ashline Lode** (`ashline_lode`): chase `8a74782b2be18326…` abeam `af4bf13cf813988f…` close `e0056e9505cd7689…`
- **Ashline Rig** (`ashline_rig`): chase `450a2e82082f7fed…` abeam `2a77bccfce1f13e1…` close `140757a181f1f5a0…`
- **Ashline Rig Corsair Blade** (`ashline_rig_corsair_blade`): chase `40730dd743e93d3e…` abeam `d05b35d759c2d054…` close `bf638ab708620f76…`
- **Atlas** (`atlas_production_v1`): chase `9569ecc4d8cce62c…` abeam `6cecd70d34993bfd…` close `12db6594b636851a…`
- **Bastion** (`bastion_production_v1`): chase `d325135dafa952f0…` abeam `c9a9a3bc279fb6b1…` close `3af425e9bd867d2b…`
- **Colossus** (`colossus_production_v1`): chase `6c7f583ba251c555…` abeam `0896499a0f6339d0…` close `14b05f2350aff83e…`
- **Drifter** (`drifter_production_v1`): chase `aabdb279739206ae…` abeam `73d94121fad4b06f…` close `3b5f4cc14e204db7…`
- **Helios Arclight** (`helios_arclight`): chase `b8a194971f6e9f74…` abeam `9bb1ff6b9df596dc…` close `cdc410a5e243dc9a…`
- **Helios Cradle** (`helios_cradle`): chase `f62e7ee60388c57b…` abeam `db8c7a4088ef5b94…` close `089f2a800f503603…`
- **Helios Lark** (`helios_lark`): chase `17d4bfe7dcf9fb4a…` abeam `0d5af09d4bd0550f…` close `d33b039e796ae2f0…`
- **Helios Span** (`helios_span`): chase `abc923c5cd207214…` abeam `374d7182b6cb42a4…` close `9e52f762bd0a86bb…`
- **Helios Span DMC** (`helios_span_dmc`): chase `056bda878e23f0b8…` abeam `a6c4586978d5f1bf…` close `8564b36a8b505367…`
- **Helios Span MTS** (`helios_span_mts`): chase `67d76b93641caa07…` abeam `5765bcb5f33dd6ad…` close `6aab02c6f0db8d12…`
- **Helios Span Reach** (`helios_span_reach`): chase `d7b4f95a67622a1a…` abeam `877ff5003c30bc64…` close `06418bb06697b473…`
- **Hornet** (`hornet_production_v1`): chase `877c75bbed6b5e4d…` abeam `ce67c26369c1e202…` close `fc4c934ca226ca85…`
- **Inspection cutter** (`inspection_cutter`): chase `c3e7d811c196a767…` abeam `8ab783ce9f4d423a…` close `4a01060daa15ed2e…`
- **Ironback** (`ironback_production_v1`): chase `b58179a0d10fdaf8…` abeam `b6e8b69cb1fda25a…` close `c74fe835b680cd6d…`
- **Hitch (Kestrel)** (`kestrel`): chase `9cbc4b3d84751844…` abeam `507314ace35fed69…` close `12746e1c0b070477…`
- **Leviathan** (`leviathan_production_v1`): chase `3a4dbd2be51614c8…` abeam `1e9ae14128e06fb8…` close `a33e7829ae58b836…`
- **Massline Express Liner** (`massline_express_liner_v1`): chase `8c80d5f1e00b7864…` abeam `64d33655fcbe6b47…` close `63aaa065ef5c0c5e…`
- **Mule** (`mule_production_v1`): chase `378bb94d0c062852…` abeam `2e12c3edafc345ca…` close `aa6b26e17aeefd56…`
- **Ore barge** (`ore_barge`): chase `b795eefc6138ed2c…` abeam `ad82b78a5158d62c…` close `1fdd15b915471a8a…`
- **Pelican** (`pelican_production_v1`): chase `b794ec00e5e1ecc2…` abeam `bc147eb304a8e474…` close `f1e22b6643156344…`
- **Prospector skiff** (`prospector_skiff`): chase `de997d58fd49f3df…` abeam `43a2478f21d0d3ab…` close `7acdb82de1ba6ddb…`
- **Ranger** (`ranger_production_v1`): chase `848ac1f0aac88d26…` abeam `b4e280d4a0674f3c…` close `2bceed1de39a9d31…`
- **Repair tender** (`repair_tender`): chase `5cfd8d6cb1690bd7…` abeam `210e0b431889deeb…` close `0693559b2b354a48…`
- **Rescue lifter** (`rescue_lifter`): chase `8a78f724b905884f…` abeam `6c864bca45372329…` close `e0fafd508a8cf46c…`
- **Salvage cutter** (`salvage_cutter`): chase `7a5feae778d98311…` abeam `279819414ce2045c…` close `d10e6d5742035160…`
- **Scrap sweeper** (`scrap_sweeper`): chase `c9f33bda5e5bbdae…` abeam `f49ab4815053c4dd…` close `aa36f4c19d649fdd…`
- **Survey pin** (`survey_pin`): chase `55bcbf5e6d68219a…` abeam `144ea9bf98a418a1…` close `2c5e1f6bc8ef648f…`
- **Volatiles tanker** (`volatiles_tanker`): chase `979279db8777d5eb…` abeam `cd539df03bf7c7dc…` close `3d03ab6cdb46b3a0…`
- **Warden** (`warden_production_v1`): chase `b530249fbf490a20…` abeam `143614461b2da56f…` close `0eaeacf9b85d7e69…`
- **Wasp free militia** (`wasp_free_militia`): chase `4b4b9ec8b3009cfa…` abeam `205f960e4b0a65a1…` close `2f9cd5dda56a5d81…`
- **Wasp MTS escort** (`wasp_mts_escort`): chase `244dadec06222f40…` abeam `b00ee7ad9a990026…` close `9fcf2638f2b75c1e…`
- **Wasp** (`wasp_production_v1`): chase `43f1e93d6091384a…` abeam `76d802896d9c02f8…` close `806277d9b2973c5c…`
- **Wasp SCN patrol** (`wasp_scn_patrol`): chase `da4b59edbf3dc80a…` abeam `8c48422b52f810ec…` close `8bd64275992fedc2…`
- **Hawser / yard tug** (`yard_tug`): chase `a876a2e0cfa19379…` abeam `f4539f57ada703b7…` close `ff5a5e6bbbf6f3ad…`
