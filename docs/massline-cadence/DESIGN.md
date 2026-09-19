# Cadence: commanding momentum, not begging for it

## The diagnosis

The packet's long-run ledger is evidence that the experience is poor, not proof that one
particular gain is wrong. A timeout-driven scripted pilot can fail because the control law is
bad, because it cannot perceive a useful release cue, because targets are absent, or because
all three are true. A 45× seed outcome spread does not identify the cause by itself.

The source does identify four controllable causes:

1. **Ambiguous intent.** The old hold threshold required line intent. Holding and inspecting the
   scene without touching an axis could still become a cut on release. Intent memory then kept
   winding after the player returned to neutral.
2. **Unshaped contraction.** A scalar full-axis command immediately requested the authored full
   reel rate. This made radius contraction a hard switch, not a fine instrument. Abruptly changing
   radius while radial motion dominated could worsen an already poor swing.
3. **An unreliable instrument.** The throw predictor used an inflated target-only angular cone,
   moving-target iteration, and angular extrapolation between samples. The line's angular rate
   is not generally the world velocity heading's angular rate when the center of mass drifts.
4. **An irrelevant score.** Ordinary standard-line strength is deliberately enormous. Physical
   strain is therefore tiny during useful maneuvers. Using strain to judge release technique
   labels a skilled swing “messy,” while a separate cut bonus can reward topology cycling.

These defects are reproduced with frozen baseline code in this package. None needs a damage buff.

## The learned phrase: DRAW → COAST → CUT

**Draw** does work on the tethered pair by shortening its permitted radius. The operator has
fine authority near center and full travel at full deflection. Strong draw is an intentional
request with a bounded response, not a sudden new velocity assigned to either body.

**Coast** is a positive command: hold this length now. It does not mean “continue the last reel
intent for 220 ms.” A stable coast gives the player a readable relation between orbital phase,
exit velocity and a future release aperture. “Coast” does not automatically brake the ship;
engines, fields, collisions and the actual cable still belong to their existing owners.

**Cut** changes topology. The bodies keep the momentum they earned. Manual control always permits
a bad shot; the instrument advises, it does not veto. A short forward-only snap queue makes a
near-correct button press less hardware-sensitive without moving the object toward a target.

The goal is not three mandatory states that a script must obey. Towing, recovery, continuous
aggressive reeling, self-slinging and bad improvisations remain possible. The phrase is a learnable
rhythm through a continuous space of actions.

## 1. Operator response law

The raw axis `a ∈ [-1,1]` is deadzoned and rescaled:

```
u = max(0, (abs(a) - 0.08) / 0.92)
f(a) = sign(a) * (0.30 u + 0.70 u³)
```

This retains a linear component near the center rather than making a pure cubic feel dead.
Keyboard full deflection still reaches full authority. Motor spin-up is limited by
`acceleration = authoredReelRate / 0.12 s`. Returning toward lower authority is a hard ceiling;
neutral stops the spool this tick. Reversal brakes through zero and never executes one more
command in the old direction. Endpoint braking uses `sqrt(2 a distanceToStop)` before the final
hard min/max clamp.

That is deliberately not globally jerk-limited. A player saying STOP wins over a smooth motor
animation. Smooth all braking and one reintroduces the very uncommanded travel being removed.

An early directional intent may be consumed **once** when the hold gesture first activates;
this preserves pre-gesture buffering. It never continues substituting for neutral on subsequent
ticks. A hold of at least 0.16 s cannot become a tap-cut merely because it was motionless.

## 2. Scale-aware draw budget

Let `r` be pair separation, `v_r` radial relative speed, and `v_t` signed tangential relative speed.
Then `ω = v_t / r`. During an explicitly requested orbit, use:

```
drawAuthority = min(authoredReelRate, max(6 WU/s, η |v_t|))
η = 0.32 normally; 0.50 while pump is explicitly held
```

Away from the small take-up floor, this bounds the fractional contraction per swept radian:

```
|d(log r) / dθ| ≈ |dL/dt| / |v_t| ≤ η
```

It makes the operator gesture depend on the swing's own angular progress, not an arbitrary fixed
radius. The six-unit floor preserves deliberate take-up/recovery at low motion. A smooth
recovery factor reduces authority when `|v_r| / max(|v_t|,12)` grows from 0.6 toward 1.8; it never
secretly reverses the spool. Holding pump without reel-in does no extra work.

This is **not** automatic orbit detection that changes towing controls behind the player's back.
The bounded orbital draw path requires explicit `lineControl` and nonzero `orbitDirection`.
Ordinary towing retains the authored spool-rate ceiling with the same precision/ramp/hold law.

For isolated bodies under central internal forces, relative angular momentum is
`H = μ r² ω = μ r v_t`, where `μ = m₁m₂/(m₁+m₂)` is reduced mass. Shortening the orbit can increase
kinetic energy, but that energy comes from winch work, not from cutting. The reduced fixture
checks linear and angular momentum under central forces. Production physics remains authoritative.
`appliedWork` is an estimated diagnostic `tension × inward travel`, not an SI calibration or a
second energy debit. Do not connect it directly to the economy/battery without reconciling the
existing resource owner.

