"""Capture deterministic lifecycle frames and continuous sequences from the VFX gameplay lab.

The page owns the production renderers and fixed-step simulation. This driver only selects a
scenario, samples the page, reads the native canvas, and writes compact review metadata.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".devshots" / "vfx-gameplay-demo"
URL = "http://127.0.0.1:8769/scripts/vfx-gameplay-demo.html"
VIEWPORT = {"width": 1600, "height": 900}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_identity() -> dict[str, Any]:
    """Hash the driver and its local page/module dependency closure for resume safety."""
    page = ROOT / "scripts" / "vfx-gameplay-demo.html"
    queue = [page, Path(__file__).resolve()]
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
            if specifier.startswith("/"):
                dependency = ROOT / specifier.lstrip("/")
            elif specifier.startswith("."):
                dependency = resolved.parent / specifier
            else:
                continue
            dependency = Path(str(dependency).split("?", 1)[0].split("#", 1)[0])
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


def compact_stats(value: object, depth: int = 0) -> object:
    if isinstance(value, dict):
        result: dict[str, object] = {}
        for key, item in value.items():
            if isinstance(item, (str, int, float, bool)) or item is None:
                result[key] = item
            elif isinstance(item, list):
                result[f"{key}Count"] = len(item)
            elif depth < 1 and isinstance(item, dict):
                result[key] = compact_stats(item, depth + 1)
        return result
    return value


def compact_state(state: object) -> object:
    """Keep phase evidence useful without copying large owner inspection graphs into report.json."""
    if not isinstance(state, dict):
        return state
    keep = (
        "time",
        "scenario",
        "seed",
        "context",
        "draws",
        "triangles",
        "quarksBatches",
        "gasBodies",
        "shipMeshes",
        "asteroidMeshes",
        "field",
        "bomb",
        "environment",
    )
    result = {key: state[key] for key in keep if key in state}
    if isinstance(state.get("owners"), dict):
        result["owners"] = compact_stats(state["owners"])
    return result


def decode_canvas(data_url: object) -> bytes:
    if not isinstance(data_url, str) or "," not in data_url:
        raise RuntimeError("The VFX lab did not return a canvas PNG data URL.")
    return base64.b64decode(data_url.split(",", 1)[1])


def sample_canvas(page: Any, phase: float) -> tuple[object, bytes]:
    payload = page.evaluate(
        """t => {
          window.__vfxDemo.pause();
          const state = window.__vfxDemo.sample(t);
          return {state, dataUrl: document.querySelector('canvas').toDataURL('image/png')};
        }""",
        phase,
    )
    if not isinstance(payload, dict):
        raise RuntimeError("The VFX lab did not return a sampled canvas payload.")
    return payload.get("state"), decode_canvas(payload.get("dataUrl"))


def save_canvas_data(path: Path, image: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(image)


def phase_filename(scenario: str, phase: float) -> str:
    return f"{scenario}-{phase:05.2f}s.png"


def ffmpeg_quote(path: Path) -> str:
    return path.as_posix().replace("'", "'\\''")


def encode_continuous(
    ffmpeg: str,
    frame_dir: Path,
    frame_count: int,
    fps: int,
    video_path: Path,
) -> None:
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
        raise RuntimeError(result.stderr[-2000:] or "ffmpeg failed to encode the continuous sequence.")


def encode_chunk_reel(ffmpeg: str, chunks: list[Path], output: Path) -> None:
    concat = output.with_suffix(".concat.txt")
    concat.write_text("".join(f"file '{ffmpeg_quote(path)}'\n" for path in chunks), encoding="utf-8")
    result = subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(output)],
        capture_output=True,
        text=True,
    )
    try:
        concat.unlink()
    except FileNotFoundError:
        pass
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:] or "ffmpeg failed to join continuous chunks.")


def encode_phase_reel(ffmpeg: str, image_paths: list[Path], output: Path) -> Path:
    concat = output / "capture-frames.txt"
    concat.write_text(
        "".join(f"file '{ffmpeg_quote(path)}'\nduration 0.25\n" for path in image_paths)
        + f"file '{ffmpeg_quote(image_paths[-1])}'\n",
        encoding="utf-8",
    )
    video_path = output / "phase-reel.mp4"
    result = subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-vsync", "vfr",
         "-pix_fmt", "yuv420p", str(video_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:] or "ffmpeg failed to encode the phase reel.")
    return video_path


def review_html(output: Path, manifest: dict[str, Any]) -> Path:
    cards: list[str] = []
    for variant_id, variant in manifest.get("variants", {}).items():
        config = f"seed {variant.get('seed')} · {html.escape(str(variant.get('context')))}"
        for scenario, record in variant.get("scenarios", {}).items():
            phase_items = []
            for item in record.get("phaseFrames", []):
                image = html.escape(str(item.get("image", "")))
                phase = html.escape(str(item.get("phase", "")))
                phase_items.append(
                    f'<figure><a href="{image}"><img loading="lazy" src="{image}" alt="{scenario} at {phase}s"></a>'
                    f"<figcaption>{phase}s</figcaption></figure>"
                )
            continuous = record.get("continuous") or {}
            video = continuous.get("video")
            video_markup = ""
            chunk_links = " · ".join(
                f'<a href="{html.escape(str(item.get("video")))}">chunk {item.get("index", "?")}</a>'
                for item in continuous.get("chunks", []) if item.get("video")
            )
            links = []
            if video:
                video_url = html.escape(str(video))
                video_markup = f'<video controls preload="metadata" src="{video_url}"></video>'
                links.append(f'<a href="{video_url}">Open continuous MP4</a>')
            if continuous.get("frameDirectory"):
                directory = html.escape(str(continuous["frameDirectory"]))
                links.append(f'<a href="{directory}">Open retained raw frames</a>')
            if chunk_links:
                links.append(f'Chunks: {chunk_links}')
            if links:
                video_markup += f'<p>{" · ".join(links)}</p>'
            status = html.escape(str(record.get("status", "pending")))
            cards.append(
                f'<article><h2>{html.escape(str(scenario))}</h2><p>{config} · {status}</p>'
                f"{video_markup}<div class=\"frames\">{''.join(phase_items)}</div></article>"
            )
    body = "\n".join(cards) or "<p>No completed scenarios yet. Resume the capture to populate this review.</p>"
    document = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>SpaceFace VFX sequence review</title>
<style>
body{{margin:24px;background:#071019;color:#dcecf4;font:14px system-ui,sans-serif}}
h1{{font-weight:500}}h2{{margin-bottom:4px}}article{{border-top:1px solid #294252;padding:18px 0}}
article p{{color:#9eb5c0;font-size:12px}}video{{display:block;max-width:min(960px,100%);background:#02070c}}
.frames{{display:flex;flex-wrap:wrap;gap:8px}}figure{{margin:0;width:180px}}img{{display:block;width:180px;height:101px;object-fit:cover;background:#02070c}}
figcaption{{color:#9eb5c0;font:11px ui-monospace,monospace;padding-top:3px}}
a{{color:#91e2ed}}
</style>
<h1>SpaceFace VFX sequence review</h1>
<p>Native canvas frames and continuous videos. <a href="manifest.json">Open capture manifest</a>.</p>
{body}
</html>
"""
    target = output / "timeline.html"
    target.write_text(document, encoding="utf-8")
    return target


