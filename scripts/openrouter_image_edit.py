#!/usr/bin/env python3
"""
Edit an existing image using an OpenRouter image-capable chat model.

Why this exists:
- The repo uses OpenRouter for asset generation.
- `google/gemini-3-pro-image-preview` supports image+text prompts, which is ideal for
  consistent variants (door open, lights on, etc).
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "google/gemini-3-pro-image-preview"
DEFAULT_OUT_DIR = "output/openrouter-imagegen"
DATA_URL_RE = re.compile(r"^data:(?P<mime>[-\w.+/]+);base64,(?P<data>.+)$", re.DOTALL)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Edit an image using OpenRouter chat completions.")
    parser.add_argument("prompt", help="Edit instruction prompt.")
    parser.add_argument("--in", dest="in_path", required=True, help="Input image path.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model (default: {DEFAULT_MODEL})")
    parser.add_argument("--count", type=int, default=1, help="Number of variants to generate.")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help=f"Output directory (default: {DEFAULT_OUT_DIR})")
    parser.add_argument("--basename", default="image", help="Output file basename.")
    parser.add_argument("--system-prompt", default="", help="Optional system prompt.")
    parser.add_argument("--timeout", type=int, default=180, help="HTTP timeout in seconds.")
    parser.add_argument("--debug-json", default="", help="Optional path to save raw API response JSON.")
    return parser.parse_args()


def openrouter_request(api_key: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL", "https://codex.local"),
        "X-Title": os.environ.get("OPENROUTER_APP_NAME", "Codex OpenRouter Image Skill"),
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter HTTP {exc.code}: {body[:800]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenRouter request failed: {exc}") from exc


def maybe_data_url(candidate: Any) -> str | None:
    if not isinstance(candidate, str):
        return None
    value = candidate.strip()
    if value.startswith("data:image/"):
        return value
    return None


def image_url_from_obj(obj: Any) -> str | None:
    if isinstance(obj, str):
        return maybe_data_url(obj) or (obj if obj.startswith(("http://", "https://")) else None)
    if not isinstance(obj, dict):
        return None

    direct = maybe_data_url(obj.get("url"))
    if direct:
        return direct

    image_url = obj.get("image_url")
    if isinstance(image_url, str):
        return maybe_data_url(image_url) or (image_url if image_url.startswith(("http://", "https://")) else None)
    if isinstance(image_url, dict):
        nested = image_url.get("url")
        if isinstance(nested, str):
            return maybe_data_url(nested) or (nested if nested.startswith(("http://", "https://")) else None)

    if isinstance(obj.get("b64_json"), str):
        return f"data:image/png;base64,{obj['b64_json']}"
    if isinstance(obj.get("image"), str):
        image = obj["image"].strip()
        if image.startswith("data:image/"):
            return image
        if re.fullmatch(r"[A-Za-z0-9+/=\n\r]+", image):
            return f"data:image/png;base64,{image}"
    return None


def extract_image_urls(response: dict[str, Any]) -> list[str]:
    results: list[str] = []

    def push(value: str | None) -> None:
        if value and value not in results:
            results.append(value)

    choices = response.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            message = choice.get("message", {})
            if isinstance(message, dict):
                images = message.get("images")
                if isinstance(images, list):
                    for image in images:
                        push(image_url_from_obj(image))

                content = message.get("content")
                if isinstance(content, list):
                    for item in content:
                        push(image_url_from_obj(item))
                elif isinstance(content, str):
                    for match in re.findall(r"data:image/[-\w.+]+;base64,[A-Za-z0-9+/=\n\r]+", content):
                        push(match)

    data = response.get("data")
    if isinstance(data, list):
        for item in data:
            push(image_url_from_obj(item))

    images = response.get("images")
    if isinstance(images, list):
        for image in images:
            push(image_url_from_obj(image))

    return results


def extension_from_mime(mime: str) -> str:
    mapping = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    return mapping.get(mime.lower(), "png")


def bytes_from_image_url(image_url: str, timeout: int) -> tuple[bytes, str]:
    data_match = DATA_URL_RE.match(image_url)
    if data_match:
        mime = data_match.group("mime")
        encoded = data_match.group("data")
        raw = base64.b64decode(encoded, validate=False)
        return raw, extension_from_mime(mime)

    if image_url.startswith(("http://", "https://")):
        request = urllib.request.Request(image_url, headers={"User-Agent": "codex-openrouter-imagegen"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            content_type = response.headers.get_content_type() or "image/png"
            return body, extension_from_mime(content_type)

    raise RuntimeError("Unsupported image payload format returned by provider.")


def resolve_api_key() -> str | None:
    env_key = os.environ.get("OPENROUTER_API_KEY")
    if env_key:
        return env_key

    # Codex commands may run in shells that do not source ~/.zshrc.
    try:
        output = subprocess.check_output(
            ["zsh", "-ic", 'printf "%s" "$OPENROUTER_API_KEY"'],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return output or None


def data_url_for_file(path: Path) -> str:
    raw = path.read_bytes()
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "image/png"
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def build_payload(model: str, prompt: str, system_prompt: str, image_data_url: str) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    # OpenAI-style multimodal message format, supported by OpenRouter for image-capable models.
    messages.append(
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ],
        }
    )
    return {
        "model": model,
        "modalities": ["image", "text"],
        "messages": messages,
    }


def main() -> int:
    args = parse_args()
    if args.count < 1:
        print("--count must be at least 1.", file=sys.stderr)
        return 2

    api_key = resolve_api_key()
    if not api_key:
        print("OPENROUTER_API_KEY is not set. Export it in the shell environment available to Codex.", file=sys.stderr)
        return 2

    in_path = Path(args.in_path).expanduser().resolve()
    if not in_path.exists():
        print(f"Input image not found: {in_path}", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    image_data_url = data_url_for_file(in_path)

    written: list[Path] = []
    for request_index in range(1, args.count + 1):
        payload = build_payload(args.model, args.prompt, args.system_prompt, image_data_url=image_data_url)
        response = openrouter_request(api_key, payload, timeout=args.timeout)

        if args.debug_json:
            debug_path = Path(args.debug_json).expanduser().resolve()
            if args.count > 1:
                debug_path = debug_path.with_name(
                    f"{debug_path.stem}-{request_index:02d}{debug_path.suffix or '.json'}"
                )
            debug_path.parent.mkdir(parents=True, exist_ok=True)
            debug_path.write_text(json.dumps(response, indent=2), encoding="utf-8")

        image_urls = extract_image_urls(response)
        if not image_urls:
            snippet = json.dumps(response, indent=2)[:1200]
            raise RuntimeError(f"No image payload found in API response.\nResponse snippet:\n{snippet}")

        image_bytes, ext = bytes_from_image_url(image_urls[0], timeout=args.timeout)

        output_index = len(written) + 1
        if args.count == 1:
            filename = f"{args.basename}.{ext}"
        else:
            filename = f"{args.basename}-{output_index:02d}.{ext}"

        output_path = out_dir / filename
        output_path.write_bytes(image_bytes)
        written.append(output_path)

    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

