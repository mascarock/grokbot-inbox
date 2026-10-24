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
- The list of replies waiting for your bot: `localStorage` under `grokbot-inbox-outbox:<inbox>` (ids and subjects only).
- Optional webhook settings for **Send with my bot**: `localStorage` under `grokbot-inbox-webhook`, on that device only. The snapshot may prefill the URL; the key is always typed by you.

## Replies: the encrypted outbox

When you press **Send with my bot**, the reply is encrypted in your browser with the same key that opens the inbox (AES-256-GCM, bound to the purpose "outbox" so it can never be confused with a snapshot) and posted to `/api/outbox` on your own project. That function stores the ciphertext as a private file in a Vercel Blob store that your bot created on your project. Your bot fetches it on its schedule, decrypts it on its own machine, shows you a draft card, and deletes the item.

- **The server stores only ciphertext.** It cannot read a recipient, a subject, or a word.
- **The token is derived from your key.** The function checks `Authorization: Bearer <token>` where the token is an HMAC of the key, and stores only the token's SHA-256. The key itself never reaches Vercel; nothing new was created that could leak it.
- **Vercel can see timing and size.** When an item was posted, when it was picked up, how many bytes it was, and the posting IP: the usual metadata of any HTTPS request to your project. It still cannot see what was in it.
- **Nothing is sent by the server or the viewer.** Every item ends at a draft card in your bot chat that you confirm.

Details and the exact format: [RELAY.md](RELAY.md) §6.

## Rendering mail safely

- HTML is sanitized with DOMPurify and rendered in a sandboxed `iframe` with a strict CSP. Scripts never run, forms never submit.
- Remote images stay blocked until you turn them on for one message.
- Inline images (signatures) are hidden until you ask.

## Network calls the viewer makes

- `GET /inbox.enc` and `GET /inbox.meta.json` on its own origin (`cache: no-store`), every ~60 s while the tab is visible and on focus, only in snapshot mode.
- `HEAD /api/outbox` on its own origin once per session, when the snapshot meta does not already say the outbox exists.
- `POST /api/outbox` on its own origin (ciphertext only) when you press **Send with my bot** and no webhook is configured, or the webhook failed. [`api/outbox.js`](../api/outbox.js) never logs bodies.
- `POST` to your bot's webhook, or to `/api/relay` on your own project when the browser cannot reach the webhook directly, only when you press **Send with my bot** or **Refresh** with a webhook configured. [`api/relay.js`](../api/relay.js) forwards to allowlisted hosts only and never logs bodies.
- Whatever you ask for explicitly: `?src=` and **Load remote images**.

No analytics, no fonts or icons from a CDN, no third-party scripts.

## Sending

The viewer cannot send mail. All three paths (encrypted outbox item, webhook payload, or the pasted `/inbox-send v1` block) end at your bot, which shows a draft card and sends only after you confirm. See [RELAY.md](RELAY.md) and [COMMANDS.md](COMMANDS.md).
