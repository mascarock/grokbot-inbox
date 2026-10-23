# Privacy, concretely

The short version is in the README. This page lists what the viewer does with your mail, byte by byte.

## Where the mail is

| Mode | What the server sees | Where the mail lives in the browser |
| --- | --- | --- |
| **Encrypted snapshot** (`/#k=…`, the default once your bot publishes) | `GET /inbox.enc`: AES-256-GCM ciphertext, nothing else. The key is in the URL **fragment**, which browsers never send. | Decrypted in memory. The key is kept in `localStorage` on that device so the bare URL keeps working; **Forget this device** removes it. |
| **Link** (`/#data=…`, fallback) | `GET /`. The export is in the fragment. | Decoded in memory and kept in this tab's `sessionStorage` so a reload works; **Forget** clears it. The fragment is removed from the address bar with `history.replaceState`. |
| **File** (drop or Open export) | Nothing. | Memory only. |
| **`?src=`** | The URL you pass is a query string, so the host sees it and the viewer fetches it. Use it for public samples, not mail. | Memory only. |

The hosting project is yours (`grokbot-inbox-<you>.vercel.app`). There is no shared server anywhere in this project, and the repository contains only the fictional sample.

## What never leaves the browser

- Stars, archive, labels, read marks, and drafts: `localStorage` under `grokbot-inbox:state:<inbox>`.
- Webhook settings for **Send with my bot**: `localStorage` under `grokbot-inbox-webhook`, on that device only. The snapshot may prefill the URL; the key is always typed by you.

## Rendering mail safely

- HTML is sanitized with DOMPurify and rendered in a sandboxed `iframe` with a strict CSP. Scripts never run, forms never submit.
- Remote images stay blocked until you turn them on for one message.
- Inline images (signatures) are hidden until you ask.

## Network calls the viewer makes

- `GET /inbox.enc` and `GET /inbox.meta.json` on its own origin (`cache: no-store`), every ~60 s while the tab is visible and on focus, only in snapshot mode.
- `POST` to your bot's webhook, or to `/api/relay` on your own project when the browser cannot reach the webhook directly, only when you press **Send with my bot** or **Refresh** with a webhook configured. [`api/relay.js`](../api/relay.js) forwards to allowlisted hosts only and never logs bodies.
- Whatever you ask for explicitly: `?src=` and **Load remote images**.

No analytics, no fonts or icons from a CDN, no third-party scripts.

## Sending

The viewer cannot send mail. Both paths (webhook payload, or the pasted `/inbox-send v1` block) end at your bot, which shows a draft card and sends only after you confirm. See [RELAY.md](RELAY.md) and [COMMANDS.md](COMMANDS.md).
