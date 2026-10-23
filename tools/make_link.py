#!/usr/bin/env python3
"""Turn a Grok Bot inbox export (JSON) into a grokbot-inbox viewer link.

Standard library only, so a bot can fetch and run it anywhere Python 3 exists:

    python3 make_link.py export.json
    python3 make_link.py export.json --lite
    cat export.json | python3 make_link.py -

The link is   <base>#data=<base64url(raw-deflate(utf8(compact JSON)))>
The export travels in the URL fragment, which browsers never send to the
server. Full format notes: docs/LINK.md in the repository.

Exit codes: 0 link printed; 2 input is not an inbox export; 3 the link is
longer than --max-chars (send the JSON file instead).
"""

from __future__ import annotations

import argparse
import base64
import html as html_lib
import json
import re
import sys
import zlib
from typing import Any

DEFAULT_BASE = "https://mascarock.github.io/grokbot-inbox/"

# Chromium drops URLs longer than 2 MiB (url::kMaxURLChars). We stop a bit
# below that so the base URL and any chat-client wrapping still fit.
CHROMIUM_MAX_URL_CHARS = 2 * 1024 * 1024
DEFAULT_MAX_CHARS = 1_900_000

QUOTE_START = re.compile(r"^On .+ wrote:\s*$", re.IGNORECASE)
ORIGINAL_MESSAGE = re.compile(r"^-{2,}\s*Original Message\s*-{2,}\s*$", re.IGNORECASE)
FORWARDED = re.compile(r"^Begin forwarded message:\s*$", re.IGNORECASE)
OUTLOOK_FROM = re.compile(r"^From:\s+\S")
OUTLOOK_NEXT = re.compile(r"^(Sent|Date|To|Subject):\s*")


def encode_payload(data: bytes) -> str:
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    raw = compressor.compress(data) + compressor.flush()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def build_link(base: str, doc: Any) -> tuple[str, int, int]:
    compact = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload = encode_payload(compact)
    base_no_fragment = base.split("#", 1)[0]
    return f"{base_no_fragment}#data={payload}", len(compact), len(payload)


def strip_quoted_reply(text: str) -> str:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cut = _find_quote_start(lines)
    if cut < 0:
        return text
    return "\n".join(lines[:cut]).rstrip("\n")


def _find_quote_start(lines: list[str]) -> int:
    for index, line in enumerate(lines):
        stripped = line.strip()
        if QUOTE_START.match(stripped) or ORIGINAL_MESSAGE.match(stripped) or FORWARDED.match(stripped):
            return index
        if OUTLOOK_FROM.match(stripped) and any(
            OUTLOOK_NEXT.match(next_line.strip()) for next_line in lines[index + 1 : index + 4]
        ):
            return index
        if line.startswith(">") and all(
            rest.strip() == "" or rest.lstrip().startswith(">") for rest in lines[index:]
        ):
            return index
    return -1


def html_to_text(markup: str) -> str:
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", markup)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|li|tr|h[1-6]|blockquote)>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def make_lite(doc: dict[str, Any]) -> dict[str, Any]:
    """Return a copy that keeps the schema but drops what makes links long."""
    lite = dict(doc)
    lite["mode"] = "lite"
    threads_out = []
    for thread in doc.get("threads") or []:
        if not isinstance(thread, dict):
            continue
        thread_out = dict(thread)
        messages_out = []
        for message in thread.get("messages") or []:
            if not isinstance(message, dict):
                continue
            message_out = dict(message)
            text = message_out.get("text")
            markup = message_out.get("html")
            if (not isinstance(text, str) or not text.strip()) and isinstance(markup, str) and markup.strip():
                text = html_to_text(markup)
            if isinstance(text, str):
                message_out["text"] = strip_quoted_reply(text)
            message_out.pop("html", None)
            attachments_out = []
            for attachment in message_out.get("attachments") or []:
                if not isinstance(attachment, dict) or attachment.get("inline") is True:
                    continue
                attachment_out = dict(attachment)
                attachment_out.pop("url", None)
                attachments_out.append(attachment_out)
            message_out["attachments"] = attachments_out
            messages_out.append(message_out)
        thread_out["messages"] = messages_out
        threads_out.append(thread_out)
    lite["threads"] = threads_out
    return lite


def load_export(path: str) -> dict[str, Any]:
    raw = sys.stdin.read() if path == "-" else open(path, "r", encoding="utf-8-sig").read()
    text = raw.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1).strip()
    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise SystemExit("make_link: input is not valid JSON")
        doc = json.loads(text[start : end + 1])
    if not isinstance(doc, dict) or not isinstance(doc.get("threads"), list):
        raise SystemExit('make_link: input is not an inbox export (expected an object with a "threads" array)')
    return doc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a grokbot-inbox viewer link from an inbox export.")
    parser.add_argument("export", help="path to the export JSON, or - for stdin")
    parser.add_argument("--lite", action="store_true", help="drop quoted replies, HTML, inline images, and attachment bytes")
    parser.add_argument("--base", default=DEFAULT_BASE, help=f"viewer URL (default {DEFAULT_BASE})")
    parser.add_argument(
        "--max-chars",
        type=int,
        default=DEFAULT_MAX_CHARS,
        help=f"refuse links longer than this (default {DEFAULT_MAX_CHARS}; 0 disables)",
    )
    parser.add_argument("--write-json", metavar="PATH", help="also write the (lite) JSON that went into the link")
    parser.add_argument("--quiet", action="store_true", help="do not print size statistics to stderr")
    args = parser.parse_args(argv)

    try:
        doc = load_export(args.export)
    except SystemExit as err:
        print(err, file=sys.stderr)
        return 2
    except OSError as err:
        print(f"make_link: {err}", file=sys.stderr)
        return 2

    if args.lite:
        doc = make_lite(doc)

    if args.write_json:
        with open(args.write_json, "w", encoding="utf-8") as handle:
            json.dump(doc, handle, ensure_ascii=False, indent=2)
            handle.write("\n")

    link, json_bytes, payload_chars = build_link(args.base, doc)
    if not args.quiet:
        threads = doc.get("threads") or []
        messages = sum(len(t.get("messages") or []) for t in threads if isinstance(t, dict))
        mode = "lite" if args.lite else "full"
        print(
            f"make_link: {len(threads)} threads, {messages} messages, {mode} mode; "
            f"JSON {json_bytes:,} bytes -> payload {payload_chars:,} chars -> link {len(link):,} chars",
            file=sys.stderr,
        )

    if args.max_chars and len(link) > args.max_chars:
        print(
            f"make_link: link is {len(link):,} chars, over the {args.max_chars:,} limit. "
            + ("Try --lite, or " if not args.lite else "")
            + "send the JSON file instead and drop it on the viewer.",
            file=sys.stderr,
        )
        return 3

    print(link)
    return 0


if __name__ == "__main__":
    sys.exit(main())
