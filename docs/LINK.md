# Viewer links

A viewer link carries a whole inbox export inside the URL fragment:

```text
https://mascarock.github.io/grokbot-inbox/#data=<payload>
```

Browsers never send the fragment (the part after `#`) to the server. GitHub Pages receives a request for `/grokbot-inbox/` and nothing else. The page decodes the payload in JavaScript, renders it, and then removes the fragment from the address bar with `history.replaceState`, so the data is not left in a bookmark, the history list, or a copied URL. The inbox is kept in memory and in `sessionStorage` for that tab only, so a reload still works. **Forget** in the banner clears it.

`tools/make_link.py` (Python 3, standard library only) and `tools/make_link.mjs` (Node) produce these links.

## Encoding

```text
payload = base64url( deflate_raw( utf8( json ) ) )
```

1. `json`: the inbox export, see [SCHEMA.md](SCHEMA.md). Compact JSON (no indentation) compresses the same but is smaller before compression.
2. `deflate_raw`: raw DEFLATE, RFC 1951, no zlib or gzip header. In Python: `zlib.compressobj(9, zlib.DEFLATED, -15)`. In Node: `zlib.deflateRawSync`. In a browser: `new CompressionStream('deflate-raw')`.
3. `base64url`: RFC 4648 §5 alphabet (`A–Z a–z 0–9 - _`), padding removed.

The decoder in `src/lib/linkCodec.ts` is more forgiving than the producer:

- It also accepts gzip (`1f 8b` magic) and zlib (RFC 1950 header) framing, so `gzip.compress` or `zlib.compress` output works too.
- It strips whitespace, so a link wrapped across lines by a chat client still decodes.
- It accepts `+` / `/` and padding.

A payload that does not inflate, or that inflates to something other than an export object with a `threads` array, is rejected with a visible error and nothing is rendered.

The query parameter `?src=<url>` still exists for a JSON hosted somewhere. Unlike the fragment, a query string *is* sent to the server, so prefer `#data=` for mail.

## Size limits

Measured with Chromium 156 (headless, Linux) against the production build, generating text-only exports and opening the link directly:

| Link length (chars) | JSON before compression | Threads / messages | Result |
| ---: | ---: | ---: | --- |
| 115,060 | 0.64 MB | 200 / 492 | Loads in 0.2 s |
| 500,932 | 2.8 MB | 850 / 2,166 | Loads in 0.6 s |
| 1,006,681 | 5.7 MB | 1,700 / 4,361 | Loads in 1.3 s |
| 1,510,104 | 8.5 MB | 2,550 / 6,544 | Loads in 1.9 s |
| 1,924,725 | 10.9 MB | 3,250 / 8,343 | Loads in 2.4 s |
| 2,103,173 | 11.9 MB | 3,550 / 9,117 | `net::ERR_ABORTED`, also when clicked from a page |
| 3,018,369 | 17.1 MB | 5,100 / 13,085 | `net::ERR_ABORTED` |

Chromium refuses any URL longer than 2 MiB (2,097,152 characters). Below that, the fragment was decoded and stripped every time, and the address bar ended at the 36-character base URL.

Practical guidance:

- `make_link.py` refuses links over **1,900,000** characters (`--max-chars`, `0` disables). That leaves room for the base URL and for chat clients that add tracking or wrapping.
- Plain-text mail compresses roughly 5–6× here, and base64 adds a third back. One million link characters is about 5 MB of JSON, which is thousands of messages.
- Firefox and Safari have their own, lower, limits for very long URLs, and chat clients differ in how long a link they will make clickable. For something that must work everywhere, keep links under about 100,000 characters.
- Inline signature images and attachment bytes as `data:` URLs dominate size when present. That is what lite mode removes.

If a link is too long, the bot sends the JSON file instead. The viewer opens it by drag-and-drop or **Open export**. The data still stays in the browser.

## Lite mode

`make_link.py --lite` keeps the schema and sets `"mode": "lite"` at the top level. It:

- removes a trailing quoted reply from `text` (`On … wrote:`, `> ` blocks, Outlook `From:` headers, `-----Original Message-----`, `Begin forwarded message:`);
- drops `html` (if a message has only HTML, it is converted to plain text first);
- drops attachments marked `inline: true` (signature images and similar);
- drops `url` from the remaining attachments, so the file list stays but the bytes do not travel.

Everything else — participants, dates, subjects, direction, file names and sizes — is unchanged. The viewer marks a lite export in the thread-list footer. Run the script without `--lite` first; switch to lite only when the full link is refused.
