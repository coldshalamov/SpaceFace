"""Capture deterministic lifecycle frames from the diagnostic gameplay VFX lab."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".devshots" / "vfx-gameplay-demo"
URL = "http://127.0.0.1:8769/scripts/vfx-gameplay-demo.html"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=URL, help="Lab URL served by the existing game server")
    parser.add_argument("--scenario", action="append", help="Capture one scenario; repeat to select several")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--context", choices=("near", "close", "wide"), default="near")
    parser.add_argument("--view", choices=("normal", "wide", "close"), default="normal")
    parser.add_argument("--reduced-motion", action="store_true")
    parser.add_argument("--reduced-flash", action="store_true")
    parser.add_argument("--no-bloom", action="store_true")
    parser.add_argument("--all", action="store_true", help="Capture every scenario exposed by the page")
    parser.add_argument("--output", type=Path, help="Output directory (defaults to a timestamped folder under .devshots)")
    parser.add_argument("--video", action="store_true", help="Assemble a labeled phase-reel MP4 from captured lifecycle PNGs")
    args = parser.parse_args()
    output = args.output or (OUT / time.strftime("%Y%m%d-%H%M%S"))
    output.mkdir(parents=True, exist_ok=True)
    errors: list[dict[str, str]] = []
    report: dict[str, object] = {
        "diagnostic": True,
        "url": args.url,
        "viewport": {"width": 1600, "height": 900},
        "seed": args.seed,
        "context": args.context,
        "view": args.view,
        "accessibility": {"reducedMotion": args.reduced_motion, "reducedFlash": args.reduced_flash},
        "bloom": not args.no_bloom,
        "scenarios": {},
        "errors": errors,
    }
    image_paths: list[Path] = []

    def record_error(kind: str, message: str) -> None:
        errors.append({"kind": kind, "message": message})
        print(f"{kind}: {message}", flush=True)

    with sync_playwright() as playwright:
        print(f"Loading {args.url}", flush=True)
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        page = context.new_page()
        page.on("pageerror", lambda exc: record_error("pageerror", getattr(exc, "stack", None) or str(exc)))
        page.on("console", lambda msg: record_error("console", msg.text) if msg.type == "error" else None)
        page.on("requestfailed", lambda req: errors.append({"kind": "requestfailed", "url": req.url, "message": req.failure or ""}))
        page.on("response", lambda response: errors.append({"kind": "http", "url": response.url, "status": str(response.status)}) if response.status >= 400 else None)
        try:
            page.goto(args.url, wait_until="commit", timeout=30000)
            page.wait_for_function("window.__vfxDemo?.ready === true || window.__vfxDemoError || window.__vfxDemo?.error", timeout=60000)
        except Exception as exc:
            errors.append({"kind": "ready-timeout", "message": str(exc)})
        try:
            ready = page.evaluate("window.__vfxDemo?.ready === true")
            startup_error = page.evaluate("window.__vfxDemoError || window.__vfxDemo?.error || null")
        except Exception as exc:
            ready, startup_error = False, str(exc)
            record_error("page-state", startup_error)
        report["ready"] = ready
        report["startupError"] = startup_error
        if ready:
            page.evaluate("window.__vfxDemo.pause()")
            page.evaluate(
                "({seed,context,view,motion,flash,bloom}) => {"
                "document.querySelector('#seed').value=String(seed);"
                "document.querySelector('#context').value=context;"
                "document.querySelector('#view').value=view;"
                "document.querySelector('#motion').checked=motion;"
                "document.querySelector('#flash').checked=flash;"
                "document.querySelector('#bloom').checked=bloom;"
                "window.__vfxDemo.state.settings.video.motionReduce=motion;"
                "window.__vfxDemo.state.settings.video.flashReduce=flash;"
                "window.__vfxDemo.draw();"
                "}",
                {"seed": args.seed, "context": args.context, "view": args.view,
                 "motion": args.reduced_motion, "flash": args.reduced_flash, "bloom": not args.no_bloom},
            )
            catalog = page.evaluate("({scenarios:window.__vfxDemo.scenarios,timeline:window.__vfxDemo.timeline,assets:window.__vfxDemo.assetInfo})")
            report["assetInfo"] = catalog.get("assets")
            report["canvas"] = page.locator("canvas").evaluate("c => ({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})")
            report["gpu"] = page.evaluate("() => { const gl=window.__vfxDemo.renderer.getContext(); const ext=gl.getExtension('WEBGL_debug_renderer_info'); return ext?{vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}:{renderer:gl.getParameter(gl.RENDERER)}; }")
            requested = args.scenario or (catalog["scenarios"] if args.all else ["explosion", "well", "singularity", "repair"])
            known = set(catalog["scenarios"])
            for scenario in requested:
                if scenario not in known:
                    errors.append({"kind": "scenario", "message": f"Unknown scenario: {scenario}"})
                    continue
                selection = page.evaluate("id => {window.__vfxDemo.select(id);window.__vfxDemo.pause();return window.__vfxDemo.weaponOwner.inspect().samples;}", scenario)
                weapon_samples = selection if isinstance(selection, dict) else {}
                phases = sorted({float(value) for value in weapon_samples.values() if isinstance(value, (int, float))}) if weapon_samples else catalog["timeline"].get(scenario)
                phases = phases or [0.12, 0.48, 1.15, 2.35, 3.75]
                print(f"Capturing {scenario}: {len(phases)} fixed-step phases", flush=True)
                frames = []
                for phase in phases:
                    state = page.evaluate(
                        "t => {window.__vfxDemo.pause();return window.__vfxDemo.sample(t);}",
                        phase,
                    )
                    image = output / f"{scenario}-{phase:05.2f}s.png"
                    page.screenshot(path=str(image), animations="disabled")
                    image_paths.append(image)
                    frames.append({"phase": phase, "image": image.name, "state": state})
                report["scenarios"][scenario] = frames
            report["runtimeErrors"] = page.evaluate("window.__vfxDemoError || window.__vfxDemo.errors || []")
        else:
            report["loadError"] = report["startupError"] or page.locator("#description").text_content()
        context.close()
        browser.close()

    video_path = None
    if args.video and image_paths:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            errors.append({"kind": "video", "message": "ffmpeg was not found; PNG captures remain available."})
        else:
            concat = output / "capture-frames.txt"
            concat.write_text("".join(f"file '{p.as_posix()}'\nduration 0.25\n" for p in image_paths) + f"file '{image_paths[-1].as_posix()}'\n", encoding="utf-8")
            video_path = output / "phase-reel.mp4"
            result = subprocess.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-vsync", "vfr", "-pix_fmt", "yuv420p", str(video_path)], capture_output=True, text=True)
            if result.returncode:
                errors.append({"kind": "video", "message": result.stderr[-2000:]})
                video_path = None
    report["video"] = video_path.name if video_path else None
    report["videoType"] = "phase-reel" if video_path else None
    target = output / "report.json"
    target.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ready": report["ready"], "startupError": report.get("startupError"), "scenarios": list(report["scenarios"]), "frames": len(image_paths), "report": str(target), "errors": errors}, indent=2))
    return 0 if report["ready"] and not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
