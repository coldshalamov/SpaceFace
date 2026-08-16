<!-- LIFETIME: DURABLE -->
# 33 — WEAPON VFX & AUDIO IDENTITY: know the gun by its light

`vfxProfiles.js` + `audioRecipes.js` own seams. Standard: mid-fight, the player identifies
every weapon in play — theirs and the enemy's — by sight and sound alone.

| Weapon family | Projectile read | Muzzle/impact | Sound character |
|---|---|---|---|
| Pulse laser | Crisp cyan bolts, slight afterimage | Small lens flare at muzzle; flat ripple on shields | Snappy *tak* ladder |
| Autocannon | Amber tracers with travel time honesty | Recoil puff; spark fountain on armor | Mechanical chatter |
| Railgun | White-hot streak + expanding ring at muzzle | Piercing line flash on hit | Coil whine → *crack* |
| Plasma | Fat green glob with smoke trail | Gooey splash that clings a beat | Wet *whump* |
| Missiles | Corkscrew smoke, burning motor | Proximity airburst ring | Launch *thunk*, distant rumble |
| Beam | Sustained column, heat shimmer at both ends | Contact point spalls and glows | Rising hum you can *aim* |
| Concussion | Visible shockfront slug (distortion shell) | Big radial dust ring on impact, tiny damage flash | Deep *boom*, felt not heard |
| Vector mine | Slow lob, arming blink | Perfect sphere shockwave, zero fire | Sub-bass *whump* |
| Flak/PD | Stutter-puffs along intercept line | Airburst popcorn | Typewriter |
| EMP/RCS/Grav-marker | Purple/blue spark-net | Status web clings to hull for its duration | Electric buzz |

## Rules

- **Enemy weapons get the same language** (tinted by faction palette, 17) — readability is
  symmetrical.
- Muzzle flashes are the only event lights in normal combat (perf: bounded light count,
  intensity-only animation — see PERF plans; never add/remove light objects mid-fight).
- Travel time honesty: projectiles look as fast as they are. A slow slug *reads* slow.
- No VFX may obscure the victim's tumble state (02) — explosions frame the body, never hide it.

## Acceptance

- Human gate: muted capture → owner IDs weapon families by sight; blind capture → by sound.
