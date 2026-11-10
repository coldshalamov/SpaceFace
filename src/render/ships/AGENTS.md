# src/render/ships/

Procedural hulls and the damage-state picture. The GLB link is `partsLibrary.js` (`WHOLE_SHIP_FILE_BY_DEF_ID`), release parts by default. This folder is the fallback body and the damage-state driver.

- +X forward, +Y up, +Z starboard. The renderer sets `rotation.y = -entity.rot`.
- `damageStateFor` is visual. Destroying the entity is the sim death path.
- `kestrelDamage.js` and `shipDamage.js` stay threshold-identical (`check-kestrel-damage.mjs`).
- The per-frame closure is `mesh.userData.updateDamageState`. No global, no per-frame allocation.
- Do not hide the core silhouette in critical. Destruction is hull at or below 0 only.
