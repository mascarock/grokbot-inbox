#!/usr/bin/env python3
"""
encrypt_inbox.py — Python twin of encrypt_inbox.mjs. Produces the same
inbox.enc / inbox.meta.json the viewer expects. Format: docs/RELAY.md.

Needs the `cryptography` package for AES-GCM (the standard library has no
AEAD cipher). If it is missing, this script says so and exits 3; use the
Node version instead (Node 20+ has WebCrypto built in).

    python3 encrypt_inbox.py keygen [--key-file PATH]
    python3 encrypt_inbox.py encrypt --in export.json --key-file PATH --out-dir DIR
            [--seq-file PATH] [--no-compress] [--webhook-url URL]
            [--key-header NAME] [--key-prefix TEXT]
    python3 encrypt_inbox.py link --base URL --key-file PATH
    python3 encrypt_inbox.py decrypt --in inbox.enc --key-file PATH
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # pragma: no cover - exercised only without the package
    AESGCM = None  # type: ignore[assignment]

KEY_BYTES = 32
IV_BYTES = 12


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def from_b64url(text: str) -> bytes:
    text = text.strip()
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def require_aesgcm() -> None:
    if AESGCM is None:
        sys.stderr.write(
            "encrypt_inbox.py: the `cryptography` package is not installed.\n"
            "  pip install cryptography    or use bot/encrypt_inbox.mjs with Node 20+\n"
        )
        sys.exit(3)


def generate_key() -> str:
    return b64url(os.urandom(KEY_BYTES))


def read_key(args: argparse.Namespace) -> str:
    raw = args.key or (Path(args.key_file).read_text() if args.key_file else os.environ.get("INBOX_KEY"))
    if not raw:
        sys.exit("encrypt_inbox.py: provide --key-file PATH (preferred), --key BASE64URL, or INBOX_KEY")
    key = from_b64url(raw)
    if len(key) != KEY_BYTES:
        sys.exit("encrypt_inbox.py: the key is not 256 bits")
    return b64url(key)


def encrypt(plaintext: str, key_b64: str, *, seq: int, updated_at: str, compress: bool = True) -> dict:
    require_aesgcm()
    data = plaintext.encode("utf-8")
    if compress:
        compressor = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw DEFLATE, like fflate / zlib.deflateRawSync
        data = compressor.compress(data) + compressor.flush()
    iv = os.urandom(IV_BYTES)
    ct = AESGCM(from_b64url(key_b64)).encrypt(iv, data, None)
    envelope = {"v": 1, "alg": "A256GCM", "iv": b64url(iv), "ct": b64url(ct), "updatedAt": updated_at, "seq": seq}
    if compress:
        envelope["cmp"] = "deflate-raw"
    return envelope


def decrypt(envelope: dict, key_b64: str) -> str:
    require_aesgcm()
    if envelope.get("v") != 1 or envelope.get("alg") != "A256GCM":
        raise ValueError("unsupported envelope")
    plain = AESGCM(from_b64url(key_b64)).decrypt(from_b64url(envelope["iv"]), from_b64url(envelope["ct"]), None)
    if envelope.get("cmp") == "deflate-raw":
        plain = zlib.decompress(plain, -15)
    return plain.decode("utf-8")


def next_seq(seq_file: Path) -> int:
    current = 0
    if seq_file.exists():
        try:
            current = int(seq_file.read_text().strip())
        except ValueError:
            current = 0
    nxt = max(current + 1, int(time.time()) - 1_700_000_000)
    seq_file.parent.mkdir(parents=True, exist_ok=True)
    seq_file.write_text(f"{nxt}\n")
    return nxt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def add_key_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--key-file")
        p.add_argument("--key")

    p = sub.add_parser("keygen")
    p.add_argument("--key-file")
    p.add_argument("--force", action="store_true")

    p = sub.add_parser("encrypt")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out-dir", default=".")
    p.add_argument("--seq-file")
    p.add_argument("--no-compress", action="store_true")
    p.add_argument("--webhook-url")
    p.add_argument("--key-header")
    p.add_argument("--key-prefix")
    add_key_args(p)

    p = sub.add_parser("link")
    p.add_argument("--base", required=True)
    add_key_args(p)

    p = sub.add_parser("decrypt")
    p.add_argument("--in", dest="inp", required=True)
    add_key_args(p)

    args = parser.parse_args()

    if args.command == "keygen":
        key = generate_key()
        if args.key_file:
            path = Path(args.key_file)
            if path.exists() and not args.force:
                sys.exit(f"encrypt_inbox.py: {path} exists; pass --force to overwrite (the old link stops working)")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(key + "\n")
            os.chmod(path, 0o600)
            sys.stderr.write(f"wrote {path}\n")
        else:
            print(key)
        return

    if args.command == "link":
        base = args.base if args.base.endswith("/") else args.base + "/"
        print(f"{base}#k={read_key(args)}")
        return

    if args.command == "encrypt":
        key = read_key(args)
        parsed = json.loads(Path(args.inp).read_text(encoding="utf-8"))
        if not isinstance(parsed.get("threads"), list):
            sys.exit("encrypt_inbox.py: --in is not an inbox export (no \"threads\" array)")
        if args.webhook_url or args.key_header or args.key_prefix is not None:
            relay = dict(parsed.get("relay") or {})
            if args.webhook_url:
                relay["webhookUrl"] = args.webhook_url
            if args.key_header:
                relay["keyHeader"] = args.key_header
            if args.key_prefix is not None:
                relay["keyPrefix"] = args.key_prefix
            parsed["relay"] = relay
        seq_file = Path(args.seq_file) if args.seq_file else (Path(args.key_file + ".seq") if args.key_file else Path(".inbox.seq"))
        seq = next_seq(seq_file)
        updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        envelope = encrypt(json.dumps(parsed, separators=(",", ":")), key, seq=seq, updated_at=updated_at, compress=not args.no_compress)
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "inbox.enc").write_text(json.dumps(envelope, separators=(",", ":")))
        (out_dir / "inbox.meta.json").write_text(json.dumps({"seq": seq, "updatedAt": updated_at}))
        sys.stderr.write(f"wrote {out_dir / 'inbox.enc'} (seq {seq}) and inbox.meta.json\n")
        return

    if args.command == "decrypt":
        key = read_key(args)
        envelope = json.loads(Path(args.inp).read_text(encoding="utf-8"))
        sys.stdout.write(decrypt(envelope, key))
        return


if __name__ == "__main__":
    main()
