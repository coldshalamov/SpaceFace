# Kestrel V6 `DIE LAUGHING` stencil review

- **Candidate:** `kestrel-material-truth-v6`
- **Production blend SHA-256:** `3B4AD8D971555E78FF3B92EDB03081853BB35CA889112F9F337D3EF244D49987`
- **Reference study SHA-256:** `EB4CA35AE6B22817037FA7717C7C9CACEEEAB65965730F7F388A7FE5E5036ECF`
- **Evidence renderer SHA-256:** `F0AFE351CAECEB9E31BAF164D0311917F44E5BD7DC3A62E021686E335F690D67`
**Disposition:** keep as the offline marking candidate; runtime, transition, cost, and human G7
acceptance remain open.

## Fiction-development agreement

`DIE LAUGHING` is the crew's gallows-humor ship name. It was sprayed through a rough hand-cut
two-line stencil on the accessible aft port armor course after the plate entered the crew's service.
It is dirty warm-ivory paint over a ceramic-rich armor coating, with missing-paint gaps, chipped
edges, and sparse localized overspray. It is not an inventory label, a projected texture, a neon
sign, a raised nameplate, or a copied album graphic.

The implementation is two one-sided conventionally authored meshes:

- `V6_HeroMark_DieLaughing`: detail 0, retained through LOD2;
- `V6_HeroMark_DieLaughing_Wear`: detail 2, LOD0 only.

Both conform to `V6_ShoulderArmor_Port_Aft`. The main layer's measured normal offset is
`0.000299993–0.000300008 m`. It has no sidewall or bevel. The generated image is reference-only;
no generated pixel is sampled by the candidate.

## Evidence

| View | SHA-256 | What it proves |
|---|---|---|
| `kestrel_stencil_normal_threequarter.png` | `C35D567E796CDBDEDD2F91DEE1CC9EA89E32D943F5300CCC295DBC51C79FF86B` | The new marking reads at the hero camera without changing the Kestrel silhouette or becoming the ship's dominant mass. |
| `kestrel_stencil_orthographic_close.png` | `42F376EF7A2259E788D8D7310048AFA82D6396DDFD0E3D19C82784D0A2208ABE` | The original stencil typography, bridges, missing-paint breaks, armor fasteners, and hatch-safe placement are inspectable. |
| `kestrel_stencil_grazing_close.png` | `BBF4975E894A01E03C48AD680404B584BBBEB7ECDF8F30CDCE9D37A18854FB99` | Hard lateral light shows no beveled plaque, floating block letters, or thick plastic sidewall. |
| `kestrel_stencil_clay_close.png` | `634802D87FE0AF3D57413D4740BFC94EAC9F1811E0907204B5DDF60F644CDA06` | With a single clay override the paint layer disappears into the armor plane, confirming that typography is not being carried by bulky replacement geometry. |

## Review verdict

- The asset remains unmistakably the same Kestrel: pressure body, outriggers, drive, dorsal
  equipment, repair-green hardware, and bow weapon architecture are retained.
- `DIE LAUGHING` now reads as a specific crew identity with hand-cut protest-punk energy rather than
  the former literal `BORROWED` inventory label.
- The marking is subordinate to the ship's construction and does not erase the armor's inspection
  logic.
- The build contract keeps the wear layer out of LOD1/LOD2 while preserving the identity layer.

This is an offline visual and technical checkpoint, not promotion. The live runtime asset and
manifests are unchanged. Browser/Electron normal-route capture, 120/45-pixel transition evidence,
representative cost, exact live promotion, and independent human G7 remain required.
