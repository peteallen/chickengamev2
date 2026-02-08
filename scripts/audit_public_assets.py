#!/usr/bin/env python3
"""
Fail if /public contains shipped files that are not referenced by runtime code.

This repo serves directly from index.html and references assets as ./public/...
The goal is to keep public/ as "ship-only" and move dev/source assets elsewhere (e.g. art/).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def read_text(path: Path) -> str:
    return path.read_text("utf-8", errors="ignore")


def collect_runtime_refs() -> set[str]:
    files: list[Path] = [ROOT / "index.html"]
    files += list((ROOT / "src").rglob("*.js"))

    # Capture "./public/..." occurrences, then normalize to "public/..." repo-relative.
    pat = re.compile(r"\./public/[^\s'\"\)\]]+")
    refs: set[str] = set()
    for fp in files:
        if not fp.exists():
            continue
        for m in pat.findall(read_text(fp)):
            p = m.split("?", 1)[0].split("#", 1)[0]
            if p.startswith("./"):
                p = p[2:]
            if "..." in p:
                continue
            refs.add(p)

    return refs


def main() -> int:
    if not PUBLIC.exists():
        print("public/ not found; skipping audit.", file=sys.stderr)
        return 0

    refs = collect_runtime_refs()
    public_files = [p for p in PUBLIC.rglob("*") if p.is_file()]
    public_rel = {str(p.relative_to(ROOT)).replace("\\", "/") for p in public_files}

    # Allow both favicons: root favicon.ico and the referenced public/favicon.png.
    allow = {
        "public/favicon.png",
    }

    unused = sorted((public_rel - refs) - allow)
    missing = sorted(refs - public_rel)

    ok = True
    if missing:
        ok = False
        print("Missing runtime-referenced public files:", file=sys.stderr)
        for p in missing:
            # Most refs are under public/, but we also include favicon.ico.
            print(f"  {p}", file=sys.stderr)

    if unused:
        ok = False
        print("Unreferenced shipped public files:", file=sys.stderr)
        for p in unused:
            print(f"  {p}", file=sys.stderr)

    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