def phase_times(page: Any, catalog: dict[str, Any], scenario: str) -> list[float]:
    try:
        samples = page.evaluate("() => window.__vfxDemo.weaponOwner.inspect().samples")
    except Exception:
        samples = {}
    if isinstance(samples, dict):
        values = [
            float(value)
            for value in samples.values()
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        ]
        if values:
            return sorted(set(values))
    values = catalog.get("timeline", {}).get(scenario)
    if isinstance(values, list) and values:
        return [float(value) for value in values]
    return [0.12, 0.48, 1.15, 2.35, 3.75]


def apply_controls(page: Any, variant: dict[str, Any], scenario: str) -> None:
    page.evaluate(
        """({seed,context,view,motion,flash,bloom,scenario}) => {
          document.querySelector('#seed').value = String(seed);
          document.querySelector('#context').value = context;
          document.querySelector('#view').value = view;
          document.querySelector('#motion').checked = motion;
          document.querySelector('#flash').checked = flash;
          document.querySelector('#bloom').checked = bloom;
          window.__vfxDemo.state.settings.video.motionReduce = motion;
          window.__vfxDemo.state.settings.video.flashReduce = flash;
          window.__vfxDemo.select(scenario);
          window.__vfxDemo.pause();
          window.__vfxDemo.draw();
        }""",
        {
            "seed": variant["seed"],
            "context": variant["context"],
            "view": variant["view"],
            "motion": variant["motion"],
            "flash": variant["flash"],
            "bloom": variant["bloom"],
            "scenario": scenario,
        },
    )


