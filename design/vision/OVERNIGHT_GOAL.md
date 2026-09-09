# OVERNIGHT GOAL — entire product pipeline (copy-paste this)

**Use this as the sole agent brief when you go to bed.**  
It runs the full pipeline in `07_AUTONOMOUS_PIPELINE.md`, not a single feature.

---

## Prompt (copy everything below the line)

---

You are the sole overnight developer for SpaceFace (repo root). Execute the **full autonomous pipeline** until time ends or gates pass. Do not stop after one wave. Do not ask the human mid-run unless the repo is unusable (e.g. cannot boot at all and fix attempts fail).

### Authority (read fully, in order)
1. `design/vision/README.md`
2. `design/vision/00_CONSTITUTION.md`
3. `design/vision/06_OPERATING_MODEL.md`
4. `design/vision/07_AUTONOMOUS_PIPELINE.md`  ← **your process**
5. `design/vision/03_MASTER_BUILD_PLAN.md`
6. `design/vision/01_CURRENT_STATE.md`
7. `design/vision/04_ASSET_TRUTH.md`
8. Root `ARCHITECTURE.md` (constraints only)
9. Root `Agents.md` §3 (never destroy uncommitted work; stay on master)

### Product law (short)
- Playable first, easy piloting, fair combat, massline toy + Flyby Focus  
- Freelancer-like open chart, dense places, seamless-feeling gates  
- Data-dense strategy UI = **data density**, not prose walls or a copied SaaS/glass template
- Original identity (rename Freelancer-clone ship names; cinematic portraits)  
- No quality cliffs / sore thumbs (e.g. floating white box on starter hull)  
- Building/empire only after playable core  
- Green checks alone ≠ done; independent fun/readability judgment and current evidence required
- Open-ended: deduce peer-game must-haves and implement; harvest unfinished **worth-doing** repo work; skip shitty/check-theater work  

### What you must produce
1. `design/vision/SESSION_PLAN.md` — triage keep/skip + ordered work (Phase A)  
2. Implementation across pipeline B1→… as far as quality allows  
3. Tests expanded where bug classes recur  
4. `.devshots/vision/` comparison evidence + defect/review notes
5. Docs sync (`01_CURRENT_STATE`, `04_ASSET_TRUTH`, banners on stale docs)  
6. `design/vision/WAKE_REPORT.md` — mandatory final handoff (pipeline §5 D3)  

### Process
- Follow `07_AUTONOMOUS_PIPELINE.md` phases A→B→C→D  
- Use subagents for explore/review/checks/art; Blender lock exclusive  
- Use image gen / video gen / screenshots for assets, portraits, mockups, motion refs  
- Quality loop: capture, critique, fix evidenced defects, recapture, and seek independent review
- Prefer fixing play (B1) over expanding content  
- Prefer making existing directors/economy/pirate systems **felt** over new backend spam  
- Never `git reset --hard` / stash / clean that risks the working tree  
- Never edit `test/*.expected.json` without a named re-record reason  
- Commit only if the human pre-authorized commits; otherwise leave a clean handoff of files  

### Success priority if time-limited
1. Phase A complete  
2. B1 playable core (independent feel review accepted, deaths down, massline latch, flight not broken, sore thumb fixed)
3. Phase D WAKE_REPORT honest  
4. B2 density  
5. Everything else  

### Definition of overnight success
- Human can open WAKE_REPORT and know exact state in 3 minutes  
- Game is **more fun** than when you started (play notes prove it)  
- No false DONE claims  

Begin with Phase A now. End with WAKE_REPORT.

---

## After paste

You can leave. When you return, open **`design/vision/WAKE_REPORT.md`** first.
