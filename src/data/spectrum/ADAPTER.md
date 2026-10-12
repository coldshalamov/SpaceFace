# Spectrum live adapter

The registered system runs after scanner in browser and Node. Ordinary Adventure sector entry selects the next unfinished survey in Helios, Ceres, Tethys or Vesta. Twelve cases materialize existing authored relay, rack and armor-slab assets as real physics entities. Bearings, occlusion, moving sources and reflector edges use their current live poses. Orbital motion queues physical impulses.

The first real player scanner pulse produces a manual `signal:scanResults` row after the scanner's ordinary batch. Its `pos` is the observer; bearing, uncertainty, return key and motion class are public. The source pose is private until a fix is earned. `signal:investigate` emits a manual observation and never plots a course or grants scanner research payout.

For the existing prompt deck, offer one focus choice per `row.spectrum.tracks` entry, labelled with its public `key`, `motionClass` and optional `chartLabel`. The choice emits `spectrum:focus` with `{ key: track.key }`. This makes classification and multiple-return cases reachable without a separate screen. Always draw from `state.spectrumPublic` (the worker mirror), never the authoritative `state.spectrum` model.

Brake uses existing raw/action brake input. Towing observes active existing Massline attachments and at least 16 WU of real relay displacement; `spectrum:tow` coordinate intents cannot move a live body. No tetherGameplay hook or secondary joint owner is required.

Save calls the system's `serialize()` / `deserialize()` before sector entry. The wrapper includes archived posterior samples, completed cases, current physical poses/velocities and retired-body markers. Sector exit clears the public view and removes owned bodies; returning resumes an unfinished case or advances to the next. Destroy releases listeners and bodies.

Do not add a research grant, fixedPos, course event, hidden-emitter marker, or native object to the public view. Completion emits `spectrum:resolved` once and records the case journal.