def phase_capture(
    page: Any,
    output: Path,
    variant_root: Path,
    scenario: str,
    phases: list[float],
    record: dict[str, Any],
    image_paths: list[Path],
    resume: bool,
) -> None:
    prior = {round(float(item.get("phase", -1)), 6): item for item in record.get("phaseFrames", [])}
    frames: list[dict[str, Any]] = []
    for phase in phases:
        key = round(phase, 6)
        filename = phase_filename(scenario, phase)
        image = variant_root / filename
        item = prior.get(key)
        if not (resume and item and image.exists()):
            state, image_bytes = sample_canvas(page, phase)
            save_canvas_data(image, image_bytes)
            item = {
                "phase": phase,
                "image": relative_path(image, output),
                "state": compact_state(state),
            }
        else:
            item = dict(item)
            item["image"] = relative_path(image, output)
        frames.append(item)
        if image not in image_paths:
            image_paths.append(image)
    record["phaseFrames"] = frames
    record["phaseCount"] = len(frames)

def continuous_capture(
    page: Any,
    output: Path,
    variant_root: Path,
    scenario: str,
    record: dict[str, Any],
    args: argparse.Namespace,
    manifest: dict[str, Any],
    manifest_path: Path,
    warnings: list[str],
    errors: list[dict[str, str]],
    write_review: bool,
) -> None:
    continuous_started = time.perf_counter()
    ffmpeg = shutil.which("ffmpeg")
    full_duration = float(page.evaluate("id => window.__vfxDemo.duration(id)", scenario))
    unbounded = not math.isfinite(full_duration)
    if unbounded:
        if args.continuous_max_seconds is None:
            raise RuntimeError(
                f"{scenario} has no finite duration; pass --continuous-max-seconds to bound it explicitly."
            )
        full_duration = float(args.continuous_max_seconds)
    target_duration = full_duration
    truncated = False
    if args.continuous_max_seconds is not None:
        cap = max(0.0, float(args.continuous_max_seconds))
        truncated = not unbounded and full_duration > cap + 1e-6
        target_duration = min(full_duration, cap)
        if truncated:
            warning = (
                f"{scenario} continuous capture is explicitly capped at {target_duration:.3f}s "
                f"of {full_duration:.3f}s; the manifest marks this sequence truncated."
            )
            warnings.append(warning)
            print(f"WARNING: {warning}", flush=True)
    fps = int(args.continuous_fps)
    frame_count = max(1, int(round(target_duration * fps)) + 1)
    chunk_frames = max(1, int(round(max(0.1, args.continuous_chunk_seconds) * fps)))
    chunk_count = max(1, math.ceil(frame_count / chunk_frames))
    continuous_root = variant_root / "continuous" / scenario
    chunks_root = continuous_root / "chunks"
    chunks_root.mkdir(parents=True, exist_ok=True)
    video_path = variant_root / f"{scenario}-continuous.mp4"
    current = record.get("continuous") or {}
    same_capture = (
        current.get("fps") == fps
        and abs(float(current.get("targetDurationSeconds", -1)) - target_duration) < 1e-6
        and current.get("frameCount") == frame_count
    )
    retained = bool(args.retain_continuous_frames) or not ffmpeg
    if not ffmpeg and not args.retain_continuous_frames:
        warnings.append(f"ffmpeg was not found; retaining PNG chunks for {scenario}.")
    chunks_by_index: dict[int, dict[str, Any]] = {}
    if args.resume and same_capture:
        for item in current.get("chunks", []):
            try:
                index = int(item.get("index"))
            except (TypeError, ValueError):
                continue
            chunk_video = output / str(item.get("video", "")) if item.get("video") else None
            if item.get("status") == "complete" and (not chunk_video or chunk_video.exists()):
                chunks_by_index[index] = dict(item)
    continuous = {
        "status": "running",
        "fps": fps,
        "fullDurationSeconds": full_duration,
        "unbounded": unbounded,
        "targetDurationSeconds": target_duration,
        "truncated": truncated,
        "frameCount": frame_count,
        "chunkFrames": chunk_frames,
        "chunkCount": chunk_count,
        "chunkSeconds": args.continuous_chunk_seconds,
        "retainContinuousFrames": retained,
        "frameDirectory": relative_path(continuous_root, output) if retained else None,
        "chunks": [chunks_by_index[index] for index in sorted(chunks_by_index)],
        "video": relative_path(video_path, output) if video_path.exists() else None,
        "wallSeconds": None,
        "captureWallSeconds": None,
        "captureFramesPerSecond": None,
    }
    record["continuous"] = continuous
    write_json_atomic(manifest_path, manifest)
    for chunk_index in range(chunk_count):
        frame_start = chunk_index * chunk_frames
        count = min(chunk_frames, frame_count - frame_start)
        chunk_video = chunks_root / f"chunk-{chunk_index:04d}.mp4"
        existing = chunks_by_index.get(chunk_index)
        if existing and chunk_video.exists():
            continue
        frame_dir = (
            continuous_root / f"chunk-{chunk_index:04d}"
            if retained
            else output / ".capture-tmp" / safe_id(variant_root.name) / safe_id(scenario) / f"chunk-{chunk_index:04d}"
        )
        if frame_dir.exists():
            shutil.rmtree(frame_dir)
        frame_dir.mkdir(parents=True, exist_ok=True)
        capture_started = time.perf_counter()
        for local_index in range(count):
            frame_index = frame_start + local_index
            phase = frame_index / fps
            _, image_bytes = sample_canvas(page, phase)
            save_canvas_data(frame_dir / f"frame-{local_index:06d}.png", image_bytes)
        capture_wall_seconds = time.perf_counter() - capture_started
        encode_wall_seconds = 0.0
        chunk_record = {
            "index": chunk_index,
            "frameStart": frame_start,
            "frameCount": count,
            "status": "frames-complete",
            "video": None,
            "captureWallSeconds": round(capture_wall_seconds, 3),
            "captureFramesPerSecond": round(count / max(capture_wall_seconds, 1e-9), 2),
            "encodeWallSeconds": 0.0,
        }
        if ffmpeg:
            try:
                encode_started = time.perf_counter()
                encode_continuous(ffmpeg, frame_dir, count, fps, chunk_video)
                encode_wall_seconds = time.perf_counter() - encode_started
                chunk_record["video"] = relative_path(chunk_video, output)
                chunk_record["status"] = "complete"
            except Exception as exc:
                encode_wall_seconds = time.perf_counter() - encode_started
                errors.append({"kind": "video", "message": f"{scenario} chunk {chunk_index}: {exc}"})
                chunk_record["status"] = "error"
        else:
            chunk_record["status"] = "complete"
        chunk_record["encodeWallSeconds"] = round(encode_wall_seconds, 3)
        chunk_record["wallSeconds"] = round(capture_wall_seconds + encode_wall_seconds, 3)
        if not retained and ffmpeg and frame_dir.exists():
            shutil.rmtree(frame_dir)
        chunks_by_index[chunk_index] = chunk_record
        continuous["chunks"] = [chunks_by_index[index] for index in sorted(chunks_by_index)]
        continuous["checkpointChunk"] = chunk_index
        write_json_atomic(manifest_path, manifest)
        if write_review:
            review_html(output, manifest)
        print(
            f"  {scenario}: continuous chunk {chunk_index + 1}/{chunk_count} "
            f"({count} frames, t={frame_start / fps:.3f}s..{(frame_start + count - 1) / fps:.3f}s)",
            flush=True,
        )
    chunk_paths = [
        output / str(item["video"])
        for item in continuous["chunks"]
        if item.get("status") == "complete" and item.get("video")
    ]
    if ffmpeg and len(chunk_paths) == chunk_count:
        try:
            encode_chunk_reel(ffmpeg, chunk_paths, video_path)
            continuous["video"] = relative_path(video_path, output)
            continuous["videoStatus"] = "complete"
        except Exception as exc:
            errors.append({"kind": "video", "message": f"{scenario} reel: {exc}"})
            continuous["videoStatus"] = "error"
    elif ffmpeg:
        continuous["videoStatus"] = "incomplete"
    else:
        continuous["videoStatus"] = "unavailable"
    continuous["status"] = "truncated" if truncated else ("complete" if len(chunk_paths) == chunk_count or not ffmpeg else "incomplete")
    continuous["wallSeconds"] = round(time.perf_counter() - continuous_started, 3)
    measured_chunks = [
        item for item in continuous["chunks"]
        if isinstance(item.get("captureWallSeconds"), (int, float))
    ]
    continuous["captureWallSeconds"] = round(
        sum(float(item["captureWallSeconds"]) for item in measured_chunks), 3
    )
    continuous["captureFramesPerSecond"] = round(
        sum(int(item.get("frameCount", 0)) for item in measured_chunks)
        / max(continuous["captureWallSeconds"], 1e-9),
        2,
    ) if measured_chunks else None
    write_json_atomic(manifest_path, manifest)
    if write_review:
        review_html(output, manifest)



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=URL, help="Lab URL served by the existing game server")
    parser.add_argument("--scenario", action="append", help="Capture one scenario; repeat to select several")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--seed-variant", action="append", type=int, default=[],
                        help="Add a seed variant; combines with every selected context")
    parser.add_argument("--context", choices=("near", "close", "wide", "open"), default="near")
    parser.add_argument("--context-variant", action="append", choices=("near", "close", "wide", "open"), default=[],
                        help="Add a context variant; combines with every selected seed")
    parser.add_argument("--view", choices=("normal", "wide", "close"), default="normal")
    parser.add_argument("--width", type=int, default=VIEWPORT["width"], help="Browser/canvas width (default: 1600)")
    parser.add_argument("--height", type=int, default=VIEWPORT["height"], help="Browser/canvas height (default: 900)")
    parser.add_argument(
        "--browser-channel",
        choices=("default", "chromium", "chrome", "msedge"),
        default="chromium",
        help="Playwright browser channel; chromium uses new headless (default), default selects headless shell",
    )
    parser.add_argument("--reduced-motion", action="store_true")
    parser.add_argument("--reduced-flash", action="store_true")
    parser.add_argument("--no-bloom", action="store_true")
    parser.add_argument("--all", action="store_true", help="Capture every scenario exposed by the page")
    parser.add_argument("--output", type=Path, help="Output directory (defaults to a timestamped folder under .devshots)")
    parser.add_argument("--resume", action="store_true", help="Resume a capture from output/manifest.json checkpoints")
    parser.add_argument("--video", action="store_true", help="Assemble a labeled phase-reel MP4 from captured lifecycle PNGs")
    parser.add_argument(
        "--continuous-video",
        action="store_true",
        help="Capture every selected scenario at deterministic fixed-step timing and assemble normal-speed MP4s",
    )
    parser.add_argument(
        "--continuous-max-seconds",
        type=float,
        default=None,
        help="Explicit per-scenario cap; capped sequences are marked truncated in manifest.json",
    )
    parser.add_argument(
        "--continuous-chunk-seconds",
        type=float,
        default=8.5,
        help="Checkpoint interval for continuous frame capture; does not truncate a sequence",
    )
    parser.add_argument(
        "--continuous-fps",
        type=int,
        choices=(24, 30, 60),
        default=60,
        help="Output frame rate for continuous-video; simulation remains fixed at 60 Hz (default: 60)",
    )
    parser.add_argument(
        "--retain-continuous-frames",
        action="store_true",
        help="Keep every continuous PNG; default capture stores bounded MP4 chunks and phase PNGs",
    )
    args = parser.parse_args()
    if args.continuous_chunk_seconds <= 0:
        parser.error("--continuous-chunk-seconds must be positive")
    if args.continuous_max_seconds is not None and args.continuous_max_seconds < 0:
        parser.error("--continuous-max-seconds must be nonnegative")
    if args.width <= 0 or args.height <= 0:
        parser.error("--width and --height must be positive")
    if args.resume and args.output is None:
        parser.error("--resume requires --output so the checkpoint is unambiguous")

    output = (args.output or (OUT / time.strftime("%Y%m%d-%H%M%S"))).resolve()
    viewport = {"width": args.width, "height": args.height}
    sources = source_identity()
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    warnings: list[str] = []
    errors: list[dict[str, str]] = []
    if args.resume and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
            parser.error(f"{manifest_path} is not a supported VFX capture manifest")
        prior_run = manifest.get("run") or {}
        if prior_run.get("url") and prior_run.get("url") != args.url:
            parser.error("The resume URL differs from the checkpoint; use a new output directory.")
        if prior_run.get("viewport") and prior_run.get("viewport") != viewport:
            parser.error("The resume viewport differs from the checkpoint; use a new output directory.")
        if prior_run.get("browserChannel") and prior_run.get("browserChannel") != args.browser_channel:
            parser.error("The resume browser channel differs from the checkpoint; use a new output directory.")
        if prior_run.get("sourceFingerprint") != sources["fingerprint"]:
            parser.error(
                "The resume source fingerprint differs from the checkpoint; source files changed, use a new output directory."
            )
        if not prior_run.get("configFingerprint"):
            parser.error("The checkpoint has no capture configuration fingerprint; use a new output directory.")
    else:
        manifest = {
            "schemaVersion": 1,
            "kind": "spaceface-vfx-sequence-capture",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "variants": {},
        }
    manifest["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    image_paths: list[Path] = []
    report: dict[str, Any] = {
        "diagnostic": True,
        "url": args.url,
        "viewport": viewport,
        "browserChannel": args.browser_channel,
        "sourceFingerprint": sources["fingerprint"],
        "sourceFiles": sources["files"],
        "view": args.view,
        "accessibility": {"reducedMotion": args.reduced_motion, "reducedFlash": args.reduced_flash},
        "bloom": not args.no_bloom,
        "variants": {},
        "scenarios": {},
        "errors": errors,
        "warnings": warnings,
        "continuousVideo": None,
        "manifest": relative_path(manifest_path, output),
        "captureWallSeconds": None,
    }

    def record_error(kind: str, message: str) -> None:
        errors.append({"kind": kind, "message": message})
        print(f"{kind}: {message}", flush=True)

    seeds = unique([args.seed, *args.seed_variant])
    contexts = unique([args.context, *args.context_variant])
    variants = [
        {
            "id": safe_id(f"seed{seed}-{context}"),
            "seed": seed,
            "context": context,
            "view": args.view,
            "motion": args.reduced_motion,
            "flash": args.reduced_flash,
            "bloom": not args.no_bloom,
        }
        for seed in seeds
        for context in contexts
    ]
    default_variant_id = variants[0]["id"]
    requested_report_scenarios: list[str] = []
    capture_started = time.perf_counter()

    with sync_playwright() as playwright:
        print(f"Loading {args.url}", flush=True)
        launch_options: dict[str, Any] = {"headless": True}
        if args.browser_channel != "default":
            launch_options["channel"] = args.browser_channel
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport=viewport, device_scale_factor=1)
        page = context.new_page()
        page.on("pageerror", lambda exc: record_error("pageerror", getattr(exc, "stack", None) or str(exc)))
        page.on("console", lambda msg: record_error("console", msg.text) if msg.type == "error" else None)
        page.on(
            "requestfailed",
            lambda req: errors.append({"kind": "requestfailed", "url": req.url, "message": req.failure or ""}),
        )
        page.on(
            "response",
            lambda response: errors.append({"kind": "http", "url": response.url, "status": str(response.status)})
            if response.status >= 400
            else None,
        )
        try:
            page.goto(args.url, wait_until="commit", timeout=30000)
            page.wait_for_function(
                "window.__vfxDemo?.ready === true || window.__vfxDemoError || window.__vfxDemo?.error",
                timeout=60000,
            )
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
        report["browser"] = {
            "channel": args.browser_channel,
            "version": browser.version,
        }
        if ready:
            page.evaluate("window.__vfxDemo.pause()")
            catalog = page.evaluate(
                "({scenarios:window.__vfxDemo.scenarios,timeline:window.__vfxDemo.timeline,assets:window.__vfxDemo.assetInfo})"
            )
            report["assetInfo"] = catalog.get("assets")
            report["canvas"] = page.locator("canvas").evaluate(
                "c => ({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight})"
            )
            try:
                report["gpu"] = page.evaluate(
                    "() => { const gl=window.__vfxDemo.renderer.getContext(); "
                    "const ext=gl.getExtension('WEBGL_debug_renderer_info'); "
                    "return ext ? {vendor:gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),"
                    "renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)} : "
                    "{renderer:gl.getParameter(gl.RENDERER)}; }"
                )
            except Exception as exc:
                warnings.append(f"Renderer identity unavailable: {exc}")
            requested = args.scenario or (catalog["scenarios"] if args.all else ["explosion", "well", "singularity", "repair"])
            requested = unique(requested)
            requested_report_scenarios = list(requested)
            known = set(catalog["scenarios"])
            run_config = {
                "url": args.url,
                "viewport": viewport,
                "browserChannel": args.browser_channel,
                "scenarios": requested,
                "variants": [{"id": item["id"], "seed": item["seed"], "context": item["context"]} for item in variants],
                "view": args.view,
                "reducedMotion": args.reduced_motion,
                "reducedFlash": args.reduced_flash,
                "bloom": not args.no_bloom,
                "continuous": args.continuous_video,
                "continuousFps": args.continuous_fps,
                "continuousChunkSeconds": args.continuous_chunk_seconds,
                "continuousMaxSeconds": args.continuous_max_seconds,
                "retainContinuousFrames": args.retain_continuous_frames,
            }
            expected_config_fingerprint = config_fingerprint(run_config)
            if args.resume and manifest.get("run", {}).get("configFingerprint") != expected_config_fingerprint:
                parser.error(
                    "The resume capture configuration differs from the checkpoint; use a new output directory."
                )
            renderer_identity = report.get("gpu")
            manifest["run"] = {
                "url": args.url,
                "viewport": viewport,
                "browserChannel": args.browser_channel,
                "browserVersion": browser.version,
                "sourceFingerprint": sources["fingerprint"],
                "sourceFiles": sources["files"],
                "scenarios": requested,
                "variants": [{"id": item["id"], "seed": item["seed"], "context": item["context"]} for item in variants],
                "continuous": args.continuous_video,
                "continuousFps": args.continuous_fps,
                "continuousChunkSeconds": args.continuous_chunk_seconds,
                "continuousMaxSeconds": args.continuous_max_seconds,
                "retainContinuousFrames": args.retain_continuous_frames,
                "configFingerprint": expected_config_fingerprint,
                "renderer": renderer_identity,
                "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
            write_json_atomic(manifest_path, manifest)
            for variant in variants:
                variant_id = variant["id"]
                variant_root = output if variant_id == default_variant_id else output / "variants" / variant_id
                manifest_variant = manifest["variants"].setdefault(
                    variant_id,
                    {"seed": variant["seed"], "context": variant["context"], "scenarios": {}},
                )
                report_variant = {
                    "seed": variant["seed"],
                    "context": variant["context"],
                    "scenarios": {},
                }
                report["variants"][variant_id] = report_variant
                for scenario in requested:
                    if scenario not in known:
                        record_error("scenario", f"Unknown scenario: {scenario}")
                        continue
                    apply_controls(page, variant, scenario)
                    phases = phase_times(page, catalog, scenario)
                    record = manifest_variant["scenarios"].setdefault(
                        scenario,
                        {
                            "status": "pending",
                            "seed": variant["seed"],
                            "context": variant["context"],
                            "phaseFrames": [],
                        },
                    )
                    print(
                        f"Capturing {scenario} ({variant_id}): {len(phases)} fixed-step phases",
                        flush=True,
                    )
                    phase_capture(
                        page,
                        output,
                        variant_root,
                        scenario,
                        phases,
                        record,
                        image_paths,
                        args.resume,
                    )
                    record["status"] = "phases-complete"
                    if args.continuous_video:
                        try:
                            continuous_capture(
                                page,
                                output,
                                variant_root,
                                scenario,
                                record,
                                args,
                                manifest,
                                manifest_path,
                                warnings,
                                errors,
                                variant_id == default_variant_id,
                            )
                        except Exception as exc:
                            record["status"] = "error"
                            errors.append({"kind": "continuous", "message": f"{scenario}: {exc}"})
                            print(f"continuous: {scenario}: {exc}", flush=True)
                    else:
                        record["status"] = "complete"
                    report_variant["scenarios"][scenario] = {
                        "status": record["status"],
                        "phaseCount": record.get("phaseCount", 0),
                        "continuous": record.get("continuous"),
                    }
                    if variant_id == default_variant_id:
                        report["scenarios"][scenario] = record
                    manifest["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                    write_json_atomic(manifest_path, manifest)
                    review_html(output, manifest)
            report["runtimeErrors"] = page.evaluate("window.__vfxDemoError || window.__vfxDemo.errors || []")
        else:
            report["loadError"] = report["startupError"] or page.locator("#description").text_content()
        context.close()
        browser.close()

    capture_wall_seconds = time.perf_counter() - capture_started
    report["captureWallSeconds"] = round(capture_wall_seconds, 3)
    if isinstance(manifest.get("run"), dict):
        manifest["run"]["endedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        manifest["run"]["wallSeconds"] = round(capture_wall_seconds, 3)

    if args.video and image_paths:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            record_error("video", "ffmpeg was not found; PNG captures remain available.")
        else:
            try:
                phase_video = encode_phase_reel(ffmpeg, image_paths, output)
                report["video"] = relative_path(phase_video, output)
                report["videoType"] = "phase-reel"
            except Exception as exc:
                record_error("video", str(exc))
    report["continuousVideo"] = {
        variant_id: {
            scenario: record.get("continuous")
            for scenario, record in variant.get("scenarios", {}).items()
            if record.get("continuous")
        }
        for variant_id, variant in manifest.get("variants", {}).items()
    }
    report["requestedScenarios"] = requested_report_scenarios
    report["manifest"] = relative_path(manifest_path, output)
    report["review"] = relative_path(output / "timeline.html", output)
    report_path = output / "report.json"
    write_json_atomic(report_path, report)
    write_json_atomic(manifest_path, manifest)
    review_html(output, manifest)
    print(
        json.dumps(
            {
                "ready": report["ready"],
                "startupError": report.get("startupError"),
                "scenarios": requested_report_scenarios,
                "variants": list(report["variants"]),
                "phaseFrames": len(image_paths),
                "manifest": str(manifest_path),
                "review": str(output / "timeline.html"),
                "browser": report.get("browser"),
                "gpu": report.get("gpu"),
                "captureWallSeconds": report.get("captureWallSeconds"),
                "errors": errors,
                "warnings": warnings,
            },
            indent=2,
        )
    )
    return 0 if report["ready"] and not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
