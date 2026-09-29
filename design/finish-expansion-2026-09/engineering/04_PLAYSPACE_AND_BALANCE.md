# Designing for how SpaceFace actually moves

## Use a current reference flight, not cinematic intuition

The shipping game is planar motion seen through an oblique top-down camera. Objects can move much faster after a sling or shove than nominal cruise. A mission that looks spacious in a static editor may become an unreadable blink in flight. Current V3 movement, the speed-normalized Feel Contract and actual camera projection therefore define the scale of every scene. [S07–S09, S12, S22]

Before staging a scene, measure the selected reference hull's radius, ordinary cruise, boost/earned-speed range, acceleration/braking behavior and turn radius at the relevant speed. Read the current visible playfield depth and hull footprint at the shipping camera. Record the same values for the mission workpiece and heaviest expected opponent. These measurements are local design inputs, not a new global set of physics constants.

## Quantities that make geometry concrete

Let D be current visible playfield depth along the important approach, R_turn the measured turn radius under the intended control state, r_p the player proxy radius, and v_close the relevant relative closing speed.

**Time to contact:** for a roughly straight short approach, available warning time is approximately clearDistance / max(v_close, epsilon). Use it to determine whether a threat can be noticed and countered before impact. High earned speed legitimately shortens that window, but authored ingress should not appear inside unavoidable contact range.

**Turning space:** a route designed to require a full reversal cannot assume it fits inside one hull diameter. Compare its available lateral/longitudinal room with the actual R_turn and current camera. Tether-assisted turns may permit a different radius; demonstrate it with the real anchor rather than assuming a new handling law.

**Catch space:** a receiver must accommodate the actual workpiece, player offset, coupling swing and correction margin. If a tight fit is the challenge, give an alignment mechanism or a safe retry. A visible huge bay that rejects because its trigger is tiny is a bug, not skill.

**Release runway:** a sling exit must leave enough distance to deliberately brake or turn before a required docking interaction. Retain earned speed; do not insert a secret speed clamp to make a cramped scene work.

**Field exposure:** a field encounter is determined by time spent in the active volume and strength over that path, not just its visual radius. Test a fast grazing crossing, slow center crossing and stationary actor. The apparent boundary must match the authority's true influence.

## Three mass scales in a reference scene

Use one light object that the player can decisively displace, one comparable object that loads the coupling, and one heavy anchor that mostly moves the player. Reuse actual current masses. This teaches the physical vocabulary naturally and gives VFX/audio a meaningful contrast. It is better than a room of equally weighted objects wearing different meshes.

Keep the light object durable enough to be used where that is the point. If it explodes from every incidental graze, the player never gets to throw it. Conversely, an indestructible useful wreck can become exploitative permanent armor. Durability and retention must be tuned for the actual scenario and current material rules.

## Skill windows and readable commitment

Threat preparation, action commitment and recovery should be explicit. Proposed prototype timings are not universal requirements: start with windows that allow observation and one normal input sequence, then test actual novices and experienced pilots. Avoid constantly cancelling attack tells because a target confidence score flickers; use current hysteresis/commitment mechanisms.

Control denial needs a recovery route. Multiple sources should not create an indefinitely renewed lockout merely because each individual effect is short. Preserve the current common hitstun/tumble law and deliberately test overlap before adding new adhesive or machine denial.

## Weapon and tool balance

A tool's value includes positioning, setup time, energy/ammo cost, target eligibility, risk, recovery and utility—not only damage per second. A goo sprayer should not replace Tarburst and every gun simultaneously. A pressure sac trades placement and delay for torque. A machine field can be powerful but requires access, finite geometry and source continuity.

For each selected item, compare: straightforward gun route; physical setup route; escape or noncombat route. Measure time, consumed resources, damage taken, cargo condition and success consistency. Keep those as route observations, not a universal score. Reject a device that is merely a strictly better old tool at negligible cost.

## Difficulty and reward

Escalate problems: a heavier anchor, more valuable fragile freight, a specialist with a clear tell, a less forgiving route, a second duty such as rescue. Do not default to multiplying enemy health. Reward meaningful outcomes and skill without requiring a narrow designer-recognized combo taxonomy to earn viable money.

Evaluate net earnings after repair, ammunition, travel and learning overhead. A dramatic mission payout can still be a bad progression experience if the required gear costs more than the entire accessible income loop. Recovery work should remain available when a pilot has failed, without becoming an infinite refund exploit.

## Asset scale and readability

The on-screen object must explain its proxy and interaction. Very thin filaments may remain cosmetic while a readable main tendon carries force. A huge translucent membrane needs substantial internal form and an honest extent. A robot's tiny needle tool is not enough to communicate a large workpiece operation; frame its function with body pose, field source and sound.

Every proposed mission brief must be staged and retested with these current measurements. This is how the imaginative premise becomes a playable SpaceFace scene rather than an attractive paragraph.
