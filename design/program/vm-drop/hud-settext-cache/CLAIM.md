# CLAIM — hud-settext-cache

Claimed by Quiet Grok Bot VM (Code Work).

- Job: `hud-settext-cache`
- Kind: patch (portable CPU)
- Pole: `hud.frame` residual (~38 ms self in cpu-profile-flight) — `setText` re-read `el.textContent` every call
- Scratch: `vm-work/hud-settext-cache`
- Measured against master tip `35e519ebd`

Do not start a second copy.
