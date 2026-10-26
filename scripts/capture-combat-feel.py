"""Capture deterministic combat-feel sequences from the production presentation bench.

The page owns the production weapon presenter, hull micro-motion, tumble body language, shield
response and bloom. This driver only starts an isolated game server, selects a fixed-seed scenario,
samples the native canvas at the page's deterministic 60 Hz clock, encodes frames, and writes a
manifest that `scripts/combat-feel/validate-manifest.mjs` must accept.

Usage:
  python scripts/capture-combat-feel.py --scenario=concussion-tumble --video
  python scripts/capture-combat-feel.py --all --video --output=.devshots/combat-feel/all
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BENCH_PAGE = ROOT / "scripts" / "combat-feel" / "index.html"
DEFAULT_OUT = ROOT / ".devshots" / "combat-feel"
DEFAULT_SEED = 17
DEFAULT_SCENARIO = "pulse-hull"
REQUIRED_SCENARIOS = ("pulse-hull", "concussion-tumble", "shield-break", "beam-cut")
SCHEMA_VERSION = 1
MANIFEST_KIND = "spaceface-combat-feel-capture"
FPS_CHOICES = (24, 30, 60)
VIEWS = ("close", "normal", "wide")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_identity() -> dict[str, Any]:
    """Hash the bench page, this driver, and their local module closure for resume/evidence identity."""
    queue: list[Path] = [BENCH_PAGE, Path(__file__).resolve()]
    queue.extend(sorted((ROOT / "scripts" / "combat-feel").glob("*.mjs")))
    seen: set[Path] = set()
    files: dict[str, str] = {}
    import_pattern = re.compile(r"(?:\bfrom\s*|\bimport\s*\()(['\"])([^'\"]+)\1")
    while queue:
        path = queue.pop()
        try:
            resolved = path.resolve()
            resolved.relative_to(ROOT.resolve())
        except (OSError, ValueError):
            continue
        if resolved in seen or not resolved.is_file():
            continue
        seen.add(resolved)
        relative = resolved.relative_to(ROOT.resolve()).as_posix()
        files[relative] = file_sha256(resolved)
        if resolved.suffix.lower() not in {".html", ".js", ".mjs"}:
            continue
        try:
            text = resolved.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for _, specifier in import_pattern.findall(text):
            specifier = specifier.split("?", 1)[0].split("#", 1)[0]
            if specifier.startswith("/"):
                dependency = ROOT / specifier.lstrip("/")
            elif specifier.startswith("."):
                dependency = resolved.parent / specifier
            else:
                continue
            queue.append(dependency)
    fingerprint_input = "\n".join(f"{path}\t{files[path]}" for path in sorted(files))
    return {
        "files": files,
        "fingerprint": hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest(),
    }


def config_fingerprint(config: dict[str, Any]) -> str:
    encoded = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def safe_id(value: object) -> str:
    text = str(value).strip().lower()
    return "".join(char if char.isalnum() or char in "-_" else "-" for char in text).strip("-") or "default"


def unique(values: list[Any]) -> list[Any]:
    result: list[Any] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


def write_json_atomic(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temporary.replace(path)


def relative_path(path: Path, output: Path) -> str:
    return path.resolve().relative_to(output.resolve()).as_posix()


def decode_canvas(data_url: object) -> bytes:
    if not isinstance(data_url, str) or "," not in data_url:
        raise RuntimeError("The combat-feel page did not return a canvas PNG data URL.")
    return base64.b64decode(data_url.split(",", 1)[1])


def sample_canvas(page: Any, at_seconds: float) -> tuple[dict[str, Any], bytes]:
    payload = page.evaluate(
        """t => {
          const info = window.__combatFeelBench.sample(t);
          const canvas = document.querySelector('canvas');
          return {state: info, dataUrl: canvas.toDataURL('image/png')};
        }""",
        at_seconds,
    )
    if not isinstance(payload, dict):
        raise RuntimeError("The combat-feel page did not return a sampled canvas payload.")
    state = payload.get("state")
    if not isinstance(state, dict):
        raise RuntimeError("The combat-feel page did not return an inspect() object.")
    image = decode_canvas(payload.get("dataUrl"))
    if len(image) < 5_000:
        raise RuntimeError(f"Sampled frame at {at_seconds:.3f}s is suspiciously small ({len(image)} bytes).")
    return state, image


def save_image(path: Path, image: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image)


def ffmpeg_path() -> str | None:
    return shutil.which("ffmpeg")


def encode_video(ffmpeg: str, frame_dir: Path, frame_count: int, fps: int, video_path: Path) -> None:
    video_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-framerate",
        str(fps),
        "-start_number",
        "0",
        "-i",
        str(frame_dir / "frame-%06d.png"),
        "-frames:v",
        str(frame_count),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:] or "ffmpeg failed to encode the combat-feel sequence.")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def start_server(root: Path, log_path: Path) -> tuple[subprocess.Popen, str]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("node was not found on PATH; cannot start the isolated game server.")
    port = find_free_port()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    # An unset variable mounts the real shared save drawer; empty is the isolated harness contract.
    environment["SPACEFACE_PLAYER_STORE_DIR"] = ""
    environment["SPACEFACE_USER_CONTENT_DIR"] = ""
    log_stream = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [node, "server.js", str(port)],
        cwd=str(root),
        env=environment,
        stdout=log_stream,
        stderr=subprocess.STDOUT,
        text=True,
    )
    url = f"http://127.0.0.1:{port}/scripts/combat-feel/index.html"
    deadline = time.time() + 60
    while time.time() < deadline:
        if process.poll() is not None:
            log_stream.flush()
            tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
            raise RuntimeError(f"The isolated game server exited before it was ready.\n{tail}")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return process, url
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(0.25)
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
    tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
    raise RuntimeError(f"The isolated game server did not become ready in 60s.\n{tail}")


def stop_server(process: subprocess.Popen | None) -> None:
    if not process or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def compact_inspect(info: dict[str, Any]) -> dict[str, Any]:
    """Keep review evidence, not the page's whole diagnostic graph."""
    keep = (
        "ready", "catalogVersion", "scenario", "label", "seed", "frame", "time", "fps",
        "durationSeconds", "beatPlan", "shotPlan", "camera", "scene", "contact", "contactLog",
        "reaction", "reactionPeak", "lightPeakMax", "transforms", "evidence", "evidenceAt", "checks", "requiredEvidence", "assets", "owners",
        "render", "errors", "boundary",
    )
    return {key: info[key] for key in keep if key in info}


