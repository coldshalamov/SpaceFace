"""contrast — WCAG 2.1 relative-luminance proof for every text-on-plate pairing.

The floor is not aesthetic (FIELD_HARDWARE_PROGRAM.md §7): 4.5:1 for body text, 3:1 for large
text (>=24 px regular / >=18.66 px bold) and for UI component boundaries.

This reads `tokens/tokens.json` and proves every pairing the kit actually uses, including the
ones where a legend sits at a dimmed opacity over a plate — a legend at 40% bone on gunmetal is
a different pairing from bone at 100%, and it is the one that fails.

Usage:  python contrast.py [tokens.json] [--md]
Exit 1 if any declared pairing fails its stated floor.
"""
from __future__ import annotations

import argparse
import json
import pathlib


def srgb_to_lin(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[float, float, float]) -> float:
    r, g, b = (srgb_to_lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def parse(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def over(fg: str, bg: str, alpha: float) -> tuple[float, float, float]:
    """Composite fg at `alpha` over an opaque bg — what the eye actually receives."""
    f, b = parse(fg), parse(bg)
    return tuple(f[i] * alpha + b[i] * (1 - alpha) for i in range(3))


def ratio(fg, bg) -> float:
    l1, l2 = luminance(fg), luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def run(tokens_path: pathlib.Path, as_md: bool = False) -> int:
    tokens = json.loads(tokens_path.read_text(encoding="utf-8"))
    colour = {k: v["value"] for k, v in tokens["colour"].items()}
    rows, failed = [], 0

    for pair in tokens["contrastPairs"]:
        fg_tok, bg_tok = pair["fg"], pair["bg"]
        alpha = float(pair.get("alpha", 1.0))
        floor = float(pair["floor"])
        fg_hex = colour[fg_tok] if fg_tok in colour else fg_tok
        bg_hex = colour[bg_tok] if bg_tok in colour else bg_tok
        eff = over(fg_hex, bg_hex, alpha)
        r = ratio(eff, parse(bg_hex))
        ok = r >= floor
        if not ok:
            failed += 1
        rows.append((pair["use"], f"{fg_tok}{'' if alpha == 1 else f' @{int(alpha*100)}%'}",
                     bg_tok, f"{r:.2f}", f"{floor:.1f}", "PASS" if ok else "FAIL"))

    if as_md:
        print("| Use | Foreground | Ground | Ratio | Floor | |")
        print("|---|---|---|---:|---:|---|")
        for r in rows:
            print("| " + " | ".join(r) + " |")
    else:
        w = [max(len(str(r[i])) for r in rows) for i in range(6)]
        for r in rows:
            print("  " + "  ".join(str(r[i]).ljust(w[i]) for i in range(6)))
    print(f"\n{len(rows)} pairing(s), {failed} below floor")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("tokens", nargs="?",
                    default=str(pathlib.Path(__file__).resolve().parents[1] / "tokens" / "tokens.json"))
    ap.add_argument("--md", action="store_true")
    a = ap.parse_args()
    return run(pathlib.Path(a.tokens), a.md)


if __name__ == "__main__":
    raise SystemExit(main())