## 3. Contact geometry: ask the right question

For payload and target disks:

```
p = target.position - payload.position
v = target.velocity - payload.velocity
R = target.radius + payload.radius
contact ⇔ exists t in [0, horizon] with |p + v t|² ≤ R²
```

Solve the quadratic for entry and use clamped closest approach for clearance. The cancellation-
resistant entry form avoids subtracting two nearly equal large values. Roundoff tolerance is
scale-relative, not gameplay aim forgiveness. Non-finite/overflowing state fails closed.

This formulation is invariant under uniform world translation and velocity. It handles an
approaching target, a retreating target, a large projectile grazing a small target, and a target
crossing a stationary object's position. It does not need a guessed angle to define a hit.

Constant-velocity contact is cheap enough to refresh every tick. A nominal 15 Hz metadata
cadence remains, but an old sample cannot say HIT after current velocity says MISS. Active-field
paths are swept segment by segment; testing only sampled vertices would let thin targets tunnel.

The model is honest about its assumptions: disk proxies, no obstacle test, current target
velocity, finite horizon, frozen field snapshot when applicable. A green cue is an actionable
model, not an omniscient promise.

## 4. Time is conditional, not an angle divided by wishful thinking

A free-flight ray has no future orbital clock. `timeToSolution` is null for an off-vector plain
ray. The separate coast forecast propagates the measured center of mass linearly and rotates the
pair at measured angular rate. It scans future fixed ticks for the first modeled contact window.

The forecast is withheld for substantial radial motion, slack, active field distortion or an
actively moving winch. Stopping the winch refreshes the forecast immediately rather than waiting
for the next nominal four-tick sample. Entry, exit and width are shown as a time strip. An exit
beyond the forecast horizon is unknown, not a made-up infinitely wide window.

The forecast is **instructional**: “under a settled coast, the window is coming.” Actual release
uses the **current** geometry. Snap queues expire after five fixed ticks and are bound to the
captured attachment and destination. Changing destination cancels, rather than redirects, the
queued shot. There is no backward time window because the game has no release rewind contract.

## 5. Technique is not damage; strain is not skill

Technique uses tangency, meaningful tangential speed and geometric grip. Physical break strain
remains in its original physical units and is still available for equipment warnings. Legacy
classification strings remain for existing feedback consumers, but a new `scoringVersion`
identifies the intentional semantic change.

The current score is approximately:

```
tangency = |v_t| / hypot(v_t, v_r)
readiness = smoothstep(15, 95, |v_t|)
score = tangency * readiness * grip
```

A high score means a fast, largely tangential release technique. It does **not** mean the target
was hit, that the payload is heavy enough to crush a capital ship, or that towing is a bad verb.
The actual impact chain still decides momentum, collision, damage and credit.

## 6. Important negative decisions

No homing. No velocity rotate-to-target. No hidden hitbox inflation. No free self-sling bonus.
No new solver. No rewriting enemies to make the benchmark look good. No claims that fewer
misclassified disk trajectories prove “fun.” No synthetic physics fixture masquerading as the
production Crucible; its boundary is stamped into the source, screen and evidence.

Removing the old 15%-scaled cut bonus is intentionally behavior-changing. A separate cap/shield/
visual slingshot state already present in tetherGameplay is preserved; this component does not
rewrite downstream movement policy. Audit that live path before making a global energy claim.

## 7. The trade-off worth testing

On the shared fixed tape, Cadence draws less line and produces a lower final tangential speed
than the old full-rate contraction. The reduced spring's peak applied tension is also lower.
The new law trades maximum compression of a held-button maneuver for a more legible instrument.
That may be correct for beginner control and wrong for an expert's intended whip. The explicit
pump budget offers a stronger draw, but the constants remain tuning hypotheses.

Do not “fix” the trade-off by multiplying damage. Test manual repeatability and useful payoff,
then adjust the ramp, draw fraction and take-up floor. If experts cannot reach deliberate violent
maneuvers, the instrument has become polite rather than good.

## 8. Three next experiments, not secretly implemented features

**Aperture archaeology.** Record a short ribbon of previous real release vectors and miss distance
in an optional practice chamber. Let the player see that the mistake was 90 ms early, not
“insufficient damage.” Use actual trajectories/contacts, not retrospective homing. No persistent
practice telemetry should enter normal combat unless requested.

**Mass-ratio roles.** Author encounters where a small body is a projectile, an equal-mass body is
a dance partner, and a heavy body is an anchor. Teach the same conservation law through different
roles instead of selling three unrelated tether spells. This requires encounter work, not another
physics writer.

**A meaningful second move.** A hit should leave something intentionally exploitable: a disabled
ship to tow, a fragile opening in a formation, or a path through debris. This ties the mechanic to
its consequence chain without falsifying the first impact. Coordinate with the aftermath/director
work; do not bolt a second reward economy onto this controller.