def contact_sheet_html(output: Path, manifest: dict[str, Any]) -> Path:
    cards: list[str] = []
    for scenario_id, entry in manifest.get("scenarios", {}).items():
        figures: list[str] = []
        for item in entry.get("beatFrames", []):
            image = html.escape(str(item.get("image", "")))
            beat = html.escape(str(item.get("beat", "")))
            at = float(item.get("atS", 0))
            figures.append(
                f'<figure><a href="{image}"><img loading="lazy" src="{image}" alt="{scenario_id} {beat}"></a>'
                f"<figcaption>{beat} · {at:.2f}s</figcaption></figure>"
            )
        cards.append(
            f'<article><h2>{html.escape(entry.get("label", scenario_id))}</h2>'
            f'<p>seed {entry.get("seed")} · {html.escape(str(entry.get("status", "?")))} · '
            f'{html.escape(", ".join(entry.get("weaponIds", [])))}</p>'
            f'<div class="frames">{"".join(figures)}</div></article>'
        )
    body = "\n".join(cards) or "<p>No beat frames were captured.</p>"
    document = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>SpaceFace combat feel contact sheet</title>
<style>
body{{margin:24px;background:#071019;color:#dcecf4;font:14px system-ui,sans-serif}}
h1{{font-weight:500}}h2{{margin:0 0 4px}}article{{border-top:1px solid #294252;padding:18px 0}}
article p{{color:#9eb5c0;font-size:12px}}a{{color:#91e2ed}}
.frames{{display:flex;flex-wrap:wrap;gap:8px}}figure{{margin:0;width:240px}}
img{{display:block;width:240px;height:135px;object-fit:cover;background:#02070c}}
figcaption{{color:#9eb5c0;font:11px ui-monospace,monospace;padding-top:3px}}
</style>
<h1>SpaceFace combat feel / contact sheet</h1>
<p>Fixed-seed beat frames. <a href="manifest.json">Manifest</a> · <a href="timeline.html">Chronological review</a></p>
{body}
</html>
"""
    target = output / "contact-sheet.html"
    target.write_text(document, encoding="utf-8")
    return target


def timeline_html(output: Path, manifest: dict[str, Any]) -> Path:
    cards: list[str] = []
    for scenario_id, entry in manifest.get("scenarios", {}).items():
        frames: list[str] = []
        for item in entry.get("beatFrames", []):
            image = html.escape(str(item.get("image", "")))
            beat = html.escape(str(item.get("beat", "")))
            at = float(item.get("atS", 0))
            frames.append(
                f'<figure><a href="{image}"><img loading="lazy" src="{image}" alt="{scenario_id} {beat}"></a>'
                f"<figcaption>{beat} · {at:.2f}s</figcaption></figure>"
            )
        video = entry.get("sequence", {}).get("video")
        video_markup = ""
        if video:
            safe_video = html.escape(str(video))
            video_markup = (
                f'<video controls preload="metadata" src="{safe_video}"></video>'
                f'<p><a href="{safe_video}">Open sequence MP4</a></p>'
            )
        checks = entry.get("checks", [])
        failed = [check for check in checks if not check.get("ok")]
        check_text = "all evidence checks passed" if not failed else (
            "FAILED: " + ", ".join(str(check.get("id")) for check in failed)
        )
        cards.append(
            f'<article><h2>{html.escape(entry.get("label", scenario_id))}</h2>'
            f'<p>seed {entry.get("seed")} · {entry.get("durationSeconds")}s · '
            f'{html.escape(str(entry.get("status", "?")))} · {html.escape(check_text)}</p>'
            f"{video_markup}<div class=\"frames\">{''.join(frames)}</div></article>"
        )
    body = "\n".join(cards) or "<p>No scenarios were captured.</p>"
    document = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>SpaceFace combat feel sequence review</title>
<style>
body{{margin:24px;background:#071019;color:#dcecf4;font:14px system-ui,sans-serif}}
h1{{font-weight:500}}h2{{margin-bottom:4px}}article{{border-top:1px solid #294252;padding:18px 0}}
article p{{color:#9eb5c0;font-size:12px}}a{{color:#91e2ed}}
video{{display:block;max-width:min(960px,100%);background:#02070c}}
.frames{{display:flex;flex-wrap:wrap;gap:8px}}figure{{margin:0;width:200px}}
img{{display:block;width:200px;height:112px;object-fit:cover;background:#02070c}}
figcaption{{color:#9eb5c0;font:11px ui-monospace,monospace;padding-top:3px}}
</style>
<h1>SpaceFace combat feel / chronological review</h1>
<p>Native canvas frames and normal-speed sequence videos. <a href="manifest.json">Manifest</a> ·
<a href="contact-sheet.html">Contact sheet</a></p>
{body}
</html>
"""
    target = output / "timeline.html"
    target.write_text(document, encoding="utf-8")
    return target


def scenario_name_from_catalog(catalog: dict[str, Any]) -> list[str]:
    scenarios = catalog.get("scenarios")
    if not isinstance(scenarios, list):
        return []
    return [str(item.get("id")) for item in scenarios if isinstance(item, dict) and item.get("id")]


def run_capture(args: argparse.Namespace) -> int:
    output = (args.output or (DEFAULT_OUT / time.strftime("%Y%m%d-%H%M%S"))).resolve()
    output.mkdir(parents=True, exist_ok=True)
    frames_root = output / "frames"
    video_root = output / "video"
    frames_root.mkdir(parents=True, exist_ok=True)
    video_root.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    report_path = output / "report.json"
    log_path = output / "server.log"

    warnings: list[str] = []
    errors: list[dict[str, str]] = []
    page_errors: list[dict[str, str]] = []
    started = time.time()
    sources = source_identity()
    viewport = {"width": int(args.width), "height": int(args.height)}
    ffmpeg = ffmpeg_path()
    if args.video and not ffmpeg:
        errors.append({"kind": "video", "message": "ffmpeg was not found; --video cannot be honored."})

    run_config = {
        "url": args.url,
        "viewport": viewport,
        "browserChannel": args.browser_channel,
        "seed": int(args.seed),
        "fps": int(args.fps),
        "view": args.view,
        "scenarios": list(args.scenario) if args.scenario else ([] if args.all else [DEFAULT_SCENARIO]),
        "video": bool(args.video),
        "retainSequenceFrames": bool(args.retain_sequence_frames),
        "headed": bool(args.headed),
    }

    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": MANIFEST_KIND,
        "catalogVersion": 1,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "run": {
            "url": args.url or "",
            "seed": int(args.seed),
            "width": viewport["width"],
            "height": viewport["height"],
            "fps": int(args.fps),
            "view": args.view,
            "browserChannel": args.browser_channel,
            "browserVersion": None,
            "sourceFingerprint": sources["fingerprint"],
            "sourceFiles": sources["files"],
            "configFingerprint": config_fingerprint(run_config),
            "renderer": None,
            "scenarios": [],
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "endedAt": None,
            "wallSeconds": None,
        },
        "scenarios": {},
        "outputs": {
            "manifest": "manifest.json",
            "report": "report.json",
            "review": "timeline.html",
            "contactSheet": "contact-sheet.html",
            "framesRoot": "frames",
            "videoRoot": "video",
        },
        "errors": errors,
        "warnings": warnings,
    }
    if not args.url:
        manifest["run"]["url"] = "(auto-started isolated server)"
    write_json_atomic(manifest_path, manifest)

    server_process: subprocess.Popen | None = None
    browser = None
    report: dict[str, Any] = {
        "diagnostic": True,
        "url": manifest["run"]["url"],
        "viewport": viewport,
        "browser": None,
        "gpu": None,
        "catalogVersion": None,
        "ready": False,
        "startupError": None,
        "scenarios": {},
        "errors": errors,
        "warnings": warnings,
        "manifest": "manifest.json",
        "review": "timeline.html",
        "contactSheet": "contact-sheet.html",
        "captureWallSeconds": None,
    }

    try:
        if not args.url:
            server_process, args.url = start_server(ROOT, log_path)
            manifest["run"]["url"] = args.url
            report["url"] = args.url
        if not args.url:
            raise RuntimeError("No bench URL was supplied and the isolated server did not return one.")

        with sync_playwright() as playwright:
            launch_options: dict[str, Any] = {"headless": not args.headed}
            if args.browser_channel != "default":
                launch_options["channel"] = args.browser_channel
            browser = playwright.chromium.launch(**launch_options)
            context = browser.new_context(viewport=viewport, device_scale_factor=1)
            page = context.new_page()

            def record_error(kind: str, message: object) -> None:
                entry = {"kind": kind, "message": str(message)}
                page_errors.append(entry)
                errors.append(entry)
                print(f"{kind}: {entry['message']}", file=sys.stderr, flush=True)

            page.on("pageerror", lambda exc: record_error("pageerror", getattr(exc, "stack", None) or str(exc)))
            page.on("console", lambda msg: record_error("console", msg.text) if msg.type == "error" else None)
            page.on(
                "requestfailed",
                lambda request: record_error("requestfailed", f"{request.url}: {request.failure or ''}"),
            )
            page.on(
                "response",
                lambda response: record_error("http", f"{response.url} -> {response.status}")
                if response.status >= 400 else None,
            )

            print(f"Loading {args.url}", flush=True)
            navigation_ok = True
            try:
                page.goto(args.url, wait_until="commit", timeout=30000)
            except Exception as exc:
                navigation_ok = False
                record_error("navigation", exc)
            if navigation_ok:
                try:
                    page.wait_for_function(
                        "window.__combatFeelBench?.ready === true || window.__combatFeelBenchError",
                        timeout=90000,
                    )
                except Exception as exc:
                    record_error("ready-timeout", exc)

            startup_error = None
            ready = False
            if navigation_ok:
                try:
                    startup_error = page.evaluate("window.__combatFeelBenchError || null")
                    ready = page.evaluate("window.__combatFeelBench?.ready === true")
                except Exception as exc:
                    record_error("page-state", exc)
            else:
                startup_error = "Navigation failed before the bench page loaded."
            report["ready"] = bool(ready)
            report["startupError"] = startup_error
            manifest["run"]["browserVersion"] = browser.version
            report["browser"] = {"channel": args.browser_channel, "version": browser.version}

            if not ready:
                message = str(startup_error or "The combat-feel page did not become ready.")
                errors.append({"kind": "startup", "message": message})
                print(f"startup: {message}", file=sys.stderr, flush=True)
            else:
                catalog = page.evaluate("window.__combatFeelBench.catalog")
                if not isinstance(catalog, dict):
                    raise RuntimeError("The combat-feel page returned no catalog.")
                report["catalogVersion"] = catalog.get("version")
                manifest["catalogVersion"] = catalog.get("version", 1)
                if manifest["catalogVersion"] != 1:
                    errors.append({
                        "kind": "catalog",
                        "message": f"Unsupported catalog version {manifest['catalogVersion']}",
                    })
                known = scenario_name_from_catalog(catalog)
                requested = list(args.scenario) if args.scenario else (known if args.all else [DEFAULT_SCENARIO])
                requested = unique(requested)
                unknown = [scenario for scenario in requested if scenario not in known]
                if unknown:
                    errors.append({"kind": "scenario", "message": f"Unknown scenario(s): {', '.join(unknown)}"})
                requested = [scenario for scenario in requested if scenario in known]
                if not requested:
                    errors.append({"kind": "scenario", "message": "No scenarios were selected."})
                manifest["run"]["scenarios"] = requested
                print(
                    f"Catalog v{manifest['catalogVersion']} · {len(known)} scenarios · "
                    f"capturing {', '.join(requested)}",
                    flush=True,
                )
                page.evaluate(
                    "({seed,view}) => window.__combatFeelBench.configure({seed,view})",
                    {"seed": int(args.seed), "view": args.view},
                )
                try:
                    report["gpu"] = page.evaluate(
                        """() => {
                          const gl = window.__combatFeelBench.renderer.getContext();
                          const ext = gl.getExtension('WEBGL_debug_renderer_info');
                          return ext ? {
                            vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
                            renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
                          } : { renderer: gl.getParameter(gl.RENDERER) };
                        }"""
                    )
                    manifest["run"]["renderer"] = report["gpu"]
                except Exception as exc:
                    warnings.append(f"Renderer identity unavailable: {exc}")

                for scenario in requested:
                    scenario_started = time.time()
                    print(f"Capturing {scenario} (seed {args.seed}, {args.width}x{args.height}, view {args.view})", flush=True)
                    entry: dict[str, Any] = {
                        "scenario": scenario,
                        "seed": int(args.seed),
                        "status": "error",
                        "weaponIds": [],
                        "durationSeconds": 0.0,
                        "fps": int(args.fps),
                        "beats": [],
                        "beatFrames": [],
                        "frames": {"directory": f"frames/{scenario}", "pattern": "beat-%02d-%s.png", "count": 0},
                        "sequence": {
                            "directory": f"frames/{scenario}/sequence",
                            "fps": int(args.fps),
                            "frameCount": 0,
                            "video": None,
                            "retained": False,
                        },
                        "evidence": {},
                        "evidenceAt": {},
                        "checks": [],
                        "inspect": {},
                        "errors": [],
                    }
                    scenario_errors: list[dict[str, str]] = entry["errors"]

                    def add_scenario_error(kind: str, message: object) -> None:
                        scenario_errors.append({"kind": kind, "message": str(message)})
                        print(f"  {scenario} {kind}: {message}", file=sys.stderr, flush=True)

                    try:
                        initial = page.evaluate(
                            "({id,seed}) => window.__combatFeelBench.select(id,{seed})",
                            {"id": scenario, "seed": int(args.seed)},
                        )
                        if not isinstance(initial, dict):
                            raise RuntimeError("select() returned no inspect object.")
                        entry["weaponIds"] = [str(shot.get("weaponId")) for shot in initial.get("shotPlan", []) if shot.get("weaponId")]
                        entry["durationSeconds"] = float(initial.get("durationSeconds") or 0)
                        beats = initial.get("beatPlan")
                        if not isinstance(beats, list) or not beats:
                            raise RuntimeError("The page returned no beat plan.")
                        beats = sorted(beats, key=lambda item: (float(item.get("atS", 0)), str(item.get("beat", ""))))
                        frame_dir = frames_root / scenario
                        image_paths: list[Path] = []
                        for index, beat in enumerate(beats):
                            beat_name = str(beat.get("beat", f"beat-{index}"))
                            at_seconds = float(beat.get("atS", 0))
                            state, image = sample_canvas(page, at_seconds)
                            image_path = frame_dir / f"beat-{index:02d}-{safe_id(beat_name)}.png"
                            save_image(image_path, image)
                            image_paths.append(image_path)
                            entry["beats"].append({
                                "beat": beat_name,
                                "atS": at_seconds,
                                "frame": int(beat.get("frame", round(at_seconds * 60))),
                            })
                            entry["beatFrames"].append({
                                "beat": beat_name,
                                "atS": at_seconds,
                                "frame": int(beat.get("frame", round(at_seconds * 60))),
                                "image": relative_path(image_path, output),
                                "seen": bool((state.get("evidenceNow") or {}).get(beat_name, False)),
                            })
                        entry["frames"]["count"] = len(image_paths)
                        entry["frames"]["pattern"] = "beat-%02d-%s.png"

                        final = page.evaluate(
                            "t => window.__combatFeelBench.sample(t)",
                            float(entry["durationSeconds"]),
                        )
                        if not isinstance(final, dict):
                            raise RuntimeError("sample() returned no inspect object.")
                        entry["inspect"] = compact_inspect(final)
                        entry["evidence"] = {
                            str(key): bool(value) for key, value in (final.get("evidence") or {}).items()
                        }
                        entry["evidenceAt"] = {
                            str(key): value for key, value in (final.get("evidenceAt") or {}).items()
                        }
                        entry["checks"] = [
                            {
                                "id": str(check.get("id", "")),
                                "ok": bool(check.get("ok")),
                                "detail": str(check.get("detail", "")),
                            }
                            for check in (final.get("checks") or [])
                        ]
                        required = final.get("requiredEvidence")
                        if not isinstance(required, list):
                            required = []
                        # A named beat must show its own evidence on ITS frame. The cumulative map
                        # above is only the "did it ever happen" fallback.
                        for name in required:
                            frame_read = next(
                                (beat for beat in entry["beatFrames"] if beat.get("beat") == name),
                                None,
                            )
                            entry["checks"].append({
                                "id": f"beat-{name}-visible",
                                "ok": bool(frame_read and frame_read.get("seen")),
                                "detail": (
                                    f"{name} beat frame shows its evidence"
                                    if frame_read and frame_read.get("seen")
                                    else f"{name} beat frame does not show {name}"
                                ),
                            })
                        missing = [name for name in required if not entry["evidence"].get(name, False)]
                        for name in missing:
                            add_scenario_error("evidence", f"required {name} evidence was not observed")
                        failed_checks = [check for check in entry["checks"] if not check["ok"]]
                        for check in failed_checks:
                            add_scenario_error("check", f"{check['id']}: {check['detail']}")

                        if args.video and ffmpeg:
                            sequence_dir = frame_dir / "sequence"
                            if sequence_dir.exists():
                                shutil.rmtree(sequence_dir)
                            sequence_dir.mkdir(parents=True, exist_ok=True)
                            frame_count = max(1, int(round(entry["durationSeconds"] * args.fps)) + 1)
                            sequence_started = time.time()
                            for frame_index in range(frame_count):
                                at_seconds = frame_index / float(args.fps)
                                _, image = sample_canvas(page, at_seconds)
                                save_image(sequence_dir / f"frame-{frame_index:06d}.png", image)
                            video_path = video_root / f"{scenario}.mp4"
                            try:
                                encode_video(ffmpeg, sequence_dir, frame_count, args.fps, video_path)
                                entry["sequence"]["video"] = relative_path(video_path, output)
                                entry["sequence"]["frameCount"] = frame_count
                                entry["sequence"]["captureWallSeconds"] = round(time.time() - sequence_started, 3)
                                if not args.retain_sequence_frames:
                                    shutil.rmtree(sequence_dir)
                                else:
                                    entry["sequence"]["retained"] = True
                            except Exception as exc:
                                add_scenario_error("video", exc)
                        elif args.video and not ffmpeg:
                            add_scenario_error("video", "ffmpeg was not found.")

                        if not scenario_errors:
                            entry["status"] = "complete"
                    except Exception as exc:
                        add_scenario_error("capture", exc)

                    entry["captureWallSeconds"] = round(time.time() - scenario_started, 3)
                    manifest["scenarios"][scenario] = entry
                    report["scenarios"][scenario] = {
                        "status": entry["status"],
                        "seed": entry["seed"],
                        "beats": len(entry["beats"]),
                        "beatFrames": entry["frames"]["count"],
                        "video": entry["sequence"]["video"],
                        "evidence": entry["evidence"],
                        "checks": entry["checks"],
                        "errors": entry["errors"],
                        "captureWallSeconds": entry["captureWallSeconds"],
                    }
                    write_json_atomic(manifest_path, manifest)
                    print(
                        f"  {scenario}: {entry['status']} · {entry['frames']['count']} beat frames · "
                        f"{entry['sequence']['video'] or 'no video'}",
                        flush=True,
                    )

                if not args.retain_sequence_frames:
                    # Sequence frames are encoded into each scenario video; beat frames remain.
                    pass
                report["runtimeErrors"] = page.evaluate("window.__combatFeelBenchErrors || []")
            context.close()
            browser.close()
            browser = None
    except Exception as exc:
        if isinstance(exc, SystemExit):
            raise
        errors.append({"kind": "driver", "message": str(exc)})
        print(f"driver: {exc}", file=sys.stderr, flush=True)
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        stop_server(server_process)

    capture_wall_seconds = round(time.time() - started, 3)
    report["captureWallSeconds"] = capture_wall_seconds
    manifest["run"]["endedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest["run"]["wallSeconds"] = capture_wall_seconds
    manifest["errors"] = errors
    manifest["warnings"] = warnings
    if errors:
        for scenario, entry in manifest.get("scenarios", {}).items():
            if entry.get("status") == "error" and not entry.get("errors"):
                entry["errors"] = [{"kind": "run", "message": "run-level errors present"}]

    contact_sheet = contact_sheet_html(output, manifest)
    review = timeline_html(output, manifest)
    report["manifest"] = relative_path(manifest_path, output)
    report["review"] = relative_path(review, output)
    report["contactSheet"] = relative_path(contact_sheet, output)
    write_json_atomic(manifest_path, manifest)
    write_json_atomic(report_path, report)

    validator = subprocess.run(
        [shutil.which("node") or "node", str(ROOT / "scripts" / "combat-feel" / "validate-manifest.mjs"), str(manifest_path)],
        capture_output=True,
        text=True,
    )
    validation: dict[str, Any] = {"ok": validator.returncode == 0, "stdout": validator.stdout.strip()}
    if validator.returncode != 0:
        validation["stderr"] = validator.stderr.strip()
        errors.append({"kind": "manifest", "message": validator.stderr.strip() or "manifest validation failed"})
        manifest["errors"] = errors
        write_json_atomic(manifest_path, manifest)
    report["validation"] = validation
    write_json_atomic(report_path, report)

    summary = {
        "ready": report["ready"],
        "startupError": report["startupError"],
        "output": str(output),
        "scenarios": {
            scenario: {
                "status": entry.get("status"),
                "beats": len(entry.get("beats", [])),
                "frames": entry.get("frames", {}).get("count"),
                "video": entry.get("sequence", {}).get("video"),
                "evidence": entry.get("evidence"),
                "errors": entry.get("errors"),
            }
            for scenario, entry in manifest.get("scenarios", {}).items()
        },
        "manifest": str(manifest_path),
        "review": str(review),
        "contactSheet": str(contact_sheet),
        "browser": report.get("browser"),
        "gpu": report.get("gpu"),
        "captureWallSeconds": capture_wall_seconds,
        "validation": validation,
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(summary, indent=2), flush=True)

    clean = (
        report["ready"]
        and not errors
        and validation["ok"]
        and manifest.get("scenarios")
        and all(entry.get("status") == "complete" for entry in manifest["scenarios"].values())
    )
    return 0 if clean else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", action="append", help="Scenario id; repeat to select several")
    parser.add_argument("--all", action="store_true", help="Capture every scenario exposed by the catalog")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output", type=Path, default=None, help="Output folder (default: .devshots/combat-feel/<timestamp>)")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--fps", type=int, choices=FPS_CHOICES, default=60)
    parser.add_argument("--view", choices=VIEWS, default="normal")
    parser.add_argument("--video", action="store_true", help="Capture every 60 Hz frame and encode an MP4 per scenario")
    parser.add_argument("--retain-sequence-frames", action="store_true", help="Keep the per-frame sequence PNGs after encoding")
    parser.add_argument("--url", default=None, help="Use an already-running bench URL instead of starting a server")
    parser.add_argument(
        "--browser-channel",
        choices=("default", "chromium", "chrome", "msedge"),
        default="chromium",
        help="Playwright browser channel (chromium uses new headless; default uses headless shell)",
    )
    parser.add_argument("--headed", action="store_true", help="Run a headed browser (GPU machines)")
    args = parser.parse_args()
    if args.width <= 0 or args.height <= 0:
        parser.error("--width and --height must be positive")
    if args.seed < 0:
        parser.error("--seed must be nonnegative")
    if args.all and args.scenario:
        parser.error("Use --all or --scenario, not both")
    if not BENCH_PAGE.is_file():
        parser.error(f"Bench page is missing: {BENCH_PAGE}")
    return run_capture(args)


if __name__ == "__main__":
    raise SystemExit(main())
