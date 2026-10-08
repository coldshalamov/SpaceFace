# schemas/

JSON Schema for combat documents (actions, attachments, profiles, traces, damage packets, statuses, subsystems).

- These describe payloads. They do not run the sim.
- A schema change that alters a serialized field needs the save or combat owner and a focused check. Do not silently widen a packet the kernel already hashes.
